import { CANONICAL_ECONOMY } from "../../../shared/config/canonicalEconomy";

export type TokenPack = {
  packId: string;
  tokens: number;
  price: number;
  displayName: string;
  popular?: boolean;
  bonus?: number;
};


export const TOKEN_PACKS: TokenPack[] = [
  { packId: "mini_100", tokens: 100, price: 9.99, displayName: "Mini 100", popular: false, bonus: 0 },
  { packId: "basic_300", tokens: 300, price: 26.99, displayName: "Basic 300", popular: false, bonus: 0 },
  { packId: "standard_500", tokens: 500, price: 42.99, displayName: "Standard 500", popular: true, bonus: 0 },
  { packId: "premium_1000", tokens: 1000, price: 76.99, displayName: "Premium 1000", popular: false, bonus: 0 },
  { packId: "pro_2000", tokens: 2000, price: 147.99, displayName: "Pro 2000", popular: false, bonus: 0 },
  { packId: "elite_5000", tokens: 5000, price: 353.99, displayName: "Elite 5000", popular: false, bonus: 0 },
  { packId: "royal_10000", tokens: 10000, price: 674.99, displayName: "Royal 10000", popular: false, bonus: 0 },
];

export const CALL_CONFIG = {
  VOICE: {
    AVALO_CUT_PERCENT: CANONICAL_ECONOMY.splits.callVoice.platform,
    EARNER_CUT_PERCENT: CANONICAL_ECONOMY.splits.callVoice.earner,
    LEGACY_BASE_COST_STANDARD: 1,
    LEGACY_BASE_COST_VIP: 1,
    LEGACY_BASE_COST_ROYAL: 1,
  },
  VIDEO: {
    AVALO_CUT_PERCENT: CANONICAL_ECONOMY.splits.callVideo.platform,
    EARNER_CUT_PERCENT: CANONICAL_ECONOMY.splits.callVideo.earner,
    LEGACY_BASE_COST_STANDARD: 1,
    LEGACY_BASE_COST_VIP: 1,
    LEGACY_BASE_COST_ROYAL: 1,
  },
} as const;

export const AI_CHAT_CONFIG = {
  BASIC_MESSAGE_COST: 1,
  PREMIUM_MESSAGE_COST: 2,
  NSFW_MESSAGE_COST: 4,
} as const;

export const CHAT_PRICING = {
  STANDARD: {
    wordsPerToken: CANONICAL_ECONOMY.chat.tiers.STANDARD.wordsPerToken,
    freeMessagesPerUser: CANONICAL_ECONOMY.chat.tiers.STANDARD.freeMessagesPerUser,
  },
  ROYAL: {
    wordsPerToken: CANONICAL_ECONOMY.chat.tiers.ROYAL.wordsPerToken,
    freeMessagesPerUser: CANONICAL_ECONOMY.chat.tiers.ROYAL.freeMessagesPerUser,
  },
  DEFAULT_DEPOSIT_TOKENS: CANONICAL_ECONOMY.chat.defaultDepositTokens,
  DEPOSIT_PLATFORM_FEE_PCT: CANONICAL_ECONOMY.chat.depositPlatformFeePct,
  DEPOSIT_ESCROW_PCT: CANONICAL_ECONOMY.chat.depositEscrowPct,
  CHAT_EXPIRY_HOURS: CANONICAL_ECONOMY.chat.chatExpiryInactivityHours,
  BURN_MULTIPLIERS: CANONICAL_ECONOMY.chat.allowedBurnMultipliers,
} as const;

export function getTokenPackById(packId: string): TokenPack | null {
  return TOKEN_PACKS.find((p) => p.packId === packId) ?? null;
}

export function getTotalTokensForPack(packId: string): number {
  return getTokenPackById(packId)?.tokens ?? 0;
}

export function isValidBurnMultiplier(value: number): boolean {
  return CANONICAL_ECONOMY.chat.allowedBurnMultipliers.includes(value as never);
}

export const CHAT_CONFIG_COMPAT = {
  STANDARD: CHAT_PRICING.STANDARD,
  ROYAL: CHAT_PRICING.ROYAL,
  DEFAULT_DEPOSIT_TOKENS: CHAT_PRICING.DEFAULT_DEPOSIT_TOKENS,
  LEGACY_CHAT_DEPOSIT_TOKENS: CHAT_PRICING.DEFAULT_DEPOSIT_TOKENS,
  LEGACY_PLATFORM_FEE_PERCENT: CHAT_PRICING.DEPOSIT_PLATFORM_FEE_PCT * 100,
  LEGACY_ESCROW_PERCENT: CHAT_PRICING.DEPOSIT_ESCROW_PCT * 100,
  DEPOSIT_PLATFORM_FEE_PCT: CHAT_PRICING.DEPOSIT_PLATFORM_FEE_PCT,
  DEPOSIT_ESCROW_PCT: CHAT_PRICING.DEPOSIT_ESCROW_PCT,
  CHAT_EXPIRY_HOURS: CHAT_PRICING.CHAT_EXPIRY_HOURS,
  BURN_MULTIPLIERS: CHAT_PRICING.BURN_MULTIPLIERS,
} as const;







