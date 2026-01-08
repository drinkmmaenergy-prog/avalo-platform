/**
 * PACK 142 — Voice Signature Engine
 * 
 * Creates and validates voice signatures through:
 * - Voice calibration sample collection
 * - Voice characteristic extraction (tone, pace, timbre, spectral fingerprint)
 * - Voice verification against saved signature
 * - Anti-spoofing detection (voice changers, clones, studio filters)
 * 
 * NON-NEGOTIABLE RULES:
 * - No emotional/romantic phrases in calibration
 * - No NSFW content
 * - Zero shame UX messaging
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  VoiceSignature,
  VoicePrintData,
  VoiceVerificationCheck,
  IdentityCheck,
  IdentityCheckStatus,
  IDENTITY_THRESHOLDS,
} from './types/pack142-types';

const db = getFirestore();

declare const logger: {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
};

// ============================================================================
// VOICE PRINT EXTRACTION
// ============================================================================

/**
 * Extract voice characteristics from audio sample
 * In production, use audio processing libraries like librosa, pyAudioAnalysis
 * or cloud services like AWS Transcribe, Google Cloud Speech-to-Text
 */
async function extractVoicePrint(
  audioUrl: string,
  transcript: string
): Promise<VoicePrintData> {
  // Simulated voice print extraction
  // In production, this would involve:
  // 1. Load audio file
  // 2. Extract MFCC (Mel-frequency cepstral coefficients)
  // 3. Calculate pitch, formants, spectral features
  // 4. Create unique voice fingerprint
  
  const tone = Array.from({ length: 13 }, () => Math.random()); // MFCC coefficients
  const spectralFingerprint = Array.from({ length: 128 }, () => Math.random()); // Spectral features
  const formants = Array.from({ length: 5 }, () => 200 + Math.random() * 2000); // F1-F5 formants
  
  // Calculate pace (words per minute)
  const wordCount = transcript.trim().split(/\s+/).length;
  const audioDuration = 5; // Assume 5 seconds for calibration
  const pace = (wordCount / audioDuration) * 60;
  
  // Timbre characteristics
  const timbre = Array.from({ length: 8 }, () => Math.random());
  
  // Pitch range (Hz)
  const pitchRange = {
    min: 80 + Math.random() * 100, // Male: ~80-180 Hz, Female: ~165-255 Hz
    max: 180 + Math.random() * 120,
  };
  
  return {
    tone,
    pace,
    timbre,
    spectralFingerprint,
    pitchRange,
    formants,
  };
}

// ============================================================================
// VOICE SIGNATURE CREATION
// ============================================================================

/**
 * Create voice signature from calibration sample
 */
export async function createVoiceSignature(
  userId: string,
  calibrationAudioUrl: string,
  calibrationTranscript: string
): Promise<VoiceSignature> {
  const signatureId = `voice_sig_${userId}_${Date.now()}`;
  
  logger.info(`Creating voice signature ${signatureId} for user ${userId}`);
  
  // Validate calibration duration
  const audioDuration = 5; // In production, calculate from actual audio
  if (audioDuration < IDENTITY_THRESHOLDS.voiceSignature.minCalibrationDuration) {
    throw new Error(`Calibration audio too short: ${audioDuration}s < ${IDENTITY_THRESHOLDS.voiceSignature.minCalibrationDuration}s`);
  }
  
  // Extract voice print
  const voicePrint = await extractVoicePrint(calibrationAudioUrl, calibrationTranscript);
  
  const signature: VoiceSignature = {
    signatureId,
    userId,
    calibrationAudioUrl,
    calibrationDuration: audioDuration,
    calibrationTranscript,
    voicePrint,
    createdAt: Timestamp.now(),
    verificationCount: 0,
  };
  
  // Save signature
  await db.collection('voice_signatures').doc(signatureId).set(signature);
  
  logger.info(`Created voice signature ${signatureId}`);
  
  return signature;
}

// ============================================================================
// VOICE COMPARISON
// ============================================================================

/**
 * Calculate similarity between two voice prints
 */
function calculateVoiceSimilarity(
  voicePrint1: VoicePrintData,
  voicePrint2: VoicePrintData
): number {
  // Weighted similarity calculation
  const weights = {
    tone: 0.3,
    timbre: 0.25,
    spectralFingerprint: 0.25,
    pace: 0.1,
    pitchRange: 0.1,
  };
  
  // Cosine similarity for tone (MFCC)
  const toneSimilarity = cosineSimilarity(voicePrint1.tone, voicePrint2.tone);
  
  // Cosine similarity for timbre
  const timbreSimilarity = cosineSimilarity(voicePrint1.timbre, voicePrint2.timbre);
  
  // Cosine similarity for spectral fingerprint
  const spectralSimilarity = cosineSimilarity(
    voicePrint1.spectralFingerprint,
    voicePrint2.spectralFingerprint
  );
  
  // Pace similarity (normalized difference)
  const paceDiff = Math.abs(voicePrint1.pace - voicePrint2.pace);
  const paceSimilarity = Math.max(0, 1 - paceDiff / 100); // Normalize by 100 WPM
  
  // Pitch range overlap
  const pitchOverlap = calculateRangeOverlap(
    voicePrint1.pitchRange,
    voicePrint2.pitchRange
  );
  
  const overallSimilarity =
    toneSimilarity * weights.tone +
    timbreSimilarity * weights.timbre +
    spectralSimilarity * weights.spectralFingerprint +
    paceSimilarity * weights.pace +
    pitchOverlap * weights.pitchRange;
  
  return overallSimilarity;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate overlap between two ranges
 */
function calculateRangeOverlap(
  range1: { min: number; max: number },
  range2: { min: number; max: number }
): number {
  const overlapMin = Math.max(range1.min, range2.min);
  const overlapMax = Math.min(range1.max, range2.max);
  
  if (overlapMin >= overlapMax) return 0;
  
  const overlapSize = overlapMax - overlapMin;
  const range1Size = range1.max - range1.min;
  const range2Size = range2.max - range2.min;
  const avgRangeSize = (range1Size + range2Size) / 2;
  
  return overlapSize / avgRangeSize;
}

// ============================================================================
// ANTI-SPOOFING DETECTION
// ============================================================================

/**
 * Detect voice changer artifacts
 * In production, analyze spectral characteristics and formant shifts
 */
async function detectVoiceChanger(audioUrl: string): Promise<boolean> {
  // Simulated detection
  // Voice changers often have:
  // - Unnatural formant shifts
  // - Spectral artifacts
  // - Pitch shifting artifacts
  const detected = Math.random() < 0.05; // 5% false positive rate
  return detected;
}

/**
 * Detect voice clone (deepfake audio)
 * In production, analyze for GAN/TTS artifacts
 */
async function detectVoiceClone(audioUrl: string): Promise<boolean> {
  // Simulated detection
  // Voice clones often have:
  // - Unnatural prosody
  // - Phase inconsistencies
  // - Spectral smoothing
  const detected = Math.random() < 0.03; // 3% false positive rate
  return detected;
}

/**
 * Detect studio-level erotic ASMR filters
 */
async function detectStudioFilters(audioUrl: string): Promise<boolean> {
  // Simulated detection
  // Studio filters often have:
  // - Excessive bass boost
  // - Unnatural proximity effect
  // - Breath enhancement
  const detected = Math.random() < 0.02; // 2% false positive rate
  return detected;
}

// ============================================================================
// VOICE VERIFICATION
// ============================================================================

/**
 * Verify voice sample against saved signature
 */
export async function verifyVoice(
  userId: string,
  sampleAudioUrl: string,
  sampleTranscript: string
): Promise<VoiceVerificationCheck> {
  const checkId = `voice_verify_${userId}_${Date.now()}`;
  
  logger.info(`Verifying voice for user ${userId}`);
  
  // Get user's voice signature
  const signatureSnapshot = await db
    .collection('voice_signatures')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (signatureSnapshot.empty) {
    throw new Error(`No voice signature found for user ${userId}`);
  }
  
  const signature = signatureSnapshot.docs[0].data() as VoiceSignature;
  
  // Extract voice print from sample
  const sampleVoicePrint = await extractVoicePrint(sampleAudioUrl, sampleTranscript);
  
  // Compare voice prints
  const similarityScore = calculateVoiceSimilarity(signature.voicePrint, sampleVoicePrint);
  const voiceMatch = similarityScore >= IDENTITY_THRESHOLDS.voiceSignature.minSimilarity;
  
  // Anti-spoofing checks
  const [voiceChangerDetected, voiceCloneDetected, studioFilterDetected] = await Promise.all([
    detectVoiceChanger(sampleAudioUrl),
    detectVoiceClone(sampleAudioUrl),
    detectStudioFilters(sampleAudioUrl),
  ]);
  
  // Determine pass/fail
  const flags: string[] = [];
  if (!voiceMatch) flags.push('voice_mismatch');
  if (voiceChangerDetected) flags.push('voice_changer_detected');
  if (voiceCloneDetected) flags.push('voice_clone_detected');
  if (studioFilterDetected) flags.push('studio_filter_detected');
  
  const passed = voiceMatch && !voiceChangerDetected && !voiceCloneDetected && !studioFilterDetected;
  const confidence = passed ? similarityScore : similarityScore * 0.5;
  
  const sampleDuration = 3; // In production, calculate from actual audio
  
  const check: VoiceVerificationCheck = {
    checkId,
    userId,
    signatureId: signature.signatureId,
    sampleAudioUrl,
    sampleDuration,
    voiceMatch,
    similarityScore,
    voiceChangerDetected,
    voiceCloneDetected,
    studioFilterDetected,
    passed,
    confidence,
    flags,
    verifiedAt: Timestamp.now(),
  };
  
  // Save check
  await db.collection('voice_verification_logs').doc(checkId).set(check);
  
  // Update signature verification count
  await db.collection('voice_signatures').doc(signature.signatureId).update({
    verificationCount: (signature.verificationCount || 0) + 1,
    lastVerifiedAt: Timestamp.now(),
  });
  
  logger.info(`Voice verification ${checkId}: passed=${passed}, similarity=${similarityScore.toFixed(2)}`);
  
  // Create identity check record
  await createIdentityCheckFromVoiceVerification(userId, checkId, passed, flags, confidence);
  
  // If failed, create safety case
  if (!passed) {
    await createSafetyCaseForVoiceFailure(userId, checkId, flags);
  }
  
  return check;
}

// ============================================================================
// IDENTITY CHECK INTEGRATION
// ============================================================================

/**
 * Create identity check from voice verification
 */
async function createIdentityCheckFromVoiceVerification(
  userId: string,
  checkId: string,
  passed: boolean,
  flags: string[],
  confidence: number
): Promise<IdentityCheck> {
  const identityCheckId = `identity_voice_${userId}_${Date.now()}`;
  
  const status: IdentityCheckStatus = passed ? 'APPROVED' : 
    flags.some(f => f.includes('clone')) ? 'REJECTED' : 'MANUAL_REVIEW';
  
  const identityCheck: IdentityCheck = {
    checkId: identityCheckId,
    userId,
    checkType: 'VOICE_SIGNATURE',
    status,
    triggerReason: 'voice_call_or_verification',
    confidence,
    passed,
    flags,
    evidence: {
      type: 'VOICE_SIGNATURE',
      data: {
        voiceVerificationCheckId: checkId,
      },
      metadata: {},
    },
    initiatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  };
  
  await db.collection('identity_checks').doc(identityCheckId).set(identityCheck);
  
  return identityCheck;
}

/**
 * Create safety case for voice verification failure
 */
async function createSafetyCaseForVoiceFailure(
  userId: string,
  checkId: string,
  flags: string[]
): Promise<void> {
  const caseId = `safety_voice_${userId}_${Date.now()}`;
  
  const priority = flags.some(f => f.includes('clone')) ? 'HIGH' : 'MEDIUM';
  
  const safetyCase = {
    caseId,
    userId,
    caseType: 'VOICE_CLONE',
    checkIds: [checkId],
    evidence: [],
    priority,
    status: 'OPEN',
    actionTaken: {
      accountLocked: false,
      photosRemoved: [],
      notificationSent: true,
      banEvasionFlagged: false,
    },
    createdAt: Timestamp.now(),
  };
  
  await db.collection('identity_safety_cases').doc(caseId).set(safetyCase);
  
  logger.warn(`Created safety case ${caseId} for voice failure: user ${userId}`);
}

// ============================================================================
// VOICE SIGNATURE RETRIEVAL
// ============================================================================

/**
 * Get voice signature for user
 */
export async function getVoiceSignature(
  userId: string
): Promise<VoiceSignature | null> {
  const snapshot = await db
    .collection('voice_signatures')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as VoiceSignature;
}

/**
 * Check if user has voice signature
 */
export async function hasVoiceSignature(
  userId: string
): Promise<boolean> {
  const signature = await getVoiceSignature(userId);
  return signature !== null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createVoiceSignature,
  verifyVoice,
  getVoiceSignature,
  hasVoiceSignature,
};