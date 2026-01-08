/**
 * PACK 314 - Global Configuration Service
 * 
 * Central configuration & rollout engine for feature flags,
 * country rollout, and controlled launch management.
 * 
 * This service provides:
 * - Feature flag management by country/environment
 * - Country allowlist/blocklist enforcement
 * - User capacity limits per country
 * - Force upgrade checks
 * - In-memory caching (60s TTL)
 * 
 * Region: europe-west3
 */

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const db = getFirestore();

// Cache configuration
const CONFIG_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let cachedConfig: AppConfig | null = null;
let cacheTimestamp: number = 0;

/**
 * Localized message structure
 */
export interface LocalizedMessage {
  en: string;
  pl: string;
  [key: string]: string;
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  enabled: boolean;
  minAppVersion?: string;
  countries?: string[]; // List of country codes or ["*"] for global
  requiresVerification?: boolean;
  maxJumpDistanceKm?: number; // For passport feature
}

/**
 * Features configuration object
 */
export interface FeaturesConfig {
  aiCompanions: FeatureConfig;
  eventsAndCalendar: FeatureConfig;
  passport: FeatureConfig;
  swipe: FeatureConfig;
  discovery: FeatureConfig;
  panicButton: FeatureConfig;
}

/**
 * Rollout configuration
 */
export interface RolloutConfig {
  allowedCountries: string[];
  blockedCountries: string[];
  maxActiveUsersPerCountry: Record<string, number>;
}

/**
 * Force upgrade configuration
 */
export interface ForceUpgradeConfig {
  minAppVersion: string;
  recommendedAppVersion: string;
  message: LocalizedMessage;
}

/**
 * Review Mode configuration for App Store / Play Store review
 */
export interface ReviewModeConfig {
  enabled: boolean;
  enforcedForAll: boolean;
  allowedDeviceIds: string[];
  allowedTestAccounts: string[];
  allowedCountries: string[];
  disableRealPayments: boolean;
  hideEroticContent: boolean;
  hideEarningFlows: boolean;
  hideAICompanions: boolean;
  limitDiscoveryRadiusKm: number;
  limitSwipePerSession: number;
  disablePayouts: boolean;
}

/**
 * Main application configuration
 */
export interface AppConfig {
  env: "dev" | "staging" | "prod";
  version: number;
  features: FeaturesConfig;
  rollout: RolloutConfig;
  forceUpgrade: ForceUpgradeConfig;
  reviewMode: ReviewModeConfig;
}

/**
 * Sanitized config for public API (excludes sensitive fields)
 */
export interface PublicAppConfig {
  features: Record<string, { enabled: boolean }>;
  rollout: {
    allowedCountries: string[];
  };
  forceUpgrade: ForceUpgradeConfig;
}

/**
 * Get application configuration with caching
 * 
 * @param forceRefresh - Force cache refresh
 * @returns Application configuration
 */
export async function getAppConfig(forceRefresh: boolean = false): Promise<AppConfig> {
  try {
    // Check cache
    const now = Date.now();
    if (!forceRefresh && cachedConfig && (now - cacheTimestamp) < CONFIG_CACHE_TTL_MS) {
      return cachedConfig;
    }

    // Fetch from Firestore
    const configDoc = await db.collection("config").doc("global").collection("app").doc("appConfig").get();

    if (!configDoc.exists) {
      logger.warn("App config not found, returning default config");
      return getDefaultConfig();
    }

    const config = configDoc.data() as AppConfig;
    
    // Update cache
    cachedConfig = config;
    cacheTimestamp = now;

    return config;
  } catch (error) {
    logger.error("Error fetching app config:", error);
    throw new Error("Failed to fetch app configuration");
  }
}

/**
 * Check if a country is allowed for registration/access
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "PL", "EE")
 * @returns True if country is allowed
 */
export async function isCountryAllowed(countryCode: string): Promise<boolean> {
  try {
    const config = await getAppConfig();
    
    // Check blocklist first
    if (config.rollout.blockedCountries.includes(countryCode)) {
      return false;
    }

    // Check allowlist
    return config.rollout.allowedCountries.includes(countryCode);
  } catch (error) {
    logger.error("Error checking country allowance:", error);
    return false; // Fail closed for security
  }
}

/**
 * Check if a feature is enabled for a specific country
 * 
 * @param featureKey - Feature key (e.g., "aiCompanions", "eventsAndCalendar")
 * @param countryCode - Optional country code for country-specific checks
 * @returns True if feature is enabled
 */
export async function isFeatureEnabled(
  featureKey: keyof FeaturesConfig,
  countryCode?: string
): Promise<boolean> {
  try {
    const config = await getAppConfig();
    const feature = config.features[featureKey];

    if (!feature) {
      logger.warn(`Unknown feature key: ${featureKey}`);
      return false;
    }

    // Check global enabled flag
    if (!feature.enabled) {
      return false;
    }

    // If no country code provided, return global state
    if (!countryCode) {
      return feature.enabled;
    }

    // Check country-specific availability
    if (feature.countries) {
      // "*" means global availability
      if (feature.countries.includes("*")) {
        return true;
      }

      // Check if country is in the list
      return feature.countries.includes(countryCode);
    }

    // If no country restrictions defined, feature is globally available
    return feature.enabled;
  } catch (error) {
    logger.error("Error checking feature enablement:", error);
    return false; // Fail closed for security
  }
}

/**
 * Get maximum active users allowed for a country
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Maximum users or null if no limit set
 */
export async function getMaxActiveUsersForCountry(countryCode: string): Promise<number | null> {
  try {
    const config = await getAppConfig();
    return config.rollout.maxActiveUsersPerCountry[countryCode] || null;
  } catch (error) {
    logger.error("Error getting max active users:", error);
    return null;
  }
}

/**
 * Check if force upgrade is required
 * 
 * @param appVersion - Current app version (e.g., "1.0.0")
 * @returns Upgrade requirements
 */
export async function shouldForceUpgrade(appVersion: string): Promise<{
  force: boolean;
  recommend: boolean;
  message?: LocalizedMessage;
}> {
  try {
    const config = await getAppConfig();
    const { minAppVersion, recommendedAppVersion, message } = config.forceUpgrade;

    const force = compareVersions(appVersion, minAppVersion) < 0;
    const recommend = compareVersions(appVersion, recommendedAppVersion) < 0;

    return {
      force,
      recommend,
      message: (force || recommend) ? message : undefined,
    };
  } catch (error) {
    logger.error("Error checking force upgrade:", error);
    return { force: false, recommend: false };
  }
}

/**
 * Get active user count for a country
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Number of active users
 */
export async function getActiveUserCountForCountry(countryCode: string): Promise<number> {
  try {
    // Query users collection for active users in the country
    const snapshot = await db
      .collection("users")
      .where("countryCode", "==", countryCode)
      .where("status", "==", "ACTIVE")
      .count()
      .get();

    return snapshot.data().count;
  } catch (error) {
    logger.error("Error counting active users:", error);
    return 0;
  }
}

/**
 * Check if country has reached capacity
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns True if at or over capacity
 */
export async function isCountryAtCapacity(countryCode: string): Promise<boolean> {
  try {
    const maxUsers = await getMaxActiveUsersForCountry(countryCode);
    
    // If no limit set, never at capacity
    if (maxUsers === null) {
      return false;
    }

    const activeCount = await getActiveUserCountForCountry(countryCode);
    return activeCount >= maxUsers;
  } catch (error) {
    logger.error("Error checking country capacity:", error);
    return false;
  }
}

/**
 * Get sanitized config for public API
 * 
 * @returns Public configuration (no internal fields)
 */
export async function getPublicAppConfig(): Promise<PublicAppConfig> {
  try {
    const config = await getAppConfig();

    // Transform features to simpler format
    const features: Record<string, { enabled: boolean }> = {};
    for (const [key, value] of Object.entries(config.features)) {
      features[key] = { enabled: value.enabled };
    }

    return {
      features,
      rollout: {
        allowedCountries: config.rollout.allowedCountries,
      },
      forceUpgrade: config.forceUpgrade,
    };
  } catch (error) {
    logger.error("Error getting public config:", error);
    throw new Error("Failed to fetch public configuration");
  }
}

/**
 * Update application configuration (admin only)
 * 
 * @param updates - Partial configuration updates
 * @param adminId - Admin user ID for audit logging
 */
export async function updateAppConfig(
  updates: Partial<AppConfig>,
  adminId: string
): Promise<void> {
  try {
    const currentConfig = await getAppConfig();
    const newConfig = {
      ...currentConfig,
      ...updates,
      version: currentConfig.version + 1,
    };

    // Validate country codes
    if (updates.rollout) {
      validateCountryCodes([
        ...(updates.rollout.allowedCountries || []),
        ...(updates.rollout.blockedCountries || []),
      ]);
    }

    // Write to Firestore
    await db
      .collection("config")
      .doc("global")
      .collection("app")
      .doc("appConfig")
      .set(newConfig, { merge: true });

    // Invalidate cache
    cachedConfig = null;

    // Audit log
    await db.collection("auditLogs").add({
      type: "CONFIG_UPDATED",
      adminId,
      timestamp: new Date(),
      changes: updates,
      newVersion: newConfig.version,
    });

    logger.info(`App config updated by ${adminId}, version: ${newConfig.version}`);
  } catch (error) {
    logger.error("Error updating app config:", error);
    throw new Error("Failed to update app configuration");
  }
}

/**
 * Initialize default configuration
 */
export async function initializeDefaultConfig(): Promise<void> {
  try {
    const configDoc = await db
      .collection("config")
      .doc("global")
      .collection("app")
      .doc("appConfig")
      .get();

    if (configDoc.exists) {
      logger.info("App config already exists, skipping initialization");
      return;
    }

    const defaultConfig = getDefaultConfig();
    await db
      .collection("config")
      .doc("global")
      .collection("app")
      .doc("appConfig")
      .set(defaultConfig);

    logger.info("Default app config initialized");
  } catch (error) {
    logger.error("Error initializing default config:", error);
    throw error;
  }
}

/**
 * Check if review mode is active for a session
 *
 * @param args - Session context
 * @returns True if review mode should be active
 */
export async function isReviewModeSession(args: {
  env: "dev" | "staging" | "prod";
  userId?: string;
  deviceId?: string;
  country?: string;
}): Promise<boolean> {
  try {
    const config = await getAppConfig();
    const { reviewMode } = config;

    // If review mode is not enabled, return false
    if (!reviewMode.enabled) {
      return false;
    }

    // If enforcedForAll is true, all users see review mode
    if (reviewMode.enforcedForAll) {
      return true;
    }

    // Check device ID allowlist
    if (args.deviceId && reviewMode.allowedDeviceIds.includes(args.deviceId)) {
      return true;
    }

    // Check test accounts allowlist
    if (args.userId && reviewMode.allowedTestAccounts.includes(args.userId)) {
      return true;
    }

    // Check country restrictions
    if (args.country) {
      const allowedCountries = reviewMode.allowedCountries;
      // If allowedCountries is ["*"], all countries are allowed
      if (allowedCountries.length > 0 && !allowedCountries.includes("*")) {
        if (!allowedCountries.includes(args.country)) {
          return false;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error("Error checking review mode session:", error);
    return false; // Fail safe to normal mode
  }
}

/**
 * Get default configuration
 */
function getDefaultConfig(): AppConfig {
  return {
    env: "dev",
    version: 1,
    features: {
      aiCompanions: {
        enabled: true,
        minAppVersion: "1.0.0",
        countries: ["PL", "EE", "LT", "LV", "UA", "RO", "BG", "CZ", "SK", "SI", "HR", "AL", "ME", "GE", "BY", "IT", "GR"],
      },
      eventsAndCalendar: {
        enabled: true,
        countries: ["PL", "EE", "LT", "LV", "UA", "RO", "BG", "CZ", "SK", "SI", "HR", "AL", "ME", "GE", "BY", "IT", "GR"],
        requiresVerification: true,
      },
      passport: {
        enabled: true,
        countries: ["*"],
        maxJumpDistanceKm: 10000,
      },
      swipe: {
        enabled: true,
      },
      discovery: {
        enabled: true,
      },
      panicButton: {
        enabled: true,
        countries: ["PL", "EE", "LT", "LV", "UA", "RO", "BG", "CZ", "SK", "SI", "HR", "AL", "ME", "GE", "BY", "IT", "GR"],
      },
    },
    rollout: {
      allowedCountries: [
        "PL", "EE", "LT", "LV", "RU", "UA", "BY",
        "BG", "RO", "SK", "SI", "CZ", "HR", "ME",
        "AL", "MK", "GE", "IT", "GR",
      ],
      blockedCountries: [],
      maxActiveUsersPerCountry: {
        PL: 2000000,
        EE: 200000,
        LT: 200000,
        LV: 200000,
        UA: 2000000,
        RO: 2000000,
        BG: 2000000,
        CZ: 2000000,
        SK: 2000000,
        SI: 2000000,
        HR: 2000000,
        AL: 2000000,
        ME: 2000000,
        GE: 2000000,
        BY: 2000000,
        IT: 2000000,
        GR: 2000000,
      },
    },
    forceUpgrade: {
      minAppVersion: "1.0.0",
      recommendedAppVersion: "1.1.0",
      message: {
        en: "A new version of Avalo is available. Please update for the best experience.",
        pl: "Dostępna jest nowa wersja Avalo. Zaktualizuj aplikację, aby korzystać z pełnych możliwości.",
      },
    },
    reviewMode: {
      enabled: false,
      enforcedForAll: false,
      allowedDeviceIds: [],
      allowedTestAccounts: [],
      allowedCountries: ["*"],
      disableRealPayments: true,
      hideEroticContent: true,
      hideEarningFlows: true,
      hideAICompanions: true,
      limitDiscoveryRadiusKm: 10,
      limitSwipePerSession: 20,
      disablePayouts: true,
    },
  };
}

/**
 * Compare semantic versions
 * 
 * @param version1 - First version (e.g., "1.0.0")
 * @param version2 - Second version (e.g., "1.1.0")
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }

  return 0;
}

/**
 * Validate country codes (ISO 3166-1 alpha-2)
 */
function validateCountryCodes(codes: string[]): void {
  const validPattern = /^[A-Z]{2}$/;
  
  for (const code of codes) {
    if (!validPattern.test(code)) {
      throw new Error(`Invalid country code: ${code}. Must be 2-letter ISO 3166-1 alpha-2 code.`);
    }
  }
}