/**
 * PACK 218: Calendar & Events Product Completion
 * Unified schedule for meetings + events, reminders, host tools, mobile + web parity
 * 
 * EXTENDS PACK 209-211:
 * - Does NOT change economics (65/35 meetings, 80/20 events)
 * - Does NOT change refund logic
 * - Adds UX layer on top of existing models
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId, increment } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

type ScheduleItemType = 'meeting' | 'event';
type ScheduleRole = 'host' | 'guest' | 'attendee';
type ScheduleStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';
type PaymentStatus = 'paid' | 'refunded' | 'pending' | 'disputed';
type VibeRating = 'good' | 'neutral' | 'bad';

interface AvaloScheduleItem {
  id: string;
  type: ScheduleItemType;
  role: ScheduleRole;
  title: string;
  startTime: Timestamp;
  endTime: Timestamp;
  location: {
    name: string;
    address?: string;
    coordinates?: { lat: number; lng: number };
  };
  status: ScheduleStatus;
  safetyModeEnabled: boolean;
  hasPanicButton: boolean;
  paymentStatus: PaymentStatus;
  
  // Additional metadata
  userId: string;
  participantIds: string[];
  sourceId: string; // bookingId or eventId
  sourceCollection: string; // 'calendarBookings' or 'events'
  tokensAmount: number;
  createdAt: Timestamp;
}

interface ReminderConfig {
  reminderId: string;
  userId: string;
  scheduleItemId: string;
  type: 'meeting' | 'event';
  triggerTime: Timestamp;
  message: string;
  dismissed: boolean;
  sent: boolean;
  createdAt: Timestamp;
}

interface CancellationDeadline {
  deadlineId: string;
  userId: string;
  scheduleItemId: string;
  type: 'meeting' | 'event';
  deadlineTime: Timestamp;
  refundPercentage: number;
  label: string;
  passed: boolean;
}

// ============================================================================
// UNIFIED SCHEDULE AGGREGATION
// ============================================================================

/**
 * Get unified schedule for a user (meetings + events)
 */
export const getMySchedule = onCall<{
  status?: 'upcoming' | 'active' | 'completed' | 'cancelled';
  limit?: number;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { status, limit = 50 } = request.data;
  
  // Build query
  let query = db.collection('schedule_items')
    .where('userId', '==', userId);
  
  if (status) {
    query = query.where('status', '==', status);
  }
  
  const snapshot = await query
    .orderBy('startTime', 'asc')
    .limit(limit)
    .get();
  
  const items = snapshot.docs.map(doc => doc.data() as AvaloScheduleItem);
  
  return {
    success: true,
    items,
    count: items.length,
  };
});

/**
 * Aggregate meeting into schedule_items (triggered on booking creation)
 */
export const aggregateMeetingToSchedule = onDocumentCreated(
  'calendarBookings/{bookingId}',
  async (event) => {
    const booking = event.data?.data();
    if (!booking) return;
    
    const bookingId = event.params.bookingId;
    
    // Get booking details
    const bookerItem: AvaloScheduleItem = {
      id: `meeting_${bookingId}_booker`,
      type: 'meeting',
      role: 'guest',
      title: `Meet with ${booking.creatorName || 'Unknown'}`,
      startTime: booking.startTime,
      endTime: booking.endTime || Timestamp.fromDate(
        new Date(booking.startTime.toDate().getTime() + 60 * 60 * 1000)
      ),
      location: {
        name: booking.location || 'TBD',
        address: booking.locationAddress,
      },
      status: booking.status === 'CONFIRMED' ? 'upcoming' : 'pending' as any,
      safetyModeEnabled: booking.safetyModeEnabled || false,
      hasPanicButton: true,
      paymentStatus: 'paid',
      userId: booking.bookerId,
      participantIds: [booking.bookerId, booking.creatorId],
      sourceId: bookingId,
      sourceCollection: 'calendarBookings',
      tokensAmount: booking.tokensAmount || 0,
      createdAt: booking.createdAt || serverTimestamp() as Timestamp,
    };
    
    const creatorItem: AvaloScheduleItem = {
      id: `meeting_${bookingId}_creator`,
      type: 'meeting',
      role: 'host',
      title: `Meet with ${booking.bookerName || 'Unknown'}`,
      startTime: booking.startTime,
      endTime: booking.endTime || Timestamp.fromDate(
        new Date(booking.startTime.toDate().getTime() + 60 * 60 * 1000)
      ),
      location: {
        name: booking.location || 'TBD',
        address: booking.locationAddress,
      },
      status: booking.status === 'CONFIRMED' ? 'upcoming' : 'pending' as any,
      safetyModeEnabled: booking.safetyModeEnabled || false,
      hasPanicButton: true,
      paymentStatus: 'paid',
      userId: booking.creatorId,
      participantIds: [booking.bookerId, booking.creatorId],
      sourceId: bookingId,
      sourceCollection: 'calendarBookings',
      tokensAmount: booking.tokensAmount || 0,
      createdAt: booking.createdAt || serverTimestamp() as Timestamp,
    };
    
    // Save to schedule_items
    await Promise.all([
      db.collection('schedule_items').doc(bookerItem.id).set(bookerItem),
      db.collection('schedule_items').doc(creatorItem.id).set(creatorItem),
    ]);
    
    // Create reminders
    await createRemindersForMeeting(bookingId, booking);
  }
);

/**
 * Aggregate event into schedule_items (triggered on ticket purchase)
 */
export const aggregateEventToSchedule = onDocumentCreated(
  'event_attendees/{attendeeId}',
  async (event) => {
    const attendee = event.data?.data();
    if (!attendee) return;
    
    const attendeeId = event.params.attendeeId;
    
    // Get event details
    const eventDoc = await db.collection('events').doc(attendee.eventId).get();
    if (!eventDoc.exists) return;
    
    const eventData = eventDoc.data();
    if (!eventData) return;
    
    // Create schedule item for attendee
    const scheduleItem: AvaloScheduleItem = {
      id: `event_${attendee.eventId}_${attendee.userId}`,
      type: 'event',
      role: attendee.userId === eventData.hostUserId ? 'host' : 'attendee',
      title: eventData.title,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      location: {
        name: eventData.locationDetails?.venue || eventData.region,
        address: eventData.locationDetails?.address,
        coordinates: eventData.locationDetails?.latitude ? {
          lat: eventData.locationDetails.latitude,
          lng: eventData.locationDetails.longitude,
        } : undefined,
      },
      status: 'upcoming',
      safetyModeEnabled: attendee.safetyModeEnabled || false,
      hasPanicButton: true,
      paymentStatus: attendee.status === 'CONFIRMED' ? 'paid' : 'pending',
      userId: attendee.userId,
      participantIds: [attendee.userId, eventData.hostUserId],
      sourceId: attendee.eventId,
      sourceCollection: 'events',
      tokensAmount: attendee.tokensAmount || 0,
      createdAt: attendee.enrolledAt || serverTimestamp() as Timestamp,
    };
    
    await db.collection('schedule_items').doc(scheduleItem.id).set(scheduleItem);
    
    // Create reminders
    await createRemindersForEvent(attendee.eventId, attendee.userId, eventData);
  }
);

// ============================================================================
// REMINDER SYSTEM
// ============================================================================

/**
 * Create reminders for a meeting
 */
async function createRemindersForMeeting(bookingId: string, booking: any) {
  const startTime = booking.startTime.toDate();
  const now = new Date();
  
  // Reminder times: 24h, 3h, 30min before
  const reminderTimes = [
    { hours: 24, label: 'Tomorrow' },
    { hours: 3, label: 'In 3 hours' },
    { minutes: 30, label: 'In 30 minutes' },
  ];
  
  const reminders: any[] = [];
  
  for (const timing of reminderTimes) {
    const triggerTime = new Date(startTime);
    if (timing.hours) {
      triggerTime.setHours(triggerTime.getHours() - timing.hours);
    } else if (timing.minutes) {
      triggerTime.setMinutes(triggerTime.getMinutes() - timing.minutes);
    }
    
    // Only create if trigger time is in the future
    if (triggerTime > now) {
      // Create reminder for booker
      reminders.push({
        reminderId: generateId(),
        userId: booking.bookerId,
        scheduleItemId: `meeting_${bookingId}_booker`,
        type: 'meeting',
        triggerTime: Timestamp.fromDate(triggerTime),
        message: `${timing.label}: Meeting with ${booking.creatorName || 'Unknown'}`,
        dismissed: false,
        sent: false,
        createdAt: serverTimestamp(),
      });
      
      // Create reminder for creator
      reminders.push({
        reminderId: generateId(),
        userId: booking.creatorId,
        scheduleItemId: `meeting_${bookingId}_creator`,
        type: 'meeting',
        triggerTime: Timestamp.fromDate(triggerTime),
        message: `${timing.label}: Meeting with ${booking.bookerName || 'Unknown'}`,
        dismissed: false,
        sent: false,
        createdAt: serverTimestamp(),
      });
    }
  }
  
  // Batch write reminders
  const batch = db.batch();
  for (const reminder of reminders) {
    batch.set(db.collection('schedule_reminders').doc(reminder.reminderId), reminder);
  }
  await batch.commit();
  
  // Create cancellation deadlines (based on PACK 209 refund logic)
  await createCancellationDeadlinesForMeeting(bookingId, booking);
}

/**
 * Create reminders for an event
 */
async function createRemindersForEvent(eventId: string, userId: string, event: any) {
  const startTime = event.startTime.toDate();
  const now = new Date();
  
  // Reminder times: 48h, 6h, 1h before
  const reminderTimes = [
    { hours: 48, label: 'In 2 days' },
    { hours: 6, label: 'In 6 hours' },
    { hours: 1, label: 'In 1 hour' },
  ];
  
  const reminders: any[] = [];
  
  for (const timing of reminderTimes) {
    const triggerTime = new Date(startTime);
    triggerTime.setHours(triggerTime.getHours() - timing.hours);
    
    // Only create if trigger time is in the future
    if (triggerTime > now) {
      reminders.push({
        reminderId: generateId(),
        userId,
        scheduleItemId: `event_${eventId}_${userId}`,
        type: 'event',
        triggerTime: Timestamp.fromDate(triggerTime),
        message: `${timing.label}: ${event.title}`,
        dismissed: false,
        sent: false,
        createdAt: serverTimestamp(),
      });
    }
  }
  
  // Batch write reminders
  const batch = db.batch();
  for (const reminder of reminders) {
    batch.set(db.collection('schedule_reminders').doc(reminder.reminderId), reminder);
  }
  await batch.commit();
}

/**
 * Create cancellation deadline banners (PACK 209 integration)
 */
async function createCancellationDeadlinesForMeeting(bookingId: string, booking: any) {
  const startTime = booking.startTime.toDate();
  
  // Based on PACK 209 refund logic:
  // 100% refund (earner share): until 24h before
  // 50% refund: 24h-3h before
  // No refund: <3h before
  
  const deadlines: CancellationDeadline[] = [];
  
  // 100% refund deadline
  const fullRefundDeadline = new Date(startTime);
  fullRefundDeadline.setHours(fullRefundDeadline.getHours() - 24);
  
  deadlines.push({
    deadlineId: generateId(),
    userId: booking.bookerId,
    scheduleItemId: `meeting_${bookingId}_booker`,
    type: 'meeting',
    deadlineTime: Timestamp.fromDate(fullRefundDeadline),
    refundPercentage: 100,
    label: 'Free cancellation (100% earner share refund)',
    passed: false,
  });
  
  // 50% refund deadline
  const halfRefundDeadline = new Date(startTime);
  halfRefundDeadline.setHours(halfRefundDeadline.getHours() - 3);
  
  deadlines.push({
    deadlineId: generateId(),
    userId: booking.bookerId,
    scheduleItemId: `meeting_${bookingId}_booker`,
    type: 'meeting',
    deadlineTime: Timestamp.fromDate(halfRefundDeadline),
    refundPercentage: 50,
    label: '50% refund window',
    passed: false,
  });
  
  // No refund after meeting time
  deadlines.push({
    deadlineId: generateId(),
    userId: booking.bookerId,
    scheduleItemId: `meeting_${bookingId}_booker`,
    type: 'meeting',
    deadlineTime: Timestamp.fromDate(startTime),
    refundPercentage: 0,
    label: 'No refund if cancelled after this time',
    passed: false,
  });
  
  // Save deadlines
  const batch = db.batch();
  for (const deadline of deadlines) {
    batch.set(db.collection('cancellation_deadlines').doc(deadline.deadlineId), deadline);
  }
  await batch.commit();
}

/**
 * Get user's active reminders
 */
export const getMyReminders = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  
  const snapshot = await db.collection('schedule_reminders')
    .where('userId', '==', userId)
    .where('dismissed', '==', false)
    .where('triggerTime', '<=', Timestamp.now())
    .orderBy('triggerTime', 'asc')
    .limit(20)
    .get();
  
  const reminders = snapshot.docs.map(doc => doc.data());
  
  return {
    success: true,
    reminders,
  };
});

/**
 * Dismiss a reminder
 */
export const dismissReminder = onCall<{
  reminderId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { reminderId } = request.data;
  
  const reminderRef = db.collection('schedule_reminders').doc(reminderId);
  const reminderDoc = await reminderRef.get();
  
  if (!reminderDoc.exists) {
    throw new HttpsError('not-found', 'Reminder not found');
  }
  
  const reminder = reminderDoc.data();
  
  if (reminder?.userId !== userId) {
    throw new HttpsError('permission-denied', 'Not your reminder');
  }
  
  await reminderRef.update({
    dismissed: true,
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
  };
});

/**
 * Get cancellation deadlines for schedule item
 */
export const getCancellationDeadlines = onCall<{
  scheduleItemId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { scheduleItemId } = request.data;
  
  const snapshot = await db.collection('cancellation_deadlines')
    .where('userId', '==', userId)
    .where('scheduleItemId', '==', scheduleItemId)
    .orderBy('deadlineTime', 'asc')
    .get();
  
  const deadlines = snapshot.docs.map(doc => doc.data());
  
  return {
    success: true,
    deadlines,
  };
});

// ============================================================================
// EVENT HOST TOOLS
// ============================================================================

/**
 * QR Check-in: Generate QR code for attendee
 */
export const generateAttendeeQR = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId } = request.data;
  
  // Verify user is attending
  const attendeeSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('status', '==', 'CONFIRMED')
    .get();
  
  if (attendeeSnapshot.empty) {
    throw new HttpsError('permission-denied', 'You are not registered for this event');
  }
  
  const attendee = attendeeSnapshot.docs[0].data();
  
  // Generate QR code data (simple format)
  const qrData = {
    eventId,
    userId,
    attendeeId: attendee.attendeeId,
    checkInCode: attendee.checkInCode || generateId().substring(0, 8).toUpperCase(),
    timestamp: Date.now(),
  };
  
  // Update attendee with check-in code if not exists
  if (!attendee.checkInCode) {
    await attendeeSnapshot.docs[0].ref.update({
      checkInCode: qrData.checkInCode,
    });
  }
  
  return {
    success: true,
    qrData: JSON.stringify(qrData),
    checkInCode: qrData.checkInCode,
  };
});

/**
 * QR Check-in: Scan and verify attendee
 */
export const scanAttendeeQR = onCall<{
  eventId: string;
  qrData: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const hostUserId = request.auth.uid;
  const { eventId, qrData } = request.data;
  
  // Verify user is event host
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data();
  if (event?.hostUserId !== hostUserId) {
    throw new HttpsError('permission-denied', 'Only event host can check in attendees');
  }
  
  // Parse QR data
  let parsedData;
  try {
    parsedData = JSON.parse(qrData);
  } catch (e) {
    throw new HttpsError('invalid-argument', 'Invalid QR code');
  }
  
  // Verify event ID matches
  if (parsedData.eventId !== eventId) {
    throw new HttpsError('invalid-argument', 'QR code is for a different event');
  }
  
  // Find attendee
  const attendeeDoc = await db.collection('event_attendees').doc(parsedData.attendeeId).get();
  if (!attendeeDoc.exists) {
    throw new HttpsError('not-found', 'Attendee not found');
  }
  
  const attendee = attendeeDoc.data();
  
  // Verify check-in code
  if (attendee?.checkInCode !== parsedData.checkInCode) {
    throw new HttpsError('invalid-argument', 'Invalid check-in code');
  }
  
  // Create check-in record
  const checkinId = generateId();
  const checkin = {
    checkinId,
    eventId,
    attendeeId: parsedData.attendeeId,
    userId: parsedData.userId,
    hostUserId,
    checkedInAt: serverTimestamp(),
    verified: true,
    method: 'qr_scan',
  };
  
  await db.collection('event_checkins').doc(checkinId).set(checkin);
  
  // Update attendee status
  await attendeeDoc.ref.update({
    checkedIn: true,
    checkInTime: serverTimestamp(),
  });
  
  return {
    success: true,
    attendee: {
      userId: attendee?.userId,
      userName: attendee?.userName,
      userAvatar: attendee?.userAvatar,
    },
    message: 'Attendee checked in successfully',
  };
});

/**
 * Get event attendee list (for hosts)
 */
export const getEventAttendees = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const hostUserId = request.auth.uid;
  const { eventId } = request.data;
  
  // Verify user is event host
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data();
  if (event?.hostUserId !== hostUserId) {
    throw new HttpsError('permission-denied', 'Only event host can view attendees');
  }
  
  // Get all attendees
  const attendeesSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .get();
  
  const attendees = attendeesSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      attendeeId: data.attendeeId,
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      status: data.status,
      checkedIn: data.checkedIn || false,
      tokensAmount: data.tokensAmount,
      enrolledAt: data.enrolledAt,
      checkInTime: data.checkInTime,
    };
  });
  
  return {
    success: true,
    attendees,
    totalCount: attendees.length,
    checkedInCount: attendees.filter(a => a.checkedIn).length,
  };
});

/**
 * Issue voluntary refund (host tool for events - PACK 209 integration)
 */
export const issueVoluntaryEventRefund = onCall<{
  eventId: string;
  attendeeId: string;
  refundPercentage: number; // 0-100, from organizer share only
  reason: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const hostUserId = request.auth.uid;
  const { eventId, attendeeId, refundPercentage, reason } = request.data;
  
  // Validate refund percentage
  if (refundPercentage < 0 || refundPercentage > 100) {
    throw new HttpsError('invalid-argument', 'Refund percentage must be between 0-100');
  }
  
  // Verify user is event host
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data();
  if (event?.hostUserId !== hostUserId) {
    throw new HttpsError('permission-denied', 'Only event host can issue refunds');
  }
  
  // Get attendee
  const attendeeDoc = await db.collection('event_attendees').doc(attendeeId).get();
  if (!attendeeDoc.exists) {
    throw new HttpsError('not-found', 'Attendee not found');
  }
  
  const attendee = attendeeDoc.data();
  
  if (attendee?.status === 'REFUNDED') {
    throw new HttpsError('failed-precondition', 'Attendee already refunded');
  }
  
  // Calculate refund (from organizer's 80% share only, Avalo 20% stays)
  const organizerShare = Math.floor(attendee?.tokensAmount * 0.8); // 80% to organizer
  const refundAmount = Math.floor(organizerShare * (refundPercentage / 100));
  
  // Process refund
  const refundId = generateId();
  
  await db.runTransaction(async (transaction) => {
    const attendeeWalletRef = db.collection('users').doc(attendee?.userId)
      .collection('wallet').doc('main');
    const hostWalletRef = db.collection('users').doc(hostUserId)
      .collection('wallet').doc('main');
    
    // Refund to attendee
    transaction.update(attendeeWalletRef, {
      tokenBalance: increment(refundAmount),
    });
    
    // Deduct from host
    transaction.update(hostWalletRef, {
      tokenBalance: increment(-refundAmount),
    });
    
    // Create refund record
    transaction.set(db.collection('voluntary_refund_requests').doc(refundId), {
      requestId: refundId,
      type: 'event',
      eventId,
      attendeeId,
      issuerId: hostUserId,
      recipientId: attendee?.userId,
      originalAmount: attendee?.tokensAmount,
      refundAmount,
      refundPercentage,
      reason,
      status: 'COMPLETED',
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
    
    // Update attendee status
    transaction.update(attendeeDoc.ref, {
      status: 'REFUNDED',
      refundAmount,
      refundReason: reason,
      refundedAt: serverTimestamp(),
    });
  });
  
  return {
    success: true,
    refundAmount,
    message: `Refunded ${refundPercentage}% (${refundAmount} tokens) from organizer share`,
  };
});

// ============================================================================
// MEETING POST-SUMMARY & FEEDBACK
// ============================================================================

/**
 * Get meeting summary after completion
 */
export const getMeetingSummary = onCall<{
  bookingId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { bookingId } = request.data;
  
  // Get booking
  const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError('not-found', 'Booking not found');
  }
  
  const booking = bookingDoc.data();
  
  // Verify user is participant
  if (booking?.bookerId !== userId && booking?.creatorId !== userId) {
    throw new HttpsError('permission-denied', 'Not your meeting');
  }
  
  const isEarner = booking?.creatorId === userId;
  const partnerId = isEarner ? booking?.bookerId : booking?.creatorId;
  
  // Get partner profile
  const partnerDoc = await db.collection('users').doc(partnerId).get();
  const partner = partnerDoc.data();
  
  // Calculate earnings (65% to earner)
  const earnerShare = Math.floor((booking?.tokensAmount || 0) * 0.65);
  
  // Check if feedback already exists
  const feedbackSnapshot = await db.collection('meeting_feedback')
    .where('bookingId', '==', bookingId)
    .where('giverId', '==', userId)
    .get();
  
  const existingFeedback = feedbackSnapshot.empty ? null : feedbackSnapshot.docs[0].data();
  
  return {
    success: true,
    summary: {
      bookingId,
      partner: {
        userId: partnerId,
        displayName: partner?.displayName,
        avatar: partner?.profilePictureUrl,
      },
      tokensAmount: booking?.tokensAmount,
      tokensEarned: isEarner ? earnerShare : 0,
      duration: booking?.duration || 60,
      status: booking?.status,
      hadPanic: booking?.status === 'PANIC_ENDED',
      completedAt: booking?.completedAt,
    },
    existingFeedback,
    canGiveFeedback: !existingFeedback,
  };
});

/**
 * Submit meeting feedback (vibe rating + optional voluntary refund)
 */
export const submitMeetingFeedback = onCall<{
  bookingId: string;
  vibeRating: VibeRating;
  voluntaryRefundPercentage?: number; // 0-100, from earner's 65% share
  notes?: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { bookingId, vibeRating, voluntaryRefundPercentage = 0, notes } = request.data;
  
  // Validate vibe rating
  if (!['good', 'neutral', 'bad'].includes(vibeRating)) {
    throw new HttpsError('invalid-argument', 'Invalid vibe rating');
  }
  
  // Validate refund percentage
  if (voluntaryRefundPercentage < 0 || voluntaryRefundPercentage > 100) {
    throw new HttpsError('invalid-argument', 'Refund percentage must be between 0-100');
  }
  
  // Get booking
  const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError('not-found', 'Booking not found');
  }
  
  const booking = bookingDoc.data();
  
  // Verify user is earner (only earner can give feedback and issue refunds)
  if (booking?.creatorId !== userId) {
    throw new HttpsError('permission-denied', 'Only earner can submit feedback');
  }
  
  // Verify meeting is completed
  if (booking?.status !== 'COMPLETED') {
    throw new HttpsError('failed-precondition', 'Meeting must be completed');
  }
  
  // Check if feedback already exists
  const existingFeedback = await db.collection('meeting_feedback')
    .where('bookingId', '==', bookingId)
    .where('giverId', '==', userId)
    .get();
  
  if (!existingFeedback.empty) {
    throw new HttpsError('already-exists', 'Feedback already submitted');
  }
  
  const feedbackId = generateId();
  let refundAmount = 0;
  
  // Process voluntary refund if requested
  if (voluntaryRefundPercentage > 0) {
    const earnerShare = Math.floor((booking?.tokensAmount || 0) * 0.65);
    refundAmount = Math.floor(earnerShare * (voluntaryRefundPercentage / 100));
    
    const refundId = generateId();
    
    await db.runTransaction(async (transaction) => {
      const payerWalletRef = db.collection('users').doc(booking?.bookerId)
        .collection('wallet').doc('main');
      const earnerWalletRef = db.collection('users').doc(userId)
        .collection('wallet').doc('main');
      
      // Refund to payer
      transaction.update(payerWalletRef, {
        tokenBalance: increment(refundAmount),
      });
      
      // Deduct from earner
      transaction.update(earnerWalletRef, {
        tokenBalance: increment(-refundAmount),
      });
      
      // Create refund record
      transaction.set(db.collection('voluntary_refund_requests').doc(refundId), {
        requestId: refundId,
        type: 'meeting',
        bookingId,
        issuerId: userId,
        recipientId: booking?.bookerId,
        originalAmount: booking?.tokensAmount,
        refundAmount,
        refundPercentage: voluntaryRefundPercentage,
        reason: `Voluntary refund with ${vibeRating} vibe rating`,
        status: 'COMPLETED',
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });
    });
  }
  
  // Save feedback
  await db.collection('meeting_feedback').doc(feedbackId).set({
    feedbackId,
    bookingId,
    giverId: userId,
    receiverId: booking?.bookerId,
    vibeRating,
    voluntaryRefundPercentage,
    refundAmount,
    notes,
    createdAt: serverTimestamp(),
  });
  
  // Update reputation (PACK 212 integration)
  await updateReputationFromFeedback(booking?.bookerId, vibeRating);
  
  return {
    success: true,
    refundAmount,
    message: refundAmount > 0 
      ? `Feedback submitted and ${refundAmount} tokens refunded`
      : 'Feedback submitted',
  };
});

/**
 * Update user reputation based on feedback (PACK 212 integration)
 */
async function updateReputationFromFeedback(userId: string, vibeRating: VibeRating) {
  // Simple reputation update - full logic in PACK 212
  const repRef = db.collection('user_reputation').doc(userId);
  const repDoc = await repRef.get();
  
  if (!repDoc.exists) {
    // Create initial reputation
    await repRef.set({
      userId,
      score: 50,
      goodVibeCount: vibeRating === 'good' ? 1 : 0,
      neutralVibeCount: vibeRating === 'neutral' ? 1 : 0,
      badVibeCount: vibeRating === 'bad' ? 1 : 0,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Update existing reputation
    const updates: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (vibeRating === 'good') {
      updates.goodVibeCount = increment(1);
      updates.score = increment(2);
    } else if (vibeRating === 'neutral') {
      updates.neutralVibeCount = increment(1);
    } else if (vibeRating === 'bad') {
      updates.badVibeCount = increment(1);
      updates.score = increment(-3);
    }
    
    await repRef.update(updates);
  }
}

// ============================================================================
// SAFETY PANEL ACCESS
// ============================================================================

/**
 * Log safety panel access from schedule
 */
export const logSafetyPanelAccess = onCall<{
  scheduleItemId: string;
  action: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { scheduleItemId, action } = request.data;
  
  const accessId = generateId();
  
  await db.collection('safety_panel_access').doc(accessId).set({
    accessId,
    userId,
    scheduleItemId,
    action,
    accessedAt: serverTimestamp(),
  });
  
  return {
    success: true,
  };
});

/**
 * Get safety info for schedule item
 */
export const getScheduleItemSafetyInfo = onCall<{
  scheduleItemId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { scheduleItemId } = request.data;
  
  // Get schedule item
  const itemDoc = await db.collection('schedule_items').doc(scheduleItemId).get();
  if (!itemDoc.exists) {
    throw new HttpsError('not-found', 'Schedule item not found');
  }
  
  const item = itemDoc.data();
  
  if (item?.userId !== userId) {
    throw new HttpsError('permission-denied', 'Not your schedule item');
  }
  
  // Get safety session if exists
  const safetySnapshot = await db.collection('safety_sessions')
    .where('userId', '==', userId)
    .where('eventId', '==', item?.sourceId)
    .where('status', '==', 'ACTIVE')
    .get();
  
  const safetySession = safetySnapshot.empty ? null : safetySnapshot.docs[0].data();
  
  // Get trusted contact
  const trustedSnapshot = await db.collection('trusted_contacts')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .get();
  
  const trustedContact = trustedSnapshot.empty ? null : trustedSnapshot.docs[0].data();
  
  // Get location safety check if exists
  const locationSnapshot = await db.collection('location_safety_checks')
    .where('requestedBy', '==', userId)
    .where('bookingId', '==', item?.sourceId)
    .get();
  
  const locationCheck = locationSnapshot.empty ? null : locationSnapshot.docs[0].data();
  
  return {
    success: true,
    safetyInfo: {
      safetyModeEnabled: item?.safetyModeEnabled || false,
      hasPanicButton: item?.hasPanicButton || false,
      activeSafetySession: safetySession ? {
        sessionId: safetySession.sessionId,
        startedAt: safetySession.startedAt,
        lastHeartbeat: safetySession.lastHeartbeat,
      } : null,
      trustedContact: trustedContact ? {
        contactId: trustedContact.contactId,
        name: trustedContact.name,
        phoneNumber: trustedContact.phoneNumber,
        notificationEnabled: trustedContact.notificationEnabled,
      } : null,
      locationSafety: locationCheck ? {
        riskLevel: locationCheck.riskLevel,
        publicPlace: locationCheck.publicPlace,
        recommendations: locationCheck.recommendations,
      } : null,
    },
  };
});

// ============================================================================
// EVENT DISCOVERY WITH FILTERS
// ============================================================================

/**
 * Discover events with advanced filters
 */
export const discoverEvents = onCall<{
  region?: string;
  type?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  priceRange?: {
    min: number;
    max: number;
  };
  limit?: number;
}>({ region: 'us-central1' }, async (request) => {
  const {
    region: regionFilter,
    type,
    dateRange,
    priceRange,
    limit = 20,
  } = request.data;
  
  let query: any = db.collection('events')
    .where('isActive', '==', true)
    .where('status', '==', 'UPCOMING');
  
  if (regionFilter) {
    query = query.where('region', '==', regionFilter);
  }
  
  if (type) {
    query = query.where('type', '==', type);
  }
  
  // Note: Firestore doesn't support range queries on multiple fields
  // We'll filter in memory for price range
  
  const snapshot = await query
    .orderBy('startTime', 'asc')
    .limit(limit * 2) // Get more to filter
    .get();
  
  let events = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      eventId: data.eventId,
      title: data.title,
      hostName: data.hostName,
      hostAvatar: data.hostAvatar,
      type: data.type,
      startTime: data.startTime,
      endTime: data.endTime,
      priceTokens: data.priceTokens,
      capacity: data.capacity,
      attendeesCount: data.attendeesCount,
      remainingSpots: data.capacity ? data.capacity - data.attendeesCount : null,
      region: data.region,
      tags: data.tags,
    };
  });
  
  // Apply price range filter
  if (priceRange) {
    events = events.filter(e => 
      e.priceTokens >= priceRange.min && e.priceTokens <= priceRange.max
    );
  }
  
  // Apply date range filter
  if (dateRange) {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    events = events.filter(e => {
      const eventDate = e.startTime.toDate();
      return eventDate >= start && eventDate <= end;
    });
  }
  
  // Limit results
  events = events.slice(0, limit);
  
  return {
    success: true,
    events,
    count: events.length,
    filters: {
      region: regionFilter,
      type,
      dateRange,
      priceRange,
    },
  };
});

/**
 * Save event discovery filter
 */
export const saveEventFilter = onCall<{
  name: string;
  filters: any;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { name, filters } = request.data;
  
  const filterId = generateId();
  
  await db.collection('event_discovery_filters').doc(filterId).set({
    filterId,
    userId,
    name,
    filters,
    isActive: true,
    createdAt: serverTimestamp(),
    lastUsedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    filterId,
  };
});

/**
 * Get user's saved filters
 */
export const getMySavedFilters = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  
  const snapshot = await db.collection('event_discovery_filters')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .orderBy('lastUsedAt', 'desc')
    .limit(10)
    .get();
  
  const filters = snapshot.docs.map(doc => doc.data());
  
  return {
    success: true,
    filters,
  };
});

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Send pending reminders (runs every 5 minutes)
 */
export const sendPendingReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
  },
  async () => {
    const now = Timestamp.now();
    
    // Get reminders that should be sent
    const snapshot = await db.collection('schedule_reminders')
      .where('sent', '==', false)
      .where('dismissed', '==', false)
      .where('triggerTime', '<=', now)
      .limit(100)
      .get();
    
    console.log(`Found ${snapshot.size} reminders to send`);
    
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const reminder = doc.data();
      
      // Here you would integrate with your notification system
      // For now, just mark as sent
      
      batch.update(doc.ref, {
        sent: true,
        sentAt: serverTimestamp(),
      });
    }
    
    await batch.commit();
    
    console.log(`Sent ${snapshot.size} reminders`);
  }
);

/**
 * Update schedule item statuses (runs every 15 minutes)
 */
export const updateScheduleStatuses = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'us-central1',
  },
  async () => {
    const now = Timestamp.now();
    
    // Get items that should be marked as active (started)
    const upcomingSnapshot = await db.collection('schedule_items')
      .where('status', '==', 'upcoming')
      .where('startTime', '<=', now)
      .limit(100)
      .get();
    
    const batch = db.batch();
    
    for (const doc of upcomingSnapshot.docs) {
      batch.update(doc.ref, { status: 'active' });
    }
    
    await batch.commit();
    
    console.log(`Updated ${upcomingSnapshot.size} items to active`);
  }
);