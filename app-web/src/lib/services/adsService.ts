/**
 * Ads Integration Service
 * Non-intrusive ad placement with delayed activation via remote config
 * NSFW auto-disable
 */

import { db, functions } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface AdPlacement {
  id: string;
  position: 'feed' | 'stories' | 'sidebar' | 'banner';
  type: 'native' | 'banner' | 'video';
  enabled: boolean;
  nsfwEnabled: boolean;
  priority: number;
}

export interface AdContent {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  title: string;
  description?: string;
  ctaText?: string;
  ctaUrl: string;
  impressionUrl?: string;
  clickUrl?: string;
}

// ============================================================================
// REMOTE CONFIG
// ============================================================================

/**
 * Get ad configuration from remote config
 */
export async function getAdConfig(): Promise<{
  enabled: boolean;
  placements: AdPlacement[];
  minTimeBetweenAds: number;
}> {
  try {
    const configRef = doc(db, 'remote_config', 'ads');
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      return {
        enabled: false,
        placements: [],
        minTimeBetweenAds: 300, // 5 minutes default
      };
    }

    return configSnap.data() as any;
  } catch (error) {
    console.error('Error getting ad config:', error);
    return {
      enabled: false,
      placements: [],
      minTimeBetweenAds: 300,
    };
  }
}

// ============================================================================
// AD FETCHING
// ============================================================================

/**
 * Fetch ad for specific placement
 */
export async function fetchAd(params: {
  userId?: string;
  placement: string;
  isNSFWContext: boolean;
}): Promise<{
  ad: AdContent | null;
  shouldShow: boolean;
}> {
  try {
    // Check remote config first
    const config = await getAdConfig();
    
    if (!config.enabled) {
      return { ad: null, shouldShow: false };
    }

    // Find placement config
    const placementConfig = config.placements.find(p => p.position === params.placement);
    
    if (!placementConfig || !placementConfig.enabled) {
      return { ad: null, shouldShow: false };
    }

    // Auto-disable in NSFW contexts unless explicitly enabled
    if (params.isNSFWContext && !placementConfig.nsfwEnabled) {
      return { ad: null, shouldShow: false };
    }

    // Fetch ad from backend
    const getAd = httpsCallable<typeof params, { ad: AdContent | null }>(
      functions,
      'getAdForPlacement'
    );
    
    const result = await getAd(params);
    
    return {
      ad: result.data.ad,
      shouldShow: result.data.ad !== null,
    };
  } catch (error) {
    console.error('Error fetching ad:', error);
    return { ad: null, shouldShow: false };
  }
}

// ============================================================================
// AD TRACKING
// ============================================================================

/**
 * Track ad impression
 */
export async function trackAdImpression(params: {
  adId: string;
  userId?: string;
  placement: string;
}): Promise<void> {
  try {
    const track = httpsCallable<typeof params, void>(
      functions,
      'trackAdImpression'
    );
    await track(params);
  } catch (error) {
    console.error('Error tracking ad impression:', error);
  }
}

/**
 * Track ad click
 */
export async function trackAdClick(params: {
  adId: string;
  userId?: string;
  placement: string;
}): Promise<void> {
  try {
    const track = httpsCallable<typeof params, void>(
      functions,
      'trackAdClick'
    );
    await track(params);
  } catch (error) {
    console.error('Error tracking ad click:', error);
  }
}

// ============================================================================
// AD PLACEMENT CONTAINERS
// ============================================================================

/**
 * Check if ad should be shown based on user activity
 */
export function shouldShowAd(lastAdShownAt: number | null, minTimeBetweenAds: number): boolean {
  if (!lastAdShownAt) {
    return true;
  }

  const timeSinceLastAd = Date.now() - lastAdShownAt;
  return timeSinceLastAd >= minTimeBetweenAds * 1000;
}

/**
 * Get ad placeholder dimensions
 */
export function getAdDimensions(placement: string): {
  width: number;
  height: number;
  aspectRatio: string;
} {
  switch (placement) {
    case 'feed':
      return { width: 600, height: 400, aspectRatio: '3/2' };
    case 'stories':
      return { width: 360, height: 640, aspectRatio: '9/16' };
    case 'sidebar':
      return { width: 300, height: 250, aspectRatio: '6/5' };
    case 'banner':
      return { width: 728, height: 90, aspectRatio: '728/90' };
    default:
      return { width: 600, height: 400, aspectRatio: '3/2' };
  }
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Check if user has ad-free subscription
 */
export async function hasAdFreeSubscription(userId: string): Promise<boolean> {
  try {
    const check = httpsCallable<{ userId: string }, { adFree: boolean }>(
      functions,
      'checkAdFreeStatus'
    );
    
    const result = await check({ userId });
    return result.data.adFree;
  } catch (error) {
    console.error('Error checking ad-free status:', error);
    return false;
  }
}

/**
 * Get user ad preferences
 */
export async function getAdPreferences(userId: string): Promise<{
  personalizedAds: boolean;
  adFrequency: 'normal' | 'reduced' | 'none';
}> {
  try {
    const prefsRef = doc(db, 'users', userId, 'settings', 'ads');
    const prefsSnap = await getDoc(prefsRef);

    if (!prefsSnap.exists()) {
      return {
        personalizedAds: false,
        adFrequency: 'normal',
      };
    }

    return prefsSnap.data() as any;
  } catch (error) {
    console.error('Error getting ad preferences:', error);
    return {
      personalizedAds: false,
      adFrequency: 'normal',
    };
  }
}