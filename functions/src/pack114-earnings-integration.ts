/**
 * PACK 114 — Earnings Integration with Agency Splits
 * Extends PACK 81 Creator Earnings to support agency revenue attribution
 * 
 * COMPLIANCE-SAFE REVENUE ATTRIBUTION:
 * - Platform always receives 35% commission
 * - Creator + Agency split ONLY within creator's 65%
 * - No modification to token prices or discovery algorithms
 */

import { db, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { applyAgencyEarningsSplit } from './pack114-agency-engine';
import { EarningSourceType } from './creatorEarnings';

// ============================================================================
// EXTENDED CREATOR BALANCE WITH AGENCY TRACKING
// ============================================================================

export interface CreatorBalanceExtended {
  userId: string;
  availableTokens: number;
  lifetimeEarned: number;
  agencyEarnings: number;          // Total paid to agency
  updatedAt: Timestamp;
}

// ============================================================================
// PAYOUT RECORD EXTENSION
// ============================================================================

export interface PayoutRecordExtended {
  payoutId: string;
  userId: string;
  
  // Split amounts
  creatorAmount: number;           // Creator's share after agency split
  agencyAmount: number;            // Agency's share (if applicable)
  platformAmount: number;          // Always 35% of gross
  
  // Original gross for verification
  grossAmount: number;
  
  // Agency details (if applicable)
  agencyId?: string;
  agencyPercentage?: number;
  
  // Standard payout fields
  amountTokens: number;
  amountPLN: number;
  method: string;
  status: string;
  
  createdAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// CORE INTEGRATION FUNCTION
// ============================================================================

/**
 * Record earning with automatic agency split calculation
 * This wraps the original recordEarning function from PACK 81
 */
export async function recordEarningWithAgencySplit(params: {
  creatorId: string;
  sourceType: EarningSourceType;
  sourceId: string;
  fromUserId: string;
  grossTokens: number;
  metadata?: Record<string, any>;
}): Promise<{
  earningId: string;
  creatorAmount: number;
  agencyAmount: number;
  platformAmount: number;
}> {
  const { creatorId, sourceType, sourceId, fromUserId, grossTokens, metadata } = params;

  // Calculate platform share (always 35%)
  const platformAmount = Math.floor(grossTokens * 0.35);
  const creatorShareGross = grossTokens - platformAmount; // 65% before agency split

  // Create earnings ledger entry first
  const earningEntry = {
    creatorId,
    sourceType,
    sourceId,
    fromUserId,
    grossTokens,
    netTokensCreator: creatorShareGross, // Will be updated if agency split applies
    commissionAvalo: platformAmount,
    createdAt: Timestamp.now(),
    metadata: metadata || {},
  };

  const ledgerRef = await db.collection('earnings_ledger').add(earningEntry);
  const earningId = ledgerRef.id;

  // Apply agency split if applicable
  const splitResult = await applyAgencyEarningsSplit({
    creatorUserId: creatorId,
    grossTokens,
    sourceType,
    sourceId,
    earningId,
  });

  // Update creator balance with agency-adjusted amount
  await updateCreatorBalanceWithAgency(
    creatorId,
    splitResult.creatorAmount,
    splitResult.agencyAmount
  );

  // Update ledger entry with actual creator amount after split
  if (splitResult.splitApplied) {
    await ledgerRef.update({
      netTokensCreator: splitResult.creatorAmount,
      agencySplitApplied: true,
      agencyAmount: splitResult.agencyAmount,
    });
  }

  logger.info('Earning recorded with agency split', {
    earningId,
    creatorId,
    grossTokens,
    platformAmount,
    creatorAmount: splitResult.creatorAmount,
    agencyAmount: splitResult.agencyAmount,
    splitApplied: splitResult.splitApplied,
  });

  return {
    earningId,
    creatorAmount: splitResult.creatorAmount,
    agencyAmount: splitResult.agencyAmount,
    platformAmount,
  };
}

/**
 * Update creator balance atomically with agency tracking
 */
async function updateCreatorBalanceWithAgency(
  creatorId: string,
  netTokensCreator: number,
  agencyAmount: number
): Promise<void> {
  const balanceRef = db.collection('creator_balances').doc(creatorId);

  await db.runTransaction(async (transaction) => {
    const balanceDoc = await transaction.get(balanceRef);

    if (!balanceDoc.exists) {
      // Create new balance record
      transaction.set(balanceRef, {
        userId: creatorId,
        availableTokens: netTokensCreator,
        lifetimeEarned: netTokensCreator + agencyAmount, // Track total before split
        agencyEarnings: agencyAmount,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Update existing balance
      transaction.update(balanceRef, {
        availableTokens: increment(netTokensCreator),
        lifetimeEarned: increment(netTokensCreator + agencyAmount),
        agencyEarnings: increment(agencyAmount),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

// ============================================================================
// PAYOUT PROCESSING WITH AGENCY SUPPORT
// ============================================================================

/**
 * Process payout with agency split tracking
 * Ensures proper accounting of creator vs agency amounts
 */
export async function processPayoutWithAgencyTracking(params: {
  userId: string;
  amountTokens: number;
  method: 'BANK_TRANSFER' | 'WISE' | 'STRIPE';
  details: Record<string, any>;
}): Promise<{ payoutId: string; creatorAmount: number; agencyAmount: number }> {
  const { userId, amountTokens, method, details } = params;

  // Get current balance
  const balanceDoc = await db.collection('creator_balances').doc(userId).get();
  
  if (!balanceDoc.exists) {
    throw new Error('Creator balance not found');
  }

  const balance = balanceDoc.data() as CreatorBalanceExtended;

  // Verify sufficient balance
  if (balance.availableTokens < amountTokens) {
    throw new Error('Insufficient balance');
  }

  // Check for active agency link to determine split
  const linkQuery = await db
    .collection('creator_agency_links')
    .where('creatorUserId', '==', userId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  let agencyAmount = 0;
  let agencyId: string | undefined;
  let agencyPercentage: number | undefined;

  if (!linkQuery.empty) {
    const link = linkQuery.docs[0].data();
    agencyPercentage = link.percentageForAgency;
    agencyId = link.agencyId;
    
    // Calculate proportional agency amount from payout
    // This maintains the same ratio as earnings
    agencyAmount = Math.floor(amountTokens * (agencyPercentage / 100));
  }

  const creatorAmount = amountTokens - agencyAmount;
  const payoutId = db.collection('payouts').doc().id;

  // Calculate PLN conversion (example rate, should be dynamic)
  const TOKEN_TO_PLN_RATE = 0.1; // Example: 1 token = 0.1 PLN
  const amountPLN = amountTokens * TOKEN_TO_PLN_RATE;

  // Create payout record
  const payoutRecord: PayoutRecordExtended = {
    payoutId,
    userId,
    creatorAmount,
    agencyAmount,
    platformAmount: 0, // Platform commission already taken during earning
    grossAmount: amountTokens,
    agencyId,
    agencyPercentage,
    amountTokens,
    amountPLN,
    method,
    status: 'PENDING',
    createdAt: Timestamp.now(),
  };

  // Transaction: create payout and update balances
  await db.runTransaction(async (transaction) => {
    const payoutRef = db.collection('payouts').doc(payoutId);
    transaction.set(payoutRef, payoutRecord);

    // Deduct from creator balance
    transaction.update(balanceDoc.ref, {
      availableTokens: increment(-amountTokens),
      updatedAt: serverTimestamp(),
    });

    // If agency split applies, track agency payout separately
    if (agencyAmount > 0 && agencyId) {
      const agencyPayoutRef = db.collection('agency_payouts').doc();
      transaction.set(agencyPayoutRef, {
        payoutId: agencyPayoutRef.id,
        agencyId,
        linkedPayoutId: payoutId,
        creatorUserId: userId,
        amountTokens: agencyAmount,
        amountPLN: agencyAmount * TOKEN_TO_PLN_RATE,
        method,
        status: 'PENDING',
        kycVerified: false, // Will be checked separately
        requestedAt: serverTimestamp(),
      });
    }
  });

  logger.info('Payout processed with agency tracking', {
    payoutId,
    userId,
    amountTokens,
    creatorAmount,
    agencyAmount,
    agencyId,
  });

  return { payoutId, creatorAmount, agencyAmount };
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Get creator earnings summary with agency breakdown
 */
export async function getCreatorEarningsSummaryWithAgency(
  userId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalEarnings: number;
  creatorShare: number;
  agencyShare: number;
  platformShare: number;
  agencyPercentage: number | null;
}> {
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

  let totalEarnings = 0;
  let creatorShare = 0;
  let agencyShare = 0;
  let platformShare = 0;

  snapshot.forEach((doc) => {
    const entry = doc.data();
    totalEarnings += entry.grossTokens || 0;
    creatorShare += entry.netTokensCreator || 0;
    agencyShare += entry.agencyAmount || 0;
    platformShare += entry.commissionAvalo || 0;
  });

  // Get current agency percentage if linked
  const linkQuery = await db
    .collection('creator_agency_links')
    .where('creatorUserId', '==', userId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  const agencyPercentage = linkQuery.empty
    ? null
    : linkQuery.docs[0].data().percentageForAgency;

  return {
    totalEarnings,
    creatorShare,
    agencyShare,
    platformShare,
    agencyPercentage,
  };
}

/**
 * Get agency earnings summary across all linked creators
 */
export async function getAgencyEarningsSummary(
  agencyId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalCreatorEarnings: number;
  totalAgencyEarnings: number;
  linkedCreatorCount: number;
  topEarners: Array<{ creatorId: string; agencyEarnings: number }>;
}> {
  // Get all active links
  const linksQuery = await db
    .collection('creator_agency_links')
    .where('agencyId', '==', agencyId)
    .where('status', '==', 'ACTIVE')
    .get();

  if (linksQuery.empty) {
    return {
      totalCreatorEarnings: 0,
      totalAgencyEarnings: 0,
      linkedCreatorCount: 0,
      topEarners: [],
    };
  }

  const creatorIds = linksQuery.docs.map((doc) => doc.data().creatorUserId);

  // Get earnings splits for all linked creators
  let splitsQuery: FirebaseFirestore.Query = db
    .collection('agency_earnings_splits')
    .where('agencyId', '==', agencyId);

  if (fromDate) {
    splitsQuery = splitsQuery.where('createdAt', '>=', Timestamp.fromDate(fromDate));
  }
  if (toDate) {
    splitsQuery = splitsQuery.where('createdAt', '<=', Timestamp.fromDate(toDate));
  }

  const splitsSnapshot = await splitsQuery.get();

  let totalCreatorEarnings = 0;
  let totalAgencyEarnings = 0;
  const earningsByCreator: Record<string, number> = {};

  splitsSnapshot.forEach((doc) => {
    const split = doc.data();
    totalCreatorEarnings += split.creatorAmount || 0;
    totalAgencyEarnings += split.agencyAmount || 0;

    if (split.creatorUserId) {
      earningsByCreator[split.creatorUserId] =
        (earningsByCreator[split.creatorUserId] || 0) + (split.agencyAmount || 0);
    }
  });

  // Get top earners
  const topEarners = Object.entries(earningsByCreator)
    .map(([creatorId, agencyEarnings]) => ({ creatorId, agencyEarnings }))
    .sort((a, b) => b.agencyEarnings - a.agencyEarnings)
    .slice(0, 10);

  return {
    totalCreatorEarnings,
    totalAgencyEarnings,
    linkedCreatorCount: creatorIds.length,
    topEarners,
  };
}

// ============================================================================
// MIGRATION HELPER
// ============================================================================

/**
 * Backfill agency earnings for existing ledger entries
 * Should be run once during deployment
 */
export async function backfillAgencyEarnings(): Promise<{
  processedCount: number;
  errorCount: number;
}> {
  logger.info('Starting agency earnings backfill');

  const batch = db.batch();
  let processedCount = 0;
  let errorCount = 0;

  try {
    // Get all earnings that don't have agency split info
    const earningsSnapshot = await db
      .collection('earnings_ledger')
      .where('agencySplitApplied', '==', null)
      .limit(500)
      .get();

    for (const earningDoc of earningsSnapshot.docs) {
      try {
        const earning = earningDoc.data();
        
        // Check if there was an active link at the time
        const linkSnapshot = await db
          .collection('creator_agency_links')
          .where('creatorUserId', '==', earning.creatorId)
          .where('status', '==', 'ACTIVE')
          .where('createdAt', '<=', earning.createdAt)
          .limit(1)
          .get();

        if (!linkSnapshot.empty) {
          const link = linkSnapshot.docs[0].data();
          const creatorShareBefore = earning.netTokensCreator || 0;
          const agencyAmount = Math.floor(
            creatorShareBefore * (link.percentageForAgency / 100)
          );
          const creatorAmount = creatorShareBefore - agencyAmount;

          batch.update(earningDoc.ref, {
            netTokensCreator: creatorAmount,
            agencySplitApplied: true,
            agencyAmount,
          });
        } else {
          batch.update(earningDoc.ref, {
            agencySplitApplied: false,
            agencyAmount: 0,
          });
        }

        processedCount++;
      } catch (error) {
        errorCount++;
        logger.error('Error backfilling earning', { earningId: earningDoc.id, error });
      }
    }

    await batch.commit();

    logger.info('Agency earnings backfill completed', { processedCount, errorCount });

    return { processedCount, errorCount };
  } catch (error: any) {
    logger.error('Error in backfill process', error);
    throw error;
  }
}