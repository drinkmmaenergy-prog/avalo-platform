/**
 * PACK 49 — Personalization Service
 * Mobile service for fetching and caching user personalization data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// ============================================================================
// TYPES
// ============================================================================

export interface UserPersonalizationProfile {
  userId: string;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredDistanceKm: number | null;
  likedInterests: string[];
  dislikedInterests: string[];
  preferredGenders: string[];
  interactionIntensityScore: number; // 0-100
  spenderScore: number;              // 0-100
  aiUsageScore: number;              // 0-100
  lastFetchedAt: number;
}

export interface AiUserMemory {
  userId: string;
  companionId: string;
  memorySummary: string;
  keyFacts: string[];
  interests: string[];
  totalMessages: number;
  lastUpdatedAt: number;
}

export type PersonalizationEventType =
  | 'SWIPE_RIGHT'
  | 'CHAT_MESSAGE_SENT'
  | 'TOKENS_SPENT'
  | 'MEDIA_UNLOCK'
  | 'AI_MESSAGE'
  | 'PROFILE_VIEW'
  | 'COMPANION_SELECTED';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  PROFILE: (userId: string) => `personalization_profile_v1_${userId}`,
  AI_MEMORY: (userId: string, companionId: string) => 
    `ai_memory_v1_${userId}_${companionId}`,
};

const CACHE_TTL = {
  PROFILE: 6 * 60 * 60 * 1000, // 6 hours
  AI_MEMORY: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

const getFunctionsInstance = () => {
  try {
    const app = getApp();
    return getFunctions(app, 'europe-west3');
  } catch (error) {
    console.error('[Personalization] Error getting Functions instance:', error);
    throw error;
  }
};

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a personalization event
 * Fire-and-forget, non-blocking
 */
export const recordPersonalizationEvent = async (
  userId: string,
  type: PersonalizationEventType,
  options?: {
    targetUserId?: string;
    companionId?: string;
    tokensSpent?: number;
    interestsContext?: string[];
  }
): Promise<void> => {
  try {
    const functions = getFunctionsInstance();
    const recordEventFn = httpsCallable<
      {
        userId: string;
        type: PersonalizationEventType;
        targetUserId?: string;
        companionId?: string;
        tokensSpent?: number;
        interestsContext?: string[];
      },
      { ok: boolean; eventId?: string; error?: string }
    >(functions, 'recordPersonalizationEvent');

    // Fire-and-forget - don't await
    recordEventFn({
      userId,
      type,
      targetUserId: options?.targetUserId,
      companionId: options?.companionId,
      tokensSpent: options?.tokensSpent,
      interestsContext: options?.interestsContext,
    }).catch((error) => {
      console.warn('[Personalization] Failed to record event (non-blocking):', error.message);
    });
  } catch (error) {
    // Silently fail - event recording should never block UX
    console.warn('[Personalization] Event recording error (ignored):', error);
  }
};

// ============================================================================
// PROFILE FETCHING
// ============================================================================

/**
 * Fetch user personalization profile from cache or backend
 * Returns cached data if fresh, otherwise fetches from backend
 */
export const fetchUserPersonalizationProfile = async (
  userId: string
): Promise<UserPersonalizationProfile | null> => {
  try {
    // Try cache first
    const cacheKey = STORAGE_KEYS.PROFILE(userId);
    const cached = await AsyncStorage.getItem(cacheKey);

    if (cached) {
      const profile: UserPersonalizationProfile = JSON.parse(cached);
      const age = Date.now() - profile.lastFetchedAt;

      // Return cached if not stale
      if (age < CACHE_TTL.PROFILE) {
        console.log('[Personalization] Using cached profile');
        return profile;
      }
    }

    // Cache miss or stale - fetch from backend
    return await refreshUserPersonalizationProfile(userId);
  } catch (error) {
    console.error('[Personalization] Error fetching profile:', error);
    return null;
  }
};

/**
 * Force refresh user personalization profile from backend
 * Updates cache and returns fresh data
 */
export const refreshUserPersonalizationProfile = async (
  userId: string
): Promise<UserPersonalizationProfile> => {
  try {
    const functions = getFunctionsInstance();
    const getProfileFn = httpsCallable<
      { userId: string },
      {
        ok: boolean;
        profile?: {
          userId: string;
          preferredAgeMin: number | null;
          preferredAgeMax: number | null;
          preferredDistanceKm: number | null;
          likedInterests: string[];
          dislikedInterests: string[];
          preferredGenders: string[];
          interactionIntensityScore: number;
          spenderScore: number;
          aiUsageScore: number;
          lastUpdatedAt: number | null;
        };
        error?: string;
      }
    >(functions, 'getPersonalizationProfile');

    const result = await getProfileFn({ userId });

    if (!result.data.ok || !result.data.profile) {
      throw new Error(result.data.error || 'Failed to fetch profile');
    }

    const profile: UserPersonalizationProfile = {
      ...result.data.profile,
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    const cacheKey = STORAGE_KEYS.PROFILE(userId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(profile));

    console.log('[Personalization] Profile refreshed and cached');

    return profile;
  } catch (error: any) {
    console.error('[Personalization] Error refreshing profile:', error);
    
    // Return default profile on error
    const defaultProfile: UserPersonalizationProfile = {
      userId,
      preferredAgeMin: null,
      preferredAgeMax: null,
      preferredDistanceKm: null,
      likedInterests: [],
      dislikedInterests: [],
      preferredGenders: [],
      interactionIntensityScore: 0,
      spenderScore: 0,
      aiUsageScore: 0,
      lastFetchedAt: Date.now(),
    };

    return defaultProfile;
  }
};

// ============================================================================
// AI MEMORY FETCHING
// ============================================================================

/**
 * Fetch AI user memory from cache or backend
 * Returns cached data if fresh, otherwise fetches from backend
 */
export const fetchAiUserMemory = async (
  userId: string,
  companionId: string
): Promise<AiUserMemory | null> => {
  try {
    // Try cache first
    const cacheKey = STORAGE_KEYS.AI_MEMORY(userId, companionId);
    const cached = await AsyncStorage.getItem(cacheKey);

    if (cached) {
      const memory: AiUserMemory = JSON.parse(cached);
      const age = Date.now() - memory.lastUpdatedAt;

      // Return cached if not stale
      if (age < CACHE_TTL.AI_MEMORY) {
        console.log('[Personalization] Using cached AI memory');
        return memory;
      }
    }

    // Cache miss or stale - fetch from backend
    return await refreshAiUserMemory(userId, companionId);
  } catch (error) {
    console.error('[Personalization] Error fetching AI memory:', error);
    return null;
  }
};

/**
 * Force refresh AI user memory from backend
 * Updates cache and returns fresh data
 */
export const refreshAiUserMemory = async (
  userId: string,
  companionId: string
): Promise<AiUserMemory | null> => {
  try {
    const functions = getFunctionsInstance();
    const getMemoryFn = httpsCallable<
      { userId: string; companionId: string },
      {
        ok: boolean;
        memory?: {
          userId: string;
          companionId: string;
          memorySummary: string;
          keyFacts: string[];
          interests: string[];
          totalMessages: number;
          lastUpdatedAt: number | null;
        } | null;
        error?: string;
      }
    >(functions, 'getAiUserMemory');

    const result = await getMemoryFn({ userId, companionId });

    if (!result.data.ok) {
      throw new Error(result.data.error || 'Failed to fetch AI memory');
    }

    // Memory may be null if not yet created
    if (!result.data.memory) {
      console.log('[Personalization] No AI memory found yet');
      return null;
    }

    const memory: AiUserMemory = {
      userId: result.data.memory.userId,
      companionId: result.data.memory.companionId,
      memorySummary: result.data.memory.memorySummary,
      keyFacts: result.data.memory.keyFacts || [],
      interests: result.data.memory.interests || [],
      totalMessages: result.data.memory.totalMessages,
      lastUpdatedAt: result.data.memory.lastUpdatedAt || Date.now(),
    };

    // Cache the result
    const cacheKey = STORAGE_KEYS.AI_MEMORY(userId, companionId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(memory));

    console.log('[Personalization] AI memory refreshed and cached');

    return memory;
  } catch (error: any) {
    console.error('[Personalization] Error refreshing AI memory:', error);
    return null;
  }
};

/**
 * Manually trigger AI memory rebuild
 * Useful for testing or when user requests a refresh
 */
export const rebuildAiUserMemory = async (
  userId: string,
  companionId: string
): Promise<AiUserMemory | null> => {
  try {
    const functions = getFunctionsInstance();
    const rebuildMemoryFn = httpsCallable<
      { userId: string; companionId: string },
      {
        ok: boolean;
        memory?: {
          userId: string;
          companionId: string;
          memorySummary: string;
          keyFacts: string[];
          interests: string[];
          totalMessages: number;
          lastUpdatedAt: number;
        };
        error?: string;
      }
    >(functions, 'rebuildAiUserMemoryEndpoint');

    const result = await rebuildMemoryFn({ userId, companionId });

    if (!result.data.ok || !result.data.memory) {
      throw new Error(result.data.error || 'Failed to rebuild AI memory');
    }

    const memory: AiUserMemory = {
      userId: result.data.memory.userId,
      companionId: result.data.memory.companionId,
      memorySummary: result.data.memory.memorySummary,
      keyFacts: result.data.memory.keyFacts || [],
      interests: result.data.memory.interests || [],
      totalMessages: result.data.memory.totalMessages,
      lastUpdatedAt: result.data.memory.lastUpdatedAt,
    };

    // Cache the result
    const cacheKey = STORAGE_KEYS.AI_MEMORY(userId, companionId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(memory));

    console.log('[Personalization] AI memory rebuilt and cached');

    return memory;
  } catch (error: any) {
    console.error('[Personalization] Error rebuilding AI memory:', error);
    throw error;
  }
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear personalization cache for a user
 */
export const clearPersonalizationCache = async (userId: string): Promise<void> => {
  try {
    const profileKey = STORAGE_KEYS.PROFILE(userId);
    await AsyncStorage.removeItem(profileKey);
    
    // Note: AI memory cache keys include companionId, so we'd need to track them
    // For now, we just clear the profile
    console.log('[Personalization] Cache cleared for user:', userId);
  } catch (error) {
    console.error('[Personalization] Error clearing cache:', error);
  }
};

/**
 * Clear AI memory cache for a specific companion
 */
export const clearAiMemoryCache = async (
  userId: string,
  companionId: string
): Promise<void> => {
  try {
    const memoryKey = STORAGE_KEYS.AI_MEMORY(userId, companionId);
    await AsyncStorage.removeItem(memoryKey);
    console.log('[Personalization] AI memory cache cleared:', companionId);
  } catch (error) {
    console.error('[Personalization] Error clearing AI memory cache:', error);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Event recording
  recordPersonalizationEvent,
  
  // Profile fetching
  fetchUserPersonalizationProfile,
  refreshUserPersonalizationProfile,
  
  // AI memory
  fetchAiUserMemory,
  refreshAiUserMemory,
  rebuildAiUserMemory,
  
  // Cache management
  clearPersonalizationCache,
  clearAiMemoryCache,
};