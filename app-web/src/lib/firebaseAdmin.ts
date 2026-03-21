/**
 * Firebase Admin SDK — Server-side Singleton
 *
 * Used by Next.js API routes for server-side Firestore access and
 * Firebase ID token verification.
 *
 * Initializes from FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string)
 * or falls back to GOOGLE_APPLICATION_CREDENTIALS (file path).
 *
 * INVARIANTS:
 *   - This file MUST NOT be imported from client-side code.
 *   - NEVER expose admin credentials to the browser.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _adminApp: App | null = null;

function getAdminApp(): App {
  if (_adminApp) return _adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    _adminApp = existing[0];
    return _adminApp;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      _adminApp = initializeApp({ credential: cert(parsed) });
    } catch {
      // Fallback: GOOGLE_APPLICATION_CREDENTIALS or default credentials
      _adminApp = initializeApp();
    }
  } else {
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var or GCP default credentials
    _adminApp = initializeApp();
  }

  return _adminApp;
}

/** Firebase Admin Auth — for verifying ID tokens server-side. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** Firebase Admin Firestore — for server-side Firestore operations. */
export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
