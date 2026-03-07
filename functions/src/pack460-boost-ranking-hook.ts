/**
 * PACK 460 — AVALO Paid Visibility Engine: Ranking Integration Hook
 *
 * This module provides non-invasive ranking integration for the Boost Campaign system.
 * It is designed to be called from existing feed/discovery/swipe ranking pipelines
 * WITHOUT modifying their core logic.
 *
 * Integration pattern:
 *   1. Existing ranking produces organic scores as-is (unchanged)
 *   2. This hook adds boostScore additively (max +0.3)
 *   3. Sponsored items are mixed into the feed respecting density limits
 *   4. On each confirmed view, confirmImpression() is called to bill
 *
 * Supported placements:
 *   - FEED (feedDiscovery.ts — Infinite Feed / Popular Today / Rising Stars / Promo Events)
 *   - DISCOVERY (discoveryEngineV2.ts — AI Discovery feed)
 *   - SWIPE (matchingEngine.ts — Swipe-mode ranking)
 *
 * HARD RULES:
 * - This hook MUST NOT modify organic scoring formulas.
 * - boostScore is additive only, capped at 0.3.
 * - Max 30% sponsored density enforced.
 * - Max 20% region dominance enforced.
 *
 * @module pack460-boost-ranking-hook
 */

import {
  calculateBoostScore,
  getBoostedCandidates,
  confirmImpression,
} from './pack460-boost-visibility-engine';
import type {
  BoostPlacement,
  BoostScoreResult,
  BOOST_CAMPAIGN_CONSTANTS,
} from './types/boostCampaign.types';

// ============================================================================
// TYPES
// ============================================================================

export interface RankedItem {
  /** Profile or content ID */
  contentId: string;
  /** Organic score from the existing ranking engine */
  organicScore: number;
  /** Additive boost score (0 if not sponsored) */
  boostScore: number;
  /** Combined final score */
  finalScore: number;
  /** Whether this item is sponsored */
  isSponsored: boolean;
  /** Campaign IDs contributing to boost (empty if not sponsored) */
  campaignIds: string[];
}

export interface RankingHookResult {
  /** Re-ranked items with boost scores included */
  items: RankedItem[];
  /** Number of sponsored items in the result */
  sponsoredCount: number;
  /** Total items returned */
  totalCount: number;
}

// ============================================================================
// FEED RANKING HOOK
// ============================================================================

/**
 * Apply boost scores to an existing ranked feed.
 *
 * Call this AFTER organic ranking is complete.
 * The function:
 *   1. Fetches boost scores for each item
 *   2. Adds boostScore to organicScore
 *   3. Re-sorts by finalScore
 *   4. Enforces 30% sponsored density
 *   5. Enforces 20% region dominance
 *
 * @param rankedContentIds - Content IDs in organic rank order
 * @param organicScores - Map of contentId → organic score
 * @param placement - Where the feed is being shown
 * @returns Re-ranked items with boost integration
 */
export async function applyBoostToFeed(
  rankedContentIds: string[],
  organicScores: Map<string, number>,
  placement: BoostPlacement
): Promise<RankingHookResult> {
  const items: RankedItem[] = [];
  let sponsoredCount = 0;
  const maxSponsored = Math.floor(rankedContentIds.length * MONETIZATION_SPLITS.SUBSCRIPTION.avalo);

  for (const contentId of rankedContentIds) {
    const organicScore = organicScores.get(contentId) ?? 0;

    let boostResult: BoostScoreResult = {
      boostScore: 0,
      campaignIds: [],
      isSponsored: false,
    };

    // Only calculate boost if we haven't hit density limit
    if (sponsoredCount < maxSponsored) {
      boostResult = await calculateBoostScore(contentId, placement);
    }

    if (boostResult.isSponsored) {
      sponsoredCount++;
    }

    items.push({
      contentId,
      organicScore,
      boostScore: boostResult.boostScore,
      finalScore: organicScore + boostResult.boostScore,
      isSponsored: boostResult.isSponsored,
      campaignIds: boostResult.campaignIds,
    });
  }

  // Re-sort by finalScore descending
  items.sort((a, b) => b.finalScore - a.finalScore);

  return {
    items,
    sponsoredCount,
    totalCount: items.length,
  };
}

/**
 * Inject boosted candidates into an existing feed.
 *
 * Alternative to applyBoostToFeed: instead of re-scoring existing items,
 * this fetches sponsored candidates and merges them into the feed
 * at distributed positions (every 3-4 items, up to density limit).
 *
 * @param organicFeed - Organic feed items in rank order
 * @param placement - Feed placement type
 * @returns Merged feed with sponsored items interleaved
 */
export async function injectBoostedCandidates(
  organicFeed: Array<{ contentId: string; score: number }>,
  placement: BoostPlacement
): Promise<{
  mergedFeed: Array<{ contentId: string; score: number; isSponsored: boolean; campaignId?: string }>;
  sponsoredCount: number;
}> {
  const feedSize = organicFeed.length;

  // Fetch boosted candidates respecting density and region limits
  const { candidates, maxSponsoredSlots } = await getBoostedCandidates(placement, feedSize);

  if (candidates.length === 0) {
    return {
      mergedFeed: organicFeed.map((item) => ({ ...item, isSponsored: false })),
      sponsoredCount: 0,
    };
  }

  // Determine organic content IDs to avoid duplicates
  const organicContentIds = new Set(organicFeed.map((item) => item.contentId));

  // Filter out candidates that are already in organic feed
  const uniqueCandidates = candidates.filter(
    (c) => !organicContentIds.has(c.targetContentId)
  );

  // Build merged feed: interleave sponsored items at regular intervals
  const mergedFeed: Array<{
    contentId: string;
    score: number;
    isSponsored: boolean;
    campaignId?: string;
  }> = [];

  // Calculate insertion interval (e.g., every 3-4 organic items)
  const insertionInterval = uniqueCandidates.length > 0
    ? Math.max(3, Math.floor(feedSize / (uniqueCandidates.length + 1)))
    : Infinity;

  let sponsoredIdx = 0;
  let sponsoredCount = 0;

  for (let i = 0; i < organicFeed.length; i++) {
    // Insert a sponsored item at regular intervals
    if (
      sponsoredIdx < uniqueCandidates.length &&
      i > 0 &&
      i % insertionInterval === 0 &&
      sponsoredCount < maxSponsoredSlots
    ) {
      const sponsored = uniqueCandidates[sponsoredIdx];
      mergedFeed.push({
        contentId: sponsored.targetContentId,
        score: organicFeed[i].score + sponsored.boostScore,
        isSponsored: true,
        campaignId: sponsored.campaignId,
      });
      sponsoredIdx++;
      sponsoredCount++;
    }

    // Add the organic item
    mergedFeed.push({
      contentId: organicFeed[i].contentId,
      score: organicFeed[i].score,
      isSponsored: false,
    });
  }

  return { mergedFeed, sponsoredCount };
}

/**
 * Report that a boosted item was viewed.
 * Should be called when a user scrolls past / views a sponsored item in the feed.
 *
 * This triggers the billing pipeline:
 *   - Deducts tokens from campaign budget
 *   - Credits AVALO_PLATFORM wallet
 *   - Writes ledger entry
 *
 * @param campaignIds - Campaign IDs that contributed to the impression
 * @param viewerUserId - The user who saw the item
 * @param placement - Where the impression occurred
 */
export async function reportSponsoredView(
  campaignIds: string[],
  viewerUserId: string,
  placement: BoostPlacement
): Promise<void> {
  // Confirm impression for each contributing campaign
  for (const campaignId of campaignIds) {
    try {
      await confirmImpression({
        campaignId,
        viewerUserId,
        placement,
      });
    } catch (error) {
      // Non-blocking: log but don't fail the feed render
      console.error(`[BoostRankingHook] Failed to confirm impression for campaign ${campaignId}:`, error);
    }
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export { calculateBoostScore, getBoostedCandidates, confirmImpression };










