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
import { onCall, onRequest, HttpsError, logger } from './runtime';
import { FunctionResponse } from './types';
import { DEFAULT_TOKEN_PACKS } from './pack277-token-packs';

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

    const session = event.data.object as Stripe.Checkout.Session;

    // ── 3. HARD CHECK: payment_status must be "paid" ──────────────
    if (session.payment_status !== 'paid') {
      logger.info('[stripeWebhook] payment_status not paid, ignoring:', session.payment_status);
      res.json({ received: true });
      return;
    }

    // ── 4. HARD CHECK: currency must be "usd" ─────────────────────
    if (session.currency !== 'usd') {
      logger.error('[stripeWebhook] Non-USD currency rejected:', session.currency);
      res.json({ received: true, error: 'Non-USD currency' });
      return;
    }

    // ── 5. Extract metadata ───────────────────────────────────────
    const sessionId = session.id;
    const userId = session.metadata?.userId;
    const packId = session.metadata?.packId;
    const tokensFromMeta = parseInt(session.metadata?.tokens || '0', 10);

    if (!userId || !packId || tokensFromMeta <= 0) {
      logger.error('[stripeWebhook] Invalid metadata:', { userId, packId, tokensFromMeta });
      res.json({ received: true, error: 'Invalid metadata' });
      return;
    }

    // ── 6. Validate pack exists in DEFAULT_TOKEN_PACKS ────────────
    const pack = PACK_BY_ID.get(packId);
    if (!pack) {
      logger.error('[stripeWebhook] Unknown packId:', packId);
      res.json({ received: true, error: 'Unknown packId' });
      return;
    }

    // ── 7. HARD CHECK: priceUSD must be defined on pack ───────────
    if (pack.priceUSD == null) {
      logger.error('[stripeWebhook] Pack missing priceUSD:', packId);
      res.json({ received: true, error: 'Pack missing priceUSD' });
      return;
    }

    // ── 8. HARD CHECK: amount_total must match pack priceUSD ──────
    //    DEFAULT_TOKEN_PACKS.priceUSD is in dollars; Stripe amount_total is in cents.
    const expectedCents = Math.round(pack.priceUSD * 100);
    if (session.amount_total !== expectedCents) {
      logger.error('[stripeWebhook] Amount mismatch:', {
        expected: expectedCents,
        got: session.amount_total,
        packId,
        sessionId,
      });
      res.json({ received: true, error: 'Amount mismatch' });
      return;
    }

    // ── 9. Validate token count from metadata matches pack ────────
    if (tokensFromMeta !== pack.tokens) {
      logger.error('[stripeWebhook] Token count mismatch:', {
        expected: pack.tokens,
        got: tokensFromMeta,
        packId,
      });
      res.json({ received: true, error: 'Token count mismatch' });
      return;
    }

    // ── 10. Atomic transaction: idempotency + wallet credit ───────
    const purchaseRef = db.collection('purchases').doc(sessionId);
    const walletRef = db
      .collection('users')
      .doc(userId)
      .collection('wallet')
      .doc('current');

    try {
      await db.runTransaction(async (tx) => {
        // Idempotency: check if session already processed
        const existingPurchase = await tx.get(purchaseRef);
        if (existingPurchase.exists) {
          logger.info(`[stripeWebhook] Duplicate session ${sessionId} — skipping`);
          return;
        }

        // Read wallet inside transaction for consistency
        const walletSnap = await tx.get(walletRef);
        const wallet = walletSnap.data();

        // Write purchase record (idempotency sentinel)
        tx.set(purchaseRef, {
          sessionId,
          userId,
          packId: pack.id,
          tokens: pack.tokens,
          amountTotal: session.amount_total,
          currency: session.currency,
          status: 'COMPLETED',
          stripePaymentIntentId: session.payment_intent,
          stripeCustomerId: session.customer,
          createdAt: serverTimestamp(),
          processedAt: serverTimestamp(),
        });

        // Credit tokens to wallet atomically
        if (walletSnap.exists) {
          tx.update(walletRef, {
            purchased: increment(pack.tokens),
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(walletRef, {
            userId,
            purchased: pack.tokens,
            earned: 0,
            spent: 0,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }
      });

      logger.info(`[stripeWebhook] Credited ${pack.tokens} tokens to ${userId} (session ${sessionId})`);
      res.json({ received: true, success: true });
    } catch (error: any) {
      logger.error('[stripeWebhook] Transaction failed:', error);
      res.status(500).send(`Webhook handler error: ${error.message}`);
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

    const purchaseRef = db.collection('purchases').doc(sessionId);
    const walletRef = db
      .collection('users')
      .doc(userId)
      .collection('wallet')
      .doc('current');

    const result = await db.runTransaction(async (tx) => {
      // Idempotency check
      const existingPurchase = await tx.get(purchaseRef);
      if (existingPurchase.exists) {
        // Already credited — return current wallet balance
        const walletSnap = await tx.get(walletRef);
        const wallet = walletSnap.data();
        return { newBalance: (wallet?.purchased || 0), alreadyProcessed: true };
      }

      // Read wallet
      const walletSnap = await tx.get(walletRef);
      const wallet = walletSnap.data();
      const currentPurchased = wallet?.purchased || 0;
      const newBalance = currentPurchased + pack.tokens;

      // Write purchase record (idempotency sentinel)
      tx.set(purchaseRef, {
        sessionId,
        userId,
        packId: pack.id,
        tokens: pack.tokens,
        status: 'COMPLETED',
        source: 'creditTokensCallable',
        createdAt: serverTimestamp(),
        processedAt: serverTimestamp(),
      });

      // Credit wallet
      if (walletSnap.exists) {
        tx.update(walletRef, {
          purchased: increment(pack.tokens),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(walletRef, {
          userId,
          purchased: pack.tokens,
          earned: 0,
          spent: 0,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      return { newBalance, alreadyProcessed: false };
    });

    if (result.alreadyProcessed) {
      logger.info(`[creditTokensCallable] Already processed session ${sessionId}`);
    } else {
      logger.info(`[creditTokensCallable] Credited ${pack.tokens} tokens to ${userId}`);
    }

    return { ok: true, data: { newBalance: result.newBalance } };
  }
);

// ─────────────────────────────────────────────
// REQUEST PAYOUT (USD canonical)
// ─────────────────────────────────────────────
export const requestPayoutCallable = onCall(
  { region: "europe-west1" },
  async (request): Promise<FunctionResponse<{ payoutId: string }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const userId = request.auth.uid;
    // Accept both 'tokens' (frontend) and 'amountTokens' (legacy) field names.
    // Coerce to Number to guard against string values from UI inputs.
    const rawTokens = request.data.tokens ?? request.data.amountTokens;
    const amountTokens = Number(rawTokens);

    if (isNaN(amountTokens) || amountTokens <= 0) {
      throw new HttpsError("invalid-argument", "Invalid token amount");
    }

    // Read balance from canonical wallets/{uid} collection
    const walletRef = db.collection("wallets").doc(userId);

    const walletSnap = await walletRef.get();
    const wallet = walletSnap.data();

    if (!wallet || (wallet.balance ?? 0) < amountTokens) {
      throw new HttpsError("failed-precondition", "Insufficient earned tokens");
    }

    if (amountTokens < 100) {
      throw new HttpsError("invalid-argument", "Minimum payout is 100 tokens");
    }

    // USD canonical payout rate
    const TOKEN_PAYOUT_USD = 0.03;
    const amountUSD = amountTokens * TOKEN_PAYOUT_USD;

    const payoutId = generateId();

    await db.runTransaction(async (tx) => {
      tx.update(walletRef, {
        balance: increment(-amountTokens),
      });

      tx.set(db.collection("payoutRequests").doc(payoutId), {
        payoutId,
        userId,
        amountTokens,
        amountUSD,
        status: "pending",
        createdAt: serverTimestamp(),
      });
    });

    return { ok: true, data: { payoutId } };
  }
);























