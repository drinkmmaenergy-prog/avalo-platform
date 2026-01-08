/**
 * PACK 99 — Client-Facing Config Bundle
 * Callable function for mobile clients to fetch feature configs
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  getFeatureFlagValue,
  getRemoteConfigValue,
  buildContextFromRequest,
  logFeatureExposure,
} from './pack99-featureConfig';
import { ClientFeatureConfigBundle, PlatformType } from './pack99-types';

// ============================================================================
// WHITELISTED CONFIGS FOR MOBILE
// ============================================================================

/**
 * Feature flags that mobile clients are allowed to fetch
 * This prevents exposing internal/backend-only flags
 */
const MOBILE_FEATURE_FLAGS = [
  'discovery_v2_enabled',
  'new_onboarding_flow',
  'contextual_help_experiment',
  '2fa_recommended_banner',
  'notifications_batching_enabled',
  'nsfw_discovery_filter_mode',
  'advanced_analytics_ui',
  'profile_verification_prompt',
  'safety_tips_variant',
];

/**
 * Remote config parameters that mobile clients are allowed to fetch
 */
const MOBILE_CONFIG_PARAMS = [
  'discovery_weight_profileCompleteness',
  'discovery_weight_engagement',
  'discovery_weight_monetization',
  'discovery_weight_riskPenalty',
  'discovery_maxResultsPerPage',
  'onboarding_steps_version',
  'notifications_experiments_variant',
  'stepUpStrongAuthWindowMinutes',
  'nsfw_discovery_filter_mode',
  'help_center_entry_points',
];

// ============================================================================
// CLIENT CONFIG BUNDLE
// ============================================================================

/**
 * Get feature config bundle for mobile client
 * Returns whitelisted flags and params evaluated for user's context
 */
export const getClientFeatureConfigBundle = onCall(async (request) => {
  try {
    const { userId, platform, appVersion, countryCode } = request.data;

    // Validate required params
    if (!platform || !['android', 'ios', 'web'].includes(platform)) {
      throw new HttpsError('invalid-argument', 'Invalid or missing platform');
    }

    if (!appVersion) {
      throw new HttpsError('invalid-argument', 'appVersion is required');
    }

    // Build context
    const context = buildContextFromRequest(
      userId,
      platform as PlatformType,
      appVersion,
      countryCode
    );

    // Fetch all flags
    const flags: Record<string, any> = {};
    await Promise.all(
      MOBILE_FEATURE_FLAGS.map(async (key) => {
        try {
          const value = await getFeatureFlagValue(key, context);
          flags[key] = value;

          // Log exposure for analytics (fire and forget)
          if (userId) {
            logFeatureExposure(userId, key, value, context).catch(() => {
              // Silent failure
            });
          }
        } catch (error) {
          logger.warn(`Failed to fetch flag ${key}:`, error);
          flags[key] = false; // Fail-safe to false
        }
      })
    );

    // Fetch all params
    const params: Record<string, any> = {};
    await Promise.all(
      MOBILE_CONFIG_PARAMS.map(async (key) => {
        try {
          const value = await getRemoteConfigValue(key, context);
          params[key] = value;
        } catch (error) {
          logger.warn(`Failed to fetch param ${key}:`, error);
          params[key] = null; // Fail-safe to null
        }
      })
    );

    const bundle: ClientFeatureConfigBundle = {
      flags,
      params,
      fetchedAt: Date.now(),
    };

    logger.info('Config bundle fetched', {
      userId,
      platform,
      flagsCount: Object.keys(flags).length,
      paramsCount: Object.keys(params).length,
    });

    return {
      success: true,
      bundle,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error fetching config bundle:', error);
    throw new HttpsError('internal', 'Failed to fetch config bundle');
  }
});

// ============================================================================
// SINGLE FLAG/PARAM FETCH (FOR TESTING)
// ============================================================================

/**
 * Get single feature flag value (for testing/debugging)
 */
export const getFeatureFlag = onCall(async (request) => {
  try {
    const { key, userId, platform, appVersion, countryCode } = request.data;

    if (!key) {
      throw new HttpsError('invalid-argument', 'key is required');
    }

    // Check if key is whitelisted
    if (!MOBILE_FEATURE_FLAGS.includes(key)) {
      throw new HttpsError('permission-denied', 'Flag not available for mobile clients');
    }

    const context = buildContextFromRequest(
      userId,
      platform as PlatformType,
      appVersion,
      countryCode
    );

    const value = await getFeatureFlagValue(key, context);

    // Log exposure
    if (userId) {
      logFeatureExposure(userId, key, value, context).catch(() => {
        // Silent failure
      });
    }

    return {
      success: true,
      key,
      value,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error fetching feature flag:', error);
    throw new HttpsError('internal', 'Failed to fetch feature flag');
  }
});

/**
 * Get single remote config param value (for testing/debugging)
 */
export const getRemoteConfigParam = onCall(async (request) => {
  try {
    const { key, userId, platform, appVersion, countryCode } = request.data;

    if (!key) {
      throw new HttpsError('invalid-argument', 'key is required');
    }

    // Check if key is whitelisted
    if (!MOBILE_CONFIG_PARAMS.includes(key)) {
      throw new HttpsError('permission-denied', 'Param not available for mobile clients');
    }

    const context = buildContextFromRequest(
      userId,
      platform as PlatformType,
      appVersion,
      countryCode
    );

    const value = await getRemoteConfigValue(key, context);

    return {
      success: true,
      key,
      value,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error fetching remote config param:', error);
    throw new HttpsError('internal', 'Failed to fetch remote config param');
  }
});