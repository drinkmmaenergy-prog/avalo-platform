/**
 * Firebase Admin Initialization
 * Single source of truth for Firestore, Auth, and Storage instances
 */

import * as admin from "firebase-admin";
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp();
}

// Firestore instance (with modern API)
export const db = getFirestore();

// Auth & Storage
export const auth = admin.auth();
export const storage = admin.storage();

// Firestore global settings
db.settings({
  ignoreUndefinedProperties: true,
});

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


