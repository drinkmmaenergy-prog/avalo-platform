/**
 * PACK 225: Match Comeback Engine
 * 
 * Re-ignites cooled chats & matches → more chemistry, more paid interactions
 * 
 * Features:
 * - Cooled chat detection based on connection depth
 * - Safety-first eligibility checking
 * - Smart rekindle suggestions with templates
 * - Anti-spam and anti-creep guards
 * - Integration with paid features
 * - Respects breakup recovery and safety states
 */

import { db, serverTimestamp, increment, generateId, timestamp } from './init.js';

type Timestamp = ReturnType<typeof timestamp.now>;

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionDepth = 'light_flirting' | 'call_long_chat' | 'meeting_together';

export type RekindleEligibilityStatus = 
  | 'ELIGIBLE'
  | 'BLOCKED'
  | 'SAFETY_ISSUE'
  | 'BREAKUP_ACTIVE'
  | 'OPTED_OUT'
  | 'SPAM_LIMIT_REACHED'
  | 'NO_REPLY_COOLDOWN'
  | 'NOT_COOLED';

export interface CooledChatCriteria {
  chatId: string;
  participantIds: [string, string];
  totalMessages: number;
  voiceCallCount: number;
  videoCallCount: number;
  meetingCount: number;
  lastActivityAt: Date;
  connectionDepth: ConnectionDepth;
  inactivityDays: number;
  hasEngagingExchange: boolean;
}

export interface RekindleAttempt {
  attemptId: string;
  chatId: string;
  initiatorId: string;
  recipientId: string;
  templateUsed: string;
  messageText: string;
  createdAt: Timestamp;
  replied: boolean;
  repliedAt?: Timestamp;
}

export interface RekindleSuggestion {
  suggestionId: string;
  chatId: string;
  userId: string;
  partnerId: string;
  connectionDepth: ConnectionDepth;
  chemistryScore: number;
  lastGoodEnergyMarker: string;
  suggestedTemplate: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  dismissed: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INACTIVITY_THRESHOLDS: Record<ConnectionDepth, number> = {
  light_flirting: 5 * 24 * 60 * 60 * 1000,      // 5 days
  call_long_chat: 3 * 24 * 60 * 60 * 1000,      // 3 days
  meeting_together: 2 * 24 * 60 * 60 * 1000,    // 2 days
};

const MIN_ENGAGING_MESSAGES = 8;
const MAX_REKINDLE_ATTEMPTS_PER_PAIR_PER_PERIOD = 2;
const REKINDLE_ATTEMPT_PERIOD_DAYS = 30;
const NO_REPLY_COOLDOWN_DAYS = 60;
const MAX_REKINDLE_PROMPTS_PER_DAY = 3;
const SUGGESTION_EXPIRY_DAYS = 7;
const MAX_SUGGESTIONS_IN_STRIP = 5;

// Safe, respectful message templates
const MESSAGE_TEMPLATES = [
  "I liked our last conversation — want to continue where we left off?",
  "Your vibe was nice, I'd like to hear more about {topic}.",
  "We kind of disappeared — still up for chatting?",
  "I was thinking about that thing you said about {topic}…",
  "It's been a while! How have you been?",
  "I enjoyed our {activity} — would love to catch up again.",
  "Hey! Life got busy, but I'd like to reconnect if you're interested.",
  "I remember you mentioned {topic} — still into that?",
];

// ============================================================================
// COOLED CHAT DETECTION
// ============================================================================

/**
 * Determines if a chat has "cooled" and is eligible for comeback
 * 
 * Rules:
 * - Must have engaging exchange (≥8 messages OR ≥1 call OR ≥1 meeting)
 * - Must be inactive based on connection depth threshold
 */
export async function detectCooledChat(chatId: string): Promise<CooledChatCriteria | null> {
  const chatSnap = await db.collection('chats').doc(chatId).get();
  
  if (!chatSnap.exists) {
    return null;
  }
  
  const chat = chatSnap.data() as any;
  
  // Must be closed or inactive
  if (chat.state === 'AWAITING_DEPOSIT') {
    return null; // Not yet started
  }
  
  const totalMessages = chat.billing?.messageCount || 0;
  const lastActivityAt = chat.lastActivityAt?.toDate() || new Date(0);
  
  // Get call and meeting counts
  const voiceCallCount = await getCallCount(chatId, 'voice');
  const videoCallCount = await getCallCount(chatId, 'video');
  const meetingCount = await getMeetingCount(chatId);
  
  // Determine connection depth
  const connectionDepth = determineConnectionDepth(
    totalMessages,
    voiceCallCount,
    videoCallCount,
    meetingCount
  );
  
  // Check if has engaging exchange
  const hasEngagingExchange = 
    totalMessages >= MIN_ENGAGING_MESSAGES ||
    voiceCallCount >= 1 ||
    videoCallCount >= 1 ||
    meetingCount >= 1;
  
  if (!hasEngagingExchange) {
    return null; // Don't rekindle "hi" + "hi" chats
  }
  
  // Calculate inactivity
  const inactivityMs = Date.now() - lastActivityAt.getTime();
  const inactivityDays = Math.floor(inactivityMs / (24 * 60 * 60 * 1000));
  const threshold = INACTIVITY_THRESHOLDS[connectionDepth];
  
  if (inactivityMs < threshold) {
    return null; // Not yet cooled
  }
  
  return {
    chatId,
    participantIds: chat.participants as [string, string],
    totalMessages,
    voiceCallCount,
    videoCallCount,
    meetingCount,
    lastActivityAt,
    connectionDepth,
    inactivityDays,
    hasEngagingExchange,
  };
}

function determineConnectionDepth(
  messages: number,
  voiceCalls: number,
  videoCalls: number,
  meetings: number
): ConnectionDepth {
  if (meetings > 0) {
    return 'meeting_together';
  }
  if (voiceCalls > 0 || videoCalls > 0 || messages >= 20) {
    return 'call_long_chat';
  }
  return 'light_flirting';
}

async function getCallCount(chatId: string, type: 'voice' | 'video'): Promise<number> {
  try {
    const callsSnap = await db.collection('calls')
      .where('chatId', '==', chatId)
      .where('type', '==', type)
      .where('status', '==', 'completed')
      .where('durationSeconds', '>=', type === 'voice' ? 600 : 300) // 10 min voice, 5 min video
      .get();
    return callsSnap.size;
  } catch (error) {
    return 0;
  }
}

async function getMeetingCount(chatId: string): Promise<number> {
  try {
    const meetingsSnap = await db.collection('meetings')
      .where('chatId', '==', chatId)
      .where('verified', '==', true)
      .get();
    return meetingsSnap.size;
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// ELIGIBILITY CHECKING
// ============================================================================

/**
 * Checks if a cooled chat is eligible for rekindle suggestion
 * 
 * Respects:
 * - Blocks
 * - Safety complaints
 * - Breakup recovery states
 * - User opt-out preferences
 * - Spam limits
 */
export async function checkRekindleEligibility(
  chatId: string,
  initiatorId: string,
  recipientId: string
): Promise<{ eligible: boolean; status: RekindleEligibilityStatus; reason?: string }> {
  
  // Check if chat is actually cooled
  const cooledChat = await detectCooledChat(chatId);
  if (!cooledChat) {
    return { eligible: false, status: 'NOT_COOLED' };
  }
  
  // Check blocks
  const isBlocked = await checkIfBlocked(initiatorId, recipientId);
  if (isBlocked) {
    return { eligible: false, status: 'BLOCKED', reason: 'Participants have blocked each other' };
  }
  
  // Check safety complaints
  const hasSafetyIssue = await checkSafetyComplaints(initiatorId, recipientId, chatId);
  if (hasSafetyIssue) {
    return { eligible: false, status: 'SAFETY_ISSUE', reason: 'Safety complaint is active' };
  }
  
  // Check breakup recovery state (PACK 222)
  const hasActiveBreakup = await checkBreakupState(initiatorId, recipientId);
  if (hasActiveBreakup) {
    return { eligible: false, status: 'BREAKUP_ACTIVE', reason: 'Breakup recovery is active' };
  }
  
  // Check opt-out preferences
  const hasOptedOut = await checkOptOutPreferences(initiatorId, recipientId);
  if (hasOptedOut) {
    return { eligible: false, status: 'OPTED_OUT', reason: 'User has opted out of rekindle suggestions' };
  }
  
  // Check spam limits
  const spamCheck = await checkSpamLimits(chatId, initiatorId, recipientId);
  if (!spamCheck.allowed) {
    return { eligible: false, status: spamCheck.status, reason: spamCheck.reason };
  }
  
  return { eligible: true, status: 'ELIGIBLE' };
}

async function checkIfBlocked(userA: string, userB: string): Promise<boolean> {
  try {
    const blockA = await db.collection('users').doc(userA)
      .collection('blocked_users').doc(userB).get();
    const blockB = await db.collection('users').doc(userB)
      .collection('blocked_users').doc(userA).get();
    return blockA.exists || blockB.exists;
  } catch (error) {
    return false;
  }
}

async function checkSafetyComplaints(userA: string, userB: string, chatId: string): Promise<boolean> {
  try {
    // Check panic button activations
    const panicSnap = await db.collection('panic_activations')
      .where('chatId', '==', chatId)
      .where('resolved', '==', false)
      .limit(1)
      .get();
    
    if (!panicSnap.empty) {
      return true;
    }
    
    // Check active safety incidents
    const incidentsSnap = await db.collection('trust_safety_incidents')
      .where('userId', 'in', [userA, userB])
      .where('severity', 'in', ['HIGH', 'CRITICAL'])
      .where('resolved', '==', false)
      .limit(1)
      .get();
    
    return !incidentsSnap.empty;
  } catch (error) {
    return false;
  }
}

async function checkBreakupState(userA: string, userB: string): Promise<boolean> {
  try {
    // Check if either user is in breakup recovery with the other
    const recoveryASnap = await db.collection('breakup_recovery')
      .where('userId', '==', userA)
      .where('partnerId', '==', userB)
      .where('status', 'in', ['ACTIVE', 'COOLDOWN'])
      .limit(1)
      .get();
    
    const recoveryBSnap = await db.collection('breakup_recovery')
      .where('userId', '==', userB)
      .where('partnerId', '==', userA)
      .where('status', 'in', ['ACTIVE', 'COOLDOWN'])
      .limit(1)
      .get();
    
    return !recoveryASnap.empty || !recoveryBSnap.empty;
  } catch (error) {
    return false;
  }
}

async function checkOptOutPreferences(userA: string, userB: string): Promise<boolean> {
  try {
    const settingsA = await db.collection('users').doc(userA)
      .collection('settings').doc('preferences').get();
    const settingsB = await db.collection('users').doc(userB)
      .collection('settings').doc('preferences').get();
    
    const optOutA = settingsA.data()?.rekindleSuggestionsEnabled === false;
    const optOutB = settingsB.data()?.rekindleSuggestionsEnabled === false;
    
    return optOutA || optOutB;
  } catch (error) {
    return false;
  }
}

async function checkSpamLimits(
  chatId: string,
  initiatorId: string,
  recipientId: string
): Promise<{ allowed: boolean; status: RekindleEligibilityStatus; reason?: string }> {
  
  // Check max attempts per pair in period
  const periodStart = new Date(Date.now() - REKINDLE_ATTEMPT_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const attemptsSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('createdAt', '>=', periodStart)
    .get();
  
  if (attemptsSnap.size >= MAX_REKINDLE_ATTEMPTS_PER_PAIR_PER_PERIOD) {
    return {
      allowed: false,
      status: 'SPAM_LIMIT_REACHED',
      reason: `Maximum ${MAX_REKINDLE_ATTEMPTS_PER_PAIR_PER_PERIOD} rekindle attempts per ${REKINDLE_ATTEMPT_PERIOD_DAYS} days reached`
    };
  }
  
  // Check no-reply cooldown
  const lastAttemptSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('replied', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (!lastAttemptSnap.empty) {
    const lastAttempt = lastAttemptSnap.docs[0].data();
    const lastAttemptDate = lastAttempt.createdAt.toDate();
    const daysSinceLastAttempt = (Date.now() - lastAttemptDate.getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysSinceLastAttempt < NO_REPLY_COOLDOWN_DAYS) {
      return {
        allowed: false,
        status: 'NO_REPLY_COOLDOWN',
        reason: `Must wait ${NO_REPLY_COOLDOWN_DAYS} days after no reply`
      };
    }
  }
  
  // Check recipient's daily prompt limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dailyPromptsSnap = await db.collection('rekindle_suggestions')
    .where('userId', '==', recipientId)
    .where('createdAt', '>=', today)
    .where('dismissed', '==', false)
    .get();
  
  if (dailyPromptsSnap.size >= MAX_REKINDLE_PROMPTS_PER_DAY) {
    return {
      allowed: false,
      status: 'SPAM_LIMIT_REACHED',
      reason: 'Recipient has reached daily rekindle prompt limit'
    };
  }
  
  return { allowed: true, status: 'ELIGIBLE' };
}

// ============================================================================
// SUGGESTION GENERATION
// ============================================================================

/**
 * Generate rekindle suggestions for a user
 * Returns top candidates based on chemistry score and shared history
 */
export async function generateRekindleSuggestions(
  userId: string,
  limit: number = MAX_SUGGESTIONS_IN_STRIP
): Promise<RekindleSuggestion[]> {
  
  // Get user's chats
  const chatsSnap = await db.collection('chats')
    .where('participants', 'array-contains', userId)
    .where('state', 'in', ['CLOSED', 'FREE_ACTIVE', 'PAID_ACTIVE'])
    .get();
  
  const suggestions: RekindleSuggestion[] = [];
  
  for (const chatDoc of chatsSnap.docs) {
    const chat = chatDoc.data();
    const partnerId = chat.participants.find((p: string) => p !== userId);
    
    if (!partnerId) continue;
    
    // Check if cooled
    const cooledChat = await detectCooledChat(chatDoc.id);
    if (!cooledChat) continue;
    
    // Check eligibility
    const eligibility = await checkRekindleEligibility(chatDoc.id, userId, partnerId);
    if (!eligibility.eligible) continue;
    
    // Calculate chemistry score (integrate with PACK 195 if available)
    const chemistryScore = await calculateChemistryScore(userId, partnerId, cooledChat);
    
    // Generate last good energy marker
    const energyMarker = generateEnergyMarker(cooledChat);
    
    // Select template
    const template = selectTemplate(cooledChat);
    
    suggestions.push({
      suggestionId: generateId(),
      chatId: chatDoc.id,
      userId,
      partnerId,
      connectionDepth: cooledChat.connectionDepth,
      chemistryScore,
      lastGoodEnergyMarker: energyMarker,
      suggestedTemplate: template,
      createdAt: serverTimestamp() as Timestamp,
      expiresAt: new Date(Date.now() + SUGGESTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000) as any,
      dismissed: false,
    });
  }
  
  // Sort by chemistry score and romantic momentum
  suggestions.sort((a, b) => b.chemistryScore - a.chemistryScore);
  
  // Apply romantic momentum boost (PACK 224)
  const boostedSuggestions = await applyMomentumBoost(userId, suggestions);
  
  return boostedSuggestions.slice(0, limit);
}

async function calculateChemistryScore(
  userId: string,
  partnerId: string,
  cooledChat: CooledChatCriteria
): Promise<number> {
  let score = 50; // Base score
  
  // Connection depth bonus
  if (cooledChat.connectionDepth === 'meeting_together') {
    score += 30;
  } else if (cooledChat.connectionDepth === 'call_long_chat') {
    score += 20;
  } else {
    score += 10;
  }
  
  // Message count bonus
  score += Math.min(cooledChat.totalMessages / 2, 20);
  
  // Check for positive vibe feedback
  try {
    const vibeSnap = await db.collection('vibe_feedback')
      .where('userId', '==', userId)
      .where('partnerId', '==', partnerId)
      .where('rating', '>=', 4)
      .limit(1)
      .get();
    
    if (!vibeSnap.empty) {
      score += 15;
    }
  } catch (error) {
    // Non-blocking
  }
  
  // Check Romantic Journey history (PACK 221)
  try {
    const journeySnap = await db.collection('romantic_journeys')
      .where('participantIds', 'array-contains', userId)
      .where('status', 'in', ['ACTIVE', 'COMPLETED'])
      .limit(1)
      .get();
    
    if (!journeySnap.empty) {
      score += 20;
    }
  } catch (error) {
    // Non-blocking
  }
  
  return Math.min(score, 100);
}

function generateEnergyMarker(cooledChat: CooledChatCriteria): string {
  if (cooledChat.meetingCount > 0) {
    return `Met in person ${cooledChat.inactivityDays} days ago`;
  }
  if (cooledChat.videoCallCount > 0) {
    return `Video call ${cooledChat.inactivityDays} days ago`;
  }
  if (cooledChat.voiceCallCount > 0) {
    return `Voice call ${cooledChat.inactivityDays} days ago`;
  }
  if (cooledChat.totalMessages >= 20) {
    return `Great chat ${cooledChat.inactivityDays} days ago`;
  }
  return `Nice conversation ${cooledChat.inactivityDays} days ago`;
}

function selectTemplate(cooledChat: CooledChatCriteria): string {
  // Select template based on context
  const templates = [...MESSAGE_TEMPLATES];
  
  if (cooledChat.meetingCount > 0) {
    return templates.find(t => t.includes('{activity}'))?.replace('{activity}', 'meeting') || templates[0];
  }
  if (cooledChat.voiceCallCount > 0 || cooledChat.videoCallCount > 0) {
    return templates.find(t => t.includes('{activity}'))?.replace('{activity}', 'call') || templates[0];
  }
  
  // Random selection for text-only chats
  return templates[Math.floor(Math.random() * templates.length)];
}

async function applyMomentumBoost(
  userId: string,
  suggestions: RekindleSuggestion[]
): Promise<RekindleSuggestion[]> {
  try {
    // Get romantic momentum for each partner
    const partnerIds = suggestions.map(s => s.partnerId);
    const momentumStates = await Promise.all(
      partnerIds.map(async (partnerId) => {
        try {
          const momentumSnap = await db.collection('romantic_momentum_states').doc(partnerId).get();
          return { partnerId, score: momentumSnap.data()?.momentumScore || 0 };
        } catch {
          return { partnerId, score: 0 };
        }
      })
    );
    
    // Boost chemistry score for high-momentum partners
    return suggestions.map(suggestion => {
      const momentum = momentumStates.find(m => m.partnerId === suggestion.partnerId);
      if (momentum && momentum.score >= 70) {
        return {
          ...suggestion,
          chemistryScore: Math.min(suggestion.chemistryScore * 1.2, 100)
        };
      }
      return suggestion;
    });
  } catch (error) {
    return suggestions;
  }
}

// ============================================================================
// REKINDLE ACTIONS
// ============================================================================

/**
 * Create a rekindle attempt and save it
 */
export async function createRekindleAttempt(
  chatId: string,
  initiatorId: string,
  recipientId: string,
  messageText: string,
  templateUsed: string
): Promise<{ success: boolean; attemptId?: string; error?: string }> {
  
  // Verify eligibility
  const eligibility = await checkRekindleEligibility(chatId, initiatorId, recipientId);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }
  
  const attemptId = generateId();
  
  await db.collection('rekindle_attempts').doc(attemptId).set({
    attemptId,
    chatId,
    initiatorId,
    recipientId,
    templateUsed,
    messageText,
    createdAt: serverTimestamp(),
    replied: false,
  });
  
  // Mark suggestion as actioned (if exists)
  const suggestionSnap = await db.collection('rekindle_suggestions')
    .where('chatId', '==', chatId)
    .where('userId', '==', initiatorId)
    .where('dismissed', '==', false)
    .limit(1)
    .get();
  
  if (!suggestionSnap.empty) {
    await suggestionSnap.docs[0].ref.update({
      actioned: true,
      actionedAt: serverTimestamp(),
    });
  }
  
  return { success: true, attemptId };
}

/**
 * Mark a rekindle attempt as replied
 */
export async function markRekindleReplied(attemptId: string): Promise<void> {
  await db.collection('rekindle_attempts').doc(attemptId).update({
    replied: true,
    repliedAt: serverTimestamp(),
  });
}

/**
 * Dismiss a rekindle suggestion
 */
export async function dismissRekindleSuggestion(suggestionId: string, userId: string): Promise<void> {
  await db.collection('rekindle_suggestions').doc(suggestionId).update({
    dismissed: true,
    dismissedAt: serverTimestamp(),
    dismissedBy: userId,
  });
}

/**
 * Save rekindle suggestions to database
 */
export async function saveRekindleSuggestions(suggestions: RekindleSuggestion[]): Promise<void> {
  const batch = db.batch();
  
  for (const suggestion of suggestions) {
    const ref = db.collection('rekindle_suggestions').doc(suggestion.suggestionId);
    batch.set(ref, suggestion);
  }
  
  await batch.commit();
}

/**
 * Get active rekindle suggestions for a user
 */
export async function getActiveRekindleSuggestions(userId: string): Promise<RekindleSuggestion[]> {
  const now = new Date();
  
  const suggestionsSnap = await db.collection('rekindle_suggestions')
    .where('userId', '==', userId)
    .where('dismissed', '==', false)
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'desc')
    .orderBy('chemistryScore', 'desc')
    .limit(MAX_SUGGESTIONS_IN_STRIP)
    .get();
  
  return suggestionsSnap.docs.map(doc => doc.data() as RekindleSuggestion);
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface RekindleAnalytics {
  totalAttempts: number;
  successfulAttempts: number;
  replyRate: number;
  avgTimeToReply: number;
  topTemplates: Array<{ template: string; useCount: number; successRate: number }>;
  byConnectionDepth: Record<ConnectionDepth, { attempts: number; replies: number }>;
}

/**
 * Get analytics for rekindle attempts
 */
export async function getRekindleAnalytics(
  userId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<RekindleAnalytics> {
  let query = db.collection('rekindle_attempts') as any;
  
  if (userId) {
    query = query.where('initiatorId', '==', userId);
  }
  
  if (startDate) {
    query = query.where('createdAt', '>=', startDate);
  }
  
  if (endDate) {
    query = query.where('createdAt', '<=', endDate);
  }
  
  const attemptsSnap = await query.get();
  const attempts = attemptsSnap.docs.map((doc: any) => doc.data());
  
  const totalAttempts = attempts.length;
  const successfulAttempts = attempts.filter((a: any) => a.replied).length;
  const replyRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
  
  // Calculate average time to reply
  const repliedAttempts = attempts.filter((a: any) => a.replied && a.repliedAt);
  const avgTimeToReply = repliedAttempts.length > 0
    ? repliedAttempts.reduce((sum: number, a: any) => {
        const timeDiff = a.repliedAt.toDate().getTime() - a.createdAt.toDate().getTime();
        return sum + timeDiff;
      }, 0) / repliedAttempts.length
    : 0;
  
  // Template analysis (simplified for now)
  const topTemplates: Array<{ template: string; useCount: number; successRate: number }> = [];
  
  // Connection depth analysis
  const byConnectionDepth: Record<ConnectionDepth, { attempts: number; replies: number }> = {
    light_flirting: { attempts: 0, replies: 0 },
    call_long_chat: { attempts: 0, replies: 0 },
    meeting_together: { attempts: 0, replies: 0 },
  };
  
  return {
    totalAttempts,
    successfulAttempts,
    replyRate,
    avgTimeToReply: avgTimeToReply / (60 * 1000), // Convert to minutes
    topTemplates,
    byConnectionDepth,
  };
}

/**
 * Track rekindle conversion to paid action
 */
export async function trackRekindleConversion(
  attemptId: string,
  conversionType: 'chat' | 'call' | 'meeting' | 'event',
  tokenAmount: number
): Promise<void> {
  await db.collection('rekindle_conversions').doc(generateId()).set({
    attemptId,
    conversionType,
    tokenAmount,
    createdAt: serverTimestamp(),
  });
  
  // Update attempt with conversion info
  await db.collection('rekindle_attempts').doc(attemptId).update({
    converted: true,
    conversionType,
    conversionTokens: tokenAmount,
    convertedAt: serverTimestamp(),
  });
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Generate daily rekindle suggestions for active users
 * Should be run once per day
 */
export async function generateDailySuggestions(): Promise<number> {
  // Get users who were active in last 7 days
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const activeUsersSnap = await db.collection('users')
    .where('lastActiveAt', '>=', cutoffDate)
    .limit(1000) // Process in batches
    .get();
  
  let generatedCount = 0;
  
  for (const userDoc of activeUsersSnap.docs) {
    try {
      const suggestions = await generateRekindleSuggestions(userDoc.id);
      if (suggestions.length > 0) {
        await saveRekindleSuggestions(suggestions);
        generatedCount += suggestions.length;
      }
    } catch (error) {
      console.error(`Failed to generate suggestions for user ${userDoc.id}:`, error);
    }
  }
  
  return generatedCount;
}

/**
 * Clean up expired suggestions
 */
export async function cleanupExpiredSuggestions(): Promise<number> {
  const now = new Date();
  
  const expiredSnap = await db.collection('rekindle_suggestions')
    .where('expiresAt', '<', now)
    .limit(500)
    .get();
  
  const batch = db.batch();
  expiredSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  return expiredSnap.size;
}