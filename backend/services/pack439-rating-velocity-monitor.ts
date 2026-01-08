/**
 * PACK 439 - App Store Trust, Ratings & Review Shield
 * RatingVelocityMonitor - Real-time monitoring of rating velocity and anomalies
 * 
 * Dependencies: PACK 296, 299, 324, 365, 437, 438
 * Status: ACTIVE
 */

import { db } from '../lib/firebase-admin';
import { auditLog } from './pack296-audit-logger';
import { sendAlert } from './pack299-analytics-safety';
import { Timestamp } from 'firebase-admin/firestore';

export interface VelocitySnapshot {
  platform: 'ios' | 'android';
  timestamp: Timestamp;
  
  // Velocity metrics
  reviewsLastHour: number;
  reviewsLast24Hours: number;
  reviewsLast7Days: number;
  
  // Rating distribution
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  
  // Velocity rates
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number;
  
  // Anomaly flags
  velocityAnomaly: boolean;
  distributionAnomaly: boolean;
  uninstallSpike: boolean;
  crashCorrelation: boolean;
}

export interface VelocityAlert {
  id: string;
  type: 'velocity_spike' | 'distribution_shift' | 'uninstall_spike' | 'crash_correlation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  platform: 'ios' | 'android';
  message: string;
  data: any;
  timestamp: Timestamp;
  acknowledged: boolean;
}

export interface UninstallMetrics {
  platform: 'ios' | 'android';
  uninstallsLastHour: number;
  uninstallsLast24Hours: number;
  uninstallRate: number; // percentage of active users
  spike: boolean;
  spikeMultiplier?: number;
}

export interface CrashCorrelation {
  platform: 'ios' | 'android';
  crashRate: number;
  crashCount: number;
  reviewsMentioningCrash: number;
  correlationScore: number; // 0-1
  isCorrelated: boolean;
}

export class RatingVelocityMonitor {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Thresholds
  private readonly VELOCITY_SPIKE_THRESHOLD = 3; // 3x baseline
  private readonly UNINSTALL_SPIKE_THRESHOLD = 2.5; // 2.5x baseline
  private readonly CRASH_CORRELATION_THRESHOLD = 0.7;
  private readonly MIN_SAMPLE_SIZE = 20;

  /**
   * Start real-time monitoring for a platform
   */
  async startMonitoring(platform: 'ios' | 'android', intervalMinutes: number = 15): Promise<void> {
    const key = `monitor_${platform}`;
    
    // Clear existing interval if any
    if (this.monitoringIntervals.has(key)) {
      clearInterval(this.monitoringIntervals.get(key)!);
    }

    // Initial snapshot
    await this.captureSnapshot(platform);

    // Set up interval
    const interval = setInterval(async () => {
      try {
        await this.captureSnapshot(platform);
      } catch (error) {
        console.error(`[RatingVelocityMonitor] Error in ${platform} monitoring:`, error);
      }
    }, intervalMinutes * 60 * 1000);

    this.monitoringIntervals.set(key, interval);

    await auditLog({
      action: 'velocity_monitoring_started',
      userId: 'system',
      metadata: { platform, intervalMinutes },
      packId: 'PACK-439',
    });
  }

  /**
   * Stop monitoring for a platform
   */
  async stopMonitoring(platform: 'ios' | 'android'): Promise<void> {
    const key = `monitor_${platform}`;
    
    if (this.monitoringIntervals.has(key)) {
      clearInterval(this.monitoringIntervals.get(key)!);
      this.monitoringIntervals.delete(key);
    }

    await auditLog({
      action: 'velocity_monitoring_stopped',
      userId: 'system',
      metadata: { platform },
      packId: 'PACK-439',
    });
  }

  /**
   * Capture a velocity snapshot
   */
  async captureSnapshot(platform: 'ios' | 'android'): Promise<VelocitySnapshot> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch reviews for different time windows
    const [hourReviews, dayReviews, weekReviews] = await Promise.all([
      this.fetchReviewCount(platform, Timestamp.fromDate(oneHourAgo)),
      this.fetchReviewCount(platform, Timestamp.fromDate(oneDayAgo)),
      this.fetchReviewCount(platform, Timestamp.fromDate(sevenDaysAgo)),
    ]);

    // Get rating distribution for last 24 hours
    const distribution = await this.getRatingDistribution(platform, oneDayAgo);

    // Calculate rates
    const hourlyRate = hourReviews.count;
    const dailyRate = dayReviews.count / 24;
    const weeklyRate = weekReviews.count / (7 * 24);

    // Check for anomalies
    const velocityAnomaly = await this.checkVelocityAnomaly(platform, hourlyRate, dailyRate);
    const distributionAnomaly = await this.checkDistributionAnomaly(platform, distribution);
    const uninstallSpike = await this.checkUninstallSpike(platform);
    const crashCorrelation = await this.checkCrashCorrelation(platform);

    const snapshot: VelocitySnapshot = {
      platform,
      timestamp: Timestamp.now(),
      reviewsLastHour: hourReviews.count,
      reviewsLast24Hours: dayReviews.count,
      reviewsLast7Days: weekReviews.count,
      ratingDistribution: distribution,
      hourlyRate,
      dailyRate,
      weeklyRate,
      velocityAnomaly,
      distributionAnomaly,
      uninstallSpike,
      crashCorrelation,
    };

    // Save snapshot
    await this.saveSnapshot(snapshot);

    // Generate alerts if anomalies detected
    if (velocityAnomaly || distributionAnomaly || uninstallSpike || crashCorrelation) {
      await this.generateAlerts(snapshot);
    }

    return snapshot;
  }

  /**
   * Get current velocity snapshot
   */
  async getCurrentSnapshot(platform: 'ios' | 'android'): Promise<VelocitySnapshot | null> {
    const doc = await db
      .collection('velocitySnapshots')
      .where('platform', '==', platform)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (doc.empty) return null;

    return doc.docs[0].data() as VelocitySnapshot;
  }

  /**
   * Get velocity history
   */
  async getVelocityHistory(
    platform: 'ios' | 'android',
    hours: number = 24
  ): Promise<VelocitySnapshot[]> {
    const since = Timestamp.fromDate(new Date(Date.now() - hours * 60 * 60 * 1000));

    const snapshot = await db
      .collection('velocitySnapshots')
      .where('platform', '==', platform)
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data() as VelocitySnapshot);
  }

  /**
   * Check uninstall spike
   */
  async checkUninstallSpike(platform: 'ios' | 'android'): Promise<boolean> {
    const metrics = await this.getUninstallMetrics(platform);
    return metrics.spike;
  }

  /**
   * Get uninstall metrics
   */
  async getUninstallMetrics(platform: 'ios' | 'android'): Promise<UninstallMetrics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch uninstall events from analytics
    const [hourUninstalls, dayUninstalls] = await Promise.all([
      this.fetchUninstallCount(platform, Timestamp.fromDate(oneHourAgo)),
      this.fetchUninstallCount(platform, Timestamp.fromDate(oneDayAgo)),
    ]);

    // Get active user count
    const activeUsers = await this.getActiveUserCount(platform);
    const uninstallRate = activeUsers > 0 ? dayUninstalls / activeUsers : 0;

    // Get baseline
    const baseline = await this.getBaselineUninstallRate(platform);
    const currentRate = hourUninstalls;
    const spike = currentRate > baseline * this.UNINSTALL_SPIKE_THRESHOLD;
    const spikeMultiplier = spike ? currentRate / baseline : undefined;

    return {
      platform,
      uninstallsLastHour: hourUninstalls,
      uninstallsLast24Hours: dayUninstalls,
      uninstallRate,
      spike,
      spikeMultiplier,
    };
  }

  /**
   * Check crash-to-review correlation
   */
  async checkCrashCorrelation(platform: 'ios' | 'android'): Promise<boolean> {
    const correlation = await this.getCrashCorrelation(platform);
    return correlation.isCorrelated;
  }

  /**
   * Get crash correlation metrics
   */
  async getCrashCorrelation(platform: 'ios' | 'android'): Promise<CrashCorrelation> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch crash data
    const crashData = await this.fetchCrashData(platform, Timestamp.fromDate(oneDayAgo));
    
    // Count reviews mentioning crashes
    const reviewsMentioningCrash = await this.countCrashReviews(platform, oneDayAgo);

    // Calculate correlation score
    const totalReviews = await this.fetchReviewCount(
      platform,
      Timestamp.fromDate(oneDayAgo)
    );

    let correlationScore = 0;
    if (totalReviews.count > 0 && crashData.crashCount > 0) {
      const crashMentionRate = reviewsMentioningCrash / totalReviews.count;
      const crashRate = crashData.crashRate;
      correlationScore = Math.min(1, (crashMentionRate * crashRate) * 10);
    }

    const isCorrelated = correlationScore > this.CRASH_CORRELATION_THRESHOLD;

    return {
      platform,
      crashRate: crashData.crashRate,
      crashCount: crashData.crashCount,
      reviewsMentioningCrash,
      correlationScore,
      isCorrelated,
    };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(platform?: 'ios' | 'android'): Promise<VelocityAlert[]> {
    let query = db
      .collection('velocityAlerts')
      .where('acknowledged', '==', false)
      .orderBy('timestamp', 'desc');

    if (platform) {
      query = query.where('platform', '==', platform);
    }

    const snapshot = await query.limit(50).get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as VelocityAlert));
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    await db.collection('velocityAlerts').doc(alertId).update({
      acknowledged: true,
      acknowledgedAt: Timestamp.now(),
    });

    await auditLog({
      action: 'velocity_alert_acknowledged',
      userId: 'admin',
      metadata: { alertId },
      packId: 'PACK-439',
    });
  }

  // Private helper methods

  private async fetchReviewCount(
    platform: string,
    since: Timestamp
  ): Promise<{ count: number }> {
    const snapshot = await db
      .collection('appStoreReviews')
      .where('platform', '==', platform)
      .where('timestamp', '>=', since)
      .count()
      .get();

    return { count: snapshot.data().count };
  }

  private async getRatingDistribution(
    platform: string,
    since: Date
  ): Promise<VelocitySnapshot['ratingDistribution']> {
    const snapshot = await db
      .collection('appStoreReviews')
      .where('platform', '==', platform)
      .where('timestamp', '>=', Timestamp.fromDate(since))
      .get();

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    snapshot.docs.forEach(doc => {
      const rating = doc.data().rating;
      if (rating >= 1 && rating <= 5) {
        distribution[rating as keyof typeof distribution]++;
      }
    });

    return distribution;
  }

  private async checkVelocityAnomaly(
    platform: string,
    hourlyRate: number,
    dailyRate: number
  ): Promise<boolean> {
    const baseline = await this.getBaselineVelocity(platform);
    return hourlyRate > baseline * this.VELOCITY_SPIKE_THRESHOLD;
  }

  private async checkDistributionAnomaly(
    platform: string,
    current: VelocitySnapshot['ratingDistribution']
  ): Promise<boolean> {
    const historical = await this.getHistoricalDistribution(platform);
    
    const total = Object.values(current).reduce((a, b) => a + b, 0);
    if (total < this.MIN_SAMPLE_SIZE) return false;

    // Check if 1-star ratio significantly higher
    const currentOneStarRatio = current[1] / total;
    const historicalOneStarRatio = historical[1];

    return currentOneStarRatio > historicalOneStarRatio * 2;
  }

  private async getBaselineVelocity(platform: string): Promise<number> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_baseline`).get();
    return doc.exists ? (doc.data()?.averageReviewsPerHour || 5) : 5;
  }

  private async getHistoricalDistribution(
    platform: string
  ): Promise<{ [key: number]: number }> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_distribution`).get();
    return doc.exists ? doc.data()?.distribution || { 1: 0.05, 2: 0.05, 3: 0.15, 4: 0.25, 5: 0.5 }
      : { 1: 0.05, 2: 0.05, 3: 0.15, 4: 0.25, 5: 0.5 };
  }

  private async fetchUninstallCount(platform: string, since: Timestamp): Promise<number> {
    const snapshot = await db
      .collection('analyticsEvents')
      .where('platform', '==', platform)
      .where('eventType', '==', 'app_uninstall')
      .where('timestamp', '>=', since)
      .count()
      .get();

    return snapshot.data().count;
  }

  private async getActiveUserCount(platform: string): Promise<number> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_users`).get();
    return doc.exists ? (doc.data()?.activeUsers || 0) : 0;
  }

  private async getBaselineUninstallRate(platform: string): Promise<number> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_baseline`).get();
    return doc.exists ? (doc.data()?.averageUninstallsPerHour || 1) : 1;
  }

  private async fetchCrashData(
    platform: string,
    since: Timestamp
  ): Promise<{ crashRate: number; crashCount: number }> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_crashes`).get();
    return doc.exists ? doc.data() as any : { crashRate: 0, crashCount: 0 };
  }

  private async countCrashReviews(platform: string, since: Date): Promise<number> {
    const snapshot = await db
      .collection('appStoreReviews')
      .where('platform', '==', platform)
      .where('timestamp', '>=', Timestamp.fromDate(since))
      .get();

    const crashKeywords = ['crash', 'freeze', 'stuck', 'broken', 'not working', 'wont open'];
    
    return snapshot.docs.filter(doc => {
      const text = (doc.data().text || '').toLowerCase();
      return crashKeywords.some(keyword => text.includes(keyword));
    }).length;
  }

  private async saveSnapshot(snapshot: VelocitySnapshot): Promise<void> {
    await db.collection('velocitySnapshots').add(snapshot);
  }

  private async generateAlerts(snapshot: VelocitySnapshot): Promise<void> {
    const alerts: Omit<VelocityAlert, 'id'>[] = [];

    if (snapshot.velocityAnomaly) {
      alerts.push({
        type: 'velocity_spike',
        severity: snapshot.hourlyRate > snapshot.dailyRate * 5 ? 'critical' : 'high',
        platform: snapshot.platform,
        message: `Review velocity spike detected: ${snapshot.hourlyRate.toFixed(1)}/hr`,
        data: { hourlyRate: snapshot.hourlyRate, dailyRate: snapshot.dailyRate },
        timestamp: Timestamp.now(),
        acknowledged: false,
      });
    }

    if (snapshot.distributionAnomaly) {
      alerts.push({
        type: 'distribution_shift',
        severity: 'high',
        platform: snapshot.platform,
        message: 'Abnormal rating distribution detected',
        data: { distribution: snapshot.ratingDistribution },
        timestamp: Timestamp.now(),
        acknowledged: false,
      });
    }

    if (snapshot.uninstallSpike) {
      alerts.push({
        type: 'uninstall_spike',
        severity: 'medium',
        platform: snapshot.platform,
        message: 'Uninstall rate spike detected',
        data: {},
        timestamp: Timestamp.now(),
        acknowledged: false,
      });
    }

    if (snapshot.crashCorrelation) {
      alerts.push({
        type: 'crash_correlation',
        severity: 'critical',
        platform: snapshot.platform,
        message: 'High correlation between crashes and negative reviews',
        data: {},
        timestamp: Timestamp.now(),
        acknowledged: false,
      });
    }

    // Save alerts
    for (const alert of alerts) {
      await db.collection('velocityAlerts').add(alert);
      
      // Send immediate notification
      await sendAlert({
        type: alert.type,
        severity: alert.severity,
        data: {
          platform: alert.platform,
          message: alert.message,
          ...alert.data,
        },
      });
    }
  }
}

export const ratingVelocityMonitor = new RatingVelocityMonitor();
