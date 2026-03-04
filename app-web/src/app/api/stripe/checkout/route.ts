/**
 * POST /api/stripe/checkout
 *
 * Server-side Stripe Checkout Session creation.
 *
 * INVARIANTS:
 * - Client sends packId only — NEVER amounts.
 * - Server validates packId against CANONICAL_TOKEN_PACKS.
 * - Price is set server-side from the canonical pack.
 * - Firebase ID token verified for authenticated users.
 *
 * Request body:
 *   { packId: string, source?: 'web'|'app', userId?: string, successUrl: string, cancelUrl: string }
 *
 * Response:
 *   { success: true, checkoutUrl: string, sessionId: string }
 *   { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import stripe from '@/lib/stripe-server';
import { adminAuth } from '@/lib/firebase-admin';
import { CANONICAL_TOKEN_PACKS } from '@/types/phase33.types';

export const dynamic = 'force-dynamic';

/** Map currency keys to Stripe currency codes. */
const STRIPE_CURRENCY_MAP: Record<string, string> = {
  USD: 'usd',
  EUR: 'eur',
  PLN: 'pln',
  GBP: 'gbp',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId, source, userId, successUrl, cancelUrl } = body;

    // ── Validate packId ──────────────────────────────────────────────
    if (!packId || typeof packId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'packId is required.' },
        { status: 400 },
      );
    }

    const pack = CANONICAL_TOKEN_PACKS[packId.toUpperCase()];
    if (!pack) {
      return NextResponse.json(
        { success: false, error: `Invalid packId: ${packId}` },
        { status: 400 },
      );
    }

    // ── Validate URLs ────────────────────────────────────────────────
    if (!successUrl || !cancelUrl) {
      return NextResponse.json(
        { success: false, error: 'successUrl and cancelUrl are required.' },
        { status: 400 },
      );
    }

    // ── Authenticate user ────────────────────────────────────────────
    let authenticatedUid: string | undefined;
    const authHeader = request.headers.get('Authorization');

    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.slice(7);
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        authenticatedUid = decoded.uid;
      } catch (err) {
        console.error('[stripe/checkout] Invalid ID token:', err);
        return NextResponse.json(
          { success: false, error: 'Invalid authentication token.' },
          { status: 401 },
        );
      }
    }

    // For direct web access, require auth. For app source, userId is passed through.
    const effectiveUid = authenticatedUid || (source === 'app' ? userId : undefined);

    if (!effectiveUid) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    // ── Create Stripe Checkout Session ───────────────────────────────
    // Default to USD. Currency selection could be extended later.
    const currency = 'usd';
    const priceInCents = pack.priceUSD;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Avalo ${pack.packId} Token Pack`,
              description: `${pack.tokens.toLocaleString()} tokens`,
              metadata: {
                packId: pack.packId,
                tokens: String(pack.tokens),
              },
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: effectiveUid,
        packId: pack.packId,
        tokens: String(pack.tokens),
        source: source || 'web',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: effectiveUid,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[stripe/checkout] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

