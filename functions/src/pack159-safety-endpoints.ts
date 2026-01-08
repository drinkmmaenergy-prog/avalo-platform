/**
 * ============================================================================
 * PACK 159 — SAFETY SCORING API ENDPOINTS
 * ============================================================================
 * 
 * Cloud Functions for safety scoring system
 * 
 * @version 3.0.0
 * @module pack159-safety-endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, logger } from './common';
import {
  evaluateConsentState,
  getSafetyScore,
  recordSafetyEvent,
  blockUnsafeMessage,
  applyScoreDecay,
} from './pack159-safety-engine';
import {
  SafetyAppeal,
  AppealStatus,
  SafetyEvent,
  SafetyIntervention,
} from './pack159-safety-types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// CONSENT STATE MANAGEMENT
// ============================================================================

/**
 * Evaluate consent state for conversation
 */
export const safety159_evaluateConsentState = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { conversationId, messageContent, userAction } = request.data;

    if (!conversationId) {
      throw new HttpsError('invalid-argument', 'conversationId is required');
    }

    try {
      const result = await evaluateConsentState(conversationId, {
        messageContent,
        userAction,
        senderId: uid,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      logger.error('Error evaluating consent state:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SAFETY SCORE ACCESS
// ============================================================================

/**
 * Get user's own safety score (private, user-only)
 */
export const safety159_getMyScore = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const score = await getSafetyScore(uid);

      // Get recent events
      const eventsSnapshot = await db
        .collection('safety_events')
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const recentEvents = eventsSnapshot.docs.map(doc => doc.data());

      // Get active interventions
      const interventionsSnapshot = await db
        .collection('safety_interventions')
        .where('userId', '==', uid)
        .where('active', '==', true)
        .get();

      const activeInterventions = interventionsSnapshot.docs.map(doc => doc.data());

      return {
        success: true,
        score,
        recentEvents,
        activeInterventions,
      };
    } catch (error: any) {
      logger.error('Error getting safety score:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// MESSAGE SAFETY CHECK
// ============================================================================

/**
 * Check if message is safe to send (pre-send validation)
 */
export const safety159_checkMessage = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { conversationId, messageContent } = request.data;

    if (!conversationId || !messageContent) {
      throw new HttpsError('invalid-argument', 'conversationId and messageContent are required');
    }

    try {
      const result = await blockUnsafeMessage(conversationId, messageContent, uid);

      return {
        success: true,
        safe: !result.blocked,
        ...result,
      };
    } catch (error: any) {
      logger.error('Error checking message safety:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SAFETY APPEALS
// ============================================================================

/**
 * Submit safety appeal
 */
export const safety159_submitAppeal = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { eventId, interventionId, appealType, userExplanation } = request.data;

    if (!appealType || !userExplanation) {
      throw new HttpsError('invalid-argument', 'appealType and userExplanation are required');
    }

    if (!['EVENT', 'INTERVENTION', 'SCORE'].includes(appealType)) {
      throw new HttpsError('invalid-argument', 'Invalid appealType');
    }

    try {
      const appealId = db.collection('safety_appeals').doc().id;

      const appeal: SafetyAppeal = {
        appealId,
        userId: uid,
        eventId,
        interventionId,
        appealType,
        userExplanation,
        status: 'PENDING',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection('safety_appeals').doc(appealId).set(appeal);

      logger.info(`Safety appeal submitted: ${appealId} by user ${uid}`);

      return {
        success: true,
        appealId,
        message: 'Your appeal has been submitted and will be reviewed within 48 hours',
      };
    } catch (error: any) {
      logger.error('Error submitting appeal:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's appeal status
 */
export const safety159_getAppealStatus = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { appealId } = request.data;

    try {
      if (appealId) {
        // Get specific appeal
        const appealDoc = await db.collection('safety_appeals').doc(appealId).get();

        if (!appealDoc.exists) {
          throw new HttpsError('not-found', 'Appeal not found');
        }

        const appeal = appealDoc.data() as SafetyAppeal;

        if (appeal.userId !== uid) {
          throw new HttpsError('permission-denied', 'Cannot access another user\'s appeal');
        }

        return {
          success: true,
          appeal,
        };
      } else {
        // Get all user's appeals
        const appealsSnapshot = await db
          .collection('safety_appeals')
          .where('userId', '==', uid)
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();

        const appeals = appealsSnapshot.docs.map(doc => doc.data());

        return {
          success: true,
          appeals,
        };
      }
    } catch (error: any) {
      logger.error('Error getting appeal status:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Resolve safety appeal (admin only)
 */
export const safety159_resolveAppeal = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin permission
    const userDoc = await db.collection('users').doc(uid).get();
    const isAdmin = userDoc.data()?.role === 'admin' || userDoc.data()?.role === 'moderator';

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { appealId, status, reviewNotes, scoreAdjustment, cancelIntervention } = request.data;

    if (!appealId || !status) {
      throw new HttpsError('invalid-argument', 'appealId and status are required');
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new HttpsError('invalid-argument', 'Invalid status');
    }

    try {
      const appealRef = db.collection('safety_appeals').doc(appealId);
      const appealDoc = await appealRef.get();

      if (!appealDoc.exists) {
        throw new HttpsError('not-found', 'Appeal not found');
      }

      const appeal = appealDoc.data() as SafetyAppeal;

      // Update appeal
      await appealRef.update({
        status,
        reviewedBy: uid,
        reviewedAt: Timestamp.now(),
        reviewNotes,
        scoreAdjustment,
        interventionCancelled: cancelIntervention || false,
        updatedAt: Timestamp.now(),
      });

      // Apply resolution actions
      if (status === 'APPROVED') {
        // Apply score adjustment if specified
        if (scoreAdjustment) {
          const scoreRef = db.collection('safety_scores').doc(appeal.userId);
          await scoreRef.update({
            overallScore: FieldValue.increment(scoreAdjustment),
            updatedAt: Timestamp.now(),
          });
        }

        // Cancel intervention if specified
        if (cancelIntervention && appeal.interventionId) {
          await db.collection('safety_interventions').doc(appeal.interventionId).update({
            active: false,
            completedAt: Timestamp.now(),
          });
        }

        // Mark event as false positive if appealing event
        if (appeal.eventId) {
          await db.collection('safety_events').doc(appeal.eventId).update({
            resolved: true,
            resolvedAt: Timestamp.now(),
            resolution: 'FALSE_POSITIVE',
          });
        }
      }

      logger.info(`Appeal ${appealId} resolved as ${status} by admin ${uid}`);

      return {
        success: true,
        message: `Appeal ${status.toLowerCase()}`,
      };
    } catch (error: any) {
      logger.error('Error resolving appeal:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// FEEDBACK CARDS
// ============================================================================

/**
 * Get user's safety feedback cards
 */
export const safety159_getFeedbackCards = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const cardsSnapshot = await db
        .collection('safety_feedback_cards')
        .where('userId', '==', uid)
        .where('dismissed', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const cards = cardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        cards,
      };
    } catch (error: any) {
      logger.error('Error getting feedback cards:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Dismiss feedback card
 */
export const safety159_dismissFeedbackCard = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { cardId } = request.data;

    if (!cardId) {
      throw new HttpsError('invalid-argument', 'cardId is required');
    }

    try {
      const cardRef = db.collection('safety_feedback_cards').doc(cardId);
      const cardDoc = await cardRef.get();

      if (!cardDoc.exists) {
        throw new HttpsError('not-found', 'Feedback card not found');
      }

      const card = cardDoc.data();

      if (card?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Cannot dismiss another user\'s feedback card');
      }

      await cardRef.update({
        dismissed: true,
        dismissedAt: Timestamp.now(),
      });

      return {
        success: true,
        message: 'Feedback card dismissed',
      };
    } catch (error: any) {
      logger.error('Error dismissing feedback card:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

/**
 * Scheduled job: Apply score decay daily at 3 AM UTC
 */
export const safety159_dailyScoreDecay = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('Starting daily safety score decay...');

      // Get all users with safety scores that haven't decayed in 24+ hours
      const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

      const scoresSnapshot = await db
        .collection('safety_scores')
        .where('lastDecayAt', '<=', oneDayAgo)
        .where('decayEligible', '==', true)
        .limit(1000) // Process in batches
        .get();

      let processedCount = 0;

      for (const doc of scoresSnapshot.docs) {
        try {
          await applyScoreDecay(doc.id);
          processedCount++;
        } catch (error) {
          logger.error(`Error applying decay to user ${doc.id}:`, error);
        }
      }

      logger.info(`Completed safety score decay: ${processedCount} users processed`);
    } catch (error: any) {
      logger.error('Error in daily score decay:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Expire interventions
 */
export const safety159_expireInterventions = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async (event) => {
    try {
      const now = Timestamp.now();

      const expiredSnapshot = await db
        .collection('safety_interventions')
        .where('active', '==', true)
        .where('expiresAt', '<=', now)
        .limit(500)
        .get();

      let expiredCount = 0;

      const batch = db.batch();

      expiredSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          active: false,
          completedAt: now,
        });
        expiredCount++;
      });

      await batch.commit();

      if (expiredCount > 0) {
        logger.info(`Expired ${expiredCount} safety interventions`);
      }
    } catch (error: any) {
      logger.error('Error expiring interventions:', error);
      throw error;
    }
  }
);

/**
 * Scheduled job: Monitor repeat offenders
 */
export const safety159_monitorRepeatOffenders = onSchedule(
  {
    schedule: '0 */6 * * *', // Every 6 hours
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('Monitoring repeat offenders...');

      // Find users with high violation counts
      const scoresSnapshot = await db
        .collection('safety_scores')
        .where('riskLevel', 'in', ['HIGH_RISK', 'CRITICAL'])
        .where('totalViolations', '>=', 5)
        .limit(100)
        .get();

      let flaggedCount = 0;

      for (const doc of scoresSnapshot.docs) {
        const score = doc.data();

        // Check if user has active interventions
        const interventionsSnapshot = await db
          .collection('safety_interventions')
          .where('userId', '==', doc.id)
          .where('active', '==', true)
          .where('level', '>=', 4)
          .limit(1)
          .get();

        if (interventionsSnapshot.empty) {
          // Flag for manual review
          await db.collection('admin_flags').add({
            type: 'repeat_offender',
            userId: doc.id,
            severity: 'high',
            score: score.overallScore,
            totalViolations: score.totalViolations,
            status: 'pending',
            createdAt: Timestamp.now(),
          });

          flaggedCount++;
        }
      }

      logger.info(`Flagged ${flaggedCount} repeat offenders for review`);
    } catch (error: any) {
      logger.error('Error monitoring repeat offenders:', error);
      throw error;
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  safety159_evaluateConsentState,
  safety159_getMyScore,
  safety159_checkMessage,
  safety159_submitAppeal,
  safety159_getAppealStatus,
  safety159_resolveAppeal,
  safety159_getFeedbackCards,
  safety159_dismissFeedbackCard,
  safety159_dailyScoreDecay,
  safety159_expireInterventions,
  safety159_monitorRepeatOffenders,
};