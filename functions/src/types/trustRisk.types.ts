/**
 * PACK 85 — Trust & Risk Engine v1 Types
 * User risk scoring, flags, and enforcement
 */

import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// ENUMS
// ============================================================================

export type EnforcementLevel = "NONE" | "SOFT_LIMIT" | "HARD_LIMIT";

export type RiskFlag =
  | "POTENTIAL_SPAMMER"
  | "POTENTIAL_SCAMMER"
  | "HIGH_REPORT_RATE"
  | "HIGH_CHURN_PAYER"
  | "MULTI_ACCOUNT_SUSPECT"
  | "AGGRESSIVE_SENDER"
  | "KYC_FRAUD_RISK"
  | "PAYMENT_FRAUD_RISK"
  | "CHARGEBACKS_HIGH";

export type TrustEventType =
  | "REPORT_RECEIVED"
  | "BLOCK_RECEIVED"
  | "KYC_REJECTED"
  | "KYC_BLOCKED"
  | "CHARGEBACK_FILED"
  | "MASS_MESSAGING"
  | "MASS_GIFTING"
  | "PAYOUT_FRAUD_ATTEMPT"
  | "GOOD_BEHAVIOR_DECAY";

// ============================================================================
// FIRESTORE DOCUMENTS
// ============================================================================

/**
 * user_trust_profile collection
 * One document per user (userId as document ID)
 */
export interface UserTrustProfile {
  userId: string;
  riskScore: number; // 0-100, higher = more risky
  enforcementLevel: EnforcementLevel;
  flags: RiskFlag[];
  lastUpdatedAt: Timestamp;
  version: number; // Scoring model version
  
  // Optional manual override
  manualOverride?: {
    appliedBy: string; // Admin user ID
    appliedAt: Timestamp;
    reason: string;
    overrideScore?: number;
    overrideEnforcement?: EnforcementLevel;
  };
}

/**
 * user_trust_events collection
 * Multiple events per user
 */
export interface UserTrustEvent {
  id: string; // UUID
  userId: string; // User being evaluated
  type: TrustEventType;
  weight: number; // Numeric contribution to risk score (can be negative)
  meta: {
    reporterId?: string;
    reason?: string;
    sourceModule?: string;
    kycDocumentId?: string;
    transactionId?: string;
    messageCount?: number;
    recipientCount?: number;
    [key: string]: any;
  };
  createdAt: Timestamp;
}

/**
 * user_trust_audit collection (optional, for deeper forensics)
 * Tracks all risk score changes
 */
export interface UserTrustAudit {
  id: string;
  userId: string;
  action: "SCORE_CHANGE" | "FLAG_ADDED" | "FLAG_REMOVED" | "ENFORCEMENT_CHANGE" | "MANUAL_OVERRIDE";
  previousScore?: number;
  newScore?: number;
  previousEnforcement?: EnforcementLevel;
  newEnforcement?: EnforcementLevel;
  flags?: RiskFlag[];
  triggeredBy: string; // "SYSTEM" | admin user ID
  reason?: string;
  createdAt: Timestamp;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface LogTrustEventInput {
  userId: string;
  type: TrustEventType;
  weightOverride?: number; // Optional manual weight
  meta?: Record<string, any>;
}

export interface RecalculateRiskInput {
  userId: string;
}

export interface GetTrustProfileOutput {
  userId: string;
  riskScore: number;
  enforcementLevel: EnforcementLevel;
  flags: RiskFlag[];
  canSendMessages: boolean;
  canSendGifts: boolean;
  canRequestPayout: boolean;
  canUsePaidFeatures: boolean;
  lastUpdatedAt: string; // ISO string for client
}

export interface EnforcementCheckResult {
  allowed: boolean;
  reason?: string;
  errorCode?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TrustEngineConfig {
  version: number;
  baseScore: number; // Default score for new users
  
  // Event weights
  eventWeights: {
    [key in TrustEventType]: number;
  };
  
  // Scoring thresholds
  thresholds: {
    softLimit: number; // Risk score >= this = SOFT_LIMIT
    hardLimit: number; // Risk score >= this = HARD_LIMIT
  };
  
  // Decay settings
  decay: {
    enabled: boolean;
    daysInterval: number; // Apply decay every N days
    decreaseAmount: number; // Decrease score by this amount
    minimumScore: number; // Don't decay below this
  };
  
  // Flag triggers
  flagTriggers: {
    potentialSpammer: {
      blocksReceivedThreshold: number;
      reportsReceivedThreshold: number;
      timePeriodDays: number;
    };
    potentialScammer: {
      financialReportsThreshold: number;
      timePeriodDays: number;
    };
    highReportRate: {
      reportsThreshold: number;
      timePeriodDays: number;
    };
  };
}

export const DEFAULT_TRUST_ENGINE_CONFIG: TrustEngineConfig = {
  version: 1,
  baseScore: 10, // New users start with low risk
  
  eventWeights: {
    REPORT_RECEIVED: 8,
    BLOCK_RECEIVED: 5,
    KYC_REJECTED: 20,
    KYC_BLOCKED: 40,
    CHARGEBACK_FILED: 25,
    MASS_MESSAGING: 15,
    MASS_GIFTING: 12,
    PAYOUT_FRAUD_ATTEMPT: 30,
    GOOD_BEHAVIOR_DECAY: -2,
  },
  
  thresholds: {
    softLimit: 25,
    hardLimit: 50,
  },
  
  decay: {
    enabled: true,
    daysInterval: 30,
    decreaseAmount: 2,
    minimumScore: 0,
  },
  
  flagTriggers: {
    potentialSpammer: {
      blocksReceivedThreshold: 5,
      reportsReceivedThreshold: 3,
      timePeriodDays: 30,
    },
    potentialScammer: {
      financialReportsThreshold: 2,
      timePeriodDays: 30,
    },
    highReportRate: {
      reportsThreshold: 5,
      timePeriodDays: 30,
    },
  },
};

// ============================================================================
// ERROR TYPES
// ============================================================================

export class TrustRiskError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "TrustRiskError";
  }
}

export const TRUST_RISK_ERROR_CODES = {
  ACCOUNT_RESTRICTED: "ACCOUNT_RESTRICTED",
  FEATURE_RESTRICTED: "FEATURE_RESTRICTED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INVALID_ENFORCEMENT_LEVEL: "INVALID_ENFORCEMENT_LEVEL",
} as const;