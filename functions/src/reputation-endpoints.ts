/**
 * PACK 140 — Avalo Reputation System 2.0
 * Cloud Functions (Callable endpoints)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  recordReputationEvent,
  calculateReputationScore,
  getReputationScore,
  getReputationInsights,
  checkReputationRequirement,
  blockReporter,
  checkForMassReportCampaign,
  addFlagPendingVerification,
  verifyAndProcessFlag,
  startReputationRecovery,
  updateRecoveryProgress,
} from './reputation-system';
import {
  ReputationEventType,
  ReputationDimension,
} from './types/reputation.types';

// ============================================================================
// USER-FACING FUNCTIONS
// ============================================================================

/**
 * Get user's reputation score
 */
export const pack140_getReputationScore = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    try {
      const score = await getReputationScore(userId);

      return {
        success: true,
        data: score,
      };
    } catch (error) {
      console.error('Error getting reputation score:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get reputation score'
      );
    }
  }
);

/**
 * Get user's reputation insights (with recent changes and suggestions)
 */
export const pack140_getReputationInsights = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    try {
      const insights = await getReputationInsights(userId);

      return {
        success: true,
        data: insights,
      };
    } catch (error) {
      console.error('Error getting reputation insights:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get reputation insights'
      );
    }
  }
);

/**
 * Check reputation requirement for booking/purchase
 * Used by other systems before allowing transactions
 */
export const pack140_checkReputationRequirement = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { targetUserId, minimumScore } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'targetUserId is required'
      );
    }

    try {
      const result = await checkReputationRequirement(
        targetUserId,
        minimumScore || 50
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Error checking reputation requirement:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to check reputation requirement'
      );
    }
  }
);

/**
 * Start reputation recovery program
 */
export const pack140_startRecovery = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { dimension } = data;

    if (!dimension || !Object.values(ReputationDimension).includes(dimension)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid dimension is required'
      );
    }

    try {
      const recovery = await startReputationRecovery(userId, dimension);

      return {
        success: true,
        data: recovery,
        message: 'Recovery program started',
      };
    } catch (error) {
      console.error('Error starting recovery:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to start recovery program'
      );
    }
  }
);

// ============================================================================
// SYSTEM INTEGRATION FUNCTIONS (Internal use)
// ============================================================================

/**
 * Record reputation event from other systems
 * Called by mentorship, events, clubs, safety systems
 */
export const pack140_recordEvent = functions.https.onCall(
  async (data, context) => {
    // System authentication required (or admin)
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const {
      userId,
      eventType,
      context: eventContext,
      source,
      customScoreImpact,
      reporterId,
    } = data;

    // Validate required fields
    if (!userId || !eventType || !eventContext || !source) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId, eventType, context, and source are required'
      );
    }

    // Validate event type
    if (!Object.values(ReputationEventType).includes(eventType)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid event type'
      );
    }

    try {
      // Check for mass report campaigns
      if (reporterId) {
        const isCampaign = await checkForMassReportCampaign(userId, reporterId);
        if (isCampaign) {
          return {
            success: false,
            message: 'Mass report campaign detected - report ignored',
          };
        }
      }

      const result = await recordReputationEvent({
        userId,
        eventType,
        context: eventContext,
        source,
        customScoreImpact,
        reporterId,
      });

      return result;
    } catch (error) {
      console.error('Error recording reputation event:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to record reputation event'
      );
    }
  }
);

/**
 * Recalculate reputation score (admin or scheduled task)
 */
export const pack140_recalculateScore = functions.https.onCall(
  async (data, context) => {
    // Admin authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { userId } = data;

    if (!userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId is required'
      );
    }

    try {
      const score = await calculateReputationScore(userId);

      return {
        success: true,
        data: score,
        message: 'Score recalculated successfully',
      };
    } catch (error) {
      console.error('Error recalculating score:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to recalculate score'
      );
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Block a reporter from affecting user's reputation
 */
export const pack140_admin_blockReporter = functions.https.onCall(
  async (data, context) => {
    // Admin authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin && !userData?.isModerator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin or moderator access required'
      );
    }

    const { userId, reporterId, reason } = data;

    if (!userId || !reporterId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId and reporterId are required'
      );
    }

    try {
      await blockReporter(userId, reporterId);

      // Log action
      await db.collection('admin_actions').add({
        action: 'block_reporter',
        adminId: context.auth.uid,
        targetUserId: userId,
        reporterId,
        reason: reason || 'Weaponized reporting',
        timestamp: admin.firestore.Timestamp.now(),
      });

      return {
        success: true,
        message: 'Reporter blocked successfully',
      };
    } catch (error) {
      console.error('Error blocking reporter:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to block reporter'
      );
    }
  }
);

/**
 * Add AI Patrol flag pending human verification
 */
export const pack140_admin_addFlagPendingVerification = functions.https.onCall(
  async (data, context) => {
    // System or admin authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { userId, flagId, type, severity } = data;

    if (!userId || !flagId || !type || !severity) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId, flagId, type, and severity are required'
      );
    }

    try {
      await addFlagPendingVerification(userId, flagId, type, severity);

      return {
        success: true,
        message: 'Flag added for verification',
      };
    } catch (error) {
      console.error('Error adding flag:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to add flag for verification'
      );
    }
  }
);

/**
 * Verify and process AI Patrol flag
 */
export const pack140_admin_verifyFlag = functions.https.onCall(
  async (data, context) => {
    // Admin authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { userId, flagId, approved } = data;

    if (!userId || !flagId || approved === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId, flagId, and approved are required'
      );
    }

    try {
      await verifyAndProcessFlag(userId, flagId, approved, context.auth.uid);

      // Log action
      await db.collection('admin_actions').add({
        action: 'verify_flag',
        adminId: context.auth.uid,
        targetUserId: userId,
        flagId,
        approved,
        timestamp: admin.firestore.Timestamp.now(),
      });

      return {
        success: true,
        message: approved ? 'Flag approved and applied' : 'Flag dismissed',
      };
    } catch (error) {
      console.error('Error verifying flag:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to verify flag'
      );
    }
  }
);

/**
 * Get reputation history for admin review
 */
export const pack140_admin_getReputationHistory = functions.https.onCall(
  async (data, context) => {
    // Admin authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin && !userData?.isModerator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin or moderator access required'
      );
    }

    const { userId, limit } = data;

    if (!userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId is required'
      );
    }

    try {
      const eventsSnapshot = await db
        .collection('reputation_events')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit || 50)
        .get();

      const events = eventsSnapshot.docs.map(doc => doc.data());

      return {
        success: true,
        data: events,
      };
    } catch (error) {
      console.error('Error getting reputation history:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get reputation history'
      );
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Daily: Award reputation points for consistent good behavior
 * Runs every day at 3 AM UTC
 */
export const pack140_dailyReputationMaintenance = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();

    try {
      // Get active recovery programs
      const recoverySnapshot = await db
        .collection('reputation_recovery')
        .where('completedAt', '==', null)
        .get();

      for (const doc of recoverySnapshot.docs) {
        const recovery = doc.data();

        // Update recovery progress for consistent users
        await updateRecoveryProgress(
          recovery.userId,
          recovery.dimension,
          1 // 1 point per day of good behavior
        );
      }

      // Award 30-day no-incidents bonus
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const usersSnapshot = await db.collection('users').limit(1000).get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Check for safety incidents in last 30 days
        const incidentsSnapshot = await db
          .collection('reputation_events')
          .where('userId', '==', userId)
          .where('dimension', '==', ReputationDimension.SAFETY_CONSISTENCY)
          .where('scoreImpact', '<', 0)
          .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
          .get();

        if (incidentsSnapshot.empty) {
          // No incidents - award consistency bonus
          await recordReputationEvent({
            userId,
            eventType: ReputationEventType.NO_SAFETY_INCIDENTS,
            context: {
              type: 'daily_maintenance',
              description: 'No safety incidents for 30 days',
            },
            source: 'scheduled_task',
          });
        }
      }

      console.log('Daily reputation maintenance completed');
    } catch (error) {
      console.error('Error in daily reputation maintenance:', error);
    }
  });