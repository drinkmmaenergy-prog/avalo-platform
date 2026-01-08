/**
 * PACK 71 — Fraud Analytics & Payment Anomaly Prediction
 * Type definitions for fraud detection system
 */

import { Timestamp } from 'firebase-admin/firestore';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FraudSignals {
  amlMatches: number;
  multiAccountFlags: number;
  disputeRate: number;
  noShowRate: number;
  referralAbuseFlags: number;
  aiSpamFlags: number;
  payoutFailureCount: number;
  velocityWarnings7d: number;
}

export interface FraudProfile {
  userId: string;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  paymentAnomalyScore: number; // 0-100, focused on purchases + payouts
  payoutHold: boolean; // if flagged for payout review
  signals: FraudSignals;
  lastUpdatedAt: Timestamp;
  createdAt: Timestamp;
}

export interface FraudAnalysisInput {
  userId: string;
  // AML signals
  amlRiskScore?: number;
  amlRiskFlags?: string[];
  kycRequired?: boolean;
  kycVerified?: boolean;
  // Multi-account detection
  deviceTopology?: {
    suspectedMultiAccount: boolean;
    sharedDeviceCount: number;
  };
  // Financial patterns
  payoutStats?: {
    totalPayouts30d: number;
    failedPayouts30d: number;
    averagePayoutAmount: number;
    largePayoutsCount30d: number;
  };
  // Dispute patterns
  disputeStats?: {
    totalDisputes30d: number;
    completedReservations30d: number;
  };
  // No-show patterns
  reservationStats?: {
    noShowFlags30d: number;
    completedReservations30d: number;
  };
  // Referral abuse
  referralStats?: {
    suspiciousReferrals?: number;
    fakeAttributionFlags?: number;
  };
  // AI spam
  aiModerationFlags?: {
    spamFlags30d: number;
  };
  // Velocity patterns from PACK 70
  rateLimitViolations?: {
    violations7d: number;
    escalations7d: number;
  };
}

export interface FraudAnalysisResult {
  riskScore: number;
  riskLevel: RiskLevel;
  paymentAnomalyScore: number;
  payoutHold: boolean;
  signals: FraudSignals;
  flags: string[];
  recommendation: 'NORMAL' | 'MONITOR' | 'REVIEW_PAYOUT' | 'BLOCK_PAYOUT' | 'ESCALATE';
}

export interface FraudReviewAction {
  userId: string;
  action: 'CLEAR' | 'CONFIRM_HOLD';
  note?: string;
  reviewedBy: string;
  reviewedAt: Timestamp;
}