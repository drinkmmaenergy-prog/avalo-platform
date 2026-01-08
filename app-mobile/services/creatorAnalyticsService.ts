/**
 * Creator Analytics Service
 * PACK 97 — Service layer for creator analytics and earnings insights
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorEarningsSummary {
  lifetime: {
    tokensEarnedTotal: number;
    tokensFromGifts: number;
    tokensFromPaidMedia: number;
    tokensFromStories: number;
    tokensFromCalls: number;
    tokensFromAI: number;
    tokensFromOther?: number;
  };
  last30Days: {
    tokensEarnedTotal: number;
    averagePerDay: number;
    uniquePayers: number;
    daysWithEarnings: number;
  };
  currentBalance: {
    availableTokens: number;
    lifetimeEarned: number;
  };
}

export interface EarningsTimeseriesPoint {
  date: string; // YYYY-MM-DD
  tokensEarnedTotal: number;
  tokensFromGifts: number;
  tokensFromPaidMedia: number;
  tokensFromStories: number;
  tokensFromCalls: number;
  tokensFromAI: number;
}

export interface EarningsTimeseries {
  points: EarningsTimeseriesPoint[];
  periodStart: Date;
  periodEnd: Date;
}

export interface TopContentItem {
  contentType: string;
  contentId: string;
  title?: string;
  previewUrl?: string;
  tokensEarned: number;
  unlocksCount: number;
}

export interface TopContentResult {
  items: TopContentItem[];
  periodStart: Date;
  periodEnd: Date;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

const functions = getFunctions();

/**
 * Get creator earnings summary
 * Returns lifetime & last 30 days breakdown plus current balance
 */
export async function getCreatorEarningsSummary(
  userId?: string
): Promise<CreatorEarningsSummary> {
  const callable = httpsCallable<{ userId?: string }, CreatorEarningsSummary>(
    functions,
    'pack97_getCreatorEarningsSummary'
  );

  const result = await callable({ userId });
  return result.data;
}

/**
 * Get creator earnings timeseries for charts
 * @param fromDate Start date (YYYY-MM-DD or ISO string)
 * @param toDate End date (YYYY-MM-DD or ISO string)
 */
export async function getCreatorEarningsTimeseries(
  fromDate?: string | Date,
  toDate?: string | Date,
  userId?: string
): Promise<EarningsTimeseries> {
  const callable = httpsCallable<
    { userId?: string; fromDate?: string; toDate?: string },
    EarningsTimeseries
  >(functions, 'pack97_getCreatorEarningsTimeseries');

  const params: { userId?: string; fromDate?: string; toDate?: string } = {
    userId,
  };

  if (fromDate) {
    params.fromDate =
      typeof fromDate === 'string' ? fromDate : fromDate.toISOString();
  }

  if (toDate) {
    params.toDate = typeof toDate === 'string' ? toDate : toDate.toISOString();
  }

  const result = await callable(params);
  
  // Convert date strings back to Date objects
  return {
    ...result.data,
    periodStart: new Date(result.data.periodStart),
    periodEnd: new Date(result.data.periodEnd),
  };
}

/**
 * Get top performing content ranked by earnings
 * @param fromDate Start date (YYYY-MM-DD or ISO string)
 * @param toDate End date (YYYY-MM-DD or ISO string)
 * @param limit Max number of items to return (default: 10)
 */
export async function getTopPerformingContent(
  fromDate?: string | Date,
  toDate?: string | Date,
  limit: number = 10,
  userId?: string
): Promise<TopContentResult> {
  const callable = httpsCallable<
    {
      userId?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    },
    TopContentResult
  >(functions, 'pack97_getTopPerformingContent');

  const params: {
    userId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  } = {
    userId,
    limit,
  };

  if (fromDate) {
    params.fromDate =
      typeof fromDate === 'string' ? fromDate : fromDate.toISOString();
  }

  if (toDate) {
    params.toDate = typeof toDate === 'string' ? toDate : toDate.toISOString();
  }

  const result = await callable(params);
  
  // Convert date strings back to Date objects
  return {
    ...result.data,
    periodStart: new Date(result.data.periodStart),
    periodEnd: new Date(result.data.periodEnd),
  };
}

/**
 * Helper: Get date range for last N days
 */
export function getLastNDaysRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  
  return { from, to };
}

/**
 * Helper: Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Helper: Calculate percentage change
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Helper: Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Helper: Get content type display name
 */
export function getContentTypeDisplayName(contentType: string): string {
  const displayNames: { [key: string]: string } = {
    GIFT: 'Gift',
    PREMIUM_STORY: 'Premium Story',
    PAID_MEDIA: 'Paid Media',
    PAID_CALL: 'Voice/Video Call',
    AI_COMPANION: 'AI Companion',
  };
  
  return displayNames[contentType] || contentType;
}