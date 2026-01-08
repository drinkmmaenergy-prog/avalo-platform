/**
 * PACK 60 — Security & Account Protection Suite
 * Types for sessions, devices, 2FA, and security settings
 */

import { Timestamp } from 'firebase-admin/firestore';

export type TwoFactorMethod = 'NONE' | 'SMS' | 'EMAIL';
export type Platform = 'android' | 'ios' | 'web' | 'other';
export type SecurityPurpose = 'LOGIN' | 'PAYOUT' | 'SETTINGS_CHANGE';

/**
 * Device record: tracks each unique device accessing the account
 */
export interface UserDevice {
  deviceId: string;
  userId: string;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
  platform: Platform;
  model?: string | null;
  appVersion?: string | null;
  osVersion?: string | null;
  lastIpCountry?: string | null;
  lastIpCity?: string | null;
  trusted: boolean;
  lastLoginAt?: Timestamp;
}

/**
 * Session record: tracks each active login session
 */
export interface UserSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
  platform: Platform;
  appVersion?: string | null;
  ipCountry?: string | null;
  ipCity?: string | null;
  revoked: boolean;
  revokedAt?: Timestamp;
  reasonRevoked?: string | null;
}

/**
 * Security settings per user
 */
export interface SecuritySettings {
  userId: string;
  
  // 2FA
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
  twoFactorPhoneE164?: string | null;
  twoFactorEmail?: string | null;
  lastTwoFactorUpdatedAt?: Timestamp | null;
  
  // Login alerts
  alerts: {
    newDeviceLogin: boolean;
    newLocationLogin: boolean;
    securityChanges: boolean;
  };
  
  // Risk threshold tuning
  risk: {
    require2faForPayout: boolean;
    require2faForSettingsChange: boolean;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Two-factor authentication challenge (OTP)
 */
export interface TwoFactorChallenge {
  challengeId: string;
  userId: string;
  method: 'SMS' | 'EMAIL';
  destination: string; // masked for display
  codeHash: string; // hashed OTP
  purpose: SecurityPurpose;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  consumed: boolean;
  consumedAt?: Timestamp;
}

/**
 * Security context for risk evaluation
 */
export interface SecurityContext {
  userId: string;
  isNewDevice: boolean;
  isNewLocation: boolean;
  riskFlags: string[];
  action: SecurityPurpose;
}

/**
 * Security decision result
 */
export interface SecurityDecision {
  requireTwoFactor: boolean;
  requireLogoutOtherSessions: boolean;
}

/**
 * Default security settings
 */
export const DEFAULT_SECURITY_SETTINGS: Omit<SecuritySettings, 'userId' | 'createdAt' | 'updatedAt'> = {
  twoFactorEnabled: false,
  twoFactorMethod: 'NONE',
  twoFactorPhoneE164: null,
  twoFactorEmail: null,
  lastTwoFactorUpdatedAt: null,
  alerts: {
    newDeviceLogin: true,
    newLocationLogin: true,
    securityChanges: true,
  },
  risk: {
    require2faForPayout: true,
    require2faForSettingsChange: true,
  },
};