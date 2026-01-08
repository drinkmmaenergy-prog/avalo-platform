/**
 * PACK 108 — NSFW Content Classification Pipeline
 * Automated + user-controlled + moderation fallback
 * 
 * CLASSIFICATION SOURCES:
 * 1. User marking content as NSFW
 * 2. AI model detection (image/video/text)
 * 3. Community flagging
 * 4. Trusted Moderator classification (final word)
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NSFWLevel,
  NSFWClassificationSource,
  ContentNSFWMetadata,
  NSFWClassificationCase,
  NSFWViolation,
  NSFWModerationReasonCode,
  NSFW_VIOLATION_SEVERITY,
} from './pack108-types';

// ============================================================================
// CLASSIFICATION ENGINE
// ============================================================================

/**
 * Classify content based on multiple sources
 * Priority: MODERATOR > AI > USER > DEFAULT
 */
export async function classifyContent(
  contentId: string,
  contentType: 'POST' | 'STORY' | 'MEDIA' | 'MESSAGE' | 'PROFILE_PHOTO',
  creatorId: string,
  userMarkedLevel?: NSFWLevel,
  mediaUrls?: string[]
): Promise<ContentNSFWMetadata> {
  try {
    console.log(`[PACK108] Classifying content ${contentId}`);

    // Check if content already has moderator classification (final word)
    const existingMetadata = await getContentNSFWMetadata(contentId);
    if (existingMetadata?.nsfwClassificationSource === 'MODERATOR_REVIEW') {
      console.log(`[PACK108] Content ${contentId} has moderator classification, using that`);
      return existingMetadata;
    }

    // Initialize classification
    let finalLevel: NSFWLevel = 'SAFE';
    let source: NSFWClassificationSource = 'SYSTEM_DEFAULT';
    let confidenceScore: number | undefined;
    let aiDetected: NSFWLevel | undefined;

    // Step 1: AI Detection (if media URLs provided)
    if (mediaUrls && mediaUrls.length > 0) {
      const aiResult = await detectNSFWWithAI(mediaUrls);
      aiDetected = aiResult.level;
      confidenceScore = aiResult.confidence;
      
      if (aiResult.confidence > 0.7) {
        finalLevel = aiResult.level;
        source = 'AI_DETECTION';
        console.log(`[PACK108] AI detected ${finalLevel} with confidence ${confidenceScore}`);
      }
    }

    // Step 2: User marking (override AI if user is more restrictive)
    if (userMarkedLevel) {
      const userLevelValue = getNSFWLevelValue(userMarkedLevel);
      const currentLevelValue = getNSFWLevelValue(finalLevel);
      
      if (userLevelValue > currentLevelValue) {
        finalLevel = userMarkedLevel;
        source = 'USER_MARKED';
        console.log(`[PACK108] User marked as ${finalLevel}`);
      }
    }

    // Step 3: Check for disagreement between AI and user
    if (aiDetected && userMarkedLevel && aiDetected !== userMarkedLevel) {
      const disagreementSignificant = Math.abs(
        getNSFWLevelValue(aiDetected) - getNSFWLevelValue(userMarkedLevel)
      ) >= 2;

      if (disagreementSignificant && confidenceScore && confidenceScore > 0.6) {
        // Create classification case for human review
        await createClassificationCase(
          contentId,
          contentType,
          creatorId,
          userMarkedLevel,
          aiDetected,
          confidenceScore
        );
        console.log(`[PACK108] Created classification case for review`);
      }
    }

    // Create metadata
    const metadata: ContentNSFWMetadata = {
      nsfwLevel: finalLevel,
      nsfwLastReviewer: source === 'AI_DETECTION' ? 'AI' : source === 'USER_MARKED' ? creatorId : 'SYSTEM',
      nsfwLastReviewedAt: serverTimestamp() as Timestamp,
      nsfwClassificationSource: source,
      nsfwConfidenceScore: confidenceScore,
      userMarkedNSFW: userMarkedLevel !== undefined,
      aiDetectedNSFW: aiDetected,
    };

    // Store metadata
    await saveContentNSFWMetadata(contentId, metadata);

    console.log(`[PACK108] Content ${contentId} classified as ${finalLevel}`);
    return metadata;
  } catch (error) {
    console.error(`[PACK108] Error classifying content ${contentId}:`, error);
    
    // Default to SAFE on error (fail-safe)
    const fallbackMetadata: ContentNSFWMetadata = {
      nsfwLevel: 'SAFE',
      nsfwLastReviewer: 'SYSTEM',
      nsfwLastReviewedAt: serverTimestamp() as Timestamp,
      nsfwClassificationSource: 'SYSTEM_DEFAULT',
    };
    
    return fallbackMetadata;
  }
}

/**
 * Reclassify content with moderator override (final word)
 */
export async function moderatorClassifyContent(
  contentId: string,
  moderatorId: string,
  newLevel: NSFWLevel,
  reviewNotes?: string
): Promise<ContentNSFWMetadata> {
  try {
    console.log(`[PACK108] Moderator ${moderatorId} classifying content ${contentId} as ${newLevel}`);

    const metadata: ContentNSFWMetadata = {
      nsfwLevel: newLevel,
      nsfwLastReviewer: moderatorId,
      nsfwLastReviewedAt: serverTimestamp() as Timestamp,
      nsfwClassificationSource: 'MODERATOR_REVIEW',
    };

    await saveContentNSFWMetadata(contentId, metadata);

    // Close any open classification cases for this content
    await closeClassificationCasesForContent(contentId, moderatorId, newLevel, reviewNotes);

    console.log(`[PACK108] Moderator classification complete for ${contentId}`);
    return metadata;
  } catch (error) {
    console.error(`[PACK108] Error in moderator classification:`, error);
    throw error;
  }
}

/**
 * Community flag for NSFW content
 */
export async function communityFlagNSFW(
  contentId: string,
  flaggedBy: string,
  suggestedLevel: NSFWLevel,
  reason: string
): Promise<void> {
  try {
    console.log(`[PACK108] Community flag for ${contentId} by ${flaggedBy}`);

    // Get current metadata
    const metadata = await getContentNSFWMetadata(contentId);
    
    if (!metadata) {
      console.log(`[PACK108] Content ${contentId} not found`);
      return;
    }

    // Count flags for this content
    const flagsSnapshot = await db
      .collection('content_nsfw_flags')
      .where('contentId', '==', contentId)
      .where('status', '==', 'ACTIVE')
      .get();

    const flagCount = flagsSnapshot.size;

    // Create flag record
    await db.collection('content_nsfw_flags').add({
      contentId,
      flaggedBy,
      suggestedLevel,
      reason,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
    });

    // If enough flags, escalate to moderation case
    if (flagCount >= 3 && metadata.nsfwClassificationSource !== 'MODERATOR_REVIEW') {
      await createModerationCaseForNSFW(contentId, 'NSFW_UNMARKED', 'Community flags suggest misclassification');
      console.log(`[PACK108] Escalated to moderation case due to flag threshold`);
    }

  } catch (error) {
    console.error(`[PACK108] Error processing community flag:`, error);
  }
}

// ============================================================================
// AI DETECTION (PLACEHOLDER FOR ACTUAL AI SERVICE)
// ============================================================================

/**
 * Detect NSFW content using AI model
 * NOTE: This is a placeholder. In production, integrate with actual AI service
 * (e.g., Google Cloud Vision, AWS Rekognition, or custom model)
 */
async function detectNSFWWithAI(
  mediaUrls: string[]
): Promise<{ level: NSFWLevel; confidence: number }> {
  try {
    // TODO: Integrate with actual AI service
    // For now, return placeholder results
    
    // Example integration points:
    // - Google Cloud Vision API (SafeSearch detection)
    // - AWS Rekognition (Content Moderation)
    // - Custom TensorFlow/PyTorch model
    // - Third-party services like Clarifai, Hive Moderation
    
    console.log(`[PACK108] AI detection for ${mediaUrls.length} media items (placeholder)`);
    
    // Placeholder: Return SAFE with low confidence
    // In production, this would call the actual AI service
    return {
      level: 'SAFE',
      confidence: 0.5,
    };
  } catch (error) {
    console.error(`[PACK108] AI detection error:`, error);
    return {
      level: 'SAFE',
      confidence: 0.0,
    };
  }
}

// ============================================================================
// CLASSIFICATION CASE MANAGEMENT
// ============================================================================

/**
 * Create classification case when AI and user disagree
 */
async function createClassificationCase(
  contentId: string,
  contentType: 'POST' | 'STORY' | 'MEDIA' | 'MESSAGE' | 'PROFILE_PHOTO',
  creatorId: string,
  userMarked: NSFWLevel,
  aiDetected: NSFWLevel,
  confidenceScore: number
): Promise<string> {
  try {
    const caseId = generateId();
    
    const classificationCase: NSFWClassificationCase = {
      caseId,
      contentId,
      contentType,
      creatorId,
      userMarked,
      aiDetected,
      confidenceScore,
      status: 'OPEN',
      priority: determineCasePriority(userMarked, aiDetected, confidenceScore),
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('nsfw_classification_cases').doc(caseId).set(classificationCase);
    
    console.log(`[PACK108] Created classification case ${caseId} for content ${contentId}`);
    return caseId;
  } catch (error) {
    console.error(`[PACK108] Error creating classification case:`, error);
    throw error;
  }
}

/**
 * Determine case priority based on disagreement severity
 */
function determineCasePriority(
  userMarked: NSFWLevel,
  aiDetected: NSFWLevel,
  confidence: number
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const disagreementLevel = Math.abs(
    getNSFWLevelValue(userMarked) - getNSFWLevelValue(aiDetected)
  );

  // High confidence AI detection disagreeing with user = HIGH priority
  if (confidence > 0.85 && disagreementLevel >= 2) {
    return 'HIGH';
  }

  // Moderate disagreement = MEDIUM priority
  if (disagreementLevel >= 2) {
    return 'MEDIUM';
  }

  // Minor disagreement = LOW priority
  return 'LOW';
}

/**
 * Close classification cases for content
 */
async function closeClassificationCasesForContent(
  contentId: string,
  moderatorId: string,
  finalClassification: NSFWLevel,
  reviewNotes?: string
): Promise<void> {
  try {
    const casesSnapshot = await db
      .collection('nsfw_classification_cases')
      .where('contentId', '==', contentId)
      .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
      .get();

    const batch = db.batch();

    casesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'RESOLVED',
        finalClassification,
        reviewedBy: moderatorId,
        reviewedAt: serverTimestamp(),
        reviewNotes: reviewNotes || 'Moderator review',
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`[PACK108] Closed ${casesSnapshot.size} classification cases for ${contentId}`);
  } catch (error) {
    console.error(`[PACK108] Error closing classification cases:`, error);
  }
}

// ============================================================================
// VIOLATION DETECTION & ENFORCEMENT
// ============================================================================

/**
 * Detect NSFW violations
 */
export async function detectNSFWViolation(
  userId: string,
  contentId: string,
  reasonCode: NSFWModerationReasonCode,
  description: string,
  detectedBy: 'SYSTEM' | 'USER_REPORT' | 'MODERATOR'
): Promise<string> {
  try {
    const violationId = generateId();
    
    const violation: NSFWViolation = {
      violationId,
      userId,
      contentId,
      reasonCode,
      severity: NSFW_VIOLATION_SEVERITY[reasonCode],
      description,
      detectedBy,
      status: 'DETECTED',
      detectedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('nsfw_violations').doc(violationId).set(violation);

    // Auto-escalate critical violations
    if (violation.severity === 'CRITICAL') {
      await createModerationCaseForNSFW(contentId, reasonCode, description);
    }

    console.log(`[PACK108] NSFW violation ${violationId} detected for user ${userId}`);
    return violationId;
  } catch (error) {
    console.error(`[PACK108] Error detecting violation:`, error);
    throw error;
  }
}

/**
 * Create moderation case for NSFW violation
 */
async function createModerationCaseForNSFW(
  contentId: string,
  reasonCode: NSFWModerationReasonCode,
  description: string
): Promise<string> {
  try {
    // Get content info
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (!contentDoc.exists) {
      throw new Error(`Content ${contentId} not found`);
    }

    const contentData = contentDoc.data();
    const userId = contentData?.userId || contentData?.creatorId;

    if (!userId) {
      throw new Error(`Cannot determine user for content ${contentId}`);
    }

    // Create moderation case using PACK 103 types
    const caseId = generateId();
    
    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      subjectUserId: userId,
      status: 'OPEN',
      priority: NSFW_VIOLATION_SEVERITY[reasonCode] === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      openedAt: serverTimestamp(),
      openedBy: 'AUTO',
      reasonCodes: [reasonCode],
      description,
      history: [{
        timestamp: serverTimestamp(),
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        action: 'CASE_OPENED',
        details: `NSFW violation: ${reasonCode}`,
      }],
      relatedReports: [],
      relatedContent: [contentId],
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] Created moderation case ${caseId} for NSFW violation`);
    return caseId;
  } catch (error) {
    console.error(`[PACK108] Error creating moderation case:`, error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get numeric value for NSFW level (for comparison)
 */
function getNSFWLevelValue(level: NSFWLevel): number {
  const values: Record<NSFWLevel, number> = {
    'SAFE': 0,
    'SOFT_NSFW': 1,
    'NSFW_EXPLICIT': 2,
    'BANNED': 3,
  };
  return values[level];
}

/**
 * Get content NSFW metadata
 */
async function getContentNSFWMetadata(contentId: string): Promise<ContentNSFWMetadata | null> {
  try {
    const doc = await db.collection('content').doc(contentId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data?.nsfwLevel) {
      return null;
    }

    return {
      nsfwLevel: data.nsfwLevel,
      nsfwLastReviewer: data.nsfwLastReviewer,
      nsfwLastReviewedAt: data.nsfwLastReviewedAt,
      nsfwClassificationSource: data.nsfwClassificationSource,
      nsfwConfidenceScore: data.nsfwConfidenceScore,
      nsfwFlags: data.nsfwFlags,
      userMarkedNSFW: data.userMarkedNSFW,
      aiDetectedNSFW: data.aiDetectedNSFW,
    };
  } catch (error) {
    console.error(`[PACK108] Error getting content metadata:`, error);
    return null;
  }
}

/**
 * Save content NSFW metadata
 */
async function saveContentNSFWMetadata(
  contentId: string,
  metadata: ContentNSFWMetadata
): Promise<void> {
  try {
    await db.collection('content').doc(contentId).update(metadata as any);
  } catch (error) {
    console.error(`[PACK108] Error saving content metadata:`, error);
    throw error;
  }
}

/**
 * Batch reclassify content (for region policy changes)
 */
export async function batchReclassifyContent(
  contentIds: string[],
  reason: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const contentId of contentIds) {
    try {
      // Get content
      const contentDoc = await db.collection('content').doc(contentId).get();
      if (!contentDoc.exists) {
        failed++;
        continue;
      }

      const data = contentDoc.data();
      
      // Reclassify
      await classifyContent(
        contentId,
        data?.type || 'POST',
        data?.userId || data?.creatorId,
        data?.userMarkedNSFW,
        data?.mediaUrls
      );

      success++;
    } catch (error) {
      console.error(`[PACK108] Error reclassifying ${contentId}:`, error);
      failed++;
    }
  }

  console.log(`[PACK108] Batch reclassification complete: ${success} success, ${failed} failed`);
  return { success, failed };
}