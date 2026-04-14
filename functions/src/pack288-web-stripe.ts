import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

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
import { getCanonicalTokenPackById, normalizeTokenPackId } from './pack277-token-packs';
import { admin, functions, increment, onCall, onRequest, timestamp } from './runtime';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// ============================================================================
// STRIPE CHECKOUT SESSION CREATION
// ============================================================================

/**
 * Create Stripe checkout session for token purchase
 */
export const tokens_createCheckoutSession = https.onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      packageId,
      packId,
      successUrl,
      cancelUrl,
    } = request.data as WebPurchaseRequest & { packId?: string };

    const canonicalPackId = normalizeTokenPackId(packageId || packId || '');

    if (!canonicalPackId) {
      throw new HttpsError('invalid-argument', 'Package ID is required');
    }

    try {
      // Get package details from canonical PACK 277 source
      const pack = getCanonicalTokenPackById(canonicalPackId);
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

      const monthlyTotal = monthlyLimitDoc.data()?.totalUSD || 0;
      if (monthlyTotal + pack.priceUSD > 10000) {
        throw new HttpsError(
          'failed-precondition',
          'Monthly purchase limit exceeded (10000 USD)'
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
          uid: auth.uid,
          userId: auth.uid,
          packageId: pack.id,
          packId: pack.id,
          tokens: pack.tokens.toString(),
          priceUSD: pack.priceUSD.toString(),
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
export const tokens_stripeWebhook = https.onRequest({ region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60 },
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
  const userId =
    session.metadata?.uid ||
    session.metadata?.userId ||
    session.client_reference_id ||
    undefined;
  const rawPackId = session.metadata?.packId || session.metadata?.packageId;
  const packageId = normalizeTokenPackId(rawPackId || '');

  if (!userId || !packageId) {
    logger.error('Invalid session metadata', { sessionId: session.id });
    throw new Error(`Invalid session metadata: missing userId or packageId for session ${session.id}`);
  }

  const pack = getCanonicalTokenPackById(packageId);
  if (!pack) {
    logger.error('Unknown package ID in metadata', { sessionId: session.id, packageId });
    throw new Error(`Unknown package ID "${packageId}" in metadata for session ${session.id}`);
  }

  const tokens = pack.tokens;
  const priceUSD = pack.priceUSD;
  const expectedAmountCents = Math.round(priceUSD * 100);

  if ((session.amount_total || 0) !== expectedAmountCents) {
    logger.error('Amount mismatch for canonical package', {
      sessionId: session.id,
      packageId,
      expectedAmountCents,
      gotAmountCents: session.amount_total || 0,
    });
    throw new Error(`Amount mismatch for session ${session.id}: expected ${expectedAmountCents} cents, got ${session.amount_total || 0} cents`);
  }

  try {
    // Atomic transaction: duplicate check + purchase record + wallet credit
    // All inside a single Firestore transaction to prevent race conditions
    const walletRef = db.collection('wallets').doc(userId);
    const purchaseId = generateId();

    await db.runTransaction(async (transaction) => {
      // Idempotency check: read the idempotency sentinel doc inside the transaction
      const idempotencyRef = db.collection('processedStripeEvents').doc(`pack288_${session.id}`);
      const idempotencyDoc = await transaction.get(idempotencyRef);

      if (idempotencyDoc.exists) {
        logger.warn('Purchase already processed (idempotent skip)', { sessionId: session.id });
        return;
      }

      // Read wallet inside transaction for consistency
      const walletDoc = await transaction.get(walletRef);

      const currentBalance = walletDoc.exists
        ? (walletDoc.data()?.tokensBalance || 0)
        : 0;
      const newBalance = currentBalance + tokens;

      // 1. Write idempotency sentinel (prevents duplicate processing)
      transaction.set(idempotencyRef, {
        sessionId: session.id,
        userId,
        tokens,
        processedAt: serverTimestamp(),
      });

      // 2. Create purchase record inside transaction
      const purchase: TokenPurchase = {
        purchaseId,
        userId,
        packageId: packageId as any,
        tokens,
        priceUSD,
        paidCurrency: session.currency?.toUpperCase() || 'USD',
        paidAmount: (session.amount_total || 0) / 100, // Convert from cents
        platform: 'web',
        provider: 'stripe',
        providerOrderId: session.id,
        status: 'COMPLETED',
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
      transaction.set(db.collection('tokenPurchases').doc(purchaseId), purchase);

      // 3. Credit tokens to wallet
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

      // 4. Create wallet transaction record
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
          totalUSD: FieldValue.increment(priceUSD),
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
  const rawPackId = paymentIntent.metadata?.packId || paymentIntent.metadata?.packageId;
  const packageId = normalizeTokenPackId(rawPackId || '');

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
  { region: 'europe-west1', memory: '128MiB' },
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

// ============================================================================
// STRIPE FULFILLMENT CALLABLE (WEBHOOK FALLBACK)
// ============================================================================

/**
 * Fulfill a Stripe checkout session on-demand.
 *
 * Called by the success page after redirect. Retrieves the checkout session
 * directly from Stripe and runs the same idempotent handleCheckoutCompleted
 * logic. This guarantees token crediting even when the Stripe webhook has
 * not yet been delivered (localhost, slow delivery, mis-routed webhook).
 *
 * Idempotency: safe to call multiple times — the transaction inside
 * handleCheckoutCompleted checks processedStripeEvents before writing.
 */
export const tokens_fulfillCheckout = https.onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { sessionId } = request.data as { sessionId?: string };

    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Session ID is required');
    }

    try {
      // Retrieve the checkout session directly from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (!session) {
        throw new HttpsError('not-found', 'Stripe session not found');
      }

      // Verify this session belongs to the authenticated user
      const sessionUserId =
        session.metadata?.uid ||
        session.metadata?.userId ||
        session.client_reference_id;

      if (sessionUserId !== auth.uid) {
        logger.warn('Fulfillment attempt for wrong user', {
          sessionId,
          sessionUserId,
          callerUid: auth.uid,
        });
        throw new HttpsError('permission-denied', 'Session does not belong to this user');
      }

      // Only fulfill completed sessions
      if (session.payment_status !== 'paid') {
        return {
          success: false,
          error: 'Payment not completed',
          paymentStatus: session.payment_status,
        };
      }

      // Run the same idempotent fulfillment logic as the webhook
      await handleCheckoutCompleted(session);

      // Return the purchase record
      const purchaseSnapshot = await db
        .collection('tokenPurchases')
        .where('providerOrderId', '==', sessionId)
        .where('userId', '==', auth.uid)
        .limit(1)
        .get();

      if (purchaseSnapshot.empty) {
        // Fulfillment ran but purchase not found — should not happen
        logger.error('Fulfillment completed but purchase record missing', { sessionId });
        return { success: false, error: 'Purchase record not found after fulfillment' };
      }

      const purchase = purchaseSnapshot.docs[0].data();

      logger.info('Fulfillment callable completed', {
        sessionId,
        userId: auth.uid,
        tokens: purchase.tokens,
      });

      return {
        success: true,
        fulfilled: true,
        purchase: {
          tokens: purchase.tokens,
          packageId: purchase.packageId,
          status: purchase.status,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Fulfillment callable error:', error);
      throw new HttpsError('internal', 'Failed to fulfill purchase');
    }
  }
);

// ============================================================================
// PURCHASE HISTORY CALLABLE
// ============================================================================

/**
 * Return the authenticated user's token purchase history from tokenPurchases.
 *
 * Called by /wallet/history on the web app to avoid direct client-side
 * Firestore reads that are blocked by security rules.
 *
 * Returns purchases sorted newest-first with fields the UI needs:
 *   sessionId, providerOrderId, packageId, packId, tokens, amount,
 *   currency, source/platform, status, createdAt.
 */
export const tokens_getPurchaseHistory = https.onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { limit: requestedLimit } = (request.data || {}) as { limit?: number };
    const safeLimit = Math.min(Math.max(requestedLimit || 100, 1), 200);

    try {
      const snapshot = await db
        .collection('tokenPurchases')
        .where('userId', '==', auth.uid)
        .orderBy('createdAt', 'desc')
        .limit(safeLimit)
        .get();

      const purchases = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          sessionId: d.providerOrderId ?? doc.id,
          providerOrderId: d.providerOrderId ?? null,
          packageId: d.packageId ?? d.packId ?? null,
          packId: d.packId ?? d.packageId ?? null,
          tokens: d.tokens ?? 0,
          amount: typeof d.paidAmount === 'number'
            ? Math.round(d.paidAmount * 100)
            : (d.amountTotal ?? null),
          currency: d.paidCurrency ?? d.currency ?? null,
          source: d.platform ?? d.source ?? 'web',
          platform: d.platform ?? d.source ?? 'web',
          status: d.status ?? 'UNKNOWN',
          createdAt: d.createdAt?.toMillis?.() ?? null,
        };
      });

      return { success: true, purchases };
    } catch (error: any) {
      logger.error('Get purchase history error:', error);
      throw new HttpsError('internal', 'Failed to fetch purchase history');
    }
  }
);




























