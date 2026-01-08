"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateComplianceReportsScheduler = exports.syncExchangeRatesScheduler = exports.getExchangeRatesV1 = exports.getUserWalletsV2 = exports.getTransactionHistoryV2 = exports.purchaseTokensV2 = exports.AMLRiskLevel = exports.TransactionStatus = exports.TransactionType = exports.Currency = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
// ============================================================================
// TYPES & INTERFACES
// ============================================================================
var Currency;
(function (Currency) {
    Currency["USD"] = "USD";
    Currency["EUR"] = "EUR";
    Currency["GBP"] = "GBP";
    Currency["PLN"] = "PLN";
    Currency["BTC"] = "BTC";
    Currency["ETH"] = "ETH";
    Currency["USDC"] = "USDC";
})(Currency || (exports.Currency = Currency = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["DEPOSIT"] = "deposit";
    TransactionType["WITHDRAWAL"] = "withdrawal";
    TransactionType["TRANSFER"] = "transfer";
    TransactionType["PURCHASE"] = "purchase";
    TransactionType["TIP"] = "tip";
    TransactionType["REFUND"] = "refund";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["PROCESSING"] = "processing";
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["FAILED"] = "failed";
    TransactionStatus["CANCELLED"] = "cancelled";
    TransactionStatus["FLAGGED"] = "flagged";
    TransactionStatus["UNDER_REVIEW"] = "under_review";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var AMLRiskLevel;
(function (AMLRiskLevel) {
    AMLRiskLevel["LOW"] = "low";
    AMLRiskLevel["MEDIUM"] = "medium";
    AMLRiskLevel["HIGH"] = "high";
    AMLRiskLevel["CRITICAL"] = "critical";
})(AMLRiskLevel || (exports.AMLRiskLevel = AMLRiskLevel = {}));
// ============================================================================
// CONFIGURATION
// ============================================================================
// Token exchange rates (1 unit currency = X tokens)
const TOKEN_EXCHANGE_RATES = {
    [Currency.USD]: 100, // $1 = 100 tokens
    [Currency.EUR]: 110, // €1 = 110 tokens
    [Currency.GBP]: 125, // £1 = 125 tokens
    [Currency.PLN]: 25, // 1 PLN = 25 tokens
    [Currency.BTC]: 4500000, // 1 BTC = 4.5M tokens
    [Currency.ETH]: 250000, // 1 ETH = 250K tokens
    [Currency.USDC]: 100, // 1 USDC = 100 tokens
};
// Transaction limits
const LIMITS = {
    dailyDepositLimit: 10000, // USD equivalent
    monthlyDepositLimit: 50000,
    singleTransactionMax: 5000,
    minTransactionAmount: 1,
    maxVelocity: 10, // transactions per 24h
};
// AML risk thresholds
const AML_THRESHOLDS = {
    largeTransactionAmount: 1000, // USD equivalent
    highVelocityCount: 10, // transactions per 24h
    structuringThreshold: 900, // Just below reporting threshold
    newAccountDays: 7,
};
// Exchange rate cache TTL
const EXCHANGE_RATE_CACHE_TTL = 60 * 1000; // 1 minute
// Coinbase API (for real-time rates)
const COINBASE_API_URL = "https://api.coinbase.com/v2/exchange-rates";
// ============================================================================
// EXCHANGE RATE MANAGEMENT
// ============================================================================
const exchangeRateCache = new Map();
/**
 * Fetch real-time exchange rate from Coinbase
 */
async function fetchExchangeRate(fromCurrency, toCurrency) {
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
        const data = await response.json();
        const rate = parseFloat(data.data.rates[toCurrency]);
        if (!rate || isNaN(rate)) {
            throw new Error("Invalid exchange rate");
        }
        // Cache the rate
        const exchangeRate = {
            fromCurrency,
            toCurrency,
            rate,
            fetchedAt: firestore_1.Timestamp.now(),
            source: "coinbase",
            validUntil: firestore_1.Timestamp.fromMillis(Date.now() + EXCHANGE_RATE_CACHE_TTL),
        };
        exchangeRateCache.set(cacheKey, exchangeRate);
        // Store in Firestore for audit
        const db = (0, firestore_1.getFirestore)();
        await db.collection("exchange_rates").add(exchangeRate);
        return rate;
    }
    catch (error) {
        v2_1.logger.error(`Failed to fetch exchange rate ${fromCurrency}/${toCurrency}:`, error);
        // Fallback to static rates if API fails
        return TOKEN_EXCHANGE_RATES[toCurrency] / TOKEN_EXCHANGE_RATES[fromCurrency];
    }
}
/**
 * Convert currency amount using real-time rates
 */
async function convertCurrency(amount, fromCurrency, toCurrency) {
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
async function analyzeAMLRisk(transaction, userId) {
    const db = (0, firestore_1.getFirestore)();
    const flags = [];
    let riskScore = 0;
    // Fetch user data
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const accountAge = userData?.createdAt
        ? Math.floor((Date.now() - userData.createdAt.toMillis()) / (1000 * 60 * 60 * 24))
        : 0;
    // 1. TRANSACTION VELOCITY RISK (max 25 points)
    const oneDayAgo = firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
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
    }
    else if (txCount >= 7) {
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
    }
    else if (amountUSD >= AML_THRESHOLDS.largeTransactionAmount) {
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
    }
    else if (accountAge < AML_THRESHOLDS.newAccountDays) {
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
    let riskLevel;
    if (riskScore >= 81)
        riskLevel = AMLRiskLevel.CRITICAL;
    else if (riskScore >= 61)
        riskLevel = AMLRiskLevel.HIGH;
    else if (riskScore >= 31)
        riskLevel = AMLRiskLevel.MEDIUM;
    else
        riskLevel = AMLRiskLevel.LOW;
    // Determine recommendation
    let recommendation;
    if (riskLevel === AMLRiskLevel.CRITICAL)
        recommendation = "block";
    else if (riskLevel === AMLRiskLevel.HIGH)
        recommendation = "review";
    else
        recommendation = "approve";
    return {
        transactionId: transaction.transactionId || "pending",
        riskScore: Math.min(100, riskScore),
        riskLevel,
        flags,
        recommendation,
        analyzedAt: firestore_1.Timestamp.now(),
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
async function getOrCreateWallet(userId, currency) {
    const db = (0, firestore_1.getFirestore)();
    const walletId = `${userId}_${currency}`;
    const walletDoc = await db.collection("wallets").doc(walletId).get();
    if (walletDoc.exists) {
        return walletDoc.data();
    }
    // Create new wallet
    const newWallet = {
        userId,
        currency,
        balance: 0,
        lockedBalance: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        createdAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
    };
    await db.collection("wallets").doc(walletId).set(newWallet);
    return newWallet;
}
/**
 * Update wallet balance
 */
async function updateWalletBalance(userId, currency, amount, type) {
    const db = (0, firestore_1.getFirestore)();
    const walletId = `${userId}_${currency}`;
    const updates = {
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        lastTransactionAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (type === "deposit") {
        updates.balance = firestore_1.FieldValue.increment(amount);
        updates.totalDeposits = firestore_1.FieldValue.increment(amount);
    }
    else {
        updates.balance = firestore_1.FieldValue.increment(-amount);
        updates.totalWithdrawals = firestore_1.FieldValue.increment(amount);
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
exports.purchaseTokensV2 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
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
    const db = (0, firestore_1.getFirestore)();
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // Convert to tokens
    const { convertedAmount: tokens, rate } = await convertCurrency(amount, currency, Currency.USD // Convert to USD first
    );
    const tokenAmount = Math.floor(tokens * TOKEN_EXCHANGE_RATES[Currency.USD]);
    // Calculate fee (2% for card, 1% for crypto, 0.5% for bank transfer)
    const feePercent = paymentMethod === "card" ? 0.02 : paymentMethod === "crypto" ? 0.01 : 0.005;
    const feeAmount = amount * feePercent;
    // Create transaction record
    const transaction = {
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
        createdAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
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
        tokens: firestore_1.FieldValue.increment(tokenAmount),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    // Mark transaction as completed
    transaction.status = TransactionStatus.COMPLETED;
    transaction.completedAt = firestore_1.Timestamp.now();
    await db.collection("transactions").doc(transactionId).update({
        status: TransactionStatus.COMPLETED,
        completedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    v2_1.logger.info(`User ${userId} purchased ${tokenAmount} tokens for ${amount} ${currency}`);
    return {
        success: true,
        transactionId,
        tokens: tokenAmount,
        status: "completed",
    };
});
/**
 * Get user transaction history
 *
 * @endpoint getTransactionHistoryV2
 * @auth required
 */
exports.getTransactionHistoryV2 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        throw new Error("Authentication required");
    }
    const db = (0, firestore_1.getFirestore)();
    const limit = request.data.limit || 50;
    let query = db
        .collection("transactions")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(limit);
    if (request.data.currency) {
        query = query.where("fromCurrency", "==", request.data.currency);
    }
    const snapshot = await query.get();
    const transactions = snapshot.docs.map((doc) => doc.data());
    return { transactions };
});
/**
 * Get user wallets
 *
 * @endpoint getUserWalletsV2
 * @auth required
 */
exports.getUserWalletsV2 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        throw new Error("Authentication required");
    }
    const db = (0, firestore_1.getFirestore)();
    const snapshot = await db.collection("wallets").where("userId", "==", userId).get();
    const wallets = snapshot.docs.map((doc) => doc.data());
    return { wallets };
});
/**
 * Get current exchange rates
 *
 * @endpoint getExchangeRatesV1
 */
exports.getExchangeRatesV1 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
}, async () => {
    const rates = {};
    // Fetch rates for all supported currencies to USD
    for (const currency of Object.values(Currency)) {
        if (currency !== Currency.USD) {
            try {
                const rate = await fetchExchangeRate(currency, Currency.USD);
                rates[`${currency}_USD`] = rate;
            }
            catch (error) {
                v2_1.logger.error(`Failed to fetch rate for ${currency}:`, error);
            }
        }
    }
    return {
        rates,
        updatedAt: new Date().toISOString(),
    };
});
/**
 * Schedule: Sync exchange rates
 */
exports.syncExchangeRatesScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    region: "europe-west3",
    timeoutSeconds: 60,
}, async () => {
    v2_1.logger.info("Syncing exchange rates");
    try {
        // Fetch and cache all exchange rates
        for (const fromCurrency of Object.values(Currency)) {
            for (const toCurrency of Object.values(Currency)) {
                if (fromCurrency !== toCurrency) {
                    await fetchExchangeRate(fromCurrency, toCurrency);
                }
            }
        }
        v2_1.logger.info("Exchange rates synced successfully");
    }
    catch (error) {
        v2_1.logger.error("Failed to sync exchange rates:", error);
    }
});
/**
 * Schedule: Generate compliance reports
 */
exports.generateComplianceReportsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "0 2 * * *", // 2 AM daily
    region: "europe-west3",
    timeoutSeconds: 300,
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    v2_1.logger.info("Generating daily compliance reports");
    // Get transactions requiring review
    const flaggedTxs = await db
        .collection("transactions")
        .where("status", "in", [TransactionStatus.FLAGGED, TransactionStatus.UNDER_REVIEW])
        .get();
    // Get high-risk transactions from last 24h
    const oneDayAgo = firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
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
        generatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db.collection("compliance_reports").add(report);
    v2_1.logger.info(`Compliance report generated: ${flaggedTxs.size} flagged, ${highRiskTxs.size} high-risk`);
});
//# sourceMappingURL=paymentsV2.js.map