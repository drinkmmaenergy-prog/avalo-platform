/**
 * PACK 67 — Remote Config Types (Mobile)
 * Types for remote configuration and experimentation
 */

export type PlatformType = 'android' | 'ios';

/**
 * Remote config snapshot received from backend
 */
export interface RemoteConfigSnapshot {
  features: Record<string, boolean>;
  values: Record<string, string | number | boolean | any>;
  experiments: Record<string, string>; // experimentKey -> variantKey
}

/**
 * Params for fetching remote config
 */
export interface FetchRemoteConfigParams {
  userId?: string;
  deviceId: string;
  platform: PlatformType;
  country?: string;
}

/**
 * Cached config with metadata
 */
export interface CachedRemoteConfig {
  snapshot: RemoteConfigSnapshot;
  fetchedAt: number; // timestamp in ms
  userId?: string;
  deviceId: string;
}