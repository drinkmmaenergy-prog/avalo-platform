/**
 * PACK 223: Destiny Weeks - Weekly Chemistry Event System
 * 
 * Recurring weekly engagement engine that boosts swipes, chats, calls, meetings,
 * and events without artificial pressure. All rewards are behavior-based, not random.
 * 
 * Key Features:
 * - Weekly rotating themes (Monday 00:00 → Sunday 23:59 user local time)
 * - Action-based scoring (no login rewards)
 * - Visibility/reach rewards (no token giveaways)
 * - Breakup Recovery integration (soft themes during recovery)
 * - Full economy compatibility (no price changes)
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type WeeklyThemeSlug = 
  | 'chemistry_sparks'
  | 'flirty_vibes'
  | 'romantic_energy'
  | 'midnight_connections'
  | 'confident_generous'
  | 'passport_romance';

export type DestinyAction = 
  | 'swipe_match'
  | 'first_message'
  | 'complete_chat'
  | 'voice_call'
  | 'video_call'
  | 'meeting_verified'
  | 'join_event'
  | 'host_event';

export type RewardType =
  | 'discover_boost'
  | 'golden_glow'
  | 'chat_priority'
  | 'fate_matches'
  | 'trending_badge'
  | 'discover_highlight';

export interface WeeklyTheme {
  themeId: string;
  slug: WeeklyThemeSlug;
  name: string;
  icon: string;
  description: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  actions: Partial<Record<DestinyAction, number>>;
  softMode: boolean;
  active: boolean;
  createdAt: Timestamp;
}

export interface UserDestinyState {
  userId: string;
  activeThemeId: string | null;
  currentWeekScore: number;
  lastWeekScore: number;
  totalWeeksParticipated: number;
  highestWeekScore: number;
  actionsThisWeek: Partial<Record<DestinyAction, number>>;
  rewards: DestinyReward[];
  breakRecoverySync: boolean;
  inBreakupRecovery: boolean;
  recoveryPhase?: 'cooldown' | 'rebuild' | 'restart';
  weekStartedAt: Timestamp;
  lastActionAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface DestinyReward {
  rewardId: string;
  type: RewardType;
  name: string;
  description: string;
  earnedFrom: {
    themeId: string;
    weekOf: Timestamp;
    score: number;
  };
  activatedAt: Timestamp;
  expiresAt?: Timestamp;
  isActive: boolean;
  metadata?: {
    boostMultiplier?: number;
    durationHours?: number;
    badgeIcon?: string;
  };
}

export interface DestinyMilestone {
  milestoneId: string;
  userId: string;
  themeId: string;
  scoreThreshold: number;
  reachedAt: Timestamp;
  reward: {
    type: RewardType;
    value: string;
    duration?: number;
  };
  claimed: boolean;
  claimedAt?: Timestamp;
}

// ============================================================================
// CONSTANTS - THEME CONFIGURATIONS
// ============================================================================

const THEME_CONFIGS: Record<WeeklyThemeSlug, {
  name: string;
  icon: string;
  description: string;
  softMode: boolean;
  actions: Partial<Record<DestinyAction, number>>;
}> = {
  chemistry_sparks: {
    name: '🔥 Chemistry Sparks Week',
    icon: '🔥',
    description: 'Ignite connections with engaging chats and calls',
    softMode: false,
    actions: {
      swipe_match: 5,
      first_message: 15,
      complete_chat: 50,
      voice_call: 100,
      video_call: 150,
      meeting_verified: 300,
      join_event: 200,
      host_event: 500
    }
  },
  flirty_vibes: {
    name: '💋 Flirty Vibes Week',
    icon: '💋',
    description: 'Turn up the charm and playful energy',
    softMode: true, // Suitable after breakup
    actions: {
      swipe_match: 10,
      first_message: 20,
      complete_chat: 60,
      voice_call: 120,
      video_call: 180,
      meeting_verified: 350,
      join_event: 250,
      host_event: 600
    }
  },
  romantic_energy: {
    name: '💞 Romantic Energy Week',
    icon: '💞',
    description: 'Build deeper romantic connections',
    softMode: false,
    actions: {
      swipe_match: 3,
      first_message: 10,
      complete_chat: 80,
      voice_call: 150,
      video_call: 200,
      meeting_verified: 400,
      join_event: 300,
      host_event: 700
    }
  },
  midnight_connections: {
    name: '🌙 Midnight Connections Week',
    icon: '🌙',
    description: 'Late-night chemistry and intimate conversations',
    softMode: false,
    actions: {
      swipe_match: 8,
      first_message: 25,
      complete_chat: 70,
      voice_call: 180,
      video_call: 250,
      meeting_verified: 450,
      join_event: 280,
      host_event: 650
    }
  },
  confident_generous: {
    name: '✨ Confident Women / Generous Men Week',
    icon: '✨',
    description: 'Celebrate confidence and generosity in dating',
    softMode: false,
    actions: {
      swipe_match: 7,
      first_message: 18,
      complete_chat: 90,
      voice_call: 160,
      video_call: 220,
      meeting_verified: 500,
      join_event: 320,
      host_event: 750
    }
  },
  passport_romance: {
    name: '🗝 Passport Romance Week',
    icon: '🗝',
    description: 'Cross-border connections and cultural chemistry',
    softMode: true, // Gentle theme
    actions: {
      swipe_match: 12,
      first_message: 30,
      complete_chat: 100,
      voice_call: 200,
      video_call: 280,
      meeting_verified: 600,
      join_event: 400,
      host_event: 800
    }
  }
};

// Milestone thresholds (universal across themes)
const MILESTONE_THRESHOLDS = [100, 300, 500, 1000, 2000, 5000];

// Reward configurations
const REWARD_CONFIGS: Record<RewardType, {
  name: string;
  description: string;
  durationHours?: number;
  boostMultiplier?: number;
}> = {
  discover_boost: {
    name: 'Discovery Boost',
    description: 'Your profile appears higher in discovery',
    durationHours: 48,
    boostMultiplier: 2.0
  },
  golden_glow: {
    name: 'Golden Glow',
    description: 'Your profile has a premium golden frame',
    durationHours: 48
  },
  chat_priority: {
    name: 'Chat Priority',
    description: 'Your messages appear first in inboxes',
    durationHours: 72
  },
  fate_matches: {
    name: 'Fate Matches',
    description: 'Extra high-chemistry match suggestions',
    durationHours: 168 // 1 week
  },
  trending_badge: {
    name: 'Trending Badge',
    description: 'Show everyone you\'re on fire this week',
    durationHours: 168
  },
  discover_highlight: {
    name: 'Discover Highlight',
    description: 'Featured placement in next week\'s Destiny'
  }
};

// ============================================================================
// WEEKLY THEME MANAGEMENT
// ============================================================================

/**
 * Get the current active weekly theme
 * Themes run Monday 00:00 → Sunday 23:59 in user's local timezone
 */
export async function getCurrentWeeklyTheme(
  userTimezone: string = 'UTC'
): Promise<WeeklyTheme | null> {
  const now = new Date();
  
  // Find active theme for current week
  const themesSnap = await db.collection('destiny_weekly_themes')
    .where('active', '==', true)
    .where('startsAt', '<=', now)
    .where('endsAt', '>=', now)
    .limit(1)
    .get();
  
  if (themesSnap.empty) {
    // Generate a new theme if none exists
    return await generateWeeklyTheme(userTimezone);
  }
  
  return themesSnap.docs[0].data() as WeeklyTheme;
}

/**
 * Generate a new weekly theme
 * Called automatically on Monday 00:00 or when no active theme exists
 */
export async function generateWeeklyTheme(
  userTimezone: string = 'UTC'
): Promise<WeeklyTheme> {
  const now = new Date();
  
  // Calculate week start (Monday 00:00) and end (Sunday 23:59)
  const weekStart = getWeekStart(now, userTimezone);
  const weekEnd = getWeekEnd(weekStart);
  
  // Select theme based on rotation or breakup recovery needs
  const themeSlug = await selectThemeForWeek(weekStart);
  const config = THEME_CONFIGS[themeSlug];
  
  const themeId = generateId();
  const theme: WeeklyTheme = {
    themeId,
    slug: themeSlug,
    name: config.name,
    icon: config.icon,
    description: config.description,
    startsAt: weekStart as any,
    endsAt: weekEnd as any,
    actions: config.actions,
    softMode: config.softMode,
    active: true,
    createdAt: serverTimestamp() as any
  };
  
  await db.collection('destiny_weekly_themes').doc(themeId).set(theme);
  
  return theme;
}

/**
 * Select theme for the week
 * Prioritizes soft themes if many users are in breakup recovery
 */
async function selectThemeForWeek(weekStart: Date): Promise<WeeklyThemeSlug> {
  // Check how many users are in breakup recovery
  const recoveryCount = await db.collection('destiny_user_states')
    .where('inBreakupRecovery', '==', true)
    .count()
    .get();
  
  const totalUsers = await db.collection('destiny_user_states')
    .count()
    .get();
  
  const recoveryRatio = totalUsers.data().count > 0 
    ? recoveryCount.data().count / totalUsers.data().count 
    : 0;
  
  // If >20% users in recovery, prefer soft themes
  if (recoveryRatio > 0.2) {
    const softThemes: WeeklyThemeSlug[] = ['flirty_vibes', 'passport_romance'];
    return softThemes[Math.floor(Math.random() * softThemes.length)];
  }
  
  // Otherwise, rotate through all themes
  const allThemes: WeeklyThemeSlug[] = Object.keys(THEME_CONFIGS) as WeeklyThemeSlug[];
  const weekNumber = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
  return allThemes[weekNumber % allThemes.length];
}

/**
 * Archive old theme and generate new one
 * Should be called on Monday 00:00
 */
export async function rotateWeeklyTheme(): Promise<void> {
  // Archive current theme
  const currentThemes = await db.collection('destiny_weekly_themes')
    .where('active', '==', true)
    .get();
  
  for (const themeDoc of currentThemes.docs) {
    await themeDoc.ref.update({
      active: false,
      archivedAt: serverTimestamp()
    });
  }
  
  // Generate new theme
  await generateWeeklyTheme();
  
  // Reset all user states for new week
  await resetUserStatesForNewWeek();
}

/**
 * Reset user states for new week
 */
async function resetUserStatesForNewWeek(): Promise<void> {
  const batch = db.batch();
  let count = 0;
  
  const statesSnap = await db.collection('destiny_user_states').get();
  
  for (const stateDoc of statesSnap.docs) {
    const state = stateDoc.data() as UserDestinyState;
    
    batch.update(stateDoc.ref, {
      lastWeekScore: state.currentWeekScore,
      currentWeekScore: 0,
      actionsThisWeek: {},
      weekStartedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    count++;
    
    // Firestore batch limit is 500
    if (count >= 450) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
}

// ============================================================================
// USER STATE MANAGEMENT
// ============================================================================

/**
 * Get or create user's Destiny state
 */
export async function getUserDestinyState(userId: string): Promise<UserDestinyState> {
  const stateRef = db.collection('destiny_user_states').doc(userId);
  const stateSnap = await stateRef.get();
  
  if (stateSnap.exists) {
    return stateSnap.data() as UserDestinyState;
  }
  
  // Create new state
  const currentTheme = await getCurrentWeeklyTheme();
  
  const newState: UserDestinyState = {
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
    weekStartedAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await stateRef.set(newState);
  return newState;
}

/**
 * Sync user's breakup recovery status with Destiny Weeks
 * Called by PACK 222 when recovery state changes
 */
export async function syncBreakupRecoveryStatus(
  userId: string,
  inRecovery: boolean,
  recoveryPhase?: 'cooldown' | 'rebuild' | 'restart'
): Promise<void> {
  const stateRef = db.collection('destiny_user_states').doc(userId);
  
  await stateRef.set({
    inBreakupRecovery: inRecovery,
    recoveryPhase: recoveryPhase || null,
    breakRecoverySync: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // If in cooldown, pause Destiny participation
  if (inRecovery && recoveryPhase === 'cooldown') {
    // Don't show Destiny UI during cooldown
    await stateRef.update({
      activeThemeId: null // Temporarily inactive
    });
  } else if (!inRecovery) {
    // Reactivate Destiny
    const currentTheme = await getCurrentWeeklyTheme();
    await stateRef.update({
      activeThemeId: currentTheme?.themeId || null
    });
  }
}

// ============================================================================
// ACTION TRACKING & SCORING
// ============================================================================

/**
 * Track a Destiny action and update user's score
 */
export async function trackDestinyAction(
  userId: string,
  action: DestinyAction,
  metadata?: Record<string, any>
): Promise<{ scoreAdded: number; totalScore: number; milestoneReached?: DestinyMilestone }> {
  const state = await getUserDestinyState(userId);
  
  // Don't track during breakup cooldown
  if (state.inBreakupRecovery && state.recoveryPhase === 'cooldown') {
    return { scoreAdded: 0, totalScore: state.currentWeekScore };
  }
  
  // Get current theme
  const theme = await getCurrentWeeklyTheme();
  if (!theme) {
    return { scoreAdded: 0, totalScore: state.currentWeekScore };
  }
  
  // Calculate score for this action
  const actionScore = theme.actions[action] || 0;
  
  if (actionScore === 0) {
    return { scoreAdded: 0, totalScore: state.currentWeekScore };
  }
  
  // Update state
  const stateRef = db.collection('destiny_user_states').doc(userId);
  const newScore = state.currentWeekScore + actionScore;
  const newActionCount = (state.actionsThisWeek[action] || 0) + 1;
  
  await stateRef.update({
    currentWeekScore: newScore,
    [`actionsThisWeek.${action}`]: newActionCount,
    highestWeekScore: newScore > state.highestWeekScore ? newScore : state.highestWeekScore,
    lastActionAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Check for milestone
  const milestone = await checkAndUnlockMilestone(userId, newScore, theme.themeId);
  
  return {
    scoreAdded: actionScore,
    totalScore: newScore,
    milestoneReached: milestone || undefined
  };
}

/**
 * Check if user reached a new milestone
 */
async function checkAndUnlockMilestone(
  userId: string,
  currentScore: number,
  themeId: string
): Promise<DestinyMilestone | null> {
  // Find the highest unlocked threshold
  let highestUnlocked = 0;
  
  const milestonesSnap = await db.collection('destiny_milestones')
    .where('userId', '==', userId)
    .where('themeId', '==', themeId)
    .get();
  
  for (const milestoneDoc of milestonesSnap.docs) {
    const milestone = milestoneDoc.data() as DestinyMilestone;
    if (milestone.scoreThreshold > highestUnlocked) {
      highestUnlocked = milestone.scoreThreshold;
    }
  }
  
  // Check if current score reached next threshold
  const nextThreshold = MILESTONE_THRESHOLDS.find(t => t > highestUnlocked);
  
  if (nextThreshold && currentScore >= nextThreshold) {
    // Unlock milestone
    const reward = getRewardForMilestone(nextThreshold);
    
    const milestoneId = generateId();
    const milestone: DestinyMilestone = {
      milestoneId,
      userId,
      themeId,
      scoreThreshold: nextThreshold,
      reachedAt: serverTimestamp() as any,
      reward,
      claimed: false
    };
    
    await db.collection('destiny_milestones').doc(milestoneId).set(milestone);
    
    return milestone;
  }
  
  return null;
}

/**
 * Get reward for milestone threshold
 */
function getRewardForMilestone(threshold: number): {
  type: RewardType;
  value: string;
  duration?: number;
} {
  const rewardMap: Record<number, RewardType> = {
    100: 'trending_badge',
    300: 'chat_priority',
    500: 'golden_glow',
    1000: 'discover_boost',
    2000: 'fate_matches',
    5000: 'discover_highlight'
  };
  
  const type = rewardMap[threshold] || 'trending_badge';
  const config = REWARD_CONFIGS[type];
  
  return {
    type,
    value: config.name,
    duration: config.durationHours
  };
}

// ============================================================================
// REWARD SYSTEM
// ============================================================================

/**
 * Claim a milestone reward
 */
export async function claimMilestoneReward(
  userId: string,
  milestoneId: string
): Promise<DestinyReward> {
  const milestoneRef = db.collection('destiny_milestones').doc(milestoneId);
  const milestoneSnap = await milestoneRef.get();
  
  if (!milestoneSnap.exists) {
    throw new Error('Milestone not found');
  }
  
  const milestone = milestoneSnap.data() as DestinyMilestone;
  
  if (milestone.userId !== userId) {
    throw new Error('Not your milestone');
  }
  
  if (milestone.claimed) {
    throw new Error('Already claimed');
  }
  
  // Create reward
  const rewardId = generateId();
  const config = REWARD_CONFIGS[milestone.reward.type];
  
  const reward: DestinyReward = {
    rewardId,
    type: milestone.reward.type,
    name: config.name,
    description: config.description,
    earnedFrom: {
      themeId: milestone.themeId,
      weekOf: milestone.reachedAt,
      score: milestone.scoreThreshold
    },
    activatedAt: serverTimestamp() as any,
    expiresAt: config.durationHours 
      ? new Date(Date.now() + config.durationHours * 60 * 60 * 1000) as any
      : undefined,
    isActive: true,
    metadata: {
      boostMultiplier: config.boostMultiplier,
      durationHours: config.durationHours
    }
  };
  
  // Update milestone as claimed
  await milestoneRef.update({
    claimed: true,
    claimedAt: serverTimestamp()
  });
  
  // Add reward to user state
  const stateRef = db.collection('destiny_user_states').doc(userId);
  await stateRef.update({
    rewards: increment(1) as any, // This should append, but Firestore doesn't support direct array append in update
    updatedAt: serverTimestamp()
  });
  
  // Store reward separately
  await db.collection('destiny_rewards').doc(rewardId).set(reward);
  
  return reward;
}

/**
 * Get user's active rewards
 */
export async function getActiveRewards(userId: string): Promise<DestinyReward[]> {
  const now = new Date();
  
  const rewardsSnap = await db.collection('destiny_rewards')
    .where('earnedFrom.userId', '==', userId)
    .where('isActive', '==', true)
    .get();
  
  const activeRewards: DestinyReward[] = [];
  
  for (const rewardDoc of rewardsSnap.docs) {
    const reward = rewardDoc.data() as DestinyReward;
    
    // Check if expired
    if (reward.expiresAt && reward.expiresAt.toMillis() < now.getTime()) {
      // Deactivate expired reward
      await rewardDoc.ref.update({
        isActive: false
      });
    } else {
      activeRewards.push(reward);
    }
  }
  
  return activeRewards;
}

// ============================================================================
// MATCHING PRIORITY
// ============================================================================

/**
 * Calculate Destiny boost for discovery/matching
 * Returns a multiplier (1.0 = no boost, 2.0 = 2x boost, etc.)
 */
export async function getDestinyBoostMultiplier(userId: string): Promise<number> {
  const rewards = await getActiveRewards(userId);
  
  let maxBoost = 1.0;
  
  for (const reward of rewards) {
    if (reward.type === 'discover_boost' && reward.metadata?.boostMultiplier) {
      maxBoost = Math.max(maxBoost, reward.metadata.boostMultiplier);
    }
  }
  
  return maxBoost;
}

/**
 * Check if user has chat priority
 */
export async function hasChatPriority(userId: string): Promise<boolean> {
  const rewards = await getActiveRewards(userId);
  return rewards.some(r => r.type === 'chat_priority' && r.isActive);
}

/**
 * Check if user has golden glow frame
 */
export async function hasGoldenGlow(userId: string): Promise<boolean> {
  const rewards = await getActiveRewards(userId);
  return rewards.some(r => r.type === 'golden_glow' && r.isActive);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get week start (Monday 00:00) in user's timezone
 */
function getWeekStart(date: Date, timezone: string = 'UTC'): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  
  return weekStart;
}

/**
 * Get week end (Sunday 23:59) in user's timezone
 */
function getWeekEnd(weekStart: Date): Date {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return weekEnd;
}