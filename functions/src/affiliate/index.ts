/**
 * PACK 131: Affiliate System HTTP Functions
 * Exports all affiliate-related callable functions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../init';
import {
  createAffiliateProfile,
  generateAffiliateLink,
  recordReferral,
  markReferralVerified,
  getAffiliateAnalytics,
  requestAffiliatePayout,
  processAffiliatePayout,
  suspendAffiliate,
  getAffiliateComplianceStatus,
} from './functions';
import { updateReferralRetention } from './fraud-detection';
import { AffiliateReferral } from './types';

/**
 * Create a new affiliate profile
 */
export const affiliateCreateProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  return await createAffiliateProfile(request.data, request.auth.uid);
});

/**
 * Generate affiliate referral link
 */
export const affiliateGenerateLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  return await generateAffiliateLink(request.data, request.auth.uid);
});

/**
 * Record a referral (public endpoint, called during signup)
 */
export const affiliateRecordReferral = onCall(async (request) => {
  return await recordReferral(request.data);
});

/**
 * Mark referral as verified (internal, called after user verification)
 */
export const affiliateMarkVerified = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  await markReferralVerified(request.data.userId);
  return { success: true };
});

/**
 * Get affiliate analytics
 */
export const affiliateGetAnalytics = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  return await getAffiliateAnalytics(request.data, request.auth.uid);
});

/**
 * Request a payout
 */
export const affiliateRequestPayout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  return await requestAffiliatePayout(request.data, request.auth.uid);
});

/**
 * Process a payout (admin only)
 */
export const affiliateProcessPayout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // TODO: Check admin custom claims
  return await processAffiliatePayout(request.data, request.auth.uid);
});

/**
 * Suspend an affiliate (admin only)
 */
export const affiliateSuspend = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // TODO: Check admin custom claims
  return await suspendAffiliate(request.data, request.auth.uid);
});

/**
 * Get compliance status
 */
export const affiliateGetComplianceStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  return await getAffiliateComplianceStatus(request.data.affiliateId, request.auth.uid);
});

/**
 * Update affiliate agreement status
 */
export const affiliateSignAgreement = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { affiliateId, antiMLMAccepted, antiSpamAccepted } = request.data;

  const profileDoc = await db.collection('affiliate_profiles').doc(affiliateId).get();
  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data();
  if (profile?.userId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  await profileDoc.ref.update({
    agreementSigned: true,
    agreementSignedAt: new Date(),
    antiMLMAccepted: antiMLMAccepted || false,
    antiSpamAccepted: antiSpamAccepted || false,
    status: 'active', // Activate after signing
    canViewAnalytics: true,
    updatedAt: new Date(),
  });

  return { success: true };
});

/**
 * Create or update landing page
 */
export const affiliateUpdateLandingPage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { affiliateId, templateId, customPhoto, socialLinks } = request.data;

  const profileDoc = await db.collection('affiliate_profiles').doc(affiliateId).get();
  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data();
  if (profile?.userId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  if (profile?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Must be active affiliate');
  }

  await profileDoc.ref.update({
    landingPageEnabled: true,
    landingPageTemplate: templateId || 'default',
    landingPagePhoto: customPhoto,
    landingPageSocialLinks: socialLinks || {},
    updatedAt: new Date(),
  });

  return { success: true };
});

/**
 * Scheduled job: Update retention metrics
 * Runs daily to check Day 1, 7, and 30 retention
 */
export const affiliateUpdateRetention = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'UTC',
  },
  async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Update Day 1 retention
    const day1Query = await db
      .collection('affiliate_referrals')
      .where('verificationCompleted', '==', true)
      .where('retentionDay1', '==', false)
      .where('verificationCompletedAt', '<=', oneDayAgo)
      .limit(500)
      .get();

    for (const doc of day1Query.docs) {
      const referral = doc.data() as AffiliateReferral;
      
      // Check if user is still active (simple: check last activity)
      const userDoc = await db.collection('users').doc(referral.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastActive = userData?.lastActive;
        
        if (lastActive && (now.getTime() - lastActive.toDate().getTime()) < 48 * 60 * 60 * 1000) {
          await updateReferralRetention(referral.referralId, 1);
          
          // Mark as payout eligible after Day 1 retention
          await doc.ref.update({
            payoutEligible: true,
          });
        }
      }
    }

    // Update Day 7 retention
    const day7Query = await db
      .collection('affiliate_referrals')
      .where('retentionDay1', '==', true)
      .where('retentionDay7', '==', false)
      .where('verificationCompletedAt', '<=', sevenDaysAgo)
      .limit(500)
      .get();

    for (const doc of day7Query.docs) {
      const referral = doc.data() as AffiliateReferral;
      const userDoc = await db.collection('users').doc(referral.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastActive = userData?.lastActive;
        
        if (lastActive && (now.getTime() - lastActive.toDate().getTime()) < 48 * 60 * 60 * 1000) {
          await updateReferralRetention(referral.referralId, 7);
        }
      }
    }

    // Update Day 30 retention
    const day30Query = await db
      .collection('affiliate_referrals')
      .where('retentionDay7', '==', true)
      .where('retentionDay30', '==', false)
      .where('verificationCompletedAt', '<=', thirtyDaysAgo)
      .limit(500)
      .get();

    for (const doc of day30Query.docs) {
      const referral = doc.data() as AffiliateReferral;
      const userDoc = await db.collection('users').doc(referral.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastActive = userData?.lastActive;
        
        if (lastActive && (now.getTime() - lastActive.toDate().getTime()) < 48 * 60 * 60 * 1000) {
          await updateReferralRetention(referral.referralId, 30);
        }
      }
    }

    console.log('Affiliate retention update completed');
  }
);

/**
 * Scheduled job: Monitor for fraud patterns
 * Runs every hour to detect suspicious activity
 */
export const affiliateMonitorFraud = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
  },
  async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find affiliates with high fraud scores in last hour
    const suspiciousQuery = await db
      .collection('affiliate_referrals')
      .where('createdAt', '>=', oneHourAgo)
      .where('fraudStatus', '==', 'suspicious')
      .get();

    const affiliateGroups = new Map<string, number>();

    suspiciousQuery.docs.forEach(doc => {
      const referral = doc.data() as AffiliateReferral;
      const count = affiliateGroups.get(referral.affiliateId) || 0;
      affiliateGroups.set(referral.affiliateId, count + 1);
    });

    // Suspend affiliates with multiple suspicious referrals
    for (const [affiliateId, count] of Array.from(affiliateGroups.entries())) {
      if (count >= 5) {
        await db.collection('affiliate_profiles').doc(affiliateId).update({
          status: 'suspended',
          suspendedAt: new Date(),
        });
        console.log(`Suspended affiliate ${affiliateId} due to ${count} suspicious referrals`);
      }
    }

    console.log('Affiliate fraud monitoring completed');
  }
);