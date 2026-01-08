/**
 * PACK 54 - Enforcement Service for Mobile App
 * 
 * Handles fetching and caching enforcement state for users.
 * Provides read-only enforcement information to the mobile app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type AccountStatus = 'ACTIVE' | 'LIMITED' | 'SUSPENDED' | 'BANNED';
export type VisibilityStatus = 'VISIBLE' | 'HIDDEN_FROM_DISCOVERY' | 'HIDDEN_FROM_ALL';
export type MessagingStatus = 'NORMAL' | 'READ_ONLY' | 'NO_NEW_CHATS';
export type EarningStatus = 'NORMAL' | 'EARN_DISABLED';

export interface EnforcementState {
  userId: string;
  accountStatus: AccountStatus;
  visibilityStatus: VisibilityStatus;
  messagingStatus: MessagingStatus;
  earningStatus: EarningStatus;
  reasons: string[];
  lastFetchedAt: number;
}

export interface EnforcementRestrictions {
  canSendMessages: boolean;
  canStartNewChats: boolean;
  canAppearInDiscovery: boolean;
  canAppearInMarketplace: boolean;
  accountStatus: AccountStatus;
  visibilityStatus: VisibilityStatus;
  messagingStatus: MessagingStatus;
  earningStatus: EarningStatus;
  reasons: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_KEY_PREFIX = 'enforcement_state_v1_';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CACHE HELPERS
// ============================================================================

/**
 * Get enforcement state from cache
 */
async function getCachedState(userId: string): Promise<EnforcementState | null> {
  try {
    const key = `${CACHE_KEY_PREFIX}${userId}`;
    const cached = await AsyncStorage.getItem(key);

    if (!cached) {
      return null;
    }

    const state: EnforcementState = JSON.parse(cached);

    // Check if cache is still valid
    const now = Date.now();
    if (now - state.lastFetchedAt > CACHE_DURATION_MS) {
      // Cache expired
      return null;
    }

    return state;
  } catch (error) {
    console.error('Error reading enforcement state from cache:', error);
    return null;
  }
}

/**
 * Save enforcement state to cache
 */
async function cacheState(state: EnforcementState): Promise<void> {
  try {
    const key = `${CACHE_KEY_PREFIX}${state.userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('Error caching enforcement state:', error);
  }
}

/**
 * Clear cached enforcement state
 */
export async function clearEnforcementCache(userId: string): Promise<void> {
  try {
    const key = `${CACHE_KEY_PREFIX}${userId}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing enforcement cache:', error);
  }
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Fetch enforcement state from backend
 */
export async function fetchEnforcementState(
  userId: string
): Promise<EnforcementState | null> {
  try {
    // Try cache first
    const cached = await getCachedState(userId);
    if (cached) {
      return cached;
    }

    // Fetch from backend
    const getState = httpsCallable(functions, 'enforcement_getState');
    const result = await getState({ userId });
    const data = result.data as any;

    const state: EnforcementState = {
      userId: data.userId,
      accountStatus: data.accountStatus,
      visibilityStatus: data.visibilityStatus,
      messagingStatus: data.messagingStatus,
      earningStatus: data.earningStatus,
      reasons: data.reasons || [],
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    await cacheState(state);

    return state;
  } catch (error) {
    console.error('Error fetching enforcement state:', error);
    return null;
  }
}

/**
 * Refresh enforcement state (ignores cache)
 */
export async function refreshEnforcementState(
  userId: string
): Promise<EnforcementState> {
  try {
    // Clear cache first
    await clearEnforcementCache(userId);

    // Fetch fresh data
    const getState = httpsCallable(functions, 'enforcement_getState');
    const result = await getState({ userId });
    const data = result.data as any;

    const state: EnforcementState = {
      userId: data.userId,
      accountStatus: data.accountStatus,
      visibilityStatus: data.visibilityStatus,
      messagingStatus: data.messagingStatus,
      earningStatus: data.earningStatus,
      reasons: data.reasons || [],
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    await cacheState(state);

    return state;
  } catch (error) {
    console.error('Error refreshing enforcement state:', error);
    
    // Return default state on error
    return {
      userId,
      accountStatus: 'ACTIVE',
      visibilityStatus: 'VISIBLE',
      messagingStatus: 'NORMAL',
      earningStatus: 'NORMAL',
      reasons: [],
      lastFetchedAt: Date.now(),
    };
  }
}

/**
 * Get effective restrictions for current user
 */
export async function getEnforcementRestrictions(): Promise<EnforcementRestrictions | null> {
  try {
    const getRestrictions = httpsCallable(functions, 'enforcement_getRestrictions');
    const result = await getRestrictions({});
    const data = result.data as any;

    if (!data.success) {
      return null;
    }

    return data.restrictions as EnforcementRestrictions;
  } catch (error) {
    console.error('Error fetching enforcement restrictions:', error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if account is restricted
 */
export function isAccountRestricted(state: EnforcementState): boolean {
  return (
    state.accountStatus === 'SUSPENDED' ||
    state.accountStatus === 'BANNED' ||
    state.accountStatus === 'LIMITED'
  );
}

/**
 * Check if messaging is restricted
 */
export function isMessagingRestricted(state: EnforcementState): boolean {
  return (
    state.messagingStatus === 'READ_ONLY' ||
    state.messagingStatus === 'NO_NEW_CHATS' ||
    isAccountRestricted(state)
  );
}

/**
 * Check if earning is disabled
 */
export function isEarningDisabled(state: EnforcementState): boolean {
  return state.earningStatus === 'EARN_DISABLED' || isAccountRestricted(state);
}

/**
 * Check if user is hidden from discovery
 */
export function isHiddenFromDiscovery(state: EnforcementState): boolean {
  return (
    state.visibilityStatus === 'HIDDEN_FROM_DISCOVERY' ||
    state.visibilityStatus === 'HIDDEN_FROM_ALL'
  );
}

/**
 * Get user-friendly restriction message
 */
export function getRestrictionMessage(state: EnforcementState): string | null {
  if (state.accountStatus === 'BANNED') {
    return 'enforcement.accountBanned';
  }
  
  if (state.accountStatus === 'SUSPENDED') {
    return 'enforcement.accountSuspended';
  }
  
  if (state.messagingStatus === 'READ_ONLY') {
    return 'enforcement.messagingReadOnly';
  }
  
  if (state.messagingStatus === 'NO_NEW_CHATS') {
    return 'enforcement.noNewChats';
  }
  
  if (state.earningStatus === 'EARN_DISABLED') {
    return 'enforcement.earningDisabled';
  }
  
  if (state.visibilityStatus === 'HIDDEN_FROM_DISCOVERY') {
    return 'enforcement.hiddenFromDiscovery';
  }
  
  return null;
}

/**
 * Check if user should see restriction banner
 */
export function shouldShowRestrictionBanner(state: EnforcementState): boolean {
  return isAccountRestricted(state) || isMessagingRestricted(state);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  fetchEnforcementState,
  refreshEnforcementState,
  getEnforcementRestrictions,
  clearEnforcementCache,
  isAccountRestricted,
  isMessagingRestricted,
  isEarningDisabled,
  isHiddenFromDiscovery,
  getRestrictionMessage,
  shouldShowRestrictionBanner,
};