/**
 * PACK 324C — Creator Trust & Ranking API Endpoints
 * Admin-only callable functions for accessing trust scores and rankings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  TrustScoreResponse,
  CreatorRankingResponse,
  TopCreatorsResponse,
  TrustScoreHistoryResponse,
  RankingDashboardStats,
  CreatorRankingsFilter,
  TrustScoresFilter,
  TRUST_CONFIG,
  TRUST_LEVEL_THRESHOLDS,
} from './pack324c-trust-types';
import {
  recalculateCreatorTrustScore,
  recalculateAllCreatorTrustScores,
} from './pack324c-trust-engine';
import {
  generateDailyCreatorRanking,
  getTopCreatorsForDate,
  getCreatorRankingHistory,
  getCreatorRankingForDate,
} from './pack324c-ranking-engine';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    
    const userData = userDoc.data();
    return userData?.role === 'admin' || userData?.roles?.admin === true;
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get yesterday's date
 */
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDate(yesterday);
}

// ============================================================================
// TRUST SCORE ENDPOINTS
// ============================================================================

/**
 * Get trust score for a creator
 * Accessible by: Admin OR creator themselves
 */
export const pack324c_getCreatorTrustScore = onCall<{ userId: string }>(
  async (request) => {
    const { userId } = request.data;
    const callerId = request.auth?.uid;
    
    if (!callerId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Check authorization: admin or self
    const isAdminUser = await isAdmin(callerId);
    const isSelf = callerId === userId;
    
    if (!isAdminUser && !isSelf) {
      throw new HttpsError('permission-denied', 'Access denied');
    }
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    try {
      const trustScoreDoc = await db
        .collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
        .doc(userId)
        .get();
      
      if (!trustScoreDoc.exists) {
        throw new HttpsError('not-found', 'Trust score not found for user');
      }
      
      const data = trustScoreDoc.data()!;
      
      const response: TrustScoreResponse = {
        userId: data.userId,
        trustScore: data.trustScore,
        level: data.level,
        scores: {
          quality: data.qualityScore,
          reliability: data.reliabilityScore,
          safety: data.safetyScore,
          payout: data.payoutScore,
        },
        lastUpdated: data.lastUpdatedAt.toDate(),
      };
      
      return response;
    } catch (error) {
      logger.error('[PACK 324C] Error getting trust score:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get trust score');
    }
  }
);

/**
 * Recalculate trust score for a creator
 * Admin-only
 */
export const pack324c_recalculateTrustScore = onCall<{ userId: string }>(
  async (request) => {
    const { userId } = request.data;
    const callerId = request.auth?.uid;
    
    if (!callerId || !(await isAdmin(callerId))) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    try {
      const trustScore = await recalculateCreatorTrustScore(userId);
      
      return {
        success: true,
        userId: trustScore.userId,
        trustScore: trustScore.trustScore,
        level: trustScore.level,
      };
    } catch (error) {
      logger.error('[PACK 324C] Error recalculating trust score:', error);
      throw new HttpsError('internal', 'Failed to recalculate trust score');
    }
  }
);

/**
 * Get top creators by trust score
 * Admin-only
 */
export const pack324c_getTopTrustedCreators = onCall<TrustScoresFilter>(
  async (request) => {
    const callerId = request.auth?.uid;
    
    if (!callerId || !(await isAdmin(callerId))) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { level, minScore, maxScore, limit = 50, offset = 0 } = request.data;
    
    try {
      let query = db.collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
        .orderBy('trustScore', 'desc');
      
      if (level) {
        query = query.where('level', '==', level) as any;
      }
      
      if (minScore !== undefined) {
        query = query.where('trustScore', '>=', minScore) as any;
      }
      
      if (maxScore !== undefined) {
        query = query.where('trustScore', '<=', maxScore) as any;
      }
      
      const snapshot = await query
        .limit(Math.min(limit, TRUST_CONFIG.MAX_PAGE_SIZE))
        .offset(offset)
        .get();
      
      const creators = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          userId: data.userId,
          trustScore: data.trustScore,
          level: data.level,
          scores: {
            quality: data.qualityScore,
            reliability: data.reliabilityScore,
            safety: data.safetyScore,
            payout: data.payoutScore,
          },
          lastUpdated: data.lastUpdatedAt.toDate(),
        };
      });
      
      return {
        creators,
        totalCount: snapshot.size,
        page: Math.floor(offset / limit),
        pageSize: limit,
      };
    } catch (error) {
      logger.error('[PACK 324C] Error getting top trusted creators:', error);
      throw new HttpsError('internal', 'Failed to get top trusted creators');
    }
  }
);

// ============================================================================
// RANKING ENDPOINTS
// ============================================================================

/**
 * Get creator's current ranking
 * Accessible by: Admin OR creator themselves
 */
export const pack324c_getCreatorRanking = onCall<{ userId: string; date?: string }>(
  async (request) => {
    const { userId, date } = request.data;
    const callerId = request.auth?.uid;
    
    if (!callerId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Check authorization: admin or self
    const isAdminUser = await isAdmin(callerId);
    const isSelf = callerId === userId;
    
    if (!isAdminUser && !isSelf) {
      throw new HttpsError('permission-denied', 'Access denied');
    }
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    const targetDate = date || getYesterdayDate();
    
    try {
      const ranking = await getCreatorRankingForDate(userId, targetDate);
      
      if (!ranking) {
        throw new HttpsError('not-found', 'Ranking not found for user on this date');
      }
      
      const response: CreatorRankingResponse = {
        date: ranking.date,
        userId: ranking.userId,
        rankPosition: ranking.rankPosition,
        trustScore: ranking.trustScore,
        performance: {
          earnedTokens: ranking.totalEarnedTokens,
          sessions: ranking.totalSessions,
          callsMinutes: ranking.totalCallsMinutes,
          rating: ranking.averageRating,
        },
      };
      
      return response;
    } catch (error) {
      logger.error('[PACK 324C] Error getting creator ranking:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get creator ranking');
    }
  }
);

/**
 * Get top creators for a date
 * Public access (for discovery features)
 */
export const pack324c_getTopCreators = onCall<{ date?: string; limit?: number }>(
  async (request) => {
    const { date, limit = 100 } = request.data;
    const targetDate = date || getYesterdayDate();
    
    try {
      const rankings = await getTopCreatorsForDate(
        targetDate,
        Math.min(limit, TRUST_CONFIG.RANKING_TOP_COUNT)
      );
      
      const creators: CreatorRankingResponse[] = rankings.map(ranking => ({
        date: ranking.date,
        userId: ranking.userId,
        rankPosition: ranking.rankPosition,
        trustScore: ranking.trustScore,
        performance: {
          earnedTokens: ranking.totalEarnedTokens,
          sessions: ranking.totalSessions,
          callsMinutes: ranking.totalCallsMinutes,
          rating: ranking.averageRating,
        },
      }));
      
      const response: TopCreatorsResponse = {
        date: targetDate,
        creators,
        totalCount: creators.length,
      };
      
      return response;
    } catch (error) {
      logger.error('[PACK 324C] Error getting top creators:', error);
      throw new HttpsError('internal', 'Failed to get top creators');
    }
  }
);

/**
 * Get creator's ranking history
 * Accessible by: Admin OR creator themselves
 */
export const pack324c_getCreatorRankingHistory = onCall<{
  userId: string;
  startDate?: string;
  endDate?: string;
}>(
  async (request) => {
    const { userId, startDate, endDate } = request.data;
    const callerId = request.auth?.uid;
    
    if (!callerId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Check authorization: admin or self
    const isAdminUser = await isAdmin(callerId);
    const isSelf = callerId === userId;
    
    if (!isAdminUser && !isSelf) {
      throw new HttpsError('permission-denied', 'Access denied');
    }
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    // Default to last 30 days
    const end = endDate || getYesterdayDate();
    const start = startDate || (() => {
      const date = new Date(end);
      date.setDate(date.getDate() - 30);
      return formatDate(date);
    })();
    
    try {
      const rankings = await getCreatorRankingHistory(userId, start, end);
      
      const response: TrustScoreHistoryResponse = {
        userId,
        history: rankings.map(r => ({
          date: r.date,
          trustScore: r.trustScore,
          level: r.trustScore >= TRUST_LEVEL_THRESHOLDS.ELITE.min ? 'ELITE' :
                 r.trustScore >= TRUST_LEVEL_THRESHOLDS.HIGH.min ? 'HIGH' :
                 r.trustScore >= TRUST_LEVEL_THRESHOLDS.MEDIUM.min ? 'MEDIUM' : 'LOW',
        })),
      };
      
      return response;
    } catch (error) {
      logger.error('[PACK 324C] Error getting ranking history:', error);
      throw new HttpsError('internal', 'Failed to get ranking history');
    }
  }
);

/**
 * Get ranking dashboard statistics
 * Admin-only
 */
export const pack324c_getRankingDashboardStats = onCall(
  async (request) => {
    const callerId = request.auth?.uid;
    
    if (!callerId || !(await isAdmin(callerId))) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    try {
      const trustScoresSnapshot = await db
        .collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
        .get();
      
      let eliteCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;
      let totalScore = 0;
      
      trustScoresSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const level = data.level;
        totalScore += data.trustScore;
        
        switch (level) {
          case 'ELITE':
            eliteCount++;
            break;
          case 'HIGH':
            highCount++;
            break;
          case 'MEDIUM':
            mediumCount++;
            break;
          case 'LOW':
            lowCount++;
            break;
        }
      });
      
      const totalCreators = trustScoresSnapshot.size;
      const averageTrustScore = totalCreators > 0 ? totalScore / totalCreators : 0;
      
      // Get top earners count (creators with >10000 tokens earned)
      const topEarnersSnapshot = await db
        .collection('creatorKpiDaily')
        .where('totalEarnedTokens', '>', 10000)
        .get();
      
      const uniqueTopEarners = new Set(topEarnersSnapshot.docs.map(doc => doc.data().userId));
      
      const stats: RankingDashboardStats = {
        totalCreators,
        eliteCreators: eliteCount,
        highTrustCreators: highCount,
        mediumTrustCreators: mediumCount,
        lowTrustCreators: lowCount,
        averageTrustScore: Math.round(averageTrustScore),
        topEarners: uniqueTopEarners.size,
      };
      
      return stats;
    } catch (error) {
      logger.error('[PACK 324C] Error getting dashboard stats:', error);
      throw new HttpsError('internal', 'Failed to get dashboard stats');
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily job to generate creator rankings
 * Runs after PACK 324A daily aggregation (00:30 UTC)
 */
export const pack324c_generateDailyRanking = onSchedule(
  {
    schedule: '30 0 * * *', // 00:30 UTC daily
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async () => {
    logger.info('[PACK 324C] Starting daily ranking generation');
    
    try {
      const yesterday = getYesterdayDate();
      
      // First, recalculate all trust scores
      logger.info('[PACK 324C] Recalculating trust scores...');
      const trustScoreCount = await recalculateAllCreatorTrustScores();
      logger.info(`[PACK 324C] Trust scores recalculated: ${trustScoreCount} creators`);
      
      // Then generate rankings
      logger.info('[PACK 324C] Generating rankings...');
      const rankingCount = await generateDailyCreatorRanking(yesterday);
      logger.info(`[PACK 324C] Rankings generated: ${rankingCount} creators`);
      
      logger.info('[PACK 324C] Daily ranking generation completed successfully');
    } catch (error) {
      logger.error('[PACK 324C] Error in daily ranking generation:', error);
      throw error;
    }
  }
);

/**
 * Admin endpoint to manually trigger ranking generation
 */
export const pack324c_admin_triggerRankingGeneration = onCall<{ date?: string }>(
  async (request) => {
    const callerId = request.auth?.uid;
    
    if (!callerId || !(await isAdmin(callerId))) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { date } = request.data;
    const targetDate = date || getYesterdayDate();
    
    try {
      // Recalculate trust scores
      const trustScoreCount = await recalculateAllCreatorTrustScores();
      
      // Generate rankings
      const rankingCount = await generateDailyCreatorRanking(targetDate);
      
      return {
        success: true,
        date: targetDate,
        trustScoresUpdated: trustScoreCount,
        rankingsGenerated: rankingCount,
      };
    } catch (error) {
      logger.error('[PACK 324C] Error in manual ranking trigger:', error);
      throw new HttpsError('internal', 'Failed to generate rankings');
    }
  }
);