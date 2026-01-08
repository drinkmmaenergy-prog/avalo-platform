/**
 * PACK 317 — Privacy & Logging Sanity Checks
 * 
 * Ensures no PII leaks into logs or error messages:
 * - Sanitizes log details before writing
 * - Strips emails, phones, card data, messages
 * - Hashes sensitive identifiers
 * 
 * CRITICAL: All logging must go through sanitization
 */

import { logTechEvent } from './pack90-logging';

// ============================================================================
// SENSITIVE FIELD PATTERNS
// ============================================================================

const SENSITIVE_KEYS = [
  'email',
  'phone',
  'phoneNumber',
  'card',
  'cardNumber',
  'cvv',
  'cvc',
  'ssn',
  'password',
  'token',
  'apiKey',
  'secret',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'messageText',
  'chatMessage',
  'imageUrl',
  'videoUrl',
  'mediaUrl',
  'address',
  'streetAddress',
  'postalCode',
  'zipCode',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const CARD_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitize log details to remove PII
 */
export function sanitizeLogDetails(details: Record<string, any>): Record<string, any> {
  if (!details || typeof details !== 'object') {
    return details;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();

    // Check if key is sensitive
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = maskSensitiveValue(key, value);
      continue;
    }

    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogDetails(value);
      continue;
    }

    // Recursively sanitize arrays
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null ? sanitizeLogDetails(item) : item
      );
      continue;
    }

    // For strings, check for PII patterns
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
      continue;
    }

    // Safe values pass through
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Mask sensitive value based on key type
 */
function maskSensitiveValue(key: string, value: any): string {
  if (value === null || value === undefined) {
    return '[NULL]';
  }

  const lowerKey = key.toLowerCase();

  // Email: show first 3 chars + domain
  if (lowerKey.includes('email')) {
    const str = String(value);
    const parts = str.split('@');
    if (parts.length === 2) {
      return `${parts[0].substring(0, 3)}***@${parts[1]}`;
    }
    return '[EMAIL_REDACTED]';
  }

  // Phone: show last 4 digits
  if (lowerKey.includes('phone')) {
    const str = String(value).replace(/\D/g, '');
    if (str.length >= 4) {
      return `***${str.slice(-4)}`;
    }
    return '[PHONE_REDACTED]';
  }

  // Card: show last 4 digits
  if (lowerKey.includes('card')) {
    const str = String(value).replace(/\D/g, '');
    if (str.length >= 4) {
      return `****-****-****-${str.slice(-4)}`;
    }
    return '[CARD_REDACTED]';
  }

  // Message/media: truncate
  if (lowerKey.includes('message') || lowerKey.includes('text')) {
    return '[MESSAGE_REDACTED]';
  }

  if (lowerKey.includes('url') || lowerKey.includes('image') || lowerKey.includes('video')) {
    return '[MEDIA_URL_REDACTED]';
  }

  // Default: completely redact
  return '[REDACTED]';
}

/**
 * Sanitize string by removing PII patterns
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }

  let sanitized = str;

  // Remove emails
  sanitized = sanitized.replace(EMAIL_REGEX, '[EMAIL]');

  // Remove phone numbers
  sanitized = sanitized.replace(PHONE_REGEX, '[PHONE]');

  // Remove card numbers
  sanitized = sanitized.replace(CARD_REGEX, '[CARD]');

  // Truncate long strings (potential message content)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '... [TRUNCATED]';
  }

  return sanitized;
}

// ============================================================================
// SAFE LOGGING WRAPPER
// ============================================================================

/**
 * Safe logging wrapper that auto-sanitizes
 */
export async function logSafeTechEvent(params: {
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'FUNCTION' | 'JOB' | 'SERVICE' | 'SECURITY';
  functionName: string;
  message: string;
  context?: Record<string, any>;
}): Promise<void> {
  try {
    const sanitizedContext = params.context 
      ? sanitizeLogDetails(params.context)
      : undefined;

    await logTechEvent({
      ...params,
      context: sanitizedContext,
    });
  } catch (error) {
    console.error('[Pack317] Failed to log safe event:', error);
    // Fallback to console
    console.log(`[Safe Log] ${params.level} - ${params.functionName}: ${params.message}`);
  }
}

// ============================================================================
// VALIDATION & TESTING
// ============================================================================

/**
 * Test sanitization (for debugging)
 */
export function testSanitization(): void {
  const testData = {
    email: 'user@example.com',
    phone: '+1-234-567-8900',
    card: '4532-1234-5678-9010',
    messageText: 'Hello, my email is test@gmail.com and phone is 555-1234',
    normalField: 'This is safe',
    nested: {
      password: 'secret123',
      apiKey: 'sk_live_123456789',
    },
  };

  const sanitized = sanitizeLogDetails(testData);
  console.log('Sanitization Test Results:', JSON.stringify(sanitized, null, 2));
}

// ============================================================================
// REGRESSION TEST FOR LOGS
// ============================================================================

/**
 * Validate that log entry doesn't contain PII
 */
export function validateLogSafety(logEntry: any): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const logStr = JSON.stringify(logEntry).toLowerCase();

  // Check for email patterns
  if (EMAIL_REGEX.test(logStr)) {
    violations.push('EMAIL_PATTERN_DETECTED');
  }

  // Check for phone patterns
  if (PHONE_REGEX.test(logStr)) {
    violations.push('PHONE_PATTERN_DETECTED');
  }

  // Check for card patterns
  if (CARD_REGEX.test(logStr)) {
    violations.push('CARD_PATTERN_DETECTED');
  }

  // Check for common sensitive keys in raw form
  const dangerousKeys = ['password', 'apikey', 'secret', 'token'];
  for (const key of dangerousKeys) {
    if (logStr.includes(`"${key}":`)) {
      violations.push(`SENSITIVE_KEY_DETECTED: ${key}`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}