/**
 * PACK 320 - Real-Time Moderation Dashboard
 * Analytics and Reporting Functions
 * 
 * Daily rollup of moderation statistics
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type {
  ModerationAnalytics,
  ModerationItemType,
  ModerationRiskLevel,
  ModerationActionType
} from './pack320-moderation-types';

const db = getFirestore();

// ============================================================================
// DAILY ANALYTICS ROLLUP
// ============================================================================

/**
 * Generate daily moderation analytics
 * Runs at 1 AM daily (UTC)
 */
export const dailyModerationAnalyticsRollup = onSchedule(
  {
    schedule: '0 1 * * *', // 1 AM UTC every day
    timeZone: 'UTC',
    region: 'europe-west3'
  },
  async (event) => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

      logger.info(`Generating moderation analytics for ${dateStr}`);

      // Query flags for the day
      const flagsSnapshot = await db
        .collection('moderationQueue')
        .where('createdAt', '>=', Timestamp.fromDate(yesterday))
        .where('createdAt', '<', Timestamp.fromDate(today))
        .get();

      // Query actions for the day
      const actionsSnapshot = await db
        .collection('moderationActions')
        .where('timestamp', '>=', Timestamp.fromDate(yesterday))
        .where('timestamp', '<', Timestamp.fromDate(today))
        .get();

      // Initialize counters
      let totalFlags = 0;
      let autoFlags = 0;
      let userFlags = 0;
      let resolved = 0;
      let unresolvedBacklog = 0;

      const flagsByType: Record<ModerationItemType, number> = {
        IMAGE: 0,
        PROFILE: 0,
        CHAT: 0,
        MEETING: 0,
        EVENT: 0,
        AUDIO: 0,
        VIDEO: 0
      };

      const flagsByRisk: Record<ModerationRiskLevel, number> = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0
      };

      let totalResolutionTimeMinutes = 0;
      let resolvedCount = 0;
      let criticalFlagsResolved = 0;
      let criticalFlagsUnresolved = 0;

      // Process flags
      flagsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalFlags++;

        // Auto vs user flags
        if (data.reporterId === null) {
          autoFlags++;
        } else {
          userFlags++;
        }

        // By type
        if (data.type && flagsByType[data.type as ModerationItemType] !== undefined) {
          flagsByType[data.type as ModerationItemType]++;
        }

        // By risk level
        if (data.riskLevel && flagsByRisk[data.riskLevel as ModerationRiskLevel] !== undefined) {
          flagsByRisk[data.riskLevel as ModerationRiskLevel]++;
        }

        // Resolution status
        if (data.status === 'ACTION_TAKEN' || data.status === 'DISMISSED') {
          resolved++;
          resolvedCount++;

          // Calculate resolution time
          const createdAt = data.createdAt?.toDate() || yesterday;
          const lastUpdated = data.lastUpdated?.toDate() || today;
          const resolutionTimeMinutes = Math.floor(
            (lastUpdated.getTime() - createdAt.getTime()) / 1000 / 60
          );
          totalResolutionTimeMinutes += resolutionTimeMinutes;

          // Track critical flags
          if (data.riskLevel === 'CRITICAL') {
            criticalFlagsResolved++;
          }
        } else {
          unresolvedBacklog++;

          if (data.riskLevel === 'CRITICAL') {
            criticalFlagsUnresolved++;
          }
        }
      });

      // Process actions
      let warningsIssued = 0;
      let suspensions = 0;
      let bans = 0;
      let reverificationsTriggered = 0;
      let contentRemoved = 0;
      let dismissed = 0;

      actionsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const actionType = data.actionType as ModerationActionType;

        switch (actionType) {
          case 'WARNING':
            warningsIssued++;
            break;
          case 'SUSPEND_24H':
          case 'SUSPEND_72H':
          case 'SUSPEND_7D':
            suspensions++;
            break;
          case 'PERMANENT_BAN':
            bans++;
            break;
          case 'REQUIRE_REVERIFICATION':
            reverificationsTriggered++;
            break;
          case 'REMOVE_CONTENT':
            contentRemoved++;
            break;
          case 'DISMISS':
            dismissed++;
            break;
        }
      });

      // Calculate average resolution time
      const avgResolutionTimeMinutes = resolvedCount > 0 
        ? Math.floor(totalResolutionTimeMinutes / resolvedCount)
        : 0;

      // Create analytics document
      const analytics: Omit<ModerationAnalytics, 'date'> = {
        totalFlags,
        autoFlags,
        userFlags,
        resolved,
        unresolvedBacklog,
        warningsIssued,
        suspensions,
        bans,
        reverificationsTriggered,
        contentRemoved,
        dismissed,
        flagsByType,
        flagsByRisk,
        avgResolutionTimeMinutes,
        criticalFlagsResolved,
        criticalFlagsUnresolved,
        createdAt: Timestamp.now(),
        lastUpdated: Timestamp.now()
      };

      await db.collection('moderationAnalytics').doc(dateStr).set({
        date: dateStr,
        ...analytics
      });

      logger.info(`Moderation analytics generated for ${dateStr}:`, {
        totalFlags,
        resolved,
        unresolvedBacklog,
        avgResolutionTimeMinutes
      });
    } catch (error: any) {
      logger.error('Failed to generate moderation analytics:', error);
      throw error;
    }
  }
);

// ============================================================================
// REAL-TIME STATS QUERIES
// ============================================================================

/**
 * Get current moderation dashboard statistics
 */
export const getModerationStats = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: false
  },
  async (request) => {
    const uid = request.auth?.uid;
    
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Verify moderator role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const role = userData?.role || 'USER';

    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      throw new HttpsError('permission-denied', 'Insufficient permissions');
    }

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get pending items
      const pendingSnapshot = await db
        .collection('moderationQueue')
        .where('status', '==', 'PENDING')
        .get();

      // Get in-review items
      const inReviewSnapshot = await db
        .collection('moderationQueue')
        .where('status', '==', 'IN_REVIEW')
        .get();

      // Get today's flags
      const todaySnapshot = await db
        .collection('moderationQueue')
        .where('createdAt', '>=', Timestamp.fromDate(today))
        .get();

      // Get this week's flags
      const weekSnapshot = await db
        .collection('moderationQueue')
        .where('createdAt', '>=', Timestamp.fromDate(weekAgo))
        .get();

      // Get critical unresolved
      const criticalSnapshot = await db
        .collection('moderationQueue')
        .where('riskLevel', '==', 'CRITICAL')
        .where('status', '==', 'PENDING')
        .get();

      // Get high unresolved
      const highSnapshot = await db
        .collection('moderationQueue')
        .where('riskLevel', '==', 'HIGH')
        .where('status', '==', 'PENDING')
        .get();

      // Calculate avg resolution time from last 7 days of analytics
      let totalAvgTime = 0;
      let daysWithData = 0;

      for (let i = 1; i <= 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const analyticsDoc = await db.collection('moderationAnalytics').doc(dateStr).get();
        if (analyticsDoc.exists) {
          const data = analyticsDoc.data();
          if (data?.avgResolutionTimeMinutes) {
            totalAvgTime += data.avgResolutionTimeMinutes;
            daysWithData++;
          }
        }
      }

      const avgResolutionTimeMinutes = daysWithData > 0 ? Math.floor(totalAvgTime / daysWithData) : 0;

      // Get active moderators (who took action in last 24h)
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentActionsSnapshot = await db
        .collection('moderationActions')
        .where('timestamp', '>=', Timestamp.fromDate(yesterday))
        .get();

      const activeModerators = new Set(
        recentActionsSnapshot.docs.map((doc) => doc.data().moderatorId)
      ).size;

      return {
        totalPending: pendingSnapshot.size,
        totalInReview: inReviewSnapshot.size,
        totalToday: todaySnapshot.size,
        totalThisWeek: weekSnapshot.size,
        criticalUnresolved: criticalSnapshot.size,
        highUnresolved: highSnapshot.size,
        avgResolutionTimeMinutes,
        moderatorsActive: activeModerators
      };
    } catch (error: any) {
      logger.error('Failed to get moderation stats:', error);
      throw new HttpsError('internal', 'Failed to fetch statistics');
    }
  }
);

/**
 * Get moderation analytics for date range
 */
export const getModerationAnalytics = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: false
  },
  async (request) => {
    const uid = request.auth?.uid;
    
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Verify moderator role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const role = userData?.role || 'USER';

    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      throw new HttpsError('permission-denied', 'Insufficient permissions');
    }

    const { startDate, endDate } = request.data;

    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'Start date and end date required');
    }

    try {
      const analytics: any[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Iterate through date range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        
        const analyticsDoc = await db.collection('moderationAnalytics').doc(dateStr).get();
        
        if (analyticsDoc.exists) {
          analytics.push({
            date: dateStr,
            ...analyticsDoc.data()
          });
        } else {
          // Return empty data for days without analytics
          analytics.push({
            date: dateStr,
            totalFlags: 0,
            autoFlags: 0,
            userFlags: 0,
            resolved: 0,
            unresolvedBacklog: 0
          });
        }
      }

      return { analytics };
    } catch (error: any) {
      logger.error('Failed to get moderation analytics:', error);
      throw new HttpsError('internal', 'Failed to fetch analytics');
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  dailyModerationAnalyticsRollup,
  getModerationStats,
  getModerationAnalytics
};