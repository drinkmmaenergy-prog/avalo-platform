/**
 * PACK 153 — Cloud Functions Endpoints
 * 
 * Callable functions for safety system
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import {
  evaluateMessageSafety,
  getSafetyStatus,
  submitSafetyAppeal,
  reviewSafetyAppeal,
} from './pack153-safety-system';
import { ContentType } from './types/safety.types';
import {
  startVoiceAnalysisSession,
  processVoiceTranscript,
  endVoiceAnalysisSession,
  startLivestreamModeration,
  moderateLivestreamMessage,
  getLivestreamModerationStats,
  endLivestreamModeration,
  monitorEventChatMessage,
  detectCoordinatedHarassment,
} from './pack153-realtime-monitoring';

// ============================================================================
// USER FUNCTIONS
// ============================================================================

/**
 * Evaluate message safety before sending
 */
export const pack153_evaluateMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { content, contentType, targetUserId, conversationId, contextId } = data;

  if (!content) {
    throw new functions.https.HttpsError('invalid-argument', 'Content is required');
  }

  try {
    const result = await evaluateMessageSafety({
      userId: context.auth.uid,
      content,
      contentType: contentType || ContentType.TEXT_MESSAGE,
      targetUserId,
      conversationId,
      contextId,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error evaluating message:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's safety status
 */
export const pack153_getSafetyStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const status = await getSafetyStatus(context.auth.uid);
    return { success: true, data: status };
  } catch (error: any) {
    console.error('Error getting safety status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit appeal for safety decision
 */
export const pack153_submitAppeal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { incidentId, reason, evidence } = data;

  if (!incidentId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Incident ID and reason are required');
  }

  try {
    const appealId = await submitSafetyAppeal({
      userId: context.auth.uid,
      incidentId,
      reason,
      evidence,
    });

    return { success: true, data: { appealId } };
  } catch (error: any) {
    console.error('Error submitting appeal:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's safety incidents
 */
export const pack153_getMyIncidents = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 50 } = data;

  try {
    const snapshot = await db
      .collection('safety_incidents')
      .where('userId', '==', context.auth.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const incidents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, data: incidents };
  } catch (error: any) {
    console.error('Error getting incidents:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's blocked messages
 */
export const pack153_getBlockedMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 20 } = data;

  try {
    const snapshot = await db
      .collection('blocked_messages')
      .where('userId', '==', context.auth.uid)
      .orderBy('blockedAt', 'desc')
      .limit(limit)
      .get();

    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, data: messages };
  } catch (error: any) {
    console.error('Error getting blocked messages:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get safety education tip
 */
export const pack153_getEducationTip = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { violationType } = data;

  try {
    const snapshot = await db
      .collection('safety_education_tips')
      .where('violationType', '==', violationType)
      .where('active', '==', true)
      .orderBy('priority', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { success: true, data: null };
    }

    return { success: true, data: snapshot.docs[0].data() };
  } catch (error: any) {
    console.error('Error getting education tip:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// VOICE/VIDEO CALL FUNCTIONS
// ============================================================================

/**
 * Start voice analysis session
 */
export const pack153_startVoiceAnalysis = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { callId, participantIds } = data;

  if (!callId || !participantIds) {
    throw new functions.https.HttpsError('invalid-argument', 'Call ID and participant IDs are required');
  }

  try {
    const sessionId = await startVoiceAnalysisSession({
      callId,
      participantIds,
    });

    return { success: true, data: { sessionId } };
  } catch (error: any) {
    console.error('Error starting voice analysis:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Process voice transcript
 */
export const pack153_processVoiceTranscript = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, callId, transcriptSegment, timestamp } = data;

  if (!sessionId || !callId || !transcriptSegment) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID, call ID, and transcript segment are required');
  }

  try {
    const result = await processVoiceTranscript({
      sessionId,
      callId,
      userId: context.auth.uid,
      transcriptSegment,
      timestamp: timestamp || 0,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error processing voice transcript:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End voice analysis session
 */
export const pack153_endVoiceAnalysis = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID is required');
  }

  try {
    await endVoiceAnalysisSession(sessionId);
    return { success: true };
  } catch (error: any) {
    console.error('Error ending voice analysis:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// LIVESTREAM FUNCTIONS
// ============================================================================

/**
 * Start livestream moderation
 */
export const pack153_startLivestreamModeration = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { streamId, moderatorIds } = data;

  if (!streamId) {
    throw new functions.https.HttpsError('invalid-argument', 'Stream ID is required');
  }

  try {
    const sessionId = await startLivestreamModeration({
      streamId,
      creatorId: context.auth.uid,
      moderatorIds,
    });

    return { success: true, data: { sessionId } };
  } catch (error: any) {
    console.error('Error starting livestream moderation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Moderate livestream message
 */
export const pack153_moderateLivestreamMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, streamId, message, messageId } = data;

  if (!sessionId || !streamId || !message || !messageId) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID, stream ID, message, and message ID are required');
  }

  try {
    const result = await moderateLivestreamMessage({
      sessionId,
      streamId,
      userId: context.auth.uid,
      message,
      messageId,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error moderating livestream message:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get livestream moderation stats
 */
export const pack153_getLivestreamStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID is required');
  }

  try {
    const stats = await getLivestreamModerationStats(sessionId);
    return { success: true, data: stats };
  } catch (error: any) {
    console.error('Error getting livestream stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End livestream moderation
 */
export const pack153_endLivestreamModeration = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID is required');
  }

  try {
    await endLivestreamModeration(sessionId);
    return { success: true };
  } catch (error: any) {
    console.error('Error ending livestream moderation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// EVENT FUNCTIONS
// ============================================================================

/**
 * Monitor event chat message
 */
export const pack153_monitorEventMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { eventId, message, messageId } = data;

  if (!eventId || !message || !messageId) {
    throw new functions.https.HttpsError('invalid-argument', 'Event ID, message, and message ID are required');
  }

  try {
    const result = await monitorEventChatMessage({
      eventId,
      userId: context.auth.uid,
      message,
      messageId,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error monitoring event message:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Check if user is admin
 */
async function isAdmin(uid: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return false;
  const userData = userDoc.data();
  return userData?.role === 'admin' || userData?.role === 'moderator';
}

/**
 * Review safety appeal (admin only)
 */
export const pack153_admin_reviewAppeal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { appealId, approved, reviewerNotes } = data;

  if (!appealId || approved === undefined || !reviewerNotes) {
    throw new functions.https.HttpsError('invalid-argument', 'Appeal ID, approval status, and reviewer notes are required');
  }

  try {
    await reviewSafetyAppeal({
      appealId,
      reviewerId: context.auth.uid,
      approved,
      reviewerNotes,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error reviewing appeal:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get safety incidents for review (admin only)
 */
export const pack153_admin_getIncidents = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { limit = 100, reviewed = false } = data;

  try {
    const snapshot = await db
      .collection('safety_incidents')
      .where('reviewed', '==', reviewed)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const incidents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, data: incidents };
  } catch (error: any) {
    console.error('Error getting incidents:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get pending appeals (admin only)
 */
export const pack153_admin_getPendingAppeals = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { limit = 50 } = data;

  try {
    const snapshot = await db
      .collection('safety_appeals')
      .where('status', '==', 'PENDING')
      .orderBy('submittedAt', 'desc')
      .limit(limit)
      .get();

    const appeals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, data: appeals };
  } catch (error: any) {
    console.error('Error getting pending appeals:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Detect coordinated harassment (admin only)
 */
export const pack153_admin_detectCoordinatedHarassment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { targetUserId, timeWindowMinutes = 60 } = data;

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Target user ID is required');
  }

  try {
    const result = await detectCoordinatedHarassment({
      targetUserId,
      timeWindowMinutes,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error detecting coordinated harassment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get safety statistics (admin only)
 */
export const pack153_admin_getStatistics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get incident count
    const incidentsSnapshot = await db
      .collection('safety_incidents')
      .where('createdAt', '>=', last30Days)
      .get();

    // Get appeal count
    const appealsSnapshot = await db
      .collection('safety_appeals')
      .where('submittedAt', '>=', last30Days)
      .get();

    // Get blocked message count
    const blockedSnapshot = await db
      .collection('blocked_messages')
      .where('blockedAt', '>=', last30Days)
      .get();

    const statistics = {
      last30Days: {
        incidents: incidentsSnapshot.size,
        appeals: appealsSnapshot.size,
        blockedMessages: blockedSnapshot.size,
      },
    };

    return { success: true, data: statistics };
  } catch (error: any) {
    console.error('Error getting statistics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});