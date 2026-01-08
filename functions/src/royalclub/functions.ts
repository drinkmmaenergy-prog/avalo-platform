/**
 * PACK 144 - Royal Club & Loyalty Ecosystem 2.0
 * Core functions for luxury loyalty system
 *
 * SAFETY RULES:
 * - No token price modifications
 * - No 65/35 split modifications
 * - No visibility/ranking advantages
 * - No romantic/NSFW features
 * - No creator earning boosts
 */

import { db, arrayUnion, arrayRemove } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  RoyalClubLevel,
  RoyalClubProgress,
  RoyalClubMission,
  RoyalClubReward,
  RoyalActivityLog,
  RoyalClubSettings,
  ROYAL_CLUB_LEVELS,
  FORBIDDEN_MISSION_PATTERNS
} from './types';

/**
 * Get Royal Club status for a user
 * Returns null if user is not in Royal Club
 */
export async function getRoyalClubStatus(userId: string): Promise<RoyalClubProgress | null> {
  try {
    const progressDoc = await db
      .collection('royalclub_progress')
      .doc(userId)
      .get();

    if (!progressDoc.exists) {
      return null;
    }

    const data = progressDoc.data() as RoyalClubProgress;
    return {
      ...data,
      joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toDate() : data.joinedAt,
      lastActivityAt: data.lastActivityAt instanceof Timestamp ? data.lastActivityAt.toDate() : data.lastActivityAt,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  } catch (error) {
    console.error('Error getting Royal Club status:', error);
    throw new Error('Failed to retrieve Royal Club status');
  }
}

/**
 * Initialize Royal Club membership (auto-enrolled after first 30 days)
 */
export async function initializeRoyalClubMembership(userId: string): Promise<RoyalClubProgress> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const existingProgress = await getRoyalClubStatus(userId);
    if (existingProgress) {
      return existingProgress;
    }

    const now = new Date();
    const initialProgress: RoyalClubProgress = {
      userId,
      currentLevel: RoyalClubLevel.RC1_BRONZE,
      joinedAt: now,
      lastActivityAt: now,
      daysActive: 0,
      activityScore: 0,
      clubParticipation: 0,
      eventAttendance: 0,
      mentorshipSessions: 0,
      digitalProductsPurchased: 0,
      completedMissions: [],
      activeMissions: [],
      lifetimeActivityScore: 0,
      lifetimeClubPosts: 0,
      lifetimeChallengesCompleted: 0,
      createdAt: now,
      updatedAt: now
    };

    await db.collection('royalclub_progress').doc(userId).set(initialProgress);
    return initialProgress;
  } catch (error) {
    console.error('Error initializing Royal Club membership:', error);
    throw new Error('Failed to initialize Royal Club membership');
  }
}

/**
 * Record Royal Club activity (ethical activities only)
 * SAFETY: Validates activity type to prevent romantic/NSFW tracking
 */
export async function recordRoyalActivity(
  userId: string,
  activityType: 'club_post' | 'challenge_join' | 'event_attend' | 'mentorship_session' | 'product_purchase' | 'mission_complete',
  activityData: Record<string, any>
): Promise<void> {
  try {
    // Safety check: validate activity data doesn't contain forbidden patterns
    const activityDataString = JSON.stringify(activityData).toLowerCase();
    for (const pattern of FORBIDDEN_MISSION_PATTERNS) {
      if (activityDataString.includes(pattern)) {
        console.warn(`Blocked activity with forbidden pattern: ${pattern}`);
        return;
      }
    }

    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      await initializeRoyalClubMembership(userId);
      return recordRoyalActivity(userId, activityType, activityData);
    }

    // Calculate activity score based on type
    let activityScore = 0;
    switch (activityType) {
      case 'club_post':
        activityScore = 5;
        progress.clubParticipation += 1;
        progress.lifetimeClubPosts += 1;
        break;
      case 'challenge_join':
        activityScore = 10;
        progress.lifetimeChallengesCompleted += 1;
        break;
      case 'event_attend':
        activityScore = 15;
        progress.eventAttendance += 1;
        break;
      case 'mentorship_session':
        activityScore = 25;
        progress.mentorshipSessions += 1;
        break;
      case 'product_purchase':
        activityScore = 20;
        progress.digitalProductsPurchased += 1;
        break;
      case 'mission_complete':
        activityScore = activityData.bonusScore || 10;
        break;
    }

    // Update progress
    progress.activityScore += activityScore;
    progress.lifetimeActivityScore += activityScore;
    progress.lastActivityAt = new Date();
    progress.updatedAt = new Date();

    // Log activity
    const activityLog: RoyalActivityLog = {
      logId: db.collection('royalclub_activity_logs').doc().id,
      userId,
      activityType,
      activityData,
      activityScore,
      isValidated: true,
      timestamp: new Date()
    };

    // Batch write
    const batch = db.batch();
    batch.update(db.collection('royalclub_progress').doc(userId), {
      activityScore: progress.activityScore,
      lifetimeActivityScore: progress.lifetimeActivityScore,
      clubParticipation: progress.clubParticipation,
      lifetimeClubPosts: progress.lifetimeClubPosts,
      lifetimeChallengesCompleted: progress.lifetimeChallengesCompleted,
      eventAttendance: progress.eventAttendance,
      mentorshipSessions: progress.mentorshipSessions,
      digitalProductsPurchased: progress.digitalProductsPurchased,
      lastActivityAt: progress.lastActivityAt,
      updatedAt: progress.updatedAt
    });
    batch.set(db.collection('royalclub_activity_logs').doc(activityLog.logId), activityLog);
    await batch.commit();

    // Check for level upgrade
    await checkAndUpgradeLevel(userId);
  } catch (error) {
    console.error('Error recording Royal activity:', error);
    throw new Error('Failed to record Royal activity');
  }
}

/**
 * Check if user qualifies for level upgrade
 * SAFETY: No visibility/ranking advantages granted
 */
async function checkAndUpgradeLevel(userId: string): Promise<void> {
  try {
    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      return;
    }

    // Calculate days active
    const daysSinceJoined = Math.floor(
      (new Date().getTime() - progress.joinedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check each level in order
    const levels = [
      RoyalClubLevel.RC5_ROYAL_ELITE,
      RoyalClubLevel.RC4_DIAMOND,
      RoyalClubLevel.RC3_GOLD,
      RoyalClubLevel.RC2_SILVER,
      RoyalClubLevel.RC1_BRONZE
    ];

    for (const level of levels) {
      const config = ROYAL_CLUB_LEVELS[level];
      
      if (
        daysSinceJoined >= config.requirements.minDaysActive &&
        progress.activityScore >= config.requirements.minActivityScore &&
        progress.clubParticipation >= config.requirements.minClubParticipation &&
        progress.eventAttendance >= config.requirements.minEventAttendance &&
        progress.mentorshipSessions >= config.requirements.minMentorshipSessions
      ) {
        if (progress.currentLevel !== level) {
          await upgradeRoyalLevel(userId, level);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error checking level upgrade:', error);
  }
}

/**
 * Upgrade user's Royal Club level
 * SAFETY: Only unlocks lifestyle perks, no performance advantages
 */
export async function upgradeRoyalLevel(userId: string, newLevel: RoyalClubLevel): Promise<void> {
  try {
    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      throw new Error('User not in Royal Club');
    }

    const oldLevel = progress.currentLevel;
    progress.currentLevel = newLevel;
    progress.updatedAt = new Date();

    await db.collection('royalclub_progress').doc(userId).update({
      currentLevel: newLevel,
      updatedAt: progress.updatedAt
    });

    // Send notification (if enabled in settings)
    const settings = await getRoyalClubSettings(userId);
    if (settings?.notifyLevelUp) {
      await db.collection('notifications').add({
        userId,
        type: 'royal_club_level_up',
        title: 'Royal Club Level Up!',
        message: `Congratulations! You've reached ${ROYAL_CLUB_LEVELS[newLevel].title} level.`,
        data: { oldLevel, newLevel },
        createdAt: new Date(),
        read: false
      });
    }
  } catch (error) {
    console.error('Error upgrading Royal level:', error);
    throw new Error('Failed to upgrade Royal level');
  }
}

/**
 * Complete a Royal Club mission
 * SAFETY: Validates mission doesn't violate ethical constraints
 */
export async function completeRoyalMission(userId: string, missionId: string): Promise<void> {
  try {
    const missionDoc = await db.collection('royalclub_missions').doc(missionId).get();
    if (!missionDoc.exists) {
      throw new Error('Mission not found');
    }

    const mission = missionDoc.data() as RoyalClubMission;

    // Safety check: validate mission against forbidden patterns
    const missionText = `${mission.title} ${mission.description}`.toLowerCase();
    for (const pattern of FORBIDDEN_MISSION_PATTERNS) {
      if (missionText.includes(pattern)) {
        console.error(`Mission contains forbidden pattern: ${pattern}`);
        throw new Error('Mission violates Royal Club ethical guidelines');
      }
    }

    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      throw new Error('User not in Royal Club');
    }

    // Check if already completed
    if (progress.completedMissions.includes(missionId)) {
      throw new Error('Mission already completed');
    }

    // Award rewards (lifestyle perks only, no tokens)
    await recordRoyalActivity(userId, 'mission_complete', {
      missionId,
      bonusScore: mission.rewards.activityScoreBonus
    });

    // Update completed missions
    await db.collection('royalclub_progress').doc(userId).update({
      completedMissions: arrayUnion(missionId),
      activeMissions: arrayRemove(missionId)
    });

    // Send notification
    const settings = await getRoyalClubSettings(userId);
    if (settings?.notifyMissionUpdates) {
      await db.collection('notifications').add({
        userId,
        type: 'royal_club_mission_complete',
        title: 'Mission Complete!',
        message: `You've completed: ${mission.title}`,
        data: { missionId },
        createdAt: new Date(),
        read: false
      });
    }
  } catch (error) {
    console.error('Error completing Royal mission:', error);
    throw new Error('Failed to complete Royal mission');
  }
}

/**
 * Assign a reward to user
 * SAFETY: Only lifestyle/UI perks, no monetary value
 */
export async function assignRoyalReward(userId: string, rewardId: string): Promise<void> {
  try {
    const rewardDoc = await db.collection('royalclub_rewards').doc(rewardId).get();
    if (!rewardDoc.exists) {
      throw new Error('Reward not found');
    }

    const reward = rewardDoc.data() as RoyalClubReward;
    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      throw new Error('User not in Royal Club');
    }

    // Check level requirement
    const userLevelOrder = Object.keys(ROYAL_CLUB_LEVELS).indexOf(progress.currentLevel);
    const requiredLevelOrder = Object.keys(ROYAL_CLUB_LEVELS).indexOf(reward.minLevel);

    if (userLevelOrder < requiredLevelOrder) {
      throw new Error('User level too low for this reward');
    }

    // Grant reward
    const userRewardRef = db.collection('royalclub_user_rewards').doc();
    await userRewardRef.set({
      userId,
      rewardId,
      rewardType: reward.type,
      grantedAt: new Date()
    });

    // Send notification
    const settings = await getRoyalClubSettings(userId);
    if (settings?.notifyNewPerks) {
      await db.collection('notifications').add({
        userId,
        type: 'royal_club_reward_unlocked',
        title: 'New Perk Unlocked!',
        message: `You've unlocked: ${reward.name}`,
        data: { rewardId },
        createdAt: new Date(),
        read: false
      });
    }
  } catch (error) {
    console.error('Error assigning Royal reward:', error);
    throw new Error('Failed to assign Royal reward');
  }
}

/**
 * Get user's Royal Club settings
 */
export async function getRoyalClubSettings(userId: string): Promise<RoyalClubSettings | null> {
  try {
    const settingsDoc = await db.collection('royalclub_settings').doc(userId).get();
    if (!settingsDoc.exists) {
      return null;
    }

    const data = settingsDoc.data() as RoyalClubSettings;
    return {
      ...data,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  } catch (error) {
    console.error('Error getting Royal Club settings:', error);
    return null;
  }
}

/**
 * Update Royal Club settings
 */
export async function updateRoyalClubSettings(
  userId: string,
  settings: Partial<RoyalClubSettings>
): Promise<void> {
  try {
    const existingSettings = await getRoyalClubSettings(userId);
    
    const updatedSettings: RoyalClubSettings = {
      userId,
      showBadgeInProfile: settings.showBadgeInProfile ?? existingSettings?.showBadgeInProfile ?? false,
      showLevelInChats: settings.showLevelInChats ?? existingSettings?.showLevelInChats ?? false,
      notifyMissionUpdates: settings.notifyMissionUpdates ?? existingSettings?.notifyMissionUpdates ?? true,
      notifyLevelUp: settings.notifyLevelUp ?? existingSettings?.notifyLevelUp ?? true,
      notifyNewPerks: settings.notifyNewPerks ?? existingSettings?.notifyNewPerks ?? true,
      activeUiSkin: settings.activeUiSkin ?? existingSettings?.activeUiSkin,
      activeProfileTheme: settings.activeProfileTheme ?? existingSettings?.activeProfileTheme,
      updatedAt: new Date()
    };

    await db.collection('royalclub_settings').doc(userId).set(updatedSettings, { merge: true });
  } catch (error) {
    console.error('Error updating Royal Club settings:', error);
    throw new Error('Failed to update Royal Club settings');
  }
}

/**
 * Get active missions for user
 */
export async function getActiveMissions(userId: string): Promise<RoyalClubMission[]> {
  try {
    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      return [];
    }

    const missionsSnapshot = await db
      .collection('royalclub_missions')
      .where('isActive', '==', true)
      .get();

    const missions: RoyalClubMission[] = [];
    
    for (const doc of missionsSnapshot.docs) {
      const mission = doc.data() as RoyalClubMission;
      
      // Safety check
      const missionText = `${mission.title} ${mission.description}`.toLowerCase();
      let isSafe = true;
      for (const pattern of FORBIDDEN_MISSION_PATTERNS) {
        if (missionText.includes(pattern)) {
          isSafe = false;
          break;
        }
      }
      
      if (isSafe && !progress.completedMissions.includes(mission.missionId)) {
        missions.push({
          ...mission,
          createdAt: mission.createdAt instanceof Timestamp ? mission.createdAt.toDate() : mission.createdAt,
          updatedAt: mission.updatedAt instanceof Timestamp ? mission.updatedAt.toDate() : mission.updatedAt,
          expiresAt: mission.expiresAt instanceof Timestamp ? mission.expiresAt.toDate() : mission.expiresAt
        });
      }
    }

    return missions;
  } catch (error) {
    console.error('Error getting active missions:', error);
    return [];
  }
}

/**
 * Get available rewards for user's level
 */
export async function getAvailableRewards(userId: string): Promise<RoyalClubReward[]> {
  try {
    const progress = await getRoyalClubStatus(userId);
    if (!progress) {
      return [];
    }

    const userLevelOrder = Object.keys(ROYAL_CLUB_LEVELS).indexOf(progress.currentLevel);

    const rewardsSnapshot = await db
      .collection('royalclub_rewards')
      .where('isActive', '==', true)
      .get();

    const rewards: RoyalClubReward[] = [];
    
    for (const doc of rewardsSnapshot.docs) {
      const reward = doc.data() as RoyalClubReward;
      const requiredLevelOrder = Object.keys(ROYAL_CLUB_LEVELS).indexOf(reward.minLevel);
      
      if (userLevelOrder >= requiredLevelOrder) {
        rewards.push({
          ...reward,
          createdAt: reward.createdAt instanceof Timestamp ? reward.createdAt.toDate() : reward.createdAt,
          updatedAt: reward.updatedAt instanceof Timestamp ? reward.updatedAt.toDate() : reward.updatedAt
        });
      }
    }

    return rewards;
  } catch (error) {
    console.error('Error getting available rewards:', error);
    return [];
  }
}