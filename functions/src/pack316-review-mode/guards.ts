/**
 * PACK 316 - Review Mode Guards
 * 
 * Payment and feature access guards for review mode
 * Intercepts real-money flows and restricts features
 * 
 * Region: europe-west3
 */

import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { isReviewModeSession } from "../services/configService";
import {
  shouldInterceptPayment,
  processDemoPayment,
  canAccessFeatureInReviewMode,
  getDemoWallet,
  addDemoTransaction,
} from "./service";
import { ReviewModeContext } from "./types";

/**
 * Guard for token purchase
 * Intercepts and redirects to demo wallet in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @param amount - Token amount
 * @param packageId - Package ID
 * @returns Purchase result with demo flag
 */
export async function guardTokenPurchase(
  context: ReviewModeContext,
  userId: string,
  amount: number,
  packageId?: string
): Promise<{
  shouldProceed: boolean;
  isDemoMode: boolean;
  result?: { success: boolean; transactionId: string };
}> {
  const shouldIntercept = await shouldInterceptPayment(context);

  if (shouldIntercept) {
    logger.info(`Intercepting token purchase for review mode`, {
      userId,
      amount,
      packageId,
    });

    const result = await processDemoPayment(userId, amount, packageId);

    return {
      shouldProceed: false,
      isDemoMode: true,
      result,
    };
  }

  return {
    shouldProceed: true,
    isDemoMode: false,
  };
}

/**
 * Guard for payout requests
 * Blocks real payouts in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @param amount - Payout amount
 * @throws HttpsError if in review mode
 */
export async function guardPayoutRequest(
  context: ReviewModeContext,
  userId: string,
  amount: number
): Promise<void> {
  const isReviewMode = await isReviewModeSession(context);

  if (isReviewMode) {
    logger.warn(`Payout request blocked in review mode`, {
      userId,
      amount,
    });

    throw new HttpsError(
      "failed-precondition",
      "Payout functionality is temporarily unavailable"
    );
  }
}

/**
 * Guard for earning toggle
 * Prevents users from enabling earning in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @throws HttpsError if in review mode
 */
export async function guardEarningToggle(
  context: ReviewModeContext,
  userId: string
): Promise<void> {
  const canAccess = await canAccessFeatureInReviewMode("earning", context);

  if (!canAccess) {
    logger.warn(`Earning toggle blocked in review mode`, { userId });

    throw new HttpsError(
      "failed-precondition",
      "Earning features are temporarily unavailable"
    );
  }
}

/**
 * Guard for AI companion access
 * Blocks AI features in review mode if configured
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @throws HttpsError if blocked
 */
export async function guardAICompanionAccess(
  context: ReviewModeContext,
  userId: string
): Promise<void> {
  const canAccess = await canAccessFeatureInReviewMode("aiCompanions", context);

  if (!canAccess) {
    logger.info(`AI companion access blocked in review mode`, { userId });

    throw new HttpsError(
      "failed-precondition",
      "AI companions are coming soon"
    );
  }
}

/**
 * Guard for erotic content access
 * Blocks explicit content in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @returns True if should be hidden
 */
export async function shouldHideEroticContent(
  context: ReviewModeContext,
  userId: string
): Promise<boolean> {
  const canAccess = await canAccessFeatureInReviewMode("eroticContent", context);
  return !canAccess;
}

/**
 * Guard for chat spending
 * Uses demo wallet in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @param tokenCost - Token cost
 * @returns Spending result
 */
export async function guardChatSpending(
  context: ReviewModeContext,
  userId: string,
  tokenCost: number
): Promise<{
  shouldUseRealWallet: boolean;
  success: boolean;
  remainingBalance?: number;
}> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return {
      shouldUseRealWallet: true,
      success: true,
    };
  }

  try {
    // Use demo wallet
    const wallet = await getDemoWallet(userId);

    if (wallet.balance < tokenCost) {
      return {
        shouldUseRealWallet: false,
        success: false,
      };
    }

    await addDemoTransaction(userId, {
      type: "SPEND",
      amount: tokenCost,
      currency: "TOKEN",
      description: "Chat message cost",
      metadata: { reviewMode: true },
    });

    const updatedWallet = await getDemoWallet(userId);

    return {
      shouldUseRealWallet: false,
      success: true,
      remainingBalance: updatedWallet.balance,
    };
  } catch (error) {
    logger.error("Error processing demo chat spending:", error);
    return {
      shouldUseRealWallet: false,
      success: false,
    };
  }
}

/**
 * Guard for calendar bookings
 * Uses demo transactions in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @param tokenCost - Booking cost
 * @returns Booking result
 */
export async function guardCalendarBooking(
  context: ReviewModeContext,
  userId: string,
  tokenCost: number
): Promise<{
  shouldUseRealWallet: boolean;
  success: boolean;
  transactionId?: string;
}> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return {
      shouldUseRealWallet: true,
      success: true,
    };
  }

  try {
    const wallet = await getDemoWallet(userId);

    if (wallet.balance < tokenCost) {
      return {
        shouldUseRealWallet: false,
        success: false,
      };
    }

    await addDemoTransaction(userId, {
      type: "SPEND",
      amount: tokenCost,
      currency: "TOKEN",
      description: "Calendar booking",
      metadata: { reviewMode: true },
    });

    const transactionId = `demo_booking_${Date.now()}`;

    return {
      shouldUseRealWallet: false,
      success: true,
      transactionId,
    };
  } catch (error) {
    logger.error("Error processing demo booking:", error);
    return {
      shouldUseRealWallet: false,
      success: false,
    };
  }
}

/**
 * Guard for panic button events
 * Routes to sandbox in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @returns Routing decision
 */
export async function guardPanicButton(
  context: ReviewModeContext,
  userId: string
): Promise<{
  shouldUseSandbox: boolean;
}> {
  const isReviewMode = await isReviewModeSession(context);

  if (isReviewMode) {
    logger.info(`Panic button routed to sandbox in review mode`, { userId });
  }

  return {
    shouldUseSandbox: isReviewMode,
  };
}

/**
 * Guard for refunds
 * Uses demo wallet in review mode
 * 
 * @param context - Review mode context
 * @param userId - User ID
 * @param tokenAmount - Refund amount
 * @returns Refund result
 */
export async function guardRefund(
  context: ReviewModeContext,
  userId: string,
  tokenAmount: number,
  reason: string
): Promise<{
  shouldUseRealWallet: boolean;
  success: boolean;
}> {
  const isReviewMode = await isReviewModeSession(context);

  if (!isReviewMode) {
    return {
      shouldUseRealWallet: true,
      success: true,
    };
  }

  try {
    await addDemoTransaction(userId, {
      type: "REFUND",
      amount: tokenAmount,
      currency: "TOKEN",
      description: `Refund: ${reason}`,
      metadata: { reviewMode: true, reason },
    });

    return {
      shouldUseRealWallet: false,
      success: true,
    };
  } catch (error) {
    logger.error("Error processing demo refund:", error);
    return {
      shouldUseRealWallet: false,
      success: false,
    };
  }
}