/**
 * PACK 140 — Avalo Reputation System 2.0
 * Core reputation calculation and management engine
 */

import * as admin from 'firebase-admin';
import {
  ReputationScore,
  ReputationEvent,
  ReputationHistoryEntry,
  ReputationInsights,
  ReputationProtection,
  ReputationRecovery,
  ReputationEventType,
  ReputationDimension,
  ReputationVisibilityContext,
  REPUTATION_SCORE_IMPACTS,
  calculateOverallScore,
  clampScore,
  applyScoreFloor,
  getDimensionForEvent,
  generateReasonString,
  generateSuggestions,
  validateReputationEvent,
  isBlockedReporter,
  detectMassReportCampaign,
  calculateReviewImpact,
} from './types/reputation.types';

const db = admin.firestore();

// ============================================================================
// CORE REPUTATION FUNCTIONS
// ============================================================================

/**
 * Record a reputation event
 * This is the primary entry point for all reputation changes
 */
export async function recordReputationEvent(params: {
  userId: string;
  eventType: ReputationEventType;
  context: {
    type: string;
    referenceId?: string;
    description: string;
  };
  source: string;
  customScoreImpact?: number;
  reporterId?: string;
}): Promise<{
  success: boolean;
  eventId?: string;
  message: string;
}> {
  const { userId, eventType, context, source, customScoreImpact, reporterId } = params;
  
  try {
    // If this is a user-generated report, check for weaponization
    if (reporterId) {
      const protection = await getReputationProtection(userId);
      
      // Check if reporter is blocked
      if (isBlockedReporter(protection, reporterId)) {
        console.log(`Blocked reporter ${reporterId} attempted to report ${userId}`);
        return {
          success: false,
          message: 'Report ignored from blocked reporter',
        };
      }
    }
    
    // Determine dimension and score impact
    const dimension = getDimensionForEvent(eventType);
    const scoreImpact = customScoreImpact ?? REPUTATION_SCORE_IMPACTS[eventType];
    
    // Create event document
    const eventRef = db.collection('reputation_events').doc();
    const event: ReputationEvent = {
      eventId: eventRef.id,
      userId,
      eventType,
      dimension,
      scoreImpact,
      context,
      source,
      createdAt: admin.firestore.Timestamp.now(),
    };
    
    // Validate event
    const validation = validateReputationEvent(event);
    if (!validation.valid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }
    
    // Write event
    await eventRef.create(event);
    
    // Recalculate reputation score
    await calculateReputationScore(userId);
    
    // Add to history for insights
    await addHistoryEntry(userId, dimension, scoreImpact, eventType);
    
    return {
      success: true,
      eventId: eventRef.id,
      message: 'Reputation event recorded successfully',
    };
  } catch (error) {
    console.error('Error recording reputation event:', error);
    throw error;
  }
}

/**
 * Calculate reputation score for a user
 * Aggregates all events and computes dimension scores
 */
export async function calculateReputationScore(userId: string): Promise<ReputationScore> {
  try {
    // Get all events for user
    const eventsSnapshot = await db
      .collection('reputation_events')
      .where('userId', '==', userId)
      .get();
    
    // Initialize dimension scores (start at 100 for new users)
    const dimensionScores: Record<ReputationDimension, number> = {
      [ReputationDimension.RELIABILITY]: 100,
      [ReputationDimension.COMMUNICATION]: 100,
      [ReputationDimension.DELIVERY]: 100,
      [ReputationDimension.EXPERTISE]: 100,
      [ReputationDimension.SAFETY_CONSISTENCY]: 100,
    };
    
    // Apply all events
    eventsSnapshot.forEach(doc => {
      const event = doc.data() as ReputationEvent;
      dimensionScores[event.dimension] = clampScore(
        dimensionScores[event.dimension] + event.scoreImpact
      );
    });
    
    // Apply score floor (never below 40 from user ratings)
    // Note: We don't track which events are from user ratings here,
    // but the floor is applied at the dimension level
    Object.keys(dimensionScores).forEach(key => {
      const dimension = key as ReputationDimension;
      dimensionScores[dimension] = applyScoreFloor(dimensionScores[dimension], false);
    });
    
    // Calculate overall score
    const overallScore = calculateOverallScore(
      dimensionScores[ReputationDimension.RELIABILITY],
      dimensionScores[ReputationDimension.COMMUNICATION],
      dimensionScores[ReputationDimension.DELIVERY],
      dimensionScores[ReputationDimension.EXPERTISE],
      dimensionScores[ReputationDimension.SAFETY_CONSISTENCY]
    );
    
    // Get existing score document
    const scoreRef = db.collection('reputation_scores').doc(userId);
    const existingDoc = await scoreRef.get();
    const currentVersion = existingDoc.exists ? (existingDoc.data()?.version ?? 0) : 0;
    
    // Create/update score document
    const score: ReputationScore = {
      userId,
      reliability: dimensionScores[ReputationDimension.RELIABILITY],
      communication: dimensionScores[ReputationDimension.COMMUNICATION],
      delivery: dimensionScores[ReputationDimension.DELIVERY],
      expertiseValidation: dimensionScores[ReputationDimension.EXPERTISE],
      safetyConsistency: dimensionScores[ReputationDimension.SAFETY_CONSISTENCY],
      overallScore,
      lastCalculatedAt: admin.firestore.Timestamp.now(),
      totalEvents: eventsSnapshot.size,
      version: currentVersion + 1,
      createdAt: existingDoc.exists
        ? existingDoc.data()!.createdAt
        : admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };
    
    await scoreRef.set(score, { merge: true });
    
    return score;
  } catch (error) {
    console.error('Error calculating reputation score:', error);
    throw error;
  }
}

/**
 * Get reputation score for a user
 */
export async function getReputationScore(userId: string): Promise<ReputationScore | null> {
  try {
    const scoreDoc = await db.collection('reputation_scores').doc(userId).get();
    
    if (!scoreDoc.exists) {
      // Initialize new user with perfect score
      const newScore: ReputationScore = {
        userId,
        reliability: 100,
        communication: 100,
        delivery: 100,
        expertiseValidation: 100,
        safetyConsistency: 100,
        overallScore: 100,
        lastCalculatedAt: admin.firestore.Timestamp.now(),
        totalEvents: 0,
        version: 1,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };
      
      await db.collection('reputation_scores').doc(userId).set(newScore);
      return newScore;
    }
    
    return scoreDoc.data() as ReputationScore;
  } catch (error) {
    console.error('Error getting reputation score:', error);
    throw error;
  }
}

/**
 * Get reputation insights for user display
 */
export async function getReputationInsights(userId: string): Promise<ReputationInsights> {
  try {
    // Get current score
    const score = await getReputationScore(userId);
    if (!score) {
      throw new Error('Score not found');
    }
    
    // Get recent history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const historySnapshot = await db
      .collection('reputation_history')
      .where('userId', '==', userId)
      .where('date', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .orderBy('date', 'desc')
      .limit(10)
      .get();
    
    const recentChanges = historySnapshot.docs.map(doc => {
      const entry = doc.data() as ReputationHistoryEntry;
      return {
        dimension: entry.dimension,
        change: entry.change,
        reason: entry.reason,
        date: entry.date,
      };
    });
    
    // Generate suggestions
    const suggestions = generateSuggestions({
      reliability: score.reliability,
      communication: score.communication,
      delivery: score.delivery,
      expertiseValidation: score.expertiseValidation,
      safetyConsistency: score.safetyConsistency,
    });
    
    // Determine visibility contexts
    const visibleContexts = [
      ReputationVisibilityContext.MENTORSHIP_BOOKING,
      ReputationVisibilityContext.DIGITAL_PRODUCT_PURCHASE,
      ReputationVisibilityContext.PAID_CLUB_JOIN,
      ReputationVisibilityContext.PAID_EVENT_JOIN,
    ];
    
    const insights: ReputationInsights = {
      userId,
      scores: {
        reliability: score.reliability,
        communication: score.communication,
        delivery: score.delivery,
        expertiseValidation: score.expertiseValidation,
        safetyConsistency: score.safetyConsistency,
        overall: score.overallScore,
      },
      recentChanges,
      suggestions,
      visibleContexts,
      lastUpdatedAt: admin.firestore.Timestamp.now(),
    };
    
    return insights;
  } catch (error) {
    console.error('Error getting reputation insights:', error);
    throw error;
  }
}

/**
 * Add entry to reputation history (for user insights)
 */
async function addHistoryEntry(
  userId: string,
  dimension: ReputationDimension,
  change: number,
  eventType: ReputationEventType
): Promise<void> {
  try {
    const entryRef = db.collection('reputation_history').doc();
    const reason = generateReasonString(eventType, change);
    
    const entry: ReputationHistoryEntry = {
      entryId: entryRef.id,
      userId,
      dimension,
      change,
      reason,
      date: admin.firestore.Timestamp.now(),
    };
    
    await entryRef.create(entry);
  } catch (error) {
    console.error('Error adding history entry:', error);
    // Don't throw - history is supplementary
  }
}

// ============================================================================
// ANTI-WEAPONIZATION PROTECTION
// ============================================================================

/**
 * Get reputation protection settings
 */
export async function getReputationProtection(userId: string): Promise<ReputationProtection> {
  try {
    const protectionDoc = await db
      .collection('reputation_protection')
      .doc(userId)
      .get();
    
    if (!protectionDoc.exists) {
      // Initialize protection
      const protection: ReputationProtection = {
        userId,
        blockedReporterIds: [],
        massReportCampaigns: [],
        minimumScoreFloor: 40,
        flagsPendingVerification: [],
        lastUpdatedAt: admin.firestore.Timestamp.now(),
      };
      
      await db.collection('reputation_protection').doc(userId).set(protection);
      return protection;
    }
    
    return protectionDoc.data() as ReputationProtection;
  } catch (error) {
    console.error('Error getting reputation protection:', error);
    throw error;
  }
}

/**
 * Block a reporter from affecting user's reputation
 */
export async function blockReporter(userId: string, reporterId: string): Promise<void> {
  try {
    const protection = await getReputationProtection(userId);
    
    if (!protection.blockedReporterIds.includes(reporterId)) {
      protection.blockedReporterIds.push(reporterId);
      protection.lastUpdatedAt = admin.firestore.Timestamp.now();
      
      await db.collection('reputation_protection').doc(userId).set(protection);
    }
  } catch (error) {
    console.error('Error blocking reporter:', error);
    throw error;
  }
}

/**
 * Detect and handle mass report campaigns
 */
export async function checkForMassReportCampaign(
  userId: string,
  reporterId: string
): Promise<boolean> {
  try {
    // Get recent reports against this user
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const recentReportsSnapshot = await db
      .collection('reputation_events')
      .where('userId', '==', userId)
      .where('source', '==', 'user_report')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(oneHourAgo))
      .get();
    
    const recentReports = recentReportsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        reporterId: data.context?.reporterId || 'unknown',
        timestamp: data.createdAt,
      };
    });
    
    const isCampaign = detectMassReportCampaign(recentReports);
    
    if (isCampaign) {
      // Log campaign
      const protection = await getReputationProtection(userId);
      protection.massReportCampaigns.push({
        campaignId: db.collection('reputation_protection').doc().id,
        detectedAt: admin.firestore.Timestamp.now(),
        reporterCount: new Set(recentReports.map(r => r.reporterId)).size,
        invalidated: true,
      });
      protection.lastUpdatedAt = admin.firestore.Timestamp.now();
      
      await db.collection('reputation_protection').doc(userId).set(protection);
      
      console.log(`Mass report campaign detected against user ${userId}`);
    }
    
    return isCampaign;
  } catch (error) {
    console.error('Error checking for mass report campaign:', error);
    return false;
  }
}

/**
 * Add AI Patrol flag pending human verification
 */
export async function addFlagPendingVerification(
  userId: string,
  flagId: string,
  type: string,
  severity: string
): Promise<void> {
  try {
    const protection = await getReputationProtection(userId);
    
    protection.flagsPendingVerification.push({
      flagId,
      type,
      severity,
      createdAt: admin.firestore.Timestamp.now(),
    });
    protection.lastUpdatedAt = admin.firestore.Timestamp.now();
    
    await db.collection('reputation_protection').doc(userId).set(protection);
  } catch (error) {
    console.error('Error adding flag pending verification:', error);
    throw error;
  }
}

/**
 * Verify and process pending AI Patrol flag
 */
export async function verifyAndProcessFlag(
  userId: string,
  flagId: string,
  approved: boolean,
  verifiedBy: string
): Promise<void> {
  try {
    const protection = await getReputationProtection(userId);
    
    // Find and remove flag
    const flagIndex = protection.flagsPendingVerification.findIndex(
      f => f.flagId === flagId
    );
    
    if (flagIndex === -1) {
      throw new Error('Flag not found');
    }
    
    const flag = protection.flagsPendingVerification[flagIndex];
    protection.flagsPendingVerification.splice(flagIndex, 1);
    protection.lastUpdatedAt = admin.firestore.Timestamp.now();
    
    await db.collection('reputation_protection').doc(userId).set(protection);
    
    // If approved, record reputation event
    if (approved) {
      await recordReputationEvent({
        userId,
        eventType: ReputationEventType.TRUST_FLAG_ADDED,
        context: {
          type: 'ai_patrol_flag',
          referenceId: flagId,
          description: `AI Patrol flag verified and approved: ${flag.type}`,
        },
        source: 'ai_patrol_verified',
      });
    }
  } catch (error) {
    console.error('Error verifying flag:', error);
    throw error;
  }
}

// ============================================================================
// RECOVERY SYSTEM
// ============================================================================

/**
 * Start reputation recovery tracking
 */
export async function startReputationRecovery(
  userId: string,
  dimension: ReputationDimension
): Promise<ReputationRecovery> {
  try {
    const recoveryRef = db
      .collection('reputation_recovery')
      .doc(`${userId}_${dimension}`);
    
    const recovery: ReputationRecovery = {
      userId,
      dimension,
      currentStreak: 0,
      requiredStreak: 30, // 30 days of good behavior
      recoveryPoints: 0,
      targetPoints: 50,
      startedAt: admin.firestore.Timestamp.now(),
    };
    
    await recoveryRef.set(recovery);
    return recovery;
  } catch (error) {
    console.error('Error starting reputation recovery:', error);
    throw error;
  }
}

/**
 * Update reputation recovery progress
 */
export async function updateRecoveryProgress(
  userId: string,
  dimension: ReputationDimension,
  points: number
): Promise<void> {
  try {
    const recoveryRef = db
      .collection('reputation_recovery')
      .doc(`${userId}_${dimension}`);
    
    const recoveryDoc = await recoveryRef.get();
    if (!recoveryDoc.exists) {
      return; // No active recovery
    }
    
    const recovery = recoveryDoc.data() as ReputationRecovery;
    
    recovery.recoveryPoints += points;
    recovery.currentStreak += 1;
    
    // Check if recovery complete
    if (
      recovery.recoveryPoints >= recovery.targetPoints &&
      recovery.currentStreak >= recovery.requiredStreak
    ) {
      recovery.completedAt = admin.firestore.Timestamp.now();
      
      // Award recovery bonus
      await recordReputationEvent({
        userId,
        eventType: ReputationEventType.NO_SAFETY_INCIDENTS,
        context: {
          type: 'reputation_recovery',
          description: `Completed ${dimension} recovery program`,
        },
        source: 'reputation_recovery',
        customScoreImpact: 10,
      });
    }
    
    await recoveryRef.set(recovery);
  } catch (error) {
    console.error('Error updating recovery progress:', error);
    throw error;
  }
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Check if reputation is sufficient for action
 * Used by other systems (mentorship booking, etc.)
 */
export async function checkReputationRequirement(
  userId: string,
  minimumScore: number = 50
): Promise<{
  meets: boolean;
  currentScore: number;
  message: string;
}> {
  try {
    const score = await getReputationScore(userId);
    
    if (!score) {
      return {
        meets: false,
        currentScore: 0,
        message: 'Reputation score not found',
      };
    }
    
    const meets = score.overallScore >= minimumScore;
    
    return {
      meets,
      currentScore: score.overallScore,
      message: meets
        ? 'Reputation requirement met'
        : `Reputation score (${score.overallScore}) below minimum (${minimumScore})`,
    };
  } catch (error) {
    console.error('Error checking reputation requirement:', error);
    throw error;
  }
}

/**
 * Get reputation badge for display
 */
export function getReputationBadge(overallScore: number): {
  level: string;
  color: string;
  icon: string;
} {
  if (overallScore >= 90) {
    return { level: 'Excellent', color: '#10B981', icon: '⭐' };
  }
  if (overallScore >= 75) {
    return { level: 'Very Good', color: '#3B82F6', icon: '✓' };
  }
  if (overallScore >= 60) {
    return { level: 'Good', color: '#6366F1', icon: '✓' };
  }
  if (overallScore >= 40) {
    return { level: 'Fair', color: '#F59E0B', icon: '⚠' };
  }
  return { level: 'Needs Improvement', color: '#EF4444', icon: '!' };
}