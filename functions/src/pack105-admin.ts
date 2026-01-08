/**
 * PACK 105 — Admin Finance Dashboard APIs
 * 
 * Secure endpoints for admin/moderator console to manage:
 * - Payouts
 * - Finance cases
 * - KYC audit records
 * - Financial metrics
 * 
 * Security: All endpoints require admin/moderator role
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  PayoutListItem,
  PayoutDetails,
  FinanceDashboardMetrics,
} from './pack105-types';
import {
  getFinanceCases,
  getFinanceCaseById,
  getFinanceCaseStats,
  assignFinanceCase,
  updateFinanceCaseStatus,
  resolveFinanceCase,
} from './pack105-finance-cases';
import {
  getKycAuditRecordsForUser,
  getPendingKycAuditRecords,
  getKycReviewBacklogMetrics,
  generateKycComplianceReport,
} from './pack105-kyc-audit';
import { reconcilePayoutManual } from './pack105-reconciliation';

// ============================================================================
// ADMIN ROLE VERIFICATION
// ============================================================================

async function verifyAdminOrModeratorRole(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();
  const isAdmin = userData?.roles?.admin === true;
  const isModerator = userData?.roles?.moderator === true;

  if (!isAdmin && !isModerator) {
    throw new HttpsError('permission-denied', 'Admin or moderator role required');
  }
}

// ============================================================================
// PAYOUT MANAGEMENT
// ============================================================================

/**
 * List payouts with filters and pagination
 */
export const admin_listPayouts = onCall(
  { region: 'europe-west3', timeoutSeconds: 60 },
  async (request): Promise<{ payouts: PayoutListItem[]; hasMore: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const {
        status,
        userId,
        limit = 50,
        startAfter,
      } = request.data;

      let query: FirebaseFirestore.Query = db.collection('payoutRequests');

      if (status) {
        query = query.where('status', '==', status);
      }

      if (userId) {
        query = query.where('userId', '==', userId);
      }

      query = query.orderBy('createdAt', 'desc');

      if (startAfter) {
        const startDoc = await db.collection('payoutRequests').doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      query = query.limit(limit + 1);

      const snapshot = await query.get();
      const hasMore = snapshot.size > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      const payouts: PayoutListItem[] = [];

      for (const doc of docs) {
        const data = doc.data();
        
        const userDoc = await db.collection('users').doc(data.userId).get();
        const userData = userDoc.data();

        const kycDoc = await db.collection('user_kyc_status').doc(data.userId).get();
        const kycStatus = kycDoc.exists ? kycDoc.data()?.status : 'NOT_STARTED';

        payouts.push({
          payoutId: doc.id,
          userId: data.userId,
          userName: userData?.displayName || 'Unknown',
          method: data.method || 'unknown',
          amountTokens: data.amountTokens || 0,
          amountPLN: data.amountPLN || 0,
          status: data.status || 'pending',
          kycStatus: kycStatus || 'NOT_STARTED',
          requestedAt: data.createdAt.toDate().toISOString(),
          processedAt: data.processedAt?.toDate().toISOString(),
          completedAt: data.completedAt?.toDate().toISOString(),
          failureReason: data.failureReason,
        });
      }

      logger.info('[Admin] Listed payouts', {
        adminUid: request.auth.uid,
        count: payouts.length,
        filters: { status, userId },
      });

      return { payouts, hasMore };
    } catch (error: any) {
      logger.error('[Admin] Failed to list payouts', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to list payouts: ${error.message}`);
    }
  }
);

/**
 * Get detailed payout information
 */
export const admin_getPayout = onCall(
  { region: 'europe-west3' },
  async (request): Promise<PayoutDetails> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { payoutId } = request.data;

      if (!payoutId) {
        throw new HttpsError('invalid-argument', 'payoutId is required');
      }

      const payoutDoc = await db.collection('payoutRequests').doc(payoutId).get();

      if (!payoutDoc.exists) {
        throw new HttpsError('not-found', 'Payout not found');
      }

      const data = payoutDoc.data()!;

      const userDoc = await db.collection('users').doc(data.userId).get();
      const userData = userDoc.data();

      const kycDoc = await db.collection('user_kyc_status').doc(data.userId).get();
      const kycStatus = kycDoc.exists ? kycDoc.data()?.status : 'NOT_STARTED';

      const historySnapshot = await db
        .collection('business_audit_log')
        .where('relatedId', '==', payoutId)
        .orderBy('createdAt', 'asc')
        .get();

      const history = historySnapshot.docs.map(doc => {
        const logData = doc.data();
        return {
          status: logData.eventType,
          timestamp: logData.createdAt.toDate().toISOString(),
          actor: logData.userId,
          notes: logData.context?.notes,
        };
      });

      const payoutDetails: PayoutDetails = {
        payoutId,
        userId: data.userId,
        userName: userData?.displayName || 'Unknown',
        userEmail: userData?.email,
        userPhone: userData?.phone,
        method: data.method || 'unknown',
        amountTokens: data.amountTokens || 0,
        amountPLN: data.amountPLN || 0,
        status: data.status || 'pending',
        kycStatus,
        requestedAt: data.createdAt.toDate().toISOString(),
        processedAt: data.processedAt?.toDate().toISOString(),
        completedAt: data.completedAt?.toDate().toISOString(),
        failureReason: data.failureReason,
        details: data.details || {},
        history,
      };

      logger.info('[Admin] Retrieved payout details', {
        adminUid: request.auth.uid,
        payoutId,
      });

      return payoutDetails;
    } catch (error: any) {
      logger.error('[Admin] Failed to get payout', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get payout: ${error.message}`);
    }
  }
);

// ============================================================================
// FINANCE CASES MANAGEMENT
// ============================================================================

/**
 * List finance cases
 */
export const admin_listFinanceCases = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { status, priority, type, assignedTo, limit } = request.data;

      const cases = await getFinanceCases({
        status,
        priority,
        type,
        assignedTo,
        limit,
      });

      logger.info('[Admin] Listed finance cases', {
        adminUid: request.auth.uid,
        count: cases.length,
      });

      return { cases };
    } catch (error: any) {
      logger.error('[Admin] Failed to list finance cases', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to list finance cases: ${error.message}`);
    }
  }
);

/**
 * Get finance case details
 */
export const admin_getFinanceCase = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { caseId } = request.data;

      if (!caseId) {
        throw new HttpsError('invalid-argument', 'caseId is required');
      }

      const financeCase = await getFinanceCaseById(caseId);

      if (!financeCase) {
        throw new HttpsError('not-found', 'Finance case not found');
      }

      return { case: financeCase };
    } catch (error: any) {
      logger.error('[Admin] Failed to get finance case', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get finance case: ${error.message}`);
    }
  }
);

/**
 * Resolve finance case
 */
export const admin_resolveFinanceCase = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { caseId, action, notes } = request.data;

      if (!caseId || !action || !notes) {
        throw new HttpsError('invalid-argument', 'caseId, action, and notes are required');
      }

      await resolveFinanceCase({
        caseId,
        action,
        resolvedBy: request.auth.uid,
        notes,
      });

      logger.info('[Admin] Resolved finance case', {
        adminUid: request.auth.uid,
        caseId,
        action,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('[Admin] Failed to resolve finance case', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to resolve finance case: ${error.message}`);
    }
  }
);

// ============================================================================
// DASHBOARD METRICS
// ============================================================================

/**
 * Get finance dashboard metrics
 */
export const admin_getFinanceDashboardMetrics = onCall(
  { region: 'europe-west3', timeoutSeconds: 60 },
  async (request): Promise<FinanceDashboardMetrics> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { date } = request.data;
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      const targetTimestamp = Timestamp.fromDate(targetDate);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayTimestamp = Timestamp.fromDate(nextDay);

      const [
        payoutsRequested,
        payoutsProcessing,
        payoutsCompleted,
        payoutsFailed,
        kycStats,
        financeCaseStats,
      ] = await Promise.all([
        db.collection('payoutRequests')
          .where('createdAt', '>=', targetTimestamp)
          .where('createdAt', '<', nextDayTimestamp)
          .where('status', '==', 'pending')
          .count().get(),
        db.collection('payoutRequests')
          .where('status', '==', 'processing')
          .count().get(),
        db.collection('payoutRequests')
          .where('completedAt', '>=', targetTimestamp)
          .where('completedAt', '<', nextDayTimestamp)
          .where('status', '==', 'completed')
          .count().get(),
        db.collection('payoutRequests')
          .where('status', '==', 'failed')
          .count().get(),
        getKycReviewBacklogMetrics(),
        getFinanceCaseStats(),
      ]);

      const payoutsCompletedSnapshot = await db.collection('payoutRequests')
        .where('completedAt', '>=', targetTimestamp)
        .where('completedAt', '<', nextDayTimestamp)
        .where('status', '==', 'completed')
        .get();

      let totalPayoutAmount = 0;
      payoutsCompletedSnapshot.forEach(doc => {
        const data = doc.data();
        totalPayoutAmount += data.amountPLN || 0;
      });

      const metrics: FinanceDashboardMetrics = {
        date: targetDate.toISOString().split('T')[0],
        payouts: {
          requested: payoutsRequested.data().count,
          processing: payoutsProcessing.data().count,
          completed: payoutsCompleted.data().count,
          failed: payoutsFailed.data().count,
          totalAmountPLN: totalPayoutAmount,
        },
        kyc: {
          pending: kycStats.pendingCount,
          approved: 0,
          rejected: 0,
          backlogDays: kycStats.oldestPendingDays,
        },
        reconciliation: {
          openCases: financeCaseStats.open + financeCaseStats.investigating,
          criticalCases: financeCaseStats.critical,
          resolvedToday: financeCaseStats.resolvedToday,
        },
        revenue: {
          totalTokensSold: 0,
          totalEarningsGenerated: 0,
          platformRevenue: 0,
        },
      };

      logger.info('[Admin] Retrieved dashboard metrics', {
        adminUid: request.auth.uid,
        date: metrics.date,
      });

      return metrics;
    } catch (error: any) {
      logger.error('[Admin] Failed to get dashboard metrics', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to get dashboard metrics: ${error.message}`);
    }
  }
);

// ============================================================================
// KYC AUDIT MANAGEMENT
// ============================================================================

/**
 * List pending KYC reviews
 */
export const admin_listPendingKycReviews = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { limit = 50 } = request.data;

      const pendingRecords = await getPendingKycAuditRecords(limit);

      logger.info('[Admin] Listed pending KYC reviews', {
        adminUid: request.auth.uid,
        count: pendingRecords.length,
      });

      return { records: pendingRecords };
    } catch (error: any) {
      logger.error('[Admin] Failed to list pending KYC reviews', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to list pending KYC reviews: ${error.message}`);
    }
  }
);

/**
 * Get KYC compliance report
 */
export const admin_getKycComplianceReport = onCall(
  { region: 'europe-west3', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { startDate, endDate } = request.data;

      if (!startDate || !endDate) {
        throw new HttpsError('invalid-argument', 'startDate and endDate are required');
      }

      const report = await generateKycComplianceReport({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      logger.info('[Admin] Generated KYC compliance report', {
        adminUid: request.auth.uid,
        period: `${startDate} to ${endDate}`,
      });

      return { report };
    } catch (error: any) {
      logger.error('[Admin] Failed to generate KYC compliance report', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to generate KYC compliance report: ${error.message}`);
    }
  }
);

// ============================================================================
// MANUAL RECONCILIATION
// ============================================================================

/**
 * Manually trigger payout reconciliation
 */
export const admin_reconcilePayout = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminOrModeratorRole(request.auth.uid);

    try {
      const { payoutId } = request.data;

      if (!payoutId) {
        throw new HttpsError('invalid-argument', 'payoutId is required');
      }

      const result = await reconcilePayoutManual(payoutId);

      logger.info('[Admin] Manually reconciled payout', {
        adminUid: request.auth.uid,
        payoutId,
        status: result.status,
      });

      return { result };
    } catch (error: any) {
      logger.error('[Admin] Failed to reconcile payout', {
        error: error.message,
        adminUid: request.auth.uid,
      });
      throw new HttpsError('internal', `Failed to reconcile payout: ${error.message}`);
    }
  }
);