/**
 * PACK 121 — Avalo Global Ads Network (Privacy-Safe)
 * Type Definitions
 * 
 * Non-negotiable rules:
 * - No NSFW, sexualized, or dating-app-style ads
 * - No gambling, crypto speculation, or get-rich-quick ads
 * - No data selling or cross-platform tracking pixels
 * - No token bonuses or discounts based on ads
 * - No impact on creator ranking or visibility
 * - Ads monetize Avalo only, not creators
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// Ad Campaign Types
// ============================================================================

/**
 * Ad format types - strictly controlled placements
 */
export type AdFormat = 
  | 'STATIC_IMAGE'    // Stories, Explore, Events
  | 'VIDEO'           // Stories, Reels slots
  | 'CAROUSEL'        // Post Feed
  | 'SPONSORED_BANNER'; // Events / Challenges feed

/**
 * Ad placement types - where ads can appear
 */
export type AdPlacement = 
  | 'STORIES'         // Every 12 tiles
  | 'FEED'            // After 10 posts
  | 'EXPLORE'         // 1 banner per scroll cycle
  | 'EVENTS';         // In events/challenges feed

/**
 * Ad campaign status
 */
export type AdCampaignStatus = 
  | 'SCHEDULED'       // Not yet started
  | 'ACTIVE'          // Currently running
  | 'PAUSED'          // Temporarily paused by advertiser
  | 'COMPLETED'       // Reached end date
  | 'CANCELLED'       // Cancelled by advertiser or admin
  | 'SUSPENDED';      // Suspended for policy violation

/**
 * Ad destination types - where ads can link
 */
export type AdDestination = 
  | 'IN_APP'          // Links to in-app content (events, profiles)
  | 'EXTERNAL_WEB';   // Links to external website

/**
 * Forbidden ad categories - NEVER allowed
 */
export type ForbiddenCategory = 
  | 'NSFW'
  | 'DATING'
  | 'GAMBLING'
  | 'CRYPTO_TRADING'
  | 'PAYDAY_LOANS'
  | 'DRUGS'
  | 'EXTREMIST'
  | 'MEDICAL_UNCERTIFIED';

/**
 * Privacy-safe targeting options
 */
export interface AdTargeting {
  // Geographic targeting
  regions: string[];          // ISO country codes
  cities?: string[];          // City names (optional)
  
  // Demographic targeting (age ranges only)
  ageSegments?: ('18-24' | '25-34' | '35-44' | '45+')[];
  
  // Language targeting
  languages?: string[];       // ISO language codes
  
  // Device targeting
  deviceTypes?: ('IOS' | 'ANDROID' | 'WEB')[];
  
  // Interest targeting (derived from public content only, NOT from DMs)
  interests?: string[];       // e.g., 'fitness', 'fashion', 'gaming'
}

/**
 * Ad campaign data model
 */
export interface AdCampaign {
  adId: string;
  advertiserId: string;       // Reference to verified advertiser
  
  // Basic info
  title: string;
  description: string;
  
  // Creative assets
  format: AdFormat;
  mediaRef: string;           // Firebase Storage path to media
  thumbnailRef?: string;      // For video ads
  
  // Destination
  destination: AdDestination;
  destinationUrl?: string;    // For EXTERNAL_WEB
  destinationInAppRef?: string; // For IN_APP (e.g., event ID)
  ctaText: string;            // Call to action text
  
  // Targeting
  targeting: AdTargeting;
  placements: AdPlacement[];
  
  // Billing (token-based)
  budgetTokens: number;       // Total budget in tokens
  spentTokens: number;        // Tokens spent so far
  cpmBidTokens: number;       // Cost per 1000 impressions in tokens
  
  // Scheduling
  startAt: Timestamp;
  endAt: Timestamp;
  
  // Status
  status: AdCampaignStatus;
  
  // Safety
  safetyStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
  safetyReviewedBy?: string;
  safetyReviewedAt?: Timestamp;
  safetyNotes?: string;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Ad impression tracking
 */
export interface AdImpression {
  impressionId: string;
  adId: string;
  advertiserId: string;
  
  // User context (anonymous)
  userId?: string;            // Optional, for logged-in users
  sessionId: string;          // Anonymous session ID
  
  // Context
  placement: AdPlacement;
  deviceType: 'IOS' | 'ANDROID' | 'WEB';
  region?: string;            // ISO country code
  
  // Timestamp
  timestamp: Timestamp;
  
  // Billing
  tokensCost: number;         // Tokens charged for this impression
}

/**
 * Ad click tracking
 */
export interface AdClick {
  clickId: string;
  adId: string;
  advertiserId: string;
  impressionId: string;       // Reference to the impression
  
  // User context (anonymous)
  userId?: string;
  sessionId: string;
  
  // Context
  placement: AdPlacement;
  deviceType: 'IOS' | 'ANDROID' | 'WEB';
  region?: string;
  
  // Timestamp
  timestamp: Timestamp;
}

/**
 * Advertiser organization
 */
export interface Advertiser {
  advertiserId: string;
  
  // Business info
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone?: string;
  
  // Verification
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  verifiedBy?: string;
  verifiedAt?: Timestamp;
  
  // Brand safety
  brandCategory: string;      // e.g., 'RETAIL', 'TECH', 'ENTERTAINMENT'
  websiteUrl: string;
  
  // Token wallet
  tokenBalance: number;       // Prepaid tokens for ads
  
  // Status
  active: boolean;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Ad safety violation
 */
export interface AdSafetyViolation {
  violationId: string;
  adId: string;
  advertiserId: string;
  
  // Violation details
  violationType: ForbiddenCategory | 'OTHER';
  description: string;
  
  // Detection
  detectedBy: 'AI_SCAN' | 'MANUAL_REVIEW' | 'USER_REPORT';
  detectorId?: string;        // Moderator ID if manual
  
  // Action taken
  actionTaken: 'CAMPAIGN_PAUSED' | 'CAMPAIGN_CANCELLED' | 'ADVERTISER_FLAGGED' | 'ADVERTISER_SUSPENDED';
  
  // Refund
  refundIssued: boolean;
  refundTokens?: number;
  
  // Timestamp
  detectedAt: Timestamp;
}

// ============================================================================
// User Ad Preferences
// ============================================================================

/**
 * User ad preferences (privacy controls)
 */
export interface UserAdPreferences {
  userId: string;
  
  // Category preferences
  hiddenCategories: string[]; // Categories user doesn't want to see
  
  // Metadata
  updatedAt: Timestamp;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Create ad campaign request
 */
export interface CreateAdCampaignRequest {
  advertiserId: string;
  title: string;
  description: string;
  format: AdFormat;
  mediaRef: string;
  thumbnailRef?: string;
  destination: AdDestination;
  destinationUrl?: string;
  destinationInAppRef?: string;
  ctaText: string;
  targeting: AdTargeting;
  placements: AdPlacement[];
  budgetTokens: number;
  cpmBidTokens: number;
  startAt: string;            // ISO date string
  endAt: string;              // ISO date string
}

export interface CreateAdCampaignResponse {
  success: boolean;
  adId?: string;
  error?: string;
}

/**
 * Update ad campaign request
 */
export interface UpdateAdCampaignRequest {
  adId: string;
  advertiserId: string;
  updates: {
    title?: string;
    description?: string;
    targeting?: AdTargeting;
    placements?: AdPlacement[];
    budgetTokens?: number;
    cpmBidTokens?: number;
    status?: AdCampaignStatus;
  };
}

export interface UpdateAdCampaignResponse {
  success: boolean;
  error?: string;
}

/**
 * List ad campaigns request
 */
export interface ListAdCampaignsRequest {
  advertiserId: string;
  status?: AdCampaignStatus;
  limit?: number;
  offset?: number;
}

export interface ListAdCampaignsResponse {
  success: boolean;
  campaigns?: AdCampaign[];
  total?: number;
  error?: string;
}

/**
 * Record impression request
 */
export interface RecordImpressionRequest {
  adId: string;
  placement: AdPlacement;
  sessionId: string;
  deviceType: 'IOS' | 'ANDROID' | 'WEB';
  region?: string;
}

export interface RecordImpressionResponse {
  success: boolean;
  impressionId?: string;
  error?: string;
}

/**
 * Record click request
 */
export interface RecordClickRequest {
  adId: string;
  impressionId: string;
  placement: AdPlacement;
  sessionId: string;
  deviceType: 'IOS' | 'ANDROID' | 'WEB';
  region?: string;
}

export interface RecordClickResponse {
  success: boolean;
  clickId?: string;
  error?: string;
}

/**
 * Get campaign performance request
 */
export interface GetCampaignPerformanceRequest {
  adId: string;
  advertiserId: string;
  fromDate?: string;          // ISO date string
  toDate?: string;            // ISO date string
}

export interface CampaignPerformance {
  adId: string;
  impressions: number;
  clicks: number;
  ctr: number;                // Click-through rate
  tokensSpent: number;
  avgCpm: number;             // Average CPM
  
  // Breakdown by placement
  byPlacement: {
    [key in AdPlacement]?: {
      impressions: number;
      clicks: number;
      ctr: number;
    }
  };
  
  // Regional breakdown (anonymized counts)
  byRegion: {
    [region: string]: {
      impressions: number;
      clicks: number;
    }
  };
}

export interface GetCampaignPerformanceResponse {
  success: boolean;
  performance?: CampaignPerformance;
  error?: string;
}

/**
 * Update user ad preferences request
 */
export interface UpdateAdPreferencesRequest {
  hiddenCategories: string[];
}

export interface UpdateAdPreferencesResponse {
  success: boolean;
  error?: string;
}

/**
 * Get user ad preferences request
 */
export interface GetAdPreferencesResponse {
  success: boolean;
  preferences?: UserAdPreferences;
  error?: string;
}

// ============================================================================
// Ad Safety Types
// ============================================================================

/**
 * Ad content safety scan result
 */
export interface AdSafetyScanResult {
  adId: string;
  passed: boolean;
  violations: {
    type: ForbiddenCategory | 'OTHER';
    confidence: number;       // 0.0-1.0
    description: string;
  }[];
  scanTimestamp: Timestamp;
}