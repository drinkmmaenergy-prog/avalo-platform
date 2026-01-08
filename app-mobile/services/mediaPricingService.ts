/**
 * Media Pricing Service - PACK 42
 * Pay-Per-Action Media (PPM)
 * 
 * HARD CONSTRAINTS:
 * - Local data only (AsyncStorage)
 * - No backend, no Firestore, no Functions
 * - Deterministic pricing formula
 * - No free media sending/unlocking
 * - Must NOT break PACK 38, 39, 40, 41
 */

import { getProfileSignals } from './profileRankService';

// ============================================================================
// TYPES
// ============================================================================

export type MediaType = 'photo' | 'audio' | 'video';

export interface MediaPricingContext {
  senderId: string;
  receiverId: string;
  mediaType: MediaType;
  receiverHeatScore: number; // from PACK 40
}

export interface MediaPricingResult {
  tokenCost: number; // integer 4–18
  breakdown: string[]; // debug / logs / optional UI text
}

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

const PRICING_CONFIG = {
  BASE: 6,
  MEDIA_COST: {
    photo: 0,
    audio: 2,
    video: 4,
  },
  HEAT_MULTIPLIER: 0.08, // receiverHeatScore * 0.08 (0-8 range)
  MIN: 4,
  MAX: 18,
};

// ============================================================================
// PRICING CALCULATION
// ============================================================================

/**
 * Calculate media unlock price using deterministic local formula
 * 
 * Formula:
 * - base = 6 tokens
 * - photo: +0, audio: +2, video: +4
 * - + receiverHeatScore * 0.08 (0–8)
 * - Clamp to min=4, max=18
 * - Round to nearest integer
 * 
 * NO discounts. NO free unlock. Deterministic local only.
 */
export async function calculateMediaPrice(
  context: MediaPricingContext
): Promise<MediaPricingResult> {
  const breakdown: string[] = [];
  
  // Base cost
  let cost = PRICING_CONFIG.BASE;
  breakdown.push(`Base: ${PRICING_CONFIG.BASE} tokens`);
  
  // Media type cost
  const mediaCost = PRICING_CONFIG.MEDIA_COST[context.mediaType];
  cost += mediaCost;
  if (mediaCost > 0) {
    breakdown.push(`${context.mediaType}: +${mediaCost} tokens`);
  }
  
  // Heat score multiplier
  const heatContribution = context.receiverHeatScore * PRICING_CONFIG.HEAT_MULTIPLIER;
  cost += heatContribution;
  breakdown.push(
    `Receiver heat (${context.receiverHeatScore}): +${heatContribution.toFixed(2)} tokens`
  );
  
  // Clamp to min/max
  const unclamped = cost;
  cost = Math.max(PRICING_CONFIG.MIN, Math.min(PRICING_CONFIG.MAX, cost));
  
  if (cost !== unclamped) {
    breakdown.push(`Clamped: ${unclamped.toFixed(2)} → ${cost.toFixed(2)}`);
  }
  
  // Round to nearest integer
  const tokenCost = Math.round(cost);
  breakdown.push(`Final: ${tokenCost} tokens`);
  
  if (__DEV__) {
    console.log('[MediaPricing] Calculated price:', {
      senderId: context.senderId,
      receiverId: context.receiverId,
      mediaType: context.mediaType,
      receiverHeatScore: context.receiverHeatScore,
      tokenCost,
      breakdown,
    });
  }
  
  return {
    tokenCost,
    breakdown,
  };
}

/**
 * Calculate media price with automatic heat score lookup
 * Convenience function that fetches receiver's heat score from PACK 40
 */
export async function calculateMediaPriceAuto(
  senderId: string,
  receiverId: string,
  mediaType: MediaType
): Promise<MediaPricingResult> {
  // Get receiver's profile signals from PACK 40
  const receiverSignals = await getProfileSignals(receiverId);
  
  return calculateMediaPrice({
    senderId,
    receiverId,
    mediaType,
    receiverHeatScore: receiverSignals.heatScore,
  });
}

/**
 * Get pricing info for UI display (without calculation)
 * Returns the pricing rules for display purposes
 */
export function getPricingInfo(): {
  base: number;
  mediaTypeCosts: Record<MediaType, number>;
  min: number;
  max: number;
  heatMultiplier: number;
} {
  return {
    base: PRICING_CONFIG.BASE,
    mediaTypeCosts: { ...PRICING_CONFIG.MEDIA_COST },
    min: PRICING_CONFIG.MIN,
    max: PRICING_CONFIG.MAX,
    heatMultiplier: PRICING_CONFIG.HEAT_MULTIPLIER,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateMediaPrice,
  calculateMediaPriceAuto,
  getPricingInfo,
};