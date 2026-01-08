/**
 * PACK 288 — Web Stripe Checkout & Webhook Handler
 * 
 * Handles Stripe payment integration for web token purchases.
 * 
 * Flow:
 * 1. Client requests checkout session
 * 2. Backend creates Stripe checkout session
 * 3. Client redirects to Stripe
 * 4. User completes payment
 * 5. Stripe webhook notifies backend
 * 6. Backend credits tokens to wallet
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import {
  TokenPurchase,
  WebPurchaseRequest,
  WebPurchaseResponse,
} from './types/pack288-token-store.types';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Token packages configuration
const TOKEN_PACKAGES = [
  { id: 'mini', tokens: 100, basePricePLN: 31.99, priceUSD: 8.00, priceEUR: 7.50 },
  { id: 'basic', tokens: 300, basePricePLN: 85.99, priceUSD: 21.50, priceEUR: 20.00 },
  { id: 'standard', tokens: 500, basePricePLN: 134.99, priceUSD: 34.00, priceEUR: 31.50 },
  { id: 'premium', tokens: 1000, basePricePLN: 244.99, priceUSD: 61.50, priceEUR: 57.50 },
  { id: 'pro', tokens: 2000, basePricePLN: 469.99, priceUSD: 118.00, priceEUR: 110.00 },
  { id: 'elite', tokens: 5000, basePricePLN: 1125.99, priceUSD: 282.50, priceEUR: 264.00 },
  { id: 'royal', tokens: 10000, basePricePLN: 2149.99, priceUSD: 539.00, priceEUR: 504.00 },
] as const;

const getPackageById = (id: string) => {
  return TOKEN_PACKAGES.find(p => p.id === id) || null;
};

// ============================================================================
// STRIPE CHECKOUT SESSION CREATION
// ============================================================================

/**
 * Create Stripe checkout session for token purchase
 */
export const tokens_createCheckoutSession = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      packageId,
      successUrl,
      cancelUrl,
    } = request.data as WebPurchaseRequest;

    if (!packageId) {
      throw new HttpsError('invalid-argument', 'Package ID is required');
    }

    try {
      // Get package details
      const pack = getPackageById(packageId);
      if (!pack) {
        throw new HttpsError('not-found', 'Package not found');
      }

      // Check age verification
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();

      if (!userData?.ageVerified) {
        throw new HttpsError(
          'failed-precondition',
          'Age verification required (18+)'
        );
      }

      // Check monthly limits
      const currentMonth = new Date().toISOString().substring(0, 7);
      const monthlyLimitDoc = await db
        .collection('purchaseLimits')
        .doc(`${auth.uid}_${currentMonth}`)
        .get();

      const monthlyTotal = monthlyLimitDoc.data()?.totalPLN || 0;
      if (monthlyTotal + pack.basePricePLN > 10000) {
        throw new HttpsError(
          'failed-precondition',
          'Monthly purchase limit exceeded (10000 PLN)'
        );
      }

      // Determine currency and amount based on user location
      // For now, default to USD for web (can be enhanced with geo-location)
      const currency = 'usd';
      const amount = Math.round(pack.priceUSD * 100); // Stripe uses cents

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Avalo Tokens — ${pack.id.charAt(0).toUpperCase() + pack.id.slice(1)}`,
                description: `${pack.tokens} tokens for Avalo platform`,
                images: ['https://avalo.app/images/token-icon.png'],
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/token-store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/token-store`,
        client_reference_id: auth.uid,
        metadata: {
          userId: auth.uid,
          packageId: pack.id,
          tokens: pack.tokens.toString(),
          basePricePLN: pack.basePricePLN.toString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      });

      logger.info('Stripe checkout session created', {
        userId: auth.uid,
        sessionId: session.id,
        packageId: pack.id,
        amount,
        currency,
      });

      const response: WebPurchaseResponse = {
        success: true,
        checkoutUrl: session.url || undefined,
        sessionId: session.id,
      };

      return response;
    } catch (error: any) {
      logger.error('Create checkout session error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to create checkout session'
      );
    }
  }
);

// ============================================================================
// STRIPE WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Stripe webhooks
 * Must be called from Stripe webhook endpoint
 */
export const tokens_stripeWebhook = https.onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig || typeof sig !== 'string') {
      logger.warn('Missing Stripe signature');
      res.status(400).send('Missing signature');
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
    } catch (err: any) {
      logger.error('Webhook signature verification failed:', err);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        default:
          logger.info('Unhandled Stripe event type:', event.type);
      }

      res.json({ received: true });
    } catch (error: any) {
      logger.error('Webhook handler error:', error);
      res.status(500).send(`Webhook handler error: ${error.message}`);
    }
  }
);

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const packageId = session.metadata?.packageId;
  const tokens = parseInt(session.metadata?.tokens || '0');
  const basePricePLN = parseFloat(session.metadata?.basePricePLN || '0');

  if (!userId || !packageId || !tokens) {
    logger.error('Invalid session metadata', { sessionId: session.id });
    return;
  }

  try {
    // Check if already processed
    const existingPurchase = await db
      .collection('tokenPurchases')
      .where('providerOrderId', '==', session.id)
      .where('status', '==', 'COMPLETED')
      .limit(1)
      .get();

    if (!existingPurchase.empty) {
      logger.warn('Purchase already processed', { sessionId: session.id });
      return;
    }

    // Create purchase record
    const purchaseId = generateId();
    const purchase: TokenPurchase = {
      purchaseId,
      userId,
      packageId: packageId as any,
      tokens,
      basePricePLN,
      paidCurrency: session.currency?.toUpperCase() || 'USD',
      paidAmount: (session.amount_total || 0) / 100, // Convert from cents
      platform: 'web',
      provider: 'stripe',
      providerOrderId: session.id,
      status: 'COMPLETED',
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await db.collection('tokenPurchases').doc(purchaseId).set(purchase);

    // Credit tokens to wallet
    const walletRef = db.collection('wallets').doc(userId);

    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);

      const currentBalance = walletDoc.exists
        ? (walletDoc.data()?.tokensBalance || 0)
        : 0;
      const newBalance = currentBalance + tokens;

      if (walletDoc.exists) {
        transaction.update(walletRef, {
          tokensBalance: newBalance,
          lifetimePurchasedTokens: FieldValue.increment(tokens),
          lastUpdated: serverTimestamp(),
        });
      } else {
        transaction.set(walletRef, {
          userId,
          tokensBalance: newBalance,
          lifetimePurchasedTokens: tokens,
          lifetimeSpentTokens: 0,
          lifetimeEarnedTokens: 0,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      // Create wallet transaction
      const txId = generateId();
      transaction.set(db.collection('walletTransactions').doc(txId), {
        txId,
        userId,
        type: 'PURCHASE',
        source: 'STORE',
        amountTokens: tokens,
        beforeBalance: currentBalance,
        afterBalance: newBalance,
        metadata: {
          purchaseId,
          platform: 'web',
          stripeSessionId: session.id,
        },
        timestamp: serverTimestamp(),
      });
    });

    // Update monthly limit tracking
    const currentMonth = new Date().toISOString().substring(0, 7);
    await db
      .collection('purchaseLimits')
      .doc(`${userId}_${currentMonth}`)
      .set(
        {
          userId,
          month: currentMonth,
          totalPLN: FieldValue.increment(basePricePLN),
          purchaseCount: FieldValue.increment(1),
          lastPurchaseAt: serverTimestamp(),
        },
        { merge: true }
      );

    logger.info('Checkout completed successfully', {
      userId,
      purchaseId,
      tokens,
      sessionId: session.id,
    });
  } catch (error: any) {
    logger.error('Handle checkout completed error:', error);
    throw error;
  }
}

/**
 * Handle charge refund
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  try {
    const paymentIntentId = charge.payment_intent;
    if (!paymentIntentId) {
      logger.warn('No payment intent on refunded charge');
      return;
    }

    // Find purchase by payment intent
    const purchaseSnapshot = await db
      .collection('tokenPurchases')
      .where('providerOrderId', '==', paymentIntentId)
      .limit(1)
      .get();

    if (purchaseSnapshot.empty) {
      logger.warn('Purchase not found for refunded charge', { paymentIntentId });
      return;
    }

    const purchaseDoc = purchaseSnapshot.docs[0];
    const purchase = purchaseDoc.data() as TokenPurchase;

    // Update purchase status
    await purchaseDoc.ref.update({
      status: 'REFUNDED',
      updatedAt: serverTimestamp(),
    });

    // Deduct tokens from wallet (if they still have them)
    const walletRef = db.collection('wallets').doc(purchase.userId);
    await walletRef.update({
      tokensBalance: FieldValue.increment(-purchase.tokens),
      lifetimePurchasedTokens: FieldValue.increment(-purchase.tokens),
      lastUpdated: serverTimestamp(),
    });

    logger.info('Charge refunded, tokens deducted', {
      userId: purchase.userId,
      tokens: purchase.tokens,
      purchaseId: purchase.purchaseId,
    });
  } catch (error: any) {
    logger.error('Handle charge refunded error:', error);
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.warn('Payment failed', {
    paymentIntentId: paymentIntent.id,
    metadata: paymentIntent.metadata,
  });

  const userId = paymentIntent.metadata?.userId;
  const packageId = paymentIntent.metadata?.packageId;

  if (!userId || !packageId) {
    return;
  }

  // Log failed attempt (for fraud detection)
  await db.collection('failedPurchases').add({
    userId,
    packageId,
    paymentIntentId: paymentIntent.id,
    failureReason: paymentIntent.last_payment_error?.message || 'Unknown',
    timestamp: serverTimestamp(),
  });
}

/**
 * Get purchase details by session ID (for success page)
 */
export const tokens_getPurchaseBySession = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Session ID is required');
    }

    try {
      const purchaseSnapshot = await db
        .collection('tokenPurchases')
        .where('providerOrderId', '==', sessionId)
        .where('userId', '==', auth.uid)
        .limit(1)
        .get();

      if (purchaseSnapshot.empty) {
        return {
          success: false,
          error: 'Purchase not found',
        };
      }

      const purchase = purchaseSnapshot.docs[0].data();

      return {
        success: true,
        purchase,
      };
    } catch (error: any) {
      logger.error('Get purchase by session error:', error);
      throw new HttpsError('internal', 'Failed to fetch purchase details');
    }
  }
);