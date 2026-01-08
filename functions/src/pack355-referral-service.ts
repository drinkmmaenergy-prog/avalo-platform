/**
 * PACK 355 - Referral & Invite Engine Service
 * 
 * Provides viral referral loop functionality with:
 * - User-to-user invites
 * - Influencer-to-fan invites
 * - Campaign referrals
 * - Dynamic rewards
 * - Region-based scaling
 * - Anti-fraud protections
 * 
 * Dependencies: PACK 277 (Wallet), PACK 302 (Fraud), PACK 353 (Rate Limiting)
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';

const db = admin.firestore();

export type ReferralType = 'USER' | 'INFLUENCER' | 'CAMPAIGN';
export type ReferralStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'FRAUD';
export type RewardType = 'TOKENS' | 'VISIBILITY_BOOST' | 'PREMIUM_DAY' | 'PROFILE_BOOST';

export interface Referral {
  referralId: string;
  referrerUserId: string;
  invitedUserId: string;
  type: ReferralType;
  countryCode: string;
  createdAt: admin.firestore.Timestamp;
  activatedAt?: admin.firestore.Timestamp;
  status: ReferralStatus;
  rewardUnlocked: boolean;
  rewardType?: RewardType;
  rewardAmount?: number;
  campaignId?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
}

export interface ReferralStats {
  userId: string;
  totalInvites: number;
  convertedInvites: number;
  totalRewardsTokens: number;
  flaggedAttempts: number;
  lastInviteAt?: admin.firestore.Timestamp;
  viralCoefficient?: number;
}

export interface ReferralCode {
  userId: string;
  code: string;
  type: ReferralType;
  trackingLink: string;
  createdAt: admin.firestore.Timestamp;
  active: boolean;
  campaignId?: string;
}

export interface ReferralReward {
  referralId: string;
  userId: string;
  rewardType: RewardType;
  amount: number;
  unlockedAt: admin.firestore.Timestamp;
  expiresAt?: admin.firestore.Timestamp;
  claimed: boolean;
}

export interface FraudCheck {
  passed: boolean;
  reason?: string;
  riskScore: number;
  flags: string[];
}

/**
 * Generate unique referral code for user or influencer
 */
export async function generateReferralCode(
  userId: string,
  type: ReferralType,
  campaignId?: string
): Promise<ReferralCode> {
  const code = `${type === 'INFLUENCER' ? 'INF' : type === 'CAMPAIGN' ? 'CMP' : 'USR'}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

  const trackingLink = `https://avalo.app/r/${code}`;

  const referralCode: ReferralCode = {
    userId,
    code,
    type,
    trackingLink,
    createdAt: admin.firestore.Timestamp.now(),
    active: true,
    campaignId,
  };

  await db.collection('referralCodes').doc(code).set(referralCode);

  logger.info(`Generated referral code ${code} for user ${userId}`);

  return referralCode;
}

/**
 * Get or create referral code for user
 */
export async function getUserReferralCode(
  userId: string,
  type: ReferralType = 'USER'
): Promise<ReferralCode> {
  const existingCodes = await db
    .collection('referralCodes')
    .where('userId', '==', userId)
    .where('type', '==', type)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (!existingCodes.empty) {
    return existingCodes.docs[0].data() as ReferralCode;
  }

  return generateReferralCode(userId, type);
}

/**
 * Perform fraud detection on referral attempt
 */
export async function checkReferralFraud(
  referrerUserId: string,
  invitedUserId: string,
  deviceFingerprint?: string,
  ipAddress?: string
): Promise<FraudCheck> {
  const flags: string[] = [];
  let riskScore = 0;

  // Check if same user (self-referral)
  if (referrerUserId === invitedUserId) {
    flags.push('SELF_REFERRAL');
    riskScore += 100;
  }

  // Check device fingerprint duplicates
  if (deviceFingerprint) {
    const duplicateDevices = await db
      .collection('referrals')
      .where('referrerUserId', '==', referrerUserId)
      .where('deviceFingerprint', '==', deviceFingerprint)
      .limit(1)
      .get();

    if (!duplicateDevices.empty) {
      flags.push('DUPLICATE_DEVICE');
      riskScore += 50;
    }
  }

  // Check IP duplicates
  if (ipAddress) {
    const duplicateIPs = await db
      .collection('referrals')
      .where('referrerUserId', '==', referrerUserId)
      .where('ipAddress', '==', ipAddress)
      .limit(2)
      .get();

    if (duplicateIPs.size > 1) {
      flags.push('DUPLICATE_IP');
      riskScore += 30;
    }
  }

  // Check rapid invites (rate limiting)
  const recentInvites = await db
    .collection('referrals')
    .where('referrerUserId', '==', referrerUserId)
    .where('createdAt', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 3600000))
    .get();

  if (recentInvites.size > 10) {
    flags.push('RAPID_INVITES');
    riskScore += 40;
  }

  // Check circular referrals
  const crossReferral = await db
    .collection('referrals')
    .where('referrerUserId', '==', invitedUserId)
    .where('invitedUserId', '==', referrerUserId)
    .limit(1)
    .get();

  if (!crossReferral.empty) {
    flags.push('CIRCULAR_REFERRAL');
    riskScore += 60;
  }

  // Check user fraud history
  const userDoc = await db.collection('users').doc(invitedUserId).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    if (userData?.fraudFlags && userData.fraudFlags.length > 0) {
      flags.push('USER_FRAUD_HISTORY');
      riskScore += 70;
    }
  }

  // Check referrer stats for farming patterns
  const statsDoc = await db.collection('referralStats').doc(referrerUserId).get();
  if (statsDoc.exists) {
    const stats = statsDoc.data() as ReferralStats;
    if (stats.flaggedAttempts > 5) {
      flags.push('REPEATED_FRAUD_ATTEMPTS');
      riskScore += 50;
    }
  }

  const passed = riskScore < 50;

  return {
    passed,
    reason: flags.length > 0 ? flags.join(', ') : undefined,
    riskScore,
    flags,
  };
}

/**
 * Create referral relationship
 */
export async function createReferral(
  referralCode: string,
  invitedUserId: string,
  countryCode: string,
  deviceFingerprint?: string,
  ipAddress?: string
): Promise<{ success: boolean; referralId?: string; error?: string }> {
  try {
    // Get referral code details
    const codeDoc = await db.collection('referralCodes').doc(referralCode).get();
    if (!codeDoc.exists) {
      return { success: false, error: 'Invalid referral code' };
    }

    const codeData = codeDoc.data() as ReferralCode;
    if (!codeData.active) {
      return { success: false, error: 'Referral code is disabled' };
    }

    const referrerUserId = codeData.userId;

    // Check if user already has a referrer
    const existingReferral = await db
      .collection('referrals')
      .where('invitedUserId', '==', invitedUserId)
      .limit(1)
      .get();

    if (!existingReferral.empty) {
      return { success: false, error: 'User already referred' };
    }

    // Fraud detection
    const fraudCheck = await checkReferralFraud(
      referrerUserId,
      invitedUserId,
      deviceFingerprint,
      ipAddress
    );

    const status: ReferralStatus = fraudCheck.passed ? 'PENDING' : 'FRAUD';

    // Create referral
    const referralId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const referral: Referral = {
      referralId,
      referrerUserId,
      invitedUserId,
      type: codeData.type,
      countryCode,
      createdAt: admin.firestore.Timestamp.now(),
      status,
      rewardUnlocked: false,
      campaignId: codeData.campaignId,
      deviceFingerprint,
      ipAddress,
    };

    await db.collection('referrals').doc(referralId).set(referral);

    // Update referrer stats
    await updateReferrerStats(referrerUserId, status === 'FRAUD');

    // Log to fraud system if flagged
    if (!fraudCheck.passed) {
      await logFraudAttempt(referrerUserId, invitedUserId, fraudCheck);
    }

    logger.info(`Referral ${referralId} created with status ${status}`);

    return { success: true, referralId };
  } catch (error) {
    logger.error('Error creating referral:', error);
    return { success: false, error: 'Failed to create referral' };
  }
}

/**
 * Check if user can activate referral reward
 */
export async function checkReferralActivation(
  invitedUserId: string
): Promise<{ canActivate: boolean; reason?: string }> {
  const userDoc = await db.collection('users').doc(invitedUserId).get();
  if (!userDoc.exists) {
    return { canActivate: false, reason: 'User not found' };
  }

  const userData = userDoc.data();

  // Check 18+ verification
  if (!userData?.ageVerified) {
    return { canActivate: false, reason: 'Age verification required' };
  }

  // Check selfie verification
  if (!userData?.selfieVerified) {
    return { canActivate: false, reason: 'Selfie verification required' };
  }

  // Check payment activity
  const hasPaymentActivity =
    userData?.totalMessagesSent > 0 || userData?.tokensBalance > 0;

  if (!hasPaymentActivity) {
    return { canActivate: false, reason: 'At least 1 paid message or token purchase required' };
  }

  return { canActivate: true };
}

/**
 * Activate referral and unlock rewards
 */
export async function activateReferral(
  invitedUserId: string
): Promise<{ success: boolean; rewardId?: string; error?: string }> {
  try {
    const referralDoc = await db
      .collection('referrals')
      .where('invitedUserId', '==', invitedUserId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    if (referralDoc.empty) {
      return { success: false, error: 'No pending referral found' };
    }

    const referralData = referralDoc.docs[0].data() as Referral;
    const referralId = referralData.referralId;

    // Check if can activate
    const activationCheck = await checkReferralActivation(invitedUserId);
    if (!activationCheck.canActivate) {
      return { success: false, error: activationCheck.reason };
    }

    // Update referral status
    await db.collection('referrals').doc(referralId).update({
      status: 'ACTIVE',
      activatedAt: admin.firestore.Timestamp.now(),
      rewardUnlocked: true,
    });

    // Grant reward to referrer
    const reward = await grantReferralReward(referralId, referralData.referrerUserId);

    // Update stats
    await db
      .collection('referralStats')
      .doc(referralData.referrerUserId)
      .set(
        {
          convertedInvites: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );

    logger.info(`Referral ${referralId} activated and reward granted`);

    return { success: true, rewardId: reward.rewardId };
  } catch (error) {
    logger.error('Error activating referral:', error);
    return { success: false, error: 'Failed to activate referral' };
  }
}

/**
 * Grant reward to referrer
 */
async function grantReferralReward(
  referralId: string,
  userId: string
): Promise<{ rewardId: string; rewardType: RewardType; amount: number }> {
  // Default reward: 100 tokens
  const rewardType: RewardType = 'TOKENS';
  const amount = 100;

  const rewardId = `reward_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const reward: ReferralReward = {
    referralId,
    userId,
    rewardType,
    amount,
    unlockedAt: admin.firestore.Timestamp.now(),
    claimed: false,
  };

  await db.collection('referralRewards').doc(rewardId).set(reward);

  // Update wallet balance
  await db
    .collection('wallets')
    .doc(userId)
    .set(
      {
        tokensBalance: admin.firestore.FieldValue.increment(amount),
      },
      { merge: true }
    );

  // Update referral stats
  await db
    .collection('referralStats')
    .doc(userId)
    .set(
      {
        totalRewardsTokens: admin.firestore.FieldValue.increment(amount),
      },
      { merge: true }
    );

  logger.info(`Granted ${amount} tokens to user ${userId} for referral ${referralId}`);

  return { rewardId, rewardType, amount };
}

/**
 * Update referrer stats
 */
async function updateReferrerStats(userId: string, isFraud: boolean): Promise<void> {
  const statsRef = db.collection('referralStats').doc(userId);

  await statsRef.set(
    {
      userId,
      totalInvites: admin.firestore.FieldValue.increment(1),
      flaggedAttempts: isFraud ? admin.firestore.FieldValue.increment(1) : 0,
      lastInviteAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Log fraud attempt to PACK 302 fraud detection system
 */
async function logFraudAttempt(
  referrerUserId: string,
  invitedUserId: string,
  fraudCheck: FraudCheck
): Promise<void> {
  await db.collection('fraudLogs').add({
    type: 'REFERRAL_FRAUD',
    referrerUserId,
    invitedUserId,
    riskScore: fraudCheck.riskScore,
    flags: fraudCheck.flags,
    timestamp: admin.firestore.Timestamp.now(),
  });

  // Update user risk profile
  await db
    .collection('users')
    .doc(referrerUserId)
    .set(
      {
        fraudFlags: admin.firestore.FieldValue.arrayUnion('REFERRAL_ABUSE'),
        riskScore: admin.firestore.FieldValue.increment(fraudCheck.riskScore),
      },
      { merge: true }
    );
}

/**
 * Get referral stats for user
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const statsDoc = await db.collection('referralStats').doc(userId).get();

  if (!statsDoc.exists) {
    return {
      userId,
      totalInvites: 0,
      convertedInvites: 0,
      totalRewardsTokens: 0,
      flaggedAttempts: 0,
    };
  }

  return statsDoc.data() as ReferralStats;
}

/**
 * Get referral history for user
 */
export async function getReferralHistory(
  userId: string,
  limit: number = 50
): Promise<Referral[]> {
  const referralsSnapshot = await db
    .collection('referrals')
    .where('referrerUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return referralsSnapshot.docs.map((doc) => doc.data() as Referral);
}

/**
 * Calculate viral coefficient (k-factor) for user
 */
export async function calculateViralCoefficient(userId: string): Promise<number> {
  const stats = await getReferralStats(userId);

  if (stats.totalInvites === 0) {
    return 0;
  }

  // k-factor = (converted invites / total invites) * average invites per converted user
  const conversionRate = stats.convertedInvites / stats.totalInvites;

  // Get average invites from converted users
  const convertedUsers = await db
    .collection('referrals')
    .where('referrerUserId', '==', userId)
    .where('status', '==', 'ACTIVE')
    .get();

  let totalSecondaryInvites = 0;
  for (const doc of convertedUsers.docs) {
    const invitedUser = doc.data().invitedUserId;
    const secondaryStats = await getReferralStats(invitedUser);
    totalSecondaryInvites += secondaryStats.totalInvites;
  }

  const avgInvitesPerConvertedUser =
    convertedUsers.size > 0 ? totalSecondaryInvites / convertedUsers.size : 0;

  const kFactor = conversionRate * avgInvitesPerConvertedUser;

  // Update stats with k-factor
  await db
    .collection('referralStats')
    .doc(userId)
    .set({ viralCoefficient: kFactor }, { merge: true });

  return kFactor;
}

/**
 * Get top referrers globally
 */
export async function getTopReferrers(limit: number = 100): Promise<ReferralStats[]> {
  const statsSnapshot = await db
    .collection('referralStats')
    .orderBy('convertedInvites', 'desc')
    .limit(limit)
    .get();

  return statsSnapshot.docs.map((doc) => doc.data() as ReferralStats);
}

/**
 * Get referral metrics by region
 */
export async function getReferralMetricsByRegion(countryCode: string): Promise<{
  totalReferrals: number;
  activeReferrals: number;
  fraudRate: number;
  conversionRate: number;
}> {
  const allReferrals = await db
    .collection('referrals')
    .where('countryCode', '==', countryCode)
    .get();

  const totalReferrals = allReferrals.size;
  const activeReferrals = allReferrals.docs.filter((doc) => doc.data().status === 'ACTIVE')
    .length;
  const fraudReferrals = allReferrals.docs.filter((doc) => doc.data().status === 'FRAUD')
    .length;

  const fraudRate = totalReferrals > 0 ? fraudReferrals / totalReferrals : 0;
  const conversionRate = totalReferrals > 0 ? activeReferrals / totalReferrals : 0;

  return {
    totalReferrals,
    activeReferrals,
    fraudRate,
    conversionRate,
  };
}

/**
 * Disable referral code (admin action)
 */
export async function disableReferralCode(code: string): Promise<boolean> {
  try {
    await db.collection('referralCodes').doc(code).update({
      active: false,
    });
    logger.info(`Disabled referral code ${code}`);
    return true;
  } catch (error) {
    logger.error('Error disabling referral code:', error);
    return false;
  }
}

/**
 * Freeze referral rewards for user (admin action)
 */
export async function freezeUserReferrals(userId: string): Promise<boolean> {
  try {
    const batch = db.batch();

    // Lock all pending and active referrals
    const referrals = await db
      .collection('referrals')
      .where('referrerUserId', '==', userId)
      .where('status', 'in', ['PENDING', 'ACTIVE'])
      .get();

    referrals.docs.forEach((doc) => {
      batch.update(doc.ref, { status: 'LOCKED' });
    });

    await batch.commit();

    logger.info(`Froze referrals for user ${userId}`);
    return true;
  } catch (error) {
    logger.error('Error freezing user referrals:', error);
    return false;
  }
}
