/**
 * PACK 128 - Treasury Service (Mobile)
 * Client-side service for treasury operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  WalletBalance,
  LedgerEntryDisplay,
  PayoutSafetyCheck,
} from '../types/treasury';

// ============================================================================
// BALANCE OPERATIONS
// ============================================================================

/**
 * Get user token balance
 */
export async function getUserBalance(userId: string): Promise<WalletBalance> {
  try {
    const getUserBalanceFn = httpsCallable(functions, 'treasury_getUserBalance');
    const result = await getUserBalanceFn({ userId });
    return result.data as WalletBalance;
  } catch (error) {
    console.error('Failed to get user balance:', error);
    throw error;
  }
}

/**
 * Get creator earnings balance
 */
export async function getCreatorBalance(userId: string): Promise<WalletBalance> {
  try {
    const getCreatorBalanceFn = httpsCallable(functions, 'treasury_getCreatorBalance');
    const result = await getCreatorBalanceFn({ userId });
    return result.data as WalletBalance;
  } catch (error) {
    console.error('Failed to get creator balance:', error);
    throw error;
  }
}

// ============================================================================
// LEDGER OPERATIONS
// ============================================================================

/**
 * Get user's recent transactions
 */
export async function getUserLedger(
  userId: string,
  limit: number = 50
): Promise<LedgerEntryDisplay[]> {
  try {
    // This would be a Firestore query or callable function
    // For now, returning empty array - implement based on your needs
    return [];
  } catch (error) {
    console.error('Failed to get user ledger:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUT OPERATIONS
// ============================================================================

/**
 * Check payout eligibility before requesting
 */
export async function checkPayoutEligibility(
  userId: string,
  methodId: string,
  tokenAmount: number
): Promise<PayoutSafetyCheck> {
  try {
    const checkEligibilityFn = httpsCallable(functions, 'treasury_checkPayoutEligibility');
    const result = await checkEligibilityFn({
      userId,
      methodId,
      tokenAmount,
    });
    return result.data as PayoutSafetyCheck;
  } catch (error) {
    console.error('Failed to check payout eligibility:', error);
    throw error;
  }
}

/**
 * Request payout with safety checks
 */
export async function requestPayout(
  userId: string,
  methodId: string,
  tokenAmount: number
): Promise<{
  success: boolean;
  payoutRequestId?: string;
  safetyCheck: PayoutSafetyCheck;
  message: string;
}> {
  try {
    const requestPayoutFn = httpsCallable(functions, 'treasury_requestPayout');
    const result = await requestPayoutFn({
      userId,
      methodId,
      tokenAmount,
    });
    return result.data as any;
  } catch (error) {
    console.error('Failed to request payout:', error);
    throw error;
  }
}

// ============================================================================
// REFUND OPERATIONS
// ============================================================================

/**
 * Request refund for a transaction
 * NOTE: This is admin-only or heavily restricted
 */
export async function requestRefund(
  transactionId: string,
  reason: string
): Promise<{
  success: boolean;
  refunded: boolean;
  status: string;
  reason: string;
}> {
  try {
    const refundFn = httpsCallable(functions, 'treasury_refundTransaction');
    const result = await refundFn({
      transactionId,
      reason,
    });
    return result.data as any;
  } catch (error) {
    console.error('Failed to request refund:', error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format token amount for display
 */
export function formatTokens(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Convert tokens to fiat (simplified - use actual rate from config)
 */
export function tokensToFiat(tokens: number, rate: number = 0.20): string {
  const fiatAmount = tokens * rate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(fiatAmount);
}

/**
 * Validate payout amount
 */
export function validatePayoutAmount(
  amount: number,
  availableBalance: number,
  minPayout: number = 5000
): { valid: boolean; error?: string } {
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (amount < minPayout) {
    return {
      valid: false,
      error: `Minimum payout is ${formatTokens(minPayout)} tokens`,
    };
  }

  if (amount > availableBalance) {
    return { valid: false, error: 'Insufficient balance' };
  }

  return { valid: true };
}

/**
 * Get user-friendly error message
 */
export function getTreasuryErrorMessage(error: any): string {
  if (error?.code === 'unauthenticated') {
    return 'Please sign in to continue';
  }

  if (error?.code === 'permission-denied') {
    return 'You do not have permission to perform this action';
  }

  if (error?.code === 'failed-precondition') {
    return error?.message || 'Requirements not met';
  }

  if (error?.code === 'invalid-argument') {
    return error?.message || 'Invalid request';
  }

  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred';
}