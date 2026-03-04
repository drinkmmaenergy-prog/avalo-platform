"use client";

/**
 * PHASE 3.3 — Web Token Purchase Service
 * 
 * Thin client consuming the SAME checkout session function as mobile.
 * NO discounts, NO coupons, NO overrides.
 * 
 * Backend functions consumed:
 * - tokens_createCheckoutSession (from pack288-web-stripe.ts)
 * 
 * INVARIANTS ENFORCED BY BACKEND:
 * - NO_DISCOUNTS: Rejects sessions with coupons/promotions
 * - NO_FREE_TOKENS: Minimum amount validation
 * - CANONICAL_TOKEN_PACKS: Fixed pricing, no overrides
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
// TOKEN PACK DISPLAY
// ============================================================================

/**
 * Get available token packs for display.
 * Returns canonical packs — NO modifications allowed.
 */
export function getAvailableTokenPacks(): CanonicalTokenPack[] {
  return Object.values(CANONICAL_TOKEN_PACKS);
}

/**
 * Get a specific token pack by ID.
 */
export function getTokenPackById(packId: string): CanonicalTokenPack | null {
  return CANONICAL_TOKEN_PACKS[packId.toUpperCase()] || null;
}

/**
 * Format price for display based on currency.
 * Display-only — backend handles actual pricing.
 */
export function formatPackPrice(pack: CanonicalTokenPack, currency: 'USD' | 'EUR' | 'PLN' | 'GBP' = 'USD'): string {
  switch (currency) {
    case 'USD':
      return `$${(pack.priceUSD / 100).toFixed(2)}`;
    case 'EUR':
      return `€${(pack.priceEUR / 100).toFixed(2)}`;
    case 'PLN':
      return `${(pack.pricePLN / 100).toFixed(2)} PLN`;
    case 'GBP':
      return `£${(pack.priceGBP / 100).toFixed(2)}`;
    default:
      return `$${(pack.priceUSD / 100).toFixed(2)}`;
  }
}

// ============================================================================
// STRIPE CHECKOUT SESSION
// ============================================================================

/**
 * Create Stripe checkout session for token purchase.
 * Uses the SAME backend function as mobile — no web-specific logic.
 * 
 * Backend enforces:
 * - Age verification (18+)
 * - Monthly purchase limits
 * - NO discounts allowed
 */
export async function createTokenCheckoutSession(
  request: CheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
    
  // Validate pack exists in canonical list
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
    
    // Default URLs if not provided
    const successUrl = request.successUrl || `${window.location.origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = request.cancelUrl || `${window.location.origin}/wallet`;
    
    const result = await createCheckoutSession({
      packageId: pack.packId.toLowerCase(), // Backend expects lowercase
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
    
    // Map error codes to user-friendly messages
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
 * Simple wrapper — NO payment processing in web.
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
 * NO business logic — just orchestrates the checkout.
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

