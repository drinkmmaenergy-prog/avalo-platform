/**
 * PACK 426 — Global Rate Limiting
 * 
 * Distributed rate limiting across regions to prevent abuse and ensure
 * fair resource allocation.
 */

import { https, logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { Region } from './pack426-global-router';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  action: RateLimitAction;
  limit: number;
  window: number; // milliseconds
  region?: Region;
  tier?: 'free' | 'premium' | 'vip';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export type RateLimitAction =
  | 'chat-send'
  | 'swipe'
  | 'login'
  | 'token-purchase'
  | 'ai-session'
  | 'calendar-action'
  | 'profile-update'
  | 'feed-post'
  | 'report-user'
  | 'media-upload'
  | 'voice-call'
  | 'video-call';

// ============================================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================================

// Base limits for free tier users
export const BASE_RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  'chat-send': {
    action: 'chat-send',
    limit: 100,
    window: 60000, // 100 messages per minute
  },
  'swipe': {
    action: 'swipe',
    limit: 50,
    window: 60000, // 50 swipes per minute
  },
  'login': {
    action: 'login',
    limit: 5,
    window: 300000, // 5 attempts per 5 minutes
  },
  'token-purchase': {
    action: 'token-purchase',
    limit: 10,
    window: 3600000, // 10 purchases per hour
  },
  'ai-session': {
    action: 'ai-session',
    limit: 20,
    window: 3600000, // 20 sessions per hour
  },
  'calendar-action': {
    action: 'calendar-action',
    limit: 30,
    window: 60000, // 30 actions per minute
  },
  'profile-update': {
    action: 'profile-update',
    limit: 10,
    window: 300000, // 10 updates per 5 minutes
  },
  'feed-post': {
    action: 'feed-post',
    limit: 10,
    window: 3600000, // 10 posts per hour
  },
  'report-user': {
    action: 'report-user',
    limit: 5,
    window: 3600000, // 5 reports per hour
  },
  'media-upload': {
    action: 'media-upload',
    limit: 20,
    window: 3600000, // 20 uploads per hour
  },
  'voice-call': {
    action: 'voice-call',
    limit: 10,
    window: 3600000, // 10 calls per hour
  },
  'video-call': {
    action: 'video-call',
    limit: 10,
    window: 3600000, // 10 calls per hour
  },
};

// Multipliers by subscription tier
const TIER_MULTIPLIERS = {
  free: 1.0,
  premium: 2.0,
  vip: 5.0,
};

// ============================================================================
// RATE LIMITING LOGIC
// ============================================================================

/**
 * Check if action is allowed for user
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  region?: Region
): Promise<RateLimitResult> {
  const db = getFirestore();
  
  // Get user tier
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const tier = getUserTier(userData);
  
  // Get rate limit configuration
  const config = getRateLimitConfig(action, tier, region);
  
  // Calculate window
  const now = Date.now();
  const windowStart = now - config.window;
  
  // Get or create rate limit document
  const limitKey = getRateLimitKey(userId, action, config.window);
  const limitRef = db
    .collection('infrastructure')
    .doc('rateLimits')
    .collection('limits')
    .doc(limitKey);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const limitDoc = await transaction.get(limitRef);
      
      let count = 0;
      let windowStartTime = now;
      
      if (limitDoc.exists) {
        const data = limitDoc.data();
        count = data?.count || 0;
        windowStartTime = data?.windowStart || now;
        
        // Check if window has expired
        if (now - windowStartTime >= config.window) {
          // Reset window
          count = 0;
          windowStartTime = now;
        }
      }
      
      // Check if limit exceeded
      if (count >= config.limit) {
        const resetAt = windowStartTime + config.window;
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: resetAt - now,
        };
      }
      
      // Increment count
      transaction.set(limitRef, {
        userId,
        action,
        count: count + 1,
        windowStart: windowStartTime,
        lastAction: now,
        tier,
        region,
      }, { merge: true });
      
      return {
        allowed: true,
        remaining: config.limit - count - 1,
        resetAt: windowStartTime + config.window,
      };
    });
    
    // Log if approaching limit
    if (result.remaining < 5) {
      logger.warn(`User ${userId} approaching rate limit for ${action}: ${result.remaining} remaining`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Rate limit check failed for ${userId}:`, error);
    
    // Fail open (allow action) to prevent blocking users during database issues
    return {
      allowed: true,
      remaining: config.limit,
      resetAt: now + config.window,
    };
  }
}

/**
 * Get rate limit configuration for action
 */
function getRateLimitConfig(
  action: RateLimitAction,
  tier: 'free' | 'premium' | 'vip',
  region?: Region
): RateLimitConfig {
  const baseConfig = BASE_RATE_LIMITS[action];
  const multiplier = TIER_MULTIPLIERS[tier];
  
  return {
    ...baseConfig,
    limit: Math.floor(baseConfig.limit * multiplier),
    tier,
    region,
  };
}

/**
 * Get user tier from user data
 */
function getUserTier(userData: any): 'free' | 'premium' | 'vip' {
  if (userData?.vipStatus?.active) return 'vip';
  if (userData?.subscription?.active) return 'premium';
  return 'free';
}

/**
 * Generate rate limit key for user + action + window
 */
function getRateLimitKey(
  userId: string,
  action: RateLimitAction,
  window: number
): string {
  const now = Date.now();
  const windowIndex = Math.floor(now / window);
  return `${userId}-${action}-${windowIndex}`;
}

// ============================================================================
// BURST PROTECTION
// ============================================================================

/**
 * Check for burst behavior (too many actions too quickly)
 */
export async function checkBurstProtection(
  userId: string,
  action: RateLimitAction
): Promise<boolean> {
  const db = getFirestore();
  
  const burstKey = `${userId}-${action}-burst`;
  const burstRef = db
    .collection('infrastructure')
    .doc('rateLimits')
    .collection('bursts')
    .doc(burstKey);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const burstDoc = await transaction.get(burstRef);
      const now = Date.now();
      
      if (!burstDoc.exists) {
        // First action, create burst tracker
        transaction.set(burstRef, {
          userId,
          action,
          timestamps: [now],
          lastAction: now,
        });
        return true;
      }
      
      const data = burstDoc.data();
      let timestamps: number[] = data?.timestamps || [];
      
      // Remove timestamps older than 10 seconds
      timestamps = timestamps.filter(t => now - t < 10000);
      
      // Check if burst limit exceeded (>20 actions in 10 seconds)
      if (timestamps.length >= 20) {
        logger.warn(`Burst limit exceeded for user ${userId} on ${action}`);
        return false;
      }
      
      // Add current timestamp
      timestamps.push(now);
      
      transaction.set(burstRef, {
        userId,
        action,
        timestamps,
        lastAction: now,
      });
      
      return true;
    });
    
    return result;
  } catch (error) {
    logger.error(`Burst check failed for ${userId}:`, error);
    return true; // Fail open
  }
}

// ============================================================================
// REGIONAL RATE LIMITING
// ============================================================================

/**
 * Check regional rate limit (for high-load features)
 */
export async function checkRegionalRateLimit(
  region: Region,
  action: RateLimitAction,
  limit: number,
  window: number
): Promise<boolean> {
  const db = getFirestore();
  const now = Date.now();
  const windowStart = now - window;
  
  const limitKey = `${region}-${action}-${Math.floor(now / window)}`;
  const limitRef = db
    .collection('infrastructure')
    .doc('rateLimits')
    .collection('regional')
    .doc(limitKey);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const limitDoc = await transaction.get(limitRef);
      
      if (!limitDoc.exists) {
        transaction.set(limitRef, {
          region,
          action,
          count: 1,
          windowStart: now,
        });
        return true;
      }
      
      const data = limitDoc.data();
      const count = data?.count || 0;
      
      if (count >= limit) {
        logger.warn(`Regional rate limit exceeded for ${region} on ${action}`);
        return false;
      }
      
      transaction.set(limitRef, {
        region,
        action,
        count: count + 1,
        windowStart: data?.windowStart || now,
        lastAction: now,
      }, { merge: true });
      
      return true;
    });
    
    return result;
  } catch (error) {
    logger.error(`Regional rate limit check failed:`, error);
    return true; // Fail open
  }
}

// ============================================================================
// IP-BASED RATE LIMITING
// ============================================================================

/**
 * Check IP-based rate limit (for login attempts)
 */
export async function checkIPRateLimit(
  ipAddress: string,
  action: RateLimitAction,
  limit: number = 10,
  window: number = 300000 // 5 minutes
): Promise<RateLimitResult> {
  const db = getFirestore();
  const now = Date.now();
  
  const limitKey = `ip-${ipAddress}-${action}-${Math.floor(now / window)}`;
  const limitRef = db
    .collection('infrastructure')
    .doc('rateLimits')
    .collection('ip')
    .doc(limitKey);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const limitDoc = await transaction.get(limitRef);
      
      let count = 0;
      let windowStartTime = now;
      
      if (limitDoc.exists) {
        const data = limitDoc.data();
        count = data?.count || 0;
        windowStartTime = data?.windowStart || now;
        
        if (now - windowStartTime >= window) {
          count = 0;
          windowStartTime = now;
        }
      }
      
      if (count >= limit) {
        const resetAt = windowStartTime + window;
        logger.warn(`IP rate limit exceeded for ${ipAddress} on ${action}`);
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: resetAt - now,
        };
      }
      
      transaction.set(limitRef, {
        ipAddress,
        action,
        count: count + 1,
        windowStart: windowStartTime,
        lastAction: now,
      }, { merge: true });
      
      return {
        allowed: true,
        remaining: limit - count - 1,
        resetAt: windowStartTime + window,
      };
    });
    
    return result;
  } catch (error) {
    logger.error(`IP rate limit check failed:`, error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: now + window,
    };
  }
}

// ============================================================================
// RATE LIMIT BYPASS (ADMIN/TESTING)
// ============================================================================

/**
 * Check if user has rate limit bypass
 */
export async function hasRateLimitBypass(userId: string): Promise<boolean> {
  const db = getFirestore();
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    return userData?.rateLimitBypass === true || false;
  } catch (error) {
    logger.error(`Failed to check rate limit bypass for ${userId}:`, error);
    return false;
  }
}

/**
 * Grant rate limit bypass to user (admin only)
 */
export async function grantRateLimitBypass(
  userId: string,
  reason: string
): Promise<void> {
  const db = getFirestore();
  
  await db.collection('users').doc(userId).update({
    rateLimitBypass: true,
    rateLimitBypassReason: reason,
    rateLimitBypassGrantedAt: Date.now(),
  });
  
  logger.info(`Rate limit bypass granted to user ${userId}: ${reason}`);
}

// ============================================================================
// MONITORING & ANALYTICS
// ============================================================================

/**
 * Get rate limit statistics for user
 */
export async function getUserRateLimitStats(userId: string): Promise<{
  actions: Record<RateLimitAction, { count: number; remaining: number; resetAt: number }>;
}> {
  const db = getFirestore();
  
  const stats: Record<string, any> = {};
  
  for (const action of Object.keys(BASE_RATE_LIMITS) as RateLimitAction[]) {
    const result = await checkRateLimit(userId, action);
    stats[action] = {
      count: BASE_RATE_LIMITS[action].limit - result.remaining,
      remaining: result.remaining,
      resetAt: result.resetAt,
    };
  }
  
  return { actions: stats };
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Check rate limit via HTTP
 * POST /infrastructure/rate-limit/check
 */
export const checkRateLimitHTTP = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  try {
    const { userId, action, region } = req.body;
    
    if (!userId || !action) {
      res.status(400).json({
        success: false,
        error: 'userId and action are required',
      });
      return;
    }
    
    const result = await checkRateLimit(userId, action, region);
    
    res.status(result.allowed ? 200 : 429).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Rate limit check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check rate limit',
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkRateLimit,
  checkBurstProtection,
  checkRegionalRateLimit,
  checkIPRateLimit,
  hasRateLimitBypass,
  grantRateLimitBypass,
  getUserRateLimitStats,
  // HTTP functions
  checkRateLimitHTTP,
};
