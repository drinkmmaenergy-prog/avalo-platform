/**
 * PACK 437 - Post-Launch Hardening & Revenue Protection Core
 * Executive Revenue Dashboard (Read-Only)
 * 
 * Real-time board-level KPIs:
 * - Net revenue (after risk)
 * - Fraud-adjusted LTV
 * - Regional risk exposure
 * 
 * No admin actions (actions come in 438+)
 */

import { firestore } from '../firebase';
import { logger } from '../utils/logger';
import { RevenueRiskScoringService } from './RevenueRiskScoringService';
import { FraudRevenueCorrelationModel } from './FraudRevenueCorrelationModel';

export interface ExecutiveDashboardMetrics {
  // Revenue Metrics
  totalRevenue: number;
  netRevenue: number; // After chargebacks and refunds
  riskAdjustedRevenue: number; // After accounting for toxic revenue
  revenueGrowthRate: number; // Month-over-month
  
  // Risk Metrics
  totalChargebackAmount: number;
  chargebackRate: number;
  totalRefundAmount: number;
  refundRate: number;
  toxicRevenueAmount: number;
  toxicRevenuePercentage: number;
  
  // User Metrics
  totalActiveUsers: number;
  highRiskUserCount: number;
  highRiskUserPercentage: number;
  avgRevenuePerUser: number;
  
  // Fraud Metrics
  fraudSignalCount: number;
  fraudAffectedUserCount: number;
  estimatedFraudLoss: number;
  
  // LTV Metrics
  avgCustomerLTV: number;
  fraudAdjustedLTV: number;
  ltvAdjustmentPercentage: number;
  
  // Regional Metrics
  regionalRiskExposure: {
    region: string;
    revenue: number;
    riskScore: number;
    chargebackRate: number;
  }[];
  
  // Churn Metrics
  churnRate: number;
  churnTrend: 'increasing' | 'stable' | 'decreasing';
  
  // Guardrail Status
  activeGuardrailTriggers: number;
  criticalAlerts: number;
  
  lastUpdated: Date;
}

export interface RevenueHealthScore {
  overall: number; // 0-100
  revenueQuality: number;
  fraudRisk: number;
  churnRisk: number;
  regionalRisk: number;
  trend: 'improving' | 'stable' | 'declining';
  criticalIssues: string[];
}

export class ExecutiveRevenueDashboard {
  private static instance: ExecutiveRevenueDashboard;
  private riskScoringService: RevenueRiskScoringService;
  private fraudCorrelationModel: FraudRevenueCorrelationModel;
  
  private constructor() {
    this.riskScoringService = RevenueRiskScoringService.getInstance();
    this.fraudCorrelationModel = FraudRevenueCorrelationModel.getInstance();
  }

  public static getInstance(): ExecutiveRevenueDashboard {
    if (!ExecutiveRevenueDashboard.instance) {
      ExecutiveRevenueDashboard.instance = new ExecutiveRevenueDashboard();
    }
    return ExecutiveRevenueDashboard.instance;
  }

  /**
   * Get comprehensive executive dashboard metrics
   */
  public async getDashboardMetrics(): Promise<ExecutiveDashboardMetrics> {
    try {
      logger.info('Generating executive dashboard metrics...');

      const [
        revenueMetrics,
        riskMetrics,
        userMetrics,
        fraudMetrics,
        ltvMetrics,
        regionalMetrics,
        churnMetrics,
        guardrailStatus
      ] = await Promise.all([
        this.getRevenueMetrics(),
        this.getRiskMetrics(),
        this.getUserMetrics(),
        this.getFraudMetrics(),
        this.getLTVMetrics(),
        this.getRegionalMetrics(),
        this.getChurnMetrics(),
        this.getGuardrailStatus()
      ]);

      const metrics: ExecutiveDashboardMetrics = {
        ...revenueMetrics,
        ...riskMetrics,
        ...userMetrics,
        ...fraudMetrics,
        ...ltvMetrics,
        regionalRiskExposure: regionalMetrics,
        ...churnMetrics,
        ...guardrailStatus,
        lastUpdated: new Date()
      };

      // Cache metrics for quick retrieval
      await firestore
        .collection('executiveDashboard')
        .doc('currentMetrics')
        .set(metrics);

      return metrics;
    } catch (error) {
      logger.error('Error generating dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate revenue health score
   */
  public async calculateRevenueHealthScore(): Promise<RevenueHealthScore> {
    try {
      const metrics = await this.getDashboardMetrics();

      // Calculate component scores (0-100)
      const revenueQuality = this.calculateRevenueQualityScore(metrics);
      const fraudRisk = 100 - (metrics.toxicRevenuePercentage * 100);
      const churnRisk = 100 - (metrics.churnRate * 100);
      const regionalRisk = this.calculateRegionalRiskScore(metrics.regionalRiskExposure);

      // Overall score (weighted average)
      const overall = Math.round(
        revenueQuality * 0.3 +
        fraudRisk * 0.3 +
        churnRisk * 0.25 +
        regionalRisk * 0.15
      );

      // Determine trend
      const trend = await this.determineHealthTrend();

      // Identify critical issues
      const criticalIssues = this.identifyCriticalIssues(metrics);

      const healthScore: RevenueHealthScore = {
        overall,
        revenueQuality,
        fraudRisk,
        churnRisk,
        regionalRisk,
        trend,
        criticalIssues
      };

      // Store health score
      await firestore
        .collection('executiveDashboard')
        .doc('healthScore')
        .set(healthScore);

      return healthScore;
    } catch (error) {
      logger.error('Error calculating revenue health score:', error);
      throw error;
    }
  }

  /**
   * Get revenue metrics
   */
  private async getRevenueMetrics(): Promise<{
    totalRevenue: number;
    netRevenue: number;
    riskAdjustedRevenue: number;
    revenueGrowthRate: number;
  }> {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

    // Current month revenue
    const currentMonthTransactions = await firestore
      .collection('transactions')
      .where('createdAt', '>', thirtyDaysAgo)
      .where('status', '==', 'completed')
      .get();

    let totalRevenue = 0;
    currentMonthTransactions.forEach(doc => {
      totalRevenue += doc.data().amount || 0;
    });

    // Previous month revenue for growth rate
    const previousMonthTransactions = await firestore
      .collection('transactions')
      .where('createdAt', '>', sixtyDaysAgo)
      .where('createdAt', '<=', thirtyDaysAgo)
      .where('status', '==', 'completed')
      .get();

    let previousRevenue = 0;
    previousMonthTransactions.forEach(doc => {
      previousRevenue += doc.data().amount || 0;
    });

    const revenueGrowthRate = previousRevenue > 0
      ? (totalRevenue - previousRevenue) / previousRevenue
      : 0;

    // Calculate net revenue (after chargebacks and refunds)
    const [chargebacks, refunds] = await Promise.all([
      firestore
        .collection('chargebacks')
        .where('createdAt', '>', thirtyDaysAgo)
        .get(),
      firestore
        .collection('refunds')
        .where('createdAt', '>', thirtyDaysAgo)
        .get()
    ]);

    let chargebackAmount = 0;
    chargebacks.forEach(doc => chargebackAmount += doc.data().amount || 0);

    let refundAmount = 0;
    refunds.forEach(doc => refundAmount += doc.data().amount || 0);

    const netRevenue = totalRevenue - chargebackAmount - refundAmount;

    // Get toxic revenue amount
    const toxicMetrics = await this.fraudCorrelationModel.getAggregatedToxicRevenueMetrics();
    const riskAdjustedRevenue = netRevenue - toxicMetrics.totalToxicRevenue;

    return {
      totalRevenue,
      netRevenue,
      riskAdjustedRevenue,
      revenueGrowthRate
    };
  }

  /**
   * Get risk metrics
   */
  private async getRiskMetrics(): Promise<{
    totalChargebackAmount: number;
    chargebackRate: number;
    totalRefundAmount: number;
    refundRate: number;
    toxicRevenueAmount: number;
    toxicRevenuePercentage: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [chargebacks, refunds, transactions] = await Promise.all([
      firestore
        .collection('chargebacks')
        .where('createdAt', '>', thirtyDaysAgo)
        .get(),
      firestore
        .collection('refunds')
        .where('createdAt', '>', thirtyDaysAgo)
        .get(),
      firestore
        .collection('transactions')
        .where('createdAt', '>', thirtyDaysAgo)
        .where('status', '==', 'completed')
        .get()
    ]);

    let totalChargebackAmount = 0;
    chargebacks.forEach(doc => totalChargebackAmount += doc.data().amount || 0);

    let totalRefundAmount = 0;
    refunds.forEach(doc => totalRefundAmount += doc.data().amount || 0);

    const chargebackRate = transactions.size > 0 ? chargebacks.size / transactions.size : 0;
    const refundRate = transactions.size > 0 ? refunds.size / transactions.size : 0;

    const toxicMetrics = await this.fraudCorrelationModel.getAggregatedToxicRevenueMetrics();

    return {
      totalChargebackAmount,
      chargebackRate,
      totalRefundAmount,
      refundRate,
      toxicRevenueAmount: toxicMetrics.totalToxicRevenue,
      toxicRevenuePercentage: toxicMetrics.toxicRevenuePercentage
    };
  }

  /**
   * Get user metrics
   */
  private async getUserMetrics(): Promise<{
    totalActiveUsers: number;
    highRiskUserCount: number;
    highRiskUserPercentage: number;
    avgRevenuePerUser: number;
  }> {
    const [activeUsers, highRiskUsers] = await Promise.all([
      firestore
        .collection('users')
        .where('status', '==', 'active')
        .get(),
      firestore
        .collection('revenueRiskScores')
        .where('riskLevel', 'in', ['high', 'critical'])
        .get()
    ]);

    const totalActiveUsers = activeUsers.size;
    const highRiskUserCount = highRiskUsers.size;
    const highRiskUserPercentage = totalActiveUsers > 0 ? highRiskUserCount / totalActiveUsers : 0;

    // Calculate avg revenue per user
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const transactions = await firestore
      .collection('transactions')
      .where('createdAt', '>', thirtyDaysAgo)
      .where('status', '==', 'completed')
      .get();

    let totalRevenue = 0;
    transactions.forEach(doc => totalRevenue += doc.data().amount || 0);

    const avgRevenuePerUser = totalActiveUsers > 0 ? totalRevenue / totalActiveUsers : 0;

    return {
      totalActiveUsers,
      highRiskUserCount,
      highRiskUserPercentage,
      avgRevenuePerUser
    };
  }

  /**
   * Get fraud metrics
   */
  private async getFraudMetrics(): Promise<{
    fraudSignalCount: number;
    fraudAffectedUserCount: number;
    estimatedFraudLoss: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const fraudSignals = await firestore
      .collection('fraudSignals')
      .where('detectedAt', '>', thirtyDaysAgo)
      .get();

    const uniqueUsers = new Set();
    let estimatedFraudLoss = 0;

    fraudSignals.forEach(doc => {
      const data = doc.data();
      uniqueUsers.add(data.userId);
      estimatedFraudLoss += data.estimatedLoss || 0;
    });

    return {
      fraudSignalCount: fraudSignals.size,
      fraudAffectedUserCount: uniqueUsers.size,
      estimatedFraudLoss
    };
  }

  /**
   * Get LTV metrics
   */
  private async getLTVMetrics(): Promise<{
    avgCustomerLTV: number;
    fraudAdjustedLTV: number;
    ltvAdjustmentPercentage: number;
  }> {
    // Simplified LTV calculation
    const avgRevenuePerUser = (await this.getUserMetrics()).avgRevenuePerUser;
    const avgCustomerLifetimeDays = 365; // Assume 1 year average
    const avgCustomerLTV = avgRevenuePerUser * 12; // 12 months

    // Adjust for fraud
    const riskMetrics = await this.getRiskMetrics();
    const fraudMultiplier = 1 - (riskMetrics.toxicRevenuePercentage / 100);
    const fraudAdjustedLTV = avgCustomerLTV * fraudMultiplier;

    const ltvAdjustmentPercentage = avgCustomerLTV > 0
      ? ((avgCustomerLTV - fraudAdjustedLTV) / avgCustomerLTV) * 100
      : 0;

    return {
      avgCustomerLTV,
      fraudAdjustedLTV,
      ltvAdjustmentPercentage
    };
  }

  /**
   * Get regional metrics
   */
  private async getRegionalMetrics(): Promise<{
    region: string;
    revenue: number;
    riskScore: number;
    chargebackRate: number;
  }[]> {
    const regions = ['US', 'EU', 'ASIA', 'LATAM', 'OTHER'];
    const regionalMetrics = [];

    for (const region of regions) {
      try {
        const regionProfile = await this.riskScoringService.calculateRegionRiskProfile(region);
        regionalMetrics.push({
          region,
          revenue: regionProfile.totalRevenue,
          riskScore: regionProfile.avgRiskScore,
          chargebackRate: regionProfile.chargebackRate
        });
      } catch (error) {
        logger.error(`Error getting metrics for region ${region}:`, error);
      }
    }

    return regionalMetrics;
  }

  /**
   * Get churn metrics
   */
  private async getChurnMetrics(): Promise<{
    churnRate: number;
    churnTrend: 'increasing' | 'stable' | 'decreasing';
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [currentCancellations, previousCancellations, activeUsers] = await Promise.all([
      firestore
        .collection('subscriptions')
        .where('status', '==', 'cancelled')
        .where('updatedAt', '>', thirtyDaysAgo)
        .get(),
      firestore
        .collection('subscriptions')
        .where('status', '==', 'cancelled')
        .where('updatedAt', '>', sixtyDaysAgo)
        .where('updatedAt', '<=', thirtyDaysAgo)
        .get(),
      firestore
        .collection('users')
        .where('status', '==', 'active')
        .where('hasSubscription', '==', true)
        .get()
    ]);

    const currentChurnRate = activeUsers.size > 0 ? currentCancellations.size / activeUsers.size : 0;
    const previousChurnRate = activeUsers.size > 0 ? previousCancellations.size / activeUsers.size : 0;

    let churnTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (currentChurnRate > previousChurnRate * 1.1) {
      churnTrend = 'increasing';
    } else if (currentChurnRate < previousChurnRate * 0.9) {
      churnTrend = 'decreasing';
    }

    return {
      churnRate: currentChurnRate,
      churnTrend
    };
  }

  /**
   * Get guardrail status
   */
  private async getGuardrailStatus(): Promise<{
    activeGuardrailTriggers: number;
    criticalAlerts: number;
  }> {
    const [activeTriggers, criticalAlerts] = await Promise.all([
      firestore
        .collection('guardrailTriggers')
        .where('status', '==', 'active')
        .get(),
      firestore
        .collection('systemAlerts')
        .where('severity', '==', 'critical')
        .where('status', '==', 'open')
        .get()
    ]);

    return {
      activeGuardrailTriggers: activeTriggers.size,
      criticalAlerts: criticalAlerts.size
    };
  }

  /**
   * Calculate revenue quality score
   */
  private calculateRevenueQualityScore(metrics: ExecutiveDashboardMetrics): number {
    let score = 100;

    // Deduct for chargebacks
    score -= metrics.chargebackRate * 100 * 2; // 2x weight

    // Deduct for refunds
    score -= metrics.refundRate * 100;

    // Deduct for toxic revenue
    score -= metrics.toxicRevenuePercentage * 0.5;

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate regional risk score
   */
  private calculateRegionalRiskScore(regionalData: any[]): number {
    if (regionalData.length === 0) return 50;

    let totalRiskScore = 0;
    regionalData.forEach(region => {
      totalRiskScore += 100 - region.riskScore; // Invert so high risk = low score
    });

    return Math.round(totalRiskScore / regionalData.length);
  }

  /**
   * Determine health trend
   */
  private async determineHealthTrend(): Promise<'improving' | 'stable' | 'declining'> {
    // Get health scores for last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const historicalScores = await firestore
      .collection('executiveDashboard')
      .doc('healthScoreHistory')
      .get();

    if (!historicalScores.exists) {
      return 'stable';
    }

    const history = historicalScores.data()?.scores || [];
    if (history.length < 2) {
      return 'stable';
    }

    const recent = history.slice(-3);
    const avgRecent = recent.reduce((sum: number, s: any) => sum + s.overall, 0) / recent.length;
    
    const older = history.slice(-7, -3);
    const avgOlder = older.length > 0
      ? older.reduce((sum: number, s: any) => sum + s.overall, 0) / older.length
      : avgRecent;

    if (avgRecent > avgOlder * 1.05) return 'improving';
    if (avgRecent < avgOlder * 0.95) return 'declining';
    return 'stable';
  }

  /**
   * Identify critical issues
   */
  private identifyCriticalIssues(metrics: ExecutiveDashboardMetrics): string[] {
    const issues: string[] = [];

    if (metrics.chargebackRate > 0.02) {
      issues.push(`High chargeback rate: ${(metrics.chargebackRate * 100).toFixed(2)}%`);
    }

    if (metrics.toxicRevenuePercentage > 15) {
      issues.push(`High toxic revenue: ${metrics.toxicRevenuePercentage.toFixed(1)}%`);
    }

    if (metrics.churnRate > 0.15) {
      issues.push(`High churn rate: ${(metrics.churnRate * 100).toFixed(1)}%`);
    }

    if (metrics.highRiskUserPercentage > 0.20) {
      issues.push(`${(metrics.highRiskUserPercentage * 100).toFixed(1)}% of users are high-risk`);
    }

    if (metrics.criticalAlerts > 0) {
      issues.push(`${metrics.criticalAlerts} critical alerts active`);
    }

    return issues;
  }

  /**
   * Start automated dashboard updates
   */
  public startAutomatedUpdates(): void {
    // Update dashboard every 15 minutes
    setInterval(async () => {
      try {
        await this.getDashboardMetrics();
        await this.calculateRevenueHealthScore();
      } catch (error) {
        logger.error('Error in automated dashboard update:', error);
      }
    }, 15 * 60 * 1000);

    logger.info('Automated dashboard updates started');
  }
}
