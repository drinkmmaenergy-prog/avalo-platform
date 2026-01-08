/**
 * PACK 306 — Mandatory Identity Verification
 * Cloud Functions for identity, age, and photo verification
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';

const db = admin.firestore();
const storage = new Storage();

// ============================================================================
// TYPES
// ============================================================================

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'BANNED' | 'BANNED_TEMP' | 'BANNED_PERMANENT';

export interface VerificationStatusDoc {
  status: VerificationStatus;
  method: string;
  ageVerified: boolean;
  minAgeConfirmed: number;
  photosChecked: boolean;
  attempts: number;
  lastAttemptAt: FirebaseFirestore.Timestamp;
  reasonFailed: string | null;
  adminOverride: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface VerificationAttempt {
  userId: string;
  attemptNumber: number;
  attemptedAt: FirebaseFirestore.Timestamp;
  result: 'SUCCESS' | 'LIVENESS_FAIL' | 'AGE_FAIL' | 'PHOTO_MISMATCH' | 'BANNED';
  livenessScore?: number;
  ageEstimate?: number;
  photoMatchScore?: number;
  failureReason?: string;
}

export interface FaceEmbedding {
  vector: number[];
  confidence: number;
  metadata: {
    livenessScore: number;
    ageEstimate: number;
    quality: number;
  };
}

export interface VerificationReviewItem {
  userId: string;
  userName: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  flagReason: string;
  priority: number;
  selfieUrl: string;
  photos: string[];
  faceMatchScores: number[];
  ageEstimate: number;
  livenessScore: number;
  createdAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
  reviewNotes?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  LIVENESS_THRESHOLD: 0.85,
  MIN_AGE: 18,
  FACE_MATCH_THRESHOLD: 0.75,
  MAX_ATTEMPTS_PER_DAY: 3,
  MAX_TOTAL_ATTEMPTS: 7,
  TEMP_BAN_HOURS: 48,
  SELFIE_BUCKET: 'avalo-verify',
  SELFIE_RETENTION_DAYS: 90,
  EMBEDDING_RETENTION_YEARS: 2,
  LOG_RETENTION_YEARS: 5,
  REQUIRED_FACE_PHOTOS: 1, // Minimum 1, up to 6
  MAX_FACE_PHOTOS: 6,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log audit event
 */
async function logAuditEvent(
  action: string,
  userId: string,
  metadata: any = {}
): Promise<void> {
  await db.collection('auditLogs').add({
    action,
    userId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata,
    // No biometric data in logs
  });
}

/**
 * Get verification status for user
 */
async function getVerificationStatus(
  userId: string
): Promise<VerificationStatusDoc | null> {
  const doc = await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .doc('status')
    .get();
  
  return doc.exists ? (doc.data() as VerificationStatusDoc) : null;
}

/**
 * Initialize verification status for new user
 */
async function initializeVerificationStatus(userId: string): Promise<void> {
  const statusDoc: VerificationStatusDoc = {
    status: 'UNVERIFIED',
    method: 'SELFIE_LIVENESS_V1',
    ageVerified: false,
    minAgeConfirmed: 0,
    photosChecked: false,
    attempts: 0,
    lastAttemptAt: admin.firestore.Timestamp.now(),
    reasonFailed: null,
    adminOverride: false,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .doc('status')
    .set(statusDoc);

  await logAuditEvent('VERIFICATION_INITIALIZED', userId);
}

/**
 * Check if user can attempt verification
 */
async function canAttemptVerification(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getVerificationStatus(userId);
  
  if (!status) {
    return { allowed: true };
  }

  if (status.status === 'BANNED_PERMANENT') {
    return { allowed: false, reason: 'Account permanently banned from verification' };
  }

  if (status.status === 'BANNED_TEMP') {
    const banExpiry = new Date(status.lastAttemptAt.toMillis() + CONFIG.TEMP_BAN_HOURS * 60 * 60 * 1000);
    if (new Date() < banExpiry) {
      return { allowed: false, reason: `Temporarily banned until ${banExpiry.toISOString()}` };
    }
  }

  if (status.attempts >= CONFIG.MAX_TOTAL_ATTEMPTS) {
    return { allowed: false, reason: 'Maximum total attempts exceeded' };
  }

  // Check attempts in last 24h
  const attemptsRef = db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .collection('attempts')
    .where('attemptedAt', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000));
  
  const recentAttempts = await attemptsRef.get();
  
  if (recentAttempts.size >= CONFIG.MAX_ATTEMPTS_PER_DAY) {
    return { allowed: false, reason: 'Maximum daily attempts exceeded (3 per 24h)' };
  }

  return { allowed: true };
}

/**
 * Simulate liveness detection (replace with actual AI service)
 */
async function performLivenessDetection(
  videoData: Buffer
): Promise<{ score: number; passed: boolean }> {
  // In production, integrate with services like:
  // - AWS Rekognition
  // - Azure Face API
  // - Google Cloud Vision AI
  // - FaceTec
  // - Onfido
  
  // Simulate detection
  const score = 0.9 + Math.random() * 0.1; // Mock: 0.9-1.0
  return {
    score,
    passed: score >= CONFIG.LIVENESS_THRESHOLD,
  };
}

/**
 * Simulate age estimation from face (replace with actual AI service)
 */
async function estimateAge(
  faceEmbedding: number[]
): Promise<{ age: number; confidence: number }> {
  // In production, integrate with age estimation AI models
  // - Azure Face API
  // - AWS Rekognition
  // - Custom trained models
  
  // Simulate age estimation
  const age = 25 + Math.floor(Math.random() * 20); // Mock: 25-44
  const confidence = 0.85 + Math.random() * 0.15;
  
  return { age, confidence };
}

/**
 * Extract face embedding from image (replace with actual AI service)
 */
async function extractFaceEmbedding(
  imageData: Buffer
): Promise<FaceEmbedding> {
  // In production, use face recognition services
  // - FaceNet
  // - ArcFace
  // - AWS Rekognition
  // - Azure Face API
  
  // Simulate embedding extraction
  const vector = Array(512).fill(0).map(() => Math.random());
  
  return {
    vector,
    confidence: 0.95,
    metadata: {
      livenessScore: 0.92,
      ageEstimate: 28,
      quality: 0.88,
    },
  };
}

/**
 * Compare two face embeddings
 */
function compareFaceEmbeddings(
  embedding1: number[],
  embedding2: number[]
): number {
  // Cosine similarity
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Check for AI-generated or manipulated images
 */
async function detectAIGenerated(
  imageData: Buffer
): Promise<{ isAI: boolean; confidence: number; flags: string[] }> {
  // In production, use AI detection services
  // - Sensity AI
  // - Reality Defender
  // - Custom models
  
  const flags: string[] = [];
  
  // Simulate detection
  const isAI = Math.random() < 0.05; // 5% false positive rate
  
  if (isAI) {
    flags.push('AI_SMOOTHING_DETECTED');
  }
  
  return {
    isAI,
    confidence: 0.92,
    flags,
  };
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Initialize verification on user creation
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  try {
    await initializeVerificationStatus(user.uid);
    console.log(`Verification initialized for user ${user.uid}`);
  } catch (error) {
    console.error('Error initializing verification:', error);
  }
});

/**
 * Start verification process
 */
export const startVerification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  
  // Check if allowed
  const canAttempt = await canAttemptVerification(userId);
  if (!canAttempt.allowed) {
    throw new functions.https.HttpsError('permission-denied', canAttempt.reason || 'Cannot attempt verification');
  }

  // Update status to PENDING
  await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .doc('status')
    .update({
      status: 'PENDING',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await logAuditEvent('VERIFICATION_STARTED', userId);

  return { success: true, message: 'Verification started' };
});

/**
 * Verify selfie with liveness detection
 */
export const verifySelfie = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { videoBase64 } = data;

  if (!videoBase64) {
    throw new functions.https.HttpsError('invalid-argument', 'Video data required');
  }

  try {
    // Decode video
    const videoBuffer = Buffer.from(videoBase64, 'base64');

    // Perform liveness detection
    const liveness = await performLivenessDetection(videoBuffer);

    if (!liveness.passed) {
      await logAuditEvent('VERIFICATION_LIVENESS_FAIL', userId, {
        score: liveness.score,
      });

      // Record attempt
      await recordVerificationAttempt(userId, 'LIVENESS_FAIL', {
        livenessScore: liveness.score,
      });

      throw new functions.https.HttpsError('failed-precondition', 'Liveness check failed');
    }

    // Extract face embedding
    const embedding = await extractFaceEmbedding(videoBuffer);

    // Estimate age
    const ageResult = await estimateAge(embedding.vector);

    if (ageResult.age < CONFIG.MIN_AGE) {
      await logAuditEvent('VERIFICATION_AGE_FAIL', userId, {
        estimatedAge: ageResult.age,
      });

      // Record attempt
      await recordVerificationAttempt(userId, 'AGE_FAIL', {
        livenessScore: liveness.score,
        ageEstimate: ageResult.age,
      });

      // Ban account
      await db
        .collection('users')
        .doc(userId)
        .collection('verification')
        .doc('status')
        .update({
          status: 'FAILED',
          ageVerified: false,
          minAgeConfirmed: ageResult.age,
          reasonFailed: 'User appears to be under 18',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      throw new functions.https.HttpsError('failed-precondition', 'Age verification failed');
    }

    // Store selfie and embedding
    const fileName = `${userId}/${Date.now()}-selfie.mp4`;
    const file = storage.bucket(CONFIG.SELFIE_BUCKET).file(fileName);
    
    await file.save(videoBuffer, {
      metadata: {
        contentType: 'video/mp4',
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Store embedding
    await db
      .collection('users')
      .doc(userId)
      .collection('verification')
      .doc('embedding')
      .set({
        vector: embedding.vector,
        confidence: embedding.confidence,
        livenessScore: liveness.score,
        ageEstimate: ageResult.age,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await logAuditEvent('VERIFICATION_SELFIE_SUCCESS', userId, {
      livenessScore: liveness.score,
      ageEstimate: ageResult.age,
    });

    return {
      success: true,
      livenessScore: liveness.score,
      ageVerified: true,
      estimatedAge: ageResult.age,
    };

  } catch (error: any) {
    console.error('Selfie verification error:', error);
    throw error;
  }
});

/**
 * Verify profile photos match selfie
 */
export const verifyProfilePhotos = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { photosBase64 }: { photosBase64: string[] } = data;

  if (!photosBase64 || photosBase64.length < CONFIG.REQUIRED_FACE_PHOTOS) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `At least ${CONFIG.REQUIRED_FACE_PHOTOS} photo required`
    );
  }

  if (photosBase64.length > CONFIG.MAX_FACE_PHOTOS) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Maximum ${CONFIG.MAX_FACE_PHOTOS} photos allowed for verification`
    );
  }

  try {
    // Get stored selfie embedding
    const embeddingDoc = await db
      .collection('users')
      .doc(userId)
      .collection('verification')
      .doc('embedding')
      .get();

    if (!embeddingDoc.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Selfie verification required first');
    }

    const selfieEmbedding = embeddingDoc.data()!.vector;
    const matchScores: number[] = [];
    const flags: string[] = [];

    // Verify each photo
    for (let i = 0; i < photosBase64.length; i++) {
      const photoBuffer = Buffer.from(photosBase64[i], 'base64');
      
      // Check for AI-generated
      const aiCheck = await detectAIGenerated(photoBuffer);
      if (aiCheck.isAI) {
        flags.push(`Photo ${i + 1}: ${aiCheck.flags.join(', ')}`);
      }

      // Extract embedding
      const photoEmbedding = await extractFaceEmbedding(photoBuffer);
      
      // Compare with selfie
      const similarity = compareFaceEmbeddings(selfieEmbedding, photoEmbedding.vector);
      matchScores.push(similarity);

      if (similarity < CONFIG.FACE_MATCH_THRESHOLD) {
        await logAuditEvent('VERIFICATION_PHOTO_MISMATCH', userId, {
          photoIndex: i,
          similarity,
        });

        // Record attempt
        await recordVerificationAttempt(userId, 'PHOTO_MISMATCH', {
          photoMatchScore: similarity,
        });

        throw new functions.https.HttpsError(
          'failed-precondition',
          `Photo ${i + 1} does not match your selfie`
        );
      }
    }

    // If flagged for review
    if (flags.length > 0) {
      await addToReviewQueue(userId, flags, matchScores);
      
      await db
        .collection('users')
        .doc(userId)
        .collection('verification')
        .doc('status')
        .update({
          status: 'PENDING',
          photosChecked: false,
          reasonFailed: 'Photos flagged for manual review',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        requiresReview: true,
        message: 'Photos submitted for manual review',
      };
    }

    // All photos verified
    await db
      .collection('users')
      .doc(userId)
      .collection('verification')
      .doc('status')
      .update({
        status: 'VERIFIED',
        photosChecked: true,
        ageVerified: true,
        minAgeConfirmed: CONFIG.MIN_AGE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await recordVerificationAttempt(userId, 'SUCCESS');
    await logAuditEvent('VERIFICATION_SUCCESS', userId);

    return {
      success: true,
      verified: true,
      matchScores,
    };

  } catch (error: any) {
    console.error('Photo verification error:', error);
    throw error;
  }
});

/**
 * Record verification attempt
 */
async function recordVerificationAttempt(
  userId: string,
  result: VerificationAttempt['result'],
  metadata: any = {}
): Promise<void> {
  const status = await getVerificationStatus(userId);
  const attemptNumber = (status?.attempts || 0) + 1;

  const attempt: VerificationAttempt = {
    userId,
    attemptNumber,
    attemptedAt: admin.firestore.Timestamp.now(),
    result,
    ...metadata,
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .collection('attempts')
    .add(attempt);

  // Update status
  const updates: any = {
    attempts: admin.firestore.FieldValue.increment(1),
    lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Apply ban logic
  if (attemptNumber >= CONFIG.MAX_ATTEMPTS_PER_DAY && result !== 'SUCCESS') {
    updates.status = 'BANNED_TEMP';
    updates.reasonFailed = 'Too many failed attempts';
    await logAuditEvent('VERIFICATION_TEMP_BAN', userId, { attempts: attemptNumber });
  }

  if (attemptNumber >= CONFIG.MAX_TOTAL_ATTEMPTS && result !== 'SUCCESS') {
    updates.status = 'BANNED_PERMANENT';
    updates.reasonFailed = 'Maximum attempts exceeded';
    await logAuditEvent('VERIFICATION_PERMANENT_BAN', userId, { attempts: attemptNumber });
  }

  await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .doc('status')
    .update(updates);
}

/**
 * Add to manual review queue
 */
async function addToReviewQueue(
  userId: string,
  flags: string[],
  matchScores: number[]
): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const reviewItem: VerificationReviewItem = {
    userId,
    userName: userData?.displayName || 'Unknown',
    status: 'PENDING_REVIEW',
    flagReason: flags.join('; '),
    priority: 5, // Medium priority
    selfieUrl: '', // Add actual URL
    photos: [], // Add actual URLs
    faceMatchScores: matchScores,
    ageEstimate: 0, // Add from embedding
    livenessScore: 0, // Add from embedding
    createdAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('verificationReviewQueue').add(reviewItem);
}

/**
 * Verify user during meeting (QR selfie check)
 */
export const verifyMeetingSelfie = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { meetingId, selfieBase64 } = data;

  if (!meetingId || !selfieBase64) {
    throw new functions.https.HttpsError('invalid-argument', 'Meeting ID and selfie required');
  }

  try {
    // Get stored embedding
    const embeddingDoc = await db
      .collection('users')
      .doc(userId)
      .collection('verification')
      .doc('embedding')
      .get();

    if (!embeddingDoc.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'User not verified');
    }

    const storedEmbedding = embeddingDoc.data()!.vector;

    // Extract embedding from meeting selfie
    const selfieBuffer = Buffer.from(selfieBase64, 'base64');
    const meetingEmbedding = await extractFaceEmbedding(selfieBuffer);

    // Compare
    const similarity = compareFaceEmbeddings(storedEmbedding, meetingEmbedding.vector);

    const verified = similarity >= CONFIG.FACE_MATCH_THRESHOLD;

    // Store verification result
    await db.collection('pack306_meeting_verifications').add({
      meetingId,
      userId,
      verified,
      similarity,
      participants: [], // Add from meeting data
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent('MEETING_SELFIE_VERIFICATION', userId, {
      meetingId,
      verified,
      similarity,
    });

    if (!verified) {
      // Terminate meeting and process refund (integrate with PACK 268)
      await logAuditEvent('MEETING_TERMINATED_MISMATCH', userId, { meetingId });
    }

    return { verified, similarity };

  } catch (error: any) {
    console.error('Meeting selfie verification error:', error);
    throw error;
  }
});

/**
 * Admin: Manual verification override
 */
export const adminVerificationOverride = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin role
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.roles?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, approve, notes } = data;

  if (!userId || approve === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and approval status required');
  }

  await db
    .collection('users')
    .doc(userId)
    .collection('verification')
    .doc('status')
    .update({
      status: approve ? 'VERIFIED' : 'FAILED',
      adminOverride: true,
      reasonFailed: approve ? null : notes || 'Rejected by admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await logAuditEvent('VERIFICATION_MANUAL_OVERRIDE', userId, {
    adminId: context.auth.uid,
    approved: approve,
    notes,
  });

  return { success: true };
});

/**
 * Cleanup old selfie data (scheduled)
 */
export const cleanupOldVerificationData = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.SELFIE_RETENTION_DAYS);

    const bucket = storage.bucket(CONFIG.SELFIE_BUCKET);
    const [files] = await bucket.getFiles({
      prefix: '',
    });

    let deletedCount = 0;

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const createdDate = new Date(metadata.timeCreated);

      if (createdDate < cutoffDate) {
        await file.delete();
        deletedCount++;
      }
    }

    console.log(`Deleted ${deletedCount} old verification files`);
    return { deletedCount };
  });