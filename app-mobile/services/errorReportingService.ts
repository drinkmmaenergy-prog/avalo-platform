/**
 * PACK 69 - Mobile Error Reporting Service
 * 
 * Captures and reports client-side errors to backend
 * Privacy-safe, with deduplication
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ============================================================================
// TYPES
// ============================================================================

export interface MobileErrorReportParams {
  userId?: string;
  platform: 'android' | 'ios';
  appVersion: string;
  screen?: string;
  errorMessage: string;
  errorName?: string;
  stack?: string;
  severity?: 'ERROR' | 'CRITICAL';
  extra?: {
    locale?: string;
    networkType?: string;
    isForeground?: boolean;
  };
}

interface ErrorCache {
  hash: string;
  timestamp: number;
  count: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ERROR_REPORT_ENDPOINT = 'https://europe-west3-avalo-c8c46.cloudfunctions.net/mobileErrorReport';
const CACHE_KEY = '@avalo/error_cache';
const DUPLICATE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

// ============================================================================
// ERROR HASH GENERATION
// ============================================================================

/**
 * Generate a simple hash for error deduplication
 */
function generateErrorHash(errorMessage: string, screen?: string): string {
  const combined = `${screen || 'unknown'}:${errorMessage.substring(0, 100)}`;
  let hash = 0;
  
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

// ============================================================================
// ERROR CACHE MANAGEMENT
// ============================================================================

/**
 * Load error cache from AsyncStorage
 */
async function loadErrorCache(): Promise<Map<string, ErrorCache>> {
  try {
    const cacheJson = await AsyncStorage.getItem(CACHE_KEY);
    if (!cacheJson) return new Map();
    
    const cacheArray = JSON.parse(cacheJson) as [string, ErrorCache][];
    return new Map(cacheArray);
  } catch (error) {
    console.error('Failed to load error cache:', error);
    return new Map();
  }
}

/**
 * Save error cache to AsyncStorage
 */
async function saveErrorCache(cache: Map<string, ErrorCache>): Promise<void> {
  try {
    // Keep only last MAX_CACHE_SIZE entries
    const entries = Array.from(cache.entries());
    if (entries.length > MAX_CACHE_SIZE) {
      const sorted = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      cache = new Map(sorted.slice(0, MAX_CACHE_SIZE));
    }
    
    const cacheArray = Array.from(cache.entries());
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheArray));
  } catch (error) {
    console.error('Failed to save error cache:', error);
  }
}

/**
 * Check if error is a duplicate (within threshold)
 */
async function isDuplicate(hash: string): Promise<boolean> {
  const cache = await loadErrorCache();
  const cached = cache.get(hash);
  
  if (!cached) return false;
  
  const now = Date.now();
  const timeSinceLastReport = now - cached.timestamp;
  
  return timeSinceLastReport < DUPLICATE_THRESHOLD_MS;
}

/**
 * Update error cache with new report
 */
async function updateErrorCache(hash: string): Promise<void> {
  const cache = await loadErrorCache();
  const existing = cache.get(hash);
  
  cache.set(hash, {
    hash,
    timestamp: Date.now(),
    count: (existing?.count || 0) + 1,
  });
  
  await saveErrorCache(cache);
}

// ============================================================================
// ERROR REPORTING
// ============================================================================

/**
 * Report an error to the backend
 * Includes deduplication to avoid spam
 */
export async function reportMobileError(
  params: MobileErrorReportParams
): Promise<void> {
  try {
    // Generate hash for deduplication
    const hash = generateErrorHash(params.errorMessage, params.screen);
    
    // Check if this is a duplicate recent error
    const duplicate = await isDuplicate(hash);
    if (duplicate) {
      console.log('Skipping duplicate error report:', params.errorMessage.substring(0, 50));
      return;
    }
    
    // Sanitize error message (remove sensitive data)
    const sanitizedMessage = sanitizeErrorMessage(params.errorMessage);
    const sanitizedStack = params.stack ? sanitizeStackTrace(params.stack) : undefined;
    
    // Prepare request body
    const body: MobileErrorReportParams = {
      userId: params.userId,
      platform: params.platform,
      appVersion: params.appVersion,
      screen: params.screen,
      errorMessage: sanitizedMessage,
      errorName: params.errorName,
      stack: sanitizedStack,
      severity: params.severity || 'ERROR',
      extra: params.extra,
    };
    
    // Send to backend
    const response = await fetch(ERROR_REPORT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (response.ok) {
      // Update cache to track this error
      await updateErrorCache(hash);
      console.log('✅ Error reported successfully');
    } else {
      console.error('Failed to report error:', response.status);
    }
  } catch (error) {
    // Don't let error reporting fail the app
    console.error('Error reporting service failed:', error);
  }
}

/**
 * Report error with automatic platform detection
 */
export async function reportError(
  error: Error,
  screen?: string,
  userId?: string,
  severity?: 'ERROR' | 'CRITICAL',
  extra?: {
    locale?: string;
    networkType?: string;
    isForeground?: boolean;
  }
): Promise<void> {
  await reportMobileError({
    userId,
    platform: Platform.OS as 'android' | 'ios',
    appVersion: Constants.expoConfig?.version || '0.0.0',
    screen,
    errorMessage: error.message,
    errorName: error.name,
    stack: error.stack,
    severity: severity || 'ERROR',
    extra,
  });
}

/**
 * Report network error
 */
export async function reportNetworkError(
  endpoint: string,
  statusCode: number,
  userId?: string,
  screen?: string
): Promise<void> {
  await reportMobileError({
    userId,
    platform: Platform.OS as 'android' | 'ios',
    appVersion: Constants.expoConfig?.version || '0.0.0',
    screen,
    errorMessage: `Network error: ${endpoint} returned ${statusCode}`,
    errorName: 'NetworkError',
    severity: statusCode >= 500 ? 'CRITICAL' : 'ERROR',
    extra: {
      isForeground: true,
    },
  });
}

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitize error message to remove sensitive data
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  
  // Remove potential URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');
  
  // Remove email addresses
  sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
  
  // Remove potential tokens (long hex strings)
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{32,}\b/g, '[TOKEN]');
  
  // Remove phone numbers
  sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  // Truncate to reasonable length
  return sanitized.substring(0, 500);
}

/**
 * Sanitize stack trace
 */
function sanitizeStackTrace(stack: string): string {
  let sanitized = stack;
  
  // Remove file paths (keep only filename)
  sanitized = sanitized.replace(/\/[\w\/.-]+\//g, '');
  
  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');
  
  // Take only first 20 lines
  const lines = sanitized.split('\n').slice(0, 20);
  
  return lines.join('\n').substring(0, 2000);
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Clear error cache (for testing/debugging)
 */
export async function clearErrorCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    console.log('Error cache cleared');
  } catch (error) {
    console.error('Failed to clear error cache:', error);
  }
}

/**
 * Get error cache stats (for debugging)
 */
export async function getErrorCacheStats(): Promise<{
  totalErrors: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}> {
  const cache = await loadErrorCache();
  const entries = Array.from(cache.values());
  
  return {
    totalErrors: entries.length,
    oldestTimestamp: entries.length > 0 
      ? Math.min(...entries.map(e => e.timestamp))
      : null,
    newestTimestamp: entries.length > 0
      ? Math.max(...entries.map(e => e.timestamp))
      : null,
  };
}