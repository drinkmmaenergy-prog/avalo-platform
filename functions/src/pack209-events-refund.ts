/**
 * PACK 209: Event Refund & Complaint Extensions
 * Extends events.ts with unified refund policies, complaints, and voluntary refunds
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import { FunctionResponse } from './types';
import {
  calculateEventRefund,
  processEventAppearanceComplaint,
  processVoluntaryEventRefund,
} from './pack209-refund-complaint-engine';
import { RefundTransaction, RefundTrigger, ComplaintDecision } from './pack209-refund-complaint-types';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * PACK 209: Enhanced event organizer cancellation with refund policy
 * 
 * Rules (80% organizer / 20% Avalo - commission NEVER refunded):
 * - Organizer cancels: 100% of organizer share (80%) refunded to all participants
 * - Avalo keeps 20% commission (non-refundable)
 */
export const cancelEventWithRefunds = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ refundedCount: number; totalRefunded: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const organizerId = request.auth.uid;
    const { eventId, reason } = request.data;

    // Get event
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as any;

    // Verify organizer
    if (event.hostUserId !== organizerId) {
      throw new HttpsError('permission-denied', 'Only the organizer can cancel this event');
    }

    // Cannot cancel completed events
    if (event.status === 'completed') {
      throw new HttpsError('failed-precondition', 'Cannot cancel completed events');
    }

    // Update event status
    await eventRef.update({
      status: 'cancelled',
      isActive: false,
      cancelledBy: organizerId,
      cancelledAt: serverTimestamp(),
      cancelReason: reason,
      updatedAt: serverTimestamp(),
    });

    // Get all confirmed attendees
    const attendeesSnapshot = await db
      .collection('event_attendees')
      .where('eventId', '==', eventId)
      .where('status', '==', 'CONFIRMED')
      .get();

    let refundedCount = 0;
    let totalRefunded = 0;

    // Process refunds for each attendee
    for (const attendeeDoc of attendeesSnapshot.docs) {
      const attendee = attendeeDoc.data() as any;

      if (attendee.tokensAmount > 0) {
        // Calculate refund using PACK 209 engine
        const refundCalc = await calculateEventRefund({
          eventId,
          priceTokens: attendee.tokensAmount,
          organizerShareTokens: attendee.creatorEarnings, // 80%
          avaloCommission: attendee.platformFee, // 20%
          cancelledBy: 'organizer',
          reason,
        });

        const refundAmount = refundCalc.refundToPayerAmount;

        if (refundAmount > 0) {
          await db.runTransaction(async (transaction) => {
            // Refund to participant
            const participantWalletRef = db
              .collection('users')
              .doc(attendee.userId)
              .collection('wallet')
              .doc('current');

            transaction.update(participantWalletRef, {
              balance: increment(refundAmount),
            });

            // Deduct from organizer (return their earnings)
            const organizerWalletRef = db
              .collection('users')
              .doc(organizerId)
              .collection('wallet')
              .doc('current');

            transaction.update(organizerWalletRef, {
              balance: increment(-refundAmount),
              earned: increment(-refundAmount),
            });

            // Update attendee status
            transaction.update(attendeeDoc.ref, {
              status: 'REFUNDED',
              refundAmount,
              refundedAt: serverTimestamp(),
            });

            // Create refund transaction log
            const refundTxId = generateId();
            const refundTransaction: RefundTransaction = {
              transactionId: refundTxId,
              refundType: RefundTrigger.ORGANIZER_CANCEL,
              eventId,
              attendeeId: attendee.attendeeId,
              payerId: attendee.userId,
              earnerId: organizerId,
              originalAmount: attendee.tokensAmount,
              earnerShare: attendee.creatorEarnings,
              avaloCommission: attendee.platformFee,
              refundToPayerAmount: refundAmount,
              earnerKeptAmount: 0,
              avaloKeptAmount: attendee.platformFee,
              triggeredBy: organizerId,
              automaticRefund: false,
              notes: reason || 'Organizer cancelled event',
              createdAt: serverTimestamp() as Timestamp,
              processedAt: serverTimestamp() as Timestamp,
              metadata: {
                source: 'event',
                cancellationReason: reason,
              },
            };
            transaction.set(db.collection('refund_transactions').doc(refundTxId), refundTransaction);

            // Record transaction
            const txId = generateId();
            transaction.set(db.collection('transactions').doc(txId), {
              txId,
              userId: attendee.userId,
              type: 'EVENT_REFUND',
              amountTokens: refundAmount,
              status: 'completed',
              metadata: {
                eventId,
                attendeeId: attendee.attendeeId,
                refundTxId,
                pack209: true,
              },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            });
          });

          refundedCount++;
          totalRefunded += refundAmount;
        }
      } else {
        // Free event - just update status
        await attendeeDoc.ref.update({
          status: 'CANCELLED',
        });
      }
    }

    return {
      ok: true,
      data: {
        refundedCount,
        totalRefunded,
      },
    };
  }
);

/**
 * PACK 209: File appearance complaint for event participant
 * Organizer decides whether to refund
 */
export const fileEventAppearanceComplaint = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ complaintId: string; refundAmount: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const organizerId = request.auth.uid;
    const {
      eventId,
      attendeeId,
      reportedUserId,
      shouldRefund,
      notes,
    } = request.data;

    // Verify organizer owns the event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as any;
    if (event.hostUserId !== organizerId) {
      throw new HttpsError('permission-denied', 'Only the organizer can file complaints');
    }

    const result = await processEventAppearanceComplaint({
      eventId,
      attendeeId,
      organizerId,
      reportedUserId,
      shouldRefund,
      notes,
    });

    return {
      ok: true,
      data: {
        complaintId: result.complaintId,
        refundAmount: result.refundAmount,
      },
    };
  }
);

/**
 * PACK 209: Issue voluntary refund from organizer to specific attendee
 * Organizer can refund 0-100% of their share (80%)
 * Avalo commission (20%) is NEVER refunded
 */
export const issueEventVoluntaryRefund = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ refundId: string; refundAmount: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const organizerId = request.auth.uid;
    const { eventId, attendeeId, refundPercent, reason } = request.data;

    // Validate refund percent
    if (refundPercent < 0 || refundPercent > 100) {
      throw new HttpsError('invalid-argument', 'Refund percent must be between 0 and 100');
    }

    // Verify organizer owns the event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as any;
    if (event.hostUserId !== organizerId) {
      throw new HttpsError('permission-denied', 'Only the organizer can issue refunds');
    }

    const result = await processVoluntaryEventRefund({
      eventId,
      attendeeId,
      organizerId,
      refundPercent,
      reason,
    });

    return {
      ok: true,
      data: {
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    };
  }
);

/**
 * PACK 209: Participant leaves event (no refund per policy)
 * Overrides existing leaveEvent to use PACK 209 logging
 */
export const leaveEventWithPack209 = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ message: string }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const { eventId } = request.data;

    // Find attendee record
    const attendeeSnapshot = await db
      .collection('event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', 'CONFIRMED')
      .get();

    if (attendeeSnapshot.empty) {
      throw new HttpsError('not-found', 'You are not enrolled in this event');
    }

    const attendeeDoc = attendeeSnapshot.docs[0];
    const attendee = attendeeDoc.data() as any;

    // Get event to check if it has started
    const eventDoc = await db.collection('events').doc(eventId).get();
    const event = eventDoc.data() as any;

    const now = new Date();
    const eventStart = event.startTime.toDate();

    if (now >= eventStart) {
      throw new HttpsError('failed-precondition', 'Cannot leave an event that has already started');
    }

    // PACK 209: Calculate what would be refunded (always 0 for participant cancellation)
    const refundCalc = await calculateEventRefund({
      eventId,
      priceTokens: attendee.tokensAmount,
      organizerShareTokens: attendee.creatorEarnings,
      avaloCommission: attendee.platformFee,
      cancelledBy: 'participant',
    });

    // Update attendee status (NO REFUND per policy)
    await attendeeDoc.ref.update({
      status: 'CANCELLED_BY_USER',
      hasLocationAccess: false,
      cancelledAt: serverTimestamp(),
    });

    // Decrement attendee count
    await db.collection('events').doc(eventId).update({
      attendeesCount: increment(-1),
    });

    // PACK 209: Log the cancellation for tracking
    if (attendee.tokensAmount > 0) {
      const refundTxId = generateId();
      const refundTransaction: RefundTransaction = {
        transactionId: refundTxId,
        refundType: RefundTrigger.CANCELLATION_LATE, // Participant cancellation
        eventId,
        attendeeId: attendee.attendeeId,
        payerId: userId,
        earnerId: event.hostUserId,
        originalAmount: attendee.tokensAmount,
        earnerShare: attendee.creatorEarnings,
        avaloCommission: attendee.platformFee,
        refundToPayerAmount: 0,
        earnerKeptAmount: attendee.creatorEarnings,
        avaloKeptAmount: attendee.platformFee,
        triggeredBy: userId,
        automaticRefund: false,
        notes: 'Participant cancelled - no refunds per policy',
        createdAt: serverTimestamp() as Timestamp,
        processedAt: serverTimestamp() as Timestamp,
        metadata: {
          source: 'event',
          cancellationReason: 'Participant left event',
        },
      };
      await db.collection('refund_transactions').doc(refundTxId).set(refundTransaction);
    }

    return {
      ok: true,
      data: {
        message: 'You have left the event. Note: No refunds are provided for participant cancellations per policy.',
      },
    };
  }
);