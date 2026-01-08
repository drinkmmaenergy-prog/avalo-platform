/**
 * Secret Manager Integration
 * Provides secure access to secrets stored in Google Cloud Secret Manager
 * with in-memory caching for performance
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
;

// Initialize Secret Manager client
const secretManagerClient = new SecretManagerServiceClient();

// Get project ID from environment or Firebase config
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'avalo-c8c46';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const secretCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Get a secret from Google Secret Manager with caching
 * @param secretName - Name of the secret in Secret Manager
 * @returns The secret value as a string
 * @throws Error if secret cannot be retrieved
 */
export async function getSecret(secretName: string): Promise<string> {
  // Check cache first
  const cached = secretCache.get(secretName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;

    logger.info(`Fetching secret: ${secretName}`);
    const [version] = await secretManagerClient.accessSecretVersion({ name });

    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error(`Secret ${secretName} is empty or invalid`);
    }

    // Cache the secret
    secretCache.set(secretName, {
      value: payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    logger.info(`Successfully retrieved and cached secret: ${secretName}`);
    return payload;
  } catch (error: any) {
    logger.error(`Failed to retrieve secret ${secretName}:`, error);
    throw new Error(`Failed to retrieve secret ${secretName}: ${error.message}`);
  }
}

/**
 * Clear the secret cache (useful for testing or forced refresh)
 */
export function clearSecretCache(): void {
  secretCache.clear();
  logger.info('Secret cache cleared');
}

/**
 * Get cache statistics (for monitoring/debugging)
 */
export function getCacheStats(): { size: number; secrets: string[] } {
  return {
    size: secretCache.size,
    secrets: Array.from(secretCache.keys()),
  };
}

// =============================================================================
// SPECIFIC SECRET GETTERS
// =============================================================================

// Lazy-loaded secret values
let _stripeSecretKey: string | null = null;
let _stripeWebhookSecret: string | null = null;
let _hmacSecret: string | null = null;
let _openaiApiKey: string | null = null;
let _anthropicApiKey: string | null = null;
let _sendgridApiKey: string | null = null;

/**
 * Get Stripe Secret Key
 */
export async function getStripeSecretKey(): Promise<string> {
  if (!_stripeSecretKey) {
    _stripeSecretKey = await getSecret('stripe-secret-key');
  }
  return _stripeSecretKey;
}

/**
 * Get Stripe Webhook Secret
 */
export async function getStripeWebhookSecret(): Promise<string> {
  if (!_stripeWebhookSecret) {
    _stripeWebhookSecret = await getSecret('stripe-webhook-secret');
  }
  return _stripeWebhookSecret;
}

/**
 * Get HMAC Secret
 */
export async function getHmacSecret(): Promise<string> {
  if (!_hmacSecret) {
    _hmacSecret = await getSecret('hmac-secret');
  }
  return _hmacSecret;
}

/**
 * Get OpenAI API Key
 */
export async function getOpenAIApiKey(): Promise<string> {
  if (!_openaiApiKey) {
    _openaiApiKey = await getSecret('openai-api-key');
  }
  return _openaiApiKey;
}

/**
 * Get Anthropic API Key
 */
export async function getAnthropicApiKey(): Promise<string> {
  if (!_anthropicApiKey) {
    _anthropicApiKey = await getSecret('anthropic-api-key');
  }
  return _anthropicApiKey;
}

/**
 * Get SendGrid API Key
 */
export async function getSendGridApiKey(): Promise<string> {
  if (!_sendgridApiKey) {
    _sendgridApiKey = await getSecret('sendgrid-api-key');
  }
  return _sendgridApiKey;
}

/**
 * Fallback to environment variables for local development
 * In production, this should always use Secret Manager
 */
export async function getSecretWithFallback(
  secretName: string,
  envVarName: string
): Promise<string> {
  // In production, always use Secret Manager
  if (process.env.NODE_ENV === 'production') {
    return getSecret(secretName);
  }

  // In development, try Secret Manager first, then fall back to env
  try {
    return await getSecret(secretName);
  } catch (error) {
    logger.warn(
      `Failed to get secret ${secretName} from Secret Manager, falling back to env var ${envVarName}`
    );
    const envValue = process.env[envVarName];
    if (!envValue) {
      throw new Error(
        `Secret ${secretName} not found in Secret Manager and ${envVarName} not set in environment`
      );
    }
    return envValue;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getSecret,
  clearSecretCache,
  getCacheStats,
  getStripeSecretKey,
  getStripeWebhookSecret,
  getHmacSecret,
  getOpenAIApiKey,
  getAnthropicApiKey,
  getSendGridApiKey,
  getSecretWithFallback,
};

