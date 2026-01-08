/**
 * Achievements Engine - Phase 31D-4
 * Manages achievement badges based on total swipes
 * ZERO backend calls, AsyncStorage only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  ACHIEVEMENTS_LIST: 'achievements.list',
  TOTAL_SWIPES: 'achievements.totalSwipes',
};

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'royal';

export type Achievement = {
  id: string;
  tier: AchievementTier;
  name: string;
  description: string;
  swipesRequired: number;
  unlocked: boolean;
  unlockedAt?: number; // timestamp
};

const ACHIEVEMENT_TIERS: Array<{
  tier: AchievementTier;
  swipesRequired: number;
  name: string;
  description: string;
}> = [
  {
    tier: 'bronze',
    swipesRequired: 100,
    name: 'Bronze Explorer',
    description: 'Complete 100 swipes',
  },
  {
    tier: 'silver',
    swipesRequired: 500,
    name: 'Silver Connector',
    description: 'Complete 500 swipes',
  },
  {
    tier: 'gold',
    swipesRequired: 1000,
    name: 'Gold Master',
    description: 'Complete 1000 swipes',
  },
  {
    tier: 'royal',
    swipesRequired: 5000,
    name: 'Royal Legend',
    description: 'Complete 5000 swipes',
  },
];

/**
 * Get achievement color based on tier
 */
export function getAchievementColor(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze':
      return '#CD7F32';
    case 'silver':
      return '#C0C0C0';
    case 'gold':
      return '#D4AF37';
    case 'royal':
      return '#9B59B6';
    default:
      return '#999';
  }
}

/**
 * Get achievement emoji based on tier
 */
export function getAchievementEmoji(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze':
      return '🥉';
    case 'silver':
      return '🥈';
    case 'gold':
      return '🥇';
    case 'royal':
      return '👑';
    default:
      return '🏆';
  }
}

/**
 * Initialize achievements list
 */
async function initializeAchievements(): Promise<Achievement[]> {
  const achievements: Achievement[] = ACHIEVEMENT_TIERS.map((tier, index) => ({
    id: `achievement_${tier.tier}`,
    tier: tier.tier,
    name: tier.name,
    description: tier.description,
    swipesRequired: tier.swipesRequired,
    unlocked: false,
  }));

  await AsyncStorage.setItem(
    STORAGE_KEYS.ACHIEVEMENTS_LIST,
    JSON.stringify(achievements)
  );

  return achievements;
}

/**
 * Get all achievements
 */
export async function getAchievements(): Promise<Achievement[]> {
  try {
    const achievementsStr = await AsyncStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS_LIST);
    
    if (!achievementsStr) {
      return await initializeAchievements();
    }

    return JSON.parse(achievementsStr);
  } catch (error) {
    console.error('[Achievements Engine] Error getting achievements:', error);
    return await initializeAchievements();
  }
}

/**
 * Get total swipes count
 */
export async function getTotalSwipes(): Promise<number> {
  try {
    const swipesStr = await AsyncStorage.getItem(STORAGE_KEYS.TOTAL_SWIPES);
    return swipesStr ? parseInt(swipesStr, 10) : 0;
  } catch (error) {
    console.error('[Achievements Engine] Error getting total swipes:', error);
    return 0;
  }
}

/**
 * Increment swipe count and check for new achievements
 */
export async function incrementSwipeCount(): Promise<{
  totalSwipes: number;
  newAchievements: Achievement[];
}> {
  try {
    const currentSwipes = await getTotalSwipes();
    const newTotalSwipes = currentSwipes + 1;

    // Update total swipes
    await AsyncStorage.setItem(STORAGE_KEYS.TOTAL_SWIPES, newTotalSwipes.toString());

    // Check for newly unlocked achievements
    const achievements = await getAchievements();
    const newAchievements: Achievement[] = [];

    let achievementsUpdated = false;

    for (const achievement of achievements) {
      if (
        !achievement.unlocked &&
        newTotalSwipes >= achievement.swipesRequired
      ) {
        achievement.unlocked = true;
        achievement.unlockedAt = Date.now();
        newAchievements.push(achievement);
        achievementsUpdated = true;
      }
    }

    // Save updated achievements if any were unlocked
    if (achievementsUpdated) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.ACHIEVEMENTS_LIST,
        JSON.stringify(achievements)
      );
    }

    return {
      totalSwipes: newTotalSwipes,
      newAchievements,
    };
  } catch (error) {
    console.error('[Achievements Engine] Error incrementing swipe count:', error);
    throw error;
  }
}

/**
 * Get achievement progress
 */
export async function getAchievementProgress(): Promise<{
  totalSwipes: number;
  achievements: Achievement[];
  unlockedCount: number;
  nextAchievement: Achievement | null;
  progressToNext: number;
}> {
  try {
    const [totalSwipes, achievements] = await Promise.all([
      getTotalSwipes(),
      getAchievements(),
    ]);

    const unlockedCount = achievements.filter(a => a.unlocked).length;
    
    // Find next achievement
    const nextAchievement = achievements.find(a => !a.unlocked) || null;
    
    let progressToNext = 0;
    if (nextAchievement) {
      progressToNext = (totalSwipes / nextAchievement.swipesRequired) * 100;
      progressToNext = Math.min(progressToNext, 100);
    }

    return {
      totalSwipes,
      achievements,
      unlockedCount,
      nextAchievement,
      progressToNext,
    };
  } catch (error) {
    console.error('[Achievements Engine] Error getting achievement progress:', error);
    throw error;
  }
}

/**
 * Get highest unlocked achievement
 */
export async function getHighestAchievement(): Promise<Achievement | null> {
  try {
    const achievements = await getAchievements();
    const unlocked = achievements.filter(a => a.unlocked);
    
    if (unlocked.length === 0) return null;

    // Return the highest tier unlocked
    return unlocked[unlocked.length - 1];
  } catch (error) {
    console.error('[Achievements Engine] Error getting highest achievement:', error);
    return null;
  }
}

/**
 * Reset achievements (for testing)
 */
export async function resetAchievements(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.ACHIEVEMENTS_LIST),
      AsyncStorage.removeItem(STORAGE_KEYS.TOTAL_SWIPES),
    ]);
  } catch (error) {
    console.error('[Achievements Engine] Error resetting achievements:', error);
    throw error;
  }
}