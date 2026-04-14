import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 361 - Real-Time System Health Monitoring
 * Monitors chat, wallet, events, AI, video calls, and panic button
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { HttpsError, auth, onCall, timestamp, logger, onSchedule } from './runtime';

// ============================================
// TYPES
// ============================================

export interface SystemMetrics {
  chatDeliveryTimeMs: number;
  walletTransactionTimeMs: number;
  eventCheckoutTimeMs: number;
  aiResponseTimeMs: number;
  videoCallPacketLoss: number;
  panicButtonProcessingTimeMs: number;
  timestamp: number;
}

export interface AlertThresholds {
  maxLatencyMs: number;
  maxErrorRate: number;
  maxPacketLoss: number;
  maxWalletFailureRate: number;
}

export interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "critical";
  metrics: Partial<SystemMetrics>;
  issues: string[];
  timestamp: number;
}

export interface PerformanceAlert {
  service: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: "warning" | "critical";
  message: string;
  timestamp: number;
}

// ============================================
// CONFIGURATION
// ============================================

const ALERT_THRESHOLDS: AlertThresholds = {
  maxLatencyMs: 400,
  maxErrorRate: 0.01, // 1%
  maxPacketLoss: 0.02, // 2%
  maxWalletFailureRate: 0.002, // 0.2%
};

const MONITORING_SERVICES = [
  "chat",
  "wallet",
  "events",
  "ai",
  "videoCalls",
  "panicButton",
];

// ============================================
// METRICS COLLECTION
// ============================================

/**
 * Track chat delivery time
 */
export const trackChatDelivery = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const deliveryTime = data.deliveredAt - data.sentAt;
    
    await recordMetric("chatDeliveryTimeMs", deliveryTime);
    
    if (deliveryTime > ALERT_THRESHOLDS.maxLatencyMs) {
      await sendAlert(
        "chat",
        "chatDeliveryTimeMs",
        deliveryTime,
        ALERT_THRESHOLDS.maxLatencyMs,
        "critical"
      );
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Track wallet transaction
 */
export const trackWalletTransaction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const transactionTime = data.completedAt - data.startedAt;
    
    await recordMetric("walletTransactionTimeMs", transactionTime);
    
    // Track failure rate
    const db = admin.firestore();
    await db.collection("walletMetrics").add({
      transactionId: data.transactionId,
      success: data.success,
      transactionTime,
      timestamp: Date.now(),
    });
    
    // Check failure rate
    await checkWalletFailureRate();
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Track event checkout
 */
export const trackEventCheckout = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const checkoutTime = data.completedAt - data.startedAt;
    
    await recordMetric("eventCheckoutTimeMs", checkoutTime);
    
    if (checkoutTime > ALERT_THRESHOLDS.maxLatencyMs) {
      await sendAlert(
        "events",
        "eventCheckoutTimeMs",
        checkoutTime,
        ALERT_THRESHOLDS.maxLatencyMs,
        "warning"
      );
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Track AI response time
 */
export const trackAiResponse = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const responseTime = data.completedAt - data.startedAt;
    
    await recordMetric("aiResponseTimeMs", responseTime);
    
    if (responseTime > ALERT_THRESHOLDS.maxLatencyMs) {
      await sendAlert(
        "ai",
        "aiResponseTimeMs",
        responseTime,
        ALERT_THRESHOLDS.maxLatencyMs,
        "warning"
      );
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Track video call quality
 */
export const trackVideoCallQuality = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    await recordMetric("videoCallPacketLoss", data.packetLoss);
    
    const db = admin.firestore();
    await db.collection("callQualityMetrics").add({
      callId: data.callId,
      packetLoss: data.packetLoss,
      jitter: data.jitter,
      latency: data.latency,
      timestamp: Date.now(),
    });
    
    if (data.packetLoss > ALERT_THRESHOLDS.maxPacketLoss) {
      await sendAlert(
        "videoCalls",
        "packetLoss",
        data.packetLoss,
        ALERT_THRESHOLDS.maxPacketLoss,
        "warning"
      );
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Track panic button processing
 */
export const trackPanicButton = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const processingTime = data.processedAt - data.triggeredAt;
    
    await recordMetric("panicButtonProcessingTimeMs", processingTime);
    
    // Panic button is critical - immediate alert if slow
    if (processingTime > 100) {
      // 100ms threshold for panic button
      await sendAlert(
        "panicButton",
        "processingTime",
        processingTime,
        100,
        "critical"
      );
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Record metric
 */
async function recordMetric(
  metricName: string,
  value: number
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection("systemMetrics").add({
    metric: metricName,
    value,
    timestamp: Date.now(),
  });
  
  // Update rolling average
  const avgDoc = db.collection("metricsAverages").doc(metricName);
  const avgData = await avgDoc.get();
  
  if (avgData.exists) {
    const currentAvg = avgData.data()?.average || 0;
    const count = avgData.data()?.count || 0;
    const newAvg = (currentAvg * count + value) / (count + 1);
    
    await avgDoc.update({
      average: newAvg,
      count: count + 1,
      lastValue: value,
      lastUpdated: Date.now(),
    });
  } else {
    await avgDoc.set({
      average: value,
      count: 1,
      lastValue: value,
      lastUpdated: Date.now(),
    });
  }
}

// ============================================
// HEALTH CHECKS
// ============================================

/**
 * Check wallet failure rate
 */
async function checkWalletFailureRate(): Promise<void> {
  const db = admin.firestore();
  
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  
  const recentTransactions = await db
    .collection("walletMetrics")
    .where("timestamp", ">", fiveMinutesAgo)
    .get();
  
  if (recentTransactions.empty) {
    return;
  }
  
  let failures = 0;
  recentTransactions.forEach((doc) => {
    if (!doc.data().success) {
      failures++;
    }
  });
  
  const failureRate = failures / recentTransactions.size;
  
  if (failureRate > ALERT_THRESHOLDS.maxWalletFailureRate) {
    await sendAlert(
      "wallet",
      "failureRate",
      failureRate,
      ALERT_THRESHOLDS.maxWalletFailureRate,
      "critical"
    );
  }
}

/**
 * Run comprehensive health check
 */
export const runHealthCheck = onSchedule("every 1 minutes", async (event) => {
    console.log("🏥 Running health check...");
    
    const db = admin.firestore();
    const healthStatuses: HealthStatus[] = [];
    
    for (const service of MONITORING_SERVICES) {
      const status = await checkServiceHealth(service);
      healthStatuses.push(status);
      
      // Save status
      await db.collection("healthStatus").doc(service).set(status);
      
      if (status.status === "critical") {
        console.error(`🚨 CRITICAL: ${service} is unhealthy!`);
      }
    }
    
    // Save overall health
    const criticalServices = healthStatuses.filter(
      (s) => s.status === "critical"
    );
    const degradedServices = healthStatuses.filter(
      (s) => s.status === "degraded"
    );
    
    await db.collection("systemHealth").doc("current").set({
      overallStatus:
        criticalServices.length > 0
          ? "critical"
          : degradedServices.length > 0
          ? "degraded"
          : "healthy",
      services: healthStatuses,
      timestamp: Date.now(),
    });
    
    console.log("✅ Health check complete");
  });

/**
 * Check service health
 */
async function checkServiceHealth(service: string): Promise<HealthStatus> {
  const db = admin.firestore();
  
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  
  const metricNames = getMetricsForService(service);
  const metrics: Partial<SystemMetrics> = {};
  const issues: string[] = [];
  
  for (const metricName of metricNames) {
    const avgDoc = await db
      .collection("metricsAverages")
      .doc(metricName)
      .get();
    
    if (!avgDoc.exists) {
      continue;
    }
    
    const data = avgDoc.data();
    const average = data?.average || 0;
    
    metrics[metricName as keyof SystemMetrics] = average;
    
    // Check thresholds
    if (
      metricName.includes("Time") &&
      average > ALERT_THRESHOLDS.maxLatencyMs
    ) {
      issues.push(`High ${metricName}: ${average.toFixed(0)}ms`);
    }
    
    if (metricName.includes("PacketLoss") && average > ALERT_THRESHOLDS.maxPacketLoss) {
      issues.push(`High packet loss: ${(average * 100).toFixed(1)}%`);
    }
  }
  
  // Check error rate
  const errorsSnapshot = await db
    .collection("errors")
    .where("service", "==", service)
    .where("timestamp", ">", fiveMinutesAgo)
    .get();
  
  const requestsSnapshot = await db
    .collection("requests")
    .where("service", "==", service)
    .where("timestamp", ">", fiveMinutesAgo)
    .get();
  
  const errorRate =
    requestsSnapshot.size > 0
      ? errorsSnapshot.size / requestsSnapshot.size
      : 0;
  
  if (errorRate > ALERT_THRESHOLDS.maxErrorRate) {
    issues.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
  }
  
  // Determine status
  const status: HealthStatus["status"] =
    issues.length > 2
      ? "critical"
      : issues.length > 0
      ? "degraded"
      : "healthy";
  
  return {
    service,
    status,
    metrics,
    issues,
    timestamp: Date.now(),
  };
}

/**
 * Get metrics for service
 */
function getMetricsForService(service: string): string[] {
  const metricsMap: Record<string, string[]> = {
    chat: ["chatDeliveryTimeMs"],
    wallet: ["walletTransactionTimeMs"],
    events: ["eventCheckoutTimeMs"],
    ai: ["aiResponseTimeMs"],
    videoCalls: ["videoCallPacketLoss"],
    panicButton: ["panicButtonProcessingTimeMs"],
  };
  
  return metricsMap[service] || [];
}

// ============================================
// ALERTS
// ============================================

/**
 * Send performance alert
 */
async function sendAlert(
  service: string,
  metric: string,
  currentValue: number,
  threshold: number,
  severity: "warning" | "critical"
): Promise<void> {
  const db = admin.firestore();
  
  const alert: PerformanceAlert = {
    service,
    metric,
    currentValue,
    threshold,
    severity,
    message: `${service} ${metric} exceeded threshold: ${currentValue.toFixed(2)} > ${threshold}`,
    timestamp: Date.now(),
  };
  
  await db.collection("systemAlerts").add({
    type: "performance",
    ...alert,
    resolved: false,
  });
  
  console.log(`🚨 ${severity.toUpperCase()}: ${alert.message}`);
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Get current system health
 */
export const getSystemHealth = functions.https.onCall(async (request) => {
  const data = request.data;
    const db = admin.firestore();
    
    const healthDoc = await db
      .collection("systemHealth")
      .doc("current")
      .get();
    
    if (!healthDoc.exists) {
      return {
        overallStatus: "unknown",
        services: [],
      };
    }
    
    return healthDoc.data();
  }
);

/**
 * Get metrics history
 */
export const getMetricsHistory = functions.https.onCall(async (request) => {
  const data = request.data;
    const db = admin.firestore();
    
    const endTime = data.endTime || Date.now();
    const startTime = data.startTime || endTime - 60 * 60 * 1000; // 1 hour
    
    const metricsSnapshot = await db
      .collection("systemMetrics")
      .where("metric", "==", data.metric)
      .where("timestamp", ">=", startTime)
      .where("timestamp", "<=", endTime)
      .orderBy("timestamp", "desc")
      .limit(1000)
      .get();
    
    const metrics = metricsSnapshot.docs.map((doc) => doc.data());
    
    console.log('Scheduled job result:', {
      metric: data.metric,
      count: metrics.length,
      values: metrics,
    });

    
    return;
  }
);

/**
 * Get active alerts
 */
export const getActiveAlerts = functions.https.onCall(async (request) => {
  const data = request.data;
    const db = admin.firestore();
    
    const alertsSnapshot = await db
      .collection("systemAlerts")
      .where("resolved", "==", false)
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    
    return alertsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }
);

/**
 * Resolve alert
 */
export const resolveAlert = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    await db.collection("systemAlerts").doc(data.alertId).update({
      resolved: true,
      resolvedAt: Date.now(),
      resolvedBy: request.auth.uid,
    });
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  }
);

/**
 * Get performance dashboard data
 */
export const getDashboardData = functions.https.onCall(async (request) => {
  const data = request.data;
    const db = admin.firestore();
    
    // Get latest metrics averages
    const metricsSnapshot = await db.collection("metricsAverages").get();
    
    const metrics: Record<string, any> = {};
    metricsSnapshot.forEach((doc) => {
      metrics[doc.id] = doc.data();
    });
    
    // Get health statuses
    const healthSnapshot = await db.collection("healthStatus").get();
    
    const healthStatuses: Record<string, any> = {};
    healthSnapshot.forEach((doc) => {
      healthStatuses[doc.id] = doc.data();
    });
    
    // Get recent alerts
    const alertsSnapshot = await db
      .collection("systemAlerts")
      .where("resolved", "==", false)
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();
    
    const alerts = alertsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return {
      metrics,
      healthStatuses,
      alerts,
      timestamp: Date.now(),
    };
  }
);

// ============================================
// CLEANUP
// ============================================

/**
 * Clean up old metrics
 */
export const cleanupOldMetrics = onSchedule("0 3 * * *", async (event) => {
    const db = admin.firestore();
    
    console.log("🗑️ Cleaning up old metrics...");
    
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    const oldMetrics = await db
      .collection("systemMetrics")
      .where("timestamp", "<", sevenDaysAgo)
      .limit(1000)
      .get();
    
    if (oldMetrics.empty) {
      console.log("✅ No old metrics to clean up");
      return;
    }
    
    const batch = db.batch();
    oldMetrics.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`✅ Cleaned up ${oldMetrics.size} old metrics`);
  });

























