/**
 * PACK 353 — Global Rate Limiting (Server-Side)
 * 
 * Purpose: Protect Avalo from traffic spikes and abuse
 * Implements: Redis/Firestore-based rate limiting with TTL reset
 */

import * as admin from 'firebase-admin';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
}

// Rate limit configuration
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Chat paid: max messages per minute per user
  CHAT_PAID: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes block
  },
  
  // Voice/Video: max 1 active session per user
  VOICE_VIDEO: {
    maxRequests: 1,
    windowMs: 0, // No window, just concurrent check
    blockDurationMs: 0,
  },
  
  // Token purchases: max 3 per 10 minutes
  TOKEN_PURCHASE: {
    maxRequests: 3,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 10 * 60 * 1000, // 10 minutes block
  },
  
  // Support tickets: max 3 per 24 hours
  SUPPORT_TICKETS: {
    maxRequests: 3,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  
  // Panic triggers: max 2 per 10 minutes
  PANIC_TRIGGERS: {
    maxRequests: 2,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
  },
};

export type RateLimitType = keyof typeof RATE_LIMITS;

interface RateLimitRecord {
  userId: string;
  type: RateLimitType;
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
  lastRequest: number;
}

/**
 * Check if user has exceeded rate limit
 */
export async function checkRateLimit(
  userId: string,
  type: RateLimitType
): Promise<{ allowed: boolean; retryAfter?: number; reason?: string }> {
  const db = admin.firestore();
  const config = RATE_LIMITS[type];
  const now = Date.now();
  
  const recordRef = db.collection('rateLimits').doc(`${userId}_${type}`);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(recordRef);
      const data = doc.data() as RateLimitRecord | undefined;
      
      // Check if temporarily blocked
      if (data?.blocked && data.blockedUntil && data.blockedUntil > now) {
        return {
          allowed: false,
          retryAfter: Math.ceil((data.blockedUntil - now) / 1000),
          reason: 'TEMPORARILY_BLOCKED',
        };
      }
      
      // Initialize or reset window
      if (!data || now - data.windowStart > config.windowMs) {
        transaction.set(recordRef, {
          userId,
          type,
          count: 1,
          windowStart: now,
          blocked: false,
          lastRequest: now,
        });
        
        return { allowed: true };
      }
      
      // Check if limit exceeded
      if (data.count >= config.maxRequests) {
        // Apply temporary block
        const blockedUntil = now + config.blockDurationMs;
        
        transaction.update(recordRef, {
          blocked: true,
          blockedUntil,
          lastRequest: now,
        });
        
        // Log rate limit violation
        await logRateLimitViolation(userId, type, data.count);
        
        return {
          allowed: false,
          retryAfter: Math.ceil(config.blockDurationMs / 1000),
          reason: 'RATE_LIMIT_EXCEEDED',
        };
      }
      
      // Increment counter
      transaction.update(recordRef, {
        count: admin.firestore.FieldValue.increment(1),
        lastRequest: now,
      });
      
      return { allowed: true };
    });
    
    return result;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow request but log error
    return { allowed: true };
  }
}

/**
 * Check active sessions (for voice/video)
 */
export async function checkActiveSessions(
  userId: string,
  sessionType: 'voice' | 'video'
): Promise<{ allowed: boolean; activeSessionId?: string }> {
  const db = admin.firestore();
  
  try {
    const activeSessions = await db
      .collection('callSessions')
      .where('userId', '==', userId)
      .where('type', '==', sessionType)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!activeSessions.empty) {
      return {
        allowed: false,
        activeSessionId: activeSessions.docs[0].id,
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('Active session check error:', error);
    // Fail open
    return { allowed: true };
  }
}

/**
 * Reset rate limit for a user (admin only)
 */
export async function resetRateLimit(
  userId: string,
  type?: RateLimitType
): Promise<void> {
  const db = admin.firestore();
  
  if (type) {
    // Reset specific type
    await db.collection('rateLimits').doc(`${userId}_${type}`).delete();
  } else {
    // Reset all types for user
    const batch = db.batch();
    const types = Object.keys(RATE_LIMITS) as RateLimitType[];
    
    for (const t of types) {
      const ref = db.collection('rateLimits').doc(`${userId}_${t}`);
      batch.delete(ref);
    }
    
    await batch.commit();
  }
}

/**
 * Get rate limit status for user
 */
export async function getRateLimitStatus(
  userId: string
): Promise<Record<RateLimitType, {
  count: number;
  limit: number;
  blocked: boolean;
  retryAfter?: number;
}>> {
  const db = admin.firestore();
  const now = Date.now();
  const types = Object.keys(RATE_LIMITS) as RateLimitType[];
  const status: any = {};
  
  for (const type of types) {
    const doc = await db.collection('rateLimits').doc(`${userId}_${type}`).get();
    const data = doc.data() as RateLimitRecord | undefined;
    const config = RATE_LIMITS[type];
    
    if (!data) {
      status[type] = {
        count: 0,
        limit: config.maxRequests,
        blocked: false,
      };
    } else {
      const retryAfter = data.blockedUntil && data.blockedUntil > now
        ? Math.ceil((data.blockedUntil - now) / 1000)
        : undefined;
      
      status[type] = {
        count: data.count,
        limit: config.maxRequests,
        blocked: data.blocked && !!retryAfter,
        retryAfter,
      };
    }
  }
  
  return status;
}

/**
 * Log rate limit violation
 */
async function logRateLimitViolation(
  userId: string,
  type: RateLimitType,
  attempts: number
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('rateLimitViolations').add({
    userId,
    type,
    attempts,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    severity: attempts > RATE_LIMITS[type].maxRequests * 2 ? 'high' : 'medium',
  });
}

/**
 * Clean up old rate limit records (run periodically)
 */
export async function cleanupRateLimits(): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
  
  const batch = db.batch();
  const oldRecords = await db
    .collection('rateLimits')
    .where('lastRequest', '<', cutoffTime)
    .limit(500)
    .get();
  
  oldRecords.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Cleaned up ${oldRecords.size} old rate limit records`);
}
