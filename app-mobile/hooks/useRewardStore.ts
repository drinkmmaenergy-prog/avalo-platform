/**
 * useRewardStore Hook - Phase 32-5
 * React hook for managing reward store state and checking availability
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RewardStoreState,
  RewardDefinition,
  loadRewardStoreState,
  saveRewardStoreState,
  activateReward,
  getRewardStatus,
  shouldShowRewardStore,
  isRewardStoreAvailable,
  initRewardStore,
} from '../services/rewardStoreService';

interface UseRewardStoreReturn {
  state: RewardStoreState | null;
  isLoading: boolean;
  shouldShow: boolean;
  availableRewardsCount: number;
  activateRewardById: (rewardId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  initializeStore: () => Promise<void>;
}

/**
 * Hook to manage Reward Store state
 * @param ftuxCompleted - Whether FTUX missions are completed
 */
export function useRewardStore(ftuxCompleted: boolean): UseRewardStoreReturn {
  const [state, setState] = useState<RewardStoreState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shouldShow, setShouldShow] = useState(false);

  /**
   * Load reward store state
   */
  const loadState = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedState = await loadRewardStoreState();
      setState(loadedState);
      
      // Check if should show
      const show = await shouldShowRewardStore(ftuxCompleted);
      setShouldShow(show);
    } catch (error) {
      console.error('[useRewardStore] Error loading state:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ftuxCompleted]);

  /**
   * Initialize reward store (when FTUX completes)
   */
  const initializeStore = useCallback(async () => {
    try {
      // Check if already initialized
      const existing = await loadRewardStoreState();
      if (existing) {
        setState(existing);
        return;
      }
      
      // Initialize new store
      const newState = initRewardStore();
      await saveRewardStoreState(newState);
      setState(newState);
      setShouldShow(true);
    } catch (error) {
      console.error('[useRewardStore] Error initializing store:', error);
    }
  }, []);

  /**
   * Activate a reward
   */
  const activateRewardById = useCallback(async (rewardId: string): Promise<boolean> => {
    if (!state) return false;
    
    try {
      const updatedState = activateReward(state, rewardId as any);
      await saveRewardStoreState(updatedState);
      setState(updatedState);
      
      // Check if should still show
      const show = isRewardStoreAvailable(updatedState);
      setShouldShow(show);
      
      return true;
    } catch (error) {
      console.error('[useRewardStore] Error activating reward:', error);
      return false;
    }
  }, [state]);

  /**
   * Refresh state
   */
  const refresh = useCallback(async () => {
    await loadState();
  }, [loadState]);

  // Initialize on mount
  useEffect(() => {
    loadState();
  }, [loadState]);

  // Calculate available rewards count
  const availableRewardsCount = state
    ? state.availableRewards.filter(r => getRewardStatus(state, r.id) === 'AVAILABLE').length
    : 0;

  return {
    state,
    isLoading,
    shouldShow,
    availableRewardsCount,
    activateRewardById,
    refresh,
    initializeStore,
  };
}