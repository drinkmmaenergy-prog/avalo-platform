/**
 * PACK 85 — Trust & Risk Engine v1 Cloud Functions
 * Callable endpoints for trust risk operations
 */

import * as functions from "firebase-functions";
import {
  logTrustEvent,
  getTrustProfileForClient,
  recalculateUserRisk,
  applyGoodBehaviorDecay,
  rebuildAllRiskScores,
  applyManualOverride,
  removeManualOverride,
} from "./trustRiskEngine";
import {
  LogTrustEventInput,
  TrustRiskError,
  EnforcementLevel,
} from "./types/trustRisk.types";

// ============================================================================
// USER FUNCTIONS
// ============================================================================

/**
 * Get user's trust profile
 * Returns sanitized profile with enforcement capabilities
 */
export const trustRisk_getUserProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const userId = context.auth.uid;

    try {
      const profile = await getTrustProfileForClient(userId);
      return { success: true, profile };
    } catch (error: any) {
      console.error("Error in trustRisk_getUserProfile:", error);
      
      if (error instanceof TrustRiskError) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          error.message,
          { code: error.code }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to get trust profile"
      );
    }
  }
);

// ============================================================================
// INTERNAL FUNCTIONS (called by other backend modules)
// ============================================================================

/**
 * Log trust event
 * Internal function - called by other modules (chat, reports, KYC, etc.)
 */
export const trustRisk_logEvent = functions.https.onCall(
  async (data: LogTrustEventInput, context) => {
    // Note: This can be called by system/backend without auth
    // For user-triggered events, auth should be checked by calling module
    
    const { userId, type, weightOverride, meta } = data;

    if (!userId || !type) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId and type are required"
      );
    }

    try {
      await logTrustEvent({ userId, type, weightOverride, meta });
      return { success: true };
    } catch (error: any) {
      console.error("Error in trustRisk_logEvent:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to log trust event"
      );
    }
  }
);

/**
 * Recalculate user risk
 * Can be called manually or by system
 */
export const trustRisk_recalculate = functions.https.onCall(
  async (data, context) => {
    const { userId } = data;

    if (!userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId is required"
      );
    }

    // If authenticated, only allow recalculating own profile (unless admin)
    if (context.auth && context.auth.uid !== userId) {
      // TODO: Add admin check
      throw new functions.https.HttpsError(
        "permission-denied",
        "Cannot recalculate another user's risk score"
      );
    }

    try {
      const profile = await recalculateUserRisk(userId);
      return { 
        success: true, 
        riskScore: profile.riskScore,
        enforcementLevel: profile.enforcementLevel,
        flags: profile.flags,
      };
    } catch (error: any) {
      console.error("Error in trustRisk_recalculate:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to recalculate risk score"
      );
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Apply manual override to user's risk score
 * Admin only
 */
export const trustRisk_admin_applyOverride = functions.https.onCall(
  async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    // TODO: Add proper admin role check
    // For now, any authenticated user can call (should be restricted to admins)
    const adminId = context.auth.uid;

    const { userId, reason, overrideScore, overrideEnforcement } = data;

    if (!userId || !reason) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId and reason are required"
      );
    }

    // Validate overrideScore if provided
    if (overrideScore !== undefined) {
      if (typeof overrideScore !== "number" || overrideScore < 0 || overrideScore > 100) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "overrideScore must be between 0 and 100"
        );
      }
    }

    // Validate overrideEnforcement if provided
    if (overrideEnforcement !== undefined) {
      const validEnforcements: EnforcementLevel[] = ["NONE", "SOFT_LIMIT", "HARD_LIMIT"];
      if (!validEnforcements.includes(overrideEnforcement)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid enforcement level"
        );
      }
    }

    try {
      await applyManualOverride(
        userId,
        adminId,
        reason,
        overrideScore,
        overrideEnforcement
      );

      return { success: true, message: "Manual override applied" };
    } catch (error: any) {
      console.error("Error in trustRisk_admin_applyOverride:", error);
      
      if (error instanceof TrustRiskError) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          error.message,
          { code: error.code }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to apply manual override"
      );
    }
  }
);

/**
 * Remove manual override from user
 * Admin only
 */
export const trustRisk_admin_removeOverride = functions.https.onCall(
  async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    // TODO: Add proper admin role check
    const adminId = context.auth.uid;

    const { userId } = data;

    if (!userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId is required"
      );
    }

    try {
      await removeManualOverride(userId, adminId);
      return { success: true, message: "Manual override removed" };
    } catch (error: any) {
      console.error("Error in trustRisk_admin_removeOverride:", error);
      
      if (error instanceof TrustRiskError) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          error.message,
          { code: error.code }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to remove manual override"
      );
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Scheduled function: Apply good behavior decay
 * Runs daily at 2 AM UTC
 */
export const trustRisk_scheduledDecay = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    try {
      const batchSize = 100;
      let totalDecayed = 0;
      let iterations = 0;
      const maxIterations = 10; // Process max 1000 users per run

      // Process in batches
      while (iterations < maxIterations) {
        const decayed = await applyGoodBehaviorDecay(batchSize);
        totalDecayed += decayed;
        iterations++;

        // Stop if we processed less than batch size (no more to process)
        if (decayed < batchSize) {
          break;
        }
      }

      console.log(
        `[TrustRisk] Scheduled decay completed: ${totalDecayed} users processed`
      );

      return { success: true, totalDecayed };
    } catch (error: any) {
      console.error("[TrustRisk] Error in scheduled decay:", error);
      throw error;
    }
  });

/**
 * Scheduled function: Rebuild all risk scores
 * Runs weekly on Sunday at 3 AM UTC
 * Use sparingly - for fixing inconsistencies or after config changes
 */
export const trustRisk_scheduledRebuild = functions.pubsub
  .schedule("0 3 * * 0")
  .timeZone("UTC")
  .onRun(async (context) => {
    try {
      const batchSize = 50;
      let totalRebuilt = 0;
      let iterations = 0;
      const maxIterations = 20; // Process max 1000 users per run

      // Process in batches
      while (iterations < maxIterations) {
        const rebuilt = await rebuildAllRiskScores(batchSize);
        totalRebuilt += rebuilt;
        iterations++;

        // Stop if we processed less than batch size (no more to process)
        if (rebuilt < batchSize) {
          break;
        }
      }

      console.log(
        `[TrustRisk] Scheduled rebuild completed: ${totalRebuilt} users processed`
      );

      return { success: true, totalRebuilt };
    } catch (error: any) {
      console.error("[TrustRisk] Error in scheduled rebuild:", error);
      throw error;
    }
  });

/**
 * Manual trigger for good behavior decay
 * Admin only - for testing or manual runs
 */
export const trustRisk_admin_triggerDecay = functions.https.onCall(
  async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    // TODO: Add proper admin role check

    const batchSize = data?.batchSize || 100;

    try {
      const decayed = await applyGoodBehaviorDecay(batchSize);
      return { success: true, decayed };
    } catch (error: any) {
      console.error("Error in trustRisk_admin_triggerDecay:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to trigger decay"
      );
    }
  }
);

/**
 * Manual trigger for rebuilding risk scores
 * Admin only - use with caution
 */
export const trustRisk_admin_triggerRebuild = functions.https.onCall(
  async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    // TODO: Add proper admin role check

    const batchSize = data?.batchSize || 50;

    try {
      const rebuilt = await rebuildAllRiskScores(batchSize);
      return { success: true, rebuilt };
    } catch (error: any) {
      console.error("Error in trustRisk_admin_triggerRebuild:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to trigger rebuild"
      );
    }
  }
);