/**
 * PACK 223: Destiny Weeks - Integration Hooks
 * 
 * This file provides easy-to-use integration hooks that other systems
 * can call to track Destiny actions without needing to know implementation details.
 */

import { trackDestinyAction } from './pack-223-destiny-weeks.js';

// ============================================================================
// CHAT INTEGRATION
// ============================================================================

/**
 * Called when users match via swipe
 */
export async function onSwipeMatch(
  userId1: string,
  userId2: string
): Promise<void> {
  try {
    // Track for both users
    await Promise.all([
      trackDestinyAction(userId1, 'swipe_match', { partnerId: userId2 }),
      trackDestinyAction(userId2, 'swipe_match', { partnerId: userId1 })
    ]);
  } catch (error) {
    console.error('Failed to track Destiny swipe match:', error);
  }
}

/**
 * Called when first message is sent in a chat
 */
export async function onFirstMessage(
  senderId: string,
  receiverId: string,
  chatId: string
): Promise<void> {
  try {
    await trackDestinyAction(senderId, 'first_message', {
      receiverId,
      chatId
    });
  } catch (error) {
    console.error('Failed to track Destiny first message:', error);
  }
}

/**
 * Called when a chat reaches 20+ messages
 */
export async function onChatCompleted(
  userId1: string,
  userId2: string,
  chatId: string,
  messageCount: number
): Promise<void> {
  try {
    // Track for both users
    await Promise.all([
      trackDestinyAction(userId1, 'complete_chat', {
        partnerId: userId2,
        chatId,
        messageCount
      }),
      trackDestinyAction(userId2, 'complete_chat', {
        partnerId: userId1,
        chatId,
        messageCount
      })
    ]);
  } catch (error) {
    console.error('Failed to track Destiny chat completion:', error);
  }
}

// ============================================================================
// CALL INTEGRATION
// ============================================================================

/**
 * Called when voice call is completed successfully
 */
export async function onVoiceCallCompleted(
  userId1: string,
  userId2: string,
  callId: string,
  durationMinutes: number
): Promise<void> {
  try {
    // Track for both users
    await Promise.all([
      trackDestinyAction(userId1, 'voice_call', {
        partnerId: userId2,
        callId,
        durationMinutes
      }),
      trackDestinyAction(userId2, 'voice_call', {
        partnerId: userId1,
        callId,
        durationMinutes
      })
    ]);
  } catch (error) {
    console.error('Failed to track Destiny voice call:', error);
  }
}

/**
 * Called when video call is completed successfully
 */
export async function onVideoCallCompleted(
  userId1: string,
  userId2: string,
  callId: string,
  durationMinutes: number
): Promise<void> {
  try {
    // Track for both users
    await Promise.all([
      trackDestinyAction(userId1, 'video_call', {
        partnerId: userId2,
        callId,
        durationMinutes
      }),
      trackDestinyAction(userId2, 'video_call', {
        partnerId: userId1,
        callId,
        durationMinutes
      })
    ]);
  } catch (error) {
    console.error('Failed to track Destiny video call:', error);
  }
}

// ============================================================================
// MEETING INTEGRATION
// ============================================================================

/**
 * Called when meeting is verified via QR code
 */
export async function onMeetingVerified(
  userId1: string,
  userId2: string,
  meetingId: string
): Promise<void> {
  try {
    // Track for both users
    await Promise.all([
      trackDestinyAction(userId1, 'meeting_verified', {
        partnerId: userId2,
        meetingId
      }),
      trackDestinyAction(userId2, 'meeting_verified', {
        partnerId: userId1,
        meetingId
      })
    ]);
  } catch (error) {
    console.error('Failed to track Destiny meeting verification:', error);
  }
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

/**
 * Called when user joins an event
 */
export async function onEventJoined(
  userId: string,
  eventId: string,
  eventType: string
): Promise<void> {
  try {
    await trackDestinyAction(userId, 'join_event', {
      eventId,
      eventType
    });
  } catch (error) {
    console.error('Failed to track Destiny event join:', error);
  }
}

/**
 * Called when user hosts an event
 */
export async function onEventHosted(
  userId: string,
  eventId: string,
  eventType: string,
  attendeeCount: number
): Promise<void> {
  try {
    await trackDestinyAction(userId, 'host_event', {
      eventId,
      eventType,
      attendeeCount
    });
  } catch (error) {
    console.error('Failed to track Destiny event hosting:', error);
  }
}

// ============================================================================
// BATCH TRACKING (for retroactive scoring)
// ============================================================================

/**
 * Track multiple actions at once (useful for retroactive scoring)
 */
export async function trackDestinyActions(
  userId: string,
  actions: Array<{
    action: string;
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  try {
    for (const { action, metadata } of actions) {
      await trackDestinyAction(userId, action as any, metadata);
    }
  } catch (error) {
    console.error('Failed to track batch Destiny actions:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR MONITORING
// ============================================================================

/**
 * Check if chat has reached completion threshold (20 messages)
 * Call this periodically during chat to track completion
 */
export async function checkChatCompletionThreshold(
  chatId: string,
  currentMessageCount: number,
  userId1: string,
  userId2: string
): Promise<boolean> {
  const COMPLETION_THRESHOLD = 20;
  
  if (currentMessageCount === COMPLETION_THRESHOLD) {
    await onChatCompleted(userId1, userId2, chatId, currentMessageCount);
    return true;
  }
  
  return false;
}

/**
 * Check if call duration is significant (trigger on first minute, then every 5 minutes)
 */
export async function checkCallMilestones(
  callId: string,
  callType: 'voice' | 'video',
  durationMinutes: number,
  userId1: string,
  userId2: string
): Promise<void> {
  // Track first minute
  if (durationMinutes === 1) {
    if (callType === 'voice') {
      await onVoiceCallCompleted(userId1, userId2, callId, durationMinutes);
    } else {
      await onVideoCallCompleted(userId1, userId2, callId, durationMinutes);
    }
  }
  
  // Track every 5 minutes afterward
  if (durationMinutes > 1 && durationMinutes % 5 === 0) {
    if (callType === 'voice') {
      await onVoiceCallCompleted(userId1, userId2, callId, durationMinutes);
    } else {
      await onVideoCallCompleted(userId1, userId2, callId, durationMinutes);
    }
  }
}