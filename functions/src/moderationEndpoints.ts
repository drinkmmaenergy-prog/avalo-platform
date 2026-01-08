/**
 * PACK 54 - Moderation API Endpoints
 * Admin-only endpoints for case management and enforcement actions
 * Public endpoint for reading enforcement state
 */

import * as functions from 'firebase-functions';
import {
  getEnforcementState,
  applyEnforcement,
  updateModerationCase,
  getModerationCase,
  getCaseActions,
  getEffectiveRestrictions,
} from './moderationEngine';
import {
  EnforcementStateInput,
  ModerationCaseUpdate,
} from './moderationTypes';

// ============================================================================
// ADMIN-ONLY ENDPOINTS
// ============================================================================

/**
 * Update moderation case (admin-only)
 * POST /moderation/case/update
 */
export const moderation_updateCase = functions.https.onCall(async (data, context) => {
  // TODO: Add proper admin authentication check
  // For now, require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }

  const { caseId, status, severity, assignedModeratorId } = data;

  if (!caseId) {
    throw new functions.https.HttpsError('invalid-argument', 'caseId is required');
  }

  try {
    const updates: ModerationCaseUpdate = {};
    if (status) updates.status = status;
    if (severity) updates.severity = severity;
    if (assignedModeratorId !== undefined) updates.assignedModeratorId = assignedModeratorId;

    const result = await updateModerationCase(caseId, updates);

    return {
      success: result.success,
      caseId,
    };
  } catch (error: any) {
    console.error('Error updating moderation case:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Apply enforcement action (admin-only)
 * POST /moderation/enforce
 */
export const moderation_enforce = functions.https.onCall(async (data, context) => {
  // TODO: Add proper admin authentication check
  // For now, require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }

  const {
    targetUserId,
    performedBy,
    accountStatus,
    visibilityStatus,
    messagingStatus,
    earningStatus,
    reasons,
    notes,
    caseId,
  } = data;

  if (!targetUserId || !performedBy) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'targetUserId and performedBy are required'
    );
  }

  try {
    const updates: EnforcementStateInput = {};
    if (accountStatus) updates.accountStatus = accountStatus;
    if (visibilityStatus) updates.visibilityStatus = visibilityStatus;
    if (messagingStatus) updates.messagingStatus = messagingStatus;
    if (earningStatus) updates.earningStatus = earningStatus;
    if (reasons) updates.reasons = reasons;
    if (notes) updates.notes = notes;

    const result = await applyEnforcement(targetUserId, performedBy, updates, caseId);

    return {
      success: result.success,
      enforcementState: result.enforcementState,
    };
  } catch (error: any) {
    console.error('Error applying enforcement:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get moderation case details (admin-only)
 */
export const moderation_getCase = functions.https.onCall(async (data, context) => {
  // TODO: Add proper admin authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }

  const { caseId } = data;

  if (!caseId) {
    throw new functions.https.HttpsError('invalid-argument', 'caseId is required');
  }

  try {
    const caseData = await getModerationCase(caseId);

    if (!caseData) {
      throw new functions.https.HttpsError('not-found', 'Case not found');
    }

    return {
      success: true,
      case: caseData,
    };
  } catch (error: any) {
    console.error('Error getting moderation case:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get moderation actions for a case (admin-only)
 */
export const moderation_getCaseActions = functions.https.onCall(async (data, context) => {
  // TODO: Add proper admin authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }

  const { caseId, limit } = data;

  if (!caseId) {
    throw new functions.https.HttpsError('invalid-argument', 'caseId is required');
  }

  try {
    const actions = await getCaseActions(caseId, limit || 50);

    return {
      success: true,
      actions,
    };
  } catch (error: any) {
    console.error('Error getting case actions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

/**
 * Get enforcement state for a user (read-only)
 * GET /enforcement/state?userId=...
 */
export const enforcement_getState = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const state = await getEnforcementState(userId);

    return {
      userId: state.userId,
      accountStatus: state.accountStatus,
      visibilityStatus: state.visibilityStatus,
      messagingStatus: state.messagingStatus,
      earningStatus: state.earningStatus,
      reasons: state.reasons,
    };
  } catch (error: any) {
    console.error('Error getting enforcement state:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get effective enforcement restrictions for current user
 * Includes computed flags for what user can/cannot do
 */
export const enforcement_getRestrictions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const restrictions = await getEffectiveRestrictions(userId);

    return {
      success: true,
      restrictions,
    };
  } catch (error: any) {
    console.error('Error getting enforcement restrictions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});