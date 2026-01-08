/**
 * PACK 328C — Calendar & Meetup Selfie Timeout + Mismatch Enforcement
 * Engine for mandatory selfie verification at meetup start
 */

import { db, FieldValue, Timestamp } from './firebase';
import { logger } from 'firebase-functions/v2';
import type { CalendarBooking, BookingStatus } from '../../shared/src/types/calendar';
import { emitFraudSignal } from './pack324b-fraud-signals';

/**
 * Constants
 */
const SELFIE_TIMEOUT_MINUTES = 5;
const SELFIE_TIMEOUT_MS = SELFIE_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Initialize selfie verification when meeting time arrives
 * Called by scheduled function when booking.start time is reached
 */
export async function initializeSelfieVerification(
  bookingId: string
): Promise<void> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      logger.error(`Booking not found: ${bookingId}`);
      return;
    }

    const booking = bookingSnap.data() as CalendarBooking;

    // Only initialize for CONFIRMED bookings
    if (booking.status !== 'CONFIRMED') {
      logger.info(`Booking ${bookingId} not in CONFIRMED status, skipping selfie init`);
      return;
    }

    const now = new Date().toISOString();
    const timeoutAt = new Date(Date.now() + SELFIE_TIMEOUT_MS).toISOString();

    // Update booking to AWAITING_SELFIE
    await bookingRef.update({
      status: 'AWAITING_SELFIE',
      'safety.meetupSelfieRequired': true,
      'safety.meetupSelfieStatus': 'PENDING',
      'safety.meetupSelfieRequestedAt': now,
      'safety.meetupSelfieTimeoutAt': timeoutAt,
      'safety.hostSelfieSubmitted': false,
      'safety.guestSelfieSubmitted': false,
      'timestamps.updatedAt': now,
    });

    // Schedule timeout check
    await scheduleTimeoutCheck(bookingId, timeoutAt);

    logger.info(`Selfie verification initialized for booking ${bookingId}`);

    // Send notifications to both users
    await sendSelfieNotifications(booking.hostId, booking.guestId, bookingId, SELFIE_TIMEOUT_MINUTES);
  } catch (error) {
    logger.error('Error initializing selfie verification:', error);
  }
}

/**
 * Upload selfie for verification
 */
export async function uploadMeetupSelfie(
  bookingId: string,
  userId: string,
  selfieUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const booking = bookingSnap.data() as CalendarBooking;

    // Verify booking is awaiting selfie
    if (booking.status !== 'AWAITING_SELFIE') {
      return { success: false, error: 'INVALID_STATUS' };
    }

    // Verify user is participant
    if (userId !== booking.hostId && userId !== booking.guestId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Check if timeout already occurred
    const now = new Date();
    const timeoutAt = booking.safety.meetupSelfieTimeoutAt ? new Date(booking.safety.meetupSelfieTimeoutAt) : null;
    
    if (timeoutAt && now > timeoutAt) {
      return { success: false, error: 'TIMEOUT_EXCEEDED' };
    }

    const isHost = userId === booking.hostId;
    const nowISO = now.toISOString();

    // Update selfie submission
    const updates: any = {
      'timestamps.updatedAt': nowISO,
    };

    if (isHost) {
      updates['safety.hostSelfieSubmitted'] = true;
      updates['safety.hostSelfieSubmittedAt'] = nowISO;
      updates['safety.hostSelfieUrl'] = selfieUrl;
    } else {
      updates['safety.guestSelfieSubmitted'] = true;
      updates['safety.guestSelfieSubmittedAt'] = nowISO;
      updates['safety.guestSelfieUrl'] = selfieUrl;
    }

    await bookingRef.update(updates);

    // Check if both selfies submitted
    const bothSubmitted = isHost 
      ? booking.safety.guestSelfieSubmitted
      : booking.safety.hostSelfieSubmitted;

    if (bothSubmitted) {
      // Both selfies uploaded - meetup can start
      await activateMeetup(bookingId);
    }

    logger.info(`Selfie uploaded for booking ${bookingId} by ${userId}`);

    return { success: true };
  } catch (error) {
    logger.error('Error uploading selfie:', error);
    return { success: false, error: 'INTERNAL_ERROR' };
  }
}

/**
 * Activate meetup after both selfies verified
 */
async function activateMeetup(bookingId: string): Promise<void> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const now = new Date().toISOString();

    await bookingRef.update({
      status: 'ACTIVE',
      'safety.meetupSelfieStatus': 'VERIFIED',
      'safety.meetupSelfieVerifiedAt': now,
      'safety.meetupStartedAt': now,
      'timestamps.updatedAt': now,
    });

    logger.info(`Meetup activated for booking ${bookingId}`);

    // Send meetup started notifications
    const bookingSnap = await bookingRef.get();
    const booking = bookingSnap.data() as CalendarBooking;

    await sendMeetupStartedNotifications(booking.hostId, booking.guestId, bookingId);
  } catch (error) {
    logger.error('Error activating meetup:', error);
  }
}

/**
 * Report selfie mismatch
 */
export async function reportSelfieMismatch(
  bookingId: string,
  reportedBy: string,
  reportedUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const booking = bookingSnap.data() as CalendarBooking;

    // Can only report during AWAITING_SELFIE or ACTIVE
    if (booking.status !== 'AWAITING_SELFIE' && booking.status !== 'ACTIVE') {
      return { success: false, error: 'INVALID_STATUS' };
    }

    // Verify reporter is participant
    if (reportedBy !== booking.hostId && reportedBy !== booking.guestId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Verify reported user is the other participant
    const otherParticipant = reportedBy === booking.hostId ? booking.guestId : booking.hostId;
    if (reportedUserId !== otherParticipant) {
      return { success: false, error: 'INVALID_REPORTED_USER' };
    }

    const now = new Date().toISOString();

    // Process full refund
    await processSelfieMismatchRefund(bookingId, reportedBy, reportedUserId, reason);

    logger.info(`Selfie mismatch reported for booking ${bookingId}`);

    return { success: true };
  } catch (error) {
    logger.error('Error reporting selfie mismatch:', error);
    return { success: false, error: 'INTERNAL_ERROR' };
  }
}

/**
 * Process selfie mismatch refund - 100% including Avalo fee
 */
async function processSelfieMismatchRefund(
  bookingId: string,
  reportedBy: string,
  reportedUserId: string,
  reason: string
): Promise<void> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    const booking = bookingSnap.data() as CalendarBooking;

    const now = new Date().toISOString();
    const fullRefund = booking.payment.totalTokensPaid;
    const avaloFeeRefund = booking.payment.avaloShareTokens;

    // Update booking status
    await bookingRef.update({
      status: 'SELFIE_MISMATCH',
      'safety.meetupSelfieStatus': 'FAILED',
      'safety.selfieMismatchReportedBy': reportedBy === booking.hostId ? 'host' : 'guest',
      'safety.selfieMismatchReportedAt': now,
      'safety.selfieMismatchReason': reason,
      'payment.refundedUserTokens': fullRefund,
      'payment.refundedAvaloTokens': avaloFeeRefund,
      'payment.refundReason': 'MISMATCH',
      'timestamps.updatedAt': now,
    });

    // Refund to guest (payer)
    await refundTokens(booking.guestId, fullRefund, bookingId, 'SELFIE_MISMATCH');

    // Emit fraud signal for reported user
    await emitFraudSignal({
      userId: reportedUserId,
      source: 'CALENDAR',
      signalType: 'IDENTITY_MISMATCH',
      severity: 4, // High severity
      contextRef: bookingId,
      metadata: {
        reportedBy,
        reason,
        bookingId,
        refundAmount: fullRefund,
      },
    });

    // Trigger Bank-ID verification for reported user
    await triggerBankIdVerification(reportedUserId, bookingId);

    logger.info(`Mismatch refund processed for booking ${bookingId}, full refund: ${fullRefund} tokens`);
  } catch (error) {
    logger.error('Error processing mismatch refund:', error);
    throw error;
  }
}

/**
 * Handle selfie timeout - auto-refund if both selfies notsubmitted within 5 minutes
 */
export async function handleSelfieTimeout(bookingId: string): Promise<void> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      logger.error(`Booking not found for timeout: ${bookingId}`);
      return;
    }

    const booking = bookingSnap.data() as CalendarBooking;

    // Only process timeout if still awaiting selfie
    if (booking.status !== 'AWAITING_SELFIE') {
      logger.info(`Booking ${bookingId} no longer awaiting selfie, skipping timeout`);
      return;
    }

    // Check if both selfies were submitted
    const bothSubmitted = booking.safety.hostSelfieSubmitted && booking.safety.guestSelfieSubmitted;

    if (bothSubmitted) {
      // Both submitted - activate meetup (edge case where timeout happens right as last selfie submitted)
      await activateMeetup(bookingId);
      return;
    }

    // Timeout occurred - process full refund
    await processSelfieTimeoutRefund(bookingId, booking);

    logger.info(`Selfie timeout processed for booking ${bookingId}`);
  } catch (error) {
    logger.error('Error handling selfie timeout:', error);
  }
}

/**
 * Process selfie timeout refund - 100% including Avalo fee
 */
async function processSelfieTimeoutRefund(
  bookingId: string,
  booking: CalendarBooking
): Promise<void> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const now = new Date().toISOString();
    const fullRefund = booking.payment.totalTokensPaid;
    const avaloFeeRefund = booking.payment.avaloShareTokens;

    // Update booking status
    await bookingRef.update({
      status: 'SELFIE_TIMEOUT',
      'safety.meetupSelfieStatus': 'TIMEOUT',
      'payment.refundedUserTokens': fullRefund,
      'payment.refundedAvaloTokens': avaloFeeRefund,
      'payment.refundReason': 'TIMEOUT',
      'timestamps.updatedAt': now,
    });

    // Refund to guest (payer)
    await refundTokens(booking.guestId, fullRefund, bookingId, 'SELFIE_TIMEOUT');

    // Emit fraud signals if appropriate
    if (!booking.safety.hostSelfieSubmitted) {
      await emitFraudSignal({
        userId: booking.hostId,
        source: 'CALENDAR',
        signalType: 'IDENTITY_MISMATCH',
        severity: 3,
        contextRef: bookingId,
        metadata: {
          reason: 'selfie_timeout',
          role: 'host',
        },
      });
    }

    if (!booking.safety.guestSelfieSubmitted) {
      await emitFraudSignal({
        userId: booking.guestId,
        source: 'CALENDAR',
        signalType: 'IDENTITY_MISMATCH',
        severity: 2,
        contextRef: bookingId,
        metadata: {
          reason: 'selfie_timeout',
          role: 'guest',
        },
      });
    }

    logger.info(`Timeout refund processed for booking ${bookingId}, full refund: ${fullRefund} tokens`);
  } catch (error) {
    logger.error('Error processing timeout refund:', error);
    throw error;
  }
}

/**
 * Cancel booking by host before selfie - 100% refund
 */
export async function cancelBookingBeforeSelfie(
  bookingId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const booking = bookingSnap.data() as CalendarBooking;

    // Verify host
    if (booking.hostId !== hostId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Can only cancel CONFIRMED or AWAITING_SELFIE bookings
    if (booking.status !== 'CONFIRMED' && booking.status !== 'AWAITING_SELFIE') {
      return { success: false, error: 'INVALID_STATUS' };
    }

    const now = new Date().toISOString();
    const fullRefund = booking.payment.totalTokensPaid;
    const avaloFeeRefund = booking.payment.avaloShareTokens;

    // Update booking
    await bookingRef.update({
      status: 'CANCELLED_BY_HOST',
      'payment.refundedUserTokens': fullRefund,
      'payment.refundedAvaloTokens': avaloFeeRefund,
      'payment.refundReason': 'HOST_CANCEL',
      'timestamps.cancelledAt': now,
      'timestamps.updatedAt': now,
    });

    // Refund to guest
    await refundTokens(booking.guestId, fullRefund, bookingId, 'HOST_CANCELLATION');

    logger.info(`Booking ${bookingId} cancelled by host, full refund: ${fullRefund} tokens`);

    return { success: true };
  } catch (error) {
    logger.error('Error cancelling booking:', error);
    return { success: false, error: 'INTERNAL_ERROR' };
  }
}

/**
 * Refund tokens to user
 */
async function refundTokens(
  userId: string,
  amount: number,
  bookingId: string,
  reason: string
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
      type: 'booking_refund',
      amount: amount,
      balance: currentBalance + amount,
      metadata: {
        bookingId,
        reason,
        refundType: '100_percent_with_avalo_fee',
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Schedule timeout check
 */
async function scheduleTimeoutCheck(bookingId: string, timeoutAt: string): Promise<void> {
  // Create a scheduled timeout document
  await db.collection('_selfie_timeouts').doc(bookingId).set({
    bookingId,
    timeoutAt: Timestamp.fromDate(new Date(timeoutAt)),
    processed: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Trigger Bank-ID verification for user
 */
async function triggerBankIdVerification(userId: string, contextRef: string): Promise<void> {
  await db.collection('_bankid_verification_queue').doc().set({
    userId,
    reason: 'IDENTITY_MISMATCH_MEETUP',
    contextRef,
    status: 'PENDING',
    priority: 'HIGH',
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(`Bank-ID verification triggered for user ${userId}`);
}

/**
 * Send selfie verification notifications
 */
async function sendSelfieNotifications(
  hostId: string,
  guestId: string,
  bookingId: string,
  timeoutMinutes: number
): Promise<void> {
  const message = `Your meetup is about to start! Both parties must submit a live selfie within ${timeoutMinutes} minutes to verify identity. The meeting will be automatically cancelled with full refund if selfies are not submitted in time.`;

  await Promise.all([
    db.collection('notifications').add({
      userId: hostId,
      type: 'MEETUP_SELFIE_REQUIRED',
      title: 'Selfie Verification Required',
      message,
      bookingId,
      priority: 'HIGH',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
    db.collection('notifications').add({
      userId: guestId,
      type: 'MEETUP_SELFIE_REQUIRED',
      title: 'Selfie Verification Required',
      message,
      bookingId,
      priority: 'HIGH',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}

/**
 * Send meetup started notifications
 */
async function sendMeetupStartedNotifications(
  hostId: string,
  guestId: string,
  bookingId: string
): Promise<void> {
  const message = 'Both selfies verified! Your meetup is now active. Have a great time!';

  await Promise.all([
    db.collection('notifications').add({
      userId: hostId,
      type: 'MEETUP_STARTED',
      title: 'Meetup Started',
      message,
      bookingId,
      priority: 'NORMAL',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
    db.collection('notifications').add({
      userId: guestId,
      type: 'MEETUP_STARTED',
      title: 'Meetup Started',
      message,
      bookingId,
      priority: 'NORMAL',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}