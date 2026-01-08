/**
 * PACK 398 - VIRAL REFERRAL ENGINE
 * 
 * Drives viral user acquisition through referral links, QR codes,
 * and social sharing with anti-fraud protection.
 * 
 * Depends on:
 * - PACK 302 (Fraud Detection)
 * - PACK 397 (Fake Growth Detection)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Referral Status
export enum ReferralStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REWARDED = 'REWARDED',
  FRAUD_REJECTED = 'FRAUD_REJECTED',
  EXPIRED = 'EXPIRED',
}

// Referral Reward Type
export enum ReferralRewardType {
  TOKENS = 'TOKENS',
  BOOST_TIME = 'BOOST_TIME',
  VISIBILITY_BONUS = 'VISIBILITY_BONUS',
  PREMIUM_TRIAL = 'PREMIUM_TRIAL',
}

// Referral
export interface Referral {
  referralId: string;
  referrerId: string;
  referredUserId?: string;
  referralCode: string;
  referralLink: string;
  channel: 'link' | 'qr' | 'social' | 'sms' | 'email';
  status: ReferralStatus;
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  rewardedAt?: admin.firestore.Timestamp;
  fraudCheckPassed: boolean;
  fraudScore?: number;
  deviceFingerprint?: string;
  ipAddress?: string;
  metadata?: any;
}

// Viral Invite
export interface ViralInvite {
  inviteId: string;
  senderId: string;
  recipientContact: string; // email, phone, or social handle
  channel: 'email' | 'sms' | 'whatsapp' | 'facebook' | 'instagram' | 'twitter';
  deepLink: string;
  qrCode?: string;
  status: 'sent' | 'clicked' | 'installed' | 'completed';
  sentAt: admin.firestore.Timestamp;
  clickedAt?: admin.firestore.Timestamp;
  installedAt?: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  referralId?: string;
}

// Invite Reward
export interface InviteReward {
  rewardId: string;
  userId: string;
  referralId: string;
  rewardType: ReferralRewardType;
  rewardValue: number;
  status: 'pending' | 'granted' | 'claimed' | 'expired';
  grantedAt: admin.firestore.Timestamp;
  claimedAt?: admin.firestore.Timestamp;
  expiresAt?: admin.firestore.Timestamp;
  metadata?: any;
}

// Viral Leaderboard Entry
export interface ViralLeaderboardEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  totalReferrals: number;
  successfulReferrals: number;
  totalRewards: number;
  rank: number;
  score: number;
  countryCode?: string;
  updatedAt: admin.firestore.Timestamp;
}

const db = admin.firestore();

/**
 * Generate referral code for user
 */
export const generateReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  
  // Check if user already has a referral code
  const existingCodeQuery = await db.collection('referral_codes')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!existingCodeQuery.empty) {
    const existingCode = existingCodeQuery.docs[0].data();
    return { 
      referralCode: existingCode.code,
      referralLink: existingCode.link,
    };
  }

  // Generate unique code
  const code = await generateUniqueCode();
  const link = `https://avalo.app/invite/${code}`;

  await db.collection('referral_codes').add({
    userId,
    code,
    link,
    totalUses: 0,
    successfulReferrals: 0,
    createdAt: admin.firestore.Timestamp.now(),
  });

  return { referralCode: code, referralLink: link };
});

/**
 * Create referral
 */
export const createReferral = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { referralCode, channel } = data;

  if (!referralCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Referral code required');
  }

  // Find referrer by code
  const referralCodeQuery = await db.collection('referral_codes')
    .where('code', '==', referralCode)
    .limit(1)
    .get();

  if (referralCodeQuery.empty) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral code');
  }

  const referralCodeDoc = referralCodeQuery.docs[0];
  const referrerData = referralCodeDoc.data();
  const referrerId = referrerData.userId;

  // Check if user is trying to refer themselves
  if (referrerId === context.auth.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot refer yourself');
  }

  // Check if user was already referred
  const existingReferralQuery = await db.collection('referrals')
    .where('referredUserId', '==', context.auth.uid)
    .limit(1)
    .get();

  if (!existingReferralQuery.empty) {
    throw new functions.https.HttpsError('already-exists', 'User already referred');
  }

  const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const referral: Referral = {
    referralId,
    referrerId,
    referredUserId: context.auth.uid,
    referralCode,
    referralLink: referrerData.link,
    channel: channel || 'link',
    status: ReferralStatus.PENDING,
    createdAt: admin.firestore.Timestamp.now(),
    fraudCheckPassed: false,
    deviceFingerprint: data.deviceFingerprint,
    ipAddress: data.ipAddress,
    metadata: data.metadata || {},
  };

  await db.collection('referrals').doc(referralId).set(referral);

  // Update referral code usage
  await referralCodeDoc.ref.update({
    totalUses: admin.firestore.FieldValue.increment(1),
  });

  return { success: true, referralId };
});

/**
 * Complete referral after user meets criteria
 */
export const completeReferral = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Check if user completed profile and had first interaction
    const profileComplete = afterData.profileComplete && !beforeData.profileComplete;
    const hadFirstInteraction = afterData.hasHadInteraction && !beforeData.hasHadInteraction;

    if (!profileComplete && !hadFirstInteraction) {
      return null;
    }

    // Find pending referral for this user
    const referralQuery = await db.collection('referrals')
      .where('referredUserId', '==', userId)
      .where('status', '==', ReferralStatus.PENDING)
      .limit(1)
      .get();

    if (referralQuery.empty) {
      return null;
    }

    const referralDoc = referralQuery.docs[0];
    const referral = referralDoc.data() as Referral;

    // Run anti-fraud checks
    const fraudCheckResult = await runFraudChecks(userId, referral);

    if (!fraudCheckResult.passed) {
      await referralDoc.ref.update({
        status: ReferralStatus.FRAUD_REJECTED,
        fraudCheckPassed: false,
        fraudScore: fraudCheckResult.score,
      });
      return null;
    }

    // Mark referral as completed
    await referralDoc.ref.update({
      status: ReferralStatus.COMPLETED,
      completedAt: admin.firestore.Timestamp.now(),
      fraudCheckPassed: true,
      fraudScore: fraudCheckResult.score,
    });

    // Grant rewards to referrer
    await grantReferralRewards(referral.referrerId, referral.referralId);

    // Update leaderboard
    await updateViralLeaderboard(referral.referrerId);

    return null;
  });

/**
 * Send viral invite
 */
export const sendViralInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { recipientContact, channel } = data;

  if (!recipientContact || !channel) {
    throw new functions.https.HttpsError('invalid-argument', 'Recipient and channel required');
  }

  // Get user's referral code
  const referralCodeQuery = await db.collection('referral_codes')
    .where('userId', '==', context.auth.uid)
    .limit(1)
    .get();

  let referralLink = '';
  if (!referralCodeQuery.empty) {
    referralLink = referralCodeQuery.docs[0].data().link;
  } else {
    // Generate new code
    const code = await generateUniqueCode();
    referralLink = `https://avalo.app/invite/${code}`;
    await db.collection('referral_codes').add({
      userId: context.auth.uid,
      code,
      link: referralLink,
      totalUses: 0,
      successfulReferrals: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });
  }

  const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const invite: ViralInvite = {
    inviteId,
    senderId: context.auth.uid,
    recipientContact,
    channel,
    deepLink: referralLink,
    status: 'sent',
    sentAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('viral_invites').doc(inviteId).set(invite);

  // TODO: Actually send the invite via the specified channel
  // This would integrate with email/SMS/social media APIs

  return { success: true, inviteId, deepLink: referralLink };
});

/**
 * Get user's referral stats
 */
export const getReferralStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;

  // Get referral code
  const referralCodeQuery = await db.collection('referral_codes')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (referralCodeQuery.empty) {
    return {
      hasReferralCode: false,
      stats: null,
    };
  }

  const referralCodeData = referralCodeQuery.docs[0].data();

  // Get all referrals
  const referralsQuery = await db.collection('referrals')
    .where('referrerId', '==', userId)
    .get();

  const totalReferrals = referralsQuery.size;
  const completedReferrals = referralsQuery.docs.filter(
    doc => doc.data().status === ReferralStatus.COMPLETED || doc.data().status === ReferralStatus.REWARDED
  ).length;
  const pendingReferrals = referralsQuery.docs.filter(
    doc => doc.data().status === ReferralStatus.PENDING
  ).length;

  // Get rewards
  const rewardsQuery = await db.collection('invite_rewards')
    .where('userId', '==', userId)
    .get();

  const totalRewards = rewardsQuery.docs.reduce((sum, doc) => {
    const reward = doc.data() as InviteReward;
    return sum + reward.rewardValue;
  }, 0);

  // Get leaderboard position
  const leaderboardDoc = await db.collection('viral_leaderboards')
    .doc(userId)
    .get();

  const leaderboardRank = leaderboardDoc.exists ? leaderboardDoc.data()?.rank : null;

  return {
    hasReferralCode: true,
    referralCode: referralCodeData.code,
    referralLink: referralCodeData.link,
    stats: {
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      totalRewards,
      leaderboardRank,
    },
  };
});

/**
 * Get viral leaderboard
 */
export const getViralLeaderboard = functions.https.onCall(async (data, context) => {
  const { limit = 100, countryCode } = data;

  let query = db.collection('viral_leaderboards')
    .orderBy('rank', 'asc')
    .limit(limit);

  if (countryCode) {
    query = query.where('countryCode', '==', countryCode);
  }

  const snapshot = await query.get();

  return {
    leaderboard: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
});

/**
 * Run anti-fraud checks
 */
async function runFraudChecks(
  userId: string,
  referral: Referral
): Promise<{ passed: boolean; score: number }> {
  let fraudScore = 0;

  // Check device fingerprint (PACK 302 integration)
  if (referral.deviceFingerprint) {
    const deviceQuery = await db.collection('device_fingerprints')
      .where('fingerprint', '==', referral.deviceFingerprint)
      .get();

    if (deviceQuery.size > 3) {
      fraudScore += 0.3; // Multiple accounts on same device
    }
  }

  // Check IP address
  if (referral.ipAddress) {
    const ipQuery = await db.collection('referrals')
      .where('ipAddress', '==', referral.ipAddress)
      .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    if (ipQuery.size > 5) {
      fraudScore += 0.4; // Many referrals from same IP
    }
  }

  // Check referrer and referred user similarity (PACK 397 integration)
  const referrerDoc = await db.collection('users').doc(referral.referrerId).get();
  const referredDoc = await db.collection('users').doc(userId).get();

  if (referrerDoc.exists && referredDoc.exists) {
    const referrerData = referrerDoc.data();
    const referredData = referredDoc.data();

    // Check if profiles are too similar (possible fake accounts)
    if (referrerData?.createdAt && referredData?.createdAt) {
      const timeDiff = Math.abs(
        referredData.createdAt.toMillis() - referrerData.createdAt.toMillis()
      );
      if (timeDiff < 60 * 1000) {
        fraudScore += 0.3; // Created within 1 minute of each other
      }
    }
  }

  return {
    passed: fraudScore < 0.5,
    score: fraudScore,
  };
}

/**
 * Grant rewards to referrer
 */
async function grantReferralRewards(referrerId: string, referralId: string) {
  const rewards: InviteReward[] = [
    {
      rewardId: `reward_tokens_${Date.now()}`,
      userId: referrerId,
      referralId,
      rewardType: ReferralRewardType.TOKENS,
      rewardValue: 100,
      status: 'granted',
      grantedAt: admin.firestore.Timestamp.now(),
    },
    {
      rewardId: `reward_boost_${Date.now()}`,
      userId: referrerId,
      referralId,
      rewardType: ReferralRewardType.BOOST_TIME,
      rewardValue: 3600, // 1 hour in seconds
      status: 'granted',
      grantedAt: admin.firestore.Timestamp.now(),
    },
  ];

  for (const reward of rewards) {
    await db.collection('invite_rewards').doc(reward.rewardId).set(reward);

    // Apply reward to user
    if (reward.rewardType === ReferralRewardType.TOKENS) {
      await db.collection('users').doc(referrerId).update({
        tokens: admin.firestore.FieldValue.increment(reward.rewardValue),
      });
    } else if (reward.rewardType === ReferralRewardType.BOOST_TIME) {
      await db.collection('users').doc(referrerId).update({
        boostTimeRemaining: admin.firestore.FieldValue.increment(reward.rewardValue),
      });
    }
  }

  // Mark referral as rewarded
  await db.collection('referrals').doc(referralId).update({
    status: ReferralStatus.REWARDED,
    rewardedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Update viral leaderboard
 */
async function updateViralLeaderboard(userId: string) {
  const referralsQuery = await db.collection('referrals')
    .where('referrerId', '==', userId)
    .get();

  const totalReferrals = referralsQuery.size;
  const successfulReferrals = referralsQuery.docs.filter(
    doc => doc.data().status === ReferralStatus.COMPLETED || doc.data().status === ReferralStatus.REWARDED
  ).length;

  const rewardsQuery = await db.collection('invite_rewards')
    .where('userId', '==', userId)
    .get();

  const totalRewards = rewardsQuery.docs.reduce((sum, doc) => {
    return sum + (doc.data().rewardValue || 0);
  }, 0);

  const score = successfulReferrals * 100 + totalRewards;

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const entry: ViralLeaderboardEntry = {
    userId,
    userName: userData?.name || 'Unknown',
    userAvatar: userData?.avatar,
    totalReferrals,
    successfulReferrals,
    totalRewards,
    rank: 0, // Will be calculated by batch job
    score,
    countryCode: userData?.countryCode,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('viral_leaderboards').doc(userId).set(entry, { merge: true });
}

/**
 * Calculate leaderboard ranks (scheduled job)
 */
export const calculateLeaderboardRanks = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
  const leaderboardQuery = await db.collection('viral_leaderboards')
    .orderBy('score', 'desc')
    .get();

  const batch = db.batch();
  let rank = 1;

  leaderboardQuery.forEach(doc => {
    batch.update(doc.ref, { rank });
    rank++;
  });

  await batch.commit();

  return null;
});

/**
 * Generate unique referral code
 */
async function generateUniqueCode(): Promise<string> {
  let code = '';
  let isUnique = false;

  while (!isUnique) {
    code = Math.random().toString(36).substr(2, 8).toUpperCase();

    const existingQuery = await db.collection('referral_codes')
      .where('code', '==', code)
      .limit(1)
      .get();

    isUnique = existingQuery.empty;
  }

  return code;
}
