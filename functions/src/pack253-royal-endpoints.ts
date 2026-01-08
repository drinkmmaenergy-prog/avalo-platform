/**
 * PACK 253 — ROYAL UPGRADE FUNNEL ENDPOINTS
 * API endpoints for Royal tier system
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  updateRoyalStatus,
  generateRoyalAnalytics,
  calculateRoyalMetrics,
} from './pack253-royal-engine';
import {
  RoyalStatus,
  RoyalProgress,
  RoyalAnalytics,
  RoyalEvent,
  RoyalPricing,
  ROYAL_BENEFITS,
} from './pack253-royal-types';

/**
 * Get user's Royal status
 */
export const getRoyalStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<RoyalStatus | null> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    try {
      const statusDoc = await db.collection('royal_status').doc(userId).get();
      
      if (!statusDoc.exists) {
        return null;
      }

      return statusDoc.data() as RoyalStatus;
    } catch (error: any) {
      logger.error('Error fetching Royal status', error);
      throw new HttpsError('internal', `Failed to fetch Royal status: ${error.message}`);
    }
  }
);

/**
 * Get user's Royal progress
 */
export const getRoyalProgress = onCall(
  { region: 'europe-west3' },
  async (request): Promise<RoyalProgress | null> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      // Trigger metrics calculation and status update
      await updateRoyalStatus(userId);

      const progressDoc = await db.collection('royal_progress').doc(userId).get();
      
      if (!progressDoc.exists) {
        return null;
      }

      return progressDoc.data() as RoyalProgress;
    } catch (error: any) {
      logger.error('Error fetching Royal progress', error);
      throw new HttpsError('internal', `Failed to fetch Royal progress: ${error.message}`);
    }
  }
);

/**
 * Get Royal analytics for a user
 */
export const getRoyalAnalytics = onCall(
  { region: 'europe-west3' },
  async (request): Promise<RoyalAnalytics> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    // Verify user is Royal
    const statusDoc = await db.collection('royal_status').doc(userId).get();
    if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
      throw new HttpsError('permission-denied', 'Royal analytics are only available to Royal users');
    }

    try {
      return await generateRoyalAnalytics(userId);
    } catch (error: any) {
      logger.error('Error generating Royal analytics', error);
      throw new HttpsError('internal', `Failed to generate analytics: ${error.message}`);
    }
  }
);

/**
 * Set custom chat pricing (Royal only)
 */
export const setRoyalChatPricing = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const chatPrice = request.data.chatPrice;

    if (typeof chatPrice !== 'number') {
      throw new HttpsError('invalid-argument', 'Chat price must be a number');
    }

    if (chatPrice < ROYAL_BENEFITS.MIN_CHAT_PRICE || chatPrice > ROYAL_BENEFITS.MAX_CHAT_PRICE) {
      throw new HttpsError(
        'invalid-argument',
        `Chat price must be between ${ROYAL_BENEFITS.MIN_CHAT_PRICE} and ${ROYAL_BENEFITS.MAX_CHAT_PRICE} tokens`
      );
    }

    // Verify user is Royal
    const statusDoc = await db.collection('royal_status').doc(userId).get();
    if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
      throw new HttpsError('permission-denied', 'Only Royal users can set custom chat pricing');
    }

    try {
      const pricing: RoyalPricing = {
        userId,
        chatPrice,
        isActive: true,
        setAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.collection('royal_pricing').doc(userId).set(pricing);

      logger.info(`Royal user ${userId} set chat price to ${chatPrice}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Error setting Royal chat pricing', error);
      throw new HttpsError('internal', `Failed to set chat pricing: ${error.message}`);
    }
  }
);

/**
 * Create a Royal event
 */
export const createRoyalEvent = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ eventId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    // Verify user is Royal
    const statusDoc = await db.collection('royal_status').doc(userId).get();
    if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
      throw new HttpsError('permission-denied', 'Only Royal users can create Royal events');
    }

    const { title, description, startTime, endTime, type, maxAttendees } = request.data;

    if (!title || !startTime || !endTime || !type) {
      throw new HttpsError('invalid-argument', 'Missing required event fields');
    }

    try {
      const event: Omit<RoyalEvent, 'eventId'> = {
        creatorId: userId,
        title,
        description: description || '',
        startTime,
        endTime,
        type,
        attendeeIds: [],
        maxAttendees: maxAttendees || 50,
        status: 'scheduled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const eventRef = await db.collection('royal_events').add(event);

      logger.info(`Royal event created: ${eventRef.id} by ${userId}`);

      return { eventId: eventRef.id };
    } catch (error: any) {
      logger.error('Error creating Royal event', error);
      throw new HttpsError('internal', `Failed to create event: ${error.message}`);
    }
  }
);

/**
 * Join a Royal event
 */
export const joinRoyalEvent = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const eventId = request.data.eventId;

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'Event ID is required');
    }

    // Verify user is Royal
    const statusDoc = await db.collection('royal_status').doc(userId).get();
    if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
      throw new HttpsError('permission-denied', 'Only Royal users can join Royal events');
    }

    try {
      const eventRef = db.collection('royal_events').doc(eventId);
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }

      const event = eventDoc.data() as RoyalEvent;

      if (event.attendeeIds.includes(userId)) {
        throw new HttpsError('already-exists', 'Already joined this event');
      }

      if (event.attendeeIds.length >= event.maxAttendees) {
        throw new HttpsError('resource-exhausted', 'Event is full');
      }

      await eventRef.update({
        attendeeIds: [...event.attendeeIds, userId],
        updatedAt: Date.now(),
      });

      logger.info(`User ${userId} joined Royal event ${eventId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Error joining Royal event', error);
      throw new HttpsError('internal', `Failed to join event: ${error.message}`);
    }
  }
);

/**
 * Get Royal events
 */
export const getRoyalEvents = onCall(
  { region: 'europe-west3' },
  async (request): Promise<RoyalEvent[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    // Verify user is Royal
    const statusDoc = await db.collection('royal_status').doc(userId).get();
    if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
      throw new HttpsError('permission-denied', 'Only Royal users can view Royal events');
    }

    try {
      const now = Date.now();
      const eventsSnapshot = await db.collection('royal_events')
        .where('startTime', '>', now)
        .where('status', '==', 'scheduled')
        .orderBy('startTime', 'asc')
        .limit(50)
        .get();

      const events: RoyalEvent[] = eventsSnapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
      } as RoyalEvent));

      return events;
    } catch (error: any) {
      logger.error('Error fetching Royal events', error);
      throw new HttpsError('internal', `Failed to fetch events: ${error.message}`);
    }
  }
);

/**
 * Force refresh Royal status (checks metrics and updates status)
 */
export const refreshRoyalStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<RoyalStatus> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const status = await updateRoyalStatus(userId);
      logger.info(`Refreshed Royal status for user ${userId}`, { isRoyal: status.isRoyal });
      return status;
    } catch (error: any) {
      logger.error('Error refreshing Royal status', error);
      throw new HttpsError('internal', `Failed to refresh status: ${error.message}`);
    }
  }
);

/**
 * Scheduled function: Update all Royal statuses daily
 */
export const updateAllRoyalStatusesDaily = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('Starting daily Royal status update');

      // Get all users with Royal status (active or dormant)
      const statusSnapshot = await db.collection('royal_status')
        .where('isRoyal', '==', true)
        .get();

      let processedCount = 0;
      let errors = 0;

      for (const doc of statusSnapshot.docs) {
        try {
          await updateRoyalStatus(doc.id);
          processedCount++;
        } catch (error) {
          logger.error(`Error updating Royal status for user ${doc.id}`, error);
          errors++;
        }
      }

      // Also check users who are close to becoming Royal
      const progressSnapshot = await db.collection('royal_progress')
        .where('progressPercentage', '>=', 80)
        .get();

      for (const doc of progressSnapshot.docs) {
        try {
          await updateRoyalStatus(doc.id);
          processedCount++;
        } catch (error) {
          logger.error(`Error checking Royal progress for user ${doc.id}`, error);
          errors++;
        }
      }

      logger.info(`Completed daily Royal status update: ${processedCount} users processed, ${errors} errors`);

      return null;
    } catch (error: any) {
      logger.error('Error in daily Royal status update', error);
      throw error;
    }
  }
);

/**
 * Scheduled function: Generate Royal analytics weekly
 */
export const generateRoyalAnalyticsWeekly = onSchedule(
  {
    schedule: '0 4 * * 0', // Weekly on Sunday at 4 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('Starting weekly Royal analytics generation');

      // Get all Royal users
      const statusSnapshot = await db.collection('royal_status')
        .where('isRoyal', '==', true)
        .get();

      let processedCount = 0;
      let errors = 0;

      for (const doc of statusSnapshot.docs) {
        try {
          await generateRoyalAnalytics(doc.id);
          processedCount++;
        } catch (error) {
          logger.error(`Error generating analytics for Royal user ${doc.id}`, error);
          errors++;
        }
      }

      logger.info(`Completed weekly Royal analytics: ${processedCount} users processed, ${errors} errors`);

      return null;
    } catch (error: any) {
      logger.error('Error in weekly Royal analytics generation', error);
      throw error;
    }
  }
);