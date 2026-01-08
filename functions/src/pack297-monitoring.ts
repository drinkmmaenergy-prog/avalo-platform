/**
 * PACK 297 - Monitoring & Logging Utilities
 * 
 * Unified logging interface for error tracking and monitoring
 */

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  environment?: 'STAGING' | 'PRODUCTION';
  [key: string]: any;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * Unified logging interface
 */
export function logError(error: unknown, context?: LogContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const logEntry = {
    level: 'error' as LogLevel,
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    ...context
  };
  
  // Console log (always)
  console.error('[ERROR]', JSON.stringify(logEntry, null, 2));
  
  // Send to Sentry if configured
  if (process.env.SENTRY_DSN) {
    sendToSentry(logEntry, error);
  }
}

/**
 * Log info message
 */
export function logInfo(message: string, context?: LogContext): void {
  const logEntry = {
    level: 'info' as LogLevel,
    message,
    timestamp: new Date().toISOString(),
    ...context
  };
  
  // Console log based on environment
  const environment = context?.environment || process.env.FUNCTION_ENV;
  if (environment === 'STAGING' || process.env.LOG_LEVEL === 'debug') {
    console.log('[INFO]', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Log warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  const logEntry = {
    level: 'warn' as LogLevel,
    message,
    timestamp: new Date().toISOString(),
    ...context
  };
  
  console.warn('[WARN]', JSON.stringify(logEntry, null, 2));
  
  // Send to monitoring if configured
  if (process.env.SENTRY_DSN) {
    sendToSentry(logEntry);
  }
}

/**
 * Log critical message (requires immediate attention)
 */
export function logCritical(message: string, context?: LogContext): void {
  const logEntry = {
    level: 'critical' as LogLevel,
    message,
    timestamp: new Date().toISOString(),
    ...context
  };
  
  console.error('[CRITICAL]', JSON.stringify(logEntry, null, 2));
  
  // Always send to monitoring
  if (process.env.SENTRY_DSN) {
    sendToSentry(logEntry);
  }
  
  // Could trigger alerts here (e.g., PagerDuty, Slack)
}

/**
 * Log debug message
 */
export function logDebug(message: string, context?: LogContext): void {
  const environment = context?.environment || process.env.FUNCTION_ENV;
  
  // Only log debug in staging or when LOG_LEVEL=debug
  if (environment === 'STAGING' || process.env.LOG_LEVEL === 'debug') {
    const logEntry = {
      level: 'debug' as LogLevel,
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    
    console.log('[DEBUG]', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Send log entry to Sentry (stub implementation)
 */
function sendToSentry(logEntry: any, error?: unknown): void {
  // Stub implementation - integrate with actual Sentry SDK when available
  // This would use @sentry/node package
  
  if (!process.env.SENTRY_DSN) {
    return;
  }
  
  try {
    // Placeholder for Sentry integration
    // In production, this would use Sentry.captureException() or Sentry.captureMessage()
    console.log('[SENTRY]', 'Would send to Sentry:', logEntry);
  } catch (err) {
    console.error('Failed to send to Sentry:', err);
  }
}

/**
 * Create request context for logging
 */
export function createRequestContext(req: any): LogContext {
  return {
    requestId: req.headers['x-request-id'] || generateRequestId(),
    userId: req.auth?.uid,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.headers['x-forwarded-for'],
    method: req.method,
    path: req.path,
    environment: process.env.FUNCTION_ENV === 'staging' ? 'STAGING' : 'PRODUCTION'
  };
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Wrap async function with error logging
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  fnName: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, {
        function: fnName,
        args: JSON.stringify(args)
      });
      throw error;
    }
  }) as T;
}

/**
 * Performance monitoring wrapper
 */
export async function withPerformanceMonitoring<T>(
  operationName: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    if (duration > 1000) {
      // Log slow operations
      logWarn(`Slow operation: ${operationName}`, {
        ...context,
        duration: `${duration}ms`,
        operation: operationName
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, {
      ...context,
      duration: `${duration}ms`,
      operation: operationName
    });
    throw error;
  }
}