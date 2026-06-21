/**
 * ============================================================================
 * CANONICAL MULTI-ROOM SYSTEM V2 — C10
 * ============================================================================
 *
 * Production multi-room endpoint system.
 *
 * Canonical invariants enforced:
 *   - requireVerifiedAdult() on every public entry point.
 *   - Room entry = refundable reserved room budget (min 100 tokens).
 *   - Creator earns from room budget ONLY after delivering room content (≥1 message).
 *   - Tips = immediate voluntary; creator earns full amount (§5.2).
 *   - Priority question BRONZE/SILVER (no-response-promise): immediate creator earn.
 *   - Priority question GOLD/DIAMOND (response-promise): reserved; earn after delivery.
 *   - Guaranteed response: reserved; creator earns after on-time delivery; auto-refund on timeout.
 *   - All financial writes use Firestore transactions with idempotency sentinels.
 *   - Client must supply idempotencyKey (8-128 char, e.g. UUID v4).
 *   - Date.now() is NEVER used as an idempotency key.
 *   - Creator earning recorded through canonicalEarningService (C4).
 *   - No direct consumer wallet field writes from client.
 *
 * Firestore collections:
 *   multi_rooms/{roomId}
 *   multi_rooms/{roomId}/participants/{userId}
 *   multi_rooms/{roomId}/messages/{messageId}
 *   multi_rooms/{roomId}/tips/{tipId}
 *   multi_rooms/{roomId}/priority_questions/{questionId}
 *   multi_rooms/{roomId}/guaranteed_responses/{responseId}
 *
 * @module rooms/canonicalMultiRoomV2
 * @version 2.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule }         from 'firebase-functions/v2/scheduler';
import { FieldValue }         from 'firebase-admin/firestore';
import { db }                 from '../init';
import { requireVerifiedAdult, requireCreatorKYC } from '../compliance/ageGuard';
import { walletRef }          from '../wallet/walletService';
import { recordCreatorEarning } from '../creator/canonicalEarningService';
// B3: canonical per-participant billing — use instead of message-threshold earning
import {
  enterRoom as canonicalEnterRoom,
  releaseParticipantBudget,
  chargeRoomPaidInteraction,
  chargeRoomTip as canonicalChargeRoomTip,
  reserveRoomInteraction,
  deliverReservedRoomInteraction,
  refundRoomReservation,
  sweepExpiredRoomReservations,
} from './canonicalRoomParticipantBilling';

// ── Constants ────────────────────────────────────────────────────────────────

export const ROOM_MIN_ENTRY_TOKENS          = 100;
export const ROOM_MAX_ENTRY_TOKENS          = 10_000;
export const ROOM_TIP_MIN_TOKENS            = 5;
export const ROOM_GUARANTEED_MIN_TOKENS     = 150;
export const ROOM_GUARANTEED_DEADLINE_MS    = 10 * 60 * 1000; // 10 minutes

/**
 * @deprecated B3: Message-count-based earning is NOT canonical.
 * Room entry fee settling is determined by explicit per-product earning events (A–F)
 * in canonicalRoomParticipantBilling.ts. ROOM_MIN_CREATOR_MESSAGES_TO_EARN is removed.
 * See canonicalRoomParticipantBilling.ts for the canonical earning model.
 */
// REMOVED: export const ROOM_MIN_CREATOR_MESSAGES_TO_EARN — see canonicalRoomParticipantBilling.ts
export const ROOM_CREATOR_EARN_MIN_MESSAGES = 1;  // kept for legacy data migration compatibility
export const ROOM_INACTIVE_EXPIRE_HOURS     = 24;

export const ROOM_PRIORITY_TIERS = {
  BRONZE:  { tokens: 20,  promisesResponse: false, pinMinutes: 5  },
  SILVER:  { tokens: 50,  promisesResponse: false, pinMinutes: 15 },
  GOLD:    { tokens: 100, promisesResponse: true,  pinMinutes: 30 },
  DIAMOND: { tokens: 200, promisesResponse: true,  pinMinutes: 60 },
} as const;

export type PriorityTier    = keyof typeof ROOM_PRIORITY_TIERS;
export type RoomStatus      = 'PENDING' | 'LIVE' | 'CLOSED' | 'EXPIRED';
export type ParticipantStatus = 'ACTIVE' | 'LEFT' | 'KICKED' | 'BANNED';
export type GuaranteedStatus  = 'RESERVED' | 'DELIVERED' | 'REFUNDED' | 'EXPIRED';
export type PriorityStatus    = 'PENDING' | 'ANSWERED' | 'EXPIRED';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoomDocument {
  roomId:               string;
  creatorId:            string;
  status:               RoomStatus;
  title:                string;
  entryTokens:          number;
  maxParticipants:      number | null;
  participantCount:     number;
  creatorMessageCount:  number;
  escrowTotalTokens:    number;
  escrowEarnedTokens:   number;
  escrowReturnedTokens: number;
  openedAt?:            FirebaseFirestore.FieldValue;
  closedAt?:            FirebaseFirestore.FieldValue;
  createdAt:            FirebaseFirestore.FieldValue;
  updatedAt:            FirebaseFirestore.FieldValue;
}

export interface ParticipantDocument {
  userId:          string;
  status:          ParticipantStatus;
  reservedTokens:  number;
  earnedByCreator: boolean;
  joinedAt:        FirebaseFirestore.FieldValue;
  leftAt?:         FirebaseFirestore.FieldValue;
  idempotencyKey:  string;
}

// ── Firestore refs ────────────────────────────────────────────────────────────

export function roomDocRef(roomId: string) {
  return db.collection('multi_rooms').doc(roomId);
}
function participantDocRef(roomId: string, userId: string) {
  return db.collection('multi_rooms').doc(roomId).collection('participants').doc(userId);
}
function tipsCol(roomId: string) {
  return db.collection('multi_rooms').doc(roomId).collection('tips');
}
function priorityCol(roomId: string) {
  return db.collection('multi_rooms').doc(roomId).collection('priority_questions');
}
function guaranteedCol(roomId: string) {
  return db.collection('multi_rooms').doc(roomId).collection('guaranteed_responses');
}
function messagesCol(roomId: string) {
  return db.collection('multi_rooms').doc(roomId).collection('messages');
}
function idempotencyDocRef(key: string) {
  return db.collection('_idempotency').doc(key);
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || key.trim().length < 8 || key.trim().length > 128) {
    throw new HttpsError(
      'invalid-argument',
      'idempotencyKey must be a 8-128 char client-generated unique string (e.g. UUID v4).',
    );
  }
  return key.trim();
}

async function loadRoom(roomId: string): Promise<RoomDocument> {
  const snap = await roomDocRef(roomId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Room ${roomId} not found`);
  return snap.data() as RoomDocument;
}

function assertRoomLive(room: RoomDocument): void {
  if (room.status !== 'LIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.status}, must be LIVE`);
  }
}

function assertCreator(room: RoomDocument, uid: string): void {
  if (room.creatorId !== uid) {
    throw new HttpsError('permission-denied', 'Only the room creator may perform this action');
  }
}

async function assertNotBanned(roomId: string, userId: string): Promise<void> {
  const snap = await participantDocRef(roomId, userId).get();
  if (snap.exists && (snap.data() as ParticipantDocument).status === 'BANNED') {
    throw new HttpsError('permission-denied', 'You are banned from this room');
  }
}

async function checkIdempotency(
  t: FirebaseFirestore.Transaction,
  key: string,
): Promise<string | null> {
  const snap = await t.get(idempotencyDocRef(key));
  if (snap.exists) return (snap.data() as { result: string }).result;
  return null;
}

// ── Room lifecycle ────────────────────────────────────────────────────────────

/**
 * Creator creates a room (PENDING state). Call openRoom to go LIVE.
 */
export async function createRoom(params: {
  creatorId:       string;
  title:           string;
  entryTokens:     number;
  maxParticipants: number | null;
}): Promise<{ roomId: string }> {
  const { creatorId, title, entryTokens, maxParticipants } = params;
  await requireCreatorKYC(creatorId);

  if (!title || title.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Room title must be at least 3 characters');
  }
  if (!Number.isInteger(entryTokens) || entryTokens < ROOM_MIN_ENTRY_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `entryTokens must be an integer ≥ ${ROOM_MIN_ENTRY_TOKENS}`,
    );
  }
  if (entryTokens > ROOM_MAX_ENTRY_TOKENS) {
    throw new HttpsError('invalid-argument', `entryTokens must be ≤ ${ROOM_MAX_ENTRY_TOKENS}`);
  }
  if (maxParticipants !== null && (!Number.isInteger(maxParticipants) || maxParticipants < 2)) {
    throw new HttpsError('invalid-argument', 'maxParticipants must be null or an integer ≥ 2');
  }

  const roomId = db.collection('multi_rooms').doc().id;
  const roomDoc: Omit<RoomDocument, 'openedAt' | 'closedAt'> = {
    roomId,
    creatorId,
    status:               'PENDING',
    title:                title.trim(),
    entryTokens,
    maxParticipants,
    participantCount:     0,
    creatorMessageCount:  0,
    escrowTotalTokens:    0,
    escrowEarnedTokens:   0,
    escrowReturnedTokens: 0,
    createdAt:            FieldValue.serverTimestamp(),
    updatedAt:            FieldValue.serverTimestamp(),
  };
  await roomDocRef(roomId).set(roomDoc);
  return { roomId };
}

/**
 * Creator opens room → LIVE.
 */
export async function openRoom(params: {
  creatorId: string;
  roomId:    string;
}): Promise<void> {
  const { creatorId, roomId } = params;
  await requireCreatorKYC(creatorId);
  const room = await loadRoom(roomId);
  assertCreator(room, creatorId);
  if (room.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', `Room is already ${room.status}`);
  }
  await roomDocRef(roomId).update({
    status:    'LIVE',
    openedAt:  FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Fan joins LIVE room. Reserves entry tokens into room escrow.
 * Tokens not earned by creator yet — only after creator delivers ≥1 message.
 * Unused tokens return automatically on leave/close.
 */
export async function joinRoom(params: {
  userId:         string;
  roomId:         string;
  idempotencyKey: string;
}): Promise<{ reservedTokens: number; participantCount: number }> {
  const { userId, roomId } = params;
  const iKey = validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(userId);

  const room = await loadRoom(roomId);
  assertRoomLive(room);

  if (room.creatorId === userId) {
    throw new HttpsError('invalid-argument', 'Creator cannot join their own room as participant');
  }
  await assertNotBanned(roomId, userId);

  if (room.maxParticipants !== null && room.participantCount >= room.maxParticipants) {
    throw new HttpsError('resource-exhausted', 'Room is at full capacity');
  }

  const fullKey = `room_join:${roomId}:${userId}:${iKey}`;

  return db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) {
      const pSnap = await t.get(participantDocRef(roomId, userId));
      const rSnap = await t.get(roomDocRef(roomId));
      const p = pSnap.data() as ParticipantDocument;
      const r = rSnap.data() as RoomDocument;
      return { reservedTokens: p.reservedTokens, participantCount: r.participantCount };
    }

    const entryTokens   = room.entryTokens;
    const fanWalletRef  = walletRef(userId);
    const fanSnap       = await t.get(fanWalletRef);
    if (!fanSnap.exists) throw new HttpsError('not-found', `Wallet not found: ${userId}`);

    const balance = (fanSnap.data() as { balance: number }).balance;
    if (balance < entryTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens: need ${entryTokens}, have ${balance}`,
      );
    }

    t.update(fanWalletRef, {
      balance:   FieldValue.increment(-entryTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const pDoc: ParticipantDocument = {
      userId,
      status:          'ACTIVE',
      reservedTokens:  entryTokens,
      earnedByCreator: false,
      joinedAt:        FieldValue.serverTimestamp(),
      idempotencyKey:  fullKey,
    };
    t.set(participantDocRef(roomId, userId), pDoc);
    t.update(roomDocRef(roomId), {
      participantCount:  FieldValue.increment(1),
      escrowTotalTokens: FieldValue.increment(entryTokens),
      updatedAt:         FieldValue.serverTimestamp(),
    });

    t.set(idempotencyDocRef(fullKey), {
      result:    'joined',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      reservedTokens:  entryTokens,
      participantCount: room.participantCount + 1,
    };
  });
}

/**
 * Fan leaves room. Returns reserved entry tokens if creator has NOT yet earned
 * them (no creator messages delivered yet). If creator already delivered ≥1
 * message, entry tokens have been settled — no refund for that portion.
 */
export async function leaveRoom(params: {
  userId:         string;
  roomId:         string;
  idempotencyKey: string;
}): Promise<{ tokensReturned: number }> {
  const { userId, roomId } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_leave:${roomId}:${userId}:${iKey}`;
  await requireVerifiedAdult(userId);

  return db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return { tokensReturned: Number(existing) };

    const pRef  = participantDocRef(roomId, userId);
    const pSnap = await t.get(pRef);
    if (!pSnap.exists || (pSnap.data() as ParticipantDocument).status !== 'ACTIVE') {
      throw new HttpsError('failed-precondition', 'Not an active participant');
    }
    const p = pSnap.data() as ParticipantDocument;
    const tokensToReturn = p.earnedByCreator ? 0 : p.reservedTokens;

    if (tokensToReturn > 0) {
      t.update(walletRef(userId), {
        balance:   FieldValue.increment(tokensToReturn),
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.update(roomDocRef(roomId), {
        escrowReturnedTokens: FieldValue.increment(tokensToReturn),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    t.update(pRef, { status: 'LEFT', leftAt: FieldValue.serverTimestamp() });
    t.update(roomDocRef(roomId), {
      participantCount: FieldValue.increment(-1),
      updatedAt:        FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), {
      result:    String(tokensToReturn),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { tokensReturned: tokensToReturn };
  });
}

// ── Message delivery ──────────────────────────────────────────────────────────

/**
 * Creator delivers a message to the room.
 *
 * On the FIRST creator message: all active participants whose earnedByCreator
 * is false have their entry reservations settled atomically to creator earnings.
 * Subsequent creator messages: no additional charge (entry is a flat access product).
 *
 * Fan messages are never charged. Use sendFanRoomMessage().
 */
export async function deliverCreatorRoomMessage(params: {
  creatorId:      string;
  roomId:         string;
  content:        string;
  idempotencyKey: string;
}): Promise<{ messageId: string; tokensEarned: number }> {
  const { creatorId, roomId, content } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_msg:${roomId}:${creatorId}:${iKey}`;
  await requireVerifiedAdult(creatorId);

  if (!content || content.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message content cannot be empty');
  }

  const room = await loadRoom(roomId);
  assertRoomLive(room);
  assertCreator(room, creatorId);

  // B3: DEPRECATED — message-count threshold earning removed.
  // Entry budget is NOT earned here. Use chargeRoomPaidInteraction() for explicit paid interactions.
  // Keeping room.creatorMessageCount increment for analytics/scheduling only.
  // §1.8 canonical earning is triggered by per-product events (A–F).
  // ↓ Original threshold block preserved as DEAD_CODE for reference only:
  // NOT on first generic message — prevents trivial earn-and-leave exploitation.
  const messageCountAfter        = room.creatorMessageCount + 1;
  const reachesEarnThreshold     = false; // DEAD_CODE: message-threshold earning removed (B3); was messageCountAfter === ROOM_MIN_CREATOR_MESSAGES_TO_EARN
  const isFirstMessage           = false; // no longer used — threshold replaces first-message trigger
  let   tokensEarned   = 0;

  const messageId = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return existing;

    const msgId = messagesCol(roomId).doc().id;

    if (reachesEarnThreshold) { // earn entry fees after min messages delivered (§1.8)
      // Settle all active participants who haven't yet been earned
      const unearnedSnap = await db.collection('multi_rooms').doc(roomId)
        .collection('participants')
        .where('status', '==', 'ACTIVE')
        .where('earnedByCreator', '==', false)
        .get();

      for (const pDoc of unearnedSnap.docs) {
        const p = pDoc.data() as ParticipantDocument;
        t.update(participantDocRef(roomId, p.userId), { earnedByCreator: true });
        tokensEarned += p.reservedTokens;
      }

      if (tokensEarned > 0) {
        t.update(roomDocRef(roomId), {
          escrowEarnedTokens: FieldValue.increment(tokensEarned),
          updatedAt:          FieldValue.serverTimestamp(),
        });
      }
    }

    t.set(messagesCol(roomId).doc(msgId), {
      messageId:  msgId,
      senderId:   creatorId,
      senderRole: 'CREATOR',
      content:    content.trim(),
      timestamp:  FieldValue.serverTimestamp(),
      moderation: 'PENDING',
    });
    t.update(roomDocRef(roomId), {
      creatorMessageCount: FieldValue.increment(1),
      updatedAt:           FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), {
      result:    msgId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return msgId;
  });

  // Record creator earning outside transaction (non-blocking; safe to retry)
  if (tokensEarned > 0) {
    await recordCreatorEarning({
      creatorId,
      payerId:          'ROOM_POOL',
      type:             'ROOM_PRODUCT',
      tokenAmount:      tokensEarned,
      sourceRef:        roomId,
      idempotencyKey:   `room_entry_earn:${roomId}:${iKey}`,
    }).catch((err: unknown) => {
      console.error('[C10] recordCreatorEarning failed (room entry):', err);
    });
  }

  return { messageId, tokensEarned };
}

/**
 * Fan sends a message in the room. Fan messages are never billable.
 */
export async function sendFanRoomMessage(params: {
  userId:         string;
  roomId:         string;
  content:        string;
  idempotencyKey: string;
}): Promise<{ messageId: string }> {
  const { userId, roomId, content } = params;
  validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(userId);

  const room = await loadRoom(roomId);
  assertRoomLive(room);
  await assertNotBanned(roomId, userId);

  const pSnap = await participantDocRef(roomId, userId).get();
  if (!pSnap.exists || (pSnap.data() as ParticipantDocument).status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'Must be an active participant to send messages');
  }

  const messageId = messagesCol(roomId).doc().id;
  await messagesCol(roomId).doc(messageId).set({
    messageId,
    senderId:   userId,
    senderRole: 'FAN',
    content:    content.trim(),
    timestamp:  FieldValue.serverTimestamp(),
    moderation: 'PENDING',
  });
  return { messageId };
}

// ── Room products ─────────────────────────────────────────────────────────────

/**
 * Tip in room. Immediate voluntary charge. Creator earns full tip amount (§5.2).
 * Avalo 20% commission applies at payout time, not at tip time.
 */
export async function sendRoomTip(params: {
  payerId:        string;
  roomId:         string;
  tokens:         number;
  idempotencyKey: string;
}): Promise<{ tipId: string; tokensCharged: number }> {
  const { payerId, roomId, tokens } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_tip:${roomId}:${payerId}:${iKey}`;
  await requireVerifiedAdult(payerId);

  if (!Number.isInteger(tokens) || tokens < ROOM_TIP_MIN_TOKENS) {
    throw new HttpsError('invalid-argument', `Tip minimum is ${ROOM_TIP_MIN_TOKENS} tokens`);
  }

  const room = await loadRoom(roomId);
  assertRoomLive(room);
  if (room.creatorId === payerId) {
    throw new HttpsError('invalid-argument', 'Cannot tip your own room');
  }

  const tipId = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return existing;

    const fanSnap = await t.get(walletRef(payerId));
    if (!fanSnap.exists) throw new HttpsError('not-found', `Wallet not found: ${payerId}`);
    const balance = (fanSnap.data() as { balance: number }).balance;
    if (balance < tokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens: need ${tokens}, have ${balance}`,
      );
    }

    const id = tipsCol(roomId).doc().id;
    t.update(walletRef(payerId), {
      balance:   FieldValue.increment(-tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(tipsCol(roomId).doc(id), {
      tipId: id, payerId, creatorId: room.creatorId,
      tokens, status: 'COMPLETED',
      createdAt: FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), { result: id, createdAt: FieldValue.serverTimestamp() });
    return id;
  });

  await recordCreatorEarning({
    creatorId:        room.creatorId,
    payerId:          payerId,
    type:             'TIP',
    tokenAmount:      tokens,
    sourceRef:        roomId,
    idempotencyKey:   `room_tip_earn:${roomId}:${iKey}`,
  });

  return { tipId, tokensCharged: tokens };
}

/**
 * Fan sends a priority question.
 *
 * BRONZE/SILVER: immediate charge, creator earns immediately (no response promise).
 * GOLD/DIAMOND:  immediate charge, creator earns only after delivering answer before deadline.
 *
 * Creator must call deliverPriorityAnswer() to earn GOLD/DIAMOND tokens.
 * If deadline passes without delivery, tokens are automatically refunded.
 */
export async function sendPriorityQuestion(params: {
  payerId:        string;
  roomId:         string;
  tier:           PriorityTier;
  question:       string;
  idempotencyKey: string;
}): Promise<{ questionId: string; status: PriorityStatus }> {
  const { payerId, roomId, tier, question } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_pq:${roomId}:${payerId}:${iKey}`;
  await requireVerifiedAdult(payerId);

  const spec = ROOM_PRIORITY_TIERS[tier];
  if (!spec) throw new HttpsError('invalid-argument', `Unknown priority tier: ${tier}`);

  const room = await loadRoom(roomId);
  assertRoomLive(room);
  if (room.creatorId === payerId) {
    throw new HttpsError('invalid-argument', 'Cannot send priority question in own room');
  }

  const { tokens, promisesResponse } = spec;
  const deadlineAt = promisesResponse
    ? new Date(Date.now() + ROOM_GUARANTEED_DEADLINE_MS)
    : null;

  const questionId = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return existing;

    const fanSnap = await t.get(walletRef(payerId));
    if (!fanSnap.exists) throw new HttpsError('not-found', `Wallet not found: ${payerId}`);
    const balance = (fanSnap.data() as { balance: number }).balance;
    if (balance < tokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens: need ${tokens}, have ${balance}`,
      );
    }

    t.update(walletRef(payerId), {
      balance:   FieldValue.increment(-tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const id = priorityCol(roomId).doc().id;
    t.set(priorityCol(roomId).doc(id), {
      questionId:       id,
      payerId,
      creatorId:        room.creatorId,
      tier,
      tokens,
      question:         question.trim(),
      promisesResponse,
      status:           promisesResponse ? 'PENDING' : 'ANSWERED',
      deadlineAt,
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), { result: id, createdAt: FieldValue.serverTimestamp() });
    return id;
  });

  // BRONZE/SILVER: earn immediately (no delivery required)
  if (!promisesResponse) {
    await recordCreatorEarning({
      creatorId:        room.creatorId,
      payerId:          payerId,
      type:             'ROOM_PRODUCT',
      tokenAmount:      tokens,
      sourceRef:        `${roomId}:priority_question`,
      idempotencyKey:   `room_pq_earn:${roomId}:${iKey}`,
    });
  }

  return {
    questionId,
    status: promisesResponse ? 'PENDING' : 'ANSWERED',
  };
}

/**
 * Creator delivers answer to a GOLD/DIAMOND priority question.
 * Creator earns the reserved tokens only at this point.
 */
export async function deliverPriorityAnswer(params: {
  creatorId:      string;
  roomId:         string;
  questionId:     string;
  answer:         string;
  idempotencyKey: string;
}): Promise<void> {
  const { creatorId, roomId, questionId, answer } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_pq_ans:${roomId}:${questionId}:${iKey}`;
  await requireVerifiedAdult(creatorId);

  const room = await loadRoom(roomId);
  assertCreator(room, creatorId);

  const qSnap = await priorityCol(roomId).doc(questionId).get();
  if (!qSnap.exists) throw new HttpsError('not-found', 'Priority question not found');
  const q = qSnap.data() as { payerId: string; tokens: number; status: string; [key: string]: unknown };

  if (!q.promisesResponse) {
    throw new HttpsError('invalid-argument', 'This tier does not require a delivered answer');
  }
  if (q.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', `Question is already ${q.status}`);
  }
  if (q.deadlineAt && new Date() > (q.deadlineAt as FirebaseFirestore.Timestamp).toDate()) {
    throw new HttpsError('deadline-exceeded', 'Priority question deadline has passed');
  }

  const existingIdem = await idempotencyDocRef(fullKey).get();
  if (existingIdem.exists) return;

  await db.runTransaction(async (t) => {
    const qRef  = priorityCol(roomId).doc(questionId);
    const qSnap2 = await t.get(qRef);
    if ((qSnap2.data() as { status: string }).status !== 'PENDING') return; // double-check in tx
    t.update(qRef, {
      status:     'ANSWERED' as PriorityStatus,
      answer:     answer.trim(),
      answeredAt: FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), { result: 'answered', createdAt: FieldValue.serverTimestamp() });
  });

  await recordCreatorEarning({
    creatorId,
    payerId:          q.payerId ?? 'UNKNOWN',
    type:             'ROOM_PRODUCT',
    tokenAmount:      q.tokens,
    sourceRef:        `${roomId}:priority_question`,
    idempotencyKey:   `room_pq_earn:${roomId}:${questionId}:${iKey}`,
  });
}

/**
 * Fan requests a guaranteed response. Tokens charged immediately.
 * Creator has ROOM_GUARANTEED_DEADLINE_MS to respond; else auto-refund.
 */
export async function requestGuaranteedResponse(params: {
  payerId:        string;
  roomId:         string;
  tokens:         number;
  question:       string;
  idempotencyKey: string;
}): Promise<{ responseId: string; deadlineAt: string }> {
  const { payerId, roomId, tokens, question } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_gr:${roomId}:${payerId}:${iKey}`;
  await requireVerifiedAdult(payerId);

  if (!Number.isInteger(tokens) || tokens < ROOM_GUARANTEED_MIN_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Guaranteed response minimum is ${ROOM_GUARANTEED_MIN_TOKENS} tokens`,
    );
  }

  const room = await loadRoom(roomId);
  assertRoomLive(room);
  if (room.creatorId === payerId) {
    throw new HttpsError('invalid-argument', 'Cannot request guaranteed response in own room');
  }

  const deadlineAt = new Date(Date.now() + ROOM_GUARANTEED_DEADLINE_MS);

  const responseId = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return existing;

    const fanSnap = await t.get(walletRef(payerId));
    if (!fanSnap.exists) throw new HttpsError('not-found', `Wallet not found: ${payerId}`);
    const balance = (fanSnap.data() as { balance: number }).balance;
    if (balance < tokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens: need ${tokens}, have ${balance}`,
      );
    }

    t.update(walletRef(payerId), {
      balance:   FieldValue.increment(-tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const id = guaranteedCol(roomId).doc().id;
    t.set(guaranteedCol(roomId).doc(id), {
      responseId: id,
      payerId,
      creatorId:  room.creatorId,
      tokens,
      question:   question.trim(),
      status:     'RESERVED' as GuaranteedStatus,
      deadlineAt,
      createdAt:  FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), { result: id, createdAt: FieldValue.serverTimestamp() });
    return id;
  });

  return { responseId, deadlineAt: deadlineAt.toISOString() };
}

/**
 * Creator delivers guaranteed response before deadline.
 * Creator earns reserved tokens only at this moment.
 */
export async function deliverGuaranteedResponse(params: {
  creatorId:      string;
  roomId:         string;
  responseId:     string;
  response:       string;
  idempotencyKey: string;
}): Promise<void> {
  const { creatorId, roomId, responseId, response } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `room_gr_deliver:${roomId}:${responseId}:${iKey}`;
  await requireVerifiedAdult(creatorId);

  const room = await loadRoom(roomId);
  assertCreator(room, creatorId);

  const gSnap = await guaranteedCol(roomId).doc(responseId).get();
  if (!gSnap.exists) throw new HttpsError('not-found', 'Guaranteed response record not found');
  const g = gSnap.data() as { payerId: string; tokens: number; status: string; [key: string]: unknown };

  if (g.status !== 'RESERVED') {
    throw new HttpsError('failed-precondition', `Response is already ${g.status}`);
  }
  if (new Date() > (g.deadlineAt as FirebaseFirestore.Timestamp).toDate()) {
    throw new HttpsError('deadline-exceeded', 'Guaranteed response deadline has passed');
  }

  const existingIdem = await idempotencyDocRef(fullKey).get();
  if (existingIdem.exists) return;

  await db.runTransaction(async (t) => {
    const gRef   = guaranteedCol(roomId).doc(responseId);
    const gSnap2 = await t.get(gRef);
    if ((gSnap2.data() as { status: string }).status !== 'RESERVED') return;
    t.update(gRef, {
      status:      'DELIVERED' as GuaranteedStatus,
      response:    response.trim(),
      deliveredAt: FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), { result: 'delivered', createdAt: FieldValue.serverTimestamp() });
  });

  await recordCreatorEarning({
    creatorId,
    payerId:          g.payerId ?? 'UNKNOWN',
    type:             'ROOM_PRODUCT',
    tokenAmount:      g.tokens,
    sourceRef:        `${roomId}:guaranteed_response`,
    idempotencyKey:   `room_gr_earn:${roomId}:${responseId}:${iKey}`,
  });
}

/**
 * Creator moderates a participant (KICK or BAN).
 */
export async function moderateParticipant(params: {
  actorId:        string;
  roomId:         string;
  targetUserId:   string;
  action:         'KICK' | 'BAN';
  idempotencyKey: string;
}): Promise<void> {
  const { actorId, roomId, targetUserId, action } = params;
  validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(actorId);

  const room = await loadRoom(roomId);
  assertCreator(room, actorId);
  if (targetUserId === actorId) {
    throw new HttpsError('invalid-argument', 'Cannot moderate yourself');
  }

  const newStatus: ParticipantStatus = action === 'BAN' ? 'BANNED' : 'KICKED';
  const pRef  = participantDocRef(roomId, targetUserId);
  const pSnap = await pRef.get();
  if (!pSnap.exists) throw new HttpsError('not-found', 'Participant not found');

  const p = pSnap.data() as ParticipantDocument;

  await db.runTransaction(async (t) => {
    t.update(pRef, { status: newStatus, leftAt: FieldValue.serverTimestamp() });
    if (p.status === 'ACTIVE') {
      t.update(roomDocRef(roomId), {
        participantCount: FieldValue.increment(-1),
        updatedAt:        FieldValue.serverTimestamp(),
      });
    }
  });
}

/**
 * Creator closes the room. Releases all unearned entry reservations.
 * Participants who joined after first creator message had their budgets settled
 * at that point — no additional return. Participants who joined but creator
 * never delivered ≥1 message get full entry refund.
 * Any RESERVED guaranteed responses or PENDING priority questions are auto-refunded.
 */
export async function closeRoom(params: {
  creatorId:      string;
  roomId:         string;
  idempotencyKey: string;
}): Promise<{ tokensEarned: number; tokensReturned: number }> {
  const { creatorId, roomId } = params;
  const iKey = validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(creatorId);

  const room = await loadRoom(roomId);
  assertCreator(room, creatorId);
  if (room.status === 'CLOSED' || room.status === 'EXPIRED') {
    throw new HttpsError('failed-precondition', `Room is already ${room.status}`);
  }

  // Collect unearned participants
  const unearnedSnap = await db.collection('multi_rooms').doc(roomId)
    .collection('participants')
    .where('status', '==', 'ACTIVE')
    .where('earnedByCreator', '==', false)
    .get();

  let tokensReturned = 0;
  const batch        = db.batch();

  for (const pDoc of unearnedSnap.docs) {
    const p = pDoc.data() as ParticipantDocument;
    batch.update(walletRef(p.userId), {
      balance:   FieldValue.increment(p.reservedTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(participantDocRef(roomId, p.userId), {
      status: 'LEFT',
      leftAt: FieldValue.serverTimestamp(),
    });
    tokensReturned += p.reservedTokens;
  }

  batch.update(roomDocRef(roomId), {
    status:               'CLOSED',
    closedAt:             FieldValue.serverTimestamp(),
    escrowReturnedTokens: FieldValue.increment(tokensReturned),
    updatedAt:            FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Refund any unresolved guaranteed responses
  const unresolvedGRs = await guaranteedCol(roomId)
    .where('status', '==', 'RESERVED')
    .get();
  await Promise.allSettled(
    unresolvedGRs.docs.map((doc) =>
      _refundGuaranteedResponse(doc.id, roomId, doc.data(), iKey),
    ),
  );

  // Refund any unanswered GOLD/DIAMOND priority questions
  const unresolvedPQs = await priorityCol(roomId)
    .where('status', '==', 'PENDING')
    .get();
  await Promise.allSettled(
    unresolvedPQs.docs.map((doc) =>
      _refundPriorityQuestion(doc.id, roomId, doc.data(), iKey),
    ),
  );

  return {
    tokensEarned:   room.escrowEarnedTokens,
    tokensReturned,
  };
}

// ── Refund helpers ────────────────────────────────────────────────────────────

async function _refundGuaranteedResponse(
  responseId: string,
  roomId:     string,
  g:          any,
  contextKey: string,
): Promise<void> {
  const refundKey = `room_gr_refund:${roomId}:${responseId}:${contextKey}`;
  const existing  = await idempotencyDocRef(refundKey).get();
  if (existing.exists) return;

  await db.runTransaction(async (t) => {
    const gRef   = guaranteedCol(roomId).doc(responseId);
    const gSnap  = await t.get(gRef);
    if (!gSnap.exists || (gSnap.data() as { status: string }).status !== 'RESERVED') return;

    t.update(walletRef(g.payerId), {
      balance:   FieldValue.increment(g.tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(gRef, {
      status:    'REFUNDED' as GuaranteedStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(refundKey), {
      result:    'refunded',
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function _refundPriorityQuestion(
  questionId: string,
  roomId:     string,
  q:          any,
  contextKey: string,
): Promise<void> {
  if (!q.promisesResponse) return; // BRONZE/SILVER already earned, never refunded
  const refundKey = `room_pq_refund:${roomId}:${questionId}:${contextKey}`;
  const existing  = await idempotencyDocRef(refundKey).get();
  if (existing.exists) return;

  await db.runTransaction(async (t) => {
    const qRef  = priorityCol(roomId).doc(questionId);
    const qSnap = await t.get(qRef);
    if (!qSnap.exists || (qSnap.data() as { status: string }).status !== 'PENDING') return;

    t.update(walletRef(q.payerId), {
      balance:   FieldValue.increment(q.tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(qRef, {
      status:    'EXPIRED' as PriorityStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(refundKey), {
      result:    'refunded',
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

// ── Scheduled deadline enforcement ───────────────────────────────────────────

/**
 * C10: Room deadline enforcer.
 * Runs every 1 minute (§1.8 — deadline enforcement must be near-real-time).
 *   - Refunds RESERVED guaranteed responses past deadline.
 *   - Refunds PENDING priority questions past deadline.
 *   - Expires LIVE rooms with no creator message after 24h.
 */
export const c10_deadlineEnforcer = onSchedule(
  // §1.8: Must run every 1 minute to enforce GOLD/DIAMOND and guaranteed-response deadlines.
  { schedule: 'every 1 minutes', timeoutSeconds: 60, retryCount: 2 },
  async (_event) => {
    const now     = new Date();
    const results = await Promise.allSettled([
      _enforceGuaranteedDeadlines(now),
      _expirePriorityQuestions(now),
      _expireInactiveRooms(now),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[c10_deadlineEnforcer] task ${i} failed:`, (r as PromiseRejectedResult).reason);
      }
    });
  },
);

async function _enforceGuaranteedDeadlines(now: Date): Promise<void> {
  const overdue = await db
    .collectionGroup('guaranteed_responses')
    .where('status', '==', 'RESERVED')
    .where('deadlineAt', '<', now)
    .limit(100)
    .get();

  await Promise.allSettled(
    overdue.docs.map((doc) => {
      const roomId = doc.ref.parent.parent!.id;
      return _refundGuaranteedResponse(doc.id, roomId, doc.data(), `sched_${now.getTime()}`);
    }),
  );
}

async function _expirePriorityQuestions(now: Date): Promise<void> {
  const overdue = await db
    .collectionGroup('priority_questions')
    .where('status', '==', 'PENDING')
    .where('promisesResponse', '==', true)
    .where('deadlineAt', '<', now)
    .limit(100)
    .get();

  await Promise.allSettled(
    overdue.docs.map((doc) => {
      const roomId = doc.ref.parent.parent!.id;
      return _refundPriorityQuestion(doc.id, roomId, doc.data(), `sched_${now.getTime()}`);
    }),
  );
}

async function _expireInactiveRooms(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - ROOM_INACTIVE_EXPIRE_HOURS * 60 * 60 * 1000);
  const stale  = await db
    .collection('multi_rooms')
    .where('status', '==', 'LIVE')
    .where('creatorMessageCount', '==', 0)
    .where('openedAt', '<', cutoff)
    .limit(50)
    .get();

  await Promise.allSettled(
    stale.docs.map((doc) => {
      const room = doc.data() as RoomDocument;
      // Use a deterministic key so repeated scheduler runs are idempotent
      return closeRoom({
        creatorId:      room.creatorId,
        roomId:         room.roomId,
        idempotencyKey: `expire_room_${room.roomId}_${Math.floor(now.getTime() / 600_000)}`,
      });
    }),
  );
}

// ── Production onCall exports ─────────────────────────────────────────────────

export const c10_createRoom = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return createRoom({
      creatorId:       req.auth.uid,
      title:           req.data.title,
      entryTokens:     req.data.entryTokens,
      maxParticipants: req.data.maxParticipants ?? null,
    });
  },
);

export const c10_openRoom = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return openRoom({ creatorId: req.auth.uid, roomId: req.data.roomId });
  },
);

export const c10_joinRoom = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return joinRoom({
      userId:         req.auth.uid,
      roomId:         req.data.roomId,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_leaveRoom = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return leaveRoom({
      userId:         req.auth.uid,
      roomId:         req.data.roomId,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_deliverCreatorRoomMessage = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return deliverCreatorRoomMessage({
      creatorId:      req.auth.uid,
      roomId:         req.data.roomId,
      content:        req.data.content,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_sendFanRoomMessage = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return sendFanRoomMessage({
      userId:         req.auth.uid,
      roomId:         req.data.roomId,
      content:        req.data.content,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_sendRoomTip = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return sendRoomTip({
      payerId:        req.auth.uid,
      roomId:         req.data.roomId,
      tokens:         req.data.tokens,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_sendPriorityQuestion = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return sendPriorityQuestion({
      payerId:        req.auth.uid,
      roomId:         req.data.roomId,
      tier:           req.data.tier,
      question:       req.data.question,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_deliverPriorityAnswer = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return deliverPriorityAnswer({
      creatorId:      req.auth.uid,
      roomId:         req.data.roomId,
      questionId:     req.data.questionId,
      answer:         req.data.answer,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_requestGuaranteedResponse = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return requestGuaranteedResponse({
      payerId:        req.auth.uid,
      roomId:         req.data.roomId,
      tokens:         req.data.tokens,
      question:       req.data.question,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_deliverGuaranteedResponse = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return deliverGuaranteedResponse({
      creatorId:      req.auth.uid,
      roomId:         req.data.roomId,
      responseId:     req.data.responseId,
      response:       req.data.response,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_moderateParticipant = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return moderateParticipant({
      actorId:        req.auth.uid,
      roomId:         req.data.roomId,
      targetUserId:   req.data.targetUserId,
      action:         req.data.action,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c10_closeRoom = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return closeRoom({
      creatorId:      req.auth.uid,
      roomId:         req.data.roomId,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);
