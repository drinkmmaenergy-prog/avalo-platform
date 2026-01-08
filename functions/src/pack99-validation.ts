/**
 * PACK 99 — Validation Layer
 * Strict validation to prevent tokenomics manipulation via feature flags/config
 */

import * as logger from 'firebase-functions/logger';
import { SafeScope } from './pack99-types';

// ============================================================================
// FORBIDDEN KEYWORDS
// ============================================================================

/**
 * Keywords that indicate tokenomics-related configs
 * These must NEVER appear in feature flag or remote config IDs
 */
const FORBIDDEN_KEYWORDS = [
  'token_price',
  'price_per_token',
  'token_cost',
  'revenue_split',
  'revenue_share',
  'creator_split',
  'platform_split',
  'free_tokens',
  'bonus_tokens',
  'token_bonus',
  'discount',
  'promo_code',
  'cashback',
  'token_gift',
  'token_grant',
  'price_override',
  'cost_override',
  'split_override',
  'token_multiplier',
  'price_multiplier',
];

/**
 * Forbidden scopes - these don't exist and should never be used
 */
const FORBIDDEN_SCOPES: string[] = [
  'TOKENOMICS',
  'PRICING',
  'REVENUE_SPLIT',
  'MONETARY',
  'PAYMENTS',
];

// ============================================================================
// KEY VALIDATION
// ============================================================================

/**
 * Validate feature flag or remote config key
 * Ensures key doesn't contain tokenomics-related terms
 */
export function validateConfigKey(key: string): { valid: boolean; error?: string } {
  // Convert to lowercase for case-insensitive matching
  const lowerKey = key.toLowerCase();

  // Check for forbidden keywords
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (lowerKey.includes(keyword)) {
      return {
        valid: false,
        error: `Config key contains forbidden keyword: "${keyword}". Tokenomics parameters must remain hard-coded.`,
      };
    }
  }

  // Check key format (alphanumeric, underscores, hyphens only)
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return {
      valid: false,
      error: 'Config key must contain only alphanumeric characters, underscores, and hyphens.',
    };
  }

  // Check length
  if (key.length < 3 || key.length > 100) {
    return {
      valid: false,
      error: 'Config key must be between 3 and 100 characters.',
    };
  }

  return { valid: true };
}

// ============================================================================
// DESCRIPTION VALIDATION
// ============================================================================

/**
 * Validate description to ensure it doesn't describe tokenomics changes
 */
export function validateDescription(description: string): { valid: boolean; error?: string } {
  const lowerDescription = description.toLowerCase();

  // Check for suspicious phrases
  const suspiciousPhrases = [
    'change token price',
    'modify price',
    'adjust revenue',
    'change split',
    'free tokens',
    'bonus tokens',
    'discount tokens',
    'override price',
    'override split',
  ];

  for (const phrase of suspiciousPhrases) {
    if (lowerDescription.includes(phrase)) {
      return {
        valid: false,
        error: `Description suggests tokenomics modification: "${phrase}". This is not allowed.`,
      };
    }
  }

  // Check length
  if (description.length > 500) {
    return {
      valid: false,
      error: 'Description must be 500 characters or less.',
    };
  }

  return { valid: true };
}

// ============================================================================
// SCOPE VALIDATION
// ============================================================================

/**
 * Validate safe scopes
 * Ensures no forbidden scopes are used
 */
export function validateSafeScopes(scopes: SafeScope[]): { valid: boolean; error?: string } {
  if (!scopes || scopes.length === 0) {
    return {
      valid: false,
      error: 'At least one safe scope is required.',
    };
  }

  // Check for forbidden scopes
  for (const scope of scopes) {
    if (FORBIDDEN_SCOPES.includes(scope as string)) {
      return {
        valid: false,
        error: `Forbidden scope detected: "${scope}". Tokenomics cannot be controlled via feature flags.`,
      };
    }
  }

  // Valid scopes list
  const validScopes: SafeScope[] = [
    'UX',
    'DISCOVERY_WEIGHTS',
    'SAFETY_UI',
    'ONBOARDING',
    'NOTIFICATIONS',
    'HELP_CENTER',
    'SECURITY_UI',
    'ANALYTICS',
    'EXPERIMENTAL',
  ];

  // Ensure all provided scopes are valid
  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      return {
        valid: false,
        error: `Invalid scope: "${scope}". Must be one of: ${validScopes.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// VALUE VALIDATION
// ============================================================================

/**
 * Validate config value to ensure it doesn't contain tokenomics data
 */
export function validateConfigValue(value: any): { valid: boolean; error?: string } {
  // Check if value is an object with suspicious keys
  if (typeof value === 'object' && value !== null) {
    const valueStr = JSON.stringify(value).toLowerCase();

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (valueStr.includes(keyword)) {
        return {
          valid: false,
          error: `Config value contains forbidden keyword: "${keyword}". Tokenomics parameters must remain hard-coded.`,
        };
      }
    }
  }

  // Check if value is a string with suspicious content
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase();

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (lowerValue.includes(keyword)) {
        return {
          valid: false,
          error: `Config value contains forbidden keyword: "${keyword}".`,
        };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// VARIANTS VALIDATION
// ============================================================================

/**
 * Validate feature flag variants
 */
export function validateVariants(
  variants: Record<string, any>
): { valid: boolean; error?: string } {
  if (!variants || Object.keys(variants).length === 0) {
    return {
      valid: false,
      error: 'At least one variant is required.',
    };
  }

  // Check each variant
  for (const [variantKey, variantValue] of Object.entries(variants)) {
    // Validate variant key
    const keyValidation = validateConfigKey(variantKey);
    if (!keyValidation.valid) {
      return {
        valid: false,
        error: `Invalid variant key "${variantKey}": ${keyValidation.error}`,
      };
    }

    // Validate variant value
    const valueValidation = validateConfigValue(variantValue);
    if (!valueValidation.valid) {
      return {
        valid: false,
        error: `Invalid variant value for "${variantKey}": ${valueValidation.error}`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// TARGETING RULES VALIDATION
// ============================================================================

/**
 * Validate targeting rules
 */
export function validateTargetingRules(
  rules: any[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(rules)) {
    return {
      valid: false,
      error: 'Rules must be an array.',
    };
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    if (!rule.id || typeof rule.id !== 'string') {
      return {
        valid: false,
        error: `Rule ${i}: id is required and must be a string.`,
      };
    }

    if (typeof rule.priority !== 'number') {
      return {
        valid: false,
        error: `Rule ${i}: priority must be a number.`,
      };
    }

    if (!rule.variant || typeof rule.variant !== 'string') {
      return {
        valid: false,
        error: `Rule ${i}: variant is required and must be a string.`,
      };
    }

    if (!rule.conditions || typeof rule.conditions !== 'object') {
      return {
        valid: false,
        error: `Rule ${i}: conditions object is required.`,
      };
    }

    // Validate rolloutPercent if present
    if (rule.conditions.rolloutPercent !== undefined) {
      const percent = rule.conditions.rolloutPercent;
      if (typeof percent !== 'number' || percent < 0 || percent > 100) {
        return {
          valid: false,
          error: `Rule ${i}: rolloutPercent must be a number between 0 and 100.`,
        };
      }
    }

    // Validate trustScore ranges if present
    if (rule.conditions.trustScoreMin !== undefined) {
      if (typeof rule.conditions.trustScoreMin !== 'number') {
        return {
          valid: false,
          error: `Rule ${i}: trustScoreMin must be a number.`,
        };
      }
    }

    if (rule.conditions.trustScoreMax !== undefined) {
      if (typeof rule.conditions.trustScoreMax !== 'number') {
        return {
          valid: false,
          error: `Rule ${i}: trustScoreMax must be a number.`,
        };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// COMPREHENSIVE VALIDATION
// ============================================================================

/**
 * Validate complete feature flag input
 */
export function validateFeatureFlagInput(input: {
  id: string;
  description: string;
  variants: Record<string, any>;
  safeScope: SafeScope[];
  rules?: any[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate key
  const keyValidation = validateConfigKey(input.id);
  if (!keyValidation.valid) {
    errors.push(keyValidation.error!);
  }

  // Validate description
  const descValidation = validateDescription(input.description);
  if (!descValidation.valid) {
    errors.push(descValidation.error!);
  }

  // Validate scopes
  const scopeValidation = validateSafeScopes(input.safeScope);
  if (!scopeValidation.valid) {
    errors.push(scopeValidation.error!);
  }

  // Validate variants
  const variantValidation = validateVariants(input.variants);
  if (!variantValidation.valid) {
    errors.push(variantValidation.error!);
  }

  // Validate rules if present
  if (input.rules && input.rules.length > 0) {
    const rulesValidation = validateTargetingRules(input.rules);
    if (!rulesValidation.valid) {
      errors.push(rulesValidation.error!);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate complete remote config param input
 */
export function validateRemoteConfigParamInput(input: {
  id: string;
  description: string;
  defaultValue: any;
  safeScope: SafeScope[];
  rules?: any[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate key
  const keyValidation = validateConfigKey(input.id);
  if (!keyValidation.valid) {
    errors.push(keyValidation.error!);
  }

  // Validate description
  const descValidation = validateDescription(input.description);
  if (!descValidation.valid) {
    errors.push(descValidation.error!);
  }

  // Validate scopes
  const scopeValidation = validateSafeScopes(input.safeScope);
  if (!scopeValidation.valid) {
    errors.push(scopeValidation.error!);
  }

  // Validate default value
  const valueValidation = validateConfigValue(input.defaultValue);
  if (!valueValidation.valid) {
    errors.push(valueValidation.error!);
  }

  // Validate rules if present
  if (input.rules && input.rules.length > 0) {
    const rulesValidation = validateTargetingRules(input.rules);
    if (!rulesValidation.valid) {
      errors.push(rulesValidation.error!);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log validation failure
 */
export function logValidationFailure(
  type: 'feature_flag' | 'remote_config',
  key: string,
  errors: string[],
  adminId?: string
): void {
  logger.warn(`Validation failed for ${type}: ${key}`, {
    key,
    errors,
    adminId,
    timestamp: new Date().toISOString(),
  });
}