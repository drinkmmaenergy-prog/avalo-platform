/**
 * PACK 224: Romantic Momentum - Integration with PACKs 221-223
 * 
 * Connects romantic momentum with:
 * - PACK 221: Romantic Journeys
 * - PACK 222: Breakup Recovery
 * - PACK 223: Destiny Weeks
 */

import { db, serverTimestamp } from './init.js';
import { trackMomentumAction, applyMomentumPenalty, getMomentumState } from './pack-224-romantic-momentum.js';
import { syncBreakupRecoveryStatus as syncDestinyBreakupStatus } from './pack-223-destiny-weeks.js';

// ============================================================================
// PACK 221: ROMANTIC JOURNEYS INTEGRATION
// ============================================================================

/**
 * Track momentum when journey milestone is unlocked
 * Called by PACK 221 when users reach milestones
 */
export async function onJourneyMilestoneUnlocked(
  userId: string,
  partnerId: string,
  journeyId: string,
  milestoneType: string
): Promise<void> {
  // Different milestones give different momentum boosts
  const momentumBoosts: Record<string, number> = {
    'first_week': 2,
    'first_month': 5,
    'three_months': 8,
    'six_months': 12,
    'one_year': 20
  };
  
  const boost = momentumBoosts[milestoneType] || 3;
  
  // Add momentum to both users
  await Promise.all([
    addJourneyMomentum(userId, boost, { partnerId, journeyId, milestoneType }),
    addJourneyMomentum(partnerId, boost, { partnerId: userId, journeyId, milestoneType })
  ]);
}

/**
 * Add momentum boost for journey progress
 */
async function addJourneyMomentum(
  userId: string,
  boost: number,
  metadata: Record<string, any>
): Promise<void> {
  const state = await getMomentumState(userId);
  
  // Apply boost directly to score
  const stateRef = db.collection('romantic_momentum_states').doc(userId);
  const newScore = Math.min(100, state.score + boost);
  
  await stateRef.update({
    score: newScore,
    lastUpdate: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Log the action
  await db.collection('momentum_actions_log').add({
    userId,
    actionType: 'journey_milestone',
    momentumChange: boost,
    scoreBefore: state.score,
    scoreAfter: newScore,
    metadata,
    timestamp: serverTimestamp()
  });
}

/**
 * Handle journey ending (breakup)
 * Triggers PACK 222 Breakup Recovery
 */
export async function onJourneyEnded(
  userId: string,
  partnerId: string,
  journeyId: string,
  reason: 'mutual' | 'one_sided' | 'safety'
): Promise<void> {
  // Start breakup recovery (PACK 222)
  await initiateBreakupRecovery(userId, partnerId, journeyId, reason);
  
  // If safety-related, apply momentum penalty
  if (reason === 'safety') {
    await applyMomentumPenalty(userId, 'safety_complaint_verified', {
      journeyId,
      partnerId,
      reason
    });
  }
}

// ============================================================================
// PACK 222: BREAKUP RECOVERY INTEGRATION
// ============================================================================

/**
 * Initiate breakup recovery for a user
 * Syncs with both Destiny Weeks and Momentum
 */
export async function initiateBreakupRecovery(
  userId: string,
  partnerId: string,
  journeyId: string,
  reason: string
): Promise<void> {
  // Create breakup recovery state (PACK 222)
  const recoveryId = `${userId}_${Date.now()}`;
  
  await db.collection('breakup_recovery_states').doc(recoveryId).set({
    recoveryId,
    userId,
    partnerId,
    journeyId,
    reason,
    phase: 'cooldown', // cooldown → rebuild → restart
    startedAt: serverTimestamp(),
    phaseStartedAt: serverTimestamp(),
    safetyCleared: reason !== 'safety',
    updatedAt: serverTimestamp()
  });
  
  // Sync with Destiny Weeks (pause during cooldown)
  await syncDestinyBreakupStatus(userId, true, 'cooldown');
  
  // Update momentum state (don't penalize, just mark recovery)
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    inBreakupRecovery: true,
    recoveryPhase: 'cooldown',
    updatedAt: serverTimestamp()
  });
}

/**
 * Progress to rebuild phase (2-5 days after breakup)
 * User can engage again but with gentle momentum
 */
export async function progressToRebuildPhase(
  userId: string,
  recoveryId: string
): Promise<void> {
  // Update recovery state
  await db.collection('breakup_recovery_states').doc(recoveryId).update({
    phase: 'rebuild',
    phaseStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Sync with Destiny (allow soft themes)
  await syncDestinyBreakupStatus(userId, true, 'rebuild');
  
  // Update momentum state
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    recoveryPhase: 'rebuild',
    updatedAt: serverTimestamp()
  });
}

/**
 * Progress to restart phase (5-10 days after breakup)
 * User ready to fully engage again
 */
export async function progressToRestartPhase(
  userId: string,
  recoveryId: string
): Promise<void> {
  // Update recovery state
  await db.collection('breakup_recovery_states').doc(recoveryId).update({
    phase: 'restart',
    phaseStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Sync with Destiny (all themes available)
  await syncDestinyBreakupStatus(userId, true, 'restart');
  
  // Update momentum state
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    recoveryPhase: 'restart',
    updatedAt: serverTimestamp()
  });
}

/**
 * Complete breakup recovery
 * Gives momentum boost for completion
 */
export async function completeBreakupRecovery(
  userId: string,
  recoveryId: string
): Promise<void> {
  // Mark recovery as complete
  await db.collection('breakup_recovery_states').doc(recoveryId).update({
    phase: 'completed',
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Clear breakup status from Destiny
  await syncDestinyBreakupStatus(userId, false);
  
  // Clear from momentum and give bonus
  await trackMomentumAction(userId, 'breakup_recovery_completed', {
    recoveryId
  });
  
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    inBreakupRecovery: false,
    recoveryPhase: null,
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// PACK 223: DESTINY WEEKS INTEGRATION
// ============================================================================

/**
 * Track Destiny Week reward claimed for momentum
 * Called when user claims Destiny milestone
 */
export async function onDestinyMilestoneClaimed(
  userId: string,
  milestoneId: string,
  rewardType: string,
  scoreThreshold: number
): Promise<void> {
  await trackMomentumAction(userId, 'destiny_reward_claimed', {
    milestoneId,
    rewardType,
    scoreThreshold
  });
}

/**
 * Sync Royal tier status with momentum
 * Royal tier gets 1.25x momentum multiplier
 */
export async function syncRoyalTierStatus(
  userId: string,
  hasRoyalTier: boolean
): Promise<void> {
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    hasRoyalTier,
    updatedAt: serverTimestamp()
  });
  
  // Recalculate boost cache
  await recalculateMomentumBoost(userId);
}

/**
 * Sync Influencer badge status with momentum
 * Influencer badge gets +10% momentum gain
 */
export async function syncInfluencerBadgeStatus(
  userId: string,
  hasInfluencerBadge: boolean
): Promise<void> {
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  await momentumRef.update({
    hasInfluencerBadge,
    updatedAt: serverTimestamp()
  });
  
  // Recalculate boost cache
  await recalculateMomentumBoost(userId);
}

/**
 * Recalculate momentum boost after tier/badge changes
 */
async function recalculateMomentumBoost(userId: string): Promise<void> {
  const state = await getMomentumState(userId);
  
  // Directly update boost cache based on current state
  const boostLevel = calculateBoostLevel(state.score);
  const visualIndicator = getVisualIndicatorFromScore(state.score);
  
  await db.collection('momentum_boost_cache').doc(userId).set({
    userId,
    boostLevel,
    visualIndicator,
    lastUpdate: serverTimestamp()
  });
}

/**
 * Calculate boost level from score
 */
function calculateBoostLevel(score: number): number {
  if (score >= 85) return 2.0; // Peak chemistry
  if (score >= 70) return 1.6; // Trending
  if (score >= 50) return 1.3; // Good match
  return 1.0; // Standard
}

/**
 * Get visual indicator from score
 */
function getVisualIndicatorFromScore(score: number): 'none' | 'soft' | 'neon' | 'pink' | 'peak' {
  if (score >= 85) return 'peak';
  if (score >= 70) return 'pink';
  if (score >= 50) return 'neon';
  if (score >= 20) return 'soft';
  return 'none';
}

// ============================================================================
// SCHEDULED SYNC FUNCTIONS
// ============================================================================

/**
 * Check and progress breakup recovery phases
 * Run daily to move users through recovery stages
 */
export async function checkBreakupRecoveryProgress(): Promise<void> {
  const now = Date.now();
  const recoveryStatesSnap = await db.collection('breakup_recovery_states')
    .where('phase', 'in', ['cooldown', 'rebuild', 'restart'])
    .get();
  
  for (const recoveryDoc of recoveryStatesSnap.docs) {
    const recovery = recoveryDoc.data();
    const phaseStartTime = recovery.phaseStartedAt.toMillis();
    const daysSincePhaseStart = Math.floor((now - phaseStartTime) / (1000 * 60 * 60 * 24));
    
    // Progress phases based on time
    if (recovery.phase === 'cooldown' && daysSincePhaseStart >= 2) {
      await progressToRebuildPhase(recovery.userId, recoveryDoc.id);
    } else if (recovery.phase === 'rebuild' && daysSincePhaseStart >= 3) {
      await progressToRestartPhase(recovery.userId, recoveryDoc.id);
    } else if (recovery.phase === 'restart' && daysSincePhaseStart >= 5) {
      await completeBreakupRecovery(recovery.userId, recoveryDoc.id);
    }
  }
}

// ============================================================================
// EXPORT HOOKS FOR EXTERNAL INTEGRATION
// ============================================================================

export const momentumIntegrationHooks = {
  // Journey hooks
  onJourneyMilestoneUnlocked,
  onJourneyEnded,
  
  // Recovery hooks
  initiateBreakupRecovery,
  progressToRebuildPhase,
  progressToRestartPhase,
  completeBreakupRecovery,
  
  // Destiny hooks
  onDestinyMilestoneClaimed,
  syncRoyalTierStatus,
  syncInfluencerBadgeStatus,
  
  // Scheduled
  checkBreakupRecoveryProgress
};