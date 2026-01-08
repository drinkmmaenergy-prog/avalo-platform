/**
 * PACK 328C — Selfie Verification Cloud Functions
 * Firebase Functions for selfie verification flow
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { db, Timestamp } from './init';
import {
  initializeSelfieVerification,
  uploadMeetupSelfie,
  reportSelfieMismatch,
  handleSelfieTimeout,
  cancelBookingBeforeSelfie,
} from './pack328c-selfie-verification-engine';

/**
 * Scheduled function to check for bookings that should start selfie verification
 * Runs every minute to check for bookings starting now
 */
export const checkMeetupStartTimes = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    region: 'us-central1',
  },
  async (event) => {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // Find bookings starting within next 5 minutes that are CONFIRMED
      const bookingsSnapshot = await db
        .collection('calendarBookings')
        .where('status', '==', 'CONFIRMED')
        .where('start', '>=', Timestamp.fromDate(now))
        .where('start', '<=', Timestamp.fromDate(fiveMinutesFromNow))
        .get();

      logger.info(`Found ${bookingsSnapshot.size} bookings starting soon`);

      const initPromises = bookingsSnapshot.docs.map(doc => 
        initializeSelfieVerification(doc.id)
      );

      await Promise.all(initPromises);

      logger.info(`Initialized selfie verification for ${initPromises.length} bookings`);
    } catch (error) {
      logger.error('Error checking meetup start times:', error);
    }
  }
);

/**
 * Scheduled function to process selfie timeouts
 * Runs every minute to check for expired selfie timeouts
 */
export const processSelfieTimeouts = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    region: 'us-central1',
  },
  async (event) => {
    try {
      const now = new Date();

      // Find timeout records that should be processed
      const timeoutsSnapshot = await db
        .collection('_selfie_timeouts')
        .where('processed', '==', false)
        .where('timeoutAt', '<=', Timestamp.fromDate(now))
        .limit(50)
        .get();

      logger.info(`Found ${timeoutsSnapshot.size} selfie timeouts to process`);

      const processPromises = timeoutsSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        await handleSelfieTimeout(data.bookingId);
        
        // Mark as processed
        await doc.ref.update({ processed: true });
      });

      await Promise.all(processPromises);

      logger.info(`Processed ${processPromises.length} selfie timeouts`);
    } catch (error) {
      logger.error('Error processing selfie timeouts:', error);
    }
  }
);

/**
 * Upload selfie for meetup verification
 */
export const uploadMeetupSelfieFunction = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    const { bookingId, selfieUrl } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!bookingId || !selfieUrl) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const result = await uploadMeetupSelfie(bookingId, userId, selfieUrl);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to upload selfie');
    }

    return { success: true };
  }
);

/**
 * Report selfie mismatch
 */
export const reportSelfieMismatchFunction = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    const { bookingId, reportedUserId, reason } = request.data;
    const reportedBy = request.auth?.uid;

    if (!reportedBy) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!bookingId || !reportedUserId || !reason) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (reason.length < 10) {
      throw new HttpsError('invalid-argument', 'Reason must be at least 10 characters');
    }

    const result = await reportSelfieMismatch(bookingId, reportedBy, reportedUserId, reason);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to report mismatch');
    }

    return { success: true };
  }
);

/**
 * Cancel booking before selfie (host only)
 */
export const cancelBookingBeforeSelfieFunction = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    const { bookingId } = request.data;
    const hostId = request.auth?.uid;

    if (!hostId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!bookingId) {
      throw new HttpsError('invalid-argument', 'Missing bookingId');
    }

    const result = await cancelBookingBeforeSelfie(bookingId, hostId);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to cancel booking');
    }

    return { success: true };
  }
);

/**
 * Trigger on booking creation to set up selfie requirements for offline meetups
 */
export const onBookingCreatedSetupSelfie = onDocumentCreated(
  {
    document: 'calendarBookings/{bookingId}',
    region: 'us-central1',
  },
  async (event) => {
    const booking = event.data?.data();
    
    if (!booking) {
      return;
    }

    // Check if this is an offline meetup (you may have a field for this)
    // For now, we assume all bookings require selfie verification
    const requiresSelfie = true; // Could be: booking.meetupType === 'OFFLINE'

    if (requiresSelfie) {
      await event.data?.ref.update({
        'safety.meetupSelfieRequired': true,
      });

      logger.info(`Selfie verification enabled for booking ${event.params.bookingId}`);
    }
  }
);

/**
 * Monitor booking status changes for analytics
 */
export const onBookingStatusChanged = onDocumentUpdated(
  {
    document: 'calendarBookings/{bookingId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) {
      return;
    }

    const statusChanged = before.status !== after.status;

    if (!statusChanged) {
      return;
    }

    // Log status change for analytics
    await db.collection('analytics_events').add({
      eventType: 'BOOKING_STATUS_CHANGED',
      bookingId: event.params.bookingId,
      hostId: after.hostId,
      guestId: after.guestId,
      oldStatus: before.status,
      newStatus: after.status,
      selfieVerificationRequired: after.safety?.meetupSelfieRequired || false,
      timestamp: Timestamp.now(),
    });

    // Handle specific status transitions
    if (after.status === 'SELFIE_TIMEOUT') {
      logger.warn(`Booking ${event.params.bookingId} timed out on selfie verification`);
    } else if (after.status === 'SELFIE_MISMATCH') {
      logger.warn(`Booking ${event.params.bookingId} reported selfie mismatch`);
    } else if (after.status === 'ACTIVE') {
      logger.info(`Booking ${event.params.bookingId} is now active after selfie verification`);
    }
  }
);

/**
 * Cleanup old selfie timeout records
 * Runs daily to remove processed timeout records older than 7 days
 */
export const cleanupSelfieTimeouts = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'UTC',
    region: 'us-central1',
  },
  async (event) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const oldTimeoutsSnapshot = await db
        .collection('_selfie_timeouts')
        .where('processed', '==', true)
        .where('createdAt', '<=', Timestamp.fromDate(sevenDaysAgo))
        .limit(500)
        .get();

      const batch = db.batch();
      oldTimeoutsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${oldTimeoutsSnapshot.size} old selfie timeout records`);
    } catch (error) {
      logger.error('Error cleaning up selfie timeouts:', error);
    }
  }
);