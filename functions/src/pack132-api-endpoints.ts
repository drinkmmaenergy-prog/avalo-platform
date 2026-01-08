/**
 * PACK 132 — Avalo Global Analytics Cloud
 * API Endpoints (Callable Functions)
 * 
 * Privacy-First API:
 * - Authentication required
 * - Scope-based access control
 * - Privacy validation on all responses
 * - Rate limiting
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AnalyticsPeriod,
  GetCreatorAnalyticsRequest,
  GetCreatorAnalyticsResponse,
  GetBrandAnalyticsRequest,
  GetBrandAnalyticsResponse,
  GetPlatformAnalyticsRequest,
  GetPlatformAnalyticsResponse,
  AnalyticsErrorCode,
  PlatformMetrics,
  BrandMetrics,
  CategoryTrend,
  RegionCode,
} from './pack132-types';
import {
  computeCreatorMetrics,
  generateContentHeatmap,
  generatePredictiveInsights,
  validatePrivacy,
} from './pack132-analytics-cloud';

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMITS = {
  CREATOR_ANALYTICS_PER_HOUR: 100,
  BRAND_ANALYTICS_PER_HOUR: 200,
  PLATFORM_ANALYTICS_PER_HOUR: 50, // Internal only
} as const;

/**
 * Check rate limit for user
 */
async function checkRateLimit(
  userId: string,
  action: string,
  limit: number
): Promise<boolean> {
  const rateLimitKey = `analytics_rate_limit:${action}:${userId}`;
  const hourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
  
  try {
    const doc = await db.collection('rate_limits').doc(rateLimitKey).get();
    
    if (doc.exists) {
      const data = doc.data();
      const count = data?.count || 0;
      const lastReset = data?.lastReset as Timestamp;
      
      // Reset if more than an hour ago
      if (lastReset.toMillis() < hourAgo.toMillis()) {
        await db.collection('rate_limits').doc(rateLimitKey).set({
          count: 1,
          lastReset: Timestamp.now(),
        });
        return true;
      }
      
      // Check if over limit
      if (count >= limit) {
        return false;
      }
      
      // Increment count
      await db.collection('rate_limits').doc(rateLimitKey).update({
        count: count + 1,
      });
      return true;
    } else {
      // First request
      await db.collection('rate_limits').doc(rateLimitKey).set({
        count: 1,
        lastReset: Timestamp.now(),
      });
      return true;
    }
  } catch (error) {
    logger.error('Error checking rate limit', { userId, action, error });
    return true; // Allow on error
  }
}

// ============================================================================
// CREATOR ANALYTICS API
// ============================================================================

/**
 * Get creator analytics
 * Accessible by: Creator themselves
 */
export const getCreatorAnalytics = onCall<GetCreatorAnalyticsRequest, Promise<GetCreatorAnalyticsResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { creatorId, period = 'DAY_30', includeHeatmaps = false, includeInsights = false } = request.data;
    
    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Creator ID required');
    }
    
    // Security: Only creator can view their own analytics
    if (request.auth.uid !== creatorId) {
      throw new HttpsError('permission-denied', 'Can only access your own analytics');
    }
    
    // Rate limiting
    const withinLimit = await checkRateLimit(
      request.auth.uid,
      'creator_analytics',
      RATE_LIMITS.CREATOR_ANALYTICS_PER_HOUR
    );
    
    if (!withinLimit) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Try again later.');
    }
    
    try {
      // Check for cached metrics
      const cachedDoc = await db
        .collection('analytics_creators')
        .doc(creatorId)
        .get();
      
      let metrics;
      let heatmaps;
      let insights;
      
      if (cachedDoc.exists) {
        const cached = cachedDoc.data();
        metrics = cached?.metrics?.[period];
        
        // If cached and recent (< 24 hours), use it
        if (metrics && cached?.lastComputedAt) {
          const lastComputed = (cached.lastComputedAt as Timestamp).toMillis();
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          
          if (lastComputed > oneDayAgo) {
            // Use cached data
            if (includeHeatmaps) {
              heatmaps = cached?.heatmaps?.[period];
            }
            if (includeInsights) {
              insights = cached?.insights || [];
            }
          }
        }
      }
      
      // If no cached data or too old, compute fresh
      if (!metrics) {
        logger.info('Computing fresh metrics for creator', { creatorId, period });
        metrics = await computeCreatorMetrics(creatorId, period);
        
        if (includeHeatmaps) {
          heatmaps = await generateContentHeatmap(creatorId, period);
        }
        
        if (includeInsights) {
          insights = await generatePredictiveInsights(creatorId);
        }
        
        // Cache the results
        await db
          .collection('analytics_creators')
          .doc(creatorId)
          .set({
            creatorId,
            metrics: { [period]: metrics },
            ...(heatmaps && { heatmaps: { [period]: heatmaps } }),
            ...(insights && { insights }),
            lastComputedAt: Timestamp.now(),
          }, { merge: true });
      }
      
      // Validate privacy compliance
      const privacy = validatePrivacy(metrics);
      
      if (!privacy.valid) {
        logger.error('Privacy validation failed', { creatorId, violations: privacy.violations });
        throw new HttpsError('failed-precondition', 'Privacy validation failed');
      }
      
      const response: GetCreatorAnalyticsResponse = {
        metrics,
        ...(heatmaps && { heatmaps }),
        ...(insights && { insights }),
        privacy,
      };
      
      logger.info('Creator analytics retrieved', { creatorId, period });
      
      return response;
    } catch (error: any) {
      logger.error('Error getting creator analytics', { creatorId, error });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get analytics: ${error.message}`);
    }
  }
);

// ============================================================================
// BRAND ANALYTICS API
// ============================================================================

/**
 * Get brand/advertiser analytics
 * Accessible by: Brand account holders
 */
export const getBrandAnalytics = onCall<GetBrandAnalyticsRequest, Promise<GetBrandAnalyticsResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { brandId, campaignId, period = 'DAY_30' } = request.data;
    
    if (!brandId) {
      throw new HttpsError('invalid-argument', 'Brand ID required');
    }
    
    // Verify brand ownership
    const brandDoc = await db.collection('brands').doc(brandId).get();
    
    if (!brandDoc.exists) {
      throw new HttpsError('not-found', 'Brand not found');
    }
    
    const brand = brandDoc.data();
    
    // Check if user has access to this brand
    if (brand?.ownerId !== request.auth.uid && !brand?.teamMembers?.includes(request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No access to this brand');
    }
    
    // Rate limiting
    const withinLimit = await checkRateLimit(
      request.auth.uid,
      'brand_analytics',
      RATE_LIMITS.BRAND_ANALYTICS_PER_HOUR
    );
    
    if (!withinLimit) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Try again later.');
    }
    
    try {
      // Check for cached metrics
      const cachedDoc = await db
        .collection('analytics_brands')
        .doc(brandId)
        .get();
      
      let metrics: BrandMetrics;
      let campaigns;
      
      if (cachedDoc.exists) {
        const cached = cachedDoc.data();
        
        // If specific campaign requested
        if (campaignId) {
          const campaign = cached?.campaigns?.find((c: any) => c.campaignId === campaignId);
          if (campaign) {
            metrics = campaign.metrics;
          }
        } else {
          metrics = cached?.metrics?.[period];
          campaigns = cached?.campaigns;
        }
      }
      
      // If no cached data, compute from campaign data
      if (!metrics) {
        logger.info('Computing fresh brand metrics', { brandId, period });
        
        // Get all campaigns for this brand
        const campaignsQuery = await db
          .collection('ad_campaigns')
          .where('brandId', '==', brandId)
          .get();
        
        // Aggregate metrics
        metrics = {
          brandId,
          campaignId,
          period,
          totalImpressions: 0,
          totalClicks: 0,
          clickThroughRate: 0,
          totalReach: 0,
          totalConversions: 0,
          conversionRate: 0,
          costPerClick: 0,
          costPerConversion: 0,
          budgetTotal: 0,
          budgetSpent: 0,
          budgetRemaining: 0,
          totalEngagements: 0,
          engagementRate: 0,
          impressionsByRegion: {
            NA: 0,
            EU: 0,
            ASIA: 0,
            SA: 0,
            AFRICA: 0,
            OCEANIA: 0,
            GLOBAL: 0,
          },
          clicksByRegion: {
            NA: 0,
            EU: 0,
            ASIA: 0,
            SA: 0,
            AFRICA: 0,
            OCEANIA: 0,
            GLOBAL: 0,
          },
          topCategories: [],
          updatedAt: Timestamp.now(),
        };
        
        campaignsQuery.forEach(doc => {
          const campaign = doc.data();
          
          // Filter by campaign ID if specified
          if (campaignId && doc.id !== campaignId) return;
          
          metrics.totalImpressions += campaign.impressions || 0;
          metrics.totalClicks += campaign.clicks || 0;
          metrics.totalConversions += campaign.conversions || 0;
          metrics.budgetTotal += campaign.budgetTotal || 0;
          metrics.budgetSpent += campaign.budgetSpent || 0;
        });
        
        // Calculate derived metrics
        metrics.budgetRemaining = metrics.budgetTotal - metrics.budgetSpent;
        metrics.clickThroughRate = metrics.totalImpressions > 0 
          ? (metrics.totalClicks / metrics.totalImpressions) * 100 
          : 0;
        metrics.conversionRate = metrics.totalClicks > 0
          ? (metrics.totalConversions / metrics.totalClicks) * 100
          : 0;
        metrics.costPerClick = metrics.totalClicks > 0
          ? metrics.budgetSpent / metrics.totalClicks
          : 0;
        metrics.costPerConversion = metrics.totalConversions > 0
          ? metrics.budgetSpent / metrics.totalConversions
          : 0;
        metrics.totalReach = Math.floor(metrics.totalImpressions * 0.75);
        
        // Cache results
        await db
          .collection('analytics_brands')
          .doc(brandId)
          .set({
            brandId,
            metrics: { [period]: metrics },
            lastComputedAt: Timestamp.now(),
          }, { merge: true });
      }
      
      // Validate privacy
      const privacy = validatePrivacy(metrics);
      
      if (!privacy.valid) {
        logger.error('Privacy validation failed for brand', { brandId, violations: privacy.violations });
        throw new HttpsError('failed-precondition', 'Privacy validation failed');
      }
      
      const response: GetBrandAnalyticsResponse = {
        metrics,
        ...(campaigns && { campaigns }),
        privacy,
      };
      
      logger.info('Brand analytics retrieved', { brandId, period });
      
      return response;
    } catch (error: any) {
      logger.error('Error getting brand analytics', { brandId, error });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get analytics: ${error.message}`);
    }
  }
);

// ============================================================================
// PLATFORM ANALYTICS API (INTERNAL ONLY)
// ============================================================================

/**
 * Get platform-wide analytics
 * Accessible by: Internal admin/operations team only
 */
export const getPlatformAnalytics = onCall<GetPlatformAnalyticsRequest, Promise<GetPlatformAnalyticsResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { period = 'DAY_30', includeCategories = false, includeRegions = false } = request.data;
    
    // Verify admin access
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData?.roles?.includes('ADMIN') && !userData?.roles?.includes('OPERATIONS')) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    // Rate limiting
    const withinLimit = await checkRateLimit(
      request.auth.uid,
      'platform_analytics',
      RATE_LIMITS.PLATFORM_ANALYTICS_PER_HOUR
    );
    
    if (!withinLimit) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Try again later.');
    }
    
    try {
      // Check for cached platform metrics
      const cachedDoc = await db
        .collection('analytics_platform')
        .doc('global')
        .get();
      
      let metrics: PlatformMetrics;
      let categoryTrends: CategoryTrend[] = [];
      let regionalInsights;
      
      if (cachedDoc.exists) {
        const cached = cachedDoc.data();
        metrics = cached?.metrics?.[period];
        
        if (includeCategories) {
          categoryTrends = cached?.categoryTrends || [];
        }
        
        if (includeRegions) {
          regionalInsights = cached?.regionalInsights || [];
        }
      }
      
      // If no cached data or too old, compute fresh
      if (!metrics) {
        logger.info('Computing fresh platform metrics', { period });
        
        metrics = await computePlatformMetrics(period);
        
        if (includeCategories) {
          categoryTrends = await computeCategoryTrends(period);
        }
        
        if (includeRegions) {
          regionalInsights = await computeRegionalInsights(period);
        }
        
        // Cache results
        await db
          .collection('analytics_platform')
          .doc('global')
          .set({
            metrics: { [period]: metrics },
            ...(categoryTrends.length > 0 && { categoryTrends }),
            ...(regionalInsights && { regionalInsights }),
            lastComputedAt: Timestamp.now(),
          }, { merge: true });
      }
      
      // Validate privacy
      const privacy = validatePrivacy(metrics);
      
      if (!privacy.valid) {
        logger.error('Privacy validation failed for platform', { violations: privacy.violations });
        throw new HttpsError('failed-precondition', 'Privacy validation failed');
      }
      
      const response: GetPlatformAnalyticsResponse = {
        metrics,
        ...(categoryTrends.length > 0 && { categoryTrends }),
        ...(regionalInsights && { regionalInsights }),
        privacy,
      };
      
      logger.info('Platform analytics retrieved', { period });
      
      return response;
    } catch (error: any) {
      logger.error('Error getting platform analytics', { error });
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get analytics: ${error.message}`);
    }
  }
);

// ============================================================================
// PLATFORM METRICS COMPUTATION (INTERNAL)
// ============================================================================

/**
 * Compute platform-wide metrics
 */
async function computePlatformMetrics(period: AnalyticsPeriod): Promise<PlatformMetrics> {
  // This would aggregate across all users, creators, and transactions
  // For now, return a placeholder structure
  
  const metrics: PlatformMetrics = {
    period,
    totalUsers: 0,
    activeUsers: 0,
    newUsers: 0,
    userGrowthRate: 0,
    totalCreators: 0,
    activeCreators: 0,
    totalCreatorEarnings: 0,
    avgCreatorEarnings: 0,
    totalRevenue: 0,
    revenueGrowth: 0,
    revenueByChannel: {
      CHAT: 0,
      MEDIA_UNLOCK: 0,
      SUBSCRIPTION: 0,
      DIGITAL_PRODUCT: 0,
      EVENT: 0,
      CALL: 0,
      GIFT: 0,
      AI_COMPANION: 0,
    },
    totalPosts: 0,
    totalImpressions: 0,
    totalEngagements: 0,
    avgEngagementRate: 0,
    categoryStats: [],
    usersByRegion: {
      NA: 0,
      EU: 0,
      ASIA: 0,
      SA: 0,
      AFRICA: 0,
      OCEANIA: 0,
      GLOBAL: 0,
    },
    revenueByRegion: {
      NA: 0,
      EU: 0,
      ASIA: 0,
      SA: 0,
      AFRICA: 0,
      OCEANIA: 0,
      GLOBAL: 0,
    },
    nsfwContentVolume: 0,
    nsfwComplianceRate: 0,
    moderationActions: 0,
    totalCalls: 0,
    totalCallMinutes: 0,
    avgCallDuration: 0,
    totalMessages: 0,
    paidMessageCount: 0,
    updatedAt: Timestamp.now(),
  };
  
  // Implementation would aggregate from all collections
  // This is a simplified version
  
  return metrics;
}

/**
 * Compute category trends
 */
async function computeCategoryTrends(period: AnalyticsPeriod): Promise<CategoryTrend[]> {
  // Placeholder for category trend computation
  return [];
}

/**
 * Compute regional insights
 */
async function computeRegionalInsights(period: AnalyticsPeriod): Promise<Array<{
  region: RegionCode;
  activeUsers: number;
  revenue: number;
  growth: number;
}>> {
  // Placeholder for regional insights
  return [];
}