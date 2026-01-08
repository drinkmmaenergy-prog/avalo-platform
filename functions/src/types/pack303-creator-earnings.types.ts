/**
 * PACK 303 — Creator Earnings Dashboard & Monthly Statements
 * Types and Interfaces
 * 
 * Provides transparency for earning users over their money in Avalo:
 * - Unified earnings dashboard (mobile + web)
 * - Breakdown per source (chat, calls, calendar, events, etc.)
 * - Monthly statements (exportable as PDF/CSV)
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CREATOR EARNINGS MONTHLY AGGREGATION
// ============================================================================

/**
 * Monthly earnings aggregation per user
 * Collection: creatorEarningsMonthly/{docId}
 * docId format: ${userId}_${year}_${month} (e.g. UID_2025_01)
 */
export interface CreatorEarningsMonthly {
  userId: string;
  year: number;
  month: number; // 1–12

  // Tokens earned by source (before any refunds)
  tokensEarnedChat: number;
  tokensEarnedCalls: number;
  tokensEarnedCalendar: number;
  tokensEarnedEvents: number;
  tokensEarnedOther: number; // future extensions (media, AI bots, etc.)

  // Tokens refunded (returned to payers)
  tokensRefundedChat: number;
  tokensRefundedCalendar: number;
  tokensRefundedEvents: number;

  // Net earnings calculations
  tokensNetEarned: number; // after refunds but BEFORE Avalo split
  tokensAvaloShare: number; // Avalo fee: 35% or 20% depending on feature
  tokensCreatorShare: number; // creator: 65% or 80%

  // Payout tracking
  payoutTokensRequested: number;
  payoutTokensPaid: number;

  // Fiat values
  payoutFiatPaid: number; // in base currency (e.g. PLN)
  payoutCurrency: string; // e.g., "PLN"

  // Exchange rate tracking
  currencyFxRate: number; // fx used if local currency differs from PLN

  // Timestamps
  generatedAt: string; // ISO_DATETIME when aggregation was last computed
  updatedAt: string; // ISO_DATETIME
}

// ============================================================================
// EARNINGS SOURCE TYPES
// ============================================================================

export type EarningsSource = 
  | 'CHAT'
  | 'CALLS'
  | 'CALENDAR'
  | 'EVENTS'
  | 'OTHER';

export interface EarningsSourceBreakdown {
  source: EarningsSource;
  tokensEarned: number;
  tokensRefunded: number;
  tokensCreatorShare: number;
}

// ============================================================================
// DASHBOARD DATA TYPES
// ============================================================================

export interface EarningsSummary {
  currentMonthTokens: number; // Estimated tokens (current month)
  availableForPayout: number; // Available tokens for payout
  totalPayoutsLifetime: number; // Total payouts lifetime (in fiat)
  currency: string;
}

export interface EarningsBreakdown {
  year: number;
  month: number;
  bySource: EarningsSourceBreakdown[];
  totalNetTokens: number;
  totalCreatorShare: number;
}

export interface EarningsTimelinePoint {
  date: string; // YYYY-MM-DD
  tokensNetEarned: number;
}

// ============================================================================
// MONTHLY STATEMENT TYPES
// ============================================================================

export interface MonthlyStatementSummary {
  tokensNetEarned: number;
  tokensCreatorShare: number;
  tokensAvaloShare: number;
  payoutTokensPaid: number;
  payoutFiatPaid: number;
}

export interface MonthlyStatementTransaction {
  date: string; // ISO_DATETIME
  type: string;
  direction: 'IN' | 'OUT';
  amountTokens: number;
  relatedId?: string;
  note?: string;
}

export interface MonthlyStatement {
  userId: string;
  period: {
    year: number;
    month: number;
  };
  baseCurrency: string;
  tokenPayoutRate: number; // e.g., 0.2 (1 token = 0.20 PLN)

  summary: MonthlyStatementSummary;
  bySource: EarningsSourceBreakdown[];
  transactions: MonthlyStatementTransaction[];
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetEarningsDashboardRequest {
  userId: string;
  year?: number; // Optional: get specific year/month
  month?: number;
}

export interface GetEarningsDashboardResponse {
  success: boolean;
  summary?: EarningsSummary;
  breakdown?: EarningsBreakdown;
  timeline?: EarningsTimelinePoint[];
  error?: string;
}

export interface GetMonthlyStatementRequest {
  userId: string;
  year: number;
  month: number;
  format?: 'json' | 'pdf' | 'csv';
}

export interface GetMonthlyStatementResponse {
  success: boolean;
  statement?: MonthlyStatement;
  downloadUrl?: string; // For PDF/CSV downloads
  error?: string;
}

export interface ExportStatementRequest {
  userId: string;
  year: number;
  month: number;
  format: 'pdf' | 'csv';
}

export interface ExportStatementResponse {
  success: boolean;
  downloadUrl?: string;
  expiresAt?: string; // ISO_DATETIME
  error?: string;
}

// ============================================================================
// AGGREGATION JOB TYPES
// ============================================================================

export interface AggregationJobConfig {
  batchSize: number; // Number of users to process per batch
  lookbackMonths: number; // How many months to check for updates
}

export interface AggregationResult {
  userId: string;
  year: number;
  month: number;
  success: boolean;
  tokensProcessed: number;
  transactionsProcessed: number;
  error?: string;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type StatementAuditAction =
  | 'STATEMENT_VIEWED'
  | 'STATEMENT_EXPORTED_PDF'
  | 'STATEMENT_EXPORTED_CSV'
  | 'AGGREGATION_RUN';

export interface StatementAuditLog {
  logId: string;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string;
  action: StatementAuditAction;
  userId: string; // User whose statement was accessed
  year: number;
  month: number;
  format?: 'pdf' | 'csv';
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Revenue split percentages (MUST match wallet service)
 * These values are read-only and MUST NOT be changed
 */
export const REVENUE_SPLITS = {
  CHAT: { creator: 0.65, avalo: 0.35 },
  CALLS: { creator: 0.80, avalo: 0.20 },
  CALENDAR: { creator: 0.80, avalo: 0.20 },
  EVENTS: { creator: 0.80, avalo: 0.20 },
  OTHER: { creator: 0.65, avalo: 0.35 },
} as const;

/**
 * Payout rate: 1 token = 0.20 PLN (FIXED)
 */
export const TOKEN_PAYOUT_RATE_PLN = 0.20;

/**
 * Statement export file storage settings
 */
export const STATEMENT_EXPORT_CONFIG = {
  bucketName: 'avalo-statements',
  expirationHours: 24, // Download link expires after 24 hours
  maxFileSizeMB: 10,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate document ID for monthly earnings
 */
export function generateMonthlyDocId(userId: string, year: number, month: number): string {
  return `${userId}_${year}_${String(month).padStart(2, '0')}`;
}

/**
 * Parse document ID back to components
 */
export function parseMonthlyDocId(docId: string): { userId: string; year: number; month: number } | null {
  const parts = docId.split('_');
  if (parts.length < 3) return null;
  
  const year = parseInt(parts[parts.length - 2]);
  const month = parseInt(parts[parts.length - 1]);
  const userId = parts.slice(0, -2).join('_');
  
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return null;
  }
  
  return { userId, year, month };
}

/**
 * Get current month key (for tracking current period)
 */
export function getCurrentMonthKey(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // JavaScript months are 0-indexed
  };
}

/**
 * Calculate date range for a given month
 */
export function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1); // First day of month
  const end = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
  return { start, end };
}

/**
 * Format month for display
 */
export function formatMonthName(month: number, locale: string = 'en'): string {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleDateString(locale, { month: 'long' });
}

/**
 * Validate year/month combination
 */
export function isValidYearMonth(year: number, month: number): boolean {
  if (month < 1 || month > 12) return false;
  if (year < 2024 || year > 2100) return false;
  
  // Check if date is not in the future
  const now = new Date();
  const targetDate = new Date(year, month - 1, 1);
  return targetDate <= now;
}