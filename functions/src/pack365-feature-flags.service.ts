/**
 * PACK 365 — Feature Flags Service
 *
 * Purpose: Runtime feature flag checks, rollout management, and kill-switch controls
 * Phase: ETAP B — Pre-Launch Hardening
 */

import * as admin from "firebase-admin";
import {
  FeatureFlag,
  FeatureFlagCheckContext,
  FeatureFlagHistory,
  FeatureFlagChange,
  CRITICAL_KILL_SWITCHES,
  DEFAULT_FEATURE_FLAGS,
  FeatureEnvironment,
} from "./pack365-feature-flags.types";

// Re-export for use in other modules
export { CRITICAL_KILL_SWITCHES };

const db = admin.firestore();

/**
 * Feature Flag Service
 * Provides instant operational control over features without redeployment
 */
export class FeatureFlagService {
  private static cache = new Map<string, FeatureFlag>();
  private static cacheExpiry = new Map<string, number>();
  private static readonly CACHE_TTL = 60 * 1000; // 1 minute

  /**
   * Check if a feature is enabled for the given context
   */
  static async isFeatureEnabled(
    key: string,
    context: FeatureFlagCheckContext = {}
  ): Promise<boolean> {
    try {
      const flag = await this.getFeatureFlag(key, context.environment);
      
      if (!flag) {
        // Feature flag doesn't exist, default to disabled
        return false;
      }

      // Check if flag is globally disabled
      if (!flag.enabled) {
        return false;
      }

      // Admin bypass
      if (context.isAdmin) {
        return true;
      }

      // Check global freeze
      const globalFreeze = await this.getFeatureFlag(
        CRITICAL_KILL_SWITCHES.GLOBAL_FREEZE,
        context.environment
      );
      if (globalFreeze?.enabled) {
        // Global freeze is active - only allow critical systems
        if (!this.isCriticalSystem(key)) {
          return false;
        }
      }

      // Check if production launch is enabled
      if (context.environment === "prod") {
        const productionLaunch = await this.getFeatureFlag(
          CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH,
          context.environment
        );
        if (!productionLaunch?.enabled && !context.isAdmin) {
          return false;
        }
      }

      // Check region restrictions
      if (flag.regions && flag.regions.length > 0 && context.region) {
        if (!flag.regions.includes(context.region)) {
          return false;
        }
      }

      // Check user segment restrictions
      if (flag.userSegments && flag.userSegments.length > 0 && context.segment) {
        if (!flag.userSegments.includes(context.segment)) {
          return false;
        }
      }

      // Check rollout percentage
      if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
        if (!context.userId) {
          return false;
        }
        
        // Deterministic hash-based rollout
        const userHash = this.hashUserId(context.userId);
        const threshold = flag.rolloutPercent / 100;
        
        if (userHash > threshold) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`[FeatureFlags] Error checking flag "${key}":`, error);
      // Fail closed - if we can't check, default to disabled
      return false;
    }
  }

  /**
   * Get feature flag by key
   */
  static async getFeatureFlag(
    key: string,
    environment: FeatureEnvironment = "prod"
  ): Promise<FeatureFlag | null> {
    try {
      // Check cache first
      const cacheKey = `${key}_${environment}`;
      const cachedFlag = this.cache.get(cacheKey);
      const expiry = this.cacheExpiry.get(cacheKey);
      
      if (cachedFlag && expiry && Date.now() < expiry) {
        return cachedFlag;
      }

      // Fetch from database
      const doc = await db
        .collection("config")
        .doc("featureFlags")
        .collection("flags")
        .doc(key)
        .get();

      if (!doc.exists) {
        return null;
      }

      const flag = doc.data() as FeatureFlag;
      
      // Only return if matches environment
      if (flag.environment !== environment) {
        return null;
      }

      // Update cache
      this.cache.set(cacheKey, flag);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return flag;
    } catch (error) {
      console.error(`[FeatureFlags] Error fetching flag "${key}":`, error);
      return null;
    }
  }

  /**
   * Set or update a feature flag
   */
  static async setFeatureFlag(
    flag: FeatureFlag,
    adminId: string,
    reason?: string
  ): Promise<void> {
    try {
      const flagRef = db
        .collection("config")
        .doc("featureFlags")
        .collection("flags")
        .doc(flag.key);

      // Get previous state for history
      const previousDoc = await flagRef.get();
      const previousState = previousDoc.exists
        ? (previousDoc.data() as FeatureFlag)
        : null;

      // Validate critical flags
      if (this.isCriticalFlag(flag.key)) {
        await this.validateCriticalFlagChange(flag);
      }

      // Update flag
      const updatedFlag: FeatureFlag = {
        ...flag,
        updatedAt: Date.now(),
        updatedBy: adminId,
        changeReason: reason,
      };

      await flagRef.set(updatedFlag);

      // Record in history
      await this.recordFlagChange(flag.key, previousState, updatedFlag, adminId, reason);

      // Clear cache
      const cacheKey = `${flag.key}_${flag.environment}`;
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);

      console.log(`[FeatureFlags] Flag "${flag.key}" updated by ${adminId}`);
    } catch (error) {
      console.error(`[FeatureFlags] Error setting flag "${flag.key}":`, error);
      throw error;
    }
  }

  /**
   * Get all feature flags
   */
  static async getAllFlags(
    environment?: FeatureEnvironment
  ): Promise<FeatureFlag[]> {
    try {
      let query = db
        .collection("config")
        .doc("featureFlags")
        .collection("flags");

      if (environment) {
        query = query.where("environment", "==", environment) as FirebaseFirestore.Query;
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc) => doc.data() as FeatureFlag);
    } catch (error) {
      console.error(`[FeatureFlags] Error fetching all flags:`, error);
      return [];
    }
  }

  /**
   * Get flag change history
   */
  static async getFlagHistory(
    flagKey: string,
    limit = 50
  ): Promise<FeatureFlagHistory | null> {
    try {
      const doc = await db
        .collection("config")
        .doc("featureFlags")
        .collection("history")
        .doc(flagKey)
        .get();

      if (!doc.exists) {
        return null;
      }

      const history = doc.data() as FeatureFlagHistory;
      
      // Return only the most recent changes
      return {
        flagKey,
        changes: history.changes.slice(-limit),
      };
    } catch (error) {
      console.error(`[FeatureFlags] Error fetching history for "${flagKey}":`, error);
      return null;
    }
  }

  /**
   * Initialize default feature flags
   */
  static async initializeDefaultFlags(
    environment: FeatureEnvironment = "prod"
  ): Promise<void> {
    try {
      const batch = db.batch();
      const flagsRef = db
        .collection("config")
        .doc("featureFlags")
        .collection("flags");

      for (const [key, defaultConfig] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
        const flagRef = flagsRef.doc(key);
        const doc = await flagRef.get();
        
        // Only create if doesn't exist
        if (!doc.exists) {
          const flag: FeatureFlag = {
            key,
            enabled: defaultConfig.enabled ?? false,
            environment,
            updatedAt: Date.now(),
            updatedBy: "system",
            description: defaultConfig.description,
            domain: defaultConfig.domain,
          };
          
          batch.set(flagRef, flag);
        }
      }

      await batch.commit();
      console.log(`[FeatureFlags] Initialized default flags for ${environment}`);
    } catch (error) {
      console.error(`[FeatureFlags] Error initializing default flags:`, error);
      throw error;
    }
  }

  /**
   * Record flag change in history
   */
  private static async recordFlagChange(
    flagKey: string,
    previousState: FeatureFlag | null,
    newState: FeatureFlag,
    adminId: string,
    reason?: string
  ): Promise<void> {
    try {
      const historyRef = db
        .collection("config")
        .doc("featureFlags")
        .collection("history")
        .doc(flagKey);

      const change: FeatureFlagChange = {
        timestamp: Date.now(),
        changedBy: adminId,
        previousState: previousState || {},
        newState,
        reason,
      };

      // Append to history (keeping last 500 changes)
      await historyRef.set(
        {
          flagKey,
          changes: admin.firestore.FieldValue.arrayUnion(change),
        },
        { merge: true }
      );
    } catch (error) {
      console.error(`[FeatureFlags] Error recording history:`, error);
      // Don't throw - history recording shouldn't block flag updates
    }
  }

  /**
   * Check if a flag is a critical system flag
   */
  private static isCriticalFlag(key: string): boolean {
    return Object.values(CRITICAL_KILL_SWITCHES).includes(key as any);
  }

  /**
   * Check if a key represents a critical system
   */
  private static isCriticalSystem(key: string): boolean {
    const criticalSystems = ["panic", "auth", "safety"];
    return criticalSystems.some((system) => key.startsWith(system));
  }

  /**
   * Validate changes to critical flags
   */
  private static async validateCriticalFlagChange(
    flag: FeatureFlag
  ): Promise<void> {
    // Panic system must NEVER be disabled in production
    if (
      flag.key === CRITICAL_KILL_SWITCHES.PANIC_SYSTEM &&
      flag.enabled &&
      flag.environment === "prod"
    ) {
      throw new Error(
        "CRITICAL ERROR: Panic system cannot be disabled in production"
      );
    }

    // Production launch requires all checklist items to pass
    if (
      flag.key === CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH &&
      flag.enabled
    ) {
      // This validation will be done by the launch checklist service
      // For now, just log a warning
      console.warn(
        "[FeatureFlags] Production launch flag enabled - ensure checklist is complete"
      );
    }
  }

  /**
   * Hash user ID to a number between 0 and 1 for rollout percentage
   */
  private static hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }

  /**
   * Clear all caches (for testing)
   */
  static clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

/**
 * Convenience helper for feature flag checks
 */
export async function isFeatureEnabled(
  key: string,
  userId?: string,
  region?: string,
  segment?: string,
  environment: FeatureEnvironment = "prod"
): Promise<boolean> {
  return FeatureFlagService.isFeatureEnabled(key, {
    userId,
    region,
    segment,
    environment,
  });
}

/**
 * Admin-only helper for getting all flags
 */
export async function getAllFeatureFlags(
  environment?: FeatureEnvironment
): Promise<FeatureFlag[]> {
  return FeatureFlagService.getAllFlags(environment);
}

/**
 * Admin-only helper for setting flags
 */
export async function setFeatureFlag(
  flag: FeatureFlag,
  adminId: string,
  reason?: string
): Promise<void> {
  return FeatureFlagService.setFeatureFlag(flag, adminId, reason);
}
