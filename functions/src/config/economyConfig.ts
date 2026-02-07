/**
 * ECONOMY CONFIG — Single Source of Truth for Creator Payout Rate
 *
 * TOKEN_PAYOUT_USD is the canonical payout value per token in USD.
 * All payout calculations MUST reference this constant.
 *
 * RULES:
 * - This value applies to NEW earnings only.
 * - Historical transactions are NOT recalculated.
 * - Revenue splits (65/35, 80/20, 90/10) are NOT affected.
 * - Token package prices are NOT affected.
 * - Chat cost (100 tokens) is NOT affected.
 * - Token burn logic is NOT affected.
 *
 * Change History:
 * - 2026-02-07: Set to 0.03 USD per token (replaces prior 0.20 PLN/token model)
 *
 * @package avaloapp
 * @version 1.0.0
 */

// ============================================================================
// CANONICAL PAYOUT CONSTANT (USD)
// ============================================================================

/**
 * Creator payout value per token in USD.
 * This is the SINGLE SOURCE OF TRUTH for all payout math.
 */
export const TOKEN_PAYOUT_USD = 0.03;

/**
 * Alias requested by PACK economy spec.
 * Identical to TOKEN_PAYOUT_USD — kept for naming-convention parity.
 */
export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

// ============================================================================
// DERIVED PAYOUT RATES IN LOCAL CURRENCIES
// ============================================================================

/**
 * Fixed reference exchange rates used for payout derivation.
 * These align with the rates already used by PACK 277 / PACK 289.
 * At settlement time, actual FX rates from the payment provider apply.
 */
export const PAYOUT_FX_RATES = {
  USD_TO_PLN: 4.0,    // 1 USD = 4.0 PLN  (matches existing 1 PLN = 0.25 USD)
  USD_TO_EUR: 0.92,   // 1 USD = 0.92 EUR  (approximate)
  USD_TO_GBP: 0.79,   // 1 USD = 0.79 GBP  (approximate)
} as const;

/**
 * Derived payout rate in PLN.
 * For systems that still operate in PLN (PACK 277, 289, 303, 304, 330).
 * 0.03 USD × 4.0 = 0.12 PLN per token.
 */
export const TOKEN_PAYOUT_PLN = TOKEN_PAYOUT_USD * PAYOUT_FX_RATES.USD_TO_PLN;

/**
 * Derived payout rate in EUR.
 * For systems that operate in EUR (PACK 83 payouts.config).
 * 0.03 USD × 0.92 = 0.0276 EUR per token.
 */
export const TOKEN_PAYOUT_EUR = TOKEN_PAYOUT_USD * PAYOUT_FX_RATES.USD_TO_EUR;
