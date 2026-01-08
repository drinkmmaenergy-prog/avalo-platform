/**
 * PACK 237: Breakup Recovery & Restart Path - Core Engine
 *
 * Handles graceful endings when couples stop interacting, protecting emotions,
 * reputation, and platform safety while gently re-opening paths to new connections.
 *
 * KEY FEATURES:
 * - Clean ending with confirmation flow
 * - 3-7 day recovery period (self-adjusting)
 * - Feature blocking during recovery
 * - Recovery feed with affirmations
 * - Ordered restart path progression
 * - Safety overrides for immediate breakup
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';
import type {
  BreakupRecoveryState,
  EndConnectionRequest,
  EndedConnection,
  RecoveryFeedItem,
  RestartPathOffer,
  BreakupSafetyIncident,
  BreakupRecoveryAnalytics,
  BreakupTriggerReason,
  RestartStage,
  BreakupRecoveryStatus
} from './pack237-breakup-recovery-types.js';
import { CLOSING_NOTE_MESSAGES, RECOVERY_STAGE_UNLOCKS } from './pack237-breakup-recovery-types.js';
import {
  sendEndConnectionNotification,
  sendStageUnlockNotification,
  sendRecoveryCompleteNotification,
  createRecoveryAnalytics,
  completeRecoveryAnalytics,
  generateRestartPathOffers
} from './pack237-breakup-recovery-helpers.js';

// ============================================================================
// CLEAN ENDING FLOW
// ============================================================================

/**
 * Initiate "End Connection" request
 * Requires confirmation from the other user (unless safety override)
 */
export async function initiateEndConnection(
  connectionId: string,
  initiatorId: string,
  respondentId: string,
  closingNote: 'thank_you' | 'good_wishes' | 'closing_chapter'
): Promise<{ requestId: string; requiresConfirmation: boolean }> {
  
  // Check if connection exists
  const connectionSnap = await db.collection('connections').doc(connectionId).get();
  if (!connectionSnap.exists) {
    throw new Error('Connection not found');
  }
  
  const requestId = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days
  
  const request: Omit<EndConnectionRequest, 'createdAt' | 'updatedAt'> & {
    createdAt: any;
    updatedAt: any;
  } = {
    requestId,
    connectionId,
    initiatorId,
    respondentId,
    closingNote,
    status: 'pending_confirmation',
    expiresAt: expiresAt as any,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await db.collection('end_connection_requests').doc(requestId).set(request);
  
  // Send notification to respondent
  await sendEndConnectionNotification(respondentId, initiatorId, requestId);
  
  return { requestId, requiresConfirmation: true };
}

/**
 * Confirm end connection request
 */
export async function confirmEndConnection(
  requestId: string,
  respondentId: string
): Promise<{ success: boolean; endedConnectionId: string }> {
  
  const requestRef = db.collection('end_connection_requests').doc(requestId);
  const requestSnap = await requestRef.get();
  
  if (!requestSnap.exists) {
    throw new Error('End connection request not found');
  }
  
  const request = requestSnap.data() as EndConnectionRequest;
  
  // Verify respondent
  if (request.respondentId !== respondentId) {
    throw new Error('Not authorized to confirm this request');
  }
  
  if (request.status !== 'pending_confirmation') {
    throw new Error('Request already processed');
  }
  
  // Update request status
  await requestRef.update({
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Execute breakup
  const endedConnectionId = await executeBreakup(
    request.connectionId,
    request.initiatorId,
    request.respondentId,
    'mutual',
    request.closingNote
  );
  
  return { success: true, endedConnectionId };
}

/**
 * Decline end connection request
 */
export async function declineEndConnection(
  requestId: string,
  respondentId: string
): Promise<{ success: boolean }> {
  
  const requestRef = db.collection('end_connection_requests').doc(requestId);
  const requestSnap = await requestRef.get();
  
  if (!requestSnap.exists) {
    throw new Error('End connection request not found');
  }
  
  const request = requestSnap.data() as EndConnectionRequest;
  
  if (request.respondentId !== respondentId) {
    throw new Error('Not authorized to decline this request');
  }
  
  if (request.status !== 'pending_confirmation') {
    throw new Error('Request already processed');
  }
  
  await requestRef.update({
    status: 'declined',
    declinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { success: true };
}

/**
 * Execute immediate breakup (no confirmation needed)
 * Used for blocking, safety incidents, or timeout
 */
export async function executeImmediateBreakup(
  connectionId: string,
  userId: string,
  partnerId: string,
  reason: 'blocked' | 'safety' | 'timeout',
  safetyIncidentId?: string
): Promise<{ endedConnectionId: string; recoveryIds: string[] }> {
  
  const endedConnectionId = await executeBreakup(
    connectionId,
    userId,
    partnerId,
    reason,
    undefined,
    safetyIncidentId
  );
  
  // Get recovery IDs
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('connectionId', '==', connectionId)
    .get();
  
  const recoveryIds = recoverySnap.docs.map(doc => doc.id);
  
  return { endedConnectionId, recoveryIds };
}

/**
 * Core breakup execution logic
 */
async function executeBreakup(
  connectionId: string,
  user1Id: string,
  user2Id: string,
  reason: BreakupTriggerReason,
  closingNote?: 'thank_you' | 'good_wishes' | 'closing_chapter',
  safetyIncidentId?: string
): Promise<string> {
  
  // Create ended connection record
  // Map 'blocked' to 'block' for type compatibility
  const endedByValue = reason === 'blocked' ? 'block' : reason;
  
  const endedConnection: Omit<EndedConnection, 'endedAt' | 'createdAt'> & {
    endedAt: any;
    createdAt: any;
  } = {
    connectionId,
    user1Id,
    user2Id,
    endedAt: serverTimestamp(),
    endedBy: endedByValue as any,
    user1ClosingNote: closingNote,
    chatLocked: true,
    trophyCabinetArchived: true,
    memoryLogViewOnly: true,
    profileVisibilityChoice: 'hidden', // Default to hidden
    createdAt: serverTimestamp()
  };
  
  await db.collection('ended_connections').doc(connectionId).set(endedConnection);
  
  // Lock the connection/chat
  await db.collection('connections').doc(connectionId).update({
    status: 'ended',
    endedAt: serverTimestamp(),
    chatLocked: true,
    updatedAt: serverTimestamp()
  });
  
  // Create recovery states for both users
  const recoveryDuration = calculateRecoveryDuration(reason);
  
  await Promise.all([
    createBreakupRecoveryState(user1Id, user2Id, connectionId, reason, recoveryDuration, safetyIncidentId),
    createBreakupRecoveryState(user2Id, user1Id, connectionId, reason, recoveryDuration, safetyIncidentId)
  ]);
  
  return connectionId;
}

/**
 * Calculate recovery duration based on breakup reason
 */
function calculateRecoveryDuration(reason: BreakupTriggerReason): number {
  const durations: Record<BreakupTriggerReason, number> = {
    'mutual': 5,      // 5 days for mutual ending
    'blocked': 7,     // 7 days for block
    'safety': 7,      // 7 days for safety
    'timeout': 3      // 3 days for timeout
  };
  
  return durations[reason] || 5;
}

// ============================================================================
// RECOVERY STATE MANAGEMENT
// ============================================================================

/**
 * Create breakup recovery state for a user
 */
async function createBreakupRecoveryState(
  userId: string,
  partnerId: string,
  connectionId: string,
  reason: BreakupTriggerReason,
  durationDays: number,
  safetyIncidentId?: string
): Promise<string> {
  
  const recoveryId = generateId();
  const now = new Date();
  const endDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
  
  // Check if safety override needed
  const safetyOverride = reason === 'safety' || !!safetyIncidentId;
  
  const recoveryState: BreakupRecoveryState = {
    recoveryId,
    userId,
    partnerId,
    connectionId,
    status: 'active',
    reason,
    startDate: serverTimestamp() as any,
    endDate: endDate as any,
    expectedDuration: durationDays,
    restartStage: 0,
    featuresBlocked: {
      paidChat: true,
      calls: true,
      meetups: true,
      discoveryFeed: true,
      swipeQueue: true,
      events: true, // Events with non-friends
      calendar: true
    },
    emotionalSignals: {
      activityLevel: 'very_low',
      recoveryFeedEngagement: 0,
      affirmationsViewed: 0,
      profileImprovementsViewed: 0
    },
    safetyOverride,
    safetyIncidentId,
    permanentBlock: false,
    restartedDiscovery: false,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await db.collection('breakup_recovery_states').doc(recoveryId).set(recoveryState);
  
  // Generate initial recovery feed items
  await generateInitialRecoveryFeed(userId, recoveryId);
  
  // Create analytics tracking
  await createRecoveryAnalytics(userId, recoveryId, durationDays);
  
  return recoveryId;
}

/**
 * Get active recovery state for user
 */
export async function getActiveRecoveryState(
  userId: string
): Promise<BreakupRecoveryState | null> {
  
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('status', 'in', ['active', 'cooldown'])
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (recoverySnap.empty) {
    return null;
  }
  
  return recoverySnap.docs[0].data() as BreakupRecoveryState;
}

/**
 * Check if feature is blocked for user
 */
export async function isFeatureBlocked(
  userId: string,
  feature: keyof BreakupRecoveryState['featuresBlocked']
): Promise<boolean> {
  
  const recovery = await getActiveRecoveryState(userId);
  
  if (!recovery) {
    return false;
  }
  
  return recovery.featuresBlocked[feature] || false;
}

// ============================================================================
// RESTART PATH PROGRESSION
// ============================================================================

/**
 * Update restart stage progression (called by cron job)
 */
export async function progressRestartStages(): Promise<{ updated: number }> {
  
  const now = new Date();
  let updated = 0;
  
  // Get all active recovery states
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('status', '==', 'active')
    .get();
  
  for (const doc of recoverySnap.docs) {
    const recovery = doc.data() as BreakupRecoveryState;
    const startTime = recovery.startDate.toDate().getTime();
    const daysSinceStart = (now.getTime() - startTime) / (24 * 60 * 60 * 1000);
    
    // Adjust progression based on activity level
    const speedMultiplier = getProgressionSpeedMultiplier(recovery.emotionalSignals.activityLevel);
    const adjustedDays = daysSinceStart * speedMultiplier;
    
    let newStage: RestartStage = recovery.restartStage;
    
    // Stage progression thresholds
    if (adjustedDays >= 3 && recovery.restartStage === 0) {
      newStage = 1; // Unlock discovery feed
    } else if (adjustedDays >= 4 && recovery.restartStage === 1) {
      newStage = 2; // Unlock swipe queue
    } else if (adjustedDays >= 5 && recovery.restartStage === 2) {
      newStage = 3; // Unlock paid chat
    } else if (adjustedDays >= recovery.expectedDuration && recovery.restartStage === 3) {
      newStage = 4; // Full restart
    }
    
    if (newStage !== recovery.restartStage) {
      await advanceRestartStage(recovery.recoveryId, newStage);
      updated++;
    }
    
    // Check if recovery period is complete
    if (now >= recovery.endDate.toDate() && recovery.restartStage === 4) {
      await completeRecovery(recovery.recoveryId);
    }
  }
  
  return { updated };
}

/**
 * Get progression speed multiplier based on activity
 */
function getProgressionSpeedMultiplier(activityLevel: string): number {
  const multipliers: Record<string, number> = {
    'very_low': 0.8,  // Slower progression
    'low': 1.0,       // Normal
    'medium': 1.2,    // Slightly faster
    'high': 1.5       // Much faster
  };
  
  return multipliers[activityLevel] || 1.0;
}

/**
 * Advance to next restart stage
 */
async function advanceRestartStage(
  recoveryId: string,
  newStage: RestartStage
): Promise<void> {
  
  const recoveryRef = db.collection('breakup_recovery_states').doc(recoveryId);
  const recoverySnap = await recoveryRef.get();
  
  if (!recoverySnap.exists) return;
  
  const recovery = recoverySnap.data() as BreakupRecoveryState;
  
  // Update features based on stage
  const updatedFeatures = updateFeaturesForStage(newStage);
  
  await recoveryRef.update({
    restartStage: newStage,
    featuresBlocked: updatedFeatures,
    [`stageUnlockedAt.stage${newStage}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Generate recovery feed items for this stage
  await generateStageRecoveryFeed(recovery.userId, recoveryId, newStage);
  
  // Generate restart path offers for monetization
  if (newStage >= 2) {
    await generateRestartPathOffers(recovery.userId, recoveryId, newStage);
  }
  
  // Send notification about unlock
  await sendStageUnlockNotification(recovery.userId, newStage);
}

/**
 * Update feature blocks based on stage
 */
function updateFeaturesForStage(stage: RestartStage): BreakupRecoveryState['featuresBlocked'] {
  const features: BreakupRecoveryState['featuresBlocked'] = {
    paidChat: true,
    calls: true,
    meetups: true,
    discoveryFeed: true,
    swipeQueue: true,
    events: true,
    calendar: true
  };
  
  // Unlock features progressively
  if (stage >= 1) {
    features.discoveryFeed = false; // Stage 1: Discovery
  }
  if (stage >= 2) {
    features.swipeQueue = false; // Stage 2: Swipe
  }
  if (stage >= 3) {
    features.paidChat = false; // Stage 3: Chat
    features.calls = false;
  }
  if (stage >= 4) {
    features.events = false; // Stage 4: Full restart
    features.calendar = false;
    features.meetups = false;
  }
  
  return features;
}

/**
 * Complete recovery and transition to normal state
 */
async function completeRecovery(recoveryId: string): Promise<void> {
  
  const recoveryRef = db.collection('breakup_recovery_states').doc(recoveryId);
  const recoverySnap = await recoveryRef.get();
  
  if (!recoverySnap.exists) return;
  
  const recovery = recoverySnap.data() as BreakupRecoveryState;
  
  await recoveryRef.update({
    status: 'inactive',
    restartedDiscovery: true,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Complete analytics
  await completeRecoveryAnalytics(recoveryId);
  
  // Send completion notification
  await sendRecoveryCompleteNotification(recovery.userId);
}

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

/**
 * Track user activity during recovery to adjust timeline
 */
export async function trackRecoveryActivity(
  userId: string,
  activityType: 'login' | 'recovery_feed_view' | 'profile_improvement' | 'affirmation_view'
): Promise<void> {
  
  const recovery = await getActiveRecoveryState(userId);
  if (!recovery) return;
  
  const activityScores: Record<string, number> = {
    'login': 1,
    'recovery_feed_view': 2,
    'profile_improvement': 3,
    'affirmation_view': 1
  };
  
  const score = activityScores[activityType] || 1;
  
  // Determine activity level
  let activityLevel: 'very_low' | 'low' | 'medium' | 'high' = 'very_low';
  if (score >= 3) activityLevel = 'high';
  else if (score >= 2) activityLevel = 'medium';
  else if (score >= 1) activityLevel = 'low';
  
  // Update activity tracking
  await db.collection('breakup_recovery_states').doc(recovery.recoveryId).update({
    'emotionalSignals.activityLevel': activityLevel,
    'emotionalSignals.lastActiveAt': serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Update specific counters
  if (activityType === 'affirmation_view') {
    await db.collection('breakup_recovery_states').doc(recovery.recoveryId).update({
      'emotionalSignals.affirmationsViewed': increment(1)
    });
  } else if (activityType === 'profile_improvement') {
    await db.collection('breakup_recovery_states').doc(recovery.recoveryId).update({
      'emotionalSignals.profileImprovementsViewed': increment(1)
    });
  }
}

// ============================================================================
// RECOVERY FEED GENERATION
// ============================================================================

/**
 * Generate initial recovery feed items
 */
async function generateInitialRecoveryFeed(
  userId: string,
  recoveryId: string
): Promise<void> {
  
  const items: Omit<RecoveryFeedItem, 'itemId' | 'createdAt'>[] = [
    {
      userId,
      recoveryId,
      type: 'affirmation',
      title: 'Take your time',
      message: 'When you\'re ready, we\'ll help you find chemistry again. There\'s no rush.',
      icon: '🌟'
    },
    {
      userId,
      recoveryId,
      type: 'self_esteem_booster',
      title: 'You\'re valuable',
      message: 'Every connection teaches us something. You\'re growing and evolving.',
      icon: '💫',
      scheduledFor: new Date(Date.now() + (24 * 60 * 60 * 1000)) as any
    }
  ];
  
  for (const item of items) {
    const itemId = generateId();
    await db.collection('recovery_feed_items').doc(itemId).set({
      itemId,
      ...item,
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Generate stage-specific recovery feed
 */
async function generateStageRecoveryFeed(
  userId: string,
  recoveryId: string,
  stage: RestartStage
): Promise<void> {
  
  const stageMessages: Record<RestartStage, Omit<RecoveryFeedItem, 'itemId' | 'userId' | 'recoveryId' | 'createdAt'>[]> = {
    0: [],
    1: [{
      type: 'milestone',
      title: 'Discovery Unlocked',
      message: 'You can now browse profiles again. Take it at your own pace.',
      icon: '🔓'
    }],
    2: [{
      type: 'milestone',
      title: 'Swipe Queue Unlocked',
      message: 'Ready to start making connections? Your journey continues.',
      icon: '💝'
    }],
    3: [{
      type: 'milestone',
      title: 'Chat Unlocked',
      message: 'You can now start conversations. New connections await.',
      icon: '💬'
    }],
    4: [{
      type: 'restart_prompt',
      title: 'Every ending creates space for something new',
      message: 'All features unlocked. Welcome back to Avalo.',
      icon: '✨',
      actionLabel: 'Explore Discovery',
      actionType: 'view_discovery'
    }]
  };
  
  const messages = stageMessages[stage] || [];
  
  for (const msg of messages) {
    const itemId = generateId();
    await db.collection('recovery_feed_items').doc(itemId).set({
      itemId,
      userId,
      recoveryId,
      ...msg,
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Get recovery feed for user
 */
export async function getRecoveryFeed(
  userId: string,
  limit: number = 10
): Promise<RecoveryFeedItem[]> {
  
  const recovery = await getActiveRecoveryState(userId);
  if (!recovery) return [];
  
  const now = new Date();
  
  const feedSnap = await db.collection('recovery_feed_items')
    .where('userId', '==', userId)
    .where('recoveryId', '==', recovery.recoveryId)
    .where('dismissedAt', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return feedSnap.docs
    .map(doc => doc.data() as RecoveryFeedItem)
    .filter(item => !item.scheduledFor || item.scheduledFor.toDate() <= now);
}

// Continued in next part...