/**
 * PACK 432 — TikTok Ads Connector
 * 
 * Integration with TikTok Marketing API for campaign management,
 * creative deployment, and performance tracking
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import axios from 'axios';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

interface TikTokAdAccount {
  id: string;
  advertiserId: string;
  accessToken: string;
  appId: string;
  pixelCode: string;
}

interface TikTokCampaignConfig {
  campaignName: string;
  objective: 'APP_INSTALL' | 'REACH' | 'VIDEO_VIEWS';
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  budget: number;
}

interface TikTokAdGroupConfig {
  campaignId: string;
  adgroupName: string;
  placementType: 'PLACEMENT_TYPE_AUTOMATIC' | 'PLACEMENT_TYPE_NORMAL';
  promotionType: 'APP_INSTALL';
  appId: string;
  pixelId: string;
  optimizationGoal: 'INSTALL' | 'CLICK' | 'SHOW';
  bidType: 'BID_TYPE_NO_BID' | 'BID_TYPE_CUSTOM';
  budget: number;
  scheduleType: 'SCHEDULE_FROM_NOW' | 'SCHEDULE_START_END';
  location: string[];
  gender: 'MALE' | 'FEMALE' | 'NONE';
  ageGroups: string[];
  languages: string[];
  operatingSystems: string[];
}

interface TikTokCreative {
  adgroupId: string;
  adName: string;
  adText: string;
  callToAction: string;
  impressionTrackingUrl?: string;
  clickTrackingUrl?: string;
  videoId?: string;
  imageIds?: string[];
  identityType: 'CUSTOMIZED_USER' | 'AUTH_IDENTITY';
  identityId?: string;
}

// ===========================
// TIKTOK API CLIENT
// ===========================

class TikTokAdsAPI {
  private accessToken: string;
  private baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private getHeaders() {
    return {
      'Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };
  }

  async createCampaign(advertiserId: string, config: TikTokCampaignConfig) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/campaign/create/`,
        {
          advertiser_id: advertiserId,
          campaign_name: config.campaignName,
          objective_type: config.objective,
          budget_mode: config.budgetMode,
          budget: config.budget
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok campaign creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async createAdGroup(advertiserId: string, config: TikTokAdGroupConfig) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/adgroup/create/`,
        {
          advertiser_id: advertiserId,
          campaign_id: config.campaignId,
          adgroup_name: config.adgroupName,
          placement_type: config.placementType,
          promotion_type: config.promotionType,
          app_id: config.appId,
          pixel_id: config.pixelId,
          optimization_goal: config.optimizationGoal,
          bid_type: config.bidType,
          budget: config.budget,
          schedule_type: config.scheduleType,
          location_ids: config.location,
          gender: config.gender,
          age_groups: config.ageGroups,
          languages: config.languages,
          operating_systems: config.operatingSystems
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok ad group creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async createAd(advertiserId: string, creative: TikTokCreative) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/ad/create/`,
        {
          advertiser_id: advertiserId,
          adgroup_id: creative.adgroupId,
          ad_name: creative.adName,
          ad_text: creative.adText,
          call_to_action: creative.callToAction,
          video_id: creative.videoId,
          image_ids: creative.imageIds,
          identity_type: creative.identityType,
          identity_id: creative.identityId,
          impression_tracking_url: creative.impressionTrackingUrl,
          click_tracking_url: creative.clickTrackingUrl
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok ad creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateCampaignStatus(advertiserId: string, campaignIds: string[], optStatus: 'ENABLE' | 'DISABLE') {
    try {
      const response = await axios.post(
        `${this.baseUrl}/campaign/update/status/`,
        {
          advertiser_id: advertiserId,
          campaign_ids: campaignIds,
          opt_status: optStatus
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok status update failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateAdGroupBudget(advertiserId: string, adgroupId: string, budget: number) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/adgroup/update/`,
        {
          advertiser_id: advertiserId,
          adgroup_id: adgroupId,
          budget: budget
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok budget update failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getReports(advertiserId: string, campaignIds: string[], startDate: string, endDate: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/reports/integrated/get/`,
        {
          headers: this.getHeaders(),
          params: {
            advertiser_id: advertiserId,
            report_type: 'BASIC',
            data_level: 'AUCTION_CAMPAIGN',
            dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
            metrics: JSON.stringify([
              'campaign_name', 'spend', 'impressions', 'clicks', 'ctr',
              'conversion', 'cost_per_conversion', 'conversion_rate'
            ]),
            start_date: startDate,
            end_date: endDate,
            filtering: JSON.stringify([{
              field_name: 'campaign_id',
              filter_type: 'IN',
              filter_value: campaignIds
            }])
          }
        }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok reports fetch failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async uploadVideo(advertiserId: string, videoUrl: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/file/video/ad/upload/`,
        {
          advertiser_id: advertiserId,
          video_url: videoUrl,
          upload_type: 'UPLOAD_BY_URL'
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok video upload failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async uploadImage(advertiserId: string, imageUrl: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/file/image/ad/upload/`,
        {
          advertiser_id: advertiserId,
          image_url: imageUrl,
          upload_type: 'UPLOAD_BY_URL'
        },
        { headers: this.getHeaders() }
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`TikTok image upload failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// ===========================
// CLOUD FUNCTIONS
// ===========================

export const syncTikTokCampaign = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId } = data;

  // Get campaign from Firestore
  const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaign = campaignDoc.data()!;
  if (campaign.platform !== 'tiktok') {
    throw new functions.https.HttpsError('invalid-argument', 'Not a TikTok campaign');
  }

  // Get TikTok account config
  const tiktokAccountDoc = await db.collection('ua_platform_accounts').doc('tiktok').get();
  if (!tiktokAccountDoc.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'TikTok account not configured');
  }

  const tiktokAccount = tiktokAccountDoc.data() as TikTokAdAccount;
  const api = new TikTokAdsAPI(tiktokAccount.accessToken);

  try {
    // Create campaign on TikTok
    const tiktokCampaignConfig: TikTokCampaignConfig = {
      campaignName: campaign.name,
      objective: 'APP_INSTALL',
      budgetMode: 'BUDGET_MODE_DAY',
      budget: campaign.budget.daily
    };

    const tiktokCampaign = await api.createCampaign(tiktokAccount.advertiserId, tiktokCampaignConfig);

    // Map age ranges to TikTok format
    const ageGroups: string[] = [];
    if (campaign.ageRange.min <= 24 && campaign.ageRange.max >= 18) ageGroups.push('AGE_18_24');
    if (campaign.ageRange.min <= 34 && campaign.ageRange.max >= 25) ageGroups.push('AGE_25_34');
    if (campaign.ageRange.min <= 44 && campaign.ageRange.max >= 35) ageGroups.push('AGE_35_44');
    if (campaign.ageRange.min <= 54 && campaign.ageRange.max >= 45) ageGroups.push('AGE_45_54');
    if (campaign.ageRange.max >= 55) ageGroups.push('AGE_55_100');

    // Create ad group
    const adGroupConfig: TikTokAdGroupConfig = {
      campaignId: tiktokCampaign.campaign_id,
      adgroupName: `${campaign.name} - AdGroup`,
      placementType: 'PLACEMENT_TYPE_AUTOMATIC',
      promotionType: 'APP_INSTALL',
      appId: tiktokAccount.appId,
      pixelId: tiktokAccount.pixelCode,
      optimizationGoal: 'INSTALL',
      bidType: 'BID_TYPE_NO_BID',
      budget: campaign.budget.daily,
      scheduleType: 'SCHEDULE_FROM_NOW',
      location: [campaign.country],
      gender: campaign.gender === 'male' ? 'MALE' : campaign.gender === 'female' ? 'FEMALE' : 'NONE',
      ageGroups,
      languages: ['en'],
      operatingSystems: ['ANDROID', 'IOS']
    };

    const tiktokAdGroup = await api.createAdGroup(tiktokAccount.advertiserId, adGroupConfig);

    // Save TikTok IDs to campaign
    await db.collection('ua_campaigns').doc(campaignId).update({
      'tiktokIds.campaignId': tiktokCampaign.campaign_id,
      'tiktokIds.adGroupId': tiktokAdGroup.adgroup_id,
      syncedAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      tiktokCampaignId: tiktokCampaign.campaign_id,
      tiktokAdGroupId: tiktokAdGroup.adgroup_id
    };

  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const updateTikTokCampaignBudget = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, dailyBudget } = data;

  const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaign = campaignDoc.data()!;
  const tiktokAdGroupId = campaign.tiktokIds?.adGroupId;

  if (!tiktokAdGroupId) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with TikTok');
  }

  const tiktokAccountDoc = await db.collection('ua_platform_accounts').doc('tiktok').get();
  const tiktokAccount = tiktokAccountDoc.data() as TikTokAdAccount;
  const api = new TikTokAdsAPI(tiktokAccount.accessToken);

  try {
    await api.updateAdGroupBudget(tiktokAccount.advertiserId, tiktokAdGroupId, dailyBudget);

    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const rotateTikTokCreatives = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId } = data;

  // Get campaign
  const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaign = campaignDoc.data()!;
  const tiktokAdGroupId = campaign.tiktokIds?.adGroupId;

  if (!tiktokAdGroupId) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with TikTok');
  }

  // Get top performing creatives
  const creativesSnap = await db.collection('ua_creatives')
    .where('platform', '==', 'tiktok')
    .where('country', '==', campaign.country)
    .where('status', '==', 'approved')
    .orderBy('conversionRate', 'desc')
    .limit(5)
    .get();

  if (creativesSnap.empty) {
    throw new functions.https.HttpsError('not-found', 'No creatives available');
  }

  const tiktokAccountDoc = await db.collection('ua_platform_accounts').doc('tiktok').get();
  const tiktokAccount = tiktokAccountDoc.data() as TikTokAdAccount;
  const api = new TikTokAdsAPI(tiktokAccount.accessToken);

  const createdAds = [];

  for (const creativeDoc of creativesSnap.docs) {
    const creative = creativeDoc.data();

    try {
      // Upload media if needed
      let mediaId = creative.tiktokMediaId;
      if (!mediaId) {
        if (creative.type === 'video') {
          const videoData = await api.uploadVideo(tiktokAccount.advertiserId, creative.url);
          mediaId = videoData.video_id;
        } else {
          const imageData = await api.uploadImage(tiktokAccount.advertiserId, creative.url);
          mediaId = imageData.image_id;
        }

        // Save media ID
        await db.collection('ua_creatives').doc(creativeDoc.id).update({
          tiktokMediaId: mediaId
        });
      }

      // Create ad
      const tiktokCreative: TikTokCreative = {
        adgroupId: tiktokAdGroupId,
        adName: `${campaign.name} - ${creative.name}`,
        adText: creative.text || 'Download Avalo now!',
        callToAction: 'INSTALL_NOW',
        videoId: creative.type === 'video' ? mediaId : undefined,
        imageIds: creative.type === 'image' ? [mediaId] : undefined,
        identityType: 'CUSTOMIZED_USER'
      };

      const adData = await api.createAd(tiktokAccount.advertiserId, tiktokCreative);

      createdAds.push({
        creativeId: creativeDoc.id,
        tiktokAdId: adData.ad_id
      });

    } catch (error: any) {
      console.error(`Failed to create ad for creative ${creativeDoc.id}:`, error);
    }
  }

  return {
    success: true,
    adsCreated: createdAds.length,
    ads: createdAds
  };
});

// ===========================
// SYNC REPORTS FROM TIKTOK
// ===========================

export const syncTikTokReports = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    // Get all active TikTok campaigns
    const campaigns = await db.collection('ua_campaigns')
      .where('platform', '==', 'tiktok')
      .where('status', '==', 'active')
      .get();

    if (campaigns.empty) return null;

    const tiktokAccountDoc = await db.collection('ua_platform_accounts').doc('tiktok').get();
    if (!tiktokAccountDoc.exists) return null;

    const tiktokAccount = tiktokAccountDoc.data() as TikTokAdAccount;
    const api = new TikTokAdsAPI(tiktokAccount.accessToken);

    // Get campaign IDs
    const campaignIds = campaigns.docs
      .map(doc => doc.data().tiktokIds?.campaignId)
      .filter(id => id);

    if (campaignIds.length === 0) return null;

    try {
      const today = new Date().toISOString().split('T')[0];
      const reports = await api.getReports(tiktokAccount.advertiserId, campaignIds, today, today);

      if (reports.list && reports.list.length > 0) {
        for (const report of reports.list) {
          // Find corresponding Firestore campaign
          const campaign = campaigns.docs.find(doc => 
            doc.data().tiktokIds?.campaignId === report.dimensions.campaign_id
          );

          if (!campaign) continue;

          const campaignData = campaign.data();
          const spend = parseFloat(report.metrics.spend || '0');
          const impressions = parseInt(report.metrics.impressions || '0');
          const clicks = parseInt(report.metrics.clicks || '0');
          const installs = parseInt(report.metrics.conversion || '0');

          // Save to performance collection
          await db.collection('ua_performance').add({
            campaignId: campaign.id,
            platform: 'tiktok',
            country: campaignData.country,
            date: report.dimensions.stat_time_day,
            impressions,
            clicks,
            installs,
            cpi: installs > 0 ? spend / installs : 0,
            ctr: impressions > 0 ? clicks / impressions : 0,
            spend,
            timestamp: admin.firestore.Timestamp.now()
          });
        }
      }

    } catch (error) {
      console.error('Failed to sync TikTok reports:', error);
    }

    return null;
  });

// ===========================
// EVENT TRACKING
// ===========================

export const trackTikTokEvent = functions.https.onCall(async (data, context) => {
  const { event, userId, eventData } = data;

  // Get TikTok pixel code
  const tiktokAccountDoc = await db.collection('ua_platform_accounts').doc('tiktok').get();
  if (!tiktokAccountDoc.exists) {
    return { success: false, error: 'TikTok account not configured' };
  }

  const tiktokAccount = tiktokAccountDoc.data() as TikTokAdAccount;

  try {
    // Send event to TikTok Events API
    await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      {
        pixel_code: tiktokAccount.pixelCode,
        event: event,
        timestamp: new Date().toISOString(),
        context: {
          user: {
            external_id: userId
          }
        },
        properties: eventData
      },
      {
        headers: {
          'Access-Token': tiktokAccount.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true };

  } catch (error: any) {
    console.error('TikTok event tracking failed:', error);
    return { success: false, error: error.message };
  }
});

// ===========================
// EXPORTS
// ===========================

export const tiktokConnector = {
  syncTikTokCampaign,
  updateTikTokCampaignBudget,
  rotateTikTokCreatives,
  syncTikTokReports,
  trackTikTokEvent
};
