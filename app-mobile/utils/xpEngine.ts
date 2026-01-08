/**
 * XP Engine - Phase 31D-4
 * Manages XP points, leveling, and gamification
 * ZERO backend calls, AsyncStorage only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  XP_TOTAL: 'xp.total',
  XP_LEVEL: 'xp.level',
};

const XP_PER_LEVEL = 250;
const MAX_LEVEL = 50;
const BASE_XP_PER_SWIPE = 2;

export type SmartMatchLevel = 'TOP' | 'HIGH' | 'MEDIUM' | 'LOW' | null;

/**
 * Calculate XP bonus based on SmartMatch level
 */
export function getXPBonus(smartMatchLevel: SmartMatchLevel): number {
  switch (smartMatchLevel) {
    case 'TOP':
      return 3;
    case 'HIGH':
      return 1;
    default:
      return 0;
  }
}

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXP: number): number {
  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;
  return Math.min(level, MAX_LEVEL);
}

/**
 * Calculate XP progress in current level
 */
export function calculateLevelProgress(totalXP: number): {
  currentLevel: number;
  xpInCurrentLevel: number;
  xpNeededForNext: number;
  progressPercent: number;
} {
  const currentLevel = calculateLevel(totalXP);
  
  if (currentLevel >= MAX_LEVEL) {
    return {
      currentLevel: MAX_LEVEL,
      xpInCurrentLevel: XP_PER_LEVEL,
      xpNeededForNext: 0,
      progressPercent: 100,
    };
  }

  const xpInCurrentLevel = totalXP % XP_PER_LEVEL;
  const xpNeededForNext = XP_PER_LEVEL - xpInCurrentLevel;
  const progressPercent = (xpInCurrentLevel / XP_PER_LEVEL) * 100;

  return {
    currentLevel,
    xpInCurrentLevel,
    xpNeededForNext,
    progressPercent,
  };
}

/**
 * Get current XP data from storage
 */
export async function getXPData(): Promise<{
  totalXP: number;
  level: number;
  xpInCurrentLevel: number;
  xpNeededForNext: number;
  progressPercent: number;
}> {
  try {
    const [totalXPStr, levelStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.XP_TOTAL),
      AsyncStorage.getItem(STORAGE_KEYS.XP_LEVEL),
    ]);

    const totalXP = totalXPStr ? parseInt(totalXPStr, 10) : 0;
    const storedLevel = levelStr ? parseInt(levelStr, 10) : 1;

    // Calculate level from XP (source of truth)
    const calculatedLevel = calculateLevel(totalXP);
    const progress = calculateLevelProgress(totalXP);

    // Update stored level if it's out of sync
    if (storedLevel !== calculatedLevel) {
      await AsyncStorage.setItem(STORAGE_KEYS.XP_LEVEL, calculatedLevel.toString());
    }

    return {
      totalXP,
      level: calculatedLevel,
      ...progress,
    };
  } catch (error) {
    console.error('[XP Engine] Error getting XP data:', error);
    return {
      totalXP: 0,
      level: 1,
      xpInCurrentLevel: 0,
      xpNeededForNext: XP_PER_LEVEL,
      progressPercent: 0,
    };
  }
}

/**
 * Award XP for a swipe action
 */
export async function awardSwipeXP(smartMatchLevel: SmartMatchLevel = null): Promise<{
  xpGained: number;
  totalXP: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}> {
  try {
    const currentData = await getXPData();
    const bonus = getXPBonus(smartMatchLevel);
    const xpGained = BASE_XP_PER_SWIPE + bonus;
    const newTotalXP = currentData.totalXP + xpGained;
    const newLevel = calculateLevel(newTotalXP);
    const leveledUp = newLevel > currentData.level;

    // Update storage
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.XP_TOTAL, newTotalXP.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.XP_LEVEL, newLevel.toString()),
    ]);

    return {
      xpGained,
      totalXP: newTotalXP,
      oldLevel: currentData.level,
      newLevel,
      leveledUp,
    };
  } catch (error) {
    console.error('[XP Engine] Error awarding XP:', error);
    throw error;
  }
}

/**
 * Reset XP (for testing purposes only)
 */
export async function resetXP(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.XP_TOTAL),
      AsyncStorage.removeItem(STORAGE_KEYS.XP_LEVEL),
    ]);
  } catch (error) {
    console.error('[XP Engine] Error resetting XP:', error);
    throw error;
  }
}

/**
 * Get XP info for display
 */
export function getXPInfo() {
  return {
    xpPerSwipe: BASE_XP_PER_SWIPE,
    xpPerLevel: XP_PER_LEVEL,
    maxLevel: MAX_LEVEL,
  };
}