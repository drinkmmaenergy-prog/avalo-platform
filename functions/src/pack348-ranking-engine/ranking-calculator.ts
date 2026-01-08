/**
 * PACK 348 — Ranking Calculator
 * 
 * Core algorithm engine for calculating creator scores across all surfaces
 */

import {
  RankingEngineConfig,
  RankingMetrics,
  CreatorRankingScore,
  SafetyPenaltyConfig,
  TierRoutingConfig,
} from './types';

export class RankingCalculator {
  constructor(
    private config: RankingEngineConfig,
    private safetyConfig: SafetyPenaltyConfig,
    private tierConfig: TierRoutingConfig
  ) {}

  /**
   * Calculate comprehensive ranking scores for a creator
   */
  calculateCreatorScore(
    userId: string,
    metrics: RankingMetrics,
    countryCode: string,
    tier: 'royal' | 'vip' | 'standard',
    abTestGroup?: string
  ): CreatorRankingScore {
    // Calculate base scores (0-100 scale)
    const discoveryScore = this.calculateDiscoveryScore(metrics);
    const feedScore = this.calculateFeedScore(metrics);
    const swipeScore = this.calculateSwipeScore(metrics);
    const aiScore = this.calculateAiScore(metrics);

    // Calculate safety penalties
    const safetyPenalties = this.calculateSafetyPenalties(metrics);

    // Apply tier-specific routing
    const tierAdjustments = this.applyTierRouting(tier, {
      discoveryScore,
      feedScore,
      swipeScore,
      aiScore,
    });

    // Apply safety penalties
    const finalDiscoveryScore = tierAdjustments.discoveryScore * safetyPenalties.totalPenalty;
    const finalFeedScore = tierAdjustments.feedScore * safetyPenalties.totalPenalty;
    const finalSwipeScore = tierAdjustments.swipeScore * safetyPenalties.totalPenalty;
    const finalAiScore = tierAdjustments.aiScore * safetyPenalties.totalPenalty;

    return {
      userId,
      discoveryScore,
      feedScore,
      swipeScore,
      aiScore,
      safetyPenalties,
      finalDiscoveryScore,
      finalFeedScore,
      finalSwipeScore,
      finalAiScore,
      calculatedAt: Date.now(),
      countryCode,
      tierOverride: tier,
      abTestGroup,
    };
  }

  /**
   * Calculate Discovery ranking score
   */
  private calculateDiscoveryScore(metrics: RankingMetrics): number {
    const { discovery } = this.config;

    // Normalize distance (closer = higher score, max 100km)
    const distanceScore = metrics.distance
      ? Math.max(0, 100 - (metrics.distance / 100) * 100)
      : 50; // Default if no distance

    // Activity score (normalize to 0-100, cap at 100 activities)
    const activityScore = Math.min(100, (metrics.activityCount / 100) * 100);

    // Rating score (0-5 stars → 0-100)
    const ratingScore = (metrics.averageRating / 5) * 100;

    // Earnings score (normalize to 0-100, cap at $10,000)
    const earningsScore = Math.min(100, (metrics.totalEarnings / 10000) * 100);

    // Refund penalty (inverse)
    const refundScore =
      metrics.refundCount > 0
        ? Math.max(0, 100 - metrics.refundCount * 10)
        : 100;

    // Mismatch penalty (inverse)
    const mismatchScore =
      metrics.mismatchCount > 0
        ? Math.max(0, 100 - metrics.mismatchCount * 15)
        : 100;

    // Weighted sum
    const totalScore =
      distanceScore * discovery.distanceWeight +
      activityScore * discovery.activityWeight +
      ratingScore * discovery.ratingWeight +
      earningsScore * discovery.earningsWeight +
      refundScore * discovery.refundPenaltyWeight +
      mismatchScore * discovery.mismatchPenaltyWeight;

    return Math.max(0, Math.min(100, totalScore));
  }

  /**
   * Calculate Feed ranking score
   */
  private calculateFeedScore(metrics: RankingMetrics): number {
    const { feed } = this.config;

    // Recency score (normalize to 0-100, recent = higher)
    // Assume recency is in minutes, max 1440 (24 hours)
    const recencyScore = metrics.recency
      ? Math.max(0, 100 - (metrics.recency / 1440) * 100)
      : 0;

    // Engagement score (likes, comments, etc.)
    const engagementScore = metrics.engagementCount
      ? Math.min(100, (metrics.engagementCount / 100) * 100)
      : 0;

    // Viral score (shares)
    const viralScore = metrics.shareCount
      ? Math.min(100, (metrics.shareCount / 50) * 100)
      : 0;

    // Boost score
    const boostScore = metrics.boostActive ? 100 : 0;

    // Weighted sum
    const totalScore =
      recencyScore * feed.recencyWeight +
      engagementScore * feed.engagementWeight +
      viralScore * feed.viralWeight +
      boostScore * feed.boostWeight;

    return Math.max(0, Math.min(100, totalScore));
  }

  /**
   * Calculate Swipe ranking score
   */
  private calculateSwipeScore(metrics: RankingMetrics): number {
    const { swipe } = this.config;

    // Attractiveness score (assume 0-100)
    const attractivenessScore = metrics.attractivenessScore || 50;

    // Response time score (faster = better, normalize to 0-100)
    // Assume response time in minutes, max 60 minutes
    const responseTimeScore = metrics.averageResponseTime
      ? Math.max(0, 100 - (metrics.averageResponseTime / 60) * 100)
      : 50;

    // Activity score
    const activityScore = Math.min(100, (metrics.activityCount / 100) * 100);

    // Report penalty (inverse)
    const reportScore =
      metrics.reportCount && metrics.reportCount > 0
        ? Math.max(0, 100 - metrics.reportCount * 20)
        : 100;

    // Weighted sum
    const totalScore =
      attractivenessScore * swipe.attractivenessWeight +
      responseTimeScore * swipe.responseTimeWeight +
      activityScore * swipe.activityWeight +
      reportScore * swipe.reportPenaltyWeight;

    return Math.max(0, Math.min(100, totalScore));
  }

  /**
   * Calculate AI companion ranking score
   */
  private calculateAiScore(metrics: RankingMetrics): number {
    const { ai } = this.config;

    // Rating score (0-5 stars → 0-100)
    const ratingScore = (metrics.averageRating / 5) * 100;

    // Voice usage score (normalize to 0-100, cap at 100 calls)
    const voiceScore = metrics.voiceCallCount
      ? Math.min(100, (metrics.voiceCallCount / 100) * 100)
      : 0;

    // Chat usage score (normalize to 0-100, cap at 1000 messages)
    const chatScore = metrics.chatMessageCount
      ? Math.min(100, (metrics.chatMessageCount / 1000) * 100)
      : 0;

    // Abuse penalty (inverse)
    const abuseScore =
      metrics.abuseReportCount && metrics.abuseReportCount > 0
        ? Math.max(0, 100 - metrics.abuseReportCount * 25)
        : 100;

    // Weighted sum
    const totalScore =
      ratingScore * ai.ratingWeight +
      voiceScore * ai.voiceUsageWeight +
      chatScore * ai.chatUsageWeight +
      abuseScore * ai.abusePenaltyWeight;

    return Math.max(0, Math.min(100, totalScore));
  }

  /**
   * Calculate safety penalties based on user behavior
   */
  private calculateSafetyPenalties(metrics: RankingMetrics): CreatorRankingScore['safetyPenalties'] {
    const penalties = {
      refundPenalty: 1.0,
      mismatchPenalty: 1.0,
      panicPenalty: 1.0,
      blockingPenalty: 1.0,
      reportPenalty: 1.0,
      totalPenalty: 1.0,
    };

    // Refund ratio penalty
    if (metrics.totalTransactions && metrics.totalTransactions > 0) {
      const refundRatio = metrics.refundCount / metrics.totalTransactions;
      if (refundRatio >= this.safetyConfig.refundRatioThreshold) {
        penalties.refundPenalty = 1.0 - this.safetyConfig.refundRatioPenalty;
      }
    }

    // Mismatch rate penalty
    if (metrics.totalTransactions && metrics.totalTransactions > 0) {
      const mismatchRate = metrics.mismatchCount / metrics.totalTransactions;
      if (mismatchRate >= this.safetyConfig.mismatchRateThreshold) {
        penalties.mismatchPenalty = 1.0 - this.safetyConfig.mismatchRatePenalty;
      }
    }

    // Report frequency penalty
    if (metrics.reportCount && metrics.reportCount >= this.safetyConfig.reportFrequencyThreshold) {
      penalties.reportPenalty = 1.0 - this.safetyConfig.reportFrequencyPenalty;
    }

    // Calculate total penalty (multiplicative)
    penalties.totalPenalty =
      penalties.refundPenalty *
      penalties.mismatchPenalty *
      penalties.panicPenalty *
      penalties.blockingPenalty *
      penalties.reportPenalty;

    // Apply auto-suppression if enabled and penalties are severe
    if (this.safetyConfig.enableAutoSuppression && penalties.totalPenalty < 0.5) {
      penalties.totalPenalty = Math.min(penalties.totalPenalty, 0.3);
    }

    return penalties;
  }

  /**
   * Apply tier-specific routing logic
   */
  private applyTierRouting(
    tier: 'royal' | 'vip' | 'standard',
    scores: {
      discoveryScore: number;
      feedScore: number;
      swipeScore: number;
      aiScore: number;
    }
  ): typeof scores {
    const adjusted = { ...scores };

    switch (tier) {
      case 'royal':
        // Royal: No free discovery boost
        if (!this.tierConfig.royal.discoveryPriority) {
          // Keep discovery score as-is (merit-based)
        }
        // No AI search priority
        if (!this.tierConfig.royal.aiSearchPriority) {
          // Keep AI score as-is (merit-based)
        }
        break;

      case 'vip':
        // VIP: No free discovery boost
        if (!this.tierConfig.vip.discoveryPriority) {
          // Keep discovery score as-is (merit-based)
        }
        // No AI search priority
        if (!this.tierConfig.vip.aiSearchPriority) {
          // Keep AI score as-is (merit-based)
        }
        break;

      case 'standard':
        // Standard: Pure meritocracy, no artificial boosts
        if (this.tierConfig.standard.noArtificialBoost) {
          // All scores remain merit-based
        }
        break;
    }

    return adjusted;
  }

  /**
   * Apply decay for inactivity
   */
  applyDecay(score: number, daysInactive: number): number {
    const decayFactor = Math.pow(
      1 - this.config.decay.inactivityDecayPerDay,
      daysInactive
    );
    return score * decayFactor;
  }
}
