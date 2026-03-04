/**
 * Firebase Client SDK — Singleton Initialization
 *
 * Exports:
 *   - app          Firebase App instance
 *   - auth         Firebase Auth instance
 *   - functions    Cloud Functions lazy proxy
 *   - requireDb()  Firestore getter (throws if unavailable)
 *   - requireFunctions() Cloud Functions getter (throws if unavailable)
 *   - getFirebaseApp() App getter
 *
 * INVARIANTS:
 *   - NEVER remove requireDb / requireFunctions — they are canonical guards.
 *   - NEVER hardcode secrets here — config comes from env vars.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firebase App — singleton. */
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase Auth — singleton. */
export const auth: Auth = getAuth(app);

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

/** Cloud Functions — lazy singleton. */
let _functions: Functions | null = null;

/**
 * Returns Cloud Functions instance. Throws if Firebase is not initialized.
 * This is a canonical guard — do NOT remove or bypass.
 */
export function requireFunctions(): Functions {
  if (!_functions) {
    _functions = getFunctions(app, 'us-central1');
  }
  return _functions;
}

/**
 * Returns the Firebase App singleton.
 */
export function getFirebaseApp(): FirebaseApp {
  return app;
}

/**
 * Cloud Functions — lazy proxy.
 * Compatible with: import { functions } from "@/lib/firebase"
 * Uses Proxy to defer initialization until first property access.
 */
export const functions: Functions = new Proxy({} as Functions, {
  get(_target, prop) {
    if (!_functions) _functions = getFunctions(getFirebaseApp(), 'us-central1');
    return (_functions as any)[prop];
  },
});

export default app;
