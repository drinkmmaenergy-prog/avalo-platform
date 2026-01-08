/**
 * PACK 385 — Viral Referral & Invite Loop (Anti-Fraud Safe)
 * Manages referral links, attribution, and rewards with fraud protection
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Referral link data
 */
interface ReferralLink {
  userId: string;
  code: string;
  createdAt: admin.firestore.Timestamp;
  uses: number;
  maxUses?: number;
  expiresAt?: admin.firestore.Timestamp;
  metadata?: Record<string, any>;
}

/**
 * Referral attribution tracking
 */
interface ReferralAttribution {
  inviterId: string;
  invitedUserId: string;
  referralCode: string;
  attributedAt: admin.firestore.Timestamp;
  verified: boolean;
  rewardPaid: boolean;
  rewardAmount?: number;
  fraudFlags: string[];
  deviceFingerprint: string;
  ipAddress: string;
}

/**
 * Viral reward configuration
 */
interface RewardConfig {
  inviterTokens: number;
  inviteeTokens: number;
  unlockConditions: {
    verifiedAccount: boolean;
    firstChatRequired: boolean;
    firstPurchaseRequired: boolean;
    minDaysSinceSignup: number;
  };
  lockDuration: number; // days before tokens unlock
}

const DEFAULT_REWARD_CONFIG: RewardConfig = {
  inviterTokens: 100,
  inviteeTokens: 50,
  unlockConditions: {
    verifiedAccount: true,
    firstChatRequired: true,
    firstPurchaseRequired: false,
    minDaysSinceSignup: 1
  },
  lockDuration: 7
};

/**
 * Generate referral link for user
 */
export const pack385_generateReferralLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Check if user is eligible for referrals
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  // Check launch phase allows referrals
  const phaseDoc = await db.collection('launchPhases').doc('global').get();
  const currentPhase = phaseDoc.data()?.currentPhase;
  
  if (currentPhase === 'INTERNAL') {
    throw new functions.https.HttpsError('failed-precondition', 'Referrals not available in current launch phase');
  }

  // Check daily referral limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayReferrals = await db.collection('referralAttribution')
    .where('inviterId', '==', userId)
    .where('attributedAt', '>=', today)
    .get();

  const limits = phaseDoc.data()?.config?.limits || { maxDailyReferrals: 10 };
  
  if (todayReferrals.size >= limits.maxDailyReferrals) {
    throw new functions.https.HttpsError('resource-exhausted', 'Daily referral limit reached');
  }

  // Generate unique referral code
  const code = crypto.randomBytes(6).toString('base64url');

  const referralLink: ReferralLink = {
    userId,
    code,
    createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    uses: 0,
    metadata: data.metadata || {}
  };

  await db.collection('referralLinks').doc(code).set(referralLink);

  return {
    success: true,
    code,
    url: `https://avalo.app/invite/${code}`
  };
});

/**
 * Process referral when new user signs up
 */
export const pack385_attributeReferral = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { referralCode, deviceInfo } = data;

  if (!referralCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Referral code required');
  }

  const invitedUserId = context.auth.uid;

  // Check if referral code exists
  const linkDoc = await db.collection('referralLinks').doc(referralCode).get();

  if (!linkDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral code');
  }

  const linkData = linkDoc.data() as ReferralLink;
  const inviterId = linkData.userId;

  // Prevent self-referral
  if (inviterId === invitedUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot refer yourself');
  }

  // Check if user already has a referral attribution
  const existingAttribution = await db.collection('referralAttribution')
    .where('invitedUserId', '==', invitedUserId)
    .get();

  if (!existingAttribution.empty) {
    throw new functions.https.HttpsError('already-exists', 'Referral already attributed');
  }

  // Fraud detection checks
  const fraudFlags = await checkReferralFraud({
    inviterId,
    invitedUserId,
    deviceInfo,
    ipAddress: context.rawRequest?.ip || 'unknown'
  });

  // Create attribution record
  const attribution: ReferralAttribution = {
    inviterId,
    invitedUserId,
    referralCode,
    attributedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    verified: fraudFlags.length === 0,
    rewardPaid: false,
    fraudFlags,
    deviceFingerprint: deviceInfo?.fingerprint || 'unknown',
    ipAddress: context.rawRequest?.ip || 'unknown'
  };

  await db.collection('referralAttribution').add(attribution);

  // Increment referral link usage
  await linkDoc.ref.update({
    uses: admin.firestore.FieldValue.increment(1)
  });

  return {
    success: true,
    verified: fraudFlags.length === 0,
    fraudFlags
  };
});

/**
 * Check for referral fraud indicators
 */
async function checkReferralFraud(data: {
  inviterId: string;
  invitedUserId: string;
  deviceInfo?: any;
  ipAddress: string;
}): Promise<string[]> {
  const flags: string[] = [];

  // Check for VPN usage
  if (data.deviceInfo?.vpnDetected) {
    flags.push('VPN_DETECTED');
  }

  // Check for emulator
  if (data.deviceInfo?.isEmulator) {
    flags.push('EMULATOR_DETECTED');
  }

  // Check for duplicate device fingerprint
  const duplicateDevice = await db.collection('referralAttribution')
    .where('deviceFingerprint', '==', data.deviceInfo?.fingerprint)
    .limit(1)
    .get();

  if (!duplicateDevice.empty) {
    flags.push('DUPLICATE_DEVICE');
  }

  // Check for same IP address within short time
  const recentSameIP = await db.collection('referralAttribution')
    .where('inviterId', '==', data.inviterId)
    .where('ipAddress', '==', data.ipAddress)
    .where('attributedAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .get();

  if (recentSameIP.size > 3) {
    flags.push('SUSPICIOUS_IP_PATTERN');
  }

  // Check inviter's fraud history
  const inviterFraud = await db.collection('fraudDetection')
    .where('userId', '==', data.inviterId)
    .where('type', '==', 'REFERRAL_FRAUD')
    .limit(1)
    .get();

  if (!inviterFraud.empty) {
    flags.push('INVITER_FRAUD_HISTORY');
  }

  return flags;
}

/**
 * Process referral reward after conditions are met
 */
export const pack385_processReferralReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { inviterId, invitedUserId } = data;

  // Find attribution
  const attributionSnapshot = await db.collection('referralAttribution')
    .where('inviterId', '==', inviterId)
    .where('invitedUserId', '==', invitedUserId)
    .limit(1)
    .get();

  if (attributionSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'Referral attribution not found');
  }

  const attributionDoc = attributionSnapshot.docs[0];
  const attribution = attributionDoc.data() as ReferralAttribution;

  // Check if already paid
  if (attribution.rewardPaid) {
    throw new functions.https.HttpsError('already-exists', 'Reward already paid');
  }

  // Check if verified
  if (!attribution.verified) {
    throw new functions.https.HttpsError('failed-precondition', 'Referral not verified due to fraud flags');
  }

  // Check unlock conditions
  const conditionsMet = await checkReferralUnlockConditions(invitedUserId);

  if (!conditionsMet.eligible) {
    throw new functions.https.HttpsError('failed-precondition', `Conditions not met: ${conditionsMet.missingConditions.join(', ')}`);
  }

  // Get reward config
  const config = DEFAULT_REWARD_CONFIG;
  const unlockDate = new Date(Date.now() + config.lockDuration * 24 * 60 * 60 * 1000);

  // Create locked token rewards
  const batch = db.batch();

  // Reward for inviter
  const inviterRewardRef = db.collection('lockedTokens').doc();
  batch.set(inviterRewardRef, {
    userId: inviterId,
    amount: config.inviterTokens,
    reason: 'REFERRAL_REWARD',
    lockedUntil: unlockDate,
    referralCode: attribution.referralCode,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Reward for invitee
  const inviteeRewardRef = db.collection('lockedTokens').doc();
  batch.set(inviteeRewardRef, {
    userId: invitedUserId,
    amount: config.inviteeTokens,
    reason: 'REFERRAL_BONUS',
    lockedUntil: unlockDate,
    referralCode: attribution.referralCode,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update attribution
  batch.update(attributionDoc.ref, {
    rewardPaid: true,
    rewardAmount: config.inviterTokens + config.inviteeTokens,
    paidAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  return {
    success: true,
    inviterTokens: config.inviterTokens,
    inviteeTokens: config.inviteeTokens,
    unlockDate: unlockDate.toISOString()
  };
});

/**
 * Check if referral unlock conditions are met
 */
async function checkReferralUnlockConditions(userId: string): Promise<{ eligible: boolean; missingConditions: string[] }> {
  const config = DEFAULT_REWARD_CONFIG.unlockConditions;
  const missing: string[] = [];

  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    return { eligible: false, missingConditions: ['USER_NOT_FOUND'] };
  }

  // Check verified account
  if (config.verifiedAccount && !userData.verified) {
    missing.push('ACCOUNT_NOT_VERIFIED');
  }

  // Check account age
  const accountAge = Date.now() - userData.createdAt?.toMillis();
  const minAge = config.minDaysSinceSignup * 24 * 60 * 60 * 1000;
  
  if (accountAge < minAge) {
    missing.push('ACCOUNT_TOO_NEW');
  }

  // Check first chat
  if (config.firstChatRequired) {
    const chatSnapshot = await db.collection('chatMessages')
      .where('senderId', '==', userId)
      .limit(1)
      .get();

    if (chatSnapshot.empty) {
      missing.push('NO_CHAT_ACTIVITY');
    }
  }

  // Check first purchase
  if (config.firstPurchaseRequired) {
    const purchaseSnapshot = await db.collection('tokenPurchases')
      .where('userId', '==', userId)
      .where('status', '==', 'COMPLETED')
      .limit(1)
      .get();

    if (purchaseSnapshot.empty) {
      missing.push('NO_PURCHASE');
    }
  }

  return {
    eligible: missing.length === 0,
    missingConditions: missing
  };
}

/**
 * Get user's referral stats
 */
export const pack385_getReferralStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Get all referrals
  const attributions = await db.collection('referralAttribution')
    .where('inviterId', '==', userId)
    .get();

  const stats = {
    totalReferrals: attributions.size,
    verifiedReferrals: 0,
    pendingRewards: 0,
    paidRewards: 0,
    totalEarned: 0,
    fraudBlocked: 0
  };

  attributions.forEach(doc => {
    const data = doc.data() as ReferralAttribution;
    
    if (data.verified) {
      stats.verifiedReferrals++;
    } else {
      stats.fraudBlocked++;
    }

    if (data.rewardPaid) {
      stats.paidRewards++;
      stats.totalEarned += data.rewardAmount || 0;
    } else if (data.verified) {
      stats.pendingRewards++;
    }
  });

  return stats;
});

/**
 * Background job: Unlock referral rewards
 */
export const pack385_unlockReferralRewards = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = new Date();

    // Get locked tokens that are ready to unlock
    const lockedTokensSnapshot = await db.collection('lockedTokens')
      .where('lockedUntil', '<=', now)
      .where('unlocked', '==', false)
      .get();

    const batch = db.batch();
    let unlocked = 0;

    for (const doc of lockedTokensSnapshot.docs) {
      const data = doc.data();

      // Add to user's wallet
      const walletRef = db.collection('wallets').doc(data.userId);
      batch.set(walletRef, {
        tokens: admin.firestore.FieldValue.increment(data.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Mark as unlocked
      batch.update(doc.ref, {
        unlocked: true,
        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      unlocked++;

      // Commit in batches of 500
      if (unlocked % 500 === 0) {
        await batch.commit();
      }
    }

    if (unlocked % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Unlocked ${unlocked} referral rewards`);
  });
