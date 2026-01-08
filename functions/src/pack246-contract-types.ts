/**
 * PACK 246 - Global Consistency & Contract Enforcement Engine
 * Type definitions and contract rules
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONTRACT CONFIGURATION (NON-NEGOTIABLE RULES)
// ============================================================================

export const CONTRACT_RULES = {
  // Token purchases
  TOKEN_PURCHASES: {
    NO_DISCOUNTS: true,
    NO_FREE_TOKENS: true,
    MIN_PURCHASE: 100, // tokens
  },

  // Chat pricing
  CHAT: {
    STANDARD_PRICE: 100, // tokens per chat deposit
    MIN_PRICE: 100,
    MAX_PRICE: 500, // if dynamic pricing unlocked
    WORDS_PER_TOKEN_STANDARD: 11,
    WORDS_PER_TOKEN_ROYAL: 7,
    FREE_MESSAGES_PER_PARTICIPANT: 3,
  },

  // Revenue split (ALWAYS)
  REVENUE_SPLIT: {
    AVALO_PERCENT: 35,
    CREATOR_PERCENT: 65,
  },

  // Call pricing
  CALLS: {
    VOICE: {
      TOKENS_PER_MIN_STANDARD: 10,
      TOKENS_PER_MIN_VIP: 10,
      TOKENS_PER_MIN_ROYAL: 6,
    },
    VIDEO: {
      TOKENS_PER_MIN_STANDARD: 15,
      TOKENS_PER_MIN_VIP: 15,
      TOKENS_PER_MIN_ROYAL: 10,
    },
    AVALO_PERCENT: 20,
    EARNER_PERCENT: 80,
  },

  // Calendar & Events
  CALENDAR: {
    PAY_UPFRONT: true,
    REFUND_72H_PERCENT: 100,
    REFUND_48H_PERCENT: 50,
    REFUND_24H_PERCENT: 0,
    AVALO_FEE_PERCENT: 35, // Always kept by Avalo
  },

  // Safety requirements
  SAFETY: {
    PANIC_BUTTON_REQUIRED: true,
    SELFIE_VERIFICATION_REQUIRED: true,
    QR_VERIFICATION_REQUIRED: true,
    IDENTITY_CHECK_PER_MEETING: true,
  },

  // Free chat eligibility
  FREE_CHAT: {
    ONLY_LOW_POPULARITY: true,
    NEW_USERS_NEVER_FREE: true,
    NEW_USER_THRESHOLD_DAYS: 5,
  },

  // Voluntary refunds
  VOLUNTARY_REFUNDS: {
    AVALO_KEEPS_FEE: true,
    AVALO_FEE_PERCENT: 35,
  },
} as const;

// ============================================================================
// CONTRACT VIOLATION TYPES
// ============================================================================

export enum ViolationType {
  INVALID_PRICE = 'INVALID_PRICE',
  INVALID_SPLIT = 'INVALID_SPLIT',
  UNAUTHORIZED_DISCOUNT = 'UNAUTHORIZED_DISCOUNT',
  FREE_TOKEN_ATTEMPT = 'FREE_TOKEN_ATTEMPT',
  INVALID_REFUND = 'INVALID_REFUND',
  MISSING_SAFETY_CHECK = 'MISSING_SAFETY_CHECK',
  INVALID_FREE_CHAT = 'INVALID_FREE_CHAT',
  INVALID_BILLING_RATE = 'INVALID_BILLING_RATE',
  SPLIT_MANIPULATION = 'SPLIT_MANIPULATION',
  UNAUTHORIZED_FREE_FEATURE = 'UNAUTHORIZED_FREE_FEATURE',
}

// ============================================================================
// CONTRACT RULE DEFINITIONS
// ============================================================================

export interface ContractRule {
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  split?: {
    avalo: number;
    creator: number;
  };
  freeChatEligibility?: boolean;
  meetingRefundPolicy?: 'STANDARD' | 'CUSTOM';
  eventRefundPolicy?: 'STANDARD' | 'CUSTOM';
  safetyModeActive?: boolean;
  selfieVerified?: boolean;
  qrVerified?: boolean;
  billingMode?: 'perWord' | 'perMinute' | 'perTicket' | 'perToken';
  wordsPerToken?: number;
  tokensPerMinute?: number;
  panicButtonAvailable?: boolean;
}

// ============================================================================
// TRANSACTION TYPES FOR VALIDATION
// ============================================================================

export enum TransactionType {
  CHAT_DEPOSIT = 'CHAT_DEPOSIT',
  CHAT_BILLING = 'CHAT_BILLING',
  CALL_VOICE = 'CALL_VOICE',
  CALL_VIDEO = 'CALL_VIDEO',
  CALENDAR_BOOKING = 'CALENDAR_BOOKING',
  EVENT_BOOKING = 'EVENT_BOOKING',
  REFUND_REQUEST = 'REFUND_REQUEST',
  VOLUNTARY_REFUND = 'VOLUNTARY_REFUND',
  TOKEN_PURCHASE = 'TOKEN_PURCHASE',
  REVENUE_WITHDRAWAL = 'REVENUE_WITHDRAWAL',
  PRODUCT_PURCHASE = 'PRODUCT_PURCHASE',
}

// ============================================================================
// VALIDATION REQUEST
// ============================================================================

export interface ValidationRequest {
  transactionType: TransactionType;
  userId: string;
  targetUserId?: string; // For payer->earner transactions
  amount: number;
  metadata: {
    // Chat specific
    wordsPerToken?: number;
    messageCount?: number;
    isRoyalMember?: boolean;

    // Call specific
    callType?: 'VOICE' | 'VIDEO';
    durationMinutes?: number;
    tokensPerMinute?: number;

    // Calendar/Event specific
    bookingType?: 'CALENDAR' | 'EVENT';
    bookingDate?: Timestamp;
    hoursUntilEvent?: number;
    participantCount?: number;

    // Safety specific
    selfieVerified?: boolean;
    qrVerified?: boolean;
    panicButtonEnabled?: boolean;

    // Refund specific
    refundReason?: string;
    originalAmount?: number;
    originalTransactionId?: string;

    // Free chat eligibility
    popularity?: 'low' | 'mid' | 'high';
    accountAgeDays?: number;
    earnOnChat?: boolean;

    // Split validation
    proposedSplit?: {
      avalo: number;
      creator: number;
    };
  };
}

// ============================================================================
// VALIDATION RESULT
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  violations: ContractViolation[];
  correctedValues?: Partial<ValidationRequest>;
  action: 'ALLOW' | 'BLOCK' | 'AUTO_CORRECT';
}

export interface ContractViolation {
  type: ViolationType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  detectedValue: any;
  expectedValue: any;
  moduleSource?: string;
  timestamp: Timestamp;
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export interface AuditLogEntry {
  auditId: string;
  timestamp: Timestamp;
  transactionType: TransactionType;
  userId: string;
  validationResult: ValidationResult;
  correctionApplied: boolean;
  blockReason?: string;
  moduleAttemptingViolation?: string;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

export interface SuspiciousAnomaly {
  anomalyId: string;
  userId: string;
  anomalyType: 'PRICE_MANIPULATION' | 'SPLIT_BYPASS' | 'FREE_FEATURE_ABUSE' | 'REFUND_FRAUD' | 'SAFETY_BYPASS';
  detectedAt: Timestamp;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  autoActions: string[]; // e.g., ['FREEZE_EARNINGS', 'FLAG_ACCOUNT', 'NOTIFY_ADMIN']
  resolved: boolean;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

// ============================================================================
// NIGHTLY AUDIT REPORT
// ============================================================================

export interface NightlyAuditReport {
  reportId: string;
  dateRange: {
    start: Timestamp;
    end: Timestamp;
  };
  scannedTransactions: number;
  violationsFound: number;
  violationsByType: Record<ViolationType, number>;
  autoCorrected: number;
  blocked: number;
  anomaliesDetected: number;
  topViolatingModules: Array<{
    moduleName: string;
    violationCount: number;
  }>;
  summary: string;
  createdAt: Timestamp;
}

// ============================================================================
// SYSTEM STATS
// ============================================================================

export interface ContractEnforcementStats {
  totalValidations: number;
  totalViolations: number;
  totalBlocked: number;
  totalCorrected: number;
  averageResponseTimeMs: number;
  lastUpdated: Timestamp;
}