/**
 * PACK 128 - Treasury Types (Mobile)
 * Client-side types for treasury system
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// VAULT TYPES
// ============================================================================

export type VaultType = 'USER' | 'CREATOR' | 'AVALO_REVENUE';

// ============================================================================
// WALLET BALANCE
// ============================================================================

export interface WalletBalance {
  availableTokens: number;
  lockedTokens?: number;
  lifetimeEarned?: number;
  lifetimeSpent?: number;
  lifetimePurchased?: number;
  vaultType: VaultType;
}

// ============================================================================
// LEDGER ENTRY (Display)
// ============================================================================

export interface LedgerEntryDisplay {
  id: string;
  type: 'PURCHASE' | 'SPEND' | 'EARN' | 'REFUND' | 'PAYOUT' | 'OTHER';
  amount: number;
  timestamp: Date;
  description: string;
  metadata?: {
    transactionType?: string;
    contentId?: string;
    creatorName?: string;
    [key: string]: any;
  };
}

// ============================================================================
// PAYOUT SAFETY CHECK
// ============================================================================

export interface PayoutSafetyCheck {
  passed: boolean;
  blockedReasons: string[];
  checks: {
    kycVerified: boolean;
    payoutMethodValid: boolean;
    regionLegal: boolean;
    treasuryRiskClear: boolean;
    fraudCheckPassed: boolean;
    balanceSufficient: boolean;
  };
  riskScore?: number;
}

// ============================================================================
// TREASURY STATISTICS (Admin)
// ============================================================================

export interface TreasuryStatistics {
  balances: {
    totalUserTokens: number;
    totalCreatorAvailable: number;
    totalCreatorLocked: number;
    totalAvaloRevenue: number;
    hotWalletBalance: number;
    coldWalletBalance: number;
    totalSupply: number;
  };
  counts: {
    totalUsers: number;
    totalCreators: number;
  };
  last24h: {
    purchases: number;
    spends: number;
    refunds: number;
    payouts: number;
  };
  timestamp: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get display name for ledger event type
 */
export function getLedgerEventDisplay(type: string): {
  label: string;
  icon: string;
  color: string;
} {
  const displays: Record<string, { label: string; icon: string; color: string }> = {
    PURCHASE: { label: 'Purchase', icon: '🛒', color: '#10B981' },
    SPEND: { label: 'Spend', icon: '💸', color: '#EF4444' },
    EARN: { label: 'Earned', icon: '💰', color: '#10B981' },
    REFUND: { label: 'Refund', icon: '↩️', color: '#3B82F6' },
    PAYOUT_LOCK: { label: 'Payout Pending', icon: '🔒', color: '#F59E0B' },
    PAYOUT_RELEASE: { label: 'Payout Complete', icon: '✅', color: '#10B981' },
    PAYOUT_REFUND: { label: 'Payout Cancelled', icon: '❌', color: '#EF4444' },
  };

  return displays[type] || { label: type, icon: '📝', color: '#6B7280' };
}

/**
 * Calculate revenue split (same as backend)
 */
export function calculateRevenueSplit(tokenAmount: number): {
  creatorAmount: number;
  avaloAmount: number;
  total: number;
} {
  if (tokenAmount <= 0) {
    return { creatorAmount: 0, avaloAmount: 0, total: 0 };
  }

  const CREATOR_SPLIT = 0.65;
  const AVALO_SPLIT = 0.35;

  const creatorAmount = Math.floor(tokenAmount * CREATOR_SPLIT);
  const avaloAmount = Math.floor(tokenAmount * AVALO_SPLIT);

  // Ensure split equals original
  const total = creatorAmount + avaloAmount;
  if (total !== tokenAmount) {
    return {
      creatorAmount: tokenAmount - avaloAmount,
      avaloAmount,
      total: tokenAmount,
    };
  }

  return {
    creatorAmount,
    avaloAmount,
    total: tokenAmount,
  };
}

/**
 * Get readable payout safety message
 */
export function getPayoutSafetyMessage(check: PayoutSafetyCheck): string {
  if (check.passed) {
    return 'All checks passed. Ready to request payout.';
  }

  if (check.blockedReasons.length === 0) {
    return 'Payout request validation failed.';
  }

  return check.blockedReasons[0]; // Return first blocking reason
}

/**
 * Get safety check icon
 */
export function getSafetyCheckIcon(passed: boolean): string {
  return passed ? '✅' : '❌';
}

/**
 * Validate token amount input
 */
export function validateTokenAmount(
  amount: number,
  availableBalance: number,
  minAmount: number = 5000
): { valid: boolean; error?: string } {
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (amount < minAmount) {
    return { valid: false, error: `Minimum amount is ${formatTokenAmount(minAmount)} tokens` };
  }

  if (amount > availableBalance) {
    return { valid: false, error: 'Insufficient balance' };
  }

  return { valid: true };
}