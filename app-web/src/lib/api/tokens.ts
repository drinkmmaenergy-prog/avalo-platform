/**
 * Token Purchase API — Client-side helpers for Stripe checkout.
 *
 * Creates checkout sessions via the /api/stripe/checkout route
 * and redirects to Stripe's hosted payment page.
 */

import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
);

/**
 * Create a Stripe Checkout session for a token pack purchase.
 */
export async function createCheckoutSession(packageId: string): Promise<{
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}> {
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId,
      successUrl: `${window.location.origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}/wallet/buy`,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    return { success: false, error: errorData.error ?? 'Failed to create checkout session' };
  }

  const data = await response.json();
  return {
    success: true,
    checkoutUrl: data.checkoutUrl,
    sessionId: data.sessionId,
  };
}

/**
 * Redirect to Stripe Checkout.
 */
export async function redirectToCheckout(sessionId: string): Promise<void> {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Stripe not loaded');
  }

  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    throw new Error(error.message ?? 'Stripe redirect failed');
  }
}
