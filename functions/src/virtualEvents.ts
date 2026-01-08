/**
 * PACK 118 — Virtual Events / Live Classes Backend Functions
 * 
 * Token-Only Access | 65/35 Split | Zero NSFW Tolerance
 * Full Safety Enforcement | No Dating/Escort Services
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  VirtualEvent,
  VirtualEventAttendee,
  VirtualEventType,
  VirtualEventStatus,
  AttendeeStatus,
  CreateVirtualEventRequest,
  UpdateVirtualEventRequest,
  CancelVirtualEventRequest,
  JoinVirtualEventRequest,
  LeaveVirtualEventRequest,
  CheckInToEventRequest,
  ListVirtualEventsRequest,
  GetMyEventsRequest,
  VirtualEventResponse,
  validateVirtualEventData,
  calculateEventRevenueSplit,
  containsBlockedKeywords,
} from './types/virtualEvents.types';

const db = getFirestore();

// ============================================================================
// CREATE VIRTUAL EVENT
// ============================================================================

/**
 * Create a new virtual event (verified creators only)
 */
export const pack118_createEvent = onCall<CreateVirtualEventRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    // 1. Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const data = request.data;

    // 2. Verify creator status
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    if (!userData?.earnFromChat) {
      throw new HttpsError(
        'permission-denied',
        'Only verified creators can host virtual events'
      );
    }

    // 3. Parse timestamps
    const startTime = Timestamp.fromDate(new Date(data.startTime));
    const endTime = Timestamp.fromDate(new Date(data.endTime));
    const waitingRoomMinutes = data.waitingRoomMinutesBefore || 15;
    const waitingRoomOpenAt = Timestamp.fromDate(
      new Date(startTime.toMillis() - waitingRoomMinutes * 60 * 1000)
    );

    // 4. Build event object
    const eventId = db.collection('virtual_events').doc().id;
    const event: VirtualEvent = {
      eventId,
      hostUserId: userId,
      hostName: userData.name || 'Unknown',
      hostAvatar: userData.profilePicture || undefined,
      
      title: data.title,
      description: data.description,
      type: data.type,
      
      priceTokens: data.priceTokens,
      
      maxParticipants: data.maxParticipants,
      currentParticipants: 0,
      
      startTime,
      endTime,
      waitingRoomOpenAt,
      
      status: VirtualEventStatus.UPCOMING,
      nsfwLevel: 'SAFE',
      
      recordingEnabled: data.recordingEnabled || false,
      recordingUrl: null,
      recordingAvailableUntil: null,
      
      assistants: [],
      
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      
      tags: data.tags || [],
      region: data.region,
    };

    // 5. Validate event data
    const validation = validateVirtualEventData(event);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.errors.join('; '));
    }

    // 6. Additional NSFW checks
    if (containsBlockedKeywords(event.title) || containsBlockedKeywords(event.description)) {
      throw new HttpsError(
        'invalid-argument',
        'Event content violates policy. Virtual events must be SAFE only - no NSFW, dating, or escort services.'
      );
    }

    // 7. Save to Firestore
    await db.collection('virtual_events').doc(eventId).set(event);

    // 8. Log creation
    await db.collection('system_logs').add({
      type: 'VIRTUAL_EVENT_CREATED',
      eventId,
      hostUserId: userId,
      eventType: event.type,
      priceTokens: event.priceTokens,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Virtual event created successfully',
      eventId,
      data: { event },
    };
  }
);

// ============================================================================
// UPDATE VIRTUAL EVENT
// ============================================================================

/**
 * Update an existing virtual event
 */
export const pack118_updateEvent = onCall<UpdateVirtualEventRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, ...updates } = request.data;

    // 1. Get existing event
    const eventRef = db.collection('virtual_events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify ownership
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can update event');
    }

    // 3. Check if event can be updated
    if (event.status !== VirtualEventStatus.UPCOMING) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot update event that is in progress or completed'
      );
    }

    // 4. Build update object
    const updateData: Partial<VirtualEvent> = {
      updatedAt: Timestamp.now(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.priceTokens !== undefined) updateData.priceTokens = updates.priceTokens;
    if (updates.maxParticipants !== undefined) updateData.maxParticipants = updates.maxParticipants;
    if (updates.recordingEnabled !== undefined) updateData.recordingEnabled = updates.recordingEnabled;
    if (updates.tags !== undefined) updateData.tags = updates.tags;

    if (updates.startTime) {
      updateData.startTime = Timestamp.fromDate(new Date(updates.startTime));
    }
    if (updates.endTime) {
      updateData.endTime = Timestamp.fromDate(new Date(updates.endTime));
    }

    // 5. Validate updates
    const validation = validateVirtualEventData({ ...event, ...updateData });
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.errors.join('; '));
    }

    // 6. NSFW check
    const titleToCheck = updateData.title || event.title;
    const descToCheck = updateData.description || event.description;
    if (containsBlockedKeywords(titleToCheck) || containsBlockedKeywords(descToCheck)) {
      throw new HttpsError(
        'invalid-argument',
        'Update contains prohibited content. Virtual events must be SAFE only.'
      );
    }

    // 7. Apply updates
    await eventRef.update(updateData);

    return {
      success: true,
      message: 'Event updated successfully',
      eventId,
    };
  }
);

// ============================================================================
// CANCEL VIRTUAL EVENT
// ============================================================================

/**
 * Cancel a virtual event (host only) with automatic refunds
 */
export const pack118_cancelEvent = onCall<CancelVirtualEventRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId, reason } = request.data;

    // 1. Get event
    const eventRef = db.collection('virtual_events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Verify ownership
    if (event.hostUserId !== userId) {
      throw new HttpsError('permission-denied', 'Only event host can cancel event');
    }

    // 3. Check if can be cancelled
    if (event.status !== VirtualEventStatus.UPCOMING) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot cancel event that is in progress or already completed'
      );
    }

    // 4. Process refunds in batched transaction
    const attendeesSnapshot = await db
      .collection('virtual_event_attendees')
      .where('eventId', '==', eventId)
      .where('status', '==', AttendeeStatus.ENROLLED)
      .get();

    let refundedCount = 0;

    // Process refunds in batches of 10 (Firestore transaction limit is 500)
    const batchSize = 10;
    for (let i = 0; i < attendeesSnapshot.docs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = attendeesSnapshot.docs.slice(i, i + batchSize);

      for (const attendeeDoc of batchDocs) {
        const attendee = attendeeDoc.data() as VirtualEventAttendee;

        if (attendee.tokensAmount > 0) {
          // Refund tokens to attendee
          const userWalletRef = db.collection('user_wallets').doc(attendee.userId);
          batch.update(userWalletRef, {
            balance: FieldValue.increment(attendee.tokensAmount),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Deduct from host creator balance
          const creatorBalanceRef = db.collection('creator_balances').doc(event.hostUserId);
          batch.update(creatorBalanceRef, {
            pendingTokens: FieldValue.increment(-attendee.hostEarnings),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Create refund transaction record
          const refundTransactionRef = db.collection('token_transactions').doc();
          batch.set(refundTransactionRef, {
            userId: attendee.userId,
            type: 'VIRTUAL_EVENT_REFUND',
            amount: attendee.tokensAmount,
            eventId,
            attendeeId: attendee.attendeeId,
            reason: `Event cancelled by host: ${reason}`,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        // Update attendee status
        batch.update(attendeeDoc.ref, {
          status: AttendeeStatus.REFUNDED,
          refundedAt: Timestamp.now(),
        });

        refundedCount++;
      }

      await batch.commit();
    }

    // 5. Update event status
    await eventRef.update({
      status: VirtualEventStatus.CANCELLED,
      updatedAt: Timestamp.now(),
    });

    // 6. Log cancellation
    await db.collection('system_logs').add({
      type: 'VIRTUAL_EVENT_CANCELLED',
      eventId,
      hostUserId: userId,
      reason,
      refundedAttendees: refundedCount,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Event cancelled. Refunded ${refundedCount} attendees.`,
      data: { refundedCount },
    };
  }
);

// ============================================================================
// JOIN VIRTUAL EVENT
// ============================================================================

/**
 * Join/enroll in a virtual event with token payment
 */
export const pack118_joinEvent = onCall<JoinVirtualEventRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    return await db.runTransaction(async (transaction) => {
      // 1. Get event
      const eventRef = db.collection('virtual_events').doc(eventId);
      const eventDoc = await transaction.get(eventRef);

      if (!eventDoc.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }

      const event = eventDoc.data() as VirtualEvent;

      // 2. Validation checks
      if (event.hostUserId === userId) {
        throw new HttpsError('failed-precondition', 'Cannot join your own event');
      }

      if (event.status !== VirtualEventStatus.UPCOMING) {
        throw new HttpsError('failed-precondition', 'Event is not accepting enrollments');
      }

      if (event.currentParticipants >= event.maxParticipants) {
        throw new HttpsError('failed-precondition', 'Event is full');
      }

      const now = Date.now();
      const eventStartTime = event.startTime.toMillis();
      const minutesUntilStart = (eventStartTime - now) / (60 * 1000);

      if (minutesUntilStart < 5) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot join event less than 5 minutes before start'
        );
      }

      // 3. Check if already enrolled
      const existingEnrollmentSnapshot = await db
        .collection('virtual_event_attendees')
        .where('eventId', '==', eventId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!existingEnrollmentSnapshot.empty) {
        throw new HttpsError('already-exists', 'Already enrolled in this event');
      }

      // 4. Get user data
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const userName = userData?.name || 'Unknown';
      const userAvatar = userData?.profilePicture;

      // 5. Handle payment if not free
      let platformFee = 0;
      let hostEarnings = 0;

      if (event.priceTokens > 0) {
        // Check balance
        const userWalletRef = db.collection('user_wallets').doc(userId);
        const walletDoc = await transaction.get(userWalletRef);

        if (!walletDoc.exists) {
          throw new HttpsError('failed-precondition', 'User wallet not found');
        }

        const walletData = walletDoc.data();
        const currentBalance = walletData?.balance || 0;

        if (currentBalance < event.priceTokens) {
          throw new HttpsError(
            'failed-precondition',
            `Insufficient tokens. Required: ${event.priceTokens}, Available: ${currentBalance}`
          );
        }

        // Calculate split
        const split = calculateEventRevenueSplit(event.priceTokens);
        platformFee = split.platformFee;
        hostEarnings = split.hostEarnings;

        // Deduct tokens from user
        transaction.update(userWalletRef, {
          balance: FieldValue.increment(-event.priceTokens),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Add to host creator balance
        const creatorBalanceRef = db.collection('creator_balances').doc(event.hostUserId);
        transaction.set(
          creatorBalanceRef,
          {
            userId: event.hostUserId,
            pendingTokens: FieldValue.increment(hostEarnings),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Create transaction record
        const transactionRef = db.collection('token_transactions').doc();
        transaction.set(transactionRef, {
          userId,
          type: 'VIRTUAL_EVENT_ENROLLMENT',
          amount: -event.priceTokens,
          eventId,
          hostUserId: event.hostUserId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 6. Create attendee record
      const attendeeId = db.collection('virtual_event_attendees').doc().id;
      const attendee: VirtualEventAttendee = {
        attendeeId,
        eventId,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        
        userId,
        userName,
        userAvatar,
        
        hostUserId: event.hostUserId,
        
        tokensAmount: event.priceTokens,
        platformFee,
        hostEarnings,
        
        status: AttendeeStatus.ENROLLED,
        
        hasRecordingAccess: true,
        checkedInAt: null,
        joinedLiveAt: null,
        
        enrolledAt: Timestamp.now(),
        refundedAt: null,
        transactionId: undefined,
      };

      transaction.set(db.collection('virtual_event_attendees').doc(attendeeId), attendee);

      // 7. Increment participant count
      transaction.update(eventRef, {
        currentParticipants: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: 'Successfully enrolled in event',
        data: { attendee, event },
      };
    });
  }
);

// ============================================================================
// LEAVE VIRTUAL EVENT
// ============================================================================

/**
 * Leave a virtual event (NO REFUND per policy)
 */
export const pack118_leaveEvent = onCall<LeaveVirtualEventRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // 1. Find enrollment
    const attendeeSnapshot = await db
      .collection('virtual_event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', AttendeeStatus.ENROLLED)
      .limit(1)
      .get();

    if (attendeeSnapshot.empty) {
      throw new HttpsError('not-found', 'Enrollment not found');
    }

    const attendeeDoc = attendeeSnapshot.docs[0];
    const attendee = attendeeDoc.data() as VirtualEventAttendee;

    // 2. Get event
    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 3. Check if event hasn't started
    if (event.status !== VirtualEventStatus.UPCOMING) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot leave event that has already started'
      );
    }

    // 4. Update attendee status (NO REFUND)
    await attendeeDoc.ref.update({
      status: 'CANCELLED_BY_USER' as any, // Custom status
      hasRecordingAccess: false,
    });

    // 5. Decrement participant count
    await db.collection('virtual_events').doc(eventId).update({
      currentParticipants: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. Log
    await db.collection('system_logs').add({
      type: 'VIRTUAL_EVENT_LEAVE',
      eventId,
      userId,
      tokensLost: attendee.tokensAmount,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Left event. Note: No refund per policy.',
    };
  }
);

// ============================================================================
// CHECK IN TO EVENT
// ============================================================================

/**
 * Check in to waiting room before event starts
 */
export const pack118_checkInToEvent = onCall<CheckInToEventRequest, Promise<VirtualEventResponse>>(
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

    // 2. Check timing
    const now = Date.now();
    const waitingRoomOpen = event.waitingRoomOpenAt.toMillis();
    const eventStart = event.startTime.toMillis();

    if (now < waitingRoomOpen) {
      throw new HttpsError(
        'failed-precondition',
        'Waiting room not open yet'
      );
    }

    if (now > eventStart) {
      throw new HttpsError(
        'failed-precondition',
        'Event has already started. Join the live session directly.'
      );
    }

    // 3. Get attendee record
    const attendeeSnapshot = await db
      .collection('virtual_event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', AttendeeStatus.ENROLLED)
      .limit(1)
      .get();

    if (attendeeSnapshot.empty) {
      throw new HttpsError('permission-denied', 'Not enrolled in this event');
    }

    const attendeeDoc = attendeeSnapshot.docs[0];

    // 4. Update check-in status
    await attendeeDoc.ref.update({
      status: AttendeeStatus.CHECKED_IN,
      checkedInAt: Timestamp.now(),
    });

    // 5. Add to live session waiting room
    const sessionRef = db.collection('live_sessions').doc(eventId);
    await sessionRef.set(
      {
        eventId,
        status: 'WAITING_ROOM',
        waitingRoomUsers: FieldValue.arrayUnion(userId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      message: 'Checked in to waiting room',
    };
  }
);

// ============================================================================
// LIST VIRTUAL EVENTS
// ============================================================================

/**
 * List upcoming virtual events (time-sorted only, no ranking)
 */
export const pack118_listEventsByRegion = onCall<ListVirtualEventsRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    const { region, limit = 50, startAfter } = request.data;

    // 1. Build query - TIME-SORTED ONLY (no popularity/revenue ranking)
    let query = db
      .collection('virtual_events')
      .where('status', '==', VirtualEventStatus.UPCOMING)
      .where('startTime', '>', Timestamp.now())
      .orderBy('startTime', 'asc')
      .limit(Math.min(limit, 100));

    // Optional region filter
    if (region) {
      query = query.where('region', '==', region) as any;
    }

    // Pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('virtual_events').doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc) as any;
      }
    }

    // 2. Execute query
    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => ({
      ...doc.data(),
      eventId: doc.id,
    }));

    return {
      success: true,
      message: 'Events retrieved',
      data: {
        events,
        count: events.length,
        hasMore: snapshot.docs.length === limit,
      },
    };
  }
);

// ============================================================================
// GET EVENT DETAILS
// ============================================================================

/**
 * Get detailed event information
 */
export const pack118_getEventDetails = onCall<{ eventId: string }, Promise<VirtualEventResponse>>(
  async (request) => {
    const { eventId } = request.data;
    const userId = request.auth?.uid;

    // 1. Get event
    const eventDoc = await db.collection('virtual_events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as VirtualEvent;

    // 2. Check if user is enrolled
    let isEnrolled = false;
    let attendeeData = null;

    if (userId) {
      const attendeeSnapshot = await db
        .collection('virtual_event_attendees')
        .where('eventId', '==', eventId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!attendeeSnapshot.empty) {
        isEnrolled = true;
        attendeeData = attendeeSnapshot.docs[0].data();
      }
    }

    return {
      success: true,
      message: 'Event details retrieved',
      data: {
        event,
        isEnrolled,
        attendee: attendeeData,
      },
    };
  }
);

// ============================================================================
// GET MY EVENTS
// ============================================================================

/**
 * Get user's enrolled events
 */
export const pack118_getMyEvents = onCall<GetMyEventsRequest, Promise<VirtualEventResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { status, limit = 50 } = request.data;

    // 1. Get user's attendee records
    let query = db
      .collection('virtual_event_attendees')
      .where('userId', '==', userId)
      .orderBy('eventStartTime', 'desc')
      .limit(Math.min(limit, 100));

    if (status) {
      // Filter by upcoming vs completed
      if (status === 'UPCOMING') {
        query = query.where('eventStartTime', '>', Timestamp.now()) as any;
      } else if (status === 'COMPLETED') {
        query = query.where('eventStartTime', '<=', Timestamp.now()) as any;
      }
    }

    const attendeeSnapshot = await query.get();

    // 2. Get event details
    const eventIds = attendeeSnapshot.docs.map(doc => doc.data().eventId);
    const events = await Promise.all(
      eventIds.map(async (eventId) => {
        const eventDoc = await db.collection('virtual_events').doc(eventId).get();
        return eventDoc.exists ? { ...eventDoc.data(), eventId } : null;
      })
    );

    const validEvents = events.filter(e => e !== null);

    return {
      success: true,
      message: 'My events retrieved',
      data: {
        events: validEvents,
        count: validEvents.length,
      },
    };
  }
);