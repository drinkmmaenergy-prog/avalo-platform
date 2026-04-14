import { CANONICAL_ECONOMY } from "../../../shared/config/canonicalEconomy";

export const TOKEN_PAYOUT_USD = CANONICAL_ECONOMY.payout.tokenPayoutUsd;
export const PAYOUT_FEE_PLATFORM_PERCENT = CANONICAL_ECONOMY.payout.payoutFeePlatformPercent;
export const MIN_CHAT_CHARGE_TOKENS = CANONICAL_ECONOMY.chat.minChatChargeTokens;

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

export const TOKEN_PACKS = CANONICAL_ECONOMY.tokenPacks;
export const CANONICAL_ECONOMY_VERSION = CANONICAL_ECONOMY.meta.version;

export const INTERNAL_FX_RATES = {
  USD: 1,
  PLN: 1,
} as const;



export const CREATOR_REVENUE_SHARE = CANONICAL_ECONOMY.splits.chat.earner;

export const PAYOUT_PER_TOKEN_USD = TOKEN_PAYOUT_USD;
export const CREATOR_SHARE = CANONICAL_ECONOMY.splits.chat.earner;
export const PLATFORM_SHARE = CANONICAL_ECONOMY.splits.chat.platform;

