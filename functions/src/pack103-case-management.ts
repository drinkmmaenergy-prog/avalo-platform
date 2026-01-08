/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Case Management System
 *
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No changes to token price or 65/35 revenue split
 * - Enforcement cannot be influenced by payments or user popularity
 * - Moderation actions must be legally, ethically, and procedurally defensible
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ModerationCase,
  ModerationCaseStatus,
  ModerationCasePriority,
  ModerationReasonCode,
  ModerationCaseHistoryEntry,
  ModerationResolution,
  EnforcementAppeal,
  AppealStatus,
  HumanReviewQueueItem,
  ReviewPriorityReason,
} from './pack103-types';
import {
  calculateEnforcementConfidence,
  logModerationAction,
  getUserModeratorLevel,
} from './pack103-governance-engine';

// ============================================================================
// COLLECTIONS
// ============================================================================

const COLLECTIONS = {
  MODERATION_CASES: 'moderation_cases',
  ENFORCEMENT_APPEALS: 'enforcement_appeals',
  HUMAN_REVIEW_QUEUE: 'human_review_queue',
  USER_ENFORCEMENT_STATE: 'user_enforcement_state',
} as const;

// ============================================================================
// CASE CREATION & MANAGEMENT
// ============================================================================

/**
 * Create a new moderation case
 */
export async function createModerationCase(
  targetUserId: string,
  reasonCodes: ModerationReasonCode[],
  openedBy: string,
  description?: string
): Promise<string> {
  try {
    logger.info(`Creating moderation case for user ${targetUserId}`);
    
    // Check for existing open cases
    const existingCasesQuery = await db
      .collection(COLLECTIONS.MODERATION_CASES)
      .where('subjectUserId', '==', targetUserId)
      .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
      .limit(1)
      .get();

    if (!existingCasesQuery.empty) {
      const existingCase = existingCasesQuery.docs[0];
      logger.info(`Existing open case found: ${existingCase.id}`);
      
      // Update existing case with new reason codes
      const existingData = existingCase.data() as ModerationCase;
      const updatedReasonCodes = Array.from(new Set([...existingData.reasonCodes, ...reasonCodes]));
      
      await existingCase.ref.update({
        reasonCodes: updatedReasonCodes,
        updatedAt: serverTimestamp(),
      });
      
      // Add history entry
      await addCaseHistoryEntry(existingCase.id, openedBy, 'SYSTEM', 'CASE_UPDATED',
        `New reason codes added: ${reasonCodes.join(', ')}`);
      
      return existingCase.id;
    }

    // Calculate enforcement confidence
    const confidence = await calculateEnforcementConfidence(targetUserId);
    
    // Determine priority based on reason codes and confidence
    const priority = determineCasePriority(reasonCodes, confidence.score);

    const caseId = generateId();
    const newCase: ModerationCase = {
      caseId,
      subjectUserId: targetUserId,
      status: 'OPEN',
      priority,
      openedAt: serverTimestamp() as Timestamp,
      openedBy,
      reasonCodes,
      description,
      history: [],
      relatedReports: [],
      relatedContent: [],
      enforcementConfidence: confidence.score,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.MODERATION_CASES).doc(caseId).set(newCase);
    
    // Add initial history entry
    await addCaseHistoryEntry(caseId, openedBy, 
      openedBy === 'AUTO' ? 'SYSTEM' : 'ADMIN',
      'CASE_CREATED',
      `Case created with reasons: ${reasonCodes.join(', ')}`
    );

    // Queue for human review if needed
    if (requiresHumanReview(reasonCodes, confidence.score)) {
      await queueForHumanReview(caseId, targetUserId, priority, reasonCodes[0] as ReviewPriorityReason, confidence.score);
    }

    // Log the action
    await logModerationAction(openedBy, targetUserId, 'CREATE_CASE', 
      `Case created: ${caseId}`, { caseId });

    logger.info(`Moderation case created: ${caseId} for user ${targetUserId}`);
    return caseId;
  } catch (error: any) {
    logger.error(`Error creating moderation case for user ${targetUserId}`, error);
    throw error;
  }
}

/**
 * Update moderation case
 */
export async function updateModerationCase(
  caseId: string,
  updatedBy: string,
  updates: {
    status?: ModerationCaseStatus;
    priority?: ModerationCasePriority;
    assigneeId?: string;
    resolution?: ModerationResolution;
  }
): Promise<void> {
  try {
    logger.info(`Updating moderation case ${caseId}`);
    
    const caseRef = db.collection(COLLECTIONS.MODERATION_CASES).doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new Error(`Case ${caseId} not found`);
    }

    const updateData: any = {
      ...updates,
      updatedAt: serverTimestamp(),
    };

    // If resolving, add resolved timestamp
    if (updates.status === 'RESOLVED' && updates.resolution) {
      updateData.resolvedAt = serverTimestamp();
    }

    await caseRef.update(updateData);
    
    // Add history entry
    const changeDescription = Object.entries(updates)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    
    await addCaseHistoryEntry(caseId, updatedBy, 'ADMIN', 'CASE_UPDATED', changeDescription);

    // Log the action
    await logModerationAction(updatedBy, caseDoc.data()!.subjectUserId, 'UPDATE_CASE',
      `Case updated: ${changeDescription}`, { caseId });

    logger.info(`Moderation case ${caseId} updated`);
  } catch (error: any) {
    logger.error(`Error updating moderation case ${caseId}`, error);
    throw error;
  }
}

/**
 * Assign case to moderator
 */
export async function assignModerationCase(
  caseId: string,
  assigneeId: string,
  assignedBy: string
): Promise<void> {
  try {
    logger.info(`Assigning case ${caseId} to ${assigneeId}`);
    
    // Verify assignee has appropriate level
    const assigneeLevel = await getUserModeratorLevel(assigneeId);
    if (assigneeLevel < 2) {
      throw new Error('Only trusted moderators and admins can be assigned cases');
    }

    await updateModerationCase(caseId, assignedBy, {
      assigneeId,
      status: 'UNDER_REVIEW',
    });

    await addCaseHistoryEntry(caseId, assignedBy, 'ADMIN', 'CASE_ASSIGNED',
      `Case assigned to moderator ${assigneeId}`);

    // Log the action
    await logModerationAction(assignedBy, '', 'ASSIGN_CASE',
      `Case ${caseId} assigned to ${assigneeId}`, { caseId });

    logger.info(`Case ${caseId} assigned to ${assigneeId}`);
  } catch (error: any) {
    logger.error(`Error assigning case ${caseId}`, error);
    throw error;
  }
}

/**
 * Resolve moderation case
 */
export async function resolveModerationCase(
  caseId: string,
  reviewerId: string,
  resolution: ModerationResolution
): Promise<void> {
  try {
    logger.info(`Resolving moderation case ${caseId}`);
    
    // Verify reviewer has admin level
    const reviewerLevel = await getUserModeratorLevel(reviewerId);
    if (reviewerLevel < 3) {
      throw new Error('Only admins can resolve cases');
    }

    await updateModerationCase(caseId, reviewerId, {
      status: 'RESOLVED',
      resolution,
    });

    await addCaseHistoryEntry(caseId, reviewerId, 'ADMIN', 'CASE_RESOLVED',
      `Case resolved with outcome: ${resolution.outcome}`);

    // Log the action
    await logModerationAction(reviewerId, '', 'RESOLVE_CASE',
      `Case resolved: ${resolution.outcome}`, { caseId });

    logger.info(`Case ${caseId} resolved with outcome: ${resolution.outcome}`);
  } catch (error: any) {
    logger.error(`Error resolving case ${caseId}`, error);
    throw error;
  }
}

/**
 * Get moderation case by ID
 */
export async function getModerationCase(caseId: string): Promise<ModerationCase | null> {
  const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(caseId).get();
  
  if (!caseDoc.exists) {
    return null;
  }
  
  return caseDoc.data() as ModerationCase;
}

/**
 * Get all cases for a user
 */
export async function getUserModerationCases(
  userId: string,
  limit: number = 50
): Promise<ModerationCase[]> {
  const casesQuery = await db
    .collection(COLLECTIONS.MODERATION_CASES)
    .where('subjectUserId', '==', userId)
    .orderBy('openedAt', 'desc')
    .limit(limit)
    .get();
  
  return casesQuery.docs.map(doc => doc.data() as ModerationCase);
}

/**
 * Add history entry to case
 */
async function addCaseHistoryEntry(
  caseId: string,
  actorId: string,
  actorType: ModerationCaseHistoryEntry['actorType'],
  action: string,
  details: string,
  metadata?: Record<string, any>
): Promise<void> {
  const entry: ModerationCaseHistoryEntry = {
    timestamp: serverTimestamp() as Timestamp,
    actorId,
    actorType,
    action,
    details,
    metadata,
  };

  await db.collection(COLLECTIONS.MODERATION_CASES).doc(caseId).update({
    history: FieldValue.arrayUnion(entry),
  });
}

// ============================================================================
// ENFORCEMENT APPEALS
// ============================================================================

/**
 * Submit enforcement appeal
 */
export async function submitEnforcementAppeal(
  caseId: string,
  userId: string,
  explanation: string
): Promise<string> {
  try {
    logger.info(`User ${userId} submitting appeal for case ${caseId}`);
    
    // Verify case exists and belongs to user
    const caseData = await getModerationCase(caseId);
    if (!caseData) {
      throw new Error('Case not found');
    }
    if (caseData.subjectUserId !== userId) {
      throw new Error('Case does not belong to this user');
    }
    if (caseData.status !== 'RESOLVED') {
      throw new Error('Can only appeal resolved cases');
    }

    // Check for existing pending appeal
    const existingAppealQuery = await db
      .collection(COLLECTIONS.ENFORCEMENT_APPEALS)
      .where('caseId', '==', caseId)
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    if (!existingAppealQuery.empty) {
      throw new Error('An appeal is already pending for this case');
    }

    const appealId = generateId();
    const appeal: EnforcementAppeal = {
      appealId,
      caseId,
      userId,
      explanation,
      submittedAt: serverTimestamp() as Timestamp,
      status: 'PENDING',
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.ENFORCEMENT_APPEALS).doc(appealId).set(appeal);
    
    // Update case status to APPEALED
    await updateModerationCase(caseId, userId, {
      status: 'APPEALED',
    });
    
    // Add history entry to case
    await addCaseHistoryEntry(caseId, userId, 'USER', 'APPEAL_SUBMITTED',
      'User submitted an appeal');

    // Log the action
    await logModerationAction(userId, userId, 'APPEAL_SUBMITTED',
      `Appeal submitted for case ${caseId}`, { caseId, metadata: { appealId } });

    logger.info(`Appeal ${appealId} submitted for case ${caseId}`);
    return appealId;
  } catch (error: any) {
    logger.error(`Error submitting appeal for case ${caseId}`, error);
    throw error;
  }
}

/**
 * Review enforcement appeal
 */
export async function reviewEnforcementAppeal(
  appealId: string,
  reviewerId: string,
  decision: 'UPHELD' | 'OVERTURNED' | 'MODIFIED',
  explanation: string,
  newEnforcement?: Record<string, any>
): Promise<void> {
  try {
    logger.info(`Reviewing appeal ${appealId}`);
    
    // Verify reviewer is admin
    const reviewerLevel = await getUserModeratorLevel(reviewerId);
    if (reviewerLevel < 3) {
      throw new Error('Only admins can review appeals');
    }

    const appealRef = db.collection(COLLECTIONS.ENFORCEMENT_APPEALS).doc(appealId);
    const appealDoc = await appealRef.get();
    
    if (!appealDoc.exists) {
      throw new Error('Appeal not found');
    }

    const appeal = appealDoc.data() as EnforcementAppeal;
    
    await appealRef.update({
      status: decision === 'UPHELD' ? 'REJECTED' : 'APPROVED',
      reviewedBy: reviewerId,
      reviewedAt: serverTimestamp(),
      reviewNotes: explanation,
      outcome: {
        decision,
        newEnforcement,
        explanation,
      },
      updatedAt: serverTimestamp(),
    });

    // Add history entry to case
    await addCaseHistoryEntry(appeal.caseId, reviewerId, 'ADMIN', 'APPEAL_REVIEWED',
      `Appeal ${decision}: ${explanation}`);

    // Log the action
    await logModerationAction(reviewerId, appeal.userId, 'APPEAL_REVIEWED',
      `Appeal ${decision}`, { caseId: appeal.caseId, metadata: { appealId, decision } });

    logger.info(`Appeal ${appealId} reviewed: ${decision}`);
  } catch (error: any) {
    logger.error(`Error reviewing appeal ${appealId}`, error);
    throw error;
  }
}

/**
 * Get appeal for a case
 */
export async function getCaseAppeal(caseId: string): Promise<EnforcementAppeal | null> {
  const appealQuery = await db
    .collection(COLLECTIONS.ENFORCEMENT_APPEALS)
    .where('caseId', '==', caseId)
    .orderBy('submittedAt', 'desc')
    .limit(1)
    .get();
  
  if (appealQuery.empty) {
    return null;
  }
  
  return appealQuery.docs[0].data() as EnforcementAppeal;
}

// ============================================================================
// HUMAN REVIEW QUEUE
// ============================================================================

/**
 * Queue case for human review
 */
async function queueForHumanReview(
  caseId: string,
  userId: string,
  priority: ModerationCasePriority,
  reason: ReviewPriorityReason,
  enforcementConfidence: number
): Promise<void> {
  try {
    const queueId = generateId();
    const queueItem: HumanReviewQueueItem = {
      queueId,
      caseId,
      userId,
      priority,
      reason,
      enforcementConfidence,
      queuedAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.HUMAN_REVIEW_QUEUE).doc(queueId).set(queueItem);
    
    logger.info(`Case ${caseId} queued for human review with priority ${priority}`);
  } catch (error: any) {
    logger.error(`Error queuing case ${caseId} for human review`, error);
    throw error;
  }
}

/**
 * Get next item from human review queue
 */
export async function getNextReviewQueueItem(assigneeId: string): Promise<HumanReviewQueueItem | null> {
  // Get highest priority unassigned item
  const queueQuery = await db
    .collection(COLLECTIONS.HUMAN_REVIEW_QUEUE)
    .where('assignedTo', '==', null)
    .orderBy('priority', 'desc')
    .orderBy('queuedAt', 'asc')
    .limit(1)
    .get();
  
  if (queueQuery.empty) {
    return null;
  }
  
  const queueItem = queueQuery.docs[0];
  
  // Assign to reviewer
  await queueItem.ref.update({
    assignedTo: assigneeId,
    assignedAt: serverTimestamp(),
  });
  
  return queueItem.data() as HumanReviewQueueItem;
}

/**
 * Remove item from human review queue
 */
export async function removeFromReviewQueue(queueId: string): Promise<void> {
  await db.collection(COLLECTIONS.HUMAN_REVIEW_QUEUE).doc(queueId).delete();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine case priority based on reason codes and confidence
 */
function determineCasePriority(
  reasonCodes: ModerationReasonCode[],
  confidenceScore: number
): ModerationCasePriority {
  // Critical reasons always get CRITICAL priority
  const criticalReasons: ModerationReasonCode[] = [
    'IDENTITY_FRAUD',
    'MINOR_SAFETY',
    'CRIMINAL_ACTIVITY',
  ];
  
  if (reasonCodes.some(r => criticalReasons.includes(r))) {
    return 'CRITICAL';
  }
  
  // High confidence or high-risk reasons get HIGH priority
  const highRiskReasons: ModerationReasonCode[] = [
    'KYC_MISMATCH',
    'HIGH_RISK_CONTENT',
    'COORDINATED_ABUSE',
  ];
  
  if (confidenceScore > 0.8 || reasonCodes.some(r => highRiskReasons.includes(r))) {
    return 'HIGH';
  }
  
  // Medium confidence or persistent issues get MEDIUM priority
  if (confidenceScore > 0.6 || reasonCodes.includes('PERSISTENT_VIOLATIONS')) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

/**
 * Check if case requires human review
 */
function requiresHumanReview(
  reasonCodes: ModerationReasonCode[],
  confidenceScore: number
): boolean {
  // These reasons always require human review
  const alwaysReviewReasons: ModerationReasonCode[] = [
    'IDENTITY_FRAUD',
    'KYC_MISMATCH',
    'HIGH_RISK_CONTENT',
    'MINOR_SAFETY',
    'CRIMINAL_ACTIVITY',
    'PERSISTENT_VIOLATIONS',
    'MONETIZATION_BYPASS',
    'GOVERNANCE_BYPASS',
  ];
  
  if (reasonCodes.some(r => alwaysReviewReasons.includes(r))) {
    return true;
  }
  
  // High confidence scores require human review before final suspension
  if (confidenceScore > 0.8) {
    return true;
  }
  
  return false;
}