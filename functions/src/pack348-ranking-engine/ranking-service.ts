/**
 * PACK 348 — Ranking Service
 * 
 * Main service that orchestrates ranking calculations
 */

import * as admin from 'firebase-admin';
import { RankingCalculator } from './ranking-calculator';
import { RankingConfigResolver } from './config-resolver';
import { ABTestManager } from './ab-test-manager';
import { RankingMetrics, CreatorRankingScore } from './types';

export class RankingService {
  private configResolver: RankingConfigResolver;
  private abTestManager: ABTestManager;

  constructor(private db: admin.firestore.Firestore) {
    this.configResolver = new RankingConfigResolver(db);
    this.abTestManager = new ABTestManager(db);
  }

  /**
   * Calculate and store ranking score for a creator
   */
  async calculateCreatorRanking(
    userId: string,
    metrics: RankingMetrics,
    countryCode: string,
    tier: 'royal' | 'vip' | 'standard'
  ): Promise<CreatorRankingScore> {
    // Get base configuration
    let config = await this.configResolver.getConfig(countryCode);
    const safetyConfig = await this.configResolver.getSafetyConfig();
    const tierConfig = await this.configResolver.getTierConfig();

    // Check for A/B test enrollment
    const abTest = await this.configResolver.getABTestConfig(userId);
    let abTestGroup: string | undefined;

    if (abTest.testId && abTest.config) {
      config = this.configResolver.applyABTest(config, abTest.config);
      abTestGroup = abTest.testId;
    }

    // Create calculator
    const calculator = new RankingCalculator(config, safetyConfig, tierConfig);

    // Calculate scores
    const score = calculator.calculateCreatorScore(
      userId,
      metrics,
      countryCode,
      tier,
      abTestGroup
    );

    // Store score in Firestore
    await this.db
      .collection('userRankingScores')
      .doc(userId)
      .set(score);

    return score;
  }

  /**
   * Get ranked creators for discovery
   */
  async getRankedCreatorsForDiscovery(
    countryCode: string,
    limit: number = 50
  ): Promise<CreatorRankingScore[]> {
    const snapshot = await this.db
      .collection('userRankingScores')
      .where('countryCode', '==', countryCode)
      .orderBy('finalDiscoveryScore', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CreatorRankingScore);
  }

  /**
   * Get ranked feed items
   */
  async getRankedFeedItems(
    userId: string,
    limit: number = 50
  ): Promise<CreatorRankingScore[]> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const countryCode = userDoc.data()?.countryCode || 'US';

    const snapshot = await this.db
      .collection('userRankingScores')
      .where('countryCode', '==', countryCode)
      .orderBy('finalFeedScore', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CreatorRankingScore);
  }

  /**
   * Get ranked AI companions
   */
  async getRankedAICompanions(
    countryCode: string,
    limit: number = 20
  ): Promise<CreatorRankingScore[]> {
    const snapshot = await this.db
      .collection('userRankingScores')
      .where('countryCode', '==', countryCode)
      .orderBy('finalAiScore', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CreatorRankingScore);
  }

  /**
   * Recalculate all rankings (batch job)
   */
  async recalculateAllRankings(): Promise<{
    processed: number;
    errors: number;
  }> {
    const usersSnapshot = await this.db
      .collection('users')
      .where('isCreator', '==', true)
      .get();

    let processed = 0;
    let errors = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Gather metrics (simplified - would need full implementation)
        const metrics: RankingMetrics = {
          activityCount: userData.activityCount || 0,
          averageRating: userData.averageRating || 0,
          totalEarnings: userData.totalEarnings || 0,
          refundCount: userData.refundCount || 0,
          mismatchCount: userData.mismatchCount || 0,
          totalTransactions: userData.totalTransactions || 0,
        };

        await this.calculateCreatorRanking(
          userId,
          metrics,
          userData.countryCode || 'US',
          userData.tier || 'standard'
        );

        processed++;
      } catch (error) {
        console.error(`Error calculating ranking for user ${userDoc.id}:`, error);
        errors++;
      }
    }

    return { processed, errors };
  }

  /**
   * Get config resolver (for admin operations)
   */
  getConfigResolver(): RankingConfigResolver {
    return this.configResolver;
  }

  /**
   * Get A/B test manager (for admin operations)
   */
  getABTestManager(): ABTestManager {
    return this.abTestManager;
  }
}
