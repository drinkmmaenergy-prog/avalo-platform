/**
 * PACK 55 — Compliance Type Definitions
 * Shared types for compliance modules
 */

import * as admin from 'firebase-admin';

// ============================================================================
// AGE VERIFICATION
// ============================================================================

export type AgeVerificationLevel = 'NONE' | 'SOFT' | 'DOCUMENT' | 'LIVENESS';

export interface AgeVerification {
  userId: string;
  dateOfBirth: string | null;
  ageVerified: boolean;
  ageVerificationLevel: AgeVerificationLevel;
  countryOfResidence?: string | null;
  verificationProvider?: string | null;
  verificationReferenceId?: string | null;
  lastUpdatedAt: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

// ============================================================================
// CONTENT SAFETY
// ============================================================================

export type MediaScanStatus = 'PENDING' | 'SCANNED' | 'FLAGGED' | 'ERROR';
export type RiskLevel = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MediaSource = 'CHAT_PPM' | 'PROFILE_MEDIA' | 'DISCOVERY_FEED' | 'MARKETPLACE';

export interface MediaSafetyScan {
  mediaId: string;
  ownerUserId: string;
  source: MediaSource;
  storagePath: string;
  scanStatus: MediaScanStatus;
  riskLevel: RiskLevel;
  flags: string[];
  scannerProvider?: string;
  scannerReferenceId?: string;
  createdAt: admin.firestore.Timestamp;
  scannedAt?: admin.firestore.Timestamp;
}

// ============================================================================
// AML / KYC
// ============================================================================

export type KYCLevel = 'NONE' | 'BASIC' | 'FULL';

export interface AMLProfile {
  userId: string;
  totalTokensEarnedAllTime: number;
  totalTokensEarnedLast30d: number;
  totalTokensEarnedLast365d: number;
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: KYCLevel;
  riskScore: number;
  riskFlags: string[];
  lastRiskAssessmentAt: admin.firestore.Timestamp;
  lastUpdatedAt: admin.firestore.Timestamp;
}

// ============================================================================
// GDPR
// ============================================================================

export type GDPRRequestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface GDPRErasureRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  reason?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface GDPRExportRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  downloadUrl?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ============================================================================
// POLICIES
// ============================================================================

export type PolicyType =
  | 'TERMS'
  | 'PRIVACY'
  | 'SAFETY'
  | 'AML'
  | 'MONETIZATION'
  | 'MARKETPLACE'
  | 'COOKIES';

export interface PolicyDocument {
  policyType: PolicyType;
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  createdAt: admin.firestore.Timestamp;
  isActive: boolean;
}

export interface PolicyAcceptance {
  userId: string;
  policyType: PolicyType;
  acceptedVersion: string;
  acceptedAt: admin.firestore.Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const CRITICAL_POLICY_TYPES: PolicyType[] = [
  'TERMS',
  'PRIVACY',
  'SAFETY',
  'MONETIZATION',
];

export const AGE_RESTRICTED_FEATURES = [
  'SWIPE',
  'CHAT',
  'AI_COMPANIONS',
  'CREATOR_EARNINGS',
  'PPM_MEDIA',
  'ROYAL_CLUB',
  'CREATOR_MARKETPLACE',
  'CALLS',
  'MEET_MARKETPLACE',
  'GOALS',
  'LIVE_STREAMING',
] as const;

export type AgeRestrictedFeature = typeof AGE_RESTRICTED_FEATURES[number];

// ============================================================================
// CONFIGURATION
// ============================================================================

export const COMPLIANCE_CONFIG = {
  // Age verification
  MINIMUM_AGE: 18,
  
  // AML thresholds
  KYC_THRESHOLD_365D: 2000, // tokens (≈ 2000 EUR)
  KYC_THRESHOLD_ALL_TIME: 5000, // tokens
  
  // High-risk countries (placeholder)
  HIGH_RISK_COUNTRIES: ['XX', 'YY'] as string[],
  
  // Media scanning
  SCAN_TIMEOUT_SECONDS: 30,
  MAX_SCAN_RETRIES: 3,
  
  // GDPR
  ERASURE_RETENTION_DAYS: 30,
  EXPORT_EXPIRY_DAYS: 7,
  
  // Cache TTLs (milliseconds)
  AGE_STATE_CACHE_TTL: 60 * 60 * 1000, // 1 hour
  POLICY_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
  AML_STATE_CACHE_TTL: 60 * 60 * 1000, // 1 hour
};