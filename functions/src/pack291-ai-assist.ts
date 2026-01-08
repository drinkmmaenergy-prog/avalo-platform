/**
 * PACK 291 — AI Assist for Creators (Cloud Functions)
 * API endpoints for AI-powered creator insights
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { 
  aggregateCreatorData,
  hasSufficientDataForInsights,
  getAnalysisDateRange,
} from './pack291-data-aggregation';
import {
  generateDailySummary,
  generateWeeklyOptimization,
  generateContentRecommendations,
  generateChatOptimization,
  generateCalendarOptimization,
  generateEventOptimization,
  generatePricingRecommendations,
  generateProfileHealth,
} from './pack291-ai-service';
import {
  GetDailyInsightsRequest,
  GetDailyInsightsResponse,
  GetWeeklyOptimizationRequest,
  GetWeeklyOptimizationResponse,
  GetContentRecommendationsRequest,
  GetContentRecommendationsResponse,
  GetChatOptimizationRequest,
  GetChatOptimizationResponse,
  GetCalendarOptimizationRequest,
  GetCalendarOptimizationResponse,
  GetEventOptimizationRequest,
  GetEventOptimizationResponse,
  GetProfileHealthRequest,
  GetProfileHealthResponse,
  AI_ASSIST_CONSTANTS,
} from './types/pack291-ai-assist.types';

const db = getFirestore();

// ============================================================================
// DAILY INSIGHTS
// ============================================================================

/**
 * Get daily AI insights for creator
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_insights_daily')({ date: '2025-12-09' });
 * ```
 */
export const creator_ai_insights_daily = onCall<GetDailyInsightsRequest, Promise<GetDailyInsightsResponse>>(
  { 
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const requestData = request.data;
      const targetDate = requestData.date || new Date().toISOString().split('T')[0];

      // Check if user has sufficient data
      const hasSufficientData = await hasSufficientDataForInsights(userId);
      if (!hasSufficientData) {
        return {
          success: false,
          error: 'Insufficient data. Continue earning for at least 7 days to see insights.',
        };
      }

      // Get data for the day
      const fromDate = new Date(targetDate);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(targetDate);
      toDate.setHours(23, 59, 59, 999);

      const inputData = await aggregateCreatorData(userId, fromDate, toDate);

      // Generate daily summary
      const summary = await generateDailySummary(inputData);

      logger.info(`Generated daily insights for user ${userId} on ${targetDate}`);

      return {
        success: true,
        data: summary,
      };
    } catch (error: any) {
      logger.error('Error generating daily insights:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate insights',
      };
    }
  }
);

// ============================================================================
// WEEKLY OPTIMIZATION
// ============================================================================

/**
 * Get weekly optimization tips
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_insights_weekly')({ weekStart: '2025-12-02' });
 * ```
 */
export const creator_ai_insights_weekly = onCall<GetWeeklyOptimizationRequest, Promise<GetWeeklyOptimizationResponse>>(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const requestData = request.data;
      
      // Calculate week start (Monday) if not provided
      let weekStart: Date;
      if (requestData.weekStart) {
        weekStart = new Date(requestData.weekStart);
      } else {
        weekStart = new Date();
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
      }
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const inputData = await aggregateCreatorData(userId, weekStart, weekEnd);

      // Generate weekly optimization
      const optimization = await generateWeeklyOptimization(inputData);

      logger.info(`Generated weekly optimization for user ${userId}`);

      return {
        success: true,
        data: optimization,
      };
    } catch (error: any) {
      logger.error('Error generating weekly optimization:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate optimization tips',
      };
    }
  }
);

// ============================================================================
// CONTENT RECOMMENDATIONS
// ============================================================================

/**
 * Get content and posting time recommendations
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_recommendations_content')({});
 * ```
 */
export const creator_ai_recommendations_content = onCall<GetContentRecommendationsRequest, Promise<GetContentRecommendationsResponse>>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Analyze last 30 days
      const { from, to } = getAnalysisDateRange(30);
      const inputData = await aggregateCreatorData(userId, from, to);

      const { recommendations, postingTime } = await generateContentRecommendations(inputData);

      logger.info(`Generated content recommendations for user ${userId}`);

      return {
        success: true,
        data: recommendations,
        postingTime,
      };
    } catch (error: any) {
      logger.error('Error generating content recommendations:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate recommendations',
      };
    }
  }
);

// ============================================================================
// CHAT OPTIMIZATION
// ============================================================================

/**
 * Get chat optimization suggestions
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_recommendations_chat')({ timeRangeDays: 30 });
 * ```
 */
export const creator_ai_recommendations_chat = onCall<GetChatOptimizationRequest, Promise<GetChatOptimizationResponse>>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const requestData = request.data;
      const days = requestData.timeRangeDays || 30;

      const { from, to } = getAnalysisDateRange(days);
      const inputData = await aggregateCreatorData(userId, from, to);

      const suggestions = await generateChatOptimization(inputData);

      const metrics = {
        averageResponseTime: inputData.engagement.averageResponseTime,
        conversionRate: inputData.engagement.conversionRate,
        averageMessageLength: 0,  // Would need chat message data
        longestPaidChatDuration: 0,  // Would need chat duration data
      };

      logger.info(`Generated chat optimization for user ${userId}`);

      return {
        success: true,
        metrics,
        suggestions,
      };
    } catch (error: any) {
      logger.error('Error generating chat optimization:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate chat optimization',
      };
    }
  }
);

// ============================================================================
// CALENDAR OPTIMIZATION
// ============================================================================

/**
 * Get calendar booking optimization
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_recommendations_calendar')({});
 * ```
 */
export const creator_ai_recommendations_calendar = onCall<GetCalendarOptimizationRequest, Promise<GetCalendarOptimizationResponse>>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const requestData = request.data;
      const days = requestData.timeRangeDays || 30;

      const { from, to } = getAnalysisDateRange(days);
      const inputData = await aggregateCreatorData(userId, from, to);

      const calendarInsight = await generateCalendarOptimization(inputData);

      logger.info(`Generated calendar optimization for user ${userId}`);

      return {
        success: true,
        data: calendarInsight,
      };
    } catch (error: any) {
      logger.error('Error generating calendar optimization:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate calendar insights',
      };
    }
  }
);

// ============================================================================
// EVENT OPTIMIZATION
// ============================================================================

/**
 * Get event optimization insights
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_recommendations_events')({});
 * ```
 */
export const creator_ai_recommendations_events = onCall<GetEventOptimizationRequest, Promise<GetEventOptimizationResponse>>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const requestData = request.data;
      const days = requestData.timeRangeDays || 90;  // Longer period for events

      const { from, to } = getAnalysisDateRange(days);
      const inputData = await aggregateCreatorData(userId, from, to);

      const eventInsight = await generateEventOptimization(inputData);

      logger.info(`Generated event optimization for user ${userId}`);

      return {
        success: true,
        data: eventInsight,
      };
    } catch (error: any) {
      logger.error('Error generating event optimization:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate event insights',
      };
    }
  }
);

// ============================================================================
// PROFILE HEALTH
// ============================================================================

/**
 * Get profile health score and suggestions
 * 
 * Usage:
 * ```typescript
 * const result = await httpsCallable(functions, 'creator_ai_profile_health')({});
 * ```
 */
export const creator_ai_profile_health = onCall<GetProfileHealthRequest, Promise<GetProfileHealthResponse>>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { from, to } = getAnalysisDateRange(30);
      const inputData = await aggregateCreatorData(userId, from, to);

      const healthScore = await generateProfileHealth(inputData);

      logger.info(`Generated profile health for user ${userId}`);

      return {
        success: true,
        data: healthScore,
      };
    } catch (error: any) {
      logger.error('Error generating profile health:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate profile health',
      };
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Daily job to pre-cache insights for active creators
 * Runs at 3 AM UTC daily
 */
export const creator_ai_daily_precache = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('Starting daily AI insights pre-cache job');

    try {
      // Get active creators (earned in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const statsQuery = db.collection('creatorDailyStats')
        .where('createdAt', '>=', thirtyDaysAgo)
        .where('tokensEarnedTotal', '>', 0);

      const statsSnapshot = await statsQuery.get();
      const activeCreators = new Set<string>();

      statsSnapshot.forEach(doc => {
        activeCreators.add(doc.data().userId);
      });

      logger.info(`Found ${activeCreators.size} active creators to pre-cache`);

      let cached = 0;
      let errors = 0;

      // Pre-cache daily and weekly insights for each creator
      for (const userId of Array.from(activeCreators)) {
        try {
          // Check if they have sufficient data
          const hasSufficientData = await hasSufficientDataForInsights(userId);
          if (!hasSufficientData) {
            continue;
          }

          // Cache today's daily summary
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const inputData = await aggregateCreatorData(userId, today, todayEnd);
          await generateDailySummary(inputData);  // This caches the result

          cached++;

          // Throttle to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error pre-caching for user ${userId}:`, error);
          errors++;
        }
      }

      logger.info(`Pre-cache complete: ${cached} cached, ${errors} errors`);
    } catch (error) {
      logger.error('Error in daily pre-cache job:', error);
    }
  }
);

/**
 * Weekly cleanup of expired cache entries
 * Runs every Sunday at 4 AM UTC
 */
export const creator_ai_cache_cleanup = onSchedule(
  {
    schedule: '0 4 * * 0',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    logger.info('Starting AI cache cleanup job');

    try {
      const now = new Date();
      const expiredQuery = db.collection('aiAssistCache')
        .where('expiresAt', '<', now);

      const expiredSnapshot = await expiredQuery.get();
      
      logger.info(`Found ${expiredSnapshot.size} expired cache entries`);

      // Delete in batches of 500
      const batch = db.batch();
      let count = 0;

      expiredSnapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;

        if (count >= 500) {
          // Firebase batch limit is 500
          logger.info('Batch limit reached, committing...');
        }
      });

      await batch.commit();

      logger.info(`Cache cleanup complete: ${count} entries deleted`);
    } catch (error) {
      logger.error('Error in cache cleanup job:', error);
    }
  }
);