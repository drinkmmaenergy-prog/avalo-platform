/**
 * PACK 278 — Subscription Service
 * 
 * Core service for managing VIP and Royal subscriptions
 * Handles subscription state, perks, and validation
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  SubscriptionData,
  SubscriptionTier,
  SubscriptionPlatform,
  UserSubscriptionState,
  DEFAULT_PERKS,
  FREE_PERKS,
  SubscriptionPerks,
} from './types/pack278-subscription.types';

const db = getFirestore();

/**
 * Get user's current subscription state
 * Returns tier, active status, and available perks
 */
export async function getUserSubscription(userId: string): Promise<UserSubscriptionState> {
  try {
    const subDoc = await db.collection('subscriptions').doc(userId).get();
    
    if (!subDoc.exists) {
      // User has no subscription - return free tier
      return {
        tier: null,
        active: false,
        perks: FREE_PERKS,
      };
    }
    
    const data = subDoc.data() as SubscriptionData;
    
    // Check if subscription is still active by renewal date
    const now = new Date();
    const renewalDate = new Date(data.renewalDate);
    const isExpired = renewalDate < now;
    
    if (isExpired || !data.active) {
      // Subscription expired - return free tier
      return {
        tier: null,
        active: false,
        perks: FREE_PERKS,
      };
    }
    
    // Active subscription - return with perks
    const perks = data.tier ? DEFAULT_PERKS[data.tier] : FREE_PERKS;
    
    return {
      tier: data.tier,
      active: data.active,
      perks,
      renewalDate: data.renewalDate,
      platform: data.platform,
    };
  } catch (error) {
    console.error('Error getting user subscription:', error);
    // On error, return free tier (fail-safe)
    return {
      tier: null,
      active: false,
      perks: FREE_PERKS,
    };
  }
}

/**
 * Check if user has a specific subscription tier
 */
export async function hasSubscriptionTier(
  userId: string,
  tier: 'vip' | 'royal'
): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription.active && subscription.tier === tier;
}

/**
 * Check if user has VIP or Royal (any premium tier)
 */
export async function hasAnyPremiumTier(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription.active && (subscription.tier === 'vip' || subscription.tier === 'royal');
}

/**
 * Check if user has access to a specific perk
 */
export async function hasPerk(
  userId: string,
  perk: keyof SubscriptionPerks
): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return Boolean(subscription.perks[perk]);
}

/**
 * Get call discount multiplier for user's subscription
 * - Royal: 0.5 (50% discount)
 * - VIP: 0.7 (30% discount)
 * - Standard: 1.0 (no discount)
 *
 * NOTE: This discount applies ONLY to voice and video calls.
 * It does NOT apply to:
 * - Text chat entry cost
 * - Paid messages (word buckets)
 * - Photo/video sending
 * - Voice messages inside chat
 * - Tips/gifts
 * - Match boosts
 * - Any other chat-related monetization
 */
export async function getCallDiscountMultiplier(userId: string): Promise<number> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription.active || !subscription.tier) {
    return 1.0; // No discount for free users
  }
  
  const discount = subscription.perks.callDiscount;
  return 1 - discount;
}

/**
 * Get discounted call price based on user's subscription
 */
export function applyCallDiscount(
  basePrice: number,
  discountMultiplier: number
): number {
  return Math.ceil(basePrice * discountMultiplier);
}

/**
 * Update or create subscription record
 * Called by purchase validation functions
 */
export async function updateSubscription(
  userId: string,
  tier: 'vip' | 'royal',
  renewalDate: string,
  platform: SubscriptionPlatform,
  subscriptionId?: string,
  purchaseToken?: string,
  productId?: string
): Promise<void> {
  const now = new Date().toISOString();
  
  const subscriptionData: SubscriptionData = {
    userId,
    tier,
    active: true,
    renewalDate,
    platform,
    lastUpdated: now,
    subscriptionId,
    purchaseToken,
    productId,
    createdAt: now,
  };
  
  // Get existing subscription for history tracking
  const existingDoc = await db.collection('subscriptions').doc(userId).get();
  
  if (existingDoc.exists) {
    const existing = existingDoc.data() as SubscriptionData;
    
    // Preserve creation date
    subscriptionData.createdAt = existing.createdAt;
    
    // Track tier changes in history
    if (existing.tier !== tier) {
      subscriptionData.previousTiers = existing.previousTiers || [];
      subscriptionData.previousTiers.push({
        tier: existing.tier,
        startDate: existing.createdAt,
        endDate: now,
      });
    }
  }
  
  // Update subscription
  await db.collection('subscriptions').doc(userId).set(subscriptionData, { merge: true });
  
  // Log to history
  await db.collection('subscriptionHistory').add({
    userId,
    eventType: existingDoc.exists ? 'subscription_renewed' : 'subscription_created',
    tier,
    platform,
    renewalDate,
    timestamp: now,
    subscriptionId,
  });
  
  // Update user profile with subscription flags
  await db.collection('users').doc(userId).update({
    subscriptionTier: tier,
    subscriptionActive: true,
    subscriptionRenewalDate: renewalDate,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Deactivate subscription (on cancellation or expiration)
 */
export async function deactivateSubscription(
  userId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  
  // Get current subscription
  const subDoc = await db.collection('subscriptions').doc(userId).get();
  
  if (!subDoc.exists) {
    return; // Nothing to deactivate
  }
  
  const data = subDoc.data() as SubscriptionData;
  
  // Update subscription to inactive
  await db.collection('subscriptions').doc(userId).update({
    active: false,
    cancelledAt: now,
    cancellationReason: reason,
    lastUpdated: now,
  });
  
  // Log to history
  await db.collection('subscriptionHistory').add({
    userId,
    eventType: 'subscription_cancelled',
    tier: data.tier,
    platform: data.platform,
    timestamp: now,
    reason,
  });
  
  // Update user profile
  await db.collection('users').doc(userId).update({
    subscriptionTier: null,
    subscriptionActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Check if subscription needs renewal verification
 * Returns true if renewal date is in the past
 */
export async function needsRenewalCheck(userId: string): Promise<boolean> {
  const subDoc = await db.collection('subscriptions').doc(userId).get();
  
  if (!subDoc.exists) {
    return false;
  }
  
  const data = subDoc.data() as SubscriptionData;
  
  if (!data.active) {
    return false; // Already inactive
  }
  
  const now = new Date();
  const renewalDate = new Date(data.renewalDate);
  
  return renewalDate < now;
}

/**
 * Get all subscriptions that need renewal verification
 * Used by cron job
 */
export async function getSubscriptionsNeedingVerification(): Promise<SubscriptionData[]> {
  const now = new Date().toISOString();
  
  const snapshot = await db.collection('subscriptions')
    .where('active', '==', true)
    .where('renewalDate', '<', now)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as SubscriptionData);
}

/**
 * Apply subscription perks to discovery/swipe ranking
 * Returns priority score (higher = better placement)
 */
export function getDiscoveryPriorityScore(subscription: UserSubscriptionState): number {
  if (!subscription.active) {
    return 0; // Standard users
  }
  
  if (subscription.tier === 'royal') {
    return 100; // Royal top tier
  }
  
  if (subscription.tier === 'vip') {
    return 50; // VIP second tier
  }
  
  return 0; // Fallback
}

/**
 * Check if user can access calendar booking
 * VIP and Royal only
 */
export async function canBookCalendar(userId: string): Promise<boolean> {
  return await hasAnyPremiumTier(userId);
}

/**
 * Get subscription analytics/metrics
 */
export async function getSubscriptionMetrics() {
  const [vipSnapshot, royalSnapshot, cancelledSnapshot, expiredSnapshot] = await Promise.all([
    db.collection('subscriptions').where('tier', '==', 'vip').where('active', '==', true).get(),
    db.collection('subscriptions').where('tier', '==', 'royal').where('active', '==', true).get(),
    db.collection('subscriptions').where('active', '==', false).get(),
    db.collection('subscriptions').where('renewalDate', '<', new Date().toISOString()).get(),
  ]);
  
  return {
    totalActiveVIP: vipSnapshot.size,
    totalActiveRoyal: royalSnapshot.size,
    totalCancelled: cancelledSnapshot.size,
    totalExpired: expiredSnapshot.size,
    totalActive: vipSnapshot.size + royalSnapshot.size,
  };
}

/**
 * Grant trial subscription (for promotions, testing, etc.)
 */
export async function grantTrialSubscription(
  userId: string,
  tier: 'vip' | 'royal',
  durationDays: number
): Promise<void> {
  const now = new Date();
  const renewalDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  
  await updateSubscription(
    userId,
    tier,
    renewalDate.toISOString(),
    'web', // Mark as web for trial subscriptions
    'TRIAL_' + Date.now().toString(),
    undefined,
    'trial_' + tier
  );
  
  // Log trial grant
  await db.collection('subscriptionHistory').add({
    userId,
    eventType: 'trial_granted',
    tier,
    platform: 'web',
    durationDays,
    timestamp: new Date().toISOString(),
  });
}