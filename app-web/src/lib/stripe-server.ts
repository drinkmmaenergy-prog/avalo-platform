/**
 * Stripe Server SDK — Server-side only.
 *
 * Used in API routes for creating checkout sessions and handling webhooks.
 * IMPORTANT: This file must NEVER be imported from client components.
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16',
  typescript: true,
});

export default stripe;
