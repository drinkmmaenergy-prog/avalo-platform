/**
 * PACK 81 — Creator Earnings Service
 * Service layer for interacting with earnings Cloud Functions
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  WalletSummary,
  LedgerPage,
  LedgerFilter,
  CSVExportResult,
} from '../types/earnings';

/**
 * Get creator wallet summary
 * Returns current balance, lifetime earnings, and breakdown by source
 */
export async function getCreatorWalletSummary(
  userId?: string
): Promise<WalletSummary> {
  const callable = httpsCallable<{ userId?: string }, WalletSummary>(
    functions,
    'earnings_getWalletSummary'
  );

  const result = await callable({ userId });
  return result.data;
}

/**
 * Get earnings ledger with pagination and filters
 */
export async function getEarningsLedger(params: {
  userId?: string;
  filters?: LedgerFilter;
  pageToken?: string;
  limit?: number;
}): Promise<LedgerPage> {
  const callable = httpsCallable<any, LedgerPage>(
    functions,
    'earnings_getLedger'
  );

  const result = await callable({
    userId: params.userId,
    fromDate: params.filters?.fromDate?.toISOString(),
    toDate: params.filters?.toDate?.toISOString(),
    sourceType: params.filters?.sourceType,
    pageToken: params.pageToken,
    limit: params.limit,
  });

  return result.data;
}

/**
 * Export earnings to CSV
 * Generates a signed download URL valid for 24 hours
 */
export async function exportEarningsCSV(params: {
  fromDate?: Date;
  toDate?: Date;
}): Promise<CSVExportResult> {
  const callable = httpsCallable<any, CSVExportResult>(
    functions,
    'earnings_exportCSV'
  );

  const result = await callable({
    fromDate: params.fromDate?.toISOString(),
    toDate: params.toDate?.toISOString(),
  });

  // Convert expiresAt string to Date
  return {
    ...result.data,
    expiresAt: new Date(result.data.expiresAt),
  };
}

/**
 * Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(amount: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((amount / total) * 100);
}

/**
 * Format date range for display
 */
export function formatDateRange(fromDate?: Date, toDate?: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  if (!fromDate && !toDate) {
    return 'All Time';
  }

  if (fromDate && !toDate) {
    return `From ${fromDate.toLocaleDateString(undefined, options)}`;
  }

  if (!fromDate && toDate) {
    return `Until ${toDate.toLocaleDateString(undefined, options)}`;
  }

  return `${fromDate!.toLocaleDateString(undefined, options)} - ${toDate!.toLocaleDateString(undefined, options)}`;
}