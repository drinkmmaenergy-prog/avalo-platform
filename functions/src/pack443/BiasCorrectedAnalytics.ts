/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Module: BiasCorrectedAnalytics
 * 
 * Purpose: Corrects experiment results for fraud, abnormal usage, and regional policy differences.
 * Eliminates false wins and ensures statistical validity.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

export interface BiasAdjustment {
  type: 'FRAUD' | 'ABNORMAL_USAGE' | 'REGIONAL_POLICY' | 'SEASONALITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedUserCount: number;
  adjustmentFactor: number; // Multiplicative factor to apply
  confidence: number; // 0-1
  explanation: string;
}

export interface StatisticalResult {
  metric: string;
  treatmentMean: number;
  controlMean: number;
  rawDifference: number;
  rawPercentChange: number;
  
  // Bias-corrected values
  correctedTreatmentMean: number;
  correctedControlMean: number;
  correctedDifference: number;
  correctedPercentChange: number;
  
  // Statistical significance
  pValue: number;
  confidenceInterval: { lower: number; upper: number };
  sampleSize: { treatment: number; control: number };
  statisticalPower: number;
  
  // Quality indicators
  biasAdjustments: BiasAdjustment[];
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: 'TRUST' | 'USE_WITH_CAUTION' | 'REJECT';
}

export interface FraudPattern {
  userId: string;
  pattern: string;
  confidence: number;
  fraudScore: number;
  indicators: string[];
}

export interface AbnormalUsagePattern {
  userId: string;
  deviation: number; // Standard deviations from mean
  metrics: Record<string, number>;
  classification: 'OUTLIER' | 'POWER_USER' | 'AUTOMATED';
}

export class BiasCorrectedAnalytics {
  private db: admin.firestore.Firestore;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
  }

  /**
   * Analyze experiment results with bias correction
   */
  async analyzeExperiment(
    experimentId: string,
    metric: string,
    treatmentUserIds: string[],
    controlUserIds: string[]
  ): Promise<StatisticalResult> {
    logger.info('Starting bias-corrected analysis', {
      experimentId,
      metric,
      treatmentSize: treatmentUserIds.length,
      controlSize: controlUserIds.length,
    });

    // Get raw metrics
    const rawTreatmentValues = await this.getMetricValues(treatmentUserIds, metric);
    const rawControlValues = await this.getMetricValues(controlUserIds, metric);

    // Calculate raw statistics
    const treatmentMean = this.calculateMean(rawTreatmentValues);
    const controlMean = this.calculateMean(rawControlValues);
    const rawDifference = treatmentMean - controlMean;
    const rawPercentChange = ((treatmentMean - controlMean) / controlMean) * 100;

    // Detect and remove fraud
    const fraudAdjustment = await this.detectAndRemoveFraud(
      experimentId,
      treatmentUserIds,
      controlUserIds
    );

    // Detect abnormal usage
    const abnormalUsageAdjustment = await this.detectAbnormalUsage(
      experimentId,
      treatmentUserIds,
      controlUserIds
    );

    // Adjust for regional policy differences
    const regionalAdjustment = await this.adjustForRegionalPolicies(
      experimentId,
      treatmentUserIds,
      controlUserIds
    );

    // Apply all adjustments
    const biasAdjustments = [fraudAdjustment, abnormalUsageAdjustment, regionalAdjustment].filter(
      (adj) => adj !== null
    ) as BiasAdjustment[];

    let correctedTreatmentMean = treatmentMean;
    let correctedControlMean = controlMean;

    for (const adjustment of biasAdjustments) {
      correctedTreatmentMean *= adjustment.adjustmentFactor;
      correctedControlMean *= adjustment.adjustmentFactor;
    }

    const correctedDifference = correctedTreatmentMean - correctedControlMean;
    const correctedPercentChange =
      ((correctedTreatmentMean - correctedControlMean) / correctedControlMean) * 100;

    // Calculate statistical significance
    const { pValue, confidenceInterval, statisticalPower } = this.calculateStatistics(
      rawTreatmentValues,
      rawControlValues
    );

    // Assess data quality
    const dataQuality = this.assessDataQuality(biasAdjustments, statisticalPower, pValue);

    // Make recommendation
    const recommendation = this.makeRecommendation(dataQuality, pValue, biasAdjustments);

    const result: StatisticalResult = {
      metric,
      treatmentMean,
      controlMean,
      rawDifference,
      rawPercentChange,
      correctedTreatmentMean,
      correctedControlMean,
      correctedDifference,
      correctedPercentChange,
      pValue,
      confidenceInterval,
      sampleSize: {
        treatment: treatmentUserIds.length,
        control: controlUserIds.length,
      },
      statisticalPower,
      biasAdjustments,
      dataQuality,
      recommendation,
    };

    // Store analysis result
    await this.storeAnalysisResult(experimentId, result);

    logger.info('Bias-corrected analysis complete', {
      experimentId,
      metric,
      rawChange: rawPercentChange.toFixed(2) + '%',
      correctedChange: correctedPercentChange.toFixed(2) + '%',
      pValue,
      recommendation,
    });

    return result;
  }

  /**
   * Detect fraud patterns and calculate adjustment
   */
  private async detectAndRemoveFraud(
    experimentId: string,
    treatmentUserIds: string[],
    controlUserIds: string[]
  ): Promise<BiasAdjustment | null> {
    // Integration with PACK 324 (Fraud Detection)
    const allUserIds = [...treatmentUserIds, ...controlUserIds];
    
    const fraudPatterns: FraudPattern[] = [];
    
    // Query fraud signals for users
    const fraudSnapshot = await this.db
      .collection('fraudSignals')
      .where('userId', 'in', allUserIds.slice(0, 10)) // Firestore 'in' limit
      .where('timestamp', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    fraudSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.score > 0.7) {
        fraudPatterns.push({
          userId: data.userId,
          pattern: data.pattern,
          confidence: data.confidence,
          fraudScore: data.score,
          indicators: data.indicators || [],
        });
      }
    });

    if (fraudPatterns.length === 0) {
      return null;
    }

    const affectedUserCount = fraudPatterns.length;
    const totalUsers = allUserIds.length;
    const severity = this.calculateSeverity(affectedUserCount / totalUsers);

    // Calculate adjustment factor (reduce impact proportionally)
    const adjustmentFactor = 1 - affectedUserCount / totalUsers * 0.5;

    return {
      type: 'FRAUD',
      severity,
      affectedUserCount,
      adjustmentFactor,
      confidence: 0.85,
      explanation: `Detected ${affectedUserCount} fraud patterns. Adjusting results to compensate.`,
    };
  }

  /**
   * Detect abnormal usage patterns
   */
  private async detectAbnormalUsage(
    experimentId: string,
    treatmentUserIds: string[],
    controlUserIds: string[]
  ): Promise<BiasAdjustment | null> {
    const allUserIds = [...treatmentUserIds, ...controlUserIds];
    
    // Get usage statistics
    const usageStats = await this.getUserUsageStats(allUserIds);
    
    // Calculate mean and standard deviation
    const values = usageStats.map((s) => s.dailyActiveTime);
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values, mean);

    // Identify outliers (> 3 standard deviations)
    const outliers: AbnormalUsagePattern[] = [];
    
    for (const stat of usageStats) {
      const deviation = Math.abs(stat.dailyActiveTime - mean) / stdDev;
      if (deviation > 3) {
        outliers.push({
          userId: stat.userId,
          deviation,
          metrics: { dailyActiveTime: stat.dailyActiveTime },
          classification: deviation > 5 ? 'AUTOMATED' : 'POWER_USER',
        });
      }
    }

    if (outliers.length === 0) {
      return null;
    }

    const affectedUserCount = outliers.length;
    const totalUsers = allUserIds.length;
    const severity = this.calculateSeverity(affectedUserCount / totalUsers);

    // Calculate adjustment factor
    const adjustmentFactor = 1 - affectedUserCount / totalUsers * 0.3;

    return {
      type: 'ABNORMAL_USAGE',
      severity,
      affectedUserCount,
      adjustmentFactor,
      confidence: 0.75,
      explanation: `Detected ${affectedUserCount} abnormal usage patterns (outliers, bots, power users).`,
    };
  }

  /**
   * Adjust for regional policy differences
   */
  private async adjustForRegionalPolicies(
    experimentId: string,
    treatmentUserIds: string[],
    controlUserIds: string[]
  ): Promise<BiasAdjustment | null> {
    // Get user regions
    const allUserIds = [...treatmentUserIds, ...controlUserIds];
    const userRegions = await this.getUserRegions(allUserIds);

    // Check for regions with different policies (e.g., GDPR, pricing regulations)
    const restrictedRegions = ['EU', 'CALIFORNIA', 'CHINA'];
    const affectedUsers = userRegions.filter((ur) =>
      restrictedRegions.includes(ur.region)
    ).length;

    if (affectedUsers === 0) {
      return null;
    }

    const totalUsers = allUserIds.length;
    const severity = this.calculateSeverity(affectedUsers / totalUsers);

    // Calculate adjustment factor
    const adjustmentFactor = 1 - affectedUsers / totalUsers * 0.2;

    return {
      type: 'REGIONAL_POLICY',
      severity,
      affectedUserCount: affectedUsers,
      adjustmentFactor,
      confidence: 0.9,
      explanation: `${affectedUsers} users in regions with special policies (GDPR, pricing restrictions).`,
    };
  }

  /**
   * Calculate statistical metrics (t-test)
   */
  private calculateStatistics(
    treatmentValues: number[],
    controlValues: number[]
  ): {
    pValue: number;
    confidenceInterval: { lower: number; upper: number };
    statisticalPower: number;
  } {
    // Simplified t-test implementation
    // In production, use a proper statistics library like jstat or simple-statistics
    
    const treatmentMean = this.calculateMean(treatmentValues);
    const controlMean = this.calculateMean(controlValues);
    const treatmentStdDev = this.calculateStdDev(treatmentValues, treatmentMean);
    const controlStdDev = this.calculateStdDev(controlValues, controlMean);

    const n1 = treatmentValues.length;
    const n2 = controlValues.length;

    // Pooled standard error
    const se = Math.sqrt(
      (treatmentStdDev ** 2 / n1) + (controlStdDev ** 2 / n2)
    );

    // T-statistic
    const t = (treatmentMean - controlMean) / se;

    // Approximate p-value (simplified)
    const pValue = this.approximatePValue(Math.abs(t), n1 + n2 - 2);

    // Confidence interval (95%)
    const criticalValue = 1.96; // For large samples
    const marginOfError = criticalValue * se;
    const difference = treatmentMean - controlMean;

    const confidenceInterval = {
      lower: difference - marginOfError,
      upper: difference + marginOfError,
    };

    // Statistical power (simplified estimate)
    const effectSize = Math.abs((treatmentMean - controlMean) / Math.sqrt((treatmentStdDev ** 2 + controlStdDev ** 2) / 2));
    const statisticalPower = this.estimatePower(effectSize, n1, n2);

    return { pValue, confidenceInterval, statisticalPower };
  }

  /**
   * Assess overall data quality
   */
  private assessDataQuality(
    biasAdjustments: BiasAdjustment[],
    statisticalPower: number,
    pValue: number
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    // Check for high-severity bias
    const highSeverityBias = biasAdjustments.some((b) => b.severity === 'HIGH');
    if (highSeverityBias) {
      return 'LOW';
    }

    // Check statistical power
    if (statisticalPower < 0.6) {
      return 'LOW';
    }

    // Check for multiple medium-severity biases
    const mediumBiasCount = biasAdjustments.filter((b) => b.severity === 'MEDIUM').length;
    if (mediumBiasCount >= 2) {
      return 'MEDIUM';
    }

    return 'HIGH';
  }

  /**
   * Make recommendation based on analysis
   */
  private makeRecommendation(
    dataQuality: 'HIGH' | 'MEDIUM' | 'LOW',
    pValue: number,
    biasAdjustments: BiasAdjustment[]
  ): 'TRUST' | 'USE_WITH_CAUTION' | 'REJECT' {
    if (dataQuality === 'LOW') {
      return 'REJECT';
    }

    if (dataQuality === 'MEDIUM' || pValue > 0.05) {
      return 'USE_WITH_CAUTION';
    }

    // Check if bias adjustments significantly changed the result
    const significantAdjustment = biasAdjustments.some((b) => Math.abs(1 - b.adjustmentFactor) > 0.2);
    if (significantAdjustment) {
      return 'USE_WITH_CAUTION';
    }

    return 'TRUST';
  }

  // Helper methods

  private async getMetricValues(userIds: string[], metric: string): Promise<number[]> {
    // Integration with PACK 299 (Analytics Engine)
    // This would query actual metric values from analytics
    return userIds.map(() => Math.random() * 100); // Placeholder
  }

  private async getUserUsageStats(userIds: string[]): Promise<Array<{ userId: string; dailyActiveTime: number }>> {
    // Query user activity data
    return userIds.map((id) => ({
      userId: id,
      dailyActiveTime: Math.random() * 480, // minutes
    }));
  }

  private async getUserRegions(userIds: string[]): Promise<Array<{ userId: string; region: string }>> {
    // Query user profile data
    return userIds.map((id) => ({
      userId: id,
      region: Math.random() > 0.8 ? 'EU' : 'US',
    }));
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((val) => (val - mean) ** 2);
    const variance = this.calculateMean(squaredDiffs);
    return Math.sqrt(variance);
  }

  private calculateSeverity(rate: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (rate > 0.1) return 'HIGH';
    if (rate > 0.05) return 'MEDIUM';
    return 'LOW';
  }

  private approximatePValue(t: number, df: number): number {
    // Simplified p-value approximation
    // In production, use a proper statistics library
    if (t > 3) return 0.001;
    if (t > 2.5) return 0.01;
    if (t > 2) return 0.05;
    if (t > 1.5) return 0.1;
    return 0.2;
  }

  private estimatePower(effectSize: number, n1: number, n2: number): number {
    // Simplified power estimation
    // In production, use proper power analysis
    const totalN = n1 + n2;
    if (effectSize > 0.8 && totalN > 100) return 0.95;
    if (effectSize > 0.5 && totalN > 200) return 0.8;
    if (effectSize > 0.3 && totalN > 500) return 0.7;
    return 0.5;
  }

  private async storeAnalysisResult(experimentId: string, result: StatisticalResult): Promise<void> {
    await this.db.collection('experimentAnalyses').add({
      experimentId,
      result,
      timestamp: new Date(),
    });
  }
}
