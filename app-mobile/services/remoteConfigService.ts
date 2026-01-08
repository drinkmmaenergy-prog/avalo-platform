/**
 * PACK 67 — Remote Config Service (Mobile)
 * Client-side service for fetching and caching remote configuration
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  RemoteConfigSnapshot,
  FetchRemoteConfigParams,
  CachedRemoteConfig,
  PlatformType,
} from '../types/remoteConfig';

// Configuration
const CACHE_KEY_PREFIX = 'remote_config_snapshot_v1';
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const API_ENDPOINT = process.env.EXPO_PUBLIC_API_URL || 'https://europe-west3-avalo-f8f5a.cloudfunctions.net';

/**
 * Get stable device identifier
 */
export async function getDeviceId(): Promise<string> {
  try {
    // Try to get existing device ID from storage
    const existingId = await AsyncStorage.getItem('device_id');
    if (existingId) {
      return existingId;
    }

    // Generate new device ID using expo-constants
    const installId = Constants.installationId || Constants.sessionId;
    const newId = installId || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem('device_id', newId);
    return newId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    // Fallback to session-based ID
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Get platform type for current device
 */
export function getPlatform(): PlatformType {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * Build cache key for current user/device
 */
function getCacheKey(userIdOrDeviceId: string): string {
  return `${CACHE_KEY_PREFIX}_${userIdOrDeviceId}`;
}

/**
 * Fetch remote config from backend
 */
export async function fetchRemoteConfig(
  params: FetchRemoteConfigParams
): Promise<RemoteConfigSnapshot> {
  try {
    const queryParams = new URLSearchParams({
      platform: params.platform,
      deviceId: params.deviceId,
    });

    if (params.userId) {
      queryParams.append('userId', params.userId);
    }

    if (params.country) {
      queryParams.append('country', params.country);
    }

    // Use PROD environment by default
    queryParams.append('environment', 'PROD');

    const url = `${API_ENDPOINT}/getEffectiveConfig?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch remote config: ${response.status}`);
    }

    const snapshot: RemoteConfigSnapshot = await response.json();

    // Cache the snapshot
    const cached: CachedRemoteConfig = {
      snapshot,
      fetchedAt: Date.now(),
      userId: params.userId,
      deviceId: params.deviceId,
    };

    const cacheKey = getCacheKey(params.userId || params.deviceId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cached));

    return snapshot;
  } catch (error) {
    console.error('Error fetching remote config:', error);
    
    // Try to return cached version if available
    const cached = await getCachedConfig(params.userId || params.deviceId);
    if (cached) {
      console.warn('Using cached remote config due to fetch error');
      return cached.snapshot;
    }

    // Return empty snapshot as fallback
    return {
      features: {},
      values: {},
      experiments: {},
    };
  }
}

/**
 * Get cached remote config
 */
export async function getCachedConfig(
  userIdOrDeviceId: string
): Promise<CachedRemoteConfig | null> {
  try {
    const cacheKey = getCacheKey(userIdOrDeviceId);
    const cachedJson = await AsyncStorage.getItem(cacheKey);
    
    if (!cachedJson) {
      return null;
    }

    const cached: CachedRemoteConfig = JSON.parse(cachedJson);
    
    // Check if cache is still valid
    const age = Date.now() - cached.fetchedAt;
    if (age > CACHE_MAX_AGE_MS) {
      console.log('Cached remote config expired');
      return null;
    }

    return cached;
  } catch (error) {
    console.error('Error reading cached config:', error);
    return null;
  }
}

/**
 * Get remote config snapshot (cached or fresh)
 */
export async function getRemoteConfigSnapshot(
  userId?: string,
  country?: string
): Promise<RemoteConfigSnapshot> {
  const deviceId = await getDeviceId();
  const platform = getPlatform();
  const userIdOrDeviceId = userId || deviceId;

  // Try to get cached version first
  const cached = await getCachedConfig(userIdOrDeviceId);
  if (cached) {
    // Refresh in background
    fetchRemoteConfig({
      userId,
      deviceId,
      platform,
      country,
    }).catch((error) => {
      console.error('Background config refresh failed:', error);
    });

    return cached.snapshot;
  }

  // No cache, fetch fresh
  return fetchRemoteConfig({
    userId,
    deviceId,
    platform,
    country,
  });
}

/**
 * Force refresh remote config
 */
export async function refreshRemoteConfig(
  userId?: string,
  country?: string
): Promise<RemoteConfigSnapshot> {
  const deviceId = await getDeviceId();
  const platform = getPlatform();

  return fetchRemoteConfig({
    userId,
    deviceId,
    platform,
    country,
  });
}

/**
 * Check if a feature is enabled
 */
export function getFeatureEnabled(
  snapshot: RemoteConfigSnapshot,
  featureKey: string,
  defaultValue: boolean = false
): boolean {
  return snapshot.features[featureKey] ?? defaultValue;
}

/**
 * Get a config value
 */
export function getConfigValue<T = any>(
  snapshot: RemoteConfigSnapshot,
  key: string,
  defaultValue: T
): T {
  const value = snapshot.values[key];
  return value !== undefined ? (value as T) : defaultValue;
}

/**
 * Get experiment variant
 */
export function getExperimentVariant(
  snapshot: RemoteConfigSnapshot,
  experimentKey: string,
  defaultVariant?: string
): string | undefined {
  return snapshot.experiments[experimentKey] || defaultVariant;
}

/**
 * Clear cached remote config (useful for logout)
 */
export async function clearRemoteConfigCache(userIdOrDeviceId?: string): Promise<void> {
  try {
    if (userIdOrDeviceId) {
      const cacheKey = getCacheKey(userIdOrDeviceId);
      await AsyncStorage.removeItem(cacheKey);
    } else {
      // Clear all remote config caches
      const keys = await AsyncStorage.getAllKeys();
      const configKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
      await AsyncStorage.multiRemove(configKeys);
    }
  } catch (error) {
    console.error('Error clearing remote config cache:', error);
  }
}

/**
 * Initialize remote config on app start
 */
export async function initRemoteConfig(
  userId?: string,
  country?: string
): Promise<RemoteConfigSnapshot> {
  console.log('Initializing remote config...');
  const snapshot = await getRemoteConfigSnapshot(userId, country);
  console.log('Remote config initialized:', {
    featureCount: Object.keys(snapshot.features).length,
    valueCount: Object.keys(snapshot.values).length,
    experimentCount: Object.keys(snapshot.experiments).length,
  });
  return snapshot;
}