/**
 * PACK 316 - Review Mode Endpoints
 * 
 * API endpoints for review mode configuration and session management
 * 
 * Region: europe-west3
 */

import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { isReviewModeSession, getAppConfig } from "../services/configService";
import {
  getDemoWallet,
  processDemoPayment,
  getReviewModeContentFilter,
  getReviewModeLimits,
  canAccessFeatureInReviewMode,
  logReviewModeEvent,
} from "./service";

const db = getFirestore();

/**
 * Get session configuration including review mode status
 * 
 * GET /config/session
 * 
 * Query params:
 * - userId (optional)
 * - deviceId (optional)
 * - country (optional)
 * - env (optional, defaults to "prod")
 */
export const getSessionConfig = onRequest(
  { region: "europe-west3", cors: true },
  async (req, res) => {
    try {
      const { userId, deviceId, country, env = "prod" } = req.query;

      // Determine review mode
      const isReviewMode = await isReviewModeSession({
        env: env as "dev" | "staging" | "prod",
        userId: userId as string | undefined,
        deviceId: deviceId as string | undefined,
        country: country as string | undefined,
      });

      // Get limits if in review mode
      let limits = null;
      if (isReviewMode) {
        limits = await getReviewModeLimits({
          env: env as "dev" | "staging" | "prod",
          userId: userId as string | undefined,
          deviceId: deviceId as string | undefined,
          country: country as string | undefined,
        });
      }

      res.status(200).json({
        isReviewMode,
        limits: limits || undefined,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error getting session config:", error);
      res.status(500).json({
        error: "Failed to get session configuration",
      });
    }
  }
);

/**
 * Get demo wallet balance (review mode only)
 * 
 * Callable function
 */
export const getDemoWalletBalance = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;

    try {
      // Check if in review mode
      const isReviewMode = await isReviewModeSession({
        env: "prod",
        userId,
      });

      if (!isReviewMode) {
        throw new HttpsError(
          "failed-precondition",
          "Demo wallet only available in review mode"
        );
      }

      const wallet = await getDemoWallet(userId);

      return {
        balance: wallet.balance,
        currency: wallet.currency,
        transactions: wallet.transactions.slice(-10), // Last 10 transactions
      };
    } catch (error) {
      logger.error("Error getting demo wallet balance:", error);
      throw new HttpsError("internal", "Failed to get demo wallet balance");
    }
  }
);

/**
 * Process demo token purchase (review mode only)
 * 
 * Callable function
 */
export const purchaseDemoTokens = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { amount, packageId } = request.data;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "Invalid token amount");
    }

    try {
      // Check if in review mode
      const isReviewMode = await isReviewModeSession({
        env: "prod",
        userId,
      });

      if (!isReviewMode) {
        throw new HttpsError(
          "failed-precondition",
          "Demo purchases only available in review mode"
        );
      }

      const result = await processDemoPayment(userId, amount, packageId);

      if (!result.success) {
        throw new HttpsError("internal", "Failed to process demo payment");
      }

      // Log event
      await logReviewModeEvent(userId, "DEMO_PURCHASE", {
        amount,
        packageId,
        transactionId: result.transactionId,
      });

      return {
        success: true,
        transactionId: result.transactionId,
        newBalance: (await getDemoWallet(userId)).balance,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error processing demo purchase:", error);
      throw new HttpsError("internal", "Failed to process demo purchase");
    }
  }
);

/**
 * Check feature access in review mode
 * 
 * Callable function
 */
export const checkFeatureAccessReviewMode = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { featureKey, deviceId, country } = request.data;

    try {
      const canAccess = await canAccessFeatureInReviewMode(
        featureKey as "aiCompanions" | "earning" | "payouts" | "eroticContent",
        {
          env: "prod",
          userId,
          deviceId,
          country,
        }
      );

      return {
        canAccess,
        featureKey,
      };
    } catch (error) {
      logger.error("Error checking feature access:", error);
      throw new HttpsError("internal", "Failed to check feature access");
    }
  }
);

/**
 * Admin endpoint to update review mode configuration
 * 
 * Callable function (admin only)
 */
export const updateReviewModeConfig = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;

    // Verify admin access
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { updates } = request.data;

    try {
      const { updateAppConfig } = await import("../services/configService");

      // Only allow review mode updates
      const reviewModeUpdates = {
        reviewMode: updates,
      };

      await updateAppConfig(reviewModeUpdates, userId);

      // Log to audit
      await db.collection("auditLogs").add({
        type: "REVIEW_MODE_CONFIG_UPDATED",
        adminId: userId,
        updates: updates,
        timestamp: new Date(),
      });

      logger.info(`Review mode config updated by ${userId}`, updates);

      return {
        success: true,
        message: "Review mode configuration updated successfully",
      };
    } catch (error) {
      logger.error("Error updating review mode config:", error);
      throw new HttpsError("internal", "Failed to update review mode config");
    }
  }
);

/**
 * Get current review mode configuration (admin only)
 * 
 * Callable function
 */
export const getReviewModeConfig = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;

    // Verify admin access
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    try {
      const config = await getAppConfig();

      return {
        reviewMode: config.reviewMode,
        version: config.version,
      };
    } catch (error) {
      logger.error("Error getting review mode config:", error);
      throw new HttpsError("internal", "Failed to get review mode config");
    }
  }
);

/**
 * Mark user as demo profile (admin only)
 * 
 * Callable function
 */
export const markAsDemoProfile = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const adminId = request.auth.uid;
    const { targetUserId, isDemoProfile } = request.data;

    // Verify admin access
    const adminDoc = await db.collection("users").doc(adminId).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    if (!targetUserId) {
      throw new HttpsError("invalid-argument", "Target user ID required");
    }

    try {
      await db
        .collection("users")
        .doc(targetUserId)
        .update({
          demoProfile: isDemoProfile === true,
          updatedAt: new Date(),
        });

      // Log to audit
      await db.collection("auditLogs").add({
        type: "DEMO_PROFILE_UPDATED",
        adminId,
        targetUserId,
        isDemoProfile,
        timestamp: new Date(),
      });

      logger.info(`User ${targetUserId} marked as demo profile: ${isDemoProfile} by ${adminId}`);

      return {
        success: true,
        message: `User ${isDemoProfile ? "marked as" : "removed from"} demo profile`,
      };
    } catch (error) {
      logger.error("Error marking demo profile:", error);
      throw new HttpsError("internal", "Failed to update demo profile status");
    }
  }
);