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
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import {
  TokenPurchase,
  WebPurchaseRequest,
  WebPurchaseResponse,
} from './types/pack288-token-store.types';
import { getCanonicalTokenPackById, normalizeTokenPackId } from './pack277-token-packs';
import { creditTokens, debitForRefund } from './wallet/walletService';
import { admin, functions, increment, onCall, onRequest, timestamp } from './runtime';
// R3 Phase D — canonical payment-foundation authority (recovered A-C modules, byte-frozen; imported only).
import { recordStripeCheckoutIntent } from './payments/stripeCheckoutIntent';
import {
  completeStripeTokenPurchase,
  NormalizedStripeSession,
} from './payments/canonicalStripeCompletion';

// ── P0-04 CANONICAL CHECKOUT ENABLEMENT GATE (server-authoritative, fail-closed default OFF) ──────────
// The token-checkout provider-session creator is DISABLED unless TOKEN_CHECKOUT_ENABLED === 'true'.
// Unset / anything-else => OFF (fail-closed). This task NEVER sets it to 'true'. It is the single gate
// every checkout creator MUST consult before any provider SDK call. Tests inject an explicit state via
// process.env; production config is never read here. Lives with the canonical creator (pack288) so all
// five recovered Payment-Foundation modules stay byte-frozen for the transition contract.
export const TOKEN_CHECKOUT_ENABLED_ENV = 'TOKEN_CHECKOUT_ENABLED' as const;
export function isTokenCheckoutEnabled(): boolean {
  return process.env[TOKEN_CHECKOUT_ENABLED_ENV] === 'true';
}
export class CheckoutDisabledError extends HttpsError {
  constructor(route: string) {
    super('failed-precondition', `Token checkout is disabled (route=${route})`);
    this.name = 'CheckoutDisabledError';
  }
}
/** Throws a fail-closed HttpsError BEFORE any provider SDK call unless checkout is explicitly enabled. */
export function assertTokenCheckoutEnabled(route: string): void {
  if (!isTokenCheckoutEnabled()) throw new CheckoutDisabledError(route);
}

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

    // P0-04 FLAG-OFF GATE: fail closed BEFORE any Stripe SDK call, pack lookup or DB read while checkout
    // is OFF. This is the UNIQUE canonical creator; every other legacy creator is hard-disabled/unexported.
    assertTokenCheckoutEnabled('tokens_createCheckoutSession');

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

      // R3 Phase D — IMMUTABLE CHECKOUT INTENT. Record the server-authorized snapshot (pack/tokens/
      // amount/currency) keyed by the checkout session id BEFORE returning the URL. Canonical completion
      // prefers this snapshot (authority B) so a paid historical session is never re-priced. Fail closed
      // (never expose the URL) on CONFLICT or a non-USD snapshot.
      const intent = await recordStripeCheckoutIntent({
        checkoutSessionId: session.id,
        userId: auth.uid,
        packId: pack.id,
        tokens: pack.tokens,
        expectedAmountMinor: amount,
        currency,
        priceUSD: pack.priceUSD,
      });
      if (intent.status === 'CONFLICT' || intent.status === 'REJECTED_NON_USD') {
        logger.error('Checkout intent snapshot rejected; not exposing checkout URL', {
          sessionId: session.id,
          status: intent.status,
        });
        throw new HttpsError('failed-precondition', 'Checkout intent could not be recorded');
      }

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
  // R3 Phase D  WEBHOOK COMPLETION ROUTES TO CANONICAL PROVIDER-VERIFIED COMPLETION.
  // Runs ONLY after stripe.webhooks.constructEvent verified the signature (tokens_stripeWebhook).
  // NEVER creates a checkout session and NEVER uses generic creditTokens; it normalizes the verified
  // session and delegates to completeStripeTokenPurchase (dual-barrier exactly-once, immutable audit,
  // PENDING outbox, deterministic reconciliation). Idempotent by construction (provider tx barrier).
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const normalized: NormalizedStripeSession = {
    checkoutSessionId: session.id,
    paymentIntentId,
    mode: session.mode ?? null,
    paymentStatus: session.payment_status ?? null,
    currency: session.currency ?? null,
    amountTotalMinor: typeof session.amount_total === 'number' ? session.amount_total : null,
    clientReferenceId: session.client_reference_id ?? null,
    metadataUid: session.metadata?.uid ?? null,
    metadataUserId: session.metadata?.userId ?? null,
    metadataPackId: session.metadata?.packId ?? session.metadata?.packageId ?? null,
    eventId: null,
    sourceRoute: 'pack288_webhook',
  };
  const result = await completeStripeTokenPurchase(normalized);
  if (result.status === 'REJECTED') {
    // Authority mismatch (mode/paid/currency/pack/amount/owner) never fixes on retry -> ACK.
    logger.error('Canonical completion rejected webhook session', { sessionId: session.id, reason: result.reason });
    return;
  }
  if (result.status === 'RECONCILIATION_REQUIRED') {
    // Transient/internal: canonical service wrote the durable record; request idempotent redelivery.
    throw new Error(`canonical completion reconciliation required: ${result.reason}`);
  }
  logger.info('Canonical completion applied via webhook', { sessionId: session.id, status: result.status });
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

    // P0-04 CONTAINMENT — HARD_DISABLED + UNEXPORTED (removed from index.ts).
    // This was a CLIENT-AUTHORITATIVE completion fallback: a client could trigger crediting from a
    // client-supplied sessionId, bypassing signed-webhook verification and canonical completion.
    // Token crediting is now EXCLUSIVELY driven by the signature-verified webhook -> canonical
    // completeStripeTokenPurchase (dual-barrier exactly-once). No client fallback may complete/credit.
    throw new HttpsError('failed-precondition', 'Client-side fulfillment is disabled; completion is webhook + canonical only');

    // eslint-disable-next-line no-unreachable
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
  }
);
// TRUNCATED_EOF
