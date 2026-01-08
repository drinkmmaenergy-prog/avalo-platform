/**
 * PACK 119 — Creator Agencies SaaS Panel
 * Analytics Dashboard Engine (AGGREGATED DATA ONLY)
 * 
 * PRIVACY SAFEGUARDS:
 * - NO access to individual buyer identities
 * - NO access to private messages or chat media
 * - Only aggregated metrics (follower counts, earnings totals, engagement rates)
 * - All data is numeric summaries, never personal information
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { AgencyDashboardAnalytics } from './pack119-types';

// ============================================================================
// ANALYTICS COMPUTATION
// ============================================================================

/**
 * Compute aggregated analytics for a creator
 */
async function computeCreatorAnalytics(
  creatorUserId: string,
  period: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LIFETIME'
): Promise<Partial<AgencyDashboardAnalytics>> {
  const now = Date.now();
  let startTime: number;

  switch (period) {
    case 'LAST_7_DAYS':
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case 'LAST_30_DAYS':
      startTime = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case 'LIFETIME':
      startTime = 0;
      break;
  }

  const startTimestamp = Timestamp.fromMillis(startTime);

  // Get follower count (from user profile or creator stats)
  const userDoc = await db.collection('users').doc(creatorUserId).get();
  const followerCount = userDoc.data()?.followerCount || 0;

  // Get earnings from Pack 81 (creator earnings ledger)
  const earningsQuery = await db
    .collection('creator_earnings_ledger')
    .where('creatorUserId', '==', creatorUserId)
    .where('createdAt', '>=', startTimestamp)
    .get();

  let totalEarnings = 0;
  earningsQuery.forEach(doc => {
    const data = doc.data();
    totalEarnings += data.tokensAmount || 0;
  });

  // Get posts count (from feed posts)
  const postsQuery = await db
    .collection('feed_posts')
    .where('userId', '==', creatorUserId)
    .where('createdAt', '>=', startTimestamp)
    .get();

  const postsPublished = postsQuery.size;

  // Calculate engagement metrics (aggregated)
  let totalLikes = 0;
  let totalComments = 0;
  let totalViews = 0;

  postsQuery.forEach(doc => {
    const data = doc.data();
    totalLikes += data.likeCount || 0;
    totalComments += data.commentCount || 0;
    totalViews += data.viewCount || 0;
  });

  const impressions = totalViews;
  const reach = Math.floor(impressions * 0.7); // Estimated unique viewers
  const engagementRate =
    postsPublished > 0
      ? ((totalLikes + totalComments) / (impressions || 1)) * 100
      : 0;

  const avgEngagementPerPost =
    postsPublished > 0 ? (totalLikes + totalComments) / postsPublished : 0;

  // Get portfolio metrics
  const portfolioQuery = await db
    .collection('creator_portfolios')
    .where('creatorUserId', '==', creatorUserId)
    .limit(1)
    .get();

  let portfolioViews = 0;
  if (!portfolioQuery.empty) {
    portfolioViews = portfolioQuery.docs[0].data().views || 0;
  }

  // Calculate growth (compare to previous period)
  let followerGrowth = 0;
  let earningGrowth = 0;

  if (period !== 'LIFETIME') {
    const previousPeriodStart = startTime - (now - startTime);
    const previousPeriodTimestamp = Timestamp.fromMillis(previousPeriodStart);

    // Get previous period earnings
    const previousEarningsQuery = await db
      .collection('creator_earnings_ledger')
      .where('creatorUserId', '==', creatorUserId)
      .where('createdAt', '>=', previousPeriodTimestamp)
      .where('createdAt', '<', startTimestamp)
      .get();

    let previousEarnings = 0;
    previousEarningsQuery.forEach(doc => {
      const data = doc.data();
      previousEarnings += data.tokensAmount || 0;
    });

    earningGrowth =
      previousEarnings > 0
        ? ((totalEarnings - previousEarnings) / previousEarnings) * 100
        : 0;
  }

  const avgEarningsPerDay =
    period !== 'LIFETIME' ? totalEarnings / ((now - startTime) / (24 * 60 * 60 * 1000)) : 0;

  return {
    followerCount,
    followerGrowth: Math.round(followerGrowth * 100) / 100,
    reach,
    impressions,
    engagementRate: Math.round(engagementRate * 100) / 100,
    totalEarnings,
    earningGrowth: Math.round(earningGrowth * 100) / 100,
    avgEarningsPerDay: Math.round(avgEarningsPerDay * 100) / 100,
    postsPublished,
    avgEngagementPerPost: Math.round(avgEngagementPerPost * 100) / 100,
    portfolioViews,
    portfolioClicks: 0, // Would be tracked separately
  };
}

// ============================================================================
// CLIENT ENDPOINTS
// ============================================================================

/**
 * Get agency dashboard for a creator
 */
export const getAgencyDashboard = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ analytics: Record<string, AgencyDashboardAnalytics> }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, creatorUserId } = request.data;

    if (!agencyId || !creatorUserId) {
      throw new HttpsError('invalid-argument', 'Agency ID and Creator ID required');
    }

    try {
      // Verify caller is from this agency
      const memberDoc = await db
        .collection('agency_team_members')
        .doc(`${agencyId}_${request.auth.uid}`)
        .get();

      if (!memberDoc.exists || memberDoc.data()?.status !== 'ACTIVE') {
        throw new HttpsError('permission-denied', 'Not authorized for this agency');
      }

      const member = memberDoc.data();
      
      // Must have VIEWER+ role
      if (member?.role !== 'OWNER' && member?.role !== 'MANAGER' && 
          member?.role !== 'EDITOR' && member?.role !== 'VIEWER') {
        throw new HttpsError('permission-denied', 'Insufficient permissions');
      }

      // Verify creator is linked to agency
      const linkQuery = await db
        .collection('creator_agency_links')
        .where('agencyId', '==', agencyId)
        .where('creatorUserId', '==', creatorUserId)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      if (linkQuery.empty) {
        throw new HttpsError('not-found', 'Creator not linked to this agency');
      }

      // Compute analytics for all periods
      const periods: Array<'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LIFETIME'> = [
        'LAST_7_DAYS',
        'LAST_30_DAYS',
        'LIFETIME',
      ];

      const analytics: Record<string, AgencyDashboardAnalytics> = {};

      for (const period of periods) {
        const data = await computeCreatorAnalytics(creatorUserId, period);

        analytics[period] = {
          agencyId,
          creatorUserId,
          period,
          ...data,
          calculatedAt: Timestamp.now(),
        } as AgencyDashboardAnalytics;
      }

      logger.info('Agency dashboard generated', { agencyId, creatorUserId });

      return { analytics };
    } catch (error: any) {
      logger.error('Error getting agency dashboard', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get aggregated analytics for all creators in agency
 */
export const getAgencyOverview = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    totalCreators: number;
    totalEarnings: number;
    totalFollowers: number;
    avgEngagement: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    try {
      // Verify caller is from this agency
      const memberDoc = await db
        .collection('agency_team_members')
        .doc(`${agencyId}_${request.auth.uid}`)
        .get();

      if (!memberDoc.exists || memberDoc.data()?.status !== 'ACTIVE') {
        throw new HttpsError('permission-denied', 'Not authorized for this agency');
      }

      // Get all linked creators
      const linksQuery = await db
        .collection('creator_agency_links')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'ACTIVE')
        .get();

      const totalCreators = linksQuery.size;
      let totalEarnings = 0;
      let totalFollowers = 0;
      let totalEngagement = 0;
      let engagementCount = 0;

      // Aggregate metrics across all creators
      for (const linkDoc of linksQuery.docs) {
        const link = linkDoc.data();
        const creatorUserId = link.creatorUserId;

        // Get recent analytics (last 30 days)
        const analyticsQuery = await db
          .collection('agency_dashboard_analytics')
          .where('agencyId', '==', agencyId)
          .where('creatorUserId', '==', creatorUserId)
          .where('period', '==', 'LAST_30_DAYS')
          .limit(1)
          .get();

        if (!analyticsQuery.empty) {
          const analytics = analyticsQuery.docs[0].data() as AgencyDashboardAnalytics;
          totalEarnings += analytics.totalEarnings || 0;
          totalFollowers += analytics.followerCount || 0;
          totalEngagement += analytics.engagementRate || 0;
          engagementCount++;
        }
      }

      const avgEngagement = engagementCount > 0 ? totalEngagement / engagementCount : 0;

      return {
        totalCreators,
        totalEarnings: Math.round(totalEarnings),
        totalFollowers,
        avgEngagement: Math.round(avgEngagement * 100) / 100,
      };
    } catch (error: any) {
      logger.error('Error getting agency overview', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily analytics aggregation for all active agency-creator links
 * Runs at 5 AM UTC daily
 */
export const dailyAnalyticsAggregation = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async (event) => {
    logger.info('Starting daily analytics aggregation for agencies');

    try {
      // Get all active creator-agency links
      const linksSnapshot = await db
        .collection('creator_agency_links')
        .where('status', '==', 'ACTIVE')
        .get();

      let processedCount = 0;
      let errorCount = 0;

      // Process in batches of 10
      const batchSize = 10;
      const links = linksSnapshot.docs;

      for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (linkDoc) => {
            try {
              const link = linkDoc.data();
              const { agencyId, creatorUserId } = link;

              // Compute analytics for all periods
              const periods: Array<'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LIFETIME'> = [
                'LAST_7_DAYS',
                'LAST_30_DAYS',
                'LIFETIME',
              ];

              for (const period of periods) {
                const data = await computeCreatorAnalytics(creatorUserId, period);

                const analytics: AgencyDashboardAnalytics = {
                  agencyId,
                  creatorUserId,
                  period,
                  ...data,
                  calculatedAt: Timestamp.now(),
                } as AgencyDashboardAnalytics;

                // Store analytics
                const analyticsId = `${agencyId}_${creatorUserId}_${period}`;
                await db
                  .collection('agency_dashboard_analytics')
                  .doc(analyticsId)
                  .set(analytics, { merge: true });
              }

              processedCount++;
            } catch (error) {
              logger.error('Error processing analytics for link', { linkId: linkDoc.id, error });
              errorCount++;
            }
          })
        );
      }

      logger.info('Daily analytics aggregation completed', {
        totalLinks: links.length,
        processedCount,
        errorCount,
      });

      logger.info('Aggregation summary', { success: true, processedCount, errorCount });
    } catch (error: any) {
      logger.error('Error in daily analytics aggregation', error);
      throw error;
    }
  }
);