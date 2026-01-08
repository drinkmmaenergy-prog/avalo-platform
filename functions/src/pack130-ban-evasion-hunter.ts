/**
 * PACK 130 — Ban-Evasion Hunter Module
 * 
 * Detects when banned users attempt to return with new accounts
 * Uses device fingerprinting, payment patterns, and behavioral signals
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DeviceFingerprint,
  BanEvasionRecord,
  TypingSignature,
  SensorConsistency,
  DEFAULT_PATROL_CONFIG,
} from './types/pack130-types';
import { patrolLogEvent } from './pack130-patrol-engine';

const DEVICE_FINGERPRINT_COLLECTION = 'user_devices';
const BAN_EVASION_COLLECTION = 'patrol_ban_evasion_records';
const BANNED_USERS_COLLECTION = 'user_enforcement_state';

// ============================================================================
// DEVICE FINGERPRINTING
// ============================================================================

/**
 * Create or update device fingerprint for a user
 */
export async function recordDeviceFingerprint(
  userId: string,
  deviceData: {
    deviceId: string;
    platform: 'MOBILE' | 'WEB' | 'DESKTOP';
    osVersion: string;
    appVersion: string;
    screenResolution: string;
    timezone: string;
    cityCode?: string;
    countryCode: string;
  }
): Promise<void> {
  const fingerprintId = `${userId}_${deviceData.deviceId}`;
  
  const existingFingerprint = await db.collection(DEVICE_FINGERPRINT_COLLECTION)
    .doc(fingerprintId)
    .get();
  
  if (existingFingerprint.exists) {
    await db.collection(DEVICE_FINGERPRINT_COLLECTION).doc(fingerprintId).update({
      lastSeen: Timestamp.now(),
      osVersion: deviceData.osVersion,
      appVersion: deviceData.appVersion,
    });
  } else {
    const fingerprint: DeviceFingerprint = {
      deviceId: deviceData.deviceId,
      userId,
      platform: deviceData.platform,
      osVersion: deviceData.osVersion,
      appVersion: deviceData.appVersion,
      screenResolution: deviceData.screenResolution,
      timezone: deviceData.timezone,
      cityCode: deviceData.cityCode,
      countryCode: deviceData.countryCode,
      firstSeen: Timestamp.now(),
      lastSeen: Timestamp.now(),
    };
    
    await db.collection(DEVICE_FINGERPRINT_COLLECTION).doc(fingerprintId).set(fingerprint);
  }
}

/**
 * Record typing signature for behavioral analysis
 */
export async function recordTypingSignature(
  userId: string,
  deviceId: string,
  signature: {
    averageWPM: number;
    commonPhrases: string[];
    languageFingerprint: string;
    capitalizedPatternFreq: number;
    emojiUsagePattern: string[];
  }
): Promise<void> {
  const fingerprintId = `${userId}_${deviceId}`;
  
  await db.collection(DEVICE_FINGERPRINT_COLLECTION).doc(fingerprintId).update({
    typingPatterns: signature,
  });
}

/**
 * Record sensor consistency patterns (mobile only)
 */
export async function recordSensorConsistency(
  userId: string,
  deviceId: string,
  sensorData: {
    accelerometerPattern: string;
    gyroscopePattern: string;
    consistencyScore: number;
  }
): Promise<void> {
  const fingerprintId = `${userId}_${deviceId}`;
  
  await db.collection(DEVICE_FINGERPRINT_COLLECTION).doc(fingerprintId).update({
    sensorData,
  });
}

// ============================================================================
// BAN EVASION DETECTION
// ============================================================================

/**
 * Check if a new user is potentially a banned user evading detection
 */
export async function checkForBanEvasion(
  newUserId: string,
  deviceId: string
): Promise<BanEvasionRecord | null> {
  console.log(`[Ban Evasion Hunter] Checking user ${newUserId} on device ${deviceId}`);
  
  // Get device fingerprint for new user
  const newUserDevice = await db.collection(DEVICE_FINGERPRINT_COLLECTION)
    .doc(`${newUserId}_${deviceId}`)
    .get();
  
  if (!newUserDevice.exists) {
    return null;  // No fingerprint yet
  }
  
  const newDeviceData = newUserDevice.data() as DeviceFingerprint;
  
  // Find all banned users
  const bannedUsers = await db.collection(BANNED_USERS_COLLECTION)
    .where('accountStatus', 'in', ['SUSPENDED', 'HARD_RESTRICTED'])
    .get();
  
  if (bannedUsers.empty) {
    return null;  // No banned users to check against
  }
  
  let bestMatch: {
    bannedUserId: string;
    confidence: number;
    matches: {
      device: boolean;
      location: boolean;
      payment: boolean;
      typing: boolean;
      content: boolean;
    };
  } | null = null;
  
  // Check each banned user for matches
  for (const bannedUserDoc of bannedUsers.docs) {
    const bannedUserId = bannedUserDoc.id;
    
    // Skip if same user (shouldn't happen, but safety check)
    if (bannedUserId === newUserId) continue;
    
    // Get banned user's devices
    const bannedUserDevices = await db.collection(DEVICE_FINGERPRINT_COLLECTION)
      .where('userId', '==', bannedUserId)
      .get();
    
    if (bannedUserDevices.empty) continue;
    
    // Check for matches
    for (const bannedDeviceDoc of bannedUserDevices.docs) {
      const bannedDeviceData = bannedDeviceDoc.data() as DeviceFingerprint;
      
      const matches = {
        device: checkDeviceMatch(newDeviceData, bannedDeviceData),
        location: checkLocationMatch(newDeviceData, bannedDeviceData),
        payment: false,  // Will be checked separately
        typing: false,   // Will be checked separately
        content: false,  // Will be checked separately
      };
      
      // Check payment patterns
      matches.payment = await checkPaymentPatternMatch(newUserId, bannedUserId);
      
      // Check typing signatures
      if (newDeviceData.typingPatterns && bannedDeviceData.typingPatterns) {
        matches.typing = checkTypingMatch(
          newDeviceData.typingPatterns,
          bannedDeviceData.typingPatterns
        );
      }
      
      // Check content similarity
      matches.content = await checkContentSimilarity(newUserId, bannedUserId);
      
      // Calculate overall confidence
      const confidence = calculateEvasionConfidence(matches);
      
      // Keep best match
      if (confidence > DEFAULT_PATROL_CONFIG.banEvasionConfidenceThreshold) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            bannedUserId,
            confidence,
            matches,
          };
        }
      }
    }
  }
  
  // If we found a strong match, create ban evasion record
  if (bestMatch) {
    const record = await createBanEvasionRecord(
      newUserId,
      bestMatch.bannedUserId,
      bestMatch.confidence,
      bestMatch.matches
    );
    
    return record;
  }
  
  return null;
}

/**
 * Check if devices match (same hardware)
 */
function checkDeviceMatch(
  device1: DeviceFingerprint,
  device2: DeviceFingerprint
): boolean {
  // Exact device ID match (strong signal)
  if (device1.deviceId === device2.deviceId) {
    return true;
  }
  
  // Similar device characteristics (weaker signal)
  const platformMatch = device1.platform === device2.platform;
  const resolutionMatch = device1.screenResolution === device2.screenResolution;
  const timezoneMatch = device1.timezone === device2.timezone;
  
  // If 3/3 match, likely same device with new ID
  return platformMatch && resolutionMatch && timezoneMatch;
}

/**
 * Check if locations match (city-level)
 */
function checkLocationMatch(
  device1: DeviceFingerprint,
  device2: DeviceFingerprint
): boolean {
  // Country must match
  if (device1.countryCode !== device2.countryCode) {
    return false;
  }
  
  // City match is strong signal
  if (device1.cityCode && device2.cityCode) {
    return device1.cityCode === device2.cityCode;
  }
  
  // Same country is weak match
  return true;
}

/**
 * Check if payment patterns match
 */
async function checkPaymentPatternMatch(
  userId1: string,
  userId2: string
): Promise<boolean> {
  // Get payment methods for both users
  const user1Payments = await db.collection('payment_methods')
    .where('userId', '==', userId1)
    .limit(5)
    .get();
  
  const user2Payments = await db.collection('payment_methods')
    .where('userId', '==', userId2)
    .limit(5)
    .get();
  
  if (user1Payments.empty || user2Payments.empty) {
    return false;
  }
  
  // Check for matching payment method fingerprints
  const user1Methods = user1Payments.docs.map(d => d.data().fingerprint);
  const user2Methods = user2Payments.docs.map(d => d.data().fingerprint);
  
  // Any overlap is suspicious
  for (const method1 of user1Methods) {
    if (user2Methods.includes(method1)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if typing signatures match
 */
function checkTypingMatch(
  sig1: TypingSignature,
  sig2: TypingSignature
): boolean {
  // WPM should be similar (within 20%)
  const wpmDiff = Math.abs(sig1.averageWPM - sig2.averageWPM);
  const wpmThreshold = Math.max(sig1.averageWPM, sig2.averageWPM) * 0.2;
  
  if (wpmDiff > wpmThreshold) {
    return false;
  }
  
  // Check common phrase overlap
  const commonPhrases1 = new Set(sig1.commonPhrases);
  const commonPhrases2 = new Set(sig2.commonPhrases);
  let phraseOverlap = 0;
  
  for (const phrase of Array.from(commonPhrases1)) {
    if (commonPhrases2.has(phrase)) {
      phraseOverlap++;
    }
  }
  
  // If 30%+ phrases match, likely same person
  const overlapRatio = phraseOverlap / Math.max(sig1.commonPhrases.length, sig2.commonPhrases.length);
  
  return overlapRatio >= 0.3;
}

/**
 * Check if content patterns are similar
 */
async function checkContentSimilarity(
  userId1: string,
  userId2: string
): Promise<boolean> {
  // Check if users post similar content
  const user1Content = await db.collection('user_media')
    .where('userId', '==', userId1)
    .limit(10)
    .get();
  
  const user2Content = await db.collection('user_media')
    .where('userId', '==', userId2)
    .limit(10)
    .get();
  
  if (user1Content.empty || user2Content.empty) {
    return false;
  }
  
  // In a real implementation, this would use perceptual hashing
  // For now, we do basic metadata comparison
  const user1Tags = new Set<string>();
  const user2Tags = new Set<string>();
  
  user1Content.docs.forEach(doc => {
    const tags = doc.data().tags || [];
    tags.forEach((tag: string) => user1Tags.add(tag));
  });
  
  user2Content.docs.forEach(doc => {
    const tags = doc.data().tags || [];
    tags.forEach((tag: string) => user2Tags.add(tag));
  });
  
  // Check tag overlap
  let tagOverlap = 0;
  for (const tag of Array.from(user1Tags)) {
    if (user2Tags.has(tag)) {
      tagOverlap++;
    }
  }
  
  const overlapRatio = tagOverlap / Math.max(user1Tags.size, user2Tags.size);
  
  return overlapRatio >= 0.4;
}

/**
 * Calculate overall evasion confidence
 */
function calculateEvasionConfidence(matches: {
  device: boolean;
  location: boolean;
  payment: boolean;
  typing: boolean;
  content: boolean;
}): number {
  const weights = {
    device: 0.35,
    location: 0.15,
    payment: 0.25,
    typing: 0.15,
    content: 0.10,
  };
  
  let confidence = 0;
  
  if (matches.device) confidence += weights.device;
  if (matches.location) confidence += weights.location;
  if (matches.payment) confidence += weights.payment;
  if (matches.typing) confidence += weights.typing;
  if (matches.content) confidence += weights.content;
  
  return confidence;
}

/**
 * Create ban evasion record and take action
 */
async function createBanEvasionRecord(
  suspectedUserId: string,
  bannedUserId: string,
  confidence: number,
  matches: {
    device: boolean;
    location: boolean;
    payment: boolean;
    typing: boolean;
    content: boolean;
  }
): Promise<BanEvasionRecord> {
  const recordId = `${suspectedUserId}_${bannedUserId}_${Date.now()}`;
  
  const record: BanEvasionRecord = {
    recordId,
    suspectedUserId,
    bannedUserId,
    deviceMatch: matches.device,
    locationMatch: matches.location,
    paymentMatch: matches.payment,
    typingMatch: matches.typing,
    contentMatch: matches.content,
    overallConfidence: confidence,
    matchDetails: matches,
    accountLocked: false,
    moderationCaseCreated: false,
    detectedAt: Timestamp.now(),
  };
  
  // If high confidence, lock account immediately
  if (confidence >= 0.9) {
    await lockSuspectedAccount(suspectedUserId);
    record.accountLocked = true;
  }
  
  // Create moderation case for review
  const caseId = await createEvasionCase(suspectedUserId, bannedUserId, confidence, matches);
  record.moderationCaseCreated = true;
  record.caseId = caseId;
  
  // Save record
  await db.collection(BAN_EVASION_COLLECTION).doc(recordId).set(record);
  
  // Log to patrol engine
  await patrolLogEvent({
    userId: suspectedUserId,
    eventType: 'BAN_EVASION',
    metadata: {
      bannedUserId,
      confidence,
      matches,
      accountLocked: record.accountLocked,
    },
    importance: 'CRITICAL',
  });
  
  console.log(`[Ban Evasion Hunter] Detected evasion: ${suspectedUserId} may be ${bannedUserId} (confidence: ${confidence.toFixed(2)})`);
  
  return record;
}

/**
 * Lock suspected evasion account
 */
async function lockSuspectedAccount(userId: string): Promise<void> {
  await db.collection('user_enforcement_state').doc(userId).set({
    accountStatus: 'SUSPENDED',
    reasonCodes: ['BAN_EVASION_DETECTED'],
    suspendedAt: Timestamp.now(),
    requiresManualReview: true,
  }, { merge: true });
}

/**
 * Create moderation case for evasion attempt
 */
async function createEvasionCase(
  suspectedUserId: string,
  bannedUserId: string,
  confidence: number,
  matches: Record<string, boolean>
): Promise<string> {
  const caseData = {
    subjectUserId: suspectedUserId,
    category: 'BAN_EVASION',
    priority: confidence >= 0.9 ? 'CRITICAL' : 'VERY_HIGH',
    status: 'PENDING',
    createdAt: Timestamp.now(),
    source: 'BAN_EVASION_HUNTER',
    details: {
      bannedUserId,
      confidence,
      matches,
      requiresHumanReview: true,
    },
  };
  
  const caseRef = await db.collection('patrol_cases').add(caseData);
  return caseRef.id;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all ban evasion records for a user
 */
export async function getBanEvasionRecords(userId: string): Promise<BanEvasionRecord[]> {
  const snapshot = await db.collection(BAN_EVASION_COLLECTION)
    .where('suspectedUserId', '==', userId)
    .orderBy('detectedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as BanEvasionRecord);
}

/**
 * Get unresolved evasion cases
 */
export async function getUnresolvedEvasionCases(): Promise<BanEvasionRecord[]> {
  const snapshot = await db.collection(BAN_EVASION_COLLECTION)
    .where('resolvedAt', '==', null)
    .orderBy('detectedAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as BanEvasionRecord);
}

/**
 * Resolve ban evasion case
 */
export async function resolveBanEvasionCase(
  recordId: string,
  confirmed: boolean,
  moderatorNotes?: string
): Promise<void> {
  await db.collection(BAN_EVASION_COLLECTION).doc(recordId).update({
    resolvedAt: Timestamp.now(),
    confirmed,
    moderatorNotes,
  });
  
  // If false positive, unlock the account
  if (!confirmed) {
    const record = await db.collection(BAN_EVASION_COLLECTION).doc(recordId).get();
    const data = record.data() as BanEvasionRecord;
    
    if (data.accountLocked) {
      await db.collection('user_enforcement_state').doc(data.suspectedUserId).update({
        accountStatus: 'ACTIVE',
        reasonCodes: [],
      });
    }
  }
}