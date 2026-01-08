/**
 * PACK 420 — Account Lifecycle Guard
 * 
 * Enforcement layer to gate features based on account lifecycle state.
 * Integrates with PACK 419 (Enforcement) for comprehensive access control.
 */

import * as admin from 'firebase-admin';
import {
  AccountLifecycleState,
  GatedFeature,
  LifecycleCheckResult,
  DataRightsError,
  DataRightsErrorCode,
} from '../../shared/types/pack420-data-rights.types';

const db = admin.firestore();

/**
 * Feature-to-lifecycle state access matrix
 * Defines which features are accessible in each lifecycle state
 */
const FEATURE_ACCESS_MATRIX: Record<GatedFeature, AccountLifecycleState[]> = {
  // Discovery and matching (only ACTIVE users)
  DISCOVERY: [AccountLifecycleState.ACTIVE],
  SWIPE: [AccountLifecycleState.ACTIVE],
  
  // Communication (only ACTIVE users)
  CHAT: [AccountLifecycleState.ACTIVE],
  CALLS: [AccountLifecycleState.ACTIVE],
  
  // Meetings and events (only ACTIVE users)
  MEETINGS: [AccountLifecycleState.ACTIVE],
  EVENTS: [AccountLifecycleState.ACTIVE],
  
  // Monetization features (only ACTIVE users)
  EARN: [AccountLifecycleState.ACTIVE],
  WITHDRAW: [AccountLifecycleState.ACTIVE],
  
  // Content creation (only ACTIVE users)
  POST: [AccountLifecycleState.ACTIVE],
  AI_COMPANIONS: [AccountLifecycleState.ACTIVE],
};

/**
 * Features that remain accessible even when account is frozen or pending deletion
 * These are typically read-only or support-related features
 */
const ALWAYS_ACCESSIBLE_FEATURES = [
  'VIEW_PROFILE',       // Can view own profile
  'VIEW_WALLET',        // Can view transaction history
  'VIEW_SUPPORT',       // Can access help center
  'VIEW_ENFORCEMENT',   // Can view enforcement actions/appeals
  'VIEW_DATA_RIGHTS',   // Can view data rights requests
];

/**
 * Check if user's lifecycle state allows using a specific feature
 * 
 * @param userId - User ID to check
 * @param feature - Feature to check access for
 * @returns LifecycleCheckResult with access decision and reason
 */
export async function checkUserCanUseFeature(
  userId: string,
  feature: GatedFeature
): Promise<LifecycleCheckResult> {
  // Fetch user document
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return {
      allowed: false,
      reason: 'User not found',
      lifecycleState: AccountLifecycleState.DELETED,
    };
  }

  const userData = userDoc.data();
  const lifecycleState = userData?.lifecycleState || AccountLifecycleState.ACTIVE;

  // DELETED users cannot access anything
  if (lifecycleState === AccountLifecycleState.DELETED) {
    return {
      allowed: false,
      reason: 'Account has been deleted',
      lifecycleState,
    };
  }

  // Check feature access matrix
  const allowedStates = FEATURE_ACCESS_MATRIX[feature];
  
  if (!allowedStates) {
    // Feature not in matrix - allow by default (likely read-only feature)
    return {
      allowed: true,
      lifecycleState,
    };
  }

  if (allowedStates.includes(lifecycleState)) {
    return {
      allowed: true,
      lifecycleState,
    };
  }

  // Access denied - provide specific reason
  let reason = 'Feature not available';
  
  if (lifecycleState === AccountLifecycleState.SOFT_FROZEN) {
    reason = 'Account is temporarily restricted due to a safety review';
  } else if (lifecycleState === AccountLifecycleState.PENDING_DELETION) {
    reason = 'Account is scheduled for deletion';
  }

  return {
    allowed: false,
    reason,
    lifecycleState,
  };
}

/**
 * Assert that user can use a feature, throwing an error if not
 * Use this in API endpoints as a guard
 * 
 * @param userId - User ID to check
 * @param feature - Feature to check access for
 * @throws DataRightsError if access is denied
 */
export async function assertUserCanUseFeature(
  userId: string,
  feature: GatedFeature
): Promise<void> {
  const result = await checkUserCanUseFeature(userId, feature);
  
  if (!result.allowed) {
    // Map lifecycle state to specific error code
    let errorCode: DataRightsErrorCode;
    
    switch (result.lifecycleState) {
      case AccountLifecycleState.DELETED:
        errorCode = DataRightsErrorCode.ACCOUNT_DELETED;
        break;
      case AccountLifecycleState.PENDING_DELETION:
        errorCode = DataRightsErrorCode.ACCOUNT_PENDING_DELETION;
        break;
      case AccountLifecycleState.SOFT_FROZEN:
        errorCode = DataRightsErrorCode.ACCOUNT_FROZEN;
        break;
      default:
        errorCode = DataRightsErrorCode.UNAUTHORIZED;
    }
    
    throw new DataRightsError(
      errorCode,
      result.reason || 'Access denied',
      { feature, lifecycleState: result.lifecycleState }
    );
  }

  // If lifecycle check passes, optionally check PACK 419 enforcement
  // TODO: Integrate with PACK 419 enforcement service
  // await checkEnforcementRestrictions(userId, feature);
}

/**
 * Get user's current lifecycle state
 * 
 * @param userId - User ID
 * @returns AccountLifecycleState or null if user not found
 */
export async function getUserLifecycleState(
  userId: string
): Promise<AccountLifecycleState | null> {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return null;
  }

  return userDoc.data()?.lifecycleState || AccountLifecycleState.ACTIVE;
}

/**
 * Update user's lifecycle state (admin/system only)
 * 
 * @param userId - User ID
 * @param newState - New lifecycle state
 * @param reason - Reason for state change
 * @param actorId - ID of admin/system making the change
 */
export async function updateUserLifecycleState(
  userId: string,
  newState: AccountLifecycleState,
  reason: string | null,
  actorId: string
): Promise<void> {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.USER_NOT_FOUND,
      `User ${userId} not found`
    );
  }

  const oldState = userDoc.data()?.lifecycleState || AccountLifecycleState.ACTIVE;
  const now = Date.now();

  await userRef.update({
    lifecycleState: newState,
    lifecycleStateUpdatedAt: now,
    lifecycleStateReason: reason,
  });

  // Log state change
  console.log(`User lifecycle state changed: ${userId} ${oldState} -> ${newState} by ${actorId}`);
  
  // TODO: Log via PACK 296 audit service
  // await logAuditEvent({
  //   eventType: 'LIFECYCLE_STATE_CHANGED',
  //   actorId,
  //   targetId: userId,
  //   targetType: 'USER',
  //   metadata: { oldState, newState, reason },
  // });
}

/**
 * Check if user is in a restricted state (any state other than ACTIVE)
 * 
 * @param userId - User ID
 * @returns boolean indicating if user is restricted
 */
export async function isUserRestricted(userId: string): Promise<boolean> {
  const state = await getUserLifecycleState(userId);
  return state !== null && state !== AccountLifecycleState.ACTIVE;
}

/**
 * Batch check if multiple users can access a feature
 * Useful for filtering lists/feeds
 * 
 * @param userIds - Array of user IDs to check
 * @param feature - Feature to check access for
 * @returns Map of userId to boolean (true if allowed)
 */
export async function batchCheckFeatureAccess(
  userIds: string[],
  feature: GatedFeature
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  if (userIds.length === 0) {
    return results;
  }

  // Batch fetch user documents
  const userDocs = await db.getAll(
    ...userIds.map(id => db.collection('users').doc(id))
  );

  const allowedStates = FEATURE_ACCESS_MATRIX[feature];
  
  for (let i = 0; i < userDocs.length; i++) {
    const doc = userDocs[i];
    const userId = userIds[i];
    
    if (!doc.exists) {
      results.set(userId, false);
      continue;
    }

    const lifecycleState = doc.data()?.lifecycleState || AccountLifecycleState.ACTIVE;
    
    // DELETED users are always denied
    if (lifecycleState === AccountLifecycleState.DELETED) {
      results.set(userId, false);
      continue;
    }

    // If no access matrix defined, allow by default
    if (!allowedStates) {
      results.set(userId, true);
      continue;
    }

    results.set(userId, allowedStates.includes(lifecycleState));
  }

  return results;
}

/**
 * Middleware wrapper for Cloud Functions/Express routes
 * Usage: app.post('/api/chat/send', withLifecycleGuard('CHAT'), handler)
 */
export function withLifecycleGuard(feature: GatedFeature) {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.auth?.uid || req.user?.uid;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await assertUserCanUseFeature(userId, feature);
      next();
    } catch (error) {
      if (error instanceof DataRightsError) {
        const statusCode = error.code === DataRightsErrorCode.UNAUTHORIZED ? 401 : 403;
        return res.status(statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }
      
      console.error('Lifecycle guard error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
