/**
 * PACK 303 — Creator Earnings Dashboard Endpoints
 * 
 * HTTP and Callable Cloud Functions for earnings dashboard
 * 
 * @package avaloapp
 * @version 1.0.0
 */


import { onSchedule } from './runtime';
import { db } from './init';
import {
  getEarningsDashboard,
  getMonthlyStatement,
  hasEarningsCapability,
  getAvailableEarningsMonths,
  logStatementAudit,
} from './pack303-earnings-service';
import {
  aggregateUserMonthlyEarnings,
  runMonthlyAggregation,
  backfillAggregation,
} from './pack303-aggregation';
import { exportStatement } from './pack303-statement-export';
import {
  GetEarningsDashboardRequest,
  GetMonthlyStatementRequest,
  ExportStatementRequest,
  isValidYearMonth,
} from './types/pack303-creator-earnings.types';
import { HttpsError, admin, auth, onCall, onRequest , CallableRequest} from './runtime';

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

function requireAuth(request: CallableRequest<any>): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  return request.auth.uid;
}

function requireFinanceAdmin(request: CallableRequest<any>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const roles = request.auth.token.roles || [];
  if (!roles.includes('FINANCE_ADMIN')) {
    throw new HttpsError('permission-denied', 'User must be FINANCE_ADMIN');
  }
}

// ============================================================================
// USER-FACING CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get earnings dashboard for authenticated user
 */
export const getEarningsDashboardCallable = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    const userId = requireAuth(request);
    
    const { year, month } = data;
    
    // Validate parameters
    if (year && month && !isValidYearMonth(year, month)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    const innerRequest: GetEarningsDashboardRequest = {
      userId,
      year,
      month,
    };
    
    const response = await getEarningsDashboard(innerRequest);
    
    if (!response.success) {
      throw new HttpsError('internal', response.error || 'Failed to get dashboard');
    }
    
    return response;
  });

/**
 * Get monthly statement for authenticated user
 */
export const getMonthlyStatementCallable = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    const userId = requireAuth(request);
    
    const { year, month } = data;
    
    if (!year || !month) {
      throw new HttpsError('invalid-argument', 'Year and month are required');
    }
    
    if (!isValidYearMonth(year, month)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    const innerRequest: GetMonthlyStatementRequest = {
      userId,
      year,
      month,
    };
    
    // Log access
    await logStatementAudit('USER', userId, 'STATEMENT_VIEWED', userId, year, month);
    
    const response = await getMonthlyStatement(innerRequest);
    
    if (!response.success) {
      throw new HttpsError('internal', response.error || 'Failed to get statement');
    }
    
    return response;
  });

/**
 * Export statement as PDF or CSV
 */
export const exportStatementCallable = onCall(
  { region: 'europe-west1', timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
  const data = request.data;
    const userId = requireAuth(request);
    
    const { year, month, format } = data;
    
    if (!year || !month || !format) {
      throw new HttpsError('invalid-argument', 'Year, month, and format are required');
    }
    
    if (!isValidYearMonth(year, month)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    if (format !== 'pdf' && format !== 'csv') {
      throw new HttpsError('invalid-argument', 'Format must be "pdf" or "csv"');
    }
    
    const innerRequest: ExportStatementRequest = {
      userId,
      year,
      month,
      format,
    };
    
    const response = await exportStatement(innerRequest);
    
    if (!response.success) {
      throw new HttpsError('internal', response.error || 'Failed to export statement');
    }
    
    return response;
  });

/**
 * Check if user has earnings capability
 */
export const checkEarningsCapabilityCallable = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = requireAuth(request);
    
    const hasCapability = await hasEarningsCapability(userId);
    const availableMonths = await getAvailableEarningsMonths(userId);
    
    console.log('Scheduled job result:', {
      success: true,
      hasEarningsCapability: hasCapability,
      availableMonths,
    });

    
    return;
  });

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Trigger aggregation for a specific user and month (admin only)
 */
export const adminTriggerAggregation = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    requireFinanceAdmin(request);
    
    const { userId, year, month } = data;
    
    if (!userId || !year || !month) {
      throw new HttpsError('invalid-argument', 'userId, year, and month are required');
    }
    
    if (!isValidYearMonth(year, month)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    const result = await aggregateUserMonthlyEarnings(userId, year, month);
    
    console.log('Scheduled job result:', {
      success: result.success,
      result,
    });

    
    return;
  });

/**
 * Backfill aggregation for a user (admin only)
 */
export const adminBackfillAggregation = onCall(
  { region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
  const data = request.data;
    requireFinanceAdmin(request);
    
    const { userId, startYear, startMonth, endYear, endMonth } = data;
    
    if (!userId || !startYear || !startMonth || !endYear || !endMonth) {
      throw new HttpsError(
        'invalid-argument',
        'userId, startYear, startMonth, endYear, and endMonth are required'
      );
    }
    
    if (!isValidYearMonth(startYear, startMonth) || !isValidYearMonth(endYear, endMonth)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    const results = await backfillAggregation(userId, startYear, startMonth, endYear, endMonth);
    
    console.log('Scheduled job result:', {
      success: true,
      results,
      totalProcessed: results.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length,
    });

    
    return;
  });

/**
 * View earnings for any user (admin only, with audit)
 */
export const adminViewUserEarnings = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    requireFinanceAdmin(request);
    const adminId = request.auth!.uid;
    
    const { userId, year, month } = data;
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    // Validate parameters
    if (year && month && !isValidYearMonth(year, month)) {
      throw new HttpsError('invalid-argument', 'Invalid year/month combination');
    }
    
    const innerRequest: GetEarningsDashboardRequest = {
      userId,
      year,
      month,
    };
    
    // Log admin access
    if (year && month) {
      await logStatementAudit('ADMIN', adminId, 'STATEMENT_VIEWED', userId, year, month);
    }
    
    const response = await getEarningsDashboard(innerRequest);
    
    if (!response.success) {
      throw new HttpsError('internal', response.error || 'Failed to get dashboard');
    }
    
    return response;
  });

// ============================================================================
// SCHEDULED FUNCTIONS (CRON JOBS)
// ============================================================================

/**
 * Daily aggregation cron job
 * Runs at 02:00 UTC daily to aggregate previous day's earnings
 */
export const cronDailyEarningsAggregation = onSchedule({ schedule: "0 2 * * *", timeZone: "UTC", region: "europe-west1" }, async (event) => {
    console.log('Starting daily earnings aggregation');
    
    // Aggregate current month
    const result = await runMonthlyAggregation(undefined, undefined, 100);
    
    console.log('Daily aggregation complete:', {
      success: result.success,
      creatorsProcessed: result.results.length,
      errors: result.errors,
    });
    
    // Log aggregation run
    await logStatementAudit(
      'SYSTEM',
      'CRON_JOB',
      'AGGREGATION_RUN',
      'SYSTEM',
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      undefined,
      { results: result.results.length, errors: result.errors }
    );
  });

/**
 * HTTP endpoint to manually trigger aggregation (for testing/admin)
 */
export const httpTriggerAggregation = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 540,
  memory: '1GiB',
}, async (req, res) => {
    // Simple auth check - require admin token in header
    const adminToken = req.headers.authorization;
    
    // In production, validate this token properly
    if (!adminToken || !adminToken.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    try {
      const { year, month, batchSize } = req.query;
      
      const result = await runMonthlyAggregation(
        year ? parseInt(year as string) : undefined,
        month ? parseInt(month as string) : undefined,
        batchSize ? parseInt(batchSize as string) : 100
      );
      
      res.status(200).json({
        success: result.success,
        creatorsProcessed: result.results.length,
        successCount: result.results.filter(r => r.success).length,
        errorCount: result.errors,
        results: result.results,
      });
    } catch (error: any) {
      console.error('Error in manual aggregation trigger:', error);
      res.status(500).json({ error: error.message });
    }
  });
