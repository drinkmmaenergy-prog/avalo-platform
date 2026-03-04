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
// Gen2 shim: functions.config() is unavailable in v2, return empty object
export const functionsConfig = (): Record<string, any> => {
  try {
    return functionsV1.config();
  } catch {
    return {};
  }
};

// ============================================================================
// VALIDATION (Zod)
// ============================================================================
import { z, type SafeParseSuccess, type SafeParseError } from 'zod';
export { z };

/**
 * Type guard for zod safeParse failure result.
 */
export function isZodError<T>(
  result: SafeParseSuccess<T> | SafeParseError<unknown>
): result is SafeParseError<unknown> {
  return !result.success;
}

/**
 * Type-safe assertion helper for zod safeParse results.
 * Throws HttpsError with "invalid-argument" if validation failed.
 *
 * @example
 * const parsed = assertValid(schema.safeParse(data));
 * // parsed is now fully typed as T
 */
export function assertValid<T>(
  result: SafeParseSuccess<T> | SafeParseError<unknown>
): T {
  if (!result.success) {
    // Import HttpsError lazily to avoid circular dependency
    const { HttpsError } = require('firebase-functions/v2/https');
    throw new HttpsError('invalid-argument', (result as SafeParseError<unknown>).error.message);
  }
  return result.data;
}

/**
 * Get the error message from a zod SafeParseReturnType when it's a failure.
 * Use this when you need access to the error message but can't use assertValid.
 */
export function getZodErrorMessage<T>(
  result: SafeParseSuccess<T> | SafeParseError<unknown>
): string | null {
  if (!result.success) {
    return (result as SafeParseError<unknown>).error.message;
  }
  return null;
}

// ============================================================================
// QUERY PARAM HELPERS
// ============================================================================

import type { ParsedQs } from 'qs';

/**
 * Normalize req.query params from string | string[] | ParsedQs | undefined to string.
 * Returns the first element if array, or empty string if undefined/object.
 */
export function asString(value: string | string[] | ParsedQs | (string | ParsedQs)[] | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return first;
    return '';
  }
  // ParsedQs object - return empty string
  return '';
}

/**
 * Normalize req.query params to string, with default value support.
 */
export function asStringOr(value: string | string[] | undefined, defaultValue: string): string {
  const result = asString(value);
  return result === '' ? defaultValue : result;
}

/**
 * Parse req.query param as integer with default.
 */
export function asInt(value: string | string[] | undefined, defaultValue: number): number {
  const str = asString(value);
  if (str === '') return defaultValue;
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse req.query param as float with default.
 */
export function asFloat(value: string | string[] | undefined, defaultValue: number): number {
  const str = asString(value);
  if (str === '') return defaultValue;
  const parsed = parseFloat(str);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse req.query param as boolean.
 */
export function asBool(value: string | string[] | undefined): boolean {
  return asString(value) === 'true';
}

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
// CRYPTO UTILITIES (Node 20 compatible)
// ============================================================================
import * as crypto from 'crypto';
import { HttpsError, admin, arrayRemove, arrayUnion, auth, db, functions, generateId, increment, onCall, onMessagePublished, onRequest, onSchedule, serverTimestamp, storage, timestamp } from './runtime';

export { crypto };

/**
 * Convert Buffer to Uint8Array for Node 20 crypto compatibility.
 * Node 20 tightened types for crypto functions - requires Uint8Array<ArrayBuffer>.
 */
export function toUint8Array(buffer: Buffer): Uint8Array {
  // Create a new ArrayBuffer copy to ensure we have ArrayBuffer, not SharedArrayBuffer
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const uint8Array = new Uint8Array(arrayBuffer);
  uint8Array.set(buffer);
  return uint8Array;
}

// Helper for creating hashes
export function createHash(algorithm: string = 'sha256'): crypto.Hash {
  return crypto.createHash(algorithm);
}

// Helper for creating HMAC - Node 20 compatible
export function createHmac(algorithm: string, key: string | Buffer): crypto.Hmac {
  return crypto.createHmac(algorithm, typeof key === 'string' ? key : toUint8Array(key));
}

// Helper for timing safe comparison - Node 20 compatible
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  return crypto.timingSafeEqual(toUint8Array(a), toUint8Array(b));
}

/**
 * Create cipher with Node 20 compatible types.
 * Use this helper instead of crypto.createCipheriv directly.
 */
export function createCipheriv(
  algorithm: string,
  key: Buffer,
  iv: Buffer
): crypto.Cipher | crypto.CipherGCM {
  return crypto.createCipheriv(algorithm, toUint8Array(key), toUint8Array(iv));
}

/**
 * Create decipher with Node 20 compatible types.
 * Use this helper instead of crypto.createDecipheriv directly.
 */
export function createDecipheriv(
  algorithm: string,
  key: Buffer,
  iv: Buffer
): crypto.Decipher | crypto.DecipherGCM {
  return crypto.createDecipheriv(algorithm, toUint8Array(key), toUint8Array(iv));
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
  return process.env.HMAC_SECRET || 'default-dev-secret';
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
  console.log('Scheduled job result:', { success: true, data });

  return;
}









