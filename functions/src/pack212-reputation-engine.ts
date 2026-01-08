/**
 * PACK 212: Soft Reputation Engine
 * Core calculation and management logic for reputation scoring
 * 
 * EXTENSION MODULE - Does not replace existing logic
 * Reputation is INTERNAL ONLY - never exposed to users
 */

import * as admin from 'firebase-admin';
import {
  UserReputation,
  ReputationEvent,
  ReputationEventType,
  ReputationLevel,
  ReputationAdjustment,
  UpdateReputationRequest,
  UpdateReputationResponse,
  GetReputationHintRequest,
  GetReputationHintResponse,
  GetRankingMultiplierRequest,
  GetRankingMultiplierResponse,
  REPUTATION_THRESHOLDS,
  REPUTATION_SCORE_WEIGHTS,
  REPUTATION_SCORE_MIN,
  REPUTATION_SCORE_MAX,
  REPUTATION_SCORE_DEFAULT,
  POSITIVE_REPUTATION_MESSAGES,
  getReputationMultipliers,
  calculateEffectiveRiskScore,
} from './pack212-reputation-types';

const db = admin.firestore();

// ============================================================================
// REPUTATION INITIALIZATION
// ============================================================================

/**
 * Initialize reputation profile for new user
 */
export async function initializeUserReputation(
  userId: string
): Promise<UserReputation> {
  const profileRef = db.collection('user_reputation').doc(userId);
  const existing = await profileRef.get();

  if (existing.exists) {
    return existing.data() as UserReputation;
  }

  const newProfile: UserReputation = {
    userId,
    reputationScore: REPUTATION_SCORE_DEFAULT,
    
    // Positive counters
    chatConsistency: 0,
    qualityConversations: 0,
    positiveFeedbackCount: 0,
    meetingsAttended: 0,
    meetingsNoShow: 0,
    positiveVibeRatings: 0,
    eventsAttended: 0,
    goodGuestRatings: 0,
    voluntaryRefundsGiven: 0,
    
    // Negative counters
    harassmentReports: 0,
    lastMinuteCancellations: 0,
    appearanceComplaints: 0,
    blockedByOthersCount: 0,
    systemAbuseAttempts: 0,
    
    // Engagement
    totalChatsStarted: 0,
    totalChatsResponded: 0,
    averageResponseTime: 0,
    repeatPayerCount: 0,
    
    // Status
    activeBoost: false,
    activeLimiter: false,
    boostLevel: 'NONE',
    limiterLevel: 'NONE',
    
    // Tracking
    lastUpdated: admin.firestore.Timestamp.now(),
    lastPositiveEvent: null,
    lastNegativeEvent: null,
    createdAt: admin.firestore.Timestamp.now(),
  };

  await profileRef.set(newProfile);
  return newProfile;
}

/**
 * Get user's reputation profile
 */
export async function getUserReputation(userId: string): Promise<UserReputation | null> {
  const doc = await db.collection('user_reputation').doc(userId).get();
  return doc.exists ? (doc.data() as UserReputation) : null;
}

// ============================================================================
// REPUTATION SCORE UPDATES
// ============================================================================

/**
 * Update user's reputation score based on event
 */
export async function updateReputationScore(
  request: UpdateReputationRequest
): Promise<UpdateReputationResponse> {
  const { userId, eventType, relatedUserId, contextId, metadata } = request;
  
  try {
    const profileRef = db.collection('user_reputation').doc(userId);
    
    return await db.runTransaction(async (transaction) => {
      const profileDoc = await transaction.get(profileRef);
      
      // Initialize if doesn't exist
      let profile: UserReputation;
      if (!profileDoc.exists) {
        profile = await initializeUserReputation(userId);
      } else {
        profile = profileDoc.data() as UserReputation;
      }

      const previousScore = profile.reputationScore;
      const scoreDelta = REPUTATION_SCORE_WEIGHTS[eventType] || 0;
      const newScore = Math.max(
        REPUTATION_SCORE_MIN,
        Math.min(REPUTATION_SCORE_MAX, previousScore + scoreDelta)
      );

      const previousLevel = getReputationLevel(previousScore);
      const newLevel = getReputationLevel(newScore);
      const adjustmentChanged = previousLevel !== newLevel;

      // Update counters based on event type
      const updates: Partial<UserReputation> = {
        reputationScore: newScore,
        lastUpdated: admin.firestore.Timestamp.now(),
      };

      // Update specific counters
      if (eventType === 'CHAT_RESPONSE_TIMELY') {
        updates.chatConsistency = (profile.chatConsistency || 0) + 1;
        updates.totalChatsResponded = (profile.totalChatsResponded || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'CHAT_QUALITY_HIGH') {
        updates.qualityConversations = (profile.qualityConversations || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'POSITIVE_FEEDBACK_RECEIVED') {
        updates.positiveFeedbackCount = (profile.positiveFeedbackCount || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'MEETING_ATTENDED') {
        updates.meetingsAttended = (profile.meetingsAttended || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'POSITIVE_VIBE_RATING') {
        updates.positiveVibeRatings = (profile.positiveVibeRatings || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'EVENT_ATTENDED') {
        updates.eventsAttended = (profile.eventsAttended || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'GOOD_GUEST_RATING') {
        updates.goodGuestRatings = (profile.goodGuestRatings || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'VOLUNTARY_REFUND_GIVEN') {
        updates.voluntaryRefundsGiven = (profile.voluntaryRefundsGiven || 0) + 1;
        updates.lastPositiveEvent = admin.firestore.Timestamp.now();
      }
      // Negative events
      else if (eventType === 'HARASSMENT_REPORT_VERIFIED') {
        updates.harassmentReports = (profile.harassmentReports || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'MEETING_NO_SHOW') {
        updates.meetingsNoShow = (profile.meetingsNoShow || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'LAST_MINUTE_CANCEL') {
        updates.lastMinuteCancellations = (profile.lastMinuteCancellations || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'APPEARANCE_COMPLAINT') {
        updates.appearanceComplaints = (profile.appearanceComplaints || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'BLOCKED_BY_USER') {
        updates.blockedByOthersCount = (profile.blockedByOthersCount || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      } else if (eventType === 'SYSTEM_ABUSE_DETECTED' || eventType === 'SPAM_MESSAGES' || eventType === 'CHARGEBACK_ABUSE') {
        updates.systemAbuseAttempts = (profile.systemAbuseAttempts || 0) + 1;
        updates.lastNegativeEvent = admin.firestore.Timestamp.now();
      }

      transaction.update(profileRef, updates);

      // Log the event
      const eventId = db.collection('reputation_events').doc().id;
      const reputationEvent: ReputationEvent = {
        eventId,
        userId,
        eventType,
        scoreImpact: scoreDelta,
        previousScore,
        newScore,
        relatedUserId,
        description: getEventDescription(eventType, scoreDelta),
        metadata: {
          ...metadata,
          contextId,
        },
        createdAt: admin.firestore.Timestamp.now(),
        processed: true,
      };
      
      transaction.set(
        db.collection('reputation_events').doc(eventId),
        reputationEvent
      );

      // Update adjustments if level changed
      if (adjustmentChanged) {
        await updateReputationAdjustments(userId, newScore, newLevel, transaction);
      }

      return {
        success: true,
        previousScore,
        newScore,
        scoreDelta,
        level: newLevel,
        adjustmentChanged,
      };
    });
  } catch (error) {
    console.error('Error updating reputation score:', error);
    return {
      success: false,
      previousScore: 0,
      newScore: 0,
      scoreDelta: 0,
      level: 'NEUTRAL',
      adjustmentChanged: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get reputation level from score
 */
export function getReputationLevel(score: number): ReputationLevel {
  if (score >= REPUTATION_THRESHOLDS.EXCELLENT) return 'EXCELLENT';
  if (score >= REPUTATION_THRESHOLDS.GOOD) return 'GOOD';
  if (score >= REPUTATION_THRESHOLDS.NEUTRAL) return 'NEUTRAL';
  if (score >= REPUTATION_THRESHOLDS.POOR) return 'POOR';
  return 'CRITICAL';
}

/**
 * Get event description for logging
 */
function getEventDescription(eventType: ReputationEventType, delta: number): string {
  const direction = delta > 0 ? 'increased' : 'decreased';
  const amount = Math.abs(delta);
  return `Reputation ${direction} by ${amount} due to ${eventType}`;
}

// ============================================================================
// REPUTATION ADJUSTMENTS (BOOST/LIMITER)
// ============================================================================

/**
 * Update reputation adjustments based on new score
 */
async function updateReputationAdjustments(
  userId: string,
  score: number,
  level: ReputationLevel,
  transaction: admin.firestore.Transaction
): Promise<void> {
  const multipliers = getReputationMultipliers(score);
  const now = admin.firestore.Timestamp.now();
  
  // Determine adjustment type and level
  let adjustmentType: 'BOOST' | 'LIMITER' | null = null;
  let adjustmentLevel: 'MINOR' | 'MODERATE' | 'MAJOR' = 'MINOR';
  
  if (level === 'EXCELLENT') {
    adjustmentType = 'BOOST';
    adjustmentLevel = 'MAJOR';
  } else if (level === 'GOOD') {
    adjustmentType = 'BOOST';
    adjustmentLevel = 'MODERATE';
  } else if (level === 'POOR') {
    adjustmentType = 'LIMITER';
    adjustmentLevel = 'MINOR';
  } else if (level === 'CRITICAL') {
    adjustmentType = 'LIMITER';
    adjustmentLevel = 'MAJOR';
  }

  if (!adjustmentType) {
    // Neutral - deactivate any existing adjustments
    const existingAdjustments = await db
      .collection('reputation_adjustments')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();
    
    existingAdjustments.docs.forEach(doc => {
      transaction.update(doc.ref, { active: false });
    });
    
    // Update user profile
    transaction.update(db.collection('user_reputation').doc(userId), {
      activeBoost: false,
      activeLimiter: false,
      boostLevel: 'NONE',
      limiterLevel: 'NONE',
    });
    
    return;
  }

  // Create or update adjustment
  const adjustmentId = db.collection('reputation_adjustments').doc().id;
  const adjustment: ReputationAdjustment = {
    adjustmentId,
    userId,
    adjustmentType,
    level: adjustmentLevel,
    discoveryRankMultiplier: multipliers.discoveryRank,
    feedVisibilityMultiplier: multipliers.feedVisibility,
    suggestionPriorityMultiplier: multipliers.suggestionPriority,
    appliesTo: ['DISCOVERY', 'FEED', 'SUGGESTIONS', 'CHEMISTRY', 'PASSPORT'],
    active: true,
    startedAt: now,
    expiresAt: null, // Permanent until score changes
    triggerScore: score,
    reason: `Reputation level: ${level}`,
    createdAt: now,
    updatedAt: now,
  };

  // Deactivate old adjustments
  const existingAdjustments = await db
    .collection('reputation_adjustments')
    .where('userId', '==', userId)
    .where('active', '==', true)
    .get();
  
  existingAdjustments.docs.forEach(doc => {
    transaction.update(doc.ref, { active: false });
  });

  // Create new adjustment
  transaction.set(
    db.collection('reputation_adjustments').doc(adjustmentId),
    adjustment
  );

  // Update user profile
  transaction.update(db.collection('user_reputation').doc(userId), {
    activeBoost: adjustmentType === 'BOOST',
    activeLimiter: adjustmentType === 'LIMITER',
    boostLevel: adjustmentType === 'BOOST' ? adjustmentLevel : 'NONE',
    limiterLevel: adjustmentType === 'LIMITER' ? adjustmentLevel : 'NONE',
  });
}

// ============================================================================
// RANKING MULTIPLIERS
// ============================================================================

/**
 * Get ranking multiplier for user in specific context
 */
export async function getRankingMultiplier(
  request: GetRankingMultiplierRequest
): Promise<GetRankingMultiplierResponse> {
  const { userId, context } = request;
  
  try {
    const profile = await getUserReputation(userId);
    
    if (!profile) {
      // No profile = neutral
      return {
        userId,
        multiplier: 1.0,
        level: 'NEUTRAL',
        hasBoost: false,
        hasLimiter: false,
      };
    }

    const level = getReputationLevel(profile.reputationScore);
    const multipliers = getReputationMultipliers(profile.reputationScore);
    
    // Select appropriate multiplier based on context
    let multiplier = 1.0;
    switch (context) {
      case 'DISCOVERY':
        multiplier = multipliers.discoveryRank;
        break;
      case 'FEED':
        multiplier = multipliers.feedVisibility;
        break;
      case 'SUGGESTIONS':
      case 'CHEMISTRY':
      case 'PASSPORT':
        multiplier = multipliers.suggestionPriority;
        break;
    }

    return {
      userId,
      multiplier,
      level,
      hasBoost: profile.activeBoost,
      hasLimiter: profile.activeLimiter,
    };
  } catch (error) {
    console.error('Error getting ranking multiplier:', error);
    return {
      userId,
      multiplier: 1.0,
      level: 'NEUTRAL',
      hasBoost: false,
      hasLimiter: false,
    };
  }
}

/**
 * Get active reputation adjustments for user
 */
export async function getActiveAdjustments(userId: string): Promise<ReputationAdjustment[]> {
  const snapshot = await db
    .collection('reputation_adjustments')
    .where('userId', '==', userId)
    .where('active', '==', true)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ReputationAdjustment);
}

// ============================================================================
// USER-FACING HINTS (POSITIVE ONLY)
// ============================================================================

/**
 * Get positive reputation hint for user (NEVER show negative)
 */
export async function getReputationHint(
  request: GetReputationHintRequest
): Promise<GetReputationHintResponse> {
  const { userId } = request;
  
  try {
    const profile = await getUserReputation(userId);
    
    if (!profile) {
      return { hasHint: false };
    }

    const level = getReputationLevel(profile.reputationScore);
    
    // Only show hints for GOOD and EXCELLENT
    if (level !== 'GOOD' && level !== 'EXCELLENT') {
      return { hasHint: false };
    }

    const messages = POSITIVE_REPUTATION_MESSAGES[level];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    return {
      hasHint: true,
      message: randomMessage,
      positiveStats: {
        interactions: profile.qualityConversations + profile.positiveFeedbackCount,
        meetings: profile.meetingsAttended,
        ratings: profile.positiveVibeRatings + profile.goodGuestRatings,
      },
    };
  } catch (error) {
    console.error('Error getting reputation hint:', error);
    return { hasHint: false };
  }
}

// ============================================================================
// INTEGRATION WITH PACK 211 (SAFETY)
// ============================================================================

/**
 * Calculate effective risk score with reputation adjustment
 * High reputation slightly reduces risk, low reputation increases it
 */
export async function getEffectiveRiskScore(
  userId: string,
  baseRiskScore: number
): Promise<number> {
  const profile = await getUserReputation(userId);
  
  if (!profile) {
    return baseRiskScore;
  }

  return calculateEffectiveRiskScore(baseRiskScore, profile.reputationScore);
}

/**
 * Check if user should receive extra verifications based on reputation
 */
export async function requiresExtraVerification(userId: string): Promise<boolean> {
  const profile = await getUserReputation(userId);
  
  if (!profile) {
    return false;
  }

  const level = getReputationLevel(profile.reputationScore);
  return level === 'CRITICAL' || level === 'POOR';
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Recalculate all reputation adjustments (admin use)
 */
export async function recalculateAllAdjustments(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  let processed = 0;
  let updated = 0;
  let errors = 0;

  const snapshot = await db.collection('user_reputation').get();
  
  for (const doc of snapshot.docs) {
    try {
      const profile = doc.data() as UserReputation;
      const level = getReputationLevel(profile.reputationScore);
      
      await db.runTransaction(async (transaction) => {
        await updateReputationAdjustments(
          profile.userId,
          profile.reputationScore,
          level,
          transaction
        );
      });
      
      updated++;
    } catch (error) {
      console.error(`Error recalculating for user ${doc.id}:`, error);
      errors++;
    }
    processed++;
  }

  return { processed, updated, errors };
}

/**
 * Get reputation statistics (admin use)
 */
export async function getReputationStats() {
  const snapshot = await db.collection('user_reputation').get();
  
  const distribution = {
    excellent: 0,
    good: 0,
    neutral: 0,
    poor: 0,
    critical: 0,
  };
  
  let totalScore = 0;
  const scores: number[] = [];
  let activeBoostedUsers = 0;
  let activeLimitedUsers = 0;

  snapshot.docs.forEach(doc => {
    const profile = doc.data() as UserReputation;
    const level = getReputationLevel(profile.reputationScore);
    
    distribution[level.toLowerCase() as keyof typeof distribution]++;
    totalScore += profile.reputationScore;
    scores.push(profile.reputationScore);
    
    if (profile.activeBoost) activeBoostedUsers++;
    if (profile.activeLimiter) activeLimitedUsers++;
  });

  scores.sort((a, b) => a - b);
  const medianScore = scores.length > 0
    ? scores[Math.floor(scores.length / 2)]
    : 0;

  return {
    totalUsers: snapshot.size,
    distribution,
    averageScore: snapshot.size > 0 ? totalScore / snapshot.size : 0,
    medianScore,
    activeBoostedUsers,
    activeLimitedUsers,
    lastUpdated: admin.firestore.Timestamp.now(),
  };
}