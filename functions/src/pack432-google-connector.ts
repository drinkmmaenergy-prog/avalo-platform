/**
 * PACK 432 — Google Ads Connector
 * 
 * Integration with Google Ads API for App Campaigns (UAC),
 * automated bidding, and conversion tracking
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import axios from 'axios';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

interface GoogleAdsAccount {
  id: string;
  customerId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  tokenExpiry?: number;
}

interface GoogleAppCampaignConfig {
  name: string;
  advertisingChannelType: 'MULTI_CHANNEL';
  advertisingChannelSubType: 'APP_CAMPAIGN' | 'APP_CAMPAIGN_FOR_ENGAGEMENT';
  biddingStrategyType: 'TARGET_CPA' | 'TARGET_ROAS' | 'MAXIMIZE_CONVERSIONS';
  targetCpa?: number; // In micros
  targetRoas?: number;
  budget: number; // Daily budget in micros
  geoTargets: string[];
  languages: string[];
  startDate: string;
  appId: string;
  appStore: 'GOOGLE_APP_STORE' | 'APPLE_APP_STORE';
}

interface GoogleAdAsset {
  type: 'TEXT' | 'IMAGE' | 'YOUTUBE_VIDEO' | 'MEDIA_BUNDLE';
  text?: string;
  youtubeVideoId?: string;
  imageUrl?: string;
}

// ===========================
// GOOGLE ADS API CLIENT
// ===========================

class GoogleAdsAPI {
  private config: GoogleAdsAccount;
  private baseUrl = 'https://googleads.googleapis.com/v14';

  constructor(config: GoogleAdsAccount) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    // Check if current token is still valid
    if (this.config.accessToken && this.config.tokenExpiry && Date.now() < this.config.tokenExpiry) {
      return this.config.accessToken;
    }

    // Refresh token
    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token'
      });

      this.config.accessToken = response.data.access_token;
      this.config.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      // Update in Firestore
      await db.collection('ua_platform_accounts').doc('google').update({
        accessToken: this.config.accessToken,
        tokenExpiry: this.config.tokenExpiry
      });

      return this.config.accessToken;

    } catch (error: any) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  private async getHeaders() {
    const accessToken = await this.getAccessToken();
    return {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': this.config.developerToken,
      'Content-Type': 'application/json'
    };
  }

  async createAppCampaign(config: GoogleAppCampaignConfig) {
    try {
      const headers = await this.getHeaders();

      // Create campaign
      const campaignOperation = {
        create: {
          name: config.name,
          advertisingChannelType: config.advertisingChannelType,
          advertisingChannelSubType: config.advertisingChannelSubType,
          status: 'PAUSED',
          biddingStrategyType: config.biddingStrategyType,
          targetCpa: config.targetCpa ? { targetCpaMicros: config.targetCpa } : undefined,
          targetRoas: config.targetRoas ? { targetRoas: config.targetRoas } : undefined,
          campaignBudget: {
            amountMicros: config.budget,
            deliveryMethod: 'STANDARD'
          },
          appCampaignSetting: {
            appId: config.appId,
            appStore: config.appStore,
            biddingStrategyGoalType: 'OPTIMIZE_INSTALLS_TARGET_INSTALL_COST'
          },
          startDate: config.startDate,
          geoTargetTypeSetting: {
            positiveGeoTargetType: 'PRESENCE',
            negativeGeoTargetType: 'PRESENCE'
          }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/campaigns:mutate`,
        {
          operations: [campaignOperation]
        },
        { headers }
      );

      const campaignResourceName = response.data.results[0].resourceName;
      const campaignId = campaignResourceName.split('/').pop();

      return { campaignId, resourceName: campaignResourceName };

    } catch (error: any) {
      throw new Error(`Google campaign creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createAdGroup(campaignResourceName: string, name: string) {
    try {
      const headers = await this.getHeaders();

      const adGroupOperation = {
        create: {
          name,
          campaign: campaignResourceName,
          status: 'ENABLED',
          type: 'DISPLAY_STANDARD'
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/adGroups:mutate`,
        {
          operations: [adGroupOperation]
        },
        { headers }
      );

      const adGroupResourceName = response.data.results[0].resourceName;
      const adGroupId = adGroupResourceName.split('/').pop();

      return { adGroupId, resourceName: adGroupResourceName };

    } catch (error: any) {
      throw new Error(`Google ad group creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async addAssets(campaignResourceName: string, assets: GoogleAdAsset[]) {
    try {
      const headers = await this.getHeaders();

      const operations = assets.map(asset => {
        let assetData: any = {
          type: asset.type
        };

        if (asset.type === 'TEXT' && asset.text) {
          assetData.textAsset = { text: asset.text };
        } else if (asset.type === 'YOUTUBE_VIDEO' && asset.youtubeVideoId) {
          assetData.youtubeVideoAsset = { youtubeVideoId: asset.youtubeVideoId };
        } else if (asset.type === 'IMAGE' && asset.imageUrl) {
          assetData.imageAsset = { fullSizeImageUrl: asset.imageUrl };
        }

        return {
          create: {
            campaign: campaignResourceName,
            asset: assetData,
            fieldType: asset.type === 'TEXT' ? 'HEADLINE' : 'MARKETING_IMAGE'
          }
        };
      });

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/campaignAssets:mutate`,
        { operations },
        { headers }
      );

      return response.data.results;

    } catch (error: any) {
      throw new Error(`Google assets creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateCampaignStatus(campaignResourceName: string, status: 'ENABLED' | 'PAUSED') {
    try {
      const headers = await this.getHeaders();

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/campaigns:mutate`,
        {
          operations: [{
            update: {
              resourceName: campaignResourceName,
              status
            },
            updateMask: 'status'
          }]
        },
        { headers }
      );

      return response.data;

    } catch (error: any) {
      throw new Error(`Google status update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateCampaignBudget(campaignResourceName: string, budgetMicros: number) {
    try {
      const headers = await this.getHeaders();

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/campaigns:mutate`,
        {
          operations: [{
            update: {
              resourceName: campaignResourceName,
              campaignBudget: {
                amountMicros: budgetMicros
              }
            },
            updateMask: 'campaign_budget.amount_micros'
          }]
        },
        { headers }
      );

      return response.data;

    } catch (error: any) {
      throw new Error(`Google budget update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getCampaignStats(campaignId: string, startDate: string, endDate: string) {
    try {
      const headers = await this.getHeaders();

      const query = `
        SELECT
          campaign.id,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.cost_per_conversion,
          metrics.conversions_value,
          metrics.average_cpc
        FROM campaign
        WHERE campaign.id = ${campaignId}
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `;

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/googleAds:searchStream`,
        { query },
        { headers }
      );

      return response.data;

    } catch (error: any) {
      throw new Error(`Google stats fetch failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async setGeoTargeting(campaignResourceName: string, locationIds: string[]) {
    try {
      const headers = await this.getHeaders();

      const operations = locationIds.map(locationId => ({
        create: {
          campaign: campaignResourceName,
          criterionId: locationId
        }
      }));

      const response = await axios.post(
        `${this.baseUrl}/customers/${this.config.customerId}/campaignCriteria:mutate`,
        { operations },
        { headers }
      );

      return response.data;

    } catch (error: any) {
      throw new Error(`Google geo targeting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// ===========================
// CLOUD FUNCTIONS
// ===========================

export const syncGoogleCampaign = functions.https.onCall(async (data, context) => {
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
  if (campaign.platform !== 'google') {
    throw new functions.https.HttpsError('invalid-argument', 'Not a Google campaign');
  }

  // Get Google Ads account config
  const googleAccountDoc = await db.collection('ua_platform_accounts').doc('google').get();
  if (!googleAccountDoc.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Google account not configured');
  }

  const googleAccount = googleAccountDoc.data() as GoogleAdsAccount;
  const api = new GoogleAdsAPI(googleAccount);

  try {
    // Build campaign config
    const googleConfig: GoogleAppCampaignConfig = {
      name: campaign.name,
      advertisingChannelType: 'MULTI_CHANNEL',
      advertisingChannelSubType: 'APP_CAMPAIGN',
      biddingStrategyType: 'TARGET_CPA',
      targetCpa: 5000000, // $5 in micros
      budget: campaign.budget.daily * 1000000, // Convert to micros
      geoTargets: [campaign.country],
      languages: ['en'],
      startDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      appId: 'com.avalo.app',
      appStore: 'GOOGLE_APP_STORE'
    };

    // Create campaign
    const googleCampaign = await api.createAppCampaign(googleConfig);

    // Set geo targeting
    await api.setGeoTargeting(googleCampaign.resourceName, googleConfig.geoTargets);

    // Save Google IDs to campaign
    await db.collection('ua_campaigns').doc(campaignId).update({
      'googleIds.campaignId': googleCampaign.campaignId,
      'googleIds.resourceName': googleCampaign.resourceName,
      syncedAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      googleCampaignId: googleCampaign.campaignId,
      resourceName: googleCampaign.resourceName
    };

  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const updateGoogleCampaignBudget = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, dailyBudget } = data;

  const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaign = campaignDoc.data()!;
  const resourceName = campaign.googleIds?.resourceName;

  if (!resourceName) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with Google');
  }

  const googleAccountDoc = await db.collection('ua_platform_accounts').doc('google').get();
  const googleAccount = googleAccountDoc.data() as GoogleAdsAccount;
  const api = new GoogleAdsAPI(googleAccount);

  try {
    await api.updateCampaignBudget(resourceName, dailyBudget * 1000000);

    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const uploadGoogleAssets = functions.https.onCall(async (data, context) => {
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
  const resourceName = campaign.googleIds?.resourceName;

  if (!resourceName) {
    throw new functions.https.HttpsError('failed-precondition', 'Campaign not synced with Google');
  }

  // Get top performing creatives
  const creativesSnap = await db.collection('ua_creatives')
    .where('platform', '==', 'google')
    .where('country', '==', campaign.country)
    .where('status', '==', 'approved')
    .orderBy('conversionRate', 'desc')
    .limit(10)
    .get();

  if (creativesSnap.empty) {
    throw new functions.https.HttpsError('not-found', 'No creatives available');
  }

  const googleAccountDoc = await db.collection('ua_platform_accounts').doc('google').get();
  const googleAccount = googleAccountDoc.data() as GoogleAdsAccount;
  const api = new GoogleAdsAPI(googleAccount);

  const assets: GoogleAdAsset[] = [];

  // Add text assets
  const textCreatives = creativesSnap.docs.filter(doc => doc.data().type === 'text');
  for (const doc of textCreatives.slice(0, 5)) {
    assets.push({
      type: 'TEXT',
      text: doc.data().text
    });
  }

  // Add video assets (YouTube)
  const videoCreatives = creativesSnap.docs.filter(doc => doc.data().type === 'video');
  for (const doc of videoCreatives.slice(0, 3)) {
    const videoData = doc.data();
    if (videoData.youtubeId) {
      assets.push({
        type: 'YOUTUBE_VIDEO',
        youtubeVideoId: videoData.youtubeId
      });
    }
  }

  // Add image assets
  const imageCreatives = creativesSnap.docs.filter(doc => doc.data().type === 'image');
  for (const doc of imageCreatives.slice(0, 10)) {
    assets.push({
      type: 'IMAGE',
      imageUrl: doc.data().url
    });
  }

  try {
    const results = await api.addAssets(resourceName, assets);

    return {
      success: true,
      assetsAdded: results.length
    };

  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ===========================
// SYNC STATS FROM GOOGLE
// ===========================

export const syncGoogleStats = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    // Get all active Google campaigns
    const campaigns = await db.collection('ua_campaigns')
      .where('platform', '==', 'google')
      .where('status', '==', 'active')
      .get();

    if (campaigns.empty) return null;

    const googleAccountDoc = await db.collection('ua_platform_accounts').doc('google').get();
    if (!googleAccountDoc.exists) return null;

    const googleAccount = googleAccountDoc.data() as GoogleAdsAccount;
    const api = new GoogleAdsAPI(googleAccount);

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    for (const campaignDoc of campaigns.docs) {
      const campaign = campaignDoc.data();
      const googleCampaignId = campaign.googleIds?.campaignId;

      if (!googleCampaignId) continue;

      try {
        const stats = await api.getCampaignStats(googleCampaignId, today, today);

        if (stats && stats.length > 0) {
          const data = stats[0];
          const metrics = data.metrics;

          const spend = parseFloat(metrics.cost_micros || '0') / 1000000;
          const impressions = parseInt(metrics.impressions || '0');
          const clicks = parseInt(metrics.clicks || '0');
          const installs = parseInt(metrics.conversions || '0');

          // Save to performance collection
          await db.collection('ua_performance').add({
            campaignId: campaignDoc.id,
            platform: 'google',
            country: campaign.country,
            date: new Date().toISOString().split('T')[0],
            impressions,
            clicks,
            installs,
            cpi: installs > 0 ? spend / installs : 0,
            ctr: impressions > 0 ? clicks / impressions : 0,
            spend,
            timestamp: admin.firestore.Timestamp.now()
          });
        }

      } catch (error) {
        console.error(`Failed to sync stats for campaign ${campaignDoc.id}:`, error);
      }
    }

    return null;
  });

// ===========================
// CONVERSION TRACKING
// ===========================

export const trackGoogleConversion = functions.https.onCall(async (data, context) => {
  const { conversionAction, userId, conversionValue } = data;

  // Get Google Ads account
  const googleAccountDoc = await db.collection('ua_platform_accounts').doc('google').get();
  if (!googleAccountDoc.exists) {
    return { success: false, error: 'Google account not configured' };
  }

  const googleAccount = googleAccountDoc.data() as GoogleAdsAccount;
  const api = new GoogleAdsAPI(googleAccount);

  try {
    const headers = await api['getHeaders']();

    // Upload offline conversion
    await axios.post(
      `https://googleads.googleapis.com/v14/customers/${googleAccount.customerId}:uploadConversionAdjustments`,
      {
        conversionAdjustments: [{
          conversionAction,
          adjustmentType: 'ENHANCEMENT',
          adjustmentDateTime: new Date().toISOString(),
          userIdentifiers: [{
            hashedEmail: userId // Should be hashed
          }],
          restatementValue: {
            adjustedValue: conversionValue
          }
        }]
      },
      { headers }
    );

    return { success: true };

  } catch (error: any) {
    console.error('Google conversion tracking failed:', error);
    return { success: false, error: error.message };
  }
});

// ===========================
// EXPORTS
// ===========================

export const googleConnector = {
  syncGoogleCampaign,
  updateGoogleCampaignBudget,
  uploadGoogleAssets,
  syncGoogleStats,
  trackGoogleConversion
};
