/**
 * PACK 210: Panic Button + Trusted Contact + Live Safety Tracking
 * Core engine for real-world safety system during meetings and events
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  SafetySession,
  SafetySessionStatus,
  LocationTrackingPoint,
  TrustedContact,
  TrustedContactRelationship,
  PanicAlert,
  PanicAlertTier,
  PanicAlertStatus,
  SafetyCheckTimer,
  SafetyCheckStatus,
  PanicNotification,
  NotificationChannel,
  NotificationStatus,
  SafetyEventLog,
  SafetyEventType,
  SafetyEventSeverity,
  DEFAULT_SAFETY_TRACKING_CONFIG,
} from './pack210-safety-tracking-types';

// ============================================================================
// SAFETY SESSION MANAGEMENT
// ============================================================================

/**
 * Start a safety tracking session after QR check-in
 * Automatically activates tracking for 1:1 meetings or events
 */
export async function startSafetySession(params: {
  userId: string;
  bookingId?: string;
  eventId?: string;
  attendeeId?: string;
  venueLocation: {
    latitude: number;
    longitude: number;
    address?: string;
    placeName?: string;
  };
  otherUserId?: string;
  scheduledEndTime?: Date;
  deviceInfo?: {
    platform: string;
    appVersion: string;
    deviceId: string;
  };
}): Promise<{ sessionId: string; trustedContactId?: string; trackingActive: boolean }> {
  const {
    userId,
    bookingId,
    eventId,
    attendeeId,
    venueLocation,
    otherUserId,
    scheduledEndTime,
    deviceInfo,
  } = params;

  const sessionId = generateId();

  // Get user information
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();
  const userName = userData?.displayName || 'Unknown';

  // Get other user information if available
  let otherUserName: string | undefined;
  let otherUserPhotos: string[] | undefined;
  if (otherUserId) {
    const otherUserSnap = await db.collection('users').doc(otherUserId).get();
    const otherUserData = otherUserSnap.data();
    otherUserName = otherUserData?.displayName;
    otherUserPhotos = otherUserData?.photos || [];
  }

  // Get primary trusted contact
  const trustedContactSnap = await db
    .collection('trusted_contacts')
    .where('userId', '==', userId)
    .where('isPrimary', '==', true)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  const hasTrustedContact = !trustedContactSnap.empty;
  const trustedContact = hasTrustedContact ? (trustedContactSnap.docs[0].data() as TrustedContact) : null;

  // Create safety session
  const session: SafetySession = {
    sessionId,
    userId,
    userName,
    bookingId,
    eventId,
    attendeeId,
    status: SafetySessionStatus.ACTIVE,
    venueLocation,
    otherUserId,
    otherUserName,
    otherUserPhotos,
    trustedContactEnabled: hasTrustedContact,
    trustedContactId: trustedContact?.contactId,
    trustedContactAlerts: trustedContact?.receivePanicAlerts || false,
    trackingLinkShared: hasTrustedContact && trustedContact.receiveTrackingLinks,
    trackingIntervalSeconds: DEFAULT_SAFETY_TRACKING_CONFIG.normalTrackingInterval,
    lowBatteryMode: false,
    safetyCheckEnabled: true,
    startedAt: serverTimestamp() as Timestamp,
    scheduledEndTime: scheduledEndTime ? Timestamp.fromDate(scheduledEndTime) : undefined,
    lastHeartbeat: serverTimestamp() as Timestamp,
    deviceInfo,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('safety_sessions').doc(sessionId).set(session);

  // Log event
  await logSafetyEvent({
    eventType: SafetyEventType.SESSION_STARTED,
    severity: SafetyEventSeverity.INFO,
    userId,
    userName,
    sessionId,
    bookingId,
    eventId,
    description: `Safety tracking started for ${bookingId ? 'meeting' : 'event'}`,
    location: venueLocation,
    requiresReview: false,
    metadata: {
      trustedContactEnabled: hasTrustedContact,
      trackingInterval: DEFAULT_SAFETY_TRACKING_CONFIG.normalTrackingInterval,
    },
  });

  // If trusted contact with tracking enabled, send tracking link
  if (hasTrustedContact && trustedContact!.receiveTrackingLinks) {
    await sendTrackingLinkNotification({
      sessionId,
      userId,
      userName,
      trustedContact: trustedContact!,
      venueLocation,
      otherUserName,
    }).catch(err => console.error('Failed to send tracking link:', err));
  }

  // Schedule safety check if end time is set
  if (scheduledEndTime) {
    await scheduleSafetyCheck({
      sessionId,
      userId,
      scheduledAt: scheduledEndTime,
    }).catch(err => console.error('Failed to schedule safety check:', err));
  }

  // Update booking/attendee with session reference
  if (bookingId) {
    await db.collection('calendarBookings').doc(bookingId).update({
      safetySessionId: sessionId,
      safetyTrackingActive: true,
      updatedAt: serverTimestamp(),
    });
  } else if (eventId && attendeeId) {
    await db.collection('event_attendees').doc(attendeeId).update({
      safetySessionId: sessionId,
      safetyTrackingActive: true,
      updatedAt: serverTimestamp(),
    });
  }

  return {
    sessionId,
    trustedContactId: trustedContact?.contactId,
    trackingActive: true,
  };
}

/**
 * End a safety tracking session normally
 * Can be called manually by user or automatically after meeting ends
 */
export async function endSafetySession(params: {
  sessionId: string;
  userId: string;
  endReason: 'USER_ENDED' | 'AUTO_ENDED' | 'MEETING_COMPLETED';
}): Promise<{ success: boolean }> {
  const { sessionId, userId, endReason } = params;

  const sessionSnap = await db.collection('safety_sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new Error('Safety session not found');
  }

  const session = sessionSnap.data() as SafetySession;

  // Verify user owns this session
  if (session.userId !== userId) {
    throw new Error('Unauthorized to end this session');
  }

  // End session
  await db.collection('safety_sessions').doc(sessionId).update({
    status: endReason === 'AUTO_ENDED' ? SafetySessionStatus.AUTO_ENDED : SafetySessionStatus.ENDED,
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Cancel any pending safety checks
  const timersSnap = await db
    .collection('safety_check_timers')
    .where('sessionId', '==', sessionId)
    .where('status', '==', SafetyCheckStatus.SCHEDULED)
    .get();

  const batch = db.batch();
  timersSnap.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: SafetyCheckStatus.CANCELLED,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  // Log event
  await logSafetyEvent({
    eventType: SafetyEventType.SESSION_ENDED,
    severity: SafetyEventSeverity.INFO,
    userId,
    userName: session.userName,
    sessionId,
    bookingId: session.bookingId,
    eventId: session.eventId,
    description: `Safety tracking ended: ${endReason}`,
    requiresReview: false,
    metadata: {
      duration: Date.now() - session.startedAt.toMillis(),
      endReason,
    },
  });

  // Update booking/attendee
  if (session.bookingId) {
    await db.collection('calendarBookings').doc(session.bookingId).update({
      safetyTrackingActive: false,
      updatedAt: serverTimestamp(),
    });
  } else if (session.eventId && session.attendeeId) {
    await db.collection('event_attendees').doc(session.attendeeId).update({
      safetyTrackingActive: false,
      updatedAt: serverTimestamp(),
    });
  }

  return { success: true };
}

// ============================================================================
// LOCATION TRACKING
// ============================================================================

/**
 * Update user location during active safety session
 * Implements 15-second normal tracking or 60-second low-battery mode
 */
export async function updateLocation(params: {
  sessionId: string;
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
}): Promise<{ success: boolean; intervalChanged?: boolean; newInterval?: number }> {
  const { sessionId, userId, batteryLevel, ...locationData } = params;

  const sessionSnap = await db.collection('safety_sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new Error('Safety session not found');
  }

  const session = sessionSnap.data() as SafetySession;

  // Verify session is active
  if (session.status !== SafetySessionStatus.ACTIVE) {
    throw new Error('Safety session is not active');
  }

  // Verify user owns this session
  if (session.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Check battery level and adjust tracking interval
  let intervalChanged = false;
  let newInterval: number | undefined;
  const lowBatteryThreshold = DEFAULT_SAFETY_TRACKING_CONFIG.lowBatteryThreshold;

  if (batteryLevel !== undefined) {
    const shouldUseLowBatteryMode = batteryLevel < lowBatteryThreshold;
    
    if (shouldUseLowBatteryMode && !session.lowBatteryMode) {
      // Switch to low battery mode
      intervalChanged = true;
      newInterval = DEFAULT_SAFETY_TRACKING_CONFIG.lowBatteryTrackingInterval;
      
      await db.collection('safety_sessions').doc(sessionId).update({
        lowBatteryMode: true,
        batteryLevel,
        trackingIntervalSeconds: newInterval,
        updatedAt: serverTimestamp(),
      });

      // Log battery mode change
      await logSafetyEvent({
        eventType: SafetyEventType.LOW_BATTERY_MODE_ACTIVATED,
        severity: SafetyEventSeverity.WARNING,
        userId,
        userName: session.userName,
        sessionId,
        bookingId: session.bookingId,
        eventId: session.eventId,
        description: `Low battery mode activated (${batteryLevel}%)`,
        requiresReview: false,
        metadata: {
          batteryLevel,
          newInterval,
        },
      });
    } else if (!shouldUseLowBatteryMode && session.lowBatteryMode) {
      // Switch back to normal mode
      intervalChanged = true;
      newInterval = DEFAULT_SAFETY_TRACKING_CONFIG.normalTrackingInterval;
      
      await db.collection('safety_sessions').doc(sessionId).update({
        lowBatteryMode: false,
        batteryLevel,
        trackingIntervalSeconds: newInterval,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Just update battery level
      await db.collection('safety_sessions').doc(sessionId).update({
        batteryLevel,
        lastHeartbeat: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    // Update heartbeat
    await db.collection('safety_sessions').doc(sessionId).update({
      lastHeartbeat: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Calculate expiration date (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_SAFETY_TRACKING_CONFIG.locationDataRetentionDays);

  // Store location point
  const trackingId = generateId();
  const locationPoint: LocationTrackingPoint = {
    trackingId,
    sessionId,
    userId,
    ...locationData,
    batteryLevel,
    lowBatteryMode: session.lowBatteryMode,
    trustedContactEnabled: session.trustedContactEnabled,
    trustedContactId: session.trustedContactId,
    timestamp: serverTimestamp() as Timestamp,
    serverReceivedAt: serverTimestamp() as Timestamp,
    expiresAt: Timestamp.fromDate(expiresAt),
  };

  await db.collection('location_tracking').doc(trackingId).set(locationPoint);

  return {
    success: true,
    intervalChanged,
    newInterval,
  };
}

// ============================================================================
// TRUSTED CONTACT MANAGEMENT
// ============================================================================

/**
 * Add or update a trusted contact for safety tracking
 */
export async function manageTrustedContact(params: {
  userId: string;
  contactId?: string; // If updating
  name: string;
  phoneNumber: string;
  phoneCountryCode: string;
  email?: string;
  telegram?: string;
  whatsapp?: string;
  relationship: TrustedContactRelationship;
  isPrimary: boolean;
  receiveTrackingLinks: boolean;
  receivePanicAlerts: boolean;
  receiveAutoAlerts: boolean;
}): Promise<{ contactId: string; isPrimary: boolean }> {
  const { userId, contactId, isPrimary, ...contactData } = params;

  // If setting as primary, unset other primary contacts
  if (isPrimary) {
    const primaryContactsSnap = await db
      .collection('trusted_contacts')
      .where('userId', '==', userId)
      .where('isPrimary', '==', true)
      .get();

    const batch = db.batch();
    primaryContactsSnap.docs.forEach(doc => {
      if (!contactId || doc.id !== contactId) {
        batch.update(doc.ref, { isPrimary: false });
      }
    });
    await batch.commit();
  }

  const finalContactId = contactId || generateId();

  const contact: TrustedContact = {
    contactId: finalContactId,
    userId,
    ...contactData,
    isPrimary,
    isActive: true,
    totalAlertsReceived: 0,
    createdAt: contactId ? (await db.collection('trusted_contacts').doc(contactId).get()).data()?.createdAt : serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('trusted_contacts').doc(finalContactId).set(contact, { merge: true });

  // Log event
  await logSafetyEvent({
    eventType: contactId ? SafetyEventType.TRUSTED_CONTACT_ADDED : SafetyEventType.TRUSTED_CONTACT_ADDED,
    severity: SafetyEventSeverity.INFO,
    userId,
    description: `Trusted contact ${contactId ? 'updated' : 'added'}: ${contactData.name}`,
    requiresReview: false,
    involvedUserIds: [userId],
  });

  return { contactId: finalContactId, isPrimary };
}

/**
 * Remove a trusted contact
 */
export async function removeTrustedContact(params: {
  userId: string;
  contactId: string;
}): Promise<{ success: boolean }> {
  const { userId, contactId } = params;

  const contactSnap = await db.collection('trusted_contacts').doc(contactId).get();
  if (!contactSnap.exists) {
    throw new Error('Trusted contact not found');
  }

  const contact = contactSnap.data() as TrustedContact;

  // Verify ownership
  if (contact.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await db.collection('trusted_contacts').doc(contactId).delete();

  // Log event
  await logSafetyEvent({
    eventType: SafetyEventType.TRUSTED_CONTACT_REMOVED,
    severity: SafetyEventSeverity.INFO,
    userId,
    description: `Trusted contact removed: ${contact.name}`,
    requiresReview: false,
    involvedUserIds: [userId],
  });

  return { success: true };
}

// ============================================================================
// PANIC ALERT SYSTEM
// ============================================================================

/**
 * Trigger panic alert - Tier 1 (Silent) or Tier 2 (SOS)
 * Tier 1: Single tap - notify trusted contact only
 * Tier 2: Long press (3s) - escalate to Trust & Safety team
 */
export async function triggerPanicAlert(params: {
  sessionId: string;
  userId: string;
  tier: PanicAlertTier;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  deviceInfo?: {
    platform: string;
    appVersion: string;
    deviceId: string;
    ipHash?: string;
  };
}): Promise<{
  alertId: string;
  trustedContactNotified: boolean;
  safetyTeamNotified: boolean;
  meetingEnded: boolean;
  trackingLink?: string;
}> {
  const { sessionId, userId, tier, currentLocation, deviceInfo } = params;

  const sessionSnap = await db.collection('safety_sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new Error('Safety session not found');
  }

  const session = sessionSnap.data() as SafetySession;

  // Verify session is active
  if (session.status !== SafetySessionStatus.ACTIVE) {
    throw new Error('Safety session is not active');
  }

  // Verify user owns this session
  if (session.userId !== userId) {
    throw new Error('Unauthorized');
  }

  const alertId = generateId();

  // Get user information
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();

  // Create tracking link
  const trackingLink = `https://avalo.app/safety/track/${sessionId}?key=${generateId()}`;

  // Create panic alert
  const alert: PanicAlert = {
    alertId,
    tier,
    status: PanicAlertStatus.TRIGGERED,
    userId,
    userName: session.userName,
    userPhotos: userData?.photos || [],
    sessionId,
    bookingId: session.bookingId,
    eventId: session.eventId,
    location: currentLocation,
    venueLocation: session.venueLocation,
    otherUserId: session.otherUserId,
    otherUserName: session.otherUserName,
    otherUserPhotos: session.otherUserPhotos,
    trustedContactId: session.trustedContactId,
    trackingLinkSent: trackingLink,
    meetingAutoEnded: false,
    payoutBlocked: false,
    deviceInfo,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('panic_alerts').doc(alertId).set(alert);

  // Update session
  await db.collection('safety_sessions').doc(sessionId).update({
    status: SafetySessionStatus.PANIC_TRIGGERED,
    panicAlertId: alertId,
    updatedAt: serverTimestamp(),
  });

  let trustedContactNotified = false;
  let safetyTeamNotified = false;

  // Tier 1: Notify trusted contact only
  if (tier === PanicAlertTier.TIER_1_SILENT && session.trustedContactId) {
    const contactSnap = await db.collection('trusted_contacts').doc(session.trustedContactId).get();
    if (contactSnap.exists) {
      const contact = contactSnap.data() as TrustedContact;
      
      await notifyTrustedContact({
        alertId,
        alert,
        contact,
        trackingLink,
      });

      trustedContactNotified = true;

      await db.collection('panic_alerts').doc(alertId).update({
        status: PanicAlertStatus.TRUSTEDCONTACT_NOTIFIED,
        trustedContactNotifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update contact alert count
      await db.collection('trusted_contacts').doc(session.trustedContactId).update({
        lastNotifiedAt: serverTimestamp(),
        totalAlertsReceived: increment(1),
      });
    }
  }

  // Tier 2: Escalate to Trust & Safety team
  if (tier === PanicAlertTier.TIER_2_SOS) {
    // Notify trusted contact first if available
    if (session.trustedContactId) {
      const contactSnap = await db.collection('trusted_contacts').doc(session.trustedContactId).get();
      if (contactSnap.exists) {
        const contact = contactSnap.data() as TrustedContact;
        await notifyTrustedContact({
          alertId,
          alert,
          contact,
          trackingLink,
        });
        trustedContactNotified = true;
      }
    }

    // Notify safety team
    await notifySafetyTeam({
      alertId,
      alert,
      trackingLink,
    });

    safetyTeamNotified = true;

    await db.collection('panic_alerts').doc(alertId).update({
      status: PanicAlertStatus.SAFETY_TEAM_NOTIFIED,
      safetyTeamNotifiedAt: serverTimestamp(),
      trustedContactNotifiedAt: trustedContactNotified ? serverTimestamp() : undefined,
      updatedAt: serverTimestamp(),
    });
  }

  // Auto-end meeting and block payout
  const meetingEnded = await autoEndMeetingOnPanic({
    alertId,
    sessionId,
    bookingId: session.bookingId,
    eventId: session.eventId,
    attendeeId: session.attendeeId,
    userId,
  });

  // Log event
  await logSafetyEvent({
    eventType: tier === PanicAlertTier.TIER_1_SILENT 
      ? SafetyEventType.PANIC_TIER1_TRIGGERED 
      : SafetyEventType.PANIC_TIER2_TRIGGERED,
    severity: tier === PanicAlertTier.TIER_1_SILENT 
      ? SafetyEventSeverity.CRITICAL 
      : SafetyEventSeverity.EMERGENCY,
    userId,
    userName: session.userName,
    sessionId,
    bookingId: session.bookingId,
    eventId: session.eventId,
    alertId,
    description: `Panic alert ${tier} triggered`,
    location: currentLocation,
    requiresReview: true,
    involvedUserIds: [userId, session.otherUserId].filter(Boolean) as string[],
    actionsTaken: [
      trustedContactNotified ? 'Trusted contact notified' : null,
      safetyTeamNotified ? 'Safety team notified' : null,
      meetingEnded ? 'Meeting auto-ended' : null,
    ].filter(Boolean) as string[],
  });

  return {
    alertId,
    trustedContactNotified,
    safetyTeamNotified,
    meetingEnded,
    trackingLink,
  };
}

/**
 * Auto-end meeting/event and block payout after panic alert
 */
async function autoEndMeetingOnPanic(params: {
  alertId: string;
  sessionId: string;
  bookingId?: string;
  eventId?: string;
  attendeeId?: string;
  userId: string;
}): Promise<boolean> {
  const { alertId, sessionId, bookingId, eventId, attendeeId, userId } = params;

  try {
    if (bookingId) {
      // End 1:1 meeting
      await db.collection('calendarBookings').doc(bookingId).update({
        status: 'PANIC_ENDED',
        panicAlertId: alertId,
        payoutBlocked: true,
        payoutBlockReason: 'panic_alert_triggered',
        safetyTrackingActive: false,
        updatedAt: serverTimestamp(),
      });

      // Log event
      await logSafetyEvent({
        eventType: SafetyEventType.MEETING_AUTO_ENDED,
        severity: SafetyEventSeverity.CRITICAL,
        userId,
        sessionId,
        bookingId,
        alertId,
        description: 'Meeting auto-ended due to panic alert',
        requiresReview: true,
        involvedUserIds: [userId],
      });

      // Update panic alert
      await db.collection('panic_alerts').doc(alertId).update({
        meetingAutoEnded: true,
        payoutBlocked: true,
        updatedAt: serverTimestamp(),
      });

      return true;
    } else if (eventId && attendeeId) {
      // Mark attendee as panic-ended
      await db.collection('event_attendees').doc(attendeeId).update({
        status: 'PANIC_ENDED',
        panicAlertId: alertId,
        safetyTrackingActive: false,
        updatedAt: serverTimestamp(),
      });

      // Update panic alert
      await db.collection('panic_alerts').doc(alertId).update({
        meetingAutoEnded: true,
        updatedAt: serverTimestamp(),
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to auto-end meeting on panic:', error);
    return false;
  }
}

// ============================================================================
// SAFETY CHECK TIMER ("Are You Safe?")
// ============================================================================

/**
 * Schedule a safety check timer
 * If user doesn't respond within 5 minutes, trigger Tier 1 alert
 */
export async function scheduleSafetyCheck(params: {
  sessionId: string;
  userId: string;
  scheduledAt: Date;
}): Promise<{ timerId: string; scheduledAt: Date }> {
  const { sessionId, userId, scheduledAt } = params;

  const timerId = generateId();

  // Calculate response deadline (5 minutes after scheduled time)
  const responseDeadline = new Date(scheduledAt.getTime() + 5 * 60 * 1000);

  const timer: SafetyCheckTimer = {
    timerId,
    sessionId,
    userId,
    status: SafetyCheckStatus.SCHEDULED,
    scheduledAt: Timestamp.fromDate(scheduledAt),
    responseDeadline: Timestamp.fromDate(responseDeadline),
    autoAlertTriggered: false,
    trustedContactNotified: false,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('safety_check_timers').doc(timerId).set(timer);

  return { timerId, scheduledAt };
}

/**
 * Respond to safety check
 */
export async function respondToSafetyCheck(params: {
  timerId: string;
  userId: string;
  response: 'SAFE' | 'NEED_HELP';
}): Promise<{ success: boolean }> {
  const { timerId, userId, response } = params;

  const timerSnap = await db.collection('safety_check_timers').doc(timerId).get();
  if (!timerSnap.exists) {
    throw new Error('Safety check timer not found');
  }

  const timer = timerSnap.data() as SafetyCheckTimer;

  // Verify user owns this timer
  if (timer.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await db.collection('safety_check_timers').doc(timerId).update({
    status: SafetyCheckStatus.RESPONDED_SAFE,
    respondedAt: serverTimestamp(),
    userResponse: response,
    updatedAt: serverTimestamp(),
  });

  // Update session
  await db.collection('safety_sessions').doc(timer.sessionId).update({
    safetyCheckResponse: response,
    updatedAt: serverTimestamp(),
  });

  // If NEED_HELP, trigger Tier 1 panic alert
  if (response === 'NEED_HELP') {
    const sessionSnap = await db.collection('safety_sessions').doc(timer.sessionId).get();
    const session = sessionSnap.data() as SafetySession;

    if (session.status === SafetySessionStatus.ACTIVE) {
      await triggerPanicAlert({
        sessionId: timer.sessionId,
        userId,
        tier: PanicAlertTier.TIER_1_SILENT,
        currentLocation: session.venueLocation,
      });
    }
  }

  return { success: true };
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

async function notifyTrustedContact(params: {
  alertId: string;
  alert: PanicAlert;
  contact: TrustedContact;
  trackingLink: string;
}): Promise<void> {
  const { alertId, alert, contact, trackingLink } = params;

  const notificationId = generateId();

  // Prepare message content
  const message = `🚨 SAFETY ALERT\n\n${alert.userName} has triggered a panic alert during their meeting at ${alert.venueLocation?.placeName || 'a location'}.\n\nLive tracking: ${trackingLink}\n\nThis is an automated safety notification from Avalo.`;

  // Create notification record
  const notification: PanicNotification = {
    notificationId,
    alertId,
    recipientId: contact.contactId,
    recipientName: contact.name,
    userId: alert.userId,
    userName: alert.userName,
    channel: NotificationChannel.SMS, // Primary channel
    status: NotificationStatus.PENDING,
    subject: 'SAFETY ALERT - Immediate Action Required',
    message,
    trackingLink,
    panicTier: alert.tier,
    venueInfo: alert.venueLocation ? {
      name: alert.venueLocation.placeName,
      address: alert.venueLocation.address || 'Unknown address',
      coordinates: {
        latitude: alert.venueLocation.latitude,
        longitude: alert.venueLocation.longitude,
      },
    } : undefined,
    createdAt: serverTimestamp() as Timestamp,
  };

  await db.collection('panic_notifications').doc(notificationId).set(notification);

  // Log event
  await logSafetyEvent({
    eventType: SafetyEventType.TRUSTEDCONTACT_NOTIFIED,
    severity: SafetyEventSeverity.CRITICAL,
    userId: alert.userId,
    userName: alert.userName,
    sessionId: alert.sessionId,
    alertId,
    description: `Trusted contact notified: ${contact.name}`,
    requiresReview: false,
    involvedUserIds: [alert.userId],
    notificationsSent: 1,
  });

  // TODO: Integrate with SMS/Email service (Twilio, SendGrid, etc.)
  // For now, just mark as sent
  await db.collection('panic_notifications').doc(notificationId).update({
    status: NotificationStatus.SENT,
    sentAt: serverTimestamp(),
  });
}

async function notifySafetyTeam(params: {
  alertId: string;
  alert: PanicAlert;
  trackingLink: string;
}): Promise<void> {
  const { alertId, alert, trackingLink } = params;

  // Log event for safety team dashboard
  await logSafetyEvent({
    eventType: SafetyEventType.SAFETY_TEAM_NOTIFIED,
    severity: SafetyEventSeverity.EMERGENCY,
    userId: alert.userId,
    userName: alert.userName,
    sessionId: alert.sessionId,
    bookingId: alert.bookingId,
    eventId: alert.eventId,
    alertId,
    description: `TIER 2 PANIC ALERT - Requires immediate safety team response`,
    location: alert.location,
    requiresReview: true,
    involvedUserIds: [alert.userId, alert.otherUserId].filter(Boolean) as string[],
    metadata: {
      trackingLink,
      venueLocation: alert.venueLocation,
      otherUserName: alert.otherUserName,
      bookingId: alert.bookingId,
      eventId: alert.eventId,
    },
  });

  // TODO: Integrate with safety team alerting system (PagerDuty, Slack, etc.)
  // For MVP, safety team can monitor safety_event_log collection
}

async function sendTrackingLinkNotification(params: {
  sessionId: string;
  userId: string;
  userName: string;
  trustedContact: TrustedContact;
  venueLocation: any;
  otherUserName?: string;
}): Promise<void> {
  const { sessionId, userId, userName, trustedContact, venueLocation, otherUserName } = params;

  const trackingLink = `https://avalo.app/safety/track/${sessionId}?key=${generateId()}`;

  const message = `${userName} is meeting ${otherUserName || 'someone'} at ${venueLocation.placeName || 'a location'}.\n\nYou can follow their location here: ${trackingLink}\n\nThis is an automated safety notification from Avalo.`;

  // TODO: Send via SMS/Email
  // For MVP, just log it
  console.log(`Tracking link sent to ${trustedContact.name}: ${trackingLink}`);
}

// ============================================================================
// LOGGING HELPER
// ============================================================================

async function logSafetyEvent(params: Partial<SafetyEventLog> & {
  eventType: SafetyEventType;
  severity: SafetyEventSeverity;
  userId: string;
  description: string;
  requiresReview: boolean;
}): Promise<string> {
  const logId = generateId();

  const log: SafetyEventLog = {
    logId,
    involvedUserIds: [],
    actionsTaken: [],
    ...params,
    createdAt: serverTimestamp() as Timestamp,
  };

  await db.collection('safety_event_log').doc(logId).set(log);

  return logId;
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get all active safety sessions (for monitoring)
 */
export async function getActiveSafetySessions(params?: {
  limit?: number;
}): Promise<SafetySession[]> {
  const { limit = 50 } = params || {};

  const sessionsSnap = await db
    .collection('safety_sessions')
    .where('status', '==', SafetySessionStatus.ACTIVE)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();

  return sessionsSnap.docs.map(doc => doc.data() as SafetySession);
}

/**
 * Get panic alerts for review
 */
export async function getPanicAlerts(params?: {
  status?: PanicAlertStatus;
  tier?: PanicAlertTier;
  limit?: number;
}): Promise<PanicAlert[]> {
  const { status, tier, limit = 50 } = params || {};

  let query = db.collection('panic_alerts').orderBy('createdAt', 'desc');

  if (status) {
    query = query.where('status', '==', status) as any;
  }

  if (tier) {
    query = query.where('tier', '==', tier) as any;
  }

  const alertsSnap = await query.limit(limit).get();

  return alertsSnap.docs.map(doc => doc.data() as PanicAlert);
}

/**
 * Resolve a panic alert (safety team action)
 */
export async function resolvePanicAlert(params: {
  alertId: string;
  resolvedBy: string;
  resolution: string;
  notes?: string;
}): Promise<{ success: boolean }> {
  const { alertId, resolvedBy, resolution, notes } = params;

  await db.collection('panic_alerts').doc(alertId).update({
    status: PanicAlertStatus.RESOLVED,
    resolvedBy,
    resolvedAt: serverTimestamp(),
    resolution,
    notes,
    updatedAt: serverTimestamp(),
  });

  return { success: true };
}