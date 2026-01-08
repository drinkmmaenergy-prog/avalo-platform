/**
 * PACK 361 - Auto-Scaling Engine
 * Automatic resource scaling based on load
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// ============================================
// TYPES
// ============================================

export interface ScalingMetrics {
  serviceName: string;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
  errorRate: number;
  timestamp: number;
}

export interface ScalingRule {
  serviceName: string;
  scaleUpThreshold: {
    cpuUsage: number; // 0-1
    memoryUsage: number; // 0-1
    connections: number;
  };
  scaleDownThreshold: {
    cpuUsage: number;
    memoryUsage: number;
    connections: number;
  };
  minInstances: number;
  maxInstances: number;
  cooldownSeconds: number;
}

export interface ScalingEvent {
  serviceName: string;
  action: "scale_up" | "scale_down";
  fromInstances: number;
  toInstances: number;
  reason: string;
  metrics: ScalingMetrics;
  timestamp: number;
}

export interface BurstProtection {
  enabled: boolean;
  triggers: {
    viral: boolean;
    promotions: boolean;
    events: boolean;
    celebrityCreators: boolean;
  };
  maxInstances: number;
  activatedAt?: number;
}

// ============================================
// CONFIGURATION
// ============================================

const SCALING_RULES: Record<string, ScalingRule> = {
  cloudFunctions: {
    serviceName: "cloudFunctions",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.7,
      connections: 1000,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      connections: 200,
    },
    minInstances: 2,
    maxInstances: 100,
    cooldownSeconds: 60,
  },
  realtimeListeners: {
    serviceName: "realtimeListeners",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.7,
      connections: 5000,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      connections: 1000,
    },
    minInstances: 3,
    maxInstances: 50,
    cooldownSeconds: 120,
  },
  aiServices: {
    serviceName: "aiServices",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.8,
      connections: 500,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.5,
      connections: 100,
    },
    minInstances: 2,
    maxInstances: 30,
    cooldownSeconds: 180,
  },
  videoVoiceSignaling: {
    serviceName: "videoVoiceSignaling",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.7,
      connections: 200,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      connections: 50,
    },
    minInstances: 2,
    maxInstances: 40,
    cooldownSeconds: 90,
  },
  walletProcessing: {
    serviceName: "walletProcessing",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.7,
      connections: 1000,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      connections: 200,
    },
    minInstances: 3,
    maxInstances: 50,
    cooldownSeconds: 60,
  },
  supportSystem: {
    serviceName: "supportSystem",
    scaleUpThreshold: {
      cpuUsage: 0.6,
      memoryUsage: 0.7,
      connections: 500,
    },
    scaleDownThreshold: {
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      connections: 100,
    },
    minInstances: 2,
    maxInstances: 20,
    cooldownSeconds: 120,
  },
};

// ============================================
// METRICS COLLECTION
// ============================================

/**
 * Collect current metrics for a service
 */
export async function collectServiceMetrics(
  serviceName: string
): Promise<ScalingMetrics> {
  const db = admin.firestore();
  
  // Get latest metrics from monitoring
  const metricsDoc = await db
    .collection("serviceMetrics")
    .doc(serviceName)
    .get();
  
  if (!metricsDoc.exists) {
    return {
      serviceName,
      cpuUsage: 0,
      memoryUsage: 0,
      activeConnections: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      timestamp: Date.now(),
    };
  }
  
  return metricsDoc.data() as ScalingMetrics;
}

/**
 * Update service metrics
 */
export const updateMetrics = functions.https.onCall(
  async (data: ScalingMetrics, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    await db
      .collection("serviceMetrics")
      .doc(data.serviceName)
      .set({
        ...data,
        timestamp: Date.now(),
      });
    
    // Check if scaling is needed
    await evaluateScaling(data.serviceName);
    
    return { success: true };
  }
);

// ============================================
// SCALING LOGIC
// ============================================

/**
 * Evaluate if scaling is needed for a service
 */
export async function evaluateScaling(serviceName: string): Promise<void> {
  const db = admin.firestore();
  const rule = SCALING_RULES[serviceName];
  
  if (!rule) {
    console.warn(`No scaling rule found for ${serviceName}`);
    return;
  }
  
  const metrics = await collectServiceMetrics(serviceName);
  
  // Get current instance count
  const configDoc = await db
    .collection("serviceConfig")
    .doc(serviceName)
    .get();
  
  const currentInstances = configDoc.exists
    ? configDoc.data()?.instances || rule.minInstances
    : rule.minInstances;
  
  // Check cooldown
  const lastScalingDoc = await db
    .collection("scalingEvents")
    .where("serviceName", "==", serviceName)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();
  
  if (!lastScalingDoc.empty) {
    const lastScaling = lastScalingDoc.docs[0].data() as ScalingEvent;
    const timeSinceLastScaling =
      (Date.now() - lastScaling.timestamp) / 1000;
    
    if (timeSinceLastScaling < rule.cooldownSeconds) {
      console.log(
        `⏳ ${serviceName} in cooldown (${timeSinceLastScaling}s/${rule.cooldownSeconds}s)`
      );
      return;
    }
  }
  
  // Check if burst protection is active
  const burstProtection = await getBurstProtection();
  const maxInstances = burstProtection.enabled
    ? burstProtection.maxInstances
    : rule.maxInstances;
  
  // Determine scaling action
  let action: "scale_up" | "scale_down" | null = null;
  let reason = "";
  
  if (
    metrics.cpuUsage >= rule.scaleUpThreshold.cpuUsage ||
    metrics.memoryUsage >= rule.scaleUpThreshold.memoryUsage ||
    metrics.activeConnections >= rule.scaleUpThreshold.connections
  ) {
    if (currentInstances < maxInstances) {
      action = "scale_up";
      reason = `CPU: ${(metrics.cpuUsage * 100).toFixed(1)}%, Memory: ${(
        metrics.memoryUsage * 100
      ).toFixed(1)}%, Connections: ${metrics.activeConnections}`;
    }
  } else if (
    metrics.cpuUsage < rule.scaleDownThreshold.cpuUsage &&
    metrics.memoryUsage < rule.scaleDownThreshold.memoryUsage &&
    metrics.activeConnections < rule.scaleDownThreshold.connections
  ) {
    if (currentInstances > rule.minInstances) {
      action = "scale_down";
      reason = "Low resource usage";
    }
  }
  
  if (action) {
    await performScaling(serviceName, action, currentInstances, metrics, reason);
  }
}

/**
 * Perform scaling action
 */
async function performScaling(
  serviceName: string,
  action: "scale_up" | "scale_down",
  currentInstances: number,
  metrics: ScalingMetrics,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  const rule = SCALING_RULES[serviceName];
  
  // Calculate new instance count
  let newInstances = currentInstances;
  
  if (action === "scale_up") {
    // Scale up by 50% or +1, whichever is larger
    const increment = Math.max(1, Math.ceil(currentInstances * 0.5));
    newInstances = Math.min(
      currentInstances + increment,
      rule.maxInstances
    );
  } else {
    // Scale down by 25% or -1, whichever is larger
    const decrement = Math.max(1, Math.ceil(currentInstances * 0.25));
    newInstances = Math.max(
      currentInstances - decrement,
      rule.minInstances
    );
  }
  
  if (newInstances === currentInstances) {
    return;
  }
  
  console.log(
    `📊 Scaling ${serviceName}: ${currentInstances} → ${newInstances} instances (${action})`
  );
  
  // Update instance count
  await db
    .collection("serviceConfig")
    .doc(serviceName)
    .set(
      {
        instances: newInstances,
        lastScaled: Date.now(),
      },
      { merge: true }
    );
  
  // Log scaling event
  const scalingEvent: ScalingEvent = {
    serviceName,
    action,
    fromInstances: currentInstances,
    toInstances: newInstances,
    reason,
    metrics,
    timestamp: Date.now(),
  };
  
  await db.collection("scalingEvents").add(scalingEvent);
  
  // Send notification for significant scaling
  const scalingRatio = newInstances / currentInstances;
  if (scalingRatio >= 2 || scalingRatio <= 0.5) {
    await sendScalingAlert(scalingEvent);
  }
}

/**
 * Send scaling alert
 */
async function sendScalingAlert(event: ScalingEvent): Promise<void> {
  const db = admin.firestore();
  
  await db.collection("systemAlerts").add({
    type: "scaling",
    severity: event.action === "scale_up" ? "warning" : "info",
    service: event.serviceName,
    message: `${event.serviceName} scaled ${event.action}`,
    details: event,
    timestamp: Date.now(),
    resolved: false,
  });
}

// ============================================
// BURST PROTECTION
// ============================================

/**
 * Get burst protection status
 */
async function getBurstProtection(): Promise<BurstProtection> {
  const db = admin.firestore();
  const doc = await db.collection("systemConfig").doc("burstProtection").get();
  
  if (!doc.exists) {
    return {
      enabled: false,
      triggers: {
        viral: false,
        promotions: false,
        events: false,
        celebrityCreators: false,
      },
      maxInstances: 1000,
    };
  }
  
  return doc.data() as BurstProtection;
}

/**
 * Enable burst protection
 */
export const enableBurstProtection = functions.https.onCall(
  async (
    data: { trigger: keyof BurstProtection["triggers"] },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    await db
      .collection("systemConfig")
      .doc("burstProtection")
      .set(
        {
          enabled: true,
          triggers: {
            [data.trigger]: true,
          },
          maxInstances: 1000,
          activatedAt: Date.now(),
        },
        { merge: true }
      );
    
    console.log(`🚀 Burst protection enabled: ${data.trigger}`);
    
    return { success: true };
  }
);

/**
 * Disable burst protection
 */
export const disableBurstProtection = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    await db.collection("systemConfig").doc("burstProtection").set({
      enabled: false,
      triggers: {
        viral: false,
        promotions: false,
        events: false,
        celebrityCreators: false,
      },
      maxInstances: 100,
    });
    
    console.log("🔒 Burst protection disabled");
    
    return { success: true };
  }
);

// ============================================
// SCHEDULED CHECKS
// ============================================

/**
 * Regular scaling evaluation
 */
export const evaluateAllServices = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("📊 Evaluating scaling for all services...");
    
    const services = Object.keys(SCALING_RULES);
    
    await Promise.all(
      services.map((service) => evaluateScaling(service))
    );
    
    console.log("✅ Scaling evaluation complete");
  });

/**
 * Detect viral traffic and enable burst protection
 */
export const detectViralTraffic = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    const db = admin.firestore();
    
    // Get request rate over last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    const requestsSnapshot = await db
      .collection("requestLogs")
      .where("timestamp", ">", fiveMinutesAgo)
      .get();
    
    const requestCount = requestsSnapshot.size;
    const requestsPerMinute = requestCount / 5;
    
    // Get historical average
    const statsDoc = await db
      .collection("systemStats")
      .doc("requestRates")
      .get();
    
    const avgRequestsPerMinute = statsDoc.exists
      ? statsDoc.data()?.averagePerMinute || 100
      : 100;
    
    // Viral threshold: 5x normal traffic
    const viralThreshold = avgRequestsPerMinute * 5;
    
    if (requestsPerMinute > viralThreshold) {
      console.log("🔥 VIRAL TRAFFIC DETECTED!");
      console.log(
        `Current: ${requestsPerMinute} req/min, Average: ${avgRequestsPerMinute} req/min`
      );
      
      // Enable burst protection
      const burstProtection = await getBurstProtection();
      if (!burstProtection.enabled) {
        await db
          .collection("systemConfig")
          .doc("burstProtection")
          .set({
            enabled: true,
            triggers: { viral: true },
            maxInstances: 1000,
            activatedAt: Date.now(),
          });
        
        // Send alert
        await db.collection("systemAlerts").add({
          type: "viral_traffic",
          severity: "critical",
          message: "Viral traffic detected - burst protection enabled",
          details: {
            currentRpm: requestsPerMinute,
            averageRpm: avgRequestsPerMinute,
            threshold: viralThreshold,
          },
          timestamp: Date.now(),
          resolved: false,
        });
      }
    }
  });

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Get scaling status for all services
 */
export const getScalingStatus = functions.https.onCall(
  async (data, context) => {
    const db = admin.firestore();
    
    const services = Object.keys(SCALING_RULES);
    const statuses = await Promise.all(
      services.map(async (serviceName) => {
        const metrics = await collectServiceMetrics(serviceName);
        const configDoc = await db
          .collection("serviceConfig")
          .doc(serviceName)
          .get();
        
        const instances = configDoc.exists
          ? configDoc.data()?.instances || SCALING_RULES[serviceName].minInstances
          : SCALING_RULES[serviceName].minInstances;
        
        return {
          serviceName,
          instances,
          metrics,
          rule: SCALING_RULES[serviceName],
        };
      })
    );
    
    const burstProtection = await getBurstProtection();
    
    return {
      services: statuses,
      burstProtection,
    };
  }
);

/**
 * Get scaling history
 */
export const getScalingHistory = functions.https.onCall(
  async (data: { serviceName?: string; limit?: number }, context) => {
    const db = admin.firestore();
    
    let query = db
      .collection("scalingEvents")
      .orderBy("timestamp", "desc")
      .limit(data.limit || 100);
    
    if (data.serviceName) {
      query = query.where("serviceName", "==", data.serviceName) as any;
    }
    
    const snapshot = await query.get();
    
    return snapshot.docs.map((doc) => doc.data());
  }
);

/**
 * Manual scaling trigger (admin only)
 */
export const manualScale = functions.https.onCall(
  async (
    data: {
      serviceName: string;
      instances: number;
    },
    context
  ) => {
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
    
    const rule = SCALING_RULES[data.serviceName];
    if (!rule) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid service name"
      );
    }
    
    if (
      data.instances < rule.minInstances ||
      data.instances > rule.maxInstances
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Instance count must be between ${rule.minInstances} and ${rule.maxInstances}`
      );
    }
    
    await db
      .collection("serviceConfig")
      .doc(data.serviceName)
      .set(
        {
          instances: data.instances,
          lastScaled: Date.now(),
          scaledBy: context.auth.uid,
          manual: true,
        },
        { merge: true }
      );
    
    console.log(
      `⚙️ Manual scaling: ${data.serviceName} → ${data.instances} instances`
    );
    
    return { success: true };
  }
);
