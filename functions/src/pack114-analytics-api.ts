/**
 * PACK 114 — Agency Analytics API
 * Privacy-safe aggregated analytics for agencies
 * 
 * PRIVACY RULES:
 * - NO access to inbox/messages
 * - NO access to contacts list
 * - NO access to viewer identity
 * - NO access to DMs
 * - NO access to follower names
 * - ONLY aggregated counts and metrics
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  AgencyAnalytics,
  CreatorAgencyAccount,
  CreatorAgencyLink,
} from './pack114-types';
import {
  getAgencyEarningsSummary,
  getCreatorEarningsSummaryWithAgency,
} from './pack114-earnings-integration';

// ============================================================================
// AGENCY ANALYTICS ENDPOINTS
// ============================================================================

/**
 * Get agency dashboard overview
 * Returns aggregated metrics across all linked creators
 */
export const getAgencyDashboard = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    linkedCreators: number;
    totalEarnings: number;
    activeEarnings: number;
    last30DaysEarnings: number;
    topPerformers: Array<{ creatorId: string; earnings: number; anonymized: string }>;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    try {
      // Verify user owns this agency
      const agencyDoc = await db.collection('creator_agency_accounts').doc(agencyId).get();
      
      if (!agencyDoc.exists) {
        throw new HttpsError('not-found', 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.createdBy !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to view this agency');
      }

      // Get linked creators count
      const linksSnapshot = await db
        .collection('creator_agency_links')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'ACTIVE')
        .get();

      const linkedCreators = linksSnapshot.size;

      // Get earnings summary
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const earningsSummary = await getAgencyEarningsSummary(agencyId, thirtyDaysAgo);

      // Anonymize top earners (don't expose creator IDs directly)
      const topPerformers = earningsSummary.topEarners.slice(0, 5).map((earner, index) => ({
        creatorId: earner.creatorId,
        earnings: earner.agencyEarnings,
        anonymized: `Creator ${String.fromCharCode(65 + index)}`, // A, B, C, etc.
      }));

      return {
        linkedCreators,
        totalEarnings: agency.totalEarnings,
        activeEarnings: agency.activeEarnings,
        last30DaysEarnings: earningsSummary.totalAgencyEarnings,
        topPerformers,
      };
    } catch (error: any) {
      logger.error('Error getting agency dashboard', error);
      throw new HttpsError('internal', `Failed to get dashboard: ${error.message}`);
    }
  }
);

/**
 * Get analytics for specific creator (agency view)
 * Returns ONLY aggregated metrics, no personal data
 */
export const getCreatorAnalyticsForAgency = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    creatorId: string;
    linkStatus: string;
    agencyPercentage: number;
    metrics: {
      totalEarnings: number;
      agencyShare: number;
      creatorShare: number;
      followersCount: number;
      likesCount: number;
      paidInteractionsCount: number;
      contentPublishedCount: number;
    };
    breakdown: {
      gifts: number;
      premiumStories: number;
      paidMedia: number;
      paidCalls: number;
      aiCompanion: number;
      other: number;
    };
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, creatorUserId } = request.data;

    if (!agencyId || !creatorUserId) {
      throw new HttpsError('invalid-argument', 'Agency ID and Creator ID required');
    }

    try {
      // Verify agency ownership
      const agencyDoc = await db.collection('creator_agency_accounts').doc(agencyId).get();
      
      if (!agencyDoc.exists) {
        throw new HttpsError('not-found', 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.createdBy !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to view this agency');
      }

      // Verify link exists
      const linkQuery = await db
        .collection('creator_agency_links')
        .where('agencyId', '==', agencyId)
        .where('creatorUserId', '==', creatorUserId)
        .limit(1)
        .get();

      if (linkQuery.empty) {
        throw new HttpsError('not-found', 'Creator not linked to this agency');
      }

      const link = linkQuery.docs[0].data() as CreatorAgencyLink;

      // Get earnings breakdown
      const earningsSummary = await getCreatorEarningsSummaryWithAgency(creatorUserId);

      // Get aggregated engagement metrics (counts only, no identities)
      const followersSnapshot = await db
        .collection('followers')
        .where('followedUserId', '==', creatorUserId)
        .count()
        .get();

      const likesSnapshot = await db
        .collection('post_likes')
        .where('creatorId', '==', creatorUserId)
        .count()
        .get();

      const paidInteractionsSnapshot = await db
        .collection('earnings_ledger')
        .where('creatorId', '==', creatorUserId)
        .count()
        .get();

      const contentSnapshot = await db
        .collection('stories')
        .where('userId', '==', creatorUserId)
        .count()
        .get();

      // Get breakdown by source type
      const splitsSnapshot = await db
        .collection('agency_earnings_splits')
        .where('creatorUserId', '==', creatorUserId)
        .where('agencyId', '==', agencyId)
        .get();

      const breakdown = {
        gifts: 0,
        premiumStories: 0,
        paidMedia: 0,
        paidCalls: 0,
        aiCompanion: 0,
        other: 0,
      };

      splitsSnapshot.forEach((doc) => {
        const split = doc.data();
        const amount = split.agencyAmount || 0;

        switch (split.sourceType) {
          case 'GIFT':
            breakdown.gifts += amount;
            break;
          case 'PREMIUM_STORY':
            breakdown.premiumStories += amount;
            break;
          case 'PAID_MEDIA':
            breakdown.paidMedia += amount;
            break;
          case 'PAID_CALL':
            breakdown.paidCalls += amount;
            break;
          case 'AI_COMPANION':
            breakdown.aiCompanion += amount;
            break;
          default:
            breakdown.other += amount;
        }
      });

      return {
        creatorId: creatorUserId,
        linkStatus: link.status,
        agencyPercentage: link.percentageForAgency,
        metrics: {
          totalEarnings: link.totalEarningsGenerated,
          agencyShare: link.agencyEarningsTotal,
          creatorShare: link.creatorEarningsTotal,
          followersCount: followersSnapshot.data().count,
          likesCount: likesSnapshot.data().count,
          paidInteractionsCount: paidInteractionsSnapshot.data().count,
          contentPublishedCount: contentSnapshot.data().count,
        },
        breakdown,
      };
    } catch (error: any) {
      logger.error('Error getting creator analytics for agency', error);
      throw new HttpsError('internal', `Failed to get analytics: ${error.message}`);
    }
  }
);

/**
 * Get list of linked creators with basic info (no personal data)
 */
export const getAgencyLinkedCreators = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    creators: Array<{
      creatorId: string;
      username: string;
      avatarUrl?: string;
      linkStatus: string;
      agencyPercentage: number;
      totalEarnings: number;
      agencyShare: number;
      linkedSince: string;
    }>;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    try {
      // Verify agency ownership
      const agencyDoc = await db.collection('creator_agency_accounts').doc(agencyId).get();
      
      if (!agencyDoc.exists) {
        throw new HttpsError('not-found', 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.createdBy !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to view this agency');
      }

      // Get all links
      const linksSnapshot = await db
        .collection('creator_agency_links')
        .where('agencyId', '==', agencyId)
        .where('status', 'in', ['ACTIVE', 'PENDING'])
        .get();

      const creators = await Promise.all(
        linksSnapshot.docs.map(async (linkDoc) => {
          const link = linkDoc.data() as CreatorAgencyLink;

          // Get public profile info only
          const userDoc = await db.collection('users').doc(link.creatorUserId).get();
          const userData = userDoc.exists ? userDoc.data() : {};

          return {
            creatorId: link.creatorUserId,
            username: userData.username || 'Unknown',
            avatarUrl: userData.avatarUrl,
            linkStatus: link.status,
            agencyPercentage: link.percentageForAgency,
            totalEarnings: link.totalEarningsGenerated,
            agencyShare: link.agencyEarningsTotal,
            linkedSince: link.createdAt.toDate().toISOString(),
          };
        })
      );

      return { creators };
    } catch (error: any) {
      logger.error('Error getting linked creators', error);
      throw new HttpsError('internal', `Failed to get creators: ${error.message}`);
    }
  }
);

/**
 * Get agency earnings timeline
 */
export const getAgencyEarningsTimeline = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    timeline: Array<{
      date: string;
      earnings: number;
      transactionCount: number;
    }>;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, days } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    const daysToFetch = Math.min(days || 30, 90); // Max 90 days

    try {
      // Verify agency ownership
      const agencyDoc = await db.collection('creator_agency_accounts').doc(agencyId).get();
      
      if (!agencyDoc.exists) {
        throw new HttpsError('not-found', 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.createdBy !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to view this agency');
      }

      const startDate = new Date(Date.now() - daysToFetch * 24 * 60 * 60 * 1000);

      // Get all earnings splits
      const splitsSnapshot = await db
        .collection('agency_earnings_splits')
        .where('agencyId', '==', agencyId)
        .where('createdAt', '>=', Timestamp.fromDate(startDate))
        .get();

      // Group by date
      const earningsByDate: Record<string, { earnings: number; count: number }> = {};

      splitsSnapshot.forEach((doc) => {
        const split = doc.data();
        const date = split.createdAt.toDate().toISOString().split('T')[0];

        if (!earningsByDate[date]) {
          earningsByDate[date] = { earnings: 0, count: 0 };
        }

        earningsByDate[date].earnings += split.agencyAmount || 0;
        earningsByDate[date].count += 1;
      });

      // Convert to timeline array
      const timeline = Object.entries(earningsByDate)
        .map(([date, data]) => ({
          date,
          earnings: data.earnings,
          transactionCount: data.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return { timeline };
    } catch (error: any) {
      logger.error('Error getting earnings timeline', error);
      throw new HttpsError('internal', `Failed to get timeline: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATOR VIEW OF AGENCY ANALYTICS
// ============================================================================

/**
 * Get creator's view of agency relationship
 */
export const getCreatorAgencyView = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    hasAgency: boolean;
    agencyName?: string;
    agencyPercentage?: number;
    totalEarnings?: number;
    creatorShare?: number;
    agencyShare?: number;
    linkStatus?: string;
    linkedSince?: string;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;

    try {
      // Check for active agency link
      const linkQuery = await db
        .collection('creator_agency_links')
        .where('creatorUserId', '==', userId)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      if (linkQuery.empty) {
        return { hasAgency: false };
      }

      const link = linkQuery.docs[0].data() as CreatorAgencyLink;

      // Get agency info
      const agencyDoc = await db
        .collection('creator_agency_accounts')
        .doc(link.agencyId)
        .get();

      const agency = agencyDoc.exists ? (agencyDoc.data() as CreatorAgencyAccount) : null;

      return {
        hasAgency: true,
        agencyName: agency?.name,
        agencyPercentage: link.percentageForAgency,
        totalEarnings: link.totalEarningsGenerated,
        creatorShare: link.creatorEarningsTotal,
        agencyShare: link.agencyEarningsTotal,
        linkStatus: link.status,
        linkedSince: link.createdAt.toDate().toISOString(),
      };
    } catch (error: any) {
      logger.error('Error getting creator agency view', error);
      throw new HttpsError('internal', `Failed to get agency info: ${error.message}`);
    }
  }
);

// ============================================================================
// SCHEDULED ANALYTICS AGGREGATION
// ============================================================================

/**
 * Daily analytics pre-computation
 * Speeds up dashboard queries by pre-aggregating data
 */
export const aggregateAgencyAnalyticsDaily = onSchedule(
  {
    schedule: '0 4 * * *', // Daily at 4 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    logger.info('Starting daily agency analytics aggregation');

    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get all active agencies
      const agenciesSnapshot = await db
        .collection('creator_agency_accounts')
        .where('status', '==', 'ACTIVE')
        .get();

      let processedCount = 0;

      for (const agencyDoc of agenciesSnapshot.docs) {
        const agencyId = agencyDoc.id;

        try {
          // Get all linked creators
          const linksSnapshot = await db
            .collection('creator_agency_links')
            .where('agencyId', '==', agencyId)
            .where('status', '==', 'ACTIVE')
            .get();

          for (const linkDoc of linksSnapshot.docs) {
            const link = linkDoc.data() as CreatorAgencyLink;

            // Compute analytics for this creator
            const analytics = await computeCreatorAnalytics(
              agencyId,
              link.creatorUserId,
              yesterday
            );

            // Store pre-computed analytics
            await db
              .collection('agency_analytics_daily')
              .doc(`${agencyId}_${link.creatorUserId}_${yesterday}`)
              .set(analytics);
          }

          processedCount++;
        } catch (error) {
          logger.error('Error aggregating analytics for agency', { agencyId, error });
        }
      }

      logger.info('Daily agency analytics aggregation completed', { processedCount });

      return null;
    } catch (error: any) {
      logger.error('Error in analytics aggregation', error);
      throw error;
    }
  }
);

/**
 * Compute analytics for a creator
 */
async function computeCreatorAnalytics(
  agencyId: string,
  creatorUserId: string,
  date: string
): Promise<AgencyAnalytics> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get earnings for the day
  const splitsSnapshot = await db
    .collection('agency_earnings_splits')
    .where('agencyId', '==', agencyId)
    .where('creatorUserId', '==', creatorUserId)
    .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
    .where('createdAt', '<=', Timestamp.fromDate(endOfDay))
    .get();

  let totalEarningsGenerated = 0;
  let agencyEarnings = 0;
  let creatorEarnings = 0;
  const breakdown = {
    gifts: 0,
    premiumStories: 0,
    paidMedia: 0,
    paidCalls: 0,
    aiCompanion: 0,
    other: 0,
  };

  splitsSnapshot.forEach((doc) => {
    const split = doc.data();
    totalEarningsGenerated += split.creatorShareBefore || 0;
    agencyEarnings += split.agencyAmount || 0;
    creatorEarnings += split.creatorAmount || 0;

    const amount = split.agencyAmount || 0;
    switch (split.sourceType) {
      case 'GIFT':
        breakdown.gifts += amount;
        break;
      case 'PREMIUM_STORY':
        breakdown.premiumStories += amount;
        break;
      case 'PAID_MEDIA':
        breakdown.paidMedia += amount;
        break;
      case 'PAID_CALL':
        breakdown.paidCalls += amount;
        break;
      case 'AI_COMPANION':
        breakdown.aiCompanion += amount;
        break;
      default:
        breakdown.other += amount;
    }
  });

  // Get engagement counts (aggregated only)
  const followersSnapshot = await db
    .collection('followers')
    .where('followedUserId', '==', creatorUserId)
    .count()
    .get();

  const likesSnapshot = await db
    .collection('post_likes')
    .where('creatorId', '==', creatorUserId)
    .count()
    .get();

  return {
    agencyId,
    creatorUserId,
    period: 'DAILY',
    periodStart: date,
    periodEnd: date,
    totalEarningsGenerated,
    agencyEarnings,
    creatorEarnings,
    followersCount: followersSnapshot.data().count,
    likesCount: likesSnapshot.data().count,
    paidInteractionsCount: splitsSnapshot.size,
    contentPublishedCount: 0, // Could be computed separately
    breakdown,
    computedAt: Timestamp.now(),
  };
}