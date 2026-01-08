/**
 * PACK 303 — Creator Earnings Aggregation Service
 * 
 * Aggregates earnings data from wallet transactions into monthly summaries
 * Runs as scheduled cron job (daily or hourly)
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CreatorEarningsMonthly,
  generateMonthlyDocId,
  getMonthDateRange,
  getCurrentMonthKey,
  REVENUE_SPLITS,
  TOKEN_PAYOUT_RATE_PLN,
  AggregationResult,
} from './types/pack303-creator-earnings.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get revenue split for a transaction source
 */
function getRevenueSplit(source: string): { creator: number; avalo: number } {
  const upperSource = source.toUpperCase();
  
  if (upperSource.includes('CHAT')) {
    return REVENUE_SPLITS.CHAT;
  } else if (upperSource.includes('CALL')) {
    return REVENUE_SPLITS.CALLS;
  } else if (upperSource.includes('CALENDAR')) {
    return REVENUE_SPLITS.CALENDAR;
  } else if (upperSource.includes('EVENT')) {
    return REVENUE_SPLITS.EVENTS;
  }
  
  return REVENUE_SPLITS.OTHER;
}

/**
 * Initialize empty monthly earnings document
 */
function initializeMonthlyEarnings(
  userId: string,
  year: number,
  month: number
): CreatorEarningsMonthly {
  return {
    userId,
    year,
    month,
    
    tokensEarnedChat: 0,
    tokensEarnedCalls: 0,
    tokensEarnedCalendar: 0,
    tokensEarnedEvents: 0,
    tokensEarnedOther: 0,
    
    tokensRefundedChat: 0,
    tokensRefundedCalendar: 0,
    tokensRefundedEvents: 0,
    
    tokensNetEarned: 0,
    tokensAvaloShare: 0,
    tokensCreatorShare: 0,
    
    payoutTokensRequested: 0,
    payoutTokensPaid: 0,
    
    payoutFiatPaid: 0,
    payoutCurrency: 'PLN',
    
    currencyFxRate: 1.0,
    
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Categorize transaction into earnings source
 */
function categorizeTransactionSource(type: string, source?: string): keyof Pick<
  CreatorEarningsMonthly,
  'tokensEarnedChat' | 'tokensEarnedCalls' | 'tokensEarnedCalendar' | 'tokensEarnedEvents' | 'tokensEarnedOther'
> {
  const typeUpper = type.toUpperCase();
  const sourceUpper = source?.toUpperCase() || '';
  
  if (typeUpper.includes('CHAT') || sourceUpper.includes('CHAT')) {
    return 'tokensEarnedChat';
  } else if (typeUpper.includes('CALL') || sourceUpper.includes('CALL')) {
    return 'tokensEarnedCalls';
  } else if (typeUpper.includes('CALENDAR') || sourceUpper.includes('CALENDAR')) {
    return 'tokensEarnedCalendar';
  } else if (typeUpper.includes('EVENT') || sourceUpper.includes('EVENT')) {
    return 'tokensEarnedEvents';
  }
  
  return 'tokensEarnedOther';
}

/**
 * Categorize refund transaction
 */
function categorizeRefundSource(type: string, source?: string): keyof Pick<
  CreatorEarningsMonthly,
  'tokensRefundedChat' | 'tokensRefundedCalendar' | 'tokensRefundedEvents'
> | null {
  const typeUpper = type.toUpperCase();
  const sourceUpper = source?.toUpperCase() || '';
  
  if (typeUpper.includes('CHAT') || sourceUpper.includes('CHAT')) {
    return 'tokensRefundedChat';
  } else if (typeUpper.includes('CALENDAR') || sourceUpper.includes('CALENDAR')) {
    return 'tokensRefundedCalendar';
  } else if (typeUpper.includes('EVENT') || sourceUpper.includes('EVENT')) {
    return 'tokensRefundedEvents';
  }
  
  return null;
}

// ============================================================================
// AGGREGATION LOGIC
// ============================================================================

/**
 * Aggregate earnings for a specific user and month
 */
export async function aggregateUserMonthlyEarnings(
  userId: string,
  year: number,
  month: number
): Promise<AggregationResult> {
  try {
    const docId = generateMonthlyDocId(userId, year, month);
    const { start, end } = getMonthDateRange(year, month);
    
    // Initialize earnings document
    const earnings = initializeMonthlyEarnings(userId, year, month);
    
    // Query wallet transactions for this user in this month
    const transactionsQuery = db.collection('walletTransactions')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .orderBy('createdAt', 'asc');
    
    const transactionsSnap = await transactionsQuery.get();
    let transactionsProcessed = 0;
    let tokensProcessed = 0;
    
    // Process each transaction
    for (const doc of transactionsSnap.docs) {
      const tx = doc.data();
      const type = tx.type || '';
      const source = tx.source || '';
      const direction = tx.direction || '';
      const amountTokens = Math.abs(tx.amountTokens || 0);
      
      // Handle earning transactions (IN direction)
      if (direction === 'IN' && (type === 'EARN' || type.includes('EARN'))) {
        const earnField = categorizeTransactionSource(type, source);
        earnings[earnField] += amountTokens;
        tokensProcessed += amountTokens;
      }
      
      // Handle refund transactions
      if (type.includes('REFUND')) {
        const refundField = categorizeRefundSource(type, source);
        if (refundField) {
          earnings[refundField] += amountTokens;
          tokensProcessed += amountTokens;
        }
      }
      
      transactionsProcessed++;
    }
    
    // Calculate net earnings (total earned - refunds)
    const totalEarned = 
      earnings.tokensEarnedChat +
      earnings.tokensEarnedCalls +
      earnings.tokensEarnedCalendar +
      earnings.tokensEarnedEvents +
      earnings.tokensEarnedOther;
    
    const totalRefunded =
      earnings.tokensRefundedChat +
      earnings.tokensRefundedCalendar +
      earnings.tokensRefundedEvents;
    
    earnings.tokensNetEarned = totalEarned - totalRefunded;
    
    // Calculate creator vs Avalo shares
    // Note: This is an approximation since we don't track exact split per transaction
    // We use weighted average based on revenue splits
    const chatWeight = earnings.tokensEarnedChat * REVENUE_SPLITS.CHAT.creator;
    const callsWeight = earnings.tokensEarnedCalls * REVENUE_SPLITS.CALLS.creator;
    const calendarWeight = earnings.tokensEarnedCalendar * REVENUE_SPLITS.CALENDAR.creator;
    const eventsWeight = earnings.tokensEarnedEvents * REVENUE_SPLITS.EVENTS.creator;
    const otherWeight = earnings.tokensEarnedOther * REVENUE_SPLITS.OTHER.creator;
    
    earnings.tokensCreatorShare = Math.floor(
      chatWeight + callsWeight + calendarWeight + eventsWeight + otherWeight
    );
    earnings.tokensAvaloShare = earnings.tokensNetEarned - earnings.tokensCreatorShare;
    
    // Query payout data for this month
    const payoutsQuery = db.collection('withdrawalRequests')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end));
    
    const payoutsSnap = await payoutsQuery.get();
    
    for (const doc of payoutsSnap.docs) {
      const payout = doc.data();
      
      if (payout.status === 'PENDING_REVIEW' || payout.status === 'APPROVED' || payout.status === 'PROCESSING') {
        earnings.payoutTokensRequested += payout.requestedTokens || 0;
      }
      
      if (payout.status === 'PAID') {
        earnings.payoutTokensPaid += payout.approvedTokens || 0;
        earnings.payoutFiatPaid += payout.payoutAmount || 0;
        earnings.payoutCurrency = payout.payoutCurrency || 'PLN';
        earnings.currencyFxRate = payout.fxRateToPayoutCurrency || 1.0;
      }
    }
    
    // Save aggregated earnings
    earnings.updatedAt = new Date().toISOString();
    
    await db.collection('creatorEarningsMonthly').doc(docId).set(earnings, { merge: true });
    
    return {
      userId,
      year,
      month,
      success: true,
      tokensProcessed,
      transactionsProcessed,
    };
  } catch (error: any) {
    console.error('Error aggregating user monthly earnings:', error);
    return {
      userId,
      year,
      month,
      success: false,
      tokensProcessed: 0,
      transactionsProcessed: 0,
      error: error.message,
    };
  }
}

/**
 * Get list of active creators (users who have earned tokens)
 */
async function getActiveCreators(
  startDate: Date,
  endDate: Date,
  limit: number = 100
): Promise<string[]> {
  try {
    // Query transactions where users earned tokens
    const transactionsQuery = db.collection('walletTransactions')
      .where('direction', '==', 'IN')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .limit(limit * 10); // Get more since we'll deduplicate
    
    const transactionsSnap = await transactionsQuery.get();
    const creatorIds = new Set<string>();
    
    for (const doc of transactionsSnap.docs) {
      const tx = doc.data();
      if (tx.userId && tx.type && (tx.type === 'EARN' || tx.type.includes('EARN'))) {
        creatorIds.add(tx.userId);
      }
    }
    
    return Array.from(creatorIds).slice(0, limit);
  } catch (error) {
    console.error('Error getting active creators:', error);
    return [];
  }
}

/**
 * Run monthly aggregation for active creators
 */
export async function runMonthlyAggregation(
  year?: number,
  month?: number,
  batchSize: number = 50
): Promise<{ success: boolean; results: AggregationResult[]; errors: number }> {
  try {
    // Default to current month if not specified
    const current = getCurrentMonthKey();
    const targetYear = year || current.year;
    const targetMonth = month || current.month;
    
    const { start, end } = getMonthDateRange(targetYear, targetMonth);
    
    console.log(`Running aggregation for ${targetYear}-${String(targetMonth).padStart(2, '0')}`);
    
    // Get active creators for this period
    const creatorIds = await getActiveCreators(start, end, batchSize);
    
    console.log(`Found ${creatorIds.length} active creators`);
    
    const results: AggregationResult[] = [];
    let errors = 0;
    
    // Process in batches
    for (const userId of creatorIds) {
      const result = await aggregateUserMonthlyEarnings(userId, targetYear, targetMonth);
      results.push(result);
      
      if (!result.success) {
        errors++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Log aggregation status
    const statusId = generateId();
    await db.collection('earningsAggregationStatus').doc(statusId).set({
      statusId,
      year: targetYear,
      month: targetMonth,
      creatorsProcessed: creatorIds.length,
      successCount: results.filter(r => r.success).length,
      errorCount: errors,
      lastRunAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
    
    console.log(`Aggregation complete: ${results.length} creators, ${errors} errors`);
    
    return {
      success: errors === 0,
      results,
      errors,
    };
  } catch (error: any) {
    console.error('Error running monthly aggregation:', error);
    return {
      success: false,
      results: [],
      errors: 1,
    };
  }
}

/**
 * Backfill aggregation for multiple months
 */
export async function backfillAggregation(
  userId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<AggregationResult[]> {
  const results: AggregationResult[] = [];
  
  let currentYear = startYear;
  let currentMonth = startMonth;
  
  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const result = await aggregateUserMonthlyEarnings(userId, currentYear, currentMonth);
    results.push(result);
    
    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}