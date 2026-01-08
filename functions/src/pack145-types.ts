/**
 * PACK 145 - Avalo Advertising Network 1.0
 * Social Ads · Ethical Targeting · Zero Romance/NSFW · Zero Visibility Advantage
 * 
 * Non-negotiable rules:
 * - No dating/romance/sexual attention ads
 * - No visibility boost outside paid placements
 * - No exploitative targeting (beauty, body, vulnerability)
 * - No external payment links
 * - Ethical targeting only (interests, purchase intent, engagement)
 */

import { Timestamp } from 'firebase-admin/firestore';

export type AdCampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected' | 'banned';
export type AdAssetStatus = 'pending' | 'approved' | 'rejected' | 'banned';
export type AdAssetType = 'image' | 'video';
export type AdContentType = 'product' | 'club' | 'challenge' | 'event' | 'mentorship' | 'digital_good' | 'service';
export type BillingModel = 'cpc' | 'cpm' | 'cpv' | 'cpa';
export type AdPlacementSurface = 'feed' | 'club' | 'discovery' | 'event_recommendations' | 'business_suite';
export type AdCallToAction = 'buy' | 'learn_more' | 'join_event' | 'view_product' | 'book_session' | 'join_club';

export interface AdCampaign {
  id: string;
  advertiserId: string;
  name: string;
  description: string;
  status: AdCampaignStatus;
  contentType: AdContentType;
  targetContentId: string;
  assetIds: string[];
  targeting: AdTargeting;
  billing: AdBilling;
  budget: AdBudget;
  schedule: AdSchedule;
  placements: AdPlacementSurface[];
  callToAction: AdCallToAction;
  analytics: AdCampaignAnalytics;
  moderationHistory: ModerationRecord[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  pausedAt?: Timestamp;
  completedAt?: Timestamp;
  rejectedAt?: Timestamp;
  rejectionReason?: string;
}

export interface AdTargeting {
  interests: string[];
  purchaseIntent: string[];
  engagementLevel?: 'low' | 'medium' | 'high';
  regions?: string[];
  languages?: string[];
  ageRange?: {
    min: number;
    max: number;
  };
}

export interface AdBilling {
  model: BillingModel;
  bidAmount: number;
  currency: string;
  maxDailySpend?: number;
}

export interface AdBudget {
  totalBudget: number;
  dailyBudget: number;
  spent: number;
  remaining: number;
  currency: string;
}

export interface AdSchedule {
  startDate: Timestamp;
  endDate?: Timestamp;
  timezone: string;
  alwaysOn: boolean;
}

export interface AdCampaignAnalytics {
  impressions: number;
  clicks: number;
  views: number;
  conversions: number;
  spent: number;
  ctr: number;
  conversionRate: number;
  avgCpc?: number;
  avgCpm?: number;
  avgCpv?: number;
  avgCpa?: number;
  lastUpdated: Timestamp;
}

export interface ModerationRecord {
  timestamp: Timestamp;
  moderatorId?: string;
  action: 'approved' | 'rejected' | 'flagged' | 'banned';
  reason?: string;
  violations?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  autoModerated: boolean;
}

export interface AdAsset {
  id: string;
  advertiserId: string;
  type: AdAssetType;
  status: AdAssetStatus;
  url: string;
  thumbnailUrl?: string;
  title: string;
  description: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize: number;
  moderationResult?: AssetModerationResult;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt?: Timestamp;
  rejectedAt?: Timestamp;
}

export interface AssetModerationResult {
  isApproved: boolean;
  violations: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  nsfwScore: number;
  romanceScore: number;
  exploitativeScore: number;
  moderatedAt: Timestamp;
  autoModerated: boolean;
  humanReviewRequired: boolean;
  moderatorId?: string;
  moderatorNotes?: string;
}

export interface AdPlacement {
  id: string;
  campaignId: string;
  assetId: string;
  surface: AdPlacementSurface;
  targetUserId: string;
  position: number;
  timestamp: Timestamp;
  expiresAt: Timestamp;
  impressionRecorded: boolean;
  clickRecorded: boolean;
  interactionData?: AdInteractionData;
}

export interface AdInteractionData {
  impressionAt?: Timestamp;
  clickAt?: Timestamp;
  viewDuration?: number;
  conversionAt?: Timestamp;
  conversionType?: string;
  conversionValue?: number;
  deviceType?: string;
  region?: string;
}

export interface AdMetrics {
  id: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  views: number;
  conversions: number;
  spent: number;
  ctr: number;
  conversionRate: number;
  avgCpc?: number;
  avgCpm?: number;
  avgCpv?: number;
  avgCpa?: number;
  deviceBreakdown: Record<string, number>;
  regionBreakdown: Record<string, number>;
  hourlyBreakdown: Record<string, number>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AdReport {
  id: string;
  campaignId: string;
  reporterId: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  moderatorId?: string;
  moderatorNotes?: string;
}

export interface AdStrike {
  id: string;
  advertiserId: string;
  campaignId?: string;
  assetId?: string;
  violation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Timestamp;
  moderatorId?: string;
  notes?: string;
}

export const FORBIDDEN_AD_PATTERNS = [
  /dating|romance|relationship|meet.*me|single/i,
  /sexy|hot|beautiful|attractive|cute.*girl|cute.*boy/i,
  /attention|notice.*me|exclusive.*chat|private.*company/i,
  /girlfriend|boyfriend|sugar.*daddy|sugar.*baby|escort/i,
  /love|miss.*you|thinking.*you|lonely|affection/i,
  /nsfw|adult|18\+|erotic|seductive|sexual/i,
  /paypal|venmo|cashapp|telegram|whatsapp|onlyfans/i,
  /message.*me|dm.*me|add.*me|contact.*outside/i,
  /fantasy|roleplay|intimate|sensual|desire/i,
  /emotional.*support|companionship.*for.*sale/i,
];

export const FORBIDDEN_TARGETING_SIGNALS = [
  'beauty_score',
  'attractiveness',
  'body_type',
  'weight',
  'appearance',
  'loneliness',
  'vulnerability',
  'anxiety',
  'heartbreak',
  'high_spender',
  'emotional_state',
  'gender_preference',
  'sexual_orientation',
];

export const ALLOWED_INTERESTS = [
  'fitness',
  'photography',
  'beauty_business',
  'fashion',
  'cooking',
  'travel',
  'gaming',
  'music',
  'art',
  'tech',
  'business',
  'education',
  'wellness',
  'sports',
  'entertainment',
];

export const ALLOWED_PURCHASE_INTENT = [
  'digital_products',
  'courses',
  'mentorship',
  'club_membership',
  'event_tickets',
  'challenges',
  'consulting',
  'coaching',
];

export const FORBIDDEN_CTAS = [
  'message_me',
  'dm_me',
  'add_me',
  'contact_me_privately',
  'exclusive_attention',
  'be_my_fan',
  'make_me_yours',
];

export const ALLOWED_PLACEMENTS: AdPlacementSurface[] = [
  'feed',
  'club',
  'discovery',
  'event_recommendations',
  'business_suite',
];

export const MAX_CAMPAIGN_BUDGET = 100000;
export const MIN_CAMPAIGN_BUDGET = 10;
export const MAX_DAILY_BUDGET = 10000;
export const MIN_BID_AMOUNT = 0.01;
export const MAX_BID_AMOUNT = 10;
export const MAX_ASSETS_PER_CAMPAIGN = 10;
export const MAX_ACTIVE_CAMPAIGNS_PER_ADVERTISER = 50;
export const MAX_TARGETING_INTERESTS = 20;
export const STRIKE_THRESHOLD_BAN = 3;

export const NSFW_THRESHOLD = 0.3;
export const ROMANCE_THRESHOLD = 0.4;
export const EXPLOITATIVE_THRESHOLD = 0.5;

export interface SafetyValidationResult {
  isValid: boolean;
  violations: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  nsfwScore: number;
  romanceScore: number;
  exploitativeScore: number;
  requiresHumanReview: boolean;
}

export interface TargetingValidationResult {
  isValid: boolean;
  violations: string[];
  forbiddenSignals: string[];
}

export interface ContentValidationResult {
  isValid: boolean;
  violations: string[];
  forbiddenPatterns: string[];
  forbiddenCTAs: string[];
}