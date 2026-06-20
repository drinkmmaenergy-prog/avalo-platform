/**
 * CREATOR PAYOUT POLICY
 *
 * Server-only module. Never import in client code.
 *
 * Defines risk-tier hold periods for creator earnings.
 * All values are in whole days.
 * Do not hardcode these values in earning-flow integrations — always import from here.
 *
 * Immutable architecture:
 *   - pendingUsdCents: visible immediately, but unavailable for payout until hold clears
 *   - availableUsdCents: cleared funds that may be paid out
 *   - Hold affects payout availability only; creators see earnings as Pending immediately
 */

export type RiskTier = 'NEW' | 'VERIFIED' | 'TRUSTED' | 'HIGH_RISK';

/**
 * Hold period in days per risk tier.
 * Funds move from pendingUsdCents → availableUsdCents after this many days.
 */
export const CREATOR_HOLD_DAYS: Record<RiskTier, number> = {
  NEW:       7,
  VERIFIED:  3,
  TRUSTED:   1,
  HIGH_RISK: 14,
} as const;

/**
 * Payouts are blocked entirely for HIGH_RISK creators until manually reviewed.
 * Other tiers may request payouts once their held balance clears.
 */
export const PAYOUT_BLOCK_TIERS: RiskTier[] = ['HIGH_RISK'];

/**
 * Creator commission split at launch.
 * One rule: 80% creator / 20% Avalo.
 * No additional fixed fees. External provider costs absorbed by Avalo from its 20%.
 */
export const CREATOR_ECONOMY = {
  AVALO_COMMISSION_PERCENT: 0.20,
  CREATOR_NET_PERCENT:      0.80,
  /** USD value per token used for payout accounting (cents per token). */
  TOKEN_RATE_USD_CENTS: 4, // $0.04 = 4 cents per token
} as const;

/**
 * Minimum payout amount in USD cents.
 * Creator must have at least this much in availableUsdCents to request a payout.
 * 1000 tokens = $40 gross → $32 net = 3200 cents
 */
export const MIN_PAYOUT_USD_CENTS = 3200;

/**
 * KYC level required before a payout may be initiated.
 */
export const MIN_KYC_LEVEL_FOR_PAYOUT = 2;

/**
 * Calculate hold release timestamp for a given risk tier.
 */
export function holdReleaseDate(riskTier: RiskTier): Date {
  const holdDays = CREATOR_HOLD_DAYS[riskTier];
  const d = new Date();
  d.setDate(d.getDate() + holdDays);
  return d;
}

/**
 * Compute gross and net USD cents from a token amount.
 * Always uses integer arithmetic. No floats persisted.
 */
export function computeEarningCents(grossTokens: number): {
  grossUsdCents: number;
  avaloCommissionUsdCents: number;
  netUsdCents: number;
} {
  const grossUsdCents = Math.floor(grossTokens * CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS);
  const avaloCommissionUsdCents = Math.floor(grossUsdCents * CREATOR_ECONOMY.AVALO_COMMISSION_PERCENT);
  const netUsdCents = grossUsdCents - avaloCommissionUsdCents;
  return { grossUsdCents, avaloCommissionUsdCents, netUsdCents };
}
