/**
 * PACK 55 — Global Compliance & Safety Core
 * Age Gate, CSAM, AML/KYC, GDPR, Policies
 */

import * as functions from 'firebase-functions';
import { db, admin } from './init';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AgeVerificationLevel = 'NONE' | 'SOFT' | 'DOCUMENT' | 'LIVENESS';

export interface AgeVerification {
  userId: string;
  dateOfBirth: string | null;
  ageVerified: boolean;
  ageVerificationLevel: AgeVerificationLevel;
  countryOfResidence?: string | null;
  verificationProvider?: string | null;
  verificationReferenceId?: string | null;
  lastUpdatedAt: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

export type MediaScanStatus = 'PENDING' | 'SCANNED' | 'FLAGGED' | 'ERROR';
export type RiskLevel = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MediaSource = 'CHAT_PPM' | 'PROFILE_MEDIA' | 'DISCOVERY_FEED' | 'MARKETPLACE';

export interface MediaSafetyScan {
  mediaId: string;
  ownerUserId: string;
  source: MediaSource;
  storagePath: string;
  scanStatus: MediaScanStatus;
  riskLevel: RiskLevel;
  flags: string[];
  scannerProvider?: string;
  scannerReferenceId?: string;
  createdAt: admin.firestore.Timestamp;
  scannedAt?: admin.firestore.Timestamp;
}

export type KYCLevel = 'NONE' | 'BASIC' | 'FULL';

export interface AMLProfile {
  userId: string;
  totalTokensEarnedAllTime: number;
  totalTokensEarnedLast30d: number;
  totalTokensEarnedLast365d: number;
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: KYCLevel;
  riskScore: number;
  riskFlags: string[];
  lastRiskAssessmentAt: admin.firestore.Timestamp;
  lastUpdatedAt: admin.firestore.Timestamp;
}

export type GDPRRequestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface GDPRErasureRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  reason?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface GDPRExportRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  downloadUrl?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export type PolicyType =
  | 'TERMS'
  | 'PRIVACY'
  | 'SAFETY'
  | 'AML'
  | 'MONETIZATION'
  | 'MARKETPLACE'
  | 'COOKIES';

export interface PolicyDocument {
  policyType: PolicyType;
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  createdAt: admin.firestore.Timestamp;
  isActive: boolean;
}

export interface PolicyAcceptance {
  userId: string;
  policyType: PolicyType;
  acceptedVersion: string;
  acceptedAt: admin.firestore.Timestamp;
}

// ============================================================================
// AGE VERIFICATION
// ============================================================================

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Get age verification state for a user
 */
export const getAgeState = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const ageVerificationRef = db.collection('age_verification').doc(userId);
    const ageVerificationDoc = await ageVerificationRef.get();

    if (!ageVerificationDoc.exists) {
      // Return default state for new users
      return {
        userId,
        ageVerified: false,
        ageVerificationLevel: 'NONE',
        dateOfBirth: null,
        countryOfResidence: null,
      };
    }

    const ageData = ageVerificationDoc.data() as AgeVerification;
    return {
      userId: ageData.userId,
      ageVerified: ageData.ageVerified,
      ageVerificationLevel: ageData.ageVerificationLevel,
      dateOfBirth: ageData.dateOfBirth,
      countryOfResidence: ageData.countryOfResidence,
    };
  } catch (error: any) {
    console.error('Error in getAgeState:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit soft age verification (self-declaration)
 */
export const ageSoftVerify = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, dateOfBirth, countryOfResidence } = data;

  if (!userId || !dateOfBirth) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and dateOfBirth are required');
  }

  // Verify user can only set their own age
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Can only verify own age');
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateOfBirth)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid date format. Use YYYY-MM-DD');
  }

  try {
    const age = calculateAge(dateOfBirth);
    const now = admin.firestore.Timestamp.now();

    const ageVerified = age >= 18;
    const ageVerificationLevel: AgeVerificationLevel = ageVerified ? 'SOFT' : 'NONE';

    const ageVerificationRef = db.collection('age_verification').doc(userId);
    const existingDoc = await ageVerificationRef.get();

    const ageVerificationData: AgeVerification = {
      userId,
      dateOfBirth,
      ageVerified,
      ageVerificationLevel,
      countryOfResidence: countryOfResidence || null,
      verificationProvider: null,
      verificationReferenceId: null,
      lastUpdatedAt: now,
      createdAt: existingDoc.exists ? (existingDoc.data() as AgeVerification).createdAt : now,
    };

    await ageVerificationRef.set(ageVerificationData, { merge: true });

    // If user is under 18, optionally flag for moderation
    if (!ageVerified) {
      console.warn(`User ${userId} attempted age verification but is under 18 (age: ${age})`);
      // Future: Create enforcement action or moderation case
    }

    return {
      userId,
      ageVerified,
      ageVerificationLevel,
      dateOfBirth,
      countryOfResidence: countryOfResidence || null,
    };
  } catch (error: any) {
    console.error('Error in ageSoftVerify:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// CSAM & CONTENT SAFETY SCANNER
// ============================================================================

/**
 * Trigger media safety scan (called after media upload)
 * This should be called from media upload flow (PACK 47)
 */
export async function triggerMediaSafetyScan(
  mediaId: string,
  ownerUserId: string,
  source: MediaSource,
  storagePath: string
): Promise<void> {
  const now = admin.firestore.Timestamp.now();

  const scanData: MediaSafetyScan = {
    mediaId,
    ownerUserId,
    source,
    storagePath,
    scanStatus: 'PENDING',
    riskLevel: 'UNKNOWN',
    flags: [],
    createdAt: now,
  };

  await db.collection('media_safety_scans').doc(mediaId).set(scanData);

  // Trigger async scan processing
  // For now, we'll process immediately in a separate function
  // In production, this would be enqueued via Cloud Tasks or Pub/Sub
  await processPendingMediaScan(mediaId);
}

/**
 * Process a pending media scan
 * In this pack, we stub the actual scanning logic
 * Future: Integrate with external CSAM/content safety provider
 */
async function processPendingMediaScan(mediaId: string): Promise<void> {
  try {
    const scanRef = db.collection('media_safety_scans').doc(mediaId);
    const scanDoc = await scanRef.get();

    if (!scanDoc.exists) {
      console.error(`Media scan not found: ${mediaId}`);
      return;
    }

    const scanData = scanDoc.data() as MediaSafetyScan;

    // STUB: Simulate scan result
    // In production, call external API (e.g., PhotoDNA, AWS Rekognition, etc.)
    const scanResult = await simulateContentScan(scanData.storagePath);

    const now = admin.firestore.Timestamp.now();

    await scanRef.update({
      scanStatus: scanResult.flagged ? 'FLAGGED' : 'SCANNED',
      riskLevel: scanResult.riskLevel,
      flags: scanResult.flags,
      scannedAt: now,
      scannerProvider: 'STUB_PROVIDER',
    });

    // If flagged, create moderation case
    if (scanResult.flagged) {
      await handleFlaggedMedia(scanData.ownerUserId, mediaId, scanResult);
    }
  } catch (error: any) {
    console.error(`Error processing media scan ${mediaId}:`, error);
    
    // Mark as ERROR
    await db.collection('media_safety_scans').doc(mediaId).update({
      scanStatus: 'ERROR',
      scannedAt: admin.firestore.Timestamp.now(),
    });
  }
}

/**
 * Simulate content scan (stub for external API)
 */
async function simulateContentScan(storagePath: string): Promise<{
  flagged: boolean;
  riskLevel: RiskLevel;
  flags: string[];
}> {
  // STUB: In production, this would call external API
  // For now, all content passes as LOW risk
  // Real implementation would analyze image/video content
  
  return {
    flagged: false,
    riskLevel: 'LOW',
    flags: [],
  };
}

/**
 * Handle flagged media (create moderation case)
 */
async function handleFlaggedMedia(
  userId: string,
  mediaId: string,
  scanResult: { riskLevel: RiskLevel; flags: string[] }
): Promise<void> {
  console.warn(`Flagged media: ${mediaId} for user ${userId}`, scanResult);

  // Create moderation case (PACK 54 integration)
  try {
    const caseId = db.collection('moderation_cases').doc().id;
    const now = admin.firestore.Timestamp.now();

    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      userId,
      type: 'CONTENT_SAFETY',
      status: 'OPEN',
      priority: scanResult.riskLevel === 'CRITICAL' ? 'URGENT' : 'HIGH',
      details: {
        mediaId,
        scanFlags: scanResult.flags,
        riskLevel: scanResult.riskLevel,
      },
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Created moderation case ${caseId} for flagged media ${mediaId}`);
  } catch (error: any) {
    console.error('Error creating moderation case for flagged media:', error);
  }
}

/**
 * Get media safety scan status (callable)
 */
export const getMediaScanStatus = functions.https.onCall(async (data, context) => {
  const { mediaId } = data;

  if (!mediaId) {
    throw new functions.https.HttpsError('invalid-argument', 'mediaId is required');
  }

  try {
    const scanDoc = await db.collection('media_safety_scans').doc(mediaId).get();

    if (!scanDoc.exists) {
      return {
        mediaId,
        scanStatus: 'PENDING',
        riskLevel: 'UNKNOWN',
      };
    }

    const scanData = scanDoc.data() as MediaSafetyScan;
    return {
      mediaId: scanData.mediaId,
      scanStatus: scanData.scanStatus,
      riskLevel: scanData.riskLevel,
      flags: scanData.flags,
    };
  } catch (error: any) {
    console.error('Error in getMediaScanStatus:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// AML / KYC MONITORING
// ============================================================================

/**
 * Get AML state for a user
 */
export const getAMLState = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const amlRef = db.collection('aml_profiles').doc(userId);
    const amlDoc = await amlRef.get();

    if (!amlDoc.exists) {
      // Return default state
      return {
        userId,
        kycRequired: false,
        kycVerified: false,
        kycLevel: 'NONE',
        riskScore: 0,
        riskFlags: [],
      };
    }

    const amlData = amlDoc.data() as AMLProfile;
    return {
      userId: amlData.userId,
      kycRequired: amlData.kycRequired,
      kycVerified: amlData.kycVerified,
      kycLevel: amlData.kycLevel,
      riskScore: amlData.riskScore,
      riskFlags: amlData.riskFlags,
    };
  } catch (error: any) {
    console.error('Error in getAMLState:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update AML profile based on earnings
 * Called internally by earning events (PACK 52)
 */
export async function updateAMLProfile(
  userId: string,
  tokensEarned: number
): Promise<void> {
  try {
    const amlRef = db.collection('aml_profiles').doc(userId);
    const amlDoc = await amlRef.get();
    const now = admin.firestore.Timestamp.now();

    if (!amlDoc.exists) {
      // Initialize new AML profile
      const newProfile: AMLProfile = {
        userId,
        totalTokensEarnedAllTime: tokensEarned,
        totalTokensEarnedLast30d: tokensEarned,
        totalTokensEarnedLast365d: tokensEarned,
        kycRequired: false,
        kycVerified: false,
        kycLevel: 'NONE',
        riskScore: 0,
        riskFlags: [],
        lastRiskAssessmentAt: now,
        lastUpdatedAt: now,
      };

      await amlRef.set(newProfile);
    } else {
      // Update existing profile
      await amlRef.update({
        totalTokensEarnedAllTime: admin.firestore.FieldValue.increment(tokensEarned),
        totalTokensEarnedLast30d: admin.firestore.FieldValue.increment(tokensEarned),
        totalTokensEarnedLast365d: admin.firestore.FieldValue.increment(tokensEarned),
        lastUpdatedAt: now,
      });
    }

    // Check if KYC is now required
    await assessAMLRisk(userId);
  } catch (error: any) {
    console.error(`Error updating AML profile for user ${userId}:`, error);
  }
}

/**
 * Assess AML risk and determine KYC requirements
 */
async function assessAMLRisk(userId: string): Promise<void> {
  try {
    const amlRef = db.collection('aml_profiles').doc(userId);
    const amlDoc = await amlRef.get();

    if (!amlDoc.exists) {
      return;
    }

    const amlData = amlDoc.data() as AMLProfile;
    const now = admin.firestore.Timestamp.now();

    // Simple heuristics (configurable thresholds)
    const KYC_THRESHOLD_365D = 2000; // Equivalent to ~2000 EUR in tokens
    const HIGH_RISK_COUNTRIES = ['XX', 'YY']; // Placeholder

    let riskScore = amlData.riskScore;
    const riskFlags: string[] = [...amlData.riskFlags];
    let kycRequired = amlData.kycRequired;

    // Check earning threshold
    if (amlData.totalTokensEarnedLast365d >= KYC_THRESHOLD_365D) {
      kycRequired = true;
      if (!riskFlags.includes('HIGH_VOLUME')) {
        riskFlags.push('HIGH_VOLUME');
        riskScore += 20;
      }
    }

    // Check country risk (would need user profile data)
    // For now, skip country check in this stub

    await amlRef.update({
      kycRequired,
      riskScore,
      riskFlags,
      lastRiskAssessmentAt: now,
      lastUpdatedAt: now,
    });

    if (kycRequired && !amlData.kycRequired) {
      console.log(`KYC now required for user ${userId} (earned ${amlData.totalTokensEarnedLast365d} tokens)`);
    }
  } catch (error: any) {
    console.error(`Error assessing AML risk for user ${userId}:`, error);
  }
}

/**
 * Scheduled function to update AML profiles (daily)
 */
export const amlDailyMonitor = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM UTC
  .onRun(async (context) => {
    console.log('[AML Monitor] Starting daily AML risk assessment');

    try {
      // Get all users with AML profiles
      const amlSnapshot = await db.collection('aml_profiles').limit(500).get();

      let processedCount = 0;
      for (const doc of amlSnapshot.docs) {
        await assessAMLRisk(doc.id);
        processedCount++;
      }

      console.log(`[AML Monitor] Processed ${processedCount} AML profiles`);
      return { success: true, count: processedCount };
    } catch (error: any) {
      console.error('[AML Monitor] Error in daily monitor:', error);
      throw error;
    }
  });

// ============================================================================
// GDPR CONTROLS
// ============================================================================

/**
 * Request data erasure (GDPR right to be forgotten)
 */
export const requestDataErasure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, reason } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Verify user can only request their own data erasure
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Can only request own data erasure');
  }

  try {
    const requestId = db.collection('gdpr_erasure_requests').doc().id;
    const now = admin.firestore.Timestamp.now();

    const erasureRequest: GDPRErasureRequest = {
      requestId,
      userId,
      status: 'PENDING',
      reason: reason || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('gdpr_erasure_requests').doc(requestId).set(erasureRequest);

    console.log(`GDPR erasure request created: ${requestId} for user ${userId}`);

    return {
      success: true,
      requestId,
      status: 'PENDING',
    };
  } catch (error: any) {
    console.error('Error in requestDataErasure:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Request data export (GDPR right to data portability)
 */
export const requestDataExport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Verify user can only request their own data export
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Can only request own data export');
  }

  try {
    const requestId = db.collection('gdpr_export_requests').doc().id;
    const now = admin.firestore.Timestamp.now();

    const exportRequest: GDPRExportRequest = {
      requestId,
      userId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('gdpr_export_requests').doc(requestId).set(exportRequest);

    console.log(`GDPR export request created: ${requestId} for user ${userId}`);

    return {
      success: true,
      requestId,
      status: 'PENDING',
    };
  } catch (error: any) {
    console.error('Error in requestDataExport:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// POLICIES & USER AGREEMENTS
// ============================================================================

/**
 * Helper to fetch policies for a locale
 */
async function fetchPoliciesForLocale(targetLocale: string): Promise<PolicyDocument[]> {
  const policyTypes: PolicyType[] = ['TERMS', 'PRIVACY', 'SAFETY', 'AML', 'MONETIZATION', 'MARKETPLACE', 'COOKIES'];
  const policies: PolicyDocument[] = [];

  for (const policyType of policyTypes) {
    const policySnapshot = await db.collection('policies')
      .where('policyType', '==', policyType)
      .where('locale', '==', targetLocale)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!policySnapshot.empty) {
      const policyData = policySnapshot.docs[0].data() as PolicyDocument;
      policies.push({
        policyType: policyData.policyType,
        version: policyData.version,
        title: policyData.title,
        contentMarkdown: policyData.contentMarkdown,
        locale: policyData.locale,
        isActive: policyData.isActive,
        createdAt: policyData.createdAt,
      });
    }
  }

  return policies;
}

/**
 * Get latest active policies
 */
export const getLatestPolicies = functions.https.onCall(async (data, context) => {
  const { locale } = data;
  const targetLocale = locale || 'en';

  try {
    let policies = await fetchPoliciesForLocale(targetLocale);

    // Fallback to English if no policies found for locale
    if (policies.length === 0 && targetLocale !== 'en') {
      policies = await fetchPoliciesForLocale('en');
    }

    return {
      policies,
      locale: targetLocale,
    };
  } catch (error: any) {
    console.error('Error in getLatestPolicies:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's policy acceptances
 */
export const getUserPolicyAcceptances = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const acceptancesSnapshot = await db.collection('policy_acceptances')
      .where('userId', '==', userId)
      .get();

    const acceptances: Array<{
      policyType: PolicyType;
      acceptedVersion: string;
      acceptedAt: number;
    }> = [];

    acceptancesSnapshot.forEach((doc) => {
      const data = doc.data() as PolicyAcceptance;
      acceptances.push({
        policyType: data.policyType,
        acceptedVersion: data.acceptedVersion,
        acceptedAt: data.acceptedAt.toMillis(),
      });
    });

    return {
      userId,
      acceptances,
    };
  } catch (error: any) {
    console.error('Error in getUserPolicyAcceptances:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Accept a policy
 */
export const acceptPolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, policyType, version } = data;

  if (!userId || !policyType || !version) {
    throw new functions.https.HttpsError('invalid-argument', 'userId, policyType, and version are required');
  }

  // Verify user can only accept policies for themselves
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Can only accept policies for own account');
  }

  const validPolicyTypes: PolicyType[] = ['TERMS', 'PRIVACY', 'SAFETY', 'AML', 'MONETIZATION', 'MARKETPLACE', 'COOKIES'];
  if (!validPolicyTypes.includes(policyType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid policy type');
  }

  try {
    const now = admin.firestore.Timestamp.now();
    const acceptanceId = `${userId}_${policyType}`;

    const acceptance: PolicyAcceptance = {
      userId,
      policyType,
      acceptedVersion: version,
      acceptedAt: now,
    };

    await db.collection('policy_acceptances').doc(acceptanceId).set(acceptance, { merge: true });

    console.log(`User ${userId} accepted ${policyType} version ${version}`);

    return {
      success: true,
      policyType,
      acceptedVersion: version,
    };
  } catch (error: any) {
    console.error('Error in acceptPolicy:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
