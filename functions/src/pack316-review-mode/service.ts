/**
 * PACK 316 - Review Mode Service
 * 
 * Core service for handling App Store / Play Store review mode
 * NO TOKENOMICS CHANGES - only safe review experience
 * 
 * Region: europe-west3
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { isReviewModeSession } from "../services/configService";
import {
  ReviewModeContext,
  DemoWallet,
  DemoWalletTransaction,
  ReviewModeContentFilter,
  ReviewModeLimits,
} from "./types";

const db = getFirestore();

/**
 * Get or create demo wallet for user in review mode
 * 
 * @param userId - User ID
 * @returns Demo wallet with initial balance
 */
export async function getDemoWallet(userId: string): Promise<DemoWallet> {
  try {
    const walletRef = db.collection("demoWallets").doc(userId);
    const walletDoc = await walletRef.get();

    if (walletDoc.exists) {
      return walletDoc.data() as DemoWallet;
    }

    // Create new demo wallet with initial balance
    const newWallet: DemoWallet = {
      userId,
      balance: 500, // Initial demo tokens
      currency: "TOKEN",
      transactions: [
        {
          id: `demo_${Date.now()}`,
          userId,
          type: "PURCHASE",
          amount: 500,
          currency: "TOKEN",
          description: "Initial demo balance",
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await walletRef.set(newWallet);
    logger.info(`Demo wallet created for user ${userId}`);

    return newWallet;
  } catch (error) {
    logger.error("Error getting demo wallet:", error);
    throw new Error("Failed to get demo wallet");
  }
}

/**
 * Add transaction to demo wallet
 * 
 * @param userId - User ID
 * @param transaction - Transaction details
 */
export async function addDemoTransaction(
  userId: string,
  transaction: Omit<DemoWalletTransaction, "id" | "userId" | "timestamp">
): Promise<void> {
  try {
    const walletRef = db.collection("demoWallets").doc(userId);
    const wallet = await getDemoWallet(userId);

    const newTransaction: DemoWalletTransaction = {
      id: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      timestamp: new Date(),
      ...transaction,
    };

    // Calculate new balance
    let balanceChange = 0;
    switch (transaction.type) {
      case "PURCHASE":
      case "EARN":
      case "REFUND":
        balanceChange = transaction.amount;
        break;
      case "SPEND":
        balanceChange = -transaction.amount;
        break;
    }

    const newBalance = Math.max(0, wallet.balance + balanceChange);

    await walletRef.update({
      balance: newBalance,
      transactions: FieldValue.arrayUnion(newTransaction),
      updatedAt: new Date(),
    });

    logger.debug(`Demo transaction added for user ${userId}`, {
      type: transaction.type,
      amount: transaction.amount,
      newBalance,
    });
  } catch (error) {
    logger.error("Error adding demo transaction:", error);
    throw new Error("Failed to add demo transaction");
  }
}

/**
 * Check if payment should be intercepted for review mode
 * 
 * @param context - Review mode context
 * @returns True if payment should be demo-only
 */
export async function shouldInterceptPayment(
  context: ReviewModeContext
): Promise<boolean> {
  const isReviewMode = await isReviewModeSession(context);
  return isReviewMode;
}

/**
 * Process demo payment (no real money involved)
 * 
 * @param userId - User ID
 * @param amount - Token amount
 * @param packageId - Package ID for tracking
 * @returns Success status
 */
export async function processDemoPayment(
  userId: string,
  amount: number,
  packageId?: string
): Promise<{ success: boolean; transactionId: string }> {
  try {
    await addDemoTransaction(userId, {
      type: "PURCHASE",
      amount,
      currency: "TOKEN",
      description: `Demo purchase${packageId ? ` - Package ${packageId}` : ""}`,
      metadata: { packageId, reviewMode: true },
    });

    const transactionId = `demo_purchase_${Date.now()}`;

    logger.info(`Demo payment processed for user ${userId}`, {
      amount,
      packageId,
      transactionId,
    });

    return { success: true, transactionId };
  } catch (error) {
    logger.error("Error processing demo payment:", error);
    return { success: false, transactionId: "" };
  }
}

/**
 * Get content filter settings for review mode
 * 
 * @param context - Review mode context
 * @returns Content filter settings
 */
export async function getReviewModeContentFilter(
  context: ReviewModeContext
): Promise<ReviewModeContentFilter | null> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return null;
  }

  return {
    hideNSFW: true,
    hideExplicit: true,
    hideBorderline: true,
    prioritizeDemoProfiles: true,
  };
}

/**
 * Get discovery limits for review mode
 * 
 * @param context - Review mode context
 * @returns Limits or null if not in review mode
 */
export async function getReviewModeLimits(
  context: ReviewModeContext
): Promise<ReviewModeLimits | null> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return null;
  }

  // Get config to retrieve specific limits
  const { getAppConfig } = await import("../services/configService");
  const config = await getAppConfig();

  return {
    maxSwipePerSession: config.reviewMode.limitSwipePerSession,
    maxDiscoveryRadiusKm: config.reviewMode.limitDiscoveryRadiusKm,
    maxProfileViewsPerDay: 50,
    maxMessagesPerDay: 30,
  };
}

/**
 * Check if user can access feature in review mode
 * 
 * @param featureKey - Feature identifier
 * @param context - Review mode context
 * @returns True if feature is accessible
 */
export async function canAccessFeatureInReviewMode(
  featureKey: "aiCompanions" | "earning" | "payouts" | "eroticContent",
  context: ReviewModeContext
): Promise<boolean> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return true; // Normal mode - all features available
  }

  const { getAppConfig } = await import("../services/configService");
  const config = await getAppConfig();

  switch (featureKey) {
    case "aiCompanions":
      return !config.reviewMode.hideAICompanions;
    case "earning":
    case "payouts":
      return !config.reviewMode.hideEarningFlows;
    case "eroticContent":
      return !config.reviewMode.hideEroticContent;
    default:
      return true;
  }
}

/**
 * Filter profiles for review mode
 * Returns only safe, demo profiles when in review mode
 * 
 * @param profiles - Array of profile IDs
 * @param context - Review mode context
 * @returns Filtered profile IDs
 */
export async function filterProfilesForReviewMode(
  profiles: string[],
  context: ReviewModeContext
): Promise<string[]> {
  const filter = await getReviewModeContentFilter(context);

  if (!filter) {
    return profiles; // Not in review mode
  }

  try {
    // Get user documents
    const userDocs = await Promise.all(
      profiles.map((profileId) => db.collection("users").doc(profileId).get())
    );

    const filteredProfiles: string[] = [];

    for (let i = 0; i < userDocs.length; i++) {
      const userDoc = userDocs[i];
      if (!userDoc.exists) continue;

      const userData = userDoc.data();

      // Priority 1: Demo profiles
      if (filter.prioritizeDemoProfiles && userData?.demoProfile === true) {
        filteredProfiles.push(profiles[i]);
        continue;
      }

      // Filter out unsafe content
      if (filter.hideNSFW && userData?.contentFlags?.nsfw) {
        continue;
      }

      if (filter.hideExplicit && userData?.contentFlags?.explicit) {
        continue;
      }

      if (filter.hideBorderline && userData?.contentFlags?.borderline) {
        continue;
      }

      // Profile passes filters
      filteredProfiles.push(profiles[i]);
    }

    logger.debug(`Filtered profiles for review mode`, {
      original: profiles.length,
      filtered: filteredProfiles.length,
    });

    return filteredProfiles;
  } catch (error) {
    logger.error("Error filtering profiles for review mode:", error);
    return profiles; // Return original on error
  }
}

/**
 * Log review mode event for analytics
 * 
 * @param userId - User ID
 * @param eventType - Event type
 * @param metadata - Additional metadata
 */
export async function logReviewModeEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await db.collection("reviewModeEvents").add({
      userId,
      eventType,
      metadata: {
        ...metadata,
        reviewMode: true,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error("Error logging review mode event:", error);
    // Don't throw - logging should not break functionality
  }
}

/**
 * Get demo profile IDs
 * Returns list of user IDs marked as demo profiles
 */
export async function getDemoProfileIds(limit: number = 20): Promise<string[]> {
  try {
    const snapshot = await db
      .collection("users")
      .where("demoProfile", "==", true)
      .where("status", "==", "ACTIVE")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    logger.error("Error getting demo profiles:", error);
    return [];
  }
}