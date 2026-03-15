/**
 * Token Purchase API — Client-side helpers for Stripe checkout.
 *
 * Active runtime path:
 * - Firebase callable `tokens_createCheckoutSession` (backend canonical)
 *
 * INVARIANTS:
 *   - No pricing authority in app-web.
 *   - App-web sends pack identifiers only; backend validates canonical price.
 */

import { requireFunctions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

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

interface CanonicalCheckoutPayload {
  packageId: string;
  packId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe checkout session via backend canonical callable.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
  try {
    const normalizedPackId = params.packageId.trim().toLowerCase();

    const create = httpsCallable<
      CanonicalCheckoutPayload,
      { success: boolean; checkoutUrl?: string; sessionId?: string; error?: string }
    >(requireFunctions(), 'tokens_createCheckoutSession');

    const result = await create({
      packageId: normalizedPackId,
      packId: normalizedPackId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });

    return {
      success: !!result.data.success,
      checkoutUrl: result.data.checkoutUrl,
      sessionId: result.data.sessionId,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error('[tokens] createCheckoutSession error:', error);

    let errorMessage = 'Failed to create checkout session';
    if (error?.code === 'unauthenticated') {
      errorMessage = 'Please sign in to purchase tokens';
    } else if (error?.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Redirect the browser to Stripe Checkout.
 */
export function redirectToCheckout(url: string): void {
  window.location.href = url;
}

// ============================================================================
// POST-CHECKOUT FULFILLMENT & VERIFICATION
// ============================================================================

interface FulfillResult {
  success: boolean;
  fulfilled?: boolean;
  error?: string;
  paymentStatus?: string;
  purchase?: {
    tokens: number;
    packageId: string;
    status: string;
  };
}

/**
 * Fulfill a Stripe checkout session on-demand.
 *
 * Called by the success page after redirect. Retrieves the session from
 * Stripe server-side and runs the idempotent fulfillment logic to credit
 * tokens. Safe to call multiple times.
 */
export async function fulfillCheckout(sessionId: string): Promise<FulfillResult> {
  try {
    const fulfill = httpsCallable<
      { sessionId: string },
      FulfillResult
    >(requireFunctions(), 'tokens_fulfillCheckout');

    const result = await fulfill({ sessionId });
    return result.data;
  } catch (error: any) {
    console.error('[tokens] fulfillCheckout error:', error);
    return {
      success: false,
      error: error?.message || 'Failed to fulfill purchase',
    };
  }
}

interface PurchaseBySessionResult {
  success: boolean;
  error?: string;
  purchase?: Record<string, any>;
}

/**
 * Look up a purchase record by Stripe session ID.
 * Returns { success: false } if the purchase has not been processed yet.
 */
export async function getPurchaseBySession(sessionId: string): Promise<PurchaseBySessionResult> {
  try {
    const lookup = httpsCallable<
      { sessionId: string },
      PurchaseBySessionResult
    >(requireFunctions(), 'tokens_getPurchaseBySession');

    const result = await lookup({ sessionId });
    return result.data;
  } catch (error: any) {
    console.error('[tokens] getPurchaseBySession error:', error);
    return {
      success: false,
      error: error?.message || 'Failed to look up purchase',
    };
  }
}
