import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 114 — Earnings Integration with Agency Splits
 * Extends PACK 81 Creator Earnings to support agency revenue attribution
 * 
 * COMPLIANCE-SAFE REVENUE ATTRIBUTION:
 * - Platform always receives 35% commission
 * - Creator + Agency split ONLY within earner's 65%
 * - No modification to token prices or discovery algorithms
 */

import { db, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { applyAgencyEarningsSplit } from './pack114-agency-engine';
import { EarningSourceType } from './earnerEarnings';
import { admin, functions } from './runtime';

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
  earnerAmount: number;           // Creator's share after agency split
  agencyAmount: number;            // Agency's share (if applicable)
  platformAmount: number;          // Always 35% of gross
  
  // Original gross for verification
  grossAmount: number;
  
  // Agency details (if applicable)
  agencyId?: string;
  agencyPercentage?: number;
  
  // Standard payout fields
  amountTokens: number;
  amountUSD: number;
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
  earnerId: string;
  sourceType: EarningSourceType;
  sourceId: string;
  fromUserId: string;
  grossTokens: number;
  metadata?: Record<string, any>;
}): Promise<{
  earningId: string;
  earnerAmount: number;
  agencyAmount: number;
  platformAmount: number;
}> {
  const { earnerId, sourceType, sourceId, fromUserId, grossTokens, metadata } = params;

  // Calculate platform share (always 35%)
  const platformAmount = Math.floor(grossTokens * MONETIZATION_SPLITS.CHAT.platform);
  const earnerGross = grossTokens - platformAmount; // 65% before agency split

  // Create earnings ledger entry first
  const earningEntry = {
    earnerId,
    sourceType,
    sourceId,
    fromUserId,
    grossTokens,
    netTokensCreator: earnerGross, // Will be updated if agency split applies
    commissionAvalo: platformAmount,
    createdAt: Timestamp.now(),
    metadata: metadata || {},
  };

  const ledgerRef = await db.collection('earnings_ledger').add(earningEntry);
  const earningId = ledgerRef.id;

  // Apply agency split if applicable
  const splitResult = await applyAgencyEarningsSplit({
    earnerUserId: earnerId,
    grossTokens,
    sourceType,
    sourceId,
    earningId,
  });

  // Update earner balance with agency-adjusted amount
  await updateCreatorBalanceWithAgency(
    earnerId,
    splitResult.earnerAmount,
    splitResult.agencyAmount
  );

  // Update ledger entry with actual earner amount after split
  if (splitResult.splitApplied) {
    await ledgerRef.update({
      netTokensCreator: splitResult.earnerAmount,
      agencySplitApplied: true,
      agencyAmount: splitResult.agencyAmount,
    });
  }

  logger.info('Earning recorded with agency split', {
    earningId,
    earnerId,
    grossTokens,
    platformAmount,
    earnerAmount: splitResult.earnerAmount,
    agencyAmount: splitResult.agencyAmount,
    splitApplied: splitResult.splitApplied,
  });

  return {
    earningId,
    earnerAmount: splitResult.earnerAmount,
    agencyAmount: splitResult.agencyAmount,
    platformAmount,
  };
}

/**
 * Update earner balance atomically with agency tracking
 */
async function updateCreatorBalanceWithAgency(
  earnerId: string,
  netTokensCreator: number,
  agencyAmount: number
): Promise<void> {
  const balanceRef = db.collection('earner_balances').doc(earnerId);

  await db.runTransaction(async (transaction) => {
    const balanceDoc = await transaction.get(balanceRef);

    if (!balanceDoc.exists) {
      // Create new balance record
      transaction.set(balanceRef, {
        userId: earnerId,
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
 * Ensures proper accounting of earner vs agency amounts
 */
export async function processPayoutWithAgencyTracking(params: {
  userId: string;
  amountTokens: number;
  method: 'BANK_TRANSFER' | 'WISE' | 'STRIPE';
  details: Record<string, any>;
}): Promise<{ payoutId: string; earnerAmount: number; agencyAmount: number }> {
  const { userId, amountTokens, method, details } = params;

  // Get current balance
  const balanceDoc = await db.collection('earner_balances').doc(userId).get();
  
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
    .collection('earner_agency_links')
    .where('earnerUserId', '==', userId)
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

  const earnerAmount = amountTokens - agencyAmount;
  const payoutId = db.collection('payouts').doc().id;

  // Calculate USD conversion (example rate, should be dynamic)
  const TOKEN_PAYOUT_USD = 0.1; // Example: 1 token = 0.1 USD
  const amountUSD = amountTokens * TOKEN_PAYOUT_USD;

  // Create payout record
  const payoutRecord: PayoutRecordExtended = {
    payoutId,
    userId,
    earnerAmount,
    agencyAmount,
    platformAmount: 0, // Platform commission already taken during earning
    grossAmount: amountTokens,
    agencyId,
    agencyPercentage,
    amountTokens,
    amountUSD,
    method,
    status: 'PENDING',
    createdAt: Timestamp.now(),
  };

  // Transaction: create payout and update balances
  await db.runTransaction(async (transaction) => {
    const payoutRef = db.collection('payouts').doc(payoutId);
    transaction.set(payoutRef, payoutRecord);

    // Deduct from earner balance
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
        earnerUserId: userId,
        amountTokens: agencyAmount,
        amountUSD: agencyAmount * TOKEN_PAYOUT_USD,
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
    earnerAmount,
    agencyAmount,
    agencyId,
  });

  return { payoutId, earnerAmount, agencyAmount };
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Get earner earnings summary with agency breakdown
 */
export async function getCreatorEarningsSummaryWithAgency(
  userId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalEarnings: number;
  earner: number;
  agencyShare: number;
  platform: number;
  agencyPercentage: number | null;
}> {
  let query: FirebaseFirestore.Query = db
    .collection('earnings_ledger')
    .where('earnerId', '==', userId);

  if (fromDate) {
    query = query.where('createdAt', '>=', Timestamp.fromDate(fromDate));
  }
  if (toDate) {
    query = query.where('createdAt', '<=', Timestamp.fromDate(toDate));
  }

  const snapshot = await query.get();

  let totalEarnings = 0;
  let earner = 0;
  let agencyShare = 0;
  let platform = 0;

  snapshot.forEach((doc) => {
    const entry = doc.data();
    totalEarnings += entry.grossTokens || 0;
    earner += entry.netTokensCreator || 0;
    agencyShare += entry.agencyAmount || 0;
    platform += entry.commissionAvalo || 0;
  });

  // Get current agency percentage if linked
  const linkQuery = await db
    .collection('earner_agency_links')
    .where('earnerUserId', '==', userId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  const agencyPercentage = linkQuery.empty
    ? null
    : linkQuery.docs[0].data().percentageForAgency;

  return {
    totalEarnings,
    earner,
    agencyShare,
    platform,
    agencyPercentage,
  };
}

/**
 * Get agency earnings summary across all linked earners
 */
export async function getAgencyEarningsSummary(
  agencyId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalCreatorEarnings: number;
  totalAgencyEarnings: number;
  linkedCreatorCount: number;
  topEarners: Array<{ earnerId: string; agencyEarnings: number }>;
}> {
  // Get all active links
  const linksQuery = await db
    .collection('earner_agency_links')
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

  const earnerIds = linksQuery.docs.map((doc) => doc.data().earnerUserId);

  // Get earnings splits for all linked earners
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
    totalCreatorEarnings += split.earnerAmount || 0;
    totalAgencyEarnings += split.agencyAmount || 0;

    if (split.earnerUserId) {
      earningsByCreator[split.earnerUserId] =
        (earningsByCreator[split.earnerUserId] || 0) + (split.agencyAmount || 0);
    }
  });

  // Get top earners
  const topEarners = Object.entries(earningsByCreator)
    .map(([earnerId, agencyEarnings]) => ({ earnerId, agencyEarnings }))
    .sort((a, b) => b.agencyEarnings - a.agencyEarnings)
    .slice(0, 10);

  return {
    totalCreatorEarnings,
    totalAgencyEarnings,
    linkedCreatorCount: earnerIds.length,
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
          .collection('earner_agency_links')
          .where('earnerUserId', '==', earning.earnerId)
          .where('status', '==', 'ACTIVE')
          .where('createdAt', '<=', earning.createdAt)
          .limit(1)
          .get();

        if (!linkSnapshot.empty) {
          const link = linkSnapshot.docs[0].data();
          const earnerBefore = earning.netTokensCreator || 0;
          const agencyAmount = Math.floor(
            earnerBefore * (link.percentageForAgency / 100)
          );
          const earnerAmount = earnerBefore - agencyAmount;

          batch.update(earningDoc.ref, {
            netTokensCreator: earnerAmount,
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






























