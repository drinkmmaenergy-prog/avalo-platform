/**
 * Avalo Token Economy Configuration — CANONICAL CONSTANTS
 * USD is canonical settlement currency.
 * Creator payout = 0.03 USD per token.
 */

// ================================
// TOKEN PRICING (CANONICAL)
// ================================

/** Purchase value per token */
export const TOKEN_BASE_USD = 0.05;

/** Creator payout per token */
export const PAYOUT_PER_TOKEN_USD = 0.03;

/** Backward compatibility alias */
export const TOKEN_PAYOUT_USD = PAYOUT_PER_TOKEN_USD;

/** PLN display payout (internal FX buffered) */
export const TOKEN_PAYOUT_PLN = 0.096; // 0.03 * 3.2 buffered FX

// ================================
// REVENUE SPLIT
// ================================

export const CREATOR_REVENUE_SHARE = 0.65;
export const PLATFORM_REVENUE_SHARE = 0.35;

export const CREATOR_SHARE = CREATOR_REVENUE_SHARE;
export const PLATFORM_SHARE = PLATFORM_REVENUE_SHARE;

// ================================
// CHAT PRICING
// ================================

export const CHAT_COST_TOKENS = 100;

// ================================
// INTERNAL FX (BUFFERED FOR SAFETY)
// ================================

export const INTERNAL_FX_RATES: Record<string, number> = {
  USD: 1.0,
  PLN: 3.2,
  EUR: 0.80,
  GBP: 0.70
};

export const SUPPORTED_PAYOUT_CURRENCIES = Object.keys(INTERNAL_FX_RATES);
