/**
 * Stripe Server SDK — Server-side only (API routes).
 *
 * INVARIANTS:
 *   - NEVER import from client components.
 *   - STRIPE_SECRET_KEY must be set in env.
 *   - If missing, throws a clear error at import time.
 */

import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    '[stripe-server] STRIPE_SECRET_KEY is not set. ' +
    'Add it to .env.local for local development or set it in your deployment environment.'
  );
}

const stripe = new Stripe(secretKey, {
  apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
  typescript: true,
});

export default stripe;
