/**
 * PACK 245: Audience Classification & VIP Segmenting
 * Integration hooks to trigger segment updates from other systems
 */

import { db, serverTimestamp } from './init.js';
import { 
  computeAudienceSegment,
  computeBudgetClassification,
  computeIntentClassification,
  computeProximity,
  computePassionSignals
} from './pack245-audience-segments-engine';
import type { SegmentUpdateTrigger } from './pack245-audience-segments-types';

// ========================================================================
// Queue Management
// ========================================================================

/**
 * Add segment update to queue
 */
async function queueSegmentUpdate(trigger: SegmentUpdateTrigger): Promise<void> {
  const queueRef = db.collection('segment_computation_queue').doc();
  
  await queueRef.set({
    id: queueRef.id,
    viewerId: trigger.userId,
    creatorId: trigger.creatorId,
    computationType: 'incremental',
    status: 'pending',
    priority: trigger.priority,
    scheduledAt: serverTimestamp(),
    startedAt: null,
    completedAt: null,
    error: null,
    retryCount: 0,
    maxRetries: 3,
    trigger: trigger.source,
    context: trigger.context || {}
  });
}

/**
 * Process segment update immediately (for high priority events)
 */
async function processSegmentUpdateImmediate(trigger: SegmentUpdateTrigger): Promise<void> {
  try {
    if (trigger.creatorId) {
      // Update specific relationship
      await computeAudienceSegment(trigger.userId, trigger.creatorId);
    } else {
      // Update all relationships for user (budget/intent only)
      if (trigger.source === 'purchase') {
        await computeBudgetClassification(trigger.userId);
      }
      if (trigger.source === 'chat' || trigger.source === 'call' || 
          trigger.source === 'meeting' || trigger.source === 'event') {
        await computeIntentClassification(trigger.userId);
      }
    }
  } catch (error) {
    console.error('Failed to process immediate segment update:', error);
    // Fall back to queue
    await queueSegmentUpdate(trigger);
  }
}

// ========================================================================
// Hook: Transaction/Purchase Events
// ========================================================================

/**
 * Hook into transaction completion to update budget segment
 * Called after any token spend transaction
 */
export async function onTransactionCompleted(params: {
  userId: string;
  amount: number;
  type: string;
  targetUserId?: string;
}): Promise<void> {
  const { userId, amount, type, targetUserId } = params;
  
  // Only update for spending transactions
  if (amount >= 0) return;
  
  const trigger: SegmentUpdateTrigger = {
    userId,
    creatorId: targetUserId || null,
    source: 'purchase',
    priority: 7, // High priority for budget updates
    context: {
      transactionType: type,
      amount: Math.abs(amount)
    }
  };
  
  // Immediate update for significant purchases
  if (Math.abs(amount) > 100) {
    await processSegmentUpdateImmediate(trigger);
  } else {
    await queueSegmentUpdate(trigger);
  }
}

// ========================================================================
// Hook: Chat Events
// ========================================================================

/**
 * Hook into chat completion to update intent and passion segments
 */
export async function onChatCompleted(params: {
  chatId: string;
  payerId: string;
  earnerId: string | null;
  totalTokens: number;
  messageCount: number;
}): Promise<void> {
  const { payerId, earnerId, totalTokens } = params;
  
  // Update payer's intent and passion
  if (earnerId) {
    const trigger: SegmentUpdateTrigger = {
      userId: payerId,
      creatorId: earnerId,
      source: 'chat',
      priority: 6,
      context: {
        totalTokens,
        action: 'chat_completed'
      }
    };
    
    await queueSegmentUpdate(trigger);
  }
}

/**
 * Hook into chat message send to track engagement
 */
export async function onChatMessageSent(params: {
  chatId: string;
  senderId: string;
  receiverId: string;
  messageLength: number;
}): Promise<void> {
  const { senderId, receiverId } = params;
  
  // Low priority - batch these updates
  const trigger: SegmentUpdateTrigger = {
    userId: senderId,
    creatorId: receiverId,
    source: 'chat',
    priority: 3,
    context: {
      action: 'message_sent'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

// ========================================================================
// Hook: Call Events
// ========================================================================

/**
 * Hook into call completion to update intent segment
 */
export async function onCallCompleted(params: {
  callId: string;
  payerId: string;
  earnerId: string | null;
  durationMinutes: number;
  totalTokens: number;
  callType: string;
}): Promise<void> {
  const { payerId, earnerId, durationMinutes, totalTokens } = params;
  
  // Update payer's intent
  if (earnerId) {
    const trigger: SegmentUpdateTrigger = {
      userId: payerId,
      creatorId: earnerId,
      source: 'call',
      priority: 7, // High priority - calls are expensive
      context: {
        durationMinutes,
        totalTokens,
        action: 'call_completed'
      }
    };
    
    // Immediate update for significant calls
    if (durationMinutes >= 5) {
      await processSegmentUpdateImmediate(trigger);
    } else {
      await queueSegmentUpdate(trigger);
    }
  }
}

// ========================================================================
// Hook: Meeting/Calendar Events
// ========================================================================

/**
 * Hook into meeting booking to update intent and proximity segments
 */
export async function onMeetingBooked(params: {
  bookingId: string;
  attendeeId: string;
  creatorId: string;
  cost: number;
  meetingDate: Date;
}): Promise<void> {
  const { attendeeId, creatorId, cost } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId: attendeeId,
    creatorId,
    source: 'meeting',
    priority: 8, // Very high priority - meetings indicate strong intent
    context: {
      cost,
      action: 'meeting_booked'
    }
  };
  
  // Immediate update - meetings are high-value signals
  await processSegmentUpdateImmediate(trigger);
}

/**
 * Hook into meeting completion to update passion segment
 */
export async function onMeetingCompleted(params: {
  bookingId: string;
  attendeeId: string;
  creatorId: string;
  rating?: number;
}): Promise<void> {
  const { attendeeId, creatorId, rating } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId: attendeeId,
    creatorId,
    source: 'meeting',
    priority: 7,
    context: {
      rating,
      action: 'meeting_completed'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

// ========================================================================
// Hook: Event Participation
// ========================================================================

/**
 * Hook into event registration to update intent segment
 */
export async function onEventRegistered(params: {
  eventId: string;
  userId: string;
  organizerId: string;
  cost: number;
}): Promise<void> {
  const { userId, organizerId, cost } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId,
    creatorId: organizerId,
    source: 'event',
    priority: 7,
    context: {
      cost,
      action: 'event_registered'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

/**
 * Hook into event attendance to update passion segment
 */
export async function onEventAttended(params: {
  eventId: string;
  userId: string;
  organizerId: string;
  rating?: number;
}): Promise<void> {
  const { userId, organizerId, rating } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId,
    creatorId: organizerId,
    source: 'event',
    priority: 6,
    context: {
      rating,
      action: 'event_attended'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

// ========================================================================
// Hook: Profile & Location Updates
// ========================================================================

/**
 * Hook into location update to update proximity segments
 */
export async function onLocationUpdated(params: {
  userId: string;
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  countryCode: string;
}): Promise<void> {
  const { userId } = params;
  
  // Get all relationships for this user to update proximity
  const segmentsSnap = await db
    .collection('audience_segments')
    .where('viewerId', '==', userId)
    .limit(50) // Batch limit
    .get();
  
  for (const doc of segmentsSnap.docs) {
    const segment = doc.data();
    const trigger: SegmentUpdateTrigger = {
      userId,
      creatorId: segment.creatorId,
      source: 'location',
      priority: 4,
      context: {
        action: 'location_updated'
      }
    };
    
    await queueSegmentUpdate(trigger);
  }
}

/**
 * Hook into profile update to update passion segments (interests changed)
 */
export async function onProfileInterestsUpdated(params: {
  userId: string;
  oldInterests: string[];
  newInterests: string[];
}): Promise<void> {
  const { userId, oldInterests, newInterests } = params;
  
  // Check if interests actually changed
  const oldSet = new Set(oldInterests);
  const newSet = new Set(newInterests);
  const hasChanges = oldInterests.length !== newInterests.length ||
                    oldInterests.some(i => !newSet.has(i));
  
  if (!hasChanges) return;
  
  // Get all relationships to update passion signals
  const segmentsSnap = await db
    .collection('audience_segments')
    .where('viewerId', '==', userId)
    .limit(50)
    .get();
  
  for (const doc of segmentsSnap.docs) {
    const segment = doc.data();
    const trigger: SegmentUpdateTrigger = {
      userId,
      creatorId: segment.creatorId,
      source: 'profile',
      priority: 5,
      context: {
        action: 'interests_updated'
      }
    };
    
    await queueSegmentUpdate(trigger);
  }
}

// ========================================================================
// Hook: Interaction Events (Views, Likes)
// ========================================================================

/**
 * Hook into profile view to update passion segment
 */
export async function onProfileViewed(params: {
  viewerId: string;
  viewedUserId: string;
  dwellTimeSeconds: number;
}): Promise<void> {
  const { viewerId, viewedUserId, dwellTimeSeconds } = params;
  
  // Only queue if significant dwell time (>5 seconds)
  if (dwellTimeSeconds < 5) return;
  
  const trigger: SegmentUpdateTrigger = {
    userId: viewerId,
    creatorId: viewedUserId,
    source: 'profile',
    priority: 2, // Low priority
    context: {
      dwellTimeSeconds,
      action: 'profile_viewed'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

/**
 * Hook into media like event
 */
export async function onMediaLiked(params: {
  userId: string;
  mediaOwnerId: string;
  mediaId: string;
}): Promise<void> {
  const { userId, mediaOwnerId } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId,
    creatorId: mediaOwnerId,
    source: 'profile',
    priority: 2,
    context: {
      action: 'media_liked'
    }
  };
  
  await queueSegmentUpdate(trigger);
}

// ========================================================================
// Hook: Discovery/Match Events
// ========================================================================

/**
 * Hook into first interaction (match/connection) to create initial segment
 */
export async function onFirstInteraction(params: {
  userId: string;
  targetUserId: string;
  interactionType: string;
}): Promise<void> {
  const { userId, targetUserId, interactionType } = params;
  
  const trigger: SegmentUpdateTrigger = {
    userId,
    creatorId: targetUserId,
    source: 'profile',
    priority: 9, // Very high priority - new relationship
    context: {
      interactionType,
      action: 'first_interaction'
    }
  };
  
  // Immediate computation for new relationships
  await processSegmentUpdateImmediate(trigger);
}

// ========================================================================
// Integration Helper: Batch Queue Processor
// ========================================================================

/**
 * Process queued segment updates in batches
 * Should be called by scheduled function
 */
export async function processQueuedSegmentUpdates(batchSize: number = 50): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  const queueSnap = await db
    .collection('segment_computation_queue')
    .where('status', '==', 'pending')
    .orderBy('priority', 'desc')
    .orderBy('scheduledAt', 'asc')
    .limit(batchSize)
    .get();
  
  let processed = 0;
  let failed = 0;
  
  for (const queueDoc of queueSnap.docs) {
    const queueItem = queueDoc.data();
    
    try {
      // Mark as processing
      await queueDoc.ref.update({
        status: 'processing',
        startedAt: serverTimestamp()
      });
      
      // Compute segment
      if (queueItem.computationType === 'full') {
        await computeAudienceSegment(queueItem.viewerId, queueItem.creatorId);
      } else {
        // Incremental update based on trigger
        const trigger = queueItem.trigger as string;
        if (trigger === 'purchase') {
          await computeBudgetClassification(queueItem.viewerId);
        } else if (['chat', 'call', 'meeting', 'event'].includes(trigger)) {
          await computeIntentClassification(queueItem.viewerId);
        }
        
        if (queueItem.creatorId) {
          // Update specific relationship segments
          await computeProximity(queueItem.viewerId, queueItem.creatorId);
          await computePassionSignals(queueItem.viewerId, queueItem.creatorId);
        }
      }
      
      // Mark as completed
      await queueDoc.ref.update({
        status: 'completed',
        completedAt: serverTimestamp()
      });
      
      processed++;
    } catch (error) {
      console.error(`Failed to process queue item ${queueDoc.id}:`, error);
      
      // Update retry count
      const retryCount = queueItem.retryCount + 1;
      if (retryCount >= queueItem.maxRetries) {
        await queueDoc.ref.update({
          status: 'failed',
          error: String(error),
          completedAt: serverTimestamp()
        });
        failed++;
      } else {
        await queueDoc.ref.update({
          status: 'pending',
          retryCount,
          error: String(error)
        });
      }
    }
  }
  
  // Count remaining
  const remainingSnap = await db
    .collection('segment_computation_queue')
    .where('status', '==', 'pending')
    .count()
    .get();
  
  return {
    processed,
    failed,
    remaining: remainingSnap.data().count
  };
}

// ========================================================================
// Export all hooks
// ========================================================================

export const SegmentHooks = {
  onTransactionCompleted,
  onChatCompleted,
  onChatMessageSent,
  onCallCompleted,
  onMeetingBooked,
  onMeetingCompleted,
  onEventRegistered,
  onEventAttended,
  onLocationUpdated,
  onProfileInterestsUpdated,
  onProfileViewed,
  onMediaLiked,
  onFirstInteraction,
  processQueuedSegmentUpdates
};