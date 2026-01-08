/**
 * PACK 97 — Creator Analytics & Earnings Insights (Compliance-Safe, Non-Promotional)
 * Extension to PACK 82 with additional analytics capabilities
 * 
 * Business Rules (NON-NEGOTIABLE):
 * - No free tokens, no discounts, no promo codes, no cashback, no bonuses
 * - Token price per unit MUST NOT be changed
 * - Revenue split: 65% creator / 35% Avalo (fixed)
 * - Analytics must be historical and descriptive, not investment/earnings promises
 * - Numbers must match authoritative sources (earnings_ledger, creator_balances)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, increment } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { EarningSourceType } from './creatorEarnings';

// ============================================================================
// TYPES
// ============================================================================

export interface ContentAnalyticsDaily {
  id: string; // ${contentType}_${contentId}_${YYYYMMDD}
  userId: string; // creator/owner
  contentType: 'PREMIUM_STORY' | 'PAID_MEDIA' | 'GIFT' | 'PAID_CALL' | 'AI_COMPANION';
  contentId: string;
  date: string; // YYYY-MM-DD
  tokensEarned: number;
  unlocksCount: number;
  views?: number;
  savesOrFavorites?: number;
  updatedAt: Timestamp;
}

export interface CreatorEarningsSummary {
  lifetime: {
    tokensEarnedTotal: number;
    tokensFromGifts: number;
    tokensFromPaidMedia: number;
    tokensFromStories: number;
    tokensFromCalls: number;
    tokensFromAI: number;
    tokensFromOther?: number;
  };
  last30Days: {
    tokensEarnedTotal: number;
    averagePerDay: number;
    uniquePayers: number;
    daysWithEarnings: number;
  };
  currentBalance: {
    availableTokens: number;
    lifetimeEarned: number;
  };
}

export interface EarningsTimeseriesPoint {
  date: string; // YYYY-MM-DD
  tokensEarnedTotal: number;
  tokensFromGifts: number;
  tokensFromPaidMedia: number;
  tokensFromStories: number;
  tokensFromCalls: number;
  tokensFromAI: number;
}

export interface EarningsTimeseries {
  points: EarningsTimeseriesPoint[];
  periodStart: Date;
  periodEnd: Date;
}

export interface TopContentItem {
  contentType: string;
  contentId: string;
  title?: string;
  previewUrl?: string;
  tokensEarned: number;
  unlocksCount: number;
}

export interface TopContentResult {
  items: TopContentItem[];
  periodStart: Date;
  periodEnd: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYYMMDD to Date
 */
function parseYYYYMMDD(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  return new Date(year, month, day);
}

/**
 * Format date as YYYYMMDD
 */
function formatYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// ============================================================================
// AGGREGATION JOBS
// ============================================================================

/**
 * Rebuild content analytics for a specific date
 * Aggregates content-level performance data
 */
export async function rebuildContentAnalyticsForDay(date: Date): Promise<void> {
  const dateStr = formatDateYMD(date);
  const startTimestamp = Timestamp.fromDate(new Date(date.setHours(0, 0, 0, 0)));
  const endTimestamp = Timestamp.fromDate(new Date(date.setHours(23, 59, 59, 999)));

  logger.info(`Rebuilding content analytics for ${dateStr}`);

  // Aggregate from earnings_ledger
  const ledgerQuery = await db
    .collection('earnings_ledger')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<=', endTimestamp)
    .get();

  // Group by content
  const contentMap = new Map<string, {
    userId: string;
    contentType: string;
    contentId: string;
    tokens: number;
    unlocks: number;
  }>();

  ledgerQuery.forEach((doc) => {
    const entry = doc.data();
    const contentType = entry.sourceType;
    const contentId = entry.sourceId;
    const userId = entry.creatorId;
    const tokens = entry.netTokensCreator;

    // Only track content types (not OTHER)
    if (!['PREMIUM_STORY', 'PAID_MEDIA', 'GIFT', 'PAID_CALL', 'AI_COMPANION'].includes(contentType)) {
      return;
    }

    const key = `${contentType}_${contentId}_${formatYYYYMMDD(date)}`;
    const current = contentMap.get(key) || {
      userId,
      contentType,
      contentId,
      tokens: 0,
      unlocks: 0,
    };

    current.tokens += tokens;
    current.unlocks += 1;
    contentMap.set(key, current);
  });

  // Write to content_analytics_daily
  const batch = db.batch();
  let batchCount = 0;

  for (const [id, data] of Array.from(contentMap.entries())) {
    const docRef = db.collection('content_analytics_daily').doc(id);
    
    batch.set(docRef, {
      id,
      userId: data.userId,
      contentType: data.contentType,
      contentId: data.contentId,
      date: dateStr,
      tokensEarned: data.tokens,
      unlocksCount: data.unlocks,
      updatedAt: serverTimestamp(),
    });

    batchCount++;

    // Commit in batches of 500
    if (batchCount >= 500) {
      await batch.commit();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  logger.info(`Rebuilt content analytics for ${dateStr}: ${contentMap.size} items`);
}

/**
 * Daily content analytics job
 * Runs every night for the previous day
 */
export const dailyContentAnalyticsJob = onSchedule(
  {
    schedule: '0 4 * * *', // Daily at 4 AM UTC (after creator analytics)
    timeZone: 'UTC',
    memory: '512MiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('Starting daily content analytics job');

      // Process yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await rebuildContentAnalyticsForDay(yesterday);

      logger.info('Completed daily content analytics job');
      return null;
    } catch (error: any) {
      logger.error('Error in daily content analytics job', error);
      throw error;
    }
  }
);

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get creator earnings summary
 * Returns high-level aggregates with current balance and breakdowns
 */
export const getCreatorEarningsSummary = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorEarningsSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    try {
      // Get current balance
      const balanceDoc = await db.collection('creator_balances').doc(userId).get();
      const balance = balanceDoc.exists ? balanceDoc.data() : {
        availableTokens: 0,
        lifetimeEarned: 0,
      };

      // Calculate last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const last30DaysQuery = await db
        .collection('earnings_ledger')
        .where('creatorId', '==', userId)
        .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
        .get();

      // Aggregate last 30 days
      let last30Total = 0;
      const uniquePayers = new Set<string>();
      const daysWithEarnings = new Set<string>();

      last30DaysQuery.forEach((doc) => {
        const entry = doc.data();
        last30Total += entry.netTokensCreator;
        uniquePayers.add(entry.fromUserId);
        
        const date = entry.createdAt.toDate();
        daysWithEarnings.add(formatDateYMD(date));
      });

      // Calculate lifetime breakdown by source
      const lifetimeQuery = await db
        .collection('earnings_ledger')
        .where('creatorId', '==', userId)
        .get();

      const lifetimeBreakdown = {
        tokensEarnedTotal: 0,
        tokensFromGifts: 0,
        tokensFromPaidMedia: 0,
        tokensFromStories: 0,
        tokensFromCalls: 0,
        tokensFromAI: 0,
        tokensFromOther: 0,
      };

      lifetimeQuery.forEach((doc) => {
        const entry = doc.data();
        const tokens = entry.netTokensCreator;
        lifetimeBreakdown.tokensEarnedTotal += tokens;

        switch (entry.sourceType as EarningSourceType) {
          case 'GIFT':
            lifetimeBreakdown.tokensFromGifts += tokens;
            break;
          case 'PAID_MEDIA':
            lifetimeBreakdown.tokensFromPaidMedia += tokens;
            break;
          case 'PREMIUM_STORY':
            lifetimeBreakdown.tokensFromStories += tokens;
            break;
          case 'PAID_CALL':
            lifetimeBreakdown.tokensFromCalls += tokens;
            break;
          case 'AI_COMPANION':
            lifetimeBreakdown.tokensFromAI += tokens;
            break;
          default:
            lifetimeBreakdown.tokensFromOther += tokens;
        }
      });

      return {
        lifetime: lifetimeBreakdown,
        last30Days: {
          tokensEarnedTotal: last30Total,
          averagePerDay: daysWithEarnings.size > 0 ? Math.round(last30Total / 30) : 0,
          uniquePayers: uniquePayers.size,
          daysWithEarnings: daysWithEarnings.size,
        },
        currentBalance: {
          availableTokens: balance.availableTokens || 0,
          lifetimeEarned: balance.lifetimeEarned || 0,
        },
      };
    } catch (error: any) {
      logger.error('Error fetching earnings summary', error);
      throw new HttpsError('internal', `Failed to fetch earnings summary: ${error.message}`);
    }
  }
);

/**
 * Get creator earnings timeseries
 * Returns daily data points for charting
 */
export const getCreatorEarningsTimeseries = onCall(
  { region: 'europe-west3' },
  async (request): Promise<EarningsTimeseries> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;
    const fromDate = request.data.fromDate ? new Date(request.data.fromDate) : null;
    const toDate = request.data.toDate ? new Date(request.data.toDate) : new Date();

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    // Default to last 30 days if fromDate not provided
    const startDate = fromDate || new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Query daily analytics
      const dailyQuery = await db
        .collection('creator_analytics_daily')
        .where('creatorId', '==', userId)
        .where('date', '>=', formatDateYMD(startDate))
        .where('date', '<=', formatDateYMD(toDate))
        .orderBy('date', 'asc')
        .get();

      const points: EarningsTimeseriesPoint[] = [];

      dailyQuery.forEach((doc) => {
        const daily = doc.data();
        points.push({
          date: daily.date,
          tokensEarnedTotal: daily.totalNetTokens || 0,
          tokensFromGifts: daily.giftNetTokens || 0,
          tokensFromPaidMedia: daily.paidMediaNetTokens || 0,
          tokensFromStories: daily.storyNetTokens || 0,
          tokensFromCalls: daily.paidCallNetTokens || 0,
          tokensFromAI: daily.aiCompanionNetTokens || 0,
        });
      });

      return {
        points,
        periodStart: startDate,
        periodEnd: toDate,
      };
    } catch (error: any) {
      logger.error('Error fetching earnings timeseries', error);
      throw new HttpsError('internal', `Failed to fetch timeseries: ${error.message}`);
    }
  }
);

/**
 * Get top performing content
 * Returns ranked content by earnings for the specified period
 */
export const getTopPerformingContent = onCall(
  { region: 'europe-west3' },
  async (request): Promise<TopContentResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;
    const fromDate = request.data.fromDate ? new Date(request.data.fromDate) : null;
    const toDate = request.data.toDate ? new Date(request.data.toDate) : new Date();
    const limit = Math.min(request.data.limit || 10, 50);

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    // Default to last 30 days if fromDate not provided
    const startDate = fromDate || new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Query content analytics for the period
      const contentQuery = await db
        .collection('content_analytics_daily')
        .where('userId', '==', userId)
        .where('date', '>=', formatDateYMD(startDate))
        .where('date', '<=', formatDateYMD(toDate))
        .get();

      // Aggregate by content
      const contentMap = new Map<string, {
        contentType: string;
        contentId: string;
        tokensEarned: number;
        unlocksCount: number;
      }>();

      contentQuery.forEach((doc) => {
        const data = doc.data();
        const key = `${data.contentType}_${data.contentId}`;
        
        const current = contentMap.get(key) || {
          contentType: data.contentType,
          contentId: data.contentId,
          tokensEarned: 0,
          unlocksCount: 0,
        };

        current.tokensEarned += data.tokensEarned;
        current.unlocksCount += data.unlocksCount;
        contentMap.set(key, current);
      });

      // Convert to array and enrich with content details
      const items: TopContentItem[] = [];

      for (const [_, data] of Array.from(contentMap.entries())) {
        let title: string | undefined;
        let previewUrl: string | undefined;

        // Fetch content details based on type
        try {
          if (data.contentType === 'PREMIUM_STORY') {
            const storyDoc = await db.collection('premium_stories').doc(data.contentId).get();
            if (storyDoc.exists) {
              const storyData = storyDoc.data();
              previewUrl = storyData?.thumbnailUrl;
            }
          } else if (data.contentType === 'PAID_MEDIA') {
            const mediaDoc = await db.collection('paid_media').doc(data.contentId).get();
            if (mediaDoc.exists) {
              const mediaData = mediaDoc.data();
              previewUrl = mediaData?.thumbnailUrl || mediaData?.url;
            }
          } else if (data.contentType === 'GIFT') {
            const giftDoc = await db.collection('gifts').doc(data.contentId).get();
            if (giftDoc.exists) {
              const giftData = giftDoc.data();
              title = giftData?.name;
              previewUrl = giftData?.iconUrl;
            }
          }
        } catch (error) {
          logger.warn(`Could not fetch details for ${data.contentType} ${data.contentId}`);
        }

        items.push({
          contentType: data.contentType,
          contentId: data.contentId,
          title,
          previewUrl,
          tokensEarned: data.tokensEarned,
          unlocksCount: data.unlocksCount,
        });
      }

      // Sort by earnings and limit
      items.sort((a, b) => b.tokensEarned - a.tokensEarned);
      const topItems = items.slice(0, limit);

      return {
        items: topItems,
        periodStart: startDate,
        periodEnd: toDate,
      };
    } catch (error: any) {
      logger.error('Error fetching top performing content', error);
      throw new HttpsError('internal', `Failed to fetch top content: ${error.message}`);
    }
  }
);