/**
 * PACK 134 — API Endpoints
 * 
 * Cloud Functions for recommendation engine
 * All endpoints enforce strict ethical constraints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';

import { generatePersonalizedFeed, getRecommendationReason } from './pack134-feed-generator';
import { 
  updateInterestGraph, 
  getUserInterests,
  getTopUserInterests,
  assignContentCategories,
  recalculateAllInterestVectors,
} from './pack134-interest-graph';
import {
  recordSessionPattern,
  getTimeOfDayRelevance,
  getCurrentTimePreferences,
  getTimePatternSummary,
 getTimePatternInsights,
} from './pack134-time-relevance';
import { getNewCreatorStats } from './pack134-fairness-boost';
import {
  PersonalizedFeedRequest,
  InterestUpdateSignal,
  InterestCategory,
  UserPersonalizationSettings,
  PersonalizationDashboard,
} from './types/pack134-types';

// ============================================================================
// PERSONALIZED FEED ENDPOINTS
// ============================================================================

/**
 * Get personalized feed for user
 * Main endpoint for feed personalization
 */
export const getPersonalizedFeed = onCall<PersonalizedFeedRequest>(
  { 
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 100,
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Validate request
    if (!data.userId || data.userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Can only request own feed');
    }
    
    if (!data.feedType) {
      throw new HttpsError('invalid-argument', 'feedType is required');
    }
    
    if (!data.limit || data.limit < 1 || data.limit > 100) {
      throw new HttpsError('invalid-argument', 'limit must be between 1 and 100');
    }
    
    try {
      logger.info('[Pack134] Get personalized feed request', {
        userId: data.userId,
        feedType: data.feedType,
        limit: data.limit,
      });
      
      // Check personalization settings
      const settings = await getUserPersonalizationSettings(data.userId);
      if (settings.personalizationLevel === 'OFF') {
        // Return non-personalized feed
        return generateNonPersonalizedFeed(data);
      }
      
      // Generate personalized feed
      const feed = await generatePersonalizedFeed(data);
      
      return feed;
    } catch (error) {
      logger.error('[Pack134] Get personalized feed error', { error });
      throw new HttpsError('internal', 'Failed to generate feed');
    }
  }
);

/**
 * Get explanation for why content was recommended
 * Powers "Why am I seeing this?" feature
 */
export const getWhyRecommended = onCall<{ reasonId: string }>(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!data.reasonId) {
      throw new HttpsError('invalid-argument', 'reasonId is required');
    }
    
    try {
      const reason = await getRecommendationReason(data.reasonId);
      
      if (!reason) {
        throw new HttpsError('not-found', 'Recommendation reason not found');
      }
      
      // Verify user owns this recommendation
      if (reason.userId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot view other users reasons');
      }
      
      return reason;
    } catch (error) {
      logger.error('[Pack134] Get why recommended error', { error });
      throw new HttpsError('internal', 'Failed to get recommendation reason');
    }
  }
);

// ============================================================================
// INTEREST GRAPH ENDPOINTS
// ============================================================================

/**
 * Record interaction for interest tracking
 * Called automatically by client when user interacts with content
 */
export const recordInteraction = onCall<{
  category: InterestCategory;
  signalType: 'VIEW' | 'LIKE' | 'FOLLOW' | 'INTERACTION' | 'CONTENT_CLICK';
  contentId?: string;
  duration?: number;
}>(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check personalization settings
    const settings = await getUserPersonalizationSettings(auth.uid);
    if (settings.personalizationLevel === 'OFF' || !settings.allowInterestTracking) {
      // Don't track if personalization is disabled
      return { success: true, tracked: false };
    }
    
    try {
      const signal: InterestUpdateSignal = {
        userId: auth.uid,
        category: data.category,
        signalType: data.signalType,
        weight: calculateSignalWeight(data.signalType, data.duration),
        timestamp: Timestamp.now(),
        contentId: data.contentId,
        duration: data.duration,
      };
      
      await updateInterestGraph(signal);
      
      return { success: true, tracked: true };
    } catch (error) {
      logger.error('[Pack134] Record interaction error', { error });
      throw new HttpsError('internal', 'Failed to record interaction');
    }
  }
);

/**
 * Get user's current interests
 * For personalization transparency dashboard
 */
export const getMyInterests = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const interests = await getTopUserInterests(auth.uid, 10);
      return { interests };
    } catch (error) {
      logger.error('[Pack134] Get my interests error', { error });
      throw new HttpsError('internal', 'Failed to get interests');
    }
  }
);

// ============================================================================
// TIME PATTERN ENDPOINTS
// ============================================================================

/**
 * Get time pattern summary for user
 * Shows when user is most active
 */
export const getMyTimePatterns = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const summary = await getTimePatternSummary(auth.uid);
      const insights = await getTimePatternInsights(auth.uid);
      
      return {
        summary,
        insights,
      };
    } catch (error) {
      logger.error('[Pack134] Get my time patterns error', { error });
      throw new HttpsError('internal', 'Failed to get time patterns');
    }
  }
);

// ============================================================================
// PERSONALIZATION SETTINGS ENDPOINTS
// ============================================================================

/**
 * Get user's personalization settings
 */
export const getPersonalizationSettings = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const settings = await getUserPersonalizationSettings(auth.uid);
      return settings;
    } catch (error) {
      logger.error('[Pack134] Get personalization settings error', { error });
      throw new HttpsError('internal', 'Failed to get settings');
    }
  }
);

/**
 * Update user's personalization settings
 */
export const updatePersonalizationSettings = onCall<Partial<UserPersonalizationSettings>>(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const settingsRef = db.collection('user_personalization_settings').doc(auth.uid);
      const current = await getUserPersonalizationSettings(auth.uid);
      
      const updated: UserPersonalizationSettings = {
        ...current,
        ...data,
        userId: auth.uid,
        updatedAt: Timestamp.now(),
      };
      
      await settingsRef.set(updated);
      
      logger.info('[Pack134] Updated personalization settings', {
        userId: auth.uid,
        level: updated.personalizationLevel,
      });
      
      return updated;
    } catch (error) {
      logger.error('[Pack134] Update personalization settings error', { error });
      throw new HttpsError('internal', 'Failed to update settings');
    }
  }
);

/**
 * Get personalization dashboard
 * Shows user their tracked data and interests
 */
export const getPersonalizationDashboard = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 15,
  },
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const interests = await getUserInterests(auth.uid);
      const timePatterns = await getTimePatternSummary(auth.uid);
      const settings = await getUserPersonalizationSettings(auth.uid);
      
      const dashboard: PersonalizationDashboard = {
        userId: auth.uid,
        topInterests: interests ? 
          Object.entries(interests.interests)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([category, score]) => ({ 
              category: category as InterestCategory, 
              score 
            })) : 
          [],
        timeOfDayPattern: timePatterns,
        dataPointsUsed: interests?.dataPoints || 0,
        lastUpdated: interests?.updatedAt || Timestamp.now(),
        dataRetentionInfo: `Data is retained for ${settings.dataRetentionDays} days`,
        optOutAvailable: true,
      };
      
      return dashboard;
    } catch (error) {
      logger.error('[Pack134] Get personalization dashboard error', { error });
      throw new HttpsError('internal', 'Failed to get dashboard');
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Get new creator statistics (admin only)
 */
export const getNewCreatorStatistics = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin permission
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData?.role || userData.role !== 'ADMIN') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    try {
      const stats = await getNewCreatorStats();
      return stats;
    } catch (error) {
      logger.error('[Pack134] Get new creator statistics error', { error });
      throw new HttpsError('internal', 'Failed to get statistics');
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily job to recalculate interest vectors
 * Applies decay and removes stale data
 */
export const dailyInterestVectorMaintenance = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'UTC',
    memory: '2GiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('[Pack134] Starting daily interest vector maintenance');
    
    try {
      await recalculateAllInterestVectors(100);
      logger.info('[Pack134] Daily interest vector maintenance complete');
    } catch (error) {
      logger.error('[Pack134] Daily interest vector maintenance error', { error });
      throw error;
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user personalization settings (with defaults)
 */
async function getUserPersonalizationSettings(
  userId: string
): Promise<UserPersonalizationSettings> {
  const settingsDoc = await db.collection('user_personalization_settings').doc(userId).get();
  
  if (!settingsDoc.exists) {
    // Return default settings
    return {
      userId,
      personalizationLevel: 'FULL',
      allowTimeOfDay: true,
      allowInterestTracking: true,
      allowBehaviorAnalysis: true,
      dataRetentionDays: 90,
      updatedAt: Timestamp.now(),
    };
  }
  
  return settingsDoc.data() as UserPersonalizationSettings;
}

/**
 * Calculate signal weight based on interaction type
 */
function calculateSignalWeight(
  signalType: string,
  duration?: number
): number {
  switch (signalType) {
    case 'VIEW':
      // Weight based on duration (longer = more interested)
      if (duration) {
        if (duration < 3) return 0.1; // Quick glance
        if (duration < 10) return 0.3; // Brief view
        if (duration < 30) return 0.5; // Moderate view
        return 0.8; // Long view
      }
      return 0.3; // Default view weight
    
    case 'LIKE':
      return 0.7; // Strong positive signal
    
    case 'FOLLOW':
      return 1.0; // Strongest signal
    
    case 'INTERACTION':
      return 0.6; // Comment or share
    
    case 'CONTENT_CLICK':
      return 0.4; // Clicked on content
    
    default:
      return 0.3;
  }
}

/**
 * Generate non-personalized feed (when personalization is disabled)
 */
async function generateNonPersonalizedFeed(
  request: PersonalizedFeedRequest
): Promise<any> {
  logger.info('[Pack134] Generating non-personalized feed', {
    userId: request.userId,
  });
  
  // Simple chronological feed without personalization
  const query = db.collection('feed_posts')
    .where('visibility', '==', 'PUBLIC')
    .orderBy('createdAt', 'desc')
    .limit(request.limit);
  
  const snapshot = await query.get();
  
  const items = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    items.push({
      contentId: doc.id,
      contentType: 'POST',
      creatorId: data.userId,
      creatorName: data.creatorName || 'Unknown',
      categories: [],
      relevanceScore: 0,
      reasonId: '',
      timestamp: data.createdAt,
    });
  }
  
  return {
    items,
    cursor: items.length > 0 ? items[items.length - 1].contentId : undefined,
    hasMore: items.length === request.limit,
    generatedAt: Timestamp.now(),
    personalizationApplied: false,
  };
}