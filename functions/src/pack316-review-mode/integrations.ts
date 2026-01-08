/**
 * PACK 316 - Review Mode Integration Examples
 * 
 * Integration helpers for existing payment/wallet/monetization endpoints
 * Shows how to add review mode guards to existing code
 */

import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  guardTokenPurchase,
  guardPayoutRequest,
  guardEarningToggle,
  guardChatSpending,
  guardCalendarBooking,
  guardRefund,
} from "./guards";
import { isReviewModeSession } from "../services/configService";
import { logReviewModeEvent } from "./service";

const db = getFirestore();

/**
 * Example: Token Purchase Integration
 * 
 * Wrap existing Stripe/Wise payment flow with review mode guard
 */
export async function integratedTokenPurchase(
  request: CallableRequest<{
    packageId: string;
    amount: number;
    paymentMethod: string;
    deviceId?: string;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { packageId, amount, paymentMethod, deviceId } = request.data;

  try {
    // Get review mode context
    const userDoc = await db.collection("users").doc(userId).get();
    const countryCode = userDoc.data()?.countryCode;

    const context = {
      env: process.env.FIREBASE_CONFIG ? "prod" : "dev" as "dev" | "staging" | "prod",
      userId,
      deviceId,
      country: countryCode,
    };

    // Check review mode guard
    const guardResult = await guardTokenPurchase(
      context,
      userId,
      amount,
      packageId
    );

    if (guardResult.isDemoMode) {
      // Review mode - use demo wallet
      logger.info("Demo purchase processed", {
        userId,
        amount,
        packageId,
        transactionId: guardResult.result?.transactionId,
      });

      return {
        success: true,
        transactionId: guardResult.result?.transactionId,
        isDemoMode: true,
        balance: (await import("./service").then(m => m.getDemoWallet(userId))).balance,
      };
    }

    // Normal mode - proceed with real payment
    // (Your existing Stripe/Wise integration here)
    const stripeResult = await processStripePayment(userId, amount, packageId, paymentMethod);

    return {
      success: stripeResult.success,
      transactionId: stripeResult.id,
      isDemoMode: false,
      balance: stripeResult.newBalance,
    };
  } catch (error) {
    logger.error("Error processing token purchase:", error);
    throw new HttpsError("internal", "Failed to process purchase");
  }
}

/**
 * Example: Payout Request Integration
 * 
 * Add guard to existing payout endpoint
 */
export async function integratedPayoutRequest(
  request: CallableRequest<{
    amount: number;
    currency: string;
    paymentDetails: any;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { amount, currency, paymentDetails } = request.data;

  try {
    // Get context
    const userDoc = await db.collection("users").doc(userId).get();
    const context = {
      env: "prod" as const,
      userId,
      country: userDoc.data()?.countryCode,
    };

    // Guard payout request
    await guardPayoutRequest(context, userId, amount);

    // If we reach here, not in review mode - proceed with real payout
    // (Your existing payout logic here)
    const payoutResult = await processRealPayout(userId, amount, currency, paymentDetails);

    return {
      success: true,
      payoutId: payoutResult.id,
      status: payoutResult.status,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error; // Re-throw review mode blocks
    }
    logger.error("Error processing payout:", error);
    throw new HttpsError("internal", "Failed to process payout");
  }
}

/**
 * Example: Chat Message Sending Integration
 * 
 * Add demo wallet spending for chat in review mode
 */
export async function integratedSendChatMessage(
  request: CallableRequest<{
    chatId: string;
    content: string;
    recipientId: string;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { chatId, content, recipientId } = request.data;

  try {
    // Get chat pricing
    const chatDoc = await db.collection("chats").doc(chatId).get();
    const tokenCost = chatDoc.data()?.pricePerMessage || 0;

    if (tokenCost > 0) {
      // Get context
      const userDoc = await db.collection("users").doc(userId).get();
      const context = {
        env: "prod" as const,
        userId,
        country: userDoc.data()?.countryCode,
      };

      // Guard chat spending
      const spendResult = await guardChatSpending(context, userId, tokenCost);

      if (!spendResult.shouldUseRealWallet) {
        // Demo mode spending
        if (!spendResult.success) {
          throw new HttpsError("failed-precondition", "Insufficient demo balance");
        }

        logger.info("Demo wallet spending for chat", {
          userId,
          tokenCost,
          remainingBalance: spendResult.remainingBalance,
        });
      } else {
        // Real wallet spending
        // (Your existing wallet deduction logic here)
        await deductFromRealWallet(userId, tokenCost);
      }
    }

    // Send the message (same for both modes)
    const messageId = await sendMessage(chatId, userId, recipientId, content);

    return {
      success: true,
      messageId,
      remainingBalance: tokenCost > 0 ? await getBalance(userId) : undefined,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error sending chat message:", error);
    throw new HttpsError("internal", "Failed to send message");
  }
}

/**
 * Example: Calendar Booking Integration
 * 
 * Add demo wallet for bookings in review mode
 */
export async function integratedCreateBooking(
  request: CallableRequest<{
    creatorId: string;
    timeSlot: string;
    durationMinutes: number;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { creatorId, timeSlot, durationMinutes } = request.data;

  try {
    // Calculate cost
    const creatorDoc = await db.collection("users").doc(creatorId).get();
    const ratePerHour = creatorDoc.data()?.rates?.calendar || 0;
    const tokenCost = Math.ceil((ratePerHour / 60) * durationMinutes);

    // Get context
    const userDoc = await db.collection("users").doc(userId).get();
    const context = {
      env: "prod" as const,
      userId,
      country: userDoc.data()?.countryCode,
    };

    // Guard booking
    const bookingResult = await guardCalendarBooking(context, userId, tokenCost);

    let transactionId: string;

    if (!bookingResult.shouldUseRealWallet) {
      // Demo mode
      if (!bookingResult.success) {
        throw new HttpsError("failed-precondition", "Insufficient demo balance");
      }

      transactionId = bookingResult.transactionId!;
      logger.info("Demo booking created", { userId, tokenCost, transactionId });
    } else {
      // Real mode
      // (Your existing wallet deduction logic here)
      transactionId = await deductFromRealWallet(userId, tokenCost);
    }

    // Create booking (same for both modes)
    const bookingId = await createBooking({
      userId,
      creatorId,
      timeSlot,
      durationMinutes,
      tokenCost,
      transactionId,
    });

    return {
      success: true,
      bookingId,
      transactionId,
      tokenCost,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error creating booking:", error);
    throw new HttpsError("internal", "Failed to create booking");
  }
}

/**
 * Example: Earning Toggle Integration
 * 
 * Block earning toggle in review mode
 */
export async function integratedToggleEarning(
  request: CallableRequest<{
    enabled: boolean;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { enabled } = request.data;

  try {
    if (enabled) {
      // Get context
      const userDoc = await db.collection("users").doc(userId).get();
      const context = {
        env: "prod" as const,
        userId,
        country: userDoc.data()?.countryCode,
      };

      // Guard earning toggle - throws error in review mode
      await guardEarningToggle(context, userId);
    }

    // Update user earning status
    await db.collection("users").doc(userId).update({
      earningEnabled: enabled,
      updatedAt: new Date(),
    });

    return {
      success: true,
      earningEnabled: enabled,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error toggling earning:", error);
    throw new HttpsError("internal", "Failed to toggle earning");
  }
}

/**
 * Example: Refund Integration
 * 
 * Handle refunds via demo wallet in review mode
 */
export async function integratedProcessRefund(
  request: CallableRequest<{
    bookingId: string;
    reason: string;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { bookingId, reason } = request.data;

  try {
    // Get booking details
    const bookingDoc = await db.collection("bookings").doc(bookingId).get();
    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingDoc.data();
    if (booking?.userId !== userId) {
      throw new HttpsError("permission-denied", "Not your booking");
    }

    const refundAmount = booking.tokenCost;

    // Get context
    const userDoc = await db.collection("users").doc(userId).get();
    const context = {
      env: "prod" as const,
      userId,
      country: userDoc.data()?.countryCode,
    };

    // Guard refund
    const refundResult = await guardRefund(context, userId, refundAmount, reason);

    if (!refundResult.shouldUseRealWallet) {
      // Demo mode refund
      logger.info("Demo refund processed", { userId, refundAmount, bookingId });
    } else {
      // Real wallet refund
      // (Your existing refund logic here)
      await refundToRealWallet(userId, refundAmount);
    }

    // Update booking status (same for both modes)
    await db.collection("bookings").doc(bookingId).update({
      status: "REFUNDED",
      refundReason: reason,
      refundedAt: new Date(),
    });

    return {
      success: true,
      refundAmount,
      bookingId,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error processing refund:", error);
    throw new HttpsError("internal", "Failed to process refund");
  }
}

/**
 * Example: Discovery Feed Integration
 * 
 * Filter profiles for review mode
 */
export async function integratedGetDiscoveryFeed(
  request: CallableRequest<{
    limit?: number;
    offset?: number;
  }>
) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { limit = 20, offset = 0 } = request.data;

  try {
    // Get context
    const userDoc = await db.collection("users").doc(userId).get();
    const context = {
      env: "prod" as const,
      userId,
      country: userDoc.data()?.countryCode,
    };

    // Check if in review mode
    const isReviewMode = await isReviewModeSession(context);

    let profileIds: string[];

    if (isReviewMode) {
      // Review mode - get safe profiles
      const { getDemoProfileIds } = await import("./service");
      const demoProfiles = await getDemoProfileIds(limit);

      // Also get some safe non-demo profiles
      const safeProfiles = await getSafeProfiles(userId, limit - demoProfiles.length);

      profileIds = [...demoProfiles, ...safeProfiles].slice(offset, offset + limit);

      logger.info("Review mode discovery", {
        userId,
        demoProfileCount: demoProfiles.length,
        totalProfiles: profileIds.length,
      });
    } else {
      // Normal mode - regular discovery
      profileIds = await getRegularDiscoveryProfiles(userId, limit, offset);
    }

    // Get profile data
    const profiles = await Promise.all(
      profileIds.map(async (id) => {
        const doc = await db.collection("users").doc(id).get();
        return {
          id,
          ...doc.data(),
        };
      })
    );

    return {
      profiles,
      hasMore: profiles.length === limit,
    };
  } catch (error) {
    logger.error("Error getting discovery feed:", error);
    throw new HttpsError("internal", "Failed to get discovery feed");
  }
}

// ============================================
// HELPER FUNCTIONS (stubs for existing logic)
// ============================================

async function processStripePayment(
  userId: string,
  amount: number,
  packageId: string,
  paymentMethod: string
): Promise<{ success: boolean; id: string; newBalance: number }> {
  // Your existing Stripe integration
  return { success: true, id: "stripe_" + Date.now(), newBalance: 1000 };
}

async function processRealPayout(
  userId: string,
  amount: number,
  currency: string,
  paymentDetails: any
): Promise<{ id: string; status: string }> {
  // Your existing payout logic (Wise, bank transfer, etc.)
  return { id: "payout_" + Date.now(), status: "PROCESSING" };
}

async function deductFromRealWallet(userId: string, amount: number): Promise<string> {
  // Your existing wallet deduction logic
  return "transaction_" + Date.now();
}

async function refundToRealWallet(userId: string, amount: number): Promise<void> {
  // Your existing refund logic
}

async function getBalance(userId: string): Promise<number> {
  // Get user's token balance (real or demo based on mode)
  const isReviewMode = await isReviewModeSession({ env: "prod", userId });
  
  if (isReviewMode) {
    const { getDemoWallet } = await import("./service");
    const wallet = await getDemoWallet(userId);
    return wallet.balance;
  }
  
  // Return real wallet balance
  const userDoc = await db.collection("users").doc(userId).get();
  return userDoc.data()?.wallet?.balance || 0;
}

async function sendMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  content: string
): Promise<string> {
  // Your existing message sending logic
  const messageRef = await db.collection("chats").doc(chatId).collection("messages").add({
    senderId,
    recipientId,
    content,
    timestamp: new Date(),
  });
  return messageRef.id;
}

async function createBooking(data: {
  userId: string;
  creatorId: string;
  timeSlot: string;
  durationMinutes: number;
  tokenCost: number;
  transactionId: string;
}): Promise<string> {
  // Your existing booking creation logic
  const bookingRef = await db.collection("bookings").add({
    ...data,
    status: "CONFIRMED",
    createdAt: new Date(),
  });
  return bookingRef.id;
}

async function getSafeProfiles(userId: string, limit: number): Promise<string[]> {
  // Get profiles without NSFW flags
  const snapshot = await db
    .collection("users")
    .where("status", "==", "ACTIVE")
    .where("contentFlags.nsfw", "==", false)
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.id);
}

async function getRegularDiscoveryProfiles(
  userId: string,
  limit: number,
  offset: number
): Promise<string[]> {
  // Your existing discovery algorithm
  const snapshot = await db
    .collection("users")
    .where("status", "==", "ACTIVE")
    .limit(limit)
    .offset(offset)
    .get();

  return snapshot.docs.map((doc) => doc.id);
}