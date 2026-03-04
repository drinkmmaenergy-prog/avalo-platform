/**
 * Token Purchase API — Client-side helpers for Stripe checkout.
 *
 * Calls /api/stripe/checkout to create a Stripe session,
 * then redirects the user to Stripe Checkout.
 *
 * INVARIANTS:
 *   - No pricing overrides.
 *   - Backend verifies auth independently.
 */

import { auth } from '@/lib/firebase';

interface CreateCheckoutParams {
  packageId: string;
  userId?: string;
  source?: 'web' | 'app';
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Create a Stripe checkout session via the /api/stripe/checkout endpoint.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
  try {
    const idToken = await auth.currentUser?.getIdToken();

    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      checkoutUrl: data.url || data.checkoutUrl,
      sessionId: data.sessionId,
    };
  } catch (error) {
    console.error('[tokens] createCheckoutSession error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    };
  }
}

/**
 * Redirect the browser to Stripe Checkout.
 */
export function redirectToCheckout(url: string): void {
  window.location.href = url;
}
