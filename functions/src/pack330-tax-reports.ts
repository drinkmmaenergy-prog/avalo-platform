/**
 * PACK 330 — Tax Report Generation
 * Cloud Functions for generating user and platform tax reports
 */

import { https, logger, scheduler } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  TaxReportUser,
  TaxReportPlatform,
  EarningsBreakdown,
  PayoutDetail,
  GenerateUserTaxReportRequest,
  GenerateUserTaxReportResponse,
  GetPlatformTaxReportRequest,
  GetPlatformTaxReportResponse,
  TAX_CONFIG,
  TAX_SOURCE_MAPPING,
  RegionBreakdown,
} from './types/pack330-tax.types';
import { TransactionSource } from './types/pack277-wallet.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse period string (e.g., "2025-01" or "2025-YEAR")
 */
function parsePeriod(period: string): { startDate: Date; endDate: Date; isYearly: boolean } {
  if (period.endsWith('-YEAR')) {
    const year = parseInt(period.split('-')[0]);
    return {
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31, 23, 59, 59, 999),
      isYearly: true,
    };
  } else {
    // Monthly: "2025-01"
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
    return {
      startDate,
      endDate,
      isYearly: false,
    };
  }
}

/**
 * Get current period string
 */
function getCurrentPeriod(type: 'monthly' | 'yearly'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  if (type === 'yearly') {
    return `${year - 1}-YEAR`; // Previous year
  } else {
    // Previous month
    const prevMonth = month === 0 ? 12 : month;
    const prevYear = month === 0 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  }
}

/**
 * Map transaction source to breakdown field
 */
function mapSourceToBreakdownField(source: TransactionSource): keyof EarningsBreakdown | null {
  const mapping: Record<string, keyof EarningsBreakdown> = {
    CHAT: 'chatTokens',
    CALL: 'voiceTokens',
    CALENDAR: 'calendarTokens',
    EVENT: 'eventTokens',
    TIP: 'tipsTokens',
    MEDIA: 'digitalProductsTokens',
    DIGITAL_PRODUCT: 'digitalProductsTokens',
  };
  
  return mapping[source] || null;
}

/**
 * Get region from country code
 */
function getRegion(countryCode: string): 'PL' | 'EU' | 'US' | 'ROW' {
  if (countryCode === 'PL') return 'PL';
  if (countryCode === 'US') return 'US';
  if ((TAX_CONFIG.EU_COUNTRIES as readonly string[]).includes(countryCode)) return 'EU';
  return 'ROW';
}

// ============================================================================
// USER TAX REPORT GENERATION
// ============================================================================

/**
 * Generate user tax report for a specific period
 */
async function generateUserTaxReport(
  userId: string,
  period: string
): Promise<TaxReportUser> {
  const { startDate, endDate } = parsePeriod(period);

  // Initialize breakdown
  const breakdown: EarningsBreakdown = {
    chatTokens: 0,
    voiceTokens: 0,
    videoTokens: 0,
    calendarTokens: 0,
    eventTokens: 0,
    tipsTokens: 0,
    aiCompanionsTokens: 0,
    digitalProductsTokens: 0,
  };

  // Query earnings transactions (type=EARN) for the period
  const earningsQuery = await db
    .collection('walletTransactions')
    .where('userId', '==', userId)
    .where('type', '==', 'EARN')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();

  let totalEarnedTokens = 0;

  // Aggregate earnings by source
  earningsQuery.docs.forEach((doc) => {
    const tx = doc.data();
    const tokens = tx.amountTokens || 0;
    const source = tx.source as TransactionSource;

    totalEarnedTokens += tokens;

    // Map to breakdown field
    const field = mapSourceToBreakdownField(source);
    if (field) {
      breakdown[field] += tokens;
    }
  });

  // Convert tokens to PLN
  const totalEarnedPLN = totalEarnedTokens * TAX_CONFIG.TOKEN_TO_PLN_RATE;

  // Query payouts for the period
  const payoutsQuery = await db
    .collection('payoutRequests')
    .where('userId', '==', userId)
    .where('requestedAt', '>=', startDate)
    .where('requestedAt', '<=', endDate)
    .get();

  const payoutDetails: PayoutDetail[] = [];
  let totalPaidOutPLN = 0;
  let totalPendingPLN = 0;

  payoutsQuery.docs.forEach((doc) => {
    const payout = doc.data();
    const amountPLN = payout.amountPLN || 0;

    if (payout.status === 'COMPLETED') {
      totalPaidOutPLN += amountPLN;
    } else if (payout.status === 'PENDING' || payout.status === 'PROCESSING') {
      totalPendingPLN += amountPLN;
    }

    payoutDetails.push({
      payoutId: doc.id,
      date: payout.requestedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      amountPLN,
      bankOrWallet: payout.payoutMethod || 'unknown',
    });
  });

  // Create report
  const report: TaxReportUser = {
    userId,
    period,
    totalEarnedTokens,
    totalEarnedPLN,
    breakdown,
    numberOfPayouts: payoutDetails.length,
    totalPaidOutPLN,
    totalPendingPLN,
    payoutDetails,
    generatedAt: serverTimestamp() as any,
  };

  // Save report to Firestore
  const reportId = `${userId}_${period}`;
  await db
    .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_USER)
    .doc(reportId)
    .set(report);

  logger.info('User tax report generated', { userId, period, totalEarnedPLN });

  return report;
}

/**
 * Callable: Generate user tax report on-demand
 */
export const pack330_generateUserTaxReportOnDemand = https.onCall<GenerateUserTaxReportRequest>(
  { region: 'europe-west3', memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, period } = request.data;

    // Users can only generate their own reports (or admins can generate any)
    if (userId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError(
        'permission-denied',
        'You can only generate your own tax reports'
      );
    }

    if (!period || !/^\d{4}-(0[1-9]|1[0-2]|YEAR)$/.test(period)) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid period format. Use YYYY-MM or YYYY-YEAR'
      );
    }

    try {
      const report = await generateUserTaxReport(userId, period);

      const response: GenerateUserTaxReportResponse = {
        success: true,
        report,
      };

      return response;
    } catch (error: any) {
      logger.error('Generate user tax report error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to generate tax report'
      );
    }
  }
);

/**
 * Callable: Get user tax report
 */
export const pack330_getUserTaxReport = https.onCall(
  { region: 'europe-west3', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, period } = request.data;

    // Users can only get their own reports
    if (userId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError(
        'permission-denied',
        'You can only view your own tax reports'
      );
    }

    try {
      const reportId = `${userId}_${period}`;
      const reportDoc = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_USER)
        .doc(reportId)
        .get();

      if (!reportDoc.exists) {
        return {
          success: true,
          report: null,
        };
      }

      const report = reportDoc.data() as TaxReportUser;

      return {
        success: true,
        report,
      };
    } catch (error: any) {
      logger.error('Get user tax report error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to get tax report'
      );
    }
  }
);

/**
 * Callable: List user tax reports
 */
export const pack330_listUserTaxReports = https.onCall(
  { region: 'europe-west3', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, limit = 12 } = request.data;

    // Users can only list their own reports
    const targetUserId = userId || auth.uid;
    if (targetUserId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError(
        'permission-denied',
        'You can only view your own tax reports'
      );
    }

    try {
      const reportsQuery = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_USER)
        .where('userId', '==', targetUserId)
        .orderBy('period', 'desc')
        .limit(limit)
        .get();

      const reports = reportsQuery.docs.map(doc => doc.data() as TaxReportUser);

      return {
        success: true,
        reports,
      };
    } catch (error: any) {
      logger.error('List user tax reports error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to list tax reports'
      );
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Scheduled: Generate monthly tax reports for all earning users
 * Runs on 1st of each month at 02:00 UTC
 */
export const pack330_generateMonthlyUserReports = scheduler.onSchedule(
  {
    schedule: '0 2 1 * *', // 02:00 UTC on 1st of each month
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const period = getCurrentPeriod('monthly');
    logger.info('Starting monthly tax report generation', { period });

    try {
      // Get all users who earned tokens in the previous month
      const { startDate, endDate } = parsePeriod(period);

      const earningsQuery = await db
        .collection('walletTransactions')
        .where('type', '==', 'EARN')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .get();

      // Get unique user IDs
      const userIds = new Set<string>();
      earningsQuery.docs.forEach(doc => {
        userIds.add(doc.data().userId);
      });

      logger.info(`Found ${userIds.size} users with earnings in ${period}`);

      // Generate report for each user
      let successCount = 0;
      let errorCount = 0;

      for (const userId of Array.from(userIds)) {
        try {
          await generateUserTaxReport(userId, period);
          successCount++;
        } catch (error) {
          logger.error(`Failed to generate report for user ${userId}:`, error);
          errorCount++;
        }
      }

      logger.info('Monthly tax report generation completed', {
        period,
        successCount,
        errorCount,
        totalUsers: userIds.size,
      });
    } catch (error) {
      logger.error('Monthly tax report generation failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled: Generate yearly tax reports for all earning users
 * Runs on January 15th at 03:00 UTC
 */
export const pack330_generateYearlyUserReports = scheduler.onSchedule(
  {
    schedule: '0 3 15 1 *', // 03:00 UTC on January 15th
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '2GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const period = getCurrentPeriod('yearly');
    logger.info('Starting yearly tax report generation', { period });

    try {
      const { startDate, endDate } = parsePeriod(period);

      const earningsQuery = await db
        .collection('walletTransactions')
        .where('type', '==', 'EARN')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .get();

      const userIds = new Set<string>();
      earningsQuery.docs.forEach(doc => {
        userIds.add(doc.data().userId);
      });

      logger.info(`Found ${userIds.size} users with earnings in ${period}`);

      let successCount = 0;
      let errorCount = 0;

      for (const userId of Array.from(userIds)) {
        try {
          await generateUserTaxReport(userId, period);
          successCount++;
        } catch (error) {
          logger.error(`Failed to generate yearly report for user ${userId}:`, error);
          errorCount++;
        }
      }

      logger.info('Yearly tax report generation completed', {
        period,
        successCount,
        errorCount,
        totalUsers: userIds.size,
      });
    } catch (error) {
      logger.error('Yearly tax report generation failed:', error);
      throw error;
    }
  }
);