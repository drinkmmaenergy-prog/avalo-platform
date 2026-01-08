/**
 * Profile Rank Service - PACK 40
 * Smart Profile Rank & Heat Score (Roof Value Engine)
 * 
 * HARD CONSTRAINTS:
 * - Local data only (AsyncStorage)
 * - No backend, no Firestore, no Functions
 * - Deterministic scoring (no randomness)
 * - Additive only - no refactoring existing modules
 * - Integrates with PACK 38 (Swipe-to-Icebreakers) and PACK 39 (Dynamic Chat Paywall)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface ProfileSignals {
  userId: string;
  heatScore: number;           // 0–100
  responsiveness: number;      // 0–1
  lastUpdatedAt: number;       // timestamp (ms)
  totalIncomingMessages: number;
  totalReplies: number;
  avgReplyTimeMinutes: number; // rolling average
  totalSwipesRightReceived: number;
  totalSwipesRightGiven: number;
}

export interface InterestMatchStats {
  viewerId: string;
  targetId: string;
  matchCount: number;          // 0–N
  normalizedScore: number;     // 0–1
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  PROFILE_SIGNALS: 'profile_signals_v1_',
  INTEREST_MATCH: 'interest_match_v1_',
} as const;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_SIGNALS: Omit<ProfileSignals, 'userId'> = {
  heatScore: 30,
  responsiveness: 0.5,
  totalIncomingMessages: 0,
  totalReplies: 0,
  avgReplyTimeMinutes: 60,
  totalSwipesRightReceived: 0,
  totalSwipesRightGiven: 0,
  lastUpdatedAt: Date.now(),
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get profile signals for a user
 * Returns default values if no data exists
 */
export async function getProfileSignals(userId: string): Promise<ProfileSignals> {
  try {
    const key = `${STORAGE_KEYS.PROFILE_SIGNALS}${userId}`;
    const data = await AsyncStorage.getItem(key);
    
    if (!data) {
      return {
        userId,
        ...DEFAULT_SIGNALS,
      };
    }
    
    return JSON.parse(data) as ProfileSignals;
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error getting signals:', error);
    return {
      userId,
      ...DEFAULT_SIGNALS,
    };
  }
}

/**
 * Save profile signals for a user
 */
async function saveProfileSignals(signals: ProfileSignals): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.PROFILE_SIGNALS}${signals.userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(signals));
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error saving signals:', error);
  }
}

/**
 * Calculate heat score based on signals
 * 
 * Formula:
 * - Incoming messages = "demand" (0-40 points)
 * - Swipes right received = "profile interest" (0-60 points)
 * - Responsiveness = "quality of interaction" (0-25 points)
 * - Base: 10 points
 * - Capped at 0-100
 */
function calculateHeatScore(signals: ProfileSignals): number {
  // Normalize counts with log
  const msgFactor = Math.log10(1 + signals.totalIncomingMessages) * 10;      // 0–~40
  const swipeReceivedFactor = Math.log10(1 + signals.totalSwipesRightReceived) * 15; // 0–~60
  const responsivenessFactor = signals.responsiveness * 25; // 0–25

  let raw = 10 + msgFactor + swipeReceivedFactor + responsivenessFactor;

  // Cap
  if (raw > 100) raw = 100;
  if (raw < 0) raw = 0;

  return Math.floor(raw);
}

/**
 * Calculate responsiveness score from average reply time
 * 
 * Fast reply < 10 min → close to 1
 * Slow reply > 180 min → close to 0
 */
function calculateResponsiveness(avgReplyTimeMinutes: number): number {
  const clamped = Math.max(0, Math.min(180, avgReplyTimeMinutes));
  const responsiveness = 1 - clamped / 180;
  return Math.max(0, Math.min(1, responsiveness));
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Update signals when user receives an incoming message
 */
export async function updateOnIncomingMessage(
  userId: string,
  receivedAt: number
): Promise<void> {
  try {
    const signals = await getProfileSignals(userId);
    
    signals.totalIncomingMessages += 1;
    signals.lastUpdatedAt = receivedAt;
    signals.heatScore = calculateHeatScore(signals);
    
    await saveProfileSignals(signals);
    
    if (__DEV__) {
      console.log(`[ProfileRank] Updated incoming message for ${userId}:`, {
        totalIncomingMessages: signals.totalIncomingMessages,
        heatScore: signals.heatScore,
      });
    }
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error updating incoming message:', error);
  }
}

/**
 * Update signals when user sends a reply
 * 
 * @param userId - User who is replying
 * @param replyAt - Timestamp of reply (ms)
 * @param originalMessageAt - Timestamp of message being replied to (ms)
 */
export async function updateOnReply(
  userId: string,
  replyAt: number,
  originalMessageAt: number
): Promise<void> {
  try {
    const signals = await getProfileSignals(userId);
    
    // Increment reply count
    signals.totalReplies += 1;
    
    // Calculate reply time in minutes
    const replyTimeMinutes = (replyAt - originalMessageAt) / 60000;
    
    // Update average reply time using exponential moving average (EMA)
    const alpha = 0.3;
    signals.avgReplyTimeMinutes = alpha * replyTimeMinutes + (1 - alpha) * signals.avgReplyTimeMinutes;
    
    // Update responsiveness
    signals.responsiveness = calculateResponsiveness(signals.avgReplyTimeMinutes);
    
    // Update heat score
    signals.lastUpdatedAt = replyAt;
    signals.heatScore = calculateHeatScore(signals);
    
    await saveProfileSignals(signals);
    
    if (__DEV__) {
      console.log(`[ProfileRank] Updated reply for ${userId}:`, {
        replyTimeMinutes: replyTimeMinutes.toFixed(2),
        avgReplyTimeMinutes: signals.avgReplyTimeMinutes.toFixed(2),
        responsiveness: signals.responsiveness.toFixed(2),
        heatScore: signals.heatScore,
      });
    }
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error updating reply:', error);
  }
}

/**
 * Update signals when user receives a right swipe
 */
export async function updateOnSwipeRightReceived(userId: string): Promise<void> {
  try {
    const signals = await getProfileSignals(userId);
    
    signals.totalSwipesRightReceived += 1;
    signals.lastUpdatedAt = Date.now();
    signals.heatScore = calculateHeatScore(signals);
    
    await saveProfileSignals(signals);
    
    if (__DEV__) {
      console.log(`[ProfileRank] Updated swipe right received for ${userId}:`, {
        totalSwipesRightReceived: signals.totalSwipesRightReceived,
        heatScore: signals.heatScore,
      });
    }
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error updating swipe right received:', error);
  }
}

/**
 * Update signals when user gives a right swipe
 */
export async function updateOnSwipeRightGiven(userId: string): Promise<void> {
  try {
    const signals = await getProfileSignals(userId);
    
    signals.totalSwipesRightGiven += 1;
    signals.lastUpdatedAt = Date.now();
    // Note: Giving swipes doesn't directly affect heat score
    
    await saveProfileSignals(signals);
    
    if (__DEV__) {
      console.log(`[ProfileRank] Updated swipe right given for ${userId}:`, {
        totalSwipesRightGiven: signals.totalSwipesRightGiven,
      });
    }
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error updating swipe right given:', error);
  }
}

// ============================================================================
// INTEREST MATCH SCORE
// ============================================================================

/**
 * Calculate interest match statistics between two users
 * 
 * @param viewerInterests - Viewer's interests
 * @param targetInterests - Target user's interests
 * @param viewerId - Viewer user ID
 * @param targetId - Target user ID
 * @returns InterestMatchStats with match count and normalized score
 */
export function calculateInterestMatchStats(
  viewerInterests: string[] | undefined,
  targetInterests: string[] | undefined,
  viewerId: string,
  targetId: string
): InterestMatchStats {
  const viewer = (viewerInterests || []).map(i => i.trim().toLowerCase());
  const target = (targetInterests || []).map(i => i.trim().toLowerCase());
  
  // Calculate intersection
  const viewerSet = new Set(viewer);
  const intersection = target.filter(interest => viewerSet.has(interest));
  const matchCount = intersection.length;
  
  // Maximum considered = 8; anything above is treated as 8
  const clampedCount = Math.min(matchCount, 8);
  
  // normalizedScore = matchCount / 8 (clamped 0–1)
  const normalizedScore = clampedCount / 8;
  
  if (__DEV__) {
    console.log(`[ProfileRank] Interest match between ${viewerId} and ${targetId}:`, {
      matchCount,
      normalizedScore: normalizedScore.toFixed(2),
      matches: intersection,
    });
  }
  
  return {
    viewerId,
    targetId,
    matchCount,
    normalizedScore,
  };
}

/**
 * Get cached interest match stats (optional optimization)
 */
export async function getCachedInterestMatchStats(
  viewerId: string,
  targetId: string
): Promise<InterestMatchStats | null> {
  try {
    const key = `${STORAGE_KEYS.INTEREST_MATCH}${viewerId}_${targetId}`;
    const data = await AsyncStorage.getItem(key);
    
    if (!data) return null;
    
    return JSON.parse(data) as InterestMatchStats;
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error getting cached interest match:', error);
    return null;
  }
}

/**
 * Cache interest match stats (optional optimization)
 */
export async function cacheInterestMatchStats(stats: InterestMatchStats): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.INTEREST_MATCH}${stats.viewerId}_${stats.targetId}`;
    await AsyncStorage.setItem(key, JSON.stringify(stats));
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error caching interest match:', error);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Clear all profile rank data (for testing/reset)
 */
export async function clearAllProfileRankData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const rankKeys = keys.filter(
      key => key.startsWith(STORAGE_KEYS.PROFILE_SIGNALS) || 
             key.startsWith(STORAGE_KEYS.INTEREST_MATCH)
    );
    
    if (rankKeys.length > 0) {
      await AsyncStorage.multiRemove(rankKeys);
    }
    
    if (__DEV__) console.log('[ProfileRank] All profile rank data cleared');
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error clearing profile rank data:', error);
  }
}

/**
 * Get statistics for debugging
 */
export async function getProfileRankStats(): Promise<{
  totalProfiles: number;
  totalInterestMatches: number;
}> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const signalKeys = keys.filter(key => key.startsWith(STORAGE_KEYS.PROFILE_SIGNALS));
    const matchKeys = keys.filter(key => key.startsWith(STORAGE_KEYS.INTEREST_MATCH));
    
    return {
      totalProfiles: signalKeys.length,
      totalInterestMatches: matchKeys.length,
    };
  } catch (error) {
    if (__DEV__) console.error('[ProfileRank] Error getting stats:', error);
    return {
      totalProfiles: 0,
      totalInterestMatches: 0,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core
  getProfileSignals,
  calculateInterestMatchStats,
  
  // Update functions
  updateOnIncomingMessage,
  updateOnReply,
  updateOnSwipeRightReceived,
  updateOnSwipeRightGiven,
  
  // Optional caching
  getCachedInterestMatchStats,
  cacheInterestMatchStats,
  
  // Utilities
  clearAllProfileRankData,
  getProfileRankStats,
};