/**
 * PACK 317 — Launch Hardening, Security & Rate Limits Endpoints
 * 
 * All callable functions and HTTP endpoints for PACK 317
 */

import * as functions from 'firebase-functions';
import { assertRateLimit, hashIP } from './pack317-rate-limiting';
import { 
  checkRegistrationAbuse, 
  checkMessageSpam,
  flagSpamSuspect,
} from './pack317-anti-bot';
import { sanitizeLogDetails, logSafeTechEvent } from './pack317-privacy-logger';
import {
  getLaunchConfig,
  checkRegistrationAllowed,
  checkPaidFeaturesAllowed,
  updateLaunchConfig,
  getLaunchConfigHistory,
} from './pack317-launch-gate';
import { launchCheck, launchCheckCallable } from './pack317-launch-check';
import {
  logSecurityEvent,
  querySecurityEvents,
  getSecurityDashboardStats,
} from './pack317-analytics-events';

// ============================================================================
// RATE LIMITING ENDPOINTS
// ============================================================================

/**
 * Check rate limit for action (internal use)
 */
export const pack317_checkRateLimit = functions.https.onCall(async (data, context) => {
  const { action, identifier, type } = data;

  if (!action || !identifier || !type) {
    throw new functions.https.HttpsError('invalid-argument', 'action, identifier, and type are required');
  }

  try {
    await assertRateLimit({ type, identifier, action });
    return { allowed: true };
  } catch (error: any) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      return {
        allowed: false,
        ...error.details,
      };
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// ANTI-BOT & SPAM ENDPOINTS
// ============================================================================

/**
 * Check registration for abuse (called during signup flow)
 */
export const pack317_checkRegistration = functions.https.onCall(async (data, context) => {
  const { email, ipAddress, deviceId } = data;

  if (!email || !ipAddress) {
    throw new functions.https.HttpsError('invalid-argument', 'email and ipAddress are required');
  }

  try {
    const ipHash = hashIP(ipAddress);
    const result = await checkRegistrationAbuse({ email, ipHash, deviceId });

    // Log event if blocked
    if (!result.allowed) {
      await logSecurityEvent({
        eventType: 'REGISTRATION_ABUSE_DETECTED',
        ipHash,
        metadata: {
          email: email.substring(0, 3) + '***',
          riskFlags: result.riskFlags,
        },
      });
    }

    return result;
  } catch (error: any) {
    console.error('[Pack317] Registration check failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check message for spam (called before sending message)
 */
export const pack317_checkMessageSpam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { messageText, recipientId } = data;

  if (!messageText || !recipientId) {
    throw new functions.https.HttpsError('invalid-argument', 'messageText and recipientId are required');
  }

  try {
    const result = await checkMessageSpam({
      userId: context.auth.uid,
      messageText,
      recipientId,
    });

    // Log if spam detected
    if (result.isSpam) {
      await logSecurityEvent({
        eventType: 'MESSAGE_SPAM_DETECTED',
        userId: context.auth.uid,
        metadata: {
          action: result.action,
          reason: result.reason,
        },
      });

      // Flag user as spam suspect
      await flagSpamSuspect(context.auth.uid, result.reason || 'Spam message detected');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack317] Spam check failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// LAUNCH GATE ENDPOINTS
// ============================================================================

/**
 * Get current launch configuration (public)
 */
export const pack317_getLaunchConfig = functions.https.onCall(async (data, context) => {
  try {
    const config = await getLaunchConfig();
    
    // Return sanitized version for clients
    return {
      status: config.status,
      blockNewRegistrations: config.blockNewRegistrations,
      blockPaidFeatures: config.blockPaidFeatures,
      maintenanceMessage: config.maintenanceMessage,
    };
  } catch (error: any) {
    console.error('[Pack317] Get launch config failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update launch configuration (admin only)
 */
export const pack317_updateLaunchConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin role check
  const adminId = context.auth.uid;

  try {
    const config = await updateLaunchConfig({
      ...data,
      updatedBy: adminId,
    });

    return { success: true, config };
  } catch (error: any) {
    console.error('[Pack317] Update launch config failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get launch configuration history (admin only)
 */
export const pack317_getLaunchConfigHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin role check

  try {
    const history = await getLaunchConfigHistory(data?.limit);
    return { success: true, history };
  } catch (error: any) {
    console.error('[Pack317] Get launch history failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// LAUNCH CHECK ENDPOINT
// ============================================================================

/**
 * GET /system/launch-check
 * Public health check for system readiness
 */
export const pack317_launchCheck = launchCheck;

/**
 * Callable version for admin use
 */
export const pack317_launchCheckCallable = launchCheckCallable;

// ============================================================================
// SECURITY ANALYTICS ENDPOINTS
// ============================================================================

/**
 * Query security events (admin only)
 */
export const pack317_querySecurityEvents = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin role check

  try {
    const result = await querySecurityEvents(data);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[Pack317] Query security events failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get security dashboard stats (admin only)
 */
export const pack317_getSecurityStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin role check

  try {
    const stats = await getSecurityDashboardStats();
    return { success: true, stats };
  } catch (error: any) {
    console.error('[Pack317] Get security stats failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// UTILITY ENDPOINTS (for integration testing)
// ============================================================================

/**
 * Test log sanitization (dev/testing only)
 */
export const pack317_testSanitization = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Only in development
  if (process.env.NODE_ENV === 'production') {
    throw new functions.https.HttpsError('permission-denied', 'Not available in production');
  }

  const { testData } = data;

  if (!testData) {
    throw new functions.https.HttpsError('invalid-argument', 'testData is required');
  }

  try {
    const sanitized = sanitizeLogDetails(testData);
    return { success: true, original: testData, sanitized };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});