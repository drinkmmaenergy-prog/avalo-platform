/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Integration Helpers for Existing Modules
 * 
 * This file provides ready-to-use integration points for existing Cloud Functions
 * to add step-up verification to sensitive operations.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { evaluateStepUpRequirement } from './pack96-twoFactorEngine';
import { SensitiveAction } from './types/twoFactor.types';

// ============================================================================
// Step-Up Enforcement Helpers
// ============================================================================

/**
 * Enforce step-up verification for a sensitive action
 * Throws HttpsError if step-up is required but not completed
 * 
 * Usage in existing Cloud Functions:
 * ```typescript
 * import { enforceStepUpForAction } from './pack96-twoFactorIntegrations';
 * 
 * export const createPayoutRequest = onCall(async (request) => {
 *   await enforceStepUpForAction(request.auth?.uid, 'PAYOUT_REQUEST_CREATE');
 *   // ... rest of function
 * });
 * ```
 */
export async function enforceStepUpForAction(
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
        'Additional verification required for this action',
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
    
    // Log other errors but don't block the operation
    console.warn('[2FA Integration] Error checking step-up requirement:', error);
    // Optionally: throw new HttpsError('internal', 'Security verification failed');
  }
}

/**
 * Check if step-up is required (non-throwing version)
 * Returns boolean instead of throwing error
 * 
 * Usage:
 * ```typescript
 * const requiresStepUp = await checkIfStepUpRequired(userId, 'PAYOUT_REQUEST_CREATE');
 * if (requiresStepUp) {
 *   return { requiresVerification: true };
 * }
 * ```
 */
export async function checkIfStepUpRequired(
  userId: string,
  action: SensitiveAction
): Promise<boolean> {
  try {
    const result = await evaluateStepUpRequirement(userId, action);
    return result.requirement === 'REQUIRED';
  } catch (error) {
    console.warn('[2FA Integration] Error checking step-up requirement:', error);
    // Fail-safe: assume step-up required on error
    return true;
  }
}

// ============================================================================
// Specific Action Helpers
// ============================================================================

/**
 * Payout Method Creation/Update
 * Add to: functions/src/payoutRequests.ts - payout_createOrUpdateMethod_callable
 */
export async function enforceStepUpForPayoutMethod(
  userId: string,
  isUpdate: boolean = false
): Promise<void> {
  const action: SensitiveAction = isUpdate 
    ? 'PAYOUT_METHOD_UPDATE' 
    : 'PAYOUT_METHOD_CREATE';
  
  await enforceStepUpForAction(userId, action);
}

/**
 * Payout Request Creation
 * Add to: functions/src/payoutRequests.ts - payout_createRequest_callable
 */
export async function enforceStepUpForPayoutRequest(userId: string): Promise<void> {
  await enforceStepUpForAction(userId, 'PAYOUT_REQUEST_CREATE');
}

/**
 * KYC Submission
 * Add to: functions/src/kyc.ts - kyc_submitApplication_callable
 */
export async function enforceStepUpForKYC(userId: string): Promise<void> {
  await enforceStepUpForAction(userId, 'KYC_SUBMIT');
}

/**
 * Logout All Sessions
 * Add to: functions/src/pack95-session-security.ts - sessionSecurity_logoutAllSessions
 */
export async function enforceStepUpForLogoutAll(userId: string): Promise<void> {
  await enforceStepUpForAction(userId, 'LOGOUT_ALL_SESSIONS');
}

/**
 * Account Deletion
 * Add to account deletion endpoint (if exists)
 */
export async function enforceStepUpForAccountDeletion(userId: string): Promise<void> {
  await enforceStepUpForAction(userId, 'ACCOUNT_DELETION');
}

/**
 * Enable "Earn from Chat" (if high risk)
 * Add to chat monetization settings
 */
export async function enforceStepUpForEarnEnable(userId: string): Promise<void> {
  await enforceStepUpForAction(userId, 'EARN_ENABLE');
}

// ============================================================================
// Integration Examples
// ============================================================================

/**
 * Example 1: Payout Request with Step-Up
 * 
 * Before (without step-up):
 * ```typescript
 * export const payout_createRequest_callable = onCall(async (request) => {
 *   const userId = request.auth?.uid;
 *   if (!userId) throw new HttpsError('unauthenticated', 'Not authenticated');
 *   
 *   // Create payout request...
 *   return { success: true };
 * });
 * ```
 * 
 * After (with step-up):
 * ```typescript
 * import { enforceStepUpForPayoutRequest } from './pack96-twoFactorIntegrations';
 * 
 * export const payout_createRequest_callable = onCall(async (request) => {
 *   const userId = request.auth?.uid;
 *   if (!userId) throw new HttpsError('unauthenticated', 'Not authenticated');
 *   
 *   // Add step-up enforcement
 *   await enforceStepUpForPayoutRequest(userId);
 *   
 *   // Create payout request...
 *   return { success: true };
 * });
 * ```
 */

/**
 * Example 2: KYC Submission with Step-Up
 * 
 * ```typescript
 * import { enforceStepUpForKYC } from './pack96-twoFactorIntegrations';
 * 
 * export const kyc_submitApplication_callable = onCall(async (request) => {
 *   const userId = request.auth?.uid;
 *   if (!userId) throw new HttpsError('unauthenticated', 'Not authenticated');
 *   
 *   // Add step-up enforcement
 *   await enforceStepUpForKYC(userId);
 *   
 *   // Process KYC submission...
 *   return { success: true };
 * });
 * ```
 */

/**
 * Example 3: Conditional Step-Up Check
 * 
 * ```typescript
 * import { checkIfStepUpRequired } from './pack96-twoFactorIntegrations';
 * 
 * export const getPayoutAvailability = onCall(async (request) => {
 *   const userId = request.auth?.uid;
 *   if (!userId) throw new HttpsError('unauthenticated', 'Not authenticated');
 *   
 *   const requiresStepUp = await checkIfStepUpRequired(userId, 'PAYOUT_REQUEST_CREATE');
 *   
 *   return {
 *     canRequestPayout: true,
 *     requiresAdditionalVerification: requiresStepUp,
 *   };
 * });
 * ```
 */

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if error is a step-up requirement error
 */
export function isStepUpRequiredError(error: any): boolean {
  return (
    error instanceof HttpsError &&
    error.code === 'failed-precondition' &&
    (error.details as any)?.code === 'STEP_UP_REQUIRED'
  );
}

/**
 * Extract action from step-up error
 */
export function getActionFromStepUpError(error: any): SensitiveAction | null {
  if (!isStepUpRequiredError(error)) {
    return null;
  }
  
  return (error.details as any)?.action || null;
}

/**
 * Extract reason codes from step-up error
 */
export function getReasonCodesFromStepUpError(error: any): string[] {
  if (!isStepUpRequiredError(error)) {
    return [];
  }
  
  return (error.details as any)?.reasonCodes || [];
}