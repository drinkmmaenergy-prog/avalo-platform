/**
 * PACK 437 - Post-Launch Hardening & Revenue Protection Core
 * Retention vs. Monetization Conflict Resolver
 * 
 * Detects when:
 * - aggressive monetization increases churn
 * 
 * Auto-adjusts:
 * - paywalls
 * - free windows
 * - pricing elasticity bands
 */

import { firestore } from '../firebase';
import { logger } from '../utils/logger';
import { MetricsCollector } from '../pack299-analytics/MetricsCollector';

export interface MonetizationStrategy {
  id: string;
  name: string;
  paywallConfig: {
    enabled: boolean;
    triggerAfterMinutes: number;
    priceTier: 'low' | 'medium' | 'high';
    freeContentPercentage: number;
  };
  subscriptionPricing: {
    monthlyPrice: number;
    yearlyPrice: number;
    trialDays: number;
  };
  creatorTakeRate: number; // Percentage creator keeps
  effectiveDate: Date;
}

export interface RetentionImpactAnalysis {
  strategyId: string;
  churnRate: number;
  churnIncrease: number; // Compared to baseline
  revenueImpact: number;
  userFeedbackScore: number;
  engagementScore: number;
  isHealthy: boolean;
  recommendedAdjustments: string[];
  calculatedAt: Date;
}

export interface BalancedStrategy {
  currentStrategy: MonetizationStrategy;
  proposedStrategy: MonetizationStrategy;
  expectedChurnChange: number;
  expectedRevenueChange: number;
  confidence: number;
  adjustmentReason: string;
}

export class RetentionMonetizationBalancer {
  private static instance: RetentionMonetizationBalancer;
  private metricsCollector: MetricsCollector;
  
  // Balance thresholds
  private readonly MAX_CHURN_INCREASE = 0.05; // 5% max churn increase acceptable
  private readonly MIN_REVENUE_THRESHOLD = 0.95; // 95% revenue retention minimum
  private readonly ENGAGEMENT_THRESHOLD = 60; // Minimum engagement score

  private constructor() {
    this.metricsCollector = MetricsCollector.getInstance();
  }

  public static getInstance(): RetentionMonetizationBalancer {
    if (!RetentionMonetizationBalancer.instance) {
      RetentionMonetizationBalancer.instance = new RetentionMonetizationBalancer();
    }
    return RetentionMonetizationBalancer.instance;
  }

  /**
   * Analyze retention impact of current monetization strategy
   */
  public async analyzeRetentionImpact(strategyId: string): Promise<RetentionImpactAnalysis> {
    try {
      // Get strategy
      const strategyDoc = await firestore
        .collection('monetizationStrategies')
        .doc(strategyId)
        .get();

      if (!strategyDoc.exists) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      const strategy = strategyDoc.data() as MonetizationStrategy;

      // Calculate metrics
      const churnRate = await this.calculateChurnRate(strategy.effectiveDate);
      const baselineChurnRate = await this.getBaselineChurnRate();
      const churnIncrease = churnRate - baselineChurnRate;

      const revenueImpact = await this.calculateRevenueImpact(strategy);
      const userFeedbackScore = await this.getUserFeedbackScore(strategy.effectiveDate);
      const engagementScore = await this.getEngagementScore(strategy.effectiveDate);

      // Determine if strategy is healthy
      const isHealthy = this.determineStrategyHealth({
        churnIncrease,
        revenueImpact,
        userFeedbackScore,
        engagementScore
      });

      // Get recommendations
      const recommendedAdjustments = this.generateAdjustmentRecommendations({
        churnIncrease,
        revenueImpact,
        userFeedbackScore,
        engagementScore,
        strategy
      });

      const analysis: RetentionImpactAnalysis = {
        strategyId,
        churnRate,
        churnIncrease,
        revenueImpact,
        userFeedbackScore,
        engagementScore,
        isHealthy,
        recommendedAdjustments,
        calculatedAt: new Date()
      };

      // Store analysis
      await firestore
        .collection('retentionImpactAnalyses')
        .doc(strategyId)
        .set(analysis, { merge: true });

      return analysis;
    } catch (error) {
      logger.error(`Error analyzing retention impact for strategy ${strategyId}:`, error);
      throw error;
    }
  }

  /**
   * Auto-adjust monetization strategy to balance retention and revenue
   */
  public async autoAdjustStrategy(currentStrategyId: string): Promise<BalancedStrategy> {
    try {
      logger.info(`Auto-adjusting strategy ${currentStrategyId}...`);

      // Get current strategy
      const currentStrategyDoc = await firestore
        .collection('monetizationStrategies')
        .doc(currentStrategyId)
        .get();

      if (!currentStrategyDoc.exists) {
        throw new Error(`Strategy ${currentStrategyId} not found`);
      }

      const currentStrategy = currentStrategyDoc.data() as MonetizationStrategy;

      // Analyze current impact
      const impact = await this.analyzeRetentionImpact(currentStrategyId);

      if (impact.isHealthy) {
        logger.info('Current strategy is healthy, no adjustment needed');
        return {
          currentStrategy,
          proposedStrategy: currentStrategy,
          expectedChurnChange: 0,
          expectedRevenueChange: 0,
          confidence: 1.0,
          adjustmentReason: 'Strategy is healthy'
        };
      }

      // Generate optimized strategy
      const proposedStrategy = this.generateOptimizedStrategy(currentStrategy, impact);

      // Calculate expected impact
      const { expectedChurnChange, expectedRevenueChange, confidence } = 
        await this.predictStrategyImpact(proposedStrategy);

      const balancedStrategy: BalancedStrategy = {
        currentStrategy,
        proposedStrategy,
        expectedChurnChange,
        expectedRevenueChange,
        confidence,
        adjustmentReason: this.getAdjustmentReason(impact)
      };

      // Auto-apply if confidence is high and changes are moderate
      if (confidence > 0.8 && Math.abs(expectedRevenueChange) < 0.15) {
        await this.applyStrategy(proposedStrategy);
        logger.info('Strategy auto-adjusted successfully');
      } else {
        logger.info('Strategy adjustment requires manual approval');
      }

      return balancedStrategy;
    } catch (error) {
      logger.error(`Error auto-adjusting strategy ${currentStrategyId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate current churn rate
   */
  private async calculateChurnRate(since: Date): Promise<number> {
    const sinceTimestamp = since.getTime();
    const nowTimestamp = Date.now();
    const daysElapsed = (nowTimestamp - sinceTimestamp) / (24 * 60 * 60 * 1000);

    if (daysElapsed < 7) {
      since = new Date(nowTimestamp - 7 * 24 * 60 * 60 * 1000); // At least 7 days
    }

    const [cancellations, activeUsers] = await Promise.all([
      firestore
        .collection('subscriptions')
        .where('status', '==', 'cancelled')
        .where('updatedAt', '>', since)
        .get(),
      firestore
        .collection('users')
        .where('status', '==', 'active')
        .where('hasSubscription', '==', true)
        .get()
    ]);

    return activeUsers.size > 0 ? cancellations.size / activeUsers.size : 0;
  }

  /**
   * Get baseline churn rate (before current strategy)
   */
  private async getBaselineChurnRate(): Promise<number> {
    // Get churn rate from 30-60 days ago
    const baselineEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const baselineStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const cancellations = await firestore
      .collection('subscriptions')
      .where('status', '==', 'cancelled')
      .where('updatedAt', '>', baselineStart)
      .where('updatedAt', '<=', baselineEnd)
      .get();

    const activeUsers = await firestore
      .collection('users')
      .where('status', '==', 'active')
      .where('hasSubscription', '==', true)
      .get();

    return activeUsers.size > 0 ? cancellations.size / activeUsers.size : 0;
  }

  /**
   * Calculate revenue impact
   */
  private async calculateRevenueImpact(strategy: MonetizationStrategy): Promise<number> {
    const since = strategy.effectiveDate;
    const baselineEnd = new Date(since.getTime() - 1);
    const baselineStart = new Date(since.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [currentRevenue, baselineRevenue] = await Promise.all([
      this.getRevenue(since, new Date()),
      this.getRevenue(baselineStart, baselineEnd)
    ]);

    const daysElapsed = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
    const normalizedCurrentRevenue = daysElapsed > 0 ? (currentRevenue / daysElapsed) * 30 : 0;
    const normalizedBaselineRevenue = baselineRevenue / 30;

    return normalizedBaselineRevenue > 0
      ? (normalizedCurrentRevenue - normalizedBaselineRevenue) / normalizedBaselineRevenue
      : 0;
  }

  /**
   * Get revenue for time period
   */
  private async getRevenue(start: Date, end: Date): Promise<number> {
    const transactionsSnapshot = await firestore
      .collection('transactions')
      .where('createdAt', '>', start)
      .where('createdAt', '<=', end)
      .get();

    let totalRevenue = 0;
    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      totalRevenue += data.amount || 0;
    });

    return totalRevenue;
  }

  /**
   * Get user feedback score
   */
  private async getUserFeedbackScore(since: Date): Promise<number> {
    const feedbackSnapshot = await firestore
      .collection('userFeedback')
      .where('createdAt', '>', since)
      .where('category', '==', 'pricing')
      .get();

    if (feedbackSnapshot.size === 0) return 50; // Neutral default

    let totalScore = 0;
    feedbackSnapshot.forEach(doc => {
      const data = doc.data();
      totalScore += data.rating || 0;
    });

    return (totalScore / feedbackSnapshot.size) * 20; // Convert 1-5 to 0-100
  }

  /**
   * Get engagement score
   */
  private async getEngagementScore(since: Date): Promise<number> {
    const engagementMetrics = await firestore
      .collection('engagementMetrics')
      .where('date', '>', since)
      .get();

    if (engagementMetrics.size === 0) return 50; // Default

    let totalScore = 0;
    engagementMetrics.forEach(doc => {
      const data = doc.data();
      totalScore += data.score || 0;
    });

    return totalScore / engagementMetrics.size;
  }

  /**
   * Determine if strategy is healthy
   */
  private determineStrategyHealth(params: {
    churnIncrease: number;
    revenueImpact: number;
    userFeedbackScore: number;
    engagementScore: number;
  }): boolean {
    return (
      params.churnIncrease <= this.MAX_CHURN_INCREASE &&
      params.revenueImpact >= -0.05 && // Max 5% revenue decrease
      params.userFeedbackScore >= 40 &&
      params.engagementScore >= this.ENGAGEMENT_THRESHOLD
    );
  }

  /**
   * Generate adjustment recommendations
   */
  private generateAdjustmentRecommendations(params: {
    churnIncrease: number;
    revenueImpact: number;
    userFeedbackScore: number;
    engagementScore: number;
    strategy: MonetizationStrategy;
  }): string[] {
    const recommendations: string[] = [];

    if (params.churnIncrease > this.MAX_CHURN_INCREASE) {
      recommendations.push('Reduce price tier or increase free content');
      if (params.strategy.paywallConfig.freeContentPercentage < 30) {
        recommendations.push('Increase free content percentage to 30%');
      }
    }

    if (params.revenueImpact < -0.10) {
      recommendations.push('Revenue declined significantly, consider reverting to previous strategy');
    }

    if (params.userFeedbackScore < 40) {
      recommendations.push('Low user satisfaction with pricing, consider discount campaign');
    }

    if (params.engagementScore < this.ENGAGEMENT_THRESHOLD) {
      recommendations.push('Engagement is low, reduce paywall trigger time');
      recommendations.push('Consider adding more free preview content');
    }

    if (params.strategy.subscriptionPricing.trialDays < 7) {
      recommendations.push('Extend trial period to 7+ days to improve conversion');
    }

    return recommendations;
  }

  /**
   * Generate optimized strategy
   */
  private generateOptimizedStrategy(
    current: MonetizationStrategy,
    impact: RetentionImpactAnalysis
  ): MonetizationStrategy {
    const optimized: MonetizationStrategy = JSON.parse(JSON.stringify(current));
    optimized.id = `${current.id}_optimized_${Date.now()}`;
    optimized.name = `${current.name} (Auto-Optimized)`;
    optimized.effectiveDate = new Date();

    // Adjust based on impact
    if (impact.churnIncrease > this.MAX_CHURN_INCREASE) {
      // Reduce monetization pressure
      optimized.paywallConfig.freeContentPercentage = Math.min(
        current.paywallConfig.freeContentPercentage + 10,
        50
      );
      optimized.paywallConfig.triggerAfterMinutes = Math.min(
        current.paywallConfig.triggerAfterMinutes + 5,
        30
      );
    }

    if (impact.engagementScore < this.ENGAGEMENT_THRESHOLD) {
      // Increase engagement incentives
      optimized.subscriptionPricing.trialDays = Math.max(7, current.subscriptionPricing.trialDays);
      optimized.paywallConfig.freeContentPercentage = Math.min(
        current.paywallConfig.freeContentPercentage + 5,
        40
      );
    }

    if (impact.userFeedbackScore < 40) {
      // Reduce prices slightly
      optimized.subscriptionPricing.monthlyPrice *= 0.9;
      optimized.subscriptionPricing.yearlyPrice *= 0.9;
    }

    return optimized;
  }

  /**
   * Predict impact of proposed strategy
   */
  private async predictStrategyImpact(strategy: MonetizationStrategy): Promise<{
    expectedChurnChange: number;
    expectedRevenueChange: number;
    confidence: number;
  }> {
    // Simplified prediction model
    // In production, this would use machine learning

    let expectedChurnChange = 0;
    let expectedRevenueChange = 0;

    // If increasing free content, expect churn reduction
    const currentStrategy = await this.getCurrentStrategy();
    const freeContentDiff = strategy.paywallConfig.freeContentPercentage - 
                            currentStrategy.paywallConfig.freeContentPercentage;
    
    expectedChurnChange = -freeContentDiff * 0.002; // -0.2% churn per 1% free content increase

    // Price changes affect revenue
    const priceChange = (strategy.subscriptionPricing.monthlyPrice - 
                        currentStrategy.subscriptionPricing.monthlyPrice) / 
                       currentStrategy.subscriptionPricing.monthlyPrice;
    
    expectedRevenueChange = priceChange * 0.7; // 70% pass-through (accounting for elasticity)

    const confidence = 0.75; // Default confidence

    return { expectedChurnChange, expectedRevenueChange, confidence };
  }

  /**
   * Get current active strategy
   */
  private async getCurrentStrategy(): Promise<MonetizationStrategy> {
    const strategiesSnapshot = await firestore
      .collection('monetizationStrategies')
      .where('active', '==', true)
      .limit(1)
      .get();

    if (strategiesSnapshot.empty) {
      throw new Error('No active strategy found');
    }

    return strategiesSnapshot.docs[0].data() as MonetizationStrategy;
  }

  /**
   * Apply new strategy
   */
  private async applyStrategy(strategy: MonetizationStrategy): Promise<void> {
    // Deactivate current strategy
    const currentStrategy = await this.getCurrentStrategy();
    await firestore
      .collection('monetizationStrategies')
      .doc(currentStrategy.id)
      .update({ active: false });

    // Activate new strategy
    await firestore
      .collection('monetizationStrategies')
      .doc(strategy.id)
      .set({ ...strategy, active: true });

    logger.info(`Applied new monetization strategy: ${strategy.id}`);
  }

  /**
   * Get adjustment reason
   */
  private getAdjustmentReason(impact: RetentionImpactAnalysis): string {
    const reasons: string[] = [];

    if (impact.churnIncrease > this.MAX_CHURN_INCREASE) {
      reasons.push('High churn rate');
    }

    if (impact.revenueImpact < -0.10) {
      reasons.push('Revenue decline');
    }

    if (impact.userFeedbackScore < 40) {
      reasons.push('Low user satisfaction');
    }

    if (impact.engagementScore < this.ENGAGEMENT_THRESHOLD) {
      reasons.push('Low engagement');
    }

    return reasons.join(', ') || 'Optimization opportunity detected';
  }
}
