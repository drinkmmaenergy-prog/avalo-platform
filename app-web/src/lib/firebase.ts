/**
 * Firebase Client SDK — Singleton Initialization
 *
 * Exports:
 *   - app          Firebase App instance
 *   - auth         Firebase Auth instance
 *   - db           Firestore instance (convenience alias for requireDb())
 *   - functions    Cloud Functions lazy proxy (europe-west1, backward compat)
 *   - functionsEU  Cloud Functions europe-west1 instance
 *   - functionsUS  Cloud Functions us-central1 instance
 *   - requireDb()  Firestore getter (throws if unavailable)
 *   - requireFunctions() Cloud Functions EU getter (throws if unavailable)
 *   - requireFunctionsUS() Cloud Functions US getter (throws if unavailable)
 *   - requireStorage() Firebase Storage getter (throws if unavailable)
 *   - getFirebaseApp() App getter
 *
 * REGION MAP:
 *   europe-west1 (EU): payments, wallet, calendar, stripe, payout, legal, feed
 *   us-central1  (US): verification, subscriptions, safety, meetings, calls,
 *                       notifications, pack350_cancelSubscription
 *
 * INVARIANTS:
 *   - NEVER remove requireDb / requireFunctions — they are canonical guards.
 *   - NEVER hardcode secrets here — config comes from env vars.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getDatabase, type Database } from 'firebase/database';

const FUNCTIONS_REGION_EU = 'europe-west1';
const FUNCTIONS_REGION_US = 'us-central1';

/** @deprecated Use FUNCTIONS_REGION_EU — kept for any external references. */
const FUNCTIONS_REGION = FUNCTIONS_REGION_EU;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firebase App — singleton. */
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase Auth — stable web singleton. */
export const auth: Auth = getAuth(app);

if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('[Firebase] Failed to enable browserLocalPersistence:', error);
  });
}

/** Firestore — lazy singleton. */
let _db: Firestore | null = null;

/**
 * Returns Firestore instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireDb(): Firestore {
  if (!_db) {
    _db = getFirestore(app);
  }
  return _db;
}

/**
 * FIX 117: Firestore offline persistence — DISABLED.
 * enableMultiTabIndexedDbPersistence() was removed because it is deprecated
 * and causes "FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state" when
 * the module is re-evaluated (React Strict Mode, HMR, or SSR hydration).
 * Firestore works correctly without it; re-enable only with the new
 * `initializeFirestore(app, { localCache: persistentLocalCache(...) })` API.
 */

/**
 * Firestore convenience export.
 * Equivalent to requireDb() but usable as: import { db } from '@/lib/firebase'
 */
export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    if (!_db) _db = getFirestore(app);
    return (_db as any)[prop];
  },
});

/** Cloud Functions (europe-west1) — lazy singleton. */
let _functions: Functions | null = null;

/**
 * Returns Cloud Functions (europe-west1) instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireFunctions(): Functions {
  if (!_functions) {
    _functions = getFunctions(app, FUNCTIONS_REGION_EU);
  }
  return _functions;
}

/** Cloud Functions (us-central1) — lazy singleton. */
let _functionsUS: Functions | null = null;

/**
 * Returns Cloud Functions (us-central1) instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 *
 * Use for: verification, subscriptions, safety, meetings, calls, notifications,
 *          pack350_cancelSubscription, checkInToMeeting, completeMeetingCallable,
 *          calculateBookingPayment, getRefundPolicy, reportAppearanceMismatch,
 *          verifyMeetingSelfie, verifySelfie, startVerification, sendNotification,
 *          getNotifications, getUserNotifications, markNotificationAsRead,
 *          markAllNotificationsRead
 */
export function requireFunctionsUS(): Functions {
  if (!_functionsUS) {
    _functionsUS = getFunctions(app, FUNCTIONS_REGION_US);
  }
  return _functionsUS;
}

/** Firebase Storage — lazy singleton. */
let _storage: FirebaseStorage | null = null;

/**
 * Returns Firebase Storage instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireStorage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(app);
  }
  return _storage;
}

/** Firebase Realtime Database — lazy singleton (FIX 102: Presence + Typing). */
let _rtdb: Database | null = null;

/**
 * Returns Firebase Realtime Database instance.
 * Used for presence (green dot / last seen) and typing indicators.
 * RTDB is cheaper than Firestore for frequent writes (presence heartbeats).
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireRtdb(): Database {
  if (!_rtdb) {
    _rtdb = getDatabase(app);
  }
  return _rtdb;
}

/**
 * Returns the Firebase App singleton.
 */
export function getFirebaseApp(): FirebaseApp {
  return app;
}

/**
 * Cloud Functions (europe-west1) — lazy proxy.
 * Compatible with: import { functions } from "@/lib/firebase"
 * Uses Proxy to defer initialization until first property access.
 * Kept for backward compatibility — points to europe-west1.
 */
export const functions: Functions = new Proxy({} as Functions, {
  get(_target, prop) {
    if (!_functions) _functions = getFunctions(getFirebaseApp(), FUNCTIONS_REGION_EU);
    return (_functions as any)[prop];
  },
});

/** Alias for functions — explicit EU region. */
export const functionsEU: Functions = functions;

/**
 * Cloud Functions (us-central1) — lazy proxy.
 * Compatible with: import { functionsUS } from "@/lib/firebase"
 * Uses Proxy to defer initialization until first property access.
 */
export const functionsUS: Functions = new Proxy({} as Functions, {
  get(_target, prop) {
    if (!_functionsUS) _functionsUS = getFunctions(getFirebaseApp(), FUNCTIONS_REGION_US);
    return (_functionsUS as any)[prop];
  },
});

export default app;