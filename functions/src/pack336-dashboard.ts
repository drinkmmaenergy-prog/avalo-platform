import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 336 — ADMIN DASHBOARD ENDPOINTS
 * 
 * Data layer for investor dashboard with tabs:
 * - Overview
 * - Revenue Streams
 * - Cohorts
 * - Countries
 * - Virality
 * - Churn
 * 
 * Charts:
 * - DAU/WAU/MAU
 * - Paying Users
 * - ARPU / ARPPU
 * - Token Velocity
 * - Refund Ratio
 * - 7/30/90-day retention
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import type { KpiDashboardData } from './pack336-types';
import { HttpsError, admin, auth, onCall } from './runtime';

// ============================================================================
// DASHBOARD OVERVIEW
// ============================================================================

/**
 * Get complete dashboard data (admin only)
 */
export const pack336_getDashboard = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { dateRange } = data;
  const days = dateRange || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Get latest North Star metric
    const northStarSnapshot = await db.collection('kpiNorthStarSnapshots')
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    
    const northStar = northStarSnapshot.empty ? null : northStarSnapshot.docs[0].data();
    
    // Get latest daily global KPI
    const dailyGlobalSnapshot = await db.collection('kpiDailyGlobal')
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    
    const dailyGlobal = dailyGlobalSnapshot.empty ? null : dailyGlobalSnapshot.docs[0].data();
    
    // Get latest revenue streams
    const revenueStreamsSnapshot = await db.collection('kpiRevenueStreams')
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    
    const revenueStreams = revenueStreamsSnapshot.empty ? null : revenueStreamsSnapshot.docs[0].data();
    
    // Get active alerts
    const alertsSnapshot = await db.collection('kpiAlerts')
      .where('status', '==', 'ACTIVE')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    const alerts = alertsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return {
      success: true,
      dashboard: {
        northStar,
        dailyGlobal,
        revenueStreams,
        alerts,
        lastUpdated: new Date(),
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting dashboard:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get daily global KPI timeseries for charts (admin only)
 */
export const pack336_getDailyGlobalTimeseries = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiDailyGlobal')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const timeseries = snapshot.docs.map(doc => ({
      date: doc.data().date,
      dau: doc.data().activeUsersDAU,
      wau: doc.data().activeUsersWAU,
      mau: doc.data().activeUsersMAU,
      payingDAU: doc.data().payingUsersDAU,
      payingWAU: doc.data().payingUsersWAU,
      payingMAU: doc.data().payingUsersMAU,
      revenue: doc.data().totalRevenueUSD,
      refundRate: doc.data().refundRate,
      tokenSpent: doc.data().totalTokenSpent,
    }));
    
    return { success: true, timeseries };
  } catch (error: any) {
    console.error('[PACK 336] Error getting timeseries:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get revenue streams timeseries for charts (admin only)
 */
export const pack336_getRevenueStreamsTimeseries = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiRevenueStreams')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const timeseries = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        chat: data.chatRevenueUSD,
        voice: data.voiceRevenueUSD,
        video: data.videoRevenueUSD,
        calendar: data.calendarRevenueUSD,
        events: data.eventsRevenueUSD,
        ai: data.aiRevenueUSD,
        subscriptions: data.subscriptionsUSD,
        tips: data.tipsRevenueUSD,
        total: data.totalRevenueUSD,
      };
    });
    
    return { success: true, timeseries };
  } catch (error: any) {
    console.error('[PACK 336] Error getting revenue streams timeseries:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get country breakdown with ranking (admin only)
 */
export const pack336_getCountryBreakdown = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days, sortBy } = data;
  const period = days || 30;
  const sortField = sortBy || 'revenue';
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiDailyByCountry')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .get();
    
    // Aggregate by country
    const countryAggregates = new Map<string, {
      users: number;
      newRegistrations: number;
      payingUsers: number;
      revenue: number;
    }>();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const country = data.country;
      const existing = countryAggregates.get(country) || {
        users: 0,
        newRegistrations: 0,
        payingUsers: 0,
        revenue: 0,
      };
      
      countryAggregates.set(country, {
        users: Math.max(existing.users, data.usersActive || 0),
        newRegistrations: existing.newRegistrations + (data.newRegistrations || 0),
        payingUsers: Math.max(existing.payingUsers, data.payingUsers || 0),
        revenue: existing.revenue + (data.revenueUSD || 0),
      });
    });
    
    // Convert to array and sort
    let countries = Array.from(countryAggregates.entries()).map(([country, data]) => ({
      country,
      ...data,
      avgSpendPerUser: data.payingUsers > 0 ? data.revenue / data.payingUsers : 0,
    }));
    
    // Sort by specified field
    if (sortField === 'revenue') {
      countries.sort((a, b) => b.revenue - a.revenue);
    } else if (sortField === 'users') {
      countries.sort((a, b) => b.users - a.users);
    } else if (sortField === 'payingUsers') {
      countries.sort((a, b) => b.payingUsers - a.payingUsers);
    }
    
    return { success: true, countries };
  } catch (error: any) {
    console.error('[PACK 336] Error getting country breakdown:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get cohort retention analysis (admin only)
 */
export const pack336_getCohortAnalysis = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { limit } = data;
  
  try {
    const snapshot = await db.collection('kpiCohorts')
      .orderBy('cohortId', 'desc')
      .limit(limit || 12)
      .get();
    
    const cohorts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        cohort: data.cohortId,
        initialUsers: data.initialUsers,
        day7Retention: data.day7Retention,
        day30Retention: data.day30Retention,
        day90Retention: data.day90Retention,
        revenueDay7: data.revenueDay7USD,
        revenueDay30: data.revenueDay30USD,
        revenueDay90: data.revenueDay90USD,
        avgLTV: data.avgLTVUSD,
      };
    });
    
    return { success: true, cohorts };
  } catch (error: any) {
    console.error('[PACK 336] Error getting cohort analysis:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get virality metrics timeseries (admin only)
 */
export const pack336_getViralityTimeseries = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiVirality')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const timeseries = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        invitedUsers: data.invitedUsers,
        activatedFromInvite: data.activatedFromInvite,
        kFactor: data.kFactor,
        viralRevenue: data.viralRevenueUSD,
        conversionRate: data.invitedUsers > 0
          ? (data.activatedFromInvite / data.invitedUsers) * 100
          : 0,
      };
    });
    
    return { success: true, timeseries };
  } catch (error: any) {
    console.error('[PACK 336] Error getting virality timeseries:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calculate ARPU and ARPPU for period (admin only)
 */
export const pack336_getARPUMetrics = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiDailyGlobal')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const metrics = snapshot.docs.map(doc => {
      const data = doc.data();
      const arpu = data.activeUsersDAU > 0
        ? data.totalRevenueUSD / data.activeUsersDAU
        : 0;
      
      const arppu = data.payingUsersDAU > 0
        ? data.totalRevenueUSD / data.payingUsersDAU
        : 0;
      
      return {
        date: data.date,
        arpu,
        arppu,
        dau: data.activeUsersDAU,
        payingDAU: data.payingUsersDAU,
        revenue: data.totalRevenueUSD,
      };
    });
    
    // Calculate averages
    const avgARPU = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.arpu, 0) / metrics.length
      : 0;
    
    const avgARPPU = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.arppu, 0) / metrics.length
      : 0;
    
    return {
      success: true,
      metrics,
      averages: {
        arpu: avgARPU,
        arppu: avgARPPU,
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting ARPU metrics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get token velocity metrics (admin only)
 */
export const pack336_getTokenVelocity = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiDailyGlobal')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const velocity = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      const prevDoc = index > 0 ? snapshot.docs[index - 1].data() : null;
      
      const velocityChange = prevDoc && prevDoc.totalTokenSpent > 0
        ? ((data.totalTokenSpent - prevDoc.totalTokenSpent) / prevDoc.totalTokenSpent) * 100
        : 0;
      
      return {
        date: data.date,
        tokenSpent: data.totalTokenSpent,
        velocityChangePercent: velocityChange,
        dau: data.activeUsersDAU,
        tokensPerDAU: data.activeUsersDAU > 0
          ? data.totalTokenSpent / data.activeUsersDAU
          : 0,
      };
    });
    
    return { success: true, velocity };
  } catch (error: any) {
    console.error('[PACK 336] Error getting token velocity:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get refund metrics analysis (admin only)
 */
export const pack336_getRefundAnalysis = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiDailyGlobal')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const refundMetrics = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        refundCount: data.refundsCount,
        refundVolume: data.refundVolumeUSD,
        refundRate: data.refundRate * 100,
        revenue: data.totalRevenueUSD,
      };
    });
    
    // Calculate totals
    const totalRefunds = refundMetrics.reduce((sum, m) => sum + m.refundCount, 0);
    const totalRefundVolume = refundMetrics.reduce((sum, m) => sum + m.refundVolume, 0);
    const totalRevenue = refundMetrics.reduce((sum, m) => sum + m.revenue, 0);
    const avgRefundRate = totalRevenue > 0 ? (totalRefundVolume / totalRevenue) * 100 : 0;
    
    return {
      success: true,
      metrics: refundMetrics,
      totals: {
        refundCount: totalRefunds,
        refundVolume: totalRefundVolume,
        avgRefundRate,
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting refund analysis:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get North Star metric history (admin only)
 */
export const pack336_getNorthStarHistory = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { days } = data;
  const period = days || 30;
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('kpiNorthStarSnapshots')
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .orderBy('date', 'asc')
      .get();
    
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        weeklyPayingUsers: data.weeklyPayingUsers,
        monthlyPayingUsers: data.monthlyPayingUsers,
        avgInteractions: data.avgInteractionsPerUser,
        avgRevenue: data.avgRevenuePerUser,
      };
    });
    
    return { success: true, history };
  } catch (error: any) {
    console.error('[PACK 336] Error getting North Star history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get platform health summary (admin only)
 * Quick overview of key metrics
 */
export const pack336_getPlatformHealth = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  try {
    // Get latest metrics
    const [northStarSnap, dailyGlobalSnap, alertsSnap] = await Promise.all([
      db.collection('kpiNorthStarSnapshots').orderBy('date', 'desc').limit(1).get(),
      db.collection('kpiDailyGlobal').orderBy('date', 'desc').limit(2).get(),
      db.collection('kpiAlerts').where('status', '==', 'ACTIVE').count().get(),
    ]);
    
    const northStar = northStarSnap.empty ? null : northStarSnap.docs[0].data();
    const today = dailyGlobalSnap.docs[0]?.data();
    const yesterday = dailyGlobalSnap.docs[1]?.data();
    
    // Calculate day-over-day changes
    const dauChange = yesterday && yesterday.activeUsersDAU > 0
      ? ((today.activeUsersDAU - yesterday.activeUsersDAU) / yesterday.activeUsersDAU) * 100
      : 0;
    
    const revenueChange = yesterday && yesterday.totalRevenueUSD > 0
      ? ((today.totalRevenueUSD - yesterday.totalRevenueUSD) / yesterday.totalRevenueUSD) * 100
      : 0;
    
    return {
      success: true,
      health: {
        northStarMetric: northStar?.weeklyPayingUsers || 0,
        dau: today?.activeUsersDAU || 0,
        dauChange,
        revenue: today?.totalRevenueUSD || 0,
        revenueChange,
        payingUsers: today?.payingUsersDAU || 0,
        refundRate: (today?.refundRate || 0) * 100,
        activeAlerts: alertsSnap.data().count,
        lastUpdated: today?.date || null,
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting platform health:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});


























