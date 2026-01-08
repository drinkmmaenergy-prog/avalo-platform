"use strict";
/**
 * PHASE 53 - A/B Testing Framework
 *
 * Production-ready A/B testing system with deterministic variant assignment
 * and comprehensive metrics tracking
 *
 * Features:
 * - Deterministic hash-based variant assignment (consistent per user)
 * - Event tracking with idempotency
 * - Real-time metrics aggregation
 * - Statistical significance calculation
 * - Multi-variant support (A/B/C/D/...)
 *
 * Region: europe-west3
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getABResultsV1 = exports.trackABEventV1 = exports.assignVariantV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const crypto = __importStar(require("crypto"));
const db = (0, firestore_1.getFirestore)();
/**
 * Assign Variant to User (Deterministic)
 *
 * Uses MD5 hash of userId + testKey to deterministically assign variant
 * This ensures the same user always gets the same variant
 */
exports.assignVariantV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        testKey: zod_1.z.string().min(1).max(100),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { testKey } = validationResult.data;
    v2_1.logger.info(`Assigning variant for test: ${testKey}`, { uid });
    try {
        // Fetch test configuration
        const testDoc = await db.collection("abTests").doc(testKey).get();
        if (!testDoc.exists) {
            throw new https_1.HttpsError("not-found", `Test not found: ${testKey}`);
        }
        const test = testDoc.data();
        if (test.status !== "active") {
            throw new https_1.HttpsError("failed-precondition", `Test is not active: ${test.status}`);
        }
        // Check if user already has an assignment
        const assignmentDoc = await db
            .collection("abAssignments")
            .doc(`${testKey}_${uid}`)
            .get();
        if (assignmentDoc.exists) {
            const existing = assignmentDoc.data();
            v2_1.logger.info(`User already assigned: ${existing.variant}`, { uid, testKey });
            return {
                testKey,
                variant: existing.variant,
                config: existing.config,
                assignedAt: existing.assignedAt,
            };
        }
        // Deterministic variant assignment using hash
        const variant = assignVariantDeterministic(uid, testKey, test.variants);
        // Store assignment
        const assignment = {
            testKey,
            userId: uid,
            variant: variant.id,
            variantName: variant.name,
            config: variant.config || {},
            assignedAt: firestore_1.Timestamp.now(),
            sessionCount: 0,
            lastSeenAt: firestore_1.Timestamp.now(),
        };
        await db.collection("abAssignments").doc(`${testKey}_${uid}`).set(assignment);
        // Increment test sample size
        await db.collection("abTests").doc(testKey).update({
            "sampleSize.current": firestore_1.FieldValue.increment(1),
        });
        v2_1.logger.info(`Variant assigned: ${variant.id}`, { uid, testKey });
        return {
            testKey,
            variant: variant.id,
            variantName: variant.name,
            config: variant.config || {},
            assignedAt: assignment.assignedAt,
        };
    }
    catch (error) {
        v2_1.logger.error("Error assigning variant", { error, uid, testKey });
        throw new https_1.HttpsError("internal", `Failed to assign variant: ${error.message}`);
    }
});
/**
 * Deterministic variant assignment using hash
 *
 * Algorithm:
 * 1. Generate MD5 hash of userId + testKey
 * 2. Convert first 8 hex characters to integer
 * 3. Modulo 100 to get bucket (0-99)
 * 4. Assign variant based on weight distribution
 */
function assignVariantDeterministic(userId, testKey, variants) {
    // Generate deterministic hash
    const hash = crypto
        .createHash("md5")
        .update(`${userId}:${testKey}`)
        .digest("hex");
    // Convert to integer (0-99)
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    // Assign variant based on weight distribution
    let cumulativeWeight = 0;
    for (const variant of variants) {
        cumulativeWeight += variant.weight;
        if (bucket < cumulativeWeight) {
            return variant;
        }
    }
    // Fallback to last variant (should never reach here if weights sum to 100)
    return variants[variants.length - 1];
}
/**
 * Track A/B Test Event
 *
 * Records user actions and metrics for analysis
 * Includes idempotency check to prevent duplicate events
 */
exports.trackABEventV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        testKey: zod_1.z.string().min(1).max(100),
        metric: zod_1.z.string().min(1).max(100),
        value: zod_1.z.number(),
        metadata: zod_1.z.record(zod_1.z.any()).optional(),
        idempotencyKey: zod_1.z.string().optional(), // For duplicate prevention
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { testKey, metric, value, metadata, idempotencyKey } = validationResult.data;
    v2_1.logger.info(`Tracking AB event: ${testKey}/${metric}`, { uid, value });
    try {
        // Get user's variant assignment
        const assignmentDoc = await db
            .collection("abAssignments")
            .doc(`${testKey}_${uid}`)
            .get();
        if (!assignmentDoc.exists) {
            throw new https_1.HttpsError("not-found", "No variant assignment found for this test");
        }
        const assignment = assignmentDoc.data();
        const variant = assignment.variant;
        // Check idempotency (if key provided)
        if (idempotencyKey) {
            const eventId = `${testKey}_${uid}_${idempotencyKey}`;
            const existingEvent = await db.collection("abEvents").doc(eventId).get();
            if (existingEvent.exists) {
                v2_1.logger.info(`Duplicate event detected, skipping`, { eventId });
                return {
                    success: true,
                    duplicate: true,
                    eventId,
                };
            }
        }
        // Create event
        const eventId = idempotencyKey
            ? `${testKey}_${uid}_${idempotencyKey}`
            : `${testKey}_${uid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const event = {
            eventId,
            testKey,
            userId: uid,
            variant,
            metric,
            value,
            timestamp: firestore_1.Timestamp.now(),
            metadata,
        };
        await db.collection("abEvents").doc(eventId).set(event);
        // Update aggregated metrics (for faster results calculation)
        await updateVariantMetrics(testKey, variant, metric, value);
        // Update last seen timestamp
        await db.collection("abAssignments").doc(`${testKey}_${uid}`).update({
            lastSeenAt: firestore_1.Timestamp.now(),
            sessionCount: firestore_1.FieldValue.increment(1),
        });
        v2_1.logger.info(`AB event tracked successfully`, { eventId, testKey, metric, value });
        return {
            success: true,
            eventId,
            testKey,
            variant,
            metric,
            value,
        };
    }
    catch (error) {
        v2_1.logger.error("Error tracking AB event", { error, uid, testKey, metric });
        throw new https_1.HttpsError("internal", `Failed to track event: ${error.message}`);
    }
});
/**
 * Update variant metrics (aggregated)
 */
async function updateVariantMetrics(testKey, variant, metric, value) {
    const metricsRef = db
        .collection("abTests")
        .doc(testKey)
        .collection("variantMetrics")
        .doc(variant);
    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(metricsRef);
        if (!doc.exists) {
            // Initialize metrics
            transaction.set(metricsRef, {
                variantId: variant,
                sampleSize: 1,
                metrics: {
                    [metric]: {
                        sum: value,
                        count: 1,
                        avg: value,
                        min: value,
                        max: value,
                    },
                },
                updatedAt: firestore_1.Timestamp.now(),
            });
        }
        else {
            const data = doc.data();
            const existingMetric = data.metrics?.[metric] || {
                sum: 0,
                count: 0,
                avg: 0,
                min: value,
                max: value,
            };
            const newSum = existingMetric.sum + value;
            const newCount = existingMetric.count + 1;
            const newAvg = newSum / newCount;
            transaction.update(metricsRef, {
                sampleSize: firestore_1.FieldValue.increment(1),
                [`metrics.${metric}.sum`]: newSum,
                [`metrics.${metric}.count`]: newCount,
                [`metrics.${metric}.avg`]: newAvg,
                [`metrics.${metric}.min`]: Math.min(existingMetric.min, value),
                [`metrics.${metric}.max`]: Math.max(existingMetric.max, value),
                updatedAt: firestore_1.Timestamp.now(),
            });
        }
    });
}
/**
 * Get A/B Test Results
 *
 * Returns aggregated metrics, statistical analysis, and recommendations
 */
exports.getABResultsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        testKey: zod_1.z.string().min(1).max(100),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { testKey } = validationResult.data;
    v2_1.logger.info(`Fetching AB results for: ${testKey}`, { uid });
    try {
        // Check if user has permission (admin or test creator)
        const userDoc = await db.collection("users").doc(uid).get();
        const testDoc = await db.collection("abTests").doc(testKey).get();
        if (!testDoc.exists) {
            throw new https_1.HttpsError("not-found", `Test not found: ${testKey}`);
        }
        const test = testDoc.data();
        const isAdmin = userDoc.data()?.roles?.admin || false;
        const isCreator = test.createdBy === uid;
        if (!isAdmin && !isCreator) {
            throw new https_1.HttpsError("permission-denied", "Only test creator or admin can view results");
        }
        // Fetch variant metrics
        const metricsSnapshot = await db
            .collection("abTests")
            .doc(testKey)
            .collection("variantMetrics")
            .get();
        const variantMetrics = {};
        metricsSnapshot.forEach((doc) => {
            variantMetrics[doc.id] = doc.data();
        });
        // Calculate statistical significance and winning variant
        const analysis = calculateStatisticalSignificance(variantMetrics, test.targetMetrics);
        // Determine recommendation
        const recommendation = determineRecommendation(test, variantMetrics, analysis.confidence);
        const results = {
            testKey,
            variants: variantMetrics,
            winningVariant: analysis.winner,
            confidence: analysis.confidence,
            recommendation,
            updatedAt: firestore_1.Timestamp.now(),
        };
        // Store results for caching
        await db.collection("abResults").doc(testKey).set(results, { merge: true });
        v2_1.logger.info(`AB results calculated`, { testKey, winner: analysis.winner, confidence: analysis.confidence });
        return {
            success: true,
            test: {
                key: testKey,
                name: test.name,
                status: test.status,
                startDate: test.startDate,
                endDate: test.endDate,
                targetMetrics: test.targetMetrics,
            },
            results,
            analysis: {
                totalSampleSize: Object.values(variantMetrics).reduce((sum, v) => sum + v.sampleSize, 0),
                variants: Object.keys(variantMetrics).length,
                confidence: analysis.confidence,
                winner: analysis.winner,
                recommendation,
            },
        };
    }
    catch (error) {
        v2_1.logger.error("Error fetching AB results", { error, uid, testKey });
        throw new https_1.HttpsError("internal", `Failed to fetch results: ${error.message}`);
    }
});
/**
 * Calculate statistical significance using Z-test
 *
 * Compares conversion rates between variants to determine if differences
 * are statistically significant (p < 0.05)
 */
function calculateStatisticalSignificance(variantMetrics, targetMetrics) {
    const variantIds = Object.keys(variantMetrics);
    if (variantIds.length < 2) {
        return { winner: undefined, confidence: 0, pValue: 1 };
    }
    // Use first target metric for significance test (usually "conversion")
    const primaryMetric = targetMetrics[0] || "conversion";
    // Find variant with highest metric average
    let bestVariant = variantIds[0];
    let bestAvg = 0;
    for (const variantId of variantIds) {
        const metrics = variantMetrics[variantId].metrics;
        const metricData = metrics[primaryMetric];
        if (metricData && metricData.avg > bestAvg) {
            bestAvg = metricData.avg;
            bestVariant = variantId;
        }
    }
    // Calculate confidence (simplified Z-test approximation)
    // In production, use proper statistical libraries
    const controlVariant = variantIds[0]; // Assume first variant is control
    const treatmentVariant = bestVariant;
    if (controlVariant === treatmentVariant) {
        // Best variant is control
        return { winner: undefined, confidence: 0, pValue: 1 };
    }
    const controlMetric = variantMetrics[controlVariant].metrics[primaryMetric];
    const treatmentMetric = variantMetrics[treatmentVariant].metrics[primaryMetric];
    if (!controlMetric || !treatmentMetric) {
        return { winner: undefined, confidence: 0, pValue: 1 };
    }
    const controlRate = controlMetric.avg;
    const treatmentRate = treatmentMetric.avg;
    const controlSize = controlMetric.count;
    const treatmentSize = treatmentMetric.count;
    // Calculate pooled standard error
    const pooledRate = (controlRate * controlSize + treatmentRate * treatmentSize) /
        (controlSize + treatmentSize);
    const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / controlSize + 1 / treatmentSize));
    // Calculate Z-score
    const zScore = Math.abs((treatmentRate - controlRate) / standardError);
    // Approximate p-value from Z-score (two-tailed test)
    const pValue = 2 * (1 - normalCDF(zScore));
    // Convert p-value to confidence percentage
    const confidence = Math.round((1 - pValue) * 100);
    return {
        winner: confidence >= 95 ? bestVariant : undefined,
        confidence,
        pValue,
    };
}
/**
 * Cumulative Distribution Function for standard normal distribution
 * (Approximation using error function)
 */
function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d *
        t *
        (0.3193815 +
            t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}
/**
 * Determine recommendation based on test results
 */
function determineRecommendation(test, variantMetrics, confidence) {
    const totalSampleSize = Object.values(variantMetrics).reduce((sum, v) => sum + v.sampleSize, 0);
    // Need more data if sample size is too small
    if (totalSampleSize < test.sampleSize.target * 0.5) {
        return "need_more_data";
    }
    // Conclude if we have high confidence and reached target sample size
    if (confidence >= 95 && totalSampleSize >= test.sampleSize.target) {
        return "conclude";
    }
    // Continue testing
    return "continue";
}
//# sourceMappingURL=abTesting.js.map