/**
 * ECONOMY CONFIG — Canonical Single Source of Truth (USD-only)
 *
 * RULES (Avalo SoT):
 * - Backend monetary logic uses USD only.
 * - No PLN/EUR/GBP calculations in functions.
 * - Token retail prices come from Stripe Products/Prices (pack277 token packs).
 * - Creator payouts use TOKEN_PAYOUT_USD only.
 * - Historical transactions are not recalculated.
 *
 * Canonical:
 * - TOKEN_PAYOUT_USD: creator payout per earned token (USD)
 */
export const TOKEN_PAYOUT_USD = 0.03;

/**
 * Alias for naming parity across packs/modules
 */
export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

/**
 * Platform payout fee (taken from creator payout amount; charged to creator side)
 * NOTE: You explicitly decided this is NOT covered by Avalo.
 */
export const PAYOUT_FEE_PLATFORM_PERCENT = 0.05;





