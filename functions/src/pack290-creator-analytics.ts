/**
 * PACK 290 — Creator Dashboard & Analytics
 * Complete analytics system for earning creators
 * 
 * Features:
 * - Earnings overview (tokens + fiat equivalent)
 * - Time series breakdown (daily/weekly)
 * - Payers analytics & retention
 * - Integration with wallet & withdrawals
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, FieldValue } from './init';
import {
  EarningsOverview,
  TimeSeriesData,
  TimeSeriesPoint,
  PayersData,
  TopPayer,
  CreatorDailyStats,
  GetAnalyticsOverviewRequest,
  GetAnalyticsOverviewResponse,
  GetTimeSeriesRequest,
  GetTimeSeriesResponse,
  GetPayersAnalyticsRequest,
  GetPayersAnalyticsResponse,
  CREATOR_ANALYTICS_CONSTANTS,
  mapTransactionToFeature,
  isEarningTransaction,
 TimeGranularity,
} from './types/pack290-creator-analytics.types';
import { WalletDataExtended } from './types/pack289-withdrawals.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse and validate date range
 */
function parseDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - CREATOR_ANALYTICS_CONSTANTS.DEFAULT_TIME_RANGE_DAYS);
  
  const fromDate = from ? new Date(from) : defaultFrom;
  
  // Validate
  if (fromDate > toDate) {
    throw new HttpsError('invalid-argument', 'from date must be before to date');
  }
  
  const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > CREATOR_ANALYTICS_CONSTANTS.MAX_TIME_RANGE_DAYS) {
    throw new HttpsError(
      'invalid-argument',
      `Date range cannot exceed ${CREATOR_ANALYTICS_CONSTANTS.MAX_TIME_RANGE_DAYS} days`
    );
  }
  
  return { fromDate, toDate };
}

/**
 * Get withdrawable tokens calculation
 */
async function getWithdrawableTokens(userId: string): Promise<number> {
  const walletRef = db.collection('wallets').doc(userId);
  const walletDoc = await walletRef.get();
  
  if (!walletDoc.exists) {
    return 0;
  }
  
  const wallet = walletDoc.data() as WalletDataExtended;
  const totalWithdrawn = wallet.totalWithdrawnTokens || 0;
  const maxEarnedAvailable = wallet.lifetimeEarnedTokens - totalWithdrawn;
  
  return Math.min(wallet.balanceTokens, Math.max(0, maxEarnedAvailable));
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get start of week (Monday)
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// ANALYTICS ENDPOINT: OVERVIEW
// ============================================================================

/**
 * Get earnings overview for a creator
 * 
 * Returns:
 * - Total earned/withdrawn/current balance
 * - Earnings breakdown by feature
 * - Activity counts (chats, calls, bookings, etc.)
 */
export const creator_analytics_overview = onCall(
  { cors: true },
  async (request): Promise<GetAnalyticsOverviewResponse> => {
    try {
      // Authentication
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      const userId = request.auth.uid;
      const params = request.data as GetAnalyticsOverviewRequest;
      
      // Parse date range
      const { fromDate, toDate } = parseDateRange(params.from, params.to);
      
      // Get wallet data
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await walletRef.get();
      
      if (!walletDoc.exists) {
        return {
          success: true,
          data: getEmptyOverview(fromDate, toDate),
        };
      }
      
      const wallet = walletDoc.data() as WalletDataExtended;
      
      // Get transactions for period
      const txSnapshot = await db
        .collection('walletTransactions')
        .where('userId', '==', userId)
        .where('createdAt', '>=', fromDate)
        .where('createdAt', '<=', toDate)
        .orderBy('createdAt', 'desc')
        .get();
      
      // Aggregate by feature
      const byFeature = {
        chatTokens: 0,
        mediaTokens: 0,
        callTokens: 0,
        calendarTokens: 0,
        eventTokens: 0,
        otherTokens: 0,
      };
      
      const counts = {
        paidChats: 0,
        paidCalls: 0,
        calendarBookingsCompleted: 0,
        eventTicketsValidated: 0,
        uniquePayers: 0,
      };
      
      const uniquePayerIds = new Set<string>();
      const uniqueChats = new Set<string>();
      const uniqueCalls = new Set<string>();
      const uniqueBookings = new Set<string>();
      const uniqueEvents = new Set<string>();
      
      let totalEarnedInPeriod = 0;
      
      for (const doc of txSnapshot.docs) {
        const tx = doc.data();
        
        // Only count earning transactions
        if (!isEarningTransaction(tx.type) && tx.direction !== 'IN') {
          continue;
        }
        
        const tokens = Math.abs(tx.tokens || tx.amountTokens || 0);
        totalEarnedInPeriod += tokens;
        
        // Track payers
        if (tx.meta?.counterpartyId) {
          uniquePayerIds.add(tx.meta.counterpartyId);
        }
        
        // Aggregate by feature
        const feature = tx.meta?.feature || mapTransactionToFeature(tx.type, tx.source);
        
        switch (feature) {
          case 'CHAT':
            byFeature.chatTokens += tokens;
            if (tx.relatedId) uniqueChats.add(tx.relatedId);
            break;
          case 'MEDIA':
            byFeature.mediaTokens += tokens;
            break;
          case 'CALL':
            byFeature.callTokens += tokens;
            if (tx.relatedId) uniqueCalls.add(tx.relatedId);
            break;
          case 'CALENDAR':
            byFeature.calendarTokens += tokens;
            if (tx.relatedId) uniqueBookings.add(tx.relatedId);
            break;
          case 'EVENT':
            byFeature.eventTokens += tokens;
            if (tx.relatedId) uniqueEvents.add(tx.relatedId);
            break;
          default:
            byFeature.otherTokens += tokens;
        }
      }
      
      counts.uniquePayers = uniquePayerIds.size;
      counts.paidChats = uniqueChats.size;
      counts.paidCalls = uniqueCalls.size;
      counts.calendarBookingsCompleted = uniqueBookings.size;
      counts.eventTicketsValidated = uniqueEvents.size;
      
      // Calculate withdrawable tokens
      const availableToWithdraw = await getWithdrawableTokens(userId);
      
      // Build response
      const overview: EarningsOverview = {
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        tokens: {
          totalEarned: wallet.lifetimeEarnedTokens || 0,
          totalWithdrawn: wallet.totalWithdrawnTokens || 0,
          currentBalance: wallet.balanceTokens || 0,
          availableToWithdraw,
        },
        fiat: {
          ratePerTokenPLN: CREATOR_ANALYTICS_CONSTANTS.TOKEN_TO_PLN_RATE,
          totalEarnedPLN: (wallet.lifetimeEarnedTokens || 0) * CREATOR_ANALYTICS_CONSTANTS.TOKEN_TO_PLN_RATE,
          currentBalancePLN: (wallet.balanceTokens || 0) * CREATOR_ANALYTICS_CONSTANTS.TOKEN_TO_PLN_RATE,
          availableToWithdrawPLN: availableToWithdraw * CREATOR_ANALYTICS_CONSTANTS.TOKEN_TO_PLN_RATE,
        },
        byFeature,
        counts,
      };
      
      return {
        success: true,
        data: overview,
      };
    } catch (error: any) {
      console.error('[creator_analytics_overview] Error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || 'Failed to fetch analytics overview',
      };
    }
  }
);

/**
 * Get empty overview (for users with no data)
 */
function getEmptyOverview(fromDate: Date, toDate: Date): EarningsOverview {
  return {
    period: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    tokens: {
      totalEarned: 0,
      totalWithdrawn: 0,
      currentBalance: 0,
      availableToWithdraw: 0,
    },
    fiat: {
      ratePerTokenPLN: CREATOR_ANALYTICS_CONSTANTS.TOKEN_TO_PLN_RATE,
      totalEarnedPLN: 0,
      currentBalancePLN: 0,
      availableToWithdrawPLN: 0,
    },
    byFeature: {
      chatTokens: 0,
      mediaTokens: 0,
      callTokens: 0,
      calendarTokens: 0,
      eventTokens: 0,
      otherTokens: 0,
    },
    counts: {
      paidChats: 0,
      paidCalls: 0,
      calendarBookingsCompleted: 0,
      eventTicketsValidated: 0,
      uniquePayers: 0,
    },
  };
}

// ============================================================================
// ANALYTICS ENDPOINT: TIME SERIES
// ============================================================================

/**
 * Get time series data (daily or weekly breakdown)
 */
export const creator_analytics_timeseries = onCall(
  { cors: true },
  async (request): Promise<GetTimeSeriesResponse> => {
    try {
      // Authentication
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      const userId = request.auth.uid;
      const params = request.data as GetTimeSeriesRequest;
      const granularity = params.granularity || 'day';
      
      // Parse date range
      const { fromDate, toDate } = parseDateRange(params.from, params.to);
      
      // Try to use pre-aggregated data first
      const usePreAggregated = granularity === 'day';
      
      if (usePreAggregated) {
        const aggregatedData = await getTimeSeriesFromAggregatedData(
          userId,
          fromDate,
          toDate
        );
        
        if (aggregatedData) {
          return {
            success: true,
            data: aggregatedData,
          };
        }
      }
      
      // Fallback to raw transaction data
      const timeSeriesData = await getTimeSeriesFromTransactions(
        userId,
        fromDate,
        toDate,
        granularity
      );
      
      return {
        success: true,
        data: timeSeriesData,
      };
    } catch (error: any) {
      console.error('[creator_analytics_timeseries] Error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || 'Failed to fetch time series data',
      };
    }
  }
);

/**
 * Get time series from pre-aggregated daily stats
 */
async function getTimeSeriesFromAggregatedData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<TimeSeriesData | null> {
  try {
    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);
    
    const statsSnapshot = await db
      .collection('creatorDailyStats')
      .where('userId', '==', userId)
      .where('date', '>=', fromDateStr)
      .where('date', '<=', toDateStr)
      .orderBy('date', 'asc')
      .get();
    
    if (statsSnapshot.empty) {
      return null;
    }
    
    const points: TimeSeriesPoint[] = statsSnapshot.docs.map(doc => {
      const stats = doc.data() as CreatorDailyStats;
      const date = new Date(stats.date + 'T00:00:00Z');
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      return {
        start: date.toISOString(),
        end: endDate.toISOString(),
        tokensEarned: stats.tokensEarnedTotal || 0,
        tokensEarnedChat: stats.tokensEarnedChat || 0,
        tokensEarnedCalendar: stats.tokensEarnedCalendar || 0,
        tokensEarnedEvents: stats.tokensEarnedEvents || 0,
        uniquePayers: stats.uniquePayers || 0,
      };
    });
    
    return {
      granularity: 'day',
      points,
    };
  } catch (error) {
    console.error('[getTimeSeriesFromAggregatedData] Error:', error);
    return null;
  }
}

/**
 * Get time series from raw transactions (fallback or for weekly)
 */
async function getTimeSeriesFromTransactions(
  userId: string,
  fromDate: Date,
  toDate: Date,
  granularity: TimeGranularity
): Promise<TimeSeriesData> {
  // Get all transactions in range
  const txSnapshot = await db
    .collection('walletTransactions')
    .where('userId', '==', userId)
    .where('createdAt', '>=', fromDate)
    .where('createdAt', '<=', toDate)
    .orderBy('createdAt', 'asc')
    .get();
  
  // Group by time buckets
  const buckets = new Map<string, {
    start: Date;
    end: Date;
    tokensEarned: number;
    tokensEarnedChat: number;
    tokensEarnedCalendar: number;
    tokensEarnedEvents: number;
    uniquePayers: Set<string>;
  }>();
  
  for (const doc of txSnapshot.docs) {
    const tx = doc.data();
    
    // Only count earning transactions
    if (!isEarningTransaction(tx.type) && tx.direction !== 'IN') {
      continue;
    }
    
    const txDate = tx.createdAt.toDate();
    const bucketKey = getBucketKey(txDate, granularity);
    
    if (!buckets.has(bucketKey)) {
      const { start, end } = getBucketDates(txDate, granularity);
      buckets.set(bucketKey, {
        start,
        end,
        tokensEarned: 0,
        tokensEarnedChat: 0,
        tokensEarnedCalendar: 0,
        tokensEarnedEvents: 0,
        uniquePayers: new Set(),
      });
    }
    
    const bucket = buckets.get(bucketKey)!;
    const tokens = Math.abs(tx.tokens || tx.amountTokens || 0);
    
    bucket.tokensEarned += tokens;
    
    // Track by feature
    const feature = tx.meta?.feature || mapTransactionToFeature(tx.type, tx.source);
    if (feature === 'CHAT') bucket.tokensEarnedChat += tokens;
    if (feature === 'CALENDAR') bucket.tokensEarnedCalendar += tokens;
    if (feature === 'EVENT') bucket.tokensEarnedEvents += tokens;
    
    // Track unique payers
    if (tx.meta?.counterpartyId) {
      bucket.uniquePayers.add(tx.meta.counterpartyId);
    }
  }
  
  // Convert to points
  const points: TimeSeriesPoint[] = Array.from(buckets.values())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(bucket => ({
      start: bucket.start.toISOString(),
      end: bucket.end.toISOString(),
      tokensEarned: bucket.tokensEarned,
      tokensEarnedChat: bucket.tokensEarnedChat,
      tokensEarnedCalendar: bucket.tokensEarnedCalendar,
      tokensEarnedEvents: bucket.tokensEarnedEvents,
      uniquePayers: bucket.uniquePayers.size,
    }));
  
  return {
    granularity,
    points,
  };
}

/**
 * Get bucket key for grouping
 */
function getBucketKey(date: Date, granularity: TimeGranularity): string {
  if (granularity === 'day') {
    return formatDate(date);
  } else {
    // Week: use start of week as key
    const weekStart = getStartOfWeek(date);
    return formatDate(weekStart);
  }
}

/**
 * Get bucket start/end dates
 */
function getBucketDates(date: Date, granularity: TimeGranularity): { start: Date; end: Date } {
  if (granularity === 'day') {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  } else {
    // Week
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
}

// ============================================================================
// ANALYTICS ENDPOINT: PAYERS
// ============================================================================

/**
 * Get payers analytics & retention data
 */
export const creator_analytics_payers = onCall(
  { cors: true },
  async (request): Promise<GetPayersAnalyticsResponse> => {
    try {
      // Authentication
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      const userId = request.auth.uid;
      const params = request.data as GetPayersAnalyticsRequest;
      
      // Parse date range
      const { fromDate, toDate } = parseDateRange(params.from, params.to);
      
      // Get transactions for period
      const txSnapshot = await db
        .collection('walletTransactions')
        .where('userId', '==', userId)
        .where('createdAt', '>=', fromDate)
        .where('createdAt', '<=', toDate)
        .orderBy('createdAt', 'desc')
        .get();
      
      // Aggregate payer data
      const payerMap = new Map<string, {
        tokensSpent: number;
        lastActivity: Date;
        firstSeenInPeriod: Date;
      }>();
      
      for (const doc of txSnapshot.docs) {
        const tx = doc.data();
        
        // Only count earning transactions (where someone paid us)
        if (!isEarningTransaction(tx.type) && tx.direction !== 'IN') {
          continue;
        }
        
        const payerId = tx.meta?.counterpartyId;
        if (!payerId) continue;
        
        const tokens = Math.abs(tx.tokens || tx.amountTokens || 0);
        const txDate = tx.createdAt.toDate();
        
        if (!payerMap.has(payerId)) {
          payerMap.set(payerId, {
            tokensSpent: 0,
            lastActivity: txDate,
            firstSeenInPeriod: txDate,
          });
        }
        
        const payer = payerMap.get(payerId)!;
        payer.tokensSpent += tokens;
        
        if (txDate > payer.lastActivity) {
          payer.lastActivity = txDate;
        }
        if (txDate < payer.firstSeenInPeriod) {
          payer.firstSeenInPeriod = txDate;
        }
      }
      
      // Determine new vs returning payers
      let newPayers = 0;
      let returningPayers = 0;
      
      for (const [payerId, data] of Array.from(payerMap.entries())) {
        // Check if payer had transactions before this period
        const priorTxSnapshot = await db
          .collection('walletTransactions')
          .where('userId', '==', userId)
          .where('meta.counterpartyId', '==', payerId)
          .where('createdAt', '<', fromDate)
          .limit(1)
          .get();
        
        if (priorTxSnapshot.empty) {
          newPayers++;
        } else {
          returningPayers++;
        }
      }
      
      // Get top payers
      const topPayersArray = Array.from(payerMap.entries())
        .sort((a, b) => b[1].tokensSpent - a[1].tokensSpent)
        .slice(0, CREATOR_ANALYTICS_CONSTANTS.TOP_PAYERS_LIMIT);
      
      const topPayers: TopPayer[] = topPayersArray.map(([payerId, data]) => ({
        payerId,
        tokensSpent: data.tokensSpent,
        lastActivity: data.lastActivity.toISOString(),
      }));
      
      const payersData: PayersData = {
        uniquePayers: payerMap.size,
        newPayers,
        returningPayers,
        topPayers,
      };
      
      return {
        success: true,
        data: payersData,
      };
    } catch (error: any) {
      console.error('[creator_analytics_payers] Error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || 'Failed to fetch payers analytics',
      };
    }
  }
);