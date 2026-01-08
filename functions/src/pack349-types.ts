/**
 * PACK 349 - Ad Engine, Brand Campaigns & Sponsored Content Control
 * Types and interfaces for token-based advertising system
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Ad Type Definitions
 */
export type AdType = 'feed' | 'discovery' | 'event' | 'creator' | 'ai';
export type AdStatus = 'draft' | 'active' | 'paused' | 'expired' | 'rejected';

/**
 * Main Ad Document
 * Collection: ads/{adId}
 */
export interface AvaloAd {
  id: string;
  advertiserId: string;
  type: AdType;
  status: AdStatus;
  countryScopes: string[]; // ["PL", "RO", "UA"]
  ageGate: number; // 18+
  media: {
    imageUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
  };
  headline: string;
  description: string;
  targetUrl?: string;
  dailyBudgetTokens: number;
  bidPerViewTokens: number;
  bidPerClickTokens: number;
  bidPerImpressionTokens: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Safety & Moderation
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationNotes?: string;
  rejectionReason?: string;
  // Analytics summary
  totalImpressions: number;
  totalClicks: number;
  totalViews: number;
  totalSpent: number;
}

/**
 * Brand Campaign (Multi-Ad Sets)
 * Collection: brandCampaigns/{campaignId}
 */
export interface BrandCampaign {
  id: string;
  brandName: string;
  advertiserId: string;
  ads: string[]; // adIds
  startAt: Timestamp;
  endAt: Timestamp;
  maxSpendTokens: number;
  currentSpentTokens: number;
  status: 'scheduled' | 'active' | 'ended' | 'paused' | 'cancelled';
  targetCountries: string[];
  targetAudience?: {
    minAge?: number;
    maxAge?: number;
    genders?: string[];
    interests?: string[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Safety flags
  violationCount: number;
  reportCount: number;
  autoPausedAt?: Timestamp;
  autoPauseReason?: string;
}

/**
 * Ad Statistics (Daily)
 * Collection: adStats/{adId}/{day}
 * Document ID format: {adId}_YYYY-MM-DD
 */
export interface AdStats {
  id: string;
  adId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  views: number;
  conversions: number;
  tokenSpent: number;
  ctr: number; // click-through rate
  cvr: number; // conversion rate
  costPerClick: number;
  costPerView: number;
  costPerConversion: number;
  // Geographic distribution
  geoDistribution: {
    [countryCode: string]: {
      impressions: number;
      clicks: number;
      spent: number;
    };
  };
  // ROI tracking (if product linked)
  revenue?: number;
  roi?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Sponsored Creator Profile
 * Extension to user profile
 */
export interface SponsoredCreatorProfile {
  userId: string;
  sponsorshipType: 'brand_host' | 'event_partner' | 'ai_ambassador' | 'lifestyle_promoter';
  brandName: string;
  brandId: string;
  campaignId?: string;
  isActive: boolean;
  optedInAt: Timestamp;
  earnings: {
    total: number;
    pending: number;
    paid: number;
  };
  // Display badge
  badgeText: string;
  badgeColor?: string;
  // Sponsorship terms
  startAt: Timestamp;
  endAt?: Timestamp;
  commissionRate: number; // Default 65% creator, 35% Avalo
  minimumGuarantee?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Ad Placement Record
 * Tracks where ads are shown
 * Collection: adPlacements/{placementId}
 */
export interface AdPlacement {
  id: string;
  adId: string;
  campaignId?: string;
  userId: string; // viewer
  surface: 'feed' | 'discovery' | 'event' | 'creator' | 'ai';
  position: number;
  shown: boolean;
  clicked: boolean;
  converted: boolean;
  viewDuration?: number; // seconds
  timestamp: Timestamp;
  countryCode: string;
  deviceInfo?: {
    platform: string;
    version: string;
  };
}

/**
 * Ad Safety Violation
 * Collection: adViolations/{violationId}
 */
export interface AdViolation {
  id: string;
  adId: string;
  campaignId?: string;
  advertiserId: string;
  violationType:
    | 'dating_manipulation'
    | 'scam_wording'
    | 'escort_content'
    | 'political_content'
    | 'religious_content'
    | 'medical_misinformation'
    | 'nsfw_content'
    | 'age_inappropriate'
    | 'other';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedBy: 'auto' | 'manual' | 'report';
  moderatorId?: string;
  reporterId?: string;
  action: 'warning' | 'suspended' | 'banned' | 'rejected';
  timestamp: Timestamp;
  resolved: boolean;
  resolvedAt?: Timestamp;
}

/**
 * Ad Report (User-generated)
 * Collection: adReports/{reportId}
 */
export interface AdReport {
  id: string;
  adId: string;
  reporterId: string;
  reason: string;
  category:
    | 'offensive'
    | 'misleading'
    | 'inappropriate'
    | 'scam'
    | 'adult_content'
    | 'other';
  description?: string;
  timestamp: Timestamp;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  moderatorId?: string;
  resolution?: string;
  resolvedAt?: Timestamp;
}

/**
 * Advertiser Account
 * Collection: advertisers/{advertiserId}
 */
export interface AdvertiserAccount {
  id: string;
  userId: string;
  businessName: string;
  contactEmail: string;
  status: 'active' | 'suspended' | 'banned';
  tokenBalance: number;
  totalSpent: number;
  activeCampaigns: number;
  // Trust & Safety
  trustScore: number;
  violationCount: number;
  warningCount: number;
  lastViolationAt?: Timestamp;
  suspendedAt?: Timestamp;
  bannedAt?: Timestamp;
  banReason?: string;
  // Billing
  billingHistory: {
    amount: number;
    tokens: number;
    timestamp: Timestamp;
  }[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Ad Conversion Tracking
 * Collection: adConversions/{conversionId}
 */
export interface AdConversion {
  id: string;
  adId: string;
  campaignId?: string;
  userId: string;
  placementId: string;
  conversionType: 'profile_view' | 'follow' | 'message' | 'purchase' | 'signup' | 'custom';
  value?: number; // monetary value if applicable
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

/**
 * Ad Moderation Queue Item
 * Collection: adModerationQueue/{queueId}
 */
export interface AdModerationQueueItem {
  id: string;
  adId: string;
  advertiserId: string;
  type: 'new_ad' | 'reported_ad' | 'flagged_content';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'reviewing' | 'completed';
  assignedTo?: string; // moderatorId
  flagReason?: string;
  reportCount?: number;
  createdAt: Timestamp;
  assignedAt?: Timestamp;
  completedAt?: Timestamp;
}

/**
 * Constants
 */
export const AD_CONSTANTS = {
  MIN_AGE_GATE: 18,
  MAX_DAILY_BUDGET: 100000, // tokens
  MIN_BID_TOKENS: 1,
  MAX_BID_TOKENS: 1000,
  VIOLATION_THRESHOLD_SUSPEND: 3,
  VIOLATION_THRESHOLD_BAN: 5,
  REPORT_THRESHOLD_AUTO_PAUSE: 10,
  CREATOR_COMMISSION_RATE: 0.65, // 65% to creator
  AVALO_COMMISSION_RATE: 0.35, // 35% to Avalo
  AD_FEED_FREQUENCY: 10, // show ad every N posts
  AD_DISCOVERY_FREQUENCY: 12,
} as const;

/**
 * Validation Rules
 */
export const AD_VALIDATION_RULES = {
  headline: {
    minLength: 10,
    maxLength: 100,
  },
  description: {
    minLength: 20,
    maxLength: 500,
  },
  targetUrl: {
    maxLength: 2048,
  },
  countryScopes: {
    minCountries: 1,
    maxCountries: 50,
  },
} as const;

/**
 * Placement Exclusions
 * These surfaces NEVER show ads
 */
export const AD_EXCLUSION_SURFACES = [
  'private_chat',
  'voice_call',
  'video_call',
  'calendar_booking',
  'panic_button',
  'safety_flow',
  'payment_flow',
  'verification_flow',
] as const;

/**
 * Safety Check Result
 */
export interface AdSafetyCheckResult {
  isValid: boolean;
  violations: string[];
  requiresManualReview: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  flags: {
    datingManipulation: boolean;
    scamWording: boolean;
    adultContent: boolean;
    politicalContent: boolean;
    religiousContent: boolean;
    medicalClaims: boolean;
    ageInappropriate: boolean;
  };
}
