/**
 * PACK 394 — Viral Growth Engine
 * Creator Viral Boost Engine
 * 
 * Boosts creator visibility based on referral performance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface CreatorBoostScore {
  userId: string;
  verifiedInvites: number;
  payingConversions: number;
  lowChurnRate: number; // percentage
  totalScore: number;
  rank: number;
  lastUpdated: Date;
  badges: string[];
}

export interface CreatorInvitePerformance {
  userId: string;
  period: string; // e.g., "2024-01"
  totalInvites: number;
  verifiedInvites: number;
  payingUsers: number;
  totalRevenue: number;
  avgRetentionDays: number;
  churnRate: number;
  conversionRate: number;
  boosts: {
    discoveryRanking: number;
    feedVisibility: number;
    profileHighlight: boolean;
  };
}

/**
 * Calculate Creator Boost Score
 * Runs periodically to update creator rankings
 */
export const calculateCreatorBoostScores = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    functions.logger.info('Starting creator boost score calculation');

    try {
      // Get all creators
      const creatorsSnapshot = await db.collection('users')
        .where('creator.verified', '==', true)
        .get();

      const creatorScores: CreatorBoostScore[] = [];

      for (const creatorDoc of creatorsSnapshot.docs) {
        const creatorId = creatorDoc.id;
        const score = await calculateSingleCreatorScore(creatorId);
        if (score) {
          creatorScores.push(score);
        }
      }

      // Sort by score
      creatorScores.sort((a, b) => b.totalScore - a.totalScore);

      // Assign ranks
      creatorScores.forEach((score, index) => {
        score.rank = index + 1;
      });

      // Save scores
      const batch = db.batch();
      creatorScores.forEach(score => {
        const ref = db.collection('creatorBoostScores').doc(score.userId);
        batch.set(ref, score);
      });
      await batch.commit();

      // Apply boosts
      await applyCreatorBoosts(creatorScores);

      functions.logger.info(`Calculated boost scores for ${creatorScores.length} creators`);
      return null;
    } catch (error) {
      functions.logger.error('Error calculating creator boost scores:', error);
      return null;
    }
  });

/**
 * Calculate score for a single creator
 */
async function calculateSingleCreatorScore(creatorId: string): Promise<CreatorBoostScore | null> {
  try {
    // Get referral events for this creator
    const eventsSnapshot = await db.collection('referralEvents')
      .where('inviterId', '==', creatorId)
      .where('timestamp', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    const events = eventsSnapshot.docs.map(doc => doc.data());

    // Count verified invites
    const verifiedInvites = events.filter(e => e.status === 'verified').length;

    // Count paying conversions
    const payingConversions = events.filter(e => e.status === 'first_purchase').length;

    // Calculate churn rate
    const inviteeIds = [...new Set(events.map(e => e.inviteeId).filter(Boolean))];
    let activeInvitees = 0;

    for (const inviteeId of inviteeIds) {
      const inviteeDoc = await db.collection('users').doc(inviteeId as string).get();
      const inviteeData = inviteeDoc.data();
      
      // Consider active if logged in within last 7 days
      const lastActiveAt = inviteeData?.lastActiveAt?.toDate();
      if (lastActiveAt && (Date.now() - lastActiveAt.getTime()) < 7 * 24 * 60 * 60 * 1000) {
        activeInvitees++;
      }
    }

    const lowChurnRate = inviteeIds.length > 0 
      ? (activeInvitees / inviteeIds.length) * 100 
      : 0;

    // Calculate total score (weighted formula)
    const totalScore = 
      (verifiedInvites * 10) +
      (payingConversions * 100) +
      (lowChurnRate * 5);

    // Determine badges
    const badges: string[] = [];
    if (verifiedInvites >= 100) badges.push('TOP_INVITER');
    if (payingConversions >= 50) badges.push('REVENUE_CHAMPION');
    if (lowChurnRate >= 80) badges.push('RETENTION_MASTER');

    return {
      userId: creatorId,
      verifiedInvites,
      payingConversions,
      lowChurnRate,
      totalScore,
      rank: 0, // Will be assigned later
      lastUpdated: new Date(),
      badges,
    };
  } catch (error) {
    functions.logger.error(`Error calculating score for creator ${creatorId}:`, error);
    return null;
  }
}

/**
 * Apply Creator Boosts
 * Grants visibility boosts to top performers
 */
async function applyCreatorBoosts(scores: CreatorBoostScore[]): Promise<void> {
  const batch = db.batch();

  scores.forEach((score, index) => {
    let discoveryBoost = 1.0;
    let feedBoost = 1.0;
    let profileHighlight = false;

    // Top 10: Major boosts
    if (index < 10) {
      discoveryBoost = 3.0;
      feedBoost = 2.5;
      profileHighlight = true;
    }
    // Top 50: Medium boosts
    else if (index < 50) {
      discoveryBoost = 2.0;
      feedBoost = 1.8;
      profileHighlight = true;
    }
    // Top 100: Small boosts
    else if (index < 100) {
      discoveryBoost = 1.5;
      feedBoost = 1.3;
      profileHighlight = false;
    }

    const userRef = db.collection('users').doc(score.userId);
    batch.update(userRef, {
      'creator.viralBoosts': {
        discoveryRanking: discoveryBoost,
        feedVisibility: feedBoost,
        profileHighlight,
        badges: score.badges,
        rank: score.rank,
        lastUpdated: new Date(),
      },
    });
  });

  await batch.commit();
}

/**
 * Get Creator Leaderboard
 * Returns top performing creators
 */
export const getCreatorLeaderboard = functions.https.onCall(async (data, context) => {
  const { limit = 100 } = data;

  try {
    const scoresSnapshot = await db.collection('creatorBoostScores')
      .orderBy('totalScore', 'desc')
      .limit(limit)
      .get();

    const leaderboard = await Promise.all(
      scoresSnapshot.docs.map(async (doc) => {
        const score = doc.data() as CreatorBoostScore;
        
        // Get creator profile
        const creatorDoc = await db.collection('users').doc(score.userId).get();
        const creatorData = creatorDoc.data();

        return {
          ...score,
          name: creatorData?.name || 'Unknown',
          photo: creatorData?.photos?.[0]?.url || null,
          creatorProfile: {
            category: creatorData?.creator?.category,
            verified: creatorData?.creator?.verified,
          },
        };
      })
    );

    return {
      success: true,
      leaderboard,
    };
  } catch (error: any) {
    functions.logger.error('Error getting creator leaderboard:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Creator Performance Stats
 * Returns detailed performance metrics for a creator
 */
export const getCreatorPerformanceStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const creatorId = context.auth.uid;

  try {
    // Get boost score
    const scoreDoc = await db.collection('creatorBoostScores').doc(creatorId).get();
    const score = scoreDoc.exists ? scoreDoc.data() as CreatorBoostScore : null;

    // Get referral stats (last 30 days)
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const eventsSnapshot = await db.collection('referralEvents')
      .where('inviterId', '==', creatorId)
      .where('timestamp', '>=', startDate)
      .get();

    const events = eventsSnapshot.docs.map(doc => doc.data());

    // Calculate metrics
    const metrics = {
      totalInvites: events.length,
      verified: events.filter(e => e.status === 'verified').length,
      firstChats: events.filter(e => e.status === 'first_chat').length,
      firstPurchases: events.filter(e => e.status === 'first_purchase').length,
      conversionRate: 0,
      avgRevenuePerInvite: 0,
    };

    if (metrics.totalInvites > 0) {
      metrics.conversionRate = (metrics.firstPurchases / metrics.totalInvites) * 100;
    }

    // Get revenue data
    const rewardsSnapshot = await db.collection('referralRewards')
      .where('inviterId', '==', creatorId)
      .where('status', '==', 'claimed')
      .get();

    const totalRewardValue = rewardsSnapshot.docs.reduce((sum, doc) => {
      const reward = doc.data();
      return sum + (reward.type === 'tokens' ? reward.value : 0);
    }, 0);

    return {
      success: true,
      score,
      metrics,
      totalRewardValue,
    };
  } catch (error: any) {
    functions.logger.error('Error getting creator performance:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update Creator Invite Performance
 * Triggered when referral milestone reached
 */
export const updateCreatorInvitePerformance = functions.firestore
  .document('referralEvents/{eventId}')
  .onCreate(async (snap, context) => {
    const event = snap.data();
    const inviterId = event.inviterId;

    if (!inviterId) return null;

    try {
      // Check if user is a creator
      const userDoc = await db.collection('users').doc(inviterId).get();
      const userData = userDoc.data();

      if (!userData?.creator?.verified) return null;

      // Get current period (YYYY-MM)
      const period = new Date().toISOString().slice(0, 7);

      // Update or create performance record
      const perfRef = db.collection('creatorInvitePerformance')
        .doc(`${inviterId}_${period}`);

      const perfDoc = await perfRef.get();

      if (perfDoc.exists) {
        // Update existing
        await perfRef.update({
          totalInvites: admin.firestore.FieldValue.increment(1),
          lastUpdated: new Date(),
        });
      } else {
        // Create new
        const performance: CreatorInvitePerformance = {
          userId: inviterId,
          period,
          totalInvites: 1,
          verifiedInvites: 0,
          payingUsers: 0,
          totalRevenue: 0,
          avgRetentionDays: 0,
          churnRate: 0,
          conversionRate: 0,
          boosts: {
            discoveryRanking: 1.0,
            feedVisibility: 1.0,
            profileHighlight: false,
          },
        };
        await perfRef.set(performance);
      }

      functions.logger.info(`Updated creator performance for ${inviterId}`);
      return null;
    } catch (error) {
      functions.logger.error('Error updating creator performance:', error);
      return null;
    }
  });
