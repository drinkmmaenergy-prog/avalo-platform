"use strict";
/**
 * PHASE 22 - Rate Limiting
 *
 * Token bucket algorithm for rate limiting write operations
 * Protects against abuse and DoS attacks
 *
 * Feature flag controlled: rate_limiting
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimits = void 0;
exports.checkRateLimit = checkRateLimit;
exports.isRateLimitExceeded = isRateLimitExceeded;
exports.getRateLimitStatus = getRateLimitStatus;
exports.resetRateLimit = resetRateLimit;
exports.checkIPRateLimit = checkIPRateLimit;
exports.cleanupRateLimitBuckets = cleanupRateLimitBuckets;
exports.getRateLimitViolationsSummary = getRateLimitViolationsSummary;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Rate limit configurations
 * bucketSize: Maximum tokens in bucket
 * refillRate: Tokens added per second
 * cost: Tokens consumed per operation
 */
exports.RateLimits = {
    // Chat operations
    CHAT_MESSAGE_SEND: {
        bucketSize: 60,
        refillRate: 1, // 1 message per second = 60/min max
        cost: 1,
        windowSeconds: 60,
    },
    CHAT_CREATE: {
        bucketSize: 10,
        refillRate: 0.1, // 6 per minute
        cost: 1,
        windowSeconds: 60,
    },
    // Profile operations
    PROFILE_LIKE: {
        bucketSize: 100,
        refillRate: 1.67, // ~100 per minute
        cost: 1,
        windowSeconds: 60,
    },
    PROFILE_VIEW: {
        bucketSize: 200,
        refillRate: 3.33, // ~200 per minute
        cost: 1,
        windowSeconds: 60,
    },
    // Transaction operations
    WALLET_PURCHASE: {
        bucketSize: 10,
        refillRate: 0.017, // 1 per minute
        cost: 1,
        windowSeconds: 60,
    },
    TOKEN_TRANSFER: {
        bucketSize: 30,
        refillRate: 0.5, // 30 per minute
        cost: 1,
        windowSeconds: 60,
    },
    // Content creation
    POST_CREATE: {
        bucketSize: 20,
        refillRate: 0.33, // ~20 per hour
        cost: 1,
        windowSeconds: 3600,
    },
    PHOTO_UPLOAD: {
        bucketSize: 30,
        refillRate: 0.5, // 30 per hour
        cost: 1,
        windowSeconds: 3600,
    },
    // Reporting/Moderation
    CONTENT_REPORT: {
        bucketSize: 10,
        refillRate: 0.028, // ~10 per 6 hours
        cost: 1,
        windowSeconds: 3600,
    },
    USER_BLOCK: {
        bucketSize: 20,
        refillRate: 0.056, // ~20 per 6 hours
        cost: 1,
        windowSeconds: 3600,
    },
    // API calls (general)
    API_READ: {
        bucketSize: 1000,
        refillRate: 16.67, // 1000 per minute
        cost: 1,
        windowSeconds: 60,
    },
    API_WRITE: {
        bucketSize: 100,
        refillRate: 1.67, // 100 per minute
        cost: 1,
        windowSeconds: 60,
    },
};
/**
 * Check and consume rate limit
 *
 * @param identifier User ID or IP address
 * @param limitKey Rate limit configuration key
 * @param cost Number of tokens to consume (default: 1)
 * @returns Whether the operation is allowed
 * @throws HttpsError if rate limit exceeded
 */
async function checkRateLimit(identifier, limitKey, cost = 1) {
    try {
        // Check if rate limiting is enabled
        const rateLimitingEnabled = await (0, featureFlags_1.getFeatureFlag)(identifier, "rate_limiting", true);
        if (!rateLimitingEnabled) {
            return; // Rate limiting disabled
        }
        const config = exports.RateLimits[limitKey];
        const bucketKey = `${identifier}:${limitKey}`;
        // Get or create bucket
        const bucketRef = db.collection("rateLimitBuckets").doc(bucketKey);
        const bucketDoc = await bucketRef.get();
        const now = firestore_1.Timestamp.now();
        let bucket;
        if (!bucketDoc.exists) {
            // Create new bucket
            bucket = {
                tokens: config.bucketSize - cost, // Consume immediately
                lastRefillAt: now,
                createdAt: now,
            };
            await bucketRef.set(bucket);
            // Allowed (new bucket)
            return;
        }
        bucket = bucketDoc.data();
        // Calculate refill
        const secondsSinceLastRefill = (now.toMillis() - bucket.lastRefillAt.toMillis()) / 1000;
        const tokensToAdd = secondsSinceLastRefill * config.refillRate;
        const currentTokens = Math.min(config.bucketSize, bucket.tokens + tokensToAdd);
        // Check if enough tokens
        if (currentTokens < cost) {
            // Rate limit exceeded
            const retryAfterSeconds = Math.ceil((cost - currentTokens) / config.refillRate);
            v2_1.logger.warn(`Rate limit exceeded for ${identifier}:${limitKey}`, {
                currentTokens,
                required: cost,
                retryAfter: retryAfterSeconds,
            });
            // Log rate limit violation
            await logRateLimitViolation(identifier, limitKey, currentTokens, cost);
            throw new https_1.HttpsError("resource-exhausted", `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`, {
                retryAfter: retryAfterSeconds,
                limitKey,
                currentTokens: Math.floor(currentTokens),
                required: cost,
            });
        }
        // Consume tokens
        const newTokens = currentTokens - cost;
        await bucketRef.update({
            tokens: newTokens,
            lastRefillAt: now,
        });
        // Allowed
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error(`Rate limit check failed for ${identifier}:${limitKey}:`, error);
        // Fail open on errors (don't block legitimate requests)
        return;
    }
}
/**
 * Check rate limit without throwing (returns boolean)
 */
async function isRateLimitExceeded(identifier, limitKey, cost = 1) {
    try {
        await checkRateLimit(identifier, limitKey, cost);
        return false; // Not exceeded
    }
    catch (error) {
        if (error instanceof https_1.HttpsError && error.code === "resource-exhausted") {
            return true; // Exceeded
        }
        return false; // Error, fail open
    }
}
/**
 * Get current rate limit status (for UI display)
 */
async function getRateLimitStatus(identifier, limitKey) {
    const config = exports.RateLimits[limitKey];
    const bucketKey = `${identifier}:${limitKey}`;
    const bucketDoc = await db.collection("rateLimitBuckets").doc(bucketKey).get();
    if (!bucketDoc.exists) {
        return {
            currentTokens: config.bucketSize,
            maxTokens: config.bucketSize,
            refillRate: config.refillRate,
            percentRemaining: 100,
        };
    }
    const bucket = bucketDoc.data();
    const now = firestore_1.Timestamp.now();
    // Calculate current tokens with refill
    const secondsSinceLastRefill = (now.toMillis() - bucket.lastRefillAt.toMillis()) / 1000;
    const tokensToAdd = secondsSinceLastRefill * config.refillRate;
    const currentTokens = Math.min(config.bucketSize, bucket.tokens + tokensToAdd);
    return {
        currentTokens: Math.floor(currentTokens),
        maxTokens: config.bucketSize,
        refillRate: config.refillRate,
        percentRemaining: (currentTokens / config.bucketSize) * 100,
    };
}
/**
 * Reset rate limit for a user (admin only)
 */
async function resetRateLimit(identifier, limitKey) {
    const bucketKey = `${identifier}:${limitKey}`;
    await db.collection("rateLimitBuckets").doc(bucketKey).delete();
    v2_1.logger.info(`Rate limit reset for ${identifier}:${limitKey}`);
}
/**
 * IP-based rate limiting (for unauthenticated requests)
 */
async function checkIPRateLimit(ip, limitKey, cost = 1) {
    const ipIdentifier = `ip:${ip}`;
    await checkRateLimit(ipIdentifier, limitKey, cost);
}
/**
 * Log rate limit violation for monitoring
 */
async function logRateLimitViolation(identifier, limitKey, currentTokens, required) {
    try {
        const today = new Date().toISOString().split("T")[0];
        await db
            .collection("engineLogs")
            .doc("secops")
            .collection(today)
            .doc("rateLimits")
            .set({
            violations: firestore_1.FieldValue.arrayUnion({
                identifier,
                limitKey,
                currentTokens: Math.floor(currentTokens),
                required,
                timestamp: new Date().toISOString(),
            }),
        }, { merge: true });
    }
    catch (error) {
        v2_1.logger.error("Failed to log rate limit violation:", error);
        // Don't throw - logging failure shouldn't affect rate limiting
    }
}
/**
 * Cleanup old rate limit buckets (runs daily)
 * Removes buckets not accessed in 7 days
 */
async function cleanupRateLimitBuckets() {
    try {
        const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oldBucketsSnapshot = await db
            .collection("rateLimitBuckets")
            .where("lastRefillAt", "<", sevenDaysAgo)
            .limit(500)
            .get();
        if (oldBucketsSnapshot.empty) {
            return;
        }
        const batch = db.batch();
        oldBucketsSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        v2_1.logger.info(`Cleaned up ${oldBucketsSnapshot.size} old rate limit buckets`);
    }
    catch (error) {
        v2_1.logger.error("Rate limit bucket cleanup failed:", error);
    }
}
/**
 * Get rate limit violations summary (for security dashboard)
 */
async function getRateLimitViolationsSummary(hours = 24) {
    const today = new Date().toISOString().split("T")[0];
    const logsDoc = await db
        .collection("engineLogs")
        .doc("secops")
        .collection(today)
        .doc("rateLimits")
        .get();
    if (!logsDoc.exists) {
        return {
            totalViolations: 0,
            byLimitKey: {},
            topOffenders: [],
        };
    }
    const violations = logsDoc.data()?.violations || [];
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    // Filter to time window
    const recentViolations = violations.filter((v) => new Date(v.timestamp) >= cutoffTime);
    // Aggregate by limit key
    const byLimitKey = {};
    const offenderCounts = {};
    recentViolations.forEach((v) => {
        byLimitKey[v.limitKey] = (byLimitKey[v.limitKey] || 0) + 1;
        offenderCounts[v.identifier] = (offenderCounts[v.identifier] || 0) + 1;
    });
    // Get top offenders
    const topOffenders = Object.entries(offenderCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([identifier, count]) => ({ identifier, count }));
    return {
        totalViolations: recentViolations.length,
        byLimitKey,
        topOffenders,
    };
}
//# sourceMappingURL=rateLimit.js.map