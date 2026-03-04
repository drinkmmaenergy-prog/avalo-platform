import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import stripe from '@/lib/stripe-server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CANONICAL_TOKEN_PACKS } from '@/types/phase33.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // raw body required for Stripe signature verification
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[stripe/webhook] Failed to read request body:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

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

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // HARD CHECK 1 — must be paid
  if (session.payment_status !== 'paid') {
    console.log('[stripe/webhook] payment_status not paid, ignoring:', session.payment_status);
    return NextResponse.json({ received: true });
  }

  const sessionId = session.id;
  const userId = session.metadata?.userId;
  const packId = session.metadata?.packId;
  const tokens = parseInt(session.metadata?.tokens || '0', 10);
  const source = session.metadata?.source || 'web';

  if (!userId || !packId || tokens <= 0) {
    console.error('[stripe/webhook] Missing or invalid metadata:', { userId, packId, tokens });
    return NextResponse.json({ received: true, error: 'Invalid metadata' });
  }

  const pack = CANONICAL_TOKEN_PACKS[String(packId).toUpperCase()];
  if (!pack) {
    console.error('[stripe/webhook] Unknown packId:', packId);
    return NextResponse.json({ received: true, error: 'Unknown packId' });
  }

  // HARD CHECK 2 — verify amount equals canonical USD price (cents)
  if (session.amount_total !== pack.priceUSD) {
    console.error('[stripe/webhook] Amount mismatch:', {
      expected: pack.priceUSD,
      got: session.amount_total,
      packId,
      sessionId,
    });
    // acknowledge to avoid retries for tampered/misconfigured sessions
    return NextResponse.json({ received: true, error: 'Amount mismatch' });
  }

  const purchaseRef = adminDb.collection('purchases').doc(sessionId);
  const userRef = adminDb.collection('users').doc(userId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const existingPurchase = await tx.get(purchaseRef);
      if (existingPurchase.exists) {
        console.log(`[stripe/webhook] Duplicate session ${sessionId} — skipping`);
        return;
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new Error(`User does not exist: ${userId}`);
      }

      const now = FieldValue.serverTimestamp();

      tx.set(purchaseRef, {
        sessionId,
        userId,
        packId: pack.packId,
        tokens,
        amountTotal: session.amount_total,
        currency: session.currency,
        source,
        status: 'COMPLETED',
        stripePaymentIntentId: session.payment_intent,
        stripeCustomerId: session.customer,
        createdAt: now,
        processedAt: now,
      });

      tx.update(userRef, {
        tokenBalance: FieldValue.increment(tokens),
        lastTokenPurchaseAt: now,
      });

      const txRef = adminDb.collection('token_transactions').doc();
      tx.set(txRef, {
        userId,
        type: 'PURCHASE',
        amount: tokens,
        description: `Purchased ${pack.packId} pack (${tokens} tokens)`,
        relatedId: sessionId,
        status: 'COMPLETED',
        createdAt: now,
      });
    });

    console.log(`[stripe/webhook] Credited ${tokens} tokens to ${userId} (session ${sessionId})`);
    return NextResponse.json({ received: true, success: true });
  } catch (err) {
    console.error('[stripe/webhook] Transaction failed:', err);
    return NextResponse.json({ error: 'Failed to process purchase' }, { status: 500 });
  }
}

