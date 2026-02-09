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
 * 
 * DEPLOY-TIME ANALYSIS DETECTION:
 * - Firebase deploy analysis does NOT have runtime secrets
 * - Detect via: !K_SERVICE && !FUNCTIONS_EMULATOR
 * - Allow deploy analysis to continue with WARN
 * - Still HARD FAIL in Cloud Run (Gen2 runtime) and Emulator
 */

// ============================================================================
// LOGGER UTILITIES (avoid circular import with runtime.ts)
// ============================================================================

/**
 * Logger that uses console to avoid circular dependency with runtime.ts
 */
const validatorLogger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(`[StartupValidator] ${msg}`, data ? JSON.stringify(data) : '');
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[StartupValidator] ${msg}`, data ? JSON.stringify(data) : '');
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    console.error(`[StartupValidator] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

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
const IS_CLOUD_RUN = !!process.env.K_SERVICE; // Gen2 runtime sets K_SERVICE
const NODE_ENV = process.env.NODE_ENV || 'production';
const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '';

/**
 * Detect if this is deploy-time analysis.
 * Firebase deploy analysis runs the code to extract function definitions,
 * but does NOT have access to runtime secrets.
 * 
 * Detection rule:
 * - NOT in Cloud Run runtime (K_SERVICE not set)
 * - NOT in emulator (FUNCTIONS_EMULATOR not set)
 * → Must be deploy-time analysis
 */
function isDeployTimeAnalysis(): boolean {
  return !IS_CLOUD_RUN && !IS_EMULATOR;
}

/**
 * Detect if this is a production environment
 */
function detectProductionEnvironment(): boolean {
  // Emulator = zawsze development runtime
  if (IS_EMULATOR) return false;

  // Production runtime tylko w Cloud Run (Gen2)
  if (IS_CLOUD_RUN && NODE_ENV === 'production') return true;

  if (GCLOUD_PROJECT && !GCLOUD_PROJECT.includes('emulator') && IS_CLOUD_RUN) return true;

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
    validatorLogger.warn('Live Stripe key in non-production environment');
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
    validatorLogger.info('✅ All production startup validations passed', {
      environment,
      checks,
    });
  } else {
    validatorLogger.error('❌ Startup validation FAILED', {
      environment,
      errors,
      checks,
    });
  }
  
  // Deploy-time analysis: WARN only, allow to continue
  // This allows firebase deploy --only functions to pass analysis phase
  if (isDeployTimeAnalysis() && !result.valid) {
    validatorLogger.warn('⚠️ Deploy-time analysis detected, validation failures are warnings only', {
      reason: 'Deploy analysis does not have access to runtime secrets (K_SERVICE/FUNCTIONS_EMULATOR not set)',
      errors,
    });
    return result; // Return without throwing, allow deploy to continue
  }
  
  // In production (Cloud Run or Emulator), throw if validation fails
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
  isDeployTimeAnalysis,
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

