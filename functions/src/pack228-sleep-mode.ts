/**
 * PACK 228: Sleep Mode / Mental Cooldown System
 * Backend Cloud Functions for emotional health breaks
 * Protects users from burnout while preserving chemistry and monetization
 */

import { db, serverTimestamp, increment } from './init';
import * as functions from 'firebase-functions';

// ============================================================================
// INTERFACES
// ============================================================================

interface SleepModeState {
  userId: string;
  isActive: boolean;
  activatedAt: FirebaseFirestore.Timestamp;
  deactivatedAt?: FirebaseFirestore.Timestamp;
  autoEndAt?: FirebaseFirestore.Timestamp | null;
  lastPromptShown?: FirebaseFirestore.Timestamp;
  exitReason?: 'manual' | 'auto_activity' | 'auto_timeout';
  createdAt: FirebaseFirestore.Timestamp;
}

interface SleepModeSuggestion {
  suggestionId: string;
  userId: string;
  triggerType: 'inactivity' | 'anxiety_pattern' | 'sudden_drop' | 'declined_invitations';
  triggerDetails: string;
  dismissed: boolean;
  dismissedAt?: FirebaseFirestore.Timestamp;
  actioned: boolean;
  actionedAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

interface SleepModeExitTrigger {
  userId: string;
  triggerType: 'message_sent' | 'chat_opened' | 'meeting_scheduled' | 'call_started';
  triggerCount: number;
  processed: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

interface PendingPayment {
  paymentId: string;
  recipientUserId: string;
  senderUserId: string;
  paymentType: 'chat' | 'call' | 'video' | 'meeting';
  amount: number;
  processed: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// SLEEP MODE ACTIVATION
// ============================================================================

/**
 * Activate sleep mode for a user
 */
export const activateSleepMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const autoEndHours = data.autoEndHours || null; // Optional auto-end time

  try {
    const stateRef = db.collection('sleep_mode_states').doc(userId);
    const stateSnap = await stateRef.get();

    const now = serverTimestamp();
    const autoEndAt = autoEndHours 
      ? new Date(Date.now() + autoEndHours * 60 * 60 * 1000)
      : null;

    if (stateSnap.exists) {
      // Update existing state
      await stateRef.update({
        isActive: true,
        activatedAt: now,
        autoEndAt: autoEndAt,
        exitReason: null,
      });
    } else {
      // Create new state
      await stateRef.set({
        userId,
        isActive: true,
        activatedAt: now,
        autoEndAt: autoEndAt,
        createdAt: now,
      });
    }

    // Add to history
    await db.collection('sleep_mode_history').add({
      userId,
      activatedAt: now,
      autoEndAt: autoEndAt,
      source: 'manual',
    });

    // Pause romantic momentum (PACK 224)
    await pauseRomanticMomentum(userId);

    // Pause desire loop triggers (PACK 227)
    await pauseDesireLoop(userId);

    // Update analytics
    await updateAnalytics('activation', userId);

    return { success: true, message: 'Sleep mode activated' };
  } catch (error) {
    console.error('Error activating sleep mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to activate sleep mode');
  }
});

/**
 * Deactivate sleep mode for a user
 */
export const deactivateSleepMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const exitReason = data.exitReason || 'manual';

  try {
    const stateRef = db.collection('sleep_mode_states').doc(userId);
    const stateSnap = await stateRef.get();

    if (!stateSnap.exists || !stateSnap.data()?.isActive) {
      return { success: false, message: 'Sleep mode not active' };
    }

    const now = serverTimestamp();

    // Deactivate sleep mode
    await stateRef.update({
      isActive: false,
      deactivatedAt: now,
      exitReason,
    });

    // Update history
    const historyQuery = await db.collection('sleep_mode_history')
      .where('userId', '==', userId)
      .where('deactivatedAt', '==', null)
      .orderBy('activatedAt', 'desc')
      .limit(1)
      .get();

    if (!historyQuery.empty) {
      await historyQuery.docs[0].ref.update({
        deactivatedAt: now,
        exitReason,
      });
    }

    // Resume romantic momentum (PACK 224)
    await resumeRomanticMomentum(userId);

    // Resume desire loop (PACK 227)
    await resumeDesireLoop(userId);

    // Process pending payments
    await processPendingPayments(userId);

    // Trigger Match Comeback Engine (PACK 225)
    await triggerMatchComeback(userId);

    // Update analytics
    await updateAnalytics('deactivation', userId);

    return { 
      success: true, 
      message: 'Welcome back — continue at your own pace.',
      exitReason 
    };
  } catch (error) {
    console.error('Error deactivating sleep mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to deactivate sleep mode');
  }
});

// ============================================================================
// AI SUGGESTION SYSTEM
// ============================================================================

/**
 * Check if user should be suggested to enter sleep mode
 * Runs daily via scheduled function
 */
export const checkSleepModeSuggestions = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      // Get all active users
      const usersSnap = await db.collection('users')
        .where('active', '==', true)
        .get();

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        
        // Skip if already in sleep mode
        const stateSnap = await db.collection('sleep_mode_states').doc(userId).get();
        if (stateSnap.exists && stateSnap.data()?.isActive) {
          continue;
        }

        // Check various triggers
        await checkInactivityPattern(userId);
        await checkAnxietyPattern(userId);
        await checkSuddenDrop(userId);
        await checkDeclinedInvitations(userId);
      }

      console.log('Sleep mode suggestions check completed');
    } catch (error) {
      console.error('Error checking sleep mode suggestions:', error);
    }
  });

/**
 * Check for inactivity pattern (ignores all chats for 5 days)
 */
async function checkInactivityPattern(userId: string): Promise<void> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  
  const messagesSnap = await db.collection('messages')
    .where('senderId', '==', userId)
    .where('createdAt', '>', fiveDaysAgo)
    .limit(1)
    .get();

  if (messagesSnap.empty) {
    await createSleepModeSuggestion(userId, 'inactivity', 
      'No chat activity detected for 5 days');
  }
}

/**
 * Check for anxiety pattern (opens app frequently but never replies)
 */
async function checkAnxietyPattern(userId: string): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Check app opens
  const sessionsSnap = await db.collection('user_sessions')
    .where('userId', '==', userId)
    .where('startedAt', '>', oneDayAgo)
    .get();

  const sessionCount = sessionsSnap.size;

  // Check replies
  const repliesSnap = await db.collection('messages')
    .where('senderId', '==', userId)
    .where('createdAt', '>', oneDayAgo)
    .get();

  const replyCount = repliesSnap.size;

  // High opens, low replies = anxiety pattern
  if (sessionCount > 10 && replyCount === 0) {
    await createSleepModeSuggestion(userId, 'anxiety_pattern',
      'High app activity but no message engagement detected');
  }
}

/**
 * Check for sudden romantic drop after high usage
 */
async function checkSuddenDrop(userId: string): Promise<void> {
  const romanticMomentumSnap = await db.collection('romantic_momentum_states')
    .doc(userId)
    .get();

  if (!romanticMomentumSnap.exists) return;

  const momentum = romanticMomentumSnap.data();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Check if momentum dropped significantly in last week
  if (momentum?.currentScore && momentum?.peakScore) {
    const dropPercentage = ((momentum.peakScore - momentum.currentScore) / momentum.peakScore) * 100;
    
    if (dropPercentage > 50 && momentum.lastUpdated?.toDate() > sevenDaysAgo) {
      await createSleepModeSuggestion(userId, 'sudden_drop',
        'Significant drop in romantic engagement detected');
    }
  }
}

/**
 * Check for multiple declined meeting/call invitations
 */
async function checkDeclinedInvitations(userId: string): Promise<void> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  const declinedSnap = await db.collection('calendar_events')
    .where('invitedUserId', '==', userId)
    .where('status', '==', 'declined')
    .where('createdAt', '>', threeDaysAgo)
    .get();

  if (declinedSnap.size >= 3) {
    await createSleepModeSuggestion(userId, 'declined_invitations',
      'Multiple declined invitations detected');
  }
}

/**
 * Create a sleep mode suggestion for user
 */
async function createSleepModeSuggestion(
  userId: string,
  triggerType: string,
  triggerDetails: string
): Promise<void> {
  // Check if similar suggestion exists recently
  const recentSnap = await db.collection('sleep_mode_suggestions')
    .where('userId', '==', userId)
    .where('triggerType', '==', triggerType)
    .where('dismissed', '==', false)
    .where('actioned', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!recentSnap.empty) {
    const recent = recentSnap.docs[0].data();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (recent.createdAt?.toDate() > dayAgo) {
      return; // Don't spam suggestions
    }
  }

  await db.collection('sleep_mode_suggestions').add({
    userId,
    triggerType,
    triggerDetails,
    dismissed: false,
    actioned: false,
    createdAt: serverTimestamp(),
  });
}

// ============================================================================
// AUTO-EXIT DETECTION
// ============================================================================

/**
 * Track activity that might trigger auto-exit from sleep mode
 */
export const trackSleepModeActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const activityType = data.activityType; // message_sent, chat_opened, meeting_scheduled, call_started

  try {
    // Check if user is in sleep mode
    const stateSnap = await db.collection('sleep_mode_states').doc(userId).get();
    if (!stateSnap.exists || !stateSnap.data()?.isActive) {
      return { success: true, inSleepMode: false };
    }

    // Auto-exit on certain actions
    if (activityType === 'message_sent' ||
        activityType === 'meeting_scheduled' ||
        activityType === 'call_started') {
      // Auto-exit sleep mode
      const stateRef = db.collection('sleep_mode_states').doc(userId);
      await stateRef.update({
        isActive: false,
        deactivatedAt: serverTimestamp(),
        exitReason: 'auto_activity',
      });
      
      await resumeRomanticMomentum(userId);
      await resumeDesireLoop(userId);
      await processPendingPayments(userId);
      await triggerMatchComeback(userId);
      await updateAnalytics('deactivation', userId);
      
      return { success: true, autoExited: true };
    }

    // Track chat opens for potential auto-exit (3 opens in 24h)
    if (activityType === 'chat_opened') {
      const triggerRef = db.collection('sleep_mode_exit_triggers').doc(`${userId}_chat_opens`);
      const triggerSnap = await triggerRef.get();

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (triggerSnap.exists) {
        const data = triggerSnap.data();
        const lastCreated = data?.createdAt?.toDate();
        
        if (lastCreated && lastCreated > oneDayAgo) {
          const newCount = (data?.triggerCount || 0) + 1;
          await triggerRef.update({
            triggerCount: newCount,
          });

          if (newCount >= 3) {
            // Auto-exit sleep mode
            const stateRef = db.collection('sleep_mode_states').doc(userId);
            await stateRef.update({
              isActive: false,
              deactivatedAt: serverTimestamp(),
              exitReason: 'auto_activity',
            });
            
            await resumeRomanticMomentum(userId);
            await resumeDesireLoop(userId);
            await processPendingPayments(userId);
            await triggerMatchComeback(userId);
            await updateAnalytics('deactivation', userId);
            await triggerRef.delete();
            
            return { success: true, autoExited: true };
          }
        } else {
          // Reset if older than 24h
          await triggerRef.set({
            userId,
            triggerType: 'chat_opened',
            triggerCount: 1,
            processed: false,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        await triggerRef.set({
          userId,
          triggerType: 'chat_opened',
          triggerCount: 1,
          processed: false,
          createdAt: serverTimestamp(),
        });
      }
    }

    return { success: true, inSleepMode: true, autoExited: false };
  } catch (error) {
    console.error('Error tracking sleep mode activity:', error);
    throw new functions.https.HttpsError('internal', 'Failed to track activity');
  }
});

/**
 * Check for auto-timeout (scheduled function)
 */
export const checkSleepModeAutoTimeout = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const now = new Date();
      
      const statesSnap = await db.collection('sleep_mode_states')
        .where('isActive', '==', true)
        .where('autoEndAt', '<=', now)
        .get();

      for (const stateDoc of statesSnap.docs) {
        const userId = stateDoc.id;
        
        // Auto-exit sleep mode
        const stateRef = db.collection('sleep_mode_states').doc(userId);
        await stateRef.update({
          isActive: false,
          deactivatedAt: serverTimestamp(),
          exitReason: 'auto_timeout',
        });
        
        await resumeRomanticMomentum(userId);
        await resumeDesireLoop(userId);
        await processPendingPayments(userId);
        await triggerMatchComeback(userId);
        await updateAnalytics('deactivation', userId);
      }

      console.log(`Auto-timeout checked, ${statesSnap.size} users exited`);
    } catch (error) {
      console.error('Error checking auto-timeout:', error);
    }
  });

// ============================================================================
// PENDING PAYMENTS MANAGEMENT
// ============================================================================

/**
 * Store paid interaction during sleep mode
 */
export const storePendingPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { recipientUserId, paymentType, amount } = data;
  const senderUserId = context.auth.uid;

  try {
    await db.collection('sleep_mode_pending_payments').add({
      recipientUserId,
      senderUserId,
      paymentType,
      amount,
      processed: false,
      createdAt: serverTimestamp(),
    });

    return { success: true, message: 'Payment stored, will be processed when user returns' };
  } catch (error) {
    console.error('Error storing pending payment:', error);
    throw new functions.https.HttpsError('internal', 'Failed to store payment');
  }
});

/**
 * Process pending payments when user exits sleep mode
 */
async function processPendingPayments(userId: string): Promise<void> {
  const paymentsSnap = await db.collection('sleep_mode_pending_payments')
    .where('recipientUserId', '==', userId)
    .where('processed', '==', false)
    .get();

  for (const paymentDoc of paymentsSnap.docs) {
    const payment = paymentDoc.data();
    
    // Process the payment (integrate with existing payment system)
    // This would call the appropriate payment processing function
    // based on paymentType (chat, call, video, meeting)
    
    await paymentDoc.ref.update({
      processed: true,
      processedAt: serverTimestamp(),
    });
  }
}

// ============================================================================
// INTEGRATION WITH OTHER PACKS
// ============================================================================

/**
 * Pause romantic momentum (PACK 224)
 */
async function pauseRomanticMomentum(userId: string): Promise<void> {
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  const momentumSnap = await momentumRef.get();
  
  if (momentumSnap.exists) {
    await momentumRef.update({
      paused: true,
      pausedAt: serverTimestamp(),
      pauseReason: 'sleep_mode',
    });
  }
}

/**
 * Resume romantic momentum (PACK 224)
 */
async function resumeRomanticMomentum(userId: string): Promise<void> {
  const momentumRef = db.collection('romantic_momentum_states').doc(userId);
  const momentumSnap = await momentumRef.get();
  
  if (momentumSnap.exists) {
    await momentumRef.update({
      paused: false,
      resumedAt: serverTimestamp(),
    });
  }
}

/**
 * Pause desire loop triggers (PACK 227)
 */
async function pauseDesireLoop(userId: string): Promise<void> {
  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('desire_loop');
  
  await settingsRef.set({
    pausedForSleepMode: true,
    pausedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Resume desire loop (PACK 227)
 */
async function resumeDesireLoop(userId: string): Promise<void> {
  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('desire_loop');
  
  await settingsRef.set({
    pausedForSleepMode: false,
    resumedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Trigger Match Comeback Engine (PACK 225)
 */
async function triggerMatchComeback(userId: string): Promise<void> {
  // Get high-chemistry matches
  const matchesSnap = await db.collection('matches')
    .where('userIds', 'array-contains', userId)
    .where('chemistryScore', '>', 70)
    .orderBy('chemistryScore', 'desc')
    .limit(10)
    .get();

  // Create comeback suggestions for top matches
  for (const matchDoc of matchesSnap.docs) {
    const match = matchDoc.data();
    const otherUserId = match.userIds.find((id: string) => id !== userId);
    
    await db.collection('match_comeback_suggestions').add({
      userId,
      matchId: matchDoc.id,
      otherUserId,
      reason: 'sleep_mode_return',
      chemistryScore: match.chemistryScore,
      createdAt: serverTimestamp(),
    });
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Update sleep mode analytics
 */
async function updateAnalytics(
  eventType: 'activation' | 'deactivation' | 'suggestion_created' | 'suggestion_actioned',
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const analyticsRef = db.collection('sleep_mode_analytics').doc(today);

  const updates: any = {};
  
  if (eventType === 'activation') {
    updates.totalActivations = increment(1);
    updates.currentlyActive = increment(1);
  } else if (eventType === 'deactivation') {
    updates.totalDeactivations = increment(1);
    updates.currentlyActive = increment(-1);
  } else if (eventType === 'suggestion_created') {
    updates.totalSuggestions = increment(1);
  } else if (eventType === 'suggestion_actioned') {
    updates.totalSuggestionsActioned = increment(1);
  }

  await analyticsRef.set({
    date: today,
    ...updates,
    lastUpdated: serverTimestamp(),
  }, { merge: true });
}

// ============================================================================
// HELPER: CHECK IF USER IS IN SLEEP MODE
// ============================================================================

/**
 * Check if a user is currently in sleep mode
 */
export async function isUserInSleepMode(userId: string): Promise<boolean> {
  const stateSnap = await db.collection('sleep_mode_states').doc(userId).get();
  return stateSnap.exists && stateSnap.data()?.isActive === true;
}

/**
 * Get sleep mode status message for other users
 */
export const getSleepModeMessage = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  try {
    const inSleepMode = await isUserInSleepMode(userId);
    
    if (inSleepMode) {
      return {
        inSleepMode: true,
        message: 'This person is currently taking a short break. They\'ll see your message soon.',
      };
    }

    return { inSleepMode: false };
  } catch (error) {
    console.error('Error checking sleep mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check sleep mode');
  }
});