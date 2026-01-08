/**
 * PACK 146 — Copyright Takedown & Case Management
 * Instant takedown system with AI validation
 * 
 * Features:
 * - Creator copyright claims
 * - AI similarity scanning
 * - Human validation workflow
 * - Instant content removal
 * - Offender tracking and enforcement
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { logger, HttpsError, onCall } from './common';
import { 
  CopyrightCase, 
  CopyrightClaimStatus,
  CopyrightClaimPriority,
  CopyrightNotification 
} from './pack146-types';
import { scanForDuplicateContent } from './pack146-hashing';

// ============================================================================
// COPYRIGHT CLAIM FILING
// ============================================================================

/**
 * File copyright infringement claim
 */
export const fileCopyrightClaim = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const {
      originalContentId,
      infringingContentId,
      claimType,
      description,
      evidenceUrls,
    } = request.data;
    
    if (!originalContentId || !infringingContentId) {
      throw new HttpsError('invalid-argument', 'Original and infringing content IDs required');
    }
    
    try {
      // Verify claimant owns original content
      const originalContent = await db.collection('media').doc(originalContentId).get();
      if (!originalContent.exists) {
        throw new HttpsError('not-found', 'Original content not found');
      }
      
      if (originalContent.data()?.userId !== uid) {
        throw new HttpsError('permission-denied', 'You do not own this content');
      }
      
      // Get infringing content
      const infringingContent = await db.collection('media').doc(infringingContentId).get();
      if (!infringingContent.exists) {
        throw new HttpsError('not-found', 'Infringing content not found');
      }
      
      const allegedInfringerId = infringingContent.data()?.userId;
      
      if (allegedInfringerId === uid) {
        throw new HttpsError('invalid-argument', 'Cannot claim your own content');
      }
      
      // Create case
      const caseId = generateId();
      const copyrightCase = await createCopyrightCase({
        caseId,
        claimantId: uid,
        originalContentId,
        allegedInfringerId,
        infringingContentId,
        claimType: claimType || 'UNAUTHORIZED_UPLOAD',
        claimDescription: description || '',
        evidenceUrls: evidenceUrls || [],
        detectedBy: 'CREATOR_REPORT',
      });
      
      // Run AI similarity scan
      await runAISimilarityScan(caseId);
      
      logger.info(`Copyright claim filed: ${caseId}`);
      
      return {
        success: true,
        caseId,
        status: copyrightCase.status,
      };
    } catch (error: any) {
      logger.error('Copyright claim filing failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Create copyright case
 */
async function createCopyrightCase(input: {
  caseId: string;
  claimantId: string;
  originalContentId: string;
  allegedInfringerId: string;
  infringingContentId: string;
  claimType: string;
  claimDescription: string;
  evidenceUrls: string[];
  detectedBy: 'CREATOR_REPORT' | 'AUTO_SCAN' | 'COMMUNITY_FLAG';
  detectionConfidence?: number;
}): Promise<CopyrightCase> {
  
  // Get content hashes
  const originalHash = await getContentHashString(input.originalContentId);
  const infringingHash = await getContentHashString(input.infringingContentId);
  
  // Determine priority based on content type
  const priority = await determineCasePriority(
    input.originalContentId,
    input.infringingContentId,
    input.claimType
  );
  
  const copyrightCase: any = {
    caseId: input.caseId,
    claimantId: input.claimantId,
    originalContentId: input.originalContentId,
    originalContentHash: originalHash,
    allegedInfringerId: input.allegedInfringerId,
    infringingContentId: input.infringingContentId,
    infringingContentHash: infringingHash,
    claimType: input.claimType,
    claimDescription: input.claimDescription,
    evidenceUrls: input.evidenceUrls,
    detectedBy: input.detectedBy,
    detectionConfidence: input.detectionConfidence || 0,
    status: 'SUBMITTED' as CopyrightClaimStatus,
    priority,
    signals: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  await db.collection('copyright_cases').doc(input.caseId).set(copyrightCase);
  
  // Notify claimant
  await sendCopyrightNotification(input.claimantId, {
    type: 'INFRINGEMENT_DETECTED',
    userId: input.claimantId,
    caseId: input.caseId,
    title: 'Copyright Claim Submitted',
    message: 'Your copyright claim is being reviewed.',
    actionUrl: `/copyright/case/${input.caseId}`,
    createdAt: serverTimestamp() as any,
  });
  
  return copyrightCase as CopyrightCase;
}

/**
 * Get content hash string
 */
async function getContentHashString(contentId: string): Promise<string> {
  const hashSnapshot = await db.collection('content_hash_registry')
    .where('contentId', '==', contentId)
    .limit(1)
    .get();
  
  if (hashSnapshot.empty) {
    return '';
  }
  
  return hashSnapshot.docs[0].data().hashes.exact;
}

/**
 * Determine case priority
 */
async function determineCasePriority(
  originalContentId: string,
  infringingContentId: string,
  claimType: string
): Promise<CopyrightClaimPriority> {
  
  // Check if content is NSFW (zero tolerance)
  const originalContent = await db.collection('media').doc(originalContentId).get();
  const isNSFW = originalContent.data()?.nsfwLevel && 
                 originalContent.data()?.nsfwLevel !== 'SAFE';
  
  if (isNSFW) {
    return 'CRITICAL';
  }
  
  // Check claim type
  if (claimType === 'EXTERNAL_LEAK' || claimType === 'RESALE') {
    return 'HIGH';
  }
  
  if (claimType === 'SCREEN_RECORDING') {
    return 'MEDIUM';
  }
  
  return 'MEDIUM';
}

// ============================================================================
// AI SIMILARITY SCANNING
// ============================================================================

/**
 * Run AI similarity scan
 */
async function runAISimilarityScan(caseId: string): Promise<void> {
  try {
    const caseDoc = await db.collection('copyright_cases').doc(caseId).get();
    if (!caseDoc.exists) {
      return;
    }
    
    const copyrightCase = caseDoc.data() as CopyrightCase;
    
    // Update status to scanning
    await caseDoc.ref.update({
      status: 'AI_SCANNING',
      updatedAt: serverTimestamp(),
    });
    
    // Get content for comparison
    const originalContent = await db.collection('media').doc(copyrightCase.originalContentId).get();
    const infringingContent = await db.collection('media').doc(copyrightCase.infringingContentId).get();
    
    if (!originalContent.exists || !infringingContent.exists) {
      throw new Error('Content not found');
    }
    
    // Run duplicate detection
    const duplicateResult = await scanForDuplicateContent(
      infringingContent.data()?.url || '',
      infringingContent.data()?.type || 'IMAGE',
      copyrightCase.allegedInfringerId
    );
    
    // Analyze results
    const aiAnalysis = {
      matchScore: duplicateResult.confidence,
      matchType: duplicateResult.matchType,
      modificationsDetected: duplicateResult.modificationsDetected,
      aiConfidenceLevel: duplicateResult.confidence,
      analyzedAt: serverTimestamp(),
    };
    
    // Update case with AI analysis
    await caseDoc.ref.update({
      aiAnalysis,
      status: determineNextStatus(duplicateResult.confidence),
      updatedAt: serverTimestamp(),
    });
    
    // If high confidence, proceed to takedown
    if (duplicateResult.confidence >= 0.95) {
      await processTakedown(caseId, 'AUTO_APPROVED');
    } else {
      // Require human review
      await caseDoc.ref.update({
        status: 'HUMAN_VALIDATION',
        updatedAt: serverTimestamp(),
      });
    }
    
    logger.info(`AI scan completed for case ${caseId}: confidence ${duplicateResult.confidence}`);
  } catch (error) {
    logger.error(`AI scan failed for case ${caseId}:`, error);
    
    // Update case with error
    await db.collection('copyright_cases').doc(caseId).update({
      status: 'HUMAN_VALIDATION',
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Determine next status based on confidence
 */
function determineNextStatus(confidence: number): CopyrightClaimStatus {
  if (confidence >= 0.95) {
    return 'APPROVED';
  } else if (confidence >= 0.7) {
    return 'HUMAN_VALIDATION';
  } else {
    return 'UNDER_REVIEW';
  }
}

// ============================================================================
// TAKEDOWN PROCESSING
// ============================================================================

/**
 * Process copyright takedown
 */
async function processTakedown(
  caseId: string,
  approvedBy: 'AUTO_APPROVED' | string
): Promise<void> {
  
  const caseDoc = await db.collection('copyright_cases').doc(caseId).get();
  if (!caseDoc.exists) {
    return;
  }
  
  const copyrightCase = caseDoc.data() as CopyrightCase;
  
  try {
    // Remove infringing content
    await db.collection('media').doc(copyrightCase.infringingContentId).update({
      moderationStatus: 'rejected',
      removalReason: 'COPYRIGHT_INFRINGEMENT',
      removedAt: serverTimestamp(),
      copyrightCaseId: caseId,
    });
    
    // Apply penalty to offender
    await applyAntiPiracyPenalty(
      copyrightCase.allegedInfringerId,
      caseId,
      copyrightCase.originalContentId
    );
    
    // Update case resolution
    await caseDoc.ref.update({
      status: 'CONTENT_REMOVED',
      resolution: {
        outcome: 'CONTENT_REMOVED',
        resolvedAt: serverTimestamp(),
        resolvedBy: approvedBy,
        actionsTaken: ['CONTENT_REMOVED', 'PENALTY_APPLIED'],
      },
      updatedAt: serverTimestamp(),
    });
    
    // Notify claimant of successful takedown
    await sendCopyrightNotification(copyrightCase.claimantId, {
      type: 'TAKEDOWN_APPROVED',
      userId: copyrightCase.claimantId,
      caseId,
      contentId: copyrightCase.infringingContentId,
      title: 'Takedown Successful',
      message: 'The infringing content has been removed.',
      createdAt: serverTimestamp() as any,
    });
    
    // Notify offender
    await sendCopyrightNotification(copyrightCase.allegedInfringerId, {
      type: 'CONTENT_REMOVED',
      userId: copyrightCase.allegedInfringerId,
      caseId,
      contentId: copyrightCase.infringingContentId,
      title: 'Content Removed',
      message: 'Your content was removed due to copyright infringement.',
      actionUrl: `/copyright/case/${caseId}`,
      createdAt: serverTimestamp() as any,
    });
    
    logger.info(`Takedown processed for case ${caseId}`);
  } catch (error) {
    logger.error(`Takedown failed for case ${caseId}:`, error);
    throw error;
  }
}

/**
 * Apply anti-piracy penalty
 */
export async function applyAntiPiracyPenalty(
  userId: string,
  caseId: string,
  contentId: string
): Promise<void> {
  
  // Check if content is NSFW (zero tolerance)
  const content = await db.collection('media').doc(contentId).get();
  const isNSFW = content.exists && 
                 content.data()?.nsfwLevel && 
                 content.data()?.nsfwLevel !== 'SAFE';
  
  // Get violation count
  const violationSnapshot = await db.collection('piracy_watchlist')
    .where('userId', '==', userId)
    .limit(1)
    .get();
  
  const violationCount = violationSnapshot.empty 
    ? 0 
    : (violationSnapshot.docs[0].data().totalViolations || 0);
  
  // Determine penalty severity
  let penaltyAction: 'WARNING' | 'ACCOUNT_SUSPENSION' | 'PERMANENT_BAN';
  
  if (isNSFW) {
    // Zero tolerance for stolen NSFW
    penaltyAction = 'PERMANENT_BAN';
  } else if (violationCount >= 3) {
    penaltyAction = 'PERMANENT_BAN';
  } else if (violationCount >= 1) {
    penaltyAction = 'ACCOUNT_SUSPENSION';
  } else {
    penaltyAction = 'WARNING';
  }
  
  // Log piracy attempt
  await logPiracyAttempt(userId, {
    type: 'REPEAT_UPLOADER',
    contentId,
    copyrightCaseId: caseId,
    isNSFW,
  });
  
  // Apply enforcement action
  if (penaltyAction === 'PERMANENT_BAN') {
    await db.collection('users').doc(userId).update({
      accountStatus: 'BANNED',
      banReason: 'COPYRIGHT_INFRINGEMENT',
      bannedAt: serverTimestamp(),
      copyrightCaseId: caseId,
    });
    
    logger.warn(`User ${userId} permanently banned for copyright infringement`);
  } else if (penaltyAction === 'ACCOUNT_SUSPENSION') {
    await db.collection('users').doc(userId).update({
      accountStatus: 'SUSPENDED',
      suspensionReason: 'COPYRIGHT_INFRINGEMENT',
      suspendedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      suspendedAt: serverTimestamp(),
      copyrightCaseId: caseId,
    });
    
    logger.warn(`User ${userId} suspended for copyright infringement`);
  } else {
    // Warning only
    await db.collection('users').doc(userId).update({
      'warnings.copyrightInfringement': increment(1),
      lastWarningAt: serverTimestamp(),
    });
    
    logger.info(`User ${userId} received copyright warning`);
  }
  
  // Update reputation (PACK 140 integration)
  try {
    const reputationRef = db.collection('user_reputation').doc(userId);
    await reputationRef.update({
      copyrightViolations: increment(1),
      reputationScore: increment(-20),
      lastViolationAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error('Failed to update reputation:', error);
  }
}

/**
 * Log piracy attempt
 */
export async function logPiracyAttempt(
  userId: string,
  details: {
    type: string;
    contentId: string;
    copyrightCaseId: string;
    isNSFW: boolean;
  }
): Promise<void> {
  
  const attemptId = generateId();
  
  await db.collection('piracy_attempts').doc(attemptId).set({
    attemptId,
    userId,
    type: details.type,
    contentId: details.contentId,
    copyrightCaseId: details.copyrightCaseId,
    isNSFW: details.isNSFW,
    detectedAt: serverTimestamp(),
  });
  
  // Update watchlist
  const watchlistRef = db.collection('piracy_watchlist').doc(userId);
  const watchlistDoc = await watchlistRef.get();
  
  if (watchlistDoc.exists) {
    await watchlistRef.update({
      totalViolations: increment(1),
      uploadedStolenContent: increment(1),
      lastViolationAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    // Create watchlist entry
    await watchlistRef.set({
      entryId: userId,
      userId,
      riskLevel: 'MEDIUM',
      riskScore: 50,
      violations: [],
      totalViolations: 1,
      lastViolationAt: serverTimestamp(),
      deviceFingerprints: [],
      ipAddressHashes: [],
      connectedWallets: [],
      payoutAccountIds: [],
      refundAbuseCount: 0,
      uploadedStolenContent: 1,
      downloadedAndLeakedContent: 0,
      screenshotAttempts: 0,
      recordingAttempts: 0,
      isBlacklisted: false,
      enforcementActions: [],
      currentRestrictions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  
  logger.info(`Piracy attempt logged for user ${userId}`);
}

// ============================================================================
// HUMAN REVIEW
// ============================================================================

/**
 * Submit human review decision
 */
export const submitCopyrightReview = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Check if user is moderator
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.data()?.isModerator) {
      throw new HttpsError('permission-denied', 'Moderator access required');
    }
    
    const { caseId, decision, notes } = request.data;
    
    if (!caseId || !decision) {
      throw new HttpsError('invalid-argument', 'Case ID and decision required');
    }
    
    try {
      const caseRef = db.collection('copyright_cases').doc(caseId);
      const caseDoc = await caseRef.get();
      
      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }
      
      // Update case with human review
      await caseRef.update({
        humanReview: {
          reviewerId: uid,
          reviewedAt: serverTimestamp(),
          decision,
          reviewNotes: notes || '',
        },
        updatedAt: serverTimestamp(),
      });
      
      // Process decision
      if (decision === 'APPROVE_TAKEDOWN') {
        await processTakedown(caseId, uid);
      } else if (decision === 'REJECT_CLAIM') {
        await caseRef.update({
          status: 'REJECTED',
          resolution: {
            outcome: 'CLAIM_REJECTED',
            resolvedAt: serverTimestamp(),
            resolvedBy: uid,
            actionsTaken: ['CLAIM_REJECTED'],
          },
        });
      }
      
      return { success: true };
    } catch (error: any) {
      logger.error('Copyright review failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send copyright notification
 */
async function sendCopyrightNotification(
  userId: string,
  notification: CopyrightNotification
): Promise<void> {
  
  await db.collection('notifications').doc(generateId()).set({
    userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    actionUrl: notification.actionUrl,
    caseId: notification.caseId,
    contentId: notification.contentId,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  fileCopyrightClaim,
  submitCopyrightReview,
  applyAntiPiracyPenalty,
  logPiracyAttempt,
};