/**
 * PACK 52: Creator Marketplace & Earnings Dashboard - Mobile Service
 * 
 * Provides API calls and AsyncStorage caching for:
 * - Creator marketplace browsing
 * - Creator profile viewing
 * - Earnings dashboard for creators
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorProfileSummary {
  userId: string;
  displayName: string;
  avatarUrl: string;
  shortBio: string;
  languages: string[];
  mainLocationCity?: string;
  mainLocationCountry?: string;
  earnsFromChat: boolean;
  baseMessageTokenCost: number;
  ppmMediaFromTokens: number;
  royalTier: 'NONE' | 'ROYAL_SILVER' | 'ROYAL_GOLD' | 'ROYAL_PLATINUM';
  trustScore: number;
  isHighRisk: boolean;
  lastActiveAt: number;
}

export interface CreatorMarketplaceItem extends CreatorProfileSummary {}

export interface CreatorMarketplaceFilters {
  language?: string;
  country?: string;
  minPriceTokens?: number;
  maxPriceTokens?: number;
  royalOnly?: boolean;
}

export interface CreatorEarningsSummary {
  userId: string;
  totalTokensEarnedAllTime: number;
  totalTokensEarned30d: number;
  totalTokensEarned90d: number;
  tokensFromChatMessagesAllTime: number;
  tokensFromBoostsAllTime: number;
  tokensFromPaidMediaAllTime: number;
  tokensFromAiCompanionsAllTime: number;
  tokensFromChatMessages30d: number;
  tokensFromBoosts30d: number;
  tokensFromPaidMedia30d: number;
  tokensFromAiCompanions30d: number;
  lastUpdatedAt: number;
}

export interface CreatorEarningsEvent {
  id: string;
  type: 'CHAT_MESSAGE' | 'BOOST' | 'PAID_MEDIA' | 'AI_COMPANION';
  counterpartyId: string;
  tokensEarned: number;
  createdAt: number;
}

export interface CreatorProfileResponse {
  creator: CreatorProfileSummary;
  relationship: {
    viewerBlockedCreator: boolean;
    creatorBlockedViewer: boolean;
  };
}

// ============================================================================
// ASYNC STORAGE KEYS
// ============================================================================

const CACHE_KEYS = {
  MARKETPLACE: (userId: string) => `creator_marketplace_cache_v1_${userId}`,
  EARNINGS_SUMMARY: (userId: string) => `creator_earnings_summary_v1_${userId}`,
  EARNINGS_EVENTS: (userId: string) => `creator_earnings_events_v1_${userId}`,
  PROFILE: (creatorId: string) => `creator_profile_cache_v1_${creatorId}`,
};

const CACHE_EXPIRY = {
  MARKETPLACE: 5 * 60 * 1000, // 5 minutes
  EARNINGS_SUMMARY: 2 * 60 * 1000, // 2 minutes
  EARNINGS_EVENTS: 2 * 60 * 1000, // 2 minutes
  PROFILE: 10 * 60 * 1000, // 10 minutes
};

// ============================================================================
// CACHE HELPERS
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
}

async function getCached<T>(key: string, maxAge: number): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    if (age > maxAge) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('[CreatorService] Cache read error:', error);
    return null;
  }
}

async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.error('[CreatorService] Cache write error:', error);
  }
}

async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('[CreatorService] Cache clear error:', error);
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch creator marketplace with optional filters
 * Returns cached data if available, otherwise fetches from API
 */
export async function fetchCreatorMarketplace(
  viewerId: string,
  filters?: CreatorMarketplaceFilters
): Promise<CreatorMarketplaceItem[]> {
  const cacheKey = CACHE_KEYS.MARKETPLACE(viewerId);

  try {
    // Try cache first (only if no filters)
    if (!filters || Object.keys(filters).length === 0) {
      const cached = await getCached<CreatorMarketplaceItem[]>(
        cacheKey,
        CACHE_EXPIRY.MARKETPLACE
      );
      if (cached) {
        console.log('[CreatorService] Using cached marketplace data');
        return cached;
      }
    }

    // Fetch from API
    const callable = httpsCallable<
      { filters?: CreatorMarketplaceFilters },
      { items: CreatorMarketplaceItem[]; nextCursor: string | null }
    >(functions, 'creator_getMarketplace');

    const result = await callable({ filters });
    const items = result.data.items || [];

    // Cache only if no filters
    if (!filters || Object.keys(filters).length === 0) {
      await setCache(cacheKey, items);
    }

    return items;
  } catch (error) {
    console.error('[CreatorService] Error fetching marketplace:', error);

    // Try to return cached data on error (even if expired)
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed: CachedData<CreatorMarketplaceItem[]> = JSON.parse(cached);
        console.log('[CreatorService] Returning expired cache due to error');
        return parsed.data;
      }
    } catch (cacheError) {
      console.error('[CreatorService] Cache fallback failed:', cacheError);
    }

    // Return empty array if all else fails
    return [];
  }
}

/**
 * Fetch a specific creator profile
 */
export async function fetchCreatorProfile(
  creatorId: string,
  viewerId: string
): Promise<CreatorProfileSummary | null> {
  const cacheKey = CACHE_KEYS.PROFILE(creatorId);

  try {
    // Try cache first
    const cached = await getCached<CreatorProfileResponse>(
      cacheKey,
      CACHE_EXPIRY.PROFILE
    );
    if (cached) {
      console.log('[CreatorService] Using cached profile data');
      return cached.creator;
    }

    // Fetch from API
    const callable = httpsCallable<
      { creatorId: string },
      CreatorProfileResponse
    >(functions, 'creator_getProfile');

    const result = await callable({ creatorId });

    // Cache the result
    await setCache(cacheKey, result.data);

    return result.data.creator;
  } catch (error) {
    console.error('[CreatorService] Error fetching creator profile:', error);

    // Try to return cached data on error (even if expired)
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed: CachedData<CreatorProfileResponse> = JSON.parse(cached);
        console.log('[CreatorService] Returning expired profile cache due to error');
        return parsed.data.creator;
      }
    } catch (cacheError) {
      console.error('[CreatorService] Profile cache fallback failed:', cacheError);
    }

    return null;
  }
}

/**
 * Fetch creator earnings summary (for current user)
 */
export async function fetchCreatorEarningsSummary(
  userId: string
): Promise<CreatorEarningsSummary | null> {
  const cacheKey = CACHE_KEYS.EARNINGS_SUMMARY(userId);

  try {
    // Try cache first
    const cached = await getCached<CreatorEarningsSummary>(
      cacheKey,
      CACHE_EXPIRY.EARNINGS_SUMMARY
    );
    if (cached) {
      console.log('[CreatorService] Using cached earnings summary');
      return cached;
    }

    // Fetch from API
    const callable = httpsCallable<
      { userId: string },
      CreatorEarningsSummary
    >(functions, 'creator_getEarningsSummary');

    const result = await callable({ userId });

    // Cache the result
    await setCache(cacheKey, result.data);

    return result.data;
  } catch (error) {
    console.error('[CreatorService] Error fetching earnings summary:', error);

    // Try to return cached data on error (even if expired)
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed: CachedData<CreatorEarningsSummary> = JSON.parse(cached);
        console.log('[CreatorService] Returning expired earnings cache due to error');
        return parsed.data;
      }
    } catch (cacheError) {
      console.error('[CreatorService] Earnings cache fallback failed:', cacheError);
    }

    return null;
  }
}

/**
 * Refresh creator earnings summary (bypass cache)
 */
export async function refreshCreatorEarningsSummary(
  userId: string
): Promise<CreatorEarningsSummary> {
  const cacheKey = CACHE_KEYS.EARNINGS_SUMMARY(userId);

  try {
    // Clear cache
    await clearCache(cacheKey);

    // Fetch fresh data
    const callable = httpsCallable<
      { userId: string },
      CreatorEarningsSummary
    >(functions, 'creator_getEarningsSummary');

    const result = await callable({ userId });

    // Cache the result
    await setCache(cacheKey, result.data);

    return result.data;
  } catch (error) {
    console.error('[CreatorService] Error refreshing earnings summary:', error);
    throw error;
  }
}

/**
 * Fetch creator earnings events (activity log)
 */
export async function fetchCreatorEarningsEvents(
  userId: string,
  cursor?: string
): Promise<{ events: CreatorEarningsEvent[]; nextCursor?: string | null }> {
  try {
    // Don't cache paginated data
    const callable = httpsCallable<
      { userId: string; cursor?: string },
      { items: CreatorEarningsEvent[]; nextCursor: string | null }
    >(functions, 'creator_getEarningsActivity');

    const result = await callable({ userId, cursor });

    return {
      events: result.data.items || [],
      nextCursor: result.data.nextCursor,
    };
  } catch (error) {
    console.error('[CreatorService] Error fetching earnings events:', error);
    return {
      events: [],
      nextCursor: null,
    };
  }
}

/**
 * Clear all creator-related caches
 */
export async function clearAllCreatorCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const creatorKeys = keys.filter(
      key =>
        key.startsWith('creator_marketplace_cache_') ||
        key.startsWith('creator_earnings_summary_') ||
        key.startsWith('creator_earnings_events_') ||
        key.startsWith('creator_profile_cache_')
    );

    if (creatorKeys.length > 0) {
      await AsyncStorage.multiRemove(creatorKeys);
      console.log(`[CreatorService] Cleared ${creatorKeys.length} creator caches`);
    }
  } catch (error) {
    console.error('[CreatorService] Error clearing caches:', error);
  }
}

/**
 * Get creator marketplace filters from AsyncStorage
 */
export async function getSavedMarketplaceFilters(): Promise<CreatorMarketplaceFilters | null> {
  try {
    const saved = await AsyncStorage.getItem('creator_marketplace_filters_v1');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('[CreatorService] Error getting saved filters:', error);
    return null;
  }
}

/**
 * Save creator marketplace filters to AsyncStorage
 */
export async function saveMarketplaceFilters(
  filters: CreatorMarketplaceFilters
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      'creator_marketplace_filters_v1',
      JSON.stringify(filters)
    );
  } catch (error) {
    console.error('[CreatorService] Error saving filters:', error);
  }
}