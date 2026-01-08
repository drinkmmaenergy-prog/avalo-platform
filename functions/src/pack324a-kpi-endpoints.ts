/**
 * PACK 324A — Admin KPI API Endpoints
 * 
 * Callable functions for retrieving KPI data
 * Admin-only access, read-only operations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  PlatformKpiResponse,
  CreatorKpiResponse,
  SafetyKpiResponse,
  KPI_CONFIG,
} from './pack324a-kpi-types';
import {
  aggregatePlatformKpiDaily,
  aggregateCreatorKpiDaily,
  aggregateSafetyKpiDaily,
  aggregateAllKpiDaily,
  aggregateCurrentHourKpi,
  cleanupOldHourlyKpi,
} from './pack324a-kpi-aggregation';

// ============================================================================
// HELPER: ADMIN CHECK
// ============================================================================

/**
 * Verify user is admin
 * TODO: Replace with actual admin role check from your auth system
 */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    
    const userData = userDoc.data();
    return userData?.role === 'admin' || userData?.roles?.admin === true;
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

// ============================================================================
// PLATFORM KPI ENDPOINTS
// ============================================================================

/**
 * Get platform KPI for a specific date
 * Admin-only, read-only
 */
export const pack324a_getPlatformKpiDaily = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin access
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { date } = request.data;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'Valid date required (YYYY-MM-DD)');
    }
    
    try {
      const kpiDoc = await db
        .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_DAILY)
        .doc(date)
        .get();
      
      if (!kpiDoc.exists) {
        // Try to generate on-demand
        const dateObj = new Date(date);
        const kpi = await aggregatePlatformKpiDaily(dateObj);
        
        // Save for future use
        await db
          .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_DAILY)
          .doc(date)
          .set(kpi, { merge: true });
        
        const response: PlatformKpiResponse = {
          date: kpi.date,
          users: {
            new: kpi.newUsers,
            verified: kpi.verifiedUsers,
            active: kpi.activeUsers,
            paying: kpi.payingUsers,
          },
          revenue: {
            tokensSpent: kpi.totalTokensSpent,
            revenuePLN: kpi.totalTokenRevenuePLN,
          },
          activity: {
            chats: kpi.totalChats,
            voiceMinutes: kpi.totalVoiceMinutes,
            videoMinutes: kpi.totalVideoMinutes,
            calendarBookings: kpi.totalCalendarBookings,
            eventTickets: kpi.totalEventTickets,
          },
          lastUpdated: kpi.createdAt.toDate(),
        };
        
        return response;
      }
      
      const kpi = kpiDoc.data();
      
      const response: PlatformKpiResponse = {
        date: kpi.date,
        users: {
          new: kpi.newUsers,
          verified: kpi.verifiedUsers,
          active: kpi.activeUsers,
          paying: kpi.payingUsers,
        },
        revenue: {
          tokensSpent: kpi.totalTokensSpent,
          revenuePLN: kpi.totalTokenRevenuePLN,
        },
        activity: {
          chats: kpi.totalChats,
          voiceMinutes: kpi.totalVoiceMinutes,
          videoMinutes: kpi.totalVideoMinutes,
          calendarBookings: kpi.totalCalendarBookings,
          eventTickets: kpi.totalEventTickets,
        },
        lastUpdated: kpi.createdAt.toDate(),
      };
      
      return response;
    } catch (error: any) {
      logger.error('Error fetching platform KPI:', error);
      throw new HttpsError('internal', `Failed to fetch KPI: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATOR KPI ENDPOINTS
// ============================================================================

/**
 * Get creator KPI for a specific user and date
 * Admin-only, read-only
 */
export const pack324a_getCreatorKpiDaily = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin access
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { userId, date } = request.data;
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'Valid date required (YYYY-MM-DD)');
    }
    
    try {
      const docId = `${userId}_${date}`;
      const kpiDoc = await db
        .collection(KPI_CONFIG.COLLECTIONS.CREATOR_DAILY)
        .doc(docId)
        .get();
      
      if (!kpiDoc.exists) {
        // Generate on-demand
        const dateObj = new Date(date);
        const kpi = await aggregateCreatorKpiDaily(userId, dateObj);
        
        // Save for future use
        await db
          .collection(KPI_CONFIG.COLLECTIONS.CREATOR_DAILY)
          .doc(docId)
          .set(kpi, { merge: true });
        
        const response: CreatorKpiResponse = {
          date: kpi.date,
          userId: kpi.userId,
          earnings: {
            chat: kpi.earnedTokensChat,
            voice: kpi.earnedTokensVoice,
            video: kpi.earnedTokensVideo,
            calendar: kpi.earnedTokensCalendar,
            events: kpi.earnedTokensEvents,
            other: kpi.earnedTokensOther,
            total: kpi.totalEarnedTokens,
          },
          earningsPLN: kpi.totalEarnedPLN,
          sessions: kpi.sessionsCount,
          lastUpdated: kpi.createdAt.toDate(),
        };
        
        return response;
      }
      
      const kpi = kpiDoc.data();
      
      const response: CreatorKpiResponse = {
        date: kpi.date,
        userId: kpi.userId,
        earnings: {
          chat: kpi.earnedTokensChat,
          voice: kpi.earnedTokensVoice,
          video: kpi.earnedTokensVideo,
          calendar: kpi.earnedTokensCalendar,
          events: kpi.earnedTokensEvents,
          other: kpi.earnedTokensOther,
          total: kpi.totalEarnedTokens,
        },
        earningsPLN: kpi.totalEarnedPLN,
        sessions: kpi.sessionsCount,
        lastUpdated: kpi.createdAt.toDate(),
      };
      
      return response;
    } catch (error: any) {
      logger.error('Error fetching creator KPI:', error);
      throw new HttpsError('internal', `Failed to fetch KPI: ${error.message}`);
    }
  }
);

// ============================================================================
// SAFETY KPI ENDPOINTS
// ============================================================================

/**
 * Get safety KPI for a specific date
 * Admin-only, read-only
 */
export const pack324a_getSafetyKpiDaily = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin access
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { date } = request.data;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'Valid date required (YYYY-MM-DD)');
    }
    
    try {
      const kpiDoc = await db
        .collection(KPI_CONFIG.COLLECTIONS.SAFETY_DAILY)
        .doc(date)
        .get();
      
      if (!kpiDoc.exists) {
        // Generate on-demand
        const dateObj = new Date(date);
        const kpi = await aggregateSafetyKpiDaily(dateObj);
        
        // Save for future use
        await db
          .collection(KPI_CONFIG.COLLECTIONS.SAFETY_DAILY)
          .doc(date)
          .set(kpi, { merge: true });
        
        const response: SafetyKpiResponse = {
          date: kpi.date,
          reports: {
            total: kpi.reportsTotal,
            aiDetected: kpi.reportsAI,
            userReported: kpi.reportsHuman,
          },
          enforcement: {
            bans: kpi.bansIssued,
            autoBlocks: kpi.autoBlocks,
            panicEvents: kpi.panicEvents,
          },
          lastUpdated: kpi.createdAt.toDate(),
        };
        
        return response;
      }
      
      const kpi = kpiDoc.data();
      
      const response: SafetyKpiResponse = {
        date: kpi.date,
        reports: {
          total: kpi.reportsTotal,
          aiDetected: kpi.reportsAI,
          userReported: kpi.reportsHuman,
        },
        enforcement: {
          bans: kpi.bansIssued,
          autoBlocks: kpi.autoBlocks,
          panicEvents: kpi.panicEvents,
        },
        lastUpdated: kpi.createdAt.toDate(),
      };
      
      return response;
    } catch (error: any) {
      logger.error('Error fetching safety KPI:', error);
      throw new HttpsError('internal', `Failed to fetch KPI: ${error.message}`);
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily KPI aggregation job
 * Runs at 00:10 UTC
 */
export const pack324a_aggregateDailyKpi = onSchedule(
  {
    schedule: '10 0 * * *', // Daily at 00:10 UTC
    timeZone: 'UTC',
    memory: '2GiB' as const,
    timeoutSeconds: 540,
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('Starting daily KPI aggregation');
      
      // Aggregate for yesterday (since job runs at 00:10)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const result = await aggregateAllKpiDaily(yesterday);
      
      logger.info('Daily KPI aggregation complete:', {
        date: result.platformKpi.date,
        creatorsProcessed: result.creatorsProcessed,
        platformRevenue: result.platformKpi.totalTokenRevenuePLN,
        safetyReports: result.safetyKpi.reportsTotal,
      });
    } catch (error: any) {
      logger.error('Error in daily KPI aggregation:', error);
      throw error;
    }
  }
);

/**
 * Hourly KPI aggregation job
 * Runs every hour at :10 minutes
 */
export const pack324a_aggregateHourlyKpi = onSchedule(
  {
    schedule: '10 * * * *', // Every hour at :10
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 300,
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('Starting hourly KPI aggregation');
      
      const kpi = await aggregateCurrentHourKpi();
      
      logger.info('Hourly KPI aggregation complete:', {
        date: kpi.date,
        hour: kpi.hour,
        activeUsers: kpi.activeUsers,
        tokensSpent: kpi.tokensSpent,
      });
    } catch (error: any) {
      logger.error('Error in hourly KPI aggregation:', error);
      throw error;
    }
  }
);

/**
 * Cleanup old hourly KPI records
 * Runs daily at 01:00 UTC
 */
export const pack324a_cleanupOldHourlyKpi = onSchedule(
  {
    schedule: '0 1 * * *', // Daily at 01:00 UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
    timeoutSeconds: 300,
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('Starting hourly KPI cleanup');
      
      const deletedCount = await cleanupOldHourlyKpi();
      
      logger.info(`Cleanup complete: ${deletedCount} records deleted`);
    } catch (error: any) {
      logger.error('Error in KPI cleanup:', error);
      throw error;
    }
  }
);

// ============================================================================
// MANUAL TRIGGER ENDPOINTS (ADMIN ONLY)
// ============================================================================

/**
 * Manually trigger daily KPI aggregation for a specific date
 * Admin-only
 */
export const pack324a_admin_triggerDailyAggregation = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { date } = request.data;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'Valid date required (YYYY-MM-DD)');
    }
    
    try {
      const dateObj = new Date(date);
      const result = await aggregateAllKpiDaily(dateObj);
      
      logger.info(`Manual aggregation complete for ${date}`, {
        creatorsProcessed: result.creatorsProcessed,
      });
      
      return {
        success: true,
        date: result.platformKpi.date,
        creatorsProcessed: result.creatorsProcessed,
        platformKpi: result.platformKpi,
        safetyKpi: result.safetyKpi,
      };
    } catch (error: any) {
      logger.error('Error in manual aggregation:', error);
      throw new HttpsError('internal', `Aggregation failed: ${error.message}`);
    }
  }
);

/**
 * Get KPI summary for date range
 * Admin-only
 */
export const pack324a_admin_getKpiSummary = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { startDate, endDate } = request.data;
    
    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'startDate and endDate required');
    }
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new HttpsError('invalid-argument', 'Valid dates required (YYYY-MM-DD)');
    }
    
    try {
      const platformSnapshot = await db
        .collection(KPI_CONFIG.COLLECTIONS.PLATFORM_DAILY)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .orderBy('date', 'asc')
        .get();
      
      const dailyData: PlatformKpiResponse[] = [];
      let totalUsers = 0;
      let totalRevenue = 0;
      
      platformSnapshot.forEach((doc) => {
        const kpi = doc.data();
        
        dailyData.push({
          date: kpi.date,
          users: {
            new: kpi.newUsers,
            verified: kpi.verifiedUsers,
            active: kpi.activeUsers,
            paying: kpi.payingUsers,
          },
          revenue: {
            tokensSpent: kpi.totalTokensSpent,
            revenuePLN: kpi.totalTokenRevenuePLN,
          },
          activity: {
            chats: kpi.totalChats,
            voiceMinutes: kpi.totalVoiceMinutes,
            videoMinutes: kpi.totalVideoMinutes,
            calendarBookings: kpi.totalCalendarBookings,
            eventTickets: kpi.totalEventTickets,
          },
          lastUpdated: kpi.createdAt.toDate(),
        });
        
        totalUsers += kpi.newUsers;
        totalRevenue += kpi.totalTokenRevenuePLN;
      });
      
      return {
        success: true,
        startDate,
        endDate,
        dailyData,
        summary: {
          totalDays: dailyData.length,
          totalNewUsers: totalUsers,
          totalRevenuePLN: totalRevenue,
          averageDailyRevenue: dailyData.length > 0 ? totalRevenue / dailyData.length : 0,
        },
      };
    } catch (error: any) {
      logger.error('Error fetching KPI summary:', error);
      throw new HttpsError('internal', `Failed to fetch summary: ${error.message}`);
    }
  }
);

/**
 * Get top creators by earnings for a date range
 * Admin-only
 */
export const pack324a_admin_getTopCreators = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const adminCheck = await isAdmin(request.auth.uid);
    if (!adminCheck) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { startDate, endDate, limit = 50 } = request.data;
    
    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'startDate and endDate required');
    }
    
    try {
      const creatorsSnapshot = await db
        .collection(KPI_CONFIG.COLLECTIONS.CREATOR_DAILY)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get();
      
      // Aggregate by creator
      const creatorMap = new Map<string, {
        totalEarnings: number;
        totalSessions: number;
        days: number;
      }>();
      
      creatorsSnapshot.forEach((doc) => {
        const kpi = doc.data();
        const current = creatorMap.get(kpi.userId) || {
          totalEarnings: 0,
          totalSessions: 0,
          days: 0,
        };
        
        current.totalEarnings += kpi.totalEarnedTokens;
        current.totalSessions += kpi.sessionsCount;
        current.days += 1;
        
        creatorMap.set(kpi.userId, current);
      });
      
      // Convert to array and sort
      const topCreators = Array.from(creatorMap.entries())
        .map(([userId, data]) => ({
          userId,
          totalEarningsTokens: data.totalEarnings,
          totalEarningsPLN: data.totalEarnings * KPI_CONFIG.TOKEN_TO_PLN_RATE,
          totalSessions: data.totalSessions,
          activeDays: data.days,
          averageDailyEarnings: data.totalEarnings / data.days,
        }))
        .sort((a, b) => b.totalEarningsTokens - a.totalEarningsTokens)
        .slice(0, Math.min(limit, 100));
      
      return {
        success: true,
        startDate,
        endDate,
        topCreators,
        totalCreators: creatorMap.size,
      };
    } catch (error: any) {
      logger.error('Error fetching top creators:', error);
      throw new HttpsError('internal', `Failed to fetch top creators: ${error.message}`);
    }
  }
);