/**
 * PACK 388 — Data Retention & Logging Governance
 * 
 * Implements automated data retention policies per jurisdiction:
 * - Jurisdiction-based retention periods
 * - Automated purge execution
 * - Cryptographic erase logs  
 * - Legal hold management
 * 
 * Dependencies: PACK 296 (Audit)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Data retention policy per jurisdiction
 */
interface RetentionPolicy {
  id: string;
  jurisdiction: string;
  dataType: string;
  retentionDays: number;
  legalBasis: string;
  active: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * Retention periods by jurisdiction and data type
 */
const RETENTION_POLICIES: Record<string, Record<string, number>> = {
  EU: {
    chats: 90,
    gps: 30,
    panicSignals: 2555, // 7 years
    payments: 2555, // 7 years (financial records)
    verifications: 2555, // 7 years (KYC/AML)
    fraudSignals: 1825, // 5 years
    supportTickets: 365,
    userProfiles: 30, // After account deletion
    callRecordings: 90,
    mediaContent: 365
  },
  US: {
    chats: 90,
    gps: 30,
    panicSignals: 2555, // 7 years
    payments: 2555, // 7 years 
    verifications: 1825, // 5 years
    fraudSignals: 1825, // 5 years
    supportTickets: 365,
    userProfiles: 30,
    callRecordings: 90,
    mediaContent: 365
  },
  UK: {
    chats: 90,
    gps: 30,
    panicSignals: 2555, // 7 years
    payments: 2555, // 7 years
    verifications: 2555, // 7 years
    fraudSignals: 1825, // 5 years
    supportTickets: 365,
    userProfiles: 30,
    callRecordings: 90,
    mediaContent: 365
  },
  DEFAULT: {
    chats: 90,
    gps: 30,
    panicSignals: 2555,
    payments: 2555,
    verifications: 2555,
    fraudSignals: 1825,
    supportTickets: 365,
    userProfiles: 30,
    callRecordings: 90,
    mediaContent: 365
  }
};

/**
 * Get retention days for data type and jurisdiction
 */
function getRetentionDays(dataType: string, jurisdiction: string): number {
  const policies = RETENTION_POLICIES[jurisdiction] || RETENTION_POLICIES.DEFAULT;
  return policies[dataType] || 365; // Default 1 year
}

/**
 * Execute automated retention purge (runs daily)
 */
export const pack388_executeRetentionPurge = functions.pubsub
  .schedule('every 24 hours at 03:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🗑️ Starting automated retention purge...');

    const now = admin.firestore.Timestamp.now();
    const purgeResults = {
      totalPurged: 0,
      byDataType: {} as Record<string, number>,
      errors: [] as string[]
    };

    try {
      // Get all active retention policies
      const policiesSnapshot = await db.collection('dataRetentionPolicies')
        .where('active', '==', true)
        .get();

      const policies = policiesSnapshot.docs.map(doc => doc.data() as RetentionPolicy);

      // Group by data type
      const dataTypes = new Set(policies.map(p => p.dataType));

      for (const dataType of dataTypes) {
        try {
          const purgeCount = await purgeDataType(dataType, policies.filter(p => p.dataType === dataType));
          purgeResults.totalPurged += purgeCount;
          purgeResults.byDataType[dataType] = purgeCount;
          
          console.log(`✅ Purged ${purgeCount} records from ${dataType}`);
        } catch (error) {
          console.error(`❌ Error purging ${dataType}:`, error);
          purgeResults.errors.push(`${dataType}: ${error.message}`);
        }
      }

      // Log purge summary
      await db.collection('retentionPurgeLogs').add({
        executedAt: now,
        totalPurged: purgeResults.totalPurged,
        byDataType: purgeResults.byDataType,
        errors: purgeResults.errors,
        success: purgeResults.errors.length === 0
      });

      console.log(`🗑️ Retention purge complete. Total purged: ${purgeResults.totalPurged}`);

      return purgeResults;

    } catch (error) {
      console.error('Error executing retention purge:', error);
      return null;
    }
  });

/**
 * Purge data for specific data type
 */
async function purgeDataType(dataType: string, policies: RetentionPolicy[]): Promise<number> {
  let totalPurged = 0;

  // Get collection name mapping
  const collectionMap: Record<string, string> = {
    chats: 'messages',
    gps: 'locations',
    panicSignals: 'panicSignals',
    payments: 'transactions',
    verifications: 'ageVerifications',
    fraudSignals: 'fraudSignals',
    supportTickets: 'supportTickets',
    userProfiles: 'userProfiles',
    callRecordings: 'callRecordings',
    mediaContent: 'posts'
  };

  const collection = collectionMap[dataType];
  if (!collection) {
    console.warn(`No collection mapping for data type: ${dataType}`);
    return 0;
  }

  // Check for legal holds
  const legalHolds = await db.collection('legalHolds')
    .where('active', '==', true)
    .get();

  const protectedUserIds = new Set(legalHolds.docs.map(doc => doc.data().userId));

  // Process each jurisdiction's retention period
  for (const policy of policies) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    // Find expired data
    const expiredData = await db.collection(collection)
      .where('createdAt', '<=', cutoffTimestamp)
      .limit(500) // Process in batches
      .get();

    if (expiredData.empty) continue;

    // Filter out protected data
    const toDelete = expiredData.docs.filter(doc => {
      const data = doc.data();
      // Don't delete if user has legal hold
      if (protectedUserIds.has(data.userId)) return false;
      // Don't delete if marked for preservation
      if (data.preserveForLegal) return false;
      return true;
    });

    // Execute deletion in batches
    const batchSize = 500;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = db.batch();
      const batchItems = toDelete.slice(i, i + batchSize);

      for (const doc of batchItems) {
        // Create cryptographic erase log before deletion
        await createEraseLog(doc.id, collection, doc.data(), policy.jurisdiction);
        
        // Delete document
        batch.delete(doc.ref);
      }

      await batch.commit();
      totalPurged += batchItems.length;
    }
  }

  return totalPurged;
}

/**
 * Create cryptographic erase log (immutable proof of deletion)
 */
async function createEraseLog(
  documentId: string,
  collection: string,
  metadata: any,
  jurisdiction: string
): Promise<void> {
  const crypto = require('crypto');
  
  // Create hash of original data (proof it existed)
  const dataHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(metadata))
    .digest('hex');

  await db.collection('cryptographicEraseLogs').add({
    documentId,
    collection,
    dataHash,
    jurisdiction,
    userId: metadata.userId,
    erasedAt: admin.firestore.Timestamp.now(),
    retentionPeriodExpired: true,
    legalBasis: 'RETENTION_POLICY_EXPIRED',
    immutable: true
  });
}

/**
 * Apply legal hold (prevents auto-deletion)
 */
export const pack388_applyLegalHold = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  // Check admin permissions
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.permissions?.includes('LEGAL_HOLD')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { userId, reason, dataTypes } = data;

  try {
    const holdRef = db.collection('legalHolds').doc();

    await holdRef.set({
      id: holdRef.id,
      userId,
      reason,
      dataTypes: dataTypes || 'ALL',
      active: true,
      appliedBy: context.auth.uid,
      appliedAt: admin.firestore.Timestamp.now(),
      retainAllData: true,
      notes: data.notes
    });

    // Flag all user data for preservation
    const collections = [
      'messages', 'locations', 'panicSignals', 'transactions',
      'ageVerifications', 'fraudSignals', 'supportTickets', 'posts'
    ];

    for (const collection of collections) {
      const userDocs = await db.collection(collection)
        .where('userId', '==', userId)
        .get();

      const batch = db.batch();
      userDocs.docs.forEach(doc => {
        batch.update(doc.ref, {
          preserveForLegal: true,
          legalHoldId: holdRef.id,
          legalHoldAppliedAt: admin.firestore.Timestamp.now()
        });
      });
      await batch.commit();
    }

    console.log(`⚖️ Legal hold applied for user ${userId}`);

    return {
      success: true,
      holdId: holdRef.id,
      message: 'Legal hold applied successfully'
    };

  } catch (error) {
    console.error('Error applying legal hold:', error);
    throw new functions.https.HttpsError('internal', 'Failed to apply legal hold');
  }
});

/**
 * Release legal hold
 */
export const pack388_releaseLegalHold = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  // Check admin permissions
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.permissions?.includes('LEGAL_HOLD')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { holdId } = data;

  try {
    const holdDoc = await db.collection('legalHolds').doc(holdId).get();
    if (!holdDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Legal hold not found');
    }

    const hold = holdDoc.data();
    const userId = hold.userId;

    // Deactivate hold
    await holdDoc.ref.update({
      active: false,
      releasedBy: context.auth.uid,
      releasedAt: admin.firestore.Timestamp.now()
    });

    // Remove preservation flags
    const collections = [
      'messages', 'locations', 'panicSignals', 'transactions',
      'ageVerifications', 'fraudSignals', 'supportTickets', 'posts'
    ];

    for (const collection of collections) {
      const userDocs = await db.collection(collection)
        .where('userId', '==', userId)
        .where('legalHoldId', '==', holdId)
        .get();

      const batch = db.batch();
      userDocs.docs.forEach(doc => {
        batch.update(doc.ref, {
          preserveForLegal: false,
          legalHoldId: null,
          legalHoldReleasedAt: admin.firestore.Timestamp.now()
        });
      });
      await batch.commit();
    }

    console.log(`⚖️ Legal hold released for user ${userId}`);

    return {
      success: true,
      message: 'Legal hold released successfully'
    };

  } catch (error) {
    console.error('Error releasing legal hold:', error);
    throw error;
  }
});

/**
 * Initialize retention policies for all jurisdictions
 */
export const pack388_initializeRetentionPolicies = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  try {
    const policies: RetentionPolicy[] = [];
    const now = admin.firestore.Timestamp.now();

    for (const [jurisdiction, dataTypes] of Object.entries(RETENTION_POLICIES)) {
      for (const [dataType, retentionDays] of Object.entries(dataTypes)) {
        policies.push({
          id: `${jurisdiction}_${dataType}`,
          jurisdiction,
          dataType,
          retentionDays,
          legalBasis: jurisdiction === 'EU' ? 'GDPR Article 5(1)(e)' : 'Data Protection Laws',
          active: true,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    // Batch write policies
    const batchSize = 500;
    for (let i = 0; i < policies.length; i += batchSize) {
      const batch = db.batch();
      const batchPolicies = policies.slice(i, i + batchSize);

      for (const policy of batchPolicies) {
        const policyRef = db.collection('dataRetentionPolicies').doc(policy.id);
        batch.set(policyRef, policy);
      }

      await batch.commit();
    }

    console.log(`✅ Initialized ${policies.length} retention policies`);

    return {
      success: true,
      policiesCreated: policies.length,
      message: 'Retention policies initialized successfully'
    };

  } catch (error) {
    console.error('Error initializing retention policies:', error);
    throw new functions.https.HttpsError('internal', 'Failed to initialize retention policies');
  }
});

/**
 * Get retention policy for data type and jurisdiction
 */
export const pack388_getRetentionPolicy = functions.https.onCall(async (data, context) => {
  const { dataType, jurisdiction } = data;

  try {
    const policyId = `${jurisdiction}_${dataType}`;
    const policyDoc = await db.collection('dataRetentionPolicies').doc(policyId).get();

    if (policyDoc.exists) {
      return {
        success: true,
        policy: policyDoc.data()
      };
    }

    // Fallback to default
    const defaultPolicyId = `DEFAULT_${dataType}`;
    const defaultDoc = await db.collection('dataRetentionPolicies').doc(defaultPolicyId).get();

    return {
      success: true,
      policy: defaultDoc.exists ? defaultDoc.data() : null,
      usingDefault: true
    };

  } catch (error) {
    console.error('Error getting retention policy:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get retention policy');
  }
});
