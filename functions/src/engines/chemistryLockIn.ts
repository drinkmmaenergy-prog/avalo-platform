/**
 * PACK 226 - Chemistry Lock-In Engine
 *
 * Prevents chat drop-off by detecting and reinforcing peak chemistry
 * between matches, converting high-chemistry pairs into sustained
 * paid interactions (chats, calls, meetings).
 */

import { db } from '../init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface ChemistrySignal {
  type: 'messages' | 'long_messages' | 'voice_call' | 'video_call' | 
        'inside_joke' | 'flirtation' | 'photo_likes' | 'meeting_plans';
  weight: number;
  detectedAt: Timestamp;
  metadata?: any;
}

export interface ChemistryLockIn {
  isActive: boolean;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  strengthScore: number;
  signals: ChemistrySignal[];
  lastActivityAt: Timestamp;
  exitReason?: 'inactivity' | 'disabled' | 'safety' | 'breakup';
  perksExpiresAt?: Timestamp | null;
  conversionSuggestionShown?: boolean;
  reEntryCount?: number;
}

export interface ChemistryStatus {
  status: 'warming_up' | 'strong' | 'intense' | 'calming';
  score: number;
  canActivate: boolean;
  signals: ChemistrySignal[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SIGNAL_WEIGHTS = {
  messages: 1,           // 25+ messages both sides
  long_messages: 1,      // 2+ long messages (800+ chars)
  voice_call: 1,         // ≥8 min call
  video_call: 1,         // ≥5 min call
  inside_joke: 1,        // AI detected
  flirtation: 1,         // Compliments exchanged
  photo_likes: 1,        // Both liked photos
  meeting_plans: 1       // Meeting mentioned in chat
} as const;

const ACTIVATION_THRESHOLD = 3;
const SIGNAL_WINDOW_DAYS = 5;
const INACTIVITY_TIMEOUT_HOURS = 72;
const PERKS_DURATION_HOURS = 72;
const TOXIC_COOLDOWN_DAYS = 14;

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

/**
 * Analyze a conversation to detect chemistry signals
 */
export async function detectChemistrySignals(
  conversationId: string,
  user1Id: string,
  user2Id: string,
  options: {
    windowDays?: number;
    includeAIAnalysis?: boolean;
  } = {}
): Promise<ChemistrySignal[]> {
  const windowDays = options.windowDays || SIGNAL_WINDOW_DAYS;
  const cutoffTime = Timestamp.fromMillis(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  
  const signals: ChemistrySignal[] = [];

  // Get recent messages
  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .where('createdAt', '>=', cutoffTime)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const messages = messagesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Array<{
    id: string;
    senderId: string;
    content?: string;
    createdAt: Timestamp;
    [key: string]: any;
  }>;

  // Signal 1: Message count (25+ messages both sides)
  const user1Messages = messages.filter(m => m.senderId === user1Id);
  const user2Messages = messages.filter(m => m.senderId === user2Id);
  
  if (user1Messages.length + user2Messages.length >= 25 && 
      user1Messages.length >= 5 && user2Messages.length >= 5) {
    signals.push({
      type: 'messages',
      weight: SIGNAL_WEIGHTS.messages,
      detectedAt: Timestamp.now(),
      metadata: { 
        user1Count: user1Messages.length, 
        user2Count: user2Messages.length 
      }
    });
  }

  // Signal 2: Long messages (800+ chars, both sides)
  const user1LongMessages = user1Messages.filter(m => 
    (m.content?.length || 0) >= 800
  ).length;
  const user2LongMessages = user2Messages.filter(m => 
    (m.content?.length || 0) >= 800
  ).length;

  if (user1LongMessages >= 2 && user2LongMessages >= 2) {
    signals.push({
      type: 'long_messages',
      weight: SIGNAL_WEIGHTS.long_messages,
      detectedAt: Timestamp.now(),
      metadata: { 
        user1LongCount: user1LongMessages, 
        user2LongCount: user2LongMessages 
      }
    });
  }

  // Signal 3 & 4: Voice/Video calls
  const callsSnapshot = await db
    .collection('calls')
    .where('conversationId', '==', conversationId)
    .where('startedAt', '>=', cutoffTime)
    .where('status', '==', 'completed')
    .get();

  for (const callDoc of callsSnapshot.docs) {
    const call = callDoc.data();
    const durationMinutes = call.duration ? call.duration / 60 : 0;

    if (call.type === 'voice' && durationMinutes >= 8) {
      signals.push({
        type: 'voice_call',
        weight: SIGNAL_WEIGHTS.voice_call,
        detectedAt: Timestamp.now(),
        metadata: { duration: durationMinutes }
      });
    }

    if (call.type === 'video' && durationMinutes >= 5) {
      signals.push({
        type: 'video_call',
        weight: SIGNAL_WEIGHTS.video_call,
        detectedAt: Timestamp.now(),
        metadata: { duration: durationMinutes }
      });
    }
  }

  // Signal 5: Inside jokes (AI detection)
  if (options.includeAIAnalysis) {
    const insideJokeDetected = await detectInsideJoke(messages);
    if (insideJokeDetected) {
      signals.push({
        type: 'inside_joke',
        weight: SIGNAL_WEIGHTS.inside_joke,
        detectedAt: Timestamp.now()
      });
    }
  }

  // Signal 6: Flirtatious compliments
  const flirtationDetected = detectFlirtation(messages);
  if (flirtationDetected) {
    signals.push({
      type: 'flirtation',
      weight: SIGNAL_WEIGHTS.flirtation,
      detectedAt: Timestamp.now()
    });
  }

  // Signal 7: Photo likes (both users)
  const user1LikedUser2Photos = await checkPhotoLikes(user1Id, user2Id);
  const user2LikedUser1Photos = await checkPhotoLikes(user2Id, user1Id);

  if (user1LikedUser2Photos && user2LikedUser1Photos) {
    signals.push({
      type: 'photo_likes',
      weight: SIGNAL_WEIGHTS.photo_likes,
      detectedAt: Timestamp.now()
    });
  }

  // Signal 8: Meeting plans mentioned
  const meetingPlansDetected = detectMeetingPlans(messages);
  if (meetingPlansDetected) {
    signals.push({
      type: 'meeting_plans',
      weight: SIGNAL_WEIGHTS.meeting_plans,
      detectedAt: Timestamp.now()
    });
  }

  return signals;
}

/**
 * Calculate chemistry status based on signals
 */
export function calculateChemistryStatus(signals: ChemistrySignal[]): ChemistryStatus {
  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  
  let status: ChemistryStatus['status'];
  if (score >= 5) status = 'intense';
  else if (score >= 4) status = 'strong';
  else if (score >= 3) status = 'warming_up';
  else status = 'calming';

  return {
    status,
    score,
    canActivate: score >= ACTIVATION_THRESHOLD,
    signals
  };
}

// ============================================================================
// LOCK-IN ACTIVATION & MANAGEMENT
// ============================================================================

/**
 * Attempt to activate Chemistry Lock-In for a conversation
 */
export async function activateChemistryLockIn(
  conversationId: string,
  user1Id: string,
  user2Id: string
): Promise<{ success: boolean; reason?: string; score?: number }> {
  const conversationRef = db.collection('conversations').doc(conversationId);
  const conversationDoc = await conversationRef.get();
  
  if (!conversationDoc.exists) {
    return { success: false, reason: 'conversation_not_found' };
  }

  const conversation = conversationDoc.data()!;

  // Check if already active
  if (conversation.chemistryLockIn?.isActive) {
    return { success: false, reason: 'already_active' };
  }

  // Check for toxic cooldown
  if (conversation.toxicCooldownUntil) {
    const cooldownExpires = conversation.toxicCooldownUntil.toMillis();
    if (Date.now() < cooldownExpires) {
      return { success: false, reason: 'toxic_cooldown' };
    }
  }

  // Detect signals
  const signals = await detectChemistrySignals(conversationId, user1Id, user2Id, {
    includeAIAnalysis: true
  });

  const status = calculateChemistryStatus(signals);

  // Check if meets activation threshold
  if (!status.canActivate) {
    return { success: false, reason: 'insufficient_chemistry', score: status.score };
  }

  // Check for one-sided activity (abuse prevention)
  const isOneSided = await checkOneSidedActivity(conversationId, user1Id, user2Id);
  if (isOneSided) {
    return { success: false, reason: 'one_sided_activity' };
  }

  // Activate Lock-In
  const now = Timestamp.now();
  const perksExpiresAt = Timestamp.fromMillis(
    Date.now() + PERKS_DURATION_HOURS * 60 * 60 * 1000
  );

  await conversationRef.update({
    'chemistryLockIn.isActive': true,
    'chemistryLockIn.startedAt': now,
    'chemistryLockIn.endedAt': null,
    'chemistryLockIn.strengthScore': status.score,
    'chemistryLockIn.signals': signals,
    'chemistryLockIn.lastActivityAt': now,
    'chemistryLockIn.perksExpiresAt': perksExpiresAt,
    'chemistryLockIn.conversionSuggestionShown': false,
    'chemistryLockIn.reEntryCount': FieldValue.increment(1)
  });

  // Boost visibility for each other
  await boostMutualVisibility(conversationId, user1Id, user2Id);

  return { success: true };
}

/**
 * Deactivate Chemistry Lock-In
 */
export async function deactivateChemistryLockIn(
  conversationId: string,
  reason: ChemistryLockIn['exitReason']
): Promise<void> {
  const conversationRef = db.collection('conversations').doc(conversationId);
  
  await conversationRef.update({
    'chemistryLockIn.isActive': false,
    'chemistryLockIn.endedAt': Timestamp.now(),
    'chemistryLockIn.exitReason': reason
  });
}

/**
 * Check if Lock-In should expire due to inactivity
 */
export async function checkLockInExpiration(conversationId: string): Promise<boolean> {
  const conversationDoc = await db
    .collection('conversations')
    .doc(conversationId)
    .get();

  if (!conversationDoc.exists) return false;

  const conversation = conversationDoc.data()!;
  const lockIn = conversation.chemistryLockIn;

  if (!lockIn?.isActive) return false;

  const lastActivity = lockIn.lastActivityAt?.toMillis() || 0;
  const inactivityThreshold = Date.now() - INACTIVITY_TIMEOUT_HOURS * 60 * 60 * 1000;

  if (lastActivity < inactivityThreshold) {
    await deactivateChemistryLockIn(conversationId, 'inactivity');
    return true;
  }

  return false;
}

/**
 * Update Lock-In activity timestamp
 */
export async function updateLockInActivity(conversationId: string): Promise<void> {
  await db
    .collection('conversations')
    .doc(conversationId)
    .update({
      'chemistryLockIn.lastActivityAt': Timestamp.now()
    });
}

// ============================================================================
// CONVERSION SUGGESTIONS
// ============================================================================

/**
 * Check if conversion suggestion should be shown (at 72h mark)
 */
export async function checkConversionSuggestion(
  conversationId: string
): Promise<{
  shouldShow: boolean;
  suggestion?: string;
  action?: 'voice_call' | 'video_call' | 'meeting';
}> {
  const conversationDoc = await db
    .collection('conversations')
    .doc(conversationId)
    .get();

  if (!conversationDoc.exists) {
    return { shouldShow: false };
  }

  const conversation = conversationDoc.data()!;
  const lockIn = conversation.chemistryLockIn;

  if (!lockIn?.isActive || lockIn.conversionSuggestionShown) {
    return { shouldShow: false };
  }

  const startedAt = lockIn.startedAt?.toMillis() || 0;
  const hoursSinceStart = (Date.now() - startedAt) / (60 * 60 * 1000);

  if (hoursSinceStart < 72) {
    return { shouldShow: false };
  }

  // Generate contextual suggestion
  const suggestion = await generateConversionSuggestion(conversationId);

  // Mark as shown
  await db
    .collection('conversations')
    .doc(conversationId)
    .update({
      'chemistryLockIn.conversionSuggestionShown': true
    });

  return {
    shouldShow: true,
    ...suggestion
  };
}

/**
 * Generate AI-based conversion suggestion
 */
async function generateConversionSuggestion(
  conversationId: string
): Promise<{ suggestion: string; action: 'voice_call' | 'video_call' | 'meeting' }> {
  // Get recent messages for context
  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const messages = messagesSnapshot.docs.map(doc => doc.data());

  // Simple heuristic-based suggestions (can be enhanced with AI)
  const lastMessages = messages.slice(0, 5).map(m => m.content?.toLowerCase() || '');
  
  // Check for meeting-related keywords
  const meetingKeywords = ['coffee', 'meet', 'date', 'dinner', 'lunch', 'drink'];
  const hasMeetingTalk = lastMessages.some(msg => 
    meetingKeywords.some(keyword => msg.includes(keyword))
  );

  // Check for voice/video interest
  const callKeywords = ['voice', 'call', 'talk', 'hear', 'video'];
  const hasCallInterest = lastMessages.some(msg =>
    callKeywords.some(keyword => msg.includes(keyword))
  );

  if (hasMeetingTalk) {
    return {
      action: 'meeting',
      suggestion: "You two were talking about meeting up… coffee date this week?"
    };
  }

  if (hasCallInterest) {
    return {
      action: 'voice_call',
      suggestion: "The chemistry between you two is rare — want to jump on a quick voice call?"
    };
  }

  // Default suggestion
  return {
    action: 'voice_call',
    suggestion: "You're in sync — a voice call could be fun!"
  };
}

// ============================================================================
// ABUSE PREVENTION
// ============================================================================

/**
 * Check for one-sided activity (spam prevention)
 */
async function checkOneSidedActivity(
  conversationId: string,
  user1Id: string,
  user2Id: string
): Promise<boolean> {
  const cutoffTime = Timestamp.fromMillis(
    Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .where('createdAt', '>=', cutoffTime)
    .get();

  const user1Messages = messagesSnapshot.docs.filter(
    doc => doc.data().senderId === user1Id
  ).length;
  const user2Messages = messagesSnapshot.docs.filter(
    doc => doc.data().senderId === user2Id
  ).length;

  const totalMessages = user1Messages + user2Messages;
  if (totalMessages === 0) return true;

  // Consider one-sided if one user has >80% of messages
  const ratio = Math.max(user1Messages, user2Messages) / totalMessages;
  return ratio > 0.8;
}

/**
 * Apply toxic cooldown to conversation
 */
export async function applyToxicCooldown(conversationId: string): Promise<void> {
  const cooldownUntil = Timestamp.fromMillis(
    Date.now() + TOXIC_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  );

  await db
    .collection('conversations')
    .doc(conversationId)
    .update({
      toxicCooldownUntil: cooldownUntil,
      'chemistryLockIn.isActive': false,
      'chemistryLockIn.endedAt': Timestamp.now(),
      'chemistryLockIn.exitReason': 'safety'
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect inside jokes using AI (placeholder for AI integration)
 */
async function detectInsideJoke(messages: any[]): Promise<boolean> {
  // TODO: Integrate with AI service to detect inside jokes
  // For now, use simple heuristics
  const recentMessages = messages.slice(0, 10);
  const laughterCount = recentMessages.filter(m => 
    /😂|😄|😆|lol|haha|lmao/i.test(m.content || '')
  ).length;

  return laughterCount >= 3;
}

/**
 * Detect flirtation in messages
 */
function detectFlirtation(messages: any[]): Promise<boolean> {
  const flirtKeywords = [
    'cute', 'beautiful', 'handsome', 'gorgeous', 'stunning',
    'attractive', 'smile', 'eyes', 'adorable', 'charming'
  ];

  const recentMessages = messages.slice(0, 20);
  const flirtCount = recentMessages.filter(m => {
    const content = (m.content || '').toLowerCase();
    return flirtKeywords.some(keyword => content.includes(keyword));
  }).length;

  return Promise.resolve(flirtCount >= 2);
}

/**
 * Check if user liked another user's photos
 */
async function checkPhotoLikes(likerId: string, profileOwnerId: string): Promise<boolean> {
  const likesSnapshot = await db
    .collection('users')
    .doc(profileOwnerId)
    .collection('photoLikes')
    .where('userId', '==', likerId)
    .limit(1)
    .get();

  return !likesSnapshot.empty;
}

/**
 * Detect meeting plans in messages
 */
function detectMeetingPlans(messages: any[]): boolean {
  const meetingKeywords = [
    'meet', 'coffee', 'dinner', 'lunch', 'date',
    'this weekend', 'next week', 'tomorrow', 'tonight'
  ];

  const recentMessages = messages.slice(0, 20);
  return recentMessages.some(m => {
    const content = (m.content || '').toLowerCase();
    return meetingKeywords.some(keyword => content.includes(keyword));
  });
}

/**
 * Boost mutual visibility in discovery feed
 */
async function boostMutualVisibility(
  conversationId: string,
  user1Id: string,
  user2Id: string
): Promise<void> {
  const expiresAt = Timestamp.fromMillis(
    Date.now() + PERKS_DURATION_HOURS * 60 * 60 * 1000
  );

  // Add visibility boost for user1 to see user2
  await db
    .collection('users')
    .doc(user1Id)
    .collection('visibilityBoosts')
    .doc(user2Id)
    .set({
      targetUserId: user2Id,
      conversationId,
      reason: 'chemistry_lock_in',
      multiplier: 10,
      expiresAt,
      createdAt: Timestamp.now()
    });

  // Add visibility boost for user2 to see user1
  await db
    .collection('users')
    .doc(user2Id)
    .collection('visibilityBoosts')
    .doc(user1Id)
    .set({
      targetUserId: user1Id,
      conversationId,
      reason: 'chemistry_lock_in',
      multiplier: 10,
      expiresAt,
      createdAt: Timestamp.now()
    });
}

// ============================================================================
// CRON JOB HANDLERS
// ============================================================================

/**
 * Daily cron: Check all active Lock-Ins for expiration
 */
export async function processLockInExpirations(): Promise<void> {
  const activeConversations = await db
    .collection('conversations')
    .where('chemistryLockIn.isActive', '==', true)
    .get();

  let updateCount = 0;

  for (const doc of activeConversations.docs) {
    const expired = await checkLockInExpiration(doc.id);
    if (expired) {
      updateCount++;
    }
  }

  console.log(`[Chemistry Lock-In] Processed ${activeConversations.size} active Lock-Ins, expired ${updateCount}`);
}