/**
 * PACK 330 — Platform Tax Report Generation
 * Cloud Functions for generating platform-level tax & revenue reports
 */

import { https, logger, scheduler } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  TaxReportPlatform,
  RegionBreakdown,
  GetPlatformTaxReportRequest,
  GetPlatformTaxReportResponse,
  TAX_CONFIG,
} from './types/pack330-tax.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse period string
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
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
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
  const month = now.getMonth();

  if (type === 'yearly') {
    return `${year - 1}-YEAR`;
  } else {
    const prevMonth = month === 0 ? 12 : month;
    const prevYear = month === 0 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  }
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
// PLATFORM TAX REPORT GENERATION
// ============================================================================

/**
 * Generate platform tax report for a specific period
 */
async function generatePlatformReport(period: string): Promise<TaxReportPlatform> {
  const { startDate, endDate } = parsePeriod(period);

  logger.info('Generating platform tax report', { period, startDate, endDate });

  // Initialize counters
  let totalGrossTokensSold = 0;
  let totalTokensPaidOutToCreators = 0;
  let totalPayoutsPLN = 0;

  const regionBreakdown: {
    PL?: RegionBreakdown;
    EU?: RegionBreakdown;
    US?: RegionBreakdown;
    ROW?: RegionBreakdown;
  } = {};

  // Get all token purchases in the period
  const purchasesQuery = await db
    .collection('walletTransactions')
    .where('type', '==', 'PURCHASE')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();

  purchasesQuery.docs.forEach(doc => {
    const tx = doc.data();
    totalGrossTokensSold += tx.amountTokens || 0;
  });

  // Get all earnings (creator share) in the period
  const earningsQuery = await db
    .collection('walletTransactions')
    .where('type', '==', 'EARN')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();

  // Track unique creators per region
  const creatorsByRegion: Record<string, Set<string>> = {
    PL: new Set(),
    EU: new Set(),
    US: new Set(),
    ROW: new Set(),
  };

  const tokensByRegion: Record<string, number> = {
    PL: 0,
    EU: 0,
    US: 0,
    ROW: 0,
  };

  earningsQuery.docs.forEach(doc => {
    const tx = doc.data();
    const creatorId = tx.userId;
    const tokens = tx.amountTokens || 0;
    
    totalTokensPaidOutToCreators += tokens;
  });

  // Get creator regions from tax profiles and aggregate by region
  for (const doc of earningsQuery.docs) {
    const tx = doc.data();
    const creatorId = tx.userId;
    const tokens = tx.amountTokens || 0;

    try {
      const profileDoc = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_PROFILES)
        .doc(creatorId)
        .get();

      let region: 'PL' | 'EU' | 'US' | 'ROW' = 'ROW';
      
      if (profileDoc.exists) {
        const countryCode = profileDoc.data()?.countryCode || '';
        region = getRegion(countryCode);
      }

      creatorsByRegion[region].add(creatorId);
      tokensByRegion[region] += tokens;
    } catch (error) {
      logger.warn(`Failed to get tax profile for creator ${creatorId}:`, error);
      creatorsByRegion.ROW.add(creatorId);
      tokensByRegion.ROW += tokens;
    }
  }

  // Get completed payouts in the period
  const payoutsQuery = await db
    .collection('payoutRequests')
    .where('status', '==', 'COMPLETED')
    .where('completedAt', '>=', startDate)
    .where('completedAt', '<=', endDate)
    .get();

  payoutsQuery.docs.forEach(doc => {
    const payout = doc.data();
    totalPayoutsPLN += payout.amountPLN || 0;
  });

  // Build region breakdown
  for (const [region, creators] of Object.entries(creatorsByRegion)) {
    if (creators.size > 0) {
      regionBreakdown[region as keyof typeof regionBreakdown] = {
        creators: creators.size,
        tokens: tokensByRegion[region],
        payoutPLN: tokensByRegion[region] * TAX_CONFIG.TOKEN_TO_PLN_RATE,
      };
    }
  }

  // Calculate platform revenue
  const totalGrossRevenuePLN = totalGrossTokensSold * TAX_CONFIG.TOKEN_TO_PLN_RATE;
  const totalCreatorPayoutsPLN = totalTokensPaidOutToCreators * TAX_CONFIG.TOKEN_TO_PLN_RATE;
  const totalAvaloRevenuePLN = totalGrossRevenuePLN - totalCreatorPayoutsPLN;

  // Create report
  const report: TaxReportPlatform = {
    period,
    totalGrossTokensSold,
    totalGrossRevenuePLN,
    totalTokensPaidOutToCreators,
    totalPayoutsPLN: totalCreatorPayoutsPLN,
    totalAvaloRevenuePLN,
    regionBreakdown,
    generatedAt: serverTimestamp() as any,
  };

  // Save report to Firestore
  const reportId = `platform_${period}`;
  await db
    .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_PLATFORM)
    .doc(reportId)
    .set(report);

  logger.info('Platform tax report generated', {
    period,
    totalGrossRevenuePLN,
    totalAvaloRevenuePLN,
    regions: Object.keys(regionBreakdown),
  });

  return report;
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Callable: Get platform tax report (admin only)
 */
export const pack330_getPlatformTaxReport = https.onCall<GetPlatformTaxReportRequest>(
  { region: 'europe-west3', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { period } = request.data;

    if (!period || !/^\d{4}-(0[1-9]|1[0-2]|YEAR)$/.test(period)) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid period format. Use YYYY-MM or YYYY-YEAR'
      );
    }

    try {
      const reportId = `platform_${period}`;
      const reportDoc = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_PLATFORM)
        .doc(reportId)
        .get();

      if (!reportDoc.exists) {
        // Generate on-demand if not exists
        const report = await generatePlatformReport(period);
        
        const response: GetPlatformTaxReportResponse = {
          success: true,
          report,
        };

        return response;
      }

      const report = reportDoc.data() as TaxReportPlatform;

      const response: GetPlatformTaxReportResponse = {
        success: true,
        report,
      };

      return response;
    } catch (error: any) {
      logger.error('Get platform tax report error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to get platform tax report'
      );
    }
  }
);

/**
 * Callable: List platform tax reports (admin only)
 */
export const pack330_listPlatformTaxReports = https.onCall(
  { region: 'europe-west3', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { limit = 12 } = request.data;

    try {
      const reportsQuery = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_REPORTS_PLATFORM)
        .orderBy('period', 'desc')
        .limit(limit)
        .get();

      const reports = reportsQuery.docs.map(doc => doc.data() as TaxReportPlatform);

      return {
        success: true,
        reports,
      };
    } catch (error: any) {
      logger.error('List platform tax reports error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to list platform tax reports'
      );
    }
  }
);

/**
 * Callable: Trigger platform report generation (admin only)
 */
export const pack330_admin_generatePlatformReport = https.onCall(
  { region: 'europe-west3', memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { period } = request.data;

    if (!period || !/^\d{4}-(0[1-9]|1[0-2]|YEAR)$/.test(period)) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid period format. Use YYYY-MM or YYYY-YEAR'
      );
    }

    try {
      const report = await generatePlatformReport(period);

      return {
        success: true,
        report,
      };
    } catch (error: any) {
      logger.error('Admin generate platform report error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to generate platform report'
      );
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Scheduled: Generate monthly platform report
 * Runs on 2nd of each month at 04:00 UTC
 */
export const pack330_generateMonthlyPlatformReport = scheduler.onSchedule(
  {
    schedule: '0 4 2 * *', // 04:00 UTC on 2nd of each month
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '1GiB',
    timeoutSeconds: 300,
  },
  async (event) => {
    const period = getCurrentPeriod('monthly');
    logger.info('Starting monthly platform report generation', { period });

    try {
      await generatePlatformReport(period);
      logger.info('Monthly platform report generated successfully', { period });
    } catch (error) {
      logger.error('Monthly platform report generation failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled: Generate yearly platform report
 * Runs on January 16th at 04:00 UTC
 */
export const pack330_generateYearlyPlatformReport = scheduler.onSchedule(
  {
    schedule: '0 4 16 1 *', // 04:00 UTC on January 16th
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '2GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const period = getCurrentPeriod('yearly');
    logger.info('Starting yearly platform report generation', { period });

    try {
      await generatePlatformReport(period);
      logger.info('Yearly platform report generated successfully', { period });
    } catch (error) {
      logger.error('Yearly platform report generation failed:', error);
      throw error;
    }
  }
);