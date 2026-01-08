/**
 * PACK 155: Data Retention Service
 * Core functions for GDPR/CCPA/LGPD/PDPA compliance
 */

import { db } from '../init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  DataCategory,
  RetentionStatus,
  PrivacyActionType,
  RETENTION_POLICIES,
  RetentionPolicy,
  DataRetentionLog,
  PrivacyActionLog
} from '../types/data-retention.types';
import {
  COLLECTION_NAMES,
  DataRetentionLogSchema,
  PrivacyActionLogSchema,
  LegalHoldSchema
} from '../schemas/data-retention.schema';

/**
 * Schedule data for deletion based on retention policy
 * GDPR Article 5(1)(e) - Storage limitation
 */
export async function scheduleDataDeletion(
  userId: string,
  category: DataCategory,
  dataId: string,
  dataType: string,
  createdAt: Date,
  metadata?: Record<string, any>
): Promise<string> {
  const policy = RETENTION_POLICIES[category];
  
  if (!policy) {
    throw new Error(`No retention policy found for category: ${category}`);
  }

  if (policy.retentionMonths === null && policy.deleteLogic === 'user_controlled') {
    return '';
  }

  const scheduledDeletionDate = calculateDeletionDate(createdAt, policy);
  
  const retentionLog: Omit<DataRetentionLogSchema, 'id'> = {
    userId,
    category,
    dataId,
    dataType,
    scheduledDeletionDate: Timestamp.fromDate(scheduledDeletionDate),
    status: RetentionStatus.ACTIVE,
    metadata,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  const docRef = await db.collection(COLLECTION_NAMES.DATA_RETENTION_LOGS).add(retentionLog);
  
  return docRef.id;
}

/**
 * Calculate deletion date based on retention policy
 */
function calculateDeletionDate(createdAt: Date, policy: RetentionPolicy): Date {
  if (policy.retentionMonths === null) {
    throw new Error('Cannot calculate deletion date for unlimited retention');
  }

  const deletionDate = new Date(createdAt);
  deletionDate.setMonth(deletionDate.getMonth() + policy.retentionMonths);
  
  return deletionDate;
}

/**
 * Execute scheduled data deletion
 * Runs as background job
 */
export async function executeDataDeletion(
  retentionLogId: string
): Promise<boolean> {
  const logRef = db.collection(COLLECTION_NAMES.DATA_RETENTION_LOGS).doc(retentionLogId);
  const logDoc = await logRef.get();

  if (!logDoc.exists) {
    throw new Error(`Retention log not found: ${retentionLogId}`);
  }

  const log = logDoc.data() as DataRetentionLogSchema;

  if (log.status === RetentionStatus.LEGAL_HOLD) {
    return false;
  }

  if (log.status === RetentionStatus.DELETED || log.status === RetentionStatus.ANONYMIZED) {
    return true;
  }

  const now = new Date();
  const scheduledDate = log.scheduledDeletionDate.toDate();

  if (now < scheduledDate) {
    return false;
  }

  const policy = RETENTION_POLICIES[log.category];
  const batch = db.batch();

  try {
    switch (policy.deleteLogic) {
      case 'auto_delete':
        await deleteData(log.category, log.dataId);
        batch.update(logRef, {
          status: RetentionStatus.DELETED,
          deletedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        break;

      case 'anonymize':
        await anonymizeData(log.category, log.dataId);
        batch.update(logRef, {
          status: RetentionStatus.ANONYMIZED,
          anonymizedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        break;

      case 'purge':
        await purgeData(log.category, log.dataId);
        batch.update(logRef, {
          status: RetentionStatus.DELETED,
          deletedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        break;

      default:
        return false;
    }

    await batch.commit();

    await logPrivacyAction(
      log.userId,
      PrivacyActionType.AUTO_DELETION_EXECUTED,
      {
        retentionLogId,
        category: log.category,
        dataId: log.dataId,
        deleteLogic: policy.deleteLogic
      },
      '0.0.0.0',
      'Avalo-System/1.0'
    );

    return true;
  } catch (error) {
    console.error('Error executing data deletion:', error);
    return false;
  }
}

/**
 * Delete data (hard delete)
 */
async function deleteData(category: DataCategory, dataId: string): Promise<void> {
  const collectionMap: Record<DataCategory, string> = {
    [DataCategory.CHATS_CALLS]: 'messages',
    [DataCategory.PUBLIC_POSTS]: 'posts',
    [DataCategory.PAID_CONTENT]: 'paid_content',
    [DataCategory.IDENTITY_DOCS]: 'identity_documents',
    [DataCategory.AI_COMPANION]: 'ai_companion_history',
    [DataCategory.SAFETY_CASES]: 'safety_cases',
    [DataCategory.ANALYTICS_DATA]: 'analytics_events',
    [DataCategory.LOCATION_DATA]: 'location_history',
    [DataCategory.DEVICE_DATA]: 'device_info'
  };

  const collection = collectionMap[category];
  if (!collection) return;

  await db.collection(collection).doc(dataId).delete();
}

/**
 * Anonymize data (remove PII, keep aggregate data)
 */
async function anonymizeData(category: DataCategory, dataId: string): Promise<void> {
  const collectionMap: Record<DataCategory, string> = {
    [DataCategory.CHATS_CALLS]: 'messages',
    [DataCategory.PUBLIC_POSTS]: 'posts',
    [DataCategory.PAID_CONTENT]: 'paid_content',
    [DataCategory.IDENTITY_DOCS]: 'identity_documents',
    [DataCategory.AI_COMPANION]: 'ai_companion_history',
    [DataCategory.SAFETY_CASES]: 'safety_cases',
    [DataCategory.ANALYTICS_DATA]: 'analytics_events',
    [DataCategory.LOCATION_DATA]: 'location_history',
    [DataCategory.DEVICE_DATA]: 'device_info'
  };

  const collection = collectionMap[category];
  if (!collection) return;

  const docRef = db.collection(collection).doc(dataId);
  
  await docRef.update({
    userId: 'ANONYMIZED',
    userEmail: null,
    userName: null,
    userPhone: null,
    ipAddress: null,
    deviceId: null,
    metadata: FieldValue.delete(),
    anonymizedAt: Timestamp.now()
  });
}

/**
 * Purge data (immediate full deletion, no trace)
 */
async function purgeData(category: DataCategory, dataId: string): Promise<void> {
  await deleteData(category, dataId);
}

/**
 * Log privacy-related action
 * GDPR Article 30 - Records of processing activities
 */
export async function logPrivacyAction(
  userId: string,
  actionType: PrivacyActionType,
  details: Record<string, any>,
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const log: Omit<PrivacyActionLogSchema, 'id'> = {
    userId,
    actionType,
    details,
    ipAddress,
    userAgent,
    timestamp: Timestamp.now()
  };

  const docRef = await db.collection(COLLECTION_NAMES.PRIVACY_ACTION_LOGS).add(log);
  
  return docRef.id;
}

/**
 * Pause deletion for legal hold
 * Used for ongoing investigations
 */
export async function pauseDeletionForLegalHold(
  userId: string,
  reason: string,
  requestedBy: string,
  requestedByRole: 'legal' | 'safety' | 'compliance' | 'law_enforcement',
  categories: DataCategory[],
  caseNumber?: string
): Promise<string> {
  if (!['legal', 'safety', 'compliance', 'law_enforcement'].includes(requestedByRole)) {
    throw new Error('Invalid requestedBy role for legal hold');
  }

  const legalHold: Omit<LegalHoldSchema, 'id'> = {
    userId,
    reason,
    requestedBy,
    requestedByRole,
    caseNumber,
    categories,
    appliedAt: Timestamp.now(),
    status: 'active'
  };

  const docRef = await db.collection(COLLECTION_NAMES.LEGAL_HOLDS).add(legalHold);

  const retentionLogsQuery = db
    .collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
    .where('userId', '==', userId)
    .where('category', 'in', categories)
    .where('status', 'in', [RetentionStatus.ACTIVE, RetentionStatus.SCHEDULED_DELETION]);

  const logsSnapshot = await retentionLogsQuery.get();
  const batch = db.batch();

  logsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: RetentionStatus.LEGAL_HOLD,
      legalHoldReason: reason,
      legalHoldRequestedBy: requestedBy,
      legalHoldDate: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  });

  await batch.commit();

  await logPrivacyAction(
    userId,
    PrivacyActionType.LEGAL_HOLD_APPLIED,
    {
      legalHoldId: docRef.id,
      reason,
      requestedBy,
      caseNumber,
      categories,
      affectedLogs: logsSnapshot.size
    },
    '0.0.0.0',
    'Avalo-System/1.0'
  );

  return docRef.id;
}

/**
 * Release legal hold
 */
export async function releaseLegalHold(
  legalHoldId: string,
  releasedBy: string
): Promise<void> {
  const holdRef = db.collection(COLLECTION_NAMES.LEGAL_HOLDS).doc(legalHoldId);
  const holdDoc = await holdRef.get();

  if (!holdDoc.exists) {
    throw new Error(`Legal hold not found: ${legalHoldId}`);
  }

  const hold = holdDoc.data() as LegalHoldSchema;

  if (hold.status === 'released') {
    return;
  }

  await holdRef.update({
    status: 'released',
    releasedAt: Timestamp.now()
  });

  const retentionLogsQuery = db
    .collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
    .where('userId', '==', hold.userId)
    .where('status', '==', RetentionStatus.LEGAL_HOLD);

  const logsSnapshot = await retentionLogsQuery.get();
  const batch = db.batch();

  logsSnapshot.docs.forEach(doc => {
    const log = doc.data() as DataRetentionLogSchema;
    const now = new Date();
    const scheduledDate = log.scheduledDeletionDate.toDate();
    
    const newStatus = now >= scheduledDate 
      ? RetentionStatus.SCHEDULED_DELETION 
      : RetentionStatus.ACTIVE;

    batch.update(doc.ref, {
      status: newStatus,
      legalHoldReason: FieldValue.delete(),
      legalHoldRequestedBy: FieldValue.delete(),
      legalHoldDate: FieldValue.delete(),
      updatedAt: Timestamp.now()
    });
  });

  await batch.commit();

  await logPrivacyAction(
    hold.userId,
    PrivacyActionType.LEGAL_HOLD_RELEASED,
    {
      legalHoldId,
      releasedBy,
      affectedLogs: logsSnapshot.size
    },
    '0.0.0.0',
    'Avalo-System/1.0'
  );
}

/**
 * Check if user has active legal hold
 */
export async function hasActiveLegalHold(userId: string): Promise<boolean> {
  const holdQuery = db
    .collection(COLLECTION_NAMES.LEGAL_HOLDS)
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1);

  const snapshot = await holdQuery.get();
  
  return !snapshot.empty;
}

/**
 * Get retention summary for user
 */
export async function getRetentionSummary(userId: string): Promise<any> {
  const logsQuery = db
    .collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
    .where('userId', '==', userId);

  const logsSnapshot = await logsQuery.get();

  const categoryMap = new Map<DataCategory, any>();

  logsSnapshot.docs.forEach(doc => {
    const log = doc.data() as DataRetentionLogSchema;
    
    if (!categoryMap.has(log.category)) {
      categoryMap.set(log.category, {
        category: log.category,
        itemCount: 0,
        oldestItem: log.createdAt.toDate(),
        scheduledDeletionDate: log.scheduledDeletionDate.toDate(),
        retentionPolicy: RETENTION_POLICIES[log.category]
      });
    }

    const categoryData = categoryMap.get(log.category)!;
    categoryData.itemCount++;
    
    if (log.createdAt.toDate() < categoryData.oldestItem) {
      categoryData.oldestItem = log.createdAt.toDate();
    }
  });

  const hasLegalHold = await hasActiveLegalHold(userId);

  return {
    userId,
    categories: Array.from(categoryMap.values()),
    hasLegalHold
  };
}