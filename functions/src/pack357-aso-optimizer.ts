/**
 * PACK 357 — ASO Optimizer Engine
 * 
 * Automated optimization engine for ASO variants
 * Makes decisions based on performance benchmarks
 * Integrates with PACK 356 (Paid Acquisition) for traffic scaling
 * 
 * Daily evaluation rules:
 * - If CVR < benchmark → rotate screenshots
 * - If Pay Rate < 1.2% → rotate messaging
 * - If Revenue / Install < target → archive variant
 * - If LTV > +20% vs baseline → scale traffic via PACK 356
 */

import { Timestamp, FieldValue, Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";
import {
  ASOVariant,
  getASOVariant,
  updateASOVariant,
  archiveASOVariant,
  listASOVariants,
} from "./pack357-aso-variants";
import {
  getASOPerformanceSummary,
  compareASOVariants,
} from "./pack357-aso-performance";

export interface ASOBenchmark {
  platform: "IOS" | "ANDROID";
  country: string;
  
  // Benchmark metrics
  minStoreCVR: number; // Minimum acceptable store conversion rate
  minPayRate: number; // Minimum acceptable pay rate (default 1.2%)
  minRevenuePerInstall: number; // Minimum revenue per install
  
  // Thresholds for actions
  ltvImprovementThreshold: number; // % improvement to scale traffic (default 20%)
  rotateScreenshotsAfterDays: number; // Days before rotating screenshots
  
  updatedAt: Timestamp;
}

export interface ASOOptimizationAction {
  actionId: string;
  variantId: string;
  actionType:
    | "ROTATE_SCREENSHOTS"
    | "ROTATE_MESSAGING"
    | "ARCHIVE_VARIANT"
    | "SCALE_TRAFFIC"
    | "PAUSE_VARIANT"
    | "NO_ACTION";
  
  reason: string;
  metrics: {
    storeCVR?: number;
    payRate?: number;
    revenuePerInstall?: number;
    ltvImprovement?: number;
  };
  
  executed: boolean;
  executedAt?: Timestamp;
  
  createdAt: Timestamp;
}

/**
 * Run daily ASO optimization for all active variants
 */
export async function runDailyASOOptimization(): Promise<{
  variantsEvaluated: number;
  actionsCreated: number;
  actionsExecuted: number;
}> {
  logger.info("Starting daily ASO optimization");
  
  const activeVariants = await listASOVariants({ status: "ACTIVE" });
  
  let actionsCreated = 0;
  let actionsExecuted = 0;
  
  for (const variant of activeVariants) {
    try {
      const actions = await evaluateVariant(variant);
      actionsCreated += actions.length;
      
      // Execute high-priority actions immediately
      for (const action of actions) {
        if (shouldAutoExecute(action)) {
          await executeOptimizationAction(action);
          actionsExecuted++;
        }
      }
    } catch (error) {
      logger.error(`Failed to evaluate variant ${variant.variantId}`, error);
    }
  }
  
  logger.info("Daily ASO optimization complete", {
    variantsEvaluated: activeVariants.length,
    actionsCreated,
    actionsExecuted,
  });
  
  return {
    variantsEvaluated: activeVariants.length,
    actionsCreated,
    actionsExecuted,
  };
}

/**
 * Evaluate a single variant and create optimization actions
 */
export async function evaluateVariant(
  variant: ASOVariant
): Promise<ASOOptimizationAction[]> {
  const actions: ASOOptimizationAction[] = [];
  
  // Get last 7 days performance
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  
  const summary = await getASOPerformanceSummary(
    variant.variantId,
    startDate,
    endDate
  );
  
  // Get benchmarks
  const benchmarks = await getBenchmarksForVariant(variant);
  
  // Rule 1: If CVR < benchmark → rotate screenshots
  if (summary.avgStoreCVR < benchmarks.minStoreCVR && summary.totalImpressions > 1000) {
    actions.push(
      await createOptimizationAction({
        variantId: variant.variantId,
        actionType: "ROTATE_SCREENSHOTS",
        reason: `Store CVR (${(summary.avgStoreCVR * 100).toFixed(2)}%) below benchmark (${(benchmarks.minStoreCVR * 100).toFixed(2)}%)`,
        metrics: {
          storeCVR: summary.avgStoreCVR,
        },
      })
    );
  }
  
  // Rule 2: If Pay Rate < 1.2% → rotate messaging
  if (summary.avgVerifyToPayRate < benchmarks.minPayRate && summary.totalVerifiedUsers > 100) {
    actions.push(
      await createOptimizationAction({
        variantId: variant.variantId,
        actionType: "ROTATE_MESSAGING",
        reason: `Pay rate (${(summary.avgVerifyToPayRate * 100).toFixed(2)}%) below benchmark (${(benchmarks.minPayRate * 100).toFixed(2)}%)`,
        metrics: {
          payRate: summary.avgVerifyToPayRate,
        },
      })
    );
  }
  
  // Rule 3: If Revenue / Install < target → archive variant
  if (
    summary.avgRevenuePerInstall < benchmarks.minRevenuePerInstall &&
    summary.totalInstalls > 500
  ) {
    actions.push(
      await createOptimizationAction({
        variantId: variant.variantId,
        actionType: "ARCHIVE_VARIANT",
        reason: `Revenue per install ($${summary.avgRevenuePerInstall.toFixed(2)}) below target ($${benchmarks.minRevenuePerInstall.toFixed(2)})`,
        metrics: {
          revenuePerInstall: summary.avgRevenuePerInstall,
        },
      })
    );
  }
  
  // Rule 4: If LTV > +20% vs baseline → scale traffic
  const baselineVariant = await findBaselineVariant(variant);
  if (baselineVariant) {
    const comparison = await compareASOVariants(
      baselineVariant.variantId,
      variant.variantId,
      startDate,
      endDate
    );
    
    if (
      comparison.improvements.revenuePerInstall > benchmarks.ltvImprovementThreshold
    ) {
      actions.push(
        await createOptimizationAction({
          variantId: variant.variantId,
          actionType: "SCALE_TRAFFIC",
          reason: `LTV improvement (+${comparison.improvements.revenuePerInstall.toFixed(1)}%) above threshold (+${benchmarks.ltvImprovementThreshold}%)`,
          metrics: {
            ltvImprovement: comparison.improvements.revenuePerInstall,
          },
        })
      );
    }
  }
  
  // If no issues found, log success
  if (actions.length === 0) {
    logger.info(`Variant ${variant.variantId} performing within benchmarks`);
  }
  
  return actions;
}

/**
 * Create an optimization action
 */
async function createOptimizationAction(
  action: Omit<ASOOptimizationAction, "actionId" | "executed" | "createdAt">
): Promise<ASOOptimizationAction> {
  const actionId = db.collection("aso_optimization_actions").doc().id;
  const now = Timestamp.now();
  
  const newAction: ASOOptimizationAction = {
    ...action,
    actionId,
    executed: false,
    createdAt: now,
  };
  
  await db.collection("aso_optimization_actions").doc(actionId).set(newAction);
  
  logger.info(`Created optimization action: ${action.actionType}`, {
    variantId: action.variantId,
    reason: action.reason,
  });
  
  return newAction;
}

/**
 * Execute an optimization action
 */
export async function executeOptimizationAction(
  action: ASOOptimizationAction
): Promise<void> {
  if (action.executed) {
    logger.warn(`Action ${action.actionId} already executed`);
    return;
  }
  
  logger.info(`Executing optimization action: ${action.actionType}`, {
    variantId: action.variantId,
    reason: action.reason,
  });
  
  switch (action.actionType) {
    case "ROTATE_SCREENSHOTS":
      await rotateScreenshots(action.variantId);
      break;
    
    case "ROTATE_MESSAGING":
      await rotateMessaging(action.variantId);
      break;
    
    case "ARCHIVE_VARIANT":
      await archiveASOVariant(action.variantId);
      break;
    
    case "SCALE_TRAFFIC":
      await scaleTraffic(action.variantId);
      break;
    
    case "PAUSE_VARIANT":
      await updateASOVariant(action.variantId, { status: "PAUSED" });
      break;
    
    case "NO_ACTION":
      // Nothing to do
      break;
  }
  
  // Mark action as executed
  await db.collection("aso_optimization_actions").doc(action.actionId).update({
    executed: true,
    executedAt: Timestamp.now(),
  });
  
  logger.info(`Optimization action executed: ${action.actionType}`, {
    variantId: action.variantId,
  });
}

/**
 * Rotate screenshots for a variant
 * Creates a notification for admin to upload new screenshots
 */
async function rotateScreenshots(variantId: string): Promise<void> {
  const variant = await getASOVariant(variantId);
  if (!variant) {
    throw new Error(`Variant not found: ${variantId}`);
  }
  
  // Create admin notification
  await db.collection("admin_notifications").add({
    type: "ASO_ROTATE_SCREENSHOTS",
    variantId,
    platform: variant.platform,
    title: "Screenshot Rotation Needed",
    message: `Variant "${variant.title}" needs new screenshots due to low CVR`,
    priority: "HIGH",
    status: "PENDING",
    createdAt: Timestamp.now(),
  });
  
  // Pause variant until new screenshots are uploaded
  await updateASOVariant(variantId, { status: "PAUSED" });
  
  logger.info(`Scheduled screenshot rotation for variant ${variantId}`);
}

/**
 * Rotate messaging for a variant
 * Creates a notification for admin to update title/description
 */
async function rotateMessaging(variantId: string): Promise<void> {
  const variant = await getASOVariant(variantId);
  if (!variant) {
    throw new Error(`Variant not found: ${variantId}`);
  }
  
  // Create admin notification
  await db.collection("admin_notifications").add({
    type: "ASO_ROTATE_MESSAGING",
    variantId,
    platform: variant.platform,
    title: "Messaging Rotation Needed",
    message: `Variant "${variant.title}" needs updated messaging due to low pay rate`,
    priority: "HIGH",
    status: "PENDING",
    createdAt: Timestamp.now(),
  });
  
  // Pause variant until new messaging is provided
  await updateASOVariant(variantId, { status: "PAUSED" });
  
  logger.info(`Scheduled messaging rotation for variant ${variantId}`);
}

/**
 * Scale traffic for a high-performing variant
 * Integrates with PACK 356 (Paid Acquisition)
 */
async function scaleTraffic(variantId: string): Promise<void> {
  const variant = await getASOVariant(variantId);
  if (!variant) {
    throw new Error(`Variant not found: ${variantId}`);
  }
  
  // Create notification for PACK 356 integration
  await db.collection("traffic_scaling_requests").add({
    variantId,
    platform: variant.platform,
    targetCountries: variant.targetCountries || [],
    scalingFactor: 1.5, // Increase by 50%
    reason: "High-performing ASO variant",
    status: "PENDING",
    createdAt: Timestamp.now(),
  });
  
  // Increase traffic allocation for this variant
  const currentAllocation = variant.trafficAllocation || 100;
  const newAllocation = Math.min(currentAllocation * 1.5, 100);
  
  await updateASOVariant(variantId, {
    trafficAllocation: newAllocation,
  });
  
  logger.info(`Scaled traffic for variant ${variantId}`, {
    oldAllocation: currentAllocation,
    newAllocation,
  });
}

/**
 * Get benchmarks for a variant
 */
async function getBenchmarksForVariant(variant: ASOVariant): Promise<ASOBenchmark> {
  // Try to get specific benchmarks for platform + country
  if (variant.targetCountries && variant.targetCountries.length > 0) {
    const country = variant.targetCountries[0];
    const benchmarkDoc = await db
      .collection("aso_benchmarks")
      .doc(`${variant.platform}_${country}`)
      .get();
    
    if (benchmarkDoc.exists) {
      return benchmarkDoc.data() as ASOBenchmark;
    }
  }
  
  // Fall back to platform defaults
  const platformBenchmarkDoc = await db
    .collection("aso_benchmarks")
    .doc(variant.platform)
    .get();
  
  if (platformBenchmarkDoc.exists) {
    return platformBenchmarkDoc.data() as ASOBenchmark;
  }
  
  // Return hardcoded defaults if no benchmarks exist
  return {
    platform: variant.platform,
    country: "DEFAULT",
    minStoreCVR: 0.25, // 25% minimum store CVR
    minPayRate: 0.012, // 1.2% minimum pay rate
    minRevenuePerInstall: 0.50, // $0.50 minimum revenue per install
    ltvImprovementThreshold: 20, // 20% improvement to scale
    rotateScreenshotsAfterDays: 7,
    updatedAt: Timestamp.now(),
  };
}

/**
 * Find baseline variant for comparison
 */
async function findBaselineVariant(variant: ASOVariant): Promise<ASOVariant | null> {
  // Look for a baseline variant with the same platform and targeting
  const variantsSnapshot = await db
    .collection("aso_variants")
    .where("platform", "==", variant.platform)
    .where("status", "==", "ACTIVE")
    .get();
  
  // Find the oldest active variant (assumed to be baseline)
  let baselineVariant: ASOVariant | null = null;
  let oldestDate = Date.now();
  
  for (const doc of variantsSnapshot.docs) {
    const v = doc.data() as ASOVariant;
    
    if (v.variantId === variant.variantId) {
      continue; // Skip self
    }
    
    const createdAt = v.createdAt.toMillis();
    if (createdAt < oldestDate) {
      oldestDate = createdAt;
      baselineVariant = v;
    }
  }
  
  return baselineVariant;
}

/**
 * Determine if an action should be auto-executed
 */
function shouldAutoExecute(action: ASOOptimizationAction): boolean {
  switch (action.actionType) {
    case "ROTATE_SCREENSHOTS":
    case "ROTATE_MESSAGING":
      return true; // Auto-create notifications and pause
    
    case "ARCHIVE_VARIANT":
      return true; // Auto-archive poor performers
    
    case "SCALE_TRAFFIC":
      return false; // Require manual approval
    
    case "PAUSE_VARIANT":
      return true; // Auto-pause if needed
    
    default:
      return false;
  }
}

/**
 * Set benchmarks for a platform/country
 */
export async function setBenchmarks(
  benchmark: Omit<ASOBenchmark, "updatedAt">
): Promise<void> {
  const docId = benchmark.country === "DEFAULT"
    ? benchmark.platform
    : `${benchmark.platform}_${benchmark.country}`;
  
  await db.collection("aso_benchmarks").doc(docId).set({
    ...benchmark,
    updatedAt: Timestamp.now(),
  });
  
  logger.info(`Set ASO benchmarks for ${docId}`, benchmark);
}

/**
 * Get pending optimization actions
 */
export async function getPendingActions(
  variantId?: string
): Promise<ASOOptimizationAction[]> {
  let query = db
    .collection("aso_optimization_actions")
    .where("executed", "==", false) as Query;
  
  if (variantId) {
    query = query.where("variantId", "==", variantId);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as ASOOptimizationAction);
}

/**
 * Get optimization history for a variant
 */
export async function getOptimizationHistory(
  variantId: string,
  limit: number = 50
): Promise<ASOOptimizationAction[]> {
  const snapshot = await db
    .collection("aso_optimization_actions")
    .where("variantId", "==", variantId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ASOOptimizationAction);
}
