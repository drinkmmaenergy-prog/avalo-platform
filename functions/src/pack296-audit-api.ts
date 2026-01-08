/**
 * PACK 296 — Audit Console & Compliance Exports API
 * Admin endpoints for searching audit logs and generating compliance reports
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';
import { canViewAuditLogs, isSuperAdmin, logAdminAction } from './pack296-audit-helpers';
import type {
  AuditSearchParams,
  AuditSearchResponse,
  AuditLog,
  MetricsExportParams,
  MetricsExportResponse,
  MetricsExportItem,
  CaseExportParams,
  CaseExportResponse,
} from './types/audit.types';

// ============================================================================
// AUDIT SEARCH API
// ============================================================================

/**
 * Search audit logs with filters
 * Admin endpoint (RISK or SUPERADMIN only)
 */
export const admin_searchAuditLogs = functions.https.onCall(
  async (data: AuditSearchParams, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = context.auth.uid;

    // Check admin permissions
    const hasPermission = await canViewAuditLogs(adminId);
    if (!hasPermission) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'RISK or SUPERADMIN role required to view audit logs'
      );
    }

    try {
      const {
        userId,
        actorId,
        resourceId,
        resourceType,
        actionType,
        fromDate,
        toDate,
        limit = 50,
        cursor,
      } = data;

      let query = db.collection('auditLogs').orderBy('timestamp', 'desc');

      // Apply filters
      if (userId) {
        // Search for user as actor or resource
        query = query.where('actorId', '==', userId);
      }

      if (actorId) {
        query = query.where('actorId', '==', actorId);
      }

      if (resourceId) {
        query = query.where('resourceId', '==', resourceId);
      }

      if (resourceType) {
        query = query.where('resourceType', '==', resourceType);
      }

      if (actionType) {
        query = query.where('actionType', '==', actionType);
      }

      if (fromDate) {
        query = query.where('timestamp', '>=', new Date(fromDate));
      }

      if (toDate) {
        query = query.where('timestamp', '<=', new Date(toDate));
      }

      // Apply cursor for pagination
      if (cursor) {
        const cursorDoc = await db.collection('auditLogs').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      // Limit results
      query = query.limit(limit + 1);

      const snapshot = await query.get();

      const hasMore = snapshot.docs.length > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      const items: AuditLog[] = docs.map((doc) => {
        const data = doc.data();
        return {
          logId: data.logId,
          timestamp: data.timestamp,
          actorType: data.actorType,
          actorId: data.actorId,
          actionType: data.actionType,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          metadata: data.metadata,
          sensitive: data.sensitive,
          createdAt: data.createdAt,
        };
      });

      const result: AuditSearchResponse = {
        items,
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
      };

      // Log audit view
      await logAdminAction(adminId, 'ADMIN_AUDIT_VIEW', {
        details: { filters: data, resultCount: items.length },
      });

      return result;
    } catch (error: any) {
      console.error('Error searching audit logs:', error);
      throw new functions.https.HttpsError('internal', 'Failed to search audit logs');
    }
  }
);

/**
 * Get single audit log by ID
 */
export const admin_getAuditLog = functions.https.onCall(
  async (data: { logId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = context.auth.uid;

    const hasPermission = await canViewAuditLogs(adminId);
    if (!hasPermission) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'RISK or SUPERADMIN role required to view audit logs'
      );
    }

    try {
      const { logId } = data;

      if (!logId) {
        throw new functions.https.HttpsError('invalid-argument', 'Log ID is required');
      }

      const logDoc = await db.collection('auditLogs').doc(logId).get();

      if (!logDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Audit log not found');
      }

      const logData = logDoc.data();

      return {
        success: true,
        log: {
          logId: logData?.logId,
          timestamp: logData?.timestamp.toDate().toISOString(),
          actorType: logData?.actorType,
          actorId: logData?.actorId,
          actionType: logData?.actionType,
          resourceType: logData?.resourceType,
          resourceId: logData?.resourceId,
          metadata: logData?.metadata,
          sensitive: logData?.sensitive,
          createdAt: logData?.createdAt.toDate().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('Error getting audit log:', error);
      throw error;
    }
  }
);

// ============================================================================
// METRICS EXPORT (Aggregated, Privacy-Safe)
// ============================================================================

/**
 * Export aggregated business metrics for investors/regulators
 */
export const admin_exportMetrics = functions.https.onCall(
  async (data: MetricsExportParams, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = context.auth.uid;

    const hasPermission = await canViewAuditLogs(adminId);
    if (!hasPermission) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    try {
      const { fromDate, toDate, granularity = 'month' } = data;

      if (!fromDate || !toDate) {
        throw new functions.https.HttpsError('invalid-argument', 'Date range is required');
      }

      // Generate aggregated metrics
      const items: MetricsExportItem[] = await generateMetricsReport(
        new Date(fromDate),
        new Date(toDate),
        granularity
      );

      const result: MetricsExportResponse = {
        period: { from: fromDate, to: toDate },
        granularity,
        items,
      };

      // Log export creation
      await logAdminAction(adminId, 'ADMIN_EXPORT_CREATED', {
        details: {
          exportType: 'metrics',
          fromDate,
          toDate,
          granularity,
        },
      });

      // Record export in database
      await db.collection('complianceExports').add({
        exportId: generateId(),
        exportType: 'METRICS',
        requestedBy: adminId,
        period: { from: fromDate, to: toDate },
        granularity,
        createdAt: serverTimestamp(),
      });

      return result;
    } catch (error: any) {
      console.error('Error exporting metrics:', error);
      throw new functions.https.HttpsError('internal', 'Failed to export metrics');
    }
  }
);

/**
 * Generate aggregated metrics report
 */
async function generateMetricsReport(
  fromDate: Date,
  toDate: Date,
  granularity: 'day' | 'week' | 'month'
): Promise<MetricsExportItem[]> {
  // This is a simplified implementation
  // In production, you would aggregate from audit logs and transaction data

  const items: MetricsExportItem[] = [];

  // Generate periods based on granularity
  const periods = generatePeriods(fromDate, toDate, granularity);

  for (const period of periods) {
    // Query audit logs for this period
    const periodStart = new Date(period.start);
    const periodEnd = new Date(period.end);

    // Count registrations
    const registrations = await db
      .collection('auditLogs')
      .where('actionType', '==', 'USER_REGISTRATION')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<', periodEnd)
      .count()
      .get();

    // Count token purchases
    const purchases = await db
      .collection('auditLogs')
      .where('actionType', '==', 'TOKEN_PURCHASE')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<', periodEnd)
      .get();

    let totalTokens = 0;
    let totalFiat = 0;
    purchases.docs.forEach((doc) => {
      const data = doc.data();
      totalTokens += data.metadata?.amountTokens || 0;
      totalFiat += data.metadata?.amountFiat || 0;
    });

    // Count payouts
    const payouts = await db
      .collection('auditLogs')
      .where('actionType', '==', 'PAYOUT_PAID')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<', periodEnd)
      .get();

    let totalPayouts = 0;
    payouts.docs.forEach((doc) => {
      const data = doc.data();
      totalPayouts += data.metadata?.amountFiat || 0;
    });

    // Count safety reports
    const safetyReports = await db
      .collection('auditLogs')
      .where('actionType', '==', 'SAFETY_REPORT_SUBMITTED')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<', periodEnd)
      .count()
      .get();

    // Count bans
    const bans = await db
      .collection('auditLogs')
      .where('actionType', '==', 'ACCOUNT_BANNED')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<', periodEnd)
      .count()
      .get();

    items.push({
      period: period.label,
      newRegistrations: registrations.data().count,
      activeUsers: 0, // Would need to calculate from user activity
      payingUsers: purchases.docs.length,
      totalTokenPurchases: totalTokens,
      totalTokenPurchasesPLN: totalFiat,
      totalPayoutsPLN: totalPayouts,
      gmvTokens: totalTokens,
      netRevenuePLN: totalFiat - totalPayouts,
      totalMeetingsBooked: 0, // Would aggregate from booking logs
      totalEventsTickets: 0, // Would aggregate from event logs
      safetyReports: safetyReports.data().count,
      bans: bans.data().count,
    });
  }

  return items;
}

/**
 * Generate time periods for report
 */
function generatePeriods(
  fromDate: Date,
  toDate: Date,
  granularity: 'day' | 'week' | 'month'
): Array<{ start: Date; end: Date; label: string }> {
  const periods: Array<{ start: Date; end: Date; label: string }> = [];
  let current = new Date(fromDate);

  while (current < toDate) {
    const periodStart = new Date(current);
    let periodEnd: Date;
    let label: string;

    if (granularity === 'day') {
      periodEnd = new Date(current);
      periodEnd.setDate(current.getDate() + 1);
      label = current.toISOString().split('T')[0];
    } else if (granularity === 'week') {
      periodEnd = new Date(current);
      periodEnd.setDate(current.getDate() + 7);
      label = `Week ${getWeekNumber(current)}`;
    } else {
      // month
      periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      label = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    }

    if (periodEnd > toDate) {
      periodEnd = new Date(toDate);
    }

    periods.push({ start: periodStart, end: periodEnd, label });
    current = periodEnd;
  }

  return periods;
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// ============================================================================
// CASE EXPORT (Per User/Incident)
// ============================================================================

/**
 * Export case data for a specific user (for legal/regulatory purposes)
 */
export const admin_exportCase = functions.https.onCall(
  async (data: CaseExportParams, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = context.auth.uid;

    // Only SUPERADMIN can export sensitive case data
    const isSuperAdminUser = await isSuperAdmin(adminId);
    if (!isSuperAdminUser) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'SUPERADMIN role required for case exports'
      );
    }

    try {
      const {
        userId,
        fromDate,
        toDate,
        includeFinancials = true,
        includeSafety = true,
      } = data;

      if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
      }

      const from = fromDate ? new Date(fromDate) : new Date(0);
      const to = toDate ? new Date(toDate) : new Date();

      // Fetch audit logs for this user
      let auditQuery = db
        .collection('auditLogs')
        .where('timestamp', '>=', from)
        .where('timestamp', '<=', to)
        .orderBy('timestamp', 'desc')
        .limit(1000);

      // Get logs where user is actor
      const actorLogs = await auditQuery.where('actorId', '==', userId).get();

      // Get logs where user is resource
      const resourceLogs = await auditQuery.where('resourceId', '==', userId).get();

      const auditLogs: AuditLog[] = [
        ...actorLogs.docs.map((doc) => doc.data() as AuditLog),
        ...resourceLogs.docs.map((doc) => doc.data() as AuditLog),
      ];

      // Fetch safety reports if requested
      let safetyReports: any[] = [];
      if (includeSafety) {
        const reportsSnapshot = await db
          .collection('safetyReports')
          .where('reporterId', '==', userId)
          .get();

        safetyReports = reportsSnapshot.docs.map((doc) => ({
          reportId: doc.id,
          ...doc.data(),
          timestamp: doc.data().createdAt?.toDate().toISOString(),
        }));
      }

      // Fetch account status
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      const accountStatus = {
        currentRiskScore: userData?.riskScore || 0,
        banned: userData?.banned || false,
        suspendedUntil: userData?.suspendedUntil?.toDate().toISOString(),
      };

      // Fetch financial summary if requested
      let financialSummary;
      if (includeFinancials) {
        const walletDoc = await db.collection('wallets').doc(userId).get();
        const walletData = walletDoc.data();

        financialSummary = {
          totalPurchasedTokens: walletData?.totalPurchased || 0,
          totalEarnedTokens: walletData?.totalEarned || 0,
          totalWithdrawnTokens: walletData?.totalWithdrawn || 0,
          totalSpentTokens: walletData?.totalSpent || 0,
        };
      }

      const result: CaseExportResponse = {
        userId,
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        auditLogs,
        safetyReports,
        accountStatus,
        financialSummary,
      };

      // Log case export
      await logAdminAction(adminId, 'ADMIN_EXPORT_CREATED', {
        targetUserId: userId,
        details: {
          exportType: 'case',
          includeFinancials,
          includeSafety,
        },
      });

      // Record export in database
      await db.collection('complianceExports').add({
        exportId: generateId(),
        exportType: 'CASE',
        requestedBy: adminId,
        targetUserId: userId,
        includeFinancials,
        includeSafety,
        createdAt: serverTimestamp(),
      });

      return result;
    } catch (error: any) {
      console.error('Error exporting case:', error);
      throw new functions.https.HttpsError('internal', 'Failed to export case data');
    }
  }
);