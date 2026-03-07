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
 * Platform payout fee (taken from creator payout amount; charged to creator side)
 * NOTE: You explicitly decided this is NOT covered by Avalo.
 */
export const PAYOUT_FEE_PLATFORM_PERCENT = 0.05;

// ============================================================================
// PLATFORM LAYOUT FEE (chat deposit fee, non-refundable)
// ============================================================================

/**
 * Platform fee percentage on chat deposits (MONETIZATION_SPLITS.CHAT.avalo = 35%).
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
 * { creator: decimal (0–1), avalo: decimal (0–1) }
 * creator + avalo MUST equal 1.0 for each surface.
 *
 * These values are discovered from the canonical implementations.
 * See docs/SOT_SPLITS_MATRIX.md for conflict report.
 */
export const SPLITS_BY_SURFACE = {
  CHAT:           { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  CALLS_VOICE:    { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  CALLS_VIDEO:    { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  CALENDAR:       { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  EVENTS:         { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  TIPS:           { creator: 0.90, avalo: 0.10 },
  SUBSCRIPTIONS:  { creator: MONETIZATION_SPLITS.SUBSCRIPTION.creator, avalo: MONETIZATION_SPLITS.SUBSCRIPTION.avalo },
  LIVE_STREAMS:   { creator: MONETIZATION_SPLITS.SUBSCRIPTION.creator, avalo: MONETIZATION_SPLITS.SUBSCRIPTION.avalo },
  LIVE_VIP:       { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  AI_COMPANIONS:  { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  BOOSTS_CREATOR: { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  BOOSTS_PROMO:   { creator: 0.00, avalo: 1.00 },
  DIGITAL_PRODUCTS: { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
  DROPS:          { creator: MONETIZATION_SPLITS.SUBSCRIPTION.creator, avalo: MONETIZATION_SPLITS.SUBSCRIPTION.avalo },
  MARKETPLACE:    { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo },
} as const;

export type SurfaceKey = keyof typeof SPLITS_BY_SURFACE;

/**
 * Get split for a given surface. Returns default (65/35) if surface unknown.
 */
export function getSplitForSurface(surface: string): { creator: number; avalo: number } {
  const key = surface.toUpperCase().replace(/-/g, '_') as SurfaceKey;
  return SPLITS_BY_SURFACE[key] ?? { creator: MONETIZATION_SPLITS.CHAT.creator, avalo: MONETIZATION_SPLITS.CHAT.avalo };
}

// Build-time invariant check
for (const [key, split] of Object.entries(SPLITS_BY_SURFACE)) {
  if (Math.abs(split.creator + split.avalo - 1.0) > 0.001) {
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
  /** Platform fee on deposit (MONETIZATION_SPLITS.CHAT.avalo = 35%, non-refundable) */
  DEPOSIT_PLATFORM_FEE_PCT: MONETIZATION_SPLITS.CHAT.avalo,
  /** Escrow from deposit (MONETIZATION_SPLITS.CHAT.creator = 65%, refundable unused) */
  DEPOSIT_ESCROW_PCT: MONETIZATION_SPLITS.CHAT.creator,
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








