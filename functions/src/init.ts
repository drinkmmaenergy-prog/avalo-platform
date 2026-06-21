import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * Firebase Admin Initialization
 * Single source of truth for Firestore, Auth, and Storage instances
 *
 * PACK 4.1 PRODUCTION HARDENING:
 * - Cold-start startup validation
 * - Environment sanity checks
 */

import * as admin from "firebase-admin";
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp();
}

// PACK 4.1: Run startup validation at cold start (after admin init)
// Import dynamically to avoid circular dependencies
import { initStartupValidation } from './config/startupValidator';
try {
  initStartupValidation();
} catch (validationError: any) {
  // In production, this will throw and prevent partial boot
  // In development, it will log but continue
  console.error('[INIT] Startup validation failed:', validationError.message);
  // Lazy env read: only check NODE_ENV when needed, not at module scope
  const nodeEnv = process.env.NODE_ENV || 'production';
  if (nodeEnv === 'production' && !!process.env.K_SERVICE) {
    // Only hard-fail inside Cloud Run (Gen2) production runtime
    throw validationError;
  }
}

// Firestore instance (with modern API)
export const db = getFirestore();

// Auth & Storage
export const auth = admin.auth();
export const storage = admin.storage();

// Firestore global settings
if(!global.__firestore_settings){try { if (!(globalThis as any).__AVALO_FS_SETTINGS_APPLIED) {
  try {
    db.settings({ ignoreUndefinedProperties: true })
  } catch (e) {}
  ;(globalThis as any).__AVALO_FS_SETTINGS_APPLIED = true
} } catch(e) {}global.__firestore_settings=true};

// Re-export admin for custom operations (tokens, messaging, etc.)
export { admin };

// Re-export FieldValue for use in other modules
export { FieldValue };

// --------------------------
// 🔧 Helper utilities
// --------------------------

// FieldValue helpers
export const serverTimestamp = FieldValue.serverTimestamp;
export const increment = FieldValue.increment;
export const arrayUnion = FieldValue.arrayUnion;
export const arrayRemove = FieldValue.arrayRemove;

// Timestamp helper (optional explicit export)
export const timestamp = Timestamp;

// Helper to generate unique document IDs
export const generateId = (): string => db.collection("_").doc().id;

// --------------------------
// ✅ Diagnostics log
// --------------------------
console.log("🔥 Firebase Admin initialized successfully with Firestore, Auth, and Storage.");






























