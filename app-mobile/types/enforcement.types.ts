/**
 * PACK 87 — Enforcement & Account State Machine
 * Mobile TypeScript types
 */

// ========================================================================
// ACCOUNT STATUS
// ========================================================================

export type AccountStatus = 
  | 'ACTIVE'
  | 'SOFT_RESTRICTED'
  | 'HARD_RESTRICTED'
  | 'SUSPENDED';

// ========================================================================
// ENFORCEMENT STATE (CLIENT VIEW)
// ========================================================================

export interface EnforcementState {
  accountStatus: AccountStatus;
  hasRestrictions: boolean;
  canSendMessages: boolean;
  canSendGifts: boolean;
  canSendPaidMedia: boolean;
  canPublishPremiumStories: boolean;
  canRequestPayouts: boolean;
  canAccessDiscovery: boolean;
  visibilityLevel: 'normal' | 'low' | 'hidden';
  lastUpdatedAt?: string;
}

// ========================================================================
// ERROR CODES
// ========================================================================

export const ENFORCEMENT_ERROR_CODES = {
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  FEATURE_LOCKED: 'FEATURE_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type EnforcementErrorCode = typeof ENFORCEMENT_ERROR_CODES[keyof typeof ENFORCEMENT_ERROR_CODES];

// ========================================================================
// UI HELPERS
// ========================================================================

/**
 * Get user-friendly message for account status
 */
export function getAccountStatusMessage(status: AccountStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Your account is active';
    case 'SOFT_RESTRICTED':
      return 'Your account has some limitations';
    case 'HARD_RESTRICTED':
      return 'Your account is restricted';
    case 'SUSPENDED':
      return 'Your account has been suspended';
    default:
      return 'Account status unknown';
  }
}

/**
 * Get status color for UI
 */
export function getAccountStatusColor(status: AccountStatus): string {
  switch (status) {
    case 'ACTIVE':
      return '#10B981'; // green
    case 'SOFT_RESTRICTED':
      return '#F59E0B'; // orange
    case 'HARD_RESTRICTED':
      return '#EF4444'; // red
    case 'SUSPENDED':
      return '#7C3AED'; // purple (serious)
    default:
      return '#6B7280'; // gray
  }
}