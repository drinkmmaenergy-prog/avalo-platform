/**
 * PACK 69 - Observability, Error Monitoring & Health Dashboard
 * 
 * Core logging and error tracking infrastructure
 * Privacy-safe, no sensitive data logging
 */

import { db, serverTimestamp, generateId } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type LogSource = "BACKEND" | "MOBILE" | "WEB";
export type Environment = "PROD" | "STAGE" | "OTHER";

export interface LogInput {
  level: LogLevel;
  source: LogSource;
  service: string;
  module?: string;
  message: string;
  environment?: Environment;
  context?: {
    functionName?: string;
    route?: string;
    userId?: string;
    errorCode?: string;
    httpStatus?: number;
    platform?: "android" | "ios" | "web";
    appVersion?: string;
  };
  details?: {
    stackSnippet?: string;
    extra?: any;
  };
}

export interface SystemLog {
  logId: string;
  timestamp: Timestamp;
  source: LogSource;
  environment: Environment;
  level: LogLevel;
  service: string;
  module?: string;
  message: string;
  context?: {
    functionName?: string;
    route?: string;
    userId?: string;
    errorCode?: string;
    httpStatus?: number;
    platform?: "android" | "ios" | "web";
    appVersion?: string;
  };
  details?: {
    stackSnippet?: string;
    extra?: any;
  };
  createdAt: Timestamp;
}

// ============================================================================
// SANITIZATION
// ============================================================================

const SENSITIVE_KEYS = [
  'password', 'pwd', 'passwd',
  'card', 'cardNumber', 'cvv', 'cvc',
  'iban', 'accountNumber',
  'token', 'accessToken', 'refreshToken', 'authToken',
  'secret', 'apiKey', 'privateKey',
  'ssn', 'socialSecurity',
  'pin', 'otp',
  'authorization'
];

/**
 * Sanitize message and stack to prevent sensitive data leakage
 */
function sanitizeString(input: string | undefined, maxLength: number = 2000): string {
  if (!input) return '';
  
  let sanitized = input.substring(0, maxLength);
  
  // Remove potential URLs with auth tokens
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL_REDACTED]');
  
  // Remove email-like patterns
  sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REDACTED]');
  
  // Remove long hex strings (potential tokens)
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{32,}\b/g, '[TOKEN_REDACTED]');
  
  return sanitized;
}

/**
 * Recursively sanitize an object by removing sensitive keys
 */
function sanitizeObject(obj: any, depth: number = 0): any {
  if (depth > 5) return '[MAX_DEPTH]'; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj, 500);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map(item => sanitizeObject(item, depth + 1));
  }
  
  const sanitized: any = {};
  const keys = Object.keys(obj).slice(0, 50); // Limit object size
  
  for (const key of keys) {
    // Check if key is sensitive
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    sanitized[key] = sanitizeObject(obj[key], depth + 1);
  }
  
  return sanitized;
}

// ============================================================================
// LOG WRITER
// ============================================================================

/**
 * Write a log event to Firestore
 * All logs go to system_logs collection
 */
export async function logEvent(input: LogInput): Promise<void> {
  try {
    const logId = generateId();
    
    // Sanitize message and stack
    const message = sanitizeString(input.message, 500);
    const stackSnippet = input.details?.stackSnippet 
      ? sanitizeString(input.details.stackSnippet, 1000)
      : undefined;
    
    // Sanitize extra details
    const extra = input.details?.extra 
      ? sanitizeObject(input.details.extra)
      : undefined;
    
    const logEntry: SystemLog = {
      logId,
      timestamp: Timestamp.now(),
      source: input.source,
      environment: input.environment || 'PROD',
      level: input.level,
      service: input.service,
      module: input.module,
      message,
      context: input.context ? {
        functionName: input.context.functionName,
        route: input.context.route,
        userId: input.context.userId,
        errorCode: input.context.errorCode,
        httpStatus: input.context.httpStatus,
        platform: input.context.platform,
        appVersion: input.context.appVersion,
      } : undefined,
      details: (stackSnippet || extra) ? {
        stackSnippet,
        extra,
      } : undefined,
      createdAt: serverTimestamp() as any,
    };
    
    await db.collection('system_logs').doc(logId).set(logEntry);
    
    // For CRITICAL errors, log to console as well
    if (input.level === 'CRITICAL') {
      console.error(`🚨 CRITICAL: [${input.service}] ${message}`);
    }
  } catch (error) {
    // Fallback to console if Firestore write fails
    console.error('Failed to write log to Firestore:', error);
    console.error('Original log:', input.service, input.message);
  }
}

// ============================================================================
// ERROR WRAPPER
// ============================================================================

/**
 * Wrap a function with automatic error logging
 * Catches errors, logs them, then rethrows
 * 
 * Usage:
 * ```
 * return withErrorLogging("functions.payouts", "PAYOUTS", async () => {
 *   // your function logic
 * });
 * ```
 */
export async function withErrorLogging<T>(
  service: string,
  module: string,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler();
  } catch (error: any) {
    // Log the error
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service,
      module,
      message: error.message || 'Unknown error occurred',
      context: {
        errorCode: error.code,
        httpStatus: error.httpStatus,
      },
      details: {
        stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n'),
        extra: {
          name: error.name,
          code: error.code,
        },
      },
    });
    
    // Rethrow the original error
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR COMMON OPERATIONS
// ============================================================================

/**
 * Log a payout failure
 */
export async function logPayoutFailure(
  userId: string,
  payoutRequestId: string,
  reason: string,
  details?: any
): Promise<void> {
  await logEvent({
    level: 'ERROR',
    source: 'BACKEND',
    service: 'functions.payouts',
    module: 'PAYOUTS',
    message: `Payout failed: ${reason}`,
    context: {
      userId,
      functionName: 'processPayoutRequest',
    },
    details: {
      extra: {
        payoutRequestId,
        reason,
        ...sanitizeObject(details),
      },
    },
  });
}

/**
 * Log a reservation error
 */
export async function logReservationError(
  userId: string,
  reservationId: string,
  operation: string,
  error: Error
): Promise<void> {
  await logEvent({
    level: 'ERROR',
    source: 'BACKEND',
    service: 'functions.reservations',
    module: 'RESERVATIONS',
    message: `Reservation ${operation} failed: ${error.message}`,
    context: {
      userId,
      functionName: operation,
    },
    details: {
      stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n'),
      extra: {
        reservationId,
        operation,
      },
    },
  });
}

/**
 * Log a payment failure
 */
export async function logPaymentFailure(
  userId: string,
  amount: number,
  paymentMethod: string,
  reason: string
): Promise<void> {
  await logEvent({
    level: 'ERROR',
    source: 'BACKEND',
    service: 'functions.payments',
    module: 'PAYMENTS',
    message: `Payment failed: ${reason}`,
    context: {
      userId,
      functionName: 'processPayment',
    },
    details: {
      extra: {
        amount,
        paymentMethod,
        reason,
      },
    },
  });
}

/**
 * Log an auth error
 */
export async function logAuthError(
  operation: string,
  error: Error,
  userId?: string
): Promise<void> {
  await logEvent({
    level: 'WARN',
    source: 'BACKEND',
    service: 'functions.auth',
    module: 'AUTH',
    message: `Auth ${operation} failed: ${error.message}`,
    context: {
      userId,
      functionName: operation,
    },
    details: {
      stackSnippet: error.stack?.split('\n').slice(0, 5).join('\n'),
    },
  });
}

/**
 * Log a general operational event (INFO level)
 */
export async function logOperationalEvent(
  service: string,
  module: string,
  message: string,
  context?: any
): Promise<void> {
  await logEvent({
    level: 'INFO',
    source: 'BACKEND',
    service,
    module,
    message,
    details: {
      extra: sanitizeObject(context),
    },
  });
}