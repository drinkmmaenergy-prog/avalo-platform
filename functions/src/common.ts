/**
 * Common Imports & Utilities
 * Centralized exports to prevent import errors across the codebase
 */

// ============================================================================
// FIREBASE ADMIN (from init.ts)
// ============================================================================
export {
  db,
  auth,
  storage,
  admin,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  timestamp,
  generateId,
} from './init';

// ============================================================================
// FIREBASE FUNCTIONS V2
// ============================================================================
import * as functionsV2 from 'firebase-functions/v2';
export { functionsV2 as functions };

// Export commonly used v2 functions
export { onCall, HttpsError } from 'firebase-functions/v2/https';
export { onSchedule } from 'firebase-functions/v2/scheduler';
export { onMessagePublished } from 'firebase-functions/v2/pubsub';
export { onRequest } from 'firebase-functions/v2/https';

// Re-export legacy functions for compatibility
import * as functionsV1 from 'firebase-functions';
export const logger = functionsV1.logger;
export const functionsConfig = functionsV1.config;

// ============================================================================
// VALIDATION (Zod)
// ============================================================================
export { z } from 'zod';

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

export { getFirestore, getAuth, getStorage };

// ============================================================================
// HTTP CLIENT
// ============================================================================
export { default as axios } from 'axios';

// ============================================================================
// FEATURE FLAGS & CONFIG
// ============================================================================

/**
 * Get feature flag value
 */
export async function getFeatureFlag(
  flagName: string,
  defaultValue: boolean = false
): Promise<boolean> {
  try {
    const { db } = await import('./init');
    const flagDoc = await db.collection('feature_flags').doc(flagName).get();
    
    if (!flagDoc.exists) {
      return defaultValue;
    }
    
    const data = flagDoc.data();
    return data?.enabled ?? defaultValue;
  } catch (error) {
    logger.error(`Error fetching feature flag ${flagName}:`, error);
    return defaultValue;
  }
}

// ============================================================================
// CRYPTO UTILITIES
// ============================================================================
import * as crypto from 'crypto';

export { crypto };

// Helper for creating hashes
export function createHash(algorithm: string = 'sha256'): crypto.Hash {
  return crypto.createHash(algorithm);
}

// Helper for creating HMAC
export function createHmac(algorithm: string, key: string | Buffer): crypto.Hmac {
  return crypto.createHmac(algorithm, key);
}

// Helper for timing safe comparison
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  return crypto.timingSafeEqual(a, b);
}

// ============================================================================
// SENDGRID (if available)
// ============================================================================
let sgMailInstance: any = null;

try {
  const sendgrid = require('@sendgrid/mail');
  sgMailInstance = sendgrid;
} catch {
  // SendGrid not available, that's okay
}

export const sgMail = sgMailInstance;

// ============================================================================
// ETHERS (if available)
// ============================================================================
let ethersLib: any = null;

try {
  ethersLib = require('ethers');
} catch {
  // Ethers not available, that's okay
}

export const ethers = ethersLib;

// ============================================================================
// HMAC SECRET HELPER
// ============================================================================
export function getHmacSecret(): string {
  return functionsConfig().hmac?.secret || process.env.HMAC_SECRET || 'default-dev-secret';
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any
): ErrorResponse {
  return { code, message, details };
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}