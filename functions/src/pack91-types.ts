/**
 * PACK 91 — Regional Policy Engine & Content Classification
 * Types and Interfaces
 * 
 * Provides content classification and regional policy enforcement
 * without changing tokenomics or revenue splits.
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no discounts, no promo codes, no cashback, no bonuses
 * - Token price per unit remains unchanged
 * - Revenue split stays 65% creator / 35% Avalo (for applicable content)
 * - No new earning types - only controls WHERE and TO WHOM content is accessible
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONTENT RATING TYPES
// ============================================================================

/**
 * Content rating classification
 * - SFW: Safe for all adults (no nudity, no explicit content)
 * - SENSITIVE: Suggestive but not explicit (e.g., lingerie, bikini)
 * - NSFW_SOFT: Nudity, adult content (partial nudity, suggestive poses)
 * - NSFW_STRONG: Explicit adult content (full nudity, sexual content)
 */
export type ContentRating = 'SFW' | 'SENSITIVE' | 'NSFW_SOFT' | 'NSFW_STRONG';

/**
 * Review status for content classification
 * - NOT_REVIEWED: Initial state, awaiting classification
 * - AUTO_CLASSIFIED: Automatically classified based on user input
 * - MOD_REVIEWED: Manually reviewed by moderator
 */
export type ReviewStatus = 'NOT_REVIEWED' | 'AUTO_CLASSIFIED' | 'MOD_REVIEWED';

// ============================================================================
// REGIONAL POLICY TYPES
// ============================================================================

/**
 * Policy scope levels
 * - GLOBAL: Default fallback policy
 * - REGION_GROUP: Regional group (e.g., EU, MENA, APAC)
 * - COUNTRY: Specific country (highest priority)
 */
export type PolicyScope = 'GLOBAL' | 'REGION_GROUP' | 'COUNTRY';

/**
 * Regional policy configuration
 * Defines what content is allowed and monetizable in each region
 */
export interface RegionalPolicy {
  id: string; // e.g., "GLOBAL_DEFAULT", "PL", "DE", "US_CA"
  scope: PolicyScope;
  countryCode?: string; // ISO country code (for COUNTRY scope)
  regionGroup?: string; // e.g., "EU", "MENA", "APAC" (for REGION_GROUP scope)
  
  // Content visibility controls
  allowNSFWSoft: boolean; // Whether NSFW soft is allowed at all
  allowNSFWStrong: boolean; // Whether NSFW strong is allowed at all
  
  // Monetization controls
  monetizeNSFWSoft: boolean; // Whether NSFW soft content can be monetized
  monetizeNSFWStrong: boolean; // Whether NSFW strong content can be monetized
  
  // Discovery controls
  showInDiscoveryNSFW: boolean; // Whether NSFW can appear in discovery feeds
  
  // Age restrictions
  minAgeForSensitive: number; // Minimum age to view sensitive content
  minAgeForNSFWSoft: number; // Minimum age to view NSFW soft
  minAgeForNSFWStrong: number; // Minimum age to view NSFW strong
  
  // Store compliance flags
  storeComplianceFlags: string[]; // e.g., ["APPLE_LIMITED_NSFW", "GOOGLE_STRICT"]
  
  // Metadata
  updatedAt: Timestamp;
  updatedBy?: string; // Admin user ID
  notes?: string; // Admin notes about policy
}

// ============================================================================
// USER CONTEXT TYPES
// ============================================================================

/**
 * User region and age context for policy decisions
 * Used to determine which policy applies and what content is accessible
 */
export interface UserPolicyContext {
  userId: string;
  countryCode: string; // ISO country code (from profile, IP, or user-selected)
  age: number; // Calculated from verified date of birth
  policy: RegionalPolicy; // Resolved regional policy
  isVerified: boolean; // Whether user has completed age verification
}

// ============================================================================
// ACCESS DECISION TYPES
// ============================================================================

/**
 * Result of content access decision
 */
export interface ViewDecision {
  allowed: boolean;
  reasonCode?: AccessDenialReason;
  requiresAge?: number; // If age-restricted, minimum age required
  policyId?: string; // Policy that made the decision
}

/**
 * Reasons for denying content access
 */
export type AccessDenialReason =
  | 'AGE_RESTRICTED' // User doesn't meet minimum age requirement
  | 'REGION_BLOCKED' // Content not allowed in user's region
  | 'POLICY_BLOCKED' // Regional policy blocks this content type
  | 'STORE_COMPLIANCE' // Blocked due to store compliance requirements
  | 'NOT_VERIFIED' // User hasn't completed age verification
  | 'DISCOVERY_BLOCKED'; // Content not shown in discovery (but may be accessible directly)

/**
 * Result of monetization policy check
 */
export interface MonetizationDecision {
  allowed: boolean;
  reasonCode?: MonetizationDenialReason;
  policyId?: string;
}

/**
 * Reasons for denying content monetization
 */
export type MonetizationDenialReason =
  | 'REGION_BLOCKED' // Monetization not allowed in this region
  | 'CONTENT_RATING' // Content rating not monetizable
  | 'POLICY_BLOCKED' // Regional policy blocks monetization
  | 'STORE_COMPLIANCE'; // Store compliance prevents monetization

// ============================================================================
// FEATURE CONTEXT TYPES
// ============================================================================

/**
 * Feature context for access decisions
 * Different features may have different policy requirements
 */
export type FeatureContext =
  | 'FEED' // Main feed/discovery
  | 'PROFILE' // Viewing user profile
  | 'PAID_MEDIA' // Paid media in chat
  | 'PREMIUM_STORY' // Premium stories
  | 'SEARCH' // Search results
  | 'DIRECT_LINK'; // Direct link access

// ============================================================================
// CONTENT CLASSIFICATION TYPES
// ============================================================================

/**
 * Content classification metadata
 * Added to premium_stories, paid_media_messages, and other monetized content
 */
export interface ContentClassification {
  contentRating: ContentRating;
  reviewStatus: ReviewStatus;
  classifiedAt: Timestamp;
  classifiedBy?: string; // User ID or 'SYSTEM' for auto-classification
  reviewedAt?: Timestamp;
  reviewedBy?: string; // Moderator ID if manually reviewed
  reviewNote?: string; // Moderator notes
  
  // Violation tracking
  mislabelReports?: number; // Number of times reported as mislabeled
  lastMislabelReport?: Timestamp;
}

// ============================================================================
// AUDIT LOG TYPES (for PACK 90 integration)
// ============================================================================

/**
 * Content classification events for audit log
 */
export type ContentClassificationEvent =
  | 'CONTENT_CLASSIFIED' // Content initially classified
  | 'CONTENT_RECLASSIFIED' // Content rating changed
  | 'CONTENT_REVIEWED' // Manual moderator review
  | 'MISLABEL_REPORTED' // User reported mislabeling
  | 'ACCESS_DENIED' // User denied access to content
  | 'MONETIZATION_BLOCKED'; // Monetization blocked by policy

/**
 * Regional policy events for audit log
 */
export type RegionalPolicyEvent =
  | 'POLICY_CREATED' // New regional policy created
  | 'POLICY_UPDATED' // Regional policy updated
  | 'POLICY_APPLIED' // Policy applied to user request
  | 'COMPLIANCE_BLOCK'; // Content blocked for compliance

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Options for canUserViewContent function
 */
export interface ViewContentOptions {
  contentOwnerId?: string; // Creator/owner of content
  featureContext?: FeatureContext; // Where content is being viewed
  skipAgeCheck?: boolean; // For testing/admin purposes
  skipPolicyCheck?: boolean; // For testing/admin purposes
}

/**
 * Options for content upload/classification
 */
export interface ClassifyContentOptions {
  userId: string; // User uploading content
  contentType: 'photo' | 'video' | 'story' | 'media'; // Type of content
  selfDeclaredRating: ContentRating; // User's self-declared rating
  autoDetected?: boolean; // Whether auto-detection was used
  forceReview?: boolean; // Force manual moderator review
}

// ============================================================================
// ADMIN TYPES
// ============================================================================

/**
 * Payload for creating/updating regional policy
 */
export interface SetRegionalPolicyPayload extends Omit<RegionalPolicy, 'id' | 'updatedAt'> {
  id?: string; // Optional for create, required for update
}

/**
 * Query parameters for policy listing
 */
export interface ListPoliciesQuery {
  scope?: PolicyScope;
  countryCode?: string;
  regionGroup?: string;
  includeGlobal?: boolean;
}

/**
 * Result of policy query
 */
export interface ListPoliciesResult {
  policies: RegionalPolicy[];
  total: number;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Default global policy (most permissive)
 * Used as fallback when no specific policy exists
 */
export const DEFAULT_GLOBAL_POLICY: Omit<RegionalPolicy, 'id' | 'updatedAt'> = {
  scope: 'GLOBAL',
  allowNSFWSoft: true,
  allowNSFWStrong: true,
  monetizeNSFWSoft: true,
  monetizeNSFWStrong: true,
  showInDiscoveryNSFW: true,
  minAgeForSensitive: 18,
  minAgeForNSFWSoft: 18,
  minAgeForNSFWStrong: 18,
  storeComplianceFlags: [],
  notes: 'Default global policy - most permissive',
};

/**
 * Example strict policy (e.g., for Middle East, conservative regions)
 */
export const EXAMPLE_STRICT_POLICY: Omit<RegionalPolicy, 'id' | 'updatedAt'> = {
  scope: 'REGION_GROUP',
  regionGroup: 'MENA',
  allowNSFWSoft: false,
  allowNSFWStrong: false,
  monetizeNSFWSoft: false,
  monetizeNSFWStrong: false,
  showInDiscoveryNSFW: false,
  minAgeForSensitive: 21,
  minAgeForNSFWSoft: 21,
  minAgeForNSFWStrong: 21,
  storeComplianceFlags: ['CONTENT_RESTRICTED'],
  notes: 'Strict policy for conservative regions',
};

/**
 * Content rating display names for UI
 */
export const CONTENT_RATING_LABELS: Record<ContentRating, string> = {
  SFW: 'Safe for all adults',
  SENSITIVE: 'Sensitive content (suggestive)',
  NSFW_SOFT: 'Adult content (nudity)',
  NSFW_STRONG: 'Explicit adult content',
};

/**
 * Content rating descriptions for upload flow
 */
export const CONTENT_RATING_DESCRIPTIONS: Record<ContentRating, string> = {
  SFW: 'No nudity, no explicit content. Safe for general audience.',
  SENSITIVE: 'Suggestive but not explicit (e.g., lingerie, bikini, flirtatious poses).',
  NSFW_SOFT: 'Partial nudity, adult themes. Not suitable for all regions.',
  NSFW_STRONG: 'Full nudity, explicit sexual content. Highly restricted.',
};