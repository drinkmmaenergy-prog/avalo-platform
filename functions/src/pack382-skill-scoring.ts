/**
 * PACK 382 — Creator Skill Scoring & Profiling System
 * Automated creator earnings profile and skill tier calculation
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  CreatorEarningProfile,
  SkillTier,
  CalculateSkillScoreInput,
  CalculateSkillScoreOutput,
} from './types/pack382-types';

const db = getFirestore();

/**
 * Calculate comprehensive skill score for a creator
 * Evaluates performance across all earning activities
 */
export const pack382_calculateCreatorSkillScore = functions.https.onCall(
  async (
    data: CalculateSkillScoreInput,
    context
  ): Promise<CalculateSkillScoreOutput> => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { userId = context.auth.uid, forceRecalculate = false } = data;

    // Only allow users to calculate their own score (or admins)
    const isAdmin = context.auth.token?.role === 'admin';
    if (userId !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only calculate own skill score'
      );
    }

    try {
      // Check if recent profile exists
      if (!forceRecalculate) {
        const existingProfile = await db
          .collection('creatorEarningProfiles')
          .doc(userId)
          .get();

        if (existingProfile.exists) {
          const profile = existingProfile.data() as CreatorEarningProfile;
          const hoursSinceLastCalc =
            (Date.now() - profile.lastCalculatedAt.toMillis()) /
            (1000 * 60 * 60);

          // Use cached if less than 24 hours old
          if (hoursSinceLastCalc < 24) {
            return {
              profileId: existingProfile.id,
              skillTier: profile.skillTier,
              earningsPotentialScore: profile.earningsPotentialScore,
              burnoutRiskScore: profile.burnoutRiskScore,
              recommendations: generateQuickRecommendations(profile),
            };
          }
        }
      }

      // Gather all performance data
      const metrics = await gatherPerformanceMetrics(userId);
      const activityStats = await gatherActivityStats(userId);
      const riskSignals = await detectRiskSignals(userId, activityStats);
      const regionalPerformance = await analyzeRegionalPerformance(userId);

      // Calculate scores
      const earningsPotentialScore = calculateEarningsPotential(
        metrics,
        activityStats
      );
      const burnoutRiskScore = calculateBurnoutRisk(
        riskSignals,
        activityStats
      );
      const skillTier = determineSkillTier(
        earningsPotentialScore,
        metrics,
        burnoutRiskScore
      );

      // Create/update profile
      const profile: CreatorEarningProfile = {
        profileId: userId,
        userId,
        skillTier,
        earningsPotentialScore,
        burnoutRiskScore,
        metrics,
        activityStats,
        riskSignals,
        regionalPerformance,
        lastCalculatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db
        .collection('creatorEarningProfiles')
        .doc(userId)
        .set(profile, { merge: true });

      const recommendations = generateRecommendations(
        profile,
        metrics,
        riskSignals
      );

      return {
        profileId: userId,
        skillTier,
        earningsPotentialScore,
        burnoutRiskScore,
        recommendations,
      };
    } catch (error) {
      console.error('Error calculating skill score:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to calculate skill score'
      );
    }
  }
);

/**
 * Gather comprehensive performance metrics
 */
async function gatherPerformanceMetrics(userId: string) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Get chat metrics
  const chatData = await analyzeChatPerformance(userId, thirtyDaysAgo);
  const callData = await analyzeCallPerformance(userId, thirtyDaysAgo);
  const calendarData = await analyzeCalendarPerformance(userId, thirtyDaysAgo);
  const financialData = await analyzeFinancialMetrics(userId, thirtyDaysAgo);
  const retentionData = await analyzeUserRetention(userId, thirtyDaysAgo);

  return {
    ...chatData,
    ...callData,
    ...calendarData,
    ...financialData,
    ...retentionData,
  };
}

async function analyzeChatPerformance(userId: string, since: number) {
  // Query chat sessions
  const chatsSnapshot = await db
    .collection('chatSessions')
    .where('creatorId', '==', userId)
    .where('startedAt', '>=', Timestamp.fromMillis(since))
    .get();

  let totalChats = 0;
  let paidChats = 0;
  let totalRevenue = 0;
  let totalResponseTime = 0;
  let satisfiedCount = 0;
  let ratedCount = 0;
  const uniqueUsers = new Set<string>();

  chatsSnapshot.forEach((doc) => {
    const chat = doc.data();
    totalChats++;
    uniqueUsers.add(chat.userId);

    if (chat.totalPaid > 0) {
      paidChats++;
      totalRevenue += chat.totalPaid;
    }

    if (chat.avgResponseTimeMinutes) {
      totalResponseTime += chat.avgResponseTimeMinutes;
    }

    if (chat.rating) {
      ratedCount++;
      if (chat.rating >= 4) satisfiedCount++;
    }
  });

  return {
    chatConversionRate: totalChats > 0 ? (paidChats / totalChats) * 100 : 0,
    avgRevenuePerUser:
      uniqueUsers.size > 0 ? totalRevenue / uniqueUsers.size : 0,
    avgResponseTimeMinutes:
      totalChats > 0 ? totalResponseTime / totalChats : 0,
    chatSatisfactionRate:
      ratedCount > 0 ? (satisfiedCount / ratedCount) * 100 : 0,
  };
}

async function analyzeCallPerformance(userId: string, since: number) {
  const callsSnapshot = await db
    .collection('callSessions')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(since))
    .get();

  let totalRequests = 0;
  let accepted = 0;
  let completed = 0;
  let totalDuration = 0;
  let totalRevenue = 0;

  callsSnapshot.forEach((doc) => {
    const call = doc.data();
    totalRequests++;

    if (call.status === 'accepted' || call.status === 'completed') {
      accepted++;
    }

    if (call.status === 'completed') {
      completed++;
      totalDuration += call.durationMinutes || 0;
      totalRevenue += call.totalPaid || 0;
    }
  });

  return {
    callAcceptanceRate: totalRequests > 0 ? (accepted / totalRequests) * 100 : 0,
    callCompletionRate: accepted > 0 ? (completed / accepted) * 100 : 0,
    callAvgDurationMinutes: completed > 0 ? totalDuration / completed : 0,
    callRevenuePer30Min:
      totalDuration > 0 ? (totalRevenue / totalDuration) * 30 : 0,
  };
}

async function analyzeCalendarPerformance(userId: string, since: number) {
  const eventsSnapshot = await db
    .collection('events')
    .where('creatorId', '==', userId)
    .where('startsAt', '>=', Timestamp.fromMillis(since))
    .get();

  let totalEvents = 0;
  let totalSlots = 0;
  let filledSlots = 0;
  let totalRevenue = 0;
  let cancelled = 0;

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    totalEvents++;
    totalSlots += event.capacity || 1;
    filledSlots += event.attendeeCount || 0;
    totalRevenue += event.totalRevenue || 0;

    if (event.status === 'cancelled') {
      cancelled++;
    }
  });

  // Calendar bookings
  const bookingsSnapshot = await db
    .collection('calendarBookings')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(since))
    .get();

  let totalCalendarSlots = 0;
  let bookedSlots = 0;

  bookingsSnapshot.forEach((doc) => {
    const booking = doc.data();
    totalCalendarSlots++;
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      bookedSlots++;
    }
  });

  return {
    eventFillRatio: totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0,
    calendarFillRatio:
      totalCalendarSlots > 0 ? (bookedSlots / totalCalendarSlots) * 100 : 0,
    avgEventRevenue: totalEvents > 0 ? totalRevenue / totalEvents : 0,
    cancellationRatio: totalEvents > 0 ? (cancelled / totalEvents) * 100 : 0,
  };
}

async function analyzeFinancialMetrics(userId: string, since: number) {
  const transactionsSnapshot = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(since))
    .get();

  let totalRevenue = 0;
  let totalRefunds = 0;
  let totalTransactions = 0;
  const payingUsers = new Set<string>();
  const allUsers = new Set<string>();

  transactionsSnapshot.forEach((doc) => {
    const tx = doc.data();
    totalTransactions++;
    allUsers.add(tx.userId);

    if (tx.type === 'payment' && tx.status === 'completed') {
      totalRevenue += tx.amount;
      payingUsers.add(tx.userId);
    } else if (tx.type === 'refund') {
      totalRefunds += tx.amount;
    }
  });

  // Get subscription data
  const subsSnapshot = await db
    .collection('subscriptions')
    .where('creatorId', '==', userId)
    .where('status', '==', 'active')
    .get();

  let mrr = 0;
  subsSnapshot.forEach((doc) => {
    const sub = doc.data();
    mrr += sub.pricePerMonth || 0;
  });

  return {
    refundRatio:
      totalRevenue > 0 ? (totalRefunds / (totalRevenue + totalRefunds)) * 100 : 0,
    viewerToPayerRatio:
      allUsers.size > 0 ? (payingUsers.size / allUsers.size) * 100 : 0,
    monthlyRecurringRevenue: mrr,
  };
}

async function analyzeUserRetention(userId: string, since: number) {
  // Get paying users from 30+ days ago
  const oldPayments = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('type', '==', 'payment')
    .where('createdAt', '<', Timestamp.fromMillis(since))
    .get();

  const oldPayingUsers = new Set<string>();
  oldPayments.forEach((doc) => {
    oldPayingUsers.add(doc.data().userId);
  });

  // Check how many returned
  const recentPayments = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('type', '==', 'payment')
    .where('createdAt', '>=', Timestamp.fromMillis(since))
    .get();

  let returnedUsers = 0;
  const recentUsers = new Set<string>();
  let totalValue = 0;

  recentPayments.forEach((doc) => {
    const userId = doc.data().userId;
    recentUsers.add(userId);
    totalValue += doc.data().amount;

    if (oldPayingUsers.has(userId)) {
      returnedUsers++;
    }
  });

  return {
    retentionOf30DayPayingUsers:
      oldPayingUsers.size > 0 ? (returnedUsers / oldPayingUsers.size) * 100 : 0,
    avgSubscriptionRetention: 0, // Calculated separately
    avgCustomerLifetimeValue:
      recentUsers.size > 0 ? totalValue / recentUsers.size : 0,
  };
}

/**
 * Gather activity statistics
 */
async function gatherActivityStats(userId: string) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const [chats, calls, events] = await Promise.all([
    db
      .collection('chatSessions')
      .where('creatorId', '==', userId)
      .where('startedAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
      .count()
      .get(),
    db
      .collection('callSessions')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
      .count()
      .get(),
    db
      .collection('events')
      .where('creatorId', '==', userId)
      .where('startsAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
      .count()
      .get(),
  ]);

  // Get online time data
  const presenceSnapshot = await db
    .collection('userPresence')
    .doc(userId)
    .collection('sessions')
    .where('startedAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
    .get();

  let totalOnlineMinutes = 0;
  const hourlyActivity: { [hour: string]: number } = {};

  presenceSnapshot.forEach((doc) => {
    const session = doc.data();
    const duration = session.durationMinutes || 0;
    totalOnlineMinutes += duration;

    // Track peak hours
    const hour = new Date(session.startedAt.toMillis()).getHours();
    hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
  });

  // Find peak hours (top 3)
  const peakHours = Object.entries(hourlyActivity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`);

  return {
    totalChatsLast30Days: chats.data().count,
    totalCallsLast30Days: calls.data().count,
    totalEventsLast30Days: events.data().count,
    avgHoursOnlinePerDay: totalOnlineMinutes / (30 * 60),
    peakActivityHours: peakHours,
  };
}

/**
 * Detect risk signals
 */
async function detectRiskSignals(userId: string, activityStats: any) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Check refund rate
  const recentTransactions = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get();

  let refunds = 0;
  let total = 0;

  recentTransactions.forEach((doc) => {
    total++;
    if (doc.data().type === 'refund') refunds++;
  });

  const highRefundRate = total > 0 && refunds / total > 0.15;

  // Check safety reports
  const safetyReports = await db
    .collection('safetyReports')
    .where('reportedUserId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .count()
    .get();

  // Check ratings
  const recentRatings = await db
    .collection('ratings')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get();

  let lowRatings = 0;
  let totalRatings = 0;

  recentRatings.forEach((doc) => {
    totalRatings++;
    if (doc.data().rating < 3) lowRatings++;
  });

  const negativeRatings = totalRatings > 0 && lowRatings / totalRatings > 0.3;

  // Check workload
  const excessiveWorkload =
    activityStats.avgHoursOnlinePerDay > 12 ||
    activityStats.totalChatsLast30Days > 300;

  return {
    highRefundRate,
    delayedResponses: false, // Would need response time trending
    negativeRatings,
    safetyReports: safetyReports.data().count,
    excessiveWorkload,
    burnoutDetected: excessiveWorkload && (highRefundRate || negativeRatings),
  };
}

/**
 * Analyze regional performance
 */
async function analyzeRegionalPerformance(userId: string) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const transactions = await db
    .collection('transactions')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
    .get();

  const regionalData: {
    [region: string]: {
      conversionRate: number;
      avgRevenue: number;
      satisfactionRate: number;
    };
  } = {};

  // Group by region
  const byRegion: { [region: string]: any[] } = {};

  transactions.forEach((doc) => {
    const tx = doc.data();
    const region = tx.userRegion || 'unknown';

    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(tx);
  });

  // Calculate metrics per region
  for (const [region, txs] of Object.entries(byRegion)) {
    const completed = txs.filter((t) => t.status === 'completed').length;
    const total = txs.length;
    const revenue = txs
      .filter((t) => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);

    regionalData[region] = {
      conversionRate: total > 0 ? (completed / total) * 100 : 0,
      avgRevenue: completed > 0 ? revenue / completed : 0,
      satisfactionRate: 0, // Would need ratings by region
    };
  }

  return regionalData;
}

/**
 * Calculate earnings potential score (0-100)
 */
function calculateEarningsPotential(metrics: any, activityStats: any): number {
  let score = 0;

  // Conversion rates (30 points)
  score += Math.min(metrics.chatConversionRate * 0.3, 15);
  score += Math.min(metrics.callAcceptanceRate * 0.15, 15);

  // Revenue metrics (30 points)
  score += Math.min(metrics.avgRevenuePerUser / 10, 15);
  score += Math.min(metrics.monthlyRecurringRevenue / 100, 15);

  // Quality metrics (20 points)
  score += Math.min(metrics.chatSatisfactionRate * 0.1, 10);
  score += Math.min(metrics.retentionOf30DayPayingUsers * 0.1, 10);

  // Activity level (20 points)
  score += Math.min(activityStats.totalChatsLast30Days * 0.05, 10);
  score += Math.min(activityStats.totalCallsLast30Days * 0.2, 10);

  return Math.min(Math.round(score), 100);
}

/**
 * Calculate burnout risk score (0-100, higher = more risk)
 */
function calculateBurnoutRisk(riskSignals: any, activityStats: any): number {
  let risk = 0;

  // Workload factors (40 points)
  if (activityStats.avgHoursOnlinePerDay > 12) risk += 20;
  else if (activityStats.avgHoursOnlinePerDay > 10) risk += 10;

  if (activityStats.totalChatsLast30Days > 300) risk += 20;
  else if (activityStats.totalChatsLast30Days > 200) risk += 10;

  // Quality decline (30 points)
  if (riskSignals.highRefundRate) risk += 15;
  if (riskSignals.negativeRatings) risk += 15;

  // Safety concerns (30 points)
  risk += Math.min(riskSignals.safetyReports * 5, 30);

  return Math.min(risk, 100);
}

/**
 * Determine skill tier based on performance
 */
function determineSkillTier(
  earningsPotential: number,
  metrics: any,
  burnoutRisk: number
): SkillTier {
  // Penalize for high burnout risk
  const adjustedScore = earningsPotential - burnoutRisk * 0.2;

  if (
    adjustedScore >= 80 &&
    metrics.monthlyRecurringRevenue > 500 &&
    burnoutRisk < 40
  ) {
    return 'ELITE';
  }

  if (adjustedScore >= 60 && metrics.chatConversionRate > 40) {
    return 'PRO';
  }

  if (adjustedScore >= 40 && metrics.avgRevenuePerUser > 20) {
    return 'ADVANCED';
  }

  return 'BEGINNER';
}

/**
 * Generate personalized recommendations
 */
function generateRecommendations(
  profile: CreatorEarningProfile,
  metrics: any,
  riskSignals: any
): string[] {
  const recommendations: string[] = [];

  // Burnout risks
  if (riskSignals.burnoutDetected) {
    recommendations.push(
      '⚠️ CRITICAL: Burnout risk detected. Consider reducing workload.'
    );
  }

  // Quality issues
  if (riskSignals.highRefundRate) {
    recommendations.push(
      'Improve preview messages to reduce refund rate (currently high)'
    );
  }

  if (riskSignals.negativeRatings) {
    recommendations.push(
      'Focus on response quality - recent ratings are below average'
    );
  }

  // Growth opportunities
  if (metrics.callAcceptanceRate < 50 && metrics.chatConversionRate > 40) {
    recommendations.push(
      'Add voice/video calls to boost ARPPU by estimated +32%'
    );
  }

  if (metrics.eventFillRatio === 0 && metrics.avgRevenuePerUser > 30) {
    recommendations.push(
      'Your followers support paid events - create your first one'
    );
  }

  if (profile.skillTier === 'BEGINNER') {
    recommendations.push(
      'Complete "Getting Started with Earnings" course to boost your profile'
    );
  }

  return recommendations;
}

function generateQuickRecommendations(profile: CreatorEarningProfile): string[] {
  const recs: string[] = [];

  if (profile.burnoutRiskScore > 70) {
    recs.push('⚠️ High burnout risk - consider reducing workload');
  }

  if (profile.earningsPotentialScore < 40) {
    recs.push('Complete academy courses to increase earnings potential');
  }

  return recs;
}

/**
 * Scheduled job: Recalculate all creator profiles daily
 */
export const pack382_dailySkillScoreUpdate = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK382] Starting daily skill score update...');

    // Get all creators with recent activity
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const activeCreators = await db
      .collection('chatSessions')
      .where('startedAt', '>=', Timestamp.fromMillis(thirtyDaysAgo))
      .select('creatorId')
      .get();

    const creatorIds = new Set<string>();
    activeCreators.forEach((doc) => {
      creatorIds.add(doc.data().creatorId);
    });

    console.log(`[PACK382] Found ${creatorIds.size} active creators`);

    // Update in batches
    const batchSize = 50;
    const creators = Array.from(creatorIds);

    for (let i = 0; i < creators.length; i += batchSize) {
      const batch = creators.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (creatorId) => {
          try {
            // Trigger recalculation
            const metrics = await gatherPerformanceMetrics(creatorId);
            const activityStats = await gatherActivityStats(creatorId);
            const riskSignals = await detectRiskSignals(creatorId, activityStats);
            const regionalPerformance = await analyzeRegionalPerformance(creatorId);

            const earningsPotentialScore = calculateEarningsPotential(
              metrics,
              activityStats
            );
            const burnoutRiskScore = calculateBurnoutRisk(riskSignals, activityStats);
            const skillTier = determineSkillTier(
              earningsPotentialScore,
              metrics,
              burnoutRiskScore
            );

            const profile: CreatorEarningProfile = {
              profileId: creatorId,
              userId: creatorId,
              skillTier,
              earningsPotentialScore,
              burnoutRiskScore,
              metrics,
              activityStats,
              riskSignals,
              regionalPerformance,
              lastCalculatedAt: Timestamp.now(),
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };

            await db
              .collection('creatorEarningProfiles')
              .doc(creatorId)
              .set(profile, { merge: true });
          } catch (error) {
            console.error(`Error updating creator ${creatorId}:`, error);
          }
        })
      );

      console.log(
        `[PACK382] Updated ${Math.min(i + batchSize, creators.length)}/${creators.length} creators`
      );
    }

    console.log('[PACK382] Daily skill score update complete');
    return null;
  });
