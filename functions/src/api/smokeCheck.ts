/**
 * Smoke Check Endpoint — Minimal Gen2 Boot Verification
 *
 * Verifies:
 * 1. Cloud Run container boots successfully
 * 2. Secrets are injected (present in process.env)
 * 3. StartupValidator passed
 *
 * Does NOT log secret values.
 */

import { onRequest } from '../runtime';
import { stripeSecretKey, stripeWebhookSecret } from '../runtime';

/**
 * GET /smokeCheck
 *
 * Returns 200 if the container booted successfully and secrets are present.
 * Returns 503 if any required secret is missing.
 */
export const smokeCheck = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const isCloudRun = !!process.env.K_SERVICE;

    const hasStripeSecretKey = !!process.env.STRIPE_SECRET_KEY;
    const hasStripeWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;

    const allSecretsPresent = hasStripeSecretKey && hasStripeWebhookSecret;

    // Parse projectId from FIREBASE_CONFIG or GCLOUD_PROJECT
    let projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
    if (!projectId && process.env.FIREBASE_CONFIG) {
      try {
        projectId = JSON.parse(process.env.FIREBASE_CONFIG).projectId || '';
      } catch {
        projectId = '';
      }
    }

    const result = {
      status: allSecretsPresent ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: isCloudRun ? 'cloud_run' : isEmulator ? 'emulator' : 'local',
      hasStripeSecretKey,
      hasStripeWebhookSecret,
      secretsPresent: {
        STRIPE_SECRET_KEY: hasStripeSecretKey,
        STRIPE_WEBHOOK_SECRET: hasStripeWebhookSecret,
      },
      nodeEnv: process.env.NODE_ENV || 'production',
      projectId,
      region: process.env.FUNCTION_REGION || 'europe-west1',
      runtime: {
        nodeVersion: process.version,
        region: process.env.FUNCTION_REGION || 'europe-west1',
        uptime: process.uptime(),
      },
    };

    res.status(allSecretsPresent ? 200 : 503).json(result);
  },
);









