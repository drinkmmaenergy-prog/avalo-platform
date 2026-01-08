/**
 * PACK 424 — ASO (App Store Optimization) Engine
 * Track rankings, conversions, and A/B tests
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { ASOMetrics } from './pack424-store-reviews.types';

const db = admin.firestore();

export class ASOService {
  /**
   * Track keyword rankings
   */
  async trackKeywordRankings(
    country: string,
    keywords: string[]
  ): Promise<void> {
    try {
      const rankings: Array<{
        keyword: string;
        rank: number;
        previousRank?: number;
        searchVolume?: number;
      }> = [];

      for (const keyword of keywords) {
        // In production, integrate with App Store Search API or third-party service
        // For now, store placeholders that can be updated manually or via API
        
        // Get previous ranking
        const prev = await db
          .collection('asoKeywordRankings')
          .where('country', '==', country)
          .where('keyword', '==', keyword)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        const previousRank = !prev.empty ? prev.docs[0].data().rank : undefined;

        // Mock ranking data (replace with actual API calls)
        const rank = Math.floor(Math.random() * 100) + 1;

        rankings.push({
          keyword,
          rank,
          previousRank,
          searchVolume: undefined, // From third-party ASO tools
        });

        // Store individual ranking record
        await db.collection('asoKeywordRankings').add({
          country,
          keyword,
          rank,
          previousRank,
          timestamp: Date.now(),
        });
      }

      functions.logger.info('Tracked keyword rankings', {
        country,
        keywordCount: keywords.length,
      });
    } catch (error) {
      functions.logger.error('Error tracking keyword rankings:', error);
      throw error;
    }
  }

  /**
   * Track conversion metrics
   */
  async trackConversionMetrics(
    country: string,
    data: {
      storeVisits: number;
      installs: number;
      firstLaunches: number;
    }
  ): Promise<void> {
    try {
      const conversionRate = data.storeVisits > 0
        ? data.installs / data.storeVisits
        : 0;

      const metrics: Partial<ASOMetrics> = {
        timestamp: Date.now(),
        country,
        storeVisits: data.storeVisits,
        installs: data.installs,
        firstLaunches: data.firstLaunches,
        conversionRate,
        keywords: [], // Will be populated separately
      };

      await db.collection('asoMetrics').add(metrics);

      functions.logger.info('Tracked conversion metrics', {
        country,
        conversionRate: `${(conversionRate * 100).toFixed(2)}%`,
      });
    } catch (error) {
      functions.logger.error('Error tracking conversion metrics:', error);
      throw error;
    }
  }

  /**
   * Create A/B test for store assets
   */
  async createABTest(data: {
    name: string;
    type: 'icon' | 'screenshots' | 'video' | 'description';
    variants: Array<{
      id: string;
      name: string;
      assetUrl?: string;
      description?: string;
    }>;
    countries: string[];
    trafficAllocation: Record<string, number>; // variant ID -> percentage
  }): Promise<string> {
    try {
      const testDoc = await db.collection('asoABTests').add({
        ...data,
        status: 'active',
        createdAt: Date.now(),
        results: {},
      });

      functions.logger.info('Created A/B test', {
        testId: testDoc.id,
        name: data.name,
        type: data.type,
      });

      return testDoc.id;
    } catch (error) {
      functions.logger.error('Error creating A/B test:', error);
      throw error;
    }
  }

  /**
   * Track A/B test impression
   */
  async trackABTestImpression(
    testId: string,
    variantId: string,
    userId?: string
  ): Promise<void> {
    try {
      await db.collection('asoABTestImpressions').add({
        testId,
        variantId,
        userId,
        timestamp: Date.now(),
      });

      // Update test results
      const testRef = db.collection('asoABTests').doc(testId);
      await testRef.update({
        [`results.${variantId}.impressions`]: admin.firestore.FieldValue.increment(1),
      });
    } catch (error) {
      functions.logger.error('Error tracking A/B test impression:', error);
    }
  }

  /**
   * Track A/B test conversion
   */
  async trackABTestConversion(
    testId: string,
    variantId: string,
    userId: string
  ): Promise<void> {
    try {
      await db.collection('asoABTestConversions').add({
        testId,
        variantId,
        userId,
        timestamp: Date.now(),
      });

      // Update test results
      const testRef = db.collection('asoABTests').doc(testId);
      await testRef.update({
        [`results.${variantId}.conversions`]: admin.firestore.FieldValue.increment(1),
      });
    } catch (error) {
      functions.logger.error('Error tracking A/B test conversion:', error);
    }
  }

  /**
   * Get A/B test results
   */
  async getABTestResults(testId: string): Promise<any> {
    try {
      const testDoc = await db.collection('asoABTests').doc(testId).get();
      
      if (!testDoc.exists) {
        throw new Error('Test not found');
      }

      const test = testDoc.data();
      const results = test?.results || {};

      // Calculate conversion rates for each variant
      const variantStats = Object.keys(results).map(variantId => {
        const impressions = results[variantId]?.impressions || 0;
        const conversions = results[variantId]?.conversions || 0;
        const conversionRate = impressions > 0 ? conversions / impressions : 0;

        return {
          variantId,
          impressions,
          conversions,
          conversionRate,
        };
      });

      // Find winner (highest conversion rate with statistical significance)
      const sortedVariants = variantStats.sort(
        (a, b) => b.conversionRate - a.conversionRate
      );

      return {
        testId,
        name: test?.name,
        type: test?.type,
        status: test?.status,
        variants: variantStats,
        winner: sortedVariants[0]?.variantId,
        winnerConversionRate: sortedVariants[0]?.conversionRate,
      };
    } catch (error) {
      functions.logger.error('Error getting A/B test results:', error);
      throw error;
    }
  }

  /**
   * End A/B test and declare winner
   */
  async endABTest(testId: string): Promise<void> {
    try {
      const results = await this.getABTestResults(testId);

      await db.collection('asoABTests').doc(testId).update({
        status: 'completed',
        completedAt: Date.now(),
        winner: results.winner,
      });

      functions.logger.info('Ended A/B test', {
        testId,
        winner: results.winner,
        conversionRate: results.winnerConversionRate,
      });
    } catch (error) {
      functions.logger.error('Error ending A/B test:', error);
      throw error;
    }
  }

  /**
   * Get ASO performance summary
   */
  async getASOPerformance(
    country: string,
    days: number = 30
  ): Promise<{
    avgConversionRate: number;
    totalInstalls: number;
    totalStoreVisits: number;
    topKeywords: Array<{ keyword: string; rank: number }>;
    activeTests: number;
  }> {
    try {
      const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

      // Get metrics
      const metricsSnapshot = await db
        .collection('asoMetrics')
        .where('country', '==', country)
        .where('timestamp', '>=', startTime)
        .get();

      let totalInstalls = 0;
      let totalStoreVisits = 0;
      let totalConversionRate = 0;

      metricsSnapshot.forEach(doc => {
        const data = doc.data();
        totalInstalls += data.installs || 0;
        totalStoreVisits += data.storeVisits || 0;
        totalConversionRate += data.conversionRate || 0;
      });

      const avgConversionRate = metricsSnapshot.size > 0
        ? totalConversionRate / metricsSnapshot.size
        : 0;

      // Get top keywords
      const keywordsSnapshot = await db
        .collection('asoKeywordRankings')
        .where('country', '==', country)
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      const latestKeywords = new Map<string, number>();
      keywordsSnapshot.forEach(doc => {
        const data = doc.data();
        if (!latestKeywords.has(data.keyword)) {
          latestKeywords.set(data.keyword, data.rank);
        }
      });

      const topKeywords = Array.from(latestKeywords.entries())
        .map(([keyword, rank]) => ({ keyword, rank }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 10);

      // Count active tests
      const activeTestsSnapshot = await db
        .collection('asoABTests')
        .where('status', '==', 'active')
        .where('countries', 'array-contains', country)
        .get();

      return {
        avgConversionRate,
        totalInstalls,
        totalStoreVisits,
        topKeywords,
        activeTests: activeTestsSnapshot.size,
      };
    } catch (error) {
      functions.logger.error('Error getting ASO performance:', error);
      throw error;
    }
  }
}

export const asoService = new ASOService();

/**
 * Scheduled function: Track keyword rankings daily
 */
export const dailyKeywordTracking = functions.pubsub
  .schedule('0 4 * * *') // Daily at 4 AM UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting daily keyword tracking');

    const keywords = [
      'dating app',
      'relationship',
      'match',
      'chat',
      'video call',
      'social network',
      'meet people',
      'friends',
    ];

    const countries = ['us', 'gb', 'ca', 'au', 'de', 'fr'];

    try {
      for (const country of countries) {
        await asoService.trackKeywordRankings(country, keywords);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
      }

      return { success: true };
    } catch (error) {
      functions.logger.error('Error in daily keyword tracking:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint: Get ASO metrics
 */
export const getASOMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can view ASO metrics'
    );
  }

  try {
    const country = data.country || 'us';
    const days = data.days || 30;

    const performance = await asoService.getASOPerformance(country, days);

    return {
      success: true,
      country,
      days,
      ...performance,
    };
  } catch (error) {
    functions.logger.error('Error getting ASO metrics:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get ASO metrics');
  }
});
