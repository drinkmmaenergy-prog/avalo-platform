/**
 * PACK 229: Shared Moments Memory Log - Triggers & Integrations
 * 
 * This module integrates moment detection into existing chat, call, meeting,
 * and event systems. It hooks into the event flow to automatically detect
 * and create shared moments.
 */

import {
  checkAndEnableTimeline,
  detectFirstMessage,
  detectMessageMilestone,
  detectFirstCall,
  detectLongCall,
  detectAfterCallMessage,
  detectFirstCompliment,
  detectInsideJoke,
  detectFirstMeeting,
  detectMeetingChemistry,
  detectEventAttendance,
  trackMomentumFromMemory
} from './pack-229-shared-memories.js';

// ============================================================================
// CHAT MESSAGE TRIGGERS
// ============================================================================

/**
 * Hook into chat message processing
 * Called after a message is successfully billed in chatMonetization
 */
export async function onChatMessageSent(params: {
  chatId: string;
  senderId: string;
  recipientId: string;
  messageText: string;
  messageId: string;
  messageCount: number;
  timestamp: Date;
}): Promise<void> {
  const { chatId, senderId, recipientId, messageText, messageId, messageCount, timestamp } = params;
  const participantIds: [string, string] = [senderId, recipientId];
  
  try {
    // Check and enable timeline if needed
    await checkAndEnableTimeline(chatId, participantIds);
    
    // Detect first message (after free messages)
    if (messageCount === 6) {
      await detectFirstMessage(chatId, participantIds, timestamp);
    }
    
    // Detect message milestones
    if (messageCount === 50) {
      await detectMessageMilestone(chatId, participantIds, messageCount, timestamp);
    }
    
    // Detect first compliment (simple keyword detection)
    if (isCompliment(messageText)) {
      await detectFirstCompliment(chatId, participantIds, timestamp, messageId);
    }
    
    // Detect inside jokes
    await detectInsideJoke(chatId, participantIds, messageText, timestamp, messageId);
    
    // Check for after-call message
    await checkAfterCallMessage(chatId, participantIds, timestamp);
    
  } catch (error) {
    // Non-blocking - don't fail message send if moment detection fails
    console.error('[SharedMemories] Failed to detect chat moment:', error);
  }
}

/**
 * Simple compliment detection
 */
function isCompliment(text: string): boolean {
  const complimentKeywords = [
    'beautiful', 'gorgeous', 'handsome', 'cute', 'pretty',
    'amazing', 'wonderful', 'love your', 'you look',
    'attractive', 'stunning', 'lovely', 'sweet'
  ];
  
  const lowerText = text.toLowerCase();
  return complimentKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Check if message was sent within 1 hour after a call
 */
async function checkAfterCallMessage(
  chatId: string,
  participantIds: [string, string],
  messageTimestamp: Date
): Promise<void> {
  try {
    // Get most recent call for this chat
    const { db } = await import('./init.js');
    const callsSnap = await db.collection('calls')
      .where('chatId', '==', chatId)
      .where('state', '==', 'ENDED')
      .orderBy('endedAt', 'desc')
      .limit(1)
      .get();
    
    if (!callsSnap.empty) {
      const call = callsSnap.docs[0].data();
      const callEndTime = call.endedAt.toDate();
      
      await detectAfterCallMessage(chatId, participantIds, messageTimestamp, callEndTime);
    }
  } catch (error) {
    // Non-blocking
    console.error('[SharedMemories] Failed to check after-call message:', error);
  }
}

// ============================================================================
// CALL TRIGGERS
// ============================================================================

/**
 * Hook into call start
 * Called when a call begins
 */
export async function onCallStarted(params: {
  callId: string;
  chatId?: string;
  userAId: string;
  userBId: string;
  callType: 'voice' | 'video';
  timestamp: Date;
}): Promise<void> {
  const { callId, chatId, userAId, userBId, callType, timestamp } = params;
  
  // Skip if no chat associated
  if (!chatId) return;
  
  const participantIds: [string, string] = [userAId, userBId];
  
  try {
    // Check and enable timeline
    await checkAndEnableTimeline(chatId, participantIds);
    
    // Detect first call
    await detectFirstCall(chatId, participantIds, callType, timestamp, callId);
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect call start moment:', error);
  }
}

/**
 * Hook into call end
 * Called when a call completes
 */
export async function onCallEnded(params: {
  callId: string;
  chatId?: string;
  userAId: string;
  userBId: string;
  callType: 'voice' | 'video';
  durationMinutes: number;
  timestamp: Date;
}): Promise<void> {
  const { callId, chatId, userAId, userBId, durationMinutes, timestamp } = params;
  
  // Skip if no chat associated
  if (!chatId) return;
  
  const participantIds: [string, string] = [userAId, userBId];
  
  try {
    // Detect long call (10+ minutes)
    if (durationMinutes >= 10) {
      await detectLongCall(chatId, participantIds, durationMinutes, timestamp, callId);
      
      // Track romantic momentum
      await trackMomentumFromMemory(userAId, 'long_call');
      await trackMomentumFromMemory(userBId, 'long_call');
    }
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect call end moment:', error);
  }
}

// ============================================================================
// MEETING TRIGGERS
// ============================================================================

/**
 * Hook into meeting verification
 * Called when a meeting is confirmed via QR code
 */
export async function onMeetingVerified(params: {
  meetingId: string;
  chatId: string;
  userAId: string;
  userBId: string;
  timestamp: Date;
}): Promise<void> {
  const { meetingId, chatId, userAId, userBId, timestamp } = params;
  const participantIds: [string, string] = [userAId, userBId];
  
  try {
    // Detect first meeting
    await detectFirstMeeting(chatId, participantIds, timestamp, meetingId);
    
    // Track romantic momentum
    await trackMomentumFromMemory(userAId, 'first_meeting');
    await trackMomentumFromMemory(userBId, 'first_meeting');
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect meeting moment:', error);
  }
}

/**
 * Hook into meeting feedback
 * Called when users provide feedback after meeting
 */
export async function onMeetingFeedback(params: {
  meetingId: string;
  chatId: string;
  userAId: string;
  userBId: string;
  feedbackType: 'kiss' | 'high_chemistry' | 'good' | 'neutral' | 'bad';
  timestamp: Date;
}): Promise<void> {
  const { meetingId, chatId, userAId, userBId, feedbackType, timestamp } = params;
  const participantIds: [string, string] = [userAId, userBId];
  
  try {
    // Only create moment for positive feedback
    if (feedbackType === 'kiss' || feedbackType === 'high_chemistry') {
      await detectMeetingChemistry(chatId, participantIds, timestamp, meetingId, feedbackType);
    }
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect meeting feedback moment:', error);
  }
}

// ============================================================================
// EVENT TRIGGERS
// ============================================================================

/**
 * Hook into event attendance
 * Called when two users attend the same event
 */
export async function onEventAttendedTogether(params: {
  eventId: string;
  eventName: string;
  userAId: string;
  userBId: string;
  timestamp: Date;
}): Promise<void> {
  const { eventId, eventName, userAId, userBId, timestamp } = params;
  
  try {
    // Check if these users have a chat together
    const { db } = await import('./init.js');
    const chatsSnap = await db.collection('chats')
      .where('participants', 'array-contains', userAId)
      .get();
    
    // Find chat with userB
    for (const chatDoc of chatsSnap.docs) {
      const chat = chatDoc.data();
      if (chat.participants.includes(userBId)) {
        const participantIds: [string, string] = [userAId, userBId];
        await detectEventAttendance(chatDoc.id, participantIds, timestamp, eventId, eventName);
        
        // Track romantic momentum
        await trackMomentumFromMemory(userAId, 'event_attended');
        await trackMomentumFromMemory(userBId, 'event_attended');
        
        break;
      }
    }
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect event attendance moment:', error);
  }
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Get chat ID from call record
 */
async function getChatIdFromCall(callId: string): Promise<string | null> {
  try {
    const { db } = await import('./init.js');
    const callSnap = await db.collection('calls').doc(callId).get();
    
    if (callSnap.exists) {
      const call = callSnap.data();
      return call?.chatId || null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract chat participants from chat document
 */
async function getChatParticipants(chatId: string): Promise<[string, string] | null> {
  try {
    const { db } = await import('./init.js');
    const chatSnap = await db.collection('chats').doc(chatId).get();
    
    if (chatSnap.exists) {
      const chat = chatSnap.data();
      const participants = chat?.participants;
      
      if (Array.isArray(participants) && participants.length === 2) {
        return participants as [string, string];
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Detect and create anniversary moments
 * Should be run daily
 */
export async function detectAnniversaries(): Promise<number> {
  const { db } = await import('./init.js');
  const { addAnniversaryMoment } = await import('./pack-229-shared-memories.js');
  
  let anniversariesCreated = 0;
  
  try {
    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth();
    
    // Get all timelines
    const timelinesSnap = await db.collection('sharedMemories')
      .where('enabled', '==', true)
      .limit(1000)
      .get();
    
    for (const timelineDoc of timelinesSnap.docs) {
      const timeline = timelineDoc.data();
      const matchDate = timeline.firstMatchDate.toDate();
      const matchDay = matchDate.getDate();
      const matchMonth = matchDate.getMonth();
      
      // Check if today is anniversary of match
      if (matchDay === todayDay && matchMonth === todayMonth) {
        const daysSinceMatch = Math.floor(
          (today.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Create anniversary moments for 30, 60, 90, 180, 365 days
        const milestones = [30, 60, 90, 180, 365];
        if (milestones.includes(daysSinceMatch)) {
          const participantIds = timeline.participantIds as [string, string];
          await addAnniversaryMoment(
            timeline.chatId,
            participantIds[0], // System-generated, use first participant
            'match',
            daysSinceMatch
          );
          anniversariesCreated++;
        }
      }
      
      // Check meeting anniversaries if applicable
      if (timeline.firstMeetingDate) {
        const meetingDate = timeline.firstMeetingDate.toDate();
        const meetingDay = meetingDate.getDate();
        const meetingMonth = meetingDate.getMonth();
        
        if (meetingDay === todayDay && meetingMonth === todayMonth) {
          const daysSinceMeeting = Math.floor(
            (today.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          const milestones = [30, 60, 90, 180, 365];
          if (milestones.includes(daysSinceMeeting)) {
            const participantIds = timeline.participantIds as [string, string];
            await addAnniversaryMoment(
              timeline.chatId,
              participantIds[0],
              'meeting',
              daysSinceMeeting
            );
            anniversariesCreated++;
          }
        }
      }
    }
    
  } catch (error) {
    console.error('[SharedMemories] Failed to detect anniversaries:', error);
  }
  
  return anniversariesCreated;
}

/**
 * Clean up memories for deleted matches
 * Should be run periodically
 */
export async function cleanupDeletedMatchMemories(): Promise<number> {
  const { db } = await import('./init.js');
  const { deleteAllSharedMemories } = await import('./pack-229-shared-memories.js');
  
  let cleaned = 0;
  
  try {
    // Get all timelines
    const timelinesSnap = await db.collection('sharedMemories')
      .limit(1000)
      .get();
    
    for (const timelineDoc of timelinesSnap.docs) {
      const timeline = timelineDoc.data();
      
      // Check if chat still exists
      const chatSnap = await db.collection('chats').doc(timeline.chatId).get();
      
      if (!chatSnap.exists) {
        // Chat deleted, clean up memories
        await deleteAllSharedMemories(timeline.chatId);
        cleaned++;
      }
    }
    
  } catch (error) {
    console.error('[SharedMemories] Failed to cleanup deleted match memories:', error);
  }
  
  return cleaned;
}

// ============================================================================
// EXPORTS FOR INTEGRATION
// ============================================================================

export const sharedMemoryTriggers = {
  onChatMessageSent,
  onCallStarted,
  onCallEnded,
  onMeetingVerified,
  onMeetingFeedback,
  onEventAttendedTogether,
  detectAnniversaries,
  cleanupDeletedMatchMemories
};