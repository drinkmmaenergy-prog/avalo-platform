import { MONETIZATION_SPLITS } from "@constants/monetization";
/**
 * Economy Configuration — Canonical token pricing & payout constants.
 *
 * INVARIANTS:
 *   - These values MUST match backend config exactly.
 *   - Do NOT change pricing without backend coordination.
 *   - No discounts, no coupons, no overrides.
 */

/** USD value of 1 Avalo token for payout calculations. */
export const TOKEN_PAYOUT_USD = 0.01;

/** Creator revenue share percentage (0-1 range). */
export const CREATOR_REVENUE_SHARE = MONETIZATION_SPLITS.SUBSCRIPTION.creator;

/** Platform fee percentage (0-1 range). */
export const PLATFORM_FEE = MONETIZATION_SPLITS.SUBSCRIPTION.avalo;

/** Minimum payout threshold in tokens. */
export const MIN_PAYOUT_TOKENS = 1000;

/** Internal FX rates for display purposes (backend is source of truth). */
export const INTERNAL_FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  PLN: 4.05,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  CHF: 0.88,
  SEK: 10.45,
  NOK: 10.72,
  DKK: 6.87,
  CZK: 23.15,
};

/** Alias for PayoutPreview compatibility */
export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

/** Alias for PayoutPreview compatibility */
export const CREATOR_SHARE = CREATOR_REVENUE_SHARE;

/** Alias for PayoutPreview compatibility */
export const PLATFORM_SHARE = PLATFORM_FEE;

/**
 * Format a token amount to its USD equivalent for display.
 */
export function tokensToUsd(tokens: number): string {
  return `$${(tokens * TOKEN_PAYOUT_USD).toFixed(2)}`;
}

/**
 * Format a token amount to a given currency equivalent for display.
 */
export function tokensToCurrency(tokens: number, currency: string): string {
  const rate = INTERNAL_FX_RATES[currency] ?? 1;
  const value = tokens * TOKEN_PAYOUT_USD * rate;
  return `${value.toFixed(2)} ${currency}`;
}



