/**
 * PACK 274 - Calendar Engine
 * Core business logic for 1:1 calendar bookings system
 * Handles booking flow, 80/20 commission, refunds, QR verification, and safety
 */

import { db, FieldValue, Timestamp } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import type {
  Calendar,
  CalendarSlot,
  CalendarBooking,
  BookingStatus,
  CreateBookingRequest,
  CancelBookingRequest,
  CheckInRequest,
  MismatchReportRequest,
  GoodwillRefundRequest,
  CompleteMeetingRequest,
  SafetyEvent,
  SafetyEventType,
  RefundPolicy,
} from '../../shared/src/types/calendar';

/**
 * Constants
 */
const AVALO_FEE_PERCENT = 20; // 20% Avalo fee
const HOST_SHARE_PERCENT = 80; // 80% to host
const MISMATCH_WINDOW_MINUTES = 15; // Can report mismatch within 15 minutes
const FULL_REFUND_HOURS = 72; // >72h = 100% refund
const PARTIAL_REFUND_MIN_HOURS = 24; // 24-72h = 50% refund
const NO_REFUND_HOURS = 24; // <24h = no refund

/**
 * Calculate refund policy based on cancellation time
 */
export function calculateRefundPolicy(
  meetingStart: Date,
  cancellationTime: Date
): RefundPolicy {
  const hoursUntilMeeting = (meetingStart.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);

  if (hoursUntilMeeting >= FULL_REFUND_HOURS) {
    return {
      refundPercentage: 100,
      description: 'Cancelled >72h before meeting: 100% refund of guest share (80%)',
    };
  } else if (hoursUntilMeeting >= PARTIAL_REFUND_MIN_HOURS) {
    return {
      refundPercentage: 50,
      description: 'Cancelled 24-72h before meeting: 50% refund of guest share',
    };
  } else {
    return {
      refundPercentage: 0,
      description: 'Cancelled <24h before meeting: No refund',
    };
  }
}

/**
 * Calculate payment split (80/20)
 */
export function calculatePaymentSplit(priceTokens: number): {
  hostShare: number;
  avaloShare: number;
} {
  const avaloShare = Math.floor(priceTokens * (AVALO_FEE_PERCENT / 100));
  const hostShare = priceTokens - avaloShare;

  return { hostShare, avaloShare };
}

/**
 * Generate unique QR code for booking
 */
export function generateQRCode(bookingId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `AVALO_BOOKING_${bookingId}_${timestamp}_${random}`;
}

/**
 * Check if user has sufficient balance
 */
async function checkUserBalance(userId: string, requiredTokens: number): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const balance = userData?.tokens || 0;

  return balance >= requiredTokens;
}

/**
 * Deduct tokens from user wallet
 */
async function deductTokens(
  userId: string,
  amount: number,
  transactionType: string,
  metadata: any
): Promise<void> {
  const userRef = db.collection('users').doc(userId);

  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const currentBalance = userDoc.data()?.tokens || 0;

    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Required: ${amount}, Available: ${currentBalance}`);
    }

    transaction.update(userRef, {
      tokens: currentBalance - amount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log transaction
    const transactionRef = db.collection('transactions').doc();
    transaction.set(transactionRef, {
      userId,
      type: transactionType,
      amount: -amount,
      balance: currentBalance - amount,
      metadata,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Add tokens to user wallet
 */
async function addTokens(
  userId: string,
  amount: number,
  transactionType: string,
  metadata: any
): Promise<void> {
  const userRef = db.collection('users').doc(userId);

  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const currentBalance = userDoc.data()?.tokens || 0;

    transaction.update(userRef, {
      tokens: currentBalance + amount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log transaction
    const transactionRef = db.collection('transactions').doc();
    transaction.set(transactionRef, {
      userId,
      type: transactionType,
      amount: amount,
      balance: currentBalance + amount,
      metadata,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Check if slot is available
 */
async function isSlotAvailable(hostId: string, slotId: string): Promise<boolean> {
  const calendarDoc = await db.collection('calendars').doc(hostId).get();
  
  if (!calendarDoc.exists) {
    return false;
  }

  const calendar = calendarDoc.data() as Calendar;
  const slot = calendar.availableSlots.find(s => s.slotId === slotId);

  return slot?.status === 'available';
}

/**
 * Check if booking meets minimum advance time
 */
function meetsAdvanceRequirement(
  slotStart: Date,
  minAdvanceHours: number
): boolean {
  const now = new Date();
  const hoursUntilSlot = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  return hoursUntilSlot >= minAdvanceHours;
}

/**
 * Create a new calendar booking
 */
export async function createBooking(request: CreateBookingRequest): Promise<CalendarBooking> {
  const { hostId, guestId, slotId, start, end, priceTokens } = request;
  const bookingId = uuidv4();
  const now = new Date().toISOString();
  const startDate = new Date(start);

  // Validate: Different users
  if (hostId === guestId) {
    throw new Error('Cannot book your own calendar slot');
  }

  // Check slot availability
  const slotAvailable = await isSlotAvailable(hostId, slotId);
  if (!slotAvailable) {
    throw new Error('Slot is not available');
  }

  // Get calendar settings
  const calendarDoc = await db.collection('calendars').doc(hostId).get();
  const calendar = calendarDoc.data() as Calendar;

  // Check minimum advance time
  if (!meetsAdvanceRequirement(startDate, calendar.settings.minAdvanceHours)) {
    throw new Error(`Booking must be at least ${calendar.settings.minAdvanceHours} hours in advance`);
  }

  // Check guest balance
  const hasBalance = await checkUserBalance(guestId, priceTokens);
  if (!hasBalance) {
    throw new Error('Insufficient tokens to complete booking');
  }

  // Calculate payment split
  const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

  // Generate QR code
  const qrCode = generateQRCode(bookingId);

  // Create booking object
  const booking: CalendarBooking = {
    bookingId,
    hostId,
    guestId,
    slotId,
    start,
    end,
    priceTokens,
    status: 'CONFIRMED',
    payment: {
      totalTokensPaid: priceTokens,
      userShareTokens: hostShare,
      avaloShareTokens: avaloShare,
      refundedUserTokens: 0,
      refundedAvaloTokens: 0,
    },
    safety: {
      qrCode,
      checkInAt: null,
      checkOutAt: null,
      mismatchReported: false,
      panicTriggered: false,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };

  // Perform transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from guest
    await deductTokens(guestId, priceTokens, 'calendar_booking', {
      bookingId,
      hostId,
      slotId,
    });

    // Save booking
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    transaction.set(bookingRef, booking);

    // Mark slot as booked (remove from available slots)
    const calendarRef = db.collection('calendars').doc(hostId);
    const calendarDoc = await transaction.get(calendarRef);
    const calendarData = calendarDoc.data() as Calendar;
    
    const updatedSlots = calendarData.availableSlots.filter(s => s.slotId !== slotId);
    transaction.update(calendarRef, {
      availableSlots: updatedSlots,
    });
  });

  return booking;
}

/**
 * Cancel booking by guest
 */
export async function cancelBookingByGuest(
  bookingId: string,
  guestId: string
): Promise<CalendarBooking> {
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Verify guest
  if (booking.guestId !== guestId) {
    throw new Error('Unauthorized: Not the guest of this booking');
  }

  // Check if already cancelled/completed
  if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
    throw new Error(`Cannot cancel booking with status: ${booking.status}`);
  }

  const now = new Date();
  const meetingStart = new Date(booking.start);
  const policy = calculateRefundPolicy(meetingStart, now);

  // Calculate refund
  const hostShare = booking.payment.userShareTokens;
  let refundAmount = 0;

  if (policy.refundPercentage === 100) {
    // Full refund of guest's 80% share
    refundAmount = hostShare;
  } else if (policy.refundPercentage === 50) {
    // 50% refund of guest's share
    refundAmount = Math.floor(hostShare * 0.5);
  }
  // else: no refund (refundAmount = 0)

  // Avalo keeps its fee unless full refund
  const avaloRefund = 0; // Guest cancellation never refunds Avalo fee

  // Update booking
  const updatedBooking: CalendarBooking = {
    ...booking,
    status: 'CANCELLED_BY_GUEST',
    payment: {
      ...booking.payment,
      refundedUserTokens: refundAmount,
      refundedAvaloTokens: avaloRefund,
    },
    timestamps: {
      ...booking.timestamps,
      cancelledAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };

  // Perform refund transaction
  await db.runTransaction(async (transaction) => {
    transaction.update(bookingRef, updatedBooking);

    // Refund guest if applicable
    if (refundAmount > 0) {
      await addTokens(guestId, refundAmount, 'booking_refund', {
        bookingId,
        reason: 'guest_cancellation',
        refundPolicy: policy.description,
      });
    }

    // If partial refund, remaining tokens go to host
    const hostEarnings = hostShare - refundAmount;
    if (hostEarnings > 0) {
      await addTokens(booking.hostId, hostEarnings, 'booking_cancellation_fee', {
        bookingId,
        reason: 'guest_late_cancellation',
      });
    }
  });

  return updatedBooking;
}

/**
 * Cancel booking by host
 */
export async function cancelBookingByHost(
  bookingId: string,
  hostId: string
): Promise<CalendarBooking> {
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Verify host
  if (booking.hostId !== hostId) {
    throw new Error('Unauthorized: Not the host of this booking');
  }

  // Check if already cancelled/completed
  if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
    throw new Error(`Cannot cancel booking with status: ${booking.status}`);
  }

  const now = new Date();

  // Host cancellation = FULL REFUND including Avalo fee
  const fullRefund = booking.payment.totalTokensPaid;
  const avaloFeeRefund = booking.payment.avaloShareTokens;

  // Update booking
  const updatedBooking: CalendarBooking = {
    ...booking,
    status: 'CANCELLED_BY_HOST',
    payment: {
      ...booking.payment,
      refundedUserTokens: fullRefund,
      refundedAvaloTokens: avaloFeeRefund,
    },
    timestamps: {
      ...booking.timestamps,
      cancelledAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };

  // Perform refund transaction
  await db.runTransaction(async (transaction) => {
    transaction.update(bookingRef, updatedBooking);

    // Full refund to guest
    await addTokens(booking.guestId, fullRefund, 'booking_refund', {
      bookingId,
      reason: 'host_cancellation',
      note: 'Full refund including Avalo fee due to host cancellation',
    });
  });

  return updatedBooking;
}

/**
 * Check-in to meeting with QR code
 */
export async function checkInMeeting(request: CheckInRequest): Promise<CalendarBooking> {
  const { bookingId, qrCode, userId } = request;
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Verify QR code
  if (booking.safety.qrCode !== qrCode) {
    throw new Error('Invalid QR code');
  }

  // Verify user is host or guest
  if (userId !== booking.hostId && userId !== booking.guestId) {
    throw new Error('Unauthorized: Not a participant of this booking');
  }

  // Check booking status
  if (booking.status !== 'CONFIRMED') {
    throw new Error(`Cannot check-in to booking with status: ${booking.status}`);
  }

  const now = new Date();

  // Update booking with check-in
  const updatedBooking: CalendarBooking = {
    ...booking,
    safety: {
      ...booking.safety,
      checkInAt: now.toISOString(),
    },
    timestamps: {
      ...booking.timestamps,
      updatedAt: now.toISOString(),
    },
  };

  await bookingRef.update(updatedBooking);

  // Emit safety event
  await emitSafetyEvent({
    eventType: 'meeting_started',
    bookingId,
    userId,
    timestamp: now.toISOString(),
    metadata: {
      hostId: booking.hostId,
      guestId: booking.guestId,
    },
  });

  return updatedBooking;
}

/**
 * Report appearance mismatch
 */
export async function reportMismatch(request: MismatchReportRequest): Promise<CalendarBooking> {
  const { bookingId, reportedBy, reason } = request;
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Verify reporter is participant
  if (reportedBy !== booking.hostId && reportedBy !== booking.guestId) {
    throw new Error('Unauthorized: Not a participant of this booking');
  }

  // Check if checked in
  if (!booking.safety.checkInAt) {
    throw new Error('Cannot report mismatch before check-in');
  }

  const now = new Date();
  const checkInTime = new Date(booking.safety.checkInAt);
  const minutesSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60);

  // Check mismatch window
  if (minutesSinceCheckIn > MISMATCH_WINDOW_MINUTES) {
    throw new Error(`Mismatch can only be reported within ${MISMATCH_WINDOW_MINUTES} minutes of check-in`);
  }

  // Full refund including Avalo fee
  const fullRefund = booking.payment.totalTokensPaid;
  const avaloFeeRefund = booking.payment.avaloShareTokens;

  // Update booking
  const updatedBooking: CalendarBooking = {
    ...booking,
    status: 'MISMATCH_REFUND',
    payment: {
      ...booking.payment,
      refundedUserTokens: fullRefund,
      refundedAvaloTokens: avaloFeeRefund,
    },
    safety: {
      ...booking.safety,
      mismatchReported: true,
      mismatchReportedAt: now.toISOString(),
    },
    timestamps: {
      ...booking.timestamps,
      updatedAt: now.toISOString(),
    },
  };

  // Perform refund and flag user
  await db.runTransaction(async (transaction) => {
    transaction.update(bookingRef, updatedBooking);

    // Full refund to guest
    await addTokens(booking.guestId, fullRefund, 'mismatch_refund', {
      bookingId,
      reportedBy,
      reason,
    });

    // Flag the reported user for review
    const reportedUserId = reportedBy === booking.guestId ? booking.hostId : booking.guestId;
    const flagRef = db.collection('safetyFlags').doc();
    transaction.set(flagRef, {
      userId: reportedUserId,
      type: 'appearance_mismatch',
      bookingId,
      reportedBy,
      reason,
      status: 'pending_review',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Emit safety event
  await emitSafetyEvent({
    eventType: 'mismatch_reported',
    bookingId,
    userId: reportedBy,
    timestamp: now.toISOString(),
    metadata: {
      reason,
    },
  });

  return updatedBooking;
}

/**
 * Complete meeting and process payout
 */
export async function completeMeeting(request: CompleteMeetingRequest): Promise<CalendarBooking> {
  const { bookingId } = request;
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Check status
  if (booking.status !== 'CONFIRMED') {
    throw new Error(`Cannot complete booking with status: ${booking.status}`);
  }

  const now = new Date();
  const meetingEnd = new Date(booking.end);

  // Check if meeting time has passed
  if (now < meetingEnd) {
    throw new Error('Meeting has not ended yet');
  }

  // Determine if guest showed up
  const guestShowedUp = booking.safety.checkInAt !== null;

  let updatedBooking: CalendarBooking;

  if (guestShowedUp) {
    // Normal completion - pay host
    updatedBooking = {
      ...booking,
      status: 'COMPLETED',
      safety: {
        ...booking.safety,
        checkOutAt: now.toISOString(),
      },
      timestamps: {
        ...booking.timestamps,
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    };

    // Pay host their 80% share
    await addTokens(booking.hostId, booking.payment.userShareTokens, 'booking_completed', {
      bookingId,
    });
  } else {
    // No-show - host still gets paid
    updatedBooking = {
      ...booking,
      status: 'NO_SHOW',
      timestamps: {
        ...booking.timestamps,
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    };

    // Pay host their 80% share
    await addTokens(booking.hostId, booking.payment.userShareTokens, 'booking_no_show', {
      bookingId,
      note: 'Guest did not show up',
    });
  }

  await bookingRef.update(updatedBooking);

  // End safety session
  const { onMeetingEnded } = await import('./safetyHooks');
  await onMeetingEnded(bookingId);

  return updatedBooking;
}

/**
 * Host-initiated goodwill refund
 */
export async function processGoodwillRefund(
  request: GoodwillRefundRequest
): Promise<CalendarBooking> {
  const { bookingId, hostId } = request;
  const bookingRef = db.collection('calendarBookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingDoc.data() as CalendarBooking;

  // Verify host
  if (booking.hostId !== hostId) {
    throw new Error('Unauthorized: Not the host of this booking');
  }

  // Can only refund completed bookings
  if (booking.status !== 'COMPLETED') {
    throw new Error('Can only provide goodwill refund for completed bookings');
  }

  const now = new Date();
  const hostShare = booking.payment.userShareTokens;

  // Host returns their 80% to guest
  // Avalo keeps its 20% fee
  const updatedBooking: CalendarBooking = {
    ...booking,
    status: 'COMPLETED_GOODWILL',
    payment: {
      ...booking.payment,
      refundedUserTokens: hostShare,
      refundedAvaloTokens: 0, // Avalo keeps fee
    },
    timestamps: {
      ...booking.timestamps,
      updatedAt: now.toISOString(),
    },
  };

  // Perform refund transaction
  await db.runTransaction(async (transaction) => {
    transaction.update(bookingRef, updatedBooking);

    // Refund guest (host's share only)
    await addTokens(booking.guestId, hostShare, 'goodwill_refund', {
      bookingId,
      fromHost: hostId,
    });

    // Deduct from host
    await deductTokens(hostId, hostShare, 'goodwill_refund', {
      bookingId,
      toGuest: booking.guestId,
    });
  });

  return updatedBooking;
}

/**
 * Emit safety event for external processing
 */
async function emitSafetyEvent(event: SafetyEvent): Promise<void> {
  const eventRef = db.collection('safetyEvents').doc();
  await eventRef.set({
    ...event,
    processed: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Safety hook: Called when meeting starts
 */
export async function onMeetingStarted(bookingId: string): Promise<void> {
  // Import safety hooks
  const { onMeetingStarted: safetyOnMeetingStarted } = await import('./safetyHooks');
  
  // Call safety hook to start tracking
  await safetyOnMeetingStarted(bookingId);
}

/**
 * Safety hook: Called when panic is triggered
 */
export async function onPanicTriggered(
  bookingId: string,
  userId: string,
  location?: { lat: number; lng: number }
): Promise<void> {
  // Import safety hooks
  const { onCalendarPanic } = await import('./safetyHooks');
  
  // Call safety hook to trigger panic
  await onCalendarPanic(bookingId, userId, location);
}

/**
 * Safety hook: Called when mismatch is reported
 */
export async function onMismatchReported(
  bookingId: string,
  reportedBy: string,
  reportedUserId: string
): Promise<void> {
  console.log(`[SAFETY_HOOK] Mismatch reported for booking: ${bookingId}`);
  console.log(`Reported by: ${reportedBy}, Reported user: ${reportedUserId}`);

  // Flag for manual review
  await db.collection('reviewQueue').doc().set({
    type: 'appearance_mismatch',
    bookingId,
    reportedBy,
    reportedUserId,
    status: 'pending',
    priority: 'high',
    createdAt: FieldValue.serverTimestamp(),
  });
}