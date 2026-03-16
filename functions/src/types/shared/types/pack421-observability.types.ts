import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Pack 421 - Observability Types
export interface MetricPoint {
  name?: string;
  value?: number;
  timestamp?: any;
  tags?: Record<string, string> | MetricTag[];
  [key: string]: any;
}

export interface TraceSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  operationName?: string;
  startTime?: any;
  endTime?: any;
  tags?: Record<string, string>;
  logs?: SpanLog[];
  [key: string]: any;
}

export interface SpanLog {
  timestamp?: any;
  message?: string;
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  [key: string]: any;
}

export interface AlertRule {
  id?: string;
  name?: string;
  condition?: string;
  threshold?: number;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'P0' | 'P1' | 'P2' | 'P3';
  enabled?: boolean;
  [key: string]: any;
}

export interface AlertEvent {
  id?: string;
  ruleId?: string;
  triggeredAt?: any;
  resolvedAt?: any;
  status?: 'FIRING' | 'RESOLVED';
  [key: string]: any;
}

export interface DashboardConfig {
  id?: string;
  name?: string;
  panels?: DashboardPanel[];
  [key: string]: any;
}

export interface DashboardPanel {
  id?: string;
  type?: 'CHART' | 'TABLE' | 'STAT' | 'LOG';
  query?: string;
  [key: string]: any;
}

export interface HealthCheck {
  service?: string;
  status?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  latencyMs?: number;
  lastChecked?: any;
  [key: string]: any;
}


// Additional exports for pack421-alerting.config.ts, pack421-health.controller.ts, pack421-metrics.adapter.ts
export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertChannel = 'SLACK' | 'PAGERDUTY' | 'EMAIL' | 'SMS' | 'WEBHOOK' | 'oncall_slack' | 'oncall_pagerduty' | 'oncall_email' | 'oncall_sms' | 'email_ops' | 'email_finance' | 'safety_team' | 'pagerduty' | 'webhook';
export type MetricName = string;

export interface MetricTag  {
  key: string;
  value: string;
  [key: string]: any;
}

export interface HealthCheckResponse  {
  status: HealthStatus;
  components?: HealthComponent[];
  timestamp?: any;
  version?: string;
  environment?: string;
  [key: string]: any;
}

export interface HealthComponent  {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastChecked?: any;
  [key: string]: any;
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'ok' | 'error' | 'degraded';

export interface FeatureMatrixResponse  {
  features: FeatureStatus[] | Record<string, FeatureStatus>;
  timestamp: any;
  [key: string]: any;
}

export interface FeatureStatus  {
  featureId?: string;
  name?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  status?: 'ACTIVE' | 'DISABLED' | 'ROLLING_OUT' | 'Production ready' | string;
  feature?: string;
  ready?: boolean;
  packs?: string[];
  [key: string]: any;
}


























