// Pack 416 - Feature Flags Config
export interface FeatureFlag {
  id?: string;
  name?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  targetUsers?: string[];
  targetSegments?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface FeatureFlagConfig {
  flags?: Record<string, FeatureFlag>;
  defaultEnabled?: boolean;
  [key: string]: any;
}

export function getFeatureFlag(flagId: string): FeatureFlag | undefined {
  return undefined;
}

export function isFeatureEnabled(
  flagIdOrConfig: string | FeatureFlagConfig,
  userIdOrContext?: string | FeatureFlagUserContext
): boolean {
  // Handle both forms:
  // 1. (flagId: string, userId?: string)
  // 2. (config: FeatureFlagConfig, userContext: FeatureFlagUserContext)
  if (typeof flagIdOrConfig === 'string') {
    // Simple flag check
    return false;
  }
  // Config-based check
  const config = flagIdOrConfig;
  return config.defaultEnabled ?? false;
}

export const DEFAULT_FLAGS: Record<string, boolean> = {};


// Additional exports for pack416-feature-guard.ts and pack416-audit-integration.ts
export type FeatureFlagKey = string;

export interface FeatureFlagChangeEvent {
  flagId?: string;
  previousValue?: boolean;
  newValue?: boolean;
  changedBy?: any;
  timestamp?: any;
  reason?: string;
  flagKey?: string;
  before?: any;
  after?: any;
  changedAt?: any;
  ipAddress?: string;
  deviceInfo?: string;
  params?: Record<string, any>;
  rollout?: any;
  enabled?: any;
  [key: string]: any;
}

export interface FeatureFlagUserContext {
  userId?: string;
  segments?: string[];
  attributes?: Record<string, any>;
  rolloutBucket?: number;
  country?: string;
  isVip?: boolean;
  isRoyal?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
  [key: string]: any;
}

export function calculateRolloutBucket(userId: string, flagId?: string): number {
  // Simple hash-based bucket calculation
  let hash = 0;
  const str = userId + (flagId || '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash % 100);
}

export const SAFE_DEFAULTS: Record<string, boolean> = {
  PAYMENTS_ENABLED: true,
  MODERATION_ENABLED: true,
  SAFETY_FEATURES: true,
};

export const CRITICAL_FEATURES: string[] = [
  'PAYMENTS_ENABLED',
  'MODERATION_ENABLED',
  'SAFETY_FEATURES',
  'AUTH_REQUIRED',
];









