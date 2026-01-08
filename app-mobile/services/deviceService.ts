/**
 * Device Fingerprinting Service for Avalo Mobile
 * 
 * Provides a stable device identifier for fraud detection and analytics.
 * This is a minimal, pluggable implementation that can be enhanced later.
 * 
 * IMPORTANT: This is privacy-compliant - uses Expo's installation ID
 * which is reset on app reinstall.
 */

import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

// ============================================================================
// TYPES
// ============================================================================

export interface DeviceInfo {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  osVersion: string;
  appVersion: string;
  model?: string;
  brand?: string;
}

// ============================================================================
// DEVICE ID
// ============================================================================

/**
 * Get a stable device identifier
 * 
 * Uses Expo's installationId which persists across app launches
 * but is reset on app reinstall (privacy-friendly)
 * 
 * @returns Promise<string> - Stable device identifier
 */
export async function getDeviceId(): Promise<string> {
  try {
    // Primary: Use Expo Constants installationId
    if (Constants.installationId) {
      return Constants.installationId;
    }
    
    // Fallback: Try platform-specific identifiers
    if (Platform.OS === 'android') {
      const androidId = await Application.getAndroidId();
      if (androidId) {
        return `android_${androidId}`;
      }
    }
    
    if (Platform.OS === 'ios') {
      const iosIdForVendor = await Application.getIosIdForVendorAsync();
      if (iosIdForVendor) {
        return `ios_${iosIdForVendor}`;
      }
    }
    
    // Last resort: Generate a random ID and store it
    // Note: This would need AsyncStorage to persist
    const randomId = `temp_${Math.random().toString(36).substring(2, 15)}`;
    return randomId;
    
  } catch (error) {
    console.warn('Failed to get device ID:', error);
    return `unknown_${Date.now()}`;
  }
}

/**
 * Get comprehensive device information
 * 
 * @returns Promise<DeviceInfo>
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const deviceId = await getDeviceId();
  
  const info: DeviceInfo = {
    deviceId,
    platform: Platform.OS as 'ios' | 'android' | 'web',
    osVersion: Platform.Version.toString(),
    appVersion: Constants.expoConfig?.version || '1.0.0',
  };
  
  // Add device details if available
  try {
    if (Platform.OS === 'android') {
      info.model = Constants.deviceName || undefined;
      info.brand = await Application.getAndroidId() ? 'Android' : undefined;
    } else if (Platform.OS === 'ios') {
      info.model = Constants.deviceName || undefined;
      info.brand = 'Apple';
    }
  } catch (error) {
    // Non-critical - continue without device details
  }
  
  return info;
}

/**
 * Check if device ID is available
 * 
 * @returns Promise<boolean>
 */
export async function hasDeviceId(): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();
    return !!deviceId && !deviceId.startsWith('unknown_') && !deviceId.startsWith('temp_');
  } catch {
    return false;
  }
}

/**
 * Get a fingerprint hash for the device
 * Combines multiple device characteristics
 * 
 * Note: This is a simple implementation. In production, you'd use
 * a more sophisticated fingerprinting library.
 * 
 * @returns Promise<string> - Device fingerprint hash
 */
export async function getDeviceFingerprint(): Promise<string> {
  try {
    const info = await getDeviceInfo();
    
    // Create a simple fingerprint from available data
    const fingerprintData = [
      info.deviceId,
      info.platform,
      info.osVersion,
      info.model || 'unknown',
      info.brand || 'unknown',
    ].join('|');
    
    // Simple hash (in production, use crypto.subtle)
    let hash = 0;
    for (let i = 0; i < fingerprintData.length; i++) {
      const char = fingerprintData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return `fp_${Math.abs(hash).toString(36)}`;
  } catch (error) {
    console.warn('Failed to generate device fingerprint:', error);
    return `fp_unknown_${Date.now()}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getDeviceId,
  getDeviceInfo,
  hasDeviceId,
  getDeviceFingerprint,
};