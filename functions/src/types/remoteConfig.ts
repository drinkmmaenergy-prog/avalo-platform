/**
 * PACK 67 — Remote Config, Feature Flags & Experimentation Types
 * Central configuration and experimentation layer types
 */

import * as admin from 'firebase-admin';

export type PlatformType = 'android' | 'ios' | 'web';
export type EnvironmentType = 'GLOBAL' | 'PROD' | 'STAGE';

/**
 * Feature flag configuration with rollout rules
 */
export interface FeatureConfig {
  enabled: boolean;
  rollout?: {
    percentage?: number; // 0-100
    countries?: string[] | null;
    platforms?: PlatformType[] | null;
  };
}

/**
 * Experiment configuration with weighted variants
 */
export interface ExperimentConfig {
  active: boolean;
  description?: string;
  variants: {
    [variantKey: string]: {
      weight: number; // relative weight for assignment
    };
  };
  rollout?: {
    percentage?: number; // 0-100
    countries?: string[] | null;
    platforms?: PlatformType[] | null;
  };
}

/**
 * Typed configuration values (non-pricing)
 */
export type ConfigValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'json'; value: any };

/**
 * Remote config document structure
 */
export interface RemoteConfigDocument {
  configId: string;
  environment: EnvironmentType;
  features: {
    [key: string]: FeatureConfig;
  };
  experiments: {
    [experimentKey: string]: ExperimentConfig;
  };
  values: {
    [key: string]: ConfigValue;
  };
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Experiment assignment log
 */
export interface ExperimentAssignment {
  assignmentId: string;
  experimentKey: string;
  variantKey: string;
  userId?: string | null;
  deviceId?: string | null;
  platform: PlatformType;
  assignedAt: admin.firestore.Timestamp;
}

/**
 * Effective config snapshot returned to clients
 */
export interface EffectiveConfigSnapshot {
  features: Record<string, boolean>;
  values: Record<string, string | number | boolean | any>;
  experiments: Record<string, string>; // experimentKey -> variantKey
}

/**
 * Request params for fetching effective config
 */
export interface FetchConfigParams {
  environment?: 'PROD' | 'STAGE';
  platform: PlatformType;
  country?: string | null;
  userId?: string | null;
  deviceId?: string | null;
}