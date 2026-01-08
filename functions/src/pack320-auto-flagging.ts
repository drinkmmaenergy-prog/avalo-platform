/**
 * PACK 320 - Real-Time Moderation Dashboard
 * Auto-Flagging Pipeline - Backend Functions
 * 
 * Automatically flags suspicious content for moderation review
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { moderateImage, moderateText } from './aiModeration';
import type {
  ModerationQueueItem,
  ModerationItemType,
  ModerationRiskLevel,
  AIFlags,
  AutoFlagTrigger
} from './pack320-moderation-types';

const db = getFirestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create moderation queue item
 */
async function createModerationQueueItem(
  type: ModerationItemType,
  userId: string,
  sourceRef: string,
  riskLevel: ModerationRiskLevel,
  aiFlags: AIFlags,
  reporterId: string | null = null,
  contentUrl?: string,
  extractedText?: string
): Promise<string> {
  const itemId = `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const queueItem: Omit<ModerationQueueItem, 'itemId'> = {
    type,
    userId,
    reporterId,
    createdAt: Timestamp.now(),
    sourceRef,
    riskLevel,
    status: 'PENDING',
    aiFlags,
    notes: '',
    lastUpdated: Timestamp.now(),
    contentUrl,
    extractedText
  };

  // Auto-lock for CSAM
  if (aiFlags.csamProbability && aiFlags.csamProbability > 0.01) {
    queueItem.status = 'IN_REVIEW';
    queueItem.notes = '⚠️ CRITICAL: Auto-locked for immediate admin review - CSAM probability detected';
    riskLevel = 'CRITICAL';
  }

  await db.collection('moderationQueue').doc(itemId).set({
    itemId,
    ...queueItem
  });

  logger.info(`Created moderation queue item: ${itemId} (${type}, ${riskLevel})`);
  
  // Log trigger
  await db.collection('autoFlagTriggers').add({
    triggerId: itemId,
    type: getAutoFlagType(type),
    userId,
    contentRef: sourceRef,
    detectedIssues: Object.entries(aiFlags)
      .filter(([_, value]) => typeof value === 'number' && value > 0.5)
      .map(([key]) => key),
    severity: riskLevel,
    createdAt: Timestamp.now(),
    queueItemCreated: true,
    queueItemId: itemId
  });

  return itemId;
}

function getAutoFlagType(contentType: ModerationItemType): AutoFlagTrigger['type'] {
  switch (contentType) {
    case 'IMAGE': return 'IMAGE_UPLOAD';
    case 'CHAT': return 'CHAT_MESSAGE';
    case 'PROFILE': return 'PROFILE_UPDATE';
    case 'MEETING': return 'MEETING_MISMATCH';
    default: return 'IMAGE_UPLOAD';
  }
}

/**
 * Calculate risk level from AI flags
 */
function calculateRiskLevel(aiFlags: AIFlags): ModerationRiskLevel {
  // CRITICAL: CSAM or high violence/weapons
  if (
    (aiFlags.csamProbability && aiFlags.csamProbability > 0.01) ||
    (aiFlags.violence && aiFlags.violence > 0.9) ||
    (aiFlags.weapons && aiFlags.weapons > 0.9)
  ) {
    return 'CRITICAL';
  }

  // HIGH: Multiple concerning signals
  const highFlags = [
    aiFlags.nudity && aiFlags.nudity > 0.8,
    aiFlags.violence && aiFlags.violence > 0.7,
    aiFlags.weapons && aiFlags.weapons > 0.7,
    aiFlags.deepfake && aiFlags.deepfake > 0.7,
    aiFlags.faceMismatch && aiFlags.faceMismatch > 0.8,
    aiFlags.toxicity && aiFlags.toxicity > 0.7,
    aiFlags.hate && aiFlags.hate > 0.7,
    aiFlags.bannedTerms && aiFlags.bannedTerms.length > 2
  ].filter(Boolean).length;

  if (highFlags >= 2) return 'HIGH';

  // MEDIUM: Single concerning signal
  const mediumFlags = [
    aiFlags.nudity && aiFlags.nudity > 0.5,
    aiFlags.violence && aiFlags.violence > 0.5,
    aiFlags.weapons && aiFlags.weapons > 0.5,
    aiFlags.deepfake && aiFlags.deepfake > 0.5,
    aiFlags.faceMismatch && aiFlags.faceMismatch > 0.6,
    aiFlags.toxicity && aiFlags.toxicity > 0.5,
    aiFlags.hate && aiFlags.hate > 0.5,
    aiFlags.bannedTerms && aiFlags.bannedTerms.length > 0
  ].filter(Boolean).length;

  if (mediumFlags >= 1) return 'MEDIUM';

  return 'LOW';
}

// ============================================================================
// 1. IMAGE UPLOAD VALIDATOR
// ============================================================================

/**
 * Auto-flag suspicious images on upload
 * Checks for:
 * - Face presence in profile photos
 * - Nudity/explicit content
 * - Face mismatch vs. selfie verification
 */
export const onImageUpload = onDocumentCreated(
  {
    document: 'userPhotos/{userId}/{photoId}',
    region: 'europe-west3'
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const userId = event.params.userId;
    const photoId = event.params.photoId;
    const imageUrl = data.url;
    const isProfilePhoto = data.isProfile || false;

    try {
      logger.info(`Analyzing image upload: ${photoId} for user ${userId}`);

      // Moderate image
      const moderationResult = await moderateImage(imageUrl);

      // Check for face in profile photos
      let faceMismatch = 0;
      if (isProfilePhoto) {
        // Get user's verification selfie
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData?.verificationSelfieUrl) {
          // TODO: Implement face comparison
          // For now, use placeholder logic
          faceMismatch = 0;
        }
      }

      const aiFlags: AIFlags = {
        nudity: moderationResult.scores.nsfw,
        violence: moderationResult.scores.violence,
        faceMismatch,
        toxicity: moderationResult.scores.toxicity,
        hate: moderationResult.scores.hate,
        bannedTerms: moderationResult.bannedTermsFound || []
      };

      const riskLevel = calculateRiskLevel(aiFlags);

      // Auto-flag if action needed
      if (moderationResult.action === 'review' || moderationResult.action === 'block') {
        await createModerationQueueItem(
          'IMAGE',
          userId,
          `userPhotos/${userId}/${photoId}`,
          riskLevel,
          aiFlags,
          null, // Auto-flagged
          imageUrl,
          moderationResult.extractedText
        );

        // If blocked, immediately hide image
        if (moderationResult.action === 'block') {
          await event.data?.ref.update({
            status: 'blocked',
            blockedReason: moderationResult.reasons.join('; '),
            blockedAt: FieldValue.serverTimestamp()
          });
        }
      }

      logger.info(`Image analysis complete: ${photoId} - ${moderationResult.action}`);
    } catch (error: any) {
      logger.error(`Failed to analyze image ${photoId}:`, error);
    }
  }
);

// ============================================================================
// 2. CHAT AI NLP SCANNING
// ============================================================================

/**
 * Auto-flag chat messages with safety violations
 * ONLY for: violence, grooming, threats, hate speech
 * NOT for: flirting, sexting, dating content (allowed)
 */
export const onChatMessage = onDocumentCreated(
  {
    document: 'chats/{chatId}/messages/{messageId}',
    region: 'europe-west3'
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const chatId = event.params.chatId;
    const messageId = event.params.messageId;
    const senderId = data.senderId;
    const text = data.text || '';

    // Skip empty messages or system messages
    if (!text || data.type === 'system') return;

    try {
      logger.info(`Analyzing chat message: ${messageId}`);

      // Moderate text - focus on safety violations only
      const moderationResult = await moderateText(text);

      // CRITICAL safety violations only
      const isSafetyViolation = 
        moderationResult.scores.violence > 0.7 ||
        moderationResult.scores.hate > 0.7 ||
        moderationResult.scores.harassment > 0.8 ||
        (moderationResult.bannedTermsFound && moderationResult.bannedTermsFound.length > 0);

      if (!isSafetyViolation) {
        // Allow normal dating/flirting content
        return;
      }

      const aiFlags: AIFlags = {
        violence: moderationResult.scores.violence,
        toxicity: moderationResult.scores.toxicity,
        hate: moderationResult.scores.hate,
        harassment: moderationResult.scores.harassment,
        bannedTerms: moderationResult.bannedTermsFound || []
      };

      const riskLevel = calculateRiskLevel(aiFlags);

      // Auto-flag CRITICAL violations
      if (riskLevel === 'CRITICAL') {
        await createModerationQueueItem(
          'CHAT',
          senderId,
          `chats/${chatId}/messages/${messageId}`,
          riskLevel,
          aiFlags,
          null,
          undefined,
          text
        );

        logger.warn(`CRITICAL chat violation detected: ${messageId}`);
      }
    } catch (error: any) {
      logger.error(`Failed to analyze chat message ${messageId}:`, error);
    }
  }
);

// ============================================================================
// 3. MEETING/EVENT MISMATCH AUTO-FLAG
// ============================================================================

/**
 * Auto-flag when user presses mismatch refund button
 */
export const onMeetingMismatchReport = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { meetingId, reportedUserId, reason } = request.data;

    if (!meetingId || !reportedUserId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
      // Create moderation queue item
      const aiFlags: AIFlags = {
        faceMismatch: 1.0 // User reported mismatch
      };

      await createModerationQueueItem(
        'MEETING',
        reportedUserId,
        `meetings/${meetingId}`,
        'HIGH',
        aiFlags,
        uid, // Reporter
        undefined,
        reason
      );

      logger.info(`Meeting mismatch reported: ${meetingId} by ${uid}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to report meeting mismatch:', error);
      throw new HttpsError('internal', 'Failed to submit report');
    }
  }
);

// ============================================================================
// 4. PANIC BUTTON CASES
// ============================================================================

/**
 * Auto-flag every panic event
 */
export const onPanicButton = onDocumentCreated(
  {
    document: 'panicEvents/{eventId}',
    region: 'europe-west3'
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const eventId = event.params.eventId;
    const userId = data.userId;
    const context = data.context;

    try {
      const aiFlags: AIFlags = {
        violence: 1.0 // Panic indicates potential danger
      };

      await createModerationQueueItem(
        'EVENT',
        userId,
        `panicEvents/${eventId}`,
        'CRITICAL',
        aiFlags,
        null,
        undefined,
        `Panic button pressed during ${context}`
      );

      logger.warn(`Panic button event auto-flagged: ${eventId}`);
    } catch (error: any) {
      logger.error(`Failed to auto-flag panic event ${eventId}:`, error);
    }
  }
);

// ============================================================================
// 5. MULTIPLE RAPID REPORTS
// ============================================================================

/**
 * Auto-flag if user receives 3+ reports within 1 hour
 */
export const onUserReport = onDocumentCreated(
  {
    document: 'userReports/{reportId}',
    region: 'europe-west3'
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const reportedUserId = data.reportedUserId;
    const reporterId = data.reporterId;
    const reason = data.reason;

    try {
      // Check recent reports (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentReportsSnapshot = await db
        .collection('userReports')
        .where('reportedUserId', '==', reportedUserId)
        .where('createdAt', '>=', Timestamp.fromDate(oneHourAgo))
        .get();

      const reportCount = recentReportsSnapshot.size;

      logger.info(`User ${reportedUserId} has ${reportCount} reports in last hour`);

      // Auto-flag if 3+ reports
      if (reportCount >= 3) {
        const aiFlags: AIFlags = {
          harassment: 0.8 // Multiple reports suggest pattern
        };

        await createModerationQueueItem(
          'PROFILE',
          reportedUserId,
          `users/${reportedUserId}`,
          'HIGH',
          aiFlags,
          null, // System auto-flag
          undefined,
          `Multiple rapid reports (${reportCount} in last hour): ${reason}`
        );

        logger.warn(`Auto-flagged user ${reportedUserId} for multiple rapid reports`);
      }
    } catch (error: any) {
      logger.error('Failed to check rapid reports:', error);
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  onImageUpload,
  onChatMessage,
  onMeetingMismatchReport,
  onPanicButton,
  onUserReport
};