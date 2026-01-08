/**
 * PACK 312 — Customer Support Console & Case Management
 * TypeScript Type Definitions
 * 
 * RULES:
 * - No changes to token packages, prices, or payout rates
 * - No changes to revenue splits (65/35, 80/20)
 * - No free tokens or economic promotions
 * - All actions must follow existing business rules
 * - Full audit logging required
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ADMIN ROLES
// ============================================================================

export type AdminRole = 
  | 'SUPPORT'         // Can view context, handle tickets, trigger system flows
  | 'MODERATOR'       // Can handle content moderation cases
  | 'RISK'            // Can access risk/safety data, escalate to legal
  | 'FINANCE'         // Can access financial data, handle payment issues
  | 'LEGAL'           // Can access all data for legal compliance
  | 'SUPERADMIN';     // Full system access

export interface AdminUser {
  adminId: string;
  email: string;
  role: AdminRole;
  createdAt: Timestamp;
  lastActiveAt?: Timestamp;
  permissions?: string[];
}

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

export type TicketStatus =
  | 'OPEN'              // Newly created, awaiting assignment
  | 'IN_PROGRESS'       // Being worked on by support
  | 'WAITING_USER'      // Waiting for user response
  | 'ESCALATED'         // Escalated to Risk/Legal/Finance
  | 'RESOLVED'          // Issue resolved
  | 'CLOSED';           // Ticket closed

export type TicketPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';         // e.g., panic button triggers

export type TicketCategory =
  | 'ACCOUNT_VERIFICATION'
  | 'MEETING_MISMATCH'
  | 'MEETING_CANCEL_REFUND'
  | 'EVENT_REFUND'
  | 'PAYMENT_CHARGE'
  | 'PAYMENT_REFUND'
  | 'SAFETY_REPORT'
  | 'AI_COMPANION'
  | 'TECHNICAL'
  | 'OTHER';

export type CreatorType = 
  | 'USER'              // Created by user
  | 'ADMIN'             // Created by admin/support
  | 'SYSTEM';           // Auto-created by system

export type ResolutionType =
  | 'INFORMATION_ONLY'
  | 'SYSTEM_REFUND_TRIGGERED'
  | 'NO_ACTION'
  | 'ACCOUNT_REVIEWED'
  | 'ESCALATED_TO_RISK'
  | 'ESCALATED_TO_LEGAL'
  | 'ESCALATED_TO_FINANCE';

export interface SupportTicket {
  ticketId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Creator info
  createdBy: {
    type: CreatorType;
    userId?: string;
    adminId?: string;
  };
  
  // Status and priority
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  
  // Related entities
  userId?: string;              // Main affected user
  otherUserId?: string;         // Counterparty (meeting/event/chat partner)
  meetingId?: string;
  eventId?: string;
  transactionId?: string;
  payoutId?: string;
  
  // Content
  subject: string;
  description: string;
  tags: string[];               // e.g., ["PANIC_BUTTON", "SELFIE_MISMATCH"]
  
  // Assignment
  assignedToAdminId?: string;
  
  // Resolution
  resolution?: {
    resolvedByAdminId: string;
    resolvedAt: Timestamp;
    resolutionType: ResolutionType;
    resolutionNote?: string;
  };
}

// ============================================================================
// TICKET MESSAGES
// ============================================================================

export interface TicketMessage {
  messageId: string;
  ticketId: string;
  createdAt: Timestamp;
  
  // Author
  authorType: 'USER' | 'ADMIN' | 'SYSTEM';
  authorId: string;           // userId or adminId
  authorName?: string;
  
  // Content
  message: string;
  attachments?: string[];     // URLs to screenshots/evidence
  
  // Visibility
  internalNote: boolean;      // Only visible to admins
}

// ============================================================================
// USER CONTEXT DATA (Privacy-aware)
// ============================================================================

export interface UserContextSummary {
  userId: string;
  handle: string;
  age?: number;               // Only if 18+
  country?: string;
  languages?: string[];
  
  // Verification & Trust
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'BLOCKED';
  verificationDate?: Timestamp;
  trustLabel?: string;        // From PACK 308
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Monetization
  earnOn: boolean;
  royalStatus?: boolean;
  vipStatus?: boolean;
  influencerBadge?: boolean;
  
  // Safety (aggregated only)
  safetyReportsCount?: number;
  activeBans?: number;
  activeMutes?: number;
}

// ============================================================================
// MEETING/EVENT CONTEXT
// ============================================================================

export interface MeetingContextSummary {
  meetingId: string;
  creatorId: string;
  bookerId?: string;
  
  // Time and location (coarse)
  startTime: Timestamp;
  endTime: Timestamp;
  locationType: 'IN_PERSON' | 'ONLINE';
  locationCity?: string;      // Coarse location, not exact coords
  
  // Verification
  qrVerificationStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_TAKEN';
  selfieVerificationStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_TAKEN';
  
  // Safety
  panicButtonTriggered: boolean;
  panicButtonTimestamp?: Timestamp;
  
  // Outcome
  meetingStatus: 'AVAILABLE' | 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  cancelledBy?: 'PAYER' | 'EARNER' | 'SYSTEM';
  completedAt?: Timestamp;
  
  // Refund
  refundApplied: boolean;
  refundReason?: string;
  refundAmount?: number;
}

export interface EventContextSummary {
  eventId: string;
  creatorId: string;
  attendeeIds?: string[];
  
  // Time and location
  startTime: Timestamp;
  endTime: Timestamp;
  locationType: 'IN_PERSON' | 'ONLINE';
  
  // Status
  eventStatus: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  cancelledBy?: string;
  
  // Refund
  refundsApplied: boolean;
}

// ============================================================================
// PAYMENT/TRANSACTION CONTEXT
// ============================================================================

export interface TransactionContextSummary {
  transactionId: string;
  type: 'CHAT_SPEND' | 'CALENDAR_BOOKING' | 'EVENT_TICKET' | 'REFUND' | 'TOKEN_PURCHASE' | 'PAYOUT' | 'OTHER';
  
  // Amounts (in tokens for internal, in currency for external)
  amountTokens?: number;
  amountCurrency?: number;
  currency?: string;
  
  // Parties
  fromUserId?: string;
  toUserId?: string;
  
  // Platform shares
  avaloShare?: number;
  creatorShare?: number;
  
  // Related entities
  relatedBookingId?: string;
  relatedChatSessionId?: string;
  relatedAiSessionId?: string;
  
  // Payment processor (no raw card data)
  paymentProcessor?: 'STRIPE' | 'OTHER';
  externalReferenceId?: string;
  
  // Status
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'DISPUTED';
  timestamp: Timestamp;
}

// ============================================================================
// SAFETY/RISK CONTEXT
// ============================================================================

export interface SafetyContextSummary {
  userId: string;
  
  // Risk metrics
  riskScore?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Incident counts (aggregated)
  safetyReportsReceived: number;
  safetyReportsSubmitted: number;
  panicButtonUsageCount: number;
  
  // Enforcement
  currentBans?: {
    type: string;
    expiresAt?: Timestamp;
  }[];
  currentMutes?: {
    type: string;
    expiresAt?: Timestamp;
  }[];
  
  // Recent incidents (summary only, no content)
  recentIncidents?: {
    incidentId: string;
    type: string;
    date: Timestamp;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }[];
}

// ============================================================================
// SUPPORT ACTIONS
// ============================================================================

export type SupportActionType =
  | 'MEETING_REFUND_RECHECK'
  | 'MEETING_CANCELLATION_RECHECK'
  | 'EVENT_REFUND_RECHECK'
  | 'MEETING_MARK_DISPUTE'
  | 'EVENT_MARK_DISPUTE'
  | 'ACCOUNT_DISABLE_EARNING'
  | 'ESCALATE_TO_RISK'
  | 'ESCALATE_TO_LEGAL'
  | 'ESCALATE_TO_FINANCE'
  | 'ACCOUNT_BAN'              // RISK/SUPERADMIN only
  | 'ADD_NOTE';

export interface SupportAction {
  actionId: string;
  ticketId: string;
  actionType: SupportActionType;
  performedBy: string;        // adminId
  performedAt: Timestamp;
  
  // Action-specific data
  actionData?: Record<string, any>;
  
  // Result
  success: boolean;
  resultMessage?: string;
  errorMessage?: string;
}

// ============================================================================
// AUDIT LOG EVENTS
// ============================================================================

export type SupportAuditEventType =
  | 'SUPPORT_TICKET_CREATED'
  | 'SUPPORT_TICKET_UPDATED_STATUS'
  | 'SUPPORT_TICKET_ASSIGNED'
  | 'SUPPORT_TICKET_ESCALATED'
  | 'SUPPORT_TICKET_RESOLVED'
  | 'SUPPORT_ACTION_MEETING_REFUND_RECHECK'
  | 'SUPPORT_ACTION_MEETING_CANCELLATION_RECHECK'
  | 'SUPPORT_ACTION_EVENT_REFUND_RECHECK'
  | 'SUPPORT_ACTION_ACCOUNT_DISABLED_EARNING'
  | 'SUPPORT_ACTION_ESCALATED_TO_RISK'
  | 'SUPPORT_ACTION_ESCALATED_TO_LEGAL'
  | 'SUPPORT_ACTION_ESCALATED_TO_FINANCE'
  | 'SUPPORT_ACTION_ACCOUNT_BANNED';

export interface SupportAuditLog {
  auditId: string;
  eventType: SupportAuditEventType;
  timestamp: Timestamp;
  
  // Actor
  adminId: string;
  adminRole: AdminRole;
  
  // Target
  ticketId?: string;
  userId?: string;
  
  // Event data
  oldState?: Record<string, any>;
  newState?: Record<string, any>;
  actionData?: Record<string, any>;
  
  // Context
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// API PAYLOADS
// ============================================================================

export interface CreateTicketPayload {
  category: TicketCategory;
  subject: string;
  description: string;
  priority?: TicketPriority;
  tags?: string[];
  
  // Related entities
  meetingId?: string;
  eventId?: string;
  transactionId?: string;
  otherUserId?: string;
  
  // Evidence
  attachments?: string[];
}

export interface UpdateTicketStatusPayload {
  ticketId: string;
  newStatus: TicketStatus;
  note?: string;
}

export interface AssignTicketPayload {
  ticketId: string;
  adminId: string;
}

export interface AddTicketMessagePayload {
  ticketId: string;
  message: string;
  attachments?: string[];
  internalNote?: boolean;
}

export interface ResolveTicketPayload {
  ticketId: string;
  resolutionType: ResolutionType;
  resolutionNote?: string;
}

export interface PerformSupportActionPayload {
  ticketId: string;
  actionType: SupportActionType;
  actionData?: Record<string, any>;
}