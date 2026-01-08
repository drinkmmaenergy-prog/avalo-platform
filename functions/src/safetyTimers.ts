/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Backend Cloud Functions for safety timers and panic button
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Duration options in minutes
const ALLOWED_DURATIONS = [30, 60, 90];

// TTL for old records (30 days)
const TTL_DAYS = 30;

/**
 * Create a new safety timer
 */
export const createSafetyTimer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { durationMinutes, note, trustedContacts } = data;

  // Validate input
  if (!durationMinutes || !ALLOWED_DURATIONS.includes(durationMinutes)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Duration must be one of: ${ALLOWED_DURATIONS.join(', ')} minutes`
    );
  }

  if (!note || typeof note !== 'string' || note.length > 200) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Note is required and must be less than 200 characters'
    );
  }

  if (!Array.isArray(trustedContacts) || trustedContacts.length > 5) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Trusted contacts must be an array with max 5 contacts'
    );
  }

  try {
    // Check if user already has an active timer
    const activeTimers = await db
      .collection('safety_timers')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    if (!activeTimers.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You already have an active safety timer. Complete or cancel it first.'
      );
    }

    const now = admin.firestore.Timestamp.now();
    const durationSeconds = durationMinutes * 60;
    const expiresAt = new admin.firestore.Timestamp(
      now.seconds + durationSeconds,
      now.nanoseconds
    );

    // Get last known location from geoshare if available
    let lastKnownLocation = null;
    try {
      // Try to get current location from geoshare session
      const geoshareSessions = await db
        .collection('geoshare_sessions')
        .where('userA', '==', userId)
        .where('status', '==', 'ACTIVE')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!geoshareSessions.empty) {
        const session = geoshareSessions.docs[0];
        const locations = await db
          .collection('geoshare_sessions')
          .doc(session.id)
          .collection('locations')
          .where('userId', '==', userId)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        if (!locations.empty) {
          const loc = locations.docs[0].data();
          lastKnownLocation = {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp,
          };
        }
      }
    } catch (error) {
      console.log('Could not fetch location from geoshare:', error);
      // Continue without location - it's optional
    }

    // Create the safety timer
    const timerRef = await db.collection('safety_timers').add({
      userId,
      trustedContacts,
      durationSeconds,
      status: 'active',
      createdAt: now,
      expiresAt,
      note,
      lastKnownLocation,
    });

    console.log(`[SafetyTimer] Created timer ${timerRef.id} for user ${userId}, expires at ${expiresAt.toDate()}`);

    return {
      success: true,
      timerId: timerRef.id,
      expiresAt: expiresAt.toDate().toISOString(),
      message: 'Safety timer created successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('[SafetyTimer] Error creating timer:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check in on a safety timer (mark as completed_ok)
 */
export const checkInSafetyTimer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { timerId } = data;

  if (!timerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Timer ID is required');
  }

  try {
    const timerRef = db.collection('safety_timers').doc(timerId);
    const timerDoc = await timerRef.get();

    if (!timerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Timer not found');
    }

    const timer = timerDoc.data();

    if (timer?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this timer');
    }

    if (timer?.status !== 'active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Timer is already ${timer?.status}`
      );
    }

    const now = admin.firestore.Timestamp.now();

    // Update timer status
    await timerRef.update({
      status: 'completed_ok',
      completedAt: now,
    });

    // Log the successful check-in
    await db.collection('safety_events').add({
      userId,
      type: 'timer_completed_ok',
      timerId,
      createdAt: now,
      notificationsSent: false,
      trustedContactsNotified: [],
    });

    console.log(`[SafetyTimer] User ${userId} checked in on timer ${timerId}`);

    return {
      success: true,
      message: 'Successfully checked in',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('[SafetyTimer] Error checking in:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cancel a safety timer
 */
export const cancelSafetyTimer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { timerId } = data;

  if (!timerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Timer ID is required');
  }

  try {
    const timerRef = db.collection('safety_timers').doc(timerId);
    const timerDoc = await timerRef.get();

    if (!timerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Timer not found');
    }

    const timer = timerDoc.data();

    if (timer?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this timer');
    }

    if (timer?.status !== 'active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Timer is already ${timer?.status}`
      );
    }

    const now = admin.firestore.Timestamp.now();

    await timerRef.update({
      status: 'cancelled',
      cancelledAt: now,
    });

    console.log(`[SafetyTimer] User ${userId} cancelled timer ${timerId}`);

    return {
      success: true,
      message: 'Timer cancelled successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('[SafetyTimer] Error cancelling timer:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Trigger panic button
 */
export const triggerPanic = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { lastKnownLocation } = data;

  try {
    const now = admin.firestore.Timestamp.now();

    // Get user's active timer to find trusted contacts
    const activeTimers = await db
      .collection('safety_timers')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    let trustedContacts: string[] = [];
    if (!activeTimers.empty) {
      const timer = activeTimers.docs[0].data();
      trustedContacts = timer.trustedContacts || [];
    }

    // Create panic event
    const eventRef = await db.collection('safety_events').add({
      userId,
      type: 'panic',
      createdAt: now,
      lastKnownLocation: lastKnownLocation || null,
      notificationsSent: trustedContacts.length > 0,
      trustedContactsNotified: trustedContacts,
    });

    // Send notifications to trusted contacts
    if (trustedContacts.length > 0) {
      // Get user info for notification
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const userName = userData?.displayName || userData?.name || 'A user';

      // Create notification documents for each trusted contact
      const notificationPromises = trustedContacts.map((contactId) =>
        db.collection('notifications').add({
          userId: contactId,
          type: 'safety_panic',
          title: 'Safety Alert',
          body: `${userName} has triggered their panic button. Check their status in the app.`,
          data: {
            eventId: eventRef.id,
            alertUserId: userId,
            alertUserName: userName,
            type: 'panic',
          },
          createdAt: now,
          read: false,
        })
      );

      await Promise.all(notificationPromises);

      console.log(`[SafetyTimer] Panic button triggered by ${userId}, notified ${trustedContacts.length} contacts`);
    }

    return {
      success: true,
      eventId: eventRef.id,
      message: 'Panic alert sent successfully',
    };
  } catch (error: any) {
    console.error('[SafetyTimer] Error triggering panic:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's safety timers
 */
export const getUserSafetyTimers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { limit = 10, includeArchived = true } = data;

  try {
    let query = db
      .collection('safety_timers')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (!includeArchived) {
      query = query.where('status', '==', 'active');
    }

    const timersSnapshot = await query.get();

    const timers = timersSnapshot.docs.map((doc) => {
      const data = doc.data();
      const now = Date.now();
      const expiresAt = data.expiresAt.toDate().getTime();
      const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

      return {
        timerId: doc.id,
        status: data.status,
        durationMinutes: Math.floor(data.durationSeconds / 60),
        remainingSeconds,
        note: data.note,
        trustedContactsCount: data.trustedContacts?.length || 0,
        createdAt: data.createdAt.toDate().toISOString(),
        expiresAt: data.expiresAt.toDate().toISOString(),
      };
    });

    return {
      success: true,
      timers,
    };
  } catch (error: any) {
    console.error('[SafetyTimer] Error getting timers:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get safety alerts for trusted contacts
 */
export const getSafetyAlerts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { limit = 20 } = data;

  try {
    // Get events where user is in trustedContactsNotified
    const eventsSnapshot = await db
      .collection('safety_events')
      .where('trustedContactsNotified', 'array-contains', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const alertsPromises = eventsSnapshot.docs.map(async (doc) => {
      const eventData = doc.data();

      // Get user info
      const userDoc = await db.collection('users').doc(eventData.userId).get();
      const userData = userDoc.data();

      let note = '';
      if (eventData.timerId) {
        const timerDoc = await db.collection('safety_timers').doc(eventData.timerId).get();
        if (timerDoc.exists) {
          note = timerDoc.data()?.note || '';
        }
      }

      return {
        id: doc.id,
        type: eventData.type === 'panic' ? 'panic_button' : 'timer_expired',
        userId: eventData.userId,
        userName: userData?.displayName || userData?.name || 'Unknown User',
        userProfilePicture: userData?.profilePicture || null,
        createdAt: eventData.createdAt.toDate().toISOString(),
        note,
        lastKnownLocation: eventData.lastKnownLocation || null,
        timerId: eventData.timerId || null,
        eventId: doc.id,
      };
    });

    const alerts = await Promise.all(alertsPromises);

    return {
      success: true,
      alerts,
    };
  } catch (error: any) {
    console.error('[SafetyTimer] Error getting alerts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled function to check for expired timers
 * Runs every 1 minute
 */
export const checkExpiredSafetyTimers = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    try {
      // Find all active timers that have expired
      const expiredTimers = await db
        .collection('safety_timers')
        .where('status', '==', 'active')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredTimers.empty) {
        console.log('[SafetyTimer] No expired timers found');
        return null;
      }

      console.log(`[SafetyTimer] Found ${expiredTimers.size} expired timers`);

      const updatePromises = expiredTimers.docs.map(async (doc) => {
        const timer = doc.data();

        // Update timer status
        await doc.ref.update({
          status: 'expired_no_checkin',
        });

        // Create safety event
        await db.collection('safety_events').add({
          userId: timer.userId,
          type: 'timer_expired_no_checkin',
          timerId: doc.id,
          createdAt: now,
          lastKnownLocation: timer.lastKnownLocation || null,
          notificationsSent: timer.trustedContacts.length > 0,
          trustedContactsNotified: timer.trustedContacts,
        });

        // Send notifications to trusted contacts
        if (timer.trustedContacts && timer.trustedContacts.length > 0) {
          const userDoc = await db.collection('users').doc(timer.userId).get();
          const userData = userDoc.data();
          const userName = userData?.displayName || userData?.name || 'A user';

          const notificationPromises = timer.trustedContacts.map((contactId: string) =>
            db.collection('notifications').add({
              userId: contactId,
              type: 'safety_timer_expired',
              title: 'Safety Timer Expired',
              body: `${userName} did not check in after their meeting. Last known location available in app.`,
              data: {
                timerId: doc.id,
                alertUserId: timer.userId,
                alertUserName: userName,
                type: 'timer_expired',
              },
              createdAt: now,
              read: false,
            })
          );

          await Promise.all(notificationPromises);

          console.log(`[SafetyTimer] Timer ${doc.id} expired, notified ${timer.trustedContacts.length} contacts`);
        }
      });

      await Promise.all(updatePromises);

      console.log(`[SafetyTimer] Processed ${expiredTimers.size} expired timers`);
      return null;
    } catch (error) {
      console.error('[SafetyTimer] Error checking expired timers:', error);
      return null;
    }
  });

/**
 * Cleanup old safety records
 * Runs daily at 3 AM UTC
 */
export const cleanupOldSafetyRecords = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const cutoffDate = new admin.firestore.Timestamp(
      admin.firestore.Timestamp.now().seconds - TTL_DAYS * 24 * 60 * 60,
      0
    );

    try {
      // Delete old timers
      const oldTimers = await db
        .collection('safety_timers')
        .where('createdAt', '<', cutoffDate)
        .get();

      if (!oldTimers.empty) {
        const deleteTimerPromises = oldTimers.docs.map((doc) => doc.ref.delete());
        await Promise.all(deleteTimerPromises);
        console.log(`[SafetyTimer] Deleted ${oldTimers.size} old timers`);
      }

      // Delete old events
      const oldEvents = await db
        .collection('safety_events')
        .where('createdAt', '<', cutoffDate)
        .get();

      if (!oldEvents.empty) {
        const deleteEventPromises = oldEvents.docs.map((doc) => doc.ref.delete());
        await Promise.all(deleteEventPromises);
        console.log(`[SafetyTimer] Deleted ${oldEvents.size} old events`);
      }

      return null;
    } catch (error) {
      console.error('[SafetyTimer] Error cleaning up old records:', error);
      return null;
    }
  });