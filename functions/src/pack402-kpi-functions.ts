/**
 * PACK 402 — KPI Cloud Functions
 * 
 * Scheduled functions for hourly/daily KPI aggregation.
 * Admin-only HTTPS callable for fetching KPI data.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  buildDailyKpis,
  buildHourlyKpis,
  fetchKpis,
  backfillDailyKpis,
} from './pack402-kpi-service';
import { KpiType, KpiInterval } from './pack402-kpi-types';

/**
 * Scheduled function: Build hourly KPIs
 * Runs every hour at minute 5
 */
export const pack402_buildHourlyKpis = functions.pubsub
  .schedule('5 * * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = now.getUTCHours();

    console.log(`[PACK 402] Triggered hourly KPI build for ${date} hour ${hour}`);

    try {
      await buildHourlyKpis(date, hour);
      console.log(`[PACK 402] Hourly KPI build completed`);
    } catch (error) {
      console.error(`[PACK 402] Hourly KPI build failed:`, error);
      throw error;
    }
  });

/**
 * Scheduled function: Build daily KPIs
 * Runs once per day at 02:00 UTC for the previous day
 */
export const pack402_buildDailyKpis = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[PACK 402] Triggered daily KPI build for ${date}`);

    try {
      await buildDailyKpis(date);
      console.log(`[PACK 402] Daily KPI build completed`);
    } catch (error) {
      console.error(`[PACK 402] Daily KPI build failed:`, error);
      throw error;
    }
  });

/**
 * Helper to check if user has admin role
 */
async function isAdmin(uid: string): Promise<boolean> {
  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const userData = userDoc.data();
    const role = userData?.role || 'user';
    return role === 'admin' || role === 'super_admin' || role === 'moderator';
  } catch (error) {
    console.error('[PACK 402] Admin check failed:', error);
    return false;
  }
}

/**
 * HTTPS Callable: Get KPIs for date range
 * Admin-only access
 */
export const pack402_getKpis = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be authenticated to fetch KPIs'
    );
  }

  // Admin check
  const adminCheck = await isAdmin(context.auth.uid);
  if (!adminCheck) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Must be admin to fetch KPIs'
    );
  }

  // Validate input
  const { type, fromDate, toDate, interval } = data;

  if (!type || !['growth', 'engagement', 'revenue', 'safety', 'support'].includes(type)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid KPI type. Must be one of: growth, engagement, revenue, safety, support'
    );
  }

  if (!fromDate || !toDate) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'fromDate and toDate are required (YYYY-MM-DD)'
    );
  }

  if (!interval || !['day', 'hour'].includes(interval)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid interval. Must be "day" or "hour"'
    );
  }

  // Validate date range
  const fromDateObj = new Date(fromDate);
  const toDateObj = new Date(toDate);
  const daysDiff = Math.ceil((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));

  if (interval === 'day' && daysDiff > 90) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Maximum range for daily KPIs is 90 days'
    );
  }

  if (interval === 'hour' && daysDiff > 7) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Maximum range for hourly KPIs is 7 days'
    );
  }

  try {
    const kpis = await fetchKpis(type as KpiType, fromDate, toDate, interval as KpiInterval);
    return {
      success: true,
      type,
      interval,
      fromDate,
      toDate,
      count: kpis.length,
      data: kpis,
    };
  } catch (error) {
    console.error('[PACK 402] Error fetching KPIs:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to fetch KPIs'
    );
  }
});

/**
 * HTTPS Callable: Backfill daily KPIs (admin only)
 * Use sparingly, for historical data recovery
 */
export const pack402_backfillDailyKpis = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes
    memory: '2GB',
  })
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to backfill KPIs'
      );
    }

    // Admin check
    const adminCheck = await isAdmin(context.auth.uid);
    if (!adminCheck) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Must be admin to backfill KPIs'
      );
    }

    const { fromDate, toDate } = data;

    if (!fromDate || !toDate) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'fromDate and toDate are required (YYYY-MM-DD)'
      );
    }

    // Validate max range (30 days for backfill)
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    const daysDiff = Math.ceil((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 30) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum backfill range is 30 days'
      );
    }

    try {
      await backfillDailyKpis(fromDate, toDate);
      return {
        success: true,
        message: `Backfilled daily KPIs from ${fromDate} to ${toDate}`,
        daysProcessed: daysDiff + 1,
      };
    } catch (error) {
      console.error('[PACK 402] Backfill failed:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to backfill KPIs'
      );
    }
  });

/**
 * HTTPS endpoint: Get KPIs (alternative to callable, for admin web)
 * Returns JSON directly
 */
export const pack402_getKpisHttp = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Check authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    // Verify token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check admin
    const adminCheck = await isAdmin(decodedToken.uid);
    if (!adminCheck) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    // Parse query params
    const { type, fromDate, toDate, interval } = req.query;

    if (!type || !fromDate || !toDate || !interval) {
      res.status(400).json({ error: 'Missing required parameters: type, fromDate, toDate, interval' });
      return;
    }

    // Validate
    if (!['growth', 'engagement', 'revenue', 'safety', 'support'].includes(type as string)) {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }

    if (!['day', 'hour'].includes(interval as string)) {
      res.status(400).json({ error: 'Invalid interval' });
      return;
    }

    // Fetch KPIs
    const kpis = await fetchKpis(
      type as KpiType,
      fromDate as string,
      toDate as string,
      interval as KpiInterval
    );

    res.status(200).json({
      success: true,
      type,
      interval,
      fromDate,
      toDate,
      count: kpis.length,
      data: kpis,
    });
  } catch (error) {
    console.error('[PACK 402] HTTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
