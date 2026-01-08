/**
 * PACK 127 — Global Creator Compliance & Intellectual Property Rights
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price and 65/35 split remain untouched
 * - No ability to weaponize copyright claims to sabotage competitors
 * - No "premium" copyright feature — all creators protected equally
 * - No NSFW loophole — explicit content protection handled under PACK 108
 * - Copyright enforcement must be platform-neutral, not based on earnings
 * - No monetization or ranking effects during disputes
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ASSET TYPES
// ============================================================================

export type AssetType = 
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'TEXT'
  | 'DIGITAL_PRODUCT';

export type FingerprintMethod = 
  | 'PERCEPTUAL_HASH'      // For images/video
  | 'WAVEFORM_SIGNATURE'   // For audio
  | 'TEXT_HASH'            // For text content
  | 'FILE_CHECKSUM'        // For digital files
  | 'METADATA_COMPOSITE';  // Combined metadata

// ============================================================================
// IP FINGERPRINTS
// ============================================================================

/**
 * Content fingerprint for IP tracking
 * Every upload generates a unique fingerprint
 */
export interface IPFingerprint {
  fingerprintId: string;
  ownerUserId: string;
  
  // Asset identification
  assetType: AssetType;
  assetId: string;  // Reference to actual content
  assetUrl?: string;  // Storage URL if applicable
  
  // Fingerprint data
  perceptualHash?: string;  // For images/video
  waveformSignature?: string;  // For audio
  contentHash: string;  // Primary hash
  fileChecksum?: string;  // SHA-256 checksum
  
  // Metadata
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  dimensions?: { width: number; height: number };
  duration?: number;  // For video/audio
  
  // Watermark info
  hasWatermark: boolean;
  watermarkData?: string;  // Encrypted watermark
  
  // Registration
  createdAt: Timestamp;
  registeredVia: 'UPLOAD' | 'CLAIM' | 'IMPORT';
  
  // Status
  status: 'ACTIVE' | 'DISPUTED' | 'INVALIDATED';
  disputeCount: number;
}

/**
 * Fingerprint match result
 */
export interface FingerprintMatch {
  matchId: string;
  originalFingerprintId: string;
  matchedFingerprintId: string;
  
  // Match quality
  matchType: 'EXACT' | 'PERCEPTUAL' | 'DERIVATIVE' | 'POTENTIAL';
  confidenceScore: number;  // 0-1
  similarity: number;  // 0-100
  
  // Match details
  matchedUserId: string;
  originalOwnerId: string;
  isSameUser: boolean;
  isTeamMember: boolean;
  
  // Detection method
  detectionMethod: FingerprintMethod;
  matchedAt: Timestamp;
  
  // Action taken
  actionTaken: 'ALLOWED' | 'BLOCKED' | 'FLAGGED' | 'CASE_OPENED';
  blockReason?: string;
}

// ============================================================================
// COPYRIGHT CLAIMS
// ============================================================================

export type ClaimStatus = 
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'AUTO_RESOLVED'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'CONFIRMED'
  | 'DISMISSED'
  | 'FRAUDULENT';

export type ClaimResolution = 
  | 'TAKEDOWN'
  | 'CONTENT_RESTORED'
  | 'ATTRIBUTION_ADDED'
  | 'LICENSE_GRANTED'
  | 'DISMISSED'
  | 'CLAIMANT_PENALIZED';

/**
 * Copyright claim record
 */
export interface IPClaim {
  claimId: string;
  
  // Parties
  claimantUserId: string;
  accusedUserId: string;
  
  // Content identification
  fingerprintId: string;
  accusedAssetId: string;
  accusedAssetType: AssetType;
  
  // Claim details
  claimType: 'EXACT_COPY' | 'DERIVATIVE_WORK' | 'UNAUTHORIZED_USE' | 'TRADEMARK' | 'OTHER';
  description: string;
  evidenceRef: string;  // Reference to evidence storage
  evidenceUrls?: string[];
  
  // Status
  status: ClaimStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  
  // Auto-resolution
  autoResolved: boolean;
  autoResolutionReason?: string;
  fingerprintMatchScore?: number;
  
  // Manual review
  assignedModeratorId?: string;
  reviewNotes?: string;
  
  // Resolution
  resolution?: ClaimResolution;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolutionDetails?: string;
  
  // Impact tracking (NO economic/ranking effects during dispute)
  monetizationAffected: boolean;  // Always false during dispute
  discoveryAffected: boolean;  // Always false
  
  // Abuse prevention
  isCounterClaim: boolean;
  relatedClaimIds: string[];
  claimantStrikeCount: number;  // Track false claims
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Confidentiality
  notificationsSentTo: ('CLAIMANT' | 'ACCUSED' | 'MODERATOR')[];
}

/**
 * Claim strike record (for false claims)
 */
export interface ClaimStrike {
  strikeId: string;
  userId: string;
  claimId: string;
  
  reason: 'FALSE_CLAIM' | 'MALICIOUS_CLAIM' | 'SPAM_CLAIMS' | 'HARASSMENT_VIA_CLAIMS';
  severity: 'WARNING' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  
  // Impact (enforcement only, not economic)
  claimingRestricted: boolean;
  restrictedUntil?: Timestamp;
  canStillReceiveClaims: boolean;  // Victims can still be protected
  
  createdAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// IP LICENSING
// ============================================================================

export type LicenseType = 
  | 'COMMERCIAL_USE'
  | 'BRAND_PARTNERSHIP'
  | 'MERCHANDISING'
  | 'PLATFORM_ONLY'
  | 'CUSTOM';

export type LicenseStatus = 
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED';

/**
 * IP license for business use
 * Non-transferable, platform-only
 */
export interface IPLicense {
  licenseId: string;
  
  // Parties
  ownerUserId: string;  // IP owner
  licenseeId: string;  // Can be brand or agency
  licenseeType: 'USER' | 'BRAND' | 'AGENCY';
  
  // Licensed assets
  assetRefs: string[];  // Fingerprint IDs
  licenseType: LicenseType;
  
  // Terms
  scope: string;  // Description of permitted use
  restrictions: string[];
  
  // Duration
  startAt: Timestamp;
  endAt: Timestamp;
  autoRenew: boolean;
  
  // Status
  status: LicenseStatus;
  
  // Economic (NO modification to 65/35 split)
  affectsMonetization: boolean;  // Always false
  licenseFeePaid: boolean;  // Tracked separately
  licenseFeeAmount?: number;  // If applicable
  
  // Transfer restrictions
  transferable: boolean;  // Always false
  sublicensable: boolean;  // Always false
  
  // Revocation
  revokedAt?: Timestamp;
  revokedBy?: string;
  revocationReason?: string;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Metadata
  notes?: string;
  contractRef?: string;  // External contract reference
}

// ============================================================================
// ANTI-PIRACY & WATERMARKING
// ============================================================================

/**
 * Watermark metadata embedded in content
 */
export interface WatermarkMetadata {
  userId: string;
  deviceFingerprint: string;
  timestamp: Timestamp;
  checksum: string;
  sessionId: string;
  ipAddress?: string;  // Hashed
  contentId: string;
}

/**
 * Piracy detection record
 */
export interface PiracyDetection {
  detectionId: string;
  
  // Original content
  originalFingerprintId: string;
  originalOwnerId: string;
  contentType: AssetType;
  
  // Pirated instance
  piratedUrl?: string;
  platformDetectedOn?: string;  // 'EXTERNAL' | platform name
  detectionMethod: 'WATERMARK_TRACE' | 'FINGERPRINT_MATCH' | 'USER_REPORT';
  
  // Leak identification
  leakerUserId?: string;  // Identified from watermark
  leakerDeviceFingerprint?: string;
  accessedAt?: Timestamp;
  
  // Status
  status: 'DETECTED' | 'INVESTIGATING' | 'CONFIRMED' | 'FALSE_POSITIVE';
  
  // Action taken
  actionTaken?: 'USER_SUSPENDED' | 'PAYOUT_FROZEN' | 'DMCA_FILED' | 'LEGAL_ACTION' | 'NONE';
  
  // Impact (NO penalty to creator)
  creatorAffected: boolean;  // Always false
  creatorEarningsAffected: boolean;  // Always false
  leakerPayoutFrozen: boolean;
  
  // Investigation
  investigatedBy?: string;
  investigationNotes?: string;
  evidenceUrls: string[];
  
  // Timestamps
  detectedAt: Timestamp;
  confirmedAt?: Timestamp;
  resolvedAt?: Timestamp;
}

/**
 * Content view/download record (for watermarking)
 */
export interface ContentAccessRecord {
  accessId: string;
  contentId: string;
  fingerprintId: string;
  
  // Access details
  userId: string;
  accessType: 'VIEW' | 'DOWNLOAD' | 'STREAM';
  deviceFingerprint: string;
  
  // Watermark
  watermarkEmbedded: boolean;
  watermarkData?: string;  // Encrypted
  
  // Session
  sessionId: string;
  ipAddressHash: string;
  userAgent?: string;
  
  // Timestamps
  accessedAt: Timestamp;
  
  // Monitoring
  suspiciousActivity: boolean;
  suspicionReasons?: string[];
}

// ============================================================================
// CROSS-PLATFORM DETECTION
// ============================================================================

/**
 * External platform monitoring
 */
export interface ExternalPlatformScan {
  scanId: string;
  platform: string;  // 'YOUTUBE' | 'TWITTER' | 'INSTAGRAM' | etc.
  
  // Scan details
  scanType: 'AUTOMATED' | 'MANUAL' | 'USER_REPORT';
  fingerprintsScanned: number;
  matchesFound: number;
  
  // Results
  detections: string[];  // Detection IDs
  
  // Status
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  
  // Timestamps
  startedAt: Timestamp;
  completedAt?: Timestamp;
  
  // Metadata
  notes?: string;
  scanConfigId?: string;
}

// ============================================================================
// DMCA & LEGAL
// ============================================================================

export type DMCAStatus = 
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'PENDING_REVIEW'
  | 'TAKEDOWN_ISSUED'
  | 'COUNTER_NOTICE_RECEIVED'
  | 'RESOLVED'
  | 'REJECTED';

/**
 * DMCA takedown notice
 */
export interface DMCATakedown {
  takedownId: string;
  
  // Parties
  claimantUserId: string;
  platformName: string;  // External platform
  
  // Content
  fingerprintId: string;
  infringingUrl: string;
  originalContentUrl?: string;
  
  // Legal details
  dmcaNoticeText: string;
  legalRepresentative?: string;
  contactEmail: string;
  
  // Status
  status: DMCAStatus;
  
  // Processing
  submittedAt: Timestamp;
  acknowledgedAt?: Timestamp;
  resolvedAt?: Timestamp;
  
  // Response
  platformResponse?: string;
  counterNoticeReceived: boolean;
  counterNoticeDetails?: string;
  
  // Audit
  processedBy?: string;
  notes?: string;
}

// ============================================================================
// MODERATION & DISPUTE RESOLUTION
// ============================================================================

/**
 * IP dispute case (manual review)
 */
export interface IPDisputeCase {
  caseId: string;
  claimId: string;
  
  // Parties
  claimantUserId: string;
  accusedUserId: string;
  
  // Evidence
  claimantEvidence: string[];  // URLs/refs
  accusedEvidence?: string[];
  
  // Moderation
  assignedModeratorId?: string;
  moderatorNotes?: string;
  
  // Decision
  decision?: 'FAVOR_CLAIMANT' | 'FAVOR_ACCUSED' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE';
  reasoning?: string;
  
  // Status
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  
  // Timestamps
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  
  // Appeals
  appealable: boolean;
  appealed: boolean;
  appealCaseId?: string;
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Creator IP protection stats
 */
export interface CreatorIPStats {
  userId: string;
  
  // Content inventory
  totalFingerprints: number;
  assetsByType: Record<AssetType, number>;
  
  // Protection status
  activeProtections: number;
  disputedContent: number;
  
  // Claims
  claimsReceived: number;
  claimsFiled: number;
  claimsWon: number;
  claimsLost: number;
  
  // Piracy
  piracyDetections: number;
  leaksIdentified: number;
  dmcaTakedowns: number;
  
  // Licensing
  activeLicenses: number;
  licenseRevenue: number;  // Separate from main earnings
  
  // Last updated
  updatedAt: Timestamp;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export type IPNotificationType = 
  | 'FINGERPRINT_REGISTERED'
  | 'MATCH_DETECTED'
  | 'CLAIM_RECEIVED'
  | 'CLAIM_RESOLVED'
  | 'PIRACY_DETECTED'
  | 'WATERMARK_BREACH'
  | 'LICENSE_GRANTED'
  | 'LICENSE_REVOKED'
  | 'DMCA_FILED'
  | 'STRIKE_RECEIVED';

export interface IPNotification {
  notificationId: string;
  userId: string;
  type: IPNotificationType;
  
  // Content
  title: string;
  message: string;
  actionUrl?: string;
  
  // References
  relatedClaimId?: string;
  relatedFingerprintId?: string;
  relatedDetectionId?: string;
  
  // Status
  read: boolean;
  readAt?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

// ============================================================================
// CONFIGURATION & SETTINGS
// ============================================================================

/**
 * Platform-wide IP protection settings
 */
export interface IPProtectionConfig {
  // Fingerprinting
  fingerprintingEnabled: boolean;
  autoFingerprintOnUpload: boolean;
  supportedAssetTypes: AssetType[];
  
  // Detection thresholds
  exactMatchThreshold: number;  // 0.95
  perceptualMatchThreshold: number;  // 0.85
  derivativeMatchThreshold: number;  // 0.70
  
  // Auto-resolution
  autoResolveEnabled: boolean;
  autoResolveConfidenceThreshold: number;  // 0.90
  
  // Claims
  maxClaimsPerDay: number;  // Anti-spam
  claimCooldownHours: number;
  
  // Strikes
  falseClaimStrikeThreshold: number;  // 3
  strikeDecayDays: number;  // 180
  
  // Watermarking
  watermarkingEnabled: boolean;
  watermarkStrength: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Cross-platform
  externalScanningEnabled: boolean;
  scanFrequencyHours: number;
  
  updatedAt: Timestamp;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Fingerprint registration input
 */
export interface RegisterFingerprintInput {
  userId: string;
  assetId: string;
  assetType: AssetType;
  assetUrl?: string;
  fileData?: Buffer;
  metadata?: Record<string, any>;
}

/**
 * Claim submission input
 */
export interface SubmitClaimInput {
  claimantUserId: string;
  accusedUserId: string;
  accusedAssetId: string;
  claimType: IPClaim['claimType'];
  description: string;
  evidenceUrls?: string[];
}

/**
 * License creation input
 */
export interface CreateLicenseInput {
  ownerUserId: string;
  licenseeId: string;
  licenseeType: IPLicense['licenseeType'];
  assetRefs: string[];
  licenseType: LicenseType;
  scope: string;
  restrictions?: string[];
  durationDays: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default IP protection settings
 */
export const DEFAULT_IP_CONFIG: Partial<IPProtectionConfig> = {
  fingerprintingEnabled: true,
  autoFingerprintOnUpload: true,
  exactMatchThreshold: 0.95,
  perceptualMatchThreshold: 0.85,
  derivativeMatchThreshold: 0.70,
  autoResolveEnabled: true,
  autoResolveConfidenceThreshold: 0.90,
  maxClaimsPerDay: 10,
  claimCooldownHours: 24,
  falseClaimStrikeThreshold: 3,
  strikeDecayDays: 180,
  watermarkingEnabled: true,
  watermarkStrength: 'MEDIUM',
  externalScanningEnabled: true,
  scanFrequencyHours: 24,
};

/**
 * Strike severity impacts
 */
export const STRIKE_IMPACTS: Record<ClaimStrike['severity'], { restrictionDays: number; claimsBlocked: boolean }> = {
  'WARNING': { restrictionDays: 7, claimsBlocked: false },
  'MINOR': { restrictionDays: 30, claimsBlocked: false },
  'MAJOR': { restrictionDays: 90, claimsBlocked: true },
  'CRITICAL': { restrictionDays: 365, claimsBlocked: true },
};

/**
 * Economic isolation verification
 * These values must NEVER be modified by IP protection system
 */
export const ECONOMIC_ISOLATION_RULES = {
  TOKEN_PRICE_UNTOUCHED: true,
  REVENUE_SPLIT_UNTOUCHED: true,  // 65/35 always
  DISCOVERY_RANKING_UNAFFECTED: true,
  MONETIZATION_UNAFFECTED_DURING_DISPUTE: true,
  NO_PAID_IP_PRIORITY: true,
  ALL_CREATORS_PROTECTED_EQUALLY: true,
} as const;