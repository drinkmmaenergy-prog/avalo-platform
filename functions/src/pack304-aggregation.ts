/**
 * PACK 304 — Admin Financial Console & Reconciliation
 * Monthly Finance Aggregation
 * 
 * Aggregates platform financial data from:
 * - walletTransactions (PACK 277)
 * - withdrawalRequests (PACK 289)
 * - creatorEarningsMonthly (PACK 303)
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  PlatformFinanceMonthly,
  MonthlyAggregationInput,
  MonthlyAggregationResult,
  FINANCE_CONSTANTS,
} from './types/pack304-admin-finance.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get start and end dates for a given month
 */
function getMonthBounds(year: number, month: number): { startDate: Date; endDate: Date } {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { startDate, endDate };
}

/**
 * Get document ID for a given month
 */
function getMonthDocId(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0');
  return `${year}_${monthStr}`;
}

/**
 * Determine revenue split based on transaction type
 */
function getRevenueSplit(txType: string): { creatorShare: number; avaloShare: number } {
  switch (txType) {
    case 'CHAT_SPEND':
      return {
        creatorShare: FINANCE_CONSTANTS.SPLIT_CHAT_CREATOR,
        avaloShare: FINANCE_CONSTANTS.SPLIT_CHAT_AVALO,
      };
    case 'CALL_SPEND':
      return {
        creatorShare: FINANCE_CONSTANTS.SPLIT_CALLS_CREATOR,
        avaloShare: FINANCE_CONSTANTS.SPLIT_CALLS_AVALO,
      };
    case 'CALENDAR_BOOKING':
      return {
        creatorShare: FINANCE_CONSTANTS.SPLIT_CALENDAR_CREATOR,
        avaloShare: FINANCE_CONSTANTS.SPLIT_CALENDAR_AVALO,
      };
    case 'EVENT_TICKET':
      return {
        creatorShare: FINANCE_CONSTANTS.SPLIT_EVENTS_CREATOR,
        avaloShare: FINANCE_CONSTANTS.SPLIT_EVENTS_AVALO,
      };
    default:
      return {
        creatorShare: FINANCE_CONSTANTS.SPLIT_OTHER_CREATOR,
        avaloShare: FINANCE_CONSTANTS.SPLIT_OTHER_AVALO,
      };
  }
}

// ============================================================================
// AGGREGATION LOGIC
// ============================================================================

/**
 * Aggregate monthly platform financials
 * This is the main aggregation function called by cron or manually
 */
export async function aggregateMonthlyFinance(
  input: MonthlyAggregationInput
): Promise<MonthlyAggregationResult> {
  const startTime = Date.now();
  const { year, month, forceRecalculation = false } = input;

  try {
    logger.info(`Starting financial aggregation for ${year}-${String(month).padStart(2, '0')}`);

    // Validate input
    if (month < 1 || month > 12) {
      throw new Error('Invalid month (must be 1-12)');
    }

    const docId = getMonthDocId(year, month);
    const docRef = db.collection('platformFinanceMonthly').doc(docId);

    // Check if already aggregated (unless forced)
    if (!forceRecalculation) {
      const existing = await docRef.get();
      if (existing.exists) {
        logger.info(`Aggregation already exists for ${docId}, skipping`);
        return {
          success: true,
          data: existing.data() as PlatformFinanceMonthly,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    const { startDate, endDate } = getMonthBounds(year, month);

    // Initialize aggregation data
    const aggregation: PlatformFinanceMonthly = {
      year,
      month,
      gmvTokens: 0,
      gmvFiatPLN: 0,
      totalCreatorShareTokens: 0,
      totalAvaloShareTokens: 0,
      totalTokenPurchasesTokens: 0,
      totalTokenPurchasesFiatPLN: 0,
      totalPayoutTokens: 0,
      totalPayoutFiatPLN: 0,
      totalPayoutTransactions: 0,
      outstandingCreatorLiabilityTokens: 0,
      outstandingCreatorLiabilityFiatPLN: 0,
      feesFromChatTokens: 0,
      feesFromCallsTokens: 0,
      feesFromCalendarTokens: 0,
      feesFromEventsTokens: 0,
      feesFromOtherTokens: 0,
      refundsTokens: 0,
      netRevenueTokens: 0,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // ========================================================================
    // STEP 1: Process Wallet Transactions
    // ========================================================================

    logger.info('Processing wallet transactions...');

    const txQuery = db
      .collection('walletTransactions')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<', Timestamp.fromDate(endDate));

    const txSnapshot = await txQuery.get();
    logger.info(`Found ${txSnapshot.size} transactions`);

    for (const txDoc of txSnapshot.docs) {
      const tx = txDoc.data();
      const txType = tx.type as string;
      const amountTokens = tx.amountTokens || 0;

      switch (txType) {
        case 'TOKEN_PURCHASE': {
          // Revenue from token sales
          aggregation.totalTokenPurchasesTokens += amountTokens;
          
          // Try to get fiat amount from metadata
          const fiatAmount = tx.meta?.fiatAmount || (amountTokens * FINANCE_CONSTANTS.PAYOUT_RATE_PLN_PER_TOKEN);
          aggregation.totalTokenPurchasesFiatPLN += fiatAmount;
          break;
        }

        case 'CHAT_SPEND': {
          // GMV from chats
          aggregation.gmvTokens += amountTokens;
          
          const split = getRevenueSplit(txType);
          const creatorTokens = Math.floor(amountTokens * split.creatorShare);
          const avaloTokens = amountTokens - creatorTokens;
          
          aggregation.totalCreatorShareTokens += creatorTokens;
          aggregation.totalAvaloShareTokens += avaloTokens;
          aggregation.feesFromChatTokens += avaloTokens;
          break;
        }

        case 'CALL_SPEND': {
          // GMV from calls
          aggregation.gmvTokens += amountTokens;
          
          const split = getRevenueSplit(txType);
          const creatorTokens = Math.floor(amountTokens * split.creatorShare);
          const avaloTokens = amountTokens - creatorTokens;
          
          aggregation.totalCreatorShareTokens += creatorTokens;
          aggregation.totalAvaloShareTokens += avaloTokens;
          aggregation.feesFromCallsTokens += avaloTokens;
          break;
        }

        case 'CALENDAR_BOOKING': {
          // GMV from calendar bookings
          aggregation.gmvTokens += amountTokens;
          
          const split = getRevenueSplit(txType);
          const creatorTokens = Math.floor(amountTokens * split.creatorShare);
          const avaloTokens = amountTokens - creatorTokens;
          
          aggregation.totalCreatorShareTokens += creatorTokens;
          aggregation.totalAvaloShareTokens += avaloTokens;
          aggregation.feesFromCalendarTokens += avaloTokens;
          break;
        }

        case 'EVENT_TICKET': {
          // GMV from event tickets
          aggregation.gmvTokens += amountTokens;
          
          const split = getRevenueSplit(txType);
          const creatorTokens = Math.floor(amountTokens * split.creatorShare);
          const avaloTokens = amountTokens - creatorTokens;
          
          aggregation.totalCreatorShareTokens += creatorTokens;
          aggregation.totalAvaloShareTokens += avaloTokens;
          aggregation.feesFromEventsTokens += avaloTokens;
          break;
        }

        case 'CALENDAR_REFUND':
        case 'EVENT_REFUND': {
          // Track refunds
          aggregation.refundsTokens += amountTokens;
          break;
        }

        default: {
          // Other monetized features
          if (tx.direction === 'OUT' && amountTokens > 0) {
            aggregation.gmvTokens += amountTokens;
            
            const split = getRevenueSplit(txType);
            const creatorTokens = Math.floor(amountTokens * split.creatorShare);
            const avaloTokens = amountTokens - creatorTokens;
            
            aggregation.totalCreatorShareTokens += creatorTokens;
            aggregation.totalAvaloShareTokens += avaloTokens;
            aggregation.feesFromOtherTokens += avaloTokens;
          }
          break;
        }
      }
    }

    // Calculate GMV in fiat
    aggregation.gmvFiatPLN = aggregation.gmvTokens * FINANCE_CONSTANTS.PAYOUT_RATE_PLN_PER_TOKEN;

    // ========================================================================
    // STEP 2: Process Payouts
    // ========================================================================

    logger.info('Processing payouts...');

    const payoutQuery = db
      .collection('withdrawalRequests')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<', Timestamp.fromDate(endDate))
      .where('status', 'in', ['APPROVED', 'COMPLETED', 'PAID']);

    const payoutSnapshot = await payoutQuery.get();
    logger.info(`Found ${payoutSnapshot.size} payouts`);

    for (const payoutDoc of payoutSnapshot.docs) {
      const payout = payoutDoc.data();
      
      const tokensApproved = payout.approvedTokens || 0;
      const payoutAmountPLN = tokensApproved * FINANCE_CONSTANTS.PAYOUT_RATE_PLN_PER_TOKEN;
      
      aggregation.totalPayoutTokens += tokensApproved;
      aggregation.totalPayoutFiatPLN += payoutAmountPLN;
      aggregation.totalPayoutTransactions++;
    }

    // ========================================================================
    // STEP 3: Calculate Outstanding Liability
    // ========================================================================

    logger.info('Calculating outstanding liability...');

    // Get all creator earnings up to this month (cumulative)
    const creatorEarningsQuery = db
      .collection('creatorEarningsMonthly')
      .where('year', '<=', year);

    const creatorEarningsSnapshot = await creatorEarningsQuery.get();
    
    let lifetimeCreatorTokens = 0;
    let lifetimePayoutTokens = 0;

    for (const earningDoc of creatorEarningsSnapshot.docs) {
      const earning = earningDoc.data();
      
      // Only include earnings up to and including this month
      if (earning.year < year || (earning.year === year && earning.month <= month)) {
        lifetimeCreatorTokens += earning.tokensCreatorShare || 0;
        lifetimePayoutTokens += earning.payoutTokensPaid || 0;
      }
    }

    // Also include payouts from withdrawalRequests that might not be in monthly earnings yet
    const allPayoutsQuery = db
      .collection('withdrawalRequests')
      .where('status', 'in', ['APPROVED', 'COMPLETED', 'PAID']);

    const allPayoutsSnapshot = await allPayoutsQuery.get();
    let totalHistoricalPayouts = 0;

    for (const payoutDoc of allPayoutsSnapshot.docs) {
      const payout = payoutDoc.data();
      const createdAt = payout.createdAt?.toDate();
      
      if (createdAt && createdAt <= endDate) {
        totalHistoricalPayouts += payout.approvedTokens || 0;
      }
    }

    // Outstanding liability = lifetime earnings - lifetime payouts
    aggregation.outstandingCreatorLiabilityTokens = Math.max(
      0,
      lifetimeCreatorTokens - totalHistoricalPayouts
    );
    aggregation.outstandingCreatorLiabilityFiatPLN =
      aggregation.outstandingCreatorLiabilityTokens * FINANCE_CONSTANTS.PAYOUT_RATE_PLN_PER_TOKEN;

    // ========================================================================
    // STEP 4: Calculate Net Revenue
    // ========================================================================

    // Net revenue = Avalo's share minus any refund-related adjustments
    aggregation.netRevenueTokens = aggregation.totalAvaloShareTokens - aggregation.refundsTokens;

    // ========================================================================
    // STEP 5: Save Aggregation
    // ========================================================================

    logger.info('Saving aggregation...');

    await docRef.set(aggregation);

    const processingTimeMs = Date.now() - startTime;
    logger.info(`Aggregation completed in ${processingTimeMs}ms`);

    return {
      success: true,
      data: aggregation,
      processingTimeMs,
    };
  } catch (error: any) {
    logger.error('Error aggregating monthly finance:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Get or generate monthly aggregation
 */
export async function getMonthlyAggregation(
  year: number,
  month: number
): Promise<PlatformFinanceMonthly | null> {
  try {
    const docId = getMonthDocId(year, month);
    const docRef = db.collection('platformFinanceMonthly').doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      return doc.data() as PlatformFinanceMonthly;
    }

    // If doesn't exist, generate it
    const result = await aggregateMonthlyFinance({ year, month, forceRecalculation: false });
    return result.data || null;
  } catch (error) {
    logger.error('Error getting monthly aggregation:', error);
    return null;
  }
}

/**
 * Get multiple months of aggregations (for trend view)
 */
export async function getMonthlyAggregationRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<PlatformFinanceMonthly[]> {
  try {
    const results: PlatformFinanceMonthly[] = [];
    
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMonth)
    ) {
      const data = await getMonthlyAggregation(currentYear, currentMonth);
      if (data) {
        results.push(data);
      }

      // Move to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return results;
  } catch (error) {
    logger.error('Error getting aggregation range:', error);
    return [];
  }
}