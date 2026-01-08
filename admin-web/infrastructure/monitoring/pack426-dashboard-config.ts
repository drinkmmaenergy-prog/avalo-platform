/**
 * PACK 426 — Global Performance Monitoring Dashboard Configuration
 * 
 * Real-time monitoring for multi-region infrastructure health,
 * performance metrics, and operational alerts.
 */

export interface DashboardMetric {
  id: string;
  name: string;
  description: string;
  query: string;
  threshold?: {
    warning: number;
    critical: number;
  };
  unit: string;
  chart: 'line' | 'bar' | 'gauge' | 'heatmap';
}

export interface DashboardPanel {
  id: string;
  title: string;
  metrics: DashboardMetric[];
  refreshInterval: number; // milliseconds
  size: 'small' | 'medium' | 'large' | 'full';
}

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

export const REGIONAL_LATENCY_METRICS: DashboardMetric[] = [
  {
    id: 'chat-latency-eu',
    name: 'Chat Latency (EU)',
    description: 'P95 chat message latency in EU region',
    query: 'infrastructure/metrics/chat/latency/EU/p95',
    threshold: {
      warning: 350,
      critical: 500,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'chat-latency-us',
    name: 'Chat Latency (US)',
    description: 'P95 chat message latency in US region',
    query: 'infrastructure/metrics/chat/latency/US/p95',
    threshold: {
      warning: 350,
      critical: 500,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'chat-latency-apac',
    name: 'Chat Latency (APAC)',
    description: 'P95 chat message latency in APAC region',
    query: 'infrastructure/metrics/chat/latency/APAC/p95',
    threshold: {
      warning: 350,
      critical: 500,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'swipe-latency-eu',
    name: 'Swipe Latency (EU)',
    description: 'P95 swipe action latency in EU region',
    query: 'infrastructure/metrics/swipe/latency/EU/p95',
    threshold: {
      warning: 200,
      critical: 300,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'swipe-latency-us',
    name: 'Swipe Latency (US)',
    description: 'P95 swipe action latency in US region',
    query: 'infrastructure/metrics/swipe/latency/US/p95',
    threshold: {
      warning: 200,
      critical: 300,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'swipe-latency-apac',
    name: 'Swipe Latency (APAC)',
    description: 'P95 swipe action latency in APAC region',
    query: 'infrastructure/metrics/swipe/latency/APAC/p95',
    threshold: {
      warning: 200,
      critical: 300,
    },
    unit: 'ms',
    chart: 'line',
  },
];

export const THROUGHPUT_METRICS: DashboardMetric[] = [
  {
    id: 'chat-throughput-global',
    name: 'Chat Throughput (Global)',
    description: 'Messages per minute across all regions',
    query: 'infrastructure/metrics/chat/throughput/global',
    unit: 'msg/min',
    chart: 'line',
  },
  {
    id: 'swipe-throughput-global',
    name: 'Swipe Throughput (Global)',
    description: 'Swipes per minute across all regions',
    query: 'infrastructure/metrics/swipe/throughput/global',
    unit: 'swipes/min',
    chart: 'line',
  },
  {
    id: 'ai-requests-global',
    name: 'AI Requests (Global)',
    description: 'AI API requests per minute',
    query: 'infrastructure/metrics/ai/requests/global',
    unit: 'req/min',
    chart: 'line',
  },
];

export const AI_USAGE_METRICS: DashboardMetric[] = [
  {
    id: 'ai-tokens-eu',
    name: 'AI Token Usage (EU)',
    description: 'Tokens consumed per hour in EU region',
    query: 'infrastructure/aiQuota/hourly/EU/tokensUsed',
    threshold: {
      warning: 800_000,
      critical: 950_000,
    },
    unit: 'tokens',
    chart: 'gauge',
  },
  {
    id: 'ai-tokens-us',
    name: 'AI Token Usage (US)',
    description: 'Tokens consumed per hour in US region',
    query: 'infrastructure/aiQuota/hourly/US/tokensUsed',
    threshold: {
      warning: 800_000,
      critical: 950_000,
    },
    unit: 'tokens',
    chart: 'gauge',
  },
  {
    id: 'ai-tokens-apac',
    name: 'AI Token Usage (APAC)',
    description: 'Tokens consumed per hour in APAC region',
    query: 'infrastructure/aiQuota/hourly/APAC/tokensUsed',
    threshold: {
      warning: 400_000,
      critical: 475_000,
    },
    unit: 'tokens',
    chart: 'gauge',
  },
  {
    id: 'ai-failure-rate',
    name: 'AI Failure Rate',
    description: 'Percentage of failed AI requests',
    query: 'infrastructure/aiMetrics/failureRate',
    threshold: {
      warning: 3,
      critical: 5,
    },
    unit: '%',
    chart: 'line',
  },
];

export const CDN_METRICS: DashboardMetric[] = [
  {
    id: 'cdn-cache-hit-rate',
    name: 'CDN Cache Hit Rate',
    description: 'Percentage of requests served from cache',
    query: 'infrastructure/cdn/cacheHitRate',
    threshold: {
      warning: 70,
      critical: 60,
    },
    unit: '%',
    chart: 'gauge',
  },
  {
    id: 'cdn-bandwidth',
    name: 'CDN Bandwidth',
    description: 'Total bandwidth usage across all regions',
    query: 'infrastructure/cdn/bandwidth',
    unit: 'GB/hour',
    chart: 'line',
  },
  {
    id: 'cdn-miss-rate',
    name: 'CDN Miss Rate',
    description: 'Percentage of cache misses',
    query: 'infrastructure/cdn/missRate',
    threshold: {
      warning: 15,
      critical: 25,
    },
    unit: '%',
    chart: 'line',
  },
];

export const FEED_METRICS: DashboardMetric[] = [
  {
    id: 'feed-load-time-eu',
    name: 'Feed Load Time (EU)',
    description: 'Time to load feed posts in EU region',
    query: 'infrastructure/metrics/feed/loadTime/EU',
    threshold: {
      warning: 800,
      critical: 1200,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'feed-load-time-us',
    name: 'Feed Load Time (US)',
    description: 'Time to load feed posts in US region',
    query: 'infrastructure/metrics/feed/loadTime/US',
    threshold: {
      warning: 800,
      critical: 1200,
    },
    unit: 'ms',
    chart: 'line',
  },
  {
    id: 'feed-load-time-apac',
    name: 'Feed Load Time (APAC)',
    description: 'Time to load feed posts in APAC region',
    query: 'infrastructure/metrics/feed/loadTime/APAC',
    threshold: {
      warning: 800,
      critical: 1200,
    },
    unit: 'ms',
    chart: 'line',
  },
];

export const ERROR_METRICS: DashboardMetric[] = [
  {
    id: 'regional-errors-eu',
    name: 'Error Rate (EU)',
    description: 'Error rate in EU region',
    query: 'infrastructure/regionHealth/regions/EU/errorRate',
    threshold: {
      warning: 1,
      critical: 5,
    },
    unit: '%',
    chart: 'line',
  },
  {
    id: 'regional-errors-us',
    name: 'Error Rate (US)',
    description: 'Error rate in US region',
    query: 'infrastructure/regionHealth/regions/US/errorRate',
    threshold: {
      warning: 1,
      critical: 5,
    },
    unit: '%',
    chart: 'line',
  },
  {
    id: 'regional-errors-apac',
    name: 'Error Rate (APAC)',
    description: 'Error rate in APAC region',
    query: 'infrastructure/regionHealth/regions/APAC/errorRate',
    threshold: {
      warning: 1,
      critical: 5,
    },
    unit: '%',
    chart: 'line',
  },
];

export const FRAUD_METRICS: DashboardMetric[] = [
  {
    id: 'fraud-detections-hourly',
    name: 'Fraud Detections',
    description: 'Number of fraud detections per hour',
    query: 'infrastructure/fraudMetrics/hourly/total',
    threshold: {
      warning: 50,
      critical: 100,
    },
    unit: 'detections',
    chart: 'bar',
  },
  {
    id: 'high-risk-users',
    name: 'High Risk Users',
    description: 'Number of users with high fraud risk',
    query: 'infrastructure/fraudMetrics/highRiskCount',
    threshold: {
      warning: 100,
      critical: 200,
    },
    unit: 'users',
    chart: 'gauge',
  },
];

// ============================================================================
// DASHBOARD PANELS
// ============================================================================

export const DASHBOARD_PANELS: DashboardPanel[] = [
  {
    id: 'regional-latency',
    title: 'Regional Latency (P95)',
    metrics: REGIONAL_LATENCY_METRICS,
    refreshInterval: 30000, // 30 seconds
    size: 'large',
  },
  {
    id: 'throughput',
    title: 'Global Throughput',
    metrics: THROUGHPUT_METRICS,
    refreshInterval: 10000, // 10 seconds
    size: 'medium',
  },
  {
    id: 'ai-usage',
    title: 'AI Infrastructure',
    metrics: AI_USAGE_METRICS,
    refreshInterval: 60000, // 1 minute
    size: 'medium',
  },
  {
    id: 'cdn-performance',
    title: 'CDN Performance',
    metrics: CDN_METRICS,
    refreshInterval: 30000, // 30 seconds
    size: 'medium',
  },
  {
    id: 'feed-performance',
    title: 'Feed Performance',
    metrics: FEED_METRICS,
    refreshInterval: 30000, // 30 seconds
    size: 'medium',
  },
  {
    id: 'error-tracking',
    title: 'Regional Error Rates',
    metrics: ERROR_METRICS,
    refreshInterval: 30000, // 30 seconds
    size: 'medium',
  },
  {
    id: 'fraud-monitoring',
    title: 'Fraud Detection',
    metrics: FRAUD_METRICS,
    refreshInterval: 60000, // 1 minute
    size: 'small',
  },
];

// ============================================================================
// ALERT CONFIGURATIONS
// ============================================================================

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'equals';
  threshold: number;
  duration: number; // milliseconds
  severity: 'warning' | 'critical';
  channels: Array<'slack' | 'email' | 'pagerduty' | 'sms'>;
  message: string;
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'chat-latency-critical',
    name: 'Chat Latency Critical',
    metric: 'chat-latency',
    condition: 'above',
    threshold: 500,
    duration: 120000, // 2 minutes
    severity: 'critical',
    channels: ['pagerduty', 'slack', 'sms'],
    message: 'Chat latency exceeds 500ms for over 2 minutes',
  },
  {
    id: 'swipe-latency-critical',
    name: 'Swipe Latency Critical',
    metric: 'swipe-latency',
    condition: 'above',
    threshold: 300,
    duration: 120000,
    severity: 'critical',
    channels: ['pagerduty', 'slack'],
    message: 'Swipe latency exceeds 300ms for over 2 minutes',
  },
  {
    id: 'ai-failure-critical',
    name: 'AI Failure Rate Critical',
    metric: 'ai-failure-rate',
    condition: 'above',
    threshold: 5,
    duration: 300000, // 5 minutes
    severity: 'critical',
    channels: ['pagerduty', 'slack', 'email'],
    message: 'AI failure rate exceeds 5% for over 5 minutes',
  },
  {
    id: 'region-outage',
    name: 'Region Outage Detected',
    metric: 'region-healthy',
    condition: 'equals',
    threshold: 0,
    duration: 60000, // 1 minute
    severity: 'critical',
    channels: ['pagerduty', 'slack', 'sms', 'email'],
    message: 'Region is unhealthy for over 1 minute - potential outage',
  },
  {
    id: 'cdn-miss-warning',
    name: 'CDN Cache Miss Rate High',
    metric: 'cdn-miss-rate',
    condition: 'above',
    threshold: 15,
    duration: 600000, // 10 minutes
    severity: 'warning',
    channels: ['slack', 'email'],
    message: 'CDN miss rate above 15% for 10+ minutes',
  },
  {
    id: 'fraud-spike',
    name: 'Fraud Detection Spike',
    metric: 'fraud-detections-hourly',
    condition: 'above',
    threshold: 100,
    duration: 300000, // 5 minutes
    severity: 'warning',
    channels: ['slack', 'email'],
    message: 'Unusual spike in fraud detections detected',
  },
  {
    id: 'error-rate-high',
    name: 'High Error Rate',
    metric: 'regional-errors',
    condition: 'above',
    threshold: 5,
    duration: 180000, // 3 minutes
    severity: 'critical',
    channels: ['pagerduty', 'slack'],
    message: 'Regional error rate exceeds 5% for 3+ minutes',
  },
];

// ============================================================================
// DASHBOARD CONFIGURATION
// ============================================================================

export const DASHBOARD_CONFIG = {
  title: 'PACK 426 — Global Infrastructure Monitoring',
  description: 'Real-time monitoring of multi-region infrastructure',
  refreshInterval: 30000, // 30 seconds (default)
  panels: DASHBOARD_PANELS,
  alerts: ALERT_RULES,
  integrations: {
    slack: {
      enabled: true,
      webhook: process.env.SLACK_WEBHOOK_URL,
      channel: '#infrastructure-alerts',
    },
    pagerduty: {
      enabled: true,
      apiKey: process.env.PAGERDUTY_API_KEY,
      serviceId: process.env.PAGERDUTY_SERVICE_ID,
    },
    email: {
      enabled: true,
      recipients: ['ops@avalo.app', 'engineering@avalo.app'],
    },
  },
  features: {
    historicalData: true,
    anomalyDetection: true,
    predictiveAlerts: true,
    customDashboards: true,
  },
};

export default DASHBOARD_CONFIG;
