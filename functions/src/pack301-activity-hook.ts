/**
 * PACK 301B - Activity Tracker Bridge
 * Hooks into user activities to update retention metrics
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  updateUserActivity,
  updateUserSegmentAndChurnScore,
} from './pack301-retention-service';

const db = admin.firestore();

/**
 * Track user activity from various sources
 * Generic endpoint that can be called by any service
 */
export const trackActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { activityType, metadata } = data;

  try {
    // Update activity based on type
    switch (activityType) {
      case 'swipe':
        await updateUserActivity(userId, 'swipe');
        break;
      case 'chat':
        await updateUserActivity(userId, 'chat');
        break;
      case 'purchase':
        await updateUserActivity(userId, 'purchase');
        break;
      case 'login':
      case 'app_open':
      case 'general':
      default:
        await updateUserActivity(userId);
        break;
    }

    // Recalculate segment if activity might affect churn risk
    if (['swipe', 'chat', 'purchase'].includes(activityType)) {
      await updateUserSegmentAndChurnScore(userId);
    }

    console.log(`[Activity] Tracked ${activityType} for user ${userId}`);

    return {
      success: true,
      activityType,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[Activity] Error tracking activity:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Firestore trigger: Track swipe activity
 */
export const onSwipeCreated = functions.firestore
  .document('swipes/{swipeId}')
  .onCreate(async (snapshot, context) => {
    try {
      const swipeData = snapshot.data();
      const userId = swipeData.userId;

      if (!userId) return;

      await updateUserActivity(userId, 'swipe');
      console.log(`[Activity] Tracked swipe for user ${userId}`);
    } catch (error) {
      console.error('[Activity] Error in swipe trigger:', error);
    }
  });

/**
 * Firestore trigger: Track chat message activity
 */
export const onChatMessageCreated = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    try {
      const messageData = snapshot.data();
      const senderId = messageData.senderId;

      if (!senderId) return;

      await updateUserActivity(senderId, 'chat');
      console.log(`[Activity] Tracked chat for user ${senderId}`);
    } catch (error) {
      console.error('[Activity] Error in chat trigger:', error);
    }
  });

/**
 * Firestore trigger: Track token purchase activity
 */
export const onTokenPurchaseCreated = functions.firestore
  .document('transactions/{transactionId}')
  .onCreate(async (snapshot, context) => {
    try {
      const transactionData = snapshot.data();
      const userId = transactionData.senderUid || transactionData.receiverUid;
      const transactionType = transactionData.transactionType;

      if (!userId) return;

      // Only track purchases, not all transactions
      if (transactionType === 'purchase' || transactionType === 'tip') {
        await updateUserActivity(userId, 'purchase');
        console.log(`[Activity] Tracked purchase for user ${userId}`);
      }
    } catch (error) {
      console.error('[Activity] Error in purchase trigger:', error);
    }
  });

/**
 * Firestore trigger: Track calendar booking activity
 */
export const onCalendarBookingCreated = functions.firestore
  .document('calendarBookings/{bookingId}')
  .onCreate(async (snapshot, context) => {
    try {
      const bookingData = snapshot.data();
      const bookerUserId = bookingData.bookerUserId;

      if (!bookerUserId) return;

      await updateUserActivity(bookerUserId, 'purchase');
      console.log(`[Activity] Tracked calendar booking for user ${bookerUserId}`);
    } catch (error) {
      console.error('[Activity] Error in booking trigger:', error);
    }
  });

/**
 * Firestore trigger: Track event ticket purchase activity
 */
export const onEventTicketCreated = functions.firestore
  .document('eventTickets/{ticketId}')
  .onCreate(async (snapshot, context) => {
    try {
      const ticketData = snapshot.data();
      const userId = ticketData.userId;

      if (!userId) return;

      await updateUserActivity(userId, 'purchase');
      console.log(`[Activity] Tracked event ticket for user ${userId}`);
    } catch (error) {
      console.error('[Activity] Error in event ticket trigger:', error);
    }
  });

/**
 * Track call activity
 * Called when a call starts or ends
 */
export const trackCallActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { callId, eventType } = data; // eventType: 'start' | 'end'

  try {
    // Update activity for both call start and end
    await updateUserActivity(userId, 'chat'); // Calls count as chat activity
    
    console.log(`[Activity] Tracked call ${eventType} for user ${userId}`);

    return {
      success: true,
      eventType,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[Activity] Error tracking call:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Batch activity update
 * For bulk tracking of activities (e.g., during migrations)
 */
export const batchUpdateActivities = functions.https.onCall(async (data, context) => {
  // Admin only - add authentication check
  
  const { userIds } = data;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'userIds array required');
  }

  if (userIds.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'Max 100 users per batch');
  }

  try {
    let updated = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        await updateUserActivity(userId);
        updated++;
      } catch (error) {
        console.error(`[Activity] Error updating user ${userId}:`, error);
        errors++;
      }
    }

    return {
      success: true,
      updated,
      errors,
      total: userIds.length,
    };
  } catch (error: any) {
    console.error('[Activity] Error in batch update:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get activity summary for user (for debugging/admin)
 */
export const getActivitySummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  // Users can only view their own summary (unless admin)
  if (userId !== context.auth.uid) {
    // TODO: Add admin check here
    throw new functions.https.HttpsError('permission-denied', 'Cannot view other users\' activity');
  }

  try {
    const retentionRef = db.collection('userRetention').doc(userId);
    const retentionSnap = await retentionRef.get();

    if (!retentionSnap.exists) {
      return {
        success: false,
        message: 'No retention profile found',
      };
    }

    const profile = retentionSnap.data();

    // Calculate days since activities
    const now = Date.now();
    const msPerDay = 1000 * 60 * 60 * 24;

    const daysSinceActive = (now - profile.lastActiveAt.toMillis()) / msPerDay;
    const daysSinceSwipe = profile.lastSwipeAt
      ? (now - profile.lastSwipeAt.toMillis()) / msPerDay
      : null;
    const daysSinceChat = profile.lastChatAt
      ? (now - profile.lastChatAt.toMillis()) / msPerDay
      : null;
    const daysSincePurchase = profile.lastPurchaseAt
      ? (now - profile.lastPurchaseAt.toMillis()) / msPerDay
      : null;

    return {
      success: true,
      summary: {
        lastActiveAt: profile.lastActiveAt.toDate().toISOString(),
        daysSinceActive: Math.floor(daysSinceActive),
        lastSwipeAt: profile.lastSwipeAt ? profile.lastSwipeAt.toDate().toISOString() : null,
        daysSinceSwipe: daysSinceSwipe ? Math.floor(daysSinceSwipe) : null,
        lastChatAt: profile.lastChatAt ? profile.lastChatAt.toDate().toISOString() : null,
        daysSinceChat: daysSinceChat ? Math.floor(daysSinceChat) : null,
        lastPurchaseAt: profile.lastPurchaseAt ? profile.lastPurchaseAt.toDate().toISOString() : null,
        daysSincePurchase: daysSincePurchase ? Math.floor(daysSincePurchase) : null,
        daysActive7: profile.daysActive7,
        daysActive30: profile.daysActive30,
        segment: profile.segment,
        riskOfChurn: profile.riskOfChurn,
      },
    };
  } catch (error: any) {
    console.error('[Activity] Error getting summary:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 301B - Activity Tracker Bridge initialized');