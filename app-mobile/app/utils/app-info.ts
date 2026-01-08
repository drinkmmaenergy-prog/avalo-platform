/**
 * App information utilities
 */

import Constants from 'expo-constants';

export function getAppVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

export function getBuildNumber(): string {
  return Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString() || '1';
}
