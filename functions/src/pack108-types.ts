/**
 * PACK 108 — Adult Content Containment & Region-Based NSFW Governance
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - 18+ mandatory and enforced at onboarding
 * - NSFW cannot grant discovery/ranking advantages
 * - NSFW cannot bypass safety or enforcement via payments
 * - No free tokens / bonuses / discounts / cashback / promo codes
 * - Token price and 65/35 split remain untouched regardless of content type
 * - Containment, not promotion
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// NSFW CLASSIFICATION
// ============================================================================

/**
 * NSFW content classification levels
 * Strictest to least strict: BANNED > NSFW_EXPLICIT > SOFT_NSFW > SAFE
 */
export type NSFWLevel = 
  | 'SAFE'              // General audience content
  | 'SOFT_NSFW'         // Suggestive content (lingerie, artistic nudity)
  | 'NSFW_EXPLICIT'     // Explicit adult content
  | 'BANNED';           // Illegal or prohibited content

/**
 * Source of NSFW classification
 */
export type NSFWClassificationSource = 
  | 'USER_MARKED'       // User explicitly marked content
  | 'AI_DETECTION'      // AI model detected
  | 'COMMUNITY_FLAG'    // Flagged by community
  | 'MODERATOR_REVIEW'  // Reviewed by moderator
  | 'SYSTEM_DEFAULT';   // System default

/**
 * Content NSFW metadata
 * Stored within content documents
 */
export interface ContentNSFWMetadata {
  nsfwLevel: NSFWLevel;
  nsfwLastReviewer: string;  // 'SYSTEM' | userId | 'AI'
  nsfwLastReviewedAt: Timestamp;
  nsfwClassificationSource: NSFWClassificationSource;
  nsfwConfidenceScore?: number;  // 0-1 for AI detection
  nsfwFlags?: string[];  // Specific violation types if any
  userMarkedNSFW?: boolean;  // User's original marking
  aiDetectedNSFW?: NSFWLevel;  // AI's classification
}

/**
 * NSFW classification case (when AI and user disagree)
 */
export interface NSFWClassificationCase {
  caseId: string;
  contentId: string;
  contentType: 'POST' | 'STORY' | 'MEDIA' | 'MESSAGE' | 'PROFILE_PHOTO';
  creatorId: string;
  
  // Disagreement details
  userMarked: NSFWLevel;
  aiDetected: NSFWLevel;
  confidenceScore: number;
  
  // Case status
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Resolution
  finalClassification?: NSFWLevel;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// USER SAFETY PREFERENCES
// ============================================================================

/**
 * User's personal boundaries and safety settings
 */
export interface UserSafetyPreferences {
  userId: string;
  
  // Content filtering
  allowAdultContentInFeed: boolean;
  autoFilterNSFWPreviews: boolean;
  blurExplicitMediaByDefault: boolean;
  
  // Communication boundaries
  allowAdultCreatorsToDM: boolean;
  
  // Emergency controls
  nsfwHistoryHidden: boolean;  // Panic-hide feature
  hiddenAt?: Timestamp;
  
  // Region & legal
  regionCode: string;
  nsfwLegalInRegion: boolean;
  ageVerified: boolean;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// REGION COMPLIANCE
// ============================================================================

/**
 * Three-layer compliance gate
 */
export interface NSFWComplianceCheck {
  allowed: boolean;
  
  // Layer 1: Legal
  legallyAllowed: boolean;
  legalBlockReason?: string;
  
  // Layer 2: Platform (App Store)
  platformAllowed: boolean;
  platformBlockReason?: string;
  
  // Layer 3: Payment Provider
  pspAllowed: boolean;
  pspBlockReason?: string;
  
  // Final decision (strictest rule wins)
  blockReason?: string;
  canView: boolean;
  canMonetize: boolean;
}

/**
 * Regional NSFW policy extension
 * Extends pack91 regional policies
 */
export interface RegionalNSFWPolicy {
  regionCode: string;
  scope: 'COUNTRY' | 'REGION_GROUP' | 'GLOBAL_DEFAULT';
  
  // Legal layer
  nsfwLegallyAllowed: boolean;
  explicitContentLegallyAllowed: boolean;
  legalMinimumAge: number;  // Usually 18, but can vary
  
  // Platform layer
  appStoreRestrictionsApply: boolean;
  appStoreAllowedLevels: NSFWLevel[];
  
  // Payment provider layer
  pspAllowsNSFWMonetization: boolean;
  pspAllowedLevels: NSFWLevel[];
  pspName?: string;  // Stripe, Wise, etc.
  
  // Enforcement
  blockUnverifiedUsers: boolean;
  requireExplicitOptIn: boolean;
  
  // Metadata
  updatedAt: Timestamp;
  updatedBy: string;
  notes?: string;
}

// ============================================================================
// NSFW DISCOVERY & FEED CONTAINMENT
// ============================================================================

/**
 * NSFW containment rules for discovery
 */
export interface NSFWDiscoveryRules {
  // Default feed rules
  includeInDefaultFeed: boolean;
  includeInTrendingFeed: boolean;
  includeInRecommendations: boolean;
  
  // Ranking penalties (containment, not promotion)
  applyVisibilityPenalty: boolean;
  penaltyMultiplier: number;  // < 1.0 = reduced visibility
  
  // Segregation
  requireOptInFeed: boolean;
  segregatedFeedOnly: boolean;
  
  // Cross-promotion restrictions
  preventNSFWToSafeBoost: boolean;  // NSFW likes don't boost SAFE content
}

/**
 * User's NSFW feed access
 */
export interface UserNSFWFeedAccess {
  userId: string;
  hasAccess: boolean;
  
  // Legal requirements
  ageVerified: boolean;
  minimumAgeMet: boolean;
  regionAllows: boolean;
  
  // Opt-in status
  userOptedIn: boolean;
  optedInAt?: Timestamp;
  
  // Session-level controls
  feedUnlocked: boolean;  // Session-based unlock
  unlockedAt?: Timestamp;
  unlockedUntil?: Timestamp;
  
  updatedAt: Timestamp;
}

// ============================================================================
// NSFW MONETIZATION SAFETY
// ============================================================================

/**
 * NSFW monetization check result
 */
export interface NSFWMonetizationCheck {
  allowed: boolean;
  
  // Buyer checks
  buyerRegionAllows: boolean;
  buyerAgeVerified: boolean;
  buyerPreferencesAllow: boolean;
  
  // Seller checks
  sellerRegionAllows: boolean;
  sellerKYCVerified: boolean;
  
  // Platform checks
  appStoreAllows: boolean;
  pspAllows: boolean;
  
  // Block reason
  blockReason?: string;
  denialCode?: string;
  
  // Metadata (for audit)
  checkedAt: Timestamp;
  buyerRegion: string;
  sellerRegion: string;
}

/**
 * NSFW monetization transaction record
 * Extends normal transaction with NSFW metadata
 */
export interface NSFWMonetizationTransaction {
  transactionId: string;
  contentId: string;
  nsfwLevel: NSFWLevel;
  
  // Parties
  buyerId: string;
  sellerId: string;
  
  // Compliance record
  complianceCheck: NSFWMonetizationCheck;
  
  // Transaction details (same as non-NSFW)
  tokenAmount: number;
  creatorEarnings: number;  // 65% always
  platformCommission: number;  // 35% always
  
  // Audit trail
  createdAt: Timestamp;
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED';
  blockReason?: string;
}

// ============================================================================
// MODERATION & ENFORCEMENT
// ============================================================================

/**
 * NSFW-specific reason codes for moderation
 */
export type NSFWModerationReasonCode =
  | 'NSFW_ILLEGAL_REGION'       // Posted illegal NSFW in region
  | 'NSFW_UNMARKED'              // Failed to mark NSFW content
  | 'NSFW_BYPASS_ATTEMPT'        // Attempted to bypass checks
  | 'NSFW_EXTERNAL_SELLING'      // Selling access externally
  | 'NSFW_MINOR_ACCESS'          // Exposed to minors
  | 'NSFW_MISCLASSIFICATION'     // Intentional misclassification
  | 'NSFW_PSP_VIOLATION';        // Violates payment provider rules

/**
 * NSFW violation record
 */
export interface NSFWViolation {
  violationId: string;
  userId: string;
  contentId?: string;
  
  // Violation details
  reasonCode: NSFWModerationReasonCode;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  
  // Evidence
  detectedBy: 'SYSTEM' | 'USER_REPORT' | 'MODERATOR';
  evidenceUrls?: string[];
  
  // Status
  status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'DISMISSED';
  
  // Enforcement
  moderationCaseId?: string;
  enforcementAction?: string;
  
  // Metadata
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

// ============================================================================
// KIDS-SAFETY & MIXED-AUDIENCE
// ============================================================================

/**
 * Creator content profile (tracks NSFW vs SAFE content)
 */
export interface CreatorContentProfile {
  userId: string;
  
  // Content breakdown
  totalContent: number;
  safeContent: number;
  softNSFWContent: number;
  explicitNSFWContent: number;
  
  // Ratios
  safeContentRatio: number;  // 0-1
  nsfwContentRatio: number;  // 0-1
  
  // Feed eligibility
  eligibleForSafeFeed: boolean;  // True if majority is SAFE
  requiresSeparation: boolean;   // True if posts both SAFE and NSFW
  
  // Last content
  lastSafeContentAt?: Timestamp;
  lastNSFWContentAt?: Timestamp;
  
  updatedAt: Timestamp;
}

// ============================================================================
// SCHEDULED JOBS & MAINTENANCE
// ============================================================================

/**
 * Region legality check job
 */
export interface RegionLegalityCheckJob {
  jobId: string;
  regionCode: string;
  
  // Check details
  previousPolicy: RegionalNSFWPolicy;
  currentPolicy: RegionalNSFWPolicy;
  policyChanged: boolean;
  
  // Impact assessment
  affectedUsers: number;
  affectedContent: number;
  contentToReview: string[];  // Content IDs
  
  // Status
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

/**
 * Content reclassification task
 */
export interface ContentReclassificationTask {
  taskId: string;
  contentId: string;
  currentClassification: NSFWLevel;
  reason: 'POLICY_CHANGE' | 'AI_UPDATE' | 'APPEAL' | 'MANUAL_REVIEW';
  
  // Task status
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Result
  newClassification?: NSFWLevel;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

/**
 * NSFW notification context
 */
export interface NSFWNotificationContext {
  type: 'CONTENT_BLURRED' | 'REGION_BLOCKED' | 'AGE_VERIFICATION_REQUIRED' | 'CLASSIFICATION_UPDATED';
  userId: string;
  contentId?: string;
  
  // Message details
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  
  // Metadata
  nsfwLevel?: NSFWLevel;
  regionCode?: string;
  canAppeal?: boolean;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * NSFW content check input
 */
export interface NSFWContentCheckInput {
  contentId: string;
  contentType: 'POST' | 'STORY' | 'MEDIA' | 'MESSAGE';
  creatorId: string;
  viewerId: string;
  action: 'VIEW' | 'UNLOCK' | 'MONETIZE';
}

/**
 * NSFW content check result
 */
export interface NSFWContentCheckResult {
  allowed: boolean;
  
  // Content info
  nsfwLevel: NSFWLevel;
  requiresBlur: boolean;
  requiresAgeVerification: boolean;
  requiresOptIn: boolean;
  
  // Denial info
  denialReason?: string;
  denialCode?: string;
  userMessage?: string;
  
  // Actions available
  canAppeal: boolean;
  canVerifyAge: boolean;
  canOptIn: boolean;
}

// ============================================================================
// DEFAULTS & CONSTANTS
// ============================================================================

export const DEFAULT_NSFW_DISCOVERY_RULES: NSFWDiscoveryRules = {
  includeInDefaultFeed: false,
  includeInTrendingFeed: false,
  includeInRecommendations: false,
  applyVisibilityPenalty: true,
  penaltyMultiplier: 0.1,  // 90% visibility reduction
  requireOptInFeed: true,
  segregatedFeedOnly: true,
  preventNSFWToSafeBoost: true,
};

export const DEFAULT_SAFETY_PREFERENCES: Partial<UserSafetyPreferences> = {
  allowAdultContentInFeed: false,
  autoFilterNSFWPreviews: true,
  blurExplicitMediaByDefault: true,
  allowAdultCreatorsToDM: true,
  nsfwHistoryHidden: false,
};

/**
 * Global minimum age for NSFW (platform-wide)
 */
export const GLOBAL_MINIMUM_AGE_NSFW = 18;

/**
 * PSP NSFW restrictions by provider
 */
export const PSP_NSFW_RESTRICTIONS: Record<string, { allowsNSFW: boolean; allowedLevels: NSFWLevel[] }> = {
  'STRIPE': {
    allowsNSFW: true,
    allowedLevels: ['SAFE', 'SOFT_NSFW', 'NSFW_EXPLICIT'],  // Varies by region
  },
  'WISE': {
    allowsNSFW: true,
    allowedLevels: ['SAFE', 'SOFT_NSFW'],  // More restrictive
  },
  'PAYPAL': {
    allowsNSFW: false,
    allowedLevels: ['SAFE'],  // Very restrictive
  },
};

/**
 * App Store NSFW restrictions
 */
export const APP_STORE_RESTRICTIONS = {
  APPLE: {
    allowsNSFW: true,  // With age gate
    allowedLevels: ['SAFE', 'SOFT_NSFW'] as NSFWLevel[],  // No explicit
    requiresAgeGate: true,
  },
  GOOGLE: {
    allowsNSFW: true,
    allowedLevels: ['SAFE', 'SOFT_NSFW', 'NSFW_EXPLICIT'] as NSFWLevel[],
    requiresAgeGate: true,
  },
};

/**
 * Severity mapping for NSFW violations
 */
export const NSFW_VIOLATION_SEVERITY: Record<NSFWModerationReasonCode, NSFWViolation['severity']> = {
  'NSFW_ILLEGAL_REGION': 'CRITICAL',
  'NSFW_UNMARKED': 'MEDIUM',
  'NSFW_BYPASS_ATTEMPT': 'HIGH',
  'NSFW_EXTERNAL_SELLING': 'HIGH',
  'NSFW_MINOR_ACCESS': 'CRITICAL',
  'NSFW_MISCLASSIFICATION': 'MEDIUM',
  'NSFW_PSP_VIOLATION': 'HIGH',
};