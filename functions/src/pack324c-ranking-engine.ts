/**
 * PACK 324C — Creator Daily Ranking Calculation Engine
 * READ-ONLY ranking - does not modify payouts, pricing, or business logic
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CreatorRankingDaily,
  RANKING_WEIGHTS,
  RANKING_REQUIREMENTS,
  TRUST_CONFIG,
} from './pack324c-trust-types';

// ============================================================================
// DAILY RANKING GENERATION
// ============================================================================

/**
 * Generate daily creator rankings for specified date
 * Runs after PACK 324A daily aggregation
 * READ-ONLY - does not modify any business logic
 */
export async function generateDailyCreatorRanking(date: string): Promise<number> {
  logger.info(`[PACK 324C] Generating creator rankings for date: ${date}`);
  
  try {
    // Get all creator KPIs for the date (from PACK 324A)
    const creatorsData = await getCreatorKpiForDate(date);
    
    if (creatorsData.length === 0) {
      logger.warn(`[PACK 324C] No creator data found for date: ${date}`);
      return 0;
    }
    
    // Filter creators meeting minimum requirements
    const eligibleCreators = creatorsData.filter(creator => 
      creator.totalSessions >= RANKING_REQUIREMENTS.MIN_SESSIONS &&
      creator.trustScore >= RANKING_REQUIREMENTS.MIN_TRUST_SCORE
    );
    
    logger.info(`[PACK 324C] ${eligibleCreators.length} eligible creators (from ${creatorsData.length} total)`);
    
    // Calculate ranking scores
    const rankedCreators = eligibleCreators.map(creator => ({
      ...creator,
      rankingScore: calculateRankingScore(creator),
    }));
    
    // Sort by ranking score (descending)
    rankedCreators.sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Assign positions
    const rankings: CreatorRankingDaily[] = rankedCreators.map((creator, index) => ({
      date,
      userId: creator.userId,
      totalEarnedTokens: creator.totalEarnedTokens,
      totalSessions: creator.totalSessions,
      totalCallsMinutes: creator.totalCallsMinutes,
      averageRating: creator.averageRating,
      trustScore: creator.trustScore,
      rankPosition: index + 1,
      createdAt: Timestamp.now(),
    }));
    
    // Store rankings in batches
    const batchSize = 500;
    for (let i = 0; i < rankings.length; i += batchSize) {
      const batch = db.batch();
      const chunk = rankings.slice(i, i + batchSize);
      
      chunk.forEach(ranking => {
        const docId = `${ranking.userId}_${date}`;
        const docRef = db
          .collection(TRUST_CONFIG.COLLECTIONS.RANKINGS_DAILY)
          .doc(docId);
        batch.set(docRef, ranking);
      });
      
      await batch.commit();
    }
    
    logger.info(`[PACK 324C] Stored ${rankings.length} creator rankings for date: ${date}`);
    
    return rankings.length;
  } catch (error) {
    logger.error(`[PACK 324C] Error generating rankings for ${date}:`, error);
    throw error;
  }
}

// ============================================================================
// DATA GATHERING (READ-ONLY)
// ============================================================================

interface CreatorRankingData {
  userId: string;
  totalEarnedTokens: number;
  totalSessions: number;
  totalCallsMinutes: number;
  averageRating: number;
  trustScore: number;
}

/**
 * Get creator KPI data for ranking from PACK 324A
 * READ-ONLY - only reads from existing collections
 */
async function getCreatorKpiForDate(date: string): Promise<CreatorRankingData[]> {
  try {
    // Get all creator KPIs for the date
    const kpiSnapshot = await db
      .collection('creatorKpiDaily')
      .where('date', '==', date)
      .get();
    
    const creators: CreatorRankingData[] = [];
    
    for (const doc of kpiSnapshot.docs) {
      const kpiData = doc.data();
      const userId = kpiData.userId;
      
      // Get trust score for creator
      const trustScoreDoc = await db
        .collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
        .doc(userId)
        .get();
      
      const trustScore = trustScoreDoc.exists ? trustScoreDoc.data()?.trustScore || 0 : 0;
      
      // Get average rating from sessions
      const averageRating = await getCreatorAverageRating(userId, date);
      
      // Calculate total call minutes from sessions
      const totalCallsMinutes = await getCreatorCallMinutes(userId, date);
      
      creators.push({
        userId,
        totalEarnedTokens: kpiData.totalEarnedTokens || 0,
        totalSessions: kpiData.sessionsCount || 0,
        totalCallsMinutes,
        averageRating,
        trustScore,
      });
    }
    
    return creators;
  } catch (error) {
    logger.error(`[PACK 324C] Error getting creator KPI data for ${date}:`, error);
    return [];
  }
}

/**
 * Get creator average rating for date
 */
async function getCreatorAverageRating(userId: string, date: string): Promise<number> {
  try {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    const reviewsSnapshot = await db
      .collection('reviews')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<', Timestamp.fromDate(endOfDay))
      .get();
    
    if (reviewsSnapshot.empty) {
      return 4.0; // Default rating if no reviews
    }
    
    let totalRating = 0;
    reviewsSnapshot.docs.forEach(doc => {
      totalRating += doc.data().rating || 0;
    });
    
    return totalRating / reviewsSnapshot.size;
  } catch (error) {
    logger.error(`[PACK 324C] Error getting rating for ${userId}:`, error);
    return 4.0;
  }
}

/**
 * Get total call minutes for creator on date
 */
async function getCreatorCallMinutes(userId: string, date: string): Promise<number> {
  try {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    // Voice calls
    const voiceSnapshot = await db
      .collection('aiVoiceCallSessions')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<', Timestamp.fromDate(endOfDay))
      .get();
    
    let totalMinutes = 0;
    voiceSnapshot.docs.forEach(doc => {
      totalMinutes += doc.data().durationMinutes || 0;
    });
    
    // Video calls
    const videoSnapshot = await db
      .collection('aiVideoCallSessions')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<', Timestamp.fromDate(endOfDay))
      .get();
    
    videoSnapshot.docs.forEach(doc => {
      totalMinutes += doc.data().durationMinutes || 0;
    });
    
    return totalMinutes;
  } catch (error) {
    logger.error(`[PACK 324C] Error getting call minutes for ${userId}:`, error);
    return 0;
  }
}

// ============================================================================
// RANKING SCORE CALCULATION
// ============================================================================

/**
 * Calculate ranking score using weighted formulas
 * Higher score = better ranking
 */
function calculateRankingScore(creator: CreatorRankingData): number {
  // Normalize each component (0-1 scale)
  const normalizedTrustScore = creator.trustScore / 100;
  const normalizedEarnings = normalizeEarnings(creator.totalEarnedTokens);
  const normalizedSessions = normalizeSessions(creator.totalSessions);
  const normalizedRating = creator.averageRating / 5.0;
  
  // Calculate weighted score
  const score = 
    normalizedTrustScore * RANKING_WEIGHTS.TRUST_SCORE +
    normalizedEarnings * RANKING_WEIGHTS.EARNINGS +
    normalizedSessions * RANKING_WEIGHTS.SESSION_VOLUME +
    normalizedRating * RANKING_WEIGHTS.RATING;
  
  return score;
}

/**
 * Normalize earnings to 0-1 scale
 * Uses logarithmic scale for better distribution
 */
function normalizeEarnings(tokens: number): number {
  if (tokens <= 0) return 0;
  
  // Log scale with cap at 100,000 tokens
  const maxTokens = 100000;
  const normalized = Math.log10(Math.min(tokens, maxTokens) + 1) / Math.log10(maxTokens + 1);
  
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Normalize session count to 0-1 scale
 */
function normalizeSessions(sessions: number): number {
  if (sessions <= 0) return 0;
  
  // Linear scale with cap at 200 sessions
  const maxSessions = 200;
  const normalized = Math.min(sessions, maxSessions) / maxSessions;
  
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// RANKING QUERIES
// ============================================================================

/**
 * Get top N creators for a specific date
 */
export async function getTopCreatorsForDate(date: string, limit: number = 100): Promise<CreatorRankingDaily[]> {
  try {
    const snapshot = await db
      .collection(TRUST_CONFIG.COLLECTIONS.RANKINGS_DAILY)
      .where('date', '==', date)
      .orderBy('rankPosition', 'asc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as CreatorRankingDaily);
  } catch (error) {
    logger.error(`[PACK 324C] Error getting top creators for ${date}:`, error);
    return [];
  }
}

/**
 * Get creator's ranking history
 */
export async function getCreatorRankingHistory(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CreatorRankingDaily[]> {
  try {
    const snapshot = await db
      .collection(TRUST_CONFIG.COLLECTIONS.RANKINGS_DAILY)
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'desc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as CreatorRankingDaily);
  } catch (error) {
    logger.error(`[PACK 324C] Error getting ranking history for ${userId}:`, error);
    return [];
  }
}

/**
 * Get creator's ranking for specific date
 */
export async function getCreatorRankingForDate(userId: string, date: string): Promise<CreatorRankingDaily | null> {
  try {
    const docId = `${userId}_${date}`;
    const doc = await db
      .collection(TRUST_CONFIG.COLLECTIONS.RANKINGS_DAILY)
      .doc(docId)
      .get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data() as CreatorRankingDaily;
  } catch (error) {
    logger.error(`[PACK 324C] Error getting ranking for ${userId} on ${date}:`, error);
    return null;
  }
}