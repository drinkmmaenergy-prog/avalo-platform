/**
 * PACK 296 — Data Retention & Cleanup Jobs
 * Scheduled functions for data retention compliance
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import { DATA_RETENTION } from './pack296-audit-helpers';
import type { RetentionJobResult } from './types/audit.types';

// ============================================================================
// DATA RETENTION JOB (Runs daily)
// ============================================================================

/**
 * Daily job to clean up old audit logs and compliance data
 * Respects retention policies while maintaining compliance requirements
 */
export const retention_dailyCleanup = functions.pubsub
  .schedule('0 3 * * *') // Run at 3 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[RETENTION] Starting daily cleanup job');

    const results: Record<string, RetentionJobResult> = {
      auditLogs: await cleanupAuditLogs(),
      safetyReports: await cleanupSafetyReports(),
      adminSessions: await cleanupAdminSessions(),
    };

    console.log('[RETENTION] Daily cleanup completed:', results);

    // Log results to a tracking collection
    await db.collection('retentionJobRuns').add({
      jobId: context.eventId,
      runAt: serverTimestamp(),
      results,
    });

    return null;
  });

/**
 * Cleanup old audit logs (5 years retention)
 */
async function cleanupAuditLogs(): Promise<RetentionJobResult> {
  const result: RetentionJobResult = {
    processed: 0,
    deleted: 0,
    anonymized: 0,
    errors: 0,
  };

  try {
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() - DATA_RETENTION.auditLogsYears);

    console.log(`[RETENTION] Cleaning audit logs older than ${retentionDate.toISOString()}`);

    // Query old logs in batches
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const snapshot = await db
        .collection('auditLogs')
        .where('timestamp', '<', retentionDate)
        .orderBy('timestamp', 'asc')
        .limit(batchSize)
        .get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      result.processed += snapshot.size;

      // Decide whether to delete or anonymize based on sensitivity
      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Financial records must be kept longer
        const isFinancial = [
          'TOKEN_PURCHASE',
          'PAYOUT_REQUESTED',
          'PAYOUT_APPROVED',
          'PAYOUT_REJECTED',
          'PAYOUT_PAID',
        ].includes(data.actionType);

        if (isFinancial) {
          // Check if within financial retention period (10 years)
          const financialRetentionDate = new Date();
          financialRetentionDate.setFullYear(
            financialRetentionDate.getFullYear() - DATA_RETENTION.financialRecordsYears
          );

          if (data.timestamp.toDate() < financialRetentionDate) {
            // Anonymize but keep for compliance
            batch.update(doc.ref, {
              actorId: null,
              'metadata.ipHash': null,
              'metadata.deviceId': null,
              anonymized: true,
              anonymizedAt: serverTimestamp(),
            });
            result.anonymized++;
          }
        } else {
          // Non-financial: safe to delete after retention period
          batch.delete(doc.ref);
          result.deleted++;
        }
      });

      await batch.commit();

      // If we got less than batch size, we're done
      if (snapshot.size < batchSize) {
        hasMore = false;
      }
    }

    console.log(`[RETENTION] Audit logs: ${result.deleted} deleted, ${result.anonymized} anonymized`);
  } catch (error) {
    console.error('[RETENTION] Error cleaning audit logs:', error);
    result.errors++;
  }

  return result;
}

/**
 * Cleanup old safety reports (5 years retention)
 */
async function cleanupSafetyReports(): Promise<RetentionJobResult> {
  const result: RetentionJobResult = {
    processed: 0,
    deleted: 0,
    anonymized: 0,
    errors: 0,
  };

  try {
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() - DATA_RETENTION.safetyReportsYears);

    console.log(`[RETENTION] Cleaning safety reports older than ${retentionDate.toISOString()}`);

    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const snapshot = await db
        .collection('safetyReports')
        .where('createdAt', '<', retentionDate)
        .orderBy('createdAt', 'asc')
        .limit(batchSize)
        .get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      result.processed += snapshot.size;

      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Keep serious cases anonymized, delete minor ones
        if (data.severity === 'SEVERE' || data.severity === 'CRITICAL') {
          batch.update(doc.ref, {
            reporterId: null,
            targetUserId: null,
            reporterEmail: null,
            anonymized: true,
            anonymizedAt: serverTimestamp(),
          });
          result.anonymized++;
        } else {
          batch.delete(doc.ref);
          result.deleted++;
        }
      });

      await batch.commit();

      if (snapshot.size < batchSize) {
        hasMore = false;
      }
    }

    console.log(`[RETENTION] Safety reports: ${result.deleted} deleted, ${result.anonymized} anonymized`);
  } catch (error) {
    console.error('[RETENTION] Error cleaning safety reports:', error);
    result.errors++;
  }

  return result;
}

/**
 * Cleanup old admin session logs (1 year retention)
 */
async function cleanupAdminSessions(): Promise<RetentionJobResult> {
  const result: RetentionJobResult = {
    processed: 0,
    deleted: 0,
    anonymized: 0,
    errors: 0,
  };

  try {
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() - 1);

    console.log(`[RETENTION] Cleaning admin sessions older than ${retentionDate.toISOString()}`);

    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const snapshot = await db
        .collection('adminSessionLogs')
        .where('startedAt', '<', retentionDate)
        .orderBy('startedAt', 'asc')
        .limit(batchSize)
        .get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      result.processed += snapshot.size;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        result.deleted++;
      });

      await batch.commit();

      if (snapshot.size < batchSize) {
        hasMore = false;
      }
    }

    console.log(`[RETENTION] Admin sessions: ${result.deleted} deleted`);
  } catch (error) {
    console.error('[RETENTION] Error cleaning admin sessions:', error);
    result.errors++;
  }

  return result;
}

// ============================================================================
// USER DATA DELETION HOOKS
// ============================================================================

/**
 * Handle user data deletion request (GDPR compliance)
 * Pseudonymize data while preserving compliance requirements
 */
export const retention_handleUserDeletion = functions.firestore
  .document('users/{userId}/dataRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const { userId } = context.params;
    const request = snap.data();

    if (request.type !== 'DELETE') {
      return;
    }

    console.log(`[RETENTION] Processing data deletion request for user ${userId}`);

    try {
      // Pseudonymize audit logs (preserve for compliance)
      const auditLogsSnapshot = await db
        .collection('auditLogs')
        .where('actorId', '==', userId)
        .get();

      const batch = db.batch();
      let updateCount = 0;

      auditLogsSnapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Financial and safety logs must be preserved (pseudonymized)
        const isFinancial = [
          'TOKEN_PURCHASE',
          'PAYOUT_REQUESTED',
          'PAYOUT_APPROVED',
          'PAYOUT_REJECTED',
          'PAYOUT_PAID',
        ].includes(data.actionType);

        const isSafety = [
          'SAFETY_REPORT_SUBMITTED',
          'PANIC_BUTTON_TRIGGERED',
          'ACCOUNT_BANNED',
          'ACCOUNT_SUSPENDED',
        ].includes(data.actionType);

        if (isFinancial || isSafety) {
          // Map to internal case ID for compliance tracking
          batch.update(doc.ref, {
            actorId: `DELETED_${userId.substring(0, 8)}`,
            'metadata.ipHash': null,
            'metadata.deviceId': null,
            deletionRequested: true,
            deletionRequestedAt: serverTimestamp(),
          });
          updateCount++;
        } else {
          // Non-critical logs can be deleted
          batch.delete(doc.ref);
        }
      });

      if (updateCount > 0) {
        await batch.commit();
      }

      console.log(`[RETENTION] Pseudonymized ${updateCount} audit logs for user ${userId}`);

      // Update request status
      await snap.ref.update({
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
        logsProcessed: auditLogsSnapshot.size,
        logsPseudonymized: updateCount,
      });
    } catch (error) {
      console.error('[RETENTION] Error processing user deletion:', error);

      await snap.ref.update({
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: serverTimestamp(),
      });
    }
  });

/**
 * Manual cleanup trigger for specific user (admin use)
 */
export const admin_triggerUserDataCleanup = functions.https.onCall(
  async (data: { userId: string; deleteAll?: boolean }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    // TODO: Add admin permission check

    const { userId, deleteAll = false } = data;

    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }

    try {
      if (deleteAll) {
        // Delete all non-compliance audit logs
        const logsSnapshot = await db
          .collection('auditLogs')
          .where('actorId', '==', userId)
          .get();

        const batch = db.batch();
        let deletedCount = 0;

        logsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          const isFinancial = [
            'TOKEN_PURCHASE',
            'PAYOUT_REQUESTED',
            'PAYOUT_APPROVED',
            'PAYOUT_REJECTED',
            'PAYOUT_PAID',
          ].includes(data.actionType);

          if (!isFinancial) {
            batch.delete(doc.ref);
            deletedCount++;
          }
        });

        await batch.commit();

        return {
          success: true,
          message: `Deleted ${deletedCount} non-financial audit logs for user ${userId}`,
        };
      } else {
        // Just anonymize
        const logsSnapshot = await db
          .collection('auditLogs')
          .where('actorId', '==', userId)
          .get();

        const batch = db.batch();

        logsSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            actorId: `ANON_${userId.substring(0, 8)}`,
            'metadata.ipHash': null,
            'metadata.deviceId': null,
            anonymized: true,
            anonymizedAt: serverTimestamp(),
          });
        });

        await batch.commit();

        return {
          success: true,
          message: `Anonymized ${logsSnapshot.size} audit logs for user ${userId}`,
        };
      }
    } catch (error: any) {
      console.error('Error cleaning user data:', error);
      throw new functions.https.HttpsError('internal', 'Failed to clean user data');
    }
  }
);