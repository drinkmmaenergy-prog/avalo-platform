import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 304 — Admin Financial Console & Reconciliation
 * API Endpoints
 * 
 * @package platformapp
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { logAdminAction } from './pack296-audit-helpers';
import {
  GetMonthlyOverviewRequest,
  GetMonthlyOverviewResponse,
  GetUserFinancialSummaryRequest,
  GetUserFinancialSummaryResponse,
  ListAnomaliesRequest,
  ListAnomaliesResponse,
  UpdateAnomalyStatusRequest,
  UpdateAnomalyStatusResponse,
  ExportMonthlyFinanceRequest,
  ExportMonthlyFinanceResponse,
  ExportCreatorSummaryRequest,
  ExportCreatorSummaryResponse,
  FinanceAnomaly,
} from './types/pack304-admin-finance.types';
import {
  aggregateMonthlyFinance,
  getMonthlyAggregation,
  getMonthlyAggregationRange,
} from './pack304-aggregation';
import {
  detectFinanceAnomalies,
  getUserFinancialSummary,
} from './pack304-anomaly-detection';
import {
  exportMonthlyFinanceData,
  exportCreatorSummaryData,
} from './pack304-exports';
import { auth , CallableRequest, onSchedule } from './runtime';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has FINANCE or SUPERADMIN role
 */
async function checkFinanceAdminAccess(request: CallableRequest<any>): Promise<void> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const adminDoc = await db.collection('adminUsers').doc(request.auth.uid).get();

  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Not an admin user');
  }

  const admin = adminDoc.data();
  if (admin?.role !== 'FINANCE' && admin?.role !== 'SUPERADMIN') {
    throw new HttpsError(
      'permission-denied',
      'Requires FINANCE or SUPERADMIN role'
    );
  }
}

// ============================================================================
// MONTHLY OVERVIEW
// ============================================================================

/**
 * Get monthly financial overview
 */
export const pack304_getMonthlyOverview = onCall(
  async (request): Promise<GetMonthlyOverviewResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as GetMonthlyOverviewRequest;
      const { year, month } = data;

      // Validate input
      if (!year || !month || month < 1 || month > 12) {
        throw new HttpsError('invalid-argument', 'Invalid year or month');
      }

      // Get or generate aggregation
      const aggregation = await getMonthlyAggregation(year, month);

      if (!aggregation) {
        throw new HttpsError('not-found', 'No data available for this period');
      }

      // Log access
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_AUDIT_VIEW',
        {
          resourceType: 'PAYMENT',
          details: {
            action: 'FINANCE_VIEW_DASHBOARD',
            year,
            month,
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
        data: aggregation,
      });


      return;
    } catch (error: any) {
      logger.error('Error getting monthly overview:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to get monthly overview',
      });

      return;
    }
  }
);

/**
 * Get monthly trends (last N months)
 */
export const pack304_getMonthlyTrends = onCall(
  async (request): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }> => {
    try {
      await checkFinanceAdminAccess(request);

      const { months = 6 } = request.data;

      // Calculate date range
      const now = new Date();
      const endYear = now.getUTCFullYear();
      const endMonth = now.getUTCMonth() + 1;

      const startDate = new Date(now);
      startDate.setUTCMonth(startDate.getUTCMonth() - months + 1);
      const startYear = startDate.getUTCFullYear();
      const startMonth = startDate.getUTCMonth() + 1;

      const aggregations = await getMonthlyAggregationRange(
        startYear,
        startMonth,
        endYear,
        endMonth
      );

      // Log access
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_AUDIT_VIEW',
        {
          resourceType: 'PAYMENT',
          details: {
            action: 'FINANCE_VIEW_TRENDS',
            months,
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
        data: aggregations,
      });


      return;
    } catch (error: any) {
      logger.error('Error getting monthly trends:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to get trends',
      });

      return;
    }
  }
);

// ============================================================================
// USER RECONCILIATION
// ============================================================================

/**
 * Get user financial summary (for reconciliation)
 */
export const pack304_getUserFinancialSummary = onCall(
  async (request): Promise<GetUserFinancialSummaryResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as GetUserFinancialSummaryRequest;
      const { userId } = data;

      if (!userId) {
        throw new HttpsError('invalid-argument', 'User ID required');
      }

      const summary = await getUserFinancialSummary(userId);

      // Log access
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_AUDIT_VIEW',
        {
          resourceType: 'PAYMENT',
          targetUserId: userId,
          details: {
            action: 'FINANCE_VIEW_USER_SUMMARY',
            userId,
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
        data: summary,
      });


      return;
    } catch (error: any) {
      logger.error('Error getting user financial summary:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to get user summary',
      });

      return;
    }
  }
);

// ============================================================================
// ANOMALY MANAGEMENT
// ============================================================================

/**
 * List finance anomalies
 */
export const pack304_listAnomalies = onCall(
  async (request): Promise<ListAnomaliesResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as ListAnomaliesRequest;
      const {
        type,
        status,
        userId,
        limit = 50,
        startAfter,
      } = data;

      let query = db.collection('financeAnomalies').orderBy('createdAt', 'desc');

      // Apply filters
      if (type) {
        query = query.where('type', '==', type) as any;
      }
      if (status) {
        query = query.where('status', '==', status) as any;
      }
      if (userId) {
        query = query.where('userId', '==', userId) as any;
      }

      // Pagination
      query = query.limit(limit + 1) as any;
      if (startAfter) {
        const startDoc = await db.collection('financeAnomalies').doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc) as any;
        }
      }

      const snapshot = await query.get();
      const anomalies = snapshot.docs
        .slice(0, limit)
        .map(doc => doc.data() as FinanceAnomaly);
      const hasMore = snapshot.docs.length > limit;

      console.log('Scheduled job result:', {
        success: true,
        anomalies,
        hasMore,
      });


      return;
    } catch (error: any) {
      logger.error('Error listing anomalies:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to list anomalies',
      });

      return;
    }
  }
);

/**
 * Update anomaly status (review/resolve)
 */
export const pack304_updateAnomalyStatus = onCall(
  async (request): Promise<UpdateAnomalyStatusResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as UpdateAnomalyStatusRequest;
      const { anomalyId, status, resolutionNote } = data;

      if (!anomalyId || !status) {
        throw new HttpsError('invalid-argument', 'Anomaly ID and status required');
      }

      const anomalyRef = db.collection('financeAnomalies').doc(anomalyId);
      const anomalyDoc = await anomalyRef.get();

      if (!anomalyDoc.exists) {
        throw new HttpsError('not-found', 'Anomaly not found');
      }

      const updates: Partial<FinanceAnomaly> = {
        status,
      };

      if (status === 'RESOLVED') {
        updates.resolvedByAdminId = request.auth!.uid;
        updates.resolvedAt = new Date().toISOString();
        if (resolutionNote) {
          updates.resolutionNote = resolutionNote;
        }
      }

      await anomalyRef.update(updates);

      // Log action
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_AUDIT_VIEW',
        {
          resourceType: 'PAYMENT',
          details: {
            action: status === 'RESOLVED' ? 'FINANCE_ANOMALY_RESOLVED' : 'FINANCE_ANOMALY_REVIEWED',
            anomalyId,
            status,
            resolutionNote,
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
      });


      return;
    } catch (error: any) {
      logger.error('Error updating anomaly status:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to update anomaly',
      });

      return;
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Export monthly finance data
 */
export const pack304_exportMonthlyFinance = onCall(
  async (request): Promise<ExportMonthlyFinanceResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as ExportMonthlyFinanceRequest;
      const { year, month, format } = data;

      if (!year || !month || !format) {
        throw new HttpsError('invalid-argument', 'Year, month, and format required');
      }

      const downloadUrl = await exportMonthlyFinanceData(year, month, format);

      // Log export
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_EXPORT_CREATED',
        {
          resourceType: 'PAYMENT',
          details: {
            action: 'FINANCE_EXPORT_GENERATED',
            year,
            month,
            format,
            exportType: 'monthly_finance',
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
        downloadUrl,
      });


      return;
    } catch (error: any) {
      logger.error('Error exporting monthly finance:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to export data',
      });

      return;
    }
  }
);

/**
 * Export earner summary data
 */
export const pack304_exportCreatorSummary = onCall(
  async (request): Promise<ExportCreatorSummaryResponse> => {
    try {
      await checkFinanceAdminAccess(request);

      const data = request.data as ExportCreatorSummaryRequest;
      const { year, month, format } = data;

      if (!year || !month || !format) {
        throw new HttpsError('invalid-argument', 'Year, month, and format required');
      }

      const downloadUrl = await exportCreatorSummaryData(year, month, format);

      // Log export
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_EXPORT_CREATED',
        {
          resourceType: 'PAYMENT',
          details: {
            action: 'FINANCE_EXPORT_GENERATED',
            year,
            month,
            format,
            exportType: 'earner_summary',
          },
        }
      );

      console.log('Scheduled job result:', {
        success: true,
        downloadUrl,
      });


      return;
    } catch (error: any) {
      logger.error('Error exporting earner summary:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to export data',
      });

      return;
    }
  }
);

// ============================================================================
// ADMIN TRIGGERS
// ============================================================================

/**
 * Manually trigger aggregation for a specific month
 */
export const pack304_admin_triggerAggregation = onCall(
  async (request): Promise<{ success: boolean; error?: string }> => {
    try {
      await checkFinanceAdminAccess(request);

      const { year, month } = request.data;

      if (!year || !month) {
        throw new HttpsError('invalid-argument', 'Year and month required');
      }

      const result = await aggregateMonthlyFinance({
        year,
        month,
        forceRecalculation: true,
      });

      // Log action
      await logAdminAction(
        request.auth!.uid,
        'ADMIN_AUDIT_VIEW',
        {
          resourceType: 'PAYMENT',
          details: {
            action: 'FINANCE_AGGREGATION_TRIGGERED',
            year,
            month,
          },
        }
      );

      return result;
    } catch (error: any) {
      logger.error('Error triggering aggregation:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to trigger aggregation',
      });

      return;
    }
  }
);

/**
 * Trigger anomaly detection
 */
export const pack304_admin_triggerAnomalyDetection = onCall(
  async (request): Promise<{ success: boolean; error?: string; anomaliesFound?: number }> => {
    try {
      await checkFinanceAdminAccess(request);

      const { userId, year, month } = request.data;

      const result = await detectFinanceAnomalies({ userId, year, month });

      return result;
    } catch (error: any) {
      logger.error('Error triggering anomaly detection:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      console.log('Scheduled job result:', {
        success: false,
        error: error.message || 'Failed to detect anomalies',
      });

      return;
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily aggregation cron job (runs at 2 AM UTC)
 */
export const pack304_cronDailyAggregation = onSchedule(
  {
    schedule: '0 2 * * *', // 2 AM UTC daily
    timeZone: 'UTC',
    region: 'europe-west1',
  },
  async (event) => {
    try {
      logger.info('Starting daily finance aggregation');

      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;

      // Aggregate current month
      const currentResult = await aggregateMonthlyFinance({
        year,
        month,
        forceRecalculation: true,
      });

      logger.info('Current month aggregation result:', currentResult);

      // Also aggregate previous month (to catch late transactions)
      const prevDate = new Date(now);
      prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
      const prevYear = prevDate.getUTCFullYear();
      const prevMonth = prevDate.getUTCMonth() + 1;

      const prevResult = await aggregateMonthlyFinance({
        year: prevYear,
        month: prevMonth,
        forceRecalculation: true,
      });

      logger.info('Previous month aggregation result:', prevResult);

      // Run anomaly detection for current month
      const anomalyResult = await detectFinanceAnomalies({ year, month });
      logger.info(`Detected ${anomalyResult.anomaliesFound} anomalies`);

      logger.info('Daily finance aggregation completed');
    } catch (error: any) {
      logger.error('Error in daily finance aggregation:', error);
    }
  }
);























