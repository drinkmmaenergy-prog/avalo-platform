import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 304 — Admin Financial Console & Reconciliation
 * Export Functions
 * 
 * Exports financial data to CSV/JSON for finance team
 * 
 * @package platformapp
 * @version 1.0.0
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { Storage } from '@google-cloud/storage';
import {
  PlatformFinanceMonthly,
  CreatorSummaryExportRow,
  FINANCE_CONSTANTS,
} from './types/pack304-admin-finance.types';
import { getMonthlyAggregation } from './pack304-aggregation';
import { admin, functions } from './runtime';

const storage = new Storage();
const BUCKET_NAME = process.env.FINANCE_EXPORT_BUCKET || 'platform-finance-exports';

// ============================================================================
// EXPORT MONTHLY FINANCE DATA
// ============================================================================

/**
 * Export monthly platform finance data
 */
export async function exportMonthlyFinanceData(
  year: number,
  month: number,
  format: 'csv' | 'json'
): Promise<string> {
  try {
    logger.info(`Exporting monthly finance data: ${year}-${month} as ${format}`);

    // Get aggregation data
    const data = await getMonthlyAggregation(year, month);

    if (!data) {
      throw new Error('No data available for this period');
    }

    // Generate filename
    const monthStr = String(month).padStart(2, '0');
    const timestamp = Date.now();
    const filename = `monthly_finance_${year}_${monthStr}_${timestamp}.${format}`;

    let content: string;

    if (format === 'csv') {
      content = generateMonthlyFinanceCSV(data);
    } else {
      content = JSON.stringify(
        {
          platform: data,
          breakdown: [
            {
              feature: 'Chat',
              gmvTokens: calculateFeatureGMV(data, 'chat'),
              platformFeesTokens: data.feesFromChatTokens,
              earnerTokens: calculateFeatureCreatorShare(data, 'chat'),
            },
            {
              feature: 'Calls',
              gmvTokens: calculateFeatureGMV(data, 'calls'),
              platformFeesTokens: data.feesFromCallsTokens,
              earnerTokens: calculateFeatureCreatorShare(data, 'calls'),
            },
            {
              feature: 'Calendar',
              gmvTokens: calculateFeatureGMV(data, 'calendar'),
              platformFeesTokens: data.feesFromCalendarTokens,
              earnerTokens: calculateFeatureCreatorShare(data, 'calendar'),
            },
            {
              feature: 'Events',
              gmvTokens: calculateFeatureGMV(data, 'events'),
              platformFeesTokens: data.feesFromEventsTokens,
              earnerTokens: calculateFeatureCreatorShare(data, 'events'),
            },
            {
              feature: 'Other',
              gmvTokens: calculateFeatureGMV(data, 'other'),
              platformFeesTokens: data.feesFromOtherTokens,
              earnerTokens: calculateFeatureCreatorShare(data, 'other'),
            },
          ],
        },
        null,
        2
      );
    }

    // Upload to Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(`exports/${filename}`);

    await file.save(content, {
      contentType: format === 'csv' ? 'text/csv' : 'application/json',
      metadata: {
        cacheControl: 'no-cache',
        metadata: {
          year: String(year),
          month: String(month),
          exportType: 'monthly_finance',
        },
      },
    });

    // Generate signed URL (valid for 24 hours)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    logger.info(`Export completed: ${filename}`);
    return signedUrl;
  } catch (error: any) {
    logger.error('Error exporting monthly finance data:', error);
    throw error;
  }
}

/**
 * Generate CSV for monthly finance data
 */
function generateMonthlyFinanceCSV(data: PlatformFinanceMonthly): string {
  const lines: string[] = [];

  // Header
  lines.push('Metric,Tokens,Fiat USD');

  // GMV
  lines.push(`GMV Total,${data.gmvTokens},${data.gmvFiatUSD.toFixed(2)}`);

  // Revenue Split
  lines.push(`Creator Share,${data.totalCreatorShareTokens},${(data.totalCreatorShareTokens * FINANCE_CONSTANTS.TOKEN_PAYOUT_USD_PER_TOKEN).toFixed(2)}`);
  lines.push(`Avalo Share (Fees),${data.totalAvaloShareTokens},${(data.totalAvaloShareTokens * FINANCE_CONSTANTS.TOKEN_PAYOUT_USD_PER_TOKEN).toFixed(2)}`);

  // Token Purchases
  lines.push(`Token Purchases,${data.totalTokenPurchasesTokens},${data.totalTokenPurchasesFiatUSD.toFixed(2)}`);

  // Payouts
  lines.push(`Payouts Completed,${data.totalPayoutTokens},${data.totalPayoutFiatUSD.toFixed(2)}`);
  lines.push(`Payout Transactions,${data.totalPayoutTransactions},`);

  // Outstanding Liability
  lines.push(`Outstanding Liability,${data.outstandingCreatorLiabilityTokens},${data.outstandingCreatorLiabilityFiatUSD.toFixed(2)}`);

  // Breakdown by Feature
  lines.push('');
  lines.push('Feature Breakdown,Avalo Fees (Tokens),');
  lines.push(`Chat,${data.feesFromChatTokens},`);
  lines.push(`Calls,${data.feesFromCallsTokens},`);
  lines.push(`Calendar,${data.feesFromCalendarTokens},`);
  lines.push(`Events,${data.feesFromEventsTokens},`);
  lines.push(`Other,${data.feesFromOtherTokens},`);

  // Refunds
  lines.push('');
  lines.push(`Refunds,${data.refundsTokens},`);
  lines.push(`Net Revenue,${data.netRevenueTokens},`);

  return lines.join('\n');
}

/**
 * Calculate GMV for a specific feature
 */
function calculateFeatureGMV(data: PlatformFinanceMonthly, feature: string): number {
  const feeTokens = {
    chat: data.feesFromChatTokens,
    calls: data.feesFromCallsTokens,
    calendar: data.feesFromCalendarTokens,
    events: data.feesFromEventsTokens,
    other: data.feesFromOtherTokens,
  }[feature] || 0;

  // Reverse calculate GMV from fees based on split
  const platform = feature === 'chat' || feature === 'other'
    ? FINANCE_CONSTANTS.SPLIT_CHAT_AVALO
    : FINANCE_CONSTANTS.SPLIT_CALLS_AVALO;

  return Math.round(feeTokens / platform);
}

/**
 * Calculate earner share for a specific feature
 */
function calculateFeatureCreatorShare(data: PlatformFinanceMonthly, feature: string): number {
  const gmv = calculateFeatureGMV(data, feature);
  const earner = feature === 'chat' || feature === 'other'
    ? FINANCE_CONSTANTS.SPLIT_CHAT_CREATOR
    : FINANCE_CONSTANTS.SPLIT_CALLS_CREATOR;

  return Math.floor(gmv * earner);
}

// ============================================================================
// EXPORT CREATOR SUMMARY DATA
// ============================================================================

/**
 * Export earner summary data
 */
export async function exportCreatorSummaryData(
  year: number,
  month: number,
  format: 'csv' | 'json'
): Promise<string> {
  try {
    logger.info(`Exporting earner summary data: ${year}-${month} as ${format}`);

    // Get earner earnings data
    const monthStr = String(month).padStart(2, '0');
    const docIdPattern = `%_${year}_${monthStr}`;

    const earningsQuery = db
      .collection('earnerEarningsMonthly')
      .where('year', '==', year)
      .where('month', '==', month);

    const snapshot = await earningsQuery.get();

    const rows: CreatorSummaryExportRow[] = [];

    for (const doc of snapshot.docs) {
      const earning = doc.data();

      // Get user data for country/segment
      const userDoc = await db.collection('users').doc(earning.userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      rows.push({
        userId: earning.userId,
        tokensNetEarned: earning.tokensNetEarned || 0,
        tokensCreatorShare: earning.tokensCreatorShare || 0,
        tokensPayoutPaid: earning.payoutTokensPaid || 0,
        tokensLiabilityEndOfMonth:
          (earning.tokensCreatorShare || 0) - (earning.payoutTokensPaid || 0),
        country: userData?.country || 'UNKNOWN',
        segment: userData?.subscriptionTier || 'STANDARD',
      });
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `earner_summary_${year}_${monthStr}_${timestamp}.${format}`;

    let content: string;

    if (format === 'csv') {
      content = generateCreatorSummaryCSV(rows);
    } else {
      content = JSON.stringify({ year, month, earners: rows }, null, 2);
    }

    // Upload to Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(`exports/${filename}`);

    await file.save(content, {
      contentType: format === 'csv' ? 'text/csv' : 'application/json',
      metadata: {
        cacheControl: 'no-cache',
        metadata: {
          year: String(year),
          month: String(month),
          exportType: 'earner_summary',
        },
      },
    });

    // Generate signed URL (valid for 24 hours)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    logger.info(`Export completed: ${filename}`);
    return signedUrl;
  } catch (error: any) {
    logger.error('Error exporting earner summary data:', error);
    throw error;
  }
}

/**
 * Generate CSV for earner summary data
 */
function generateCreatorSummaryCSV(rows: CreatorSummaryExportRow[]): string {
  const lines: string[] = [];

  // Header
  lines.push(
    'User ID,Net Earned (Tokens),Creator Share (Tokens),Payout Paid (Tokens),Outstanding Liability (Tokens),Country,Segment'
  );

  // Rows
  for (const row of rows) {
    lines.push(
      [
        row.userId,
        row.tokensNetEarned,
        row.tokensCreatorShare,
        row.tokensPayoutPaid,
        row.tokensLiabilityEndOfMonth,
        row.country,
        row.segment,
      ].join(',')
    );
  }

  return lines.join('\n');
}

























