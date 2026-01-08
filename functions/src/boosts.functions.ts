/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Cloud Functions endpoints for boost purchase and management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  purchaseBoost,
  getActiveBoosts,
  getAvailableBoosts,
  checkBoostEligibility,
  getBoostStats
} from './services/boosts.service';
import type { BoostPurchaseRequest } from './types/boosts.types';

/**
 * Purchase a boost
 */
export const purchaseBoostV1 = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { boostType, targetLocation } = request.data;

    if (!boostType) {
      throw new HttpsError('invalid-argument', 'Boost type is required');
    }

    const purchaseRequest: BoostPurchaseRequest = {
      userId,
      boostType,
      targetLocation
    };

    const result = await purchaseBoost(purchaseRequest);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.reason || result.error || 'Failed to purchase boost');
    }

    return {
      success: true,
      boostId: result.boostId,
      boost: result.boost
    };
  }
);

/**
 * Get user's active boosts
 */
export const getActiveBoostsV1 = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const activeBoosts = await getActiveBoosts(userId);

    return {
      activeBoosts,
      count: activeBoosts.length
    };
  }
);

/**
 * Get available boosts for user
 */
export const getAvailableBoostsV1 = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const result = await getAvailableBoosts(userId);

    return result;
  }
);

/**
 * Check boost eligibility
 */
export const checkBoostEligibilityV1 = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const result = await checkBoostEligibility(userId);

    return result;
  }
);

/**
 * Get boost stats
 */
export const getBoostStatsV1 = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { boostId } = request.data;

    if (!boostId) {
      throw new HttpsError('invalid-argument', 'Boost ID is required');
    }

    const stats = await getBoostStats(boostId);

    if (!stats) {
      throw new HttpsError('not-found', 'Boost not found');
    }

    return { stats };
  }
);