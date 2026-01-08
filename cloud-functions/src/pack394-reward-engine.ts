/**
 * PACK 394 — Viral Growth Engine
 * Reward Logic (Anti-Fraud Safe)
 * 
 * Handles referral rewards with fraud protection
 * Rewards unlock ONLY after invitee completes verification milestones
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';

const db = admin.firestore();

export enum RewardType {
  TOKENS = 'tokens',
  SUBSCRIPTION_DAYS = 'subscription_days',
  PRIORITY_BOOST = 'priority_boost',
  ROYAL_TRIAL = 'royal_trial',
  DISCOVERY_BOOST = 'discovery_boost',
}

export enum RewardStatus {
  PENDING = 'pending',
  LOCKED = 'locked',
  EARNED = 'earned',
  CLAIMED = 'claimed',
  FRAUD_BLOCKED = 'fraud_blocked',
  EXPIRED = 'expired',
}

interface RewardConfig {
  type: RewardType;
  value: number;
  requiresVerification: boolean;
  requiresPhotos: number;
  requiresFirstChat: boolean;
  requiresFirstPurchase: boolean;
  expiresInDays?: number;
}

interface ReferralReward {
  rewardId: string;
  inviterId: string;
  inviteeId: string;
  linkId: string;
  type: RewardType;
  value: number;
  status: RewardStatus;
  progress: {
    registered: boolean;
    verified18: boolean;
    minPhotos: boolean;
    firstChat: boolean;
    firstPurchase: boolean;
  };
  createdAt: Date;
  earnedAt?: Date;
  claimedAt?: Date;
  expiresAt?: Date;
  fraudCheckPassed?: boolean;
  metadata: {
    inviteeRetentionDays?: number;
    inviteeChurnRisk?: number;
  };
}

// Default reward configurations
const REWARD_CONFIGS: Record<string, RewardConfig> = {
  standard: {
    type: RewardType.TOKENS,
    value: 100,
    requiresVerification: true,
    requiresPhotos: 3,
    requiresFirstChat: true,
    requiresFirstPurchase: false,
    expiresInDays: 30,
  },
  premium: {
    type: RewardType.TOKENS,
    value: 500,
    requiresVerification: true,
    requiresPhotos: 3,
    requiresFirstChat: true,
    requiresFirstPurchase: true,
    expiresInDays: 30,
  },
  subscription: {
    type: RewardType.SUBSCRIPTION_DAYS,
    value: 7,
    requiresVerification: true,
    requiresPhotos: 3,
    requiresFirstChat: true,
    requiresFirstPurchase: true,
    expiresInDays: 30,
  },
  boost: {
    type: RewardType.PRIORITY_BOOST,
    value: 24, // hours
    requiresVerification: true,
    requiresPhotos: 3,
    requiresFirstChat: false,
    requiresFirstPurchase: false,
    expiresInDays: 7,
  },
};

/**
 * Initialize Referral Reward
 * Creates a reward entry when a user is referred
 */
export const initializeReferralReward = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();

    // Check if user was referred
    if (!userData.referral?.inviterId || !userData.referral?.linkId) {
      return null;
    }

    const inviterId = userData.referral.inviterId;
    const linkId = userData.referral.linkId;

    try {
      // Get referrer information
      const inviterDoc = await db.collection('users').doc(inviterId).get();
      if (!inviterDoc.exists) {
        functions.logger.warn(`Inviter ${inviterId} not found`);
        return null;
      }

      // Determine reward config based on inviter tier
      const inviterData = inviterDoc.data();
      const rewardConfigKey = inviterData?.creator?.verified ? 'premium' : 'standard';
      const rewardConfig = REWARD_CONFIGS[rewardConfigKey];

      // Create reward
      const rewardId = nanoid(16);
      const expiresAt = rewardConfig.expiresInDays
        ? new Date(Date.now() + rewardConfig.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      const reward: ReferralReward = {
        rewardId,
        inviterId,
        inviteeId: userId,
        linkId,
        type: rewardConfig.type,
        value: rewardConfig.value,
        status: RewardStatus.LOCKED,
        progress: {
          registered: true,
          verified18: false,
          minPhotos: false,
          firstChat: false,
          firstPurchase: false,
        },
        createdAt: new Date(),
        expiresAt,
        fraudCheckPassed: false,
        metadata: {},
      };

      await db.collection('referralRewards').doc(rewardId).set(reward);

      functions.logger.info(`Referral reward initialized: ${rewardId} for inviter ${inviterId}`);

      return null;
    } catch (error) {
      functions.logger.error('Error initializing referral reward:', error);
      return null;
    }
  });

/**
 * Update Reward Progress
 * Checks and updates reward progress when invitee completes milestones
 */
export const updateRewardProgress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { milestone } = data;

  try {
    // Find pending rewards for this invitee
    const rewardsSnapshot = await db.collection('referralRewards')
      .where('inviteeId', '==', userId)
      .where('status', 'in', [RewardStatus.LOCKED, RewardStatus.PENDING])
      .get();

    if (rewardsSnapshot.empty) {
      return { success: true, message: 'No pending rewards' };
    }

    const batch = db.batch();
    const rewardsToCheck: string[] = [];

    for (const rewardDoc of rewardsSnapshot.docs) {
      const reward = rewardDoc.data() as ReferralReward;
      const updates: any = {};

      // Update progress based on milestone
      switch (milestone) {
        case 'verified18':
          updates['progress.verified18'] = true;
          break;
        case 'minPhotos':
          updates['progress.minPhotos'] = true;
          break;
        case 'firstChat':
          updates['progress.firstChat'] = true;
          break;
        case 'firstPurchase':
          updates['progress.firstPurchase'] = true;
          break;
      }

      if (Object.keys(updates).length > 0) {
        batch.update(rewardDoc.ref, updates);
        rewardsToCheck.push(rewardDoc.id);
      }
    }

    await batch.commit();

    // Check each reward for completion
    for (const rewardId of rewardsToCheck) {
      await checkRewardCompletion(rewardId);
    }

    functions.logger.info(`Reward progress updated for user ${userId}: ${milestone}`);

    return {
      success: true,
      rewardsUpdated: rewardsToCheck.length,
    };
  } catch (error: any) {
    functions.logger.error('Error updating reward progress:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check Reward Completion
 * Verifies if all requirements are met and earns the reward
 */
async function checkRewardCompletion(rewardId: string): Promise<void> {
  const rewardDoc = await db.collection('referralRewards').doc(rewardId).get();
  if (!rewardDoc.exists) return;

  const reward = rewardDoc.data() as ReferralReward;

  // Check if expired
  if (reward.expiresAt && reward.expiresAt < new Date()) {
    await rewardDoc.ref.update({
      status: RewardStatus.EXPIRED,
    });
    return;
  }

  // Get reward config
  const rewardConfig = Object.values(REWARD_CONFIGS).find(
    c => c.type === reward.type && c.value === reward.value
  );
  if (!rewardConfig) return;

  // Check all requirements
  const allRequirementsMet =
    (!rewardConfig.requiresVerification || reward.progress.verified18) &&
    (!rewardConfig.requiresPhotos || reward.progress.minPhotos) &&
    (!rewardConfig.requiresFirstChat || reward.progress.firstChat) &&
    (!rewardConfig.requiresFirstPurchase || reward.progress.firstPurchase);

  if (!allRequirementsMet) return;

  // Run fraud check (integrates with PACK 302)
  const fraudCheckPassed = await runFraudCheck(reward);

  if (!fraudCheckPassed) {
    await rewardDoc.ref.update({
      status: RewardStatus.FRAUD_BLOCKED,
      fraudCheckPassed: false,
    });

    // Create abuse flag
    await db.collection('referralAbuseFlags').add({
      rewardId,
      inviterId: reward.inviterId,
      inviteeId: reward.inviteeId,
      reason: 'fraud_check_failed',
      timestamp: new Date(),
    });

    functions.logger.warn(`Reward ${rewardId} blocked due to fraud check`);
    return;
  }

  // Mark reward as earned
  await rewardDoc.ref.update({
    status: RewardStatus.EARNED,
    earnedAt: new Date(),
    fraudCheckPassed: true,
  });

  // Notify inviter
  await db.collection('notifications').add({
    userId: reward.inviterId,
    type: 'referral_reward_earned',
    title: 'Referral Reward Earned!',
    body: `You've earned a reward for inviting a friend!`,
    data: {
      rewardId,
      type: reward.type,
      value: reward.value,
    },
    read: false,
    createdAt: new Date(),
  });

  functions.logger.info(`Reward ${rewardId} earned for inviter ${reward.inviterId}`);
}

/**
 * Claim Reward
 * User claims their earned reward
 */
export const claimReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { rewardId } = data;

  try {
    const rewardDoc = await db.collection('referralRewards').doc(rewardId).get();
    if (!rewardDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Reward not found');
    }

    const reward = rewardDoc.data() as ReferralReward;

    // Verify ownership
    if (reward.inviterId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your reward');
    }

    // Check status
    if (reward.status !== RewardStatus.EARNED) {
      throw new functions.https.HttpsError('failed-precondition', 'Reward not earned yet');
    }

    // Apply reward based on type
    const userRef = db.collection('users').doc(userId);

    switch (reward.type) {
      case RewardType.TOKENS:
        await userRef.update({
          tokensBalance: admin.firestore.FieldValue.increment(reward.value),
        });
        break;

      case RewardType.SUBSCRIPTION_DAYS:
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        const currentExpiry = userData?.subscription?.expiresAt?.toDate() || new Date();
        const newExpiry = new Date(
          Math.max(currentExpiry.getTime(), Date.now()) + reward.value * 24 * 60 * 60 * 1000
        );
        await userRef.update({
          'subscription.expiresAt': newExpiry,
          'subscription.active': true,
        });
        break;

      case RewardType.PRIORITY_BOOST:
        await userRef.update({
          'boosts.priorityDiscovery': {
            active: true,
            expiresAt: new Date(Date.now() + reward.value * 60 * 60 * 1000),
          },
        });
        break;

      case RewardType.ROYAL_TRIAL:
        await userRef.update({
          'royalClub.trialActive': true,
          'royalClub.trialExpiresAt': new Date(Date.now() + reward.value * 24 * 60 * 60 * 1000),
        });
        break;
    }

    // Update reward status
    await rewardDoc.ref.update({
      status: RewardStatus.CLAIMED,
      claimedAt: new Date(),
    });

    functions.logger.info(`Reward ${rewardId} claimed by user ${userId}`);

    return {
      success: true,
      reward,
    };
  } catch (error: any) {
    functions.logger.error('Error claiming reward:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get User Rewards
 * Returns all rewards for a user
 */
export const getUserRewards = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const rewardsSnapshot = await db.collection('referralRewards')
      .where('inviterId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const rewards = rewardsSnapshot.docs.map(doc => doc.data());

    const summary = {
      total: rewards.length,
      earned: rewards.filter(r => r.status === RewardStatus.EARNED).length,
      claimed: rewards.filter(r => r.status === RewardStatus.CLAIMED).length,
      pending: rewards.filter(r => r.status === RewardStatus.LOCKED).length,
      blocked: rewards.filter(r => r.status === RewardStatus.FRAUD_BLOCKED).length,
      totalValue: rewards
        .filter(r => r.status === RewardStatus.CLAIMED)
        .reduce((sum, r) => sum + (r.type === RewardType.TOKENS ? r.value : 0), 0),
    };

    return {
      success: true,
      rewards,
      summary,
    };
  } catch (error: any) {
    functions.logger.error('Error getting user rewards:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Fraud Check (integrates with PACK 302)
 * Returns true if invitee passes fraud checks
 */
async function runFraudCheck(reward: ReferralReward): Promise<boolean> {
  try {
    // Get invitee data
    const inviteeDoc = await db.collection('users').doc(reward.inviteeId).get();
    if (!inviteeDoc.exists) return false;

    const inviteeData = inviteeDoc.data();

    // Check 1: Real device (no emulator)
    if (inviteeData?.deviceInfo?.isEmulator) {
      functions.logger.warn(`Fraud check failed: emulator detected for ${reward.inviteeId}`);
      return false;
    }

    // Check 2: No self-invite
    if (reward.inviterId === reward.inviteeId) {
      functions.logger.warn(`Fraud check failed: self-invite detected`);
      return false;
    }

    // Check 3: Check for device hash collision
    const deviceHash = inviteeData?.deviceInfo?.deviceHash;
    if (deviceHash) {
      const sameDeviceSnapshot = await db.collection('users')
        .where('deviceInfo.deviceHash', '==', deviceHash)
        .limit(2)
        .get();

      if (sameDeviceSnapshot.size > 1) {
        functions.logger.warn(`Fraud check failed: device hash collision for ${reward.inviteeId}`);
        return false;
      }
    }

    // Check 4: Retention check (call PACK 301)
    const retentionDays = inviteeData?.analytics?.retentionDays || 0;
    if (retentionDays < 1) {
      functions.logger.warn(`Fraud check failed: low retention for ${reward.inviteeId}`);
      return false;
    }

    // Check 5: Call PACK 302 fraud detection
    const fraudScore = inviteeData?.security?.fraudScore || 0;
    if (fraudScore > 70) {
      functions.logger.warn(`Fraud check failed: high fraud score (${fraudScore}) for ${reward.inviteeId}`);
      return false;
    }

    return true;
  } catch (error) {
    functions.logger.error('Error in fraud check:', error);
    return false;
  }
}

/**
 * Scheduled function to expire old rewards
 */
export const expireOldRewards = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = new Date();
    
    const expiredRewardsSnapshot = await db.collection('referralRewards')
      .where('status', 'in', [RewardStatus.LOCKED, RewardStatus.EARNED])
      .where('expiresAt', '<', now)
      .get();

    const batch = db.batch();
    expiredRewardsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { status: RewardStatus.EXPIRED });
    });

    await batch.commit();

    functions.logger.info(`Expired ${expiredRewardsSnapshot.size} old rewards`);
    
    return null;
  });
