import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * CANONICAL CHAT ENGINE — v2_canonical
 *
 * THE ONE AND ONLY chat monetization engine for Avalo.
 *
 * This module consolidates ALL previous chat billing paths into a single,
 * deterministic, testable engine. All API endpoints MUST call this engine.
 *
 * REPLACES:
 * - chats.ts billing (payer-sender billing)
 * - chatMonetization.ts shimProcessMessageBilling
 * - pack273ChatEngine (pack273_chats path)
 * - pack328b timeout divergence (48h/72h → canonical 48h)
 * - pack242 deposit modifiers (REMOVED — use earner config)
 * - pack452 mid-chat premium offers (REMOVED — next session only)
 *
 * @module canonical-chat-engine
 * @version 2.0.0
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  CanonicalChatDocument,
  CanonicalChatState,
  CanonicalChatRoles,
  CanonicalFreeState,
  CanonicalPaidSession,
  CanonicalSessionConfig,
  CanonicalBillingState,
  ChatParticipantContext,
  EarnerChatConfig,
  BillingResult,
  DepositResult,
  RefundResult,
  BurnMultiplier,
} from './types/canonical-chat.types';
import {
  CANONICAL_LOGIC_VERSION,
  FREE_MESSAGES_STANDARD,
  FREE_MESSAGES_ROYAL_EARNER,
  BASE_MESSAGE_PRICE_TOKENS,
  REOPEN_COST_TOKENS,
  REOPEN_FREE_MESSAGES,
  MIN_DEPOSIT_TOKENS,
  DEFAULT_DEPOSIT_TOKENS,
  INACTIVITY_EXPIRY_MS,
  BURN_MULTIPLIER_ENUM,
} from './types/canonical-chat.types';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

class ChatEngineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ChatEngineError';
  }
}

const logger = {
  info: (...args: any[]) => { console.log('[CanonicalChatEngine]', ...args); },
  warn: (...args: any[]) => { console.warn('[CanonicalChatEngine]', ...args); },
  error: (...args: any[]) => { console.error('[CanonicalChatEngine]', ...args); },
};

// ============================================================================
// A) ROLE DETERMINATION
// ============================================================================

/**
 * Determine payer/earner roles for a new chat.
 *
 * Priority order:
 * 1. Influencer override: influencer earns regardless of gender when flagged + earn_on=ON
 * 2. Heterosexual rule: male always pays, female always earns
 * 3. earnOnChat ON: receiver earns
 * 4. Default: initiator pays, Avalo earns (earnerId = null)
 *
 * @param initiator - The user who initiated the chat
 * @param receiver - The user who received the chat request
 * @returns Canonical role assignment
 */
export function determineRoles(
  initiator: ChatParticipantContext,
  receiver: ChatParticipantContext
): CanonicalChatRoles {
  // Rule 1: Influencer override
  // If either user has influencer badge + earn_on=ON, they earn regardless of gender.
  if (receiver.influencerBadge && receiver.earnOnChat) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
    };
  }
  if (initiator.influencerBadge && initiator.earnOnChat) {
    return {
      payerId: receiver.userId,
      earnerId: initiator.userId,
    };
  }

  // Rule 2: Heterosexual rule — male always pays
  const genderPair = [initiator.gender, receiver.gender].sort().join('_');
  const isHetero =
    (initiator.gender === 'male' && receiver.gender === 'female') ||
    (initiator.gender === 'female' && receiver.gender === 'male');

  if (isHetero) {
    const maleId = initiator.gender === 'male' ? initiator.userId : receiver.userId;
    const femaleId = initiator.gender === 'female' ? initiator.userId : receiver.userId;
    return {
      payerId: maleId,
      earnerId: femaleId,
    };
  }

  // Rule 3: Same gender / NB — initiator pays, receiver earns if earn mode ON
  if (receiver.earnOnChat) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
    };
  }

  // Rule 4: Default — initiator pays, Avalo earns
  return {
    payerId: initiator.userId,
    earnerId: null,
  };
}

// ============================================================================
// B) CHAT CREATION + ACCEPTANCE FLOW
// ============================================================================

/**
 * Create a new chat after match.
 * State: MATCHED → AWAITING_EARNER_ACCEPT
 *
 * @param chatId - Pre-generated chat ID
 * @param initiator - Initiator context
 * @param receiver - Receiver context
 * @returns The created chat document (in-memory representation)
 */
export async function createChat(
  chatId: string,
  initiator: ChatParticipantContext,
  receiver: ChatParticipantContext
): Promise<CanonicalChatDocument> {
  const roles = determineRoles(initiator, receiver);

  const chatDoc: CanonicalChatDocument = {
    chatId,
    participants: [initiator.userId, receiver.userId],
    roles,
    logicVersion: CANONICAL_LOGIC_VERSION,
    state: 'AWAITING_EARNER_ACCEPT',
    free: {
      freeRemainingByUser: {},
    },
    paidSession: null,
    lastMessageAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await db.collection('chats').doc(chatId).set(chatDoc);

  logger.info(`Chat created: ${chatId}, payer=${roles.payerId}, earner=${roles.earnerId}`);
  return chatDoc;
}

/**
 * Earner accepts the chat.
 * Transition: AWAITING_EARNER_ACCEPT → FREE_ACTIVE
 *
 * Initializes free counters:
 * - Standard: 9 per user
 * - If earner has Royal: 5 per user
 *
 * @param chatId - The chat to accept
 * @param userId - The user accepting (must be the earner)
 * @param earnerIsRoyal - Whether the earner has Royal status
 */
export async function acceptChat(
  chatId: string,
  userId: string,
  earnerIsRoyal: boolean
): Promise<void> {
  const chatRef = db.collection('chats').doc(chatId);

  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.logicVersion !== CANONICAL_LOGIC_VERSION) {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not v2_canonical`);
    }

    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in AWAITING_EARNER_ACCEPT state (current: ${chat.state})`);
    }

    // Only earner can accept
    if (chat.roles.earnerId !== userId) {
      // If earnerId is null (Avalo earns), the receiver is treated as earner for acceptance
      const isReceiver = chat.participants[1] === userId;
      if (!isReceiver) {
        throw new ChatEngineError('permission-denied', `User ${userId} is not the earner/receiver of chat ${chatId}`);
      }
    }

    const freeLimit = earnerIsRoyal ? FREE_MESSAGES_ROYAL_EARNER : FREE_MESSAGES_STANDARD;

    const freeRemainingByUser: Record<string, number> = {};
    for (const participantId of chat.participants) {
      freeRemainingByUser[participantId] = freeLimit;
    }

    transaction.update(chatRef, {
      state: 'FREE_ACTIVE' as CanonicalChatState,
      'free.freeRemainingByUser': freeRemainingByUser,
      updatedAt: serverTimestamp(),
    });
  });

  logger.info(`Chat accepted: ${chatId} by ${userId} (royal=${earnerIsRoyal})`);
}

/**
 * Earner declines the chat.
 * Transition: AWAITING_EARNER_ACCEPT → CLOSED
 *
 * @param chatId - The chat to decline
 * @param userId - The user declining (must be the earner/receiver)
 */
export async function declineChat(
  chatId: string,
  userId: string
): Promise<void> {
  const chatRef = db.collection('chats').doc(chatId);

  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in AWAITING_EARNER_ACCEPT state`);
    }

    // Only earner/receiver can decline
    if (chat.roles.earnerId !== userId && chat.participants[1] !== userId) {
      throw new ChatEngineError('permission-denied', `User ${userId} cannot decline chat ${chatId}`);
    }

    transaction.update(chatRef, {
      state: 'CLOSED' as CanonicalChatState,
      closedReason: 'earner_declined',
      closedBy: userId,
      updatedAt: serverTimestamp(),
    });
  });

  logger.info(`Chat declined: ${chatId} by ${userId}`);
}

// ============================================================================
// C) FREE → PAID GATE
// ============================================================================

/**
 * V9: Decrement free message counter for the sender.
 *
 * - FREE_ACTIVE: decrement sender's counter; if earner's counter hits 0 → PAID_ACTIVE
 * - PAID_ACTIVE: free counter not relevant, return 'paid'
 * - LOCKED: payer balance insufficient, return 'locked'
 *
 * Only the EARNER's free counter gates transition to PAID_ACTIVE.
 * Payer messages are always allowed (free). Earner messages are billed once earner's free = 0.
 *
 * @param chatId - The chat ID
 * @param senderId - The user sending a message
 * @param chatDoc - Optional pre-fetched chat document (avoids extra read)
 * @returns 'allowed' (free), 'paid' (charge 3T), 'locked' (payer insufficient), 'blocked' (bad state)
 */
export async function decrementFreeCounter(
  chatId: string,
  senderId: string,
  chatDoc?: CanonicalChatDocument
): Promise<'allowed' | 'paid' | 'locked' | 'blocked'> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    let chat: CanonicalChatDocument;
    if (chatDoc) {
      chat = chatDoc;
    } else {
      const chatSnap = await transaction.get(chatRef);
      if (!chatSnap.exists) {
        throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
      }
      chat = chatSnap.data() as CanonicalChatDocument;
    }

    if (chat.state === 'LOCKED') {
      return 'locked';
    }
    if (chat.state === 'PAID_ACTIVE') {
      return 'paid';
    }
    if (chat.state !== 'FREE_ACTIVE') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} state '${chat.state}' does not allow messaging`);
    }

    const remaining = chat.free.freeRemainingByUser[senderId] ?? 0;

    if (remaining <= 0) {
      // Sender's free exhausted — if this is the earner, billing applies
      const isEarner = senderId === chat.roles.earnerId;
      if (isEarner) {
        // Earner's free is gone → this message will be billed. Transition to PAID_ACTIVE if needed.
        if (chat.state === 'FREE_ACTIVE') {
          transaction.update(chatRef, {
            state: 'PAID_ACTIVE' as CanonicalChatState,
            paidSession: {
              sessionId: generateId(),
              sessionVersion: 1,
              configSnapshot: { depositTokens: 0, burnMultiplier: 1 },
              startedAt: Timestamp.now(),
              billingState: {
                totalMessagesCharged: 0,
                totalTokensConsumed: 0,
                totalEarnerCredited: 0,
                totalAvaloCredited: 0,
              },
            },
            updatedAt: serverTimestamp(),
          });
        }
        return 'paid';
      }
      // Payer free exhausted — payer messages are always free regardless
      transaction.update(chatRef, {
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return 'allowed';
    }

    // Sender has free messages remaining — decrement
    const newRemaining = remaining - 1;
    transaction.update(chatRef, {
      [`free.freeRemainingByUser.${senderId}`]: newRemaining,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Check if earner just exhausted their free messages after this decrement
    const isEarner = senderId === chat.roles.earnerId;
    if (isEarner && newRemaining <= 0 && chat.state === 'FREE_ACTIVE') {
      // Earner used last free message — next earner message will be billed
      // Transition to PAID_ACTIVE now so subsequent messages bill correctly
      transaction.update(chatRef, {
        state: 'PAID_ACTIVE' as CanonicalChatState,
        paidSession: {
          sessionId: generateId(),
          sessionVersion: 1,
          configSnapshot: { depositTokens: 0, burnMultiplier: 1 },
          startedAt: Timestamp.now(),
          billingState: {
            totalMessagesCharged: 0,
            totalTokensConsumed: 0,
            totalEarnerCredited: 0,
            totalAvaloCredited: 0,
          },
        },
      });
    }

    return 'allowed';
  });
}

// ============================================================================
// D) V9 PAID PHASE ACTIVATION (replaces deposit model)
// ============================================================================

/**
 * @deprecated V9 — deposit model removed. No-op stub kept for call-site compat.
 * V9: chat auto-transitions to PAID_ACTIVE when earner exhausts free messages.
 * Call reopenChat() to unlock a LOCKED chat.
 */
export async function processDeposit(
  chatId: string,
  payerId: string,
  earnerConfig: EarnerChatConfig | null,
  earnerIsRoyal: boolean
): Promise<DepositResult> {
  // V9: No deposit model. Chat auto-activates when earner free messages exhausted.
  // This stub exists only for call-site compatibility during migration.
  logger.warn(`processDeposit called for chat=${chatId} — V9 has no deposit model. Use reopenChat() for LOCKED chats.`);
  const stubSession: CanonicalPaidSession = {
    sessionId: generateId(),
    sessionVersion: 1,
    configSnapshot: { depositTokens: 0, burnMultiplier: 1 },
    startedAt: Timestamp.now(),
    billingState: {
      totalMessagesCharged: 0,
      totalTokensConsumed: 0,
      totalEarnerCredited: 0,
      totalAvaloCredited: 0,
    },
  };
  return { success: false, session: stubSession, platformFee: 0, escrow: 0, depositTokens: 0 };
}

/**
 * V9: Reopen a LOCKED chat.
 * Payer must have >= REOPEN_COST_TOKENS in their wallet.
 * Grants REOPEN_FREE_MESSAGES extra free sends to payer.
 * Transition: LOCKED → PAID_ACTIVE
 *
 * @param chatId - The chat ID
 * @param payerId - Must be the payer
 */
export async function reopenChat(
  chatId: string,
  payerId: string
): Promise<void> {
  const chatRef = db.collection('chats').doc(chatId);

  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }
    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'LOCKED') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not LOCKED (current: ${chat.state})`);
    }
    if (chat.roles.payerId !== payerId) {
      throw new ChatEngineError('permission-denied', `User ${payerId} is not the payer`);
    }

    const payerWalletRef = db.collection('user_wallets').doc(payerId);
    const payerSnap = await transaction.get(payerWalletRef);
    const payerBalance = payerSnap.data()?.balance || 0;

    if (payerBalance < REOPEN_COST_TOKENS) {
      throw new ChatEngineError('failed-precondition', `Payer balance ${payerBalance} < reopen cost ${REOPEN_COST_TOKENS}`);
    }

    // Grant extra free messages to payer on reopen
    const updatedFree = {
      ...chat.free.freeRemainingByUser,
      [payerId]: (chat.free.freeRemainingByUser[payerId] || 0) + REOPEN_FREE_MESSAGES,
    };

    transaction.update(chatRef, {
      state: 'PAID_ACTIVE' as CanonicalChatState,
      'free.freeRemainingByUser': updatedFree,
      updatedAt: serverTimestamp(),
    });

    logger.info(`Chat reopened: chat=${chatId}, payer=${payerId}`);
  });
}

// ============================================================================
// E) V9 FLAT BILLING ENGINE
// ============================================================================

/**
 * V9: Calculate flat billing for a single earner message.
 *
 * RULES:
 * - Cost = BASE_MESSAGE_PRICE_TOKENS (3) × burnMultiplier
 * - 100% of cost credited to earner wallet
 * - Platform earns via payout commission (20%), not per-message
 * - No word counting. No escrow. No splits.
 *
 * @param currentState - Current billing state
 * @param config - Session config (burnMultiplier only)
 * @param earnerId - Earner user ID (null = Avalo earns; tokens go to platform wallet)
 * @param payerBalance - Current payer wallet balance
 * @returns BillingResult
 */
export function calculateBilling(
  currentState: CanonicalBillingState,
  config: CanonicalSessionConfig,
  earnerId: string | null,
  payerBalance: number
): BillingResult {
  const tokenCost = BASE_MESSAGE_PRICE_TOKENS * config.burnMultiplier;

  if (payerBalance < tokenCost) {
    // Payer cannot afford this message → LOCKED
    return {
      billed: false,
      tokensConsumed: 0,
      earnerCredit: 0,
      platformCredit: 0,
      locked: true,
      updatedBillingState: currentState,
    };
  }

  // Earner gets 100% of message cost; platform earns on payout
  const earnerCredit = earnerId !== null ? tokenCost : 0;
  const platformCredit = earnerId !== null ? 0 : tokenCost;

  const updatedBillingState: CanonicalBillingState = {
    totalMessagesCharged: currentState.totalMessagesCharged + 1,
    totalTokensConsumed: currentState.totalTokensConsumed + tokenCost,
    totalEarnerCredited: currentState.totalEarnerCredited + earnerCredit,
    totalAvaloCredited: currentState.totalAvaloCredited + platformCredit,
  };

  return {
    billed: true,
    tokensConsumed: tokenCost,
    earnerCredit,
    platformCredit,
    locked: false,
    updatedBillingState,
  };
}

/**
 * V9: Process a message in a chat.
 *
 * Handles both FREE_ACTIVE and PAID_ACTIVE states in a single call.
 *
 * - FREE_ACTIVE + earner has free remaining → free, decrement counter
 * - FREE_ACTIVE + earner free exhausted → transition to PAID_ACTIVE, bill 3T
 * - PAID_ACTIVE + sender is payer → always free
 * - PAID_ACTIVE + sender is earner → bill 3T from payer wallet
 * - LOCKED → return locked=true, do not allow message
 *
 * @param chatId - The chat ID
 * @param senderId - The message sender
 * @param messageText - The message text (unused for billing in V9, kept for compat)
 * @returns BillingResult
 */
export async function processMessage(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<BillingResult> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }
    const chat = chatSnap.data() as CanonicalChatDocument;

    // LOCKED — payer must reopen
    if (chat.state === 'LOCKED') {
      return {
        billed: false,
        tokensConsumed: 0,
        earnerCredit: 0,
        platformCredit: 0,
        locked: true,
        updatedBillingState: chat.paidSession?.billingState ?? {
          totalMessagesCharged: 0, totalTokensConsumed: 0,
          totalEarnerCredited: 0, totalAvaloCredited: 0,
        },
      };
    }

    // Payer messages are ALWAYS free (in any active state)
    if (senderId === chat.roles.payerId) {
      transaction.update(chatRef, {
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const emptyState: CanonicalBillingState = chat.paidSession?.billingState ?? {
        totalMessagesCharged: 0, totalTokensConsumed: 0,
        totalEarnerCredited: 0, totalAvaloCredited: 0,
      };
      return { billed: false, tokensConsumed: 0, earnerCredit: 0, platformCredit: 0, locked: false, updatedBillingState: emptyState };
    }

    // Earner message in FREE_ACTIVE — check free counter
    if (chat.state === 'FREE_ACTIVE') {
      const earnerFree = chat.free.freeRemainingByUser[senderId] ?? 0;
      if (earnerFree > 0) {
        // Still free
        transaction.update(chatRef, {
          [`free.freeRemainingByUser.${senderId}`]: earnerFree - 1,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const emptyState: CanonicalBillingState = {
          totalMessagesCharged: 0, totalTokensConsumed: 0,
          totalEarnerCredited: 0, totalAvaloCredited: 0,
        };
        return { billed: false, tokensConsumed: 0, earnerCredit: 0, platformCredit: 0, locked: false, updatedBillingState: emptyState };
      }

      // Earner free exhausted — transition to PAID_ACTIVE and bill
      const newSession: CanonicalPaidSession = {
        sessionId: generateId(),
        sessionVersion: chat.paidSession ? (chat.paidSession.sessionVersion + 1) : 1,
        configSnapshot: { depositTokens: 0, burnMultiplier: 1 },
        startedAt: Timestamp.now(),
        billingState: {
          totalMessagesCharged: 0,
          totalTokensConsumed: 0,
          totalEarnerCredited: 0,
          totalAvaloCredited: 0,
        },
      };
      transaction.update(chatRef, {
        state: 'PAID_ACTIVE' as CanonicalChatState,
        paidSession: newSession,
        updatedAt: serverTimestamp(),
      });
      // Fall through to billing below using newSession
      const payerWalletRef = db.collection('user_wallets').doc(chat.roles.payerId);
      const payerSnap = await transaction.get(payerWalletRef);
      const payerBalance = payerSnap.data()?.balance ?? 0;
      const result = calculateBilling(newSession.billingState, newSession.configSnapshot, chat.roles.earnerId, payerBalance);

      if (result.locked) {
        transaction.update(chatRef, { state: 'LOCKED' as CanonicalChatState });
        logger.info(`Chat LOCKED on transition: chat=${chatId}, payer balance=${payerBalance}`);
        return result;
      }

      return await _applyBillingResult(transaction, chat, chatRef, senderId, result, newSession.sessionId);
    }

    // PAID_ACTIVE — earner message billing
    if (chat.state !== 'PAID_ACTIVE') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} state '${chat.state}' does not allow messaging`);
    }
    if (!chat.paidSession) {
      throw new ChatEngineError('internal', `Chat ${chatId} in PAID_ACTIVE but no paidSession`);
    }

    const payerWalletRef = db.collection('user_wallets').doc(chat.roles.payerId);
    const payerSnap = await transaction.get(payerWalletRef);
    const payerBalance = payerSnap.data()?.balance ?? 0;

    const result = calculateBilling(
      chat.paidSession.billingState,
      chat.paidSession.configSnapshot,
      chat.roles.earnerId,
      payerBalance
    );

    if (result.locked) {
      transaction.update(chatRef, {
        state: 'LOCKED' as CanonicalChatState,
        updatedAt: serverTimestamp(),
      });
      logger.info(`Chat LOCKED: chat=${chatId}, payer balance=${payerBalance}`);
      return result;
    }

    return await _applyBillingResult(transaction, chat, chatRef, senderId, result, chat.paidSession.sessionId);
  });
}

/**
 * Apply a billing result: update wallet, write transaction, update billing state.
 * Internal helper — not exported.
 */
async function _applyBillingResult(
  transaction: FirebaseFirestore.Transaction,
  chat: CanonicalChatDocument,
  chatRef: FirebaseFirestore.DocumentReference,
  senderId: string,
  result: BillingResult,
  sessionId: string
): Promise<BillingResult> {
  // Deduct from payer wallet
  const payerWalletRef = db.collection('user_wallets').doc(chat.roles.payerId);
  transaction.set(payerWalletRef, {
    balance: increment(-result.tokensConsumed),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Credit earner wallet
  if (result.earnerCredit > 0 && chat.roles.earnerId) {
    const earnerWalletRef = db.collection('user_wallets').doc(chat.roles.earnerId);
    transaction.set(earnerWalletRef, {
      balance: increment(result.earnerCredit),
      earned: increment(result.earnerCredit),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // Credit platform (Avalo earns) if no earner
  if (result.platformCredit > 0) {
    const platformWalletRef = db.collection('system_wallets').doc('platform_platform');
    transaction.set(platformWalletRef, {
      balance: increment(result.platformCredit),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // Update billing state + timestamps
  transaction.update(chatRef, {
    'paidSession.billingState': result.updatedBillingState,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Record billing transaction
  const txId = generateId();
  transaction.set(db.collection('transactions').doc(txId), {
    txId,
    uid: chat.roles.earnerId || 'platform_platform',
    type: 'CHAT_BILLING',
    amountTokens: result.tokensConsumed,
    split: {
      earnerTokens: result.earnerCredit,
      platformTokens: result.platformCredit,
    },
    status: 'completed',
    metadata: {
      chatId: chat.chatId,
      sessionId,
      senderId,
      logicVersion: CANONICAL_LOGIC_VERSION,
    },
    createdAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });

  return result;
}

// ============================================================================
// F) MULTIPLIER CHANGES (NEXT SESSION ONLY)
// ============================================================================

/**
 * Earner sets burn multiplier for their NEXT paid session.
 * Validates against BURN_MULTIPLIER_ENUM [1,2,3,4,5,7,10,12,15,20].
 *
 * This does NOT affect any current active session.
 *
 * @param userId - The earner user ID
 * @param multiplier - The desired multiplier
 */
export async function setMultiplierForNextSession(
  userId: string,
  multiplier: number
): Promise<void> {
  if (!BURN_MULTIPLIER_ENUM.includes(multiplier as BurnMultiplier)) {
    throw new ChatEngineError(
      'invalid-argument',
      `Invalid multiplier ${multiplier}. Allowed: ${BURN_MULTIPLIER_ENUM.join(', ')}`
    );
  }

  await db.collection('users').doc(userId).set({
    chatEarnerConfig: {
      burnMultiplierForNextSession: multiplier,
    },
  }, { merge: true });

  logger.info(`Multiplier set: user=${userId}, multiplier=${multiplier} (next session)`);
}

/**
 * Earner sets deposit tokens for their NEXT paid session.
 * Minimum is 100 tokens.
 *
 * @param userId - The earner user ID
 * @param depositTokens - The desired deposit amount
 */
export async function setDepositForNextSession(
  userId: string,
  depositTokens: number
): Promise<void> {
  if (typeof depositTokens !== 'number' || depositTokens < MIN_DEPOSIT_TOKENS) {
    throw new ChatEngineError(
      'invalid-argument',
      `Deposit must be at least ${MIN_DEPOSIT_TOKENS} tokens, got ${depositTokens}`
    );
  }

  await db.collection('users').doc(userId).set({
    chatEarnerConfig: {
      depositTokensForNextSession: depositTokens,
    },
  }, { merge: true });

  logger.info(`Deposit set: user=${userId}, depositTokens=${depositTokens} (next session)`);
}

// ============================================================================
// G) CHAT END / EXPIRY
// ============================================================================

/**
 * End a chat manually (by either party).
 * V9: No escrow refund (no deposit model). Simply closes the chat.
 * Transition: any active state → CLOSED
 *
 * @param chatId - The chat to end
 * @param userId - The user requesting end
 * @returns RefundResult (all zeros in V9 — no escrow)
 */
export async function endChat(
  chatId: string,
  userId: string
): Promise<RefundResult> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (!chat.participants.includes(userId)) {
      throw new ChatEngineError('permission-denied', `User ${userId} is not a participant of chat ${chatId}`);
    }

    if (chat.state === 'CLOSED' || chat.state === 'EXPIRED') {
      return {
        refundedTokens: 0,
        platformFeeRetained: 0,
        earnerCreditsRetained: chat.paidSession?.billingState.totalEarnerCredited || 0,
      };
    }

    transaction.update(chatRef, {
      state: 'CLOSED' as CanonicalChatState,
      closedReason: 'user_ended',
      closedBy: userId,
      updatedAt: serverTimestamp(),
    });

    logger.info(`Chat ended: ${chatId} by ${userId} (V9: no escrow refund)`);

    return {
      refundedTokens: 0,
      platformFeeRetained: 0,
      earnerCreditsRetained: chat.paidSession?.billingState.totalEarnerCredited || 0,
    };
  });
}

/**
 * Auto-expire inactive chats (48h canonical inactivity threshold).
 * Called by scheduled function.
 *
 * Finds all chats in active states that haven't had a message in 48+ hours
 * and expires them. V9: no escrow refund on expiry.
 *
 * @returns Number of chats expired
 */
export async function expireInactiveChats(): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - INACTIVITY_EXPIRY_MS);
  let expiredCount = 0;

  // V9: expire all active states including LOCKED
  const activeStates: CanonicalChatState[] = ['FREE_ACTIVE', 'PAID_ACTIVE', 'LOCKED'];

  for (const state of activeStates) {
    const staleChatsSnap = await db.collection('chats')
      .where('logicVersion', '==', CANONICAL_LOGIC_VERSION)
      .where('state', '==', state)
      .where('lastMessageAt', '<', cutoff)
      .limit(500)
      .get();

    for (const chatDoc of staleChatsSnap.docs) {
      try {
        await db.runTransaction(async (transaction) => {
          const freshSnap = await transaction.get(chatDoc.ref);
          const freshChat = freshSnap.data() as CanonicalChatDocument;

          if (freshChat.state !== state) return;

          // V9: no escrow refund — just expire
          transaction.update(chatDoc.ref, {
            state: 'EXPIRED' as CanonicalChatState,
            closedReason: 'system_expired',
            updatedAt: serverTimestamp(),
          });
        });

        expiredCount++;
      } catch (error) {
        logger.error(`Failed to expire chat ${chatDoc.id}:`, error);
      }
    }
  }

  // Also expire AWAITING_EARNER_ACCEPT chats (no lastMessageAt, use createdAt)
  const staleMatchedSnap = await db.collection('chats')
    .where('logicVersion', '==', CANONICAL_LOGIC_VERSION)
    .where('state', '==', 'AWAITING_EARNER_ACCEPT')
    .where('createdAt', '<', cutoff)
    .limit(500)
    .get();

  for (const chatDoc of staleMatchedSnap.docs) {
    try {
      await chatDoc.ref.update({
        state: 'EXPIRED' as CanonicalChatState,
        closedReason: 'system_expired',
        updatedAt: serverTimestamp(),
      });
      expiredCount++;
    } catch (error) {
      logger.error(`Failed to expire awaiting chat ${chatDoc.id}:`, error);
    }
  }

  logger.info(`Expired ${expiredCount} inactive chats`);
  return expiredCount;
}

// ============================================================================
// H) VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a multiplier is in the allowed enum.
 */
export function isValidMultiplier(multiplier: number): multiplier is BurnMultiplier {
  return BURN_MULTIPLIER_ENUM.includes(multiplier as BurnMultiplier);
}

/**
 * Check if a chat document uses the canonical v2 logic.
 */
export function isCanonicalChat(chatData: any): boolean {
  return chatData?.logicVersion === CANONICAL_LOGIC_VERSION;
}

/**
 * Get the earner's config for next session.
 * Falls back to defaults if not configured.
 */
export async function getEarnerConfig(userId: string): Promise<EarnerChatConfig> {
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();

  return {
    depositTokensForNextSession: userData?.chatEarnerConfig?.depositTokensForNextSession ?? DEFAULT_DEPOSIT_TOKENS,
    burnMultiplierForNextSession: userData?.chatEarnerConfig?.burnMultiplierForNextSession ?? 1,
  };
}





























