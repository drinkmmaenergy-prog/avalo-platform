/**
 * PACK 43 — Loyal Lover Streaks (Relational Streak Engine)
 *
 * Tracks 1:1 relationship streaks between users:
 * - Days with consecutive activity (min 1 paid message per day)
 * - Total messages and tokens spent in the relationship
 * - 100% local, AsyncStorage-only, NO backend, NO free benefits
 *
 * Economic model (65/35, zero free trials) remains unchanged.
 * Streaks are purely motivational UI/telemetry.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncStreakActivity } from './backSyncService';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatStreak {
  userId: string;           // Owner of local data (currently logged in)
  partnerId: string;        // Other party in the relationship
  streakDays: number;       // How many days in a row is the chat active (min. 0)
  lastActiveDate: string;   // "YYYY-MM-DD" in local time
  firstStartedDate: string; // "YYYY-MM-DD" when current streak started
  totalMessagesSent: number;
  totalMessagesReceived: number;
  totalTokensSpentByUser: number; // Tokens spent by this.userId in this chat
  totalTokensSpentByPartner: number; // Optional, if available locally
  lastUpdatedAt: number;    // Timestamp ms
}

export interface ChatStreakSummary {
  streakDays: number;
  isActiveToday: boolean;
  lostToday: boolean;
}

type StreakMap = {
  [partnerId: string]: ChatStreak;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_PREFIX = 'streaks_v1_';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current local date in YYYY-MM-DD format
 */
function getLocalDateString(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if date1 is exactly 1 day before date2
 */
function isYesterday(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: string, date2: string): boolean {
  return date1 === date2;
}

/**
 * Get storage key for user's streaks
 */
function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Load all streaks for a user from AsyncStorage
 */
async function loadStreaksMap(userId: string): Promise<StreakMap> {
  try {
    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      return {};
    }
    return JSON.parse(data) as StreakMap;
  } catch (error) {
    console.error('[loyalStreakService] Error loading streaks:', error);
    return {};
  }
}

/**
 * Save all streaks for a user to AsyncStorage
 */
async function saveStreaksMap(userId: string, streaksMap: StreakMap): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(streaksMap));
  } catch (error) {
    console.error('[loyalStreakService] Error saving streaks:', error);
    throw error;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the streak for a specific user pair
 */
export async function getStreakForPair(
  userId: string,
  partnerId: string
): Promise<ChatStreak | null> {
  try {
    const streaksMap = await loadStreaksMap(userId);
    return streaksMap[partnerId] || null;
  } catch (error) {
    console.error('[loyalStreakService] Error getting streak for pair:', error);
    return null;
  }
}

/**
 * Get all streaks for a user
 */
export async function getAllStreaks(userId: string): Promise<ChatStreak[]> {
  try {
    const streaksMap = await loadStreaksMap(userId);
    return Object.values(streaksMap);
  } catch (error) {
    console.error('[loyalStreakService] Error getting all streaks:', error);
    return [];
  }
}

/**
 * Register message activity and update streak accordingly
 * 
 * Streak logic:
 * - No existing streak: start new (streakDays = 1)
 * - lastActiveDate === today: update counters only (no increment)
 * - lastActiveDate === yesterday: increment streakDays, update date
 * - lastActiveDate < yesterday (gap >= 2 days): RESET streak, start fresh
 *   (but keep cumulative totalMessages* and totalTokens*)
 */
export async function registerMessageActivity(
  userId: string,
  partnerId: string,
  options: {
    isSender: boolean;
    tokensSpentByUser: number; // 0 if no new expense
    messageCreatedAt: number;  // Timestamp ms
  }
): Promise<ChatStreak> {
  try {
    const streaksMap = await loadStreaksMap(userId);
    const today = getLocalDateString(options.messageCreatedAt);
    
    let streak = streaksMap[partnerId];
    
    if (!streak) {
      // No existing streak - create new
      streak = {
        userId,
        partnerId,
        streakDays: 1,
        lastActiveDate: today,
        firstStartedDate: today,
        totalMessagesSent: options.isSender ? 1 : 0,
        totalMessagesReceived: options.isSender ? 0 : 1,
        totalTokensSpentByUser: options.tokensSpentByUser,
        totalTokensSpentByPartner: 0,
        lastUpdatedAt: Date.now(),
      };
    } else {
      // Existing streak - apply logic
      const lastDate = streak.lastActiveDate;
      
      if (isSameDay(lastDate, today)) {
        // Same day activity - just update counters, don't increment streakDays
        streak.totalMessagesSent += options.isSender ? 1 : 0;
        streak.totalMessagesReceived += options.isSender ? 0 : 1;
        streak.totalTokensSpentByUser += options.tokensSpentByUser;
        streak.lastUpdatedAt = Date.now();
      } else if (isYesterday(lastDate, today)) {
        // Yesterday was active - increment streak
        streak.streakDays += 1;
        streak.lastActiveDate = today;
        streak.totalMessagesSent += options.isSender ? 1 : 0;
        streak.totalMessagesReceived += options.isSender ? 0 : 1;
        streak.totalTokensSpentByUser += options.tokensSpentByUser;
        streak.lastUpdatedAt = Date.now();
      } else {
        // Gap of 2+ days - streak broken, start new
        // Keep cumulative totals, reset streakDays and dates
        streak.streakDays = 1;
        streak.firstStartedDate = today;
        streak.lastActiveDate = today;
        streak.totalMessagesSent += options.isSender ? 1 : 0;
        streak.totalMessagesReceived += options.isSender ? 0 : 1;
        streak.totalTokensSpentByUser += options.tokensSpentByUser;
        streak.lastUpdatedAt = Date.now();
      }
    }
    
    // Save updated streaks map
    streaksMap[partnerId] = streak;
    await saveStreaksMap(userId, streaksMap);
    
    // PACK 44: Backend sync - streak activity (AFTER local success)
    try {
      await syncStreakActivity(userId, partnerId, streak.streakDays);
    } catch (error) {
      console.error('[PACK 44] Error syncing streak activity to backend:', error);
      // Don't throw - backend sync failure shouldn't break streak tracking
    }
    
    return streak;
  } catch (error) {
    console.error('[loyalStreakService] Error registering message activity:', error);
    throw error;
  }
}

/**
 * Get streak summary for UI display
 */
export function getStreakSummary(streak: ChatStreak | null): ChatStreakSummary | null {
  if (!streak) {
    return null;
  }
  
  const today = getLocalDateString();
  const isActiveToday = isSameDay(streak.lastActiveDate, today);
  
  // Simple logic: lostToday would require more complex date tracking
  // For now, we can determine if streak was lost by checking if yesterday
  // was active but today is not (with streakDays > 0)
  const yesterday = getLocalDateString(Date.now() - 24 * 60 * 60 * 1000);
  const lostToday = isSameDay(streak.lastActiveDate, yesterday) && streak.streakDays > 0 && !isActiveToday;
  
  return {
    streakDays: streak.streakDays,
    isActiveToday,
    lostToday,
  };
}

/**
 * Clear all streaks for a user (for testing/debugging)
 */
export async function clearAllStreaks(userId: string): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('[loyalStreakService] Error clearing streaks:', error);
    throw error;
  }
}

export default {
  getStreakForPair,
  getAllStreaks,
  registerMessageActivity,
  getStreakSummary,
  clearAllStreaks,
};