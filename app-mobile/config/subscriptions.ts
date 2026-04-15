/**
 * MOBILE SUBSCRIPTIONS CONFIG
 * Canonical business rules:
 * - subscription examples are reference only and not guaranteed
 * - subscriptions do NOT change token unit price
 * - call pricing perks apply only where enabled by the active subscription model
 */

export interface SubscriptionPerks {
  callDiscount: number;
  passport: boolean;
  incognito: boolean;
  priorityDiscovery: boolean;
  prioritySwipeQueue?: boolean;
  unlimitedDiscovery: boolean;
  swipeBoostDaily?: number;
  dailyBoosts?: number;
  earlyAccessFeatures?: boolean;
}

export interface SubscriptionTier {
  id: 'vip' | 'royal';
  name: string;
  monthlyPriceUSD: number;
  perks: SubscriptionPerks;
}

export const SUBSCRIPTIONS: Record<'vip' | 'royal', SubscriptionTier> = {
  vip: {
    id: 'vip',
    name: 'VIP',
    monthlyPriceUSD: 19.99,
    perks: {
      callDiscount: 0.30,
      passport: true,
      incognito: true,
      priorityDiscovery: true,
      unlimitedDiscovery: true,
      swipeBoostDaily: 1,
    },
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    monthlyPriceUSD: 34.99,
    perks: {
      callDiscount: 0.50,
      passport: true,
      incognito: true,
      priorityDiscovery: true,
      prioritySwipeQueue: true,
      unlimitedDiscovery: true,
      dailyBoosts: 2,
      earlyAccessFeatures: true,
    },
  },
} as const;

export function convertSubscriptionPrice(priceUSD: number, currency: string): number {
  const rates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    PLN: 4.0,
    GBP: 0.79,
  };

  return priceUSD * (rates[currency] || rates.USD);
}

export function getSubscriptionTier(tierId: 'vip' | 'royal'): SubscriptionTier {
  return SUBSCRIPTIONS[tierId];
}

export function hasPerk(tier: 'vip' | 'royal' | null, perk: keyof SubscriptionPerks): boolean {
  if (!tier) return false;
  const subscription = SUBSCRIPTIONS[tier];
  return Boolean(subscription.perks[perk]);
}

/**
 * Returns multiplier applied to call prices.
 * - Royal: 0.5
 * - VIP: 0.7
 * - Standard: 1.0
 */
export function getCallDiscountMultiplier(tier: 'vip' | 'royal' | null): number {
  if (!tier) return 1.0;
  const subscription = SUBSCRIPTIONS[tier];
  return 1 - subscription.perks.callDiscount;
}

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
