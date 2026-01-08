/**
 * PACK 398 - ASO DOMINATION ENGINE
 * 
 * Controls keyword ranking velocity, A/B testing for store assets,
 * and optimizes App Store Optimization based on performance metrics.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ASO Test Types
export enum ASOTestType {
  TITLE = 'TITLE',
  SUBTITLE = 'SUBTITLE',
  DESCRIPTION = 'DESCRIPTION',
  SCREENSHOTS = 'SCREENSHOTS',
  ICON = 'ICON',
  KEYWORDS = 'KEYWORDS',
  PROMO_TEXT = 'PROMO_TEXT',
}

// ASO Test Variant
export interface ASOTestVariant {
  variantId: string;
  variantName: string;
  content: any; // Depends on test type
  impressions: number;
  views: number;
  installs: number;
  conversionRate: number;
  uninstallsDay1: number;
  uninstallRateDay1: number;
  avgRating: number;
  trafficAllocation: number; // Percentage 0-100
  isWinner: boolean;
  isActive: boolean;
}

// ASO A/B Test
export interface ASOABTest {
  testId: string;
  testType: ASOTestType;
  testName: string;
  countryCode: string;
  platform: 'ios' | 'android' | 'both';
  variants: ASOTestVariant[];
  startDate: admin.firestore.Timestamp;
  endDate?: admin.firestore.Timestamp;
  status: 'draft' | 'running' | 'paused' | 'completed';
  winnerVariantId?: string;
  targetSampleSize: number;
  currentSampleSize: number;
  confidenceLevel: number;
  createdAt: admin.firestore.Timestamp;
  createdBy: string;
  notes?: string;
}

// Keyword Performance
export interface KeywordPerformance {
  keyword: string;
  countryCode: string;
  platform: 'ios' | 'android';
  currentRank: number;
  previousRank: number;
  rankChange: number;
  searchVolume: number;
  difficulty: number;
  impressions: number;
  taps: number;
  installs: number;
  conversionRate: number;
  relevanceScore: number;
  targetRank: number;
  updatedAt: admin.firestore.Timestamp;
}

// Store Performance Metrics
export interface StorePerformanceMetrics {
  countryCode: string;
  platform: 'ios' | 'android';
  date: string;
  impressions: number;
  productPageViews: number;
  installs: number;
  conversionRate: number;
  uninstallsDay1: number;
  uninstallRateDay1: number;
  uninstallsDay7: number;
  uninstallRateDay7: number;
  avgRating: number;
  totalReviews: number;
  positiveReviewRatio: number;
  organicInstalls: number;
  paidInstalls: number;
  timestamp: admin.firestore.Timestamp;
}

const db = admin.firestore();

/**
 * Create ASO A/B Test
 */
export const createASOTest = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testType, testName, countryCode, platform, variants } = data;

  if (!testType || !testName || !countryCode || !platform || !variants || variants.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid test configuration');
  }

  const testId = `aso_test_${Date.now()}`;

  const test: ASOABTest = {
    testId,
    testType,
    testName,
    countryCode,
    platform,
    variants: variants.map((v: any, index: number) => ({
      variantId: `variant_${index + 1}`,
      variantName: v.name || `Variant ${index + 1}`,
      content: v.content,
      impressions: 0,
      views: 0,
      installs: 0,
      conversionRate: 0,
      uninstallsDay1: 0,
      uninstallRateDay1: 0,
      avgRating: 0,
      trafficAllocation: v.trafficAllocation || (100 / variants.length),
      isWinner: false,
      isActive: true,
    })),
    startDate: admin.firestore.Timestamp.now(),
    status: 'draft',
    targetSampleSize: data.targetSampleSize || 1000,
    currentSampleSize: 0,
    confidenceLevel: 0,
    createdAt: admin.firestore.Timestamp.now(),
    createdBy: context.auth.uid,
    notes: data.notes || '',
  };

  await db.collection('aso_ab_tests').doc(testId).set(test);

  return { success: true, testId };
});

/**
 * Start ASO A/B Test
 */
export const startASOTest = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testId } = data;

  if (!testId) {
    throw new functions.https.HttpsError('invalid-argument', 'Test ID required');
  }

  await db.collection('aso_ab_tests').doc(testId).update({
    status: 'running',
    startDate: admin.firestore.Timestamp.now(),
  });

  return { success: true, message: 'Test started' };
});

/**
 * Pause ASO A/B Test
 */
export const pauseASOTest = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testId } = data;

  await db.collection('aso_ab_tests').doc(testId).update({
    status: 'paused',
  });

  return { success: true, message: 'Test paused' };
});

/**
 * Complete ASO A/B Test and declare winner
 */
export const completeASOTest = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { testId, winnerVariantId } = data;

  if (!testId || !winnerVariantId) {
    throw new functions.https.HttpsError('invalid-argument', 'Test ID and winner variant required');
  }

  const testDoc = await db.collection('aso_ab_tests').doc(testId).get();
  const test = testDoc.data() as ASOABTest;

  const updatedVariants = test.variants.map(v => ({
    ...v,
    isWinner: v.variantId === winnerVariantId,
  }));

  await db.collection('aso_ab_tests').doc(testId).update({
    status: 'completed',
    endDate: admin.firestore.Timestamp.now(),
    winnerVariantId,
    variants: updatedVariants,
  });

  return { success: true, message: 'Test completed' };
});

/**
 * Record ASO test impression/conversion
 */
export const recordASOTestEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { testId, variantId, eventType } = data;
  // eventType: 'impression' | 'view' | 'install' | 'uninstall_day1'

  if (!testId || !variantId || !eventType) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid event data');
  }

  const testRef = db.collection('aso_ab_tests').doc(testId);
  const testDoc = await testRef.get();

  if (!testDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Test not found');
  }

  const test = testDoc.data() as ASOABTest;
  const variantIndex = test.variants.findIndex(v => v.variantId === variantId);

  if (variantIndex === -1) {
    throw new functions.https.HttpsError('not-found', 'Variant not found');
  }

  const variant = test.variants[variantIndex];

  // Update metrics
  switch (eventType) {
    case 'impression':
      variant.impressions++;
      break;
    case 'view':
      variant.views++;
      break;
    case 'install':
      variant.installs++;
      break;
    case 'uninstall_day1':
      variant.uninstallsDay1++;
      break;
  }

  // Recalculate rates
  variant.conversionRate = variant.views > 0 ? variant.installs / variant.views : 0;
  variant.uninstallRateDay1 = variant.installs > 0 ? variant.uninstallsDay1 / variant.installs : 0;

  test.variants[variantIndex] = variant;
  test.currentSampleSize = test.variants.reduce((sum, v) => sum + v.installs, 0);

  // Calculate confidence level (simplified)
  if (test.currentSampleSize >= test.targetSampleSize) {
    test.confidenceLevel = 95; // Simplified - should use proper statistical test
  } else {
    test.confidenceLevel = (test.currentSampleSize / test.targetSampleSize) * 95;
  }

  await testRef.update({
    variants: test.variants,
    currentSampleSize: test.currentSampleSize,
    confidenceLevel: test.confidenceLevel,
  });

  return { success: true };
});

/**
 * Track keyword performance
 */
export const trackKeywordPerformance = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { keyword, countryCode, platform, rank, searchVolume, difficulty, impressions, taps, installs } = data;

  if (!keyword || !countryCode || !platform) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid keyword data');
  }

  const keywordId = `${countryCode}_${platform}_${keyword.toLowerCase().replace(/\s+/g, '_')}`;
  const keywordRef = db.collection('keyword_performance').doc(keywordId);
  const keywordDoc = await keywordRef.get();

  const previousRank = keywordDoc.exists ? (keywordDoc.data() as KeywordPerformance).currentRank : rank;

  const keywordPerformance: KeywordPerformance = {
    keyword,
    countryCode,
    platform,
    currentRank: rank || 0,
    previousRank,
    rankChange: previousRank - rank,
    searchVolume: searchVolume || 0,
    difficulty: difficulty || 0,
    impressions: impressions || 0,
    taps: taps || 0,
    installs: installs || 0,
    conversionRate: taps > 0 ? installs / taps : 0,
    relevanceScore: data.relevanceScore || 0,
    targetRank: data.targetRank || 10,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await keywordRef.set(keywordPerformance, { merge: true });

  return { success: true, keywordId };
});

/**
 * Record store performance metrics
 */
export const recordStoreMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, platform, metrics } = data;

  if (!countryCode || !platform || !metrics) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid metrics data');
  }

  const date = new Date().toISOString().split('T')[0];
  const metricsId = `${countryCode}_${platform}_${date}`;

  const storeMetrics: StorePerformanceMetrics = {
    countryCode,
    platform,
    date,
    impressions: metrics.impressions || 0,
    productPageViews: metrics.productPageViews || 0,
    installs: metrics.installs || 0,
    conversionRate: metrics.productPageViews > 0 
      ? metrics.installs / metrics.productPageViews 
      : 0,
    uninstallsDay1: metrics.uninstallsDay1 || 0,
    uninstallRateDay1: metrics.installs > 0 
      ? metrics.uninstallsDay1 / metrics.installs 
      : 0,
    uninstallsDay7: metrics.uninstallsDay7 || 0,
    uninstallRateDay7: metrics.installs > 0 
      ? metrics.uninstallsDay7 / metrics.installs 
      : 0,
    avgRating: metrics.avgRating || 0,
    totalReviews: metrics.totalReviews || 0,
    positiveReviewRatio: metrics.totalReviews > 0 
      ? (metrics.positiveReviews || 0) / metrics.totalReviews 
      : 0,
    organicInstalls: metrics.organicInstalls || 0,
    paidInstalls: metrics.paidInstalls || 0,
    timestamp: admin.firestore.Timestamp.now(),
  };

  await db.collection('store_performance_metrics').doc(metricsId).set(storeMetrics, { merge: true });

  return { success: true, metricsId };
});

/**
 * Get ASO performance dashboard data
 */
export const getASODashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, platform } = data;

  // Get active tests
  let testsQuery = db.collection('aso_ab_tests').where('status', '==', 'running');
  if (countryCode) testsQuery = testsQuery.where('countryCode', '==', countryCode);
  if (platform) testsQuery = testsQuery.where('platform', '==', platform);
  const testsSnapshot = await testsQuery.get();

  // Get keyword performance
  let keywordsQuery = db.collection('keyword_performance');
  if (countryCode) keywordsQuery = keywordsQuery.where('countryCode', '==', countryCode);
  if (platform) keywordsQuery = keywordsQuery.where('platform', '==', platform);
  const keywordsSnapshot = await keywordsQuery.orderBy('currentRank', 'asc').limit(50).get();

  // Get recent store metrics
  const metricsQuery = db.collection('store_performance_metrics')
    .orderBy('timestamp', 'desc')
    .limit(30);
  const metricsSnapshot = await metricsQuery.get();

  return {
    activeTests: testsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    keywords: keywordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    metrics: metricsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
});

/**
 * Analyze ASO performance and suggest optimizations
 */
export const analyzeASOPerformance = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  // Get all active tests
  const testsSnapshot = await db.collection('aso_ab_tests')
    .where('status', '==', 'running')
    .get();

  for (const testDoc of testsSnapshot.docs) {
    const test = testDoc.data() as ASOABTest;

    // Check if test has reached target sample size
    if (test.currentSampleSize >= test.targetSampleSize && !test.winnerVariantId) {
      // Find best performing variant
      const bestVariant = test.variants.reduce((best, current) => {
        const bestScore = best.conversionRate * (1 - best.uninstallRateDay1);
        const currentScore = current.conversionRate * (1 - current.uninstallRateDay1);
        return currentScore > bestScore ? current : best;
      });

      // Auto-complete test if confidence is high enough
      if (test.confidenceLevel >= 95) {
        await db.collection('aso_ab_tests').doc(test.testId).update({
          status: 'completed',
          endDate: admin.firestore.Timestamp.now(),
          winnerVariantId: bestVariant.variantId,
          'variants': test.variants.map(v => ({
            ...v,
            isWinner: v.variantId === bestVariant.variantId,
          })),
        });

        // Log recommendation
        await db.collection('aso_recommendations').add({
          testId: test.testId,
          recommendation: `Test completed. Winner: ${bestVariant.variantName}`,
          winnerVariantId: bestVariant.variantId,
          metrics: {
            conversionRate: bestVariant.conversionRate,
            uninstallRateDay1: bestVariant.uninstallRateDay1,
          },
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }
  }

  return null;
});
