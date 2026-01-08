/**
 * PACK 70 - Rate Limiting & Abuse Throttling
 *
 * Central rate limiting engine for Avalo.
 * Provides per-user, per-IP, and per-device quotas on critical flows
 * to protect against spam, floods, and accidental overload.
 *
 * NO ECONOMIC CHANGES - only throttles API usage.
 */

import { db, serverTimestamp } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logEvent } from './observability.js';

export type RateLimitScope = 'USER' | 'IP' | 'DEVICE';

export interface RateLimitContext {
  userId?: string | null;
  ipHash?: string | null;
  deviceId?: string | null;
  environment: 'PROD' | 'STAGE' | 'OTHER';
}

export interface RateLimitRuleConfig {
  perUser?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  perIp?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  perDevice?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  hardLimit?: boolean;
  escalateThresholdPerDay?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  hardLimited: boolean;
  reason?: string;
}

interface RateLimitConfigDoc {
  environment: 'GLOBAL' | 'PROD' | 'STAGE';
  rules: Record<string, RateLimitRuleConfig>;
  updatedAt: Timestamp;
}

interface RateLimitCounterDoc {
  scope: RateLimitScope;
  userId?: string | null;
  ipHash?: string | null;
  deviceId?: string | null;
  action: string;
  windowId: string;
  count: number;
  lastUpdatedAt: Timestamp;
}

// Cache for config to avoid reading Firestore on every request
let configCache: {
  global?: RateLimitConfigDoc;
  prod?: RateLimitConfigDoc;
  stage?: RateLimitConfigDoc;
  lastFetch: number;
} = {
  lastFetch: 0
};

const CONFIG_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Load and merge rate limit configuration
 */
async function loadConfig(environment: 'PROD' | 'STAGE' | 'OTHER'): Promise<Record<string, RateLimitRuleConfig>> {
  const now = Date.now();

  // Refresh cache if expired
  if (now - configCache.lastFetch > CONFIG_CACHE_TTL) {
    try {
      const globalDoc = await db.collection('rate_limit_config').doc('global').get();
      const envDoc = environment !== 'OTHER' 
        ? await db.collection('rate_limit_config').doc(environment.toLowerCase()).get()
        : null;

      configCache.global = globalDoc.exists ? globalDoc.data() as RateLimitConfigDoc : undefined;
      
      if (envDoc && envDoc.exists) {
        if (environment === 'PROD') {
          configCache.prod = envDoc.data() as RateLimitConfigDoc;
        } else if (environment === 'STAGE') {
          configCache.stage = envDoc.data() as RateLimitConfigDoc;
        }
      }
      
      configCache.lastFetch = now;
    } catch (error) {
      console.error('Failed to load rate limit config:', error);
      // Use cached config if load fails
    }
  }

  // Merge global and environment-specific rules
  const globalRules = configCache.global?.rules || {};
  let envRules: Record<string, RateLimitRuleConfig> = {};

  if (environment === 'PROD' && configCache.prod) {
    envRules = configCache.prod.rules || {};
  } else if (environment === 'STAGE' && configCache.stage) {
    envRules = configCache.stage.rules || {};
  }

  // Environment rules override global rules
  return { ...globalRules, ...envRules };
}

/**
 * Generate window ID for time bucketing
 */
function getWindowId(windowType: 'minute' | 'hour' | 'day'): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');

  switch (windowType) {
    case 'minute':
      return `minute:${year}-${month}-${day}T${hour}:${minute}`;
    case 'hour':
      return `hour:${year}-${month}-${day}T${hour}`;
    case 'day':
      return `day:${year}-${month}-${day}`;
  }
}

/**
 * Generate document ID for rate limit counter
 */
function getCounterDocId(
  scope: RateLimitScope,
  identifier: string,
  action: string,
  windowId: string
): string {
  return `scope:${scope}:${identifier}:action:${action}:window:${windowId}`;
}

/**
 * Check and increment rate limit counter for a specific scope and window
 */
async function checkScopeWindow(
  scope: RateLimitScope,
  identifier: string,
  action: string,
  windowType: 'minute' | 'hour' | 'day',
  limit: number
): Promise<{ exceeded: boolean; count: number }> {
  const windowId = getWindowId(windowType);
  const docId = getCounterDocId(scope, identifier, action, windowId);
  const docRef = db.collection('rate_limits').doc(docId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const currentCount = doc.exists ? (doc.data() as RateLimitCounterDoc).count : 0;
      const newCount = currentCount + 1;

      const counterData: RateLimitCounterDoc = {
        scope,
        userId: scope === 'USER' ? identifier : null,
        ipHash: scope === 'IP' ? identifier : null,
        deviceId: scope === 'DEVICE' ? identifier : null,
        action,
        windowId,
        count: newCount,
        lastUpdatedAt: Timestamp.now()
      };

      if (doc.exists) {
        transaction.update(docRef, {
          count: newCount,
          lastUpdatedAt: Timestamp.now()
        });
      } else {
        transaction.set(docRef, counterData);
      }

      return { exceeded: newCount > limit, count: newCount };
    });

    return result;
  } catch (error) {
    console.error('Rate limit transaction error:', error);
    // On error, allow the request (fail open)
    return { exceeded: false, count: 0 };
  }
}

/**
 * Check and increment rate limit for an action
 */
export async function checkAndIncrementRateLimit(params: {
  action: string;
  context: RateLimitContext;
}): Promise<RateLimitResult> {
  const { action, context } = params;

  // Load config
  const rules = await loadConfig(context.environment);
  const rule = rules[action];

  // If no rule defined, allow
  if (!rule) {
    return { allowed: true, hardLimited: false };
  }

  const violations: string[] = [];
  let dayCountForEscalation: number | null = null;

  // Check USER scope
  if (rule.perUser && context.userId) {
    const checks: Array<{ window: 'minute' | 'hour' | 'day'; limit: number }> = [];
    
    if (rule.perUser.perMinute) {
      checks.push({ window: 'minute', limit: rule.perUser.perMinute });
    }
    if (rule.perUser.perHour) {
      checks.push({ window: 'hour', limit: rule.perUser.perHour });
    }
    if (rule.perUser.perDay) {
      checks.push({ window: 'day', limit: rule.perUser.perDay });
    }

    for (const check of checks) {
      const result = await checkScopeWindow(
        'USER',
        context.userId,
        action,
        check.window,
        check.limit
      );

      if (result.exceeded) {
        violations.push(`${action} perUser per${check.window.charAt(0).toUpperCase() + check.window.slice(1)} limit exceeded`);
      }

      // Track day count for escalation
      if (check.window === 'day') {
        dayCountForEscalation = result.count;
      }
    }
  }

  // Check IP scope
  if (rule.perIp && context.ipHash) {
    const checks: Array<{ window: 'minute' | 'hour' | 'day'; limit: number }> = [];
    
    if (rule.perIp.perMinute) {
      checks.push({ window: 'minute', limit: rule.perIp.perMinute });
    }
    if (rule.perIp.perHour) {
      checks.push({ window: 'hour', limit: rule.perIp.perHour });
    }
    if (rule.perIp.perDay) {
      checks.push({ window: 'day', limit: rule.perIp.perDay });
    }

    for (const check of checks) {
      const result = await checkScopeWindow(
        'IP',
        context.ipHash,
        action,
        check.window,
        check.limit
      );

      if (result.exceeded) {
        violations.push(`${action} perIp per${check.window.charAt(0).toUpperCase() + check.window.slice(1)} limit exceeded`);
      }
    }
  }

  // Check DEVICE scope
  if (rule.perDevice && context.deviceId) {
    const checks: Array<{ window: 'minute' | 'hour' | 'day'; limit: number }> = [];
    
    if (rule.perDevice.perMinute) {
      checks.push({ window: 'minute', limit: rule.perDevice.perMinute });
    }
    if (rule.perDevice.perHour) {
      checks.push({ window: 'hour', limit: rule.perDevice.perHour });
    }
    if (rule.perDevice.perDay) {
      checks.push({ window: 'day', limit: rule.perDevice.perDay });
    }

    for (const check of checks) {
      const result = await checkScopeWindow(
        'DEVICE',
        context.deviceId,
        action,
        check.window,
        check.limit
      );

      if (result.exceeded) {
        violations.push(`${action} perDevice per${check.window.charAt(0).toUpperCase() + check.window.slice(1)} limit exceeded`);
      }
    }
  }

  // Handle violations
  if (violations.length > 0) {
    const isHardLimit = rule.hardLimit === true;
    const reason = violations[0]; // Use first violation for error message

    // Log to observability
    await logEvent({
      level: isHardLimit ? 'ERROR' : 'WARN',
      source: 'BACKEND',
      service: 'functions.rateLimit',
      module: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      environment: context.environment,
      context: {
        userId: context.userId || undefined
      },
      details: {
        extra: {
          action,
          violations,
          ipHash: context.ipHash,
          deviceId: context.deviceId,
          hardLimit: isHardLimit
        }
      }
    });

    // Check escalation threshold
    if (
      rule.escalateThresholdPerDay &&
      dayCountForEscalation !== null &&
      dayCountForEscalation >= rule.escalateThresholdPerDay
    ) {
      await logEvent({
        level: 'CRITICAL',
        source: 'BACKEND',
        service: 'functions.rateLimit',
        module: 'RATE_LIMIT',
        message: 'Rate limit escalation threshold exceeded',
        environment: context.environment,
        context: {
          userId: context.userId || undefined
        },
        details: {
          extra: {
            action,
            dayCount: dayCountForEscalation,
            threshold: rule.escalateThresholdPerDay
          }
        }
      });
    }

    return {
      allowed: !isHardLimit,
      hardLimited: isHardLimit,
      reason
    };
  }

  return { allowed: true, hardLimited: false };
}

/**
 * Hash IP address for storage (non-reversible)
 */
export function hashIpAddress(ip: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip + 'AVALO_SALT').digest('hex').substring(0, 32);
}

/**
 * Get rate limit stats for admin (aggregated)
 */
export async function getRateLimitStats(params: {
  action?: string;
  periodHours?: number;
}): Promise<{
  totalViolations: number;
  uniqueUsers: number;
  topOffenders: Array<{ userId: string; count: number }>;
}> {
  const { action, periodHours = 24 } = params;

  // Calculate time threshold
  const threshold = Timestamp.fromDate(
    new Date(Date.now() - periodHours * 60 * 60 * 1000)
  );

  // Query rate limit counters
  let query = db.collection('rate_limits')
    .where('lastUpdatedAt', '>=', threshold);

  if (action) {
    query = query.where('action', '==', action);
  }

  const snapshot = await query.get();

  const userCounts = new Map<string, number>();
  let totalViolations = 0;

  snapshot.forEach((doc) => {
    const data = doc.data() as RateLimitCounterDoc;
    if (data.userId) {
      const current = userCounts.get(data.userId) || 0;
      userCounts.set(data.userId, current + data.count);
      totalViolations += data.count;
    }
  });

  // Get top offenders
  const topOffenders = Array.from(userCounts.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalViolations,
    uniqueUsers: userCounts.size,
    topOffenders
  };
}

/**
 * Get merged rate limit configuration
 */
export async function getRateLimitConfig(environment: 'PROD' | 'STAGE' | 'OTHER'): Promise<Record<string, RateLimitRuleConfig>> {
  return loadConfig(environment);
}

/**
 * Create standard rate limit error for API responses
 */
export function createRateLimitError(reason?: string): {
  error: string;
  message: string;
  action: string;
} {
  return {
    error: 'RATE_LIMITED',
    message: reason || 'You are doing this too often. Please wait and try again later.',
    action: 'WAIT'
  };
}
