/**
 * Firebase Admin SDK — Server-side only (API routes).
 *
 * Exports:
 *   - adminApp   Firebase Admin App instance
 *   - adminAuth  Firebase Admin Auth
 *   - adminDb    Firebase Admin Firestore
 *
 * INVARIANTS:
 *   - NEVER import this from client components.
 *   - Service account key comes from FIREBASE_SERVICE_ACCOUNT_KEY env var.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      return initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id,
      });
    } catch {
      console.error('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY');
    }
  }

  // Fallback: use Application Default Credentials (GCP environments, emulators)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const adminApp: App = getAdminApp();

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);

export default adminApp;
