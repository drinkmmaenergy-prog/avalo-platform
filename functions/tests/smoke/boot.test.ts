/// <reference types="jest" />

/**
 * Smoke Test — Boot Verification
 *
 * Tests critical boot components individually rather than
 * importing the full index.ts (which has 2934 functions and
 * ESM-only dependencies like uuid v13 that break Jest).
 *
 * Verifies:
 * - startupValidator runs without throwing (emulator mode)
 * - Stripe config is accessible
 * - init.ts (Firebase Admin) initializes
 * - runtime.ts loads with setGlobalOptions
 */

describe('Functions Boot Smoke Test', () => {
  test('startupValidator runs in emulator mode without throwing', () => {
    const { initStartupValidation } = require('../../lib/config/startupValidator');
    const result = initStartupValidation();

    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
    expect(result.environment).toBe('emulator');
    expect(result.errors).toHaveLength(0);
  });

  test('startupValidator detects non-production environment', () => {
    const { _internal } = require('../../lib/config/startupValidator');

    // In test env, FUNCTIONS_EMULATOR is 'true', so not deploy-time
    const isDeployTime = _internal.isDeployTimeAnalysis();
    expect(isDeployTime).toBe(false);

    const isProd = _internal.detectProductionEnvironment();
    expect(isProd).toBe(false);
  });

  test('startupValidator validates env vars pass in emulator', () => {
    const { _internal } = require('../../lib/config/startupValidator');
    const result = _internal.validateRequiredEnvVars();
    // In emulator, no env vars are required
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('Stripe config getter returns expected shape', () => {
    const { getStripeConfig } = require('../../lib/config');
    const config = getStripeConfig();

    expect(config).toBeDefined();
    expect(typeof config.secretKey).toBe('string');
    expect(typeof config.webhookSecret).toBe('string');
    expect(typeof config.publishableKey).toBe('string');
  });

  test('FUNCTIONS_REGION constant is europe-west1', () => {
    const { FUNCTIONS_REGION } = require('../../lib/config');
    expect(FUNCTIONS_REGION).toBe('europe-west1');
  });

  test('Firebase Admin initializes successfully', () => {
    const init = require('../../lib/init');
    expect(init.db).toBeDefined();
    expect(init.auth).toBeDefined();
    expect(init.storage).toBeDefined();
    expect(init.admin).toBeDefined();
    expect(init.generateId).toBeDefined();
    expect(typeof init.generateId()).toBe('string');
  });

  test('Runtime module loads with exports', () => {
    const runtime = require('../../lib/runtime');
    expect(runtime.onCall).toBeDefined();
    expect(runtime.onRequest).toBeDefined();
    expect(runtime.HttpsError).toBeDefined();
    expect(runtime.onSchedule).toBeDefined();
    expect(runtime.logger).toBeDefined();
    expect(runtime.db).toBeDefined();
  });

  test('economyConfig exports canonical token payout', () => {
    const { TOKEN_PAYOUT_USD, TOKEN_PAYOUT_PLN } = require('../../lib/config/economyConfig');
    expect(TOKEN_PAYOUT_USD).toBe(0.03);
    expect(typeof TOKEN_PAYOUT_PLN).toBe('number');
    expect(TOKEN_PAYOUT_PLN).toBeGreaterThan(0);
  });
});
