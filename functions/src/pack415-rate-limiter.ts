/**
 * PACK 415 — Global Rate Limiter, Abuse Throttles & Fair-Use Firewall
 * 
 * 3-Layer throttle system:
 * 1. Per-IP Throttling
 * 2. Per-User Throttling
 * 3. Per-Device Fingerprint
 * 
 * Dependencies: PACK 293, 301, 302, 410-414
 * Performance: < 20ms decision time
 * False-positive rate: < 0.5%
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AbuseMode = 'NORMAL' | 'SOFT' | 'HARD' | 'FREEZE';

export type ActionType =
  | 'login'
  | 'swipe'
  | 'chat'
  | 'support_ticket'
  | 'panic'
  | 'token_purchase'
  | 'profile_edit'
  | 'generic';

export interface RateLimitConfig {
  limit: number;
  windowMs: number; // Time window in milliseconds
}

export interface ActionLimitConfig {
  [key: string]: RateLimitConfig;
}

export interface RateLimitRecord {
  key: string;
  count: number;
  firstRequest: number; // timestamp
  lastRequest: number; // timestamp
  violations: number;
  abuseMode: AbuseMode;
  expiresAt: number; // timestamp
  blockedUntil?: number; // timestamp
}

export interface DeviceFingerprint {
  fpHash: string;
  deviceId: string;
  ip: string;
  osVersion: string;
  screenSignature: string;
  accountsCreated: number;
  accountIds: string[];
  firstSeen: number;
  lastSeen: number;
  swipeSpeed: number; // average ms between swipes
  chatStartFrequency: number; // chats per hour
  flagged: boolean;
  flagReason?: string;
}

export interface AbuseFlagRecord {
  userId: string;
  mode: AbuseMode;
  reason: string;
  triggeredAt: number;
  triggeredBy: string; // system or admin userId
  expiresAt?: number;
  manualOverride: boolean;
  history: Array<{
    mode: AbuseMode;
    reason: string;
    timestamp: number;
  }>;
}

export interface ViolationRecord {
  source: string; // ip, userId, fpHash
  sourceType: 'ip' | 'user' | 'device';
  reason: string;
  timestamp: number;
  actionType?: ActionType;
  metadata?: Record<string, any>;
}

// ============================================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================================

// Per-IP limits
const IP_LIMITS = {
  perMinute: { limit: 120, windowMs: 60 * 1000 },
  perHour: { limit: 2000, windowMs: 60 * 60 * 1000 },
  violationThreshold: 5,
  violationWindowMs: 10 * 60 * 1000, // 10 minutes
  banDurationMs: 30 * 60 * 1000, // 30 minutes
};

// Per-User action limits
const ACTION_LIMITS: ActionLimitConfig = {
  login: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 per 10 min
  swipe: { limit: 10, windowMs: 60 * 1000 }, // 10 per min
  chat: { limit: 30, windowMs: 60 * 1000 }, // 30 per min
  support_ticket: { limit: 5, windowMs: 24 * 60 * 60 * 1000 }, // 5 per day
  panic: { limit: 3, windowMs: 24 * 60 * 60 * 1000 }, // 3 per day
  token_purchase: { limit: 3, windowMs: 60 * 1000 }, // 3 per min
  profile_edit: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  generic: { limit: 100, windowMs: 60 * 1000 }, // 100 per min
};

// Device fingerprint thresholds
const DEVICE_THRESHOLDS = {
  accountsPerDay: 5,
  minSwipeSpeed: 100, // ms - too fast is suspicious
  maxChatStartFrequency: 20, // per hour
};

// Abuse mode multipliers
const ABUSE_MODE_MULTIPLIERS: Record<AbuseMode, number> = {
  NORMAL: 1,
  SOFT: 0.5, // 2× slower
  HARD: 0.2, // 5× slower
  FREEZE: 0, // Full lock
};

// Auto-unfreeze durations
const AUTO_UNFREEZE_DURATIONS: Record<AbuseMode, number | null> = {
  NORMAL: null,
  SOFT: 30 * 60 * 1000, // 30 min
  HARD: 12 * 60 * 60 * 1000, // 12 hours
  FREEZE: null, // Manual only
};

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

const db = admin.firestore();

function getRateLimitRef(key: string) {
  return db.collection('rateLimits').doc(key);
}

function getAbuseFlagRef(userId: string) {
  return db.collection('abuseFlags').doc(userId);
}

function getDeviceFingerprintRef(fpHash: string) {
  return db.collection('deviceFingerprints').doc(fpHash);
}

function getViolationRef() {
  return db.collection('violations').doc();
}

// ============================================================================
// CORE RATE LIMITING FUNCTIONS
// ============================================================================

/**
 * Check IP rate limit
 * Returns { allowed: boolean, reason?: string }
 */
export async function checkIpLimit(ip: string): Promise<{ allowed: boolean; reason?: string; abuseMode?: AbuseMode }> {
  const startTime = Date.now();
  
  try {
    const now = Date.now();
    const keyMinute = `ip:${ip}:minute`;
    const keyHour = `ip:${ip}:hour`;
    const keyViolations = `ip:${ip}:violations`;

    // Check if IP is currently banned
    const violationDoc = await getRateLimitRef(keyViolations).get();
    if (violationDoc.exists) {
      const data = violationDoc.data() as RateLimitRecord;
      if (data.blockedUntil && data.blockedUntil > now) {
        const remainingMs = data.blockedUntil - now;
        return {
          allowed: false,
          reason: `IP temporarily banned. ${Math.ceil(remainingMs / 1000)}s remaining`,
        };
      }
    }

    // Check per-minute limit
    const minuteCheck = await checkAndUpdateLimit(keyMinute, IP_LIMITS.perMinute, now);
    if (!minuteCheck.allowed) {
      await registerViolation(ip, 'ip', 'IP minute limit exceeded', 'generic');
      return minuteCheck;
    }

    // Check per-hour limit
    const hourCheck = await checkAndUpdateLimit(keyHour, IP_LIMITS.perHour, now);
    if (!hourCheck.allowed) {
      await registerViolation(ip, 'ip', 'IP hour limit exceeded', 'generic');
      return hourCheck;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 20) {
      logger.warn(`checkIpLimit took ${elapsed}ms (target: <20ms)`);
    }

    return { allowed: true };
  } catch (error) {
    logger.error('Error checking IP limit:', error);
    // Fail open - allow request but log error
    return { allowed: true };
  }
}

/**
 * Check user action rate limit
 */
export async function checkUserLimit(
  userId: string,
  actionType: ActionType
): Promise<{ allowed: boolean; reason?: string; abuseMode?: AbuseMode }> {
  const startTime = Date.now();

  try {
    const now = Date.now();

    // Check abuse mode first
    const abuseFlagDoc = await getAbuseFlagRef(userId).get();
    let currentAbuseMode: AbuseMode = 'NORMAL';
    
    if (abuseFlagDoc.exists) {
      const abuseData = abuseFlagDoc.data() as AbuseFlagRecord;
      
      // Check if abuse mode has expired
      if (abuseData.expiresAt && abuseData.expiresAt < now && !abuseData.manualOverride) {
        // Auto-unfreeze
        await getAbuseFlagRef(userId).update({
          mode: 'NORMAL',
          expiresAt: admin.firestore.FieldValue.delete(),
        });
        currentAbuseMode = 'NORMAL';
      } else {
        currentAbuseMode = abuseData.mode;
        
        // FREEZE mode blocks everything
        if (currentAbuseMode === 'FREEZE') {
          return {
            allowed: false,
            reason: 'Account frozen due to abuse. Contact support.',
            abuseMode: 'FREEZE',
          };
        }
      }
    }

    // Get action limit config
    const limitConfig = ACTION_LIMITS[actionType] || ACTION_LIMITS.generic;
    
    // Apply abuse mode multiplier
    const adjustedLimit = Math.max(
      1,
      Math.floor(limitConfig.limit * ABUSE_MODE_MULTIPLIERS[currentAbuseMode])
    );
    
    const adjustedConfig: RateLimitConfig = {
      ...limitConfig,
      limit: adjustedLimit,
    };

    // Check action-specific limit
    const key = `user:${userId}:${actionType}`;
    const result = await checkAndUpdateLimit(key, adjustedConfig, now);

    if (!result.allowed) {
      await registerViolation(userId, 'user', `User ${actionType} limit exceeded`, actionType);
      
      // Trigger automated defense signals
      await checkAutomatedDefenseSignals(userId, actionType);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 20) {
      logger.warn(`checkUserLimit took ${elapsed}ms (target: <20ms)`);
    }

    return { ...result, abuseMode: currentAbuseMode };
  } catch (error) {
    logger.error('Error checking user limit:', error);
    return { allowed: true };
  }
}

/**
 * Check device fingerprint
 */
export async function checkDeviceFingerprint(
  fpHash: string,
  deviceId: string,
  ip: string,
  osVersion: string,
  screenSignature: string,
  userId?: string
): Promise<{ allowed: boolean; reason?: string; flagged: boolean }> {
  const startTime = Date.now();

  try {
    const now = Date.now();
    const fpRef = getDeviceFingerprintRef(fpHash);
    const fpDoc = await fpRef.get();

    if (!fpDoc.exists) {
      // New device - create record
      const newFp: DeviceFingerprint = {
        fpHash,
        deviceId,
        ip,
        osVersion,
        screenSignature,
        accountsCreated: userId ? 1 : 0,
        accountIds: userId ? [userId] : [],
        firstSeen: now,
        lastSeen: now,
        swipeSpeed: 0,
        chatStartFrequency: 0,
        flagged: false,
      };
      
      await fpRef.set(newFp);
      
      const elapsed = Date.now() - startTime;
      if (elapsed > 20) {
        logger.warn(`checkDeviceFingerprint took ${elapsed}ms (target: <20ms)`);
      }
      
      return { allowed: true, flagged: false };
    }

    const fpData = fpDoc.data() as DeviceFingerprint;

    // Update last seen
    const updates: Partial<DeviceFingerprint> = {
      lastSeen: now,
    };

    // Check if new account created from this device
    if (userId && !fpData.accountIds.includes(userId)) {
      updates.accountsCreated = (fpData.accountsCreated || 0) + 1;
      updates.accountIds = [...fpData.accountIds, userId];

      // Check if too many accounts created in 24h
      const dayAgo = now - 24 * 60 * 60 * 1000;
      if (fpData.firstSeen > dayAgo && updates.accountsCreated >= DEVICE_THRESHOLDS.accountsPerDay) {
        updates.flagged = true;
        updates.flagReason = `${updates.accountsCreated} accounts created in 24h`;
        
        await registerViolation(fpHash, 'device', updates.flagReason, 'generic');
      }
    }

    // Check abnormal swipe speed
    if (fpData.swipeSpeed > 0 && fpData.swipeSpeed < DEVICE_THRESHOLDS.minSwipeSpeed) {
      updates.flagged = true;
      updates.flagReason = `Abnormal swipe speed: ${fpData.swipeSpeed}ms`;
    }

    // Check abnormal chat frequency
    if (fpData.chatStartFrequency > DEVICE_THRESHOLDS.maxChatStartFrequency) {
      updates.flagged = true;
      updates.flagReason = `Abnormal chat frequency: ${fpData.chatStartFrequency}/hour`;
    }

    await fpRef.update(updates);

    const elapsed = Date.now() - startTime;
    if (elapsed > 20) {
      logger.warn(`checkDeviceFingerprint took ${elapsed}ms (target: <20ms)`);
    }

    return {
      allowed: !updates.flagged,
      reason: updates.flagReason,
      flagged: updates.flagged || false,
    };
  } catch (error) {
    logger.error('Error checking device fingerprint:', error);
    return { allowed: true, flagged: false };
  }
}

/**
 * Internal helper to check and update rate limit
 */
async function checkAndUpdateLimit(
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<{ allowed: boolean; reason?: string }> {
  const ref = getRateLimitRef(key);
  
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    
    if (!doc.exists) {
      // First request
      const record: RateLimitRecord = {
        key,
        count: 1,
        firstRequest: now,
        lastRequest: now,
        violations: 0,
        abuseMode: 'NORMAL',
        expiresAt: now + config.windowMs,
      };
      transaction.set(ref, record);
      return { allowed: true };
    }

    const data = doc.data() as RateLimitRecord;
    
    // Check if window has expired
    if (now - data.firstRequest >= config.windowMs) {
      // Reset window
      const record: RateLimitRecord = {
        key,
        count: 1,
        firstRequest: now,
        lastRequest: now,
        violations: data.violations,
        abuseMode: data.abuseMode,
        expiresAt: now + config.windowMs,
      };
      transaction.set(ref, record);
      return { allowed: true };
    }

    // Within window - check limit
    if (data.count >= config.limit) {
      // Limit exceeded
      transaction.update(ref, {
        violations: admin.firestore.FieldValue.increment(1),
        lastRequest: now,
      });
      
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${config.limit} requests per ${config.windowMs / 1000}s`,
      };
    }

    // Increment counter
    transaction.update(ref, {
      count: admin.firestore.FieldValue.increment(1),
      lastRequest: now,
    });

    return { allowed: true };
  });
}

/**
 * Register a violation
 */
export async function registerViolation(
  source: string,
  sourceType: 'ip' | 'user' | 'device',
  reason: string,
  actionType: ActionType
): Promise<void> {
  try {
    const now = Date.now();
    
    const violation: ViolationRecord = {
      source,
      sourceType,
      reason,
      timestamp: now,
      actionType,
    };

    await getViolationRef().set(violation);

    // For IP violations, check if we should ban
    if (sourceType === 'ip') {
      const keyViolations = `ip:${source}:violations`;
      const violationRef = getRateLimitRef(keyViolations);
      
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(violationRef);
        
        if (!doc.exists) {
          const record: RateLimitRecord = {
            key: keyViolations,
            count: 1,
            firstRequest: now,
            lastRequest: now,
            violations: 1,
            abuseMode: 'NORMAL',
            expiresAt: now + IP_LIMITS.violationWindowMs,
          };
          transaction.set(violationRef, record);
        } else {
          const data = doc.data() as RateLimitRecord;
          
          // Check if window expired
          if (now - data.firstRequest >= IP_LIMITS.violationWindowMs) {
            // Reset
            const record: RateLimitRecord = {
              key: keyViolations,
              count: 1,
              firstRequest: now,
              lastRequest: now,
              violations: 1,
              abuseMode: 'NORMAL',
              expiresAt: now + IP_LIMITS.violationWindowMs,
            };
            transaction.set(violationRef, record);
          } else {
            const newViolations = data.violations + 1;
            
            // Check if we should ban
            if (newViolations >= IP_LIMITS.violationThreshold) {
              transaction.update(violationRef, {
                violations: newViolations,
                lastRequest: now,
                blockedUntil: now + IP_LIMITS.banDurationMs,
                abuseMode: 'HARD',
              });
              
              logger.warn(`IP ${source} banned for ${IP_LIMITS.banDurationMs / 1000}s due to ${newViolations} violations`);
            } else {
              transaction.update(violationRef, {
                violations: admin.firestore.FieldValue.increment(1),
                lastRequest: now,
              });
            }
          }
        }
      });
    }

    // Integration with PACK 296 (Audit)
    await db.collection('auditLogs').add({
      type: 'RATE_LIMIT_VIOLATION',
      source,
      sourceType,
      reason,
      actionType,
      timestamp: now,
      pack: 'PACK_415',
    });
  } catch (error) {
    logger.error('Error registering violation:', error);
  }
}

/**
 * Apply abuse mode to user
 */
export async function applyAbuseMode(
  userId: string,
  mode: AbuseMode,
  reason: string,
  triggeredBy: string = 'system',
  manualOverride: boolean = false
): Promise<void> {
  try {
    const now = Date.now();
    const ref = getAbuseFlagRef(userId);
    const doc = await ref.get();

    const expiresAt = manualOverride ? undefined : (AUTO_UNFREEZE_DURATIONS[mode] ? now + AUTO_UNFREEZE_DURATIONS[mode]! : undefined);

    const historyEntry = {
      mode,
      reason,
      timestamp: now,
    };

    if (!doc.exists) {
      const record: AbuseFlagRecord = {
        userId,
        mode,
        reason,
        triggeredAt: now,
        triggeredBy,
        expiresAt,
        manualOverride,
        history: [historyEntry],
      };
      await ref.set(record);
    } else {
      const data = doc.data() as AbuseFlagRecord;
      await ref.update({
        mode,
        reason,
        triggeredAt: now,
        triggeredBy,
        expiresAt,
        manualOverride,
        history: admin.firestore.FieldValue.arrayUnion(historyEntry),
      });
    }

    logger.info(`Applied abuse mode ${mode} to user ${userId}: ${reason}`);

    // Integration with PACK 293 (Notifications)
    if (mode === 'HARD' || mode === 'FREEZE') {
      await db.collection('notifications').add({
        userId,
        type: 'SECURITY_ALERT',
        title: mode === 'FREEZE' ? 'Account Frozen' : 'Security Warning',
        message: reason,
        timestamp: now,
        read: false,
        pack: 'PACK_415',
      });
    }

    // Integration with PACK 300A (Safety)
    if (mode === 'FREEZE') {
      await db.collection('safetyTickets').add({
        userId,
        type: 'ABUSE_FREEZE',
        reason,
        priority: 'high',
        status: 'open',
        createdAt: now,
        pack: 'PACK_415',
      });
    }
  } catch (error) {
    logger.error('Error applying abuse mode:', error);
    throw error;
  }
}

/**
 * Check automated defense signals and trigger abuse modes
 */
async function checkAutomatedDefenseSignals(userId: string, actionType: ActionType): Promise<void> {
  try {
    const now = Date.now();
    const windowStart = now - 10 * 60 * 1000; // 10 minutes

    // Query recent violations
    const violationsSnapshot = await db
      .collection('violations')
      .where('source', '==', userId)
      .where('sourceType', '==', 'user')
      .where('timestamp', '>=', windowStart)
      .get();

    const violations = violationsSnapshot.docs.map((doc) => doc.data() as ViolationRecord);

    // Check specific patterns
    const failedLogins = violations.filter((v) => v.actionType === 'login').length;
    const chatViolations = violations.filter((v) => v.actionType === 'chat').length;
    const panicViolations = violations.filter((v) => v.actionType === 'panic').length;

    // Trigger SOFT mode
    if (violations.length >= 3 && violations.length < 5) {
      await applyAbuseMode(userId, 'SOFT', 'High activity detected - rate limits reduced', 'system');
      return;
    }

    // Trigger HARD mode
    if (failedLogins >= 5) {
      await applyAbuseMode(userId, 'HARD', '5+ failed logins in 10 minutes', 'system');
      return;
    }

    if (chatViolations >= 3) {
      await applyAbuseMode(userId, 'HARD', 'Excessive chat activity - suspicious behavior', 'system');
      return;
    }

    if (panicViolations >= 2) {
      await applyAbuseMode(userId, 'HARD', 'Multiple panic trigger violations', 'system');
      return;
    }

    // Trigger FREEZE mode
    if (violations.length >= 5) {
      await applyAbuseMode(userId, 'FREEZE', 'Multiple abuse signals detected - account frozen for review', 'system');
      return;
    }
  } catch (error) {
    logger.error('Error checking automated defense signals:', error);
  }
}

// ============================================================================
// CLOUD FUNCTIONS - CALLABLE
// ============================================================================

/**
 * Check rate limit (callable from client)
 */
export const checkRateLimit = onCall(
  { region: 'us-central1', maxInstances: 100 },
  async (request) => {
    const { userId, actionType, deviceFingerprint } = request.data;
    const ip = request.rawRequest.ip || 'unknown';

    try {
      // Check IP limit
      const ipCheck = await checkIpLimit(ip);
      if (!ipCheck.allowed) {
        throw new HttpsError('resource-exhausted', ipCheck.reason || 'IP rate limit exceeded');
      }

      // Check user limit if userId provided
      if (userId && actionType) {
        const userCheck = await checkUserLimit(userId, actionType as ActionType);
        if (!userCheck.allowed) {
          throw new HttpsError('resource-exhausted', userCheck.reason || 'User rate limit exceeded');
        }

        return {
          allowed: true,
          abuseMode: userCheck.abuseMode,
          message: 'Rate limit check passed',
        };
      }

      // Check device fingerprint if provided
      if (deviceFingerprint) {
        const { fpHash, deviceId, osVersion, screenSignature } = deviceFingerprint;
        const fpCheck = await checkDeviceFingerprint(fpHash, deviceId, ip, osVersion, screenSignature, userId);
        
        if (!fpCheck.allowed) {
          throw new HttpsError('permission-denied', fpCheck.reason || 'Device flagged for suspicious activity');
        }

        return {
          allowed: true,
          flagged: fpCheck.flagged,
          message: 'Device fingerprint check passed',
        };
      }

      return {
        allowed: true,
        message: 'Rate limit check passed',
      };
    } catch (error) {
      logger.error('Error in checkRateLimit:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Rate limit check failed');
    }
  }
);

/**
 * Admin: Apply abuse mode manually
 */
export const adminApplyAbuseMode = onCall(
  { region: 'us-central1' },
  async (request) => {
    // Check admin permission (integrate with PACK 110 - KYC/Admin roles)
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, mode, reason } = request.data;
    const adminId = request.auth.uid;

    if (!userId || !mode || !reason) {
      throw new HttpsError('invalid-argument', 'userId, mode, and reason are required');
    }

    try {
      await applyAbuseMode(userId, mode as AbuseMode, reason, adminId, true);
      
      return {
        success: true,
        message: `Applied ${mode} mode to user ${userId}`,
      };
    } catch (error) {
      logger.error('Error in adminApplyAbuseMode:', error);
      throw new HttpsError('internal', 'Failed to apply abuse mode');
    }
  }
);

/**
 * Admin: Get abuse stats
 */
export const getAbuseStats = onCall(
  { region: 'us-central1' },
  async (request) => {
    // Check admin permission
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;

      // Get abuse flags
      const abuseFlagsSnapshot = await db.collection('abuseFlags').get();
      const abuseFlags = abuseFlagsSnapshot.docs.map((doc) => doc.data() as AbuseFlagRecord);

      // Get recent violations
      const violationsSnapshot = await db
        .collection('violations')
        .where('timestamp', '>=', dayAgo)
        .get();
      const violations = violationsSnapshot.docs.map((doc) => doc.data() as ViolationRecord);

      // Get flagged devices
      const devicesSnapshot = await db
        .collection('deviceFingerprints')
        .where('flagged', '==', true)
        .get();
      const flaggedDevices = devicesSnapshot.docs.map((doc) => doc.data() as DeviceFingerprint);

      // Aggregate stats
      const stats = {
        activeAbuse: {
          soft: abuseFlags.filter((f) => f.mode === 'SOFT').length,
          hard: abuseFlags.filter((f) => f.mode === 'HARD').length,
          freeze: abuseFlags.filter((f) => f.mode === 'FREEZE').length,
        },
        violations24h: {
          total: violations.length,
          byType: {
            ip: violations.filter((v) => v.sourceType === 'ip').length,
            user: violations.filter((v) => v.sourceType === 'user').length,
            device: violations.filter((v) => v.sourceType === 'device').length,
          },
          byAction: violations.reduce((acc, v) => {
            const action = v.actionType || 'unknown';
            acc[action] = (acc[action] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
        flaggedDevices: flaggedDevices.length,
        topFlaggedRegions: [], // TODO: Integrate with PACK 412 for region data
      };

      return stats;
    } catch (error) {
      logger.error('Error in getAbuseStats:', error);
      throw new HttpsError('internal', 'Failed to get abuse stats');
    }
  }
);

/**
 * Admin: Blacklist device fingerprint
 */
export const blacklistDevice = onCall(
  { region: 'us-central1' },
  async (request) => {
    // Check admin permission
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { fpHash, reason } = request.data;

    if (!fpHash || !reason) {
      throw new HttpsError('invalid-argument', 'fpHash and reason are required');
    }

    try {
      await getDeviceFingerprintRef(fpHash).update({
        flagged: true,
        flagReason: `[ADMIN BLACKLIST] ${reason}`,
      });

      // Find all users associated with this device and freeze them
      const fpDoc = await getDeviceFingerprintRef(fpHash).get();
      if (fpDoc.exists) {
        const fpData = fpDoc.data() as DeviceFingerprint;
        for (const userId of fpData.accountIds) {
          await applyAbuseMode(userId, 'FREEZE', `Device blacklisted: ${reason}`, request.auth.uid, true);
        }
      }

      return {
        success: true,
        message: `Blacklisted device ${fpHash}`,
      };
    } catch (error) {
      logger.error('Error in blacklistDevice:', error);
      throw new HttpsError('internal', 'Failed to blacklist device');
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Clean up expired rate limit records (daily)
 */
export const cleanupRateLimits = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeZone: 'UTC',
  },
  async () => {
    try {
      const now = Date.now();
      const batch = db.batch();
      let deleteCount = 0;

      // Clean up expired rate limit records
      const rateLimitsSnapshot = await db
        .collection('rateLimits')
        .where('expiresAt', '<', now)
        .limit(500)
        .get();

      rateLimitsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      await batch.commit();

      logger.info(`Cleaned up ${deleteCount} expired rate limit records`);
    } catch (error) {
      logger.error('Error cleaning up rate limits:', error);
    }
  }
);

/**
 * Auto-unfreeze expired abuse modes (hourly)
 */
export const autoUnfreezeAbuseMode = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'us-central1',
    timeZone: 'UTC',
  },
  async () => {
    try {
      const now = Date.now();
      const batch = db.batch();
      let unfreezeCount = 0;

      // Find expired abuse modes (non-manual)
      const abuseFlagsSnapshot = await db
        .collection('abuseFlags')
        .where('manualOverride', '==', false)
        .where('expiresAt', '<', now)
        .limit(500)
        .get();

      abuseFlagsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          mode: 'NORMAL',
          expiresAt: admin.firestore.FieldValue.delete(),
          history: admin.firestore.FieldValue.arrayUnion({
            mode: 'NORMAL',
            reason: 'Auto-unfroze after expiration',
            timestamp: now,
          }),
        });
        unfreezeCount++;
      });

      await batch.commit();

      logger.info(`Auto-unfroze ${unfreezeCount} abuse modes`);
    } catch (error) {
      logger.error('Error auto-unfreezing abuse modes:', error);
    }
  }
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check endpoint for PACK 414 integration
 */
export const rateLimiterHealth = onCall(
  { region: 'us-central1' },
  async () => {
    try {
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;

      // Get recent stats
      const [abuseFlagsSnapshot, violationsSnapshot, rateLimitsSnapshot] = await Promise.all([
        db.collection('abuseFlags').get(),
        db.collection('violations').where('timestamp', '>=', hourAgo).get(),
        db.collection('rateLimits').where('blockedUntil', '>', now).get(),
      ]);

      const abuseFlags = abuseFlagsSnapshot.docs.map((doc) => doc.data() as AbuseFlagRecord);
      
      return {
        status: 'healthy',
        timestamp: now,
        activeThrottles: rateLimitsSnapshot.size,
        abusiveSessions: {
          soft: abuseFlags.filter((f) => f.mode === 'SOFT').length,
          hard: abuseFlags.filter((f) => f.mode === 'HARD').length,
          freeze: abuseFlags.filter((f) => f.mode === 'FREEZE').length,
        },
        currentAutoFreezes: abuseFlags.filter((f) => f.mode !== 'NORMAL' && !f.manualOverride).length,
        violationsLastHour: violationsSnapshot.size,
        topFlaggedRegions: [], // TODO: Integrate with PACK 412
      };
    } catch (error) {
      logger.error('Error in health check:', error);
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        error: String(error),
      };
    }
  }
);
