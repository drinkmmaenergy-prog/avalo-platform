import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 460 — AVALO Paid Visibility Engine (Boost System)
 * Canonical Boost Economy Spec v1
 *
 * HARD RULES:
 * - Boost revenue = 100% AVALO. No split. No refunds.
 * - Tokens deducted per confirmed impression.
 * - All mutations go through unified wallet + ledger.
 * - No parallel boost engines allowed.
 * - Fully separated from Chat Monetization.
 *
 * This module implements:
 * 1. Campaign CRUD (create, pause, resume, complete)
 * 2. Impression confirmation with atomic wallet deduction + ledger write
 * 3. Pacing engine (EVEN, ACCELERATED)
 * 4. Ranking hook (boostScore additive to organic scoring)
 * 5. Anti-whale limits (max campaigns, density, region dominance)
 *
 * @module pack460-boost-visibility-engine
 */

import { db, serverTimestamp, increment, generateId, FieldValue } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  BoostCampaign,
  BoostCampaignStatus,
  BoostImpression,
  BoostImpressionLedgerEntry,
  BoostPlacement,
  BoostPacingMode,
  BoostScoreResult,
  CreateBoostCampaignRequest,
  CreateBoostCampaignResponse,
  ConfirmImpressionRequest,
  ConfirmImpressionResponse,
  BOOST_CAMPAIGN_CONSTANTS,
} from './types/boostCampaign.types';

// ============================================================================
// CONSTANTS (re-exported for convenience)
// ============================================================================

const C = BOOST_CAMPAIGN_CONSTANTS;

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: unknown[]) => console.log('[BoostVisibilityEngine]', ...args),
  warn: (...args: unknown[]) => console.warn('[BoostVisibilityEngine]', ...args),
  error: (...args: unknown[]) => console.error('[BoostVisibilityEngine]', ...args),
};

// ============================================================================
// 1. CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * Create a new boost campaign.
 *
 * Validates:
 *  - Max 3 active campaigns per user
 *  - Budget >= MIN_CAMPAIGN_BUDGET
 *  - CPI within allowed range
 *  - User wallet has sufficient balance
 *
 * On success:
 *  - Deducts totalBudget from advertiser wallet (atomic)
 *  - Creates campaign document in boost_campaigns
 *  - Writes BOOST ledger entry
 */
export async function createBoostCampaign(
  request: CreateBoostCampaignRequest
): Promise<CreateBoostCampaignResponse> {
  const {
    advertiserId,
    name,
    targetContentId,
    targetContentType,
    placements,
    pacingMode,
    costPerImpression,
    totalBudget,
    maxImpressions,
    startAt,
    endAt,
    targetRegion,
    targetCountry,
  } = request;

  // --- Input validation ---
  if (!advertiserId || !name || !targetContentId || !placements || placements.length === 0) {
    return { success: false, error: 'Missing required fields' };
  }

  if (costPerImpression < C.MIN_COST_PER_IMPRESSION || costPerImpression > C.MAX_COST_PER_IMPRESSION) {
    return {
      success: false,
      error: `Cost per impression must be between ${C.MIN_COST_PER_IMPRESSION} and ${C.MAX_COST_PER_IMPRESSION} tokens`,
    };
  }

  if (totalBudget < C.MIN_CAMPAIGN_BUDGET) {
    return {
      success: false,
      error: `Minimum campaign budget is ${C.MIN_CAMPAIGN_BUDGET} tokens`,
    };
  }

  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    return { success: false, error: 'End date must be after start date' };
  }

  // --- Anti-whale: max 3 active campaigns per user ---
  const activeCampaignsSnap = await db
    .collection(C.COLLECTION_CAMPAIGNS)
    .where('advertiserId', '==', advertiserId)
    .where('status', 'in', ['PENDING', 'ACTIVE'])
    .get();

  if (activeCampaignsSnap.size >= C.MAX_ACTIVE_CAMPAIGNS_PER_USER) {
    return {
      success: false,
      error: `Maximum ${C.MAX_ACTIVE_CAMPAIGNS_PER_USER} active campaigns per user`,
    };
  }

  // --- Atomic wallet deduction + campaign creation ---
  const campaignId = generateId();
  const walletRef = db.collection(C.COLLECTION_USER_WALLETS).doc(advertiserId);
  const campaignRef = db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId);
  const ledgerRef = db.collection(C.COLLECTION_LEDGER).doc(generateId());

  try {
    await db.runTransaction(async (transaction) => {
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists) {
        throw new Error('WALLET_NOT_FOUND');
      }

      const wallet = walletSnap.data()!;
      const availableTokens = wallet.availableTokens ?? 0;

      if (availableTokens < totalBudget) {
        throw new Error(`INSUFFICIENT_BALANCE:${availableTokens}`);
      }

      // Deduct budget from wallet
      transaction.update(walletRef, {
        availableTokens: FieldValue.increment(-totalBudget),
        lifetimeSpent: FieldValue.increment(totalBudget),
        lastSpendAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create campaign document
      const now = Timestamp.now();
      const campaign: BoostCampaign = {
        campaignId,
        advertiserId,
        name,
        targetContentId,
        targetContentType,
        placements,
        status: 'ACTIVE' as BoostCampaignStatus,
        pacingMode,
        costPerImpression,
        totalBudget,
        spentBudget: 0,
        remainingBudget: totalBudget,
        impressionsDelivered: 0,
        maxImpressions: maxImpressions ?? 0,
        startAt: Timestamp.fromDate(new Date(startAt)),
        endAt: Timestamp.fromDate(new Date(endAt)),
        targetRegion,
        targetCountry,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(campaignRef, campaign);

      // Ledger entry for budget allocation
      transaction.set(ledgerRef, {
        ledgerId: ledgerRef.id,
        eventType: 'SPEND',
        userId: advertiserId,
        tokenAmount: -totalBudget,
        vault: 'USER',
        timestamp: now,
        metadata: {
          transactionType: 'BOOST',
          description: `Boost campaign budget allocation: ${name}`,
          campaignId,
          balanceAfter: availableTokens - totalBudget,
        },
      });
    });

    logger.info(`Campaign created: ${campaignId} for advertiser ${advertiserId}`);
    return { success: true, campaignId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'WALLET_NOT_FOUND') {
      return { success: false, error: 'Advertiser wallet not found' };
    }
    if (message.startsWith('INSUFFICIENT_BALANCE')) {
      const available = message.split(':')[1];
      return {
        success: false,
        error: `Insufficient balance. Required: ${totalBudget}, Available: ${available}`,
      };
    }

    logger.error('Failed to create campaign:', error);
    return { success: false, error: 'Internal error creating campaign' };
  }
}

/**
 * Pause a running campaign.
 */
export async function pauseBoostCampaign(
  campaignId: string,
  advertiserId: string
): Promise<{ success: boolean; error?: string }> {
  const campaignRef = db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId);
  const snap = await campaignRef.get();

  if (!snap.exists) {
    return { success: false, error: 'Campaign not found' };
  }

  const campaign = snap.data() as BoostCampaign;

  if (campaign.advertiserId !== advertiserId) {
    return { success: false, error: 'Permission denied' };
  }

  if (campaign.status !== 'ACTIVE') {
    return { success: false, error: `Cannot pause campaign in status: ${campaign.status}` };
  }

  await campaignRef.update({
    status: 'PAUSED',
    updatedAt: serverTimestamp(),
  });

  logger.info(`Campaign paused: ${campaignId}`);
  return { success: true };
}

/**
 * Resume a paused campaign.
 */
export async function resumeBoostCampaign(
  campaignId: string,
  advertiserId: string
): Promise<{ success: boolean; error?: string }> {
  const campaignRef = db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId);
  const snap = await campaignRef.get();

  if (!snap.exists) {
    return { success: false, error: 'Campaign not found' };
  }

  const campaign = snap.data() as BoostCampaign;

  if (campaign.advertiserId !== advertiserId) {
    return { success: false, error: 'Permission denied' };
  }

  if (campaign.status !== 'PAUSED') {
    return { success: false, error: `Cannot resume campaign in status: ${campaign.status}` };
  }

  if (campaign.remainingBudget <= 0) {
    return { success: false, error: 'Campaign budget exhausted' };
  }

  await campaignRef.update({
    status: 'ACTIVE',
    updatedAt: serverTimestamp(),
  });

  logger.info(`Campaign resumed: ${campaignId}`);
  return { success: true };
}

/**
 * Get all campaigns for an advertiser.
 */
export async function getAdvertiserCampaigns(
  advertiserId: string,
  statusFilter?: BoostCampaignStatus[]
): Promise<BoostCampaign[]> {
  let query: FirebaseFirestore.Query = db
    .collection(C.COLLECTION_CAMPAIGNS)
    .where('advertiserId', '==', advertiserId);

  if (statusFilter && statusFilter.length > 0) {
    query = query.where('status', 'in', statusFilter);
  }

  const snap = await query.orderBy('createdAt', 'desc').get();
  return snap.docs.map((doc) => doc.data() as BoostCampaign);
}

// ============================================================================
// 2. IMPRESSION CONFIRMATION — ATOMIC WALLET + LEDGER
// ============================================================================

/**
 * Confirm a single impression.
 *
 * This is the core billing mutation:
 *  1. Validates campaign is active and has budget
 *  2. Checks pacing eligibility
 *  3. Atomic transaction:
 *     - Deducts costPerImpression from campaign.remainingBudget
 *     - Credits AVALO_PLATFORM wallet
 *     - Writes impression document
 *     - Writes ledger entry (type=BOOST_IMPRESSION)
 *     - Updates campaign stats
 *  4. If budget exhausted → sets status to BUDGET_EXHAUSTED
 */
export async function confirmImpression(
  request: ConfirmImpressionRequest
): Promise<ConfirmImpressionResponse> {
  const { campaignId, viewerUserId, placement } = request;

  if (!campaignId || !viewerUserId || !placement) {
    return { success: false, error: 'Missing required fields' };
  }

  const campaignRef = db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId);
  const impressionId = generateId();
  const impressionRef = db.collection(C.COLLECTION_IMPRESSIONS).doc(impressionId);
  const ledgerId = generateId();
  const ledgerRef = db.collection(C.COLLECTION_LEDGER).doc(ledgerId);
  const platformWalletRef = db.collection(C.COLLECTION_AVALO_VAULT).doc('platform');

  try {
    let tokensCharged = 0;

    await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef);

      if (!campaignSnap.exists) {
        throw new Error('CAMPAIGN_NOT_FOUND');
      }

      const campaign = campaignSnap.data() as BoostCampaign;

      // Validate campaign is active
      if (campaign.status !== 'ACTIVE') {
        throw new Error(`CAMPAIGN_NOT_ACTIVE:${campaign.status}`);
      }

      // Validate campaign has not expired
      const now = Timestamp.now();
      if (campaign.endAt.toMillis() < now.toMillis()) {
        throw new Error('CAMPAIGN_EXPIRED');
      }

      // Validate budget
      if (campaign.remainingBudget < campaign.costPerImpression) {
        throw new Error('BUDGET_EXHAUSTED');
      }

      // Validate max impressions
      if (campaign.maxImpressions > 0 && campaign.impressionsDelivered >= campaign.maxImpressions) {
        throw new Error('MAX_IMPRESSIONS_REACHED');
      }

      // Check pacing eligibility
      const pacingAllowed = checkPacingEligibility(campaign, now);
      if (!pacingAllowed) {
        throw new Error('PACING_THROTTLED');
      }

      tokensCharged = campaign.costPerImpression;
      const newRemainingBudget = campaign.remainingBudget - tokensCharged;
      const newSpentBudget = campaign.spentBudget + tokensCharged;
      const newImpressionsDelivered = campaign.impressionsDelivered + 1;

      // Determine if budget will be exhausted after this impression
      const willExhaust = newRemainingBudget < campaign.costPerImpression;
      const newStatus: BoostCampaignStatus = willExhaust ? 'BUDGET_EXHAUSTED' : campaign.status;

      // Update campaign atomically
      transaction.update(campaignRef, {
        remainingBudget: FieldValue.increment(-tokensCharged),
        spentBudget: FieldValue.increment(tokensCharged),
        impressionsDelivered: FieldValue.increment(1),
        status: newStatus,
        updatedAt: now,
      });

      // Credit AVALO_PLATFORM wallet
      transaction.set(
        platformWalletRef,
        {
          id: 'platform',
          totalRevenue: FieldValue.increment(tokensCharged),
          availableRevenue: FieldValue.increment(tokensCharged),
          lastRevenueAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      // Write impression document
      const impression: BoostImpression = {
        impressionId,
        campaignId,
        advertiserId: campaign.advertiserId,
        viewerUserId,
        placement,
        tokensCharged,
        ledgerEntryId: ledgerId,
        status: 'CONFIRMED',
        servedAt: now,
        confirmedAt: now,
      };
      transaction.set(impressionRef, impression);

      // Write ledger entry (type=BOOST_IMPRESSION)
      const ledgerEntry: BoostImpressionLedgerEntry = {
        ledgerId,
        eventType: 'BOOST_IMPRESSION',
        campaignId,
        impressionId,
        advertiserId: campaign.advertiserId,
        tokenAmount: tokensCharged,
        vault: 'AVALO_REVENUE',
        timestamp: now,
        metadata: {
          transactionType: 'BOOST',
          placement,
          viewerUserId,
          campaignName: campaign.name,
          description: `Boost impression: campaign ${campaign.name} (${campaignId})`,
        },
      };
      transaction.set(ledgerRef, ledgerEntry);
    });

    return { success: true, impressionId, tokensCharged };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (
      message === 'CAMPAIGN_NOT_FOUND' ||
      message.startsWith('CAMPAIGN_NOT_ACTIVE') ||
      message === 'CAMPAIGN_EXPIRED' ||
      message === 'BUDGET_EXHAUSTED' ||
      message === 'MAX_IMPRESSIONS_REACHED' ||
      message === 'PACING_THROTTLED'
    ) {
      return { success: false, error: message };
    }

    logger.error('Failed to confirm impression:', error);
    return { success: false, error: 'Internal error confirming impression' };
  }
}

// ============================================================================
// 3. PACING ENGINE
// ============================================================================

/**
 * Check if an impression can be served based on pacing mode.
 *
 * EVEN pacing:
 *   Distributes impressions evenly across the campaign duration.
 *   Calculates expected impressions at current time and compares to actual.
 *
 * ACCELERATED pacing:
 *   No throttling — deliver as fast as possible.
 */
function checkPacingEligibility(campaign: BoostCampaign, now: Timestamp): boolean {
  if (campaign.pacingMode === 'ACCELERATED') {
    return true; // No throttling
  }

  // EVEN pacing
  const startMs = campaign.startAt.toMillis();
  const endMs = campaign.endAt.toMillis();
  const nowMs = now.toMillis();
  const totalDurationMs = endMs - startMs;
  const elapsedMs = nowMs - startMs;

  if (totalDurationMs <= 0 || elapsedMs <= 0) {
    return true; // Campaign just started or invalid duration
  }

  const progressFraction = Math.min(elapsedMs / totalDurationMs, 1.0);

  // Calculate expected impressions at this point
  const maxPossibleImpressions = campaign.maxImpressions > 0
    ? campaign.maxImpressions
    : Math.floor(campaign.totalBudget / campaign.costPerImpression);

  const expectedImpressions = Math.floor(maxPossibleImpressions * progressFraction);

  // Allow if below or at expected pace (with 10% buffer for burst tolerance)
  const buffer = Math.max(1, Math.ceil(maxPossibleImpressions * 0.10));
  return campaign.impressionsDelivered <= expectedImpressions + buffer;
}

/**
 * Public pacing check for external callers.
 */
export async function isPacingAllowed(campaignId: string): Promise<boolean> {
  const snap = await db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId).get();
  if (!snap.exists) return false;

  const campaign = snap.data() as BoostCampaign;
  if (campaign.status !== 'ACTIVE') return false;

  return checkPacingEligibility(campaign, Timestamp.now());
}

// ============================================================================
// 4. RANKING HOOK — boostScore additive to organic scoring
// ============================================================================

/**
 * Calculate boost score for a candidate profile in a given placement.
 *
 * This score is ADDITIVE to the organic ranking score.
 * The organic scoring logic in discoveryEngineV2 / feedDiscovery / matchingEngine
 * remains untouched.
 *
 * Boost score is normalized 0-0.3 so it cannot overwhelm organic signals.
 * Sponsored density and region dominance are enforced by the caller.
 *
 * @param targetContentId - The content/profile being scored
 * @param placement - Where the score is being calculated for
 * @returns BoostScoreResult with additive boostScore and metadata
 */
export async function calculateBoostScore(
  targetContentId: string,
  placement: BoostPlacement
): Promise<BoostScoreResult> {
  const defaultResult: BoostScoreResult = {
    boostScore: 0,
    campaignIds: [],
    isSponsored: false,
  };

  try {
    const now = Timestamp.now();

    // Find active campaigns for this content and placement
    const campaignsSnap = await db
      .collection(C.COLLECTION_CAMPAIGNS)
      .where('targetContentId', '==', targetContentId)
      .where('status', '==', 'ACTIVE')
      .where('startAt', '<=', now)
      .get();

    if (campaignsSnap.empty) {
      return defaultResult;
    }

    let totalBoostScore = 0;
    const campaignIds: string[] = [];

    for (const doc of campaignsSnap.docs) {
      const campaign = doc.data() as BoostCampaign;

      // Check placement matches
      if (!campaign.placements.includes(placement)) {
        continue;
      }

      // Check not expired
      if (campaign.endAt.toMillis() < now.toMillis()) {
        continue;
      }

      // Check has budget
      if (campaign.remainingBudget < campaign.costPerImpression) {
        continue;
      }

      // Check pacing
      if (!checkPacingEligibility(campaign, now)) {
        continue;
      }

      // Boost score based on CPI (higher CPI = stronger boost, capped at 0.3)
      const cpiNormalized = Math.min(campaign.costPerImpression / C.MAX_COST_PER_IMPRESSION, 1.0);
      const campaignBoost = cpiNormalized * 0.3; // Max 0.3 per campaign

      totalBoostScore += campaignBoost;
      campaignIds.push(campaign.campaignId);
    }

    // Cap total boost score at 0.3 to prevent overwhelming organic ranking
    totalBoostScore = Math.min(totalBoostScore, 0.3);

    return {
      boostScore: totalBoostScore,
      campaignIds,
      isSponsored: campaignIds.length > 0,
    };
  } catch (error) {
    logger.error('Error calculating boost score:', error);
    return defaultResult;
  }
}

/**
 * Get all boosted candidates for a given placement.
 * Used by feed/discovery/swipe ranking to inject sponsored items.
 *
 * Returns only eligible campaigns respecting density and region limits.
 */
export async function getBoostedCandidates(
  placement: BoostPlacement,
  feedSize: number,
  existingRegions?: Map<string, number>
): Promise<{
  candidates: Array<{ targetContentId: string; campaignId: string; boostScore: number; region?: string }>;
  maxSponsoredSlots: number;
}> {
  const maxSponsoredSlots = Math.floor(feedSize * C.MAX_SPONSORED_FEED_DENSITY);

  if (maxSponsoredSlots <= 0) {
    return { candidates: [], maxSponsoredSlots: 0 };
  }

  try {
    const now = Timestamp.now();

    const campaignsSnap = await db
      .collection(C.COLLECTION_CAMPAIGNS)
      .where('status', '==', 'ACTIVE')
      .where('startAt', '<=', now)
      .get();

    const candidates: Array<{
      targetContentId: string;
      campaignId: string;
      boostScore: number;
      region?: string;
    }> = [];

    // Track region counts for dominance enforcement
    const regionCounts = new Map<string, number>(existingRegions || []);
    const maxRegionSlots = Math.floor(feedSize * C.MAX_REGION_DOMINANCE);

    for (const doc of campaignsSnap.docs) {
      const campaign = doc.data() as BoostCampaign;

      // Placement filter
      if (!campaign.placements.includes(placement)) continue;

      // Expiry filter
      if (campaign.endAt.toMillis() < now.toMillis()) continue;

      // Budget filter
      if (campaign.remainingBudget < campaign.costPerImpression) continue;

      // Pacing filter
      if (!checkPacingEligibility(campaign, now)) continue;

      // Region dominance filter
      if (campaign.targetRegion) {
        const currentRegionCount = regionCounts.get(campaign.targetRegion) ?? 0;
        if (currentRegionCount >= maxRegionSlots) {
          continue; // Skip — region is at capacity
        }
        regionCounts.set(campaign.targetRegion, currentRegionCount + 1);
      }

      // Calculate boost score
      const cpiNormalized = Math.min(campaign.costPerImpression / C.MAX_COST_PER_IMPRESSION, 1.0);
      const boostScore = Math.min(cpiNormalized * 0.3, 0.3);

      candidates.push({
        targetContentId: campaign.targetContentId,
        campaignId: campaign.campaignId,
        boostScore,
        region: campaign.targetRegion,
      });

      // Respect density limit
      if (candidates.length >= maxSponsoredSlots) {
        break;
      }
    }

    // Sort by boost score descending
    candidates.sort((a, b) => b.boostScore - a.boostScore);

    return { candidates: candidates.slice(0, maxSponsoredSlots), maxSponsoredSlots };
  } catch (error) {
    logger.error('Error getting boosted candidates:', error);
    return { candidates: [], maxSponsoredSlots };
  }
}

// ============================================================================
// 5. CAMPAIGN LIFECYCLE — Expiration & Cleanup
// ============================================================================

/**
 * Expire campaigns that have passed their endAt time.
 * Should be called by a scheduled Cloud Function.
 */
export async function expireEndedCampaigns(batchSize: number = 200): Promise<number> {
  const now = Timestamp.now();

  const snap = await db
    .collection(C.COLLECTION_CAMPAIGNS)
    .where('status', 'in', ['ACTIVE', 'PAUSED'])
    .where('endAt', '<', now)
    .limit(batchSize)
    .get();

  if (snap.empty) return 0;

  const batch = db.batch();

  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      status: 'COMPLETED' as BoostCampaignStatus,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  logger.info(`Expired ${snap.size} campaigns`);
  return snap.size;
}

/**
 * Refund remaining budget for completed/budget-exhausted campaigns that
 * still have leftover tokens (edge case from EVEN pacing or manual pause).
 *
 * NOTE: This is NOT a refund of spent tokens. Spent tokens = 100% AVALO, no refund.
 * This only returns UNSPENT allocation from the campaign budget.
 */
export async function refundUnspentBudgets(batchSize: number = 100): Promise<number> {
  const snap = await db
    .collection(C.COLLECTION_CAMPAIGNS)
    .where('status', 'in', ['COMPLETED', 'BUDGET_EXHAUSTED', 'PAUSED'])
    .where('remainingBudget', '>', 0)
    .limit(batchSize)
    .get();

  if (snap.empty) return 0;

  let refundedCount = 0;

  for (const doc of snap.docs) {
    const campaign = doc.data() as BoostCampaign;

    if (campaign.remainingBudget <= 0) continue;

    try {
      const walletRef = db.collection(C.COLLECTION_USER_WALLETS).doc(campaign.advertiserId);
      const campaignRef = doc.ref;
      const ledgerRef = db.collection(C.COLLECTION_LEDGER).doc(generateId());

      await db.runTransaction(async (transaction) => {
        // Return unspent tokens to advertiser wallet
        transaction.update(walletRef, {
          availableTokens: FieldValue.increment(campaign.remainingBudget),
          updatedAt: serverTimestamp(),
        });

        // Zero out campaign remaining budget
        transaction.update(campaignRef, {
          remainingBudget: 0,
          updatedAt: serverTimestamp(),
        });

        // Ledger entry for refund of unspent budget
        transaction.set(ledgerRef, {
          ledgerId: ledgerRef.id,
          eventType: 'ADJUSTMENT',
          userId: campaign.advertiserId,
          tokenAmount: campaign.remainingBudget,
          vault: 'USER',
          timestamp: Timestamp.now(),
          metadata: {
            transactionType: 'BOOST',
            description: `Unspent budget return: campaign ${campaign.name} (${campaign.campaignId})`,
            campaignId: campaign.campaignId,
          },
        });
      });

      refundedCount++;
    } catch (error) {
      logger.error(`Failed to refund campaign ${campaign.campaignId}:`, error);
    }
  }

  logger.info(`Refunded unspent budgets for ${refundedCount} campaigns`);
  return refundedCount;
}

// ============================================================================
// 6. CAMPAIGN STATS & QUERIES
// ============================================================================

/**
 * Get campaign by ID.
 */
export async function getBoostCampaign(campaignId: string): Promise<BoostCampaign | null> {
  const snap = await db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId).get();
  return snap.exists ? (snap.data() as BoostCampaign) : null;
}

/**
 * Get impressions for a campaign.
 */
export async function getCampaignImpressions(
  campaignId: string,
  limit: number = 100
): Promise<BoostImpression[]> {
  const snap = await db
    .collection(C.COLLECTION_IMPRESSIONS)
    .where('campaignId', '==', campaignId)
    .orderBy('servedAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => doc.data() as BoostImpression);
}

/**
 * Get ledger entries for a campaign (for replay validation).
 */
export async function getCampaignLedgerEntries(
  campaignId: string
): Promise<BoostImpressionLedgerEntry[]> {
  const snap = await db
    .collection(C.COLLECTION_LEDGER)
    .where('metadata.campaignId', '==', campaignId)
    .where('metadata.transactionType', '==', 'BOOST')
    .orderBy('timestamp', 'asc')
    .get();

  return snap.docs.map((doc) => doc.data() as BoostImpressionLedgerEntry);
}

/**
 * Validate ledger consistency for a campaign.
 * Sum of ledger tokenAmount should equal campaign.spentBudget.
 */
export async function validateCampaignLedger(campaignId: string): Promise<{
  valid: boolean;
  campaignSpent: number;
  ledgerTotal: number;
  impressionCount: number;
  ledgerEntryCount: number;
}> {
  const [campaign, impressions, ledgerEntries] = await Promise.all([
    getBoostCampaign(campaignId),
    getCampaignImpressions(campaignId, 10000),
    getCampaignLedgerEntries(campaignId),
  ]);

  if (!campaign) {
    return { valid: false, campaignSpent: 0, ledgerTotal: 0, impressionCount: 0, ledgerEntryCount: 0 };
  }

  const ledgerTotal = ledgerEntries.reduce((sum, entry) => sum + entry.tokenAmount, 0);
  const impressionCount = impressions.filter((i) => i.status === 'CONFIRMED').length;

  return {
    valid: Math.abs(campaign.spentBudget - ledgerTotal) < 0.01,
    campaignSpent: campaign.spentBudget,
    ledgerTotal,
    impressionCount,
    ledgerEntryCount: ledgerEntries.length,
  };
}


























