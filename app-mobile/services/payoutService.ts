/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Mobile service for payout methods and requests
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  PayoutMethod,
  PayoutRequest,
  PayoutConfig,
  PayoutMethodFormData,
  GetPayoutMethodsResponse,
  GetPayoutRequestsResponse,
} from '../types/payouts';

const functions = getFunctions();

// ============================================================================
// PAYOUT METHODS
// ============================================================================

/**
 * Get payout configuration (public, no auth required)
 */
export async function getPayoutConfig(): Promise<PayoutConfig> {
  const getConfigFn = httpsCallable<void, PayoutConfig>(
    functions,
    'payout_getConfig_callable'
  );
  
  const result = await getConfigFn();
  return result.data;
}

/**
 * Get all payout methods for current user
 */
export async function getPayoutMethods(userId: string): Promise<PayoutMethod[]> {
  const getMethodsFn = httpsCallable<{ userId: string }, GetPayoutMethodsResponse>(
    functions,
    'payout_getMethods_callable'
  );
  
  const result = await getMethodsFn({ userId });
  return result.data.methods;
}

/**
 * Create a new payout method
 */
export async function createPayoutMethod(
  userId: string,
  payload: PayoutMethodFormData
): Promise<string> {
  const createMethodFn = httpsCallable<any, { methodId: string }>(
    functions,
    'payout_createOrUpdateMethod_callable'
  );
  
  const result = await createMethodFn({
    userId,
    ...payload,
  });
  
  return result.data.methodId;
}

/**
 * Update an existing payout method
 */
export async function updatePayoutMethod(
  userId: string,
  methodId: string,
  updates: Partial<PayoutMethodFormData>
): Promise<string> {
  const updateMethodFn = httpsCallable<any, { methodId: string }>(
    functions,
    'payout_createOrUpdateMethod_callable'
  );
  
  const result = await updateMethodFn({
    userId,
    methodId,
    ...updates,
  });
  
  return result.data.methodId;
}

/**
 * Delete a payout method
 */
export async function deletePayoutMethod(methodId: string): Promise<void> {
  const deleteMethodFn = httpsCallable<{ methodId: string }, { success: boolean }>(
    functions,
    'payout_deleteMethod_callable'
  );
  
  await deleteMethodFn({ methodId });
}

// ============================================================================
// PAYOUT REQUESTS
// ============================================================================

/**
 * Create a new payout request
 * This will immediately lock the requested tokens
 */
export async function createPayoutRequest(
  userId: string,
  methodId: string,
  requestedTokens: number
): Promise<string> {
  const createRequestFn = httpsCallable<
    { userId: string; methodId: string; requestedTokens: number },
    { requestId: string }
  >(functions, 'payout_createRequest_callable');
  
  const result = await createRequestFn({
    userId,
    methodId,
    requestedTokens,
  });
  
  return result.data.requestId;
}

/**
 * Get payout requests for current user
 */
export async function getPayoutRequests(
  userId: string,
  limit?: number,
  pageToken?: string
): Promise<GetPayoutRequestsResponse> {
  const getRequestsFn = httpsCallable<
    { userId: string; limit?: number; pageToken?: string },
    GetPayoutRequestsResponse
  >(functions, 'payout_getRequests_callable');
  
  const result = await getRequestsFn({
    userId,
    limit,
    pageToken,
  });
  
  return result.data;
}

// ============================================================================
// ADMIN FUNCTIONS (for future admin console)
// ============================================================================

/**
 * Update payout request status (admin only)
 */
export async function setPayoutStatus(
  requestId: string,
  newStatus: string,
  reviewerId: string,
  rejectionReason?: string,
  notes?: string
): Promise<void> {
  const setStatusFn = httpsCallable<any, { success: boolean }>(
    functions,
    'payout_setStatus_callable'
  );
  
  await setStatusFn({
    requestId,
    newStatus,
    reviewerId,
    rejectionReason,
    notes,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate fiat amount from tokens using current rate
 */
export async function calculateFiatAmount(tokens: number): Promise<number> {
  const config = await getPayoutConfig();
  return tokens * config.tokenToEurRate;
}

/**
 * Check if user has sufficient balance for payout
 */
export function canRequestPayout(
  availableTokens: number,
  requestedTokens: number,
  minPayoutTokens: number
): { canRequest: boolean; reason?: string } {
  if (requestedTokens < minPayoutTokens) {
    return {
      canRequest: false,
      reason: `Minimum payout is ${minPayoutTokens} tokens`,
    };
  }
  
  if (availableTokens < requestedTokens) {
    return {
      canRequest: false,
      reason: `Insufficient balance. Available: ${availableTokens} tokens`,
    };
  }
  
  return { canRequest: true };
}

/**
 * Validate payout method form data
 */
export function validatePayoutMethodData(
  data: PayoutMethodFormData
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  if (!data.displayName || data.displayName.trim().length < 3) {
    errors.displayName = 'Display name must be at least 3 characters';
  }
  
  if (data.type === 'BANK_TRANSFER') {
    const details = data.details as any;
    if (!details.iban) {
      errors.iban = 'IBAN is required';
    }
    if (!details.accountHolderName) {
      errors.accountHolderName = 'Account holder name is required';
    }
    if (!details.bankName) {
      errors.bankName = 'Bank name is required';
    }
    if (!details.country) {
      errors.country = 'Country is required';
    }
  } else if (data.type === 'WISE') {
    const details = data.details as any;
    if (!details.wiseProfileId) {
      errors.wiseProfileId = 'Wise profile ID is required';
    }
    if (!details.email) {
      errors.email = 'Email is required';
    }
  } else if (data.type === 'STRIPE_CONNECT') {
    const details = data.details as any;
    if (!details.stripeAccountId) {
      errors.stripeAccountId = 'Stripe account ID is required';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}