/**
 * PACK 368 — Viral Referral & Invite Engine
 * Core referral processing engine
 */

import { db, generateId, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Referral,
  ReferralProfile,
  ReferralStats,
  ReferralConfig,
  ReferralReward,
  ProcessReferralRequest,
  ValidateReferralRewardRequest,
  DistributeRewardRequest,
} from './pack368-referral-types';
import { ReferralFraudDetector } from './pack368-fraud-detection';
import { spendTokens, earnTokens } from './pack277-wallet-service';

const fraudDetector = new ReferralFraudDetector(db);

/**
 * Generate unique invite code for user
 */
export async function generateInviteCode(userId: string): Promise<{
  success: boolean;
  profile?: ReferralProfile;
  error?: string;
}> {
  try {
    // Check if user already has invite code
    const existingProfileQuery = await db
      .collection('users')
      .doc(userId)
      .collection('referralProfile')
      .limit(1)
      .get();

    if (!existingProfileQuery.empty) {
      return {
        success: true,
        profile: existingProfileQuery.docs[0].data() as ReferralProfile,
      };
    }

    // Generate unique code
    const inviteCode = generateUniqueCode(8);
    const inviteLink = `https://avalo.app/invite/${inviteCode}`;
    const qrInvitePayload = JSON.stringify({
      code: inviteCode,
      userId,
      type: 'referral',
    });

    const profile: ReferralProfile = {
      inviteCode,
      inviteLink,
      qrInvitePayload,
      totalReferrals: 0,
      successfulReferrals: 0,
      pendingReferrals: 0,
      referralPrivilegesRevoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db
      .collection('users')
      .doc(userId)
      .collection('referralProfile')
      .doc('main')
      .set(profile);

    // Initialize stats
    const stats: ReferralStats = {
      userId,
      totalInvitesSent: 0,
      totalReferralsCompleted: 0,
      totalRewardsEarned: 0,
      totalTokensEarned: 0,
      conversionRate: 0,
      fraudRejectionCount: 0,
      averageFraudScore: 0,
      referralStreak: 0,
      viralCoefficient: 0,
      lifetimeValue: 0,
      updatedAt: new Date(),
    };

    await db.collection('referralStats').doc(userId).set(stats);

    return { success: true, profile };
  } catch (error: any) {
    console.error('Generate invite code error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process new referral
 */
export async function processReferral(
  request: ProcessReferralRequest
): Promise<{
  success: boolean;
  referralId?: string;
  status?: Referral['status'];
  error?: string;
}> {
  const { inviteCode, newUserId, attributionSource, deviceData } = request;

  try {
    // Find inviter by code
    const inviterQuery = await db
      .collectionGroup('referralProfile')
      .where('inviteCode', '==', inviteCode)
      .limit(1)
      .get();

    if (inviterQuery.empty) {
      return { success: false, error: 'Invalid invite code' };
    }

    const inviterDoc = inviterQuery.docs[0];
    const inviterId = inviterDoc.ref.parent.parent!.id;

    // Check if user is trying to self-invite
    if (inviterId === newUserId) {
      return { success: false, error: 'Cannot invite yourself' };
    }

    // Check if referral already exists
    const existingReferral = await db
      .collection('referrals')
      .where('invitedUserId', '==', newUserId)
      .limit(1)
      .get();

    if (!existingReferral.empty) {
      return { success: false, error: 'User already referred' };
    }

    // Get referral config
    const config = await getReferralConfig();
    if (!config.enabled) {
      return { success: false, error: 'Referrals currently disabled' };
    }

    // Check inviter privileges
    const inviterProfileData = inviterDoc.data() as ReferralProfile;
    if (inviterProfileData.referralPrivilegesRevoked) {
      return {
        success: false,
        error: 'Inviter referral privileges revoked',
      };
    }

    // Create referral record
    const referralId = generateId();
    const referral: Referral = {
      id: referralId,
      inviterId,
      invitedUserId: newUserId,
      attributionSource,
      status: 'pending',
      fraudRiskScore: 0,
      deviceFingerprint: deviceData.fingerprint,
      ipAddress: deviceData.ipAddress,
      userAgent: deviceData.userAgent,
      location: deviceData.location,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Run fraud detection
    const fraudResult = await fraudDetector.detectFraud(referral);
    referral.fraudRiskScore = fraudResult.riskScore;

    if (fraudResult.isFraudulent) {
      referral.status = 'rejected';
      referral.rejectedAt = new Date();
      referral.rejectionReason = 'Fraud detected';
    }

    // Save referral
    await db.collection('referrals').doc(referralId).set(referral);

    // Update inviter profile
    await db
      .collection('users')
      .doc(inviterId)
      .collection('referralProfile')
      .doc('main')
      .update({
        totalReferrals: FieldValue.increment(1),
        pendingReferrals: FieldValue.increment(
          referral.status === 'pending' ? 1 : 0
        ),
        lastInviteSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Update stats
    await db
      .collection('referralStats')
      .doc(inviterId)
      .update({
        totalInvitesSent: FieldValue.increment(1),
        fraudRejectionCount: FieldValue.increment(
          fraudResult.isFraudulent ? 1 : 0
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });

    return {
      success: true,
      referralId,
      status: referral.status,
    };
  } catch (error: any) {
    console.error('Process referral error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate referral for reward eligibility
 */
export async function validateReferralReward(
  request: ValidateReferralRewardRequest
): Promise<{
  success: boolean;
  eligible?: boolean;
  reason?: string;
  error?: string;
}> {
  const { referralId } = request;

  try {
    const referralDoc = await db.collection('referrals').doc(referralId).get();

    if (!referralDoc.exists) {
      return { success: false, error: 'Referral not found' };
    }

    const referral = referralDoc.data() as Referral;

    // Already verified or rejected
    if (referral.status === 'verified' || referral.status === 'rewarded') {
      return { success: true, eligible: true };
    }

    if (referral.status === 'rejected') {
      return {
        success: true,
        eligible: false,
        reason: referral.rejectionReason,
      };
    }

    // Check if invited user meets criteria
    const eligibility =await fraudDetector.isUserEligibleForReward(
      referral.invitedUserId
    );

    if (!eligibility.eligible) {
      return {
        success: true,
        eligible: false,
        reason: eligibility.reason,
      };
    }

    // Update referral status to verified
    await db
      .collection('referrals')
      .doc(referralId)
      .update({
        status: 'verified',
        verifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Update inviter profile counters
    await db
      .collection('users')
      .doc(referral.inviterId)
      .collection('referralProfile')
      .doc('main')
      .update({
        successfulReferrals: FieldValue.increment(1),
        pendingReferrals: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Update stats
    await db
      .collection('referralStats')
      .doc(referral.inviterId)
      .update({
        totalReferralsCompleted: FieldValue.increment(1),
        referralStreak: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

    return { success: true, eligible: true };
  } catch (error: any) {
    console.error('Validate referral reward error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Distribute reward to inviter
 */
export async function distributeReward(
  request: DistributeRewardRequest
): Promise<{
  success: boolean;
  rewardId?: string;
  error?: string;
}> {
  const { referralId, rewardType } = request;

  try {
    const referralDoc = await db.collection('referrals').doc(referralId).get();

    if (!referralDoc.exists) {
      return { success: false, error: 'Referral not found' };
    }

    const referral = referralDoc.data() as Referral;

    if (referral.status === 'rewarded') {
      return { success: false, error: 'Already rewarded' };
    }

    if (referral.status !== 'verified') {
      return { success: false, error: 'Referral not verified' };
    }

    // Get config
    const config = await getReferralConfig();
    if (!config.rewardsEnabled) {
      return { success: false, error: 'Rewards currently disabled' };
    }

    // Calculate reward amount
    let amount = 0;
    let duration: number | undefined;
    let multiplier: number | undefined;

    switch (rewardType) {
      case 'tokens':
        amount = config.tokenRewardAmount;
        break;
      case 'boost':
        amount = 1;
        duration = config.boostDurationMinutes;
        break;
      case 'discovery_exposure':
        amount = config.discoveryExposureBoost;
        duration = config.boostDurationMinutes;
        break;
      case 'visibility_multiplier':
        amount = 1;
        multiplier = config.visibilityMultiplier;
        duration = config.boostDurationMinutes;
        break;
    }

    // Create reward record
    const rewardId = generateId();
    const reward: ReferralReward = {
      id: rewardId,
      userId: referral.inviterId,
      referralId,
      rewardType,
      amount,
      duration,
      multiplier,
      status: 'pending',
      createdAt: new Date(),
    };

    // Grant reward based on type
    if (rewardType === 'tokens') {
      // Use wallet service to grant tokens
      const earnResult = await earnTokens({
        userId: referral.inviterId,
        amountTokens: amount,
        source: 'TIP', // Using TIP as closest match for referral rewards
        relatedId: referralId,
        metadata: {
          type: 'referral_reward',
          referralId,
          invitedUserId: referral.invitedUserId,
        },
      });

      if (!earnResult.success) {
        return { success: false, error: earnResult.error };
      }

      reward.status = 'granted';
      reward.grantedAt = new Date();
    } else {
      // For boosts/multipliers, just mark as granted
      // Actual application would be handled by discovery/visibility engines
      reward.status = 'granted';
      reward.grantedAt = new Date();
      reward.expiresAt = new Date(Date.now() + (duration || 0) * 60 * 1000);
    }

    // Save reward
    await db.collection('referralRewards').doc(rewardId).set(reward);

    // Update referral status
    await db
      .collection('referrals')
      .doc(referralId)
      .update({
        status: 'rewarded',
        rewardedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Update stats
    await db
      .collection('referralStats')
      .doc(referral.inviterId)
      .update({
        totalRewardsEarned: FieldValue.increment(1),
        totalTokensEarned: FieldValue.increment(
          rewardType === 'tokens' ? amount : 0
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });

    return { success: true, rewardId };
  } catch (error: any) {
    console.error('Distribute reward error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get referral config
 */
async function getReferralConfig(): Promise<ReferralConfig> {
  const configDoc = await db.collection('referralConfig').doc('default').get();

  if (!configDoc.exists) {
    // Return default config
    return {
      id: 'default',
      enabled: true,
      rewardsEnabled: true,
      tokenRewardAmount: 50,
      boostDurationMinutes: 60,
      discoveryExposureBoost: 10,
      visibilityMultiplier: 2.0,
      dailyInviteLimit: 50,
      dailyRewardLimit: 10,
      maxPendingReferrals: 20,
      fraudScoreThreshold: 60,
      requireSelfieVerification: true,
      requireFirstAction: true,
      minimumAge: 18,
      countryMultipliers: {},
      minDaysSinceRegistration: 0,
      minProfileCompleteness: 0,
      updatedAt: new Date(),
      updatedBy: 'system',
    };
  }

  return configDoc.data() as ReferralConfig;
}

/**
 * Generate unique alphanumeric code
 */
function generateUniqueCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Revoke referral privileges for user
 */
export async function revokeReferralPrivileges(
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('referralProfile')
      .doc('main')
      .update({
        referralPrivilegesRevoked: true,
        referralPrivilegesRevokedReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });

    return { success: true };
  } catch (error: any) {
    console.error('Revoke referral privileges error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get referral stats for user
 */
export async function getReferralStats(
  userId: string
): Promise<ReferralStats | null> {
  try {
    const statsDoc = await db.collection('referralStats').doc(userId).get();
    if (!statsDoc.exists) return null;
    return statsDoc.data() as ReferralStats;
  } catch (error) {
    console.error('Get referral stats error:', error);
    return null;
  }
}
