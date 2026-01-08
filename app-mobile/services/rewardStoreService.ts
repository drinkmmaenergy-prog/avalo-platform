/**
 * Reward Store Service - Phase 32-5
 * Manages first-time reward unlocks after FTUX completion
 * UI-ONLY: Zero backend calls, AsyncStorage only, NO monetization changes
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const REWARD_STORE_ASYNC_STORAGE_KEY = 'reward_store_state_v1';

export type RewardId =
  | 'PROFILE_SPOTLIGHT'
  | 'SMARTMATCH_ANIMATION'
  | 'VIP_TRIAL'
  | 'GOLDEN_FRAME'
  | 'PROFILE_INSIGHTS_LITE';

export type RewardStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVATED';

export interface RewardDefinition {
  id: RewardId;
  titleKey: string;      // i18n key
  descriptionKey: string; // i18n key
  icon: string;          // emoji
  duration?: number;     // in hours, undefined = permanent
  order: number;
}

export interface ActivatedReward {
  rewardId: RewardId;
  activatedAt: string;   // ISO string
  expiresAt?: string;    // ISO string, undefined = permanent
}

export interface RewardStoreState {
  availableRewards: RewardDefinition[];
  activatedRewards: ActivatedReward[];
  dismissed: boolean;    // User dismissed the reward store permanently
  createdAt: string;     // ISO string when rewards were unlocked
}

/**
 * Initialize reward definitions (cosmetic only)
 */
export function initRewardDefinitions(): RewardDefinition[] {
  return [
    {
      id: 'PROFILE_SPOTLIGHT',
      titleKey: 'rewardHub.rewards.profileSpotlight',
      descriptionKey: 'rewardHub.description.profileSpotlight',
      icon: '⭐',
      duration: 24,
      order: 1,
    },
    {
      id: 'SMARTMATCH_ANIMATION',
      titleKey: 'rewardHub.rewards.smartMatchAnimation',
      descriptionKey: 'rewardHub.description.smartMatchAnimation',
      icon: '✨',
      duration: 48,
      order: 2,
    },
    {
      id: 'VIP_TRIAL',
      titleKey: 'rewardHub.rewards.vipTrial',
      descriptionKey: 'rewardHub.description.vipTrial',
      icon: '👑',
      duration: 72,
      order: 3,
    },
    {
      id: 'GOLDEN_FRAME',
      titleKey: 'rewardHub.rewards.goldenFrame',
      descriptionKey: 'rewardHub.description.goldenFrame',
      icon: '🖼️',
      duration: undefined, // Permanent
      order: 4,
    },
    {
      id: 'PROFILE_INSIGHTS_LITE',
      titleKey: 'rewardHub.rewards.profileInsightsLite',
      descriptionKey: 'rewardHub.description.profileInsightsLite',
      icon: '📊',
      duration: 168, // 7 days
      order: 5,
    },
  ];
}

/**
 * Initialize reward store (called when FTUX missions completed)
 */
export function initRewardStore(): RewardStoreState {
  return {
    availableRewards: initRewardDefinitions(),
    activatedRewards: [],
    dismissed: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Activate a reward (UI-only, no backend)
 */
export function activateReward(
  state: RewardStoreState,
  rewardId: RewardId
): RewardStoreState {
  const reward = state.availableRewards.find(r => r.id === rewardId);
  if (!reward) {
    console.error('[Reward Store] Reward not found:', rewardId);
    return state;
  }

  // Check if already activated
  const alreadyActivated = state.activatedRewards.some(
    ar => ar.rewardId === rewardId && !isRewardExpired(ar)
  );
  
  if (alreadyActivated) {
    console.log('[Reward Store] Reward already activated:', rewardId);
    return state;
  }

  // Create activation
  const now = new Date();
  const activatedReward: ActivatedReward = {
    rewardId,
    activatedAt: now.toISOString(),
    expiresAt: reward.duration
      ? new Date(now.getTime() + reward.duration * 60 * 60 * 1000).toISOString()
      : undefined,
  };

  return {
    ...state,
    activatedRewards: [...state.activatedRewards, activatedReward],
  };
}

/**
 * Check if a reward is currently activated
 */
export function isRewardActivated(
  state: RewardStoreState,
  rewardId: RewardId
): boolean {
  const activation = state.activatedRewards.find(ar => ar.rewardId === rewardId);
  if (!activation) return false;
  
  return !isRewardExpired(activation);
}

/**
 * Check if an activation has expired
 */
export function isRewardExpired(activation: ActivatedReward): boolean {
  if (!activation.expiresAt) return false; // Permanent rewards never expire
  
  const now = new Date();
  const expiryDate = new Date(activation.expiresAt);
  return now > expiryDate;
}

/**
 * Get time remaining for an activated reward
 */
export function getTimeRemaining(activation: ActivatedReward): string | null {
  if (!activation.expiresAt) return null; // Permanent
  
  const now = new Date();
  const expiryDate = new Date(activation.expiresAt);
  const hoursRemaining = Math.max(
    0,
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  );
  
  if (hoursRemaining < 1) {
    const minutesRemaining = Math.floor(hoursRemaining * 60);
    return `${minutesRemaining}m`;
  }
  
  return `${Math.floor(hoursRemaining)}h`;
}

/**
 * Get reward status
 */
export function getRewardStatus(
  state: RewardStoreState,
  rewardId: RewardId
): RewardStatus {
  if (isRewardActivated(state, rewardId)) {
    return 'ACTIVATED';
  }
  
  return 'AVAILABLE';
}

/**
 * Dismiss the reward store (user chose not to activate)
 */
export function dismissRewardStore(state: RewardStoreState): RewardStoreState {
  return {
    ...state,
    dismissed: true,
  };
}

/**
 * Check if reward store is available (not dismissed and has unclaimed rewards)
 */
export function isRewardStoreAvailable(state: RewardStoreState): boolean {
  if (state.dismissed) return false;
  
  // Check if there are any rewards that haven't been activated
  return state.availableRewards.some(reward => {
    const status = getRewardStatus(state, reward.id);
    return status === 'AVAILABLE';
  });
}

/**
 * Load reward store state from AsyncStorage
 */
export async function loadRewardStoreState(): Promise<RewardStoreState | null> {
  try {
    const stateStr = await AsyncStorage.getItem(REWARD_STORE_ASYNC_STORAGE_KEY);
    if (!stateStr) return null;
    
    const state: RewardStoreState = JSON.parse(stateStr);
    return state;
  } catch (error) {
    console.error('[Reward Store] Error loading state:', error);
    return null;
  }
}

/**
 * Save reward store state to AsyncStorage
 */
export async function saveRewardStoreState(state: RewardStoreState): Promise<void> {
  try {
    await AsyncStorage.setItem(REWARD_STORE_ASYNC_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[Reward Store] Error saving state:', error);
    throw error;
  }
}

/**
 * Reset reward store (for testing)
 */
export async function resetRewardStore(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REWARD_STORE_ASYNC_STORAGE_KEY);
  } catch (error) {
    console.error('[Reward Store] Error resetting store:', error);
    throw error;
  }
}

/**
 * Check if user should see reward store (after FTUX completion)
 */
export async function shouldShowRewardStore(ftuxCompleted: boolean): Promise<boolean> {
  if (!ftuxCompleted) return false;
  
  const state = await loadRewardStoreState();
  if (!state) return true; // First time, user completed FTUX
  
  return isRewardStoreAvailable(state);
}