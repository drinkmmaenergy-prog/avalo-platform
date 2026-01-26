/**
 * Avalo Cloud Functions - Shared Runtime Module
 * Centralized exports for firebase-admin, firebase-functions, and common utilities
 *
 * This module provides a single source of truth for:
 * - Firebase Admin SDK (admin, getFirestore, db, auth, storage) - via init.ts
 * - Firebase Functions v2 (onCall, onRequest, onSchedule, HttpsError, logger)
 * - Zod validation
 * - Ethers (blockchain)
 *
 * Import from this module to ensure consistent setup across all functions.
 */

// ====================================
// Firebase Admin SDK - Re-export from init.ts (already initializes Firestore)
// ====================================
export {
  admin,
  db,
  auth,
  storage,
  FieldValue,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  timestamp,
  generateId,
} from "./init";

// Re-export getFirestore and Timestamp from firebase-admin/firestore
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from './runtime';
export { getFirestore, Timestamp };

// Additional FieldValue helper not in init.ts
import { FieldValue } from "firebase-admin/firestore";
export const deleteField = FieldValue.delete;

// ====================================
// Firebase Functions v2
// ====================================
export {
  onCall,
  onRequest,
  HttpsError,
} from "firebase-functions/v2/https";

export type {
  CallableRequest,
  CallableOptions,
} from "firebase-functions/v2/https";

export { onSchedule } from "firebase-functions/v2/scheduler";
export type { ScheduleOptions } from "firebase-functions/v2/scheduler";

export { logger } from "firebase-functions/v2";

// Firestore triggers
export {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

// PubSub triggers (for schedule)
export { onMessagePublished } from "firebase-functions/v2/pubsub";

// Storage triggers
export { onObjectFinalized, onObjectDeleted } from "firebase-functions/v2/storage";

// ====================================
// Firebase Functions v1 (for backward compatibility)
// ====================================
import * as functions from "firebase-functions";
export { functions };
export const functionsConfig = functions.config;

// ====================================
// Zod validation
// ====================================
import { z } from "zod";
export { z };

// ====================================
// Ethers (Blockchain)
// ====================================
import { ethers } from "ethers";
export { ethers };

// ====================================
// Diagnostics
// ====================================
console.log("🔧 Avalo runtime module loaded: functions v2, zod, ethers ready");
