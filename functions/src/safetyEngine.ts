/**
 * PACK 280 - Panic & Live Safety Engine
 * Core business logic for panic button, live tracking, and trusted contacts
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import type {
  SafetyProfile,
  LiveSession,
  PanicEvent,
  TrustedContact,
  SafetySettings,
  TrustedContactNotification,
  SafetySessionLog,
  CreateSafetyProfileRequest,
  UpdateSafetyProfileRequest,
  AddTrustedContactRequest,
  StartLiveSessionRequest,
  UpdateLiveSessionLocationRequest,
  TriggerPanicRequest,
  EndLiveSessionRequest,
  PanicNotificationPayload,
  SessionType,
  PanicContext,
  LocationData,
} from '../../shared/src/types/safety';

const db = getFirestore();

// ============================================================================
// SAFETY PROFILE MANAGEMENT
// ============================================================================

/**
 * Create or initialize a safety profile for a user
 */
export async function createSafetyProfile(
  request: CreateSafetyProfileRequest
): Promise<SafetyProfile> {
  const { userId, trustedContacts = [], settings } = request;

  const defaultSettings: SafetySettings = {
    autoTrackingOnMeetings: true,
    autoTrackingOnEvents: true,
    panicSendProfile: true,
    panicSendLocation: true,
    ...settings,
  };

  const profile: SafetyProfile = {
    userId,
    trustedContacts,
    settings: defaultSettings,
    lastPanicAt: null,
    lastPanicContext: 'none',
  };

  await db.collection('safetyProfiles').doc(userId).set(profile);

  return profile;
}

/**
 * Get safety profile for a user
 */
export async function getSafetyProfile(userId: string): Promise<SafetyProfile | null> {
  const doc = await db.collection('safetyProfiles').doc(userId).get();
  
  if (!doc.exists) {
    return null;
  }

  return doc.data() as SafetyProfile;
}

/**
 * Update safety profile settings
 */
export async function updateSafetyProfile(
  request: UpdateSafetyProfileRequest
): Promise<SafetyProfile> {
  const { userId, trustedContacts, settings } = request;

  const updateData: Partial<SafetyProfile> = {};

  if (trustedContacts !== undefined) {
    updateData.trustedContacts = trustedContacts;
  }

  if (settings !== undefined) {
    updateData.settings = {
      ...(await getSafetyProfile(userId))?.settings,
      ...settings,
    } as SafetySettings;
  }

  await db.collection('safetyProfiles').doc(userId).update(updateData);

  return (await getSafetyProfile(userId))!;
}

/**
 * Add a trusted contact
 */
export async function addTrustedContact(
  request: AddTrustedContactRequest
): Promise<TrustedContact> {
  const { userId, contact } = request;

  const contactId = uuidv4();
  const newContact: TrustedContact = {
    contactId,
    ...contact,
  };

  const profileRef = db.collection('safetyProfiles').doc(userId);
  await profileRef.update({
    trustedContacts: FieldValue.arrayUnion(newContact),
  });

  return newContact;
}

/**
 * Remove a trusted contact
 */
export async function removeTrustedContact(
  userId: string,
  contactId: string
): Promise<void> {
  const profile = await getSafetyProfile(userId);
  if (!profile) {
    throw new Error('Safety profile not found');
  }

  const updatedContacts = profile.trustedContacts.filter(
    (c) => c.contactId !== contactId
  );

  await db.collection('safetyProfiles').doc(userId).update({
    trustedContacts: updatedContacts,
  });
}

/**
 * Test notification to a trusted contact
 */
export async function testTrustedContact(
  userId: string,
  contactId: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getSafetyProfile(userId);
  if (!profile) {
    return { success: false, error: 'Safety profile not found' };
  }

  const contact = profile.trustedContacts.find((c) => c.contactId === contactId);
  if (!contact) {
    return { success: false, error: 'Contact not found' };
  }

  // Get user info
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const testMessage = `Test notification from Avalo Safety. ${userData?.displayName || 'User'} has added you as a trusted contact.`;

  await sendNotification(contact, testMessage, {
    panicEventId: 'TEST',
  });

  return { success: true };
}

// ============================================================================
// LIVE SESSION MANAGEMENT
// ============================================================================

/**
 * Start a new live safety tracking session
 */
export async function startLiveSession(
  request: StartLiveSessionRequest
): Promise<LiveSession> {
  const { type, hostId, guestId, bookingId, eventId, participants } = request;

  const sessionId = uuidv4();
  const now = new Date().toISOString();

  const session: LiveSession = {
    sessionId,
    type,
    bookingId: bookingId || null,
    eventId: eventId || null,
    hostId,
    guestId: guestId || null,
    participants,
    startedAt: now,
    endedAt: null,
    lastLocation: null,
    panicTriggeredBy: null,
    trustCenterStatus: 'normal',
  };

  await db.collection('liveSessions').doc(sessionId).set(session);

  // Log session start
  await logSafetySession({
    sessionId,
    userId: hostId,
    action: 'session_started',
    details: {
      type,
      participants,
    },
  });

  return session;
}

/**
 * Update location during live session
 */
export async function updateSessionLocation(
  request: UpdateLiveSessionLocationRequest
): Promise<void> {
  const { sessionId, location } = request;

  const locationData: LocationData = {
    ...location,
    updatedAt: new Date().toISOString(),
  };

  await db.collection('liveSessions').doc(sessionId).update({
    lastLocation: locationData,
  });

  // Log location update
  await logSafetySession({
    sessionId,
    userId: '', // Will be filled by caller
    action: 'location_updated',
    details: {
      location: locationData,
    },
  });
}

/**
 * End a live session
 */
export async function endLiveSession(
  request: EndLiveSessionRequest
): Promise<void> {
  const { sessionId, reason } = request;

  const now = new Date().toISOString();

  await db.collection('liveSessions').doc(sessionId).update({
    endedAt: now,
  });

  // Log session end
  await logSafetySession({
    sessionId,
    userId: '', // Will be filled by caller
    action: 'session_ended',
    details: {
      reason: reason || 'normal_completion',
    },
  });
}

/**
 * Get active sessions for a user
 */
export async function getActiveSessions(userId: string): Promise<LiveSession[]> {
  const snapshot = await db
    .collection('liveSessions')
    .where('participants', 'array-contains', userId)
    .where('endedAt', '==', null)
    .get();

  return snapshot.docs.map((doc) => doc.data() as LiveSession);
}

// ============================================================================
// PANIC BUTTON & ALERT SYSTEM
// ============================================================================

/**
 * Trigger panic alert
 */
export async function triggerPanic(
  request: TriggerPanicRequest
): Promise<{ success: boolean; panicEventId: string; notificationsSent: number }> {
  const {
    userId,
    context,
    sessionId,
    bookingId,
    eventId,
    chatPartnerId,
    location,
  } = request;

  try {
    // 1. Get user's safety profile
    const profile = await getSafetyProfile(userId);
    if (!profile) {
      throw new Error('Safety profile not found');
    }

    // 2. Create panic event
    const panicEventId = uuidv4();
    const now = new Date().toISOString();

    const locationData: LocationData | null = location
      ? {
          ...location,
          updatedAt: now,
        }
      : null;

    const panicEvent: PanicEvent = {
      eventId: panicEventId,
      userId,
      sessionId: sessionId || null,
      context,
      location: locationData,
      triggeredAt: now,
      notificationsSent: 0,
      metadata: {
        bookingId,
        eventId,
        chatPartnerId,
      },
    };

    await db.collection('panicEvents').doc(panicEventId).set(panicEvent);

    // 3. Update session if exists
    if (sessionId) {
      await db.collection('liveSessions').doc(sessionId).update({
        panicTriggeredBy: userId,
        trustCenterStatus: 'escalated',
      });

      if (locationData) {
        await updateSessionLocation({ sessionId, location: locationData });
      }

      await logSafetySession({
        sessionId,
        userId,
        action: 'panic_triggered',
        details: {
          panicEventId,
          context,
        },
      });
    }

    // 4. Update user's profile
    await db.collection('safetyProfiles').doc(userId).update({
      lastPanicAt: now,
      lastPanicContext: context,
    });

    // 5. Send notifications to trusted contacts
    let notificationsSent = 0;
    if (profile.trustedContacts.length > 0 && profile.settings.panicSendProfile) {
      notificationsSent = await sendPanicNotifications({
        userId,
        panicEventId,
        context,
        location: locationData,
        profile,
        bookingId,
        eventId,
        chatPartnerId,
      });
    }

    // 6. Update panic event with notification count
    await db.collection('panicEvents').doc(panicEventId).update({
      notificationsSent,
    });

    return {
      success: true,
      panicEventId,
      notificationsSent,
    };
  } catch (error) {
    console.error('Error triggering panic:', error);
    throw error;
  }
}

/**
 * Send panic notifications to all trusted contacts
 */
async function sendPanicNotifications(params: {
  userId: string;
  panicEventId: string;
  context: PanicContext;
  location: LocationData | null;
  profile: SafetyProfile;
  bookingId?: string;
  eventId?: string;
  chatPartnerId?: string;
}): Promise<number> {
  const {
    userId,
    panicEventId,
    context,
    location,
    profile,
    bookingId,
    eventId,
    chatPartnerId,
  } = params;

  // Get user info
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const userName = userData?.displayName || userData?.nickname || 'User';
  const userProfileUrl = `https://avalo.app/profile/${userId}`;

  // Build notification payload
  const payload: PanicNotificationPayload = {
    userName,
    userProfileUrl,
    lastLocation: profile.settings.panicSendLocation ? location : null,
    mapUrl:
      location && profile.settings.panicSendLocation
        ? `https://maps.google.com/?q=${location.lat},${location.lng}`
        : null,
    timestamp: new Date().toISOString(),
    context,
  };

  // Get partner info if available
  if (chatPartnerId || bookingId) {
    let partnerId: string | null = chatPartnerId || null;

    if (bookingId && !partnerId) {
      const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
      const booking = bookingDoc.data();
      partnerId = booking?.hostId === userId ? booking?.guestId : booking?.hostId;
    }

    if (partnerId) {
      const partnerDoc = await db.collection('users').doc(partnerId).get();
      const partnerData = partnerDoc.data();
      payload.meetingPartner = {
        name: partnerData?.displayName || partnerData?.nickname || 'Unknown',
        profileUrl: `https://avalo.app/profile/${partnerId}`,
      };
    }
  }

  // Send to all enabled contacts
  let sent = 0;
  for (const contact of profile.trustedContacts) {
    if (!contact.enabled) continue;

    const message = buildPanicMessage(payload);

    try {
      await sendNotification(contact, message, {
        panicEventId,
        sessionId: params.userId, // temporary
      });
      sent++;
    } catch (error) {
      console.error(`Failed to send notification to ${contact.contactId}:`, error);
    }
  }

  return sent;
}

/**
 * Build panic alert message
 */
function buildPanicMessage(payload: PanicNotificationPayload): string {
  const { userName, userProfileUrl, mapUrl, meetingPartner, context } = payload;

  let message = `🚨 SAFETY ALERT from Avalo\n\n`;
  message += `${userName} has pressed the Panic Button`;

  if (context !== 'none') {
    message += ` during a ${context}`;
  }

  message += `.\n\n`;

  if (meetingPartner) {
    message += `Meeting with: ${meetingPartner.name}\n`;
    message += `Profile: ${meetingPartner.profileUrl}\n\n`;
  }

  if (mapUrl) {
    message += `Last location: ${mapUrl}\n\n`;
  }

  message += `User profile: ${userProfileUrl}\n\n`;
  message += `⚠️ If this is an emergency, contact local emergency services immediately (911/112).`;

  return message;
}

/**
 * Send notification via appropriate channel
 */
async function sendNotification(
  contact: TrustedContact,
  message: string,
  metadata: { panicEventId: string; sessionId?: string }
): Promise<void> {
  const notificationId = uuidv4();
  const now = new Date().toISOString();

  const notification: TrustedContactNotification = {
    notificationId,
    userId: '', // Will be set by caller
    contactId: contact.contactId,
    channel: contact.channel,
    recipient: contact.value,
    message,
    sentAt: now,
    deliveryStatus: 'pending',
    metadata,
  };

  // Store notification record
  await db.collection('trustedContactNotifications').doc(notificationId).set(notification);

  // TODO: Integrate with actual notification services
  // For now, we'll just log and mark as sent
  console.log(`Sending ${contact.channel} notification to ${contact.value}`);
  console.log(`Message: ${message}`);

  // In production, integrate with:
  // - Twilio for SMS/WhatsApp
  // - SendGrid for email
  // - FCM for push notifications

  // Mark as sent (placeholder)
  await db.collection('trustedContactNotifications').doc(notificationId).update({
    deliveryStatus: 'sent',
  });
}

/**
 * Log safety session activity
 */
async function logSafetySession(params: {
  sessionId: string;
  userId: string;
  action: SafetySessionLog['action'];
  details: Record<string, any>;
}): Promise<void> {
  const { sessionId, userId, action, details } = params;

  const logId = uuidv4();
  const now = new Date().toISOString();

  const log: SafetySessionLog = {
    logId,
    sessionId,
    userId,
    action,
    timestamp: now,
    details,
  };

  await db.collection('safetySessionLogs').doc(logId).set(log);
}

// ============================================================================
// ADMIN / SAFETY CENTER FUNCTIONS
// ============================================================================

/**
 * Get all active sessions (admin only)
 */
export async function getAllActiveSessions(): Promise<LiveSession[]> {
  const snapshot = await db
    .collection('liveSessions')
    .where('endedAt', '==', null)
    .orderBy('startedAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map((doc) => doc.data() as LiveSession);
}

/**
 * Get escalated sessions (admin only)
 */
export async function getEscalatedSessions(): Promise<LiveSession[]> {
  const snapshot = await db
    .collection('liveSessions')
    .where('trustCenterStatus', '==', 'escalated')
    .orderBy('startedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map((doc) => doc.data() as LiveSession);
}

/**
 * Close a safety incident (admin only)
 */
export async function closeSafetyIncident(
  sessionId: string,
  closedBy: string,
  notes?: string
): Promise<void> {
  await db.collection('liveSessions').doc(sessionId).update({
    trustCenterStatus: 'closed',
  });

  await logSafetySession({
    sessionId,
    userId: closedBy,
    action: 'status_changed',
    details: {
      newStatus: 'closed',
      notes: notes || '',
    },
  });
}

/**
 * Get recent panic events (admin only)
 */
export async function getRecentPanicEvents(limit: number = 50): Promise<PanicEvent[]> {
  const snapshot = await db
    .collection('panicEvents')
    .orderBy('triggeredAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as PanicEvent);
}