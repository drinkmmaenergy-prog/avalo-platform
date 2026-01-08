/**
 * PACK 128 - Treasury Configuration
 * Bank-grade treasury system configuration
 * 
 * CRITICAL NON-NEGOTIABLE RULES:
 * - Revenue split: 65% creator / 35% Avalo (IMMUTABLE)
 * - No bonuses, discounts, or cashback
 * - No fast-payout for fee
 * - No payout incentives
 * - Treasury = security + compliance ONLY
 */

import { TreasuryConfig, TREASURY_CONSTANTS } from '../types/treasury.types';

/**
 * IMMUTABLE REVENUE SPLIT
 * These values CANNOT be changed without breaking the entire economic model
 */
export const REVENUE_SPLIT = {
  CREATOR_PERCENT: 65,
  AVALO_PERCENT: 35,
} as const;

/**
 * Validate that split is correct
 */
if (REVENUE_SPLIT.CREATOR_PERCENT + REVENUE_SPLIT.AVALO_PERCENT !== 100) {
  throw new Error('CRITICAL: Revenue split must equal 100%');
}

/**
 * REFUND POLICY CONFIGURATION
 * Fraud-proof refund rules
 */
export const REFUND_POLICY = {
  GRACE_WINDOW_MINUTES: 5,             // Very short grace period
  ALLOW_AFTER_DELIVERY: false,         // NEVER refund delivered content
  REQUIRE_ADMIN_APPROVAL: true,        // All refunds require review
  MAX_REFUNDS_PER_DAY_PER_USER: 3,     // Fraud prevention
  MAX_REFUND_AMOUNT_TOKENS: 10000,     // Maximum single refund
} as const;

/**
 * HOT/COLD WALLET CONFIGURATION
 * Automatic rebalancing for security
 */
export const WALLET_POLICY = {
  HOT_WALLET_MAX_BALANCE: 1000000,     // 1M tokens max in hot wallet
  HOT_WALLET_TARGET_BALANCE: 500000,   // Target after rebalance
  HOT_WALLET_MIN_BALANCE: 100000,      // Minimum before refill from cold
  COLD_WALLET_ENABLED: true,           // Use cold storage
  AUTO_REBALANCE_ENABLED: true,        // Automatic transfers
  REBALANCE_CHECK_INTERVAL_HOURS: 6,   // How often to check
} as const;

/**
 * PAYOUT SAFETY CONFIGURATION
 * Multi-layer validation before release
 */
export const PAYOUT_POLICY = {
  MINIMUM_PAYOUT_TOKENS: 5000,         // 5K tokens minimum (from PACK 83)
  REQUIRES_KYC: true,                  // KYC required (PACK 84 integration)
  REQUIRES_PAYOUT_METHOD: true,        // Valid payout method required
  REGION_CHECK_ENABLED: true,          // Check legal compliance
  FRAUD_CHECK_ENABLED: true,           // Anti-fraud screening (PACK 126)
  TREASURY_RISK_CHECK_ENABLED: true,   // Internal risk assessment
  MAX_PENDING_PAYOUTS_PER_USER: 5,     // Anti-fraud limit
  PAYOUT_REVIEW_TIMEOUT_HOURS: 72,     // Auto-escalate after 72h
} as const;

/**
 * SECURITY CONFIGURATION
 * Fraud prevention and integrity checks
 */
export const SECURITY_POLICY = {
  DOUBLE_SPEND_PROTECTION: true,       // Prevent duplicate charges
  INTEGRITY_CHECK_ON_ALLOCATE: true,   // Verify balances before spend
  LOCK_TIMEOUT_MINUTES: 15,            // Transaction lock timeout
  MAX_TRANSACTION_RETRIES: 3,          // Retry limit for failed txns
  REQUIRE_TRANSACTION_ID: true,        // All spends need unique ID
  LOG_ALL_TREASURY_OPERATIONS: true,   // Complete audit trail
} as const;

/**
 * TOKEN PURCHASE CONFIGURATION
 * Fiat to token conversion
 */
export const PURCHASE_POLICY = {
  FIXED_RATE_PER_TOKEN_EUR: 0.20,      // 1 token = €0.20 (from PACK 83)
  MIN_PURCHASE_TOKENS: 100,            // Minimum purchase
  MAX_PURCHASE_TOKENS: 1000000,        // Maximum single purchase
  SUPPORTED_CURRENCIES: ['EUR', 'USD', 'GBP', 'PLN'],
  INSTANT_SETTLEMENT: true,            // Tokens available immediately
  NO_PRICE_VARIATIONS: true,           // No discounts or bundles
} as const;

/**
 * ANTI-FRAUD THRESHOLDS
 * Trigger fraud checks
 */
export const FRAUD_THRESHOLDS = {
  HIGH_VELOCITY_SPENDS_PER_HOUR: 50,   // Unusual spending rate
  SUSPICIOUS_REFUND_RATE: 0.20,        // 20%+ refund rate
  RAPID_PAYOUT_REQUESTS: 5,            // Too many payout requests
  GIFTING_LOOP_THRESHOLD: 10,          // Circular gifting detection
  SAME_RECIPIENT_LIMIT_PER_HOUR: 20,   // Anti-farming limit
} as const;

/**
 * TREASURY AUDIT CONFIGURATION
 * Reporting and compliance
 */
export const AUDIT_POLICY = {
  DAILY_RECONCILIATION: true,          // Daily balance check
  MONTHLY_REPORT_GENERATION: true,     // Auto-generate reports
  REAL_TIME_ALERTS: true,              // Alert on anomalies
  ALERT_BALANCE_MISMATCH: true,        // Alert if balances don't match
  ALERT_NEGATIVE_BALANCE: true,        // Alert on any negative balance
  ALERT_LARGE_TRANSACTION: 50000,      // Alert for >50K token txns
} as const;

/**
 * DEFAULT TREASURY CONFIGURATION
 * Initial system configuration
 */
export const DEFAULT_TREASURY_CONFIG: Omit<TreasuryConfig, 'id' | 'updatedAt' | 'updatedBy'> = {
  // Revenue split (IMMUTABLE)
  creatorSplitPercent: REVENUE_SPLIT.CREATOR_PERCENT,
  avaloSplitPercent: REVENUE_SPLIT.AVALO_PERCENT,

  // Refund policy
  refundGraceWindowMinutes: REFUND_POLICY.GRACE_WINDOW_MINUTES,
  refundEligibilityRules: {
    allowAfterDelivery: REFUND_POLICY.ALLOW_AFTER_DELIVERY,
    requireAdminApproval: REFUND_POLICY.REQUIRE_ADMIN_APPROVAL,
    maxRefundsPerDay: REFUND_POLICY.MAX_REFUNDS_PER_DAY_PER_USER,
  },

  // Hot/Cold wallet
  hotWalletMaxBalance: WALLET_POLICY.HOT_WALLET_MAX_BALANCE,
  hotWalletTargetBalance: WALLET_POLICY.HOT_WALLET_TARGET_BALANCE,
  coldWalletEnabled: WALLET_POLICY.COLD_WALLET_ENABLED,

  // Security
  fraudCheckEnabled: SECURITY_POLICY.DOUBLE_SPEND_PROTECTION,
  doubleSpendProtection: SECURITY_POLICY.DOUBLE_SPEND_PROTECTION,

  // Payout safety
  payoutMinimumBalance: PAYOUT_POLICY.MINIMUM_PAYOUT_TOKENS,
  payoutRequiresKYC: PAYOUT_POLICY.REQUIRES_KYC,
};

/**
 * Calculate revenue split for a token amount
 * @param tokenAmount Total tokens spent
 * @returns Split breakdown
 */
export function calculateRevenueSplit(tokenAmount: number): {
  creatorAmount: number;
  avaloAmount: number;
  total: number;
} {
  if (tokenAmount <= 0) {
    throw new Error('Token amount must be positive');
  }

  const creatorAmount = Math.floor(tokenAmount * TREASURY_CONSTANTS.CREATOR_SPLIT);
  const avaloAmount = Math.floor(tokenAmount * TREASURY_CONSTANTS.AVALO_SPLIT);

  // Ensure split equals original (handle rounding)
  const total = creatorAmount + avaloAmount;
  if (total !== tokenAmount) {
    // Adjust creator amount to match exactly (creator gets benefit of rounding)
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
 * Validate treasury configuration on startup
 */
export function validateTreasuryConfig(): void {
  // Verify immutable rules
  if (REVENUE_SPLIT.CREATOR_PERCENT !== 65 || REVENUE_SPLIT.AVALO_PERCENT !== 35) {
    throw new Error('CRITICAL: Revenue split has been tampered with!');
  }

  // Verify refund policy
  if (REFUND_POLICY.ALLOW_AFTER_DELIVERY !== false) {
    throw new Error('CRITICAL: Refunds after delivery must be disabled!');
  }

  // Verify no monetization of payouts
  if (PAYOUT_POLICY.MINIMUM_PAYOUT_TOKENS < 1000) {
    console.warn('WARNING: Minimum payout is very low, may encourage micro-payouts');
  }

  console.log('✅ Treasury configuration validated successfully');
}

/**
 * Get treasury configuration summary for logging
 */
export function getTreasuryConfigSummary(): Record<string, any> {
  return {
    revenueSplit: `${REVENUE_SPLIT.CREATOR_PERCENT}/${REVENUE_SPLIT.AVALO_PERCENT}`,
    refundGraceMinutes: REFUND_POLICY.GRACE_WINDOW_MINUTES,
    hotWalletMax: WALLET_POLICY.HOT_WALLET_MAX_BALANCE,
    coldWalletEnabled: WALLET_POLICY.COLD_WALLET_ENABLED,
    kycRequired: PAYOUT_POLICY.REQUIRES_KYC,
    fraudCheckEnabled: SECURITY_POLICY.DOUBLE_SPEND_PROTECTION,
    minPayout: PAYOUT_POLICY.MINIMUM_PAYOUT_TOKENS,
  };
}

// Validate on module load
validateTreasuryConfig();