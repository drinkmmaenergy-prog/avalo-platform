/**
 * PACK 100 — Types & Error Codes for Mobile Integration
 * 
 * Error codes and types for mobile apps to handle gracefully
 * Provides clear user-facing messages and retry strategies
 */

// ============================================================================
// ERROR CODES
// ============================================================================

export type Pack100ErrorCode =
  | 'RATE_LIMITED'
  | 'LAUNCH_MODE_RESTRICTED'
  | 'COUNTRY_NOT_ALLOWED'
  | 'INVITE_CODE_REQUIRED'
  | 'DAILY_LIMIT_REACHED'
  | 'FILE_TOO_LARGE'
  | 'MIME_TYPE_NOT_ALLOWED'
  | 'SYSTEM_MAINTENANCE'
  | 'SERVICE_DEGRADED';

// ============================================================================
// RATE LIMIT ERROR DETAILS
// ============================================================================

export interface RateLimitError {
  code: 'RATE_LIMITED';
  message: string;
  retryAfter: number;        // Seconds until retry allowed
  resetAt: number;           // Timestamp when limit resets
  action: string;            // Which action was rate limited
}

// ============================================================================
// LAUNCH MODE ERROR DETAILS
// ============================================================================

export interface LaunchModeError {
  code: 'LAUNCH_MODE_RESTRICTED' | 'COUNTRY_NOT_ALLOWED' | 'INVITE_CODE_REQUIRED' | 'DAILY_LIMIT_REACHED';
  message: string;
  currentMode?: string;
  allowedCountries?: string[];
  requiresInviteCode?: boolean;
}

// ============================================================================
// STORAGE VALIDATION ERROR DETAILS
// ============================================================================

export interface StorageValidationError {
  code: 'FILE_TOO_LARGE' | 'MIME_TYPE_NOT_ALLOWED';
  message: string;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  uploadedFileSize?: number;
  uploadedMimeType?: string;
}

// ============================================================================
// SYSTEM STATUS ERROR DETAILS
// ============================================================================

export interface SystemStatusError {
  code: 'SYSTEM_MAINTENANCE' | 'SERVICE_DEGRADED';
  message: string;
  estimatedResolutionTime?: number;
  affectedServices?: string[];
}

// ============================================================================
// USER-FRIENDLY ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES: Record<Pack100ErrorCode, string> = {
  RATE_LIMITED: 'Too many requests. Please slow down and try again in a moment.',
  LAUNCH_MODE_RESTRICTED: 'This feature is currently in limited access. Please check back later.',
  COUNTRY_NOT_ALLOWED: 'Avalo is not yet available in your region. Stay tuned for updates!',
  INVITE_CODE_REQUIRED: 'An invite code is required during beta. Request an invite to join.',
  DAILY_LIMIT_REACHED: 'Daily signup limit reached. Please try again tomorrow.',
  FILE_TOO_LARGE: 'File is too large. Please choose a smaller file.',
  MIME_TYPE_NOT_ALLOWED: 'File type not supported. Please choose a different file.',
  SYSTEM_MAINTENANCE: 'System is undergoing maintenance. Please try again shortly.',
  SERVICE_DEGRADED: 'Service is experiencing issues. Some features may be slow.',
};

// ============================================================================
// RETRY STRATEGY
// ============================================================================

export interface RetryStrategy {
  shouldRetry: boolean;
  retryAfterSeconds?: number;
  exponentialBackoff?: boolean;
}

export function getRetryStrategy(errorCode: Pack100ErrorCode): RetryStrategy {
  switch (errorCode) {
    case 'RATE_LIMITED':
      return {
        shouldRetry: true,
        exponentialBackoff: false, // Use provided retryAfter
      };
    
    case 'SYSTEM_MAINTENANCE':
    case 'SERVICE_DEGRADED':
      return {
        shouldRetry: true,
        retryAfterSeconds: 30,
        exponentialBackoff: true,
      };
    
    case 'LAUNCH_MODE_RESTRICTED':
    case 'COUNTRY_NOT_ALLOWED':
    case 'INVITE_CODE_REQUIRED':
    case 'DAILY_LIMIT_REACHED':
      return {
        shouldRetry: false, // Requires user action or waiting
      };
    
    case 'FILE_TOO_LARGE':
    case 'MIME_TYPE_NOT_ALLOWED':
      return {
        shouldRetry: false, // User must select different file
      };
    
    default:
      return {
        shouldRetry: false,
      };
  }
}

// ============================================================================
// MOBILE ERROR RESPONSE HELPER
// ============================================================================

/**
 * Create standardized error response for mobile apps
 */
export function createMobileErrorResponse(
  errorCode: Pack100ErrorCode,
  details?: any
): {
  success: false;
  error: {
    code: Pack100ErrorCode;
    message: string;
    retryStrategy: RetryStrategy;
    details?: any;
  };
} {
  return {
    success: false,
    error: {
      code: errorCode,
      message: ERROR_MESSAGES[errorCode],
      retryStrategy: getRetryStrategy(errorCode),
      details,
    },
  };
}