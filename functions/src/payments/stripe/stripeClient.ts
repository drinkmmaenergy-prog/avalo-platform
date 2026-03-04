/**
 * PACK PHASE 3.1 + 4.1 — Centralized Stripe Client
 *
 * CANONICAL RULES:
 * - Single Stripe instance per process (lazy init)
 * - Webhook secret MUST be present for webhook endpoints (fail-fast)
 * - Non-webhook endpoints can operate without webhook secret
 * - No silent failures in production
 *
 * PACK 4.1 PRODUCTION HARDENING:
 * - HARD FAIL if sk_test_* key is used in production
 * - Explicit guard against test keys in prod
 *
 * @module payments/stripe/stripeClient
 */

import Stripe from 'stripe';
import { logger } from '../../runtime';

// Environment detection
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PRODUCTION = NODE_ENV === 'production' && !IS_EMULATOR;

// Lazy-loaded instances
let stripeInstance: Stripe | null = null;
let stripeSecretKey: string | null = null;
let stripeWebhookSecret: string | null = null;

/**
 * PACK 4.1 PRODUCTION GUARD: Assert that test keys are not used in production
 * @throws Error if sk_test_* key detected in production
 */
function assertNoTestKeyInProduction(key: string): void {
  if (IS_PRODUCTION && key.startsWith('sk_test_')) {
    logger.error('[stripeClient] CRITICAL SECURITY VIOLATION: Test Stripe key in production', {
      keyPrefix: key.substring(0, 12) + '...',
      environment: NODE_ENV,
    });
    throw new Error(
      '[PRODUCTION_VIOLATION] Stripe test key (sk_test_*) detected in production environment. ' +
      'This is a critical security violation. Use a live key (sk_live_*) in production.'
    );
  }
}

/**
 * Load Stripe secret key from environment.
 * Checks multiple sources for compatibility.
 *
 * PACK 4.1: Validates key is not a test key in production
 */
function loadStripeSecretKey(): string {
  if (stripeSecretKey !== null) {
    return stripeSecretKey;
  }

  // Priority: explicit env > firebase config
  const key = process.env.STRIPE_SECRET_KEY || '';

  if (!key) {
    logger.error('[stripeClient] STRIPE_SECRET_KEY not configured');
  } else {
    // PACK 4.1: Guard against test keys in production
    assertNoTestKeyInProduction(key);
  }

  stripeSecretKey = key;
  return key;
}

/**
 * Load Stripe webhook secret from environment.
 * Required for webhook signature verification.
 */
function loadStripeWebhookSecret(): string {
  if (stripeWebhookSecret !== null) {
    return stripeWebhookSecret;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!secret) {
    console.warn('[stripeClient] STRIPE_WEBHOOK_SECRET not configured - webhook verification disabled');
  }

  stripeWebhookSecret = secret;
  return secret;
}

/**
 * Get Stripe client instance.
 *
 * In emulator mode without key: returns null and logs warning.
 * In production without key: throws Error (fail-fast).
 *
 * @returns Stripe instance or null (emulator only)
 * @throws Error if in production without API key
 */
export function getStripe(): Stripe | null {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secretKey = loadStripeSecretKey();

  if (!secretKey) {
    if (IS_EMULATOR) {
      console.warn('[stripeClient] Stripe disabled in emulator (no STRIPE_SECRET_KEY)');
      return null;
    }
    throw new Error('[stripeClient] STRIPE_SECRET_KEY is required in production');
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia' as any, // Latest stable API version
    typescript: true,
    telemetry: false, // Disable telemetry in production
  });

  console.log('[stripeClient] Stripe client initialized');
  return stripeInstance;
}

/**
 * Get Stripe client for non-webhook operations.
 *
 * More lenient than requireStripeForWebhook - allows operations
 * where webhook secret isn't needed.
 *
 * @returns Stripe instance
 * @throws Error if Stripe cannot be initialized
 */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('[stripeClient] Stripe is not available');
  }
  return stripe;
}

/**
 * Get Stripe client specifically for webhook processing.
 *
 * STRICT: Fails if webhook secret is missing.
 * This prevents fake webhook events from crediting tokens.
 *
 * @returns Object with stripe instance and webhook secret
 * @throws Error if either key or webhook secret is missing
 */
export function requireStripeForWebhook(): { stripe: Stripe; webhookSecret: string } {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('[stripeClient] Stripe is not available - cannot process webhooks');
  }

  const webhookSecret = loadStripeWebhookSecret();
  if (!webhookSecret) {
    // CRITICAL: Never allow webhook processing without signature verification
    throw new Error('[stripeClient] STRIPE_WEBHOOK_SECRET is required for webhook processing');
  }

  return { stripe, webhookSecret };
}

/**
 * Get just the webhook secret (for existing code paths).
 *
 * @returns Webhook secret string
 * @throws Error if webhook secret is not configured
 */
export function getWebhookSecret(): string {
  const secret = loadStripeWebhookSecret();
  if (!secret) {
    throw new Error('[stripeClient] STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

/**
 * Check if Stripe is available (for conditional logic).
 *
 * @returns true if Stripe can be initialized, false otherwise
 */
export function isStripeAvailable(): boolean {
  const key = loadStripeSecretKey();
  return !!key;
}

/**
 * Check if webhook processing is available.
 *
 * @returns true if both API key and webhook secret are configured
 */
export function isWebhookAvailable(): boolean {
  const key = loadStripeSecretKey();
  const secret = loadStripeWebhookSecret();
  return !!key && !!secret;
}

// Re-export Stripe types for convenience
export { Stripe };









