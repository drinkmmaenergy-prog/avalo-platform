/**
 * PACK 360 - Local Legal Text Engine
 * Per-country binding legal documents with version control
 * 
 * Dependencies: PACK 359 (Legal & Tax)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Types
export interface LegalDocument {
  documentId: string;
  type: 'terms_of_service' | 'privacy_policy' | 'refund_policy' | 'calendar_regulations' | 'event_regulations' | 'cookie_policy' | 'dsa_compliance' | 'community_guidelines';
  country: string;
  languageCode: string;
  version: string;
  content: string;
  effectiveDate: number;
  lastUpdated: number;
  mandatory: boolean; // Must accept on first login or update
  updatedBy: string;
  status: 'draft' | 'active' | 'archived';
}

export interface UserLegalAcceptance {
  userId: string;
  documentId: string;
  documentType: string;
  country: string;
  version: string;
  accepted: boolean;
  acceptedAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface LegalUpdateNotification {
  userId: string;
  documentType: string;
  oldVersion: string;
  newVersion: string;
  requiresAcceptance: boolean;
  notifiedAt: number;
  acceptedAt?: number;
}

// Get legal documents for user's country and language
export const getUserLegalDocuments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { country, languageCode, documentType } = data;
    const db = admin.firestore();
    
    // Get user's country and language if not provided
    let userCountry = country;
    let userLanguage = languageCode;
    
    if (!userCountry || !userLanguage) {
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      userCountry = userCountry || userDoc.data()?.country || 'GLOBAL';
      userLanguage = userLanguage || userDoc.data()?.language || 'en';
    }
    
    // Build query
    let query: any = db.collection('legal-documents')
      .where('status', '==', 'active')
      .where('country', 'in', [userCountry, 'GLOBAL'])
      .where('languageCode', '==', userLanguage);
    
    if (documentType) {
      query = query.where('type', '==', documentType);
    }
    
    const snapshot = await query.get();
    const documents: LegalDocument[] = [];
    
    snapshot.forEach((doc: any) => {
      documents.push(doc.data() as LegalDocument);
    });
    
    // Sort by country (specific country first, then GLOBAL) and effectiveDate
    documents.sort((a, b) => {
      if (a.country !== b.country) {
        return a.country === userCountry ? -1 : 1;
      }
      return b.effectiveDate - a.effectiveDate;
    });
    
    // Remove duplicates (keep country-specific over GLOBAL)
    const uniqueDocs = new Map<string, LegalDocument>();
    for (const doc of documents) {
      if (!uniqueDocs.has(doc.type) || doc.country === userCountry) {
        uniqueDocs.set(doc.type, doc);
      }
    }
    
    return {
      success: true,
      documents: Array.from(uniqueDocs.values()),
      country: userCountry,
      languageCode: userLanguage
    };
  } catch (error: any) {
    console.error('Error getting legal documents:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Accept legal document
export const acceptLegalDocument = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { documentId, ipAddress, userAgent } = data;
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get document
    const docRef = db.collection('legal-documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Legal document not found');
    }
    
    const document = docSnap.data() as LegalDocument;
    
    // Create acceptance record
    const acceptance: UserLegalAcceptance = {
      userId,
      documentId,
      documentType: document.type,
      country: document.country,
      version: document.version,
      accepted: true,
      acceptedAt: Date.now(),
      ipAddress,
      userAgent
    };
    
    // Save acceptance
    const acceptanceId = `${userId}_${documentId}_${document.version}`;
    await db.collection('user-legal-acceptances').doc(acceptanceId).set(acceptance);
    
    // Update user profile
    await db.collection('users').doc(userId).update({
      [`legalAcceptances.${document.type}`]: {
        version: document.version,
        acceptedAt: Date.now()
      },
      lastLegalUpdate: Date.now()
    });
    
    // Check if all mandatory documents are accepted
    await checkMandatoryAcceptances(userId, document.country);
    
    return { success: true, documentId, version: document.version };
  } catch (error: any) {
    console.error('Error accepting legal document:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Check if user has accepted all mandatory documents
export const checkMandatoryAcceptances = async (userId: string, country: string) => {
  const db = admin.firestore();
  
  // Get all mandatory documents for the country
  const mandatoryDocs = await db.collection('legal-documents')
    .where('country', 'in', [country, 'GLOBAL'])
    .where('mandatory', '==', true)
    .where('status', '==', 'active')
    .get();
  
  const userDoc = await db.collection('users').doc(userId).get();
  const userAcceptances = userDoc.data()?.legalAcceptances || {};
  
  let allAccepted = true;
  const missing: string[] = [];
  
  mandatoryDocs.forEach((doc: any) => {
    const docData = doc.data() as LegalDocument;
    const acceptance = userAcceptances[docData.type];
    
    if (!acceptance || acceptance.version !== docData.version) {
      allAccepted = false;
      missing.push(docData.type);
    }
  });
  
  // Update user profile
  await db.collection('users').doc(userId).update({
    legalComplianceStatus: allAccepted ? 'compliant' : 'pending',
    missingLegalAcceptances: missing,
    lastLegalCheck: Date.now()
  });
  
  return { allAccepted, missing };
};

// Check user legal compliance status
export const checkUserLegalCompliance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get user's country
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const country = userData?.country || 'GLOBAL';
    
    const result = await checkMandatoryAcceptances(userId, country);
    
    return {
      success: true,
      compliant: result.allAccepted,
      missingDocuments: result.missing
    };
  } catch (error: any) {
    console.error('Error checking legal compliance:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Create or update legal document
export const adminCreateLegalDocument = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const {
      type,
      country,
      languageCode,
      version,
      content,
      effectiveDate,
      mandatory,
      status
    } = data;
    
    const documentId = `${type}_${country}_${languageCode}_${version}`;
    
    const document: LegalDocument = {
      documentId,
      type,
      country,
      languageCode,
      version,
      content,
      effectiveDate: effectiveDate || Date.now(),
      lastUpdated: Date.now(),
      mandatory: mandatory !== undefined ? mandatory : true,
      updatedBy: context.auth.uid,
      status: status || 'draft'
    };
    
    await db.collection('legal-documents').doc(documentId).set(document);
    
    // If activating a new version, archive old versions
    if (status === 'active') {
      const oldVersions = await db.collection('legal-documents')
        .where('type', '==', type)
        .where('country', '==', country)
        .where('languageCode', '==', languageCode)
        .where('status', '==', 'active')
        .get();
      
      const batch = db.batch();
      oldVersions.forEach((doc: any) => {
        if (doc.id !== documentId) {
          batch.update(doc.ref, { status: 'archived' });
        }
      });
      await batch.commit();
      
      // Notify users about the update if mandatory
      if (mandatory) {
        await notifyUsersOfLegalUpdate(type, country, version);
      }
    }
    
    return { success: true, documentId };
  } catch (error: any) {
    console.error('Error creating legal document:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Notify users of legal document update
const notifyUsersOfLegalUpdate = async (
  documentType: string,
  country: string,
  newVersion: string
) => {
  const db = admin.firestore();
  
  // Get all users in the country
  const usersSnapshot = await db.collection('users')
    .where('country', '==', country)
    .limit(1000) // Process in batches
    .get();
  
  const batch = db.batch();
  let count = 0;
  
  usersSnapshot.forEach((userDoc: any) => {
    const userData = userDoc.data();
    const oldVersion = userData.legalAcceptances?.[documentType]?.version || 'unknown';
    
    const notification: LegalUpdateNotification = {
      userId: userDoc.id,
      documentType,
      oldVersion,
      newVersion,
      requiresAcceptance: true,
      notifiedAt: Date.now()
    };
    
    const notifRef = db.collection('legal-update-notifications').doc();
    batch.set(notifRef, notification);
    
    // Update user's legal compliance status
    batch.update(userDoc.ref, {
      legalComplianceStatus: 'pending',
      [`missingLegalAcceptances.${documentType}`]: newVersion
    });
    
    count++;
  });
  
  await batch.commit();
  console.log(`Notified ${count} users about ${documentType} update in ${country}`);
};

// Admin: Get all legal documents
export const adminGetAllLegalDocuments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { country, languageCode, type, status } = data;
    
    let query: any = db.collection('legal-documents');
    
    if (country) {
      query = query.where('country', '==', country);
    }
    if (languageCode) {
      query = query.where('languageCode', '==', languageCode);
    }
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    const documents: LegalDocument[] = [];
    
    snapshot.forEach((doc: any) => {
      documents.push(doc.data() as LegalDocument);
    });
    
    return { success: true, documents };
  } catch (error: any) {
    console.error('Error getting all legal documents:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Get legal acceptance statistics
export const adminGetLegalAcceptanceStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { documentType, country } = data;
    
    // Get total users in country
    let usersQuery: any = db.collection('users');
    if (country && country !== 'GLOBAL') {
      usersQuery = usersQuery.where('country', '==', country);
    }
    
    const totalUsers = (await usersQuery.count().get()).data().count;
    
    // Get acceptances
    let acceptanceQuery: any = db.collection('user-legal-acceptances');
    if (documentType) {
      acceptanceQuery = acceptanceQuery.where('documentType', '==', documentType);
    }
    if (country && country !== 'GLOBAL') {
      acceptanceQuery = acceptanceQuery.where('country', '==', country);
    }
    
    const acceptancesSnap = await acceptanceQuery.get();
    
    const stats = {
      totalUsers,
      totalAcceptances: acceptancesSnap.size,
      acceptanceRate: totalUsers > 0 ? (acceptancesSnap.size / totalUsers) * 100 : 0,
      byType: {} as Record<string, number>
    };
    
    acceptancesSnap.forEach((doc: any) => {
      const data = doc.data();
      const type = data.documentType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    return { success: true, stats };
  } catch (error: any) {
    console.error('Error getting legal acceptance stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Trigger: Check legal compliance on user login
export const onUserLogin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get user's country
    const userDoc = await db.collection('users').doc(userId).get();
    const country = userDoc.data()?.country || 'GLOBAL';
    
    // Check if country changed
    const previousCountry = userDoc.data()?.previousCountry;
    if (previousCountry && previousCountry !== country) {
      // Country changed, need to check new country's legal requirements
      await db.collection('users').doc(userId).update({
        legalComplianceStatus: 'pending',
        previousCountry: country
      });
    }
    
    // Check legal compliance
    const result = await checkMandatoryAcceptances(userId, country);
    
    return {
      success: true,
      requiresLegalAcceptance: !result.allAccepted,
      missingDocuments: result.missing
    };
  } catch (error: any) {
    console.error('Error checking legal compliance on login:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Trigger: Auto-check legal compliance on country change
export const onUserCountryChangeLegal = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if country changed
    if (before.country === after.country) {
      return;
    }
    
    const userId = context.params.userId;
    const newCountry = after.country;
    const db = admin.firestore();
    
    console.log(`User ${userId} changed country to ${newCountry}, checking legal compliance...`);
    
    // Check new country's legal requirements
    const result = await checkMandatoryAcceptances(userId, newCountry);
    
    // Create notification if compliance is required
    if (!result.allAccepted) {
      await db.collection('notifications').add({
        userId,
        type: 'legal_compliance_required',
        title: 'Legal Documents Update Required',
        message: `Due to your location change, please review and accept updated legal documents.`,
        missingDocuments: result.missing,
        priority: 'high',
        createdAt: Date.now(),
        read: false
      });
    }
  });
