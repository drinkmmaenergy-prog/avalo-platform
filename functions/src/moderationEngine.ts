/**
 * PACK 54 - Moderation & Enforcement Engine
 * Core logic for enforcement state management, case creation, and moderation actions
 */

import { db, serverTimestamp, generateId } from './init';
import {
  EnforcementState,
  EnforcementStateInput,
  ModerationCase,
  ModerationCaseUpdate,
  ModerationAction,
  DEFAULT_ENFORCEMENT_STATE,
  getSeverityFromReason,
  AccountStatus,
  VisibilityStatus,
  MessagingStatus,
  EarningStatus,
} from './moderationTypes';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ENFORCEMENT STATE MANAGEMENT
// ============================================================================

/**
 * Get enforcement state for a user
 * Returns default state if none exists
 */
export async function getEnforcementState(userId: string): Promise<EnforcementState> {
  const stateRef = db.collection('enforcement_state').doc(userId);
  const stateDoc = await stateRef.get();

  if (!stateDoc.exists) {
    // Return default state
    return {
      ...DEFAULT_ENFORCEMENT_STATE,
      userId,
      lastUpdatedAt: Timestamp.now(),
    };
  }

  return stateDoc.data() as EnforcementState;
}

/**
 * Apply enforcement action to a user
 * This is the ONLY way to modify enforcement state
 */
export async function applyEnforcement(
  targetUserId: string,
  performedBy: string,
  updates: EnforcementStateInput,
  caseId?: string
): Promise<{ success: boolean; enforcementState: EnforcementState }> {
  const stateRef = db.collection('enforcement_state').doc(targetUserId);
  const now = serverTimestamp();

  // Get current state
  const currentState = await getEnforcementState(targetUserId);

  // Merge updates with current state
  const newState: EnforcementState = {
    userId: targetUserId,
    accountStatus: updates.accountStatus ?? currentState.accountStatus,
    visibilityStatus: updates.visibilityStatus ?? currentState.visibilityStatus,
    messagingStatus: updates.messagingStatus ?? currentState.messagingStatus,
    earningStatus: updates.earningStatus ?? currentState.earningStatus,
    reasons: updates.reasons ?? currentState.reasons,
    notes: updates.notes ?? currentState.notes,
    lastUpdatedAt: now as any,
    lastUpdatedBy: performedBy,
  };

  // Upsert enforcement state
  await stateRef.set(newState, { merge: true });

  // Log action
  const actionId = generateId();
  const actionRef = db.collection('moderation_actions').doc(actionId);

  const action: ModerationAction = {
    actionId,
    caseId: caseId || '',
    targetUserId,
    performedBy,
    type: determineActionType(updates),
    details: generateActionDetails(updates),
    createdAt: now as any,
    snapshot: {
      accountStatus: newState.accountStatus,
      visibilityStatus: newState.visibilityStatus,
      messagingStatus: newState.messagingStatus,
      earningStatus: newState.earningStatus,
    },
  };

  await actionRef.set(action);

  return {
    success: true,
    enforcementState: newState,
  };
}

/**
 * Determine action type from enforcement updates
 */
function determineActionType(updates: EnforcementStateInput): ModerationAction['type'] {
  if (updates.accountStatus === 'BANNED') return 'BANNED';
  if (updates.accountStatus === 'SUSPENDED') return 'SUSPENDED';
  if (updates.accountStatus === 'LIMITED') return 'LIMITED';
  if (updates.visibilityStatus) return 'VISIBILITY_CHANGE';
  if (updates.earningStatus) return 'EARNING_CHANGE';
  if (updates.notes) return 'NOTE';
  return 'WARNING_SENT';
}

/**
 * Generate action details from updates
 */
function generateActionDetails(updates: EnforcementStateInput): string {
  const details: string[] = [];

  if (updates.accountStatus) {
    details.push(`Account status: ${updates.accountStatus}`);
  }
  if (updates.visibilityStatus) {
    details.push(`Visibility: ${updates.visibilityStatus}`);
  }
  if (updates.messagingStatus) {
    details.push(`Messaging: ${updates.messagingStatus}`);
  }
  if (updates.earningStatus) {
    details.push(`Earning: ${updates.earningStatus}`);
  }
  if (updates.reasons && updates.reasons.length > 0) {
    details.push(`Reasons: ${updates.reasons.join(', ')}`);
  }
  if (updates.notes) {
    details.push(`Notes: ${updates.notes}`);
  }

  return details.join(' | ');
}

// ============================================================================
// MODERATION CASE MANAGEMENT
// ============================================================================

/**
 * Create or update moderation case from new report
 * Groups reports by target user
 */
export async function createOrUpdateCaseFromReport(
  reportId: string,
  targetUserId: string,
  reason: string
): Promise<{ success: boolean; caseId: string; created: boolean }> {
  const now = serverTimestamp();

  // Try to find existing OPEN or UNDER_REVIEW case for this user
  const casesQuery = await db
    .collection('moderation_cases')
    .where('targetUserId', '==', targetUserId)
    .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
    .limit(1)
    .get();

  if (!casesQuery.empty) {
    // Update existing case
    const caseDoc = casesQuery.docs[0];
    const caseData = caseDoc.data() as ModerationCase;

    await caseDoc.ref.update({
      reportIds: [...caseData.reportIds, reportId],
      totalReports: caseData.totalReports + 1,
      lastReportAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      caseId: caseDoc.id,
      created: false,
    };
  }

  // Create new case
  const caseId = generateId();
  const caseRef = db.collection('moderation_cases').doc(caseId);

  const newCase: ModerationCase = {
    caseId,
    targetUserId,
    reportIds: [reportId],
    totalReports: 1,
    firstReportAt: now as any,
    lastReportAt: now as any,
    status: 'OPEN',
    severity: getSeverityFromReason(reason),
    createdAt: now as any,
    updatedAt: now as any,
  };

  await caseRef.set(newCase);

  return {
    success: true,
    caseId,
    created: true,
  };
}

/**
 * Update moderation case
 */
export async function updateModerationCase(
  caseId: string,
  updates: ModerationCaseUpdate
): Promise<{ success: boolean }> {
  const caseRef = db.collection('moderation_cases').doc(caseId);
  const caseDoc = await caseRef.get();

  if (!caseDoc.exists) {
    throw new Error('Case not found');
  }

  const now = serverTimestamp();
  const updateData: any = {
    ...updates,
    updatedAt: now,
  };

  await caseRef.update(updateData);

  return { success: true };
}

/**
 * Get moderation case by ID
 */
export async function getModerationCase(caseId: string): Promise<ModerationCase | null> {
  const caseRef = db.collection('moderation_cases').doc(caseId);
  const caseDoc = await caseRef.get();

  if (!caseDoc.exists) {
    return null;
  }

  return caseDoc.data() as ModerationCase;
}

/**
 * Get moderation actions for a case
 */
export async function getCaseActions(
  caseId: string,
  limit: number = 50
): Promise<ModerationAction[]> {
  const actionsQuery = await db
    .collection('moderation_actions')
    .where('caseId', '==', caseId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return actionsQuery.docs.map(doc => doc.data() as ModerationAction);
}

// ============================================================================
// ENFORCEMENT CHECKS FOR INTEGRATIONS
// ============================================================================

/**
 * Check if user can appear in discovery feed
 */
export async function canAppearInDiscovery(userId: string): Promise<boolean> {
  const state = await getEnforcementState(userId);
  
  return (
    state.accountStatus === 'ACTIVE' &&
    state.visibilityStatus !== 'HIDDEN_FROM_ALL' &&
    state.visibilityStatus !== 'HIDDEN_FROM_DISCOVERY'
  );
}

/**
 * Check if user can appear in creator marketplace
 */
export async function canAppearInMarketplace(userId: string): Promise<boolean> {
  const state = await getEnforcementState(userId);
  
  return (
    state.accountStatus === 'ACTIVE' &&
    state.visibilityStatus !== 'HIDDEN_FROM_ALL' &&
    state.earningStatus === 'NORMAL'
  );
}

/**
 * Check if user can send messages
 */
export async function canSendMessage(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const state = await getEnforcementState(userId);
  
  // Check account status
  if (state.accountStatus === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'ACCOUNT_SUSPENDED',
    };
  }
  
  if (state.accountStatus === 'BANNED') {
    return {
      allowed: false,
      reason: 'ACCOUNT_BANNED',
    };
  }
  
  // Check messaging status
  if (state.messagingStatus === 'READ_ONLY') {
    return {
      allowed: false,
      reason: 'MESSAGING_READ_ONLY',
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can start new chat
 */
export async function canStartNewChat(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const state = await getEnforcementState(userId);
  
  // Check account status
  if (state.accountStatus === 'SUSPENDED' || state.accountStatus === 'BANNED') {
    return {
      allowed: false,
      reason: 'ACCOUNT_RESTRICTED',
    };
  }
  
  // Check messaging status
  if (state.messagingStatus === 'NO_NEW_CHATS' || state.messagingStatus === 'READ_ONLY') {
    return {
      allowed: false,
      reason: 'NO_NEW_CHATS',
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can earn from chat (combines Trust Engine + Enforcement)
 */
export async function canEarnFromChat(
  userId: string,
  trustEngineAllowed: boolean
): Promise<boolean> {
  const state = await getEnforcementState(userId);
  
  // Effective earn permission combines Trust Engine + Enforcement
  return trustEngineAllowed && state.earningStatus === 'NORMAL';
}

/**
 * Get effective enforcement restrictions for user
 * Used by mobile app to show appropriate UI
 */
export async function getEffectiveRestrictions(userId: string): Promise<{
  canSendMessages: boolean;
  canStartNewChats: boolean;
  canAppearInDiscovery: boolean;
  canAppearInMarketplace: boolean;
  accountStatus: AccountStatus;
  visibilityStatus: VisibilityStatus;
  messagingStatus: MessagingStatus;
  earningStatus: EarningStatus;
  reasons: string[];
}> {
  const state = await getEnforcementState(userId);
  const sendCheck = await canSendMessage(userId);
  const newChatCheck = await canStartNewChat(userId);
  const discoveryCheck = await canAppearInDiscovery(userId);
  const marketplaceCheck = await canAppearInMarketplace(userId);

  return {
    canSendMessages: sendCheck.allowed,
    canStartNewChats: newChatCheck.allowed,
    canAppearInDiscovery: discoveryCheck,
    canAppearInMarketplace: marketplaceCheck,
    accountStatus: state.accountStatus,
    visibilityStatus: state.visibilityStatus,
    messagingStatus: state.messagingStatus,
    earningStatus: state.earningStatus,
    reasons: state.reasons,
  };
}