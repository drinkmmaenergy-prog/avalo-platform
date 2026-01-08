/**
 * PACK 255 — AI Matchmaker API Endpoints
 * 
 * Callable functions for the AI Matchmaker Engine
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  trackBehaviorSignal,
  trackProfileView,
  trackSwipe,
  trackMessage,
  trackPaidInteraction,
  updateBehaviorProfile,
  getBehaviorProfile,
  getLearnedPreferences,
} from './pack255-behavior-tracker';
import {
  activateSwipeHeating,
  getHeatingState,
  cleanupExpiredHeating,
  getHeatingStats,
} from './pack255-swipe-heating';
import {
  generateDiscoveryFeed,
  getNextBatch,
  getUserTier,
  rankCandidate,
  passesSafetyFilters,
} from './pack255-match-ranker';
import { BehaviorSignalType, EmotionalTrigger } from './pack255-ai-matchmaker-types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[Pack255:Endpoints]', ...args),
  warn: (...args: any[]) => console.warn('[Pack255:Endpoints]', ...args),
  error: (...args: any[]) => console.error('[Pack255:Endpoints]', ...args),
};

// ============================================================================
// DISCOVERY FEED ENDPOINT
// ============================================================================

/**
 * Get AI-powered discovery feed with behavioral ranking
 */
export const getAIDiscoveryFeed = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      limit: z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
      excludeUserIds: z.array(z.string()).optional(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { limit, cursor, excludeUserIds } = validation.data;

    try {
      let result;
      
      if (cursor) {
        result = await getNextBatch(uid, cursor, limit, excludeUserIds || []);
      } else {
        result = await generateDiscoveryFeed(uid, limit, excludeUserIds || []);
      }

      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      logger.error('Get discovery feed failed:', error);
      throw new HttpsError('internal', 'Failed to generate discovery feed');
    }
  }
);

// ============================================================================
// BEHAVIORAL TRACKING ENDPOINTS
// ============================================================================

/**
 * Track profile view
 */
export const trackProfileViewEvent = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      targetUserId: z.string(),
      viewDurationMs: z.number().min(0),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId, viewDurationMs } = validation.data;

    try {
      await trackProfileView(uid, targetUserId, viewDurationMs);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Track profile view failed:', error);
      throw new HttpsError('internal', 'Failed to track profile view');
    }
  }
);

/**
 * Track swipe action
 */
export const trackSwipeEvent = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      targetUserId: z.string(),
      direction: z.enum(['left', 'right']),
      viewDurationMs: z.number().optional(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId, direction, viewDurationMs } = validation.data;

    try {
      await trackSwipe(uid, targetUserId, direction, viewDurationMs);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Track swipe failed:', error);
      throw new HttpsError('internal', 'Failed to track swipe');
    }
  }
);

/**
 * Track message event
 */
export const trackMessageEvent = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      recipientId: z.string(),
      isReply: z.boolean(),
      messageLength: z.number().min(1),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { recipientId, isReply, messageLength } = validation.data;

    try {
      await trackMessage(uid, recipientId, isReply, messageLength);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Track message failed:', error);
      throw new HttpsError('internal', 'Failed to track message');
    }
  }
);

/**
 * Track paid interaction
 */
export const trackPaidInteractionEvent = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      targetUserId: z.string(),
      type: z.enum(['chat', 'call', 'meeting', 'gift', 'media']),
      amount: z.number().optional(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId, type, amount } = validation.data;

    try {
      await trackPaidInteraction(uid, targetUserId, type, amount);
      
      // Activate swipe heating on high-value interactions
      if (type === 'chat' || type === 'call' || type === 'meeting') {
        const triggerMap = {
          chat: EmotionalTrigger.PAID_CHAT_END,
          call: EmotionalTrigger.CALL_END,
          meeting: EmotionalTrigger.MEETING_COMPLETED,
        };
        await activateSwipeHeating(uid, triggerMap[type]);
      }
      
      return { success: true };
    } catch (error: any) {
      logger.error('Track paid interaction failed:', error);
      throw new HttpsError('internal', 'Failed to track paid interaction');
    }
  }
);

// ============================================================================
// USER STATS & INSIGHTS
// ============================================================================

/**
 * Get user's behavior profile
 */
export const getUserBehaviorProfile = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    try {
      const profile = await getBehaviorProfile(uid);
      const preferences = await getLearnedPreferences(uid);
      const tier = await getUserTier(uid);
      const heatingState = await getHeatingState(uid);

      return {
        success: true,
        profile,
        preferences,
        tier,
        heatingState,
      };
    } catch (error: any) {
      logger.error('Get behavior profile failed:', error);
      throw new HttpsError('internal', 'Failed to get behavior profile');
    }
  }
);

/**
 * Get heating statistics
 */
export const getUserHeatingStats = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      days: z.number().min(1).max(90).default(7),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { days } = validation.data;

    try {
      const stats = await getHeatingStats(uid, days);
      
      return {
        success: true,
        ...stats,
      };
    } catch (error: any) {
      logger.error('Get heating stats failed:', error);
      throw new HttpsError('internal', 'Failed to get heating stats');
    }
  }
);

/**
 * Preview candidate ranking (for debugging)
 */
export const previewCandidateRanking = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const schema = z.object({
      candidateId: z.string(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { candidateId } = validation.data;

    try {
      const ranking = await rankCandidate(uid, candidateId);
      const safetyCheck = await passesSafetyFilters(uid, candidateId);
      
      return {
        success: true,
        ranking,
        safetyCheck,
      };
    } catch (error: any) {
      logger.error('Preview candidate ranking failed:', error);
      throw new HttpsError('internal', 'Failed to preview ranking');
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Force update behavior profile (admin)
 */
export const adminUpdateBehaviorProfile = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Check admin privilege
    const isAdmin = request.auth?.token?.admin === true;
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const schema = z.object({
      targetUserId: z.string(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId } = validation.data;

    try {
      const profile = await updateBehaviorProfile(targetUserId);
      
      return {
        success: true,
        profile,
      };
    } catch (error: any) {
      logger.error('Admin update behavior profile failed:', error);
      throw new HttpsError('internal', 'Failed to update behavior profile');
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Clean up expired heating states (runs every hour)
 */
export const cleanupExpiredHeatingScheduled = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'europe-west3',
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      logger.info('Starting cleanup of expired heating states');
      
      const result = await cleanupExpiredHeating();
      
      logger.info(`Cleaned up ${result.deleted} expired heating states`);
    } catch (error) {
      logger.error('Cleanup expired heating failed:', error);
      throw error;
    }
  }
);

/**
 * Update behavior profiles for active users (runs daily at 3 AM)
 */
export const updateBehaviorProfilesScheduled = onSchedule(
  {
    schedule: 'every day 03:00',
    region: 'europe-west3',
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      logger.info('Starting daily behavior profile updates');
      
      // Get active users from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { db } = await import('./init');
      const { Timestamp } = await import('firebase-admin/firestore');
      
      const activeUsersSnapshot = await db
        .collection('users')
        .where('lastActiveAt', '>=', Timestamp.fromDate(sevenDaysAgo))
        .limit(1000) // Process in batches
        .get();
      
      let updated = 0;
      let failed = 0;
      
      for (const doc of activeUsersSnapshot.docs) {
        try {
          await updateBehaviorProfile(doc.id);
          updated++;
        } catch (error) {
          logger.error(`Failed to update profile for ${doc.id}:`, error);
          failed++;
        }
      }
      
      logger.info(`Updated ${updated} behavior profiles, ${failed} failed`);
    } catch (error) {
      logger.error('Update behavior profiles scheduled job failed:', error);
      throw error;
    }
  }
);

logger.info('✅ Pack 255 Endpoints initialized');