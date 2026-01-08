/**
 * PACK 121 — Avalo Global Ads Network
 * Auction, Bidding, and Tracking Functions
 * 
 * Handles:
 * - CPM auction logic for ad selection
 * - Impression tracking and billing
 * - Click tracking
 * - Performance analytics
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  AdCampaign,
  AdImpression,
  AdClick,
  AdPlacement,
  RecordImpressionRequest,
  RecordImpressionResponse,
  RecordClickRequest,
  RecordClickResponse,
  GetCampaignPerformanceRequest,
  GetCampaignPerformanceResponse,
  CampaignPerformance,
  UserAdPreferences,
  UpdateAdPreferencesRequest,
  UpdateAdPreferencesResponse,
  GetAdPreferencesResponse,
} from './pack121-types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if campaign is currently active
 */
function isCampaignActive(campaign: AdCampaign): boolean {
  const now = Timestamp.now();
  
  return (
    campaign.status === 'ACTIVE' &&
    campaign.safetyStatus === 'APPROVED' &&
    campaign.spentTokens < campaign.budgetTokens &&
    campaign.startAt.toMillis() <= now.toMillis() &&
    campaign.endAt.toMillis() > now.toMillis()
  );
}

/**
 * Check if user has hidden this ad category
 */
async function isAdHiddenByUser(
  userId: string | undefined,
  brandCategory: string
): Promise<boolean> {
  if (!userId) return false;
  
  const prefsDoc = await db.collection('user_ad_preferences').doc(userId).get();
  
  if (!prefsDoc.exists) return false;
  
  const prefs = prefsDoc.data() as UserAdPreferences;
  return prefs.hiddenCategories.includes(brandCategory);
}

/**
 * Calculate CPM cost for a single impression
 */
function calculateImpressionCost(cpmBidTokens: number): number {
  // CPM = cost per 1000 impressions
  // Cost per impression = CPM / 1000
  return cpmBidTokens / 1000;
}

/**
 * Check if targeting matches user context
 */
function matchesTargeting(
  campaign: AdCampaign,
  context: {
    region?: string;
    deviceType: 'IOS' | 'ANDROID' | 'WEB';
    language?: string;
  }
): boolean {
  const targeting = campaign.targeting;
  
  // Check region targeting
  if (context.region && targeting.regions.length > 0) {
    if (!targeting.regions.includes(context.region)) {
      return false;
    }
  }
  
  // Check device type targeting
  if (targeting.deviceTypes && targeting.deviceTypes.length > 0) {
    if (!targeting.deviceTypes.includes(context.deviceType)) {
      return false;
    }
  }
  
  // Check language targeting (if available in context)
  if (context.language && targeting.languages && targeting.languages.length > 0) {
    if (!targeting.languages.includes(context.language)) {
      return false;
    }
  }
  
  return true;
}

// ============================================================================
// Ad Auction Functions
// ============================================================================

/**
 * Select ad to show based on CPM auction
 * Internal function called by mobile app
 */
export const selectAdForPlacement = onCall<{
  placement: AdPlacement;
  sessionId: string;
  deviceType: 'IOS' | 'ANDROID' | 'WEB';
  region?: string;
  language?: string;
}, Promise<{ success: boolean; ad?: AdCampaign; error?: string }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    const { placement, sessionId, deviceType, region, language } = request.data;
    
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Session ID required');
    }
    
    try {
      // Get all active campaigns for this placement
      const campaignsSnapshot = await db.collection('ad_campaigns')
        .where('status', '==', 'ACTIVE')
        .where('safetyStatus', '==', 'APPROVED')
        .where('placements', 'array-contains', placement)
        .get();
      
      // Filter eligible campaigns
      const eligibleCampaigns: AdCampaign[] = [];
      
      for (const doc of campaignsSnapshot.docs) {
        const campaign = doc.data() as AdCampaign;
        
        // Check if campaign is truly active
        if (!isCampaignActive(campaign)) {
          continue;
        }
        
        // Check targeting match
        if (!matchesTargeting(campaign, { region, deviceType, language })) {
          continue;
        }
        
        // Check user preferences (if logged in)
        if (userId) {
          const advertiserDoc = await db.collection('advertisers').doc(campaign.advertiserId).get();
          const advertiser = advertiserDoc.data();
          
          if (advertiser) {
            const isHidden = await isAdHiddenByUser(userId, advertiser.brandCategory);
            if (isHidden) {
              continue;
            }
          }
        }
        
        eligibleCampaigns.push(campaign);
      }
      
      // If no eligible campaigns, return null
      if (eligibleCampaigns.length === 0) {
        return { success: true };
      }
      
      // Run CPM auction - select highest bidder
      const selectedCampaign = eligibleCampaigns.reduce((highest, current) => {
        return current.cpmBidTokens > highest.cpmBidTokens ? current : highest;
      });
      
      return {
        success: true,
        ad: selectedCampaign,
      };
    } catch (error) {
      console.error('Error selecting ad:', error);
      return { success: false, error: 'Failed to select ad' };
    }
  }
);

// ============================================================================
// Impression & Click Tracking
// ============================================================================

/**
 * Record ad impression
 * Called when ad is displayed to user
 */
export const recordImpression = onCall<RecordImpressionRequest, Promise<RecordImpressionResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    const { adId, placement, sessionId, deviceType, region } = request.data;
    
    if (!adId || !placement || !sessionId || !deviceType) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      // Get campaign
      const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdCampaign;
      
      // Calculate impression cost
      const cost = calculateImpressionCost(campaign.cpmBidTokens);
      
      // Check if campaign has sufficient budget
      if (campaign.spentTokens + cost > campaign.budgetTokens) {
        // Pause campaign - budget exhausted
        await db.collection('ad_campaigns').doc(adId).update({
          status: 'COMPLETED',
          updatedAt: serverTimestamp(),
        });
        
        throw new HttpsError('failed-precondition', 'Campaign budget exhausted');
      }
      
      // Create impression record
      const impressionId = `imp_${generateId()}`;
      const impression: AdImpression = {
        impressionId,
        adId,
        advertiserId: campaign.advertiserId,
        userId,
        sessionId,
        placement,
        deviceType,
        region,
        timestamp: Timestamp.now(),
        tokensCost: cost,
      };
      
      // Save impression
      await db.collection('ad_impressions').doc(impressionId).set(impression);
      
      // Update campaign spent tokens
      await db.collection('ad_campaigns').doc(adId).update({
        spentTokens: increment(cost),
        updatedAt: serverTimestamp(),
      });
      
      // Charge tokens from advertiser (already reserved during campaign creation)
      // No additional charge needed - tokens are pre-allocated
      
      return { success: true, impressionId };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Error recording impression:', error);
      throw new HttpsError('internal', 'Failed to record impression');
    }
  }
);

/**
 * Record ad click
 * Called when user clicks on ad
 */
export const recordClick = onCall<RecordClickRequest, Promise<RecordClickResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    const { adId, impressionId, placement, sessionId, deviceType, region } = request.data;
    
    if (!adId || !impressionId || !placement || !sessionId || !deviceType) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      // Verify impression exists
      const impressionDoc = await db.collection('ad_impressions').doc(impressionId).get();
      
      if (!impressionDoc.exists) {
        throw new HttpsError('not-found', 'Impression not found');
      }
      
      const impression = impressionDoc.data() as AdImpression;
      
      // Verify impression matches ad
      if (impression.adId !== adId) {
        throw new HttpsError('invalid-argument', 'Impression does not match ad');
      }
      
      // Get campaign
      const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdCampaign;
      
      // Create click record
      const clickId = `clk_${generateId()}`;
      const click: AdClick = {
        clickId,
        adId,
        advertiserId: campaign.advertiserId,
        impressionId,
        userId,
        sessionId,
        placement,
        deviceType,
        region,
        timestamp: Timestamp.now(),
      };
      
      // Save click
      await db.collection('ad_clicks').doc(clickId).set(click);
      
      return { success: true, clickId };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Error recording click:', error);
      throw new HttpsError('internal', 'Failed to record click');
    }
  }
);

// ============================================================================
// Performance Analytics
// ============================================================================

/**
 * Get campaign performance metrics
 * Advertiser or admin only
 */
export const getCampaignPerformance = onCall<
  GetCampaignPerformanceRequest,
  Promise<GetCampaignPerformanceResponse>
>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { adId, advertiserId, fromDate, toDate } = request.data;
    
    try {
      // Verify authorization
      const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdCampaign;
      
      // Check if user owns this campaign or is admin
      const isAdminUser = await db.collection('admins').doc(userId).get();
      const isOwner = campaign.advertiserId === advertiserId;
      
      if (!isOwner && !isAdminUser.exists) {
        throw new HttpsError('permission-denied', 'Not authorized to view this campaign');
      }
      
      // Build date range query
      let impressionsQuery = db.collection('ad_impressions').where('adId', '==', adId);
      let clicksQuery = db.collection('ad_clicks').where('adId', '==', adId);
      
      if (fromDate) {
        const fromTimestamp = Timestamp.fromDate(new Date(fromDate));
        impressionsQuery = impressionsQuery.where('timestamp', '>=', fromTimestamp);
        clicksQuery = clicksQuery.where('timestamp', '>=', fromTimestamp);
      }
      
      if (toDate) {
        const toTimestamp = Timestamp.fromDate(new Date(toDate));
        impressionsQuery = impressionsQuery.where('timestamp', '<=', toTimestamp);
        clicksQuery = clicksQuery.where('timestamp', '<=', toTimestamp);
      }
      
      // Get impressions and clicks
      const [impressionsSnapshot, clicksSnapshot] = await Promise.all([
        impressionsQuery.get(),
        clicksQuery.get(),
      ]);
      
      const impressions = impressionsSnapshot.docs.map(doc => doc.data() as AdImpression);
      const clicks = clicksSnapshot.docs.map(doc => doc.data() as AdClick);
      
      // Calculate metrics
      const totalImpressions = impressions.length;
      const totalClicks = clicks.length;
      const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
      
      // Calculate tokens spent
      const tokensSpent = impressions.reduce((sum, imp) => sum + imp.tokensCost, 0);
      const avgCpm = totalImpressions > 0 
        ? (tokensSpent / totalImpressions) * 1000 
        : 0;
      
      // Breakdown by placement
      const byPlacement: CampaignPerformance['byPlacement'] = {};
      
      for (const placement of campaign.placements) {
        const placementImpressions = impressions.filter(i => i.placement === placement);
        const placementClicks = clicks.filter(c => c.placement === placement);
        
        byPlacement[placement] = {
          impressions: placementImpressions.length,
          clicks: placementClicks.length,
          ctr: placementImpressions.length > 0 
            ? placementClicks.length / placementImpressions.length 
            : 0,
        };
      }
      
      // Regional breakdown (anonymized counts)
      const byRegion: CampaignPerformance['byRegion'] = {};
      
      for (const impression of impressions) {
        if (impression.region) {
          if (!byRegion[impression.region]) {
            byRegion[impression.region] = { impressions: 0, clicks: 0 };
          }
          byRegion[impression.region].impressions++;
        }
      }
      
      for (const click of clicks) {
        if (click.region) {
          if (!byRegion[click.region]) {
            byRegion[click.region] = { impressions: 0, clicks: 0 };
          }
          byRegion[click.region].clicks++;
        }
      }
      
      const performance: CampaignPerformance = {
        adId,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr,
        tokensSpent,
        avgCpm,
        byPlacement,
        byRegion,
      };
      
      return {
        success: true,
        performance,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Error getting campaign performance:', error);
      throw new HttpsError('internal', 'Failed to get campaign performance');
    }
  }
);

// ============================================================================
// User Ad Preferences
// ============================================================================

/**
 * Update user ad preferences
 */
export const updateAdPreferences = onCall<
  UpdateAdPreferencesRequest,
  Promise<UpdateAdPreferencesResponse>
>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { hiddenCategories } = request.data;
    
    try {
      const preferences: UserAdPreferences = {
        userId,
        hiddenCategories,
        updatedAt: Timestamp.now(),
      };
      
      await db.collection('user_ad_preferences').doc(userId).set(preferences, { merge: true });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating ad preferences:', error);
      throw new HttpsError('internal', 'Failed to update preferences');
    }
  }
);

/**
 * Get user ad preferences
 */
export const getAdPreferences = onCall<void, Promise<GetAdPreferencesResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const prefsDoc = await db.collection('user_ad_preferences').doc(userId).get();
      
      if (!prefsDoc.exists) {
        // Return default preferences
        const defaultPrefs: UserAdPreferences = {
          userId,
          hiddenCategories: [],
          updatedAt: Timestamp.now(),
        };
        
        return {
          success: true,
          preferences: defaultPrefs,
        };
      }
      
      const preferences = prefsDoc.data() as UserAdPreferences;
      
      return {
        success: true,
        preferences,
      };
    } catch (error) {
      console.error('Error getting ad preferences:', error);
      throw new HttpsError('internal', 'Failed to get preferences');
    }
  }
);