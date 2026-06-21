/**
 * =====================================================
 * AI ECONOMY CONFIG — Canonical Single Source of Truth
 * =====================================================
 *
 * This file is the ONE AND ONLY source of truth for all AI economy values.
 * No other file should hardcode AI billing values — they must import from here.
 *
 * Covers:
 * - Avalo AI companion subscription tiers (paid in tokens, not USD)
 * - Creator bot billing rules (30 words per token, 65/35 split)
 * - Premium token actions (voice, video, photo unlock, scenarios)
 * - Payment architecture (Stripe web only, no IAP)
 *
 * Business model:
 * - Avalo AI: subscription tiers paid in tokens → 100% Avalo revenue
 * - Creator bots: free to create, deposit-based billing → 65/35 split (owner/Avalo)
 * - Premium actions: per-minute or per-unlock token costs
 * - All purchases via Stripe web to avoid Apple/Google 15-30% commission
 *
 * @module config/aiEconomyConfig
 * @version 1.0.0
 */

// ============================================================================
// MAIN CONFIG OBJECT
// ============================================================================

export const AI_ECONOMY = {
  AVALO_AI: {
    SUBSCRIPTION: {
      FREE: {
        tokensPerMonth: 0,
        dailyMsgLimit: 10,
        companionLimit: 3,
        nsfwAccess: false,
        voiceIncludedMin: 0,
      },
      CONNECT: {
        tokensPerMonth: 120,
        dailyMsgLimit: -1,
        companionLimit: -1,
        nsfwAccess: false,
        voiceIncludedMin: 0,
      },
      PREMIUM: {
        tokensPerMonth: 175,
        dailyMsgLimit: -1,
        companionLimit: -1,
        nsfwAccess: true,
        voiceIncludedMin: 100,
      },
    },
    REVENUE: 'AVALO_100_PERCENT' as const,
  },
  USER_BOTS: {
    CREATION_FREE: true,
    BOT_LIMIT: null,
    ACCESS: 'ALL_USERS' as const,
    WORDS_PER_TOKEN: 30,
    MAX_BILLABLE_WORDS: 300,
    MIN_BILLABLE_WORDS: 10,
    FREE_MESSAGES: 3,
    FREE_MESSAGES_ROYAL: 5,
    MIN_DEPOSIT: 100,
    SPLIT: {
      owner: 0.65,
      avalo: 0.35,
    },
  },
  PREMIUM_ACTIONS: {
    VOICE_PER_MIN: {
      STANDARD: 10,
      VIP: 7,
      ROYAL: 5,
    },
    VIDEO_PER_MIN: 15,
    PHOTO_UNLOCK_MIN: 10,
    PHOTO_UNLOCK_MAX: 50,
    CUSTOM_SCENARIO: 50,
  },
  PAYMENT: {
    GATEWAY: 'STRIPE_WEB_ONLY' as const,
    MOBILE_REDIRECT_URL: 'avaloapp.com/wallet/buy',
    TOKEN_PAYOUT_USD: 0.04,
    NO_IAP: true,
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate billable word count for an AI bot response.
 * Business rule:
 *   - Responses under 10 words: 0 tokens (too short to bill)
 *   - Responses 10-300 words: bill actual word count
 *   - Responses over 300 words: cap at 300 (anti-padding protection)
 * This ensures AI cannot artificially inflate responses to drain user escrow.
 */
export function getBillableWords(wordCount: number): number {
  if (wordCount < AI_ECONOMY.USER_BOTS.MIN_BILLABLE_WORDS) {
    return 0;
  }
  if (wordCount > AI_ECONOMY.USER_BOTS.MAX_BILLABLE_WORDS) {
    return AI_ECONOMY.USER_BOTS.MAX_BILLABLE_WORDS;
  }
  return wordCount;
}

/**
 * Get revenue split for user-created bot interactions.
 * Business rule: 65% to bot owner (earner), 35% to Avalo platform.
 * This is different from human chat which also uses 65/35 but from a different escrow.
 */
export function getAIBotSplit(): { owner: number; avalo: number } {
  return {
    owner: AI_ECONOMY.USER_BOTS.SPLIT.owner,
    avalo: AI_ECONOMY.USER_BOTS.SPLIT.avalo,
  };
}

/**
 * Get monthly token cost for an Avalo AI subscription tier.
 * Business rule: subscriptions are paid in tokens, not USD.
 * This avoids Apple/Google IAP commission (15-30%).
 * Tokens were already purchased via Stripe web.
 */
export function getAISubTokenCost(tier: 'FREE' | 'CONNECT' | 'PREMIUM'): number {
  return AI_ECONOMY.AVALO_AI.SUBSCRIPTION[tier].tokensPerMonth;
}

/**
 * Get per-minute voice token cost based on membership tier.
 * Business rule: VIP and Royal members get discounts to incentivize upgrades.
 */
export function getVoicePriceTokens(memberTier: 'STANDARD' | 'VIP' | 'ROYAL'): number {
  return AI_ECONOMY.PREMIUM_ACTIONS.VOICE_PER_MIN[memberTier];
}

/**
 * Check if a subscription tier includes NSFW content access.
 * Business rule: NSFW requires age verification AND PREMIUM subscription.
 */
export function isSubTierNSFW(tier: 'FREE' | 'CONNECT' | 'PREMIUM'): boolean {
  return AI_ECONOMY.AVALO_AI.SUBSCRIPTION[tier].nsfwAccess;
}



