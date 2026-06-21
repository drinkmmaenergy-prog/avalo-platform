/**
 * ============================================================================
 * CANONICAL ROOM PARTICIPANT BILLING — B3
 * ============================================================================
 *
 * Replaces the message-threshold room earning model in canonicalMultiRoomV2.ts.
 *
 * KEY RULES (§3 — multi-room economy):
 *
 *  1. Room entry = refundable participant reservation (budget).
 *     MINIMUM: max(100, creatorConfiguredMinimumRoomEntryTokens)
 *     NOT automatically earned when creator speaks generally.
 *
 *  2. Per-participant state tracks:
 *     entryReservationTokens, remainingRoomBudgetTokens, roomSpentTokens,
 *     consentVersion, pricingPolicyVersion, entryTimestamp, exitTimestamp,
 *     stableRequestId.
 *
 *  3. Allowed earning events (A–F):
 *     A. Paid interaction   — creator delivers defined eligible response
 *     B. Tip                — immediate voluntary, no reply promise
 *     C. Bronze/Silver prio — immediate charge, queue placement only
 *     D. Gold/Diamond prio  — reserve → earn on eligible delivery
 *     E. Guaranteed resp.   — reserve → earn on delivery before deadline
 *     F. Private follow-up  — new private paid session (fresh acceptance)
 *
 *  4. Budget release triggers:
 *     participant leaves / room closes / room expires / participant banned /
 *     budget below next eligible charge price.
 *
 *  5. All operations are transaction-safe and idempotent.
 *
 *  6. Capacity and ban checks happen inside transactions.
 *
 *  7. Deadline scheduler runs every 1 minute.
 *
 * @module rooms/canonicalRoomParticipantBilling
 * @version 1.0.0
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError }               from 'firebase-functions/v2/https';
import { requireVerifiedAdult }     from '../compliance/ageGuard';
import {
  getCreatorRiskTier,
  computeHoldRelease,
  computeGrossUsd,
  CreatorEarningAccount,
} from '../creator/canonicalEarningService';

const db = getFirestore();

// ── Collection paths ─────────────────────────────────────────────────────────

const MULTI_ROOMS              = 'multi_rooms';
const ROOM_PARTICIPANTS        = 'participants';
const ROOM_MESSAGES            = 'messages';
const ROOM_EARNING_EVENTS      = 'roomEarningEvents';
const ROOM_BUDGET_RELEASES     = 'roomBudgetReleases';
const CREATOR_EARNING_ACCOUNTS = 'creatorEarningAccounts';
const CREATOR_EARNING_LEDGER   = 'creatorEarningLedger';
const BILLING_EVENTS           = 'billingEvents';
const WALLETS                  = 'wallets';
const IDEMPOTENCY_COL          = '_idempotency';

// ── Constants ────────────────────────────────────────────────────────────────

export const ROOM_ENTRY_MINIMUM_TOKENS    = 100;
export const ROOM_DEADLINE_WINDOW_MS      = 10 * 60 * 1000; // 10min for gold/diamond/guaranteed

// ── Types ────────────────────────────────────────────────────────────────────

export type RoomEarningEventType =
  | 'PAID_INTERACTION'      // A: explicit eligible creator response
  | 'TIP'                   // B: voluntary, immediate
  | 'PRIORITY_BRONZE'       // C: bronze/silver queue placement, immediate
  | 'PRIORITY_SILVER'       // C: bronze/silver queue placement, immediate
  | 'PRIORITY_GOLD_RESERVE' // D: gold reserve (earn on delivery)
  | 'PRIORITY_DIAMOND_RESERVE' // D: diamond reserve (earn on delivery)
  | 'GUARANTEED_RESERVE'    // E: guaranteed response reserve
  | 'PRIVATE_FOLLOWUP';     // F: opens private session

export type RoomBudgetReleaseReason =
  | 'PARTICIPANT_LEFT'
  | 'ROOM_CLOSED'
  | 'ROOM_EXPIRED'
  | 'PARTICIPANT_BANNED'
  | 'BUDGET_UNUSABLE'
  | 'DEADLINE_EXPIRED';

export interface RoomParticipantState {
  uid:                     string;
  roomId:                  string;
  stableRequestId:         string;  // idempotency key for entry
  entryReservationTokens:  number;  // initial reservation (≥ 100)
  remainingRoomBudgetTokens: number;
  roomSpentTokens:         number;
  consentVersion:          string;
  pricingPolicyVersion:    string;
  entryTimestamp:          any;  // Firestore Timestamp
  exitTimestamp:           any | null;
  status:                  'ACTIVE' | 'LEFT' | 'BANNED' | 'BUDGET_EXHAUSTED';
  earnedByCreator:         boolean;  // deprecated — replaced by explicit earning events
}

export interface RoomEarningEvent {
  eventId:         string;
  roomId:          string;
  participantId:   string;    // fan who is charged
  creatorId:       string;
  type:            RoomEarningEventType;
  tokensCharged:   number;    // deducted from participant's remainingRoomBudgetTokens
  creatorEarned:   number;    // credited to creator earning account (may differ if platform fee)
  idempotencyKey:  string;
  deliveredAt:     any | null; // null if pending delivery (reserved)
  reservationId:   string | null;
  deadlineAt:      any | null; // for reserved events — refund if not delivered by this time
  status:          'CHARGED' | 'RESERVED' | 'DELIVERED' | 'REFUNDED';
  createdAt:       any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function participantRef(roomId: string, uid: string) {
  return db.collection(MULTI_ROOMS).doc(roomId)
    .collection(ROOM_PARTICIPANTS).doc(uid);
}

function roomRef(roomId: string) {
  return db.collection(MULTI_ROOMS).doc(roomId);
}

function earningEventRef(roomId: string, eventId: string) {
  return db.collection(MULTI_ROOMS).doc(roomId)
    .collection(ROOM_EARNING_EVENTS).doc(eventId);
}

async function loadParticipant(roomId: string, uid: string): Promise<RoomParticipantState> {
  const snap = await participantRef(roomId, uid).get();
  if (!snap.exists) throw new HttpsError('not-found', `Participant ${uid} not in room ${roomId}`);
  return snap.data() as RoomParticipantState;
}

// ── Entry / exit ─────────────────────────────────────────────────────────────

/**
 * Enter a room. Reserves tokens from fan wallet as refundable budget.
 * MINIMUM = max(100, creatorConfiguredMinimum).
 * No creator earnings at entry — only when eligible products are delivered.
 */
export async function enterRoom(params: {
  roomId:           string;
  participantId:    string;
  creatorId:        string;
  reservationTokens: number;  // must be ≥ max(100, creatorConfiguredMinimum)
  consentVersion:   string;
  pricingPolicyVersion: string;
  stableRequestId:  string;   // idempotency: same request = safe retry
  creatorConfiguredMinimum?: number;
}): Promise<RoomParticipantState> {
  const {
    roomId, participantId, creatorId, reservationTokens,
    consentVersion, pricingPolicyVersion, stableRequestId,
    creatorConfiguredMinimum = 0,
  } = params;

  // Age guard
  await requireVerifiedAdult(participantId);
  await requireVerifiedAdult(creatorId);

  const effectiveMinimum = Math.max(ROOM_ENTRY_MINIMUM_TOKENS, creatorConfiguredMinimum);
  if (reservationTokens < effectiveMinimum) {
    throw new HttpsError('invalid-argument',
      `ROOM_ENTRY_MINIMUM: Need at least ${effectiveMinimum} tokens, got ${reservationTokens}`);
  }

  // Idempotency
  const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_entry:${roomId}:${stableRequestId}`);
  const iSnap = await iRef.get();
  if (iSnap.exists) {
    const p = await loadParticipant(roomId, participantId);
    return p;
  }

  return db.runTransaction(async (t) => {
    // Capacity / ban check
    // Room document — canonical fields used below: budget, participantBudget, priceTokens
    const room = (await t.get(roomRef(roomId))).data() as {
      status?: string;
      bannedUsers?: string[];
      activeParticipantCount?: number;
      maxCapacity?: number;
      participantBudget?: number;
      budget?: number;
      priceTokens?: number;
      [key: string]: unknown;
    };
    if (!room) throw new HttpsError('not-found', `Room ${roomId} not found`);
    if (room.status === 'CLOSED') throw new HttpsError('failed-precondition', 'Room is closed');
    if (room.bannedUsers?.includes(participantId)) {
      throw new HttpsError('permission-denied', 'You are banned from this room');
    }
    const currentParticipants = room.activeParticipantCount ?? 0;
    const maxCapacity         = room.maxCapacity ?? 100;
    if (currentParticipants >= maxCapacity) {
      throw new HttpsError('resource-exhausted', 'Room is at capacity');
    }

    // Debit fan wallet
    const fanWalletRef  = db.collection(WALLETS).doc(participantId);
    const fanWalletSnap = await t.get(fanWalletRef);
    const fanBalance    = fanWalletSnap.exists ? (fanWalletSnap.data()!.balance as number) : 0;
    if (fanBalance < reservationTokens) {
      throw new HttpsError('failed-precondition',
        `INSUFFICIENT_BALANCE: need ${reservationTokens}, have ${fanBalance}`);
    }
    t.update(fanWalletRef, { balance: FieldValue.increment(-reservationTokens) });

    // Increment room reservation escrow
    t.update(roomRef(roomId), {
      escrowReservedTokens:   FieldValue.increment(reservationTokens),
      activeParticipantCount: FieldValue.increment(1),
      updatedAt:              FieldValue.serverTimestamp(),
    });

    // Create participant document
    const participant: RoomParticipantState = {
      uid:                      participantId,
      roomId,
      stableRequestId,
      entryReservationTokens:   reservationTokens,
      remainingRoomBudgetTokens: reservationTokens,
      roomSpentTokens:          0,
      consentVersion,
      pricingPolicyVersion,
      entryTimestamp:           FieldValue.serverTimestamp(),
      exitTimestamp:            null,
      status:                   'ACTIVE',
      earnedByCreator:          false,  // deprecated field kept for compat
    };
    t.set(participantRef(roomId, participantId), participant);

    // Idempotency sentinel
    t.set(iRef, { roomId, participantId, createdAt: FieldValue.serverTimestamp() });

    return participant;
  });
}

/**
 * Release a participant's remaining room budget back to their wallet.
 * Called on: leave, close, expire, ban, budget-unusable.
 * Safe to call multiple times — idempotent.
 */
export async function releaseParticipantBudget(params: {
  roomId:          string;
  participantId:   string;
  reason:          RoomBudgetReleaseReason;
  idempotencyKey:  string;
}): Promise<{ tokensReleased: number }> {
  const { roomId, participantId, reason, idempotencyKey } = params;

  const releaseRef = db.collection(MULTI_ROOMS).doc(roomId)
    .collection(ROOM_BUDGET_RELEASES).doc(idempotencyKey);
  const existing = await releaseRef.get();
  if (existing.exists) {
    return { tokensReleased: (existing.data() as { tokensReleased?: number }).tokensReleased ?? 0 };
  }

  return db.runTransaction(async (t) => {
    const pRef  = participantRef(roomId, participantId);
    const pSnap = await t.get(pRef);
    if (!pSnap.exists) return { tokensReleased: 0 }; // already gone

    const p = pSnap.data() as RoomParticipantState;
    const tokensToRelease = p.remainingRoomBudgetTokens;

    if (tokensToRelease <= 0) {
      // Nothing to release
      t.set(releaseRef, { roomId, participantId, tokensReleased: 0, reason,
        createdAt: FieldValue.serverTimestamp() });
      return { tokensReleased: 0 };
    }

    // Return budget to fan wallet
    const fanWalletRef = db.collection(WALLETS).doc(participantId);
    const fanSnap      = await t.get(fanWalletRef);
    if (fanSnap.exists) {
      t.update(fanWalletRef, { balance: FieldValue.increment(tokensToRelease) });
    } else {
      t.set(fanWalletRef, { balance: tokensToRelease, uid: participantId,
        createdAt: FieldValue.serverTimestamp() });
    }

    // Update participant record
    const exitStatus = reason === 'PARTICIPANT_BANNED' ? 'BANNED' : 'LEFT';
    t.update(pRef, {
      remainingRoomBudgetTokens: 0,
      exitTimestamp:             FieldValue.serverTimestamp(),
      status:                    exitStatus,
      updatedAt:                 FieldValue.serverTimestamp(),
    });

    // Decrement room escrow
    t.update(roomRef(roomId), {
      escrowReservedTokens:   FieldValue.increment(-tokensToRelease),
      activeParticipantCount: FieldValue.increment(-1),
      updatedAt:              FieldValue.serverTimestamp(),
    });

    // Idempotency record
    t.set(releaseRef, { roomId, participantId, tokensReleased: tokensToRelease,
      reason, createdAt: FieldValue.serverTimestamp() });

    return { tokensReleased: tokensToRelease };
  });
}

// ── Earning event types ───────────────────────────────────────────────────────

/**
 * Event A: Creator delivers an eligible paid room interaction.
 * Charges participant's remaining budget. Creator earns immediately.
 * Only valid if participant has sufficient remaining budget.
 */
export async function chargeRoomPaidInteraction(params: {
  roomId:          string;
  participantId:   string;
  creatorId:       string;
  tokensToCharge:  number;
  idempotencyKey:  string;
  interactionRef:  string;  // e.g. messageId
}): Promise<RoomEarningEvent> {
  const { roomId, participantId, creatorId, tokensToCharge, idempotencyKey, interactionRef } = params;

  if (!Number.isInteger(tokensToCharge) || tokensToCharge <= 0) {
    throw new HttpsError('invalid-argument', 'tokensToCharge must be a positive integer');
  }

  const riskTier   = await getCreatorRiskTier(creatorId, db);
  const holdsUntil = computeHoldRelease(riskTier);

  return db.runTransaction(async (t) => {
    // Idempotency
    const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_charge:${idempotencyKey}`);
    const iSnap = await t.get(iRef);
    if (iSnap.exists) {
      const existing = await t.get(earningEventRef(roomId, (iSnap.data() as { eventId: string }).eventId));
      return existing.data() as RoomEarningEvent;
    }

    // Check participant budget
    const pRef  = participantRef(roomId, participantId);
    const pSnap = await t.get(pRef);
    if (!pSnap.exists) throw new HttpsError('not-found', 'Participant not in room');
    const p = pSnap.data() as RoomParticipantState;
    if (p.status !== 'ACTIVE') throw new HttpsError('failed-precondition', `Participant is ${p.status}`);
    if (p.remainingRoomBudgetTokens < tokensToCharge) {
      throw new HttpsError('failed-precondition',
        `BUDGET_INSUFFICIENT: ${p.remainingRoomBudgetTokens} remaining, need ${tokensToCharge}`);
    }

    const eventId = db.collection(MULTI_ROOMS).doc(roomId)
      .collection(ROOM_EARNING_EVENTS).doc().id;

    // Update participant budget
    const newRemaining = p.remainingRoomBudgetTokens - tokensToCharge;
    t.update(pRef, {
      remainingRoomBudgetTokens: newRemaining,
      roomSpentTokens:           FieldValue.increment(tokensToCharge),
      ...(newRemaining <= 0 && { status: 'BUDGET_EXHAUSTED' }),
      updatedAt:                 FieldValue.serverTimestamp(),
    });

    // Credit creator earning account
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const accountSnap = await t.get(accountRef);
    if (!accountSnap.exists) {
      t.set(accountRef, {
        creatorId,
        pendingEarningTokens:          tokensToCharge,
        availableEarningTokens: 0,
        reservedEarningTokens:  0,
        paidOutEarningTokens:   0,
        lifetimeEarnedTokens:   tokensToCharge,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      } as CreatorEarningAccount);
    } else {
      t.update(accountRef, {
        pendingEarningTokens:        FieldValue.increment(tokensToCharge),
        lifetimeEarnedTokens: FieldValue.increment(tokensToCharge),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // Earning ledger entry
    const ledgerEntryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    t.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId:          ledgerEntryId,
      creatorId,
      payerId:          participantId,
      type:             'ROOM_PRODUCT',
      tokenAmount:      tokensToCharge,
      grossUsd:         computeGrossUsd(tokensToCharge),
      idempotencyKey,
      riskTierSnapshot: riskTier,
      holdsUntil,
      sourceRef:        interactionRef,
      sessionId:        roomId,
      createdAt:        FieldValue.serverTimestamp(),
    });

    // Billing event
    t.set(db.collection(BILLING_EVENTS).doc(idempotencyKey), {
      eventId:              idempotencyKey,
      payerId:              participantId,
      creatorId,
      type:                 'ROOM_PRODUCT',
      payerTokensCharged:   tokensToCharge,
      creatorEarningTokens: tokensToCharge,
      sessionId:            roomId,
      idempotencyKey,
      sourceRef:            interactionRef,
      createdAt:            FieldValue.serverTimestamp(),
    });

    // Earning event document
    const earningEvent: RoomEarningEvent = {
      eventId, roomId, participantId, creatorId,
      type:           'PAID_INTERACTION',
      tokensCharged:  tokensToCharge,
      creatorEarned:  tokensToCharge,
      idempotencyKey,
      deliveredAt:    FieldValue.serverTimestamp(),
      reservationId:  null, deadlineAt: null,
      status:         'DELIVERED',
      createdAt:      FieldValue.serverTimestamp(),
    };
    t.set(earningEventRef(roomId, eventId), earningEvent);
    t.set(iRef, { eventId, createdAt: FieldValue.serverTimestamp() });

    return earningEvent;
  });
}

/**
 * Event B: Fan sends a tip.
 * Immediate charge, immediate creator earning. No reply promise.
 */
export async function chargeRoomTip(params: {
  roomId:         string;
  participantId:  string;
  creatorId:      string;
  tipTokens:      number;
  idempotencyKey: string;
}): Promise<RoomEarningEvent> {
  // Tips charge fan wallet directly (not from room budget reservation)
  const { roomId, participantId, creatorId, tipTokens, idempotencyKey } = params;

  await requireVerifiedAdult(participantId);
  if (!Number.isInteger(tipTokens) || tipTokens < 1) {
    throw new HttpsError('invalid-argument', 'tipTokens must be a positive integer');
  }

  const riskTier   = await getCreatorRiskTier(creatorId, db);
  const holdsUntil = computeHoldRelease(riskTier);

  return db.runTransaction(async (t) => {
    const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_tip:${idempotencyKey}`);
    const iSnap = await t.get(iRef);
    if (iSnap.exists) {
      const existing = await t.get(earningEventRef(roomId, (iSnap.data() as { eventId: string }).eventId));
      return existing.data() as RoomEarningEvent;
    }

    // Debit fan wallet (tips from wallet, not room budget)
    const fanWalletRef  = db.collection(WALLETS).doc(participantId);
    const fanWalletSnap = await t.get(fanWalletRef);
    const fanBalance    = fanWalletSnap.exists ? (fanWalletSnap.data()!.balance as number) : 0;
    if (fanBalance < tipTokens) {
      throw new HttpsError('failed-precondition', `INSUFFICIENT_BALANCE: need ${tipTokens}, have ${fanBalance}`);
    }
    t.update(fanWalletRef, { balance: FieldValue.increment(-tipTokens) });

    // Credit creator earning
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const accountSnap = await t.get(accountRef);
    if (!accountSnap.exists) {
      t.set(accountRef, {
        creatorId, pendingEarningTokens: tipTokens, availableEarningTokens: 0,
        reservedEarningTokens: 0, paidOutEarningTokens: 0, lifetimeEarnedTokens: tipTokens,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      t.update(accountRef, {
        pendingEarningTokens:        FieldValue.increment(tipTokens),
        lifetimeEarnedTokens: FieldValue.increment(tipTokens),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // Earning ledger + billing event
    const ledgerEntryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    t.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId: ledgerEntryId, creatorId, payerId: participantId, type: 'TIP',
      tokenAmount: tipTokens, grossUsd: computeGrossUsd(tipTokens),
      idempotencyKey, riskTierSnapshot: riskTier, holdsUntil, sessionId: roomId,
      createdAt: FieldValue.serverTimestamp(),
    });
    t.set(db.collection(BILLING_EVENTS).doc(idempotencyKey), {
      eventId: idempotencyKey, payerId: participantId, creatorId, type: 'TIP',
      payerTokensCharged: tipTokens, creatorEarningTokens: tipTokens,
      sessionId: roomId, idempotencyKey, createdAt: FieldValue.serverTimestamp(),
    });

    const eventId = db.collection(MULTI_ROOMS).doc(roomId).collection(ROOM_EARNING_EVENTS).doc().id;
    const earningEvent: RoomEarningEvent = {
      eventId, roomId, participantId, creatorId, type: 'TIP',
      tokensCharged: tipTokens, creatorEarned: tipTokens, idempotencyKey,
      deliveredAt: FieldValue.serverTimestamp(), reservationId: null, deadlineAt: null,
      status: 'DELIVERED', createdAt: FieldValue.serverTimestamp(),
    };
    t.set(earningEventRef(roomId, eventId), earningEvent);
    t.set(iRef, { eventId, createdAt: FieldValue.serverTimestamp() });

    return earningEvent;
  });
}

/**
 * Event D/E: Reserve tokens for Gold/Diamond priority or guaranteed response.
 * Creator earns ONLY after delivering an eligible answer before the deadline.
 * If deadline passes without delivery, refundRoomReservation() is called automatically.
 */
export async function reserveRoomInteraction(params: {
  roomId:          string;
  participantId:   string;
  creatorId:       string;
  reserveTokens:   number;
  type:            'PRIORITY_GOLD_RESERVE' | 'PRIORITY_DIAMOND_RESERVE' | 'GUARANTEED_RESERVE';
  deadlineMs:      number;    // ms from now until deadline
  idempotencyKey:  string;
}): Promise<RoomEarningEvent> {
  const { roomId, participantId, creatorId, reserveTokens, type, deadlineMs, idempotencyKey } = params;

  return db.runTransaction(async (t) => {
    const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_reserve:${idempotencyKey}`);
    const iSnap = await t.get(iRef);
    if (iSnap.exists) {
      const existing = await t.get(earningEventRef(roomId, (iSnap.data() as { eventId: string }).eventId));
      return existing.data() as RoomEarningEvent;
    }

    // Check participant budget
    const pRef  = participantRef(roomId, participantId);
    const pSnap = await t.get(pRef);
    if (!pSnap.exists) throw new HttpsError('not-found', 'Participant not in room');
    const p = pSnap.data() as RoomParticipantState;
    if (p.remainingRoomBudgetTokens < reserveTokens) {
      throw new HttpsError('failed-precondition', 'BUDGET_INSUFFICIENT');
    }

    const deadlineAt = new Date(Date.now() + deadlineMs);
    const eventId    = db.collection(MULTI_ROOMS).doc(roomId)
      .collection(ROOM_EARNING_EVENTS).doc().id;

    // Earmark from remaining budget (not yet credited to creator)
    t.update(pRef, {
      remainingRoomBudgetTokens: FieldValue.increment(-reserveTokens),
      updatedAt:                 FieldValue.serverTimestamp(),
    });

    const earningEvent: RoomEarningEvent = {
      eventId, roomId, participantId, creatorId, type,
      tokensCharged:  reserveTokens,
      creatorEarned:  0,  // earned only on delivery
      idempotencyKey,
      deliveredAt:    null,
      reservationId:  idempotencyKey,
      deadlineAt,
      status:         'RESERVED',
      createdAt:      FieldValue.serverTimestamp(),
    };
    t.set(earningEventRef(roomId, eventId), earningEvent);
    t.set(iRef, { eventId, createdAt: FieldValue.serverTimestamp() });

    return earningEvent;
  });
}

/**
 * Deliver a reserved room interaction (Gold/Diamond/Guaranteed).
 * Creator earns the reserved tokens with hold period.
 * Must be called before deadlineAt.
 */
export async function deliverReservedRoomInteraction(params: {
  roomId:         string;
  eventId:        string;
  creatorId:      string;
  idempotencyKey: string;
}): Promise<{ tokensEarned: number }> {
  const { roomId, eventId, creatorId, idempotencyKey } = params;

  const riskTier   = await getCreatorRiskTier(creatorId, db);
  const holdsUntil = computeHoldRelease(riskTier);

  return db.runTransaction(async (t) => {
    const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_deliver:${idempotencyKey}`);
    const iSnap = await t.get(iRef);
    if (iSnap.exists) {
      return { tokensEarned: (iSnap.data() as { tokensEarned?: number }).tokensEarned ?? 0 };
    }

    const evRef  = earningEventRef(roomId, eventId);
    const evSnap = await t.get(evRef);
    if (!evSnap.exists) throw new HttpsError('not-found', 'Earning event not found');
    const ev = evSnap.data() as RoomEarningEvent;

    if (ev.status !== 'RESERVED') {
      throw new HttpsError('failed-precondition', `Event is ${ev.status}, not RESERVED`);
    }
    if (ev.creatorId !== creatorId) {
      throw new HttpsError('permission-denied', 'Not the creator for this event');
    }

    const now = Date.now();
    if (ev.deadlineAt && now > (ev.deadlineAt instanceof Date ? ev.deadlineAt.getTime() : ev.deadlineAt.toMillis())) {
      throw new HttpsError('deadline-exceeded', 'Delivery deadline has passed — reservation will be refunded');
    }

    const tokensEarned = ev.tokensCharged;

    // Credit creator earning
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const accountSnap = await t.get(accountRef);
    if (!accountSnap.exists) {
      t.set(accountRef, {
        creatorId, pendingEarningTokens: tokensEarned, availableEarningTokens: 0,
        reservedEarningTokens: 0, paidOutEarningTokens: 0, lifetimeEarnedTokens: tokensEarned,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      t.update(accountRef, {
        pendingEarningTokens:        FieldValue.increment(tokensEarned),
        lifetimeEarnedTokens: FieldValue.increment(tokensEarned),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // Earning ledger
    const ledgerEntryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    t.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId: ledgerEntryId, creatorId, payerId: ev.participantId, type: 'ROOM_PRODUCT',
      tokenAmount: tokensEarned, grossUsd: computeGrossUsd(tokensEarned),
      idempotencyKey, riskTierSnapshot: riskTier, holdsUntil, sessionId: roomId,
      sourceRef: eventId, createdAt: FieldValue.serverTimestamp(),
    });

    // Billing event
    t.set(db.collection(BILLING_EVENTS).doc(idempotencyKey), {
      eventId: idempotencyKey, payerId: ev.participantId, creatorId, type: 'ROOM_PRODUCT',
      payerTokensCharged: tokensEarned, creatorEarningTokens: tokensEarned,
      sessionId: roomId, idempotencyKey, sourceRef: eventId,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Mark event as DELIVERED
    t.update(evRef, {
      status: 'DELIVERED', deliveredAt: FieldValue.serverTimestamp(),
      creatorEarned: tokensEarned, updatedAt: FieldValue.serverTimestamp(),
    });

    t.set(iRef, { tokensEarned, createdAt: FieldValue.serverTimestamp() });
    return { tokensEarned };
  });
}

/**
 * Refund a reserved room interaction (deadline expired or admin refund).
 * Returns reserved tokens to participant's room budget or wallet.
 * Idempotent — safe to call multiple times.
 */
export async function refundRoomReservation(params: {
  roomId:         string;
  eventId:        string;
  idempotencyKey: string;
  returnToWallet: boolean;  // true=wallet, false=room budget (if still ACTIVE)
}): Promise<{ tokensRefunded: number }> {
  const { roomId, eventId, idempotencyKey, returnToWallet } = params;

  return db.runTransaction(async (t) => {
    const iRef  = db.collection(IDEMPOTENCY_COL).doc(`room_refund:${idempotencyKey}`);
    const iSnap = await t.get(iRef);
    if (iSnap.exists) {
      return { tokensRefunded: (iSnap.data() as { tokensRefunded?: number }).tokensRefunded ?? 0 };
    }

    const evRef  = earningEventRef(roomId, eventId);
    const evSnap = await t.get(evRef);
    if (!evSnap.exists) return { tokensRefunded: 0 };
    const ev = evSnap.data() as RoomEarningEvent;

    if (ev.status !== 'RESERVED') {
      // Already delivered or refunded
      t.set(iRef, { tokensRefunded: 0, createdAt: FieldValue.serverTimestamp() });
      return { tokensRefunded: 0 };
    }

    const tokensToRefund = ev.tokensCharged;

    if (returnToWallet) {
      // Return to fan wallet
      const fanWalletRef  = db.collection(WALLETS).doc(ev.participantId);
      const fanWalletSnap = await t.get(fanWalletRef);
      if (fanWalletSnap.exists) {
        t.update(fanWalletRef, { balance: FieldValue.increment(tokensToRefund) });
      } else {
        t.set(fanWalletRef, { balance: tokensToRefund, uid: ev.participantId,
          createdAt: FieldValue.serverTimestamp() });
      }
    } else {
      // Return to room budget
      const pRef  = participantRef(roomId, ev.participantId);
      const pSnap = await t.get(pRef);
      if (pSnap.exists && (pSnap.data() as RoomParticipantState).status === 'ACTIVE') {
        t.update(pRef, {
          remainingRoomBudgetTokens: FieldValue.increment(tokensToRefund),
          updatedAt:                 FieldValue.serverTimestamp(),
        });
      } else {
        // Participant already left — refund to wallet
        const fanWalletRef  = db.collection(WALLETS).doc(ev.participantId);
        const fanWalletSnap = await t.get(fanWalletRef);
        if (fanWalletSnap.exists) {
          t.update(fanWalletRef, { balance: FieldValue.increment(tokensToRefund) });
        } else {
          t.set(fanWalletRef, { balance: tokensToRefund, uid: ev.participantId,
            createdAt: FieldValue.serverTimestamp() });
        }
      }
    }

    t.update(evRef, { status: 'REFUNDED', updatedAt: FieldValue.serverTimestamp() });
    t.set(iRef, { tokensRefunded: tokensToRefund, createdAt: FieldValue.serverTimestamp() });

    return { tokensRefunded: tokensToRefund };
  });
}

/**
 * Deadline sweep: find all RESERVED events past their deadlineAt and refund them.
 * Called by the 1-minute scheduler.
 * Each refund is idempotent — safe to retry.
 */
export async function sweepExpiredRoomReservations(roomId: string): Promise<{
  refunded: number; totalTokensRefunded: number;
}> {
  const now = new Date();
  const expiredSnap = await db.collection(MULTI_ROOMS).doc(roomId)
    .collection(ROOM_EARNING_EVENTS)
    .where('status', '==', 'RESERVED')
    .where('deadlineAt', '<', now)
    .limit(50)
    .get();

  let refunded = 0;
  let totalTokensRefunded = 0;

  await Promise.allSettled(
    expiredSnap.docs.map(async (doc) => {
      const ev = doc.data() as RoomEarningEvent;
      const result = await refundRoomReservation({
        roomId,
        eventId:        ev.eventId,
        idempotencyKey: `sweep_refund:${ev.eventId}`,
        returnToWallet: false,
      });
      refunded++;
      totalTokensRefunded += result.tokensRefunded;
    }),
  );

  return { refunded, totalTokensRefunded };
}
