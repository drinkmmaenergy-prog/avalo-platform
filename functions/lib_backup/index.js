"use strict";
/**
 * ========================================================================
 * AVALO CLOUD FUNCTIONS - MAIN ENTRYPOINT
 * ========================================================================
 * Production-ready Firebase Cloud Functions for Avalo platform
 *
 * @version 3.0.0
 * @region europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemInfo = exports.getTranslationsV1 = exports.updatePresenceV1 = exports.convertCurrency = exports.invalidateCache = exports.getCached = exports.checkRateLimit = exports.logServerEvent = exports.getAllFeatureFlagsForUser = exports.getAvailableQuestsV1 = exports.getKYCStatusV1 = exports.calculateTrustScore = exports.rebuildRankingsScheduler = exports.awardPointsOnTx = exports.getRankingsCallable = exports.getUserLoyaltyCallable = exports.claimRewardCallable = exports.getWalletStatusV1 = exports.initiateWithdrawalV1 = exports.confirmDepositV1 = exports.initiateDepositV1 = exports.connectWalletV1 = exports.stripeWebhook = exports.generateComplianceReportsScheduler = exports.syncExchangeRatesScheduler = exports.getExchangeRatesV1 = exports.getUserWalletsV2 = exports.getTransactionHistoryV2 = exports.purchaseTokensV2 = exports.analyzeContentV1 = exports.getGlobalFeedAlt = exports.likePostV1 = exports.getGlobalFeedV1 = exports.createPostV1 = exports.ping = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
// ============================================================================
// HEALTH CHECK & MONITORING
// ============================================================================
exports.ping = (0, https_1.onRequest)({ region: "europe-west3", cors: true }, async (req, res) => {
    const now = new Date().toISOString();
    v2_1.logger.info("Health check ping received");
    res.status(200).json({
        ok: true,
        timestamp: now,
        version: "3.0.0",
        service: "avalo-functions",
        region: "europe-west3",
    });
});
// ============================================================================
// FEED & SOCIAL INTERACTIONS
// ============================================================================
var feed_1 = require("./feed");
Object.defineProperty(exports, "createPostV1", { enumerable: true, get: function () { return feed_1.createPostV1; } });
Object.defineProperty(exports, "getGlobalFeedV1", { enumerable: true, get: function () { return feed_1.getGlobalFeedV1; } });
var feedInteractions_1 = require("./feedInteractions");
Object.defineProperty(exports, "likePostV1", { enumerable: true, get: function () { return feedInteractions_1.likePostV1; } });
var globalFeed_1 = require("./globalFeed");
Object.defineProperty(exports, "getGlobalFeedAlt", { enumerable: true, get: function () { return globalFeed_1.getGlobalFeedV1; } });
// ============================================================================
// AI & MODERATION
// ============================================================================
var aiOversight_1 = require("./aiOversight");
Object.defineProperty(exports, "analyzeContentV1", { enumerable: true, get: function () { return aiOversight_1.analyzeContentV1; } });
// ============================================================================
// PAYMENTS & TRANSACTIONS
// ============================================================================
var paymentsV2_1 = require("./paymentsV2");
Object.defineProperty(exports, "purchaseTokensV2", { enumerable: true, get: function () { return paymentsV2_1.purchaseTokensV2; } });
Object.defineProperty(exports, "getTransactionHistoryV2", { enumerable: true, get: function () { return paymentsV2_1.getTransactionHistoryV2; } });
Object.defineProperty(exports, "getUserWalletsV2", { enumerable: true, get: function () { return paymentsV2_1.getUserWalletsV2; } });
Object.defineProperty(exports, "getExchangeRatesV1", { enumerable: true, get: function () { return paymentsV2_1.getExchangeRatesV1; } });
Object.defineProperty(exports, "syncExchangeRatesScheduler", { enumerable: true, get: function () { return paymentsV2_1.syncExchangeRatesScheduler; } });
Object.defineProperty(exports, "generateComplianceReportsScheduler", { enumerable: true, get: function () { return paymentsV2_1.generateComplianceReportsScheduler; } });
var payments_1 = require("./payments");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return payments_1.stripeWebhook; } });
// ============================================================================
// WALLET & CRYPTO
// ============================================================================
var walletBridge_1 = require("./walletBridge");
Object.defineProperty(exports, "connectWalletV1", { enumerable: true, get: function () { return walletBridge_1.connectWalletV1; } });
Object.defineProperty(exports, "initiateDepositV1", { enumerable: true, get: function () { return walletBridge_1.initiateDepositV1; } });
Object.defineProperty(exports, "confirmDepositV1", { enumerable: true, get: function () { return walletBridge_1.confirmDepositV1; } });
Object.defineProperty(exports, "initiateWithdrawalV1", { enumerable: true, get: function () { return walletBridge_1.initiateWithdrawalV1; } });
Object.defineProperty(exports, "getWalletStatusV1", { enumerable: true, get: function () { return walletBridge_1.getWalletStatusV1; } });
// ============================================================================
// LOYALTY & GAMIFICATION
// ============================================================================
var loyalty_1 = require("./loyalty");
Object.defineProperty(exports, "claimRewardCallable", { enumerable: true, get: function () { return loyalty_1.claimRewardCallable; } });
Object.defineProperty(exports, "getUserLoyaltyCallable", { enumerable: true, get: function () { return loyalty_1.getUserLoyaltyCallable; } });
Object.defineProperty(exports, "getRankingsCallable", { enumerable: true, get: function () { return loyalty_1.getRankingsCallable; } });
Object.defineProperty(exports, "awardPointsOnTx", { enumerable: true, get: function () { return loyalty_1.awardPointsOnTx; } });
Object.defineProperty(exports, "rebuildRankingsScheduler", { enumerable: true, get: function () { return loyalty_1.rebuildRankingsScheduler; } });
// ============================================================================
// TRUST & SECURITY
// ============================================================================
var trustEngine_1 = require("./trustEngine");
Object.defineProperty(exports, "calculateTrustScore", { enumerable: true, get: function () { return trustEngine_1.calculateTrustScore; } });
var kyc_1 = require("./kyc");
Object.defineProperty(exports, "getKYCStatusV1", { enumerable: true, get: function () { return kyc_1.getKYCStatusV1; } });
// ============================================================================
// SAFETY GAMIFICATION
// ============================================================================
var safetyGamification_1 = require("./safetyGamification");
Object.defineProperty(exports, "getAvailableQuestsV1", { enumerable: true, get: function () { return safetyGamification_1.getAvailableQuestsV1; } });
// ============================================================================
// FEATURE FLAGS
// ============================================================================
var featureFlags_1 = require("./featureFlags");
Object.defineProperty(exports, "getAllFeatureFlagsForUser", { enumerable: true, get: function () { return featureFlags_1.getAllFeatureFlagsForUser; } });
// ============================================================================
// ANALYTICS
// ============================================================================
var analytics_1 = require("./analytics");
Object.defineProperty(exports, "logServerEvent", { enumerable: true, get: function () { return analytics_1.logServerEvent; } });
// ============================================================================
// RATE LIMITING
// ============================================================================
var rateLimit_1 = require("./rateLimit");
Object.defineProperty(exports, "checkRateLimit", { enumerable: true, get: function () { return rateLimit_1.checkRateLimit; } });
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
var cacheManager_1 = require("./cacheManager");
Object.defineProperty(exports, "getCached", { enumerable: true, get: function () { return cacheManager_1.getCached; } });
Object.defineProperty(exports, "invalidateCache", { enumerable: true, get: function () { return cacheManager_1.invalidateCache; } });
// ============================================================================
// CURRENCY & PRICING
// ============================================================================
var currency_1 = require("./currency");
Object.defineProperty(exports, "convertCurrency", { enumerable: true, get: function () { return currency_1.convertCurrency; } });
// ============================================================================
// PRESENCE
// ============================================================================
var presence_1 = require("./presence");
Object.defineProperty(exports, "updatePresenceV1", { enumerable: true, get: function () { return presence_1.updatePresenceV1; } });
// ============================================================================
// I18N
// ============================================================================
var i18nExtended_1 = require("./i18nExtended");
Object.defineProperty(exports, "getTranslationsV1", { enumerable: true, get: function () { return i18nExtended_1.getTranslationsV1; } });
// ============================================================================
// SYSTEM INFORMATION
// ============================================================================
exports.getSystemInfo = (0, https_1.onRequest)({ region: "europe-west3", cors: true }, async (req, res) => {
    const info = {
        version: "3.0.0",
        service: "avalo-cloud-functions",
        region: "europe-west3",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        features: {
            payments: true,
            ai_moderation: true,
            crypto_wallet: true,
            analytics: true,
            loyalty: true,
            feed: true,
        },
        endpoints: {
            health: ["ping", "getSystemInfo"],
            feed: ["createPostV1", "getGlobalFeedV1", "likePostV1"],
            payments: ["purchaseTokensV2", "getTransactionHistoryV2", "stripeWebhook"],
            wallet: ["connectWalletV1", "initiateDepositV1", "confirmDepositV1"],
            loyalty: ["claimRewardCallable", "getUserLoyaltyCallable", "getRankingsCallable"],
            ai: ["analyzeContentV1"],
            security: ["calculateTrustScore", "getKYCStatusV1"],
        },
        status: "operational",
    };
    v2_1.logger.info("System info requested");
    res.status(200).json(info);
});
v2_1.logger.info("✅ Avalo Cloud Functions loaded successfully");
//# sourceMappingURL=index.js.map