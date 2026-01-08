/**
 * PACK 278 — Subscription Cloud Functions
 * 
 * Public API endpoints for subscription management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import {
  getUserSubscription,
  hasSubscriptionTier,
  hasAnyPremiumTier,
  deactivateSubscription,
  getSubscriptionsNeedingVerification,
  getSubscriptionMetrics,
  grantTrialSubscription,
} from './pack278-subscription-service';
import {
  validateStripePurchase,
  validateAppleReceipt,
  validateGooglePlayPurchase,
  handleStripeWebhook,
  verifySubscriptionRenewal,
  checkPurchaseFrequency,
} from './pack278-purchase-validation';
import { updateSubscription } from './pack278-subscription-service';

/**
 * Get current user's subscription status
 */
export const pack278_getSubscription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const subscription = await getUserSubscription(userId);
  
  return {
    success: true,
    subscription,
  };
});

/**
 * Purchase subscription via Stripe (Web)
 */
export const pack278_purchaseWeb = onCall<{
  tier: 'vip' | 'royal';
  subscriptionId: string;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { tier, subscriptionId } = request.data;
  const userId = request.auth.uid;
  
  if (!tier || !subscriptionId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  
  if (tier !== 'vip' && tier !== 'royal') {
    throw new HttpsError('invalid-argument', 'Invalid subscription tier');
  }
  
  // Check purchase frequency
  const frequencyCheck = await checkPurchaseFrequency(userId);
  if (!frequencyCheck.allowed) {
    throw new HttpsError('resource-exhausted', frequencyCheck.reason || 'Too many requests');
  }
  
  // Validate purchase
  const result = await validateStripePurchase(userId, subscriptionId, tier);
  
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Purchase validation failed');
  }
  
  return result;
});

/**
 * Verify mobile IAP receipt (iOS/Android)
 */
export const pack278_verifyIAP = onCall<{
  platform: 'ios' | 'android';
  receiptData: string;
  productId: string;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { platform, receiptData, productId } = request.data;
  const userId = request.auth.uid;
  
  if (!platform || !receiptData || !productId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  
  if (platform !== 'ios' && platform !== 'android') {
    throw new HttpsError('invalid-argument', 'Invalid platform');
  }
  
  // Check purchase frequency
  const frequencyCheck = await checkPurchaseFrequency(userId);
  if (!frequencyCheck.allowed) {
    throw new HttpsError('resource-exhausted', frequencyCheck.reason || 'Too many requests');
  }
  
  // Validate receipt
  let result;
  if (platform === 'ios') {
    result = await validateAppleReceipt(userId, receiptData, productId);
  } else {
    result = await validateGooglePlayPurchase(userId, receiptData, productId);
  }
  
  if (!result.valid) {
    throw new HttpsError('internal', result.error || 'Receipt validation failed');
  }
  
  return {
    success: true,
    tier: result.tier,
    expiresDate: result.expiresDate,
    transactionId: result.transactionId,
  };
});

/**
 * Cancel subscription
 */
export const pack278_cancelSubscription = onCall<{
  reason?: string;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const reason = request.data.reason || 'User requested cancellation';
  
  await deactivateSubscription(userId, reason);
  
  return {
    success: true,
    message: 'Subscription cancelled successfully',
  };
});

/**
 * Check if user has specific tier
 */
export const pack278_hasTier = onCall<{
  tier: 'vip' | 'royal';
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { tier } = request.data;
  const userId = request.auth.uid;
  
  if (!tier || (tier !== 'vip' && tier !== 'royal')) {
    throw new HttpsError('invalid-argument', 'Invalid tier');
  }
  
  const hasTier = await hasSubscriptionTier(userId, tier);
  
  return {
    success: true,
    hasTier,
  };
});

/**
 * Check if user has any premium tier
 */
export const pack278_hasPremium = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const hasPremium = await hasAnyPremiumTier(userId);
  
  return {
    success: true,
    hasPremium,
  };
});

/**
 * Get subscription metrics (Admin only)
 */
export const pack278_getMetrics = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Check admin role
  // const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  // if (userDoc.data()?.role !== 'admin') {
  //   throw new HttpsError('permission-denied', 'Admin access required');
  // }
  
  const metrics = await getSubscriptionMetrics();
  
  return {
    success: true,
    metrics,
  };
});

/**
 * Grant trial subscription (Admin only)
 */
export const pack278_grantTrial = onCall<{
  userId: string;
  tier: 'vip' | 'royal';
  durationDays: number;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Check admin role
  // const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  // if (userDoc.data()?.role !== 'admin') {
  //   throw new HttpsError('permission-denied', 'Admin access required');
  // }
  
  const { userId, tier, durationDays } = request.data;
  
  if (!userId || !tier || !durationDays) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  
  if (tier !== 'vip' && tier !== 'royal') {
    throw new HttpsError('invalid-argument', 'Invalid tier');
  }
  
  if (durationDays < 1 || durationDays > 365) {
    throw new HttpsError('invalid-argument', 'Duration must be between 1 and 365 days');
  }
  
  await grantTrialSubscription(userId, tier, durationDays);
  
  return {
    success: true,
    message: `Trial subscription granted: ${tier} for ${durationDays} days`,
  };
});

/**
 * Scheduled function: Verify subscription renewals
 * Runs daily to check for expired subscriptions and verify renewals
 */
export const pack278_verifyRenewals = onSchedule(
  { schedule: 'every 24 hours' },
  async (event) => {
    logger.info('Starting subscription renewal verification');
    
    try {
      const subscriptions = await getSubscriptionsNeedingVerification();
      
      logger.info(`Found ${subscriptions.length} subscriptions to verify`);
      
      let renewed = 0;
      let expired = 0;
      
      for (const sub of subscriptions) {
        try {
          // Verify renewal with platform
          const result = await verifySubscriptionRenewal(
            sub.userId,
            sub.platform,
            sub.subscriptionId,
            sub.purchaseToken
          );
          
          if (result.renewed && result.newExpiryDate) {
            // Update subscription with new expiry date
            await updateSubscription(
              sub.userId,
              sub.tier!,
              result.newExpiryDate,
              sub.platform,
              sub.subscriptionId,
              sub.purchaseToken,
              sub.productId
            );
            renewed++;
            logger.info(`Renewed subscription for user ${sub.userId}`);
          } else {
            // Subscription not renewed - deactivate
            await deactivateSubscription(sub.userId, 'Subscription expired and not renewed');
            expired++;
            logger.info(`Deactivated expired subscription for user ${sub.userId}`);
          }
        } catch (error) {
          logger.error(`Error verifying subscription for user ${sub.userId}:`, error);
        }
      }
      
      logger.info(`Renewal verification complete: ${renewed} renewed, ${expired} expired`);
    } catch (error) {
      logger.error('Subscription verification error:', error);
    }
  }
);

/**
 * Stripe webhook handler
 * Handles subscription lifecycle events from Stripe
 */
export const pack278_stripeWebhook = onCall<{
  eventType: string;
  subscriptionData: any;
}>(async (request) => {
  // Webhook security: Verify signature in production
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const signature = request.headers['stripe-signature'];
  // 
  // try {
  //   const event = stripe.webhooks.constructEvent(
  //     request.rawBody,
  //     signature,
  //     process.env.STRIPE_WEBHOOK_SECRET
  //   );
  // } catch (err) {
  //   throw new HttpsError('invalid-argument', 'Invalid signature');
  // }
  
  const { eventType, subscriptionData } = request.data;
  
  if (!eventType || !subscriptionData) {
    throw new HttpsError('invalid-argument', 'Missing event data');
  }
  
  try {
    await handleStripeWebhook(eventType, subscriptionData);
    
    return {
      success: true,
      message: 'Webhook processed',
    };
  } catch (error) {
    logger.error('Webhook processing error:', error);
    throw new HttpsError('internal', 'Webhook processing failed');
  }
});