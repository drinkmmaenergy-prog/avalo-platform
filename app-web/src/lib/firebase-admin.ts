/**
 * Firebase Admin SDK — Server-side only.
 *
 * Used in API routes (app/api/) for server-side Firestore and Auth operations.
 * Initializes from FIREBASE_SERVICE_ACCOUNT_KEY env var or falls back to
 * GOOGLE_APPLICATION_CREDENTIALS for GCP environments.
 *
 * IMPORTANT: This file must NEVER be imported from client components.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } catch {
      console.warn('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default credentials');
    }
  }

  // Fallback: use default credentials (works in GCP environments)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'avalo-c8c46',
  });
}

const adminApp = getAdminApp();

/** Firebase Admin Auth */
export const adminAuth = getAuth(adminApp);

/** Firebase Admin Firestore */
export const adminDb = getFirestore(adminApp);

export default adminApp;
