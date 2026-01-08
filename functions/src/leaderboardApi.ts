/**
 * PACK 216: Creator Competition Engine
 * API endpoints for leaderboard data access
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import * as logger from 'firebase-functions/logger';
import {
  CompetitionCategory,
  RankingPeriod,
  LeaderboardRanking,
  LeaderboardStats,
  VisibilityReward,
  LeaderboardBadge,
  MonthlySummary,
} from './types/leaderboard.types';

// ============================================================================
// GET LEADERBOARD RANKINGS
// ============================================================================

/**
 * Get leaderboard rankings for a specific category and period
 */
export const getLeaderboardRankings = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { category, period, region, limit: queryLimit } = request.data;

      if (!category || !period) {
        throw new HttpsError('invalid-argument', 'Category and period are required');
      }

      const rankingsLimit = queryLimit && queryLimit <= 100 ? queryLimit : 100;

      let query = db
        .collection('leaderboard_rankings')
        .where('category', '==', category)
        .where('period', '==', period)
        .where('isActive', '==', true)
        .orderBy('rank', 'asc')
        .limit(rankingsLimit);

      // Filter by region if provided
      if (region) {
        query = query.where('region', '==', region) as any;
      }

      const snapshot = await query.get();

      const rankings = snapshot.docs.map((doc) => ({
        ...doc.data(),
        rankingId: doc.id,
      }));

      return {
        success: true,
        rankings,
        count: rankings.length,
        category,
        period,
      };
    } catch (error) {
      logger.error('Error getting leaderboard rankings:', error);
      throw new HttpsError('internal', 'Failed to get leaderboard rankings');
    }
  }
);

// ============================================================================
// GET USER RANKING
// ============================================================================

/**
 * Get a specific user's ranking in a category
 */
export const getUserRanking = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { userId, category, period } = request.data;

      // If no userId provided, use authenticated user
      const targetUserId = userId || request.auth?.uid;

      if (!targetUserId) {
        throw new HttpsError('unauthenticated', 'User ID required');
      }

      if (!category || !period) {
        throw new HttpsError('invalid-argument', 'Category and period are required');
      }

      // Get user's ranking
      const rankingSnapshot = await db
        .collection('leaderboard_rankings')
        .where('userId', '==', targetUserId)
        .where('category', '==', category)
        .where('period', '==', period)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (rankingSnapshot.empty) {
        return {
          success: true,
          ranked: false,
          message: 'User not ranked in this category',
        };
      }

      const ranking = {
        ...rankingSnapshot.docs[0].data(),
        rankingId: rankingSnapshot.docs[0].id,
      };

      return {
        success: true,
        ranked: true,
        ranking,
      };
    } catch (error) {
      logger.error('Error getting user ranking:', error);
      throw new HttpsError('internal', 'Failed to get user ranking');
    }
  }
);

// ============================================================================
// GET USER ACTIVE REWARDS
// ============================================================================

/**
 * Get user's active visibility rewards
 */
export const getUserActiveRewards = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const rewardsSnapshot = await db
        .collection('visibility_rewards')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .get();

      const rewards = rewardsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        rewardId: doc.id,
      }));

      return {
        success: true,
        rewards,
        count: rewards.length,
      };
    } catch (error) {
      logger.error('Error getting user rewards:', error);
      throw new HttpsError('internal', 'Failed to get user rewards');
    }
  }
);

// ============================================================================
// GET USER ACTIVE BADGES
// ============================================================================

/**
 * Get user's active leaderboard badges
 */
export const getUserActiveBadges = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { userId } = request.data;

      // If no userId provided, use authenticated user
      const targetUserId = userId || request.auth?.uid;

      if (!targetUserId) {
        throw new HttpsError('unauthenticated', 'User ID required');
      }

      const badgesSnapshot = await db
        .collection('leaderboard_badges')
        .where('userId', '==', targetUserId)
        .where('isActive', '==', true)
        .get();

      const badges = badgesSnapshot.docs.map((doc) => ({
        ...doc.data(),
        badgeId: doc.id,
      }));

      return {
        success: true,
        badges,
        count: badges.length,
      };
    } catch (error) {
      logger.error('Error getting user badges:', error);
      throw new HttpsError('internal', 'Failed to get user badges');
    }
  }
);

// ============================================================================
// GET LEADERBOARD STATS
// ============================================================================

/**
 * Get statistical information about a leaderboard category
 */
export const getLeaderboardStats = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { category, period, region } = request.data;

      if (!category || !period) {
        throw new HttpsError('invalid-argument', 'Category and period are required');
      }

      // Construct stat ID
      const statId = region
        ? `${category}_${period}_${region}`
        : `${category}_${period}_GLOBAL`;

      const statDoc = await db.collection('leaderboard_stats').doc(statId).get();

      if (!statDoc.exists) {
        return {
          success: true,
          found: false,
          message: 'Statistics not available yet',
        };
      }

      const stats = {
        ...statDoc.data(),
        statId: statDoc.id,
      };

      return {
        success: true,
        found: true,
        stats,
      };
    } catch (error) {
      logger.error('Error getting leaderboard stats:', error);
      throw new HttpsError('internal', 'Failed to get leaderboard stats');
    }
  }
);

// ============================================================================
// GET MONTHLY SUMMARY
// ============================================================================

/**
 * Get monthly summary for a category
 */
export const getMonthlySummary = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { category, year, month } = request.data;

      if (!category) {
        throw new HttpsError('invalid-argument', 'Category is required');
      }

      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || currentDate.getMonth() + 1;

      const summaryId = `${targetYear}_${targetMonth}_${category}`;

      const summaryDoc = await db.collection('monthly_summaries').doc(summaryId).get();

      if (!summaryDoc.exists) {
        return {
          success: true,
          found: false,
          message: 'Monthly summary not available yet',
        };
      }

      const summary = {
        ...summaryDoc.data(),
        summaryId: summaryDoc.id,
      };

      return {
        success: true,
        found: true,
        summary,
      };
    } catch (error) {
      logger.error('Error getting monthly summary:', error);
      throw new HttpsError('internal', 'Failed to get monthly summary');
    }
  }
);

// ============================================================================
// GET USER LEADERBOARD HISTORY
// ============================================================================

/**
 * Get user's historical ranking data
 */
export const getUserLeaderboardHistory = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { category, limit: queryLimit } = request.data;

      const historyLimit = queryLimit && queryLimit <= 50 ? queryLimit : 20;

      let query = db
        .collection('users')
        .doc(userId)
        .collection('leaderboard_history')
        .orderBy('periodEndedAt', 'desc')
        .limit(historyLimit);

      // Filter by category if provided
      if (category) {
        query = query.where('category', '==', category) as any;
      }

      const snapshot = await query.get();

      const history = snapshot.docs.map((doc) => ({
        ...doc.data(),
        historyId: doc.id,
      }));

      return {
        success: true,
        history,
        count: history.length,
      };
    } catch (error) {
      logger.error('Error getting user leaderboard history:', error);
      throw new HttpsError('internal', 'Failed to get leaderboard history');
    }
  }
);

// ============================================================================
// OPT OUT OF COMPETITION
// ============================================================================

/**
 * Allow user to opt out of leaderboard competition
 */
export const optOutOfCompetition = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { optOut, hiddenCategories } = request.data;

      await db
        .collection('users')
        .doc(userId)
        .collection('competition_settings')
        .doc('preferences')
        .set(
          {
            optedOut: optOut === true,
            hiddenCategories: hiddenCategories || [],
            updatedAt: new Date(),
          },
          { merge: true }
        );

      logger.info(`User ${userId} updated competition settings: optOut=${optOut}`);

      return {
        success: true,
        message: optOut ? 'Opted out of competition' : 'Opted in to competition',
      };
    } catch (error) {
      logger.error('Error updating competition settings:', error);
      throw new HttpsError('internal', 'Failed to update competition settings');
    }
  }
);

// ============================================================================
// GET COMPETITION SETTINGS
// ============================================================================

/**
 * Get user's competition preferences
 */
export const getCompetitionSettings = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const settingsDoc = await db
        .collection('users')
        .doc(userId)
        .collection('competition_settings')
        .doc('preferences')
        .get();

      if (!settingsDoc.exists) {
        return {
          success: true,
          settings: {
            optedOut: false,
            hiddenCategories: [],
            notifyOnRankChange: true,
            notifyOnRewardEarned: true,
            showBadgesOnProfile: true,
          },
        };
      }

      return {
        success: true,
        settings: settingsDoc.data(),
      };
    } catch (error) {
      logger.error('Error getting competition settings:', error);
      throw new HttpsError('internal', 'Failed to get competition settings');
    }
  }
);

// ============================================================================
// GET ALL CATEGORIES
// ============================================================================

/**
 * Get list of all competition categories with metadata
 */
export const getCompetitionCategories = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const categoriesSnapshot = await db
        .collection('competition_categories')
        .where('isActive', '==', true)
        .get();

      const categories = categoriesSnapshot.docs.map((doc) => ({
        ...doc.data(),
        categoryId: doc.id,
      }));

      return {
        success: true,
        categories,
        count: categories.length,
      };
    } catch (error) {
      logger.error('Error getting competition categories:', error);
      throw new HttpsError('internal', 'Failed to get competition categories');
    }
  }
);

// ============================================================================
// GET REGIONAL LEADERBOARD
// ============================================================================

/**
 * Get regional-specific leaderboard
 */
export const getRegionalLeaderboard = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const { region, category, period } = request.data;

      if (!region || !category || !period) {
        throw new HttpsError(
          'invalid-argument',
          'Region, category, and period are required'
        );
      }

      const leaderboardId = `${region}_${category}_${period}`;

      const leaderboardDoc = await db
        .collection('regional_leaderboards')
        .doc(leaderboardId)
        .get();

      if (!leaderboardDoc.exists) {
        return {
          success: true,
          found: false,
          message: 'Regional leaderboard not available',
        };
      }

      const leaderboard = {
        ...leaderboardDoc.data(),
        leaderboardId: leaderboardDoc.id,
      };

      return {
        success: true,
        found: true,
        leaderboard,
      };
    } catch (error) {
      logger.error('Error getting regional leaderboard:', error);
      throw new HttpsError('internal', 'Failed to get regional leaderboard');
    }
  }
);

// ============================================================================
// GET USER NOTIFICATIONS
// ============================================================================

/**
 * Get user's leaderboard notifications (ego-safe, positive only)
 */
export const getLeaderboardNotifications = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { limit: queryLimit, unreadOnly } = request.data;

      const notificationLimit = queryLimit && queryLimit <= 50 ? queryLimit : 20;

      let query = db
        .collection('users')
        .doc(userId)
        .collection('leaderboard_notifications')
        .orderBy('createdAt', 'desc')
        .limit(notificationLimit);

      // Filter by unread if requested
      if (unreadOnly) {
        query = query.where('read', '==', false) as any;
      }

      const snapshot = await query.get();

      const notifications = snapshot.docs.map((doc) => ({
        ...doc.data(),
        notificationId: doc.id,
      }));

      return {
        success: true,
        notifications,
        count: notifications.length,
      };
    } catch (error) {
      logger.error('Error getting leaderboard notifications:', error);
      throw new HttpsError('internal', 'Failed to get notifications');
    }
  }
);

// ============================================================================
// MARK NOTIFICATION AS READ
// ============================================================================

/**
 * Mark a leaderboard notification as read
 */
export const markNotificationRead = onCall(
  {
    memory: '256MiB',
  },
  async (request) => {
    try {
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { notificationId } = request.data;

      if (!notificationId) {
        throw new HttpsError('invalid-argument', 'Notification ID required');
      }

      await db
        .collection('users')
        .doc(userId)
        .collection('leaderboard_notifications')
        .doc(notificationId)
        .update({
          read: true,
          readAt: new Date(),
        });

      return {
        success: true,
        message: 'Notification marked as read',
      };
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw new HttpsError('internal', 'Failed to mark notification as read');
    }
  }
);