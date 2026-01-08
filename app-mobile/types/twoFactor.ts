/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Mobile TypeScript Types
 */

// ============================================================================
// 2FA Settings
// ============================================================================

export type TwoFactorMethod = 'EMAIL_OTP';

export interface TwoFactorSettings {
  enabled: boolean;
  method?: TwoFactorMethod;
  maskedAddress?: string; // e.g., "jo***@gmail.com"
}

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

export interface StepUpChallengeInfo {
  challengeRequired: boolean;
  challengeId?: string;
  requirement?: StepUpRequirement;
  reasonCodes?: string[];
}

// ============================================================================
// API Responses
// ============================================================================

export interface Enable2FAResponse {
  success: boolean;
  message?: string;
}

export interface Disable2FAResponse {
  success: boolean;
  message?: string;
}

export interface Get2FASettingsResponse {
  success: boolean;
  settings: TwoFactorSettings;
}

export interface VerifyStepUpChallengeResponse {
  success: boolean;
  message?: string;
}

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Get user-friendly action name for display
 */
export function getActionDisplayName(action: SensitiveAction): string {
  const names: Record<SensitiveAction, string> = {
    PAYOUT_METHOD_CREATE: 'Adding payout method',
    PAYOUT_METHOD_UPDATE: 'Updating payout method',
    PAYOUT_REQUEST_CREATE: 'Requesting payout',
    KYC_SUBMIT: 'Submitting identity verification',
    PASSWORD_CHANGE: 'Changing password',
    EMAIL_CHANGE: 'Changing email',
    LOGOUT_ALL_SESSIONS: 'Logging out all devices',
    ACCOUNT_DELETION: 'Deleting account',
    EARN_ENABLE: 'Enabling earnings',
    '2FA_DISABLE': 'Disabling two-factor authentication',
  };
  
  return names[action] || 'Performing sensitive action';
}

/**
 * Get user-friendly description for why step-up is required
 */
export function getStepUpReasonDescription(reasonCodes: string[]): string {
  if (reasonCodes.includes('2FA_ENABLED')) {
    return 'Two-factor authentication is enabled on your account';
  }
  
  if (reasonCodes.includes('HIGH_RISK_USER')) {
    return 'Additional verification required for your account security';
  }
  
  if (reasonCodes.includes('HIGH_VALUE_ACTION')) {
    return 'This action requires additional verification';
  }
  
  if (reasonCodes.includes('PAYMENT_FRAUD_RISK')) {
    return 'Additional verification required for financial safety';
  }
  
  return 'Additional verification is required for this action';
}