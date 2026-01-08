/**
 * PACK 229: Shared Moments Memory Log
 * 
 * Automatically collects the best emotional memories between two users,
 * deepening attachment and driving continuous interactions.
 * 
 * Key Features:
 * - Automatic moment detection (first match, calls, meetings, milestones)
 * - User-addable moments (photos, captions, custom markers)
 * - Privacy controls (opt-in per pair, hide/delete)
 * - Timeline visualization with emotional context
 * - Integration with packs 224-228
 * - Safety-first (respects blocks, safety reports, breakup recovery)
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type MomentType = 
  | 'first_match'
  | 'first_message'
  | 'milestone_50_messages'
  | 'first_compliment'
  | 'first_voice_call'
  | 'first_video_call'
  | 'long_call'
  | 'inside_joke'
  | 'first_meeting'
  | 'meeting_chemistry'
  | 'event_attended'
  | 'after_call_message'
  | 'user_photo'
  | 'user_caption'
  | 'anniversary';

export interface SharedMoment {
  momentId: string;
  chatId: string;
  participantIds: [string, string];
  type: MomentType;
  
  // Content
  title: string;
  description: string;
  emoji?: string;
  
  // Metadata
  timestamp: Timestamp;
  isUserAdded: boolean;
  userId?: string; // Who added it (for user-added moments)
  
  // Associated data
  metadata?: {
    messageId?: string;
    callId?: string;
    meetingId?: string;
    eventId?: string;
    photoUrl?: string;
    messageCount?: number;
    callDuration?: number;
    quote?: string;
  };
  
  // Visibility
  isHidden: boolean;
  hiddenBy?: string;
  hiddenAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SharedMemoryTimeline {
  chatId: string;
  participantIds: [string, string];
  
  // Statistics
  totalMoments: number;
  autoMoments: number;
  userAddedMoments: number;
  
  // Milestones
  firstMatchDate: Timestamp;
  firstMessageDate?: Timestamp;
  firstCallDate?: Timestamp;
  firstMeetingDate?: Timestamp;
  
  // Settings
  enabled: boolean;
  enabledAt: Timestamp;
  
  lastUpdatedAt: Timestamp;
  createdAt: Timestamp;
}

export interface MemoryVisibilitySettings {
  userId: string;
  chatId: string;
  enabled: boolean;
  hiddenMoments: string[]; // Array of momentIds
  updatedAt: Timestamp;
}

export interface SharedMemoryAnalytics {
  analyticsId: string;
  date: string; // YYYY-MM-DD
  
  totalTimelines: number;
  totalMoments: number;
  autoMoments: number;
  userAddedMoments: number;
  
  momentTypeDistribution: Record<MomentType, number>;
  averageMomentsPerTimeline: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOMENT_TITLES: Record<MomentType, (metadata?: any) => string> = {
  first_match: () => 'The day we matched',
  first_message: () => 'First conversation',
  milestone_50_messages: () => 'We started to go deeper',
  first_compliment: () => 'First compliment',
  first_voice_call: () => 'First time we talked for real',
  first_video_call: () => 'First time we saw each other',
  long_call: (m) => `Big energy moment (${m?.callDuration || 0} min)`,
  inside_joke: () => 'You two started joking together',
  first_meeting: () => 'First time we met in person',
  meeting_chemistry: () => 'The chemistry was real',
  event_attended: () => 'We shared an experience',
  after_call_message: () => 'Hard to say goodbye',
  user_photo: () => 'Special moment',
  user_caption: () => 'Moment that made my day',
  anniversary: () => 'Anniversary'
};

const MOMENT_EMOJIS: Record<MomentType, string> = {
  first_match: '✨',
  first_message: '💬',
  milestone_50_messages: '🔥',
  first_compliment: '💝',
  first_voice_call: '📞',
  first_video_call: '📹',
  long_call: '⚡',
  inside_joke: '😄',
  first_meeting: '🤝',
  meeting_chemistry: '💋',
  event_attended: '🎉',
  after_call_message: '💭',
  user_photo: '📸',
  user_caption: '⭐',
  anniversary: '🎂'
};

const LONG_CALL_THRESHOLD_MINUTES = 10;
const AFTER_CALL_MESSAGE_WINDOW_HOURS = 1;

// ============================================================================
// TIMELINE MANAGEMENT
// ============================================================================

/**
 * Get or create shared memory timeline for a chat pair
 */
export async function getSharedMemoryTimeline(chatId: string): Promise<SharedMemoryTimeline | null> {
  const timelineRef = db.collection('sharedMemories').doc(chatId);
  const timelineSnap = await timelineRef.get();
  
  if (timelineSnap.exists) {
    return timelineSnap.data() as SharedMemoryTimeline;
  }
  
  return null;
}

/**
 * Initialize shared memory timeline for a chat
 * Called after second chemistry signal between users
 */
export async function initializeSharedMemoryTimeline(
  chatId: string,
  participantIds: [string, string],
  firstMatchDate: Date
): Promise<void> {
  const timelineRef = db.collection('sharedMemories').doc(chatId);
  
  const timeline: Omit<SharedMemoryTimeline, 'createdAt'> = {
    chatId,
    participantIds,
    totalMoments: 0,
    autoMoments: 0,
    userAddedMoments: 0,
    firstMatchDate: firstMatchDate as any,
    enabled: true,
    enabledAt: serverTimestamp() as any,
    lastUpdatedAt: serverTimestamp() as any,
  };
  
  await timelineRef.set({
    ...timeline,
    createdAt: serverTimestamp()
  });
  
  // Create first moment: "The day we matched"
  await createSharedMoment({
    chatId,
    participantIds,
    type: 'first_match',
    timestamp: firstMatchDate,
    metadata: {}
  });
}

/**
 * Check if timeline should be auto-enabled (after second chemistry signal)
 */
export async function checkAndEnableTimeline(
  chatId: string,
  participantIds: [string, string]
): Promise<boolean> {
  // Check if already exists
  const existing = await getSharedMemoryTimeline(chatId);
  if (existing) {
    return true;
  }
  
  // Check for chemistry signals
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    return false;
  }
  
  const chat = chatSnap.data();
  const messageCount = chat?.billing?.messageCount || 0;
  const hasCall = chat?.stats?.calls || 0 > 0;
  
  // Enable after 10 messages OR first call
  if (messageCount >= 10 || hasCall) {
    const matchDate = chat?.createdAt?.toDate() || new Date();
    await initializeSharedMemoryTimeline(chatId, participantIds, matchDate);
    return true;
  }
  
  return false;
}

// ============================================================================
// MOMENT CREATION
// ============================================================================

/**
 * Create a new shared moment
 */
export async function createSharedMoment(params: {
  chatId: string;
  participantIds: [string, string];
  type: MomentType;
  timestamp: Date;
  metadata?: Record<string, any>;
  userId?: string;
  customTitle?: string;
  customDescription?: string;
}): Promise<string> {
  const {
    chatId,
    participantIds,
    type,
    timestamp,
    metadata = {},
    userId,
    customTitle,
    customDescription
  } = params;
  
  // Check if timeline exists
  const timeline = await getSharedMemoryTimeline(chatId);
  if (!timeline) {
    // Try to enable timeline
    const enabled = await checkAndEnableTimeline(chatId, participantIds);
    if (!enabled) {
      throw new Error('Timeline not enabled for this chat');
    }
  }
  
  // Check privacy settings
  const canCreate = await checkMomentPrivacy(chatId, participantIds);
  if (!canCreate) {
    throw new Error('Privacy settings prevent moment creation');
  }
  
  const momentId = generateId();
  const isUserAdded = !!userId;
  
  const title = customTitle || MOMENT_TITLES[type](metadata);
  const description = customDescription || generateMomentDescription(type, metadata);
  const emoji = MOMENT_EMOJIS[type];
  
  const moment: Omit<SharedMoment, 'createdAt' | 'updatedAt'> = {
    momentId,
    chatId,
    participantIds,
    type,
    title,
    description,
    emoji,
    timestamp: timestamp as any,
    isUserAdded,
    userId,
    metadata,
    isHidden: false
  };
  
  // Save moment in subcollection
  await db.collection('sharedMemories').doc(chatId)
    .collection('moments').doc(momentId).set({
      ...moment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  
  // Update timeline statistics
  const timelineRef = db.collection('sharedMemories').doc(chatId);
  await timelineRef.update({
    totalMoments: increment(1),
    [isUserAdded ? 'userAddedMoments' : 'autoMoments']: increment(1),
    lastUpdatedAt: serverTimestamp()
  });
  
  // Update timeline milestone dates
  const milestoneUpdates: Record<string, any> = {};
  if (type === 'first_message' && !timeline?.firstMessageDate) {
    milestoneUpdates.firstMessageDate = timestamp;
  }
  if ((type === 'first_voice_call' || type === 'first_video_call') && !timeline?.firstCallDate) {
    milestoneUpdates.firstCallDate = timestamp;
  }
  if (type === 'first_meeting' && !timeline?.firstMeetingDate) {
    milestoneUpdates.firstMeetingDate = timestamp;
  }
  
  if (Object.keys(milestoneUpdates).length > 0) {
    await timelineRef.update(milestoneUpdates);
  }
  
  return momentId;
}

/**
 * Generate moment description based on type
 */
function generateMomentDescription(type: MomentType, metadata: Record<string, any>): string {
  switch (type) {
    case 'first_match':
      return 'Your connection began';
    case 'first_message':
      return 'The conversation started';
    case 'milestone_50_messages':
      return 'Your bond is getting stronger';
    case 'first_compliment':
      return 'A sweet moment of appreciation';
    case 'first_voice_call':
      return 'Hearing each other for the first time';
    case 'first_video_call':
      return 'Face to face at last';
    case 'long_call':
      return 'A deep and meaningful conversation';
    case 'inside_joke':
      return 'Your own special language';
    case 'first_meeting':
      return 'From digital to real';
    case 'meeting_chemistry':
      return 'The spark was undeniable';
    case 'event_attended':
      return 'Creating memories together';
    case 'after_call_message':
      return 'Still thinking of each other';
    case 'user_photo':
      return metadata.caption || 'A special memory';
    case 'user_caption':
      return metadata.caption || 'A moment to remember';
    case 'anniversary':
      return `${metadata.days || 0} days together`;
    default:
      return 'A special moment together';
  }
}

// ============================================================================
// AUTOMATIC MOMENT DETECTION
// ============================================================================

/**
 * Detect and create moment for first message exchange
 */
export async function detectFirstMessage(
  chatId: string,
  participantIds: [string, string],
  messageTimestamp: Date
): Promise<void> {
  // Check if this is truly the first message (after free messages)
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) return;
  
  const chat = chatSnap.data();
  const messageCount = chat?.billing?.messageCount || 0;
  
  // Create moment after first real exchange (6 messages = 3 per person)
  if (messageCount === 6) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'first_message',
      timestamp: messageTimestamp,
      metadata: { messageCount: 6 }
    });
  }
}

/**
 * Detect message milestone
 */
export async function detectMessageMilestone(
  chatId: string,
  participantIds: [string, string],
  messageCount: number,
  messageTimestamp: Date
): Promise<void> {
  if (messageCount === 50) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'milestone_50_messages',
      timestamp: messageTimestamp,
      metadata: { messageCount: 50 }
    });
  }
}

/**
 * Detect first voice or video call
 */
export async function detectFirstCall(
  chatId: string,
  participantIds: [string, string],
  callType: 'voice' | 'video',
  callTimestamp: Date,
  callId: string
): Promise<void> {
  const timeline = await getSharedMemoryTimeline(chatId);
  if (!timeline) return;
  
  const momentType = callType === 'voice' ? 'first_voice_call' : 'first_video_call';
  
  // Check if this type of call already exists
  const existingMoment = await db.collection('sharedMemories').doc(chatId)
    .collection('moments')
    .where('type', '==', momentType)
    .limit(1)
    .get();
  
  if (existingMoment.empty) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: momentType,
      timestamp: callTimestamp,
      metadata: { callId, callType }
    });
  }
}

/**
 * Detect long call (10+ minutes)
 */
export async function detectLongCall(
  chatId: string,
  participantIds: [string, string],
  callDuration: number,
  callTimestamp: Date,
  callId: string
): Promise<void> {
  if (callDuration >= LONG_CALL_THRESHOLD_MINUTES) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'long_call',
      timestamp: callTimestamp,
      metadata: { callId, callDuration }
    });
  }
}

/**
 * Detect message after call (within 1 hour = hard to say goodbye)
 */
export async function detectAfterCallMessage(
  chatId: string,
  participantIds: [string, string],
  messageTimestamp: Date,
  lastCallTimestamp: Date
): Promise<void> {
  const timeDiff = messageTimestamp.getTime() - lastCallTimestamp.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  if (hoursDiff <= AFTER_CALL_MESSAGE_WINDOW_HOURS) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'after_call_message',
      timestamp: messageTimestamp,
      metadata: { minutesAfterCall: Math.round(hoursDiff * 60) }
    });
  }
}

/**
 * Detect first compliment
 */
export async function detectFirstCompliment(
  chatId: string,
  participantIds: [string, string],
  complimentTimestamp: Date,
  messageId: string
): Promise<void> {
  const timeline = await getSharedMemoryTimeline(chatId);
  if (!timeline) return;
  
  // Check if compliment moment already exists
  const existingMoment = await db.collection('sharedMemories').doc(chatId)
    .collection('moments')
    .where('type', '==', 'first_compliment')
    .limit(1)
    .get();
  
  if (existingMoment.empty) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'first_compliment',
      timestamp: complimentTimestamp,
      metadata: { messageId }
    });
  }
}

/**
 * Detect inside joke (AI-powered or keyword-based)
 */
export async function detectInsideJoke(
  chatId: string,
  participantIds: [string, string],
  messageText: string,
  messageTimestamp: Date,
  messageId: string
): Promise<void> {
  // Simple keyword detection (can be enhanced with AI)
  const jokeKeywords = ['haha', 'lol', 'remember when', 'our thing', 'inside joke'];
  const hasJokeMarker = jokeKeywords.some(keyword => 
    messageText.toLowerCase().includes(keyword)
  );
  
  if (hasJokeMarker) {
    // Check if inside joke moment already exists
    const existingMoments = await db.collection('sharedMemories').doc(chatId)
      .collection('moments')
      .where('type', '==', 'inside_joke')
      .limit(1)
      .get();
    
    if (existingMoments.empty) {
      await createSharedMoment({
        chatId,
        participantIds,
        type: 'inside_joke',
        timestamp: messageTimestamp,
        metadata: { messageId, quote: messageText.substring(0, 100) }
      });
    }
  }
}

/**
 * Detect first meeting
 */
export async function detectFirstMeeting(
  chatId: string,
  participantIds: [string, string],
  meetingTimestamp: Date,
  meetingId: string
): Promise<void> {
  const timeline = await getSharedMemoryTimeline(chatId);
  if (!timeline) return;
  
  // Check if first meeting already exists
  const existingMoment = await db.collection('sharedMemories').doc(chatId)
    .collection('moments')
    .where('type', '==', 'first_meeting')
    .limit(1)
    .get();
  
  if (existingMoment.empty) {
    await createSharedMoment({
      chatId,
      participantIds,
      type: 'first_meeting',
      timestamp: meetingTimestamp,
      metadata: { meetingId }
    });
  }
}

/**
 * Detect meeting chemistry moment (kiss on feedback)
 */
export async function detectMeetingChemistry(
  chatId: string,
  participantIds: [string, string],
  meetingTimestamp: Date,
  meetingId: string,
  feedbackType: 'kiss' | 'high_chemistry'
): Promise<void> {
  await createSharedMoment({
    chatId,
    participantIds,
    type: 'meeting_chemistry',
    timestamp: meetingTimestamp,
    metadata: { meetingId, feedbackType }
  });
}

/**
 * Detect event attended together
 */
export async function detectEventAttendance(
  chatId: string,
  participantIds: [string, string],
  eventTimestamp: Date,
  eventId: string,
  eventName: string
): Promise<void> {
  await createSharedMoment({
    chatId,
    participantIds,
    type: 'event_attended',
    timestamp: eventTimestamp,
    metadata: { eventId, eventName }
  });
}

// ============================================================================
// USER-ADDABLE MOMENTS
// ============================================================================

/**
 * User adds a photo moment
 */
export async function addUserPhotoMoment(
  chatId: string,
  userId: string,
  photoUrl: string,
  caption?: string,
  timestamp?: Date
): Promise<string> {
  // Get chat to get participants
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    throw new Error('Chat not found');
  }
  
  const chat = chatSnap.data();
  const participantIds = chat?.participants as [string, string];
  
  if (!participantIds.includes(userId)) {
    throw new Error('User is not a participant in this chat');
  }
  
  return await createSharedMoment({
    chatId,
    participantIds,
    type: 'user_photo',
    timestamp: timestamp || new Date(),
    metadata: { photoUrl, caption },
    userId,
    customTitle: caption || 'Special moment',
    customDescription: caption
  });
}

/**
 * User adds a caption moment
 */
export async function addUserCaptionMoment(
  chatId: string,
  userId: string,
  caption: string,
  momentType: 'moment_that_made_my_day' | 'moment_that_made_me_smile',
  timestamp?: Date
): Promise<string> {
  // Get chat to get participants
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    throw new Error('Chat not found');
  }
  
  const chat = chatSnap.data();
  const participantIds = chat?.participants as [string, string];
  
  if (!participantIds.includes(userId)) {
    throw new Error('User is not a participant in this chat');
  }
  
  const title = momentType === 'moment_that_made_my_day' 
    ? 'Moment that made my day'
    : 'Moment that made me smile';
  
  return await createSharedMoment({
    chatId,
    participantIds,
    type: 'user_caption',
    timestamp: timestamp || new Date(),
    metadata: { caption, momentType },
    userId,
    customTitle: title,
    customDescription: caption
  });
}

/**
 * Mark anniversary
 */
export async function addAnniversaryMoment(
  chatId: string,
  userId: string,
  anniversaryType: 'match' | 'meeting',
  days: number
): Promise<string> {
  // Get chat to get participants
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    throw new Error('Chat not found');
  }
  
  const chat = chatSnap.data();
  const participantIds = chat?.participants as [string, string];
  
  if (!participantIds.includes(userId)) {
    throw new Error('User is not a participant in this chat');
  }
  
  const title = anniversaryType === 'match'
    ? `${days} days since we matched`
    : `${days} days since we met`;
  
  return await createSharedMoment({
    chatId,
    participantIds,
    type: 'anniversary',
    timestamp: new Date(),
    metadata: { anniversaryType, days },
    userId,
    customTitle: title
  });
}

// ============================================================================
// PRIVACY & VISIBILITY
// ============================================================================

/**
 * Check if moment creation is allowed based on privacy settings
 */
async function checkMomentPrivacy(
  chatId: string,
  participantIds: [string, string]
): Promise<boolean> {
  // Check if either user has disabled memory log for this chat
  for (const userId of participantIds) {
    const visibilitySnap = await db.collection('sharedMemories').doc(chatId)
      .collection('visibility').doc(userId).get();
    
    if (visibilitySnap.exists) {
      const settings = visibilitySnap.data() as MemoryVisibilitySettings;
      if (!settings.enabled) {
        return false;
      }
    }
  }
  
  // Check for safety issues
  const hasSafetyIssue = await checkSafetyIssues(participantIds);
  if (hasSafetyIssue) {
    return false;
  }
  
  return true;
}

/**
 * Check for safety issues between participants
 */
async function checkSafetyIssues(participantIds: [string, string]): Promise<boolean> {
  const [userA, userB] = participantIds;
  
  // Check blocks
  const blockA = await db.collection('users').doc(userA)
    .collection('blocked_users').doc(userB).get();
  const blockB = await db.collection('users').doc(userB)
    .collection('blocked_users').doc(userA).get();
  
  if (blockA.exists || blockB.exists) {
    return true;
  }
  
  // Check active safety incidents
  const incidentsSnap = await db.collection('trust_safety_incidents')
    .where('userId', 'in', participantIds)
    .where('severity', 'in', ['HIGH', 'CRITICAL'])
    .where('resolved', '==', false)
    .limit(1)
    .get();
  
  return !incidentsSnap.empty;
}

/**
 * Update user's visibility settings for a chat
 */
export async function updateMemoryVisibility(
  chatId: string,
  userId: string,
  enabled: boolean
): Promise<void> {
  await db.collection('sharedMemories').doc(chatId)
    .collection('visibility').doc(userId).set({
      userId,
      chatId,
      enabled,
      hiddenMoments: [],
      updatedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Hide a specific moment for a user
 */
export async function hideMoment(
  chatId: string,
  momentId: string,
  userId: string
): Promise<void> {
  const momentRef = db.collection('sharedMemories').doc(chatId)
    .collection('moments').doc(momentId);
  
  await momentRef.update({
    isHidden: true,
    hiddenBy: userId,
    hiddenAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Add to user's hidden list
  const visibilityRef = db.collection('sharedMemories').doc(chatId)
    .collection('visibility').doc(userId);
  
  const visibilitySnap = await visibilityRef.get();
  if (visibilitySnap.exists) {
    const settings = visibilitySnap.data() as MemoryVisibilitySettings;
    if (!settings.hiddenMoments.includes(momentId)) {
      await visibilityRef.update({
        hiddenMoments: [...settings.hiddenMoments, momentId],
        updatedAt: serverTimestamp()
      });
    }
  }
}

/**
 * Delete user-added moment
 */
export async function deleteUserMoment(
  chatId: string,
  momentId: string,
  userId: string
): Promise<void> {
  const momentRef = db.collection('sharedMemories').doc(chatId)
    .collection('moments').doc(momentId);
  
  const momentSnap = await momentRef.get();
  if (!momentSnap.exists) {
    throw new Error('Moment not found');
  }
  
  const moment = momentSnap.data() as SharedMoment;
  
  // Only allow deletion of user's own user-added moments
  if (!moment.isUserAdded || moment.userId !== userId) {
    throw new Error('Can only delete your own user-added moments');
  }
  
  await momentRef.delete();
  
  // Update timeline statistics
  await db.collection('sharedMemories').doc(chatId).update({
    totalMoments: increment(-1),
    userAddedMoments: increment(-1),
    lastUpdatedAt: serverTimestamp()
  });
}

/**
 * Delete all shared memories when match is deleted
 */
export async function deleteAllSharedMemories(chatId: string): Promise<void> {
  // Delete all moments
  const momentsSnap = await db.collection('sharedMemories').doc(chatId)
    .collection('moments').get();
  
  const batch = db.batch();
  momentsSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  // Delete visibility settings
  const visibilitySnap = await db.collection('sharedMemories').doc(chatId)
    .collection('visibility').get();
  
  const visibilityBatch = db.batch();
  visibilitySnap.docs.forEach(doc => visibilityBatch.delete(doc.ref));
  await visibilityBatch.commit();
  
  // Delete timeline
  await db.collection('sharedMemories').doc(chatId).delete();
}

/**
 * Purge memories after confirmed safety report
 */
export async function purgeMemoriesAfterSafetyReport(
  chatId: string,
  reportId: string
): Promise<void> {
  // Log the purge action
  await db.collection('sharedMemory_purge_log').add({
    chatId,
    reportId,
    reason: 'safety_report_confirmed',
    purgedAt: serverTimestamp()
  });
  
  // Delete all memories
  await deleteAllSharedMemories(chatId);
}

// ============================================================================
// RETRIEVAL & QUERIES
// ============================================================================

/**
 * Get shared moments for a chat (visible to user)
 */
export async function getSharedMoments(
  chatId: string,
  userId: string,
  limit: number = 50
): Promise<SharedMoment[]> {
  // Check visibility settings
  const visibilitySnap = await db.collection('sharedMemories').doc(chatId)
    .collection('visibility').doc(userId).get();
  
  let hiddenMoments: string[] = [];
  if (visibilitySnap.exists) {
    const settings = visibilitySnap.data() as MemoryVisibilitySettings;
    if (!settings.enabled) {
      return []; // User has disabled memory log
    }
    hiddenMoments = settings.hiddenMoments || [];
  }
  
  // Get moments
  const momentsSnap = await db.collection('sharedMemories').doc(chatId)
    .collection('moments')
    .where('isHidden', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(limit)
    .get();
  
  const moments = momentsSnap.docs
    .map(doc => doc.data() as SharedMoment)
    .filter(moment => !hiddenMoments.includes(moment.momentId));
  
  return moments;
}

/**
 * Get recent highlights (for notification/desire loop)
 */
export async function getRecentHighlights(
  chatId: string,
  userId: string,
  sinceDays: number = 7
): Promise<SharedMoment[]> {
  const cutoffDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  
  const momentsSnap = await db.collection('sharedMemories').doc(chatId)
    .collection('moments')
    .where('timestamp', '>=', cutoffDate)
    .where('isHidden', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  
  return momentsSnap.docs.map(doc => doc.data() as SharedMoment);
}

// ============================================================================
// PACK INTEGRATIONS
// ============================================================================

/**
 * Integration with PACK 225: Match Comeback Engine
 * Highlights good moments when suggesting rekindle
 */
export async function getMomentsForRekindle(chatId: string): Promise<{
  hasMemories: boolean;
  bestMoment?: SharedMoment;
  momentCount: number;
}> {
  const timeline = await getSharedMemoryTimeline(chatId);
  if (!timeline) {
    return { hasMemories: false, momentCount: 0 };
  }
  
  // Get best moment (meeting > call > milestone)
  const priorityTypes: MomentType[] = [
    'meeting_chemistry',
    'first_meeting',
    'long_call',
    'milestone_50_messages'
  ];
  
  for (const type of priorityTypes) {
    const momentSnap = await db.collection('sharedMemories').doc(chatId)
      .collection('moments')
      .where('type', '==', type)
      .where('isHidden', '==', false)
      .limit(1)
      .get();
    
    if (!momentSnap.empty) {
      return {
        hasMemories: true,
        bestMoment: momentSnap.docs[0].data() as SharedMoment,
        momentCount: timeline.totalMoments
      };
    }
  }
  
  return {
    hasMemories: true,
    momentCount: timeline.totalMoments
  };
}

/**
 * Integration with PACK 226: Chemistry Lock-In
 * Trigger special animation inside lock-in when new milestone reached
 */
export async function triggerChemistryLockInAnimation(
  chatId: string,
  momentType: MomentType
): Promise<void> {
  // This would trigger a special UI animation in the chemistry lock-in
  // The actual animation logic would be in the frontend
  await db.collection('chemistry_lock_in_triggers').add({
    chatId,
    momentType,
    animationType: 'milestone_celebration',
    createdAt: serverTimestamp()
  });
}

/**
 * Integration with PACK 227: Desire Loop Engine
 * Surface good moments to increase intimacy driver
 */
export async function surfaceMomentForDesireLoop(
  userId: string,
  chatId: string
): Promise<SharedMoment | null> {
  const moments = await getRecentHighlights(chatId, userId, 14);
  
  if (moments.length === 0) {
    return null;
  }
  
  // Return most impactful recent moment
  const priorityTypes: MomentType[] = [
    'meeting_chemistry',
    'long_call',
    'event_attended',
    'after_call_message'
  ];
  
  for (const type of priorityTypes) {
    const moment = moments.find(m => m.type === type);
    if (moment) {
      return moment;
    }
  }
  
  return moments[0];
}

/**
 * Integration with PACK 228: Sleep Mode
 * Protect memories during emotional cooldown
 */
export async function pauseMemoryUpdates(chatId: string, reason: string): Promise<void> {
  await db.collection('sharedMemories').doc(chatId).update({
    updatesPaused: true,
    pauseReason: reason,
    pausedAt: serverTimestamp()
  });
}

export async function resumeMemoryUpdates(chatId: string): Promise<void> {
  await db.collection('sharedMemories').doc(chatId).update({
    updatesPaused: false,
    pauseReason: null,
    pausedAt: null,
    resumedAt: serverTimestamp()
  });
}

/**
 * Integration with PACK 224: Romantic Momentum
 * New moments increase momentum score
 */
export async function trackMomentumFromMemory(userId: string, momentType: MomentType): Promise<void> {
  try {
    const { trackMomentumAction } = await import('./pack-224-romantic-momentum.js');
    
    // Map moment types to momentum actions
    const momentumActionMap: Partial<Record<MomentType, any>> = {
      first_voice_call: 'voice_call_10min',
      first_video_call: 'video_call',
      long_call: 'voice_call_10min',
      first_meeting: 'meeting_verified',
      event_attended: 'event_participation'
    };
    
    const momentumAction = momentumActionMap[momentType];
    if (momentumAction) {
      await trackMomentumAction(userId, momentumAction, { source: 'shared_memory' });
    }
  } catch (error) {
    // Non-blocking - don't fail memory creation if momentum tracking fails
    console.error('Failed to track momentum from memory:', error);
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Create daily snapshot of shared memory analytics
 */
export async function createDailyMemoryAnalytics(): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  
  // Get all timelines
  const timelinesSnap = await db.collection('sharedMemories').get();
  const totalTimelines = timelinesSnap.size;
  
  let totalMoments = 0;
  let autoMoments = 0;
  let userAddedMoments = 0;
  const momentTypeDistribution: Record<string, number> = {};
  
  for (const timelineDoc of timelinesSnap.docs) {
    const timeline = timelineDoc.data() as SharedMemoryTimeline;
    totalMoments += timeline.totalMoments;
    autoMoments += timeline.autoMoments;
    userAddedMoments += timeline.userAddedMoments;
  }
  
  // Get moment type distribution
  const momentsSnap = await db.collectionGroup('moments')
    .where('createdAt', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
    .get();
  
  momentsSnap.docs.forEach(doc => {
    const moment = doc.data() as SharedMoment;
    momentTypeDistribution[moment.type] = (momentTypeDistribution[moment.type] || 0) + 1;
  });
  
  const analytics: Omit<SharedMemoryAnalytics, 'createdAt'> = {
    analyticsId: generateId(),
    date,
    totalTimelines,
    totalMoments,
    autoMoments,
    userAddedMoments,
    momentTypeDistribution: momentTypeDistribution as any,
    averageMomentsPerTimeline: totalTimelines > 0 ? totalMoments / totalTimelines : 0
  };
  
  await db.collection('sharedMemoryAnalytics').add({
    ...analytics,
    createdAt: serverTimestamp()
  });
}