/**
 * PACK 99 — Integration Examples
 * Examples of how to integrate feature flags and remote config with existing systems
 */

import {
  getFeatureFlagValue,
  getRemoteConfigValue,
  buildContextFromUser,
} from './pack99-featureConfig';
import { FeatureContext } from './pack99-types';

// ============================================================================
// DISCOVERY ENGINE V2 INTEGRATION (PACK 94)
// ============================================================================

/**
 * Example: Get discovery ranking weights from remote config
 * These weights control the ranking algorithm but don't affect tokenomics
 */
export async function getDiscoveryRankingWeights(
  userId: string
): Promise<{
  profileCompleteness: number;
  engagement: number;
  monetization: number;
  riskPenalty: number;
}> {
  const context = await buildContextFromUser(userId);

  return {
    profileCompleteness: await getRemoteConfigValue<number>(
      'discovery_weight_profileCompleteness',
      context
    ) || 1.0,
    engagement: await getRemoteConfigValue<number>(
      'discovery_weight_engagement',
      context
    ) || 1.5,
    monetization: await getRemoteConfigValue<number>(
      'discovery_weight_monetization',
      context
    ) || 0.8,
    riskPenalty: await getRemoteConfigValue<number>(
      'discovery_weight_riskPenalty',
      context
    ) || 2.0,
  };
}

/**
 * Example: Check if should use discovery v2 algorithm
 */
export async function shouldUseDiscoveryV2(userId: string): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  const enabled = await getFeatureFlagValue('discovery_v2_enabled', context);
  return enabled === true;
}

/**
 * Example: Get max results per page for discovery
 */
export async function getDiscoveryMaxResults(userId: string): Promise<number> {
  const context = await buildContextFromUser(userId);
  return await getRemoteConfigValue<number>(
    'discovery_maxResultsPerPage',
    context
  ) || 20;
}

// ============================================================================
// ONBOARDING INTEGRATION (PACK 98)
// ============================================================================

/**
 * Example: Get onboarding flow variant
 */
export async function getOnboardingVariant(
  userId: string
): Promise<'v1' | 'v2' | 'v3'> {
  const context = await buildContextFromUser(userId);
  
  // Check if new onboarding is enabled
  const newOnboardingEnabled = await getFeatureFlagValue(
    'new_onboarding_flow',
    context
  );
  
  if (!newOnboardingEnabled) {
    return 'v1'; // Legacy onboarding
  }
  
  // Get specific version from remote config
  const version = await getRemoteConfigValue<string>(
    'onboarding_steps_version',
    context
  );
  
  return (version as 'v1' | 'v2' | 'v3') || 'v2';
}

/**
 * Example: Get onboarding step configuration
 */
export async function getOnboardingSteps(
  userId: string
): Promise<string[]> {
  const variant = await getOnboardingVariant(userId);
  
  // Different step sequences based on variant
  const stepConfigs = {
    v1: ['profile', 'photos', 'preferences', 'verification'],
    v2: ['welcome', 'profile', 'photos', 'preferences', 'missions', 'verification'],
    v3: ['welcome', 'quick-profile', 'interests', 'photos', 'verification', 'missions'],
  };
  
  return stepConfigs[variant];
}

// ============================================================================
// HELP CENTER INTEGRATION (PACK 98)
// ============================================================================

/**
 * Example: Check if contextual help is enabled
 */
export async function isContextualHelpEnabled(userId: string): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  return await getFeatureFlagValue('contextual_help_experiment', context) === true;
}

/**
 * Example: Get help center entry points configuration
 */
export async function getHelpCenterEntryPoints(
  userId: string
): Promise<string[]> {
  const context = await buildContextFromUser(userId);
  
  const config = await getRemoteConfigValue<string[]>(
    'help_center_entry_points',
    context
  );
  
  return config || ['settings', 'profile', 'chat'];
}

// ============================================================================
// SECURITY / 2FA INTEGRATION (PACK 96)
// ============================================================================

/**
 * Example: Get strong auth window duration
 * Controls how long a 2FA challenge remains valid
 */
export async function getStrongAuthWindowMinutes(userId: string): Promise<number> {
  const context = await buildContextFromUser(userId);
  
  return await getRemoteConfigValue<number>(
    'stepUpStrongAuthWindowMinutes',
    context
  ) || 30;
}

/**
 * Example: Check if should show 2FA recommendation banner
 */
export async function shouldShow2FABanner(userId: string): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  
  const enabled = await getFeatureFlagValue('2fa_recommended_banner', context);
  return enabled === true;
}

// ============================================================================
// NOTIFICATIONS INTEGRATION (PACK 92)
// ============================================================================

/**
 * Example: Check if notification batching is enabled
 */
export async function isNotificationBatchingEnabled(
  userId: string
): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  
  return await getRemoteConfigValue<boolean>(
    'notifications_batching_enabled',
    context
  ) || false;
}

/**
 * Example: Get notification experiment variant
 */
export async function getNotificationVariant(
  userId: string
): Promise<'control' | 'variantA' | 'variantB'> {
  const context = await buildContextFromUser(userId);
  
  const variant = await getRemoteConfigValue<string>(
    'notifications_experiments_variant',
    context
  );
  
  return (variant as any) || 'control';
}

// ============================================================================
// SAFETY & NSFW INTEGRATION (PACK 91)
// ============================================================================

/**
 * Example: Get NSFW filter mode for discovery
 * Note: Must still respect regional legal constraints
 */
export async function getNSFWFilterMode(
  userId: string
): Promise<'strict' | 'base' | 'off'> {
  const context = await buildContextFromUser(userId);
  
  const mode = await getRemoteConfigValue<string>(
    'nsfw_discovery_filter_mode',
    context
  );
  
  return (mode as 'strict' | 'base' | 'off') || 'base';
}

/**
 * Example: Check if should show safety tips
 */
export async function getSafetyTipsVariant(
  userId: string
): Promise<'none' | 'basic' | 'enhanced'> {
  const context = await buildContextFromUser(userId);
  
  const variant = await getFeatureFlagValue('safety_tips_variant', context);
  
  if (typeof variant === 'string') {
    return variant as 'none' | 'basic' | 'enhanced';
  }
  
  return 'basic';
}

// ============================================================================
// ANALYTICS UI INTEGRATION
// ============================================================================

/**
 * Example: Check if advanced analytics UI is enabled
 */
export async function isAdvancedAnalyticsEnabled(
  userId: string
): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  
  return await getFeatureFlagValue('advanced_analytics_ui', context) === true;
}

// ============================================================================
// VERIFICATION PROMPT INTEGRATION
// ============================================================================

/**
 * Example: Check if should show profile verification prompt
 */
export async function shouldShowVerificationPrompt(
  userId: string
): Promise<boolean> {
  const context = await buildContextFromUser(userId);
  
  return await getFeatureFlagValue('profile_verification_prompt', context) === true;
}

// ============================================================================
// CONTEXT-AWARE INTEGRATION HELPER
// ============================================================================

/**
 * Example: Build context with custom overrides for testing
 */
export function buildTestContext(overrides: Partial<FeatureContext>): FeatureContext {
  return {
    userId: overrides.userId || 'test_user',
    countryCode: overrides.countryCode || 'US',
    platform: overrides.platform || 'ios',
    appVersion: overrides.appVersion || '1.0.0',
    enforcementLevel: overrides.enforcementLevel || 'NONE',
    trustScore: overrides.trustScore || 100,
  };
}

// ============================================================================
// BATCH FETCH HELPER
// ============================================================================

/**
 * Example: Fetch multiple configs at once for a specific feature
 */
export async function getDiscoveryFeatureBundle(userId: string): Promise<{
  useV2: boolean;
  weights: any;
  maxResults: number;
  nsfwMode: string;
}> {
  const context = await buildContextFromUser(userId);
  
  const [useV2, weights, maxResults, nsfwMode] = await Promise.all([
    getFeatureFlagValue('discovery_v2_enabled', context),
    getDiscoveryRankingWeights(userId),
    getDiscoveryMaxResults(userId),
    getNSFWFilterMode(userId),
  ]);
  
  return {
    useV2: useV2 === true,
    weights,
    maxResults,
    nsfwMode,
  };
}

/**
 * Example: Fetch all onboarding-related configs
 */
export async function getOnboardingFeatureBundle(userId: string): Promise<{
  variant: string;
  steps: string[];
  showHelp: boolean;
}> {
  const [variant, steps, showHelp] = await Promise.all([
    getOnboardingVariant(userId),
    getOnboardingSteps(userId),
    isContextualHelpEnabled(userId),
  ]);
  
  return {
    variant,
    steps,
    showHelp,
  };
}