/**
 * PACK 82 — Creator Performance Analytics & Insights Dashboard
 * Firebase Functions for analytics aggregation and retrieval
 * 
 * This is a read-only analytics layer, no changes to tokenomics or pricing
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { EarningSourceType } from './creatorEarnings';

// ============================================================================
// TYPES
// ============================================================================

interface CreatorAnalyticsDaily {
  id: string;
  creatorId: string;
  date: string;
  totalNetTokens: number;
  giftNetTokens: number;
  storyNetTokens: number;
  paidMediaNetTokens: number;
  paidCallNetTokens: number;
  aiCompanionNetTokens: number;
  otherNetTokens: number;
  totalPayers: number;
  totalPaidEvents: number;
  updatedAt: Timestamp;
}

interface TopSupporter {
  userId: string;
  maskedName: string;
  totalTokens: number;
  paidActions: number;
}

interface TopContentItem {
  id: string;
  type: EarningSourceType;
  title?: string;
  thumbnailUrl?: string;
  totalEarnings: number;
  unlockCount?: number;
}

interface CreatorAnalyticsSnapshot {
  creatorId: string;
  last30_totalNet: number;
  last30_totalPayers: number;
  last30_totalEvents: number;
  last30_bySource: {
    GIFT: number;
    PREMIUM_STORY: number;
    PAID_MEDIA: number;
    PAID_CALL?: number;
    AI_COMPANION?: number;
    OTHER?: number;
  };
  last30_topSupporters: TopSupporter[];
  last30_topStories: TopContentItem[];
  last30_topPaidMedia: TopContentItem[];
  last30_topGifts: TopContentItem[];
  updatedAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANALYTICS_CONFIG = {
  TOP_SUPPORTERS_LIMIT: 10,
  TOP_CONTENT_LIMIT: 3,
  AGGREGATION_PERIOD_DAYS: 30,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date for daily analytics ID
 */
function formatDailyAnalyticsId(creatorId: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${creatorId}_${year}${month}${day}`;
}

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
 * Mask username for privacy
 */
function maskUsername(username: string): string {
  if (!username) return '@anonymous';
  
  const clean = username.replace('@', '');
  
  if (clean.length <= 4) {
    return `@${clean[0]}***`;
  }
  
  const firstTwo = clean.substring(0, 2);
  const lastTwo = clean.substring(clean.length - 2);
  
  return `@${firstTwo}***${lastTwo}`;
}

/**
 * Get source-specific field name
 */
function getSourceFieldName(sourceType: EarningSourceType): string {
  const fieldMap: Record<EarningSourceType, string> = {
    GIFT: 'giftNetTokens',
    PREMIUM_STORY: 'storyNetTokens',
    PAID_MEDIA: 'paidMediaNetTokens',
    PAID_CALL: 'paidCallNetTokens',
    AI_COMPANION: 'aiCompanionNetTokens',
    OTHER: 'otherNetTokens',
  };
  return fieldMap[sourceType] || 'otherNetTokens';
}

// ============================================================================
// REAL-TIME ANALYTICS TRIGGER
// ============================================================================

/**
 * Update daily analytics when earnings ledger is written
 * Triggered on every earnings_ledger entry creation
 */
export const onLedgerEntryWrite = onDocumentWritten(
  {
    document: 'earnings_ledger/{entryId}',
    region: 'europe-west3',
  },
  async (event) => {
    const data = event.data?.after.data();
    
    // Only process new entries
    if (!data || !event.data?.after.exists) {
      logger.info('Skipping deleted or non-existent entry');
      return null;
    }

    const creatorId = data.creatorId;
    const sourceType = data.sourceType as EarningSourceType;
    const fromUserId = data.fromUserId;
    const netTokensCreator = data.netTokensCreator;
    const createdAt = data.createdAt as Timestamp;

    try {
      // Get date for daily analytics
      const date = createdAt.toDate();
      date.setHours(0, 0, 0, 0);
      
      const dailyId = formatDailyAnalyticsId(creatorId, date);
      const dailyRef = db.collection('creator_analytics_daily').doc(dailyId);

      // Get source-specific field name
      const sourceField = getSourceFieldName(sourceType);

      // Update daily analytics atomically
      await db.runTransaction(async (transaction) => {
        const dailyDoc = await transaction.get(dailyRef);

        if (!dailyDoc.exists) {
          // Create new daily record
          const newDaily: Omit<CreatorAnalyticsDaily, 'id'> = {
            creatorId,
            date: formatDateYMD(date),
            totalNetTokens: netTokensCreator,
            giftNetTokens: sourceType === 'GIFT' ? netTokensCreator : 0,
            storyNetTokens: sourceType === 'PREMIUM_STORY' ? netTokensCreator : 0,
            paidMediaNetTokens: sourceType === 'PAID_MEDIA' ? netTokensCreator : 0,
            paidCallNetTokens: sourceType === 'PAID_CALL' ? netTokensCreator : 0,
            aiCompanionNetTokens: sourceType === 'AI_COMPANION' ? netTokensCreator : 0,
            otherNetTokens: sourceType === 'OTHER' ? netTokensCreator : 0,
            totalPayers: 1, // Will be adjusted with actual unique count
            totalPaidEvents: 1,
            updatedAt: Timestamp.now(),
          };
          transaction.set(dailyRef, newDaily);
        } else {
          // Update existing daily record
          const updates: any = {
            totalNetTokens: FieldValue.increment(netTokensCreator),
            [sourceField]: FieldValue.increment(netTokensCreator),
            totalPaidEvents: FieldValue.increment(1),
            updatedAt: serverTimestamp(),
          };

          transaction.update(dailyRef, updates);
        }
      });

      // Update unique payers count (separate operation to avoid conflicts)
      await updateUniquePayers(creatorId, date, fromUserId);

      logger.info(`Updated daily analytics for creator ${creatorId}`, {
        date: formatDateYMD(date),
        sourceType,
        netTokens: netTokensCreator,
      });

      return null;
    } catch (error: any) {
      logger.error('Error updating daily analytics', error);
      // Don't throw - we don't want to fail the ledger write
      return null;
    }
  }
);

/**
 * Update unique payers count for a day
 * We track payers in a separate subcollection to maintain uniqueness
 */
async function updateUniquePayers(
  creatorId: string,
  date: Date,
  payerId: string
): Promise<void> {
  const dailyId = formatDailyAnalyticsId(creatorId, date);
  const payerRef = db
    .collection('creator_analytics_daily')
    .doc(dailyId)
    .collection('payers')
    .doc(payerId);

  const dailyRef = db.collection('creator_analytics_daily').doc(dailyId);

  await db.runTransaction(async (transaction) => {
    const payerDoc = await transaction.get(payerRef);

    if (!payerDoc.exists) {
      // New payer for this day
      transaction.set(payerRef, { firstPaidAt: serverTimestamp() });
      transaction.update(dailyRef, {
        totalPayers: FieldValue.increment(1),
      });
    }
    // If payer already exists, no need to increment
  });
}

// ============================================================================
// DAILY SNAPSHOT REBUILD (CRON)
// ============================================================================

/**
 * Rebuild analytics snapshots for all creators
 * Runs daily at 03:00 UTC
 */
export const rebuildCreatorAnalyticsSnapshots = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('Starting creator analytics snapshot rebuild');

      // Get all creators with balances (indicates they have earnings)
      const creatorsSnapshot = await db.collection('creator_balances').get();

      let processedCount = 0;
      const batch = db.batch();
      let batchCount = 0;

      for (const creatorDoc of creatorsSnapshot.docs) {
        const creatorId = creatorDoc.id;

        try {
          // Build snapshot for this creator
          const snapshot = await buildCreatorSnapshot(creatorId);

          // Store snapshot
          const snapshotRef = db
            .collection('creator_analytics_snapshot')
            .doc(creatorId);

          batch.set(snapshotRef, snapshot);
          batchCount++;

          // Commit in batches of 500
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }

          processedCount++;
        } catch (error: any) {
          logger.error(`Error building snapshot for creator ${creatorId}`, error);
          // Continue with other creators
        }
      }

      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(`Completed snapshot rebuild for ${processedCount} creators`);

      return null;
    } catch (error: any) {
      logger.error('Error in snapshot rebuild', error);
      throw error;
    }
  }
);

/**
 * Build complete analytics snapshot for a creator
 */
async function buildCreatorSnapshot(
  creatorId: string
): Promise<Omit<CreatorAnalyticsSnapshot, 'creatorId'>> {
  // Calculate date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - ANALYTICS_CONFIG.AGGREGATION_PERIOD_DAYS);

  // Aggregate from daily records
  const dailyQuery = await db
    .collection('creator_analytics_daily')
    .where('creatorId', '==', creatorId)
    .where('date', '>=', formatDateYMD(startDate))
    .where('date', '<=', formatDateYMD(endDate))
    .get();

  // Calculate totals
  let totalNet = 0;
  const uniquePayers = new Set<string>();
  let totalEvents = 0;
  
  const bySource = {
    GIFT: 0,
    PREMIUM_STORY: 0,
    PAID_MEDIA: 0,
    PAID_CALL: 0,
    AI_COMPANION: 0,
    OTHER: 0,
  };

  dailyQuery.forEach((doc) => {
    const daily = doc.data() as CreatorAnalyticsDaily;
    totalNet += daily.totalNetTokens;
    totalEvents += daily.totalPaidEvents;
    bySource.GIFT += daily.giftNetTokens;
    bySource.PREMIUM_STORY += daily.storyNetTokens;
    bySource.PAID_MEDIA += daily.paidMediaNetTokens;
    bySource.PAID_CALL += daily.paidCallNetTokens || 0;
    bySource.AI_COMPANION += daily.aiCompanionNetTokens || 0;
    bySource.OTHER += daily.otherNetTokens || 0;
  });

  // Get unique payers from ledger (more accurate)
  const ledgerQuery = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>=', Timestamp.fromDate(startDate))
    .where('createdAt', '<=', Timestamp.fromDate(endDate))
    .get();

  ledgerQuery.forEach((doc) => {
    const entry = doc.data();
    uniquePayers.add(entry.fromUserId);
  });

  // Get top supporters
  const topSupporters = await getTopSupporters(creatorId, startDate, endDate);

  // Get top content
  const topStories = await getTopStories(creatorId, startDate, endDate);
  const topPaidMedia = await getTopPaidMedia(creatorId, startDate, endDate);
  const topGifts = await getTopGifts(creatorId, startDate, endDate);

  return {
    last30_totalNet: totalNet,
    last30_totalPayers: uniquePayers.size,
    last30_totalEvents: totalEvents,
    last30_bySource: bySource,
    last30_topSupporters: topSupporters,
    last30_topStories: topStories,
    last30_topPaidMedia: topPaidMedia,
    last30_topGifts: topGifts,
    updatedAt: Timestamp.now(),
  };
}

/**
 * Get top supporters for a creator
 */
async function getTopSupporters(
  creatorId: string,
  startDate: Date,
  endDate: Date
): Promise<TopSupporter[]> {
  const ledgerQuery = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>=', Timestamp.fromDate(startDate))
    .where('createdAt', '<=', Timestamp.fromDate(endDate))
    .get();

  // Aggregate by payer
  const payerMap = new Map<string, { tokens: number; actions: number }>();

  ledgerQuery.forEach((doc) => {
    const entry = doc.data();
    const fromUserId = entry.fromUserId;
    const tokens = entry.netTokensCreator;

    const current = payerMap.get(fromUserId) || { tokens: 0, actions: 0 };
    current.tokens += tokens;
    current.actions += 1;
    payerMap.set(fromUserId, current);
  });

  // Convert to array and sort
  const supporters: TopSupporter[] = [];
  
  for (const [userId, data] of Array.from(payerMap.entries())) {
    // Get user display name
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const displayName = userData?.displayName || userData?.username || userId;

    supporters.push({
      userId,
      maskedName: maskUsername(displayName),
      totalTokens: data.tokens,
      paidActions: data.actions,
    });
  }

  // Sort by total tokens and return top N
  return supporters
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, ANALYTICS_CONFIG.TOP_SUPPORTERS_LIMIT);
}

/**
 * Get top earning premium stories
 */
async function getTopStories(
  creatorId: string,
  startDate: Date,
  endDate: Date
): Promise<TopContentItem[]> {
  const unlocksQuery = await db
    .collection('premium_story_unlocks')
    .where('creatorEarnings', '>', 0)
    .where('unlockedAt', '>=', Timestamp.fromDate(startDate))
    .where('unlockedAt', '<=', Timestamp.fromDate(endDate))
    .get();

  // Aggregate by story ID
  const storyMap = new Map<string, { earnings: number; unlocks: number }>();

  for (const doc of unlocksQuery.docs) {
    const unlock = doc.data();
    const storyId = unlock.storyId;
    
    // Verify story belongs to this creator
    const storyDoc = await db.collection('premium_stories').doc(storyId).get();
    if (!storyDoc.exists || storyDoc.data()?.authorId !== creatorId) {
      continue;
    }

    const current = storyMap.get(storyId) || { earnings: 0, unlocks: 0 };
    current.earnings += unlock.creatorEarnings || 0;
    current.unlocks += 1;
    storyMap.set(storyId, current);
  }

  // Convert to array with story details
  const stories: TopContentItem[] = [];

  for (const [storyId, data] of Array.from(storyMap.entries())) {
    const storyDoc = await db.collection('premium_stories').doc(storyId).get();
    const storyData = storyDoc.data();

    stories.push({
      id: storyId,
      type: 'PREMIUM_STORY',
      thumbnailUrl: storyData?.thumbnailUrl,
      totalEarnings: data.earnings,
      unlockCount: data.unlocks,
    });
  }

  return stories
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
    .slice(0, ANALYTICS_CONFIG.TOP_CONTENT_LIMIT);
}

/**
 * Get top earning paid media
 */
async function getTopPaidMedia(
  creatorId: string,
  startDate: Date,
  endDate: Date
): Promise<TopContentItem[]> {
  const ledgerQuery = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', creatorId)
    .where('sourceType', '==', 'PAID_MEDIA')
    .where('createdAt', '>=', Timestamp.fromDate(startDate))
    .where('createdAt', '<=', Timestamp.fromDate(endDate))
    .get();

  // Aggregate by media ID
  const mediaMap = new Map<string, { earnings: number; unlocks: number }>();

  ledgerQuery.forEach((doc) => {
    const entry = doc.data();
    const mediaId = entry.metadata?.mediaId || entry.sourceId;

    const current = mediaMap.get(mediaId) || { earnings: 0, unlocks: 0 };
    current.earnings += entry.netTokensCreator;
    current.unlocks += 1;
    mediaMap.set(mediaId, current);
  });

  // Convert to array
  const media: TopContentItem[] = [];

  for (const [mediaId, data] of Array.from(mediaMap.entries())) {
    media.push({
      id: mediaId,
      type: 'PAID_MEDIA',
      totalEarnings: data.earnings,
      unlockCount: data.unlocks,
    });
  }

  return media
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
    .slice(0, ANALYTICS_CONFIG.TOP_CONTENT_LIMIT);
}

/**
 * Get top gifts by quantity sent
 */
async function getTopGifts(
  creatorId: string,
  startDate: Date,
  endDate: Date
): Promise<TopContentItem[]> {
  const ledgerQuery = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', creatorId)
    .where('sourceType', '==', 'GIFT')
    .where('createdAt', '>=', Timestamp.fromDate(startDate))
    .where('createdAt', '<=', Timestamp.fromDate(endDate))
    .get();

  // Aggregate by gift ID
  const giftMap = new Map<string, { earnings: number; quantity: number; name: string }>();

  ledgerQuery.forEach((doc) => {
    const entry = doc.data();
    const giftId = entry.metadata?.giftId || entry.sourceId;
    const giftName = entry.metadata?.giftName || 'Unknown Gift';

    const current = giftMap.get(giftId) || { earnings: 0, quantity: 0, name: giftName };
    current.earnings += entry.netTokensCreator;
    current.quantity += 1;
    giftMap.set(giftId, current);
  });

  // Convert to array
  const gifts: TopContentItem[] = [];

  for (const [giftId, data] of Array.from(giftMap.entries())) {
    gifts.push({
      id: giftId,
      type: 'GIFT',
      title: data.name,
      totalEarnings: data.earnings,
      unlockCount: data.quantity,
    });
  }

  // Sort by quantity (not earnings)
  return gifts
    .sort((a, b) => (b.unlockCount || 0) - (a.unlockCount || 0))
    .slice(0, ANALYTICS_CONFIG.TOP_CONTENT_LIMIT);
}

// ============================================================================
// CALLABLE FUNCTIONS FOR MOBILE
// ============================================================================

/**
 * Get creator analytics overview
 * Returns pre-computed snapshot with all KPIs and breakdowns
 */
export const getCreatorAnalyticsOverview = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    try {
      const snapshotDoc = await db
        .collection('creator_analytics_snapshot')
        .doc(userId)
        .get();

      if (!snapshotDoc.exists) {
        // No analytics yet - return empty data
        return {
          totalEarnings: 0,
          payingUsers: 0,
          paidInteractions: 0,
          topEarningSource: null,
          earningsBySource: {
            GIFT: 0,
            PREMIUM_STORY: 0,
            PAID_MEDIA: 0,
            PAID_CALL: 0,
            AI_COMPANION: 0,
            OTHER: 0,
          },
          topSupporters: [],
          topStories: [],
          topPaidMedia: [],
          topGifts: [],
          periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          lastUpdated: new Date(),
        };
      }

      const snapshot = snapshotDoc.data() as CreatorAnalyticsSnapshot;

      // Find top earning source
      const bySource = snapshot.last30_bySource;
      let topEarningSource = null;
      let maxValue = 0;

      for (const [source, value] of Object.entries(bySource)) {
        if (value > maxValue) {
          maxValue = value;
          topEarningSource = source;
        }
      }

      return {
        totalEarnings: snapshot.last30_totalNet,
        payingUsers: snapshot.last30_totalPayers,
        paidInteractions: snapshot.last30_totalEvents,
        topEarningSource,
        earningsBySource: bySource,
        topSupporters: snapshot.last30_topSupporters,
        topStories: snapshot.last30_topStories,
        topPaidMedia: snapshot.last30_topPaidMedia,
        topGifts: snapshot.last30_topGifts,
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        lastUpdated: snapshot.updatedAt.toDate(),
      };
    } catch (error: any) {
      logger.error('Error fetching analytics overview', error);
      throw new HttpsError('internal', `Failed to fetch analytics: ${error.message}`);
    }
  }
);

/**
 * Get creator analytics timeseries
 * Returns daily data points for charts
 */
export const getCreatorAnalyticsTimeseries = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;
    const days = Math.min(request.data.days || 30, 90); // Max 90 days

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    try {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      // Fetch daily records
      const dailyQuery = await db
        .collection('creator_analytics_daily')
        .where('creatorId', '==', userId)
        .where('date', '>=', formatDateYMD(startDate))
        .where('date', '<=', formatDateYMD(endDate))
        .orderBy('date', 'asc')
        .get();

      const dataPoints: any[] = [];
      let totalEarnings = 0;
      let peakDay: { date: string; earnings: number } | null = null;

      dailyQuery.forEach((doc) => {
        const daily = doc.data() as CreatorAnalyticsDaily;
        
        dataPoints.push({
          date: daily.date,
          totalNetTokens: daily.totalNetTokens,
          giftNetTokens: daily.giftNetTokens,
          storyNetTokens: daily.storyNetTokens,
          paidMediaNetTokens: daily.paidMediaNetTokens,
          paidCallNetTokens: daily.paidCallNetTokens || 0,
          aiCompanionNetTokens: daily.aiCompanionNetTokens || 0,
          otherNetTokens: daily.otherNetTokens || 0,
          totalPaidEvents: daily.totalPaidEvents,
        });

        totalEarnings += daily.totalNetTokens;

        if (!peakDay || daily.totalNetTokens > peakDay.earnings) {
          peakDay = {
            date: daily.date,
            earnings: daily.totalNetTokens,
          };
        }
      });

      return {
        dataPoints,
        periodStart: startDate,
        periodEnd: endDate,
        totalDays: days,
        summary: {
          totalEarnings,
          averageDaily: dataPoints.length > 0 ? Math.round(totalEarnings / days) : 0,
          peakDay,
        },
      };
    } catch (error: any) {
      logger.error('Error fetching analytics timeseries', error);
      throw new HttpsError('internal', `Failed to fetch timeseries: ${error.message}`);
    }
  }
);