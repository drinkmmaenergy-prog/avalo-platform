/**
 * Season Pass Service
 * 
 * Creator Seasons & Progression Pass - UI-only, AsyncStorage-based
 * 
 * RULES:
 * - NO free tokens
 * - NO discounts or financial benefits
 * - NO backend/API/Firestore
 * - NO push notifications
 * - AsyncStorage only
 * - Cosmetic rewards only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ========================================
// TYPES & INTERFACES
// ========================================

export type SeasonEventType = 
  | 'MESSAGE_SENT'
  | 'FIRST_MESSAGE'
  | 'PPV_UNLOCK'
  | 'LIVE_ENTRY'
  | 'AI_SESSION'
  | 'SUBSCRIPTION';

export interface SeasonEventPoints {
  MESSAGE_SENT: 2;
  FIRST_MESSAGE: 4;
  PPV_UNLOCK: 6;
  LIVE_ENTRY: 6;
  AI_SESSION: 8;
  SUBSCRIPTION: 20;
}

export const EVENT_POINTS: SeasonEventPoints = {
  MESSAGE_SENT: 2,
  FIRST_MESSAGE: 4,
  PPV_UNLOCK: 6,
  LIVE_ENTRY: 6,
  AI_SESSION: 8,
  SUBSCRIPTION: 20,
};

export interface TierReward {
  tier: number;
  requiredPoints: number;
  rewardName: string;
  rewardDuration: number; // hours
  rewardType: 'frame' | 'badge' | 'animation' | 'aura' | 'entrance';
}

export const TIER_REWARDS: TierReward[] = [
  {
    tier: 1,
    requiredPoints: 25,
    rewardName: 'Silver Spark Frame',
    rewardDuration: 48,
    rewardType: 'frame',
  },
  {
    tier: 2,
    requiredPoints: 60,
    rewardName: 'Gold Profile Frame',
    rewardDuration: 72,
    rewardType: 'frame',
  },
  {
    tier: 3,
    requiredPoints: 120,
    rewardName: 'Community VIP Badge',
    rewardDuration: 168, // 7 days
    rewardType: 'badge',
  },
  {
    tier: 4,
    requiredPoints: 220,
    rewardName: 'SuperFan Animation Aura',
    rewardDuration: 168, // 7 days
    rewardType: 'aura',
  },
  {
    tier: 5,
    requiredPoints: 350,
    rewardName: 'Royal Flame Entrance Animation',
    rewardDuration: 168, // 7 days
    rewardType: 'entrance',
  },
];

export interface SeasonConfig {
  name: string;
  description: string;
  heroBannerUrl?: string;
  customTiers?: TierReward[];
}

export interface Season {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  heroBannerUrl?: string;
  startDate: number; // timestamp
  endDate: number; // timestamp
  status: 'active' | 'completed' | 'expired';
  tiers: TierReward[];
  participantCount: number;
  createdAt: number;
}

export interface UserSeasonProgress {
  userId: string;
  creatorId: string;
  seasonId: string;
  totalPoints: number;
  currentTier: number;
  claimedTiers: number[];
  joinedAt: number;
  lastEventAt?: number;
  eventHistory: SeasonEvent[];
}

export interface SeasonEvent {
  type: SeasonEventType;
  points: number;
  timestamp: number;
}

export interface ClaimedReward {
  tier: number;
  rewardName: string;
  claimedAt: number;
  expiresAt: number;
  rewardType: string;
}

// ========================================
// STORAGE KEYS
// ========================================

const STORAGE_KEYS = {
  SEASONS_PREFIX: '@avalo_seasons_',
  USER_PROGRESS_PREFIX: '@avalo_season_progress_',
  CLAIMED_REWARDS_PREFIX: '@avalo_claimed_rewards_',
  CREATOR_SEASONS_INDEX: '@avalo_creator_seasons_index',
};

// ========================================
// HELPER FUNCTIONS
// ========================================

const generateSeasonId = (creatorId: string): string => {
  return `season_${creatorId}_${Date.now()}`;
};

const getSeasonStorageKey = (creatorId: string): string => {
  return `${STORAGE_KEYS.SEASONS_PREFIX}${creatorId}`;
};

const getUserProgressKey = (creatorId: string, userId: string): string => {
  return `${STORAGE_KEYS.USER_PROGRESS_PREFIX}${creatorId}_${userId}`;
};

const getClaimedRewardsKey = (userId: string): string => {
  return `${STORAGE_KEYS.CLAIMED_REWARDS_PREFIX}${userId}`;
};

const SEASON_DURATION_DAYS = 30;

// ========================================
// CORE FUNCTIONS
// ========================================

/**
 * Start a new season for a creator
 * Max 1 active season per creator
 */
export async function startSeason(
  creatorId: string,
  config: SeasonConfig
): Promise<Season> {
  try {
    // Check if creator already has an active season
    const existingSeason = await getSeason(creatorId);
    if (existingSeason && existingSeason.status === 'active') {
      throw new Error('Creator already has an active season');
    }

    const now = Date.now();
    const endDate = now + (SEASON_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const season: Season = {
      id: generateSeasonId(creatorId),
      creatorId,
      name: config.name,
      description: config.description,
      heroBannerUrl: config.heroBannerUrl,
      startDate: now,
      endDate,
      status: 'active',
      tiers: config.customTiers || TIER_REWARDS,
      participantCount: 0,
      createdAt: now,
    };

    // Save season
    const storageKey = getSeasonStorageKey(creatorId);
    await AsyncStorage.setItem(storageKey, JSON.stringify(season));

    // Update creator seasons index
    await updateCreatorSeasonsIndex(creatorId, season.id);

    return season;
  } catch (error) {
    console.error('Error starting season:', error);
    throw error;
  }
}

/**
 * Get current season for a creator
 */
export async function getSeason(creatorId: string): Promise<Season | null> {
  try {
    const storageKey = getSeasonStorageKey(creatorId);
    const data = await AsyncStorage.getItem(storageKey);
    
    if (!data) {
      return null;
    }

    const season: Season = JSON.parse(data);
    
    // Check if season is expired
    if (season.status === 'active' && Date.now() > season.endDate) {
      season.status = 'expired';
      await AsyncStorage.setItem(storageKey, JSON.stringify(season));
    }

    return season;
  } catch (error) {
    console.error('Error getting season:', error);
    return null;
  }
}

/**
 * Join a season as a user
 */
export async function joinSeason(
  creatorId: string,
  userId: string
): Promise<UserSeasonProgress> {
  try {
    const season = await getSeason(creatorId);
    
    if (!season) {
      throw new Error('No active season found for this creator');
    }

    if (season.status !== 'active') {
      throw new Error('Season is not active');
    }

    // Check if user already joined
    const existingProgress = await getUserProgress(creatorId, userId);
    if (existingProgress) {
      return existingProgress;
    }

    const progress: UserSeasonProgress = {
      userId,
      creatorId,
      seasonId: season.id,
      totalPoints: 0,
      currentTier: 0,
      claimedTiers: [],
      joinedAt: Date.now(),
      eventHistory: [],
    };

    // Save progress
    const progressKey = getUserProgressKey(creatorId, userId);
    await AsyncStorage.setItem(progressKey, JSON.stringify(progress));

    // Increment participant count
    season.participantCount += 1;
    const seasonKey = getSeasonStorageKey(creatorId);
    await AsyncStorage.setItem(seasonKey, JSON.stringify(season));

    return progress;
  } catch (error) {
    console.error('Error joining season:', error);
    throw error;
  }
}

/**
 * Register a season event and award points
 */
export async function registerSeasonEvent(
  creatorId: string,
  userId: string,
  eventType: SeasonEventType
): Promise<UserSeasonProgress | null> {
  try {
    const season = await getSeason(creatorId);
    
    if (!season || season.status !== 'active') {
      return null; // Silently fail if no active season
    }

    // Get or create user progress
    let progress = await getUserProgress(creatorId, userId);
    
    if (!progress) {
      // Auto-join if not already joined
      progress = await joinSeason(creatorId, userId);
    }

    // Award points
    const points = EVENT_POINTS[eventType];
    const event: SeasonEvent = {
      type: eventType,
      points,
      timestamp: Date.now(),
    };

    progress.totalPoints += points;
    progress.lastEventAt = event.timestamp;
    progress.eventHistory.push(event);

    // Update current tier
    const newTier = calculateCurrentTier(progress.totalPoints, season.tiers);
    progress.currentTier = newTier;

    // Save updated progress
    const progressKey = getUserProgressKey(creatorId, userId);
    await AsyncStorage.setItem(progressKey, JSON.stringify(progress));

    return progress;
  } catch (error) {
    console.error('Error registering season event:', error);
    return null;
  }
}

/**
 * Get user's progress in a season
 */
export async function getUserProgress(
  creatorId: string,
  userId: string
): Promise<UserSeasonProgress | null> {
  try {
    const progressKey = getUserProgressKey(creatorId, userId);
    const data = await AsyncStorage.getItem(progressKey);
    
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting user progress:', error);
    return null;
  }
}

/**
 * Claim a tier reward
 */
export async function claimTierReward(
  creatorId: string,
  userId: string,
  tier: number
): Promise<ClaimedReward> {
  try {
    const season = await getSeason(creatorId);
    
    if (!season) {
      throw new Error('Season not found');
    }

    const progress = await getUserProgress(creatorId, userId);
    
    if (!progress) {
      throw new Error('User not participating in season');
    }

    // Check if tier is unlocked
    if (progress.currentTier < tier) {
      throw new Error('Tier not unlocked yet');
    }

    // Check if already claimed
    if (progress.claimedTiers.includes(tier)) {
      throw new Error('Tier reward already claimed');
    }

    // Find tier reward
    const tierReward = season.tiers.find(t => t.tier === tier);
    
    if (!tierReward) {
      throw new Error('Invalid tier');
    }

    const now = Date.now();
    const expiresAt = now + (tierReward.rewardDuration * 60 * 60 * 1000);

    const claimedReward: ClaimedReward = {
      tier,
      rewardName: tierReward.rewardName,
      claimedAt: now,
      expiresAt,
      rewardType: tierReward.rewardType,
    };

    // Update progress
    progress.claimedTiers.push(tier);
    const progressKey = getUserProgressKey(creatorId, userId);
    await AsyncStorage.setItem(progressKey, JSON.stringify(progress));

    // Save claimed reward
    await saveClaimedReward(userId, claimedReward);

    return claimedReward;
  } catch (error) {
    console.error('Error claiming tier reward:', error);
    throw error;
  }
}

/**
 * Expire seasons if needed
 */
export async function expireSeasonsIfNeeded(): Promise<void> {
  try {
    // Get all creator seasons from index
    const indexData = await AsyncStorage.getItem(STORAGE_KEYS.CREATOR_SEASONS_INDEX);
    
    if (!indexData) {
      return;
    }

    const index: Record<string, string> = JSON.parse(indexData);
    const now = Date.now();

    for (const creatorId of Object.keys(index)) {
      const season = await getSeason(creatorId);
      
      if (season && season.status === 'active' && now > season.endDate) {
        season.status = 'expired';
        const storageKey = getSeasonStorageKey(creatorId);
        await AsyncStorage.setItem(storageKey, JSON.stringify(season));
      }
    }
  } catch (error) {
    console.error('Error expiring seasons:', error);
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Calculate current tier based on points
 */
function calculateCurrentTier(points: number, tiers: TierReward[]): number {
  let currentTier = 0;
  
  for (const tier of tiers) {
    if (points >= tier.requiredPoints) {
      currentTier = tier.tier;
    } else {
      break;
    }
  }

  return currentTier;
}

/**
 * Update creator seasons index
 */
async function updateCreatorSeasonsIndex(
  creatorId: string,
  seasonId: string
): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CREATOR_SEASONS_INDEX);
    const index: Record<string, string> = data ? JSON.parse(data) : {};
    
    index[creatorId] = seasonId;
    
    await AsyncStorage.setItem(
      STORAGE_KEYS.CREATOR_SEASONS_INDEX,
      JSON.stringify(index)
    );
  } catch (error) {
    console.error('Error updating creator seasons index:', error);
  }
}

/**
 * Save claimed reward
 */
async function saveClaimedReward(
  userId: string,
  reward: ClaimedReward
): Promise<void> {
  try {
    const key = getClaimedRewardsKey(userId);
    const data = await AsyncStorage.getItem(key);
    const rewards: ClaimedReward[] = data ? JSON.parse(data) : [];
    
    rewards.push(reward);
    
    await AsyncStorage.setItem(key, JSON.stringify(rewards));
  } catch (error) {
    console.error('Error saving claimed reward:', error);
  }
}

/**
 * Get all claimed rewards for a user
 */
export async function getClaimedRewards(userId: string): Promise<ClaimedReward[]> {
  try {
    const key = getClaimedRewardsKey(userId);
    const data = await AsyncStorage.getItem(key);
    
    if (!data) {
      return [];
    }

    const rewards: ClaimedReward[] = JSON.parse(data);
    const now = Date.now();

    // Filter out expired rewards
    const activeRewards = rewards.filter(r => r.expiresAt > now);

    return activeRewards;
  } catch (error) {
    console.error('Error getting claimed rewards:', error);
    return [];
  }
}

/**
 * Get next tier info
 */
export function getNextTierInfo(
  currentPoints: number,
  tiers: TierReward[]
): { nextTier: TierReward | null; pointsNeeded: number } {
  for (const tier of tiers) {
    if (currentPoints < tier.requiredPoints) {
      return {
        nextTier: tier,
        pointsNeeded: tier.requiredPoints - currentPoints,
      };
    }
  }

  return { nextTier: null, pointsNeeded: 0 };
}

/**
 * Calculate progress percentage to next tier
 */
export function calculateProgressPercentage(
  currentPoints: number,
  tiers: TierReward[]
): number {
  const nextTierInfo = getNextTierInfo(currentPoints, tiers);
  
  if (!nextTierInfo.nextTier) {
    return 100; // Max level reached
  }

  const previousTier = tiers.find(
    t => t.tier === nextTierInfo.nextTier!.tier - 1
  );
  
  const previousPoints = previousTier ? previousTier.requiredPoints : 0;
  const nextPoints = nextTierInfo.nextTier.requiredPoints;
  const range = nextPoints - previousPoints;
  const progress = currentPoints - previousPoints;

  return Math.min(100, Math.max(0, (progress / range) * 100));
}

/**
 * Get season stats
 */
export async function getSeasonStats(creatorId: string): Promise<{
  totalParticipants: number;
  completedTiers: Record<number, number>;
  totalPointsAwarded: number;
} | null> {
  try {
    const season = await getSeason(creatorId);
    
    if (!season) {
      return null;
    }

    // This would need to iterate through all user progress entries
    // For now, return basic stats from season object
    return {
      totalParticipants: season.participantCount,
      completedTiers: {},
      totalPointsAwarded: 0,
    };
  } catch (error) {
    console.error('Error getting season stats:', error);
    return null;
  }
}

/**
 * Get time remaining in season
 */
export function getTimeRemaining(season: Season): {
  days: number;
  hours: number;
  minutes: number;
} {
  const now = Date.now();
  const remaining = Math.max(0, season.endDate - now);
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  return { days, hours, minutes };
}

/**
 * Check if user can claim a tier
 */
export function canClaimTier(
  progress: UserSeasonProgress,
  tier: number
): boolean {
  return progress.currentTier >= tier && !progress.claimedTiers.includes(tier);
}

export default {
  startSeason,
  getSeason,
  joinSeason,
  registerSeasonEvent,
  getUserProgress,
  claimTierReward,
  expireSeasonsIfNeeded,
  getClaimedRewards,
  getNextTierInfo,
  calculateProgressPercentage,
  getSeasonStats,
  getTimeRemaining,
  canClaimTier,
  EVENT_POINTS,
  TIER_REWARDS,
};