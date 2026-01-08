/**
 * PACK 213: Discovery Integration
 * Integrates Premium Match Priority Engine with existing Discovery Engine V2
 * 
 * This module enhances the discovery feed by:
 * - Adding priority scoring to candidates
 * - Applying boost multipliers
 * - Tracking attraction signals
 * - Providing positive user feedback
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  calculateMatchPriority,
  batchCalculateMatchPriority,
  trackAttractionSignal,
  applyBoostWindow,
} from './pack213-match-priority-engine';
import {
  MatchPriorityScore,
  PriorityDiscoveryRequest,
  PriorityDiscoveryResult,
  VisibilityMessage,
  VISIBILITY_MESSAGES,
} from './types/pack213-types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[PACK213:Discovery]', ...args),
  warn: (...args: any[]) => console.warn('[PACK213:Discovery]', ...args),
  error: (...args: any[]) => console.error('[PACK213:Discovery]', ...args),
};

// ============================================================================
// ENHANCED DISCOVERY FEED
// ============================================================================

/**
 * Get discovery feed with PACK 213 priority ranking
 * Integrates with existing discoveryEngineV2
 */
export async function getDiscoveryFeedWithPriority(
  request: PriorityDiscoveryRequest
): Promise<{
  items: PriorityDiscoveryResult[];
  cursor?: string;
  hasMore: boolean;
  totalCandidates: number;
}> {
  logger.info(`Priority discovery for user ${request.viewerId}`);
  
  try {
    // Get base discovery candidates
    const candidates = await getBaseCandidates(request);
    
    if (candidates.length === 0) {
      return {
        items: [],
        hasMore: false,
        totalCandidates: 0,
      };
    }
    
    // Calculate priority scores for all candidates
    const candidateIds = candidates.map(c => c.userId);
    const priorityScores = await batchCalculateMatchPriority(
      request.viewerId,
      candidateIds
    );
    
    // Build ranked results
    const rankedResults: PriorityDiscoveryResult[] = priorityScores.map((score, index) => ({
      candidateId: score.candidateId,
      priorityScore: score.effectiveScore,
      priorityRank: index + 1,
      boostActive: score.boostMultiplier > 1.0,
      components: score.components,
    }));
    
    // Apply limit and generate cursor
    const items = rankedResults.slice(0, request.limit);
    const hasMore = rankedResults.length > request.limit;
    const cursor = hasMore ? items[items.length - 1].candidateId : undefined;
    
    logger.info(`Priority discovery complete: ${items.length} items, avg score ${
      items.reduce((sum, i) => sum + i.priorityScore, 0) / items.length
    }`);
    
    return {
      items,
      cursor,
      hasMore,
      totalCandidates: candidates.length,
    };
  } catch (error) {
    logger.error('Priority discovery failed:', error);
    throw error;
  }
}

/**
 * Get base candidates from existing discovery system
 * This respects all existing filters and safety checks
 */
async function getBaseCandidates(
  request: PriorityDiscoveryRequest
): Promise<Array<{ userId: string }>> {
  const { viewerId, filters, limit } = request;
  
  // Build query with filters
  let query = db
    .collection('users')
    .where('isActive', '==', true)
    .where('verification.status', '==', 'approved');
  
  // Apply filters
  if (filters?.gender) {
    query = query.where('gender', '==', filters.gender) as any;
  }
  
  if (filters?.minAge) {
    const maxBirthYear = new Date().getFullYear() - filters.minAge;
    query = query.where('birthYear', '<=', maxBirthYear) as any;
  }
  
  if (filters?.maxAge) {
    const minBirthYear = new Date().getFullYear() - filters.maxAge;
    query = query.where('birthYear', '>=', minBirthYear) as any;
  }
  
  // Fetch more than needed for filtering and ranking
  const fetchLimit = limit * 3;
  query = query.limit(fetchLimit);
  
  const snapshot = await query.get();
  
  // Filter out self
  const candidates = snapshot.docs
    .map(doc => ({ userId: doc.id }))
    .filter(c => c.userId !== viewerId);
  
  return candidates;
}

// ============================================================================
// ATTRACTION SIGNAL TRACKING
// ============================================================================

/**
 * Track when user likes a profile
 * This feeds into attraction scoring
 */
export async function trackProfileLike(
  viewerId: string,
  targetId: string
): Promise<void> {
  logger.info(`Tracking like: ${viewerId} -> ${targetId}`);
  
  await trackAttractionSignal(viewerId, targetId, {
    type: 'like',
  });
  
  // Update real-time stats
  await db.collection('users').doc(viewerId).update({
    'stats.likesGiven': (await db.collection('users').doc(viewerId).get()).data()?.stats?.likesGiven || 0 + 1,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Track when user views a profile
 */
export async function trackProfileView(
  viewerId: string,
  targetId: string,
  dwellTimeSeconds: number
): Promise<void> {
  await trackAttractionSignal(viewerId, targetId, {
    type: 'profile_view',
    dwellTimeSeconds,
  });
}

/**
 * Track when user expands media
 */
export async function trackMediaExpansion(
  viewerId: string,
  targetId: string
): Promise<void> {
  await trackAttractionSignal(viewerId, targetId, {
    type: 'media_expand',
  });
}

/**
 * Track when user wishlists a profile
 */
export async function trackProfileWishlist(
  viewerId: string,
  targetId: string
): Promise<void> {
  await trackAttractionSignal(viewerId, targetId, {
    type: 'wishlist',
  });
}

// ============================================================================
// BOOST TRIGGERS
// ============================================================================

/**
 * Apply boost after token purchase
 */
export async function applyTokenPurchaseBoost(
  userId: string,
  amount: number
): Promise<void> {
  logger.info(`Applying token purchase boost: user=${userId}, amount=${amount}`);
  
  await applyBoostWindow(userId, 'PURCHASE_TOKENS', { amount });
  
  // Show positive feedback
  await showVisibilityFeedback(userId, 'DISCOVERY_BOOST_ACTIVE', 24);
}

/**
 * Apply boost after completing paid chat
 */
export async function applyPaidChatBoost(
  userId: string,
  chatId: string
): Promise<void> {
  logger.info(`Applying paid chat boost: user=${userId}, chat=${chatId}`);
  
  await applyBoostWindow(userId, 'COMPLETE_PAID_CHAT', { chatId });
}

/**
 * Apply boost after completing paid meeting
 */
export async function applyPaidMeetingBoost(
  userId: string,
  meetingId: string
): Promise<void> {
  logger.info(`Applying paid meeting boost: user=${userId}, meeting=${meetingId}`);
  
  await applyBoostWindow(userId, 'COMPLETE_PAID_MEETING', { meetingId });
  
  // Show positive feedback
  await showVisibilityFeedback(userId, 'MORE_VISIBILITY_GOOD_ENERGY', 72);
}

/**
 * Apply boost after hosting successful event
 */
export async function applyEventHostBoost(
  userId: string,
  eventId: string
): Promise<void> {
  logger.info(`Applying event host boost: user=${userId}, event=${eventId}`);
  
  await applyBoostWindow(userId, 'HOST_SUCCESSFUL_EVENT', { eventId });
  
  // Show positive feedback
  await showVisibilityFeedback(userId, 'MORE_VISIBILITY_GOOD_ENERGY', 72);
}

/**
 * Apply boost after giving voluntary refund
 */
export async function applyVoluntaryRefundBoost(
  userId: string,
  amount: number
): Promise<void> {
  logger.info(`Applying voluntary refund boost: user=${userId}, amount=${amount}`);
  
  await applyBoostWindow(userId, 'GIVE_VOLUNTARY_REFUND', { amount });
}

/**
 * Apply boost after receiving good vibe mark
 */
export async function applyGoodVibeBoost(
  userId: string,
  meetingId: string
): Promise<void> {
  logger.info(`Applying good vibe boost: user=${userId}, meeting=${meetingId}`);
  
  await applyBoostWindow(userId, 'RECEIVE_GOOD_VIBE_MARK', { meetingId });
  
  // Show positive feedback
  await showVisibilityFeedback(userId, 'HIGH_CHEMISTRY_POTENTIAL', 48);
}

// ============================================================================
// USER FEEDBACK
// ============================================================================

/**
 * Show positive visibility feedback to user
 * NEVER reveal algorithm details
 */
async function showVisibilityFeedback(
  userId: string,
  message: VisibilityMessage,
  hoursToShow: number
): Promise<void> {
  const now = Timestamp.now();
  const showUntil = new Timestamp(
    now.seconds + (hoursToShow * 3600),
    now.nanoseconds
  );
  
  await db.collection('user_visibility_feedback').doc(userId).set({
    userId,
    message,
    displayText: VISIBILITY_MESSAGES[message],
    showUntil,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Get active visibility feedback for user
 */
export async function getVisibilityFeedback(
  userId: string
): Promise<string | null> {
  try {
    const feedbackDoc = await db
      .collection('user_visibility_feedback')
      .doc(userId)
      .get();
    
    if (!feedbackDoc.exists) {
      return null;
    }
    
    const feedback = feedbackDoc.data();
    const now = Timestamp.now();
    
    if (feedback && feedback.showUntil.seconds > now.seconds) {
      return feedback.displayText;
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting visibility feedback:', error);
    return null;
  }
}

// ============================================================================
// HIGH PRIORITY SURFACING
// ============================================================================

/**
 * Get high-priority matches for special features
 * Used for: Chemistry Weekend, Fantasy Match, Suggested Nearby, etc.
 */
export async function getHighPriorityMatches(
  userId: string,
  limit: number = 10,
  minScore: number = 70
): Promise<PriorityDiscoveryResult[]> {
  logger.info(`Getting high priority matches for user ${userId}, minScore=${minScore}`);
  
  try {
    // Get user's recent interactions
    const recentSignals = await db
      .collection('attraction_signals')
      .where('userId', '==', userId)
      .orderBy('lastInteractionAt', 'desc')
      .limit(50)
      .get();
    
    const interactedUserIds = new Set(
      recentSignals.docs.map(doc => doc.data().targetUserId)
    );
    
    // Get base candidates
    const candidates = await getBaseCandidates({
      viewerId: userId,
      limit: limit * 3,
      usePriorityRanking: true,
    });
    
    // Filter out already interacted users for fresh suggestions
    const freshCandidates = candidates.filter(
      c => !interactedUserIds.has(c.userId)
    );
    
    // Calculate scores
    const scores = await batchCalculateMatchPriority(
      userId,
      freshCandidates.map(c => c.userId)
    );
    
    // Filter by minimum score and take top matches
    const highPriority = scores
      .filter(s => s.effectiveScore >= minScore)
      .slice(0, limit)
      .map((score, index) => ({
        candidateId: score.candidateId,
        priorityScore: score.effectiveScore,
        priorityRank: index + 1,
        boostActive: score.boostMultiplier > 1.0,
        components: score.components,
      }));
    
    logger.info(`Found ${highPriority.length} high-priority matches`);
    
    return highPriority;
  } catch (error) {
    logger.error('Error getting high priority matches:', error);
    return [];
  }
}

/**
 * Get suggested profiles for specific contexts
 */
export async function getSuggestedProfiles(
  userId: string,
  context: 'nearby' | 'passport' | 'chemistry_weekend' | 'fantasy_match',
  limit: number = 20
): Promise<PriorityDiscoveryResult[]> {
  logger.info(`Getting suggested profiles: context=${context}, user=${userId}`);
  
  // Adjust scoring based on context
  const minScore = context === 'fantasy_match' ? 80 : 
                   context === 'chemistry_weekend' ? 75 :
                   60;
  
  return await getHighPriorityMatches(userId, limit, minScore);
}

logger.info('✅ PACK 213: Discovery Integration initialized');