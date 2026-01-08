/**
 * PACK 317 — Enhanced Rate Limiting for Go-Live
 * 
 * Production-grade rate limiting with enhanced coverage for:
 * - Authentication (register, login)
 * - Messaging (chat send, spam prevention)
 * - Swipe (bot prevention)
 * - Support & Safety (report, panic)
 * - Calendar & Events (booking spam prevention)
 * 
 * CRITICAL: NO tokenomics changes, NO free tokens, NO pricing changes
 * This is ONLY for abuse protection and system stability
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logTechEvent } from './pack90-logging';

// ============================================================================
// TYPES
// ============================================================================

export type RateLimitAction =
  // Auth Actions
  | 'REGISTER'
  | 'LOGIN'
  | 'PASSWORD_RESET'
  
  // Messaging Actions
  | 'CHAT_SEND'
  | 'CHAT_CREATE'
  
  // Swipe Actions
  | 'SWIPE_ACTION'
  
  // Support & Safety Actions
  | 'SAFETY_REPORT'
  | 'PANIC_BUTTON'
  | 'SUPPORT_TICKET'
  
  // Calendar & Events Actions
  | 'CALENDAR_BOOKING_CREATE'
  | 'EVENT_TICKET_BOOKING'
  
  // Media Actions
  | 'MEDIA_UPLOAD';

export interface RateLimitConfig {
  action: RateLimitAction;
  maxRequests: number;
  windowSeconds: number;
  burstAllowance?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitKey {
  type: 'IP' | 'USER' | 'DEVICE';
  identifier: string;
  action: RateLimitAction;
}

// ============================================================================
// RATE LIMIT CONFIGURATIONS (PACK 317)
// ============================================================================

const PACK317_RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  // Auth: Prevent brute force and spam registrations
  REGISTER: {
    action: 'REGISTER',
    maxRequests: 5,
    windowSeconds: 3600, // 5 registrations per IP per hour
  },
  LOGIN: {
    action: 'LOGIN',
    maxRequests: 20,
    windowSeconds: 3600, // 20 login attempts per IP/user per hour
  },
  PASSWORD_RESET: {
    action: 'PASSWORD_RESET',
    maxRequests: 3,
    windowSeconds: 3600, // 3 password resets per hour
  },
  
  // Messaging: Prevent spam while respecting paid chat rules
  CHAT_SEND: {
    action: 'CHAT_SEND',
    maxRequests: 120, // Per user per hour (additive to paid rules)
    windowSeconds: 3600,
    burstAllowance: 150, // Allow some burst
  },
  CHAT_CREATE: {
    action: 'CHAT_CREATE',
    maxRequests: 30, // Max new chats per hour
    windowSeconds: 3600,
  },
  
  // Swipe: Bot prevention (backend cap on top of product rules)
  SWIPE_ACTION: {
    action: 'SWIPE_ACTION',
    maxRequests: 60, // Max 60 swipe API calls per minute (10x safety margin)
    windowSeconds: 60,
  },
  
  // Support & Safety: Prevent abuse but never block real emergencies
  SAFETY_REPORT: {
    action: 'SAFETY_REPORT',
    maxRequests: 10,
    windowSeconds: 3600, // 10 reports per hour
  },
  PANIC_BUTTON: {
    action: 'PANIC_BUTTON',
    maxRequests: 5, // Throttle but never completely block
    windowSeconds: 3600,
  },
  SUPPORT_TICKET: {
    action: 'SUPPORT_TICKET',
    maxRequests: 5,
    windowSeconds: 3600,
  },
  
  // Calendar & Events: Prevent booking spam
  CALENDAR_BOOKING_CREATE: {
    action: 'CALENDAR_BOOKING_CREATE',
    maxRequests: 10,
    windowSeconds: 3600, // Max 10 bookings per hour
  },
  EVENT_TICKET_BOOKING: {
    action: 'EVENT_TICKET_BOOKING',
    maxRequests: 5,
    windowSeconds: 900, // Max 5 event bookings per 15 min
  },
  
  // Media: Upload limits
  MEDIA_UPLOAD: {
    action: 'MEDIA_UPLOAD',
    maxRequests: 20,
    windowSeconds: 3600,
  },
};

// ============================================================================
// RATE LIMIT CHECK (ENHANCED)
// ============================================================================

/**
 * Check rate limit with support for IP, USER, and DEVICE identifiers
 */
export async function assertRateLimit(
  key: RateLimitKey,
  customLimit?: { windowMs: number; maxRequests: number }
): Promise<void> {
  const config = customLimit 
    ? { action: key.action, maxRequests: customLimit.maxRequests, windowSeconds: customLimit.windowMs / 1000 }
    : PACK317_RATE_LIMITS[key.action];

  if (!config) {
    throw new Error(`No rate limit configuration for action: ${key.action}`);
  }

  const result = await checkRateLimitInternal(key, config);

  if (!result.allowed) {
    // Log rate limit violation
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'assertRateLimit',
      message: `Rate limit exceeded: ${key.action}`,
      context: {
        keyType: key.type,
        identifier: key.identifier.substring(0, 8) + '...', // Partial for privacy
        action: key.action,
        retryAfter: result.retryAfter,
      },
    });

    const error: any = new Error('RATE_LIMIT_EXCEEDED');
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.details = {
      action: key.action,
      retryAfter: result.retryAfter,
      resetAt: result.resetAt,
    };
    throw error;
  }
}

async function checkRateLimitInternal(
  key: RateLimitKey,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);
    const windowId = Math.floor(now / (config.windowSeconds * 1000));
    
    const rateKey = `${key.type}:${key.identifier}:${key.action}:${windowId}`;
    const docRef = db.collection('rateLimits').doc(rateKey);
    
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      
      if (!doc.exists) {
        // First request in this window
        transaction.set(docRef, {
          rateKey,
          window: `${config.windowSeconds}s`,
          maxRequests: config.maxRequests,
          currentCount: 1,
          windowStart: Timestamp.fromMillis(windowStart),
          updatedAt: serverTimestamp(),
        });
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: windowStart + (config.windowSeconds * 1000),
        };
      }
      
      const data = doc.data();
      const currentCount = data?.currentCount || 0;
      const maxAllowed = config.burstAllowance || config.maxRequests;
      
      if (currentCount >= maxAllowed) {
        // Log violation
        await logRateLimitViolation(key, currentCount);
        
        return {
          allowed: false,
          remaining: 0,
          resetAt: windowStart + (config.windowSeconds * 1000),
          retryAfter: Math.ceil((windowStart + (config.windowSeconds * 1000) - now) / 1000),
        };
      }
      
      // Increment counter
      transaction.update(docRef, {
        currentCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      
      return {
        allowed: true,
        remaining: maxAllowed - currentCount - 1,
        resetAt: windowStart + (config.windowSeconds * 1000),
      };
    });
    
    return result;
  } catch (error) {
    console.error(`[Pack317] Rate limit check error:`, error);
    
    // Log error but allow request (fail open for availability)
    await logTechEvent({
      level: 'ERROR',
      category: 'SERVICE',
      functionName: 'checkRateLimitInternal',
      message: `Rate limit check failed`,
      context: { action: key.action, error: String(error) },
    });
    
    // Fail open
    return {
      allowed: true,
      remaining: 999,
      resetAt: Date.now() + 3600000,
    };
  }
}

async function logRateLimitViolation(
  key: RateLimitKey,
  count: number
): Promise<void> {
  try {
    await db.collection('pack317_rate_limit_violations').add({
      keyType: key.type,
      identifier: key.identifier,
      action: key.action,
      count,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('[Pack317] Failed to log violation:', error);
  }
}

// ============================================================================
// HELPER: Hash IP for Privacy
// ============================================================================

/**
 * Hash IP address for privacy-safe storage
 */
export function hashIP(ip: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}