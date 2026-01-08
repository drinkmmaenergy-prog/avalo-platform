/**
 * PACK 213: Premium Match Priority Engine - Cloud Functions
 * 
 * Exposes PACK 213 functionality through:
 * - HTTP endpoints for discovery with priority ranking
 * - Signal tracking endpoints
 * - Scheduled functions for maintenance
 * - Webhook integrations for boost triggers
 */

import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  getDiscoveryFeedWithPriority,
  trackProfileLike,
  trackProfileView,
  trackMediaExpansion,
  trackProfileWishlist,
  getHighPriorityMatches,
  getSuggestedProfiles,
  getVisibilityFeedback,
  applyTokenPurchaseBoost,
  applyPaidChatBoost,
  applyPaidMeetingBoost,
  applyEventHostBoost,
  applyVoluntaryRefundBoost,
  applyGoodVibeBoost,
} from './pack213-discovery-integration';
import {
  calculateMatchPriority,
  expireOldBoosts,
} from './pack213-match-priority-engine';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[PACK213:Functions]', ...args),
  warn: (...args: any[]) => console.warn('[PACK213:Functions]', ...args),
  error: (...args: any[]) => console.error('[PACK213:Functions]', ...args),
};

// ============================================================================
// DISCOVERY ENDPOINTS
// ============================================================================

/**
 * Get discovery feed with PACK 213 priority ranking
 * Replaces or enhances existing discovery API
 */
export const getDiscoveryFeedV2 = onCall(
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
      filters: z.object({
        gender: z.string().optional(),
        minAge: z.number().min(18).optional(),
        maxAge: z.number().max(99).optional(),
        maxDistance: z.number().optional(),
        interests: z.array(z.string()).optional(),
      }).optional(),
      limit: z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
      usePriorityRanking: z.boolean().default(true),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { filters, limit, cursor, usePriorityRanking } = validation.data;

    try {
      logger.info(`Discovery feed request: user=${uid}, limit=${limit}, priority=${usePriorityRanking}`);
      
      const result = await getDiscoveryFeedWithPriority({
        viewerId: uid,
        filters,
        limit,
        cursor,
        usePriorityRanking,
      });

      // Get visibility feedback if available
      const visibilityMessage = await getVisibilityFeedback(uid);

      return {
        success: true,
        items: result.items,
        cursor: result.cursor,
        hasMore: result.hasMore,
        totalCandidates: result.totalCandidates,
        visibilityMessage: visibilityMessage || undefined,
      };
    } catch (error: any) {
      logger.error('Discovery feed failed:', error);
      throw new HttpsError('internal', 'Failed to get discovery feed');
    }
  }
);

/**
 * Get high-priority matches for special features
 */
export const getHighPriorityMatchesV1 = onCall(
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
      limit: z.number().min(1).max(50).default(10),
      minScore: z.number().min(0).max(100).default(70),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { limit, minScore } = validation.data;

    try {
      const matches = await getHighPriorityMatches(uid, limit, minScore);

      return {
        success: true,
        matches,
        count: matches.length,
      };
    } catch (error: any) {
      logger.error('High priority matches failed:', error);
      throw new HttpsError('internal', 'Failed to get high priority matches');
    }
  }
);

/**
 * Get suggested profiles for specific context
 */
export const getSuggestedProfilesV1 = onCall(
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
      context: z.enum(['nearby', 'passport', 'chemistry_weekend', 'fantasy_match']),
      limit: z.number().min(1).max(50).default(20),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { context, limit } = validation.data;

    try {
      const profiles = await getSuggestedProfiles(uid, context, limit);

      return {
        success: true,
        profiles,
        context,
        count: profiles.length,
      };
    } catch (error: any) {
      logger.error('Suggested profiles failed:', error);
      throw new HttpsError('internal', 'Failed to get suggested profiles');
    }
  }
);

// ============================================================================
// SIGNAL TRACKING ENDPOINTS
// ============================================================================

/**
 * Track profile like
 */
export const trackProfileLikeV1 = onCall(
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
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId } = validation.data;

    if (uid === targetUserId) {
      throw new HttpsError('invalid-argument', 'Cannot like yourself');
    }

    try {
      await trackProfileLike(uid, targetUserId);

      return {
        success: true,
        message: 'Like tracked successfully',
      };
    } catch (error: any) {
      logger.error('Track like failed:', error);
      throw new HttpsError('internal', 'Failed to track like');
    }
  }
);

/**
 * Track profile view with dwell time
 */
export const trackProfileViewV1 = onCall(
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
      dwellTimeSeconds: z.number().min(0).max(3600),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId, dwellTimeSeconds } = validation.data;

    try {
      await trackProfileView(uid, targetUserId, dwellTimeSeconds);

      return {
        success: true,
        message: 'View tracked successfully',
      };
    } catch (error: any) {
      logger.error('Track view failed:', error);
      // Non-critical, don't throw
      return {
        success: false,
        message: 'Failed to track view',
      };
    }
  }
);

/**
 * Track media expansion
 */
export const trackMediaExpansionV1 = onCall(
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
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId } = validation.data;

    try {
      await trackMediaExpansion(uid, targetUserId);

      return {
        success: true,
        message: 'Media expansion tracked',
      };
    } catch (error: any) {
      logger.error('Track media expansion failed:', error);
      // Non-critical
      return {
        success: false,
        message: 'Failed to track media expansion',
      };
    }
  }
);

/**
 * Track profile wishlist
 */
export const trackProfileWishlistV1 = onCall(
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
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { targetUserId } = validation.data;

    try {
      await trackProfileWishlist(uid, targetUserId);

      return {
        success: true,
        message: 'Wishlist tracked successfully',
      };
    } catch (error: any) {
      logger.error('Track wishlist failed:', error);
      throw new HttpsError('internal', 'Failed to track wishlist');
    }
  }
);

// ============================================================================
// BOOST APPLICATION (Called by other systems)
// ============================================================================

/**
 * Apply token purchase boost
 * Called by payment system after successful token purchase
 */
export const applyTokenPurchaseBoostV1 = onCall(
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
      amount: z.number().positive(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { amount } = validation.data;

    try {
      await applyTokenPurchaseBoost(uid, amount);

      return {
        success: true,
        message: 'Boost applied successfully',
        duration: '24 hours',
      };
    } catch (error: any) {
      logger.error('Apply token purchase boost failed:', error);
      // Non-critical
      return {
        success: false,
        message: 'Failed to apply boost',
      };
    }
  }
);

/**
 * Manual match priority calculation (for testing/admin)
 */
export const calculateMatchPriorityV1 = onCall(
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
      const score = await calculateMatchPriority(uid, candidateId);

      return {
        success: true,
        score,
      };
    } catch (error: any) {
      logger.error('Calculate match priority failed:', error);
      throw new HttpsError('internal', 'Failed to calculate match priority');
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Expire old boosts every hour
 */
export const expireOldBoostsScheduled = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'europe-west3',
    timeZone: 'UTC',
  },
  async (event) => {
    logger.info('Running scheduled boost expiration');
    
    try {
      const expiredCount = await expireOldBoosts();
      logger.info(`Expired ${expiredCount} old boosts`);
    } catch (error: any) {
      logger.error('Scheduled boost expiration failed:', error);
      throw error;
    }
  }
);

// ============================================================================
// WEBHOOK INTEGRATIONS
// ============================================================================

/**
 * Webhook handler for chat completion
 * Automatically applies boost when paid chat completes
 */
export const onChatCompletedWebhook = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    // Verify webhook signature (implement your signature verification)
    // For now, just check auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Invalid webhook signature');
    }

    const schema = z.object({
      userId: z.string(),
      chatId: z.string(),
      wasPaid: z.boolean(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { userId, chatId, wasPaid } = validation.data;

    if (wasPaid) {
      try {
        await applyPaidChatBoost(userId, chatId);
        logger.info(`Applied chat boost: user=${userId}, chat=${chatId}`);
      } catch (error) {
        logger.error('Failed to apply chat boost:', error);
      }
    }

    return { success: true };
  }
);

/**
 * Webhook handler for meeting completion
 */
export const onMeetingCompletedWebhook = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Invalid webhook signature');
    }

    const schema = z.object({
      userId: z.string(),
      meetingId: z.string(),
      wasPaid: z.boolean(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { userId, meetingId, wasPaid } = validation.data;

    if (wasPaid) {
      try {
        await applyPaidMeetingBoost(userId, meetingId);
        logger.info(`Applied meeting boost: user=${userId}, meeting=${meetingId}`);
      } catch (error) {
        logger.error('Failed to apply meeting boost:', error);
      }
    }

    return { success: true };
  }
);

/**
 * Webhook handler for event hosting
 */
export const onEventHostedWebhook = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Invalid webhook signature');
    }

    const schema = z.object({
      organizerId: z.string(),
      eventId: z.string(),
      wasSuccessful: z.boolean(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { organizerId, eventId, wasSuccessful } = validation.data;

    if (wasSuccessful) {
      try {
        await applyEventHostBoost(organizerId, eventId);
        logger.info(`Applied event host boost: user=${organizerId}, event=${eventId}`);
      } catch (error) {
        logger.error('Failed to apply event boost:', error);
      }
    }

    return { success: true };
  }
);

/**
 * Webhook handler for good vibe feedback
 */
export const onGoodVibeReceivedWebhook = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Invalid webhook signature');
    }

    const schema = z.object({
      userId: z.string(),
      meetingId: z.string(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', validation.error.message);
    }

    const { userId, meetingId } = validation.data;

    try {
      await applyGoodVibeBoost(userId, meetingId);
      logger.info(`Applied good vibe boost: user=${userId}, meeting=${meetingId}`);
    } catch (error) {
      logger.error('Failed to apply good vibe boost:', error);
    }

    return { success: true };
  }
);

logger.info('✅ PACK 213: Cloud Functions initialized');