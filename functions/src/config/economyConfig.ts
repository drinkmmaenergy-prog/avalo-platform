import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

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
 * - TOKEN_PAYOUT_USD: earner payout per earned token (USD)
 *
 * @module config/economyConfig
 * @version 2.0.0 — Extended with SPLITS, CHAT_PRICING, governance hooks
 */

// ============================================================================
// PAYOUT RATE
// ============================================================================

export const TOKEN_PAYOUT_USD = 0.03;

/**
 * Alias for naming parity across packs/modules
 */
export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

/**
 * Platform payout fee (taken from earner payout amount; charged to earner side)
 * NOTE: You explicitly decided this is NOT covered by Avalo.
 */
export const PAYOUT_FEE_PLATFORM_PERCENT = 0.05;

// ============================================================================
// PLATFORM LAYOUT FEE (chat deposit fee, non-refundable)
// ============================================================================

/**
 * Platform fee percentage on chat deposits (MONETIZATION_SPLITS.CHAT.platform = 35%).
 * Charged at deposit time, non-refundable.
 */
export const PLATFORM_LAYOUT_FEE = 0.05;

// ============================================================================
// MINIMUM CHAT CHARGE
// ============================================================================

/**
 * Minimum tokens for a chat deposit.
 * chargedTokens = max(MIN_CHAT_CHARGE_TOKENS, computedCost)
 */
export const MIN_CHAT_CHARGE_TOKENS = 100;

// ============================================================================
// SPLITS BY SURFACE
// ============================================================================

/**
 * Revenue split per surface.
 * { earner: decimal (0–1), platform: decimal (0–1) }
 * earner + platform MUST equal 1.0 for each surface.
 *
 * These values are discovered from the canonical implementations.
 * See docs/SOT_SPLITS_MATRIX.md for conflict report.
 */
export const SPLITS_BY_SURFACE = {
  CHAT:           { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  CALLS_VOICE:    { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  CALLS_VIDEO:    { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  CALENDAR:       { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  EVENTS:         { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  TIPS:           { earner: 0.90, platform: 0.10 },
  SUBSCRIPTIONS:  { earner: MONETIZATION_SPLITS.SUBSCRIPTION.earner, platform: MONETIZATION_SPLITS.SUBSCRIPTION.platform },
  LIVE_STREAMS:   { earner: MONETIZATION_SPLITS.SUBSCRIPTION.earner, platform: MONETIZATION_SPLITS.SUBSCRIPTION.platform },
  LIVE_VIP:       { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  AI_COMPANIONS:  { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  BOOSTS_CREATOR: { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  BOOSTS_PROMO:   { earner: 0.00, platform: 1.00 },
  DIGITAL_PRODUCTS: { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
  DROPS:          { earner: MONETIZATION_SPLITS.SUBSCRIPTION.earner, platform: MONETIZATION_SPLITS.SUBSCRIPTION.platform },
  MARKETPLACE:    { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform },
} as const;

export type SurfaceKey = keyof typeof SPLITS_BY_SURFACE;

/**
 * Get split for a given surface. Returns default (65/35) if surface unknown.
 */
export function getSplitForSurface(surface: string): { earner: number; platform: number } {
  const key = surface.toUpperCase().replace(/-/g, '_') as SurfaceKey;
  return SPLITS_BY_SURFACE[key] ?? { earner: MONETIZATION_SPLITS.CHAT.earner, platform: MONETIZATION_SPLITS.CHAT.platform };
}

// Build-time invariant check
for (const [key, split] of Object.entries(SPLITS_BY_SURFACE)) {
  if (Math.abs(split.earner + split.platform - 1.0) > 0.001) {
    throw new Error(`CRITICAL: SPLITS_BY_SURFACE.${key} does not sum to 1.0`);
  }
}

// ============================================================================
// CHAT PRICING
// ============================================================================

/**
 * Chat pricing configuration per earner mode.
 * wordsPerToken: how many earner words = 1 token bucket
 * burnMultipliers: allowed multiplier values (from canonical-chat.types)
 */
export const CHAT_PRICING = {
  STANDARD: {
    wordsPerToken: 11,
    freeMessagesPerUser: 9,
  },
  ROYAL: {
    wordsPerToken: 7,
    freeMessagesPerUser: 5,
  },
  /** Allowed burn multiplier enum values */
  BURN_MULTIPLIERS: [1, 2, 3, 4, 5, 7, 10, 12, 15, 20] as const,
  /** Default deposit tokens */
  DEFAULT_DEPOSIT_TOKENS: 100,
  /** Chat expiry inactivity hours */
  CHAT_EXPIRY_HOURS: 48,
  /** Platform fee on deposit (MONETIZATION_SPLITS.CHAT.platform = 35%, non-refundable) */
  DEPOSIT_PLATFORM_FEE_PCT: MONETIZATION_SPLITS.CHAT.platform,
  /** Escrow from deposit (MONETIZATION_SPLITS.CHAT.earner = 65%, refundable unused) */
  DEPOSIT_ESCROW_PCT: MONETIZATION_SPLITS.CHAT.earner,
} as const;

// ============================================================================
// GOVERNANCE HOOKS (audit log entry points)
// ============================================================================

/**
 * Governance audit hook.
 * Call this function before any economy-critical mutation to create an audit trail.
 * 
 * This is the ENTRY POINT for audit logging of economy changes.
 * The actual Firestore write is delegated to the caller (no admin UI implemented here).
 *
 * @param event - Type of economy event
 * @param metadata - Context for the event
 * @returns Audit entry object (caller must persist)
 */
export function createEconomyAuditEntry(
  event: EconomyAuditEvent,
  metadata: Record<string, unknown>
): EconomyAuditRecord {
  return {
    event,
    metadata,
    timestamp: new Date().toISOString(),
    configSnapshot: {
      TOKEN_PAYOUT_USD,
      PAYOUT_FEE_PLATFORM_PERCENT,
      MIN_CHAT_CHARGE_TOKENS,
    },
  };
}

export type EconomyAuditEvent =
  | 'DEPOSIT_CREATED'
  | 'ESCROW_CONSUMED'
  | 'REFUND_ISSUED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_COMPLETED'
  | 'SPLIT_APPLIED'
  | 'FEE_CAPTURED';

export interface EconomyAuditRecord {
  event: EconomyAuditEvent;
  metadata: Record<string, unknown>;
  timestamp: string;
  configSnapshot: {
    TOKEN_PAYOUT_USD: number;
    PAYOUT_FEE_PLATFORM_PERCENT: number;
    MIN_CHAT_CHARGE_TOKENS: number;
  };
}

// ============================================================================
// PAYOUT FX RATES (display-only, backend authority)
// ============================================================================

/**
 * FX rates for payout display. Backend is source of truth.
 * These are INFORMATIONAL — actual conversion uses live rates at payout time.
 */
export const PAYOUT_FX_RATES = {
  USD_TO_USD: 1.0,
  USD_TO_EUR: 0.92,
  USD_TO_GBP: 0.79,
  USD_TO_PLN: 4.05,
} as const;



export const TOKEN_PAYOUT_PLN = TOKEN_PAYOUT_USD * 4.0;


























