/**
 * PACK 95 — Account, Device & Session Security
 * Backend Cloud Functions for device and session management
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no discounts, no promo codes, no cashback, no bonuses
 * - Do not change token price per unit
 * - Do not change revenue split (65% creator / 35% Avalo)
 * - Security actions never alter earnings, wallets, or payouts
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, serverTimestamp, timestamp as Timestamp, generateId } from './init';
import {
  RegisterDeviceAndSessionRequest,
  RegisterDeviceAndSessionResponse,
  LogoutSessionRequest,
  LogoutSessionResponse,
  LogoutAllSessionsResponse,
  GetActiveSessionsResponse,
  UserDevice,
  UserSession,
  SessionInfo,
  DeviceContext,
} from './pack95-types';
import { evaluateLoginAnomaly, logLoginAnomaly } from './pack95-anomaly-detection';
import { sendNotification } from './pack92-notifications';
import { recordRiskEvent, FraudFlagReason } from './trustEngine';
import { enforceStepUpForLogoutAll } from './pack96-twoFactorIntegrations';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_CONFIG = {
  // Maximum active sessions per user
  MAX_ACTIVE_SESSIONS: 10,
  
  // Session expiry time (in ms) - 30 days
  SESSION_EXPIRY_MS: 30 * 24 * 60 * 60 * 1000,
  
  // Device history cleanup - keep devices seen in last 90 days
  DEVICE_CLEANUP_DAYS: 90,
};

// ============================================================================
// DEVICE & SESSION REGISTRATION
// ============================================================================

/**
 * Register device and create a new session
 * Called after successful login
 */
export const registerDeviceAndSession = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as RegisterDeviceAndSessionRequest;
    const {
      deviceId,
      platform,
      deviceModel,
      appVersion,
      userAgent,
      ipCountry, // Server-side derived, not from client
    } = data;

    // Validate required fields
    if (!deviceId || !platform) {
      throw new HttpsError('invalid-argument', 'deviceId and platform are required');
    }

    try {
      // Derive IP country from request if not provided (server-side only)
      const derivedIpCountry = ipCountry || deriveCountryFromRequest(request);

      // ====================================================================
      // 1. UPSERT DEVICE
      // ====================================================================
      
      const deviceRef = db.collection('user_devices').doc(deviceId);
      const deviceDoc = await deviceRef.get();
      const isNewDevice = !deviceDoc.exists;

      if (isNewDevice) {
        const newDevice: UserDevice = {
          id: deviceId,
          userId: uid,
          platform,
          deviceModel: deviceModel || undefined,
          appVersion: appVersion || undefined,
          lastSeenAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          isTrusted: false, // Start as untrusted for future 2FA
        };
        await deviceRef.set(newDevice);
        logger.info(`[Session Security] New device registered: ${deviceId} for user ${uid}`);
      } else {
        // Update existing device
        await deviceRef.update({
          lastSeenAt: Timestamp.now(),
          platform,
          deviceModel: deviceModel || undefined,
          appVersion: appVersion || undefined,
        });
      }

      // Enforce device ownership check
      const device = (await deviceRef.get()).data() as UserDevice;
      if (device.userId !== uid) {
        throw new HttpsError('permission-denied', 'Device belongs to another user');
      }

      // ====================================================================
      // 2. CREATE NEW SESSION
      // ====================================================================
      
      const sessionId = generateId();
      const newSession: UserSession = {
        id: sessionId,
        userId: uid,
        deviceId,
        createdAt: Timestamp.now(),
        lastActiveAt: Timestamp.now(),
        ipCountry: derivedIpCountry,
        userAgent: userAgent || undefined,
        isActive: true,
      };

      await db.collection('user_sessions').doc(sessionId).set(newSession);
      logger.info(`[Session Security] New session created: ${sessionId} for user ${uid}`);

      // ====================================================================
      // 3. ENFORCE SESSION LIMIT
      // ====================================================================
      
      await enforceSessionLimit(uid, sessionId);

      // ====================================================================
      // 4. ANOMALY DETECTION
      // ====================================================================
      
      const sessionContext = {
        userId: uid,
        deviceId,
        platform,
        ipCountry: derivedIpCountry,
        userAgent,
        createdAt: Timestamp.now(),
      };

      const anomalyResult = await evaluateLoginAnomaly(uid, sessionContext);

      // Log anomalies
      if (anomalyResult.hasAnomalies) {
        for (const anomalyType of anomalyResult.anomalies) {
          await logLoginAnomaly(uid, sessionId, anomalyType, {
            ipCountry: derivedIpCountry,
            platform,
            deviceId,
            riskLevel: anomalyResult.riskLevel,
          });
        }
      }

      // ====================================================================
      // 5. SEND NOTIFICATIONS
      // ====================================================================
      
      if (anomalyResult.shouldNotify) {
        await sendSecurityNotifications(
          uid,
          sessionId,
          deviceId,
          platform,
          deviceModel,
          derivedIpCountry,
          anomalyResult.anomalies,
          isNewDevice
        );
      }

      // ====================================================================
      // 6. INTEGRATE WITH TRUST ENGINE
      // ====================================================================
      
      if (anomalyResult.riskLevel === 'HIGH' || anomalyResult.riskLevel === 'CRITICAL') {
        // Log suspicious pattern to Trust Engine
        await recordRiskEvent({
          userId: uid,
          eventType: 'free_pool', // Using this as a general event type
          metadata: {
            deviceId,
            ipHash: hashIp(request.rawRequest.ip || 'unknown'),
            suspiciousLogin: true,
            anomalies: anomalyResult.anomalies,
            riskLevel: anomalyResult.riskLevel,
          },
        });
      }

      // ====================================================================
      // 7. BLOCK IF CRITICAL
      // ====================================================================
      
      if (anomalyResult.shouldBlock) {
        // Revoke the session immediately
        await db.collection('user_sessions').doc(sessionId).update({
          isActive: false,
          revokedAt: Timestamp.now(),
          revokeReason: 'SECURITY_ANOMALY',
        });

        throw new HttpsError(
          'permission-denied',
          'Login blocked due to suspicious activity. Please contact support.'
        );
      }

      const response: RegisterDeviceAndSessionResponse = {
        success: true,
        sessionId,
        deviceId,
        anomalies: anomalyResult.hasAnomalies ? anomalyResult.anomalies : undefined,
        message: anomalyResult.hasAnomalies 
          ? 'Session created with security alerts. Check your notifications.'
          : 'Session created successfully',
      };

      return response;
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('[Session Security] Error registering device and session:', error);
      throw new HttpsError('internal', 'Failed to register device and session');
    }
  }
);

// ============================================================================
// SESSION LOGOUT
// ============================================================================

/**
 * Logout a specific session
 */
export const logoutSession = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as LogoutSessionRequest;
    const { sessionId } = data;

    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required');
    }

    try {
      const sessionRef = db.collection('user_sessions').doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists) {
        throw new HttpsError('not-found', 'Session not found');
      }

      const session = sessionDoc.data() as UserSession;

      // Verify ownership
      if (session.userId !== uid) {
        throw new HttpsError('permission-denied', 'Session belongs to another user');
      }

      // Revoke session
      await sessionRef.update({
        isActive: false,
        revokedAt: Timestamp.now(),
        revokeReason: 'USER_LOGOUT',
      });

      logger.info(`[Session Security] Session logged out: ${sessionId} for user ${uid}`);

      const response: LogoutSessionResponse = {
        success: true,
        message: 'Session logged out successfully',
      };

      return response;
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('[Session Security] Error logging out session:', error);
      throw new HttpsError('internal', 'Failed to logout session');
    }
  }
);

/**
 * Logout all sessions (except optionally the current one)
 */
export const logoutAllSessions = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { exceptCurrentSession, currentSessionId } = request.data as {
      exceptCurrentSession?: boolean;
      currentSessionId?: string;
    };

    try {
      // PACK 96: Step-up verification for logout all sessions
      await enforceStepUpForLogoutAll(uid);

      // Get all active sessions for this user
      const sessionsSnapshot = await db
        .collection('user_sessions')
        .where('userId', '==', uid)
        .where('isActive', '==', true)
        .get();

      let revokedCount = 0;
      const batch = db.batch();

      sessionsSnapshot.docs.forEach((doc) => {
        // Skip current session if requested
        if (exceptCurrentSession && currentSessionId && doc.id === currentSessionId) {
          return;
        }

        batch.update(doc.ref, {
          isActive: false,
          revokedAt: Timestamp.now(),
          revokeReason: 'USER_LOGOUT_ALL',
        });
        revokedCount++;
      });

      await batch.commit();

      logger.info(`[Session Security] Logged out ${revokedCount} sessions for user ${uid}`);

      // Send notification
      await sendNotification({
        userId: uid,
        type: 'SYSTEM',
        category: 'ACCOUNT',
        title: 'All devices logged out',
        body: `You have been logged out from ${revokedCount} device${revokedCount !== 1 ? 's' : ''}. If this wasn't you, please change your password.`,
        deepLink: 'avalo://security/sessions',
      });

      const response: LogoutAllSessionsResponse = {
        success: true,
        sessionsRevoked: revokedCount,
        message: `Logged out from ${revokedCount} device(s)`,
      };

      return response;
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('[Session Security] Error logging out all sessions:', error);
      throw new HttpsError('internal', 'Failed to logout all sessions');
    }
  }
);

// ============================================================================
// GET ACTIVE SESSIONS
// ============================================================================

/**
 * Get all active sessions for the authenticated user
 */
export const getActiveSessions = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { currentSessionId } = request.data as { currentSessionId?: string };

    try {
      const sessionsSnapshot = await db
        .collection('user_sessions')
        .where('userId', '==', uid)
        .where('isActive', '==', true)
        .orderBy('lastActiveAt', 'desc')
        .limit(50)
        .get();

      const sessions: SessionInfo[] = [];

      for (const doc of sessionsSnapshot.docs) {
        const session = doc.data() as UserSession;

        // Get device info
        const deviceDoc = await db.collection('user_devices').doc(session.deviceId).get();
        const device = deviceDoc.exists ? (deviceDoc.data() as UserDevice) : null;

        sessions.push({
          sessionId: session.id,
          deviceId: session.deviceId,
          platform: device?.platform || session.userAgent?.includes('android') ? 'android' : 'other',
          deviceModel: device?.deviceModel,
          ipCountry: session.ipCountry,
          lastActiveAt: session.lastActiveAt.toMillis(),
          createdAt: session.createdAt.toMillis(),
          isCurrentSession: session.id === currentSessionId,
        });
      }

      const response: GetActiveSessionsResponse = {
        success: true,
        sessions,
      };

      return response;
    } catch (error: any) {
      logger.error('[Session Security] Error getting active sessions:', error);
      throw new HttpsError('internal', 'Failed to get active sessions');
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Enforce maximum session limit by revoking oldest sessions
 */
async function enforceSessionLimit(userId: string, currentSessionId: string): Promise<void> {
  try {
    const sessionsSnapshot = await db
      .collection('user_sessions')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'asc')
      .get();

    const sessionCount = sessionsSnapshot.size;

    if (sessionCount > SESSION_CONFIG.MAX_ACTIVE_SESSIONS) {
      const sessionsToRevoke = sessionCount - SESSION_CONFIG.MAX_ACTIVE_SESSIONS;
      const batch = db.batch();

      // Revoke oldest sessions
      for (let i = 0; i < sessionsToRevoke; i++) {
        const doc = sessionsSnapshot.docs[i];
        if (doc.id !== currentSessionId) {
          batch.update(doc.ref, {
            isActive: false,
            revokedAt: Timestamp.now(),
            revokeReason: 'SESSION_LIMIT_EXCEEDED',
          });
        }
      }

      await batch.commit();
      logger.info(`[Session Security] Revoked ${sessionsToRevoke} old sessions for user ${userId}`);
    }
  } catch (error: any) {
    logger.error('[Session Security] Error enforcing session limit:', error);
    // Non-critical, don't throw
  }
}

/**
 * Send security notifications for anomalies
 */
async function sendSecurityNotifications(
  userId: string,
  sessionId: string,
  deviceId: string,
  platform: string,
  deviceModel: string | undefined,
  ipCountry: string | undefined,
  anomalies: string[],
  isNewDevice: boolean
): Promise<void> {
  try {
    const deviceInfo = deviceModel || platform;
    const location = ipCountry || 'unknown location';

    // For new country login
    if (anomalies.includes('NEW_COUNTRY')) {
      await sendNotification({
        userId,
        type: 'SYSTEM',
        category: 'SAFETY',
        title: 'New login location detected',
        body: `Your account was accessed from ${location}. If this wasn't you, log out from other devices and change your password.`,
        deepLink: 'avalo://security/sessions',
        payload: {
          sessionId,
          deviceId,
          anomalyType: 'NEW_COUNTRY',
        },
        forceChannels: ['IN_APP', 'PUSH'], // Security-critical
      });
    }

    // For impossible travel
    if (anomalies.includes('IMPOSSIBLE_TRAVEL')) {
      await sendNotification({
        userId,
        type: 'SYSTEM',
        category: 'SAFETY',
        title: 'Suspicious login detected',
        body: `We detected a login from ${location} shortly after a login from a different location. Please review your account security.`,
        deepLink: 'avalo://security/sessions',
        payload: {
          sessionId,
          deviceId,
          anomalyType: 'IMPOSSIBLE_TRAVEL',
        },
        forceChannels: ['IN_APP', 'PUSH'],
      });
    }

    // For new device (if not already sent for new country)
    if (isNewDevice && !anomalies.includes('NEW_COUNTRY')) {
      await sendNotification({
        userId,
        type: 'SYSTEM',
        category: 'ACCOUNT',
        title: 'New device login',
        body: `Your account was accessed from a new device (${deviceInfo}). If this wasn't you, log out from other devices.`,
        deepLink: 'avalo://security/sessions',
        payload: {
          sessionId,
          deviceId,
          isNewDevice: true,
        },
      });
    }
  } catch (error: any) {
    logger.error('[Session Security] Error sending security notifications:', error);
    // Non-critical, don't throw
  }
}

/**
 * Derive country code from request (stub - would use IP geolocation service)
 */
function deriveCountryFromRequest(request: any): string | undefined {
  // In production, use IP geolocation service (MaxMind, IPInfo, etc.)
  // For now, return undefined or a default
  return undefined;
}

/**
 * Hash IP address for privacy
 */
function hashIp(ip: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}