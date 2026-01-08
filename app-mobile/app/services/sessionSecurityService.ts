/**
 * PACK 95 — Session Security Service
 * Client-side service for device and session management
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Try to import expo-device, but make it optional
let Device: any = null;
let Constants: any = null;

try {
  Device = require('expo-device');
} catch (e) {
  console.warn('[SessionSecurityService] expo-device not available');
}

try {
  Constants = require('expo-constants');
} catch (e) {
  console.warn('[SessionSecurityService] expo-constants not available');
}

// ============================================================================
// TYPES
// ============================================================================

export interface SessionInfo {
  sessionId: string;
  deviceId: string;
  platform: string;
  deviceModel?: string;
  ipCountry?: string;
  lastActiveAt: number;
  createdAt: number;
  isCurrentSession: boolean;
}

export interface RegisterDeviceAndSessionRequest {
  deviceId: string;
  platform: 'android' | 'ios' | 'web' | 'other';
  deviceModel?: string;
  appVersion?: string;
  userAgent?: string;
  ipCountry?: string;
}

export interface RegisterDeviceAndSessionResponse {
  success: boolean;
  sessionId: string;
  deviceId: string;
  anomalies?: string[];
  message?: string;
}

export interface LogoutSessionResponse {
  success: boolean;
  message?: string;
}

export interface LogoutAllSessionsResponse {
  success: boolean;
  sessionsRevoked: number;
  message?: string;
}

export interface GetActiveSessionsResponse {
  success: boolean;
  sessions: SessionInfo[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEVICE_ID_KEY = '@avalo:deviceId';
const SESSION_ID_KEY = '@avalo:sessionId';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class SessionSecurityService {
  private functions = getFunctions();
  private deviceId: string | null = null;
  private sessionId: string | null = null;

  /**
   * Initialize device ID (generate or retrieve from storage)
   */
  async initializeDeviceId(): Promise<string> {
    try {
      // Try to get existing device ID from storage
      let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

      if (!deviceId) {
        // Generate new device ID
        deviceId = await this.generateDeviceId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }

      this.deviceId = deviceId;
      return deviceId;
    } catch (error: any) {
      console.error('[SessionSecurityService] Error initializing device ID:', error);
      // Fallback to a temporary device ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.deviceId = tempId;
      return tempId;
    }
  }

  /**
   * Generate a unique device ID based on available device info
   */
  private async generateDeviceId(): Promise<string> {
    try {
      // Use Expo Device API if available, otherwise use Platform
      const deviceInfo = {
        brand: Device?.brand || 'unknown',
        manufacturer: Device?.manufacturer || 'unknown',
        modelName: Device?.modelName || Platform.OS,
        osName: Device?.osName || Platform.OS,
        osVersion: Device?.osVersion || Platform.Version?.toString() || 'unknown',
        // Note: Don't use deviceId or any hardware identifiers for privacy
      };

      // Create a hash-like string (not cryptographically secure, just stable)
      const infoString = JSON.stringify(deviceInfo);
      const deviceId = `device_${this.simpleHash(infoString)}_${Date.now()}`;

      return deviceId;
    } catch (error: any) {
      console.error('[SessionSecurityService] Error generating device ID:', error);
      return `device_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Simple hash function for device info (not cryptographic)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 12);
  }

  /**
   * Get current device ID
   */
  async getDeviceId(): Promise<string> {
    if (!this.deviceId) {
      return await this.initializeDeviceId();
    }
    return this.deviceId;
  }

  /**
   * Get current session ID
   */
  async getSessionId(): Promise<string | null> {
    if (!this.sessionId) {
      this.sessionId = await AsyncStorage.getItem(SESSION_ID_KEY);
    }
    return this.sessionId;
  }

  /**
   * Set session ID (after login or registration)
   */
  async setSessionId(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  /**
   * Clear session ID (after logout)
   */
  async clearSessionId(): Promise<void> {
    this.sessionId = null;
    await AsyncStorage.removeItem(SESSION_ID_KEY);
  }

  /**
   * Register device and create session (called after login)
   */
  async registerDeviceAndSession(): Promise<RegisterDeviceAndSessionResponse> {
    try {
      const deviceId = await this.getDeviceId();
      const platform = this.getPlatform();
      const deviceModel = Device?.modelName || undefined;
      const appVersion = Constants?.expoConfig?.version || '1.0.0';
      const userAgent = await this.getUserAgent();

      const callable = httpsCallable<
        RegisterDeviceAndSessionRequest,
        RegisterDeviceAndSessionResponse
      >(this.functions, 'registerDeviceAndSession');

      const result: HttpsCallableResult<RegisterDeviceAndSessionResponse> = await callable({
        deviceId,
        platform,
        deviceModel,
        appVersion,
        userAgent,
      });

      // Store session ID
      if (result.data.success && result.data.sessionId) {
        await this.setSessionId(result.data.sessionId);
      }

      return result.data;
    } catch (error: any) {
      console.error('[SessionSecurityService] registerDeviceAndSession error:', error);
      throw new Error(error.message || 'Failed to register device and session');
    }
  }

  /**
   * Get all active sessions for the current user
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const currentSessionId = await this.getSessionId();

      const callable = httpsCallable<
        { currentSessionId?: string },
        GetActiveSessionsResponse
      >(this.functions, 'getActiveSessions');

      const result: HttpsCallableResult<GetActiveSessionsResponse> = await callable({
        currentSessionId: currentSessionId || undefined,
      });

      return result.data.sessions;
    } catch (error: any) {
      console.error('[SessionSecurityService] getActiveSessions error:', error);
      throw new Error(error.message || 'Failed to get active sessions');
    }
  }

  /**
   * Logout from a specific session
   */
  async logoutSession(sessionId: string): Promise<LogoutSessionResponse> {
    try {
      const callable = httpsCallable<
        { sessionId: string },
        LogoutSessionResponse
      >(this.functions, 'logoutSession');

      const result: HttpsCallableResult<LogoutSessionResponse> = await callable({
        sessionId,
      });

      // If logging out current session, clear local session ID
      const currentSessionId = await this.getSessionId();
      if (sessionId === currentSessionId) {
        await this.clearSessionId();
      }

      return result.data;
    } catch (error: any) {
      console.error('[SessionSecurityService] logoutSession error:', error);
      throw new Error(error.message || 'Failed to logout session');
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAllSessions(exceptCurrent: boolean = false): Promise<LogoutAllSessionsResponse> {
    try {
      const currentSessionId = await this.getSessionId();

      const callable = httpsCallable<
        { exceptCurrentSession?: boolean; currentSessionId?: string },
        LogoutAllSessionsResponse
      >(this.functions, 'logoutAllSessions');

      const result: HttpsCallableResult<LogoutAllSessionsResponse> = await callable({
        exceptCurrentSession: exceptCurrent,
        currentSessionId: exceptCurrent ? currentSessionId || undefined : undefined,
      });

      // If not keeping current session, clear local session ID
      if (!exceptCurrent) {
        await this.clearSessionId();
      }

      return result.data;
    } catch (error: any) {
      console.error('[SessionSecurityService] logoutAllSessions error:', error);
      throw new Error(error.message || 'Failed to logout all sessions');
    }
  }

  /**
   * Logout current session (called on app logout)
   */
  async logoutCurrentSession(): Promise<void> {
    try {
      const sessionId = await this.getSessionId();
      if (sessionId) {
        await this.logoutSession(sessionId);
      }
      await this.clearSessionId();
    } catch (error: any) {
      console.error('[SessionSecurityService] logoutCurrentSession error:', error);
      // Always clear session ID even on error
      await this.clearSessionId();
    }
  }

  /**
   * Get current platform
   */
  private getPlatform(): 'android' | 'ios' | 'web' | 'other' {
    if (Device?.osName === 'Android') return 'android';
    if (Device?.osName === 'iOS') return 'ios';
    // Fallback to react-native Platform
    if (Platform.OS === 'android') return 'android';
    if (Platform.OS === 'ios') return 'ios';
    return 'other';
  }

  /**
   * Get user agent string
   */
  private async getUserAgent(): Promise<string> {
    try {
      const platform = this.getPlatform();
      const osVersion = Device?.osVersion || Platform.Version?.toString() || 'unknown';
      const appVersion = Constants?.expoConfig?.version || '1.0.0';
      const deviceModel = Device?.modelName || Platform.OS;

      return `Avalo/${appVersion} (${platform}; ${deviceModel}; ${osVersion})`;
    } catch (error: any) {
      return 'Avalo/1.0.0';
    }
  }

  /**
   * Format session info for display
   */
  formatSessionInfo(session: SessionInfo): string {
    const date = new Date(session.createdAt);
    const timeAgo = this.getTimeAgo(session.lastActiveAt);
    const location = session.ipCountry || 'Unknown location';
    const device = session.deviceModel || session.platform;

    return `${device} • ${location} • ${timeAgo}`;
  }

  /**
   * Get relative time string
   */
  private getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
}

// Export singleton instance
export const sessionSecurityService = new SessionSecurityService();