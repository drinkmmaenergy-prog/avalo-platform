/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Configuration for payout system (manual review, no auto-withdrawal)
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price per unit remains fixed (config-driven, not user-changeable)
 * - Revenue split 65% creator / 35% Avalo (inherited from PACK 81)
 * - No bonuses, no free tokens, no discounts, no promo codes, no cashback
 * - Tokens deducted on payout request are permanent
 * - No refunds on completed payouts (only on rejected requests)
 */

export const PAYOUT_CONFIG = {
  // Minimum withdrawable amount in tokens
  MIN_PAYOUT_TOKENS: 5000,

  // Fixed conversion rate: tokens → EUR (read-only, controlled by Avalo admins)
  PAYOUT_TOKEN_TO_EUR_RATE: 0.20, // 1 token = 0.20 EUR

  // Supported payout methods
  SUPPORTED_PAYOUT_METHODS: ['BANK_TRANSFER', 'WISE', 'STRIPE_CONNECT'] as const,

  // Maximum number of payout methods per user
  MAX_PAYOUT_METHODS_PER_USER: 5,

  // Payout request status transitions
  ALLOWED_STATUS_TRANSITIONS: {
    PENDING: ['UNDER_REVIEW'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: ['PAID'],
    REJECTED: [],
    PAID: [],
  } as const,

  // Default currency
  DEFAULT_CURRENCY: 'EUR',

  // Supported currencies
  SUPPORTED_CURRENCIES: ['EUR', 'USD', 'GBP', 'PLN'] as const,
} as const;

export type PayoutMethodType = typeof PAYOUT_CONFIG.SUPPORTED_PAYOUT_METHODS[number];
export type PayoutStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';
export type PayoutCurrency = typeof PAYOUT_CONFIG.SUPPORTED_CURRENCIES[number];