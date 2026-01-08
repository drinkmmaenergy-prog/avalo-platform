/**
 * PACK 324A — KPI Aggregation Engine
 * 
 * Aggregates metrics from existing collections into daily/hourly KPI snapshots
 * READ-ONLY from business logic perspective - no wallet writes, no pricing changes
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  PlatformKpiDaily,
  PlatformKpiHourly,
  CreatorKpiDaily,
  SafetyKpiDaily,
  KPI_CONFIG,
  RevenueSource,
} from './pack324a-kpi-types';

// ============================================================================
// DATE HELPERS
// ============================================================================

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

function getHourRange(date: Date, hour: number): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(hour, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(hour, 59, 59, 999);
  
  return { start, end };
}

// ============================================================================
// PLATFORM KPI AGGREGATION
// ============================================================================

/**
 * Aggregate platform KPIs for a specific date
 */
export async function aggregatePlatformKpiDaily(
  date: Date
): Promise<PlatformKpiDaily> {
  const dateStr = formatDate(date);
  const { start, end } = getDateRange(date);
  
  logger.info(`Aggregating platform KPI for ${dateStr}`);
  
  // Initialize KPI object
  const kpi: PlatformKpiDaily = {
    date: dateStr,
    newUsers: 0,
    verifiedUsers: 0,
    activeUsers: 0,
    payingUsers: 0,
    totalTokensSpent: 0,
    totalTokenRevenuePLN: 0,
    totalChats: 0,
    totalVoiceMinutes: 0,
    totalVideoMinutes: 0,
    totalCalendarBookings: 0,
    totalEventTickets: 0,
    createdAt: Timestamp.now(),
  };
  
  // 1. Count new users
  try {
    const newUsersSnapshot = await db
      .collection('users')
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .count()
      .get();
    kpi.newUsers = newUsersSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting new users:', error);
  }
  
  // 2. Count verified users (created this day who are verified)
  try {
    const verifiedUsersSnapshot = await db
      .collection('users')
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .where('verified', '==', true)
      .count()
      .get();
    kpi.verifiedUsers = verifiedUsersSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting verified users:', error);
  }
  
  // 3. Count active users (had any activity this day)
  // This is approximated from lastActiveAt field
  try {
    const activeUsersSnapshot = await db
      .collection('users')
      .where('lastActiveAt', '>=', start)
      .where('lastActiveAt', '<=', end)
      .count()
      .get();
    kpi.activeUsers = activeUsersSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting active users:', error);
  }
  
  // 4. Aggregate token spend from walletTransactions
  try {
    const transactionsSnapshot = await db
      .collection('walletTransactions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .where('type', '==', 'SPEND')
      .get();
    
    const payingUserIds = new Set<string>();
    
    transactionsSnapshot.forEach((doc) => {
      const tx = doc.data();
      const tokens = Math.abs(tx.amount || 0);
      
      kpi.totalTokensSpent += tokens;
      
      if (tx.userId) {
        payingUserIds.add(tx.userId);
      }
    });
    
    kpi.payingUsers = payingUserIds.size;
    kpi.totalTokenRevenuePLN = kpi.totalTokensSpent * KPI_CONFIG.TOKEN_TO_PLN_RATE;
  } catch (error) {
    logger.error('Error aggregating token transactions:', error);
  }
  
  // 5. Count chat sessions from aiChatSessions
  try {
    const chatSessionsSnapshot = await db
      .collection('aiChatSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .count()
      .get();
    kpi.totalChats = chatSessionsSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting chat sessions:', error);
  }
  
  // 6. Aggregate voice call minutes
  try {
    const voiceCallsSnapshot = await db
      .collection('aiVoiceCallSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    voiceCallsSnapshot.forEach((doc) => {
      const call = doc.data();
      kpi.totalVoiceMinutes += call.durationMinutes || 0;
    });
  } catch (error) {
    logger.error('Error aggregating voice minutes:', error);
  }
  
  // 7. Aggregate video call minutes
  try {
    const videoCallsSnapshot = await db
      .collection('aiVideoCallSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    videoCallsSnapshot.forEach((doc) => {
      const call = doc.data();
      kpi.totalVideoMinutes += call.durationMinutes || 0;
    });
  } catch (error) {
    logger.error('Error aggregating video minutes:', error);
  }
  
  // 8. Count calendar bookings
  try {
    const bookingsSnapshot = await db
      .collection('calendarBookings')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .count()
      .get();
    kpi.totalCalendarBookings = bookingsSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting calendar bookings:', error);
  }
  
  // 9. Count event tickets
  try {
    const ticketsSnapshot = await db
      .collection('eventTickets')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .count()
      .get();
    kpi.totalEventTickets = ticketsSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting event tickets:', error);
  }
  
  logger.info(`Platform KPI aggregated for ${dateStr}:`, {
    newUsers: kpi.newUsers,
    activeUsers: kpi.activeUsers,
    tokensSpent: kpi.totalTokensSpent,
  });
  
  return kpi;
}

/**
 * Aggregate platform KPIs for a specific hour
 */
export async function aggregatePlatformKpiHourly(
  date: Date,
  hour: number
): Promise<PlatformKpiHourly> {
  const dateStr = formatDate(date);
  const { start, end } = getHourRange(date, hour);
  
  logger.info(`Aggregating platform KPI for ${dateStr} hour ${hour}`);
  
  const kpi: PlatformKpiHourly = {
    date: dateStr,
    hour,
    activeUsers: 0,
    tokensSpent: 0,
    tokenRevenuePLN: 0,
    chatsStarted: 0,
    voiceMinutes: 0,
    videoMinutes: 0,
    createdAt: Timestamp.now(),
  };
  
  // Count active users this hour
  try {
    const activeUsersSnapshot = await db
      .collection('users')
      .where('lastActiveAt', '>=', start)
      .where('lastActiveAt', '<=', end)
      .count()
      .get();
    kpi.activeUsers = activeUsersSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting active users:', error);
  }
  
  // Aggregate token spend this hour
  try {
    const transactionsSnapshot = await db
      .collection('walletTransactions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .where('type', '==', 'SPEND')
      .get();
    
    transactionsSnapshot.forEach((doc) => {
      const tx = doc.data();
      kpi.tokensSpent += Math.abs(tx.amount || 0);
    });
    
    kpi.tokenRevenuePLN = kpi.tokensSpent * KPI_CONFIG.TOKEN_TO_PLN_RATE;
  } catch (error) {
    logger.error('Error aggregating tokens:', error);
  }
  
  // Count chats started this hour
  try {
    const chatsSnapshot = await db
      .collection('aiChatSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .count()
      .get();
    kpi.chatsStarted = chatsSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting chats:', error);
  }
  
  // Aggregate voice minutes this hour
  try {
    const voiceSnapshot = await db
      .collection('aiVoiceCallSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    voiceSnapshot.forEach((doc) => {
      kpi.voiceMinutes += doc.data().durationMinutes || 0;
    });
  } catch (error) {
    logger.error('Error aggregating voice minutes:', error);
  }
  
  // Aggregate video minutes this hour
  try {
    const videoSnapshot = await db
      .collection('aiVideoCallSessions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    videoSnapshot.forEach((doc) => {
      kpi.videoMinutes += doc.data().durationMinutes || 0;
    });
  } catch (error) {
    logger.error('Error aggregating video minutes:', error);
  }
  
  return kpi;
}

// ============================================================================
// CREATOR KPI AGGREGATION
// ============================================================================

/**
 * Aggregate creator KPIs for a specific date
 */
export async function aggregateCreatorKpiDaily(
  userId: string,
  date: Date
): Promise<CreatorKpiDaily> {
  const dateStr = formatDate(date);
  const { start, end } = getDateRange(date);
  
  logger.info(`Aggregating creator KPI for user ${userId} on ${dateStr}`);
  
  const kpi: CreatorKpiDaily = {
    date: dateStr,
    userId,
    earnedTokensChat: 0,
    earnedTokensVoice: 0,
    earnedTokensVideo: 0,
    earnedTokensCalendar: 0,
    earnedTokensEvents: 0,
    earnedTokensOther: 0,
    totalEarnedTokens: 0,
    totalEarnedPLN: 0,
    sessionsCount: 0,
    createdAt: Timestamp.now(),
  };
  
  // Aggregate from walletTransactions where user is receiver
  try {
    const transactionsSnapshot = await db
      .collection('walletTransactions')
      .where('receiverId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    transactionsSnapshot.forEach((doc) => {
      const tx = doc.data();
      const amount = tx.amount || 0;
      const context = tx.context || 'OTHER';
      
      // Categorize by context
      if (context === 'CHAT' || context === 'AI_SESSION') {
        kpi.earnedTokensChat += amount;
      } else if (context === 'VOICE' || context === 'AI_VOICE') {
        kpi.earnedTokensVoice += amount;
      } else if (context === 'VIDEO' || context === 'AI_VIDEO') {
        kpi.earnedTokensVideo += amount;
      } else if (context === 'TIP') {
        kpi.earnedTokensOther += amount;
      } else {
        kpi.earnedTokensOther += amount;
      }
    });
  } catch (error) {
    logger.error('Error aggregating wallet transactions:', error);
  }
  
  // Aggregate from calendar bookings
  try {
    const bookingsSnapshot = await db
      .collection('calendarBookings')
      .where('hostId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    bookingsSnapshot.forEach((doc) => {
      const booking = doc.data();
      const hostEarnings = booking.hostEarnings || 0;
      kpi.earnedTokensCalendar += hostEarnings;
    });
  } catch (error) {
    logger.error('Error aggregating calendar bookings:', error);
  }
  
  // Aggregate from event tickets (organizer earnings)
  try {
    const ticketsSnapshot = await db
      .collection('eventTickets')
      .where('eventOrganizerId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    ticketsSnapshot.forEach((doc) => {
      const ticket = doc.data();
      const organizerEarnings = ticket.organizerEarnings || 0;
      kpi.earnedTokensEvents += organizerEarnings;
    });
  } catch (error) {
    logger.error('Error aggregating event tickets:', error);
  }
  
  // Count sessions
  try {
    const chatSessionsSnapshot = await db
      .collection('aiChatSessions')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .count()
      .get();
    kpi.sessionsCount = chatSessionsSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting sessions:', error);
  }
  
  // Calculate totals
  kpi.totalEarnedTokens = 
    kpi.earnedTokensChat +
    kpi.earnedTokensVoice +
    kpi.earnedTokensVideo +
    kpi.earnedTokensCalendar +
    kpi.earnedTokensEvents +
    kpi.earnedTokensOther;
  
  kpi.totalEarnedPLN = kpi.totalEarnedTokens * KPI_CONFIG.TOKEN_TO_PLN_RATE;
  
  logger.info(`Creator KPI aggregated for ${userId} on ${dateStr}: ${kpi.totalEarnedTokens} tokens`);
  
  return kpi;
}

/**
 * Aggregate creator KPIs for all creators who had activity on a date
 */
export async function aggregateAllCreatorsKpiDaily(
  date: Date,
  batchSize: number = 100
): Promise<number> {
  const { start, end } = getDateRange(date);
  
  logger.info(`Aggregating creator KPIs for all creators on ${formatDate(date)}`);
  
  // Get all users who received tokens this day
  const transactionsSnapshot = await db
    .collection('walletTransactions')
    .where('createdAt', '>=', Timestamp.fromDate(start))
    .where('createdAt', '<=', Timestamp.fromDate(end))
    .select('receiverId')
    .get();
  
  const creatorIds = new Set<string>();
  transactionsSnapshot.forEach((doc) => {
    const receiverId = doc.data().receiverId;
    if (receiverId && receiverId !== 'avalo_platform') {
      creatorIds.add(receiverId);
    }
  });
  
  logger.info(`Found ${creatorIds.size} creators with activity`);
  
  // Process in batches
  const batch = db.batch();
  let count = 0;
  
  for (const creatorId of Array.from(creatorIds)) {
    try {
      const kpi = await aggregateCreatorKpiDaily(creatorId, date);
      const docId = `${creatorId}_${kpi.date}`;
      const docRef = db.collection(KPI_CONFIG.COLLECTIONS.CREATOR_DAILY).doc(docId);
      
      batch.set(docRef, kpi, { merge: true });
      count++;
      
      // Commit in batches
      if (count % batchSize === 0) {
        await batch.commit();
        logger.info(`Committed batch of ${count} creator KPIs`);
      }
    } catch (error) {
      logger.error(`Error aggregating creator ${creatorId}:`, error);
    }
  }
  
  // Commit remaining
  if (count % batchSize !== 0) {
    await batch.commit();
  }
  
  logger.info(`Aggregated ${count} creator KPIs for ${formatDate(date)}`);
  return count;
}

// ============================================================================
// SAFETY KPI AGGREGATION
// ============================================================================

/**
 * Aggregate safety KPIs for a specific date
 */
export async function aggregateSafetyKpiDaily(
  date: Date
): Promise<SafetyKpiDaily> {
  const dateStr = formatDate(date);
  const { start, end } = getDateRange(date);
  
  logger.info(`Aggregating safety KPI for ${dateStr}`);
  
  const kpi: SafetyKpiDaily = {
    date: dateStr,
    reportsTotal: 0,
    reportsAI: 0,
    reportsHuman: 0,
    bansIssued: 0,
    autoBlocks: 0,
    panicEvents: 0,
    createdAt: Timestamp.now(),
  };
  
  // 1. Count reports from moderationQueue
  try {
    const reportsSnapshot = await db
      .collection('moderationQueue')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();
    
    reportsSnapshot.forEach((doc) => {
      const report = doc.data();
      kpi.reportsTotal++;
      
      if (report.source === 'AI' || report.source === 'AUTO') {
        kpi.reportsAI++;
      } else if (report.source === 'USER') {
        kpi.reportsHuman++;
      }
    });
  } catch (error) {
    logger.error('Error counting reports:', error);
  }
  
  // 2. Count bans issued
  try {
    const enforcementSnapshot = await db
      .collection('enforcement_logs')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .where('action', '==', 'BAN')
      .count()
      .get();
    kpi.bansIssued = enforcementSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting bans:', error);
  }
  
  // 3. Count auto-blocks
  try {
    const autoBlocksSnapshot = await db
      .collection('enforcement_logs')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .where('action', '==', 'AUTO_BLOCK')
      .count()
      .get();
    kpi.autoBlocks = autoBlocksSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting auto-blocks:', error);
  }
  
  // 4. Count panic button events
  try {
    const panicSnapshot = await db
      .collection('safetyAlerts')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .where('type', '==', 'PANIC')
      .count()
      .get();
    kpi.panicEvents = panicSnapshot.data().count;
  } catch (error) {
    logger.error('Error counting panic events:', error);
  }
  
  logger.info(`Safety KPI aggregated for ${dateStr}:`, {
    reportsTotal: kpi.reportsTotal,
    bans: kpi.bansIssued,
  });
  
  return kpi;
}

// ============================================================================
// BATCH AGGREGATION
// ============================================================================

/**
 * Aggregate all KPIs for a specific date
 * Calls all aggregation functions and stores results
 */
export async function aggregateAllKpiDaily(date: Date): Promise<{
  platformKpi: PlatformKpiDaily;
  creatorsProcessed: number;
  safetyKpi: SafetyKpiDaily;
}> {
  logger.info(`Starting full KPI aggregation for ${formatDate(date)}`);
  
  // Aggregate platform KPIs
  const platformKpi = await aggregatePlatformKpiDaily(date);
  await db
    .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_DAILY)
    .doc(platformKpi.date)
    .set(platformKpi, { merge: true });
  
  // Aggregate creator KPIs
  const creatorsProcessed = await aggregateAllCreatorsKpiDaily(date);
  
  // Aggregate safety KPIs
  const safetyKpi = await aggregateSafetyKpiDaily(date);
  await db
    .collection(KPI_CONFIG.COLLECTIONS.SAFETY_DAILY)
    .doc(safetyKpi.date)
    .set(safetyKpi, { merge: true });
  
  logger.info(`Full KPI aggregation complete for ${formatDate(date)}`);
  
  return {
    platformKpi,
    creatorsProcessed,
    safetyKpi,
  };
}

/**
 * Aggregate hourly KPIs for current hour
 */
export async function aggregateCurrentHourKpi(): Promise<PlatformKpiHourly> {
  const now = new Date();
  const hour = now.getHours();
  
  const kpi = await aggregatePlatformKpiHourly(now, hour);
  
  const docId = `${kpi.date}_${String(hour).padStart(2, '0')}`;
  await db
    .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_HOURLY)
    .doc(docId)
    .set(kpi, { merge: true });
  
  return kpi;
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Cleanup old hourly KPI records (keep only last 7 days)
 */
export async function cleanupOldHourlyKpi(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - KPI_CONFIG.RETENTION_DAYS.HOURLY);
  const cutoffStr = formatDate(cutoffDate);
  
  logger.info(`Cleaning up hourly KPIs older than ${cutoffStr}`);
  
  const oldRecords = await db
    .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_HOURLY)
    .where('date', '<', cutoffStr)
    .limit(500)
    .get();
  
  const batch = db.batch();
  oldRecords.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  logger.info(`Deleted ${oldRecords.size} old hourly KPI records`);
  return oldRecords.size;
}