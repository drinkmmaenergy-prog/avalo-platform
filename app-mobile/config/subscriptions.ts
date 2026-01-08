/**
 * PACK 278 — Subscription Configuration
 * 
 * Defines VIP and Royal subscription tiers with perks, pricing, and features
 */

export interface SubscriptionPerks {
  callDiscount: number;              // 0.30 for VIP, 0.50 for Royal - ONLY for voice/video calls
  passport: boolean;                 // Location change feature
  incognito: boolean;                // Hide from discovery
  priorityDiscovery: boolean;        // Appear higher in discovery
  prioritySwipeQueue?: boolean;      // Only Royal - appear earlier in swipe
  unlimitedDiscovery: boolean;       // No daily limit
  swipeBoostDaily?: number;          // VIP gets 1
  dailyBoosts?: number;              // Royal gets 2
  earlyAccessFeatures?: boolean;     // Royal only - early feature access
}

export interface SubscriptionTier {
  id: 'vip' | 'royal';
  name: string;
  monthlyPricePLN: number;
  perks: SubscriptionPerks;
}

export const SUBSCRIPTIONS: Record<'vip' | 'royal', SubscriptionTier> = {
  vip: {
    id: 'vip',
    name: 'VIP',
    monthlyPricePLN: 69.99,
    perks: {
      callDiscount: 0.30,          // 30% discount ONLY on voice/video calls
      passport: true,
      incognito: true,
      priorityDiscovery: true,
      unlimitedDiscovery: true,
      swipeBoostDaily: 1,
    }
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    monthlyPricePLN: 119.99,
    perks: {
      callDiscount: 0.50,          // 50% discount ONLY on voice/video calls
      passport: true,
      incognito: true,
      priorityDiscovery: true,
      prioritySwipeQueue: true,
      unlimitedDiscovery: true,
      dailyBoosts: 2,
      earlyAccessFeatures: true,
    }
  }
} as const;

/**
 * Convert PLN price to other currencies for display
 * In production, use live exchange rates
 */
export function convertSubscriptionPrice(pricePLN: number, currency: string): number {
  const rates: Record<string, number> = {
    PLN: 1.0,
    USD: 0.25,
    EUR: 0.23,
    GBP: 0.20,
  };
  
  return pricePLN * (rates[currency] || rates.PLN);
}

/**
 * Get subscription tier by ID
 */
export function getSubscriptionTier(tierId: 'vip' | 'royal'): SubscriptionTier {
  return SUBSCRIPTIONS[tierId];
}

/**
 * Check if a perk is available for a tier
 */
export function hasPerk(tier: 'vip' | 'royal' | null, perk: keyof SubscriptionPerks): boolean {
  if (!tier) return false;
  const subscription = SUBSCRIPTIONS[tier];
  return Boolean(subscription.perks[perk]);
}

/**
 * Get call discount multiplier based on subscription
 * Returns the multiplier to apply to call prices
 * - Royal: 0.5 (50% discount)
 * - VIP: 0.7 (30% discount)
 * - Standard: 1.0 (no discount)
 *
 * NOTE: Discount applies ONLY to voice and video calls, NOT to:
 * - Text chat entry cost
 * - Paid messages
 * - Photo/video sending
 * - Voice messages in chat
 * - Tips/gifts
 * - Match boosts
 * - Any other chat monetization features
 */
export function getCallDiscountMultiplier(tier: 'vip' | 'royal' | null): number {
  if (!tier) return 1.0;
  const subscription = SUBSCRIPTIONS[tier];
  return 1 - subscription.perks.callDiscount;
}

/**
 * Platform-specific product IDs for IAP
 */
export const SUBSCRIPTION_PRODUCT_IDS = {
  vip: {
    ios: 'com.avalo.vip.monthly',
    android: 'com.avalo.vip.monthly',
    web: 'price_vip_monthly',
  },
  royal: {
    ios: 'com.avalo.royal.monthly',
    android: 'com.avalo.royal.monthly',
    web: 'price_royal_monthly',
  },
} as const;