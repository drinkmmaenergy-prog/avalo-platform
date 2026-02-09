/**
 * Firebase Client SDK — Singleton Initialization
 *
 * Provides: auth, db (Firestore), functions, storage
 * All exported references are safe to import from both client and server components,
 * but will only be initialized in browser environments.
 *
 * Config is read from NEXT_PUBLIC_FIREBASE_* environment variables.
 * Falls back to the staging project when env vars are missing (dev convenience).
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBpOGHxWKxd7Y8zXnLxJ7bZTdEwNRuCqLw',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'avalo-c8c46.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'avalo-c8c46',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'avalo-c8c46.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

/** Firebase App — singleton */
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase Auth */
export const auth: Auth = getAuth(app);

/** Firestore */
export const db: Firestore = getFirestore(app);

/** Cloud Functions — defaults to us-central1 */
export const functions: Functions = getFunctions(app, 'us-central1');

/** Firebase Storage */
export const storage: FirebaseStorage = getStorage(app);

export default app;
