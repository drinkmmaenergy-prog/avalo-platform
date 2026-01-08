/**
 * PACK 324B — Risk Score Calculation Engine
 * 
 * Aggregates fraud signals and calculates user risk scores
 * READ-ONLY impact - does not ban or block users
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  UserRiskScore,
  RiskLevel,
  FraudSignal,
  SEVERITY_POINTS,
  RISK_LEVEL_THRESHOLDS,
  SIGNAL_DECAY_CONFIG,
  FRAUD_CONFIG,
} from './pack324b-fraud-types';

// ============================================================================
// RISK SCORE CALCULATION
// ============================================================================

/**
 * Calculate risk level from score
 */
function calculateRiskLevel(score: number): RiskLevel {
  if (score >= RISK_LEVEL_THRESHOLDS.CRITICAL.min) {
    return 'CRITICAL';
  } else if (score >= RISK_LEVEL_THRESHOLDS.HIGH.min) {
    return 'HIGH';
  } else if (score >= RISK_LEVEL_THRESHOLDS.MEDIUM.min) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Calculate signal weight based on age (time decay)
 */
function calculateSignalWeight(signalDate: Date): number {
  const now = new Date();
  const ageInDays = (now.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (ageInDays <= SIGNAL_DECAY_CONFIG.DECAY_DAYS) {
    return 1.0; // Full weight for recent signals
  }
  
  // Calculate exponential decay
  const decayPeriods = Math.floor(ageInDays / SIGNAL_DECAY_CONFIG.DECAY_DAYS);
  const weight = Math.pow(SIGNAL_DECAY_CONFIG.DECAY_RATE, decayPeriods);
  
  // Apply minimum weight
  return Math.max(weight, SIGNAL_DECAY_CONFIG.MIN_WEIGHT);
}

/**
 * Recalculate risk score for a user based on their fraud signals
 */
export async function recalculateUserRiskScore(
  userId: string
): Promise<UserRiskScore> {
  try {
    logger.info(`Recalculating risk score for user ${userId}`);
    
    // Get all fraud signals for this user within lookback period
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - FRAUD_CONFIG.RECALC_LOOKBACK_DAYS);
    
    const signalsSnapshot = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(lookbackDate))
      .orderBy('createdAt', 'desc')
      .get();
    
    let totalScore = 0;
    let lastSignal: FraudSignal | null = null;
    
    // Calculate weighted score from all signals
    signalsSnapshot.forEach(doc => {
      const signal = doc.data() as FraudSignal;
      
      if (!lastSignal) {
        lastSignal = signal;
      }
      
      // Get base points for severity
      const basePoints = SEVERITY_POINTS[signal.severity];
      
      // Apply time decay
      const signalDate = signal.createdAt.toDate();
      const weight = calculateSignalWeight(signalDate);
      
      // Add weighted points
      totalScore += basePoints * weight;
    });
    
    // Cap at 100
    const riskScore = Math.min(Math.round(totalScore), 100);
    const level = calculateRiskLevel(riskScore);
    
    // Create or update risk score document
    const riskScoreDoc: UserRiskScore = {
      userId,
      riskScore,
      level,
      signalCount: signalsSnapshot.size,
      lastSignalType: lastSignal?.signalType,
      lastSignalDate: lastSignal?.createdAt,
      lastUpdatedAt: Timestamp.now(),
    };
    
    // Write to database
    await db
      .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
      .doc(userId)
      .set(riskScoreDoc, { merge: true });
    
    logger.info(`Risk score calculated for user ${userId}:`, {
      riskScore,
      level,
      signalCount: signalsSnapshot.size,
    });
    
    return riskScoreDoc;
  } catch (error) {
    logger.error(`Error recalculating risk score for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Batch recalculate risk scores for multiple users
 */
export async function batchRecalculateRiskScores(
  userIds: string[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  logger.info(`Batch recalculating risk scores for ${userIds.length} users`);
  
  for (const userId of userIds) {
    try {
      await recalculateUserRiskScore(userId);
      success++;
    } catch (error) {
      logger.error(`Failed to recalculate risk score for ${userId}:`, error);
      failed++;
    }
  }
  
  logger.info(`Batch recalculation complete: ${success} success, ${failed} failed`);
  
  return { success, failed };
}

/**
 * Get users who need risk score recalculation
 * (users with recent signals but no risk score or outdated score)
 */
export async function getUsersNeedingRecalculation(
  limit: number = 100
): Promise<string[]> {
  try {
    // Get users with recent signals
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const recentSignalsSnapshot = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .where('createdAt', '>=', Timestamp.fromDate(oneDayAgo))
      .limit(limit * 2) // Get more than needed to account for duplicates
      .get();
    
    const userIds = new Set<string>();
    
    recentSignalsSnapshot.forEach(doc => {
      const signal = doc.data() as FraudSignal;
      userIds.add(signal.userId);
    });
    
    // Filter to users who don't have recent risk score updates
    const usersNeedingUpdate: string[] = [];
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    for (const userId of Array.from(userIds)) {
      const riskScoreSnapshot = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
        .doc(userId)
        .get();
      
      if (!riskScoreSnapshot.exists) {
        usersNeedingUpdate.push(userId);
      } else {
        const riskScore = riskScoreSnapshot.data() as UserRiskScore;
        const lastUpdated = riskScore.lastUpdatedAt.toDate();
        
        if (lastUpdated < oneHourAgo) {
          usersNeedingUpdate.push(userId);
        }
      }
      
      if (usersNeedingUpdate.length >= limit) {
        break;
      }
    }
    
    return usersNeedingUpdate;
  } catch (error) {
    logger.error('Error getting users needing recalculation:', error);
    return [];
  }
}

/**
 * Scheduled job to recalculate risk scores for users with new signals
 * Should be called every hour
 */
export async function scheduledRiskScoreRecalculation(): Promise<{
  processed: number;
  success: number;
  failed: number;
}> {
  try {
    logger.info('Starting scheduled risk score recalculation');
    
    const userIds = await getUsersNeedingRecalculation(FRAUD_CONFIG.RECALC_BATCH_SIZE);
    
    if (userIds.length === 0) {
      logger.info('No users need risk score recalculation');
      return { processed: 0, success: 0, failed: 0 };
    }
    
    const result = await batchRecalculateRiskScores(userIds);
    
    logger.info('Scheduled risk score recalculation complete:', result);
    
    return {
      processed: userIds.length,
      success: result.success,
      failed: result.failed,
    };
  } catch (error) {
    logger.error('Error in scheduled risk score recalculation:', error);
    return { processed: 0, success: 0, failed: 0 };
  }
}

/**
 * Get user's current risk score
 */
export async function getUserRiskScore(
  userId: string
): Promise<UserRiskScore | null> {
  try {
    const riskScoreSnapshot = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
      .doc(userId)
      .get();
    
    if (!riskScoreSnapshot.exists) {
      return null;
    }
    
    return riskScoreSnapshot.data() as UserRiskScore;
  } catch (error) {
    logger.error(`Error getting risk score for user ${userId}:`, error);
    return null;
  }
}

/**
 * Get high risk users
 */
export async function getHighRiskUsers(
  minLevel: RiskLevel = 'HIGH',
  limit: number = 50
): Promise<UserRiskScore[]> {
  try {
    const levelsToQuery: RiskLevel[] = [];
    
    if (minLevel === 'MEDIUM') {
      levelsToQuery.push('MEDIUM', 'HIGH', 'CRITICAL');
    } else if (minLevel === 'HIGH') {
      levelsToQuery.push('HIGH', 'CRITICAL');
    } else if (minLevel === 'CRITICAL') {
      levelsToQuery.push('CRITICAL');
    }
    
    const highRiskSnapshot = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
      .where('level', 'in', levelsToQuery)
      .orderBy('riskScore', 'desc')
      .limit(limit)
      .get();
    
    const highRiskUsers: UserRiskScore[] = [];
    
    highRiskSnapshot.forEach(doc => {
      highRiskUsers.push(doc.data() as UserRiskScore);
    });
    
    return highRiskUsers;
  } catch (error) {
    logger.error('Error getting high risk users:', error);
    return [];
  }
}

/**
 * Get risk statistics
 */
export async function getRiskStatistics(): Promise<{
  totalUsers: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
  averageScore: number;
}> {
  try {
    const allScoresSnapshot = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
      .get();
    
    let totalUsers = 0;
    let lowRisk = 0;
    let mediumRisk = 0;
    let highRisk = 0;
    let criticalRisk = 0;
    let totalScore = 0;
    
    allScoresSnapshot.forEach(doc => {
      const score = doc.data() as UserRiskScore;
      totalUsers++;
      totalScore += score.riskScore;
      
      switch (score.level) {
        case 'LOW':
          lowRisk++;
          break;
        case 'MEDIUM':
          mediumRisk++;
          break;
        case 'HIGH':
          highRisk++;
          break;
        case 'CRITICAL':
          criticalRisk++;
          break;
      }
    });
    
    const averageScore = totalUsers > 0 ? Math.round(totalScore / totalUsers) : 0;
    
    return {
      totalUsers,
      lowRisk,
      mediumRisk,
      highRisk,
      criticalRisk,
      averageScore,
    };
  } catch (error) {
    logger.error('Error getting risk statistics:', error);
    return {
      totalUsers: 0,
      lowRisk: 0,
      mediumRisk: 0,
      highRisk: 0,
      criticalRisk: 0,
      averageScore: 0,
    };
  }
}

/**
 * Check if user should be flagged for manual review
 */
export async function shouldFlagForReview(
  userId: string
): Promise<{
  shouldFlag: boolean;
  reason?: string;
  riskLevel?: RiskLevel;
}> {
  try {
    const riskScore = await getUserRiskScore(userId);
    
    if (!riskScore) {
      return { shouldFlag: false };
    }
    
    // Flag HIGH and CRITICAL risk users
    if (riskScore.level === 'CRITICAL') {
      return {
        shouldFlag: true,
        reason: 'Critical risk level detected',
        riskLevel: 'CRITICAL',
      };
    }
    
    if (riskScore.level === 'HIGH' && riskScore.signalCount >= 5) {
      return {
        shouldFlag: true,
        reason: 'High risk level with multiple signals',
        riskLevel: 'HIGH',
      };
    }
    
    return { shouldFlag: false };
  } catch (error) {
    logger.error(`Error checking if user ${userId} should be flagged:`, error);
    return { shouldFlag: false };
  }
}