/**
 * PACK 212: Soft Reputation Engine - Cloud Functions
 * HTTP-callable functions for reputation management
 * 
 * EXTENSION MODULE - Does not replace existing logic
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  initializeUserReputation,
  getUserReputation,
  updateReputationScore,
  getRankingMultiplier,
  getReputationHint,
  getActiveAdjustments,
  requiresExtraVerification,
  getEffectiveRiskScore,
  getReputationStats,
  recalculateAllAdjustments,
} from './pack212-reputation-engine';
import {
  UpdateReputationRequest,
  GetReputationHintRequest,
  GetRankingMultiplierRequest,
  ChatFeedback,
  MeetingFeedback,
  EventGuestRating,
  FEEDBACK_LIMITS,
  FEEDBACK_ELIGIBILITY,
} from './pack212-reputation-types';

const db = admin.firestore();

// ============================================================================
// USER-FACING FUNCTIONS
// ============================================================================

/**
 * Get user's reputation hint (positive only)
 * Users can call this to see if they have any positive feedback
 */
export const pack212_getMyReputationHint = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to get reputation hint'
      );
    }

    const request: GetReputationHintRequest = {
      userId: context.auth.uid,
    };

    try {
      const hint = await getReputationHint(request);
      return hint;
    } catch (error) {
      console.error('Error getting reputation hint:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Error getting reputation hint'
      );
    }
  }
);

/**
 * Submit chat feedback (optional thumbs up/down after chat)
 */
export const pack212_submitChatFeedback = functions.https.onCall(
  async (data: {
    chatId: string;
    receiverId: string;
    isPositive: boolean;
    comment?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { chatId, receiverId, isPositive, comment } = data;

    try {
      // Verify chat eligibility
      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Chat not found');
      }

      const chat = chatDoc.data();
      if (!chat) {
        throw new functions.https.HttpsError('not-found', 'Chat data not found');
      }

      // Check if user was part of the chat
      const participants = chat.participants || [];
      if (!participants.includes(context.auth.uid) || !participants.includes(receiverId)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not a participant in this chat'
        );
      }

      // Check if already submitted feedback for this chat
      const existingFeedback = await db
        .collection('chat_feedback')
        .where('chatId', '==', chatId)
        .where('giverId', '==', context.auth.uid)
        .limit(1)
        .get();

      if (!existingFeedback.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Feedback already submitted for this chat'
        );
      }

      // Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const feedbackToday = await db
        .collection('chat_feedback')
        .where('giverId', '==', context.auth.uid)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(today))
        .get();

      if (feedbackToday.size >= FEEDBACK_LIMITS.CHAT_FEEDBACK_PER_DAY) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Daily feedback limit reached'
        );
      }

      // Get giver name
      const giverDoc = await db.collection('users').doc(context.auth.uid).get();
      const giverName = giverDoc.data()?.displayName || 'Anonymous';

      // Get receiver name
      const receiverDoc = await db.collection('users').doc(receiverId).get();
      const receiverName = receiverDoc.data()?.displayName || 'Anonymous';

      // Create feedback
      const feedbackId = db.collection('chat_feedback').doc().id;
      const feedback: ChatFeedback = {
        feedbackId,
        chatId,
        giverId: context.auth.uid,
        giverName,
        receiverId,
        receiverName,
        isPositive,
        comment: comment?.substring(0, 500), // Max 500 chars
        chatDuration: chat.duration || 0,
        messageCount: chat.messageCount || 0,
        createdAt: admin.firestore.Timestamp.now(),
      };

      await db.collection('chat_feedback').doc(feedbackId).set(feedback);

      // Update reputation if positive
      if (isPositive) {
        await updateReputationScore({
          userId: receiverId,
          eventType: 'POSITIVE_FEEDBACK_RECEIVED',
          relatedUserId: context.auth.uid,
          contextId: chatId,
        });
      }

      return { success: true, feedbackId };
    } catch (error) {
      console.error('Error submitting chat feedback:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Error submitting feedback');
    }
  }
);

/**
 * Submit meeting feedback (optional vibe rating after meeting)
 */
export const pack212_submitMeetingFeedback = functions.https.onCall(
  async (data: {
    bookingId: string;
    receiverId: string;
    vibeRating: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    showedUp: boolean;
    wouldMeetAgain: boolean;
    comment?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { bookingId, receiverId, vibeRating, showedUp, wouldMeetAgain, comment } = data;

    try {
      // Verify booking
      const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Booking not found');
      }

      const booking = bookingDoc.data();
      if (!booking) {
        throw new functions.https.HttpsError('not-found', 'Booking data not found');
      }

      // Check if user was part of the booking
      if (booking.bookerId !== context.auth.uid && booking.creatorId !== context.auth.uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not a participant in this booking'
        );
      }

      // Check if booking is completed
      if (booking.status !== 'COMPLETED') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Booking must be completed to submit feedback'
        );
      }

      // Check if already submitted
      const existingFeedback = await db
        .collection('meeting_feedback')
        .where('bookingId', '==', bookingId)
        .where('giverId', '==', context.auth.uid)
        .limit(1)
        .get();

      if (!existingFeedback.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Feedback already submitted for this meeting'
        );
      }

      // Get names
      const giverDoc = await db.collection('users').doc(context.auth.uid).get();
      const giverName = giverDoc.data()?.displayName || 'Anonymous';

      const receiverDoc = await db.collection('users').doc(receiverId).get();
      const receiverName = receiverDoc.data()?.displayName || 'Anonymous';

      // Create feedback
      const feedbackId = db.collection('meeting_feedback').doc().id;
      const feedback: MeetingFeedback = {
        feedbackId,
        bookingId,
        giverId: context.auth.uid,
        giverName,
        receiverId,
        receiverName,
        vibeRating,
        showedUp,
        wouldMeetAgain,
        comment: comment?.substring(0, 500),
        createdAt: admin.firestore.Timestamp.now(),
        metadata: {
          meetingDuration: booking.duration,
          location: booking.location?.address,
        },
      };

      await db.collection('meeting_feedback').doc(feedbackId).set(feedback);

      // Update reputation
      if (showedUp) {
        await updateReputationScore({
          userId: receiverId,
          eventType: 'MEETING_ATTENDED',
          relatedUserId: context.auth.uid,
          contextId: bookingId,
        });
      } else {
        await updateReputationScore({
          userId: receiverId,
          eventType: 'MEETING_NO_SHOW',
          relatedUserId: context.auth.uid,
          contextId: bookingId,
        });
      }

      if (vibeRating === 'POSITIVE') {
        await updateReputationScore({
          userId: receiverId,
          eventType: 'POSITIVE_VIBE_RATING',
          relatedUserId: context.auth.uid,
          contextId: bookingId,
        });
      }

      return { success: true, feedbackId };
    } catch (error) {
      console.error('Error submitting meeting feedback:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Error submitting feedback');
    }
  }
);

/**
 * Submit event guest rating (organizer only)
 */
export const pack212_rateEventGuest = functions.https.onCall(
  async (data: {
    eventId: string;
    attendeeId: string;
    guestId: string;
    isGoodGuest: boolean;
    showedUp: boolean;
    respectful: boolean;
    engaged: boolean;
    comment?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { eventId, attendeeId, guestId, isGoodGuest, showedUp, respectful, engaged, comment } = data;

    try {
      // Verify organizer
      const eventDoc = await db.collection('events').doc(eventId).get();
      if (!eventDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Event not found');
      }

      const event = eventDoc.data();
      if (!event) {
        throw new functions.https.HttpsError('not-found', 'Event data not found');
      }

      if (event.organizerId !== context.auth.uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only event organizer can rate guests'
        );
      }

      // Check if already rated
      const existingRating = await db
        .collection('event_guest_ratings')
        .where('eventId', '==', eventId)
        .where('attendeeId', '==', attendeeId)
        .where('organizerId', '==', context.auth.uid)
        .limit(1)
        .get();

      if (!existingRating.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Guest already rated for this event'
        );
      }

      // Get names
      const organizerDoc = await db.collection('users').doc(context.auth.uid).get();
      const organizerName = organizerDoc.data()?.displayName || 'Anonymous';

      const guestDoc = await db.collection('users').doc(guestId).get();
      const guestName = guestDoc.data()?.displayName || 'Anonymous';

      // Create rating
      const ratingId = db.collection('event_guest_ratings').doc().id;
      const rating: EventGuestRating = {
        ratingId,
        eventId,
        attendeeId,
        organizerId: context.auth.uid,
        organizerName,
        guestId,
        guestName,
        isGoodGuest,
        showedUp,
        respectful,
        engaged,
        comment: comment?.substring(0, 500),
        createdAt: admin.firestore.Timestamp.now(),
        metadata: {
          eventType: event.type,
          attendeeCount: event.attendeeCount,
        },
      };

      await db.collection('event_guest_ratings').doc(ratingId).set(rating);

      // Update reputation
      if (showedUp) {
        await updateReputationScore({
          userId: guestId,
          eventType: 'EVENT_ATTENDED',
          relatedUserId: context.auth.uid,
          contextId: eventId,
        });
      }

      if (isGoodGuest) {
        await updateReputationScore({
          userId: guestId,
          eventType: 'GOOD_GUEST_RATING',
          relatedUserId: context.auth.uid,
          contextId: eventId,
        });
      }

      return { success: true, ratingId };
    } catch (error) {
      console.error('Error rating event guest:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Error rating guest');
    }
  }
);

// ============================================================================
// INTERNAL INTEGRATION FUNCTIONS (Called by other systems)
// ============================================================================

/**
 * Update reputation score (called by other systems)
 * This is the main integration point for all reputation events
 */
export const pack212_updateReputation = functions.https.onCall(
  async (data: UpdateReputationRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Verify caller has admin or system role
    const callerDoc = await db.collection('users').doc(context.auth.uid).get();
    const roles = callerDoc.data()?.roles || {};
    
    if (!roles.admin && !roles.system) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admin or system can update reputation'
      );
    }

    try {
      const result = await updateReputationScore(data);
      return result;
    } catch (error) {
      console.error('Error updating reputation:', error);
      throw new functions.https.HttpsError('internal', 'Error updating reputation');
    }
  }
);

/**
 * Get ranking multiplier for use in discovery/feed
 * Called by discovery engines to boost/limit users
 */
export const pack212_getRankingMultiplier = functions.https.onCall(
  async (data: GetRankingMultiplierRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    try {
      const multiplier = await getRankingMultiplier(data);
      return multiplier;
    } catch (error) {
      console.error('Error getting ranking multiplier:', error);
      throw new functions.https.HttpsError('internal', 'Error getting multiplier');
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get reputation statistics (admin only)
 */
export const pack212_admin_getStats = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Verify admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const roles = userDoc.data()?.roles || {};
    
    if (!roles.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admin can view stats'
      );
    }

    try {
      const stats = await getReputationStats();
      return stats;
    } catch (error) {
      console.error('Error getting reputation stats:', error);
      throw new functions.https.HttpsError('internal', 'Error getting stats');
    }
  }
);

/**
 * Recalculate all adjustments (admin only)
 */
export const pack212_admin_recalculateAdjustments = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Verify admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const roles = userDoc.data()?.roles || {};
    
    if (!roles.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admin can recalculate'
      );
    }

    try {
      const result = await recalculateAllAdjustments();
      return result;
    } catch (error) {
      console.error('Error recalculating adjustments:', error);
      throw new functions.https.HttpsError('internal', 'Error recalculating');
    }
  }
);

/**
 * Get user's full reputation profile (admin only)
 */
export const pack212_admin_getUserReputation = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Verify admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const roles = userDoc.data()?.roles || {};
    
    if (!roles.admin && !roles.safety_team) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admin can view full reputation'
      );
    }

    try {
      const reputation = await getUserReputation(data.userId);
      const adjustments = await getActiveAdjustments(data.userId);
      
      return {
        reputation,
        adjustments,
      };
    } catch (error) {
      console.error('Error getting user reputation:', error);
      throw new functions.https.HttpsError('internal', 'Error getting reputation');
    }
  }
);

// ============================================================================
// BACKGROUND TRIGGERS
// ============================================================================

/**
 * Initialize reputation on user creation
 */
export const pack212_onUserCreate = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    
    try {
      await initializeUserReputation(userId);
      console.log(`Initialized reputation for user ${userId}`);
    } catch (error) {
      console.error(`Error initializing reputation for user ${userId}:`, error);
    }
  });