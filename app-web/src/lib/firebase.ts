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
 *   - NEVER call getAuth() at module scope — Firebase Auth throws
 *     auth/invalid-api-key during init when apiKey is absent (build-time SSR).
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

// Guard: Firebase Auth throws auth/invalid-api-key at init time when apiKey is
// absent. Do not call initializeApp or getAuth without a valid key.
const _hasConfig = !!(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

let _rawApp: FirebaseApp | null = null;

function _getApp(): FirebaseApp | null {
  if (!_hasConfig) return null;
  if (!_rawApp) {
    _rawApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return _rawApp;
}

// Initialize eagerly when config is present so all other singletons can use it.
_rawApp = _getApp();

/** Firebase App — singleton. May be null at build time when env vars are absent. */
const app: FirebaseApp = _rawApp as FirebaseApp;

// ── Auth ─────────────────────────────────────────────────────────────────────
// getAuth() MUST NOT be called at module scope when apiKey is absent.
// Firebase Auth SDK validates the key on init and throws auth/invalid-api-key.
// Use a lazy Proxy so import of this module never triggers that error.

let _authInstance: Auth | null = null;

function _getAuthInstance(): Auth | null {
  const a = _getApp();
  if (!a) return null;
  if (!_authInstance) _authInstance = getAuth(a);
  return _authInstance;
}

/** Firebase Auth — lazy singleton. Proxy is safe to import at module scope. */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const a = _getAuthInstance();
    if (!a) {
      // Build-time / SSR with no config: return safe values so consumers
      // (e.g. auth.currentUser) don't throw and can handle null gracefully.
      if (prop === 'currentUser') return null;
      if (prop === 'onAuthStateChanged') return (_cb: (u: null) => void) => { _cb(null); return () => {}; };
      return undefined;
    }
    const val = (a as any)[prop];
    return typeof val === 'function' ? val.bind(a) : val;
  },
});

if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('[Firebase] Failed to enable browserLocalPersistence:', error);
  });
}

// ── Firestore ─────────────────────────────────────────────────────────────────

/** Firestore — lazy singleton. */
let _db: Firestore | null = null;

/**
 * Returns Firestore instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireDb(): Firestore {
  const a = _getApp();
  if (!a) throw new Error('[Firebase] requireDb(): Firebase not configured. NEXT_PUBLIC_FIREBASE_API_KEY is missing.');
  if (!_db) _db = getFirestore(a);
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
    const a = _getApp();
    if (!_db) {
      if (!a) return undefined;
      _db = getFirestore(a);
    }
    return (_db as any)[prop];
  },
});

// ── Cloud Functions ───────────────────────────────────────────────────────────

/** Cloud Functions (europe-west1) — lazy singleton. */
let _functions: Functions | null = null;

/**
 * Returns Cloud Functions (europe-west1) instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireFunctions(): Functions {
  const a = _getApp();
  if (!a) throw new Error('[Firebase] requireFunctions(): Firebase not configured.');
  if (!_functions) _functions = getFunctions(a, FUNCTIONS_REGION_EU);
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
  const a = _getApp();
  if (!a) throw new Error('[Firebase] requireFunctionsUS(): Firebase not configured.');
  if (!_functionsUS) _functionsUS = getFunctions(a, FUNCTIONS_REGION_US);
  return _functionsUS;
}

// ── Storage ───────────────────────────────────────────────────────────────────

/** Firebase Storage — lazy singleton. */
let _storage: FirebaseStorage | null = null;

/**
 * Returns Firebase Storage instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireStorage(): FirebaseStorage {
  const a = _getApp();
  if (!a) throw new Error('[Firebase] requireStorage(): Firebase not configured.');
  if (!_storage) _storage = getStorage(a);
  return _storage;
}

// ── Realtime Database ─────────────────────────────────────────────────────────

/** Firebase Realtime Database — lazy singleton (FIX 102: Presence + Typing). */
let _rtdb: Database | null = null;

/**
 * Returns Firebase Realtime Database instance.
 * Used for presence (green dot / last seen) and typing indicators.
 * RTDB is cheaper than Firestore for frequent writes (presence heartbeats).
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireRtdb(): Database {
  const a = _getApp();
  if (!a) throw new Error('[Firebase] requireRtdb(): Firebase not configured.');
  if (!_rtdb) _rtdb = getDatabase(a);
  return _rtdb;
}

// ── App getter ────────────────────────────────────────────────────────────────

/**
 * Returns the Firebase App singleton.
 */
export function getFirebaseApp(): FirebaseApp {
  const a = _getApp();
  if (!a) throw new Error('[Firebase] getFirebaseApp(): Firebase not configured.');
  return a;
}

// ── Functions proxies ─────────────────────────────────────────────────────────

/**
 * Cloud Functions (europe-west1) — lazy proxy.
 * Compatible with: import { functions } from "@/lib/firebase"
 * Uses Proxy to defer initialization until first property access.
 * Kept for backward compatibility — points to europe-west1.
 */
export const functions: Functions = new Proxy({} as Functions, {
  get(_target, prop) {
    const a = _getApp();
    if (!_functions) {
      if (!a) return undefined;
      _functions = getFunctions(a, FUNCTIONS_REGION_EU);
    }
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
    const a = _getApp();
    if (!_functionsUS) {
      if (!a) return undefined;
      _functionsUS = getFunctions(a, FUNCTIONS_REGION_US);
    }
    return (_functionsUS as any)[prop];
  },
});

export default app;
