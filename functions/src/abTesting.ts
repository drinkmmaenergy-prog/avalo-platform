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

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
import * as crypto from "crypto";

const db = getFirestore();

/**
 * A/B test configuration
 */
interface ABTest {
  testKey: string;
  name: string;
  description: string;
  variants: ABVariant[];
  status: "draft" | "active" | "paused" | "completed";
  startDate: Timestamp | FieldValue;
  endDate?: Timestamp | FieldValue;
  targetMetrics: string[]; // e.g., ["conversion", "retention_d1", "revenue"]
  sampleSize: {
    target: number;
    current: number;
  };
  createdBy: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

/**
 * Test variant definition
 */
interface ABVariant {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-100 (percentage of traffic)
  config?: Record<string, any>; // Feature flag overrides
}

/**
 * Event tracking entry
 */
interface ABEvent {
  eventId: string;
  testKey: string;
  userId: string;
  variant: string;
  metric: string;
  value: number;
  timestamp: Timestamp | FieldValue;
  metadata?: Record<string, any>;
}

/**
 * Test results summary
 */
interface ABResults {
  testKey: string;
  variants: Record<string, VariantMetrics>;
  winningVariant?: string;
  confidence: number; // 0-100 (statistical confidence)
  recommendation: "continue" | "conclude" | "need_more_data";
  updatedAt: Timestamp | FieldValue;
}

/**
 * Variant performance metrics
 */
interface VariantMetrics {
  variantId: string;
  sampleSize: number;
  metrics: Record<string, {
    sum: number;
    count: number;
    avg: number;
    min: number;
    max: number;
    stdDev?: number;
  }>;
  conversionRate?: number;
  retentionRate?: number;
  revenuePerUser?: number;
}

/**
 * Assign Variant to User (Deterministic)
 *
 * Uses MD5 hash of userId + testKey to deterministically assign variant
 * This ensures the same user always gets the same variant
 */
export const assignVariantV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      testKey: z.string().min(1).max(100),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { testKey } = validationResult.data;

    logger.info(`Assigning variant for test: ${testKey}`, { uid });

    try {
      // Fetch test configuration
      const testDoc = await db.collection("abTests").doc(testKey).get();

      if (!testDoc.exists) {
        throw new HttpsError("not-found", `Test not found: ${testKey}`);
      }

      const test = testDoc.data() as ABTest;

      if (test.status !== "active") {
        throw new HttpsError("failed-precondition", `Test is not active: ${test.status}`);
      }

      // Check if user already has an assignment
      const assignmentDoc = await db
        .collection("abAssignments")
        .doc(`${testKey}_${uid}`)
        .get();

      if (assignmentDoc.exists) {
        const existing = assignmentDoc.data()!;
        logger.info(`User already assigned: ${existing.variant}`, { uid, testKey });
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
        assignedAt: Timestamp.now(),
        sessionCount: 0,
        lastSeenAt: Timestamp.now(),
      };

      await db.collection("abAssignments").doc(`${testKey}_${uid}`).set(assignment);

      // Increment test sample size
      await db.collection("abTests").doc(testKey).update({
        "sampleSize.current": FieldValue.increment(1),
      });

      logger.info(`Variant assigned: ${variant.id}`, { uid, testKey });

      return {
        testKey,
        variant: variant.id,
        variantName: variant.name,
        config: variant.config || {},
        assignedAt: assignment.assignedAt,
      };
    } catch (error: any) {
      logger.error("Error assigning variant", { error, uid, testKey });
      throw new HttpsError("internal", `Failed to assign variant: ${error.message}`);
    }
  }
);

/**
 * Deterministic variant assignment using hash
 *
 * Algorithm:
 * 1. Generate MD5 hash of userId + testKey
 * 2. Convert first 8 hex characters to integer
 * 3. Modulo 100 to get bucket (0-99)
 * 4. Assign variant based on weight distribution
 */
function assignVariantDeterministic(
  userId: string,
  testKey: string,
  variants: ABVariant[]
): ABVariant {
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
export const trackABEventV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      testKey: z.string().min(1).max(100),
      metric: z.string().min(1).max(100),
      value: z.number(),
      metadata: z.record(z.any()).optional(),
      idempotencyKey: z.string().optional(), // For duplicate prevention
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { testKey, metric, value, metadata, idempotencyKey } = validationResult.data;

    logger.info(`Tracking AB event: ${testKey}/${metric}`, { uid, value });

    try {
      // Get user's variant assignment
      const assignmentDoc = await db
        .collection("abAssignments")
        .doc(`${testKey}_${uid}`)
        .get();

      if (!assignmentDoc.exists) {
        throw new HttpsError("not-found", "No variant assignment found for this test");
      }

      const assignment = assignmentDoc.data()!;
      const variant = assignment.variant;

      // Check idempotency (if key provided)
      if (idempotencyKey) {
        const eventId = `${testKey}_${uid}_${idempotencyKey}`;
        const existingEvent = await db.collection("abEvents").doc(eventId).get();

        if (existingEvent.exists) {
          logger.info(`Duplicate event detected, skipping`, { eventId });
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

      const event: ABEvent = {
        eventId,
        testKey,
        userId: uid,
        variant,
        metric,
        value,
        timestamp: Timestamp.now(),
        metadata,
      };

      await db.collection("abEvents").doc(eventId).set(event);

      // Update aggregated metrics (for faster results calculation)
      await updateVariantMetrics(testKey, variant, metric, value);

      // Update last seen timestamp
      await db.collection("abAssignments").doc(`${testKey}_${uid}`).update({
        lastSeenAt: Timestamp.now(),
        sessionCount: FieldValue.increment(1),
      });

      logger.info(`AB event tracked successfully`, { eventId, testKey, metric, value });

      return {
        success: true,
        eventId,
        testKey,
        variant,
        metric,
        value,
      };
    } catch (error: any) {
      logger.error("Error tracking AB event", { error, uid, testKey, metric });
      throw new HttpsError("internal", `Failed to track event: ${error.message}`);
    }
  }
);

/**
 * Update variant metrics (aggregated)
 */
async function updateVariantMetrics(
  testKey: string,
  variant: string,
  metric: string,
  value: number
): Promise<void> {
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
        updatedAt: Timestamp.now(),
      });
    } else {
      const data = doc.data()!;
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
        sampleSize: FieldValue.increment(1),
        [`metrics.${metric}.sum`]: newSum,
        [`metrics.${metric}.count`]: newCount,
        [`metrics.${metric}.avg`]: newAvg,
        [`metrics.${metric}.min`]: Math.min(existingMetric.min, value),
        [`metrics.${metric}.max`]: Math.max(existingMetric.max, value),
        updatedAt: Timestamp.now(),
      });
    }
  });
}

/**
 * Get A/B Test Results
 *
 * Returns aggregated metrics, statistical analysis, and recommendations
 */
export const getABResultsV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      testKey: z.string().min(1).max(100),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { testKey } = validationResult.data;

    logger.info(`Fetching AB results for: ${testKey}`, { uid });

    try {
      // Check if user has permission (admin or test creator)
      const userDoc = await db.collection("users").doc(uid).get();
      const testDoc = await db.collection("abTests").doc(testKey).get();

      if (!testDoc.exists) {
        throw new HttpsError("not-found", `Test not found: ${testKey}`);
      }

      const test = testDoc.data() as ABTest;
      const isAdmin = userDoc.data()?.roles?.admin || false;
      const isCreator = test.createdBy === uid;

      if (!isAdmin && !isCreator) {
        throw new HttpsError("permission-denied", "Only test creator or admin can view results");
      }

      // Fetch variant metrics
      const metricsSnapshot = await db
        .collection("abTests")
        .doc(testKey)
        .collection("variantMetrics")
        .get();

      const variantMetrics: Record<string, VariantMetrics> = {};

      metricsSnapshot.forEach((doc) => {
        variantMetrics[doc.id] = doc.data() as VariantMetrics;
      });

      // Calculate statistical significance and winning variant
      const analysis = calculateStatisticalSignificance(variantMetrics, test.targetMetrics);

      // Determine recommendation
      const recommendation = determineRecommendation(
        test,
        variantMetrics,
        analysis.confidence
      );

      const results: ABResults = {
        testKey,
        variants: variantMetrics,
        winningVariant: analysis.winner,
        confidence: analysis.confidence,
        recommendation,
        updatedAt: Timestamp.now(),
      };

      // Store results for caching
      await db.collection("abResults").doc(testKey).set(results, { merge: true });

      logger.info(`AB results calculated`, { testKey, winner: analysis.winner, confidence: analysis.confidence });

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
          totalSampleSize: Object.values(variantMetrics).reduce(
            (sum, v) => sum + v.sampleSize,
            0
          ),
          variants: Object.keys(variantMetrics).length,
          confidence: analysis.confidence,
          winner: analysis.winner,
          recommendation,
        },
      };
    } catch (error: any) {
      logger.error("Error fetching AB results", { error, uid, testKey });
      throw new HttpsError("internal", `Failed to fetch results: ${error.message}`);
    }
  }
);

/**
 * Calculate statistical significance using Z-test
 *
 * Compares conversion rates between variants to determine if differences
 * are statistically significant (p < 0.05)
 */
function calculateStatisticalSignificance(
  variantMetrics: Record<string, VariantMetrics>,
  targetMetrics: string[]
): {
  winner: string | undefined;
  confidence: number;
  pValue: number;
} {
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
  const standardError = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / controlSize + 1 / treatmentSize)
  );

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
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return z > 0 ? 1 - p : p;
}

/**
 * Determine recommendation based on test results
 */
function determineRecommendation(
  test: ABTest,
  variantMetrics: Record<string, VariantMetrics>,
  confidence: number
): "continue" | "conclude" | "need_more_data" {
  const totalSampleSize = Object.values(variantMetrics).reduce(
    (sum, v) => sum + v.sampleSize,
    0
  );

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

/**
 * Export types for use in other modules
 */
export type { ABTest, ABVariant, ABEvent, ABResults, VariantMetrics };

