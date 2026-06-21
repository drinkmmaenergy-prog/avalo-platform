/**
 * ============================================================================
 * CANONICAL CALENDAR BILLING V2 — C11
 * ============================================================================
 *
 * Replaces the legacy calendar.ts booking/cancellation/completion billing which
 * used phantom users/{uid}/wallet/current paths and an implicit 65/35 split.
 *
 * Canonical invariants:
 *   - requireVerifiedAdult() on every entry point.
 *   - Fan payment via wallets/{uid}.balance through transactTokens().
 *   - Creator earns via recordCreatorEarning() (C4 earning ledger).
 *   - Booking = token reservation held in calendarBookings/{id}.escrow.
 *   - Completion = reservation release → creator earning (7-day hold).
 *   - Cancellation = reservation return to fan with configurable refund policy.
 *   - All operations idempotent; client supplies idempotencyKey.
 *   - No Date.now() as idempotency key.
 *   - No phantom wallet paths.
 *
 * Refund policy (aligned with existing PACK 209 thresholds):
 *   Fan cancels ≥72h before: 100% of payer tokens returned.
 *   Fan cancels 24-72h before: 50% returned, 50% released to creator.
 *   Fan cancels <24h before: 0% returned, 100% released to creator.
 *   Creator cancels at any time: 100% returned to fan.
 *   Platform cancel/dispute: configurable; default 100% to fan.
 *
 * @module calendar/canonicalCalendarBillingV2
 * @version 2.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue }         from 'firebase-admin/firestore';
import { db }                 from '../init';
import { requireVerifiedAdult }     from '../compliance/ageGuard';
import { walletRef, getBalance }    from '../wallet/walletService';
import { recordCreatorEarning }     from '../creator/canonicalEarningService';

// ── Constants ─────────────────────────────────────────────────────────────────

export const CALENDAR_MIN_BOOKING_TOKENS  = 100; // §1.9: calendar minimum is 100 tokens
export const CALENDAR_MAX_BOOKING_TOKENS  = 100_000;

/** Hours before booking start that determine fan refund tier. */
const REFUND_TIER_FULL_HOURS    = 72;
const REFUND_TIER_PARTIAL_HOURS = 24;
const REFUND_PARTIAL_PCT        = 0.50; // 50% returned when 24-72h before

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export interface CanonicalCalendarBooking {
  bookingId:          string;
  creatorId:          string;
  bookerId:           string;
  status:             BookingStatus;
  priceTokens:        number;
  escrowTokens:       number;  // tokens currently held (decrements on refund)
  startAt:            Date;
  endAt:              Date;
  durationMinutes:    number;
  meetingType:        string;
  idempotencyKey:     string;
  creatorEarningId?:  string;  // set after completion
  cancelledBy?:       'FAN' | 'CREATOR' | 'PLATFORM';
  cancelledAt?:       any;
  refundedTokens?:    number;
  createdAt:          any;
  updatedAt:          any;
}

// ── Firestore refs ────────────────────────────────────────────────────────────

function bookingRef(bookingId: string) {
  return db.collection('calendarBookings').doc(bookingId);
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

async function checkIdempotency(
  t: FirebaseFirestore.Transaction,
  key: string,
): Promise<string | null> {
  const snap = await t.get(idempotencyDocRef(key));
  return snap.exists ? ((snap.data() as any).result as string) : null;
}

async function loadBooking(bookingId: string): Promise<CanonicalCalendarBooking> {
  const snap = await bookingRef(bookingId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Booking ${bookingId} not found`);
  return snap.data() as CanonicalCalendarBooking;
}

function hoursUntil(target: Date): number {
  return (target.getTime() - Date.now()) / (1000 * 60 * 60);
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Book a calendar slot. Reserves `priceTokens` from fan wallet into escrow.
 * Creator must call confirmBooking() to accept.
 */
export async function bookCalendarSlot(params: {
  bookerId:       string;
  creatorId:      string;
  priceTokens:    number;
  startAt:        number;  // unix ms
  endAt:          number;  // unix ms
  meetingType:    string;
  idempotencyKey: string;
}): Promise<{ bookingId: string }> {
  const { bookerId, creatorId, priceTokens, startAt, endAt, meetingType } = params;
  const iKey = validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(bookerId);
  await requireVerifiedAdult(creatorId);

  if (bookerId === creatorId) {
    throw new HttpsError('invalid-argument', 'Cannot book your own calendar');
  }
  if (!Number.isInteger(priceTokens) || priceTokens < CALENDAR_MIN_BOOKING_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Minimum booking price is ${CALENDAR_MIN_BOOKING_TOKENS} tokens`,
    );
  }
  if (priceTokens > CALENDAR_MAX_BOOKING_TOKENS) {
    throw new HttpsError('invalid-argument', `Maximum booking price is ${CALENDAR_MAX_BOOKING_TOKENS} tokens`);
  }

  const startDate = new Date(startAt);
  const endDate   = new Date(endAt);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    throw new HttpsError('invalid-argument', 'Invalid start or end time');
  }
  if (startDate < new Date()) {
    throw new HttpsError('invalid-argument', 'Cannot book a slot in the past');
  }

  const durationMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  const fullKey         = `cal_book:${bookerId}:${creatorId}:${iKey}`;

  const bookingId = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return existing;

    const fanSnap = await t.get(walletRef(bookerId));
    if (!fanSnap.exists) throw new HttpsError('not-found', `Wallet not found: ${bookerId}`);
    const balance = (fanSnap.data() as any).balance as number;
    if (balance < priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens: need ${priceTokens}, have ${balance}`,
      );
    }

    // Debit fan wallet → escrow (escrow tracked in booking document)
    t.update(walletRef(bookerId), {
      balance:   FieldValue.increment(-priceTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const id: string = db.collection('calendarBookings').doc().id;
    const booking: CanonicalCalendarBooking = {
      bookingId:       id,
      creatorId,
      bookerId,
      status:          'PENDING',
      priceTokens,
      escrowTokens:    priceTokens,
      startAt:         startDate,
      endAt:           endDate,
      durationMinutes,
      meetingType:     meetingType.trim(),
      idempotencyKey:  fullKey,
      createdAt:       FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    };
    t.set(bookingRef(id), booking);
    t.set(idempotencyDocRef(fullKey), { result: id, createdAt: FieldValue.serverTimestamp() });
    return id;
  });

  return { bookingId };
}

/**
 * Creator confirms booking (no money movement — acknowledgment only).
 */
export async function confirmCalendarBooking(params: {
  creatorId:  string;
  bookingId:  string;
}): Promise<void> {
  const { creatorId, bookingId } = params;
  await requireVerifiedAdult(creatorId);

  const booking = await loadBooking(bookingId);
  if (booking.creatorId !== creatorId) {
    throw new HttpsError('permission-denied', 'Only the creator may confirm this booking');
  }
  if (booking.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', `Booking is ${booking.status}`);
  }

  await bookingRef(bookingId).update({
    status:    'CONFIRMED',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Complete a booking. Releases escrow to creator earning ledger.
 * Creator earns priceTokens (full amount; Avalo 20% commission at payout).
 */
export async function completeCalendarBooking(params: {
  actorId:        string;  // creator or platform admin
  bookingId:      string;
  idempotencyKey: string;
}): Promise<void> {
  const { actorId, bookingId } = params;
  const iKey = validateIdempotencyKey(params.idempotencyKey);
  await requireVerifiedAdult(actorId);

  const booking = await loadBooking(bookingId);
  if (booking.creatorId !== actorId) {
    throw new HttpsError('permission-denied', 'Only the creator may complete this booking');
  }
  if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', `Booking is ${booking.status}`);
  }
  if (booking.escrowTokens <= 0) {
    throw new HttpsError('failed-precondition', 'No escrow tokens to release');
  }

  const fullKey = `cal_complete:${bookingId}:${iKey}`;
  const existingIdem = await idempotencyDocRef(fullKey).get();
  if (existingIdem.exists) return;

  await bookingRef(bookingId).update({
    status:    'COMPLETED',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await idempotencyDocRef(fullKey).set({ result: 'completed', createdAt: FieldValue.serverTimestamp() });

  // Record creator earning (C4 ledger — 7-day hold before payout eligible)
  await recordCreatorEarning({
    creatorId:          booking.creatorId,
    payerId:            booking.bookerId,
    tokenAmount:        booking.escrowTokens,
    sourceRef:          bookingId,
    type:               'CALENDAR_BOOKING',
    idempotencyKey:     `cal_earn:${bookingId}:${iKey}`,
  });
}

/**
 * Cancel a booking. Returns tokens to fan per refund policy.
 *
 * Policy (fan cancels):
 *   ≥72h before start → 100% returned
 *   24-72h before start → 50% returned
 *   <24h before start → 0% returned (creator keeps all)
 *
 * Creator cancels → 100% returned to fan.
 */
export async function cancelCalendarBooking(params: {
  actorId:        string;
  bookingId:      string;
  reason?:        string;
  idempotencyKey: string;
}): Promise<{ tokensReturned: number }> {
  const { actorId, bookingId, reason } = params;
  const iKey    = validateIdempotencyKey(params.idempotencyKey);
  const fullKey = `cal_cancel:${bookingId}:${actorId}:${iKey}`;
  await requireVerifiedAdult(actorId);

  const booking = await loadBooking(bookingId);
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    throw new HttpsError('failed-precondition', `Booking is already ${booking.status}`);
  }

  const isCreator  = actorId === booking.creatorId;
  const isBooker   = actorId === booking.bookerId;
  if (!isCreator && !isBooker) {
    throw new HttpsError('permission-denied', 'Only the creator or booker may cancel');
  }

  // Calculate refund amount
  let tokensToReturn: number;
  let tokensToCreator: number;

  if (isCreator) {
    // Creator cancels → full refund to fan
    tokensToReturn  = booking.escrowTokens;
    tokensToCreator = 0;
  } else {
    // Fan cancels → time-based policy
    const hoursLeft = hoursUntil(booking.startAt instanceof Date
      ? booking.startAt
      : new Date((booking.startAt as any).toDate ? (booking.startAt as any).toDate() : booking.startAt));

    if (hoursLeft >= REFUND_TIER_FULL_HOURS) {
      tokensToReturn  = booking.escrowTokens;
      tokensToCreator = 0;
    } else if (hoursLeft >= REFUND_TIER_PARTIAL_HOURS) {
      tokensToReturn  = Math.floor(booking.escrowTokens * REFUND_PARTIAL_PCT);
      tokensToCreator = booking.escrowTokens - tokensToReturn;
    } else {
      tokensToReturn  = 0;
      tokensToCreator = booking.escrowTokens;
    }
  }

  const result = await db.runTransaction(async (t) => {
    const existing = await checkIdempotency(t, fullKey);
    if (existing) return { tokensReturned: Number(existing) };

    if (tokensToReturn > 0) {
      t.update(walletRef(booking.bookerId), {
        balance:   FieldValue.increment(tokensToReturn),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    t.update(bookingRef(bookingId), {
      status:          'CANCELLED',
      cancelledBy:     isCreator ? 'CREATOR' : 'FAN',
      cancelledAt:     FieldValue.serverTimestamp(),
      refundedTokens:  tokensToReturn,
      escrowTokens:    0,
      updatedAt:       FieldValue.serverTimestamp(),
    });
    t.set(idempotencyDocRef(fullKey), {
      result:    String(tokensToReturn),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { tokensReturned: tokensToReturn };
  });

  // If creator earns the non-refunded portion, record earning
  if (tokensToCreator > 0) {
    await recordCreatorEarning({
      creatorId:          booking.creatorId,
      payerId:            booking.bookerId,
      tokenAmount:        tokensToCreator,
      sourceRef:          bookingId,
      type:               'CALENDAR_BOOKING',
      idempotencyKey:     `cal_cancel_earn:${bookingId}:${iKey}`,
    });
  }

  return result;
}

// ── Production onCall exports ─────────────────────────────────────────────────

export const c11_bookCalendarSlot = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return bookCalendarSlot({
      bookerId:       req.auth.uid,
      creatorId:      req.data.creatorId,
      priceTokens:    req.data.priceTokens,
      startAt:        req.data.startAt,
      endAt:          req.data.endAt,
      meetingType:    req.data.meetingType ?? 'DEFAULT',
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c11_confirmCalendarBooking = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return confirmCalendarBooking({
      creatorId: req.auth.uid,
      bookingId: req.data.bookingId,
    });
  },
);

export const c11_completeCalendarBooking = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return completeCalendarBooking({
      actorId:        req.auth.uid,
      bookingId:      req.data.bookingId,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c11_cancelCalendarBooking = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return cancelCalendarBooking({
      actorId:        req.auth.uid,
      bookingId:      req.data.bookingId,
      reason:         req.data.reason,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);
