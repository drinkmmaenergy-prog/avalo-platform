/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * TypeScript Type Definitions
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// 2FA Settings & Methods
// ============================================================================

export type TwoFactorMethod = 'EMAIL_OTP';

export interface User2FASettings {
  userId: string;
  enabled: boolean;
  method: TwoFactorMethod;
  deliveryAddress: string; // Email/phone tied to OTP (masked in UI)
  backupCodesHash?: string[]; // Future: hashed backup codes
  lastUpdatedAt: Timestamp;
}

export interface User2FAEvent {
  id: string;
  userId: string;
  type: TwoFactorEventType;
  context: Record<string, any>; // e.g., { action: "PAYOUT_REQUEST", sessionId: "..." }
  createdAt: Timestamp;
}

export type TwoFactorEventType =
  | 'ENABLED'
  | 'DISABLED'
  | 'CHALLENGE_INITIATED'
  | 'CHALLENGE_SUCCESS'
  | 'CHALLENGE_FAILED'
  | 'CHALLENGE_EXPIRED';

// ============================================================================
// Step-Up Verification
// ============================================================================

export type SensitiveAction =
  | 'PAYOUT_METHOD_CREATE'
  | 'PAYOUT_METHOD_UPDATE'
  | 'PAYOUT_REQUEST_CREATE'
  | 'KYC_SUBMIT'
  | 'PASSWORD_CHANGE'
  | 'EMAIL_CHANGE'
  | 'LOGOUT_ALL_SESSIONS'
  | 'ACCOUNT_DELETION'
  | 'EARN_ENABLE'
  | '2FA_DISABLE';

export type StepUpRequirement = 'NONE' | 'RECOMMENDED' | 'REQUIRED';

export interface StepUpPolicyResult {
  requirement: StepUpRequirement;
  reasonCodes: string[]; // e.g., ["HIGH_RISK_USER", "HIGH_VALUE_ACTION"]
}

// ============================================================================
// 2FA Challenges
// ============================================================================

export interface User2FAChallenge {
  id: string; // challengeId (UUID)
  userId: string;
  action: SensitiveAction;
  codeHash: string; // hash of OTP code (never store raw)
  createdAt: Timestamp;
  expiresAt: Timestamp; // TTL (e.g., 10-15 minutes)
  attemptsLeft: number; // e.g., 5
  sessionId?: string; // session for which challenge is valid
  deviceId?: string; // device context
  resolved: boolean; // true if success or expired
  resolvedAt?: Timestamp;
  result?: ChallengeResult;
}

export type ChallengeResult = 'SUCCESS' | 'FAILED' | 'EXPIRED';

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface Enable2FARequest {
  method: TwoFactorMethod;
  deliveryAddress: string;
}

export interface Enable2FAResponse {
  success: boolean;
  message?: string;
}

export interface Disable2FARequest {
  // Requires step-up challenge completed
}

export interface Disable2FAResponse {
  success: boolean;
  message?: string;
}

export interface Get2FASettingsResponse {
  success: boolean;
  settings: {
    enabled: boolean;
    method?: TwoFactorMethod;
    maskedAddress?: string; // e.g., "jo***@gmail.com"
  };
}

export interface InitiateStepUpChallengeRequest {
  action: SensitiveAction;
}

export interface InitiateStepUpChallengeResponse {
  challengeRequired: boolean;
  challengeId?: string;
  requirement?: StepUpRequirement;
  reasonCodes?: string[];
}

export interface VerifyStepUpChallengeRequest {
  challengeId: string;
  code: string;
}

export interface VerifyStepUpChallengeResponse {
  success: boolean;
  message?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface TwoFactorConfig {
  otpLength: number; // e.g., 6
  otpExpiryMinutes: number; // e.g., 15
  maxAttempts: number; // e.g., 5
  strongAuthWindowMinutes: number; // e.g., 10
  
  // Policy thresholds
  requireForHighRisk: boolean;
  highRiskScoreThreshold: number; // e.g., 50
  
  // Sensitive action policies
  actionPolicies: Record<SensitiveAction, {
    baseRequirement: StepUpRequirement;
    requireFor2FAUsers: boolean;
  }>;
}

export const DEFAULT_2FA_CONFIG: TwoFactorConfig = {
  otpLength: 6,
  otpExpiryMinutes: 15,
  maxAttempts: 5,
  strongAuthWindowMinutes: 10,
  
  requireForHighRisk: true,
  highRiskScoreThreshold: 50,
  
  actionPolicies: {
    'PAYOUT_METHOD_CREATE': {
      baseRequirement: 'RECOMMENDED',
      requireFor2FAUsers: true,
    },
    'PAYOUT_METHOD_UPDATE': {
      baseRequirement: 'RECOMMENDED',
      requireFor2FAUsers: true,
    },
    'PAYOUT_REQUEST_CREATE': {
      baseRequirement: 'REQUIRED',
      requireFor2FAUsers: true,
    },
    'KYC_SUBMIT': {
      baseRequirement: 'RECOMMENDED',
      requireFor2FAUsers: true,
    },
    'PASSWORD_CHANGE': {
      baseRequirement: 'RECOMMENDED',
      requireFor2FAUsers: true,
    },
    'EMAIL_CHANGE': {
      baseRequirement: 'REQUIRED',
      requireFor2FAUsers: true,
    },
    'LOGOUT_ALL_SESSIONS': {
      baseRequirement: 'RECOMMENDED',
      requireFor2FAUsers: true,
    },
    'ACCOUNT_DELETION': {
      baseRequirement: 'REQUIRED',
      requireFor2FAUsers: true,
    },
    'EARN_ENABLE': {
      baseRequirement: 'NONE',
      requireFor2FAUsers: false,
    },
    '2FA_DISABLE': {
      baseRequirement: 'REQUIRED',
      requireFor2FAUsers: true,
    },
  },
};

// ============================================================================
// Strong Auth Session Context
// ============================================================================

export interface StrongAuthContext {
  userId: string;
  sessionId: string;
  lastStrongAuthAt: Timestamp;
  verifiedActions: SensitiveAction[];
}