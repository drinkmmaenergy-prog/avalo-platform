/**
 * PACK 118 — Virtual Events Moderator & Live Session Management
 * 
 * Host + Assistant Controls | Real-Time Moderation
 * Safety Enforcement | Recording Management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  VirtualEvent,
  VirtualEventStatus,
  LiveSessionState,
  ModeratorActionRequest,
  ModeratorAction,
} from './types/virtualEvents.types';

const db = getFirestore();

// ============================================================================
// MODERATOR PERMISSIONS
// ============================================================================

/**
 * Check if user has moderator permissions for event
 */
async function hasModeratorPermissions(
  userId: string,
  event: VirtualEvent
): Promise<{ isModerator: boolean; role: 'host' | 'assistant' | 'none' }> {
  if (event.hostUserId === userId) {
    return { isModerator: true, role: 'host' };
  }

  if (event.assistants.includes(userId)) {
    return { isModerator: true, role: 'assistant' };
  }

  return { isModerator: false, role: 'none' };
}

// ============================================================================
// ADD/REMOVE ASSISTANTS
// ============================================================================

/**
 * Add assistant/co-host to event (host only)
 */
export const pack118_addAssistant = onCall<{ eventId: string; assistantUserId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, assistantUserId } = request.data;

    // 1. Get event
    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify host
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can add assistants');
    }

    // 3. Verify assistant is enrolled
    const attendeeSnapshot = await db
      .collection('virtual_event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', assistantUserId)
      .limit(1)
      .get();

    if (attendeeSnapshot.empty) {
      throw new HttpsError(
        'failed-precondition',
        'User must be enrolled in event to become assistant'
      );
    }

    // 4. Add to assistants list
    await db.collection('virtual_events').doc(eventId).update({
      assistants: FieldValue.arrayUnion(assistantUserId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Assistant added successfully' };
  }
);

/**
 * Remove assistant from event (host only)
 */
export const pack118_removeAssistant = onCall<{ eventId: string; assistantUserId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, assistantUserId } = request.data;

    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can remove assistants');
    }

    await db.collection('virtual_events').doc(eventId).update({
      assistants: FieldValue.arrayRemove(assistantUserId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Assistant removed successfully' };
  }
);

// ============================================================================
// START LIVE SESSION
// ============================================================================

/**
 * Start live session (host only)
 */
export const pack118_startLiveSession = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // 1. Get event
    const eventRef = db.collection('virtual_events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify host
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can start session');
    }

    // 3. Check status
    if (event.status !== VirtualEventStatus.UPCOMING) {
      throw new HttpsError('failed-precondition', 'Event already started or completed');
    }

    // 4. Check timing (can start up to 15 min early)
    const now = Date.now();
    const startTime = event.startTime.toMillis();
    const fifteenMinutesEarly = startTime - (15 * 60 * 1000);

    if (now < fifteenMinutesEarly) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot start session more than 15 minutes before scheduled time'
      );
    }

    // 5. Get waiting room users
    const sessionRef = db.collection('live_sessions').doc(eventId);
    const sessionDoc = await sessionRef.get();
    const waitingRoomUsers = sessionDoc.exists
      ? (sessionDoc.data()?.waitingRoomUsers || [])
      : [];

    // 6. Update event status
    await eventRef.update({
      status: VirtualEventStatus.IN_PROGRESS,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 7. Create/update live session
    const liveSession: LiveSessionState = {
      eventId,
      status: 'LIVE',
      waitingRoomUsers: [],
      liveUsers: [...waitingRoomUsers, userId], // Move waiting room users to live
      roomId: `virtual_event_${eventId}`,
      signalingChannelId: `signal_${eventId}_${Date.now()}`,
      mutedUsers: [],
      removedUsers: [],
      waitingRoomOpenedAt: sessionDoc.data()?.waitingRoomOpenedAt || null,
      liveStartedAt: Timestamp.now(),
      endedAt: null,
      updatedAt: Timestamp.now(),
    };

    await sessionRef.set(liveSession);

    // 8. Update all waiting room attendees to JOINED
    const batch = db.batch();
    for (const waitingUserId of waitingRoomUsers) {
      const attendeeSnapshot = await db
        .collection('virtual_event_attendees')
        .where('eventId', '==', eventId)
        .where('userId', '==', waitingUserId)
        .limit(1)
        .get();

      if (!attendeeSnapshot.empty) {
        batch.update(attendeeSnapshot.docs[0].ref, {
          status: 'JOINED',
          joinedLiveAt: Timestamp.now(),
        });
      }
    }
    await batch.commit();

    return {
      success: true,
      message: 'Live session started',
      data: { liveSession },
    };
  }
);

// ============================================================================
// END LIVE SESSION
// ============================================================================

/**
 * End live session (host only)
 */
export const pack118_endLiveSession = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // 1. Get event
    const eventRef = db.collection('virtual_events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify host
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can end session');
    }

    // 3. Update event status
    await eventRef.update({
      status: VirtualEventStatus.COMPLETED,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 4. Update live session
    const sessionRef = db.collection('live_sessions').doc(eventId);
    await sessionRef.update({
      status: 'ENDED',
      endedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 5. Log completion
    await db.collection('system_logs').add({
      type: 'VIRTUAL_EVENT_COMPLETED',
      eventId,
      hostUserId: userId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Live session ended',
    };
  }
);

// ============================================================================
// MODERATOR ACTIONS
// ============================================================================

/**
 * Perform moderator action (mute, remove, ban)
 */
export const pack118_moderatorAction = onCall<ModeratorActionRequest, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, action, targetUserId, reason } = request.data;

    // 1. Get event
    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Check moderator permissions
    const permissions = await hasModeratorPermissions(userId, event);
    if (!permissions.isModerator) {
      throw new HttpsError('permission-denied', 'Moderator access required');
    }

    // 3. Get live session
    const sessionRef = db.collection('live_sessions').doc(eventId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists || sessionDoc.data()?.status !== 'LIVE') {
      throw new HttpsError('failed-precondition', 'Event is not live');
    }

    // 4. Execute action
    switch (action) {
      case ModeratorAction.MUTE_USER:
        if (!targetUserId) {
          throw new HttpsError('invalid-argument', 'Target user ID required');
        }
        await sessionRef.update({
          mutedUsers: FieldValue.arrayUnion(targetUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;

      case ModeratorAction.UNMUTE_USER:
        if (!targetUserId) {
          throw new HttpsError('invalid-argument', 'Target user ID required');
        }
        await sessionRef.update({
          mutedUsers: FieldValue.arrayRemove(targetUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;

      case ModeratorAction.REMOVE_USER:
        if (!targetUserId) {
          throw new HttpsError('invalid-argument', 'Target user ID required');
        }
        await sessionRef.update({
          liveUsers: FieldValue.arrayRemove(targetUserId),
          removedUsers: FieldValue.arrayUnion(targetUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;

      case ModeratorAction.BAN_USER:
        // Only host can ban
        if (permissions.role !== 'host') {
          throw new HttpsError('permission-denied', 'Only host can ban users');
        }
        if (!targetUserId) {
          throw new HttpsError('invalid-argument', 'Target user ID required');
        }
        // Remove from session
        await sessionRef.update({
          liveUsers: FieldValue.arrayRemove(targetUserId),
          removedUsers: FieldValue.arrayUnion(targetUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Create ban record (future: prevent joining host's future events)
        await db.collection('event_bans').add({
          hostUserId: event.hostUserId,
          bannedUserId: targetUserId,
          eventId,
          reason: reason || 'Inappropriate behavior',
          createdAt: FieldValue.serverTimestamp(),
        });
        break;

      case ModeratorAction.END_SESSION:
        // Only host can end session
        if (permissions.role !== 'host') {
          throw new HttpsError('permission-denied', 'Only host can end session');
        }
        await sessionRef.update({
          status: 'ENDED',
          endedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        await db.collection('virtual_events').doc(eventId).update({
          status: VirtualEventStatus.COMPLETED,
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;

      default:
        throw new HttpsError('invalid-argument', 'Invalid moderator action');
    }

    // 5. Log action
    await db.collection('system_logs').add({
      type: 'MODERATOR_ACTION',
      eventId,
      moderatorId: userId,
      moderatorRole: permissions.role,
      action,
      targetUserId: targetUserId || null,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Action ${action} completed successfully`,
    };
  }
);

// ============================================================================
// JOIN LIVE SESSION
// ============================================================================

/**
 * Join live session (enrolled users only)
 */
export const pack118_joinLiveSession = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // 1. Verify enrollment
    const attendeeSnapshot = await db
      .collection('virtual_event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (attendeeSnapshot.empty) {
      throw new HttpsError('permission-denied', 'Not enrolled in this event');
    }

    // 2. Check if banned
    const banSnapshot = await db
      .collection('event_bans')
      .where('eventId', '==', eventId)
      .where('bannedUserId', '==', userId)
      .limit(1)
      .get();

    if (!banSnapshot.empty) {
      throw new HttpsError('permission-denied', 'You have been banned from this event');
    }

    // 3. Get session
    const sessionRef = db.collection('live_sessions').doc(eventId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new HttpsError('failed-precondition', 'Live session not started yet');
    }

    const session = sessionDoc.data() as LiveSessionState;

    if (session.status !== 'LIVE') {
      throw new HttpsError('failed-precondition', 'Event is not currently live');
    }

    // 4. Check if removed
    if (session.removedUsers.includes(userId)) {
      throw new HttpsError('permission-denied', 'You have been removed from this event');
    }

    // 5. Add to live users
    await sessionRef.update({
      liveUsers: FieldValue.arrayUnion(userId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. Update attendee status
    const attendeeDoc = attendeeSnapshot.docs[0];
    await attendeeDoc.ref.update({
      status: 'JOINED',
      joinedLiveAt: Timestamp.now(),
    });

    return {
      success: true,
      message: 'Joined live session',
      data: {
        roomId: session.roomId,
        signalingChannelId: session.signalingChannelId,
      },
    };
  }
);

// ============================================================================
// LEAVE LIVE SESSION
// ============================================================================

/**
 * Leave live session
 */
export const pack118_leaveLiveSession = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // Remove from live users
    await db.collection('live_sessions').doc(eventId).update({
      liveUsers: FieldValue.arrayRemove(userId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Left live session',
    };
  }
);

// ============================================================================
// GET LIVE SESSION STATE
// ============================================================================

/**
 * Get current live session state (for real-time updates)
 */
export const pack118_getLiveSessionState = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { eventId } = request.data;

    const sessionDoc = await db.collection('live_sessions').doc(eventId).get();

    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Live session not found');
    }

    return {
      success: true,
      data: sessionDoc.data(),
    };
  }
);

// ============================================================================
// RECORDING MANAGEMENT
// ============================================================================

/**
 * Upload recording URL (host only)
 */
export const pack118_uploadRecording = onCall<{
  eventId: string;
  recordingUrl: string;
  daysAvailable?: number;
}, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, recordingUrl, daysAvailable = 30 } = request.data;

    // 1. Get event
    const eventRef = db.collection('virtual_events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify host
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can upload recording');
    }

    // 3. Verify recording was enabled
    if (!event.recordingEnabled) {
      throw new HttpsError('failed-precondition', 'Recording was not enabled for this event');
    }

    // 4. Calculate expiration
    const availableUntil = Timestamp.fromDate(
      new Date(Date.now() + daysAvailable * 24 * 60 * 60 * 1000)
    );

    // 5. Update event
    await eventRef.update({
      recordingUrl,
      recordingAvailableUntil: availableUntil,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Recording uploaded successfully',
      data: { recordingUrl, availableUntil },
    };
  }
);

/**
 * Get recording access (enrolled users only)
 */
export const pack118_getRecordingAccess = onCall<{ eventId: string }, Promise<any>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // 1. Get event
    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Check if host
    const isHost = event.hostUserId === userId;

    // 3. Check if enrolled with recording access
    let hasAccess = isHost;
    if (!isHost) {
      const attendeeSnapshot = await db
        .collection('virtual_event_attendees')
        .where('eventId', '==', eventId)
        .where('userId', '==', userId)
        .where('hasRecordingAccess', '==', true)
        .limit(1)
        .get();

      hasAccess = !attendeeSnapshot.empty;
    }

    if (!hasAccess) {
      throw new HttpsError('permission-denied', 'No recording access for this event');
    }

    // 4. Check if recording available
    if (!event.recordingUrl) {
      throw new HttpsError('not-found', 'Recording not available yet');
    }

    // 5. Check expiration
    const now = Date.now();
    const expiresAt = event.recordingAvailableUntil?.toMillis() || 0;
    if (expiresAt > 0 && now > expiresAt) {
      throw new HttpsError('failed-precondition', 'Recording has expired');
    }

    return {
      success: true,
      data: {
        recordingUrl: event.recordingUrl,
        expiresAt: event.recordingAvailableUntil,
      },
    };
  }
);