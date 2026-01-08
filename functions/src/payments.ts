/**
 * Payment Webhooks and Token Management
 * Handles Stripe webhooks, token crediting, and subscriptions
 * WITH IDEMPOTENCY PROTECTION
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
;
import { TransactionType } from './config.js';
import { Transaction, FunctionResponse } from "./types.js";
;

// Lazy Stripe initialization with Secret Manager
let stripe: Stripe | null = null;

const getStripe = async (): Promise<Stripe> => {
  if (!stripe) {
    const secretKey = await getStripeSecretKey();
    stripe = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripe;
};

/**
 * Stripe Webhook Handler with Idempotency Protection
 * POST /stripeWebhook
 */
export const stripeWebhook = onRequest(
  {
    region: "europe-west3",
    // PERFORMANCE: Keep 2 warm instances for critical payment processing
    // Target: <100ms p95 latency (from ~900ms with cold starts)
    minInstances: 2,
    maxInstances: 10,
    concurrency: 80,
    memory: "512MiB",
    timeoutSeconds: 60,
    cpu: 1,
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      console.error("No signature header");
      res.status(400).send("No signature");
      return;
    }

    let event: Stripe.Event;

    try {
      const stripeClient = await getStripe();
      const webhookSecret = await getStripeWebhookSecret();

      // Verify webhook signature
      event = stripeClient.webhooks.constructEvent(
        req.rawBody,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log("Stripe event received:", event.type, "ID:", event.id);

    // 🔒 IDEMPOTENCY CHECK
    const eventDocRef = db.collection("webhookEvents").doc(`stripe_${event.id}`);
    const eventDoc = await eventDocRef.get();

    if (eventDoc.exists) {
      const eventData = eventDoc.data();
      console.log(`Duplicate webhook event detected: ${event.id}, status: ${eventData?.status}`);
      res.json({ received: true, duplicate: true, status: eventData?.status });
      return;
    }

    // Process webhook with idempotency protection
    try {
      await db.runTransaction(async (transaction) => {
        // Mark event as processing first (prevents race conditions)
        transaction.set(eventDocRef, {
          eventId: event.id,
          type: event.type,
          status: "processing",
          processedAt: serverTimestamp(),
          retryCount: 0,
        });

        // Process the webhook event
        switch (event.type) {
          case "checkout.session.completed":
            await handleCheckoutCompletedWithTx(
              event.data.object as Stripe.Checkout.Session,
              transaction
            );
            break;

          case "payment_intent.succeeded":
            await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;

          case "customer.subscription.created":
          case "customer.subscription.updated":
            await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
            break;

          case "customer.subscription.deleted":
            await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;

          default:
            console.log(`Unhandled event type: ${event.type}`);
        }

        // Mark as completed
        transaction.update(eventDocRef, {
          status: "completed",
          completedAt: serverTimestamp(),
        });
      });

      console.log(`Webhook ${event.id} processed successfully`);
      res.json({ received: true });
    } catch (error: any) {
      console.error("Error processing webhook:", error);

      // Update status to failed
      try {
        await eventDocRef.update({
          status: "failed",
          error: error.message,
          failedAt: serverTimestamp(),
        });
      } catch (updateError) {
        console.error("Failed to update webhook status:", updateError);
      }

      res.status(500).send("Webhook processing failed");
    }
  });

/**
 * Handle completed checkout session (with transaction support)
 */
async function handleCheckoutCompletedWithTx(
  session: Stripe.Checkout.Session,
  transaction: FirebaseFirestore.Transaction
) {
  console.log("Processing checkout session:", session.id);

  const userId = session.metadata?.userId;
  const productType = session.metadata?.productType; // "tokens" or "subscription"

  if (!userId) {
    console.error("No userId in session metadata");
    return;
  }

  if (productType === "tokens") {
    const tokens = parseInt(session.metadata?.tokens || "0", 10);
    if (!tokens) {
      console.error("No tokens in session metadata");
      return;
    }
    await creditTokensWithTx(userId, tokens, session.id, transaction);
  } else if (productType === "subscription") {
    console.log("Subscription checkout completed, waiting for subscription event");
  }
}

/**
 * Handle successful payment intent
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment succeeded:", paymentIntent.id);
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Processing subscription:", subscription.id);

  const userId = subscription.metadata?.userId;
  const subscriptionType = subscription.metadata?.subscriptionType; // "vip", "royal", etc.

  if (!userId || !subscriptionType) {
    console.error("Missing userId or subscriptionType in subscription metadata");
    return;
  }

  const roleUpdate: Record<string, boolean> = {};

  if (subscriptionType === "vip") roleUpdate["roles.vip"] = true;
  if (subscriptionType === "royal") roleUpdate["roles.royal"] = true;

  if (Object.keys(roleUpdate).length > 0) {
    await db.collection("users").doc(userId).update({
      ...roleUpdate,
      updatedAt: serverTimestamp(),
    });
    console.log(`Granted ${subscriptionType} role to user ${userId}`);
  }
}

/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Processing subscription deletion:", subscription.id);

  const userId = subscription.metadata?.userId;
  const subscriptionType = subscription.metadata?.subscriptionType;

  if (!userId || !subscriptionType) {
    console.error("Missing userId or subscriptionType in subscription metadata");
    return;
  }

  const roleUpdate: Record<string, boolean> = {};

  if (subscriptionType === "vip") roleUpdate["roles.vip"] = false;
  if (subscriptionType === "royal") roleUpdate["roles.royal"] = false;

  if (Object.keys(roleUpdate).length > 0) {
    await db.collection("users").doc(userId).update({
      ...roleUpdate,
      updatedAt: serverTimestamp(),
    });
    console.log(`Revoked ${subscriptionType} role from user ${userId}`);
  }
}

/**
 * Credit tokens to user wallet (within existing transaction)
 */
async function creditTokensWithTx(
  userId: string,
  tokens: number,
  stripeSessionId: string,
  transaction: FirebaseFirestore.Transaction
) {
  const txId = generateId();
  const walletRef = db.collection("users").doc(userId).collection("wallet").doc("current");
  const walletSnap = await transaction.get(walletRef);

  if (!walletSnap.exists) {
    transaction.set(walletRef, {
      balance: tokens,
      pending: 0,
      earned: 0,
      settlementRate: 0.2,
    });
  } else {
    transaction.update(walletRef, {
      balance: increment(tokens),
    });
  }

  transaction.set(db.collection("transactions").doc(txId), {
    txId,
    uid: userId,
    type: TransactionType.PURCHASE,
    amountTokens: tokens,
    status: "completed",
    metadata: { stripeSessionId },
    createdAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  } as Transaction);

  console.log(`Credited ${tokens} tokens to user ${userId} (txId: ${txId})`);
}

/**
 * Manually credit tokens (admin only)
 */
export const creditTokensCallable = onCall(
    { region: "europe-west3" },
    async (request): Promise<FunctionResponse<{ newBalance: number }>> => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated");
      }

      const adminSnap = await db.collection("users").doc(request.auth.uid).get();
      const admin = adminSnap.data();

      if (!admin?.roles?.admin) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const { uid, tokens, source } = request.data;
      const txId = generateId();
      let newBalance = 0;

      await db.runTransaction(async (transaction) => {
        const walletRef = db.collection("users").doc(uid).collection("wallet").doc("current");
        const walletSnap = await transaction.get(walletRef);

        if (!walletSnap.exists) {
          transaction.set(walletRef, {
            balance: tokens,
            pending: 0,
            earned: 0,
            settlementRate: 0.2,
          });
          newBalance = tokens;
        } else {
          const prev = (walletSnap.data()?.balance || 0) as number;
          transaction.update(walletRef, {
            balance: increment(tokens),
          });
          newBalance = prev + tokens;
        }

        transaction.set(db.collection("transactions").doc(txId), {
          txId,
          uid,
          type: TransactionType.PURCHASE,
          amountTokens: tokens,
          status: "completed",
          metadata: { source, adminUid: request.auth?.uid ?? "system" },
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        } as Transaction);
      });

      return { ok: true, data: { newBalance } };
    }
  );

/**
 * Request payout (creator withdrawal)
 */
export const requestPayoutCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ payoutId: string }>> => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated");
      }

      const userId = request.auth.uid;
      const { method, amountTokens, details } = request.data;

      const walletSnap = await db
        .collection("users")
        .doc(userId)
        .collection("wallet")
        .doc("current")
        .get();

      const wallet = walletSnap.data();

      if (!wallet || wallet.earned < amountTokens) {
        throw new HttpsError("failed-precondition", "Insufficient earned tokens");
      }

      if (amountTokens < 500) {
        throw new HttpsError("invalid-argument", "Minimum payout is 500 tokens");
      }

      const amountPLN = amountTokens * 0.2;
      const payoutId = generateId();

      await db.collection("payoutRequests").doc(payoutId).set({
        payoutId,
        userId,
        method,
        amountTokens,
        amountPLN,
        details,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      await db
        .collection("users")
        .doc(userId)
        .collection("wallet")
        .doc("current")
        .update({
          earned: increment(-amountTokens),
        });

      console.log(`Payout request ${payoutId} created for user ${userId}`);

      return { ok: true, data: { payoutId } };
    }
  );


