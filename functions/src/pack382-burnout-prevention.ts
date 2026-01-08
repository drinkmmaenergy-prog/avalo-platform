/**
 * PACK 382 — Creator Burnout Prevention System
 * Detects and prevents creator burnout through automated monitoring
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  BurnoutAssessment,
  BurnoutLevel,
  DetectBurnoutInput,
  DetectBurnoutOutput,
  CreatorEarningProfile,
} from './types/pack382-types';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();

/**
 * Detect burnout risk for a creator
 */
export const pack382_detectCreatorBurnout = functions.https.onCall(
  async (
    data: DetectBurnoutInput,
    context
  ): Promise<DetectBurnoutOutput> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { userId = context.auth.uid, checkIntervalDays = 7 } = data;

    // Only allow users to check their own burnout (or admins)
    const isAdmin = context.auth.token?.role === 'admin';
    if (userId !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only check own burnout status'
      );
    }

    try {
      // Check for recent assessment
      const recentAssessment = await db
        .collection('burnoutAssessments')
        .where('userId', '==', userId)
        .where('detectedAt', '>', Timestamp.fromMillis(Date.now() - checkIntervalDays * 24 * 60 * 60 * 1000))
        .orderBy('detectedAt', 'desc')
        .limit(1)
        .get();

      if (!recentAssessment.empty && !data.checkIntervalDays) {
        // Return existing assessment
        const existing = recentAssessment.docs[0].data() as BurnoutAssessment;
        return {
          assessment: existing,
          actionsApplied: existing.actionsApplied.map(a => a.action),
          requiresAttention: existing.level === 'high' || existing.level === 'critical',
        };
      }

      // Get creator profile
      const profileDoc = await db
        .collection('creatorEarningProfiles')
        .doc(userId)
        .get();

      const profile = profileDoc.exists
        ? (profileDoc.data() as CreatorEarningProfile)
        : null;

      // Gather burnout indicators
      const factors = await gatherBurnoutFactors(userId, profile);

      // Calculate burnout score
      const score = calculateBurnoutScore(factors);
      const level = determineBurnoutLevel(score);

      // Generate recommendations
      const recommendations = generateBurnoutRecommendations(level, factors);
      const suggestedActions = generateSuggestedActions(level, factors);

      // Create assessment
      const assessment: BurnoutAssessment = {
        assessmentId: uuidv4(),
        userId,
        level,
        score,
        factors,
        recommendations,
        suggestedActions,
        actionsApplied: [],
        detectedAt: Timestamp.now(),
        nextCheckAt: Timestamp.fromMillis(
          Date.now() + checkIntervalDays * 24 * 60 * 60 * 1000
        ),
      };

      // Save assessment
      await db
        .collection('burnoutAssessments')
        .doc(assessment.assessmentId)
        .set(assessment);

      // Apply automated actions if critical
      const actionsApplied: string[] = [];
      if (level === 'critical' || level === 'high') {
        const appliedActions = await applyAutomatedActions(userId, level, factors);
        actionsApplied.push(...appliedActions);

        // Update assessment with applied actions
        await db
          .collection('burnoutAssessments')
          .doc(assessment.assessmentId)
          .update({
            actionsApplied: appliedActions.map(action => ({
              action,
              appliedAt: Timestamp.now(),
              result: 'applied',
            })),
          });
      }

      // Update creator profile with burnout risk
      if (profile) {
        await db
          .collection('creatorEarningProfiles')
          .doc(userId)
          .update({
            burnoutRiskScore: score,
            'riskSignals.burnoutDetected': level !== 'none' && level !== 'low',
            updatedAt: Timestamp.now(),
          });
      }

      return {
        assessment,
        actionsApplied,
        requiresAttention: level === 'high' || level === 'critical',
      };
    } catch (error) {
      console.error('Error detecting burnout:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to detect burnout'
      );
    }
  }
);

/**
 * Gather burnout risk factors
 */
async function gatherBurnoutFactors(
  userId: string,
  profile: CreatorEarningProfile | null
) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Workload factors
  const chatsLast7Days = await db
    .collection('chatSessions')
    .where('creatorId', '==', userId)
    .where('startedAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .count()
    .get();

  const presenceSessions = await db
    .collection('userPresence')
    .doc(userId)
    .collection('sessions')
    .where('startedAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get();

  let totalOnlineMinutes = 0;
  let daysOnline = new Set<string>();

  presenceSessions.forEach((doc) => {
    const session = doc.data();
    totalOnlineMinutes += session.durationMinutes || 0;
    const date = new Date(session.startedAt.toMillis()).toDateString();
    daysOnline.add(date);
  });

  const avgHoursPerDay = totalOnlineMinutes / (7 * 60);
  const daysWithoutBreak = daysOnline.size;

  // Quality decline indicators
  const recentRefunds = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('type', '==', 'refund')
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .count()
    .get();

  const recentRatings = await db
    .collection('ratings')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get();

  let recentAvgRating = 0;
  let lowRatings = 0;
  recentRatings.forEach((doc) => {
    const rating = doc.data().rating;
    recentAvgRating += rating;
    if (rating < 3) lowRatings++;
  });
  recentAvgRating = recentRatings.size > 0 ? recentAvgRating / recentRatings.size : 0;

  // Compare with historical data
  const historicalRatings = await db
    .collection('ratings')
    .where('creatorId', '==', userId)
    .where('createdAt', '<', Timestamp.fromMillis(sevenDaysAgo))
    .where('createdAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
    .get();

  let historicalAvgRating = 0;
  historicalRatings.forEach((doc) => {
    historicalAvgRating += doc.data().rating;
  });
  historicalAvgRating = historicalRatings.size > 0 ? historicalAvgRating / historicalRatings.size : 0;

  const satisfactionDrop =
    historicalAvgRating > 0
      ? ((historicalAvgRating - recentAvgRating) / historicalAvgRating) * 100
      : 0;

  // Safety issues
  const safetyReports = await db
    .collection('safetyReports')
    .where('reportedUserId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .count()
    .get();

  // Financial stress indicators
  const recentEarnings = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('type', '==', 'payment')
    .where('status', '==', 'completed')
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get();

  const historicalEarnings = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('type', '==', 'payment')
    .where('status', '==', 'completed')
    .where('createdAt', '<', Timestamp.fromMillis(sevenDaysAgo))
    .where('createdAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
    .get();

  let recentRevenue = 0;
  recentEarnings.forEach((doc) => {
    recentRevenue += doc.data().amount;
  });

  let historicalRevenue = 0;
  historicalEarnings.forEach((doc) => {
    historicalRevenue += doc.data().amount;
  });

  // Normalize to weekly
  const historicalWeeklyAvg = historicalRevenue / 3; // 3 weeks
  const revenueDrop =
    historicalWeeklyAvg > 0
      ? ((historicalWeeklyAvg - recentRevenue) / historicalWeeklyAvg) * 100
      : 0;

  return {
    excessiveWorkload: {
      detected:
        avgHoursPerDay > 10 ||
        chatsLast7Days.data().count > 150 ||
        daysWithoutBreak >= 7,
      chatsPerDay: chatsLast7Days.data().count / 7,
      hoursOnline: avgHoursPerDay,
      daysWithoutBreak,
    },
    qualityDecline: {
      detected: satisfactionDrop > 15 || lowRatings > 5 || recentRefunds.data().count > 3,
      responseDelayIncrease: 0, // Would need response time tracking
      satisfactionDrop,
      refundIncrease: recentRefunds.data().count,
    },
    negativeInteractions: {
      detected: safetyReports.data().count > 1 || lowRatings > 5,
      negativeRatings: lowRatings,
      safetyReports: safetyReports.data().count,
      conflictCount: 0, // Would need conflict tracking
    },
    financialStress: {
      detected: revenueDrop > 30,
      revenueDrop,
      inconsistentEarnings: revenueDrop > 50,
      refundRate: recentRefunds.data().count / Math.max(recentEarnings.size, 1),
    },
  };
}

/**
 * Calculate burnout score (0-100)
 */
function calculateBurnoutScore(factors: any): number {
  let score = 0;

  // Workload (40 points max)
  if (factors.excessiveWorkload.detected) {
    score += 20;
    if (factors.excessiveWorkload.hoursOnline > 12) score += 10;
    if (factors.excessiveWorkload.daysWithoutBreak >= 7) score += 10;
  }

  // Quality decline (30 points max)
  if (factors.qualityDecline.detected) {
    score += 15;
    if (factors.qualityDecline.satisfactionDrop > 20) score += 10;
    if (factors.qualityDecline.refundIncrease > 5) score += 5;
  }

  // Negative interactions (20 points max)
  if (factors.negativeInteractions.detected) {
    score += 10;
    score += Math.min(factors.negativeInteractions.safetyReports * 3, 10);
  }

  // Financial stress (10 points max)
  if (factors.financialStress.detected) {
    score += Math.min(factors.financialStress.revenueDrop / 5, 10);
  }

  return Math.min(score, 100);
}

/**
 * Determine burnout level
 */
function determineBurnoutLevel(score: number): BurnoutLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  if (score >= 10) return 'low';
  return 'none';
}

/**
 * Generate recommendations
 */
function generateBurnoutRecommendations(
  level: BurnoutLevel,
  factors: any
): string[] {
  const recommendations: string[] = [];

  if (level === 'critical') {
    recommendations.push('⚠️ CRITICAL: Immediate action required to prevent burnout');
    recommendations.push('Take at least 2-3 days off completely');
    recommendations.push('Reduce working hours by at least 50%');
  }

  if (factors.excessiveWorkload.detected) {
    recommendations.push('Reduce daily online hours to maximum 8 hours');
    recommendations.push('Take at least 1 day off per week');
    recommendations.push('Set strict boundaries for work hours');
  }

  if (factors.qualityDecline.detected) {
    recommendations.push('Focus on quality over quantity');
    recommendations.push('Reduce number of simultaneous chats');
    recommendations.push('Take breaks between sessions');
  }

  if (factors.negativeInteractions.detected) {
    recommendations.push('Review and update your interaction guidelines');
    recommendations.push('Consider blocking problematic users');
    recommendations.push('Complete safety training course');
  }

  if (factors.financialStress.detected) {
    recommendations.push('Review and optimize your pricing strategy');
    recommendations.push('Focus on high-value activities');
    recommendations.push('Consider diversifying income sources');
  }

  return recommendations;
}

/**
 * Generate suggested actions
 */
function generateSuggestedActions(level: BurnoutLevel, factors: any) {
  const actions:Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    automated: boolean;
  }> = [];

  if (level === 'critical') {
    actions.push({
      action: 'Enable automatic "away" mode',
      priority: 'high',
      automated: true,
    });
    actions.push({
      action: 'Temporarily hide from discovery',
      priority: 'high',
      automated: true,
    });
    actions.push({
      action: 'Reduce maximum daily chat limit',
      priority: 'high',
      automated: true,
    });
  }

  if (level === 'high') {
    actions.push({
      action: 'Limit daily chat sessions to 50',
      priority: 'high',
      automated: true,
    });
    actions.push({
      action: 'Enable mandatory breaks every 2 hours',
      priority: 'medium',
      automated: true,
    });
  }

  if (factors.qualityDecline.detected) {
    actions.push({
      action: 'Review recent refund reasons',
      priority: 'high',
      automated: false,
    });
    actions.push({
      action: 'Update profile expectations',
      priority: 'medium',
      automated: false,
    });
  }

  if (factors.negativeInteractions.detected) {
    actions.push({
      action: 'Enable AI companion assistance',
      priority: 'medium',
      automated: true,
    });
    actions.push({
      action: 'Review safety guidelines',
      priority: 'high',
      automated: false,
    });
  }

  return actions;
}

/**
 * Apply automated burnout prevention actions
 */
async function applyAutomatedActions(
  userId: string,
  level: BurnoutLevel,
  factors: any
): Promise<string[]> {
  const applied: string[] = [];

  try {
    const updates: any = {};

    if (level === 'critical') {
      // Enable away mode
      updates.availabilityStatus = 'away';
      updates.awayReason = 'burnout_prevention';
      updates.awayUntil = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);
      applied.push('Enabled away mode for 3 days');

      // Hide from discovery
      updates.discoveryVisible = false;
      applied.push('Temporarily hidden from discovery');

      // Set daily limit
      updates.maxDailyChats = 20;
      applied.push('Reduced daily chat limit to 20');
    } else if (level === 'high') {
      // Moderate restrictions
      updates.maxDailyChats = 50;
      applied.push('Limited daily chats to 50');

      updates.mandatoryBreakMinutes = 120;
      applied.push('Enabled 2-hour mandatory breaks');
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('users').doc(userId).update(updates);
    }

    // Create notification
    await db.collection('notifications').add({
      userId,
      type: 'burnout_warning',
      level,
      title: 'Burnout Prevention',
      message: `Your wellbeing is important. We've applied protective measures to help you recover.`,
      actionsApplied: applied,
      createdAt: Timestamp.now(),
      read: false,
    });
    applied.push('Sent burnout prevention notification');
  } catch (error) {
    console.error('Error applying automated actions:', error);
  }

  return applied;
}

/**
 * Resolve burnout assessment
 */
export const pack382_resolveBurnout = functions.https.onCall(
  async (data: { assessmentId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { assessmentId } = data;

    try {
      await db
        .collection('burnoutAssessments')
        .doc(assessmentId)
        .update({
          resolvedAt: Timestamp.now(),
        });

      return { success: true };
    } catch (error) {
      console.error('Error resolving burnout:', error);
      throw new functions.https.HttpsError('internal', 'Failed to resolve');
    }
  }
);

/**
 * Scheduled job: Daily burnout monitoring
 */
export const pack382_dailyBurnoutMonitoring = functions.pubsub
  .schedule('0 1 * * *') // 1 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK382] Starting daily burnout monitoring...');

    // Get active creators
    const activeCreators = await db
      .collection('creatorEarningProfiles')
      .where('burnoutRiskScore', '>=', 50)
      .get();

    let assessmentsCreated = 0;
    let actionsApplied = 0;

    for (const creatorDoc of activeCreators.docs) {
      const profile = creatorDoc.data() as CreatorEarningProfile;
      const userId = profile.userId;

      try {
        // Check burnout
        const factors = await gatherBurnoutFactors(userId, profile);
        const score = calculateBurnoutScore(factors);
        const level = determineBurnoutLevel(score);

        if (level === 'high' || level === 'critical') {
          // Create assessment
          const recommendations = generateBurnoutRecommendations(level, factors);
          const suggestedActions = generateSuggestedActions(level, factors);

          const assessment: BurnoutAssessment = {
            assessmentId: uuidv4(),
            userId,
            level,
            score,
            factors,
            recommendations,
            suggestedActions,
            actionsApplied: [],
            detectedAt: Timestamp.now(),
            nextCheckAt: Timestamp.fromMillis(Date.now() + 1 * 24 * 60 * 60 * 1000),
          };

          await db
            .collection('burnoutAssessments')
            .doc(assessment.assessmentId)
            .set(assessment);

          assessmentsCreated++;

          // Apply automated actions
          const applied = await applyAutomatedActions(userId, level, factors);
          actionsApplied += applied.length;

          // Update assessment
          await db
            .collection('burnoutAssessments')
            .doc(assessment.assessmentId)
            .update({
              actionsApplied: applied.map(action => ({
                action,
                appliedAt: Timestamp.now(),
                result: 'applied',
              })),
            });
        }
      } catch (error) {
        console.error(`Error monitoring creator ${userId}:`, error);
      }
    }

    console.log(
      `[PACK382] Created ${assessmentsCreated} burnout assessments, applied ${actionsApplied} actions`
    );
    return null;
  });
