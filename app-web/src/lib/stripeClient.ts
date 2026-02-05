/**
 * PHASE 5.1 — Stripe Client Configuration
 * 
 * Client-side Stripe setup for redirect-only checkout flow.
 * NO payment processing on client — only redirect to Stripe Checkout.
 * 
 * HARD RULES:
 * - Web DOES NOT calculate prices
 * - Web DOES NOT mutate wallets
 * - Web ONLY redirects to Stripe Checkout (URL from backend)
 * 
 * @version v1.0
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';

/**
 * Stripe instance promise — lazy loaded.
 * Uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from environment.
 */
let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Get the Stripe instance.
 * Returns null if the publishable key is not configured.
 */
export function getStripe(): Promise<Stripe | null> {
  if (stripePromise === null) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      console.warn('[StripeClient] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured');
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(publishableKey);
    }
  }
  
  return stripePromise as Promise<Stripe | null>;
}

/**
 * Redirect to Stripe Checkout using the checkout URL from backend.
 * This is the ONLY payment action web performs.
 * 
 * @param checkoutUrl - URL received from tokens_createCheckoutSession
 */
export function redirectToStripeCheckout(checkoutUrl: string): void {
  if (typeof window !== 'undefined' && checkoutUrl) {
    window.location.href = checkoutUrl;
  }
}

/**
 * Check if Stripe is configured.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export default getStripe;
