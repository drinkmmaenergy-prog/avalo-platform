/**
 * PACK 432 — Meta Ads Connector
 * 
 * Integration with Meta (Facebook/Instagram) Marketing API for
 * campaign management, creative rotation, and event tracking
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import axios from 'axios';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

interface MetaAdAccount {
  id: string;
  accountId: string;
  accessToken: string;
  businessId: string;
  pixelId: string;
  appId: string;
}

interface MetaCampaignConfig {
  name: string;
  objective: 'APP_INSTALLS' | 'CONVERSIONS' | 'REACH';
  status: 'ACTIVE' | 'PAUSED';
  dailyBudget: number;
  targeting: {
    geoLocations: { countries: string[] };
    ageMin: number;
    ageMax: number;
    genders?: number[]; // 1=male, 2=female
    interests?: Array<{ id: string; name: string }>;
    behaviors?: Array<{ id: string; name: string }>;
    flexibleSpec?: any;
  };
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP';
}

interface MetaCreative {
  id?: string;
  name: string;
  objectStorySpec?: {
    pageId: string;
    instagramActorId?: string;
    linkData?: {
      link: string;
      message: string;
      name: string;
      callToAction: { type: string; value?: { link: string } };
      imageHash?: string;
      videoId?: string;
    };
  };
  degreesOfFreedomSpec?: {
    creativeFeatures: string[];
  };
}

// ===========================
// META API CLIENT
// ===========================

class MetaAdsAPI {
  private accessToken: string;
  private apiVersion = 'v18.0';
  private baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async createCampaign(adAccountId: string, config: MetaCampaignConfig) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/campaigns`,
        {
          name: config.name,
          objective: config.objective,
          status: config.status,
          special_ad_categories: [],
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta campaign creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createAdSet(adAccountId: string, campaignId: string, config: MetaCampaignConfig) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/adsets`,
        {
          name: `${config.name} - AdSet`,
          campaign_id: campaignId,
          daily_budget: config.dailyBudget * 100, // cents
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'APP_INSTALLS',
          bid_strategy: config.bidStrategy,
          targeting: config.targeting,
          status: config.status,
          promoted_object: {
            application_id: '', // Will be filled from account config
            object_store_url: ''
          },
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta adset creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createAd(adAccountId: string, adSetId: string, name: string, creativeId: string, status: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/ads`,
        {
          name,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta ad creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createCreative(adAccountId: string, creative: MetaCreative) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/adcreatives`,
        {
          name: creative.name,
          object_story_spec: creative.objectStorySpec,
          degrees_of_freedom_spec: creative.degreesOfFreedomSpec,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta creative creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateCampaignBudget(campaignId: string, dailyBudget: number) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${campaignId}`,
        {
          daily_budget: dailyBudget * 100,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta budget update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED') {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${campaignId}`,
        {
          status,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta status update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getCampaignInsights(campaignId: string, datePreset: string = 'last_7d') {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${campaignId}/insights`,
        {
          params: {
            date_preset: datePreset,
            fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions,cost_per_action_type,ctr,cpc',
            access_token: this.accessToken
          }
        }
      );

      return response.data.data;
    } catch (error: any) {
      throw new Error(`Meta insights fetch failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async uploadVideo(adAccountId: string, videoUrl: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/advideos`,
        {
          file_url: videoUrl,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta video upload failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async uploadImage(adAccountId: string, imageUrl: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/act_${adAccountId}/adimages`,
        {
          url: imageUrl,
          access_token: this.accessToken
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Meta image upload failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// ===========================
// CLOUD FUNCTIONS
// ===========================

export const syncMetaCampaign = functions.https.onCall(async (data, context) => {
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
  if (campaign.platform !== 'meta') {
    throw new functions.https.HttpsError('invalid-argument', 'Not a Meta campaign');
  }

  // Get Meta account config
  const metaAccountDoc = await db.collection('ua_platform_accounts').doc('meta').get();
  if (!metaAccountDoc.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Meta account not configured');
  }

  const metaAccount = metaAccountDoc.data() as MetaAdAccount;
  const api = new MetaAdsAPI(metaAccount.accessToken);

  // Build campaign config
  const targeting: any = {
    geoLocations: { countries: [campaign.country] },
    ageMin: campaign.ageRange.min,
    ageMax: campaign.ageRange.max
  };

  if (campaign.gender === 'male') targeting.genders = [1];
  if (campaign.gender === 'female') targeting.genders = [2];
  if (campaign.targeting?.interests) targeting.interests = campaign.targeting.interests;

  const metaConfig: MetaCampaignConfig = {
    name: campaign.name,
    objective: 'APP_INSTALLS',
    status: campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
    dailyBudget: campaign.budget.daily,
    targeting,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP'
  };

  try {
    // Create campaign on Meta
    const metaCampaign = await api.createCampaign(metaAccount.accountId, metaConfig);
    
    // Create ad set
    const metaAdSet = await api.createAdSet(metaAccount.accountId, metaCampaign.id, metaConfig);

    // Save Meta IDs to campaign
    await db.collection('ua_campaigns').doc(campaignId).update({
      'metaIds.campaignId': metaCampaign.id,
      'metaIds.adSetId': metaAdSet.id,
      syncedAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      metaCampaignId: metaCampaign.id,
      metaAdSetId: metaAdSet.id
    };

  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const updateMetaCampaignBudget = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, dailyBudget } = data;

  const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaign = campaignDoc.data()!;
  const metaAdSetId = campaign.metaIds?.adSetId;

  if (!metaAdSetId) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with Meta');
  }

  const metaAccountDoc = await db.collection('ua_platform_accounts').doc('meta').get();
  const metaAccount = metaAccountDoc.data() as MetaAdAccount;
  const api = new MetaAdsAPI(metaAccount.accessToken);

  try {
    await api.updateCampaignBudget(metaAdSetId, dailyBudget);

    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const rotateMetaCreatives = functions.https.onCall(async (data, context) => {
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
  const metaAdSetId = campaign.metaIds?.adSetId;

  if (!metaAdSetId) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with Meta');
  }

  // Get top performing creatives for this campaign's profile
  const creativesSnap = await db.collection('ua_creatives')
    .where('platform', '==', 'meta')
    .where('country', '==', campaign.country)
    .where('status', '==', 'approved')
    .orderBy('conversionRate', 'desc')
    .limit(3)
    .get();

  if (creativesSnap.empty) {
    throw new functions.https.HttpsError('not-found', 'No creatives available');
  }

  const metaAccountDoc = await db.collection('ua_platform_accounts').doc('meta').get();
  const metaAccount = metaAccountDoc.data() as MetaAdAccount;
  const api = new MetaAdsAPI(metaAccount.accessToken);

  const createdAds = [];

  for (const creativeDoc of creativesSnap.docs) {
    const creative = creativeDoc.data();

    try {
      // Upload media if needed
      let mediaId = creative.metaMediaId;
      if (!mediaId) {
        if (creative.type === 'video') {
          const videoData = await api.uploadVideo(metaAccount.accountId, creative.url);
          mediaId = videoData.id;
        } else {
          const imageData = await api.uploadImage(metaAccount.accountId, creative.url);
          mediaId = imageData.images[Object.keys(imageData.images)[0]].hash;
        }

        // Save media ID
        await db.collection('ua_creatives').doc(creativeDoc.id).update({
          metaMediaId: mediaId
        });
      }

      // Create creative
      const metaCreative: MetaCreative = {
        name: `${campaign.name} - ${creative.name}`,
        objectStorySpec: {
          pageId: metaAccount.businessId,
          linkData: {
            link: creative.url,
            message: creative.text || '',
            name: 'Install Avalo',
            callToAction: { type: 'INSTALL_MOBILE_APP' },
            videoId: creative.type === 'video' ? mediaId : undefined,
            imageHash: creative.type === 'image' ? mediaId : undefined
          }
        }
      };

      const creativeData = await api.createCreative(metaAccount.accountId, metaCreative);

      // Create ad
      const adData = await api.createAd(
        metaAccount.accountId,
        metaAdSetId,
        `Ad - ${creative.name}`,
        creativeData.id,
        'ACTIVE'
      );

      createdAds.push({
        creativeId: creativeDoc.id,
        metaCreativeId: creativeData.id,
        metaAdId: adData.id
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
// SYNC INSIGHTS FROM META
// ===========================

export const syncMetaInsights = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    // Get all active Meta campaigns
    const campaigns = await db.collection('ua_campaigns')
      .where('platform', '==', 'meta')
      .where('status', '==', 'active')
      .get();

    if (campaigns.empty) return null;

    const metaAccountDoc = await db.collection('ua_platform_accounts').doc('meta').get();
    if (!metaAccountDoc.exists) return null;

    const metaAccount = metaAccountDoc.data() as MetaAdAccount;
    const api = new MetaAdsAPI(metaAccount.accessToken);

    for (const campaignDoc of campaigns.docs) {
      const campaign = campaignDoc.data();
      const metaCampaignId = campaign.metaIds?.campaignId;

      if (!metaCampaignId) continue;

      try {
        const insights = await api.getCampaignInsights(metaCampaignId, 'today');

        if (insights && insights.length > 0) {
          const data = insights[0];

          // Calculate metrics
          const spend = parseFloat(data.spend || '0');
          const impressions = parseInt(data.impressions || '0');
          const clicks = parseInt(data.clicks || '0');
          const installs = data.actions?.find((a: any) => a.action_type === 'mobile_app_install')?.value || 0;

          // Save to performance collection
          await db.collection('ua_performance').add({
            campaignId: campaignDoc.id,
            platform: 'meta',
            country: campaign.country,
            date: new Date().toISOString().split('T')[0],
            impressions,
            clicks,
            installs: parseInt(installs),
            cpi: installs > 0 ? spend / installs : 0,
            ctr: impressions > 0 ? clicks / impressions : 0,
            spend,
            timestamp: admin.firestore.Timestamp.now()
          });
        }

      } catch (error) {
        console.error(`Failed to sync insights for campaign ${campaignDoc.id}:`, error);
      }
    }

    return null;
  });

// ===========================
// PIXEL & SDK EVENT TRACKING
// ===========================

export const trackMetaPixelEvent = functions.https.onCall(async (data, context) => {
  const { event, userId, eventData } = data;

  // Get Meta pixel ID
  const metaAccountDoc = await db.collection('ua_platform_accounts').doc('meta').get();
  if (!metaAccountDoc.exists) {
    return { success: false, error: 'Meta account not configured' };
  }

  const metaAccount = metaAccountDoc.data() as MetaAdAccount;

  try {
    // Send event to Meta Conversions API
    await axios.post(
      `https://graph.facebook.com/v18.0/${metaAccount.pixelId}/events`,
      {
        data: [{
          event_name: event,
          event_time: Math.floor(Date.now() / 1000),
          user_data: {
            external_id: userId
          },
          custom_data: eventData,
          action_source: 'app'
        }],
        access_token: metaAccount.accessToken
      }
    );

    return { success: true };

  } catch (error: any) {
    console.error('Meta pixel event tracking failed:', error);
    return { success: false, error: error.message };
  }
});

// ===========================
// EXPORTS
// ===========================

export const metaConnector = {
  syncMetaCampaign,
  updateMetaCampaignBudget,
  rotateMetaCreatives,
  syncMetaInsights,
  trackMetaPixelEvent
};
