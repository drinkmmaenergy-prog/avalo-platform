/**
 * ✅ PACK 366 — Store Readiness & Version Enforcement
 * Manages App Store / Google Play readiness gates and version enforcement
 */

import * as admin from "firebase-admin";
import {
  StoreReadinessConfig,
  AppVersionEnforcement,
} from "./pack366-country-launch.types";

const db = admin.firestore();

export class StoreReadinessService {
  /**
   * Get store readiness configuration
   */
  static async getStoreReadiness(): Promise<StoreReadinessConfig> {
    const doc = await db.collection("ops").doc("storeReadiness").get();

    if (!doc.exists) {
      // Return default locked state
      return {
        android: {
          ready: false,
          minVersion: "1.0.0",
          currentVersion: "1.0.0",
        },
        ios: {
          ready: false,
          minVersion: "1.0.0",
          currentVersion: "1.0.0",
        },
        webApp: {
          ready: false,
          version: "1.0.0",
        },
        globalLock: true,
        lockReason: "Initial setup - stores not configured",
      };
    }

    return doc.data() as StoreReadinessConfig;
  }

  /**
   * Update store readiness configuration
   */
  static async updateStoreReadiness(
    config: Partial<StoreReadinessConfig>
  ): Promise<void> {
    await db
      .collection("ops")
      .doc("storeReadiness")
      .set(config, { merge: true });

    console.log("[PACK 366] Store readiness updated:", config);
  }

  /**
   * Set Android store readiness
   */
  static async setAndroidReady(
    ready: boolean,
    currentVersion?: string,
    reviewStatus?: "pending" | "approved" | "rejected",
    blockedReasons?: string[]
  ): Promise<void> {
    const update: any = {
      "android.ready": ready,
    };

    if (currentVersion) update["android.currentVersion"] = currentVersion;
    if (reviewStatus) update["android.reviewStatus"] = reviewStatus;
    if (blockedReasons) update["android.blockedReasons"] = blockedReasons;
    if (ready) update["android.releaseDate"] = Date.now();

    await this.updateStoreReadiness(update);
  }

  /**
   * Set iOS store readiness
   */
  static async setIosReady(
    ready: boolean,
    currentVersion?: string,
    reviewStatus?: "pending" | "approved" | "rejected",
    blockedReasons?: string[]
  ): Promise<void> {
    const update: any = {
      "ios.ready": ready,
    };

    if (currentVersion) update["ios.currentVersion"] = currentVersion;
    if (reviewStatus) update["ios.reviewStatus"] = reviewStatus;
    if (blockedReasons) update["ios.blockedReasons"] = blockedReasons;
    if (ready) update["ios.releaseDate"] = Date.now();

    await this.updateStoreReadiness(update);
  }

  /**
   * Set web app readiness
   */
  static async setWebAppReady(
    ready: boolean,
    version?: string
  ): Promise<void> {
    const update: any = {
      "webApp.ready": ready,
    };

    if (version) update["webApp.version"] = version;
    if (ready) update["webApp.deployedAt"] = Date.now();

    await this.updateStoreReadiness(update);
  }

  /**
   * Check if production launch is allowed
   */
  static async canLaunchProduction(): Promise<{
    allowed: boolean;
    blockers: string[];
  }> {
    const config = await this.getStoreReadiness();
    const blockers: string[] = [];

    // Check global lock
    if (config.globalLock) {
      blockers.push(
        config.lockReason || "Global launch lock is enabled"
      );
    }

    // Check Android readiness
    if (!config.android.ready) {
      blockers.push(
        `Android not ready${
          config.android.reviewStatus
            ? ` (${config.android.reviewStatus})`
            : ""
        }`
      );
      if (config.android.blockedReasons) {
        blockers.push(...config.android.blockedReasons);
      }
    }

    // Check iOS readiness
    if (!config.ios.ready) {
      blockers.push(
        `iOS not ready${
          config.ios.reviewStatus ? ` (${config.ios.reviewStatus})` : ""
        }`
      );
      if (config.ios.blockedReasons) {
        blockers.push(...config.ios.blockedReasons);
      }
    }

    return {
      allowed: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Emergency global lock
   */
  static async enableGlobalLock(reason: string): Promise<void> {
    await this.updateStoreReadiness({
      globalLock: true,
      lockReason: reason,
    });

    console.log(`[PACK 366] 🚨 Global launch lock enabled: ${reason}`);
  }

  /**
   * Remove global lock
   */
  static async disableGlobalLock(): Promise<void> {
    await this.updateStoreReadiness({
      globalLock: false,
      lockReason: undefined,
    });

    console.log("[PACK 366] ✅ Global launch lock disabled");
  }

  /**
   * Get app version enforcement configuration
   */
  static async getVersionEnforcement(): Promise<AppVersionEnforcement> {
    const doc = await db.collection("ops").doc("appVersions").get();

    if (!doc.exists) {
      // Return defaults
      return {
        minAndroidVersion: "1.0.0",
        minIosVersion: "1.0.0",
        deprecatedVersions: [],
        forceUpgradeModal: true,
        revenueDisabledVersions: [],
        gracePeriodDays: 7,
        updatedAt: Date.now(),
      };
    }

    return doc.data() as AppVersionEnforcement;
  }

  /**
   * Update version enforcement
   */
  static async updateVersionEnforcement(
    config: Partial<AppVersionEnforcement>
  ): Promise<void> {
    config.updatedAt = Date.now();
    await db
      .collection("ops")
      .doc("appVersions")
      .set(config, { merge: true });

    console.log("[PACK 366] Version enforcement updated:", config);
  }

  /**
   * Set minimum required versions
   */
  static async setMinimumVersions(
    androidVersion: string,
    iosVersion: string
  ): Promise<void> {
    await this.updateVersionEnforcement({
      minAndroidVersion: androidVersion,
      minIosVersion: iosVersion,
    });
  }

  /**
   * Add deprecated version
   */
  static async deprecateVersion(version: string): Promise<void> {
    const config = await this.getVersionEnforcement();
    if (!config.deprecatedVersions.includes(version)) {
      config.deprecatedVersions.push(version);
      await this.updateVersionEnforcement({
        deprecatedVersions: config.deprecatedVersions,
      });
    }
  }

  /**
   * Disable revenue for specific versions
   */
  static async disableRevenueForVersion(version: string): Promise<void> {
    const config = await this.getVersionEnforcement();
    if (!config.revenueDisabledVersions.includes(version)) {
      config.revenueDisabledVersions.push(version);
      await this.updateVersionEnforcement({
        revenueDisabledVersions: config.revenueDisabledVersions,
      });
    }
  }

  /**
   * Check if app version is allowed
   */
  static async isVersionAllowed(
    platform: "android" | "ios",
    version: string
  ): Promise<{
    allowed: boolean;
    requiresUpgrade: boolean;
    revenueDisabled: boolean;
    message?: string;
  }> {
    const config = await this.getVersionEnforcement();
    const minVersion =
      platform === "android"
        ? config.minAndroidVersion
        : config.minIosVersion;

    // Check if version is below minimum
    if (this.compareVersions(version, minVersion) < 0) {
      return {
        allowed: false,
        requiresUpgrade: true,
        revenueDisabled: true,
        message: `Please upgrade to version ${minVersion} or higher`,
      };
    }

    // Check if version is deprecated
    if (config.deprecatedVersions.includes(version)) {
      return {
        allowed: true,
        requiresUpgrade: config.forceUpgradeModal,
        revenueDisabled: false,
        message: "A newer version is available. Please upgrade soon.",
      };
    }

    // Check if revenue is disabled
    if (config.revenueDisabledVersions.includes(version)) {
      return {
        allowed: true,
        requiresUpgrade: false,
        revenueDisabled: true,
        message: "In-app purchases are disabled for this version. Please upgrade.",
      };
    }

    return {
      allowed: true,
      requiresUpgrade: false,
      revenueDisabled: false,
    };
  }

  /**
   * Compare version strings (semver-style)
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }

  /**
   * Get current store status summary
   */
  static async getStoreSummary(): Promise<{
    android: {
      ready: boolean;
      version: string;
      status: string;
    };
    ios: {
      ready: boolean;
      version: string;
      status: string;
    };
    webApp: {
      ready: boolean;
      version: string;
    };
    canLaunch: boolean;
    blockers: string[];
  }> {
    const config = await this.getStoreReadiness();
    const launchCheck = await this.canLaunchProduction();

    return {
      android: {
        ready: config.android.ready,
        version: config.android.currentVersion,
        status: config.android.reviewStatus || "unknown",
      },
      ios: {
        ready: config.ios.ready,
        version: config.ios.currentVersion,
        status: config.ios.reviewStatus || "unknown",
      },
      webApp: {
        ready: config.webApp.ready,
        version: config.webApp.version,
      },
      canLaunch: launchCheck.allowed,
      blockers: launchCheck.blockers,
    };
  }
}
