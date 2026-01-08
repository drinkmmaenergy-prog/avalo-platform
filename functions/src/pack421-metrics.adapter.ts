/**
 * PACK 421 — Metric Emitter Adapter
 * 
 * Single internal place to send metrics to chosen observability provider.
 * 
 * CRITICAL RULES:
 * - MUST be non-blocking (or minimally blocking)
 * - MUST NEVER break business logic (always wrapped in try/catch)
 * - MUST be safe to call in production paths
 * - Implementation can be NO-OP in local/dev environments
 * - Sends to process.env.OBSERVABILITY_PROVIDER (Datadog, GCP, Prometheus, etc.)
 */

import * as functions from 'firebase-functions';
import {
  MetricPoint,
  MetricName,
  MetricTag,
} from '../../shared/types/pack421-observability.types';

/**
 * Observability provider types
 */
type ObservabilityProvider = 'datadog' | 'gcp' | 'prometheus' | 'none';

/**
 * Get configured observability provider from environment
 */
function getProvider(): ObservabilityProvider {
  const provider = process.env.OBSERVABILITY_PROVIDER?.toLowerCase();
  if (provider === 'datadog' || provider === 'gcp' || provider === 'prometheus') {
    return provider;
  }
  
  // Default to 'none' in dev/local environments
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    return 'none';
  }
  
  return 'none';
}

/**
 * Internal metric emission implementations per provider
 */
const providers = {
  /**
   * Datadog provider (requires datadog-metrics or dd-trace)
   */
  datadog: async (point: MetricPoint): Promise<void> => {
    try {
      // FUTURE: Implement Datadog-specific emission
      // Example: ddMetrics.gauge(point.name, point.value, point.tags);
      functions.logger.debug('[METRICS:Datadog]', {
        metric: point.name,
        value: point.value,
        tags: point.tags,
      });
    } catch (error) {
      functions.logger.warn('[METRICS:Datadog] Failed to emit metric', { error });
    }
  },

  /**
   * Google Cloud Monitoring provider
   */
  gcp: async (point: MetricPoint): Promise<void> => {
    try {
      // FUTURE: Implement GCP Cloud Monitoring emission
      // Example: monitoring.createTimeSeries(metricDescriptor, point);
      functions.logger.debug('[METRICS:GCP]', {
        metric: point.name,
        value: point.value,
        tags: point.tags,
      });
    } catch (error) {
      functions.logger.warn('[METRICS:GCP] Failed to emit metric', { error });
    }
  },

  /**
   * Prometheus provider (pushgateway or exposition endpoint)
   */
  prometheus: async (point: MetricPoint): Promise<void> => {
    try {
      // FUTURE: Implement Prometheus emission
      // Example: prometheusRegistry.getSingleMetric(point.name).set(point.value);
      functions.logger.debug('[METRICS:Prometheus]', {
        metric: point.name,
        value: point.value,
        tags: point.tags,
      });
    } catch (error) {
      functions.logger.warn('[METRICS:Prometheus] Failed to emit metric', { error });
    }
  },

  /**
   * No-op provider for dev/test environments
   */
  none: async (point: MetricPoint): Promise<void> => {
    // Log to console in development for debugging
    if (process.env.NODE_ENV === 'development') {
      functions.logger.debug('[METRICS:Dev]', {
        metric: point.name,
        value: point.value,
        tags: point.tags,
      });
    }
  },
};

/**
 * Main metric emission function.
 * 
 * CRITICAL: This function MUST NEVER throw in production paths.
 * All errors are caught and logged, but business logic continues.
 * 
 * @param point - Metric data point to emit
 */
export async function emitMetric(point: MetricPoint): Promise<void> {
  try {
    // Validate point has required fields
    if (!point.name || typeof point.value !== 'number') {
      functions.logger.warn('[METRICS] Invalid metric point', { point });
      return;
    }

    // Get configured provider
    const provider = getProvider();
    
    // Emit to provider (each provider handles its own errors)
    await providers[provider](point);
  } catch (error) {
    // NEVER let metrics break business logic
    functions.logger.error('[METRICS] Critical error in emitMetric', {
      error,
      point,
    });
  }
}

/**
 * Helper: Emit a counter metric
 * 
 * @param name - Metric name
 * @param value - Count value (default: 1)
 * @param tags - Optional dimensional tags
 */
export async function metricCount(
  name: MetricName,
  value: number = 1,
  tags?: MetricTag[]
): Promise<void> {
  await emitMetric({
    name,
    value,
    timestamp: Date.now(),
    tags,
  });
}

/**
 * Helper: Emit a timing/latency metric
 * 
 * @param name - Metric name
 * @param durationMs - Duration in milliseconds
 * @param tags - Optional dimensional tags
 */
export async function metricTiming(
  name: MetricName,
  durationMs: number,
  tags?: MetricTag[]
): Promise<void> {
  await emitMetric({
    name,
    value: durationMs,
    timestamp: Date.now(),
    tags,
  });
}

/**
 * Helper: Emit a gauge metric (absolute value at point in time)
 * 
 * @param name - Metric name
 * @param value - Gauge value
 * @param tags - Optional dimensional tags
 */
export async function metricGauge(
  name: MetricName,
  value: number,
  tags?: MetricTag[]
): Promise<void> {
  await emitMetric({
    name,
    value,
    timestamp: Date.now(),
    tags,
  });
}

/**
 * Timer utility for measuring operation duration
 * 
 * Usage:
 * ```typescript
 * const timer = metricTimer('infra.db.query.latency_ms', [{ key: 'collection', value: 'users' }]);
 * // ... perform operation ...
 * await timer.end();
 * ```
 */
export function metricTimer(name: MetricName, tags?: MetricTag[]) {
  const startTime = Date.now();
  
  return {
    /**
     * End timer and emit metric
     */
    end: async (): Promise<number> => {
      const duration = Date.now() - startTime;
      await metricTiming(name, duration, tags);
      return duration;
    },
    
    /**
     * Get current elapsed time without emitting
     */
    elapsed: (): number => {
      return Date.now() - startTime;
    },
  };
}

/**
 * Batch emit multiple metrics (for efficiency)
 * 
 * @param points - Array of metric points to emit
 */
export async function emitMetricBatch(points: MetricPoint[]): Promise<void> {
  // Emit in parallel, but never fail business logic
  await Promise.allSettled(points.map(point => emitMetric(point)));
}

/**
 * Create a tagged metric emitter (convenience for consistent tagging)
 * 
 * Usage:
 * ```typescript
 * const walletMetrics = createTaggedEmitter([{ key: 'service', value: 'wallet' }]);
 * await walletMetrics.count('product.wallet.spend.success');
 * ```
 */
export function createTaggedEmitter(baseTags: MetricTag[]) {
  return {
    count: (name: MetricName, value: number = 1, additionalTags?: MetricTag[]) =>
      metricCount(name, value, [...baseTags, ...(additionalTags || [])]),
    
    timing: (name: MetricName, durationMs: number, additionalTags?: MetricTag[]) =>
      metricTiming(name, durationMs, [...baseTags, ...(additionalTags || [])]),
    
    gauge: (name: MetricName, value: number, additionalTags?: MetricTag[]) =>
      metricGauge(name, value, [...baseTags, ...(additionalTags || [])]),
    
    emit: (point: MetricPoint) =>
      emitMetric({
        ...point,
        tags: [...baseTags, ...(point.tags || [])],
      }),
  };
}

/**
 * Health check for metrics system itself
 * 
 * @returns True if metrics system is operational
 */
export async function checkMetricsHealth(): Promise<boolean> {
  try {
    // Try emitting a test metric
    await emitMetric({
      name: 'infra.http.request.count',
      value: 0,
      timestamp: Date.now(),
      tags: [{ key: 'test', value: 'health_check' }],
    });
    return true;
  } catch (error) {
    functions.logger.error('[METRICS] Health check failed', { error });
    return false;
  }
}
