/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Module: Model Risk Scoring Engine
 * 
 * Assesses AI models for bias, drift, false positives, and revenue impact.
 * Provides continuous monitoring and automatic alerting.
 */

import { logger } from 'firebase-functions';
import { RiskLevel } from './AIModelRegistry';

export enum RiskCategory {
  BIAS = 'BIAS',
  DRIFT = 'DRIFT',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  FALSE_NEGATIVE = 'FALSE_NEGATIVE',
  REVENUE_IMPACT = 'REVENUE_IMPACT',
  PERFORMANCE_DEGRADATION = 'PERFORMANCE_DEGRADATION',
  LATENCY = 'LATENCY',
  AVAILABILITY = 'AVAILABILITY'
}

export interface RiskMetric {
  category: RiskCategory;
  value: number;              // 0-100 score
  threshold: number;          // Alert threshold
  status: 'OK' | 'WARNING' | 'CRITICAL';
  lastMeasured: Date;
  trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  details?: string;
}

export interface BiasAssessment {
  demographicParity?: number;    // 0-1, closer to 1 is better
  equalOpportunity?: number;     // 0-1, closer to 1 is better
  predictiveParity?: number;     // 0-1, closer to 1 is better
  disparateImpact?: number;      // 0-1, closer to 1 is better (0.8 is legal threshold)
  protectedAttributes: string[]; // e.g., ['age', 'gender', 'location']
  biasScore: number;             // 0-100, lower is better
  findings: string[];
}

export interface DriftAssessment {
  dataDrift: number;             // 0-100, measures input distribution change
  conceptDrift: number;          // 0-100, measures relationship change
  predictionDrift: number;       // 0-100, measures output distribution change
  driftScore: number;            // 0-100 combined score
  baseline: Date;                // When baseline was established
  findings: string[];
}

export interface PerformanceAssessment {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  auc?: number;
  falsePositiveRate?: number;
  falseNegativeRate?: number;
  performanceScore: number;      // 0-100
  findings: string[];
}

export interface RevenueImpactAssessment {
  directImpact: number;          // $ amount
  indirectImpact: number;        // $ amount
  userChurn: number;             // % increase in churn
  conversionImpact: number;      // % change in conversion
  impactScore: number;           // 0-100
  findings: string[];
}

export interface ModelRiskScore {
  modelId: string;
  modelVersion: string;
  overallRisk: number;           // 0-100
  riskLevel: RiskLevel;
  metrics: RiskMetric[];
  
  // Detailed Assessments
  biasAssessment?: BiasAssessment;
  driftAssessment?: DriftAssessment;
  performanceAssessment?: PerformanceAssessment;
  revenueImpact?: RevenueImpactAssessment;
  
  // Recommendations
  recommendations: string[];
  requiresAction: boolean;
  actionDeadline?: Date;
  
  assessedAt: Date;
  assessedBy: string;
}

export interface RiskAlert {
  alertId: string;
  modelId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  category: RiskCategory;
  message: string;
  details: Record<string, any>;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

export class ModelRiskScoringEngine {
  private db: FirebaseFirestore.Firestore;
  private readonly RISK_SCORES_COLLECTION = 'ai_model_risk_scores';
  private readonly RISK_ALERTS_COLLECTION = 'ai_risk_alerts';

  // Default thresholds
  private readonly THRESHOLDS = {
    BIAS: 30,                    // Max acceptable bias score
    DRIFT: 40,                   // Max acceptable drift
    FALSE_POSITIVE: 5,           // Max acceptable FP rate (%)
    FALSE_NEGATIVE: 5,           // Max acceptable FN rate (%)
    REVENUE_IMPACT: 5000,        // Max acceptable negative impact ($)
    PERFORMANCE_DEGRADATION: 15, // Max acceptable performance drop (%)
    LATENCY: 2000,               // Max acceptable latency (ms)
    AVAILABILITY: 99.9           // Min acceptable availability (%)
  };

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Assess overall model risk
   */
  async assessModelRisk(
    modelId: string,
    modelVersion: string,
    assessedBy: string
  ): Promise<ModelRiskScore> {
    try {
      logger.info(`[ModelRiskScoring] Assessing risk for ${modelId} v${modelVersion}`);

      // Perform individual assessments
      const biasAssessment = await this.assessBias(modelId);
      const driftAssessment = await this.assessDrift(modelId);
      const performanceAssessment = await this.assessPerformance(modelId);
      const revenueImpact = await this.assessRevenueImpact(modelId);

      // Calculate risk metrics
      const metrics = this.calculateRiskMetrics(
        biasAssessment,
        driftAssessment,
        performanceAssessment,
        revenueImpact
      );

      // Calculate overall risk score (weighted average)
      const overallRisk = this.calculateOverallRisk(metrics);
      const riskLevel = this.getRiskLevel(overallRisk);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        metrics,
        biasAssessment,
        driftAssessment,
        performanceAssessment,
        revenueImpact
      );

      const requiresAction = metrics.some(m => m.status === 'CRITICAL');
      const actionDeadline = requiresAction ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined;

      const riskScore: ModelRiskScore = {
        modelId,
        modelVersion,
        overallRisk,
        riskLevel,
        metrics,
        biasAssessment,
        driftAssessment,
        performanceAssessment,
        revenueImpact,
        recommendations,
        requiresAction,
        actionDeadline,
        assessedAt: new Date(),
        assessedBy
      };

      // Store risk score
      await this.storeRiskScore(riskScore);

      // Trigger alerts if necessary
      await this.checkAndTriggerAlerts(riskScore);

      logger.info(`[ModelRiskScoring] Risk assessment complete for ${modelId}: ${overallRisk}/100 (${riskLevel})`);

      return riskScore;
    } catch (error) {
      logger.error('[ModelRiskScoring] Assessment failed:', error);
      throw error;
    }
  }

  /**
   * Assess model for bias
   */
  private async assessBias(modelId: string): Promise<BiasAssessment> {
    // In production, this would analyze actual prediction data across protected attributes
    // For now, return a structured assessment

    const findings: string[] = [];
    let biasScore = 0;

    // Simulate bias metrics (would be calculated from real data)
    const demographicParity = 0.92;
    const equalOpportunity = 0.88;
    const predictiveParity = 0.85;
    const disparateImpact = 0.82; // Legal threshold is 0.8

    if (disparateImpact < 0.8) {
      findings.push('Disparate impact below legal threshold (0.8)');
      biasScore += 30;
    } else if (disparateImpact < 0.85) {
      findings.push('Disparate impact approaching legal threshold');
      biasScore += 15;
    }

    if (demographicParity < 0.9) {
      findings.push('Demographic parity below target (0.9)');
      biasScore += 10;
    }

    if (equalOpportunity < 0.9) {
      findings.push('Equal opportunity below target (0.9)');
      biasScore += 10;
    }

    if (findings.length === 0) {
      findings.push('No significant bias detected');
    }

    return {
      demographicParity,
      equalOpportunity,
      predictiveParity,
      disparateImpact,
      protectedAttributes: ['age', 'gender', 'location'],
      biasScore,
      findings
    };
  }

  /**
   * Assess model for drift
   */
  private async assessDrift(modelId: string): Promise<DriftAssessment> {
    // In production, this would compare current vs baseline distributions
    const findings: string[] = [];
    
    // Simulate drift metrics
    const dataDrift = 15;        // Low drift in input distribution
    const conceptDrift = 8;      // Very low drift in relationships
    const predictionDrift = 22;  // Moderate drift in predictions

    const driftScore = (dataDrift + conceptDrift + predictionDrift) / 3;

    if (dataDrift > 30) {
      findings.push('Significant data drift detected in input features');
    }
    if (conceptDrift > 25) {
      findings.push('Concept drift detected - model assumptions may be outdated');
    }
    if (predictionDrift > 30) {
      findings.push('Prediction drift exceeds acceptable range');
    }

    if (findings.length === 0) {
      findings.push('Drift within acceptable parameters');
    }

    return {
      dataDrift,
      conceptDrift,
      predictionDrift,
      driftScore,
      baseline: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      findings
    };
  }

  /**
   * Assess model performance
   */
  private async assessPerformance(modelId: string): Promise<PerformanceAssessment> {
    // In production, this would calculate from recent predictions vs ground truth
    const findings: string[] = [];

    // Simulate performance metrics
    const accuracy = 0.94;
    const precision = 0.91;
    const recall = 0.89;
    const f1Score = 0.90;
    const auc = 0.95;
    const falsePositiveRate = 0.04;
    const falseNegativeRate = 0.05;

    // Convert to 0-100 scale
    const performanceScore = (accuracy + precision + recall + f1Score + auc) / 5 * 100;

    if (falsePositiveRate > 0.05) {
      findings.push(`False positive rate (${(falsePositiveRate * 100).toFixed(1)}%) exceeds target`);
    }
    if (falseNegativeRate > 0.05) {
      findings.push(`False negative rate (${(falseNegativeRate * 100).toFixed(1)}%) exceeds target`);
    }
    if (accuracy < 0.9) {
      findings.push(`Accuracy (${(accuracy * 100).toFixed(1)}%) below target (90%)`);
    }

    if (findings.length === 0) {
      findings.push('Model performance meets all targets');
    }

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      auc,
      falsePositiveRate,
      falseNegativeRate,
      performanceScore,
      findings
    };
  }

  /**
   * Assess revenue impact
   */
  private async assessRevenueImpact(modelId: string): Promise<RevenueImpactAssessment> {
    // In production, this would analyze financial metrics
    const findings: string[] = [];

    // Simulate impact metrics
    const directImpact = 2500;      // $2,500 direct impact
    const indirectImpact = 1200;    // $1,200 indirect impact
    const userChurn = 0.8;          // 0.8% increase in churn
    const conversionImpact = -2.1;  // -2.1% conversion impact

    const totalImpact = Math.abs(directImpact) + Math.abs(indirectImpact);
    const impactScore = Math.min(100, (totalImpact / this.THRESHOLDS.REVENUE_IMPACT) * 100);

    if (totalImpact > this.THRESHOLDS.REVENUE_IMPACT) {
      findings.push(`Total revenue impact ($${totalImpact.toLocaleString()}) exceeds threshold`);
    }
    if (userChurn > 1.0) {
      findings.push(`User churn increase (${userChurn.toFixed(1)}%) is concerning`);
    }
    if (conversionImpact < -5) {
      findings.push(`Conversion impact (${conversionImpact.toFixed(1)}%) is significant`);
    }

    if (findings.length === 0) {
      findings.push('Revenue impact within acceptable range');
    }

    return {
      directImpact,
      indirectImpact,
      userChurn,
      conversionImpact,
      impactScore,
      findings
    };
  }

  /**
   * Calculate risk metrics from assessments
   */
  private calculateRiskMetrics(
    bias: BiasAssessment,
    drift: DriftAssessment,
    performance: PerformanceAssessment,
    revenue: RevenueImpactAssessment
  ): RiskMetric[] {
    const now = new Date();
    const metrics: RiskMetric[] = [];

    // Bias metric
    metrics.push({
      category: RiskCategory.BIAS,
      value: bias.biasScore,
      threshold: this.THRESHOLDS.BIAS,
      status: this.getStatus(bias.biasScore, this.THRESHOLDS.BIAS),
      lastMeasured: now,
      trend: 'STABLE',
      details: bias.findings.join('; ')
    });

    // Drift metric
    metrics.push({
      category: RiskCategory.DRIFT,
      value: drift.driftScore,
      threshold: this.THRESHOLDS.DRIFT,
      status: this.getStatus(drift.driftScore, this.THRESHOLDS.DRIFT),
      lastMeasured: now,
      trend: 'STABLE',
      details: drift.findings.join('; ')
    });

    // False positive metric
    if (performance.falsePositiveRate) {
      metrics.push({
        category: RiskCategory.FALSE_POSITIVE,
        value: performance.falsePositiveRate * 100,
        threshold: this.THRESHOLDS.FALSE_POSITIVE,
        status: this.getStatus(performance.falsePositiveRate * 100, this.THRESHOLDS.FALSE_POSITIVE),
        lastMeasured: now,
        trend: 'STABLE'
      });
    }

    // Revenue impact metric
    metrics.push({
      category: RiskCategory.REVENUE_IMPACT,
      value: revenue.impactScore,
      threshold: 30, // 30% of max threshold
      status: this.getStatus(revenue.impactScore, 30),
      lastMeasured: now,
      trend: 'STABLE',
      details: revenue.findings.join('; ')
    });

    return metrics;
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRisk(metrics: RiskMetric[]): number {
    // Weighted average of risk scores
    const weights: Record<RiskCategory, number> = {
      [RiskCategory.BIAS]: 0.25,
      [RiskCategory.DRIFT]: 0.20,
      [RiskCategory.FALSE_POSITIVE]: 0.15,
      [RiskCategory.FALSE_NEGATIVE]: 0.15,
      [RiskCategory.REVENUE_IMPACT]: 0.15,
      [RiskCategory.PERFORMANCE_DEGRADATION]: 0.10,
      [RiskCategory.LATENCY]: 0.05,
      [RiskCategory.AVAILABILITY]: 0.05
    };

    let totalWeight = 0;
    let weightedSum = 0;

    metrics.forEach(metric => {
      const weight = weights[metric.category] || 0.05;
      weightedSum += metric.value * weight;
      totalWeight += weight;
    });

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score >= 75) return RiskLevel.CRITICAL;
    if (score >= 50) return RiskLevel.HIGH;
    if (score >= 25) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  /**
   * Get status from value and threshold
   */
  private getStatus(value: number, threshold: number): 'OK' | 'WARNING' | 'CRITICAL' {
    if (value >= threshold) return 'CRITICAL';
    if (value >= threshold * 0.8) return 'WARNING';
    return 'OK';
  }

  /**
   * Generate recommendations based on assessments
   */
  private generateRecommendations(
    metrics: RiskMetric[],
    bias: BiasAssessment,
    drift: DriftAssessment,
    performance: PerformanceAssessment,
    revenue: RevenueImpactAssessment
  ): string[] {
    const recommendations: string[] = [];

    // Bias recommendations
    if (bias.biasScore > this.THRESHOLDS.BIAS) {
      recommendations.push('CRITICAL: Review and retrain model to address bias');
      if (bias.disparateImpact && bias.disparateImpact < 0.8) {
        recommendations.push('URGENT: Disparate impact below legal threshold - immediate action required');
      }
    } else if (bias.biasScore > this.THRESHOLDS.BIAS * 0.8) {
      recommendations.push('Monitor bias metrics closely and prepare mitigation strategies');
    }

    // Drift recommendations
    if (drift.driftScore > this.THRESHOLDS.DRIFT) {
      recommendations.push('Significant drift detected - consider model retraining with recent data');
    }
    if (drift.conceptDrift > 30) {
      recommendations.push('Concept drift detected - review model assumptions and features');
    }

    // Performance recommendations
    if (performance.accuracy && performance.accuracy < 0.85) {
      recommendations.push('Model accuracy degraded - investigate root cause and retrain');
    }
    if (performance.falsePositiveRate && performance.falsePositiveRate > 0.1) {
      recommendations.push('High false positive rate - adjust decision threshold or retrain');
    }

    // Revenue impact recommendations
    if (revenue.impactScore > 30) {
      recommendations.push('Significant revenue impact - evaluate if model should be rolled back');
    }

    if (recommendations.length === 0) {
      recommendations.push('Model operating within acceptable parameters');
      recommendations.push('Continue routine monitoring');
    }

    return recommendations;
  }

  /**
   * Store risk score
   */
  private async storeRiskScore(score: ModelRiskScore): Promise<void> {
    try {
      await this.db.collection(this.RISK_SCORES_COLLECTION).add({
        ...score,
        pack: 'PACK_446'
      });
    } catch (error) {
      logger.error('[ModelRiskScoring] Store score failed:', error);
      throw error;
    }
  }

  /**
   * Check metrics and trigger alerts if necessary
   */
  private async checkAndTriggerAlerts(score: ModelRiskScore): Promise<void> {
    for (const metric of score.metrics) {
      if (metric.status === 'CRITICAL') {
        await this.triggerAlert({
          modelId: score.modelId,
          severity: 'CRITICAL',
          category: metric.category,
          message: `Critical risk detected in ${metric.category}`,
          details: {
            value: metric.value,
            threshold: metric.threshold,
            ...metric
          }
        });
      } else if (metric.status === 'WARNING') {
        await this.triggerAlert({
          modelId: score.modelId,
          severity: 'WARNING',
          category: metric.category,
          message: `Warning: ${metric.category} approaching threshold`,
          details: {
            value: metric.value,
            threshold: metric.threshold,
            ...metric
          }
        });
      }
    }
  }

  /**
   * Trigger risk alert
   */
  async triggerAlert(alert: Omit<RiskAlert, 'alertId' | 'triggeredAt' | 'acknowledged' | 'resolved'>): Promise<string> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fullAlert: RiskAlert = {
        alertId,
        ...alert,
        triggeredAt: new Date(),
        acknowledged: false,
        resolved: false
      };

      await this.db.collection(this.RISK_ALERTS_COLLECTION).doc(alertId).set(fullAlert);

      logger.warn(`[ModelRiskScoring] Alert triggered: ${alert.severity} - ${alert.message}`);

      // Integration with PACK 299 (Analytics & Safety Monitor)
      await this.notifyMonitoringSystem(fullAlert);

      return alertId;
    } catch (error) {
      logger.error('[ModelRiskScoring] Trigger alert failed:', error);
      throw error;
    }
  }

  /**
   * Get active alerts for a model
   */
  async getActiveAlerts(modelId: string): Promise<RiskAlert[]> {
    try {
      const snapshot = await this.db.collection(this.RISK_ALERTS_COLLECTION)
        .where('modelId', '==', modelId)
        .where('resolved', '==', false)
        .orderBy('triggeredAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data() as RiskAlert);
    } catch (error) {
      logger.error('[ModelRiskScoring] Get alerts failed:', error);
      throw error;
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    try {
      await this.db.collection(this.RISK_ALERTS_COLLECTION).doc(alertId).update({
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date()
      });

      logger.info(`[ModelRiskScoring] Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    } catch (error) {
      logger.error('[ModelRiskScoring] Acknowledge alert failed:', error);
      throw error;
    }
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string, resolution: string): Promise<void> {
    try {
      await this.db.collection(this.RISK_ALERTS_COLLECTION).doc(alertId).update({
        resolved: true,
        resolvedAt: new Date(),
        resolution
      });

      logger.info(`[ModelRiskScoring] Alert resolved: ${alertId}`);
    } catch (error) {
      logger.error('[ModelRiskScoring] Resolve alert failed:', error);
      throw error;
    }
  }

  /**
   * Get latest risk score for a model
   */
  async getLatestRiskScore(modelId: string): Promise<ModelRiskScore | null> {
    try {
      const snapshot = await this.db.collection(this.RISK_SCORES_COLLECTION)
        .where('modelId', '==', modelId)
        .orderBy('assessedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].data() as ModelRiskScore;
    } catch (error) {
      logger.error('[ModelRiskScoring] Get risk score failed:', error);
      throw error;
    }
  }

  /**
   * Notify monitoring system (integration with PACK 299)
   */
  private async notifyMonitoringSystem(alert: RiskAlert): Promise<void> {
    try {
      // Would integrate with PACK 299 monitoring system
      await this.db.collection('monitoring_events').add({
        type: 'AI_RISK_ALERT',
        severity: alert.severity,
        source: 'PACK_446',
        alert,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('[ModelRiskScoring] Notify monitoring failed:', error);
      // Don't throw - notification failure shouldn't block alert creation
    }
  }
}
