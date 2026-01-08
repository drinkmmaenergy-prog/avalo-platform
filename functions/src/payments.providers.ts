/**
 * Payment Provider Integrations (Phase 11)
 *
 * Supports multiple payment providers for global expansion:
 * - Stripe (existing, global)
 * - Przelewy24 (P24) - Poland
 * - Blik - Poland (mobile payment)
 * - PayU - Central/Eastern Europe
 * - Coinbase Commerce - Cryptocurrency
 *
 * Callable functions:
 * - createPaymentSessionCallable: Create payment session with specified provider
 * - handleProviderWebhook: Unified webhook handler for all providers
 */

import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
;
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from "stripe";
// ; // Requires axios package
;
;
// ; // Requires currency module
const logAnalyticsEvent = (eventName: string, properties: any) => {
  return logServerEvent(eventName, properties, properties.userId || "system");
};
// Axios placeholder - requires axios package installation
const axios = {
  post: async (url: string, data: any, config?: any) => ({
    data: {
      data: { token: "", id: "", hosted_url: "" },
      access_token: "",
      redirectUri: "",
      orderId: ""
    }
  }),
  get: async (url: string, config?: any) => ({ data: {} }),
};

const db = getFirestore();

/**
 * Supported payment providers
 */
export enum PaymentProvider {
  STRIPE = "stripe",
  PRZELEWY24 = "p24",
  BLIK = "blik",
  PAYU = "payu",
  COINBASE = "coinbase",
}

/**
 * Supported currencies
 */
export enum Currency {
  PLN = "PLN",
  EUR = "EUR",
  USD = "USD",
  GBP = "GBP",
  BTC = "BTC",
  ETH = "ETH",
}

/**
 * Payment session interface
 */
export interface PaymentSession {
  id: string;
  provider: PaymentProvider;
  userId: string;
  amount: number;
  currency: Currency;
  tokens: number; // Tokens to credit after successful payment
  status: "pending" | "completed" | "failed" | "cancelled";
  paymentUrl?: string; // URL to redirect user for payment
  providerSessionId?: string; // External provider's session ID
  createdAt: FieldValue;
  completedAt?: FieldValue;
}

/**
 * Provider configurations (from environment variables)
 */
const getProviderConfig = (provider: PaymentProvider) => {
  const env = process.env;

  switch (provider) {
    case PaymentProvider.STRIPE:
      return {
        secretKey: env.STRIPE_SECRET_KEY || "",
        webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
      };

    case PaymentProvider.PRZELEWY24:
      return {
        merchantId: env.P24_MERCHANT_ID || "",
        posId: env.P24_POS_ID || "",
        apiKey: env.P24_API_KEY || "",
        crcKey: env.P24_CRC_KEY || "",
        apiUrl: env.P24_SANDBOX === "true"
          ? "https://sandbox.przelewy24.pl/api/v1"
          : "https://secure.przelewy24.pl/api/v1",
      };

    case PaymentProvider.PAYU:
      return {
        posId: env.PAYU_POS_ID || "",
        clientId: env.PAYU_CLIENT_ID || "",
        clientSecret: env.PAYU_CLIENT_SECRET || "",
        apiUrl: env.PAYU_SANDBOX === "true"
          ? "https://secure.snd.payu.com/api/v2_1"
          : "https://secure.payu.com/api/v2_1",
      };

    case PaymentProvider.COINBASE:
      return {
        apiKey: env.COINBASE_COMMERCE_API_KEY || "",
        webhookSecret: env.COINBASE_WEBHOOK_SECRET || "",
        apiUrl: "https://api.commerce.coinbase.com",
      };

    default:
      return {};
  }
};

/**
 * Create payment session with specified provider
 */
export const createPaymentSessionCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { provider, amount, currency, tokens } = request.data as {
      provider: PaymentProvider;
      amount: number;
      currency: Currency;
      tokens: number;
    };

    if (!provider || !amount || !currency || !tokens) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      let paymentUrl: string | undefined;
      let providerSessionId: string | undefined;

      // Create payment session based on provider
      switch (provider) {
        case PaymentProvider.STRIPE:
          ({ paymentUrl, providerSessionId } = await createStripeSession(uid, amount, currency, tokens));
          break;

        case PaymentProvider.PRZELEWY24:
          ({ paymentUrl, providerSessionId } = await createP24Session(uid, amount, tokens));
          break;

        case PaymentProvider.PAYU:
          ({ paymentUrl, providerSessionId } = await createPayUSession(uid, amount, currency, tokens));
          break;

        case PaymentProvider.COINBASE:
          ({ paymentUrl, providerSessionId } = await createCoinbaseSession(uid, amount, currency, tokens));
          break;

        default:
          throw new HttpsError("invalid-argument", "Unsupported payment provider");
      }

      // Save payment session to Firestore
      const sessionRef = db.collection("paymentSessions").doc();
      const session: PaymentSession = {
        id: sessionRef.id,
        provider,
        userId: uid,
        amount,
        currency,
        tokens,
        status: "pending",
        paymentUrl,
        providerSessionId,
        createdAt: FieldValue.serverTimestamp(),
      };

      await sessionRef.set(session);

      logAnalyticsEvent("payment_session_created", {
        userId: uid,
        provider,
        amount,
        currency,
        tokens,
      });

      return {
        success: true,
        sessionId: sessionRef.id,
        paymentUrl,
      };
    } catch (error: any) {
      console.error("Error creating payment session:", error);
      throw new HttpsError("internal", `Failed to create payment session: ${error.message}`);
    }
  }
);

/**
 * Create Stripe session (existing implementation)
 */
async function createStripeSession(
  userId: string,
  amount: number,
  currency: Currency,
  tokens: number
): Promise<{ paymentUrl: string; providerSessionId: string }> {
  const config = getProviderConfig(PaymentProvider.STRIPE);
  const stripe = new Stripe(config.secretKey, { apiVersion: "2025-02-24.acacia" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `${tokens} Avalo Tokens`,
            description: "Avalo platform currency",
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.WEB_URL}/wallet?payment=success`,
    cancel_url: `${process.env.WEB_URL}/wallet?payment=cancelled`,
    metadata: {
      userId,
      tokens: tokens.toString(),
      productType: "tokens",
    },
  });

  return {
    paymentUrl: session.url || "",
    providerSessionId: session.id,
  };
}

/**
 * Create Przelewy24 (P24) session
 */
async function createP24Session(
  userId: string,
  amount: number,
  tokens: number
): Promise<{ paymentUrl: string; providerSessionId: string }> {
  const config = getProviderConfig(PaymentProvider.PRZELEWY24);

  const sessionId = `p24_${Date.now()}_${userId.substring(0, 8)}`;
  const amountGroszy = Math.round(amount * 100); // PLN to groszy

  // Calculate CRC signature
  const crcData = `{"sessionId":"${sessionId}","merchantId":${config.merchantId},"amount":${amountGroszy},"currency":"PLN","crc":"${config.crcKey}"}`;
  const sign = crypto.createHash("sha384").update(crcData).digest("hex");

  // Register transaction
  const response = await axios.post(
    `${config.apiUrl}/transaction/register`,
    {
      merchantId: parseInt(config.merchantId),
      posId: parseInt(config.posId),
      sessionId,
      amount: amountGroszy,
      currency: "PLN",
      description: `${tokens} Avalo Tokens`,
      email: "user@avalo.app", // Should get from user profile
      country: "PL",
      language: "pl",
      urlReturn: `${process.env.WEB_URL}/wallet?payment=success`,
      urlStatus: `${process.env.FUNCTIONS_URL}/p24Webhook`,
      sign,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${config.posId}:${config.apiKey}`).toString("base64")}`,
      },
    }
  );

  const token = response.data.data.token;

  return {
    paymentUrl: `${config.apiUrl.replace("/api/v1", "")}/trnRequest/${token}`,
    providerSessionId: sessionId,
  };
}

/**
 * Create PayU session
 */
async function createPayUSession(
  userId: string,
  amount: number,
  currency: Currency,
  tokens: number
): Promise<{ paymentUrl: string; providerSessionId: string }> {
  const config = getProviderConfig(PaymentProvider.PAYU);

  // Get OAuth token
  const authResponse = await axios.post(
    `${config.apiUrl.replace("/api/v2_1", "")}/pl/standard/user/oauth/authorize`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const accessToken = authResponse.data.access_token;

  // Create order
  const orderResponse = await axios.post(
    `${config.apiUrl}/orders`,
    {
      notifyUrl: `${process.env.FUNCTIONS_URL}/payuWebhook`,
      customerIp: "127.0.0.1", // Should get from request
      merchantPosId: config.posId,
      description: `${tokens} Avalo Tokens`,
      currencyCode: currency,
      totalAmount: Math.round(amount * 100), // Convert to smallest unit
      buyer: {
        email: "user@avalo.app", // Should get from user profile
        language: "pl",
      },
      products: [
        {
          name: `${tokens} Avalo Tokens`,
          unitPrice: Math.round(amount * 100),
          quantity: 1,
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return {
    paymentUrl: orderResponse.data.redirectUri,
    providerSessionId: orderResponse.data.orderId,
  };
}

/**
 * Create Coinbase Commerce session
 */
async function createCoinbaseSession(
  userId: string,
  amount: number,
  currency: Currency,
  tokens: number
): Promise<{ paymentUrl: string; providerSessionId: string }> {
  const config = getProviderConfig(PaymentProvider.COINBASE);

  const response = await axios.post(
    `${config.apiUrl}/charges`,
    {
      name: `${tokens} Avalo Tokens`,
      description: "Avalo platform currency",
      pricing_type: "fixed_price",
      local_price: {
        amount: amount.toFixed(2),
        currency: currency,
      },
      metadata: {
        userId,
        tokens: tokens.toString(),
      },
      redirect_url: `${process.env.WEB_URL}/wallet?payment=success`,
      cancel_url: `${process.env.WEB_URL}/wallet?payment=cancelled`,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": config.apiKey,
        "X-CC-Version": "2018-03-22",
      },
    }
  );

  return {
    paymentUrl: response.data.data.hosted_url,
    providerSessionId: response.data.data.id,
  };
}

/**
 * Unified webhook handler for all providers
 */
export const handleProviderWebhook = onRequest(
  { region: "europe-west3" },
  async (req, res) => {
    const provider = req.path.split("/").pop() as PaymentProvider;

    console.log(`Webhook received from provider: ${provider}`);

    try {
      switch (provider) {
        case PaymentProvider.PRZELEWY24:
          await handleP24Webhook(req, res);
          break;

        case PaymentProvider.PAYU:
          await handlePayUWebhook(req, res);
          break;

        case PaymentProvider.COINBASE:
          await handleCoinbaseWebhook(req, res);
          break;

        default:
          res.status(400).send("Unknown provider");
      }
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).send("Webhook processing failed");
    }
  }
);

/**
 * Handle P24 webhook
 */
async function handleP24Webhook(req: any, res: any) {
  const { sessionId, amount, currency } = req.body;

  // Find payment session
  const sessionsSnapshot = await db
    .collection("paymentSessions")
    .where("providerSessionId", "==", sessionId)
    .where("provider", "==", PaymentProvider.PRZELEWY24)
    .limit(1)
    .get();

  if (sessionsSnapshot.empty) {
    res.status(404).send("Session not found");
    return;
  }

  const sessionDoc = sessionsSnapshot.docs[0];
  const session = sessionDoc.data() as PaymentSession;

  // Credit tokens to user
  await creditUserTokens(session.userId, session.tokens, sessionId);

  // Update session status
  await sessionDoc.ref.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  res.json({ received: true });
}

/**
 * Handle PayU webhook
 */
async function handlePayUWebhook(req: any, res: any) {
  const { order } = req.body;

  if (order.status !== "COMPLETED") {
    res.json({ received: true });
    return;
  }

  const orderId = order.orderId;

  // Find payment session
  const sessionsSnapshot = await db
    .collection("paymentSessions")
    .where("providerSessionId", "==", orderId)
    .where("provider", "==", PaymentProvider.PAYU)
    .limit(1)
    .get();

  if (sessionsSnapshot.empty) {
    res.status(404).send("Session not found");
    return;
  }

  const sessionDoc = sessionsSnapshot.docs[0];
  const session = sessionDoc.data() as PaymentSession;

  // Credit tokens to user
  await creditUserTokens(session.userId, session.tokens, orderId);

  // Update session status
  await sessionDoc.ref.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  res.json({ received: true });
}

/**
 * Handle Coinbase webhook
 */
async function handleCoinbaseWebhook(req: any, res: any) {
  const event = req.body;

  if (event.type !== "charge:confirmed") {
    res.json({ received: true });
    return;
  }

  const chargeId = event.data.id;

  // Find payment session
  const sessionsSnapshot = await db
    .collection("paymentSessions")
    .where("providerSessionId", "==", chargeId)
    .where("provider", "==", PaymentProvider.COINBASE)
    .limit(1)
    .get();

  if (sessionsSnapshot.empty) {
    res.status(404).send("Session not found");
    return;
  }

  const sessionDoc = sessionsSnapshot.docs[0];
  const session = sessionDoc.data() as PaymentSession;

  // Credit tokens to user
  await creditUserTokens(session.userId, session.tokens, chargeId);

  // Update session status
  await sessionDoc.ref.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  res.json({ received: true });
}

/**
 * Helper: Credit tokens to user wallet
 */
async function creditUserTokens(userId: string, tokens: number, transactionId: string): Promise<void> {
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (tx) => {
    tx.update(userRef, {
      "wallet.balance": FieldValue.increment(tokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create transaction record
    const txRef = db.collection("transactions").doc(`tx_${transactionId}`);
    tx.set(txRef, {
      txId: `tx_${transactionId}`,
      type: "token_purchase",
      uid: userId,
      amount: tokens,
      providerTransactionId: transactionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  logAnalyticsEvent("tokens_purchased", {
    userId,
    tokens,
    transactionId,
  });

  console.log(`Credited ${tokens} tokens to user ${userId}`);
}


