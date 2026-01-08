/**
 * PACK 81 — Creator Earnings Wallet & Payout Ledger
 * Complete implementation for unified earnings tracking and reporting
 * 
 * Business Rules (NON-NEGOTIABLE):
 * - No free tokens, no promo-codes, no discounts, no cashback
 * - Token price per unit MUST NOT be changed
 * - Revenue split: 65% creator / 35% Avalo (fixed)
 * - Earnings are non-reversible (no refunds)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin, serverTimestamp, increment, generateId } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EARNINGS_CONFIG = {
  CREATOR_SHARE: 0.65,    // 65% to creator
  AVALO_COMMISSION: 0.35, // 35% to Avalo
  CSV_EXPORT_EXPIRY_HOURS: 24,
  MAX_LEDGER_PAGE_SIZE: 100,
  DEFAULT_LEDGER_PAGE_SIZE: 50,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type EarningSourceType = 
  | 'GIFT' 
  | 'PREMIUM_STORY' 
  | 'PAID_MEDIA'
  | 'PAID_CALL'
  | 'AI_COMPANION'
  | 'OTHER';

export interface EarningsLedgerEntry {
  id: string;
  creatorId: string;
  sourceType: EarningSourceType;
  sourceId: string;
  fromUserId: string;
  grossTokens: number;
  netTokensCreator: number;
  commissionAvalo: number;
  createdAt: Timestamp;
  metadata?: {
    chatId?: string;
    storyId?: string;
    giftId?: string;
    mediaId?: string;
    giftName?: string;
    [key: string]: any;
  };
}

export interface CreatorBalance {
  userId: string;
  availableTokens: number;
  lifetimeEarned: number;
  updatedAt: Timestamp;
}

export interface WalletSummary {
  availableTokens: number;
  lifetimeEarned: number;
  breakdown: {
    last30Days: EarningsBreakdown;
    allTime: EarningsBreakdown;
  };
}

export interface EarningsBreakdown {
  gifts: number;
  premiumStories: number;
  paidMedia: number;
  paidCalls?: number;
  aiCompanion?: number;
  other?: number;
  total: number;
}

export interface LedgerQuery {
  fromDate?: Date;
  toDate?: Date;
  sourceType?: EarningSourceType;
  pageToken?: string;
  limit?: number;
}

export interface LedgerPage {
  entries: EarningsLedgerEntry[];
  nextPageToken?: string;
  hasMore: boolean;
  total: number;
}

// ============================================================================
// CORE LEDGER FUNCTIONS
// ============================================================================

/**
 * Record an earning event in the ledger
 * Called by payment functions (gifts, stories, paid media, etc.)
 */
export async function recordEarning(params: {
  creatorId: string;
  sourceType: EarningSourceType;
  sourceId: string;
  fromUserId: string;
  grossTokens: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  const { creatorId, sourceType, sourceId, fromUserId, grossTokens, metadata } = params;

  // Validate commission split
  const netTokensCreator = Math.floor(grossTokens * EARNINGS_CONFIG.CREATOR_SHARE);
  const commissionAvalo = grossTokens - netTokensCreator;

  const ledgerEntry: Omit<EarningsLedgerEntry, 'id'> = {
    creatorId,
    sourceType,
    sourceId,
    fromUserId,
    grossTokens,
    netTokensCreator,
    commissionAvalo,
    createdAt: Timestamp.now(),
    metadata: metadata || {},
  };

  // Write to ledger
  const ledgerRef = await db.collection('earnings_ledger').add(ledgerEntry);
  
  // Update creator balance atomically
  await updateCreatorBalance(creatorId, netTokensCreator);

  logger.info(`Recorded earning: ${ledgerRef.id} for creator ${creatorId}`, {
    sourceType,
    netTokensCreator,
  });

  return ledgerRef.id;
}

/**
 * Update creator balance atomically
 */
async function updateCreatorBalance(
  creatorId: string,
  netTokensCreator: number
): Promise<void> {
  const balanceRef = db.collection('creator_balances').doc(creatorId);

  await db.runTransaction(async (transaction) => {
    const balanceDoc = await transaction.get(balanceRef);

    if (!balanceDoc.exists) {
      // Create new balance record
      transaction.set(balanceRef, {
        userId: creatorId,
        availableTokens: netTokensCreator,
        lifetimeEarned: netTokensCreator,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Update existing balance
      transaction.update(balanceRef, {
        availableTokens: increment(netTokensCreator),
        lifetimeEarned: increment(netTokensCreator),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

// ============================================================================
// WALLET SUMMARY API
// ============================================================================

/**
 * Get creator wallet summary
 * Returns current balance, lifetime earnings, and breakdown by source
 */
export const getCreatorWalletSummary = onCall(
  { region: 'europe-west3' },
  async (request): Promise<WalletSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own wallet
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s wallet');
    }

    try {
      // Fetch balance
      const balanceSnap = await db.collection('creator_balances').doc(userId).get();
      
      const balance: CreatorBalance = balanceSnap.exists
        ? (balanceSnap.data() as CreatorBalance)
        : {
            userId,
            availableTokens: 0,
            lifetimeEarned: 0,
            updatedAt: Timestamp.now(),
          };

      // Calculate date ranges
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch last 30 days breakdown
      const last30DaysBreakdown = await calculateEarningsBreakdown(
        userId,
        thirtyDaysAgo,
        now
      );

      // Fetch all-time breakdown
      const allTimeBreakdown = await calculateEarningsBreakdown(userId);

      return {
        availableTokens: balance.availableTokens,
        lifetimeEarned: balance.lifetimeEarned,
        breakdown: {
          last30Days: last30DaysBreakdown,
          allTime: allTimeBreakdown,
        },
      };
    } catch (error: any) {
      logger.error('Error fetching wallet summary', error);
      throw new HttpsError('internal', `Failed to fetch wallet summary: ${error.message}`);
    }
  }
);

/**
 * Calculate earnings breakdown by source type
 */
async function calculateEarningsBreakdown(
  userId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<EarningsBreakdown> {
  let query: FirebaseFirestore.Query = db
    .collection('earnings_ledger')
    .where('creatorId', '==', userId);

  if (fromDate) {
    query = query.where('createdAt', '>=', Timestamp.fromDate(fromDate));
  }
  if (toDate) {
    query = query.where('createdAt', '<=', Timestamp.fromDate(toDate));
  }

  const snapshot = await query.get();

  const breakdown: EarningsBreakdown = {
    gifts: 0,
    premiumStories: 0,
    paidMedia: 0,
    paidCalls: 0,
    aiCompanion: 0,
    other: 0,
    total: 0,
  };

  snapshot.forEach((doc) => {
    const entry = doc.data() as EarningsLedgerEntry;
    const amount = entry.netTokensCreator;

    switch (entry.sourceType) {
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
        breakdown.paidCalls = (breakdown.paidCalls || 0) + amount;
        break;
      case 'AI_COMPANION':
        breakdown.aiCompanion = (breakdown.aiCompanion || 0) + amount;
        break;
      default:
        breakdown.other = (breakdown.other || 0) + amount;
    }

    breakdown.total += amount;
  });

  return breakdown;
}

// ============================================================================
// EARNINGS LEDGER API
// ============================================================================

/**
 * Get earnings ledger with pagination and filters
 */
export const getEarningsLedger = onCall(
  { region: 'europe-west3' },
  async (request): Promise<LedgerPage> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own ledger
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s ledger');
    }

    const filters: LedgerQuery = {
      fromDate: request.data.fromDate ? new Date(request.data.fromDate) : undefined,
      toDate: request.data.toDate ? new Date(request.data.toDate) : undefined,
      sourceType: request.data.sourceType,
      pageToken: request.data.pageToken,
      limit: Math.min(
        request.data.limit || EARNINGS_CONFIG.DEFAULT_LEDGER_PAGE_SIZE,
        EARNINGS_CONFIG.MAX_LEDGER_PAGE_SIZE
      ),
    };

    try {
      return await fetchLedgerPage(userId, filters);
    } catch (error: any) {
      logger.error('Error fetching earnings ledger', error);
      throw new HttpsError('internal', `Failed to fetch ledger: ${error.message}`);
    }
  }
);

/**
 * Fetch paginated ledger entries
 */
async function fetchLedgerPage(
  userId: string,
  filters: LedgerQuery
): Promise<LedgerPage> {
  let query: FirebaseFirestore.Query = db
    .collection('earnings_ledger')
    .where('creatorId', '==', userId)
    .orderBy('createdAt', 'desc');

  // Apply filters
  if (filters.sourceType) {
    query = query.where('sourceType', '==', filters.sourceType);
  }

  if (filters.fromDate) {
    query = query.where('createdAt', '>=', Timestamp.fromDate(filters.fromDate));
  }

  if (filters.toDate) {
    query = query.where('createdAt', '<=', Timestamp.fromDate(filters.toDate));
  }

  // Handle pagination
  if (filters.pageToken) {
    const tokenDoc = await db
      .collection('earnings_ledger')
      .doc(filters.pageToken)
      .get();
    
    if (tokenDoc.exists) {
      query = query.startAfter(tokenDoc);
    }
  }

  // Fetch one extra to determine if there are more pages
  const limit = filters.limit || EARNINGS_CONFIG.DEFAULT_LEDGER_PAGE_SIZE;
  query = query.limit(limit + 1);

  const snapshot = await query.get();
  const entries: EarningsLedgerEntry[] = [];
  let hasMore = false;
  let nextPageToken: string | undefined;

  snapshot.docs.forEach((doc, index) => {
    if (index < limit) {
      entries.push({ id: doc.id, ...doc.data() } as EarningsLedgerEntry);
    } else {
      hasMore = true;
      nextPageToken = doc.id;
    }
  });

  // Get total count (for UI display)
  const countQuery = db
    .collection('earnings_ledger')
    .where('creatorId', '==', userId);
  
  const countSnapshot = await countQuery.count().get();
  const total = countSnapshot.data().count;

  return {
    entries,
    nextPageToken,
    hasMore,
    total,
  };
}

// ============================================================================
// CSV EXPORT API
// ============================================================================

/**
 * Request CSV export of earnings
 * Generates CSV file in Storage and returns signed download URL
 */
export const exportEarningsCSV = onCall(
  { region: 'europe-west3', timeoutSeconds: 300 },
  async (request): Promise<{ downloadUrl: string; expiresAt: Date }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const fromDate = request.data.fromDate ? new Date(request.data.fromDate) : undefined;
    const toDate = request.data.toDate ? new Date(request.data.toDate) : undefined;

    try {
      // Fetch all ledger entries for the period
      let query: FirebaseFirestore.Query = db
        .collection('earnings_ledger')
        .where('creatorId', '==', userId)
        .orderBy('createdAt', 'desc');

      if (fromDate) {
        query = query.where('createdAt', '>=', Timestamp.fromDate(fromDate));
      }
      if (toDate) {
        query = query.where('createdAt', '<=', Timestamp.fromDate(toDate));
      }

      const snapshot = await query.get();

      // Generate CSV content
      const csvLines: string[] = [
        'Date,Time,Source Type,From User,Gross Tokens,Net Tokens,Commission,Reference ID',
      ];

      snapshot.forEach((doc) => {
        const entry = doc.data() as EarningsLedgerEntry;
        const date = entry.createdAt.toDate();
        
        csvLines.push([
          date.toISOString().split('T')[0],
          date.toISOString().split('T')[1].split('.')[0],
          entry.sourceType,
          entry.fromUserId,
          entry.grossTokens.toString(),
          entry.netTokensCreator.toString(),
          entry.commissionAvalo.toString(),
          doc.id,
        ].join(','));
      });

      const csvContent = csvLines.join('\n');

      // Upload to Storage
      const bucket = admin.storage().bucket();
      const fileName = `earnings_exports/${userId}/${Date.now()}_earnings.csv`;
      const file = bucket.file(fileName);

      await file.save(csvContent, {
        contentType: 'text/csv',
        metadata: {
          userId,
          exportedAt: new Date().toISOString(),
        },
      });

      // Generate signed URL (valid for 24 hours)
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + EARNINGS_CONFIG.CSV_EXPORT_EXPIRY_HOURS);

      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: expiryDate,
      });

      logger.info(`Generated CSV export for user ${userId}`, {
        fileName,
        entriesCount: snapshot.size,
      });

      return {
        downloadUrl,
        expiresAt: expiryDate,
      };
    } catch (error: any) {
      logger.error('Error exporting earnings CSV', error);
      throw new HttpsError('internal', `Failed to export CSV: ${error.message}`);
    }
  }
);

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Aggregate earnings data (scheduled daily)
 * Pre-compute breakdowns for faster API responses
 */
export const aggregateCreatorEarningsDaily = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting daily earnings aggregation');

      // Get all creators with earnings
      const creatorsSnapshot = await db.collection('creator_balances').get();

      let processedCount = 0;
      const batch = db.batch();

      for (const creatorDoc of creatorsSnapshot.docs) {
        const creatorId = creatorDoc.id;

        // Calculate last 30 days breakdown
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const breakdown = await calculateEarningsBreakdown(
          creatorId,
          thirtyDaysAgo,
          now
        );

        // Store pre-computed breakdown
        const aggregateRef = db
          .collection('earnings_aggregates')
          .doc(`${creatorId}_last30days`);

        batch.set(aggregateRef, {
          creatorId,
          period: 'last30days',
          breakdown,
          computedAt: serverTimestamp(),
        });

        processedCount++;

        // Commit in batches of 500
        if (processedCount % 500 === 0) {
          await batch.commit();
        }
      }

      // Commit remaining
      if (processedCount % 500 !== 0) {
        await batch.commit();
      }

      logger.info(`Completed daily aggregation for ${processedCount} creators`);

      return null;
    } catch (error: any) {
      logger.error('Error in daily earnings aggregation', error);
      throw error;
    }
  }
);
