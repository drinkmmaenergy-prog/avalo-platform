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
import { creditTokens, debitForRefund } from './wallet/walletService';
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
        billing_address_collection: 'required',  // P0-4: geo detection for Stripe Tax
        automatic_tax: { enabled: true },          // P0-4: Stripe Tax — auto-calculates VAT/GST/etc.
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
              tax_behavior: 'inclusive',           // P0-4: tax extracted from price, not added on top
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
    // ── Idempotency fast-exit ────────────────────────────────────────────────
    // processedStripeEvents is our secondary sentinel written after the credit.
    // If it already exists the credit was already applied; skip everything.
    const sentinelSnap = await db
      .collection('processedStripeEvents')
      .doc(`pack288_${session.id}`)
      .get();
    if (sentinelSnap.exists) {
      logger.info('Purchase already processed (idempotent skip)', { sessionId: session.id });
      return;
    }

    const purchaseId = `stripe_${session.id}`; // deterministic — safe to re-derive on retry

    // ── Canonical credit (atomic, idempotent, writes ledger) ─────────────────
    // creditTokens() checks idempotency_sentinels INSIDE its own transaction.
    // If a duplicate call races in, one wins atomically; the other is a no-op.
    const idempotencyKey = `pack288_purchase_${session.id}`;
    const { txId, newBalance } = await creditTokens({
      userId,
      amountTokens: tokens,
      type: 'PURCHASE',
      idempotencyKey,
      metadata: {
        stripeSessionId: session.id,
        packageId,
        purchaseId,
        platform: 'web',
        priceUSD,
      },
    });

    // ── Audit records (batch — idempotent by deterministic doc IDs) ──────────
    const auditBatch = db.batch();

    // Secondary sentinel: marks this session done for legacy code
    auditBatch.set(
      db.collection('processedStripeEvents').doc(`pack288_${session.id}`),
      {
        sessionId: session.id,
        userId,
        tokens,
        processedAt: serverTimestamp(),
        ledgerTxId: txId,
      }
    );

    // Purchase record
    const purchase: TokenPurchase = {
      purchaseId,
      userId,
      packageId: packageId as any,
      tokens,
      priceUSD,
      paidCurrency: session.currency?.toUpperCase() || 'USD',
      paidAmount: (session.amount_total || 0) / 100,
      platform: 'web',
      provider: 'stripe',
      providerOrderId: session.id,
      status: 'COMPLETED',
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    auditBatch.set(db.collection('tokenPurchases').doc(purchaseId), purchase, { merge: true });

    // Wallet transaction audit record (keyed by ledger txId)
    auditBatch.set(
      db.collection('walletTransactions').doc(txId),
      {
        txId,
        userId,
        type: 'PURCHASE',
        source: 'STORE',
        amountTokens: tokens,
        beforeBalance: newBalance - tokens,
        afterBalance: newBalance,
        ledgerTxId: txId,
        metadata: {
          purchaseId,
          platform: 'web',
          stripeSessionId: session.id,
        },
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    await auditBatch.commit();

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
 *
 * Canonicalized (Phase 3A-4):
 *   - Replaced wallets/{uid}.tokensBalance (wrong field, phantom) with
 *     walletService.debitForRefund() → wallets/{uid}.balance (canonical).
 *   - Idempotent by Stripe charge ID: duplicate webhook delivery is a no-op.
 *   - Soft-debit policy: debits min(purchase.tokens, currentBalance).
 *     If user already spent some tokens, remaining shortfall is logged for
 *     manual review — we never create a negative canonical balance.
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

    // ── Canonical token debit (soft) ─────────────────────────────────────────
    // Idempotent by Stripe charge.id — re-delivery of charge.refunded is safe.
    // Debits min(purchase.tokens, currentBalance): never goes negative.
    // If shortfall > 0, tokens were already spent; flagged in ledger metadata
    // for manual accounting review (money still refunded to card by Stripe).
    const { tokensDebited, shortfall } = await debitForRefund({
      userId: purchase.userId,
      amountTokens: purchase.tokens,
      idempotencyKey: `stripe_refund_${charge.id}`,
      metadata: {
        chargeId: charge.id,
        paymentIntentId,
        purchaseId: purchase.purchaseId,
        platform: 'web',
      },
    });

    if (shortfall > 0) {
      logger.warn('Stripe refund shortfall: user already spent some tokens', {
        userId: purchase.userId,
        purchaseTokens: purchase.tokens,
        tokensDebited,
        shortfall,
        chargeId: charge.id,
        action: 'manual_review_required',
      });
    }

    logger.info('Charge refunded, canonical tokens debited', {
      userId: purchase.userId,
      purchaseTokens: purchase.tokens,
      tokensDebited,
      shortfall,
      purchaseId: purchase.purchaseId,
      chargeId: charge.id,
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
