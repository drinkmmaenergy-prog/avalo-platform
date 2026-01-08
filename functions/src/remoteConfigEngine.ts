/**
 * PACK 67 — Remote Config Engine
 * Deterministic feature flag and experiment assignment logic
 */

import * as crypto from 'crypto';
import {
  FeatureConfig,
  ExperimentConfig,
  PlatformType,
} from './types/remoteConfig';

/**
 * Compute a deterministic hash from a string (0-99 range for percentage)
 */
function hashToPercentile(input: string): number {
  const hash = crypto.createHash('md5').update(input).digest('hex');
  // Take first 8 chars as hex number, mod 100
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 100;
}

/**
 * Compute a deterministic hash from a string (0-n range for weighted variants)
 */
function hashToRange(input: string, range: number): number {
  const hash = crypto.createHash('md5').update(input).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num % range;
}

/**
 * Compute whether a feature is enabled for a given user/device
 * Deterministic based on featureKey + identifier
 */
export function computeFeatureEnabled(
  featureKey: string,
  userIdOrDeviceId: string,
  platform: PlatformType,
  country: string | null | undefined,
  config: FeatureConfig
): boolean {
  // Start with base enabled flag
  if (!config.enabled) {
    return false;
  }

  // Check platform targeting
  if (
    config.rollout?.platforms &&
    config.rollout.platforms.length > 0 &&
    !config.rollout.platforms.includes(platform)
  ) {
    return false;
  }

  // Check country targeting
  if (
    config.rollout?.countries &&
    config.rollout.countries.length > 0 &&
    (!country || !config.rollout.countries.includes(country))
  ) {
    return false;
  }

  // Check percentage rollout
  if (
    config.rollout?.percentage !== undefined &&
    config.rollout.percentage < 100
  ) {
    const hashInput = `${featureKey}:${userIdOrDeviceId}`;
    const percentile = hashToPercentile(hashInput);
    if (percentile >= config.rollout.percentage) {
      return false;
    }
  }

  return true;
}

/**
 * Assign an experiment variant for a given user/device
 * Deterministic based on experimentKey + identifier
 * Returns variantKey or null if user is not in experiment
 */
export function assignExperimentVariant(
  experimentKey: string,
  userIdOrDeviceId: string,
  platform: PlatformType,
  country: string | null | undefined,
  experimentConfig: ExperimentConfig
): string | null {
  // Experiment must be active
  if (!experimentConfig.active) {
    return null;
  }

  // Check platform targeting
  if (
    experimentConfig.rollout?.platforms &&
    experimentConfig.rollout.platforms.length > 0 &&
    !experimentConfig.rollout.platforms.includes(platform)
  ) {
    return null;
  }

  // Check country targeting
  if (
    experimentConfig.rollout?.countries &&
    experimentConfig.rollout.countries.length > 0 &&
    (!country || !experimentConfig.rollout.countries.includes(country))
  ) {
    return null;
  }

  // Check percentage rollout (whether user is in experiment at all)
  if (
    experimentConfig.rollout?.percentage !== undefined &&
    experimentConfig.rollout.percentage < 100
  ) {
    const hashInput = `${experimentKey}:rollout:${userIdOrDeviceId}`;
    const percentile = hashToPercentile(hashInput);
    if (percentile >= experimentConfig.rollout.percentage) {
      return null;
    }
  }

  // Assign variant based on weights
  const variants = Object.entries(experimentConfig.variants);
  if (variants.length === 0) {
    return null;
  }

  // Calculate total weight
  const totalWeight = variants.reduce(
    (sum, [, variant]) => sum + variant.weight,
    0
  );

  if (totalWeight === 0) {
    return null;
  }

  // Deterministic assignment
  const hashInput = `${experimentKey}:variant:${userIdOrDeviceId}`;
  const hashValue = hashToRange(hashInput, totalWeight);

  // Find which variant this hash maps to
  let cumulative = 0;
  for (const [variantKey, variant] of variants) {
    cumulative += variant.weight;
    if (hashValue < cumulative) {
      return variantKey;
    }
  }

  // Fallback to first variant (should not happen)
  return variants[0][0];
}

/**
 * Merge two config objects, with override taking precedence
 */
export function mergeConfigs<T extends Record<string, any>>(
  base: T,
  override: Partial<T>
): T {
  const result = { ...base };

  for (const key in override) {
    if (override[key] !== undefined) {
      if (
        typeof override[key] === 'object' &&
        !Array.isArray(override[key]) &&
        override[key] !== null &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key]) &&
        base[key] !== null
      ) {
        // Deep merge for nested objects
        result[key] = mergeConfigs(base[key], override[key]) as any;
      } else {
        // Direct override for primitives and arrays
        result[key] = override[key] as any;
      }
    }
  }

  return result;
}