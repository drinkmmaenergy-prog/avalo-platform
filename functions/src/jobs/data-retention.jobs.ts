/**
 * PACK 155: Data Retention Background Jobs
 * Scheduled functions for automated compliance tasks
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import { 
  RetentionStatus,
  ExportStatus
} from '../types/data-retention.types';
import { COLLECTION_NAMES } from '../schemas/data-retention.schema';
import { executeDataDeletion } from '../services/data-retention.service';
import { cleanupExpiredExports } from '../services/data-export.service';

/**
 * Scheduled job: Execute retention policy deletions
 * Runs every 6 hours
 */
export const processRetentionDeletions = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    console.log('Starting retention deletion job...');
    
    const now = Timestamp.now();
    const batchSize = 100;
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;

    try {
      const scheduledQuery = db
        .collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
        .where('status', '==', RetentionStatus.ACTIVE)
        .where('scheduledDeletionDate', '<=', now)
        .limit(batchSize);

      const snapshot = await scheduledQuery.get();
      
      console.log(`Found ${snapshot.size} items scheduled for deletion`);

      for (const doc of snapshot.docs) {
        try {
          const success = await executeDataDeletion(doc.id);
          
          if (success) {
            successCount++;
          }
          
          processedCount++;
        } catch (error) {
          console.error(`Error deleting ${doc.id}:`, error);
          failureCount++;
        }
      }

      console.log(`Retention deletion job completed. Processed: ${processedCount}, Success: ${successCount}, Failures: ${failureCount}`);
    } catch (error) {
      console.error('Retention deletion job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Mark items for scheduled deletion
 * Runs daily at 2 AM UTC
 */
export const markItemsForScheduledDeletion = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 300
  },
  async (event) => {
    console.log('Starting scheduled deletion marking job...');
    
    const now = Timestamp.now();
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoTimestamp = Timestamp.fromDate(oneDayAgo);
    
    let markedCount = 0;

    try {
      const dueQuery = db
        .collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
        .where('status', '==', RetentionStatus.ACTIVE)
        .where('scheduledDeletionDate', '<=', Timestamp.fromDate(oneDayAgo))
        .limit(500);

      const snapshot = await dueQuery.get();
      
      if (snapshot.empty) {
        console.log('No items due for scheduled deletion');
        return;
      }

      const batch = db.batch();
      
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: RetentionStatus.SCHEDULED_DELETION,
          updatedAt: now
        });
        markedCount++;
      });

      await batch.commit();
      
      console.log(`Marked ${markedCount} items for scheduled deletion`);
    } catch (error) {
      console.error('Scheduled deletion marking job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Clean up expired data exports
 * Runs every 12 hours
 */
export const cleanupExpiredDataExports = onSchedule(
  {
    schedule: 'every 12 hours',
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 300
  },
  async (event) => {
    console.log('Starting expired exports cleanup job...');
    
    try {
      const deletedCount = await cleanupExpiredExports();
      
      console.log(`Expired exports cleanup completed. Cleaned up: ${deletedCount} exports`);
    } catch (error) {
      console.error('Expired exports cleanup job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Anonymize old financial records
 * Runs weekly on Sunday at 3 AM UTC
 */
export const anonymizeOldFinancialRecords = onSchedule(
  {
    schedule: 'every sunday 03:00',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    console.log('Starting financial records anonymization job...');
    
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
    const cutoffDate = Timestamp.fromDate(sevenYearsAgo);
    
    let anonymizedCount = 0;

    try {
      const oldTransactionsQuery = db
        .collection('paid_content')
        .where('purchasedAt', '<', cutoffDate)
        .where('anonymizedAt', '==', null)
        .limit(500);

      const snapshot = await oldTransactionsQuery.get();
      
      if (snapshot.empty) {
        console.log('No old financial records to anonymize');
        return;
      }

      const batch = db.batch();
      
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          buyerId: 'ANONYMIZED',
          buyerEmail: null,
          buyerName: null,
          ipAddress: null,
          deviceId: null,
          anonymizedAt: Timestamp.now()
        });
        anonymizedCount++;
      });

      await batch.commit();
      
      console.log(`Anonymized ${anonymizedCount} old financial records`);
    } catch (error) {
      console.error('Financial records anonymization job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Purge identity documents after verification
 * Runs every hour
 */
export const purgeVerifiedIdentityDocuments = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 300
  },
  async (event) => {
    console.log('Starting identity document purge job...');
    
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const cutoffDate = Timestamp.fromDate(twentyFourHoursAgo);
    
    let purgedCount = 0;

    try {
      const verifiedDocsQuery = db
        .collection('identity_documents')
        .where('status', '==', 'verified')
        .where('verifiedAt', '<', cutoffDate)
        .limit(100);

      const snapshot = await verifiedDocsQuery.get();
      
      if (snapshot.empty) {
        console.log('No verified identity documents to purge');
        return;
      }

      const batch = db.batch();
      
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        purgedCount++;
      });

      await batch.commit();
      
      console.log(`Purged ${purgedCount} verified identity documents`);
    } catch (error) {
      console.error('Identity document purge job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Clean up old privacy action logs
 * Runs monthly on the 1st at 4 AM UTC
 * Keeps logs for 2 years as required by GDPR Article 30
 */
export const cleanupOldPrivacyLogs = onSchedule(
  {
    schedule: 'every month 1 04:00',
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 300
  },
  async (event) => {
    console.log('Starting privacy logs cleanup job...');
    
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const cutoffDate = Timestamp.fromDate(twoYearsAgo);
    
    let deletedCount = 0;

    try {
      const oldLogsQuery = db
        .collection(COLLECTION_NAMES.PRIVACY_ACTION_LOGS)
        .where('timestamp', '<', cutoffDate)
        .limit(1000);

      const snapshot = await oldLogsQuery.get();
      
      if (snapshot.empty) {
        console.log('No old privacy logs to clean up');
        return;
      }

      const batch = db.batch();
      
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
      
      console.log(`Deleted ${deletedCount} old privacy action logs`);
    } catch (error) {
      console.error('Privacy logs cleanup job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Auto-expire AI companion history
 * Runs daily at 1 AM UTC
 * Removes AI companion data older than 6 months
 */
export const expireAICompanionHistory = onSchedule(
  {
    schedule: 'every day 01:00',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    console.log('Starting AI companion history expiration job...');
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffDate = Timestamp.fromDate(sixMonthsAgo);
    
    let expiredCount = 0;

    try {
      const oldHistoryQuery = db
        .collection('ai_companion_history')
        .where('timestamp', '<', cutoffDate)
        .limit(1000);

      const snapshot = await oldHistoryQuery.get();
      
      if (snapshot.empty) {
        console.log('No AI companion history to expire');
        return;
      }

      const batch = db.batch();
      
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        expiredCount++;
      });

      await batch.commit();
      
      console.log(`Expired ${expiredCount} AI companion history entries`);
    } catch (error) {
      console.error('AI companion history expiration job failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Report compliance metrics
 * Runs daily at 6 AM UTC
 */
export const reportComplianceMetrics = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 180
  },
  async (event) => {
    console.log('Generating compliance metrics report...');
    
    try {
      const [
        activeRetentionLogs,
        scheduledDeletions,
        legalHolds,
        pendingExports,
        completedExports,
        pendingDeletions,
        completedDeletions
      ] = await Promise.all([
        db.collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
          .where('status', '==', RetentionStatus.ACTIVE)
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.DATA_RETENTION_LOGS)
          .where('status', '==', RetentionStatus.SCHEDULED_DELETION)
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.LEGAL_HOLDS)
          .where('status', '==', 'active')
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS)
          .where('status', 'in', [ExportStatus.PENDING, ExportStatus.PROCESSING])
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS)
          .where('status', 'in', [ExportStatus.READY, ExportStatus.DOWNLOADED])
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS)
          .where('status', 'in', ['requested', 'account_frozen', 'processing'])
          .count()
          .get(),
        db.collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS)
          .where('status', '==', 'completed')
          .count()
          .get()
      ]);

      const metrics = {
        timestamp: new Date().toISOString(),
        activeRetentionLogs: activeRetentionLogs.data().count,
        scheduledDeletions: scheduledDeletions.data().count,
        activeLegalHolds: legalHolds.data().count,
        pendingExports: pendingExports.data().count,
        completedExports: completedExports.data().count,
        pendingDeletions: pendingDeletions.data().count,
        completedDeletions: completedDeletions.data().count
      };

      console.log('Compliance Metrics:', JSON.stringify(metrics, null, 2));

      await db.collection('compliance_metrics').add({
        ...metrics,
        createdAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Compliance metrics report job failed:', error);
      throw error;
    }
  }
);