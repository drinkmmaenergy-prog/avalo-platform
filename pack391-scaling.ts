/**
 * PACK 391 — Auto-Scaling Architecture
 * 
 * Global auto-scaling system for handling viral growth and traffic spikes.
 * Monitors CPU, latency, error rates, and queue backlogs to dynamically scale services.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Auto-Scaling Configuration
interface ScalingMetrics {
  cpuUsage: number; // percentage
  latency: number; // milliseconds
  errorRate: number; // percentage
  queueBacklog: number; // job count
  activeConnections: number;
  requestsPerSecond: number;
}

interface ScalingThresholds {
  cpuScaleUp: number; // 65%
  latencyScaleUp: number; // 400ms
  errorRateIsolate: number; // 1.5%
  queueBurst: number; // 5000 jobs
}

interface ServiceHealth {
  serviceId: string;
  region: string;
  status: "healthy" | "degraded" | "critical" | "isolated";
  metrics: ScalingMetrics;
  instanceCount: number;
  lastScaleTime: FirebaseFirestore.Timestamp;
  scaleDecision?: "scale_up" | "scale_down" | "isolate" | "maintain";
}

const THRESHOLDS: ScalingThresholds = {
  cpuScaleUp: 65,
  latencyScaleUp: 400,
  errorRateIsolate: 1.5,
  queueBurst: 5000
};

/**
 * Main scaling guard - monitors and auto-scales services
 */
export const pack391_scaleGuard = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
  })
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    const startTime = Date.now();
    
    try {
      console.log("🔧 SCALE GUARD: Starting auto-scaling evaluation...");
      
      // Get all monitored services
      const servicesSnapshot = await db
        .collection("system")
        .doc("scaling")
        .collection("services")
        .get();
      
      const scalingDecisions: Array<{
        service: string;
        decision: string;
        reason: string;
      }> = [];
      
      // Evaluate each service
      for (const serviceDoc of servicesSnapshot.docs) {
        const health = serviceDoc.data() as ServiceHealth;
        const decision = await evaluateScaling(health);
        
        if (decision) {
          scalingDecisions.push(decision);
          await executeScaling(health.serviceId, decision);
        }
      }
      
      // Log scaling activity
      await db
        .collection("system")
        .doc("scaling")
        .collection("history")
        .add({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          decisions: scalingDecisions,
          duration: Date.now() - startTime
        });
      
      console.log(`✅ SCALE GUARD: Evaluated ${servicesSnapshot.size} services, ${scalingDecisions.length} scaling decisions`);
      
      return { success: true, decisions: scalingDecisions.length };
    } catch (error) {
      console.error("❌ SCALE GUARD ERROR:", error);
      
      // Alert ops team
      await db.collection("alerts").add({
        type: "scaling_failure",
        severity: "critical",
        error: error instanceof Error ? error.message : String(error),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      throw error;
    }
  });

/**
 * Evaluate if a service needs scaling
 */
async function evaluateScaling(
  health: ServiceHealth
): Promise<{ service: string; decision: string; reason: string } | null> {
  const { serviceId, metrics, instanceCount } = health;
  
  // Check for service isolation (high error rate)
  if (metrics.errorRate >= THRESHOLDS.errorRateIsolate) {
    return {
      service: serviceId,
      decision: "isolate",
      reason: `Error rate ${metrics.errorRate}% exceeds threshold ${THRESHOLDS.errorRateIsolate}%`
    };
  }
  
  // Check for scale up conditions
  const shouldScaleUp =
    metrics.cpuUsage > THRESHOLDS.cpuScaleUp ||
    metrics.latency > THRESHOLDS.latencyScaleUp ||
    metrics.queueBacklog > THRESHOLDS.queueBurst;
  
  if (shouldScaleUp) {
    const reasons: string[] = [];
    
    if (metrics.cpuUsage > THRESHOLDS.cpuScaleUp) {
      reasons.push(`CPU ${metrics.cpuUsage}% > ${THRESHOLDS.cpuScaleUp}%`);
    }
    if (metrics.latency > THRESHOLDS.latencyScaleUp) {
      reasons.push(`Latency ${metrics.latency}ms > ${THRESHOLDS.latencyScaleUp}ms`);
    }
    if (metrics.queueBacklog > THRESHOLDS.queueBurst) {
      reasons.push(`Queue ${metrics.queueBacklog} > ${THRESHOLDS.queueBurst}`);
    }
    
    return {
      service: serviceId,
      decision: "scale_up",
      reason: reasons.join(", ")
    };
  }
  
  // Check for scale down conditions (save costs)
  const shouldScaleDown =
    instanceCount > 1 &&
    metrics.cpuUsage < 30 &&
    metrics.latency < 200 &&
    metrics.queueBacklog < 100;
  
  if (shouldScaleDown) {
    return {
      service: serviceId,
      decision: "scale_down",
      reason: "Low utilization - optimize costs"
    };
  }
  
  return null;
}

/**
 * Execute scaling decision
 */
async function executeScaling(
  serviceId: string,
  decision: { service: string; decision: string; reason: string }
): Promise<void> {
  console.log(`🔄 Executing scaling for ${serviceId}: ${decision.decision}`);
  
  const scalingDoc = db
    .collection("system")
    .doc("scaling")
    .collection("services")
    .doc(serviceId);
  
  try {
    switch (decision.decision) {
      case "scale_up":
        await scalingDoc.update({
          instanceCount: admin.firestore.FieldValue.increment(1),
          status: "scaling_up",
          lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
          lastScaleReason: decision.reason
        });
        break;
      
      case "scale_down":
        await scalingDoc.update({
          instanceCount: admin.firestore.FieldValue.increment(-1),
          status: "scaling_down",
          lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
          lastScaleReason: decision.reason
        });
        break;
      
      case "isolate":
        await scalingDoc.update({
          status: "isolated",
          lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
          lastScaleReason: decision.reason
        });
        
        // Alert operations team
        await db.collection("alerts").add({
          type: "service_isolated",
          severity: "critical",
          service: serviceId,
          reason: decision.reason,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
    }
  } catch (error) {
    console.error(`❌ Failed to execute scaling for ${serviceId}:`, error);
    throw error;
  }
}

/**
 * Service health check - monitors individual services
 */
export const pack391_serviceHealthCheck = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB"
  })
  .https.onRequest(async (req, res) => {
    try {
      const { serviceId } = req.query;
      
      if (!serviceId || typeof serviceId !== "string") {
        res.status(400).json({ error: "serviceId required" });
        return;
      }
      
      // Get current service metrics
      const metricsSnapshot = await db
        .collection("system")
        .doc("metrics")
        .collection("services")
        .doc(serviceId)
        .get();
      
      if (!metricsSnapshot.exists) {
        res.status(404).json({ error: "Service not found" });
        return;
      }
      
      const metrics = metricsSnapshot.data() as ScalingMetrics;
      
      // Evaluate health status
      const status = evaluateHealthStatus(metrics);
      
      // Update service health
      await db
        .collection("system")
        .doc("scaling")
        .collection("services")
        .doc(serviceId)
        .set(
          {
            serviceId,
            status,
            metrics,
            lastHealthCheck: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      
      res.json({
        serviceId,
        status,
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({
        error: "Health check failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

/**
 * Evaluate service health status
 */
function evaluateHealthStatus(
  metrics: ScalingMetrics
): "healthy" | "degraded" | "critical" | "isolated" {
  // Critical: multiple thresholds exceeded
  if (
    metrics.errorRate >= THRESHOLDS.errorRateIsolate ||
    (metrics.cpuUsage > 90 && metrics.latency > 1000)
  ) {
    return "critical";
  }
  
  // Degraded: one or more thresholds exceeded
  if (
    metrics.cpuUsage > THRESHOLDS.cpuScaleUp ||
    metrics.latency > THRESHOLDS.latencyScaleUp ||
    metrics.errorRate > 0.5
  ) {
    return "degraded";
  }
  
  return "healthy";
}

/**
 * Manual scaling trigger - for emergency situations
 */
export const pack391_manualScale = functions
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
    
    const { serviceId, action, instanceCount } = data;
    
    if (!serviceId || !action) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "serviceId and action required"
      );
    }
    
    try {
      const scalingDoc = db
        .collection("system")
        .doc("scaling")
        .collection("services")
        .doc(serviceId);
      
      switch (action) {
        case "scale_to":
          if (typeof instanceCount !== "number" || instanceCount < 1) {
            throw new functions.https.HttpsError(
              "invalid-argument",
              "Valid instanceCount required for scale_to"
            );
          }
          
          await scalingDoc.update({
            instanceCount,
            status: "manual_scaling",
            lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
            lastScaleReason: `Manual scale to ${instanceCount} instances by ${context.auth.uid}`
          });
          break;
        
        case "reset":
          await scalingDoc.update({
            status: "healthy",
            lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
            lastScaleReason: `Manual reset by ${context.auth.uid}`
          });
          break;
        
        default:
          throw new functions.https.HttpsError(
            "invalid-argument",
            "Invalid action"
          );
      }
      
      // Log manual scaling event
      await db.collection("system").doc("scaling").collection("manual_events").add({
        serviceId,
        action,
        instanceCount,
        adminId: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        serviceId,
        action,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Manual scaling error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Manual scaling failed"
      );
    }
  });

/**
 * Initialize scaling configuration
 */
export const pack391_initScaling = functions
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
      // Initialize core services
      const services = [
        { id: "api-gateway", region: "us-central1", initialInstances: 3 },
        { id: "matching-engine", region: "us-central1", initialInstances: 5 },
        { id: "chat-service", region: "us-central1", initialInstances: 4 },
        { id: "payment-processor", region: "us-central1", initialInstances: 2 },
        { id: "ai-companion", region: "us-central1", initialInstances: 10 },
        { id: "media-processing", region: "us-central1", initialInstances: 3 },
        { id: "notification-service", region: "us-central1", initialInstances: 2 }
      ];
      
      const batch = db.batch();
      
      for (const service of services) {
        const serviceRef = db
          .collection("system")
          .doc("scaling")
          .collection("services")
          .doc(service.id);
        
        batch.set(serviceRef, {
          serviceId: service.id,
          region: service.region,
          status: "healthy",
          instanceCount: service.initialInstances,
          metrics: {
            cpuUsage: 0,
            latency: 0,
            errorRate: 0,
            queueBacklog: 0,
            activeConnections: 0,
            requestsPerSecond: 0
          },
          lastScaleTime: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      await batch.commit();
      
      console.log(`✅ Initialized ${services.length} scaling services`);
      
      return {
        success: true,
        servicesInitialized: services.length
      };
    } catch (error) {
      console.error("Scaling initialization error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Initialization failed"
      );
    }
  });
