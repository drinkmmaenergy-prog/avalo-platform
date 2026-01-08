/**
 * PACK 50 — Royal Club Service
 * Mobile service for Royal Club membership management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type RoyalTier = 'NONE' | 'ROYAL_SILVER' | 'ROYAL_GOLD' | 'ROYAL_PLATINUM';

export interface RoyalState {
  userId: string;
  tier: RoyalTier;
  source: 'SPEND_BASED' | 'SUBSCRIPTION' | 'NONE';
  spendLast30DaysTokens: number;
  spendLast90DaysTokens: number;
  activatedAt?: number | null;
  expiresAt?: number | null;
  lastFetchedAt: number;
}

export interface RoyalPreview {
  currentTier: RoyalTier;
  nextTier: RoyalTier | null;
  tokensNeededForNextTier: number | null;
  lastFetchedAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_STATE = (userId: string) => `royal_state_v1_${userId}`;
const STORAGE_KEY_PREVIEW = (userId: string) => `royal_preview_v1_${userId}`;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if Royal tier is active (not NONE)
 */
export function isRoyalTier(tier: RoyalTier): boolean {
  return tier !== 'NONE';
}

/**
 * Check if tier is high (GOLD or PLATINUM)
 */
export function isHighRoyalTier(tier: RoyalTier): boolean {
  return tier === 'ROYAL_GOLD' || tier === 'ROYAL_PLATINUM';
}

/**
 * Get Royal tier display name
 */
export function getRoyalTierDisplayName(tier: RoyalTier): string {
  switch (tier) {
    case 'ROYAL_SILVER':
      return 'Royal Silver';
    case 'ROYAL_GOLD':
      return 'Royal Gold';
    case 'ROYAL_PLATINUM':
      return 'Royal Platinum';
    default:
      return 'None';
  }
}

/**
 * Get Royal tier color
 */
export function getRoyalTierColor(tier: RoyalTier): string {
  switch (tier) {
    case 'ROYAL_SILVER':
      return '#C0C0C0'; // Silver
    case 'ROYAL_GOLD':
      return '#D4AF37'; // Gold
    case 'ROYAL_PLATINUM':
      return '#E5E4E2'; // Platinum
    default:
      return '#666666'; // Gray
  }
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Load Royal state from AsyncStorage cache
 */
async function loadStateFromCache(userId: string): Promise<RoyalState | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_STATE(userId));
    if (!cached) return null;

    const state = JSON.parse(cached) as RoyalState;

    // Check if cache is still valid
    const now = Date.now();
    if (now - state.lastFetchedAt > CACHE_DURATION_MS) {
      return null; // Cache expired
    }

    return state;
  } catch (error) {
    console.error('[RoyalService] Error loading state from cache:', error);
    return null;
  }
}

/**
 * Save Royal state to AsyncStorage cache
 */
async function saveStateToCache(state: RoyalState): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_STATE(state.userId),
      JSON.stringify(state)
    );
  } catch (error) {
    console.error('[RoyalService] Error saving state to cache:', error);
  }
}

/**
 * Load Royal preview from AsyncStorage cache
 */
async function loadPreviewFromCache(userId: string): Promise<RoyalPreview | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_PREVIEW(userId));
    if (!cached) return null;

    const preview = JSON.parse(cached) as RoyalPreview;

    // Check if cache is still valid
    const now = Date.now();
    if (now - preview.lastFetchedAt > CACHE_DURATION_MS) {
      return null; // Cache expired
    }

    return preview;
  } catch (error) {
    console.error('[RoyalService] Error loading preview from cache:', error);
    return null;
  }
}

/**
 * Save Royal preview to AsyncStorage cache
 */
async function savePreviewToCache(preview: RoyalPreview, userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_PREVIEW(userId),
      JSON.stringify(preview)
    );
  } catch (error) {
    console.error('[RoyalService] Error saving preview to cache:', error);
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch Royal state from cache (non-blocking, returns cached data)
 */
export async function fetchRoyalState(userId: string): Promise<RoyalState | null> {
  if (!userId) return null;

  try {
    return await loadStateFromCache(userId);
  } catch (error) {
    console.error('[RoyalService] Error fetching Royal state:', error);
    return null;
  }
}

/**
 * Refresh Royal state from backend (blocking, updates cache)
 */
export async function refreshRoyalState(userId: string): Promise<RoyalState> {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const getState = httpsCallable(functions, 'royal_getState_callable');
    const result = await getState({ userId });
    const data = result.data as any;

    const state: RoyalState = {
      userId: data.userId,
      tier: data.tier,
      source: data.source,
      spendLast30DaysTokens: data.spendLast30DaysTokens || 0,
      spendLast90DaysTokens: data.spendLast90DaysTokens || 0,
      activatedAt: data.activatedAt || null,
      expiresAt: data.expiresAt || null,
      lastFetchedAt: Date.now(),
    };

    // Save to cache
    await saveStateToCache(state);

    return state;
  } catch (error) {
    console.error('[RoyalService] Error refreshing Royal state:', error);
    
    // Try to return cached data as fallback
    const cached = await loadStateFromCache(userId);
    if (cached) {
      return cached;
    }

    // Return default state
    return {
      userId,
      tier: 'NONE',
      source: 'NONE',
      spendLast30DaysTokens: 0,
      spendLast90DaysTokens: 0,
      activatedAt: null,
      expiresAt: null,
      lastFetchedAt: Date.now(),
    };
  }
}

/**
 * Fetch Royal preview from cache (non-blocking, returns cached data)
 */
export async function fetchRoyalPreview(userId: string): Promise<RoyalPreview | null> {
  if (!userId) return null;

  try {
    return await loadPreviewFromCache(userId);
  } catch (error) {
    console.error('[RoyalService] Error fetching Royal preview:', error);
    return null;
  }
}

/**
 * Refresh Royal preview from backend (blocking, updates cache)
 */
export async function refreshRoyalPreview(userId: string): Promise<RoyalPreview | null> {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const getPreview = httpsCallable(functions, 'royal_getPreview_callable');
    const result = await getPreview({ userId });
    const data = result.data as any;

    const preview: RoyalPreview = {
      currentTier: data.currentTier,
      nextTier: data.nextTier,
      tokensNeededForNextTier: data.tokensNeededForNextTier,
      lastFetchedAt: Date.now(),
    };

    // Save to cache
    await savePreviewToCache(preview, userId);

    return preview;
  } catch (error) {
    console.error('[RoyalService] Error refreshing Royal preview:', error);
    
    // Try to return cached data as fallback
    const cached = await loadPreviewFromCache(userId);
    if (cached) {
      return cached;
    }

    return null;
  }
}

/**
 * Clear Royal cache for a user (useful on logout)
 */
export async function clearRoyalCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_STATE(userId),
      STORAGE_KEY_PREVIEW(userId),
    ]);
  } catch (error) {
    console.error('[RoyalService] Error clearing Royal cache:', error);
  }
}

console.log('✅ Royal Service initialized - PACK 50');