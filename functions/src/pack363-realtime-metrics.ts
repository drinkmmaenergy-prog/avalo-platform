/**
 * PACK 363 — Realtime Metrics & Monitoring
 * 
 * Tracks and reports realtime system performance:
 * - Message delivery latency (target: P95 < 250ms)
 * - Channel-specific metrics
 * - Failure rates
 * - Reconnection attempts
 * - Priority event handling
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type RealtimeChannelType = 'chat' | 'aiChat' | 'wallet' | 'support' | 'safety';

interface LatencyMetric {
  channel: RealtimeChannelType;
  eventType: string;
  latency: number;
  timestamp: FirebaseFirestore.Timestamp;
}

interface AggregatedMetrics {
  channel: RealtimeChannelType;
  period: string; // e.g., '2025-12-19-21'
  totalEvents: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  failureCount: number;
  failureRate: number;
}

// ============================================================================
// LATENCY TRACKING
// ============================================================================

/**
 * Process individual latency metrics
 */
export const trackLatency = functions.firestore
  .document('pack363_metrics/{metricId}')
  .onCreate(async (snap, context) => {
    const metric = snap.data();

    if (metric.type !== 'latency') return;

    try {
      const latency = metric.latency;
      const channel = metric.channel;

      // Alert on high latency
      if (latency > 250) {
        await logHighLatency(channel, metric.eventType, latency);
      }

      // Track in aggregation bucket
      const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const bucketRef = db.collection('pack363_latency_buckets').doc(`${channel}-${hour}`);

      await bucketRef.set({
        channel,
        period: hour,
        latencies: admin.firestore.FieldValue.arrayUnion(latency),
        eventCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.error('[Metrics] Latency tracking error:', error);
    }
  });

/**
 * Log high latency events for investigation
 */
async function logHighLatency(
  channel: RealtimeChannelType,
  eventType: string,
  latency: number
) {
  try {
    await db.collection('pack363_latency_alerts').add({
      channel,
      eventType,
      latency,
      threshold: 250,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      severity: latency > 1000 ? 'critical' : latency > 500 ? 'high' : 'warning'
    });

    console.warn(`[LATENCY ALERT] ${channel}:${eventType} - ${latency}ms`);
  } catch (error) {
    console.error('[Metrics] Failed to log high latency:', error);
  }
}

// ============================================================================
// AGGREGATION (HOURLY)
// ============================================================================

/**
 * Aggregate metrics hourly
 */
export const aggregateMetricsHourly = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const period = lastHour.toISOString().slice(0, 13);

    const channels: RealtimeChannelType[] = ['chat', 'aiChat', 'wallet', 'support', 'safety'];

    for (const channel of channels) {
      try {
        await aggregateChannelMetrics(channel, period);
      } catch (error) {
        console.error(`[Metrics] Aggregation error for ${channel}:`, error);
      }
    }

    console.log(`[Metrics] Hourly aggregation completed for period: ${period}`);
    return null;
  });

/**
 * Aggregate metrics for a specific channel
 */
async function aggregateChannelMetrics(
  channel: RealtimeChannelType,
  period: string
) {
  // Get latency bucket
  const bucketDoc = await db
    .collection('pack363_latency_buckets')
    .doc(`${channel}-${period}`)
    .get();

  if (!bucketDoc.exists) {
    console.log(`[Metrics] No data for ${channel} in period ${period}`);
    return;
  }

  const data = bucketDoc.data()!;
  const latencies: number[] = data.latencies || [];

  if (latencies.length === 0) return;

  // Calculate percentiles
  const sortedLatencies = latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p99Index = Math.floor(sortedLatencies.length * 0.99);

  const p95Latency = sortedLatencies[p95Index] || 0;
  const p99Latency = sortedLatencies[p99Index] || 0;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  // Get failure count
  const failureSnapshot = await db
    .collection('pack363_metrics')
    .where('channel', '==', channel)
    .where('type', '==', 'publish')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(new Date(period)))
    .where('timestamp', '<', admin.firestore.Timestamp.fromDate(new Date(period + ':59:59')))
    .get();

  const failureCount = failureSnapshot.docs.filter(doc => 
    doc.data().error !== undefined
  ).length;

  const totalEvents = data.eventCount || latencies.length;
  const failureRate = totalEvents > 0 ? failureCount / totalEvents : 0;

  // Store aggregated metrics
  const aggregated: AggregatedMetrics = {
    channel,
    period,
    totalEvents,
    avgLatency: Math.round(avgLatency),
    p95Latency,
    p99Latency,
    failureCount,
    failureRate: Math.round(failureRate * 10000) / 100 // percentage with 2 decimals
  };

  await db.collection('pack363_aggregated_metrics').add({
    ...aggregated,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Alert if P95 exceeds target
  if (p95Latency > 250) {
    await db.collection('pack363_sla_violations').add({
      channel,
      period,
      metric: 'p95_latency',
      target: 250,
      actual: p95Latency,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.error(`[SLA VIOLATION] ${channel} P95 latency: ${p95Latency}ms (target: 250ms)`);
  }

  console.log(`[Metrics] Aggregated ${channel}: P95=${p95Latency}ms, Failures=${failureRate}%`);
}

// ============================================================================
// DASHBOARD DATA GENERATOR
// ============================================================================

/**
 * Generate dashboard summary data
 */
export const generateDashboardData = functions.https.onRequest(async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const now = new Date();
    const since = new Date(now.getTime() - hours * 60 * 60 * 1000);

    // Get aggregated metrics
    const metricsSnapshot = await db
      .collection('pack363_aggregated_metrics')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since))
      .orderBy('createdAt', 'desc')
      .get();

    const metricsByChannel: Record<string, any[]> = {
      chat: [],
      aiChat: [],
      wallet: [],
      support: [],
      safety: []
    };

    metricsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (metricsByChannel[data.channel]) {
        metricsByChannel[data.channel].push(data);
      }
    });

    // Get recent alerts
    const alertsSnapshot = await db
      .collection('pack363_latency_alerts')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(since))
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const alerts = alertsSnapshot.docs.map(doc => doc.data());

    // Calculate overall health
    const overallHealth = calculateHealthScore(metricsByChannel);

    res.json({
      success: true,
      data: {
        metricsByChannel,
        alerts,
        overallHealth,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Metrics] Dashboard data generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Calculate health score based on metrics
 */
function calculateHealthScore(metricsByChannel: Record<string, any[]>): any {
  const channels = Object.keys(metricsByChannel);
  let totalScore = 0;
  let channelScores: Record<string, number> = {};

  for (const channel of channels) {
    const metrics = metricsByChannel[channel];
    if (metrics.length === 0) {
      channelScores[channel] = 100; // No data = assume healthy
      continue;
    }

    // Get latest metric
    const latest = metrics[0];

    // Score based on latency (0-50 points)
    const latencyScore = latest.p95Latency <= 250 ? 50 : 
                         Math.max(0, 50 - (latest.p95Latency - 250) / 10);

    // Score based on failure rate (0-50 points)
    const failureScore = latest.failureRate <= 1 ? 50 :
                         Math.max(0, 50 - latest.failureRate * 10);

    const channelScore = Math.round(latencyScore + failureScore);
    channelScores[channel] = channelScore;
    totalScore += channelScore;
  }

  const overallScore = Math.round(totalScore / channels.length);

  return {
    overall: overallScore,
    status: overallScore >= 90 ? 'healthy' : overallScore >= 70 ? 'degraded' : 'unhealthy',
    byChannel: channelScores
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old metrics data
 */
export const cleanupOldMetrics = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const cutoffTime = admin.firestore.Timestamp.fromMillis(
      Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago
    );

    const collections = [
      'pack363_metrics',
      'pack363_latency_buckets',
      'pack363_latency_alerts'
    ];

    let totalDeleted = 0;

    for (const collectionName of collections) {
      try {
        const snapshot = await db
          .collection(collectionName)
          .where('timestamp', '<', cutoffTime)
          .limit(500)
          .get();

        if (snapshot.empty) continue;

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        totalDeleted += snapshot.size;
      } catch (error) {
        console.error(`[Metrics] Cleanup error for ${collectionName}:`, error);
      }
    }

    console.log(`[Metrics] Cleaned up ${totalDeleted} old metric records`);
    return null;
  });

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackLatency,
  aggregateMetricsHourly,
  generateDashboardData,
  cleanupOldMetrics
};
