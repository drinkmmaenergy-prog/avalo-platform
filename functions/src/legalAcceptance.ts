/**
 * Legal Acceptance System
 * PHASE 30B-3
 * 
 * Handles legal document acceptance tracking across mobile and web platforms
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { LEGAL_VERSIONS } from './config/legalVersions';

const db = admin.firestore();

interface AcceptLegalDocumentsData {
  platform: 'mobile' | 'web';
}

/**
 * Accept legal documents
 * Creates or updates legalAcceptance/{userId} with current versions
 */
export const acceptLegalDocuments = functions.https.onCall(
  async (data: AcceptLegalDocumentsData, context) => {
    // Prevent unauthenticated calls
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to accept legal documents'
      );
    }

    const userId = context.auth.uid;
    const { platform } = data;

    // Validate platform
    if (!platform || !['mobile', 'web'].includes(platform)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Platform must be "mobile" or "web"'
      );
    }

    try {
      // Create or update legal acceptance record
      const legalAcceptanceRef = db.collection('legalAcceptance').doc(userId);

      await legalAcceptanceRef.set(
        {
          termsVersion: LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
          communityVersion: LEGAL_VERSIONS.community,
          safetyVersion: LEGAL_VERSIONS.safety,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          platform,
        },
        { merge: false } // Always overwrite with current versions
      );

      console.log(`Legal documents accepted by user ${userId} on ${platform}`);

      return { success: true, message: 'OK' };
    } catch (error: any) {
      console.error('Error accepting legal documents:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);