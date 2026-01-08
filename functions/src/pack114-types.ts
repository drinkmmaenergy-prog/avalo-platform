/**
 * PACK 114 — Affiliate Layer for Professional Studio Creators & Agencies
 * Type Definitions
 * 
 * COMPLIANCE RULES:
 * - Token price per unit remains constant
 * - Avalo always receives 35% commission from paid interactions
 * - Creators never lose more than their own 65% share
 * - Affiliates/Studios receive a sub-split inside the creator's 65%
 * - No visibility boosts, no "featured creators", no algorithmic bias
 * - No free tokens, discounts, bonuses, cashback, promo-codes
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// AGENCY ACCOUNTS
// ============================================================================

export type AgencyStatus = 
  | 'ACTIVE'           // Active and approved
  | 'PENDING_KYC'      // Awaiting KYC verification
  | 'SUSPENDED'        // Temporarily suspended
  | 'BLOCKED';         // Permanently blocked

export interface CreatorAgencyAccount {
  agencyId: string;
  name: string;
  legalEntity: string;
  country: string;
  status: AgencyStatus;
  contactEmails: string[];
  
  // KYC verification
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'BLOCKED';
  kycDocumentId?: string;
  kycVerifiedAt?: Timestamp;
  
  // Operational data
  linkedCreatorCount: number;
  totalEarnings: number;           // Lifetime earnings in tokens
  activeEarnings: number;          // Current period earnings
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;               // User ID who created
  
  // Payout details
  payoutMethod?: 'BANK_TRANSFER' | 'WISE' | 'STRIPE';
  payoutDetails?: Record<string, any>;
}

// ============================================================================
// CREATOR-AGENCY LINKAGE
// ============================================================================

export type LinkStatus = 
  | 'PENDING'          // Request sent, awaiting creator acceptance
  | 'ACTIVE'           // Link active and operational
  | 'REMOVED_BY_CREATOR'   // Creator removed the link
  | 'REMOVED_BY_AGENCY'    // Agency removed the link
  | 'SUSPENDED';       // Suspended by platform

export interface CreatorAgencyLink {
  linkId: string;
  creatorUserId: string;
  agencyId: string;
  
  // Revenue split (from creator's 65%)
  percentageForAgency: number;     // e.g., 20 = 20% of creator's 65%
  
  // Status
  status: LinkStatus;
  verified: boolean;               // Both parties accepted
  
  // Consent tracking
  requestedBy: 'AGENCY' | 'CREATOR';
  requestedAt: Timestamp;
  acceptedAt?: Timestamp;
  removedAt?: Timestamp;
  removedReason?: string;
  
  // Revenue tracking
  totalEarningsGenerated: number;  // Total creator earnings while linked
  agencyEarningsTotal: number;     // Total agency share
  creatorEarningsTotal: number;    // Total creator share after split
  
  // Lifecycle
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// LINK REQUEST (TEMPORARY)
// ============================================================================

export interface AgencyLinkRequest {
  requestId: string;
  agencyId: string;
  creatorUserId: string;
  proposedPercentage: number;
  message?: string;
  
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  
  createdAt: Timestamp;
  expiresAt: Timestamp;
  resolvedAt?: Timestamp;
}

// ============================================================================
// EARNINGS LEDGER EXTENSION
// ============================================================================

export interface AgencyEarningsSplit {
  earningId: string;              // Reference to earnings_ledger entry
  creatorUserId: string;
  agencyId: string;
  linkId: string;
  
  // Original transaction
  grossTokens: number;            // 100%
  platformAmount: number;         // 35%
  creatorShareBefore: number;     // 65%
  
  // After agency split
  agencyPercentage: number;       // e.g., 20%
  agencyAmount: number;           // e.g., 13 tokens (20% of 65)
  creatorAmount: number;          // e.g., 52 tokens (80% of 65)
  
  // Metadata
  sourceType: 'GIFT' | 'PREMIUM_STORY' | 'PAID_MEDIA' | 'PAID_CALL' | 'AI_COMPANION' | 'OTHER';
  sourceId: string;
  
  createdAt: Timestamp;
}

// ============================================================================
// AGENCY ANALYTICS (AGGREGATED ONLY)
// ============================================================================

export interface AgencyAnalytics {
  agencyId: string;
  creatorUserId: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME';
  periodStart: string;             // YYYY-MM-DD
  periodEnd: string;               // YYYY-MM-DD
  
  // Revenue metrics
  totalEarningsGenerated: number;  // Creator's gross before split
  agencyEarnings: number;          // Agency's share
  creatorEarnings: number;         // Creator's share after split
  
  // Engagement metrics (counts only, no identity)
  followersCount: number;
  likesCount: number;
  paidInteractionsCount: number;
  contentPublishedCount: number;
  
  // Breakdown by source
  breakdown: {
    gifts: number;
    premiumStories: number;
    paidMedia: number;
    paidCalls: number;
    aiCompanion: number;
    other: number;
  };
  
  computedAt: Timestamp;
}

// ============================================================================
// AGENCY PAYOUT EXTENSION
// ============================================================================

export interface AgencyPayout {
  payoutId: string;
  agencyId: string;
  
  // Amount
  amountTokens: number;
  amountPLN: number;
  
  // Method
  method: 'BANK_TRANSFER' | 'WISE' | 'STRIPE';
  details: Record<string, any>;
  
  // Status
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  
  // KYC requirement
  kycVerified: boolean;
  
  // Lifecycle
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
  failureReason?: string;
  
  // Audit
  processedBy?: string;
  externalTransactionId?: string;
}

// ============================================================================
// SAFETY & ENFORCEMENT
// ============================================================================

export type AgencyViolationType =
  | 'FORCED_LINKAGE'               // Forcing creator to link
  | 'UNSOLICITED_REQUESTS'         // Mass spam requests
  | 'SUSPICIOUS_PAYOUT'            // Suspicious payout patterns
  | 'MINOR_EXPLOITATION'           // Minors detected
  | 'EXCESSIVE_PERCENTAGE'         // Taking too high a cut
  | 'PRIVACY_VIOLATION'            // Accessing private data
  | 'CONTRACT_VIOLATION';          // Violating platform terms

export interface AgencyViolation {
  violationId: string;
  agencyId: string;
  type: AgencyViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Evidence
  affectedCreatorIds: string[];
  evidenceRefs: string[];
  description: string;
  
  // Status
  status: 'DETECTED' | 'INVESTIGATING' | 'CONFIRMED' | 'FALSE_POSITIVE';
  
  // Actions taken
  agencySuspended: boolean;
  creatorProtectionApplied: boolean;
  criminalReferral: boolean;
  
  // Metadata
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  notes?: string;
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export type AgencyAuditEventType =
  | 'AGENCY_CREATED'
  | 'AGENCY_STATUS_CHANGED'
  | 'LINK_REQUESTED'
  | 'LINK_ACCEPTED'
  | 'LINK_REJECTED'
  | 'LINK_REMOVED'
  | 'EARNING_SPLIT_APPLIED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_COMPLETED'
  | 'VIOLATION_DETECTED'
  | 'AGENCY_SUSPENDED'
  | 'AGENCY_BLOCKED';

export interface AgencyAuditLog {
  logId: string;
  eventType: AgencyAuditEventType;
  agencyId: string;
  creatorUserId?: string;
  
  // Context
  previousValue?: any;
  newValue?: any;
  metadata: Record<string, any>;
  
  // Actor
  actorId?: string;
  actorType: 'AGENCY' | 'CREATOR' | 'ADMIN' | 'SYSTEM';
  
  // Timestamp
  timestamp: Timestamp;
}

// ============================================================================
// API SCOPES FOR PACK 113 INTEGRATION
// ============================================================================

export type AgencyAPIScope =
  | 'AGENCY_ANALYTICS_READ'        // Read aggregated analytics
  | 'CREATOR_LIST_READ'            // Read list of linked creators
  | 'EARNINGS_READ_AGGREGATED';    // Read aggregated earnings

// Forbidden scopes (explicitly listed for security)
export type ForbiddenAgencyScope =
  | 'MESSAGE_READ'                 // Privacy violation
  | 'MESSAGE_WRITE'                // Privacy violation
  | 'SUBSCRIBER_IDENTITY'          // Privacy violation
  | 'VIEWER_IDENTITY'              // Privacy violation
  | 'DM_ACCESS'                    // Privacy violation
  | 'FOLLOWER_NAMES'               // Privacy violation
  | 'NSFW_ACCESS'                  // Content policy
  | 'PRICE_MODIFICATION'           // Economic policy
  | 'PAYOUT_INITIATION'            // Financial compliance
  | 'DISCOVERY_BOOST';             // Fairness policy

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export interface AgencyValidationRules {
  minPercentage: number;           // Minimum agency percentage (e.g., 5%)
  maxPercentage: number;           // Maximum agency percentage (e.g., 40%)
  maxLinkedCreators: number;       // Max creators per agency
  minLinkDuration: number;         // Minimum duration before removal (hours)
  maxRequestsPerDay: number;       // Max link requests per day
}

export const DEFAULT_AGENCY_RULES: AgencyValidationRules = {
  minPercentage: 5,
  maxPercentage: 40,
  maxLinkedCreators: 100,
  minLinkDuration: 24,
  maxRequestsPerDay: 10,
};

// ============================================================================
// ERROR CODES
// ============================================================================

export enum AgencyErrorCode {
  AGENCY_NOT_FOUND = 'AGENCY_NOT_FOUND',
  AGENCY_NOT_VERIFIED = 'AGENCY_NOT_VERIFIED',
  AGENCY_SUSPENDED = 'AGENCY_SUSPENDED',
  LINK_ALREADY_EXISTS = 'LINK_ALREADY_EXISTS',
  LINK_NOT_FOUND = 'LINK_NOT_FOUND',
  INVALID_PERCENTAGE = 'INVALID_PERCENTAGE',
  CREATOR_NOT_ELIGIBLE = 'CREATOR_NOT_ELIGIBLE',
  MAX_LINKS_REACHED = 'MAX_LINKS_REACHED',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export class AgencyError extends Error {
  code: AgencyErrorCode;
  details?: Record<string, any>;

  constructor(code: AgencyErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'AgencyError';
  }
}