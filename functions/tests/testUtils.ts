/**
 * Test Utilities
 * Common helpers for all tests
 */

;
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin for tests
let adminInitialized = false;

export function initializeFirebaseAdmin() {
  if (!adminInitialized) {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

    // Import and initialize admin
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: "demo-avalo-test",
      });
    }

    adminInitialized = true;
  }
}

// Get Firestore instance
export function getDb() {
  initializeFirebaseAdmin();
  const admin = require("firebase-admin");
  return admin.firestore();
}

// Get Auth instance
export function getAuth() {
  initializeFirebaseAdmin();
  const admin = require("firebase-admin");
  return admin.auth();
}

// Test data generators
export const testData = {
  generateUserId: () => `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

  generateEmail: (prefix: string) => `${prefix}_${Date.now()}@test.avalo.app`,

  generateUser: (overrides?: any) => ({
    uid: testData.generateUserId(),
    email: testData.generateEmail("user"),
    displayName: "Test User",
    verified: false,
    tokens: 0,
    createdAt: Timestamp.now(),
    ...overrides,
  }),

  generateTransaction: (userId: string, amount: number, type: string, overrides?: any) => ({
    transactionId: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    amount,
    type,
    balanceBefore: 0,
    balanceAfter: amount,
    createdAt: Timestamp.now(),
    status: "completed",
    ...overrides,
  }),

  generateChat: (user1Id: string, user2Id: string, overrides?: any) => ({
    chatId: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    participants: [user1Id, user2Id],
    escrow: 0,
    totalSpent: 0,
    createdAt: Timestamp.now(),
    lastMessageAt: Timestamp.now(),
    ...overrides,
  }),

  generatePost: (userId: string, content: string, overrides?: any) => ({
    postId: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    content,
    createdAt: Timestamp.now(),
    ...overrides,
  }),
};

// Helper to clear Firestore collection
export async function clearCollection(collectionName: string) {
  const db = getDb();
  const snapshot = await db.collection(collectionName).limit(500).get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

// Helper to wait for async operations
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create user in Firestore
export async function createTestUser(userId: string, data?: any) {
  const db = getDb();
  const userData = {
    uid: userId,
    email: `${userId}@test.com`,
    displayName: "Test User",
    tokens: 0,
    verification: { status: "pending" },
    createdAt: Timestamp.now(),
    ...data,
  };

  await db.collection("users").doc(userId).set(userData);
  return userData;
}

// Helper to create transaction
export async function createTestTransaction(userId: string, amount: number, type: string, metadata?: any) {
  const db = getDb();
  const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Get current balance
  const userDoc = await db.collection("users").doc(userId).get();
  const currentBalance = userDoc.data()?.tokens || 0;

  const txData = {
    transactionId: txId,
    userId,
    amount,
    type,
    balanceBefore: currentBalance,
    balanceAfter: currentBalance + amount,
    createdAt: Timestamp.now(),
    status: "completed",
    ...metadata,
  };

  // Create transaction
  await db.collection("transactions").add(txData);

  // Update user balance
  await db.collection("users").doc(userId).update({
    tokens: currentBalance + amount,
  });

  return txData;
}

// Helper to get current timestamp
export function now() {
  return Timestamp.now();
}

// Helper to create timestamp from minutes ago
export function minutesAgo(minutes: number) {
  return Timestamp.fromMillis(Date.now() - minutes * 60 * 1000);
}

// Helper to create timestamp from hours ago
export function hoursAgo(hours: number) {
  return Timestamp.fromMillis(Date.now() - hours * 60 * 60 * 1000);
}

// Helper to create timestamp from days ago
export function daysAgo(days: number) {
  return Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Mock callable function context
export function mockCallableContext(userId?: string, isAdmin: boolean = false) {
  return {
    auth: userId ? {
      uid: userId,
      token: {
        admin: isAdmin,
      },
    } : undefined,
    rawRequest: {},
  };
}

// Helper to verify document exists
export async function documentExists(collection: string, docId: string): Promise<boolean> {
  const db = getDb();
  const doc = await db.collection(collection).doc(docId).get();
  return doc.exists;
}

// Helper to get document data
export async function getDocumentData(collection: string, docId: string): Promise<any> {
  const db = getDb();
  const doc = await db.collection(collection).doc(docId).get();
  return doc.data();
}

// Helper to count documents in collection with query
export async function countDocuments(collection: string, field?: string, operator?: any, value?: any): Promise<number> {
  const db = getDb();
  let query: any = db.collection(collection);

  if (field && operator && value !== undefined) {
    query = query.where(field, operator, value);
  }

  const snapshot = await query.get();
  return snapshot.size;
}

// Helper to setup test environment
export async function setupTestEnvironment() {
  initializeFirebaseAdmin();

  // Clear all test collections
  const collections = [
    "users",
    "transactions",
    "chats",
    "posts",
    "systemEvents",
    "userRiskProfiles",
    "economySnapshots",
    "ledger",
    "contentClassifications",
    "contentFlags",
    "userInsights",
    "auditLogs",
    "amlFlags",
  ];

  for (const collection of collections) {
    await clearCollection(collection);
  }
}

// Helper to teardown test environment
export async function teardownTestEnvironment() {
  // Optional: clean up if needed
}

export default {
  initializeFirebaseAdmin,
  getDb,
  getAuth,
  testData,
  clearCollection,
  sleep,
  createTestUser,
  createTestTransaction,
  now,
  minutesAgo,
  hoursAgo,
  daysAgo,
  mockCallableContext,
  documentExists,
  getDocumentData,
  countDocuments,
  setupTestEnvironment,
  teardownTestEnvironment,
};


