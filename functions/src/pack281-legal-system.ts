/**
 * PACK 281 - Legal Documents & Consent System
 * Cloud Functions for legal document management and user acceptance tracking
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';

// Types
type LegalLanguage = 'en' | 'pl';
type LegalDocType = 'terms' | 'privacy' | 'safety_rules' | 'content_policy' | 'cookie_policy';

interface LegalDocument {
  docId: LegalDocType;
  version: number;
  slug: string;
  required: boolean;
  supportedLanguages: LegalLanguage[];
  texts: Record<LegalLanguage, {
    title: string;
    url: string;
    summary?: string;
  }>;
  effectiveAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface LegalAcceptance {
  version: number;
  acceptedAt: Timestamp;
  language: LegalLanguage;
  ipAddress?: string;
  userAgent?: string;
}

interface UserLegalAcceptances {
  userId: string;
  docs: Partial<Record<LegalDocType, LegalAcceptance>>;
  lastUpdated: Timestamp;
}

// ============================================================================
// GET LEGAL DOCUMENTS
// ============================================================================

/**
 * Get all legal documents or specific ones
 * Includes version information and language-specific content
 */
export const getLegalDocuments = functions.https.onCall(
  async (data: { 
    docIds?: LegalDocType[];
    language?: LegalLanguage;
    requiredOnly?: boolean;
  }, context) => {
    try {
      const { docIds, language = 'en', requiredOnly = false } = data;

      // Build query
      const collection = db.collection('legalDocuments');
      
      // Get documents
      const snapshot = requiredOnly
        ? await collection.where('required', '==', true).get()
        : await collection.get();
      
      let documents = snapshot.docs.map(doc => {
        const data = doc.data() as LegalDocument;
        
        // Return only requested language text if specified
        if (language && data.texts[language]) {
          return {
            ...data,
            texts: { [language]: data.texts[language] }
          };
        }
        
        return data;
      });

      // Filter by specific docIds if provided
      if (docIds && docIds.length > 0) {
        documents = documents.filter(doc => docIds.includes(doc.docId));
      }

      return {
        success: true,
        documents,
        timestamp: Timestamp.now().toDate().toISOString()
      };
    } catch (error: any) {
      console.error('Error fetching legal documents:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ACCEPT LEGAL DOCUMENTS
// ============================================================================

/**
 * Accept one or more legal documents
 * Records version, language, timestamp, and optional audit info
 */
export const acceptLegalDocuments = functions.https.onCall(
  async (data: {
    acceptances: Array<{
      docId: LegalDocType;
      version: number;
      language: LegalLanguage;
    }>;
    ipAddress?: string;
    userAgent?: string;
  }, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to accept legal documents'
      );
    }

    const userId = context.auth.uid;
    const { acceptances, ipAddress, userAgent } = data;

    // Validate input
    if (!acceptances || !Array.isArray(acceptances) || acceptances.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Must provide at least one acceptance'
      );
    }

    // Validate each acceptance
    const validDocTypes: LegalDocType[] = ['terms', 'privacy', 'safety_rules', 'content_policy', 'cookie_policy'];
    const validLanguages: LegalLanguage[] = ['en', 'pl'];

    for (const acceptance of acceptances) {
      if (!validDocTypes.includes(acceptance.docId)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid document ID: ${acceptance.docId}`
        );
      }
      if (!validLanguages.includes(acceptance.language)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid language: ${acceptance.language}`
        );
      }
      if (typeof acceptance.version !== 'number' || acceptance.version < 1) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid version for ${acceptance.docId}`
        );
      }
    }

    try {
      // Verify documents exist and versions match
      const docRefs = await Promise.all(
        acceptances.map(a => db.collection('legalDocuments').doc(a.docId).get())
      );

      for (let i = 0; i < docRefs.length; i++) {
        const docSnap = docRefs[i];
        const acceptance = acceptances[i];
        
        if (!docSnap.exists) {
          throw new functions.https.HttpsError(
            'not-found',
            `Legal document ${acceptance.docId} not found`
          );
        }

        const docData = docSnap.data() as LegalDocument;
        if (docData.version !== acceptance.version) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Version mismatch for ${acceptance.docId}: expected ${docData.version}, got ${acceptance.version}`
          );
        }
      }

      // Create acceptance records
      const acceptanceRef = db.collection('legalAcceptances').doc(userId);
      const now = Timestamp.now();

      // Build docs object
      const docs: Partial<Record<LegalDocType, LegalAcceptance>> = {};
      
      for (const acceptance of acceptances) {
        docs[acceptance.docId] = {
          version: acceptance.version,
          acceptedAt: now,
          language: acceptance.language,
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent })
        };
      }

      // Save to Firestore
      await acceptanceRef.set({
        userId,
        docs,
        lastUpdated: now
      }, { merge: true });

      console.log(`User ${userId} accepted ${acceptances.length} legal document(s)`);

      return {
        success: true,
        message: 'Legal documents accepted successfully',
        acceptedDocs: acceptances.map(a => a.docId)
      };
    } catch (error: any) {
      console.error('Error accepting legal documents:', error);
      
      // Re-throw HttpsError as-is
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// CHECK LEGAL COMPLIANCE
// ============================================================================

/**
 * Check if user has accepted all required legal documents
 * Returns compliance status and any missing/outdated docs
 */
export const checkLegalCompliance = functions.https.onCall(
  async (data: { language?: LegalLanguage }, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to check legal compliance'
      );
    }

    const userId = context.auth.uid;
    const { language = 'en' } = data;

    try {
      // Get required legal documents
      const legalDocsSnapshot = await db.collection('legalDocuments')
        .where('required', '==', true)
        .get();

      const requiredDocs = legalDocsSnapshot.docs.map(doc => doc.data() as LegalDocument);

      // Get user acceptances
      const acceptanceDoc = await db.collection('legalAcceptances').doc(userId).get();
      const userAcceptances = acceptanceDoc.exists ? acceptanceDoc.data() as UserLegalAcceptances : null;

      // Check compliance
      const missingDocs: LegalDocType[] = [];
      const outdatedDocs: Array<{
        docId: LegalDocType;
        currentVersion: number;
        acceptedVersion: number;
      }> = [];

      for (const doc of requiredDocs) {
        const acceptance = userAcceptances?.docs[doc.docId];

        if (!acceptance) {
          missingDocs.push(doc.docId);
        } else if (acceptance.version < doc.version) {
          outdatedDocs.push({
            docId: doc.docId,
            currentVersion: doc.version,
            acceptedVersion: acceptance.version
          });
        }
      }

      const isCompliant = missingDocs.length === 0 && outdatedDocs.length === 0;

      // Build required actions
      const requiredActions: string[] = [];
      if (missingDocs.length > 0) {
        requiredActions.push(`Accept required documents: ${missingDocs.join(', ')}`);
      }
      if (outdatedDocs.length > 0) {
        requiredActions.push(`Update acceptance for: ${outdatedDocs.map(d => d.docId).join(', ')}`);
      }

      return {
        success: true,
        compliance: {
          isCompliant,
          missingDocs,
          outdatedDocs,
          requiredActions
        },
        documents: requiredDocs.map(doc => ({
          docId: doc.docId,
          version: doc.version,
          title: doc.texts[language]?.title || doc.texts.en.title,
          url: doc.texts[language]?.url || doc.texts.en.url,
          required: doc.required
        })),
        userAcceptances
      };
    } catch (error: any) {
      console.error('Error checking legal compliance:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// GET USER LEGAL ACCEPTANCES
// ============================================================================

/**
 * Get user's legal acceptance history
 * For display in Legal Center
 */
export const getUserLegalAcceptances = functions.https.onCall(
  async (data: {}, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    try {
      const acceptanceDoc = await db.collection('legalAcceptances').doc(userId).get();

      if (!acceptanceDoc.exists) {
        return {
          success: true,
          acceptances: null
        };
      }

      const data = acceptanceDoc.data() as UserLegalAcceptances;

      return {
        success: true,
        acceptances: {
          ...data,
          docs: Object.fromEntries(
            Object.entries(data.docs).map(([docId, acceptance]) => [
              docId,
              {
                ...acceptance,
                acceptedAt: acceptance.acceptedAt.toDate().toISOString()
              }
            ])
          ),
          lastUpdated: data.lastUpdated.toDate().toISOString()
        }
      };
    } catch (error: any) {
      console.error('Error fetching user legal acceptances:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ADMIN: CREATE OR UPDATE LEGAL DOCUMENT
// ============================================================================

/**
 * Admin function to create or update a legal document
 */
export const adminCreateLegalDocument = functions.https.onCall(
  async (data: {
    docId: LegalDocType;
    version: number;
    slug: string;
    required: boolean;
    supportedLanguages: LegalLanguage[];
    texts: Record<LegalLanguage, {
      title: string;
      url: string;
      summary?: string;
    }>;
    effectiveAt?: string;
  }, context) => {
    // Require authentication and admin role
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // Check if user is admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can create or update legal documents'
      );
    }

    const { docId, version, slug, required, supportedLanguages, texts, effectiveAt } = data;

    try {
      const now = Timestamp.now();
      const effectiveTimestamp = effectiveAt
        ? Timestamp.fromDate(new Date(effectiveAt))
        : now;

      const docRef = db.collection('legalDocuments').doc(docId);
      const existingDoc = await docRef.get();

      const documentData: LegalDocument = {
        docId,
        version,
        slug,
        required,
        supportedLanguages,
        texts,
        effectiveAt: effectiveTimestamp,
        createdAt: existingDoc.exists ? (existingDoc.data() as LegalDocument).createdAt : now,
        updatedAt: now
      };

      await docRef.set(documentData);

      console.log(`Legal document ${docId} version ${version} ${existingDoc.exists ? 'updated' : 'created'} by admin ${context.auth.uid}`);

      return {
        success: true,
        message: `Legal document ${docId} ${existingDoc.exists ? 'updated' : 'created'} successfully`,
        document: documentData
      };
    } catch (error: any) {
      console.error('Error creating/updating legal document:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);