/**
 * PACK 128 - Treasury & Payment Vault System
 * Type definitions for bank-grade treasury architecture
 * 
 * NON-NEGOTIABLE RULES:
 * - No bonuses, discounts, rewards, cashback, or token multipliers
 * - No fast-payout for fee
 * - No reversals of paid messages/calls
 * - 65/35 split is immutable
 * - Treasury = security + compliance, NOT monetization
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// VAULT TYPES
// ============================================================================

export type VaultType = 'USER' | 'CREATOR' | 'AVALO_REVENUE';

export type WalletType = 'HOT' | 'COLD';

// ============================================================================
// LEDGER EVENT TYPES
// ============================================================================

export type LedgerEventType =
  | 'PURCHASE'              // User purchases tokens
  | 'SPEND'                 // User spends tokens on content
  | 'EARN'                  // Creator earns tokens
  | 'COMMISSION'            // Avalo revenue
  | 'REFUND'                // Refund to user
  | 'REFUND_CREATOR'        // Refund from creator vault
  | 'REFUND_COMMISSION'     // Refund from Avalo vault
  | 'PAYOUT_LOCK'           // Tokens locked for payout
  | 'PAYOUT_RELEASE'        // Payout completed
  | 'PAYOUT_REFUND'         // Rejected payout refund
  | 'HOT_TO_COLD'           // Transfer to cold storage
  | 'COLD_TO_HOT'           // Transfer from cold storage
  | 'ADJUSTMENT';           // Manual admin adjustment

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export type TransactionType =
  | 'PAID_MESSAGE'
  | 'PAID_CALL'
  | 'PAID_GIFT'
  | 'PAID_MEDIA'
  | 'PAID_STORY'
  | 'DIGITAL_PRODUCT'
  | 'EVENT_TICKET'
  | 'BOOST'
  | 'TOKEN_PURCHASE'
  | 'OTHER';

// ============================================================================
// REFUND STATUS
// ============================================================================

export type RefundStatus =
  | 'ELIGIBLE'              // Can be refunded
  | 'INELIGIBLE'            // Cannot be refunded
  | 'GRACE_EXPIRED'         // Grace period expired
  | 'CONTENT_DELIVERED'     // Content already delivered
  | 'FRAUD_DETECTED';       // Fraud pattern detected

// ============================================================================
// TREASURY LEDGER ENTRY
// ============================================================================

/**
 * Immutable audit trail of all token movements
 * CRITICAL: Entries are APPEND-ONLY and can NEVER be modified or deleted
 */
export interface TreasuryLedgerEntry {
  ledgerId: string;                    // UUID
  eventType: LedgerEventType;          // Type of transaction
  userId: string;                      // User involved
  creatorId?: string;                  // Creator involved (optional)
  transactionId?: string;              // Reference to original transaction
  tokenAmount: number;                 // Tokens moved (positive or negative)
  vault: VaultType;                    // Which vault this affects
  walletType?: WalletType;             // Hot or cold (optional)
  timestamp: Timestamp;                // When it occurred
  metadata: {
    transactionType?: TransactionType;
    description?: string;
    contentId?: string;
    payoutRequestId?: string;
    refundReason?: string;
    adminId?: string;                  // For manual adjustments
    balanceAfter?: number;             // Snapshot after transaction
    [key: string]: any;
  };
}

// ============================================================================
// USER TOKEN WALLET
// ============================================================================

/**
 * User's prepaid token balance (USER vault)
 */
export interface UserTokenWallet {
  userId: string;                      // User ID (doc ID)
  availableTokens: number;             // Current spendable balance
  lifetimePurchased: number;           // Total tokens ever purchased
  lifetimeSpent: number;               // Total tokens ever spent
  lastPurchaseAt?: Timestamp;
  lastSpendAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CREATOR VAULT
// ============================================================================

/**
 * Creator's earnings before payout (CREATOR vault)
 */
export interface CreatorVault {
  userId: string;                      // Creator ID (doc ID)
  availableTokens: number;             // Withdrawable balance
  lockedTokens: number;                // Locked in pending payouts
  lifetimeEarned: number;              // Total earned (cumulative)
  lifetimePaidOut: number;             // Total withdrawn
  lastEarnedAt?: Timestamp;
  lastPayoutAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// AVALO REVENUE VAULT
// ============================================================================

/**
 * Platform commission accumulation (AVALO_REVENUE vault)
 */
export interface AvaloRevenueVault {
  id: string;                          // Always 'platform' (singleton)
  totalRevenue: number;                // Cumulative commission
  availableRevenue: number;            // Not yet withdrawn
  lifetimeWithdrawn: number;           // Total platform withdrawals
  lastRevenueAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// HOT WALLET
// ============================================================================

/**
 * Fast-access funds for daily payouts
 */
export interface TreasuryHotWallet {
  id: string;                          // Always 'hot_wallet' (singleton)
  totalBalance: number;                // Current hot wallet balance
  dailyPayoutLimit: number;            // Max daily payout capacity
  rebalanceThreshold: number;          // When to move to cold
  lastRebalanceAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// COLD WALLET
// ============================================================================

/**
 * Long-term secure storage
 */
export interface TreasuryColdWallet {
  id: string;                          // Always 'cold_wallet' (singleton)
  totalBalance: number;                // Current cold wallet balance
  lastDepositAt?: Timestamp;
  lastWithdrawalAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// TOKEN PURCHASE RECORD
// ============================================================================

/**
 * Fiat to token conversion record
 */
export interface TokenPurchaseRecord {
  id: string;                          // UUID
  userId: string;                      // Buyer
  fiatAmount: number;                  // Amount paid in fiat
  fiatCurrency: string;                // e.g., 'USD', 'EUR'
  tokenAmount: number;                 // Tokens received
  exchangeRateDisplayOnly: number;     // Rate at time of purchase (audit only)
  paymentMethodType: string;           // 'STRIPE', 'APPLE_PAY', etc.
  paymentIntentId?: string;            // PSP reference
  country?: string;                    // User's country
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  createdAt: Timestamp;
  completedAt?: Timestamp;
  metadata?: {
    stripeSessionId?: string;
    [key: string]: any;
  };
}

// ============================================================================
// REFUND RECORD
// ============================================================================

/**
 * Tracks refunds for audit trail
 */
export interface RefundRecord {
  id: string;                          // UUID
  originalTransactionId: string;       // Reference to original spend
  userId: string;                      // User receiving refund
  creatorId?: string;                  // Creator affected by refund
  tokenAmount: number;                 // Tokens refunded
  reason: string;                      // Why refunded
  status: RefundStatus;
  eligibilityCheck: {
    contentDelivered: boolean;
    graceWindowExpired: boolean;
    fraudDetected: boolean;
  };
  processedAt: Timestamp;
  processedBy?: string;                // Admin ID if manual
  metadata?: {
    originalEventType?: LedgerEventType;
    [key: string]: any;
  };
}

// ============================================================================
// PAYOUT SAFETY CHECK
// ============================================================================

/**
 * Multi-layer validation before payout release
 */
export interface PayoutSafetyCheckResult {
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
  riskScore?: number;                  // 0-100 (PACK 126 integration)
  timestamp: Timestamp;
}

// ============================================================================
// TREASURY AUDIT REPORT
// ============================================================================

/**
 * Comprehensive audit snapshot
 */
export interface TreasuryAuditReport {
  reportId: string;                    // UUID
  generatedAt: Timestamp;
  generatedBy?: string;                // Admin ID
  period: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  summary: {
    totalUserTokens: number;           // Sum of all user wallets
    totalCreatorTokens: number;        // Sum of all creator vaults
    totalAvaloRevenue: number;         // Platform commission
    hotWalletBalance: number;
    coldWalletBalance: number;
    totalSupply: number;               // Sum of all vaults
  };
  transactions: {
    purchases: number;                 // Count
    spends: number;
    earns: number;
    refunds: number;
    payouts: number;
  };
  volumeByType: {
    [key in TransactionType]?: number;
  };
  integrityCheck: {
    balancesMatch: boolean;            // Sum equals expected
    ledgerComplete: boolean;           // No gaps in ledger
    noNegativeBalances: boolean;
  };
}

// ============================================================================
// TREASURY CONFIGURATION
// ============================================================================

/**
 * System-wide treasury configuration
 */
export interface TreasuryConfig {
  id: string;                          // Always 'config' (singleton)
  
  // Revenue split (immutable)
  creatorSplitPercent: number;         // Always 65
  avaloSplitPercent: number;           // Always 35
  
  // Refund policy
  refundGraceWindowMinutes: number;    // Default: 5 minutes
  refundEligibilityRules: {
    allowAfterDelivery: boolean;       // Always false
    requireAdminApproval: boolean;
    maxRefundsPerDay: number;
  };
  
  // Hot/Cold wallet
  hotWalletMaxBalance: number;         // Auto-rebalance threshold
  hotWalletTargetBalance: number;      // Rebalance target
  coldWalletEnabled: boolean;
  
  // Security
  fraudCheckEnabled: boolean;
  doubleSpendProtection: boolean;
  
  // Payout safety
  payoutMinimumBalance: number;        // Minimum for withdrawal
  payoutRequiresKYC: boolean;          // Integration with PACK 84
  
  updatedAt: Timestamp;
  updatedBy?: string;                  // Admin ID
}

// ============================================================================
// FUNCTION REQUEST/RESPONSE TYPES
// ============================================================================

export interface AllocateSpendRequest {
  userId: string;
  creatorId: string;
  tokenAmount: number;
  transactionType: TransactionType;
  contentId?: string;
  metadata?: Record<string, any>;
}

export interface AllocateSpendResponse {
  success: boolean;
  ledgerId: string;
  userBalance: number;
  creatorEarnings: number;
  avaloRevenue: number;
  timestamp: Timestamp;
}

export interface RefundRequest {
  transactionId: string;
  reason: string;
  adminId?: string;
}

export interface RefundResponse {
  success: boolean;
  refunded: boolean;
  status: RefundStatus;
  reason: string;
  tokenAmount?: number;
  ledgerIds?: string[];
}

export interface GetBalanceRequest {
  userId: string;
}

export interface GetBalanceResponse {
  availableTokens: number;
  lockedTokens?: number;
  lifetimeEarned?: number;
  lifetimeSpent?: number;
  vaultType: VaultType;
}

export interface RequestPayoutRequest {
  userId: string;
  methodId: string;
  tokenAmount: number;
}

export interface RequestPayoutResponse {
  success: boolean;
  payoutRequestId?: string;
  safetyCheck: PayoutSafetyCheckResult;
  message: string;
}

export interface ProcessPayoutRequest {
  payoutRequestId: string;
  approved: boolean;
  adminId: string;
  notes?: string;
}

export interface ProcessPayoutResponse {
  success: boolean;
  status: 'APPROVED' | 'REJECTED';
  message: string;
}

export interface RebalanceWalletResponse {
  success: boolean;
  movedAmount: number;
  direction: 'HOT_TO_COLD' | 'COLD_TO_HOT';
  hotBalance: number;
  coldBalance: number;
  timestamp: Timestamp;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface TokenFlowSplit {
  creatorAmount: number;               // 65% of spend
  avaloAmount: number;                 // 35% of spend
  total: number;
}

export interface DoubleSpendCheck {
  isDuplicate: boolean;
  originalTransactionId?: string;
  timestamp?: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const TREASURY_CONSTANTS = {
  CREATOR_SPLIT: 0.65,                 // 65%
  AVALO_SPLIT: 0.35,                   // 35%
  DEFAULT_REFUND_GRACE_MINUTES: 5,
  DEFAULT_HOT_WALLET_MAX: 1000000,     // 1M tokens
  DEFAULT_HOT_WALLET_TARGET: 500000,   // 500K tokens
  MIN_PAYOUT_AMOUNT: 5000,             // 5K tokens minimum
} as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidVaultType(type: string): type is VaultType {
  return ['USER', 'CREATOR', 'AVALO_REVENUE'].includes(type);
}

export function isValidLedgerEvent(event: string): event is LedgerEventType {
  return [
    'PURCHASE',
    'SPEND',
    'EARN',
    'COMMISSION',
    'REFUND',
    'REFUND_CREATOR',
    'REFUND_COMMISSION',
    'PAYOUT_LOCK',
    'PAYOUT_RELEASE',
    'PAYOUT_REFUND',
    'HOT_TO_COLD',
    'COLD_TO_HOT',
    'ADJUSTMENT',
  ].includes(event);
}

export function isValidTransactionType(type: string): type is TransactionType {
  return [
    'PAID_MESSAGE',
    'PAID_CALL',
    'PAID_GIFT',
    'PAID_MEDIA',
    'PAID_STORY',
    'DIGITAL_PRODUCT',
    'EVENT_TICKET',
    'BOOST',
    'TOKEN_PURCHASE',
    'OTHER',
  ].includes(type);
}