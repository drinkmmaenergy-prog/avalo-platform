/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Growth Safety Dashboard Module
 * 
 * Admin-only dashboard for viewing invite quality heatmap, top abuse vectors,
 * and ROI after fraud correction. Read-only; actions via guardrails (PACK 437).
 */

import { Firestore } from 'firebase-admin/firestore';
import {
  GrowthSafetyMetrics,
  GrowthAbuseAlert,
  Pack441Config,
  InviteQualityScore,
  SourceQualityMetrics,
} from './types';
import { ViralLoopRiskScorer } from './ViralLoopRiskScorer';
import { ReferralAbuseDetector } from './ReferralAbuseDetector';
import { AdaptiveGrowthThrottle } from './AdaptiveGrowthThrottle';
import { AbuseRetentionCorrelationModel } from './AbuseRetentionCorrelationModel';

export class GrowthSafetyDashboard {
  private db: Firestore;
  private config: Pack441Config;
  private riskScorer: ViralLoopRiskScorer;
  private abuseDetector: ReferralAbuseDetector;
  private throttle: AdaptiveGrowthThrottle;
  private correlationModel: AbuseRetentionCorrelationModel;

  constructor(
    db: Firestore,
    config: Pack441Config,
    riskScorer: ViralLoopRiskScorer,
    abuseDetector: ReferralAbuseDetector,
    throttle: AdaptiveGrowthThrottle,
    correlationModel: AbuseRetentionCorrelationModel
  ) {
    this.db = db;
    this.config = config;
    this.riskScorer = riskScorer;
    this.abuseDetector = abuseDetector;
    this.throttle = throttle;
    this.correlationModel = correlationModel;
  }

  /**
   * Get comprehensive growth safety metrics
   */
  async getMetrics(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<GrowthSafetyMetrics> {
    const [overview, topVectors, heatmap, roi] = await Promise.all([
      this.calculateOverview(startDate, endDate),
      this.getTopAbuseVectors(startDate, endDate),
      this.getInviteQualityHeatmap(startDate, endDate),
      this.calculateROIAfterFraud(startDate, endDate),
    ]);

    return {
      timeframe: {
        start: startDate,
        end: endDate,
      },
      overview,
      topAbuseVectors: topVectors,
      inviteQualityHeatmap: heatmap,
      roiAfterFraudCorrection: roi,
    };
  }

  /**
   * Calculate overview metrics
   */
  private async calculateOverview(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalInvites: number;
    organicInvites: number;
    suspiciousInvites: number;
    blockedInvites: number;
    fraudDetectionRate: number;
  }> {
    // Get all invites in timeframe
    const invitesSnapshot = await this.db
      .collection('invitations')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    const totalInvites = invitesSnapshot.size;

    let organicCount = 0;
    let suspiciousCount = 0;
    let blockedCount = 0;
    let fraudDetectedCount = 0;

    for (const inviteDoc of invitesSnapshot.docs) {
      const inviteId = inviteDoc.id;

      // Get invite quality score
      const qualityDoc = await this.db
        .collection('pack441_invite_quality')
        .doc(inviteId)
        .get();

      if (qualityDoc.exists) {
        const classification = qualityDoc.data()?.classification;
        if (classification === 'high_quality') organicCount++;
        if (classification === 'low_quality' || classification === 'fraudulent') {
          suspiciousCount++;
        }
        if (classification === 'fraudulent') fraudDetectedCount++;
      } else {
        // No quality score = assume organic
        organicCount++;
      }

      // Check if blocked
      const senderId = inviteDoc.data().senderId;
      const throttleEvent = await this.db
        .collection('pack441_throttle_events')
        .where('userId', '==', senderId)
        .where('eventType', '==', 'invite_sent')
        .where('blocked', '==', true)
        .where('timestamp', '>=', inviteDoc.data().createdAt)
        .limit(1)
        .get();

      if (!throttleEvent.empty) blockedCount++;
    }

    return {
      totalInvites,
      organicInvites: organicCount,
      suspiciousInvites: suspiciousCount,
      blockedInvites: blockedCount,
      fraudDetectionRate: totalInvites > 0 ? (fraudDetectedCount / totalInvites) * 100 : 0,
    };
  }

  /**
   * Get top abuse vectors
   */
  private async getTopAbuseVectors(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    vectorId: string;
    vectorType: 'source' | 'user' | 'device' | 'ip';
    abuseCount: number;
    riskScore: number;
    lastSeen: Date;
  }>> {
    const limit = this.config.dashboard.topVectorsLimit;

    // Collect abuse vectors from different sources
    const vectors: Map<string, {
      vectorId: string;
      vectorType: 'source' | 'user' | 'device' | 'ip';
      abuseCount: number;
      riskScore: number;
      lastSeen: Date;
    }> = new Map();

    // Get high-risk users
    const riskScoresSnapshot = await this.db
      .collection('pack441_risk_scores')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .where('classification', 'in', ['suspicious', 'abusive'])
      .get();

    riskScoresSnapshot.forEach((doc) => {
      const data = doc.data();
      const userId = doc.id;

      if (!vectors.has(userId)) {
        vectors.set(userId, {
          vectorId: userId,
          vectorType: 'user',
          abuseCount: 1,
          riskScore: data.overallScore || 0,
          lastSeen: data.timestamp?.toDate() || new Date(),
        });
      } else {
        const existing = vectors.get(userId)!;
        existing.abuseCount++;
        existing.riskScore = Math.max(existing.riskScore, data.overallScore || 0);
      }
    });

    // Get fraud signals (devices and IPs)
    const fraudSignalsSnapshot = await this.db
      .collection('pack441_fraud_signals')
      .where('detectedAt', '>=', startDate)
      .where('detectedAt', '<=', endDate)
      .get();

    for (const fraudDoc of fraudSignalsSnapshot.docs) {
      const data = fraudDoc.data();
      const userId = fraudDoc.id;

      // Get user's devices and IPs
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const devices = userData?.deviceIds || [];
        const ips = userData?.ipAddresses || [];

        devices.forEach((device: string) => {
          if (!vectors.has(`device_${device}`)) {
            vectors.set(`device_${device}`, {
              vectorId: device,
              vectorType: 'device',
              abuseCount: 1,
              riskScore: 75, // High risk for fraud-associated devices
              lastSeen: data.detectedAt?.toDate() || new Date(),
            });
          } else {
            const existing = vectors.get(`device_${device}`)!;
            existing.abuseCount++;
          }
        });

        ips.forEach((ip: string) => {
          if (!vectors.has(`ip_${ip}`)) {
            vectors.set(`ip_${ip}`, {
              vectorId: ip,
              vectorType: 'ip',
              abuseCount: 1,
              riskScore: 75, // High risk for fraud-associated IPs
              lastSeen: data.detectedAt?.toDate() || new Date(),
            });
          } else {
            const existing = vectors.get(`ip_${ip}`)!;
            existing.abuseCount++;
          }
        });
      }
    }

    // Get source vectors
    const correlationsSnapshot = await this.db
      .collection('pack441_correlations')
      .where('analyzedAt', '>=', startDate)
      .where('analyzedAt', '<=', endDate)
      .where('recommendation', 'in', ['throttle', 'disable'])
      .get();

    correlationsSnapshot.forEach((doc) => {
      const data = doc.data();
      const sourceId = doc.id;

      vectors.set(`source_${sourceId}`, {
        vectorId: sourceId,
        vectorType: 'source',
        abuseCount: data.abuseMetrics?.abuseSignalCount || 0,
        riskScore: data.abuseMetrics?.avgRiskScore || 0,
        lastSeen: data.analyzedAt?.toDate() || new Date(),
      });
    });

    // Sort by abuse count and take top N
    const sortedVectors = Array.from(vectors.values())
      .sort((a, b) => b.abuseCount - a.abuseCount)
      .slice(0, limit);

    return sortedVectors;
  }

  /**
   * Get invite quality heatmap
   */
  private async getInviteQualityHeatmap(
    startDate: Date,
    endDate: Date
  ): Promise<{
    organic: number;
    incentivized: number;
    suspicious: number;
    abusive: number;
  }> {
    const qualitySnapshot = await this.db
      .collection('pack441_invite_quality')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();

    const heatmap = {
      organic: 0,
      incentivized: 0,
      suspicious: 0,
      abusive: 0,
    };

    qualitySnapshot.forEach((doc) => {
      const classification = doc.data().classification;
      
      if (classification === 'high_quality') {
        heatmap.organic++;
      } else if (classification === 'medium_quality') {
        heatmap.incentivized++;
      } else if (classification === 'low_quality') {
        heatmap.suspicious++;
      } else if (classification === 'fraudulent') {
        heatmap.abusive++;
      }
    });

    return heatmap;
  }

  /**
   * Calculate ROI after fraud correction
   */
  private async calculateROIAfterFraud(
    startDate: Date,
    endDate: Date
  ): Promise<{
    rawCAC: number;
    correctedCAC: number;
    savingsFromPrevention: number;
    projectedLTVImpact: number;
  }> {
    // Get total growth spend in timeframe
    const growthSpendSnapshot = await this.db
      .collection('growth_spend')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    let totalSpend = 0;
    growthSpendSnapshot.forEach((doc) => {
      totalSpend += doc.data().amount || 0;
    });

    // Get users acquired in timeframe
    const usersSnapshot = await this.db
      .collection('users')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    const totalUsers = usersSnapshot.size;

    // Count good vs bad users
    let goodUsers = 0;
    let badUsers = 0;
    let totalLTVGoodUsers = 0;
    let totalLTVBadUsers = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Check if user is fraudulent
      const fraudDoc = await this.db
        .collection('pack441_fraud_signals')
        .doc(userId)
        .get();

      const isFraudulent = fraudDoc.exists && 
        (fraudDoc.data()?.signalStrength === 'high' || fraudDoc.data()?.signalStrength === 'critical');

      // Get user LTV
      const paymentsSnapshot = await this.db
        .collection('payments')
        .where('userId', '==', userId)
        .where('status', '==', 'completed')
        .get();

      let userLTV = 0;
      paymentsSnapshot.forEach((doc) => {
        userLTV += doc.data().amount || 0;
      });

      if (isFraudulent) {
        badUsers++;
        totalLTVBadUsers += userLTV;
      } else {
        goodUsers++;
        totalLTVGoodUsers += userLTV;
      }
    }

    // Calculate metrics
    const rawCAC = totalUsers > 0 ? totalSpend / totalUsers : 0;
    const correctedCAC = goodUsers > 0 ? totalSpend / goodUsers : rawCAC;
    const savingsFromPrevention = totalSpend * (badUsers / Math.max(totalUsers, 1));

    // Projected LTV impact (what would have happened without fraud detection)
    const avgLTVGood = goodUsers > 0 ? totalLTVGoodUsers / goodUsers : 0;
    const avgLTVBad = badUsers > 0 ? totalLTVBadUsers / badUsers : 0;
    const projectedLTVImpact = (avgLTVGood - avgLTVBad) * badUsers;

    return {
      rawCAC,
      correctedCAC,
      savingsFromPrevention,
      projectedLTVImpact,
    };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<GrowthAbuseAlert[]> {
    const snapshot = await this.db
      .collection('pack441_alerts')
      .where('status', '==', 'active')
      .orderBy('detectedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      alertId: doc.id,
    } as GrowthAbuseAlert));
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const snapshot = await this.db
      .collection('pack441_alerts')
      .where('detectedAt', '>=', startDate)
      .where('detectedAt', '<=', endDate)
      .get();

    const stats = {
      total: snapshot.size,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();
      
      const severity = data.severity || 'unknown';
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;

      const type = data.alertType || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      const status = data.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });

    return stats;
  }

  /**
   * Get source quality metrics
   */
  async getAllSourceQualityMetrics(): Promise<SourceQualityMetrics[]> {
    const snapshot = await this.db
      .collection('pack441_source_quality')
      .orderBy('lastReviewed', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as SourceQualityMetrics);
  }

  /**
   * Get throttle statistics
   */
  async getThrottleStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalEvents: number;
    blockedEvents: number;
    blockRate: number;
    byEventType: Record<string, { total: number; blocked: number }>;
  }> {
    const snapshot = await this.db
      .collection('pack441_throttle_events')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();

    const stats = {
      totalEvents: snapshot.size,
      blockedEvents: 0,
      blockRate: 0,
      byEventType: {} as Record<string, { total: number; blocked: number }>,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();
      const eventType = data.eventType || 'unknown';
      const blocked = data.blocked || false;

      if (blocked) stats.blockedEvents++;

      if (!stats.byEventType[eventType]) {
        stats.byEventType[eventType] = { total: 0, blocked: 0 };
      }

      stats.byEventType[eventType].total++;
      if (blocked) stats.byEventType[eventType].blocked++;
    });

    stats.blockRate = stats.totalEvents > 0 ? (stats.blockedEvents / stats.totalEvents) * 100 : 0;

    return stats;
  }

  /**
   * Get trust score distribution
   */
  async getTrustScoreDistribution(): Promise<{
    veryHigh: number; // 90-100
    high: number; // 70-89
    medium: number; // 50-69
    low: number; // 30-49
    veryLow: number; // 0-29
  }> {
    const snapshot = await this.db.collection('pack441_trust_scores').get();

    const distribution = {
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0,
    };

    snapshot.forEach((doc) => {
      const score = doc.data().currentScore || 100;

      if (score >= 90) distribution.veryHigh++;
      else if (score >= 70) distribution.high++;
      else if (score >= 50) distribution.medium++;
      else if (score >= 30) distribution.low++;
      else distribution.veryLow++;
    });

    return distribution;
  }

  /**
   * Export dashboard data for reporting
   */
  async exportDashboardData(
    startDate: Date,
    endDate: Date
  ): Promise<{
    metrics: GrowthSafetyMetrics;
    alerts: GrowthAbuseAlert[];
    alertStats: any;
    throttleStats: any;
    trustDistribution: any;
    qualityDistribution: any;
  }> {
    const [
      metrics,
      alerts,
      alertStats,
      throttleStats,
      trustDistribution,
      qualityDistribution,
    ] = await Promise.all([
      this.getMetrics(startDate, endDate),
      this.getActiveAlerts(),
      this.getAlertStatistics(startDate, endDate),
      this.getThrottleStatistics(startDate, endDate),
      this.getTrustScoreDistribution(),
      this.correlationModel.getQualityScoreDistribution(),
    ]);

    return {
      metrics,
      alerts,
      alertStats,
      throttleStats,
      trustDistribution,
      qualityDistribution,
    };
  }

  /**
   * Get real-time dashboard summary (for monitoring)
   */
  async getRealTimeSummary(): Promise<{
    activeAlerts: number;
    recentBlockedInvites: number;
    avgRiskScore: number;
    topIssue: string;
  }> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeAlerts, blockedEvents, riskScores] = await Promise.all([
      this.db.collection('pack441_alerts').where('status', '==', 'active').get(),
      this.db
        .collection('pack441_throttle_events')
        .where('blocked', '==', true)
        .where('timestamp', '>=', last24Hours)
        .get(),
      this.db
        .collection('pack441_risk_scores')
        .where('timestamp', '>=', last24Hours)
        .get(),
    ]);

    let totalRiskScore = 0;
    riskScores.forEach((doc) => {
      totalRiskScore += doc.data().overallScore || 0;
    });

    const avgRiskScore = riskScores.size > 0 ? totalRiskScore / riskScores.size : 0;

    // Determine top issue
    let topIssue = 'No significant issues';
    if (activeAlerts.size > 5) {
      topIssue = `${activeAlerts.size} active alerts requiring attention`;
    } else if (blockedEvents.size > 100) {
      topIssue = `High throttle rate: ${blockedEvents.size} blocked events in 24h`;
    } else if (avgRiskScore > 60) {
      topIssue = `Elevated average risk score: ${avgRiskScore.toFixed(1)}`;
    }

    return {
      activeAlerts: activeAlerts.size,
      recentBlockedInvites: blockedEvents.size,
      avgRiskScore: Math.round(avgRiskScore),
      topIssue,
    };
  }
}
