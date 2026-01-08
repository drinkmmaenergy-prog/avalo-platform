/**
 * PACK 142 — Identity Authenticity Cloud Functions Endpoints
 * 
 * Exposes identity verification systems as callable functions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  createLivenessSession,
  uploadLivenessVideo,
  getLivenessSession,
  needsLivenessVerification,
} from './pack142-liveness-engine';
import {
  runPhotoConsistencyCheck,
  runRecurrentAuthenticityCheck,
} from './pack142-photo-consistency-engine';
import {
  createVoiceSignature,
  verifyVoice,
  hasVoiceSignature,
} from './pack142-voice-signature-engine';
import {
  runStolenPhotoCheck,
  runDeepfakeDetection,
} from './pack142-stolen-photo-deepfake-engine';
import { analyzeSocialGraphFraud } from './pack142-identity-fraud-engine';

const db = getFirestore();

// ============================================================================
// LIVENESS CHECK ENDPOINTS
// ============================================================================

/**
 * Create liveness session
 */
export const pack142_createLivenessSession = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { triggerReason } = request.data;
    
    const session = await createLivenessSession(uid, triggerReason || 'manual_verification');
    
    return {
      sessionId: session.sessionId,
      status: session.status,
    };
  }
);

/**
 * Upload liveness video
 */
export const pack142_uploadLivenessVideo = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { sessionId, videoUrl, videoDuration } = request.data;
    
    if (!sessionId || !videoUrl || !videoDuration) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }
    
    await uploadLivenessVideo(sessionId, videoUrl, videoDuration);
    
    return { success: true };
  }
);

/**
 * Get liveness session
 */
export const pack142_getLivenessSession = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { sessionId } = request.data;
    
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Session ID required');
    }
    
    const session = await getLivenessSession(sessionId);
    
    if (!session) {
      throw new HttpsError('not-found', 'Session not found');
    }
    
    // Verify ownership
    if (session.userId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }
    
    return session;
  }
);

/**
 * Check if user needs liveness verification
 */
export const pack142_needsLivenessVerification = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const needs = await needsLivenessVerification(uid);
    
    return { needsVerification: needs };
  }
);

// ============================================================================
// PHOTO CONSISTENCY ENDPOINTS
// ============================================================================

/**
 * Run photo consistency check
 */
export const pack142_runPhotoConsistencyCheck = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { profilePhotoUrls, newPhotoUrl } = request.data;
    
    if (!profilePhotoUrls || profilePhotoUrls.length === 0) {
      throw new HttpsError('invalid-argument', 'Profile photos required');
    }
    
    const result = await runPhotoConsistencyCheck(uid, profilePhotoUrls, newPhotoUrl);
    
    return {
      checkId: result.checkId,
      passed: result.passed,
      confidence: result.confidence,
      flags: result.flags,
      overallConsistency: result.overallConsistency,
    };
  }
);

/**
 * Run recurrent authenticity check
 */
export const pack142_runRecurrentAuthenticityCheck = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { trigger, triggerData } = request.data;
    
    if (!trigger) {
      throw new HttpsError('invalid-argument', 'Trigger reason required');
    }
    
    const result = await runRecurrentAuthenticityCheck(uid, trigger, triggerData || {});
    
    return {
      checkId: result.checkId,
      passed: result.passed,
      requiresReVerification: result.requiresReVerification,
      blocksUploads: result.blocksUploads,
      flags: result.flags,
    };
  }
);

//============================================================================
// VOICE SIGNATURE ENDPOINTS
// ============================================================================

/**
 * Create voice signature
 */
export const pack142_createVoiceSignature = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { audioUrl, transcript } = request.data;
    
    if (!audioUrl || !transcript) {
      throw new HttpsError('invalid-argument', 'Audio URL and transcript required');
    }
    
    const signature = await createVoiceSignature(uid, audioUrl, transcript);
    
    return {
      signatureId: signature.signatureId,
      created: true,
    };
  }
);

/**
 * Verify voice
 */
export const pack142_verifyVoice = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { audioUrl, transcript } = request.data;
    
    if (!audioUrl || !transcript) {
      throw new HttpsError('invalid-argument', 'Audio URL and transcript required');
    }
    
    const result = await verifyVoice(uid, audioUrl, transcript);
    
    return {
      checkId: result.checkId,
      passed: result.passed,
      voiceMatch: result.voiceMatch,
      similarityScore: result.similarityScore,
      flags: result.flags,
    };
  }
);

/**
 * Check if user has voice signature
 */
export const pack142_hasVoiceSignature = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const has = await hasVoiceSignature(uid);
    
    return { hasSignature: has };
  }
);

// ============================================================================
// STOLEN PHOTO & DEEPFAKE ENDPOINTS
// ============================================================================

/**
 * Run stolen photo check
 */
export const pack142_runStolenPhotoCheck = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { photoUrl } = request.data;
    
    if (!photoUrl) {
      throw new HttpsError('invalid-argument', 'Photo URL required');
    }
    
    const result = await runStolenPhotoCheck(uid, photoUrl);
    
    return {
      checkId: result.checkId,
      stolenPhotoDetected: result.stolenPhotoDetected,
      confidence: result.confidence,
      flags: result.flags,
      matches: {
        celebrity: result.celebrityMatches.length > 0,
        stockPhoto: result.stockPhotoMatches.length > 0,
        adultContent: result.adultContentMatches.length > 0,
        aiGenerated: result.aiGeneratedMatches.length > 0,
      },
    };
  }
);

/**
 * Run deepfake detection
 */
export const pack142_runDeepfakeDetection = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { mediaUrl, mediaType } = request.data;
    
    if (!mediaUrl || !mediaType) {
      throw new HttpsError('invalid-argument', 'Media URL and type required');
    }
    
    if (mediaType !== 'IMAGE' && mediaType !== 'VIDEO') {
      throw new HttpsError('invalid-argument', 'Media type must be IMAGE or VIDEO');
    }
    
    const result = await runDeepfakeDetection(uid, mediaUrl, mediaType);
    
    return {
      checkId: result.checkId,
      isDeepfake: result.isDeepfake,
      deepfakeScore: result.deepfakeScore,
      passed: result.passed,
      confidence: result.confidence,
      flags: result.flags,
    };
  }
);

// ============================================================================
// IDENTITY FRAUD ENDPOINTS
// ============================================================================

/**
 * Analyze social graph fraud (Admin only)
 */
export const pack142_analyzeSocialGraphFraud = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Check admin permission
    const userDoc = await db.collection('users').doc(uid).get();
    const isAdmin = userDoc.data()?.role === 'admin';
    
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { targetUserId, userData } = request.data;
    
    if (!targetUserId || !userData) {
      throw new HttpsError('invalid-argument', 'Target user ID and data required');
    }
    
    const analysis = await analyzeSocialGraphFraud(targetUserId, userData);
    
    return {
      analysisId: analysis.analysisId,
      riskLevel: analysis.riskLevel,
      fraudProbability: analysis.fraudProbability,
      flags: analysis.flags,
      patterns: {
        repeatedCatfish: analysis.repeatedCatfishPattern,
        coordinated: analysis.coordinatedAccounts,
        massRegistration: analysis.massRegistrationPattern,
      },
    };
  }
);

/**
 * Get user identity check history
 */
export const pack142_getIdentityCheckHistory = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { limit = 10 } = request.data;
    
    const snapshot = await db
      .collection('identity_checks')
      .where('userId', '==', uid)
      .orderBy('initiatedAt', 'desc')
      .limit(limit)
      .get();
    
    const checks = snapshot.docs.map(doc => ({
      checkId: doc.data().checkId,
      checkType: doc.data().checkType,
      status: doc.data().status,
      passed: doc.data().passed,
      initiatedAt: doc.data().initiatedAt,
      completedAt: doc.data().completedAt,
    }));
    
    return { checks };
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack142_createLivenessSession,
  pack142_uploadLivenessVideo,
  pack142_getLivenessSession,
  pack142_needsLivenessVerification,
  pack142_runPhotoConsistencyCheck,
  pack142_runRecurrentAuthenticityCheck,
  pack142_createVoiceSignature,
  pack142_verifyVoice,
  pack142_hasVoiceSignature,
  pack142_runStolenPhotoCheck,
  pack142_runDeepfakeDetection,
  pack142_analyzeSocialGraphFraud,
  pack142_getIdentityCheckHistory,
};