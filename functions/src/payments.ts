import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PAYMENTS — Stripe Webhook, Token Credit, Payout Request
 *
 * Exports:
 *   stripeWebhook         — onRequest: Stripe webhook handler (europe-west1)
 *   creditTokensCallable  — onCall: credit tokens to wallet
 *   requestPayoutCallable — onCall: request payout (USD canonical)
 *
 * Invariants:
 *   - USD canonical pricing
 *   - session.id idempotency via `purchases` collection
 *   - Stripe signature verification
 *   - Atomic wallet credit inside Firestore transaction
 *   - DEFAULT_TOKEN_PACKS as price source of truth
 */

import Stripe from 'stripe';
import { db, serverTimestamp, increment, generateId } from './init';
import { debitForPayout, creditTokens } from './wallet/walletService';
import { onCall, onRequest, HttpsError, logger } from './runtime';
import { FunctionResponse } from './types';
import { DEFAULT_TOKEN_PACKS } from './pack277-token-packs';
import { assertPayoutsEnabled } from './wallet/payoutGuard';
// R3 P0-04 webhook canonicalization: sole canonical completion authority (recovered foundation, frozen).
import { completeStripeTokenPurchase, NormalizedStripeSession } from './payments/canonicalStripeCompletion';

// ─────────────────────────────────────────────
// Stripe SDK — initialised lazily from Cloud Run secret
// ─────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Build a lookup map: packId → pack definition
const PACK_BY_ID = new Map(
  DEFAULT_TOKEN_PACKS.map((p) => [p.id, p])
);

// ─────────────────────────────────────────────
// STRIPE WEBHOOK (europe-west1, onRequest)
// ─────────────────────────────────────────────
export const stripeWebhook = onRequest(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60 },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // ── 1. Verify Stripe signature ─────────────────────────────────
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      logger.warn('[stripeWebhook] Missing stripe-signature header');
      res.status(400).send('Missing stripe-signature header');
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
      logger.error('[stripeWebhook] Signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // ── 2. Only handle checkout.session.completed ──────────────────
    if (event.type !== 'checkout.session.completed') {
      res.json({ received: true });
      return;
    }

    // R3 P0-04 WEBHOOK CANONICALIZATION: this signature-verified webhook is WEBHOOK_ONLY_RETAINED_CANONICAL.
    // It NEVER credits via generic creditTokens and NEVER creates a checkout session. The VERIFIED Stripe
    // session (event.data.object, post constructEvent) is the provider evidence; normalize it and delegate to
    // the SOLE canonical completion authority completeStripeTokenPurchase -> creditVerifiedProviderPurchase
    // (one provider-transaction barrier shared across every retained endpoint -> global exactly-once).
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as any)?.id ?? null;
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
      eventId: event.id ?? null,
      sourceRoute: 'payments_stripeWebhook_v1',
    };
    try {
      const result = await completeStripeTokenPurchase(normalized);
      if (result.status === 'RECONCILIATION_REQUIRED') {
        // Transient/internal: canonical service wrote the durable record; request idempotent redelivery.
        logger.error('[stripeWebhook] canonical reconciliation required', { reason: result.reason });
        res.status(500).send('reconciliation required');
        return;
      }
      // CREDITED_NEW / ALREADY_CREDITED / REJECTED all ACK (authority mismatch never fixes on retry).
      res.json({ received: true, status: result.status });
    } catch (error: any) {
      logger.error('[stripeWebhook] canonical completion error:', error?.message);
      res.status(500).send('Webhook handler error');
    }
  }
);

// ─────────────────────────────────────────────
// CREDIT TOKENS CALLABLE
// ─────────────────────────────────────────────
export const creditTokensCallable = onCall(
  { region: 'europe-west1' },
  async (request): Promise<FunctionResponse<{ newBalance: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Auth required');
    }

    // P0-04 CONTAINMENT — HARD_DISABLED + UNEXPORTED (removed from index.ts).
    // This client-authenticated path credited pack.tokens from a CLIENT-supplied packId + arbitrary
    // sessionId with ZERO verified provider completion — a free-mint. It is now fail-closed: ordinary
    // authenticated callers receive an error and ZERO credit. Only the signature-verified webhook ->
    // canonical completeStripeTokenPurchase (provider-verified, dual-barrier) may credit tokens.
    throw new HttpsError('failed-precondition', 'Direct token crediting is disabled; credit requires verified provider completion');

    // eslint-disable-next-line no-unreachable
    const { packId, sessionId } = request.data;

    if (!packId || typeof packId !== 'string') {
      throw new HttpsError('invalid-argument', 'packId is required');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'sessionId is required');
    }

    const userId = request.auth.uid;

    const pack = PACK_BY_ID.get(packId);
    if (!pack) {
      throw new HttpsError('not-found', `Unknown packId: ${packId}`);
    }

    // Write purchase record (idempotency sentinel for this callable)
    const purchaseRef = db.collection('purchases').doc(sessionId);
    const existingPurchase = await purchaseRef.get();

    if (!existingPurchase.exists) {
      await purchaseRef.set({
        sessionId,
        userId,
        packId: pack.id,
        tokens: pack.tokens,
        status: 'COMPLETED',
        source: 'creditTokensCallable',
        createdAt: serverTimestamp(),
        processedAt: serverTimestamp(),
      });
    }

    // ── Canonical credit via walletService (idempotent) ───────────────────────
    // creditTokens() checks idempotency_sentinels inside its own transaction.
    // Safe to call on retry — if already credited, returns current balance as no-op.
    const { newBalance } = await creditTokens({
      userId,
      amountTokens: pack.tokens,
      type: 'PURCHASE',
      idempotencyKey: `credit_callable_${sessionId}`,
      metadata: { packId: pack.id, sessionId, source: 'creditTokensCallable' },
    });

    if (existingPurchase.exists) {
      logger.info(`[creditTokensCallable] Already processed session ${sessionId}`);
    } else {
      logger.info(`[creditTokensCallable] Credited ${pack.tokens} tokens to ${userId}`);
    }

    return { ok: true, data: { newBalance } };
  }
);

// ─────────────────────────────────────────────
// REQUEST PAYOUT (USD canonical)
// ─────────────────────────────────────────────
export const requestPayoutCallable = onCall(
  { region: "europe-west1" },
  async (request): Promise<FunctionResponse<{ payoutId: string }>> => {
    // [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — kill switch must be first, before any auth or wallet check
    assertPayoutsEnabled();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const userId = request.auth.uid;
    // Accept both 'tokens' (frontend) and 'amountTokens' (legacy) field names.
    // Coerce to Number to guard against string values from UI inputs.
    const rawTokens = request.data.tokens ?? request.data.amountTokens;
    const amountTokens = Number(rawTokens);

    if (isNaN(amountTokens) || amountTokens <= 0 || !Number.isInteger(amountTokens)) {
      throw new HttpsError("invalid-argument", "Invalid token amount");
    }

    if (amountTokens < 100) {
      throw new HttpsError("invalid-argument", "Minimum payout is 100 tokens");
    }

    // Prevent duplicate payout requests -- one pending/processing per user at a time
    const existing = await db
      .collection("payoutRequests")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "processing"])
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new HttpsError(
        "already-exists",
        "A payout request is already pending. Please wait for it to be processed."
      );
    }

    // Payout formula (canonical)
    // gross      = tokens * $0.04
    // commission = gross * 20%   (platform cut)
    // fee        = (gross - commission) * 5%  (processing fee)
    // net        = gross - commission - fee
    const gross = amountTokens * 0.04;
    const commission = gross * 0.20;
    const afterCommission = gross - commission;
    const fee = afterCommission * 0.05;
    const netUSD = afterCommission - fee;

    const payoutId = generateId();
    // Idempotency key scoped to this specific payout request
    const idempotencyKey = `payout_request_${payoutId}`;

    // Atomically debit wallet -- balance check, idempotency, and ledger inside transaction.
    // debitForPayout: balance check INSIDE transaction (no TOCTOU race),
    // idempotency sentinel (prevents double-debit on retry),
    // canonical PAYOUT ledger entry (before/after snapshot).
    await debitForPayout({
      userId,
      amountTokens,
      idempotencyKey,
      payoutId,
    });

    // Record payout request for approval workflow.
    // Written after debit succeeds. If this write fails the ledger records
    // the payoutId so the record is recoverable. Client retry is safe:
    // debitForPayout is idempotent on the same idempotencyKey.
    await db.collection("payoutRequests").doc(payoutId).set({
      payoutId,
      userId,
      amountTokens,
      grossUSD: parseFloat(gross.toFixed(6)),
      commissionUSD: parseFloat(commission.toFixed(6)),
      feeUSD: parseFloat(fee.toFixed(6)),
      amountUSD: parseFloat('0'),
    });
    return { ok: true, data: { payoutId } };
  }
);
// TRUNCATED_EOF
