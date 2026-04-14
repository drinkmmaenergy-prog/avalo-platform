import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

// Define secrets for Firebase Gen2 (Cloud Run injection)
export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// 🔴 KLUCZOWE — WYMUSZENIE REGIONU + SECRETS
// Secrets declared here are injected by Cloud Run into process.env
// at container boot time. Without this, startupValidator fails in production.
setGlobalOptions({
  region: "europe-west1",
  secrets: [stripeSecretKey, stripeWebhookSecret],
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
// Gen2 shim: functions.config() is unavailable in v2, return empty object
export const functionsConfig = (): Record<string, any> => {
  try {
    return functions.config();
  } catch {
    return {};
  }
};

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


























