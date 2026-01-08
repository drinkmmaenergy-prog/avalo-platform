/**
 * Streak Engine - Phase 31D-4
 * Manages daily swipe streaks and streak rewards
 * ZERO backend calls, AsyncStorage only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  STREAK_CURRENT: 'streak.current',
  STREAK_LAST_SWIPE_DATE: 'streak.lastSwipeDate',
  REWARDS_CLAIMABLE: 'rewards.claimable',
};

export type StreakReward = {
  id: string;
  type: 'golden_frame' | 'discover_boost' | 'visibility_boost';
  name: string;
  description: string;
  duration: number; // in hours
  unlockedAt: number; // timestamp
  expiresAt: number; // timestamp
  claimed: boolean;
};

/**
 * Check if two dates are on consecutive days
 */
function areConsecutiveDays(date1: Date, date2: Date): boolean {
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 20 && diffHours <= 28; // Allow 20-28 hour window
}

/**
 * Check if a date is today
 */
function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get current streak data
 */
export async function getStreakData(): Promise<{
  currentStreak: number;
  lastSwipeDate: Date | null;
  canStreakToday: boolean;
}> {
  try {
    const [streakStr, lastSwipeDateStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.STREAK_CURRENT),
      AsyncStorage.getItem(STORAGE_KEYS.STREAK_LAST_SWIPE_DATE),
    ]);

    const currentStreak = streakStr ? parseInt(streakStr, 10) : 0;
    const lastSwipeDate = lastSwipeDateStr ? new Date(lastSwipeDateStr) : null;

    // Check if user can continue streak today
    let canStreakToday = true;
    if (lastSwipeDate) {
      canStreakToday = !isToday(lastSwipeDate);
    }

    return {
      currentStreak,
      lastSwipeDate,
      canStreakToday,
    };
  } catch (error) {
    console.error('[Streak Engine] Error getting streak data:', error);
    return {
      currentStreak: 0,
      lastSwipeDate: null,
      canStreakToday: true,
    };
  }
}

/**
 * Update streak after a swipe
 */
export async function updateStreak(): Promise<{
  newStreak: number;
  streakIncreased: boolean;
  rewardUnlocked: StreakReward | null;
}> {
  try {
    const data = await getStreakData();
    
    // Already swiped today, no streak update
    if (!data.canStreakToday) {
      return {
        newStreak: data.currentStreak,
        streakIncreased: false,
        rewardUnlocked: null,
      };
    }

    let newStreak = 1;
    let streakIncreased = true;

    if (data.lastSwipeDate) {
      const now = new Date();
      if (areConsecutiveDays(data.lastSwipeDate, now)) {
        // Continue streak
        newStreak = data.currentStreak + 1;
      } else {
        // Reset streak (gap > 24h)
        newStreak = 1;
      }
    }

    // Save new streak
    const now = new Date().toISOString();
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.STREAK_CURRENT, newStreak.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.STREAK_LAST_SWIPE_DATE, now),
    ]);

    // Check for reward unlocks
    const rewardUnlocked = await checkAndUnlockReward(newStreak);

    return {
      newStreak,
      streakIncreased: newStreak > (data.lastSwipeDate ? data.currentStreak : 0),
      rewardUnlocked,
    };
  } catch (error) {
    console.error('[Streak Engine] Error updating streak:', error);
    throw error;
  }
}

/**
 * Check if a reward should be unlocked at this streak level
 */
async function checkAndUnlockReward(streak: number): Promise<StreakReward | null> {
  const rewardConfig = getRewardConfig(streak);
  if (!rewardConfig) return null;

  const now = Date.now();
  const reward: StreakReward = {
    id: `streak_${streak}_${now}`,
    type: rewardConfig.type,
    name: rewardConfig.name,
    description: rewardConfig.description,
    duration: rewardConfig.duration,
    unlockedAt: now,
    expiresAt: now + rewardConfig.duration * 60 * 60 * 1000, // Convert hours to ms
    claimed: false,
  };

  // Add to claimable rewards
  await addClaimableReward(reward);

  return reward;
}

/**
 * Get reward configuration for a streak milestone
 */
function getRewardConfig(streak: number): {
  type: StreakReward['type'];
  name: string;
  description: string;
  duration: number;
} | null {
  switch (streak) {
    case 3:
      return {
        type: 'golden_frame',
        name: 'Golden Profile Frame',
        description: '24h Golden Profile Frame',
        duration: 24,
      };
    case 7:
      return {
        type: 'discover_boost',
        name: 'Discover Boost',
        description: '48h Discover Boost',
        duration: 48,
      };
    case 14:
      return {
        type: 'visibility_boost',
        name: 'Premium Visibility Boost',
        description: '72h Premium Visibility Boost',
        duration: 72,
      };
    default:
      return null;
  }
}

/**
 * Get all claimable rewards
 */
export async function getClaimableRewards(): Promise<StreakReward[]> {
  try {
    const rewardsStr = await AsyncStorage.getItem(STORAGE_KEYS.REWARDS_CLAIMABLE);
    if (!rewardsStr) return [];

    const rewards: StreakReward[] = JSON.parse(rewardsStr);
    const now = Date.now();

    // Filter out expired rewards
    const validRewards = rewards.filter(r => r.expiresAt > now);

    // Update storage if we filtered any
    if (validRewards.length !== rewards.length) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.REWARDS_CLAIMABLE,
        JSON.stringify(validRewards)
      );
    }

    return validRewards;
  } catch (error) {
    console.error('[Streak Engine] Error getting claimable rewards:', error);
    return [];
  }
}

/**
 * Add a claimable reward
 */
async function addClaimableReward(reward: StreakReward): Promise<void> {
  try {
    const currentRewards = await getClaimableRewards();
    
    // Check if reward of this type already exists
    const existingIndex = currentRewards.findIndex(r => r.type === reward.type && !r.claimed);
    if (existingIndex >= 0) {
      // Replace existing unclaimed reward
      currentRewards[existingIndex] = reward;
    } else {
      currentRewards.push(reward);
    }

    await AsyncStorage.setItem(
      STORAGE_KEYS.REWARDS_CLAIMABLE,
      JSON.stringify(currentRewards)
    );
  } catch (error) {
    console.error('[Streak Engine] Error adding claimable reward:', error);
    throw error;
  }
}

/**
 * Claim a reward (mark as claimed, but don't remove)
 */
export async function claimReward(rewardId: string): Promise<boolean> {
  try {
    const rewards = await getClaimableRewards();
    const reward = rewards.find(r => r.id === rewardId);
    
    if (!reward || reward.claimed) return false;

    reward.claimed = true;

    await AsyncStorage.setItem(
      STORAGE_KEYS.REWARDS_CLAIMABLE,
      JSON.stringify(rewards)
    );

    return true;
  } catch (error) {
    console.error('[Streak Engine] Error claiming reward:', error);
    return false;
  }
}

/**
 * Get streak milestones info
 */
export function getStreakMilestones(): {
  days: number;
  rewardName: string;
  rewardDescription: string;
}[] {
  return [
    { days: 3, rewardName: 'Golden Frame', rewardDescription: '+24h Golden Profile Frame' },
    { days: 7, rewardName: 'Discover Boost', rewardDescription: '+48h Discover Boost' },
    { days: 14, rewardName: 'Visibility Boost', rewardDescription: '+72h Premium Visibility' },
  ];
}

/**
 * Reset streak (for testing)
 */
export async function resetStreak(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.STREAK_CURRENT),
      AsyncStorage.removeItem(STORAGE_KEYS.STREAK_LAST_SWIPE_DATE),
      AsyncStorage.removeItem(STORAGE_KEYS.REWARDS_CLAIMABLE),
    ]);
  } catch (error) {
    console.error('[Streak Engine] Error resetting streak:', error);
    throw error;
  }
}