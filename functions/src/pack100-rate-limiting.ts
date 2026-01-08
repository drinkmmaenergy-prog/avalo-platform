/**
 * PACK 100 — Enhanced Rate Limiting & Abuse Mitigation
 * 
 * Production-grade rate limiting for all critical endpoints
 * Prevents abuse and ensures system stability under high load
 * 
 * COMPLIANCE RULES:
 * - Rate limiting does NOT affect tokenomics or revenue split
 * - No free tokens, bonuses, or discounts for bypassing limits
 * - Limits are for system stability, not monetization changes
 */

import { db, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logTechEvent } from './pack90-logging';

// ============================================================================
// TYPES
// ============================================================================

export type RateLimitAction =
  | 'LOGIN'
  | 'SESSION_CREATE'
  | 'MESSAGE_SEND'
  | 'MEDIA_UPLOAD'
  | 'REPORT_SUBMIT'
  | 'DISPUTE_CREATE'
  | 'PAYOUT_REQUEST'
  | 'KYC_SUBMIT'
  | 'CHAT_CREATE'
  | 'CALL_START'
  | 'PROFILE_UPDATE'
  | 'CONTENT_CREATE';

export interface RateLimitConfig {
  action: RateLimitAction;
  maxRequests: number;
  windowSeconds: number;
  burstAllowance?: number; // Allow temporary burst over limit
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitViolation {
  userId: string;
  action: RateLimitAction;
  count: number;
  windowStart: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// DEFAULT RATE LIMIT CONFIGURATIONS
// ============================================================================

const DEFAULT_RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  LOGIN: {
    action: 'LOGIN',
    maxRequests: 10,
    windowSeconds: 300, // 10 attempts per 5 minutes
  },
  SESSION_CREATE: {
    action: 'SESSION_CREATE',
    maxRequests: 5,
    windowSeconds: 300, // 5 sessions per 5 minutes
  },
  MESSAGE_SEND: {
    action: 'MESSAGE_SEND',
    maxRequests: 100,
    windowSeconds: 3600, // 100 messages per hour
    burstAllowance: 120,
  },
  MEDIA_UPLOAD: {
    action: 'MEDIA_UPLOAD',
    maxRequests: 20,
    windowSeconds: 3600, // 20 uploads per hour
  },
  REPORT_SUBMIT: {
    action: 'REPORT_SUBMIT',
    maxRequests: 10,
    windowSeconds: 3600, // 10 reports per hour
  },
  DISPUTE_CREATE: {
    action: 'DISPUTE_CREATE',
    maxRequests: 5,
    windowSeconds: 86400, // 5 disputes per day
  },
  PAYOUT_REQUEST: {
    action: 'PAYOUT_REQUEST',
    maxRequests: 3,
    windowSeconds: 86400, // 3 payout requests per day
  },
  KYC_SUBMIT: {
    action: 'KYC_SUBMIT',
    maxRequests: 3,
    windowSeconds: 86400, // 3 KYC submissions per day
  },
  CHAT_CREATE: {
    action: 'CHAT_CREATE',
    maxRequests: 50,
    windowSeconds: 3600, // 50 chat initiations per hour
  },
  CALL_START: {
    action: 'CALL_START',
    maxRequests: 20,
    windowSeconds: 3600, // 20 call starts per hour
  },
  PROFILE_UPDATE: {
    action: 'PROFILE_UPDATE',
    maxRequests: 10,
    windowSeconds: 300, // 10 updates per 5 minutes
  },
  CONTENT_CREATE: {
    action: 'CONTENT_CREATE',
    maxRequests: 30,
    windowSeconds: 3600, // 30 content creations per hour
  },
};

// ============================================================================
// RATE LIMIT CHECK
// ============================================================================

/**
 * Check if a user has exceeded rate limit for an action
 * Returns whether action is allowed and metadata
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction
): Promise<RateLimitResult> {
  try {
    const config = DEFAULT_RATE_LIMITS[action];
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);
    const windowId = Math.floor(now / (config.windowSeconds * 1000));
    
    const docId = `${userId}_${action}_${windowId}`;
    const limitRef = db.collection('rate_limit_counters').doc(docId);
    
    // Use transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(limitRef);
      
      if (!doc.exists) {
        // First request in this window
        transaction.set(limitRef, {
          userId,
          action,
          windowId,
          count: 1,
          windowStart: Timestamp.fromMillis(windowStart),
          lastRequestAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: windowStart + (config.windowSeconds * 1000),
        };
      }
      
      const data = doc.data();
      const currentCount = data?.count || 0;
      
      // Check if limit exceeded
      const maxAllowed = config.burstAllowance || config.maxRequests;
      if (currentCount >= maxAllowed) {
        // Log violation
        await logRateLimitViolation(userId, action, currentCount);
        
        return {
          allowed: false,
          remaining: 0,
          resetAt: windowStart + (config.windowSeconds * 1000),
          retryAfter: Math.ceil((windowStart + (config.windowSeconds * 1000) - now) / 1000),
        };
      }
      
      // Increment counter
      transaction.update(limitRef, {
        count: increment(1),
        lastRequestAt: serverTimestamp(),
      });
      
      return {
        allowed: true,
        remaining: maxAllowed - currentCount - 1,
        resetAt: windowStart + (config.windowSeconds * 1000),
      };
    });
    
    return result;
  } catch (error) {
    console.error(`[RateLimit] Error checking rate limit for ${action}:`, error);
    
    // Log error but allow request (fail open for availability)
    await logTechEvent({
      level: 'ERROR',
      category: 'SERVICE',
      functionName: 'checkRateLimit',
      message: `Rate limit check failed for action ${action}`,
      context: { userId, action, error: String(error) },
    });
    
    return {
      allowed: true,
      remaining: 999,
      resetAt: Date.now() + 3600000,
    };
  }
}

/**
 * Log a rate limit violation
 */
async function logRateLimitViolation(
  userId: string,
  action: RateLimitAction,
  count: number
): Promise<void> {
  try {
    const violationRef = db.collection('rate_limit_violations').doc();
    
    await violationRef.set({
      userId,
      action,
      count,
      windowStart: Timestamp.now(),
      createdAt: serverTimestamp(),
    });
    
    // Log to tech event log
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'checkRateLimit',
      message: `Rate limit exceeded for ${action}`,
      context: { userId, action, count },
    });
  } catch (error) {
    console.error('[RateLimit] Failed to log violation:', error);
    // Non-blocking
  }
}

// ============================================================================
// RATE LIMIT MIDDLEWARE
// ============================================================================

/**
 * Middleware to enforce rate limits on Cloud Functions
 * Usage: Wrap your function logic with this middleware
 * 
 * Example:
 * ```
 * export const myFunction = functions.https.onCall(async (data, context) => {
 *   return await enforceRateLimit(context.auth?.uid, 'MESSAGE_SEND', async () => {
 *     // Your function logic here
 *     return { success: true };
 *   });
 * });
 * ```
 */
export async function enforceRateLimit<T>(
  userId: string | undefined,
  action: RateLimitAction,
  handler: () => Promise<T>
): Promise<T> {
  if (!userId) {
    throw new Error('UNAUTHENTICATED: User ID required for rate limiting');
  }
  
  const result = await checkRateLimit(userId, action);
  
  if (!result.allowed) {
    const error: any = new Error('RATE_LIMITED: Too many requests');
    error.code = 'RATE_LIMITED';
    error.details = {
      action,
      retryAfter: result.retryAfter,
      resetAt: result.resetAt,
    };
    throw error;
  }
  
  return await handler();
}

// ============================================================================
// GLOBAL RATE LIMITING (PER-IP OR PER-DEVICE)
// ============================================================================

/**
 * Check global rate limit (not tied to specific user)
 * Used for anonymous endpoints like login, signup
 */
export async function checkGlobalRateLimit(
  identifier: string, // IP address or device ID
  action: RateLimitAction
): Promise<RateLimitResult> {
  try {
    const config = DEFAULT_RATE_LIMITS[action];
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);
    const windowId = Math.floor(now / (config.windowSeconds * 1000));
    
    const docId = `global_${identifier}_${action}_${windowId}`;
    const limitRef = db.collection('global_rate_limit_counters').doc(docId);
    
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(limitRef);
      
      if (!doc.exists) {
        transaction.set(limitRef, {
          identifier,
          action,
          windowId,
          count: 1,
          windowStart: Timestamp.fromMillis(windowStart),
          lastRequestAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: windowStart + (config.windowSeconds * 1000),
        };
      }
      
      const data = doc.data();
      const currentCount = data?.count || 0;
      
      if (currentCount >= config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: windowStart + (config.windowSeconds * 1000),
          retryAfter: Math.ceil((windowStart + (config.windowSeconds * 1000) - now) / 1000),
        };
      }
      
      transaction.update(limitRef, {
        count: increment(1),
        lastRequestAt: serverTimestamp(),
      });
      
      return {
        allowed: true,
        remaining: config.maxRequests - currentCount - 1,
        resetAt: windowStart + (config.windowSeconds * 1000),
      };
    });
    
    return result;
  } catch (error) {
    console.error('[RateLimit] Error checking global rate limit:', error);
    
    // Fail open
    return {
      allowed: true,
      remaining: 999,
      resetAt: Date.now() + 3600000,
    };
  }
}

// ============================================================================
// ADMIN QUERIES
// ============================================================================

/**
 * Get rate limit violations for a specific user
 * Admin-only function
 */
export async function getUserViolations(
  userId: string,
  limit: number = 50
): Promise<RateLimitViolation[]> {
  try {
    const snapshot = await db.collection('rate_limit_violations')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as RateLimitViolation);
  } catch (error) {
    console.error('[RateLimit] Error fetching user violations:', error);
    return [];
  }
}

/**
 * Get top offenders across all rate limits
 * Admin-only function
 */
export async function getTopOffenders(
  limit: number = 20
): Promise<Array<{ userId: string; violationCount: number }>> {
  try {
    const snapshot = await db.collection('rate_limit_violations')
      .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .limit(1000)
      .get();
    
    const userCounts = new Map<string, number>();
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const userId = data.userId;
      userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
    }
    
    return Array.from(userCounts.entries())
      .map(([userId, violationCount]) => ({ userId, violationCount }))
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, limit);
  } catch (error) {
    console.error('[RateLimit] Error fetching top offenders:', error);
    return [];
  }
}