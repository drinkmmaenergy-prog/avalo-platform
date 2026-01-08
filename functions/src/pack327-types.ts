/**
 * ============================================================================
 * PACK 327 — Creator Promo Bundles Types
 * ============================================================================
 * Combined packages: Subscriptions + Boosts + Bonus Tokens
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export type SubscriptionType = 'VIP' | 'ROYAL';

// ============================================================================
// BUNDLE INTERFACES
// ============================================================================

export interface PromoBundle {
  id: string;
  title: string;
  description: string;
  includes: {
    subscriptionType?: SubscriptionType;
    subscriptionDays?: number;
    boostDays?: number;
    boostMultiplier?: number;
    bonusTokens?: number;
  };
  pricePLN: number;
  priceTokensEquivalent: number;
  available: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PromoBundlePurchase {
  id: string;
  userId: string;
  bundleId: string;
  activatedAt: string;
  expiresAt: string;
  walletTransactionId?: string;
  subscriptionApplied?: boolean;
  boostApplied?: boolean;
  tokensCredited?: boolean;
  createdAt: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface PurchaseBundleRequest {
  bundleId: string;
  platform: 'WEB' | 'IOS' | 'ANDROID';
  paymentMethod?: 'stripe' | 'iap';
  paymentIntentId?: string;
  receiptData?: string;
}

export interface PurchaseBundleResponse {
  success: boolean;
  purchaseId: string;
  bundle: PromoBundle;
  applied: {
    subscription?: {
      type: SubscriptionType;
      expiresAt: string;
    };
    boost?: {
      expiresAt: string;
      multiplier: number;
    };
    tokens?: {
      amount: number;
      newBalance: number;
    };
  };
  error?: string;
}

export interface GetBundlesResponse {
  success: boolean;
  bundles: PromoBundle[];
}

export interface GetUserPurchasesResponse {
  success: boolean;
  purchases: PromoBundlePurchase[];
}

// ============================================================================
// ADMIN TYPES
// ============================================================================

export interface CreateBundleRequest {
  title: string;
  description: string;
  includes: PromoBundle['includes'];
  pricePLN: number;
}

export interface UpdateBundleRequest {
  bundleId: string;
  title?: string;
  description?: string;
  includes?: Partial<PromoBundle['includes']>;
  pricePLN?: number;
  available?: boolean;
}

export interface BundleAnalytics {
  bundleId: string;
  date: string;
  totalPurchases: number;
  totalRevenuePLN: number;
  platformBreakdown: {
    web: number;
    ios: number;
    android: number;
  };
  createdAt: string;
}

// ============================================================================
// DEFAULT BUNDLES
// ============================================================================

export const DEFAULT_BUNDLES: Omit<PromoBundle, 'id' | 'createdAt'>[] = [
  {
    title: 'Starter Boost',
    description: '7 days of profile boost + 100 bonus tokens to kickstart your visibility',
    includes: {
      boostDays: 7,
      boostMultiplier: 1.5,
      bonusTokens: 100,
    },
    pricePLN: 49.99,
    priceTokensEquivalent: 250,
    available: true,
  },
  {
    title: 'VIP Promo',
    description: '14 days VIP membership + profile boost + 300 bonus tokens',
    includes: {
      subscriptionType: 'VIP',
      subscriptionDays: 14,
      boostDays: 14,
      boostMultiplier: 2.0,
      bonusTokens: 300,
    },
    pricePLN: 129.99,
    priceTokensEquivalent: 650,
    available: true,
  },
  {
    title: 'Royal Growth',
    description: '30 days Royal Club + enhanced boost + 1000 bonus tokens',
    includes: {
      subscriptionType: 'ROYAL',
      subscriptionDays: 30,
      boostDays: 30,
      boostMultiplier: 3.0,
      bonusTokens: 1000,
    },
    pricePLN: 299.99,
    priceTokensEquivalent: 1500,
    available: true,
  },
];

// ============================================================================
// CONSTANTS
// ============================================================================

export const PACK327_CONFIG = {
  MIN_BUNDLE_PRICE_PLN: 10.0,
  MAX_BUNDLE_PRICE_PLN: 999.99,
  TOKEN_CONVERSION_RATE: 0.20, // 1 token = 0.20 PLN for calculation
  AVALO_REVENUE_SPLIT: 1.0, // 100% Avalo revenue, no creator split
} as const;