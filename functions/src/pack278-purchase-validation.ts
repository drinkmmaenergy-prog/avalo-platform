/**
 * PACK 278 — Purchase Validation
 * 
 * Validates subscription purchases from:
 * - Web (Stripe)
 * - iOS (App Store)
 * - Android (Google Play)
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
  SubscriptionPurchaseRequest,
  SubscriptionPurchaseResponse,
  IAPReceiptValidation,
} from './types/pack278-subscription.types';
import { updateSubscription } from './pack278-subscription-service';

const db = getFirestore();

/**
 * Validate Stripe subscription purchase (Web)
 */
export async function validateStripePurchase(
  userId: string,
  subscriptionId: string,
  tier: 'vip' | 'royal'
): Promise<SubscriptionPurchaseResponse> {
  try {
    // Check if subscription ID already used
    const existingSnapshot = await db.collection('subscriptions')
      .where('subscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      const existingDoc = existingSnapshot.docs[0];
      if (existingDoc.id !== userId) {
        return {
          success: false,
          tier,
          renewalDate: '',
          platform: 'web',
          error: 'Subscription ID already in use by another user',
        };
      }
    }
    
    // TODO: In production, verify with Stripe API
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // 
    // if (subscription.status !== 'active') {
    //   throw new Error('Subscription not active');
    // }
    // 
    // const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    
    // For now, set renewal date to 30 days from now
    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 30);
    const renewalDateISO = renewalDate.toISOString();
    
    // Update subscription record
    await updateSubscription(
      userId,
      tier,
      renewalDateISO,
      'web',
      subscriptionId,
      undefined,
      `stripe_${tier}_monthly`
    );
    
    return {
      success: true,
      tier,
      renewalDate: renewalDateISO,
      platform: 'web',
      subscriptionId,
    };
  } catch (error) {
    console.error('Stripe validation error:', error);
    return {
      success: false,
      tier,
      renewalDate: '',
      platform: 'web',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Validate iOS App Store receipt
 */
export async function validateAppleReceipt(
  userId: string,
  receiptData: string,
  productId: string
): Promise<IAPReceiptValidation> {
  try {
    // Check if receipt already used
    const existingSnapshot = await db.collection('subscriptions')
      .where('purchaseToken', '==', receiptData)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      const existingDoc = existingSnapshot.docs[0];
      if (existingDoc.id !== userId) {
        return {
          valid: false,
          tier: 'vip',
          expiresDate: '',
          transactionId: '',
          originalTransactionId: '',
          error: 'Receipt already used by another user',
        };
      }
    }
    
    // TODO: In production, verify with Apple's verifyReceipt endpoint
    // const verifyUrl = isProduction 
    //   ? 'https://buy.itunes.apple.com/verifyReceipt'
    //   : 'https://sandbox.itunes.apple.com/verifyReceipt';
    //
    // const response = await fetch(verifyUrl, {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     'receipt-data': receiptData,
    //     'password': process.env.APPLE_SHARED_SECRET,
    //     'exclude-old-transactions': true
    //   })
    // });
    //
    // const result = await response.json();
    // if (result.status !== 0) {
    //   throw new Error(`Apple validation failed: ${result.status}`);
    // }
    //
    // const latestReceipt = result.latest_receipt_info[0];
    // const expiresDate = new Date(parseInt(latestReceipt.expires_date_ms));
    
    // Determine tier from product ID
    const tier = productId.includes('royal') ? 'royal' : 'vip';
    
    // Mock: Set expiry to 30 days from now
    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + 30);
    
    const transactionId = 'apple_' + Date.now();
    
    // Update subscription record
    await updateSubscription(
      userId,
      tier,
      expiresDate.toISOString(),
      'ios',
      undefined,
      receiptData,
      productId
    );
    
    return {
      valid: true,
      tier,
      expiresDate: expiresDate.toISOString(),
      transactionId,
      originalTransactionId: transactionId,
    };
  } catch (error) {
    console.error('Apple receipt validation error:', error);
    return {
      valid: false,
      tier: 'vip',
      expiresDate: '',
      transactionId: '',
      originalTransactionId: '',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Validate Android Google Play purchase
 */
export async function validateGooglePlayPurchase(
  userId: string,
  purchaseToken: string,
  productId: string
): Promise<IAPReceiptValidation> {
  try {
    // Check if purchase token already used
    const existingSnapshot = await db.collection('subscriptions')
      .where('purchaseToken', '==', purchaseToken)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      const existingDoc = existingSnapshot.docs[0];
      if (existingDoc.id !== userId) {
        return {
          valid: false,
          tier: 'vip',
          expiresDate: '',
          transactionId: '',
          originalTransactionId: '',
          error: 'Purchase token already used by another user',
        };
      }
    }
    
    // TODO: In production, verify with Google Play API
    // const { google } = require('googleapis');
    // const androidpublisher = google.androidpublisher('v3');
    // 
    // const auth = new google.auth.GoogleAuth({
    //   keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    //   scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    // });
    //
    // const result = await androidpublisher.purchases.subscriptions.get({
    //   packageName: 'com.avalo.app',
    //   subscriptionId: productId,
    //   token: purchaseToken,
    //   auth: await auth.getClient(),
    // });
    //
    // if (result.data.paymentState !== 1) {
    //   throw new Error('Subscription not paid');
    // }
    //
    // const expiryTimeMillis = result.data.expiryTimeMillis;
    // const expiresDate = new Date(parseInt(expiryTimeMillis));
    
    // Determine tier from product ID
    const tier = productId.includes('royal') ? 'royal' : 'vip';
    
    // Mock: Set expiry to 30 days from now
    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + 30);
    
    const transactionId = 'google_' + Date.now();
    
    // Update subscription record
    await updateSubscription(
      userId,
      tier,
      expiresDate.toISOString(),
      'android',
      undefined,
      purchaseToken,
      productId
    );
    
    return {
      valid: true,
      tier,
      expiresDate: expiresDate.toISOString(),
      transactionId,
      originalTransactionId: transactionId,
    };
  } catch (error) {
    console.error('Google Play validation error:', error);
    return {
      valid: false,
      tier: 'vip',
      expiresDate: '',
      transactionId: '',
      originalTransactionId: '',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Handle Stripe webhook for subscription events
 */
export async function handleStripeWebhook(
  eventType: string,
  subscriptionData: any
): Promise<void> {
  try {
    const subscriptionId = subscriptionData.id;
    const customerId = subscriptionData.customer;
    const status = subscriptionData.status;
    const currentPeriodEnd = subscriptionData.current_period_end;
    
    // Find user by Stripe customer ID
    const userSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get();
    
    if (userSnapshot.empty) {
      console.error('User not found for Stripe customer:', customerId);
      return;
    }
    
    const userId = userSnapshot.docs[0].id;
    
    // Find existing subscription
    const subDoc = await db.collection('subscriptions').doc(userId).get();
    
    if (!subDoc.exists) {
      console.error('Subscription record not found for user:', userId);
      return;
    }
    
    const subData = subDoc.data();
    
    switch (eventType) {
      case 'customer.subscription.updated':
      case 'customer.subscription.renewed':
        if (status === 'active') {
          // Renew subscription
          const renewalDate = new Date(currentPeriodEnd * 1000).toISOString();
          await updateSubscription(
            userId,
            subData!.tier,
            renewalDate,
            'web',
            subscriptionId
          );
        }
        break;
      
      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled':
        // Deactivate subscription
        const { deactivateSubscription } = await import('./pack278-subscription-service');
        await deactivateSubscription(userId, 'User cancelled subscription');
        break;
      
      default:
        console.log('Unhandled webhook event:', eventType);
    }
  } catch (error) {
    console.error('Stripe webhook error:', error);
    throw error;
  }
}

/**
 * Verify subscription renewal with platform
 * Called by cron job for subscriptions near expiry
 */
export async function verifySubscriptionRenewal(
  userId: string,
  platform: 'web' | 'ios' | 'android',
  subscriptionId?: string,
  purchaseToken?: string
): Promise<{ renewed: boolean; newExpiryDate?: string }> {
  try {
    switch (platform) {
      case 'web':
        if (!subscriptionId) {
          return { renewed: false };
        }
        
        // TODO: Check Stripe subscription status
        // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        // 
        // if (subscription.status === 'active') {
        //   const newExpiryDate = new Date(subscription.current_period_end * 1000).toISOString();
        //   return { renewed: true, newExpiryDate };
        // }
        
        return { renewed: false };
      
      case 'ios':
        if (!purchaseToken) {
          return { renewed: false };
        }
        
        // TODO: Verify Apple receipt for latest expiry
        // Similar to validateAppleReceipt but just check status
        
        return { renewed: false };
      
      case 'android':
        if (!purchaseToken) {
          return { renewed: false };
        }
        
        // TODO: Check Google Play subscription status
        // Similar to validateGooglePlayPurchase but just check status
        
        return { renewed: false };
      
      default:
        return { renewed: false };
    }
  } catch (error) {
    console.error('Subscription renewal verification error:', error);
    return { renewed: false };
  }
}

/**
 * Anti-fraud: Check purchase frequency
 * Prevent users from making too many purchases in short time
 */
export async function checkPurchaseFrequency(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const oneMinuteAgo = new Date();
  oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);
  
  const recentPurchases = await db.collection('subscriptionHistory')
    .where('userId', '==', userId)
    .where('eventType', '==', 'subscription_created')
    .where('timestamp', '>', oneMinuteAgo.toISOString())
    .get();
  
  if (recentPurchases.size >= 3) {
    return {
      allowed: false,
      reason: 'Too many purchase attempts. Please wait before trying again.',
    };
  }
  
  return { allowed: true };
}