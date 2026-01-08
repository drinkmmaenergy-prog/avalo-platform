/**
 * PACK 275 - Events Engine
 * TypeScript types for Events, Tickets, QR Codes, and Safety
 */

export type EventStatus = 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type TicketStatus = 
  | 'PURCHASED' 
  | 'CANCELLED_BY_PARTICIPANT' 
  | 'CANCELLED_BY_ORGANIZER' 
  | 'REFUNDED_MISMATCH' 
  | 'COMPLETED' 
  | 'NO_SHOW'
  | 'COMPLETED_GOODWILL';

export type LocationType = 'physical' | 'online' | 'hybrid';

export interface EventLocation {
  type: LocationType;
  address?: string;
  lat?: number;
  lng?: number;
  onlineUrl?: string;
}

export interface EventSafety {
  requireSelfieCheck: boolean;
  allowPanicMode: boolean;
}

export interface EventStats {
  ticketsSold: number;
  checkIns: number;
}

export interface Event {
  eventId: string;
  organizerId: string;
  title: string;
  description: string;
  location: EventLocation;
  startTime: string; // ISO_DATETIME
  endTime: string;   // ISO_DATETIME
  maxParticipants: number;
  priceTokens: number;
  currency: 'TOKENS';
  status: EventStatus;
  safety: EventSafety;
  stats: EventStats;
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface TicketPayment {
  totalTokensPaid: number;
  organizerShareTokens: number;  // 80%
  avaloShareTokens: number;       // 20%
  refundedUserTokens: number;
  refundedAvaloTokens: number;
}

export interface CheckInData {
  qrCode: string;
  checkInAt: string | null;
  selfieVerified: boolean;
}

export interface EventTicket {
  ticketId: string;
  eventId: string;
  organizerId: string;
  participantId: string;
  priceTokens: number;
  status: TicketStatus;
  payment: TicketPayment;
  checkIn: CheckInData;
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
}

// QR Code payload structure
export interface QRCodePayload {
  ticketId: string;
  eventId: string;
  participantId: string;
  timestamp: string;
  signature: string;
}

// Check-in result
export interface CheckInResult {
  success: boolean;
  ticketId: string;
  participantId: string;
  eventId: string;
  checkInTime: string;
  selfieVerified: boolean;
  error?: string;
}

// Mismatch report
export interface MismatchReport {
  ticketId: string;
  eventId: string;
  participantId: string;
  reportedBy: string;
  reason: string;
  timestamp: string;
  refundIssued: boolean;
}

// Event completion analysis
export interface EventCompletionAnalysis {
  eventId: string;
  totalTickets: number;
  successfulCheckIns: number;
  checkInRate: number;
  passedThreshold: boolean; // >= 70%
  payoutReady: boolean;
  flaggedForReview: boolean;
}

// Payout details
export interface OrganizerPayout {
  eventId: string;
  organizerId: string;
  totalEarnings: number;
  ticketsIncluded: string[];
  payoutDate: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FROZEN';
}

// Safety hook payload
export interface SafetyEventHook {
  eventId: string;
  eventType: 'CHECK_IN' | 'PANIC' | 'MISMATCH' | 'COMPLETION';
  location: EventLocation;
  participants: string[];
  additionalData: Record<string, any>;
  timestamp: string;
}