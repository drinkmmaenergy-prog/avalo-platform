/**
 * PACK 87 — Enforcement & Account State Machine
 * Cloud Functions endpoints for enforcement operations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  recalculateEnforcementState,
  setManualEnforcementState,
  removeManualOverride,
  canUserPerformAction,
  getEnforcementState,
  initializeEnforcementState,
} from './enforcementEngine';
import {
  AccountStatus,
  FeatureCode,
  VisibilityTier,
  ReasonCode,
  ActionCode,
} from './types/enforcement.types';

// ========================================================================
// USER-FACING FUNCTIONS
// ========================================================================

/**
 * Get enforcement state for authenticated user
 * Returns sanitized data without internal flags
 */
export const enforcement_getState = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const userId = request.auth.uid;
    const state = await getEnforcementState(userId);

    if (!state) {
      // No enforcement state = new user = all allowed
      return {
        success: true,
        state: {
          accountStatus: 'ACTIVE',
          hasRestrictions: false,
          canSendMessages: true,
          canSendGifts: true,
          canSendPaidMedia: true,
          canPublishPremiumStories: true,
          canRequestPayouts: true,
          canAccessDiscovery: true,
          visibilityLevel: 'normal',
        },
      };
    }

    // Return sanitized state
    return {
      success: true,
      state: {
        accountStatus: state.accountStatus,
        hasRestrictions: state.accountStatus !== 'ACTIVE' || state.featureLocks.length > 0,
        canSendMessages: !state.featureLocks.includes('SEND_MESSAGES'),
        canSendGifts: !state.featureLocks.includes('SEND_GIFTS'),
        canSendPaidMedia: !state.featureLocks.includes('SEND_PAID_MEDIA'),
        canPublishPremiumStories: !state.featureLocks.includes('PUBLISH_PREMIUM_STORIES'),
        canRequestPayouts: !state.featureLocks.includes('REQUEST_PAYOUTS'),
        canAccessDiscovery: !state.featureLocks.includes('ACCESS_DISCOVERY_FEED'),
        visibilityLevel: state.visibilityTier.toLowerCase(),
        lastUpdatedAt: state.lastUpdatedAt,
      },
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_getState:', error);
    throw new HttpsError('internal', 'Failed to get enforcement state');
  }
});

// ========================================================================
// ADMIN FUNCTIONS
// ========================================================================

/**
 * Manually set enforcement state (admin only)
 */
export const enforcement_admin_setManualState = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin permissions
  if (!request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, accountStatus, featureLocks, visibilityTier, reasonCodes, reviewNote } = request.data;

  // Validate required fields
  if (!userId || !accountStatus || !reviewNote) {
    throw new HttpsError('invalid-argument', 'Missing required fields: userId, accountStatus, reviewNote');
  }

  // Validate account status
  const validStatuses: AccountStatus[] = ['ACTIVE', 'SOFT_RESTRICTED', 'HARD_RESTRICTED', 'SUSPENDED'];
  if (!validStatuses.includes(accountStatus)) {
    throw new HttpsError('invalid-argument', `Invalid accountStatus. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    await setManualEnforcementState(userId, {
      accountStatus: accountStatus as AccountStatus,
      featureLocks: featureLocks as FeatureCode[] | undefined,
      visibilityTier: visibilityTier as VisibilityTier | undefined,
      reasonCodes: reasonCodes as ReasonCode[] | undefined,
      reviewerId: request.auth.uid,
      reviewNote,
    });

    return {
      success: true,
      message: 'Manual enforcement state applied',
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_admin_setManualState:', error);
    throw new HttpsError('internal', 'Failed to set manual enforcement state');
  }
});

/**
 * Remove manual override (admin only)
 */
export const enforcement_admin_removeOverride = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin permissions
  if (!request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError('invalid-argument', 'Missing required field: userId');
  }

  try {
    await removeManualOverride(userId);

    return {
      success: true,
      message: 'Manual override removed, automatic enforcement restored',
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_admin_removeOverride:', error);
    throw new HttpsError('internal', 'Failed to remove manual override');
  }
});

/**
 * Manually trigger enforcement recalculation (admin only)
 */
export const enforcement_admin_recalculate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin permissions
  if (!request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError('invalid-argument', 'Missing required field: userId');
  }

  try {
    await recalculateEnforcementState(userId);

    return {
      success: true,
      message: 'Enforcement state recalculated',
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_admin_recalculate:', error);
    throw new HttpsError('internal', 'Failed to recalculate enforcement state');
  }
});

/**
 * Get full enforcement state (admin only)
 */
export const enforcement_admin_getFullState = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check admin permissions
  if (!request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError('invalid-argument', 'Missing required field: userId');
  }

  try {
    const state = await getEnforcementState(userId);

    if (!state) {
      return {
        success: true,
        state: null,
        message: 'No enforcement state found for user',
      };
    }

    return {
      success: true,
      state,
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_admin_getFullState:', error);
    throw new HttpsError('internal', 'Failed to get enforcement state');
  }
});

// ========================================================================
// INTERNAL FUNCTIONS (callable by other backend services)
// ========================================================================

/**
 * Check if user can perform action
 * Used by other Cloud Functions to enforce restrictions
 */
export const enforcement_checkPermission = onCall(async (request) => {
  // This function can be called from backend services without user auth
  // The userId is passed in the request data
  const { userId, actionCode } = request.data;

  if (!userId || !actionCode) {
    throw new HttpsError('invalid-argument', 'Missing required fields: userId, actionCode');
  }

  try {
    const result = await canUserPerformAction(userId, actionCode as ActionCode);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_checkPermission:', error);
    throw new HttpsError('internal', 'Failed to check permission');
  }
});

/**
 * Initialize enforcement state for new user
 * Called during user registration
 */
export const enforcement_initialize = onCall(async (request) => {
  // Can be called from backend during user creation
  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError('invalid-argument', 'Missing required field: userId');
  }

  try {
    await initializeEnforcementState(userId);

    return {
      success: true,
      message: 'Enforcement state initialized',
    };
  } catch (error) {
    console.error('[Enforcement] Error in enforcement_initialize:', error);
    throw new HttpsError('internal', 'Failed to initialize enforcement state');
  }
});