/**
 * Mission Service
 * Manages daily missions, progress tracking, and rewards
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// ============================================================================
// TYPES
// ============================================================================

export interface Mission {
  missionId: string;
  type: string;
  name: string;
  description: string;
  targetCount: number;
  currentCount: number;
  progress: number;
  rewardTokens: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED';
  iconKey: string;
}

export interface MissionStats {
  userId: string;
  totalMissionsCompleted: number;
  totalRewardsEarned: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string;
}

export interface DailyMissionsResponse {
  missions: Mission[];
  stats: MissionStats;
  totalRewardsClaimed: number;
}

// ============================================================================
// GET MISSIONS
// ============================================================================

/**
 * Get daily missions for current user
 */
export async function getDailyMissions(date?: string): Promise<DailyMissionsResponse> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const getMissionsFn = httpsCallable<
      { date?: string },
      { missions: any[]; stats: MissionStats }
    >(functions, 'getDailyMissions');
    
    const result = await getMissionsFn({ date });
    const data = result.data;
    
    // Transform missions
    const missions: Mission[] = data.missions.map((m: any) => {
      const progress = m.progress || {
        currentCount: 0,
        targetCount: m.targetCount || 1,
        completed: false,
        claimed: false,
      };
      
      const progressPercentage = Math.min(
        100,
        Math.floor((progress.currentCount / progress.targetCount) * 100)
      );
      
      let status: Mission['status'] = 'IN_PROGRESS';
      if (progress.claimed) {
        status = 'CLAIMED';
      } else if (progress.completed) {
        status = 'COMPLETED';
      }
      
      return {
        missionId: m.id,
        type: m.type,
        name: m.name,
        description: m.description,
        targetCount: m.targetCount,
        currentCount: progress.currentCount,
        progress: progressPercentage,
        rewardTokens: m.rewardTokens,
        status,
        iconKey: m.iconKey,
      };
    });
    
    const totalRewardsClaimed = missions
      .filter(m => m.status === 'CLAIMED')
      .reduce((sum, m) => sum + m.rewardTokens, 0);
    
    return {
      missions,
      stats: data.stats,
      totalRewardsClaimed,
    };
  } catch (error) {
    console.error('Error getting daily missions:', error);
    throw error;
  }
}

/**
 * Get user mission stats
 */
export async function getUserMissionStats(): Promise<MissionStats> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const getStatsFn = httpsCallable<void, MissionStats>(
      functions,
      'getUserMissionStats'
    );
    
    const result = await getStatsFn();
    return result.data;
  } catch (error) {
    console.error('Error getting mission stats:', error);
    return {
      userId: '',
      totalMissionsCompleted: 0,
      totalRewardsEarned: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: '',
    };
  }
}

// ============================================================================
// CLAIM REWARDS
// ============================================================================

/**
 * Claim reward for a completed mission
 */
export async function claimMissionReward(
  missionId: string,
  date?: string
): Promise<{
  success: boolean;
  tokensAwarded: number;
  message: string;
}> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const claimFn = httpsCallable<
      { missionId: string; date?: string },
      { success: boolean; tokensAwarded: number; message: string }
    >(functions, 'claimMissionReward');
    
    const result = await claimFn({ missionId, date });
    return result.data;
  } catch (error: any) {
    console.error('Error claiming mission reward:', error);
    return {
      success: false,
      tokensAwarded: 0,
      message: error.message || 'Failed to claim reward',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get mission icon based on type
 */
export function getMissionIcon(mission: Mission): string {
  return mission.iconKey || '🎯';
}

/**
 * Get mission color based on status
 */
export function getMissionColor(status: Mission['status']): string {
  switch (status) {
    case 'COMPLETED':
      return '#10B981'; // Green
    case 'CLAIMED':
      return '#3B82F6'; // Blue
    case 'IN_PROGRESS':
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * Format mission progress text
 */
export function formatMissionProgress(mission: Mission): string {
  return `${mission.currentCount} / ${mission.targetCount}`;
}

/**
 * Check if there are any claimable missions
 */
export function hasClaimableMissions(missions: Mission[]): boolean {
  return missions.some(m => m.status === 'COMPLETED');
}

/**
 * Count claimable missions
 */
export function countClaimableMissions(missions: Mission[]): number {
  return missions.filter(m => m.status === 'COMPLETED').length;
}

/**
 * Calculate daily progress percentage
 */
export function calculateDailyProgress(missions: Mission[]): number {
  if (missions.length === 0) return 0;
  
  const completed = missions.filter(m => m.status !== 'IN_PROGRESS').length;
  return Math.floor((completed / missions.length) * 100);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getDailyMissions,
  getUserMissionStats,
  claimMissionReward,
  getMissionIcon,
  getMissionColor,
  formatMissionProgress,
  hasClaimableMissions,
  countClaimableMissions,
  calculateDailyProgress,
};