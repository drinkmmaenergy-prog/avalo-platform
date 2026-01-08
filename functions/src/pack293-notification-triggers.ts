/**
 * PACK 293 - Notifications & Activity Center
 * Trigger functions for creating notifications from other packs
 */

import { enqueueNotification } from './pack293-notification-service';
import {
  NotificationPayload,
  NotificationContext,
} from './pack293-notification-types';

// ============================================================================
// MATCHING & DISCOVERY NOTIFICATIONS
// ============================================================================

/**
 * Send match notification to both users
 */
export async function notifyNewMatch(
  userId1: string,
  userId2: string,
  matchId: string
): Promise<void> {
  const context: NotificationContext = {
    matchId,
    profileId: userId2, // For userId1
  };

  await Promise.all([
    enqueueNotification({
      userId: userId1,
      type: 'MATCH',
      title: '🎉 New Match!',
      body: 'You have a new match. Start chatting now!',
      context: { ...context, profileId: userId2 },
      priority: 'HIGH',
    }),
    enqueueNotification({
      userId: userId2,
      type: 'MATCH',
      title: '🎉 New Match!',
      body: 'You have a new match. Start chatting now!',
      context: { ...context, profileId: userId1 },
      priority: 'HIGH',
    }),
  ]);
}

/**
 * Send profile visit notification
 */
export async function notifyProfileVisit(
  userId: string,
  visitorId: string,
  visitorName: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'NEW_VISIT',
    title: 'Profile View',
    body: `${visitorName} viewed your profile`,
    context: {
      profileId: visitorId,
    },
    priority: 'LOW',
  });
}

/**
 * Send like notification
 */
export async function notifyProfileLike(
  userId: string,
  likerId: string,
  likerName: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'NEW_LIKE',
    title: '❤️ New Like',
    body: `${likerName} likes you!`,
    context: {
      profileId: likerId,
    },
    priority: 'NORMAL',
  });
}

// ============================================================================
// CHAT & MESSAGING NOTIFICATIONS
// ============================================================================

/**
 * Send new message notification
 */
export async function notifyNewMessage(
  userId: string,
  senderId: string,
  senderName: string,
  chatId: string,
  messageId: string,
  messagePreview: string
): Promise<void> {
  // Sanitize message preview (no explicit content in push)
  const safePreview = messagePreview.substring(0, 50);
  
  await enqueueNotification({
    userId,
    type: 'NEW_MESSAGE',
    title: senderName,
    body: safePreview,
    context: {
      chatId,
      messageId,
      profileId: senderId,
    },
    priority: 'NORMAL',
  });
}

/**
 * Send missed message reminder
 */
export async function notifyMissedMessage(
  userId: string,
  senderId: string,
  senderName: string,
  chatId: string,
  missedCount: number
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'MISSED_MESSAGE_REMINDER',
    title: 'Missed Messages',
    body: `You have ${missedCount} unread message${missedCount > 1 ? 's' : ''} from ${senderName}`,
    context: {
      chatId,
      profileId: senderId,
    },
    priority: 'LOW',
    batchKey: `missed_${userId}_${chatId}`,
  });
}

/**
 * Send chat request notification
 */
export async function notifyChatRequest(
  userId: string,
  requesterId: string,
  requesterName: string,
  chatId: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'NEW_CHAT_REQUEST',
    title: 'New Chat Request',
    body: `${requesterName} wants to chat with you`,
    context: {
      chatId,
      profileId: requesterId,
    },
    priority: 'NORMAL',
  });
}

// ============================================================================
// CALENDAR & BOOKINGS NOTIFICATIONS
// ============================================================================

/**
 * Send booking created notification to host
 */
export async function notifyBookingCreatedHost(
  hostId: string,
  guestName: string,
  bookingId: string,
  bookingDate: string
): Promise<void> {
  await enqueueNotification({
    userId: hostId,
    type: 'CALENDAR_BOOKING_CREATED',
    title: 'New Booking',
    body: `${guestName} booked a meeting with you on ${bookingDate}`,
    context: {
      bookingId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send booking confirmed notification to guest
 */
export async function notifyBookingCreatedGuest(
  guestId: string,
  hostName: string,
  bookingId: string,
  bookingDate: string
): Promise<void> {
  await enqueueNotification({
    userId: guestId,
    type: 'CALENDAR_BOOKING_CREATED',
    title: 'Booking Confirmed',
    body: `Your booking with ${hostName} on ${bookingDate} is confirmed`,
    context: {
      bookingId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send booking updated notification
 */
export async function notifyBookingUpdated(
  userId: string,
  otherPartyName: string,
  bookingId: string,
  changeDescription: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'CALENDAR_BOOKING_UPDATED',
    title: 'Booking Updated',
    body: `${otherPartyName} updated the booking: ${changeDescription}`,
    context: {
      bookingId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send booking cancelled notification
 */
export async function notifyBookingCancelled(
  userId: string,
  otherPartyName: string,
  bookingId: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'CALENDAR_BOOKING_CANCELLED',
    title: 'Booking Cancelled',
    body: `${otherPartyName} cancelled the booking`,
    context: {
      bookingId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send calendar reminder notification
 */
export async function notifyCalendarReminder(
  userId: string,
  otherPartyName: string,
  bookingId: string,
  minutesUntil: number
): Promise<void> {
  const timeText = minutesUntil >= 60 
    ? `${Math.floor(minutesUntil / 60)} hour${Math.floor(minutesUntil / 60) > 1 ? 's' : ''}`
    : `${minutesUntil} minutes`;
    
  await enqueueNotification({
    userId,
    type: 'CALENDAR_REMINDER',
    title: 'Meeting Reminder',
    body: `Your meeting with ${otherPartyName} starts in ${timeText}`,
    context: {
      bookingId,
    },
    priority: 'HIGH',
  });
}

// ============================================================================
// EVENTS NOTIFICATIONS
// ============================================================================

/**
 * Send event ticket confirmed notification
 */
export async function notifyEventTicketConfirmed(
  userId: string,
  eventId: string,
  eventName: string,
  eventDate: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'EVENT_TICKET_CONFIRMED',
    title: 'Event Ticket Confirmed',
    body: `Your ticket for "${eventName}" on ${eventDate} is confirmed`,
    context: {
      eventId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send event reminder notification
 */
export async function notifyEventReminder(
  userId: string,
  eventId: string,
  eventName: string,
  hoursUntil: number
): Promise<void> {
  const timeText = hoursUntil >= 24 
    ? `${Math.floor(hoursUntil / 24)} day${Math.floor(hoursUntil / 24) > 1 ? 's' : ''}`
    : `${hoursUntil} hours`;
    
  await enqueueNotification({
    userId,
    type: 'EVENT_REMINDER',
    title: 'Event Reminder',
    body: `"${eventName}" starts in ${timeText}`,
    context: {
      eventId,
    },
    priority: 'HIGH',
  });
}

/**
 * Send event cancelled notification
 */
export async function notifyEventCancelled(
  userId: string,
  eventId: string,
  eventName: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'EVENT_CANCELLED',
    title: 'Event Cancelled',
    body: `"${eventName}" has been cancelled. You will receive a full refund.`,
    context: {
      eventId,
    },
    priority: 'HIGH',
  });
}

// ============================================================================
// CREATOR & EARNINGS NOTIFICATIONS
// ============================================================================

/**
 * Send AI tip/suggestion to creator
 */
export async function notifyAITip(
  userId: string,
  tipTitle: string,
  tipBody: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'TIP_AI_SUGGESTION',
    title: tipTitle,
    body: tipBody,
    priority: 'LOW',
  });
}

/**
 * Send creator earnings summary
 */
export async function notifyCreatorEarningsSummary(
  userId: string,
  period: string,
  amountTokens: number,
  amountUSD: number
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'CREATOR_EARNINGS_SUMMARY',
    title: 'Earnings Summary',
    body: `You earned ${amountTokens} tokens ($${amountUSD.toFixed(2)}) ${period}`,
    context: {
      amountTokens,
    },
    priority: 'NORMAL',
    delivery: {
      push: false,
      inApp: true,
      email: true,
    },
  });
}

// ============================================================================
// SYSTEM & SAFETY NOTIFICATIONS
// ============================================================================

/**
 * Send system alert notification
 */
export async function notifySystemAlert(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'SYSTEM_ALERT',
    title,
    body,
    priority: 'HIGH',
    delivery: {
      push: true,
      inApp: true,
      email: true,
    },
  });
}

/**
 * Send safety alert notification
 */
export async function notifySafetyAlert(
  userId: string,
  title: string,
  body: string,
  context?: NotificationContext
): Promise<void> {
  await enqueueNotification({
    userId,
    type: 'SAFETY_ALERT',
    title,
    body,
    context: context || {},
    priority: 'CRITICAL',
    delivery: {
      push: true,
      inApp: true,
      email: true,
    },
  });
}

/**
 * Send panic contact alert
 * Used when user activates panic button during a meeting
 */
export async function notifyPanicContact(
  contactId: string,
  userName: string,
  location: { lat: number; lng: number },
  bookingId?: string
): Promise<void> {
  await enqueueNotification({
    userId: contactId,
    type: 'PANIC_CONTACT_ALERT',
    title: '🚨 EMERGENCY ALERT',
    body: `${userName} has activated their panic button and may need help`,
    context: {
      bookingId,
      ...location,
    },
    priority: 'CRITICAL',
    delivery: {
      push: true,
      inApp: true,
      email: true,
    },
  });
}

// ============================================================================
// BATCH NOTIFICATIONS
// ============================================================================

/**
 * Batch multiple low-priority notifications together
 * Used for daily/weekly summaries
 */
export async function notifyBatchSummary(
  userId: string,
  type: 'LIKES' | 'VISITS' | 'MESSAGES',
  count: number
): Promise<void> {
  const titles = {
    LIKES: 'New Likes',
    VISITS: 'Profile Views',
    MESSAGES: 'Unread Messages',
  };

  const bodies = {
    LIKES: `You have ${count} new like${count > 1 ? 's' : ''}`,
    VISITS: `${count} people viewed your profile`,
    MESSAGES: `You have ${count} unread message${count > 1 ? 's' : ''}`,
  };

  await enqueueNotification({
    userId,
    type: type === 'LIKES' ? 'NEW_LIKE' : type === 'VISITS' ? 'NEW_VISIT' : 'MISSED_MESSAGE_REMINDER',
    title: titles[type],
    body: bodies[type],
    priority: 'LOW',
    batchKey: `daily_${type.toLowerCase()}_${userId}`,
  });
}