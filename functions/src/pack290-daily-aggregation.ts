/**
 * PACK 290 — Daily Analytics Aggregation
 * Pre-aggregates creator analytics for performance
 * 
 * Runs nightly to process previous day's transactions
 * Stores results in creatorDailyStats collection
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import {
  CreatorDailyStats,
  AggregationJobStatus,
  DEFAULT_AGGREGATION_CONFIG,
  mapTransactionToFeature,
  isEarningTransaction,
} from './types/pack290-creator-analytics.types';

// ============================================================================
// SCHEDULED FUNCTION: Daily Aggregation
// ============================================================================

/**
 * Nightly job to aggregate previous day's transaction data
 * Runs at 2 AM UTC daily
 */
export const creator_analytics_daily_aggregation = onSchedule(
  {
    schedule: DEFAULT_AGGREGATION_CONFIG.cronSchedule,
    timeZone: 'UTC',
    retryCount: 3,
  },
  async (event) => {
    const jobId = `agg_${Date.now()}`;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateStr = formatDate(yesterday);
    
    console.log(`[Daily Aggregation] Starting job ${jobId} for ${dateStr}`);
    
    // Create job status
    const jobStatus: AggregationJobStatus = {
      jobId,
      date: dateStr,
      status: 'RUNNING',
      startedAt: serverTimestamp() as any,
      usersProcessed: 0,
      totalUsers: 0,
      errors: [],
    };
    
    try {
      await db.collection('aggregationJobs').doc(jobId).set(jobStatus);
      
      // Get all users who had transactions yesterday
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);
      
      const txSnapshot = await db
        .collection('walletTransactions')
        .where('createdAt', '>=', startOfDay)
        .where('createdAt', '<=', endOfDay)
        .get();
      
      // Group by userId
      const userTransactions = new Map<string, any[]>();
      
      for (const doc of txSnapshot.docs) {
        const tx = doc.data();
        
        // Only process earning transactions
        if (!isEarningTransaction(tx.type) && tx.direction !== 'IN') {
          continue;
        }
        
        if (!userTransactions.has(tx.userId)) {
          userTransactions.set(tx.userId, []);
        }
        userTransactions.get(tx.userId)!.push(tx);
      }
      
      const totalUsers = userTransactions.size;
      jobStatus.totalUsers = totalUsers;
      
      console.log(`[Daily Aggregation] Processing ${totalUsers} users for ${dateStr}`);
      
      // Process each user
      let processed = 0;
      const errors: string[] = [];
      
      for (const [userId, transactions] of Array.from(userTransactions.entries())) {
        try {
          await aggregateUserDay(userId, dateStr, transactions);
          processed++;
          
          // Update progress every 10 users
          if (processed % 10 === 0) {
            await db.collection('aggregationJobs').doc(jobId).update({
              usersProcessed: processed,
            });
          }
        } catch (error: any) {
          console.error(`[Daily Aggregation] Error processing user ${userId}:`, error);
          errors.push(`User ${userId}: ${error.message}`);
        }
      }
      
      // Mark as completed
      jobStatus.status = 'COMPLETED';
      jobStatus.usersProcessed = processed;
      jobStatus.completedAt = serverTimestamp() as any;
      jobStatus.errors = errors;
      
      await db.collection('aggregationJobs').doc(jobId).update({
        status: 'COMPLETED',
        usersProcessed: processed,
        completedAt: serverTimestamp(),
        errors,
      });
      
      console.log(`[Daily Aggregation] Job ${jobId} completed: ${processed}/${totalUsers} users, ${errors.length} errors`);
      
    } catch (error: any) {
      console.error(`[Daily Aggregation] Job ${jobId} failed:`, error);
      
      await db.collection('aggregationJobs').doc(jobId).update({
        status: 'FAILED',
        errors: [error.message],
        completedAt: serverTimestamp(),
      });
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Aggregate one user's transactions for one day
 */
async function aggregateUserDay(
  userId: string,
  dateStr: string,
  transactions: any[]
): Promise<void> {
  const stats: CreatorDailyStats = {
    id: `${userId}_${dateStr}`,
    userId,
    date: dateStr,
    
    tokensEarnedTotal: 0,
    tokensEarnedChat: 0,
    tokensEarnedMedia: 0,
    tokensEarnedCall: 0,
    tokensEarnedCalendar: 0,
    tokensEarnedEvents: 0,
    tokensEarnedOther: 0,
    
    uniquePayers: 0,
    paidChats: 0,
    paidCalls: 0,
    calendarBookings: 0,
    eventTickets: 0,
    
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  
  const uniquePayerIds = new Set<string>();
  const uniqueChats = new Set<string>();
  const uniqueCalls = new Set<string>();
  const uniqueBookings = new Set<string>();
  const uniqueEvents = new Set<string>();
  
  for (const tx of transactions) {
    const tokens = Math.abs(tx.tokens || tx.amountTokens || 0);
    stats.tokensEarnedTotal += tokens;
    
    // Track by feature
    const feature = tx.meta?.feature || mapTransactionToFeature(tx.type, tx.source);
    
    switch (feature) {
      case 'CHAT':
        stats.tokensEarnedChat += tokens;
        if (tx.relatedId) uniqueChats.add(tx.relatedId);
        break;
      case 'MEDIA':
        stats.tokensEarnedMedia += tokens;
        break;
      case 'CALL':
        stats.tokensEarnedCall += tokens;
        if (tx.relatedId) uniqueCalls.add(tx.relatedId);
        break;
      case 'CALENDAR':
        stats.tokensEarnedCalendar += tokens;
        if (tx.relatedId) uniqueBookings.add(tx.relatedId);
        break;
      case 'EVENT':
        stats.tokensEarnedEvents += tokens;
        if (tx.relatedId) uniqueEvents.add(tx.relatedId);
        break;
      default:
        stats.tokensEarnedOther += tokens;
    }
    
    // Track unique payers
    if (tx.meta?.counterpartyId) {
      uniquePayerIds.add(tx.meta.counterpartyId);
    }
  }
  
  stats.uniquePayers = uniquePayerIds.size;
  stats.paidChats = uniqueChats.size;
  stats.paidCalls = uniqueCalls.size;
  stats.calendarBookings = uniqueBookings.size;
  stats.eventTickets = uniqueEvents.size;
  
  // Save to Firestore
  const docId = `${userId}_${dateStr}`;
  await db.collection('creatorDailyStats').doc(docId).set(stats);
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// MANUAL TRIGGER FUNCTION (for testing/backfill)
// ============================================================================

/**
 * Manually trigger aggregation for specific date range
 * Useful for backfilling historical data
 */
export async function backfillDailyStats(
  startDate: Date,
  endDate: Date
): Promise<{ success: boolean; daysProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let daysProcessed = 0;
  
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateStr = formatDate(currentDate);
    
    try {
      console.log(`[Backfill] Processing ${dateStr}`);
      
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const txSnapshot = await db
        .collection('walletTransactions')
        .where('createdAt', '>=', startOfDay)
        .where('createdAt', '<=', endOfDay)
        .get();
      
      const userTransactions = new Map<string, any[]>();
      
      for (const doc of txSnapshot.docs) {
        const tx = doc.data();
        
        if (!isEarningTransaction(tx.type) && tx.direction !== 'IN') {
          continue;
        }
        
        if (!userTransactions.has(tx.userId)) {
          userTransactions.set(tx.userId, []);
        }
        userTransactions.get(tx.userId)!.push(tx);
      }
      
      for (const [userId, transactions] of Array.from(userTransactions.entries())) {
        try {
          await aggregateUserDay(userId, dateStr, transactions);
        } catch (error: any) {
          errors.push(`${dateStr} - User ${userId}: ${error.message}`);
        }
      }
      
      daysProcessed++;
    } catch (error: any) {
      errors.push(`${dateStr}: ${error.message}`);
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return {
    success: errors.length === 0,
    daysProcessed,
    errors,
  };
}