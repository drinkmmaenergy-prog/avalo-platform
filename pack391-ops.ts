/**
 * PACK 391 — Analytics & Real-Time Operations Dashboard
 * 
 * Live metrics and operational visibility for launch monitoring.
 * Tracks: active users, paying users, token velocity, fraud alerts,
 * payout queue, support queue, panic button activations
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Real-Time Metrics
interface LiveMetrics {
  timestamp: FirebaseFirestore.Timestamp;
  activeUsers: number;
  payingUsers: number;
  tokenVelocity: {
    earned: number;
    spent: number;
    net: number;
    transactionsPerMinute: number;
  };
  fraudAlerts: {
    active: number;
    critical: number;
    resolvedToday: number;
  };
  payoutQueue: {
    pending: number;
    processing: number;
    failed: number;
    totalAmount: number;
  };
  supportQueue: {
    open: number;
    urgent: number;
    avgResponseTime: number;
  };
  panicActivations: {
    last24h: number;
    active: number;
  };
  systemHealth: {
    status: "healthy" | "degraded" | "critical";
    services: {
      name: string;
      status: "up" | "down" | "degraded";
    }[];
  };
}

interface MarketLaunchControl {
  country: string;
  launchStatus: "not_started" | "influencer_only" | "soft_launch" | "public" | "paused";
  trafficLimit: number | null;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  marketingEnabled: boolean;
  currentUsers: number;
  lastUpdated: FirebaseFirestore.Timestamp;
}

/**
 * Update live metrics (runs every minute)
 */
export const pack391_updateLiveMetrics = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "2GB"
  })
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    try {
      console.log("📊 Updating live metrics...");
      
      const metrics = await calculateLiveMetrics();
      
      // Store current metrics
      await db.collection("metrics").doc("live").set({
        ...metrics,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Also store in time-series for historical analysis
      await db.collection("metrics").doc("timeSeries").collection("minutes").add({
        ...metrics,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Check for critical alerts
      await checkCriticalThresholds(metrics);
      
      console.log(`✅ Live metrics updated - Active: ${metrics.activeUsers}, Paying: ${metrics.payingUsers}`);
      
      return { success: true, metrics };
    } catch (error) {
      console.error("Live metrics update error:", error);
      throw error;
    }
  });

/**
 * Calculate live metrics
 */
async function calculateLiveMetrics(): Promise<LiveMetrics> {
  const now = Date.now();
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  // Active users (active in last 5 minutes)
  const activeUsersSnapshot = await db
    .collection("users")
    .where("lastActive", ">", admin.firestore.Timestamp.fromDate(fiveMinutesAgo))
    .count()
    .get();
  
  const activeUsers = activeUsersSnapshot.data().count;
  
  // Paying users (have active subscription or tokens)
  const payingUsersSnapshot = await db
    .collection("users")
    .where("isPaying", "==", true)
    .count()
    .get();
  
  const payingUsers = payingUsersSnapshot.data().count;
  
  // Token velocity
  const tokenVelocity = await calculateTokenVelocity();
  
  // Fraud alerts
  const fraudAlerts = await getFraudAlertStats();
  
  // Payout queue
  const payoutQueue = await getPayoutQueueStats();
  
  // Support queue
  const supportQueue = await getSupportQueueStats();
  
  // Panic activations
  const panicActivations = await getPanicActivationStats(oneDayAgo);
  
  // System health
  const systemHealth = await getSystemHealth();
  
  return {
    timestamp: admin.firestore.Timestamp.now(),
    activeUsers,
    payingUsers,
    tokenVelocity,
    fraudAlerts,
    payoutQueue,
    supportQueue,
    panicActivations,
    systemHealth
  };
}

/**
 * Calculate token velocity
 */
async function calculateTokenVelocity(): Promise<{
  earned: number;
  spent: number;
  net: number;
  transactionsPerMinute: number;
}> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  
  try {
    const recentTransactions = await db
      .collection("tokenTransactions")
      .where("createdAt", ">", admin.firestore.Timestamp.fromDate(oneMinuteAgo))
      .get();
    
    let earned = 0;
    let spent = 0;
    
    for (const doc of recentTransactions.docs) {
      const data = doc.data();
      if (data.type === "earn") {
        earned += data.amount || 0;
      } else if (data.type === "spend") {
        spent += data.amount || 0;
      }
    }
    
    return {
      earned,
      spent,
      net: earned - spent,
      transactionsPerMinute: recentTransactions.size
    };
  } catch (error) {
    console.error("Token velocity calculation error:", error);
    return { earned: 0, spent: 0, net: 0, transactionsPerMinute: 0 };
  }
}

/**
 * Get fraud alert statistics
 */
async function getFraudAlertStats(): Promise<{
  active: number;
  critical: number;
  resolvedToday: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    const [activeAlerts, criticalAlerts, resolvedToday] = await Promise.all([
      db.collection("fraudAlerts").where("status", "==", "active").count().get(),
      db.collection("fraudAlerts")
        .where("status", "==", "active")
        .where("severity", "==", "critical")
        .count()
        .get(),
      db.collection("fraudAlerts")
        .where("status", "==", "resolved")
        .where("resolvedAt", ">", admin.firestore.Timestamp.fromDate(today))
        .count()
        .get()
    ]);
    
    return {
      active: activeAlerts.data().count,
      critical: criticalAlerts.data().count,
      resolvedToday: resolvedToday.data().count
    };
  } catch (error) {
    console.error("Fraud alert stats error:", error);
    return { active: 0, critical: 0, resolvedToday: 0 };
  }
}

/**
 * Get payout queue statistics
 */
async function getPayoutQueueStats(): Promise<{
  pending: number;
  processing: number;
  failed: number;
  totalAmount: number;
}> {
  try {
    const [pending, processing, failed] = await Promise.all([
      db.collection("payouts").where("status", "==", "pending").get(),
      db.collection("payouts").where("status", "==", "processing").get(),
      db.collection("payouts").where("status", "==", "failed").get()
    ]);
    
    let totalAmount = 0;
    pending.docs.forEach(doc => {
      totalAmount += doc.data().amount || 0;
    });
    
    return {
      pending: pending.size,
      processing: processing.size,
      failed: failed.size,
      totalAmount
    };
  } catch (error) {
    console.error("Payout queue stats error:", error);
    return { pending: 0, processing: 0, failed: 0, totalAmount: 0 };
  }
}

/**
 * Get support queue statistics
 */
async function getSupportQueueStats(): Promise<{
  open: number;
  urgent: number;
  avgResponseTime: number;
}> {
  try {
    const [openTickets, urgentTickets] = await Promise.all([
      db.collection("supportTickets").where("status", "==", "open").count().get(),
      db.collection("supportTickets")
        .where("status", "==", "open")
        .where("priority", "==", "urgent")
        .count()
        .get()
    ]);
    
    // Calculate average response time (simplified)
    const avgResponseTime = 15; // minutes - would calculate from actual data
    
    return {
      open: openTickets.data().count,
      urgent: urgentTickets.data().count,
      avgResponseTime
    };
  } catch (error) {
    console.error("Support queue stats error:", error);
    return { open: 0, urgent: 0, avgResponseTime: 0 };
  }
}

/**
 * Get panic activation statistics
 */
async function getPanicActivationStats(since: Date): Promise<{
  last24h: number;
  active: number;
}> {
  try {
    const [recentActivations, activeActivations] = await Promise.all([
      db.collection("panicEscalation")
        .where("createdAt", ">", admin.firestore.Timestamp.fromDate(since))
        .count()
        .get(),
      db.collection("panicEscalation")
        .where("status", "==", "active")
        .count()
        .get()
    ]);
    
    return {
      last24h: recentActivations.data().count,
      active: activeActivations.data().count
    };
  } catch (error) {
    console.error("Panic activation stats error:", error);
    return { last24h: 0, active: 0 };
  }
}

/**
 * Get system health status
 */
async function getSystemHealth(): Promise<{
  status: "healthy" | "degraded" | "critical";
  services: { name: string; status: "up" | "down" | "degraded" }[];
}> {
  try {
    const servicesSnapshot = await db
      .collection("system")
      .doc("scaling")
      .collection("services")
      .get();
    
    const services = servicesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.serviceId,
        status: mapServiceStatus(data.status)
      };
    });
    
    // Determine overall status
    const criticalCount = services.filter(s => s.status === "down").length;
    const degradedCount = services.filter(s => s.status === "degraded").length;
    
    let overallStatus: "healthy" | "degraded" | "critical" = "healthy";
    if (criticalCount > 0) {
      overallStatus = "critical";
    } else if (degradedCount > 0) {
      overallStatus = "degraded";
    }
    
    return { status: overallStatus, services };
  } catch (error) {
    console.error("System health check error:", error);
    return {
      status: "critical",
      services: []
    };
  }
}

function mapServiceStatus(status: string): "up" | "down" | "degraded" {
  switch (status) {
    case "healthy":
      return "up";
    case "degraded":
      return "degraded";
    case "critical":
    case "isolated":
      return "down";
    default:
      return "degraded";
  }
}

/**
 * Check critical thresholds and alert
 */
async function checkCriticalThresholds(metrics: LiveMetrics): Promise<void> {
  const alerts: string[] = [];
  
  // Critical fraud alerts
  if (metrics.fraudAlerts.critical > 5) {
    alerts.push(`${metrics.fraudAlerts.critical} critical fraud alerts`);
  }
  
  // High payout failure rate
  if (metrics.payoutQueue.failed > 10) {
    alerts.push(`${metrics.payoutQueue.failed} failed payouts`);
  }
  
  // Support queue overload
  if (metrics.supportQueue.urgent > 50) {
    alerts.push(`${metrics.supportQueue.urgent} urgent support tickets`);
  }
  
  // System health critical
  if (metrics.systemHealth.status === "critical") {
    alerts.push("System health critical");
  }
  
  // Create alerts if needed
  if (alerts.length > 0) {
    await db.collection("alerts").add({
      type: "ops_threshold_exceeded",
      severity: "critical",
      alerts,
      metrics,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.error(`⚠️ Critical thresholds exceeded: ${alerts.join(", ")}`);
  }
}

/**
 * Get live metrics (API endpoint)
 */
export const pack391_getLiveMetrics = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    try {
      const metricsDoc = await db.collection("metrics").doc("live").get();
      
      if (!metricsDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "No metrics available yet"
        );
      }
      
      return { metrics: metricsDoc.data() };
    } catch (error) {
      console.error("Get live metrics error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get metrics"
      );
    }
  });

/**
 * Get historical metrics
 */
export const pack391_getHistoricalMetrics = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    const { timeRange = "1h" } = data;
    
    try {
      let since: Date;
      
      switch (timeRange) {
        case "1h":
          since = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case "24h":
          since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          since = new Date(Date.now() - 60 * 60 * 1000);
      }
      
      const metricsSnapshot = await db
        .collection("metrics")
        .doc("timeSeries")
        .collection("minutes")
        .where("timestamp", ">", admin.firestore.Timestamp.fromDate(since))
        .orderBy("timestamp", "asc")
        .get();
      
      const metrics = metricsSnapshot.docs.map(doc => ({
        timestamp: doc.data().timestamp.toDate().toISOString(),
        ...doc.data()
      }));
      
      return { metrics, count: metrics.length };
    } catch (error) {
      console.error("Get historical metrics error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get metrics"
      );
    }
  });

/**
 * Market launch control - manage country rollouts
 */
export const pack391_updateMarketControl = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    const { country, config } = data;
    
    if (!country || !config) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "country and config required"
      );
    }
    
    try {
      const marketControl: MarketLaunchControl = {
        country,
        launchStatus: config.launchStatus || "not_started",
        trafficLimit: config.trafficLimit || null,
        paymentsEnabled: config.paymentsEnabled ?? false,
        payoutsEnabled: config.payoutsEnabled ?? false,
        marketingEnabled: config.marketingEnabled ?? false,
        currentUsers: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp() as FirebaseFirestore.Timestamp
      };
      
      await db
        .collection("marketControl")
        .doc(country)
        .set(marketControl, { merge: true });
      
      // Log the change
      await db.collection("marketControl").doc(country).collection("history").add({
        config: marketControl,
        updatedBy: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Market control updated for ${country}: ${config.launchStatus}`);
      
      return {
        success: true,
        country,
        config: marketControl
      };
    } catch (error) {
      console.error("Market control update error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to update market control"
      );
    }
  });

/**
 * Get market controls
 */
export const pack391_getMarketControls = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    try {
      const marketsSnapshot = await db.collection("marketControl").get();
      
      const markets = marketsSnapshot.docs.map(doc => ({
        country: doc.id,
        ...doc.data()
      }));
      
      return { markets };
    } catch (error) {
      console.error("Get market controls error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get market controls"
      );
    }
  });

/**
 * Ops dashboard snapshot - comprehensive operational view
 */
export const pack391_getOpsDashboard = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "1GB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    try {
      // Get all key metrics in parallel
      const [
        liveMetrics,
        activeAlerts,
        recentDeployments,
        ddosStats,
        marketControls
      ] = await Promise.all([
        db.collection("metrics").doc("live").get(),
        db.collection("alerts")
          .where("timestamp", ">", admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
          ))
          .orderBy("timestamp", "desc")
          .limit(50)
          .get(),
        db.collection("deployments")
          .orderBy("startTime", "desc")
          .limit(10)
          .get(),
        db.collection("ddosAlerts")
          .where("status", "==", "active")
          .get(),
        db.collection("marketControl").get()
      ]);
      
      return {
        liveMetrics: liveMetrics.data(),
        alerts: activeAlerts.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        deployments: recentDeployments.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ddosAlerts: ddosStats.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        markets: marketControls.docs.map(doc => ({ country: doc.id, ...doc.data() })),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Get ops dashboard error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get dashboard"
      );
    }
  });

/**
 * Cleanup old metrics data
 */
export const pack391_cleanupMetrics = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
  })
  .pubsub.schedule("every 24 hours")
  .onRun(async (context) => {
    try {
      console.log("🗑️ Cleaning up old metrics data...");
      
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Delete metrics older than 30 days
      const oldMetrics = await db
        .collection("metrics")
        .doc("timeSeries")
        .collection("minutes")
        .where("timestamp", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .limit(5000)
        .get();
      
      const batch = db.batch();
      oldMetrics.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      console.log(`✅ Cleaned up ${oldMetrics.size} old metric records`);
      
      return { success: true, deleted: oldMetrics.size };
    } catch (error) {
      console.error("Metrics cleanup error:", error);
      throw error;
    }
  });
