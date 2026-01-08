/**
 * PACK 315 - Push Notifications & Growth Funnels
 * Integration Helpers for Existing Flows
 * 
 * This file provides helper functions to trigger notifications from
 * existing systems (chat, calendar, wallet, events, safety, etc.)
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
  enqueueNewMessage,
  enqueueBookingConfirmed,
  enqueueMeetingReminder,
  enqueuePayoutCompleted,
  enqueueVerificationNudge,
  enqueueNotification
} from './enqueue';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// Chat & Social Integrations
// ============================================================================

/**
 * Trigger when a new chat message is sent
 * Call from chat message creation function
 */
export async function notifyNewMessage(
  recipientUserId: string,
  chatId: string,
  senderName: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    // Check if recipient is online (has recent device activity)
    const devicesSnapshot = await db
      .collection('userDevices')
      .where('userId', '==', recipientUserId)
      .where('enabled', '==', true)
      .get();
    
    if (devicesSnapshot.empty) {
      return; // No devices, skip notification
    }
    
    // Check if any device was active in last 5 minutes (user is online)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const isOnline = devicesSnapshot.docs.some(doc => {
      const device = doc.data();
      return device.lastSeenAt > fiveMinutesAgo;
    });
    
    if (isOnline) {
      return; // User is online, don't send push
    }
    
    await enqueueNewMessage(db, recipientUserId, chatId, senderName);
  } catch (error) {
    logger.error('Failed to notify new message', { error, recipientUserId, chatId });
  }
}

/**
 * Trigger when users match
 */
export async function notifyNewMatch(
  userId1: string,
  userId2: string,
  matchId: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    // Notify both users
    await Promise.all([
      enqueueNotification(db, {
        userId: userId1,
        type: 'NEW_MATCH',
        category: 'TRANSACTIONAL',
        data: {
          screen: 'CHAT',
          screenParams: { matchId }
        }
      }),
      enqueueNotification(db, {
        userId: userId2,
        type: 'NEW_MATCH',
        category: 'TRANSACTIONAL',
        data: {
          screen: 'CHAT',
          screenParams: { matchId }
        }
      })
    ]);
  } catch (error) {
    logger.error('Failed to notify new match', { error, userId1, userId2 });
  }
}

/**
 * Trigger when someone likes a profile
 */
export async function notifyNewLike(
  targetUserId: string,
  likerUserId: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId: targetUserId,
      type: 'NEW_LIKE',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'SWIPE',
        screenParams: { likerUserId }
      },
      priority: 'NORMAL'
    });
  } catch (error) {
    logger.error('Failed to notify new like', { error, targetUserId });
  }
}

// ============================================================================
// Calendar & Meetings Integrations
// ============================================================================

/**
 * Trigger when a booking is confirmed
 */
export async function notifyBookingConfirmed(
  userId: string,
  bookingId: string,
  bookingData: {
    startTime: string;
    participantName: string;
  }
): Promise<void> {
  try {
    const db = getFirestore();
    
    // Send confirmation notification
    await enqueueBookingConfirmed(db, userId, bookingId);
    
    // Schedule reminder notification 1 hour before
    const startTime = new Date(bookingData.startTime);
    await enqueueMeetingReminder(db, userId, bookingId, startTime);
  } catch (error) {
    logger.error('Failed to notify booking confirmed', { error, userId, bookingId });
  }
}

/**
 * Trigger when a meeting is cancelled
 */
export async function notifyMeetingCancelled(
  userId: string,
  bookingId: string,
  cancelledBy: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'MEETING_CANCELLED',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'CALENDAR',
        screenParams: { bookingId }
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify meeting cancelled', { error, userId });
  }
}

/**
 * Trigger when a meeting refund is processed
 */
export async function notifyMeetingRefund(
  userId: string,
  bookingId: string,
  refundAmount: number
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'MEETING_REFUND_PROCESSED',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'WALLET',
        screenParams: { bookingId, refundAmount }
      }
    });
  } catch (error) {
    logger.error('Failed to notify meeting refund', { error, userId });
  }
}

// ============================================================================
// Events Integrations
// ============================================================================

/**
 * Trigger when event ticket is confirmed
 */
export async function notifyEventTicketConfirmed(
  userId: string,
  eventId: string,
  eventData: {
    name: string;
    startTime: string;
  }
): Promise<void> {
  try {
    const db = getFirestore();
    
    // Send confirmation
    await enqueueNotification(db, {
      userId,
      type: 'EVENT_TICKET_CONFIRMED',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'EVENT',
        screenParams: { eventId }
      }
    });
    
    // Schedule reminder 2 hours before event
    const startTime = new Date(eventData.startTime);
    const reminderTime = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
    
    await enqueueNotification(db, {
      userId,
      type: 'EVENT_REMINDER',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'EVENT',
        screenParams: { eventId }
      },
      scheduledAtOverride: reminderTime.toISOString()
    });
  } catch (error) {
    logger.error('Failed to notify event ticket', { error, userId, eventId });
  }
}

/**
 * Trigger when event is updated
 */
export async function notifyEventUpdated(
  attendeeUserIds: string[],
  eventId: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await Promise.all(
      attendeeUserIds.map(userId =>
        enqueueNotification(db, {
          userId,
          type: 'EVENT_UPDATED',
          category: 'TRANSACTIONAL',
          data: {
            screen: 'EVENT',
            screenParams: { eventId }
          }
        })
      )
    );
  } catch (error) {
    logger.error('Failed to notify event update', { error, eventId });
  }
}

/**
 * Trigger when event is cancelled
 */
export async function notifyEventCancelled(
  attendeeUserIds: string[],
  eventId: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await Promise.all(
      attendeeUserIds.map(userId =>
        enqueueNotification(db, {
          userId,
          type: 'EVENT_CANCELLED',
          category: 'TRANSACTIONAL',
          data: {
            screen: 'EVENT',
            screenParams: { eventId }
          },
          priority: 'HIGH'
        })
      )
    );
  } catch (error) {
    logger.error('Failed to notify event cancellation', { error, eventId });
  }
}

// ============================================================================
// Wallet & Payouts Integrations
// ============================================================================

/**
 * Trigger when token purchase succeeds
 */
export async function notifyTokenPurchaseSuccess(
  userId: string,
  purchaseId: string,
  tokenAmount: number
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'TOKEN_PURCHASE_SUCCESS',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'WALLET',
        screenParams: { purchaseId, tokenAmount }
      }
    });
  } catch (error) {
    logger.error('Failed to notify token purchase', { error, userId });
  }
}

/**
 * Trigger when token purchase fails
 */
export async function notifyTokenPurchaseFailed(
  userId: string,
  purchaseId: string,
  reason: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'TOKEN_PURCHASE_FAILED_RETRY',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'WALLET',
        screenParams: { purchaseId }
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify token purchase failure', { error, userId });
  }
}

/**
 * Trigger when payout is initiated
 */
export async function notifyPayoutInitiated(
  userId: string,
  payoutId: string,
  amount: number,
  currency: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'PAYOUT_INITIATED',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'WALLET',
        screenParams: { payoutId, amount, currency }
      }
    });
  } catch (error) {
    logger.error('Failed to notify payout initiated', { error, userId });
  }
}

/**
 * Trigger when payout is completed
 */
export async function notifyPayoutComplete(
  userId: string,
  payoutId: string,
  amount: number,
  currency: string
): Promise<void> {
  try {
    const db = getFirestore();
    await enqueuePayoutCompleted(db, userId, payoutId, amount, currency);
  } catch (error) {
    logger.error('Failed to notify payout complete', { error, userId });
  }
}

/**
 * Trigger when payout fails
 */
export async function notifyPayoutFailed(
  userId: string,
  payoutId: string,
  reason: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'PAYOUT_FAILED_CONTACT_SUPPORT',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'WALLET',
        screenParams: { payoutId }
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify payout failure', { error, userId });
  }
}

// ============================================================================
// Verification & Account Integrations
// ============================================================================

/**
 * Trigger verification nudge for incomplete verification
 */
export async function notifyVerificationNeeded(userId: string): Promise<void> {
  try {
    const db = getFirestore();
    await enqueueVerificationNudge(db, userId);
  } catch (error) {
    logger.error('Failed to notify verification needed', { error, userId });
  }
}

/**
 * Trigger when verification is successful
 */
export async function notifyVerificationSuccess(userId: string): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'VERIFICATION_SUCCESS',
      category: 'TRANSACTIONAL',
      data: {
        screen: 'PROFILE'
      },
      priority: 'NORMAL'
    });
  } catch (error) {
    logger.error('Failed to notify verification success', { error, userId });
  }
}

// ============================================================================
// Safety & Moderation Integrations
// ============================================================================

/**
 * Trigger after panic button event
 */
export async function notifyPanicButtonFollowup(
  userId: string,
  incidentId: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    // Schedule follow-up notification 1 hour after panic button
    const followupTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    
    await enqueueNotification(db, {
      userId,
      type: 'PANIC_BUTTON_FOLLOWUP',
      category: 'SAFETY',
      data: {
        screen: 'SAFETY_CENTER',
        screenParams: { incidentId }
      },
      scheduledAtOverride: followupTime,
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify panic button followup', { error, userId });
  }
}

/**
 * Trigger when account is under review
 */
export async function notifyAccountUnderReview(
  userId: string,
  caseId: string,
  reason: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'ACCOUNT_UNDER_REVIEW',
      category: 'SAFETY',
      data: {
        screen: 'SAFETY_CENTER',
        screenParams: { caseId }
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify account review', { error, userId });
  }
}

/**
 * Trigger when account is restored
 */
export async function notifyAccountRestored(userId: string): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'ACCOUNT_RESTORED',
      category: 'SAFETY',
      data: {
        screen: 'PROFILE'
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify account restored', { error, userId });
  }
}

/**
 * Trigger when account is banned
 */
export async function notifyAccountBanned(
  userId: string,
  reason: string
): Promise<void> {
  try {
    const db = getFirestore();
    
    await enqueueNotification(db, {
      userId,
      type: 'ACCOUNT_BANNED',
      category: 'SAFETY',
      data: {
        screen: 'SAFETY_CENTER'
      },
      priority: 'HIGH'
    });
  } catch (error) {
    logger.error('Failed to notify account ban', { error, userId });
  }
}

// ============================================================================
// Export All Integration Functions
// ============================================================================

export const NotificationIntegrations = {
  // Chat & Social
  notifyNewMessage,
  notifyNewMatch,
  notifyNewLike,
  
  // Meetings
  notifyBookingConfirmed,
  notifyMeetingCancelled,
  notifyMeetingRefund,
  
  // Events
  notifyEventTicketConfirmed,
  notifyEventUpdated,
  notifyEventCancelled,
  
  // Wallet
  notifyTokenPurchaseSuccess,
  notifyTokenPurchaseFailed,
  notifyPayoutInitiated,
  notifyPayoutComplete,
  notifyPayoutFailed,
  
  // Verification
  notifyVerificationNeeded,
  notifyVerificationSuccess,
  
  // Safety
  notifyPanicButtonFollowup,
  notifyAccountUnderReview,
  notifyAccountRestored,
  notifyAccountBanned
};