/**
 * PACK 350 - Subscription Endpoints
 * 
 * Cloud Functions for subscription management
 */

import * as functions from 'firebase-functions';
import {
  pack350_syncWebStripeSubscription as syncStripe,
  pack350_syncAppleSubscription as syncApple,
  pack350_syncGoogleSubscription as syncGoogle,
  getEffectiveSubscriptionTier,
  getSubscriptionProducts,
  getUserSubscriptionDetails,
  cancelSubscription,
  isVipTier,
  isRoyalTier,
  getTierPerks,
} from './pack350-subscriptions.js';

// ============================================================================
// CALLABLE FUNCTIONS (for mobile/web apps)
// ============================================================================

/**
 * Get current user's subscription tier and details
 */
export const pack350_getMySubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const tier = await getEffectiveSubscriptionTier(userId);
    const details = await getUserSubscriptionDetails(userId);
    const perks = getTierPerks(tier);
    
    return {
      success: true,
      tier,
      details,
      perks,
      isVip: isVipTier(tier),
      isRoyal: isRoyalTier(tier),
    };
  } catch (error: any) {
    console.error('[PACK350] Get subscription error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get available subscription products for current platform
 */
export const pack350_getSubscriptionProducts = functions.https.onCall(async (data, context) => {
  const { platform } = data as { platform: 'web' | 'mobile' };
  
  if (!platform || (platform !== 'web' && platform !== 'mobile')) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid platform');
  }
  
  try {
    const products = await getSubscriptionProducts(platform);
    
    return {
      success: true,
      products,
    };
  } catch (error: any) {
    console.error('[PACK350] Get products error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Sync Stripe subscription (called after Stripe checkout success)
 */
export const pack350_syncStripeSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { stripeCustomerId, stripePriceId, isActive, currentPeriodEnd } = data as {
    stripeCustomerId: string;
    stripePriceId: string;
    isActive: boolean;
    currentPeriodEnd?: string;  // ISO date string
  };
  
  if (!stripeCustomerId || !stripePriceId || typeof isActive !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const result = await syncStripe({
      userId,
      stripeCustomerId,
      stripePriceId,
      isActive,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
    });
    
    return {
      success: true,
      tier: result.tier,
    };
  } catch (error: any) {
    console.error('[PACK350] Stripe sync error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Sync Apple subscription (called after App Store purchase)
 */
export const pack350_syncAppleSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { originalTransactionId, productId, isActive, expiresDate } = data as {
    originalTransactionId: string;
    productId: string;
    isActive: boolean;
    expiresDate?: string;  // ISO date string
  };
  
  if (!originalTransactionId || !productId || typeof isActive !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const result = await syncApple({
      userId,
      originalTransactionId,
      productId,
      isActive,
      expiresDate: expiresDate ? new Date(expiresDate) : undefined,
    });
    
    return {
      success: true,
      tier: result.tier,
    };
  } catch (error: any) {
    console.error('[PACK350] Apple sync error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Sync Google Play subscription (called after Play Store purchase)
 */
export const pack350_syncGoogleSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { purchaseToken, productId, isActive, expiryTimeMillis } = data as {
    purchaseToken: string;
    productId: string;
    isActive: boolean;
    expiryTimeMillis?: number;
  };
  
  if (!purchaseToken || !productId || typeof isActive !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const result = await syncGoogle({
      userId,
      purchaseToken,
      productId,
      isActive,
      expiryTimeMillis,
    });
    
    return {
      success: true,
      tier: result.tier,
    };
  } catch (error: any) {
    console.error('[PACK350] Google sync error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cancel subscription
 */
export const pack350_cancelSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { reason } = data as { reason?: string };
  
  try {
    const result = await cancelSubscription(userId, reason);
    
    return {
      success: result.success,
    };
  } catch (error: any) {
    console.error('[PACK350] Cancel subscription error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// WEBHOOK HANDLERS (for payment provider notifications)
// ============================================================================

/**
 * Stripe webhook handler
 * Handles subscription.created, subscription.updated, subscription.deleted events
 */
export const pack350_stripeWebhook = functions.https.onRequest(async (req, res) => {
  // TODO: Implement Stripe webhook signature verification
  // TODO: Handle Stripe subscription events
  
  try {
    const event = req.body;
    
    console.log('[PACK350] Stripe webhook received:', event.type);
    
    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        // Sync subscription status
        break;
        
      case 'customer.subscription.deleted':
        // Mark subscription as inactive
        break;
        
      default:
        console.log('[PACK350] Unhandled Stripe event:', event.type);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('[PACK350] Stripe webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Apple App Store Server Notifications handler
 */
export const pack350_appleWebhook = functions.https.onRequest(async (req, res) => {
  // TODO: Implement Apple webhook signature verification
  // TODO: Handle Apple subscription notifications
  
  try {
    const notification = req.body;
    
    console.log('[PACK350] Apple webhook received:', notification.notificationType);
    
    res.json({ received: true });
  } catch (error) {
    console.error('[PACK350] Apple webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Google Play Real-time Developer Notifications handler
 */
export const pack350_googleWebhook = functions.https.onRequest(async (req, res) => {
  // TODO: Implement Google webhook verification
  // TODO: Handle Google subscription notifications
  
  try {
    const notification = req.body;
    
    console.log('[PACK350] Google webhook received:', notification);
    
    res.json({ received: true });
  } catch (error) {
    console.error('[PACK350] Google webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
