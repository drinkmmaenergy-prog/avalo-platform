/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * Review Defense & Anomaly Detection
 * 
 * Detects suspicious review patterns, rating manipulation,
 * and coordinates defensive responses.
 */

import { firestore } from "firebase-admin";
import {
  StoreRatingSnapshot,
  ReviewAnomalyAlert,
  StorePlatform,
} from "./pack367-aso.types";
import { asoService } from "./pack367-aso.service";

// Initialize without importing admin (avoid module issues)
const db = firestore();

/**
 * Review Defense Service
 */
export class ReviewDefenseService {
  
  /**
   * Main anomaly detection function (scheduled to run periodically)
   */
  async detectStoreReviewAnomalies(): Promise<ReviewAnomalyAlert[]> {
    const alerts: ReviewAnomalyAlert[] = [];
    
    // Check all active platform/country combinations
    const activeListings = await this.getActiveStoreListings();
    
    for (const listing of activeListings) {
      const anomalies = await this.checkPlatformCountryAnomalies(
        listing.platform,
        listing.country
      );
      alerts.push(...anomalies);
    }
    
    // Save alerts to Firestore
    for (const alert of alerts) {
      await this.saveAnomaly(alert);
      await this.notifyAdmins(alert);
    }
    
    return alerts;
  }

  /**
   * Check anomalies for specific platform/country
   */
  private async checkPlatformCountryAnomalies(
    platform: StorePlatform,
    country: string
  ): Promise<ReviewAnomalyAlert[]> {
    const alerts: ReviewAnomalyAlert[] = [];
    
    // Get recent snapshots (last 7 days)
    const snapshots = await asoService.getRatingTrends(platform, country, 7);
    
    if (snapshots.length < 2) {
      return alerts; // Not enough data
    }
    
    const latest = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];
    
    // Check for sudden rating drop
    const ratingDelta = latest.avgRating - previous.avgRating;
    if (ratingDelta < -0.5) {
      alerts.push(this.createAlert({
        platform,
        country,
        anomalyType: "sudden_rating_drop",
        severity: ratingDelta < -1.0 ? "critical" : "high",
        previousAvg: previous.avgRating,
        currentAvg: latest.avgRating,
        delta: ratingDelta,
        timeWindowHours: this.getHoursBetween(previous.capturedAt, latest.capturedAt),
      }));
    }
    
    // Check for suspicious 1-star spike
    const oneStarIncrease = latest.ratingsBreakdown["1"] - previous.ratingsBreakdown["1"];
    const totalIncrease = latest.totalRatings - previous.totalRatings;
    
    if (totalIncrease > 0 && oneStarIncrease / totalIncrease > 0.7) {
      alerts.push(this.createAlert({
        platform,
        country,
        anomalyType: "suspicious_spike_1star",
        severity: "high",
        previousAvg: previous.avgRating,
        currentAvg: latest.avgRating,
        delta: ratingDelta,
        timeWindowHours: this.getHoursBetween(previous.capturedAt, latest.capturedAt),
      }));
    }
    
    // Check for unusual velocity (too many ratings in short time)
    const hoursElapsed = this.getHoursBetween(previous.capturedAt, latest.capturedAt);
    if (hoursElapsed < 24 && totalIncrease > 50) {
      alerts.push(this.createAlert({
        platform,
        country,
        anomalyType: "unusual_velocity",
        severity: totalIncrease > 100 ? "high" : "medium",
        previousAvg: previous.avgRating,
        currentAvg: latest.avgRating,
        delta: ratingDelta,
        timeWindowHours: hoursElapsed,
      }));
    }
    
    // Check for review bombing pattern (many low ratings + similar timing)
    if (
      oneStarIncrease > 20 &&
      hoursElapsed < 48 &&
      ratingDelta < -0.3
    ) {
      alerts.push(this.createAlert({
        platform,
        country,
        anomalyType: "review_bombing",
        severity: "critical",
        previousAvg: previous.avgRating,
        currentAvg: latest.avgRating,
        delta: ratingDelta,
        timeWindowHours: hoursElapsed,
      }));
    }
    
    return alerts;
  }

  /**
   * Create anomaly alert
   */
  private createAlert(params: {
    platform: StorePlatform;
    country: string;
    anomalyType: ReviewAnomalyAlert["anomalyType"];
    severity: ReviewAnomalyAlert["severity"];
    previousAvg: number;
    currentAvg: number;
    delta: number;
    timeWindowHours: number;
  }): ReviewAnomalyAlert {
    return {
      id: `${params.platform}_${params.country}_${Date.now()}`,
      platform: params.platform,
      country: params.country,
      detectedAt: Date.now(),
      anomalyType: params.anomalyType,
      severity: params.severity,
      metrics: {
        previousAvg: params.previousAvg,
        currentAvg: params.currentAvg,
        delta: params.delta,
        timeWindowHours: params.timeWindowHours,
      },
      status: "new",
    };
  }

  /**
   * Save anomaly to Firestore
   */
  private async saveAnomaly(alert: ReviewAnomalyAlert): Promise<void> {
    await db
      .collection("ops")
      .doc("reviewAnomalies")
      .collection("alerts")
      .doc(alert.id)
      .set(alert);
    
    // Also log to monitoring (PACK 364)
    await this.logToMonitoring(alert);
  }

  /**
   * Notify admins of critical anomalies
   */
  private async notifyAdmins(alert: ReviewAnomalyAlert): Promise<void> {
    if (alert.severity === "critical" || alert.severity === "high") {
      // Integration with PACK 293 (Notifications)
      await db.collection("notifications").doc("admin").collection("queue").add({
        type: "review_anomaly_detected",
        severity: alert.severity,
        title: `Review Anomaly: ${alert.anomalyType}`,
        message: `${alert.platform} ${alert.country}: Rating dropped from ${alert.metrics.previousAvg.toFixed(2)} to ${alert.metrics.currentAvg.toFixed(2)}`,
        data: {
          alertId: alert.id,
          platform: alert.platform,
          country: alert.country,
        },
        createdAt: Date.now(),
        read: false,
      });
    }
  }

  /**
   * Log to monitoring system (PACK 364)
   */
  private async logToMonitoring(alert: ReviewAnomalyAlert): Promise<void> {
    await db.collection("monitoring").doc("events").collection("list").add({
      type: "review_anomaly",
      severity: alert.severity,
      platform: alert.platform,
      country: alert.country,
      anomalyType: alert.anomalyType,
      metrics: alert.metrics,
      timestamp: Date.now(),
      source: "pack367_review_defense",
    });
  }

  /**
   * Get active store listings
   */
  private async getActiveStoreListings(): Promise<Array<{
    platform: StorePlatform;
    country: string;
  }>> {
    const snapshot = await db
      .collection("ops")
      .doc("storeListings")
      .collection("listings")
      .where("status", "==", "active")
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        platform: data.platform as StorePlatform,
        country: data.country as string,
      };
    });
  }

  /**
   * Calculate hours between timestamps
   */
  private getHoursBetween(earlier: number, later: number): number {
    return (later - earlier) / (1000 * 60 * 60);
  }

  /**
   * Trigger defensive actions based on anomaly
   */
  async triggerDefensiveActions(alertId: string): Promise<void> {
    const alertDoc = await db
      .collection("ops")
      .doc("reviewAnomalies")
      .collection("alerts")
      .doc(alertId)
      .get();
    
    if (!alertDoc.exists) {
      throw new Error("Alert not found");
    }
    
    const alert = alertDoc.data() as ReviewAnomalyAlert;
    
    // If critical, enable conservative feature flags (PACK 365)
    if (alert.severity === "critical") {
      await this.enableConservativeMode(alert.platform, alert.country);
    }
    
    // Create support incident (PACK 300A)
    await this.createSupportIncident(alert);
    
    // Log to audit system (PACK 296)
    await this.logToAudit({
      action: "defensive_actions_triggered",
      alertId: alert.id,
      severity: alert.severity,
      platform: alert.platform,
      country: alert.country,
    });
  }

  /**
   * Enable conservative mode (reduce aggressive features)
   */
  private async enableConservativeMode(
    platform: StorePlatform,
    country: string
  ): Promise<void> {
    // Integration with PACK 365 (Feature Flags)
    const flagUpdates = {
      [`${platform}_${country}_aggressive_notifications`]: false,
      [`${platform}_${country}_promotional_intensity`]: "low",
      [`${platform}_${country}_review_prompts`]: false,
    };
    
    await db.collection("ops").doc("featureFlags").update({
      ...flagUpdates,
      lastUpdatedAt: Date.now(),
      lastUpdatedBy: "system_review_defense",
      reason: "Review anomaly detected - enabling conservative mode",
    });
  }

  /**
   * Create support incident
   */
  private async createSupportIncident(alert: ReviewAnomalyAlert): Promise<void> {
    await db.collection("support").doc("incidents").collection("list").add({
      type: "review_anomaly",
      severity: alert.severity,
      status: "new",
      title: `Review Anomaly: ${alert.anomalyType}`,
      description: `Platform: ${alert.platform}, Country: ${alert.country}\nRating dropped from ${alert.metrics.previousAvg.toFixed(2)} to ${alert.metrics.currentAvg.toFixed(2)}`,
      metadata: {
        alertId: alert.id,
        platform: alert.platform,
        country: alert.country,
        metrics: alert.metrics,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Log to audit system (PACK 296)
   */
  private async logToAudit(data: Record<string, any>): Promise<void> {
    await db.collection("audit").doc("logs").collection("entries").add({
      ...data,
      timestamp: Date.now(),
      source: "pack367_review_defense",
    });
  }

  /**
   * Update anomaly status
   */
  async updateAnomalyStatus(
    alertId: string,
    status: ReviewAnomalyAlert["status"],
    adminId?: string,
    notes?: string
  ): Promise<void> {
    const updates: Partial<ReviewAnomalyAlert> = {
      status,
      assignedTo: adminId,
      notes,
    };
    
    if (status === "resolved") {
      updates.resolvedAt = Date.now();
    }
    
    await db
      .collection("ops")
      .doc("reviewAnomalies")
      .collection("alerts")
      .doc(alertId)
      .update(updates);
  }
}

export const reviewDefenseService = new ReviewDefenseService();

/**
 * Cloud Function to run periodic anomaly detection
 * Schedule: Every 6 hours
 */
export async function scheduledReviewAnomalyDetection(): Promise<void> {
  console.log("Starting scheduled review anomaly detection...");
  
  const alerts = await reviewDefenseService.detectStoreReviewAnomalies();
  
  console.log(`Detection complete. Found ${alerts.length} anomalies.`);
  
  // Trigger defensive actions for critical alerts
  for (const alert of alerts) {
    if (alert.severity === "critical") {
      await reviewDefenseService.triggerDefensiveActions(alert.id);
    }
  }
}
