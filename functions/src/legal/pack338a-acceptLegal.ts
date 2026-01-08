/**
 * PACK 338a - Legal Compliance Engine
 * Cloud Function: Accept Legal Documents
 * 
 * Records user's acceptance of legal documents with versioning
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { LEGAL_DOCS, type LegalLang } from '../../../shared/legal/legalRegistry';

interface AcceptLegalRequest {
  lang: LegalLang;
}

interface LegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  guidelinesVersion: string;
  refundsVersion: string;
  ageVerificationVersion: string;
  acceptedAt: admin.firestore.FieldValue;
  lang: LegalLang;
  platform: 'mobile' | 'web';
  userId: string;
}

/**
 * Callable function to record legal document acceptance
 */
export const pack338a_acceptLegal = functions.https.onCall(
  async (data: AcceptLegalRequest, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to accept legal documents'
      );
    }

    const userId = context.auth.uid;
    const { lang = 'en' } = data;

    // Validate language
    if (!['en', 'pl'].includes(lang)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid language. Must be "en" or "pl"'
      );
    }

    try {
      const db = admin.firestore();
      
      // Detect platform from user agent (basic detection)
      const userAgent = context.rawRequest?.headers['user-agent'] || '';
      const platform: 'mobile' | 'web' = 
        userAgent.includes('Expo') || userAgent.includes('Mobile') 
          ? 'mobile' 
          : 'web';

      // Get current document versions
      const acceptance: LegalAcceptance = {
        termsVersion: LEGAL_DOCS.terms[lang].version,
        privacyVersion: LEGAL_DOCS.privacy[lang].version,
        guidelinesVersion: LEGAL_DOCS.guidelines[lang].version,
        refundsVersion: LEGAL_DOCS.refunds[lang].version,
        ageVerificationVersion: LEGAL_DOCS.ageVerification[lang].version,
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        lang,
        platform,
        userId,
      };

      // Write acceptance record
      await db.collection('userLegalAcceptances').doc(userId).set(acceptance);

      // Log to audit trail (if PACK 296 exists)
      try {
        await db.collection('auditLogs').add({
          action: 'LEGAL_ACCEPTED',
          userId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          metadata: {
            versions: {
              terms: acceptance.termsVersion,
              privacy: acceptance.privacyVersion,
              guidelines: acceptance.guidelinesVersion,
              refunds: acceptance.refundsVersion,
              ageVerification: acceptance.ageVerificationVersion,
            },
            lang,
            platform,
          },
        });
      } catch (auditError) {
        // Non-critical: log but don't fail
        console.error('Failed to write audit log:', auditError);
      }

      return {
        success: true,
        acceptedAt: new Date().toISOString(),
        versions: {
          terms: acceptance.termsVersion,
          privacy: acceptance.privacyVersion,
          guidelines: acceptance.guidelinesVersion,
          refunds: acceptance.refundsVersion,
          ageVerification: acceptance.ageVerificationVersion,
        },
      };
    } catch (error) {
      console.error('Error recording legal acceptance:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to record legal acceptance',
        error
      );
    }
  }
);
