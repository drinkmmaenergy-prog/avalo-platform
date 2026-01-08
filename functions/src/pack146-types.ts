/**
 * PACK 146 — Avalo Copyright Protection & Digital Rights Enforcement Engine
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - No NSFW tolerance for stolen content (instant ban)
 * - No external marketplace redirection for stolen content
 * - Zero romance monetization and escort loopholes remain enforced
 * - DRM cannot affect token price or 65/35 revenue split
 * - Copyright protection never grants competitive advantages
 * - Protection is not displayed publicly and doesn't affect ranking
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// WATERMARKING
// ============================================================================

export type WatermarkType = 'VISIBLE' | 'INVISIBLE' | 'BOTH';

export type WatermarkPosition = 
  | 'TOP_LEFT'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_RIGHT'
  | 'CENTER'
  | 'DIAGONAL';

/**
 * Watermark metadata for content
 */
export interface ContentWatermark {
  watermarkId: string;
  contentId: string;
  contentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO' | 'DIGITAL_PRODUCT';
  ownerId: string;
  
  // Visible watermark
  visibleWatermark: {
    enabled: boolean;
    text: string;  // Username + timestamp
    position: WatermarkPosition;
    opacity: number;  // 0-1
    fontSize: number;
    color: string;
  };
  
  // Invisible watermark (steganographic)
  invisibleWatermark: {
    enabled: boolean;
    hash: string;  // Embedded hash
    algorithm: 'LSB' | 'DCT' | 'DWT';  // Steganography method
    robustnessLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Buyer watermark (for paid content)
  buyerWatermark?: {
    buyerId: string;
    purchaseId: string;
    embedTimestamp: Timestamp;
    uniqueHash: string;  // Buyer-specific hash
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CONTENT HASHING & REGISTRY
// ============================================================================

export type HashAlgorithm = 'SHA256' | 'PERCEPTUAL' | 'PHASH' | 'MD5';

/**
 * Content hash registry entry
 */
export interface ContentHash {
  hashId: string;
  contentId: string;
  contentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO' | 'DOCUMENT' | 'DIGITAL_PRODUCT';
  ownerId: string;
  
  // Multiple hash types for different detection
  hashes: {
    exact: string;        // SHA256 - exact match
    perceptual: string;   // Perceptual hash - survives modifications
    thumbnail: string;    // Thumbnail hash for preview
    audio?: string;       // Audio fingerprint for videos/audio
  };
  
  // Content metadata
  metadata: {
    filename: string;
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    format: string;
  };
  
  // Copyright info
  copyright: {
    copyrightHolder: string;
    registrationDate: Timestamp;
    licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'CREATIVE_COMMONS' | 'ALL_RIGHTS_RESERVED';
    commercialUse: boolean;
  };
  
  // Detection tracking
  duplicateDetectionEnabled: boolean;
  lastScannedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Duplicate content detection result
 */
export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  matchType: 'EXACT' | 'MODIFIED' | 'PARTIAL' | 'NONE';
  confidence: number;  // 0-1
  
  // Original content info
  originalContentId?: string;
  originalOwnerId?: string;
  originalHash?: string;
  
  // Match details
  matchedHashes: {
    exact: boolean;
    perceptual: boolean;
    thumbnailSimilarity: number;  // 0-1
  };
  
  // Modifications detected
  modificationsDetected: string[];  // ['RESIZED', 'COMPRESSED', 'CROPPED', 'FILTERED']
  
  checkedAt: Timestamp;
}

// ============================================================================
// COPYRIGHT TAKEDOWN SYSTEM
// ============================================================================

export type CopyrightClaimStatus = 
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'AI_SCANNING'
  | 'HUMAN_VALIDATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONTENT_REMOVED'
  | 'COUNTER_CLAIMED';

export type CopyrightClaimPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Copyright infringement claim
 */
export interface CopyrightCase {
  caseId: string;
  
  // Claimant (original creator)
  claimantId: string;
  originalContentId: string;
  originalContentHash: string;
  
  // Alleged infringer
  allegedInfringerId: string;
  infringingContentId: string;
  infringingContentHash?: string;
  
  // Claim details
  claimType: 'UNAUTHORIZED_UPLOAD' | 'SCREENSHOT_THEFT' | 'SCREEN_RECORDING' | 'RESALE' | 'EXTERNAL_LEAK';
  claimDescription: string;
  evidenceUrls: string[];
  
  // Detection
  detectedBy: 'CREATOR_REPORT' | 'AUTO_SCAN' | 'COMMUNITY_FLAG';
  detectionConfidence: number;  // 0-1 for auto-detected
  
  // Status
  status: CopyrightClaimStatus;
  priority: CopyrightClaimPriority;
  
  // AI similarity analysis
  aiAnalysis?: {
    matchScore: number;  // 0-1
    matchType: 'EXACT' | 'MODIFIED' | 'PARTIAL';
    modificationsDetected: string[];
    aiConfidenceLevel: number;
    analyzedAt: Timestamp;
  };
  
  // Human review
  humanReview?: {
    reviewerId: string;
    reviewedAt: Timestamp;
    decision: 'APPROVE_TAKEDOWN' | 'REJECT_CLAIM' | 'REQUEST_MORE_INFO';
    reviewNotes: string;
  };
  
  // Resolution
  resolution?: {
    outcome: 'CONTENT_REMOVED' | 'ACCOUNT_BANNED' | 'WARNING_ISSUED' | 'CLAIM_REJECTED';
    resolvedAt: Timestamp;
    resolvedBy: string;
    actionsTaken: string[];
  };
  
  // Counter-claim
  counterClaim?: {
    counterClaimId: string;
    submittedAt: Timestamp;
    reason: string;
    evidence: string[];
    status: 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PIRACY WATCHLIST
// ============================================================================

export type PiracyRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PiracyViolationType = 
  | 'REPEAT_UPLOADER'
  | 'SCREENSHOT_THEFT'
  | 'SCREEN_RECORDING'
  | 'REFUND_FRAUD'
  | 'LEAK_CIRCULATION'
  | 'EXTERNAL_RESALE'
  | 'STOLEN_NSFW';

/**
 * Piracy watchlist entry
 */
export interface PiracyWatchlistEntry {
  entryId: string;
  userId: string;
  
  // Risk assessment
  riskLevel: PiracyRiskLevel;
  riskScore: number;  // 0-100
  
  // Violations
  violations: PiracyViolation[];
  totalViolations: number;
  lastViolationAt?: Timestamp;
  
  // Device/Network tracking
  deviceFingerprints: string[];
  ipAddressHashes: string[];
  
  // Payment tracking
  connectedWallets: string[];
  payoutAccountIds: string[];
  refundAbuseCount: number;
  
  // Content patterns
  uploadedStolenContent: number;
  downloadedAndLeakedContent: number;
  screenshotAttempts: number;
  recordingAttempts: number;
  
  // Status
  isBlacklisted: boolean;
  blacklistedAt?: Timestamp;
  blacklistReason?: string;
  
  // Enforcement
  enforcementActions: PiracyEnforcementAction[];
  currentRestrictions: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Individual piracy violation
 */
export interface PiracyViolation {
  violationId: string;
  type: PiracyViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Details
  contentId?: string;
  originalOwnerId?: string;
  copyrightCaseId?: string;
  
  // Detection
  detectedAt: Timestamp;
  detectedBy: 'AUTO_SCAN' | 'CREATOR_REPORT' | 'SYSTEM_FLAG';
  evidence: string[];
  
  // NSFW special handling
  isNSFWContent: boolean;  // Zero tolerance
  
  // Resolution
  resolved: boolean;
  resolvedAt?: Timestamp;
  resolution?: string;
}

/**
 * Piracy enforcement action
 */
export interface PiracyEnforcementAction {
  actionId: string;
  actionType: 'WARNING' | 'CONTENT_REMOVAL' | 'UPLOAD_RESTRICTION' | 'ACCOUNT_SUSPENSION' | 'PERMANENT_BAN';
  reason: string;
  
  // Applied restrictions
  restrictions: {
    uploadBlocked: boolean;
    downloadBlocked: boolean;
    monetizationBlocked: boolean;
    accountFrozen: boolean;
  };
  
  // Duration
  appliedAt: Timestamp;
  expiresAt?: Timestamp;  // null for permanent
  isPermanent: boolean;
  
  // Review
  canAppeal: boolean;
  appealDeadline?: Timestamp;
}

// ============================================================================
// ANTI-RECORDING & SCREENSHOT DETECTION
// ============================================================================

export type ScreenCaptureType = 'SCREENSHOT' | 'SCREEN_RECORDING' | 'BOTH';

export type ScreenCaptureAction = 
  | 'ALLOW'
  | 'STRENGTHEN_WATERMARK'
  | 'SHOW_WARNING'
  | 'BLACK_SCREEN'
  | 'FREEZE_ACCESS'
  | 'LOG_INCIDENT';

/**
 * Screen capture event
 */
export interface ScreenCaptureEvent {
  eventId: string;
  userId: string;
  contentId: string;
  contentOwnerId: string;
  
  // Capture details
  captureType: ScreenCaptureType;
  detectedAt: Timestamp;
  deviceId: string;
  sessionId: string;
  
  // Content being captured
  contentType: 'PAID_CONTENT' | 'DIGITAL_PRODUCT' | 'PRIVATE_MEDIA' | 'EVENT_RECORDING';
  isPaidContent: boolean;
  purchaseId?: string;
  
  // Response
  actionTaken: ScreenCaptureAction;
  warningShown: boolean;
  accessRestricted: boolean;
  
  // Repeat behavior
  previousCaptureCount: number;
  isRepeatOffender: boolean;
  
  // Reporting
  reportedToCreator: boolean;
  addedToPiracyWatchlist: boolean;
}

// ============================================================================
// DOWNLOAD CONTROL & PDF SECURITY
// ============================================================================

export type DownloadPermission = 
  | 'ALLOWED'
  | 'ALLOWED_WITH_WATERMARK'
  | 'STREAM_ONLY'
  | 'RESTRICTED';

/**
 * Digital product download control
 */
export interface DownloadControl {
  controlId: string;
  productId: string;
  ownerId: string;
  
  // Download settings
  downloadEnabled: boolean;
  maxDownloadCount: number;
  downloadExpiry: number;  // Days
  
  // Security features
  watermarkRequired: boolean;
  encryptionEnabled: boolean;
  deviceLimit: number;
  
  // PDF-specific
  pdfSecurity?: {
    preventCopy: boolean;
    preventPrint: boolean;
    preventModify: boolean;
    requirePassword: boolean;
    expirationDate?: Timestamp;
  };
  
  // Tracking
  totalDownloads: number;
  uniqueDownloaders: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Individual download record
 */
export interface DownloadRecord {
  downloadId: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  
  // Download details
  downloadedAt: Timestamp;
  deviceId: string;
  ipAddressHash: string;
  
  // Watermark
  watermarkApplied: boolean;
  watermarkHash: string;
  buyerWatermarkEmbedded: boolean;
  
  // Validation
  downloadValid: boolean;
  expiresAt?: Timestamp;
  
  // Abuse tracking
  suspiciousActivity: boolean;
  suspiciousReason?: string;
}

// ============================================================================
// REPUTATION IMPACT
// ============================================================================

/**
 * Copyright violation impact on reputation
 */
export interface CopyrightReputationImpact {
  userId: string;
  
  // Violation summary
  totalCopyrightViolations: number;
  stolenContentUploaded: number;
  takedownsReceived: number;
  
  // Reputation penalties
  reputationScore: number;  // 0-100 (from PACK 140)
  copyrightPenalty: number;  // Points deducted
  
  // Trust impact
  trustLevel: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  isPiracyOffender: boolean;
  
  // Recovery
  canRecover: boolean;
  recoveryPeriodDays: number;
  violationsFreeStreak: number;
  
  updatedAt: Timestamp;
}

// ============================================================================
// GLOBAL PIRACY NETWORK DETECTION
// ============================================================================

/**
 * Professional piracy group detection
 */
export interface PiracyNetwork {
  networkId: string;
  
  // Network members
  memberUserIds: string[];
  networkSize: number;
  
  // Detection
  detectedAt: Timestamp;
  detectionConfidence: number;  // 0-1
  
  // Network characteristics
  characteristics: {
    sharedDeviceFingerprints: number;
    sharedIPAddresses: number;
    sharedPaymentMethods: number;
    coordinatedUploads: number;
    coordinatedRefunds: number;
    contentCirculation: number;  // Pass content between accounts
  };
  
  // Risk assessment
  riskLevel: PiracyRiskLevel;
  isProfessionalGroup: boolean;
  
  // Enforcement
  status: 'DETECTED' | 'UNDER_INVESTIGATION' | 'CONFIRMED' | 'NEUTRALIZED';
  enforcementCaseId?: string;
  
  // Actions taken
  networkBlocked: boolean;
  membersBlacklisted: number;
  
  updatedAt: Timestamp;
}

// ============================================================================
// CREATOR IP DASHBOARD
// ============================================================================

/**
 * Creator's copyright protection dashboard
 */
export interface CreatorIPDashboard {
  creatorId: string;
  
  // Protected content
  protectedContent: {
    totalItems: number;
    images: number;
    videos: number;
    digitalProducts: number;
    documents: number;
  };
  
  // Protection status
  watermarkingEnabled: boolean;
  hashingEnabled: boolean;
  antiRecordingEnabled: boolean;
  
  // Infringement tracking
  infringements: {
    totalCases: number;
    openCases: number;
    resolvedCases: number;
    successfulTakedowns: number;
  };
  
  // Revenue protection
  revenueProtected: number;  // Tokens
  lossesAvoided: number;     // Estimated tokens saved
  
  // Watchlist
  watchlistedUsers: number;
  blacklistedUsers: number;
  
  // Statistics
  stats: {
    screenshotAttempts: number;
    recordingAttempts: number;
    unauthorizedDownloads: number;
    duplicateUploadsBlocked: number;
  };
  
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Copyright protection configuration
 */
export interface CopyrightConfig {
  // Watermarking
  watermarking: {
    enabledByDefault: boolean;
    visibleOpacity: number;
    invisibleRobustness: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Hashing
  hashing: {
    algorithms: HashAlgorithm[];
    scanFrequencyHours: number;
  };
  
  // Takedown processing
  takedown: {
    autoApproveThreshold: number;  // AI confidence level
    humanReviewRequired: boolean;
    maxResponseTimeHours: number;
  };
  
  // Anti-recording
  antiRecording: {
    screenshotDetectionEnabled: boolean;
    recordingDetectionEnabled: boolean;
    maxWarnings: number;
    freezeAfterAttempts: number;
  };
  
  // Enforcement
  enforcement: {
    zeroToleranceNSFW: boolean;  // Always true
    autoBlacklistAfterViolations: number;
    permanentBanThreshold: number;
  };
}

export const DEFAULT_COPYRIGHT_CONFIG: CopyrightConfig = {
  watermarking: {
    enabledByDefault: true,
    visibleOpacity: 0.3,
    invisibleRobustness: 'HIGH',
  },
  hashing: {
    algorithms: ['SHA256', 'PERCEPTUAL'],
    scanFrequencyHours: 24,
  },
  takedown: {
    autoApproveThreshold: 0.95,
    humanReviewRequired: true,
    maxResponseTimeHours: 48,
  },
  antiRecording: {
    screenshotDetectionEnabled: true,
    recordingDetectionEnabled: true,
    maxWarnings: 2,
    freezeAfterAttempts: 3,
  },
  enforcement: {
    zeroToleranceNSFW: true,
    autoBlacklistAfterViolations: 3,
    permanentBanThreshold: 5,
  },
};

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Copyright-related notification context
 */
export interface CopyrightNotification {
  type: 'INFRINGEMENT_DETECTED' | 'TAKEDOWN_APPROVED' | 'COUNTER_CLAIM' | 'WATCHLIST_ADDED' | 'CONTENT_REMOVED';
  userId: string;
  
  // Details
  caseId?: string;
  contentId?: string;
  actionTaken?: string;
  
  // Message
  title: string;
  message: string;
  actionUrl?: string;
  
  createdAt: Timestamp;
}