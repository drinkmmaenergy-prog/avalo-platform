/**
 * PACK 153 — Real-Time Safety Monitoring
 * 
 * Voice/Video Call Monitoring · Livestream Chat Moderation · Event Monitoring
 */

import { db, serverTimestamp, generateId } from './init';
import {
  VoiceAnalysisSession,
  LivestreamModerationSession,
  VoiceTranscriptRedacted,
  ViolationType,
  ViolationSeverity,
  SafetyAction,
  ContentType,
} from './types/safety.types';
import { evaluateVoiceSafety, logSafetyIncident } from './pack153-safety-system';
import { classifyContent } from './pack153-ml-classifiers';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// VOICE/VIDEO CALL MONITORING
// ============================================================================

/**
 * Start voice analysis session for call
 */
export async function startVoiceAnalysisSession(params: {
  callId: string;
  participantIds: string[];
}): Promise<string> {
  const sessionId = generateId();

  const session: Partial<VoiceAnalysisSession> = {
    sessionId,
    callId: params.callId,
    active: true,
    startedAt: serverTimestamp() as Timestamp,
    participants: params.participantIds.map(userId => ({
      userId,
      joined: serverTimestamp() as Timestamp,
      currentlyMuted: false,
    })),
    activeViolations: [],
    escalationLevel: 0,
    humanModeratorRequested: false,
    autoTerminationTriggered: false,
  };

  await db.collection('voice_analysis_sessions').doc(sessionId).set(session);

  return sessionId;
}

/**
 * Process voice transcript segment in real-time
 */
export async function processVoiceTranscript(params: {
  sessionId: string;
  callId: string;
  userId: string;
  transcriptSegment: string;
  timestamp: number;
}): Promise<{
  violationDetected: boolean;
  shouldMute: boolean;
  shouldTerminate: boolean;
  action?: SafetyAction;
}> {
  const { sessionId, callId, userId, transcriptSegment, timestamp } = params;

  // Get session
  const sessionDoc = await db.collection('voice_analysis_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error('Voice analysis session not found');
  }

  const session = sessionDoc.data() as VoiceAnalysisSession;
  const participantIds = session.participants.map(p => p.userId);

  // Evaluate safety
  const result = await evaluateVoiceSafety({
    userId,
    transcriptSegment,
    callId,
    participantIds,
  });

  if (result.violationDetected) {
    // Add to active violations
    const activeViolations = session.activeViolations || [];
    activeViolations.push({
      userId,
      violationType: ViolationType.TARGETED_HARASSMENT, // Default, should be determined by evaluation
      detectedAt: serverTimestamp() as Timestamp,
      resolved: false,
    });

    // Update session
    const escalationLevel = calculateEscalationLevel(activeViolations.length);
    
    await db.collection('voice_analysis_sessions').doc(sessionId).update({
      activeViolations,
      escalationLevel,
      humanModeratorRequested: escalationLevel >= 2,
    });

    // Create redacted transcript entry
    await createRedactedTranscript({
      callId,
      participantIds,
      violationType: ViolationType.TARGETED_HARASSMENT,
      severity: result.severity || ViolationSeverity.MEDIUM,
      timestamp,
      snippet: transcriptSegment.substring(0, 50),
    });

    // Mute user if needed
    if (result.shouldMute) {
      await muteParticipant({
        sessionId,
        callId,
        userId,
        duration: 60, // 60 seconds
        reason: 'Safety violation detected',
      });
    }

    // Terminate call if critical
    if (result.shouldTerminate) {
      await terminateCall({
        sessionId,
        callId,
        reason: 'Critical safety violation',
      });
    }
  }

  return result;
}

/**
 * Mute participant in call
 */
async function muteParticipant(params: {
  sessionId: string;
  callId: string;
  userId: string;
  duration: number;
  reason: string;
}): Promise<void> {
  const { sessionId, userId } = params;

  // Update session participant status
  const sessionDoc = await db.collection('voice_analysis_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) return;

  const session = sessionDoc.data() as VoiceAnalysisSession;
  const participants = session.participants.map(p => {
    if (p.userId === userId) {
      return { ...p, currentlyMuted: true };
    }
    return p;
  });

  await db.collection('voice_analysis_sessions').doc(sessionId).update({
    participants,
  });

  // Note: Actual muting would be handled by the call infrastructure (WebRTC, etc.)
  console.log(`Muted user ${userId} in call ${params.callId} for ${params.duration} seconds`);
}

/**
 * Terminate call
 */
async function terminateCall(params: {
  sessionId: string;
  callId: string;
  reason: string;
}): Promise<void> {
  const { sessionId, reason } = params;

  await db.collection('voice_analysis_sessions').doc(sessionId).update({
    active: false,
    autoTerminationTriggered: true,
    terminationReason: reason,
    endedAt: serverTimestamp(),
  });

  // Note: Actual call termination would be handled by the call infrastructure
  console.log(`Terminated call ${params.callId}: ${reason}`);
}

/**
 * Create redacted transcript entry
 */
async function createRedactedTranscript(params: {
  callId: string;
  participantIds: string[];
  violationType: ViolationType;
  severity: ViolationSeverity;
  timestamp: number;
  snippet: string;
}): Promise<void> {
  const transcriptId = generateId();

  // Get existing transcript or create new
  const existingSnapshot = await db
    .collection('voice_transcripts_redacted')
    .where('callId', '==', params.callId)
    .limit(1)
    .get();

  if (existingSnapshot.empty) {
    // Create new transcript
    const transcript: Partial<VoiceTranscriptRedacted> = {
      transcriptId,
      callId: params.callId,
      participantIds: params.participantIds,
      violationsDetected: [
        {
          timestamp: params.timestamp,
          violationType: params.violationType,
          severity: params.severity,
          confidence: 85,
          snippet: params.snippet,
        },
      ],
      muteActions: [],
      callTerminated: false,
      createdAt: serverTimestamp() as Timestamp,
    };

    await db.collection('voice_transcripts_redacted').doc(transcriptId).set(transcript);
  } else {
    // Update existing transcript
    const doc = existingSnapshot.docs[0];
    const existing = doc.data() as VoiceTranscriptRedacted;

    await db.collection('voice_transcripts_redacted').doc(doc.id).update({
      violationsDetected: [
        ...existing.violationsDetected,
        {
          timestamp: params.timestamp,
          violationType: params.violationType,
          severity: params.severity,
          confidence: 85,
          snippet: params.snippet,
        },
      ],
    });
  }
}

/**
 * End voice analysis session
 */
export async function endVoiceAnalysisSession(sessionId: string): Promise<void> {
  await db.collection('voice_analysis_sessions').doc(sessionId).update({
    active: false,
    endedAt: serverTimestamp(),
  });
}

/**
 * Calculate escalation level
 */
function calculateEscalationLevel(violationCount: number): 0 | 1 | 2 | 3 {
  if (violationCount >= 5) return 3;
  if (violationCount >= 3) return 2;
  if (violationCount >= 1) return 1;
  return 0;
}

// ============================================================================
// LIVESTREAM CHAT MODERATION
// ============================================================================

/**
 * Start livestream moderation session
 */
export async function startLivestreamModeration(params: {
  streamId: string;
  creatorId: string;
  moderatorIds?: string[];
}): Promise<string> {
  const sessionId = generateId();

  const session: Partial<LivestreamModerationSession> = {
    sessionId,
    streamId: params.streamId,
    creatorId: params.creatorId,
    active: true,
    autoModeration: true,
    humanModeratorPresent: false,
    moderatorIds: params.moderatorIds || [],
    messagesAnalyzed: 0,
    messagesBlocked: 0,
    usersWarned: [],
    usersBanned: [],
    overallSentiment: 0,
    toxicityLevel: 0,
    flaggedPatterns: [],
    humanReviewRequired: false,
    startedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('livestream_moderation_sessions').doc(sessionId).set(session);

  return sessionId;
}

/**
 * Moderate livestream chat message
 */
export async function moderateLivestreamMessage(params: {
  sessionId: string;
  streamId: string;
  userId: string;
  message: string;
  messageId: string;
}): Promise<{
  allowed: boolean;
  action: SafetyAction;
  reason?: string;
}> {
  const { sessionId, streamId, userId, message, messageId } = params;

  // Get session
  const sessionDoc = await db.collection('livestream_moderation_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    return { allowed: true, action: SafetyAction.EDUCATION_TIP };
  }

  const session = sessionDoc.data() as LivestreamModerationSession;

  // Classify message
  const classification = await classifyContent({
    content: message,
    contentType: ContentType.LIVESTREAM_CHAT,
    userId,
  });

  // Update stats
  const messagesAnalyzed = session.messagesAnalyzed + 1;
  let messagesBlocked = session.messagesBlocked;
  const usersWarned = session.usersWarned || [];
  const usersBanned = session.usersBanned || [];

  // Calculate sentiment
  const newSentiment = (session.overallSentiment * session.messagesAnalyzed + classification.sentiment.score) / messagesAnalyzed;
  
  // Calculate toxicity
  const newToxicity = Math.max(session.toxicityLevel, classification.toxicity.score);

  let allowed = true;
  let action = SafetyAction.EDUCATION_TIP;
  let reason: string | undefined;

  // Check violations
  if (classification.shouldBlock) {
    allowed = false;
    messagesBlocked++;
    action = SafetyAction.MESSAGE_BLOCKED;
    reason = 'Message violates community guidelines';

    // Log incident
    if (classification.violations.length > 0) {
      await logSafetyIncident({
        userId,
        violationType: classification.violations[0].type,
        severity: classification.violations[0].severity,
        contentType: ContentType.LIVESTREAM_CHAT,
        contentId: messageId,
        contentSnippet: message.substring(0, 200),
        detectionMethod: 'ML_CLASSIFIER',
        confidence: classification.violations[0].confidence,
        actionTaken: action,
        eventId: streamId,
      });

      // Ban user if critical violation
      if (classification.violations[0].severity === ViolationSeverity.CRITICAL) {
        if (!usersBanned.includes(userId)) {
          usersBanned.push(userId);
        }
        action = SafetyAction.FEATURE_BAN;
      }
    }
  } else if (classification.shouldWarn) {
    if (!usersWarned.includes(userId)) {
      usersWarned.push(userId);
    }
    action = SafetyAction.WARNING;
  }

  // Update session
  await db.collection('livestream_moderation_sessions').doc(sessionId).update({
    messagesAnalyzed,
    messagesBlocked,
    usersWarned,
    usersBanned,
    overallSentiment: newSentiment,
    toxicityLevel: newToxicity,
    humanReviewRequired: newToxicity > 80 || usersBanned.length > 5,
  });

  return { allowed, action, reason };
}

/**
 * Add human moderator to livestream
 */
export async function addLivestreamModerator(params: {
  sessionId: string;
  moderatorId: string;
}): Promise<void> {
  const { sessionId, moderatorId } = params;

  const sessionDoc = await db.collection('livestream_moderation_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) return;

  const session = sessionDoc.data() as LivestreamModerationSession;
  const moderatorIds = session.moderatorIds || [];

  if (!moderatorIds.includes(moderatorId)) {
    moderatorIds.push(moderatorId);
  }

  await db.collection('livestream_moderation_sessions').doc(sessionId).update({
    moderatorIds,
    humanModeratorPresent: true,
    moderatorJoinedAt: serverTimestamp(),
  });
}

/**
 * Ban user from livestream
 */
export async function banUserFromLivestream(params: {
  sessionId: string;
  streamId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  const { sessionId, userId } = params;

  const sessionDoc = await db.collection('livestream_moderation_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) return;

  const session = sessionDoc.data() as LivestreamModerationSession;
  const usersBanned = session.usersBanned || [];

  if (!usersBanned.includes(userId)) {
    usersBanned.push(userId);
  }

  await db.collection('livestream_moderation_sessions').doc(sessionId).update({
    usersBanned,
  });
}

/**
 * Get livestream moderation stats
 */
export async function getLivestreamModerationStats(sessionId: string): Promise<{
  messagesAnalyzed: number;
  messagesBlocked: number;
  usersWarned: number;
  usersBanned: number;
  overallSentiment: number;
  toxicityLevel: number;
  humanReviewRequired: boolean;
}> {
  const sessionDoc = await db.collection('livestream_moderation_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error('Moderation session not found');
  }

  const session = sessionDoc.data() as LivestreamModerationSession;

  return {
    messagesAnalyzed: session.messagesAnalyzed,
    messagesBlocked: session.messagesBlocked,
    usersWarned: session.usersWarned.length,
    usersBanned: session.usersBanned.length,
    overallSentiment: session.overallSentiment,
    toxicityLevel: session.toxicityLevel,
    humanReviewRequired: session.humanReviewRequired,
  };
}

/**
 * End livestream moderation session
 */
export async function endLivestreamModeration(sessionId: string): Promise<void> {
  await db.collection('livestream_moderation_sessions').doc(sessionId).update({
    active: false,
    endedAt: serverTimestamp(),
  });
}

// ============================================================================
// EVENT CHAT MONITORING
// ============================================================================

/**
 * Monitor event chat message
 */
export async function monitorEventChatMessage(params: {
  eventId: string;
  userId: string;
  message: string;
  messageId: string;
}): Promise<{
  allowed: boolean;
  action: SafetyAction;
  reason?: string;
}> {
  const { eventId, userId, message, messageId } = params;

  // Classify message
  const classification = await classifyContent({
    content: message,
    contentType: ContentType.EVENT_CHAT,
    userId,
  });

  let allowed = true;
  let action = SafetyAction.EDUCATION_TIP;
  let reason: string | undefined;

  if (classification.shouldBlock) {
    allowed = false;
    action = SafetyAction.MESSAGE_BLOCKED;
    reason = 'Message violates community guidelines';

    if (classification.violations.length > 0) {
      await logSafetyIncident({
        userId,
        violationType: classification.violations[0].type,
        severity: classification.violations[0].severity,
        contentType: ContentType.EVENT_CHAT,
        contentId: messageId,
        contentSnippet: message.substring(0, 200),
        detectionMethod: 'ML_CLASSIFIER',
        confidence: classification.violations[0].confidence,
        actionTaken: action,
        eventId,
      });
    }
  } else if (classification.shouldWarn) {
    action = SafetyAction.WARNING;
  }

  return { allowed, action, reason };
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect coordinated harassment across multiple users
 */
export async function detectCoordinatedHarassment(params: {
  targetUserId: string;
  timeWindowMinutes: number;
}): Promise<{
  detected: boolean;
  harasserIds: string[];
  incidentCount: number;
}> {
  const { targetUserId, timeWindowMinutes } = params;

  const timeWindowStart = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  // Get recent incidents targeting this user
  const incidentsSnapshot = await db
    .collection('safety_incidents')
    .where('targetUserId', '==', targetUserId)
    .where('createdAt', '>=', Timestamp.fromDate(timeWindowStart))
    .get();

  if (incidentsSnapshot.size < 3) {
    return { detected: false, harasserIds: [], incidentCount: 0 };
  }

  const harasserIds = new Set<string>();
  incidentsSnapshot.docs.forEach(doc => {
    const incident = doc.data();
    harasserIds.add(incident.userId);
  });

  // Coordinated if 3+ different users targeting same person in time window
  const detected = harasserIds.size >= 3;

  return {
    detected,
    harasserIds: Array.from(harasserIds),
    incidentCount: incidentsSnapshot.size,
  };
}

/**
 * Detect spam/flooding
 */
export async function detectSpamFlooding(params: {
  userId: string;
  timeWindowSeconds: number;
  messageThreshold: number;
}): Promise<{
  detected: boolean;
  messageCount: number;
}> {
  const { userId, timeWindowSeconds, messageThreshold } = params;

  const timeWindowStart = new Date(Date.now() - timeWindowSeconds * 1000);

  // Count recent messages from user
  const messagesSnapshot = await db
    .collection('blocked_messages')
    .where('userId', '==', userId)
    .where('blockedAt', '>=', Timestamp.fromDate(timeWindowStart))
    .get();

  const messageCount = messagesSnapshot.size;
  const detected = messageCount >= messageThreshold;

  return { detected, messageCount };
}

// ============================================================================
// EXPORT
// ============================================================================

export const realtimeMonitoring = {
  // Voice/Video
  startVoiceAnalysisSession,
  processVoiceTranscript,
  endVoiceAnalysisSession,

  // Livestream
  startLivestreamModeration,
  moderateLivestreamMessage,
  addLivestreamModerator,
  banUserFromLivestream,
  getLivestreamModerationStats,
  endLivestreamModeration,

  // Event chat
  monitorEventChatMessage,

  // Pattern detection
  detectCoordinatedHarassment,
  detectSpamFlooding,
};