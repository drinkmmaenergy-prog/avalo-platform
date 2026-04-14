import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 145 - Ad Network API Endpoints
 * HTTP callable functions for advertisers and users
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { AdEngine } from './pack145-ad-engine';
import { AdPlacementEngine } from './pack145-placement-engine';
import { db } from './init';
import { auth, functions, onSchedule } from './runtime';

export const createAdCampaign = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const campaign = await AdEngine.createCampaign(uid, request.data);
    console.log('Scheduled job result:', { success: true, campaign });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const uploadAdAsset = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const asset = await AdEngine.uploadAdAsset(uid, request.data);
    console.log('Scheduled job result:', { success: true, asset });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const attachAssetToCampaign = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { campaignId, assetId } = request.data;
  if (!campaignId || !assetId) {
    throw new HttpsError('invalid-argument', 'Campaign ID and Asset ID are required');
  }

  try {
    await AdEngine.attachAssetToCampaign(campaignId, assetId, uid);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const updateCampaignStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { campaignId, status } = request.data;
  if (!campaignId || !status) {
    throw new HttpsError('invalid-argument', 'Campaign ID and status are required');
  }

  try {
    await AdEngine.updateCampaignStatus(campaignId, status, uid);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMyCampaigns = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const snapshot = await db
      .collection('ad_campaigns')
      .where('advertiserId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const campaigns = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log('Scheduled job result:', { success: true, campaigns });


    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMyAdAssets = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const snapshot = await db
      .collection('ad_assets')
      .where('advertiserId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const assets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log('Scheduled job result:', { success: true, assets });


    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getCampaignAnalytics = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { campaignId, startDate, endDate } = request.data;
  if (!campaignId) {
    throw new HttpsError('invalid-argument', 'Campaign ID is required');
  }

  try {
    const analytics = await AdEngine.getCampaignAnalytics(
      campaignId,
      uid,
      startDate,
      endDate
    );
    console.log('Scheduled job result:', { success: true, analytics });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const recordAdImpression = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { placementId, metadata } = request.data;
  if (!placementId) {
    throw new HttpsError('invalid-argument', 'Placement ID is required');
  }

  try {
    await AdEngine.recordAdInteraction(placementId, 'impression', metadata);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const recordAdClick = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { placementId, metadata } = request.data;
  if (!placementId) {
    throw new HttpsError('invalid-argument', 'Placement ID is required');
  }

  try {
    await AdEngine.recordAdInteraction(placementId, 'click', metadata);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const recordAdView = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { placementId, duration, metadata } = request.data;
  if (!placementId) {
    throw new HttpsError('invalid-argument', 'Placement ID is required');
  }

  try {
    await AdEngine.recordAdInteraction(placementId, 'view', {
      ...metadata,
      viewDuration: duration,
    });
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const recordAdConversion = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { placementId, conversionType, conversionValue, metadata } = request.data;
  if (!placementId || !conversionType) {
    throw new HttpsError('invalid-argument', 'Placement ID and conversion type are required');
  }

  try {
    await AdEngine.recordAdInteraction(placementId, 'conversion', {
      ...metadata,
      conversionType,
      conversionValue,
    });
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getFeedAds = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { feedPosition } = request.data;
  if (typeof feedPosition !== 'number') {
    throw new HttpsError('invalid-argument', 'Feed position is required');
  }

  try {
    const placement = await AdPlacementEngine.getFeedAdsForUser(uid, feedPosition);
    if (!placement) {
      console.log('Scheduled job result:', { success: true, placement: null });

      return;
    }

    const adData = await AdPlacementEngine.getAdWithAsset(placement.id);
    console.log('Scheduled job result:', { success: true, ad: adData });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getClubAds = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { clubId } = request.data;
  if (!clubId) {
    throw new HttpsError('invalid-argument', 'Club ID is required');
  }

  try {
    const placements = await AdPlacementEngine.getClubAds(uid, clubId);
    const ads = await Promise.all(
      placements.map(p => AdPlacementEngine.getAdWithAsset(p.id))
    );
    console.log('Scheduled job result:', { success: true, ads: ads.filter(a => a !== null) });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getDiscoveryAds = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category } = request.data;

  try {
    const placements = await AdPlacementEngine.getDiscoveryAds(uid, category);
    const ads = await Promise.all(
      placements.map(p => AdPlacementEngine.getAdWithAsset(p.id))
    );
    console.log('Scheduled job result:', { success: true, ads: ads.filter(a => a !== null) });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getEventRecommendationAds = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { eventType } = request.data;

  try {
    const placements = await AdPlacementEngine.getEventRecommendationAds(uid, eventType);
    const ads = await Promise.all(
      placements.map(p => AdPlacementEngine.getAdWithAsset(p.id))
    );
    console.log('Scheduled job result:', { success: true, ads: ads.filter(a => a !== null) });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const reportAd = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { campaignId, reason, description } = request.data;
  if (!campaignId || !reason) {
    throw new HttpsError('invalid-argument', 'Campaign ID and reason are required');
  }

  try {
    const reportRef = db.collection('ad_reports').doc();
    await reportRef.set({
      id: reportRef.id,
      campaignId,
      reporterId: uid,
      reason,
      description: description || '',
      status: 'pending',
      createdAt: new Date(),
    });

    console.log('Scheduled job result:', { success: true, reportId: reportRef.id });


    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getAdvertiserStrikes = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const strikes = await AdEngine.getAdvertiserStrikes(uid);
    console.log('Scheduled job result:', { success: true, strikes });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getPlacementStats = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { campaignId } = request.data;
  if (!campaignId) {
    throw new HttpsError('invalid-argument', 'Campaign ID is required');
  }

  try {
    const campaign = await db.collection('ad_campaigns').doc(campaignId).get();
    if (!campaign.exists || campaign.data()?.advertiserId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    const stats = await AdPlacementEngine.getPlacementStats(campaignId);
    console.log('Scheduled job result:', { success: true, stats });

    return;
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const cleanupExpiredAdPlacements = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
  },
  async () => {
    await AdPlacementEngine.cleanupExpiredPlacements();
  }
);

export const updateCampaignBudgets = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'UTC',
  },
  async () => {
    const campaigns = await db
      .collection('ad_campaigns')
      .where('status', '==', 'active')
      .get();

    const batch = db.batch();
    const now = new Date();

    campaigns.docs.forEach(doc => {
      const data = doc.data();
      
      if (data.budget.remaining <= 0) {
        batch.update(doc.ref, {
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        });
      }

      if (data.schedule.endDate && data.schedule.endDate.toDate() < now) {
        batch.update(doc.ref, {
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        });
      }
    });

    await batch.commit();
  }
);

























