/**
 * PACK 160 - Device Security & Validation
 * Device compromise detection, security event tracking, and environment validation
 */

import { db, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';

export interface DeviceSecurityProfile {
  userId: string;
  deviceFingerprint: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
    deviceModel?: string;
  };
  securityStatus: 'secure' | 'warning' | 'compromised' | 'frozen';
  compromised: boolean;
  suspiciousActivity: boolean;
  lastValidated: Timestamp;
  createdAt: Timestamp;
  compromiseReasons?: string[];
  warningFlags?: string[];
}

export interface SecurityEvent {
  userId: string;
  deviceFingerprint?: string;
  eventType: 'key_generated' | 'key_rotated' | 'keys_destroyed' | 'compromise_detected' |
             'malware_warning' | 'screen_scraping' | 'unauthorized_access' | 'reauth_required' |
             'device_frozen' | 'device_restored' | 'device_registered';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
  timestamp: Timestamp;
  source: string;
  resolved: boolean;
}

export interface CompromiseIndicators {
  rootDetected?: boolean;
  debuggerAttached?: boolean;
  emulatorDetected?: boolean;
  screenRecorderActive?: boolean;
  suspiciousApps?: string[];
  memoryTampering?: boolean;
  networkProxy?: boolean;
  sslUnpinning?: boolean;
}

/**
 * Register new device for security tracking
 */
export async function registerDevice(
  userId: string,
  deviceFingerprint: string,
  deviceInfo: DeviceSecurityProfile['deviceInfo']
): Promise<void> {
  const deviceId = `${userId}_${deviceFingerprint}`;
  
  const deviceProfile: DeviceSecurityProfile = {
    userId,
    deviceFingerprint,
    deviceInfo,
    securityStatus: 'secure',
    compromised: false,
    suspiciousActivity: false,
    lastValidated: Timestamp.now(),
    createdAt: Timestamp.now()
  };
  
  await db.collection('user_devices').doc(deviceId).set(deviceProfile, { merge: true });
  
  await logSecurityEvent(userId, 'device_registered', 'low', {
    deviceFingerprint,
    deviceInfo
  }, 'device_security');
}

/**
 * Validate device security status
 */
export async function validateDeviceSecurityStatus(
  userId: string,
  deviceFingerprint: string,
  indicators: CompromiseIndicators
): Promise<{
  status: 'secure' | 'warning' | 'compromised' | 'frozen';
  shouldBlock: boolean;
  warnings: string[];
  requiresReauth: boolean;
}> {
  const deviceId = `${userId}_${deviceFingerprint}`;
  const deviceRef = db.collection('user_devices').doc(deviceId);
  const deviceDoc = await deviceRef.get();
  
  const warnings: string[] = [];
  let status: DeviceSecurityProfile['securityStatus'] = 'secure';
  let shouldBlock = false;
  let requiresReauth = false;
  
  if (indicators.rootDetected) {
    warnings.push('Device root/jailbreak detected');
    status = 'warning';
  }
  
  if (indicators.debuggerAttached) {
    warnings.push('Debugger attached to application');
    status = 'compromised';
    shouldBlock = true;
  }
  
  if (indicators.emulatorDetected) {
    warnings.push('Running on emulator/simulator');
    status = 'warning';
  }
  
  if (indicators.screenRecorderActive) {
    warnings.push('Screen recording detected');
    status = 'warning';
    requiresReauth = true;
  }
  
  if (indicators.suspiciousApps && indicators.suspiciousApps.length > 0) {
    warnings.push(`Suspicious apps detected: ${indicators.suspiciousApps.join(', ')}`);
    status = 'warning';
  }
  
  if (indicators.memoryTampering) {
    warnings.push('Memory tampering detected');
    status = 'compromised';
    shouldBlock = true;
  }
  
  if (indicators.networkProxy) {
    warnings.push('Network proxy detected');
    status = 'warning';
  }
  
  if (indicators.sslUnpinning) {
    warnings.push('SSL unpinning attempt detected');
    status = 'compromised';
    shouldBlock = true;
  }
  
  if (deviceDoc.exists) {
    const deviceData = deviceDoc.data() as DeviceSecurityProfile;
    if (deviceData.securityStatus === 'frozen') {
      status = 'frozen';
      shouldBlock = true;
      warnings.push('Device has been frozen due to security concerns');
    }
  }
  
  if (status === 'compromised' || status === 'frozen') {
    await deviceRef.update({
      securityStatus: status,
      compromised: true,
      suspiciousActivity: true,
      lastValidated: Timestamp.now(),
      compromiseReasons: warnings
    });
    
    await logSecurityEvent(userId, 'compromise_detected', 'critical', {
      deviceFingerprint,
      indicators,
      warnings
    }, 'device_security');
  } else if (status === 'warning') {
    await deviceRef.update({
      securityStatus: status,
      suspiciousActivity: true,
      lastValidated: Timestamp.now(),
      warningFlags: warnings
    });
    
    await logSecurityEvent(userId, 'malware_warning', 'high', {
      deviceFingerprint,
      indicators,
      warnings
    }, 'device_security');
  } else {
    await deviceRef.update({
      securityStatus: 'secure',
      lastValidated: Timestamp.now()
    });
  }
  
  return {
    status,
    shouldBlock,
    warnings,
    requiresReauth: requiresReauth || status === 'compromised'
  };
}

/**
 * Freeze device access due to security concerns
 */
export async function freezeDeviceAccess(
  userId: string,
  deviceFingerprint: string,
  reason: string
): Promise<void> {
  const deviceId = `${userId}_${deviceFingerprint}`;
  
  await db.collection('user_devices').doc(deviceId).update({
    securityStatus: 'frozen',
    compromised: true,
    lastValidated: Timestamp.now(),
    freezeReason: reason,
    frozenAt: Timestamp.now()
  });
  
  await logSecurityEvent(userId, 'device_frozen', 'critical', {
    deviceFingerprint,
    reason
  }, 'device_security');
}

/**
 * Restore device access after security review
 */
export async function restoreDeviceAccess(
  userId: string,
  deviceFingerprint: string,
  adminId: string
): Promise<void> {
  const deviceId = `${userId}_${deviceFingerprint}`;
  
  await db.collection('user_devices').doc(deviceId).update({
    securityStatus: 'secure',
    compromised: false,
    suspiciousActivity: false,
    lastValidated: Timestamp.now(),
    restoredBy: adminId,
    restoredAt: Timestamp.now()
  });
  
  await logSecurityEvent(userId, 'device_restored', 'medium', {
    deviceFingerprint,
    adminId
  }, 'device_security');
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  userId: string,
  eventType: SecurityEvent['eventType'],
  severity: SecurityEvent['severity'],
  metadata: Record<string, any>,
  source: string
): Promise<void> {
  const event: Omit<SecurityEvent, 'userId' | 'eventType' | 'severity' | 'timestamp' | 'source'> & {
    userId: string;
    eventType: SecurityEvent['eventType'];
    severity: SecurityEvent['severity'];
    timestamp: Timestamp;
    source: string;
  } = {
    userId,
    eventType,
    severity,
    metadata,
    timestamp: Timestamp.now(),
    source,
    resolved: false,
    deviceFingerprint: metadata.deviceFingerprint
  };
  
  await db.collection('security_events').add(event);
  
  if (severity === 'critical' || severity === 'high') {
    await createSecurityAlert(userId, eventType, severity, metadata);
  }
}

/**
 * Create security alert for user notification
 */
async function createSecurityAlert(
  userId: string,
  eventType: string,
  severity: string,
  metadata: Record<string, any>
): Promise<void> {
  await db.collection('security_alerts').add({
    userId,
    eventType,
    severity,
    metadata,
    read: false,
    dismissed: false,
    createdAt: Timestamp.now()
  });
}

/**
 * Get recent security events for a user
 */
export async function getRecentSecurityEvents(
  userId: string,
  limit: number = 50
): Promise<SecurityEvent[]> {
  const eventsSnapshot = await db.collection('security_events')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return eventsSnapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id
  } as SecurityEvent & { id: string }));
}

/**
 * Get device security profile
 */
export async function getDeviceSecurityProfile(
  userId: string,
  deviceFingerprint: string
): Promise<DeviceSecurityProfile | null> {
  const deviceId = `${userId}_${deviceFingerprint}`;
  const deviceDoc = await db.collection('user_devices').doc(deviceId).get();
  
  if (!deviceDoc.exists) {
    return null;
  }
  
  return deviceDoc.data() as DeviceSecurityProfile;
}

/**
 * Check if device requires reauthorization
 */
export async function checkReauthRequired(
  userId: string,
  deviceFingerprint: string
): Promise<boolean> {
  const recentCriticalEvents = await db.collection('security_events')
    .where('userId', '==', userId)
    .where('deviceFingerprint', '==', deviceFingerprint)
    .where('severity', 'in', ['critical', 'high'])
    .where('resolved', '==', false)
    .limit(1)
    .get();
  
  return !recentCriticalEvents.empty;
}

/**
 * Resolve security event after user action
 */
export async function resolveSecurityEvent(
  eventId: string,
  resolution: {
    resolvedBy: string;
    resolutionAction: string;
    notes?: string;
  }
): Promise<void> {
  await db.collection('security_events').doc(eventId).update({
    resolved: true,
    resolvedAt: Timestamp.now(),
    resolution
  });
}

/**
 * Clean up old security events (data retention)
 */
export async function cleanupOldSecurityEvents(
  retentionDays: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const oldEventsSnapshot = await db.collection('security_events')
    .where('timestamp', '<', Timestamp.fromDate(cutoffDate))
    .where('severity', 'in', ['low', 'medium'])
    .limit(500)
    .get();
  
  const batch = db.batch();
  oldEventsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  return oldEventsSnapshot.size;
}