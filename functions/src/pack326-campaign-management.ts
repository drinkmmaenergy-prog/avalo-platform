/**
 * PACK 326 — Campaign Management Functions
 * Create and manage ad campaigns and creatives
 */

import { https } from 'firebase-functions';
import { db, generateId, serverTimestamp } from './init';
import { HttpsError } from 'firebase-functions/v2/https';
import { getWalletBalance } from './pack277-wallet-service';
import {
  AdsCampaign,
  AdsCreative,
  CreateCampaignRequest,
  CreateCampaignResponse,
  CreateCreativeRequest,
  CreateCreativeResponse,
  ADS_DEFAULT_PRICING,
} from './types/pack326-ads.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate user is 18+ and verified
 */
async function validateAdvertiser(userId: string): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  
  const userData = userDoc.data();
  
  if (!userData?.age || userData.age < 18) {
    throw new HttpsError('failed-precondition', 'Advertiser must be 18+');
  }
  
  if (userData.verificationStatus !== 'VERIFIED') {
    throw new HttpsError('failed-precondition', 'Advertiser must be verified');
  }
}

/**
 * Validate campaign budget
 */
async function validateCampaignBudget(
  userId: string,
  budgetTokens: number
): Promise<void> {
  if (budgetTokens < ADS_DEFAULT_PRICING.MIN_CAMPAIGN_BUDGET) {
    throw new HttpsError(
      'invalid-argument',
      `Minimum campaign budget is ${ADS_DEFAULT_PRICING.MIN_CAMPAIGN_BUDGET} tokens`
    );
  }
  
  // Check wallet balance
  const wallet = await getWalletBalance(userId);
  
  if (!wallet) {
    throw new HttpsError('not-found', 'Wallet not found');
  }
  
  if (wallet.tokensBalance < budgetTokens) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient balance. Required: ${budgetTokens}, Available: ${wallet.tokensBalance}`
    );
  }
}

/**
 * Validate campaign targeting age
 */
function validateTargeting(request: CreateCampaignRequest): void {
  if (request.targeting.minAge && request.targeting.minAge < 18) {
    throw new HttpsError(
      'invalid-argument',
      'Minimum target age must be 18+'
    );
  }
  
  if (request.targeting.maxAge && request.targeting.maxAge < 18) {
    throw new HttpsError(
      'invalid-argument',
      'Maximum target age must be 18+'
    );
  }
  
  if (
    request.targeting.minAge &&
    request.targeting.maxAge &&
    request.targeting.minAge > request.targeting.maxAge
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Minimum age cannot be greater than maximum age'
    );
  }
}

/**
 * Validate campaign pricing
 */
function validatePricing(request: CreateCampaignRequest): void {
  if (request.billingModel === 'CPM') {
    if (!request.pricing.cpmTokens || request.pricing.cpmTokens < 1) {
      throw new HttpsError(
        'invalid-argument',
        'CPM price must be at least 1 token'
      );
    }
  }
  
  if (request.billingModel === 'CPC') {
    if (!request.pricing.cpcTokens || request.pricing.cpcTokens < 1) {
      throw new HttpsError(
        'invalid-argument',
        'CPC price must be at least 1 token'
      );
    }
  }
}

/**
 * Validate campaign dates
 */
function validateDates(startAt: string, endAt: string): void {
  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  const now = new Date();
  
  if (startDate < now) {
    throw new HttpsError(
      'invalid-argument',
      'Start date cannot be in the past'
    );
  }
  
  if (endDate <= startDate) {
    throw new HttpsError(
      'invalid-argument',
      'End date must be after start date'
    );
  }
  
  // Minimum campaign duration: 1 day
  const minDuration = 24 * 60 * 60 * 1000; // 1 day in ms
  if (endDate.getTime() - startDate.getTime() < minDuration) {
    throw new HttpsError(
      'invalid-argument',
      'Campaign must run for at least 1 day'
    );
  }
}

/**
 * Check if campaign exists and is owned by user
 */
async function validateCampaignOwnership(
  campaignId: string,
  userId: string
): Promise<AdsCampaign> {
  const campaignDoc = await db.collection('adsCampaigns').doc(campaignId).get();
  
  if (!campaignDoc.exists) {
    throw new HttpsError('not-found', 'Campaign not found');
  }
  
  const campaign = campaignDoc.data() as AdsCampaign;
  
  if (campaign.advertiserUserId !== userId) {
    throw new HttpsError(
      'permission-denied',
      'You do not own this campaign'
    );
  }
  
  return campaign;
}

// ============================================================================
// CAMPAIGN CREATION
// ============================================================================

/**
 * Create a new ad campaign
 */
export const pack326_createAdsCampaign = https.onCall(
  async (request): Promise<CreateCampaignResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const {
        advertiserUserId,
        name,
        placement,
        billingModel,
        pricing,
        dailyBudgetTokens,
        startAt,
        endAt,
        targeting,
      } = data as CreateCampaignRequest;
      
      // Security: Users can only create campaigns for themselves
      if (advertiserUserId !== auth.uid) {
        throw new HttpsError(
          'permission-denied',
          'Cannot create campaign for another user'
        );
      }
      
      // Validate advertiser
      await validateAdvertiser(auth.uid);
      
      // Validate inputs
      if (!name || name.trim().length < 3) {
        throw new HttpsError(
          'invalid-argument',
          'Campaign name must be at least 3 characters'
        );
      }
      
      validateDates(startAt, endAt);
      validateTargeting(data as CreateCampaignRequest);
      validatePricing(data as CreateCampaignRequest);
      
      // Calculate total budget (daily budget * number of days)
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);
      const durationDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalBudget = dailyBudgetTokens * durationDays;
      
      // Validate budget
      await validateCampaignBudget(auth.uid, totalBudget);
      
      // Create campaign
      const campaignId = generateId();
      const campaign: AdsCampaign = {
        id: campaignId,
        advertiserUserId: auth.uid,
        name: name.trim(),
        status: 'DRAFT',
        budgetTokens: totalBudget,
        spentTokens: 0,
        startAt,
        endAt,
        targeting: {
          regions: targeting.regions || [],
          gender: targeting.gender || 'ANY',
          minAge: targeting.minAge || 18,
          maxAge: targeting.maxAge || 99,
          interests: targeting.interests || [],
        },
        placement,
        billingModel,
        pricing: {
          cpmTokens: pricing.cpmTokens || ADS_DEFAULT_PRICING.CPM_TOKENS,
          cpcTokens: pricing.cpcTokens || ADS_DEFAULT_PRICING.CPC_TOKENS,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await db.collection('adsCampaigns').doc(campaignId).set(campaign);
      
      const response: CreateCampaignResponse = {
        success: true,
        campaignId,
      };
      
      return response;
    } catch (error: any) {
      console.error('Create campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      const response: CreateCampaignResponse = {
        success: false,
        error: error.message || 'Failed to create campaign',
      };
      
      return response;
    }
  }
);

// ============================================================================
// CREATIVE CREATION
// ============================================================================

/**
 * Create a new ad creative
 */
export const pack326_createAdCreative = https.onCall(
  async (request): Promise<CreateCreativeResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const {
        campaignId,
        type,
        mediaUrl,
        headline,
        description,
        callToAction,
      } = data as CreateCreativeRequest;
      
      // Validate campaign ownership
      await validateCampaignOwnership(campaignId, auth.uid);
      
      // Validate inputs
      if (!mediaUrl || !mediaUrl.startsWith('http')) {
        throw new HttpsError(
          'invalid-argument',
          'Valid media URL is required'
        );
      }
      
      if (!headline || headline.trim().length < 5) {
        throw new HttpsError(
          'invalid-argument',
          'Headline must be at least 5 characters'
        );
      }
      
      if (headline.length > 100) {
        throw new HttpsError(
          'invalid-argument',
          'Headline cannot exceed 100 characters'
        );
      }
      
      if (description && description.length > 200) {
        throw new HttpsError(
          'invalid-argument',
          'Description cannot exceed 200 characters'
        );
      }
      
      // Create creative
      const creativeId = generateId();
      const creative: AdsCreative = {
        id: creativeId,
        campaignId,
        type,
        mediaUrl,
        headline: headline.trim(),
        description: description?.trim(),
        callToAction: callToAction?.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };
      
      await db.collection('adsCreatives').doc(creativeId).set(creative);
      
      const response: CreateCreativeResponse = {
        success: true,
        creativeId,
      };
      
      return response;
    } catch (error: any) {
      console.error('Create creative error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      const response: CreateCreativeResponse = {
        success: false,
        error: error.message || 'Failed to create creative',
      };
      
      return response;
    }
  }
);

// ============================================================================
// CAMPAIGN ACTIVATION
// ============================================================================

/**
 * Activate a campaign (move from DRAFT to ACTIVE)
 */
export const pack326_activateCampaign = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId } = data;
      
      // Validate campaign ownership
      const campaign = await validateCampaignOwnership(campaignId, auth.uid);
      
      if (campaign.status !== 'DRAFT') {
        throw new HttpsError(
          'failed-precondition',
          'Only draft campaigns can be activated'
        );
      }
      
      // Check if campaign has at least one approved creative
      const creativesSnapshot = await db
        .collection('adsCreatives')
        .where('campaignId', '==', campaignId)
        .where('status', '==', 'APPROVED')
        .limit(1)
        .get();
      
      if (creativesSnapshot.empty) {
        throw new HttpsError(
          'failed-precondition',
          'Campaign must have at least one approved creative'
        );
      }
      
      // Re-validate budget (in case balance changed)
      await validateCampaignBudget(auth.uid, campaign.budgetTokens);
      
      // Activate campaign
      await db.collection('adsCampaigns').doc(campaignId).update({
        status: 'ACTIVE',
        updatedAt: new Date().toISOString(),
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Activate campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to activate campaign');
    }
  }
);

// ============================================================================
// CAMPAIGN PAUSE
// ============================================================================

/**
 * Pause an active campaign
 */
export const pack326_pauseCampaign = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId } = data;
      
      // Validate campaign ownership
      const campaign = await validateCampaignOwnership(campaignId, auth.uid);
      
      if (campaign.status !== 'ACTIVE') {
        throw new HttpsError(
          'failed-precondition',
          'Only active campaigns can be paused'
        );
      }
      
      // Pause campaign
      await db.collection('adsCampaigns').doc(campaignId).update({
        status: 'PAUSED',
        updatedAt: new Date().toISOString(),
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Pause campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to pause campaign');
    }
  }
);

// ============================================================================
// CAMPAIGN RESUME
// ============================================================================

/**
 * Resume a paused campaign
 */
export const pack326_resumeCampaign = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId } = data;
      
      // Validate campaign ownership
      const campaign = await validateCampaignOwnership(campaignId, auth.uid);
      
      if (campaign.status !== 'PAUSED') {
        throw new HttpsError(
          'failed-precondition',
          'Only paused campaigns can be resumed'
        );
      }
      
      // Check if end date has passed
      if (new Date(campaign.endAt) < new Date()) {
        throw new HttpsError(
          'failed-precondition',
          'Campaign end date has passed'
        );
      }
      
      // Resume campaign
      await db.collection('adsCampaigns').doc(campaignId).update({
        status: 'ACTIVE',
        updatedAt: new Date().toISOString(),
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Resume campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to resume campaign');
    }
  }
);

// ============================================================================
// GET CAMPAIGN DETAILS
// ============================================================================

/**
 * Get campaign details with creatives
 */
export const pack326_getCampaignDetails = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId } = data;
      
      // Get campaign
      const campaign = await validateCampaignOwnership(campaignId, auth.uid);
      
      // Get creatives
      const creativesSnapshot = await db
        .collection('adsCreatives')
        .where('campaignId', '==', campaignId)
        .get();
      
      const creatives = creativesSnapshot.docs.map(doc => doc.data() as AdsCreative);
      
      // Get basic analytics
      const impressionsSnapshot = await db
        .collection('adsImpressions')
        .where('campaignId', '==', campaignId)
        .get();
      
      const clicksSnapshot = await db
        .collection('adsClicks')
        .where('campaignId', '==', campaignId)
        .get();
      
      const impressions = impressionsSnapshot.size;
      const clicks = clicksSnapshot.size;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      
      return {
        success: true,
        campaign,
        creatives,
        analytics: {
          impressions,
          clicks,
          ctr: ctr.toFixed(2),
          spentTokens: campaign.spentTokens,
          remainingBudget: campaign.budgetTokens - campaign.spentTokens,
        },
      };
    } catch (error: any) {
      console.error('Get campaign details error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get campaign details');
    }
  }
);

// ============================================================================
// LIST USER CAMPAIGNS
// ============================================================================

/**
 * List all campaigns for current user
 */
export const pack326_listMyCampaigns = https.onCall(
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const campaignsSnapshot = await db
        .collection('adsCampaigns')
        .where('advertiserUserId', '==', auth.uid)
        .orderBy('createdAt', 'desc')
        .get();
      
      const campaigns = campaignsSnapshot.docs.map(doc => doc.data() as AdsCampaign);
      
      return {
        success: true,
        campaigns,
      };
    } catch (error: any) {
      console.error('List campaigns error:', error);
      throw new HttpsError('internal', error.message || 'Failed to list campaigns');
    }
  }
);