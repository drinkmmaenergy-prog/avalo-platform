/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Cloud Functions Endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  initiateStepUpChallenge,
  verifyStepUpChallenge,
  enable2FA,
  disable2FA,
  get2FASettings,
  evaluateStepUpRequirement,
} from './pack96-twoFactorEngine';
import {
  Enable2FARequest,
  Disable2FARequest,
  InitiateStepUpChallengeRequest,
  VerifyStepUpChallengeRequest,
  SensitiveAction,
} from './types/twoFactor.types';

// ============================================================================
// User-Facing Functions
// ============================================================================

/**
 * Get user's 2FA settings
 */
export const twoFactor_getSettings_callable = onCall(async (request) => {
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const settings = await get2FASettings(userId);
    
    return {
      success: true,
      settings,
    };
  } catch (error: any) {
    console.error('[2FA] Error getting settings:', error);
    throw new HttpsError('internal', error.message || 'Failed to get 2FA settings');
  }
});

/**
 * Enable 2FA for the authenticated user
 */
export const twoFactor_enable_callable = onCall<Enable2FARequest>(async (request) => {
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { method, deliveryAddress } = request.data;
  
  if (!method || !deliveryAddress) {
    throw new HttpsError('invalid-argument', 'Method and delivery address required');
  }
  
  if (method !== 'EMAIL_OTP') {
    throw new HttpsError('invalid-argument', 'Only EMAIL_OTP method supported in v1');
  }
  
  try {
    await enable2FA(userId, method, deliveryAddress);
    
    return {
      success: true,
      message: 'Two-factor authentication enabled successfully',
    };
  } catch (error: any) {
    console.error('[2FA] Error enabling 2FA:', error);
    throw new HttpsError('internal', error.message || 'Failed to enable 2FA');
  }
});

/**
 * Disable 2FA for the authenticated user
 * Note: This endpoint should only be called AFTER step-up verification
 */
export const twoFactor_disable_callable = onCall<Disable2FARequest>(async (request) => {
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    await disable2FA(userId);
    
    return {
      success: true,
      message: 'Two-factor authentication disabled successfully',
    };
  } catch (error: any) {
    console.error('[2FA] Error disabling 2FA:', error);
    throw new HttpsError('internal', error.message || 'Failed to disable 2FA');
  }
});

/**
 * Initiate a step-up challenge for a sensitive action
 */
export const twoFactor_initiateChallenge_callable = onCall<InitiateStepUpChallengeRequest>(
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { action } = request.data;
    
    if (!action) {
      throw new HttpsError('invalid-argument', 'Action is required');
    }
    
    // Validate action is a valid SensitiveAction
    const validActions: SensitiveAction[] = [
      'PAYOUT_METHOD_CREATE',
      'PAYOUT_METHOD_UPDATE',
      'PAYOUT_REQUEST_CREATE',
      'KYC_SUBMIT',
      'PASSWORD_CHANGE',
      'EMAIL_CHANGE',
      'LOGOUT_ALL_SESSIONS',
      'ACCOUNT_DELETION',
      'EARN_ENABLE',
      '2FA_DISABLE',
    ];
    
    if (!validActions.includes(action as SensitiveAction)) {
      throw new HttpsError('invalid-argument', 'Invalid action type');
    }
    
    try {
      // Get session and device info from request context if available
      const sessionId = request.rawRequest.headers['x-session-id'] as string | undefined;
      const deviceId = request.rawRequest.headers['x-device-id'] as string | undefined;
      
      const result = await initiateStepUpChallenge(
        userId,
        action as SensitiveAction,
        sessionId,
        deviceId
      );
      
      return result;
    } catch (error: any) {
      console.error('[2FA] Error initiating challenge:', error);
      throw new HttpsError('internal', error.message || 'Failed to initiate verification');
    }
  }
);

/**
 * Verify a step-up challenge with the provided code
 */
export const twoFactor_verifyChallenge_callable = onCall<VerifyStepUpChallengeRequest>(
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { challengeId, code } = request.data;
    
    if (!challengeId || !code) {
      throw new HttpsError('invalid-argument', 'Challenge ID and code are required');
    }
    
    try {
      const result = await verifyStepUpChallenge(userId, challengeId, code);
      
      if (!result.success) {
        throw new HttpsError('invalid-argument', result.message || 'Invalid verification code');
      }
      
      return result;
    } catch (error: any) {
      console.error('[2FA] Error verifying challenge:', error);
      
      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to verify code');
    }
  }
);

// ============================================================================
// Internal/Helper Functions (for use by other Cloud Functions)
// ============================================================================

/**
 * Check if step-up verification is required for an action
 * This is meant to be called by other Cloud Functions to check requirements
 */
export const twoFactor_checkRequirement_callable = onCall<{ action: SensitiveAction }>(
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { action } = request.data;
    
    if (!action) {
      throw new HttpsError('invalid-argument', 'Action is required');
    }
    
    try {
      const result = await evaluateStepUpRequirement(userId, action);
      
      return {
        success: true,
        requirement: result.requirement,
        reasonCodes: result.reasonCodes,
      };
    } catch (error: any) {
      console.error('[2FA] Error checking requirement:', error);
      throw new HttpsError('internal', error.message || 'Failed to check requirement');
    }
  }
);

// ============================================================================
// Helper function for other Cloud Functions to use
// ============================================================================

/**
 * Helper function to enforce step-up verification in other Cloud Functions
 * Usage:
 * 
 * import { requireStepUpVerification } from './pack96-twoFactorEndpoints';
 * 
 * export const myFunction = onCall(async (request) => {
 *   await requireStepUpVerification(request.auth?.uid, 'PAYOUT_REQUEST_CREATE');
 *   // ... rest of function
 * });
 */
export async function requireStepUpVerification(
  userId: string | undefined,
  action: SensitiveAction
): Promise<void> {
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const result = await evaluateStepUpRequirement(userId, action);
    
    if (result.requirement === 'REQUIRED') {
      throw new HttpsError(
        'failed-precondition',
        'Step-up verification required',
        {
          code: 'STEP_UP_REQUIRED',
          action,
          reasonCodes: result.reasonCodes,
        }
      );
    }
  } catch (error: any) {
    // If it's already our custom error, re-throw
    if (error instanceof HttpsError && error.code === 'failed-precondition') {
      throw error;
    }
    
    // Otherwise log and throw generic error
    console.error('[2FA] Error checking step-up requirement:', error);
    throw new HttpsError('internal', 'Failed to verify security requirements');
  }
}

/**
 * Helper function to check if a valid challenge exists for a recent action
 * This can be used to verify that step-up was completed before allowing an action
 */
export async function hasValidRecentChallenge(
  userId: string,
  action: SensitiveAction,
  maxAgeMinutes: number = 5
): Promise<boolean> {
  try {
    const { getFirestore, Timestamp } = require('firebase-admin/firestore');
    const db = getFirestore();
    
    const cutoffTime = Timestamp.fromMillis(
      Timestamp.now().toMillis() - (maxAgeMinutes * 60 * 1000)
    );
    
    const challengesSnapshot = await db
      .collection('user_2fa_challenges')
      .where('userId', '==', userId)
      .where('action', '==', action)
      .where('resolved', '==', true)
      .where('result', '==', 'SUCCESS')
      .where('resolvedAt', '>=', cutoffTime)
      .limit(1)
      .get();
    
    return !challengesSnapshot.empty;
  } catch (error) {
    console.error('[2FA] Error checking recent challenge:', error);
    return false;
  }
}