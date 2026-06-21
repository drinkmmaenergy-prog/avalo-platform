
import { CANONICAL_ECONOMY } from "./canonicalEconomy";
import { MONETIZATION_SPLITS } from "../config/monetizationSplits";

/**
 * FUNCTIONS ECONOMY CONFIG
 * Source of truth: shared/config/canonicalEconomy.ts
 */

export const TOKEN_PAYOUT_USD = CANONICAL_ECONOMY.payout.tokenPayoutUsd;
export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;

/**
 * Stripe USD only.
 */
export const PAYOUT_FEE_PLATFORM_PERCENT =
  CANONICAL_ECONOMY.payout.payoutFeePlatformPercent;

/**
 * Legacy name preserved for compatibility.
 * Canonical meaning: non-refundable platform fee on chat deposit.
 */
export const PLATFORM_LAYOUT_FEE =
  CANONICAL_ECONOMY.chat.depositPlatformFeePct;

export const MIN_CHAT_CHARGE_TOKENS =
  CANONICAL_ECONOMY.chat.minChatChargeTokens;

export const SPLITS_BY_SURFACE = {
  CHAT: { ...MONETIZATION_SPLITS.CHAT },
  CALLS_VOICE: { ...MONETIZATION_SPLITS.CALL },
  CALLS_VIDEO: { ...MONETIZATION_SPLITS.VIDEO_CALL },
  CALENDAR: { ...MONETIZATION_SPLITS.CALENDAR_MEETING },
  EVENTS: { ...MONETIZATION_SPLITS.EVENT_TICKET },
  TIPS: { ...MONETIZATION_SPLITS.TIPS },
  SUBSCRIPTIONS: { ...MONETIZATION_SPLITS.SUBSCRIPTION },
  LIVE_STREAMS: { ...MONETIZATION_SPLITS.LIVE_GIFTS },
  LIVE_VIP: { ...MONETIZATION_SPLITS.CHAT },
  AI_COMPANIONS: { earner: 0, platform: 1 },
  BOOSTS_CREATOR: { earner: 0, platform: 1 },
  BOOSTS_PROMO: { earner: 0, platform: 1 },
  DIGITAL_PRODUCTS: { ...MONETIZATION_SPLITS.UNLOCK_MEDIA },
  DROPS: { ...MONETIZATION_SPLITS.CHAT },
  MARKETPLACE: { ...MONETIZATION_SPLITS.CHAT },
} as const;

export type SurfaceKey = keyof typeof SPLITS_BY_SURFACE;

export function getSplitForSurface(surface: string): { earner: number; platform: number } {
  const key = surface.toUpperCase().replace(/-/g, "_") as SurfaceKey;
  return SPLITS_BY_SURFACE[key] ?? { ...MONETIZATION_SPLITS.CHAT };
}

for (const [key, split] of Object.entries(SPLITS_BY_SURFACE)) {
  if (split.earner === 0 && split.platform === 0) continue;
  if (Math.abs(split.earner + split.platform - 1.0) > 0.001) {
    throw new Error(`CRITICAL: SPLITS_BY_SURFACE.${key} does not sum to 1.0`);
  }
}

export const CHAT_PRICING = {
  STANDARD: {
    wordsPerToken: CANONICAL_ECONOMY.chat.tiers.STANDARD.wordsPerToken,
    freeMessagesPerUser: CANONICAL_ECONOMY.chat.tiers.STANDARD.freeMessagesPerUser,
  },
  ROYAL: {
    wordsPerToken: CANONICAL_ECONOMY.chat.tiers.ROYAL.wordsPerToken,
    freeMessagesPerUser: CANONICAL_ECONOMY.chat.tiers.ROYAL.freeMessagesPerUser,
  },
  BURN_MULTIPLIERS: CANONICAL_ECONOMY.chat.allowedBurnMultipliers,
  DEFAULT_DEPOSIT_TOKENS: CANONICAL_ECONOMY.chat.defaultDepositTokens,
  CHAT_EXPIRY_HOURS: CANONICAL_ECONOMY.chat.chatExpiryInactivityHours,
  DEPOSIT_PLATFORM_FEE_PCT: CANONICAL_ECONOMY.chat.depositPlatformFeePct,
  DEPOSIT_ESCROW_PCT: CANONICAL_ECONOMY.chat.depositEscrowPct,
} as const;

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
  | "DEPOSIT_CREATED"
  | "ESCROW_CONSUMED"
  | "REFUND_ISSUED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_COMPLETED"
  | "SPLIT_APPLIED"
  | "FEE_CAPTURED";

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




