/**
 * PACK 297 - Feature Flags Service
 * 
 * Remote feature flag system with kill switches for safe rollout
 * NO ECONOMIC CHANGES - only controls feature availability
 */

import { db } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

export type FeatureFlagKey = 
  | 'chat_paid_v1'
  | 'calendar_v1'
  | 'events_v1'
  | 'feed_v1'
  | 'ai_assist_v1'
  | 'web_token_store_v1'
  | 'panic_button_v1';

export type FeatureFlagEnvironment = 'STAGING' | 'PRODUCTION' | 'GLOBAL';

export interface FeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
  env: FeatureFlagEnvironment;
  rolloutPercentage: number; // 0-100
  allowedCountries: string[]; // ISO country codes, empty = all
  minAppVersion?: string; // Semantic version
  maxAppVersion?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FeatureFlagContext {
  userId?: string;
  deviceId?: string;
  country?: string;
  appVersion?: string;
  environment: 'STAGING' | 'PRODUCTION';
}

// Cache for feature flags to avoid reading Firestore on every request
let flagCache: Record<string, FeatureFlag> = {};
let lastFlagCacheFetch = 0;
const FLAG_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Load feature flags from Firestore
 */
async function loadFeatureFlags(environment: 'STAGING' | 'PRODUCTION'): Promise<Record<string, FeatureFlag>> {
  const now = Date.now();
  
  // Refresh cache if expired
  if (now - lastFlagCacheFetch > FLAG_CACHE_TTL) {
    try {
      const snapshot = await db.collection('featureFlags').get();
      const flags: Record<string, FeatureFlag> = {};
      
      snapshot.forEach(doc => {
        const flag = doc.data() as FeatureFlag;
        // Include GLOBAL flags and environment-specific flags
        if (flag.env === 'GLOBAL' || flag.env === environment) {
          flags[flag.key] = flag;
        }
      });
      
      flagCache = flags;
      lastFlagCacheFetch = now;
    } catch (error) {
      console.error('Failed to load feature flags:', error);
      // Use cached flags if load fails
    }
  }
  
  return flagCache;
}

/**
 * Compare semantic versions
 */
function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

/**
 * Generate stable hash for rollout percentage
 */
function getStableHash(key: string, identifier: string): number {
  const hash = createHash('sha256')
    .update(`${key}:${identifier}`)
    .digest('hex');
  
  // Convert first 8 characters to number 0-100
  const intValue = parseInt(hash.substring(0, 8), 16);
  return intValue % 100;
}

/**
 * Check if feature is enabled for given context
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  context: FeatureFlagContext
): Promise<boolean> {
  try {
    // Load flags
    const flags = await loadFeatureFlags(context.environment);
    const flag = flags[key];
    
    // If flag doesn't exist, default to disabled
    if (!flag) {
      return false;
    }
    
    // If flag is globally disabled, return false
    if (!flag.enabled) {
      return false;
    }
    
    // Check country restrictions
    if (flag.allowedCountries.length > 0 && context.country) {
      if (!flag.allowedCountries.includes(context.country)) {
        return false;
      }
    }
    
    // Check version restrictions
    if (context.appVersion) {
      if (flag.minAppVersion && compareVersions(context.appVersion, flag.minAppVersion) < 0) {
        return false;
      }
      
      if (flag.maxAppVersion && compareVersions(context.appVersion, flag.maxAppVersion) > 0) {
        return false;
      }
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const identifier = context.userId || context.deviceId || 'anonymous';
      const userHash = getStableHash(key, identifier);
      
      if (userHash >= flag.rolloutPercentage) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking feature flag ${key}:`, error);
    // Fail closed - disable feature on error
    return false;
  }
}

/**
 * Check multiple features at once
 */
export async function checkFeatures(
  keys: FeatureFlagKey[],
  context: FeatureFlagContext
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  
  for (const key of keys) {
    results[key] = await isFeatureEnabled(key, context);
  }
  
  return results;
}

/**
 * Create feature unavailable error response
 */
export function createFeatureUnavailableError(featureName: string): {
  error: string;
  message: string;
  code: string;
} {
  return {
    error: 'FEATURE_UNAVAILABLE',
    message: `The ${featureName} feature is temporarily unavailable. Please try again later.`,
    code: 'feature_temporarily_unavailable'
  };
}

/**
 * Initialize default feature flags (for fresh installations)
 */
export async function initializeDefaultFeatureFlags(): Promise<void> {
  const defaultFlags: FeatureFlag[] = [
    {
      key: 'chat_paid_v1',
      enabled: true,
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'calendar_v1',
      enabled: true,
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'events_v1',
      enabled: false, // Start disabled, enable per region
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: ['PL', 'EE', 'LT', 'LV'],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'feed_v1',
      enabled: true,
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'ai_assist_v1',
      enabled: true,
      env: 'PRODUCTION',
      rolloutPercentage: 20, // Limited rollout
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'web_token_store_v1',
      enabled: true,
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    {
      key: 'panic_button_v1',
      enabled: true,
      env: 'GLOBAL',
      rolloutPercentage: 100,
      allowedCountries: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }
  ];
  
  const batch = db.batch();
  
  for (const flag of defaultFlags) {
    const docRef = db.collection('featureFlags').doc(flag.key);
    batch.set(docRef, flag, { merge: true });
  }
  
  await batch.commit();
  console.log('Default feature flags initialized');
}