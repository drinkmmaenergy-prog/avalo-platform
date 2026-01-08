/**
 * PACK 209: Unified Meeting & Event Refund & Complaint Extensions
 * Type definitions for refund policies, complaints, and voluntary refunds
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// REFUND POLICY TYPES
// ============================================================================

export enum RefundTrigger {
  CANCELLATION_EARLY = 'CANCELLATION_EARLY', // ≥72 hours before meeting
  CANCELLATION_MID = 'CANCELLATION_MID', // 24-72 hours before meeting
  CANCELLATION_LATE = 'CANCELLATION_LATE', // <24 hours before meeting
  ORGANIZER_CANCEL = 'ORGANIZER_CANCEL', // Organizer cancels event
  APPEARANCE_MISMATCH = 'APPEARANCE_MISMATCH', // Not as described complaint
  VOLUNTARY_REFUND = 'VOLUNTARY_REFUND', // Earner/organizer voluntary refund
}

export enum ComplaintDecision {
  KEEP_COMPLETED = 'KEEP_COMPLETED', // End meeting, keep payment, flag profile
  ISSUE_REFUND = 'ISSUE_REFUND', // End meeting, refund payer (except Avalo commission)
}

export enum ComplaintType {
  APPEARANCE_MISMATCH = 'APPEARANCE_MISMATCH',
  IDENTITY_ISSUE = 'IDENTITY_ISSUE',
  SAFETY_CONCERN = 'SAFETY_CONCERN',
}

// ============================================================================
// 1:1 MEETING REFUND POLICY (65% earner / 35% Avalo)
// ============================================================================

export interface MeetingRefundPolicy {
  hoursBeforeMeeting: number;
  refundToPayerPercent: number; // % of earner share (65%)
  earnerKeepPercent: number; // % of earner share (65%)
  avaloCommissionRefundable: boolean; // Always false (35% always kept)
}

export const MEETING_REFUND_POLICIES: Record<string, MeetingRefundPolicy> = {
  EARLY: {
    hoursBeforeMeeting: 72,
    refundToPayerPercent: 100, // 100% of earner share (65%) refunded
    earnerKeepPercent: 0,
    avaloCommissionRefundable: false,
  },
  MID: {
    hoursBeforeMeeting: 24,
    refundToPayerPercent: 50, // 50% of earner share refunded
    earnerKeepPercent: 50, // 50% of earner share kept
    avaloCommissionRefundable: false,
  },
  LATE: {
    hoursBeforeMeeting: 0,
    refundToPayerPercent: 0, // No refund
    earnerKeepPercent: 100, // Earner keeps 100% of their share
    avaloCommissionRefundable: false,
  },
};

// ============================================================================
// EVENT REFUND POLICY (80% organizer / 20% Avalo)
// ============================================================================

export interface EventRefundPolicy {
  participantCancels: {
    refundPercent: number; // Always 0 - no refunds for participant cancellation
  };
  organizerCancels: {
    refundToParticipantPercent: number; // 100% of organizer share (80%)
    avaloCommissionRefundable: boolean; // Always false (20%)
  };
  noShow: {
    refundPercent: number; // Always 0 - no refunds for no-show
  };
}

export const EVENT_REFUND_POLICY: EventRefundPolicy = {
  participantCancels: {
    refundPercent: 0,
  },
  organizerCancels: {
    refundToParticipantPercent: 100, // Full organizer share (80%) refunded
    avaloCommissionRefundable: false,
  },
  noShow: {
    refundPercent: 0,
  },
};

// ============================================================================
// COMPLAINT RECORDS
// ============================================================================

export interface AppearanceComplaint {
  complaintId: string;
  bookingId?: string; // For 1:1 meetings
  eventId?: string; // For events
  type: ComplaintType;
  
  complainantId: string;
  complainantName: string;
  
  reportedUserId: string;
  reportedUserName: string;
  
  decision: ComplaintDecision;
  
  liveSelfieUrl?: string; // Selfie taken at meeting spot
  profilePhotosUrls?: string[]; // Profile photos for comparison
  
  mismatchScore?: number; // AI comparison score (0-100)
  manualReview?: boolean; // Flagged for human review
  
  refundAmount?: number; // If ISSUE_REFUND chosen
  tokensKept?: number; // Amount kept (Avalo commission)
  
  notes?: string;
  trustScoreImpact?: number; // Impact on profile trust score
  
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  
  metadata?: {
    deviceId?: string;
    ipHash?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

// ============================================================================
// VOLUNTARY REFUND
// ============================================================================

export interface VoluntaryRefund {
  refundId: string;
  bookingId?: string; // For 1:1 meetings
  eventId?: string; // For events
  attendeeId?: string; // For specific event attendee
  
  issuedBy: string; // Earner or organizer ID
  issuedByName: string;
  
  recipientId: string;
  recipientName: string;
  
  originalAmount: number; // Original price paid
  earnerShareAmount: number; // 65% for meetings, 80% for events
  avaloCommission: number; // 35% for meetings, 20% for events (never refunded)
  
  refundPercent: number; // 0-100% of earner share
  refundAmount: number; // Actual tokens refunded
  
  reason?: string;
  
  createdAt: Timestamp;
  processedAt?: Timestamp;
  
  metadata?: {
    source: 'meeting' | 'event';
  };
}

// ============================================================================
// REFUND TRANSACTION LOG
// ============================================================================

export interface RefundTransaction {
  transactionId: string;
  refundType: RefundTrigger | 'VOLUNTARY_REFUND';
  
  bookingId?: string;
  eventId?: string;
  attendeeId?: string;
  complaintId?: string;
  voluntaryRefundId?: string;
  
  payerId: string;
  earnerId: string | null;
  
  originalAmount: number;
  earnerShare: number;
  avaloCommission: number;
  
  refundToPayerAmount: number;
  earnerKeptAmount: number;
  avaloKeptAmount: number; // Always equals avaloCommission
  
  triggeredBy: string; // User ID who triggered refund
  automaticRefund: boolean;
  
  hoursBeforeMeeting?: number;
  
  notes?: string;
  
  createdAt: Timestamp;
  processedAt?: Timestamp;
  
  metadata?: {
    source: 'meeting' | 'event';
    cancellationReason?: string;
  };
}

// ============================================================================
// TRUST & SAFETY LOG
// ============================================================================

export interface TrustSafetyIncident {
  incidentId: string;
  type: 'APPEARANCE_COMPLAINT' | 'VOLUNTARY_REFUND' | 'CANCELLATION_PATTERN' | 'NO_SHOW';
  
  userId: string; // The user being flagged
  userName: string;
  
  relatedUserId?: string; // Other party involved
  
  complaintId?: string;
  voluntaryRefundId?: string;
  bookingId?: string;
  eventId?: string;
  
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  description: string;
  
  actionTaken?: 'FLAGGED' | 'PHOTO_UPDATE_REQUIRED' | 'RESTRICTED' | 'BANNED' | 'CLEARED';
  
  trustScoreImpact: number; // Negative or positive
  
  requiresManualReview: boolean;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  
  createdAt: Timestamp;
  
  metadata?: {
    selfieUrls?: string[];
    comparisonScore?: number;
    patternData?: any;
  };
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface RefundCalculation {
  canRefund: boolean;
  refundToPayerAmount: number;
  earnerKeeptAmount: number;
  avaloKeepsAmount: number;
  policy: MeetingRefundPolicy | EventRefundPolicy;
  reason: string;
}

export interface ComplaintResponse {
  success: boolean;
  complaintId?: string;
  decision?: ComplaintDecision;
  refundAmount?: number;
  error?: string;
}

export interface VoluntaryRefundResponse {
  success: boolean;
  refundId?: string;
  refundAmount?: number;
  error?: string;
}