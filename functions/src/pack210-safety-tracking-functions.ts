/**
 * PACK 210: Panic Button + Trusted Contact + Live Safety Tracking
 * Cloud Functions callable endpoints for safety tracking
 */

import * as functions from 'firebase-functions';
import {
  startSafetySession,
  endSafetySession,
  updateLocation,
  manageTrustedContact,
  removeTrustedContact,
  triggerPanicAlert,
  scheduleSafetyCheck,
  respondToSafetyCheck,
  getActiveSafetySessions,
  getPanicAlerts,
  resolvePanicAlert,
} from './pack210-safety-tracking-engine';
import {
  PanicAlertTier,
  PanicAlertStatus,
  TrustedContactRelationship,
} from './pack210-safety-tracking-types';

// ============================================================================
// USER FUNCTIONS - Safety Session Management
// ============================================================================

/**
 * Start safety tracking session after QR check-in
 */
export const pack210_startSafetySession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await startSafetySession({
      userId,
      bookingId: data.bookingId,
      eventId: data.eventId,
      attendeeId: data.attendeeId,
      venueLocation: data.venueLocation,
      otherUserId: data.otherUserId,
      scheduledEndTime: data.scheduledEndTime ? new Date(data.scheduledEndTime) : undefined,
      deviceInfo: data.deviceInfo,
    });

    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error('Error starting safety session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * End safety tracking session
 */
export const pack210_endSafetySession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await endSafetySession({
      sessionId: data.sessionId,
      userId,
      endReason: data.endReason || 'USER_ENDED',
    });

    return result;
  } catch (error: any) {
    console.error('Error ending safety session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update location during active safety session
 */
export const pack210_updateLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await updateLocation({
      sessionId: data.sessionId,
      userId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      altitude: data.altitude,
      speed: data.speed,
      heading: data.heading,
      batteryLevel: data.batteryLevel,
    });

    return result;
  } catch (error: any) {
    console.error('Error updating location:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// USER FUNCTIONS - Trusted Contact Management
// ============================================================================

/**
 * Add or update trusted contact
 */
export const pack210_manageTrustedContact = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Validate relationship enum
  if (!Object.values(TrustedContactRelationship).includes(data.relationship)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid relationship type'
    );
  }

  try {
    const result = await manageTrustedContact({
      userId,
      contactId: data.contactId,
      name: data.name,
      phoneNumber: data.phoneNumber,
      phoneCountryCode: data.phoneCountryCode,
      email: data.email,
      telegram: data.telegram,
      whatsapp: data.whatsapp,
      relationship: data.relationship as TrustedContactRelationship,
      isPrimary: data.isPrimary || false,
      receiveTrackingLinks: data.receiveTrackingLinks ?? true,
      receivePanicAlerts: data.receivePanicAlerts ?? true,
      receiveAutoAlerts: data.receiveAutoAlerts ?? true,
    });

    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error('Error managing trusted contact:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Remove trusted contact
 */
export const pack210_removeTrustedContact = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await removeTrustedContact({
      userId,
      contactId: data.contactId,
    });

    return result;
  } catch (error: any) {
    console.error('Error removing trusted contact:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's trusted contacts
 */
export const pack210_getTrustedContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const { db } = await import('./init');
    
    const contactsSnap = await db
      .collection('trusted_contacts')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    const contacts = contactsSnap.docs.map(doc => ({
      contactId: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      contacts,
    };
  } catch (error: any) {
    console.error('Error getting trusted contacts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// USER FUNCTIONS - Panic Alert System
// ============================================================================

/**
 * Trigger panic alert (Tier 1 or Tier 2)
 */
export const pack210_triggerPanicAlert = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Validate tier
  if (!Object.values(PanicAlertTier).includes(data.tier)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid panic tier');
  }

  try {
    const result = await triggerPanicAlert({
      sessionId: data.sessionId,
      userId,
      tier: data.tier as PanicAlertTier,
      currentLocation: data.currentLocation,
      deviceInfo: data.deviceInfo,
    });

    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error('Error triggering panic alert:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// USER FUNCTIONS - Safety Check System
// ============================================================================

/**
 * Respond to "Are You Safe?" safety check
 */
export const pack210_respondToSafetyCheck = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Validate response
  if (!['SAFE', 'NEED_HELP'].includes(data.response)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid response');
  }

  try {
    const result = await respondToSafetyCheck({
      timerId: data.timerId,
      userId,
      response: data.response,
    });

    return result;
  } catch (error: any) {
    console.error('Error responding to safety check:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get active safety session for user
 */
export const pack210_getActiveSafetySession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const { db } = await import('./init');
    
    const sessionsSnap = await db
      .collection('safety_sessions')
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (sessionsSnap.empty) {
      return {
        success: true,
        session: null,
      };
    }

    return {
      success: true,
      session: {
        sessionId: sessionsSnap.docs[0].id,
        ...sessionsSnap.docs[0].data(),
      },
    };
  } catch (error: any) {
    console.error('Error getting active safety session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// ADMIN FUNCTIONS - Safety Team Dashboard
// ============================================================================

/**
 * Get all active safety sessions (admin only)
 */
export const pack210_admin_getActiveSessions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify admin or safety team role
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.roles?.admin && !userData?.roles?.safety_team) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or safety team access required');
  }

  try {
    const sessions = await getActiveSafetySessions({
      limit: data.limit || 50,
    });

    return {
      success: true,
      sessions,
    };
  } catch (error: any) {
    console.error('Error getting active sessions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get panic alerts (admin only)
 */
export const pack210_admin_getPanicAlerts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify admin or safety team role
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.roles?.admin && !userData?.roles?.safety_team) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or safety team access required');
  }

  try {
    const alerts = await getPanicAlerts({
      status: data.status as PanicAlertStatus | undefined,
      tier: data.tier as PanicAlertTier | undefined,
      limit: data.limit || 50,
    });

    return {
      success: true,
      alerts,
    };
  } catch (error: any) {
    console.error('Error getting panic alerts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Resolve panic alert (safety team only)
 */
export const pack210_admin_resolvePanicAlert = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify admin or safety team role
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.roles?.admin && !userData?.roles?.safety_team) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or safety team access required');
  }

  try {
    const result = await resolvePanicAlert({
      alertId: data.alertId,
      resolvedBy: context.auth.uid,
      resolution: data.resolution,
      notes: data.notes,
    });

    return result;
  } catch (error: any) {
    console.error('Error resolving panic alert:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get safety event logs (admin only)
 */
export const pack210_admin_getSafetyLogs = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify admin or safety team role
  const { db } = await import('./init');
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.roles?.admin && !userData?.roles?.safety_team) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or safety team access required');
  }

  try {
    let query = db
      .collection('safety_event_log')
      .orderBy('createdAt', 'desc')
      .limit(data.limit || 100);

    if (data.sessionId) {
      query = query.where('sessionId', '==', data.sessionId) as any;
    }

    if (data.userId) {
      query = query.where('userId', '==', data.userId) as any;
    }

    if (data.requiresReview !== undefined) {
      query = query.where('requiresReview', '==', data.requiresReview) as any;
    }

    const logsSnap = await query.get();

    const logs = logsSnap.docs.map(doc => ({
      logId: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      logs,
    };
  } catch (error: any) {
    console.error('Error getting safety logs:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// SCHEDULED FUNCTIONS - Maintenance & Monitoring
// ============================================================================

/**
 * Check for expired safety sessions (runs every 5 minutes)
 * Sessions without heartbeat for >10 minutes get flagged
 */
export const pack210_checkExpiredSessions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const { db, serverTimestamp } = await import('./init');
    
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const expiredSessionsSnap = await db
        .collection('safety_sessions')
        .where('status', '==', 'ACTIVE')
        .where('lastHeartbeat', '<', tenMinutesAgo)
        .get();

      console.log(`Found ${expiredSessionsSnap.size} expired sessions`);

      const batch = db.batch();
      
      expiredSessionsSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'EXPIRED',
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      return { success: true, expiredCount: expiredSessionsSnap.size };
    } catch (error) {
      console.error('Error checking expired sessions:', error);
      throw error;
    }
  });

/**
 * Process pending safety checks (runs every minute)
 */
export const pack210_processSafetyChecks = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const { db, serverTimestamp } = await import('./init');
    
    try {
      const now = new Date();
      
      // Get safety checks that are scheduled for now or past
      const pendingChecksSnap = await db
        .collection('safety_check_timers')
        .where('status', '==', 'SCHEDULED')
        .where('scheduledAt', '<=', now)
        .limit(10)
        .get();

      console.log(`Processing ${pendingChecksSnap.size} safety checks`);

      // TODO: Send actual notifications to users
      // For MVP, just mark as sent
      const batch = db.batch();
      
      pendingChecksSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'SENT',
          sentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      return { success: true, processedCount: pendingChecksSnap.size };
    } catch (error) {
      console.error('Error processing safety checks:', error);
      throw error;
    }
  });

/**
 * Check for no-response safety checks (runs every 2 minutes)
 * If user doesn't respond within 5 minutes, trigger Tier 1 alert
 */
export const pack210_checkNoResponseSafetyChecks = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async (context) => {
    const { db } = await import('./init');
    
    try {
      const now = new Date();
      
      // Get safety checks that passed response deadline without response
      const noResponseChecksSnap = await db
        .collection('safety_check_timers')
        .where('status', '==', 'SENT')
        .where('responseDeadline', '<', now)
        .limit(10)
        .get();

      console.log(`Found ${noResponseChecksSnap.size} no-response safety checks`);

      for (const doc of noResponseChecksSnap.docs) {
        const timer = doc.data();
        
        // Don't process if already triggered auto-alert
        if (timer.autoAlertTriggered) {
          continue;
        }

        // Get session to trigger alert
        const sessionSnap = await db.collection('safety_sessions').doc(timer.sessionId).get();
        
        if (!sessionSnap.exists) {
          continue;
        }

        const session = sessionSnap.data();

        // Only trigger if session is still active
        if (session?.status === 'ACTIVE' && session.trustedContactId) {
          // Trigger Tier 1 silent alert to trusted contact
          try {
            await triggerPanicAlert({
              sessionId: timer.sessionId,
              userId: timer.userId,
              tier: PanicAlertTier.TIER_1_SILENT,
              currentLocation: session.venueLocation,
            });

            // Update timer
            const { serverTimestamp: timestamp } = await import('./init');
            await doc.ref.update({
              status: 'NO_RESPONSE',
              autoAlertTriggered: true,
              trustedContactNotified: true,
              updatedAt: timestamp(),
            });
          } catch (error) {
            console.error(`Failed to trigger auto-alert for timer ${doc.id}:`, error);
          }
        }
      }

      return { success: true, processedCount: noResponseChecksSnap.size };
    } catch (error) {
      console.error('Error checking no-response safety checks:', error);
      throw error;
    }
  });

/**
 * Clean up old location tracking data (runs daily)
 * Deletes location points older than 30 days
 */
export const pack210_cleanupOldLocationData = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const { db } = await import('./init');
    
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const oldLocationSnap = await db
        .collection('location_tracking')
        .where('timestamp', '<', thirtyDaysAgo)
        .limit(500) // Process in batches
        .get();

      console.log(`Cleaning up ${oldLocationSnap.size} old location points`);

      const batch = db.batch();
      
      oldLocationSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return { success: true, deletedCount: oldLocationSnap.size };
    } catch (error) {
      console.error('Error cleaning up old location data:', error);
      throw error;
    }
  });