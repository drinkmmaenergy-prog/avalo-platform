/**
 * ============================================================================
 * PACK 263 — CREATOR MISSIONS (DAILY + WEEKLY QUESTS)
 * ============================================================================
 * 
 * Gamified mission system that rewards creators for:
 * - Chat engagement
 * - Live streaming
 * - PPV sales
 * - Event hosting
 * - Fan Club growth
 * 
 * Features:
 * - Daily missions (reset at 00:00 local time)
 * - Weekly missions (reset Sunday 23:59 local time)
 * - Seasonal missions (30-day campaigns - scaffolded)
 * - Level-based mission slots (Bronze → Diamond)
 * - Streak bonuses
 * - Auto-tracking with revenue-linked validation
 * - Celebration animations and notifications
 * 
 * CRITICAL: LP rewards only, NEVER alters 65/35 split or token pricing
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, FieldValue } from './init';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type MissionType = 'daily' | 'weekly' | 'seasonal';
export type MissionStatus = 'active' | 'completed' | 'expired' | 'claimed';
export type CreatorLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface MissionTemplate {
  id: string;
  missionType: MissionType;
  title: string;
  description: string;
  objective: {
    type: 'reply_messages' | 'host_live' | 'post_story' | 'start_paid_chat' | 
          'reactivate_supporter' | 'earn_tokens' | 'fan_club_subs' | 
          'sell_event_tickets' | 'sell_ppv_tickets' | 'chat_reply_speed';
    target: number;
    unit: string;
  };
  reward: {
    lp: number;
  };
  requiredLevel?: CreatorLevel;
  priority: number;
  isActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface ActiveMission {
  missionId: string;
  creatorId: string;
  templateId: string;
  missionType: MissionType;
  title: string;
  description: string;
  objective: MissionTemplate['objective'];
  reward: MissionTemplate['reward'];
  progress: {
    current: number;
    target: number;
    percentage: number;
  };
  status: MissionStatus;
  assignedAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  claimedAt?: FirebaseFirestore.Timestamp;
}

export interface CreatorMissionProfile {
  creatorId: string;
  level: CreatorLevel;
  slots: {
    daily: number;
    weekly: number;
    seasonal: number;
  };
  activeMissions: {
    daily: number;
    weekly: number;
    seasonal: number;
  };
  totalCompleted: {
    daily: number;
    weekly: number;
    seasonal: number;
  };
  streaks: {
    dailyStreak: number;
    weeklyStreak: number;
    lastDailyCompletion?: FirebaseFirestore.Timestamp;
    lastWeeklyCompletion?: FirebaseFirestore.Timestamp;
    bestDailyStreak: number;
    bestWeeklyStreak: number;
  };
  totalLPEarned: number;
  lastUpdated: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface MissionProgress {
  missionId: string;
  creatorId: string;
  activityType: string;
  progressAdded: number;
  newTotal: number;
  timestamp: FirebaseFirestore.Timestamp;
  metadata?: any;
  validatedRevenue: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Mission slots based on creator level
const MISSION_SLOTS: Record<CreatorLevel, { daily: number; weekly: number; seasonal: number }> = {
  bronze: { daily: 2, weekly: 0, seasonal: 0 },
  silver: { daily: 3, weekly: 1, seasonal: 0 },
  gold: { daily: 4, weekly: 2, seasonal: 1 },
  platinum: { daily: 5, weekly: 3, seasonal: 1 },
  diamond: { daily: 5, weekly: 4, seasonal: 1 },
};

// Mission templates (can be moved to Firestore for admin management)
const DEFAULT_MISSION_TEMPLATES: Partial<MissionTemplate>[] = [
  // DAILY MISSIONS
  {
    missionType: 'daily',
    title: 'Reply to 20 paid messages',
    description: 'Respond to 20 messages from paying supporters today',
    objective: { type: 'reply_messages', target: 20, unit: 'messages' },
    reward: { lp: 150 },
    priority: 1,
    isActive: true,
  },
  {
    missionType: 'daily',
    title: 'Host a 10-minute Live',
    description: 'Stream live for at least 10 minutes with viewers',
    objective: { type: 'host_live', target: 10, unit: 'minutes' },
    reward: { lp: 250 },
    priority: 2,
    isActive: true,
  },
  {
    missionType: 'daily',
    title: 'Post 1 new story',
    description: 'Share a new story to keep your audience engaged',
    objective: { type: 'post_story', target: 1, unit: 'stories' },
    reward: { lp: 75 },
    priority: 3,
    isActive: true,
  },
  {
    missionType: 'daily',
    title: 'Start 1 paid chat from Discover',
    description: 'Initiate a conversation that becomes a paid chat',
    objective: { type: 'start_paid_chat', target: 1, unit: 'chats' },
    reward: { lp: 200 },
    priority: 4,
    isActive: true,
  },
  {
    missionType: 'daily',
    title: 'Reactivate 1 dormant supporter',
    description: 'Get a response from a supporter who hasn\'t chatted in 7+ days',
    objective: { type: 'reactivate_supporter', target: 1, unit: 'supporters' },
    reward: { lp: 300 },
    priority: 5,
    isActive: true,
  },
  
  // WEEKLY MISSIONS
  {
    missionType: 'weekly',
    title: 'Earn 5,000 tokens',
    description: 'Accumulate 5,000 tokens in earnings this week',
    objective: { type: 'earn_tokens', target: 5000, unit: 'tokens' },
    reward: { lp: 1500 },
    requiredLevel: 'silver',
    priority: 1,
    isActive: true,
  },
  {
    missionType: 'weekly',
    title: 'Get 3 Fan Club subscriptions',
    description: 'Convert 3 new supporters to Fan Club members',
    objective: { type: 'fan_club_subs', target: 3, unit: 'subscriptions' },
    reward: { lp: 2500 },
    requiredLevel: 'silver',
    priority: 2,
    isActive: true,
  },
  {
    missionType: 'weekly',
    title: 'Sell 5 Event tickets',
    description: 'Sell at least 5 tickets to your upcoming events',
    objective: { type: 'sell_event_tickets', target: 5, unit: 'tickets' },
    reward: { lp: 3000 },
    requiredLevel: 'silver',
    priority: 3,
    isActive: true,
  },
  {
    missionType: 'weekly',
    title: 'Sell 10 PPV Live tickets',
    description: 'Sell 10 pay-per-view tickets for your premium Lives',
    objective: { type: 'sell_ppv_tickets', target: 10, unit: 'tickets' },
    reward: { lp: 2500 },
    requiredLevel: 'silver',
    priority: 4,
    isActive: true,
  },
  {
    missionType: 'weekly',
    title: 'Top 5% chat reply speed',
    description: 'Maintain an average reply time in the top 5% of creators',
    objective: { type: 'chat_reply_speed', target: 5, unit: 'percentile' },
    reward: { lp: 1500 },
    requiredLevel: 'gold',
    priority: 5,
    isActive: true,
  },
];

// Revenue validation thresholds
const VALIDATION_RULES = {
  minLiveViewers: 2,
  minEventCheckins: 5,
  maxTokensPerUserPerHour: 1000,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize creator mission profile
 */
export const initializeCreatorMissions = onCall(
  async (request): Promise<{ success: boolean; data?: CreatorMissionProfile; error?: string }> => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Check if already initialized
      const existingDoc = await db.collection('creatorMissions').doc(userId).get();
      if (existingDoc.exists) {
        return { success: true, data: existingDoc.data() as CreatorMissionProfile };
      }

      // Get creator level from PACK 262
      const levelDoc = await db.collection('creatorLevels').doc(userId).get();
      const level = (levelDoc.data()?.level as CreatorLevel) || 'bronze';

      const profile: CreatorMissionProfile = {
        creatorId: userId,
        level,
        slots: MISSION_SLOTS[level],
        activeMissions: { daily: 0, weekly: 0, seasonal: 0 },
        totalCompleted: { daily: 0, weekly: 0, seasonal: 0 },
        streaks: {
          dailyStreak: 0,
          weeklyStreak: 0,
          bestDailyStreak: 0,
          bestWeeklyStreak: 0,
        },
        totalLPEarned: 0,
        lastUpdated: serverTimestamp() as FirebaseFirestore.Timestamp,
        createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      };

      await db.collection('creatorMissions').doc(userId).set(profile);

      // Assign initial daily missions
      await assignDailyMissions(userId, level);

      return { success: true, data: profile };
    } catch (error: any) {
      console.error('Error initializing creator missions:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Get creator mission profile and active missions
 */
export const getCreatorMissions = onCall(
  async (request): Promise<{ 
    success: boolean; 
    profile?: CreatorMissionProfile;
    activeMissions?: ActiveMission[];
    error?: string;
  }> => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get profile
      let profileDoc = await db.collection('creatorMissions').doc(userId).get();
      if (!profileDoc.exists) {
        // Auto-initialize if not exists
        const levelDoc = await db.collection('creatorLevels').doc(userId).get();
        const level = (levelDoc.data()?.level as CreatorLevel) || 'bronze';

        const profile: CreatorMissionProfile = {
          creatorId: userId,
          level,
          slots: MISSION_SLOTS[level],
          activeMissions: { daily: 0, weekly: 0, seasonal: 0 },
          totalCompleted: { daily: 0, weekly: 0, seasonal: 0 },
          streaks: {
            dailyStreak: 0,
            weeklyStreak: 0,
            bestDailyStreak: 0,
            bestWeeklyStreak: 0,
          },
          totalLPEarned: 0,
          lastUpdated: serverTimestamp() as FirebaseFirestore.Timestamp,
          createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
        };

        await db.collection('creatorMissions').doc(userId).set(profile);
        await assignDailyMissions(userId, level);
        
        profileDoc = await db.collection('creatorMissions').doc(userId).get();
      }

      const profile = profileDoc.data() as CreatorMissionProfile;

      // Get active missions
      const activeMissionsSnapshot = await db
        .collection('creatorMissions')
        .doc(userId)
        .collection('activeMissions')
        .where('status', '==', 'active')
        .orderBy('assignedAt', 'desc')
        .get();

      const activeMissions = activeMissionsSnapshot.docs.map(doc => ({
        missionId: doc.id,
        ...doc.data(),
      })) as ActiveMission[];

      return { success: true, profile, activeMissions };
    } catch (error: any) {
      console.error('Error getting creator missions:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Record mission progress from various activities
 */
export const recordMissionProgress = onCall(
  async (request): Promise<{ 
    success: boolean; 
    completedMissions?: string[];
    lpAwarded?: number;
    error?: string;
  }> => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { activityType, value, metadata } = request.data;

      if (!activityType || value === undefined) {
        throw new HttpsError('invalid-argument', 'Activity type and value required');
      }

      // Validate revenue-linked activity
      const isValid = await validateActivity(userId, activityType, value, metadata);
      if (!isValid) {
        console.warn(`Invalid activity detected for ${userId}: ${activityType}`);
        return { success: false, error: 'Activity validation failed' };
      }

      // Get active missions matching this activity type
      const activeMissionsSnapshot = await db
        .collection('creatorMissions')
        .doc(userId)
        .collection('activeMissions')
        .where('status', '==', 'active')
        .where('objective.type', '==', activityType)
        .get();

      const completedMissions: string[] = [];
      let totalLPAwarded = 0;

      // Update progress for each matching mission
      for (const missionDoc of activeMissionsSnapshot.docs) {
        const mission = missionDoc.data() as ActiveMission;
        const newProgress = Math.min(
          mission.progress.current + value,
          mission.objective.target
        );
        const newPercentage = Math.floor((newProgress / mission.objective.target) * 100);

        // Update mission progress
        await missionDoc.ref.update({
          'progress.current': newProgress,
          'progress.percentage': newPercentage,
        });

        // Log progress activity
        await db
          .collection('missionActivityLog')
          .doc(userId)
          .collection('activities')
          .add({
            missionId: missionDoc.id,
            activityType,
            progressAdded: value,
            newTotal: newProgress,
            timestamp: serverTimestamp(),
            metadata,
            validatedRevenue: true,
          } as MissionProgress);

        // Check if mission completed
        if (newProgress >= mission.objective.target && mission.status === 'active') {
          await completeMission(userId, missionDoc.id, mission);
          completedMissions.push(missionDoc.id);
          totalLPAwarded += mission.reward.lp;

          // Send completion notification
          await sendMissionNotification(userId, 'completed', mission);

          // Check if near completion for other missions (80%, 90%, 95%)
          await checkNearCompletionNotifications(userId);
        }
      }

      return { 
        success: true, 
        completedMissions,
        lpAwarded: totalLPAwarded,
      };
    } catch (error: any) {
      console.error('Error recording mission progress:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Claim completed mission reward
 */
export const claimMissionReward = onCall(
  async (request): Promise<{ 
    success: boolean; 
    lpAwarded?: number;
    error?: string;
  }> => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { missionId } = request.data;

      if (!missionId) {
        throw new HttpsError('invalid-argument', 'Mission ID required');
      }

      const missionDoc = await db
        .collection('creatorMissions')
        .doc(userId)
        .collection('activeMissions')
        .doc(missionId)
        .get();

      if (!missionDoc.exists) {
        throw new HttpsError('not-found', 'Mission not found');
      }

      const mission = missionDoc.data() as ActiveMission;

      if (mission.status !== 'completed') {
        throw new HttpsError('failed-precondition', 'Mission not completed');
      }

      if (mission.claimedAt) {
        throw new HttpsError('already-exists', 'Reward already claimed');
      }

      // Mark as claimed
      await missionDoc.ref.update({
        status: 'claimed',
        claimedAt: serverTimestamp(),
      });

      // Award LP through PACK 262 integration
      await awardMissionLP(userId, mission.reward.lp, mission.title);

      // Update profile stats
      await db.collection('creatorMissions').doc(userId).update({
        totalLPEarned: increment(mission.reward.lp),
        lastUpdated: serverTimestamp(),
      });

      // Move to completed archive
      await db
        .collection('creatorMissions')
        .doc(userId)
        .collection('completedMissions')
        .doc(missionId)
        .set({
          ...mission,
          status: 'claimed',
          claimedAt: serverTimestamp(),
        });

      return { success: true, lpAwarded: mission.reward.lp };
    } catch (error: any) {
      console.error('Error claiming mission reward:', error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Assign daily missions to creator
 */
async function assignDailyMissions(creatorId: string, level: CreatorLevel): Promise<void> {
  const slots = MISSION_SLOTS[level].daily;
  
  // Get available daily mission templates
  const availableTemplates = DEFAULT_MISSION_TEMPLATES.filter(
    t => t.missionType === 'daily' && 
         t.isActive &&
         (!t.requiredLevel || isLevelSufficient(level, t.requiredLevel))
  );

  // Randomly select missions based on available slots
  const selectedTemplates = shuffleArray(availableTemplates).slice(0, slots);

  // Calculate expiration (00:00 local time next day)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  // Assign missions
  for (const template of selectedTemplates) {
    const missionId = db.collection('_').doc().id;
    const mission: ActiveMission = {
      missionId,
      creatorId,
      templateId: template.id || missionId,
      missionType: 'daily',
      title: template.title!,
      description: template.description!,
      objective: template.objective!,
      reward: template.reward!,
      progress: {
        current: 0,
        target: template.objective!.target,
        percentage: 0,
      },
      status: 'active',
      assignedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      expiresAt: FieldValue.serverTimestamp() as any,
    };

    await db
      .collection('creatorMissions')
      .doc(creatorId)
      .collection('activeMissions')
      .doc(missionId)
      .set(mission);
  }

  // Update profile
  await db.collection('creatorMissions').doc(creatorId).update({
    'activeMissions.daily': slots,
    lastUpdated: serverTimestamp(),
  });

  // Send notification
  await sendMissionNotification(creatorId, 'new_missions', null);
}

/**
 * Assign weekly missions to creator
 */
async function assignWeeklyMissions(creatorId: string, level: CreatorLevel): Promise<void> {
  const slots = MISSION_SLOTS[level].weekly;
  
  if (slots === 0) return;

  // Get available weekly mission templates
  const availableTemplates = DEFAULT_MISSION_TEMPLATES.filter(
    t => t.missionType === 'weekly' && 
         t.isActive &&
         (!t.requiredLevel || isLevelSufficient(level, t.requiredLevel))
  );

  // Randomly select missions based on available slots
  const selectedTemplates = shuffleArray(availableTemplates).slice(0, slots);

  // Calculate expiration (Sunday 23:59 local time)
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
  nextSunday.setHours(23, 59, 59, 999);

  // Assign missions
  for (const template of selectedTemplates) {
    const missionId = db.collection('_').doc().id;
    const mission: ActiveMission = {
      missionId,
      creatorId,
      templateId: template.id || missionId,
      missionType: 'weekly',
      title: template.title!,
      description: template.description!,
      objective: template.objective!,
      reward: template.reward!,
      progress: {
        current: 0,
        target: template.objective!.target,
        percentage: 0,
      },
      status: 'active',
      assignedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      expiresAt: FieldValue.serverTimestamp() as any,
    };

    await db
      .collection('creatorMissions')
      .doc(creatorId)
      .collection('activeMissions')
      .doc(missionId)
      .set(mission);
  }

  // Update profile
  await db.collection('creatorMissions').doc(creatorId).update({
    'activeMissions.weekly': slots,
    lastUpdated: serverTimestamp(),
  });
}

/**
 * Complete a mission and update streaks
 */
async function completeMission(
  creatorId: string,
  missionId: string,
  mission: ActiveMission
): Promise<void> {
  const now = serverTimestamp() as FirebaseFirestore.Timestamp;

  // Mark mission as completed
  await db
    .collection('creatorMissions')
    .doc(creatorId)
    .collection('activeMissions')
    .doc(missionId)
    .update({
      status: 'completed',
      completedAt: now,
      'progress.percentage': 100,
    });

  // Update profile stats
  const profileRef = db.collection('creatorMissions').doc(creatorId);
  const profile = (await profileRef.get()).data() as CreatorMissionProfile;

  const updates: any = {
    lastUpdated: now,
  };

  // Update completion counts
  if (mission.missionType === 'daily') {
    updates['totalCompleted.daily'] = increment(1);
    updates['activeMissions.daily'] = increment(-1);
    
    // Update daily streak
    const lastCompletion = profile.streaks.lastDailyCompletion;
    const isConsecutive = lastCompletion ? 
      isWithin24Hours(lastCompletion.toDate(), new Date()) : false;
    
    if (isConsecutive) {
      updates['streaks.dailyStreak'] = increment(1);
    } else {
      updates['streaks.dailyStreak'] = 1;
    }
    updates['streaks.lastDailyCompletion'] = now;
    
    // Update best streak if needed
    const newStreak = isConsecutive ? profile.streaks.dailyStreak + 1 : 1;
    if (newStreak > profile.streaks.bestDailyStreak) {
      updates['streaks.bestDailyStreak'] = newStreak;
    }
  } else if (mission.missionType === 'weekly') {
    updates['totalCompleted.weekly'] = increment(1);
    updates['activeMissions.weekly'] = increment(-1);
    
    // Update weekly streak
    const lastCompletion = profile.streaks.lastWeeklyCompletion;
    const isConsecutive = lastCompletion ? 
      isWithinWeek(lastCompletion.toDate(), new Date()) : false;
    
    if (isConsecutive) {
      updates['streaks.weeklyStreak'] = increment(1);
    } else {
      updates['streaks.weeklyStreak'] = 1;
    }
    updates['streaks.lastWeeklyCompletion'] = now;
    
    // Update best streak if needed
    const newStreak = isConsecutive ? profile.streaks.weeklyStreak + 1 : 1;
    if (newStreak > profile.streaks.bestWeeklyStreak) {
      updates['streaks.bestWeeklyStreak'] = newStreak;
    }
  }

  await profileRef.update(updates);
}

/**
 * Validate activity to prevent exploitation
 */
async function validateActivity(
  creatorId: string,
  activityType: string,
  value: number,
  metadata: any
): Promise<boolean> {
  try {
    switch (activityType) {
      case 'host_live':
        // Verify minimum viewer count
        if (metadata?.viewerCount < VALIDATION_RULES.minLiveViewers) {
          return false;
        }
        break;

      case 'sell_event_tickets':
        // Verify minimum check-ins (prevents fake ticket sales)
        if (metadata?.checkinCount < VALIDATION_RULES.minEventCheckins) {
          return false;
        }
        break;

      case 'reply_messages':
      case 'earn_tokens':
        // Check for suspicious single-user concentration
        if (metadata?.payerId) {
          const hourAgo = new Date(Date.now() - 3600000);
          const recentFromUser = await db
            .collection('missionActivityLog')
            .doc(creatorId)
            .collection('activities')
            .where('metadata.payerId', '==', metadata.payerId)
            .where('timestamp', '>', hourAgo)
            .get();

          let totalFromUser = 0;
          recentFromUser.docs.forEach(doc => {
            const data = doc.data() as MissionProgress;
            if (data.activityType === activityType) {
              totalFromUser += data.progressAdded;
            }
          });

          if (totalFromUser > VALIDATION_RULES.maxTokensPerUserPerHour) {
            return false;
          }
        }
        break;
    }

    return true;
  } catch (error) {
    console.error('Error validating activity:', error);
    return false;
  }
}

/**
 * Award LP to creator (integrates with PACK 262)
 */
async function awardMissionLP(
  creatorId: string,
  lpAmount: number,
  source: string
): Promise<void> {
  try {
    // Award LP through PACK 262 level system
    await db.collection('creatorLevels').doc(creatorId).update({
      lifetimeLP: increment(lpAmount),
      currentLP: increment(lpAmount),
      lastUpdatedAt: serverTimestamp(),
    });

    // Log LP activity
    await db
      .collection('levelPoints')
      .doc(creatorId)
      .collection('activities')
      .add({
        activityId: db.collection('_').doc().id,
        creatorId,
        activityType: 'mission_completed',
        lpEarned: lpAmount,
        metadata: { source },
        timestamp: serverTimestamp(),
        flagged: false,
      });
  } catch (error) {
    console.error('Error awarding mission LP:', error);
    throw error;
  }
}

/**
 * Send mission notification
 */
async function sendMissionNotification(
  creatorId: string,
  type: 'new_missions' | 'near_completion' | 'completed' | 'weekly_reset',
  mission: ActiveMission | null
): Promise<void> {
  try {
    let title = '';
    let message = '';
    let actionUrl = '/profile/creator-missions';

    switch (type) {
      case 'new_missions':
        title = 'New missions are ready — claim extra LP today!';
        message = 'Check your creator dashboard for fresh missions';
        break;
      case 'near_completion':
        const remaining = mission ? mission.objective.target - mission.progress.current : 0;
        title = `Only ${remaining} ${mission?.objective.unit} left to complete your mission`;
        message = `You're ${mission?.progress.percentage}% done with "${mission?.title}"`;
        break;
      case 'completed':
        title = `You earned ${mission?.reward.lp} LP — great job!`;
        message = `Mission completed: ${mission?.title}`;
        break;
      case 'weekly_reset':
        title = 'Your weekly missions are refreshed — big LP bonuses available';
        message = 'New weekly missions with premium rewards are now available';
        break;
    }

    await db.collection('missionNotifications').add({
      creatorId,
      type,
      title,
      message,
      actionUrl,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error sending mission notification:', error);
  }
}

/**
 * Check and send near-completion notifications
 */
async function checkNearCompletionNotifications(creatorId: string): Promise<void> {
  try {
    const activeMissionsSnapshot = await db
      .collection('creatorMissions')
      .doc(creatorId)
      .collection('activeMissions')
      .where('status', '==', 'active')
      .get();

    for (const missionDoc of activeMissionsSnapshot.docs) {
      const mission = missionDoc.data() as ActiveMission;
      const percentage = mission.progress.percentage;

      // Send notification at 80%, 90%, 95%
      if ([80, 90, 95].includes(percentage)) {
        // Check if notification already sent for this milestone
        const recentNotifs = await db
          .collection('missionNotifications')
          .where('creatorId', '==', creatorId)
          .where('type', '==', 'near_completion')
          .where('createdAt', '>', new Date(Date.now() - 3600000)) // Last hour
          .get();

        const alreadySent = recentNotifs.docs.some(doc => {
          const data = doc.data();
          return data.message?.includes(mission.title);
        });

        if (!alreadySent) {
          await sendMissionNotification(creatorId, 'near_completion', mission);
        }
      }
    }
  } catch (error) {
    console.error('Error checking near completion notifications:', error);
  }
}

/**
 * Update mission slots when creator level changes
 */
export const updateMissionSlotsOnLevelChange = functions.firestore
  .document('creatorLevels/{creatorId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const creatorId = context.params.creatorId;

      // Check if level changed
      if (before.level !== after.level) {
        const newLevel = after.level as CreatorLevel;
        const newSlots = MISSION_SLOTS[newLevel];

        // Update mission profile
        await db.collection('creatorMissions').doc(creatorId).update({
          level: newLevel,
          slots: newSlots,
          lastUpdated: serverTimestamp(),
        });

        // Assign additional missions if slots increased
        const profile = (await db.collection('creatorMissions').doc(creatorId).get())
          .data() as CreatorMissionProfile;

        if (newSlots.daily > profile.activeMissions.daily) {
          await assignDailyMissions(creatorId, newLevel);
        }

        if (newSlots.weekly > profile.activeMissions.weekly) {
          await assignWeeklyMissions(creatorId, newLevel);
        }
      }
    } catch (error) {
      console.error('Error updating mission slots on level change:', error);
    }
  });

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Reset daily missions at 00:00 local time (runs hourly, checks timezone)
 */
export const resetDailyMissions = onSchedule('every 1 hours', async (event) => {
  try {
    console.log('Running daily mission reset check...');

    // Get all creator mission profiles
    const profilesSnapshot = await db.collection('creatorMissions').get();

    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data() as CreatorMissionProfile;
      const creatorId = profile.creatorId;

      // Check if it's midnight in creator's timezone (simplified - uses UTC)
      const now = new Date();
      if (now.getHours() === 0) {
        // Expire old daily missions
        const oldMissionsSnapshot = await db
          .collection('creatorMissions')
          .doc(creatorId)
          .collection('activeMissions')
          .where('missionType', '==', 'daily')
          .get();

        for (const missionDoc of oldMissionsSnapshot.docs) {
          const mission = missionDoc.data() as ActiveMission;
          if (mission.status === 'active') {
            await missionDoc.ref.update({
              status: 'expired',
            });
          }
        }

        // Assign new daily missions
        await assignDailyMissions(creatorId, profile.level);
      }
    }

    console.log('Daily mission reset check complete');
  } catch (error) {
    console.error('Error in daily mission reset:', error);
  }
});

/**
 * Reset weekly missions every Sunday at 23:59
 */
export const resetWeeklyMissions = onSchedule('59 23 * * 0', async (event) => {
  try {
    console.log('Running weekly mission reset...');

    // Get all creator mission profiles
    const profilesSnapshot = await db.collection('creatorMissions').get();

    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data() as CreatorMissionProfile;
      const creatorId = profile.creatorId;

      // Expire old weekly missions
      const oldMissionsSnapshot = await db
        .collection('creatorMissions')
        .doc(creatorId)
        .collection('activeMissions')
        .where('missionType', '==', 'weekly')
        .get();

      for (const missionDoc of oldMissionsSnapshot.docs) {
        const mission = missionDoc.data() as ActiveMission;
        if (mission.status === 'active') {
          await missionDoc.ref.update({
            status: 'expired',
          });
        }
      }

      // Assign new weekly missions
      if (profile.slots.weekly > 0) {
        await assignWeeklyMissions(creatorId, profile.level);
        await sendMissionNotification(creatorId, 'weekly_reset', null);
      }
    }

    console.log('Weekly mission reset complete');
  } catch (error) {
    console.error('Error in weekly mission reset:', error);
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isLevelSufficient(current: CreatorLevel, required: CreatorLevel): boolean {
  const levels: CreatorLevel[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  return levels.indexOf(current) >= levels.indexOf(required);
}

function isWithin24Hours(date1: Date, date2: Date): boolean {
  const diff = Math.abs(date2.getTime() - date1.getTime());
  return diff <= 24 * 60 * 60 * 1000;
}

function isWithinWeek(date1: Date, date2: Date): boolean {
  const diff = Math.abs(date2.getTime() - date1.getTime());
  return diff <= 7 * 24 * 60 * 60 * 1000;
}

// ============================================================================
// INTEGRATION EXPORTS
// ============================================================================

export {
  assignDailyMissions,
  assignWeeklyMissions,
  completeMission,
  validateActivity,
  awardMissionLP,
  sendMissionNotification,
};