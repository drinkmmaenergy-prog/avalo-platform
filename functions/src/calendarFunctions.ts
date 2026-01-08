/**
 * PACK 274 - Calendar Cloud Functions
 * Firebase callable functions for calendar booking system
 */

import * as functions from 'firebase-functions';
import {
  createBooking,
  cancelBookingByGuest,
  cancelBookingByHost,
  checkInMeeting,
  reportMismatch,
  completeMeeting,
  processGoodwillRefund,
  calculateRefundPolicy,
  calculatePaymentSplit,
} from './calendarEngine';
import type {
  CreateBookingRequest,
  CancelBookingRequest,
  CheckInRequest,
  MismatchReportRequest,
  GoodwillRefundRequest,
  CompleteMeetingRequest,
} from '../../shared/src/types/calendar';

/**
 * Create a new calendar booking
 */
export const createCalendarBooking = functions.https.onCall(async (data: CreateBookingRequest, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Verify user is the guest
  if (data.guestId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only create bookings as yourself');
  }

  try {
    const booking = await createBooking(data);

    return {
      success: true,
      booking,
    };
  } catch (error: any) {
    console.error('Error creating booking:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create booking');
  }
});

/**
 * Cancel a booking (guest or host)
 */
export const cancelCalendarBooking = functions.https.onCall(async (data: CancelBookingRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { bookingId, cancelledBy } = data;

  try {
    let booking;

    if (cancelledBy === 'guest') {
      booking = await cancelBookingByGuest(bookingId, userId);
    } else if (cancelledBy === 'host') {
      booking = await cancelBookingByHost(bookingId, userId);
    } else {
      throw new Error('Invalid cancelledBy value');
    }

    return {
      success: true,
      booking,
    };
  } catch (error: any) {
    console.error('Error cancelling booking:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to cancel booking');
  }
});

/**
 * Check-in to a meeting
 */
export const checkInToMeeting = functions.https.onCall(async (data: CheckInRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Verify user matches request
  if (data.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only check-in as yourself');
  }

  try {
    const booking = await checkInMeeting(data);

    return {
      success: true,
      booking,
      message: 'Successfully checked in to meeting',
    };
  } catch (error: any) {
    console.error('Error checking in:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to check-in');
  }
});

/**
 * Report appearance mismatch
 */
export const reportAppearanceMismatch = functions.https.onCall(async (data: MismatchReportRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Verify user is the reporter
  if (data.reportedBy !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only report as yourself');
  }

  try {
    const booking = await reportMismatch(data);

    return {
      success: true,
      booking,
      message: 'Mismatch reported. Full refund processed.',
    };
  } catch (error: any) {
    console.error('Error reporting mismatch:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to report mismatch');
  }
});

/**
 * Complete a meeting (called by scheduler or manually)
 */
export const completeMeetingCallable = functions.https.onCall(async (data: CompleteMeetingRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const booking = await completeMeeting(data);

    return {
      success: true,
      booking,
      message: 'Meeting completed and payout processed',
    };
  } catch (error: any) {
    console.error('Error completing meeting:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to complete meeting');
  }
});

/**
 * Process goodwill refund (host-initiated)
 */
export const processGoodwillRefundCallable = functions.https.onCall(async (data: GoodwillRefundRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Verify user is the host
  if (data.hostId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Only the host can initiate goodwill refund');
  }

  try {
    const booking = await processGoodwillRefund(data);

    return {
      success: true,
      booking,
      message: 'Goodwill refund processed. Guest received refund, Avalo kept service fee.',
    };
  } catch (error: any) {
    console.error('Error processing goodwill refund:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to process goodwill refund');
  }
});

/**
 * Get refund policy for a specific cancellation time
 */
export const getRefundPolicy = functions.https.onCall(async (data: { meetingStart: string; cancellationTime?: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const meetingStart = new Date(data.meetingStart);
    const cancellationTime = data.cancellationTime ? new Date(data.cancellationTime) : new Date();

    const policy = calculateRefundPolicy(meetingStart, cancellationTime);

    return {
      success: true,
      policy,
    };
  } catch (error: any) {
    console.error('Error calculating refund policy:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to calculate refund policy');
  }
});

/**
 * Calculate payment split for a booking
 */
export const calculateBookingPayment = functions.https.onCall(async (data: { priceTokens: number }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { priceTokens } = data;

    if (!priceTokens || priceTokens < 1) {
      throw new Error('Invalid price');
    }

    const payment = calculatePaymentSplit(priceTokens);

    return {
      success: true,
      payment: {
        total: priceTokens,
        hostReceives: payment.hostShare,
        hostPercentage: 80,
        avaloFee: payment.avaloShare,
        avaloPercentage: 20,
        breakdown: `${priceTokens} tokens → Host: ${payment.hostShare} (80%), Avalo: ${payment.avaloShare} (20%)`,
      },
    };
  } catch (error: any) {
    console.error('Error calculating payment:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to calculate payment');
  }
});

/**
 * Scheduled function to auto-complete meetings
 * Runs every 30 minutes to check for meetings that have ended
 */
export const autoCompleteMeetings = functions.pubsub.schedule('every 30 minutes').onRun(async (context) => {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  try {
    const { db } = await import('./firebase');
    
    // Find bookings that ended in the last 30 minutes and are still CONFIRMED
    const bookingsSnapshot = await db.collection('calendarBookings')
      .where('status', '==', 'CONFIRMED')
      .where('end', '<=', thirtyMinutesAgo.toISOString())
      .get();

    console.log(`Found ${bookingsSnapshot.size} bookings to auto-complete`);

    const completionPromises = bookingsSnapshot.docs.map(async (doc) => {
      const bookingId = doc.id;
      try {
        await completeMeeting({ bookingId });
        console.log(`Auto-completed booking: ${bookingId}`);
      } catch (error) {
        console.error(`Failed to auto-complete booking ${bookingId}:`, error);
      }
    });

    await Promise.all(completionPromises);

    console.log('Auto-completion scheduler finished');
  } catch (error) {
    console.error('Error in auto-completion scheduler:', error);
  }
});

/**
 * Scheduled function to send reminders for upcoming meetings
 * Runs every hour
 */
export const sendMeetingReminders = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const { db } = await import('./firebase');
    
    // Find bookings starting in the next 24 hours
    const bookingsSnapshot = await db.collection('calendarBookings')
      .where('status', '==', 'CONFIRMED')
      .where('start', '>=', now.toISOString())
      .where('start', '<=', in24Hours.toISOString())
      .get();

    console.log(`Found ${bookingsSnapshot.size} upcoming meetings for reminders`);

    // TODO: Send notifications/emails to host and guest
    // This will be integrated with notification system

    for (const doc of bookingsSnapshot.docs) {
      const booking = doc.data();
      console.log(`Reminder for booking ${doc.id}: ${booking.hostId} meeting ${booking.guestId}`);
      
      // Placeholder for notification integration
      // await sendNotification(booking.hostId, ...);
      // await sendNotification(booking.guestId, ...);
    }

    console.log('Meeting reminders sent');
  } catch (error) {
    console.error('Error sending meeting reminders:', error);
  }
});