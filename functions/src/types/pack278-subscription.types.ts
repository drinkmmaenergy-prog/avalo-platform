/**
 * PACK 278 — Subscription Types
 * 
 * Type definitions for VIP and Royal subscription system
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Subscription tier identifiers
 */
export type SubscriptionTier = 'vip' | 'royal' | null;

/**
 * Platform where subscription was purchased
 */
export type SubscriptionPlatform = 'android' | 'ios' | 'web';

/**
 * Subscription status
 */
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending';

/**
 * Subscription perks available to users
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

/**
 * Subscription record stored in Firestore
 * Collection: subscriptions/{userId}
 */
export interface SubscriptionData {
  userId: string;
  tier: SubscriptionTier;
  active: boolean;
  renewalDate: string;               // ISO datetime string
  platform: SubscriptionPlatform;
  lastUpdated: string;               // ISO datetime string
  
  // Purchase details
  purchaseToken?: string;            // For mobile IAP verification
  subscriptionId?: string;           // Stripe subscription ID for web
  productId?: string;                // Product ID from store
  
  // Cancellation tracking
  cancelledAt?: string;
  cancellationReason?: string;
  
  // Historical data
  createdAt: string;
  previousTiers?: {
    tier: SubscriptionTier;
    startDate: string;
    endDate: string;
  }[];
}

/**
 * Purchase validation request
 */
export interface SubscriptionPurchaseRequest {
  tier: 'vip' | 'royal';
  platform: SubscriptionPlatform;
  
  // Web (Stripe)
  subscriptionId?: string;
  
  // Mobile (iOS/Android)
  receiptData?: string;
  productId?: string;
  purchaseToken?: string;
}

/**
 * Purchase validation response
 */
export interface SubscriptionPurchaseResponse {
  success: boolean;
  tier: 'vip' | 'royal';
  renewalDate: string;
  platform: SubscriptionPlatform;
  subscriptionId?: string;
  error?: string;
}

/**
 * User subscription state with perks
 */
export interface UserSubscriptionState {
  tier: SubscriptionTier;
  active: boolean;
  perks: SubscriptionPerks;
  renewalDate?: string;
  platform?: SubscriptionPlatform;
}

/**
 * Subscription webhook event from Stripe
 */
export interface StripeSubscriptionEvent {
  type: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'subscription.renewed';
  subscriptionId: string;
  customerId: string;
  userId?: string;
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid';
  currentPeriodEnd: number;  // Unix timestamp
  productId: string;
}

/**
 * Mobile IAP receipt validation result
 */
export interface IAPReceiptValidation {
  valid: boolean;
  tier: 'vip' | 'royal';
  expiresDate: string;
  transactionId: string;
  originalTransactionId: string;
  error?: string;
}

/**
 * Subscription renewal check result
 */
export interface SubscriptionRenewalCheck {
  userId: string;
  previousStatus: SubscriptionStatus;
  currentStatus: SubscriptionStatus;
  renewed: boolean;
  expired: boolean;
  needsUpdate: boolean;
}

/**
 * Subscription metrics for analytics
 */
export interface SubscriptionMetrics {
  totalActiveVIP: number;
  totalActiveRoyal: number;
  totalCancelled: number;
  totalExpired: number;
  monthlyRecurringRevenue: number;
  averageLifetimeValue: number;
  churnRate: number;
}

/**
 * Default perks for each tier
 */
export const DEFAULT_PERKS: Record<'vip' | 'royal', SubscriptionPerks> = {
  vip: {
    callDiscount: 0.30,                // 30% discount ONLY for voice/video calls
    passport: true,
    incognito: true,
    priorityDiscovery: true,
    unlimitedDiscovery: true,
    swipeBoostDaily: 1,
  },
  royal: {
    callDiscount: 0.50,                // 50% discount ONLY for voice/video calls
    passport: true,
    incognito: true,
    priorityDiscovery: true,
    prioritySwipeQueue: true,
    unlimitedDiscovery: true,
    dailyBoosts: 2,
    earlyAccessFeatures: true,
  }
};

/**
 * Helper to get empty perks for free users
 */
export const FREE_PERKS: SubscriptionPerks = {
  callDiscount: 0,
  passport: false,
  incognito: false,
  priorityDiscovery: false,
  prioritySwipeQueue: false,
  unlimitedDiscovery: false,
  swipeBoostDaily: 0,
  dailyBoosts: 0,
  earlyAccessFeatures: false,
};