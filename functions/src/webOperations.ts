/**
 * Web Operations Cloud Functions
 * Handles web-specific operations for Avalo Web v1
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp, increment, generateId } from "./init";
import { PAID_CONTENT_CONFIG } from "./config/monetization";

interface FunctionResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Purchase creator content with tokens
 * Cloud Function: purchaseContent
 */
export const purchaseContentCallable = onCall(
  { region: "europe-west3" },
  async (request): Promise<FunctionResponse<{ contentId: string; unlocked: boolean }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { contentId } = request.data;

    if (!contentId) {
      throw new HttpsError("invalid-argument", "Content ID is required");
    }

    try {
      let unlocked = false;

      await db.runTransaction(async (transaction) => {
        // Get content document
        const contentRef = db.collection("creatorContent").doc(contentId);
        const contentSnap = await transaction.get(contentRef);

        if (!contentSnap.exists) {
          throw new HttpsError("not-found", "Content not found");
        }

        const content = contentSnap.data();
        const priceTokens = content?.priceTokens || 0;
        const creatorUid = content?.creatorUid;

        if (!creatorUid) {
          throw new HttpsError("internal", "Invalid content data");
        }

        // Check if already purchased
        const purchasesRef = db.collection("contentPurchases");
        const existingPurchase = await transaction.get(
          purchasesRef.where("userId", "==", userId).where("contentId", "==", contentId).limit(1)
        );

        if (!existingPurchase.empty) {
          throw new HttpsError("already-exists", "Content already purchased");
        }

        // Get user's wallet
        const walletRef = db.collection("users").doc(userId).collection("wallet").doc("current");
        const walletSnap = await transaction.get(walletRef);

        if (!walletSnap.exists) {
          throw new HttpsError("failed-precondition", "Wallet not found");
        }

        const wallet = walletSnap.data();
        const currentBalance = wallet?.balance || 0;

        if (currentBalance < priceTokens) {
          throw new HttpsError("failed-precondition", "Insufficient tokens");
        }

        // Calculate revenue split (70% creator, 30% Avalo)
        const creatorEarning = Math.floor(priceTokens * PAID_CONTENT_CONFIG.CREATOR_SPLIT);
        const avaloFee = priceTokens - creatorEarning;

        // Deduct tokens from buyer
        transaction.update(walletRef, {
          balance: increment(-priceTokens),
          spent: increment(priceTokens),
        });

        // Credit creator's wallet
        const creatorWalletRef = db.collection("users").doc(creatorUid).collection("wallet").doc("current");
        const creatorWalletSnap = await transaction.get(creatorWalletRef);

        if (creatorWalletSnap.exists) {
          transaction.update(creatorWalletRef, {
            earned: increment(creatorEarning),
            pending: increment(creatorEarning),
          });
        } else {
          transaction.set(creatorWalletRef, {
            balance: 0,
            earned: creatorEarning,
            pending: creatorEarning,
            spent: 0,
            settlementRate: 0.2,
          });
        }

        // Record purchase
        const purchaseId = generateId();
        transaction.set(db.collection("contentPurchases").doc(purchaseId), {
          id: purchaseId,
          userId,
          contentId,
          creatorUid,
          priceTokens,
          creatorEarning,
          avaloFee,
          purchasedAt: serverTimestamp(),
        });

        // Update purchase count
        transaction.update(contentRef, {
          purchaseCount: increment(1),
        });

        // Record transactions
        const buyerTxId = generateId();
        transaction.set(db.collection("transactions").doc(buyerTxId), {
          txId: buyerTxId,
          uid: userId,
          type: "debit",
          amountTokens: priceTokens,
          status: "completed",
          source: "content_purchase",
          metadata: { contentId, creatorUid },
          createdAt: serverTimestamp(),
        });

        const creatorTxId = generateId();
        transaction.set(db.collection("transactions").doc(creatorTxId), {
          txId: creatorTxId,
          uid: creatorUid,
          type: "earning",
          amountTokens: creatorEarning,
          status: "completed",
          source: "content_sale",
          metadata: { contentId, buyerUid: userId, avaloFee },
          createdAt: serverTimestamp(),
        });

        unlocked = true;
      });

      console.log(`Content ${contentId} purchased by user ${userId}`);

      return {
        ok: true,
        data: { contentId, unlocked },
      };
    } catch (error: any) {
      console.error("Purchase content error:", error);
      throw new HttpsError("internal", error.message || "Failed to purchase content");
    }
  }
);

/**
 * Update user's age18Plus flag
 * Cloud Function: updateAge18Plus
 */
export const updateAge18PlusCallable = onCall(
  { region: "europe-west3" },
  async (request): Promise<FunctionResponse<{ updated: boolean }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { age18Plus } = request.data;

    if (typeof age18Plus !== "boolean") {
      throw new HttpsError("invalid-argument", "age18Plus must be a boolean");
    }

    try {
      await db.collection("users").doc(userId).update({
        age18Plus,
        updatedAt: serverTimestamp(),
      });

      console.log(`User ${userId} age18Plus updated to ${age18Plus}`);

      return {
        ok: true,
        data: { updated: true },
      };
    } catch (error: any) {
      console.error("Update age18Plus error:", error);
      throw new HttpsError("internal", error.message || "Failed to update age verification");
    }
  }
);

/**
 * Create Stripe checkout session for web token purchase
 * Cloud Function: createWebTokenCheckoutSession
 */
export const createWebTokenCheckoutSessionCallable = onCall(
  { region: "europe-west3" },
  async (request): Promise<FunctionResponse<{ sessionId: string; url: string }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { packageId } = request.data;

    if (!packageId) {
      throw new HttpsError("invalid-argument", "Package ID is required");
    }

    // This function is a placeholder - actual implementation should be done
    // in the Next.js API routes to keep Stripe operations secure
    throw new HttpsError(
      "unimplemented",
      "Use Next.js API route /api/checkout/create-session instead"
    );
  }
);

/**
 * Create Stripe subscription checkout session
 * Cloud Function: createSubscriptionCheckoutSession
 */
export const createSubscriptionCheckoutSessionCallable = onCall(
  { region: "europe-west3" },
  async (request): Promise<FunctionResponse<{ sessionId: string; url: string }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { tierId } = request.data;

    if (!tierId) {
      throw new HttpsError("invalid-argument", "Tier ID is required");
    }

    // This function is a placeholder - actual implementation should be done
    // in the Next.js API routes to keep Stripe operations secure
    throw new HttpsError(
      "unimplemented",
      "Use Next.js API route /api/subscriptions/create-session instead"
    );
  }
);

/**
 * Get user's content purchases
 * Cloud Function: getUserContentPurchases
 */
export const getUserContentPurchasesCallable = onCall(
  { region: "europe-west3" },
  async (request): Promise<FunctionResponse<{ purchases: any[] }>> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;

    try {
      const purchasesSnapshot = await db
        .collection("contentPurchases")
        .where("userId", "==", userId)
        .orderBy("purchasedAt", "desc")
        .limit(100)
        .get();

      const purchases = purchasesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        ok: true,
        data: { purchases },
      };
    } catch (error: any) {
      console.error("Get purchases error:", error);
      throw new HttpsError("internal", error.message || "Failed to get purchases");
    }
  }
);