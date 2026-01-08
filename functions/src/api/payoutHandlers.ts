/**
 * PACK 56 — Payout HTTP Callable Handlers
 * 
 * Cloud Functions v2 callable handlers for payout operations.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getPayoutState,
  setupPayoutAccount,
  requestPayout,
  getPayoutRequests,
} from "../payouts";

/**
 * Get payout state for authenticated user.
 * 
 * GET /payouts/state
 */
export const getPayoutStateCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;

    try {
      const state = await getPayoutState(userId);
      return { ok: true, data: state };
    } catch (error: any) {
      console.error("Error getting payout state:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to get payout state"
      );
    }
  }
);

/**
 * Setup or update payout account.
 * 
 * POST /payouts/account/setup
 */
export const setupPayoutAccountCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { preferredRail, country, currency } = request.data;

    try {
      const result = await setupPayoutAccount({
        userId,
        preferredRail,
        country,
        currency,
      });

      return { ok: true, data: result };
    } catch (error: any) {
      console.error("Error setting up payout account:", error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        "internal",
        error.message || "Failed to setup payout account"
      );
    }
  }
);

/**
 * Request a payout.
 * 
 * POST /payouts/request
 */
export const requestPayoutCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { tokensRequested } = request.data;

    if (!tokensRequested || tokensRequested <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "tokensRequested must be a positive number"
      );
    }

    try {
      const result = await requestPayout({
        userId,
        tokensRequested,
      });

      return { ok: true, data: result };
    } catch (error: any) {
      console.error("Error requesting payout:", error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        "internal",
        error.message || "Failed to request payout"
      );
    }
  }
);

/**
 * Get payout requests history.
 * 
 * GET /payouts/requests
 */
export const getPayoutRequestsCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { limit, cursor } = request.data;

    try {
      const result = await getPayoutRequests({
        userId,
        limit,
        cursor,
      });

      return { ok: true, data: result };
    } catch (error: any) {
      console.error("Error getting payout requests:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to get payout requests"
      );
    }
  }
);