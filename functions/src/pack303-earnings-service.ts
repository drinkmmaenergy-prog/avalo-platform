/**
 * PACK 303 — Creator Earnings Service
 * 
 * Core service for earnings dashboard and statement generation
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { db, generateId, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CreatorEarningsMonthly,
  EarningsSummary,
  EarningsBreakdown,
  EarningsTimelinePoint,
  MonthlyStatement,
  MonthlyStatementTransaction,
  EarningsSourceBreakdown,
  GetEarningsDashboardRequest,
  GetEarningsDashboardResponse,
  GetMonthlyStatementRequest,
  GetMonthlyStatementResponse,
  StatementAuditLog,
  generateMonthlyDocId,
  getCurrentMonthKey,
  getMonthDateRange,
  TOKEN_PAYOUT_RATE_PLN,
} from './types/pack303-creator-earnings.types';
import { aggregateUserMonthlyEarnings } from './pack303-aggregation';

// ============================================================================
// DASHBOARD DATA
// ============================================================================

/**
 * Get earnings dashboard data for a user
 */
export async function getEarningsDashboard(
  request: GetEarningsDashboardRequest
): Promise<GetEarningsDashboardResponse> {
  try {
    const { userId, year, month } = request;
    
    // Default to current month if not specified
    const current = getCurrentMonthKey();
    const targetYear = year || current.year;
    const targetMonth = month || current.month;
    
    // Get or create monthly earnings document
    const docId = generateMonthlyDocId(userId, targetYear, targetMonth);
    let earningsDoc = await db.collection('creatorEarningsMonthly').doc(docId).get();
    
    // If doesn't exist, trigger aggregation
    if (!earningsDoc.exists) {
      await aggregateUserMonthlyEarnings(userId, targetYear, targetMonth);
      earningsDoc = await db.collection('creatorEarningsMonthly').doc(docId).get();
    }
    
    const earnings = earningsDoc.data() as CreatorEarningsMonthly;
    
    // Get wallet balance for available payout
    const walletDoc = await db.collection('wallets').doc(userId).get();
    const wallet = walletDoc.data();
    const availableForPayout = wallet?.tokensBalance || 0;
    
    // Calculate lifetime payouts
    const payoutsQuery = await db.collection('withdrawalRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'PAID')
      .get();
    
    let totalPayoutsLifetime = 0;
    for (const doc of payoutsQuery.docs) {
      const payout = doc.data();
      totalPayoutsLifetime += payout.payoutAmount || 0;
    }
    
    // Build summary
    const summary: EarningsSummary = {
      currentMonthTokens: earnings?.tokensCreatorShare || 0,
      availableForPayout,
      totalPayoutsLifetime,
      currency: earnings?.payoutCurrency || 'PLN',
    };
    
    // Build breakdown by source
    const breakdown: EarningsBreakdown = {
      year: targetYear,
      month: targetMonth,
      bySource: [
        {
          source: 'CHAT',
          tokensEarned: earnings?.tokensEarnedChat || 0,
          tokensRefunded: earnings?.tokensRefundedChat || 0,
          tokensCreatorShare: Math.floor((earnings?.tokensEarnedChat || 0) * 0.65),
        },
        {
          source: 'CALLS',
          tokensEarned: earnings?.tokensEarnedCalls || 0,
          tokensRefunded: 0,
          tokensCreatorShare: Math.floor((earnings?.tokensEarnedCalls || 0) * 0.80),
        },
        {
          source: 'CALENDAR',
          tokensEarned: earnings?.tokensEarnedCalendar || 0,
          tokensRefunded: earnings?.tokensRefundedCalendar || 0,
          tokensCreatorShare: Math.floor((earnings?.tokensEarnedCalendar || 0) * 0.80),
        },
        {
          source: 'EVENTS',
          tokensEarned: earnings?.tokensEarnedEvents || 0,
          tokensRefunded: earnings?.tokensRefundedEvents || 0,
          tokensCreatorShare: Math.floor((earnings?.tokensEarnedEvents || 0) * 0.80),
        },
        {
          source: 'OTHER',
          tokensEarned: earnings?.tokensEarnedOther || 0,
          tokensRefunded: 0,
          tokensCreatorShare: Math.floor((earnings?.tokensEarnedOther || 0) * 0.65),
        },
      ],
      totalNetTokens: earnings?.tokensNetEarned || 0,
      totalCreatorShare: earnings?.tokensCreatorShare || 0,
    };
    
    // Build timeline for the month (daily breakdown)
    const timeline = await buildMonthlyTimeline(userId, targetYear, targetMonth);
    
    return {
      success: true,
      summary,
      breakdown,
      timeline,
    };
  } catch (error: any) {
    console.error('Error getting earnings dashboard:', error);
    return {
      success: false,
      error: error.message || 'Failed to get earnings dashboard',
    };
  }
}

/**
 * Build daily timeline for a month
 */
async function buildMonthlyTimeline(
  userId: string,
  year: number,
  month: number
): Promise<EarningsTimelinePoint[]> {
  try {
    const { start, end } = getMonthDateRange(year, month);
    
    // Query transactions for this month
    const transactionsQuery = await db.collection('walletTransactions')
      .where('userId', '==', userId)
      .where('direction', '==', 'IN')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .orderBy('createdAt', 'asc')
      .get();
    
    // Group by date
    const dailyMap = new Map<string, number>();
    
    for (const doc of transactionsQuery.docs) {
      const tx = doc.data();
      const txDate = tx.createdAt?.toDate();
      if (!txDate) continue;
      
      const dateKey = txDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentTotal = dailyMap.get(dateKey) || 0;
      dailyMap.set(dateKey, currentTotal + Math.abs(tx.amountTokens || 0));
    }
    
    // Convert to array
    const timeline: EarningsTimelinePoint[] = [];
    const entries = Array.from(dailyMap.entries());
    for (const [date, tokens] of entries) {
      timeline.push({ date, tokensNetEarned: tokens });
    }
    
    // Sort by date
    timeline.sort((a, b) => a.date.localeCompare(b.date));
    
    return timeline;
  } catch (error) {
    console.error('Error building monthly timeline:', error);
    return [];
  }
}

// ============================================================================
// MONTHLY STATEMENTS
// ============================================================================

/**
 * Get monthly statement for a user
 */
export async function getMonthlyStatement(
  request: GetMonthlyStatementRequest
): Promise<GetMonthlyStatementResponse> {
  try {
    const { userId, year, month } = request;
    
    // Get monthly earnings document
    const docId = generateMonthlyDocId(userId, year, month);
    let earningsDoc = await db.collection('creatorEarningsMonthly').doc(docId).get();
    
    // If doesn't exist, trigger aggregation
    if (!earningsDoc.exists) {
      await aggregateUserMonthlyEarnings(userId, year, month);
      earningsDoc = await db.collection('creatorEarningsMonthly').doc(docId).get();
    }
    
    if (!earningsDoc.exists) {
      return {
        success: false,
        error: 'No earnings data found for this period',
      };
    }
    
    const earnings = earningsDoc.data() as CreatorEarningsMonthly;
    
    // Build statement
    const statement: MonthlyStatement = {
      userId,
      period: { year, month },
      baseCurrency: earnings.payoutCurrency || 'PLN',
      tokenPayoutRate: TOKEN_PAYOUT_RATE_PLN,
      
      summary: {
        tokensNetEarned: earnings.tokensNetEarned,
        tokensCreatorShare: earnings.tokensCreatorShare,
        tokensAvaloShare: earnings.tokensAvaloShare,
        payoutTokensPaid: earnings.payoutTokensPaid,
        payoutFiatPaid: earnings.payoutFiatPaid,
      },
      
      bySource: [
        {
          source: 'CHAT',
          tokensEarned: earnings.tokensEarnedChat,
          tokensRefunded: earnings.tokensRefundedChat,
          tokensCreatorShare: Math.floor(earnings.tokensEarnedChat * 0.65),
        },
        {
          source: 'CALLS',
          tokensEarned: earnings.tokensEarnedCalls,
          tokensRefunded: 0,
          tokensCreatorShare: Math.floor(earnings.tokensEarnedCalls * 0.80),
        },
        {
          source: 'CALENDAR',
          tokensEarned: earnings.tokensEarnedCalendar,
          tokensRefunded: earnings.tokensRefundedCalendar,
          tokensCreatorShare: Math.floor(earnings.tokensEarnedCalendar * 0.80),
        },
        {
          source: 'EVENTS',
          tokensEarned: earnings.tokensEarnedEvents,
          tokensRefunded: earnings.tokensRefundedEvents,
          tokensCreatorShare: Math.floor(earnings.tokensEarnedEvents * 0.80),
        },
        {
          source: 'OTHER',
          tokensEarned: earnings.tokensEarnedOther,
          tokensRefunded: 0,
          tokensCreatorShare: Math.floor(earnings.tokensEarnedOther * 0.65),
        },
      ],
      
      transactions: await getStatementTransactions(userId, year, month),
    };
    
    return {
      success: true,
      statement,
    };
  } catch (error: any) {
    console.error('Error getting monthly statement:', error);
    return {
      success: false,
      error: error.message || 'Failed to get monthly statement',
    };
  }
}

/**
 * Get transaction list for statement
 */
async function getStatementTransactions(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyStatementTransaction[]> {
  try {
    const { start, end } = getMonthDateRange(year, month);
    
    const transactionsQuery = await db.collection('walletTransactions')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .orderBy('createdAt', 'desc')
      .limit(500) // Reasonable limit for display
      .get();
    
    const transactions: MonthlyStatementTransaction[] = [];
    
    for (const doc of transactionsQuery.docs) {
      const tx = doc.data();
      
      transactions.push({
        date: tx.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        type: tx.type || 'UNKNOWN',
        direction: tx.direction || 'IN',
        amountTokens: Math.abs(tx.amountTokens || 0),
        relatedId: tx.meta?.chatId || tx.meta?.bookingId || tx.meta?.eventId || undefined,
        note: tx.meta?.reason || undefined,
      });
    }
    
    return transactions;
  } catch (error) {
    console.error('Error getting statement transactions:', error);
    return [];
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log statement access/export for audit trail
 */
export async function logStatementAudit(
  actorType: 'USER' | 'ADMIN' | 'SYSTEM',
  actorId: string,
  action: 'STATEMENT_VIEWED' | 'STATEMENT_EXPORTED_PDF' | 'STATEMENT_EXPORTED_CSV' | 'AGGREGATION_RUN',
  userId: string,
  year: number,
  month: number,
  format?: 'pdf' | 'csv',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const logId = generateId();
    
    const auditLog: StatementAuditLog = {
      logId,
      actorType,
      actorId,
      action,
      userId,
      year,
      month,
      format,
      timestamp: serverTimestamp() as Timestamp,
      metadata,
    };
    
    await db.collection('statementAuditLogs').doc(logId).set(auditLog);
  } catch (error) {
    console.error('Error logging statement audit:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 50
): Promise<StatementAuditLog[]> {
  try {
    const logsQuery = await db.collection('statementAuditLogs')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    return logsQuery.docs.map(doc => doc.data() as StatementAuditLog);
  } catch (error) {
    console.error('Error getting user audit logs:', error);
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has any earnings capability
 */
export async function hasEarningsCapability(userId: string): Promise<boolean> {
  try {
    // Check if user has any lifetime earned tokens
    const walletDoc = await db.collection('wallets').doc(userId).get();
    const wallet = walletDoc.data();
    
    if (!wallet) return false;
    
    const lifetimeEarned = wallet.lifetimeEarnedTokens || 0;
    return lifetimeEarned > 0;
  } catch (error) {
    console.error('Error checking earnings capability:', error);
    return false;
  }
}

/**
 * Get available months with earnings data
 */
export async function getAvailableEarningsMonths(
  userId: string
): Promise<Array<{ year: number; month: number }>> {
  try {
    const earningsQuery = await db.collection('creatorEarningsMonthly')
      .where('userId', '==', userId)
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .limit(24) // Last 2 years
      .get();
    
    return earningsQuery.docs.map(doc => {
      const data = doc.data();
      return {
        year: data.year,
        month: data.month,
      };
    });
  } catch (error) {
    console.error('Error getting available earnings months:', error);
    return [];
  }
}