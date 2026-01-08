/**
 * PACK 247 — Token Withdrawal Anti-Fraud Types
 * Enhanced user schema with anti-fraud fields
 */

import { Timestamp } from 'firebase-admin/firestore';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UnlockStatus = 'LOCKED' | 'UNLOCKED';

/**
 * Enhanced User Profile with Anti-Fraud Fields
 * These fields are added to the existing users collection
 */
export interface UserAntiFraudProfile {
  // Risk scoring
  riskScore?: number;                     // 0-100, current risk score
  riskLevel?: RiskLevel;                  // Risk classification
  
  // Earnings unlock
  unlockStatus?: UnlockStatus;            // Whether user can withdraw
  
  // Verification status
  verificationStatus?: {
    profileComplete: boolean;
    idVerified: boolean;
    selfieVerified: boolean;
    lastVerifiedAt?: Timestamp;
  };
  
  // Audit tracking
  nextAuditDate?: Timestamp;              // When next risk audit is scheduled
  lastAuditAt?: Timestamp;                // Last risk score calculation
  
  // Metrics for Earnings Unlock System
  earningsMetrics?: {
    paidChatExchanges: number;
    callMinutes: number;
    uniqueUsers: number;
    complaints30d: number;
    socialRating: number;
    lastUpdated: Timestamp;
  };
}

/**
 * Extended withdrawal request with anti-fraud validation
 */
export interface WithdrawalRequestPack247 {
  id: string;
  userId: string;
  amount: number;
  sourceType: 'chat' | 'call' | 'gift' | 'event' | 'mixed';
  status: 'PENDING' | 'APPROVED' | 'PAUSED' | 'REJECTED' | 'COMPLETED';
  
  // Anti-fraud fields
  riskScore: number;
  riskLevel: RiskLevel;
  needsReview: boolean;
  pausedUntil?: Timestamp;
  pauseReason?: string;
  
  // Validation flags
  validationFlags: string[];
  
  // Review tracking
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Standard fields
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
}

/**
 * Withdrawal review queue item
 */
export interface WithdrawalReview {
  id: string;
  userId: string;
  withdrawalRequestId?: string;
  amount: number;
  sourceType: string;
  
  // Risk assessment
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  
  // Review status
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Review tracking
  assignedTo?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Auto-approval tracking
  autoApproved?: boolean;
  autoApprovalDate?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Economic log entry
 */
export interface EconomicLogEntry {
  id: string;
  userId: string;
  type: 'withdrawal_attempt' | 'withdrawal_validation' | 'earnings_record';
  amount: number;
  sourceType: string;
  
  // Validation result
  validated: boolean;
  riskScore: number;
  flags: string[];
  
  // Additional context
  metadata: Record<string, any>;
  
  createdAt: Timestamp;
}

/**
 * Risk log entry
 */
export interface RiskLogEntry {
  userId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  unlockStatus: UnlockStatus;
  
  verificationStatus: {
    profileComplete: boolean;
    idVerified: boolean;
    selfieVerified: boolean;
  };
  
  metrics: {
    paidChatExchanges: number;
    callMinutes: number;
    uniqueUsers: number;
    complaints30d: number;
    socialRating: number;
  };
  
  nextAuditDate: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Risk event (historical tracking)
 */
export interface RiskEvent {
  userId: string;
  eventType: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  timestamp: Timestamp;
}