/**
 * PACK 324C — Creator Trust Score Calculation Engine
 * READ-ONLY scoring - does not modify payouts, pricing, or business logic
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CreatorTrustScore,
  TrustLevel,
  TrustScoreInputs,
  QualityScoreFactors,
  ReliabilityScoreFactors,
  SafetyScoreFactors,
  PayoutScoreFactors,
  TRUST_LEVEL_THRESHOLDS,
  TRUST_SCORE_WEIGHTS,
  ELITE_REQUIREMENTS,
  TRUST_CONFIG,
} from './pack324c-trust-types';

// ============================================================================
// TRUST SCORE CALCULATION
// ============================================================================

/**
 * Recalculate creator trust score from all available data sources
 * READ-ONLY - does not modify any business logic or payments
 */
export async function recalculateCreatorTrustScore(userId: string): Promise<CreatorTrustScore> {
  logger.info(`[PACK 324C] Recalculating trust score for user: ${userId}`);
  
  try {
    // Gather input data from various sources (READ-ONLY)
    const inputs = await gatherTrustScoreInputs(userId);
    
    // Calculate component scores
    const qualityScore = calculateQualityScore(inputs);
    const reliabilityScore = calculateReliabilityScore(inputs);
    const safetyScore = calculateSafetyScore(inputs);
    const payoutScore = calculatePayoutScore(inputs);
    
    // Calculate weighted trust score
    const trustScore = Math.round(
      qualityScore * TRUST_SCORE_WEIGHTS.QUALITY +
      reliabilityScore * TRUST_SCORE_WEIGHTS.RELIABILITY +
      safetyScore * TRUST_SCORE_WEIGHTS.SAFETY +
      payoutScore * TRUST_SCORE_WEIGHTS.PAYOUT
    );
    
    // Determine trust level
    const level = determineTrustLevel(trustScore);
    
    // Create trust score document
    const trustScoreDoc: CreatorTrustScore = {
      userId,
      trustScore,
      level,
      qualityScore: Math.round(qualityScore),
      reliabilityScore: Math.round(reliabilityScore),
      safetyScore: Math.round(safetyScore),
      payoutScore: Math.round(payoutScore),
      lastUpdatedAt: Timestamp.now(),
    };
    
    // Store in Firestore
    await db
      .collection(TRUST_CONFIG.COLLECTIONS.TRUST_SCORES)
      .doc(userId)
      .set(trustScoreDoc, { merge: true });
    
    logger.info(`[PACK 324C] Trust score calculated: ${trustScore} (${level}) for user: ${userId}`);
    
    return trustScoreDoc;
  } catch (error) {
    logger.error(`[PACK 324C] Error calculating trust score for ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// DATA GATHERING (READ-ONLY)
// ============================================================================

/**
 * Gather all input data for trust score calculation
 * READ-ONLY - only reads from existing collections
 */
async function gatherTrustScoreInputs(userId: string): Promise<TrustScoreInputs> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - TRUST_CONFIG.RECALC_LOOKBACK_DAYS);
  
  // Get creator KPI data (PACK 324A)
  const kpiData = await getCreatorKpiData(userId, lookbackDate);
  
  // Get fraud/risk data (PACK 324B)
  const fraudData = await getFraudData(userId);
  
  // Get booking/calendar data
  const bookingData = await getBookingData(userId, lookbackDate);
  
  // Get payout data
  const payoutData = await getPayoutData(userId, lookbackDate);
  
  // Get moderation data
  const moderationData = await getModerationData(userId, lookbackDate);
  
  return {
    userId,
    ...kpiData,
    ...fraudData,
    ...bookingData,
    ...payoutData,
    ...moderationData,
  };
}

/**
 * Get creator KPI data from PACK 324A (READ-ONLY)
 */
async function getCreatorKpiData(userId: string, sinceDate: Date) {
  try {
    const dateStr = sinceDate.toISOString().split('T')[0];
    const snapshot = await db
      .collection('creatorKpiDaily')
      .where('userId', '==', userId)
      .where('date', '>=', dateStr)
      .get();
    
    let totalEarnedTokens = 0;
    let totalSessions = 0;
    let completedCalls = 0;
    let totalRatings = 0;
    let ratingCount = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      totalEarnedTokens += data.totalEarnedTokens || 0;
      totalSessions += data.sessionsCount || 0;
      
      // Estimate completed calls from sessions
      completedCalls += data.sessionsCount || 0;
    });
    
    // Get average rating from user reviews (if available)
    const reviewsSnapshot = await db
      .collection('reviews')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    reviewsSnapshot.docs.forEach(doc => {
      const rating = doc.data().rating;
      if (rating) {
        totalRatings += rating;
        ratingCount++;
      }
    });
    
    const averageRating = ratingCount > 0 ? totalRatings / ratingCount : 4.0;
    
    // Get refund count
    const refundsSnapshot = await db
      .collection('walletTransactions')
      .where('receiverId', '==', userId)
      .where('type', '==', 'REFUND')
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    const refundCount = refundsSnapshot.size;
    
    // Get total transactions
    const transactionsSnapshot = await db
      .collection('walletTransactions')
      .where('receiverId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    const totalTransactions = transactionsSnapshot.size;
    
    return {
      totalEarnedTokens,
      totalSessions,
      completedCalls,
      averageRating,
      refundCount,
      totalTransactions,
    };
  } catch (error) {
    logger.error(`[PACK 324C] Error getting KPI data for ${userId}:`, error);
    return {
      totalEarnedTokens: 0,
      totalSessions: 0,
      completedCalls: 0,
      averageRating: 0,
      refundCount: 0,
      totalTransactions: 0,
    };
  }
}

/**
 * Get fraud/risk data from PACK 324B (READ-ONLY)
 */
async function getFraudData(userId: string) {
  try {
    const riskDoc = await db
      .collection('userRiskScores')
      .doc(userId)
      .get();
    
    if (!riskDoc.exists) {
      return {
        riskScore: 0,
        riskLevel: 'LOW',
        fraudSignalCount: 0,
      };
    }
    
    const riskData = riskDoc.data();
    return {
      riskScore: riskData?.riskScore || 0,
      riskLevel: riskData?.level || 'LOW',
      fraudSignalCount: riskData?.signalCount || 0,
    };
  } catch (error) {
    logger.error(`[PACK 324C] Error getting fraud data for ${userId}:`, error);
    return {
      riskScore: 0,
      riskLevel: 'LOW',
      fraudSignalCount: 0,
    };
  }
}

/**
 * Get booking/calendar data (READ-ONLY)
 */
async function getBookingData(userId: string, sinceDate: Date) {
  try {
    const bookingsSnapshot = await db
      .collection('calendarBookings')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    let canceledByCreator = 0;
    let noShowCount = 0;
    const totalBookings = bookingsSnapshot.size;
    
    bookingsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === 'CANCELED' && data.canceledBy === userId) {
        canceledByCreator++;
      }
      if (data.status === 'NO_SHOW') {
        noShowCount++;
      }
    });
    
    return {
      canceledByCreator,
      noShowCount,
      totalBookings,
    };
  } catch (error) {
    logger.error(`[PACK 324C] Error getting booking data for ${userId}:`, error);
    return {
      canceledByCreator: 0,
      noShowCount: 0,
      totalBookings: 0,
    };
  }
}

/**
 * Get payout data (READ-ONLY)
 */
async function getPayoutData(userId: string, sinceDate: Date) {
  try {
    const payoutsSnapshot = await db
      .collection('payouts')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    let payoutFailures = 0;
    let payoutDisputes = 0;
    const payoutAttempts = payoutsSnapshot.size;
    
    payoutsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === 'FAILED') {
        payoutFailures++;
      }
      if (data.status === 'DISPUTED') {
        payoutDisputes++;
      }
    });
    
    return {
      payoutAttempts,
      payoutFailures,
      payoutDisputes,
    };
  } catch (error) {
    logger.error(`[PACK 324C] Error getting payout data for ${userId}:`, error);
    return {
      payoutAttempts: 0,
      payoutFailures: 0,
      payoutDisputes: 0,
    };
  }
}

/**
 * Get moderation data (READ-ONLY)
 */
async function getModerationData(userId: string, sinceDate: Date) {
  try {
    const moderationSnapshot = await db
      .collection('enforcement_logs')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sinceDate))
      .get();
    
    let warningsCount = 0;
    let bansCount = 0;
    
    moderationSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.action === 'WARNING') {
        warningsCount++;
      }
      if (data.action === 'BAN') {
        bansCount++;
      }
    });
    
    return {
      warningsCount,
      bansCount,
    };
  } catch (error) {
    logger.error(`[PACK 324C] Error getting moderation data for ${userId}:`, error);
    return {
      warningsCount: 0,
      bansCount: 0,
    };
  }
}

// ============================================================================
// COMPONENT SCORE CALCULATIONS
// ============================================================================

/**
 * Calculate quality score (0-100)
 * Based on: completion rate, ratings, refund rate, session volume
 */
function calculateQualityScore(inputs: TrustScoreInputs): number {
  const factors: QualityScoreFactors = {
    completionRate: inputs.totalSessions > 0 ? inputs.completedCalls / inputs.totalSessions : 0,
    averageRating: inputs.averageRating / 5.0, // Normalize to 0-1
    refundRate: inputs.totalTransactions > 0 ? inputs.refundCount / inputs.totalTransactions : 0,
    sessionVolume: Math.min(inputs.totalSessions / 100, 1.0), // Normalize, cap at 100
  };
  
  // Calculate weighted score
  let score = 0;
  score += factors.completionRate * 30; // 30 points
  score += factors.averageRating * 40;  // 40 points
  score += (1 - factors.refundRate) * 20; // 20 points (inverse)
  score += factors.sessionVolume * 10;   // 10 points
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate reliability score (0-100)
 * Based on: cancelation rate, no-show rate, consistency
 */
function calculateReliabilityScore(inputs: TrustScoreInputs): number {
  const factors: ReliabilityScoreFactors = {
    cancelationRate: inputs.totalBookings > 0 ? inputs.canceledByCreator / inputs.totalBookings : 0,
    noShowRate: inputs.totalBookings > 0 ? inputs.noShowCount / inputs.totalBookings : 0,
    consistencyScore: inputs.totalSessions > 10 ? 1.0 : inputs.totalSessions / 10,
  };
  
  // Calculate weighted score
  let score = 100;
  score -= factors.cancelationRate * 40; // -40 points max
  score -= factors.noShowRate * 40;      // -40 points max
  score += factors.consistencyScore * 20; // +20 points
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate safety score (0-100)
 * Based on: risk level, fraud signals, moderation actions
 */
function calculateSafetyScore(inputs: TrustScoreInputs): number {
  const factors: SafetyScoreFactors = {
    riskLevel: inputs.riskLevel,
    riskScore: inputs.riskScore,
    fraudSignals: inputs.fraudSignalCount,
    moderationActions: inputs.warningsCount + (inputs.bansCount * 3), // Bans weighted 3x
  };
  
  // Start with 100 and subtract penalties
  let score = 100;
  
  // Risk score penalty (0-100 risk score maps to 0-50 penalty)
  score -= (factors.riskScore / 2);
  
  // Fraud signals penalty (each signal -5 points, max -30)
  score -= Math.min(factors.fraudSignals * 5, 30);
  
  // Moderation penalty (each action -10 points, max -20)
  score -= Math.min(factors.moderationActions * 10, 20);
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate payout score (0-100)
 * Based on: payout success rate, dispute rate
 */
function calculatePayoutScore(inputs: TrustScoreInputs): number {
  if (inputs.payoutAttempts === 0) {
    return 100; // No payouts = perfect score (neutral)
  }
  
  const factors: PayoutScoreFactors = {
    payoutSuccessRate: (inputs.payoutAttempts - inputs.payoutFailures) / inputs.payoutAttempts,
    disputeRate: inputs.payoutDisputes / inputs.payoutAttempts,
    integrityScore: 1.0, // Default to perfect integrity
  };
  
  // Calculate score
  let score = 0;
  score += factors.payoutSuccessRate * 70; // 70 points for success rate
  score += (1 - factors.disputeRate) * 30; // 30 points for low disputes
  
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// TRUST LEVEL DETERMINATION
// ============================================================================

/**
 * Determine trust level from score
 */
function determineTrustLevel(score: number): TrustLevel {
  if (score >= TRUST_LEVEL_THRESHOLDS.ELITE.min) return 'ELITE';
  if (score >= TRUST_LEVEL_THRESHOLDS.HIGH.min) return 'HIGH';
  if (score >= TRUST_LEVEL_THRESHOLDS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
}

// ============================================================================
// BATCH RECALCULATION
// ============================================================================

/**
 * Recalculate trust scores for all active creators
 * Used by daily ranking job
 */
export async function recalculateAllCreatorTrustScores(): Promise<number> {
  logger.info('[PACK 324C] Starting batch trust score recalculation');
  
  try {
    // Get all creators who have earned tokens (active creators)
    const creatorsSnapshot = await db
      .collection('creatorKpiDaily')
      .where('totalEarnedTokens', '>', 0)
      .limit(1000) // Process in batches
      .get();
    
    // Get unique creator IDs
    const creatorIds = new Set<string>();
    creatorsSnapshot.docs.forEach(doc => {
      creatorIds.add(doc.data().userId);
    });
    
    logger.info(`[PACK 324C] Recalculating trust scores for ${creatorIds.size} creators`);
    
    // Process in batches to avoid timeouts
    const batchSize = 50;
    const creatorArray = Array.from(creatorIds);
    let processed = 0;
    
    for (let i = 0; i < creatorArray.length; i += batchSize) {
      const batch = creatorArray.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (userId) => {
          try {
            await recalculateCreatorTrustScore(userId);
            processed++;
          } catch (error) {
            logger.error(`[PACK 324C] Failed to recalculate for ${userId}:`, error);
          }
        })
      );
    }
    
    logger.info(`[PACK 324C] Completed trust score recalculation: ${processed} creators`);
    return processed;
  } catch (error) {
    logger.error('[PACK 324C] Error in batch recalculation:', error);
    throw error;
  }
}