/**
 * PACK 224: Dynamic Romantic Momentum Engine
 * 
 * Real-time "heat system" that adjusts visibility, matching priority, and profile reach
 * based on emotional + romantic activity. Rewards active romantic energy with natural
 * incentives to chat, call, and meet.
 * 
 * Key Features:
 * - Hidden momentum score (0-100) per user
 * - Action-based scoring (romantic behaviors, not farming)
 * - Visibility/reach rewards (no token giveaways)
 * - Abuse prevention (spam, fake calls, etc.)
 * - Integration with PACKs 221-223
 * - Royal tier 1.25x multiplier
 * - Influencer badge +10% gain boost
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type MomentumTrend = 'up' | 'stable' | 'down';

export type MomentumAction = 
  | 'paid_messages_20'
  | 'first_message_of_day'
  | 'voice_call_10min'
  | 'video_call'
  | 'meeting_verified'
  | 'event_participation'
  | 'event_hosting'
  | 'destiny_reward_claimed'
  | 'breakup_recovery_completed';

export type MomentumPenaltyAction =
  | 'inactivity_7days'
  | 'inactivity_14days'
  | 'message_streak_broken'
  | 'call_cancelled_late'
  | 'meeting_no_show'
  | 'safety_complaint_verified';

export type MomentumViolationType =
  | 'spam_messages'
  | 'fake_short_calls'
  | 'copy_paste_messages'
  | 'failed_meeting_selfie';

export interface RomanticMomentumState {
  userId: string;
  score: number; // 0-100
  trend: MomentumTrend;
  lastUpdate: Timestamp;
  lastActivityAt: Timestamp;
  
  // Tier bonuses
  hasRoyalTier: boolean;
  hasInfluencerBadge: boolean;
  
  // Tracking
  actionsToday: number;
  lastActionDate: string; // YYYY-MM-DD
  consecutiveDaysActive: number;
  
  // Abuse prevention
  violationCount: number;
  lastViolationAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MomentumActionLog {
  logId: string;
  userId: string;
  actionType: MomentumAction | MomentumPenaltyAction;
  momentumChange: number;
  scoreBefore: number;
  scoreAfter: number;
  
  metadata?: {
    chatId?: string;
    callId?: string;
    eventId?: string;
    messageCount?: number;
    callDuration?: number;
  };
  
  timestamp: Timestamp;
}

export interface MomentumViolation {
  violationId: string;
  userId: string;
  violationType: MomentumViolationType;
  severity: 'low' | 'medium' | 'high';
  
  details: {
    description: string;
    evidence?: Record<string, any>;
  };
  
  momentumPenalty: number;
  timestamp: Timestamp;
}

export interface MomentumBoostCache {
  userId: string;
  boostLevel: number; // 1.0 = no boost, higher = better
  visualIndicator: 'none' | 'soft' | 'neon' | 'pink' | 'peak';
  lastUpdate: Timestamp;
}

export interface MomentumVisualIndicator {
  userId: string;
  indicatorLevel: 'none' | 'soft_purple' | 'neon_purple' | 'pink_sparks' | 'peak_chemistry';
  description: string;
  updatedAt: Timestamp;
}

// ============================================================================
// CONSTANTS - MOMENTUM CHANGES
// ============================================================================

const MOMENTUM_GAINS: Record<MomentumAction, number> = {
  paid_messages_20: 12,
  first_message_of_day: 2,
  voice_call_10min: 8,
  video_call: 11,
  meeting_verified: 18,
  event_participation: 15,
  event_hosting: 25,
  destiny_reward_claimed: 4,
  breakup_recovery_completed: 6
};

const MOMENTUM_PENALTIES: Record<MomentumPenaltyAction, number> = {
  inactivity_7days: -10,
  inactivity_14days: -25,
  message_streak_broken: -2,
  call_cancelled_late: -3,
  meeting_no_show: -10,
  safety_complaint_verified: -40
};

// Tier multipliers
const ROYAL_TIER_MULTIPLIER = 1.25;
const INFLUENCER_BADGE_BONUS = 0.10; // +10% on gains

// Visual thresholds
const VISUAL_THRESHOLDS = {
  none: 0,
  soft_purple: 20,
  neon_purple: 50,
  pink_sparks: 70,
  peak_chemistry: 85
} as const;

// Matchmaking boost levels
const BOOST_LEVELS = {
  low: { min: 0, max: 19, multiplier: 1.0 },
  standard: { min: 20, max: 49, multiplier: 1.0 },
  good_match: { min: 50, max: 69, multiplier: 1.3 },
  trending: { min: 70, max: 84, multiplier: 1.6 },
  peak_chemistry: { min: 85, max: 100, multiplier: 2.0 }
} as const;

// ============================================================================
// CORE MOMENTUM MANAGEMENT
// ============================================================================

/**
 * Get or create user's romantic momentum state
 */
export async function getMomentumState(userId: string): Promise<RomanticMomentumState> {
  const stateRef = db.collection('romantic_momentum_states').doc(userId);
  const stateSnap = await stateRef.get();
  
  if (stateSnap.exists) {
    return stateSnap.data() as RomanticMomentumState;
  }
  
  // Check user's tier status
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  const newState: RomanticMomentumState = {
    userId,
    score: 20, // Start at standard visibility
    trend: 'stable',
    lastUpdate: serverTimestamp() as any,
    lastActivityAt: serverTimestamp() as any,
    hasRoyalTier: userData?.tier === 'royal' || false,
    hasInfluencerBadge: userData?.badges?.includes('influencer') || false,
    actionsToday: 0,
    lastActionDate: new Date().toISOString().split('T')[0],
    consecutiveDaysActive: 0,
    violationCount: 0,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await stateRef.set(newState);
  return newState;
}

/**
 * Track a momentum-gaining action
 */
export async function trackMomentumAction(
  userId: string,
  action: MomentumAction,
  metadata?: Record<string, any>
): Promise<{ scoreChange: number; newScore: number; trend: MomentumTrend }> {
  const state = await getMomentumState(userId);
  
  // Calculate base change
  let change = MOMENTUM_GAINS[action];
  
  // Apply Royal tier multiplier
  if (state.hasRoyalTier) {
    change = Math.round(change * ROYAL_TIER_MULTIPLIER);
  }
  
  // Apply Influencer badge bonus
  if (state.hasInfluencerBadge) {
    change = Math.round(change * (1 + INFLUENCER_BADGE_BONUS));
  }
  
  // Calculate new score (capped at 100)
  const oldScore = state.score;
  const newScore = Math.min(100, Math.max(0, state.score + change));
  
  // Determine trend
  const trend = calculateTrend(oldScore, newScore, state.trend);
  
  // Update today's action count
  const today = new Date().toISOString().split('T')[0];
  const isNewDay = state.lastActionDate !== today;
  const actionsToday = isNewDay ? 1 : state.actionsToday + 1;
  const consecutiveDays = isNewDay ? state.consecutiveDaysActive + 1 : state.consecutiveDaysActive;
  
  // Update state
  const stateRef = db.collection('romantic_momentum_states').doc(userId);
  await stateRef.update({
    score: newScore,
    trend,
    lastUpdate: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    actionsToday,
    lastActionDate: today,
    consecutiveDaysActive: consecutiveDays,
    updatedAt: serverTimestamp()
  });
  
  // Log action
  await logMomentumAction(userId, action, change, oldScore, newScore, metadata);
  
  // Update visual indicators and boost cache
  await updateVisualIndicators(userId, newScore);
  await updateBoostCache(userId, newScore, state.hasRoyalTier, state.hasInfluencerBadge);
  
  return { scoreChange: change, newScore, trend };
}

/**
 * Apply a momentum penalty (inactivity, violations, etc.)
 */
export async function applyMomentumPenalty(
  userId: string,
  penalty: MomentumPenaltyAction,
  metadata?: Record<string, any>
): Promise<{ scoreChange: number; newScore: number }> {
  const state = await getMomentumState(userId);
  
  const change = MOMENTUM_PENALTIES[penalty];
  const oldScore = state.score;
  const newScore = Math.min(100, Math.max(0, state.score + change));
  
  const trend = calculateTrend(oldScore, newScore, state.trend);
  
  const stateRef = db.collection('romantic_momentum_states').doc(userId);
  await stateRef.update({
    score: newScore,
    trend,
    lastUpdate: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  await logMomentumAction(userId, penalty, change, oldScore, newScore, metadata);
  await updateVisualIndicators(userId, newScore);
  await updateBoostCache(userId, newScore, state.hasRoyalTier, state.hasInfluencerBadge);
  
  return { scoreChange: change, newScore };
}

/**
 * Calculate momentum trend based on score changes
 */
function calculateTrend(oldScore: number, newScore: number, currentTrend: MomentumTrend): MomentumTrend {
  const diff = newScore - oldScore;
  
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

// ============================================================================
// ABUSE PREVENTION
// ============================================================================

/**
 * Detect and handle momentum abuse/farming
 */
export async function detectMomentumAbuse(
  userId: string,
  action: MomentumAction,
  metadata?: Record<string, any>
): Promise<boolean> {
  // Check for spam messages (copy/paste same message)
  if (action === 'paid_messages_20' && metadata?.messageTexts) {
    const texts = metadata.messageTexts as string[];
    const uniqueTexts = new Set(texts);
    
    if (uniqueTexts.size / texts.length < 0.3) {
      // More than 70% are duplicates
      await recordViolation(userId, 'copy_paste_messages', 'medium', {
        description: 'Detected copy/paste spam in messages',
        evidence: { uniqueRatio: uniqueTexts.size / texts.length }
      });
      return true;
    }
  }
  
  // Check for fake short calls (mutual farming)
  if ((action === 'voice_call_10min' || action === 'video_call') && metadata?.callDuration) {
    const duration = metadata.callDuration as number;
    
    // Check recent call pattern
    const recentCalls = await db.collection('momentum_actions_log')
      .where('userId', '==', userId)
      .where('actionType', 'in', ['voice_call_10min', 'video_call'])
      .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    
    if (recentCalls.docs.length > 10) {
      const avgDuration = recentCalls.docs.reduce((sum, doc) => 
        sum + (doc.data().metadata?.callDuration || 0), 0) / recentCalls.docs.length;
      
      if (avgDuration < 6 * 60) { // Average less than 6 minutes
        await recordViolation(userId, 'fake_short_calls', 'high', {
          description: 'Detected pattern of short calls for farming',
          evidence: { avgDuration, callCount: recentCalls.docs.length }
        });
        return true;
      }
    }
  }
  
  // Check for meeting no-shows with failed selfie verification
  if (action === 'meeting_verified' && metadata?.selfieMatch === false) {
    await recordViolation(userId, 'failed_meeting_selfie', 'high', {
      description: 'Meeting selfie verification failed',
      evidence: metadata
    });
    
    // Apply severe penalty
    await applyMomentumPenalty(userId, 'meeting_no_show');
    return true;
  }
  
  return false;
}

/**
 * Record a momentum violation
 */
async function recordViolation(
  userId: string,
  violationType: MomentumViolationType,
  severity: 'low' | 'medium' | 'high',
  details: { description: string; evidence?: Record<string, any> }
): Promise<void> {
  const violationId = generateId();
  
  const penalty = severity === 'high' ? -20 : severity === 'medium' ? -10 : -5;
  
  const violation: MomentumViolation = {
    violationId,
    userId,
    violationType,
    severity,
    details,
    momentumPenalty: penalty,
    timestamp: serverTimestamp() as any
  };
  
  await db.collection('momentum_violations').doc(violationId).set(violation);
  
  // Apply penalty to user's momentum
  const stateRef = db.collection('romantic_momentum_states').doc(userId);
  await stateRef.update({
    score: increment(penalty),
    violationCount: increment(1),
    lastViolationAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// VISUAL INDICATORS & BOOST CACHE
// ============================================================================

/**
 * Update user's visual momentum indicators
 */
async function updateVisualIndicators(userId: string, score: number): Promise<void> {
  let indicatorLevel: MomentumVisualIndicator['indicatorLevel'];
  let description: string;
  
  if (score >= VISUAL_THRESHOLDS.peak_chemistry) {
    indicatorLevel = 'peak_chemistry';
    description = 'Peak Chemistry - Maximum romantic momentum';
  } else if (score >= VISUAL_THRESHOLDS.pink_sparks) {
    indicatorLevel = 'pink_sparks';
    description = 'Trending - High romantic activity';
  } else if (score >= VISUAL_THRESHOLDS.neon_purple) {
    indicatorLevel = 'neon_purple';
    description = 'Active - Strong romantic energy';
  } else if (score >= VISUAL_THRESHOLDS.soft_purple) {
    indicatorLevel = 'soft_purple';
    description = 'Warming up - Building momentum';
  } else {
    indicatorLevel = 'none';
    description = 'Starting fresh';
  }
  
  const indicator: MomentumVisualIndicator = {
    userId,
    indicatorLevel,
    description,
    updatedAt: serverTimestamp() as any
  };
  
  await db.collection('momentum_visual_indicators').doc(userId).set(indicator);
}

/**
 * Update boost cache for matchmaking
 */
async function updateBoostCache(
  userId: string,
  score: number,
  hasRoyalTier: boolean,
  hasInfluencerBadge: boolean
): Promise<void> {
  // Determine boost level
  let boostMultiplier = 1.0;
  let visualIndicator: MomentumBoostCache['visualIndicator'] = 'none';
  
  for (const [level, config] of Object.entries(BOOST_LEVELS)) {
    if (score >= config.min && score <= config.max) {
      boostMultiplier = config.multiplier;
      
      if (level === 'peak_chemistry') visualIndicator = 'peak';
      else if (level === 'trending') visualIndicator = 'pink';
      else if (level === 'good_match') visualIndicator = 'neon';
      else if (level === 'standard') visualIndicator = 'soft';
      else visualIndicator = 'none';
      
      break;
    }
  }
  
  const cache: MomentumBoostCache = {
    userId,
    boostLevel: boostMultiplier,
    visualIndicator,
    lastUpdate: serverTimestamp() as any
  };
  
  await db.collection('momentum_boost_cache').doc(userId).set(cache);
}

// ============================================================================
// MATCHMAKING INTEGRATION
// ============================================================================

/**
 * Get momentum boost multiplier for matchmaking
 */
export async function getMomentumBoostMultiplier(userId: string): Promise<number> {
  const cacheDoc = await db.collection('momentum_boost_cache').doc(userId).get();
  
  if (!cacheDoc.exists) {
    return 1.0;
  }
  
  const cache = cacheDoc.data() as MomentumBoostCache;
  return cache.boostLevel;
}

/**
 * Get visual indicator for profile display
 */
export async function getMomentumVisualIndicator(userId: string): Promise<MomentumVisualIndicator | null> {
  const indicatorDoc = await db.collection('momentum_visual_indicators').doc(userId).get();
  
  if (!indicatorDoc.exists) {
    return null;
  }
  
  return indicatorDoc.data() as MomentumVisualIndicator;
}

// ============================================================================
// LOGGING & ANALYTICS
// ============================================================================

/**
 * Log a momentum action
 */
async function logMomentumAction(
  userId: string,
  actionType: MomentumAction | MomentumPenaltyAction,
  momentumChange: number,
  scoreBefore: number,
  scoreAfter: number,
  metadata?: Record<string, any>
): Promise<void> {
  const logId = generateId();
  
  const log: MomentumActionLog = {
    logId,
    userId,
    actionType,
    momentumChange,
    scoreBefore,
    scoreAfter,
    metadata,
    timestamp: serverTimestamp() as any
  };
  
  await db.collection('momentum_actions_log').doc(logId).set(log);
}

/**
 * Check for inactivity and apply penalties
 */
export async function checkInactivityPenalties(userId: string): Promise<void> {
  const state = await getMomentumState(userId);
  
  const now = Date.now();
  const lastActivity = state.lastActivityAt.toMillis();
  const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
  
  if (daysSinceActivity >= 14) {
    await applyMomentumPenalty(userId, 'inactivity_14days', {
      daysSinceActivity
    });
  } else if (daysSinceActivity >= 7) {
    await applyMomentumPenalty(userId, 'inactivity_7days', {
      daysSinceActivity
    });
  }
}

/**
 * Create daily momentum snapshot for analytics
 */
export async function createDailyMomentumSnapshot(): Promise<void> {
  const statesSnap = await db.collection('romantic_momentum_states').get();
  
  const date = new Date().toISOString().split('T')[0];
  const scores: number[] = [];
  
  for (const stateDoc of statesSnap.docs) {
    const state = stateDoc.data() as RomanticMomentumState;
    scores.push(state.score);
    
    // Create individual snapshot
    await db.collection('momentum_history').add({
      userId: state.userId,
      date,
      score: state.score,
      trend: state.trend,
      actionsToday: state.actionsToday,
      timestamp: serverTimestamp()
    });
  }
  
  // Create platform analytics
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];
  
  await db.collection('momentum_analytics').add({
    date,
    totalUsers: scores.length,
    avgScore: Math.round(avgScore),
    medianScore,
    distribution: {
      low: scores.filter(s => s < 20).length,
      standard: scores.filter(s => s >= 20 && s < 50).length,
      good: scores.filter(s => s >= 50 && s < 70).length,
      trending: scores.filter(s => s >= 70 && s < 85).length,
      peak: scores.filter(s => s >= 85).length
    },
    timestamp: serverTimestamp()
  });
}