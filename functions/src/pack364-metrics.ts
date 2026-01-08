/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Metrics & Counters
 * 
 * Core metrics collection system compatible with external monitoring providers.
 * Wraps metric collection with storage in Firestore for internal dashboards.
 */

import * as admin from "firebase-admin";

/**
 * Metric types
 */
export type MetricType = "counter" | "gauge" | "histogram";

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Metrics configuration
 */
interface MetricsConfig {
  enabled: boolean;
  flushIntervalMs: number;
  maxBufferSize: number;
}

/**
 * Default metrics configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  enabled: true,
  flushIntervalMs: 60000, // Flush every minute
  maxBufferSize: 1000
};

let config: MetricsConfig = { ...DEFAULT_CONFIG };

// In-memory metric buffers
const counterBuffer: Map<string, number> = new Map();
const gaugeBuffer: Map<string, number> = new Map();
const histogramBuffer: Map<string, number[]> = new Map();

// Flush timer
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Configure metrics system
 */
export function configureMetrics(newConfig: Partial<MetricsConfig>): void {
  config = { ...config, ...newConfig };
  
  // Restart flush timer if needed
  if (flushTimer) {
    clearInterval(flushTimer);
  }
  
  if (config.enabled && config.flushIntervalMs > 0) {
    flushTimer = setInterval(() => {
      flushMetrics().catch(console.error);
    }, config.flushIntervalMs);
  }
}

/**
 * Get metric key with labels
 */
function getMetricKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return name;
  }
  
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  
  return `${name}{${labelStr}}`;
}

/**
 * Increment a counter metric
 * @example incCounter("chat_messages_sent_total", { domain: "chat" })
 */
export function incCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
  if (!config.enabled) return;
  
  const key = getMetricKey(name, labels);
  const current = counterBuffer.get(key) || 0;
  counterBuffer.set(key, current + value);
  
  // Auto-flush if buffer is too large
  if (counterBuffer.size >= config.maxBufferSize) {
    flushMetrics().catch(console.error);
  }
}

/**
 * Set a gauge metric
 * @example setGauge("active_users", { region: "eu" }, 1500)
 */
export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
  if (!config.enabled) return;
  
  const key = getMetricKey(name, labels);
  gaugeBuffer.set(key, value);
  
  // Auto-flush if buffer is too large
  if (gaugeBuffer.size >= config.maxBufferSize) {
    flushMetrics().catch(console.error);
  }
}

/**
 * Observe a latency/duration metric
 * @example observeLatency("chat_delivery_latency_ms", 150, { domain: "chat" })
 */
export function observeLatency(name: string, ms: number, labels?: Record<string, string>): void {
  if (!config.enabled) return;
  
  const key = getMetricKey(name, labels);
  const current = histogramBuffer.get(key) || [];
  current.push(ms);
  histogramBuffer.set(key, current);
  
  // Auto-flush if buffer is too large
  if (histogramBuffer.size >= config.maxBufferSize) {
    flushMetrics().catch(console.error);
  }
}

/**
 * Parse metric key back to name and labels
 */
function parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
  const bracketIndex = key.indexOf("{");
  
  if (bracketIndex === -1) {
    return { name: key, labels: {} };
  }
  
  const name = key.substring(0, bracketIndex);
  const labelStr = key.substring(bracketIndex + 1, key.length - 1);
  
  const labels: Record<string, string> = {};
  if (labelStr) {
    labelStr.split(",").forEach(pair => {
      const [k, v] = pair.split("=");
      labels[k] = v;
    });
  }
  
  return { name, labels };
}

/**
 * Calculate histogram statistics
 */
function calculateHistogramStats(values: number[]): {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
} {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, count: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    p50: sorted[Math.floor(values.length * 0.5)],
    p95: sorted[Math.floor(values.length * 0.95)],
    p99: sorted[Math.floor(values.length * 0.99)],
    count: values.length
  };
}

/**
 * Flush metrics to Firestore
 */
export async function flushMetrics(): Promise<void> {
  if (!config.enabled) return;
  
  const db = admin.firestore();
  const batch = db.batch();
  const timestamp = Date.now();
  let batchCount = 0;
  
  try {
    // Flush counters
    for (const [key, value] of counterBuffer.entries()) {
      const { name, labels } = parseMetricKey(key);
      const docRef = db.collection("metrics").doc();
      
      batch.set(docRef, {
        name,
        type: "counter",
        value,
        labels,
        timestamp
      });
      
      batchCount++;
      
      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }
    counterBuffer.clear();
    
    // Flush gauges
    for (const [key, value] of gaugeBuffer.entries()) {
      const { name, labels } = parseMetricKey(key);
      const docRef = db.collection("metrics").doc();
      
      batch.set(docRef, {
        name,
        type: "gauge",
        value,
        labels,
        timestamp
      });
      
      batchCount++;
      
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }
    gaugeBuffer.clear();
    
    // Flush histograms
    for (const [key, values] of histogramBuffer.entries()) {
      const { name, labels } = parseMetricKey(key);
      const stats = calculateHistogramStats(values);
      const docRef = db.collection("metrics").doc();
      
      batch.set(docRef, {
        name,
        type: "histogram",
        stats,
        labels,
        timestamp
      });
      
      batchCount++;
      
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }
    histogramBuffer.clear();
    
    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    console.error("[METRICS] Failed to flush metrics:", error);
    // Don't clear buffers on error - will retry next flush
  }
}

/**
 * Query metrics with filters
 */
export async function queryMetrics(filters: {
  name?: string;
  type?: MetricType;
  startTime?: number;
  endTime?: number;
  labels?: Record<string, string>;
  limit?: number;
}): Promise<MetricDataPoint[]> {
  const db = admin.firestore();
  let query: admin.firestore.Query = db.collection("metrics");
  
  // Apply filters
  if (filters.name) {
    query = query.where("name", "==", filters.name);
  }
  if (filters.type) {
    query = query.where("type", "==", filters.type);
  }
  if (filters.startTime) {
    query = query.where("timestamp", ">=", filters.startTime);
  }
  if (filters.endTime) {
    query = query.where("timestamp", "<=", filters.endTime);
  }
  if (filters.labels) {
    for (const [key, value] of Object.entries(filters.labels)) {
      query = query.where(`labels.${key}`, "==", value);
    }
  }
  
  // Order by timestamp descending
  query = query.orderBy("timestamp", "desc");
  
  // Apply limit
  query = query.limit(filters.limit || 100);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: data.name,
      type: data.type,
      value: data.value || data.stats?.mean || 0,
      labels: data.labels || {},
      timestamp: data.timestamp
    };
  });
}

/**
 * Predefined metric names for consistent usage across the codebase
 */
export const METRIC_NAMES = {
  // Chat metrics
  CHAT_MESSAGES_SENT_TOTAL: "chat_messages_sent_total",
  CHAT_DELIVERY_LATENCY_MS: "chat_delivery_latency_ms",
  CHAT_ERRORS_TOTAL: "chat_errors_total",
  
  // Wallet metrics
  WALLET_TX_SUCCESS_TOTAL: "wallet_tx_success_total",
  WALLET_TX_FAILED_TOTAL: "wallet_tx_failed_total",
  WALLET_TX_LATENCY_MS: "wallet_tx_latency_ms",
  WALLET_BALANCE: "wallet_balance",
  
  // Panic/Safety metrics
  PANIC_EVENTS_TOTAL: "panic_events_total",
  PANIC_LATENCY_MS: "panic_latency_ms",
  
  // AI metrics
  AI_REQUESTS_TOTAL: "ai_requests_total",
  AI_FAILURES_TOTAL: "ai_failures_total",
  AI_LATENCY_MS: "ai_latency_ms",
  
  // Support metrics
  SUPPORT_TICKETS_CREATED_TOTAL: "support_tickets_created_total",
  SUPPORT_TICKET_REPLY_LATENCY_MS: "support_ticket_reply_latency_ms",
  
  // Infrastructure metrics
  API_HTTP_ERRORS_TOTAL: "api_http_errors_total",
  API_HTTP_REQUESTS_TOTAL: "api_http_requests_total",
  INFRA_REGION_LATENCY_MS: "infra_region_latency_ms",
  
  // Resource metrics
  ACTIVE_USERS: "active_users",
  CONNECTION_POOL_SIZE: "connection_pool_size"
} as const;

/**
 * Stop metrics collection and cleanup
 */
export function stopMetrics(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  
  // Final flush
  flushMetrics().catch(console.error);
}

// Initialize with default config
configureMetrics({});
