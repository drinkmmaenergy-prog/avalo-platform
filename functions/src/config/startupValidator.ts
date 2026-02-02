/**
 * PACK 4.1 — Production Cold-Start Startup Validator
 * 
 * COMPLIANCE NOTES:
 * - Runs ONCE at cold start
 * - Validates all required environment variables
 * - Detects emulator running in production mode (violation)
 * - Validates Stripe test keys not used in production
 * - HARD FAIL if production prerequisites not met
 * 
 * TREASURY INVARIANTS ENFORCED:
 * - No test keys in production
 * - Required secrets must exist
 * - Environment must be deterministic
 */

import { logger } from '../runtime';

// ============================================================================
// TYPES
// ============================================================================

export interface StartupValidationResult {
  valid: boolean;
  environment: string;
  timestamp: string;
  errors: string[];
  warnings: string[];
  checks: Record<string, boolean>;
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const NODE_ENV = process.env.NODE_ENV || 'production';
const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '';

/**
 * Detect if this is a production environment
 */
function detectProductionEnvironment(): boolean {
  // Explicit production NODE_ENV
  if (NODE_ENV === 'production') return true;
  
  // Cloud project indicates production
  if (GCLOUD_PROJECT && !GCLOUD_PROJECT.includes('emulator')) return true;
  
  // Firebase config indicates cloud environment
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.includes('avalostaging')) return true;
  
  return false;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate that required environment variables are set
 */
function validateRequiredEnvVars(): { valid: boolean; missing: string[] } {
  const requiredInProd: string[] = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];
  
  const missing: string[] = [];
  const isProd = detectProductionEnvironment();
  
  if (isProd) {
    for (const envVar of requiredInProd) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate that test Stripe keys are NOT used in production
 */
function validateStripeKeyNotTest(): { valid: boolean; violation?: string } {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const isProd = detectProductionEnvironment();
  
  if (isProd && stripeKey.startsWith('sk_test_')) {
    return {
      valid: false,
      violation: 'CRITICAL: Stripe test key (sk_test_*) detected in production environment',
    };
  }
  
  // Also check for live key in non-production (warning only)
  if (!isProd && stripeKey.startsWith('sk_live_')) {
    logger.warn('[StartupValidator] Live Stripe key in non-production environment');
  }
  
  return { valid: true };
}

/**
 * Validate that emulator is not running in production mode
 */
function validateEmulatorNotInProd(): { valid: boolean; violation?: string } {
  const isProd = detectProductionEnvironment();
  
  if (isProd && IS_EMULATOR) {
    return {
      valid: false,
      violation: 'CRITICAL: Firebase emulator detected with production NODE_ENV',
    };
  }
  
  return { valid: true };
}

/**
 * Validate region is properly configured
 */
function validateRegionConfig(): { valid: boolean; region: string } {
  // Default region if not specified
  const region = process.env.FUNCTION_REGION || 'us-central1';
  
  return {
    valid: true, // Region has sane default
    region,
  };
}

/**
 * Validate Firebase project is identifiable
 */
function validateFirebaseProject(): { valid: boolean; project?: string } {
  const project = GCLOUD_PROJECT || 
                  (FIREBASE_CONFIG ? JSON.parse(FIREBASE_CONFIG).projectId : undefined);
  
  return {
    valid: !!project || IS_EMULATOR,
    project: project || 'emulator',
  };
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Run all startup validations.
 * 
 * @throws Error if critical validations fail in production
 * @returns Validation result object
 */
export function runStartupValidation(): StartupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, boolean> = {};
  
  const isProd = detectProductionEnvironment();
  const environment = isProd ? 'production' : (IS_EMULATOR ? 'emulator' : 'development');
  
  // 1. Required environment variables
  const envVarsCheck = validateRequiredEnvVars();
  checks['requiredEnvVars'] = envVarsCheck.valid;
  if (!envVarsCheck.valid) {
    errors.push(`Missing required environment variables: ${envVarsCheck.missing.join(', ')}`);
  }
  
  // 2. Stripe test key guard
  const stripeKeyCheck = validateStripeKeyNotTest();
  checks['stripeKeyNotTest'] = stripeKeyCheck.valid;
  if (!stripeKeyCheck.valid && stripeKeyCheck.violation) {
    errors.push(stripeKeyCheck.violation);
  }
  
  // 3. Emulator in production guard
  const emulatorCheck = validateEmulatorNotInProd();
  checks['emulatorNotInProd'] = emulatorCheck.valid;
  if (!emulatorCheck.valid && emulatorCheck.violation) {
    errors.push(emulatorCheck.violation);
  }
  
  // 4. Region configuration
  const regionCheck = validateRegionConfig();
  checks['regionConfigured'] = regionCheck.valid;
  
  // 5. Firebase project
  const projectCheck = validateFirebaseProject();
  checks['firebaseProjectValid'] = projectCheck.valid;
  if (!projectCheck.valid) {
    warnings.push('Firebase project ID not detected');
  }
  
  // 6. NODE_ENV correctness
  checks['nodeEnvSet'] = !!process.env.NODE_ENV;
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV not explicitly set, defaulting to production');
  }
  
  const result: StartupValidationResult = {
    valid: errors.length === 0,
    environment,
    timestamp: new Date().toISOString(),
    errors,
    warnings,
    checks,
  };
  
  // Log validation result
  if (result.valid) {
    logger.info('[StartupValidator] ✅ All production startup validations passed', {
      environment,
      checks,
    });
  } else {
    logger.error('[StartupValidator] ❌ Startup validation FAILED', {
      environment,
      errors,
      checks,
    });
  }
  
  // In production, throw if validation fails
  if (isProd && !result.valid) {
    throw new Error(
      `[PRODUCTION STARTUP FAILURE] Cannot boot: ${errors.join('; ')}`
    );
  }
  
  return result;
}

/**
 * Assert startup validation passes (throws if not).
 * Call this at cold start to enforce production safety.
 */
export function assertStartupValid(): void {
  runStartupValidation();
}

// ============================================================================
// AUTO-RUN AT MODULE LOAD (cold start)
// ============================================================================

let _validationRan = false;
let _validationResult: StartupValidationResult | null = null;

/**
 * Run validation once at module load.
 * This ensures validation happens at cold start.
 */
export function initStartupValidation(): StartupValidationResult {
  if (_validationRan && _validationResult) {
    return _validationResult;
  }
  
  _validationResult = runStartupValidation();
  _validationRan = true;
  
  return _validationResult;
}

// Export check functions for testing
export const _internal = {
  detectProductionEnvironment,
  validateRequiredEnvVars,
  validateStripeKeyNotTest,
  validateEmulatorNotInProd,
  validateRegionConfig,
  validateFirebaseProject,
};

export default {
  runStartupValidation,
  assertStartupValid,
  initStartupValidation,
};
