/**
 * PACK 350 - Call Pricing with Subscription Discounts
 * 
 * Integrates subscription tiers with call pricing
 * - VIP: 30% discount on voice/video
 * - ROYAL: 50% discount on voice/video
 * - No changes to revenue splits (80/20)
 */

import {
  getEffectiveSubscriptionTier,
  getVoiceDiscountPercent,
  getVideoDiscountPercent,
  SubscriptionTier,
} from './pack350-subscriptions.js';
import type { CallType } from './callMonetization.js';

// Base prices (same as in callMonetization.ts)
const BASE_VOICE_COST = 10;  // tokens per minute
const BASE_VIDEO_COST = 20;  // tokens per minute

/**
 * Get per-minute cost for a call based on payer's subscription tier
 * Applies VIP/Royal discounts
 */
export async function getPack350CallMinuteCost(params: {
  payerId: string;
  callType: CallType;
}): Promise<{
  pricePerMinute: number;
  tier: SubscriptionTier;
  discountPercent: number;
}> {
  const { payerId, callType } = params;
  
  // Get payer's subscription tier
  const tier = await getEffectiveSubscriptionTier(payerId);
  
  // Determine base cost
  const baseCost = callType === 'VOICE' ? BASE_VOICE_COST : BASE_VIDEO_COST;
  
  // Get discount percent for tier
  const discountPercent = callType === 'VOICE'
    ? getVoiceDiscountPercent(tier)
    : getVideoDiscountPercent(tier);
  
  // Apply discount
  const discountMultiplier = 1 - (discountPercent / 100);
  const pricePerMinute = Math.ceil(baseCost * discountMultiplier);
  
  return {
    pricePerMinute,
    tier,
    discountPercent,
  };
}

/**
 * Calculate earnings split for calls (80/20)
 * IMPORTANT: No changes to revenue splits, only pricing discounts
 */
export function calculateCallEarningsSplit(totalTokens: number): {
  earnerReceives: number;
  avaloReceives: number;
} {
  const earnerReceives = Math.floor(totalTokens * 0.80);  // 80% to earner
  const avaloReceives = totalTokens - earnerReceives;     // 20% to Avalo
  
  return {
    earnerReceives,
    avaloReceives,
  };
}
