"use strict";
/**
 * PHASE 31 - Decentralized Wallet Integration
 *
 * ERC-20 ↔ in-app token conversion
 * WalletConnect integration for crypto payments
 * Testnet escrow contracts
 *
 * Feature flag: crypto_wallet_enabled
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletStatusV1 = exports.initiateWithdrawalV1 = exports.confirmDepositV1 = exports.initiateDepositV1 = exports.connectWalletV1 = exports.Blockchain = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Supported blockchains
 */
var Blockchain;
(function (Blockchain) {
    Blockchain["ETHEREUM"] = "ethereum";
    Blockchain["POLYGON"] = "polygon";
    Blockchain["BINANCE_SMART_CHAIN"] = "bsc";
})(Blockchain || (exports.Blockchain = Blockchain = {}));
/**
 * Conversion rate: 1 USDC = 100 in-app tokens
 */
const CONVERSION_RATE = 100;
/**
 * Connect wallet
 */
exports.connectWalletV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "crypto_wallet_enabled", false);
    if (!enabled) {
        throw new https_1.HttpsError("failed-precondition", "Crypto wallet not enabled");
    }
    // Validate input
    const schema = zod_1.z.object({
        walletAddress: zod_1.z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        blockchain: zod_1.z.enum(["ethereum", "polygon", "bsc"]),
        signature: zod_1.z.string(), // Signature for verification
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { walletAddress, blockchain, signature } = validationResult.data;
    try {
        // Verify signature (proof of ownership)
        // In production, verify the signature matches the wallet address
        // Store wallet connection
        await db.collection("users").doc(uid).update({
            [`wallets.${blockchain}`]: {
                address: walletAddress,
                connectedAt: firestore_1.Timestamp.now(),
                verified: true,
            },
        });
        v2_1.logger.info(`Wallet connected: ${uid} -> ${walletAddress} (${blockchain})`);
        return {
            success: true,
            walletAddress,
            blockchain,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to connect wallet:", error);
        throw new https_1.HttpsError("internal", "Failed to connect wallet");
    }
});
/**
 * Initiate crypto deposit (convert crypto to in-app tokens)
 */
exports.initiateDepositV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Validate input
    const schema = zod_1.z.object({
        blockchain: zod_1.z.enum(["ethereum", "polygon", "bsc"]),
        amountUSDC: zod_1.z.number().min(10).max(10000), // Min $10, Max $10,000
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { blockchain, amountUSDC } = validationResult.data;
    try {
        const depositId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const tokensToCredit = amountUSDC * CONVERSION_RATE;
        // Get escrow contract address
        const escrowAddress = getEscrowAddress(blockchain);
        // Create pending deposit
        await db.collection("cryptoDeposits").doc(depositId).set({
            depositId,
            userId: uid,
            blockchain,
            amountUSDC,
            tokensToCredit,
            escrowAddress,
            status: "pending",
            createdAt: firestore_1.Timestamp.now(),
        });
        v2_1.logger.info(`Deposit initiated: ${depositId} for ${uid}`);
        return {
            depositId,
            escrowAddress,
            amountUSDC,
            tokensToCredit,
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 30 * 60 * 1000), // 30 min
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to initiate deposit:", error);
        throw new https_1.HttpsError("internal", "Failed to initiate deposit");
    }
});
/**
 * Confirm crypto deposit (called after on-chain transaction)
 */
exports.confirmDepositV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { depositId, txHash } = request.data;
    if (!depositId || !txHash) {
        throw new https_1.HttpsError("invalid-argument", "depositId and txHash required");
    }
    try {
        const depositRef = db.collection("cryptoDeposits").doc(depositId);
        const depositDoc = await depositRef.get();
        if (!depositDoc.exists) {
            throw new https_1.HttpsError("not-found", "Deposit not found");
        }
        const deposit = depositDoc.data();
        if (deposit?.userId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Not your deposit");
        }
        if (deposit?.status !== "pending") {
            throw new https_1.HttpsError("failed-precondition", "Deposit already processed");
        }
        // Verify transaction on-chain
        // In production, verify txHash matches deposit details
        // Credit tokens
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection("users").doc(uid);
            transaction.update(userRef, {
                tokens: (depositDoc.data()?.tokens || 0) + deposit.tokensToCredit,
            });
            transaction.update(depositRef, {
                status: "completed",
                txHash,
                completedAt: firestore_1.Timestamp.now(),
            });
            // Create transaction record
            transaction.set(db.collection("transactions").doc(), {
                type: "crypto_deposit",
                userId: uid,
                depositId,
                amount: deposit.tokensToCredit,
                sourceBlockchain: deposit.blockchain,
                txHash,
                createdAt: firestore_1.Timestamp.now(),
            });
        });
        v2_1.logger.info(`Deposit confirmed: ${depositId}, txHash: ${txHash}`);
        return {
            success: true,
            tokensCredit: deposit.tokensToCredit,
            newBalance: (depositDoc.data()?.tokens || 0) + deposit.tokensToCredit,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to confirm deposit:", error);
        throw new https_1.HttpsError("internal", "Failed to confirm deposit");
    }
});
/**
 * Initiate withdrawal (convert in-app tokens to crypto)
 */
exports.initiateWithdrawalV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Validate input
    const schema = zod_1.z.object({
        blockchain: zod_1.z.enum(["ethereum", "polygon", "bsc"]),
        amountTokens: zod_1.z.number().min(1000).max(1000000), // Min 1000 tokens ($10)
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { blockchain, amountTokens } = validationResult.data;
    try {
        // Check user balance
        const userDoc = await db.collection("users").doc(uid).get();
        const userTokens = userDoc.data()?.tokens || 0;
        if (userTokens < amountTokens) {
            throw new https_1.HttpsError("failed-precondition", "Insufficient tokens");
        }
        // Check wallet connected
        const walletAddress = userDoc.data()?.wallets?.[blockchain]?.address;
        if (!walletAddress) {
            throw new https_1.HttpsError("failed-precondition", "Wallet not connected");
        }
        const withdrawalId = `wth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const amountUSDC = amountTokens / CONVERSION_RATE;
        // Create pending withdrawal
        await db.collection("cryptoWithdrawals").doc(withdrawalId).set({
            withdrawalId,
            userId: uid,
            blockchain,
            amountTokens,
            amountUSDC,
            walletAddress,
            status: "pending",
            createdAt: firestore_1.Timestamp.now(),
        });
        // Deduct tokens immediately
        await db.collection("users").doc(uid).update({
            tokens: userTokens - amountTokens,
        });
        v2_1.logger.info(`Withdrawal initiated: ${withdrawalId} for ${uid}`);
        return {
            withdrawalId,
            amountUSDC,
            walletAddress,
            estimatedTime: "2-24 hours",
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to initiate withdrawal:", error);
        throw new https_1.HttpsError("internal", "Failed to initiate withdrawal");
    }
});
/**
 * Get escrow contract address for blockchain
 */
function getEscrowAddress(blockchain) {
    // Testnet addresses
    const addresses = {
        ethereum: "0x...", // Sepolia testnet
        polygon: "0x...", // Mumbai testnet
        bsc: "0x...", // BSC testnet
    };
    return addresses[blockchain] || "";
}
/**
 * Get wallet connection status
 */
exports.getWalletStatusV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const wallets = userDoc.data()?.wallets || {};
        return {
            connectedWallets: wallets,
            conversionRate: CONVERSION_RATE,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to get wallet status:", error);
        throw new https_1.HttpsError("internal", "Failed to get status");
    }
});
//# sourceMappingURL=walletBridge.js.map