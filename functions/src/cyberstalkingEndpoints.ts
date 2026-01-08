/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Cloud Functions Endpoints
 * 
 * Main API endpoints for cyberstalking protection system.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { detectStalkingBehavior, checkStalkingRestrictions } from './cyberstalkingDetection';
import { analyzeObsessionPatterns } from './obsessionDetection';
import {
  blockLocationRequest,
  validateLocationShare,
  canAccessLocation,
  validateEventCheckIn,
  needsLocationEducation,
  markEducationShown,
} from './locationSafety';
import {
  detectInvasiveMediaRequest,
  validateMediaShare,
  needsMediaEducation,
  provideMediaSafetyEducation,
  getEducationalContent,
} from './mediaSafetyBlocking';
import {
  reportStalking,
  reportObsession,
  reportLocationHarassment,
  requestImmediateProtection,
  getLegalResources,
  getMyHelpRequests,
  resolveStalkingCase,
} from './cyberstalkingReporting';

const db = admin.firestore();

// ============================================================================
// DETECTION & MONITORING
// ============================================================================

/**
 * Analyze message for stalking behavior (called by chat system)
 */
export const pack175_analyzeMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { senderId, recipientId, messageContent, conversationId } = data;
  
  if (!senderId || !recipientId || !messageContent) {
    throw new functions.https.HttpsError('invalid-argument', 'Required fields missing');
  }
  
  try {
    // Detect stalking behaviors
    const behaviors = await detectStalkingBehavior(
      senderId,
      recipientId,
      messageContent,
      conversationId
    );
    
    // Detect invasive media requests
    const mediaCheck = await detectInvasiveMediaRequest(
      senderId,
      recipientId,
      messageContent
    );
    
    // Check if sender has active restrictions
    const restrictions = await checkStalkingRestrictions(senderId);
    
    return {
      success: true,
      behaviorsDetected: behaviors.length,
      mediaRequestBlocked: mediaCheck.shouldBlock,
      isRestricted: restrictions.isRestricted,
      restrictions: restrictions.restrictions,
      educationRequired: mediaCheck.educationRequired,
    };
  } catch (error: any) {
    console.error('[Pack175] Error analyzing message:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Analyze obsession patterns for user pair
 */
export const pack175_analyzeObsessionPatterns = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { observedUserId, targetUserId } = data;
  
  if (!observedUserId || !targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Both user IDs required');
  }
  
  try {
    const patterns = await analyzeObsessionPatterns(observedUserId, targetUserId);
    
    return {
      success: true,
      patternsDetected: patterns.length,
      patterns: patterns.map(p => ({
        type: p.patternType,
        riskLevel: p.riskLevel,
        mitigationApplied: p.mitigationApplied,
      })),
    };
  } catch (error: any) {
    console.error('[Pack175] Error analyzing patterns:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// LOCATION SAFETY
// ============================================================================

/**
 * Validate location sharing request
 */
export const pack175_validateLocationShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { partnerId, sessionId } = data;
  
  if (!partnerId) {
    throw new functions.https.HttpsError('invalid-argument', 'partnerId is required');
  }
  
  try {
    const validation = await validateLocationShare(userId, partnerId, sessionId);
    
    return {
      success: validation.allowed,
      reason: validation.reason,
    };
  } catch (error: any) {
    console.error('[Pack175] Error validating location share:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check if user can access location
 */
export const pack175_canAccessLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const requesterId = context.auth.uid;
  const { targetUserId } = data;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUserId is required');
  }
  
  try {
    const accessCheck = await canAccessLocation(requesterId, targetUserId);
    
    return {
      success: true,
      ...accessCheck,
    };
  } catch (error: any) {
    console.error('[Pack175] Error checking location access:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Validate event check-in with safety delay
 */
export const pack175_validateEventCheckIn = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { eventId } = data;
  
  if (!eventId) {
    throw new functions.https.HttpsError('invalid-argument', 'eventId is required');
  }
  
  try {
    const validation = await validateEventCheckIn(eventId, userId);
    
    return {
      success: validation.canCheckIn,
      reason: validation.reason,
      waitMinutes: validation.waitMinutes,
    };
  } catch (error: any) {
    console.error('[Pack175] Error validating check-in:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// MEDIA SAFETY
// ============================================================================

/**
 * Validate media share (photos, videos, etc.)
 */
export const pack175_validateMediaShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const senderId = context.auth.uid;
  const { recipientId, mediaType, context: shareContext } = data;
  
  if (!recipientId || !mediaType) {
    throw new functions.https.HttpsError('invalid-argument', 'recipientId and mediaType required');
  }
  
  try {
    const validation = await validateMediaShare(
      senderId,
      recipientId,
      mediaType,
      shareContext
    );
    
    return {
      success: validation.allowed,
      reason: validation.reason,
      requiresConsent: validation.requiresConsent,
    };
  } catch (error: any) {
    console.error('[Pack175] Error validating media share:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get education status for user
 */
export const pack175_getEducationStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const locationEducation = await needsLocationEducation(userId);
    const mediaEducation = await needsMediaEducation(userId);
    
    return {
      success: true,
      needsLocationEducation: locationEducation.needsEducation,
      locationViolationType: locationEducation.violationType,
      needsMediaEducation: mediaEducation.needsEducation,
      mediaRequestTypes: mediaEducation.requestTypes,
    };
  } catch (error: any) {
    console.error('[Pack175] Error getting education status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Mark education as completed
 */
export const pack175_markEducationComplete = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { educationType, violationType } = data;
  
  try {
    if (educationType === 'LOCATION') {
      await markEducationShown(userId, violationType);
    } else if (educationType === 'MEDIA') {
      await provideMediaSafetyEducation(userId, violationType);
    }
    
    return {
      success: true,
      message: 'Education marked as complete',
    };
  } catch (error: any) {
    console.error('[Pack175] Error marking education:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get educational content for display
 */
export const pack175_getEducationalContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { requestType } = data;
  
  try {
    const content = getEducationalContent(requestType);
    
    return {
      success: true,
      content,
    };
  } catch (error: any) {
    console.error('[Pack175] Error getting educational content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// REPORTING & HELP
// ============================================================================

// Re-export reporting functions
export const pack175_reportStalking = reportStalking;
export const pack175_reportObsession = reportObsession;
export const pack175_reportLocationHarassment = reportLocationHarassment;
export const pack175_requestImmediateProtection = requestImmediateProtection;
export const pack175_getLegalResources = getLegalResources;
export const pack175_getMyHelpRequests = getMyHelpRequests;
export const pack175_resolveStalkingCase = resolveStalkingCase;

// ============================================================================
// ADMIN & MODERATION
// ============================================================================

/**
 * Get stalking cases for moderation (admin only)
 */
export const pack175_admin_getStalkingCases = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { status, severity, limit } = data;
  
  try {
    let query = db.collection('stalking_cases') as any;
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (severity) {
      query = query.where('severity', '==', severity);
    }
    
    query = query.orderBy('lastActivityAt', 'desc').limit(limit || 50);
    
    const casesSnapshot = await query.get();
    const cases = casesSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return {
      success: true,
      cases,
      total: cases.length,
    };
  } catch (error: any) {
    console.error('[Pack175] Error getting cases:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get analytics for cyberstalking system
 */
export const pack175_admin_getAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { period } = data;
  
  try {
    const cutoffDate = admin.firestore.Timestamp.fromMillis(
      Date.now() - (period === 'WEEKLY' ? 7 : period === 'MONTHLY' ? 30 : 1) * 24 * 60 * 60 * 1000
    );
    
    // Get counts
    const [
      casesSnapshot,
      behaviorsSnapshot,
      violationsSnapshot,
      mitigationsSnapshot,
    ] = await Promise.all([
      db.collection('stalking_cases').where('firstDetectedAt', '>=', cutoffDate).get(),
      db.collection('stalking_behaviors').where('detectedAt', '>=', cutoffDate).get(),
      db.collection('location_safety_violations').where('detectedAt', '>=', cutoffDate).get(),
      db.collection('stalking_mitigations').where('appliedAt', '>=', cutoffDate).get(),
    ]);
    
    const cases = casesSnapshot.docs.map(doc => doc.data());
    const behaviors = behaviorsSnapshot.docs.map(doc => doc.data());
    const mitigations = mitigationsSnapshot.docs.map(doc => doc.data());
    
    return {
      success: true,
      analytics: {
        totalCasesDetected: cases.length,
        activeCases: cases.filter((c: any) => c.status === 'ACTIVE').length,
        resolvedCases: cases.filter((c: any) => c.status === 'RESOLVED').length,
        bannedUsers: mitigations.filter((m: any) => m.actionType === 'PERMANENT_BAN').length,
        totalBehaviors: behaviors.length,
        totalViolations: violationsSnapshot.size,
        totalMitigations: mitigations.length,
      },
    };
  } catch (error: any) {
    console.error('[Pack175] Error getting analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 175 — Cyberstalking & Location Safety Defender initialized');