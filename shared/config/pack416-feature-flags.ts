// Stub types for pack416 feature flags
export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers?: string[];
}

export interface FeatureFlagConfig {
  flags: Record<string, FeatureFlag>;
  defaultEnabled: boolean;
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {};
export const getFeatureFlag = (flagId: string): FeatureFlag | undefined => FEATURE_FLAGS[flagId];
