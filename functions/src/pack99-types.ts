/**
 * PACK 99 — Feature Flags & Remote Config Types
 * Region- & Segment-Aware Feature Control
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// FEATURE FLAG TYPES
// ============================================================================

export type FeatureFlagType = 'BOOLEAN' | 'MULTIVARIANT';

export type SafeScope =
  | 'UX'
  | 'DISCOVERY_WEIGHTS'
  | 'SAFETY_UI'
  | 'ONBOARDING'
  | 'NOTIFICATIONS'
  | 'HELP_CENTER'
  | 'SECURITY_UI'
  | 'ANALYTICS'
  | 'EXPERIMENTAL';

export type EnforcementLevel =
  | 'NONE'
  | 'SOFT_LIMIT'
  | 'HARD_LIMIT'
  | 'SUSPENDED';

export type PlatformType = 'android' | 'ios' | 'web';

export interface TargetingRule {
  id: string;
  priority: number;
  segmentName?: string;
  conditions: {
    countries?: string[];
    platforms?: PlatformType[];
    minAppVersion?: string;
    maxAppVersion?: string;
    enforcementLevels?: EnforcementLevel[];
    trustScoreMax?: number;
    trustScoreMin?: number;
    rolloutPercent?: number;
  };
  variant: string;
}

export interface FeatureFlag {
  id: string;
  description: string;
  type: FeatureFlagType;
  variants: Record<string, any>;
  defaultVariant: string;
  rules: TargetingRule[];
  safeScope: SafeScope[];
  updatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// REMOTE CONFIG TYPES
// ============================================================================

export type RemoteConfigType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'JSON';

export interface RemoteConfigParam {
  id: string;
  description: string;
  type: RemoteConfigType;
  defaultValue: any;
  rules: TargetingRule[];
  safeScope: SafeScope[];
  updatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// EVALUATION CONTEXT
// ============================================================================

export interface FeatureContext {
  userId?: string;
  countryCode?: string;
  platform?: PlatformType;
  appVersion?: string;
  enforcementLevel?: EnforcementLevel;
  trustScore?: number;
}

export interface ClientFeatureContext {
  countryCode?: string;
  platform: PlatformType;
  appVersion: string;
}

// ============================================================================
// FEATURE EXPOSURE EVENTS
// ============================================================================

export interface FeatureExposureEvent {
  id: string;
  userId: string;
  featureKey: string;
  variant: string;
  context: {
    country?: string;
    platform?: string;
    appVersion?: string;
  };
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// CLIENT BUNDLE
// ============================================================================

export interface ClientFeatureConfigBundle {
  flags: Record<string, any>;
  params: Record<string, any>;
  fetchedAt: number;
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

export interface CreateFeatureFlagInput {
  id: string;
  description: string;
  type: FeatureFlagType;
  variants: Record<string, any>;
  defaultVariant: string;
  rules?: TargetingRule[];
  safeScope: SafeScope[];
}

export interface UpdateFeatureFlagInput {
  description?: string;
  variants?: Record<string, any>;
  defaultVariant?: string;
  rules?: TargetingRule[];
  safeScope?: SafeScope[];
}

export interface CreateRemoteConfigParamInput {
  id: string;
  description: string;
  type: RemoteConfigType;
  defaultValue: any;
  rules?: TargetingRule[];
  safeScope: SafeScope[];
}

export interface UpdateRemoteConfigParamInput {
  description?: string;
  defaultValue?: any;
  rules?: TargetingRule[];
  safeScope?: SafeScope[];
}