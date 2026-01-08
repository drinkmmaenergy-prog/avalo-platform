/**
 * PACK 340 - AI Companions UI Utilities
 * Shared utility functions for formatting and calculations
 */

import type { AICompanion, UserTier, SessionType } from './types';

/**
 * Calculate effective price with VIP/Royal discounts
 * Chat text: NO discount
 * Voice/Video: VIP -30%, Royal -50%
 */
export function calculateEffectivePrice(
  basePrice: number,
  sessionType: SessionType,
  userTier: UserTier
): { price: number; discount: number } {
  // Chat text: always full price (no discounts)
  if (sessionType === 'CHAT') {
    return { price: basePrice, discount: 0 };
  }

  // Voice/Video: apply tier discounts
  let discount = 0;
  if (userTier.tier === 'VIP') {
    discount = 30;
  } else if (userTier.tier === 'ROYAL') {
    discount = 50;
  }

  const discountedPrice = Math.floor(basePrice * (1 - discount / 100));
  return { price: discountedPrice, discount };
}

/**
 * Format token amount with commas
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * Format duration in seconds to readable time
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format rating with star emoji
 */
export function formatRating(rating: number): string {
  return `⭐ ${rating.toFixed(1)}`;
}

/**
 * Get creator badge text
 */
export function getCreatorBadge(companion: AICompanion): { text: string; color: string } {
  if (companion.creatorType === 'AVALO') {
    return { text: 'AVALO AI', color: '#007AFF' };
  }
  return { text: 'USER AI', color: '#8E8E93' };
}

/**
 * Check if user can access AI companions
 */
export function canAccessAICompanions(userTier: UserTier, isErotic: boolean, geoBlockAI: boolean): {
  allowed: boolean;
  reason?: string;
} {
  // Age verification required
  if (!userTier.ageVerified) {
    return { allowed: false, reason: 'Age verification required. Users must be 18+ to access AI companions.' };
  }

  // Geo block
  if (geoBlockAI) {
    return { allowed: false, reason: 'AI companions are not available in your region due to local regulations.' };
  }

  // Erotic content block
  if (isErotic && geoBlockAI) {
    return { allowed: false, reason: 'Adult AI content is not available in your region.' };
  }

  return { allowed: true };
}

/**
 * Calculate estimated cost for a session
 */
export function estimateSessionCost(
  companion: AICompanion,
  sessionType: SessionType,
  estimatedDuration: number, // in seconds for voice/video, in words for chat
  userTier: UserTier
): number {
  if (sessionType === 'CHAT') {
    const buckets = Math.ceil(estimatedDuration / companion.wordsPerBucket);
    return buckets * companion.chatBucketPrice;
  }

  if (sessionType === 'VOICE') {
    const minutes = Math.ceil(estimatedDuration / 60);
    const { price } = calculateEffectivePrice(companion.voicePricePerMinute, 'VOICE', userTier);
    return minutes * price;
  }

  if (sessionType === 'VIDEO') {
    const minutes = Math.ceil(estimatedDuration / 60);
    const { price } = calculateEffectivePrice(companion.videoPricePerMinute, 'VIDEO', userTier);
    return minutes * price;
  }

  return 0;
}

/**
 * Validate if user has sufficient tokens
 */
export function hasSufficientTokens(
  userBalance: number,
  requiredTokens: number
): { sufficient: boolean; shortfall?: number } {
  if (userBalance >= requiredTokens) {
    return { sufficient: true };
  }
  return { sufficient: false, shortfall: requiredTokens - userBalance };
}

/**
 * Filter companions by geo restrictions
 */
export function filterCompanionsByGeo(
  companions: AICompanion[],
  blockErotic: boolean
): AICompanion[] {
  if (!blockErotic) {
    return companions;
  }
  return companions.filter(c => !c.isErotic);
}

/**
 * Sort companions
 */
export function sortCompanions(
  companions: AICompanion[],
  sortBy: 'popular' | 'new' | 'priceLow' | 'priceHigh' | 'rating'
): AICompanion[] {
  const sorted = [...companions];

  switch (sortBy) {
    case 'popular':
      return sorted.sort((a, b) => b.totalChats - a.totalChats);
    
    case 'new':
      return sorted.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    
    case 'priceLow':
      return sorted.sort((a, b) => a.chatBucketPrice - b.chatBucketPrice);
    
    case 'priceHigh':
      return sorted.sort((a, b) => b.chatBucketPrice - a.chatBucketPrice);
    
    case 'rating':
      return sorted.sort((a, b) => b.averageRating - a.averageRating);
    
    default:
      return sorted;
  }
}
