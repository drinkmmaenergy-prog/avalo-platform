import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

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
import { admin, functions } from './runtime';

// ============================================================================
// DAILY RANKING GENERATION
// ============================================================================

/**
 * Generate daily earner rankings for specified date
 * Runs after PACK 324A daily aggregation
 * READ-ONLY - does not modify any business logic
 */
export async function generateDailyCreatorRanking(date: string): Promise<number> {
  logger.info(`[PACK 324C] Generating earner rankings for date: ${date}`);
  
  try {
    // Get all earner KPIs for the date (from PACK 324A)
    const earnersData = await getCreatorKpiForDate(date);
    
    if (earnersData.length === 0) {
      logger.warn(`[PACK 324C] No earner data found for date: ${date}`);
      return 0;
    }
    
    // Filter earners meeting minimum requirements
    const eligibleCreators = earnersData.filter(earner => 
      earner.totalSessions >= RANKING_REQUIREMENTS.MIN_SESSIONS &&
      earner.trustScore >= RANKING_REQUIREMENTS.MIN_TRUST_SCORE
    );
    
    logger.info(`[PACK 324C] ${eligibleCreators.length} eligible earners (from ${earnersData.length} total)`);
    
    // Calculate ranking scores
    const rankedCreators = eligibleCreators.map(earner => ({
      ...earner,
      rankingScore: calculateRankingScore(earner),
    }));
    
    // Sort by ranking score (descending)
    rankedCreators.sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Assign positions
    const rankings: CreatorRankingDaily[] = rankedCreators.map((earner, index) => ({
      date,
      userId: earner.userId,
      totalEarnedTokens: earner.totalEarnedTokens,
      totalSessions: earner.totalSessions,
      totalCallsMinutes: earner.totalCallsMinutes,
      averageRating: earner.averageRating,
      trustScore: earner.trustScore,
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
    
    logger.info(`[PACK 324C] Stored ${rankings.length} earner rankings for date: ${date}`);
    
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
 * Get earner KPI data for ranking from PACK 324A
 * READ-ONLY - only reads from existing collections
 */
async function getCreatorKpiForDate(date: string): Promise<CreatorRankingData[]> {
  try {
    // Get all earner KPIs for the date
    const kpiSnapshot = await db
      .collection('earnerKpiDaily')
      .where('date', '==', date)
      .get();
    
    const earners: CreatorRankingData[] = [];
    
    for (const doc of kpiSnapshot.docs) {
      const kpiData = doc.data();
      const userId = kpiData.userId;
      
      // Get trust score for earner
      const trustScoreDoc = await db
        .collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
        .doc(userId)
        .get();
      
      const trustScore = trustScoreDoc.exists ? trustScoreDoc.data()?.trustScore || 0 : 0;
      
      // Get average rating from sessions
      const averageRating = await getCreatorAverageRating(userId, date);
      
      // Calculate total call minutes from sessions
      const totalCallsMinutes = await getCreatorCallMinutes(userId, date);
      
      earners.push({
        userId,
        totalEarnedTokens: kpiData.totalEarnedTokens || 0,
        totalSessions: kpiData.sessionsCount || 0,
        totalCallsMinutes,
        averageRating,
        trustScore,
      });
    }
    
    return earners;
  } catch (error) {
    logger.error(`[PACK 324C] Error getting earner KPI data for ${date}:`, error);
    return [];
  }
}

/**
 * Get earner average rating for date
 */
async function getCreatorAverageRating(userId: string, date: string): Promise<number> {
  try {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    const reviewsSnapshot = await db
      .collection('reviews')
      .where('earnerId', '==', userId)
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
 * Get total call minutes for earner on date
 */
async function getCreatorCallMinutes(userId: string, date: string): Promise<number> {
  try {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    // Voice calls
    const voiceSnapshot = await db
      .collection('aiVoiceCallSessions')
      .where('earnerId', '==', userId)
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
      .where('earnerId', '==', userId)
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
function calculateRankingScore(earner: CreatorRankingData): number {
  // Normalize each component (0-1 scale)
  const normalizedTrustScore = earner.trustScore / 100;
  const normalizedEarnings = normalizeEarnings(earner.totalEarnedTokens);
  const normalizedSessions = normalizeSessions(earner.totalSessions);
  const normalizedRating = earner.averageRating / 5.0;
  
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
 * Get top N earners for a specific date
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
    logger.error(`[PACK 324C] Error getting top earners for ${date}:`, error);
    return [];
  }
}

/**
 * Get earner's ranking history
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
 * Get earner's ranking for specific date
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

























