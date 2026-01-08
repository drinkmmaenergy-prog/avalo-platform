/**
 * PACK 147 — Advanced Refund & Dispute Resolution System
 * 
 * Types and interfaces for fair, fraud-proof refund/dispute handling.
 * 
 * RULES:
 * - Token price fixed (no reversible discounts)
 * - 65/35 split untouched (held in escrow during dispute)
 * - NO NSFW/romantic service claims as proof
 * - NO emotional satisfaction refunds
 * - Context-aware escrow windows
 * - 3-tier resolution (auto/AI/human)
 * - Fraud pattern detection
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export type TransactionType =
  | 'PAID_CHAT'
  | 'PAID_CALL'
  | 'MENTORSHIP_SESSION'
  | 'EVENT_TICKET'
  | 'DIGITAL_PRODUCT'
  | 'GATED_CLUB'
  | 'CHALLENGE'
  | 'PAID_POST'
  | 'MEDIA_UNLOCK';

// ============================================================================
// ESCROW STATUS
// ============================================================================

export type EscrowStatus =
  | 'HELD'           // Payment held, awaiting release condition
  | 'RELEASED'       // Released to recipient
  | 'REFUNDED'       // Refunded to payer
  | 'DISPUTED'       // Under dispute review
  | 'EXPIRED';       // Escrow window expired, auto-released

// ============================================================================
// REFUND STATUS
// ============================================================================

export type RefundStatus =
  | 'PENDING'        // Awaiting evaluation
  | 'UNDER_REVIEW'   // Being reviewed (AI or human)
  | 'APPROVED'       // Refund approved
  | 'REJECTED'       // Refund rejected
  | 'COMPLETED'      // Refund processed
  | 'CANCELLED';     // Cancelled by requester

// ============================================================================
// REFUND REASON
// ============================================================================

export type RefundReason =
  // Valid reasons
  | 'NOT_DELIVERED'           // Product/service never delivered
  | 'CALL_NEVER_HAPPENED'     // Call never connected
  | 'EVENT_CANCELLED'         // Event was cancelled
  | 'ACCESS_NOT_GRANTED'      // Access denied after payment
  | 'FILE_CORRUPTED'          // File downloaded but unusable
  | 'TECHNICAL_ERROR'         // Platform technical issue
  
  // Invalid reasons (auto-rejected)
  | 'NOT_ENOUGH_ATTENTION'    // Emotional satisfaction claim
  | 'NOT_NICE_ENOUGH'         // Emotional satisfaction claim
  | 'EXPECTED_ROMANCE'        // Romantic service claim
  | 'CONTENT_CONSUMED'        // Consumed then requested refund
  | 'CHANGED_MIND';           // Simple buyer's remorse

// ============================================================================
// DISPUTE TIER
// ============================================================================

export type DisputeTier =
  | 'TIER_1_AUTO'      // Automatically resolved (quantifiable)
  | 'TIER_2_AI'        // AI review (ambiguous but factual)
  | 'TIER_3_HUMAN';    // Human arbitration (complex/escalated)

// ============================================================================
// DISPUTE OUTCOME
// ============================================================================

export type DisputeOutcome =
  | 'BUYER_WINS_FULL'      // Full refund to buyer
  | 'BUYER_WINS_PARTIAL'   // Partial refund to buyer
  | 'CREATOR_WINS'         // No refund, creator keeps payment
  | 'SPLIT_DECISION'       // Custom split (rare)
  | 'PENDING_EVIDENCE';    // More evidence needed

// ============================================================================
// FRAUD PATTERN TYPES
// ============================================================================

export type FraudPattern =
  | 'REFUND_FARMING'          // Buy → consume → refund repeatedly
  | 'TOKEN_LAUNDERING'        // Back-and-forth transfers
  | 'PARTIAL_DELIVERY_SCAM'   // Creator sends partial delivery repeatedly
  | 'EMOTIONAL_BLACKMAIL'     // Threatening negative actions
  | 'ROMANCE_MANIPULATION'    // Claiming romantic expectations
  | 'COORDINATED_ATTACK'      // Multiple users targeting one creator
  | 'ACCOUNT_HOPPING';        // Using multiple accounts for refunds

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Escrow Wallet - holds payment until conditions met
 */
export interface EscrowWallet {
  escrowId: string;
  transactionType: TransactionType;
  transactionId: string;
  
  // Parties
  payerId: string;
  recipientId: string;
  
  // Amounts (in tokens)
  totalAmount: number;
  platformFee: number;        // 35% of total
  recipientAmount: number;    // 65% of total
  
  // Status
  status: EscrowStatus;
  
  // Release conditions
  releaseCondition: string;   // e.g., "message_delivered", "call_completed"
  releaseWindowStart: Timestamp;
  releaseWindowEnd: Timestamp;
  autoReleaseAt: Timestamp;
  
  // Context
  metadata: {
    [key: string]: any;
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  releasedAt?: Timestamp;
  refundedAt?: Timestamp;
}

/**
 * Refund Request
 */
export interface RefundRequest {
  refundId: string;
  escrowId: string;
  transactionId: string;
  transactionType: TransactionType;
  
  // Parties
  requesterId: string;        // Usually buyer
  recipientId: string;        // Usually creator
  
  // Request details
  reason: RefundReason;
  description: string;
  evidenceUrls: string[];
  
  // Status
  status: RefundStatus;
  
  // Evaluation
  tier: DisputeTier;
  confidence?: number;        // AI confidence (0-1)
  evaluatedBy?: string;       // 'auto' | 'ai' | userId (human)
  evaluationNotes?: string;
  
  // Outcome
  outcome?: DisputeOutcome;
  refundAmount?: number;
  
  // Timestamps
  requestedAt: Timestamp;
  evaluatedAt?: Timestamp;
  completedAt?: Timestamp;
  
  // Metadata
  metadata: {
    [key: string]: any;
  };
}

/**
 * Dispute Case
 */
export interface DisputeCase {
  caseId: string;
  refundId: string;
  escrowId: string;
  
  // Parties
  disputantId: string;
  defendantId: string;
  
  // Case details
  transactionType: TransactionType;
  transactionId: string;
  disputeAmount: number;
  
  // Status
  tier: DisputeTier;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
  
  // Evidence
  evidence: DisputeEvidence[];
  
  // Resolution
  outcome?: DisputeOutcome;
  resolution?: string;
  resolvedBy?: string;
  
  // Timestamps
  openedAt: Timestamp;
  resolvedAt?: Timestamp;
  
  // Metadata
  metadata: {
    [key: string]: any;
  };
}

/**
 * Dispute Evidence
 */
export interface DisputeEvidence {
  evidenceId: string;
  submittedBy: string;
  evidenceType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TRANSACTION_LOG';
  content?: string;
  fileUrl?: string;
  timestamp: Timestamp;
  verified: boolean;
}

/**
 * Fraud Detection Record
 */
export interface FraudDetectionRecord {
  recordId: string;
  userId: string;
  
  // Pattern detection
  pattern: FraudPattern;
  confidence: number;        // 0-1
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Evidence
  detectionMetrics: {
    refundCount30Days?: number;
    refundSuccessRate?: number;
    averageConsumptionBeforeRefund?: number;
    coordinatedAccountsDetected?: string[];
    [key: string]: any;
  };
  
  // Action taken
  actionTaken: 'FLAGGED' | 'WARNING' | 'PAYOUT_FREEZE' | 'ACCOUNT_SUSPENSION' | 'BAN';
  actionReason: string;
  
  // Timestamps
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
}

/**
 * Reputation Impact Record (for PACK 140 integration)
 */
export interface ReputationImpactRecord {
  impactId: string;
  userId: string;
  
  // Source
  sourceType: 'REFUND' | 'DISPUTE';
  sourceId: string;
  
  // Impact
  dimension: 'RELIABILITY' | 'COMMUNICATION' | 'DELIVERY' | 'SAFETY';
  scoreImpact: number;       // -20 to +10
  reason: string;
  
  // Timestamp
  recordedAt: Timestamp;
}

// ============================================================================
// RELEASE CONDITIONS BY TRANSACTION TYPE
// ============================================================================

export const RELEASE_CONDITIONS: Record<TransactionType, {
  condition: string;
  windowMinutes: number;
  autoReleaseHours: number;
}> = {
  PAID_CHAT: {
    condition: 'message_delivered',
    windowMinutes: 30,
    autoReleaseHours: 24
  },
  PAID_CALL: {
    condition: 'call_completed',
    windowMinutes: 30,
    autoReleaseHours: 24
  },
  MENTORSHIP_SESSION: {
    condition: 'session_completed',
    windowMinutes: 0,           // Until session start or completed
    autoReleaseHours: 48
  },
  EVENT_TICKET: {
    condition: 'event_started',
    windowMinutes: 0,           // Until event start
    autoReleaseHours: 72
  },
  DIGITAL_PRODUCT: {
    condition: 'file_delivered',
    windowMinutes: 1440,        // 24 hours
    autoReleaseHours: 168       // 7 days
  },
  GATED_CLUB: {
    condition: 'access_granted_24h',
    windowMinutes: 1440,        // 24 hours
    autoReleaseHours: 48
  },
  CHALLENGE: {
    condition: 'participation_access_granted',
    windowMinutes: 1440,        // 24 hours
    autoReleaseHours: 48
  },
  PAID_POST: {
    condition: 'content_unlocked',
    windowMinutes: 30,
    autoReleaseHours: 24
  },
  MEDIA_UNLOCK: {
    condition: 'media_unlocked',
    windowMinutes: 30,
    autoReleaseHours: 24
  }
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if refund reason is valid (auto-reject emotional/romantic claims)
 */
export function isValidRefundReason(reason: RefundReason): boolean {
  const invalidReasons: RefundReason[] = [
    'NOT_ENOUGH_ATTENTION',
    'NOT_NICE_ENOUGH',
    'EXPECTED_ROMANCE',
    'CONTENT_CONSUMED',
    'CHANGED_MIND'
  ];
  
  return !invalidReasons.includes(reason);
}

/**
 * Check if refund is within allowed window
 */
export function isWithinRefundWindow(
  transactionType: TransactionType,
  transactionTimestamp: Date
): boolean {
  const config = RELEASE_CONDITIONS[transactionType];
  const windowMs = config.windowMinutes * 60 * 1000;
  const now = Date.now();
  const transactionTime = transactionTimestamp.getTime();
  
  return (now - transactionTime) <= windowMs;
}

/**
 * Determine dispute tier based on transaction type and reason
 */
export function determineDisputeTier(
  transactionType: TransactionType,
  reason: RefundReason
): DisputeTier {
  // Auto-resolvable (quantifiable outcomes)
  const tier1Reasons: RefundReason[] = [
    'NOT_DELIVERED',
    'CALL_NEVER_HAPPENED',
    'EVENT_CANCELLED',
    'ACCESS_NOT_GRANTED',
    'TECHNICAL_ERROR'
  ];
  
  if (tier1Reasons.includes(reason)) {
    return 'TIER_1_AUTO';
  }
  
  // AI review (ambiguous but factual)
  const tier2Reasons: RefundReason[] = [
    'FILE_CORRUPTED'
  ];
  
  if (tier2Reasons.includes(reason)) {
    return 'TIER_2_AI';
  }
  
  // Human arbitration (default for complex cases)
  return 'TIER_3_HUMAN';
}

/**
 * Calculate refund amount based on dispute outcome
 */
export function calculateRefundAmount(
  totalAmount: number,
  outcome: DisputeOutcome
): number {
  switch (outcome) {
    case 'BUYER_WINS_FULL':
      return totalAmount;
    case 'BUYER_WINS_PARTIAL':
      return Math.floor(totalAmount * 0.5);
    case 'CREATOR_WINS':
      return 0;
    default:
      return 0;
  }
}