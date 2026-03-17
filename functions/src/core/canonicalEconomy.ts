import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";
import { AI_ECONOMY } from '../config/aiEconomyConfig';

export const CANONICAL_ECONOMY = {

  CURRENCY: "USD",

  TOKEN_PAYOUT_USD: 0.03,

  SPLIT: {
    CREATOR: MONETIZATION_SPLITS.CHAT.earner,
    PLATFORM: MONETIZATION_SPLITS.CHAT.platform
  },

  /**
   * AI bot billing rate: number of words per 1 token.
   * Business rule: 30 words of AI response = 1 token charged from escrow.
   * Sourced from canonical AI_ECONOMY config.
   */
  AI_WORDS_PER_TOKEN: AI_ECONOMY.USER_BOTS.WORDS_PER_TOKEN,

  MIN_WITHDRAWAL_USD: 50

};

/**
 * AI subscription tokens reference.
 * Subscriptions are paid in tokens, not USD, to avoid Apple/Google IAP commission.
 * See aiEconomyConfig.ts for full AI economy configuration.
 */
export const AI_SUB_TOKENS = {
  CONNECT: AI_ECONOMY.AVALO_AI.SUBSCRIPTION.CONNECT.tokensPerMonth,
  PREMIUM: AI_ECONOMY.AVALO_AI.SUBSCRIPTION.PREMIUM.tokensPerMonth,
};




























