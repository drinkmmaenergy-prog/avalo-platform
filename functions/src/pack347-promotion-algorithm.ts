/**
 * PACK 347 — Growth Engine: Creator Promotion Algorithm
 * 
 * Calculates creator promotion score for:
 * - Discovery cards
 * - Search results
 * - Feed exposure
 * - Featured carousels
 * - Royal qualification
 * 
 * Score Formula:
 * promotionScore =
 *   (engagementRate * 0.35)
 * + (earningsVelocity * 0.25)
 * + (lowRefundRateBonus * 0.10)
 * + (ratingScore * 0.15)
 * + (viralConversion * 0.15)
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export interface PromotionScore {
  creatorId: string;
  totalScore: number;
  engagementRate: number;
  earningsVelocity: number;
  lowRefundRateBonus: number;
  ratingScore: number;
  viralConversion: number;
  breakdown: {
    engagement: number;      // 0.35 weight
    earnings: number;         // 0.25 weight
    refund: number;           // 0.10 weight
    rating: number;           // 0.15 weight
    viral: number;            // 0.15 weight
  };
  rank?: number; // Global ranking
  calculatedAt: FirebaseFirestore.Timestamp;
  expiresAt: Date; // Scores expire after 1 hour
}

export interface PromotionConfig {
  weights: {
    engagement: number;
    earnings: number;
    refund: number;
    rating: number;
    viral: number;
  };
  timeWindowHours: number;
  minInteractionsRequired: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: PromotionConfig = {
  weights: {
    engagement: 0.35,
    earnings: 0.25,
    refund: 0.10,
    rating: 0.15,
    viral: 0.15
  },
  timeWindowHours: 168, // 7 days
  minInteractionsRequired: 10
};

const SCORE_CACHE_HOURS = 1; // Scores are cached for 1 hour

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculate engagement rate for creator
 * Based on: messages received, calls accepted, bookings made
 */
async function calculateEngagementRate(
  creatorId: string,
  timeWindowHours: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  // Count interactions (chats, calls, bookings)
  const chatsQuery = await db.collection('chats')
    .where('participants', 'array-contains', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const callsQuery = await db.collection('calls')
    .where('participants', 'array-contains', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const bookingsQuery = await db.collection('bookings')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const totalInteractions = chatsQuery.size + callsQuery.size + bookingsQuery.size;
  
  // Get profile views for same period
  const profileViewsSnap = await db.collection('profile_views')
    .where('viewedUserId', '==', creatorId)
    .where('viewedAt', '>=', cutoffTime)
    .get();
  
  const profileViews = profileViewsSnap.size;
  
  // Engagement rate = interactions / views
  if (profileViews === 0) return 0;
  
  const engagementRate = Math.min((totalInteractions / profileViews) * 100, 100);
  
  return engagementRate;
}

/**
 * Calculate earnings velocity for creator
 * Based on: tokens earned per day in time window
 */
async function calculateEarningsVelocity(
  creatorId: string,
  timeWindowHours: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  // Get earnings transactions
  const earningsQuery = await db.collection('transactions')
    .where('receiverUid', '==', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .where('transactionType', 'in', ['chat', 'call', 'booking', 'tip'])
    .get();
  
  const totalEarnings = earningsQuery.docs.reduce((sum, doc) => {
    return sum + (doc.data().tokensAmount || 0);
  }, 0);
  
  const days = timeWindowHours / 24;
  const earningsPerDay = totalEarnings / days;
  
  // Normalize to 0-100 scale (100 tokens/day = 100 score)
  const normalized = Math.min((earningsPerDay / 100) * 100, 100);
  
  return normalized;
}

/**
 * Calculate low refund rate bonus
 * Lower refunds = higher score
 */
async function calculateLowRefundRateBonus(
  creatorId: string,
  timeWindowHours: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  // Get total transactions
  const transactionsQuery = await db.collection('transactions')
    .where('receiverUid', '==', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const totalTransactions = transactionsQuery.size;
  
  if (totalTransactions === 0) return 100; // No transactions = perfect score
  
  // Get refunds
  const refundsQuery = await db.collection('transactions')
    .where('senderUid', '==', creatorId)
    .where('transactionType', '==', 'refund')
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const totalRefunds = refundsQuery.size;
  
  // Calculate refund rate
  const refundRate = (totalRefunds / totalTransactions) * 100;
  
  // Inverse: lower refund rate = higher score
  const score = 100 - refundRate;
  
  return Math.max(score, 0);
}

/**
 * Calculate rating score
 * Based on user ratings/reviews
 */
async function calculateRatingScore(
  creatorId: string,
  timeWindowHours: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  // Get ratings
  const ratingsQuery = await db.collection('ratings')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  if (ratingsQuery.size === 0) {
    // Check if creator has overall rating in profile
    const profileSnap = await db.collection('users').doc(creatorId).get();
    const overallRating = profileSnap.data()?.stats?.rating || 0;
    return (overallRating / 5) * 100;
  }
  
  const totalRating = ratingsQuery.docs.reduce((sum, doc) => {
    return sum + (doc.data().rating || 0);
  }, 0);
  
  const avgRating = totalRating / ratingsQuery.size;
  
  // Normalize 5-star rating to 0-100 scale
  const normalized = (avgRating / 5) * 100;
  
  return normalized;
}

/**
 * Calculate viral conversion score
 * Based on viral invite conversion rate
 */
async function calculateViralConversion(
  creatorId: string,
  timeWindowHours: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  // Check if viral stats exist
  const viralStatsSnap = await db.collection('viral_stats').doc(creatorId).get();
  
  if (!viralStatsSnap.exists) {
    return 0; // No viral activity yet
  }
  
  const viralStats = viralStatsSnap.data();
  const conversionRate = viralStats?.conversionRate || 0;
  
  // Normalize: 10% conversion rate = 100 score
  const normalized = Math.min((conversionRate / 10) * 100, 100);
  
  return normalized;
}

/**
 * Calculate complete promotion score for creator
 */
export async function calculatePromotionScore(data: {
  creatorId: string;
  config?: Partial<PromotionConfig>;
}): Promise<{ success: boolean; score: PromotionScore }> {
  const { creatorId, config: userConfig } = data;
  
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  
  // Validate creator exists
  const creatorSnap = await db.collection('users').doc(creatorId).get();
  if (!creatorSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator not found');
  }
  
  // Check if cached score is still valid
  const cachedScoreSnap = await db.collection('promotion_scores').doc(creatorId).get();
  if (cachedScoreSnap.exists) {
    const cached = cachedScoreSnap.data() as PromotionScore;
    const expiresAt = cached.expiresAt instanceof Date 
      ? cached.expiresAt 
      : new Date(cached.expiresAt);
    
    if (expiresAt > new Date()) {
      return { success: true, score: cached };
    }
  }
  
  // Calculate all components
  const engagementRate = await calculateEngagementRate(creatorId, config.timeWindowHours);
  const earningsVelocity = await calculateEarningsVelocity(creatorId, config.timeWindowHours);
  const lowRefundRateBonus = await calculateLowRefundRateBonus(creatorId, config.timeWindowHours);
  const ratingScore = await calculateRatingScore(creatorId, config.timeWindowHours);
  const viralConversion = await calculateViralConversion(creatorId, config.timeWindowHours);
  
  // Calculate weighted scores
  const breakdown = {
    engagement: engagementRate * config.weights.engagement,
    earnings: earningsVelocity * config.weights.earnings,
    refund: lowRefundRateBonus * config.weights.refund,
    rating: ratingScore * config.weights.rating,
    viral: viralConversion * config.weights.viral
  };
  
  const totalScore = 
    breakdown.engagement +
    breakdown.earnings +
    breakdown.refund +
    breakdown.rating +
    breakdown.viral;
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SCORE_CACHE_HOURS * 60 * 60 * 1000);
  
  const score: PromotionScore = {
    creatorId,
    totalScore,
    engagementRate,
    earningsVelocity,
    lowRefundRateBonus,
    ratingScore,
    viralConversion,
    breakdown,
    calculatedAt: serverTimestamp() as any,
    expiresAt
  };
  
  // Save score to database
  await db.collection('promotion_scores').doc(creatorId).set(score);
  
  // Update global ranking (async, non-blocking)
  updateGlobalRankings().catch(err => 
    console.error('[Promotion] Failed to update rankings:', err)
  );
  
  return { success: true, score };
}

// ============================================================================
// RANKING & DISCOVERY
// ============================================================================

/**
 * Update global creator rankings based on promotion scores
 * Should be called after score calculations
 */
async function updateGlobalRankings(): Promise<void> {
  // Get all valid (non-expired) scores
  const now = new Date();
  const scoresQuery = await db.collection('promotion_scores')
    .where('expiresAt', '>', now)
    .orderBy('expiresAt')
    .orderBy('totalScore', 'desc')
    .limit(1000) // Top 1000 creators
    .get();
  
  if (scoresQuery.empty) return;
  
  // Batch update rankings
  const batch = db.batch();
  let rank = 1;
  
  for (const doc of scoresQuery.docs) {
    batch.update(doc.ref, { rank });
    rank++;
  }
  
  await batch.commit();
}

/**
 * Get top creators by promotion score
 * Used for discovery feed and featured carousels
 */
export async function getTopCreators(data: {
  limit?: number;
  minScore?: number;
  excludeCreatorIds?: string[];
}): Promise<PromotionScore[]> {
  const { limit = 50, minScore = 0, excludeCreatorIds = [] } = data;
  
  const now = new Date();
  let query = db.collection('promotion_scores')
    .where('expiresAt', '>', now)
    .where('totalScore', '>=', minScore)
    .orderBy('expiresAt')
    .orderBy('totalScore', 'desc')
    .limit(limit * 2); // Fetch more to filter out excludes
  
  const snapshot = await query.get();
  
  const scores = snapshot.docs
    .map(doc => doc.data() as PromotionScore)
    .filter(score => !excludeCreatorIds.includes(score.creatorId))
    .slice(0, limit);
  
  return scores;
}

/**
 * Get creators for local discovery (filtered by location)
 */
export async function getLocalTopCreators(data: {
  userLocation: { lat: number; lng: number };
  radiusKm: number;
  limit?: number;
}): Promise<PromotionScore[]> {
  const { userLocation, radiusKm, limit = 20 } = data;
  
  // Get creators in location radius
  // Note: This requires geohash indexing in production
  const creatorsQuery = await db.collection('users')
    .where('modes.earnFromChat', '==', true)
    .limit(200) // Pre-filter
    .get();
  
  const nearbyCreatorIds = creatorsQuery.docs
    .filter(doc => {
      const creatorLocation = doc.data().location;
      if (!creatorLocation?.lat || !creatorLocation?.lng) return false;
      
      // Simple distance calculation (Haversine formula would be better)
      const distance = Math.sqrt(
        Math.pow(creatorLocation.lat - userLocation.lat, 2) +
        Math.pow(creatorLocation.lng - userLocation.lng, 2)
      ) * 111; // Rough km conversion
      
      return distance <= radiusKm;
    })
    .map(doc => doc.id);
  
  if (nearbyCreatorIds.length === 0) {
    return [];
  }
  
  // Get promotion scores for nearby creators
  const now = new Date();
  
  // Firestore 'in' query limit is 30, so we need to batch
  const batchSize = 30;
  const batches = [];
  for (let i = 0; i < nearbyCreatorIds.length; i += batchSize) {
    const batch = nearbyCreatorIds.slice(i, i + batchSize);
    batches.push(batch);
  }
  
  const allScores: PromotionScore[] = [];
  for (const batch of batches) {
    const scoresQuery = await db.collection('promotion_scores')
      .where('creatorId', 'in', batch)
      .where('expiresAt', '>', now)
      .get();
    
    allScores.push(...scoresQuery.docs.map(doc => doc.data() as PromotionScore));
  }
  
  // Sort by score and return top N
  return allScores
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}

/**
 * Get search results ranked by promotion score
 */
export async function searchCreatorsRanked(data: {
  query: string;
  limit?: number;
}): Promise<{
  creatorId: string;
  score: PromotionScore;
  profile: any;
}[]> {
  const { query, limit = 30 } = data;
  
  // Search users by name/username (simplified)
  const searchQuery = query.toLowerCase();
  const usersQuery = await db.collection('users')
    .where('searchKeywords', 'array-contains', searchQuery)
    .limit(100)
    .get();
  
  const creatorIds = usersQuery.docs.map(doc => doc.id);
  
  if (creatorIds.length === 0) {
    return [];
  }
  
  // Get promotion scores
  const now = new Date();
  const batchSize = 30;
  const batches = [];
  for (let i = 0; i < creatorIds.length; i += batchSize) {
    const batch = creatorIds.slice(i, i + batchSize);
    batches.push(batch);
  }
  
  const results: {
    creatorId: string;
    score: PromotionScore;
    profile: any;
  }[] = [];
  
  for (const batch of batches) {
    const scoresQuery = await db.collection('promotion_scores')
      .where('creatorId', 'in', batch)
      .where('expiresAt', '>', now)
      .get();
    
    const scoresMap = new Map(
      scoresQuery.docs.map(doc => [doc.id, doc.data() as PromotionScore])
    );
    
    for (const userDoc of usersQuery.docs) {
      if (batch.includes(userDoc.id)) {
        const score = scoresMap.get(userDoc.id);
        if (score) {
          results.push({
            creatorId: userDoc.id,
            score,
            profile: userDoc.data()
          });
        }
      }
    }
  }
  
  // Sort by promotion score
  return results
    .sort((a, b) => b.score.totalScore - a.score.totalScore)
    .slice(0, limit);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Recalculate promotion scores for all active creators
 * Should be called by Cloud Scheduler (hourly)
 */
export async function recalculateAllPromotionScores(
  batchSize: number = 100
): Promise<{ success: boolean; processed: number }> {
  // Get all creators with earnOnChat enabled
  const creatorsQuery = await db.collection('users')
    .where('modes.earnFromChat', '==', true)
    .limit(batchSize)
    .get();
  
  if (creatorsQuery.empty) {
    return { success: true, processed: 0 };
  }
  
  let processed = 0;
  
  for (const creatorDoc of creatorsQuery.docs) {
    try {
      await calculatePromotionScore({ creatorId: creatorDoc.id });
      processed++;
    } catch (error) {
      console.error(`Failed to calculate score for ${creatorDoc.id}:`, error);
    }
  }
  
  return { success: true, processed };
}

/**
 * Clean expired promotion scores
 * Should be called by Cloud Scheduler (daily)
 */
export async function cleanExpiredPromotionScores(
  batchSize: number = 500
): Promise<{ success: boolean; deleted: number }> {
  const now = new Date();
  
  const expiredQuery = await db.collection('promotion_scores')
    .where('expiresAt', '<', now)
    .limit(batchSize)
    .get();
  
  if (expiredQuery.empty) {
    return { success: true, deleted: 0 };
  }
  
  const batch = db.batch();
  expiredQuery.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  return { success: true, deleted: expiredQuery.size };
}

/**
 * PACK 347: Creator Promotion Algorithm
 * 
 * - Multi-factor scoring: engagement, earnings, refunds, ratings, viral
 * - Weighted formula with configurable coefficients
 * - Score caching (1 hour TTL)
 * - Global and local ranking
 * - Search result ranking
 * - Integration with discovery feed and featured carousels
 */
