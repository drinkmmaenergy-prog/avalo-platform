/**
 * PACK 416 — Feature Flags Configuration Types (Web Local)
 * Local web-only feature flags types and defaults
 */

// All feature flag keys
export type FeatureFlagKey =
  | 'v2_feed_algorithm'
  | 'v2_matching_engine'
  | 'ai_companions_beta'
  | 'call_quality_v3'
  | 'realtime_presence_v2'
  | 'creator_analytics_v2'
  | 'payout_express'
  | 'subscription_tiers_v3'
  | 'new_onboarding_flow'
  | 'dark_mode_v2'
  | 'push_notifications_v2'
  | 'video_transcoding_v2'
  | 'crypto_payments'
  | 'nft_marketplace'
  | 'live_streaming_v2';

// Feature flag configuration shape
export interface FeatureFlagConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout: number; // 0-100 percentage
  allowlist?: string[]; // User IDs always enabled
  blocklist?: string[]; // User IDs always disabled
  countries?: string[]; // ISO country codes
  platforms?: ('web' | 'ios' | 'android')[];
  minAppVersion?: string;
  startDate?: string;
  endDate?: string;
  metadata?: Record<string, unknown>;
}

// User context for feature flag evaluation
export interface FeatureFlagUserContext {
  userId?: string;
  rolloutBucket?: number;
  country?: string;
  platform?: 'web' | 'ios' | 'android';
  appVersion?: string;
  isVip?: boolean;
  isRoyal?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
}

// Safe defaults when flags can't be loaded
export const SAFE_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  v2_feed_algorithm: false,
  v2_matching_engine: false,
  ai_companions_beta: false,
  call_quality_v3: false,
  realtime_presence_v2: false,
  creator_analytics_v2: false,
  payout_express: false,
  subscription_tiers_v3: false,
  new_onboarding_flow: false,
  dark_mode_v2: true, // Safe to enable by default
  push_notifications_v2: false,
  video_transcoding_v2: false,
  crypto_payments: false,
  nft_marketplace: false,
  live_streaming_v2: false,
};

/**
 * Calculate rollout bucket for a user
 * Creates a stable hash based on userId + flagKey
 */
export function calculateRolloutBucket(userId: string, flagKey: string): number {
  // Simple hash function for deterministic bucket assignment
  const combined = `${userId}-${flagKey}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 100;
}

/**
 * Check if a feature is enabled for the given context
 */
export function isFeatureEnabled(
  config: FeatureFlagConfig,
  context: FeatureFlagUserContext
): boolean {
  // Global kill switch
  if (!config.enabled) {
    return false;
  }

  // Check blocklist first
  if (context.userId && config.blocklist?.includes(context.userId)) {
    return false;
  }

  // Check allowlist
  if (context.userId && config.allowlist?.includes(context.userId)) {
    return true;
  }

  // Check country restrictions
  if (config.countries && config.countries.length > 0) {
    if (!context.country || !config.countries.includes(context.country)) {
      return false;
    }
  }

  // Check platform restrictions
  if (config.platforms && config.platforms.length > 0) {
    if (!context.platform || !config.platforms.includes(context.platform)) {
      return false;
    }
  }

  // Check date range
  const now = new Date();
  if (config.startDate) {
    const startDate = new Date(config.startDate);
    if (now < startDate) {
      return false;
    }
  }
  if (config.endDate) {
    const endDate = new Date(config.endDate);
    if (now > endDate) {
      return false;
    }
  }

  // Check rollout percentage
  if (config.rollout < 100) {
    const bucket = context.rolloutBucket ?? Math.floor(Math.random() * 100);
    if (bucket >= config.rollout) {
      return false;
    }
  }

  return true;
}

