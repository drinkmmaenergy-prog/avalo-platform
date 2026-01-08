/**
 * PACK 255 — Behavioral Signal Tracker
 * 
 * Tracks and analyzes user behavior to build attraction profiles
 * and learned preferences for the AI Matchmaker Engine.
 */

import { db, serverTimestamp, timestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  BehaviorSignal,
  BehaviorSignalType,
  UserBehaviorProfile,
  LearnedPreferences,
} from './pack255-ai-matchmaker-types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[Pack255:BehaviorTracker]', ...args),
  warn: (...args: any[]) => console.warn('[Pack255:BehaviorTracker]', ...args),
  error: (...args: any[]) => console.error('[Pack255:BehaviorTracker]', ...args),
};

// ============================================================================
// COLLECTIONS
// ============================================================================

const COLLECTIONS = {
  BEHAVIOR_SIGNALS: 'pack255_behavior_signals',
  BEHAVIOR_PROFILES: 'pack255_behavior_profiles',
  LEARNED_PREFERENCES: 'pack255_learned_preferences',
} as const;

// ============================================================================
// SIGNAL WEIGHTS (for scoring)
// ============================================================================

const SIGNAL_WEIGHTS = {
  // Positive signals
  [BehaviorSignalType.PROFILE_VIEW_LONG]: 2,
  [BehaviorSignalType.SWIPE_RIGHT]: 5,
  [BehaviorSignalType.MESSAGE_SENT]: 10,
  [BehaviorSignalType.MESSAGE_REPLY]: 12,
  [BehaviorSignalType.PAID_CHAT]: 25,
  [BehaviorSignalType.CALL_STARTED]: 30,
  [BehaviorSignalType.MEETING_BOOKED]: 50,
  [BehaviorSignalType.GIFT_SENT]: 15,
  [BehaviorSignalType.MEDIA_UNLOCKED]: 8,
  
  // Negative signals
  [BehaviorSignalType.PROFILE_VIEW_SHORT]: -1,
  [BehaviorSignalType.SWIPE_LEFT]: -3,
  [BehaviorSignalType.SWIPE_LEFT_FAST]: -5,
  [BehaviorSignalType.MESSAGE_IGNORED]: -8,
  [BehaviorSignalType.CHAT_ABANDONED]: -10,
  [BehaviorSignalType.PROFILE_SKIPPED]: -2,
} as const;

// ============================================================================
// TRACK BEHAVIORAL SIGNALS
// ============================================================================

/**
 * Track a behavioral signal
 */
export async function trackBehaviorSignal(
  userId: string,
  targetUserId: string,
  signalType: BehaviorSignalType,
  metadata?: BehaviorSignal['metadata']
): Promise<void> {
  try {
    const signal: BehaviorSignal = {
      userId,
      targetUserId,
      type: signalType,
      timestamp: Timestamp.now(),
      metadata,
    };

    // Store signal
    await db.collection(COLLECTIONS.BEHAVIOR_SIGNALS).add(signal);

    // Update behavior profile asynchronously
    updateBehaviorProfile(userId).catch(error => {
      logger.error(`Failed to update behavior profile for ${userId}:`, error);
    });

    logger.info(`Tracked signal: ${userId} → ${targetUserId} [${signalType}]`);
  } catch (error) {
    logger.error('Failed to track behavior signal:', error);
    throw error;
  }
}

/**
 * Track profile view with duration
 */
export async function trackProfileView(
  userId: string,
  targetUserId: string,
  viewDurationMs: number
): Promise<void> {
  const signalType = viewDurationMs > 4000
    ? BehaviorSignalType.PROFILE_VIEW_LONG
    : BehaviorSignalType.PROFILE_VIEW_SHORT;

  await trackBehaviorSignal(userId, targetUserId, signalType, {
    viewDuration: viewDurationMs,
  });
}

/**
 * Track swipe action
 */
export async function trackSwipe(
  userId: string,
  targetUserId: string,
  direction: 'left' | 'right',
  viewDurationMs?: number
): Promise<void> {
  let signalType: BehaviorSignalType;

  if (direction === 'right') {
    signalType = BehaviorSignalType.SWIPE_RIGHT;
  } else {
    // Fast left swipe indicates strong disinterest
    signalType = viewDurationMs && viewDurationMs < 1000
      ? BehaviorSignalType.SWIPE_LEFT_FAST
      : BehaviorSignalType.SWIPE_LEFT;
  }

  await trackBehaviorSignal(userId, targetUserId, signalType, {
    viewDuration: viewDurationMs,
  });
}

/**
 * Track message interaction
 */
export async function trackMessage(
  senderId: string,
  recipientId: string,
  isReply: boolean,
  messageLength: number
): Promise<void> {
  const signalType = isReply
    ? BehaviorSignalType.MESSAGE_REPLY
    : BehaviorSignalType.MESSAGE_SENT;

  await trackBehaviorSignal(senderId, recipientId, signalType, {
    messageLength,
  });
}

/**
 * Track paid interaction
 */
export async function trackPaidInteraction(
  userId: string,
  targetUserId: string,
  type: 'chat' | 'call' | 'meeting' | 'gift' | 'media',
  amount?: number
): Promise<void> {
  const signalTypeMap = {
    chat: BehaviorSignalType.PAID_CHAT,
    call: BehaviorSignalType.CALL_STARTED,
    meeting: BehaviorSignalType.MEETING_BOOKED,
    gift: BehaviorSignalType.GIFT_SENT,
    media: BehaviorSignalType.MEDIA_UNLOCKED,
  };

  await trackBehaviorSignal(userId, targetUserId, signalTypeMap[type], {
    amount,
  });
}

// ============================================================================
// BEHAVIOR PROFILE MANAGEMENT
// ============================================================================

/**
 * Update user's behavior profile based on recent signals
 */
export async function updateBehaviorProfile(userId: string): Promise<UserBehaviorProfile> {
  try {
    const profileRef = db.collection(COLLECTIONS.BEHAVIOR_PROFILES).doc(userId);
    const profileDoc = await profileRef.get();

    // Get all signals for this user
    const signalsSnapshot = await db
      .collection(COLLECTIONS.BEHAVIOR_SIGNALS)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(500) // Last 500 signals
      .get();

    const signals = signalsSnapshot.docs.map(doc => doc.data() as BehaviorSignal);

    // Calculate statistics
    const swipeRightCount = signals.filter(s => s.type === BehaviorSignalType.SWIPE_RIGHT).length;
    const swipeLeftCount = signals.filter(s => 
      s.type === BehaviorSignalType.SWIPE_LEFT || 
      s.type === BehaviorSignalType.SWIPE_LEFT_FAST
    ).length;
    const totalSwipes = swipeRightCount + swipeLeftCount;
    const swipeRightRate = totalSwipes > 0 ? swipeRightCount / totalSwipes : 0;

    // Calculate average profile view time
    const viewSignals = signals.filter(s => 
      s.type === BehaviorSignalType.PROFILE_VIEW_LONG || 
      s.type === BehaviorSignalType.PROFILE_VIEW_SHORT
    );
    const avgProfileViewTime = viewSignals.length > 0
      ? viewSignals.reduce((sum, s) => sum + (s.metadata?.viewDuration || 0), 0) / viewSignals.length
      : 0;

    // Count matches (swipe right + received like back)
    const matchedUserIds = new Set<string>();
    for (const signal of signals) {
      if (signal.type === BehaviorSignalType.SWIPE_RIGHT) {
        // Check if target user also swiped right
        const reverseSwipe = await db
          .collection(COLLECTIONS.BEHAVIOR_SIGNALS)
          .where('userId', '==', signal.targetUserId)
          .where('targetUserId', '==', userId)
          .where('type', '==', BehaviorSignalType.SWIPE_RIGHT)
          .limit(1)
          .get();
        
        if (!reverseSwipe.empty) {
          matchedUserIds.add(signal.targetUserId);
        }
      }
    }
    const totalMatches = matchedUserIds.size;
    const matchConversionRate = swipeRightCount > 0 ? totalMatches / swipeRightCount : 0;

    // Calculate message response rate
    const messagesSent = signals.filter(s => s.type === BehaviorSignalType.MESSAGE_SENT).length;
    const messagesReceived = await db
      .collection(COLLECTIONS.BEHAVIOR_SIGNALS)
      .where('targetUserId', '==', userId)
      .where('type', '==', BehaviorSignalType.MESSAGE_SENT)
      .get();
    const repliesSent = signals.filter(s => s.type === BehaviorSignalType.MESSAGE_REPLY).length;
    const messageResponseRate = messagesReceived.size > 0 ? repliesSent / messagesReceived.size : 0;

    // Count paid interactions
    const paidChatCount = signals.filter(s => s.type === BehaviorSignalType.PAID_CHAT).length;
    const meetingCount = signals.filter(s => s.type === BehaviorSignalType.MEETING_BOOKED).length;

    // Build profile
    const profile: UserBehaviorProfile = {
      userId,
      totalSwipes,
      swipeRightCount,
      swipeLeftCount,
      swipeRightRate,
      avgProfileViewTime,
      totalMatches,
      matchConversionRate,
      messageResponseRate,
      paidChatCount,
      meetingCount,
      lastActive: Timestamp.now(),
      createdAt: profileDoc.exists ? profileDoc.data()!.createdAt : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Check if we should build learned preferences (after 60 swipes)
    if (totalSwipes >= 60) {
      const preferences = await buildLearnedPreferences(userId, signals);
      profile.learnedPreferences = preferences;
    }

    // Save profile
    await profileRef.set(profile, { merge: true });

    logger.info(`Updated behavior profile for ${userId}: ${totalSwipes} swipes, ${totalMatches} matches`);

    return profile;
  } catch (error) {
    logger.error(`Failed to update behavior profile for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user's behavior profile
 */
export async function getBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
  try {
    const profileDoc = await db.collection(COLLECTIONS.BEHAVIOR_PROFILES).doc(userId).get();
    
    if (!profileDoc.exists) {
      return null;
    }

    return profileDoc.data() as UserBehaviorProfile;
  } catch (error) {
    logger.error(`Failed to get behavior profile for ${userId}:`, error);
    return null;
  }
}

// ============================================================================
// LEARNED PREFERENCES (CLONED TASTE ENGINE)
// ============================================================================

/**
 * Build learned preferences from behavioral signals
 */
async function buildLearnedPreferences(
  userId: string,
  signals: BehaviorSignal[]
): Promise<LearnedPreferences> {
  try {
    // Get profiles of users that were swiped right
    const likedUserIds = signals
      .filter(s => s.type === BehaviorSignalType.SWIPE_RIGHT)
      .map(s => s.targetUserId)
      .slice(0, 100); // Last 100 right swipes

    if (likedUserIds.length === 0) {
      return {
        userId,
        confidenceLevel: 0,
        swipesAnalyzed: 0,
        lastUpdated: Timestamp.now(),
      };
    }

    // Fetch liked user profiles
    const likedProfiles = await Promise.all(
      likedUserIds.map(async (targetId) => {
        const userDoc = await db.collection('users').doc(targetId).get();
        return userDoc.exists ? { id: targetId, ...userDoc.data() } as any : null;
      })
    );

    const validProfiles = likedProfiles.filter((p): p is any => p !== null);

    if (validProfiles.length === 0) {
      return {
        userId,
        confidenceLevel: 0,
        swipesAnalyzed: 0,
        lastUpdated: Timestamp.now(),
      };
    }

    // Analyze age preferences
    const ages = validProfiles.map(p => p.profile?.age || p.age).filter(a => a);
    const preferredAgeRange = ages.length > 0 ? {
      min: Math.max(18, Math.min(...ages) - 2),
      max: Math.min(99, Math.max(...ages) + 2),
    } : undefined;

    // Analyze distance preferences
    const distances = validProfiles.map(p => p.location?.distanceKm).filter(d => d != null);
    const preferredDistanceKm = distances.length > 0
      ? Math.ceil(distances.reduce((sum, d) => sum + d, 0) / distances.length * 1.5)
      : undefined;

    // Analyze style/appearance preferences
    const bodyTypes = new Map<string, number>();
    const styles = new Map<string, number>();
    
    validProfiles.forEach(p => {
      const profile = (p as any).profile || {};
      if (profile.bodyType) {
        bodyTypes.set(profile.bodyType, (bodyTypes.get(profile.bodyType) || 0) + 1);
      }
      if (profile.style) {
        styles.set(profile.style, (styles.get(profile.style) || 0) + 1);
      }
    });

    const preferredBodyTypes = Array.from(bodyTypes.entries())
      .filter(([_, count]) => count >= 3)
      .map(([type]) => type);

    const preferredStyles = Array.from(styles.entries())
      .filter(([_, count]) => count >= 3)
      .map(([style]) => style);

    // Analyze lifestyle similarity (interests)
    const lifestyleInterests = new Map<string, number>();
    validProfiles.forEach(p => {
      const interests = (p as any).profile?.interests || [];
      interests.forEach((interest: string) => {
        lifestyleInterests.set(interest, (lifestyleInterests.get(interest) || 0) + 1);
      });
    });

    const lifestyleSimilarity = Array.from(lifestyleInterests.entries())
      .filter(([_, count]) => count >= 3)
      .map(([interest]) => interest);

    // Calculate confidence level
    const confidenceLevel = Math.min(1, likedUserIds.length / 100);

    const preferences: LearnedPreferences = {
      userId,
      preferredAgeRange,
      preferredDistanceKm,
      preferredBodyTypes: preferredBodyTypes.length > 0 ? preferredBodyTypes : undefined,
      preferredStyles: preferredStyles.length > 0 ? preferredStyles : undefined,
      lifestyleSimilarity: lifestyleSimilarity.length > 0 ? lifestyleSimilarity : undefined,
      confidenceLevel,
      swipesAnalyzed: likedUserIds.length,
      lastUpdated: Timestamp.now(),
    };

    // Save learned preferences
    await db.collection(COLLECTIONS.LEARNED_PREFERENCES).doc(userId).set(preferences);

    logger.info(`Built learned preferences for ${userId}: confidence=${confidenceLevel.toFixed(2)}`);

    return preferences;
  } catch (error) {
    logger.error(`Failed to build learned preferences for ${userId}:`, error);
    return {
      userId,
      confidenceLevel: 0,
      swipesAnalyzed: 0,
      lastUpdated: Timestamp.now(),
    };
  }
}

/**
 * Get user's learned preferences
 */
export async function getLearnedPreferences(userId: string): Promise<LearnedPreferences | null> {
  try {
    const prefDoc = await db.collection(COLLECTIONS.LEARNED_PREFERENCES).doc(userId).get();
    
    if (!prefDoc.exists) {
      return null;
    }

    return prefDoc.data() as LearnedPreferences;
  } catch (error) {
    logger.error(`Failed to get learned preferences for ${userId}:`, error);
    return null;
  }
}

/**
 * Calculate similarity score between user's preferences and a candidate
 */
export async function calculatePreferenceSimilarity(
  userId: string,
  candidateId: string
): Promise<number> {
  try {
    const preferences = await getLearnedPreferences(userId);
    if (!preferences || preferences.confidenceLevel < 0.2) {
      return 0.5; // Neutral score if not enough data
    }

    const candidateDoc = await db.collection('users').doc(candidateId).get();
    if (!candidateDoc.exists) {
      return 0;
    }

    const candidateData = candidateDoc.data();
    const candidateProfile = candidateData?.profile || {};
    
    let score = 0;
    let factors = 0;

    // Age match
    if (preferences.preferredAgeRange) {
      const candidateAge = candidateProfile.age || candidateData?.age;
      if (candidateAge) {
        factors++;
        if (candidateAge >= preferences.preferredAgeRange.min && 
            candidateAge <= preferences.preferredAgeRange.max) {
          score += 1;
        } else {
          const deviation = Math.min(
            Math.abs(candidateAge - preferences.preferredAgeRange.min),
            Math.abs(candidateAge - preferences.preferredAgeRange.max)
          );
          score += Math.max(0, 1 - deviation / 10);
        }
      }
    }

    // Distance match
    if (preferences.preferredDistanceKm && candidateData?.location?.distanceKm != null) {
      factors++;
      const distance = candidateData.location.distanceKm;
      if (distance <= preferences.preferredDistanceKm) {
        score += 1;
      } else {
        score += Math.max(0, 1 - (distance - preferences.preferredDistanceKm) / preferences.preferredDistanceKm);
      }
    }

    // Body type match
    if (preferences.preferredBodyTypes && candidateProfile.bodyType) {
      factors++;
      if (preferences.preferredBodyTypes.includes(candidateProfile.bodyType)) {
        score += 1;
      }
    }

    // Style match
    if (preferences.preferredStyles && candidateProfile.style) {
      factors++;
      if (preferences.preferredStyles.includes(candidateProfile.style)) {
        score += 1;
      }
    }

    // Lifestyle/interests match
    if (preferences.lifestyleSimilarity && candidateProfile.interests) {
      factors++;
      const commonInterests = preferences.lifestyleSimilarity.filter(
        interest => candidateProfile.interests.includes(interest)
      );
      score += commonInterests.length / Math.max(preferences.lifestyleSimilarity.length, 1);
    }

    // Normalize score
    const normalizedScore = factors > 0 ? score / factors : 0.5;

    // Weight by confidence
    return normalizedScore * preferences.confidenceLevel + 0.5 * (1 - preferences.confidenceLevel);
  } catch (error) {
    logger.error(`Failed to calculate preference similarity:`, error);
    return 0.5;
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Batch update behavior profiles for multiple users
 */
export async function batchUpdateBehaviorProfiles(userIds: string[]): Promise<{
  success: number;
  failed: number;
}> {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      await updateBehaviorProfile(userId);
      success++;
    } catch (error) {
      logger.error(`Failed to update profile for ${userId}:`, error);
      failed++;
    }
  }

  logger.info(`Batch update complete: ${success} success, ${failed} failed`);

  return { success, failed };
}

logger.info('✅ Pack 255 Behavior Tracker initialized');