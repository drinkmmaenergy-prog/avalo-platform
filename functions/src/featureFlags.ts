;
/**
 * PHASE 19 - Feature Flags System
 *
 * Allows gradual rollout and A/B testing of new features
 * Supports user-specific, percentage-based, and environment overrides
 *
 * Region: europe-west3
 */

;
;
;

const db = getFirestore();

/**
 * Available feature flags
 */
export const FeatureFlags = {
  // Analytics
  ANALYTICS_ENABLED: "analytics_enabled",
  ANALYTICS_BIGQUERY_EXPORT: "analytics_bigquery_export",

  // Discovery
  DISCOVERY_RANK_V2: "discovery_rank_v2",
  DISCOVERY_AI_BOOST: "discovery_ai_boost",

  // Creator Features
  CREATOR_STORE: "creator_store",
  CREATOR_STRIPE_CONNECT: "creator_stripe_connect",

  // Trust & Safety
  KYC_REQUIRED: "kyc_required",
  DEVICE_TRUST_SCORING: "device_trust_scoring",
  RATE_LIMITING: "rate_limiting",

  // AI Features
  AI_TRANSPARENCY: "ai_transparency",
  AI_RECOMMENDATION_EXPLAINABILITY: "ai_recommendation_explainability",

  // Payment Features
  WALLET_INSTANT_WITHDRAW: "wallet_instant_withdraw",
  CRYPTO_PAYMENTS: "crypto_payments",

  // Experimental
  VIDEO_CALLS_BETA: "video_calls_beta",
  VOICE_MESSAGES: "voice_messages",
} as const;

/**
 * Feature flag configuration
 */
interface FeatureFlagConfig {
  enabled: boolean;
  rolloutPercentage?: number; // 0-100, used for gradual rollout
  allowedUserIds?: string[]; // Whitelist specific users
  blockedUserIds?: string[]; // Blacklist specific users
  allowedRoles?: string[]; // Enable for specific roles (admin, creator, etc.)
  requiredVersion?: string; // Minimum app version required
  expiresAt?: Date; // Auto-disable after this date
  metadata?: Record<string, any>;
}

/**
 * Get feature flag value for a user
 *
 * Priority order:
 * 1. Environment override (process.env.FEATURE_FLAG_<name>)
 * 2. User-specific override
 * 3. Role-based access
 * 4. Percentage rollout
 * 5. Default value
 *
 * @param uid User ID (optional for anonymous checks)
 * @param flagName Feature flag name
 * @param defaultValue Default value if flag not found
 * @returns Whether feature is enabled for this user
 */
export async function getFeatureFlag(
  uid: string | undefined,
  flagName: string,
  defaultValue: boolean = false
): Promise<boolean> {
  try {
    // 1. Check environment override
    const envKey = `FEATURE_FLAG_${flagName.toUpperCase()}`;
    const envOverride = process.env[envKey];
    if (envOverride !== undefined) {
      return envOverride === "true" || envOverride === "1";
    }

    // 2. Get flag configuration from Firestore
    const flagDoc = await db.collection("featureFlags").doc(flagName).get();

    if (!flagDoc.exists) {
      return defaultValue;
    }

    const config = flagDoc.data() as FeatureFlagConfig;

    // Check if flag is globally disabled
    if (!config.enabled) {
      return false;
    }

    // Check expiration
    if (config.expiresAt && new Date() > config.expiresAt) {
      return false;
    }

    // If no user ID provided, return global enabled state
    if (!uid) {
      return config.enabled;
    }

    // 3. Check user blocklist
    if (config.blockedUserIds?.includes(uid)) {
      return false;
    }

    // 4. Check user whitelist
    if (config.allowedUserIds?.includes(uid)) {
      return true;
    }

    // 5. Check role-based access
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (userData?.role && config.allowedRoles.includes(userData.role)) {
        return true;
      }
    }

    // 6. Check percentage rollout
    if (config.rolloutPercentage !== undefined) {
      const userHash = hashUserId(uid);
      const userPercentage = userHash % 100;

      return userPercentage < config.rolloutPercentage;
    }

    // 7. Return global enabled state
    return config.enabled;
  } catch (error: any) {
    logger.error(`Feature flag error for ${flagName}:`, error);
    return defaultValue; // Fail safe to default
  }
}

/**
 * Get multiple feature flags at once (batch operation)
 */
export async function getFeatureFlags(
  uid: string | undefined,
  flagNames: string[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    flagNames.map(async (flagName) => {
      results[flagName] = await getFeatureFlag(uid, flagName);
    })
  );

  return results;
}

/**
 * Set feature flag configuration (admin only)
 * Use this to create or update feature flags
 */
export async function setFeatureFlag(
  flagName: string,
  config: FeatureFlagConfig
): Promise<void> {
  await db.collection("featureFlags").doc(flagName).set(
    {
      ...config,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  logger.info(`Feature flag updated: ${flagName}`, config);
}

/**
 * Hash user ID for consistent percentage-based rollout
 * Same user always gets same hash value
 */
function hashUserId(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    const char = uid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Feature flag variants (for A/B testing)
 * Returns variant name instead of boolean
 */
export async function getFeatureFlagVariant(
  uid: string | undefined,
  flagName: string,
  variants: string[] = ["control", "variant"]
): Promise<string> {
  try {
    const flagDoc = await db.collection("featureFlags").doc(flagName).get();

    if (!flagDoc.exists || !uid) {
      return variants[0]; // Default to control
    }

    const config = flagDoc.data() as FeatureFlagConfig & { variants?: string[] };

    if (!config.enabled) {
      return variants[0];
    }

    // Use variants from config if available
    const availableVariants = config.variants || variants;

    // Hash user to variant index
    const userHash = hashUserId(uid);
    const variantIndex = userHash % availableVariants.length;

    return availableVariants[variantIndex];
  } catch (error: any) {
    logger.error(`Feature flag variant error for ${flagName}:`, error);
    return variants[0];
  }
}

/**
 * Check if user is in experiment group
 * Useful for A/B testing
 */
export async function isInExperiment(
  uid: string | undefined,
  experimentName: string
): Promise<boolean> {
  if (!uid) return false;

  const variant = await getFeatureFlagVariant(uid, experimentName, [
    "control",
    "experiment",
  ]);

  return variant === "experiment";
}

/**
 * Get all active feature flags for a user
 * Useful for client initialization
 */
export async function getAllFeatureFlagsForUser(
  uid: string | undefined
): Promise<Record<string, boolean>> {
  try {
    const flagsSnapshot = await db.collection("featureFlags").where("enabled", "==", true).get();

    const results: Record<string, boolean> = {};

    await Promise.all(
      flagsSnapshot.docs.map(async (doc) => {
        const flagName = doc.id;
        results[flagName] = await getFeatureFlag(uid, flagName);
      })
    );

    return results;
  } catch (error: any) {
    logger.error("Error fetching all feature flags:", error);
    return {};
  }
}

/**
 * Seed default feature flags
 * Run this once during deployment to initialize flags
 */
export async function seedDefaultFeatureFlags(): Promise<void> {
  const defaultFlags: Record<string, FeatureFlagConfig> = {
    [FeatureFlags.ANALYTICS_ENABLED]: {
      enabled: true,
      rolloutPercentage: 100,
    },
    [FeatureFlags.ANALYTICS_BIGQUERY_EXPORT]: {
      enabled: true,
    },
    [FeatureFlags.DISCOVERY_RANK_V2]: {
      enabled: false,
      rolloutPercentage: 10, // 10% rollout
    },
    [FeatureFlags.CREATOR_STORE]: {
      enabled: false,
      allowedRoles: ["creator", "admin"],
    },
    [FeatureFlags.KYC_REQUIRED]: {
      enabled: false,
      rolloutPercentage: 0, // Disabled by default
    },
    [FeatureFlags.DEVICE_TRUST_SCORING]: {
      enabled: true,
      rolloutPercentage: 100,
    },
    [FeatureFlags.RATE_LIMITING]: {
      enabled: true,
      rolloutPercentage: 100,
    },
    [FeatureFlags.AI_TRANSPARENCY]: {
      enabled: true,
      rolloutPercentage: 100,
    },
    [FeatureFlags.VIDEO_CALLS_BETA]: {
      enabled: false,
      allowedRoles: ["admin"],
    },
  };

  for (const [flagName, config] of Object.entries(defaultFlags)) {
    await setFeatureFlag(flagName, config);
  }

  logger.info("Default feature flags seeded");
}


