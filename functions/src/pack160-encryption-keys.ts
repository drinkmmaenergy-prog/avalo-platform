/**
 * PACK 160 - Local Encryption Key Management
 * Backend functions for encryption key generation, rotation, and destruction
 */

import { db, admin } from './init';
import * as crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';

export interface EncryptionKeyMetadata {
  userId: string;
  containerId: string;
  containerType: 'media' | 'chat' | 'voice' | 'purchases' | 'credentials' | 'config';
  keyVersion: number;
  createdAt: Timestamp;
  lastRotatedAt: Timestamp;
  status: 'active' | 'rotating' | 'destroyed';
  deviceFingerprint?: string;
}

export interface KeyGenerationResult {
  keyId: string;
  encryptedMasterKey: string;
  keyVersion: number;
  containerType: string;
  expiresAt: number;
}

export interface KeyRotationResult {
  oldKeyId: string;
  newKeyId: string;
  rotatedAt: number;
  success: boolean;
}

/**
 * Generate local encryption keys for a user's container
 * Keys are encrypted with user-specific derivation
 */
export async function generateLocalEncryptionKeys(
  userId: string,
  containerType: EncryptionKeyMetadata['containerType'],
  deviceFingerprint?: string
): Promise<KeyGenerationResult> {
  const containerId = `${userId}_${containerType}_${Date.now()}`;
  
  const masterKey = crypto.randomBytes(32);
  const salt = crypto.randomBytes(16);
  
  const derivedKey = crypto.pbkdf2Sync(
    masterKey,
    salt,
    100000,
    32,
    'sha256'
  );
  
  const encryptedMasterKey = Buffer.concat([
    salt,
    derivedKey
  ]).toString('base64');
  
  const keyMetadata: EncryptionKeyMetadata = {
    userId,
    containerId,
    containerType,
    keyVersion: 1,
    createdAt: Timestamp.now(),
    lastRotatedAt: Timestamp.now(),
    status: 'active',
    deviceFingerprint
  };
  
  await db.collection('encryption_keys').doc(containerId).set(keyMetadata);
  
  await logDeviceSecurityEvent(userId, 'key_generated', {
    containerId,
    containerType,
    keyVersion: 1
  });
  
  const expiresAt = Date.now() + (90 * 24 * 60 * 60 * 1000);
  
  return {
    keyId: containerId,
    encryptedMasterKey,
    keyVersion: 1,
    containerType,
    expiresAt
  };
}

/**
 * Rotate encryption keys for a container
 * Creates new key while marking old key for secure destruction
 */
export async function rotateLocalEncryptionKeys(
  userId: string,
  oldKeyId: string
): Promise<KeyRotationResult> {
  const keyRef = db.collection('encryption_keys').doc(oldKeyId);
  const keyDoc = await keyRef.get();
  
  if (!keyDoc.exists) {
    throw new Error('Encryption key not found');
  }
  
  const oldMetadata = keyDoc.data() as EncryptionKeyMetadata;
  
  if (oldMetadata.userId !== userId) {
    throw new Error('Unauthorized key access');
  }
  
  await keyRef.update({
    status: 'rotating',
    lastRotatedAt: Timestamp.now()
  });
  
  const newKeyResult = await generateLocalEncryptionKeys(
    userId,
    oldMetadata.containerType,
    oldMetadata.deviceFingerprint
  );
  
  await keyRef.update({
    status: 'destroyed',
    destroyedAt: Timestamp.now(),
    replacedBy: newKeyResult.keyId
  });
  
  await logDeviceSecurityEvent(userId, 'key_rotated', {
    oldKeyId,
    newKeyId: newKeyResult.keyId,
    containerType: oldMetadata.containerType
  });
  
  return {
    oldKeyId,
    newKeyId: newKeyResult.keyId,
    rotatedAt: Date.now(),
    success: true
  };
}

/**
 * Destroy encryption keys immediately
 * Used for logout, account deletion, or security events
 */
export async function destroyLocalEncryptionKeys(
  userId: string,
  reason: 'logout' | 'deletion' | 'security_event' | 'device_change'
): Promise<void> {
  const keysSnapshot = await db.collection('encryption_keys')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();
  
  const batch = db.batch();
  
  for (const keyDoc of keysSnapshot.docs) {
    batch.update(keyDoc.ref, {
      status: 'destroyed',
      destroyedAt: Timestamp.now(),
      destroyReason: reason
    });
  }
  
  await batch.commit();
  
  await logDeviceSecurityEvent(userId, 'keys_destroyed', {
    reason,
    keyCount: keysSnapshot.size,
    timestamp: Date.now()
  });
}

/**
 * Log security events for audit trail
 */
export async function logDeviceSecurityEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, any>
): Promise<void> {
  await db.collection('security_events').add({
    userId,
    eventType,
    metadata,
    timestamp: Timestamp.now(),
    source: 'encryption_system'
  });
}

/**
 * Validate secure environment before key operations
 */
export async function validateSecureEnvironment(
  userId: string,
  deviceFingerprint: string
): Promise<{
  isSecure: boolean;
  warnings: string[];
  requiresReauth: boolean;
}> {
  const warnings: string[] = [];
  let requiresReauth = false;
  
  const recentSecurityEvents = await db.collection('security_events')
    .where('userId', '==', userId)
    .where('eventType', 'in', ['compromise_detected', 'malware_warning', 'screen_scraping'])
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  
  if (!recentSecurityEvents.empty) {
    warnings.push('Recent security events detected');
    requiresReauth = true;
  }
  
  const deviceDoc = await db.collection('user_devices')
    .doc(`${userId}_${deviceFingerprint}`)
    .get();
  
  if (deviceDoc.exists) {
    const deviceData = deviceDoc.data();
    if (deviceData?.compromised) {
      warnings.push('Device marked as compromised');
      requiresReauth = true;
    }
    if (deviceData?.suspiciousActivity) {
      warnings.push('Suspicious activity detected');
    }
  }
  
  const isSecure = warnings.length === 0;
  
  return {
    isSecure,
    warnings,
    requiresReauth
  };
}

/**
 * Get all active encryption keys for a user
 */
export async function getUserEncryptionKeys(
  userId: string
): Promise<EncryptionKeyMetadata[]> {
  const keysSnapshot = await db.collection('encryption_keys')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();
  
  return keysSnapshot.docs.map(doc => doc.data() as EncryptionKeyMetadata);
}

/**
 * Auto-rotate keys older than threshold
 */
export async function autoRotateExpiredKeys(
  thresholdDays: number = 90
): Promise<number> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
  
  const expiredKeysSnapshot = await db.collection('encryption_keys')
    .where('status', '==', 'active')
    .where('lastRotatedAt', '<', Timestamp.fromDate(thresholdDate))
    .limit(100)
    .get();
  
  let rotatedCount = 0;
  
  for (const keyDoc of expiredKeysSnapshot.docs) {
    const metadata = keyDoc.data() as EncryptionKeyMetadata;
    try {
      await rotateLocalEncryptionKeys(metadata.userId, keyDoc.id);
      rotatedCount++;
    } catch (error) {
      console.error(`Failed to rotate key ${keyDoc.id}:`, error);
    }
  }
  
  return rotatedCount;
}