/**
 * PACK 115 — Public Reputation & Trust Score Endpoints
 * Cloud Functions endpoints for reputation system
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import {
  calculateReputationScore,
  getPublicReputationProfile,
  getInternalReputationScore,
} from './pack115-reputation-engine';
import { getReputationDisclaimer } from './pack115-types';

// ============================================================================
// USER-FACING ENDPOINTS
// ============================================================================

/**
 * Get public reputation profile for authenticated user or specified user
 * Returns only public display information (level, badge, disclaimer)
 */
export const reputation_getPublicProfile = functions.https.onCall(async (data, context) => {
  try {
    const userId = data?.userId || context.auth?.uid;

    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }

    const profile = await getPublicReputationProfile(userId);

    return {
      success: true,
      profile,
    };
  } catch (error: any) {
    console.error('[Reputation] Error in getPublicProfile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update reputation display settings (show/hide badge)
 * User privacy control
 */
export const reputation_updateDisplaySettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { displayBadge } = data;

  if (typeof displayBadge !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'displayBadge must be a boolean');
  }

  try {
    await db.collection('user_reputation_display_settings').doc(userId).set({
      userId,
      displayBadge,
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`[Reputation] User ${userId} updated display settings: displayBadge=${displayBadge}`);

    return {
      success: true,
      displayBadge,
    };
  } catch (error: any) {
    console.error('[Reputation] Error updating display settings:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get reputation disclaimer (what does NOT affect reputation)
 * Public endpoint, no auth required
 */
export const reputation_getDisclaimer = functions.https.onCall(async (data, context) => {
  try {
    const disclaimer = getReputationDisclaimer();

    return {
      success: true,
      disclaimer,
    };
  } catch (error: any) {
    console.error('[Reputation] Error getting disclaimer:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Manual trigger to recalculate user's reputation
 * User can request their score to be updated
 */
export const reputation_recalculateMyScore = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;

  try {
    const score = await calculateReputationScore(userId);

    console.log(`[Reputation] User ${userId} manually recalculated score: ${score.internalScore} (${score.publicLevel})`);

    return {
      success: true,
      level: score.publicLevel,
      message: 'Your trust level has been updated',
    };
  } catch (error: any) {
    console.error('[Reputation] Error in manual recalculation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// ADMIN/STAFF ENDPOINTS
// ============================================================================

/**
 * Get internal reputation score (admin/staff only)
 * Returns full score breakdown with components and penalties
 */
export const reputation_admin_getInternalScore = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  // TODO: Add admin role check
  // For now, trust that this is called by admin tools

  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const score = await getInternalReputationScore(userId);

    if (!score) {
      throw new functions.https.HttpsError('not-found', 'Reputation score not found');
    }

    return {
      success: true,
      score,
    };
  } catch (error: any) {
    console.error('[Reputation] Error in admin_getInternalScore:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Manually recalculate reputation for a specific user (admin only)
 */
export const reputation_admin_recalculateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  // TODO: Add admin role check

  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  try {
    const score = await calculateReputationScore(userId);

    console.log(`[Reputation] Admin recalculated score for user ${userId}: ${score.internalScore} (${score.publicLevel})`);

    return {
      success: true,
      userId,
      internalScore: score.internalScore,
      publicLevel: score.publicLevel,
    };
  } catch (error: any) {
    console.error('[Reputation] Error in admin recalculation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get reputation abuse attempts (admin only)
 */
export const reputation_admin_getAbuseAttempts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  // TODO: Add admin role check

  const { userId, limit = 50 } = data;

  try {
    let query = db.collection('reputation_abuse_attempts')
      .orderBy('detectedAt', 'desc')
      .limit(limit);

    if (userId) {
      query = query.where('userId', '==', userId) as any;
    }

    const snapshot = await query.get();
    const attempts = snapshot.docs.map(doc => doc.data());

    return {
      success: true,
      attempts,
    };
  } catch (error: any) {
    console.error('[Reputation] Error getting abuse attempts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily reputation score recalculation
 * Runs at 6 AM UTC daily to update all active users' reputation
 */
export const reputation_dailyRecalculation = functions.pubsub
  .schedule('0 6 * * *') // 6 AM UTC daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[Reputation] Starting daily recalculation job');

    try {
      // Get all users who have been active in the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const usersSnapshot = await db.collection('users')
        .where('lastActiveAt', '>=', thirtyDaysAgo)
        .limit(1000) // Process in batches
        .get();

      console.log(`[Reputation] Processing ${usersSnapshot.size} active users`);

      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [] as any[],
      };

      // Process users in parallel batches of 10
      const batchSize = 10;
      const userDocs = usersSnapshot.docs;

      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = userDocs.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (doc) => {
            try {
              await calculateReputationScore(doc.id);
              results.succeeded++;
            } catch (error: any) {
              results.failed++;
              results.errors.push({
                userId: doc.id,
                error: error.message,
              });
              console.error(`[Reputation] Failed to calculate for user ${doc.id}:`, error);
            }
            results.processed++;
          })
        );

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < userDocs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('[Reputation] Daily recalculation completed', results);

      return {
        success: true,
        ...results,
      };
    } catch (error: any) {
      console.error('[Reputation] Error in daily recalculation job:', error);
      throw error;
    }
  });

/**
 * Cleanup old reputation audit logs
 * Runs weekly to remove audit logs older than 1 year
 */
export const reputation_cleanupOldAuditLogs = functions.pubsub
  .schedule('0 3 * * 0') // 3 AM UTC every Sunday
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[Reputation] Starting audit log cleanup job');

    try {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      const oldLogsSnapshot = await db.collection('reputation_audit_logs')
        .where('calculatedAt', '<', oneYearAgo)
        .limit(500)
        .get();

      if (oldLogsSnapshot.empty) {
        console.log('[Reputation] No old audit logs to cleanup');
        return { success: true, deleted: 0 };
      }

      // Delete in batches
      const batch = db.batch();
      oldLogsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`[Reputation] Cleaned up ${oldLogsSnapshot.size} old audit logs`);

      return {
        success: true,
        deleted: oldLogsSnapshot.size,
      };
    } catch (error: any) {
      console.error('[Reputation] Error in cleanup job:', error);
      throw error;
    }
  });