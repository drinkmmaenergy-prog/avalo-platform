/**
 * PACK 193 — REVISED v2 — Cloud Functions
 * Backend Logic for Permission-Driven Sexuality System
 * Moderation Logging, Consent Management, Safety Enforcement
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  SexualityConsentPreferences,
  SexyModeSession,
  SexyContent,
  ConsentAuditLog,
  ContentModerationFlag,
  SexyModeViolation,
  createConsentPreferences,
  createSexyModeSession,
  createAuditLog,
  createModerationFlag,
  createViolation,
  generateSessionId,
  hasMutualConsent,
  updateSessionConsent,
  downgradeConversationSafety,
  validateContentSafety,
  isSessionExpired,
  containsProhibitedContent,
  CONSENT_VERSION,
  DEFAULT_SESSION_EXPIRATION_HOURS
} from './pack193-sexuality-consent';

const db = admin.firestore();

// ============================================
// CONSENT MANAGEMENT FUNCTIONS
// ============================================

/**
 * Enable sexuality consent for user
 * Requires age verification
 */
export const enableSexualityConsent = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Check age verification
    const ageVerificationDoc = await db.collection('user_age_verification').doc(userId).get();
    
    if (!ageVerificationDoc.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Age verification required');
    }

    const ageVerification = ageVerificationDoc.data();
    if (!ageVerification?.isVerified18Plus || ageVerification.verificationStatus !== 'approved') {
      throw new functions.https.HttpsError('permission-denied', 'User must be verified as 18+');
    }

    // Create consent preferences
    const consentPreferences = createConsentPreferences(userId, CONSENT_VERSION);
    
    await db.collection('sexuality_consent_preferences').doc(userId).set(consentPreferences);

    // Log consent enablement
    const auditLog = createAuditLog(
      userId,
      'consent_enabled',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: false
      },
      {
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      message: 'Sexuality consent enabled successfully',
      consentVersion: CONSENT_VERSION
    };

  } catch (error: any) {
    console.error('Error enabling sexuality consent:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Disable sexuality consent for user
 * Can be done anytime
 */
export const disableSexualityConsent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Update consent preferences
    await db.collection('sexuality_consent_preferences').doc(userId).update({
      consentEnabled: false,
      isActive: false,
      disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // End all active sessions
    const activeSessions = await db.collection('sexy_mode_sessions')
      .where('isActive', '==', true)
      .where('user1Id', '==', userId)
      .get();

    const activeSessions2 = await db.collection('sexy_mode_sessions')
      .where('isActive', '==', true)
      .where('user2Id', '==', userId)
      .get();

    const batch = db.batch();
    
    [...activeSessions.docs, ...activeSessions2.docs].forEach(doc => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Downgrade conversation safety
      const session = doc.data() as SexyModeSession;
      const conversationId = session.sessionId;
      const conversationRef = db.collection('conversation_safety_mode').doc(conversationId);
      
      const safetyMode = downgradeConversationSafety(
        conversationId,
        session.user1Id,
        session.user2Id,
        userId
      );
      
      batch.set(conversationRef, safetyMode);
    });

    await batch.commit();

    // Log consent disablement
    const auditLog = createAuditLog(
      userId,
      'consent_disabled',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: false
      },
      {
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      message: 'Sexuality consent disabled. All conversations reverted to PG mode.',
      sessionsEnded: activeSessions.size + activeSessions2.size
    };

  } catch (error: any) {
    console.error('Error disabling sexuality consent:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// SESSION MANAGEMENT FUNCTIONS
// ============================================

/**
 * Initiate sexy mode session with another user
 * Requires both users to have consent enabled
 */
export const initiateSexyModeSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { otherUserId, expirationHours = DEFAULT_SESSION_EXPIRATION_HOURS } = data;
  const initiatorId = context.auth.uid;

  if (!otherUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'otherUserId is required');
  }

  try {
    // Check both users have consent enabled
    const [initiatorConsent, otherUserConsent] = await Promise.all([
      db.collection('sexuality_consent_preferences').doc(initiatorId).get(),
      db.collection('sexuality_consent_preferences').doc(otherUserId).get()
    ]);

    if (!initiatorConsent.exists || !initiatorConsent.data()?.consentEnabled) {
      throw new functions.https.HttpsError('failed-precondition', 'You must enable consent first');
    }

    if (!otherUserConsent.exists || !otherUserConsent.data()?.consentEnabled) {
      throw new functions.https.HttpsError('failed-precondition', 'Other user has not enabled consent');
    }

    // Check both users are age verified
    const [initiatorAge, otherUserAge] = await Promise.all([
      db.collection('user_age_verification').doc(initiatorId).get(),
      db.collection('user_age_verification').doc(otherUserId).get()
    ]);

    if (!initiatorAge.exists || !initiatorAge.data()?.isVerified18Plus) {
      throw new functions.https.HttpsError('permission-denied', 'You must be verified as 18+');
    }

    if (!otherUserAge.exists || !otherUserAge.data()?.isVerified18Plus) {
      throw new functions.https.HttpsError('permission-denied', 'Other user must be verified as 18+');
    }

    // Create or update session
    const sessionId = generateSessionId(initiatorId, otherUserId);
    const sessionRef = db.collection('sexy_mode_sessions').doc(sessionId);
    const existingSession = await sessionRef.get();

    let session: SexyModeSession;

    if (existingSession.exists) {
      // Update existing session
      const currentSession = existingSession.data() as SexyModeSession;
      const updates = updateSessionConsent(currentSession, initiatorId, true);
      
      await sessionRef.update(updates);
      session = { ...currentSession, ...updates } as SexyModeSession;
    } else {
      // Create new session
      session = createSexyModeSession(
        initiatorId,
        otherUserId,
        initiatorId,
        CONSENT_VERSION,
        expirationHours
      );
      
      await sessionRef.set(session);
    }

    // Log session initiation
    const auditLog = createAuditLog(
      initiatorId,
      'session_started',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: session.isActive
      },
      {
        sessionId,
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      sessionId,
      isActive: session.isActive,
      requiresMutualConsent: true,
      message: session.isActive 
        ? 'Sexy mode is now active with mutual consent'
        : 'Request sent. Waiting for other user to consent.'
    };

  } catch (error: any) {
    console.error('Error initiating sexy mode session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Accept or reject sexy mode session invitation
 */
export const respondToSexyModeInvitation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, accept } = data;
  const userId = context.auth.uid;

  if (!sessionId || typeof accept !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId and accept are required');
  }

  try {
    const sessionRef = db.collection('sexy_mode_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as SexyModeSession;

    // Verify user is part of session
    if (session.user1Id !== userId && session.user2Id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not part of this session');
    }

    // Update consent
    const updates = updateSessionConsent(session, userId, accept);
    await sessionRef.update(updates);

    // If rejecting, downgrade conversation
    if (!accept) {
      const safetyMode = downgradeConversationSafety(
        sessionId,
        session.user1Id,
        session.user2Id,
        userId
      );
      
      await db.collection('conversation_safety_mode').doc(sessionId).set(safetyMode);
    }

    // Log response
    const auditLog = createAuditLog(
      userId,
      accept ? 'session_started' : 'session_ended',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: accept && updates.isActive === true
      },
      {
        sessionId,
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      accepted: accept,
      isActive: updates.isActive,
      message: accept 
        ? 'Sexy mode is now active with mutual consent'
        : 'Invitation declined. Conversation remains PG.'
    };

  } catch (error: any) {
    console.error('Error responding to sexy mode invitation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End sexy mode session (either user can end)
 */
export const endSexyModeSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;
  const userId = context.auth.uid;

  try {
    const sessionRef = db.collection('sexy_mode_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as SexyModeSession;

    // Verify user is part of session
    if (session.user1Id !== userId && session.user2Id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not part of this session');
    }

    // End session
    await sessionRef.update({
      isActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Downgrade conversation safety
    const safetyMode = downgradeConversationSafety(
      sessionId,
      session.user1Id,
      session.user2Id,
      userId
    );
    
    await db.collection('conversation_safety_mode').doc(sessionId).set(safetyMode);

    // Log session end
    const auditLog = createAuditLog(
      userId,
      'session_ended',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: false
      },
      {
        sessionId,
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      message: 'Sexy mode ended. Conversation reverted to PG.'
    };

  } catch (error: any) {
    console.error('Error ending sexy mode session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// CONTENT MODERATION FUNCTIONS
// ============================================

/**
 * Validate and send sexy content
 * Triggered when user attempts to send sexy content
 */
export const sendSexyContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { receiverId, contentType, content, sessionId } = data;
  const senderId = context.auth.uid;

  try {
    // Validate session exists and is active
    const sessionDoc = await db.collection('sexy_mode_sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as SexyModeSession;

    // Check mutual consent
    if (!hasMutualConsent(session)) {
      throw new functions.https.HttpsError('permission-denied', 'Mutual consent required');
    }

    // Check session not expired
    if (isSessionExpired(session.expiresAt)) {
      throw new functions.https.HttpsError('failed-precondition', 'Session expired');
    }

    // Build content object
    const sexyContent: Partial<SexyContent> = {
      senderId,
      receiverId,
      sessionId,
      contentType,
      content,
      isPrivateOneOnOne: true,
      isPublicGroup: false,
      requiresAgeVerification: true
    };

    // Validate content safety
    const validation = validateContentSafety(sexyContent);
    
    if (!validation.isValid) {
      // Log violation
      const violation = createViolation(
        senderId,
        'prohibited_content',
        `Content validation failed: ${validation.errors.join(', ')}`,
        'major',
        { sessionId, contentId: '' }
      );
      
      await db.collection('sexy_mode_violations').add(violation);

      throw new functions.https.HttpsError('invalid-argument', validation.errors.join(', '));
    }

    // Create content document
    const contentRef = await db.collection('sexy_content').add({
      ...sexyContent,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log content sent
    const auditLog = createAuditLog(
      senderId,
      'content_sent',
      {
        ageVerified: true,
        consentVersion: CONSENT_VERSION,
        mutualConsent: true
      },
      {
        sessionId,
        contentId: contentRef.id,
        metadata: {
          ipAddress: context.rawRequest.ip,
          userAgent: context.rawRequest.headers['user-agent']
        }
      }
    );

    await db.collection('consent_audit_logs').add(auditLog);

    return {
      success: true,
      contentId: contentRef.id,
      message: 'Content sent successfully'
    };

  } catch (error: any) {
    console.error('Error sending sexy content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Report inappropriate sexy content
 */
export const reportSexyContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { contentId, reportType, description } = data;
  const reporterId = context.auth.uid;

  try {
    // Verify content exists and reporter has access
    const contentDoc = await db.collection('sexy_content').doc(contentId).get();
    
    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
    }

    const content = contentDoc.data() as SexyContent;

    // Verify reporter is the receiver
    if (content.receiverId !== reporterId) {
      throw new functions.https.HttpsError('permission-denied', 'Can only report content you received');
    }

    // Create report
    const report = {
      reporterId,
      reportedUserId: content.senderId,
      reportedContentId: contentId,
      reportType,
      description,
      isResolved: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('sexy_content_reports').add(report);

    // Create moderation flag
    const moderationFlag = createModerationFlag(
      contentId,
      content.senderId,
      'user_reported',
      reportType === 'minor_safety' ? 'critical' : 'high',
      description
    );

    await db.collection('content_moderation_flags').add(moderationFlag);

    // If critical violation, create violation record
    if (reportType === 'minor_safety' || reportType === 'non_consensual') {
      const violation = createViolation(
        content.senderId,
        reportType === 'minor_safety' ? 'underage_attempt' : 'non_consensual_sharing',
        description,
        'critical',
        { contentId, sessionId: content.sessionId }
      );
      
      await db.collection('sexy_mode_violations').add(violation);
    }

    return {
      success: true,
      message: 'Content reported successfully. Our moderation team will review this.'
    };

  } catch (error: any) {
    console.error('Error reporting sexy content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// AUTOMATED SAFETY CHECKS
// ============================================

/**
 * Auto-expire sessions (scheduled function)
 * Runs every hour
 */
export const autoExpireSessions = functions.pubsub.schedule('every 1 hours').onRun(async () => {
  try {
    const now = admin.firestore.Timestamp.now();
    
    const expiredSessions = await db.collection('sexy_mode_sessions')
      .where('isActive', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    const batch = db.batch();
    
    expiredSessions.docs.forEach(doc => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const session = doc.data() as SexyModeSession;
      const safetyMode = downgradeConversationSafety(
        session.sessionId,
        session.user1Id,
        session.user2Id,
        'system'
      );
      
      batch.set(db.collection('conversation_safety_mode').doc(session.sessionId), safetyMode);
    });

    await batch.commit();

    console.log(`Auto-expired ${expiredSessions.size} sessions`);
    return { expired: expiredSessions.size };

  } catch (error) {
    console.error('Error auto-expiring sessions:', error);
    throw error;
  }
});

/**
 * Monitor content for violations (Firestore trigger)
 */
export const monitorSexyContent = functions.firestore
  .document('sexy_content/{contentId}')
  .onCreate(async (snap, context) => {
    const content = snap.data() as SexyContent;
    const contentId = context.params.contentId;

    try {
      // Check for prohibited content patterns
      if (containsProhibitedContent(content)) {
        // Create moderation flag
        const flag = createModerationFlag(
          contentId,
          content.senderId,
          'ai_detected',
          'critical',
          'Automated detection: prohibited content patterns found'
        );
        
        await db.collection('content_moderation_flags').add(flag);

        // Create violation
        const violation = createViolation(
          content.senderId,
          'prohibited_content',
          'AI detected prohibited content patterns',
          'critical',
          { contentId, sessionId: content.sessionId }
        );
        
        await db.collection('sexy_mode_violations').add(violation);

        // End session immediately
        await db.collection('sexy_mode_sessions').doc(content.sessionId).update({
          isActive: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Flagged content ${contentId} for violations`);
      }

    } catch (error) {
      console.error('Error monitoring sexy content:', error);
    }
  });