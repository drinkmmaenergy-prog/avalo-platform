/**
 * PACK 361 - Cost Control Engine
 * Budget monitoring, throttling, and cost optimization
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// ============================================
// TYPES
// ============================================

export interface CostControlRule {
  service: string;
  monthlyBudgetPLN: number;
  autoThrottle: boolean;
  currentSpend: number;
  throttleThreshold: number; // 0-1 (e.g., 0.8 = 80% of budget)
  alertThreshold: number; // 0-1
}

export interface ServiceCost {
  service: string;
  costPLN: number;
  units: number; // Requests, tokens, minutes, etc.
  costPerUnit: number;
  timestamp: number;
}

export interface CostMetrics {
  totalSpendPLN: number;
  periodStart: number;
  periodEnd: number;
  byService: Record<string, number>;
  costPerUser: number;
  costPerChat: number;
  costPerCall: number;
  costPerRevenuePLN: number; // Cost per 1 PLN of revenue
}

export interface ThrottleRule {
  service: string;
  enabled: boolean;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  activatedAt?: number;
  reason?: string;
}

export interface CostAlert {
  service: string;
  severity: "warning" | "critical";
  budgetUsed: number; // Percentage
  message: string;
  timestamp: number;
}

// ============================================
// CONFIGURATION
// ============================================

const COST_CONTROL_RULES: Record<string, CostControlRule> = {
  aiUsage: {
    service: "aiUsage",
    monthlyBudgetPLN: 50000,
    autoThrottle: true,
    currentSpend: 0,
    throttleThreshold: 0.8,
    alertThreshold: 0.7,
  },
  videoBandwidth: {
    service: "videoBandwidth",
    monthlyBudgetPLN: 30000,
    autoThrottle: true,
    currentSpend: 0,
    throttleThreshold: 0.8,
    alertThreshold: 0.7,
  },
  webrtcBandwidth: {
    service: "webrtcBandwidth",
    monthlyBudgetPLN: 20000,
    autoThrottle: true,
    currentSpend: 0,
    throttleThreshold: 0.8,
    alertThreshold: 0.7,
  },
  pushNotifications: {
    service: "pushNotifications",
    monthlyBudgetPLN: 5000,
    autoThrottle: true,
    currentSpend: 0,
    throttleThreshold: 0.8,
    alertThreshold: 0.7,
  },
  cloudFunctions: {
    service: "cloudFunctions",
    monthlyBudgetPLN: 15000,
    autoThrottle: false, // Critical service
    currentSpend: 0,
    throttleThreshold: 0.9,
    alertThreshold: 0.7,
  },
  firestore: {
    service: "firestore",
    monthlyBudgetPLN: 10000,
    autoThrottle: false,
    currentSpend: 0,
    throttleThreshold: 0.9,
    alertThreshold: 0.7,
  },
  storage: {
    service: "storage",
    monthlyBudgetPLN: 8000,
    autoThrottle: false,
    currentSpend: 0,
    throttleThreshold: 0.9,
    alertThreshold: 0.7,
  },
};

// Cost per unit (in PLN)
const UNIT_COSTS = {
  aiTokens: 0.00001, // Per token
  videoBandwidthGB: 0.5, // Per GB
  webrtcMinute: 0.02, // Per minute
  pushNotification: 0.00001, // Per notification
  functionInvocation: 0.0000004, // Per invocation
  firestoreRead: 0.00000036, // Per read
  firestoreWrite: 0.00000108, // Per write
  storageGB: 0.026, // Per GB per month
};

// ============================================
// COST TRACKING
// ============================================

/**
 * Track service cost
 */
export async function trackCost(
  service: string,
  units: number,
  costPerUnit: number
): Promise<void> {
  const db = admin.firestore();
  
  const costPLN = units * costPerUnit;
  
  const serviceCost: ServiceCost = {
    service,
    costPLN,
    units,
    costPerUnit,
    timestamp: Date.now(),
  };
  
  // Save cost record
  await db.collection("serviceCosts").add(serviceCost);
  
  // Update running total
  const rule = COST_CONTROL_RULES[service];
  if (rule) {
    const totalDoc = db.collection("costTotals").doc(service);
    await totalDoc.set(
      {
        service,
        currentSpend: admin.firestore.FieldValue.increment(costPLN),
        lastUpdated: Date.now(),
      },
      { merge: true }
    );
    
    // Check if throttling needed
    await checkThrottling(service);
  }
}

/**
 * Track AI usage cost
 */
export const trackAiCost = functions.https.onCall(
  async (
    data: { tokens: number; model: string },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    await trackCost("aiUsage", data.tokens, UNIT_COSTS.aiTokens);
    
    return { success: true };
  }
);

/**
 * Track bandwidth cost
 */
export const trackBandwidthCost = functions.https.onCall(
  async (
    data: { bytes: number; type: "video" | "webrtc" },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const gb = data.bytes / (1024 * 1024 * 1024);
    const service =
      data.type === "video" ? "videoBandwidth" : "webrtcBandwidth";
    
    await trackCost(service, gb, UNIT_COSTS.videoBandwidthGB);
    
    return { success: true };
  }
);

// ============================================
// THROTTLING
// ============================================

/**
 * Check if throttling needed
 */
async function checkThrottling(service: string): Promise<void> {
  const db = admin.firestore();
  const rule = COST_CONTROL_RULES[service];
  
  if (!rule || !rule.autoThrottle) {
    return;
  }
  
  // Get current spend
  const totalDoc = await db.collection("costTotals").doc(service).get();
  
  if (!totalDoc.exists) {
    return;
  }
  
  const currentSpend = totalDoc.data()?.currentSpend || 0;
  const budgetUsed = currentSpend / rule.monthlyBudgetPLN;
  
  // Alert threshold
  if (budgetUsed >= rule.alertThreshold) {
    await sendCostAlert(service, "warning", budgetUsed);
  }
  
  // Throttle threshold
  if (budgetUsed >= rule.throttleThreshold) {
    await enableThrottling(service, budgetUsed);
  }
}

/**
 * Enable throttling for service
 */
async function enableThrottling(
  service: string,
  budgetUsed: number
): Promise<void> {
  const db = admin.firestore();
  
  console.log(`⚠️ Enabling throttling for ${service} (${(budgetUsed * 100).toFixed(1)}% budget used)`);
  
  // Get current throttle rule
  const throttleDoc = await db
    .collection("throttleRules")
    .doc(service)
    .get();
  
  if (throttleDoc.exists && throttleDoc.data()?.enabled) {
    // Already throttled
    return;
  }
  
  // Define throttle limits based on service
  const throttleRule: ThrottleRule = getThrottleRule(service);
  throttleRule.enabled = true;
  throttleRule.activatedAt = Date.now();
  throttleRule.reason = `Budget ${(budgetUsed * 100).toFixed(1)}% used`;
  
  await db.collection("throttleRules").doc(service).set(throttleRule);
  
  // Send critical alert
  await sendCostAlert(service, "critical", budgetUsed);
  
  console.log(`✅ Throttling enabled for ${service}`);
}

/**
 * Get throttle rule for service
 */
function getThrottleRule(service: string): ThrottleRule {
  const rules: Record<string, ThrottleRule> = {
    aiUsage: {
      service: "aiUsage",
      enabled: false,
      maxPerMinute: 1000,
      maxPerHour: 50000,
      maxPerDay: 1000000,
    },
    videoBandwidth: {
      service: "videoBandwidth",
      enabled: false,
      maxPerMinute: 100, // 100 GB/min
      maxPerHour: 5000,
      maxPerDay: 100000,
    },
    webrtcBandwidth: {
      service: "webrtcBandwidth",
      enabled: false,
      maxPerMinute: 10000, // 10k minutes/min
      maxPerHour: 500000,
      maxPerDay: 10000000,
    },
    pushNotifications: {
      service: "pushNotifications",
      enabled: false,
      maxPerMinute: 10000,
      maxPerHour: 500000,
      maxPerDay: 10000000,
    },
  };
  
  return (
    rules[service] || {
      service,
      enabled: false,
      maxPerMinute: 1000,
      maxPerHour: 50000,
      maxPerDay: 1000000,
    }
  );
}

/**
 * Check if service is throttled
 */
export const checkThrottle = functions.https.onCall(
  async (data: { service: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const throttleDoc = await db
      .collection("throttleRules")
      .doc(data.service)
      .get();
    
    if (!throttleDoc.exists) {
      return { throttled: false };
    }
    
    const rule = throttleDoc.data() as ThrottleRule;
    
    if (!rule.enabled) {
      return { throttled: false };
    }
    
    // Check rate limits
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const costsSnapshot = await db
      .collection("serviceCosts")
      .where("service", "==", data.service)
      .where("timestamp", ">", oneDayAgo)
      .get();
    
    let unitsLastMinute = 0;
    let unitsLastHour = 0;
    let unitsLastDay = 0;
    
    costsSnapshot.forEach((doc) => {
      const cost = doc.data() as ServiceCost;
      unitsLastDay += cost.units;
      
      if (cost.timestamp > oneHourAgo) {
        unitsLastHour += cost.units;
      }
      
      if (cost.timestamp > oneMinuteAgo) {
        unitsLastMinute += cost.units;
      }
    });
    
    const throttled =
      unitsLastMinute >= rule.maxPerMinute ||
      unitsLastHour >= rule.maxPerHour ||
      unitsLastDay >= rule.maxPerDay;
    
    return {
      throttled,
      limits: {
        perMinute: {
          current: unitsLastMinute,
          max: rule.maxPerMinute,
        },
        perHour: {
          current: unitsLastHour,
          max: rule.maxPerHour,
        },
        perDay: {
          current: unitsLastDay,
          max: rule.maxPerDay,
        },
      },
    };
  }
);

/**
 * Disable throttling (admin only)
 */
export const disableThrottling = functions.https.onCall(
  async (data: { service: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const isAdmin = userDoc.data()?.role === "admin";
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    await db.collection("throttleRules").doc(data.service).update({
      enabled: false,
    });
    
    console.log(`✅ Throttling disabled for ${data.service}`);
    
    return { success: true };
  }
);

// ============================================
// COST ALERTS
// ============================================

/**
 * Send cost alert
 */
async function sendCostAlert(
  service: string,
  severity: CostAlert["severity"],
  budgetUsed: number
): Promise<void> {
  const db = admin.firestore();
  
  const alert: CostAlert = {
    service,
    severity,
    budgetUsed,
    message: `${service} has used ${(budgetUsed * 100).toFixed(1)}% of monthly budget`,
    timestamp: Date.now(),
  };
  
  await db.collection("systemAlerts").add({
    type: "cost",
    ...alert,
    resolved: false,
  });
  
  console.log(
    `🚨 ${severity.toUpperCase()}: ${alert.message}`
  );
}

// ============================================
// COST METRICS & REPORTS
// ============================================

/**
 * Calculate cost metrics
 */
export const getCostMetrics = functions.https.onCall(
  async (
    data: { startDate?: number; endDate?: number },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    const endDate = data.endDate || Date.now();
    const startDate = data.startDate || endDate - 30 * 24 * 60 * 60 * 1000; // 30 days
    
    // Get all costs in period
    const costsSnapshot = await db
      .collection("serviceCosts")
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .get();
    
    let totalSpendPLN = 0;
    const byService: Record<string, number> = {};
    
    costsSnapshot.forEach((doc) => {
      const cost = doc.data() as ServiceCost;
      totalSpendPLN += cost.costPLN;
      byService[cost.service] = (byService[cost.service] || 0) + cost.costPLN;
    });
    
    // Get user count
    const usersSnapshot = await db.collection("users").get();
    const userCount = usersSnapshot.size || 1;
    
    // Get chat count
    const chatsSnapshot = await db
      .collection("chats")
      .where("createdAt", ">=", startDate)
      .where("createdAt", "<=", endDate)
      .get();
    const chatCount = chatsSnapshot.size || 1;
    
    // Get call count
    const callsSnapshot = await db
      .collection("calls")
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .get();
    const callCount = callsSnapshot.size || 1;
    
    // Get revenue
    const revenueSnapshot = await db
      .collection("payments")
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .where("status", "==", "completed")
      .get();
    
    let totalRevenuePLN = 0;
    revenueSnapshot.forEach((doc) => {
      const payment = doc.data();
      totalRevenuePLN += payment.amountPLN || 0;
    });
    
    const metrics: CostMetrics = {
      totalSpendPLN,
      periodStart: startDate,
      periodEnd: endDate,
      byService,
      costPerUser: totalSpendPLN / userCount,
      costPerChat: totalSpendPLN / chatCount,
      costPerCall: totalSpendPLN / callCount,
      costPerRevenuePLN: totalRevenuePLN > 0 ? totalSpendPLN / totalRevenuePLN : 0,
    };
    
    return metrics;
  }
);

/**
 * Generate monthly cost report
 */
export const generateMonthlyReport = functions.pubsub
  .schedule("0 0 1 * *") // First day of month at midnight
  .onRun(async (context) => {
    const db = admin.firestore();
    
    console.log("📊 Generating monthly cost report...");
    
    const now = Date.now();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);
    
    const startDate = lastMonth.getTime();
    const endDate = now;
    
    // Calculate metrics
    const costsSnapshot = await db
      .collection("serviceCosts")
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .get();
    
    let totalSpendPLN = 0;
    const byService: Record<string, number> = {};
    
    costsSnapshot.forEach((doc) => {
      const cost = doc.data() as ServiceCost;
      totalSpendPLN += cost.costPLN;
      byService[cost.service] = (byService[cost.service] || 0) + cost.costPLN;
    });
    
    // Save report
    await db.collection("costReports").add({
      period: "monthly",
      startDate,
      endDate,
      totalSpendPLN,
      byService,
      generatedAt: Date.now(),
    });
    
    // Reset monthly totals
    const services = Object.keys(COST_CONTROL_RULES);
    const batch = db.batch();
    
    for (const service of services) {
      const totalRef = db.collection("costTotals").doc(service);
      batch.set(totalRef, {
        service,
        currentSpend: 0,
        lastReset: Date.now(),
      });
    }
    
    await batch.commit();
    
    console.log(`✅ Monthly report generated: ${totalSpendPLN.toFixed(2)} PLN`);
  });

/**
 * Get budget status
 */
export const getBudgetStatus = functions.https.onCall(
  async (data, context) => {
    const db = admin.firestore();
    
    const services = Object.keys(COST_CONTROL_RULES);
    const statuses = await Promise.all(
      services.map(async (service) => {
        const rule = COST_CONTROL_RULES[service];
        const totalDoc = await db.collection("costTotals").doc(service).get();
        
        const currentSpend = totalDoc.exists
          ? totalDoc.data()?.currentSpend || 0
          : 0;
        
        const budgetUsed = currentSpend / rule.monthlyBudgetPLN;
        const remaining = rule.monthlyBudgetPLN - currentSpend;
        
        return {
          service,
          budgetPLN: rule.monthlyBudgetPLN,
          currentSpend,
          budgetUsed,
          remaining,
          autoThrottle: rule.autoThrottle,
          status:
            budgetUsed >= rule.throttleThreshold
              ? "throttled"
              : budgetUsed >= rule.alertThreshold
              ? "warning"
              : "ok",
        };
      })
    );
    
    return { services: statuses };
  }
);

// ============================================
// FRAUD ABUSE THROTTLING
// ============================================

/**
 * Detect and throttle fraud abuse
 */
export const detectFraudAbuse = functions.https.onCall(
  async (
    data: { userId: string; service: string },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    // Get user's usage in last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    const costsSnapshot = await db
      .collection("serviceCosts")
      .where("service", "==", data.service)
      .where("timestamp", ">", oneHourAgo)
      .get();
    
    // Define abuse thresholds
    const abuseThresholds: Record<string, number> = {
      aiUsage: 100000, // 100k tokens/hour
      pushNotifications: 1000, // 1k notifications/hour
      videoBandwidth: 100, // 100 GB/hour
    };
    
    let userUnits = 0;
    costsSnapshot.forEach((doc) => {
      const cost = doc.data() as ServiceCost;
      userUnits += cost.units;
    });
    
    const threshold = abuseThresholds[data.service];
    
    if (threshold && userUnits > threshold) {
      console.log(`🚨 FRAUD ABUSE DETECTED: ${data.userId} - ${data.service}`);
      
      // Throttle user
      await db.collection("userThrottles").doc(data.userId).set({
        userId: data.userId,
        service: data.service,
        reason: "fraud_abuse",
        unitsInHour: userUnits,
        threshold,
        activatedAt: Date.now(),
      });
      
      // Alert
      await db.collection("systemAlerts").add({
        type: "fraud_abuse",
        severity: "critical",
        userId: data.userId,
        service: data.service,
        message: `User ${data.userId} exceeded abuse threshold for ${data.service}`,
        details: { unitsInHour: userUnits, threshold },
        timestamp: Date.now(),
        resolved: false,
      });
      
      return {
        abusive: true,
        throttled: true,
      };
    }
    
    return {
      abusive: false,
      throttled: false,
    };
  }
);
