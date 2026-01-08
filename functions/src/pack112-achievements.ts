/**
 * PACK 112 — Awards, Gamification & Achievements Engine
 * Backend Implementation
 * 
 * Core functionality:
 * - Achievement unlock logic
 * - Progress tracking
 * - XP/Level system (cosmetic only)
 * - Real-time and scheduled updates
 * 
 * NON-NEGOTIABLE RULES:
 * - NO token rewards of any kind
 * - NO boost to visibility or ranking from achievements
 * - NO monetization multipliers or earnings accelerators
 * - Token price and 65/35 split remain untouched
 * - Achievements & badges are cosmetic/status only
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, arrayUnion } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AchievementDefinition,
  UserAchievements,
  AchievementEvent,
  AchievementEventType,
  AchievementCelebration,
  GetUserAchievementsResponse,
  SelectBadgesRequest,
  SAFE_ACHIEVEMENTS,
  LEVEL_PROGRESSION,
  XP_EARNING_CONFIG,
} from './pack112-types';
import { createNotification } from './notificationHub';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate level from XP
 */
function calculateLevel(xp: number): { level: number; levelName: string; nextLevelXp: number; progress: number } {
  let currentLevel = 1;
  let levelName = 'Newcomer';
  let nextLevelXp = 100;
  
  for (let i = LEVEL_PROGRESSION.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_PROGRESSION[i].xpRequired) {
      currentLevel = LEVEL_PROGRESSION[i].level;
      levelName = LEVEL_PROGRESSION[i].name;
      
      // Calculate next level XP
      if (i < LEVEL_PROGRESSION.length - 1) {
        nextLevelXp = LEVEL_PROGRESSION[i + 1].xpRequired;
      } else {
        nextLevelXp = xp; // Max level
      }
      break;
    }
  }
  
  // Calculate progress percentage
  const currentLevelXp = LEVEL_PROGRESSION[currentLevel - 1].xpRequired;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  const xpEarned = xp - currentLevelXp;
  const progress = xpForNextLevel > 0 ? Math.min(100, (xpEarned / xpForNextLevel) * 100) : 100;
  
  return { level: currentLevel, levelName, nextLevelXp, progress };
}

/**
 * Initialize user achievements document
 */
async function initializeUserAchievements(userId: string): Promise<UserAchievements> {
  const now = Timestamp.now();
  const userAchievements: UserAchievements = {
    userId,
    achievedIds: [],
    progress: {},
    streaks: {},
    selectedBadges: [],
    xp: 0,
    level: 1,
    lastActivityDate: now,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('user_achievements').doc(userId).set(userAchievements);
  
  return userAchievements;
}

/**
 * Get or initialize user achievements
 */
async function getUserAchievementsData(userId: string): Promise<UserAchievements> {
  const doc = await db.collection('user_achievements').doc(userId).get();
  
  if (!doc.exists) {
    return await initializeUserAchievements(userId);
  }
  
  return doc.data() as UserAchievements;
}

/**
 * Check if achievement should be unlocked
 */
function checkAchievementUnlock(
  achievement: AchievementDefinition,
  currentProgress: number,
  currentStreak: number
): boolean {
  if (!achievement.enabled) {
    return false;
  }
  
  switch (achievement.milestoneType) {
    case 'ONCE':
      return (achievement.threshold || 1) <= currentProgress;
    
    case 'PROGRESSIVE':
      return (achievement.threshold || 0) <= currentProgress;
    
    case 'STREAK':
      return (achievement.threshold || 0) <= currentStreak;
    
    default:
      return false;
  }
}

/**
 * Award XP to user (cosmetic only)
 */
async function awardXP(
  userId: string,
  xpAmount: number,
  reason: string
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
  const userRef = db.collection('user_achievements').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    await initializeUserAchievements(userId);
  }
  
  const userData = userDoc.data() as UserAchievements;
  const oldXp = userData.xp || 0;
  const newXp = oldXp + xpAmount;
  
  const oldLevelInfo = calculateLevel(oldXp);
  const newLevelInfo = calculateLevel(newXp);
  
  const leveledUp = newLevelInfo.level > oldLevelInfo.level;
  
  await userRef.update({
    xp: newXp,
    level: newLevelInfo.level,
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Awarded ${xpAmount} XP to ${userId} for ${reason}`, {
    oldXp,
    newXp,
    oldLevel: oldLevelInfo.level,
    newLevel: newLevelInfo.level,
    leveledUp,
  });
  
  return {
    newXp,
    newLevel: newLevelInfo.level,
    leveledUp,
  };
}

/**
 * Unlock achievement for user
 */
async function unlockAchievement(
  userId: string,
  achievement: AchievementDefinition
): Promise<AchievementCelebration> {
  const userRef = db.collection('user_achievements').doc(userId);
  
  // Update user achievements
  await userRef.update({
    achievedIds: arrayUnion(achievement.id),
    updatedAt: serverTimestamp(),
  });
  
  // Award XP
  const xpEarned = XP_EARNING_CONFIG.MILESTONE_ACHIEVED;
  const { newLevel, leveledUp, newXp } = await awardXP(
    userId,
    xpEarned,
    `Achievement unlocked: ${achievement.title}`
  );
  
  // Create notification
  try {
    await createNotification({
      userId,
      type: 'STREAK', // Using existing notification type for now
      title: 'Achievement Unlocked! 🎉',
      body: `You've earned "${achievement.title}"`,
      context: {},
    });
  } catch (notificationError) {
    // Log but don't fail achievement unlock if notification fails
    logger.warn(`Failed to create achievement notification for ${userId}`, notificationError);
  }
  
  logger.info(`Achievement unlocked for ${userId}: ${achievement.id}`, {
    achievementTitle: achievement.title,
    tier: achievement.tier,
    xpEarned,
    leveledUp,
  });
  
  // Return celebration data
  const celebration: AchievementCelebration = {
    achievement,
    xpEarned,
  };
  
  if (leveledUp) {
    const levelInfo = calculateLevel(newXp);
    celebration.newLevel = newLevel;
    celebration.levelName = levelInfo.levelName;
  }
  
  return celebration;
}

// ============================================================================
// REAL-TIME ACHIEVEMENT UPDATE
// ============================================================================

/**
 * Update achievements based on real-time event
 */
export async function updateAchievementsRealtime(
  event: AchievementEvent
): Promise<{ unlockedAchievements: AchievementCelebration[] }> {
  const { userId, type, metadata } = event;
  
  try {
    // Get user achievements
    const userData = await getUserAchievementsData(userId);
    
    // Get achievement catalog
    const catalogSnapshot = await db
      .collection('achievements_catalog')
      .where('enabled', '==', true)
      .get();
    
    const achievements = catalogSnapshot.docs.map(doc => doc.data() as AchievementDefinition);
    
    const unlockedAchievements: AchievementCelebration[] = [];
    const updates: Partial<UserAchievements> = {
      updatedAt: Timestamp.now(),
    };
    
    // Process event based on type
    switch (type) {
      case 'PROFILE_UPDATED':
        // Check profile completion
        const profileCompleteness = metadata?.completeness || 0;
        updates.progress = {
          ...userData.progress,
          profile_complete_100: profileCompleteness,
        };
        
        // Check achievements
        for (const achievement of achievements) {
          if (
            achievement.id === 'profile_complete_100' &&
            !userData.achievedIds.includes(achievement.id) &&
            checkAchievementUnlock(achievement, profileCompleteness, 0)
          ) {
            const celebration = await unlockAchievement(userId, achievement);
            unlockedAchievements.push(celebration);
          }
        }
        break;
      
      case 'LOGIN':
        // Update streak
        const lastActivity = userData.lastActivityDate;
        const now = Timestamp.now();
        const lastActivityDate = lastActivity ? new Date(lastActivity.toMillis()) : null;
        const nowDate = new Date(now.toMillis());
        
        let currentStreak = userData.streaks?.login_streak || 0;
        
        if (lastActivityDate) {
          const daysDiff = Math.floor((nowDate.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 1) {
            // Consecutive day
            currentStreak++;
          } else if (daysDiff > 1) {
            // Streak broken
            currentStreak = 1;
          }
          // Same day: no change
        } else {
          currentStreak = 1;
        }
        
        updates.streaks = {
          ...userData.streaks,
          login_streak: currentStreak,
        };
        updates.lastActivityDate = now;
        
        // Award daily login XP
        await awardXP(userId, XP_EARNING_CONFIG.DAILY_LOGIN, 'Daily login');
        
        // Check streak achievements
        for (const achievement of achievements) {
          if (
            achievement.category === 'ACTIVITY' &&
            achievement.milestoneType === 'STREAK' &&
            !userData.achievedIds.includes(achievement.id) &&
            checkAchievementUnlock(achievement, 0, currentStreak)
          ) {
            const celebration = await unlockAchievement(userId, achievement);
            unlockedAchievements.push(celebration);
          }
        }
        break;
      
      case 'STORY_PUBLISHED':
        // Increment story count
        const storyCount = (userData.progress?.stories_published || 0) + 1;
        updates.progress = {
          ...userData.progress,
          stories_published: storyCount,
        };
        
        // Check story achievements
        for (const achievement of achievements) {
          if (
            achievement.category === 'CONTENT' &&
            !userData.achievedIds.includes(achievement.id) &&
            checkAchievementUnlock(achievement, storyCount, 0)
          ) {
            const celebration = await unlockAchievement(userId, achievement);
            unlockedAchievements.push(celebration);
          }
        }
        break;
      
      case 'HELPFUL_REPORT':
        // Increment helpful report count
        const reportCount = (userData.progress?.helpful_reports || 0) + 1;
        updates.progress = {
          ...userData.progress,
          helpful_reports: reportCount,
        };
        
        // Check community achievements
        for (const achievement of achievements) {
          if (
            achievement.category === 'COMMUNITY' &&
            !userData.achievedIds.includes(achievement.id) &&
            checkAchievementUnlock(achievement, reportCount, 0)
          ) {
            const celebration = await unlockAchievement(userId, achievement);
            unlockedAchievements.push(celebration);
          }
        }
        break;
      
      case 'SAFETY_ACTION':
        // Increment safety action count
        const safetyCount = (userData.progress?.safety_actions || 0) + 1;
        updates.progress = {
          ...userData.progress,
          safety_actions: safetyCount,
        };
        
        // Check safety achievements
        for (const achievement of achievements) {
          if (
            achievement.category === 'SAFETY' &&
            !userData.achievedIds.includes(achievement.id) &&
            checkAchievementUnlock(achievement, safetyCount, 0)
          ) {
            const celebration = await unlockAchievement(userId, achievement);
            unlockedAchievements.push(celebration);
          }
        }
        break;
    }
    
    // Update user achievements if there are changes
    if (Object.keys(updates).length > 1) { // More than just updatedAt
      await db.collection('user_achievements').doc(userId).update(updates);
    }
    
    return { unlockedAchievements };
  } catch (error: any) {
    logger.error(`Error updating achievements for ${userId}`, error);
    throw error;
  }
}

// ============================================================================
// DAILY ACHIEVEMENT RECALCULATION
// ============================================================================

/**
 * Recalculate all achievements for a user
 * Can be triggered manually or by scheduled job
 */
export async function recalculateUserAchievementsDaily(
  userId: string
): Promise<{ processedAchievements: number }> {
  try {
    logger.info(`Starting daily achievement recalculation for ${userId}`);
    
    // This would be expanded to recalc from various sources
    // For now, just ensure user has achievements document
    await getUserAchievementsData(userId);
    
    logger.info(`Completed daily achievement recalculation for ${userId}`);
    
    return { processedAchievements: 0 };
  } catch (error: any) {
    logger.error(`Error recalculating achievements for ${userId}`, error);
    throw error;
  }
}

/**
 * Scheduled job: Daily achievement recalculation for active users
 * Runs daily at 4 AM UTC
 */
export const dailyAchievementRecalculation = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('Starting daily achievement recalculation job');
      
      // Get active users (those who logged in in last 30 days)
      const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const activeUsersSnapshot = await db
        .collection('user_achievements')
        .where('lastActivityDate', '>=', thirtyDaysAgo)
        .limit(1000)
        .get();
      
      let processedCount = 0;
      
      for (const doc of activeUsersSnapshot.docs) {
        const userId = doc.id;
        try {
          await recalculateUserAchievementsDaily(userId);
          processedCount++;
        } catch (error) {
          logger.error(`Failed to recalculate achievements for ${userId}`, error);
        }
      }
      
      logger.info(`Daily achievement recalculation complete: ${processedCount} users processed`);
      
      return null;
    } catch (error: any) {
      logger.error('Error in daily achievement recalculation job', error);
      throw error;
    }
  }
);

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get user's achievements and progress
 */
export const getUserAchievements = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetUserAchievementsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.data.userId || request.auth.uid;
    
    // Users can only view their own achievements
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s achievements');
    }
    
    try {
      // Get user achievements
      const userData = await getUserAchievementsData(userId);
      
      // Get achievement catalog
      const catalogSnapshot = await db
        .collection('achievements_catalog')
        .where('enabled', '==', true)
        .orderBy('sortOrder', 'asc')
        .get();
      
      const catalog = catalogSnapshot.docs.map(doc => doc.data() as AchievementDefinition);
      
      // Calculate XP info
      const xpInfo = calculateLevel(userData.xp || 0);
      
      return {
        achievements: userData,
        catalog,
        xpInfo: {
          currentXp: userData.xp || 0,
          currentLevel: userData.level || 1,
          levelName: xpInfo.levelName,
          nextLevelXp: xpInfo.nextLevelXp,
          progress: xpInfo.progress,
        },
      };
    } catch (error: any) {
      logger.error('Error getting user achievements', error);
      throw new HttpsError('internal', 'Failed to get achievements');
    }
  }
);

/**
 * Select badges to display on profile
 */
export const selectProfileBadges = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as SelectBadgesRequest;
    
    // Validate badge selection
    if (!data.badgeIds || !Array.isArray(data.badgeIds)) {
      throw new HttpsError('invalid-argument', 'badgeIds must be an array');
    }
    
    if (data.badgeIds.length > 3) {
      throw new HttpsError('invalid-argument', 'Cannot select more than 3 badges');
    }
    
    try {
      // Get user achievements
      const userData = await getUserAchievementsData(userId);
      
      // Verify all selected badges are unlocked
      for (const badgeId of data.badgeIds) {
        if (!userData.achievedIds.includes(badgeId)) {
          throw new HttpsError(
            'failed-precondition',
            `Badge ${badgeId} has not been unlocked`
          );
        }
      }
      
      // Update selected badges
      await db.collection('user_achievements').doc(userId).update({
        selectedBadges: data.badgeIds,
        updatedAt: serverTimestamp(),
      });
      
      // Update profile settings
      await db.collection('users').doc(userId).update({
        'achievementSettings.selectedBadges': data.badgeIds,
        'achievementSettings.showAchievements': true,
        updatedAt: serverTimestamp(),
      });
      
      logger.info(`User ${userId} selected badges`, { badgeIds: data.badgeIds });
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error selecting profile badges', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to select badges');
    }
  }
);

/**
 * Initialize achievements catalog (admin only, run once)
 */
export const initializeAchievementsCatalog = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; count: number }> => {
    // TODO: Add admin authentication check
    
    try {
      logger.info('Initializing achievements catalog');
      
      const batch = db.batch();
      const now = Timestamp.now();
      
      for (const achievement of SAFE_ACHIEVEMENTS) {
        const achievementData: AchievementDefinition = {
          ...achievement,
          createdAt: now,
          updatedAt: now,
        };
        
        const docRef = db.collection('achievements_catalog').doc(achievement.id);
        batch.set(docRef, achievementData);
      }
      
      await batch.commit();
      
      logger.info(`Initialized ${SAFE_ACHIEVEMENTS.length} achievements`);
      
      return {
        success: true,
        count: SAFE_ACHIEVEMENTS.length,
      };
    } catch (error: any) {
      logger.error('Error initializing achievements catalog', error);
      throw new HttpsError('internal', 'Failed to initialize catalog');
    }
  }
);