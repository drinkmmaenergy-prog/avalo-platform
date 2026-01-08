/**
 * PACK 350 - Unified Subscriptions v2
 * 
 * Single Source of Truth for subscription tiers across mobile + web
 * - FREE / VIP / ROYAL / CREATOR_PRO / BUSINESS
 * - Voice/Video discounts (VIP 30%, Royal 50%)
 * - Royal: 7-word chat buckets (vs 11-word standard)
 * - No tokenomics changes
 * - Store compliance (Apple / Google / Stripe)
 */

import { db, serverTimestamp, generateId, timestamp } from './init.js';

type Timestamp = ReturnType<typeof timestamp.now>;

// ============================================================================
// TYPES
// ============================================================================

export type SubscriptionTier =
  | 'FREE'
  | 'VIP'
  | 'ROYAL'
  | 'CREATOR_PRO'
  | 'BUSINESS';

export type SubscriptionSource =
  | 'WEB_STRIPE'
  | 'IOS_STORE'
  | 'ANDROID_PLAY';

export type SyncStatus = 'OK' | 'MISMATCH' | 'ERROR';

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  
  source: SubscriptionSource;
  productId: string;  // Stripe / App Store / Play product id
  isActive: boolean;
  renewsAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // For audit/troubleshooting
  lastSyncAt?: Timestamp;
  lastSyncStatus?: SyncStatus;
}

export interface SubscriptionProductConfig {
  tier: SubscriptionTier;
  stripePriceId?: string;
  appleProductId?: string;
  googleProductId?: string;
  isVisibleOnWeb: boolean;
  isVisibleOnMobile: boolean;
  
  // Display info
  name: string;
  description: string;
  monthlyPriceDisplay?: string;
}

// ============================================================================
// PERKS CONFIGURATION
// ============================================================================

/**
 * Defines what perks each tier gets
 * IMPORTANT: No changes to revenue splits or token pricing
 */
export const SUBSCRIPTION_PERKS = {
  FREE: {
    voiceDiscountPercent: 0,
    videoDiscountPercent: 0,
    chatWordBucket: 11,  // Standard
    hasAdvancedAnalytics: false,
    hasAdsDashboard: false,
  },
  VIP: {
    voiceDiscountPercent: 30,  // -30% on voice calls
    videoDiscountPercent: 30,  // -30% on video calls
    chatWordBucket: 11,        // No change to chat pricing
    hasAdvancedAnalytics: false,
    hasAdsDashboard: false,
  },
  ROYAL: {
    voiceDiscountPercent: 50,  // -50% on voice calls
    videoDiscountPercent: 50,  // -50% on video calls
    chatWordBucket: 7,         // Earner gets 7-word buckets
    hasAdvancedAnalytics: false,
    hasAdsDashboard: false,
  },
  CREATOR_PRO: {
    voiceDiscountPercent: 0,   // No discounts on calls/chat
    videoDiscountPercent: 0,
    chatWordBucket: 11,
    hasAdvancedAnalytics: true,  // Advanced creator tools
    hasAdsDashboard: false,
  },
  BUSINESS: {
    voiceDiscountPercent: 0,
    videoDiscountPercent: 0,
    chatWordBucket: 11,
    hasAdvancedAnalytics: true,
    hasAdsDashboard: true,       // Ads & campaigns dashboard
  },
} as const;

// ============================================================================
// TIER HIERARCHY (for conflict resolution)
// ============================================================================

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  ROYAL: 5,
  VIP: 4,
  CREATOR_PRO: 3,
  BUSINESS: 2,
  FREE: 1,
};

/**
 * Returns the highest tier among multiple tiers
 */
export function getHighestTier(tiers: SubscriptionTier[]): SubscriptionTier {
  if (tiers.length === 0) return 'FREE';
  
  return tiers.reduce((highest, current) => {
    return TIER_PRIORITY[current] > TIER_PRIORITY[highest] ? current : highest;
  });
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get effective subscription tier for a user
 * This is the SINGLE SOURCE OF TRUTH used by all monetization code
 * 
 * @param userId - User ID
 * @returns Effective tier (defaults to FREE if none found)
 */
export async function getEffectiveSubscriptionTier(
  userId: string
): Promise<SubscriptionTier> {
  try {
    const subDoc = await db.collection('userSubscriptions').doc(userId).get();
    
    if (!subDoc.exists) {
      return 'FREE';
    }
    
    const sub = subDoc.data() as UserSubscription;
    
    // Check if subscription is active
    if (!sub.isActive) {
      return 'FREE';
    }
    
    // Check if renewal date has passed (if applicable)
    if (sub.renewsAt) {
      const now = new Date();
      const renewDate = sub.renewsAt.toDate();
      
      if (renewDate < now) {
        // Subscription expired - mark inactive
        await db.collection('userSubscriptions').doc(userId).update({
          isActive: false,
          updatedAt: serverTimestamp(),
        });
        
        return 'FREE';
      }
    }
    
    return sub.tier;
  } catch (error) {
    console.error(`[PACK350] Failed to get subscription tier for ${userId}:`, error);
    return 'FREE';  // Safe default
  }
}

/**
 * Check if user has VIP tier (or higher)
 */
export function isVipTier(tier: SubscriptionTier): boolean {
  return tier === 'VIP' || tier === 'ROYAL';
}

/**
 * Check if user has Royal tier
 */
export function isRoyalTier(tier: SubscriptionTier): boolean {
  return tier === 'ROYAL';
}

/**
 * Get perks for a specific tier
 */
export function getTierPerks(tier: SubscriptionTier) {
  return SUBSCRIPTION_PERKS[tier];
}

/**
 * Get voice call discount percent for a tier
 */
export function getVoiceDiscountPercent(tier: SubscriptionTier): number {
  return SUBSCRIPTION_PERKS[tier].voiceDiscountPercent;
}

/**
 * Get video call discount percent for a tier
 */
export function getVideoDiscountPercent(tier: SubscriptionTier): number {
  return SUBSCRIPTION_PERKS[tier].videoDiscountPercent;
}

/**
 * Get chat word bucket size for a tier (when user is EARNING)
 */
export function getChatWordBucket(tier: SubscriptionTier): number {
  return SUBSCRIPTION_PERKS[tier].chatWordBucket;
}

// ============================================================================
// SUBSCRIPTION SYNC FUNCTIONS
// ============================================================================

/**
 * Sync Web Stripe subscription
 * Called after successful Stripe checkout or webhook
 */
export async function pack350_syncWebStripeSubscription(params: {
  userId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  isActive: boolean;
  currentPeriodEnd?: Date;
}): Promise<{ success: boolean; tier: SubscriptionTier }> {
  const { userId, stripeCustomerId, stripePriceId, isActive, currentPeriodEnd } = params;
  
  try {
    // Map Stripe price ID to subscription tier
    const tier = await mapProductIdToTier(stripePriceId, 'WEB_STRIPE');
    
    if (!tier) {
      throw new Error(`Unknown Stripe price ID: ${stripePriceId}`);
    }
    
    // Update or create subscription document
    const subRef = db.collection('userSubscriptions').doc(userId);
    
    await subRef.set({
      userId,
      tier,
      source: 'WEB_STRIPE',
      productId: stripePriceId,
      isActive,
      renewsAt: currentPeriodEnd ? timestamp.fromDate(currentPeriodEnd) : null,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'OK',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    } as Partial<UserSubscription>, { merge: true });
    
    console.log(`[PACK350] Synced Stripe subscription: ${userId} -> ${tier}`);
    
    return { success: true, tier };
  } catch (error) {
    console.error('[PACK350] Failed to sync Stripe subscription:', error);
    
    // Log sync error
    await db.collection('userSubscriptions').doc(userId).set({
      userId,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'ERROR',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    throw error;
  }
}

/**
 * Sync Apple App Store subscription
 * Called after successful App Store purchase or server-to-server notification
 */
export async function pack350_syncAppleSubscription(params: {
  userId: string;
  originalTransactionId: string;
  productId: string;
  isActive: boolean;
  expiresDate?: Date;
}): Promise<{ success: boolean; tier: SubscriptionTier }> {
  const { userId, originalTransactionId, productId, isActive, expiresDate } = params;
  
  try {
    // Map Apple product ID to subscription tier
    const tier = await mapProductIdToTier(productId, 'IOS_STORE');
    
    if (!tier) {
      throw new Error(`Unknown Apple product ID: ${productId}`);
    }
    
    const subRef = db.collection('userSubscriptions').doc(userId);
    
    await subRef.set({
      userId,
      tier,
      source: 'IOS_STORE',
      productId,
      isActive,
      renewsAt: expiresDate ? timestamp.fromDate(expiresDate) : null,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'OK',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    } as Partial<UserSubscription>, { merge: true });
    
    console.log(`[PACK350] Synced Apple subscription: ${userId} -> ${tier}`);
    
    return { success: true, tier };
  } catch (error) {
    console.error('[PACK350] Failed to sync Apple subscription:', error);
    
    await db.collection('userSubscriptions').doc(userId).set({
      userId,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'ERROR',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    throw error;
  }
}

/**
 * Sync Google Play subscription
 * Called after successful Play Store purchase or Real-time Developer Notification
 */
export async function pack350_syncGoogleSubscription(params: {
  userId: string;
  purchaseToken: string;
  productId: string;
  isActive: boolean;
  expiryTimeMillis?: number;
}): Promise<{ success: boolean; tier: SubscriptionTier }> {
  const { userId, purchaseToken, productId, isActive, expiryTimeMillis } = params;
  
  try {
    // Map Google product ID to subscription tier
    const tier = await mapProductIdToTier(productId, 'ANDROID_PLAY');
    
    if (!tier) {
      throw new Error(`Unknown Google product ID: ${productId}`);
    }
    
    const subRef = db.collection('userSubscriptions').doc(userId);
    
    const expiresDate = expiryTimeMillis ? new Date(expiryTimeMillis) : null;
    
    await subRef.set({
      userId,
      tier,
      source: 'ANDROID_PLAY',
      productId,
      isActive,
      renewsAt: expiresDate ? timestamp.fromDate(expiresDate) : null,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'OK',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    } as Partial<UserSubscription>, { merge: true });
    
    console.log(`[PACK350] Synced Google subscription: ${userId} -> ${tier}`);
    
    return { success: true, tier };
  } catch (error) {
    console.error('[PACK350] Failed to sync Google subscription:', error);
    
    await db.collection('userSubscriptions').doc(userId).set({
      userId,
      lastSyncAt: serverTimestamp(),
      lastSyncStatus: 'ERROR',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    throw error;
  }
}

// ============================================================================
// PRODUCT MAPPING
// ============================================================================

/**
 * Map product ID to subscription tier
 * Reads from system/subscriptionProducts config
 */
async function mapProductIdToTier(
  productId: string,
  source: SubscriptionSource
): Promise<SubscriptionTier | null> {
  try {
    const productsSnap = await db.collection('system').doc('subscriptionProducts').get();
    
    if (!productsSnap.exists) {
      console.error('[PACK350] subscriptionProducts config not found');
      return null;
    }
    
    const products = productsSnap.data()?.products as SubscriptionProductConfig[];
    
    if (!products || !Array.isArray(products)) {
      return null;
    }
    
    // Find matching product
    for (const product of products) {
      if (source === 'WEB_STRIPE' && product.stripePriceId === productId) {
        return product.tier;
      }
      if (source === 'IOS_STORE' && product.appleProductId === productId) {
        return product.tier;
      }
      if (source === 'ANDROID_PLAY' && product.googleProductId === productId) {
        return product.tier;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[PACK350] Failed to map product ID to tier:', error);
    return null;
  }
}

/**
 * Get all subscription product configs
 * Used by UI to display available tiers
 */
export async function getSubscriptionProducts(
  platform: 'web' | 'mobile'
): Promise<SubscriptionProductConfig[]> {
  try {
    const productsSnap = await db.collection('system').doc('subscriptionProducts').get();
    
    if (!productsSnap.exists) {
      return [];
    }
    
    const products = productsSnap.data()?.products as SubscriptionProductConfig[];
    
    if (!products || !Array.isArray(products)) {
      return [];
    }
    
    // Filter by platform visibility
    return products.filter(p => 
      platform === 'web' ? p.isVisibleOnWeb : p.isVisibleOnMobile
    );
  } catch (error) {
    console.error('[PACK350] Failed to get subscription products:', error);
    return [];
  }
}

// ============================================================================
// ADMIN / MANAGEMENT
// ============================================================================

/**
 * Cancel a subscription (mark as inactive)
 * Does NOT handle refunds - that's handled by payment provider
 */
export async function cancelSubscription(
  userId: string,
  reason?: string
): Promise<{ success: boolean }> {
  try {
    await db.collection('userSubscriptions').doc(userId).update({
      isActive: false,
      cancelledAt: serverTimestamp(),
      cancelReason: reason || 'user_requested',
      updatedAt: serverTimestamp(),
    });
    
    console.log(`[PACK350] Cancelled subscription for ${userId}`);
    
    return { success: true };
  } catch (error) {
    console.error('[PACK350] Failed to cancel subscription:', error);
    throw error;
  }
}

/**
 * Get subscription details for a user
 */
export async function getUserSubscriptionDetails(
  userId: string
): Promise<UserSubscription | null> {
  try {
    const subDoc = await db.collection('userSubscriptions').doc(userId).get();
    
    if (!subDoc.exists) {
      return null;
    }
    
    return subDoc.data() as UserSubscription;
  } catch (error) {
    console.error('[PACK350] Failed to get subscription details:', error);
    return null;
  }
}
