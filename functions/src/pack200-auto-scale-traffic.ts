/**
 * PACK 200 — Auto Scale Traffic (SORA Component)
 * 
 * Automatic traffic management and region scaling
 * Reroutes traffic dynamically based on load, latency, and region health
 * Implements cold region shutdown for cost efficiency
 * 
 * COMPLIANCE:
 * - No tokenomics impact
 * - Transparent to users
 * - Engineering alerts only
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import { trackMetric } from './pack200-track-metrics';

export type RegionStatus = 'ACTIVE' | 'DEGRADED' | 'COLD' | 'DISABLED';
export type TrafficAction = 'ROUTE' | 'REROUTE' | 'SCALE_UP' | 'SCALE_DOWN' | 'COLD_SHUTDOWN';

export interface RegionHealth {
  regionId: string;
  region: string;
  status: RegionStatus;
  currentLoad: number;
  maxCapacity: number;
  utilizationPercent: number;
  avgLatencyMs: number;
  errorRate: number;
  activeConnections: number;
  trafficPercent: number;
  lastHealthCheck: Timestamp;
  metadata?: {
    coldStartThreshold?: number;
    cooldownUntil?: Timestamp;
  };
}

export interface TrafficRule {
  ruleId: string;
  priority: number;
  condition: 'HIGH_LOAD' | 'HIGH_LATENCY' | 'HIGH_ERROR_RATE' | 'LOW_TRAFFIC' | 'REGION_DOWN';
  threshold: number;
  action: TrafficAction;
  targetRegion?: string;
  enabled: boolean;
  createdAt: Timestamp;
}

export interface ScalingEvent {
  eventId: string;
  timestamp: Timestamp;
  region: string;
  action: TrafficAction;
  reason: string;
  beforeState: {
    load: number;
    connections: number;
    latency: number;
  };
  afterState?: {
    load: number;
    connections: number;
    latency: number;
  };
  success: boolean;
  metadata?: any;
  createdAt: Timestamp;
}

const REGIONS = ['us-central1', 'europe-west1', 'asia-east1'];

/**
 * Monitor region health and auto-scale
 */
export async function monitorAndScale(): Promise<void> {
  try {
    const regions = await getAllRegionHealth();
    const rules = await getActiveTrafficRules();
    
    for (const region of regions) {
      await checkRegionHealth(region, rules);
    }
    
    await trackMetric({
      layer: 'FUNCTIONS',
      type: 'THROUGHPUT',
      service: 'auto-scale-traffic',
      value: regions.length,
      unit: 'regions',
    });
  } catch (error) {
    console.error('[AutoScale] Monitoring failed:', error);
  }
}

/**
 * Get current health status for all regions
 */
async function getAllRegionHealth(): Promise<RegionHealth[]> {
  try {
    const snapshot = await db.collection('region_health')
      .orderBy('lastHealthCheck', 'desc')
      .limit(10)
      .get();
    
    const existingRegions = new Map<string, RegionHealth>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as RegionHealth;
      if (!existingRegions.has(data.region)) {
        existingRegions.set(data.region, data);
      }
    }
    
    const healthData: RegionHealth[] = [];
    
    for (const region of REGIONS) {
      const existing = existingRegions.get(region);
      
      if (existing) {
        healthData.push(existing);
      } else {
        const newHealth: RegionHealth = {
          regionId: generateId(),
          region,
          status: 'ACTIVE',
          currentLoad: 0,
          maxCapacity: 1000,
          utilizationPercent: 0,
          avgLatencyMs: 100,
          errorRate: 0,
          activeConnections: 0,
          trafficPercent: 100 / REGIONS.length,
          lastHealthCheck: Timestamp.now(),
        };
        
        healthData.push(newHealth);
        await db.collection('region_health').doc(newHealth.regionId).set({
          ...newHealth,
          createdAt: serverTimestamp(),
        });
      }
    }
    
    return healthData;
  } catch (error) {
    console.error('[AutoScale] Failed to get region health:', error);
    return [];
  }
}

/**
 * Get active traffic routing rules
 */
async function getActiveTrafficRules(): Promise<TrafficRule[]> {
  try {
    const snapshot = await db.collection('traffic_rules')
      .where('enabled', '==', true)
      .orderBy('priority', 'asc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as TrafficRule);
  } catch (error) {
    console.error('[AutoScale] Failed to get traffic rules:', error);
    return getDefaultTrafficRules();
  }
}

/**
 * Default traffic rules if none exist
 */
function getDefaultTrafficRules(): TrafficRule[] {
  return [
    {
      ruleId: 'rule_high_load',
      priority: 1,
      condition: 'HIGH_LOAD',
      threshold: 80,
      action: 'REROUTE',
      enabled: true,
      createdAt: Timestamp.now(),
    },
    {
      ruleId: 'rule_high_latency',
      priority: 2,
      condition: 'HIGH_LATENCY',
      threshold: 1000,
      action: 'REROUTE',
      enabled: true,
      createdAt: Timestamp.now(),
    },
    {
      ruleId: 'rule_low_traffic',
      priority: 3,
      condition: 'LOW_TRAFFIC',
      threshold: 1,
      action: 'COLD_SHUTDOWN',
      enabled: true,
      createdAt: Timestamp.now(),
    },
    {
      ruleId: 'rule_high_error',
      priority: 4,
      condition: 'HIGH_ERROR_RATE',
      threshold: 5,
      action: 'REROUTE',
      enabled: true,
      createdAt: Timestamp.now(),
    },
  ];
}

/**
 * Check region health and apply scaling rules
 */
async function checkRegionHealth(region: RegionHealth, rules: TrafficRule[]): Promise<void> {
  for (const rule of rules) {
    const shouldApply = evaluateRule(region, rule);
    
    if (shouldApply) {
      await applyTrafficAction(region, rule);
      break;
    }
  }
}

/**
 * Evaluate if a rule should be applied
 */
function evaluateRule(region: RegionHealth, rule: TrafficRule): boolean {
  switch (rule.condition) {
    case 'HIGH_LOAD':
      return region.utilizationPercent >= rule.threshold;
    
    case 'HIGH_LATENCY':
      return region.avgLatencyMs >= rule.threshold;
    
    case 'HIGH_ERROR_RATE':
      return region.errorRate >= rule.threshold;
    
    case 'LOW_TRAFFIC':
      return region.trafficPercent <= rule.threshold && region.activeConnections < 10;
    
    case 'REGION_DOWN':
      return region.status === 'DISABLED';
    
    default:
      return false;
  }
}

/**
 * Apply traffic scaling action
 */
async function applyTrafficAction(region: RegionHealth, rule: TrafficRule): Promise<void> {
  try {
    const beforeState = {
      load: region.currentLoad,
      connections: region.activeConnections,
      latency: region.avgLatencyMs,
    };
    
    let success = false;
    let afterState = beforeState;
    
    switch (rule.action) {
      case 'REROUTE':
        success = await rerouteTraffic(region);
        break;
      
      case 'SCALE_UP':
        success = await scaleUp(region);
        break;
      
      case 'SCALE_DOWN':
        success = await scaleDown(region);
        break;
      
      case 'COLD_SHUTDOWN':
        success = await coldShutdown(region);
        break;
    }
    
    afterState = {
      load: region.currentLoad,
      connections: region.activeConnections,
      latency: region.avgLatencyMs,
    };
    
    await logScalingEvent({
      region: region.region,
      action: rule.action,
      reason: rule.condition,
      beforeState,
      afterState,
      success,
    });
  } catch (error) {
    console.error('[AutoScale] Failed to apply action:', error);
  }
}

/**
 * Reroute traffic away from overloaded region
 */
async function rerouteTraffic(region: RegionHealth): Promise<boolean> {
  try {
    const healthyRegions = await getAllRegionHealth();
    const targetRegion = healthyRegions
      .filter(r => r.region !== region.region && r.status === 'ACTIVE' && r.utilizationPercent < 60)
      .sort((a, b) => a.utilizationPercent - b.utilizationPercent)[0];
    
    if (!targetRegion) {
      console.warn('[AutoScale] No healthy region available for rerouting');
      return false;
    }
    
    await db.collection('region_health').doc(region.regionId).update({
      status: 'DEGRADED',
      trafficPercent: Math.max(10, region.trafficPercent - 30),
      lastHealthCheck: serverTimestamp(),
    });
    
    await db.collection('region_health').doc(targetRegion.regionId).update({
      trafficPercent: targetRegion.trafficPercent + 30,
      lastHealthCheck: serverTimestamp(),
    });
    
    console.log(`[AutoScale] Rerouted traffic from ${region.region} to ${targetRegion.region}`);
    return true;
  } catch (error) {
    console.error('[AutoScale] Rerouting failed:', error);
    return false;
  }
}

/**
 * Scale up region capacity
 */
async function scaleUp(region: RegionHealth): Promise<boolean> {
  try {
    const newCapacity = Math.min(region.maxCapacity * 1.5, 5000);
    
    await db.collection('region_health').doc(region.regionId).update({
      maxCapacity: newCapacity,
      lastHealthCheck: serverTimestamp(),
    });
    
    console.log(`[AutoScale] Scaled up ${region.region} capacity to ${newCapacity}`);
    return true;
  } catch (error) {
    console.error('[AutoScale] Scale up failed:', error);
    return false;
  }
}

/**
 * Scale down region capacity
 */
async function scaleDown(region: RegionHealth): Promise<boolean> {
  try {
    const newCapacity = Math.max(region.maxCapacity * 0.7, 100);
    
    await db.collection('region_health').doc(region.regionId).update({
      maxCapacity: newCapacity,
      lastHealthCheck: serverTimestamp(),
    });
    
    console.log(`[AutoScale] Scaled down ${region.region} capacity to ${newCapacity}`);
    return true;
  } catch (error) {
    console.error('[AutoScale] Scale down failed:', error);
    return false;
  }
}

/**
 * Cold shutdown for regions with <1% traffic
 */
async function coldShutdown(region: RegionHealth): Promise<boolean> {
  try {
    if (region.activeConnections > 0) {
      console.log(`[AutoScale] Cannot cold shutdown ${region.region}: ${region.activeConnections} active connections`);
      return false;
    }
    
    await db.collection('region_health').doc(region.regionId).update({
      status: 'COLD',
      trafficPercent: 0,
      metadata: {
        coldStartThreshold: 50,
        cooldownUntil: Timestamp.fromMillis(Date.now() + 3600000),
      },
      lastHealthCheck: serverTimestamp(),
    });
    
    console.log(`[AutoScale] Cold shutdown ${region.region}`);
    
    await trackMetric({
      layer: 'FUNCTIONS',
      type: 'THROUGHPUT',
      service: 'cold-shutdown',
      value: 1,
      unit: 'region',
      metadata: { region: region.region },
    });
    
    return true;
  } catch (error) {
    console.error('[AutoScale] Cold shutdown failed:', error);
    return false;
  }
}

/**
 * Log scaling event for audit trail
 */
async function logScalingEvent(input: Omit<ScalingEvent, 'eventId' | 'timestamp' | 'createdAt'>): Promise<void> {
  try {
    const eventId = generateId();
    
    await db.collection('scaling_events').doc(eventId).set({
      eventId,
      timestamp: Timestamp.now(),
      ...input,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[AutoScale] Failed to log scaling event:', error);
  }
}

/**
 * Scheduled function to monitor and scale every 2 minutes
 */
export const scheduled_autoScaleTraffic = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async (context) => {
    try {
      await monitorAndScale();
      console.log('[AutoScale] Monitoring cycle completed');
    } catch (error) {
      console.error('[AutoScale] Monitoring cycle failed:', error);
    }
  });

/**
 * Manual scaling trigger (admin-only)
 */
export const admin_triggerScaling = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    await monitorAndScale();
    
    return {
      success: true,
      message: 'Scaling cycle triggered',
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('[AutoScale] Manual trigger failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scaling history (engineering endpoint)
 */
export const admin_getScalingHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !['ADMIN', 'ENGINEER'].includes(adminDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Engineering access required');
  }
  
  try {
    const { limit = 50 } = data;
    
    const snapshot = await db.collection('scaling_events')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const events = snapshot.docs.map(doc => doc.data());
    
    return {
      success: true,
      events,
      total: snapshot.size,
    };
  } catch (error: any) {
    console.error('[AutoScale] Failed to get scaling history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});