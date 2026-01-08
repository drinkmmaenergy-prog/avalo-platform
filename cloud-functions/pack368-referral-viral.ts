/**
 * PACK 368 — REFERRAL & VIRAL MODE + INFLUENCER MANAGEMENT
 * 
 * Manages referral programs, viral growth mechanics, and influencer partnerships
 * with fraud detection and abuse prevention
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════
// 1️⃣ PROCESS REFERRAL
// ═══════════════════════════════════════════════════════════════

export const pack368_processReferral = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { referralCode, deviceId, ip } = data;

    // Get referrer from code
    const referrerQuery = await db.collection('users')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (referrerQuery.empty) {
      throw new functions.https.HttpsError('not-found', 'Invalid referral code');
    }

    const referrer = referrerQuery.docs[0];
    const referrerId = referrer.id;
    const referredId = context.auth.uid;

    // Check if already referred
    const existingReferral = await db.collection('referralTracking')
      .where('referredId', '==', referredId)
      .limit(1)
      .get();

    if (!existingReferral.empty) {
      throw new functions.https.HttpsError('already-exists', 'User already referred');
    }

    // Get user's country
    const userDoc = await db.collection('users').doc(referredId).get();
    const countryCode = userDoc.data()?.countryCode || 'US';

    // Check if referrals are enabled for this country
    const referralConfig = await db.collection('referralConfigs').doc(countryCode).get();
    if (!referralConfig.exists || !referralConfig.data()?.enabled) {
      throw new functions.https.HttpsError('permission-denied', `Referrals not enabled in ${countryCode}`);
    }

    const config = referralConfig.data()!;

    // Hash sensitive data
    const ipHash = createHash('sha256').update(ip || '').digest('hex');
    const deviceHash = createHash('sha256').update(deviceId || '').digest('hex');

    // Check abuse limits
    const fraudScore = await checkReferralAbuse(referrerId, referredId, ipHash, deviceHash, countryCode, config);

    if (fraudScore >= 80) {
      throw new functions.https.HttpsError('permission-denied', 'Referral blocked due to suspected abuse');
    }

    // Check if referrer is a partner
    const partnerDoc = await db.collection('launchPartners').doc(referrerId).get();
    const isPartner = partnerDoc.exists && partnerDoc.data()?.isPartner;
    const multiplier = isPartner ? partnerDoc.data()?.referralMultiplier || 1.0 : 1.0;

    // Calculate reward
    const baseReward = config.rewardAmount;
    const finalReward = Math.floor(baseReward * multiplier);

    // Create referral record
    const referralRef = db.collection('referralTracking').doc();
    await referralRef.set({
      referrerId,
      referredId,
      referralCode,
      countryCode,
      ipHash,
      deviceHash,
      fraudScore,
      isPartner,
      multiplier,
      baseReward,
      finalReward,
      status: 'PENDING',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: null
    });

    // Award non-withdrawable tokens to referrer
    await db.collection('users').doc(referrerId).update({
      'tokens.referralBonus': admin.firestore.FieldValue.increment(finalReward),
      'tokens.total': admin.firestore.FieldValue.increment(finalReward),
      'stats.totalReferrals': admin.firestore.FieldValue.increment(1),
      'stats.pendingReferrals': admin.firestore.FieldValue.increment(1)
    });

    // Log to audit
    await db.collection('launchAuditLog').add({
      action: 'REFERRAL_PROCESSED',
      userId: referredId,
      data: {
        referrerId,
        countryCode,
        reward: finalReward,
        fraudScore,
        isPartner
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Check PACK 302 abuse detection
    if (fraudScore > 50) {
      await triggerAbuseDetection(referrerId, referredId, fraudScore);
    }

    return {
      success: true,
      referralId: referralRef.id,
      reward: finalReward,
      referrerName: referrer.data()?.displayName
    };

  } catch (error: any) {
    console.error('Process referral error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// 2️⃣ CONFIRM REFERRAL (After Retention Check)
// ═══════════════════════════════════════════════════════════════

export const pack368_confirmReferrals = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      // Confirm referrals after 7 days of activity
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

      const pendingReferrals = await db.collection('referralTracking')
        .where('status', '==', 'PENDING')
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .limit(500)
        .get();

      const batch = db.batch();

      for (const referralDoc of pendingReferrals.docs) {
        const referral = referralDoc.data();

        // Check if referred user is still active
        const isActive = await checkUserActivity(referral.referredId, 7 * 86400000);

        if (isActive) {
          // Confirm referral
          batch.update(referralDoc.ref, {
            status: 'CONFIRMED',
            confirmedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Update referrer stats
          const referrerRef = db.collection('users').doc(referral.referrerId);
          batch.update(referrerRef, {
            'stats.confirmedReferrals': admin.firestore.FieldValue.increment(1),
            'stats.pendingReferrals': admin.firestore.FieldValue.increment(-1)
          });
        } else {
          // Revoke unconfirmed referral
          batch.update(referralDoc.ref, {
            status: 'REVOKED',
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokeReason: 'USER_INACTIVE'
          });

          // Remove tokens from referrer
          const referrerRef = db.collection('users').doc(referral.referrerId);
          batch.update(referrerRef, {
            'tokens.referralBonus': admin.firestore.FieldValue.increment(-referral.finalReward),
            'tokens.total': admin.firestore.FieldValue.increment(-referral.finalReward),
            'stats.pendingReferrals': admin.firestore.FieldValue.increment(-1),
            'stats.revokedReferrals': admin.firestore.FieldValue.increment(1)
          });
        }
      }

      await batch.commit();

      console.log(`Processed ${pendingReferrals.size} pending referrals`);
      return null;

    } catch (error) {
      console.error('Confirm referrals error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 3️⃣ CREATE/UPDATE PARTNER
// ═══════════════════════════════════════════════════════════════

export const pack368_updatePartner = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin/launch manager permission
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAdmin = adminDoc.data()?.role === 'admin';
    const isLaunchManager = adminDoc.data()?.permissions?.manageLaunch === true;

    if (!isAdmin && !isLaunchManager) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    const {
      userId,
      isPartner,
      partnerTier,
      geoTarget,
      referralMultiplier,
      inviteVolumeCap,
      fraudScoreOverride
    } = data;

    // Validate tier
    const validTiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    if (!validTiers.includes(partnerTier)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid partner tier');
    }

    // Validate multiplier
    if (referralMultiplier < 1.0 || referralMultiplier > 10.0) {
      throw new functions.https.HttpsError('invalid-argument', 'Multiplier must be between 1.0 and 10.0');
    }

    // Create/update partner record
    await db.collection('launchPartners').doc(userId).set({
      userId,
      isPartner,
      partnerTier,
      geoTarget: geoTarget || [],
      referralMultiplier,
      inviteVolumeCap: inviteVolumeCap || 1000,
      fraudScoreOverride: fraudScoreOverride || false,
      createdBy: context.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update user record
    await db.collection('users').doc(userId).update({
      'partner.isPartner': isPartner,
      'partner.tier': partnerTier,
      'partner.multiplier': referralMultiplier
    });

    // Log to audit
    await db.collection('launchAuditLog').add({
      action: 'PARTNER_UPDATED',
      userId: context.auth.uid,
      data: {
        targetUserId: userId,
        isPartner,
        partnerTier,
        referralMultiplier
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      partnerId: userId
    };

  } catch (error: any) {
    console.error('Update partner error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// 4️⃣ PARTNER PERFORMANCE TRACKING
// ═══════════════════════════════════════════════════════════════

export const pack368_trackPartnerPerformance = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const partners = await db.collection('launchPartners')
        .where('isPartner', '==', true)
        .get();

      for (const partner of partners.docs) {
        const partnerId = partner.id;

        // Get referral stats
        const referrals = await db.collection('referralTracking')
          .where('referrerId', '==', partnerId)
          .get();

        const confirmed = referrals.docs.filter(r => r.data().status === 'CONFIRMED').length;
        const pending = referrals.docs.filter(r => r.data().status === 'PENDING').length;
        const revoked = referrals.docs.filter(r => r.data().status === 'REVOKED').length;

        const confirmationRate = referrals.size > 0 ? confirmed / referrals.size : 0;

        // Calculate revenue generated
        let totalRevenue = 0;
        for (const referral of referrals.docs) {
          if (referral.data().status === 'CONFIRMED') {
            const referred = await db.collection('users').doc(referral.data().referredId).get();
            totalRevenue += referred.data()?.stats?.totalSpent || 0;
          }
        }

        // Update partner performance
        await partner.ref.update({
          'performance.totalReferrals': referrals.size,
          'performance.confirmedReferrals': confirmed,
          'performance.pendingReferrals': pending,
          'performance.revokedReferrals': revoked,
          'performance.confirmationRate': confirmationRate,
          'performance.totalRevenue': totalRevenue,
          'performance.lastUpdated': admin.firestore.FieldValue.serverTimestamp()
        });

        // Auto-upgrade partners based on performance
        if (confirmed >= 1000 && partner.data().partnerTier === 'GOLD') {
          await partner.ref.update({
            partnerTier: 'PLATINUM',
            referralMultiplier: 5.0
          });
        } else if (confirmed >= 100 && partner.data().partnerTier === 'SILVER') {
          await partner.ref.update({
            partnerTier: 'GOLD',
            referralMultiplier: 3.0
          });
        }
      }

      console.log(`Updated performance for ${partners.size} partners`);
      return null;

    } catch (error) {
      console.error('Track partner performance error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function checkReferralAbuse(
  referrerId: string,
  referredId: string,
  ipHash: string,
  deviceHash: string,
  countryCode: string,
  config: any
): Promise<number> {
  let fraudScore = 0;

  // Check referrer's total referrals
  const referrerReferrals = await db.collection('referralTracking')
    .where('referrerId', '==', referrerId)
    .count()
    .get();

  if (referrerReferrals.data().count >= config.capPerUser) {
    fraudScore += 50;
  }

  // Check IP-based referrals
  const ipReferrals = await db.collection('referralTracking')
    .where('referrerId', '==', referrerId)
    .where('ipHash', '==', ipHash)
    .count()
    .get();

  if (ipReferrals.data().count >= config.capPerIP) {
    fraudScore += 30;
  }

  // Check device-based referrals
  const deviceReferrals = await db.collection('referralTracking')
    .where('referrerId', '==', referrerId)
    .where('deviceHash', '==', deviceHash)
    .count()
    .get();

  if (deviceReferrals.data().count >= config.capPerDevice) {
    fraudScore += 40;
  }

  // Check for rapid succession
  const recentReferrals = await db.collection('referralTracking')
    .where('referrerId', '==', referrerId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000))) // 1 hour
    .count()
    .get();

  if (recentReferrals.data().count > 10) {
    fraudScore += 40;
  }

  return Math.min(fraudScore, 100);
}

async function checkUserActivity(userId: string, windowMs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  
  const activities = await db.collection('userActivity')
    .where('userId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoff))
    .limit(1)
    .get();

  return !activities.empty;
}

async function triggerAbuseDetection(referrerId: string, referredId: string, fraudScore: number) {
  // Integrate with PACK 302 Abuse Detection
  await db.collection('abuseDetectionQueue').add({
    source: 'PACK_368_REFERRAL',
    type: 'REFERRAL_ABUSE',
    referrerId,
    referredId,
    fraudScore,
    priority: fraudScore >= 80 ? 'HIGH' : 'MEDIUM',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
