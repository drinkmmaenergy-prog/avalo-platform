/**
 * PACK 130 — Long-Term Patrol AI
 * Cloud Functions Endpoints
 * 
 * Public-facing API for the Patrol AI system
 */

import * as functions from 'firebase-functions';
import { patrolLogEvent, detectBehaviorPatterns, cleanupExpiredLogs } from './pack130-patrol-engine';
import { 
  checkForBanEvasion,
  recordDeviceFingerprint,
  getBanEvasionRecords,
  resolveBanEvasionCase,
} from './pack130-ban-evasion-hunter';
import {
  evaluateRiskProfile,
  getRiskProfile,
  executeRiskProfileActions,
  getUsersByRiskLevel,
} from './pack130-risk-profile';
import {
  recordModerationFeedback,
  getCurrentConfidence,
  getAllConfidenceRules,
  getFeedbackStatistics,
} from './pack130-self-learning';
import {
  createPatrolCase,
  freezeConversation,
  unfreezeConversation,
  getCasesByPriority,
  assignCase,
  resolveCase,
  escalateCase,
  getCaseStatistics,
} from './pack130-case-prioritization';
import { PatrolLogEventInput, PatrolEventType, RiskProfileLevel, CasePriority } from './types/pack130-types';

// ============================================================================
// BEHAVIOR LOGGING
// ============================================================================

/**
 * Log a patrol event
 */
export const pack130_patrolLogEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const input: PatrolLogEventInput = {
    userId: data.userId,
    eventType: data.eventType as PatrolEventType,
    metadata: data.metadata,
    counterpartId: data.counterpartId,
    importance: data.importance,
  };
  
  const logId = await patrolLogEvent(input);
  
  return { success: true, logId };
});

/**
 * Get behavior patterns for a user
 */
export const pack130_getBehaviorPatterns = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  const lookbackMonths = data.lookbackMonths || 12;
  
  // Admin or self only
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin && userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot view other users behavior');
  }
  
  const patterns = await detectBehaviorPatterns(userId, lookbackMonths);
  
  return { patterns };
});

// ============================================================================
// RISK PROFILE
// ============================================================================

/**
 * Evaluate user's risk profile
 */
export const pack130_evaluateRiskProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = data.userId;
  
  // Admin only
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const result = await evaluateRiskProfile({
    userId,
    includeHistory: data.includeHistory,
  });
  
  // Execute automated actions if needed
  const profile = await getRiskProfile(userId);
  if (profile) {
    await executeRiskProfileActions(userId, profile);
  }
  
  return result;
});

/**
 * Get user's risk profile (limited info for user, full for admin)
 */
export const pack130_getRiskProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  const isAdmin = await checkIsAdmin(context.auth.uid);
  
  // Users can only see their own limited profile
  if (!isAdmin && userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot view other users profile');
  }
  
  const profile = await getRiskProfile(userId);
  
  if (!profile) {
    return { riskLevel: 'RISK_NONE', riskScore: 0 };
  }
  
  // Return limited info for users
  if (!isAdmin) {
    return {
      riskLevel: profile.riskLevel,
      riskScore: profile.riskScore,
    };
  }
  
  // Full profile for admins
  return profile;
});

/**
 * Get users by risk level (admin only)
 */
export const pack130_getUsersByRiskLevel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const riskLevel: RiskProfileLevel = data.riskLevel;
  const limit = data.limit || 100;
  
  const users = await getUsersByRiskLevel(riskLevel, limit);
  
  return { users };
});

// ============================================================================
// BAN EVASION
// ============================================================================

/**
 * Record device fingerprint
 */
export const pack130_recordDeviceFingerprint = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  await recordDeviceFingerprint(context.auth.uid, data.deviceData);
  
  // Automatically check for ban evasion
  const evasionRecord = await checkForBanEvasion(context.auth.uid, data.deviceData.deviceId);
  
  return { 
    success: true,
    evasionDetected: evasionRecord !== null,
  };
});

/**
 * Check for ban evasion (admin only)
 */
export const pack130_checkBanEvasion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const { userId, deviceId } = data;
  
  const evasionRecord = await checkForBanEvasion(userId, deviceId);
  
  return { evasionRecord };
});

/**
 * Get ban evasion records (admin only)
 */
export const pack130_getBanEvasionRecords = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const records = await getBanEvasionRecords(data.userId);
  
  return { records };
});

/**
 * Resolve ban evasion case (admin only)
 */
export const pack130_resolveBanEvasionCase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  await resolveBanEvasionCase(data.recordId, data.confirmed, data.moderatorNotes);
  
  return { success: true };
});

// ============================================================================
// SELF-LEARNING
// ============================================================================

/**
 * Record moderation feedback (moderator only)
 */
export const pack130_recordModerationFeedback = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  const feedbackId = await recordModerationFeedback(
    data.caseId,
    data.flaggedViolation,
    data.confirmed,
    context.auth.uid,
    data.moderatorNotes
  );
  
  return { success: true, feedbackId };
});

/**
 * Get AI confidence rules (admin only)
 */
export const pack130_getConfidenceRules = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const rules = await getAllConfidenceRules();
  
  return { rules };
});

/**
 * Get feedback statistics (admin only)
 */
export const pack130_getFeedbackStatistics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const stats = await getFeedbackStatistics(data.daysBack || 30);
  
  return stats;
});

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

/**
 * Create patrol case (admin/moderator only)
 */
export const pack130_createPatrolCase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  const caseId = await createPatrolCase({
    subjectUserId: data.subjectUserId,
    category: data.category,
    detectionSignals: data.detectionSignals,
    reportedBy: context.auth.uid,
    behaviorLogIds: data.behaviorLogIds || [],
  });
  
  return { success: true, caseId };
});

/**
 * Get cases by priority (moderator only)
 */
export const pack130_getCasesByPriority = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  const cases = await getCasesByPriority(data.priority as CasePriority, data.limit);
  
  return { cases };
});

/**
 * Assign case (moderator only)
 */
export const pack130_assignCase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  await assignCase(data.caseId, context.auth.uid);
  
  return { success: true };
});

/**
 * Resolve case (moderator only)
 */
export const pack130_resolveCase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  await resolveCase(data.caseId, data.resolution, data.resolutionNotes);
  
  return { success: true };
});

/**
 * Freeze conversation (moderator only)
 */
export const pack130_freezeConversation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  await freezeConversation({
    conversationId: data.conversationId,
    reason: data.reason,
    caseId: data.caseId,
    participantIds: data.participantIds,
  });
  
  return { success: true };
});

/**
 * Unfreeze conversation (moderator only)
 */
export const pack130_unfreezeConversation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isModerator = await checkIsModerator(context.auth.uid);
  if (!isModerator) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator only');
  }
  
  await unfreezeConversation(data.conversationId);
  
  return { success: true };
});

/**
 * Get case statistics (admin only)
 */
export const pack130_getCaseStatistics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const isAdmin = await checkIsAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const stats = await getCaseStatistics(data.daysBack || 30);
  
  return stats;
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Cleanup expired logs (daily at 3 AM UTC)
 */
export const pack130_cleanupExpiredLogs = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const result = await cleanupExpiredLogs();
    console.log(`[Patrol AI] Cleaned up ${result.deletedCount} expired logs`);
    return null;
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function checkIsAdmin(userId: string): Promise<boolean> {
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.role === 'admin';
}

async function checkIsModerator(userId: string): Promise<boolean> {
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(userId).get();
  const role = userDoc.data()?.role;
  return role === 'admin' || role === 'moderator';
}