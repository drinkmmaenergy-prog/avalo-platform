import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type ChallengeType = 
  | 'SEND_MESSAGES'      // Send 10 messages
  | 'FIRST_MESSAGES'     // Be first to send 3 messages in new chats
  | 'VIEW_PPV'           // View 2 PPV media items
  | 'JOIN_LIVE'          // Join 1 LIVE
  | 'AI_SESSION';        // Start 1 AI Companion session

export type ChallengeDuration = 24 | 48 | 72; // hours

export type CosmeticReward = 
  | 'GOLDEN_FRAME'       // 72 hours
  | 'SPOTLIGHT_BADGE'    // 48 hours
  | 'SMARTMATCH_GLOW'    // 48 hours
  | 'SUPERFAN_TITLE';    // 7 days

export type ChallengeEvent = 
  | 'MESSAGE_SENT'
  | 'FIRST_MESSAGE'
  | 'PPV_UNLOCK'
  | 'LIVE_JOIN'
  | 'AI_SESSION';

export interface ChallengeConfig {
  type: ChallengeType;
  duration: ChallengeDuration;
  reward: CosmeticReward;
}

export interface Challenge {
  id: string;
  creatorId: string;
  type: ChallengeType;
  reward: CosmeticReward;
  startTime: number;
  endTime: number;
  isActive: boolean;
}

export interface ChallengeProgress {
  userId: string;
  challengeId: string;
  creatorId: string;
  joinTime: number;
  progress: number;
  target: number;
  completed: boolean;
  completionTime?: number;
}

export interface ChallengeStats {
  participantsCount: number;
  completionCount: number;
  remainingTime: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  progress: number;
  completionTime?: number;
  rank: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  CHALLENGES: 'fan_challenges',
  PROGRESS: 'fan_challenge_progress',
  REWARDS: 'fan_challenge_rewards',
};

const CHALLENGE_TARGETS: Record<ChallengeType, number> = {
  SEND_MESSAGES: 10,
  FIRST_MESSAGES: 3,
  VIEW_PPV: 2,
  JOIN_LIVE: 1,
  AI_SESSION: 1,
};

const REWARD_DURATIONS: Record<CosmeticReward, number> = {
  GOLDEN_FRAME: 72 * 60 * 60 * 1000,      // 72 hours
  SPOTLIGHT_BADGE: 48 * 60 * 60 * 1000,   // 48 hours
  SMARTMATCH_GLOW: 48 * 60 * 60 * 1000,   // 48 hours
  SUPERFAN_TITLE: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const generateId = (): string => {
  return `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const mapEventToChallengeType = (event: ChallengeEvent): ChallengeType | null => {
  switch (event) {
    case 'MESSAGE_SENT':
      return 'SEND_MESSAGES';
    case 'FIRST_MESSAGE':
      return 'FIRST_MESSAGES';
    case 'PPV_UNLOCK':
      return 'VIEW_PPV';
    case 'LIVE_JOIN':
      return 'JOIN_LIVE';
    case 'AI_SESSION':
      return 'AI_SESSION';
    default:
      return null;
  }
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new challenge for a creator
 * Only one active challenge per creator is allowed
 */
export const createChallenge = async (
  creatorId: string,
  config: ChallengeConfig
): Promise<Challenge> => {
  try {
    // Check if creator already has an active challenge
    const activeChallenge = await getActiveChallenge(creatorId);
    if (activeChallenge) {
      throw new Error('Creator already has an active challenge');
    }

    const now = Date.now();
    const endTime = now + (config.duration * 60 * 60 * 1000); // Convert hours to ms

    const challenge: Challenge = {
      id: generateId(),
      creatorId,
      type: config.type,
      reward: config.reward,
      startTime: now,
      endTime,
      isActive: true,
    };

    // Store challenge
    const challenges = await getAllChallenges();
    challenges.push(challenge);
    await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(challenges));

    return challenge;
  } catch (error) {
    console.error('Error creating challenge:', error);
    throw error;
  }
};

/**
 * Get active challenge for a creator
 */
export const getActiveChallenge = async (
  creatorId: string
): Promise<Challenge | null> => {
  try {
    const challenges = await getAllChallenges();
    const now = Date.now();

    // Find active, non-expired challenge for creator
    const activeChallenge = challenges.find(
      (c) => c.creatorId === creatorId && c.isActive && c.endTime > now
    );

    return activeChallenge || null;
  } catch (error) {
    console.error('Error getting active challenge:', error);
    return null;
  }
};

/**
 * Join a challenge
 */
export const joinChallenge = async (
  creatorId: string,
  userId: string
): Promise<ChallengeProgress | null> => {
  try {
    const challenge = await getActiveChallenge(creatorId);
    if (!challenge) {
      throw new Error('No active challenge found');
    }

    // Check if user already joined
    const existingProgress = await getUserChallengeProgress(challenge.id, userId);
    if (existingProgress) {
      return existingProgress;
    }

    // Create new progress entry
    const progress: ChallengeProgress = {
      userId,
      challengeId: challenge.id,
      creatorId,
      joinTime: Date.now(),
      progress: 0,
      target: CHALLENGE_TARGETS[challenge.type],
      completed: false,
    };

    const allProgress = await getAllProgress();
    allProgress.push(progress);
    await AsyncStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(allProgress));

    return progress;
  } catch (error) {
    console.error('Error joining challenge:', error);
    return null;
  }
};

/**
 * Register progress for a challenge event
 */
export const registerChallengeProgress = async (
  creatorId: string,
  userId: string,
  event: ChallengeEvent
): Promise<boolean> => {
  try {
    const challenge = await getActiveChallenge(creatorId);
    if (!challenge) {
      return false;
    }

    // Map event to challenge type
    const eventType = mapEventToChallengeType(event);
    if (!eventType || eventType !== challenge.type) {
      return false;
    }

    // Get user's progress
    let progress = await getUserChallengeProgress(challenge.id, userId);
    if (!progress) {
      // Auto-join if user hasn't joined yet
      progress = await joinChallenge(creatorId, userId);
      if (!progress) {
        return false;
      }
    }

    // Don't update if already completed
    if (progress.completed) {
      return true;
    }

    // Increment progress
    progress.progress += 1;

    // Check completion
    if (progress.progress >= progress.target) {
      progress.completed = true;
      progress.completionTime = Date.now();
      await activateReward(userId, challenge.reward);
    }

    // Update storage
    await updateProgress(progress);

    return true;
  } catch (error) {
    console.error('Error registering challenge progress:', error);
    return false;
  }
};

/**
 * Complete a challenge manually
 */
export const completeChallenge = async (
  creatorId: string,
  userId: string
): Promise<boolean> => {
  try {
    const challenge = await getActiveChallenge(creatorId);
    if (!challenge) {
      return false;
    }

    const progress = await getUserChallengeProgress(challenge.id, userId);
    if (!progress || progress.completed) {
      return false;
    }

    progress.completed = true;
    progress.completionTime = Date.now();
    progress.progress = progress.target;

    await activateReward(userId, challenge.reward);
    await updateProgress(progress);

    return true;
  } catch (error) {
    console.error('Error completing challenge:', error);
    return false;
  }
};

/**
 * Expire challenges that have passed their end time
 */
export const expireChallengesIfNeeded = async (): Promise<void> => {
  try {
    const challenges = await getAllChallenges();
    const now = Date.now();
    let updated = false;

    for (const challenge of challenges) {
      if (challenge.isActive && challenge.endTime <= now) {
        challenge.isActive = false;
        updated = true;
      }
    }

    if (updated) {
      await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(challenges));
    }
  } catch (error) {
    console.error('Error expiring challenges:', error);
  }
};

/**
 * Get leaderboard for a challenge
 */
export const getLeaderboards = async (
  creatorId: string
): Promise<LeaderboardEntry[]> => {
  try {
    const challenge = await getActiveChallenge(creatorId);
    if (!challenge) {
      return [];
    }

    const allProgress = await getAllProgress();
    const challengeProgress = allProgress.filter(
      (p) => p.challengeId === challenge.id
    );

    // Sort by completion time (completed first) and then by progress
    const sorted = challengeProgress.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      if (a.completed && b.completed) {
        return (a.completionTime || 0) - (b.completionTime || 0);
      }
      return b.progress - a.progress;
    });

    // Create leaderboard entries
    return sorted.map((p, index) => ({
      userId: p.userId,
      username: `User_${p.userId.substring(0, 8)}`, // Mock username
      progress: p.progress,
      completionTime: p.completionTime,
      rank: index + 1,
    }));
  } catch (error) {
    console.error('Error getting leaderboards:', error);
    return [];
  }
};

/**
 * Get challenge statistics
 */
export const getChallengeStats = async (
  creatorId: string
): Promise<ChallengeStats | null> => {
  try {
    const challenge = await getActiveChallenge(creatorId);
    if (!challenge) {
      return null;
    }

    const allProgress = await getAllProgress();
    const challengeProgress = allProgress.filter(
      (p) => p.challengeId === challenge.id
    );

    return {
      participantsCount: challengeProgress.length,
      completionCount: challengeProgress.filter((p) => p.completed).length,
      remainingTime: Math.max(0, challenge.endTime - Date.now()),
    };
  } catch (error) {
    console.error('Error getting challenge stats:', error);
    return null;
  }
};

/**
 * End a challenge early
 */
export const endChallengeEarly = async (creatorId: string): Promise<boolean> => {
  try {
    const challenges = await getAllChallenges();
    const challenge = challenges.find(
      (c) => c.creatorId === creatorId && c.isActive
    );

    if (!challenge) {
      return false;
    }

    challenge.isActive = false;
    await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(challenges));

    return true;
  } catch (error) {
    console.error('Error ending challenge early:', error);
    return false;
  }
};

/**
 * Get user's progress for a specific challenge
 */
export const getUserChallengeProgress = async (
  challengeId: string,
  userId: string
): Promise<ChallengeProgress | null> => {
  try {
    const allProgress = await getAllProgress();
    return allProgress.find(
      (p) => p.challengeId === challengeId && p.userId === userId
    ) || null;
  } catch (error) {
    console.error('Error getting user challenge progress:', error);
    return null;
  }
};

/**
 * Get active rewards for a user
 */
export const getActiveRewards = async (
  userId: string
): Promise<Array<{ reward: CosmeticReward; expiresAt: number }>> => {
  try {
    const rewardsJson = await AsyncStorage.getItem(STORAGE_KEYS.REWARDS);
    if (!rewardsJson) {
      return [];
    }

    const allRewards = JSON.parse(rewardsJson);
    const userRewards = allRewards[userId] || [];
    const now = Date.now();

    // Filter out expired rewards
    const activeRewards = userRewards.filter((r: any) => r.expiresAt > now);

    // Update storage if any expired
    if (activeRewards.length !== userRewards.length) {
      allRewards[userId] = activeRewards;
      await AsyncStorage.setItem(STORAGE_KEYS.REWARDS, JSON.stringify(allRewards));
    }

    return activeRewards;
  } catch (error) {
    console.error('Error getting active rewards:', error);
    return [];
  }
};

/**
 * Check if user has a specific active reward
 */
export const hasActiveReward = async (
  userId: string,
  reward: CosmeticReward
): Promise<boolean> => {
  const activeRewards = await getActiveRewards(userId);
  return activeRewards.some((r) => r.reward === reward);
};

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

const getAllChallenges = async (): Promise<Challenge[]> => {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEYS.CHALLENGES);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error getting all challenges:', error);
    return [];
  }
};

const getAllProgress = async (): Promise<ChallengeProgress[]> => {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEYS.PROGRESS);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error getting all progress:', error);
    return [];
  }
};

const updateProgress = async (progress: ChallengeProgress): Promise<void> => {
  try {
    const allProgress = await getAllProgress();
    const index = allProgress.findIndex(
      (p) => p.challengeId === progress.challengeId && p.userId === progress.userId
    );

    if (index !== -1) {
      allProgress[index] = progress;
    } else {
      allProgress.push(progress);
    }

    await AsyncStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(allProgress));
  } catch (error) {
    console.error('Error updating progress:', error);
  }
};

const activateReward = async (
  userId: string,
  reward: CosmeticReward
): Promise<void> => {
  try {
    const rewardsJson = await AsyncStorage.getItem(STORAGE_KEYS.REWARDS);
    const allRewards = rewardsJson ? JSON.parse(rewardsJson) : {};

    if (!allRewards[userId]) {
      allRewards[userId] = [];
    }

    const expiresAt = Date.now() + REWARD_DURATIONS[reward];
    allRewards[userId].push({ reward, expiresAt });

    await AsyncStorage.setItem(STORAGE_KEYS.REWARDS, JSON.stringify(allRewards));
  } catch (error) {
    console.error('Error activating reward:', error);
  }
};

/**
 * Get challenge type display info
 */
export const getChallengeTypeInfo = (type: ChallengeType) => {
  const info = {
    SEND_MESSAGES: {
      title: 'Message Master',
      description: 'Send 10 messages',
      icon: '💬',
      target: 10,
    },
    FIRST_MESSAGES: {
      title: 'Speed Champion',
      description: 'Be first to send 3 messages in new chats',
      icon: '🙋',
      target: 3,
    },
    VIEW_PPV: {
      title: 'Content Explorer',
      description: 'View 2 PPV media items',
      icon: '📸',
      target: 2,
    },
    JOIN_LIVE: {
      title: 'Live Enthusiast',
      description: 'Join 1 LIVE session',
      icon: '🔥',
      target: 1,
    },
    AI_SESSION: {
      title: 'AI Pioneer',
      description: 'Start 1 AI Companion session',
      icon: '🤖',
      target: 1,
    },
  };

  return info[type];
};

/**
 * Get reward display info
 */
export const getRewardInfo = (reward: CosmeticReward) => {
  const info = {
    GOLDEN_FRAME: {
      title: 'Golden Profile Frame',
      description: 'Exclusive golden border around your profile picture',
      icon: '👑',
      duration: '72 hours',
    },
    SPOTLIGHT_BADGE: {
      title: 'Profile Spotlight Badge',
      description: 'Stand out with a premium spotlight badge',
      icon: '⭐',
      duration: '48 hours',
    },
    SMARTMATCH_GLOW: {
      title: 'x2 SmartMatch Glow',
      description: 'Double glow animation in SmartMatch',
      icon: '✨',
      duration: '48 hours',
    },
    SUPERFAN_TITLE: {
      title: 'SuperFan Title',
      description: 'Premium "SuperFan" title tag',
      icon: '🏆',
      duration: '7 days',
    },
  };

  return info[reward];
};