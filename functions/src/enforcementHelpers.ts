/**
 * PACK 87 — Enforcement & Account State Machine
 * Helper utilities for enforcement checks across the codebase
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { canUserPerformAction } from './enforcementEngine';
import { ActionCode } from './types/enforcement.types';

// ========================================================================
// ERROR CODES
// ========================================================================

export const ENFORCEMENT_ERROR_CODES = {
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  FEATURE_LOCKED: 'FEATURE_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

// ========================================================================
// PERMISSION CHECK WRAPPERS
// ========================================================================

/**
 * Check permission and throw error if not allowed
 * Use this in Cloud Functions to enforce restrictions
 */
export async function enforcePermission(userId: string, actionCode: ActionCode): Promise<void> {
  const result = await canUserPerformAction(userId, actionCode);

  if (!result.allowed) {
    // Map enforcement level to error code
    let errorCode: string = ENFORCEMENT_ERROR_CODES.ACCOUNT_RESTRICTED;
    let errorMessage = 'Your account is currently restricted from performing this action.';

    if (result.enforcementLevel === 'SUSPENDED') {
      errorCode = ENFORCEMENT_ERROR_CODES.ACCOUNT_SUSPENDED;
      errorMessage = 'Your account has been suspended. Please contact support.';
    } else if (result.message?.includes('locked')) {
      errorCode = ENFORCEMENT_ERROR_CODES.FEATURE_LOCKED;
      errorMessage = 'This feature is currently unavailable on your account.';
    }

    throw new HttpsError('permission-denied', errorMessage, {
      code: errorCode,
      reasonCodes: result.reasonCodes,
    });
  }
}

/**
 * Check if user can send messages
 */
export async function checkCanSendMessages(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_SEND_MESSAGE');
}

/**
 * Check if user can send gifts
 */
export async function checkCanSendGifts(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_SEND_GIFT');
}

/**
 * Check if user can send paid media
 */
export async function checkCanSendPaidMedia(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_SEND_PAID_MEDIA');
}

/**
 * Check if user can publish premium stories
 */
export async function checkCanPublishPremiumStories(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_PUBLISH_PREMIUM_STORY');
}

/**
 * Check if user can request payouts
 */
export async function checkCanRequestPayouts(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_REQUEST_PAYOUT');
}

/**
 * Check if user can access discovery
 */
export async function checkCanAccessDiscovery(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_ACCESS_DISCOVERY');
}

/**
 * Check if user can start voice calls
 */
export async function checkCanStartVoiceCalls(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_START_VOICE_CALL');
}

/**
 * Check if user can start video calls
 */
export async function checkCanStartVideoCalls(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_START_VIDEO_CALL');
}

/**
 * Check if user can send geoshare
 */
export async function checkCanSendGeoshare(userId: string): Promise<void> {
  await enforcePermission(userId, 'ACTION_SEND_GEOSHARE');
}

// ========================================================================
// NON-THROWING PERMISSION CHECKS
// ========================================================================

/**
 * Check permission without throwing (returns boolean)
 * Use this when you need to conditionally enable/disable features
 */
export async function hasPermission(userId: string, actionCode: ActionCode): Promise<boolean> {
  try {
    const result = await canUserPerformAction(userId, actionCode);
    return result.allowed;
  } catch (error) {
    console.error(`[Enforcement] Error checking permission for ${userId}:`, error);
    // Default to true if enforcement system fails
    return true;
  }
}

/**
 * Get permission status with details (non-throwing)
 */
export async function getPermissionStatus(userId: string, actionCode: ActionCode) {
  try {
    return await canUserPerformAction(userId, actionCode);
  } catch (error) {
    console.error(`[Enforcement] Error getting permission status for ${userId}:`, error);
    return {
      allowed: true,
      enforcementLevel: 'NONE' as const,
      reasonCodes: [],
      message: 'Permission check failed',
    };
  }
}

// ========================================================================
// ERROR HANDLING UTILITIES
// ========================================================================

/**
 * Check if an error is an enforcement error
 */
export function isEnforcementError(error: any): boolean {
  if (error instanceof HttpsError) {
    const details = error.details as any;
    return details?.code && Object.values(ENFORCEMENT_ERROR_CODES).includes(details.code);
  }
  return false;
}

/**
 * Extract enforcement error details
 */
export function getEnforcementErrorDetails(error: any): {
  code: string;
  message: string;
  reasonCodes: string[];
} | null {
  if (!isEnforcementError(error)) {
    return null;
  }

  const details = (error as HttpsError).details as any;
  return {
    code: details.code,
    message: error.message,
    reasonCodes: details.reasonCodes || [],
  };
}