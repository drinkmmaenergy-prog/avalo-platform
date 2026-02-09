/**
 * POST /api/stripe/webhook
 *
 * Stripe Webhook Handler — processes checkout.session.completed events.
 *
 * INVARIANTS:
 * - Signature verification using STRIPE_WEBHOOK_SECRET.
 * - Idempotency: checks if transaction already exists before crediting.
 * - NEVER trusts client amounts — reads from session metadata set at creation.
 * - Writes purchase record to Firestore purchases/{sessionId}.
 * - Credits tokens via Firestore FieldValue.increment on users/{uid}.tokenBalance.
 * - Does NOT modify burn logic, pack prices, VAT/Stripe/treasury rules.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import stripe from '@/lib/stripe-server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * Disable Next.js body parsing — Stripe needs the raw body for signature verification.
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  // ── Read raw body for signature verification ─────────────────────
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[stripe/webhook] Failed to read request body:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // ── Verify Stripe signature ──────────────────────────────────────
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[stripe/webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  // ── Handle checkout.session.completed ────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    const sessionId = session.id;
    const userId = session.metadata?.userId;
    const packId = session.metadata?.packId;
    const tokens = parseInt(session.metadata?.tokens || '0', 10);
    const source = session.metadata?.source || 'web';

    if (!userId || !packId || tokens <= 0) {
      console.error('[stripe/webhook] Missing or invalid metadata:', { userId, packId, tokens });
      // Return 200 to acknowledge receipt — don't retry for bad metadata
      return NextResponse.json({ received: true, error: 'Invalid metadata' });
    }

    // ── Idempotency check ────────────────────────────────────────
    const purchaseRef = adminDb.collection('purchases').doc(sessionId);
    const existingPurchase = await purchaseRef.get();

    if (existingPurchase.exists) {
      console.log(`[stripe/webhook] Duplicate event for session ${sessionId} — skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    // ── Write purchase record ────────────────────────────────────
    const now = FieldValue.serverTimestamp();
    const purchaseRecord = {
      sessionId,
      userId,
      packId,
      tokens,
      amountTotal: session.amount_total,
      currency: session.currency,
      source,
      status: 'COMPLETED',
      stripePaymentIntentId: session.payment_intent,
      stripeCustomerId: session.customer,
      createdAt: now,
      processedAt: now,
    };

    // ── Atomic batch: create purchase + credit tokens ─────────────
    const batch = adminDb.batch();

    // 1. Write purchase record
    batch.set(purchaseRef, purchaseRecord);

    // 2. Credit tokens to user balance
    const userRef = adminDb.collection('users').doc(userId);
    batch.update(userRef, {
      tokenBalance: FieldValue.increment(tokens),
      lastTokenPurchaseAt: now,
    });

    // 3. Write transaction record
    const txRef = adminDb.collection('token_transactions').doc();
    batch.set(txRef, {
      userId,
      type: 'PURCHASE',
      amount: tokens,
      description: `Purchased ${packId} pack (${tokens} tokens)`,
      relatedId: sessionId,
      status: 'COMPLETED',
      createdAt: now,
    });

    try {
      await batch.commit();
      console.log(`[stripe/webhook] Credited ${tokens} tokens to user ${userId} (session: ${sessionId})`);
    } catch (err) {
      console.error('[stripe/webhook] Firestore batch commit failed:', err);
      // Return 500 so Stripe retries
      return NextResponse.json(
        { error: 'Failed to process purchase' },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true, success: true });
  }

  // ── Other event types — acknowledge but don't process ──────────
  console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
  return NextResponse.json({ received: true });
}
