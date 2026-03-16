import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 460 — AVALO Paid Visibility Engine: Cloud Function Endpoints
 * Callable functions and scheduled jobs for the Boost Campaign system.
 *
 * HARD RULES:
 * - Boost revenue = 100% AVALO. No split. No refunds.
 * - Tokens deducted per confirmed impression via unified wallet + ledger.
 *
 * @module pack460-boost-visibility-endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  createBoostCampaign,
  pauseBoostCampaign,
  resumeBoostCampaign,
  getAdvertiserCampaigns,
  confirmImpression,
  getBoostCampaign,
  getCampaignImpressions,
  expireEndedCampaigns,
  refundUnspentBudgets,
  validateCampaignLedger,
} from './pack460-boost-visibility-engine';
import type {
  CreateBoostCampaignRequest,
  ConfirmImpressionRequest,
  BoostCampaignStatus,
} from './types/boostCampaign.types';

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Create a new boost campaign.
 * Authenticated users only.
 */
export const createBoostCampaignV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
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
    } = request.data;

    if (!name || !targetContentId || !targetContentType || !placements || !pacingMode || !costPerImpression || !totalBudget || !startAt || !endAt) {
      throw new HttpsError('invalid-argument', 'Missing required campaign fields');
    }

    const campaignRequest: CreateBoostCampaignRequest = {
      advertiserId: userId,
      name,
      targetContentId,
      targetContentType,
      placements,
      pacingMode,
      costPerImpression,
      totalBudget,
      maxImpressions: maxImpressions ?? 0,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      targetRegion,
      targetCountry,
    };

    const result = await createBoostCampaign(campaignRequest);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to create campaign');
    }

    return { success: true, campaignId: result.campaignId };
  }
);

/**
 * Pause a running campaign.
 */
export const pauseBoostCampaignV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId } = request.data;
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Campaign ID is required');
    }

    const result = await pauseBoostCampaign(campaignId, userId);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to pause campaign');
    }

    return { success: true };
  }
);

/**
 * Resume a paused campaign.
 */
export const resumeBoostCampaignV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId } = request.data;
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Campaign ID is required');
    }

    const result = await resumeBoostCampaign(campaignId, userId);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to resume campaign');
    }

    return { success: true };
  }
);

/**
 * Get campaigns for the authenticated user.
 */
export const getMyBoostCampaignsV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { statusFilter } = request.data || {};

    const campaigns = await getAdvertiserCampaigns(
      userId,
      statusFilter as BoostCampaignStatus[] | undefined
    );

    return { campaigns, count: campaigns.length };
  }
);

/**
 * Get a single campaign by ID.
 */
export const getBoostCampaignV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId } = request.data;
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Campaign ID is required');
    }

    const campaign = await getBoostCampaign(campaignId);

    if (!campaign) {
      throw new HttpsError('not-found', 'Campaign not found');
    }

    if (campaign.advertiserId !== userId) {
      throw new HttpsError('permission-denied', 'Not authorized to view this campaign');
    }

    return { campaign };
  }
);

/**
 * Confirm an impression (server-side only in production;
 * exposed as callable for integration testing).
 */
export const confirmBoostImpressionV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId, placement } = request.data;
    if (!campaignId || !placement) {
      throw new HttpsError('invalid-argument', 'Campaign ID and placement are required');
    }

    const impressionRequest: ConfirmImpressionRequest = {
      campaignId,
      viewerUserId: userId,
      placement,
    };

    const result = await confirmImpression(impressionRequest);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to confirm impression');
    }

    return {
      success: true,
      impressionId: result.impressionId,
      tokensCharged: result.tokensCharged,
    };
  }
);

/**
 * Get impressions for a campaign.
 */
export const getBoostCampaignImpressionsV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId, limit } = request.data;
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Campaign ID is required');
    }

    // Verify ownership
    const campaign = await getBoostCampaign(campaignId);
    if (!campaign || campaign.advertiserId !== userId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }

    const impressions = await getCampaignImpressions(campaignId, limit ?? 100);

    return { impressions, count: impressions.length };
  }
);

/**
 * Validate campaign ledger consistency (admin/debug).
 */
export const validateBoostLedgerV1 = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId } = request.data;
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Campaign ID is required');
    }

    // Verify ownership
    const campaign = await getBoostCampaign(campaignId);
    if (!campaign || campaign.advertiserId !== userId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }

    const validation = await validateCampaignLedger(campaignId);

    return validation;
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Expire ended campaigns every 5 minutes.
 */
export const boostCampaignExpiryJob = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west1',
    timeoutSeconds: 120,
  },
  async () => {
    const expired = await expireEndedCampaigns();
    console.log(`[BoostExpiryJob] Expired ${expired} campaigns`);
  }
);

/**
 * Refund unspent budgets for completed campaigns every 15 minutes.
 */
export const boostBudgetRefundJob = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    timeoutSeconds: 120,
  },
  async () => {
    const refunded = await refundUnspentBudgets();
    console.log(`[BoostBudgetRefundJob] Refunded ${refunded} campaigns`);
  }
);























