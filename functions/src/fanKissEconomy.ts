/**
 * PACK 220 - Fan & Kiss Economy Engine
 * 
 * Converts token spending into romantic fan loyalty levels through milestone progression.
 * NO SUBSCRIPTIONS - fans maintain status through natural dating/chatting activity.
 * 
 * Core Principles:
 * - Milestone-based progression (Kiss Level 1-4, Eternal Fan)
 * - No cash back or free tokens
 * - Romance remains real, not transactional
 * - Fans get priority attention, not guaranteed affection
 * - System is gender-neutral
 */

import { db, serverTimestamp, increment, generateId } from './init.js';

// Simple error class for compatibility
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type KissLevel = 'NONE' | 'KISS_1' | 'KISS_2' | 'KISS_3' | 'KISS_4' | 'ETERNAL';

export interface FanMilestone {
  level: KissLevel;
  requiredTokens: number;
  displayName: string;
  badge: string;
}

export interface FanStatus {
  fanId: string;
  suitorId: string;  // The fan
  creatorId: string; // The person being supported
  currentLevel: KissLevel;
  totalTokensSpent: number;
  lastActivityAt: any; // Timestamp
  reachedLevels: {
    KISS_1?: any; // Timestamp when reached
    KISS_2?: any;
    KISS_3?: any;
    KISS_4?: any;
    ETERNAL?: any;
  };
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface FanRanking {
  creatorId: string;
  rankings: {
    eternalFans: string[];      // User IDs
    royalFans: string[];        // Kiss Level 4
    level3Fans: string[];       // Kiss Level 3
    level2Fans: string[];       // Kiss Level 2
    level1Fans: string[];       // Kiss Level 1
    observers: string[];        // Not fans yet
  };
  updatedAt: any; // Timestamp
}

export interface EmotionProgressionEvent {
  eventId: string;
  suitorId: string;
  creatorId: string;
  eventType: 'chemistry_rising' | 'shared_interests' | 'perfect_timing' | 'vibe_match';
  triggeredBy: 'chat' | 'call' | 'meeting' | 'milestone';
  metadata: any;
  createdAt: any; // Timestamp
}

export interface FanReward {
  rewardType: 'inbox_priority' | 'match_boost' | 'free_message_buffer' | 'charm_bonus' | 
              'romantic_phrases' | 'attraction_magnet' | 'profile_banner';
  level: KissLevel;
  active: boolean;
}

// ============================================================================
// CONSTANTS - THE ONLY TRUTH
// ============================================================================

export const FAN_MILESTONES: Record<KissLevel, FanMilestone> = {
  NONE: {
    level: 'NONE',
    requiredTokens: 0,
    displayName: 'Observer',
    badge: '👀'
  },
  KISS_1: {
    level: 'KISS_1',
    requiredTokens: 200,
    displayName: 'Kiss Level 1',
    badge: '💋'
  },
  KISS_2: {
    level: 'KISS_2',
    requiredTokens: 600,
    displayName: 'Kiss Level 2',
    badge: '💋💋'
  },
  KISS_3: {
    level: 'KISS_3',
    requiredTokens: 1200,
    displayName: 'Kiss Level 3',
    badge: '💋💋💋'
  },
  KISS_4: {
    level: 'KISS_4',
    requiredTokens: 2500,
    displayName: 'Royal Fan',
    badge: '👑💋'
  },
  ETERNAL: {
    level: 'ETERNAL',
    requiredTokens: 5000,
    displayName: 'Eternal Fan',
    badge: '♾️💋'
  }
};

// ============================================================================
// CORE FUNCTION: trackTokenSpend
// ============================================================================

/**
 * Track tokens spent by a suitor on a creator for fan milestone progression.
 * This is called after successful chat/call/meeting payments.
 * 
 * IMPORTANT: This is cumulative tracking - adds to total, checks for level ups.
 * 
 * @param suitorId - The fan/payer
 * @param creatorId - The earner
 * @param tokensSpent - Amount of tokens spent in this transaction
 * @param source - Where tokens were spent ('chat' | 'call' | 'meeting' | 'event')
 */
export async function trackTokenSpend(
  suitorId: string,
  creatorId: string,
  tokensSpent: number,
  source: 'chat' | 'call' | 'meeting' | 'event'
): Promise<{ 
  newLevel?: KissLevel; 
  previousLevel: KissLevel;
  totalTokens: number;
  leveledUp: boolean;
}> {
  
  // Don't track if spending on self (shouldn't happen, but safety check)
  if (suitorId === creatorId) {
    return {
      previousLevel: 'NONE',
      totalTokens: 0,
      leveledUp: false
    };
  }

  const fanId = `${suitorId}_${creatorId}`;
  const fanRef = db.collection('fan_status').doc(fanId);
  
  let result: {
    newLevel?: KissLevel;
    previousLevel: KissLevel;
    totalTokens: number;
    leveledUp: boolean;
  } = {
    previousLevel: 'NONE',
    totalTokens: tokensSpent,
    leveledUp: false
  };

  await db.runTransaction(async (transaction) => {
    const fanSnap = await transaction.get(fanRef);
    
    if (!fanSnap.exists) {
      // Create new fan status
      const newTotal = tokensSpent;
      const newLevel = calculateFanLevel(newTotal);
      
      const fanStatus: Partial<FanStatus> = {
        fanId,
        suitorId,
        creatorId,
        currentLevel: newLevel,
        totalTokensSpent: newTotal,
        lastActivityAt: serverTimestamp(),
        reachedLevels: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Mark reached levels
      if (newLevel !== 'NONE') {
        fanStatus.reachedLevels![newLevel] = serverTimestamp();
        result.leveledUp = true;
        result.newLevel = newLevel;
      }
      
      transaction.set(fanRef, fanStatus);
      result.previousLevel = 'NONE';
      result.totalTokens = newTotal;
      
      // Log milestone achievement
      if (newLevel !== 'NONE') {
        await logMilestoneAchievement(suitorId, creatorId, newLevel, newTotal, source);
      }
      
    } else {
      // Update existing fan status
      const fanData = fanSnap.data() as FanStatus;
      const previousLevel = fanData.currentLevel;
      const newTotal = (fanData.totalTokensSpent || 0) + tokensSpent;
      const newLevel = calculateFanLevel(newTotal);
      
      const updates: any = {
        totalTokensSpent: newTotal,
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Check if leveled up
      if (newLevel !== previousLevel) {
        updates.currentLevel = newLevel;
        updates[`reachedLevels.${newLevel}`] = serverTimestamp();
        result.leveledUp = true;
        result.newLevel = newLevel;
        
        // Log milestone achievement
        await logMilestoneAchievement(suitorId, creatorId, newLevel, newTotal, source);
        
        // Trigger emotional progression event
        await triggerEmotionEvent(suitorId, creatorId, 'chemistry_rising', 'milestone', {
          newLevel,
          previousLevel,
          totalTokens: newTotal
        });
      }
      
      transaction.update(fanRef, updates);
      result.previousLevel = previousLevel;
      result.totalTokens = newTotal;
    }
  });
  
  // Update fan rankings asynchronously (non-blocking)
  updateFanRankingsAsync(creatorId).catch(err => 
    logger.error('Failed to update fan rankings:', err)
  );
  
  return result;
}

/**
 * Calculate fan level based on total tokens spent
 */
function calculateFanLevel(totalTokens: number): KissLevel {
  if (totalTokens >= FAN_MILESTONES.ETERNAL.requiredTokens) return 'ETERNAL';
  if (totalTokens >= FAN_MILESTONES.KISS_4.requiredTokens) return 'KISS_4';
  if (totalTokens >= FAN_MILESTONES.KISS_3.requiredTokens) return 'KISS_3';
  if (totalTokens >= FAN_MILESTONES.KISS_2.requiredTokens) return 'KISS_2';
  if (totalTokens >= FAN_MILESTONES.KISS_1.requiredTokens) return 'KISS_1';
  return 'NONE';
}

/**
 * Log milestone achievement for analytics
 */
async function logMilestoneAchievement(
  suitorId: string,
  creatorId: string,
  level: KissLevel,
  totalTokens: number,
  source: string
): Promise<void> {
  const logRef = db.collection('fan_milestone_logs').doc(generateId());
  await logRef.set({
    suitorId,
    creatorId,
    level,
    totalTokens,
    source,
    milestone: FAN_MILESTONES[level],
    createdAt: serverTimestamp()
  });
  
  logger.info(`Fan milestone achieved: ${suitorId} → ${creatorId} reached ${level} (${totalTokens} tokens)`);
}

// ============================================================================
// FAN RANKINGS
// ============================================================================

/**
 * Update fan rankings for a creator
 * This organizes all fans by their level for the creator's view
 */
export async function updateFanRankings(creatorId: string): Promise<void> {
  // Get all fans for this creator
  const fansSnap = await db.collection('fan_status')
    .where('creatorId', '==', creatorId)
    .get();
  
  const rankings: FanRanking['rankings'] = {
    eternalFans: [],
    royalFans: [],
    level3Fans: [],
    level2Fans: [],
    level1Fans: [],
    observers: []
  };
  
  fansSnap.docs.forEach(doc => {
    const fan = doc.data() as FanStatus;
    const suitorId = fan.suitorId;
    
    switch (fan.currentLevel) {
      case 'ETERNAL':
        rankings.eternalFans.push(suitorId);
        break;
      case 'KISS_4':
        rankings.royalFans.push(suitorId);
        break;
      case 'KISS_3':
        rankings.level3Fans.push(suitorId);
        break;
      case 'KISS_2':
        rankings.level2Fans.push(suitorId);
        break;
      case 'KISS_1':
        rankings.level1Fans.push(suitorId);
        break;
      default:
        rankings.observers.push(suitorId);
    }
  });
  
  // Sort within each tier by total tokens (highest first)
  const sortByTokens = async (userIds: string[]) => {
    const fanPromises = userIds.map(async (uid) => {
      const fanDoc = await db.collection('fan_status')
        .doc(`${uid}_${creatorId}`)
        .get();
      return {
        userId: uid,
        tokens: (fanDoc.data() as FanStatus)?.totalTokensSpent || 0
      };
    });
    const fansWithTokens = await Promise.all(fanPromises);
    return fansWithTokens
      .sort((a, b) => b.tokens - a.tokens)
      .map(f => f.userId);
  };
  
  rankings.eternalFans = await sortByTokens(rankings.eternalFans);
  rankings.royalFans = await sortByTokens(rankings.royalFans);
  rankings.level3Fans = await sortByTokens(rankings.level3Fans);
  rankings.level2Fans = await sortByTokens(rankings.level2Fans);
  rankings.level1Fans = await sortByTokens(rankings.level1Fans);
  
  // Save rankings
  const rankingRef = db.collection('fan_rankings').doc(creatorId);
  await rankingRef.set({
    creatorId,
    rankings,
    updatedAt: serverTimestamp()
  });
}

/**
 * Async wrapper for updating fan rankings (non-blocking)
 */
async function updateFanRankingsAsync(creatorId: string): Promise<void> {
  try {
    await updateFanRankings(creatorId);
  } catch (error) {
    logger.error(`Failed to update fan rankings for ${creatorId}:`, error);
  }
}

/**
 * Get fan rankings for a creator (for their view)
 */
export async function getFanRankings(creatorId: string): Promise<FanRanking | null> {
  const rankingSnap = await db.collection('fan_rankings').doc(creatorId).get();
  
  if (!rankingSnap.exists) {
    return null;
  }
  
  return rankingSnap.data() as FanRanking;
}

// ============================================================================
// EMOTIONAL PROGRESSION EVENTS
// ============================================================================

/**
 * Trigger an emotional progression event
 * These are lightweight romantic triggers that unlock profile highlights and re-engagement
 */
export async function triggerEmotionEvent(
  suitorId: string,
  creatorId: string,
  eventType: EmotionProgressionEvent['eventType'],
  triggeredBy: EmotionProgressionEvent['triggeredBy'],
  metadata: any
): Promise<void> {
  const eventId = generateId();
  const eventRef = db.collection('emotion_progression_events').doc(eventId);
  
  await eventRef.set({
    eventId,
    suitorId,
    creatorId,
    eventType,
    triggeredBy,
    metadata,
    createdAt: serverTimestamp()
  });
  
  logger.info(`Emotion event triggered: ${eventType} for ${suitorId} → ${creatorId}`);
}

/**
 * Get recent emotion events for a relationship
 */
export async function getRecentEmotionEvents(
  suitorId: string,
  creatorId: string,
  limit: number = 10
): Promise<EmotionProgressionEvent[]> {
  const eventsSnap = await db.collection('emotion_progression_events')
    .where('suitorId', '==', suitorId)
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return eventsSnap.docs.map(doc => doc.data() as EmotionProgressionEvent);
}

// ============================================================================
// FAN STATUS QUERIES
// ============================================================================

/**
 * Get fan status between two users
 */
export async function getFanStatus(
  suitorId: string,
  creatorId: string
): Promise<FanStatus | null> {
  const fanId = `${suitorId}_${creatorId}`;
  const fanSnap = await db.collection('fan_status').doc(fanId).get();
  
  if (!fanSnap.exists) {
    return null;
  }
  
  return fanSnap.data() as FanStatus;
}

/**
 * Check if user is a fan of creator at minimum level
 */
export async function isFanOfLevel(
  suitorId: string,
  creatorId: string,
  minLevel: KissLevel
): Promise<boolean> {
  const fanStatus = await getFanStatus(suitorId, creatorId);
  
  if (!fanStatus) return false;
  
  const levelOrder: KissLevel[] = ['NONE', 'KISS_1', 'KISS_2', 'KISS_3', 'KISS_4', 'ETERNAL'];
  const currentIndex = levelOrder.indexOf(fanStatus.currentLevel);
  const minIndex = levelOrder.indexOf(minLevel);
  
  return currentIndex >= minIndex;
}

/**
 * Get all fans of a creator
 */
export async function getCreatorFans(
  creatorId: string,
  minLevel?: KissLevel
): Promise<FanStatus[]> {
  let query = db.collection('fan_status')
    .where('creatorId', '==', creatorId);
  
  if (minLevel && minLevel !== 'NONE') {
    // Filter by level (need to handle this differently as we can't do >= on strings)
    const allFans = await query.get();
    const levelOrder: KissLevel[] = ['NONE', 'KISS_1', 'KISS_2', 'KISS_3', 'KISS_4', 'ETERNAL'];
    const minIndex = levelOrder.indexOf(minLevel);
    
    return allFans.docs
      .map(doc => doc.data() as FanStatus)
      .filter(fan => {
        const currentIndex = levelOrder.indexOf(fan.currentLevel);
        return currentIndex >= minIndex;
      });
  }
  
  const fansSnap = await query.get();
  return fansSnap.docs.map(doc => doc.data() as FanStatus);
}

/**
 * Get user's fan relationships (who they are a fan of)
 */
export async function getUserFanships(
  suitorId: string,
  minLevel?: KissLevel
): Promise<FanStatus[]> {
  let query = db.collection('fan_status')
    .where('suitorId', '==', suitorId);
  
  const fansSnap = await query.get();
  let fanships = fansSnap.docs.map(doc => doc.data() as FanStatus);
  
  if (minLevel && minLevel !== 'NONE') {
    const levelOrder: KissLevel[] = ['NONE', 'KISS_1', 'KISS_2', 'KISS_3', 'KISS_4', 'ETERNAL'];
    const minIndex = levelOrder.indexOf(minLevel);
    
    fanships = fanships.filter(fan => {
      const currentIndex = levelOrder.indexOf(fan.currentLevel);
      return currentIndex >= minIndex;
    });
  }
  
  return fanships;
}

// ============================================================================
// FAN REWARDS (Read-Only Logic - UX implements these)
// ============================================================================

/**
 * Get available rewards for a fan level
 * These are informational - actual reward application happens in UX/algorithms
 */
export function getFanRewards(level: KissLevel): FanReward[] {
  const rewards: FanReward[] = [];
  
  switch (level) {
    case 'ETERNAL':
      rewards.push({ rewardType: 'profile_banner', level: 'ETERNAL', active: true });
      // Fall through to include all lower rewards
    case 'KISS_4':
      rewards.push({ rewardType: 'attraction_magnet', level: 'KISS_4', active: true });
      // Fall through
    case 'KISS_3':
      rewards.push({ rewardType: 'romantic_phrases', level: 'KISS_3', active: true });
      // Fall through
    case 'KISS_2':
      rewards.push({ rewardType: 'charm_bonus', level: 'KISS_2', active: true });
      // Fall through
    case 'KISS_1':
      rewards.push({ rewardType: 'inbox_priority', level: 'KISS_1', active: true });
      rewards.push({ rewardType: 'match_boost', level: 'KISS_1', active: true });
      rewards.push({ rewardType: 'free_message_buffer', level: 'KISS_1', active: true });
      break;
    default:
      // No rewards for NONE level
      break;
  }
  
  return rewards;
}

/**
 * Check if fan has specific reward
 */
export async function hasFanReward(
  suitorId: string,
  creatorId: string,
  rewardType: FanReward['rewardType']
): Promise<boolean> {
  const fanStatus = await getFanStatus(suitorId, creatorId);
  
  if (!fanStatus || fanStatus.currentLevel === 'NONE') {
    return false;
  }
  
  const rewards = getFanRewards(fanStatus.currentLevel);
  return rewards.some(r => r.rewardType === rewardType && r.active);
}

// ============================================================================
// ANALYTICS & STATS
// ============================================================================

/**
 * Get fan statistics for a creator
 */
export async function getCreatorFanStats(creatorId: string): Promise<{
  totalFans: number;
  eternalFans: number;
  royalFans: number;
  level3Fans: number;
  level2Fans: number;
  level1Fans: number;
  totalTokensReceived: number;
}> {
  const fans = await getCreatorFans(creatorId);
  
  const stats = {
    totalFans: fans.length,
    eternalFans: fans.filter(f => f.currentLevel === 'ETERNAL').length,
    royalFans: fans.filter(f => f.currentLevel === 'KISS_4').length,
    level3Fans: fans.filter(f => f.currentLevel === 'KISS_3').length,
    level2Fans: fans.filter(f => f.currentLevel === 'KISS_2').length,
    level1Fans: fans.filter(f => f.currentLevel === 'KISS_1').length,
    totalTokensReceived: fans.reduce((sum, f) => sum + (f.totalTokensSpent || 0), 0)
  };
  
  return stats;
}

/**
 * Get user's fanship statistics (who they support)
 */
export async function getUserFanshipStats(suitorId: string): Promise<{
  totalCreatorsSupported: number;
  eternalFanships: number;
  royalFanships: number;
  totalTokensSpent: number;
}> {
  const fanships = await getUserFanships(suitorId);
  
  return {
    totalCreatorsSupported: fanships.length,
    eternalFanships: fanships.filter(f => f.currentLevel === 'ETERNAL').length,
    royalFanships: fanships.filter(f => f.currentLevel === 'KISS_4').length,
    totalTokensSpent: fanships.reduce((sum, f) => sum + (f.totalTokensSpent || 0), 0)
  };
}