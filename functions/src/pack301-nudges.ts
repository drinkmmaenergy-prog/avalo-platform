/**
 * PACK 301B - Retention Nudges Engine
 * Contextual nudges triggered by user inactivity patterns
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  NUDGE_TEMPLATES,
  NudgeTrigger,
  UserSegment,
} from './pack301-retention-types';
import {
  getUserRetentionProfile,
  updateUserActivity,
} from './pack301-retention-service';
import { enqueueNotification } from './pack293-notification-service';
import { writeAuditLog } from './pack296-audit-helpers';

const db = admin.firestore();

/**
 * Evaluate and send appropriate nudges for inactive users
 * Called by scheduled function or manually triggered
 */
export const evaluateUserNudges = functions.https.onCall(async (data, context) => {
  // This function can be called by system or admin
  // No auth required for scheduled jobs
  
  const { userId, segment } = data;

  try {
    let usersToNudge: string[] = [];

    if (userId) {
      // Single user evaluation
      usersToNudge = [userId];
    } else if (segment) {
      // Evaluate all users in a segment
      const snapshot = await db
        .collection('userRetention')
        .where('segment', '==', segment)
        .limit(100)
        .get();
      
      usersToNudge = snapshot.docs.map(doc => doc.id);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'userId or segment required');
    }

    let nudgesSent = 0;

    for (const uid of usersToNudge) {
      const sent = await evaluateNudgesForUser(uid);
      if (sent) nudgesSent++;
    }

    return {
      success: true,
      usersEvaluated: usersToNudge.length,
      nudgesSent,
    };
  } catch (error: any) {
    console.error('[Nudges] Error evaluating nudges:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Evaluate nudges for a single user
 */
async function evaluateNudgesForUser(userId: string): Promise<boolean> {
  try {
    // Get retention profile
    const profile = await getUserRetentionProfile(userId);

    // Check nudge rate limits
    const canSendNudge = await checkNudgeRateLimit(userId);
    if (!canSendNudge) {
      console.log(`[Nudges] Rate limit reached for user ${userId}`);
      return false;
    }

    // Check quiet hours
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const timezone = userData?.timezone || 'UTC';
    
    if (isInQuietHours(timezone)) {
      console.log(`[Nudges] User ${userId} in quiet hours`);
      return false;
    }

    // Determine which nudge to send based on inactivity
    const nudgeTrigger = determineNudgeTrigger(profile);
    
    if (!nudgeTrigger) {
      console.log(`[Nudges] No nudge needed for user ${userId}`);
      return false;
    }

    // Send nudge
    await sendNudge(userId, nudgeTrigger, userData?.language || 'en');

    return true;
  } catch (error) {
    console.error(`[Nudges] Error evaluating user ${userId}:`, error);
    return false;
  }
}

/**
 * Determine appropriate nudge trigger based on user activity
 */
function determineNudgeTrigger(profile: any): NudgeTrigger | null {
  const now = Date.now();
  const msPerHour = 1000 * 60 * 60;

  // Calculate hours since activities
  const hoursSinceSwipe = profile.lastSwipeAt
    ? (now - profile.lastSwipeAt.toMillis()) / msPerHour
    : 999;
  
  const hoursSinceChat = profile.lastChatAt
    ? (now - profile.lastChatAt.toMillis()) / msPerHour
    : 999;
  
  const hoursSinceActive = (now - profile.lastActiveAt.toMillis()) / msPerHour;

  // Priority order: Most urgent first
  
  // No swipe in 48h
  if (hoursSinceSwipe >= 48) {
    return 'NO_SWIPE_48H';
  }

  // No chat in 3 days (72h)
  if (hoursSinceChat >= 72) {
    return 'NO_CHAT_3D';
  }

  // No login in 72h (3 days)
  if (hoursSinceActive >= 72) {
    return 'NEW_PROFILES_IN_AREA';
  }

  // Profile incomplete (check photo count)
  if (!profile.onboardingCompleted) {
    return 'NO_PHOTOS_24H';
  }

  return null;
}

/**
 * Check nudge rate limits (max 1 retention push per day)
 */
async function checkNudgeRateLimit(userId: string): Promise<boolean> {
  try {
    const historyRef = db.collection('nudgeHistory').doc(userId);
    const historySnap = await historyRef.get();
    const history = historySnap.data();

    if (!history) {
      return true; // No history, can send
    }

    // Check 24h rate limit
    if (history.lastNudgeSent) {
      const hoursSinceLastNudge =
        (Date.now() - history.lastNudgeSent.toMillis()) / (1000 * 60 * 60);
      
      if (hoursSinceLastNudge < 24) {
        return false;
      }
    }

    // Check if user opted out
    if (history.optedOut) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Nudges] Error checking rate limit:', error);
    return false;
  }
}

/**
 * Check if current time is in quiet hours (22:00 - 08:00 local)
 */
function isInQuietHours(timezone: string): boolean {
  try {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = userTime.getHours();

    // Quiet hours: 22:00 (10 PM) to 08:00 (8 AM)
    return hour >= 22 || hour < 8;
  } catch (error) {
    console.error('[Nudges] Error checking quiet hours:', error);
    return false; // If error, allow sending
  }
}

/**
 * Send nudge notification
 */
async function sendNudge(
  userId: string,
  trigger: NudgeTrigger,
  language: string
): Promise<void> {
  try {
    const template = NUDGE_TEMPLATES[trigger];
    const title = language === 'pl' ? template.titlePl : template.titleEn;
    const body = language === 'pl' ? template.bodyPl : template.bodyEn;

    // Send via PACK 293
    await enqueueNotification({
      userId,
      type: 'RETENTION_NUDGE' as any,
      title,
      body,
      context: {
        trigger,
      },
      priority: template.priority,
      delivery: {
        push: true,
        inApp: true,
        email: false,
      },
    });

    // Update nudge history
    const historyRef = db.collection('nudgeHistory').doc(userId);
    await historyRef.set(
      {
        userId,
        lastNudgeSent: admin.firestore.Timestamp.now(),
        nudgeCount24h: admin.firestore.FieldValue.increment(1) as any,
        recentNudges: admin.firestore.FieldValue.arrayUnion({
          trigger,
          sentAt: admin.firestore.Timestamp.now(),
        }) as any,
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
        trigger,
        priority: template.priority,
      },
    });

    console.log(`[Nudges] Sent ${trigger} nudge to user ${userId}`);
  } catch (error) {
    console.error('[Nudges] Error sending nudge:', error);
    throw error;
  }
}

/**
 * User opt-out from retention nudges
 */
export const optOutFromNudges = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const historyRef = db.collection('nudgeHistory').doc(userId);
    await historyRef.set(
      {
        userId,
        optedOut: true,
        optedOutAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    console.log(`[Nudges] User ${userId} opted out from nudges`);

    return {
      success: true,
      message: 'Successfully opted out from retention nudges',
    };
  } catch (error: any) {
    console.error('[Nudges] Error opting out:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * User opt back in to retention nudges
 */
export const optInToNudges = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const historyRef = db.collection('nudgeHistory').doc(userId);
    await historyRef.set(
      {
        userId,
        optedOut: false,
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    console.log(`[Nudges] User ${userId} opted back in to nudges`);

    return {
      success: true,
      message: 'Successfully opted in to retention nudges',
    };
  } catch (error: any) {
    console.error('[Nudges] Error opting in:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 301B - Retention Nudges Engine initialized');