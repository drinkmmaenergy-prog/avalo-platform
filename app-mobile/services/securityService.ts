/**
 * PACK 60 — Security Service
 * Mobile service for security settings, 2FA, devices, and sessions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../lib/firebase';

const functions = getFunctions(app, 'europe-west3');

// Types
export type TwoFactorMethod = 'NONE' | 'SMS' | 'EMAIL';
export type Platform = 'android' | 'ios' | 'web' | 'other';
export type SecurityPurpose = 'LOGIN' | 'PAYOUT' | 'SETTINGS_CHANGE';

export interface SecurityOverview {
  twoFactor: {
    enabled: boolean;
    method: TwoFactorMethod;
    destinationMasked?: string | null;
  };
  alerts: {
    newDeviceLogin: boolean;
    newLocationLogin: boolean;
    securityChanges: boolean;
  };
  risk: {
    require2faForPayout: boolean;
    require2faForSettingsChange: boolean;
  };
  devices: {
    deviceId: string;
    platform: Platform;
    model?: string | null;
    trusted: boolean;
    lastSeenAt: number;
    lastIpCountry?: string | null;
  }[];
  sessions: {
    sessionId: string;
    deviceId: string;
    platform: Platform;
    createdAt: number;
    lastActiveAt: number;
    revoked: boolean;
  }[];
}

// AsyncStorage keys
const SECURITY_OVERVIEW_KEY = (userId: string) => `security_overview_v1_${userId}`;

/**
 * Fetch complete security overview
 */
export async function fetchSecurityOverview(userId: string): Promise<SecurityOverview> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(SECURITY_OVERVIEW_KEY(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      // Return cached if less than 5 minutes old
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return parsed.data;
      }
    }

    // Fetch from backend
    const getSecurityOverview = httpsCallable<{ userId?: string }, SecurityOverview>(
      functions,
      'getSecurityOverview'
    );
    const result = await getSecurityOverview({ userId });
    const overview = result.data;

    // Cache result
    await AsyncStorage.setItem(
      SECURITY_OVERVIEW_KEY(userId),
      JSON.stringify({ data: overview, timestamp: Date.now() })
    );

    return overview;
  } catch (error) {
    console.error('[SecurityService] Error fetching overview:', error);
    throw error;
  }
}

/**
 * Update security settings (alerts and risk thresholds)
 */
export async function updateSecuritySettings(
  userId: string,
  partial: {
    alerts?: Partial<SecurityOverview['alerts']>;
    risk?: Partial<SecurityOverview['risk']>;
  }
): Promise<SecurityOverview> {
  try {
    const updateSettings = httpsCallable<
      { alerts?: any; risk?: any },
      { success: boolean }
    >(functions, 'updateSecuritySettings');

    await updateSettings(partial);

    // Invalidate cache and refetch
    await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
    return await fetchSecurityOverview(userId);
  } catch (error) {
    console.error('[SecurityService] Error updating settings:', error);
    throw error;
  }
}

/**
 * Setup 2FA (initiate with phone/email)
 */
export async function setupTwoFactor(
  userId: string,
  method: TwoFactorMethod,
  phoneE164?: string,
  email?: string
): Promise<{ destinationMasked: string; expiresAt: number }> {
  try {
    const setup2FA = httpsCallable<
      { method: TwoFactorMethod; phoneE164?: string; email?: string },
      { destinationMasked: string; expiresAt: number }
    >(functions, 'setup2FA');

    const result = await setup2FA({ method, phoneE164, email });
    return result.data;
  } catch (error) {
    console.error('[SecurityService] Error setting up 2FA:', error);
    throw error;
  }
}

/**
 * Confirm 2FA setup with OTP code
 */
export async function confirmTwoFactorSetup(
  userId: string,
  method: TwoFactorMethod,
  code: string,
  phoneE164?: string,
  email?: string
): Promise<SecurityOverview> {
  try {
    const confirm2FASetup = httpsCallable<
      { method: TwoFactorMethod; code: string; phoneE164?: string; email?: string },
      { success: boolean }
    >(functions, 'confirm2FASetup');

    await confirm2FASetup({ method, code, phoneE164, email });

    // Invalidate cache and refetch
    await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
    return await fetchSecurityOverview(userId);
  } catch (error) {
    console.error('[SecurityService] Error confirming 2FA setup:', error);
    throw error;
  }
}

/**
 * Disable 2FA
 */
export async function disableTwoFactor(
  userId: string,
  code?: string
): Promise<SecurityOverview> {
  try {
    const disable2FA = httpsCallable<{ code?: string }, { success: boolean }>(
      functions,
      'disable2FA'
    );

    await disable2FA({ code });

    // Invalidate cache and refetch
    await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
    return await fetchSecurityOverview(userId);
  } catch (error) {
    console.error('[SecurityService] Error disabling 2FA:', error);
    throw error;
  }
}

/**
 * Request a 2FA challenge for sensitive operations
 */
export async function requestTwoFactorChallenge(
  userId: string,
  purpose: SecurityPurpose
): Promise<{ destinationMasked: string; expiresAt: number }> {
  try {
    const request2FAChallenge = httpsCallable<
      { purpose: SecurityPurpose },
      { destinationMasked: string; expiresAt: number }
    >(functions, 'request2FAChallenge');

    const result = await request2FAChallenge({ purpose });
    return result.data;
  } catch (error) {
    console.error('[SecurityService] Error requesting 2FA challenge:', error);
    throw error;
  }
}

/**
 * Verify a 2FA challenge
 */
export async function verifyTwoFactorChallenge(
  userId: string,
  purpose: SecurityPurpose,
  code: string
): Promise<void> {
  try {
    const verify2FAChallenge = httpsCallable<
      { purpose: SecurityPurpose; code: string },
      { success: boolean; verifiedAt: number }
    >(functions, 'verify2FAChallenge');

    await verify2FAChallenge({ purpose, code });
  } catch (error) {
    console.error('[SecurityService] Error verifying 2FA challenge:', error);
    throw error;
  }
}

/**
 * Trust or untrust a device
 */
export async function trustDevice(
  userId: string,
  deviceId: string,
  trusted: boolean
): Promise<SecurityOverview> {
  try {
    const trustDeviceFunc = httpsCallable<
      { deviceId: string; trusted: boolean },
      { success: boolean }
    >(functions, 'trustDevice');

    await trustDeviceFunc({ deviceId, trusted });

    // Invalidate cache and refetch
    await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
    return await fetchSecurityOverview(userId);
  } catch (error) {
    console.error('[SecurityService] Error trusting device:', error);
    throw error;
  }
}

/**
 * Revoke a session (or all except current)
 */
export async function revokeSession(
  userId: string,
  sessionId?: string,
  revokeAllExceptCurrent?: boolean,
  currentSessionId?: string
): Promise<SecurityOverview> {
  try {
    const revokeSessionFunc = httpsCallable<
      {
        sessionId?: string;
        revokeAllExceptCurrent?: boolean;
        currentSessionId?: string;
      },
      { success: boolean }
    >(functions, 'revokeSession');

    await revokeSessionFunc({ sessionId, revokeAllExceptCurrent, currentSessionId });

    // Invalidate cache and refetch
    await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
    return await fetchSecurityOverview(userId);
  } catch (error) {
    console.error('[SecurityService] Error revoking session:', error);
    throw error;
  }
}

/**
 * Clear security cache (e.g., on logout)
 */
export async function clearSecurityCache(userId: string): Promise<void> {
  await AsyncStorage.removeItem(SECURITY_OVERVIEW_KEY(userId));
}