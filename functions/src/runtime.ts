/**
 * Avalo Cloud Functions - Shared Runtime Module
 * Centralized exports for firebase-admin, firebase-functions, and common utilities
 */

import { setGlobalOptions } from "firebase-functions/v2";

// 🔴 KLUCZOWE — WYMUSZENIE REGIONU
setGlobalOptions({
  region: "europe-west1",
  maxInstances: 3,
});

// ====================================
// Firebase Admin SDK
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

import { getFirestore, Timestamp } from "firebase-admin/firestore";
export { getFirestore, Timestamp };

import { FieldValue as FirestoreFieldValue } from "firebase-admin/firestore";
export const deleteField = FirestoreFieldValue.delete;

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

export {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

export { onMessagePublished } from "firebase-functions/v2/pubsub";

export {
  onObjectFinalized,
  onObjectDeleted,
} from "firebase-functions/v2/storage";

// ====================================
// Firebase Functions v1 (legacy)
// ====================================
import * as functions from "firebase-functions";
export { functions };
export const functionsConfig = functions.config;

// ====================================
// Zod
// ====================================
import { z } from "zod";
export { z };

// ====================================
// Ethers
// ====================================
import { ethers } from "ethers";
export { ethers };

console.log("🔧 Avalo runtime module loaded (REGION europe-west1 enforced)");
