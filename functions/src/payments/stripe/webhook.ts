/**
 * PACK PHASE 3.1 — Canonical Stripe Webhook Handler
 *
 * TREASURY INVARIANTS ENFORCED:
 * - NO_DISCOUNTS: Rejects sessions with coupons/promotions
 * - NO_FREE_TOKENS: Minimum amount validation
 * - FX0: All amounts in USD canonical (display-only FX)
 * - 65-35 BASELINE: Platform/creator split where applicable
 *
 * SECURITY:
 * - Signature verification required (fail-fast if missing)
 * - Idempotency via stripe_events collection
 * - Atomic ledger updates via Firestore transactions
 *
 * @module payments/stripe/webhook
 */

import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireStripeForWebhook, Stripe } from './stripeClient';
import { db, serverTimestamp, logger } from '../../runtime';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Canonical token pack pricing.
 * Source of truth - matches paymentsComplete.ts TOKEN_PACKS.
 * NO promotional pricing, NO coupons, NO bonuses.
 */
export interface CanonicalTokenPack {
  packId: string;
  tokens: number;
  priceUSD: number;  // Canonical price in USD cents
  priceEUR: number;  // Price in EUR cents
  pricePLN: number;  // Price in PLN groszy
  priceGBP: number;  // Price in GBP pence
}

/**
 * Canonical token packs - IMMUTABLE pricing.
 * Any change requires explicit migration.
 */
export const CANONICAL_TOKEN_PACKS: Record<string, CanonicalTokenPack> = {
  MINI: { packId: 'MINI', tokens: 100, priceUSD: 549, priceEUR: 499, pricePLN: 2000, priceGBP: 449 },
  BASIC: { packId: 'BASIC', tokens: 300, priceUSD: 1599, priceEUR: 1499, pricePLN: 6000, priceGBP: 1299 },
  STANDARD: { packId: 'STANDARD', tokens: 500, priceUSD: 2699, priceEUR: 2499, pricePLN: 10000, priceGBP: 2199 },
  PREMIUM: { packId: 'PREMIUM', tokens: 1000, priceUSD: 5299, priceEUR: 4999, pricePLN: 20000, priceGBP: 4399 },
  PRO: { packId: 'PRO', tokens: 2000, priceUSD: 10499, priceEUR: 9999, pricePLN: 40000, priceGBP: 8799 },
  ELITE: { packId: 'ELITE', tokens: 5000, priceUSD: 25999, priceEUR: 24999, pricePLN: 100000, priceGBP: 21999 },
};

/**
 * Stripe event status for idempotency tracking.
 */
type StripeEventStatus = 'processing' | 'processed' | 'failed' | 'rejected';

/**
 * Stripe event document structure.
 */
interface StripeEventDoc {
  eventId: string;
  eventType: string;
  status: StripeEventStatus;
  processedAt?: Timestamp | FieldValue;
  failedAt?: Timestamp | FieldValue;
  rejectionReason?: string;
  sessionId?: string;
  userId?: string;
  tokensGranted?: number;
  retryCount: number;
  metadata?: Record<string, any>;
  createdAt: Timestamp | FieldValue;
}

/**
 * Wallet transaction record.
 */
interface WalletTransaction {
  txId: string;
  eventId: string;
  userId: string;
  tokenPackId: string;
  tokens: number;
  amountCents: number;
  currency: string;
  provider: 'stripe';
  providerTxId: string;
  status: 'completed';
  type: 'purchase';
  timestamp: Timestamp | FieldValue;
  balanceBefore: number;
  balanceAfter: number;
}

// ============================================================================
// VALIDATION FUNCTIONS (NO_DISCOUNTS / NO_BONUS)
// ============================================================================

/**
 * Assert that a checkout session has no discounts or promotional pricing.
 *
 * REJECTS if:
 * - Session has any discounts applied
 * - Session has coupon codes
 * - Amount paid is less than expected for the pack
 *
 * @throws Error if discounts detected
 */
function assertNoDiscounts(session: Stripe.Checkout.Session): void {
  // Check for discount objects in total_details
  if (session.total_details?.amount_discount && session.total_details.amount_discount > 0) {
    throw new Error(`SECURITY_VIOLATION: Discount detected on session ${session.id}. Amount: ${session.total_details.amount_discount}`);
  }

  // Check for coupon/promotion codes (use type assertion for API version compatibility)
  const sessionAny = session as any;
  if (sessionAny.discounts && Array.isArray(sessionAny.discounts) && sessionAny.discounts.length > 0) {
    throw new Error(`SECURITY_VIOLATION: Coupon/promotion detected on session ${session.id}`);
  }

  // Check for applied discount IDs
  if (sessionAny.total_details?.breakdown?.discounts && sessionAny.total_details.breakdown.discounts.length > 0) {
    throw new Error(`SECURITY_VIOLATION: Discount breakdown found on session ${session.id}`);
  }

  // Additional checks that could indicate promotional pricing
  if (sessionAny.allow_promotion_codes === true) {
    // Note: This shouldn't grant tokens if promo was used
    logger.warn('Session allowed promotion codes - verify no discounts were applied', { sessionId: session.id });
  }
}

/**
 * Validate checkout session amount against canonical pricing.
 *
 * @param session Stripe checkout session
 * @param packId Token pack ID from metadata
 * @returns Validated tokens to grant
 * @throws Error if price mismatch or unknown pack
 */
function validateCanonicalPricing(
  session: Stripe.Checkout.Session,
  packId: string
): number {
  const pack = CANONICAL_TOKEN_PACKS[packId];
  if (!pack) {
    throw new Error(`SECURITY_VIOLATION: Unknown token pack "${packId}" on session ${session.id}`);
  }

  const amountPaid = session.amount_total || 0;
  const currency = (session.currency || '').toUpperCase();

  // Get expected price for the currency
  let expectedAmount: number;
  switch (currency) {
    case 'USD':
      expectedAmount = pack.priceUSD;
      break;
    case 'EUR':
      expectedAmount = pack.priceEUR;
      break;
    case 'PLN':
      expectedAmount = pack.pricePLN;
      break;
    case 'GBP':
      expectedAmount = pack.priceGBP;
      break;
    default:
      throw new Error(`SECURITY_VIOLATION: Unsupported currency "${currency}" on session ${session.id}`);
  }

  // Strict price match - no tolerance for price manipulation
  if (amountPaid !== expectedAmount) {
    throw new Error(
      `SECURITY_VIOLATION: Price mismatch on session ${session.id}. ` +
      `Expected ${expectedAmount} ${currency}, got ${amountPaid} ${currency} for pack ${packId}`
    );
  }

  // No free tokens - minimum amount validation
  if (amountPaid <= 0) {
    throw new Error(`SECURITY_VIOLATION: Zero or negative amount on session ${session.id}`);
  }

  return pack.tokens;
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Canonical Stripe webhook handler.
 *
 * Endpoint: POST /stripeWebhookV1
 *
 * Features:
 * - Signature verification (REQUIRED)
 * - Idempotency via stripe_events/{eventId}
 * - Atomic wallet updates via Firestore transactions
 * - Treasury invariants: NO_DISCOUNTS, NO_FREE_TOKENS
 *
 * Supported events:
 * - checkout.session.completed: Token pack purchases
 * - payment_intent.succeeded: Payment confirmations
 * - invoice.paid: Subscription payments (if applicable)
 */
export const stripeWebhookV1 = onRequest(
  {
    region: 'europe-west3',
    minInstances: 1,  // Keep warm for latency
    maxInstances: 10,
    concurrency: 80,
    memory: '512MiB',
    timeoutSeconds: 60,
    cpu: 1,
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Get signature header
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) {
      logger.error('[stripeWebhookV1] Missing Stripe signature header');
      res.status(400).send('Missing signature');
      return;
    }

    // Initialize Stripe and verify signature
    let event: Stripe.Event;
    try {
      const { stripe, webhookSecret } = requireStripeForWebhook();
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      logger.error('[stripeWebhookV1] Signature verification failed', { error: err.message });
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    logger.info('[stripeWebhookV1] Event received', { type: event.type, id: event.id });

    // Process event with idempotency
    try {
      const result = await processStripeEvent(event);
      res.status(200).json(result);
    } catch (err: any) {
      logger.error('[stripeWebhookV1] Processing failed', { error: err.message, eventId: event.id });
      // Return 200 to prevent Stripe retries for permanent failures
      // Log security violations separately
      if (err.message?.includes('SECURITY_VIOLATION')) {
        res.status(200).json({ received: true, rejected: true, reason: 'security_violation' });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
);

/**
 * Process a Stripe event with idempotency protection.
 *
 * Uses stripe_events/{eventId} for exactly-once semantics.
 */
async function processStripeEvent(event: Stripe.Event): Promise<{ received: boolean; duplicate?: boolean; status?: string }> {
  const eventId = event.id;
  const eventRef = db.collection('stripe_events').doc(eventId);

  // Idempotency check
  const existingEvent = await eventRef.get();
  if (existingEvent.exists) {
    const data = existingEvent.data() as StripeEventDoc;
    logger.info('[stripeWebhookV1] Duplicate event detected', { eventId, status: data.status });
    return { received: true, duplicate: true, status: data.status };
  }

  // Route event to handler
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event);
      break;

    default:
      logger.info('[stripeWebhookV1] Unhandled event type', { type: event.type });
      // Mark as processed but no-op
      await eventRef.set({
        eventId,
        eventType: event.type,
        status: 'processed',
        processedAt: serverTimestamp(),
        retryCount: 0,
        createdAt: serverTimestamp(),
      } as StripeEventDoc);
  }

  return { received: true };
}

/**
 * Handle checkout.session.completed event.
 *
 * This is the primary token purchase flow.
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const eventId = event.id;
  const eventRef = db.collection('stripe_events').doc(eventId);

  // Extract metadata
  const userId = session.metadata?.userId || session.client_reference_id;
  const packId = session.metadata?.packId || session.metadata?.tokenPackId;

  if (!userId) {
    // Mark as rejected - no user ID
    await markEventRejected(eventRef, eventId, event.type, 'Missing userId in session metadata');
    throw new Error('SECURITY_VIOLATION: Missing userId in session metadata');
  }

  if (!packId) {
    // Mark as rejected - no pack ID
    await markEventRejected(eventRef, eventId, event.type, 'Missing packId in session metadata');
    throw new Error('SECURITY_VIOLATION: Missing packId in session metadata');
  }

  // Security validations
  assertNoDiscounts(session);
  const tokensToGrant = validateCanonicalPricing(session, packId);

  // Atomic ledger update
  await db.runTransaction(async (transaction) => {
    // Double-check idempotency within transaction
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) {
      logger.info('[stripeWebhookV1] Event already processing (race)', { eventId });
      return;
    }

    // Mark event as processing
    const eventDoc: StripeEventDoc = {
      eventId,
      eventType: event.type,
      status: 'processing',
      sessionId: session.id,
      userId,
      retryCount: 0,
      createdAt: serverTimestamp(),
    };
    transaction.set(eventRef, eventDoc);

    // Get or create wallet
    const walletRef = db.collection('wallets').doc(userId);
    const walletSnap = await transaction.get(walletRef);

    let currentBalance = 0;
    if (walletSnap.exists) {
      currentBalance = walletSnap.data()?.balance || 0;
    } else {
      // Initialize wallet
      transaction.set(walletRef, {
        userId,
        balance: 0,
        totalDeposits: 0,
        totalSpent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const newBalance = currentBalance + tokensToGrant;

    // Create transaction record
    const txId = `tx_stripe_${eventId}`;
    const txRef = db.collection('walletTransactions').doc(txId);
    const walletTx: WalletTransaction = {
      txId,
      eventId,
      userId,
      tokenPackId: packId,
      tokens: tokensToGrant,
      amountCents: session.amount_total || 0,
      currency: (session.currency || 'usd').toUpperCase(),
      provider: 'stripe',
      providerTxId: session.payment_intent as string || session.id,
      status: 'completed',
      type: 'purchase',
      timestamp: serverTimestamp(),
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
    };
    transaction.set(txRef, walletTx);

    // Update wallet balance
    transaction.update(walletRef, {
      balance: FieldValue.increment(tokensToGrant),
      totalDeposits: FieldValue.increment(tokensToGrant),
      updatedAt: serverTimestamp(),
    });

    // Mark event as processed
    transaction.update(eventRef, {
      status: 'processed',
      processedAt: serverTimestamp(),
      tokensGranted: tokensToGrant,
    });
  });

  logger.info('[stripeWebhookV1] Checkout completed', {
    eventId,
    userId,
    packId,
    tokens: tokensToGrant,
    sessionId: session.id,
  });
}

/**
 * Handle payment_intent.succeeded event.
 *
 * Used for standalone payment intents (not checkout sessions).
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const eventId = event.id;
  const eventRef = db.collection('stripe_events').doc(eventId);

  // For payment intents, we may need different handling
  // If this is linked to a checkout session, skip (handled by checkout.session.completed)
  const linkedSession = paymentIntent.metadata?.sessionId;
  if (linkedSession) {
    logger.info('[stripeWebhookV1] PaymentIntent linked to session, skipping', { eventId, sessionId: linkedSession });
    await eventRef.set({
      eventId,
      eventType: event.type,
      status: 'processed',
      processedAt: serverTimestamp(),
      retryCount: 0,
      metadata: { linkedSession },
      createdAt: serverTimestamp(),
    } as StripeEventDoc);
    return;
  }

  // Handle standalone payment intent if needed
  // For now, log and mark as processed
  logger.info('[stripeWebhookV1] Standalone PaymentIntent succeeded', { eventId, paymentIntentId: paymentIntent.id });
  await eventRef.set({
    eventId,
    eventType: event.type,
    status: 'processed',
    processedAt: serverTimestamp(),
    retryCount: 0,
    createdAt: serverTimestamp(),
  } as StripeEventDoc);
}

/**
 * Handle invoice.paid event.
 *
 * Used for subscription renewals.
 */
async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const eventId = event.id;
  const eventRef = db.collection('stripe_events').doc(eventId);

  // Log for now - subscription handling can be added
  logger.info('[stripeWebhookV1] Invoice paid', { eventId, invoiceId: invoice.id, customerId: invoice.customer });

  await eventRef.set({
    eventId,
    eventType: event.type,
    status: 'processed',
    processedAt: serverTimestamp(),
    retryCount: 0,
    metadata: {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
    },
    createdAt: serverTimestamp(),
  } as StripeEventDoc);
}

/**
 * Mark an event as rejected (security violation).
 */
async function markEventRejected(
  eventRef: FirebaseFirestore.DocumentReference,
  eventId: string,
  eventType: string,
  reason: string
): Promise<void> {
  await eventRef.set({
    eventId,
    eventType,
    status: 'rejected',
    rejectionReason: reason,
    failedAt: serverTimestamp(),
    retryCount: 0,
    createdAt: serverTimestamp(),
  } as StripeEventDoc);

  logger.error('[stripeWebhookV1] Event rejected', { eventId, eventType, reason });
}

// Re-export for testing
export {
  assertNoDiscounts,
  validateCanonicalPricing,
  processStripeEvent,
  handleCheckoutSessionCompleted,
};
