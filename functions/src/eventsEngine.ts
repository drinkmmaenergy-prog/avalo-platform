/**
 * PACK 275 - Events Engine
 * Cloud Functions for ticket management, QR codes, refunds, and safety
 * 
 * KEY FEATURES:
 * - 80/20 revenue split (Organizer 80%, Avalo 20%)
 * - QR code generation and check-in
 * - Selfie verification at entry
 * - Full refund on organizer cancellation (including Avalo fee)
 * - No refund on participant cancellation
 * - Mismatch refund (appearance doesn't match profile)
 * - 70% check-in threshold for payout
 * - Goodwill refunds by organizer
 * - Safety hooks integration
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import {
  Event,
  EventTicket,
  TicketStatus,
  EventStatus,
  QRCodePayload,
  CheckInResult,
  MismatchReport,
  EventCompletionAnalysis,
  OrganizerPayout,
  SafetyEventHook
} from '../../app-mobile/types/events';

const db = getFirestore();

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const AVALO_SHARE_PERCENT = 20;
const ORGANIZER_SHARE_PERCENT = 80;
const CHECK_IN_THRESHOLD_PERCENT = 70;
const PAYOUT_FREEZE_HOURS = 72;
const QR_CODE_SECRET = process.env.QR_CODE_SECRET || 'avalo-events-secret-key';

// ============================================================================
// TICKET PURCHASE WITH 80/20 SPLIT
// ============================================================================

/**
 * Purchase a ticket for an event
 * Splits payment: 80% to organizer (pending), 20% to Avalo (immediate)
 */
export async function purchaseEventTicket(
  eventId: string,
  participantId: string
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const ticketId = `${participantId}_${eventId}`;

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Get event details
      const eventRef = db.collection('events').doc(eventId);
      const eventDoc = await transaction.get(eventRef);

      if (!eventDoc.exists) {
        return { success: false, error: 'Event not found' };
      }

      const event = eventDoc.data() as Event;

      // 2. Validate event status
      if (event.status !== 'PUBLISHED') {
        return { success: false, error: 'Event is not available for purchase' };
      }

      // 3. Check if event is full
      if (event.stats.ticketsSold >= event.maxParticipants) {
        return { success: false, error: 'Event is sold out' };
      }

      // 4. Check if user already has a ticket
      const existingTicketRef = db.collection('eventTickets').doc(ticketId);
      const existingTicket = await transaction.get(existingTicketRef);

      if (existingTicket.exists) {
        return { success: false, error: 'You already have a ticket for this event' };
      }

      // 5. Get user's wallet
      const userWalletRef = db.collection('wallets').doc(participantId);
      const walletDoc = await transaction.get(userWalletRef);

      if (!walletDoc.exists) {
        return { success: false, error: 'Wallet not found' };
      }

      const wallet = walletDoc.data();
      const currentBalance = wallet?.tokens || 0;

      // 6. Check if user has enough tokens
      if (currentBalance < event.priceTokens) {
        return { success: false, error: 'Insufficient tokens' };
      }

      // 7. Calculate split
      const avaloShareTokens = Math.floor(event.priceTokens * AVALO_SHARE_PERCENT / 100);
      const organizerShareTokens = event.priceTokens - avaloShareTokens;

      // 8. Deduct tokens from participant
      transaction.update(userWalletRef, {
        tokens: FieldValue.increment(-event.priceTokens),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 9. Credit Avalo immediately (20%)
      const avaloWalletRef = db.collection('wallets').doc('AVALO_PLATFORM');
      transaction.set(avaloWalletRef, {
        tokens: FieldValue.increment(avaloShareTokens),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      // 10. Generate QR code
      const qrCode = generateQRCode(ticketId, eventId, participantId);

      // 11. Create ticket
      const now = new Date().toISOString();
      const ticket: EventTicket = {
        ticketId,
        eventId,
        organizerId: event.organizerId,
        participantId,
        priceTokens: event.priceTokens,
        status: 'PURCHASED',
        payment: {
          totalTokensPaid: event.priceTokens,
          organizerShareTokens,
          avaloShareTokens,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0
        },
        checkIn: {
          qrCode,
          checkInAt: null,
          selfieVerified: false
        },
        timestamps: {
          createdAt: now,
          updatedAt: now
        }
      };

      transaction.set(existingTicketRef, ticket);

      // 12. Update event stats
      transaction.update(eventRef, {
        'stats.ticketsSold': FieldValue.increment(1),
        'timestamps.updatedAt': FieldValue.serverTimestamp()
      });

      // 13. Record transaction
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'EVENT_TICKET_PURCHASE',
        fromUserId: participantId,
        toUserId: event.organizerId,
        eventId,
        ticketId,
        amount: event.priceTokens,
        avaloShare: avaloShareTokens,
        organizerShare: organizerShareTokens,
        status: 'COMPLETED',
        timestamp: FieldValue.serverTimestamp()
      });

      return { success: true, ticketId };
    });
  } catch (error) {
    console.error('Error purchasing ticket:', error);
    return { success: false, error: 'Transaction failed' };
  }
}

// ============================================================================
// PARTICIPANT CANCELLATION (NO REFUND)
// ============================================================================

/**
 * Participant cancels their ticket - NO REFUND
 * Organizer still gets 80%, Avalo keeps 20%
 */
export async function participantCancelTicket(
  ticketId: string,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await db.runTransaction(async (transaction) => {
      const ticketRef = db.collection('eventTickets').doc(ticketId);
      const ticketDoc = await transaction.get(ticketRef);

      if (!ticketDoc.exists) {
        return { success: false, error: 'Ticket not found' };
      }

      const ticket = ticketDoc.data() as EventTicket;

      // Verify ownership
      if (ticket.participantId !== participantId) {
        return { success: false, error: 'Not authorized' };
      }

      // Check if already cancelled
      if (ticket.status !== 'PURCHASED') {
        return { success: false, error: 'Ticket cannot be cancelled' };
      }

      // Update ticket status - NO REFUND
      transaction.update(ticketRef, {
        status: 'CANCELLED_BY_PARTICIPANT',
        'timestamps.updatedAt': FieldValue.serverTimestamp()
      });

      // Record transaction (for tracking, no money movement)
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'EVENT_TICKET_CANCELLED_BY_PARTICIPANT',
        userId: participantId,
        ticketId,
        eventId: ticket.eventId,
        note: 'No refund policy - organizer and Avalo keep shares',
        timestamp: FieldValue.serverTimestamp()
      });

      return { success: true };
    });
  } catch (error) {
    console.error('Error cancelling ticket:', error);
    return { success: false, error: 'Cancellation failed' };
  }
}

// ============================================================================
// ORGANIZER CANCELS EVENT (FULL REFUND)
// ============================================================================

/**
 * Organizer cancels entire event - FULL REFUND to all participants
 * Avalo returns its 20% fee for all tickets
 */
export async function organizerCancelEvent(
  eventId: string,
  organizerId: string,
  reason: string
): Promise<{ success: boolean; refundCount?: number; error?: string }> {
  try {
    // 1. Verify organizer
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return { success: false, error: 'Event not found' };
    }

    const event = eventDoc.data() as Event;

    if (event.organizerId !== organizerId) {
      return { success: false, error: 'Not authorized' };
    }

    if (event.status === 'CANCELLED') {
      return { success: false, error: 'Event already cancelled' };
    }

    // 2. Get all tickets for this event
    const ticketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', '==', 'PURCHASED')
      .get();

    // 3. Process refunds in batches (Firestore limit: 500 operations per transaction)
    const batchSize = 400; // Leave room for other operations
    const tickets = ticketsSnap.docs;
    let refundCount = 0;

    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = db.batch();
      const ticketBatch = tickets.slice(i, i + batchSize);

      for (const ticketDoc of ticketBatch) {
        const ticket = ticketDoc.data() as EventTicket;

        // Refund participant (100%)
        const userWalletRef = db.collection('wallets').doc(ticket.participantId);
        batch.update(userWalletRef, {
          tokens: FieldValue.increment(ticket.priceTokens),
          updatedAt: FieldValue.serverTimestamp()
        });

        // Deduct from Avalo (return 20% fee)
        const avaloWalletRef = db.collection('wallets').doc('AVALO_PLATFORM');
        batch.update(avaloWalletRef, {
          tokens: FieldValue.increment(-ticket.payment.avaloShareTokens),
          updatedAt: FieldValue.serverTimestamp()
        });

        // Update ticket status
        batch.update(ticketDoc.ref, {
          status: 'CANCELLED_BY_ORGANIZER',
          'payment.refundedUserTokens': ticket.priceTokens,
          'payment.refundedAvaloTokens': ticket.payment.avaloShareTokens,
          'timestamps.updatedAt': FieldValue.serverTimestamp()
        });

        // Record refund transaction
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
          type: 'EVENT_CANCELLED_REFUND',
          fromUserId: 'AVALO_PLATFORM',
          toUserId: ticket.participantId,
          eventId,
          ticketId: ticket.ticketId,
          amount: ticket.priceTokens,
          reason: 'Event cancelled by organizer',
          timestamp: FieldValue.serverTimestamp()
        });

        refundCount++;
      }

      await batch.commit();
    }

    // 4. Update event status
    await eventRef.update({
      status: 'CANCELLED',
      cancellationReason: reason,
      'timestamps.updatedAt': FieldValue.serverTimestamp()
    });

    return { success: true, refundCount };
  } catch (error) {
    console.error('Error cancelling event:', error);
    return { success: false, error: 'Cancellation failed' };
  }
}

// ============================================================================
// QR CODE GENERATION
// ============================================================================

/**
 * Generate secure QR code for ticket
 */
function generateQRCode(ticketId: string, eventId: string, participantId: string): string {
  const payload: QRCodePayload = {
    ticketId,
    eventId,
    participantId,
    timestamp: new Date().toISOString(),
    signature: ''
  };

  // Create signature
  const dataToSign = `${ticketId}:${eventId}:${participantId}:${payload.timestamp}`;
  const signature = crypto
    .createHmac('sha256', QR_CODE_SECRET)
    .update(dataToSign)
    .digest('hex');

  payload.signature = signature;

  // Encode as base64
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Verify QR code signature
 */
function verifyQRCode(qrCode: string): { valid: boolean; payload?: QRCodePayload } {
  try {
    const decoded = Buffer.from(qrCode, 'base64').toString('utf-8');
    const payload: QRCodePayload = JSON.parse(decoded);

    const dataToSign = `${payload.ticketId}:${payload.eventId}:${payload.participantId}:${payload.timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', QR_CODE_SECRET)
      .update(dataToSign)
      .digest('hex');

    if (payload.signature === expectedSignature) {
      return { valid: true, payload };
    }

    return { valid: false };
  } catch (error) {
    console.error('Error verifying QR code:', error);
    return { valid: false };
  }
}

// ============================================================================
// CHECK-IN WITH SELFIE VERIFICATION
// ============================================================================

/**
 * Process event check-in with QR code scan
 * Triggers selfie verification flow
 */
export async function processEventCheckIn(
  qrCode: string,
  scannedByOrganizerId: string
): Promise<CheckInResult> {
  try {
    // 1. Verify QR code
    const qrVerification = verifyQRCode(qrCode);
    if (!qrVerification.valid || !qrVerification.payload) {
      return {
        success: false,
        ticketId: '',
        participantId: '',
        eventId: '',
        checkInTime: '',
        selfieVerified: false,
        error: 'Invalid QR code'
      };
    }

    const { ticketId, eventId, participantId } = qrVerification.payload;

    // 2. Verify event organizer
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return {
        success: false,
        ticketId,
        participantId,
        eventId,
        checkInTime: '',
        selfieVerified: false,
        error: 'Event not found'
      };
    }

    const event = eventDoc.data() as Event;

    if (event.organizerId !== scannedByOrganizerId) {
      return {
        success: false,
        ticketId,
        participantId,
        eventId,
        checkInTime: '',
        selfieVerified: false,
        error: 'Not authorized to check in for this event'
      };
    }

    // 3. Get ticket
    const ticketRef = db.collection('eventTickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      return {
        success: false,
        ticketId,
        participantId,
        eventId,
        checkInTime: '',
        selfieVerified: false,
        error: 'Ticket not found'
      };
    }

    const ticket = ticketDoc.data() as EventTicket;

    // 4. Check ticket status
    if (ticket.status !== 'PURCHASED') {
      return {
        success: false,
        ticketId,
        participantId,
        eventId,
        checkInTime: '',
        selfieVerified: false,
        error: `Ticket status: ${ticket.status}`
      };
    }

    // 5. Check if already checked in
    if (ticket.checkIn.checkInAt) {
      return {
        success: false,
        ticketId,
        participantId,
        eventId,
        checkInTime: ticket.checkIn.checkInAt,
        selfieVerified: ticket.checkIn.selfieVerified,
        error: 'Already checked in'
      };
    }

    // 6. Trigger selfie verification (placeholder - integrate with camera/verification system)
    // In production: call selfie verification service, compare with profile photo
    const selfieVerified = true; // TODO: Implement actual selfie verification

    // 7. Record check-in
    const checkInTime = new Date().toISOString();
    await ticketRef.update({
      'checkIn.checkInAt': checkInTime,
      'checkIn.selfieVerified': selfieVerified,
      'timestamps.updatedAt': FieldValue.serverTimestamp()
    });

    // 8. Update event stats
    await eventRef.update({
      'stats.checkIns': FieldValue.increment(1),
      'timestamps.updatedAt': FieldValue.serverTimestamp()
    });

    // 9. Trigger safety hook - PACK 280 integration
    const { onEventCheckIn } = await import('./safetyHooks');
    await onEventCheckIn(eventId, ticketId, participantId);

    return {
      success: true,
      ticketId,
      participantId,
      eventId,
      checkInTime,
      selfieVerified
    };
  } catch (error) {
    console.error('Error processing check-in:', error);
    return {
      success: false,
      ticketId: '',
      participantId: '',
      eventId: '',
      checkInTime: '',
      selfieVerified: false,
      error: 'Check-in failed'
    };
  }
}

// ============================================================================
// MISMATCH AT ENTRY (FULL REFUND)
// ============================================================================

/**
 * Report appearance mismatch at entry
 * Triggers full refund (100% to participant, Avalo returns 20%)
 */
export async function reportMismatchAtEntry(
  ticketId: string,
  organizerId: string,
  reason: string
): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Get ticket
      const ticketRef = db.collection('eventTickets').doc(ticketId);
      const ticketDoc = await transaction.get(ticketRef);

      if (!ticketDoc.exists) {
        return { success: false, error: 'Ticket not found' };
      }

      const ticket = ticketDoc.data() as EventTicket;

      // 2. Verify organizer
      if (ticket.organizerId !== organizerId) {
        return { success: false, error: 'Not authorized' };
      }

      // 3. Check ticket status
      if (ticket.status !== 'PURCHASED') {
        return { success: false, error: 'Invalid ticket status' };
      }

      // 4. Refund participant (100%)
      const userWalletRef = db.collection('wallets').doc(ticket.participantId);
      transaction.update(userWalletRef, {
        tokens: FieldValue.increment(ticket.priceTokens),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 5. Avalo returns 20% fee
      const avaloWalletRef = db.collection('wallets').doc('AVALO_PLATFORM');
      transaction.update(avaloWalletRef, {
        tokens: FieldValue.increment(-ticket.payment.avaloShareTokens),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 6. Update ticket status
      transaction.update(ticketRef, {
        status: 'REFUNDED_MISMATCH',
        'payment.refundedUserTokens': ticket.priceTokens,
        'payment.refundedAvaloTokens': ticket.payment.avaloShareTokens,
        'timestamps.updatedAt': FieldValue.serverTimestamp()
      });

      // 7. Create mismatch report
      const reportRef = db.collection('mismatchReports').doc();
      const mismatchReport: MismatchReport = {
        ticketId,
        eventId: ticket.eventId,
        participantId: ticket.participantId,
        reportedBy: organizerId,
        reason,
        timestamp: new Date().toISOString(),
        refundIssued: true
      };
      transaction.set(reportRef, mismatchReport);

      // 8. Record refund transaction
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'MISMATCH_REFUND',
        fromUserId: 'AVALO_PLATFORM',
        toUserId: ticket.participantId,
        eventId: ticket.eventId,
        ticketId,
        amount: ticket.priceTokens,
        reason: 'Appearance mismatch at entry',
        timestamp: FieldValue.serverTimestamp()
      });

      // 9. Flag user for safety review
      const safetyReviewRef = db.collection('safetyReviews').doc();
      transaction.set(safetyReviewRef, {
        userId: ticket.participantId,
        type: 'APPEARANCE_MISMATCH',
        eventId: ticket.eventId,
        ticketId,
        reason,
        reportedBy: organizerId,
        status: 'PENDING_REVIEW',
        timestamp: FieldValue.serverTimestamp()
      });

      return { success: true, refundAmount: ticket.priceTokens };
    });
  } catch (error) {
    console.error('Error processing mismatch refund:', error);
    return { success: false, error: 'Refund failed' };
  }
}

// ============================================================================
// EVENT COMPLETION & PAYOUT ENGINE
// ============================================================================

/**
 * Analyze event completion and determine payout eligibility
 * Requires 70% check-in rate
 */
export async function analyzeEventCompletion(
  eventId: string
): Promise<EventCompletionAnalysis> {
  try {
    // 1. Get event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }

    const event = eventDoc.data() as Event;

    // 2. Count tickets
    const ticketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['PURCHASED', 'COMPLETED', 'NO_SHOW'])
      .get();

    const totalTickets = ticketsSnap.size;

    // 3. Count successful check-ins
    const checkedInSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['PURCHASED', 'COMPLETED'])
      .where('checkIn.selfieVerified', '==', true)
      .get();

    const successfulCheckIns = checkedInSnap.size;

    // 4. Calculate check-in rate
    const checkInRate = totalTickets > 0 ? (successfulCheckIns / totalTickets) * 100 : 0;
    const passedThreshold = checkInRate >= CHECK_IN_THRESHOLD_PERCENT;

    // 5. Determine payout readiness
    const payoutReady = passedThreshold && event.status === 'COMPLETED';
    const flaggedForReview = !passedThreshold && totalTickets > 0;

    const analysis: EventCompletionAnalysis = {
      eventId,
      totalTickets,
      successfulCheckIns,
      checkInRate,
      passedThreshold,
      payoutReady,
      flaggedForReview
    };

    // 6. Save analysis
    await db.collection('eventCompletionAnalysis').doc(eventId).set(analysis);

    return analysis;
  } catch (error) {
    console.error('Error analyzing event completion:', error);
    throw error;
  }
}

/**
 * Process organizer payout after event completion
 */
export async function processOrganizerPayout(
  eventId: string
): Promise<{ success: boolean; payoutAmount?: number; error?: string }> {
  try {
    // 1. Get event completion analysis
    const analysisDoc = await db.collection('eventCompletionAnalysis').doc(eventId).get();
    if (!analysisDoc.exists) {
      return { success: false, error: 'Event analysis not found' };
    }

    const analysis = analysisDoc.data() as EventCompletionAnalysis;

    // 2. Check if payout is ready
    if (!analysis.payoutReady) {
      return { success: false, error: 'Event does not meet payout criteria' };
    }

    // 3. Check if payout already exists
    const existingPayoutSnap = await db.collection('organizerPayouts')
      .where('eventId', '==', eventId)
      .where('status', '==', 'COMPLETED')
      .get();

    if (!existingPayoutSnap.empty) {
      return { success: false, error: 'Payout already processed' };
    }

    // 4. Get all eligible tickets
    const ticketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['PURCHASED', 'COMPLETED', 'NO_SHOW'])
      .get();

    // 5. Calculate total payout
    let totalEarnings = 0;
    const ticketsIncluded: string[] = [];

    ticketsSnap.forEach((doc) => {
      const ticket = doc.data() as EventTicket;
      // Only include tickets that haven't been refunded
      if (ticket.payment.refundedUserTokens === 0) {
        totalEarnings += ticket.payment.organizerShareTokens;
        ticketsIncluded.push(ticket.ticketId);
      }
    });

    if (totalEarnings === 0) {
      return { success: false, error: 'No earnings to payout' };
    }

    // 6. Get event for organizer ID
    const eventDoc = await db.collection('events').doc(eventId).get();
    const event = eventDoc.data() as Event;

    // 7. Process payout in transaction
    return await db.runTransaction(async (transaction) => {
      // Credit organizer
      const organizerWalletRef = db.collection('wallets').doc(event.organizerId);
      transaction.update(organizerWalletRef, {
        tokens: FieldValue.increment(totalEarnings),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update ticket statuses
      for (const ticketId of ticketsIncluded) {
        const ticketRef = db.collection('eventTickets').doc(ticketId);
        transaction.update(ticketRef, {
          status: 'COMPLETED',
          'timestamps.updatedAt': FieldValue.serverTimestamp()
        });
      }

      // Create payout record
      const payoutRef = db.collection('organizerPayouts').doc();
      const payout: OrganizerPayout = {
        eventId,
        organizerId: event.organizerId,
        totalEarnings,
        ticketsIncluded,
        payoutDate: new Date().toISOString(),
        status: 'COMPLETED'
      };
      transaction.set(payoutRef, payout);

      // Record transaction
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'EVENT_ORGANIZER_PAYOUT',
        fromUserId: 'AVALO_PLATFORM',
        toUserId: event.organizerId,
        eventId,
        amount: totalEarnings,
        ticketCount: ticketsIncluded.length,
        timestamp: FieldValue.serverTimestamp()
      });

      return { success: true, payoutAmount: totalEarnings };
    });
  } catch (error) {
    console.error('Error processing organizer payout:', error);
    return { success: false, error: 'Payout failed' };
  }
}

// ============================================================================
// GOODWILL REFUND (ORGANIZER-INITIATED)
// ============================================================================

/**
 * Organizer issues goodwill refund to participant
 * Organizer returns their 80%, Avalo keeps 20%
 */
export async function issueGoodwillRefund(
  ticketId: string,
  organizerId: string,
  reason: string
): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Get ticket
      const ticketRef = db.collection('eventTickets').doc(ticketId);
      const ticketDoc = await transaction.get(ticketRef);

      if (!ticketDoc.exists) {
        return { success: false, error: 'Ticket not found' };
      }

      const ticket = ticketDoc.data() as EventTicket;

      // 2. Verify organizer
      if (ticket.organizerId !== organizerId) {
        return { success: false, error: 'Not authorized' };
      }

      // 3. Check if ticket is eligible for goodwill refund
      if (ticket.status !== 'COMPLETED' && ticket.status !== 'PURCHASED') {
        return { success: false, error: 'Ticket not eligible for goodwill refund' };
      }

      // 4. Check if already refunded
      if (ticket.payment.refundedUserTokens > 0) {
        return { success: false, error: 'Already refunded' };
      }

      // 5. Refund organizer's 80% to participant (Avalo keeps 20%)
      const refundAmount = ticket.payment.organizerShareTokens;

      const userWalletRef = db.collection('wallets').doc(ticket.participantId);
      transaction.update(userWalletRef, {
        tokens: FieldValue.increment(refundAmount),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 6. Deduct from organizer
      const organizerWalletRef = db.collection('wallets').doc(organizerId);
      transaction.update(organizerWalletRef, {
        tokens: FieldValue.increment(-refundAmount),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 7. Update ticket
      transaction.update(ticketRef, {
        status: 'COMPLETED_GOODWILL',
        'payment.refundedUserTokens': refundAmount,
        goodwillReason: reason,
        'timestamps.updatedAt': FieldValue.serverTimestamp()
      });

      // 8. Record transaction
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'GOODWILL_REFUND',
        fromUserId: organizerId,
        toUserId: ticket.participantId,
        eventId: ticket.eventId,
        ticketId,
        amount: refundAmount,
        reason,
        note: 'Avalo 20% fee retained',
        timestamp: FieldValue.serverTimestamp()
      });

      return { success: true, refundAmount };
    });
  } catch (error) {
    console.error('Error issuing goodwill refund:', error);
    return { success: false, error: 'Refund failed' };
  }
}

// ============================================================================
// SAFETY HOOKS INTEGRATION
// ============================================================================

/**
 * Trigger safety hook for event-related safety events
 */
async function triggerSafetyHook(hook: SafetyEventHook): Promise<void> {
  try {
    await db.collection('safetyEventHooks').add(hook);

    // TODO: Integration with Safety Center and Panic Button (separate packs)
    // This creates a record that Safety packs can listen to via Firestore listeners
    console.log('Safety hook triggered:', hook.eventType, hook.eventId);
  } catch (error) {
    console.error('Error triggering safety hook:', error);
  }
}

/**
 * Handle panic button triggered at event
 */
export async function handleEventPanic(
  eventId: string,
  userId: string,
  location: { lat: number; lng: number }
): Promise<{ success: boolean }> {
  try {
    // Call PACK 280 safety hook
    const { onEventPanic } = await import('./safetyHooks');
    await onEventPanic(eventId, userId, location);

    return { success: true };
  } catch (error) {
    console.error('Error handling event panic:', error);
    return { success: false };
  }
}
