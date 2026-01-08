/**
 * ========================================================================
 * AVALO 3.0 — PHASE 43: GLOBAL PAYMENTS ENGINE V2
 * ========================================================================
 *
 * Multi-currency payment system with real-time FX, AML risk scoring,
 * and cryptocurrency integration.
 *
 * Key Features:
 * - Multi-currency support (7 fiat + crypto currencies)
 * - Real-time exchange rate fetching (Coinbase API)
 * - AML/KYC risk analysis and transaction monitoring
 * - Velocity limits and structuring detection
 * - Multi-wallet management (fiat + crypto)
 * - Automated compliance reporting
 * - Payment dispute handling
 *
 * Supported Currencies:
 * - Fiat: USD, EUR, GBP, PLN
 * - Crypto: BTC, ETH, USDC (testnet)
 *
 * Risk Analysis:
 * - Transaction velocity monitoring
 * - Large transaction flagging
 * - Geographic anomaly detection
 * - Structuring pattern detection
 * - User behavior profiling
 *
 * @module paymentsV2
 * @version 3.0.0
 * @license Proprietary - Avalo Inc.
 */

;
;
;
;
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
import type { CallableRequest } from "firebase-functions/v2/https";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum Currency {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  PLN = "PLN",
  BTC = "BTC",
  ETH = "ETH",
  USDC = "USDC",
}

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  TRANSFER = "transfer",
  PURCHASE = "purchase",
  TIP = "tip",
  REFUND = "refund",
}

export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  FLAGGED = "flagged",
  UNDER_REVIEW = "under_review",
}

export enum AMLRiskLevel {
  LOW = "low",           // 0-30
  MEDIUM = "medium",     // 31-60
  HIGH = "high",         // 61-80
  CRITICAL = "critical", // 81-100
}

interface ExchangeRate {
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number;
  fetchedAt: Timestamp;
  source: string;
  validUntil: Timestamp;
}

interface AMLRiskFlag {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  score: number;
}

interface AMLRiskAnalysis {
  transactionId: string;
  riskScore: number;           // 0-100
  riskLevel: AMLRiskLevel;
  flags: AMLRiskFlag[];
  recommendation: "approve" | "review" | "block";
  analyzedAt: Timestamp;
  factors: {
    velocityRisk: number;
    amountRisk: number;
    accountAgeRisk: number;
    geoRisk: number;
    behaviorRisk: number;
  };
}

interface Transaction {
  transactionId: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  feeAmount: number;
  feeCurrency: Currency;
  recipientId?: string;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    country?: string;
  };
  amlAnalysis?: AMLRiskAnalysis;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

interface Wallet {
  userId: string;
  currency: Currency;
  balance: number;
  lockedBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  lastTransactionAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Token exchange rates (1 unit currency = X tokens)
const TOKEN_EXCHANGE_RATES: Record<Currency, number> = {
  [Currency.USD]: 100,        // $1 = 100 tokens
  [Currency.EUR]: 110,        // €1 = 110 tokens
  [Currency.GBP]: 125,        // £1 = 125 tokens
  [Currency.PLN]: 25,         // 1 PLN = 25 tokens
  [Currency.BTC]: 4500000,    // 1 BTC = 4.5M tokens
  [Currency.ETH]: 250000,     // 1 ETH = 250K tokens
  [Currency.USDC]: 100,       // 1 USDC = 100 tokens
};

// Transaction limits
const LIMITS = {
  dailyDepositLimit: 10000,        // USD equivalent
  monthlyDepositLimit: 50000,
  singleTransactionMax: 5000,
  minTransactionAmount: 1,
  maxVelocity: 10,                 // transactions per 24h
};

// AML risk thresholds
const AML_THRESHOLDS = {
  largeTransactionAmount: 1000,    // USD equivalent
  highVelocityCount: 10,           // transactions per 24h
  structuringThreshold: 900,       // Just below reporting threshold
  newAccountDays: 7,
};

// Exchange rate cache TTL
const EXCHANGE_RATE_CACHE_TTL = 60 * 1000; // 1 minute

// Coinbase API (for real-time rates)
const COINBASE_API_URL = "https://api.coinbase.com/v2/exchange-rates";

// ============================================================================
// EXCHANGE RATE MANAGEMENT
// ============================================================================

const exchangeRateCache = new Map<string, ExchangeRate>();

/**
 * Fetch real-time exchange rate from Coinbase
 */
async function fetchExchangeRate(
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<number> {
  // Check cache first
  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = exchangeRateCache.get(cacheKey);

  if (cached && cached.validUntil.toMillis() > Date.now()) {
    return cached.rate;
  }

  try {
    // Fetch from Coinbase
    const response = await fetch(`${COINBASE_API_URL}?currency=${fromCurrency}`);
    if (!response.ok) {
      throw new Error("Exchange rate API failed");
    }

    const data = await response.json() as any;
    const rate = parseFloat(data.data.rates[toCurrency]);

    if (!rate || isNaN(rate)) {
      throw new Error("Invalid exchange rate");
    }

    // Cache the rate
    const exchangeRate: ExchangeRate = {
      fromCurrency,
      toCurrency,
      rate,
      fetchedAt: Timestamp.now(),
      source: "coinbase",
      validUntil: Timestamp.fromMillis(Date.now() + EXCHANGE_RATE_CACHE_TTL),
    };

    exchangeRateCache.set(cacheKey, exchangeRate);

    // Store in Firestore for audit
    const db = getFirestore();
    await db.collection("exchange_rates").add(exchangeRate);

    return rate;
  } catch (error) {
    logger.error(`Failed to fetch exchange rate ${fromCurrency}/${toCurrency}:`, error);

    // Fallback to static rates if API fails
    return TOKEN_EXCHANGE_RATES[toCurrency] / TOKEN_EXCHANGE_RATES[fromCurrency];
  }
}

/**
 * Convert currency amount using real-time rates
 */
async function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<{ convertedAmount: number; rate: number }> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1 };
  }

  const rate = await fetchExchangeRate(fromCurrency, toCurrency);
  const convertedAmount = amount * rate;

  return { convertedAmount, rate };
}

// ============================================================================
// AML RISK ANALYSIS
// ============================================================================

/**
 * Analyze transaction for AML risks
 */
async function analyzeAMLRisk(
  transaction: Partial<Transaction>,
  userId: string
): Promise<AMLRiskAnalysis> {
  const db = getFirestore();
  const flags: AMLRiskFlag[] = [];
  let riskScore = 0;

  // Fetch user data
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  const accountAge = userData?.createdAt
    ? Math.floor((Date.now() - userData.createdAt.toMillis()) / (1000 * 60 * 60 * 24))
    : 0;

  // 1. TRANSACTION VELOCITY RISK (max 25 points)
  const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const recentTxs = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .where("createdAt", ">=", oneDayAgo)
    .get();

  const txCount = recentTxs.size;
  let velocityRisk = 0;

  if (txCount >= AML_THRESHOLDS.highVelocityCount) {
    velocityRisk = 25;
    flags.push({
      type: "high_velocity",
      severity: "medium",
      description: `${txCount} transactions in last 24 hours`,
      score: 25,
    });
  } else if (txCount >= 7) {
    velocityRisk = 15;
    flags.push({
      type: "moderate_velocity",
      severity: "low",
      description: `${txCount} transactions in last 24 hours`,
      score: 15,
    });
  }

  riskScore += velocityRisk;

  // 2. LARGE AMOUNT RISK (max 30 points)
  let amountRisk = 0;
  const amountUSD = transaction.fromAmount || 0; // Assume USD for simplicity

  if (amountUSD >= 10000) {
    amountRisk = 30;
    flags.push({
      type: "very_large_amount",
      severity: "critical",
      description: `Transaction amount: $${amountUSD}`,
      score: 30,
    });
  } else if (amountUSD >= AML_THRESHOLDS.largeTransactionAmount) {
    amountRisk = 20;
    flags.push({
      type: "large_amount",
      severity: "high",
      description: `Transaction amount: $${amountUSD}`,
      score: 20,
    });
  }

  riskScore += amountRisk;

  // 3. ACCOUNT AGE RISK (max 20 points)
  let accountAgeRisk = 0;

  if (accountAge < 1) {
    accountAgeRisk = 20;
    flags.push({
      type: "brand_new_account",
      severity: "high",
      description: "Account less than 1 day old",
      score: 20,
    });
  } else if (accountAge < AML_THRESHOLDS.newAccountDays) {
    accountAgeRisk = 10;
    flags.push({
      type: "new_account",
      severity: "medium",
      description: `Account ${accountAge} days old`,
      score: 10,
    });
  }

  riskScore += accountAgeRisk;

  // 4. GEOGRAPHIC ANOMALY RISK (max 15 points)
  let geoRisk = 0;

  if (transaction.metadata?.country && userData?.country) {
    if (transaction.metadata.country !== userData.country) {
      geoRisk = 15;
      flags.push({
        type: "geo_mismatch",
        severity: "medium",
        description: `Transaction from ${transaction.metadata.country}, user from ${userData.country}`,
        score: 15,
      });
    }
  }

  riskScore += geoRisk;

  // 5. STRUCTURING DETECTION (max 40 points)
  let behaviorRisk = 0;

  // Check for multiple transactions just below reporting threshold
  const recentLargeTxs = recentTxs.docs.filter((doc) => {
    const tx = doc.data();
    return tx.fromAmount >= AML_THRESHOLDS.structuringThreshold &&
           tx.fromAmount < AML_THRESHOLDS.largeTransactionAmount;
  });

  if (recentLargeTxs.length >= 3) {
    behaviorRisk = 40;
    flags.push({
      type: "structuring",
      severity: "critical",
      description: `${recentLargeTxs.length} transactions just below threshold`,
      score: 40,
    });
  }

  riskScore += behaviorRisk;

  // Determine risk level
  let riskLevel: AMLRiskLevel;
  if (riskScore >= 81) riskLevel = AMLRiskLevel.CRITICAL;
  else if (riskScore >= 61) riskLevel = AMLRiskLevel.HIGH;
  else if (riskScore >= 31) riskLevel = AMLRiskLevel.MEDIUM;
  else riskLevel = AMLRiskLevel.LOW;

  // Determine recommendation
  let recommendation: "approve" | "review" | "block";
  if (riskLevel === AMLRiskLevel.CRITICAL) recommendation = "block";
  else if (riskLevel === AMLRiskLevel.HIGH) recommendation = "review";
  else recommendation = "approve";

  return {
    transactionId: transaction.transactionId || "pending",
    riskScore: Math.min(100, riskScore),
    riskLevel,
    flags,
    recommendation,
    analyzedAt: Timestamp.now(),
    factors: {
      velocityRisk,
      amountRisk,
      accountAgeRisk,
      geoRisk,
      behaviorRisk,
    },
  };
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

/**
 * Get or create user wallet for currency
 */
async function getOrCreateWallet(userId: string, currency: Currency): Promise<Wallet> {
  const db = getFirestore();
  const walletId = `${userId}_${currency}`;
  const walletDoc = await db.collection("wallets").doc(walletId).get();

  if (walletDoc.exists) {
    return walletDoc.data() as Wallet;
  }

  // Create new wallet
  const newWallet: Wallet = {
    userId,
    currency,
    balance: 0,
    lockedBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection("wallets").doc(walletId).set(newWallet);

  return newWallet;
}

/**
 * Update wallet balance
 */
async function updateWalletBalance(
  userId: string,
  currency: Currency,
  amount: number,
  type: "deposit" | "withdrawal"
): Promise<void> {
  const db = getFirestore();
  const walletId = `${userId}_${currency}`;

  const updates: any = {
    updatedAt: FieldValue.serverTimestamp(),
    lastTransactionAt: FieldValue.serverTimestamp(),
  };

  if (type === "deposit") {
    updates.balance = FieldValue.increment(amount);
    updates.totalDeposits = FieldValue.increment(amount);
  } else {
    updates.balance = FieldValue.increment(-amount);
    updates.totalWithdrawals = FieldValue.increment(amount);
  }

  await db.collection("wallets").doc(walletId).update(updates);
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Purchase tokens with multi-currency support
 *
 * @endpoint purchaseTokensV2
 * @auth required
 */
export const purchaseTokensV2 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
    // PERFORMANCE: Keep 1 warm instance for high traffic token purchases
    // Target: <200ms p95 latency (from ~1200ms with cold starts)
    minInstances: 1,
    maxInstances: 20,
    concurrency: 50,
    memory: "512MiB",
    timeoutSeconds: 120,
    cpu: 1,
  },
  async (
    request: CallableRequest<{
      amount: number;
      currency: Currency;
      paymentMethod: "card" | "crypto" | "bank_transfer";
      deviceId?: string;
    }>
  ): Promise<{
    success: boolean;
    transactionId: string;
    tokens: number;
    status: string;
  }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { amount, currency, paymentMethod } = request.data;

    if (amount < LIMITS.minTransactionAmount) {
      throw new Error(`Minimum transaction amount is ${LIMITS.minTransactionAmount} ${currency}`);
    }

    if (amount > LIMITS.singleTransactionMax) {
      throw new Error(`Maximum single transaction is ${LIMITS.singleTransactionMax} ${currency}`);
    }

    const db = getFirestore();
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Convert to tokens
    const { convertedAmount: tokens, rate } = await convertCurrency(
      amount,
      currency,
      Currency.USD // Convert to USD first
    );
    const tokenAmount = Math.floor(tokens * TOKEN_EXCHANGE_RATES[Currency.USD]);

    // Calculate fee (2% for card, 1% for crypto, 0.5% for bank transfer)
    const feePercent = paymentMethod === "card" ? 0.02 : paymentMethod === "crypto" ? 0.01 : 0.005;
    const feeAmount = amount * feePercent;

    // Create transaction record
    const transaction: Transaction = {
      transactionId,
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      fromCurrency: currency,
      toCurrency: Currency.USD,
      fromAmount: amount,
      toAmount: tokens,
      exchangeRate: rate,
      feeAmount,
      feeCurrency: currency,
      metadata: {
        ipAddress: request.rawRequest?.ip,
        userAgent: request.rawRequest?.headers["user-agent"],
        deviceId: request.data.deviceId,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // AML risk analysis
    const amlAnalysis = await analyzeAMLRisk(transaction, userId);
    transaction.amlAnalysis = amlAnalysis;

    if (amlAnalysis.recommendation === "block") {
      transaction.status = TransactionStatus.FLAGGED;
      await db.collection("transactions").doc(transactionId).set(transaction);
      throw new Error("Transaction blocked due to risk factors. Please contact support.");
    }

    if (amlAnalysis.recommendation === "review") {
      transaction.status = TransactionStatus.UNDER_REVIEW;
      await db.collection("transactions").doc(transactionId).set(transaction);

      // Queue for manual review
      await db.collection("aml_review_queue").add({
        transactionId,
        userId,
        amlAnalysis,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: false,
        transactionId,
        tokens: tokenAmount,
        status: "under_review",
      };
    }

    // Process payment (simplified - in production integrate with Stripe/Coinbase)
    transaction.status = TransactionStatus.PROCESSING;
    await db.collection("transactions").doc(transactionId).set(transaction);

    // Simulate payment processing
    // In production: integrate with payment gateway

    // Credit tokens to user
    await updateWalletBalance(userId, currency, amount, "deposit");

    await db.collection("users").doc(userId).update({
      tokens: FieldValue.increment(tokenAmount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Mark transaction as completed
    transaction.status = TransactionStatus.COMPLETED;
    transaction.completedAt = Timestamp.now();
    await db.collection("transactions").doc(transactionId).update({
      status: TransactionStatus.COMPLETED,
      completedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`User ${userId} purchased ${tokenAmount} tokens for ${amount} ${currency}`);

    return {
      success: true,
      transactionId,
      tokens: tokenAmount,
      status: "completed",
    };
  }
);

/**
 * Get user transaction history
 *
 * @endpoint getTransactionHistoryV2
 * @auth required
 */
export const getTransactionHistoryV2 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{ limit?: number; currency?: Currency }>
  ): Promise<{ transactions: Transaction[] }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const db = getFirestore();
    const limit = request.data.limit || 50;

    let query = db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (request.data.currency) {
      query = query.where("fromCurrency", "==", request.data.currency) as any;
    }

    const snapshot = await query.get();
    const transactions = snapshot.docs.map((doc) => doc.data() as Transaction);

    return { transactions };
  }
);

/**
 * Get user wallets
 *
 * @endpoint getUserWalletsV2
 * @auth required
 */
export const getUserWalletsV2 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest): Promise<{ wallets: Wallet[] }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const db = getFirestore();
    const snapshot = await db.collection("wallets").where("userId", "==", userId).get();

    const wallets = snapshot.docs.map((doc) => doc.data() as Wallet);

    return { wallets };
  }
);

/**
 * Get current exchange rates
 *
 * @endpoint getExchangeRatesV1
 */
export const getExchangeRatesV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
  },
  async (): Promise<{ rates: Record<string, number>; updatedAt: string }> => {
    const rates: Record<string, number> = {};

    // Fetch rates for all supported currencies to USD
    for (const currency of Object.values(Currency)) {
      if (currency !== Currency.USD) {
        try {
          const rate = await fetchExchangeRate(currency, Currency.USD);
          rates[`${currency}_USD`] = rate;
        } catch (error) {
          logger.error(`Failed to fetch rate for ${currency}:`, error);
        }
      }
    }

    return {
      rates,
      updatedAt: new Date().toISOString(),
    };
  }
);

/**
 * Schedule: Sync exchange rates
 */
export const syncExchangeRatesScheduler = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west3",
    timeoutSeconds: 60,
  },
  async () => {
    logger.info("Syncing exchange rates");

    try {
      // Fetch and cache all exchange rates
      for (const fromCurrency of Object.values(Currency)) {
        for (const toCurrency of Object.values(Currency)) {
          if (fromCurrency !== toCurrency) {
            await fetchExchangeRate(fromCurrency as Currency, toCurrency as Currency);
          }
        }
      }

      logger.info("Exchange rates synced successfully");
    } catch (error) {
      logger.error("Failed to sync exchange rates:", error);
    }
  }
);

/**
 * Schedule: Generate compliance reports
 */
export const generateComplianceReportsScheduler = onSchedule(
  {
    schedule: "0 2 * * *", // 2 AM daily
    region: "europe-west3",
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();

    logger.info("Generating daily compliance reports");

    // Get transactions requiring review
    const flaggedTxs = await db
      .collection("transactions")
      .where("status", "in", [TransactionStatus.FLAGGED, TransactionStatus.UNDER_REVIEW])
      .get();

    // Get high-risk transactions from last 24h
    const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const highRiskTxs = await db
      .collection("transactions")
      .where("createdAt", ">=", oneDayAgo)
      .where("amlAnalysis.riskLevel", "in", [AMLRiskLevel.HIGH, AMLRiskLevel.CRITICAL])
      .get();

    const report = {
      date: new Date().toISOString().split("T")[0],
      flaggedTransactions: flaggedTxs.size,
      highRiskTransactions: highRiskTxs.size,
      totalTransactions: flaggedTxs.size + highRiskTxs.size,
      generatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection("compliance_reports").add(report);

    logger.info(`Compliance report generated: ${flaggedTxs.size} flagged, ${highRiskTxs.size} high-risk`);
  }
);

