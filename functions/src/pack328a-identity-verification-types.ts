/**
 * PACK 328A: Identity Verification Types
 * Bank-ID & Document Fallback Verification (18+ Enforcement Layer)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// Core Types
// ============================================================================

export type VerificationReason = 
  | 'SELFIE_FAIL' 
  | 'MISMATCH' 
  | 'FRAUD_FLAG' 
  | 'UNDERAGE_RISK';

export type VerificationProvider = 
  | 'BANK_ID' 
  | 'DOC_AI' 
  | 'MANUAL';

export type VerificationStatus = 
  | 'PENDING' 
  | 'VERIFIED' 
  | 'REJECTED' 
  | 'TIMEOUT';

export type ReviewedBy = 'AI' | 'HUMAN_MODERATOR';

export type DocumentType = 
  | 'PASSPORT'
  | 'NATIONAL_ID'
  | 'DRIVERS_LICENSE'
  | 'LIVE_SELFIE'
  | 'BANK_ID_RESULT';

// ============================================================================
// Firestore Documents
// ============================================================================

export interface IdentityVerificationRequest {
  userId: string;
  reason: VerificationReason;
  provider: VerificationProvider;
  status: VerificationStatus;
  requestedAt: Timestamp;
  completedAt?: Timestamp;
  
  // Optional metadata
  metadata?: {
    triggeredBy?: string; // SystemID or ModeratorID
    relatedReportId?: string;
    fraudScore?: number;
    estimatedAge?: number;
  };
  
  // Timeout tracking
  timeoutAt?: Timestamp; // 48 hours from requestedAt
  reminderSentAt?: Timestamp;
}

export interface IdentityVerificationResult {
  userId: string;
  verified: boolean;
  ageConfirmed: boolean; // Must be 18+
  identityMatch: boolean;
  provider: string;
  reviewedBy?: ReviewedBy;
  createdAt: Timestamp;
  
  // Additional verification data
  extractedData?: {
    dateOfBirth?: string;
    age?: number;
    fullName?: string;
    documentNumber?: string;
    expiryDate?: string;
    nationality?: string;
  };
  
  // Confidence scores
  confidence?: {
    overall: number; // 0-1
    ageVerification: number;
    identityMatch: number;
    documentAuthenticity: number;
  };
  
  // Failure reasons
  failureReasons?: string[];
}

export interface VerificationDocument {
  userId: string;
  requestId: string;
  type: DocumentType;
  storageUrl: string; // Cloud Storage reference
  uploadedAt: Timestamp;
  
  // Processing status
  processed?: boolean;
  processingError?: string;
  
  // Security
  encrypted: boolean;
  expiresAt?: Timestamp; // Auto-delete after 90 days
}

export interface VerificationAuditLog {
  userId: string;
  action: 
    | 'REQUEST_CREATED'
    | 'DOCUMENT_UPLOADED'
    | 'VERIFICATION_STARTED'
    | 'VERIFICATION_COMPLETED'
    | 'ENFORCEMENT_APPLIED'
    | 'MANUAL_REVIEW'
    | 'TIMEOUT_TRIGGERED';
  timestamp: Timestamp;
  performedBy: string; // userId or 'SYSTEM'
  
  // Context
  requestId?: string;
  resultId?: string;
  details?: Record<string, any>;
}

// ============================================================================
// Verification Provider Interface
// ============================================================================

export interface VerificationProviderConfig {
  provider: VerificationProvider;
  enabled: boolean;
  priority: number; // Lower = higher priority
  supportedDocuments: DocumentType[];
  
  // API Configuration (stored in environment)
  apiKeyName?: string;
  webhookUrl?: string;
}

export interface VerificationInput {
  userId: string;
  requestId: string;
  documents: {
    type: DocumentType;
    data: Buffer | string; // Image data or file URL
  }[];
  metadata?: Record<string, any>;
}

export interface VerificationOutput {
  success: boolean;
  verified: boolean;
  ageConfirmed: boolean;
  identityMatch: boolean;
  
  extractedData?: IdentityVerificationResult['extractedData'];
  confidence?: IdentityVerificationResult['confidence'];
  
  error?: string;
  failureReasons?: string[];
  
  // Provider-specific data
  providerResponse?: any;
  providerTransactionId?: string;
}

export interface IVerificationProvider {
  name: VerificationProvider;
  
  /**
   * Verify identity with uploaded documents
   */
  verifyIdentity(input: VerificationInput): Promise<VerificationOutput>;
  
  /**
   * Check if provider can handle this verification request
   */
  canHandle(reason: VerificationReason, documents: DocumentType[]): boolean;
  
  /**
   * Get provider status and health
   */
  getStatus(): Promise<{
    available: boolean;
    responseTime?: number;
    error?: string;
  }>;
}

// ============================================================================
// Enforcement Actions
// ============================================================================

export interface EnforcementAction {
  userId: string;
  action: 
    | 'BAN_UNDERAGE'
    | 'FREEZE_PROFILE'
    | 'LOCK_WALLET'
    | 'SUSPEND_TEMPORARY'
    | 'RESTRICT_FEATURES';
  reason: VerificationReason;
  appliedAt: Timestamp;
  expiresAt?: Timestamp; // For temporary actions
  
  restrictions?: {
    payoutBlocked: boolean;
    profileVisible: boolean;
    chatDisabled: boolean;
    callsDisabled: boolean;
    calendarDisabled: boolean;
  };
}

// ============================================================================
// Configuration
// ============================================================================

export const VERIFICATION_CONFIG = {
  // Timeout settings
  VERIFICATION_TIMEOUT_HOURS: 48,
  REMINDER_AFTER_HOURS: 24,
  
  // Age requirements
  MINIMUM_AGE: 18,
  
  // Confidence thresholds
  MIN_CONFIDENCE_OVERALL: 0.8,
  MIN_CONFIDENCE_AGE: 0.9,
  MIN_CONFIDENCE_IDENTITY: 0.85,
  
  // Document retention
  DOCUMENT_RETENTION_DAYS: 90,
  
  // Provider priorities (lower = higher priority)
  PROVIDER_PRIORITY: {
    BANK_ID: 1,
    DOC_AI: 2,
    MANUAL: 3,
  },
} as const;

// ============================================================================
// Verification Triggers
// ============================================================================

export interface VerificationTrigger {
  reason: VerificationReason;
  condition: (context: any) => boolean;
  provider: VerificationProvider;
  priority: number;
}

export const VERIFICATION_TRIGGERS: VerificationTrigger[] = [
  {
    reason: 'UNDERAGE_RISK',
    condition: (ctx) => ctx.estimatedAge < 18 || ctx.underageFlag,
    provider: 'BANK_ID',
    priority: 1, // Highest priority
  },
  {
    reason: 'FRAUD_FLAG',
    condition: (ctx) => ctx.fraudScore >= 0.7,
    provider: 'DOC_AI',
    priority: 2,
  },
  {
    reason: 'SELFIE_FAIL',
    condition: (ctx) => ctx.selfieMismatch === true,
    provider: 'DOC_AI',
    priority: 3,
  },
  {
    reason: 'MISMATCH',
    condition: (ctx) => ctx.profileMismatchReported === true,
    provider: 'DOC_AI',
    priority: 3,
  },
];