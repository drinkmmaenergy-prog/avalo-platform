/**
 * PACK 120 — Multi-Sided Brand Partnerships & Sponsored Challenges
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - Zero free tokens, zero discounts, zero cashback, zero promo codes
 * - No ranking boost in discovery for participants or winners
 * - No economic advantage - earnings and payouts remain unchanged
 * - Token price and 65/35 commission split remain untouched
 * - No NSFW or sexually suggestive challenges
 * - No "pay to join" or "pay to win"
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CAMPAIGN TYPES
// ============================================================================

export type CampaignStatus = 
  | 'SCHEDULED'   // Not yet started
  | 'ACTIVE'      // Currently running
  | 'PAUSED'      // Temporarily paused
  | 'COMPLETED'   // Successfully finished
  | 'CANCELLED';  // Cancelled before completion

export type CampaignTheme =
  | 'ENERGY_FITNESS'
  | 'CONFIDENCE_EMPOWERMENT'
  | 'LIFESTYLE_WELLNESS'
  | 'CREATIVITY_ARTS'
  | 'TECH_INNOVATION'
  | 'EDUCATION_LEARNING'
  | 'COMMUNITY_SOCIAL'
  | 'OTHER';

export type MediaType = 'STORY' | 'VIDEO' | 'IMAGE';

export type ModerationMode = 
  | 'AUTO'         // Automatic AI moderation only
  | 'MANUAL'       // Requires manual review
  | 'HYBRID';      // AI + manual review

export interface BrandCampaign {
  campaignId: string;
  brandName: string;
  brandLogoRef: string;           // Storage path to brand logo
  campaignTitle: string;
  campaignDescription: string;
  theme: CampaignTheme;
  startAt: Timestamp;
  endAt: Timestamp;
  contentRules: string[];          // Safety boundaries and rules
  mediaType: MediaType;
  nsfwAllowed: boolean;            // Always false
  moderationMode: ModerationMode;
  status: CampaignStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;               // Admin user ID
}

// ============================================================================
// SUBMISSION TYPES
// ============================================================================

export type SubmissionStatus =
  | 'PENDING'      // Awaiting review
  | 'APPROVED'     // Passed moderation
  | 'REJECTED'     // Failed moderation
  | 'WINNER';      // Selected as winner

export interface CampaignSubmission {
  submissionId: string;
  campaignId: string;
  userId: string;
  contentId: string;              // Reference to story/content
  createdAt: Timestamp;
  status: SubmissionStatus;
  moderatedAt?: Timestamp;
  moderatedBy?: string;           // Admin/moderator ID
  rejectionReason?: string;
  metadata?: {
    viewCount?: number;
    userRegion?: string;
  };
}

// ============================================================================
// AWARD TYPES (NON-ECONOMIC ONLY)
// ============================================================================

export type AwardType =
  | 'PROFILE_BADGE'        // Digital badge for profile
  | 'SOCIAL_SHOUTOUT'      // Social media mention
  | 'MERCHANDISE'          // Physical product (shipped externally)
  | 'VIP_EXPERIENCE'       // In-person experience (concert, meetup, etc.)
  | 'STORY_FEATURE';       // Feature in Avalo Stories (non-ranking)

export interface CampaignAward {
  awardId: string;
  campaignId: string;
  awardType: AwardType;
  title: string;
  description: string;
  quantity?: number;               // Number of awards available
  winnersCount?: number;           // Number of winners selected
}

export interface AwardWinner {
  winnerId: string;
  campaignId: string;
  awardId: string;
  userId: string;
  submissionId: string;
  selectedAt: Timestamp;
  selectedBy: string;              // Admin ID
  deliveryStatus?: 'PENDING' | 'IN_PROGRESS' | 'DELIVERED';
  deliveryNotes?: string;
}

// ============================================================================
// BRAND ORGANIZATION TYPES
// ============================================================================

export type BrandKycStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface BrandOrganization {
  brandId: string;
  brandName: string;
  legalName: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  logoRef?: string;
  kycStatus: BrandKycStatus;
  kycDocuments?: string[];         // Storage refs to verification docs
  active: boolean;
  permissions: BrandPermissions;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;               // Admin who created
  suspendedAt?: Timestamp;
  suspendedReason?: string;
}

export interface BrandPermissions {
  canCreateCampaigns: boolean;
  canViewAnalytics: boolean;
  canModerateSubmissions: boolean;
  canAccessUserData: boolean;      // Always false for privacy
  maxActiveCampaigns: number;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface CampaignPerformanceStats {
  campaignId: string;
  totalImpressions: number;
  totalReach: number;              // Unique users who saw campaign
  totalSubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  winnerCount: number;
  regionBreakdown: Record<string, number>;
  participationRate: number;       // submissions / reach
  aggregatedAt: Timestamp;
}

export interface BrandAnalyticsSummary {
  brandId: string;
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalSubmissions: number;
  totalReach: number;
  averageParticipationRate: number;
  topPerformingCampaignId?: string;
  period: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateBrandCampaignRequest {
  brandName: string;
  brandLogoRef: string;
  campaignTitle: string;
  campaignDescription: string;
  theme: CampaignTheme;
  startDate: string;               // ISO date string
  endDate: string;                 // ISO date string
  contentRules: string[];
  mediaType: MediaType;
  moderationMode: ModerationMode;
}

export interface CreateBrandCampaignResponse {
  success: boolean;
  campaignId?: string;
  error?: string;
}

export interface SubmitChallengeContentRequest {
  campaignId: string;
  contentId: string;
}

export interface SubmitChallengeContentResponse {
  success: boolean;
  submissionId?: string;
  error?: string;
}

export interface ListBrandCampaignsRequest {
  status?: CampaignStatus;
  theme?: CampaignTheme;
  limit?: number;
  offset?: number;
}

export interface ListBrandCampaignsResponse {
  success: boolean;
  campaigns?: BrandCampaign[];
  total?: number;
  error?: string;
}

export interface GetCampaignPerformanceRequest {
  campaignId: string;
}

export interface GetCampaignPerformanceResponse {
  success: boolean;
  stats?: CampaignPerformanceStats;
  error?: string;
}

export interface ApproveSubmissionRequest {
  submissionId: string;
  isWinner?: boolean;
  awardId?: string;
}

export interface ApproveSubmissionResponse {
  success: boolean;
  error?: string;
}

export interface RejectSubmissionRequest {
  submissionId: string;
  reason: string;
}

export interface RejectSubmissionResponse {
  success: boolean;
  error?: string;
}

// ============================================================================
// FORBIDDEN AWARD EXAMPLES (NEVER IMPLEMENT)
// ============================================================================

/**
 * The following award types are STRICTLY FORBIDDEN:
 * 
 * ❌ Token rewards
 * ❌ Discounts on token purchases
 * ❌ Visibility boost in discovery
 * ❌ Monetization rights
 * ❌ Chat incentives or priority
 * ❌ Fast-track KYC
 * ❌ Fast-track payouts
 * ❌ Revenue share multipliers
 * ❌ Reduced commission rates
 * ❌ Free premium membership
 * ❌ Direct cash prizes
 * ❌ Gift cards or monetary equivalents
 */

// ============================================================================
// COMPLIANCE & SAFETY
// ============================================================================

export interface SafetyViolation {
  violationId: string;
  campaignId: string;
  submissionId?: string;
  brandId?: string;
  violationType: SafetyViolationType;
  description: string;
  reportedBy: string;
  reportedAt: Timestamp;
  actionTaken: string;
  resolved: boolean;
}

export type SafetyViolationType =
  | 'NSFW_CONTENT'
  | 'SEXUALIZED_CHALLENGE'
  | 'DANGEROUS_ACTIVITY'
  | 'ALCOHOL_DRUG_PROMOTION'
  | 'UNREALISTIC_BODY_EXPECTATIONS'
  | 'SELF_HARM_THEMES'
  | 'DARK_PATTERN'
  | 'INCENTIVIZED_BEHAVIOR'
  | 'OTHER';

export interface CampaignModerationLog {
  logId: string;
  campaignId: string;
  submissionId?: string;
  moderatorId: string;
  action: 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'ESCALATED';
  reason?: string;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}