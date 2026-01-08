/**
 * PACK 226 - Chemistry Lock-In Cloud Function Triggers
 *
 * Automatic detection and management of Chemistry Lock-In state
 */

import * as functions from 'firebase-functions';
import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  detectChemistrySignals,
  activateChemistryLockIn,
  updateLockInActivity,
  checkConversionSuggestion,
  checkLockInExpiration
} from '../engines/chemistryLockIn';
import {
  sendLockInActivatedNotification,
  sendConversionSuggestionNotification
} from '../notifications/chemistryLockInNotifications';

// ============================================================================
// MESSAGE TRIGGERS
// ============================================================================

/**
 * Trigger: Check for chemistry signals on new message
 */
export const onMessageCreated = functions.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const { conversationId } = context.params;
    const message = snapshot.data();

    try {
      // Get conversation
      const conversationRef = db.collection('conversations').doc(conversationId);
      const conversationDoc = await conversationRef.get();

      if (!conversationDoc.exists) return;

      const conversation = conversationDoc.data()!;
      const participants = conversation.participants as string[];

      if (participants.length !== 2) return;

      const [user1Id, user2Id] = participants;

      // Update activity timestamp if Lock-In is active
      if (conversation.chemistryLockIn?.isActive) {
        await updateLockInActivity(conversationId);
      }

      // Check if Lock-In should be activated (every 5 messages)
      const messageCount = conversation.messageCount || 0;
      if (messageCount % 5 === 0 && !conversation.chemistryLockIn?.isActive) {
        const signals = await detectChemistrySignals(conversationId, user1Id, user2Id, {
          includeAIAnalysis: true
        });

        const totalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);

        if (totalScore >= 3) {
          const result = await activateChemistryLockIn(conversationId, user1Id, user2Id);

          if (result.success) {
            // Send notifications to both users
            await Promise.all([
              sendLockInActivatedNotification(user1Id, user2Id, conversationId),
              sendLockInActivatedNotification(user2Id, user1Id, conversationId)
            ]);

            functions.logger.info('Chemistry Lock-In activated', {
              conversationId,
              score: totalScore,
              signals: signals.length
            });
          }
        }
      }

      // Check for conversion suggestion (at 72h mark)
      if (conversation.chemistryLockIn?.isActive) {
        const conversionCheck = await checkConversionSuggestion(conversationId);

        if (conversionCheck.shouldShow && conversionCheck.suggestion) {
          // Send conversion suggestion to both users
          await Promise.all([
            sendConversionSuggestionNotification(
              user1Id,
              user2Id,
              conversationId,
              conversionCheck.suggestion
            ),
            sendConversionSuggestionNotification(
              user2Id,
              user1Id,
              conversationId,
              conversionCheck.suggestion
            )
          ]);

          functions.logger.info('Conversion suggestion sent', {
            conversationId,
            action: conversionCheck.action
          });
        }
      }
    } catch (error) {
      functions.logger.error('Error in onMessageCreated trigger', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

// ============================================================================
// CALL TRIGGERS
// ============================================================================

/**
 * Trigger: Update chemistry signals on call completion
 */
export const onCallCompleted = functions.firestore
  .document('calls/{callId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only process when call status changes to completed
    if (before.status !== 'completed' && after.status === 'completed') {
      const conversationId = after.conversationId;
      
      if (!conversationId) return;

      try {
        const conversationRef = db.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (!conversationDoc.exists) return;

        const conversation = conversationDoc.data()!;
        const participants = conversation.participants as string[];

        if (participants.length !== 2) return;

        const [user1Id, user2Id] = participants;

        // Re-check chemistry signals (calls are strong signals)
        const signals = await detectChemistrySignals(conversationId, user1Id, user2Id, {
          includeAIAnalysis: true
        });

        const totalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);

        // Activate or strengthen Lock-In
        if (totalScore >= 3 && !conversation.chemistryLockIn?.isActive) {
          await activateChemistryLockIn(conversationId, user1Id, user2Id);
          
          functions.logger.info('Chemistry Lock-In activated after call', {
            conversationId,
            callType: after.type,
            duration: after.duration
          });
        } else if (conversation.chemistryLockIn?.isActive) {
          // Update strength score
          await conversationRef.update({
            'chemistryLockIn.strengthScore': totalScore,
            'chemistryLockIn.lastActivityAt': FieldValue.serverTimestamp()
          });
        }
      } catch (error) {
        functions.logger.error('Error in onCallCompleted trigger', {
          callId: context.params.callId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Scheduled: Daily check for Lock-In expirations
 */
export const dailyLockInMaintenance = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting daily Lock-In maintenance');

    try {
      const activeConversations = await db
        .collection('conversations')
        .where('chemistryLockIn.isActive', '==', true)
        .get();

      let expiredCount = 0;
      let activeCount = 0;

      for (const doc of activeConversations.docs) {
        const expired = await checkLockInExpiration(doc.id);
        if (expired) {
          expiredCount++;
        } else {
          activeCount++;
        }
      }

      functions.logger.info('Daily Lock-In maintenance completed', {
        total: activeConversations.size,
        expired: expiredCount,
        stillActive: activeCount
      });
    } catch (error) {
      functions.logger.error('Error in daily Lock-In maintenance', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

/**
 * Scheduled: Send daily chemistry reminders
 */
export const sendDailyChemistryReminders = functions.pubsub
  .schedule('0 10 * * *') // 10 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Sending daily chemistry reminders');

    try {
      // Import here to avoid circular dependencies
      const { sendDailyChemistryReminders: sendReminders } = 
        await import('../notifications/chemistryLockInNotifications');

      await sendReminders();

      functions.logger.info('Daily chemistry reminders sent successfully');
    } catch (error) {
      functions.logger.error('Error sending daily chemistry reminders', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Callable: Manually trigger chemistry detection
 */
export const triggerChemistryDetection = functions.https.onCall(
  async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { conversationId } = data;
    const userId = context.auth.uid;

    if (!conversationId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'conversationId is required'
      );
    }

    try {
      const conversationRef = db.collection('conversations').doc(conversationId);
      const conversationDoc = await conversationRef.get();

      if (!conversationDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Conversation not found'
        );
      }

      const conversation = conversationDoc.data()!;
      const participants = conversation.participants as string[];

      // Verify user is participant
      if (!participants.includes(userId)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'User is not a participant in this conversation'
        );
      }

      if (participants.length !== 2) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Chemistry Lock-In requires exactly 2 participants'
        );
      }

      const [user1Id, user2Id] = participants;

      // Detect signals
      const signals = await detectChemistrySignals(conversationId, user1Id, user2Id, {
        includeAIAnalysis: true
      });

      const totalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);

      return {
        success: true,
        score: totalScore,
        signals: signals.length,
        canActivate: totalScore >= 3,
        isActive: conversation.chemistryLockIn?.isActive || false
      };
    } catch (error) {
      functions.logger.error('Error in triggerChemistryDetection', {
        conversationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to detect chemistry'
      );
    }
  }
);

/**
 * Callable: Disable Chemistry Lock-In notifications for a conversation
 */
export const disableChemistryNotifications = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { conversationId } = data;
    const userId = context.auth.uid;

    if (!conversationId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'conversationId is required'
      );
    }

    try {
      const { disableChemistryNotifications: disableNotifications } = 
        await import('../notifications/chemistryLockInNotifications');

      await disableNotifications(userId, conversationId);

      return { success: true };
    } catch (error) {
      functions.logger.error('Error disabling chemistry notifications', {
        conversationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new functions.https.HttpsError(
        'internal',
        'Failed to disable notifications'
      );
    }
  }
);