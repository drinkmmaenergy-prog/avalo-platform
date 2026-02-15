/**
 * Token Purchase API — Client-side helpers for Stripe checkout.
 *
 * Creates checkout sessions via the /api/stripe/checkout route
 * and redirects to Stripe's hosted payment page.
 */

import { loadStripe } from '@stripe/stripe-js';
import { getAuth } from 'firebase/auth';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
);

interface CreateCheckoutParams {
  packageId: string;
  userId?: string;
  source?: 'web' | 'app';
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe Checkout session for a token pack purchase.
 *
 * Accepts either a plain packId string (backward-compat) or an object
 * with full params.  The API route expects the field name `packId`.
 */
export async function createCheckoutSession(
  paramsOrPackageId: string | CreateCheckoutParams,
): Promise<{
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}> {
  // Normalize to object form
  const params: CreateCheckoutParams =
    typeof paramsOrPackageId === 'string'
      ? {
          packageId: paramsOrPackageId,
          successUrl: `${window.location.origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/wallet/buy`,
        }
      : paramsOrPackageId;

  // Build auth header when a Firebase user is signed in
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const currentUser = getAuth().currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch {
    // Not signed in — continue without auth header (backend will reject if required)
  }

  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // API route reads `packId`, NOT `packageId`
      packId: params.packageId,
      source: params.source ?? 'web',
      userId: params.userId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
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
 *
 * Accepts either a Stripe session ID (for stripe.redirectToCheckout)
 * or a full checkout URL (for direct window redirect).
 */
export async function redirectToCheckout(sessionIdOrUrl: string): Promise<void> {
  // If it looks like a URL, redirect directly (Stripe Checkout URLs)
  if (sessionIdOrUrl.startsWith('http')) {
    window.location.href = sessionIdOrUrl;
    return;
  }

  // Otherwise treat as a Stripe session ID
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Stripe not loaded');
  }

  const { error } = await stripe.redirectToCheckout({ sessionId: sessionIdOrUrl });
  if (error) {
    throw new Error(error.message ?? 'Stripe redirect failed');
  }
}
