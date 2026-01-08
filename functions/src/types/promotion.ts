/**
 * PACK 61: In-App Promotions & Sponsored Placement Engine
 * Types for promotion campaigns, orders, events, and filtering
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// PROMOTION CAMPAIGN
// ============================================================================

export type PromotionOwnerType = 'CREATOR' | 'PLATFORM';
export type PromotionStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
export type PromotionPlacement = 'DISCOVERY' | 'MARKETPLACE' | 'HOME_CARD';

export interface PromotionTargeting {
  minAge?: number | null;
  maxAge?: number | null;
  countries?: string[] | null;
  genders?: string[] | null;
}

export interface PromotionCampaign {
  campaignId: string;
  
  // Owner & type
  ownerType: PromotionOwnerType;
  ownerUserId?: string | null;
  name: string;
  status: PromotionStatus;
  
  // Promotion content & targeting
  placementTypes: PromotionPlacement[];
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  deepLink?: string | null;
  
  // Targeting rules
  targeting: PromotionTargeting;
  
  // Promotion policy
  nsfw: boolean;
  requiresMarketingConsent: boolean;
  
  // Scheduling
  startAt: Timestamp;
  endAt: Timestamp;
  
  // Budget & pacing (tokens)
  budgetTokensTotal: number;
  budgetTokensSpent: number;
  maxDailyImpressions?: number | null;
  maxTotalImpressions?: number | null;
  
  // Metrics
  impressions: number;
  clicks: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PROMOTION ORDER (CREATOR SPEND)
// ============================================================================

export type PromotionOrderStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface PromotionOrder {
  orderId: string;
  campaignId: string;
  ownerUserId: string;
  tokensCommitted: number;
  tokensConsumed: number;
  status: PromotionOrderStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PROMOTION EVENT LOG
// ============================================================================

export type PromotionEventType = 'IMPRESSION' | 'CLICK';

export interface PromotionEvent {
  eventId: string;
  campaignId: string;
  viewerUserId: string;
  type: PromotionEventType;
  placement: PromotionPlacement;
  createdAt: Timestamp;
}

// ============================================================================
// PROMOTION CONFIG
// ============================================================================

export interface PromotionConfig {
  tokensPerImpression: number;
  maxPromotionsPerFeedPage: number;
  maxPromotionsPerMarketplacePage: number;
  maxPromotionsPerHomeView: number;
}

// ============================================================================
// VIEWER CONTEXT FOR FILTERING
// ============================================================================

export interface ViewerContext {
  userId: string;
  age?: number | null;
  country?: string | null;
  gender?: string | null;
  marketingAllowed: boolean;
  ageVerified: boolean;
}

// ============================================================================
// PROMOTION CANDIDATE (FOR FILTERING)
// ============================================================================

export interface PromotionCandidate {
  campaignId: string;
  placement: PromotionPlacement;
  nsfw: boolean;
  targeting: PromotionTargeting;
  requiresMarketingConsent: boolean;
  status: PromotionStatus;
  startAt: Date;
  endAt: Date;
  budgetTokensTotal: number;
  budgetTokensSpent: number;
  maxDailyImpressions?: number | null;
  maxTotalImpressions?: number | null;
  impressions: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateCampaignRequest {
  ownerUserId: string;
  name: string;
  placementTypes: PromotionPlacement[];
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
  targeting?: PromotionTargeting;
  nsfw?: boolean;
  startAt: string; // ISO
  endAt: string;   // ISO
  initialBudgetTokens: number;
}

export interface UpdateCampaignRequest {
  ownerUserId: string;
  campaignId: string;
  status?: PromotionStatus;
  name?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
}

export interface AddBudgetRequest {
  ownerUserId: string;
  campaignId: string;
  additionalTokens: number;
}

export interface LogImpressionRequest {
  userId: string;
  campaignId: string;
  placement: PromotionPlacement;
}

export interface LogClickRequest {
  userId: string;
  campaignId: string;
  placement: PromotionPlacement;
}

export interface PromotionItemResponse {
  campaignId: string;
  placement: PromotionPlacement;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
}

export interface FetchPromotionsResponse {
  items: PromotionItemResponse[];
}