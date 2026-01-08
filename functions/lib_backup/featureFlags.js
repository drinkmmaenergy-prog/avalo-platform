"use strict";
/**
 * PHASE 19 - Feature Flags System
 *
 * Allows gradual rollout and A/B testing of new features
 * Supports user-specific, percentage-based, and environment overrides
 *
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlags = void 0;
exports.getFeatureFlag = getFeatureFlag;
exports.getFeatureFlags = getFeatureFlags;
exports.setFeatureFlag = setFeatureFlag;
exports.getFeatureFlagVariant = getFeatureFlagVariant;
exports.isInExperiment = isInExperiment;
exports.getAllFeatureFlagsForUser = getAllFeatureFlagsForUser;
exports.seedDefaultFeatureFlags = seedDefaultFeatureFlags;
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const db = (0, firestore_1.getFirestore)();
/**
 * Available feature flags
 */
exports.FeatureFlags = {
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
};
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
async function getFeatureFlag(uid, flagName, defaultValue = false) {
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
        const config = flagDoc.data();
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
    }
    catch (error) {
        v2_1.logger.error(`Feature flag error for ${flagName}:`, error);
        return defaultValue; // Fail safe to default
    }
}
/**
 * Get multiple feature flags at once (batch operation)
 */
async function getFeatureFlags(uid, flagNames) {
    const results = {};
    await Promise.all(flagNames.map(async (flagName) => {
        results[flagName] = await getFeatureFlag(uid, flagName);
    }));
    return results;
}
/**
 * Set feature flag configuration (admin only)
 * Use this to create or update feature flags
 */
async function setFeatureFlag(flagName, config) {
    await db.collection("featureFlags").doc(flagName).set({
        ...config,
        updatedAt: new Date(),
    }, { merge: true });
    v2_1.logger.info(`Feature flag updated: ${flagName}`, config);
}
/**
 * Hash user ID for consistent percentage-based rollout
 * Same user always gets same hash value
 */
function hashUserId(uid) {
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
async function getFeatureFlagVariant(uid, flagName, variants = ["control", "variant"]) {
    try {
        const flagDoc = await db.collection("featureFlags").doc(flagName).get();
        if (!flagDoc.exists || !uid) {
            return variants[0]; // Default to control
        }
        const config = flagDoc.data();
        if (!config.enabled) {
            return variants[0];
        }
        // Use variants from config if available
        const availableVariants = config.variants || variants;
        // Hash user to variant index
        const userHash = hashUserId(uid);
        const variantIndex = userHash % availableVariants.length;
        return availableVariants[variantIndex];
    }
    catch (error) {
        v2_1.logger.error(`Feature flag variant error for ${flagName}:`, error);
        return variants[0];
    }
}
/**
 * Check if user is in experiment group
 * Useful for A/B testing
 */
async function isInExperiment(uid, experimentName) {
    if (!uid)
        return false;
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
async function getAllFeatureFlagsForUser(uid) {
    try {
        const flagsSnapshot = await db.collection("featureFlags").where("enabled", "==", true).get();
        const results = {};
        await Promise.all(flagsSnapshot.docs.map(async (doc) => {
            const flagName = doc.id;
            results[flagName] = await getFeatureFlag(uid, flagName);
        }));
        return results;
    }
    catch (error) {
        v2_1.logger.error("Error fetching all feature flags:", error);
        return {};
    }
}
/**
 * Seed default feature flags
 * Run this once during deployment to initialize flags
 */
async function seedDefaultFeatureFlags() {
    const defaultFlags = {
        [exports.FeatureFlags.ANALYTICS_ENABLED]: {
            enabled: true,
            rolloutPercentage: 100,
        },
        [exports.FeatureFlags.ANALYTICS_BIGQUERY_EXPORT]: {
            enabled: true,
        },
        [exports.FeatureFlags.DISCOVERY_RANK_V2]: {
            enabled: false,
            rolloutPercentage: 10, // 10% rollout
        },
        [exports.FeatureFlags.CREATOR_STORE]: {
            enabled: false,
            allowedRoles: ["creator", "admin"],
        },
        [exports.FeatureFlags.KYC_REQUIRED]: {
            enabled: false,
            rolloutPercentage: 0, // Disabled by default
        },
        [exports.FeatureFlags.DEVICE_TRUST_SCORING]: {
            enabled: true,
            rolloutPercentage: 100,
        },
        [exports.FeatureFlags.RATE_LIMITING]: {
            enabled: true,
            rolloutPercentage: 100,
        },
        [exports.FeatureFlags.AI_TRANSPARENCY]: {
            enabled: true,
            rolloutPercentage: 100,
        },
        [exports.FeatureFlags.VIDEO_CALLS_BETA]: {
            enabled: false,
            allowedRoles: ["admin"],
        },
    };
    for (const [flagName, config] of Object.entries(defaultFlags)) {
        await setFeatureFlag(flagName, config);
    }
    v2_1.logger.info("Default feature flags seeded");
}
//# sourceMappingURL=featureFlags.js.map