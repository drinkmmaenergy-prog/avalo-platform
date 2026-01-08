"use strict";
/**
 * Payment Webhooks and Token Management
 * Handles Stripe webhooks, token crediting, and subscriptions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPayoutCallable = exports.creditTokensCallable = exports.stripeWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const stripe_1 = __importDefault(require("stripe"));
const init_1 = require("./init");
const config_1 = require("./config");
// Lazy Stripe initialization (only when needed, not at module load)
let stripe = null;
const getStripe = () => {
    if (!stripe) {
        const stripeConfig = (0, config_1.getStripeConfig)();
        if (!stripeConfig.secretKey) {
            throw new Error("STRIPE_SECRET_KEY environment variable is not set");
        }
        stripe = new stripe_1.default(stripeConfig.secretKey, {
            apiVersion: "2025-02-24.acacia",
        });
    }
    return stripe;
};
/**
 * Stripe Webhook Handler
 * POST /stripeWebhook
 */
exports.stripeWebhook = (0, https_1.onRequest)({ region: "europe-west3" }, async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
        console.error("No signature header");
        res.status(400).send("No signature");
        return;
    }
    let event;
    try {
        const stripeClient = getStripe();
        const stripeConfig = (0, config_1.getStripeConfig)();
        // Verify webhook signature
        event = stripeClient.webhooks.constructEvent(req.rawBody, sig, stripeConfig.webhookSecret);
    }
    catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    console.log("Stripe event received:", event.type);
    try {
        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutCompleted(event.data.object);
                break;
            case "payment_intent.succeeded":
                await handlePaymentSucceeded(event.data.object);
                break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Webhook processing failed");
    }
});
/**
 * Handle completed checkout session
 */
async function handleCheckoutCompleted(session) {
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
        await creditTokens(userId, tokens, session.id);
    }
    else if (productType === "subscription") {
        console.log("Subscription checkout completed, waiting for subscription event");
    }
}
/**
 * Handle successful payment intent
 */
async function handlePaymentSucceeded(paymentIntent) {
    console.log("Payment succeeded:", paymentIntent.id);
}
/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdated(subscription) {
    console.log("Processing subscription:", subscription.id);
    const userId = subscription.metadata?.userId;
    const subscriptionType = subscription.metadata?.subscriptionType; // "vip", "royal", etc.
    if (!userId || !subscriptionType) {
        console.error("Missing userId or subscriptionType in subscription metadata");
        return;
    }
    const roleUpdate = {};
    if (subscriptionType === "vip")
        roleUpdate["roles.vip"] = true;
    if (subscriptionType === "royal")
        roleUpdate["roles.royal"] = true;
    if (Object.keys(roleUpdate).length > 0) {
        await init_1.db.collection("users").doc(userId).update({
            ...roleUpdate,
            updatedAt: (0, init_1.serverTimestamp)(),
        });
        console.log(`Granted ${subscriptionType} role to user ${userId}`);
    }
}
/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription) {
    console.log("Processing subscription deletion:", subscription.id);
    const userId = subscription.metadata?.userId;
    const subscriptionType = subscription.metadata?.subscriptionType;
    if (!userId || !subscriptionType) {
        console.error("Missing userId or subscriptionType in subscription metadata");
        return;
    }
    const roleUpdate = {};
    if (subscriptionType === "vip")
        roleUpdate["roles.vip"] = false;
    if (subscriptionType === "royal")
        roleUpdate["roles.royal"] = false;
    if (Object.keys(roleUpdate).length > 0) {
        await init_1.db.collection("users").doc(userId).update({
            ...roleUpdate,
            updatedAt: (0, init_1.serverTimestamp)(),
        });
        console.log(`Revoked ${subscriptionType} role from user ${userId}`);
    }
}
/**
 * Credit tokens to user wallet
 */
async function creditTokens(userId, tokens, stripeSessionId) {
    const txId = (0, init_1.generateId)();
    await init_1.db.runTransaction(async (transaction) => {
        const walletRef = init_1.db.collection("users").doc(userId).collection("wallet").doc("current");
        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists) {
            transaction.set(walletRef, {
                balance: tokens,
                pending: 0,
                earned: 0,
                settlementRate: 0.2,
            });
        }
        else {
            transaction.update(walletRef, {
                balance: (0, init_1.increment)(tokens),
            });
        }
        transaction.set(init_1.db.collection("transactions").doc(txId), {
            txId,
            uid: userId,
            type: config_1.TransactionType.PURCHASE,
            amountTokens: tokens,
            status: "completed",
            metadata: { stripeSessionId },
            createdAt: (0, init_1.serverTimestamp)(),
            completedAt: (0, init_1.serverTimestamp)(),
        });
    });
    console.log(`Credited ${tokens} tokens to user ${userId}`);
}
/**
 * Manually credit tokens (admin only)
 */
exports.creditTokensCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const adminSnap = await init_1.db.collection("users").doc(request.auth.uid).get();
    const admin = adminSnap.data();
    if (!admin?.roles?.admin) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { uid, tokens, source } = request.data;
    const txId = (0, init_1.generateId)();
    let newBalance = 0;
    await init_1.db.runTransaction(async (transaction) => {
        const walletRef = init_1.db.collection("users").doc(uid).collection("wallet").doc("current");
        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists) {
            transaction.set(walletRef, {
                balance: tokens,
                pending: 0,
                earned: 0,
                settlementRate: 0.2,
            });
            newBalance = tokens;
        }
        else {
            const prev = (walletSnap.data()?.balance || 0);
            transaction.update(walletRef, {
                balance: (0, init_1.increment)(tokens),
            });
            newBalance = prev + tokens;
        }
        transaction.set(init_1.db.collection("transactions").doc(txId), {
            txId,
            uid,
            type: config_1.TransactionType.PURCHASE,
            amountTokens: tokens,
            status: "completed",
            metadata: { source, adminUid: request.auth?.uid ?? "system" },
            createdAt: (0, init_1.serverTimestamp)(),
            completedAt: (0, init_1.serverTimestamp)(),
        });
    });
    return { ok: true, data: { newBalance } };
});
/**
 * Request payout (creator withdrawal)
 */
exports.requestPayoutCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const userId = request.auth.uid;
    const { method, amountTokens, details } = request.data;
    const walletSnap = await init_1.db
        .collection("users")
        .doc(userId)
        .collection("wallet")
        .doc("current")
        .get();
    const wallet = walletSnap.data();
    if (!wallet || wallet.earned < amountTokens) {
        throw new https_1.HttpsError("failed-precondition", "Insufficient earned tokens");
    }
    if (amountTokens < 500) {
        throw new https_1.HttpsError("invalid-argument", "Minimum payout is 500 tokens");
    }
    const amountPLN = amountTokens * 0.2;
    const payoutId = (0, init_1.generateId)();
    await init_1.db.collection("payoutRequests").doc(payoutId).set({
        payoutId,
        userId,
        method,
        amountTokens,
        amountPLN,
        details,
        status: "pending",
        createdAt: (0, init_1.serverTimestamp)(),
    });
    await init_1.db
        .collection("users")
        .doc(userId)
        .collection("wallet")
        .doc("current")
        .update({
        earned: (0, init_1.increment)(-amountTokens),
    });
    console.log(`Payout request ${payoutId} created for user ${userId}`);
    return { ok: true, data: { payoutId } };
});
//# sourceMappingURL=payments.js.map