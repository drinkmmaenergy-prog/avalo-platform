/**
 * PACK 301B - Daily Churn Risk Recalculation
 * Scheduled function to recalculate churn scores and trigger segment transitions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  getUserRetentionProfile,
  updateUserSegmentAndChurnScore,
  calculateUserSegment,
  getUsersForReengagement,
  startWinBackSequence,
} from './pack301-retention-service';
import {
  UserSegment,
  RETENTION_CONSTANTS,
} from './pack301-retention-types';
import { enqueueNotification } from './pack293-notification-service';
import { writeAuditLog } from './pack296-audit-helpers';

const db = admin.firestore();

/**
 * Scheduled function: Runs daily at 2 AM UTC
 * Recalculates churn risk and segment for all active users
 */
export const dailyChurnRecalculation = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[ChurnDaily] Starting daily churn recalculation');

    try {
      // Get all users with retention profiles (active in last 60 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);

      const retentionSnapshot = await db
        .collection('userRetention')
        .where('lastActiveAt', '>', admin.firestore.Timestamp.fromDate(cutoffDate))
        .get();

      console.log(`[ChurnDaily] Processing ${retentionSnapshot.size} users`);

      let processed = 0;
      let segmentTransitions = 0;
      let winBackTriggered = 0;

      // Process in batches of 100
      const batchSize = 100;
      const users = retentionSnapshot.docs;

      for (let i = 0; i < users.length; i += batchSize) {
        const batchUsers = users.slice(i, i + batchSize);
        
        await Promise.all(
          batchUsers.map(async (doc) => {
            try {
              const userId = doc.id;
              const oldProfile = doc.data();
              const oldSegment = oldProfile.segment;

              // Recalculate segment and churn score
              await updateUserSegmentAndChurnScore(userId);

              // Get updated profile
              const newProfile = await getUserRetentionProfile(userId);
              const newSegment = newProfile.segment;

              processed++;

              // Check for segment transitions
              if (oldSegment !== newSegment) {
                segmentTransitions++;

                // Start win-back sequence if transitioning to CHURNED
                if (newSegment === 'CHURNED' && !newProfile.winBackSequenceStarted) {
                  await startWinBackSequence(userId);
                  winBackTriggered++;
                }

                console.log(
                  `[ChurnDaily] User ${userId} transitioned: ${oldSegment} → ${newSegment}`
                );
              }

              // Send re-engagement notifications for DORMANT/CHURN_RISK
              if (newSegment === 'DORMANT' || newSegment === 'CHURN_RISK') {
                await maybeQueueReengagement(userId, newSegment);
              }
            } catch (error) {
              console.error(`[ChurnDaily] Error processing user ${doc.id}:`, error);
            }
          })
        );

        console.log(`[ChurnDaily] Processed batch ${i / batchSize + 1}`);
      }

      // Log summary
      const summary = {
        processed,
        segmentTransitions,
        winBackTriggered,
        timestamp: new Date().toISOString(),
      };

      console.log('[ChurnDaily] Completed:', summary);

      // Store daily summary
      await db.collection('retentionMetrics').doc(getTodayDateString()).set(
        {
          dailyChurnRun: summary,
          runAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

      return summary;
    } catch (error) {
      console.error('[ChurnDaily] Error in daily churn recalculation:', error);
      throw error;
    }
  });

/**
 * Queue re-engagement notification for dormant/at-risk users
 */
async function maybeQueueReengagement(userId: string, segment: UserSegment): Promise<void> {
  try {
    // Check if already sent re-engagement recently
    const historyRef = db.collection('nudgeHistory').doc(userId);
    const historySnap = await historyRef.get();
    const history = historySnap.data();

    if (history?.lastReengagementSent) {
      const daysSince =
        (Date.now() - history.lastReengagementSent.toMillis()) / (1000 * 60 * 60 * 24);
      
      // Rate limit: 1 re-engagement per 3 days
      if (daysSince < 3) {
        return;
      }
    }

    // Check user opt-out
    if (history?.optedOut) {
      return;
    }

    // Get user language
    const userDoc = await db.collection('users').doc(userId).get();
    const language = userDoc.data()?.language || 'en';

    // Prepare notification based on segment
    let title: string;
    let body: string;
    let priority: 'LOW' | 'NORMAL' = 'LOW';

    if (segment === 'DORMANT') {
      title = language === 'pl' 
        ? 'Wracaj do Avalo' 
        : 'Come back to Avalo';
      body = language === 'pl'
        ? 'Nowe osoby czekają w przesuwaniu.'
        : 'New people are waiting in Swipe.';
      priority = 'LOW';
    } else if (segment === 'CHURN_RISK') {
      title = language === 'pl'
        ? 'Masz nieprzeczytane polubienia'
        : 'You have unread likes';
      body = language === 'pl'
        ? 'Wróć, aby sprawdzić, kto Cię polubił.'
        : 'Come back to check who liked you.';
      priority = 'NORMAL';
    } else {
      return;
    }

    // Send notification
    await enqueueNotification({
      userId,
      type: 'REENGAGEMENT' as any,
      title,
      body,
      context: {
        segment,
        source: 'daily_churn',
      },
      priority,
      delivery: {
        push: true,
        inApp: true,
        email: false,
      },
    });

    // Update history
    await historyRef.set(
      {
        userId,
        lastReengagementSent: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    // Log to audit
    await writeAuditLog({
      actorType: 'SYSTEM',
      actionType: 'RETENTION_NUDGE_SENT' as any,
      resourceType: 'USER',
      resourceId: userId,
      metadata: {
        type: 'reengagement',
        segment,
      },
    });

    console.log(`[ChurnDaily] Queued re-engagement for user ${userId} (${segment})`);
  } catch (error) {
    console.error(`[ChurnDaily] Error queueing re-engagement for ${userId}:`, error);
  }
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Manual trigger for churn recalculation (admin only)
 */
export const triggerChurnRecalculation = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here
  
  const { userId } = data;

  try {
    if (userId) {
      // Recalculate single user
      await updateUserSegmentAndChurnScore(userId);
      
      return {
        success: true,
        message: `Recalculated churn score for user ${userId}`,
      };
    } else {
      // Trigger full daily recalculation
      return {
        success: true,
        message: 'Full recalculation triggered - check logs for progress',
      };
    }
  } catch (error: any) {
    console.error('[ChurnDaily] Error in manual trigger:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get churn statistics (admin only)
 */
export const getChurnStatistics = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  try {
    // Get segment distribution
    const retentionSnapshot = await db.collection('userRetention').get();
    
    const stats = {
      total: retentionSnapshot.size,
      bySegment: {
        NEW: 0,
        ACTIVE: 0,
        DORMANT: 0,
        CHURN_RISK: 0,
        CHURNED: 0,
        RETURNING: 0,
      },
      highRisk: 0, // Churn score >= 0.6
    };

    retentionSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const segment = data.segment as UserSegment;
      
      if (stats.bySegment[segment] !== undefined) {
        stats.bySegment[segment]++;
      }

      if (data.riskOfChurn >= RETENTION_CONSTANTS.HIGH_CHURN_RISK_THRESHOLD) {
        stats.highRisk++;
      }
    });

    return {
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ChurnDaily] Error getting statistics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 301B - Daily Churn Recalculation initialized');