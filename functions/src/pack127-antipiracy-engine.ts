/**
 * PACK 127 — Anti-Piracy & Watermarking Engine
 * 
 * Handles invisible watermarking, leak detection, and cross-platform piracy monitoring
 * 
 * NON-NEGOTIABLE RULES:
 * - Watermark embeds user/device fingerprint for leak tracing
 * - Leaker (not creator) is penalized
 * - Creator earnings unaffected by piracy
 * - No economic distortion
 */

import { db, serverTimestamp, generateId } from './init';
import {
  WatermarkMetadata,
  PiracyDetection,
  ContentAccessRecord,
  ExternalPlatformScan,
  IPFingerprint,
} from './pack127-types';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getFingerprint } from './pack127-fingerprint-engine';

// ============================================================================
// WATERMARK GENERATION & EMBEDDING
// ============================================================================

/**
 * Generate invisible watermark for content
 * Embeds user and device information
 */
export async function generateWatermark(
  userId: string,
  contentId: string,
  deviceFingerprint: string,
  sessionId: string,
  ipAddress?: string
): Promise<string> {
  const metadata: WatermarkMetadata = {
    userId,
    deviceFingerprint,
    timestamp: serverTimestamp() as any,
    checksum: generateWatermarkChecksum(userId, contentId, deviceFingerprint),
    sessionId,
    ipAddress: ipAddress ? hashIPAddress(ipAddress) : undefined,
    contentId,
  };
  
  // Encrypt watermark data
  const watermarkData = await encryptWatermark(metadata);
  
  return watermarkData;
}

/**
 * Embed watermark into content
 * Method varies by content type
 */
export async function embedWatermark(
  contentId: string,
  fingerprintId: string,
  userId: string,
  deviceFingerprint: string,
  sessionId: string
): Promise<{
  watermarked: boolean;
  watermarkData: string;
  accessRecordId: string;
}> {
  // Generate watermark
  const watermarkData = await generateWatermark(
    userId,
    contentId,
    deviceFingerprint,
    sessionId
  );
  
  // Update fingerprint with watermark flag
  await db.collection('ip_fingerprints').doc(fingerprintId).update({
    hasWatermark: true,
    watermarkData,
    updatedAt: serverTimestamp(),
  });
  
  // Create access record
  const accessRecordId = generateId();
  const accessRecord: ContentAccessRecord = {
    accessId: accessRecordId,
    contentId,
    fingerprintId,
    userId,
    accessType: 'VIEW',
    deviceFingerprint,
    watermarkEmbedded: true,
    watermarkData,
    sessionId,
    ipAddressHash: hashIPAddress(deviceFingerprint),
    accessedAt: serverTimestamp() as any,
    suspiciousActivity: false,
  };
  
  await db.collection('content_access_records').doc(accessRecordId).set(accessRecord);
  
  return {
    watermarked: true,
    watermarkData,
    accessRecordId,
  };
}

/**
 * Extract watermark from content
 * Used when pirated content is discovered
 */
export async function extractWatermark(
  watermarkData: string
): Promise<WatermarkMetadata | null> {
  try {
    const metadata = await decryptWatermark(watermarkData);
    return metadata;
  } catch (error) {
    console.error('[Anti-Piracy] Failed to extract watermark:', error);
    return null;
  }
}

/**
 * Generate watermark checksum
 */
function generateWatermarkChecksum(
  userId: string,
  contentId: string,
  deviceFingerprint: string
): string {
  return createHash('sha256')
    .update(`${userId}:${contentId}:${deviceFingerprint}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Hash IP address for privacy
 */
function hashIPAddress(ipAddress: string): string {
  return createHash('sha256')
    .update(ipAddress)
    .digest('hex');
}

// ============================================================================
// WATERMARK ENCRYPTION/DECRYPTION
// ============================================================================

const ENCRYPTION_KEY = process.env.WATERMARK_ENCRYPTION_KEY || 'default-key-change-in-production-32bytes';
const IV_LENGTH = 16;

/**
 * Encrypt watermark metadata
 */
async function encryptWatermark(metadata: WatermarkMetadata): Promise<string> {
  const iv = randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 32));
  
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  
  const metadataString = JSON.stringify(metadata);
  let encrypted = cipher.update(metadataString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Prepend IV to encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt watermark metadata
 */
async function decryptWatermark(encryptedData: string): Promise<WatermarkMetadata> {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 32));
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted) as WatermarkMetadata;
}

// ============================================================================
// PIRACY DETECTION
// ============================================================================

/**
 * Detect piracy from watermark trace
 * Called when pirated content is found externally
 */
export async function detectPiracyFromWatermark(
  originalContentId: string,
  extractedWatermarkData: string,
  piratedUrl?: string,
  platformName?: string
): Promise<PiracyDetection> {
  const detectionId = generateId();
  
  // Extract watermark to identify leaker
  const watermarkMetadata = await extractWatermark(extractedWatermarkData);
  
  if (!watermarkMetadata) {
    throw new Error('Failed to extract watermark metadata');
  }
  
  // Find original fingerprint
  const originalFingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', originalContentId)
    .limit(1)
    .get();
  
  if (originalFingerprints.empty) {
    throw new Error('Original content not found');
  }
  
  const originalFingerprint = originalFingerprints.docs[0].data() as IPFingerprint;
  
  const detection: PiracyDetection = {
    detectionId,
    originalFingerprintId: originalFingerprint.fingerprintId,
    originalOwnerId: originalFingerprint.ownerUserId,
    contentType: originalFingerprint.assetType,
    piratedUrl,
    platformDetectedOn: platformName || 'EXTERNAL',
    detectionMethod: 'WATERMARK_TRACE',
    leakerUserId: watermarkMetadata.userId,
    leakerDeviceFingerprint: watermarkMetadata.deviceFingerprint,
    accessedAt: watermarkMetadata.timestamp,
    status: 'DETECTED',
    
    // CRITICAL: Creator is not affected
    creatorAffected: false,
    creatorEarningsAffected: false,
    leakerPayoutFrozen: false,
    
    evidenceUrls: piratedUrl ? [piratedUrl] : [],
    detectedAt: serverTimestamp() as any,
  };
  
  await db.collection('piracy_detections').doc(detectionId).set(detection);
  
  // Suspend leaker pending investigation
  await suspendLeakerPendingInvestigation(watermarkMetadata.userId, detectionId);
  
  // Notify creator (not affected economically)
  await notifyCreatorOfPiracy(originalFingerprint.ownerUserId, detectionId);
  
  return detection;
}

/**
 * Report piracy manually (user report)
 */
export async function reportPiracy(
  reportedBy: string,
  originalContentId: string,
  piratedUrl: string,
  platformName: string,
  description: string
): Promise<string> {
  const detectionId = generateId();
  
  // Find original fingerprint
  const originalFingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', originalContentId)
    .limit(1)
    .get();
  
  if (originalFingerprints.empty) {
    throw new Error('Original content not found');
  }
  
  const originalFingerprint = originalFingerprints.docs[0].data() as IPFingerprint;
  
  const detection: PiracyDetection = {
    detectionId,
    originalFingerprintId: originalFingerprint.fingerprintId,
    originalOwnerId: originalFingerprint.ownerUserId,
    contentType: originalFingerprint.assetType,
    piratedUrl,
    platformDetectedOn: platformName,
    detectionMethod: 'USER_REPORT',
    status: 'INVESTIGATING',
    
    // CRITICAL: Creator is not affected
    creatorAffected: false,
    creatorEarningsAffected: false,
    leakerPayoutFrozen: false,
    
    evidenceUrls: [piratedUrl],
    detectedAt: serverTimestamp() as any,
  };
  
  await db.collection('piracy_detections').doc(detectionId).set(detection);
  
  return detectionId;
}

/**
 * Confirm piracy detection after investigation
 */
export async function confirmPiracyDetection(
  detectionId: string,
  investigatorId: string,
  notes: string
): Promise<void> {
  const detection = await getPiracyDetection(detectionId);
  if (!detection) {
    throw new Error('Detection not found');
  }
  
  await db.collection('piracy_detections').doc(detectionId).update({
    status: 'CONFIRMED',
    confirmedAt: serverTimestamp(),
    investigatedBy: investigatorId,
    investigationNotes: notes,
    updatedAt: serverTimestamp(),
  });
  
  // Take action against leaker
  if (detection.leakerUserId) {
    await takeActionAgainstLeaker(detection);
  }
}

/**
 * Suspend leaker pending investigation
 */
async function suspendLeakerPendingInvestigation(
  userId: string,
  detectionId: string
): Promise<void> {
  // Suspend user account
  await db.collection('users').doc(userId).update({
    accountStatus: 'SUSPENDED',
    suspendedReason: 'Content leak detected',
    suspendedAt: serverTimestamp(),
    relatedDetectionId: detectionId,
  });
  
  console.log(`[Anti-Piracy] User ${userId} suspended pending piracy investigation`);
}

/**
 * Take action against confirmed leaker
 */
async function takeActionAgainstLeaker(detection: PiracyDetection): Promise<void> {
  if (!detection.leakerUserId) {
    return;
  }
  
  // Freeze leaker's payout (only leaked revenue)
  await db.collection('piracy_detections').doc(detection.detectionId).update({
    actionTaken: 'PAYOUT_FROZEN',
    leakerPayoutFrozen: true,
    updatedAt: serverTimestamp(),
  });
  
  // Update enforcement state
  await db.collection('enforcement_states').doc(detection.leakerUserId).update({
    accountStatus: 'SUSPENDED',
    suspensionReason: 'Confirmed content piracy',
    suspendedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  console.log(`[Anti-Piracy] Action taken against leaker ${detection.leakerUserId}`);
}

// ============================================================================
// CROSS-PLATFORM DETECTION
// ============================================================================

/**
 * Scan external platform for pirated content
 */
export async function scanExternalPlatform(
  platform: string,
  fingerprintIds: string[]
): Promise<ExternalPlatformScan> {
  const scanId = generateId();
  
  const scan: ExternalPlatformScan = {
    scanId,
    platform,
    scanType: 'AUTOMATED',
    fingerprintsScanned: fingerprintIds.length,
    matchesFound: 0,
    detections: [],
    status: 'IN_PROGRESS',
    startedAt: serverTimestamp() as any,
  };
  
  await db.collection('external_platform_scans').doc(scanId).set(scan);
  
  // Scan logic would integrate with external platform APIs
  // This is a placeholder for the actual implementation
  
  return scan;
}

/**
 * Check for screenshot/screen recording attempts
 */
export async function detectScreenCapture(
  userId: string,
  contentId: string,
  deviceFingerprint: string
): Promise<{
  suspicious: boolean;
  reasons: string[];
}> {
  // Check for suspicious patterns
  const recentAccesses = await db
    .collection('content_access_records')
    .where('userId', '==', userId)
    .where('contentId', '==', contentId)
    .orderBy('accessedAt', 'desc')
    .limit(10)
    .get();
  
  const reasons: string[] = [];
  
  // Check for rapid repeated access (potential screen recording)
  if (recentAccesses.size >= 5) {
    const times = recentAccesses.docs.map(d => d.data().accessedAt.toMillis());
    const timeSpan = times[0] - times[times.length - 1];
    
    if (timeSpan < 60000) { // Less than 1 minute
      reasons.push('Rapid repeated access detected');
    }
  }
  
  // Check for multiple device fingerprints (sharing account)
  const uniqueDevices = new Set(
    recentAccesses.docs.map(d => d.data().deviceFingerprint)
  );
  
  if (uniqueDevices.size > 3) {
    reasons.push('Multiple devices accessing same content');
  }
  
  const suspicious = reasons.length > 0;
  
  if (suspicious) {
    // Mark access record as suspicious
    const latestAccess = recentAccesses.docs[0];
    await latestAccess.ref.update({
      suspiciousActivity: true,
      suspicionReasons: reasons,
    });
  }
  
  return { suspicious, reasons };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get piracy detection by ID
 */
export async function getPiracyDetection(detectionId: string): Promise<PiracyDetection | null> {
  const doc = await db.collection('piracy_detections').doc(detectionId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as PiracyDetection;
}

/**
 * Get piracy detections for content
 */
export async function getPiracyDetectionsForContent(
  contentId: string
): Promise<PiracyDetection[]> {
  const fingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', contentId)
    .get();
  
  if (fingerprints.empty) {
    return [];
  }
  
  const fingerprintId = fingerprints.docs[0].id;
  
  const snapshot = await db
    .collection('piracy_detections')
    .where('originalFingerprintId', '==', fingerprintId)
    .orderBy('detectedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PiracyDetection);
}

/**
 * Get piracy detections for creator
 */
export async function getPiracyDetectionsForCreator(
  creatorId: string
): Promise<PiracyDetection[]> {
  const snapshot = await db
    .collection('piracy_detections')
    .where('originalOwnerId', '==', creatorId)
    .orderBy('detectedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PiracyDetection);
}

/**
 * Notify creator of piracy detection
 */
async function notifyCreatorOfPiracy(
  creatorId: string,
  detectionId: string
): Promise<void> {
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: creatorId,
    type: 'PIRACY_DETECTED',
    title: 'Content Piracy Detected',
    message: 'We detected unauthorized distribution of your content. The leaker has been identified and action is being taken. Your earnings are not affected.',
    relatedDetectionId: detectionId,
    read: false,
    createdAt: serverTimestamp(),
    priority: 'HIGH',
  });
}

/**
 * Get content access records
 */
export async function getContentAccessRecords(
  contentId: string,
  limit: number = 50
): Promise<ContentAccessRecord[]> {
  const snapshot = await db
    .collection('content_access_records')
    .where('contentId', '==', contentId)
    .orderBy('accessedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ContentAccessRecord);
}

/**
 * Get suspicious access records
 */
export async function getSuspiciousAccessRecords(): Promise<ContentAccessRecord[]> {
  const snapshot = await db
    .collection('content_access_records')
    .where('suspiciousActivity', '==', true)
    .orderBy('accessedAt', 'desc')
    .limit(100)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ContentAccessRecord);
}