/**
 * PACK 359 — Legal Compliance: GDPR & Data Retention
 * 
 * Automated data retention and deletion policies:
 * - GDPR right to erasure
 * - Data export (ZIP, JSON)
 * - Anonymization fallback
 * - Automatic data lifecycle management
 * - Collection-specific retention rules
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { checkGDPRApplicability } from './pack359-jurisdiction-engine';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DataRetentionPolicy {
  collection: string;
  retentionDays: number;
  autoDelete: boolean;
  anonymizeInstead: boolean; // If true, anonymize rather than delete
  exemptFields?: string[]; // Fields to keep for legal/financial records
}

export interface DataErasureRequest {
  userId: string;
  requestedAt: Date;
  reason?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: Date;
  collectionsErased: string[];
  recordsDeleted: number;
  recordsAnonymized: number;
  errors?: string[];
}

export interface DataExportRequest {
  userId: string;
  requestedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  format: 'json' | 'zip';
  fileSize?: number;
}

export interface UserDataPackage {
  userId: string;
  exportedAt: Date;
  collections: Record<string, any[]>;
  metadata: {
    totalRecords: number;
    totalCollections: number;
    jurisdiction: string;
  };
}

// ============================================================================
// DATA RETENTION POLICIES
// ============================================================================

const RETENTION_POLICIES: DataRetentionPolicy[] = [
  // User generated content - keep while active
  {
    collection: 'messages',
    retentionDays: 365,
    autoDelete: true,
    anonymizeInstead: false,
  },
  {
    collection: 'ai_chat_sessions',
    retentionDays: 180,
    autoDelete: true,
    anonymizeInstead: true, // Keep for AI training, anonymize user
  },
  {
    collection: 'support_tickets',
    retentionDays: 730, // 2 years
    autoDelete: true,
    anonymizeInstead: true,
  },
  {
    collection: 'location_tracking',
    retentionDays: 90,
    autoDelete: true,
    anonymizeInstead: false,
  },
  {
    collection: 'calendar_events',
    retentionDays: 730, // Keep for financial records
    autoDelete: false,
    anonymizeInstead: true,
    exemptFields: ['price', 'commission', 'timestamp'],
  },
  {
    collection: 'video_call_logs',
    retentionDays: 365,
    autoDelete: true,
    anonymizeInstead: true,
  },
  
  // Financial records - must keep longer
  {
    collection: 'wallet_transactions',
    retentionDays: 2555, // 7 years for tax compliance
    autoDelete: false,
    anonymizeInstead: true,
    exemptFields: ['amount', 'currency', 'timestamp', 'type'],
  },
  {
    collection: 'tax_ledger',
    retentionDays: 2555, // 7 years
    autoDelete: false,
    anonymizeInstead: false, // Cannot delete tax records
  },
  {
    collection: 'invoices',
    retentionDays: 2555, // 7 years
    autoDelete: false,
    anonymizeInstead: true,
    exemptFields: ['amount', 'currency', 'timestamp', 'taxAmount'],
  },
  
  // Safety and compliance records
  {
    collection: 'abuse_reports',
    retentionDays: 1825, // 5 years
    autoDelete: false,
    anonymizeInstead: true,
    exemptFields: ['reportType', 'timestamp', 'resolution'],
  },
  {
    collection: 'fraud_detections',
    retentionDays: 1825, // 5 years
    autoDelete: false,
    anonymizeInstead: true,
  },
  {
    collection: 'kyc_verifications',
    retentionDays: 1825, // 5 years
    autoDelete: false,
    anonymizeInstead: true,
    exemptFields: ['status', 'timestamp', 'country'],
  },
  
  // User preferences and settings - delete on request
  {
    collection: 'user_preferences',
    retentionDays: 0, // No auto-deletion
    autoDelete: false,
    anonymizeInstead: false,
  },
  {
    collection: 'notifications',
    retentionDays: 90,
    autoDelete: true,
    anonymizeInstead: false,
  },
  {
    collection: 'search_history',
    retentionDays: 180,
    autoDelete: true,
    anonymizeInstead: false,
  },
];

// ============================================================================
// DATA ERASURE (RIGHT TO BE FORGOTTEN)
// ============================================================================

/**
 * Request complete data erasure for a user
 */
export async function requestDataErasure(
  userId: string,
  reason?: string
): Promise<DataErasureRequest> {
  // Check if user is in GDPR jurisdiction
  const gdprApplies = await checkGDPRApplicability(userId);
  
  const request: DataErasureRequest = {
    userId,
    requestedAt: new Date(),
    reason,
    status: 'pending',
    collectionsErased: [],
    recordsDeleted: 0,
    recordsAnonymized: 0,
  };
  
  // Store erasure request
  const requestRef = await db.collection('data_erasure_requests').add({
    ...request,
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    gdprApplies,
  });
  
  // Start async processing
  processDataErasure(requestRef.id, userId);
  
  return request;
}

/**
 * Process data erasure request
 */
async function processDataErasure(requestId: string, userId: string): Promise<void> {
  const requestRef = db.collection('data_erasure_requests').doc(requestId);
  
  try {
    // Update status to processing
    await requestRef.update({ status: 'processing' });
    
    const collectionsErased: string[] = [];
    let recordsDeleted = 0;
    let recordsAnonymized = 0;
    const errors: string[] = [];
    
    // Process each collection based on retention policy
    for (const policy of RETENTION_POLICIES) {
      try {
        const result = await eraseUserDataFromCollection(userId, policy);
        
        collectionsErased.push(policy.collection);
        recordsDeleted += result.deleted;
        recordsAnonymized += result.anonymized;
        
      } catch (error: any) {
        errors.push(`${policy.collection}: ${error.message}`);
        console.error(`Error erasing data from ${policy.collection}:`, error);
      }
    }
    
    // Delete user profile (do this last)
    try {
      await db.collection('users').doc(userId).delete();
      recordsDeleted++;
      collectionsErased.push('users');
    } catch (error: any) {
      errors.push(`users: ${error.message}`);
    }
    
    // Update request with results
    await requestRef.update({
      status: errors.length > 0 ? 'failed' : 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      collectionsErased,
      recordsDeleted,
      recordsAnonymized,
      errors: errors.length > 0 ? errors : admin.firestore.FieldValue.delete(),
    });
    
    // Log to audit trail
    await db.collection('legal_audit_log').add({
      type: 'data_erasure',
      userId,
      requestId,
      collectionsErased,
      recordsDeleted,
      recordsAnonymized,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
  } catch (error) {
    console.error('Data erasure failed:', error);
    await requestRef.update({
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      errors: [(error as Error).message],
    });
  }
}

/**
 * Erase user data from a specific collection
 */
async function eraseUserDataFromCollection(
  userId: string,
  policy: DataRetentionPolicy
): Promise<{ deleted: number; anonymized: number }> {
  let deleted = 0;
  let anonymized = 0;
  
  // Query all documents for this user
  const snapshot = await db.collection(policy.collection)
    .where('userId', '==', userId)
    .get();
  
  const batch = db.batch();
  let batchCount = 0;
  
  for (const doc of snapshot.docs) {
    if (policy.anonymizeInstead) {
      // Anonymize instead of delete
      const anonymizedData = anonymizeDocument(doc.data(), policy.exemptFields);
      batch.update(doc.ref, anonymizedData);
      anonymized++;
    } else if (policy.autoDelete) {
      // Delete the document
      batch.delete(doc.ref);
      deleted++;
    }
    
    batchCount++;
    
    // Firestore batch limit is 500 operations
    if (batchCount >= 500) {
      await batch.commit();
      batchCount = 0;
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
  }
  
  return { deleted, anonymized };
}

/**
 * Anonymize a document while keeping exempt fields
 */
function anonymizeDocument(data: any, exemptFields?: string[]): any {
  const anonymized: any = {};
  
  // Keep exempt fields
  if (exemptFields) {
    for (const field of exemptFields) {
      if (data[field] !== undefined) {
        anonymized[field] = data[field];
      }
    }
  }
  
  // Replace user identifiable information
  anonymized.userId = 'ANONYMIZED';
  anonymized.anonymized = true;
  anonymized.anonymizedAt = admin.firestore.FieldValue.serverTimestamp();
  
  return anonymized;
}

// ============================================================================
// DATA EXPORT (GDPR RIGHT TO ACCESS)
// ============================================================================

/**
 * Request complete data export for a user
 */
export async function requestDataExport(
  userId: string,
  format: 'json' | 'zip' = 'json'
): Promise<DataExportRequest> {
  const request: DataExportRequest = {
    userId,
    requestedAt: new Date(),
    status: 'pending',
    format,
  };
  
  // Store export request
  const requestRef = await db.collection('data_export_requests').add({
    ...request,
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Start async processing
  processDataExport(requestRef.id, userId, format);
  
  return request;
}

/**
 * Process data export request
 */
async function processDataExport(
  requestId: string,
  userId: string,
  format: 'json' | 'zip'
): Promise<void> {
  const requestRef = db.collection('data_export_requests').doc(requestId);
  
  try {
    // Update status to processing
    await requestRef.update({ status: 'processing' });
    
    // Collect all user data
    const dataPackage = await collectUserData(userId);
    
    // Convert to requested format
    const data = format === 'json' 
      ? JSON.stringify(dataPackage, null, 2)
      : JSON.stringify(dataPackage); // In production, create actual ZIP
    
    // Store in Cloud Storage (or similar)
    // For now, we'll store in Firestore (in production, use Cloud Storage)
    const exportDoc = await db.collection('data_exports').add({
      userId,
      data,
      format,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    
    const downloadUrl = `https://avalo.app/api/data-export/${exportDoc.id}`;
    
    // Update request with results
    await requestRef.update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      downloadUrl,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      fileSize: Buffer.byteLength(data, 'utf8'),
    });
    
    // Log to audit trail
    await db.collection('legal_audit_log').add({
      type: 'data_export',
      userId,
      requestId,
      format,
      fileSize: Buffer.byteLength(data, 'utf8'),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
  } catch (error) {
    console.error('Data export failed:', error);
    await requestRef.update({
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Collect all user data from all collections
 */
async function collectUserData(userId: string): Promise<UserDataPackage> {
  const collections: Record<string, any[]> = {};
  let totalRecords = 0;
  
  // Get user profile
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.exists) {
    collections.users = [userDoc.data()];
    totalRecords++;
  }
  
  // Collect data from each collection
  const collectionsToExport = RETENTION_POLICIES.map(p => p.collection);
  
  for (const collectionName of collectionsToExport) {
    try {
      const snapshot = await db.collection(collectionName)
        .where('userId', '==', userId)
        .get();
      
      if (!snapshot.empty) {
        collections[collectionName] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        totalRecords += snapshot.size;
      }
    } catch (error) {
      console.error(`Error collecting data from ${collectionName}:`, error);
    }
  }
  
  // Get jurisdiction info
  const jurisdictionDoc = await db.collection('legal_jurisdiction').doc(userId).get();
  const jurisdiction = jurisdictionDoc.exists ? jurisdictionDoc.data()?.detectedCountry : 'Unknown';
  
  const dataPackage: UserDataPackage = {
    userId,
    exportedAt: new Date(),
    collections,
    metadata: {
      totalRecords,
      totalCollections: Object.keys(collections).length,
      jurisdiction,
    },
  };
  
  return dataPackage;
}

// ============================================================================
// AUTOMATIC DATA RETENTION
// ============================================================================

/**
 * Automatically delete/anonymize old data based on retention policies
 * Run this daily as a scheduled function
 */
export const enforceRetentionPolicies = functions.pubsub
  .schedule('0 2 * * *') // 02:00 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting retention policy enforcement');
    
    let totalDeleted = 0;
    let totalAnonymized = 0;
    
    for (const policy of RETENTION_POLICIES) {
      if (!policy.autoDelete || policy.retentionDays === 0) {
        continue; // Skip policies that don't auto-delete
      }
      
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
        
        // Find documents older than retention period
        const snapshot = await db.collection(policy.collection)
          .where('timestamp', '<', cutoffDate)
          .limit(500) // Process in batches
          .get();
        
        if (snapshot.empty) {
          continue;
        }
        
        const batch = db.batch();
        
        for (const doc of snapshot.docs) {
          if (policy.anonymizeInstead) {
            const anonymized = anonymizeDocument(doc.data(), policy.exemptFields);
            batch.update(doc.ref, anonymized);
            totalAnonymized++;
          } else {
            batch.delete(doc.ref);
            totalDeleted++;
          }
        }
        
        await batch.commit();
        
        console.log(`${policy.collection}: deleted ${totalDeleted}, anonymized ${totalAnonymized}`);
        
      } catch (error) {
        console.error(`Error processing ${policy.collection}:`, error);
      }
    }
    
    console.log(`Retention enforcement complete. Deleted: ${totalDeleted}, Anonymized: ${totalAnonymized}`);
  });

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Request data erasure (right to be forgotten)
 */
export const requestErasure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { reason } = data;
  
  // Check if user has pending erasure request
  const pending = await db.collection('data_erasure_requests')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'processing'])
    .limit(1)
    .get();
  
  if (!pending.empty) {
    throw new functions.https.HttpsError('already-exists', 'Erasure request already in progress');
  }
  
  const request = await requestDataErasure(userId, reason);
  
  return {
    message: 'Data erasure request submitted. This may take up to 30 days to complete.',
    requestId: request.userId,
  };
});

/**
 * Request data export (right to access)
 */
export const requestExport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { format } = data;
  
  const request = await requestDataExport(userId, format || 'json');
  
  return {
    message: 'Data export request submitted. You will receive a download link within 24 hours.',
    format: request.format,
  };
});

/**
 * Check status of data request
 */
export const checkDataRequestStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { type } = data; // 'erasure' or 'export'
  
  const collection = type === 'erasure' ? 'data_erasure_requests' : 'data_export_requests';
  
  const requests = await db.collection(collection)
    .where('userId', '==', userId)
    .orderBy('requestedAt', 'desc')
    .limit(1)
    .get();
  
  if (requests.empty) {
    return { status: 'none', message: 'No requests found' };
  }
  
  return requests.docs[0].data();
});
