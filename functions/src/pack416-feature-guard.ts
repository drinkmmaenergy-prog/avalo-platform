/**
 * PACK 416 — Backend Feature Guard & Kill-Switch Enforcer
 * 
 * Cloud Functions middleware and utilities for feature flag enforcement
 * 
 * Purpose:
 * - Wrap critical endpoints with feature flag checks
 * - Throw errors when features are disabled
 * - Cache flags in memory for performance
 * - Integration with existing function handlers
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  FeatureFlagKey,
  FeatureFlagConfig,
  FeatureFlagUserContext,
  isFeatureEnabled as checkFeatureEnabled,
  calculateRolloutBucket,
  SAFE_DEFAULTS,
} from '../../shared/config/pack416-feature-flags';

const db = getFirestore();

// In-memory cache with TTL for performance
interface CachedFlag {
  config: FeatureFlagConfig;
  timestamp: number;
}

const flagCache = new Map<string, CachedFlag>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

/**
 * Fetch feature flag from Firestore with caching
 * 
 * @param key Feature flag key
 * @returns Feature flag configuration or null
 */
async function getFeatureFlag(key: FeatureFlagKey): Promise<FeatureFlagConfig | null> {
  try {
    // Check cache first
    const cached = flagCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.config;
    }
    
    // Fetch from Firestore
    const flagRef = db.collection('featureFlags').doc(key);
    const snapshot = await flagRef.get();
    
    if (snapshot.exists) {
      const config = snapshot.data() as FeatureFlagConfig;
      
      // Update cache
      flagCache.set(key, { config, timestamp: Date.now() });
      
      return config;
    }
    
    return null;
  } catch (error) {
    console.error(`[FeatureGuard] Error fetching flag ${key}:`, error);
    return null;
  }
}

/**
 * Build user context from Firebase Auth context and additional data
 * 
 * @param context Firebase CallableContext
 * @param additionalContext Additional context data
 * @returns User context for feature evaluation
 */
async function buildUserContext(
  context: functions.https.CallableContext,
  additionalContext?: Partial<FeatureFlagUserContext>
): Promise<FeatureFlagUserContext> {
  const userId = context.auth?.uid;
  
  // In production, fetch user profile data here
  // For now, use provided context or defaults
  return {
    userId,
    rolloutBucket: userId ? calculateRolloutBucket(userId) : Math.floor(Math.random() * 100),
    country: additionalContext?.country,
    isVip: additionalContext?.isVip ?? false,
    isRoyal: additionalContext?.isRoyal ?? false,
    isCreator: additionalContext?.isCreator ?? false,
    isAdmin: additionalContext?.isAdmin ?? false,
  };
}

/**
 * Assert that a feature is enabled, throw error if disabled
 * 
 * USE THIS to guard critical endpoints
 * 
 * @param key Feature flag key to check
 * @param context Firebase CallableContext
 * @param contextInfo Additional context for feature evaluation
 * @throws functions.https.HttpsError if feature is disabled
 */
export async function assertFeatureEnabled(
  key: FeatureFlagKey,
  context: functions.https.CallableContext,
  contextInfo?: Partial<FeatureFlagUserContext>
): Promise<void> {
  try {
    const config = await getFeatureFlag(key);
    const userContext = await buildUserContext(context, contextInfo);
    
    let enabled: boolean;
    
    if (config) {
      enabled = checkFeatureEnabled(config, userContext);
    } else {
      // Use safe default if config not found
      enabled = SAFE_DEFAULTS[key] ?? false;
    }
    
    if (!enabled) {
      // Log the blocked attempt
      await logFeatureBlock(key, context.auth?.uid, userContext);
      
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Feature '${key}' is currently disabled`,
        { featureKey: key, enabled: false }
      );
    }
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // On error, use safe default
    const safeDefault = SAFE_DEFAULTS[key] ?? false;
    
    if (!safeDefault) {
      console.error(`[FeatureGuard] Error checking feature ${key}, blocking by default:`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error checking feature availability',
        { featureKey: key }
      );
    }
    
    console.warn(`[FeatureGuard] Error checking feature ${key}, allowing by safe default:`, error);
  }
}

/**
 * Check if a feature is enabled (non-throwing version)
 * Use this when you want to conditionally enable functionality without blocking
 * 
 * @param key Feature flag key to check
 * @param context Firebase CallableContext
 * @param contextInfo Additional context for feature evaluation
 * @returns Promise resolving to enabled status
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  context: functions.https.CallableContext,
  contextInfo?: Partial<FeatureFlagUserContext>
): Promise<boolean> {
  try {
    const config = await getFeatureFlag(key);
    const userContext = await buildUserContext(context, contextInfo);
    
    if (config) {
      return checkFeatureEnabled(config, userContext);
    }
    
    return SAFE_DEFAULTS[key] ?? false;
  } catch (error) {
    console.error(`[FeatureGuard] Error checking feature ${key}:`, error);
    return SAFE_DEFAULTS[key] ?? false;
  }
}

/**
 * Check multiple features at once
 * 
 * @param keys Feature flag keys to check
 * @param context Firebase CallableContext
 * @param contextInfo Additional context for feature evaluation
 * @returns Promise resolving to map of key -> enabled status
 */
export async function checkFeatures(
  keys: FeatureFlagKey[],
  context: functions.https.CallableContext,
  contextInfo?: Partial<FeatureFlagUserContext>
): Promise<Record<FeatureFlagKey, boolean>> {
  const results: Record<string, boolean> = {};
  
  await Promise.all(
    keys.map(async (key) => {
      results[key] = await isFeatureEnabled(key, context, contextInfo);
    })
  );
  
  return results as Record<FeatureFlagKey, boolean>;
}

/**
 * Log when a feature access is blocked
 * Used for monitoring and analytics
 */
async function logFeatureBlock(
  key: FeatureFlagKey,
  userId: string | undefined,
  userContext: FeatureFlagUserContext
): Promise<void> {
  try {
    await db.collection('featureBlocks').add({
      featureKey: key,
      userId: userId || null,
      userContext,
      timestamp: FieldValue.serverTimestamp(),
      reason: 'FEATURE_DISABLED',
    });
  } catch (error) {
    console.error('[FeatureGuard] Error logging feature block:', error);
  }
}

/**
 * Decorator/wrapper function to guard Cloud Functions
 *
 * Example usage:
 * ```typescript
 * export const startPaidChat = guardFeature(
 *   FeatureFlagKey.chat_paid,
 *   async (data, context) => {
 *     // Your handler logic here
 *   }
 * );
 * ```
 */
export function guardFeature<T = any, R = any>(
  featureKey: FeatureFlagKey,
  handler: (data: T, context: functions.https.CallableContext) => R | Promise<R>
) {
  return functions.https.onCall(async (data: T, context) => {
    // Check feature flag before executing handler
    await assertFeatureEnabled(featureKey, context);
    
    // Execute original handler
    return handler(data, context);
  });
}

/**
 * Express middleware for HTTP functions
 * 
 * Example usage:
 * ```typescript
 * export const webhookHandler = functions.https.onRequest(
 *   featureMiddleware(FeatureFlagKey.webhooks, async (req, res) => {
 *     // Your handler logic here
 *   })
 * );
 * ```
 */
export function featureMiddleware(
  featureKey: FeatureFlagKey,
  handler: (req: functions.https.Request, res: functions.Response) => void | Promise<void>
): (req: functions.https.Request, res: functions.Response) => Promise<void> {
  return async (req, res) => {
    try {
      const config = await getFeatureFlag(featureKey);
      
      // For HTTP requests, we don't have rich user context
      // Check basic enabled status
      const enabled = config ? config.enabled : SAFE_DEFAULTS[featureKey] ?? false;
      
      if (!enabled) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: `Feature '${featureKey}' is currently disabled`,
          featureKey,
        });
        return;
      }
      
      // Execute original handler
      await handler(req, res);
    } catch (error) {
      console.error(`[FeatureGuard] Error in middleware for ${featureKey}:`, error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error checking feature availability',
      });
    }
  };
}

/**
 * Clear feature flag cache
 * Useful for testing or manual cache invalidation
 */
export function clearFeatureFlagCache(): void {
  flagCache.clear();
}

/**
 * Get cache statistics (for monitoring)
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: flagCache.size,
    keys: Array.from(flagCache.keys()),
  };
}
