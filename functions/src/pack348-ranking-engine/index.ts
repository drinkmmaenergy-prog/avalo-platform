/**
 * PACK 348 — Ranking Engine Cloud Functions
 * 
 * HTTP endpoints and scheduled functions for ranking system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { RankingService } from './ranking-service';
import { RankingMetrics } from './types';

const db = admin.firestore();
const rankingService = new RankingService(db);

/**
 * Calculate ranking for a specific creator
 * Called when creator metrics change
 */
export const calculateCreatorRanking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { userId, metrics, countryCode, tier } = data;

  try {
    const score = await rankingService.calculateCreatorRanking(
      userId,
      metrics as RankingMetrics,
      countryCode,
      tier
    );

    return { success: true, score };
  } catch (error) {
    console.error('Error calculating ranking:', error);
    throw new functions.https.HttpsError('internal', 'Failed to calculate ranking');
  }
});

/**
 * Get ranked creators for discovery
 */
export const getRankedDiscovery = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { countryCode, limit = 50 } = data;

  try {
    const creators = await rankingService.getRankedCreatorsForDiscovery(countryCode, limit);
    return { success: true, creators };
  } catch (error) {
    console.error('Error getting ranked discovery:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get ranked discovery');
  }
});

/**
 * Get ranked feed items
 */
export const getRankedFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { limit = 50 } = data;
  const userId = context.auth.uid;

  try {
    const items = await rankingService.getRankedFeedItems(userId, limit);
    return { success: true, items };
  } catch (error) {
    console.error('Error getting ranked feed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get ranked feed');
  }
});

/**
 * Get ranked AI companions
 */
export const getRankedAICompanions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { countryCode, limit = 20 } = data;

  try {
    const companions = await rankingService.getRankedAICompanions(countryCode, limit);
    return { success: true, companions };
  } catch (error) {
    console.error('Error getting ranked AI companions:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get ranked AI companions');
  }
});

/**
 * Admin: Update global ranking configuration
 */
export const updateRankingConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin privileges
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { config } = data;
  const adminEmail = context.auth.token.email || 'unknown';

  try {
    const configResolver = rankingService.getConfigResolver();
    await configResolver.updateGlobalConfig(config, context.auth.uid, adminEmail);
    return { success: true };
  } catch (error) {
    console.error('Error updating ranking config:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update ranking config');
  }
});

/**
 * Admin: Update country-specific override
 */
export const updateCountryRankingConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin privileges
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, override, enabled, notes } = data;
  const adminEmail = context.auth.token.email || 'unknown';

  try {
    const configResolver = rankingService.getConfigResolver();
    await configResolver.updateCountryConfig(
      countryCode,
      override,
      enabled,
      context.auth.uid,
      adminEmail,
      notes
    );
    return { success: true };
  } catch (error) {
    console.error('Error updating country ranking config:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update country ranking config');
  }
});

/**
 * Admin: Create A/B test
 */
export const createABTest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin privileges
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { test } = data;

  try {
    const abTestManager = rankingService.getABTestManager();
    const testId = await abTestManager.createTest(test, context.auth.uid);
    return { success: true, testId };
  } catch (error) {
    console.error('Error creating A/B test:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create A/B test');
  }
});

/**
 * Admin: Disable A/B test
 */
export const disableABTest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin privileges
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testId } = data;

  try {
    const abTestManager = rankingService.getABTestManager();
    await abTestManager.disableTest(testId, context.auth.uid);
    return { success: true };
  } catch (error) {
    console.error('Error disabling A/B test:', error);
    throw new functions.https.HttpsError('internal', 'Failed to disable A/B test');
  }
});

/**
 * Admin: Get A/B test results
 */
export const getABTestResults = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin privileges
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testId } = data;

  try {
    const abTestManager = rankingService.getABTestManager();
    const results = await abTestManager.getTestResults(testId);
    return { success: true, results };
  } catch (error) {
    console.error('Error getting A/B test results:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get A/B test results');
  }
});

/**
 * Scheduled: Recalculate all rankings (daily at 3 AM)
 */
export const recalculateAllRankingsScheduled = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Starting scheduled ranking recalculation...');

    try {
      const result = await rankingService.recalculateAllRankings();
      console.log(`Ranking recalculation complete: ${result.processed} processed, ${result.errors} errors`);
    } catch (error) {
      console.error('Error in scheduled ranking recalculation:', error);
    }
  });

/**
 * Trigger: Recalculate ranking when user metrics change
 */
export const onUserMetricsUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Check if ranking-relevant metrics changed
    const metricsChanged =
      before.activityCount !== after.activityCount ||
      before.averageRating !== after.averageRating ||
      before.totalEarnings !== after.totalEarnings ||
      before.refundCount !== after.refundCount ||
      before.mismatchCount !== after.mismatchCount;

    if (metricsChanged && after.isCreator) {
      try {
        const metrics: RankingMetrics = {
          activityCount: after.activityCount || 0,
          averageRating: after.averageRating || 0,
          totalEarnings: after.totalEarnings || 0,
          refundCount: after.refundCount || 0,
          mismatchCount: after.mismatchCount || 0,
          totalTransactions: after.totalTransactions || 0,
        };

        await rankingService.calculateCreatorRanking(
          userId,
          metrics,
          after.countryCode || 'US',
          after.tier || 'standard'
        );

        console.log(`Updated ranking for user ${userId}`);
      } catch (error) {
        console.error(`Error updating ranking for user ${userId}:`, error);
      }
    }
  });
