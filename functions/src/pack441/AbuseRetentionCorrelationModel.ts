/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Abuse-to-Retention Correlation Model
 * 
 * Connects abuse growth signals with churn D7/D30 and LTV cohorts.
 * Cuts off loops that increase installs but decrease user value.
 */

import { Firestore, FieldValue } from 'firebase-admin/firestore';
import {
  AbuseRetentionCorrelation,
  Pack441Config,
  SourceQualityMetrics,
} from './types';

export class AbuseRetentionCorrelationModel {
  private db: Firestore;
  private config: Pack441Config;

  constructor(db: Firestore, config: Pack441Config) {
    this.db = db;
    this.config = config;
  }

  /**
   * Analyze correlation between abuse and retention for a source
   */
  async analyzeSource(sourceId: string): Promise<AbuseRetentionCorrelation> {
    const cohortId = `cohort_${sourceId}_${Date.now()}`;

    // Gather metrics
    const [metrics, abuseMetrics] = await Promise.all([
      this.calculateRetentionMetrics(sourceId),
      this.calculateAbuseMetrics(sourceId),
    ]);

    // Calculate correlations
    const correlation = await this.calculateCorrelation(sourceId, metrics, abuseMetrics);

    // Determine recommendation
    const recommendation = this.determineRecommendation(correlation);

    const analysis: AbuseRetentionCorrelation = {
      sourceId,
      cohortId,
      metrics,
      abuseMetrics,
      correlation,
      recommendation,
      analyzedAt: new Date(),
    };

    await this.storeAnalysis(analysis);

    // Take action if needed
    if (recommendation === 'throttle' || recommendation === 'disable') {
      await this.applySourceRestriction(sourceId, recommendation);
    }

    return analysis;
  }

  /**
   * Calculate retention and LTV metrics for source
   */
  private async calculateRetentionMetrics(sourceId: string): Promise<{
    totalInstalls: number;
    d7Retention: number;
    d30Retention: number;
    avgLTV: number;
    churnRate: number;
  }> {
    const { analysisWindowDays } = this.config.correlation;
    const windowStart = new Date(Date.now() - analysisWindowDays * 24 * 60 * 60 * 1000);

    // Get users from this source
 const usersSnapshot = await this.db
      .collection('users')
      .where('source', '==', sourceId)
      .where('createdAt', '>=', windowStart)
      .get();

    const totalInstalls = usersSnapshot.size;

    if (totalInstalls < this.config.correlation.minCohortSize) {
      return {
        totalInstalls,
        d7Retention: 0,
        d30Retention: 0,
        avgLTV: 0,
        churnRate: 0,
      };
    }

    let d7RetainedCount = 0;
    let d30RetainedCount = 0;
    let totalLTV = 0;
    let churnedCount = 0;

    const now = Date.now();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const createdAt = userData.createdAt?.toDate()?.getTime();

      if (!createdAt) continue;

      const accountAge = now - createdAt;
      const accountAgeDays = accountAge / (24 * 60 * 60 * 1000);

      // Only check retention for users old enough
      if (accountAgeDays >= 7) {
        const d7Active = await this.wasUserActiveAt(userId, createdAt + 7 * 24 * 60 * 60 * 1000);
        if (d7Active) d7RetainedCount++;
      }

      if (accountAgeDays >= 30) {
        const d30Active = await this.wasUserActiveAt(userId, createdAt + 30 * 24 * 60 * 60 * 1000);
        if (d30Active) d30RetainedCount++;
      }

      // Calculate LTV
      const userLTV = await this.calculateUserLTV(userId);
      totalLTV += userLTV;

      // Check if churned
      const isChurned = await this.isUserChurned(userId);
      if (isChurned) churnedCount++;
    }

    // Calculate metrics
    const eligibleForD7 = usersSnapshot.docs.filter((doc) => {
      const createdAt = doc.data().createdAt?.toDate()?.getTime();
      if (!createdAt) return false;
      const accountAgeDays = (now - createdAt) / (24 * 60 * 60 * 1000);
      return accountAgeDays >= 7;
    }).length;

    const eligibleForD30 = usersSnapshot.docs.filter((doc) => {
      const createdAt = doc.data().createdAt?.toDate()?.getTime();
      if (!createdAt) return false;
      const accountAgeDays = (now - createdAt) / (24 * 60 * 60 * 1000);
      return accountAgeDays >= 30;
    }).length;

    return {
      totalInstalls,
      d7Retention: eligibleForD7 > 0 ? (d7RetainedCount / eligibleForD7) * 100 : 0,
      d30Retention: eligibleForD30 > 0 ? (d30RetainedCount / eligibleForD30) * 100 : 0,
      avgLTV: totalInstalls > 0 ? totalLTV / totalInstalls : 0,
      churnRate: totalInstalls > 0 ? (churnedCount / totalInstalls) * 100 : 0,
    };
  }

  /**
   * Calculate abuse metrics for source
   */
  private async calculateAbuseMetrics(sourceId: string): Promise<{
    abuseSignalCount: number;
    avgRiskScore: number;
    fraudDetectionRate: number;
  }> {
    const { analysisWindowDays } = this.config.correlation;
    const windowStart = new Date(Date.now() - analysisWindowDays * 24 * 60 * 60 * 1000);

    // Get users from this source
    const usersSnapshot = await this.db
      .collection('users')
      .where('source', '==', sourceId)
      .where('createdAt', '>=', windowStart)
      .get();

    if (usersSnapshot.empty) {
      return {
        abuseSignalCount: 0,
        avgRiskScore: 0,
        fraudDetectionRate: 0,
      };
    }

    const userIds = usersSnapshot.docs.map((doc) => doc.id);

    let totalRiskScore = 0;
    let riskScoreCount = 0;
    let fraudDetectedCount = 0;
    let abuseSignalCount = 0;

    for (const userId of userIds) {
      // Get risk score
      const riskDoc = await this.db
        .collection('pack441_risk_scores')
        .doc(userId)
        .get();

      if (riskDoc.exists) {
        const riskData = riskDoc.data();
        totalRiskScore += riskData?.overallScore || 0;
        riskScoreCount++;

        if (riskData?.classification === 'suspicious' || riskData?.classification === 'abusive') {
          abuseSignalCount++;
        }
      }

      // Get fraud signals
      const fraudDoc = await this.db
        .collection('pack441_fraud_signals')
        .doc(userId)
        .get();

      if (fraudDoc.exists) {
        const fraudData = fraudDoc.data();
        if (fraudData?.signalStrength === 'high' || fraudData?.signalStrength === 'critical') {
          fraudDetectedCount++;
        }
      }
    }

    return {
      abuseSignalCount,
      avgRiskScore: riskScoreCount > 0 ? totalRiskScore / riskScoreCount : 0,
      fraudDetectionRate: userIds.length > 0 ? (fraudDetectedCount / userIds.length) * 100 : 0,
    };
  }

  /**
   * Calculate correlation between abuse and retention/LTV
   */
  private async calculateCorrelation(
    sourceId: string,
    metrics: any,
    abuseMetrics: any
  ): Promise<{
    abuseToChurnCorrelation: number;
    abuseToLTVCorrelation: number;
    qualityScore: number;
  }> {
    // Calculate correlation coefficients
    // Higher abuse -> higher churn = positive correlation
    // Higher abuse -> lower LTV = negative correlation

    // Normalize metrics to 0-1 range
    const normalizedAbuse = Math.min(abuseMetrics.avgRiskScore / 100, 1);
    const normalizedChurn = Math.min(metrics.churnRate / 100, 1);
    const normalizedLTV = Math.min(metrics.avgLTV / 1000, 1); // Assuming $1000 is high LTV

    // Simple correlation: if both are high or both are low, correlation is positive
    const abuseToChurnCorrelation = normalizedAbuse * normalizedChurn;

    // Inverse correlation for LTV (high abuse with low LTV is bad)
    const abuseToLTVCorrelation = normalizedAbuse * (1 - normalizedLTV);

    // Calculate quality score (0-100)
    // High retention + low abuse + high LTV = high quality
    const qualityScore = Math.round(
      (metrics.d7Retention * 0.3 +
       metrics.d30Retention * 0.3 +
       (100 - abuseMetrics.avgRiskScore) * 0.2 +
       Math.min((metrics.avgLTV / 10), 100) * 0.2)
    );

    return {
      abuseToChurnCorrelation,
      abuseToLTVCorrelation,
      qualityScore: Math.max(0, Math.min(100, qualityScore)),
    };
  }

  /**
   * Determine recommendation based on correlation
   */
  private determineRecommendation(correlation: {
    abuseToChurnCorrelation: number;
    abuseToLTVCorrelation: number;
    qualityScore: number;
  }): 'continue' | 'monitor' | 'throttle' | 'disable' {
    const { disableThreshold } = this.config.correlation;

    // Disable if quality is very low
    if (correlation.qualityScore < disableThreshold) {
      return 'disable';
    }

    // Throttle if abuse correlates strongly with churn or low LTV
    if (
      correlation.abuseToChurnCorrelation > 0.7 ||
      correlation.abuseToLTVCorrelation > 0.7
    ) {
      return 'throttle';
    }

    // Monitor if quality is moderate
    if (correlation.qualityScore < 50) {
      return 'monitor';
    }

    return 'continue';
  }

  /**
   * Check if user was active at a specific time
   */
  private async wasUserActiveAt(userId: string, timestamp: number): Promise<boolean> {
    const date = new Date(timestamp);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const activitySnapshot = await this.db
      .collection('user_actions')
      .where('userId', '==', userId)
      .where('timestamp', '>=', dayStart)
      .where('timestamp', '<=', dayEnd)
      .limit(1)
      .get();

    return !activitySnapshot.empty;
  }

  /**
   * Calculate user LTV
   */
  private async calculateUserLTV(userId: string): Promise<number> {
    // Get user's revenue data
    const paymentsSnapshot = await this.db
      .collection('payments')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .get();

    let totalRevenue = 0;
    paymentsSnapshot.forEach((doc) => {
      totalRevenue += doc.data().amount || 0;
    });

    return totalRevenue;
  }

  /**
   * Check if user is churned (no activity in last 30 days)
   */
  private async isUserChurned(userId: string): Promise<boolean> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activitySnapshot = await this.db
      .collection('user_actions')
      .where('userId', '==', userId)
      .where('timestamp', '>=', thirtyDaysAgo)
      .limit(1)
      .get();

    return activitySnapshot.empty;
  }

  /**
   * Store correlation analysis
   */
  private async storeAnalysis(analysis: AbuseRetentionCorrelation): Promise<void> {
    await this.db.collection('pack441_correlations').doc(analysis.sourceId).set({
      ...analysis,
      analyzedAt: FieldValue.serverTimestamp(),
    });

    // Also store in history
    await this.db
      .collection('pack441_correlations')
      .doc(analysis.sourceId)
      .collection('history')
      .add({
        ...analysis,
        analyzedAt: FieldValue.serverTimestamp(),
      });
  }

  /**
   * Apply source restriction based on recommendation
   */
  private async applySourceRestriction(
    sourceId: string,
    recommendation: 'throttle' | 'disable'
  ): Promise<void> {
    const restriction = {
      sourceId,
      restrictionType: recommendation,
      appliedAt: new Date(),
      reason: `Automated restriction based on abuse-retention correlation analysis`,
    };

    await this.db.collection('pack441_source_restrictions').doc(sourceId).set({
      ...restriction,
      appliedAt: FieldValue.serverTimestamp(),
    });

    // Update source quality metrics
    await this.updateSourceQualityMetrics(sourceId, recommendation);
  }

  /**
   * Update source quality metrics
   */
  private async updateSourceQualityMetrics(
    sourceId: string,
    trustLevel: 'throttle' | 'disable'
  ): Promise<void> {
    const trustMapping = {
      throttle: 'restricted',
      disable: 'blocked',
    };

    await this.db.collection('pack441_source_quality').doc(sourceId).set({
      trustLevel: trustMapping[trustLevel],
      lastReviewed: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  /**
   * Get source correlation analysis
   */
  async getSourceAnalysis(sourceId: string): Promise<AbuseRetentionCorrelation | null> {
    const doc = await this.db.collection('pack441_correlations').doc(sourceId).get();
    return doc.exists ? (doc.data() as AbuseRetentionCorrelation) : null;
  }

  /**
   * Get source quality metrics
   */
  async getSourceQualityMetrics(sourceId: string): Promise<SourceQualityMetrics | null> {
    const doc = await this.db.collection('pack441_source_quality').doc(sourceId).get();
    return doc.exists ? (doc.data() as SourceQualityMetrics) : null;
  }

  /**
   * Batch analyze all sources
   */
  async batchAnalyzeAllSources(): Promise<Map<string, AbuseRetentionCorrelation>> {
    // Get unique sources from users
    const usersSnapshot = await this.db
      .collection('users')
      .where('createdAt', '>=', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // Last 90 days
      .get();

    const sources = new Set<string>();
    usersSnapshot.forEach((doc) => {
      const source = doc.data().source;
      if (source) sources.add(source);
    });

    const results = new Map<string, AbuseRetentionCorrelation>();

    // Analyze each source
    for (const sourceId of sources) {
      try {
        const analysis = await this.analyzeSource(sourceId);
        results.set(sourceId, analysis);
      } catch (error) {
        console.error(`Error analyzing source ${sourceId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get sources by recommendation
   */
  async getSourcesByRecommendation(
    recommendation: 'continue' | 'monitor' | 'throttle' | 'disable'
  ): Promise<AbuseRetentionCorrelation[]> {
    const snapshot = await this.db
      .collection('pack441_correlations')
      .where('recommendation', '==', recommendation)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AbuseRetentionCorrelation);
  }

  /**
   * Get quality score distribution
   */
  async getQualityScoreDistribution(): Promise<{
    high: number; // 75-100
    medium: number; // 50-74
    low: number; // 25-49
    poor: number; // 0-24
  }> {
    const snapshot = await this.db.collection('pack441_correlations').get();

    const distribution = {
      high: 0,
      medium: 0,
      low: 0,
      poor: 0,
    };

    snapshot.forEach((doc) => {
      const qualityScore = doc.data().correlation?.qualityScore || 0;

      if (qualityScore >= 75) distribution.high++;
      else if (qualityScore >= 50) distribution.medium++;
      else if (qualityScore >= 25) distribution.low++;
      else distribution.poor++;
    });

    return distribution;
  }
}
