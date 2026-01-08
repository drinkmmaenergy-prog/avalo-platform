/**
 * Swipe Counter Service - Phase 31D Pack 1
 * Handles daily swipe limits and hourly regeneration
 * Uses AsyncStorage only - NO backend calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  SWIPE_COUNT: '@avalo_swipe_count',
  LAST_HOURLY_RESTORE: '@avalo_last_hourly_restore',
  LAST_DAILY_RESET: '@avalo_last_daily_reset',
  DAILY_SWIPES_USED: '@avalo_daily_swipes_used',
};

// Swipe limits by tier
export type MembershipTier = 'free' | 'vip' | 'royal';

interface SwipeLimits {
  dailyLimit: number;
  hourlyRestore: number;
}

const SWIPE_LIMITS: Record<MembershipTier, SwipeLimits> = {
  free: {
    dailyLimit: 50,
    hourlyRestore: 10,
  },
  vip: {
    dailyLimit: 100,
    hourlyRestore: 15,
  },
  royal: {
    dailyLimit: 200,
    hourlyRestore: 25,
  },
};

export interface SwipeStatus {
  swipesLeft: number;
  dailyLimit: number;
  hourlyRestore: number;
  nextRegenerationAt: Date | null;
  nextDailyResetAt: Date;
  canSwipe: boolean;
  isRegenerating: boolean;
}

/**
 * Get current swipe status for a user
 */
export const getSwipeStatus = async (
  membershipTier: MembershipTier = 'free'
): Promise<SwipeStatus> => {
  try {
    const limits = SWIPE_LIMITS[membershipTier];
    const now = Date.now();

    // Get stored data
    const [swipeCountStr, lastHourlyStr, lastDailyStr, dailyUsedStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.SWIPE_COUNT),
      AsyncStorage.getItem(STORAGE_KEYS.LAST_HOURLY_RESTORE),
      AsyncStorage.getItem(STORAGE_KEYS.LAST_DAILY_RESET),
      AsyncStorage.getItem(STORAGE_KEYS.DAILY_SWIPES_USED),
    ]);

    let swipesLeft = swipeCountStr ? parseInt(swipeCountStr, 10) : limits.dailyLimit;
    let lastHourlyRestore = lastHourlyStr ? parseInt(lastHourlyStr, 10) : now;
    let lastDailyReset = lastDailyStr ? parseInt(lastDailyStr, 10) : now;
    let dailySwipesUsed = dailyUsedStr ? parseInt(dailyUsedStr, 10) : 0;

    // Check if we need daily reset (24 hours passed)
    const daysSinceReset = (now - lastDailyReset) / (1000 * 60 * 60 * 24);
    if (daysSinceReset >= 1) {
      // Reset daily swipes
      swipesLeft = limits.dailyLimit;
      dailySwipesUsed = 0;
      lastDailyReset = now;
      lastHourlyRestore = now;

      // Save reset
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SWIPE_COUNT, swipesLeft.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_DAILY_RESET, lastDailyReset.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_HOURLY_RESTORE, lastHourlyRestore.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.DAILY_SWIPES_USED, '0'),
      ]);
    } else {
      // Check for hourly restoration
      const hoursSinceRestore = (now - lastHourlyRestore) / (1000 * 60 * 60);
      if (hoursSinceRestore >= 1 && swipesLeft < limits.dailyLimit) {
        // Restore swipes (but don't exceed daily limit)
        const hoursToRestore = Math.floor(hoursSinceRestore);
        const swipesToRestore = hoursToRestore * limits.hourlyRestore;
        const remainingDaily = limits.dailyLimit - dailySwipesUsed;
        
        swipesLeft = Math.min(swipesLeft + swipesToRestore, remainingDaily);
        lastHourlyRestore = now;

        // Save restored count
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.SWIPE_COUNT, swipesLeft.toString()),
          AsyncStorage.setItem(STORAGE_KEYS.LAST_HOURLY_RESTORE, lastHourlyRestore.toString()),
        ]);
      }
    }

    // Calculate next regeneration time
    let nextRegenerationAt: Date | null = null;
    if (swipesLeft < limits.dailyLimit - dailySwipesUsed) {
      const nextHourlyRestore = lastHourlyRestore + (60 * 60 * 1000); // 1 hour
      nextRegenerationAt = new Date(nextHourlyRestore);
    }

    // Calculate next daily reset
    const nextDailyReset = lastDailyReset + (24 * 60 * 60 * 1000); // 24 hours
    const nextDailyResetAt = new Date(nextDailyReset);

    return {
      swipesLeft,
      dailyLimit: limits.dailyLimit,
      hourlyRestore: limits.hourlyRestore,
      nextRegenerationAt,
      nextDailyResetAt,
      canSwipe: swipesLeft > 0,
      isRegenerating: swipesLeft === 0,
    };
  } catch (error) {
    console.error('Error getting swipe status:', error);
    // Return default status on error
    const limits = SWIPE_LIMITS[membershipTier];
    return {
      swipesLeft: limits.dailyLimit,
      dailyLimit: limits.dailyLimit,
      hourlyRestore: limits.hourlyRestore,
      nextRegenerationAt: null,
      nextDailyResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      canSwipe: true,
      isRegenerating: false,
    };
  }
};

/**
 * Decrement swipe count after a swipe action
 */
export const decrementSwipe = async (): Promise<boolean> => {
  try {
    const swipeCountStr = await AsyncStorage.getItem(STORAGE_KEYS.SWIPE_COUNT);
    const dailyUsedStr = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_SWIPES_USED);

    let swipesLeft = swipeCountStr ? parseInt(swipeCountStr, 10) : 0;
    let dailySwipesUsed = dailyUsedStr ? parseInt(dailyUsedStr, 10) : 0;

    if (swipesLeft > 0) {
      swipesLeft -= 1;
      dailySwipesUsed += 1;

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SWIPE_COUNT, swipesLeft.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.DAILY_SWIPES_USED, dailySwipesUsed.toString()),
      ]);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error decrementing swipe:', error);
    return false;
  }
};

/**
 * Manually restore hourly swipes (called by hook at intervals)
 */
export const restoreHourlySwipes = async (
  membershipTier: MembershipTier = 'free'
): Promise<number> => {
  try {
    const limits = SWIPE_LIMITS[membershipTier];
    const now = Date.now();

    const [swipeCountStr, lastHourlyStr, dailyUsedStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.SWIPE_COUNT),
      AsyncStorage.getItem(STORAGE_KEYS.LAST_HOURLY_RESTORE),
      AsyncStorage.getItem(STORAGE_KEYS.DAILY_SWIPES_USED),
    ]);

    let swipesLeft = swipeCountStr ? parseInt(swipeCountStr, 10) : limits.dailyLimit;
    const lastHourlyRestore = lastHourlyStr ? parseInt(lastHourlyStr, 10) : now;
    const dailySwipesUsed = dailyUsedStr ? parseInt(dailyUsedStr, 10) : 0;

    const hoursSinceRestore = (now - lastHourlyRestore) / (1000 * 60 * 60);

    if (hoursSinceRestore >= 1 && swipesLeft < limits.dailyLimit) {
      const hoursToRestore = Math.floor(hoursSinceRestore);
      const swipesToRestore = hoursToRestore * limits.hourlyRestore;
      const remainingDaily = limits.dailyLimit - dailySwipesUsed;
      
      swipesLeft = Math.min(swipesLeft + swipesToRestore, remainingDaily);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SWIPE_COUNT, swipesLeft.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_HOURLY_RESTORE, now.toString()),
      ]);

      return swipesLeft;
    }

    return swipesLeft;
  } catch (error) {
    console.error('Error restoring hourly swipes:', error);
    return 0;
  }
};

/**
 * Manually restore daily swipes (called at daily reset)
 */
export const restoreDailySwipes = async (
  membershipTier: MembershipTier = 'free'
): Promise<number> => {
  try {
    const limits = SWIPE_LIMITS[membershipTier];
    const now = Date.now();

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.SWIPE_COUNT, limits.dailyLimit.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.LAST_DAILY_RESET, now.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.LAST_HOURLY_RESTORE, now.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.DAILY_SWIPES_USED, '0'),
    ]);

    return limits.dailyLimit;
  } catch (error) {
    console.error('Error restoring daily swipes:', error);
    return 0;
  }
};

/**
 * Check if user is at zero swipes
 */
export const isAtZero = async (): Promise<boolean> => {
  try {
    const swipeCountStr = await AsyncStorage.getItem(STORAGE_KEYS.SWIPE_COUNT);
    const swipesLeft = swipeCountStr ? parseInt(swipeCountStr, 10) : 0;
    return swipesLeft === 0;
  } catch (error) {
    console.error('Error checking zero status:', error);
    return false;
  }
};

/**
 * Check if swipes are currently regenerating
 */
export const isRegenerating = async (
  membershipTier: MembershipTier = 'free'
): Promise<boolean> => {
  try {
    const status = await getSwipeStatus(membershipTier);
    return status.isRegenerating;
  } catch (error) {
    console.error('Error checking regeneration status:', error);
    return false;
  }
};

/**
 * Clear all swipe data (for testing/debugging)
 */
export const clearSwipeData = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.SWIPE_COUNT),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_HOURLY_RESTORE),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_DAILY_RESET),
      AsyncStorage.removeItem(STORAGE_KEYS.DAILY_SWIPES_USED),
    ]);
  } catch (error) {
    console.error('Error clearing swipe data:', error);
  }
};