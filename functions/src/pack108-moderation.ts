/**
 * PACK 108 — NSFW Moderation Case Handling
 * Integration with PACK 103 moderation system
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NSFWModerationReasonCode,
  NSFWViolation,
  NSFW_VIOLATION_SEVERITY,
} from './pack108-types';
import { ModerationCase, ModerationCaseHistoryEntry } from './pack103-types';

// ============================================================================
// NSFW MODERATION CASE CREATION
// ============================================================================

/**
 * Create moderation case for NSFW violation
 */
export async function createNSFWModerationCase(
  userId: string,
  violationId: string,
  reasonCode: NSFWModerationReasonCode,
  description: string,
  relatedContent: string[]
): Promise<string> {
  try {
    const caseId = generateId();
    const severity = NSFW_VIOLATION_SEVERITY[reasonCode];

    // Determine priority based on severity
    const priority = 
      severity === 'CRITICAL' ? 'CRITICAL' :
      severity === 'HIGH' ? 'HIGH' :
      severity === 'MEDIUM' ? 'MEDIUM' : 'LOW';

    // Create history entry
    const historyEntry: ModerationCaseHistoryEntry = {
      timestamp: serverTimestamp() as Timestamp,
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      action: 'CASE_OPENED',
      details: `NSFW violation: ${reasonCode} - ${description}`,
      metadata: {
        violationId,
        reasonCode,
        severity,
      },
    };

    // Create case
    const moderationCase: ModerationCase = {
      caseId,
      subjectUserId: userId,
      status: 'OPEN',
      priority,
      openedAt: serverTimestamp() as Timestamp,
      openedBy: 'AUTO',
      reasonCodes: [reasonCode as any], // Cast to ModerationReasonCode
      description,
      history: [historyEntry],
      relatedReports: [],
      relatedContent,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('moderation_cases').doc(caseId).set(moderationCase);

    // Link violation to case
    await db.collection('nsfw_violations').doc(violationId).update({
      moderationCaseId: caseId,
      status: 'UNDER_REVIEW',
    });

    console.log(`[PACK108] Created moderation case ${caseId} for NSFW violation`);
    return caseId;
  } catch (error) {
    console.error(`[PACK108] Error creating NSFW moderation case:`, error);
    throw error;
  }
}

/**
 * Add NSFW context to existing moderation case
 */
export async function addNSFWContextToCase(
  caseId: string,
  violationId: string,
  nsfwDetails: {
    reasonCode: NSFWModerationReasonCode;
    contentId: string;
    nsfwLevel: string;
  }
): Promise<void> {
  try {
    const caseRef = db.collection('moderation_cases').doc(caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error(`Case ${caseId} not found`);
    }

    const caseData = caseDoc.data() as ModerationCase;

    // Add to history
    const historyEntry: ModerationCaseHistoryEntry = {
      timestamp: serverTimestamp() as Timestamp,
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      action: 'EVIDENCE_ADDED',
      details: `NSFW violation added: ${nsfwDetails.reasonCode}`,
      metadata: {
        violationId,
        nsfwLevel: nsfwDetails.nsfwLevel,
        contentId: nsfwDetails.contentId,
      },
    };

    // Update case
    await caseRef.update({
      history: [...caseData.history, historyEntry],
      relatedContent: [...caseData.relatedContent, nsfwDetails.contentId],
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] Added NSFW context to case ${caseId}`);
  } catch (error) {
    console.error(`[PACK108] Error adding NSFW context to case:`, error);
    throw error;
  }
}

// ============================================================================
// NSFW ENFORCEMENT ACTIONS
// ============================================================================

/**
 * Apply enforcement action for NSFW violation
 */
export async function applyNSFWEnforcement(
  caseId: string,
  userId: string,
  reasonCode: NSFWModerationReasonCode,
  moderatorId: string
): Promise<void> {
  try {
    const enforcement = determineNSFWEnforcement(reasonCode);

    // Apply enforcement based on severity
    if (enforcement.removeContent) {
      await removeNSFWContent(userId, caseId);
    }

    if (enforcement.temporaryRestriction) {
      await applyTemporaryRestriction(userId, 7, 'NSFW violation', caseId);
    }

    if (enforcement.permanentRestriction) {
      await applyPermanentRestriction(userId, 'NSFW violation', caseId);
    }

    if (enforcement.accountSuspension) {
      await suspendAccount(userId, 'NSFW violation', caseId);
    }

    // Update case with enforcement action
    await updateCaseWithEnforcement(caseId, enforcement, moderatorId);

    console.log(`[PACK108] Applied NSFW enforcement for case ${caseId}`);
  } catch (error) {
    console.error(`[PACK108] Error applying NSFW enforcement:`, error);
    throw error;
  }
}

/**
 * Determine appropriate enforcement for NSFW violation
 */
function determineNSFWEnforcement(reasonCode: NSFWModerationReasonCode): {
  removeContent: boolean;
  temporaryRestriction: boolean;
  permanentRestriction: boolean;
  accountSuspension: boolean;
} {
  switch (reasonCode) {
    case 'NSFW_ILLEGAL_REGION':
      return {
        removeContent: true,
        temporaryRestriction: true,
        permanentRestriction: false,
        accountSuspension: false,
      };

    case 'NSFW_UNMARKED':
      return {
        removeContent: false,
        temporaryRestriction: false,
        permanentRestriction: false,
        accountSuspension: false, // Warning only
      };

    case 'NSFW_BYPASS_ATTEMPT':
      return {
        removeContent: true,
        temporaryRestriction: true,
        permanentRestriction: false,
        accountSuspension: false,
      };

    case 'NSFW_EXTERNAL_SELLING':
      return {
        removeContent: true,
        temporaryRestriction: false,
        permanentRestriction: true,
        accountSuspension: false,
      };

    case 'NSFW_MINOR_ACCESS':
      return {
        removeContent: true,
        temporaryRestriction: false,
        permanentRestriction: false,
        accountSuspension: true, // Most serious
      };

    case 'NSFW_MISCLASSIFICATION':
      return {
        removeContent: false,
        temporaryRestriction: false,
        permanentRestriction: false,
        accountSuspension: false, // Warning only
      };

    case 'NSFW_PSP_VIOLATION':
      return {
        removeContent: true,
        temporaryRestriction: true,
        permanentRestriction: false,
        accountSuspension: false,
      };

    default:
      return {
        removeContent: false,
        temporaryRestriction: false,
        permanentRestriction: false,
        accountSuspension: false,
      };
  }
}

/**
 * Remove NSFW content for user
 */
async function removeNSFWContent(
  userId: string,
  caseId: string
): Promise<void> {
  try {
    // Get case to find related content
    const caseDoc = await db.collection('moderation_cases').doc(caseId).get();
    const caseData = caseDoc.data() as ModerationCase;

    // Mark content as removed
    for (const contentId of caseData.relatedContent) {
      await db.collection('content').doc(contentId).update({
        removed: true,
        removedReason: 'NSFW violation',
        removedAt: serverTimestamp(),
        moderationCaseId: caseId,
      });
    }

    console.log(`[PACK108] Removed ${caseData.relatedContent.length} content items for user ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error removing NSFW content:`, error);
  }
}

/**
 * Apply temporary restriction
 */
async function applyTemporaryRestriction(
  userId: string,
  days: number,
  reason: string,
  caseId: string
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await db.collection('user_restrictions').doc(userId).set({
      userId,
      type: 'NSFW_POSTING',
      reason,
      appliedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      moderationCaseId: caseId,
      active: true,
    });

    console.log(`[PACK108] Applied ${days}-day restriction to user ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error applying temporary restriction:`, error);
  }
}

/**
 * Apply permanent restriction
 */
async function applyPermanentRestriction(
  userId: string,
  reason: string,
  caseId: string
): Promise<void> {
  try {
    await db.collection('user_restrictions').doc(userId).set({
      userId,
      type: 'NSFW_MONETIZATION',
      reason,
      appliedAt: serverTimestamp(),
      expiresAt: null, // Permanent
      moderationCaseId: caseId,
      active: true,
      permanent: true,
    });

    console.log(`[PACK108] Applied permanent NSFW monetization restriction to user ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error applying permanent restriction:`, error);
  }
}

/**
 * Suspend account
 */
async function suspendAccount(
  userId: string,
  reason: string,
  caseId: string
): Promise<void> {
  try {
    // Update user enforcement state
    await db.collection('user_enforcement_state').doc(userId).update({
      accountStatus: 'SUSPENDED',
      reasonCodes: ['NSFW_MINOR_ACCESS'],
      lastUpdatedAt: serverTimestamp(),
      moderationCaseId: caseId,
    });

    console.log(`[PACK108] Suspended account for user ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error suspending account:`, error);
  }
}

/**
 * Update case with enforcement action
 */
async function updateCaseWithEnforcement(
  caseId: string,
  enforcement: any,
  moderatorId: string
): Promise<void> {
  try {
    const historyEntry: ModerationCaseHistoryEntry = {
      timestamp: serverTimestamp() as Timestamp,
      actorId: moderatorId,
      actorType: moderatorId === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
      action: 'ENFORCEMENT_APPLIED',
      details: `Enforcement applied: ${JSON.stringify(enforcement)}`,
      metadata: enforcement,
    };

    const caseRef = db.collection('moderation_cases').doc(caseId);
    const caseDoc = await caseRef.get();
    const caseData = caseDoc.data() as ModerationCase;

    await caseRef.update({
      status: 'RESOLVED',
      history: [...caseData.history, historyEntry],
      resolution: {
        outcome: enforcement.accountSuspension ? 'SUSPENSION' :
                 enforcement.permanentRestriction ? 'PERMANENT_RESTRICTION' :
                 enforcement.temporaryRestriction ? 'TEMPORARY_RESTRICTION' :
                 'WARNING',
        reviewNote: 'NSFW enforcement applied',
        reviewerId: moderatorId,
        resolvedAt: serverTimestamp() as Timestamp,
      },
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`[PACK108] Error updating case with enforcement:`, error);
  }
}

// ============================================================================
// VIOLATION TRACKING
// ============================================================================

/**
 * Get NSFW violation count for user
 */
export async function getNSFWViolationCount(
  userId: string,
  days: number = 30
): Promise<{
  total: number;
  byReasonCode: Record<NSFWModerationReasonCode, number>;
  recent: number;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const violationsSnapshot = await db
      .collection('nsfw_violations')
      .where('userId', '==', userId)
      .where('status', '==', 'CONFIRMED')
      .get();

    let total = 0;
    let recent = 0;
    const byReasonCode: Record<string, number> = {};

    violationsSnapshot.docs.forEach(doc => {
      const violation = doc.data() as NSFWViolation;
      total++;

      if (violation.detectedAt.toDate() >= cutoffDate) {
        recent++;
      }

      byReasonCode[violation.reasonCode] = (byReasonCode[violation.reasonCode] || 0) + 1;
    });

    return {
      total,
      byReasonCode: byReasonCode as Record<NSFWModerationReasonCode, number>,
      recent,
    };
  } catch (error) {
    console.error(`[PACK108] Error getting violation count:`, error);
    return {
      total: 0,
      byReasonCode: {} as Record<NSFWModerationReasonCode, number>,
      recent: 0,
    };
  }
}

/**
 * Check if user is repeat offender
 */
export async function isRepeatNSFWOffender(userId: string): Promise<boolean> {
  try {
    const violationCount = await getNSFWViolationCount(userId, 90); // 90 days
    
    // Consider repeat offender if:
    // - 3+ violations in 90 days, OR
    // - Any CRITICAL severity violations
    if (violationCount.recent >= 3) {
      return true;
    }

    if (
      violationCount.byReasonCode['NSFW_ILLEGAL_REGION'] > 0 ||
      violationCount.byReasonCode['NSFW_MINOR_ACCESS'] > 0
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[PACK108] Error checking repeat offender:`, error);
    return false;
  }
}