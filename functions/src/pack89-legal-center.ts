/**
 * PACK 89: Legal & Policy Center - Cloud Functions
 * 
 * Handles legal document management and mandatory acceptance enforcement.
 * This is a compliance-critical module that blocks users from performing
 * protected actions until they accept required legal documents.
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import {
  LegalDocumentType,
  LegalDocument,
  LegalAcceptance,
  LegalAcceptanceAudit,
  LegalRequirement,
  ProtectedAction,
  ACTION_REQUIREMENTS,
  GetLegalRequirementsRequest,
  GetLegalRequirementsResponse,
  AcceptLegalDocumentRequest,
  AcceptLegalDocumentResponse,
  UploadLegalDocumentRequest,
  UploadLegalDocumentResponse,
  LegalValidationError
} from './types/legal.types';

// =======================================================
// 🔍 HELPER FUNCTIONS
// =======================================================

/**
 * Get the latest version of a legal document by type and language
 */
async function getLatestLegalDocument(
  type: LegalDocumentType,
  language: string = 'en'
): Promise<LegalDocument | null> {
  const snapshot = await db
    .collection('legal_documents')
    .where('type', '==', type)
    .where('language', '==', language)
    .orderBy('version', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as LegalDocument;
}

/**
 * Get all latest legal documents (one per type, for a specific language)
 */
async function getAllLatestLegalDocuments(
  language: string = 'en'
): Promise<Map<LegalDocumentType, LegalDocument>> {
  const snapshot = await db
    .collection('legal_documents')
    .where('language', '==', language)
    .get();

  // Group by type and keep only the highest version
  const documentsMap = new Map<LegalDocumentType, LegalDocument>();

  snapshot.docs.forEach(doc => {
    const legalDoc = doc.data() as LegalDocument;
    const existing = documentsMap.get(legalDoc.type);

    if (!existing || legalDoc.version > existing.version) {
      documentsMap.set(legalDoc.type, legalDoc);
    }
  });

  return documentsMap;
}

/**
 * Get user's legal acceptance record
 */
async function getUserLegalAcceptance(
  userId: string
): Promise<LegalAcceptance | null> {
  const doc = await db.collection('legal_acceptance').doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as LegalAcceptance;
}

/**
 * Check if user has accepted all required documents for an action
 */
async function checkLegalRequirements(
  userId: string,
  action: ProtectedAction,
  language: string = 'en'
): Promise<GetLegalRequirementsResponse> {
  const requiredTypes = ACTION_REQUIREMENTS[action];
  const latestDocs = await getAllLatestLegalDocuments(language);
  const userAcceptance = await getUserLegalAcceptance(userId);

  const requirements: LegalRequirement[] = [];
  const pendingTypes: LegalDocumentType[] = [];

  for (const type of requiredTypes) {
    const latestDoc = latestDocs.get(type);
    
    if (!latestDoc) {
      console.warn(`Legal document ${type} not found for language ${language}`);
      continue;
    }

    const userAcceptedVersion = userAcceptance?.accepted[type];
    const isPending = !userAcceptedVersion || userAcceptedVersion < latestDoc.version;

    const requirement: LegalRequirement = {
      type,
      currentVersion: latestDoc.version,
      userAcceptedVersion,
      required: true,
      pending: isPending
    };

    requirements.push(requirement);

    if (isPending) {
      pendingTypes.push(type);
    }
  }

  const allSatisfied = pendingTypes.length === 0;

  return {
    allSatisfied,
    requirements,
    pendingTypes
  };
}

/**
 * Create audit log entry for legal acceptance
 */
async function createAuditLog(
  userId: string,
  type: LegalDocumentType,
  version: number,
  platform: 'mobile' | 'web',
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const auditLog: Omit<LegalAcceptanceAudit, 'auditId'> = {
    userId,
    type,
    version,
    acceptedAt: serverTimestamp(),
    platform,
    ipAddress,
    userAgent
  };

  await db.collection('legal_acceptance_audit').add(auditLog);
}

// =======================================================
// 📞 CALLABLE FUNCTIONS
// =======================================================

/**
 * Get legal requirements for a specific action
 * Returns which documents are required and which versions are pending
 */
export const getLegalRequirementsForUser = functions.https.onCall(
  async (data: GetLegalRequirementsRequest, context) => {
    // Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { action } = data;

    // Validate action
    if (!action || !ACTION_REQUIREMENTS[action]) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid action specified'
      );
    }

    try {
      const result = await checkLegalRequirements(userId, action);
      return result;
    } catch (error: any) {
      console.error('Error checking legal requirements:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Accept a legal document
 * Stores acceptance for user and creates audit entry
 */
export const acceptLegalDocument = functions.https.onCall(
  async (data: AcceptLegalDocumentRequest, context) => {
    // Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { type, version, platform } = data;

    // Validate input
    if (!type || !version || !platform) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: type, version, platform'
      );
    }

    if (!['mobile', 'web'].includes(platform)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Platform must be "mobile" or "web"'
      );
    }

    try {
      // Verify the document and version exist
      const latestDoc = await getLatestLegalDocument(type);
      
      if (!latestDoc) {
        throw new functions.https.HttpsError(
          'not-found',
          `Legal document of type ${type} not found`
        );
      }

      if (version !== latestDoc.version) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Version mismatch: provided ${version}, current is ${latestDoc.version}`
        );
      }

      // Update user's legal acceptance
      const acceptanceRef = db.collection('legal_acceptance').doc(userId);
      const currentAcceptance = await getUserLegalAcceptance(userId);

      const updatedAccepted = {
        ...(currentAcceptance?.accepted || {}),
        [type]: version
      };

      await acceptanceRef.set({
        userId,
        accepted: updatedAccepted,
        updatedAt: serverTimestamp()
      });

      // Create audit log
      await createAuditLog(
        userId,
        type,
        version,
        platform,
        context.rawRequest?.ip,
        context.rawRequest?.headers?.['user-agent']
      );

      console.log(`User ${userId} accepted ${type} v${version} on ${platform}`);

      const response: AcceptLegalDocumentResponse = {
        success: true,
        message: `Successfully accepted ${type} version ${version}`,
        newAcceptance: {
          type,
          version
        }
      };

      return response;
    } catch (error: any) {
      console.error('Error accepting legal document:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Upload a new legal document (Admin only)
 * Creates a new version of a legal document
 */
export const admin_uploadLegalDocument = functions.https.onCall(
  async (data: UploadLegalDocumentRequest, context) => {
    // Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // Must be admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAdmin = userDoc.exists && userDoc.data()?.roles?.admin === true;

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can upload legal documents'
      );
    }

    const { type, language, title, url } = data;

    // Validate input
    if (!type || !language || !title || !url) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: type, language, title, url'
      );
    }

    try {
      // Get the latest version for this type and language
      const latestDoc = await getLatestLegalDocument(type, language);
      const newVersion = latestDoc ? latestDoc.version + 1 : 1;

      // Create the new legal document
      const newDoc: Omit<LegalDocument, 'id'> = {
        type,
        version: newVersion,
        language,
        title,
        url,
        createdAt: serverTimestamp()
      };

      const docRef = await db.collection('legal_documents').add(newDoc);

      console.log(
        `Admin ${context.auth.uid} uploaded ${type} v${newVersion} (${language})`
      );

      const response: UploadLegalDocumentResponse = {
        success: true,
        message: `Successfully uploaded ${type} version ${newVersion}`,
        document: {
          id: docRef.id,
          type,
          version: newVersion
        }
      };

      return response;
    } catch (error: any) {
      console.error('Error uploading legal document:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get all legal documents (for displaying in Legal Center)
 */
export const getAllLegalDocuments = functions.https.onCall(
  async (data: { language?: string }, context) => {
    const language = data?.language || 'en';

    try {
      const documentsMap = await getAllLatestLegalDocuments(language);
      const documents = Array.from(documentsMap.values());

      return {
        success: true,
        documents
      };
    } catch (error: any) {
      console.error('Error fetching legal documents:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's current legal acceptance status
 */
export const getUserLegalStatus = functions.https.onCall(
  async (data: { language?: string }, context) => {
    // Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const language = data?.language || 'en';

    try {
      const userAcceptance = await getUserLegalAcceptance(userId);
      const latestDocs = await getAllLatestLegalDocuments(language);

      const status: Record<LegalDocumentType, {
        currentVersion: number;
        acceptedVersion?: number;
        pending: boolean;
      }> = {} as any;

      Array.from(latestDocs.entries()).forEach(([type, doc]) => {
        const acceptedVersion = userAcceptance?.accepted[type];
        status[type] = {
          currentVersion: doc.version,
          acceptedVersion,
          pending: !acceptedVersion || acceptedVersion < doc.version
        };
      });

      return {
        success: true,
        status,
        lastUpdated: userAcceptance?.updatedAt
      };
    } catch (error: any) {
      console.error('Error fetching user legal status:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// =======================================================
// 🔒 VALIDATION HELPER (for use in other Cloud Functions)
// =======================================================

/**
 * Validate that user has accepted all required legal documents for an action
 * Throws an error if requirements are not met
 * 
 * Usage in other Cloud Functions:
 * ```typescript
 * await validateLegalAcceptance(userId, 'PUBLISH_CONTENT');
 * ```
 */
export async function validateLegalAcceptance(
  userId: string,
  action: ProtectedAction,
  language: string = 'en'
): Promise<void> {
  const result = await checkLegalRequirements(userId, action, language);

  if (!result.allSatisfied) {
    const requiredDocs = result.requirements
      .filter(req => req.pending)
      .map(req => ({
        type: req.type,
        currentVersion: req.currentVersion
      }));

    const error: LegalValidationError = {
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      message: `User must accept ${result.pendingTypes.join(', ')} before performing this action`,
      requiredDocuments: requiredDocs,
      action
    };

    throw new functions.https.HttpsError(
      'failed-precondition',
      error.message,
      error
    );
  }
}

// Export validation helper for use in other modules
export { checkLegalRequirements };