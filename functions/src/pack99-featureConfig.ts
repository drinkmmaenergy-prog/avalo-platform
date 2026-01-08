/**
 * PACK 99 — Feature Config Evaluation Engine
 * Core logic for evaluating feature flags and remote config parameters
 */

import * as crypto from 'crypto';
import { db } from './init';
import * as logger from 'firebase-functions/logger';
import {
  FeatureContext,
  FeatureFlag,
  RemoteConfigParam,
  TargetingRule,
  FeatureExposureEvent,
} from './pack99-types';

// ============================================================================
// CACHE FOR PERFORMANCE
// ============================================================================

const configCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedConfig(key: string): any | null {
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

function setCachedConfig(key: string, data: any): void {
  configCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// DETERMINISTIC HASHING FOR ROLLOUT
// ============================================================================

/**
 * Hash a string to a number between 0 and 100 for deterministic rollout
 * Same input always produces same output
 */
function hashToPercentile(input: string): number {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 100;
}

/**
 * Check if user is in rollout percentage
 */
function isInRollout(
  key: string,
  userId: string,
  rolloutPercent: number
): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;

  const hashInput = `${key}::${userId}`;
  const percentile = hashToPercentile(hashInput);
  return percentile < rolloutPercent;
}

// ============================================================================
// VERSION COMPARISON
// ============================================================================

/**
 * Compare semantic versions (e.g., "1.2.3" vs "1.3.0")
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

// ============================================================================
// RULE MATCHING
// ============================================================================

/**
 * Check if context matches a targeting rule
 */
function matchesRule(rule: TargetingRule, context: FeatureContext): boolean {
  const { conditions } = rule;

  // Check country targeting
  if (conditions.countries && conditions.countries.length > 0) {
    if (!context.countryCode || !conditions.countries.includes(context.countryCode)) {
      return false;
    }
  }

  // Check platform targeting
  if (conditions.platforms && conditions.platforms.length > 0) {
    if (!context.platform || !conditions.platforms.includes(context.platform)) {
      return false;
    }
  }

  // Check app version range
  if (conditions.minAppVersion && context.appVersion) {
    if (compareVersions(context.appVersion, conditions.minAppVersion) < 0) {
      return false;
    }
  }

  if (conditions.maxAppVersion && context.appVersion) {
    if (compareVersions(context.appVersion, conditions.maxAppVersion) > 0) {
      return false;
    }
  }

  // Check enforcement level
  if (conditions.enforcementLevels && conditions.enforcementLevels.length > 0) {
    if (
      !context.enforcementLevel ||
      !conditions.enforcementLevels.includes(context.enforcementLevel)
    ) {
      return false;
    }
  }

  // Check trust score range
  if (conditions.trustScoreMin !== undefined && context.trustScore !== undefined) {
    if (context.trustScore < conditions.trustScoreMin) {
      return false;
    }
  }

  if (conditions.trustScoreMax !== undefined && context.trustScore !== undefined) {
    if (context.trustScore > conditions.trustScoreMax) {
      return false;
    }
  }

  // Check rollout percentage (deterministic)
  if (conditions.rolloutPercent !== undefined && context.userId) {
    if (!isInRollout(rule.id, context.userId, conditions.rolloutPercent)) {
      return false;
    }
  }

  return true;
}

/**
 * Find the first matching rule based on priority
 */
function findMatchingRule(
  rules: TargetingRule[],
  context: FeatureContext
): TargetingRule | null {
  if (!rules || rules.length === 0) return null;

  // Sort by priority (lower number = higher priority)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (matchesRule(rule, context)) {
      return rule;
    }
  }

  return null;
}

// ============================================================================
// FEATURE FLAG EVALUATION
// ============================================================================

/**
 * Get feature flag value for a given context
 * Returns variant value (boolean or object) based on targeting rules
 */
export async function getFeatureFlagValue(
  key: string,
  context: FeatureContext
): Promise<any> {
  try {
    // Check cache first
    const cacheKey = `flag::${key}`;
    const cached = getCachedConfig(cacheKey);
    if (cached) {
      // Still need to evaluate rules for this specific context
      return evaluateFlagForContext(cached, context);
    }

    // Fetch from Firestore
    const flagDoc = await db.collection('feature_flags').doc(key).get();

    if (!flagDoc.exists) {
      logger.warn(`Feature flag not found: ${key}`);
      return false;
    }

    const flag = flagDoc.data() as FeatureFlag;
    setCachedConfig(cacheKey, flag);

    return evaluateFlagForContext(flag, context);
  } catch (error) {
    logger.error(`Error evaluating feature flag ${key}:`, error);
    return false; // Fail-safe to false
  }
}

/**
 * Evaluate flag for specific context (internal helper)
 */
function evaluateFlagForContext(flag: FeatureFlag, context: FeatureContext): any {
  // Find matching rule
  const matchingRule = findMatchingRule(flag.rules, context);

  if (matchingRule) {
    const variantKey = matchingRule.variant;
    return flag.variants[variantKey];
  }

  // No matching rule, use default
  return flag.variants[flag.defaultVariant];
}

// ============================================================================
// REMOTE CONFIG PARAMETER EVALUATION
// ============================================================================

/**
 * Get remote config parameter value for a given context
 * Returns typed value based on targeting rules
 */
export async function getRemoteConfigValue<T = any>(
  key: string,
  context: FeatureContext
): Promise<T> {
  try {
    // Check cache first
    const cacheKey = `param::${key}`;
    const cached = getCachedConfig(cacheKey);
    if (cached) {
      return evaluateParamForContext(cached, context) as T;
    }

    // Fetch from Firestore
    const paramDoc = await db.collection('remote_config_params').doc(key).get();

    if (!paramDoc.exists) {
      logger.warn(`Remote config param not found: ${key}`);
      return null as T;
    }

    const param = paramDoc.data() as RemoteConfigParam;
    setCachedConfig(cacheKey, param);

    return evaluateParamForContext(param, context) as T;
  } catch (error) {
    logger.error(`Error evaluating remote config ${key}:`, error);
    return null as T;
  }
}

/**
 * Evaluate parameter for specific context (internal helper)
 */
function evaluateParamForContext(
  param: RemoteConfigParam,
  context: FeatureContext
): any {
  // Find matching rule
  const matchingRule = findMatchingRule(param.rules, context);

  if (matchingRule) {
    // Rules for params store the value directly in variant
    return matchingRule.variant;
  }

  // No matching rule, use default
  return param.defaultValue;
}

// ============================================================================
// CONTEXT BUILDER HELPERS
// ============================================================================

/**
 * Build context from user document
 */
export async function buildContextFromUser(
  userId: string
): Promise<FeatureContext> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return { userId };
    }

    const userData = userDoc.data();

    return {
      userId,
      countryCode: userData?.location?.country,
      enforcementLevel: userData?.enforcementLevel,
      trustScore: userData?.trustScore,
    };
  } catch (error) {
    logger.error(`Error building context for user ${userId}:`, error);
    return { userId };
  }
}

/**
 * Build context from request (mobile client)
 */
export function buildContextFromRequest(
  userId: string | undefined,
  platform: string | undefined,
  appVersion: string | undefined,
  countryCode: string | undefined
): FeatureContext {
  return {
    userId,
    platform: platform as any,
    appVersion,
    countryCode,
  };
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Get multiple feature flags at once
 */
export async function getFeatureFlags(
  keys: string[],
  context: FeatureContext
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  await Promise.all(
    keys.map(async (key) => {
      results[key] = await getFeatureFlagValue(key, context);
    })
  );

  return results;
}

/**
 * Get multiple remote config params at once
 */
export async function getRemoteConfigValues(
  keys: string[],
  context: FeatureContext
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  await Promise.all(
    keys.map(async (key) => {
      results[key] = await getRemoteConfigValue(key, context);
    })
  );

  return results;
}

// ============================================================================
// EXPOSURE LOGGING (OPTIONAL)
// ============================================================================

/**
 * Log feature exposure event for analytics
 */
export async function logFeatureExposure(
  userId: string,
  featureKey: string,
  variant: any,
  context: FeatureContext
): Promise<void> {
  try {
    const exposure: FeatureExposureEvent = {
      id: `${featureKey}_${userId}_${Date.now()}`,
      userId,
      featureKey,
      variant: typeof variant === 'object' ? JSON.stringify(variant) : String(variant),
      context: {
        country: context.countryCode,
        platform: context.platform,
        appVersion: context.appVersion,
      },
      createdAt: new Date() as any,
    };

    // Fire and forget - don't wait for this
    db.collection('feature_exposure_events')
      .doc(exposure.id)
      .set(exposure)
      .catch((err) => {
        logger.warn('Failed to log exposure event:', err);
      });
  } catch (error) {
    // Silent failure - logging exposure is optional
    logger.warn('Error logging feature exposure:', error);
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all cached configs (use after admin updates)
 */
export function clearConfigCache(): void {
  configCache.clear();
  logger.info('Feature config cache cleared');
}

/**
 * Clear specific cached config
 */
export function clearCachedConfig(key: string): void {
  configCache.delete(`flag::${key}`);
  configCache.delete(`param::${key}`);
  logger.info(`Cleared cache for: ${key}`);
}