/**
 * PACK 264: TOP SUPPORTERS & VIP RANKINGS
 * Spender Retention Engine - Core Logic
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  SupporterRank,
  SupporterRanking,
  LifetimeBadge,
  TokenSpendingEvent,
  RankChangeNotification,
  LifetimeArchiveBadge,
  SupporterPerks,
  LIFETIME_BADGE_THRESHOLDS,
  PERK_MAPPINGS,
} from './pack264-supporters-types';

/**
 * Process token spending event and update supporter rankings
 */
export const processTokenSpending = async (event: TokenSpendingEvent): Promise<void> => {
  const { supporterId, creatorId, amount, type, transactionId } = event;

  // Get or create supporter ranking
  const supporterRef = db
    .collection('creatorSupporters')
    .doc(creatorId)
    .collection('supporters')
    .doc(supporterId);

  const supporterDoc = await supporterRef.get();
  
  let ranking: SupporterRanking;
  
  if (!supporterDoc.exists) {
    // Create new supporter ranking
    ranking = {
      supporterId,
      creatorId,
      lifetimeTokensSpent: amount,
      monthlyTokensSpent: amount,
      currentRank: SupporterRank.SUPPORTER,
      previousRank: SupporterRank.NONE,
      rankPosition: 0,
      lifetimeBadge: LifetimeBadge.NONE,
      badges: {
        top1: false,
        top3: false,
        top10: false,
      },
      perks: PERK_MAPPINGS[SupporterRank.SUPPORTER] as SupporterPerks,
      stats: {
        totalGiftsSent: type === 'gift' ? 1 : 0,
        totalMessagesSpent: type === 'message' ? 1 : 0,
        totalCallsSpent: type === 'call' ? 1 : 0,
        totalPPVPurchased: type === 'ppv' ? 1 : 0,
        fanClubMember: type === 'fan_club',
        firstSupportDate: new Date(),
        lastSupportDate: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else {
    ranking = supporterDoc.data() as SupporterRanking;
    
    // Update spending amounts
    ranking.lifetimeTokensSpent += amount;
    ranking.monthlyTokensSpent += amount;
    
    // Update stats
    if (type === 'gift') ranking.stats.totalGiftsSent++;
    if (type === 'message') ranking.stats.totalMessagesSpent++;
    if (type === 'call') ranking.stats.totalCallsSpent++;
    if (type === 'ppv') ranking.stats.totalPPVPurchased++;
    if (type === 'fan_club') ranking.stats.fanClubMember = true;
    
    ranking.stats.lastSupportDate = new Date();
    ranking.updatedAt = new Date();
  }

  // Update lifetime badge
  const oldBadge = ranking.lifetimeBadge;
  ranking.lifetimeBadge = calculateLifetimeBadge(ranking.lifetimeTokensSpent);
  
  // Save ranking
  await supporterRef.set(ranking, { merge: true });

  // If badge upgraded, update lifetime archive
  if (ranking.lifetimeBadge !== oldBadge) {
    await updateLifetimeArchiveBadge(supporterId, ranking.lifetimeBadge, ranking.lifetimeTokensSpent);
  }

  // Recalculate rankings for this creator
  await recalculateRankings(creatorId);
};

/**
 * Calculate lifetime badge based on total tokens spent
 */
function calculateLifetimeBadge(totalTokens: number): LifetimeBadge {
  if (totalTokens >= LIFETIME_BADGE_THRESHOLDS[LifetimeBadge.DIAMOND]) {
    return LifetimeBadge.DIAMOND;
  }
  if (totalTokens >= LIFETIME_BADGE_THRESHOLDS[LifetimeBadge.PLATINUM]) {
    return LifetimeBadge.PLATINUM;
  }
  if (totalTokens >= LIFETIME_BADGE_THRESHOLDS[LifetimeBadge.GOLD]) {
    return LifetimeBadge.GOLD;
  }
  if (totalTokens >= LIFETIME_BADGE_THRESHOLDS[LifetimeBadge.SILVER]) {
    return LifetimeBadge.SILVER;
  }
  if (totalTokens >= LIFETIME_BADGE_THRESHOLDS[LifetimeBadge.BRONZE]) {
    return LifetimeBadge.BRONZE;
  }
  return LifetimeBadge.NONE;
}

/**
 * Update lifetime archive badge for supporter
 */
async function updateLifetimeArchiveBadge(
  userId: string,
  badge: LifetimeBadge,
  totalTokens: number
): Promise<void> {
  const badgeRef = db.collection('lifetimeArchiveBadges').doc(userId);
  const badgeDoc = await badgeRef.get();

  if (!badgeDoc.exists) {
    const newBadge: LifetimeArchiveBadge = {
      userId,
      badge,
      totalTokensSpent: totalTokens,
      unlockedAt: new Date(),
      milestones: {
        [badge]: new Date(),
      },
    };
    await badgeRef.set(newBadge);
  } else {
    const updates: any = {
      badge,
      totalTokensSpent: totalTokens,
      [`milestones.${badge}`]: Timestamp.now(),
    };
    await badgeRef.update(updates);
  }
}

/**
 * Recalculate rankings for a creator
 */
export const recalculateRankings = async (creatorId: string): Promise<void> => {
  // Get all supporters sorted by lifetime tokens spent
  const supportersSnapshot = await db
    .collection('creatorSupporters')
    .doc(creatorId)
    .collection('supporters')
    .orderBy('lifetimeTokensSpent', 'desc')
    .get();

  const batch = db.batch();
  let position = 1;

  for (const doc of supportersSnapshot.docs) {
    const ranking = doc.data() as SupporterRanking;
    const oldRank = ranking.currentRank;

    // Determine new rank based on position
    let newRank: SupporterRank;
    if (position === 1) {
      newRank = SupporterRank.TOP_1;
    } else if (position >= 2 && position <= 3) {
      newRank = SupporterRank.TOP_3;
    } else if (position >= 4 && position <= 10) {
      newRank = SupporterRank.TOP_10;
    } else {
      newRank = SupporterRank.SUPPORTER;
    }

    // Update ranking if changed
    if (oldRank !== newRank || ranking.rankPosition !== position) {
      const updates: any = {
        previousRank: oldRank,
        currentRank: newRank,
        rankPosition: position,
        'badges.top1': newRank === SupporterRank.TOP_1,
        'badges.top3': newRank === SupporterRank.TOP_1 || newRank === SupporterRank.TOP_3,
        'badges.top10': newRank === SupporterRank.TOP_1 || newRank === SupporterRank.TOP_3 || newRank === SupporterRank.TOP_10,
        perks: PERK_MAPPINGS[newRank],
        updatedAt: serverTimestamp(),
      };

      batch.update(doc.ref, updates);

      // Send notification if rank changed
      if (oldRank !== newRank) {
        await sendRankChangeNotification(ranking, oldRank, newRank);
      }

      // Update active perks
      await updateSupporterPerks(creatorId, ranking.supporterId, ranking.perks);
    }

    position++;
  }

  await batch.commit();
  
  // Update creator analytics
  await updateCreatorAnalytics(creatorId, supportersSnapshot.docs.length);
};

/**
 * Send rank change notification
 */
async function sendRankChangeNotification(
  ranking: SupporterRanking,
  oldRank: SupporterRank,
  newRank: SupporterRank
): Promise<void> {
  // Get creator name
  const creatorDoc = await db.collection('users').doc(ranking.creatorId).get();
  const creatorName = creatorDoc.exists ? creatorDoc.data()?.displayName || 'Creator' : 'Creator';

  let message: string;
  let type: 'rank_up' | 'rank_down';

  if (getRankValue(newRank) > getRankValue(oldRank)) {
    type = 'rank_up';
    if (newRank === SupporterRank.TOP_1) {
      message = `You're now the TOP 1 supporter for ${creatorName} — impressive! 🔥`;
    } else if (newRank === SupporterRank.TOP_3) {
      message = `You're now in the TOP 3 supporters for ${creatorName} — impressive! 💎`;
    } else if (newRank === SupporterRank.TOP_10) {
      message = `You're now in the TOP 10 supporters for ${creatorName} — impressive! ⭐`;
    } else {
      message = `You're now a supporter for ${creatorName}!`;
    }
  } else {
    type = 'rank_down';
    message = `Your supporter rank for ${creatorName} has changed. Keep supporting to maintain your position!`;
  }

  const notification: RankChangeNotification = {
    id: `${ranking.supporterId}_${ranking.creatorId}_${Date.now()}`,
    userId: ranking.supporterId,
    creatorId: ranking.creatorId,
    creatorName,
    type,
    oldRank,
    newRank,
    message,
    read: false,
    createdAt: new Date(),
  };

  await db
    .collection('supporterNotifications')
    .doc(ranking.supporterId)
    .collection('queue')
    .doc(notification.id)
    .set(notification);

  // Send push notification (integrate with existing notification system)
  await sendPushNotification(ranking.supporterId, message);
}

/**
 * Get numeric value for rank comparison
 */
function getRankValue(rank: SupporterRank): number {
  const values = {
    [SupporterRank.NONE]: 0,
    [SupporterRank.SUPPORTER]: 1,
    [SupporterRank.TOP_10]: 2,
    [SupporterRank.TOP_3]: 3,
    [SupporterRank.TOP_1]: 4,
  };
  return values[rank];
}

/**
 * Update supporter perks
 */
async function updateSupporterPerks(
  creatorId: string,
  supporterId: string,
  perks: SupporterPerks
): Promise<void> {
  await db
    .collection('supporterPerks')
    .doc(creatorId)
    .collection('active')
    .doc(supporterId)
    .set({
      ...perks,
      updatedAt: new Date(),
    });
}

/**
 * Update creator analytics
 */
async function updateCreatorAnalytics(
  creatorId: string,
  totalSupporters: number
): Promise<void> {
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  
  await db
    .collection('creatorAnalytics')
    .doc(creatorId)
    .collection('supporters')
    .doc('stats')
    .set({
      period,
      totalSupporters,
      updatedAt: new Date(),
    }, { merge: true });
}

/**
 * Send push notification (placeholder - integrate with existing system)
 */
async function sendPushNotification(userId: string, message: string): Promise<void> {
  // Check notification preferences
  const profileDoc = await db.collection('supporterProfiles').doc(userId).get();
  if (!profileDoc.exists) return;
  
  const profile = profileDoc.data();
  if (!profile?.notificationPreferences?.rankChanges) return;

  // TODO: Integrate with existing push notification system
  console.log(`Sending push notification to ${userId}: ${message}`);
}

/**
 * Monthly reset - scheduled function
 */
export const monthlyRankingReset = onSchedule(
  {
    schedule: '0 0 1 * *', // First day of each month at midnight
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting monthly supporter ranking reset...');

    // Get all creators
    const creatorsSnapshot = await db.collection('creatorSupporters').get();

    for (const creatorDoc of creatorsSnapshot.docs) {
      const creatorId = creatorDoc.id;

      // Archive current month's rankings
      const currentPeriod = new Date().toISOString().slice(0, 7);
      const supportersSnapshot = await db
        .collection('creatorSupporters')
        .doc(creatorId)
        .collection('supporters')
        .get();

      const batch = db.batch();

      // Archive rankings
      for (const supporterDoc of supportersSnapshot.docs) {
        const ranking = supporterDoc.data() as SupporterRanking;
        
        // Save to monthly archive
        const archiveRef = db
          .collection('creatorSupporters')
          .doc(creatorId)
          .collection('monthlyRankings')
          .doc(currentPeriod)
          .collection('supporters')
          .doc(ranking.supporterId);
        
        batch.set(archiveRef, ranking);

        // Reset monthly tokens but keep lifetime
        batch.update(supporterDoc.ref, {
          monthlyTokensSpent: 0,
          updatedAt: new Date(),
        });
      }

      await batch.commit();

      // Send reset warning notifications (48 hours before)
      // This should be run 2 days before the actual reset
      await sendResetWarningNotifications(creatorId);
    }

    logger.info('Monthly supporter ranking reset complete');
  }
);

/**
 * Send reset warning notifications
 */
async function sendResetWarningNotifications(creatorId: string): Promise<void> {
  const supportersSnapshot = await db
    .collection('creatorSupporters')
    .doc(creatorId)
    .collection('supporters')
    .where('currentRank', 'in', [SupporterRank.TOP_1, SupporterRank.TOP_3, SupporterRank.TOP_10])
    .get();

  const creatorDoc = await db.collection('users').doc(creatorId).get();
  const creatorName = creatorDoc.exists ? creatorDoc.data()?.displayName || 'Creator' : 'Creator';

  for (const doc of supportersSnapshot.docs) {
    const ranking = doc.data() as SupporterRanking;
    
    const notification: RankChangeNotification = {
      id: `${ranking.supporterId}_reset_${Date.now()}`,
      userId: ranking.supporterId,
      creatorId,
      creatorName,
      type: 'reset_warning',
      oldRank: ranking.currentRank,
      newRank: ranking.currentRank,
      message: `Leaderboard resets in 48 hours — maintain your ${ranking.currentRank} rank for ${creatorName}!`,
      read: false,
      createdAt: new Date(),
    };

    await db
      .collection('supporterNotifications')
      .doc(ranking.supporterId)
      .collection('queue')
      .doc(notification.id)
      .set(notification);

    await sendPushNotification(ranking.supporterId, notification.message);
  }
}

/**
 * Check for near rank-up and send notifications
 */
export const checkNearRankup = async (
  supporterId: string,
  creatorId: string
): Promise<void> => {
  const supporterDoc = await db
    .collection('creatorSupporters')
    .doc(creatorId)
    .collection('supporters')
    .doc(supporterId)
    .get();

  if (!supporterDoc.exists) return;

  const ranking = supporterDoc.data() as SupporterRanking;
  const currentPosition = ranking.rankPosition;

  // Check if close to next rank
  let targetPosition: number | null = null;
  let targetRank: SupporterRank | null = null;

  if (currentPosition === 2 || currentPosition === 3) {
    targetPosition = 1;
    targetRank = SupporterRank.TOP_1;
  } else if (currentPosition >= 4 && currentPosition <= 10) {
    targetPosition = 2;
    targetRank = SupporterRank.TOP_3;
  } else if (currentPosition > 10) {
    targetPosition = 10;
    targetRank = SupporterRank.TOP_10;
  }

  if (targetPosition && targetRank) {
    // Get the supporter at target position
    const targetSnapshot = await db
      .collection('creatorSupporters')
      .doc(creatorId)
      .collection('supporters')
      .orderBy('lifetimeTokensSpent', 'desc')
      .limit(targetPosition)
      .get();

    if (targetSnapshot.docs.length >= targetPosition) {
      const targetDoc = targetSnapshot.docs[targetPosition - 1];
      const targetRanking = targetDoc.data() as SupporterRanking;
      const tokensNeeded = targetRanking.lifetimeTokensSpent - ranking.lifetimeTokensSpent;

      // If within 1000 tokens, send notification
      if (tokensNeeded > 0 && tokensNeeded <= 1000) {
        const creatorDoc = await db.collection('users').doc(creatorId).get();
        const creatorName = creatorDoc.exists ? creatorDoc.data()?.displayName || 'Creator' : 'Creator';

        const notification: RankChangeNotification = {
          id: `${supporterId}_near_${Date.now()}`,
          userId: supporterId,
          creatorId,
          creatorName,
          type: 'near_rankup',
          oldRank: ranking.currentRank,
          newRank: targetRank,
          tokensNeeded,
          message: `Only ${tokensNeeded} tokens left to reach ${targetRank} for ${creatorName}!`,
          read: false,
          createdAt: new Date(),
        };

        await db
          .collection('supporterNotifications')
          .doc(supporterId)
          .collection('queue')
          .doc(notification.id)
          .set(notification);

        await sendPushNotification(supporterId, notification.message);
      }
    }
  }
};