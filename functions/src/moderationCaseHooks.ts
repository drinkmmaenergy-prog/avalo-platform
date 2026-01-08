/**
 * PACK 88 — Automatic Case Creation Hooks
 * Automatically create moderation cases when key events occur
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ModerationCase,
  CaseType,
  CaseStatus,
  CasePriority,
} from './types/moderation.types';
import { determineCasePriority } from './moderationUtils';

// ============================================================================
// KYC SUBMISSION HOOK
// ============================================================================

/**
 * Create case when KYC application is submitted
 * Called from kyc.ts after KYC submission
 */
export async function onKycSubmission(
  userId: string,
  documentId: string
): Promise<string> {
  try {
    const caseId = generateId();
    
    const moderationCase: ModerationCase = {
      id: caseId,
      type: 'KYC',
      subjectUserId: userId,
      sourceId: documentId,
      status: 'OPEN',
      priority: 'MEDIUM',
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'SYSTEM',
    };
    
    await db.collection('moderation_cases').doc(caseId).set(moderationCase);
    
    console.log(`[ModerationHooks] Created KYC case ${caseId} for user ${userId}`);
    return caseId;
  } catch (error) {
    console.error('[ModerationHooks] Error creating KYC case:', error);
    // Don't throw - case creation failure shouldn't block KYC submission
    return '';
  }
}

// ============================================================================
// PAYOUT REQUEST HOOK
// ============================================================================

/**
 * Create case when payout request is created
 * Called from payoutRequests.ts after payout request creation
 */
export async function onPayoutRequest(
  userId: string,
  requestId: string,
  requestedTokens: number,
  requestedFiat: number
): Promise<string> {
  try {
    const caseId = generateId();
    
    // Determine priority based on amount
    const priority = determineCasePriority('PAYOUT', {
      payoutAmount: requestedFiat,
    });
    
    const moderationCase: ModerationCase = {
      id: caseId,
      type: 'PAYOUT',
      subjectUserId: userId,
      sourceId: requestId,
      status: 'OPEN',
      priority,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'SYSTEM',
    };
    
    await db.collection('moderation_cases').doc(caseId).set(moderationCase);
    
    console.log(`[ModerationHooks] Created PAYOUT case ${caseId} for user ${userId}`);
    return caseId;
  } catch (error) {
    console.error('[ModerationHooks] Error creating PAYOUT case:', error);
    return '';
  }
}

// ============================================================================
// TRANSACTION ISSUE / DISPUTE HOOK
// ============================================================================

/**
 * Create case when transaction issue/dispute is created
 * Called from disputes.ts after dispute creation
 */
export async function onTransactionIssue(
  userId: string,
  issueId: string,
  issueType: string,
  reasonCode?: string
): Promise<string> {
  try {
    const caseId = generateId();
    
    // Determine priority based on issue type and reason
    const priority = determineCasePriority('DISPUTE', {
      reasonCode,
    });
    
    const moderationCase: ModerationCase = {
      id: caseId,
      type: 'DISPUTE',
      subjectUserId: userId,
      sourceId: issueId,
      status: 'OPEN',
      priority,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'SYSTEM',
    };
    
    await db.collection('moderation_cases').doc(caseId).set(moderationCase);
    
    console.log(`[ModerationHooks] Created DISPUTE case ${caseId} for user ${userId}`);
    return caseId;
  } catch (error) {
    console.error('[ModerationHooks] Error creating DISPUTE case:', error);
    return '';
  }
}

// ============================================================================
// HIGH-RISK TRUST PROFILE HOOK
// ============================================================================

/**
 * Create case when user's trust risk score exceeds threshold
 * Called from trustRiskEngine.ts after risk recalculation
 */
export async function onHighRiskTrustProfile(
  userId: string,
  riskScore: number,
  flags: string[]
): Promise<string> {
  try {
    // Check if there's already an open TRUST_REVIEW case for this user
    const existingCaseSnapshot = await db
      .collection('moderation_cases')
      .where('subjectUserId', '==', userId)
      .where('type', '==', 'TRUST_REVIEW')
      .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
      .limit(1)
      .get();
    
    if (!existingCaseSnapshot.empty) {
      console.log(`[ModerationHooks] TRUST_REVIEW case already exists for user ${userId}`);
      return existingCaseSnapshot.docs[0].id;
    }
    
    const caseId = generateId();
    
    // Determine priority based on risk score and flags
    const priority = determineCasePriority('TRUST_REVIEW', {
      riskScore,
      flags,
    });
    
    const moderationCase: ModerationCase = {
      id: caseId,
      type: 'TRUST_REVIEW',
      subjectUserId: userId,
      sourceId: userId, // Source is the user's trust profile itself
      status: 'OPEN',
      priority,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'SYSTEM',
      lastAction: `RISK_SCORE_${riskScore}`,
    };
    
    await db.collection('moderation_cases').doc(caseId).set(moderationCase);
    
    console.log(`[ModerationHooks] Created TRUST_REVIEW case ${caseId} for user ${userId} (risk: ${riskScore})`);
    return caseId;
  } catch (error) {
    console.error('[ModerationHooks] Error creating TRUST_REVIEW case:', error);
    return '';
  }
}

// ============================================================================
// ENFORCEMENT ACTION HOOK
// ============================================================================

/**
 * Create case when manual enforcement action is taken
 * Called from enforcementEngine.ts after manual enforcement state change
 */
export async function onManualEnforcementAction(
  userId: string,
  accountStatus: string,
  reviewerId: string,
  reviewNote: string
): Promise<string> {
  try {
    const caseId = generateId();
    
    const moderationCase: ModerationCase = {
      id: caseId,
      type: 'ENFORCEMENT',
      subjectUserId: userId,
      sourceId: userId, // Source is the enforcement state itself
      status: 'RESOLVED', // Enforcement cases are created already resolved
      priority: 'CRITICAL',
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: reviewerId,
      assignedTo: reviewerId,
      lastAction: `ENFORCEMENT_SET_${accountStatus}`,
    };
    
    await db.collection('moderation_cases').doc(caseId).set(moderationCase);
    
    console.log(`[ModerationHooks] Created ENFORCEMENT case ${caseId} for user ${userId}`);
    return caseId;
  } catch (error) {
    console.error('[ModerationHooks] Error creating ENFORCEMENT case:', error);
    return '';
  }
}

// ============================================================================
// CASE UPDATE HELPERS
// ============================================================================

/**
 * Update case status and last action
 */
export async function updateCaseStatus(
  caseId: string,
  status: CaseStatus,
  lastAction?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    
    if (lastAction) {
      updateData.lastAction = lastAction;
    }
    
    await db.collection('moderation_cases').doc(caseId).update(updateData);
    
    console.log(`[ModerationHooks] Updated case ${caseId} status to ${status}`);
  } catch (error) {
    console.error(`[ModerationHooks] Error updating case ${caseId}:`, error);
    // Don't throw - case update failure shouldn't block operations
  }
}

/**
 * Assign case to admin
 */
export async function assignCase(
  caseId: string,
  adminId: string
): Promise<void> {
  try {
    await db.collection('moderation_cases').doc(caseId).update({
      assignedTo: adminId,
      updatedAt: serverTimestamp(),
    });
    
    console.log(`[ModerationHooks] Assigned case ${caseId} to admin ${adminId}`);
  } catch (error) {
    console.error(`[ModerationHooks] Error assigning case ${caseId}:`, error);
  }
}

/**
 * Update case last action
 */
export async function updateCaseLastAction(
  caseId: string,
  lastAction: string
): Promise<void> {
  try {
    await db.collection('moderation_cases').doc(caseId).update({
      lastAction,
      updatedAt: serverTimestamp(),
    });
    
    console.log(`[ModerationHooks] Updated case ${caseId} last action to ${lastAction}`);
  } catch (error) {
    console.error(`[ModerationHooks] Error updating case ${caseId} last action:`, error);
  }
}