/**
 * PACK PHASE 3.1 — Stripe Payment Module Index
 *
 * Centralizes all Stripe-related exports for clean imports.
 *
 * @module payments/stripe
 */

// Re-export Stripe client utilities
export {
  getStripe,
  requireStripe,
  requireStripeForWebhook,
  getWebhookSecret,
  isStripeAvailable,
  isWebhookAvailable,
  Stripe,
} from './stripeClient';

// Re-export webhook handler and utilities
export {
  stripeWebhookV1,
  CANONICAL_TOKEN_PACKS,
  assertNoDiscounts,
  validateCanonicalPricing,
} from './webhook';

// Re-export types
export type {
  CanonicalTokenPack,
} from './webhook';
