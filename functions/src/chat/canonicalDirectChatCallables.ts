/**
 * ============================================================================
 * CANONICAL DIRECT CHAT CALLABLES — V1
 * ============================================================================
 *
 * onCall Firebase Functions for direct paid chat.
 *
 * TWO lifecycle entry modes (§1.3):
 *
 *   A. MUTUAL SWIPE (matched):
 *      mutual swipe match → c5_startMatchedChat()
 *      → state: FREE_ACTIVE (3 free fan msgs + 3 free creator msgs each)
 *      → after free allowance exhausted → PAID_ENTRY_PENDING
 *      → fan calls c5_openPaidSessionCall() → PAID_ACTIVE (min 100 tokens reserved)
 *
 *   B. UNMATCHED PAID REQUEST (no match):
 *      fan calls c5_requestPaidChat() → state: AWAITING_EARNER_ACCEPT
 *      → creator calls c5_creatorAcceptPaidChat() → PAID_ENTRY_PENDING
 *      OR creator calls c5_creatorDeclinePaidChat() → CLOSED
 *      → fan calls c5_openPaidSessionCall() → PAID_ACTIVE (min 100 tokens)
 *
 * Budget-exhaustion continuation (§1.5):
 *      PAID_ACTIVE → [budget hits remaining < finalRate] → BUDGET_EXHAUSTED
 *      → state: LOCKED_CONTINUATION
 *      fan may send exactly ONE continuation request (c5_sendContinuationRequest)
 *      creator may send exactly ONE locked reply (c5_deliverLockedReply) — not billable, not visible
 *      fan calls c5_fundNewSegment() → PAID_ACTIVE with new reservation
 *      locked reply is delivered and billed at new-segment rate (prior frozen rate)
 *
 * Rate negotiation (§1.6): see canonicalMultiplierTiers.ts for proposeRateChange()
 * Normal end (§1.6): END_PROPOSED → 120-min notice → CLOSED
 *
 * @module chat/canonicalDirectChatCallables
 * @version 1.0.0
 */

import { onCall, HttpsError }      from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireVerifiedAdult }     from '../compliance/ageGuard';
import {
  deliverPaidResponse,
  deliverFreeMessage,
  openPaidSession,
  closePaidSession,
  isBillableCreatorMessage,
  FREE_MESSAGES_PER_USER,
  CONTINUATION_REQUEST_STATE,
  LOCKED_REPLY_STATE,
  C5ChatState,
  C5ChatDocument,
  ChatMessageContent,
} from './canonicalChatStateMachineV3';
import {
  assertMultiplierEligibility,
  proposeRateChange,
  resolveRateProposal,
  submitFanCounteroffer,
  resolveCounteroffer,
  proposeSessionEnd,
  resolveEndProposal,
  CONSENT_REQUIRED_MULTIPLIER_THRESHOLD,
  CanonicalMultiplier,
} from './canonicalMultiplierTiers';

const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || key.trim().length < 8 || key.trim().length > 128) {
    throw new HttpsError('invalid-argument', 'idempotencyKey must be 8-128 chars (e.g. UUID v4)');
  }
  return key.trim();
}

async function loadChat(chatId: string): Promise<C5ChatDocument> {
  const snap = await db.collection('chats').doc(chatId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Chat ${chatId} not found`);
  return snap.data() as C5ChatDocument;
}

// ── Mode A: Mutual-swipe matched chat ─────────────────────────────────────────

/**
 * Start a matched chat after mutual swipe.
 * Both parties have already expressed intent; no accept/decline step.
 * State: FREE_ACTIVE with 3 free messages each.
 */
export const c5_startMatchedChat = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, fanId, creatorId, idempotencyKey } = req.data;
    const iKey = validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(req.auth.uid);
    await requireVerifiedAdult(fanId);
    await requireVerifiedAdult(creatorId);

    // Idempotency
    const iRef  = db.collection('_idempotency').doc(`start_matched:${chatId}:${iKey}`);
    const iSnap = await iRef.get();
    if (iSnap.exists) return { chatId, state: 'FREE_ACTIVE' };

    const chatRef = db.collection('chats').doc(chatId);
    const existing = await chatRef.get();
    if (existing.exists) throw new HttpsError('already-exists', `Chat ${chatId} already exists`);

    await db.runTransaction(async (t) => {
      t.set(chatRef, {
        chatId,
        state:                   'FREE_ACTIVE' as C5ChatState,
        fanId,
        creatorId,
        entryMode:               'MATCHED',
        activeReservationId:     null,
        remainingReservedTokens: 0,
        paidResponseCount:       0,
        sessionConfig:           null,
        continuationRequestSent: false,
        lockedContinuationReplyId: null,
        freeMessagesRemaining: {
          [fanId]:     FREE_MESSAGES_PER_USER,  // 3
          [creatorId]: FREE_MESSAGES_PER_USER,  // 3
        },
        lastMessageAt: null,
        createdAt:     FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      } as C5ChatDocument & { entryMode: string; continuationRequestSent: boolean; lockedContinuationReplyId: null });
      t.set(iRef, { chatId, createdAt: FieldValue.serverTimestamp() });
    });

    return { chatId, state: 'FREE_ACTIVE', freeMessagesEach: FREE_MESSAGES_PER_USER };
  },
);

// ── Mode B: Unmatched paid-chat request ──────────────────────────────────────

/**
 * Fan requests a paid chat without a mutual match.
 * No free message allowance. Creator must accept before fan can reserve tokens.
 */
export const c5_requestPaidChat = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, creatorId, idempotencyKey } = req.data;
    const fanId = req.auth.uid;
    const iKey  = validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(fanId);
    await requireVerifiedAdult(creatorId);

    const iRef  = db.collection('_idempotency').doc(`paid_request:${chatId}:${iKey}`);
    const iSnap = await iRef.get();
    if (iSnap.exists) return { chatId, state: 'AWAITING_EARNER_ACCEPT' };

    const chatRef = db.collection('chats').doc(chatId);
    const existing = await chatRef.get();
    if (existing.exists) throw new HttpsError('already-exists', `Chat ${chatId} already exists`);

    await db.runTransaction(async (t) => {
      t.set(chatRef, {
        chatId,
        state:                   'AWAITING_EARNER_ACCEPT' as C5ChatState,
        fanId,
        creatorId,
        entryMode:               'PAID_REQUEST',
        activeReservationId:     null,
        remainingReservedTokens: 0,
        paidResponseCount:       0,
        sessionConfig:           null,
        continuationRequestSent: false,
        lockedContinuationReplyId: null,
        freeMessagesRemaining:   {},   // no free allowance in paid-request mode
        lastMessageAt:           null,
        createdAt:               FieldValue.serverTimestamp(),
        updatedAt:               FieldValue.serverTimestamp(),
      });
      t.set(iRef, { chatId, createdAt: FieldValue.serverTimestamp() });
    });

    return { chatId, state: 'AWAITING_EARNER_ACCEPT' };
  },
);

/** Creator accepts an unmatched paid-chat request → PAID_ENTRY_PENDING. */
export const c5_creatorAcceptPaidChat = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId } = req.data;
    const creatorId  = req.auth.uid;

    await requireVerifiedAdult(creatorId);
    const chat = await loadChat(chatId);
    if (chat.creatorId !== creatorId) throw new HttpsError('permission-denied', 'Not the creator for this chat');
    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new HttpsError('failed-precondition', `Chat is in state ${chat.state}, not AWAITING_EARNER_ACCEPT`);
    }

    await db.collection('chats').doc(chatId).update({
      state:     'PAID_ENTRY_PENDING' as C5ChatState,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { chatId, state: 'PAID_ENTRY_PENDING' };
  },
);

/** Creator declines an unmatched paid-chat request → CLOSED (tokens never reserved). */
export const c5_creatorDeclinePaidChat = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId } = req.data;
    const creatorId  = req.auth.uid;

    await requireVerifiedAdult(creatorId);
    const chat = await loadChat(chatId);
    if (chat.creatorId !== creatorId) throw new HttpsError('permission-denied', 'Not the creator for this chat');
    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new HttpsError('failed-precondition', `Chat is in state ${chat.state}`);
    }

    await db.collection('chats').doc(chatId).update({
      state:     'CLOSED' as C5ChatState,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { chatId, state: 'CLOSED' };
  },
);

// ── Paid session entry ────────────────────────────────────────────────────────

/**
 * Fan opens a paid session by reserving tokens.
 * Works from both FREE_ACTIVE (matched, after free allowance) and PAID_ENTRY_PENDING.
 * Reservation = max(100, finalRateTokens, creatorConfiguredMinimum).
 */
export const c5_openPaidSessionCall = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, multiplier, idempotencyKey } = req.data;
    const fanId = req.auth.uid;
    validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(fanId);
    const chat = await loadChat(chatId);
    if (chat.fanId !== fanId) throw new HttpsError('permission-denied', 'Not the fan for this chat');

    const allowedStates: C5ChatState[] = ['FREE_ACTIVE', 'PAID_ENTRY_PENDING'];
    if (!allowedStates.includes(chat.state)) {
      throw new HttpsError('failed-precondition',
        `Cannot open paid session from state ${chat.state}. Allowed: ${allowedStates.join(', ')}`);
    }

    // Validate multiplier eligibility for creator
    await assertMultiplierEligibility(chat.creatorId, multiplier as CanonicalMultiplier);

    // Consent required for multiplier >= 5 (§1.2 — first non-VERIFIED tier)
    if (multiplier >= CONSENT_REQUIRED_MULTIPLIER_THRESHOLD) {
      const consentKey = `consent:${chatId}:${multiplier}:${fanId}`;
      const consentSnap = await db.collection('sessionConsents').where('chatId', '==', chatId)
        .where('fanId', '==', fanId).where('multiplier', '==', multiplier).limit(1).get();
      if (consentSnap.empty) {
        throw new HttpsError('failed-precondition',
          `CONSENT_REQUIRED: Fan must call recordSessionConsent() before opening x${multiplier} session`);
      }
    }

    const result = await openPaidSession({
      chatId,
      fanId,
      creatorId:               chat.creatorId,
      multiplier,
      creatorConfiguredMinimum: req.data.creatorConfiguredMinimum ?? 0,
    });

    return { chatId, state: 'PAID_ACTIVE', ...result };
  },
);

// ── Message sending ───────────────────────────────────────────────────────────

/**
 * Fan sends a message.
 *
 * In FREE_ACTIVE: allowed up to FREE_MESSAGES_PER_USER times.
 * In PAID_ACTIVE / RATE_PROPOSED / END_PROPOSED: always allowed (fan never charged).
 * In BUDGET_EXHAUSTED: allowed EXACTLY ONCE as continuation request (§1.5).
 * In LOCKED_CONTINUATION: fan may NOT send messages until new segment funded.
 * All other states: rejected.
 */
export const c5_sendFanMessage = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, content, messageId, idempotencyKey } = req.data;
    const fanId = req.auth.uid;
    validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(fanId);
    const chat = await loadChat(chatId);
    if (chat.fanId !== fanId) throw new HttpsError('permission-denied', 'Not the fan for this chat');

    const state = chat.state;

    // ── BUDGET_EXHAUSTED: exactly one continuation request ──────────────────
    if (state === CONTINUATION_REQUEST_STATE) {
      if ((chat as any).continuationRequestSent) {
        throw new HttpsError('failed-precondition',
          'CONTINUATION_LIMIT: Fan may send exactly one continuation request after budget exhaustion. ' +
          'Fund a new session segment to continue.');
      }
      // Mark continuation request sent + transition to LOCKED_CONTINUATION
      await db.runTransaction(async (t) => {
        const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
        const existing = await t.get(msgRef);
        if (existing.exists) return;
        t.set(msgRef, {
          messageId, chatId,
          senderId: fanId, senderRole: 'FAN',
          content: { ...content, continuationRequest: true },
          billed: false, tokensCharged: 0, idempotencyKey,
          createdAt: FieldValue.serverTimestamp(),
        });
        t.update(db.collection('chats').doc(chatId), {
          state:                   'LOCKED_CONTINUATION' as C5ChatState,
          continuationRequestSent: true,
          lastMessageAt:           FieldValue.serverTimestamp(),
          updatedAt:               FieldValue.serverTimestamp(),
        });
      });
      return { messageId, billed: false, state: 'LOCKED_CONTINUATION' };
    }

    // ── LOCKED_CONTINUATION: fan cannot send until new segment funded ────────
    if (state === 'LOCKED_CONTINUATION') {
      throw new HttpsError('failed-precondition',
        'SESSION_LOCKED: Fund a new session segment before sending more messages.');
    }

    // ── FREE_ACTIVE: check and decrement free counter ─────────────────────
    if (state === 'FREE_ACTIVE') {
      const remaining = (chat.freeMessagesRemaining ?? {})[fanId] ?? 0;
      if (remaining <= 0) {
        throw new HttpsError('failed-precondition',
          'FREE_ALLOWANCE_EXHAUSTED: Open a paid session to continue chatting.');
      }
      await deliverFreeMessage({
        chatId, senderId: fanId, senderRole: 'FAN',
        content, messageId, idempotencyKey, decrementFreeCounter: true,
      });
      return { messageId, billed: false };
    }

    // ── PAID_ACTIVE / RATE_PROPOSED / END_PROPOSED: fan messages free ────────
    const normalStates: C5ChatState[] = ['PAID_ACTIVE', 'RATE_PROPOSED', 'END_PROPOSED'];
    if (normalStates.includes(state)) {
      await deliverFreeMessage({
        chatId, senderId: fanId, senderRole: 'FAN',
        content, messageId, idempotencyKey, decrementFreeCounter: false,
      });
      return { messageId, billed: false };
    }

    throw new HttpsError('failed-precondition', `Cannot send fan message in state ${state}`);
  },
);

/**
 * Creator delivers a response.
 *
 * In FREE_ACTIVE: free up to FREE_MESSAGES_PER_USER.
 * In PAID_ACTIVE: billable response (calls deliverPaidResponse atomically).
 * In LOCKED_CONTINUATION: creator may send EXACTLY ONE locked reply (§1.5).
 *   Locked reply: not visible to fan, not billable, becomes visible on segment fund.
 * All other states: rejected.
 */
export const c5_deliverCreatorMessage = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, content, messageId, idempotencyKey } = req.data;
    const creatorId = req.auth.uid;
    validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(creatorId);
    const chat = await loadChat(chatId);
    if (chat.creatorId !== creatorId) throw new HttpsError('permission-denied', 'Not the creator for this chat');

    const state = chat.state;

    // ── LOCKED_CONTINUATION: exactly one locked reply ──────────────────────
    if (state === LOCKED_REPLY_STATE) {
      if ((chat as any).lockedContinuationReplyId) {
        throw new HttpsError('failed-precondition',
          'LOCKED_REPLY_LIMIT: Creator may send exactly one locked reply after budget exhaustion.');
      }
      await db.runTransaction(async (t) => {
        const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
        const existing = await t.get(msgRef);
        if (existing.exists) return;
        // Write locked reply — visibleToFan=false, billed=false
        t.set(msgRef, {
          messageId, chatId,
          senderId: creatorId, senderRole: 'CREATOR',
          content,
          billed: false, tokensCharged: 0,
          lockedReply: true,
          visibleToFan: false,   // NOT visible until new segment funded
          idempotencyKey,
          createdAt: FieldValue.serverTimestamp(),
        });
        t.update(db.collection('chats').doc(chatId), {
          lockedContinuationReplyId: messageId,
          lastMessageAt:             FieldValue.serverTimestamp(),
          updatedAt:                 FieldValue.serverTimestamp(),
        });
      });
      return { messageId, billed: false, locked: true, visibleToFan: false };
    }

    // ── FREE_ACTIVE: free messages ──────────────────────────────────────────
    if (state === 'FREE_ACTIVE') {
      const remaining = (chat.freeMessagesRemaining ?? {})[creatorId] ?? 0;
      if (remaining <= 0) {
        throw new HttpsError('failed-precondition',
          'CREATOR_FREE_ALLOWANCE_EXHAUSTED: The free message window has ended.');
      }
      await deliverFreeMessage({
        chatId, senderId: creatorId, senderRole: 'CREATOR',
        content, messageId, idempotencyKey, decrementFreeCounter: true,
      });
      return { messageId, billed: false };
    }

    // ── PAID_ACTIVE: billable response ──────────────────────────────────────
    if (state === 'PAID_ACTIVE') {
      if (!chat.activeReservationId || !chat.sessionConfig) {
        throw new HttpsError('failed-precondition', 'PAID_ACTIVE state but no active reservation');
      }
      const parsedContent = content as ChatMessageContent;
      if (!isBillableCreatorMessage({ senderRole: 'CREATOR', content: parsedContent, chatState: state })) {
        // System/reaction/AI messages in paid state — deliver free
        await deliverFreeMessage({
          chatId, senderId: creatorId, senderRole: 'CREATOR',
          content: parsedContent, messageId, idempotencyKey, decrementFreeCounter: false,
        });
        return { messageId, billed: false };
      }

      const result = await deliverPaidResponse({
        chatId,
        fanId:            chat.fanId,
        creatorId,
        reservationId:    chat.activeReservationId,
        finalRateTokens:  chat.sessionConfig.finalRateTokens,
        multiplier:       chat.sessionConfig.multiplier,
        messageId,
        content:          parsedContent,
        idempotencyKey,
      });

      return result;
    }

    // ── RATE_PROPOSED / END_PROPOSED: creator can still send free messages ──
    const normalFreeStates: C5ChatState[] = ['RATE_PROPOSED', 'END_PROPOSED'];
    if (normalFreeStates.includes(state)) {
      await deliverFreeMessage({
        chatId, senderId: creatorId, senderRole: 'CREATOR',
        content, messageId, idempotencyKey, decrementFreeCounter: false,
      });
      return { messageId, billed: false };
    }

    throw new HttpsError('failed-precondition', `Cannot deliver message in state ${state}`);
  },
);

// ── Budget-exhaustion continuation: fund new segment ─────────────────────────

/**
 * Fan funds a new segment after BUDGET_EXHAUSTED / LOCKED_CONTINUATION.
 * Uses the PRIOR FROZEN rate (§1.5: locked reply always uses prior segment's frozen rate).
 * After funding: session returns to PAID_ACTIVE; locked creator reply becomes visible and billed.
 */
export const c5_fundNewSegment = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, idempotencyKey } = req.data;
    const fanId = req.auth.uid;
    validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(fanId);
    const chat = await loadChat(chatId);
    if (chat.fanId !== fanId) throw new HttpsError('permission-denied', 'Not the fan for this chat');

    if (chat.state !== 'LOCKED_CONTINUATION' && chat.state !== 'BUDGET_EXHAUSTED') {
      throw new HttpsError('failed-precondition',
        `Cannot fund new segment from state ${chat.state}`);
    }
    if (!chat.sessionConfig) {
      throw new HttpsError('failed-precondition', 'No session config — cannot determine frozen rate');
    }

    // Open new segment using the FROZEN rate from prior session (§1.5)
    const result = await openPaidSession({
      chatId,
      fanId,
      creatorId:               chat.creatorId,
      multiplier:              chat.sessionConfig.multiplier, // prior frozen multiplier
      creatorConfiguredMinimum: chat.sessionConfig.creatorConfiguredMinimum,
    });

    // If there's a locked continuation reply, make it visible and bill it
    const lockedReplyId = (chat as any).lockedContinuationReplyId as string | null;
    if (lockedReplyId) {
      // Deliver locked reply atomically (bill at prior frozen rate)
      const billingKey = `locked_reply:${chatId}:${lockedReplyId}`;
      const msgRef     = db.collection('chats').doc(chatId).collection('messages').doc(lockedReplyId);
      const msgSnap    = await msgRef.get();
      if (msgSnap.exists) {
        const msg = msgSnap.data() as any;
        // Bill at the new (same frozen) rate
        await deliverPaidResponse({
          chatId,
          fanId,
          creatorId:       chat.creatorId,
          reservationId:   result.reservationId,
          finalRateTokens: result.finalRateTokens,
          multiplier:      chat.sessionConfig.multiplier,
          messageId:       lockedReplyId,
          content:         msg.content,
          idempotencyKey:  billingKey,
        });
        // Make locked reply visible
        await msgRef.update({ visibleToFan: true, lockedReply: false });
      }
      // Reset continuation flags
      await db.collection('chats').doc(chatId).update({
        continuationRequestSent:   false,
        lockedContinuationReplyId: null,
        updatedAt:                 FieldValue.serverTimestamp(),
      });
    }

    return { chatId, state: 'PAID_ACTIVE', ...result };
  },
);

// ── Session close ─────────────────────────────────────────────────────────────

/** Close a paid session and return unused tokens to fan. */
export const c5_closePaidSessionCall = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { chatId, idempotencyKey } = req.data;
    const uid = req.auth.uid;
    validateIdempotencyKey(idempotencyKey);

    await requireVerifiedAdult(uid);
    const chat = await loadChat(chatId);
    if (uid !== chat.fanId && uid !== chat.creatorId) {
      throw new HttpsError('permission-denied', 'Not a participant of this chat');
    }

    const closableStates: C5ChatState[] = ['PAID_ACTIVE', 'RATE_PROPOSED', 'END_PROPOSED', 'BUDGET_EXHAUSTED', 'LOCKED_CONTINUATION'];
    if (!closableStates.includes(chat.state)) {
      throw new HttpsError('failed-precondition', `Cannot close chat in state ${chat.state}`);
    }
    if (!chat.activeReservationId) {
      // No active reservation — just mark closed
      await db.collection('chats').doc(chatId).update({
        state: 'CLOSED' as C5ChatState, updatedAt: FieldValue.serverTimestamp(),
      });
      return { chatId, tokensReturned: 0 };
    }

    const result = await closePaidSession({
      chatId, fanId: chat.fanId, reservationId: chat.activeReservationId,
      finalState: 'CLOSED', idempotencyKey,
    });
    return { chatId, ...result };
  },
);

// ── Rate negotiation wrappers ─────────────────────────────────────────────────

export const c5_proposeRateChange = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    return proposeRateChange({
      chatId:           req.data.chatId,
      creatorId:        req.auth.uid,
      fanId:            req.data.fanId,
      currentMultiplier: req.data.currentMultiplier,
      proposedMultiplier: req.data.proposedMultiplier,
      triggerCondition:   req.data.triggerCondition,
    });
  },
);

export const c5_resolveRateProposal = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    return resolveRateProposal({
      chatId:     req.data.chatId,
      proposalId: req.data.proposalId,
      resolution: req.data.resolution,
      fanId:      req.auth.uid,
    });
  },
);

export const c5_submitFanCounteroffer = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    return submitFanCounteroffer({
      chatId:           req.data.chatId,
      proposalId:       req.data.proposalId,
      fanId:            req.auth.uid,
      counterMultiplier: req.data.counterMultiplier,
    });
  },
);

export const c5_resolveCounteroffer = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    return resolveCounteroffer({
      chatId:     req.data.chatId,
      proposalId: req.data.proposalId,
      creatorId:  req.auth.uid,
      resolution: req.data.resolution,
    });
  },
);

export const c5_proposeSessionEnd = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    const chat = await loadChat(req.data.chatId);
    const role: 'FAN' | 'CREATOR' = req.auth.uid === chat.fanId ? 'FAN' : 'CREATOR';
    return proposeSessionEnd({ chatId: req.data.chatId, proposedBy: req.auth.uid, proposerRole: role });
  },
);

export const c5_resolveSessionEnd = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    await requireVerifiedAdult(req.auth.uid);
    const result = await resolveEndProposal({
      chatId:     req.data.chatId,
      proposalId: req.data.proposalId,
      resolution: req.data.resolution,
    });
    if (result.accepted) {
      const chat = await loadChat(req.data.chatId);
      if (chat.activeReservationId) {
        await closePaidSession({
          chatId:        req.data.chatId,
          fanId:         chat.fanId,
          reservationId: chat.activeReservationId,
          finalState:    'CLOSED',
          idempotencyKey: `end_close:${req.data.chatId}:${req.data.proposalId}`,
        });
      }
    }
    return result;
  },
);
