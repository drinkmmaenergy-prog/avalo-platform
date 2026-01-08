/**
 * AI Companions Aggressive Monetization Configuration
 * Priority: Avalo MUST earn more than creators
 * 
 * Rules enforced in this config:
 * - 35% instant platform fee on deposits
 * - 20% ongoing revenue share from consumed tokens
 * - Push users toward paid chat aggressively
 * - VIP/Royal discounts to drive subscriptions
 */

// ============================================================================
// AI BOT PRICING
// ============================================================================

export const AI_BOT_CONFIG = {
  /** Minimum price creator can set per message (tokens) */
  MIN_PRICE_PER_MESSAGE: 1,
  
  /** Maximum price creator can set per message (tokens) */
  MAX_PRICE_PER_MESSAGE: 8,
  
  /** Recommended price (shown in UI as optimal) */
  RECOMMENDED_PRICE: 5,
  
  /** Free welcome messages before payment required */
  FREE_WELCOME_MESSAGES: 3,
  
  /** Royal members get more free messages */
  FREE_WELCOME_MESSAGES_ROYAL: 5, // +2 bonus
} as const;

// ============================================================================
// DEPOSIT & BILLING
// ============================================================================

export const AI_CHAT_DEPOSIT = {
  /** Required deposit to continue chat after free messages */
  REQUIRED_DEPOSIT: 100,
  
  /** Instant platform fee (taken immediately, non-refundable) */
  INSTANT_PLATFORM_FEE_PERCENT: 35,
  INSTANT_PLATFORM_FEE: 35, // 35 tokens
  
  /** Escrow amount available for chat */
  ESCROW_AMOUNT: 65, // 100 - 35 = 65 tokens
  
  /** Low balance warning threshold */
  LOW_BALANCE_WARNING: 20,
  
  /** Auto-show deposit reminder at this balance */
  AUTO_DEPOSIT_REMINDER: 15,
} as const;

// ============================================================================
// REVENUE SPLIT (from consumed escrow)
// ============================================================================

export const AI_REVENUE_SPLIT = {
  /** Creator receives 80% of consumed tokens */
  CREATOR_PERCENT: 80,
  
  /** Avalo receives 20% of consumed tokens */
  AVALO_PERCENT: 20,
  
  /** Total Avalo earnings per 100-token deposit: 35 (instant) + ~13 (20% of 65) = ~48 tokens */
  TOTAL_AVALO_PER_100_DEPOSIT: 48,
} as const;

// ============================================================================
// WORD-BASED BILLING (consistent with human chat)
// ============================================================================

export const AI_WORD_BILLING = {
  /** Standard users: 11 words = 1 token */
  WORDS_PER_TOKEN_STANDARD: 11,
  
  /** Royal users: 7 words = 1 token (43% discount) */
  WORDS_PER_TOKEN_ROYAL: 7,
  
  /** VIP users: same as standard for AI chats */
  WORDS_PER_TOKEN_VIP: 11,
} as const;

// ============================================================================
// MEMBERSHIP DISCOUNTS (drive VIP/Royal upgrades)
// ============================================================================

export const AI_MEMBERSHIP_BENEFITS = {
  VIP: {
    /** VIP gets 50% discount on call pricing (not AI chat billing) */
    CALL_DISCOUNT: 0.50,
    
    /** No discount on AI chat word billing */
    WORD_BILLING_BONUS: false,
    
    /** Display message */
    DISPLAY: 'VIP: -50% on Voice/Video calls',
  },
  ROYAL: {
    /** Royal gets 50% discount on calls */
    CALL_DISCOUNT: 0.50,
    
    /** Royal gets better word billing (7 vs 11) */
    WORD_BILLING_BONUS: true,
    
    /** Royal gets 2 extra free welcome messages */
    EXTRA_FREE_MESSAGES: 2,
    
    /** Display messages */
    DISPLAY_PRIMARY: 'Royal: -50% calls + Better billing',
    DISPLAY_SECONDARY: '+20% more free messages (5 instead of 3)',
  },
} as const;

// ============================================================================
// 18+ CONTENT MONETIZATION
// ============================================================================

export const NSFW_CONFIG = {
  /** Age verification required */
  AGE_VERIFICATION_REQUIRED: true,
  
  /** Minimum age */
  MIN_AGE: 18,
  
  /** NSFW content requires tokens */
  REQUIRES_TOKENS: true,
  
  /** Minimum deposit for NSFW chat */
  MIN_DEPOSIT_FOR_NSFW: 100,
  
  /** Encourage creators to upload photo packs */
  PHOTO_PACK_ENCOURAGED: true,
  
  /** Photo pack pricing range (tokens per photo) */
  PHOTO_PACK_MIN_PRICE: 10,
  PHOTO_PACK_MAX_PRICE: 50,
} as const;

// ============================================================================
// UI MONETIZATION TRIGGERS
// ============================================================================

export const UI_TRIGGERS = {
  /** Show "add photos" modal if earnings below threshold */
  LOW_EARNINGS_THRESHOLD: 50, // tokens earned in last 7 days
  
  /** Recommended pricing message */
  LOW_PRICE_MESSAGE: 'Recommended price: 5 tokens. Higher prices convert better.',
  
  /** Show at this price point */
  LOW_PRICE_TRIGGER: 3,
  
  /** NSFW photo pack CTA */
  NSFW_PHOTO_PACK_CTA: 'Upload photo pack (sold per token) to increase earnings',
  
  /** Conversion optimization message */
  LOW_CONVERSION_MESSAGE: 'Add attractive photos and description to increase chat conversions',
} as const;

// ============================================================================
// CREATOR DASHBOARD ANALYTICS
// ============================================================================

export interface BotEarningsPeriod {
  last7Days: number;
  last30Days: number;
  lifetime: number;
}

export interface BotAnalytics {
  revenue: BotEarningsPeriod;
  messages: {
    total: number;
    paid: number;
    free: number;
  };
  conversions: {
    totalUsers: number;
    paidUsers: number;
    conversionRate: number; // percentage
  };
  avgRevenuePerUser: number;
}

// ============================================================================
// RANKING & LEADERBOARD
// ============================================================================

export const LEADERBOARD_CONFIG = {
  /** Top N creators get bonus */
  TOP_CREATORS_BONUS: 10,
  
  /** Bonus reward for top 10 (tokens) */
  TOP_10_BONUS: 500,
  
  /** Ranking points = tokens earned */
  POINTS_PER_TOKEN: 1,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate total cost for AI message
 * Formula: Base price + (word count / words per token)
 */
export function calculateAIMessageCost(
  basePricePerMessage: number,
  wordCount: number,
  isRoyal: boolean
): number {
  const wordsPerToken = isRoyal 
    ? AI_WORD_BILLING.WORDS_PER_TOKEN_ROYAL 
    : AI_WORD_BILLING.WORDS_PER_TOKEN_STANDARD;
  
  const wordBasedCost = Math.round(wordCount / wordsPerToken);
  const totalCost = basePricePerMessage + wordBasedCost;
  
  return totalCost;
}

/**
 * Calculate creator earnings from consumed tokens
 */
export function calculateCreatorEarnings(consumedTokens: number): {
  creatorAmount: number;
  avaloAmount: number;
} {
  const creatorAmount = Math.floor(consumedTokens * (AI_REVENUE_SPLIT.CREATOR_PERCENT / 100));
  const avaloAmount = consumedTokens - creatorAmount;
  
  return { creatorAmount, avaloAmount };
}

/**
 * Calculate total Avalo earnings from deposit
 */
export function calculateAvaloTotalEarnings(
  depositAmount: number,
  tokensConsumed: number
): {
  instantFee: number;
  revenueShare: number;
  total: number;
} {
  const instantFee = Math.floor(depositAmount * (AI_CHAT_DEPOSIT.INSTANT_PLATFORM_FEE_PERCENT / 100));
  const revenueShare = Math.floor(tokensConsumed * (AI_REVENUE_SPLIT.AVALO_PERCENT / 100));
  
  return {
    instantFee,
    revenueShare,
    total: instantFee + revenueShare,
  };
}

/**
 * Get free message count based on membership
 */
export function getFreeMessageCount(isRoyal: boolean): number {
  return isRoyal 
    ? AI_BOT_CONFIG.FREE_WELCOME_MESSAGES_ROYAL 
    : AI_BOT_CONFIG.FREE_WELCOME_MESSAGES;
}

/**
 * Check if price needs recommendation
 */
export function shouldShowPriceRecommendation(pricePerMessage: number): boolean {
  return pricePerMessage < UI_TRIGGERS.LOW_PRICE_TRIGGER;
}

/**
 * Get pricing recommendation message
 */
export function getPricingRecommendation(pricePerMessage: number): string | null {
  if (shouldShowPriceRecommendation(pricePerMessage)) {
    return UI_TRIGGERS.LOW_PRICE_MESSAGE;
  }
  return null;
}

/**
 * Calculate conversion rate
 */
export function calculateConversionRate(totalUsers: number, paidUsers: number): number {
  if (totalUsers === 0) return 0;
  return Math.round((paidUsers / totalUsers) * 100);
}

/**
 * Format token amount for display
 */
export function formatTokens(amount: number): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toString();
}

/**
 * Calculate earnings breakdown preview for bot editor
 */
export function calculateEarningsPreview(pricePerMessage: number, avgWordCount: number = 50): {
  userPays: number;
  creatorEarns: number;
  avaloEarns: number;
  breakdown: string;
} {
  // Assume standard user
  const totalCost = calculateAIMessageCost(pricePerMessage, avgWordCount, false);
  const { creatorAmount, avaloAmount } = calculateCreatorEarnings(totalCost);
  
  return {
    userPays: totalCost,
    creatorEarns: creatorAmount,
    avaloEarns: avaloAmount,
    breakdown: `User pays ${totalCost} tokens → You earn ${creatorAmount} tokens (${AI_REVENUE_SPLIT.CREATOR_PERCENT}%)`,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  AI_BOT_CONFIG,
  AI_CHAT_DEPOSIT,
  AI_REVENUE_SPLIT,
  AI_WORD_BILLING,
  AI_MEMBERSHIP_BENEFITS,
  NSFW_CONFIG,
  UI_TRIGGERS,
  LEADERBOARD_CONFIG,
  
  // Helper functions
  calculateAIMessageCost,
  calculateCreatorEarnings,
  calculateAvaloTotalEarnings,
  getFreeMessageCount,
  shouldShowPriceRecommendation,
  getPricingRecommendation,
  calculateConversionRate,
  formatTokens,
  calculateEarningsPreview,
};