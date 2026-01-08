/**
 * PACK 301B - Retention Analytics Collection
 * Aggregates and stores retention metrics for admin dashboard
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { UserSegment, RetentionMetrics } from './pack301-retention-types';

const db = admin.firestore();

/**
 * Calculate and store daily retention metrics
 * Called by scheduled function or manually
 */
export const aggregateRetentionMetrics = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  const { date } = data;
  const targetDate = date || getTodayDateString();

  try {
    console.log(`[Analytics] Aggregating retention metrics for ${targetDate}`);

    // Get all retention profiles
    const retentionSnapshot = await db.collection('userRetention').get();

    // Initialize metrics
    const metrics: Partial<RetentionMetrics> = {
      date: targetDate,
      newUsers: 0,
      day1Retention: 0,
      day7Retention: 0,
      day30Retention: 0,
      segmentNew: 0,
      segmentActive: 0,
      segmentDormant: 0,
      segmentChurnRisk: 0,
      segmentChurned: 0,
      segmentReturning: 0,
      onboardingStarted: 0,
      onboardingCompleted: 0,
      avgOnboardingTimeMinutes: 0,
      winBackSent: 0,
      winBackReturned: 0,
      winBackReturnRate: 0,
      createdAt: admin.firestore.Timestamp.now(),
    };

    // Track for cohort analysis
    const usersCreatedToday: string[] = [];
    const usersCreated1DayAgo: string[] = [];
    const usersCreated7DaysAgo: string[] = [];
    const usersCreated30DaysAgo: string[] = [];
    let totalOnboardingTime = 0;
    let completedOnboardingCount = 0;

    // Process all profiles
    retentionSnapshot.docs.forEach((doc) => {
      const profile = doc.data();
      const segment = profile.segment as UserSegment;

      // Count by segment
      if (segment === 'NEW') metrics.segmentNew!++;
      else if (segment === 'ACTIVE') metrics.segmentActive!++;
      else if (segment === 'DORMANT') metrics.segmentDormant!++;
      else if (segment === 'CHURN_RISK') metrics.segmentChurnRisk!++;
      else if (segment === 'CHURNED') metrics.segmentChurned!++;
      else if (segment === 'RETURNING') metrics.segmentReturning!++;

      // Track onboarding
      metrics.onboardingStarted!++;
      if (profile.onboardingCompleted) {
        metrics.onboardingCompleted!++;
        completedOnboardingCount++;

        // Calculate onboarding time (if we have both timestamps)
        if (profile.createdAt && profile.updatedAt) {
          const timeMs = profile.updatedAt.toMillis() - profile.createdAt.toMillis();
          totalOnboardingTime += timeMs / (1000 * 60); // Convert to minutes
        }
      }

      // Track new users (created today)
      if (isDateMatch(profile.createdAt, targetDate)) {
        metrics.newUsers!++;
        usersCreatedToday.push(doc.id);
      }

      // Track for cohort retention
      if (isDateMatch(profile.createdAt, getDateNDaysAgo(1))) {
        usersCreated1DayAgo.push(doc.id);
      }
      if (isDateMatch(profile.createdAt, getDateNDaysAgo(7))) {
        usersCreated7DaysAgo.push(doc.id);
      }
      if (isDateMatch(profile.createdAt, getDateNDaysAgo(30))) {
        usersCreated30DaysAgo.push(doc.id);
      }

      // Track win-back
      if (profile.winBackSequenceStarted) {
        metrics.winBackSent!++;
        if (segment === 'RETURNING') {
          metrics.winBackReturned!++;
        }
      }
    });

    // Calculate average onboarding time
    if (completedOnboardingCount > 0) {
      metrics.avgOnboardingTimeMinutes = totalOnboardingTime / completedOnboardingCount;
    }

    // Calculate cohort retention
    metrics.day1Retention = calculateRetentionRate(usersCreated1DayAgo);
    metrics.day7Retention = calculateRetentionRate(usersCreated7DaysAgo);
    metrics.day30Retention = calculateRetentionRate(usersCreated30DaysAgo);

    // Calculate win-back success rate
    if (metrics.winBackSent! > 0) {
      metrics.winBackReturnRate = (metrics.winBackReturned! / metrics.winBackSent!) * 100;
    }

    // Store metrics
    const metricsRef = db.collection('retentionAnalytics').doc(targetDate);
    await metricsRef.set(metrics);

    console.log(`[Analytics] Stored retention metrics for ${targetDate}`);

    return {
      success: true,
      date: targetDate,
      metrics,
    };
  } catch (error: any) {
    console.error('[Analytics] Error aggregating metrics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled function: Daily retention analytics aggregation at 5 AM UTC
 * Runs after churn recalculation and win-back
 */
export const dailyRetentionAnalytics = functions.pubsub
  .schedule('0 5 * * *') // Daily at 5 AM UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[Analytics] Starting daily retention analytics');

    try {
      const targetDate = getTodayDateString();
      
      // Use the aggregation function
      const result = await aggregateRetentionMetricsInternal(targetDate);

      console.log(`[Analytics] Completed daily analytics for ${targetDate}`);
      return result;
    } catch (error) {
      console.error('[Analytics] Error in daily analytics:', error);
      throw error;
    }
  });

/**
 * Internal aggregation function (for scheduled use)
 */
async function aggregateRetentionMetricsInternal(targetDate: string): Promise<any> {
  // Same logic as aggregateRetentionMetrics but without auth check
  const retentionSnapshot = await db.collection('userRetention').get();

  const metrics: Partial<RetentionMetrics> = {
    date: targetDate,
    newUsers: 0,
    day1Retention: 0,
    day7Retention: 0,
    day30Retention: 0,
    segmentNew: 0,
    segmentActive: 0,
    segmentDormant: 0,
    segmentChurnRisk: 0,
    segmentChurned: 0,
    segmentReturning: 0,
    onboardingStarted: 0,
    onboardingCompleted: 0,
    avgOnboardingTimeMinutes: 0,
    winBackSent: 0,
    winBackReturned: 0,
    winBackReturnRate: 0,
    createdAt: admin.firestore.Timestamp.now(),
  };

  const usersCreated1DayAgo: string[] = [];
  const usersCreated7DaysAgo: string[] = [];
  const usersCreated30DaysAgo: string[] = [];
  let totalOnboardingTime = 0;
  let completedOnboardingCount = 0;

  retentionSnapshot.docs.forEach((doc) => {
    const profile = doc.data();
    const segment = profile.segment as UserSegment;

    if (segment === 'NEW') metrics.segmentNew!++;
    else if (segment === 'ACTIVE') metrics.segmentActive!++;
    else if (segment === 'DORMANT') metrics.segmentDormant!++;
    else if (segment === 'CHURN_RISK') metrics.segmentChurnRisk!++;
    else if (segment === 'CHURNED') metrics.segmentChurned!++;
    else if (segment === 'RETURNING') metrics.segmentReturning!++;

    metrics.onboardingStarted!++;
    if (profile.onboardingCompleted) {
      metrics.onboardingCompleted!++;
      completedOnboardingCount++;

      if (profile.createdAt && profile.updatedAt) {
        const timeMs = profile.updatedAt.toMillis() - profile.createdAt.toMillis();
        totalOnboardingTime += timeMs / (1000 * 60);
      }
    }

    if (isDateMatch(profile.createdAt, targetDate)) {
      metrics.newUsers!++;
    }

    if (isDateMatch(profile.createdAt, getDateNDaysAgo(1))) {
      usersCreated1DayAgo.push(doc.id);
    }
    if (isDateMatch(profile.createdAt, getDateNDaysAgo(7))) {
      usersCreated7DaysAgo.push(doc.id);
    }
    if (isDateMatch(profile.createdAt, getDateNDaysAgo(30))) {
      usersCreated30DaysAgo.push(doc.id);
    }

    if (profile.winBackSequenceStarted) {
      metrics.winBackSent!++;
      if (segment === 'RETURNING') {
        metrics.winBackReturned!++;
      }
    }
  });

  if (completedOnboardingCount > 0) {
    metrics.avgOnboardingTimeMinutes = totalOnboardingTime / completedOnboardingCount;
  }

  metrics.day1Retention = calculateRetentionRate(usersCreated1DayAgo);
  metrics.day7Retention = calculateRetentionRate(usersCreated7DaysAgo);
  metrics.day30Retention = calculateRetentionRate(usersCreated30DaysAgo);

  if (metrics.winBackSent! > 0) {
    metrics.winBackReturnRate = (metrics.winBackReturned! / metrics.winBackSent!) * 100;
  }

  const metricsRef = db.collection('retentionAnalytics').doc(targetDate);
  await metricsRef.set(metrics);

  return metrics;
}

/**
 * Calculate retention rate for a cohort
 */
function calculateRetentionRate(userIds: string[]): number {
  if (userIds.length === 0) return 0;
  
  // This is a simplified placeholder
  // In production, you'd query these users' activity in the retention period
  // For now, return 0 as we need actual activity tracking
  return 0;
}

/**
 * Check if a timestamp matches a target date (YYYY-MM-DD)
 */
function isDateMatch(timestamp: admin.firestore.Timestamp, targetDate: string): boolean {
  if (!timestamp) return false;
  
  const date = timestamp.toDate();
  const dateString = date.toISOString().split('T')[0];
  return dateString === targetDate;
}

/**
 * Get date N days ago as YYYY-MM-DD
 */
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get retention metrics for date range (admin only)
 */
export const getRetentionMetrics = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  const { startDate, endDate, limit } = data;

  try {
    let query = db.collection('retentionAnalytics').orderBy('date', 'desc');

    if (startDate) {
      query = query.where('date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('date', '<=', endDate);
    }
    if (limit) {
      query = query.limit(limit);
    } else {
      query = query.limit(30); // Default to last 30 days
    }

    const snapshot = await query.get();
    const metrics = snapshot.docs.map(doc => doc.data());

    return {
      success: true,
      metrics,
      count: metrics.length,
    };
  } catch (error: any) {
    console.error('[Analytics] Error getting metrics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get segment distribution over time (admin only)
 */
export const getSegmentDistribution = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  const { days } = data;
  const numberOfDays = days || 30;

  try {
    const metrics: any[] = [];
    
    for (let i = 0; i < numberOfDays; i++) {
      const date = getDateNDaysAgo(i);
      const metricsDoc = await db.collection('retentionAnalytics').doc(date).get();
      
      if (metricsDoc.exists) {
        const data = metricsDoc.data();
        metrics.push({
          date,
          NEW: data?.segmentNew || 0,
          ACTIVE: data?.segmentActive || 0,
          DORMANT: data?.segmentDormant || 0,
          CHURN_RISK: data?.segmentChurnRisk || 0,
          CHURNED: data?.segmentChurned || 0,
          RETURNING: data?.segmentReturning || 0,
        });
      }
    }

    return {
      success: true,
      distribution: metrics.reverse(), // Oldest to newest
      days: numberOfDays,
    };
  } catch (error: any) {
    console.error('[Analytics] Error getting distribution:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get onboarding funnel metrics (admin only)
 */
export const getOnboardingFunnelMetrics = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  try {
    // Count users at each onboarding stage
    const retentionSnapshot = await db.collection('userRetention').get();

    const funnelData = {
      stage0_new: 0,
      stage1_photos: 0,
      stage2_preferences: 0,
      stage3_discovery: 0,
      stage4_swipe: 0,
      stage5_chat: 0,
      completed: 0,
    };

    retentionSnapshot.docs.forEach((doc) => {
      const profile = doc.data();
      const stage = profile.onboardingStage;

      if (stage === 0) funnelData.stage0_new++;
      else if (stage === 1) funnelData.stage1_photos++;
      else if (stage === 2) funnelData.stage2_preferences++;
      else if (stage === 3) funnelData.stage3_discovery++;
      else if (stage === 4) funnelData.stage4_swipe++;
      else if (stage >= 5) funnelData.stage5_chat++;

      if (profile.onboardingCompleted) {
        funnelData.completed++;
      }
    });

    // Calculate conversion rates
    const total = retentionSnapshot.size;
    const conversionRates = {
      photos: total > 0 ? (funnelData.stage1_photos / total) * 100 : 0,
      preferences: total > 0 ? (funnelData.stage2_preferences / total) * 100 : 0,
      discovery: total > 0 ? (funnelData.stage3_discovery / total) * 100 : 0,
      swipe: total > 0 ? (funnelData.stage4_swipe / total) * 100 : 0,
      chat: total > 0 ? (funnelData.stage5_chat / total) * 100 : 0,
      completion: total > 0 ? (funnelData.completed / total) * 100 : 0,
    };

    return {
      success: true,
      funnel: funnelData,
      conversionRates,
      totalUsers: total,
    };
  } catch (error: any) {
    console.error('[Analytics] Error getting funnel metrics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get win-back effectiveness report (admin only)
 */
export const getWinBackEffectiveness = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  try {
    const winBackSnapshot = await db
      .collection('userRetention')
      .where('winBackSequenceStarted', '==', true)
      .get();

    const effectiveness = {
      totalSequences: winBackSnapshot.size,
      byStep: {
        step1: 0,
        step2: 0,
        step3: 0,
      },
      returned: 0,
      returnedByStep: {
        afterStep1: 0,
        afterStep2: 0,
        afterStep3: 0,
      },
    };

    winBackSnapshot.docs.forEach((doc) => {
      const profile = doc.data();
      const step = profile.winBackSequenceStep || 0;
      const isReturned = profile.segment === 'RETURNING';

      if (step >= 1) effectiveness.byStep.step1++;
      if (step >= 2) effectiveness.byStep.step2++;
      if (step >= 3) effectiveness.byStep.step3++;

      if (isReturned) {
        effectiveness.returned++;
        
        // Track which step they returned after
        if (step === 1) effectiveness.returnedByStep.afterStep1++;
        else if (step === 2) effectiveness.returnedByStep.afterStep2++;
        else if (step >= 3) effectiveness.returnedByStep.afterStep3++;
      }
    });

    // Calculate success rates
    const successRates = {
      overall: effectiveness.totalSequences > 0
        ? (effectiveness.returned / effectiveness.totalSequences) * 100
        : 0,
      afterStep1: effectiveness.byStep.step1 > 0
        ? (effectiveness.returnedByStep.afterStep1 / effectiveness.byStep.step1) * 100
        : 0,
      afterStep2: effectiveness.byStep.step2 > 0
        ? (effectiveness.returnedByStep.afterStep2 / effectiveness.byStep.step2) * 100
        : 0,
      afterStep3: effectiveness.byStep.step3 > 0
        ? (effectiveness.returnedByStep.afterStep3 / effectiveness.byStep.step3) * 100
        : 0,
    };

    return {
      success: true,
      effectiveness,
      successRates,
    };
  } catch (error: any) {
    console.error('[Analytics] Error getting win-back effectiveness:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 301B - Retention Analytics initialized');