/**
 * useSwipeCounter Hook - Phase 31D Pack 1
 * React hook for managing swipe counter state
 * Updates every minute to avoid excessive re-renders
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSwipeStatus,
  decrementSwipe,
  restoreHourlySwipes,
  MembershipTier,
  SwipeStatus,
} from '../services/swipeCounterService';

interface UseSwipeCounterReturn {
  swipesLeft: number;
  dailyLimit: number;
  hourlyRestore: number;
  nextRegenerationAt: Date | null;
  nextDailyResetAt: Date;
  canSwipe: boolean;
  isRegenerating: boolean;
  loading: boolean;
  decrement: () => Promise<boolean>;
  forceRefresh: () => Promise<void>;
}

/**
 * Hook to manage swipe counter with automatic regeneration
 * @param membershipTier - User's membership tier (free, vip, royal)
 */
export const useSwipeCounter = (
  membershipTier: MembershipTier = 'free'
): UseSwipeCounterReturn => {
  const [status, setStatus] = useState<SwipeStatus>({
    swipesLeft: 0,
    dailyLimit: 50,
    hourlyRestore: 10,
    nextRegenerationAt: null,
    nextDailyResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    canSwipe: false,
    isRegenerating: false,
  });
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  /**
   * Load current swipe status
   */
  const loadStatus = useCallback(async () => {
    try {
      const newStatus = await getSwipeStatus(membershipTier);
      setStatus(newStatus);
      lastUpdateRef.current = Date.now();
    } catch (error) {
      console.error('Error loading swipe status:', error);
    } finally {
      setLoading(false);
    }
  }, [membershipTier]);

  /**
   * Check for hourly restoration
   */
  const checkHourlyRestore = useCallback(async () => {
    try {
      const now = Date.now();
      const minutesSinceLastUpdate = (now - lastUpdateRef.current) / (1000 * 60);

      // Only check if at least 1 minute has passed
      if (minutesSinceLastUpdate >= 1) {
        const restoredCount = await restoreHourlySwipes(membershipTier);
        
        // If swipes were restored, reload status
        if (restoredCount > status.swipesLeft) {
          await loadStatus();
        }
      }
    } catch (error) {
      console.error('Error checking hourly restore:', error);
    }
  }, [membershipTier, status.swipesLeft, loadStatus]);

  /**
   * Decrement swipe count
   */
  const decrement = useCallback(async (): Promise<boolean> => {
    try {
      const success = await decrementSwipe();
      if (success) {
        // Reload status to get updated counts
        await loadStatus();
      }
      return success;
    } catch (error) {
      console.error('Error decrementing swipe:', error);
      return false;
    }
  }, [loadStatus]);

  /**
   * Force refresh swipe status
   */
  const forceRefresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    await loadStatus();
  }, [loadStatus]);

  // Initial load
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Set up interval for minute-based updates (not every second)
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Check every minute for hourly restoration
    intervalRef.current = setInterval(() => {
      checkHourlyRestore();
    }, 60 * 1000); // 60 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkHourlyRestore]);

  return {
    swipesLeft: status.swipesLeft,
    dailyLimit: status.dailyLimit,
    hourlyRestore: status.hourlyRestore,
    nextRegenerationAt: status.nextRegenerationAt,
    nextDailyResetAt: status.nextDailyResetAt,
    canSwipe: status.canSwipe,
    isRegenerating: status.isRegenerating,
    loading,
    decrement,
    forceRefresh,
  };
};