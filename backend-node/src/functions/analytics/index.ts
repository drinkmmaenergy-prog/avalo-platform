/**
 * PACK 410 - Enterprise Analytics
 * Cloud Functions Exports
 */

import * as admin from 'firebase-admin';
import { logAnalyticsEvent } from './eventIngestion';
import { computeKPIs, scheduleKPIComputation } from './kpiEngine';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * HTTP endpoint to log analytics event
 * Called by other cloud functions and services
 */
export async function logEventAPI(data: any, context: any): Promise<any> {
  // Server-only function
  if (!context.auth && !data.serverKey) {
    throw new Error('This function can only be called from server-side');
  }
  
  try {
    const eventId = await logAnalyticsEvent(data);
    return { success: true, eventId };
  } catch (error) {
    console.error('Failed to log event:', error);
    throw new Error('Failed to log analytics event');
  }
}

/**
 * Scheduled KPI computation (runs every hour)
 * Deploy with: firebase deploy --only functions:computeKPIsScheduled
 */
export async function computeKPIsScheduled(): Promise<void> {
  try {
    await scheduleKPIComputation();
    console.log('KPI computation completed');
  } catch (error) {
    console.error('Failed to compute KPIs:', error);
    throw error;
  }
}

/**
 * HTTP endpoint to manually trigger KPI computation
 * Admin only
 */
export async function triggerKPIComputation(data: any, context: any): Promise<any> {
  // Check admin auth
  if (!context.auth) {
    throw new Error('Must be authenticated');
  }
  
  // TODO: Add admin role check
  
  try {
    const period = data.period || 'daily';
    const timestamp = data.timestamp || Date.now();
    const kpiSnapshot = await computeKPIs(period, timestamp);
    return { success: true, kpiSnapshot };
  } catch (error) {
    console.error('Failed to compute KPIs:', error);
    throw new Error('Failed to compute KPIs');
  }
}

/**
 * Firestore trigger: Update daily rollups when new event is created
 */
export async function updateDailyRollups(eventId: string): Promise<void> {
  const db = admin.firestore();
  const eventDoc = await db.collection('analytics_events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    return;
  }
  
  const event = eventDoc.data()!;
  const date = new Date(event.timestamp).toISOString().split('T')[0];
  
  const rollupRef = db.collection('analytics_daily_rollups').doc(date);
    
    await db.runTransaction(async (transaction) => {
      const rollup = await transaction.get(rollupRef);
      
      if (!rollup.exists) {
        transaction.set(rollupRef, {
          date,
          dau: 1,
          wau: 1,
          mau: 1,
          revenue: event.revenueImpact || 0,
          tokensBurned: 0,
          tokensEarned: 0,
          newUsers: event.eventType === 'user_signup' ? 1 : 0,
          churnedUsers: 0,
          activeMeetings: 0,
          activeChats: 0,
          fraudIncidents: 0,
          safetyIncidents: 0,
          creatorEarnings: 0,
          aiRevenue: 0,
          computedAt: Date.now(),
        });
      } else {
        const updates: any = {
          revenue: (rollup.data()?.revenue || 0) + (event.revenueImpact || 0),
        };
        
        if (event.eventType === 'user_signup') {
          updates.newUsers = (rollup.data()?.newUsers || 0) + 1;
        }
        if (event.eventType === 'fraud_detected') {
          updates.fraudIncidents = (rollup.data()?.fraudIncidents || 0) + 1;
        }
        if (event.eventType === 'safety_report') {
          updates.safetyIncidents = (rollup.data()?.safetyIncidents || 0) + 1;
        }
        
        transaction.update(rollupRef, updates);
      }
  });
}

/**
 * Export analytics data to CSV/JSON
 */
export async function exportAnalyticsData(data: any, context: any): Promise<any> {
  // Check admin auth
  if (!context.auth) {
    throw new Error('Must be authenticated');
  }
  
  const { collection, startDate, endDate, format } = data;
  
  if (!collection || !startDate || !endDate || !format) {
    throw new Error('Missing required parameters');
  }
  
  try {
    const db = admin.firestore();
    const exportRef = await db.collection('analytics_exports').add({
      queryId: `export_${Date.now()}`,
      requestedBy: context.auth.uid,
      requestedAt: Date.now(),
      format,
      status: 'pending',
      collection,
      startDate,
      endDate,
    });
    
    // Trigger async export processing
    // TODO: Implement export processing in separate function
    
    return { success: true, exportId: exportRef.id };
  } catch (error) {
    console.error('Failed to export data:', error);
    throw new Error('Failed to export data');
  }
}

/**
 * Get analytics dashboard data
 */
export async function getDashboardData(data: any, context: any): Promise<any> {
  // Check admin auth
  if (!context.auth) {
    throw new Error('Must be authenticated');
  }
  
  const { period, metric } = data;
  
  try {
    const db = admin.firestore();
    
    // Get latest KPI snapshot
    const snapshotsQuery = await db
      .collection('analytics_kpi_snapshots')
      .where('period', '==', period || 'daily')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (snapshotsQuery.empty) {
      return { success: true, data: null };
    }
    
    const snapshot = snapshotsQuery.docs[0].data();
    
    return { success: true, data: snapshot.data() };
  } catch (error) {
    console.error('Failed to get dashboard data:', error);
    throw new Error('Failed to get dashboard data');
  }
}

/**
 * Get creator analytics data
 */
export async function getCreatorAnalytics(data: any, context: any): Promise<any> {
  if (!context.auth) {
    throw new Error('Must be authenticated');
  }
  
  const creatorId = data.creatorId || context.auth.uid;
  
  // Check if user is requesting their own data or is admin
  if (creatorId !== context.auth.uid) {
    // TODO: Check admin role
  }
  
  try {
    const db = admin.firestore();
    
    // Get last 30 days of earnings
    const earningsQuery = await db
      .collection('analytics_creator_earnings')
      .where('creatorId', '==', creatorId)
      .orderBy('date', 'desc')
      .limit(30)
      .get();
    
    const earnings = earningsQuery.docs.map(doc => doc.data());
    
    return { success: true, earnings };
  } catch (error) {
    console.error('Failed to get creator analytics:', error);
    throw new Error('Failed to get creator analytics');
  }
}

/**
 * Get user analytics data (limited)
 */
export async function getUserAnalytics(data: any, context: any): Promise<any> {
  if (!context.auth) {
    throw new Error('Must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const db = admin.firestore();
    
    // Get user lifecycle data
    const lifecycleDoc = await db
      .collection('analytics_user_lifecycle')
      .doc(userId)
      .get();
    
    if (!lifecycleDoc.exists) {
      return { success: true, data: null };
    }
    
    const lifecycle = lifecycleDoc.data();
    
    // Return limited, privacy-safe data
    return {
      success: true,
      data: {
        totalSessions: lifecycle?.totalSessions,
        lifetimeValue: lifecycle?.lifetimeValue,
        cohort: lifecycle?.cohort,
        status: lifecycle?.status,
      },
    };
  } catch (error) {
    console.error('Failed to get user analytics:', error);
    throw new Error('Failed to get user analytics');
  }
}
