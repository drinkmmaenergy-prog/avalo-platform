/**
 * PACK 368 — Viral Referral & Invite Engine
 * Cloud Functions endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  generateInviteCode,
  processReferral,
  validateReferralReward,
  distributeReward,
  getReferralStats,
  revokeReferralPrivileges,
} from './pack368-referral-engine';

/**
 * Generate invite code for user
 */
export const generateInviteCodeCallable = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const result = await generateInviteCode(userId);
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Failed to generate invite code');
  }

  return result.profile;
});

/**
 * Process new referral (called when new user signs up with invite code)
 */
export const processReferralCallable = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    inviteCode,
    attributionSource,
    deviceFingerprint,
    ipAddress,
    userAgent,
    location,
  } = request.data;

  if (!inviteCode || !attributionSource) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const result = await processReferral({
    inviteCode,
    newUserId: userId,
    attributionSource,
    deviceData: {
      fingerprint: deviceFingerprint,
      ipAddress,
      userAgent,
      location,
    },
  });

  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Failed to process referral');
  }

  return result;
});

/**
 * Get referral stats for current user
 */
export const getReferralStatsCallable = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const stats = await getReferralStats(userId);
  return stats;
});

/**
 * Admin: Revoke referral privileges
 */
export const revokeReferralPrivilegesCallable = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin role check
  const { targetUserId, reason } = request.data;
  
  if (!targetUserId || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const result = await revokeReferralPrivileges(targetUserId, reason);
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Failed to revoke privileges');
  }

  return { success: true };
});

/**
 * Trigger: Validate referral when user completes first action
 */
export const onUserFirstAction = onDocumentCreated(
  'users/{userId}/actions/{actionId}',
  async (event) => {
    const userId = event.params.userId;
    const actionData = event.data?.data();

    if (!actionData) return;

    // Find pending referral for this user
    const { db } = await import('./init');
    const referralsSnapshot = await db
      .collection('referrals')
      .where('invitedUserId', '==', userId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (referralsSnapshot.empty) return;

    const referral = referralsSnapshot.docs[0];
    const referralId = referral.id;

    // Update referral with first action info
    await referral.ref.update({
      firstActionType: actionData.type,
      firstActionAt: actionData.timestamp,
    });

    // Validate referral for reward
    const validationResult = await validateReferralReward({ referralId });
    
    if (validationResult.eligible) {
      // Automatically distribute token reward
      await distributeReward({
        referralId,
        rewardType: 'tokens',
      });
    }
  }
);

/**
 * Trigger: Update referral stats when referral is verified/rewarded
 */
export const onReferralUpdated = onDocumentUpdated(
  'referrals/{referralId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // Check if status changed to verified or rewarded
    if (before.status !== after.status && ['verified', 'rewarded'].includes(after.status)) {
      const { db } = await import('./init');
      const inviterId = after.inviterId;

      // Calculate updated stats
      const referralSnapshot = await db
        .collection('referrals')
        .where('inviterId', '==', inviterId)
        .get();

      const totalReferrals = referralSnapshot.size;
      const verified = referralSnapshot.docs.filter(
        doc => ['verified', 'rewarded'].includes(doc.data().status)
      ).length;
      const conversionRate = totalReferrals > 0 ? verified / totalReferrals : 0;

      // Update stats
      await db.collection('referralStats').doc(inviterId).update({
        conversionRate,
        updatedAt: new Date(),
      });
    }
  }
);

/**
 * Scheduled function: Clean up expired rewards (runs daily)
 */
export const cleanupExpiredRewards = onCall(async () => {
  const { db } = await import('./init');
  const now = new Date();

  const expiredRewards = await db
    .collection('referralRewards')
    .where('status', '==', 'granted')
    .where('expiresAt', '<=', now)
    .get();

  const batch = db.batch();
  expiredRewards.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'revoked',
      revokedAt: now,
      revocationReason: 'expired',
    });
  });

  await batch.commit();
  return { cleaned: expiredRewards.size };
});
