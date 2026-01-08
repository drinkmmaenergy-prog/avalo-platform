/**
 * PACK 200 — Track Metrics (SORA Component)
 * 
 * Real-time metrics tracking across all system layers
 * Provides observability for mobile, API, functions, Firestore, Storage, Payments, and AI
 * 
 * COMPLIANCE:
 * - No user PII in metrics
 * - Alerts to engineering only, never to users/creators
 * - Privacy-safe aggregation
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

export type MetricLayer = 
  | 'MOBILE' 
  | 'API' 
  | 'FUNCTIONS' 
  | 'FIRESTORE' 
  | 'STORAGE' 
  | 'STRIPE' 
  | 'WISE' 
  | 'AI_ENGINES';

export type MetricType = 
  | 'LATENCY' 
  | 'ERROR_RATE' 
  | 'THROUGHPUT' 
  | 'MEMORY' 
  | 'FPS' 
  | 'COLD_START' 
  | 'RETRY' 
  | 'CONTENTION' 
  | 'TOKEN_USAGE' 
  | 'PAYMENT_DELAY';

export interface MetricData {
  metricId: string;
  timestamp: Timestamp;
  layer: MetricLayer;
  type: MetricType;
  service: string;
  value: number;
  unit: string;
  metadata?: {
    region?: string;
    functionName?: string;
    endpoint?: string;
    statusCode?: number;
    platform?: 'android' | 'ios' | 'web';
    appVersion?: string;
    deviceModel?: string;
  };
  aggregationWindow?: '1m' | '5m' | '15m' | '1h' | '24h';
  severity?: 'NORMAL' | 'WARNING' | 'CRITICAL';
  createdAt: Timestamp;
}

interface AggregatedMetrics {
  layer: MetricLayer;
  type: MetricType;
  service: string;
  window: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  timestamp: Timestamp;
}

/**
 * Track a single metric event
 * Auto-categorizes severity based on thresholds
 */
export async function trackMetric(input: {
  layer: MetricLayer;
  type: MetricType;
  service: string;
  value: number;
  unit: string;
  metadata?: MetricData['metadata'];
}): Promise<void> {
  try {
    const metricId = generateId();
    const severity = determineSeverity(input.type, input.value);
    
    const metric: MetricData = {
      metricId,
      timestamp: Timestamp.now(),
      layer: input.layer,
      type: input.type,
      service: input.service,
      value: input.value,
      unit: input.unit,
      metadata: input.metadata,
      severity,
      createdAt: serverTimestamp() as any,
    };
    
    await db.collection('system_metrics').doc(metricId).set(metric);
    
    if (severity === 'CRITICAL') {
      await triggerAlert(metric);
    }
  } catch (error) {
    console.error('[Metrics] Failed to track metric:', error);
  }
}

/**
 * Determine severity based on metric type and value
 */
function determineSeverity(type: MetricType, value: number): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  const thresholds: Record<MetricType, { warning: number; critical: number }> = {
    LATENCY: { warning: 500, critical: 2000 },
    ERROR_RATE: { warning: 0.01, critical: 0.05 },
    THROUGHPUT: { warning: 1000, critical: 10000 },
    MEMORY: { warning: 500, critical: 900 },
    FPS: { warning: 30, critical: 15 },
    COLD_START: { warning: 1000, critical: 3000 },
    RETRY: { warning: 3, critical: 5 },
    CONTENTION: { warning: 10, critical: 50 },
    TOKEN_USAGE: { warning: 100000, critical: 500000 },
    PAYMENT_DELAY: { warning: 5000, critical: 15000 },
  };
  
  const threshold = thresholds[type];
  if (!threshold) return 'NORMAL';
  
  if (type === 'FPS') {
    if (value < threshold.critical) return 'CRITICAL';
    if (value < threshold.warning) return 'WARNING';
    return 'NORMAL';
  }
  
  if (value >= threshold.critical) return 'CRITICAL';
  if (value >= threshold.warning) return 'WARNING';
  return 'NORMAL';
}

/**
 * Trigger engineering alert for critical metrics
 */
async function triggerAlert(metric: MetricData): Promise<void> {
  try {
    const alertId = generateId();
    
    await db.collection('engineering_alerts').doc(alertId).set({
      alertId,
      type: 'CRITICAL_METRIC',
      layer: metric.layer,
      metricType: metric.type,
      service: metric.service,
      value: metric.value,
      unit: metric.unit,
      metadata: metric.metadata,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      acknowledgedAt: null,
      resolvedAt: null,
    });
    
    console.error(`🚨 CRITICAL METRIC ALERT: ${metric.layer} ${metric.type} = ${metric.value}${metric.unit}`);
  } catch (error) {
    console.error('[Metrics] Failed to trigger alert:', error);
  }
}

/**
 * Aggregate metrics for analysis
 * Runs periodically to compute p50, p95, p99, etc.
 */
export async function aggregateMetrics(
  layer: MetricLayer,
  type: MetricType,
  service: string,
  windowMinutes: number
): Promise<AggregatedMetrics | null> {
  try {
    const now = Date.now();
    const windowStart = now - (windowMinutes * 60 * 1000);
    
    const snapshot = await db.collection('system_metrics')
      .where('layer', '==', layer)
      .where('type', '==', type)
      .where('service', '==', service)
      .where('timestamp', '>=', Timestamp.fromMillis(windowStart))
      .get();
    
    if (snapshot.empty) return null;
    
    const values = snapshot.docs
      .map(doc => doc.data().value)
      .filter(v => typeof v === 'number')
      .sort((a, b) => a - b);
    
    const count = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[count - 1];
    const p50 = values[Math.floor(count * 0.50)];
    const p95 = values[Math.floor(count * 0.95)];
    const p99 = values[Math.floor(count * 0.99)];
    
    const aggregated: AggregatedMetrics = {
      layer,
      type,
      service,
      window: `${windowMinutes}m`,
      count,
      sum,
      min,
      max,
      avg,
      p50,
      p95,
      p99,
      timestamp: Timestamp.now(),
    };
    
    const aggId = `${layer}_${type}_${service}_${windowMinutes}m_${Date.now()}`;
    await db.collection('aggregated_metrics').doc(aggId).set(aggregated);
    
    return aggregated;
  } catch (error) {
    console.error('[Metrics] Failed to aggregate metrics:', error);
    return null;
  }
}

/**
 * Track mobile client metrics (FPS, memory, crashes)
 */
export const trackMobileMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { metrics } = data;
  if (!Array.isArray(metrics)) {
    throw new functions.https.HttpsError('invalid-argument', 'Metrics must be an array');
  }
  
  try {
    const batch = db.batch();
    
    for (const m of metrics.slice(0, 50)) {
      const metricId = generateId();
      const metricRef = db.collection('system_metrics').doc(metricId);
      
      batch.set(metricRef, {
        metricId,
        timestamp: Timestamp.now(),
        layer: 'MOBILE',
        type: m.type,
        service: 'mobile-client',
        value: m.value,
        unit: m.unit,
        metadata: {
          platform: m.platform,
          appVersion: m.appVersion,
          deviceModel: m.deviceModel,
        },
        severity: determineSeverity(m.type, m.value),
        createdAt: serverTimestamp(),
      });
    }
    
    await batch.commit();
    
    return { success: true, tracked: metrics.length };
  } catch (error: any) {
    console.error('[Metrics] Error tracking mobile metrics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get metrics dashboard data
 * Engineering-only endpoint
 */
export const getMetricsDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !['ADMIN', 'ENGINEER'].includes(adminDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Engineering access required');
  }
  
  try {
    const { layer, timeRange = 60 } = data;
    const now = Date.now();
    const windowStart = now - (timeRange * 60 * 1000);
    
    let query = db.collection('system_metrics')
      .where('timestamp', '>=', Timestamp.fromMillis(windowStart))
      .orderBy('timestamp', 'desc')
      .limit(1000);
    
    if (layer) {
      query = query.where('layer', '==', layer);
    }
    
    const snapshot = await query.get();
    
    const metricsByLayer = new Map<MetricLayer, any[]>();
    const criticalMetrics: MetricData[] = [];
    
    for (const doc of snapshot.docs) {
      const metric = doc.data() as MetricData;
      
      if (!metricsByLayer.has(metric.layer)) {
        metricsByLayer.set(metric.layer, []);
      }
      metricsByLayer.get(metric.layer)!.push(metric);
      
      if (metric.severity === 'CRITICAL') {
        criticalMetrics.push(metric);
      }
    }
    
    return {
      success: true,
      metricsByLayer: Object.fromEntries(metricsByLayer),
      criticalCount: criticalMetrics.length,
      totalMetrics: snapshot.size,
      timeRange,
    };
  } catch (error: any) {
    console.error('[Metrics] Error getting dashboard:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled function to aggregate metrics every 5 minutes
 */
export const scheduled_aggregateMetrics = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      const layers: MetricLayer[] = ['MOBILE', 'API', 'FUNCTIONS', 'FIRESTORE', 'STORAGE', 'STRIPE', 'AI_ENGINES'];
      const types: MetricType[] = ['LATENCY', 'ERROR_RATE', 'THROUGHPUT'];
      
      for (const layer of layers) {
        for (const type of types) {
          await aggregateMetrics(layer, type, 'all', 5);
        }
      }
      
      console.log('[Metrics] Aggregation completed');
    } catch (error) {
      console.error('[Metrics] Aggregation failed:', error);
    }
  });