/**
 * PACK 302 — Web Token & Subscription Checkout (Stripe)
 * Endpoints for web-based purchases via Stripe
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from './common';
import Stripe from 'stripe';
import {
  getTokenPackage,
  resolveCurrency,
  convertPrice,
  addTokensToWallet,
  updateSubscriptionStatus,
  writeBillingAuditLog,
  isTransactionProcessed,
  validateSubscriptionTier,
} from './pack302-helpers';
import {
  CreateTokenCheckoutRequest,
  CreateTokenCheckoutResponse,
  CreateSubscriptionCheckoutRequest,
  CreateSubscriptionCheckoutResponse,
  TokenPackageId,
  SubscriptionTier,
} from './pack302-types';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// ============================================================================
// WEB TOKEN CHECKOUT
// ============================================================================

/**
 * POST /billing/web/create-token-checkout
 * Create Stripe Checkout Session for token purchase
 */
export const createTokenCheckout = onRequest(
  {
    region: 'europe-west3',
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const data = req.body as CreateTokenCheckoutRequest;
      const { userId, packageId, locale, currencyOverride } = data;

      // Validate input
      if (!userId || !packageId || !locale) {
        throw new HttpsError('invalid-argument', 'Missing required fields');
      }

      // Get package details
      const pkg = getTokenPackage(packageId);
      
      // Resolve currency
      const currency = resolveCurrency(locale, currencyOverride);
      const priceInCurrency = convertPrice(pkg.pricePLN, currency);
      
      // Convert to cents/smallest unit
      const amountInCents = Math.round(priceInCurrency * 100);

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `${pkg.tokens} Tokens`,
                description: `${packageId} Token Package`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        client_reference_id: userId,
        metadata: {
          packageId,
          tokens: pkg.tokens.toString(),
          userId,
          env: process.env.FIREBASE_CONFIG || 'production',
        },
        success_url: `${req.headers.origin || 'https://avalo.app'}/wallet/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || 'https://avalo.app'}/wallet`,
      });

      const response: CreateTokenCheckoutResponse = {
        checkoutUrl: session.url || '',
        sessionId: session.id,
      };

      logger.info(`Created token checkout for user ${userId}, package ${packageId}`);
      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error creating token checkout:', error);
      res.status(500).json({ 
        error: 'Failed to create checkout',
        message: error.message 
      });
    }
  }
);

// ============================================================================
// STRIPE WEBHOOK HANDLER
// ============================================================================

/**
 * POST /billing/web/stripe-webhook
 * Handle Stripe webhooks for payments and subscriptions
 */
export const stripeWebhook = onRequest(
  {
    region: 'europe-west3',
    cors: false,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST
      if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
      }

      const sig = req.headers['stripe-signature'];
      if (!sig) {
        logger.error('No Stripe signature found');
        res.status(400).send('No signature');
        return;
      }

      // Verify webhook signature
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.rawBody,
          sig,
          STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        logger.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      logger.info(`Received Stripe webhook: ${event.type}`);

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// ============================================================================
// WEBHOOK EVENT HANDLERS
// ============================================================================

/**
 * Handle checkout.session.completed
 * This covers both token purchases and subscription starts
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.client_reference_id;
  const metadata = session.metadata;

  if (!userId) {
    logger.error('No userId in checkout session');
    return;
  }

  // Check if this is a token purchase (has packageId in metadata)
  if (metadata?.packageId && metadata?.tokens) {
    await handleTokenPurchase(session);
  }
  // Otherwise it might be a subscription, which is handled by subscription events
}

/**
 * Handle token purchase from checkout session
 */
async function handleTokenPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.client_reference_id!;
  const packageId = session.metadata!.packageId as TokenPackageId;
  const tokens = parseInt(session.metadata!.tokens!, 10);
  const externalId = session.id;

  // Check idempotency
  if (await isTransactionProcessed(externalId, userId)) {
    logger.info(`Token purchase already processed: ${externalId}`);
    return;
  }

  try {
    // Add tokens to wallet
    const result = await addTokensToWallet(
      userId,
      tokens,
      externalId,
      'STRIPE',
      packageId
    );

    // Write audit log
    await writeBillingAuditLog(
      'TOKEN_PURCHASE',
      userId,
      'STRIPE',
      {
        amount: tokens,
        packageId,
        externalId,
      }
    );

    logger.info(
      `Token purchase completed: ${tokens} tokens for user ${userId}, new balance: ${result.newBalance}`
    );
  } catch (error: any) {
    logger.error('Error processing token purchase:', error);
    throw error;
  }
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;
  
  if (!userId) {
    logger.error('No userId in subscription metadata');
    return;
  }

  // Get tier from metadata or product
  const tier = subscription.metadata?.tier as SubscriptionTier;
  if (!tier || (tier !== 'VIP' && tier !== 'ROYAL')) {
    logger.error('Invalid or missing tier in subscription');
    return;
  }

  const active = subscription.status === 'active' || subscription.status === 'trialing';
  const planId = subscription.items.data[0]?.price.id || null;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  try {
    await updateSubscriptionStatus(
      userId,
      tier,
      active,
      planId,
      'STRIPE',
      currentPeriodEnd
    );

    await writeBillingAuditLog(
      active ? 'SUBSCRIPTION_STARTED' : 'SUBSCRIPTION_UPDATED',
      userId,
      'STRIPE',
      {
        tier,
        externalId: subscription.id,
      }
    );

    logger.info(`Subscription updated for user ${userId}: ${tier} active=${active}`);
  } catch (error: any) {
    logger.error('Error updating subscription:', error);
    throw error;
  }
}

/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;
  
  if (!userId) {
    logger.error('No userId in subscription metadata');
    return;
  }

  const tier = subscription.metadata?.tier as SubscriptionTier;
  if (!tier || (tier !== 'VIP' && tier !== 'ROYAL')) {
    logger.error('Invalid or missing tier in subscription');
    return;
  }

  try {
    await updateSubscriptionStatus(
      userId,
      tier,
      false,
      null,
      'STRIPE',
      null
    );

    await writeBillingAuditLog(
      'SUBSCRIPTION_CANCELLED',
      userId,
      'STRIPE',
      {
        tier,
        externalId: subscription.id,
      }
    );

    logger.info(`Subscription cancelled for user ${userId}: ${tier}`);
  } catch (error: any) {
    logger.error('Error cancelling subscription:', error);
    throw error;
  }
}

// ============================================================================
// WEB SUBSCRIPTION CHECKOUT
// ============================================================================

/**
 * POST /billing/web/create-subscription-checkout
 * Create Stripe Checkout Session for subscription
 */
export const createSubscriptionCheckout = onRequest(
  {
    region: 'europe-west3',
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const data = req.body as CreateSubscriptionCheckoutRequest;
      const { userId, tier, locale } = data;

      // Validate input
      if (!userId || !tier || !locale) {
        throw new HttpsError('invalid-argument', 'Missing required fields');
      }

      validateSubscriptionTier(tier);

      // Get price ID from environment variables
      // These should be set in Firebase Functions config
      const priceId = tier === 'VIP' 
        ? process.env.STRIPE_VIP_PRICE_ID 
        : process.env.STRIPE_ROYAL_PRICE_ID;

      if (!priceId) {
        throw new HttpsError('failed-precondition', 'Subscription price not configured');
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        client_reference_id: userId,
        metadata: {
          userId,
          tier,
        },
        subscription_data: {
          metadata: {
            userId,
            tier,
          },
        },
        success_url: `${req.headers.origin || 'https://avalo.app'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || 'https://avalo.app'}/subscription`,
      });

      const response: CreateSubscriptionCheckoutResponse = {
        checkoutUrl: session.url || '',
        sessionId: session.id,
      };

      logger.info(`Created subscription checkout for user ${userId}, tier ${tier}`);
      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error creating subscription checkout:', error);
      res.status(500).json({ 
        error: 'Failed to create checkout',
        message: error.message 
      });
    }
  }
);