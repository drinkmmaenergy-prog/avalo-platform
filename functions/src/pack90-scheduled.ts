/**
 * PACK 90 — Scheduled Jobs for Metrics & Cleanup
 * 
 * Cloud Functions that run on schedule:
 * - Daily metrics consolidation
 * - Optional log cleanup (if needed)
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  incrementMetric,
  MetricKey,
  logTechEvent,
} from './pack90-logging';

// ============================================================================
// SCHEDULED: REBUILD DAILY METRICS
// ============================================================================

/**
 * Rebuild daily metrics by counting actual events
 * Runs once per day at 2 AM UTC
 * Provides redundancy if real-time increments are missed
 */
export const rebuildDailyMetrics = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('[MetricsJob] Starting daily metrics rebuild...');
      
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
      const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
      
      // Count business events by type
      await rebuildPaymentMetrics(dateStr, startOfDay, endOfDay);
      await rebuildPayoutMetrics(dateStr, startOfDay, endOfDay);
      await rebuildKycMetrics(dateStr, startOfDay, endOfDay);
      await rebuildDisputeMetrics(dateStr, startOfDay, endOfDay);
      await rebuildEnforcementMetrics(dateStr, startOfDay, endOfDay);
      await rebuildUserMetrics(dateStr, startOfDay, endOfDay);
      
      console.log(`[MetricsJob] Completed daily metrics rebuild for ${dateStr}`);
      
      await logTechEvent({
        level: 'INFO',
        category: 'JOB',
        functionName: 'rebuildDailyMetrics',
        message: `Successfully rebuilt metrics for ${dateStr}`,
      });
      
      return null;
    } catch (error: any) {
      console.error('[MetricsJob] Error rebuilding metrics:', error);
      
      await logTechEvent({
        level: 'ERROR',
        category: 'JOB',
        functionName: 'rebuildDailyMetrics',
        message: `Failed to rebuild metrics: ${error.message}`,
        context: { error: error.message },
      });
      
      throw error;
    }
  });

/**
 * Rebuild payment-related metrics
 */
async function rebuildPaymentMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count PAYMENT_COMPLETED events
    const paymentsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'PAYMENT_COMPLETED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalPayments = paymentsSnapshot.size;
    
    // Update metric
    const metricRef = db.collection('metrics_daily').doc(`TOTAL_PAYMENTS_${dateStr}`);
    await metricRef.set({
      id: `TOTAL_PAYMENTS_${dateStr}`,
      date: dateStr,
      metricKey: 'TOTAL_PAYMENTS',
      value: totalPayments,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count EARNINGS_CREDITED events
    const earningsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'EARNINGS_CREDITED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalEarnings = earningsSnapshot.size;
    
    const earningsMetricRef = db.collection('metrics_daily').doc(`TOTAL_EARNINGS_EVENTS_${dateStr}`);
    await earningsMetricRef.set({
      id: `TOTAL_EARNINGS_EVENTS_${dateStr}`,
      date: dateStr,
      metricKey: 'TOTAL_EARNINGS_EVENTS',
      value: totalEarnings,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt payment metrics: ${totalPayments} payments, ${totalEarnings} earnings`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding payment metrics:', error);
  }
}

/**
 * Rebuild payout-related metrics
 */
async function rebuildPayoutMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count payout requests
    const requestsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'PAYOUT_REQUESTED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalRequests = requestsSnapshot.size;
    
    const requestsMetricRef = db.collection('metrics_daily').doc(`PAYOUT_REQUESTS_${dateStr}`);
    await requestsMetricRef.set({
      id: `PAYOUT_REQUESTS_${dateStr}`,
      date: dateStr,
      metricKey: 'PAYOUT_REQUESTS',
      value: totalRequests,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count completed payouts
    const completedSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'PAYOUT_COMPLETED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalCompleted = completedSnapshot.size;
    
    const completedMetricRef = db.collection('metrics_daily').doc(`PAYOUTS_COMPLETED_${dateStr}`);
    await completedMetricRef.set({
      id: `PAYOUTS_COMPLETED_${dateStr}`,
      date: dateStr,
      metricKey: 'PAYOUTS_COMPLETED',
      value: totalCompleted,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt payout metrics: ${totalRequests} requests, ${totalCompleted} completed`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding payout metrics:', error);
  }
}

/**
 * Rebuild KYC-related metrics
 */
async function rebuildKycMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count KYC submissions
    const submissionsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'KYC_SUBMITTED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalSubmissions = submissionsSnapshot.size;
    
    const submissionsMetricRef = db.collection('metrics_daily').doc(`KYC_SUBMISSIONS_${dateStr}`);
    await submissionsMetricRef.set({
      id: `KYC_SUBMISSIONS_${dateStr}`,
      date: dateStr,
      metricKey: 'KYC_SUBMISSIONS',
      value: totalSubmissions,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count KYC approvals
    const approvalsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'KYC_APPROVED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalApprovals = approvalsSnapshot.size;
    
    const approvalsMetricRef = db.collection('metrics_daily').doc(`KYC_APPROVALS_${dateStr}`);
    await approvalsMetricRef.set({
      id: `KYC_APPROVALS_${dateStr}`,
      date: dateStr,
      metricKey: 'KYC_APPROVALS',
      value: totalApprovals,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count KYC rejections
    const rejectionsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'KYC_REJECTED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalRejections = rejectionsSnapshot.size;
    
    const rejectionsMetricRef = db.collection('metrics_daily').doc(`KYC_REJECTIONS_${dateStr}`);
    await rejectionsMetricRef.set({
      id: `KYC_REJECTIONS_${dateStr}`,
      date: dateStr,
      metricKey: 'KYC_REJECTIONS',
      value: totalRejections,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt KYC metrics: ${totalSubmissions} submissions, ${totalApprovals} approvals, ${totalRejections} rejections`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding KYC metrics:', error);
  }
}

/**
 * Rebuild dispute-related metrics
 */
async function rebuildDisputeMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count disputes created
    const createdSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'DISPUTE_CREATED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalCreated = createdSnapshot.size;
    
    const createdMetricRef = db.collection('metrics_daily').doc(`DISPUTES_CREATED_${dateStr}`);
    await createdMetricRef.set({
      id: `DISPUTES_CREATED_${dateStr}`,
      date: dateStr,
      metricKey: 'DISPUTES_CREATED',
      value: totalCreated,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count disputes resolved
    const resolvedSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'DISPUTE_RESOLVED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalResolved = resolvedSnapshot.size;
    
    const resolvedMetricRef = db.collection('metrics_daily').doc(`DISPUTES_RESOLVED_${dateStr}`);
    await resolvedMetricRef.set({
      id: `DISPUTES_RESOLVED_${dateStr}`,
      date: dateStr,
      metricKey: 'DISPUTES_RESOLVED',
      value: totalResolved,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt dispute metrics: ${totalCreated} created, ${totalResolved} resolved`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding dispute metrics:', error);
  }
}

/**
 * Rebuild enforcement-related metrics
 */
async function rebuildEnforcementMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count enforcement changes
    const changesSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'ENFORCEMENT_CHANGED')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalChanges = changesSnapshot.size;
    
    const changesMetricRef = db.collection('metrics_daily').doc(`ENFORCEMENT_CHANGES_${dateStr}`);
    await changesMetricRef.set({
      id: `ENFORCEMENT_CHANGES_${dateStr}`,
      date: dateStr,
      metricKey: 'ENFORCEMENT_CHANGES',
      value: totalChanges,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    // Count moderator actions
    const actionsSnapshot = await db.collection('business_audit_log')
      .where('eventType', '==', 'MODERATOR_ACTION')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalActions = actionsSnapshot.size;
    
    const actionsMetricRef = db.collection('metrics_daily').doc(`MODERATOR_ACTIONS_${dateStr}`);
    await actionsMetricRef.set({
      id: `MODERATOR_ACTIONS_${dateStr}`,
      date: dateStr,
      metricKey: 'MODERATOR_ACTIONS',
      value: totalActions,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt enforcement metrics: ${totalChanges} changes, ${totalActions} moderator actions`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding enforcement metrics:', error);
  }
}

/**
 * Rebuild user-related metrics
 */
async function rebuildUserMetrics(
  dateStr: string,
  startOfDay: Date,
  endOfDay: Date
): Promise<void> {
  try {
    // Count new users by checking user creation dates
    // Note: This requires user documents to have createdAt field
    const newUsersSnapshot = await db.collection('users')
      .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
      .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      .get();
    
    const totalNewUsers = newUsersSnapshot.size;
    
    const newUsersMetricRef = db.collection('metrics_daily').doc(`NEW_USERS_${dateStr}`);
    await newUsersMetricRef.set({
      id: `NEW_USERS_${dateStr}`,
      date: dateStr,
      metricKey: 'NEW_USERS',
      value: totalNewUsers,
      updatedAt: Timestamp.now(),
    }, { merge: true });
    
    console.log(`[MetricsJob] Rebuilt user metrics: ${totalNewUsers} new users`);
  } catch (error) {
    console.error('[MetricsJob] Error rebuilding user metrics:', error);
  }
}