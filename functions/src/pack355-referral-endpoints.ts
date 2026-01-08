/**
 * PACK 355 - Referral & Invite Engine Endpoints
 * 
 * HTTP endpoints for the referral system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  generateReferralCode,
  getUserReferralCode,
  createReferral,
  activateReferral,
  getReferralStats,
  getReferralHistory,
  calculateViralCoefficient,
  getTopReferrers,
  getReferralMetricsByRegion,
  disableReferralCode,
  freezeUserReferrals,
} from './pack355-referral-service';

/**
 * Generate or get user's referral code
 * POST /api/referral/get-code
 */
export const getReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const type = data.type || 'USER';

  try {
    const code = await getUserReferralCode(userId, type);
    return { success: true, code };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get referral code');
  }
});

/**
 * Apply referral code during registration
 * POST /api/referral/apply-code
 */
export const applyReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { code, countryCode, deviceFingerprint, ipAddress } = data;

  if (!code || !countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const result = await createReferral(code, userId, countryCode, deviceFingerprint, ipAddress);
    return result;
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to apply referral code');
  }
});

/**
 * Get referral stats for current user
 * GET /api/referral/stats
 */
export const getMyReferralStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const stats = await getReferralStats(userId);
    const kFactor = await calculateViralCoefficient(userId);
    return { success: true, stats: { ...stats, viralCoefficient: kFactor } };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get referral stats');
  }
});

/**
 * Get referral history for current user
 * GET /api/referral/history
 */
export const getMyReferralHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 50;

  try {
    const history = await getReferralHistory(userId, limit);
    return { success: true, referrals: history };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get referral history');
  }
});

/**
 * Manually trigger referral activation check (called after user completes milestones)
 * POST /api/referral/check-activation
 */
export const checkReferralActivation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await activateReferral(userId);
    return result;
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to check referral activation');
  }
});

/**
 * Get top referrers leaderboard
 * GET /api/referral/leaderboard
 */
export const getReferralLeaderboard = functions.https.onCall(async (data, context) => {
  const limit = data.limit || 100;

  try {
    const topReferrers = await getTopReferrers(limit);
    return { success: true, leaderboard: topReferrers };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get referral leaderboard');
  }
});

/**
 * INFLUENCER ENDPOINTS
 */

/**
 * Generate influencer referral code
 * POST /api/referral/influencer/get-code
 */
export const getInfluencerReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Check if user is influencer
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  if (!userDoc.exists || !userDoc.data()?.isInfluencer) {
    throw new functions.https.HttpsError('permission-denied', 'User is not an influencer');
  }

  try {
    const code = await getUserReferralCode(userId, 'INFLUENCER');
    return { success: true, code };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get influencer referral code');
  }
});

/**
 * Get influencer referral analytics
 * GET /api/referral/influencer/analytics
 */
export const getInfluencerReferralAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Check if user is influencer
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  if (!userDoc.exists || !userDoc.data()?.isInfluencer) {
    throw new functions.https.HttpsError('permission-denied', 'User is not an influencer');
  }

  try {
    const stats = await getReferralStats(userId);
    const history = await getReferralHistory(userId, 1000);

    // Calculate regional breakdown
    const regionalBreakdown: Record<string, number> = {};
    const activeUsersByRegion: Record<string, number> = {};

    history.forEach((referral) => {
      const country = referral.countryCode || 'UNKNOWN';
      regionalBreakdown[country] = (regionalBreakdown[country] || 0) + 1;
      if (referral.status === 'ACTIVE') {
        activeUsersByRegion[country] = (activeUsersByRegion[country] || 0) + 1;
      }
    });

    // Calculate revenue originated (simplified - would integrate with PACK 277 wallet)
    const activeReferrals = history.filter((r) => r.status === 'ACTIVE');
    const revenueOriginated = activeReferrals.length * 10; // Placeholder calculation

    return {
      success: true,
      analytics: {
        totalInstalls: stats.totalInvites,
        activeUsers: stats.convertedInvites,
        revenueOriginated,
        regionalBreakdown,
        activeUsersByRegion,
      },
    };
  } catch (error) {
    throw new functions.https.HttpsError(
      'internal',
      'Failed to get influencer referral analytics'
    );
  }
});

/**
 * ADMIN ENDPOINTS
 */

/**
 * Get global referral metrics
 * GET /api/referral/admin/metrics
 */
export const getGlobalReferralMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin role
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const db = admin.firestore();

    // Get total referrals
    const totalReferrals = await db.collection('referrals').count().get();
    const activeReferrals = await db
      .collection('referrals')
      .where('status', '==', 'ACTIVE')
      .count()
      .get();
    const fraudReferrals = await db
      .collection('referrals')
      .where('status', '==', 'FRAUD')
      .count()
      .get();

    // Get top referrers
    const topReferrers = await getTopReferrers(10);

    // Calculate global viral coefficient
    const totalStats = await db.collection('referralStats').get();
    let avgKFactor = 0;
    if (totalStats.size > 0) {
      const kFactors = totalStats.docs
        .map((doc) => doc.data().viralCoefficient || 0)
        .filter((k) => k > 0);
      avgKFactor = kFactors.reduce((sum, k) => sum + k, 0) / kFactors.length;
    }

    return {
      success: true,
      metrics: {
        totalReferrals: totalReferrals.data().count,
        activeReferrals: activeReferrals.data().count,
        fraudReferrals: fraudReferrals.data().count,
        fraudRate:
          totalReferrals.data().count > 0
            ? fraudReferrals.data().count / totalReferrals.data().count
            : 0,
        conversionRate:
          totalReferrals.data().count > 0
            ? activeReferrals.data().count / totalReferrals.data().count
            : 0,
        avgViralCoefficient: avgKFactor,
        topReferrers,
      },
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get global referral metrics');
  }
});

/**
 * Get referral metrics by region
 * GET /api/referral/admin/metrics-by-region
 */
export const getReferralMetricsByRegionEndpoint = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { countryCode } = data;
    if (!countryCode) {
      throw new functions.https.HttpsError('invalid-argument', 'Country code is required');
    }

    try {
      const metrics = await getReferralMetricsByRegion(countryCode);
      return { success: true, metrics };
    } catch (error) {
      throw new functions.https.HttpsError('internal', 'Failed to get regional metrics');
    }
  }
);

/**
 * Disable referral code (admin)
 * POST /api/referral/admin/disable-code
 */
export const adminDisableReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin role
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { code } = data;
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'Referral code is required');
  }

  try {
    const result = await disableReferralCode(code);
    return { success: result };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to disable referral code');
  }
});

/**
 * Freeze user referrals (admin)
 * POST /api/referral/admin/freeze-user
 */
export const adminFreezeUserReferrals = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin role
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId } = data;
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
  }

  try {
    const result = await freezeUserReferrals(userId);
    return { success: result };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to freeze user referrals');
  }
});

/**
 * Create campaign referral code (admin)
 * POST /api/referral/admin/create-campaign
 */
export const adminCreateCampaignCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin role
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { campaignId, campaignName } = data;
  if (!campaignId || !campaignName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Campaign ID and name are required'
    );
  }

  try {
    // Create campaign in database
    await admin.firestore().collection('referralCampaigns').doc(campaignId).set({
      campaignId,
      name: campaignName,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: context.auth.uid,
      active: true,
    });

    // Generate campaign code
    const code = await generateReferralCode(context.auth.uid, 'CAMPAIGN', campaignId);
    return { success: true, code };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to create campaign code');
  }
});

/**
 * Background function to auto-activate referrals when user reaches milestones
 */
export const onUserMilestoneReached = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Check if user just completed required milestones
    const beforeReady = before.ageVerified && before.selfieVerified && before.totalMessagesSent > 0;
    const afterReady = after.ageVerified && after.selfieVerified && after.totalMessagesSent > 0;

    if (!beforeReady && afterReady) {
      // Try to activate referral
      await activateReferral(userId);
    }
  });
