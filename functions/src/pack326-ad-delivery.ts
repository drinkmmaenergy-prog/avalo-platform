/**
 * PACK 326 — Ad Delivery Engine
 * Match and deliver ads to users based on targeting criteria
 */

import { https } from 'firebase-functions';
import { db } from './init';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  AdDeliveryContext,
  AdDeliveryResponse,
  DeliveredAd,
  AdsCampaign,
  AdsCreative,
  AdPlacement,
} from './types/pack326-ads.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user profile for targeting
 */
async function getUserProfile(userId: string): Promise<{
  region?: string;
  gender?: string;
  age?: number;
  interests?: string[];
}> {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return {};
  }
  
  const userData = userDoc.data();
  
  // Calculate age from birthDate
  let age: number | undefined;
  if (userData?.birthDate) {
    const birthDate = userData.birthDate.toDate();
    age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }
  
  return {
    region: userData?.region || userData?.country,
    gender: userData?.gender,
    age,
    interests: userData?.interests || [],
  };
}

/**
 * Check if campaign matches targeting criteria
 */
function matchesCampaignTargeting(
  campaign: AdsCampaign,
  context: AdDeliveryContext
): boolean {
  // Check region
  if (campaign.targeting.regions && campaign.targeting.regions.length > 0) {
    if (!context.userRegion || !campaign.targeting.regions.includes(context.userRegion)) {
      return false;
    }
  }
  
  // Check gender
  if (campaign.targeting.gender && campaign.targeting.gender !== 'ANY') {
    if (!context.userGender || context.userGender !== campaign.targeting.gender) {
      return false;
    }
  }
  
  // Check age
  if (campaign.targeting.minAge && context.userAge) {
    if (context.userAge < campaign.targeting.minAge) {
      return false;
    }
  }
  
  if (campaign.targeting.maxAge && context.userAge) {
    if (context.userAge > campaign.targeting.maxAge) {
      return false;
    }
  }
  
  // Check interests (at least one match if specified)
  if (campaign.targeting.interests && campaign.targeting.interests.length > 0) {
    if (!context.userInterests || context.userInterests.length === 0) {
      return false;
    }
    
    const hasMatchingInterest = campaign.targeting.interests.some(interest =>
      context.userInterests!.includes(interest)
    );
    
    if (!hasMatchingInterest) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if campaign is currently active (within date range)
 */
function isCampaignActive(campaign: AdsCampaign): boolean {
  const now = new Date();
  const startDate = new Date(campaign.startAt);
  const endDate = new Date(campaign.endAt);
  
  return campaign.status === 'ACTIVE' && 
         now >= startDate && 
         now <= endDate &&
         campaign.spentTokens < campaign.budgetTokens;
}

/**
 * Get approved creatives for campaign
 */
async function getApprovedCreatives(campaignId: string): Promise<AdsCreative[]> {
  const snapshot = await db
    .collection('adsCreatives')
    .where('campaignId', '==', campaignId)
    .where('status', '==', 'APPROVED')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as AdsCreative);
}

/**
 * Select random creative from array
 */
function selectRandomCreative(creatives: AdsCreative[]): AdsCreative | null {
  if (creatives.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * creatives.length);
  return creatives[randomIndex];
}

/**
 * Get active campaigns for placement
 */
async function getActiveCampaigns(placement: AdPlacement): Promise<AdsCampaign[]> {
  const snapshot = await db
    .collection('adsCampaigns')
    .where('status', '==', 'ACTIVE')
    .where('placement', '==', placement)
    .get();
  
  return snapshot.docs
    .map(doc => doc.data() as AdsCampaign)
    .filter(campaign => isCampaignActive(campaign));
}

/**
 * Generate destination URL for ad click
 */
function generateDestinationUrl(creative: AdsCreative): string {
  // For now, return a placeholder
  // In production, this would link to:
  // - External URL (if provided in creative)
  // - Internal profile/event/shop/product page
  // - Custom landing page
  return `/ad-destination/${creative.id}`;
}

// ============================================================================
// MAIN AD DELIVERY FUNCTION
// ============================================================================

/**
 * Internal helper to get ad based on context
 */
async function getAdForContext(
  userId: string,
  placement: AdPlacement
): Promise<AdDeliveryResponse> {
  // Get user profile for targeting
  const userProfile = await getUserProfile(userId);
  
  // Build delivery context
  const context: AdDeliveryContext = {
    viewerUserId: userId,
    placement: placement,
    userRegion: userProfile.region,
    userGender: userProfile.gender as any,
    userAge: userProfile.age,
    userInterests: userProfile.interests,
  };
  
  // Safety check: Users under 18 cannot see ads
  if (!context.userAge || context.userAge < 18) {
    return {
      noAdsAvailable: true,
      reason: 'Age restricted',
    };
  }
  
  // Get active campaigns for this placement
  const campaigns = await getActiveCampaigns(placement);
  
  if (campaigns.length === 0) {
    return {
      noAdsAvailable: true,
      reason: 'No active campaigns for this placement',
    };
  }
  
  // Filter campaigns that match targeting
  const matchingCampaigns = campaigns.filter(campaign =>
    matchesCampaignTargeting(campaign, context)
  );
  
  if (matchingCampaigns.length === 0) {
    return {
      noAdsAvailable: true,
      reason: 'No campaigns match your profile',
    };
  }
  
  // Try each matching campaign until we find one with approved creatives
  for (const campaign of matchingCampaigns) {
    const creatives = await getApprovedCreatives(campaign.id);
    
    if (creatives.length > 0) {
      const selectedCreative = selectRandomCreative(creatives);
      
      if (selectedCreative) {
        const deliveredAd: DeliveredAd = {
          campaignId: campaign.id,
          creativeId: selectedCreative.id,
          creative: selectedCreative,
          trackingId: `${campaign.id}_${selectedCreative.id}_${Date.now()}`,
          destinationUrl: generateDestinationUrl(selectedCreative),
        };
        
        return {
          ad: deliveredAd,
        };
      }
    }
  }
  
  // No creatives found
  return {
    noAdsAvailable: true,
    reason: 'No approved creatives available',
  };
}

/**
 * Get an ad for display based on user context and placement
 */
export const pack326_getAd = https.onCall(
  async (request): Promise<AdDeliveryResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { placement } = data;
      
      if (!placement || !['FEED', 'REELS', 'STORIES'].includes(placement)) {
        throw new HttpsError('invalid-argument', 'Valid placement required (FEED, REELS, or STORIES)');
      }
      
      return await getAdForContext(auth.uid, placement as AdPlacement);
      
    } catch (error: any) {
      console.error('Get ad error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get ad');
    }
  }
);

// ============================================================================
// BATCH AD DELIVERY (for feed pagination)
// ============================================================================

/**
 * Get multiple ads for feed with proper spacing
 * Returns which positions should have ads
 */
export const pack326_getBatchAds = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { placement, itemCount } = data;
      
      if (!placement || !['FEED', 'REELS', 'STORIES'].includes(placement)) {
        throw new HttpsError('invalid-argument', 'Valid placement required');
      }
      
      if (!itemCount || itemCount < 1) {
        throw new HttpsError('invalid-argument', 'Valid itemCount required');
      }
      
      // Calculate ad positions
      // Ads appear every 8-12 organic items
      const MIN_SPACING = 8;
      const MAX_SPACING = 12;
      const adPositions: number[] = [];
      
      let position = MIN_SPACING + Math.floor(Math.random() * (MAX_SPACING - MIN_SPACING + 1));
      
      while (position < itemCount) {
        adPositions.push(position);
        position += MIN_SPACING + Math.floor(Math.random() * (MAX_SPACING - MIN_SPACING + 1));
      }
      
      // Get ads for each position
      const ads: Record<number, DeliveredAd | null> = {};
      
      for (const pos of adPositions) {
        const adResult = await getAdForContext(auth.uid, placement as AdPlacement);
        
        if (adResult.ad) {
          ads[pos] = adResult.ad;
        }
      }
      
      return {
        success: true,
        adPositions: Object.keys(ads).map(Number),
        ads,
      };
      
    } catch (error: any) {
      console.error('Get batch ads error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get batch ads');
    }
  }
);

// ============================================================================
// AD AVAILABILITY CHECK
// ============================================================================

/**
 * Check if ads are available for user without returning actual ad
 * Useful for UI to know whether to reserve space for ads
 */
export const pack326_checkAdAvailability = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { placement } = data;
      
      if (!placement || !['FEED', 'REELS', 'STORIES'].includes(placement)) {
        throw new HttpsError('invalid-argument', 'Valid placement required');
      }
      
      // Get user profile
      const userProfile = await getUserProfile(auth.uid);
      
      // Safety check
      if (!userProfile.age || userProfile.age < 18) {
        return {
          available: false,
          reason: 'Age restricted',
        };
      }
      
      // Check for active campaigns
      const campaigns = await getActiveCampaigns(placement as AdPlacement);
      
      if (campaigns.length === 0) {
        return {
          available: false,
          reason: 'No active campaigns',
        };
      }
      
      // Build context
      const context: AdDeliveryContext = {
        viewerUserId: auth.uid,
        placement: placement as AdPlacement,
        userRegion: userProfile.region,
        userGender: userProfile.gender as any,
        userAge: userProfile.age,
        userInterests: userProfile.interests,
      };
      
      // Check if any campaign matches
      const hasMatching = campaigns.some(campaign =>
        matchesCampaignTargeting(campaign, context)
      );
      
      return {
        available: hasMatching,
        reason: hasMatching ? 'Ads available' : 'No matching campaigns',
      };
      
    } catch (error: any) {
      console.error('Check ad availability error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to check availability');
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack326_getAd,
  pack326_getBatchAds,
  pack326_checkAdAvailability,
};