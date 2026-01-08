/**
 * PACK 223: Destiny Weeks - Admin & Configuration
 * 
 * Administrative functions for managing Destiny Weeks system
 */

import { db, serverTimestamp, generateId } from './init.js';
import { 
  rotateWeeklyTheme, 
  getCurrentWeeklyTheme,
  type WeeklyTheme,
  type WeeklyThemeSlug 
} from './pack-223-destiny-weeks.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Create a custom weekly theme (admin only)
 */
export async function createCustomTheme(
  slug: WeeklyThemeSlug,
  config: {
    name: string;
    icon: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    actions: Record<string, number>;
    softMode: boolean;
  }
): Promise<WeeklyTheme> {
  const themeId = generateId();
  
  const theme: WeeklyTheme = {
    themeId,
    slug,
    name: config.name,
    icon: config.icon,
    description: config.description,
    startsAt: config.startsAt as any,
    endsAt: config.endsAt as any,
    actions: config.actions,
    softMode: config.softMode,
    active: false, // Manually activate
    createdAt: serverTimestamp() as any
  };
  
  await db.collection('destiny_weekly_themes').doc(themeId).set(theme);
  
  return theme;
}

/**
 * Manually activate a theme
 */
export async function activateTheme(themeId: string): Promise<void> {
  // Deactivate all current themes
  const currentThemes = await db.collection('destiny_weekly_themes')
    .where('active', '==', true)
    .get();
  
  const batch = db.batch();
  
  for (const doc of currentThemes.docs) {
    batch.update(doc.ref, {
      active: false,
      deactivatedAt: serverTimestamp()
    });
  }
  
  // Activate new theme
  const themeRef = db.collection('destiny_weekly_themes').doc(themeId);
  batch.update(themeRef, {
    active: true,
    activatedAt: serverTimestamp()
  });
  
  await batch.commit();
}

/**
 * Force theme rotation (admin override)
 */
export async function forceThemeRotation(): Promise<void> {
  await rotateWeeklyTheme();
}

/**
 * Get theme statistics
 */
export async function getThemeStats(themeId: string): Promise<{
  totalParticipants: number;
  totalActions: number;
  topScores: Array<{ userId: string; score: number }>;
  actionBreakdown: Record<string, number>;
}> {
  // Get all users participating in this theme
  const statesSnap = await db.collection('destiny_user_states')
    .where('activeThemeId', '==', themeId)
    .get();
  
  const totalParticipants = statesSnap.size;
  let totalActions = 0;
  const actionBreakdown: Record<string, number> = {};
  const scores: Array<{ userId: string; score: number }> = [];
  
  for (const doc of statesSnap.docs) {
    const state = doc.data();
    scores.push({
      userId: state.userId,
      score: state.currentWeekScore || 0
    });
    
    // Count actions
    if (state.actionsThisWeek) {
      for (const [action, count] of Object.entries(state.actionsThisWeek)) {
        totalActions += count as number;
        actionBreakdown[action] = (actionBreakdown[action] || 0) + (count as number);
      }
    }
  }
  
  // Sort and get top 10
  scores.sort((a, b) => b.score - a.score);
  const topScores = scores.slice(0, 10);
  
  return {
    totalParticipants,
    totalActions,
    topScores,
    actionBreakdown
  };
}

// ============================================================================
// MILESTONE & REWARD MANAGEMENT
// ============================================================================

/**
 * Manually grant reward to user (admin compensation)
 */
export async function grantRewardToUser(
  userId: string,
  rewardType: string,
  config: {
    name: string;
    description: string;
    durationHours?: number;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  const rewardId = generateId();
  const currentTheme = await getCurrentWeeklyTheme();
  
  const reward = {
    rewardId,
    type: rewardType,
    name: config.name,
    description: config.description,
    earnedFrom: {
      themeId: currentTheme?.themeId || 'admin_grant',
      weekOf: serverTimestamp(),
      score: 0,
      userId // Add userId to earnedFrom
    },
    activatedAt: serverTimestamp(),
    expiresAt: config.durationHours 
      ? new Date(Date.now() + config.durationHours * 60 * 60 * 1000)
      : null,
    isActive: true,
    metadata: config.metadata || {},
    adminGranted: true
  };
  
  await db.collection('destiny_rewards').doc(rewardId).set(reward);
  
  return rewardId;
}

/**
 * Revoke a reward (admin action)
 */
export async function revokeReward(rewardId: string, reason: string): Promise<void> {
  await db.collection('destiny_rewards').doc(rewardId).update({
    isActive: false,
    revokedAt: serverTimestamp(),
    revokeReason: reason
  });
}

/**
 * Get all active rewards across platform
 */
export async function getAllActiveRewards(limit: number = 100): Promise<Array<{
  rewardId: string;
  userId: string;
  type: string;
  expiresAt: any;
}>> {
  const rewardsSnap = await db.collection('destiny_rewards')
    .where('isActive', '==', true)
    .limit(limit)
    .get();
  
  return rewardsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      rewardId: data.rewardId,
      userId: data.earnedFrom?.userId || 'unknown',
      type: data.type,
      expiresAt: data.expiresAt
    };
  });
}

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Get platform-wide Destiny statistics
 */
export async function getPlatformStats(): Promise<{
  activeParticipants: number;
  totalScoreThisWeek: number;
  averageScore: number;
  topActions: Array<{ action: string; count: number }>;
  breakupRecoveryUsers: number;
}> {
  const statesSnap = await db.collection('destiny_user_states').get();
  
  let activeParticipants = 0;
  let totalScore = 0;
  let breakupRecoveryUsers = 0;
  const actionCounts: Record<string, number> = {};
  
  for (const doc of statesSnap.docs) {
    const state = doc.data();
    
    if (state.activeThemeId) {
      activeParticipants++;
      totalScore += state.currentWeekScore || 0;
    }
    
    if (state.inBreakupRecovery) {
      breakupRecoveryUsers++;
    }
    
    if (state.actionsThisWeek) {
      for (const [action, count] of Object.entries(state.actionsThisWeek)) {
        actionCounts[action] = (actionCounts[action] || 0) + (count as number);
      }
    }
  }
  
  const topActions = Object.entries(actionCounts)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    activeParticipants,
    totalScoreThisWeek: totalScore,
    averageScore: activeParticipants > 0 ? Math.round(totalScore / activeParticipants) : 0,
    topActions,
    breakupRecoveryUsers
  };
}

/**
 * Generate leaderboard for current week
 */
export async function generateLeaderboard(limit: number = 100): Promise<void> {
  const currentTheme = await getCurrentWeeklyTheme();
  if (!currentTheme) return;
  
  // Get top scorers
  const statesSnap = await db.collection('destiny_user_states')
    .where('activeThemeId', '==', currentTheme.themeId)
    .orderBy('currentWeekScore', 'desc')
    .limit(limit)
    .get();
  
  const entries = [];
  let rank = 1;
  
  for (const doc of statesSnap.docs) {
    const state = doc.data();
    
    // Get user display info
    const userDoc = await db.collection('users').doc(state.userId).get();
    const userData = userDoc.data();
    
    entries.push({
      userId: state.userId,
      score: state.currentWeekScore || 0,
      rank: rank++,
      displayName: userData?.displayName || 'Anonymous',
      photoURL: userData?.photoURL || null,
      badges: userData?.badges?.map((b: any) => b.type) || []
    });
  }
  
  const leaderboardId = generateId();
  await db.collection('destiny_leaderboards').doc(leaderboardId).set({
    weekOf: currentTheme.startsAt,
    themeId: currentTheme.themeId,
    entries,
    generatedAt: serverTimestamp(),
    expiresAt: currentTheme.endsAt
  });
}

/**
 * Generate week recap for all users (run at week end)
 */
export async function generateWeekRecaps(): Promise<number> {
  const currentTheme = await getCurrentWeeklyTheme();
  if (!currentTheme) return 0;
  
  const statesSnap = await db.collection('destiny_user_states')
    .where('activeThemeId', '==', currentTheme.themeId)
    .get();
  
  let count = 0;
  const batch = db.batch();
  
  for (const doc of statesSnap.docs) {
    const state = doc.data();
    
    if (state.currentWeekScore > 0) {
      const recapId = generateId();
      const recapRef = db.collection('destiny_week_recaps').doc(recapId);
      
      // Get user's rewards
      const rewardsSnap = await db.collection('destiny_rewards')
        .where('earnedFrom.themeId', '==', currentTheme.themeId)
        .where('earnedFrom.userId', '==', state.userId)
        .get();
      
      batch.set(recapRef, {
        recapId,
        userId: state.userId,
        themeId: currentTheme.themeId,
        weekOf: currentTheme.startsAt,
        finalScore: state.currentWeekScore,
        actions: state.actionsThisWeek || {},
        rewardsEarned: rewardsSnap.docs.map(d => d.data()),
        createdAt: serverTimestamp()
      });
      
      count++;
      
      if (count % 450 === 0) {
        await batch.commit();
      }
    }
  }
  
  if (count % 450 !== 0) {
    await batch.commit();
  }
  
  return count;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Update system configuration
 */
export async function updateDestinyConfig(config: {
  milestoneThresholds?: number[];
  actionMultipliers?: Record<string, number>;
  rewardDurations?: Record<string, number>;
  enabled?: boolean;
}): Promise<void> {
  await db.collection('destiny_config').doc('system').set(config, { merge: true });
}

/**
 * Get current configuration
 */
export async function getDestinyConfig(): Promise<any> {
  const configDoc = await db.collection('destiny_config').doc('system').get();
  return configDoc.data() || {};
}

/**
 * Reset user's Destiny state (admin recovery tool)
 */
export async function resetUserDestinyState(userId: string): Promise<void> {
  const currentTheme = await getCurrentWeeklyTheme();
  
  await db.collection('destiny_user_states').doc(userId).set({
    userId,
    activeThemeId: currentTheme?.themeId || null,
    currentWeekScore: 0,
    lastWeekScore: 0,
    totalWeeksParticipated: 0,
    highestWeekScore: 0,
    actionsThisWeek: {},
    rewards: [],
    breakRecoverySync: false,
    inBreakupRecovery: false,
    weekStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}