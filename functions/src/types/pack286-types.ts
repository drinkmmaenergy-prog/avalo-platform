/**
 * PACK 286 — Calendar & Events Type Definitions
 * Normalized schemas for bookings and event tickets
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BOOKING & TICKET STATUSES
// ============================================================================

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED_HOST'
  | 'CANCELLED_GUEST'
  | 'COMPLETED'
  | 'COMPLETED_GOODWILL'
  | 'MISMATCH_CONFIRMED'
  | 'NO_SHOW';

export type TicketStatus =
  | 'BOOKED'
  | 'CANCELLED_ORGANIZER'
  | 'CANCELLED_ATTENDEE'
  | 'CHECKED_IN'
  | 'NO_SHOW'
  | 'MISMATCH_CONFIRMED'
  | 'COMPLETED'
  | 'COMPLETED_GOODWILL';

// ============================================================================
// CALENDAR BOOKING SCHEMA
// ============================================================================

export interface CalendarBooking {
  bookingId: string;
  hostId: string;
  guestId: string;
  startTime: string; // ISO_DATETIME
  endTime: string; // ISO_DATETIME
  status: BookingStatus;
  priceTokens: number;

  split: {
    platformShareTokens: number; // 20% Avalo
    hostShareTokens: number; // 80% Host
  };

  payment: {
    chargedTokens: number;
    refundedTokensTotal: number;
    refundedToGuestTokens: number;
    refundedFromHostTokens: number;
    avalosFeeRefunded: boolean;
  };

  checkIn: {
    qrVerified: boolean;
    selfieVerified: boolean;
    checkedInAt: string | null; // ISO_DATETIME
  };

  mismatch: {
    reported: boolean;
    reportedBy: 'host' | 'guest' | 'none';
    confirmed: boolean;
    confirmedAt: string | null; // ISO_DATETIME
  };

  goodwillRefund: {
    requestedByHost: boolean;
    processed: boolean;
    amountTokens: number;
  };

  createdAt: string; // ISO_DATETIME
  updatedAt: string; // ISO_DATETIME
}

// ============================================================================
// EVENT TICKET SCHEMA
// ============================================================================

export interface EventTicket {
  ticketId: string;
  eventId: string;
  organizerId: string;
  attendeeId: string;
  status: TicketStatus;
  priceTokens: number;

  split: {
    platformShareTokens: number; // 20% Avalo
    organizerShareTokens: number; // 80% Organizer
  };

  payment: {
    chargedTokens: number;
    refundedTokensTotal: number;
    refundedToAttendeeTokens: number;
    refundedFromOrganizerTokens: number;
    avalosFeeRefunded: boolean;
  };

  checkIn: {
    qrVerified: boolean;
    selfieVerified: boolean;
    checkedInAt: string | null; // ISO_DATETIME
  };

  mismatch: {
    reported: boolean;
    reportedBy: 'organizer' | 'attendee' | 'none';
    confirmed: boolean;
    confirmedAt: string | null; // ISO_DATETIME
  };

  goodwillRefund: {
    requestedByOrganizer: boolean;
    processed: boolean;
    amountTokens: number;
  };

  createdAt: string; // ISO_DATETIME
  updatedAt: string; // ISO_DATETIME
}

// ============================================================================
// OPERATION RESULT TYPES
// ============================================================================

export interface BookingCreateResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

export interface BookingCancelResult {
  success: boolean;
  refundedTokens?: number;
  error?: string;
}

export interface MismatchConfirmResult {
  success: boolean;
  refundedTokens?: number;
  error?: string;
}

export interface GoodwillRefundResult {
  success: boolean;
  refundedTokens?: number;
  error?: string;
}

export interface TicketPurchaseResult {
  success: boolean;
  ticketId?: string;
  error?: string;
}

export interface EventPayoutEligibility {
  eligible: boolean;
  checkInRate: number;
  reason?: string;
}

export interface EventPayoutResult {
  success: boolean;
  organizerPaid?: number;
  error?: string;
}