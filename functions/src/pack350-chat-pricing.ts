/**
 * PACK 350 - Chat Pricing with Subscription Word Buckets
 * 
 * Integrates subscription tiers with chat monetization
 * - ROYAL: 7-word buckets (when earning)
 * - Standard: 11-word buckets
 * - VIP: NO change to chat pricing (still 11-word buckets)
 * - No changes to revenue splits (65/35)
 * - No changes to entry price (100 tokens)
 */

import {
  getEffectiveSubscriptionTier,
  getChatWordBucket,
  SubscriptionTier,
} from './pack350-subscriptions.js';

/**
 * Get word bucket size for a chat earner based on their subscription tier
 * This determines how many words = 1 token when they're earning
 * 
 * IMPORTANT: Only affects EARNING users, not payers
 */
export async function getPack350ChatWordBucket(params: {
  earnerId: string;
}): Promise<{
  wordsPerToken: number;
  tier: SubscriptionTier;
}> {
  const { earnerId } = params;
  
  // Get earner's subscription tier
  const tier = await getEffectiveSubscriptionTier(earnerId);
  
  // Get word bucket for tier
  const wordsPerToken = getChatWordBucket(tier);
  
  return {
    wordsPerToken,
    tier,
  };
}

/**
 * Calculate earnings split for chat (65/35)
 * IMPORTANT: No changes to revenue splits, only word bucket sizes
 */
export function calculateChatEarningsSplit(totalTokens: number): {
  earnerReceives: number;
  platformReceives: number;
} {
  const earnerReceives = Math.floor(totalTokens * 0.65);  // 65% to earner
  const platformReceives = totalTokens - earnerReceives;   // 35% to platform
  
  return {
    earnerReceives,
    platformReceives,
  };
}

/**
 * Standard chat entry price
 * IMPORTANT: No changes regardless of subscription tier
 */
export const CHAT_ENTRY_PRICE = 100;  // tokens
