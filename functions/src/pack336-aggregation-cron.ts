/**
 * PACK 336 — DAILY KPI AGGREGATION CRON JOB
 * 
 * Scheduled function that runs daily at midnight UTC to aggregate
 * all KPI metrics from the previous day.
 * 
 * This creates immutable snapshots for investor reporting.
 */

import * as functions from 'firebase-functions';
import { db } from './init.js';
import {
  calculateNorthStarMetric,
  calculateDailyGlobalKpi,
  calculateDailyByCountryKpi,
  calculateRevenueStreams,
  calculateViralityMetrics,
  getYesterdayDate,
} from './pack336-kpi-engine.js';

/**
 * Daily KPI aggregation job
 * Runs at 00:30 UTC every day to aggregate previous day's metrics
 */
export const pack336_generateDailyKPIs = functions.pubsub
  .schedule('30 0 * * *') // 00:30 UTC daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const date = getYesterdayDate();
    
    console.log(`[PACK 336] Starting daily KPI aggregation for ${date}`);
    
    try {
      // Check if already aggregated (idempotency)
      const existingSnapshot = await db.collection('kpiNorthStarSnapshots')
        .where('date', '==', date)
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        console.log(`[PACK 336] KPIs already aggregated for ${date}, skipping`);
        return { success: true, skipped: true, date };
      }
      
      // Calculate all metrics in parallel for efficiency
      const [
        northStar,
        dailyGlobal,
        dailyByCountry,
        revenueStreams,
        viralityMetrics,
      ] = await Promise.all([
        calculateNorthStarMetric(date),
        calculateDailyGlobalKpi(date),
        calculateDailyByCountryKpi(date),
        calculateRevenueStreams(date),
        calculateViralityMetrics(date),
      ]);
      
      // Store all metrics in Firestore
      const batch = db.batch();
      
      // Store North Star Metric
      const northStarRef = db.collection('kpiNorthStarSnapshots').doc(date);
      batch.set(northStarRef, northStar);
      
      // Store Daily Global KPI
      const dailyGlobalRef = db.collection('kpiDailyGlobal').doc(date);
      batch.set(dailyGlobalRef, dailyGlobal);
      
      // Store Daily By Country KPIs
      for (const countryKpi of dailyByCountry) {
        const countryRef = db.collection('kpiDailyByCountry').doc(`${date}_${countryKpi.country}`);
        batch.set(countryRef, countryKpi);
      }
      
      // Store Revenue Streams
      const revenueStreamsRef = db.collection('kpiRevenueStreams').doc(date);
      batch.set(revenueStreamsRef, revenueStreams);
      
      // Store Virality Metrics
      const viralityRef = db.collection('kpiVirality').doc(date);
      batch.set(viralityRef, viralityMetrics);
      
      // Commit the batch
      await batch.commit();
      
      console.log(`[PACK 336] Successfully aggregated KPIs for ${date}`);
      console.log(`  - North Star: ${northStar.weeklyPayingUsers} weekly users, ${northStar.monthlyPayingUsers} monthly users`);
      console.log(`  - DAU: ${dailyGlobal.activeUsersDAU}, Paying DAU: ${dailyGlobal.payingUsersDAU}`);
      console.log(`  - Revenue: ${dailyGlobal.totalRevenuePLN.toFixed(2)} PLN`);
      console.log(`  - Refund Rate: ${(dailyGlobal.refundRate * 100).toFixed(2)}%`);
      console.log(`  - Countries: ${dailyByCountry.length}`);
      console.log(`  - K-Factor: ${viralityMetrics.kFactor.toFixed(2)}`);
      
      // Check for alert thresholds
      await checkAlertThresholds(date, dailyGlobal);
      
      return {
        success: true,
        date,
        metrics: {
          northStar: northStar.weeklyPayingUsers,
          dau: dailyGlobal.activeUsersDAU,
          revenue: dailyGlobal.totalRevenuePLN,
          refundRate: dailyGlobal.refundRate,
          countries: dailyByCountry.length,
        },
      };
    } catch (error) {
      console.error(`[PACK 336] Error aggregating KPIs for ${date}:`, error);
      throw error;
    }
  });

/**
 * Check alert thresholds and create alerts if needed
 */
async function checkAlertThresholds(
  date: string,
  dailyGlobal: any
): Promise<void> {
  const alerts: Array<{
    type: string;
    severity: string;
    title: string;
    message: string;
    currentValue: number;
    threshold: number;
  }> = [];
  
  // Check refund volume threshold (> 4%)
  if (dailyGlobal.refundRate > 0.04) {
    alerts.push({
      type: 'refund_spike',
      severity: 'CRITICAL',
      title: 'High Refund Rate Detected',
      message: `Refund rate is ${(dailyGlobal.refundRate * 100).toFixed(2)}%, exceeding threshold of 4%`,
      currentValue: dailyGlobal.refundRate * 100,
      threshold: 4,
    });
  }
  
  // Check DAU drop (compare with previous day)
  const yesterdayDate = new Date(date);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const previousDateStr = yesterdayDate.toISOString().split('T')[0];
  
  const previousDaySnapshot = await db.collection('kpiDailyGlobal')
    .doc(previousDateStr)
    .get();
  
  if (previousDaySnapshot.exists) {
    const previousDay = previousDaySnapshot.data();
    const dauDrop = (previousDay!.activeUsersDAU - dailyGlobal.activeUsersDAU) / previousDay!.activeUsersDAU;
    
    if (dauDrop > 0.25) {
      alerts.push({
        type: 'dau_drop',
        severity: 'CRITICAL',
        title: 'Significant DAU Drop',
        message: `DAU dropped by ${(dauDrop * 100).toFixed(1)}%, exceeding threshold of 25%`,
        currentValue: dauDrop * 100,
        threshold: 25,
      });
    }
  }
  
  // Check token velocity spike (300% increase)
  if (previousDaySnapshot.exists) {
    const previousDay = previousDaySnapshot.data();
    const velocityIncrease = (dailyGlobal.totalTokenSpent - previousDay!.totalTokenSpent) / previousDay!.totalTokenSpent;
    
    if (velocityIncrease > 3.0) {
      alerts.push({
        type: 'token_velocity_spike',
        severity: 'WARNING',
        title: 'Token Velocity Spike Detected',
        message: `Token spending increased by ${(velocityIncrease * 100).toFixed(1)}%, exceeding threshold of 300% (potential fraud)`,
        currentValue: velocityIncrease * 100,
        threshold: 300,
      });
    }
  }
  
  // Store alerts in Firestore
  if (alerts.length > 0) {
    const batch = db.batch();
    
    for (const alert of alerts) {
      const alertRef = db.collection('kpiAlerts').doc();
      batch.set(alertRef, {
        ...alert,
        date,
        status: 'ACTIVE',
        createdAt: new Date(),
        metadata: {
          dailyGlobalId: date,
        },
      });
    }
    
    await batch.commit();
    
    console.log(`[PACK 336] Created ${alerts.length} alerts for ${date}`);
    
    // TODO: Send notifications via push, email, Slack webhook
  }
}

/**
 * Manual trigger for KPI aggregation (admin only)
 * Allows recalculating KPIs for a specific date
 */
export const pack336_manualAggregation = functions.https.onCall(async (data, context) => {
  // TODO: Add admin authentication check
  
  const { date, forceRecalculation } = data;
  
  if (!date) {
    throw new functions.https.HttpsError('invalid-argument', 'Date is required (YYYY-MM-DD format)');
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid date format. Use YYYY-MM-DD');
  }
  
  console.log(`[PACK 336] Manual aggregation triggered for ${date}`);
  
  try {
    // Check if already aggregated
    if (!forceRecalculation) {
      const existingSnapshot = await db.collection('kpiNorthStarSnapshots')
        .where('date', '==', date)
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          `KPIs already aggregated for ${date}. Use forceRecalculation=true to override.`
        );
      }
    }
    
    // Calculate all metrics
    const [
      northStar,
      dailyGlobal,
      dailyByCountry,
      revenueStreams,
      viralityMetrics,
    ] = await Promise.all([
      calculateNorthStarMetric(date),
      calculateDailyGlobalKpi(date),
      calculateDailyByCountryKpi(date),
      calculateRevenueStreams(date),
      calculateViralityMetrics(date),
    ]);
    
    // Store all metrics
    const batch = db.batch();
    
    const northStarRef = db.collection('kpiNorthStarSnapshots').doc(date);
    batch.set(northStarRef, northStar);
    
    const dailyGlobalRef = db.collection('kpiDailyGlobal').doc(date);
    batch.set(dailyGlobalRef, dailyGlobal);
    
    for (const countryKpi of dailyByCountry) {
      const countryRef = db.collection('kpiDailyByCountry').doc(`${date}_${countryKpi.country}`);
      batch.set(countryRef, countryKpi);
    }
    
    const revenueStreamsRef = db.collection('kpiRevenueStreams').doc(date);
    batch.set(revenueStreamsRef, revenueStreams);
    
    const viralityRef = db.collection('kpiVirality').doc(date);
    batch.set(viralityRef, viralityMetrics);
    
    await batch.commit();
    
    return {
      success: true,
      date,
      message: 'KPI aggregation completed successfully',
      metrics: {
        northStar: northStar.weeklyPayingUsers,
        dau: dailyGlobal.activeUsersDAU,
        revenue: dailyGlobal.totalRevenuePLN,
      },
    };
  } catch (error: any) {
    console.error(`[PACK 336] Error in manual aggregation:`, error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});