import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 361 - Global Load Balancer
 * Region-based traffic routing with automatic failover
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { HttpsError, auth, onCall, timestamp, logger, onSchedule } from './runtime';

// ============================================
// TYPES
// ============================================

export type Region = "EU" | "US" | "ASIA";
export type RegionStatus = "healthy" | "degraded" | "offline";

export interface RegionNode {
  region: Region;
  status: RegionStatus;
  latencyMs: number;
  cpuUsage: number;
  activeUsers: number;
  lastHealthCheck: number;
  endpoints: {
    chat: string;
    calls: string;
    wallet: string;
    ai: string;
    media: string;
  };
}

export interface UserRegionMapping {
  userId: string;
  assignedRegion: Region;
  pinnedServices: {
    chat: Region;
    calls: Region;
    wallet: Region;
  };
  lastRouted: number;
}

export interface HealthCheckResult {
  region: Region;
  healthy: boolean;
  latencyMs: number;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  errorRate: number;
  timestamp: number;
}

export interface FailoverEvent {
  userId: string;
  fromRegion: Region;
  toRegion: Region;
  reason: "health" | "latency" | "capacity" | "manual";
  timestamp: number;
  completedInMs: number;
}

// ============================================
// CONFIGURATION
// ============================================

const REGION_CONFIG: Record<Region, RegionNode> = {
  EU: {
    region: "EU",
    status: "healthy",
    latencyMs: 0,
    cpuUsage: 0,
    activeUsers: 0,
    lastHealthCheck: Date.now(),
    endpoints: {
      chat: "wss://eu-chat.platform.app",
      calls: "wss://eu-calls.platform.app",
      wallet: "https://eu-wallet.platform.app",
      ai: "https://eu-ai.platform.app",
      media: "https://eu-media.platform.app",
    },
  },
  US: {
    region: "US",
    status: "healthy",
    latencyMs: 0,
    cpuUsage: 0,
    activeUsers: 0,
    lastHealthCheck: Date.now(),
    endpoints: {
      chat: "wss://us-chat.platform.app",
      calls: "wss://us-calls.platform.app",
      wallet: "https://us-wallet.platform.app",
      ai: "https://us-ai.platform.app",
      media: "https://us-media.platform.app",
    },
  },
  ASIA: {
    region: "ASIA",
    status: "healthy",
    latencyMs: 0,
    cpuUsage: 0,
    activeUsers: 0,
    lastHealthCheck: Date.now(),
    endpoints: {
      chat: "wss://asia-chat.platform.app",
      calls: "wss://asia-calls.platform.app",
      wallet: "https://asia-wallet.platform.app",
      ai: "https://asia-ai.platform.app",
      media: "https://asia-media.platform.app",
    },
  },
};

const HEALTH_CHECK_INTERVAL_MS = 10000; // 10 seconds
const FAILOVER_TIMEOUT_MS = 3000; // 3 seconds max
const MAX_LATENCY_MS = 400; // Alert threshold
const MAX_ERROR_RATE = 0.01; // 1%
const MAX_CPU_USAGE = 0.85; // 85%

// ============================================
// REGION SELECTION & ROUTING
// ============================================

/**
 * Get optimal region for user based on geolocation and health
 */
export async function getOptimalRegion(
  userLocation: { lat: number; lon: number },
  userId: string
): Promise<Region> {
  const db = admin.firestore();
  
  // Check if user already has pinned region
  const userMappingRef = db.collection("regionMappings").doc(userId);
  const userMapping = await userMappingRef.get();
  
  if (userMapping.exists) {
    const data = userMapping.data() as UserRegionMapping;
    const assignedRegion = data.assignedRegion;
    
    // Check if assigned region is healthy
    const regionHealth = await getRegionHealth(assignedRegion);
    if (regionHealth.healthy && regionHealth.latencyMs < MAX_LATENCY_MS) {
      return assignedRegion;
    }
  }
  
  // Calculate latency to each region
  const regionLatencies = await Promise.all([
    measureRegionLatency("EU", userLocation),
    measureRegionLatency("US", userLocation),
    measureRegionLatency("ASIA", userLocation),
  ]);
  
  // Filter healthy regions
  const healthyRegions = regionLatencies.filter(
    (r) => r.status === "healthy"
  );
  
  if (healthyRegions.length === 0) {
    // Emergency: all regions unhealthy, use first available
    console.error("⚠️ CRITICAL: All regions unhealthy!");
    return "EU"; // Default fallback
  }
  
  // Select region with lowest latency
  const optimal = healthyRegions.reduce((best, current) =>
    current.latencyMs < best.latencyMs ? current : best
  );
  
  // Save mapping
  await userMappingRef.set({
    userId,
    assignedRegion: optimal.region,
    pinnedServices: {
      chat: optimal.region,
      calls: optimal.region,
      wallet: optimal.region,
    },
    lastRouted: Date.now(),
  });
  
  return optimal.region;
}

/**
 * Measure latency to region based on geolocation
 */
async function measureRegionLatency(
  region: Region,
  userLocation: { lat: number; lon: number }
): Promise<RegionNode> {
  const db = admin.firestore();
  const regionDoc = await db.collection("regionNodes").doc(region).get();
  
  if (!regionDoc.exists) {
    return REGION_CONFIG[region];
  }
  
  const data = regionDoc.data() as RegionNode;
  
  // Calculate estimated latency based on geographic distance
  const regionCoords = getRegionCoordinates(region);
  const distance = calculateDistance(
    userLocation.lat,
    userLocation.lon,
    regionCoords.lat,
    regionCoords.lon
  );
  
  // Rough estimate: ~100ms per 1000km + base latency
  const estimatedLatency = (distance / 1000) * 100 + 20;
  
  return {
    ...data,
    latencyMs: estimatedLatency,
  };
}

/**
 * Get region coordinates for distance calculation
 */
function getRegionCoordinates(region: Region): { lat: number; lon: number } {
  const coords = {
    EU: { lat: 52.52, lon: 13.405 }, // Berlin
    US: { lat: 37.7749, lon: -122.4194 }, // San Francisco
    ASIA: { lat: 35.6762, lon: 139.6503 }, // Tokyo
  };
  return coords[region];
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ============================================
// HEALTH CHECKS
// ============================================

/**
 * Perform health check on specific region
 */
export async function getRegionHealth(
  region: Region
): Promise<HealthCheckResult> {
  const db = admin.firestore();
  
  try {
    const startTime = Date.now();
    
    // Check region status
    const regionDoc = await db.collection("regionNodes").doc(region).get();
    const latency = Date.now() - startTime;
    
    if (!regionDoc.exists) {
      console.log('Scheduled job result:', {
        region,
        healthy: false,
        latencyMs: latency,
        cpuUsage: 0,
        memoryUsage: 0,
        activeConnections: 0,
        errorRate: 1,
        timestamp: Date.now(),
      });

      return;
    }
    
    const data = regionDoc.data() as RegionNode;
    
    // Get metrics
    const metricsDoc = await db
      .collection("regionMetrics")
      .doc(region)
      .get();
    
    const metrics = metricsDoc.exists ? metricsDoc.data() : {};
    
    const cpuUsage = metrics?.cpuUsage || 0;
    const memoryUsage = metrics?.memoryUsage || 0;
    const activeConnections = metrics?.activeConnections || 0;
    const errorRate = metrics?.errorRate || 0;
    
    // Determine health status
    const healthy =
      data.status === "healthy" &&
      latency < MAX_LATENCY_MS &&
      cpuUsage < MAX_CPU_USAGE &&
      errorRate < MAX_ERROR_RATE;
    
    console.log('Scheduled job result:', {
      region,
      healthy,
      latencyMs: latency,
      cpuUsage,
      memoryUsage,
      activeConnections,
      errorRate,
      timestamp: Date.now(),
    });

    
    return;
  } catch (error) {
    console.error(`Health check failed for ${region}:`, error);
    console.log('Scheduled job result:', {
      region,
      healthy: false,
      latencyMs: 9999,
      cpuUsage: 1,
      memoryUsage: 1,
      activeConnections: 0,
      errorRate: 1,
      timestamp: Date.now(),
    });

    return;
  }
}

/**
 * Scheduled health check for all regions
 */
export const runHealthChecks = onSchedule("every 10 seconds", async (event) => {
    const db = admin.firestore();
    
    console.log("🏥 Running health checks on all regions...");
    
    const healthChecks = await Promise.all([
      getRegionHealth("EU"),
      getRegionHealth("US"),
      getRegionHealth("ASIA"),
    ]);
    
    // Save health check results
    const batch = db.batch();
    
    for (const health of healthChecks) {
      const regionRef = db.collection("regionNodes").doc(health.region);
      
      batch.update(regionRef, {
        status: health.healthy ? "healthy" : "degraded",
        latencyMs: health.latencyMs,
        cpuUsage: health.cpuUsage,
        lastHealthCheck: health.timestamp,
      });
      
      // Save health history
      const historyRef = db
        .collection("regionHealthHistory")
        .doc(`${health.region}_${health.timestamp}`);
      batch.set(historyRef, health);
      
      // Alert if unhealthy
      if (!health.healthy) {
        console.error(`🚨 ALERT: Region ${health.region} is unhealthy!`);
        await sendHealthAlert(health);
      }
    }
    
    await batch.commit();
    
    console.log("✅ Health checks complete");
  });

/**
 * Send health alert
 */
async function sendHealthAlert(health: HealthCheckResult): Promise<void> {
  const db = admin.firestore();
  
  await db.collection("systemAlerts").add({
    type: "region_health",
    severity: "critical",
    region: health.region,
    message: `Region ${health.region} is unhealthy`,
    details: health,
    timestamp: Date.now(),
    resolved: false,
  });
}

// ============================================
// FAILOVER
// ============================================

/**
 * Perform automatic failover for user
 */
export async function performFailover(
  userId: string,
  fromRegion: Region,
  reason: FailoverEvent["reason"]
): Promise<FailoverEvent> {
  const startTime = Date.now();
  const db = admin.firestore();
  
  console.log(`🔄 Initiating failover for ${userId} from ${fromRegion}`);
  
  // Find best alternative region
  const healthChecks = await Promise.all([
    getRegionHealth("EU"),
    getRegionHealth("US"),
    getRegionHealth("ASIA"),
  ]);
  
  const healthyAlternatives = healthChecks.filter(
    (h) => h.healthy && h.region !== fromRegion
  );
  
  if (healthyAlternatives.length === 0) {
    throw new Error("No healthy regions available for failover");
  }
  
  const toRegion = healthyAlternatives.reduce((best, current) =>
    current.latencyMs < best.latencyMs ? current : best
  ).region;
  
  // Update user mapping
  const userMappingRef = db.collection("regionMappings").doc(userId);
  await userMappingRef.update({
    assignedRegion: toRegion,
    "pinnedServices.chat": toRegion,
    "pinnedServices.calls": toRegion,
    "pinnedServices.wallet": toRegion,
    lastRouted: Date.now(),
  });
  
  const completedInMs = Date.now() - startTime;
  
  const failoverEvent: FailoverEvent = {
    userId,
    fromRegion,
    toRegion,
    reason,
    timestamp: Date.now(),
    completedInMs,
  };
  
  // Log failover event
  await db.collection("failoverEvents").add(failoverEvent);
  
  console.log(
    `✅ Failover complete: ${fromRegion} → ${toRegion} (${completedInMs}ms)`
  );
  
  if (completedInMs > FAILOVER_TIMEOUT_MS) {
    console.warn(`⚠️ Failover took longer than ${FAILOVER_TIMEOUT_MS}ms`);
  }
  
  return failoverEvent;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Get routing information for user
 */
export const getRouting = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const userId = request.auth.uid;
    const location = data.location || { lat: 52.52, lon: 13.405 }; // Default to Berlin
    
    const region = await getOptimalRegion(location, userId);
    const health = await getRegionHealth(region);
    const regionConfig = REGION_CONFIG[region];
    
    return {
      region,
      endpoints: regionConfig.endpoints,
      health: {
        latencyMs: health.latencyMs,
        status: health.healthy ? "healthy" : "degraded",
      },
    };
  }
);

/**
 * Force failover (admin only)
 */
export const forceFailover = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    // Check admin permission
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const isAdmin = userDoc.data()?.role === "admin";
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    return await performFailover(data.userId, data.fromRegion, "manual");
  }
);

/**
 * Get all region statuses
 */
export const getRegionStatuses = functions.https.onCall(async (request) => {
    const healthChecks = await Promise.all([
      getRegionHealth("EU"),
      getRegionHealth("US"),
      getRegionHealth("ASIA"),
    ]);
    
    return healthChecks.map((h) => ({
      region: h.region,
      healthy: h.healthy,
      latencyMs: h.latencyMs,
      cpuUsage: h.cpuUsage,
      errorRate: h.errorRate,
    }));
  }
);

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize region nodes in Firestore
 */
export const initializeRegions = functions.https.onCall(async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const batch = db.batch();
    
    for (const [region, config] of Object.entries(REGION_CONFIG)) {
      const regionRef = db.collection("regionNodes").doc(region);
      batch.set(regionRef, config);
    }
    
    await batch.commit();
    
    console.log("✅ Regions initialized");
    console.log('Scheduled job result:', { success: true });

    return;
  }
);

























