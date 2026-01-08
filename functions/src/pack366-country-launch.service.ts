/**
 * ✅ PACK 366 — Country Launch Service
 * Manages country-by-country rollout, launch stages, and access control
 */

import * as admin from "firebase-admin";
import {
  CountryLaunchConfig,
  LaunchStageEvent,
  LaunchReadinessCheck,
  CountryLaunchStats,
  LaunchQueueEntry,
  VIPAccessConfig,
} from "./pack366-country-launch.types";

const db = admin.firestore();

export class CountryLaunchService {
  /**
   * Get country launch configuration
   */
  static async getCountryConfig(
    isoCode: string
  ): Promise<CountryLaunchConfig | null> {
    const doc = await db
      .collection("ops")
      .doc("countryLaunch")
      .collection("countries")
      .doc(isoCode.toUpperCase())
      .get();

    if (!doc.exists) return null;
    return doc.data() as CountryLaunchConfig;
  }

  /**
   * Set country launch configuration
   */
  static async setCountryConfig(
    config: CountryLaunchConfig
  ): Promise<void> {
    config.updatedAt = Date.now();
    await db
      .collection("ops")
      .doc("countryLaunch")
      .collection("countries")
      .doc(config.isoCode.toUpperCase())
      .set(config, { merge: true });
  }

  /**
   * Check if user can access based on country launch stage
   */
  static async canUserAccess(
    userId: string,
    country: string,
    membershipTier?: "standard" | "vip" | "royal"
  ): Promise<{ allowed: boolean; reason?: string; queueRequired?: boolean }> {
    // Get country config
    const countryConfig = await this.getCountryConfig(country);
    if (!countryConfig) {
      return { allowed: false, reason: "country_not_configured" };
    }

    // Check if country is enabled
    if (!countryConfig.enabled) {
      return { allowed: false, reason: "country_disabled" };
    }

    // Check launch stage
    switch (countryConfig.launchStage) {
      case "locked":
        return { allowed: false, reason: "country_locked" };

      case "soft":
        // Invite-only access - check whitelist
        const vipConfig = await this.getVIPAccessConfig();
        if (vipConfig.whitelistedUserIds.includes(userId)) {
          return { allowed: true };
        }
        return { allowed: false, reason: "invite_only" };

      case "vip":
        // VIP/Royal early access
        if (membershipTier === "royal" || membershipTier === "vip") {
          return { allowed: true };
        }
        return { allowed: false, reason: "vip_only" };

      case "public":
        // Check daily registration limits
        if (countryConfig.maxNewUsersPerDay) {
          const todayStats = await this.getTodayStats(country);
          if (todayStats.registrations >= countryConfig.maxNewUsersPerDay) {
            return { allowed: false, reason: "daily_limit_reached", queueRequired: true };
          }
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: "unknown_stage" };
    }
  }

  /**
   * Transition country to new launch stage
   */
  static async transitionCountryStage(
    isoCode: string,
    newStage: CountryLaunchConfig["launchStage"],
    triggeredBy: "admin" | "auto" | "ad_campaign",
    triggeredByUserId?: string,
    reason?: string
  ): Promise<void> {
    const config = await this.getCountryConfig(isoCode);
    if (!config) {
      throw new Error(`Country ${isoCode} not configured`);
    }

    const previousStage = config.launchStage;
    config.launchStage = newStage;
    
    // Set launch timestamp for public stage
    if (newStage === "public" && !config.launchedAt) {
      config.launchedAt = Date.now();
    }

    await this.setCountryConfig(config);

    // Log transition event
    const event: LaunchStageEvent = {
      id: `${isoCode}_${Date.now()}`,
      country: isoCode,
      previousStage,
      newStage,
      triggeredBy,
      triggeredByUserId,
      reason: reason || `Transition to ${newStage}`,
      timestamp: Date.now(),
    };

    await db
      .collection("ops")
      .doc("launchEvents")
      .collection("events")
      .doc(event.id)
      .set(event);

    console.log(`[PACK 366] Country ${isoCode} transitioned: ${previousStage} → ${newStage}`);
  }

  /**
   * Get VIP access configuration
   */
  static async getVIPAccessConfig(): Promise<VIPAccessConfig> {
    const doc = await db.collection("ops").doc("vipAccess").get();
    
    if (!doc.exists) {
      // Return defaults
      return {
        vipPreAccessEnabled: true,
        royalPreAccessEnabled: true,
        vipEarlyAccessHours: 48,
        royalEarlyAccessHours: 72,
        betaFoundersEnabled: true,
        whitelistedUserIds: [],
        blacklistedUserIds: [],
      };
    }

    return doc.data() as VIPAccessConfig;
  }

  /**
   * Update VIP access configuration
   */
  static async updateVIPAccessConfig(
    config: Partial<VIPAccessConfig>
  ): Promise<void> {
    await db.collection("ops").doc("vipAccess").set(config, { merge: true });
  }

  /**
   * Check if user has VIP/Royal early access
   */
  static async hasEarlyAccess(
    userId: string,
    membershipTier?: "standard" | "vip" | "royal"
  ): Promise<boolean> {
    const config = await this.getVIPAccessConfig();

    // Check blacklist first
    if (config.blacklistedUserIds.includes(userId)) {
      return false;
    }

    // Check whitelist
    if (config.whitelistedUserIds.includes(userId)) {
      return true;
    }

    // Check beta founders
    if (config.betaFoundersEnabled) {
      // Could check a beta founders collection here
    }

    // Check VIP/Royal membership
    if (membershipTier === "royal" && config.royalPreAccessEnabled) {
      return true;
    }
    if (membershipTier === "vip" && config.vipPreAccessEnabled) {
      return true;
    }

    return false;
  }

  /**
   * Get all country configurations
   */
  static async getAllCountries(): Promise<CountryLaunchConfig[]> {
    const snapshot = await db
      .collection("ops")
      .doc("countryLaunch")
      .collection("countries")
      .get();

    return snapshot.docs.map((doc) => doc.data() as CountryLaunchConfig);
  }

  /**
   * Get countries by launch stage
   */
  static async getCountriesByStage(
    stage: CountryLaunchConfig["launchStage"]
  ): Promise<CountryLaunchConfig[]> {
    const snapshot = await db
      .collection("ops")
      .doc("countryLaunch")
      .collection("countries")
      .where("launchStage", "==", stage)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CountryLaunchConfig);
  }

  /**
   * Perform launch readiness check
   */
  static async checkLaunchReadiness(): Promise<LaunchReadinessCheck> {
    const checks = {
      storeReady: false,
      countriesConfigured: false,
      trafficLimitsSet: false,
      vipAccessConfigured: false,
      rollbackSystemActive: false,
    };
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check store readiness
    const storeDoc = await db.collection("ops").doc("storeReadiness").get();
    if (storeDoc.exists) {
      const store = storeDoc.data();
      if (store?.android?.ready && store?.ios?.ready) {
        checks.storeReady = true;
      } else {
        blockers.push("App stores not ready");
      }
    } else {
      blockers.push("Store readiness not configured");
    }

    // Check countries configured
    const countries = await this.getAllCountries();
    if (countries.length > 0) {
      checks.countriesConfigured = true;
    } else {
      blockers.push("No countries configured");
    }

    // Check traffic limits
    const trafficDoc = await db
      .collection("ops")
      .doc("trafficLimits")
      .collection("config")
      .doc("global")
      .get();
    if (trafficDoc.exists) {
      checks.trafficLimitsSet = true;
    } else {
      warnings.push("Traffic limits not configured - using defaults");
    }

    // Check VIP access
    const vipDoc = await db.collection("ops").doc("vipAccess").get();
    if (vipDoc.exists) {
      checks.vipAccessConfigured = true;
    } else {
      warnings.push("VIP access not configured - using defaults");
    }

    // Check rollback system
    const rollbackDoc = await db.collection("ops").doc("rollback").collection("status").doc("current").get();
    if (rollbackDoc.exists) {
      checks.rollbackSystemActive = true;
    } else {
      warnings.push("Rollback system not initialized");
    }

    const ready = Object.values(checks).every((check) => check);

    return {
      ready,
      checks,
      blockers,
      warnings,
      checkedAt: Date.now(),
    };
  }

  /**
   * Get today's launch statistics for a country
   */
  static async getTodayStats(isoCode: string): Promise<CountryLaunchStats> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const doc = await db
      .collection("analytics")
      .doc("countryLaunch")
      .collection(isoCode.toUpperCase())
      .doc(today)
      .get();

    if (!doc.exists) {
      return {
        isoCode: isoCode.toUpperCase(),
        date: today,
        launchStage: "locked",
        registrations: 0,
        activeUsers: 0,
        revenue: 0,
        chatsSent: 0,
        profileViews: 0,
        walletPurchases: 0,
        rateLimitHits: 0,
        queuedUsers: 0,
        averageQueueTimeSeconds: 0,
      };
    }

    return doc.data() as CountryLaunchStats;
  }

  /**
   * Increment today's stats
   */
  static async incrementStat(
    isoCode: string,
    stat: keyof Omit<CountryLaunchStats, "isoCode" | "date" | "launchStage" | "averageQueueTimeSeconds">,
    value: number = 1
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const ref = db
      .collection("analytics")
      .doc("countryLaunch")
      .collection(isoCode.toUpperCase())
      .doc(today);

    await ref.set(
      {
        [stat]: admin.firestore.FieldValue.increment(value),
      },
      { merge: true }
    );
  }

  /**
   * Add user to launch queue
   */
  static async addToQueue(
    userId: string,
    country: string,
    membershipTier?: "standard" | "vip" | "royal"
  ): Promise<LaunchQueueEntry> {
    // Calculate priority (higher tier = higher priority)
    let priority = 100;
    if (membershipTier === "vip") priority = 200;
    if (membershipTier === "royal") priority = 300;

    // Get current queue length
    const queueSnapshot = await db
      .collection("ops")
      .doc("launchQueue")
      .collection("entries")
      .where("country", "==", country)
      .where("status", "==", "waiting")
      .get();

    const position = queueSnapshot.size + 1;

    const entry: LaunchQueueEntry = {
      userId,
      country,
      enqueuedAt: Date.now(),
      estimatedWaitSeconds: position * 30, // Estimate 30s per user
      position,
      membershipTier,
      priority,
      status: "waiting",
    };

    await db
      .collection("ops")
      .doc("launchQueue")
      .collection("entries")
      .doc(userId)
      .set(entry);

    return entry;
  }

  /**
   * Get queue position for user
   */
  static async getQueuePosition(userId: string): Promise<LaunchQueueEntry | null> {
    const doc = await db
      .collection("ops")
      .doc("launchQueue")
      .collection("entries")
      .doc(userId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as LaunchQueueEntry;
  }

  /**
   * Admit next users from queue
   */
  static async processQueue(country: string, count: number = 10): Promise<void> {
    const queueSnapshot = await db
      .collection("ops")
      .doc("launchQueue")
      .collection("entries")
      .where("country", "==", country)
      .where("status", "==", "waiting")
      .orderBy("priority", "desc")
      .orderBy("enqueuedAt", "asc")
      .limit(count)
      .get();

    const batch = db.batch();
    const now = Date.now();

    queueSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "admitted",
        admittedAt: now,
      });
    });

    await batch.commit();
    console.log(`[PACK 366] Admitted ${queueSnapshot.size} users from queue in ${country}`);
  }
}
