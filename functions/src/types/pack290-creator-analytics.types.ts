/**
 * PACK 290 — Creator Dashboard & Analytics Types
 * Complete analytics system for earning creators
 * 
 * Purpose:
 * - Show earnings overview (tokens + fiat equivalent)
 * - Break down by feature (chat, media, calls, calendar, events)
 * - Track audience and monetization evolution
 * - Provide KPIs and retention metrics
 * 
 * Dependencies:
 * - PACK 267 (token economics)
 * - PACK 277 (wallet & transactions)
 * - PACK 286 (calendar & events)
 * - PACK 287 (media in chat)
 * - PACK 288-289 (token store + payouts)
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

export const CREATOR_ANALYTICS_CONSTANTS = {
  TOKEN_TO_PLN_RATE: 0.20,  // Fixed: 1 token = 0.20 PLN
  DEFAULT_TIME_RANGE_DAYS: 30,
  MAX_TIME_RANGE_DAYS: 365,
  TOP_PAYERS_LIMIT: 10,
};

// ============================================================================
// TRANSACTION TYPES (Enhanced for Analytics)
// ============================================================================

export type AnalyticsTransactionType =
  // Earning types
  | 'CHAT_EARN'
  | 'MEDIA_EARN'
  | 'CALL_EARN'
  | 'CALENDAR_EARN'
  | 'EVENT_EARN'
  | 'BONUS'
  | 'ADJUSTMENT'
  // Spending types (for context)
  | 'CHAT_SPEND'
  | 'MEDIA_SPEND'
  | 'CALL_SPEND'
  | 'CALENDAR_SPEND'
  | 'EVENT_SPEND'
  // Other types
  | 'TOKEN_PURCHASE'
  | 'WITHDRAWAL'
  // Legacy compatibility
  | 'EARN'
  | 'SPEND';

export type AnalyticsFeature =
  | 'CHAT'
  | 'MEDIA'
  | 'CALL'
  | 'CALENDAR'
  | 'EVENT'
  | 'STORE'
  | 'OTHER';

// ============================================================================
// WALLET TRANSACTION (Enhanced Schema)
// ============================================================================

export interface WalletTransactionEnhanced {
  txId: string;
  userId: string;
  
  direction: 'IN' | 'OUT';
  type: AnalyticsTransactionType;
  
  relatedId?: string;  // chatId | bookingId | eventId | purchaseId | withdrawalId
  tokens: number;
  currency?: string;  // 'PLN' | 'USD' | 'EUR', etc.
  amountFiat?: number;  // Optional snapshot for purchases/withdrawals
  
  createdAt: Timestamp;
  meta: {
    counterpartyId?: string;  // UID of other party (null for system)
    feature: AnalyticsFeature;
    notes?: string;
    // Additional context
    beforeBalance?: number;
    afterBalance?: number;
    source?: string;  // Legacy compatibility
  };
}

// ============================================================================
// EARNINGS OVERVIEW
// ============================================================================

export interface EarningsOverview {
  period: {
    from: string;  // ISO date
    to: string;    // ISO date
  };
  
  tokens: {
    totalEarned: number;
    totalWithdrawn: number;
    currentBalance: number;
    availableToWithdraw: number;
  };
  
  fiat: {
    ratePerTokenPLN: number;  // Always 0.20
    totalEarnedPLN: number;
    currentBalancePLN: number;
    availableToWithdrawPLN: number;
  };
  
  byFeature: {
    chatTokens: number;
    mediaTokens: number;
    callTokens: number;
    calendarTokens: number;
    eventTokens: number;
    otherTokens: number;
  };
  
  counts: {
    paidChats: number;
    paidCalls: number;
    calendarBookingsCompleted: number;
    eventTicketsValidated: number;
    uniquePayers: number;
  };
}

// ============================================================================
// TIME SERIES DATA
// ============================================================================

export type TimeGranularity = 'day' | 'week';

export interface TimeSeriesPoint {
  start: string;  // ISO datetime
  end: string;    // ISO datetime
  tokensEarned: number;
  tokensEarnedChat: number;
  tokensEarnedCalendar: number;
  tokensEarnedEvents: number;
  uniquePayers: number;
}

export interface TimeSeriesData {
  granularity: TimeGranularity;
  points: TimeSeriesPoint[];
}

// ============================================================================
// PAYERS & RETENTION
// ============================================================================

export interface TopPayer {
  payerId: string;
  tokensSpent: number;
  lastActivity: string;  // ISO datetime
  // Privacy: displayName/avatar fetched separately if needed
}

export interface PayersData {
  uniquePayers: number;
  newPayers: number;       // First time in this period
  returningPayers: number; // Had previously paid before period start
  topPayers: TopPayer[];
}

// ============================================================================
// DAILY STATS (Pre-aggregation)
// ============================================================================

export interface CreatorDailyStats {
  id: string;  // {userId}_{YYYY-MM-DD}
  userId: string;
  date: string;  // YYYY-MM-DD
  
  // Token earnings by feature
  tokensEarnedTotal: number;
  tokensEarnedChat: number;
  tokensEarnedMedia: number;
  tokensEarnedCall: number;
  tokensEarnedCalendar: number;
  tokensEarnedEvents: number;
  tokensEarnedOther: number;
  
  // Activity counts
  uniquePayers: number;
  paidChats: number;
  paidCalls: number;
  calendarBookings: number;
  eventTickets: number;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetAnalyticsOverviewRequest {
  userId: string;
  from?: string;  // ISO date, defaults to 30 days ago
  to?: string;    // ISO date, defaults to now
}

export interface GetAnalyticsOverviewResponse {
  success: boolean;
  data?: EarningsOverview;
  error?: string;
}

export interface GetTimeSeriesRequest {
  userId: string;
  from?: string;  // ISO date
  to?: string;    // ISO date
  granularity: TimeGranularity;
}

export interface GetTimeSeriesResponse {
  success: boolean;
  data?: TimeSeriesData;
  error?: string;
}

export interface GetPayersAnalyticsRequest {
  userId: string;
  from?: string;  // ISO date
  to?: string;    // ISO date
}

export interface GetPayersAnalyticsResponse {
  success: boolean;
  data?: PayersData;
  error?: string;
}

// ============================================================================
// PRE-AGGREGATION CONFIG
// ============================================================================

export interface DailyAggregationConfig {
  enabled: boolean;
  cronSchedule: string;  // e.g., '0 2 * * *' for 2 AM daily
  lookbackDays: number;  // How many days to process
  batchSize: number;     // Users per batch
}

export const DEFAULT_AGGREGATION_CONFIG: DailyAggregationConfig = {
  enabled: true,
  cronSchedule: '0 2 * * *',  // 2 AM UTC
  lookbackDays: 2,  // Process yesterday + day before (in case of delays)
  batchSize: 100,
};

// ============================================================================
// AGGREGATION JOB STATUS
// ============================================================================

export interface AggregationJobStatus {
  jobId: string;
  date: string;  // YYYY-MM-DD
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  usersProcessed: number;
  totalUsers: number;
  errors: string[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface DateRange {
  from: Date;
  to: Date;
}

export interface TokensByFeature {
  chat: number;
  media: number;
  call: number;
  calendar: number;
  event: number;
  other: number;
}

export interface ActivityCounts {
  paidChats: number;
  paidCalls: number;
  calendarBookings: number;
  eventTickets: number;
}

// ============================================================================
// TYPE MAPPING HELPERS
// ============================================================================

/**
 * Map legacy transaction types to analytics features
 */
export function mapTransactionToFeature(
  type: string,
  source?: string
): AnalyticsFeature {
  // Direct type mapping
  if (type.includes('CHAT')) return 'CHAT';
  if (type.includes('MEDIA')) return 'MEDIA';
  if (type.includes('CALL')) return 'CALL';
  if (type.includes('CALENDAR')) return 'CALENDAR';
  if (type.includes('EVENT')) return 'EVENT';
  if (type.includes('STORE') || type.includes('PURCHASE')) return 'STORE';
  
  // Fallback to source
  if (source) {
    const sourceUpper = source.toUpperCase();
    if (sourceUpper === 'CHAT') return 'CHAT';
    if (sourceUpper === 'MEDIA') return 'MEDIA';
    if (sourceUpper === 'CALL') return 'CALL';
    if (sourceUpper === 'CALENDAR') return 'CALENDAR';
    if (sourceUpper === 'EVENT') return 'EVENT';
    if (sourceUpper === 'STORE') return 'STORE';
  }
  
  return 'OTHER';
}

/**
 * Check if transaction is an earning type
 */
export function isEarningTransaction(type: string): boolean {
  const earningTypes = [
    'CHAT_EARN',
    'MEDIA_EARN',
    'CALL_EARN',
    'CALENDAR_EARN',
    'EVENT_EARN',
    'BONUS',
    'EARN',  // Legacy
  ];
  return earningTypes.includes(type);
}

/**
 * Check if transaction is a spending type
 */
export function isSpendingTransaction(type: string): boolean {
  const spendingTypes = [
    'CHAT_SPEND',
    'MEDIA_SPEND',
    'CALL_SPEND',
    'CALENDAR_SPEND',
    'EVENT_SPEND',
    'SPEND',  // Legacy
    'WITHDRAWAL',
  ];
  return spendingTypes.includes(type);
}