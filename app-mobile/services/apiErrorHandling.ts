/**
 * PACK 70 - API Error Handling
 * 
 * Unified error handling for API responses, including rate limiting
 */

interface ApiError {
  code?: string;
  message?: string;
  error?: string;
  action?: string;
  details?: any;
}

/**
 * Check if error is a rate limit error
 */
export function isRateLimitedError(error: any): boolean {
  if (!error) return false;

  // Check for rate limit error code
  if (error.code === 'RATE_LIMITED') return true;
  if (error.error === 'RATE_LIMITED') return true;

  // Check for HTTP 429 status
  if (error.httpStatus === 429) return true;
  if (error.status === 429) return true;

  // Check message content
  const message = error.message?.toLowerCase() || '';
  if (message.includes('rate limit') || 
      message.includes('too many') ||
      message.includes('slow down')) {
    return true;
  }

  return false;
}

/**
 * Get user-friendly rate limit message based on error and i18n
 */
export function getRateLimitMessage(error: any, i18n: any): string {
  // Try to get specific message from error
  const errorMessage = error.message || error.details?.message;

  // Determine specific rate limit type from error
  if (errorMessage) {
    const msg = errorMessage.toLowerCase();
    
    if (msg.includes('chat') || msg.includes('message')) {
      return i18n.t('error.rateLimited.chat');
    }
    if (msg.includes('support') || msg.includes('ticket')) {
      return i18n.t('error.rateLimited.support');
    }
    if (msg.includes('auth') || msg.includes('login') || msg.includes('signup')) {
      return i18n.t('error.rateLimited.auth');
    }
  }

  // Default generic message
  return i18n.t('error.rateLimited.generic');
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;

  // Check for network-related error codes
  if (error.code === 'NETWORK_ERROR') return true;
  if (error.message?.includes('Network')) return true;
  if (error.message?.includes('fetch')) return true;

  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: any): boolean {
  if (!error) return false;

  if (error.code === 'unauthenticated') return true;
  if (error.code === 'permission-denied') return true;
  if (error.httpStatus === 401 || error.httpStatus === 403) return true;

  return false;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: any, i18n: any): string {
  if (!error) return i18n.t('error.unknown');

  // Check specific error types
  if (isRateLimitedError(error)) {
    return getRateLimitMessage(error, i18n);
  }

  if (isNetworkError(error)) {
    return i18n.t('error.network');
  }

  if (isAuthError(error)) {
    return i18n.t('error.authentication');
  }

  // Return error message if available
  if (error.message) {
    return error.message;
  }

  // Fallback to generic error
  return i18n.t('error.generic');
}

/**
 * Handle API error and show appropriate UI feedback
 */
export function handleApiError(error: any, i18n: any, options?: {
  showToast?: (message: string) => void;
  showBanner?: (message: string) => void;
  onRateLimit?: () => void;
  onAuthError?: () => void;
}): void {
  const message = getErrorMessage(error, i18n);

  // Handle rate limit errors
  if (isRateLimitedError(error)) {
    if (options?.onRateLimit) {
      options.onRateLimit();
    } else if (options?.showBanner) {
      options.showBanner(message);
    } else if (options?.showToast) {
      options.showToast(message);
    }
    return;
  }

  // Handle auth errors
  if (isAuthError(error)) {
    if (options?.onAuthError) {
      options.onAuthError();
    } else if (options?.showToast) {
      options.showToast(message);
    }
    return;
  }

  // Default error handling
  if (options?.showToast) {
    options.showToast(message);
  }
}

/**
 * Retry helper for rate-limited operations
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries || 3;
  const initialDelay = options?.initialDelay || 1000;
  const maxDelay = options?.maxDelay || 10000;
  const backoffMultiplier = options?.backoffMultiplier || 2;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry if not a rate limit error
      if (!isRateLimitedError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next attempt
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

export default {
  isRateLimitedError,
  getRateLimitMessage,
  isNetworkError,
  isAuthError,
  getErrorMessage,
  handleApiError,
  retryWithBackoff
};