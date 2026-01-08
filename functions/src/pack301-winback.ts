/**
 * PACK 301B - Win-Back Sequence Automation
 * 3-step automated win-back campaign for churned users
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  WIN_BACK_MESSAGES,
  RETENTION_CONSTANTS,
} from './pack301-retention-types';
import {
  getUserRetentionProfile,
  markUserReturned,
} from './pack301-retention-service';
import { enqueueNotification } from './pack293-notification-service';
import { writeAuditLog } from './pack296-audit-helpers';

const db = admin.firestore();

/**
 * Scheduled function: Runs daily at 3 AM UTC
 * Sends win-back messages based on step timing
 */
export const dailyWinBackSequence = functions.pubsub
  .schedule('0 3 * * *') // Daily at 3 AM UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[WinBack] Starting daily win-back sequence');

    try {
      // Get all users with active win-back sequences
      const winBackSnapshot = await db
        .collection('userRetention')
        .where('winBackSequenceStarted', '==', true)
        .where('segment', '==', 'CHURNED')
        .get();

      console.log(`[WinBack] Processing ${winBackSnapshot.size} users in win-back`);

      let messagesStep1 = 0;
      let messagesStep2 = 0;
      let messagesStep3 = 0;

      for (const doc of winBackSnapshot.docs) {
        try {
          const userId = doc.id;
          const profile = doc.data();

          // Determine which step to send based on timing
          const daysSinceLastMessage = profile.winBackSequenceLastSent
            ? (Date.now() - profile.winBackSequenceLastSent.toMillis()) / (1000 * 60 * 60 * 24)
            : 999;

          const currentStep = profile.winBackSequenceStep || 0;

          // Step 1: Day 1 after entering CHURNED
          if (currentStep === 0) {
            await sendWinBackMessage(userId, 1);
            messagesStep1++;
          }
          // Step 2: Day 4 (3 days after step 1)
          else if (currentStep === 1 && daysSinceLastMessage >= 3) {
            await sendWinBackMessage(userId, 2);
            messagesStep2++;
          }
          // Step 3: Day 7 (3 days after step 2)
          else if (currentStep === 2 && daysSinceLastMessage >= 3) {
            await sendWinBackMessage(userId, 3);
            messagesStep3++;
          }
          // Sequence complete
          else if (currentStep >= 3) {
            console.log(`[WinBack] User ${userId} completed win-back sequence`);
          }
        } catch (error) {
          console.error(`[WinBack] Error processing user ${doc.id}:`, error);
        }
      }

      const summary = {
        processed: winBackSnapshot.size,
        messagesStep1,
        messagesStep2,
        messagesStep3,
        timestamp: new Date().toISOString(),
      };

      console.log('[WinBack] Completed:', summary);

      // Store daily summary
      await db.collection('retentionMetrics').doc(getTodayDateString()).set(
        {
          winBackRun: summary,
          runAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

      return summary;
    } catch (error) {
      console.error('[WinBack] Error in daily win-back sequence:', error);
      throw error;
    }
  });

/**
 * Send win-back message for specific step
 */
async function sendWinBackMessage(userId: string, step: number): Promise<void> {
  try {
    // Get message template
    const messageTemplate = WIN_BACK_MESSAGES.find(msg => msg.step === step);
    
    if (!messageTemplate) {
      console.error(`[WinBack] No template found for step ${step}`);
      return;
    }

    // Get user language
    const userDoc = await db.collection('users').doc(userId).get();
    const language = userDoc.data()?.language || 'en';

    const title = language === 'pl' ? messageTemplate.titlePl : messageTemplate.titleEn;
    const body = language === 'pl' ? messageTemplate.bodyPl : messageTemplate.bodyEn;

    // Send notification via PACK 293
    await enqueueNotification({
      userId,
      type: 'WINBACK' as any,
      title,
      body,
      context: {
        step,
        sequence: 'win_back',
      },
      priority: messageTemplate.priority,
      delivery: {
        push: true,
        inApp: true,
        email: false,
      },
    });

    // Update retention profile
    const retentionRef = db.collection('userRetention').doc(userId);
    await retentionRef.update({
      winBackSequenceStep: step,
      winBackSequenceLastSent: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Log to audit
    await writeAuditLog({
      actorType: 'SYSTEM',
      actionType: 'RETENTION_WINBACK_STARTED' as any,
      resourceType: 'USER',
      resourceId: userId,
      metadata: {
        step,
        priority: messageTemplate.priority,
      },
    });

    console.log(`[WinBack] Sent step ${step} message to user ${userId}`);
  } catch (error) {
    console.error(`[WinBack] Error sending message to ${userId}:`, error);
    throw error;
  }
}

/**
 * Mark user as returned from win-back
 * Called when churned user becomes active again
 */
export const markWinBackReturn = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const profile = await getUserRetentionProfile(userId);

    // Check if user was in win-back sequence
    if (!profile.winBackSequenceStarted) {
      return {
        success: false,
        message: 'User was not in win-back sequence',
      };
    }

    // Mark as returned
    await markUserReturned(userId);

    console.log(`[WinBack] User ${userId} returned from win-back`);

    return {
      success: true,
      message: 'Successfully marked as returned',
      winBackStep: profile.winBackSequenceStep,
    };
  } catch (error: any) {
    console.error('[WinBack] Error marking return:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get win-back statistics (admin only)
 */
export const getWinBackStatistics = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  try {
    // Get all users in win-back sequences
    const winBackSnapshot = await db
      .collection('userRetention')
      .where('winBackSequenceStarted', '==', true)
      .get();

    const stats = {
      total: winBackSnapshot.size,
      byStep: {
        step0: 0, // Just started
        step1: 0, // First message sent
        step2: 0, // Second message sent
        step3: 0, // Third message sent (complete)
      },
      returned: 0,
    };

    winBackSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const step = data.winBackSequenceStep || 0;
      
      if (step === 0) stats.byStep.step0++;
      else if (step === 1) stats.byStep.step1++;
      else if (step === 2) stats.byStep.step2++;
      else if (step >= 3) stats.byStep.step3++;

      if (data.segment === 'RETURNING') {
        stats.returned++;
      }
    });

    // Calculate success rate
    const successRate =
      stats.total > 0 ? (stats.returned / stats.total) * 100 : 0;

    return {
      success: true,
      statistics: {
        ...stats,
        successRate: successRate.toFixed(2) + '%',
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[WinBack] Error getting statistics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Manual trigger for win-back message (admin/testing only)
 */
export const triggerWinBackMessage = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication check here

  const { userId, step } = data;

  if (!userId || !step) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and step are required');
  }

  if (step < 1 || step > 3) {
    throw new functions.https.HttpsError('invalid-argument', 'step must be 1, 2, or 3');
  }

  try {
    await sendWinBackMessage(userId, step);

    return {
      success: true,
      message: `Sent win-back step ${step} to user ${userId}`,
    };
  } catch (error: any) {
    console.error('[WinBack] Error in manual trigger:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

console.log('✅ PACK 301B - Win-Back Sequence Automation initialized');