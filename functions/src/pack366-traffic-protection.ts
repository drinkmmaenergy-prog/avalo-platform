/**
 * ✅ PACK 366 — Traffic Flood Protection
 * Anti-overload controls for launch day traffic spikes
 */

import * as admin from "firebase-admin";
import { TrafficLimitsConfig } from "./pack366-country-launch.types";

const db = admin.firestore();

export class TrafficProtectionService {
  /**
   * Get traffic limits configuration
   */
  static async getTrafficLimits(): Promise<TrafficLimitsConfig> {
    const doc = await db
      .collection("ops")
      .doc("trafficLimits")
      .collection("config")
      .doc("global")
      .get();

    if (!doc.exists) {
      // Return safe defaults
      return {
        maxRegistrationsPerHour: 1000,
        maxChatsPerSecond: 100,
        maxWalletPurchasesPerMinute: 50,
        maxProfileViewsPerSecond: 500,
        dynamicQueueEnabled: true,
        queueMaxWaitMinutes: 10,
        alertThresholds: {
          registrations: 800,
          chats: 80,
          purchases: 40,
          profileViews: 400,
        },
        rateLimitByCountry: {},
        updatedAt: Date.now(),
      };
    }

    return doc.data() as TrafficLimitsConfig;
  }

  /**
   * Update traffic limits
   */
  static async updateTrafficLimits(
    config: Partial<TrafficLimitsConfig>
  ): Promise<void> {
    config.updatedAt = Date.now();
    await db
      .collection("ops")
      .doc("trafficLimits")
      .collection("config")
      .doc("global")
      .set(config, { merge: true });

    console.log("[PACK 366] Traffic limits updated:", config);
  }

  /**
   * Set country-specific rate limits
   */
  static async setCountryRateLimit(
    isoCode: string,
    registrationsPerHour: number,
    enabled: boolean = true
  ): Promise<void> {
    const config = await this.getTrafficLimits();
    config.rateLimitByCountry[isoCode] = {
      registrationsPerHour,
      enabled,
    };
    await this.updateTrafficLimits({
      rateLimitByCountry: config.rateLimitByCountry,
    });
  }

  /**
   * Check if registrations are allowed (rate limit)
   */
  static async canRegister(country?: string): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number; // seconds
  }> {
    const config = await this.getTrafficLimits();
    const now = Date.now();
    const hourAgo = now - 3600000; // 1 hour in ms

    // Check country-specific limit first
    if (country && config.rateLimitByCountry[country]?.enabled) {
      const countryLimit = config.rateLimitByCountry[country];
      const countryCount = await this.getRegistrationCount(country, hourAgo);

      if (countryCount >= countryLimit.registrationsPerHour) {
        return {
          allowed: false,
          reason: "country_rate_limit_exceeded",
          retryAfter: 3600, // Try again in 1 hour
        };
      }
    }

    // Check global limit
    const globalCount = await this.getRegistrationCount(undefined, hourAgo);
    if (globalCount >= config.maxRegistrationsPerHour) {
      // Queue mode if enabled
      if (config.dynamicQueueEnabled) {
        return {
          allowed: false,
          reason: "queue_required",
          retryAfter: 60, // Check queue status in 1 minute
        };
      }

      return {
        allowed: false,
        reason: "global_rate_limit_exceeded",
        retryAfter: 3600,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if chat sending is allowed (rate limit)
   */
  static async canSendChat(): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const config = await this.getTrafficLimits();
    const now = Date.now();
    const secondAgo = now - 1000; // 1 second in ms

    const count = await this.getChatCount(secondAgo);
    if (count >= config.maxChatsPerSecond) {
      return {
        allowed: false,
        reason: "chat_rate_limit_exceeded",
        retryAfter: 1,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if wallet purchase is allowed (rate limit)
   */
  static async canMakePurchase(): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const config = await this.getTrafficLimits();
    const now = Date.now();
    const minuteAgo = now - 60000; // 1 minute in ms

    const count = await this.getPurchaseCount(minuteAgo);
    if (count >= config.maxWalletPurchasesPerMinute) {
      return {
        allowed: false,
        reason: "purchase_rate_limit_exceeded",
        retryAfter: 60,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if profile view is allowed (rate limit)
   */
  static async canViewProfile(): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const config = await this.getTrafficLimits();
    const now = Date.now();
    const secondAgo = now - 1000; // 1 second in ms

    const count = await this.getProfileViewCount(secondAgo);
    if (count >= config.maxProfileViewsPerSecond) {
      return {
        allowed: false,
        reason: "profile_view_rate_limit_exceeded",
        retryAfter: 1,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a registration (for rate limiting)
   */
  static async recordRegistration(userId: string, country: string): Promise<void> {
    const now = Date.now();
    await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("registrations")
      .doc(userId)
      .set({
        timestamp: now,
        country,
      });

    // Check if we should alert
    await this.checkAlertThresholds("registrations");
  }

  /**
   * Record a chat (for rate limiting)
   */
  static async recordChat(chatId: string): Promise<void> {
    const now = Date.now();
    await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("chats")
      .doc(chatId)
      .set({
        timestamp: now,
      });

    await this.checkAlertThresholds("chats");
  }

  /**
   * Record a purchase (for rate limiting)
   */
  static async recordPurchase(purchaseId: string): Promise<void> {
    const now = Date.now();
    await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("purchases")
      .doc(purchaseId)
      .set({
        timestamp: now,
      });

    await this.checkAlertThresholds("purchases");
  }

  /**
   * Record a profile view (for rate limiting)
   */
  static async recordProfileView(viewId: string): Promise<void> {
    const now = Date.now();
    await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("profileViews")
      .doc(viewId)
      .set({
        timestamp: now,
      });

    await this.checkAlertThresholds("profileViews");
  }

  /**
   * Get registration count since timestamp
   */
  private static async getRegistrationCount(
    country?: string,
    since?: number
  ): Promise<number> {
    let query: admin.firestore.Query = db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("registrations");

    if (since) {
      query = query.where("timestamp", ">=", since);
    }

    if (country) {
      query = query.where("country", "==", country);
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * Get chat count since timestamp
   */
  private static async getChatCount(since: number): Promise<number> {
    const snapshot = await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("chats")
      .where("timestamp", ">=", since)
      .count()
      .get();

    return snapshot.data().count;
  }

  /**
   * Get purchase count since timestamp
   */
  private static async getPurchaseCount(since: number): Promise<number> {
    const snapshot = await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("purchases")
      .where("timestamp", ">=", since)
      .count()
      .get();

    return snapshot.data().count;
  }

  /**
   * Get profile view count since timestamp
   */
  private static async getProfileViewCount(since: number): Promise<number> {
    const snapshot = await db
      .collection("ops")
      .doc("trafficMetrics")
      .collection("profileViews")
      .where("timestamp", ">=", since)
      .count()
      .get();

    return snapshot.data().count;
  }

  /**
   * Check if alert thresholds are exceeded
   */
  private static async checkAlertThresholds(
    metric: "registrations" | "chats" | "purchases" | "profileViews"
  ): Promise<void> {
    const config = await this.getTrafficLimits();
    const threshold = config.alertThresholds[metric];

    let count = 0;
    const now = Date.now();

    switch (metric) {
      case "registrations":
        count = await this.getRegistrationCount(undefined, now - 3600000);
        break;
      case "chats":
        count = await this.getChatCount(now - 1000);
        break;
      case "purchases":
        count = await this.getPurchaseCount(now - 60000);
        break;
      case "profileViews":
        count = await this.getProfileViewCount(now - 1000);
        break;
    }

    if (count >= threshold) {
      console.warn(
        `[PACK 366] ⚠️ Traffic alert: ${metric} threshold exceeded (${count}/${threshold})`
      );

      // Log alert
      await db
        .collection("ops")
        .doc("trafficAlerts")
        .collection("alerts")
        .add({
          metric,
          count,
          threshold,
          timestamp: now,
        });
    }
  }

  /**
   * Get current traffic statistics
   */
  static async getTrafficStats(): Promise<{
    registrationsLastHour: number;
    chatsLastSecond: number;
    purchasesLastMinute: number;
    profileViewsLastSecond: number;
    limits: TrafficLimitsConfig;
  }> {
    const config = await this.getTrafficLimits();
    const now = Date.now();

    const [
      registrationsLastHour,
      chatsLastSecond,
      purchasesLastMinute,
      profileViewsLastSecond,
    ] = await Promise.all([
      this.getRegistrationCount(undefined, now - 3600000),
      this.getChatCount(now - 1000),
      this.getPurchaseCount(now - 60000),
      this.getProfileViewCount(now - 1000),
    ]);

    return {
      registrationsLastHour,
      chatsLastSecond,
      purchasesLastMinute,
      profileViewsLastSecond,
      limits: config,
    };
  }

  /**
   * Enable dynamic queue mode
   */
  static async enableQueueMode(maxWaitMinutes: number = 10): Promise<void> {
    await this.updateTrafficLimits({
      dynamicQueueEnabled: true,
      queueMaxWaitMinutes: maxWaitMinutes,
    });

    console.log(`[PACK 366] Queue mode enabled (max wait: ${maxWaitMinutes}m)`);
  }

  /**
   * Disable dynamic queue mode
   */
  static async disableQueueMode(): Promise<void> {
    await this.updateTrafficLimits({
      dynamicQueueEnabled: false,
    });

    console.log("[PACK 366] Queue mode disabled");
  }

  /**
   * Emergency traffic throttle (reduce all limits by percentage)
   */
  static async emergencyThrottle(percentage: number): Promise<void> {
    const config = await this.getTrafficLimits();
    const multiplier = (100 - percentage) / 100;

    await this.updateTrafficLimits({
      maxRegistrationsPerHour: Math.floor(
        config.maxRegistrationsPerHour * multiplier
      ),
      maxChatsPerSecond: Math.floor(config.maxChatsPerSecond * multiplier),
      maxWalletPurchasesPerMinute: Math.floor(
        config.maxWalletPurchasesPerMinute * multiplier
      ),
      maxProfileViewsPerSecond: Math.floor(
        config.maxProfileViewsPerSecond * multiplier
      ),
    });

    console.log(
      `[PACK 366] 🚨 Emergency throttle applied: ${percentage}% reduction`
    );
  }
}
