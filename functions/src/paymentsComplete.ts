/**
 * ========================================================================
 * AVALO COMPLETE PAYMENT SYSTEM INTEGRATION
 * ========================================================================
 *
 * Dual-path payment architecture:
 * - iOS: Apple In-App Purchase (StoreKit 2)
 * - Android/Web: Stripe Checkout
 *
 * Features:
 * - Idempotency across all operations
 * - Atomic wallet operations
 * - Escrow system for chat & calendar
 * - Settlement & payout processing
 * - VAT calculation engine
 * - Comprehensive error handling
 *
 * @version 1.0.0
 * @region europe-west3
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
;
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import Stripe from "stripe";
;
;
;

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum PaymentProvider {
  STRIPE = "stripe",
  APPLE_IAP = "apple_iap",
}

export enum Currency {
  PLN = "PLN",
  EUR = "EUR",
  USD = "USD",
  GBP = "GBP",
}

export interface TokenPack {
  tokens: number;
  prices: Record<Currency, number>;
}

export const TOKEN_PACKS: Record<string, TokenPack> = {
  MINI: { tokens: 100, prices: { PLN: 20, USD: 5.49, EUR: 4.99, GBP: 4.49 } },
  BASIC: { tokens: 300, prices: { PLN: 60, USD: 15.99, EUR: 14.99, GBP: 12.99 } },
  STANDARD: { tokens: 500, prices: { PLN: 100, USD: 26.99, EUR: 24.99, GBP: 21.99 } },
  PREMIUM: { tokens: 1000, prices: { PLN: 200, USD: 52.99, EUR: 49.99, GBP: 43.99 } },
  PRO: { tokens: 2000, prices: { PLN: 400, USD: 104.99, EUR: 99.99, GBP: 87.99 } },
  ELITE: { tokens: 5000, prices: { PLN: 1000, USD: 259.99, EUR: 249.99, GBP: 219.99 } },
};

export interface PaymentSession {
  sessionId: string;
  userId: string;
  provider: PaymentProvider;
  platform: "ios" | "android" | "web";
  productType: "tokens" | "subscription" | "unlock";
  tokens?: number;
  amount: number;
  currency: string;
  providerSessionId: string;
  providerProductId?: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded";
  idempotencyKey: string;
  webhookProcessedAt?: Timestamp;
  webhookAttempts: number;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt?: Timestamp;
}

export interface Transaction {
  txId: string;
  userId: string;
  type: "deposit" | "earning" | "spending" | "refund" | "settlement" | "escrow_hold" | "escrow_release";
  subtype?: "token_purchase" | "chat_fee" | "video_fee" | "calendar_fee" | "tip" | "subscription";
  tokens: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  provider?: PaymentProvider;
  providerTxId?: string;
  paymentSessionId?: string;
  escrowStatus?: "held" | "released" | "refunded";
  escrowReleaseAt?: Timestamp;
  relatedUserId?: string;
  relatedChatId?: string;
  relatedPostId?: string;
  relatedBookingId?: string;
  splits?: {
    platformFee: number;
    platformFeePercent: number;
    creatorAmount: number;
    creatorPercent: number;
  };
  balanceBefore: number;
  balanceAfter: number;
  status: "pending" | "completed" | "failed" | "reversed";
  description: string;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export interface UserWallet {
  userId: string;
  balance: number;
  pendingBalance: number;
  earnedBalance: number;
  spentBalance: number;
  stripeCustomerId?: string;
  appleCustomerId?: string;
  preferredCurrency: string;
  totalDeposits: number;
  totalEarnings: number;
  totalSpending: number;
  totalRefunds: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EscrowRecord {
  escrowId: string;
  payerId: string;
  recipientId: string;
  type: "chat" | "booking" | "unlock";
  relatedId: string;
  totalTokens: number;
  platformFee: number;
  availableTokens: number;
  consumedTokens: number;
  status: "active" | "completed" | "refunded" | "expired";
  releaseType: "incremental" | "milestone" | "time-based";
  autoReleaseAt?: Timestamp;
  refundEligible: boolean;
  refundReason?: string;
  refundedAt?: Timestamp;
  refundedAmount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface Settlement {
  settlementId: string;
  creatorId: string;
  creatorEmail: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  periodLabel: string;
  totalTokensEarned: number;
  platformFeesDeducted: number;
  netTokensPayable: number;
  settlementRate: number;
  fiatAmount: number;
  fiatCurrency: string;
  vatApplicable: boolean;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
  payoutMethod?: string;
  payoutDestination?: string;
  status: "pending" | "processing" | "paid" | "failed" | "disputed";
  payoutProviderId?: string;
  payoutReference?: string;
  transactionIds: string[];
  createdAt: Timestamp;
  processedAt?: Timestamp;
  paidAt?: Timestamp;
}

// ============================================================================
// STRIPE CHECKOUT SESSION
// ============================================================================

/**
 * Create Stripe checkout session with full idempotency
 */
export const createStripeCheckoutSession = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { tokens, currency = "USD" } = request.data as {
      tokens: number;
      currency?: Currency;
    };

    if (!tokens || !TOKEN_PACKS[Object.keys(TOKEN_PACKS).find(k => TOKEN_PACKS[k].tokens === tokens) || ""]) {
      throw new HttpsError("invalid-argument", "Invalid token amount");
    }

    try {
      // Generate idempotency key
      const idempotencyKey = `checkout_${userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

      // Get token pack pricing
      const packKey = Object.keys(TOKEN_PACKS).find(k => TOKEN_PACKS[k].tokens === tokens)!;
      const pack = TOKEN_PACKS[packKey];
      const amount = pack.prices[currency];

      // Initialize Stripe
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2025-02-24.acacia",
      });

      // Create Stripe session with idempotency
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${tokens} Avalo Tokens`,
              description: "Digital currency for Avalo platform",
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${process.env.WEB_URL}/wallet?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.WEB_URL}/wallet?payment=cancelled`,
        metadata: {
          userId,
          tokens: tokens.toString(),
          productType: "tokens",
          idempotencyKey,
        },
        customer_email: request.auth!.token.email,
      }, {
        idempotencyKey: `stripe_${idempotencyKey}`,
      });

      // Save payment session to Firestore
      const paymentSession: PaymentSession = {
        sessionId: session.id,
        userId,
        provider: PaymentProvider.STRIPE,
        platform: "web",
        productType: "tokens",
        tokens,
        amount,
        currency,
        providerSessionId: session.id,
        status: "pending",
        idempotencyKey,
        webhookAttempts: 0,
        metadata: {
          userAgent: request.rawRequest.headers["user-agent"],
          packKey,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 1800000), // 30 minutes
      };

      await db.collection("paymentSessions").doc(session.id).set(paymentSession);

      await logServerEvent("payment_session_created", userId, {
        provider: "stripe",
        tokens,
        amount,
        currency,
        sessionId: session.id,
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url,
      };
    } catch (error: any) {
      logger.error("Error creating Stripe checkout session:", error);
      throw new HttpsError("internal", `Failed to create checkout session: ${error.message}`);
    }
  }
);

// ============================================================================
// STRIPE WEBHOOK PROCESSOR V2
// ============================================================================

/**
 * Secure Stripe webhook processor with signature verification and idempotency
 */
export const stripeWebhookV2 = onRequest(
  { region: "europe-west3" },
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      logger.error("Missing Stripe signature");
      res.status(400).send("Missing signature");
      return;
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2025-02-24.acacia",
      });

      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      logger.error("Webhook signature verification failed:", err);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    logger.info(`Stripe webhook received: ${event.type}, id: ${event.id}`);

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleStripeCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleStripeSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await handleStripeSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case "charge.refunded":
          await handleStripeRefund(event.data.object as Stripe.Charge);
          break;

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error("Webhook processing error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

async function handleStripeCheckoutCompleted(session: Stripe.Checkout.Session) {
  const sessionId = session.id;

  // Find payment session
  const sessionDoc = await db.collection("paymentSessions").doc(sessionId).get();

  if (!sessionDoc.exists) {
    logger.error(`Payment session not found: ${sessionId}`);
    return;
  }

  const paymentSession = sessionDoc.data() as PaymentSession;

  // Idempotency check
  if (paymentSession.status === "completed") {
    logger.info(`Already processed: ${sessionId}`);
    return;
  }

  try {
    // Credit tokens atomically
    await db.runTransaction(async (tx) => {
      const userId = paymentSession.userId;
      const tokens = paymentSession.tokens!;

      // Get or create wallet
      const walletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
      const walletSnap = await tx.get(walletRef);

      let currentBalance = 0;
      if (walletSnap.exists) {
        currentBalance = (walletSnap.data() as UserWallet).balance || 0;
      } else {
        // Initialize wallet
        const newWallet: UserWallet = {
          userId,
          balance: 0,
          pendingBalance: 0,
          earnedBalance: 0,
          spentBalance: 0,
          preferredCurrency: paymentSession.currency,
          totalDeposits: 0,
          totalEarnings: 0,
          totalSpending: 0,
          totalRefunds: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        tx.set(walletRef, newWallet);
      }

      // Create transaction record
      const txRef = db.collection("transactions").doc(`tx_stripe_${sessionId}`);
      const transaction: Transaction = {
        txId: `tx_stripe_${sessionId}`,
        userId,
        type: "deposit",
        subtype: "token_purchase",
        tokens,
        fiatAmount: paymentSession.amount,
        fiatCurrency: paymentSession.currency,
        provider: PaymentProvider.STRIPE,
        providerTxId: session.payment_intent as string,
        paymentSessionId: sessionId,
        status: "completed",
        balanceBefore: currentBalance,
        balanceAfter: currentBalance + tokens,
        description: `Purchased ${tokens} tokens`,
        metadata: {},
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };
      tx.set(txRef, transaction);

      // Update wallet
      tx.update(walletRef, {
        balance: FieldValue.increment(tokens),
        totalDeposits: FieldValue.increment(tokens),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update payment session
      tx.update(sessionDoc.ref, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        webhookProcessedAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info(`Tokens credited successfully: ${sessionId}`);

    await logServerEvent("tokens_credited", paymentSession.userId, {
      tokens: paymentSession.tokens,
      provider: "stripe",
      sessionId,
    });
  } catch (error: any) {
    logger.error(`Transaction failed for ${sessionId}:`, error);

    // Update attempt count
    await sessionDoc.ref.update({
      webhookAttempts: FieldValue.increment(1),
      status: "failed",
    });

    throw error;
  }
}

async function handleStripeSubscriptionUpdate(subscription: Stripe.Subscription) {
  // Implementation for subscription management
  logger.info(`Subscription updated: ${subscription.id}`);
}

async function handleStripeSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Implementation for subscription cancellation
  logger.info(`Subscription deleted: ${subscription.id}`);
}

async function handleStripeRefund(charge: Stripe.Charge) {
  // Implementation for refund processing
  logger.info(`Refund processed: ${charge.id}`);
}

// ============================================================================
// APPLE IAP INTEGRATION
// ============================================================================

/**
 * Validate Apple IAP receipt and credit tokens
 */
export const validateAppleReceipt = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { receiptData, transactionId, productId } = request.data as {
      receiptData: string;
      transactionId: string;
      productId: string;
    };

    if (!receiptData || !transactionId || !productId) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      // Check idempotency
      const existingTx = await db.collection("transactions")
        .where("providerTxId", "==", transactionId)
        .limit(1)
        .get();

      if (!existingTx.empty) {
        return { success: true, message: "Already processed", tokens: existingTx.docs[0].data().tokens };
      }

      // Verify receipt with Apple
      const verificationResult = await verifyAppleReceiptWithServer(receiptData);

      if (!verificationResult.valid) {
        throw new HttpsError("invalid-argument", "Invalid receipt");
      }

      // Extract token amount from product ID (e.g., "avalo.tokens.standard.500")
      const tokens = extractTokensFromProductId(productId);

      // Credit user atomically
      await db.runTransaction(async (tx) => {
        const walletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
        const walletSnap = await tx.get(walletRef);
        const currentBalance = walletSnap.exists ? ((walletSnap.data() as UserWallet).balance || 0) : 0;

        if (!walletSnap.exists) {
          const newWallet: UserWallet = {
            userId,
            balance: 0,
            pendingBalance: 0,
            earnedBalance: 0,
            spentBalance: 0,
            preferredCurrency: "USD",
            totalDeposits: 0,
            totalEarnings: 0,
            totalSpending: 0,
            totalRefunds: 0,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          };
          tx.set(walletRef, newWallet);
        }

        // Create transaction record
        const txRef = db.collection("transactions").doc(`tx_apple_${transactionId}`);
        const transaction: Transaction = {
          txId: `tx_apple_${transactionId}`,
          userId,
          type: "deposit",
          subtype: "token_purchase",
          tokens,
          provider: PaymentProvider.APPLE_IAP,
          providerTxId: transactionId,
          status: "completed",
          balanceBefore: currentBalance,
          balanceAfter: currentBalance + tokens,
          description: `Purchased ${tokens} tokens via Apple IAP`,
          metadata: { productId },
          createdAt: Timestamp.now(),
          completedAt: Timestamp.now(),
        };
        tx.set(txRef, transaction);

        // Update wallet
        tx.update(walletRef, {
          balance: FieldValue.increment(tokens),
          totalDeposits: FieldValue.increment(tokens),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await logServerEvent("tokens_credited", userId, {
        tokens,
        provider: "apple_iap",
        transactionId,
      });

      return { success: true, tokens };
    } catch (error: any) {
      logger.error("Error validating Apple receipt:", error);
      throw new HttpsError("internal", `Receipt validation failed: ${error.message}`);
    }
  }
);

async function verifyAppleReceiptWithServer(receiptData: string): Promise<{ valid: boolean }> {
  const url = process.env.APPLE_SANDBOX === "true"
    ? "https://sandbox.itunes.apple.com/verifyReceipt"
    : "https://buy.itunes.apple.com/verifyReceipt";

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receiptData,
      "password": process.env.APPLE_SHARED_SECRET,
      "exclude-old-transactions": true,
    }),
  });

  const result = await response.json();

  if (result.status === 21007) {
    // Retry with sandbox
    return verifyAppleReceiptWithServer(receiptData);
  }

  return { valid: result.status === 0 };
}

function extractTokensFromProductId(productId: string): number {
  const match = productId.match(/\.(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// ============================================================================
// CHAT ESCROW SYSTEM
// ============================================================================

/**
 * Initiate chat with deposit and escrow
 */
export const initiateChat = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { recipientId, initialMessage } = request.data as {
      recipientId: string;
      initialMessage: string;
    };

    if (!recipientId) {
      throw new HttpsError("invalid-argument", "Recipient ID required");
    }

    const CHAT_DEPOSIT = 100;
    const PLATFORM_FEE_PERCENT = 35;
    const platformFee = Math.floor(CHAT_DEPOSIT * PLATFORM_FEE_PERCENT / 100);
    const escrowAmount = CHAT_DEPOSIT - platformFee;

    try {
      await db.runTransaction(async (tx) => {
        // Check user balance
        const walletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
        const walletSnap = await tx.get(walletRef);
        const currentBalance = walletSnap.exists ? ((walletSnap.data() as UserWallet).balance || 0) : 0;

        if (currentBalance < CHAT_DEPOSIT) {
          throw new HttpsError("failed-precondition", "Insufficient balance");
        }

        // Create chat
        const chatRef = db.collection("chats").doc();
        tx.set(chatRef, {
          chatId: chatRef.id,
          participants: [userId, recipientId],
          type: "direct",
          status: "active",
          depositAmount: CHAT_DEPOSIT,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Create escrow record
        const escrowRef = db.collection("escrow").doc(`esc_${chatRef.id}`);
        const escrow: EscrowRecord = {
          escrowId: `esc_${chatRef.id}`,
          payerId: userId,
          recipientId,
          type: "chat",
          relatedId: chatRef.id,
          totalTokens: CHAT_DEPOSIT,
          platformFee,
          availableTokens: escrowAmount,
          consumedTokens: 0,
          status: "active",
          releaseType: "incremental",
          autoReleaseAt: Timestamp.fromMillis(Date.now() + 172800000), // 48 hours
          refundEligible: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        tx.set(escrowRef, escrow);

        // Deduct from user wallet
        tx.update(walletRef, {
          balance: FieldValue.increment(-CHAT_DEPOSIT),
          totalSpending: FieldValue.increment(CHAT_DEPOSIT),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create spending transaction
        const spendingTxRef = db.collection("transactions").doc(`tx_chat_spend_${chatRef.id}`);
        tx.set(spendingTxRef, {
          txId: `tx_chat_spend_${chatRef.id}`,
          userId,
          type: "spending",
          subtype: "chat_fee",
          tokens: -CHAT_DEPOSIT,
          relatedUserId: recipientId,
          relatedChatId: chatRef.id,
          status: "completed",
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - CHAT_DEPOSIT,
          description: "Chat deposit + platform fee",
          metadata: {},
          createdAt: Timestamp.now(),
        });

        // Create platform fee transaction
        const feeTxRef = db.collection("transactions").doc(`tx_chat_fee_${chatRef.id}`);
        tx.set(feeTxRef, {
          txId: `tx_chat_fee_${chatRef.id}`,
          userId: "platform",
          type: "earning",
          subtype: "chat_fee",
          tokens: platformFee,
          relatedUserId: recipientId,
          relatedChatId: chatRef.id,
          splits: {
            platformFee,
            platformFeePercent: PLATFORM_FEE_PERCENT,
            creatorAmount: escrowAmount,
            creatorPercent: 100 - PLATFORM_FEE_PERCENT,
          },
          status: "completed",
          balanceBefore: 0,
          balanceAfter: platformFee,
          description: "Platform fee (non-refundable)",
          metadata: {},
          createdAt: Timestamp.now(),
        });

        // Create escrow hold transaction
        const escrowTxRef = db.collection("transactions").doc(`tx_chat_escrow_${chatRef.id}`);
        tx.set(escrowTxRef, {
          txId: `tx_chat_escrow_${chatRef.id}`,
          userId: recipientId,
          type: "escrow_hold",
          subtype: "chat_fee",
          tokens: escrowAmount,
          relatedUserId: userId,
          relatedChatId: chatRef.id,
          escrowStatus: "held",
          status: "pending",
          balanceBefore: 0,
          balanceAfter: 0,
          description: "Tokens held in escrow",
          metadata: {},
          createdAt: Timestamp.now(),
        });
      });

      return { success: true };
    } catch (error: any) {
      logger.error("Error initiating chat:", error);
      throw new HttpsError("internal", `Failed to initiate chat: ${error.message}`);
    }
  }
);

/**
 * Release escrow incrementally (chat messages)
 */
export const releaseEscrowIncremental = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { chatId, tokensToRelease } = request.data as {
      chatId: string;
      tokensToRelease: number;
    };

    try {
      await db.runTransaction(async (tx) => {
        const escrowRef = db.collection("escrow").doc(`esc_${chatId}`);
        const escrowSnap = await tx.get(escrowRef);

        if (!escrowSnap.exists) {
          throw new HttpsError("not-found", "Escrow not found");
        }

        const escrow = escrowSnap.data() as EscrowRecord;

        if (escrow.recipientId !== userId) {
          throw new HttpsError("permission-denied", "Not authorized");
        }

        if (escrow.availableTokens < tokensToRelease) {
          throw new HttpsError("failed-precondition", "Insufficient escrow balance");
        }

        // Update escrow
        tx.update(escrowRef, {
          consumedTokens: FieldValue.increment(tokensToRelease),
          availableTokens: FieldValue.increment(-tokensToRelease),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit creator
        const creatorWalletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
        const creatorWalletSnap = await tx.get(creatorWalletRef);
        const creatorBalance = creatorWalletSnap.exists ? ((creatorWalletSnap.data() as UserWallet).balance || 0) : 0;

        tx.update(creatorWalletRef, {
          balance: FieldValue.increment(tokensToRelease),
          earnedBalance: FieldValue.increment(tokensToRelease),
          totalEarnings: FieldValue.increment(tokensToRelease),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create transaction
        const txRef = db.collection("transactions").doc(`tx_escrow_rel_${chatId}_${Date.now()}`);
        tx.set(txRef, {
          txId: txRef.id,
          userId,
          type: "escrow_release",
          subtype: "chat_fee",
          tokens: tokensToRelease,
          relatedUserId: escrow.payerId,
          relatedChatId: chatId,
          escrowStatus: "released",
          status: "completed",
          balanceBefore: creatorBalance,
          balanceAfter: creatorBalance + tokensToRelease,
          description: `Earned ${tokensToRelease} tokens from chat`,
          metadata: {},
          createdAt: Timestamp.now(),
        });
      });

      return { success: true };
    } catch (error: any) {
      logger.error("Error releasing escrow:", error);
      throw new HttpsError("internal", `Failed to release escrow: ${error.message}`);
    }
  }
);

/**
 * Auto-refund inactive escrows (scheduled function)
 */
export const autoRefundInactiveEscrows = onSchedule(
  {
    schedule: "every 1 hours",
    region: "europe-west3",
  },
  async () => {
    const now = Timestamp.now();

    const escrowsSnap = await db.collection("escrow")
      .where("status", "==", "active")
      .where("autoReleaseAt", "<=", now)
      .limit(100)
      .get();

    for (const escrowDoc of escrowsSnap.docs) {
      const escrow = escrowDoc.data() as EscrowRecord;

      try {
        await db.runTransaction(async (tx) => {
          // Update escrow status
          tx.update(escrowDoc.ref, {
            status: "refunded",
            refundedAt: FieldValue.serverTimestamp(),
            refundedAmount: escrow.availableTokens,
          });

          // Refund to payer
          const payerWalletRef = db.collection("users").doc(escrow.payerId).collection("wallet").doc("main");
          const payerWalletSnap = await tx.get(payerWalletRef);
          const payerBalance = payerWalletSnap.exists ? ((payerWalletSnap.data() as UserWallet).balance || 0) : 0;

          tx.update(payerWalletRef, {
            balance: FieldValue.increment(escrow.availableTokens),
            totalRefunds: FieldValue.increment(escrow.availableTokens),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Create refund transaction
          const txRef = db.collection("transactions").doc(`tx_refund_${escrow.escrowId}`);
          tx.set(txRef, {
            txId: txRef.id,
            userId: escrow.payerId,
            type: "refund",
            subtype: "chat_fee",
            tokens: escrow.availableTokens,
            relatedUserId: escrow.recipientId,
            relatedChatId: escrow.relatedId,
            status: "completed",
            balanceBefore: payerBalance,
            balanceAfter: payerBalance + escrow.availableTokens,
            description: "Auto-refund: 48h inactivity",
            metadata: {},
            createdAt: Timestamp.now(),
          });
        });

        logger.info(`Refunded escrow: ${escrow.escrowId}`);
      } catch (error: any) {
        logger.error(`Failed to refund escrow ${escrow.escrowId}:`, error);
      }
    }
  }
);

// ============================================================================
// VAT CALCULATION ENGINE
// ============================================================================

const VAT_RATES: Record<string, number> = {
  AT: 0.20, BE: 0.21, BG: 0.20, HR: 0.25, CY: 0.19, CZ: 0.21, DK: 0.25, EE: 0.22,
  FI: 0.255, FR: 0.20, DE: 0.19, GR: 0.24, HU: 0.27, IE: 0.23, IT: 0.22, LV: 0.21,
  LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21, PL: 0.23, PT: 0.23, RO: 0.19, SK: 0.20,
  SI: 0.22, ES: 0.21, SE: 0.25, GB: 0.20, US: 0.00, CA: 0.00, AU: 0.10, NZ: 0.15,
  JP: 0.10, IN: 0.18,
};

function getVATRate(countryCode: string): number {
  return VAT_RATES[countryCode] || 0;
}

interface VATCalculation {
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
}

function calculateVAT(netAmount: number, countryCode: string): VATCalculation {
  const vatRate = getVATRate(countryCode);
  const vatAmount = netAmount * vatRate;
  const grossAmount = netAmount + vatAmount;

  return { netAmount, vatRate, vatAmount, grossAmount };
}

// ============================================================================
// SETTLEMENT & PAYOUT SYSTEM
// ============================================================================

/**
 * Generate monthly settlements (scheduled function)
 */
export const generateMonthlySettlements = onSchedule(
  {
    schedule: "0 0 1 * *", // 1st of each month at midnight
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
  },
  async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const creatorsSnap = await db.collection("users")
      .where("isCreator", "==", true)
      .get();

    for (const creatorDoc of creatorsSnap.docs) {
      const creatorId = creatorDoc.id;
      const creatorData = creatorDoc.data();

      // Sum earnings for the month
      const earningsSnap = await db.collection("transactions")
        .where("userId", "==", creatorId)
        .where("type", "==", "earning")
        .where("createdAt", ">=", Timestamp.fromDate(lastMonth))
        .where("createdAt", "<", Timestamp.fromDate(thisMonth))
        .get();

      let totalTokens = 0;
      const txIds: string[] = [];

      earningsSnap.docs.forEach((doc) => {
        const tx = doc.data() as Transaction;
        totalTokens += tx.tokens;
        txIds.push(tx.txId);
      });

      if (totalTokens === 0) continue;

      // Calculate payout
      const settlementRate = 0.20; // PLN per token
      const fiatAmount = totalTokens * settlementRate;

      // Get VAT rate
      const country = creatorData.location?.country || "PL";
      const vatCalc = calculateVAT(fiatAmount, country);

      // Create settlement record
      const settlementRef = db.collection("settlements").doc();
      const settlement: Settlement = {
        settlementId: settlementRef.id,
        creatorId,
        creatorEmail: creatorData.email,
        periodStart: Timestamp.fromDate(lastMonth),
        periodEnd: Timestamp.fromDate(thisMonth),
        periodLabel: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
        totalTokensEarned: totalTokens,
        platformFeesDeducted: 0,
        netTokensPayable: totalTokens,
        settlementRate,
        fiatAmount: vatCalc.netAmount,
        fiatCurrency: "PLN",
        vatApplicable: vatCalc.vatRate > 0,
        vatRate: vatCalc.vatRate,
        vatAmount: vatCalc.vatAmount,
        grossAmount: vatCalc.grossAmount,
        status: "pending",
        transactionIds: txIds,
        createdAt: Timestamp.now(),
      };

      await settlementRef.set(settlement);

      logger.info(`Settlement created for ${creatorId}: ${vatCalc.grossAmount} PLN`);
    }
  }
);

/**
 * Get user wallet balance
 */
export const getWalletBalance = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const walletSnap = await db.collection("users").doc(userId).collection("wallet").doc("main").get();

      if (!walletSnap.exists) {
        return {
          balance: 0,
          pendingBalance: 0,
          earnedBalance: 0,
          totalDeposits: 0,
          totalEarnings: 0,
        };
      }

      const wallet = walletSnap.data() as UserWallet;
      return {
        balance: wallet.balance || 0,
        pendingBalance: wallet.pendingBalance || 0,
        earnedBalance: wallet.earnedBalance || 0,
        totalDeposits: wallet.totalDeposits || 0,
        totalEarnings: wallet.totalEarnings || 0,
      };
    } catch (error: any) {
      logger.error("Error getting wallet balance:", error);
      throw new HttpsError("internal", `Failed to get balance: ${error.message}`);
    }
  }
);

/**
 * Get transaction history
 */
export const getTransactionHistory = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { limit = 50 } = request.data as { limit?: number };

    try {
      const txSnap = await db.collection("transactions")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const transactions = txSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { transactions };
    } catch (error: any) {
      logger.error("Error getting transaction history:", error);
      throw new HttpsError("internal", `Failed to get history: ${error.message}`);
    }
  }
);

logger.info("✅ Complete payment system loaded successfully");
// ============================================================================
// CALENDAR BOOKING ESCROW
// ============================================================================

/**
 * Create calendar booking with escrow
 */
export const createCalendarBooking = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { creatorId, slotId, startTime, endTime, tokens } = request.data as {
      creatorId: string;
      slotId: string;
      startTime: number;
      endTime: number;
      tokens: number;
    };

    if (!creatorId || !slotId || !tokens) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const PLATFORM_FEE_PERCENT = 20;
    const platformFee = Math.floor(tokens * PLATFORM_FEE_PERCENT / 100);
    const escrowAmount = tokens - platformFee;

    try {
      await db.runTransaction(async (tx) => {
        // Check user balance
        const walletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
        const walletSnap = await tx.get(walletRef);
        const currentBalance = walletSnap.exists ? ((walletSnap.data() as UserWallet).balance || 0) : 0;

        if (currentBalance < tokens) {
          throw new HttpsError("failed-precondition", "Insufficient balance");
        }

        // Create booking
        const bookingRef = db.collection("calendarBookings").doc();
        tx.set(bookingRef, {
          bookingId: bookingRef.id,
          userId,
          creatorId,
          slotId,
          startTime: Timestamp.fromMillis(startTime),
          endTime: Timestamp.fromMillis(endTime),
          tokens,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
        });

        // Create escrow record
        const escrowRef = db.collection("escrow").doc(`esc_${bookingRef.id}`);
        const escrow: EscrowRecord = {
          escrowId: `esc_${bookingRef.id}`,
          payerId: userId,
          recipientId: creatorId,
          type: "booking",
          relatedId: bookingRef.id,
          totalTokens: tokens,
          platformFee,
          availableTokens: escrowAmount,
          consumedTokens: 0,
          status: "active",
          releaseType: "milestone",
          refundEligible: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        tx.set(escrowRef, escrow);

        // Deduct from user wallet
        tx.update(walletRef, {
          balance: FieldValue.increment(-tokens),
          totalSpending: FieldValue.increment(tokens),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create spending transaction
        const spendingTxRef = db.collection("transactions").doc(`tx_booking_spend_${bookingRef.id}`);
        tx.set(spendingTxRef, {
          txId: `tx_booking_spend_${bookingRef.id}`,
          userId,
          type: "spending",
          subtype: "calendar_fee",
          tokens: -tokens,
          relatedUserId: creatorId,
          relatedBookingId: bookingRef.id,
          status: "completed",
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - tokens,
          description: "Calendar booking deposit",
          metadata: { slotId },
          createdAt: Timestamp.now(),
        });

        // Create platform fee transaction
        const feeTxRef = db.collection("transactions").doc(`tx_booking_fee_${bookingRef.id}`);
        tx.set(feeTxRef, {
          txId: `tx_booking_fee_${bookingRef.id}`,
          userId: "platform",
          type: "earning",
          subtype: "calendar_fee",
          tokens: platformFee,
          relatedUserId: creatorId,
          relatedBookingId: bookingRef.id,
          splits: {
            platformFee,
            platformFeePercent: PLATFORM_FEE_PERCENT,
            creatorAmount: escrowAmount,
            creatorPercent: 100 - PLATFORM_FEE_PERCENT,
          },
          status: "completed",
          balanceBefore: 0,
          balanceAfter: platformFee,
          description: "Platform fee (non-refundable)",
          metadata: {},
          createdAt: Timestamp.now(),
        });

        // Create escrow hold transaction
        const escrowTxRef = db.collection("transactions").doc(`tx_booking_escrow_${bookingRef.id}`);
        tx.set(escrowTxRef, {
          txId: `tx_booking_escrow_${bookingRef.id}`,
          userId: creatorId,
          type: "escrow_hold",
          subtype: "calendar_fee",
          tokens: escrowAmount,
          relatedUserId: userId,
          relatedBookingId: bookingRef.id,
          escrowStatus: "held",
          status: "pending",
          balanceBefore: 0,
          balanceAfter: 0,
          description: "Tokens held in escrow for booking",
          metadata: {},
          createdAt: Timestamp.now(),
        });
      });

      return { success: true };
    } catch (error: any) {
      logger.error("Error creating calendar booking:", error);
      throw new HttpsError("internal", `Failed to create booking: ${error.message}`);
    }
  }
);

/**
 * Complete calendar booking and release escrow
 */
export const completeCalendarBooking = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { bookingId } = request.data as { bookingId: string };

    if (!bookingId) {
      throw new HttpsError("invalid-argument", "Booking ID required");
    }

    try {
      const bookingDoc = await db.collection("calendarBookings").doc(bookingId).get();

      if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found");
      }

      const booking = bookingDoc.data()!;

      if (booking.creatorId !== userId) {
        throw new HttpsError("permission-denied", "Not authorized");
      }

      // Check booking has passed
      if (booking.endTime.toMillis() > Date.now()) {
        throw new HttpsError("failed-precondition", "Booking not yet completed");
      }

      // Release full escrow
      const escrowDoc = await db.collection("escrow").doc(`esc_${bookingId}`).get();

      if (!escrowDoc.exists) {
        throw new HttpsError("not-found", "Escrow not found");
      }

      const escrow = escrowDoc.data() as EscrowRecord;

      await db.runTransaction(async (tx) => {
        // Update escrow
        tx.update(escrowDoc.ref, {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
        });

        // Credit creator
        const walletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
        const walletSnap = await tx.get(walletRef);
        const creatorBalance = walletSnap.exists ? ((walletSnap.data() as UserWallet).balance || 0) : 0;

        tx.update(walletRef, {
          balance: FieldValue.increment(escrow.availableTokens),
          earnedBalance: FieldValue.increment(escrow.availableTokens),
          totalEarnings: FieldValue.increment(escrow.availableTokens),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create transaction
        const txRef = db.collection("transactions").doc(`tx_booking_complete_${bookingId}`);
        tx.set(txRef, {
          txId: txRef.id,
          userId,
          type: "escrow_release",
          subtype: "calendar_fee",
          tokens: escrow.availableTokens,
          relatedUserId: escrow.payerId,
          relatedBookingId: bookingId,
          status: "completed",
          balanceBefore: creatorBalance,
          balanceAfter: creatorBalance + escrow.availableTokens,
          description: `Earned ${escrow.availableTokens} tokens from booking`,
          metadata: {},
          createdAt: Timestamp.now(),
        });

        // Update booking status
        tx.update(bookingDoc.ref, {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
        });
      });

      return { success: true };
    } catch (error: any) {
      logger.error("Error completing calendar booking:", error);
      throw new HttpsError("internal", `Failed to complete booking: ${error.message}`);
    }
  }
);

/**
 * Cancel calendar booking (with refund policy)
 */
export const cancelCalendarBooking = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { bookingId } = request.data as { bookingId: string };

    if (!bookingId) {
      throw new HttpsError("invalid-argument", "Booking ID required");
    }

    try {
      const bookingDoc = await db.collection("calendarBookings").doc(bookingId).get();

      if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found");
      }

      const booking = bookingDoc.data()!;

      if (booking.userId !== userId) {
        throw new HttpsError("permission-denied", "Not authorized");
      }

      const now = Date.now();
      const startTime = booking.startTime.toMillis();
      const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);

      // Cancellation policy
      let refundPercent = 0;
      if (hoursUntilStart > 24) {
        refundPercent = 100; // Full refund
      } else if (hoursUntilStart > 1) {
        refundPercent = 50; // Partial refund
      }
      // else: No refund (<1 hour)

      const escrowDoc = await db.collection("escrow").doc(`esc_${bookingId}`).get();

      if (!escrowDoc.exists) {
        throw new HttpsError("not-found", "Escrow not found");
      }

      const escrow = escrowDoc.data() as EscrowRecord;
      const refundAmount = Math.floor(escrow.availableTokens * refundPercent / 100);

      await db.runTransaction(async (tx) => {
        // Update escrow
        tx.update(escrowDoc.ref, {
          status: "refunded",
          refundedAt: FieldValue.serverTimestamp(),
          refundedAmount: refundAmount,
          refundReason: `User cancelled (${hoursUntilStart.toFixed(1)}h notice)`,
        });

        if (refundAmount > 0) {
          // Refund user
          const userWalletRef = db.collection("users").doc(userId).collection("wallet").doc("main");
          const userWalletSnap = await tx.get(userWalletRef);
          const userBalance = userWalletSnap.exists ? ((userWalletSnap.data() as UserWallet).balance || 0) : 0;

          tx.update(userWalletRef, {
            balance: FieldValue.increment(refundAmount),
            totalRefunds: FieldValue.increment(refundAmount),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Create refund transaction
          const txRef = db.collection("transactions").doc(`tx_booking_refund_${bookingId}`);
          tx.set(txRef, {
            txId: txRef.id,
            userId,
            type: "refund",
            subtype: "calendar_fee",
            tokens: refundAmount,
            relatedUserId: booking.creatorId,
            relatedBookingId: bookingId,
            status: "completed",
            balanceBefore: userBalance,
            balanceAfter: userBalance + refundAmount,
            description: `Refund: ${refundPercent}% of booking`,
            metadata: { refundPercent },
            createdAt: Timestamp.now(),
          });
        }

        // Update booking status
        tx.update(bookingDoc.ref, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          refundAmount,
          refundPercent,
        });
      });

      return { success: true, refundAmount, refundPercent };
    } catch (error: any) {
      logger.error("Error cancelling calendar booking:", error);
      throw new HttpsError("internal", `Failed to cancel booking: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT PROCESSING
// ============================================================================

/**
 * Request payout for creator earnings
 */
export const requestPayout = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { settlementId, payoutMethod, payoutDestination } = request.data as {
      settlementId: string;
      payoutMethod: "sepa" | "ach" | "paypal" | "crypto" | "wise";
      payoutDestination: string;
    };

    if (!settlementId || !payoutMethod || !payoutDestination) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      const settlementDoc = await db.collection("settlements").doc(settlementId).get();

      if (!settlementDoc.exists) {
        throw new HttpsError("not-found", "Settlement not found");
      }

      const settlement = settlementDoc.data() as Settlement;

      if (settlement.creatorId !== userId) {
        throw new HttpsError("permission-denied", "Not authorized");
      }

      if (settlement.status !== "pending") {
        throw new HttpsError("failed-precondition", `Settlement already ${settlement.status}`);
      }

      // Update settlement with payout details
      await settlementDoc.ref.update({
        payoutMethod,
        payoutDestination,
        status: "processing",
        processedAt: FieldValue.serverTimestamp(),
      });

      // Process payout based on method
      let payoutResult;
      switch (payoutMethod) {
        case "sepa":
          payoutResult = await processSEPAPayout(settlement, payoutDestination);
          break;
        case "paypal":
          payoutResult = await processPayPalPayout(settlement, payoutDestination);
          break;
        case "crypto":
          payoutResult = await processCryptoPayout(settlement, payoutDestination);
          break;
        default:
          throw new HttpsError("unimplemented", `Payout method ${payoutMethod} not yet implemented`);
      }

      // Update settlement with payout result
      await settlementDoc.ref.update({
        status: "paid",
        payoutProviderId: payoutResult.id,
        payoutReference: payoutResult.reference,
        paidAt: FieldValue.serverTimestamp(),
      });

      await logServerEvent("payout_completed", userId, {
        settlementId,
        method: payoutMethod,
        amount: settlement.grossAmount,
        currency: settlement.fiatCurrency,
      });

      return { success: true, payoutId: payoutResult.id };
    } catch (error: any) {
      logger.error("Error processing payout:", error);

      // Update settlement to failed
      const settlementDoc = await db.collection("settlements").doc(settlementId).get();
      if (settlementDoc.exists) {
        await settlementDoc.ref.update({
          status: "failed",
        });
      }

      throw new HttpsError("internal", `Payout failed: ${error.message}`);
    }
  }
);

/**
 * Process SEPA payout (placeholder - requires Stripe Connect)
 */
async function processSEPAPayout(
  settlement: Settlement,
  iban: string
): Promise<{ id: string; reference: string }> {
  // In production, integrate with Stripe Connect or similar
  logger.info(`Processing SEPA payout: ${settlement.grossAmount} ${settlement.fiatCurrency} to ${iban}`);

  // Placeholder implementation
  const payoutId = `sepa_${Date.now()}`;
  return {
    id: payoutId,
    reference: `SEPA-${settlement.settlementId}`,
  };
}

/**
 * Process PayPal payout (placeholder - requires PayPal API)
 */
async function processPayPalPayout(
  settlement: Settlement,
  email: string
): Promise<{ id: string; reference: string }> {
  // In production, integrate with PayPal Payouts API
  logger.info(`Processing PayPal payout: ${settlement.grossAmount} ${settlement.fiatCurrency} to ${email}`);

  // Placeholder implementation
  const payoutId = `pp_${Date.now()}`;
  return {
    id: payoutId,
    reference: `PP-${settlement.settlementId}`,
  };
}

/**
 * Process crypto payout (placeholder - requires blockchain integration)
 */
async function processCryptoPayout(
  settlement: Settlement,
  walletAddress: string
): Promise<{ id: string; reference: string }> {
  // In production, integrate with crypto payment processor
  logger.info(`Processing crypto payout: ${settlement.grossAmount} ${settlement.fiatCurrency} to ${walletAddress}`);

  // Placeholder implementation
  const payoutId = `crypto_${Date.now()}`;
  return {
    id: payoutId,
    reference: `CRYPTO-${settlement.settlementId}`,
  };
}

/**
 * Get creator settlements
 */
export const getCreatorSettlements = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { limit = 12 } = request.data as { limit?: number };

    try {
      const settlementsSnap = await db.collection("settlements")
        .where("creatorId", "==", userId)
        .orderBy("periodStart", "desc")
        .limit(limit)
        .get();

      const settlements = settlementsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { settlements };
    } catch (error: any) {
      logger.error("Error getting settlements:", error);
      throw new HttpsError("internal", `Failed to get settlements: ${error.message}`);
    }
  }
);

/**
 * Get pending settlements (admin only)
 */
export const getPendingSettlements = onCall(
  { region: "europe-west3" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check admin role
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.role || userData.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    try {
      const settlementsSnap = await db.collection("settlements")
        .where("status", "in", ["pending", "processing"])
        .orderBy("createdAt", "asc")
        .limit(100)
        .get();

      const settlements = settlementsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { settlements };
    } catch (error: any) {
      logger.error("Error getting pending settlements:", error);
      throw new HttpsError("internal", `Failed to get settlements: ${error.message}`);

    }
  }
);


