/**
 * PACK 437 - Post-Launch Hardening & Revenue Protection Core
 * Fraud-to-Revenue Correlation Engine
 * 
 * Connections:
 * - fraud signals (324B)
 * - performance creator (324C)
 * - payout behavior (289, 303)
 * 
 * Flags "toxic revenue" (revenue likely to be reversed)
 */

import { firestore } from '../firebase';
import { logger } from '../utils/logger';
import { FraudSignalDetector } from '../pack324b-fraud-signals/FraudSignalDetector';
import { PerformanceCreatorAnalytics } from '../pack324c-performance/PerformanceCreatorAnalytics';

export interface FraudRevenueCorrelation {
  userId: string;
  userType: 'consumer' | 'creator';
  correlationScore: number; // 0-100, higher = more correlated to fraud
  fraudSignals: {
    type: string;
    severity: number;
    detectedAt: Date;
  }[];
  revenueMetrics: {
    totalRevenue: number;
    avgTransactionSize: number;
    transactionCount: number;
    reversalRate: number;
  };
  toxicRevenueAmount: number;
  toxicRevenuePercentage: number;
  riskFactors: string[];
  calculatedAt: Date;
}

export interface CreatorPayoutRisk {
  creatorId: string;
  pendingPayoutAmount: number;
  riskScore: number;
  fraudSignalCount: number;
  chargebackLikelihood: number;
  recommendedAction: 'approve' | 'hold' | 'deny' | 'manual_review';
  riskFactors: string[];
}

export class FraudRevenueCorrelationModel {
  private static instance: FraudRevenueCorrelationModel;
  private fraudDetector: FraudSignalDetector;
  private performanceAnalytics: PerformanceCreatorAnalytics;

  private constructor() {
    this.fraudDetector = FraudSignalDetector.getInstance();
    this.performanceAnalytics = PerformanceCreatorAnalytics.getInstance();
  }

  public static getInstance(): FraudRevenueCorrelationModel {
    if (!FraudRevenueCorrelationModel.instance) {
      FraudRevenueCorrelationModel.instance = new FraudRevenueCorrelationModel();
    }
    return FraudRevenueCorrelationModel.instance;
  }

  /**
   * Analyze correlation between fraud signals and revenue for a user
   */
  public async analyzeFraudRevenueCorrelation(userId: string): Promise<FraudRevenueCorrelation> {
    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error(`User ${userId} not found`);
      }

      const userData = userDoc.data();
      const userType = userData?.accountType || 'consumer';

      // Get fraud signals
      const fraudSignals = await this.getFraudSignals(userId);

      // Get revenue metrics
      const revenueMetrics = await this.getRevenueMetrics(userId);

      // Calculate correlation score
      const correlationScore = this.calculateCorrelationScore(fraudSignals, revenueMetrics);

      // Calculate toxic revenue
      const { toxicAmount, toxicPercentage } = this.calculateToxicRevenue(
        fraudSignals,
        revenueMetrics
      );

      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(fraudSignals, revenueMetrics);

      const correlation: FraudRevenueCorrelation = {
        userId,
        userType,
        correlationScore,
        fraudSignals: fraudSignals.map(signal => ({
          type: signal.type,
          severity: signal.severity,
          detectedAt: signal.detectedAt
        })),
        revenueMetrics,
        toxicRevenueAmount: toxicAmount,
        toxicRevenuePercentage: toxicPercentage,
        riskFactors,
        calculatedAt: new Date()
      };

      // Store correlation
      await firestore
        .collection('fraudRevenueCorrelations')
        .doc(userId)
        .set(correlation, { merge: true });

      return correlation;
    } catch (error) {
      logger.error(`Error analyzing fraud-revenue correlation for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze creator payout risk
   */
  public async analyzeCreatorPayoutRisk(creatorId: string): Promise<CreatorPayoutRisk> {
    try {
      // Get pending payout amount
      const pendingPayoutAmount = await this.getPendingPayoutAmount(creatorId);

      // Get fraud signals for creator
      const fraudSignals = await this.getFraudSignals(creatorId);

      // Get creator performance metrics
      const performanceMetrics = await this.performanceAnalytics.getCreatorMetrics(creatorId);

      // Calculate chargeback likelihood based on content performance
      const chargebackLikelihood = await this.calculateChargebackLikelihood(
        creatorId,
        performanceMetrics
      );

      // Calculate risk score
      const riskScore = this.calculatePayoutRiskScore({
        fraudSignalCount: fraudSignals.length,
        chargebackLikelihood,
        pendingPayoutAmount,
        performanceMetrics
      });

      // Determine recommended action
      const recommendedAction = this.determinePayoutAction(riskScore, pendingPayoutAmount);

      // Identify risk factors
      const riskFactors = this.identifyPayoutRiskFactors({
        fraudSignals,
        chargebackLikelihood,
        performanceMetrics
      });

      const payoutRisk: CreatorPayoutRisk = {
        creatorId,
        pendingPayoutAmount,
        riskScore,
        fraudSignalCount: fraudSignals.length,
        chargebackLikelihood,
        recommendedAction,
        riskFactors
      };

      // Store payout risk assessment
      await firestore
        .collection('creatorPayoutRisks')
        .doc(creatorId)
        .set(payoutRisk, { merge: true });

      return payoutRisk;
    } catch (error) {
      logger.error(`Error analyzing payout risk for creator ${creatorId}:`, error);
      throw error;
    }
  }

  /**
   * Get fraud signals for user
   */
  private async getFraudSignals(userId: string): Promise<any[]> {
    const signalsSnapshot = await firestore
      .collection('fraudSignals')
      .where('userId', '==', userId)
      .where('detectedAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // Last 90 days
      .get();

    return signalsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  /**
   * Get revenue metrics for user
   */
  private async getRevenueMetrics(userId: string): Promise<{
    totalRevenue: number;
    avgTransactionSize: number;
    transactionCount: number;
    reversalRate: number;
  }> {
    const transactionsSnapshot = await firestore
      .collection('transactions')
      .where('userId', '==', userId)
      .where('createdAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .get();

    let totalRevenue = 0;
    let transactionCount = transactionsSnapshot.size;

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      totalRevenue += data.amount || 0;
    });

    const avgTransactionSize = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    // Get reversals (chargebacks + refunds)
    const [chargebacks, refunds] = await Promise.all([
      firestore
        .collection('chargebacks')
        .where('userId', '==', userId)
        .where('createdAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
        .get(),
      firestore
        .collection('refunds')
        .where('userId', '==', userId)
        .where('createdAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
        .get()
    ]);

    const reversalCount = chargebacks.size + refunds.size;
    const reversalRate = transactionCount > 0 ? reversalCount / transactionCount : 0;

    return {
      totalRevenue,
      avgTransactionSize,
      transactionCount,
      reversalRate
    };
  }

  /**
   * Calculate correlation score between fraud and revenue
   */
  private calculateCorrelationScore(
    fraudSignals: any[],
    revenueMetrics: any
  ): number {
    let score = 0;

    // High fraud signal count correlates with risk
    if (fraudSignals.length > 0) {
      score += Math.min(fraudSignals.length * 10, 40);
    }

    // High reversal rate is strongly correlated
    score += revenueMetrics.reversalRate * 100 * 0.4;

    // Unusual transaction patterns
    if (revenueMetrics.avgTransactionSize > 500) {
      score += 10; // Large transactions can indicate fraud
    }

    // Multiple high-severity fraud signals
    const highSeveritySignals = fraudSignals.filter(s => s.severity >= 8);
    if (highSeveritySignals.length > 2) {
      score += 20;
    }

    return Math.min(Math.round(score), 100);
  }

  /**
   * Calculate toxic revenue (likely to be reversed)
   */
  private calculateToxicRevenue(
    fraudSignals: any[],
    revenueMetrics: any
  ): { toxicAmount: number; toxicPercentage: number } {
    let toxicAmount = 0;

    // If reversal rate is high, consider proportional revenue as toxic
    const reversalMultiplier = Math.min(revenueMetrics.reversalRate * 2, 1);
    toxicAmount += revenueMetrics.totalRevenue * reversalMultiplier;

    // If user has multiple high-severity fraud signals
    const highSeveritySignals = fraudSignals.filter(s => s.severity >= 8);
    if (highSeveritySignals.length >= 3) {
      toxicAmount = revenueMetrics.totalRevenue * 0.8; // 80% likely toxic
    } else if (highSeveritySignals.length >= 2) {
      toxicAmount = revenueMetrics.totalRevenue * 0.5; // 50% likely toxic
    }

    const toxicPercentage = revenueMetrics.totalRevenue > 0
      ? (toxicAmount / revenueMetrics.totalRevenue) * 100
      : 0;

    return { toxicAmount, toxicPercentage };
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(fraudSignals: any[], revenueMetrics: any): string[] {
    const factors: string[] = [];

    if (fraudSignals.length >= 5) {
      factors.push('Multiple fraud signals detected');
    }

    if (revenueMetrics.reversalRate > 0.1) {
      factors.push('High reversal rate (>10%)');
    }

    if (revenueMetrics.avgTransactionSize > 500) {
      factors.push('Unusually large transactions');
    }

    const highSeveritySignals = fraudSignals.filter(s => s.severity >= 8);
    if (highSeveritySignals.length > 0) {
      factors.push(`${highSeveritySignals.length} high-severity fraud signals`);
    }

    if (revenueMetrics.transactionCount > 50) {
      factors.push('High transaction volume');
    }

    return factors;
  }

  /**
   * Get pending payout amount for creator
   */
  private async getPendingPayoutAmount(creatorId: string): Promise<number> {
    const payoutsSnapshot = await firestore
      .collection('payouts')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'pending')
      .get();

    let totalPending = 0;
    payoutsSnapshot.forEach(doc => {
      const data = doc.data();
      totalPending += data.amount || 0;
    });

    return totalPending;
  }

  /**
   * Calculate chargeback likelihood based on content performance
   */
  private async calculateChargebackLikelihood(
    creatorId: string,
    performanceMetrics: any
  ): Promise<number> {
    // Get historical chargeback rate for creator's content
    const contentTransactionsSnapshot = await firestore
      .collection('contentPurchases')
      .where('creatorId', '==', creatorId)
      .where('createdAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .get();

    const chargebacksSnapshot = await firestore
      .collection('chargebacks')
      .where('creatorId', '==', creatorId)
      .where('createdAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .get();

    const historicalRate = contentTransactionsSnapshot.size > 0
      ? chargebacksSnapshot.size / contentTransactionsSnapshot.size
      : 0;

    // Factor in content quality scores (from PACK 324C)
    const qualityMultiplier = performanceMetrics?.contentQualityScore || 50;
    const adjustedLikelihood = historicalRate * (1 + (50 - qualityMultiplier) / 100);

    return Math.min(adjustedLikelihood, 1.0);
  }

  /**
   * Calculate payout risk score
   */
  private calculatePayoutRiskScore(params: {
    fraudSignalCount: number;
    chargebackLikelihood: number;
    pendingPayoutAmount: number;
    performanceMetrics: any;
  }): number {
    let score = 0;

    // Fraud signals contribute to risk
    score += Math.min(params.fraudSignalCount * 8, 40);

    // Chargeback likelihood
    score += params.chargebackLikelihood * 100 * 0.3;

    // Large payout amounts increase risk impact
    if (params.pendingPayoutAmount > 10000) {
      score += 15;
    } else if (params.pendingPayoutAmount > 5000) {
      score += 10;
    }

    // Low performance scores increase risk
    if (params.performanceMetrics?.contentQualityScore < 30) {
      score += 15;
    }

    return Math.min(Math.round(score), 100);
  }

  /**
   * Determine payout action based on risk score
   */
  private determinePayoutAction(
    riskScore: number,
    amount: number
  ): 'approve' | 'hold' | 'deny' | 'manual_review' {
    if (riskScore < 25) {
      return 'approve';
    } else if (riskScore < 50) {
      return amount > 5000 ? 'manual_review' : 'approve';
    } else if (riskScore < 75) {
      return 'hold';
    } else {
      return amount > 10000 ? 'deny' : 'manual_review';
    }
  }

  /**
   * Identify payout risk factors
   */
  private identifyPayoutRiskFactors(params: {
    fraudSignals: any[];
    chargebackLikelihood: number;
    performanceMetrics: any;
  }): string[] {
    const factors: string[] = [];

    if (params.fraudSignals.length >= 3) {
      factors.push(`${params.fraudSignals.length} fraud signals detected`);
    }

    if (params.chargebackLikelihood > 0.05) {
      factors.push(`High chargeback likelihood (${(params.chargebackLikelihood * 100).toFixed(1)}%)`);
    }

    if (params.performanceMetrics?.contentQualityScore < 30) {
      factors.push('Low content quality score');
    }

    if (params.performanceMetrics?.userComplaintRate > 0.1) {
      factors.push('High user complaint rate');
    }

    return factors;
  }

  /**
   * Batch analyze fraud-revenue correlations
   */
  public async batchAnalyzeCorrelations(userIds: string[]): Promise<FraudRevenueCorrelation[]> {
    const results: FraudRevenueCorrelation[] = [];

    for (const userId of userIds) {
      try {
        const correlation = await this.analyzeFraudRevenueCorrelation(userId);
        results.push(correlation);
      } catch (error) {
        logger.error(`Error analyzing correlation for user ${userId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get aggregated toxic revenue metrics
   */
  public async getAggregatedToxicRevenueMetrics(): Promise<{
    totalToxicRevenue: number;
    totalRevenue: number;
    toxicRevenuePercentage: number;
    affectedUserCount: number;
  }> {
    const correlationsSnapshot = await firestore
      .collection('fraudRevenueCorrelations')
      .get();

    let totalToxicRevenue = 0;
    let totalRevenue = 0;
    let affectedUserCount = 0;

    correlationsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.toxicRevenueAmount > 0) {
        totalToxicRevenue += data.toxicRevenueAmount;
        affectedUserCount++;
      }
      totalRevenue += data.revenueMetrics.totalRevenue;
    });

    const toxicRevenuePercentage = totalRevenue > 0
      ? (totalToxicRevenue / totalRevenue) * 100
      : 0;

    return {
      totalToxicRevenue,
      totalRevenue,
      toxicRevenuePercentage,
      affectedUserCount
    };
  }
}
