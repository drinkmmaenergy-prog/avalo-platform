/**
 * PACK 416 — Web Feature Flags (Server-Side)
 * 
 * Server-side utilities for Next.js Server Components and API Routes
 * Note: This is a simplified version that uses client-side Firebase
 * For true server-side, add firebase-admin to dependencies
 */

import {
  FeatureFlagKey,
  FeatureFlagConfig,
  FeatureFlagUserContext,
  isFeatureEnabled as checkFeatureEnabled,
  calculateRolloutBucket,
  SAFE_DEFAULTS,
} from './types/featureFlags';

// Server-side cache with TTL
const serverCache = new Map<string, { config: FeatureFlagConfig; timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache on server

/**
 * Server-side function to get a feature flag configuration
 * Note: On Vercel/Edge, use SAFE_DEFAULTS as Firebase Admin is not available
 * 
 * @param key Feature flag key
 * @returns Feature flag configuration or null
 */
export async function getFeatureFlagServer(
  key: FeatureFlagKey
): Promise<FeatureFlagConfig | null> {
  // Check cache first
  const cached = serverCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }
  
  // Return null - rely on client-side fetch or defaults
  return null;
}

/**
 * Server-side function to check if a feature is enabled
 * Falls back to SAFE_DEFAULTS when no config available
 * 
 * @param key Feature flag key
 * @param userContext Optional user context for targeting
 * @returns Promise resolving to enabled status
 */
export async function isFeatureFlagEnabledServer(
  key: FeatureFlagKey,
  userContext?: FeatureFlagUserContext
): Promise<boolean> {
  try {
    const config = await getFeatureFlagServer(key);
    
    if (!config) {
      // Fall back to safe default
      return SAFE_DEFAULTS[key] ?? false;
    }
    
    return checkFeatureEnabled(config, userContext || {});
  } catch (error) {
    console.error(`[FeatureFlags Server] Error checking ${key}:`, error);
    return SAFE_DEFAULTS[key] ?? false;
  }
}

/**
 * Server-side function to check multiple feature flags at once
 * 
 * @param keys Array of feature flag keys
 * @param userContext Optional user context for targeting
 * @returns Promise resolving to map of key -> enabled status
 */
export async function getFeatureFlagsServer(
  keys: FeatureFlagKey[],
  userContext?: FeatureFlagUserContext
): Promise<Record<FeatureFlagKey, boolean>> {
  try {
    const results: Record<string, boolean> = {};
    
    await Promise.all(
      keys.map(async (key) => {
        results[key] = await isFeatureFlagEnabledServer(key, userContext);
      })
    );
    
    return results as Record<FeatureFlagKey, boolean>;
  } catch (error) {
    console.error('[FeatureFlags Server] Error checking flags:', error);
    
    // Return safe defaults on error
    const results: Record<string, boolean> = {};
    keys.forEach(key => {
      results[key] = SAFE_DEFAULTS[key] ?? false;
    });
    return results as Record<FeatureFlagKey, boolean>;
  }
}

/**
 * Server-side function to get all feature flags
 * Useful for admin dashboards
 * Note: Returns empty array without firebase-admin
 * 
 * @returns Promise resolving to array of all feature flag configs
 */
export async function getAllFeatureFlagsServer(): Promise<FeatureFlagConfig[]> {
  // Without firebase-admin, return empty - use client-side for admin
  return [];
}

/**
 * Server-side function to update a feature flag
 * Note: Requires firebase-admin - not available in this build
 * 
 * @param _key Feature flag key
 * @param _updates Partial updates to apply
 * @param _adminId ID of admin making the change
 * @returns Promise resolving to error status
 */
export async function updateFeatureFlagServer(
  _key: FeatureFlagKey,
  _updates: Partial<FeatureFlagConfig>,
  _adminId: string
): Promise<{ success: boolean; error?: string }> {
  return { 
    success: false, 
    error: 'Server-side updates require firebase-admin. Use client-side admin SDK.' 
  };
}

/**
 * Server-side function to toggle a feature flag on/off
 * Note: Requires firebase-admin - not available in this build
 * 
 * @param key Feature flag key
 * @param enabled New enabled status
 * @param adminId ID of admin making the change
 * @returns Promise resolving to error status
 */
export async function toggleFeatureFlagServer(
  key: FeatureFlagKey,
  enabled: boolean,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  return updateFeatureFlagServer(key, { enabled }, adminId);
}

/**
 * Clear server-side feature flags cache
 */
export function clearFeatureFlagsCacheServer(): void {
  serverCache.clear();
}

/**
 * Helper to build user context from request data
 * Use in API routes or server components
 */
export function buildUserContext(params: {
  userId?: string;
  country?: string;
  isVip?: boolean;
  isRoyal?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
}): FeatureFlagUserContext {
  return {
    userId: params.userId,
    country: params.country,
    platform: 'web',
    isVip: params.isVip ?? false,
    isRoyal: params.isRoyal ?? false,
    isCreator: params.isCreator ?? false,
    isAdmin: params.isAdmin ?? false,
    rolloutBucket: params.userId 
      ? calculateRolloutBucket(params.userId, 'default') 
      : Math.floor(Math.random() * 100),
  };
}
