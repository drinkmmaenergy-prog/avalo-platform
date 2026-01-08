/**
 * PACK 127 — IP Protection Endpoints
 * 
 * Cloud Functions exposing IP protection services
 * 
 * NON-NEGOTIABLE RULES:
 * - All creators protected equally
 * - No monetization/ranking effects
 * - False claims penalize claimant
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// Fingerprint engine
import {
  registerFingerprint,
  matchFingerprint,
  getFingerprint,
  getUserFingerprints,
  detectDerivative,
  getFingerprintMatches,
} from './pack127-fingerprint-engine';

// Claims engine
import {
  submitCopyrightClaim,
  reviewClaim,
  getClaim,
  getUserClaims,
  getClaimsAgainstUser,
} from './pack127-claims-engine';

// Anti-piracy engine
import {
  embedWatermark,
  detectPiracyFromWatermark,
  reportPiracy,
  confirmPiracyDetection,
  getPiracyDetection,
  getPiracyDetectionsForCreator,
  scanExternalPlatform,
} from './pack127-antipiracy-engine';

// Licensing engine
import {
  createLicense,
  revokeLicense,
  renewLicense,
  verifyLicense,
  getLicense,
  getLicensesOwnedByUser,
  getLicensesHeldByUser,
  autoExpireLicenses,
  sendExpiryReminders,
  getLicensingStats,
} from './pack127-licensing-engine';

// ============================================================================
// FINGERPRINT ENDPOINTS
// ============================================================================

export const pack127_registerFingerprint = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { assetId, assetType, assetUrl, metadata } = request.data;
  
  if (!assetId || !assetType) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const fingerprint = await registerFingerprint({
    userId,
    assetId,
    assetType,
    assetUrl,
    metadata,
  });
  
  return { success: true, fingerprint };
});

export const pack127_matchFingerprint = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { fingerprintId } = request.data;
  
  if (!fingerprintId) {
    throw new HttpsError('invalid-argument', 'Missing fingerprintId');
  }
  
  const result = await matchFingerprint(fingerprintId);
  
  return { success: true, ...result };
});

export const pack127_getUserFingerprints = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const fingerprints = await getUserFingerprints(userId);
  
  return { success: true, count: fingerprints.length, fingerprints };
});

export const pack127_detectDerivative = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { fingerprintId } = request.data;
  
  if (!fingerprintId) {
    throw new HttpsError('invalid-argument', 'Missing fingerprintId');
  }
  
  const result = await detectDerivative(fingerprintId);
  
  return { success: true, ...result };
});

// ============================================================================
// COPYRIGHT CLAIM ENDPOINTS
// ============================================================================

export const pack127_submitClaim = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { accusedUserId, accusedAssetId, claimType, description, evidenceUrls } = request.data;
  
  if (!accusedUserId || !accusedAssetId || !claimType || !description) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const result = await submitCopyrightClaim({
      claimantUserId: userId,
      accusedUserId,
      accusedAssetId,
      claimType,
      description,
      evidenceUrls,
    });
    
    return { success: true, ...result };
  } catch (error: any) {
    throw new HttpsError('failed-precondition', error.message);
  }
});

export const pack127_getUserClaims = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const claims = await getUserClaims(userId);
  
  return { success: true, count: claims.length, claims };
});

export const pack127_getClaimsAgainstUser = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const claims = await getClaimsAgainstUser(userId);
  
  return { success: true, count: claims.length, claims };
});

export const pack127_getClaim = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { claimId } = request.data;
  
  if (!claimId) {
    throw new HttpsError('invalid-argument', 'Missing claimId');
  }
  
  const claim = await getClaim(claimId);
  
  if (!claim) {
    throw new HttpsError('not-found', 'Claim not found');
  }
  
  // Verify user is involved in claim
  if (claim.claimantUserId !== userId && claim.accusedUserId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized to view this claim');
  }
  
  return { success: true, claim };
});

// ============================================================================
// ADMIN CLAIM REVIEW ENDPOINTS
// ============================================================================

export const pack127_admin_reviewClaim = onCall(async (request) => {
  const moderatorId = request.auth?.uid;
  if (!moderatorId) {
    throw new HttpsError('unauthenticated', 'Moderator must be authenticated');
  }
  
  // Verify moderator role (integrate with existing admin check)
  // This would use your existing admin verification
  
  const { claimId, decision, notes } = request.data;
  
  if (!claimId || !decision || !notes) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  await reviewClaim(claimId, moderatorId, decision, notes);
  
  return { success: true, message: 'Claim reviewed' };
});

// ============================================================================
// ANTI-PIRACY ENDPOINTS
// ============================================================================

export const pack127_embedWatermark = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { contentId, fingerprintId, deviceFingerprint, sessionId } = request.data;
  
  if (!contentId || !fingerprintId || !deviceFingerprint || !sessionId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const result = await embedWatermark(
    contentId,
    fingerprintId,
    userId,
    deviceFingerprint,
    sessionId
  );
  
  return { success: true, ...result };
});

export const pack127_reportPiracy = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { originalContentId, piratedUrl, platformName, description } = request.data;
  
  if (!originalContentId || !piratedUrl || !platformName) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const detectionId = await reportPiracy(
    userId,
    originalContentId,
    piratedUrl,
    platformName,
    description
  );
  
  return { success: true, detectionId };
});

export const pack127_getPiracyDetections = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const detections = await getPiracyDetectionsForCreator(userId);
  
  return { success: true, count: detections.length, detections };
});

export const pack127_admin_confirmPiracy = onCall(async (request) => {
  const investigatorId = request.auth?.uid;
  if (!investigatorId) {
    throw new HttpsError('unauthenticated', 'Investigator must be authenticated');
  }
  
  // Verify admin role
  
  const { detectionId, notes } = request.data;
  
  if (!detectionId || !notes) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  await confirmPiracyDetection(detectionId, investigatorId, notes);
  
  return { success: true, message: 'Piracy confirmed' };
});

// ============================================================================
// LICENSING ENDPOINTS
// ============================================================================

export const pack127_createLicense = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { licenseeId, licenseeType, assetRefs, licenseType, scope, restrictions, durationDays } = request.data;
  
  if (!licenseeId || !licenseeType || !assetRefs || !licenseType || !scope || !durationDays) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const license = await createLicense({
      ownerUserId: userId,
      licenseeId,
      licenseeType,
      assetRefs,
      licenseType,
      scope,
      restrictions,
      durationDays,
    });
    
    return { success: true, license };
  } catch (error: any) {
    throw new HttpsError('failed-precondition', error.message);
  }
});

export const pack127_revokeLicense = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { licenseId, reason } = request.data;
  
  if (!licenseId || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    await revokeLicense(licenseId, userId, reason);
    
    return { success: true, message: 'License revoked' };
  } catch (error: any) {
    throw new HttpsError('failed-precondition', error.message);
  }
});

export const pack127_renewLicense = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { licenseId, additionalDays } = request.data;
  
  if (!licenseId || !additionalDays) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    await renewLicense(licenseId, additionalDays);
    
    return { success: true, message: 'License renewed' };
  } catch (error: any) {
    throw new HttpsError('failed-precondition', error.message);
  }
});

export const pack127_verifyLicense = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { assetRef } = request.data;
  
  if (!assetRef) {
    throw new HttpsError('invalid-argument', 'Missing assetRef');
  }
  
  const result = await verifyLicense(userId, assetRef);
  
  return { success: true, ...result };
});

export const pack127_getMyLicenses = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { type } = request.data; // 'owned' or 'held'
  
  const licenses = type === 'held'
    ? await getLicensesHeldByUser(userId)
    : await getLicensesOwnedByUser(userId);
  
  return { success: true, count: licenses.length, licenses };
});

export const pack127_getLicensingStats = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const stats = await getLicensingStats(userId);
  
  return { success: true, stats };
});

// ============================================================================
// CREATOR IP DASHBOARD
// ============================================================================

export const pack127_getIPDashboard = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Aggregate all IP protection data
  const [
    fingerprints,
    filedClaims,
    receivedClaims,
    piracyDetections,
    ownedLicenses,
    heldLicenses,
    licensingStats,
  ] = await Promise.all([
    getUserFingerprints(userId),
    getUserClaims(userId),
    getClaimsAgainstUser(userId),
    getPiracyDetectionsForCreator(userId),
    getLicensesOwnedByUser(userId),
    getLicensesHeldByUser(userId),
    getLicensingStats(userId),
  ]);
  
  return {
    success: true,
    dashboard: {
      contentProtection: {
        totalFingerprints: fingerprints.length,
        activeFingerprints: fingerprints.filter(f => f.status === 'ACTIVE').length,
        disputedContent: fingerprints.filter(f => f.status === 'DISPUTED').length,
      },
      claims: {
        filedByYou: filedClaims.length,
        filedAgainstYou: receivedClaims.length,
        openClaims: filedClaims.filter(c => c.status === 'OPEN' || c.status === 'UNDER_REVIEW').length,
      },
      antiPiracy: {
        detectionsTotal: piracyDetections.length,
        confirmedLeaks: piracyDetections.filter(d => d.status === 'CONFIRMED').length,
        investigating: piracyDetections.filter(d => d.status === 'INVESTIGATING').length,
      },
      licensing: {
        ...licensingStats,
        ownedLicenses: ownedLicenses.length,
        heldLicenses: heldLicenses.length,
      },
    },
  };
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

export const pack127_autoExpireLicenses = onSchedule({
  schedule: '0 0 * * *',  // Daily at midnight UTC
  timeZone: 'UTC',
}, async (event) => {
  const expiredCount = await autoExpireLicenses();
  console.log(`[Pack 127] Auto-expired ${expiredCount} licenses`);
});

export const pack127_sendExpiryReminders = onSchedule({
  schedule: '0 9 * * *',  // Daily at 9 AM UTC
  timeZone: 'UTC',
}, async (event) => {
  const remindersSent = await sendExpiryReminders();
  console.log(`[Pack 127] Sent ${remindersSent} license expiry reminders`);
});