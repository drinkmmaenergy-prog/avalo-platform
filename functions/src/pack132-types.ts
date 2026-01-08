/**
 * PACK 132 — Avalo Global Analytics Cloud
 * Type Definitions
 * 
 * Privacy-First Analytics System:
 * - Zero personal data exposure
 * - Aggregated metrics only
 * - No buyer/fan identities
 * - No DM content access
 * - Regional-level only (no personal location)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BASE TYPES
// ============================================================================

export type AnalyticsPeriod = 'DAY_1' | 'DAY_7' | 'DAY_30' | 'DAY_90' | 'LIFETIME';

export type ContentType = 
  | 'POST'
  | 'STORY'
  | 'REEL'
  | 'PREMIUM_MEDIA'
  | 'DIGITAL_PRODUCT'
  | 'EVENT'
  | 'CALL'
  | 'SUBSCRIPTION';

export type EngagementType = 'LIKE' | 'COMMENT' | 'SHARE' | 'SAVE' | 'WATCH_TIME';

export type MonetizationChannel =
  | 'CHAT'
  | 'MEDIA_UNLOCK'
  | 'SUBSCRIPTION'
  | 'DIGITAL_PRODUCT'
  | 'EVENT'
  | 'CALL'
  | 'GIFT'
  | 'AI_COMPANION';

export type RegionCode = 'NA' | 'EU' | 'ASIA' | 'SA' | 'AFRICA' | 'OCEANIA' | 'GLOBAL';

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

// ============================================================================
// CREATOR ANALYTICS (Individual Creator Data)
// ============================================================================

export interface CreatorMetrics {
  creatorId: string;
  period: AnalyticsPeriod;
  
  // Audience Metrics (Aggregated Only)
  totalFollowers: number;
  followerGrowth: number; // percentage
  totalProfileViews: number;
  profileViewGrowth: number;
  
  // Content Performance
  totalPosts: number;
  totalImpressions: number;
  totalReach: number; // estimated unique viewers
  avgWatchTime: number; // seconds
  
  // Engagement (No Individual IDs)
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  engagementRate: number; // percentage
  
  // Monetization (Aggregated)
  totalRevenue: number; // in tokens
  revenueGrowth: number; // percentage
  totalPurchases: number;
  avgPurchaseValue: number;
  conversionRate: number; // percentage
  
  // Channel Breakdown
  revenueByChannel: Record<MonetizationChannel, number>;
  
  // Product Performance
  digitalProductSales: number;
  subscriptionCount: number;
  subscriptionChurnRate: number; // percentage
  callMinutesTotal: number;
  callConversionRate: number; // percentage
  mediaUnlockCount: number;
  mediaUnlockRate: number; // percentage
  
  // Retention Cohorts (Aggregated)
  retentionDay1: number; // percentage of new followers active after 1 day
  retentionDay7: number;
  retentionDay30: number;
  
  // Updated timestamp
  updatedAt: Timestamp;
}

// ============================================================================
// BRAND ANALYTICS (Advertiser/Partner Data)
// ============================================================================

export interface BrandMetrics {
  brandId: string;
  campaignId?: string;
  period: AnalyticsPeriod;
  
  // Campaign Performance
  totalImpressions: number;
  totalClicks: number;
  clickThroughRate: number; // percentage
  totalReach: number;
  
  // Conversion Metrics
  totalConversions: number;
  conversionRate: number; // percentage
  costPerClick: number;
  costPerConversion: number;
  
  // Budget & Spend
  budgetTotal: number;
  budgetSpent: number;
  budgetRemaining: number;
  
  // Engagement
  totalEngagements: number;
  engagementRate: number;
  
  // Regional Breakdown (No Personal Location)
  impressionsByRegion: Record<RegionCode, number>;
  clicksByRegion: Record<RegionCode, number>;
  
  // Content Category Performance
  topCategories: Array<{
    category: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  
  updatedAt: Timestamp;
}

// ============================================================================
// PLATFORM ANALYTICS (Avalo Internal Only)
// ============================================================================

export interface PlatformMetrics {
  period: AnalyticsPeriod;
  
  // Global Growth
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userGrowthRate: number; // percentage
  
  // Creator Economy
  totalCreators: number;
  activeCreators: number;
  totalCreatorEarnings: number;
  avgCreatorEarnings: number;
  
  // Monetization
  totalRevenue: number;
  revenueGrowth: number;
  revenueByChannel: Record<MonetizationChannel, number>;
  
  // Content
  totalPosts: number;
  totalImpressions: number;
  totalEngagements: number;
  avgEngagementRate: number;
  
  // Category Performance
  categoryStats: Array<{
    category: string;
    creators: number;
    posts: number;
    revenue: number;
    growth: number;
  }>;
  
  // Regional Distribution (Aggregated)
  usersByRegion: Record<RegionCode, number>;
  revenueByRegion: Record<RegionCode, number>;
  
  // Safety & Compliance
  nsfwContentVolume: number;
  nsfwComplianceRate: number;
  moderationActions: number;
  
  // Paid Interactions
  totalCalls: number;
  totalCallMinutes: number;
  avgCallDuration: number;
  totalMessages: number;
  paidMessageCount: number;
  
  updatedAt: Timestamp;
}

// ============================================================================
// PREDICTIVE INSIGHTS
// ============================================================================

export interface PredictiveInsight {
  id: string;
  targetId: string; // creatorId or brandId
  targetType: 'CREATOR' | 'BRAND';
  insightType: 'BEST_TIME' | 'CONTENT_TYPE' | 'PRICING' | 'CATEGORY_TREND' | 'GROWTH_OPPORTUNITY';
  
  // Insight Data
  title: string;
  description: string;
  confidence: number; // 0-100
  
  // Statistical Basis
  dataPoints: number;
  period: AnalyticsPeriod;
  
  // Recommendations (Statistical Only)
  recommendations: Array<{
    action: string;
    expectedImpact: string;
    confidence: number;
  }>;
  
  // Metadata
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface ContentHeatmap {
  creatorId: string;
  period: AnalyticsPeriod;
  
  // Best Publishing Times (Aggregated Stats)
  bestHours: Array<{
    hour: number; // 0-23
    avgEngagement: number;
    avgReach: number;
    confidence: number;
  }>;
  
  bestDays: Array<{
    day: DayOfWeek;
    avgEngagement: number;
    avgReach: number;
    confidence: number;
  }>;
  
  // Content Type Performance
  performanceByType: Record<ContentType, {
    avgEngagement: number;
    avgReach: number;
    conversionRate: number;
  }>;
  
  // Retention Patterns
  retentionAfterPost: number; // percentage who return
  retentionAfterMessage: number;
  
  updatedAt: Timestamp;
}

export interface CategoryTrend {
  category: string;
  region: RegionCode;
  period: AnalyticsPeriod;
  
  // Trend Data (Global, Anonymized)
  totalPosts: number;
  growthRate: number; // percentage
  totalCreators: number;
  avgEngagement: number;
  
  // Momentum Score
  trendingScore: number; // 0-100
  trendDirection: 'UP' | 'STABLE' | 'DOWN';
  
  updatedAt: Timestamp;
}

// ============================================================================
// ANALYTICS CLOUD MATERIALIZED VIEWS
// ============================================================================

export interface AnalyticsCreatorMaterialized {
  creatorId: string;
  
  // Pre-computed metrics for all periods
  metrics: Record<AnalyticsPeriod, CreatorMetrics>;
  
  // Heatmaps
  heatmaps: Record<AnalyticsPeriod, ContentHeatmap>;
  
  // Active insights
  insights: PredictiveInsight[];
  
  // Last computation
  lastComputedAt: Timestamp;
  nextComputeAt: Timestamp;
}

export interface AnalyticsBrandMaterialized {
  brandId: string;
  
  // Pre-computed metrics for all periods
  metrics: Record<AnalyticsPeriod, BrandMetrics>;
  
  // Campaign summaries
  campaigns: Array<{
    campaignId: string;
    status: string;
    metrics: BrandMetrics;
  }>;
  
  // Last computation
  lastComputedAt: Timestamp;
  nextComputeAt: Timestamp;
}

export interface AnalyticsPlatformMaterialized {
  // Pre-computed metrics for all periods
  metrics: Record<AnalyticsPeriod, PlatformMetrics>;
  
  // Category trends
  categoryTrends: CategoryTrend[];
  
  // Regional insights
  regionalInsights: Array<{
    region: RegionCode;
    activeUsers: number;
    revenue: number;
    growth: number;
  }>;
  
  // Last computation
  lastComputedAt: Timestamp;
  nextComputeAt: Timestamp;
}

// ============================================================================
// PRIVACY VALIDATION
// ============================================================================

export interface PrivacyValidationResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
  
  // Validation checks
  hasPersonalData: boolean;
  hasIdentities: boolean;
  hasDMContent: boolean;
  hasPersonalLocation: boolean;
  isAggregated: boolean;
  
  timestamp: Timestamp;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum AnalyticsErrorCode {
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  PRIVACY_VIOLATION = 'PRIVACY_VIOLATION',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  COMPUTATION_FAILED = 'COMPUTATION_FAILED',
  INVALID_PERIOD = 'INVALID_PERIOD',
  CREATOR_NOT_FOUND = 'CREATOR_NOT_FOUND',
  BRAND_NOT_FOUND = 'BRAND_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetCreatorAnalyticsRequest {
  creatorId: string;
  period?: AnalyticsPeriod;
  includeHeatmaps?: boolean;
  includeInsights?: boolean;
}

export interface GetCreatorAnalyticsResponse {
  metrics: CreatorMetrics;
  heatmaps?: ContentHeatmap;
  insights?: PredictiveInsight[];
  privacy: PrivacyValidationResult;
}

export interface GetBrandAnalyticsRequest {
  brandId: string;
  campaignId?: string;
  period?: AnalyticsPeriod;
}

export interface GetBrandAnalyticsResponse {
  metrics: BrandMetrics;
  campaigns?: Array<{
    campaignId: string;
    metrics: BrandMetrics;
  }>;
  privacy: PrivacyValidationResult;
}

export interface GetPlatformAnalyticsRequest {
  period?: AnalyticsPeriod;
  includeCategories?: boolean;
  includeRegions?: boolean;
}

export interface GetPlatformAnalyticsResponse {
  metrics: PlatformMetrics;
  categoryTrends?: CategoryTrend[];
  regionalInsights?: Array<{
    region: RegionCode;
    activeUsers: number;
    revenue: number;
    growth: number;
  }>;
  privacy: PrivacyValidationResult;
}