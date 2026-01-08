/**
 * Phase 13 - Daily Missions Engine
 * Manages daily missions, progress tracking, and rewards
 * 
 * IMPORTANT: This module only ADDS new mission functionality.
 * It does NOT modify ANY existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type MissionType =
  | 'DAILY_LOGIN'
  | 'DAILY_SWIPES'
  | 'DAILY_MESSAGES'
  | 'DAILY_TIPS'
  | 'DAILY_AI_CHAT'
  | 'DAILY_CALL_MINUTES'
  | 'DAILY_CONTENT_VIEW';

export interface MissionDefinition {
  id: string;
  type: MissionType;
  name: string;
  description: string;
  targetCount: number;
  rewardTokens: number;
  iconKey: string;
  maxPerDay: number;
}

export interface MissionProgress {
  userId: string;
  missionId: string;
  date: string; // YYYY-MM-DD
  currentCount: number;
  targetCount: number;
  completed: boolean;
  claimed: boolean;
  rewardTokens: number;
  lastUpdated: Date;
}

export interface UserMissionStats {
  userId: string;
  totalMissionsCompleted: number;
  totalRewardsEarned: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string;
}

// ============================================================================
// MISSION DEFINITIONS
// ============================================================================

const MISSION_DEFINITIONS: MissionDefinition[] = [
  {
    id: 'daily_login',
    type: 'DAILY_LOGIN',
    name: 'Daily Login',
    description: 'Log in to Avalo today',
    targetCount: 1,
    rewardTokens: 5,
    iconKey: '🎯',
    maxPerDay: 1,
  },
  {
    id: 'daily_swipes',
    type: 'DAILY_SWIPES',
    name: 'Active Explorer',
    description: 'Swipe on 10 profiles',
    targetCount: 10,
    rewardTokens: 10,
    iconKey: '👆',
    maxPerDay: 1,
  },
  {
    id: 'daily_messages',
    type: 'DAILY_MESSAGES',
    name: 'Social Butterfly',
    description: 'Send 10 messages',
    targetCount: 10,
    rewardTokens: 15,
    iconKey: '💬',
    maxPerDay: 1,
  },
  {
    id: 'daily_tips',
    type: 'DAILY_TIPS',
    name: 'Generous Tipper',
    description: 'Tip a creator at least 20 tokens',
    targetCount: 20,
    rewardTokens: 10,
    iconKey: '💝',
    maxPerDay: 1,
  },
  {
    id: 'daily_ai_chat',
    type: 'DAILY_AI_CHAT',
    name: 'AI Companion',
    description: 'Start an AI Companion chat',
    targetCount: 1,
    rewardTokens: 10,
    iconKey: '🤖',
    maxPerDay: 1,
  },
];

// ============================================================================
// GET DAILY MISSIONS
// ============================================================================

/**
 * Get daily missions for a user with current progress
 */
export async function getDailyMissionsForUser(
  userId: string,
  date?: string
): Promise<{
  missions: Array<MissionDefinition & { progress: MissionProgress }>;
  stats: UserMissionStats;
}> {
  try {
    const today = date || getTodayString();
    
    // Get user stats
    const stats = await getUserMissionStats(userId);
    
    // Build missions with progress
    const missions = await Promise.all(
      MISSION_DEFINITIONS.map(async (definition) => {
        const progress = await getMissionProgress(userId, definition.id, today);
        return {
          ...definition,
          progress,
        };
      })
    );
    
    return { missions, stats };
  } catch (error) {
    throw error;
  }
}

/**
 * Get progress for a specific mission
 */
async function getMissionProgress(
  userId: string,
  missionId: string,
  date: string
): Promise<MissionProgress> {
  const progressId = `${userId}_${missionId}_${date}`;
  const progressRef = db.collection('missionProgress').doc(progressId);
  const progressSnap = await progressRef.get();
  
  if (!progressSnap.exists) {
    const mission = MISSION_DEFINITIONS.find(m => m.id === missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }
    
    // Initialize progress
    const initialProgress: MissionProgress = {
      userId,
      missionId,
      date,
      currentCount: 0,
      targetCount: mission.targetCount,
      completed: false,
      claimed: false,
      rewardTokens: mission.rewardTokens,
      lastUpdated: new Date(),
    };
    
    await progressRef.set({
      ...initialProgress,
      lastUpdated: serverTimestamp(),
    });
    
    return initialProgress;
  }
  
  const data = progressSnap.data();
  return {
    userId: data.userId,
    missionId: data.missionId,
    date: data.date,
    currentCount: data.currentCount || 0,
    targetCount: data.targetCount || 0,
    completed: data.completed || false,
    claimed: data.claimed || false,
    rewardTokens: data.rewardTokens || 0,
    lastUpdated: data.lastUpdated?.toDate() || new Date(),
  };
}

// ============================================================================
// RECORD MISSION EVENT
// ============================================================================

/**
 * Record a mission event and update progress
 */
export async function recordMissionEvent(
  userId: string,
  missionType: MissionType,
  amount: number = 1
): Promise<void> {
  try {
    const today = getTodayString();
    
    // Find mission definition
    const mission = MISSION_DEFINITIONS.find(m => m.type === missionType);
    if (!mission) {
      return; // Unknown mission type - skip silently
    }
    
    // Get current progress
    const progressId = `${userId}_${mission.id}_${today}`;
    const progressRef = db.collection('missionProgress').doc(progressId);
    const progressSnap = await progressRef.get();
    
    if (!progressSnap.exists) {
      // Initialize progress
      await progressRef.set({
        userId,
        missionId: mission.id,
        date: today,
        currentCount: amount,
        targetCount: mission.targetCount,
        completed: amount >= mission.targetCount,
        claimed: false,
        rewardTokens: mission.rewardTokens,
        lastUpdated: serverTimestamp(),
      });
    } else {
      const data = progressSnap.data();
      const newCount = (data.currentCount || 0) + amount;
      const isCompleted = newCount >= mission.targetCount;
      
      await progressRef.update({
        currentCount: newCount,
        completed: isCompleted,
        lastUpdated: serverTimestamp(),
      });
    }
    
    // Record event for analytics
    await db.collection('missionEvents').add({
      userId,
      missionType,
      missionId: mission.id,
      amount,
      date: today,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    // Don't fail the main operation if mission tracking fails
  }
}

// ============================================================================
// CLAIM MISSION REWARD
// ============================================================================

/**
 * Claim reward for a completed mission
 */
export async function claimMissionReward(
  userId: string,
  missionId: string,
  date?: string
): Promise<{ success: boolean; tokensAwarded: number; message: string }> {
  try {
    const today = date || getTodayString();
    const progressId = `${userId}_${missionId}_${today}`;
    const progressRef = db.collection('missionProgress').doc(progressId);
    const progressSnap = await progressRef.get();
    
    if (!progressSnap.exists) {
      return { success: false, tokensAwarded: 0, message: 'Mission not found' };
    }
    
    const progress = progressSnap.data();
    
    if (!progress.completed) {
      return { success: false, tokensAwarded: 0, message: 'Mission not completed' };
    }
    
    if (progress.claimed) {
      return { success: false, tokensAwarded: 0, message: 'Reward already claimed' };
    }
    
    const rewardTokens = progress.rewardTokens || 0;
    
    // Grant tokens
    const walletRef = db.collection('balances').doc(userId).collection('wallet').doc('wallet');
    const walletSnap = await walletRef.get();
    
    if (walletSnap.exists) {
      await walletRef.update({
        tokens: increment(rewardTokens),
        lastUpdated: serverTimestamp(),
      });
    } else {
      await walletRef.set({
        tokens: rewardTokens,
        lastUpdated: serverTimestamp(),
      });
    }
    
    // Mark as claimed
    await progressRef.update({
      claimed: true,
      claimedAt: serverTimestamp(),
    });
    
    // Record transaction
    await db.collection('transactions').add({
      senderUid: 'mission_system',
      receiverUid: userId,
      tokensAmount: rewardTokens,
      avaloFee: 0,
      transactionType: 'mission_reward',
      missionId,
      date: today,
      createdAt: serverTimestamp(),
      validated: true,
    });
    
    // Update user stats
    await updateUserMissionStats(userId, rewardTokens, today);
    
    return {
      success: true,
      tokensAwarded: rewardTokens,
      message: 'Reward claimed successfully',
    };
  } catch (error) {
    return { success: false, tokensAwarded: 0, message: 'Failed to claim reward' };
  }
}

// ============================================================================
// USER STATS
// ============================================================================

/**
 * Get user mission stats
 */
export async function getUserMissionStats(userId: string): Promise<UserMissionStats> {
  try {
    const statsRef = db.collection('missionStats').doc(userId);
    const statsSnap = await statsRef.get();
    
    if (!statsSnap.exists) {
      const initialStats: UserMissionStats = {
        userId,
        totalMissionsCompleted: 0,
        totalRewardsEarned: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: '',
      };
      
      await statsRef.set({
        ...initialStats,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      
      return initialStats;
    }
    
    const data = statsSnap.data();
    return {
      userId,
      totalMissionsCompleted: data.totalMissionsCompleted || 0,
      totalRewardsEarned: data.totalRewardsEarned || 0,
      currentStreak: data.currentStreak || 0,
      longestStreak: data.longestStreak || 0,
      lastCompletedDate: data.lastCompletedDate || '',
    };
  } catch (error) {
    return {
      userId,
      totalMissionsCompleted: 0,
      totalRewardsEarned: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: '',
    };
  }
}

/**
 * Update user mission stats after claiming a reward
 */
async function updateUserMissionStats(
  userId: string,
  rewardTokens: number,
  date: string
): Promise<void> {
  try {
    const statsRef = db.collection('missionStats').doc(userId);
    const statsSnap = await statsRef.get();
    
    if (!statsSnap.exists) {
      await statsRef.set({
        userId,
        totalMissionsCompleted: 1,
        totalRewardsEarned: rewardTokens,
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: date,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
    } else {
      const data = statsSnap.data();
      const lastDate = data.lastCompletedDate || '';
      const yesterday = getYesterdayString(date);
      
      let newStreak = 1;
      if (lastDate === yesterday) {
        newStreak = (data.currentStreak || 0) + 1;
      } else if (lastDate === date) {
        newStreak = data.currentStreak || 1;
      }
      
      const newLongestStreak = Math.max(newStreak, data.longestStreak || 0);
      
      await statsRef.update({
        totalMissionsCompleted: increment(1),
        totalRewardsEarned: increment(rewardTokens),
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastCompletedDate: date,
        lastUpdated: serverTimestamp(),
      });
    }
  } catch (error) {
    // Stats update is optional
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Expire old missions (runs daily via scheduler)
 */
export async function expireOldMissions(): Promise<number> {
  try {
    const cutoffDate = getTodayString();
    
    // Get old unclaimed missions
    const oldMissionsQuery = await db.collection('missionProgress')
      .where('date', '<', cutoffDate)
      .where('claimed', '==', false)
      .where('completed', '==', true)
      .limit(500)
      .get();
    
    if (oldMissionsQuery.empty) {
      return 0;
    }
    
    const batch = db.batch();
    oldMissionsQuery.docs.forEach(doc => {
      batch.update(doc.ref, {
        expired: true,
        expiredAt: serverTimestamp(),
      });
    });
    
    await batch.commit();
    return oldMissionsQuery.size;
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getYesterdayString(fromDate?: string): string {
  const date = fromDate ? new Date(fromDate) : new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  MISSION_DEFINITIONS,
};