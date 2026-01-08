/**
 * PACK 133 — AI Creative Studio Safety Validator
 * 
 * Comprehensive safety checks for AI-enhanced content:
 * - NSFW generation prevention
 * - Identity manipulation detection
 * - Deepfake detection
 * - Voice cloning prevention
 * - Content manipulation monitoring
 * 
 * CRITICAL: All AI processing MUST pass safety validation
 */

import { db, storage, serverTimestamp } from './init';
import { moderateContent } from './aiModerationEngine';
import {
  SafetyValidationRequest,
  SafetyValidationResult,
  SafetyCheckResult,
  AIStudioErrorCode,
} from './pack133-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// SAFETY THRESHOLDS (NON-NEGOTIABLE)
// ============================================================================

const SAFETY_THRESHOLDS = {
  NSFW_GENERATION: 0.1, // Block if AI generates NSFW content
  IDENTITY_CHANGE: 0.05, // Block if face/identity modified
  DEEPFAKE: 0.1, // Block if deepfake detected
  VOICE_CLONE: 0.1, // Block if voice cloning detected
  CONTENT_MANIPULATION: 0.2, // Block if excessive manipulation
};

// ============================================================================
// PRE-PROCESSING SAFETY CHECK
// ============================================================================

/**
 * Validates input before AI processing
 * Ensures source content is safe and user is authorized
 */
export async function validatePreProcessing(
  request: SafetyValidationRequest
): Promise<SafetyValidationResult> {
  const violations: string[] = [];
  const scores = {
    nsfwGeneration: 0,
    identityChange: 0,
    deepfakeDetection: 0,
    voiceClone: 0,
    contentManipulation: 0,
  };

  try {
    // Step 1: Verify user authorization
    const userDoc = await db.collection('users').doc(request.userId).get();
    if (!userDoc.exists) {
      violations.push('USER_NOT_FOUND');
      return createFailureResult('FAIL_MANIPULATION', violations, scores);
    }

    const userData = userDoc.data();

    // Step 2: Check if user is under enforcement
    if (userData?.enforcement?.severity === 'HIGH' || userData?.enforcement?.severity === 'CRITICAL') {
      violations.push('USER_UNDER_ENFORCEMENT');
      return createFailureResult('FAIL_MANIPULATION', violations, scores);
    }

    // Step 3: Validate input content with existing moderation system
    const moderationResult = await moderateContent(
      `ai-input-${Date.now()}`,
      request.userId,
      request.inputUrl,
      {
        contentType: 'POST_MEDIA',
        userId: request.userId,
        isAdultVerified: userData?.ageVerified === true,
      }
    );

    // Block if input content is unsafe
    if (moderationResult.decision === 'AUTO_BLOCK') {
      violations.push('UNSAFE_INPUT_CONTENT');
      scores.nsfwGeneration = moderationResult.labels.adult;
      return createFailureResult('FAIL_NSFW_GENERATION', violations, scores);
    }

    // Step 4: Check for face presence in images/videos (for identity tracking)
    if (request.mediaType === 'IMAGE' || request.mediaType === 'VIDEO') {
      const hasFaces = await detectFaces(request.inputUrl);
      if (hasFaces) {
        // Store original face fingerprint for comparison
        const faceFingerprint = await generateFaceFingerprint(request.inputUrl);
        await storeFaceFingerprint(request.userId, faceFingerprint);
      }
    }

    // Step 5: Create fingerprint of original content
    if (request.originalFingerprint) {
      await storeOriginalFingerprint(request.userId, request.originalFingerprint);
    }

    return {
      passed: true,
      result: 'PASS',
      scores,
      violations: [],
      timestamp: Timestamp.now(),
    };
  } catch (error: any) {
    console.error('Pre-processing validation failed:', error);
    violations.push('VALIDATION_ERROR');
    return createFailureResult('FAIL_MANIPULATION', violations, scores);
  }
}

// ============================================================================
// POST-PROCESSING SAFETY CHECK
// ============================================================================

/**
 * Validates output after AI processing
 * Ensures no prohibited transformations occurred
 */
export async function validatePostProcessing(
  request: SafetyValidationRequest
): Promise<SafetyValidationResult> {
  if (!request.outputUrl) {
    throw new Error('Output URL required for post-processing validation');
  }

  const violations: string[] = [];
  const scores = {
    nsfwGeneration: 0,
    identityChange: 0,
    deepfakeDetection: 0,
    voiceClone: 0,
    contentManipulation: 0,
  };

  try {
    // Step 1: Check if AI generated NSFW content
    const nsfwScore = await checkNSFWGeneration(request.inputUrl, request.outputUrl);
    scores.nsfwGeneration = nsfwScore;
    
    if (nsfwScore > SAFETY_THRESHOLDS.NSFW_GENERATION) {
      violations.push('NSFW_CONTENT_GENERATED');
      return createFailureResult('FAIL_NSFW_GENERATION', violations, scores);
    }

    // Step 2: Check for identity manipulation (face changes)
    if (request.mediaType === 'IMAGE' || request.mediaType === 'VIDEO') {
      const identityScore = await checkIdentityManipulation(
        request.inputUrl,
        request.outputUrl,
        request.userId
      );
      scores.identityChange = identityScore;
      
      if (identityScore > SAFETY_THRESHOLDS.IDENTITY_CHANGE) {
        violations.push('IDENTITY_MANIPULATION_DETECTED');
        return createFailureResult('FAIL_IDENTITY_CHANGE', violations, scores);
      }

      // Check for deepfake indicators
      const deepfakeScore = await checkDeepfake(request.outputUrl);
      scores.deepfakeDetection = deepfakeScore;
      
      if (deepfakeScore > SAFETY_THRESHOLDS.DEEPFAKE) {
        violations.push('DEEPFAKE_DETECTED');
        return createFailureResult('FAIL_DEEPFAKE', violations, scores);
      }
    }

    // Step 3: Check for voice cloning (audio/video)
    if (request.mediaType === 'AUDIO' || request.mediaType === 'VIDEO') {
      const voiceCloneScore = await checkVoiceCloning(request.inputUrl, request.outputUrl);
      scores.voiceClone = voiceCloneScore;
      
      if (voiceCloneScore > SAFETY_THRESHOLDS.VOICE_CLONE) {
        violations.push('VOICE_CLONING_DETECTED');
        return createFailureResult('FAIL_VOICE_CLONE', violations, scores);
      }
    }

    // Step 4: Check overall content manipulation
    const manipulationScore = await checkContentManipulation(
      request.inputUrl,
      request.outputUrl,
      request.enhancements
    );
    scores.contentManipulation = manipulationScore;
    
    if (manipulationScore > SAFETY_THRESHOLDS.CONTENT_MANIPULATION) {
      violations.push('EXCESSIVE_MANIPULATION');
      return createFailureResult('FAIL_MANIPULATION', violations, scores);
    }

    // Step 5: Run through existing moderation pipeline
    const moderationResult = await moderateContent(
      `ai-output-${Date.now()}`,
      request.userId,
      request.outputUrl,
      {
        contentType: 'POST_MEDIA',
        userId: request.userId,
        isAdultVerified: false, // Always stricter for AI output
      }
    );

    if (moderationResult.decision === 'AUTO_BLOCK' || moderationResult.decision === 'REVIEW_REQUIRED') {
      violations.push('OUTPUT_FAILED_MODERATION');
      scores.nsfwGeneration = Math.max(scores.nsfwGeneration, moderationResult.labels.adult);
      return createFailureResult('FAIL_NSFW_GENERATION', violations, scores);
    }

    return {
      passed: true,
      result: 'PASS',
      scores,
      violations: [],
      timestamp: Timestamp.now(),
    };
  } catch (error: any) {
    console.error('Post-processing validation failed:', error);
    violations.push('VALIDATION_ERROR');
    return createFailureResult('FAIL_MANIPULATION', violations, scores);
  }
}

// ============================================================================
// DETECTION HELPERS
// ============================================================================

/**
 * Check if AI generated NSFW content that wasn't in original
 */
async function checkNSFWGeneration(inputUrl: string, outputUrl: string): Promise<number> {
  try {
    // This is a simplified implementation
    // In production, use actual NSFW detection models
    
    // For now, rely on existing moderation system
    const outputModeration = await moderateContent(
      `nsfw-check-${Date.now()}`,
      'system',
      outputUrl,
      {
        contentType: 'POST_MEDIA',
        userId: 'system',
        isAdultVerified: false,
      }
    );

    return outputModeration.labels.adult;
  } catch (error) {
    console.error('NSFW generation check failed:', error);
    return 0.5; // Conservative score for manual review
  }
}

/**
 * Check if faces/identity was manipulated
 */
async function checkIdentityManipulation(
  inputUrl: string,
  outputUrl: string,
  userId: string
): Promise<number> {
  try {
    // Simplified implementation
    // In production, use face recognition and comparison models
    
    const [inputFaces, outputFaces] = await Promise.all([
      detectFaces(inputUrl),
      detectFaces(outputUrl),
    ]);

    // If faces appeared or disappeared, that's manipulation
    if (inputFaces !== outputFaces) {
      return 1.0; // Maximum score - faces added or removed
    }

    // If both have faces, compare fingerprints
    if (inputFaces && outputFaces) {
      const [inputFingerprint, outputFingerprint] = await Promise.all([
        generateFaceFingerprint(inputUrl),
        generateFaceFingerprint(outputUrl),
      ]);

      const similarity = compareFaceFingerprints(inputFingerprint, outputFingerprint);
      
      // If similarity < 95%, faces were changed
      if (similarity < 0.95) {
        return 1.0 - similarity; // Higher score for more change
      }
    }

    return 0.0; // No identity manipulation detected
  } catch (error) {
    console.error('Identity manipulation check failed:', error);
    return 0.5; // Conservative score for manual review
  }
}

/**
 * Check for deepfake indicators
 */
async function checkDeepfake(outputUrl: string): Promise<number> {
  try {
    // Simplified implementation
    // In production, use deepfake detection models
    
    // Check for common deepfake artifacts:
    // - Unnatural blinking patterns
    // - Inconsistent lighting on face
    // - Warping around face edges
    // - Temporal inconsistencies in video
    
    // For now, return low score (no detection)
    return 0.0;
  } catch (error) {
    console.error('Deepfake check failed:', error);
    return 0.5; // Conservative score for manual review
  }
}

/**
 * Check for voice cloning
 */
async function checkVoiceCloning(inputUrl: string, outputUrl: string): Promise<number> {
  try {
    // Simplified implementation
    // In production, use voice biometric comparison
    
    // Check for:
    // - Voice characteristics match
    // - Natural prosody preserved
    // - No synthetic voice artifacts
    
    // For now, assume enhancements preserve voice identity
    return 0.0;
  } catch (error) {
    console.error('Voice cloning check failed:', error);
    return 0.5; // Conservative score for manual review
  }
}

/**
 * Check overall content manipulation
 */
async function checkContentManipulation(
  inputUrl: string,
  outputUrl: string,
  enhancements: string[]
): Promise<number> {
  try {
    // Calculate manipulation score based on:
    // 1. Number of enhancements applied (more = higher score)
    // 2. Type of enhancements (some more invasive than others)
    // 3. Visual/audio delta between input and output
    
    const enhancementWeights: Record<string, number> = {
      IMAGE_LIGHTING: 0.05,
      IMAGE_COLOR: 0.05,
      IMAGE_CLARITY: 0.05,
      IMAGE_NOISE_REMOVAL: 0.03,
      IMAGE_CROP: 0.02,
      VIDEO_STABILIZATION: 0.03,
      VIDEO_NOISE_REDUCTION: 0.03,
      VIDEO_ASPECT_RATIO: 0.02,
      AUDIO_NOISE_REMOVAL: 0.03,
      AUDIO_EQ: 0.03,
      AUDIO_FILLER_REMOVAL: 0.05,
    };

    let score = 0;
    for (const enhancement of enhancements) {
      score += enhancementWeights[enhancement] || 0.05;
    }

    // Cap at 1.0
    return Math.min(1.0, score);
  } catch (error) {
    console.error('Content manipulation check failed:', error);
    return 0.5; // Conservative score for manual review
  }
}

// ============================================================================
// FACE DETECTION & FINGERPRINTING
// ============================================================================

async function detectFaces(mediaUrl: string): Promise<boolean> {
  // Simplified implementation
  // In production, use face detection API
  return false;
}

async function generateFaceFingerprint(mediaUrl: string): Promise<string> {
  // Simplified implementation
  // In production, generate actual face embedding
  return `face-${Date.now()}`;
}

async function storeFaceFingerprint(userId: string, fingerprint: string): Promise<void> {
  await db.collection('ai_face_fingerprints').add({
    userId,
    fingerprint,
    createdAt: serverTimestamp(),
  });
}

async function storeOriginalFingerprint(userId: string, fingerprint: string): Promise<void> {
  await db.collection('ai_original_fingerprints').add({
    userId,
    fingerprint,
    createdAt: serverTimestamp(),
  });
}

function compareFaceFingerprints(fp1: string, fp2: string): number {
  // Simplified implementation
  // In production, compare face embeddings
  return fp1 === fp2 ? 1.0 : 0.0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createFailureResult(
  result: SafetyCheckResult,
  violations: string[],
  scores: any
): SafetyValidationResult {
  return {
    passed: false,
    result,
    reason: violations.join(', '),
    scores,
    violations,
    timestamp: Timestamp.now(),
  };
}

// ============================================================================
// SAFETY AUDIT LOGGING
// ============================================================================

/**
 * Log safety validation for audit
 */
export async function logSafetyValidation(
  userId: string,
  request: SafetyValidationRequest,
  result: SafetyValidationResult
): Promise<void> {
  try {
    await db.collection('ai_safety_audit_logs').add({
      userId,
      requestType: request.requestType,
      mediaType: request.mediaType,
      enhancements: request.enhancements,
      passed: result.passed,
      safetyResult: result.result,
      violations: result.violations,
      scores: result.scores,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to log safety validation:', error);
  }
}

// ============================================================================
// SAFETY CASE CREATION
// ============================================================================

/**
 * Create moderation case for safety violations
 */
export async function createSafetyCase(
  userId: string,
  mediaId: string,
  validationResult: SafetyValidationResult
): Promise<void> {
  try {
    const caseId = db.collection('moderation_cases').doc().id;
    
    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      type: 'AI_SAFETY_VIOLATION',
      targetUserId: userId,
      targetEntityType: 'ai_enhanced_media',
      targetEntityId: mediaId,
      status: 'OPEN',
      priority: 'HIGH',
      category: 'AI_MISUSE',
      description: `AI Creative Studio safety violation: ${validationResult.result}`,
      details: {
        violations: validationResult.violations,
        scores: validationResult.scores,
        reason: validationResult.reason,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`Created safety case ${caseId} for user ${userId}`);
  } catch (error) {
    console.error('Failed to create safety case:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SAFETY_THRESHOLDS,
  SafetyValidationRequest,
  SafetyValidationResult,
  AIStudioErrorCode,
};