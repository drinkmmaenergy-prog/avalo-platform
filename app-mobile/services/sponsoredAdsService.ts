/**
 * Sponsored Ads Service - Phase 18
 * Manages brand-sponsored ads (different from Phase 17 rewarded ads)
 * 
 * Features:
 * - Fetch ad placements based on user profile
 * - Register impressions and clicks
 * - Track ad frequency per user tier
 * - Handle device ID for fraud prevention
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type AdPlacement = 'feed' | 'swipe' | 'live';
export type UserTier = 'standard' | 'vip' | 'royal';

export interface AdCampaign {
  campaignId: string;
  brandName: string;
  title: string;
  description: string;
  imageUrl: string;
  targetUrl?: string;
  callToAction: string;
  placement: AdPlacement;
}

export interface UserProfile {
  tier: UserTier;
  country?: string;
  language?: string;
  age?: number;
  gender?: string;
  interests?: string[];
}

// ============================================================================
// AD FREQUENCY MANAGEMENT
// ============================================================================

const AD_FREQUENCY = {
  feed: {
    standard: 7, // Every 7th post
    vip: 15,     // Every 15th post
    royal: 20,   // Every 20th post
  },
  swipe: {
    standard: 12, // Every 12th profile
    vip: 15,      // Every 15th profile
    royal: 15,    // Every 15th profile
  },
};

/**
 * Check if ad should be shown based on tier and count
 * @deprecated Use shouldShowSponsoredAd instead
 */
export function shouldShowAd(
  placement: AdPlacement,
  tier: UserTier,
  itemCount: number
): boolean {
  const frequency = AD_FREQUENCY[placement]?.[tier];
  if (!frequency) return false;
  
  return itemCount > 0 && itemCount % frequency === 0;
}

/**
 * Comprehensive check if sponsored ad should be shown
 * Includes tier, frequency, user status, and availability checks
 */
export function shouldShowSponsoredAd(
  placement: 'feed' | 'swipe' | 'live',
  userTier: 'standard' | 'vip' | 'royal',
  indexOrCounter: number,
  options?: {
    hasAdsAvailable?: boolean;
    userAge?: number;
    isUserBlocked?: boolean;
    isUserSuspended?: boolean;
  }
): boolean {
  // Safety checks
  if (indexOrCounter <= 0) return false;
  
  // Check if ads are available
  if (options?.hasAdsAvailable === false) return false;
  
  // Check user status - no ads for blocked/suspended users
  if (options?.isUserBlocked || options?.isUserSuspended) return false;
  
  // Age restriction - no ads for users under 18
  if (options?.userAge && options.userAge < 18) return false;
  
  // Get frequency for this placement and tier
  const frequency = AD_FREQUENCY[placement]?.[userTier];
  if (!frequency) return false;
  
  // Check if current position matches frequency
  return indexOrCounter % frequency === 0;
}

// ============================================================================
// FETCH AD PLACEMENTS
// ============================================================================

/**
 * Get ad placements for current user
 */
export async function getAdPlacements(
  placement: AdPlacement,
  userProfile: UserProfile
): Promise<AdCampaign[]> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const getPlacementsFn = httpsCallable<
      { placement: AdPlacement; userProfile: UserProfile },
      { ads: AdCampaign[] }
    >(functions, 'ads_getAdPlacements');
    
    const result = await getPlacementsFn({ placement, userProfile });
    return result.data.ads || [];
  } catch (error: any) {
    console.error('Error fetching ad placements:', error);
    return [];
  }
}

/**
 * Get a single ad for placement with caching
 * Returns null if no ads available
 */
export async function getAdForPlacement(
  placement: AdPlacement,
  userProfile: UserProfile
): Promise<AdCampaign | null> {
  try {
    // Check cache first
    const cached = getCachedAds(placement, userProfile.tier);
    if (cached && cached.length > 0) {
      // Return random ad from cache
      return cached[Math.floor(Math.random() * cached.length)];
    }
    
    // Fetch new ads
    const ads = await getAdPlacements(placement, userProfile);
    if (ads.length === 0) {
      return null;
    }
    
    // Cache ads
    cacheAds(placement, userProfile.tier, ads);
    
    // Return random ad
    return ads[Math.floor(Math.random() * ads.length)];
  } catch (error: any) {
    console.error('Error getting ad for placement:', error);
    return null;
  }
}

// ============================================================================
// IMPRESSION & CLICK TRACKING
// ============================================================================

/**
 * Register an ad impression
 */
export async function registerImpression(
  campaignId: string,
  placement: AdPlacement,
  userTier: UserTier
): Promise<string | null> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const deviceId = await getDeviceId();
    
    const registerFn = httpsCallable<
      {
        campaignId: string;
        placement: AdPlacement;
        userTier: UserTier;
        deviceId?: string;
      },
      { success: boolean; cost?: number }
    >(functions, 'ads_registerImpression');
    
    const result = await registerFn({
      campaignId,
      placement,
      userTier,
      deviceId,
    });
    
    if (result.data.success) {
      // Store impression ID locally for click tracking
      const impressionId = `${campaignId}_${Date.now()}`;
      await storeImpressionId(campaignId, impressionId);
      return impressionId;
    }
    
    return null;
  } catch (error: any) {
    console.error('Error registering impression:', error);
    return null;
  }
}

/**
 * Register an ad click
 */
export async function registerClick(
  campaignId: string,
  impressionId: string
): Promise<boolean> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const deviceId = await getDeviceId();
    
    const registerFn = httpsCallable<
      {
        campaignId: string;
        impressionId: string;
        deviceId?: string;
      },
      { success: boolean; cost?: number }
    >(functions, 'ads_registerClick');
    
    const result = await registerFn({
      campaignId,
      impressionId,
      deviceId,
    });
    
    return result.data.success;
  } catch (error: any) {
    console.error('Error registering click:', error);
    return false;
  }
}

// ============================================================================
// DEVICE ID MANAGEMENT
// ============================================================================

const DEVICE_ID_KEY = '@avalo_device_id';

/**
 * Get or generate device ID
 */
async function getDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      // Generate new device ID
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return `device_temp_${Date.now()}`;
  }
}

/**
 * Store impression ID for click tracking
 */
async function storeImpressionId(campaignId: string, impressionId: string): Promise<void> {
  try {
    const key = `@impression_${campaignId}`;
    await AsyncStorage.setItem(key, impressionId);
  } catch (error) {
    console.error('Error storing impression ID:', error);
  }
}

/**
 * Get stored impression ID
 */
export async function getImpressionId(campaignId: string): Promise<string | null> {
  try {
    const key = `@impression_${campaignId}`;
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error('Error getting impression ID:', error);
    return null;
  }
}

// ============================================================================
// AD CACHE MANAGEMENT
// ============================================================================

const AD_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedAds {
  ads: AdCampaign[];
  timestamp: number;
}

const adCache: Map<string, CachedAds> = new Map();

/**
 * Get cached ads if still valid
 */
export function getCachedAds(placement: AdPlacement, tier: UserTier): AdCampaign[] | null {
  const key = `${placement}_${tier}`;
  const cached = adCache.get(key);
  
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > AD_CACHE_DURATION) {
    adCache.delete(key);
    return null;
  }
  
  return cached.ads;
}

/**
 * Cache ads
 */
export function cacheAds(placement: AdPlacement, tier: UserTier, ads: AdCampaign[]): void {
  const key = `${placement}_${tier}`;
  adCache.set(key, {
    ads,
    timestamp: Date.now(),
  });
}

/**
 * Clear ad cache
 */
export function clearAdCache(): void {
  adCache.clear();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user tier from membership status
 */
export function getUserTier(membershipType?: string): UserTier {
  if (membershipType === 'royal') return 'royal';
  if (membershipType === 'vip') return 'vip';
  return 'standard';
}

/**
 * Check if user has ads enabled (VIP/Royal can opt out)
 */
export async function areAdsEnabled(tier: UserTier): Promise<boolean> {
  // Standard users always see ads
  if (tier === 'standard') return true;
  
  // VIP/Royal check preference
  try {
    const key = '@ads_enabled';
    const value = await AsyncStorage.getItem(key);
    return value !== 'false'; // Default to true
  } catch (error) {
    return true;
  }
}

/**
 * Set ads preference (VIP/Royal only)
 */
export async function setAdsEnabled(enabled: boolean): Promise<void> {
  try {
    const key = '@ads_enabled';
    await AsyncStorage.setItem(key, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Error setting ads preference:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  shouldShowAd,
  shouldShowSponsoredAd,
  getAdPlacements,
  getAdForPlacement,
  registerImpression,
  registerClick,
  getImpressionId,
  getCachedAds,
  cacheAds,
  clearAdCache,
  getUserTier,
  areAdsEnabled,
  setAdsEnabled,
};