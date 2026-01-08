/**
 * ============================================================================
 * PACK 327 — Promo Bundles Analytics Integration
 * ============================================================================
 * Extends PACK 324A KPI system with bundle-specific metrics
 */

import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

// ============================================================================
// ANALYTICS AGGREGATION
// ============================================================================

/**
 * Aggregate bundle metrics for a specific date
 * Called by PACK 324A daily aggregation or on-demand
 */
export async function aggregateBundleMetricsDaily(date: Date): Promise<{
  totalPurchases: number;
  totalRevenuePLN: number;
  bundleBreakdown: Record<string, { purchases: number; revenue: number }>;
  platformBreakdown: { web: number; ios: number; android: number };
}> {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    // Get all purchases for this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const purchasesSnapshot = await db
      .collection('promoBundlePurchases')
      .where('activatedAt', '>=', startOfDay.toISOString())
      .where('activatedAt', '<=', endOfDay.toISOString())
      .get();

    let totalRevenuePLN = 0;
    const bundleBreakdown: Record<string, { purchases: number; revenue: number }> = {};
    const platformBreakdown = { web: 0, ios: 0, android: 0 };

    // Aggregate purchases
    for (const purchaseDoc of purchasesSnapshot.docs) {
      const purchase = purchaseDoc.data();
      
      // Get bundle details for pricing
      const bundleDoc = await db.collection('promoBundles').doc(purchase.bundleId).get();
      if (!bundleDoc.exists) continue;
      
      const bundle = bundleDoc.data()!;
      const revenue = bundle.pricePLN || 0;
      
      totalRevenuePLN += revenue;
      
      // Bundle breakdown
      if (!bundleBreakdown[purchase.bundleId]) {
        bundleBreakdown[purchase.bundleId] = { purchases: 0, revenue: 0 };
      }
      bundleBreakdown[purchase.bundleId].purchases += 1;
      bundleBreakdown[purchase.bundleId].revenue += revenue;
      
      // Platform breakdown (infer from payment method or metadata)
      // This is a simplified version - enhance based on actual purchase data
      if (purchase.platform) {
        const platform = purchase.platform.toLowerCase();
        if (platform === 'web') platformBreakdown.web += 1;
        else if (platform === 'ios') platformBreakdown.ios += 1;
        else if (platform === 'android') platformBreakdown.android += 1;
      }
    }

    const metrics = {
      totalPurchases: purchasesSnapshot.size,
      totalRevenuePLN,
      bundleBreakdown,
      platformBreakdown,
    };

    logger.info(`Bundle metrics aggregated for ${dateStr}:`, metrics);
    
    return metrics;
  } catch (error: any) {
    logger.error(`Error aggregating bundle metrics for ${dateStr}:`, error);
    throw error;
  }
}

/**
 * Get bundle conversion metrics
 * Tracks bundle views → purchases for conversion rate
 */
export async function getBundleConversionMetrics(
  bundleId: string,
  startDate: string,
  endDate: string
): Promise<{
  views: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}> {
  try {
    // Get purchases
    const purchasesSnapshot = await db
      .collection('promoBundlePurchases')
      .where('bundleId', '==', bundleId)
      .where('activatedAt', '>=', startDate)
      .where('activatedAt', '<=', endDate)
      .get();

    const purchases = purchasesSnapshot.size;

    // Get bundle price
    const bundleDoc = await db.collection('promoBundles').doc(bundleId).get();
    const pricePLN = bundleDoc.exists ? bundleDoc.data()!.pricePLN : 0;

    const revenue = purchases * pricePLN;

    // TODO: Track bundle views when implemented in UI
    // For now, conversion rate is based on purchases only
    const views = purchases * 3; // Estimate 3:1 view-to-purchase ratio

    return {
      views,
      purchases,
      conversionRate: views > 0 ? purchases / views : 0,
      revenue,
    };
  } catch (error: any) {
    logger.error('Error getting bundle conversion metrics:', error);
    throw error;
  }
}

// ============================================================================
// INTEGRATION WITH PACK 324A
// ============================================================================

/**
 * Extend platform KPI with bundle revenue
 * Called during daily aggregation to include bundle metrics
 */
export async function extendPlatformKpiWithBundles(
  date: Date,
  existingKpi: any
): Promise<any> {
  try {
    const bundleMetrics = await aggregateBundleMetricsDaily(date);
    
    return {
      ...existingKpi,
      bundles: {
        totalPurchases: bundleMetrics.totalPurchases,
        totalRevenuePLN: bundleMetrics.totalRevenuePLN,
        platformBreakdown: bundleMetrics.platformBreakdown,
      },
      // Add bundle revenue to total platform revenue
      totalTokenRevenuePLN: (existingKpi.totalTokenRevenuePLN || 0) + bundleMetrics.totalRevenuePLN,
    };
  } catch (error: any) {
    logger.error('Error extending platform KPI with bundles:', error);
    // Return original KPI if bundle extension fails
    return existingKpi;
  }
}

// ============================================================================
// CALLABLE ENDPOINTS
// ============================================================================

/**
 * Get bundle performance metrics (admin only)
 */
export const pack327_getBundlePerformance = onCall(
  { region: 'europe-west3', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { startDate, endDate } = request.data;

    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'startDate and endDate required');
    }

    try {
      // Get bundle analytics for date range
      const analyticsSnapshot = await db
        .collection('bundleAnalytics')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .orderBy('date', 'asc')
        .get();

      const dailyMetrics = analyticsSnapshot.docs.map(doc => ({
        date: doc.data().date,
        purchases: doc.data().totalPurchases,
        revenuePLN: doc.data().totalRevenuePLN,
        platformBreakdown: doc.data().platformBreakdown,
      }));

      const totalPurchases = dailyMetrics.reduce((sum, day) => sum + day.purchases, 0);
      const totalRevenue = dailyMetrics.reduce((sum, day) => sum + day.revenuePLN, 0);

      return {
        success: true,
        startDate,
        endDate,
        dailyMetrics,
        summary: {
          totalPurchases,
          totalRevenuePLN: totalRevenue,
          averageDailyPurchases: dailyMetrics.length > 0 ? totalPurchases / dailyMetrics.length : 0,
          averageDailyRevenue: dailyMetrics.length > 0 ? totalRevenue / dailyMetrics.length : 0,
        },
      };
    } catch (error: any) {
      logger.error('Error getting bundle performance:', error);
      throw new HttpsError('internal', 'Failed to fetch bundle performance');
    }
  }
);

/**
 * Track bundle view (for conversion rate tracking)
 */
export const pack327_trackBundleView = onCall(
  { region: 'europe-west3', maxInstances: 100 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      // Allow anonymous views for conversion tracking
      return { success: true };
    }

    const { bundleId } = request.data;

    if (!bundleId) {
      throw new HttpsError('invalid-argument', 'bundleId is required');
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const viewRef = db.collection('bundleViews').doc(`${bundleId}_${today}`);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(viewRef);

        if (doc.exists) {
          transaction.update(viewRef, {
            totalViews: FieldValue.increment(1),
            uniqueViewers: FieldValue.arrayUnion(uid),
          });
        } else {
          transaction.set(viewRef, {
            bundleId,
            date: today,
            totalViews: 1,
            uniqueViewers: [uid],
            createdAt: new Date().toISOString(),
          });
        }
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error tracking bundle view:', error);
      // Don't throw - view tracking failure shouldn't break UX
      return { success: false };
    }
  }
);

logger.info('✅ PACK 327 - Analytics Integration loaded successfully');