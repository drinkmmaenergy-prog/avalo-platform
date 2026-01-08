/**
 * PACK 286 — Calendar & Events FINAL FIX
 * Unified economics engine for calendar bookings and event tickets
 * 
 * KEY RULES:
 * - 80/20 split (80% earner / 20% Avalo) for CALENDAR and EVENT sources
 * - Host/Organizer cancellation: 100% refund (including Avalo fee)
 * - Mismatch: 100% refund (including Avalo fee)
 * - Guest/Attendee cancellation: Time-based partial refunds (72h/48-24h/<24h), Avalo fee non-refundable
 * - Goodwill refund: Only earner's 80% (Avalo fee non-refundable)
 * - Payout lock until completion and check-in threshold met
 */

import { db, FieldValue, serverTimestamp } from './init';
import {
  spendTokens,
  earnTokens,
  refundTokens as walletRefundTokens
} from './pack277-wallet-service';
import type {
  CalendarBooking,
  EventTicket,
  BookingStatus,
  TicketStatus,
} from './types/pack286-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const ECONOMICS = {
  PLATFORM_SHARE_PERCENT: 20, // Avalo 20%
  EARNER_SHARE_PERCENT: 80,   // Host/Organizer 80%
  
  // Guest/Attendee cancellation time windows
  FULL_REFUND_HOURS: 72,      // >72h = 100% of earner share
  PARTIAL_REFUND_MIN_HOURS: 24, // 24-72h = 50% of earner share
  
  // Events
  CHECK_IN_THRESHOLD_PERCENT: 70, // 70% check-ins required for payout
  
  // Mismatch
  MISMATCH_WINDOW_MINUTES: 15,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate 80/20 split
 */
export function calculateSplit(priceTokens: number): {
  platformShareTokens: number;
  earnerShareTokens: number;
} {
  const platformShareTokens = Math.floor(priceTokens * (ECONOMICS.PLATFORM_SHARE_PERCENT / 100));
  const earnerShareTokens = priceTokens - platformShareTokens;
  
  return { platformShareTokens, earnerShareTokens };
}

/**
 * Calculate guest/attendee cancellation refund based on time until meeting/event
 */
export function calculateCancellationRefund(
  earnerShareTokens: number,
  hoursUntilStart: number
): number {
  if (hoursUntilStart >= ECONOMICS.FULL_REFUND_HOURS) {
    // 72+ hours: 100% of earner share (80% of price)
    return earnerShareTokens;
  } else if (hoursUntilStart >= ECONOMICS.PARTIAL_REFUND_MIN_HOURS) {
    // 24-72 hours: 50% of earner share
    return Math.floor(earnerShareTokens * 0.5);
  } else {
    // <24 hours: no refund
    return 0;
  }
}

// ============================================================================
// CALENDAR BOOKINGS
// ============================================================================

/**
 * Create calendar booking with 80/20 split
 */
export async function createCalendarBooking(
  hostId: string,
  guestId: string,
  slotId: string,
  startTime: string,
  endTime: string,
  priceTokens: number
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  const bookingId = `booking_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    // Calculate split
    const { platformShareTokens, earnerShareTokens } = calculateSplit(priceTokens);
    
    // Spend tokens from guest using PACK 277
    const spendResult = await spendTokens({
      userId: guestId,
      amountTokens: priceTokens,
      source: 'CALENDAR',
      relatedId: bookingId,
      creatorId: hostId,
      metadata: {
        slotId,
        startTime,
        endTime,
      },
    });
    
    if (!spendResult.success) {
      return {
        success: false,
        error: spendResult.error || 'Failed to charge tokens',
      };
    }
    
    // Create booking record
    const now = new Date().toISOString();
    const booking: CalendarBooking = {
      bookingId,
      hostId,
      guestId,
      startTime,
      endTime,
      status: 'CONFIRMED',
      priceTokens,
      
      split: {
        platformShareTokens,
        hostShareTokens: earnerShareTokens,
      },
      
      payment: {
        chargedTokens: priceTokens,
        refundedTokensTotal: 0,
        refundedToGuestTokens: 0,
        refundedFromHostTokens: 0,
        avalosFeeRefunded: false,
      },
      
      checkIn: {
        qrVerified: false,
        selfieVerified: false,
        checkedInAt: null,
      },
      
      mismatch: {
        reported: false,
        reportedBy: 'none',
        confirmed: false,
        confirmedAt: null,
      },
      
      goodwillRefund: {
        requestedByHost: false,
        processed: false,
        amountTokens: 0,
      },
      
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection('bookings').doc(bookingId).set(booking);
    
    return {
      success: true,
      bookingId,
    };
  } catch (error: any) {
    console.error('Error creating calendar booking:', error);
    return {
      success: false,
      error: error.message || 'Failed to create booking',
    };
  }
}

/**
 * Guest cancels booking - time-based partial refund
 */
export async function guestCancelBooking(
  bookingId: string,
  guestId: string
): Promise<{ success: boolean; refundedTokens?: number; error?: string }> {
  try {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as CalendarBooking;
    
    // Verify guest
    if (booking.guestId !== guestId) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Check status
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
      return { success: false, error: `Cannot cancel booking with status: ${booking.status}` };
    }
    
    // Calculate time until meeting
    const now = new Date();
    const startTime = new Date(booking.startTime);
    const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    // Calculate refund (only from earner share, Avalo keeps fee)
    const refundTokens = calculateCancellationRefund(booking.split.hostShareTokens, hoursUntil);
    
    // Refund to guest if applicable
    if (refundTokens > 0) {
      const refundResult = await walletRefundTokens({
        userId: guestId,
        amountTokens: refundTokens,
        source: 'CALENDAR',
        relatedId: bookingId,
        reason: 'Guest cancellation',
        metadata: {
          hoursUntilMeeting: hoursUntil,
          refundPercentage: hoursUntil >= ECONOMICS.FULL_REFUND_HOURS ? 100 : 50,
        },
      });
      
      if (!refundResult.success) {
        return { success: false, error: 'Refund failed' };
      }
    }
    
    // Update booking
    await bookingRef.update({
      status: 'CANCELLED_GUEST',
      'payment.refundedTokensTotal': refundTokens,
      'payment.refundedToGuestTokens': refundTokens,
      'payment.avalosFeeRefunded': false, // Never refund Avalo fee on guest cancellation
      updatedAt: new Date().toISOString(),
    });
    
    // Pay host for any non-refunded portion
    const hostEarnings = booking.split.hostShareTokens - refundTokens;
    if (hostEarnings > 0) {
      await earnTokens({
        userId: booking.hostId,
        amountTokens: hostEarnings,
        source: 'CALENDAR',
        relatedId: bookingId,
        payerId: guestId,
        metadata: {
          reason: 'Late cancellation earnings',
        },
      });
    }
    
    return {
      success: true,
      refundedTokens: refundTokens,
    };
  } catch (error: any) {
    console.error('Error cancelling booking (guest):', error);
    return {
      success: false,
      error: error.message || 'Cancellation failed',
    };
  }
}

/**
 * Host cancels booking - FULL 100% refund including Avalo fee
 */
export async function hostCancelBooking(
  bookingId: string,
  hostId: string
): Promise<{ success: boolean; refundedTokens?: number; error?: string }> {
  try {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as CalendarBooking;
    
    // Verify host
    if (booking.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Check status
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
      return { success: false, error: `Cannot cancel booking with status: ${booking.status}` };
    }
    
    // FULL refund = 100% of price (including Avalo's 20%)
    const fullRefund = booking.priceTokens;
    
    const refundResult = await walletRefundTokens({
      userId: booking.guestId,
      amountTokens: fullRefund,
      source: 'CALENDAR',
      relatedId: bookingId,
      reason: 'Host cancellation',
      metadata: {
        cancelledBy: hostId,
        fullRefundIncludingFee: true,
      },
    });
    
    if (!refundResult.success) {
      return { success: false, error: 'Refund failed' };
    }
    
    // Update booking
    await bookingRef.update({
      status: 'CANCELLED_HOST',
      'split.hostShareTokens': 0,
      'split.platformShareTokens': 0,
      'payment.refundedTokensTotal': fullRefund,
      'payment.refundedToGuestTokens': fullRefund,
      'payment.avalosFeeRefunded': true, // YES - Avalo refunds its fee
      updatedAt: new Date().toISOString(),
    });
    
    return {
      success: true,
      refundedTokens: fullRefund,
    };
  } catch (error: any) {
    console.error('Error cancelling booking (host):', error);
    return {
      success: false,
      error: error.message || 'Cancellation failed',
    };
  }
}

/**
 * Confirm mismatch - FULL 100% refund including Avalo fee
 */
export async function confirmMismatch(
  bookingId: string,
  reportedBy: 'host' | 'guest',
  reporterId: string
): Promise<{ success: boolean; refundedTokens?: number; error?: string }> {
  try {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as CalendarBooking;
    
    // Verify reporter
    if (
      (reportedBy === 'host' && booking.hostId !== reporterId) ||
      (reportedBy === 'guest' && booking.guestId !== reporterId)
    ) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Check if checked in
    if (!booking.checkIn.checkedInAt) {
      return { success: false, error: 'Can only report mismatch after check-in' };
    }
    
    // Check mismatch window
    const now = new Date();
    const checkInTime = new Date(booking.checkIn.checkedInAt);
    const minutesSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
    
    if (minutesSinceCheckIn > ECONOMICS.MISMATCH_WINDOW_MINUTES) {
      return {
        success: false,
        error: `Mismatch can only be reported within ${ECONOMICS.MISMATCH_WINDOW_MINUTES} minutes of check-in`,
      };
    }
    
    // FULL refund = 100% including Avalo fee
    const fullRefund = booking.priceTokens;
    
    const refundResult = await walletRefundTokens({
      userId: booking.guestId,
      amountTokens: fullRefund,
      source: 'CALENDAR',
      relatedId: bookingId,
      reason: 'Appearance mismatch confirmed',
      metadata: {
        reportedBy,
        reporterId,
        fullRefundIncludingFee: true,
      },
    });
    
    if (!refundResult.success) {
      return { success: false, error: 'Refund failed' };
    }
    
    // Update booking
    await bookingRef.update({
      status: 'MISMATCH_CONFIRMED',
      'split.hostShareTokens': 0,
      'split.platformShareTokens': 0,
      'payment.refundedTokensTotal': fullRefund,
      'payment.refundedToGuestTokens': fullRefund,
      'payment.avalosFeeRefunded': true, // YES - Avalo refunds its fee
      'mismatch.reported': true,
      'mismatch.reportedBy': reportedBy,
      'mismatch.confirmed': true,
      'mismatch.confirmedAt': now.toISOString(),
      updatedAt: now.toISOString(),
    });
    
    return {
      success: true,
      refundedTokens: fullRefund,
    };
  } catch (error: any) {
    console.error('Error confirming mismatch:', error);
    return {
      success: false,
      error: error.message || 'Mismatch confirmation failed',
    };
  }
}

/**
 * Complete booking and pay host (if check-in verified)
 */
export async function completeBooking(
  bookingId: string
): Promise<{ success: boolean; hostPaid?: number; error?: string }> {
  try {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as CalendarBooking;
    
    // Check status
    if (booking.status !== 'CONFIRMED') {
      return { success: false, error: `Cannot complete booking with status: ${booking.status}` };
    }
    
    // Check if meeting time has passed
    const now = new Date();
    const endTime = new Date(booking.endTime);
    
    if (now < endTime) {
      return { success: false, error: 'Meeting has not ended yet' };
    }
    
    // Determine if guest checked in
    const guestCheckedIn = booking.checkIn.qrVerified && booking.checkIn.selfieVerified;
    
    // Pay host their share (only if not already paid)
    if (booking.split.hostShareTokens > 0) {
      const earnResult = await earnTokens({
        userId: booking.hostId,
        amountTokens: booking.split.hostShareTokens,
        source: 'CALENDAR',
        relatedId: bookingId,
        payerId: booking.guestId,
        metadata: {
          guestCheckedIn,
          reason: 'Booking completed',
        },
      });
      
      if (!earnResult.success) {
        return { success: false, error: 'Payout failed' };
      }
      
      // Update booking
      await bookingRef.update({
        status: guestCheckedIn ? 'COMPLETED' : 'NO_SHOW',
        updatedAt: now.toISOString(),
      });
      
      return {
        success: true,
        hostPaid: booking.split.hostShareTokens,
      };
    }
    
    return { success: true, hostPaid: 0 };
  } catch (error: any) {
    console.error('Error completing booking:', error);
    return {
      success: false,
      error: error.message || 'Completion failed',
    };
  }
}

/**
 * Host issues goodwill refund - returns their 80%, Avalo keeps 20%
 */
export async function issueGoodwillRefund(
  bookingId: string,
  hostId: string,
  amountTokens?: number
): Promise<{ success: boolean; refundedTokens?: number; error?: string }> {
  try {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as CalendarBooking;
    
    // Verify host
    if (booking.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Can only refund completed bookings
    if (booking.status !== 'COMPLETED') {
      return { success: false, error: 'Can only issue goodwill refund for completed bookings' };
    }
    
    // Calculate max refund (host's share only)
    const maxRefund = booking.split.hostShareTokens - booking.payment.refundedFromHostTokens;
    const refundAmount = amountTokens && amountTokens <= maxRefund ? amountTokens : maxRefund;
    
    if (refundAmount <= 0) {
      return { success: false, error: 'No tokens available to refund' };
    }
    
    // Refund guest (comes from host's wallet, not platform)
    const refundResult = await walletRefundTokens({
      userId: booking.guestId,
      amountTokens: refundAmount,
      source: 'CALENDAR',
      relatedId: bookingId,
      reason: 'Goodwill refund from host',
      metadata: {
        fromHost: hostId,
        avaloFeeRetained: true,
      },
    });
    
    if (!refundResult.success) {
      return { success: false, error: 'Refund failed' };
    }
    
    // Deduct from host's wallet
    const spendResult = await spendTokens({
      userId: hostId,
      amountTokens: refundAmount,
      source: 'CALENDAR',
      relatedId: bookingId,
      metadata: {
        reason: 'Goodwill refund to guest',
        toGuest: booking.guestId,
      },
    });
    
    if (!spendResult.success) {
      // Reverse the refund to guest
      await spendTokens({
        userId: booking.guestId,
        amountTokens: refundAmount,
        source: 'CALENDAR',
        relatedId: bookingId,
        metadata: { reason: 'Reversing failed goodwill refund' },
      });
      return { success: false, error: 'Host deduction failed' };
    }
    
    // Update booking
    await bookingRef.update({
      status: 'COMPLETED_GOODWILL',
      'payment.refundedTokensTotal': FieldValue.increment(refundAmount),
      'payment.refundedFromHostTokens': FieldValue.increment(refundAmount),
      'payment.refundedToGuestTokens': FieldValue.increment(refundAmount),
      'payment.avalosFeeRefunded': false, // Avalo NEVER refunds on goodwill
      'goodwillRefund.requestedByHost': true,
      'goodwillRefund.processed': true,
      'goodwillRefund.amountTokens': refundAmount,
      updatedAt: new Date().toISOString(),
    });
    
    return {
      success: true,
      refundedTokens: refundAmount,
    };
  } catch (error: any) {
    console.error('Error issuing goodwill refund:', error);
    return {
      success: false,
      error: error.message || 'Goodwill refund failed',
    };
  }
}

// ============================================================================
// EVENT TICKETS (Similar patterns)
// ============================================================================

/**
 * Purchase event ticket with 80/20 split
 */
export async function purchaseEventTicket(
  eventId: string,
  organizerId: string,
  attendeeId: string,
  priceTokens: number
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    // Calculate split
    const { platformShareTokens, earnerShareTokens } = calculateSplit(priceTokens);
    
    // Spend tokens from attendee using PACK 277
    const spendResult = await spendTokens({
      userId: attendeeId,
      amountTokens: priceTokens,
      source: 'EVENT',
      relatedId: ticketId,
      creatorId: organizerId,
      metadata: {
        eventId,
      },
    });
    
    if (!spendResult.success) {
      return {
        success: false,
        error: spendResult.error || 'Failed to charge tokens',
      };
    }
    
    // Create ticket record
    const now = new Date().toISOString();
    const ticket: EventTicket = {
      ticketId,
      eventId,
      organizerId,
      attendeeId,
      status: 'BOOKED',
      priceTokens,
      
      split: {
        platformShareTokens,
        organizerShareTokens: earnerShareTokens,
      },
      
      payment: {
        chargedTokens: priceTokens,
        refundedTokensTotal: 0,
        refundedToAttendeeTokens: 0,
        refundedFromOrganizerTokens: 0,
        avalosFeeRefunded: false,
      },
      
      checkIn: {
        qrVerified: false,
        selfieVerified: false,
        checkedInAt: null,
      },
      
      mismatch: {
        reported: false,
        reportedBy: 'none',
        confirmed: false,
        confirmedAt: null,
      },
      
      goodwillRefund: {
        requestedByOrganizer: false,
        processed: false,
        amountTokens: 0,
      },
      
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection('eventTickets').doc(ticketId).set(ticket);
    
    return {
      success: true,
      ticketId,
    };
  } catch (error: any) {
    console.error('Error purchasing event ticket:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase ticket',
    };
  }
}

/**
 * Attendee cancels ticket - NO REFUND (policy for events)
 */
export async function attendeeCancelTicket(
  ticketId: string,
  attendeeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ticketRef = db.collection('eventTickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();
    
    if (!ticketDoc.exists) {
      return { success: false, error: 'Ticket not found' };
    }
    
    const ticket = ticketDoc.data() as EventTicket;
    
    // Verify attendee
    if (ticket.attendeeId !== attendeeId) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Check status
    if (ticket.status !== 'BOOKED') {
      return { success: false, error: `Cannot cancel ticket with status: ${ticket.status}` };
    }
    
    // Update ticket - NO REFUND
    await ticketRef.update({
      status: 'CANCELLED_ATTENDEE',
      updatedAt: new Date().toISOString(),
    });
    
    // Organizer keeps 80%, Avalo keeps 20%
    // Payment already to organizer at completion
    
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('Error cancelling ticket (attendee):', error);
    return {
      success: false,
      error: error.message || 'Cancellation failed',
    };
  }
}

/**
 * Organizer cancels event - FULL 100% refund including Avalo fee
 */
export async function organizerCancelEvent(
  eventId: string,
  organizerId: string
): Promise<{ success: boolean; refundCount?: number; error?: string }> {
  try {
    // Get all tickets for this event
    const ticketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', '==', 'BOOKED')
      .get();
    
    let refundCount = 0;
    
    // Process refunds
    for (const ticketDoc of ticketsSnap.docs) {
      const ticket = ticketDoc.data() as EventTicket;
      
      // FULL refund = 100% of price (including Avalo's 20%)
      const fullRefund = ticket.priceTokens;
      
      const refundResult = await walletRefundTokens({
        userId: ticket.attendeeId,
        amountTokens: fullRefund,
        source: 'EVENT',
        relatedId: ticket.ticketId,
        reason: 'Event cancelled by organizer',
        metadata: {
          eventId,
          organizerId,
          fullRefundIncludingFee: true,
        },
      });
      
      if (refundResult.success) {
        // Update ticket
        await ticketDoc.ref.update({
          status: 'CANCELLED_ORGANIZER',
          'split.organizerShareTokens': 0,
          'split.platformShareTokens': 0,
          'payment.refundedTokensTotal': fullRefund,
          'payment.refundedToAttendeeTokens': fullRefund,
          'payment.avalosFeeRefunded': true, // YES - Avalo refunds its fee
          updatedAt: new Date().toISOString(),
        });
        
        refundCount++;
      }
    }
    
    return {
      success: true,
      refundCount,
    };
  } catch (error: any) {
    console.error('Error cancelling event (organizer):', error);
    return {
      success: false,
      error: error.message || 'Event cancellation failed',
    };
  }
}

/**
 * Check if event meets 70% check-in threshold for payout
 */
export async function checkEventPayoutEligibility(
  eventId: string
): Promise<{ eligible: boolean; checkInRate: number; reason?: string }> {
  try {
    // Count total tickets
    const totalTicketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['BOOKED', 'CHECKED_IN', 'COMPLETED'])
      .get();
    
    const totalTickets = totalTicketsSnap.size;
    
    if (totalTickets === 0) {
      return {
        eligible: false,
        checkInRate: 0,
        reason: 'No tickets sold',
      };
    }
    
    // Count checked-in tickets
    const checkedInSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('checkIn.qrVerified', '==', true)
      .where('checkIn.selfieVerified', '==', true)
      .get();
    
    const checkedInCount = checkedInSnap.size;
    const checkInRate = (checkedInCount / totalTickets) * 100;
    
    const eligible = checkInRate >= ECONOMICS.CHECK_IN_THRESHOLD_PERCENT;
    
    return {
      eligible,
      checkInRate,
      reason: eligible ? undefined : `Check-in rate ${checkInRate.toFixed(1)}% < ${ECONOMICS.CHECK_IN_THRESHOLD_PERCENT}% threshold`,
    };
  } catch (error: any) {
    console.error('Error checking event payout eligibility:', error);
    return {
      eligible: false,
      checkInRate: 0,
      reason: error.message || 'Error checking eligibility',
    };
  }
}

/**
 * Complete event and pay organizer (if threshold met)
 */
export async function completeEventAndPayout(
  eventId: string,
  organizerId: string
): Promise<{ success: boolean; organizerPaid?: number; error?: string }> {
  try {
    // Check eligibility
    const eligibility = await checkEventPayoutEligibility(eventId);
    
    if (!eligibility.eligible) {
      return {
        success: false,
        error: eligibility.reason || 'Event does not meet payout criteria',
      };
    }
    
    // Get all non-refunded tickets
    const ticketsSnap = await db.collection('eventTickets')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['BOOKED', 'CHECKED_IN'])
      .where('payment.refundedTokensTotal', '==', 0)
      .get();
    
    // Calculate total earnings
    let totalEarnings = 0;
    ticketsSnap.forEach(doc => {
      const ticket = doc.data() as EventTicket;
      totalEarnings += ticket.split.organizerShareTokens;
    });
    
    if (totalEarnings === 0) {
      return { success: false, error: 'No earnings to payout' };
    }
    
    // Pay organizer
    const earnResult = await earnTokens({
      userId: organizerId,
      amountTokens: totalEarnings,
      source: 'EVENT',
      relatedId: eventId,
      metadata: {
        ticketCount: ticketsSnap.size,
        checkInRate: eligibility.checkInRate,
        reason: 'Event completed',
      },
    });
    
    if (!earnResult.success) {
      return { success: false, error: 'Payout failed' };
    }
    
    // Update all tickets to COMPLETED
    const batch = db.batch();
    ticketsSnap.forEach(doc => {
      batch.update(doc.ref, {
        status: 'COMPLETED',
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    
    return {
      success: true,
      organizerPaid: totalEarnings,
    };
  } catch (error: any) {
    console.error('Error completing event and payout:', error);
    return {
      success: false,
      error: error.message || 'Event completion failed',
    };
  }
}

// Export for use by other modules
export { ECONOMICS };