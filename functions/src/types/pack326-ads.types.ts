/**
 * PACK 326 — In-Feed Ads System Types
 * Brand campaigns, impressions, and click billing
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CAMPAIGN TYPES
// ============================================================================

export type CampaignStatus = 
  | 'DRAFT'      // Campaign being created
  | 'ACTIVE'     // Running and delivering ads
  | 'PAUSED'     // Temporarily stopped
  | 'ENDED'      // Budget exhausted or end date reached
  | 'REJECTED';  // Rejected by moderation

export type AdPlacement = 
  | 'FEED'       // Main feed posts
  | 'REELS'      // Reels/video content
  | 'STORIES';   // Stories feed

export type BillingModel = 
  | 'CPM'        // Cost per 1000 impressions
  | 'CPC';       // Cost per click

export type Gender = 
  | 'MALE'
  | 'FEMALE'
  | 'NONBINARY'
  | 'ANY';

export interface CampaignTargeting {
  regions?: string[];           // Country/region codes
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  interests?: string[];         // Interest tags
}

export interface CampaignPricing {
  cpmTokens?: number;           // Cost per 1000 impressions
  cpcTokens?: number;           // Cost per click
}

export interface AdsCampaign {
  id: string;
  advertiserUserId: string | null;  // null for Avalo internal campaigns
  
  name: string;
  status: CampaignStatus;
  
  budgetTokens: number;
  spentTokens: number;
  
  startAt: string;                  // ISO date string
  endAt: string;                    // ISO date string
  
  targeting: CampaignTargeting;
  placement: AdPlacement;
  billingModel: BillingModel;
  pricing: CampaignPricing;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CREATIVE TYPES
// ============================================================================

export type CreativeType = 
  | 'IMAGE'
  | 'VIDEO';

export type CreativeStatus = 
  | 'PENDING'    // Awaiting moderation
  | 'APPROVED'   // Ready to serve
  | 'REJECTED';  // Failed moderation

export interface AdsCreative {
  id: string;
  campaignId: string;
  
  type: CreativeType;
  mediaUrl: string;
  
  headline: string;
  description?: string;
  callToAction?: string;
  
  status: CreativeStatus;
  rejectionReason?: string;
  
  createdAt: string;
}

// ============================================================================
// IMPRESSION & CLICK TYPES
// ============================================================================

export interface AdsImpression {
  id: string;
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  createdAt: string;
}

export interface AdsClick {
  id: string;
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  createdAt: string;
}

// ============================================================================
// DEFAULT PRICING CONFIG
// ============================================================================

export const ADS_DEFAULT_PRICING = {
  CPM_TOKENS: 40,           // 40 tokens per 1000 impressions
  CPC_TOKENS: 8,            // 8 tokens per click
  MIN_CAMPAIGN_BUDGET: 200, // Minimum 200 tokens
  MIN_DAILY_BUDGET: 50,     // Minimum 50 tokens/day
};

// ============================================================================
// AD DELIVERY CONFIG
// ============================================================================

export const ADS_DELIVERY_CONFIG = {
  AD_FREQUENCY: {
    MIN_ORGANIC_ITEMS: 8,   // Minimum items between ads
    MAX_ORGANIC_ITEMS: 12,  // Maximum items between ads
  },
  ANTI_FRAUD: {
    MAX_CLICKS_PER_IP_24H: 5,           // Max clicks per IP per 24h per creative
    MAX_IMPRESSIONS_PER_USER_10M: 1,    // Max 1 impression per user per 10min per creative
    HIGH_CTR_THRESHOLD: 0.15,           // CTR > 15% flags for review
    SUSPICIOUS_VELOCITY_THRESHOLD: 100, // 100+ clicks in 1 hour = suspicious
  },
};

// ============================================================================
// CAMPAIGN MANAGEMENT REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateCampaignRequest {
  advertiserUserId: string;
  name: string;
  placement: AdPlacement;
  billingModel: BillingModel;
  pricing: CampaignPricing;
  dailyBudgetTokens: number;
  startAt: string;
  endAt: string;
  targeting: CampaignTargeting;
}

export interface CreateCampaignResponse {
  success: boolean;
  campaignId?: string;
  error?: string;
}

export interface CreateCreativeRequest {
  campaignId: string;
  type: CreativeType;
  mediaUrl: string;
  headline: string;
  description?: string;
  callToAction?: string;
}

export interface CreateCreativeResponse {
  success: boolean;
  creativeId?: string;
  error?: string;
}

// ============================================================================
// TRACKING REQUEST/RESPONSE TYPES
// ============================================================================

export interface TrackImpressionRequest {
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
}

export interface TrackImpressionResponse {
  success: boolean;
  impressionId?: string;
  shouldBill?: boolean;      // True if CPM billing threshold reached
  error?: string;
}

export interface TrackClickRequest {
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  ipAddress?: string;
}

export interface TrackClickResponse {
  success: boolean;
  clickId?: string;
  billed?: boolean;
  error?: string;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface CampaignAnalytics {
  campaignId: string;
  impressions: number;
  clicks: number;
  ctr: number;                // Click-through rate
  spentTokens: number;
  remainingBudget: number;
  averageCPM?: number;        // Average cost per 1000 impressions
  averageCPC?: number;        // Average cost per click
  daysRemaining: number;
}

export interface CreativeAnalytics {
  creativeId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spentTokens: number;
}

// ============================================================================
// ADMIN MODERATION TYPES
// ============================================================================

export interface ModerateCreativeRequest {
  creativeId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  adminUserId: string;
}

export interface ModerateCreativeResponse {
  success: boolean;
  error?: string;
}

export interface PauseCampaignRequest {
  campaignId: string;
  reason: string;
  adminUserId: string;
}

export interface PauseCampaignResponse {
  success: boolean;
  error?: string;
}

// ============================================================================
// FRAUD DETECTION TYPES
// ============================================================================

export interface FraudAlert {
  id: string;
  campaignId: string;
  creativeId?: string;
  alertType: 
    | 'HIGH_CTR'
    | 'SUSPICIOUS_IP'
    | 'CLICK_VELOCITY'
    | 'IMPRESSION_PATTERN'
    | 'DUPLICATE_CLICKS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: Record<string, any>;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: string;
}

export interface ClickFraudCheck {
  viewerUserId: string;
  creativeId: string;
  ipAddress: string;
  timestamp: string;
}

export interface ImpressionFraudCheck {
  viewerUserId: string;
  creativeId: string;
  timestamp: string;
}

// ============================================================================
// AD DELIVERY TYPES
// ============================================================================

export interface AdDeliveryContext {
  viewerUserId: string;
  placement: AdPlacement;
  userRegion?: string;
  userGender?: Gender;
  userAge?: number;
  userInterests?: string[];
}

export interface DeliveredAd {
  campaignId: string;
  creativeId: string;
  creative: AdsCreative;
  trackingId: string;        // For impression tracking
  destinationUrl?: string;   // Where clicking leads
}

export interface AdDeliveryResponse {
  ad?: DeliveredAd;
  noAdsAvailable?: boolean;
  reason?: string;
}

// ============================================================================
// SAFETY & COMPLIANCE TYPES
// ============================================================================

export type ProhibitedCategory = 
  | 'ADULT_SERVICES'
  | 'ILLEGAL_GOODS'
  | 'GAMBLING_UNLICENSED'
  | 'POLITICAL_UNAPPROVED'
  | 'WEAPONS'
  | 'DRUGS'
  | 'HATE_SPEECH';

export interface ComplianceCheck {
  creativeId: string;
  passed: boolean;
  violations?: ProhibitedCategory[];
  requiresManualReview: boolean;
  notes?: string;
}

// ============================================================================
// BILLING AGGREGATION TYPES
// ============================================================================

export interface CPMBillingBatch {
  campaignId: string;
  impressionCount: number;
  tokensCharged: number;
  billedAt: string;
}

export interface CPCBillingRecord {
  campaignId: string;
  clickId: string;
  tokensCharged: number;
  billedAt: string;
}