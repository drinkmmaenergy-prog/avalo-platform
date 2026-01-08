/**
 * PACK 389 — Zero-Trust Access Control Layer
 * Enterprise-grade authentication middleware with multi-factor validation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Risk scoring thresholds
const RISK_THRESHOLDS = {
  LOW: 0.25,
  MEDIUM: 0.50,
  HIGH: 0.75,
  CRITICAL: 0.85
};

// Trust window in milliseconds (12 hours)
const TRUST_WINDOW = 12 * 60 * 60 * 1000;

interface ZeroTrustContext {
  userId: string;
  deviceId: string;
  ipAddress: string;
  geolocation?: {
    country: string;
    region?: string;
    city?: string;
  };
  userAgent: string;
  timestamp: number;
  action: string;
  resource: string;
}

interface ZeroTrustResult {
  allowed: boolean;
  riskScore: number;
  reasons: string[];
  requiredActions?: string[];
  sessionValid: boolean;
  deviceTrusted: boolean;
  geoValid: boolean;
  anomalyDetected: boolean;
}

/**
 * Main Zero-Trust Guard - validates ALL privileged actions
 */
export const pack389_zeroTrustGuard = async (
  context: ZeroTrustContext
): Promise<ZeroTrustResult> => {
  const reasons: string[] = [];
  let riskScore = 0.0;
  
  // 1. Identity Verification
  const identityCheck = await verifyIdentity(context.userId);
  if (!identityCheck.valid) {
    riskScore += 0.4;
    reasons.push('Identity verification failed');
  }
  
  // 2. Device Trust Check
  const deviceCheck = await verifyDeviceTrust(context.userId, context.deviceId);
  if (!deviceCheck.trusted) {
    riskScore += 0.3;
    reasons.push('Device not trusted or unrecognized');
  }
  
  // 3. Geolocation Validation
  const geoCheck = await validateGeolocation(context.userId, context.geolocation);
  if (!geoCheck.valid) {
    riskScore += 0.2;
    reasons.push(`Suspicious geolocation change: ${geoCheck.reason}`);
  }
  
  // 4. Anomaly Detection
  const anomalyCheck = await detectAnomalies(context);
  if (anomalyCheck.detected) {
    riskScore += anomalyCheck.severity;
    reasons.push(`Anomaly detected: ${anomalyCheck.type}`);
  }
  
  // 5. Session Freshness
  const sessionCheck = await validateSessionFreshness(context.userId);
  if (!sessionCheck.fresh) {
    riskScore += 0.15;
    reasons.push('Session expired or stale');
  }
  
  // 6. IP Reputation Check
  const ipCheck = await checkIPReputation(context.ipAddress);
  if (ipCheck.malicious) {
    riskScore += 0.5;
    reasons.push(`Malicious IP detected: ${ipCheck.reason}`);
  }
  
  // 7. Rate Limiting Check
  const rateLimitCheck = await checkRateLimit(context.userId, context.action);
  if (rateLimitCheck.exceeded) {
    riskScore += 0.3;
    reasons.push('Rate limit exceeded');
  }
  
  // Cap risk score at 1.0
  riskScore = Math.min(riskScore, 1.0);
  
  // Determine if action is allowed
  const allowed = riskScore < RISK_THRESHOLDS.HIGH;
  
  // Log the attempt
  await logZeroTrustEvent({
    ...context,
    riskScore,
    allowed,
    reasons
  });
  
  // If risk is critical, trigger containment
  if (riskScore >= RISK_THRESHOLDS.CRITICAL) {
    await triggerSecurityAlert(context, riskScore, reasons);
  }
  
  return {
    allowed,
    riskScore,
    reasons,
    requiredActions: !allowed ? ['Re-authenticate', 'Verify device', 'Contact support'] : undefined,
    sessionValid: sessionCheck.fresh,
    deviceTrusted: deviceCheck.trusted,
    geoValid: geoCheck.valid,
    anomalyDetected: anomalyCheck.detected
  };
};

/**
 * Verify user identity and account status
 */
async function verifyIdentity(userId: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { valid: false, reason: 'User not found' };
    }
    
    const userData = userDoc.data();
    
    // Check if account is active
    if (userData?.accountStatus !== 'active') {
      return { valid: false, reason: `Account status: ${userData?.accountStatus}` };
    }
    
    // Check if account is locked (from containment)
    if (userData?.securityLock === true) {
      return { valid: false, reason: 'Account under security lock' };
    }
    
    // Check KYC status for privileged actions
    if (userData?.kycStatus !== 'verified') {
      return { valid: false, reason: 'KYC not verified' };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Identity verification error:', error);
    return { valid: false, reason: 'Verification system error' };
  }
}

/**
 * Verify device trust status
 */
async function verifyDeviceTrust(
  userId: string,
  deviceId: string
): Promise<{ trusted: boolean; reason?: string }> {
  try {
    const deviceDoc = await db
      .collection('trustedDevices')
      .doc(`${userId}_${deviceId}`)
      .get();
    
    if (!deviceDoc.exists) {
      return { trusted: false, reason: 'Device not registered' };
    }
    
    const deviceData = deviceDoc.data();
    const lastSeen = deviceData?.lastSeen?.toMillis() || 0;
    const now = Date.now();
    
    // Device trust expires after 90 days of inactivity
    if (now - lastSeen > 90 * 24 * 60 * 60 * 1000) {
      return { trusted: false, reason: 'Device trust expired' };
    }
    
    // Check if device is flagged
    if (deviceData?.flagged === true) {
      return { trusted: false, reason: 'Device flagged for suspicious activity' };
    }
    
    return { trusted: true };
  } catch (error) {
    console.error('Device trust verification error:', error);
    return { trusted: false, reason: 'Device verification system error' };
  }
}

/**
 * Validate geolocation against historical patterns
 */
async function validateGeolocation(
  userId: string,
  geolocation?: { country: string; region?: string; city?: string }
): Promise<{ valid: boolean; reason?: string }> {
  if (!geolocation) {
    return { valid: true }; // No geo data provided
  }
  
  try {
    // Get user's historical locations
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const registrationCountry = userData?.signupCountry;
    const lastKnownCountry = userData?.lastKnownCountry;
    
    // Check for suspicious country changes
    if (registrationCountry && geolocation.country !== registrationCountry) {
      // Check if this is a known travel pattern
      const travelHistory = userData?.travelHistory || [];
      
      if (!travelHistory.includes(geolocation.country)) {
        // New country - medium risk
        return { 
          valid: false, 
          reason: `New country detected: ${geolocation.country} (registered: ${registrationCountry})` 
        };
      }
    }
    
    // Check for impossible travel (country change in short time)
    const lastLoginTime = userData?.lastLoginTime?.toMillis() || 0;
    const timeSinceLastLogin = Date.now() - lastLoginTime;
    
    if (
      lastKnownCountry &&
      geolocation.country !== lastKnownCountry &&
      timeSinceLastLogin < 2 * 60 * 60 * 1000 // Less than 2 hours
    ) {
      return {
        valid: false,
        reason: `Impossible travel: ${lastKnownCountry} -> ${geolocation.country} in ${Math.floor(timeSinceLastLogin / 60000)} minutes`
      };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Geolocation validation error:', error);
    return { valid: true }; // Fail open for geo checks
  }
}

/**
 * Detect behavioral anomalies
 */
async function detectAnomalies(
  context: ZeroTrustContext
): Promise<{ detected: boolean; type?: string; severity: number }> {
  try {
    const userId = context.userId;
    
    // Get user's behavioral baseline
    const behaviorDoc = await db.collection('userBehaviorBaseline').doc(userId).get();
    
    if (!behaviorDoc.exists) {
      // No baseline yet - first time user
      return { detected: false, severity: 0 };
    }
    
    const baseline = behaviorDoc.data();
    
    // Check for unusual time-of-day activity
    const hour = new Date(context.timestamp).getHours();
    const usualActivityHours = baseline?.activeHours || [];
    
    if (usualActivityHours.length > 0 && !usualActivityHours.includes(hour)) {
      // Activity outside normal hours
      if (context.action.includes('wallet') || context.action.includes('admin')) {
        return { 
          detected: true, 
          type: 'Unusual time-of-day for sensitive action', 
          severity: 0.25 
        };
      }
    }
    
    // Check for burst activity
    const recentActionsSnapshot = await db
      .collection('zeroTrustLogs')
      .where('userId', '==', userId)
      .where('timestamp', '>', Date.now() - 60000) // Last minute
      .get();
    
    if (recentActionsSnapshot.size > 20) {
      return { 
        detected: true, 
        type: 'Burst activity detected', 
        severity: 0.4 
      };
    }
    
    // Check for privilege escalation attempts
    if (context.action.includes('admin') && !baseline?.isAdmin) {
      return {
        detected: true,
        type: 'Non-admin attempting privileged action',
        severity: 0.6
      };
    }
    
    return { detected: false, severity: 0 };
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return { detected: false, severity: 0 };
  }
}

/**
 * Validate session freshness
 */
async function validateSessionFreshness(
  userId: string
): Promise<{ fresh: boolean; reason?: string }> {
  try {
    const sessionDoc = await db.collection('secureSessions').doc(userId).get();
    
    if (!sessionDoc.exists) {
      return { fresh: false, reason: 'No active session' };
    }
    
    const sessionData = sessionDoc.data();
    const lastActive = sessionData?.lastActive?.toMillis() || 0;
    const now = Date.now();
    
    // Session expires after 12 hours
    if (now - lastActive > TRUST_WINDOW) {
      return { fresh: false, reason: 'Session expired' };
    }
    
    // Check if session is revoked
    if (sessionData?.trustStatus === 'revoked') {
      return { fresh: false, reason: 'Session revoked' };
    }
    
    return { fresh: true };
  } catch (error) {
    console.error('Session freshness check error:', error);
    return { fresh: false, reason: 'Session validation error' };
  }
}

/**
 * Check IP reputation against threat databases
 */
async function checkIPReputation(
  ipAddress: string
): Promise<{ malicious: boolean; reason?: string }> {
  try {
    // Check internal IP blacklist
    const ipDoc = await db.collection('ipBlacklist').doc(ipAddress).get();
    
    if (ipDoc.exists) {
      const ipData = ipDoc.data();
      return { 
        malicious: true, 
        reason: `Blacklisted: ${ipData?.reason || 'Previous abuse'}` 
      };
    }
    
    // Check for VPN/Proxy (increased risk)
    const ipInfoDoc = await db.collection('ipIntelligence').doc(ipAddress).get();
    
    if (ipInfoDoc.exists) {
      const ipInfo = ipInfoDoc.data();
      
      if (ipInfo?.isVPN || ipInfo?.isProxy || ipInfo?.isTor) {
        return { 
          malicious: false, // Not malicious but risky
          reason: 'VPN/Proxy/Tor detected' 
        };
      }
    }
    
    return { malicious: false };
  } catch (error) {
    console.error('IP reputation check error:', error);
    return { malicious: false };
  }
}

/**
 * Check rate limits for actions
 */
async function checkRateLimit(
  userId: string,
  action: string
): Promise<{ exceeded: boolean; reason?: string }> {
  try {
    const rateLimitKey = `${userId}_${action}`;
    const rateLimitDoc = await db.collection('rateLimits').doc(rateLimitKey).get();
    
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!rateLimitDoc.exists) {
      // First action - create rate limit document
      await db.collection('rateLimits').doc(rateLimitKey).set({
        count: 1,
        windowStart: admin.firestore.Timestamp.fromMillis(now),
        lastAction: admin.firestore.Timestamp.fromMillis(now)
      });
      return { exceeded: false };
    }
    
    const rateLimitData = rateLimitDoc.data();
    const windowStartTime = rateLimitData?.windowStart?.toMillis() || 0;
    
    // Define action-specific limits
    const limits: { [key: string]: number } = {
      'wallet.payout': 5,
      'admin.privilege': 10,
      'meeting.create': 20,
      'store.listing': 10,
      'default': 50
    };
    
    const limit = limits[action] || limits['default'];
    
    // Check if within window
    if (windowStartTime > windowStart) {
      // Still in window
      const count = rateLimitData?.count || 0;
      
      if (count >= limit) {
        return { 
          exceeded: true, 
          reason: `Rate limit exceeded: ${count}/${limit} in 1 minute` 
        };
      }
      
      // Increment counter
      await rateLimitDoc.ref.update({
        count: admin.firestore.FieldValue.increment(1),
        lastAction: admin.firestore.Timestamp.fromMillis(now)
      });
    } else {
      // New window
      await rateLimitDoc.ref.set({
        count: 1,
        windowStart: admin.firestore.Timestamp.fromMillis(now),
        lastAction: admin.firestore.Timestamp.fromMillis(now)
      });
    }
    
    return { exceeded: false };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { exceeded: false }; // Fail open
  }
}

/**
 * Log zero-trust event
 */
async function logZeroTrustEvent(event: any): Promise<void> {
  try {
    await db.collection('zeroTrustLogs').add({
      ...event,
      timestamp: admin.firestore.Timestamp.fromMillis(event.timestamp),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log zero-trust event:', error);
  }
}

/**
 * Trigger security alert for critical threats
 */
async function triggerSecurityAlert(
  context: ZeroTrustContext,
  riskScore: number,
  reasons: string[]
): Promise<void> {
  try {
    await db.collection('securityAlerts').add({
      type: 'zero_trust_violation',
      severity: riskScore,
      userId: context.userId,
      deviceId: context.deviceId,
      ipAddress: context.ipAddress,
      action: context.action,
      resource: context.resource,
      reasons,
      riskSnapshot: {
        score: riskScore,
        timestamp: context.timestamp
      },
      requiredAction: 'containment',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`🚨 SECURITY ALERT: User ${context.userId} - Risk ${riskScore.toFixed(2)}`);
  } catch (error) {
    console.error('Failed to create security alert:', error);
  }
}

/**
 * Cloud Function: Validate privileged action via HTTP
 */
export const validatePrivilegedAction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const zeroTrustContext: ZeroTrustContext = {
    userId: context.auth.uid,
    deviceId: data.deviceId,
    ipAddress: context.rawRequest.ip || 'unknown',
    geolocation: data.geolocation,
    userAgent: context.rawRequest.headers['user-agent'] || 'unknown',
    timestamp: Date.now(),
    action: data.action,
    resource: data.resource
  };
  
  const result = await pack389_zeroTrustGuard(zeroTrustContext);
  
  if (!result.allowed) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Action blocked by zero-trust policy',
      { riskScore: result.riskScore, reasons: result.reasons }
    );
  }
  
  return { success: true, riskScore: result.riskScore };
});

/**
 * Admin privilege isolation check
 */
export const validateAdminAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Verify admin status
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  
  if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin privileges required'
    );
  }
  
  // Run zero-trust validation with elevated scrutiny
  const zeroTrustContext: ZeroTrustContext = {
    userId: context.auth.uid,
    deviceId: data.deviceId,
    ipAddress: context.rawRequest.ip || 'unknown',
    geolocation: data.geolocation,
    userAgent: context.rawRequest.headers['user-agent'] || 'unknown',
    timestamp: Date.now(),
    action: `admin.${data.action}`,
    resource: data.resource
  };
  
  const result = await pack389_zeroTrustGuard(zeroTrustContext);
  
  // Stricter threshold for admin actions
  if (result.riskScore > RISK_THRESHOLDS.MEDIUM) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin action blocked due to elevated risk',
      { riskScore: result.riskScore, reasons: result.reasons }
    );
  }
  
  return { success: true, riskScore: result.riskScore };
});
