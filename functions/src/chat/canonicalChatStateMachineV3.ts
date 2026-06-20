/**
 * AVALO — C5: Canonical Direct-Chat State Machine v3
 *
 * This is the production state machine for direct paid chat between fans and creators.
 * It is the ONLY authorized path for billing a fan and crediting a creator in chat.
 *
 * ── Canonical invariants enforced (§0.2, §0.3, §0.4, §0.5) ─────────────────
 *
 * §0.2  Billing atomicity: fan is charged ONLY when eligible creator response is
 *       successfully delivered. A single Firestore transaction atomically:
 *         1. Verifies reservation is ACTIVE with sufficient tokens
 *         2. Writes creator message to chats/{chatId}/messages (visible to fan)
 *         3. Debits fan's reservedTokens (already off balance since reserve)
 *         4. Credits creator's balance (full finalRateTokens, §0.3)
 *         5. Updates reservation (consumedTokens, remainingTokens, status)
 *         6. Writes billingEvents/{key} (immutable audit)
 *         7. Updates creatorEarningAccounts (pendingTokens +=)
 *         8. Writes creatorEarningLedger entry (immutable)
 *         9. Updates chats/{chatId} state
 *
 *       Fan messages NEVER billable. Not-billable list:
 *         - Fan messages
 *         - Free messages (within free allowance)
 *         - Emoji/reaction-only responses (content.reactionOnly === true)
 *         - System/moderation events (content.type in NOT_BILLABLE_TYPES)
 *         - AI Coach suggestions
 *         - Messages with delivery failure
 *         - Deleted-before-delivery messages
 *         - Failed uploads
 *         - Retry duplicates (idempotency key already used)
 *         - Locked continuation replies before session unlocks
 *
 * §0.3  BASE_CREATOR_RESPONSE_RATE_TOKENS = 3
 *       finalRateTokens = 3 × multiplier
 *       payerTokensCharged = finalRateTokens
 *       creatorEarningTokens = finalRateTokens  (no per-delivery token split)
 *
 * §0.4  Session entry reservation = max(100, finalRateTokens, creatorConfiguredMinimum)
 *       Entry is a HOLD, not an immediate burn.
 *       All remaining reserved tokens return automatically on close/expire/exhaustion.
 *
 * §0.5  Budget exhaustion fires when remainingReservedTokens < finalRateTokens.
 *       NOT when remainingReservedTokens === 0.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  reserveTokens,
  releaseReservation,
  computeReservationAmount,
  MIN_SESSION_ENTRY_TOKENS,
} from '../wallet/walletService';
import {
  EarningEventType,
  BASE_CREATOR_RESPONSE_RATE_TOKENS,
  TOKEN_PAYOUT_USD_GROSS,
  EARNING_HOLD_DAYS,
} from '../creator/canonicalEarningService';
import {
  RESERVATIONS_COLLECTION,
  ChatReservation,
  ReservationStatus,
} from '../wallet/types';
import { WalletDocument } from '../wallet/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** BASE rate per creator response (§0.3). finalRateTokens = BASE × multiplier. */
export { BASE_CREATOR_RESPONSE_RATE_TOKENS };

/** Standard free message allowance per user per chat (inherited from V9 canonical). */
export const FREE_MESSAGES_PER_USER = 4;

/** Valid multipliers for C5 (C6 adds tiers x2→x100). */
export const ALLOWED_MULTIPLIERS_V3 = [1, 2, 3, 4, 5, 7, 10] as const;
export type AllowedMultiplierV3 = typeof ALLOWED_MULTIPLIERS_V3[number];

/** Chat inactivity expiry — 48 hours. */
export const CHAT_INACTIVITY_EXPIRY_MS   = 48 * 60 * 60 * 1000;
export const CHAT_INACTIVITY_EXPIRY_HOURS = 48;

// ─────────────────────────────────────────────────────────────────────────────
// C5 State Machine — 10 states
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete set of canonical direct-chat states.
 *
 * State flow (happy path):
 *   AWAITING_EARNER_ACCEPT → FREE_ACTIVE → PAID_ENTRY_PENDING
 *     → PAID_ACTIVE → BUDGET_EXHAUSTED (auto) or END_PROPOSED → CLOSED
 *
 * Side transitions:
 *   AWAITING_EARNER_ACCEPT → CLOSED (creator declines)
 *   FREE_ACTIVE → CLOSED (either party closes during free window)
 *   PAID_ACTIVE → LOCKED_CONTINUATION (fan left session, can re-enter)
 *   PAID_ACTIVE → RATE_PROPOSED (creator requests rate change)
 *   BUDGET_EXHAUSTED → CLOSED (after returning unused reservation)
 *   Any state → EXPIRED (48h inactivity)
 *   Any state → MODERATED (content moderation action)
 */
export type C5ChatState =
  | 'AWAITING_EARNER_ACCEPT'   // creator must accept/decline
  | 'FREE_ACTIVE'              // free window, fan free counter ticking
  | 'PAID_ENTRY_PENDING'       // fan must reserve tokens to enter paid session
  | 'PAID_ACTIVE'              // paid session running; reservation active
  | 'BUDGET_EXHAUSTED'         // remainingReservedTokens < finalRateTokens; session closing
  | 'LOCKED_CONTINUATION'      // session paused; fan can re-enter by topping up
  | 'RATE_PROPOSED'            // creator has proposed a rate change; awaiting fan consent
  | 'END_PROPOSED'             // one party has proposed session end; awaiting confirmation
  | 'CLOSED'                   // session ended; all unused tokens returned
  | 'EXPIRED'                  // 48h inactivity; all unused tokens returned
  | 'MODERATED';               // admin/moderation action; all unused tokens returned

/** States that can receive paid creator messages. */
export const BILLABLE_STATES: C5ChatState[] = ['PAID_ACTIVE'];

/** States that allow any message at all. */
export const MESSAGEABLE_STATES: C5ChatState[] = [
  'FREE_ACTIVE', 'PAID_ACTIVE', 'RATE_PROPOSED', 'END_PROPOSED',
];

/** Terminal states (no further state transitions possible). */
export const TERMINAL_STATES: C5ChatState[] = ['CLOSED', 'EXPIRED', 'MODERATED'];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MessageContentType =
  | 'TEXT'
  | 'EMOJI_REACTION'     // NOT billable
  | 'SYSTEM_EVENT'       // NOT billable
  | 'MODERATION_EVENT'   // NOT billable
  | 'AI_COACH'           // NOT billable
  | 'STICKER'
  | 'VOICE_NOTE'
  | 'IMAGE'
  | 'VIDEO';

/** Types that are NEVER billable regardless of sender role. */
export const NOT_BILLABLE_CONTENT_TYPES = new Set<MessageContentType>([
  'EMOJI_REACTION',
  'SYSTEM_EVENT',
  'MODERATION_EVENT',
  'AI_COACH',
]);

export interface ChatMessageContent {
  type: MessageContentType;
  text?: string;
  mediaUrl?: string;
  mediaStoragePath?: string;
  reactionEmoji?: string;
  /** True if the message body is only emoji characters (auto-classified). */
  reactionOnly?: boolean;
  /** System event detail (for SYSTEM_EVENT / MODERATION_EVENT types). */
  eventDetail?: string;
}

export interface C5ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderRole: 'FAN' | 'CREATOR' | 'SYSTEM';
  content: ChatMessageContent;
  /** Whether this message was charged to the fan. */
  billed: boolean;
  /** Tokens charged for this message (0 if free). */
  tokensCharged: number;
  /** Idempotency key (prevents retry duplicates from billing twice). */
  idempotencyKey: string;
  createdAt: Timestamp | FieldValue;
  /** Set to true if message was deleted before delivery was confirmed. */
  deletedBeforeDelivery?: boolean;
}

export interface C5SessionConfig {
  /** Rate per creator response in tokens (3 × multiplier). */
  finalRateTokens: number;
  /** Multiplier applied. */
  multiplier: number;
  /** Creator-configured minimum session entry (may be 0 = default). */
  creatorConfiguredMinimum: number;
  /** Actual reservation amount used (result of computeReservationAmount). */
  reservationAmount: number;
}

export interface C5ChatDocument {
  chatId: string;
  state: C5ChatState;
  fanId: string;
  creatorId: string;
  /** V3: active reservation ID for the current paid session. */
  activeReservationId: string | null;
  /** V3: tokens remaining in current reservation (mirrors reservation doc). */
  remainingReservedTokens: number;
  /** V3: count of paid creator responses in current session. */
  paidResponseCount: number;
  /** Active session config snapshot (set when entering PAID_ACTIVE). */
  sessionConfig: C5SessionConfig | null;
  /** Free message counters per user. */
  freeMessagesRemaining: Record<string, number>;
  /** Timestamp of last message (for inactivity expiry). */
  lastMessageAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface DeliveryResult {
  messageId: string;
  billed: boolean;
  tokensCharged: number;
  remainingReservedTokens: number;
  budgetExhausted: boolean;
  billingEventId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing predicate (§0.2 not-billable list)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a creator message is eligible for billing.
 *
 * A message is NOT billable if:
 *  - Sender is the fan (NEVER billable per §0.2)
 *  - Content type is in NOT_BILLABLE_CONTENT_TYPES (reactions, system, AI coach)
 *  - content.reactionOnly === true (emoji-only response)
 *  - Chat state is not PAID_ACTIVE (free window, locked, etc.)
 */
export function isBillableCreatorMessage(params: {
  senderRole: 'FAN' | 'CREATOR' | 'SYSTEM';
  content: ChatMessageContent;
  chatState: C5ChatState;
}): boolean {
  const { senderRole, content, chatState } = params;

  // Fan messages NEVER billable (§0.2)
  if (senderRole !== 'CREATOR') return false;

  // Only PAID_ACTIVE state allows billing
  if (!BILLABLE_STATES.includes(chatState)) return false;

  // Not-billable content types
  if (NOT_BILLABLE_CONTENT_TYPES.has(content.type)) return false;

  // Emoji-only reaction (auto-classified)
  if (content.reactionOnly === true) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: deliverPaidResponse — THE atomic billing transaction
// ─────────────────────────────────────────────────────────────────────────────

const db = getFirestore();

const CREATOR_EARNING_ACCOUNTS = 'creatorEarningAccounts';
const CREATOR_EARNING_LEDGER   = 'creatorEarningLedger';
const BILLING_EVENTS           = 'billingEvents';
const WALLETS_COLLECTION       = 'wallets';
const LEDGER_COLLECTION        = 'ledger';

function holdReleaseDate(): Timestamp {
  return Timestamp.fromMillis(Date.now() + EARNING_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * C5: Atomic paid-response delivery.
 *
 * This is THE only function that charges a fan and credits a creator in chat.
 * Everything happens in a single Firestore transaction per §0.2.
 *
 * Pre-conditions (caller must verify before calling):
 *   - Chat is in PAID_ACTIVE state
 *   - Sender is the creator
 *   - Message content is billable (isBillableCreatorMessage() === true)
 *   - requireVerifiedAdult() already called for both participants (C2)
 *
 * @throws HttpsError if reservation is invalid or budget exhausted
 */
export async function deliverPaidResponse(params: {
  chatId: string;
  fanId: string;
  creatorId: string;
  reservationId: string;
  finalRateTokens: number;
  multiplier: number;
  messageId: string;
  content: ChatMessageContent;
  idempotencyKey: string;   // unique per response; e.g. `${chatId}_${messageId}`
}): Promise<DeliveryResult> {
  const {
    chatId, fanId, creatorId, reservationId,
    finalRateTokens, multiplier, messageId, content, idempotencyKey,
  } = params;

  if (!Number.isInteger(finalRateTokens) || finalRateTokens <= 0) {
    throw new HttpsError('invalid-argument', 'finalRateTokens must be a positive integer');
  }

  return db.runTransaction(async (txn) => {

    // ── 1. Idempotency guard ─────────────────────────────────────────────────
    // Use billingEvents/{idempotencyKey} as the sentinel.
    const billingEventRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existingEvent   = await txn.get(billingEventRef);
    if (existingEvent.exists) {
      // Already delivered — return cached result
      const ev = existingEvent.data() as any;
      return {
        messageId,
        billed: true,
        tokensCharged: ev.payerTokensCharged ?? finalRateTokens,
        remainingReservedTokens: 0,   // unknown at this point; caller re-reads chat
        budgetExhausted: false,
        billingEventId: idempotencyKey,
      };
    }

    // ── 2. Read and validate reservation ────────────────────────────────────
    const resRef  = db.collection(RESERVATIONS_COLLECTION).doc(reservationId);
    const resSnap = await txn.get(resRef);

    if (!resSnap.exists) {
      throw new HttpsError('failed-precondition',
        `RESERVATION_NOT_FOUND: ${reservationId}`);
    }
    const res = resSnap.data() as ChatReservation;

    if (res.status !== 'ACTIVE') {
      throw new HttpsError('failed-precondition',
        `RESERVATION_NOT_ACTIVE: status=${res.status}`);
    }
    if (res.remainingTokens < finalRateTokens) {
      throw new HttpsError('failed-precondition',
        `BUDGET_EXHAUSTED: remaining=${res.remainingTokens} < rate=${finalRateTokens}`);
    }
    if (res.finalRateTokens !== finalRateTokens) {
      throw new HttpsError('failed-precondition',
        `RATE_MISMATCH: reservation rate=${res.finalRateTokens}, caller=${finalRateTokens}`);
    }

    // ── 3. Update fan wallet: decrement reservedTokens ───────────────────────
    // (balance was already decremented at reservation time — only reservedTokens changes)
    const fanWalletRef  = db.collection(WALLETS_COLLECTION).doc(fanId);
    const fanWalletSnap = await txn.get(fanWalletRef);
    const fanWallet     = fanWalletSnap.exists
      ? (fanWalletSnap.data() as WalletDocument)
      : null;
    const fanReservedBefore = fanWallet?.reservedTokens ?? 0;
    const fanReservedAfter  = Math.max(0, fanReservedBefore - finalRateTokens);
    txn.update(fanWalletRef, {
      reservedTokens: fanReservedAfter,
      spent:          FieldValue.increment(finalRateTokens),
      updatedAt:      FieldValue.serverTimestamp(),
    });

    // ── 4. Credit creator wallet (§0.3: full finalRateTokens; Avalo at payout) ─
    const creatorWalletRef  = db.collection(WALLETS_COLLECTION).doc(creatorId);
    const creatorWalletSnap = await txn.get(creatorWalletRef);
    const creatorBalance    = creatorWalletSnap.exists
      ? (creatorWalletSnap.data() as WalletDocument).balance
      : 0;
    const creatorBalanceAfter = creatorBalance + finalRateTokens;

    if (creatorWalletSnap.exists) {
      txn.update(creatorWalletRef, {
        balance:   creatorBalanceAfter,
        earned:    FieldValue.increment(finalRateTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      txn.set(creatorWalletRef, {
        userId:          creatorId,
        balance:         creatorBalanceAfter,
        pending:         0,
        earned:          finalRateTokens,
        spent:           0,
        frozen:          0,
        reservedTokens:  0,
        createdAt:       FieldValue.serverTimestamp(),
        updatedAt:       FieldValue.serverTimestamp(),
      });
    }

    // ── 5. Update reservation ────────────────────────────────────────────────
    const newConsumed   = res.consumedTokens + finalRateTokens;
    const newRemaining  = res.remainingTokens - finalRateTokens;
    const budgetExhausted = newRemaining < finalRateTokens;
    const newResStatus: ReservationStatus = budgetExhausted ? 'EXHAUSTED' : 'ACTIVE';

    const resUpdate: Record<string, unknown> = {
      consumedTokens:  newConsumed,
      remainingTokens: newRemaining,
      status:          newResStatus,
      updatedAt:       FieldValue.serverTimestamp(),
    };
    if (budgetExhausted) resUpdate.closedAt = FieldValue.serverTimestamp();
    txn.update(resRef, resUpdate);

    // ── 6. Write immutable billing event (payer audit) ───────────────────────
    txn.set(billingEventRef, {
      eventId:              idempotencyKey,
      payerId:              fanId,
      creatorId,
      type:                 'DIRECT_CHAT_RESPONSE' as EarningEventType,
      payerTokensCharged:   finalRateTokens,   // §0.3
      creatorEarningTokens: finalRateTokens,   // §0.3: same — no per-delivery token split
      chatId,
      sessionId:            reservationId,
      messageId,
      reservationId,
      multiplier,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    // ── 7. Update creator earning account ────────────────────────────────────
    const earningAccountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const earningAccountSnap = await txn.get(earningAccountRef);
    if (!earningAccountSnap.exists) {
      txn.set(earningAccountRef, {
        creatorId,
        pendingTokens:        finalRateTokens,
        availableTokens:      0,
        inPayoutTokens:       0,
        lifetimeEarnedTokens: finalRateTokens,
        lifetimePayoutTokens: 0,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      });
    } else {
      txn.update(earningAccountRef, {
        pendingTokens:        FieldValue.increment(finalRateTokens),
        lifetimeEarnedTokens: FieldValue.increment(finalRateTokens),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // ── 8. Write immutable creator earning ledger entry ──────────────────────
    const ledgerEntryId  = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    txn.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId:       ledgerEntryId,
      creatorId,
      payerId:       fanId,
      type:          'DIRECT_CHAT_RESPONSE' as EarningEventType,
      tokenAmount:   finalRateTokens,
      grossUsd:      Math.round(finalRateTokens * TOKEN_PAYOUT_USD_GROSS * 1_000_000) / 1_000_000,
      chatId,
      sessionId:     reservationId,
      messageId,
      idempotencyKey,
      holdsUntil:    holdReleaseDate(),
      createdAt:     FieldValue.serverTimestamp(),
    });

    // ── 9. Write creator message to chat (visible to fan) ───────────────────
    // This is the moment of "delivery" per §0.2.
    const messageRef = db
      .collection('chats').doc(chatId)
      .collection('messages').doc(messageId);
    txn.set(messageRef, {
      messageId,
      chatId,
      senderId:     creatorId,
      senderRole:   'CREATOR',
      content,
      billed:       true,
      tokensCharged: finalRateTokens,
      idempotencyKey,
      createdAt:    FieldValue.serverTimestamp(),
    } as C5ChatMessage);

    // ── 10. Update chat document state ───────────────────────────────────────
    const chatUpdate: Record<string, unknown> = {
      remainingReservedTokens: newRemaining,
      paidResponseCount:       FieldValue.increment(1),
      lastMessageAt:           FieldValue.serverTimestamp(),
      updatedAt:               FieldValue.serverTimestamp(),
    };
    if (budgetExhausted) {
      chatUpdate.state = 'BUDGET_EXHAUSTED' as C5ChatState;
    }
    txn.update(db.collection('chats').doc(chatId), chatUpdate);

    return {
      messageId,
      billed: true,
      tokensCharged: finalRateTokens,
      remainingReservedTokens: newRemaining,
      budgetExhausted,
      billingEventId: idempotencyKey,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Free message delivery (not billed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliver a free (non-billed) message to a chat.
 * Updates free counter for the sender, writes the message doc.
 * Does NOT touch wallets or earning accounts.
 *
 * For both fan and creator messages during the free window,
 * and for any non-billable message (reactions, system events, etc.).
 */
export async function deliverFreeMessage(params: {
  chatId: string;
  senderId: string;
  senderRole: 'FAN' | 'CREATOR' | 'SYSTEM';
  content: ChatMessageContent;
  messageId: string;
  idempotencyKey: string;
  decrementFreeCounter: boolean;   // false for system/reaction messages
}): Promise<{ messageId: string }> {
  const { chatId, senderId, senderRole, content, messageId, idempotencyKey, decrementFreeCounter } = params;

  await db.runTransaction(async (txn) => {
    // Idempotency via message doc
    const msgRef  = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
    const existing = await txn.get(msgRef);
    if (existing.exists) return;

    // Write message
    txn.set(msgRef, {
      messageId, chatId, senderId, senderRole, content,
      billed: false, tokensCharged: 0, idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    } as C5ChatMessage);

    // Decrement free counter for sender if applicable
    if (decrementFreeCounter) {
      const chatRef = db.collection('chats').doc(chatId);
      txn.update(chatRef, {
        [`freeMessagesRemaining.${senderId}`]: FieldValue.increment(-1),
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      });
    } else {
      const chatRef = db.collection('chats').doc(chatId);
      txn.update(chatRef, {
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      });
    }
  });

  return { messageId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle: open / close
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a paid session for a fan→creator chat.
 *
 * 1. Verifies both users are verified adults (caller must have called requireVerifiedAdult).
 * 2. Computes reservation amount (§0.4).
 * 3. Calls reserveTokens() from walletService (C3).
 * 4. Transitions chat to PAID_ACTIVE.
 */
export async function openPaidSession(params: {
  chatId: string;
  fanId: string;
  creatorId: string;
  multiplier: number;
  creatorConfiguredMinimum?: number;
}): Promise<{
  reservationId: string;
  reservationAmount: number;
  finalRateTokens: number;
}> {
  const { chatId, fanId, creatorId, multiplier, creatorConfiguredMinimum = 0 } = params;

  // Validate multiplier
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    throw new HttpsError('invalid-argument', 'multiplier must be a positive integer');
  }

  const finalRateTokens    = BASE_CREATOR_RESPONSE_RATE_TOKENS * multiplier;
  const reservationAmount  = computeReservationAmount(finalRateTokens, creatorConfiguredMinimum);
  const reservationId      = `${chatId}_session_${Date.now()}`;

  const sessionConfig: C5SessionConfig = {
    finalRateTokens,
    multiplier,
    creatorConfiguredMinimum,
    reservationAmount,
  };

  // Reserve tokens (C3) — throws if balance insufficient
  await reserveTokens({
    userId: fanId,
    chatId,
    reservationId,
    reservationAmount,
    finalRateTokens,
    creatorConfiguredMinimum,
  });

  // Transition chat to PAID_ACTIVE
  await db.collection('chats').doc(chatId).update({
    state:                   'PAID_ACTIVE' as C5ChatState,
    activeReservationId:     reservationId,
    remainingReservedTokens: reservationAmount,
    paidResponseCount:       0,
    sessionConfig,
    updatedAt:               FieldValue.serverTimestamp(),
  });

  return { reservationId, reservationAmount, finalRateTokens };
}

/**
 * Close a paid session and return all unconsumed tokens to the fan.
 *
 * Called when:
 *  - Either party sends END_PROPOSED and it's accepted
 *  - BUDGET_EXHAUSTED → cleanup
 *  - 48h inactivity (C7 scheduler)
 *  - Moderation action
 */
export async function closePaidSession(params: {
  chatId: string;
  fanId: string;
  reservationId: string;
  finalState: 'CLOSED' | 'EXPIRED' | 'MODERATED' | 'BUDGET_EXHAUSTED';
  idempotencyKey: string;
}): Promise<{ tokensReturned: number }> {
  const { chatId, fanId, reservationId, finalState, idempotencyKey } = params;

  // Release reservation (C3) — returns remaining tokens to fan balance
  const releaseStatus = finalState === 'EXPIRED' ? 'EXPIRED' : 'RELEASED';
  const { tokensReturned } = await releaseReservation({
    userId: fanId,
    chatId,
    reservationId,
    finalStatus: releaseStatus,
    idempotencyKey,
  });

  // Transition chat to terminal state
  await db.collection('chats').doc(chatId).update({
    state:                   finalState as C5ChatState,
    activeReservationId:     null,
    remainingReservedTokens: 0,
    updatedAt:               FieldValue.serverTimestamp(),
  });

  return { tokensReturned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute final rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the token charge for one creator response given a multiplier.
 * §0.3: finalChargedTokens = BASE_CREATOR_RESPONSE_RATE_TOKENS × multiplier
 */
export function computeFinalRateTokens(multiplier: number): number {
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    throw new Error('multiplier must be a positive integer');
  }
  return BASE_CREATOR_RESPONSE_RATE_TOKENS * multiplier;
}
