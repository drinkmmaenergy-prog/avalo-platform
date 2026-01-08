/**
 * PACK 264: TOP SUPPORTERS & VIP RANKINGS
 * Spender Retention Engine - API Endpoints
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  SupporterRank,
  SupporterRanking,
  TokenSpendingEvent,
  LeaderboardEntry,
  SupporterProfile,
} from './pack264-supporters-types';
import {
  processTokenSpending,
  recalculateRankings,
  checkNearRankup,
} from './pack264-supporters-engine';

/**
 * Get supporter ranking for a creator
 */
export const getSupporterRanking = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ ranking: SupporterRanking | null }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { creatorId } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Creator ID required');
    }

    try {
      const rankingDoc = await db
        .collection('creatorSupporters')
        .doc(creatorId)
        .collection('supporters')
        .doc(request.auth.uid)
        .get();

      if (!rankingDoc.exists) {
        return { ranking: null };
      }

      return { ranking: rankingDoc.data() as SupporterRanking };
    } catch (error: any) {
      logger.error('Error getting supporter ranking', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get supporter leaderboard for a creator
 */
export const getSupporterLeaderboard = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ leaderboard: LeaderboardEntry[] }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { creatorId, limit = 10 } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Creator ID required');
    }

    try {
      const rankingsSnapshot = await db
        .collection('creatorSupporters')
        .doc(creatorId)
        .collection('supporters')
        .orderBy('lifetimeTokensSpent', 'desc')
        .limit(limit)
        .get();

      const leaderboard: LeaderboardEntry[] = [];

      for (const doc of rankingsSnapshot.docs) {
        const ranking = doc.data() as SupporterRanking;

        // Get display name
        let displayName = 'Anonymous';
        if (!ranking.supporterId) continue;

        const profileDoc = await db
          .collection('supporterProfiles')
          .doc(ranking.supporterId)
          .get();

        let anonymousMode = false;
        if (profileDoc.exists) {
          const profile = profileDoc.data() as SupporterProfile;
          anonymousMode = profile.anonymousMode || false;
        }

        if (!anonymousMode) {
          const userDoc = await db.collection('users').doc(ranking.supporterId).get();
          if (userDoc.exists) {
            displayName = userDoc.data()?.displayName || 'Anonymous';
          }
        }

        const badges: string[] = [];
        if (ranking.badges.top1) badges.push('🔥 TOP 1');
        if (ranking.badges.top3) badges.push('💎 TOP 3');
        if (ranking.badges.top10) badges.push('⭐ TOP 10');
        if (ranking.lifetimeBadge !== 'none') {
          badges.push(`${ranking.lifetimeBadge.toUpperCase()} Badge`);
        }

        leaderboard.push({
          position: ranking.rankPosition,
          displayName,
          rank: ranking.currentRank,
          lifetimeBadge: ranking.lifetimeBadge,
          anonymousMode,
          badges,
        });
      }

      return { leaderboard };
    } catch (error: any) {
      logger.error('Error getting leaderboard', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update supporter profile settings
 */
export const updateSupporterProfile = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { anonymousMode, notificationPreferences } = request.data;

    try {
      const profileRef = db.collection('supporterProfiles').doc(request.auth.uid);
      const profileDoc = await profileRef.get();

      const updates: any = {
        updatedAt: serverTimestamp(),
      };

      if (typeof anonymousMode === 'boolean') {
        updates.anonymousMode = anonymousMode;
      }

      if (notificationPreferences) {
        updates.notificationPreferences = notificationPreferences;
      }

      if (!profileDoc.exists) {
        // Create new profile
        const profile: SupporterProfile = {
          userId: request.auth.uid,
          anonymousMode: anonymousMode || false,
          notificationPreferences: notificationPreferences || {
            rankChanges: true,
            nearRankup: true,
            creatorLive: true,
            monthlyReset: true,
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await profileRef.set(profile);
      } else {
        await profileRef.update(updates);
      }

      logger.info('Supporter profile updated', { userId: request.auth.uid });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating supporter profile', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get supporter notifications
 */
export const getSupporterNotifications = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ notifications: any[]; unreadCount: number }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { limit = 20 } = request.data;

    try {
      const notificationsSnapshot = await db
        .collection('supporterNotifications')
        .doc(request.auth.uid)
        .collection('queue')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const notifications: any[] = [];
      let unreadCount = 0;

      notificationsSnapshot.docs.forEach((doc) => {
        const notification = doc.data();
        notifications.push({ id: doc.id, ...notification });
        if (!notification.read) unreadCount++;
      });

      return { notifications, unreadCount };
    } catch (error: any) {
      logger.error('Error getting notifications', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Mark notification as read
 */
export const markNotificationRead = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { notificationId } = request.data;

    if (!notificationId) {
      throw new HttpsError('invalid-argument', 'Notification ID required');
    }

    try {
      await db
        .collection('supporterNotifications')
        .doc(request.auth.uid)
        .collection('queue')
        .doc(notificationId)
        .update({
          read: true,
        });

      return { success: true };
    } catch (error: any) {
      logger.error('Error marking notification as read', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get creator supporter analytics
 */
export const getCreatorSupporterAnalytics = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ analytics: any }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    try {
      // Verify user is the creator
      const userDoc = await db.collection('users').doc(request.auth.uid).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const analyticsDoc = await db
        .collection('creatorAnalytics')
        .doc(request.auth.uid)
        .collection('supporters')
        .doc('stats')
        .get();

      if (!analyticsDoc.exists) {
        return { analytics: null };
      }

      return { analytics: analyticsDoc.data() };
    } catch (error: any) {
      logger.error('Error getting creator analytics', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Trigger: Process token spending and update rankings
 * Listens to transaction events from payment system
 */
export const onTokenSpending = onDocumentCreated(
  {
    document: 'transactions/{transactionId}',
    region: 'europe-west3',
  },
  async (event) => {
    const transaction = event.data?.data();
    if (!transaction) return;

    // Only process completed transactions
    if (transaction.status !== 'completed') return;

    // Only process token spending (not token purchases)
    if (!transaction.recipientId || !transaction.senderId) return;

    try {
      const tokenEvent: TokenSpendingEvent = {
        supporterId: transaction.senderId,
        creatorId: transaction.recipientId,
        amount: transaction.amount,
        type: determineSpendingType(transaction.metadata?.type),
        transactionId: event.params.transactionId,
        timestamp: transaction.createdAt || Timestamp.now(),
      };

      await processTokenSpending(tokenEvent);

      // Check if supporter is near rank-up
      await checkNearRankup(tokenEvent.supporterId, tokenEvent.creatorId);

      logger.info('Token spending processed', {
        supporterId: tokenEvent.supporterId,
        creatorId: tokenEvent.creatorId,
        amount: tokenEvent.amount,
      });
    } catch (error: any) {
      logger.error('Error processing token spending', error);
    }
  }
);

/**
 * Determine spending type from transaction metadata
 */
function determineSpendingType(type?: string): 'gift' | 'message' | 'call' | 'ppv' | 'fan_club' {
  if (!type) return 'gift';

  switch (type.toLowerCase()) {
    case 'message':
    case 'dm':
      return 'message';
    case 'call':
    case 'video_call':
    case 'audio_call':
      return 'call';
    case 'ppv':
    case 'content':
      return 'ppv';
    case 'fan_club':
    case 'subscription':
      return 'fan_club';
    case 'gift':
    case 'tip':
    default:
      return 'gift';
  }
}

/**
 * Manual recalculation endpoint (admin only)
 */
export const recalculateSupporterRankings = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { creatorId } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Creator ID required');
    }

    try {
      // Verify user has admin permissions or is the creator
      const userDoc = await db.collection('users').doc(request.auth.uid).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const isAdmin = userData?.role === 'admin' || userData?.role === 'superadmin';
      const isCreator = request.auth.uid === creatorId;

      if (!isAdmin && !isCreator) {
        throw new HttpsError('permission-denied', 'Insufficient permissions');
      }

      await recalculateRankings(creatorId);

      logger.info('Supporter rankings recalculated', { creatorId });

      return { success: true };
    } catch (error: any) {
      logger.error('Error recalculating rankings', error);
      throw new HttpsError('internal', error.message);
    }
  }
);