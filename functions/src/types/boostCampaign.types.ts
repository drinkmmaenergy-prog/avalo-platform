/**
 * AVALO Paid Visibility Engine — Canonical Boost Economy Spec v1
 * Type definitions for boost_campaigns and boost_impressions collections.
 *
 * HARD RULES:
 * - Boost revenue = 100% AVALO. No split. No refunds.
 * - Tokens deducted per confirmed impression.
 * - All mutations go through unified wallet + ledger.
 * - No parallel boost engines allowed.
 * - Fully separated from Chat Monetization.
 *
 * @module boostCampaign.types
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Campaign status lifecycle:
 *   PENDING → ACTIVE → PAUSED | COMPLETED | BUDGET_EXHAUSTED
 */
export type BoostCampaignStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'BUDGET_EXHAUSTED';

/**
 * Where the boosted content appears.
 */
export type BoostPlacement =
  | 'FEED'
  | 'DISCOVERY'
  | 'SWIPE';

/**
 * Pacing mode for impression delivery.
 *   EVEN        — distribute impressions evenly across campaign duration
 *   ACCELERATED — deliver impressions as fast as possible
 */
export type BoostPacingMode = 'EVEN' | 'ACCELERATED';

/**
 * Impression confirmation status.
 */
export type ImpressionStatus = 'CONFIRMED' | 'REJECTED' | 'PENDING';

// ============================================================================
// BOOST CAMPAIGNS COLLECTION — boost_campaigns/{campaignId}
// ============================================================================

/**
 * Firestore document for a single boost campaign.
 *
 * Collection: `boost_campaigns`
 * Document ID: auto-generated UUID
 */
export interface BoostCampaign {
  /** Auto-generated campaign ID (same as Firestore doc ID) */
  campaignId: string;

  /** Owner of the campaign */
  advertiserId: string;

  /** Human-readable campaign name */
  name: string;

  /** Content/profile being boosted (e.g., userId for profile boost) */
  targetContentId: string;

  /** Type of content being boosted */
  targetContentType: 'PROFILE' | 'POST' | 'EVENT';

  /** Where the boost appears */
  placements: BoostPlacement[];

  /** Current lifecycle status */
  status: BoostCampaignStatus;

  /** Pacing mode */
  pacingMode: BoostPacingMode;

  /** Tokens per confirmed impression (cost-per-impression) */
  costPerImpression: number;

  /** Total budget in tokens (pre-allocated from wallet) */
  totalBudget: number;

  /** Tokens spent so far */
  spentBudget: number;

  /** Remaining tokens (totalBudget - spentBudget) */
  remainingBudget: number;

  /** Total confirmed impressions delivered */
  impressionsDelivered: number;

  /** Maximum impressions to deliver (0 = unlimited until budget exhausted) */
  maxImpressions: number;

  /** Campaign start time */
  startAt: Timestamp;

  /** Campaign end time */
  endAt: Timestamp;

  /** Geographic targeting (optional) */
  targetRegion?: string;

  /** Country targeting (optional) */
  targetCountry?: string;

  /** Created timestamp */
  createdAt: Timestamp;

  /** Last updated timestamp */
  updatedAt: Timestamp;

  /** Metadata for extensibility */
  meta?: Record<string, unknown>;
}

// ============================================================================
// BOOST IMPRESSIONS COLLECTION — boost_impressions/{impressionId}
// ============================================================================

/**
 * Firestore document for a single confirmed impression.
 *
 * Collection: `boost_impressions`
 * Document ID: auto-generated UUID
 */
export interface BoostImpression {
  /** Auto-generated impression ID (same as Firestore doc ID) */
  impressionId: string;

  /** Reference to parent campaign */
  campaignId: string;

  /** The advertiser (campaign owner) */
  advertiserId: string;

  /** The user who saw the boosted content */
  viewerUserId: string;

  /** Where the impression was served */
  placement: BoostPlacement;

  /** Tokens charged for this impression */
  tokensCharged: number;

  /** Ledger entry ID for audit trail */
  ledgerEntryId: string;

  /** Impression status */
  status: ImpressionStatus;

  /** When the impression was served */
  servedAt: Timestamp;

  /** When the impression was confirmed (viewability check) */
  confirmedAt?: Timestamp;

  /** Metadata */
  meta?: Record<string, unknown>;
}

// ============================================================================
// LEDGER ENTRY TYPE FOR BOOST IMPRESSIONS
// ============================================================================

/**
 * Ledger entry representing a single boost impression deduction.
 * Written to `treasury_ledger` collection.
 */
export interface BoostImpressionLedgerEntry {
  ledgerId: string;
  eventType: 'BOOST_IMPRESSION';
  campaignId: string;
  impressionId: string;
  advertiserId: string;
  tokenAmount: number;
  vault: 'AVALO_REVENUE';
  timestamp: Timestamp;
  metadata: {
    transactionType: 'BOOST';
    placement: BoostPlacement;
    viewerUserId: string;
    campaignName?: string;
    description: string;
  };
}

// ============================================================================
// REQUEST / RESPONSE TYPES
// ============================================================================

export interface CreateBoostCampaignRequest {
  advertiserId: string;
  name: string;
  targetContentId: string;
  targetContentType: 'PROFILE' | 'POST' | 'EVENT';
  placements: BoostPlacement[];
  pacingMode: BoostPacingMode;
  costPerImpression: number;
  totalBudget: number;
  maxImpressions?: number;
  startAt: Date;
  endAt: Date;
  targetRegion?: string;
  targetCountry?: string;
}

export interface CreateBoostCampaignResponse {
  success: boolean;
  campaignId?: string;
  error?: string;
}

export interface ConfirmImpressionRequest {
  campaignId: string;
  viewerUserId: string;
  placement: BoostPlacement;
}

export interface ConfirmImpressionResponse {
  success: boolean;
  impressionId?: string;
  tokensCharged?: number;
  error?: string;
}

export interface BoostScoreResult {
  /** Additive score to be added to organic ranking */
  boostScore: number;
  /** Campaign IDs that contributed */
  campaignIds: string[];
  /** Whether the item is sponsored */
  isSponsored: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const BOOST_CAMPAIGN_CONSTANTS = {
  /** Maximum active campaigns per user */
  MAX_ACTIVE_CAMPAIGNS_PER_USER: 3,

  /** Maximum percentage of sponsored items in feed */
  MAX_SPONSORED_FEED_DENSITY: MONETIZATION_SPLITS.SUBSCRIPTION.avalo,

  /** Maximum percentage of feed items from one region's campaigns */
  MAX_REGION_DOMINANCE: MONETIZATION_SPLITS.EVENT_TICKET.avalo,

  /** Minimum cost per impression in tokens */
  MIN_COST_PER_IMPRESSION: 1,

  /** Maximum cost per impression in tokens */
  MAX_COST_PER_IMPRESSION: 100,

  /** Minimum campaign budget in tokens */
  MIN_CAMPAIGN_BUDGET: 50,

  /** Platform wallet ID for revenue crediting */
  AVALO_PLATFORM_WALLET_ID: 'AVALO_PLATFORM',

  /** Firestore collection names */
  COLLECTION_CAMPAIGNS: 'boost_campaigns',
  COLLECTION_IMPRESSIONS: 'boost_impressions',
  COLLECTION_LEDGER: 'treasury_ledger',
  COLLECTION_USER_WALLETS: 'user_token_wallets',
  COLLECTION_AVALO_VAULT: 'treasury_vaults',
} as const;










