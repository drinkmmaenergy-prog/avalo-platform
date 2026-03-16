import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

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
export declare const FEATURE_FLAGS: Record<string, FeatureFlag>;
export declare const getFeatureFlag: (flagId: string) => FeatureFlag | undefined;


























