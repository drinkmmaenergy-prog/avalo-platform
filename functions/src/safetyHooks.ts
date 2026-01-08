/**
 * PACK 280 - Safety Hooks Integration Layer
 * Connects safety engine with Calendar (PACK 274) and Events (PACK 275)
 */

import {
  startLiveSession,
  triggerPanic,
  endLiveSession,
  getSafetyProfile,
} from './safetyEngine';
import { getFirestore } from 'firebase-admin/firestore';
import type {
  StartLiveSessionRequest,
  TriggerPanicRequest,
  SessionType,
  PanicContext,
} from '../../shared/src/types/safety';

const db = getFirestore();

// ============================================================================
// CALENDAR ENGINE HOOKS (PACK 274)
// ============================================================================

/**
 * Called when a calendar meeting starts (after check-in)
 * Starts live safety tracking if user has auto-tracking enabled
 */
export async function onMeetingStarted(bookingId: string): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] Meeting started for booking: ${bookingId}`);

    // 1. Get booking details
    const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      console.error(`Booking ${bookingId} not found`);
      return;
    }

    const booking = bookingDoc.data();
    const hostId = booking?.hostId;
    const guestId = booking?.guestId;

    if (!hostId || !guestId) {
      console.error(`Invalid booking data for ${bookingId}`);
      return;
    }

    // 2. Check if either user has auto-tracking enabled
    const hostProfile = await getSafetyProfile(hostId);
    const guestProfile = await getSafetyProfile(guestId);

    const shouldTrack =
      (hostProfile?.settings.autoTrackingOnMeetings) ||
      (guestProfile?.settings.autoTrackingOnMeetings);

    if (!shouldTrack) {
      console.log(`Auto-tracking not enabled for booking ${bookingId}`);
      return;
    }

    // 3. Start live session
    const sessionRequest: StartLiveSessionRequest = {
      type: 'calendar',
      hostId,
      guestId,
      bookingId,
      participants: [hostId, guestId],
    };

    const session = await startLiveSession(sessionRequest);

    // 4. Link session to booking
    await db.collection('calendarBookings').doc(bookingId).update({
      safetySessionId: session.sessionId,
    });

    console.log(`Started safety session ${session.sessionId} for booking ${bookingId}`);
  } catch (error) {
    console.error('Error in onMeetingStarted hook:', error);
  }
}

/**
 * Called when panic button is pressed during a calendar meeting
 */
export async function onCalendarPanic(
  bookingId: string,
  userId: string,
  location?: { lat: number; lng: number }
): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] PANIC triggered for booking: ${bookingId} by user: ${userId}`);

    // Get booking to find session
    const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
    const booking = bookingDoc.data();
    const sessionId = booking?.safetySessionId;

    const panicRequest: TriggerPanicRequest = {
      userId,
      context: 'calendar',
      bookingId,
      sessionId,
      location,
    };

    const result = await triggerPanic(panicRequest);

    // Update booking with panic flag
    await db.collection('calendarBookings').doc(bookingId).update({
      'safety.panicTriggered': true,
      'safety.panicTriggeredAt': new Date().toISOString(),
      'safety.panicEventId': result.panicEventId,
    });

    console.log(`Panic event ${result.panicEventId} created, ${result.notificationsSent} notifications sent`);
  } catch (error) {
    console.error('Error in onCalendarPanic hook:', error);
    throw error;
  }
}

/**
 * Called when a calendar meeting ends
 */
export async function onMeetingEnded(bookingId: string): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] Meeting ended for booking: ${bookingId}`);

    // Get booking to find session
    const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
    const booking = bookingDoc.data();
    const sessionId = booking?.safetySessionId;

    if (sessionId) {
      await endLiveSession({
        sessionId,
        reason: 'meeting_ended',
      });

      console.log(`Ended safety session ${sessionId} for booking ${bookingId}`);
    }
  } catch (error) {
    console.error('Error in onMeetingEnded hook:', error);
  }
}

// ============================================================================
// EVENTS ENGINE HOOKS (PACK 275)
// ============================================================================

/**
 * Called when a user checks in to an event
 * Starts live safety tracking if user has auto-tracking enabled
 */
export async function onEventCheckIn(
  eventId: string,
  ticketId: string,
  participantId: string
): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] Event check-in for event: ${eventId}, participant: ${participantId}`);

    // 1. Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      console.error(`Event ${eventId} not found`);
      return;
    }

    const event = eventDoc.data();
    const organizerId = event?.organizerId;

    if (!organizerId) {
      console.error(`Invalid event data for ${eventId}`);
      return;
    }

    // 2. Check if user has auto-tracking enabled
    const participantProfile = await getSafetyProfile(participantId);

    if (!participantProfile?.settings.autoTrackingOnEvents) {
      console.log(`Auto-tracking not enabled for participant ${participantId}`);
      return;
    }

    // 3. Check if session already exists for this user at this event
    const existingSessionQuery = await db
      .collection('liveSessions')
      .where('eventId', '==', eventId)
      .where('participants', 'array-contains', participantId)
      .where('endedAt', '==', null)
      .limit(1)
      .get();

    if (!existingSessionQuery.empty) {
      console.log(`Session already exists for participant ${participantId} at event ${eventId}`);
      return;
    }

    // 4. Start live session for this participant
    const sessionRequest: StartLiveSessionRequest = {
      type: 'event',
      hostId: organizerId,
      eventId,
      participants: [participantId], // Individual tracking per participant
    };

    const session = await startLiveSession(sessionRequest);

    // 5. Link session to ticket
    await db.collection('eventTickets').doc(ticketId).update({
      safetySessionId: session.sessionId,
    });

    console.log(`Started safety session ${session.sessionId} for event ${eventId}, participant ${participantId}`);
  } catch (error) {
    console.error('Error in onEventCheckIn hook:', error);
  }
}

/**
 * Called when panic button is pressed during an event
 */
export async function onEventPanic(
  eventId: string,
  userId: string,
  location?: { lat: number; lng: number }
): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] PANIC triggered at event: ${eventId} by user: ${userId}`);

    // Find user's session at this event
    const sessionQuery = await db
      .collection('liveSessions')
      .where('eventId', '==', eventId)
      .where('participants', 'array-contains', userId)
      .where('endedAt', '==', null)
      .limit(1)
      .get();

    const sessionId = sessionQuery.empty ? null : sessionQuery.docs[0].id;

    const panicRequest: TriggerPanicRequest = {
      userId,
      context: 'event',
      eventId,
      sessionId: sessionId || undefined,
      location,
    };

    const result = await triggerPanic(panicRequest);

    // Log panic in event's panic log
    await db.collection('eventPanicLogs').doc().set({
      eventId,
      userId,
      panicEventId: result.panicEventId,
      timestamp: new Date().toISOString(),
      notificationsSent: result.notificationsSent,
    });

    console.log(`Panic event ${result.panicEventId} created at event ${eventId}, ${result.notificationsSent} notifications sent`);
  } catch (error) {
    console.error('Error in onEventPanic hook:', error);
    throw error;
  }
}

/**
 * Called when an event ends
 * Ends all active safety sessions for this event
 */
export async function onEventEnded(eventId: string): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] Event ended: ${eventId}`);

    // Find all active sessions for this event
    const sessionsQuery = await db
      .collection('liveSessions')
      .where('eventId', '==', eventId)
      .where('endedAt', '==', null)
      .get();

    // End all sessions
    const endPromises = sessionsQuery.docs.map((doc) =>
      endLiveSession({
        sessionId: doc.id,
        reason: 'event_ended',
      })
    );

    await Promise.all(endPromises);

    console.log(`Ended ${sessionsQuery.size} safety sessions for event ${eventId}`);
  } catch (error) {
    console.error('Error in onEventEnded hook:', error);
  }
}

// ============================================================================
// CHAT HOOKS (PACK 268)
// ============================================================================

/**
 * Called when panic button is pressed from chat context
 * Creates a lightweight safety session for chat-only panic
 */
export async function onChatPanic(
  userId: string,
  chatPartnerId: string,
  location?: { lat: number; lng: number }
): Promise<void> {
  try {
    console.log(`[SAFETY_HOOK] PANIC triggered in chat by user: ${userId} with partner: ${chatPartnerId}`);

    // 1. Create a lightweight chat session
    const sessionRequest: StartLiveSessionRequest = {
      type: 'chat',
      hostId: userId,
      guestId: chatPartnerId,
      participants: [userId, chatPartnerId],
    };

    const session = await startLiveSession(sessionRequest);

    // 2. Trigger panic
    const panicRequest: TriggerPanicRequest = {
      userId,
      context: 'chat',
      chatPartnerId,
      sessionId: session.sessionId,
      location,
    };

    const result = await triggerPanic(panicRequest);

    console.log(`Chat panic event ${result.panicEventId} created, ${result.notificationsSent} notifications sent`);
  } catch (error) {
    console.error('Error in onChatPanic hook:', error);
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Update location for active session
 * Called periodically by mobile app during tracking
 */
export async function updateSessionLocation(
  sessionId: string,
  userId: string,
  location: { lat: number; lng: number }
): Promise<void> {
  try {
    const { updateSessionLocation: updateLocation } = await import('./safetyEngine');
    
    await updateLocation({
      sessionId,
      location,
    });
  } catch (error) {
    console.error('Error updating session location:', error);
    throw error;
  }
}

/**
 * Check if user has active safety session
 */
export async function hasActiveSession(userId: string): Promise<boolean> {
  const query = await db
    .collection('liveSessions')
    .where('participants', 'array-contains', userId)
    .where('endedAt', '==', null)
    .limit(1)
    .get();

  return !query.empty;
}

/**
 * Get active session for user
 */
export async function getActiveSession(userId: string): Promise<any | null> {
  const query = await db
    .collection('liveSessions')
    .where('participants', 'array-contains', userId)
    .where('endedAt', '==', null)
    .limit(1)
    .get();

  if (query.empty) {
    return null;
  }

  return query.docs[0].data();
}