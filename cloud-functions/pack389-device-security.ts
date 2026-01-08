/**
 * PACK 389 — Device Fingerprinting + Geo-Security
 * Lightweight device identification and geographical security validation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

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

interface TrustedDevice {
  userId: string;
  deviceId: string;
  fingerprint: string;
  fingerprintDetails: DeviceFingerprint;
  lastSeen: FirebaseFirestore.Timestamp;
  registeredAt: FirebaseFirestore.Timestamp;
  flagged: boolean;
  trustScore: number;
  geoHistory: Array<{
    country: string;
    timestamp: number;
  }>;
}

/**
 * Register new device
 */
export const registerDevice = async (
  userId: string,
  deviceId: string,
  fingerprint: DeviceFingerprint,
  country?: string
): Promise<{ trusted: boolean; requiresVerification: boolean }> => {
  try {
    const deviceKey = `${userId}_${deviceId}`;
    const fingerprintHash = generateFingerprintHash(fingerprint);
    
    // Check if device already exists
    const existingDevice = await db.collection('trustedDevices').doc(deviceKey).get();
    
    if (existingDevice.exists) {
      // Update existing device
      const deviceData = existingDevice.data() as TrustedDevice;
      
      // Check fingerprint similarity
      const similarity = compareFingerprintsSimilarity(
        deviceData.fingerprint,
        fingerprintHash
      );
      
      if (similarity < 0.7) {
        // Fingerprint changed significantly - flag for review
        await existingDevice.ref.update({
          flagged: true,
          flagReason: 'Fingerprint mismatch',
          flaggedAt: admin.firestore.Timestamp.now(),
          lastSeen: admin.firestore.Timestamp.now()
        });
        
        return { trusted: false, requiresVerification: true };
      }
      
      // Update last seen and geo history
      const geoHistory = deviceData.geoHistory || [];
      if (country) {
        geoHistory.push({
          country,
          timestamp: Date.now()
        });
      }
      
      await existingDevice.ref.update({
        lastSeen: admin.firestore.Timestamp.now(),
        geoHistory: geoHistory.slice(-50) // Keep last 50 locations
      });
      
      return { trusted: true, requiresVerification: false };
    }
    
    // New device - register it
    const trustScore = await calculateInitialTrustScore(userId, fingerprint);
    
    const newDevice: TrustedDevice = {
      userId,
      deviceId,
      fingerprint: fingerprintHash,
      fingerprintDetails: fingerprint,
      lastSeen: admin.firestore.Timestamp.now(),
      registeredAt: admin.firestore.Timestamp.now(),
      flagged: false,
      trustScore,
      geoHistory: country ? [{ country, timestamp: Date.now() }] : []
    };
    
    await db.collection('trustedDevices').doc(deviceKey).set(newDevice);
    
    console.log(`📱 New device registered for user ${userId}: ${deviceId}`);
    
    // New devices require verification if trust score is low
    return {
      trusted: trustScore > 0.7,
      requiresVerification: trustScore <= 0.7
    };
    
  } catch (error) {
    console.error('Device registration error:', error);
    throw error;
  }
};

/**
 * Validate device and location
 */
export const validateDeviceAndGeo = async (
  userId: string,
  deviceId: string,
  fingerprint: DeviceFingerprint,
  country: string
): Promise<{
  valid: boolean;
  riskScore: number;
  issues: string[];
}> => {
  const issues: string[] = [];
  let riskScore = 0.0;
  
  try {
    const deviceKey = `${userId}_${deviceId}`;
    const deviceDoc = await db.collection('trustedDevices').doc(deviceKey).get();
    
    if (!deviceDoc.exists) {
      issues.push('Device not registered');
      riskScore += 0.3;
    } else {
      const deviceData = deviceDoc.data() as TrustedDevice;
      
      // Check if device is flagged
      if (deviceData.flagged) {
        issues.push('Device flagged for suspicious activity');
        riskScore += 0.5;
      }
      
      // Validate fingerprint
      const currentFingerprintHash = generateFingerprintHash(fingerprint);
      const similarity = compareFingerprintsSimilarity(
        deviceData.fingerprint,
        currentFingerprintHash
      );
      
      if (similarity < 0.7) {
        issues.push('Device fingerprint mismatch');
        riskScore += 0.4;
      }
      
      // Validate geo location
      const geoHistory = deviceData.geoHistory || [];
      if (geoHistory.length > 0) {
        const lastLocation = geoHistory[geoHistory.length - 1];
        
        if (lastLocation.country !== country) {
          const timeSinceLastLocation = Date.now() - lastLocation.timestamp;
          
          // Impossible travel detection
          if (timeSinceLastLocation < 2 * 60 * 60 * 1000) { // Less than 2 hours
            issues.push(`Impossible travel: ${lastLocation.country} -> ${country}`);
            riskScore += 0.6;
          }
        }
      }
    }
    
    // Check SIM country match
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (fingerprint.simCountry && userData?.signupCountry) {
      if (fingerprint.simCountry !== userData.signupCountry) {
        issues.push('SIM country mismatch with signup country');
        riskScore += 0.2;
      }
    }
    
    // Validate location match
    if (userData?.signupCountry && country !== userData.signupCountry) {
      // Check if this is a known travel pattern
      const travelHistory = userData?.travelHistory || [];
      if (!travelHistory.includes(country)) {
        issues.push('New country detected');
        riskScore += 0.15;
      }
    }
    
    return {
      valid: riskScore < 0.5,
      riskScore: Math.min(riskScore, 1.0),
      issues
    };
    
  } catch (error) {
    console.error('Device and geo validation error:', error);
    return {
      valid: false,
      riskScore: 1.0,
      issues: ['Validation system error']
    };
  }
};

/**
 * Detect multi-device anomalies
 */
export const detectMultiDeviceAnomalies = async (
  userId: string
): Promise<{
  suspicious: boolean;
  reason?: string;
  deviceCount: number;
}> => {
  try {
    const devicesSnapshot = await db
      .collection('trustedDevices')
      .where('userId', '==', userId)
      .get();
    
    const deviceCount = devicesSnapshot.size;
    
    // Check for excessive device count
    if (deviceCount > 10) {
      return {
        suspicious: true,
        reason: `Excessive device count: ${deviceCount}`,
        deviceCount
      };
    }
    
    // Check for simultaneous usage from different locations
    const now = Date.now();
    const recentDevices = devicesSnapshot.docs.filter(doc => {
      const deviceData = doc.data() as TrustedDevice;
      const lastSeen = deviceData.lastSeen?.toMillis() || 0;
      return now - lastSeen < 60000; // Active in last minute
    });
    
    if (recentDevices.length > 3) {
      // Multiple devices active simultaneously
      const locations = new Set(
        recentDevices
          .map(doc => {
            const deviceData = doc.data() as TrustedDevice;
            const geoHistory = deviceData.geoHistory || [];
            return geoHistory.length > 0 ? geoHistory[geoHistory.length - 1].country : null;
          })
          .filter(Boolean)
      );
      
      if (locations.size > 1) {
        return {
          suspicious: true,
          reason: `Simultaneous usage from ${locations.size} different countries`,
          deviceCount
        };
      }
    }
    
    return {
      suspicious: false,
      deviceCount
    };
    
  } catch (error) {
    console.error('Multi-device anomaly detection error:', error);
    return {
      suspicious: false,
      deviceCount: 0
    };
  }
};

/**
 * Generate fingerprint hash
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
 * Compare fingerprints similarity (0-1, where 1 is identical)
 */
function compareFingerprintsSimilarity(hash1: string, hash2: string): number {
  if (hash1 === hash2) return 1.0;
  
  let matches = 0;
  const length = Math.min(hash1.length, hash2.length);
  
  for (let i = 0; i < length; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }
  
  return matches / length;
}

/**
 * Calculate initial trust score for new device
 */
async function calculateInitialTrustScore(
  userId: string,
  fingerprint: DeviceFingerprint
): Promise<number> {
  let score = 1.0;
  
  // Check if VPN/Proxy
  if (fingerprint.networkType === 'vpn' || fingerprint.networkType === 'proxy') {
    score -= 0.2;
  }
  
  // Check device count
  const existingDevices = await db
    .collection('trustedDevices')
    .where('userId', '==', userId)
    .get();
  
  if (existingDevices.size > 5) {
    score -= 0.1;
  }
  
  // Check SIM country
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (fingerprint.simCountry && userData?.signupCountry) {
    if (fingerprint.simCountry !== userData.signupCountry) {
      score -= 0.2;
    }
  }
  
  return Math.max(score, 0.0);
}

/**
 * Cloud Function: Register device
 */
export const registerDeviceFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { deviceId, fingerprint, country } = data;
  
  if (!deviceId || !fingerprint) {
    throw new functions.https.HttpsError('invalid-argument', 'Device ID and fingerprint required');
  }
  
  const result = await registerDevice(
    context.auth.uid,
    deviceId,
    fingerprint,
    country
  );
  
  return result;
});

/**
 * Cloud Function: Validate device and geo
 */
export const validateDeviceAndGeoFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { deviceId, fingerprint, country } = data;
  
  if (!deviceId || !fingerprint || !country) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Device ID, fingerprint, and country required'
    );
  }
  
  const result = await validateDeviceAndGeo(
    context.auth.uid,
    deviceId,
    fingerprint,
    country
  );
  
  if (!result.valid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Device and location validation failed',
      { riskScore: result.riskScore, issues: result.issues }
    );
  }
  
  return result;
});

/**
 * Scheduled: Detect multi-device anomalies
 */
export const detectDeviceAnomalies = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('🔍 Detecting multi-device anomalies...');
    
    // Get users with multiple devices active recently
    const recentDevices = await db
      .collection('trustedDevices')
      .where('lastSeen', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    
    const userDeviceCounts = new Map<string, number>();
    
    recentDevices.forEach(doc => {
      const deviceData = doc.data() as TrustedDevice;
      const count = userDeviceCounts.get(deviceData.userId) || 0;
      userDeviceCounts.set(deviceData.userId, count + 1);
    });
    
    // Check users with high device counts
    const suspiciousUsers: string[] = [];
    
    for (const [userId, deviceCount] of Array.from(userDeviceCounts.entries())) {
      if (deviceCount > 5) {
        const anomaly = await detectMultiDeviceAnomalies(userId);
        
        if (anomaly.suspicious) {
          suspiciousUsers.push(userId);
          
          // Create security alert
          await db.collection('securityAlerts').add({
            type: 'multi_device_anomaly',
            severity: 0.6,
            userId,
            reason: anomaly.reason,
            deviceCount: anomaly.deviceCount,
            status: 'active',
            createdAt: admin.firestore.Timestamp.now()
          });
        }
      }
    }
    
    console.log(`✅ Device anomaly detection complete: ${suspiciousUsers.length} suspicious users found`);
  });
