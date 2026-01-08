/**
 * Account Lifecycle Service for Avalo Mobile App
 * 
 * Handles account suspension, deletion, and reactivation.
 * Integrates with backend accountLifecycle functions.
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export type AccountStatus = 'active' | 'suspended' | 'deleted_soft' | 'deleted_hard';

export interface AccountStatusInfo {
  status: AccountStatus;
  suspendedAt?: Date;
  deletedAt?: Date;
  reason?: string;
}

export interface DeletionEligibility {
  canDelete: boolean;
  blockers: {
    blocked: boolean;
    reasons: string[];
    details?: {
      activeEscrows?: number;
      pendingBookings?: number;
      pendingWithdrawals?: number;
      totalEscrowTokens?: number;
    };
  };
  warnings?: string[];
}

/**
 * Suspend (pause) user account
 */
export async function suspendAccount(
  userId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const suspendFn = httpsCallable(functions, 'suspendAccount');
  
  const result = await suspendFn({
    userId,
    reason
  });
  
  return result.data as { success: boolean; message: string };
}

/**
 * Reactivate suspended account
 */
export async function reactivateAccount(
  userId: string
): Promise<{ success: boolean; message: string }> {
  const reactivateFn = httpsCallable(functions, 'reactivateAccount');
  
  const result = await reactivateFn({ userId });
  
  return result.data as { success: boolean; message: string };
}

/**
 * Soft delete account (save preferences for return)
 */
export async function softDeleteAccount(
  userId: string,
  savePreferences: boolean = true
): Promise<{ success: boolean; message: string; templateSaved: boolean }> {
  const softDeleteFn = httpsCallable(functions, 'softDeleteAccount');
  
  const result = await softDeleteFn({
    userId,
    savePreferences
  });
  
  return result.data as { success: boolean; message: string; templateSaved: boolean };
}

/**
 * Permanently delete account
 */
export async function hardDeleteAccount(
  userId: string
): Promise<{ success: boolean; message: string }> {
  const hardDeleteFn = httpsCallable(functions, 'hardDeleteAccount');
  
  const result = await hardDeleteFn({ userId });
  
  return result.data as { success: boolean; message: string };
}

/**
 * Check if account can be deleted
 */
export async function getDeletionEligibility(
  userId: string
): Promise<DeletionEligibility> {
  const checkEligibilityFn = httpsCallable(functions, 'getDeletionEligibility');
  
  const result = await checkEligibilityFn({ userId });
  
  return result.data as DeletionEligibility;
}

/**
 * Get current account status
 */
export async function getAccountStatus(
  userId: string
): Promise<AccountStatusInfo> {
  const getStatusFn = httpsCallable(functions, 'getAccountStatus');
  
  const result = await getStatusFn({ userId });
  
  return result.data as AccountStatusInfo;
}

export default {
  suspendAccount,
  reactivateAccount,
  softDeleteAccount,
  hardDeleteAccount,
  getDeletionEligibility,
  getAccountStatus
};