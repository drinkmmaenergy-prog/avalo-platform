/**
 * PACK 132 — Avalo Global Analytics Cloud
 * Core Analytics Engine
 * 
 * PRIVACY-FIRST PRINCIPLES:
 * - All data is aggregated and anonymized
 * - No personal identifiers or buyer lists
 * - No access to DM content or chat behavior
 * - Regional-level only (no personal location)
 * - No algorithmic manipulation based on insights
 */

import { db, serverTimestamp } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  AnalyticsPeriod,
  CreatorMetrics,
  BrandMetrics,
  PlatformMetrics,
  ContentHeatmap,
  PredictiveInsight,
  CategoryTrend,
  RegionCode,
  MonetizationChannel,
  ContentType,
  DayOfWeek,
  PrivacyValidationResult,
  AnalyticsErrorCode,
} from './pack132-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANALYTICS_CONFIG = {
  DAILY_COMPUTE_HOUR: 3, // 3 AM UTC
  WEEKLY_COMPUTE_DAY: 1, // Monday
  MONTHLY_COMPUTE_DAY: 1, // 1st of month
  MIN_DATA_POINTS: 10, // Minimum data points for predictions
  CONFIDENCE_THRESHOLD: 70, // Minimum confidence for insights
  HEATMAP_RESOLUTION_HOURS: 1,
  MAX_INSIGHTS_PER_CREATOR: 5,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get date range for analytics period
 */
function getPeriodDateRange(period: AnalyticsPeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
    case 'DAY_1':
      start.setDate(start.getDate() - 1);
      break;
    case 'DAY_7':
      start.setDate(start.getDate() - 7);
      break;
    case 'DAY_30':
      start.setDate(start.getDate() - 30);
      break;
    case 'DAY_90':
      start.setDate(start.getDate() - 90);
      break;
    case 'LIFETIME':
      start.setTime(0); // Beginning of time
      break;
  }
  
  return { start, end };
}

/**
 * Map region from country code (aggregated)
 */
function getRegionFromCountry(countryCode: string): RegionCode {
  const regionMap: Record<string, RegionCode> = {
    US: 'NA', CA: 'NA', MX: 'NA',
    GB: 'EU', DE: 'EU', FR: 'EU', IT: 'EU', ES: 'EU', PL: 'EU',
    CN: 'ASIA', JP: 'ASIA', KR: 'ASIA', IN: 'ASIA', SG: 'ASIA',
    BR: 'SA', AR: 'SA', CL: 'SA',
    ZA: 'AFRICA', NG: 'AFRICA', KE: 'AFRICA',
    AU: 'OCEANIA', NZ: 'OCEANIA',
  };
  
  return regionMap[countryCode] || 'GLOBAL';
}

/**
 * Calculate percentage growth
 */
function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Get day of week from date
 */
function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ];
  return days[date.getDay()];
}

// ============================================================================
// PRIVACY VALIDATION
// ============================================================================

/**
 * Validate that analytics data is privacy-compliant
 */
export function validatePrivacy(data: any): PrivacyValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  
  // Check for personal identifiers
  const personalFields = ['email', 'phone', 'userId', 'buyerId', 'fanId', 'fullName', 'address'];
  const hasPersonalData = personalFields.some(field => field in data);
  if (hasPersonalData) {
    violations.push('Personal identifiers found in analytics data');
  }
  
  // Check for DM content
  if ('messageContent' in data || 'chatHistory' in data || 'dmContent' in data) {
    violations.push('DM content found in analytics data');
  }
  
  // Check for specific location data
  if ('latitude' in data || 'longitude' in data || 'exactLocation' in data) {
    violations.push('Precise location data found in analytics data');
  }
  
  // Check for identity arrays
  if ('buyerList' in data || 'fanList' in data || 'spenderIds' in data) {
    violations.push('Identity lists found in analytics data');
  }
  
  // Verify aggregation
  const isAggregated = typeof data === 'object' && 
    !Array.isArray(data.userIds) &&
    !Array.isArray(data.identities);
  
  if (!isAggregated) {
    warnings.push('Data may not be properly aggregated');
  }
  
  return {
    valid: violations.length === 0,
    violations,
    warnings,
    hasPersonalData,
    hasIdentities: 'userId' in data || 'buyerId' in data,
    hasDMContent: 'messageContent' in data || 'chatHistory' in data,
    hasPersonalLocation: 'latitude' in data || 'longitude' in data,
    isAggregated,
    timestamp: Timestamp.now(),
  };
}

// ============================================================================
// CREATOR ANALYTICS AGGREGATION
// ============================================================================

/**
 * Compute creator metrics for a specific period
 */
export async function computeCreatorMetrics(
  creatorId: string,
  period: AnalyticsPeriod
): Promise<CreatorMetrics> {
  const { start, end } = getPeriodDateRange(period);
  const startTimestamp = Timestamp.fromDate(start);
  const endTimestamp = Timestamp.fromDate(end);
  
  // Initialize metrics
  const metrics: CreatorMetrics = {
    creatorId,
    period,
    totalFollowers: 0,
    followerGrowth: 0,
    totalProfileViews: 0,
    profileViewGrowth: 0,
    totalPosts: 0,
    totalImpressions: 0,
    totalReach: 0,
    avgWatchTime: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalSaves: 0,
    engagementRate: 0,
    totalRevenue: 0,
    revenueGrowth: 0,
    totalPurchases: 0,
    avgPurchaseValue: 0,
    conversionRate: 0,
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
    digitalProductSales: 0,
    subscriptionCount: 0,
    subscriptionChurnRate: 0,
    callMinutesTotal: 0,
    callConversionRate: 0,
    mediaUnlockCount: 0,
    mediaUnlockRate: 0,
    retentionDay1: 0,
    retentionDay7: 0,
    retentionDay30: 0,
    updatedAt: Timestamp.now(),
  };
  
  try {
    // Get user profile data
    const userDoc = await db.collection('users').doc(creatorId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      metrics.totalFollowers = userData?.followerCount || 0;
      metrics.totalProfileViews = userData?.profileViews || 0;
    }
    
    // Get posts and engagement
    const postsQuery = await db
      .collection('feed_posts')
      .where('userId', '==', creatorId)
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get();
    
    metrics.totalPosts = postsQuery.size;
    
    postsQuery.forEach(doc => {
      const post = doc.data();
      metrics.totalLikes += post.likeCount || 0;
      metrics.totalComments += post.commentCount || 0;
      metrics.totalShares += post.shareCount || 0;
      metrics.totalSaves += post.saveCount || 0;
      metrics.totalImpressions += post.viewCount || 0;
    });
    
    // Estimate reach (unique viewers - approximated as 70% of impressions)
    metrics.totalReach = Math.floor(metrics.totalImpressions * 0.7);
    
    // Calculate engagement rate
    if (metrics.totalImpressions > 0) {
      const totalEngagements = metrics.totalLikes + metrics.totalComments + metrics.totalShares;
      metrics.engagementRate = (totalEngagements / metrics.totalImpressions) * 100;
    }
    
    // Get earnings from ledger (AGGREGATED ONLY)
    const earningsQuery = await db
      .collection('earnings_ledger')
      .where('creatorId', '==', creatorId)
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get();
    
    earningsQuery.forEach(doc => {
      const earning = doc.data();
      const netTokens = earning.netTokensCreator || 0;
      metrics.totalRevenue += netTokens;
      metrics.totalPurchases += 1;
      
      // Channel breakdown
      const sourceType = earning.sourceType as string;
      if (sourceType === 'GIFT') {
        metrics.revenueByChannel.GIFT += netTokens;
      } else if (sourceType === 'PAID_MEDIA') {
        metrics.revenueByChannel.MEDIA_UNLOCK += netTokens;
        metrics.mediaUnlockCount += 1;
      } else if (sourceType === 'PAID_CALL') {
        metrics.revenueByChannel.CALL += netTokens;
      } else if (sourceType === 'AI_COMPANION') {
        metrics.revenueByChannel.AI_COMPANION += netTokens;
      }
    });
    
    // Calculate average purchase value
    if (metrics.totalPurchases > 0) {
      metrics.avgPurchaseValue = metrics.totalRevenue / metrics.totalPurchases;
    }
    
    // Get subscription data
    const subsQuery = await db
      .collection('creator_subscriptions')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'ACTIVE')
      .get();
    
    metrics.subscriptionCount = subsQuery.size;
    
    // Get digital product sales
    const productsQuery = await db
      .collection('digital_product_purchases')
      .where('creatorId', '==', creatorId)
      .where('purchasedAt', '>=', startTimestamp)
      .where('purchasedAt', '<=', endTimestamp)
      .get();
    
    metrics.digitalProductSales = productsQuery.size;
    productsQuery.forEach(doc => {
      const purchase = doc.data();
      metrics.revenueByChannel.DIGITAL_PRODUCT += purchase.priceTokens || 0;
    });
    
    // Get call statistics
    const callsQuery = await db
      .collection('call_sessions')
      .where('creatorId', '==', creatorId)
      .where('startedAt', '>=', startTimestamp)
      .where('startedAt', '<=', endTimestamp)
      .get();
    
    callsQuery.forEach(doc => {
      const call = doc.data();
      const duration = call.durationSeconds || 0;
      metrics.callMinutesTotal += Math.floor(duration / 60);
    });
    
    // Calculate growth if not lifetime
    if (period !== 'LIFETIME') {
      const previousPeriod = await getPreviousPeriodMetrics(creatorId, period);
      if (previousPeriod) {
        metrics.followerGrowth = calculateGrowth(metrics.totalFollowers, previousPeriod.totalFollowers);
        metrics.revenueGrowth = calculateGrowth(metrics.totalRevenue, previousPeriod.totalRevenue);
        metrics.profileViewGrowth = calculateGrowth(metrics.totalProfileViews, previousPeriod.totalProfileViews);
      }
    }
    
    // Calculate retention (if we have cohort data)
    const retentionData = await calculateRetentionCohorts(creatorId, start, end);
    metrics.retentionDay1 = retentionData.day1;
    metrics.retentionDay7 = retentionData.day7;
    metrics.retentionDay30 = retentionData.day30;
    
  } catch (error) {
    logger.error('Error computing creator metrics', { creatorId, period, error });
    throw error;
  }
  
  return metrics;
}

/**
 * Get previous period metrics for growth calculation
 */
async function getPreviousPeriodMetrics(
  creatorId: string,
  currentPeriod: AnalyticsPeriod
): Promise<CreatorMetrics | null> {
  try {
    // Map to previous period
    const periodMap: Record<AnalyticsPeriod, AnalyticsPeriod | null> = {
      DAY_1: null, // No previous for 1 day
      DAY_7: 'DAY_7',
      DAY_30: 'DAY_30',
      DAY_90: 'DAY_90',
      LIFETIME: null,
    };
    
    const previousPeriod = periodMap[currentPeriod];
    if (!previousPeriod) return null;
    
    // Get cached metrics from previous computation
    const doc = await db
      .collection('analytics_creators')
      .doc(creatorId)
      .get();
    
    if (doc.exists) {
      const data = doc.data() as any;
      return data.metrics?.[previousPeriod] || null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate retention cohorts (aggregated)
 */
async function calculateRetentionCohorts(
  creatorId: string,
  start: Date,
  end: Date
): Promise<{ day1: number; day7: number; day30: number }> {
  try {
    const startTimestamp = Timestamp.fromDate(start);
    
    // Get new followers in period
    const followersQuery = await db
      .collection('user_follows')
      .where('followingId', '==', creatorId)
      .where('createdAt', '>=', startTimestamp)
      .get();
    
    if (followersQuery.empty) {
      return { day1: 0, day7: 0, day30: 0 };
    }
    
    const totalNewFollowers = followersQuery.size;
    let activeDay1 = 0;
    let activeDay7 = 0;
    let activeDay30 = 0;
    
    // For each follower, check if they had activity after following
    // NOTE: This is expensive - in production, this would be pre-computed
    for (const followDoc of followersQuery.docs) {
      const follow = followDoc.data();
      const followerId = follow.userId;
      const followDate = follow.createdAt.toDate();
      
      // Check activity in next days (any engagement)
      const day1Date = new Date(followDate);
      day1Date.setDate(day1Date.getDate() + 1);
      
      const day7Date = new Date(followDate);
      day7Date.setDate(day7Date.getDate() + 7);
      
      const day30Date = new Date(followDate);
      day30Date.setDate(day30Date.getDate() + 30);
      
      // Check if user had ANY activity (simplified - check likes as proxy)
      const activity1 = await db
        .collection('post_likes')
        .where('userId', '==', followerId)
        .where('createdAt', '>=', Timestamp.fromDate(followDate))
        .where('createdAt', '<=', Timestamp.fromDate(day1Date))
        .limit(1)
        .get();
      
      if (!activity1.empty) activeDay1++;
      
      const activity7 = await db
        .collection('post_likes')
        .where('userId', '==', followerId)
        .where('createdAt', '>=', Timestamp.fromDate(followDate))
        .where('createdAt', '<=', Timestamp.fromDate(day7Date))
        .limit(1)
        .get();
      
      if (!activity7.empty) activeDay7++;
      
      const activity30 = await db
        .collection('post_likes')
        .where('userId', '==', followerId)
        .where('createdAt', '>=', Timestamp.fromDate(followDate))
        .where('createdAt', '<=', Timestamp.fromDate(day30Date))
        .limit(1)
        .get();
      
      if (!activity30.empty) activeDay30++;
    }
    
    return {
      day1: (activeDay1 / totalNewFollowers) * 100,
      day7: (activeDay7 / totalNewFollowers) * 100,
      day30: (activeDay30 / totalNewFollowers) * 100,
    };
  } catch (error) {
    logger.error('Error calculating retention cohorts', error);
    return { day1: 0, day7: 0, day30: 0 };
  }
}

// ============================================================================
// CONTENT HEATMAP GENERATION
// ============================================================================

/**
 * Generate content performance heatmap for creator
 */
export async function generateContentHeatmap(
  creatorId: string,
  period: AnalyticsPeriod
): Promise<ContentHeatmap> {
  const { start, end } = getPeriodDateRange(period);
  const startTimestamp = Timestamp.fromDate(start);
  const endTimestamp = Timestamp.fromDate(end);
  
  const heatmap: ContentHeatmap = {
    creatorId,
    period,
    bestHours: [],
    bestDays: [],
    performanceByType: {
      POST: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      STORY: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      REEL: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      PREMIUM_MEDIA: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      DIGITAL_PRODUCT: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      EVENT: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      CALL: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
      SUBSCRIPTION: { avgEngagement: 0, avgReach: 0, conversionRate: 0 },
    },
    retentionAfterPost: 0,
    retentionAfterMessage: 0,
    updatedAt: Timestamp.now(),
  };
  
  try {
    // Get all posts in period with their performance
    const postsQuery = await db
      .collection('feed_posts')
      .where('userId', '==', creatorId)
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get();
    
    // Aggregate by hour
    const hourlyPerformance = new Map<number, { engagement: number; reach: number; count: number }>();
    
    // Aggregate by day
    const dailyPerformance = new Map<DayOfWeek, { engagement: number; reach: number; count: number }>();
    
    // Aggregate by type
    const typePerformance = new Map<ContentType, { engagement: number; reach: number; count: number }>();
    
    postsQuery.forEach(doc => {
      const post = doc.data();
      const createdAt = post.createdAt.toDate();
      const hour = createdAt.getHours();
      const day = getDayOfWeek(createdAt);
      const type = (post.type || 'POST') as ContentType;
      
      const engagement = (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0);
      const reach = post.viewCount || 0;
      
      // Aggregate by hour
      const hourData = hourlyPerformance.get(hour) || { engagement: 0, reach: 0, count: 0 };
      hourData.engagement += engagement;
      hourData.reach += reach;
      hourData.count += 1;
      hourlyPerformance.set(hour, hourData);
      
      // Aggregate by day
      const dayData = dailyPerformance.get(day) || { engagement: 0, reach: 0, count: 0 };
      dayData.engagement += engagement;
      dayData.reach += reach;
      dayData.count += 1;
      dailyPerformance.set(day, dayData);
      
      // Aggregate by type
      const typeData = typePerformance.get(type) || { engagement: 0, reach: 0, count: 0 };
      typeData.engagement += engagement;
      typeData.reach += reach;
      typeData.count += 1;
      typePerformance.set(type, typeData);
    });
    
    // Convert to arrays and calculate averages
    for (const [hour, data] of Array.from(hourlyPerformance.entries())) {
      heatmap.bestHours.push({
        hour,
        avgEngagement: data.count > 0 ? data.engagement / data.count : 0,
        avgReach: data.count > 0 ? data.reach / data.count : 0,
        confidence: Math.min(100, (data.count / ANALYTICS_CONFIG.MIN_DATA_POINTS) * 100),
      });
    }
    
    // Sort by engagement
    heatmap.bestHours.sort((a, b) => b.avgEngagement - a.avgEngagement);
    
    for (const [day, data] of Array.from(dailyPerformance.entries())) {
      heatmap.bestDays.push({
        day,
        avgEngagement: data.count > 0 ? data.engagement / data.count : 0,
        avgReach: data.count > 0 ? data.reach / data.count : 0,
        confidence: Math.min(100, (data.count / ANALYTICS_CONFIG.MIN_DATA_POINTS) * 100),
      });
    }
    
    // Sort by engagement
    heatmap.bestDays.sort((a, b) => b.avgEngagement - a.avgEngagement);
    
    for (const [type, data] of Array.from(typePerformance.entries())) {
      heatmap.performanceByType[type] = {
        avgEngagement: data.count > 0 ? data.engagement / data.count : 0,
        avgReach: data.count > 0 ? data.reach / data.count : 0,
        conversionRate: 0, // Would need additional data to calculate
      };
    }
    
  } catch (error) {
    logger.error('Error generating content heatmap', { creatorId, period, error });
  }
  
  return heatmap;
}

// ============================================================================
// PREDICTIVE INSIGHTS GENERATION
// ============================================================================

/**
 * Generate predictive insights for creator
 */
export async function generatePredictiveInsights(
  creatorId: string
): Promise<PredictiveInsight[]> {
  const insights: PredictiveInsight[] = [];
  
  try {
    // Get heatmap for last 30 days
    const heatmap = await generateContentHeatmap(creatorId, 'DAY_30');
    
    // Insight 1: Best posting times
    if (heatmap.bestHours.length >= 3) {
      const topHours = heatmap.bestHours.slice(0, 3);
      const avgConfidence = topHours.reduce((sum, h) => sum + h.confidence, 0) / 3;
      
      if (avgConfidence >= ANALYTICS_CONFIG.CONFIDENCE_THRESHOLD) {
        const hoursStr = topHours.map(h => `${h.hour}:00`).join(', ');
        
        insights.push({
          id: `${creatorId}_best_hours_${Date.now()}`,
          targetId: creatorId,
          targetType: 'CREATOR',
          insightType: 'BEST_TIME',
          title: 'Optimal Posting Hours',
          description: `Your content performs ${Math.round(topHours[0].avgEngagement)}% better when posted at ${hoursStr}`,
          confidence: Math.round(avgConfidence),
          dataPoints: heatmap.bestHours.length,
          period: 'DAY_30',
          recommendations: [
            {
              action: `Schedule posts for ${topHours[0].hour}:00`,
              expectedImpact: `+${Math.round((topHours[0].avgEngagement / topHours[topHours.length - 1].avgEngagement - 1) * 100)}% engagement`,
              confidence: Math.round(topHours[0].confidence),
            },
          ],
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
      }
    }
    
    // Insight 2: Best posting days
    if (heatmap.bestDays.length >= 2) {
      const topDays = heatmap.bestDays.slice(0, 2);
      const avgConfidence = topDays.reduce((sum, d) => sum + d.confidence, 0) / 2;
      
      if (avgConfidence >= ANALYTICS_CONFIG.CONFIDENCE_THRESHOLD) {
        insights.push({
          id: `${creatorId}_best_days_${Date.now()}`,
          targetId: creatorId,
          targetType: 'CREATOR',
          insightType: 'BEST_TIME',
          title: 'Peak Performance Days',
          description: `Posts on ${topDays.map(d => d.day).join(' and ')} get ${Math.round(topDays[0].avgReach)} average reach`,
          confidence: Math.round(avgConfidence),
          dataPoints: heatmap.bestDays.length,
          period: 'DAY_30',
          recommendations: [
            {
              action: `Focus posting on ${topDays[0].day}`,
              expectedImpact: 'Maximize weekly reach',
              confidence: Math.round(topDays[0].confidence),
            },
          ],
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
    
    // Insight 3: Content type performance
    const typeEntries = Object.entries(heatmap.performanceByType)
      .filter(([_, data]) => data.avgEngagement > 0)
      .sort(([_, a], [__, b]) => b.avgEngagement - a.avgEngagement);
    
    if (typeEntries.length >= 2) {
      const [topType, topData] = typeEntries[0];
      
      insights.push({
        id: `${creatorId}_content_type_${Date.now()}`,
        targetId: creatorId,
        targetType: 'CREATOR',
        insightType: 'CONTENT_TYPE',
        title: `${topType} Content Performs Best`,
        description: `Your ${topType} content gets ${Math.round(topData.avgEngagement)}% more engagement than average`,
        confidence: 85,
        dataPoints: typeEntries.length,
        period: 'DAY_30',
        recommendations: [
          {
            action: `Increase ${topType} content frequency`,
            expectedImpact: 'Boost overall engagement',
            confidence: 85,
          },
        ],
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });
    }
    
    // Get creator metrics for revenue insights
    const metrics = await computeCreatorMetrics(creatorId, 'DAY_30');
    
    // Insight 4: Monetization opportunity
    if (metrics.totalFollowers >= 1000 && metrics.totalRevenue === 0) {
      insights.push({
        id: `${creatorId}_monetization_${Date.now()}`,
        targetId: creatorId,
        targetType: 'CREATOR',
        insightType: 'GROWTH_OPPORTUNITY',
        title: 'Monetization Ready',
        description: `With ${metrics.totalFollowers} followers and ${metrics.engagementRate.toFixed(1)}% engagement, you're ready to monetize`,
        confidence: 90,
        dataPoints: 30,
        period: 'DAY_30',
        recommendations: [
          {
            action: 'Enable paid subscriptions',
            expectedImpact: 'Start earning from engaged followers',
            confidence: 90,
          },
          {
            action: 'Offer exclusive content',
            expectedImpact: 'Convert top fans to paying supporters',
            confidence: 85,
          },
        ],
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }
    
    // Insight 5: Revenue trend
    if (metrics.revenueGrowth > 20) {
      insights.push({
        id: `${creatorId}_revenue_trend_${Date.now()}`,
        targetId: creatorId,
        targetType: 'CREATOR',
        insightType: 'GROWTH_OPPORTUNITY',
        title: 'Strong Revenue Growth',
        description: `Your earnings grew ${metrics.revenueGrowth.toFixed(1)}% this period - momentum is building`,
        confidence: 95,
        dataPoints: 30,
        period: 'DAY_30',
        recommendations: [
          {
            action: 'Maintain posting consistency',
            expectedImpact: 'Sustain growth trajectory',
            confidence: 95,
          },
        ],
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }
    
  } catch (error) {
    logger.error('Error generating predictive insights', { creatorId, error });
  }
  
  // Limit to max insights
  return insights.slice(0, ANALYTICS_CONFIG.MAX_INSIGHTS_PER_CREATOR);
}

// ============================================================================
// SCHEDULED COMPUTATION TASKS
// ============================================================================

/**
 * Compute daily metrics for all active creators
 * Runs at 3 AM UTC daily
 */
export const computeDailyMetrics = onSchedule(
  {
    schedule: `0 ${ANALYTICS_CONFIG.DAILY_COMPUTE_HOUR} * * *`,
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '2GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info('Starting daily metrics computation');
    
    try {
      // Get all creators with recent activity (last 90 days)
      const ninetydaysAgo = Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      const activeCreatorsQuery = await db
        .collection('earnings_ledger')
        .where('createdAt', '>=', ninetydaysAgo)
        .select('creatorId')
        .get();
      
      const creatorIds = new Set<string>();
      activeCreatorsQuery.forEach(doc => {
        const creatorId = doc.data().creatorId;
        if (creatorId) creatorIds.add(creatorId);
      });
      
      logger.info(`Computing daily metrics for ${creatorIds.size} creators`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Process in batches
      const batchSize = 10;
      const creators = Array.from(creatorIds);
      
      for (let i = 0; i < creators.length; i += batchSize) {
        const batch = creators.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (creatorId) => {
            try {
              // Compute metrics for DAY_1 and DAY_7
              const metricsDay1 = await computeCreatorMetrics(creatorId, 'DAY_1');
              const metricsDay7 = await computeCreatorMetrics(creatorId, 'DAY_7');
              
              // Update materialized view
              await db
                .collection('analytics_creators')
                .doc(creatorId)
                .set({
                  creatorId,
                  metrics: {
                    DAY_1: metricsDay1,
                    DAY_7: metricsDay7,
                  },
                  lastComputedAt: Timestamp.now(),
                  nextComputeAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
                }, { merge: true });
              
              processedCount++;
            } catch (error) {
              logger.error('Error computing metrics for creator', { creatorId, error });
              errorCount++;
            }
          })
        );
      }
      
      logger.info('Daily metrics computation completed', {
        totalCreators: creators.length,
        processedCount,
        errorCount,
      });
      
    } catch (error) {
      logger.error('Error in daily metrics computation', error);
      throw error;
    }
  }
);

/**
 * Compute weekly metrics (DAY_30)
 * Runs every Monday at 3 AM UTC
 */
export const computeWeeklyMetrics = onSchedule(
  {
    schedule: `0 ${ANALYTICS_CONFIG.DAILY_COMPUTE_HOUR} * * ${ANALYTICS_CONFIG.WEEKLY_COMPUTE_DAY}`,
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '2GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info('Starting weekly metrics computation');
    
    try {
      // Get all active creators
      const activeCreatorsQuery = await db
        .collection('analytics_creators')
        .get();
      
      let processedCount = 0;
      let errorCount = 0;
      
      const batchSize = 10;
      const creators = activeCreatorsQuery.docs;
      
      for (let i = 0; i < creators.length; i += batchSize) {
        const batch = creators.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (doc) => {
            const creatorId = doc.id;
            
            try {
              // Compute 30-day metrics
              const metricsDay30 = await computeCreatorMetrics(creatorId, 'DAY_30');
              
              // Generate heatmap
              const heatmap = await generateContentHeatmap(creatorId, 'DAY_30');
              
              // Generate insights
              const insights = await generatePredictiveInsights(creatorId);
              
              // Update materialized view
              await db
                .collection('analytics_creators')
                .doc(creatorId)
                .set({
                  metrics: {
                    DAY_30: metricsDay30,
                  },
                  heatmaps: {
                    DAY_30: heatmap,
                  },
                  insights,
                  lastComputedAt: Timestamp.now(),
                }, { merge: true });
              
              processedCount++;
            } catch (error) {
              logger.error('Error computing weekly metrics for creator', { creatorId, error });
              errorCount++;
            }
          })
        );
      }
      
      logger.info('Weekly metrics computation completed', {
        totalCreators: creators.length,
        processedCount,
        errorCount,
      });
      
    } catch (error) {
      logger.error('Error in weekly metrics computation', error);
      throw error;
    }
  }
);

/**
 * Compute monthly metrics (DAY_90, LIFETIME)
 * Runs on 1st of each month at 3 AM UTC
 */
export const computeMonthlyMetrics = onSchedule(
  {
    schedule: `0 ${ANALYTICS_CONFIG.DAILY_COMPUTE_HOUR} ${ANALYTICS_CONFIG.MONTHLY_COMPUTE_DAY} * *`,
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '4GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info('Starting monthly metrics computation');
    
    try {
      const activeCreatorsQuery = await db
        .collection('analytics_creators')
        .get();
      
      let processedCount = 0;
      let errorCount = 0;
      
      const batchSize = 5; // Smaller batch for intensive computation
      const creators = activeCreatorsQuery.docs;
      
      for (let i = 0; i < creators.length; i += batchSize) {
        const batch = creators.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (doc) => {
            const creatorId = doc.id;
            
            try {
              // Compute 90-day and lifetime metrics
              const metricsDay90 = await computeCreatorMetrics(creatorId, 'DAY_90');
              const metricsLifetime = await computeCreatorMetrics(creatorId, 'LIFETIME');
              
              // Generate heatmaps
              const heatmapDay90 = await generateContentHeatmap(creatorId, 'DAY_90');
              
              // Update materialized view
              await db
                .collection('analytics_creators')
                .doc(creatorId)
                .set({
                  metrics: {
                    DAY_90: metricsDay90,
                    LIFETIME: metricsLifetime,
                  },
                  heatmaps: {
                    DAY_90: heatmapDay90,
                  },
                  lastComputedAt: Timestamp.now(),
                }, { merge: true });
              
              processedCount++;
            } catch (error) {
              logger.error('Error computing monthly metrics for creator', { creatorId, error });
              errorCount++;
            }
          })
        );
      }
      
      logger.info('Monthly metrics computation completed', {
        totalCreators: creators.length,
        processedCount,
        errorCount,
      });
      
    } catch (error) {
      logger.error('Error in monthly metrics computation', error);
      throw error;
    }
  }
);