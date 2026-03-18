/**
 * =====================================================
 * MULTI-ROOM CHAT CONFIG — Canonical Single Source of Truth
 * =====================================================
 *
 * This file is the ONE AND ONLY source of truth for all multi-room
 * chat monetization values. No other file should hardcode multi-room
 * billing values — they must import from here.
 *
 * Covers:
 * - Entry fee (non-refundable, 65/35 split)
 * - Word budget mechanics (entry_fee_tokens * 2 words)
 * - Word reload (minimum 50 tokens, 65/35 split)
 * - Priority messages (BRONZE/SILVER/GOLD/DIAMOND tiers)
 * - Guaranteed reply (150 token minimum, 10-min earner window)
 * - Tips (10 token minimum, 65/35 split)
 * - Room capacity options
 *
 * Business model:
 * Multi-Room Chat is a separate monetization surface from 1:1 chat.
 * It uses its own Firestore collection: multi_rooms.
 * Entry fee is non-refundable. Word budgets are non-refundable.
 * The ONLY refundable scenario is guaranteed reply timeout.
 *
 * @module config/multiRoomConfig
 * @version 1.0.0
 */

// ============================================================================
// MAIN CONFIG OBJECT
// ============================================================================

export const MULTI_ROOM_CONFIG = {
  ENTRY: {
    MIN_TOKENS: 50,
    MAX_TOKENS: 500,
    WORDS_PER_TOKEN: 2,
    SPLIT: { earner: 0.65, avalo: 0.35 },
    NON_REFUNDABLE: true,
  },
  RELOAD: {
    MIN_TOKENS: 50,
    WORDS_PER_TOKEN: 2,
    SPLIT: { earner: 0.65, avalo: 0.35 },
  },
  PRIORITY: {
    BRONZE:  { tokens: 20,  pinMinutes: 5,  color: 'yellow',  earnerMustReply: false },
    SILVER:  { tokens: 50,  pinMinutes: 15, color: 'orange',  earnerMustReply: false },
    GOLD:    { tokens: 100, pinMinutes: 30, color: 'red',     earnerMustReply: true  },
    DIAMOND: { tokens: 200, pinMinutes: 60, color: 'diamond', earnerMustReply: true  },
    SPLIT: { earner: 0.65, avalo: 0.35 },
  },
  GUARANTEED_REPLY: {
    MIN_TOKENS: 150,
    EARNER_RESPONSE_WINDOW_MS: 10 * 60 * 1000,
    SPLIT_COMPLETED: { earner: 0.65, avalo: 0.35 },
    SPLIT_REFUNDED: { earner: 0, avalo: 0, user: 1.0 },
  },
  TIPS: {
    MIN_TOKENS: 10,
    SPLIT: { earner: 0.65, avalo: 0.35 },
  },
  CAPACITY: {
    OPTIONS: [10, 50, 100, null] as const,
    DEFAULT: 50,
  },
} as const;

// ============================================================================
// PRIORITY TIER NAMES (type-safe)
// ============================================================================

export type PriorityTierName = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

const PRIORITY_TIERS: PriorityTierName[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate word budget from entry (or reload) token amount.
 * Business rule: entry_fee_tokens * WORDS_PER_TOKEN = word budget.
 * Example: 100 tokens → 200 words.
 */
export function getEntryWordBudget(entryTokens: number): number {
  return entryTokens * MULTI_ROOM_CONFIG.ENTRY.WORDS_PER_TOKEN;
}

/**
 * Determine priority tier from token amount.
 * Returns the tier name if tokens match exactly, or null if no match.
 * Tiers are checked in ascending order.
 */
export function getPriorityTier(tokens: number): PriorityTierName | null {
  for (const tier of PRIORITY_TIERS) {
    if (MULTI_ROOM_CONFIG.PRIORITY[tier].tokens === tokens) {
      return tier;
    }
  }
  return null;
}

/**
 * Check if a given priority tier requires the earner to respond.
 * GOLD and DIAMOND require a response; BRONZE and SILVER do not.
 */
export function mustEarnerReply(priorityTier: string): boolean {
  const tier = priorityTier as PriorityTierName;
  const config = MULTI_ROOM_CONFIG.PRIORITY[tier];
  if (!config || typeof config === 'object' && 'earner' in config) {
    return false;
  }
  return (config as { tokens: number; pinMinutes: number; color: string; earnerMustReply: boolean }).earnerMustReply;
}

/**
 * Calculate revenue split for a multi-room monetization surface.
 * All splits are derived from MULTI_ROOM_CONFIG — no hardcoded percentages.
 *
 * Uses integer arithmetic: floor for earner, remainder to Avalo.
 * This ensures no floating-point rounding errors and total always equals input.
 *
 * @param tokens - Total tokens to split
 * @param surface - The monetization surface type
 * @returns Split amounts as integers
 */
export function calculateRoomSplit(
  tokens: number,
  surface: 'ENTRY' | 'RELOAD' | 'PRIORITY' | 'TIP',
): { earnerTokens: number; avaloTokens: number } {
  let earnerRate: number;

  switch (surface) {
    case 'ENTRY':
      earnerRate = MULTI_ROOM_CONFIG.ENTRY.SPLIT.earner;
      break;
    case 'RELOAD':
      earnerRate = MULTI_ROOM_CONFIG.RELOAD.SPLIT.earner;
      break;
    case 'PRIORITY':
      earnerRate = MULTI_ROOM_CONFIG.PRIORITY.SPLIT.earner;
      break;
    case 'TIP':
      earnerRate = MULTI_ROOM_CONFIG.TIPS.SPLIT.earner;
      break;
    default:
      throw new Error(`[multiRoomConfig] Unknown surface: ${surface}`);
  }

  // Integer arithmetic: floor for earner, remainder to platform
  const earnerTokens = Math.floor(tokens * earnerRate);
  const avaloTokens = tokens - earnerTokens;

  return { earnerTokens, avaloTokens };
}

/**
 * Validate that a tier name is a valid priority tier.
 */
export function isValidPriorityTier(tierName: string): tierName is PriorityTierName {
  return PRIORITY_TIERS.includes(tierName as PriorityTierName);
}

/**
 * Get the token cost for a specific priority tier.
 */
export function getPriorityTierTokenCost(tierName: PriorityTierName): number {
  return MULTI_ROOM_CONFIG.PRIORITY[tierName].tokens;
}

/**
 * Get the pin duration in minutes for a specific priority tier.
 */
export function getPriorityTierPinMinutes(tierName: PriorityTierName): number {
  return MULTI_ROOM_CONFIG.PRIORITY[tierName].pinMinutes;
}

/**
 * Validate entry fee is within allowed range.
 */
export function isValidEntryFee(tokens: number): boolean {
  return (
    Number.isInteger(tokens) &&
    tokens >= MULTI_ROOM_CONFIG.ENTRY.MIN_TOKENS &&
    tokens <= MULTI_ROOM_CONFIG.ENTRY.MAX_TOKENS
  );
}

/**
 * Validate reload amount meets minimum.
 */
export function isValidReloadAmount(tokens: number): boolean {
  return Number.isInteger(tokens) && tokens >= MULTI_ROOM_CONFIG.RELOAD.MIN_TOKENS;
}

/**
 * Validate tip amount meets minimum.
 */
export function isValidTipAmount(tokens: number): boolean {
  return Number.isInteger(tokens) && tokens >= MULTI_ROOM_CONFIG.TIPS.MIN_TOKENS;
}

/**
 * Validate guaranteed reply offer meets minimum.
 */
export function isValidGuaranteedReplyOffer(tokens: number): boolean {
  return Number.isInteger(tokens) && tokens >= MULTI_ROOM_CONFIG.GUARANTEED_REPLY.MIN_TOKENS;
}

/**
 * Validate max participants value is one of the allowed options.
 */
export function isValidCapacity(maxParticipants: number | null): boolean {
  return (MULTI_ROOM_CONFIG.CAPACITY.OPTIONS as readonly (number | null)[]).includes(maxParticipants);
}
