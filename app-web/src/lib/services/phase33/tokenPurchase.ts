"use client";

/**
 * PHASE 3.3 — Web Token Purchase Service
 *
 * Backend-authoritative model:
 * - Checkout session is created by backend callable `tokens_createCheckoutSession`.
 * - Pricing authority is backend runtime (functions), not app-web constants.
 * - Local pack data in phase33.types.ts is display/compatibility only.
 */

import { requireFunctions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import type {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  CanonicalTokenPack,
} from '../../../types/phase33.types';
import { CANONICAL_TOKEN_PACKS } from '../../../types/phase33.types';

// ============================================================================
// TOKEN PACK DISPLAY (COMPATIBILITY LAYER)
// ============================================================================

/**
 * Get available token packs for display.
 * Display-only compatibility data; backend remains pricing authority.
 */
export function getAvailableTokenPacks(): CanonicalTokenPack[] {
  return Object.values(CANONICAL_TOKEN_PACKS);
}

/**
 * Get a specific token pack by ID.
 * Compatibility lookup only (UI/selection guard).
 */
export function getTokenPackById(packId: string): CanonicalTokenPack | null {
  return CANONICAL_TOKEN_PACKS[packId.toUpperCase()] || null;
}

/**
 * Format price for display based on currency.
 * Falls back to USD when non-USD display fields are unavailable.
 */
export function formatPackPrice(pack: CanonicalTokenPack, currency: 'USD' | 'EUR' | 'PLN' | 'GBP' = 'USD'): string {
  const usd = `$${(pack.priceUSD / 100).toFixed(2)}`;

  switch (currency) {
    case 'USD':
      return usd;
    case 'EUR':
      return pack.priceEUR != null ? `€${(pack.priceEUR / 100).toFixed(2)}` : usd;
    case 'PLN':
      return pack.pricePLN != null ? `${(pack.pricePLN / 100).toFixed(2)} PLN` : usd;
    case 'GBP':
      return pack.priceGBP != null ? `£${(pack.priceGBP / 100).toFixed(2)}` : usd;
    default:
      return usd;
  }
}

// ============================================================================
// STRIPE CHECKOUT SESSION (BACKEND-CANONICAL)
// ============================================================================

/**
 * Create Stripe checkout session for token purchase.
 * Delegates to backend canonical callable.
 */
export async function createTokenCheckoutSession(
  request: CheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
  const pack = getTokenPackById(request.packageId);
  if (!pack) {
    return {
      success: false,
      error: `Invalid package ID: ${request.packageId}`,
    };
  }

  try {
    const createCheckoutSession = httpsCallable<
      CheckoutSessionRequest,
      { success: boolean; checkoutUrl?: string; sessionId?: string; error?: string }
    >(requireFunctions(), 'tokens_createCheckoutSession');

    const successUrl = request.successUrl || `${window.location.origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = request.cancelUrl || `${window.location.origin}/wallet`;
    const normalizedPackId = pack.packId.toLowerCase();

    const result = await createCheckoutSession({
      packageId: normalizedPackId,
      packId: normalizedPackId,
      successUrl,
      cancelUrl,
    });

    return {
      success: result.data.success,
      checkoutUrl: result.data.checkoutUrl,
      sessionId: result.data.sessionId,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error('[TokenPurchase] Error creating checkout session:', error);

    let errorMessage = 'Failed to create checkout session';
    if (error.code === 'unauthenticated') {
      errorMessage = 'Please sign in to purchase tokens';
    } else if (error.code === 'failed-precondition') {
      errorMessage = error.message || 'Please verify your age (18+) before purchasing';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Redirect user to Stripe checkout.
 */
export function redirectToCheckout(checkoutUrl: string): void {
  if (typeof window !== 'undefined') {
    window.location.href = checkoutUrl;
  }
}

// ============================================================================
// PURCHASE FLOW HELPERS
// ============================================================================

/**
 * Complete purchase flow: create session and redirect.
 */
export async function initiatePurchase(
  packageId: string,
  options?: {
    onError?: (error: string) => void;
    onSuccess?: (sessionId: string) => void;
  }
): Promise<void> {
  const response = await createTokenCheckoutSession({ packageId });

  if (!response.success) {
    options?.onError?.(response.error || 'Purchase failed');
    return;
  }

  if (response.sessionId) {
    options?.onSuccess?.(response.sessionId);
  }

  if (response.checkoutUrl) {
    redirectToCheckout(response.checkoutUrl);
  }
}
