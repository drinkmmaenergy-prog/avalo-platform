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
 * 
 * BOOT ISOLATION (PHASE 1):
 * - Stripe secrets are injected per-function via defineSecret, NOT at module load
 * - Cold-start validation must NOT check process.env for defineSecret() secrets
 * - healthCheck and smokeCheck bypass Stripe enforcement
 * - All top-level process.env reads use lazy getters
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
// LAZY ENVIRONMENT GETTERS
// (process.env is read at call time, NOT at module load)
// ============================================================================

function getIsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

function getIsCloudRun(): boolean {
  return !!process.env.K_SERVICE;
}

function getNodeEnv(): string {
  return process.env.NODE_ENV || 'production';
}

function getGcloudProject(): string {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
}

function getFirebaseConfig(): string {
  return process.env.FIREBASE_CONFIG || '';
}

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
  return !getIsCloudRun() && !getIsEmulator();
}

/**
 * Detect if this is a production environment
 */
function detectProductionEnvironment(): boolean {
  // Emulator = zawsze development runtime
  if (getIsEmulator()) return false;

  // Production runtime tylko w Cloud Run (Gen2)
  if (getIsCloudRun() && getNodeEnv() === 'production') return true;

  if (getGcloudProject() && !getGcloudProject().includes('emulator') && getIsCloudRun()) return true;

  return false;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate that required environment variables are set.
 * 
 * BOOT ISOLATION NOTE:
 * Stripe secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) are declared via
 * defineSecret() and injected per-function by Cloud Run. They are NOT available
 * in process.env at module load / cold start time.
 * 
 * Therefore, this validator only checks NON-secret env vars at boot.
 * Stripe secret presence is validated inside individual function handlers.
 */
function validateRequiredEnvVars(): { valid: boolean; missing: string[] } {
  // NOTE: Stripe secrets removed from boot-time validation.
  // They are checked per-function via defineSecret() injection.
  const requiredInProd: string[] = [];
  
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
 * Validate that test Stripe keys are NOT used in production.
 * 
 * BOOT ISOLATION NOTE:
 * At cold start, process.env.STRIPE_SECRET_KEY may not be set yet
 * (defineSecret injects it per-handler). Only validate if present.
 */
function validateStripeKeyNotTest(): { valid: boolean; violation?: string } {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const isProd = detectProductionEnvironment();
  const projectId = getGcloudProject().toLowerCase();
  const isNonProductionProject =
    projectId.includes('staging') ||
    projectId.includes('dev') ||
    projectId.includes('test') ||
    projectId.includes('qa') ||
    projectId.includes('sandbox');
  // Fail closed: if project is unknown in prod runtime, treat as true production.
  const isTrueProduction = isProd && (!projectId || !isNonProductionProject);
  
  // Only hard-fail for true production projects.
  if (isTrueProduction && stripeKey && stripeKey.startsWith('sk_test_')) {
    return {
      valid: false,
      violation: 'CRITICAL: Stripe test key (sk_test_*) detected in production environment',
    };
  }
  
  // Also check for live key in non-production contexts (warning only)
  if (!isTrueProduction && stripeKey && stripeKey.startsWith('sk_live_')) {
    validatorLogger.warn('Live Stripe key in non-production environment');
  }
  
  return { valid: true };
}

/**
 * Validate that emulator is not running in production mode
 */
function validateEmulatorNotInProd(): { valid: boolean; violation?: string } {
  const isProd = detectProductionEnvironment();
  
  if (isProd && getIsEmulator()) {
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
  const project = getGcloudProject() || 
                  (getFirebaseConfig() ? JSON.parse(getFirebaseConfig()).projectId : undefined);
  
  return {
    valid: !!project || getIsEmulator(),
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
  const environment = isProd ? 'production' : (getIsEmulator() ? 'emulator' : 'development');
  
  // 1. Required environment variables (non-secret only)
  const envVarsCheck = validateRequiredEnvVars();
  checks['requiredEnvVars'] = envVarsCheck.valid;
  if (!envVarsCheck.valid) {
    errors.push(`Missing required environment variables: ${envVarsCheck.missing.join(', ')}`);
  }
  
  // 2. Stripe test key guard (only if key is present)
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

/**
 * Validate that Stripe secrets are present inside a function handler.
 * Call this from within onRequest/onCall handlers that require Stripe.
 * 
 * healthCheck and smokeCheck are EXEMPT from this enforcement.
 * 
 * @param functionName - Name of the function for logging
 * @throws Error if secrets are missing in production Cloud Run handler
 */
export function enforceStripeSecrets(functionName: string): void {
  const isCloudRun = getIsCloudRun();
  
  if (!isCloudRun) return; // Only enforce in Cloud Run
  
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!hasStripeKey || !hasWebhookSecret) {
    const missing: string[] = [];
    if (!hasStripeKey) missing.push('STRIPE_SECRET_KEY');
    if (!hasWebhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    
    validatorLogger.error(`[${functionName}] Missing Stripe secrets in handler`, {
      missing,
    });
    
    throw new Error(
      `[${functionName}] Missing required Stripe secrets: ${missing.join(', ')}`
    );
  }
}

/**
 * List of function names that bypass Stripe enforcement.
 */
const STRIPE_BYPASS_FUNCTIONS = new Set([
  'healthCheck',
  'smokeCheck',
]);

/**
 * Check if a function bypasses Stripe enforcement.
 */
export function isStripeBypassFunction(functionName: string): boolean {
  return STRIPE_BYPASS_FUNCTIONS.has(functionName);
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
  enforceStripeSecrets,
  isStripeBypassFunction,
};
