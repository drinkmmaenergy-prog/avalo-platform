/**
 * PACK 222: Breakup Recovery & Chemistry Restart Engine
 * 
 * Reduces post-romance churn by providing emotional safety, confidence rebuilding,
 * and gentle chemistry restart after romantic journey endings.
 * 
 * Key Features:
 * - Automatic breakup state detection
 * - 3-phase recovery timeline (Cooldown → Rebuild → Restart)
 * - Confidence rebuild using real social signals
 * - Non-aggressive chemistry restart
 * - Full safety integration
 * - NO economic changes - emotional retention only
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type RecoveryPhase = 'cooldown' | 'rebuild' | 'restart' | 'completed';

export type BreakupReason = 
  | 'neutral_ending'         // User pressed "End Journey"
  | 'emotional_mismatch'     // Vibe feedback conflict
  | 'ghosted'                // No chat for 14 days + no decline
  | 'hard_conflict'          // Safety complaint → resolved
  | 'meeting_disappointment' // Verified mismatch selfie
  | 'manual_end';            // Generic manual ending

export interface BreakupRecoveryState {
  recoveryId: string;
  userId: string;
  partnerId: string;
  journeyId: string;
  
  // State tracking
  needsRecovery: boolean;
  currentPhase: RecoveryPhase;
  breakupReason: BreakupReason;
  
  // Timeline tracking
  breakupDetectedAt: Timestamp;
  cooldownEndsAt: Timestamp;
  rebuildEndsAt: Timestamp;
  restartEndsAt: Timestamp;
  completedAt?: Timestamp;
  
  // Activity tracking (to adjust timeline)
  userActivityLevel: 'none' | 'low' | 'medium' | 'high';
  lastActivityAt?: Timestamp;
  
  // Confidence signals (real data only)
  confidenceSignals: {
    wishlistAdds: number;
    profileVisits: number;
    complimentBadges: number;
    trendingStatus: boolean;
    vibeAttention: boolean;
  };
  
  // Safety integration
  safetyCleared: boolean;
  safetyCheckRequired: boolean;
  
  // Chemistry restart readiness
  readyForChemistryRestart: boolean;
  restartOfferedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConfidenceBoostCard {
  cardId: string;
  userId: string;
  recoveryId: string;
  type: 'wishlist_add' | 'profile_visit' | 'compliment' | 'trending' | 'vibe_attention';
  message: string;
  data?: Record<string, any>;
  shownAt?: Timestamp;
  dismissedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface ChemistryRestartSuggestion {
  suggestionId: string;
  userId: string;
  recoveryId: string;
  suggestedUserId: string;
  
  // Chemistry indicators
  chemistryScore: number;
  matchReasons: string[];
  
  // Positive, flirt-coded copy
  headline: string;
  description: string;
  
  // Tracking
  shownAt?: Timestamp;
  interactedAt?: Timestamp;
  interaction?: 'viewed' | 'swiped_yes' | 'swiped_no' | 'ignored';
  
  createdAt: Timestamp;
}

// ============================================================================
// BREAKUP STATE DETECTION
// ============================================================================

/**
 * Detect and create breakup recovery state when journey ends
 * Called by PACK 221's endJourney function
 */
export async function detectBreakupState(
  userId: string,
  partnerId: string,
  journeyId: string,
  reason: BreakupReason
): Promise<{ recoveryId: string; created: boolean }> {
  
  // Check if recovery state already exists
  const existingRecovery = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('journeyId', '==', journeyId)
    .limit(1)
    .get();
  
  if (!existingRecovery.empty) {
    return { recoveryId: existingRecovery.docs[0].id, created: false };
  }
  
  // Check safety status
  const safetyCheck = await checkSafetyForRecovery(userId);
  
  const now = new Date();
  const cooldownEnd = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // 48 hours
  const rebuildEnd = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000)); // 5 days
  const restartEnd = new Date(now.getTime() + (10 * 24 * 60 * 60 * 1000)); // 10 days
  
  const recoveryId = generateId();
  
  await db.collection('breakup_recovery_states').doc(recoveryId).set({
    recoveryId,
    userId,
    partnerId,
    journeyId,
    needsRecovery: true,
    currentPhase: 'cooldown',
    breakupReason: reason,
    breakupDetectedAt: serverTimestamp(),
    cooldownEndsAt: cooldownEnd,
    rebuildEndsAt: rebuildEnd,
    restartEndsAt: restartEnd,
    userActivityLevel: 'none',
    confidenceSignals: {
      wishlistAdds: 0,
      profileVisits: 0,
      complimentBadges: 0,
      trendingStatus: false,
      vibeAttention: false
    },
    safetyCleared: safetyCheck.safe,
    safetyCheckRequired: !safetyCheck.safe,
    readyForChemistryRestart: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { recoveryId, created: true };
}

/**
 * Check if user is safe for recovery process
 */
async function checkSafetyForRecovery(userId: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Check for active safety incidents
    const incidentsSnap = await db.collection('safety_incidents')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!incidentsSnap.empty) {
      return { safe: false, reason: 'Active safety incident' };
    }
    
    // Check for panic alerts
    const panicSnap = await db.collection('panic_alerts')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!panicSnap.empty) {
      return { safe: false, reason: 'Active panic alert' };
    }
    
    return { safe: true };
  } catch (error) {
    console.error('Error checking safety for recovery:', error);
    return { safe: true }; // Default to safe if check fails
  }
}

// ============================================================================
// RECOVERY TIMELINE ENGINE
// ============================================================================

/**
 * Update recovery phase based on time and activity
 * Should be called periodically (e.g., daily cron job)
 */
export async function updateRecoveryPhase(recoveryId: string): Promise<{ phase: RecoveryPhase; updated: boolean }> {
  const recoveryRef = db.collection('breakup_recovery_states').doc(recoveryId);
  const recoverySnap = await recoveryRef.get();
  
  if (!recoverySnap.exists) {
    return { phase: 'completed', updated: false };
  }
  
  const recovery = recoverySnap.data() as BreakupRecoveryState;
  const now = new Date();
  
  let newPhase = recovery.currentPhase;
  let updated = false;
  
  // Check if we should move to next phase
  if (recovery.currentPhase === 'cooldown') {
    if (now >= recovery.cooldownEndsAt.toDate()) {
      newPhase = 'rebuild';
      updated = true;
    }
  } else if (recovery.currentPhase === 'rebuild') {
    // Can move faster if user shows activity
    const shouldProgress = now >= recovery.rebuildEndsAt.toDate() || 
                          recovery.userActivityLevel === 'high';
    
    if (shouldProgress) {
      newPhase = 'restart';
      updated = true;
      
      // Generate confidence boost cards for rebuild phase
      await generateConfidenceBoostCards(recoveryId, recovery.userId);
    }
  } else if (recovery.currentPhase === 'restart') {
    if (now >= recovery.restartEndsAt.toDate()) {
      newPhase = 'completed';
      updated = true;
      
      // Mark as ready for chemistry restart
      await recoveryRef.update({
        readyForChemistryRestart: true,
        updatedAt: serverTimestamp()
      });
      
      // Generate chemistry restart suggestions
      await generateChemistryRestartSuggestions(recoveryId, recovery.userId);
    }
  }
  
  if (updated) {
    await recoveryRef.update({
      currentPhase: newPhase,
      updatedAt: serverTimestamp()
    });
  }
  
  return { phase: newPhase, updated };
}

/**
 * Track user activity to adjust recovery timeline
 */
export async function trackRecoveryActivity(
  userId: string,
  activityType: 'login' | 'swipe' | 'chat' | 'profile_view' | 'event_attend'
): Promise<void> {
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('needsRecovery', '==', true)
    .where('currentPhase', 'in', ['cooldown', 'rebuild', 'restart'])
    .limit(1)
    .get();
  
  if (recoverySnap.empty) return;
  
  const recoveryRef = recoverySnap.docs[0].ref;
  const recovery = recoverySnap.docs[0].data() as BreakupRecoveryState;
  
  // Calculate activity level based on recent activity
  const activityScores = {
    'login': 1,
    'swipe': 2,
    'chat': 3,
    'profile_view': 1,
    'event_attend': 4
  };
  
  const score = activityScores[activityType] || 1;
  
  // Determine activity level (simplified logic)
  let activityLevel: 'none' | 'low' | 'medium' | 'high' = 'low';
  if (score >= 3) activityLevel = 'high';
  else if (score >= 2) activityLevel = 'medium';
  
  await recoveryRef.update({
    userActivityLevel: activityLevel,
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Check if we should advance phase early
  if (activityLevel === 'high' && recovery.currentPhase === 'rebuild') {
    await updateRecoveryPhase(recoverySnap.docs[0].id);
  }
}

// ============================================================================
// CONFIDENCE REBUILD ACTIONS
// ============================================================================

/**
 * Generate confidence boost cards based on real social signals
 */
async function generateConfidenceBoostCards(recoveryId: string, userId: string): Promise<void> {
  const cards: Omit<ConfidenceBoostCard, 'cardId' | 'createdAt'>[] = [];
  
  // Get real social signals from the last 7 days
  const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
  
  // Check wishlist adds
  const wishlistSnap = await db.collection('wishlists')
    .where('targetUserId', '==', userId)
    .where('createdAt', '>', sevenDaysAgo)
    .get();
  
  if (wishlistSnap.size > 0) {
    cards.push({
      userId,
      recoveryId,
      type: 'wishlist_add',
      message: `${wishlistSnap.size} ${wishlistSnap.size === 1 ? 'person' : 'people'} added you to their wishlist recently`,
      data: { count: wishlistSnap.size }
    });
  }
  
  // Check profile visits
  const visitsSnap = await db.collection('profile_visits')
    .where('profileId', '==', userId)
    .where('visitedAt', '>', sevenDaysAgo)
    .get();
  
  if (visitsSnap.size > 0) {
    cards.push({
      userId,
      recoveryId,
      type: 'profile_visit',
      message: `Your profile got ${visitsSnap.size} ${visitsSnap.size === 1 ? 'visit' : 'visits'} this week`,
      data: { count: visitsSnap.size }
    });
  }
  
  // Check compliment badges
  const complimentsSnap = await db.collection('user_badges')
    .where('userId', '==', userId)
    .where('badgeType', '==', 'compliment')
    .where('awardedAt', '>', sevenDaysAgo)
    .get();
  
  if (complimentsSnap.size > 0) {
    cards.push({
      userId,
      recoveryId,
      type: 'compliment',
      message: `You received ${complimentsSnap.size} new compliment ${complimentsSnap.size === 1 ? 'badge' : 'badges'}`,
      data: { count: complimentsSnap.size }
    });
  }
  
  // Check trending status (top 20% of profile views in user's area)
  const userProfileSnap = await db.collection('users').doc(userId).get();
  if (userProfileSnap.exists) {
    const userData = userProfileSnap.data();
    if (userData?.stats?.profileViews > 10) { // Simple trending check
      cards.push({
        userId,
        recoveryId,
        type: 'trending',
        message: "You're trending — your profile is getting attention",
        data: { trending: true }
      });
    }
  }
  
  // Save cards
  for (const card of cards) {
    const cardId = generateId();
    await db.collection('confidence_boost_cards').doc(cardId).set({
      cardId,
      ...card,
      createdAt: serverTimestamp()
    });
  }
  
  // Update confidence signals in recovery state
  await db.collection('breakup_recovery_states').doc(recoveryId).update({
    'confidenceSignals.wishlistAdds': wishlistSnap.size,
    'confidenceSignals.profileVisits': visitsSnap.size,
    'confidenceSignals.complimentBadges': complimentsSnap.size,
    'confidenceSignals.trendingStatus': cards.some(c => c.type === 'trending'),
    'confidenceSignals.vibeAttention': visitsSnap.size > 5,
    updatedAt: serverTimestamp()
  });
}

/**
 * Get confidence boost cards for user
 */
export async function getConfidenceBoostCards(userId: string): Promise<ConfidenceBoostCard[]> {
  const cardsSnap = await db.collection('confidence_boost_cards')
    .where('userId', '==', userId)
    .where('shownAt', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  
  return cardsSnap.docs.map(doc => doc.data() as ConfidenceBoostCard);
}

/**
 * Mark confidence card as shown
 */
export async function markConfidenceCardShown(cardId: string): Promise<void> {
  await db.collection('confidence_boost_cards').doc(cardId).update({
    shownAt: serverTimestamp()
  });
}

// ============================================================================
// CHEMISTRY RESTART SUGGESTIONS
// ============================================================================

/**
 * Generate chemistry restart suggestions (non-aggressive)
 */
async function generateChemistryRestartSuggestions(
  recoveryId: string,
  userId: string
): Promise<void> {
  // Get user preferences and data
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return;
  
  const userData = userSnap.data();
  
  // Get potential matches with high chemistry
  // This would integrate with existing matching algorithm
  const potentialMatches = await findHighChemistryMatches(userId, userData);
  
  // Create suggestions with positive, flirt-coded copy
  for (const match of potentialMatches.slice(0, 3)) { // Max 3 suggestions
    const suggestionId = generateId();
    
    const headlines = [
      'High chemistry potential',
      'Someone with your vibe',
      'Energy that fits your pace',
      'Your timelines match'
    ];
    
    const descriptions = [
      'This person shares your interests and communication style',
      'Compatible energy levels and relationship goals',
      'Similar values and life phase',
      'Natural conversation flow potential'
    ];
    
    await db.collection('chemistry_restart_suggestions').doc(suggestionId).set({
      suggestionId,
      userId,
      recoveryId,
      suggestedUserId: match.userId,
      chemistryScore: match.score,
      matchReasons: match.reasons,
      headline: headlines[Math.floor(Math.random() * headlines.length)],
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Find high chemistry matches for user
 */
async function findHighChemistryMatches(
  userId: string,
  userData: any
): Promise<Array<{ userId: string; score: number; reasons: string[] }>> {
  // This is a simplified version - integrate with actual matching algorithm
  // For now, return empty array as placeholder
  
  // Would query user preferences, compatibility scores, etc.
  const matches: Array<{ userId: string; score: number; reasons: string[] }> = [];
  
  // TODO: Integrate with actual chemistry/matching system
  
  return matches;
}

/**
 * Get chemistry restart suggestions for user
 */
export async function getChemistryRestartSuggestions(userId: string): Promise<ChemistryRestartSuggestion[]> {
  const suggestionsSnap = await db.collection('chemistry_restart_suggestions')
    .where('userId', '==', userId)
    .where('shownAt', '==', null)
    .orderBy('chemistryScore', 'desc')
    .limit(3)
    .get();
  
  return suggestionsSnap.docs.map(doc => doc.data() as ChemistryRestartSuggestion);
}

/**
 * Track interaction with chemistry suggestion
 */
export async function trackChemistrySuggestionInteraction(
  suggestionId: string,
  interaction: 'viewed' | 'swiped_yes' | 'swiped_no' | 'ignored'
): Promise<void> {
  await db.collection('chemistry_restart_suggestions').doc(suggestionId).update({
    interaction,
    interactedAt: serverTimestamp(),
    shownAt: serverTimestamp()
  });
}

// ============================================================================
// SAFETY INTEGRATION
// ============================================================================

/**
 * Check if user has marked themselves as feeling safe again
 */
export async function markUserSafeForRecovery(userId: string): Promise<{ updated: boolean }> {
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('needsRecovery', '==', true)
    .where('safetyCheckRequired', '==', true)
    .limit(1)
    .get();
  
  if (recoverySnap.empty) {
    return { updated: false };
  }
  
  await recoverySnap.docs[0].ref.update({
    safetyCleared: true,
    safetyCheckRequired: false,
    updatedAt: serverTimestamp()
  });
  
  return { updated: true };
}

/**
 * Pause recovery if safety incident occurs
 */
export async function pauseRecoveryForSafety(userId: string, reason: string): Promise<void> {
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('needsRecovery', '==', true)
    .where('currentPhase', 'in', ['cooldown', 'rebuild', 'restart'])
    .limit(1)
    .get();
  
  if (recoverySnap.empty) return;
  
  await recoverySnap.docs[0].ref.update({
    safetyCleared: false,
    safetyCheckRequired: true,
    readyForChemistryRestart: false,
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get active recovery state for user
 */
export async function getActiveRecoveryState(userId: string): Promise<BreakupRecoveryState | null> {
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('needsRecovery', '==', true)
    .where('currentPhase', 'in', ['cooldown', 'rebuild', 'restart'])
    .limit(1)
    .get();
  
  if (recoverySnap.empty) return null;
  
  return recoverySnap.docs[0].data() as BreakupRecoveryState;
}

/**
 * Complete recovery state
 */
export async function completeRecovery(recoveryId: string): Promise<void> {
  await db.collection('breakup_recovery_states').doc(recoveryId).update({
    needsRecovery: false,
    currentPhase: 'completed',
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Get emotional safety copy based on phase
 */
export function getEmotionalSafetyCopy(phase: RecoveryPhase): { title: string; message: string } {
  const copy = {
    cooldown: {
      title: 'Take your time',
      message: 'When you\'re ready, we\'ll help you find chemistry again'
    },
    rebuild: {
      title: 'Your vibe attracts attention',
      message: 'People are noticing your profile — you\'re doing great'
    },
    restart: {
      title: 'Ready for new chemistry?',
      message: 'We found some great matches with your energy'
    },
    completed: {
      title: 'Welcome back',
      message: 'Good to see you again'
    }
  };
  
  return copy[phase];
}