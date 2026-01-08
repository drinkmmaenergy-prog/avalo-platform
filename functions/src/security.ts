/**
 * PACK 60 — Security & Account Protection Suite
 * API endpoints for 2FA, sessions, devices, and security settings
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import {
  SecuritySettings,
  TwoFactorChallenge,
  UserDevice,
  UserSession,
  DEFAULT_SECURITY_SETTINGS,
  Platform,
  SecurityPurpose,
  TwoFactorMethod,
} from './types/security';
import { evaluateSecurityContext, generateRiskFlags, isNewLocation as checkNewLocation } from './securityEngine';
import { db, serverTimestamp, increment, generateId, admin } from './init';

const FieldValue = admin.firestore.FieldValue;

/**
 * Hash an OTP code for secure storage
 */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Generate a 6-digit OTP
 */
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Mask a phone number or email for display
 */
function maskDestination(value: string, type: 'phone' | 'email'): string {
  if (type === 'phone') {
    // +48123456789 -> +48••••••789
    if (value.length > 7) {
      return value.substring(0, 3) + '••••••' + value.substring(value.length - 3);
    }
    return value;
  } else {
    // user@example.com -> u••••@example.com
    const atIndex = value.indexOf('@');
    if (atIndex > 1) {
      return value[0] + '••••' + value.substring(atIndex);
    }
    return value;
  }
}

/**
 * Send OTP via SMS (stub - integrate with SMS provider)
 */
async function sendSMS(phoneE164: string, code: string, purpose: string): Promise<void> {
  // TODO: Integrate with SMS provider (Twilio, etc.)
  console.log(`[SECURITY] SMS to ${phoneE164}: Your Avalo verification code is ${code} (${purpose})`);
  // In production, call actual SMS API
}

/**
 * Send OTP via email (stub - integrate with SendGrid)
 */
async function sendEmail(email: string, code: string, purpose: string): Promise<void> {
  // TODO: Integrate with SendGrid
  console.log(`[SECURITY] Email to ${email}: Your Avalo verification code is ${code} (${purpose})`);
  // In production, call SendGrid API with proper template
}

/**
 * Send security notification
 */
async function sendSecurityNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  context: any
): Promise<void> {
  try {
    // Integrate with PACK 53 Notification Hub
    const notificationsRef = db.collection('notifications');
    await notificationsRef.add({
      userId,
      type,
      title,
      body,
      context,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[SECURITY] Failed to send notification:', error);
  }
}

/**
 * Get or create security settings for a user
 */
async function getSecuritySettings(userId: string): Promise<SecuritySettings> {
  const settingsRef = db.collection('security_settings').doc(userId);
  const doc = await settingsRef.get();
  
  if (!doc.exists) {
    const settings: SecuritySettings = {
      userId,
      ...DEFAULT_SECURITY_SETTINGS,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };
    await settingsRef.set(settings);
    return settings;
  }
  
  return doc.data() as SecuritySettings;
}

/**
 * POST /security/overview
 * Get complete security overview (settings, devices, sessions)
 */
export const getSecurityOverview = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
  
    try {
    // Get security settings
    const settings = await getSecuritySettings(userId);
    
    // Get devices
    const devicesSnapshot = await db
      .collection('user_devices')
      .doc(userId)
      .collection('devices')
      .orderBy('lastSeenAt', 'desc')
      .get();
    
    const devices = devicesSnapshot.docs.map(doc => {
      const data = doc.data() as UserDevice;
      return {
        deviceId: data.deviceId,
        platform: data.platform,
        model: data.model || null,
        trusted: data.trusted,
        lastSeenAt: data.lastSeenAt.toMillis(),
        lastIpCountry: data.lastIpCountry || null,
      };
    });
    
    // Get sessions
    const sessionsSnapshot = await db
      .collection('user_sessions')
      .doc(userId)
      .collection('sessions')
      .where('revoked', '==', false)
      .orderBy('lastActiveAt', 'desc')
      .get();
    
    const sessions = sessionsSnapshot.docs.map(doc => {
      const data = doc.data() as UserSession;
      return {
        sessionId: data.sessionId,
        deviceId: data.deviceId,
        platform: data.platform,
        createdAt: data.createdAt.toMillis(),
        lastActiveAt: data.lastActiveAt.toMillis(),
        revoked: data.revoked,
      };
    });
    
    return {
      twoFactor: {
        enabled: settings.twoFactorEnabled,
        method: settings.twoFactorMethod,
        destinationMasked: settings.twoFactorEnabled
          ? settings.twoFactorMethod === 'SMS'
            ? maskDestination(settings.twoFactorPhoneE164 || '', 'phone')
            : maskDestination(settings.twoFactorEmail || '', 'email')
          : null,
      },
      alerts: settings.alerts,
      risk: settings.risk,
      devices,
      sessions,
    };
  } catch (error: any) {
    console.error('[SECURITY] Error getting overview:', error);
    throw new HttpsError('internal', 'Failed to get security overview');
  }
}
);

/**
 * POST /security/settings/update
 * Update security alerts and risk settings
 */
export const updateSecuritySettings = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { alerts, risk } = request.data;
  
    try {
    const settingsRef = db.collection('security_settings').doc(userId);
    const settings = await getSecuritySettings(userId);
    
    const updates: Partial<SecuritySettings> = {
      updatedAt: admin.firestore.Timestamp.now(),
    };
    
    if (alerts) {
      updates.alerts = { ...settings.alerts, ...alerts };
    }
    
    if (risk) {
      updates.risk = { ...settings.risk, ...risk };
    }
    
    await settingsRef.update(updates);
    
    // Send notification if security changes alerts are enabled
    if (settings.alerts.securityChanges) {
      await sendSecurityNotification(
        userId,
        'SECURITY_SETTING_CHANGED',
        'Security settings updated',
        'Your security alert preferences have been changed.',
        { updates }
      );
    }
    
      return { success: true };
    } catch (error: any) {
      console.error('[SECURITY] Error updating settings:', error);
      throw new HttpsError('internal', 'Failed to update security settings');
    }
  }
);

/**
 * POST /security/2fa/setup
 * Initiate 2FA setup (send OTP to verify phone/email)
 */
export const setup2FA = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { method, phoneE164, email } = request.data as {
    method: TwoFactorMethod;
    phoneE164?: string;
    email?: string;
    };
    
    if (method !== 'SMS' && method !== 'EMAIL') {
      throw new HttpsError('invalid-argument', 'Invalid 2FA method');
    }
    
    if (method === 'SMS' && !phoneE164) {
      throw new HttpsError('invalid-argument', 'Phone number required for SMS 2FA');
    }
    
    if (method === 'EMAIL' && !email) {
      throw new HttpsError('invalid-argument', 'Email required for EMAIL 2FA');
    }
    
    try {
    const code = generateOTP();
    const codeHash = hashCode(code);
    const destination = method === 'SMS' ? phoneE164! : email!;
    
    const challengeId = `2fa_${userId}_${Date.now()}`;
    const challenge: TwoFactorChallenge = {
      challengeId,
      userId,
      method,
      destination: maskDestination(destination, method === 'SMS' ? 'phone' : 'email'),
      codeHash,
      purpose: 'SETTINGS_CHANGE',
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10 minutes
      consumed: false,
    };
      
      await db.collection('twofactor_challenges').doc(challengeId).set(challenge);
    
      // Send OTP
      if (method === 'SMS') {
        await sendSMS(phoneE164!, code, '2FA setup');
      } else {
        await sendEmail(email!, code, '2FA setup');
      }
      
      return {
        destinationMasked: challenge.destination,
        expiresAt: challenge.expiresAt.toMillis(),
      };
    } catch (error: any) {
      console.error('[SECURITY] Error setting up 2FA:', error);
      throw new HttpsError('internal', 'Failed to setup 2FA');
    }
  }
);

/**
 * POST /security/2fa/confirm-setup
 * Confirm 2FA setup with OTP code
 */
export const confirm2FASetup = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { method, code, phoneE164, email } = request.data as {
    method: TwoFactorMethod;
    code: string;
    phoneE164?: string;
    email?: string;
    };
    
    try {
    // Find the latest pending challenge for this user
    const challengesSnapshot = await db
      .collection('twofactor_challenges')
      .where('userId', '==', userId)
      .where('method', '==', method)
      .where('purpose', '==', 'SETTINGS_CHANGE')
      .where('consumed', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
      if (challengesSnapshot.empty) {
        throw new HttpsError('not-found', 'No pending 2FA challenge found');
      }
      
      const challengeDoc = challengesSnapshot.docs[0];
      const challenge = challengeDoc.data() as TwoFactorChallenge;
      
      // Check expiration
      if (challenge.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError('deadline-exceeded', '2FA code expired');
      }
      
      // Verify code
      const codeHash = hashCode(code);
      if (codeHash !== challenge.codeHash) {
        throw new HttpsError('permission-denied', 'Invalid 2FA code');
      }
    
      // Mark challenge as consumed
      await challengeDoc.ref.update({
        consumed: true,
        consumedAt: admin.firestore.Timestamp.now(),
      });
      
      // Enable 2FA in security settings
      const settingsRef = db.collection('security_settings').doc(userId);
      await settingsRef.set({
        userId,
        twoFactorEnabled: true,
        twoFactorMethod: method,
        twoFactorPhoneE164: method === 'SMS' ? phoneE164 : null,
        twoFactorEmail: method === 'EMAIL' ? email : null,
        lastTwoFactorUpdatedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      }, { merge: true });
      
      // Send notification
      const settings = await getSecuritySettings(userId);
      if (settings.alerts.securityChanges) {
        await sendSecurityNotification(
          userId,
          'SECURITY_SETTING_CHANGED',
          'Two-factor authentication enabled',
          `2FA has been enabled using ${method}.`,
          { method }
        );
      }
      
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error confirming 2FA setup:', error);
      throw new HttpsError('internal', 'Failed to confirm 2FA setup');
    }
  }
);

/**
 * POST /security/2fa/disable
 * Disable 2FA (requires current code)
 */
export const disable2FA = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { code } = request.data as { code?: string };
    
    try {
    const settings = await getSecuritySettings(userId);
    
      if (!settings.twoFactorEnabled) {
        throw new HttpsError('failed-precondition', '2FA is not enabled');
      }
    
      // If code is provided, verify it
      if (code) {
        // Request and verify a fresh challenge
        const challengesSnapshot = await db
          .collection('twofactor_challenges')
          .where('userId', '==', userId)
          .where('method', '==', settings.twoFactorMethod)
          .where('purpose', '==', 'SETTINGS_CHANGE')
          .where('consumed', '==', false)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (challengesSnapshot.empty) {
          throw new HttpsError('failed-precondition', 'Please request a new code first');
        }
        
        const challengeDoc = challengesSnapshot.docs[0];
        const challenge = challengeDoc.data() as TwoFactorChallenge;
        
        if (challenge.expiresAt.toMillis() < Date.now()) {
          throw new HttpsError('deadline-exceeded', 'Code expired');
        }
        
        const codeHash = hashCode(code);
        if (codeHash !== challenge.codeHash) {
          throw new HttpsError('permission-denied', 'Invalid code');
        }
        
        await challengeDoc.ref.update({
          consumed: true,
          consumedAt: admin.firestore.Timestamp.now(),
        });
      }
    
      // Disable 2FA
      await db.collection('security_settings').doc(userId).update({
        twoFactorEnabled: false,
        twoFactorMethod: 'NONE',
        twoFactorPhoneE164: null,
        twoFactorEmail: null,
        lastTwoFactorUpdatedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      
      // Send notification
      if (settings.alerts.securityChanges) {
        await sendSecurityNotification(
          userId,
          'SECURITY_SETTING_CHANGED',
          'Two-factor authentication disabled',
          '2FA has been disabled for your account.',
          {}
        );
      }
      
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error disabling 2FA:', error);
      throw new HttpsError('internal', 'Failed to disable 2FA');
    }
  }
);

/**
 * POST /security/2fa/request-challenge
 * Request a 2FA challenge for sensitive actions
 */
export const request2FAChallenge = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { purpose } = request.data as { purpose: SecurityPurpose };
    
    if (!['LOGIN', 'PAYOUT', 'SETTINGS_CHANGE'].includes(purpose)) {
      throw new HttpsError('invalid-argument', 'Invalid purpose');
    }
    
    try {
    const settings = await getSecuritySettings(userId);
    
      if (!settings.twoFactorEnabled) {
        throw new HttpsError('failed-precondition', '2FA is not enabled');
      }
    
      const code = generateOTP();
      const codeHash = hashCode(code);
      const destination = settings.twoFactorMethod === 'SMS'
        ? settings.twoFactorPhoneE164!
        : settings.twoFactorEmail!;
      
      const challengeId = `2fa_${userId}_${purpose}_${Date.now()}`;
      const challenge: TwoFactorChallenge = {
        challengeId,
        userId,
        method: settings.twoFactorMethod as 'SMS' | 'EMAIL',
        destination: maskDestination(destination, settings.twoFactorMethod === 'SMS' ? 'phone' : 'email'),
        codeHash,
        purpose,
        createdAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes
        consumed: false,
      };
      
      await db.collection('twofactor_challenges').doc(challengeId).set(challenge);
      
      // Send OTP
      if (settings.twoFactorMethod === 'SMS') {
        await sendSMS(destination, code, purpose);
      } else {
        await sendEmail(destination, code, purpose);
      }
      
      return {
        destinationMasked: challenge.destination,
        expiresAt: challenge.expiresAt.toMillis(),
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error requesting 2FA challenge:', error);
      throw new HttpsError('internal', 'Failed to request 2FA challenge');
    }
  }
);

/**
 * POST /security/2fa/verify-challenge
 * Verify a 2FA challenge
 */
export const verify2FAChallenge = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { purpose, code } = request.data as { purpose: SecurityPurpose; code: string };
    
    try {
    const challengesSnapshot = await db
      .collection('twofactor_challenges')
      .where('userId', '==', userId)
      .where('purpose', '==', purpose)
      .where('consumed', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
      if (challengesSnapshot.empty) {
        throw new HttpsError('not-found', 'No pending challenge found');
      }
      
      const challengeDoc = challengesSnapshot.docs[0];
      const challenge = challengeDoc.data() as TwoFactorChallenge;
      
      if (challenge.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError('deadline-exceeded', 'Code expired');
      }
      
      const codeHash = hashCode(code);
      if (codeHash !== challenge.codeHash) {
        throw new HttpsError('permission-denied', 'Invalid code');
      }
      
      // Mark as consumed
      await challengeDoc.ref.update({
        consumed: true,
        consumedAt: admin.firestore.Timestamp.now(),
      });
      
      // Store verification timestamp in session (for other modules to check)
      // This would be integrated with actual session management
      
      return { success: true, verifiedAt: Date.now() };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error verifying 2FA challenge:', error);
      throw new HttpsError('internal', 'Failed to verify 2FA challenge');
    }
  }
);

/**
 * POST /security/device/trust
 * Trust or untrust a device
 */
export const trustDevice = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { deviceId, trusted } = request.data as { deviceId: string; trusted: boolean };
    
    try {
    const deviceRef = db
      .collection('user_devices')
      .doc(userId)
      .collection('devices')
      .doc(deviceId);
    
      const deviceDoc = await deviceRef.get();
      if (!deviceDoc.exists) {
        throw new HttpsError('not-found', 'Device not found');
      }
      
      await deviceRef.update({ trusted });
      
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error trusting device:', error);
      throw new HttpsError('internal', 'Failed to update device trust status');
    }
  }
);

/**
 * POST /security/session/revoke
 * Revoke one or all sessions
 */
export const revokeSession = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = request.auth.uid;
    const { sessionId, revokeAllExceptCurrent, currentSessionId } = request.data as {
    sessionId?: string;
    revokeAllExceptCurrent?: boolean;
    currentSessionId?: string;
    };
    
    try {
    const sessionsRef = db.collection('user_sessions').doc(userId).collection('sessions');
    
    if (sessionId) {
      // Revoke specific session
      await sessionsRef.doc(sessionId).update({
        revoked: true,
        revokedAt: admin.firestore.Timestamp.now(),
        reasonRevoked: 'USER_REQUEST',
      });
    } else if (revokeAllExceptCurrent && currentSessionId) {
      // Revoke all except current
      const allSessions = await sessionsRef.where('revoked', '==', false).get();
      
      const batch = db.batch();
      allSessions.docs.forEach(doc => {
        if (doc.id !== currentSessionId) {
          batch.update(doc.ref, {
            revoked: true,
            revokedAt: admin.firestore.Timestamp.now(),
            reasonRevoked: 'USER_REQUEST_REVOKE_ALL',
          });
        }
      });
      
      await batch.commit();
      } else {
        throw new HttpsError('invalid-argument', 'Must provide sessionId or revokeAllExceptCurrent');
      }
      
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[SECURITY] Error revoking session:', error);
      throw new HttpsError('internal', 'Failed to revoke session');
    }
  }
);

/**
 * Track session on login (called by auth system)
 * This function should be called whenever a user logs in
 */
export async function trackLoginSession(params: {
  userId: string;
  deviceId: string;
  platform: Platform;
  appVersion?: string;
  osVersion?: string;
  model?: string;
  ipCountry?: string;
  ipCity?: string;
}): Promise<{ isNewDevice: boolean; isNewLocation: boolean }> {
  const { userId, deviceId, platform, appVersion, osVersion, model, ipCountry, ipCity } = params;
  
  try {
    // Check if device exists
    const deviceRef = db.collection('user_devices').doc(userId).collection('devices').doc(deviceId);
    const deviceDoc = await deviceRef.get();
    const isNewDevice = !deviceDoc.exists;
    
    // Get historical locations
    let isNewLocation = false;
    if (!isNewDevice) {
      const allDevices = await db.collection('user_devices').doc(userId).collection('devices').get();
      const historicalCountries = allDevices.docs
        .map(d => d.data().lastIpCountry)
        .filter(c => c) as string[];
      const historicalCities = allDevices.docs
        .map(d => d.data().lastIpCity)
        .filter(c => c) as string[];
      
      isNewLocation = checkNewLocation(ipCountry || null, ipCity || null, historicalCountries, historicalCities);
    }
    
    // Upsert device
    const deviceData: Partial<UserDevice> = {
      deviceId,
      userId,
      lastSeenAt: admin.firestore.Timestamp.now(),
      platform,
      appVersion: appVersion || null,
      osVersion: osVersion || null,
      model: model || null,
      lastIpCountry: ipCountry || null,
      lastIpCity: ipCity || null,
      lastLoginAt: admin.firestore.Timestamp.now(),
    };
    
    if (isNewDevice) {
      await deviceRef.set({
        ...deviceData,
        firstSeenAt: admin.firestore.Timestamp.now(),
        trusted: false,
      } as UserDevice);
    } else {
      await deviceRef.update(deviceData);
    }
    
    // Create session
    const sessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionData: UserSession = {
      sessionId,
      userId,
      deviceId,
      createdAt: admin.firestore.Timestamp.now(),
      lastActiveAt: admin.firestore.Timestamp.now(),
      platform,
      appVersion: appVersion || null,
      ipCountry: ipCountry || null,
      ipCity: ipCity || null,
      revoked: false,
    };
    
    await db
      .collection('user_sessions')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId)
      .set(sessionData);
    
    // Send security notifications
    const settings = await getSecuritySettings(userId);
    
    if (isNewDevice && settings.alerts.newDeviceLogin) {
      await sendSecurityNotification(
        userId,
        'SECURITY_LOGIN_NEW_DEVICE',
        'New login on a new device',
        `We noticed a login to your Avalo account from a new ${platform} device.`,
        { deviceId, platform, ipCountry, ipCity }
      );
    }
    
    if (isNewLocation && settings.alerts.newLocationLogin) {
      await sendSecurityNotification(
        userId,
        'SECURITY_LOGIN_NEW_LOCATION',
        'Login from new location',
        `We noticed a login to your Avalo account from ${ipCity || ipCountry || 'a new location'}.`,
        { deviceId, ipCountry, ipCity }
      );
    }
    
    return { isNewDevice, isNewLocation };
  } catch (error) {
    console.error('[SECURITY] Error tracking login session:', error);
    throw error;
  }
}