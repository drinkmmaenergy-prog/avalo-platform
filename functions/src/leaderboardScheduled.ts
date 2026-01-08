/**
 * PACK 216: Creator Competition Engine
 * Scheduled functions for weekly reset and monthly summary
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { weeklyReset, monthlyReset } from './leaderboardEngine';

// ============================================================================
// WEEKLY RESET - Every Sunday at 23:59 UTC
// ============================================================================

/**
 * Weekly leaderboard reset
 * Runs every Sunday at 23:59 UTC
 * - Computes weekly metrics for all users
 * - Calculates rankings for all categories
 * - Distributes visibility rewards to top performers
 * - Sends ego-safe positive notifications
 */
export const weeklyLeaderboardReset = onSchedule(
  {
    schedule: '59 23 * * 0', // Every Sunday at 23:59 UTC
    timeZone: 'UTC',
    memory: '1GiB',
    timeoutSeconds: 540, // 9 minutes
    retryCount: 2,
  },
  async (event) => {
    logger.info('=== WEEKLY LEADERBOARD RESET TRIGGERED ===');
    logger.info(`Execution time: ${new Date().toISOString()}`);
    
    try {
      const startTime = Date.now();
      
      await weeklyReset();
      
      const duration = Date.now() - startTime;
      logger.info(`=== WEEKLY RESET COMPLETE ===`);
      logger.info(`Duration: ${duration}ms (${Math.round(duration / 1000)}s)`);
    } catch (error) {
      logger.error('Weekly reset failed:', error);
      throw error; // Retry will be triggered
    }
  }
);

// ============================================================================
// MONTHLY SUMMARY - 1st day of each month at 00:00 UTC
// ============================================================================

/**
 * Monthly leaderboard summary
 * Runs on the 1st day of each month at 00:00 UTC
 * - Calculates monthly rankings for all categories
 * - Publishes monthly summaries with top performers
 * - Computes month-over-month growth statistics
 * - Archives previous month's data
 */
export const monthlyLeaderboardSummary = onSchedule(
  {
    schedule: '0 0 1 * *', // 1st day of month at 00:00 UTC
    timeZone: 'UTC',
    memory: '2GiB',
    timeoutSeconds: 540, // 9 minutes
    retryCount: 2,
  },
  async (event) => {
    logger.info('=== MONTHLY LEADERBOARD SUMMARY TRIGGERED ===');
    logger.info(`Execution time: ${new Date().toISOString()}`);
    
    try {
      const startTime = Date.now();
      
      await monthlyReset();
      
      const duration = Date.now() - startTime;
      logger.info(`=== MONTHLY SUMMARY COMPLETE ===`);
      logger.info(`Duration: ${duration}ms (${Math.round(duration / 1000)}s)`);
    } catch (error) {
      logger.error('Monthly summary failed:', error);
      throw error; // Retry will be triggered
    }
  }
);

// ============================================================================
// HOURLY CLEANUP - Expire old rewards and rankings
// ============================================================================

/**
 * Hourly cleanup
 * Runs every hour at :00
 * - Deactivates expired visibility rewards
 * - Deactivates expired badges
 * - Expires old rankings
 */
export const hourlyLeaderboardCleanup = onSchedule(
  {
    schedule: '0 * * * *', // Every hour at :00
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 300, // 5 minutes
    retryCount: 1,
  },
  async (event) => {
    logger.info('Running hourly leaderboard cleanup...');
    
    try {
      const { db, serverTimestamp } = await import('./init');
      const { Timestamp } = await import('firebase-admin/firestore');
      
      const now = Timestamp.now();
      let totalCleaned = 0;
      
      // Deactivate expired rewards
      const expiredRewardsSnapshot = await db
        .collection('visibility_rewards')
        .where('isActive', '==', true)
        .where('expiresAt', '<', now)
        .get();
      
      if (!expiredRewardsSnapshot.empty) {
        const batch = db.batch();
        expiredRewardsSnapshot.forEach((doc) => {
          batch.update(doc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp() as any,
          });
        });
        await batch.commit();
        totalCleaned += expiredRewardsSnapshot.size;
        logger.info(`Deactivated ${expiredRewardsSnapshot.size} expired rewards`);
      }
      
      // Deactivate expired badges
      const expiredBadgesSnapshot = await db
        .collection('leaderboard_badges')
        .where('isActive', '==', true)
        .where('expiresAt', '<', now)
        .get();
      
      if (!expiredBadgesSnapshot.empty) {
        const badgeBatch = db.batch();
        expiredBadgesSnapshot.forEach((doc) => {
          badgeBatch.update(doc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp() as any,
          });
        });
        await badgeBatch.commit();
        totalCleaned += expiredBadgesSnapshot.size;
        logger.info(`Deactivated ${expiredBadgesSnapshot.size} expired badges`);
      }
      
      // Expire old rankings
      const expiredRankingsSnapshot = await db
        .collection('leaderboard_rankings')
        .where('isActive', '==', true)
        .where('expiresAt', '<', now)
        .get();
      
      if (!expiredRankingsSnapshot.empty) {
        const rankingBatch = db.batch();
        expiredRankingsSnapshot.forEach((doc) => {
          rankingBatch.update(doc.ref, {
            isActive: false,
            updatedAt: serverTimestamp() as any,
          });
        });
        await rankingBatch.commit();
        totalCleaned += expiredRankingsSnapshot.size;
        logger.info(`Expired ${expiredRankingsSnapshot.size} old rankings`);
      }
      
      logger.info(`Hourly cleanup complete. Total items cleaned: ${totalCleaned}`);
    } catch (error) {
      logger.error('Hourly cleanup failed:', error);
      // Don't throw - cleanup failures shouldn't block system
    }
  }
);

// ============================================================================
// MANUAL TRIGGER ENDPOINTS (for testing and admin control)
// ============================================================================

import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Manual weekly reset trigger (admin only)
 */
export const triggerWeeklyReset = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    // Check authentication and admin role
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { db } = await import('./init');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    logger.info(`Manual weekly reset triggered by user: ${request.auth.uid}`);
    
    try {
      await weeklyReset();
      return {
        success: true,
        message: 'Weekly reset completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Manual weekly reset failed:', error);
      throw new HttpsError('internal', 'Weekly reset failed');
    }
  }
);

/**
 * Manual monthly summary trigger (admin only)
 */
export const triggerMonthlySummary = onCall(
  {
    memory: '2GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    // Check authentication and admin role
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { db } = await import('./init');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    logger.info(`Manual monthly summary triggered by user: ${request.auth.uid}`);
    
    try {
      await monthlyReset();
      return {
        success: true,
        message: 'Monthly summary completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Manual monthly summary failed:', error);
      throw new HttpsError('internal', 'Monthly summary failed');
    }
  }
);