import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 167 - Avalo Influencer & Affiliate Attribution Network
 * Cloud Functions for ethical affiliate marketing
 */

import * as functions from 'firebase-functions';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, admin } from './init';
import {
  AffiliateLink,
  AffiliateConversion,
  AffiliateCommission,
  AffiliateBanner,
  AffiliateAnalytics,
  CreateAffiliateLinkRequest,
  CreateAffiliateLinkResponse,
  TrackAffiliateConversionRequest,
  TrackAffiliateConversionResponse,
  WithdrawAffiliateEarningsRequest,
  WithdrawAffiliateEarningsResponse,
  GenerateAffiliateBannerRequest,
  GenerateAffiliateBannerResponse,
  ConversionStatus,
  CommissionStatus,
} from './types/pack167-affiliates';
import {
  checkAffiliateSafety,
  validateRevenueSplit,
  logBlockedContent,
} from './middleware/pack167-affiliate-safety';
import { HttpsError, auth, increment, onCall, onRequest, onSchedule } from './runtime';


/**
 * Create an affiliate link for a product
 */
export const createAffiliateLink = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = request.auth.uid;

    try {
      // Validate revenue split
      const sellerPercentage = 65;
      const platformFee = 15;
      const referralPercentage = data.referralPercentage;

      const splitValidation = validateRevenueSplit({
        sellerPercentage,
        referralPercentage,
        platformFee,
      });

      if (!splitValidation.isValid) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          splitValidation.errors.join(', ')
        );
      }

      // Check content safety
      const safetyCheck = checkAffiliateSafety({
        text: `${data.productName} ${data.productDescription}`,
      });

      if (!safetyCheck.isAllowed) {
        await logBlockedContent(db, {
          earnerId: userId,
          contentType: 'link',
          contentId: data.productId,
          blockedText: data.productDescription,
          safetyCheck,
        });

        throw new functions.https.HttpsError(
          'invalid-argument',
          `Content blocked: ${safetyCheck.blockedReasons.join(', ')}`
        );
      }

      // Generate unique short code
      const shortCode = Math.random().toString(36).substring(2, 12).toUpperCase();

      // Calculate expiration
      const expiresAt = data.expiresInDays
        ? Timestamp.fromDate(
            new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
          )
        : undefined;

      // Create affiliate link
      const linkData: Omit<AffiliateLink, 'id'> = {
        earnerId: userId,
        productId: data.productId,
        productName: data.productName,
        productDescription: data.productDescription,
        category: data.category,
        sellerPercentage,
        referralPercentage,
        platformFee,
        shortCode,
        fullUrl: `https://platform.app/a/${shortCode}`,
        isActive: true,
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
        affectsRanking: false,
        affectsDiscovery: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...(expiresAt && { expiresAt }),
      };

      const linkRef = await db.collection('affiliate_links').add(linkData);

      return {
        success: true,
        linkId: linkRef.id,
        shortCode,
        fullUrl: linkData.fullUrl,
      };
    } catch (error: any) {
      console.error('Error creating affiliate link:', error);
      return {
        success: false,
        error: error.message || 'Failed to create affiliate link',
      };
    }
  }
);

/**
 * Track an affiliate conversion when a purchase is made
 */
export const trackAffiliateConversion = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const buyerId = request.auth.uid;

    try {
      // Get affiliate link
      const linkDoc = await db
        .collection('affiliate_links')
        .doc(data.affiliateLinkId)
        .get();

      if (!linkDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Affiliate link not found'
        );
      }

      const link = linkDoc.data() as AffiliateLink;

      if (!link.isActive) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Affiliate link is not active'
        );
      }

      // Check if expired
      if (link.expiresAt && link.expiresAt.toDate() < new Date()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Affiliate link has expired'
        );
      }

      // Calculate revenue distribution
      const sellerEarnings =
        (data.purchaseAmount * link.sellerPercentage) / 100;
      const referrerEarnings =
        (data.purchaseAmount * link.referralPercentage) / 100;
      const platformFee = (data.purchaseAmount * link.platformFee) / 100;

      // Get seller information
      const productDoc = await db.collection('products').doc(data.productId).get();
      const sellerId = productDoc.exists
        ? (productDoc.data()?.earnerId as string)
        : link.earnerId;

      // Create conversion record
      const conversionData: Omit<AffiliateConversion, 'id'> = {
        affiliateLinkId: data.affiliateLinkId,
        referrerId: link.earnerId,
        sellerId,
        buyerId,
        productId: data.productId,
        productName: link.productName,
        purchaseAmount: data.purchaseAmount,
        currency: data.currency,
        sellerEarnings,
        referrerEarnings,
        platformFee,
        status: 'pending' as ConversionStatus,
        clickedAt: Timestamp.now(),
        purchasedAt: Timestamp.now(),
        isFraudulent: false,
        ipAddress: request.rawRequest?.ip || 'unknown',
        userAgent: request.rawRequest?.headers['user-agent'] || 'unknown',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const conversionRef = await db
        .collection('affiliate_conversions')
        .add(conversionData);

      // Update link statistics
      await linkDoc.ref.update({
        totalConversions: FieldValue.increment(1),
        totalRevenue: FieldValue.increment(data.purchaseAmount),
        updatedAt: Timestamp.now(),
      });

      // Create commission for referrer (if referral percentage > 0)
      if (link.referralPercentage > 0) {
        await assignCommissionInternal(
          conversionRef.id,
          link.earnerId,
          data.affiliateLinkId,
          referrerEarnings,
          data.currency
        );
      }

      return {
        success: true,
        conversionId: conversionRef.id,
        referrerEarnings,
      };
    } catch (error: any) {
      console.error('Error tracking conversion:', error);
      return {
        success: false,
        error: error.message || 'Failed to track conversion',
      };
    }
  }
);

/**
 * Internal function to assign commission
 */
async function assignCommissionInternal(
  conversionId: string,
  earnerId: string,
  affiliateLinkId: string,
  amount: number,
  currency: string
): Promise<string> {
  // Commission becomes eligible after 30 days
  const eligibleDate = new Date();
  eligibleDate.setDate(eligibleDate.getDate() + 30);

  const commissionData: Omit<AffiliateCommission, 'id'> = {
    earnerId,
    conversionId,
    affiliateLinkId,
    amount,
    currency,
    status: 'pending' as CommissionStatus,
    isPaid: false,
    eligibleForPayoutAt: Timestamp.fromDate(eligibleDate),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const commissionRef = await db
    .collection('affiliate_commissions')
    .add(commissionData);

  // Update analytics
  await updateAnalytics(earnerId);

  return commissionRef.id;
}

/**
 * Assign commission (callable function)
 */
export const assignCommission = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const conversionDoc = await db
        .collection('affiliate_conversions')
        .doc(data.conversionId)
        .get();

      if (!conversionDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Conversion not found'
        );
      }

      const conversion = conversionDoc.data() as AffiliateConversion;

      const commissionId = await assignCommissionInternal(
        data.conversionId,
        conversion.referrerId,
        conversion.affiliateLinkId,
        conversion.referrerEarnings,
        conversion.currency
      );

      return { success: true, commissionId };
    } catch (error: any) {
      console.error('Error assigning commission:', error);
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to assign commission'
      );
    }
  }
);

/**
 * Withdraw affiliate earnings
 */
export const withdrawAffiliateEarnings = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = request.auth.uid;

    try {
      // Get available commissions
      const now = Timestamp.now();
      const commissionsSnapshot = await db
        .collection('affiliate_commissions')
        .where('earnerId', '==', userId)
        .where('status', '==', 'pending')
        .where('isPaid', '==', false)
        .where('eligibleForPayoutAt', '<=', now)
        .get();

      if (commissionsSnapshot.empty) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'No commissions available for payout'
        );
      }

      // Calculate total available
      let totalAvailable = 0;
      commissionsSnapshot.forEach((doc) => {
        const commission = doc.data() as AffiliateCommission;
        totalAvailable += commission.amount;
      });

      if (data.amount > totalAvailable) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Requested amount exceeds available balance (${totalAvailable})`
        );
      }

      // Create withdrawal request
      const withdrawalRef = await db.collection('affiliate_withdrawals').add({
        earnerId: userId,
        amount: data.amount,
        payoutMethod: data.payoutMethod,
        status: 'processing',
        commissionIds: commissionsSnapshot.docs.map((doc) => doc.id),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Update commissions status
      const batch = db.batch();
      let remaining = data.amount;

      for (const doc of commissionsSnapshot.docs) {
        if (remaining <= 0) break;

        const commission = doc.data() as AffiliateCommission;
        const amountToUse = Math.min(remaining, commission.amount);

        batch.update(doc.ref, {
          status: 'processing',
          updatedAt: Timestamp.now(),
        });

        remaining -= amountToUse;
      }

      await batch.commit();

      return {
        success: true,
        withdrawalId: withdrawalRef.id,
        processingTime: '3-5 business days',
      };
    } catch (error: any) {
      console.error('Error withdrawing earnings:', error);
      return {
        success: false,
        error: error.message || 'Failed to withdraw earnings',
      };
    }
  }
);

/**
 * Generate an affiliate banner
 */
export const generateAffiliateBanner = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = request.auth.uid;

    try {
      // Verify link ownership
      const linkDoc = await db
        .collection('affiliate_links')
        .doc(data.affiliateLinkId)
        .get();

      if (!linkDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Affiliate link not found'
        );
      }

      const link = linkDoc.data() as AffiliateLink;

      if (link.earnerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You do not own this affiliate link'
        );
      }

      // Check content safety
      const safetyCheck = checkAffiliateSafety({
        text: data.text,
        imageUrl: data.imageUrl,
      });

      if (!safetyCheck.isAllowed) {
        await logBlockedContent(db, {
          earnerId: userId,
          contentType: 'banner',
          contentId: data.affiliateLinkId,
          blockedText: data.text,
          blockedimageUrl: data.imageUrl,
          safetyCheck,
        });

        throw new functions.https.HttpsError(
          'invalid-argument',
          `Banner content blocked: ${safetyCheck.blockedReasons.join(', ')}`
        );
      }

      // Create banner
      const bannerData: Omit<AffiliateBanner, 'id'> = {
        earnerId: userId,
        affiliateLinkId: data.affiliateLinkId,
        text: data.text,
        imageUrl: data.imageUrl,
        backgroundColor: data.backgroundColor || '#FFFFFF',
        textColor: data.textColor || '#000000',
        width: data.width,
        height: data.height,
        isNSFW: false,
        isSeductive: false,
        isActive: true,
        clickCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const bannerRef = await db.collection('affiliate_banners').add(bannerData);

      return {
        success: true,
        bannerId: bannerRef.id,
        bannerUrl: `https://platform.app/banners/${bannerRef.id}`,
      };
    } catch (error: any) {
      console.error('Error generating banner:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate banner',
      };
    }
  }
);

/**
 * Update analytics for a earner
 */
async function updateAnalytics(earnerId: string): Promise<void> {
  try {
    // Get all affiliate links
    const linksSnapshot = await db
      .collection('affiliate_links')
      .where('earnerId', '==', earnerId)
      .get();

    let totalLinks = 0;
    let activeLinks = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    linksSnapshot.forEach((doc) => {
      const link = doc.data() as AffiliateLink;
      totalLinks++;
      if (link.isActive) activeLinks++;
      totalClicks += link.totalClicks;
      totalConversions += link.totalConversions;
      totalRevenue += link.totalRevenue;
    });

    // Get commissions
    const commissionsSnapshot = await db
      .collection('affiliate_commissions')
      .where('earnerId', '==', earnerId)
      .get();

    let totalCommissions = 0;
    let pendingCommissions = 0;
    let paidCommissions = 0;

    commissionsSnapshot.forEach((doc) => {
      const commission = doc.data() as AffiliateCommission;
      totalCommissions += commission.amount;
      if (!commission.isPaid) {
        pendingCommissions += commission.amount;
      } else {
        paidCommissions += commission.amount;
      }
    });

    const conversionRate = totalClicks > 0 ? totalConversions / totalClicks : 0;

    const analyticsData: Partial<AffiliateAnalytics> = {
      earnerId,
      totalLinks,
      activeLinks,
      totalClicks,
      totalConversions,
      conversionRate,
      totalRevenue,
      totalCommissions,
      pendingCommissions,
      paidCommissions,
      topProducts: [],
      monthlyStats: {},
      lastCalculatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db
      .collection('affiliate_analytics')
      .doc(earnerId)
      .set(analyticsData, { merge: true });
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}

/**
 * Scheduled function to update all analytics daily
 */
export const updateAllAffiliateAnalytics = onSchedule("every 24 hours", async (event) => {
    const earnersSnapshot = await db
      .collection('affiliate_links')
      .select('earnerId')
      .get();

    const uniqueCreators = new Set<string>();
    earnersSnapshot.forEach((doc) => {
      uniqueCreators.add(doc.data().earnerId);
    });

    const promises = Array.from(uniqueCreators).map((earnerId) =>
      updateAnalytics(earnerId)
    );

    await Promise.all(promises);
    console.log(`Updated analytics for ${uniqueCreators.size} earners`);
  });

/**
 * Track clicks on affiliate links
 */
export const trackAffiliateClick = onRequest({}, async (req, res) => {
  const shortCode = req.path.split('/').pop();

  if (!shortCode) {
    res.status(400).send('Invalid link');
    return;
  }

  try {
    const linksSnapshot = await db
      .collection('affiliate_links')
      .where('shortCode', '==', shortCode)
      .limit(1)
      .get();

    if (linksSnapshot.empty) {
      res.status(404).send('Link not found');
      return;
    }

    const linkDoc = linksSnapshot.docs[0];
    const link = linkDoc.data() as AffiliateLink;

    if (!link.isActive) {
      res.status(410).send('Link expired');
      return;
    }

    // Update click count
    await linkDoc.ref.update({
      totalClicks: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });

    // Redirect to product
    res.redirect(`https://platform.app/products/${link.productId}?ref=${shortCode}`);
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).send('Internal error');
  }
});

























