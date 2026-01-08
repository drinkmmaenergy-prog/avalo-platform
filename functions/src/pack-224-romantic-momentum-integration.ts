/**
 * PACK 224: Dynamic Romantic Momentum Engine - Integration Hooks
 * 
 * Integration points that automatically track momentum actions
 * throughout the existing codebase.
 */

import {
  trackMomentumAction,
  applyMomentumPenalty,
  detectMomentumAbuse,
  getMomentumState
} from './pack-224-romantic-momentum.js';

// ============================================================================
// CHAT & MESSAGING INTEGRATION
// ============================================================================

/**
 * Track first message of the day
 * Call this when a user sends their first message in a 24h period
 */
export async function onFirstMessageOfDay(
  userId: string,
  receiverId: string,
  chatId: string
): Promise<void> {
  const state = await getMomentumState(userId);
  const today = new Date().toISOString().split('T')[0];
  
  // Check if this is truly the first message today
  if (state.lastActionDate !== today) {
    await trackMomentumAction(userId, 'first_message_of_day', {
      receiverId,
      chatId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Track paid messages milestone (20+ messages)
 * Call this after a user sends 20 paid messages in a chat session
 */
export async function onPaidMessages20(
  userId: string,
  receiverId: string,
  chatId: string,
  messageTexts: string[]
): Promise<void> {
  // Check for abuse (copy/paste spam)
  const isAbuse = await detectMomentumAbuse(userId, 'paid_messages_20', {
    receiverId,
    chatId,
    messageTexts
  });
  
  if (!isAbuse) {
    await trackMomentumAction(userId, 'paid_messages_20', {
      receiverId,
      chatId,
      messageCount: messageTexts.length
    });
  }
}

/**
 * Track message streak broken
 * Call this when a user's daily message streak is broken
 */
export async function onMessageStreakBroken(
  userId: string,
  streakDays: number
): Promise<void> {
  if (streakDays >= 3) { // Only penalize if streak was significant
    await applyMomentumPenalty(userId, 'message_streak_broken', {
      streakDays
    });
  }
}

// ============================================================================
// CALL INTEGRATION
// ============================================================================

/**
 * Track voice call completion (10+ minutes)
 * Call this when a voice call ends with 10+ minute duration
 */
export async function onVoiceCallCompleted(
  userId: string,
  partnerId: string,
  callId: string,
  durationSeconds: number
): Promise<void> {
  if (durationSeconds >= 600) { // 10 minutes
    // Check for abuse (fake short calls pattern)
    const isAbuse = await detectMomentumAbuse(userId, 'voice_call_10min', {
      partnerId,
      callId,
      callDuration: durationSeconds
    });
    
    if (!isAbuse) {
      await trackMomentumAction(userId, 'voice_call_10min', {
        partnerId,
        callId,
        callDuration: durationSeconds
      });
    }
  }
}

/**
 * Track video call completion
 * Call this when a video call ends successfully
 */
export async function onVideoCallCompleted(
  userId: string,
  partnerId: string,
  callId: string,
  durationSeconds: number
): Promise<void> {
  // Video calls require at least 5 minutes
  if (durationSeconds >= 300) {
    const isAbuse = await detectMomentumAbuse(userId, 'video_call', {
      partnerId,
      callId,
      callDuration: durationSeconds
    });
    
    if (!isAbuse) {
      await trackMomentumAction(userId, 'video_call', {
        partnerId,
        callId,
        callDuration: durationSeconds
      });
    }
  }
}

/**
 * Track call cancelled late
 * Call this when a scheduled call is cancelled within 2 hours
 */
export async function onCallCancelledLate(
  userId: string,
  callId: string,
  hoursBeforeCall: number
): Promise<void> {
  if (hoursBeforeCall <= 2) {
    await applyMomentumPenalty(userId, 'call_cancelled_late', {
      callId,
      hoursBeforeCall
    });
  }
}

// ============================================================================
// MEETING INTEGRATION
// ============================================================================

/**
 * Track verified meeting
 * Call this when a meeting is verified via QR code + selfie match
 */
export async function onMeetingVerified(
  userId: string,
  partnerId: string,
  meetingId: string,
  selfieMatchScore: number
): Promise<void> {
  // Verify selfie match quality
  const selfieMatch = selfieMatchScore >= 0.7; // 70% match threshold
  
  const isAbuse = await detectMomentumAbuse(userId, 'meeting_verified', {
    partnerId,
    meetingId,
    selfieMatch,
    selfieMatchScore
  });
  
  if (!isAbuse && selfieMatch) {
    await trackMomentumAction(userId, 'meeting_verified', {
      partnerId,
      meetingId,
      selfieMatchScore
    });
  }
}

/**
 * Track meeting no-show
 * Call this when a user doesn't show up for a scheduled meeting
 */
export async function onMeetingNoShow(
  userId: string,
  meetingId: string,
  partnerId: string
): Promise<void> {
  await applyMomentumPenalty(userId, 'meeting_no_show', {
    meetingId,
    partnerId
  });
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

/**
 * Track event participation
 * Call this when a user joins an event
 */
export async function onEventParticipation(
  userId: string,
  eventId: string,
  eventType: string
): Promise<void> {
  await trackMomentumAction(userId, 'event_participation', {
    eventId,
    eventType
  });
}

/**
 * Track event hosting
 * Call this when a user hosts an event
 */
export async function onEventHosting(
  userId: string,
  eventId: string,
  eventType: string,
  attendeeCount: number
): Promise<void> {
  await trackMomentumAction(userId, 'event_hosting', {
    eventId,
    eventType,
    attendeeCount
  });
}

// ============================================================================
// PACK INTEGRATION
// ============================================================================

/**
 * Track Destiny Week reward claimed (PACK 223)
 * Call this when user claims a Destiny Week milestone reward
 */
export async function onDestinyRewardClaimed(
  userId: string,
  rewardId: string,
  rewardType: string
): Promise<void> {
  await trackMomentumAction(userId, 'destiny_reward_claimed', {
    rewardId,
    rewardType
  });
}

/**
 * Track Breakup Recovery completion (PACK 222)
 * Call this when user completes breakup recovery program
 */
export async function onBreakupRecoveryCompleted(
  userId: string,
  recoveryId: string
): Promise<void> {
  await trackMomentumAction(userId, 'breakup_recovery_completed', {
    recoveryId
  });
}

// ============================================================================
// SAFETY & COMPLIANCE INTEGRATION
// ============================================================================

/**
 * Track verified safety complaint
 * Call this when a safety complaint against a user is verified
 */
export async function onSafetyComplaintVerified(
  userId: string,
  complaintId: string,
  complaintType: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  await applyMomentumPenalty(userId, 'safety_complaint_verified', {
    complaintId,
    complaintType,
    severity
  });
}

// ============================================================================
// BATCH OPERATIONS (for scheduled functions)
// ============================================================================

/**
 * Check inactivity penalties for all users
 * Run this daily via Cloud Scheduler
 */
export async function checkAllUsersInactivity(): Promise<void> {
  const { db } = await import('./init.js');
  const { checkInactivityPenalties } = await import('./pack-224-romantic-momentum.js');
  
  const statesSnap = await db.collection('romantic_momentum_states').get();
  
  const batch = [];
  for (const stateDoc of statesSnap.docs) {
    batch.push(checkInactivityPenalties(stateDoc.id));
    
    // Process in batches of 100
    if (batch.length >= 100) {
      await Promise.all(batch);
      batch.length = 0;
    }
  }
  
  if (batch.length > 0) {
    await Promise.all(batch);
  }
}

/**
 * Create daily momentum snapshot
 * Run this daily at midnight via Cloud Scheduler
 */
export async function createDailySnapshot(): Promise<void> {
  const { createDailyMomentumSnapshot } = await import('./pack-224-romantic-momentum.js');
  await createDailyMomentumSnapshot();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Bulk track momentum for multiple users
 * Useful for batch operations
 */
export async function bulkTrackMomentum(
  actions: Array<{
    userId: string;
    action: string;
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  const promises = actions.map(({ userId, action, metadata }) =>
    trackMomentumAction(userId, action as any, metadata)
  );
  
  await Promise.all(promises);
}

/**
 * Get momentum stats for analytics
 */
export async function getMomentumStats(userId: string): Promise<{
  currentScore: number;
  trend: string;
  actionsToday: number;
  consecutiveDays: number;
  visualIndicator: string;
}> {
  const state = await getMomentumState(userId);
  const { getMomentumVisualIndicator } = await import('./pack-224-romantic-momentum.js');
  const visual = await getMomentumVisualIndicator(userId);
  
  return {
    currentScore: state.score,
    trend: state.trend,
    actionsToday: state.actionsToday,
    consecutiveDays: state.consecutiveDaysActive,
    visualIndicator: visual?.indicatorLevel || 'none'
  };
}