/**
 * PACK 109 — Cross-App Social Partnerships, Influencer Collaboration Pipeline & Talent Relations CRM
 * 
 * TypeScript type definitions for talent and partnership management.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero free tokens, zero bonuses, zero discounts, zero incentives
 * - Token price per unit remains unchanged
 * - Revenue split always 65% creator / 35% Avalo
 * - No special ranking boost in discovery
 * - No algorithmic "pay-to-win" advantages
 * - This is pure B2B/Talent CRM + campaign orchestration
 * - All tracking is read-only analytics ONLY
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// PARTNER ORGANIZATION TYPES
// ============================================================================

export type PartnerType = 
  | 'AGENCY'
  | 'NETWORK'
  | 'BRAND'
  | 'PROMOTER'
  | 'OTHER';

export interface PartnerOrganization {
  id: string;
  name: string;
  type: PartnerType;
  contactEmails: string[];
  contactHandles: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    linkedin?: string;
  };
  active: boolean;
  notes?: string; // Internal notes (no sensitive PII)
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// TALENT PROFILE TYPES
// ============================================================================

export type TalentStatus =
  | 'POTENTIAL'    // Initial contact stage
  | 'CONTACTED'    // Outreach sent
  | 'NEGOTIATING'  // In discussion
  | 'ACTIVE'       // Currently collaborating
  | 'INACTIVE'     // Paused collaboration
  | 'BLOCKED';     // Blocked due to violations

export type TalentCategory =
  | 'DATING'
  | 'LIFESTYLE'
  | 'FITNESS'
  | 'GAMING'
  | 'BEAUTY'
  | 'FASHION'
  | 'ENTERTAINMENT'
  | 'OTHER';

export interface TalentProfile {
  id: string;
  partnerId?: string; // Optional link to partner organization
  avaloUserId?: string; // Optional link if talent has Avalo account
  externalHandles: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    twitch?: string;
    snapchat?: string;
  };
  region: string; // ISO country code (e.g., 'US', 'PL', 'DE')
  categories: TalentCategory[];
  status: TalentStatus;
  notes?: string; // Internal notes (no sensitive PII)
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// PARTNERSHIP CAMPAIGN TYPES
// ============================================================================

export type CampaignStatus =
  | 'PLANNED'      // Campaign is being planned
  | 'ACTIVE'       // Currently running
  | 'PAUSED'       // Temporarily paused
  | 'COMPLETED'    // Finished
  | 'CANCELLED';   // Cancelled before completion

export type CampaignObjective =
  | 'SIGNUPS'              // Drive new user signups
  | 'AWARENESS'            // Brand awareness
  | 'CONTENT_DROP'         // Content launch event
  | 'ENGAGEMENT'           // Drive engagement
  | 'LIVE_EVENT'           // Live streaming event
  | 'CREATOR_RECRUITMENT'; // Recruit new creators

export type CampaignChannel =
  | 'TIKTOK'
  | 'INSTAGRAM'
  | 'YOUTUBE'
  | 'TWITTER'
  | 'TWITCH'
  | 'SNAPCHAT'
  | 'OTHER';

export interface PartnershipCampaign {
  id: string;
  name: string;
  description: string; // Internal description
  slug: string; // URL-safe slug for smart links (e.g., 'launch-wave-q4')
  objectives: CampaignObjective[];
  startDate: Timestamp | FieldValue;
  endDate: Timestamp | FieldValue;
  regions: string[]; // Targeted regions (ISO country codes)
  channels: CampaignChannel[];
  status: CampaignStatus;
  partnerIds: string[]; // Involved partner organizations
  talentIds: string[]; // Involved talent profiles
  trackingTags: string[]; // Additional tracking tags (e.g., 'avalox_partner_01')
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// CAMPAIGN ATTRIBUTION EVENT TYPES
// ============================================================================

export type CampaignAttributionEventType =
  | 'VISIT'                    // User visited campaign landing page
  | 'SIGNUP'                   // User completed signup
  | 'FOLLOW'                   // User followed talent on Avalo
  | 'FIRST_MESSAGE'            // User sent first message to talent
  | 'FIRST_PAID_INTERACTION';  // User had first paid interaction with talent

export interface CampaignAttributionEvent {
  id: string;
  campaignId: string; // Reference to partnership_campaigns
  talentId: string; // Reference to talent_profiles
  avaloUserId?: string; // Optional (if user signs up / acts)
  eventType: CampaignAttributionEventType;
  occurredAt: Timestamp | FieldValue;
  platform?: CampaignChannel; // Platform where event originated
  region?: string; // ISO country code
  metadata?: {
    referrer?: string;
    userAgent?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
}

// ============================================================================
// CAMPAIGN PERFORMANCE ANALYTICS
// ============================================================================

export interface CampaignPerformanceMetrics {
  campaignId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  
  // Overall metrics
  visits: number;
  signups: number;
  follows: number;
  firstMessages: number;
  firstPaidInteractions: number;
  
  // Conversion rates
  visitToSignupRate: number;
  signupToFollowRate: number;
  followToPayerRate: number;
  
  // Breakdown by talent
  byTalent: TalentPerformanceBreakdown[];
  
  // Breakdown by region
  byRegion: Record<string, {
    visits: number;
    signups: number;
    follows: number;
  }>;
  
  // Breakdown by channel
  byChannel: Partial<Record<CampaignChannel, {
    visits: number;
    signups: number;
    follows: number;
  }>>;
  
  updatedAt: Timestamp | FieldValue;
}

export interface TalentPerformanceBreakdown {
  talentId: string;
  talentName?: string; // Display name (for reporting)
  visits: number;
  signups: number;
  follows: number;
  firstMessages: number;
  firstPaidInteractions: number;
  regionBreakdown: Record<string, number>; // visits by region
}

// ============================================================================
// REQUEST/RESPONSE TYPES FOR ADMIN FUNCTIONS
// ============================================================================

// Partner Management
export interface CreatePartnerRequest {
  name: string;
  type: PartnerType;
  contactEmails: string[];
  contactHandles?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    linkedin?: string;
  };
  notes?: string;
}

export interface UpdatePartnerRequest {
  partnerId: string;
  name?: string;
  type?: PartnerType;
  contactEmails?: string[];
  contactHandles?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    linkedin?: string;
  };
  active?: boolean;
  notes?: string;
}

// Talent Management
export interface CreateTalentProfileRequest {
  partnerId?: string;
  avaloUserId?: string;
  externalHandles: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    twitch?: string;
    snapchat?: string;
  };
  region: string;
  categories: TalentCategory[];
  status: TalentStatus;
  notes?: string;
}

export interface UpdateTalentProfileRequest {
  talentId: string;
  partnerId?: string;
  avaloUserId?: string;
  externalHandles?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    twitch?: string;
    snapchat?: string;
  };
  region?: string;
  categories?: TalentCategory[];
  status?: TalentStatus;
  notes?: string;
}

// Campaign Management
export interface CreateCampaignRequest {
  name: string;
  description: string;
  slug: string;
  objectives: CampaignObjective[];
  startDate: string | number; // ISO date string or timestamp
  endDate: string | number;
  regions: string[];
  channels: CampaignChannel[];
  partnerIds: string[];
  talentIds: string[];
  trackingTags?: string[];
}

export interface UpdateCampaignRequest {
  campaignId: string;
  name?: string;
  description?: string;
  slug?: string;
  objectives?: CampaignObjective[];
  startDate?: string | number;
  endDate?: string | number;
  regions?: string[];
  channels?: CampaignChannel[];
  status?: CampaignStatus;
  partnerIds?: string[];
  talentIds?: string[];
  trackingTags?: string[];
}

// Campaign Analytics
export interface GetCampaignPerformanceRequest {
  campaignId: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
}

export interface GetCampaignPerformanceResponse {
  success: boolean;
  metrics?: CampaignPerformanceMetrics;
  error?: string;
}

// Smart Link Tracking
export interface LogCampaignVisitRequest {
  campaignSlug: string;
  talentId: string;
  platform?: CampaignChannel;
  metadata?: {
    referrer?: string;
    userAgent?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
}

export interface LogCampaignVisitResponse {
  success: boolean;
  eventId?: string;
  deepLink?: string; // Deep link to app
  error?: string;
}

// ============================================================================
// CREATOR-FACING TYPES (FOR TALENTS WHO ARE ALSO AVALO CREATORS)
// ============================================================================

export interface CreatorCampaignSummary {
  campaignId: string;
  campaignName: string;
  description: string;
  objectives: CampaignObjective[];
  startDate: Date;
  endDate: Date;
  status: CampaignStatus;
  
  // Talent's smart links for this campaign
  smartLinks: {
    web: string;
    tiktok?: string;
    instagram?: string;
    youtube?: string;
  };
  
  // Simple metrics (read-only)
  metrics: {
    visits: number;
    signups: number;
    follows: number;
    firstPaidInteractions: number;
  };
}

export interface GetCreatorCampaignsResponse {
  success: boolean;
  campaigns: CreatorCampaignSummary[];
  error?: string;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum PartnershipErrorCode {
  PARTNER_NOT_FOUND = 'partnership/partner-not-found',
  TALENT_NOT_FOUND = 'partnership/talent-not-found',
  CAMPAIGN_NOT_FOUND = 'partnership/campaign-not-found',
  DUPLICATE_SLUG = 'partnership/duplicate-slug',
  INVALID_DATE_RANGE = 'partnership/invalid-date-range',
  UNAUTHORIZED = 'partnership/unauthorized',
  INVALID_STATUS_TRANSITION = 'partnership/invalid-status-transition',
}

/**
 * Custom error class for partnership operations
 */
export class PartnershipError extends Error {
  constructor(
    public code: PartnershipErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PartnershipError';
  }
}