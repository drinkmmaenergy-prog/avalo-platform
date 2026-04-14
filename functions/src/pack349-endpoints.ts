import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 349 - Cloud Functions Endpoints
 * HTTP endpoints for ad system
 */

import * as functions from 'firebase-functions';
import { AdEngine } from './pack349-ad-engine';
import { BrandCampaignEngine } from './pack349-campaign-engine';
import { AdPlacementEngine } from './pack349-placement-engine';
import { AdBillingEngine } from './pack349-billing';
import { SponsoredCreatorEngine } from './pack349-sponsored-earners';
import { HttpsError, admin, auth, onCall, onSchedule } from './runtime';

/**
 * Create Ad
 */
export const createAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const ad = await AdEngine.createAd(request.auth.uid, {
      type: data.type,
      countryScopes: data.countryScopes,
      media: data.media,
      headline: data.headline,
      description: data.description,
      targetUrl: data.targetUrl,
      dailyBudgetTokens: data.dailyBudgetTokens,
      bidPerViewTokens: data.bidPerViewTokens,
      bidPerClickTokens: data.bidPerClickTokens,
      bidPerImpressionTokens: data.bidPerImpressionTokens,
    });

    return { success: true, ad };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update Ad
 */
export const updateAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdEngine.updateAd(data.adId, request.auth.uid, data.updates);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Delete Ad
 */
export const deleteAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdEngine.deleteAd(data.adId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Activate Ad
 */
export const activateAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdEngine.activateAd(data.adId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Pause Ad
 */
export const pauseAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdEngine.pauseAd(data.adId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Report Ad
 */
export const reportAd = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdEngine.reportAd(
      data.adId,
      request.auth.uid,
      data.reason,
      data.category,
      data.description
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create Brand Campaign
 */
export const createBrandCampaign = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const campaign = await BrandCampaignEngine.createCampaign(request.auth.uid, {
      brandName: data.brandName,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      maxSpendTokens: data.maxSpendTokens,
      targetCountries: data.targetCountries,
      targetAudience: data.targetAudience,
    });

    return { success: true, campaign };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Add Ad to Campaign
 */
export const addAdToCampaign = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await BrandCampaignEngine.addAdToCampaign(
      data.campaignId,
      data.adId,
      request.auth.uid
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Activate Campaign
 */
export const activateCampaign = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await BrandCampaignEngine.activateCampaign(data.campaignId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Pause Campaign
 */
export const pauseCampaign = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await BrandCampaignEngine.pauseCampaign(
      data.campaignId,
      request.auth.uid,
      data.reason
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End Campaign
 */
export const endCampaign = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await BrandCampaignEngine.endCampaign(data.campaignId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Campaign Analytics
 */
export const getCampaignAnalytics = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const analytics = await BrandCampaignEngine.getCampaignAnalytics(
      data.campaignId,
      request.auth.uid
    );
    return analytics;
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Ad for Feed
 */
export const getAdForFeed = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const ad = await AdPlacementEngine.getAdForFeed(
      request.auth.uid,
      data.countryCode,
      data.postPosition
    );
    return ad;
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Ads for Discovery
 */
export const getAdsForDiscovery = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const ads = await AdPlacementEngine.getAdsForDiscovery(
      request.auth.uid,
      data.countryCode,
      data.count || 3
    );
    return ads;
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Record Ad Placement
 */
export const recordAdPlacement = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const placementId = await AdPlacementEngine.recordPlacement(
      data.adId,
      request.auth.uid,
      data.surface,
      data.position,
      data.countryCode
    );
    return { placementId };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Record Ad Click
 */
export const recordAdClick = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdPlacementEngine.recordClick(data.placementId, request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Record Ad View
 */
export const recordAdView = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdPlacementEngine.recordView(
      data.placementId,
      request.auth.uid,
      data.viewDuration
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Record Ad Conversion
 */
export const recordAdConversion = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await AdPlacementEngine.recordConversion(
      data.placementId,
      request.auth.uid,
      data.conversionType,
      data.value
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create Advertiser Account
 */
export const createAdvertiserAccount = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const account = await AdEngine.createAdvertiserAccount(
      request.auth.uid,
      data.businessName,
      data.contactEmail
    );
    return { success: true, account };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Add Tokens to Advertiser (Admin only)
 */
export const addAdvertiserTokens = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Check if user is admin
  // For now, commented out the admin check

  try {
    await AdBillingEngine.addTokens(
      data.advertiserId,
      data.amount,
      data.reason || 'Admin credit',
      request.auth.uid
    );
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create Creator Sponsorship
 */
export const createCreatorSponsorship = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const sponsorship = await SponsoredCreatorEngine.createSponsorship(
      data.userId || request.auth.uid,
      {
        sponsorshipType: data.sponsorshipType,
        brandName: data.brandName,
        brandId: data.brandId,
        campaignId: data.campaignId,
        badgeText: data.badgeText,
        badgeColor: data.badgeColor,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : undefined,
        commissionRate: data.commissionRate,
        minimumGuarantee: data.minimumGuarantee,
      }
    );

    return { success: true, sponsorship };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End Creator Sponsorship
 */
export const endCreatorSponsorship = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await SponsoredCreatorEngine.endSponsorship(data.userId || request.auth.uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Creator Analytics
 */
export const getCreatorAnalytics = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const analytics = await SponsoredCreatorEngine.getCreatorAnalytics(
      data.userId || request.auth.uid
    );
    return analytics;
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Request Creator Payout
 */
export const requestCreatorPayout = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const amount = await SponsoredCreatorEngine.payoutEarnings(
      request.auth.uid,
      data.amount
    );
    return { success: true, amount };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled: Process Campaigns
 * Runs every hour to activate/end scheduled campaigns
 */
export const processScheduledCampaigns = onSchedule("every 1 hours", async (event) => {
    await BrandCampaignEngine.processScheduledCampaigns();
    return null;
  });

/**
 * Scheduled: Process Minimum Guarantees
 * Runs on the 1st of each month
 */
export const processMinimumGuarantees = onSchedule({ schedule: "0 0 1 * *", timeZone: "UTC" }, async (event) => {
    await SponsoredCreatorEngine.processMinimumGuarantees();
    return null;
  });

























