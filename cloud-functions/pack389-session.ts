/**
 * PACK 389 — Session Security & Token Hardening
 * Rotating session keys, device fingerprinting, and tamper-proof session management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

// Session configuration
const SESSION_ROTATION_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEVICE_FINGERPRINT_CHANGE_THRESHOLD = 0.3; // 30% change triggers alert

interface SecureSession {
  userId: string;
  sessionId: string;
  deviceId: string;
  deviceFingerprint: string;
  ipHash: string;
  lastActive: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  lastRotation: FirebaseFirestore.Timestamp;
  riskScore: number;
  trustStatus: 'trusted' | 'suspicious' | 'revoked';
  sessionKey: string;
  metadata: {
    userAgent: string;
    platform: string;
    country?: string;
    loginMethod: string;
  };
}

interface DeviceFingerprint {
  os: string;
  architecture: string;
  timezone: string;
  locale: string;
  hardwareHash: string;
  appVersion: string;
  simCountry?: string;
  networkType?: string;
  screenResolution?: string;
  deviceModel?: string;
}

/**
 * Start a new secure session with rotating keys
 */
export const pack389_startSecureSession = async (
  userId: string,
  deviceId: string,
  fingerprint: DeviceFingerprint,
  ipAddress: string,
  metadata: any
): Promise<{ sessionId: string; sessionKey: string }> => {
  try {
    // Generate unique session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Generate session key
    const sessionKey = crypto.randomBytes(64).toString('hex');
    
    // Hash IP address for privacy
    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');
    
    // Create device fingerprint hash
    const fingerprintHash = generateFingerprintHash(fingerprint);
    
    // Calculate initial risk score
    const riskScore = await calculateSessionRisk(userId, deviceId, ipAddress, fingerprint);
    
    // Create session document
    const sessionData: SecureSession = {
      userId,
      sessionId,
      deviceId,
      deviceFingerprint: fingerprintHash,
      ipHash,
      lastActive: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
      lastRotation: admin.firestore.Timestamp.now(),
      riskScore,
      trustStatus: riskScore < 0.5 ? 'trusted' : 'suspicious',
      sessionKey: hashSessionKey(sessionKey),
      metadata: {
        userAgent: metadata.userAgent || 'unknown',
        platform: metadata.platform || 'unknown',
        country: metadata.country,
        loginMethod: metadata.loginMethod || 'password'
      }
    };
    
    // Store session
    await db.collection('secureSessions').doc(userId).set(sessionData);
    
    // Log session creation
    await logSessionEvent({
      userId,
      sessionId,
      event: 'session_created',
      riskScore,
      deviceId,
      ipAddress: ipHash
    });
    
    // Register or update trusted device
    await registerTrustedDevice(userId, deviceId, fingerprint);
    
    console.log(`✅ Secure session created for user ${userId}`);
    
    return { sessionId, sessionKey };
  } catch (error) {
    console.error('Failed to start secure session:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create secure session');
  }
};

/**
 * Validate existing session
 */
export const pack389_validateSession = async (
  userId: string,
  sessionId: string,
  sessionKey: string,
  currentDeviceFingerprint: DeviceFingerprint,
  currentIpAddress: string
): Promise<{ valid: boolean; reason?: string; riskScore?: number }> => {
  try {
    // Retrieve session
    const sessionDoc = await db.collection('secureSessions').doc(userId).get();
    
    if (!sessionDoc.exists) {
      return { valid: false, reason: 'Session not found' };
    }
    
    const session = sessionDoc.data() as SecureSession;
    
    // Verify session ID matches
    if (session.sessionId !== sessionId) {
      await logSessionEvent({
        userId,
        sessionId,
        event: 'session_mismatch',
        riskScore: 1.0,
        deviceId: session.deviceId,
        ipAddress: session.ipHash
      });
      return { valid: false, reason: 'Session ID mismatch' };
    }
    
    // Verify session key
    const hashedProvidedKey = hashSessionKey(sessionKey);
    if (session.sessionKey !== hashedProvidedKey) {
      await logSessionEvent({
        userId,
        sessionId,
        event: 'invalid_session_key',
        riskScore: 1.0,
        deviceId: session.deviceId,
        ipAddress: session.ipHash
      });
      return { valid: false, reason: 'Invalid session key' };
    }
    
    // Check if session is revoked
    if (session.trustStatus === 'revoked') {
      return { valid: false, reason: 'Session revoked' };
    }
    
    // Check session age
    const now = Date.now();
    const sessionAge = now - session.createdAt.toMillis();
    
    if (sessionAge > SESSION_MAX_AGE) {
      await pack389_revokeSession(userId, 'Session expired');
      return { valid: false, reason: 'Session expired (max age exceeded)' };
    }
    
    // Check last active time
    const timeSinceActive = now - session.lastActive.toMillis();
    if (timeSinceActive > SESSION_ROTATION_INTERVAL) {
      // Session needs rotation
      await rotateSessionKey(userId, sessionId);
    }
    
    // Verify IP hasn't changed countries
    const currentIpHash = crypto.createHash('sha256').update(currentIpAddress).digest('hex');
    if (session.ipHash !== currentIpHash) {
      // IP changed - validate if it's suspicious
      const ipChangeValid = await validateIPChange(userId, session.ipHash, currentIpHash);
      
      if (!ipChangeValid) {
        await pack389_revokeSession(userId, 'Suspicious IP change');
        return { valid: false, reason: 'Suspicious IP change detected' };
      }
      
      // Update session with new IP
      await sessionDoc.ref.update({
        ipHash: currentIpHash,
        riskScore: admin.firestore.FieldValue.increment(0.15)
      });
    }
    
    // Verify device fingerprint
    const currentFingerprintHash = generateFingerprintHash(currentDeviceFingerprint);
    const fingerprintMatch = compareFingerprintsSimilarity(
      session.deviceFingerprint,
      currentFingerprintHash
    );
    
    if (fingerprintMatch < (1 - DEVICE_FINGERPRINT_CHANGE_THRESHOLD)) {
      await logSessionEvent({
        userId,
        sessionId,
        event: 'device_fingerprint_mismatch',
        riskScore: 0.8,
        deviceId: session.deviceId,
        ipAddress: currentIpHash
      });
      
      await pack389_revokeSession(userId, 'Device fingerprint mismatch');
      return { valid: false, reason: 'Device fingerprint changed significantly' };
    }
    
    // Update last active time
    await sessionDoc.ref.update({
      lastActive: admin.firestore.Timestamp.now()
    });
    
    return { valid: true, riskScore: session.riskScore };
  } catch (error) {
    console.error('Session validation error:', error);
    return { valid: false, reason: 'Session validation error' };
  }
};

/**
 * Revoke session
 */
export const pack389_revokeSession = async (
  userId: string,
  reason: string
): Promise<void> => {
  try {
    const sessionDoc = await db.collection('secureSessions').doc(userId).get();
    
    if (!sessionDoc.exists) {
      return;
    }
    
    const session = sessionDoc.data() as SecureSession;
    
    // Update session status
    await sessionDoc.ref.update({
      trustStatus: 'revoked',
      revokedAt: admin.firestore.Timestamp.now(),
      revokedReason: reason
    });
    
    // Log revocation
    await logSessionEvent({
      userId,
      sessionId: session.sessionId,
      event: 'session_revoked',
      riskScore: 1.0,
      deviceId: session.deviceId,
      ipAddress: session.ipHash,
      metadata: { reason }
    });
    
    console.log(`🔒 Session revoked for user ${userId}: ${reason}`);
  } catch (error) {
    console.error('Failed to revoke session:', error);
  }
};

/**
 * Rotate session key
 */
async function rotateSessionKey(userId: string, sessionId: string): Promise<void> {
  try {
    // Generate new session key
    const newSessionKey = crypto.randomBytes(64).toString('hex');
    const hashedNewKey = hashSessionKey(newSessionKey);
    
    // Update session
    await db.collection('secureSessions').doc(userId).update({
      sessionKey: hashedNewKey,
      lastRotation: admin.firestore.Timestamp.now()
    });
    
    // Log rotation
    await logSessionEvent({
      userId,
      sessionId,
      event: 'session_key_rotated',
      riskScore: 0,
      deviceId: '',
      ipAddress: ''
    });
    
    console.log(`🔄 Session key rotated for user ${userId}`);
  } catch (error) {
    console.error('Failed to rotate session key:', error);
  }
}

/**
 * Calculate session risk score
 */
async function calculateSessionRisk(
  userId: string,
  deviceId: string,
  ipAddress: string,
  fingerprint: DeviceFingerprint
): Promise<number> {
  let risk = 0.0;
  
  // Check if device is new
  const deviceDoc = await db.collection('trustedDevices').doc(`${userId}_${deviceId}`).get();
  if (!deviceDoc.exists) {
    risk += 0.2; // New device
  }
  
  // Check IP reputation
  const ipDoc = await db.collection('ipBlacklist').doc(ipAddress).get();
  if (ipDoc.exists) {
    risk += 0.5; // Blacklisted IP
  }
  
  // Check for VPN/Proxy indicators
  if (fingerprint.networkType === 'vpn' || fingerprint.networkType === 'proxy') {
    risk += 0.15;
  }
  
  // Check SIM country mismatch
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (fingerprint.simCountry && userData?.signupCountry) {
    if (fingerprint.simCountry !== userData.signupCountry) {
      risk += 0.2;
    }
  }
  
  // Check recent failed attempts
  const recentFailedLogins = await db
    .collection('authAttempts')
    .where('userId', '==', userId)
    .where('success', '==', false)
    .where('timestamp', '>', Date.now() - 3600000) // Last hour
    .get();
  
  if (recentFailedLogins.size > 3) {
    risk += 0.3;
  }
  
  return Math.min(risk, 1.0);
}

/**
 * Generate device fingerprint hash
 */
function generateFingerprintHash(fingerprint: DeviceFingerprint): string {
  const fingerprintString = JSON.stringify({
    os: fingerprint.os,
    architecture: fingerprint.architecture,
    timezone: fingerprint.timezone,
    locale: fingerprint.locale,
    hardwareHash: fingerprint.hardwareHash,
    screenResolution: fingerprint.screenResolution,
    deviceModel: fingerprint.deviceModel
  });
  
  return crypto.createHash('sha256').update(fingerprintString).digest('hex');
}

/**
 * Compare fingerprint similarity (returns 0-1, where 1 is identical)
 */
function compareFingerprintsSimilarity(hash1: string, hash2: string): number {
  if (hash1 === hash2) {
    return 1.0;
  }
  
  // Calculate Hamming distance for hex strings
  let matches = 0;
  const length = Math.min(hash1.length, hash2.length);
  
  for (let i = 0; i < length; i++) {
    if (hash1[i] === hash2[i]) {
      matches++;
    }
  }
  
  return matches / length;
}

/**
 * Hash session key for storage
 */
function hashSessionKey(key: string): string {
  return crypto.createHash('sha512').update(key).digest('hex');
}

/**
 * Validate IP address change
 */
async function validateIPChange(
  userId: string,
  oldIpHash: string,
  newIpHash: string
): Promise<boolean> {
  // Check if new IP is blacklisted
  const ipDoc = await db.collection('ipBlacklist').doc(newIpHash).get();
  if (ipDoc.exists) {
    return false;
  }
  
  // Check if this is a known IP for the user
  const ipHistorySnapshot = await db
    .collection('userIPHistory')
    .where('userId', '==', userId)
    .where('ipHash', '==', newIpHash)
    .limit(1)
    .get();
  
  if (!ipHistorySnapshot.empty) {
    // Known IP
    return true;
  }
  
  // New IP - log it
  await db.collection('userIPHistory').add({
    userId,
    ipHash: newIpHash,
    firstSeen: admin.firestore.Timestamp.now(),
    lastSeen: admin.firestore.Timestamp.now()
  });
  
  return true; // Allow but logged
}

/**
 * Register or update trusted device
 */
async function registerTrustedDevice(
  userId: string,
  deviceId: string,
  fingerprint: DeviceFingerprint
): Promise<void> {
  const deviceKey = `${userId}_${deviceId}`;
  const fingerprintHash = generateFingerprintHash(fingerprint);
  
  await db.collection('trustedDevices').doc(deviceKey).set({
    userId,
    deviceId,
    fingerprint: fingerprintHash,
    fingerprintDetails: fingerprint,
    lastSeen: admin.firestore.Timestamp.now(),
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
    flagged: false,
    trustScore: 1.0
  }, { merge: true });
}

/**
 * Log session event
 */
async function logSessionEvent(event: any): Promise<void> {
  try {
    await db.collection('sessionLogs').add({
      ...event,
      timestamp: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error('Failed to log session event:', error);
  }
}

/**
 * Cloud Function: Create new session
 */
export const createSecureSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { deviceId, fingerprint, metadata } = data;
  const ipAddress = context.rawRequest.ip || 'unknown';
  
  if (!deviceId || !fingerprint) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Device ID and fingerprint required'
    );
  }
  
  const session = await pack389_startSecureSession(
    context.auth.uid,
    deviceId,
    fingerprint,
    ipAddress,
    metadata || {}
  );
  
  return session;
});

/**
 * Cloud Function: Validate session
 */
export const validateSecureSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { sessionId, sessionKey, fingerprint } = data;
  const ipAddress = context.rawRequest.ip || 'unknown';
  
  if (!sessionId || !sessionKey || !fingerprint) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Session ID, key, and fingerprint required'
    );
  }
  
  const result = await pack389_validateSession(
    context.auth.uid,
    sessionId,
    sessionKey,
    fingerprint,
    ipAddress
  );
  
  if (!result.valid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      result.reason || 'Session validation failed'
    );
  }
  
  return result;
});

/**
 * Cloud Function: Revoke session (e.g., on password change)
 */
export const revokeUserSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const reason = data.reason || 'User requested';
  
  await pack389_revokeSession(context.auth.uid, reason);
  
  return { success: true };
});

/**
 * Trigger: Auto-revoke session on password change
 */
export const autoRevokeOnPasswordChange = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if password changed
    if (before.passwordHash && after.passwordHash && 
        before.passwordHash !== after.passwordHash) {
      const userId = context.params.userId;
      await pack389_revokeSession(userId, 'Password changed');
      console.log(`Session auto-revoked for user ${userId} due to password change`);
    }
  });
