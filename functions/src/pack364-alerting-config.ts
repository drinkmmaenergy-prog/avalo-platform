/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Alerting Configuration
 * 
 * Alert rules configuration for external monitoring providers.
 * Stores rules and emits "needs alert" telemetry events when thresholds are exceeded.
 * Actual alert delivery is handled by PACK 293 notifications or external ops systems.
 */

import * as admin from "firebase-admin";
import { logTelemetry } from "./pack364-telemetry";

/**
 * Alert severity levels
 */
export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";

/**
 * Alert condition types
 */
export type AlertCondition = "greater_than" | "less_than" | "equals";

/**
 * Alert rule definition
 */
export interface AlertRule {
  /** Unique rule identifier */
  id: string;
  
  /** Human-readable rule name */
  name: string;
  
  /** Alert severity */
  severity: AlertSeverity;
  
  /** Metric to monitor */
  metric: string;
  
  /** Threshold value */
  threshold: number;
  
  /** Time window in minutes */
  windowMinutes: number;
  
  /** Condition to trigger alert */
  condition: AlertCondition;
  
  /** Whether this rule is enabled */
  enabled: boolean;
  
  /** Optional description */
  description?: string;
  
  /** Labels for filtering/routing */
  labels?: Record<string, string>;
  
  /** Cooldown period in minutes (to prevent spam) */
  cooldownMinutes?: number;
}

/**
 * Alert event (when a rule is triggered)
 */
export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  metric: string;
  currentValue: number;
  threshold: number;
  condition: AlertCondition;
  timestamp: number;
  message: string;
  labels?: Record<string, string>;
}

/**
 * Predefined alert rules for core SLOs
 */
export const PREDEFINED_ALERT_RULES: AlertRule[] = [
  {
    id: "alert_chat_error_rate",
    name: "Chat Error Rate High",
    severity: "WARN",
    metric: "chat_error_rate",
    threshold: 2.0,
    windowMinutes: 5,
    condition: "greater_than",
    enabled: true,
    description: "Chat operations error rate exceeds 2% for 5 minutes",
    labels: { domain: "chat" },
    cooldownMinutes: 15
  },
  {
    id: "alert_wallet_failures",
    name: "Wallet Transaction Failures Critical",
    severity: "CRITICAL",
    metric: "wallet_error_rate",
    threshold: 0.5,
    windowMinutes: 5,
    condition: "greater_than",
    enabled: true,
    description: "Wallet transaction failures exceed 0.5% for 5 minutes",
    labels: { domain: "wallet" },
    cooldownMinutes: 10
  },
  {
    id: "alert_panic_latency",
    name: "Panic Processing Latency Critical",
    severity: "CRITICAL",
    metric: "panic_p95_latency",
    threshold: 5000,
    windowMinutes: 1,
    condition: "greater_than",
    enabled: true,
    description: "P95 panic event processing latency exceeds 5 seconds",
    labels: { domain: "safety" },
    cooldownMinutes: 5
  },
  {
    id: "alert_api_error_rate",
    name: "API Error Rate Critical",
    severity: "CRITICAL",
    metric: "api_error_rate",
    threshold: 3.0,
    windowMinutes: 10,
    condition: "greater_than",
    enabled: true,
    description: "Overall API error rate exceeds 3% for 10 minutes",
    labels: { domain: "infra" },
    cooldownMinutes: 15
  },
  {
    id: "alert_ai_failures",
    name: "AI Service Failures High",
    severity: "WARN",
    metric: "ai_error_rate",
    threshold: 5.0,
    windowMinutes: 5,
    condition: "greater_than",
    enabled: true,
    description: "AI companion failures exceed 5% for 5 minutes",
    labels: { domain: "ai" },
    cooldownMinutes: 10
  },
  {
    id: "alert_support_unavailable",
    name: "Support System Unavailable",
    severity: "CRITICAL",
    metric: "support_availability",
    threshold: 99.0,
    windowMinutes: 5,
    condition: "less_than",
    enabled: true,
    description: "Support system availability drops below 99%",
    labels: { domain: "support" },
    cooldownMinutes: 10
  },
  {
    id: "alert_db_slow_queries",
    name: "Database Slow Queries",
    severity: "WARN",
    metric: "db_query_p95_latency",
    threshold: 1000,
    windowMinutes: 5,
    condition: "greater_than",
    enabled: true,
    description: "Database P95 query latency exceeds 1 second",
    labels: { domain: "infra" },
    cooldownMinutes: 15
  },
  {
    id: "alert_region_latency",
    name: "Regional Latency High",
    severity: "WARN",
    metric: "infra_region_latency_ms",
    threshold: 500,
    windowMinutes: 10,
    condition: "greater_than",
    enabled: true,
    description: "Regional latency exceeds 500ms for 10 minutes",
    labels: { domain: "infra" },
    cooldownMinutes: 20
  }
];

/**
 * Alert cooldown tracker (to prevent spam)
 */
const alertCooldowns = new Map<string, number>();

/**
 * Check if an alert is in cooldown period
 */
function isInCooldown(ruleId: string, cooldownMinutes: number): boolean {
  const lastAlertTime = alertCooldowns.get(ruleId);
  if (!lastAlertTime) return false;
  
  const cooldownMs = cooldownMinutes * 60 * 1000;
  return Date.now() - lastAlertTime < cooldownMs;
}

/**
 * Set cooldown for an alert rule
 */
function setCooldown(ruleId: string): void {
  alertCooldowns.set(ruleId, Date.now());
}

/**
 * Get all alert rules from Firestore
 */
export async function getAlertRules(filters?: {
  enabled?: boolean;
  severity?: AlertSeverity;
}): Promise<AlertRule[]> {
  const db = admin.firestore();
  let query: admin.firestore.Query = db.collection("alert_rules");
  
  if (filters?.enabled !== undefined) {
    query = query.where("enabled", "==", filters.enabled);
  }
  if (filters?.severity) {
    query = query.where("severity", "==", filters.severity);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as AlertRule);
}

/**
 * Create or update an alert rule
 */
export async function setAlertRule(rule: AlertRule): Promise<void> {
  const db = admin.firestore();
  await db.collection("alert_rules").doc(rule.id).set(rule);
}

/**
 * Delete an alert rule
 */
export async function deleteAlertRule(ruleId: string): Promise<void> {
  const db = admin.firestore();
  await db.collection("alert_rules").doc(ruleId).delete();
}

/**
 * Evaluate an alert rule against a metric value
 */
export function evaluateAlertRule(rule: AlertRule, currentValue: number): boolean {
  if (!rule.enabled) return false;
  
  switch (rule.condition) {
    case "greater_than":
      return currentValue > rule.threshold;
    case "less_than":
      return currentValue < rule.threshold;
    case "equals":
      return currentValue === rule.threshold;
    default:
      return false;
  }
}

/**
 * Trigger an alert (emit telemetry event)
 */
export async function triggerAlert(
  rule: AlertRule,
  currentValue: number,
  additionalMetadata?: Record<string, any>
): Promise<AlertEvent> {
  // Check cooldown
  if (rule.cooldownMinutes && isInCooldown(rule.id, rule.cooldownMinutes)) {
    console.log(`[ALERT] ${rule.name} is in cooldown, skipping`);
    throw new Error("Alert in cooldown period");
  }
  
  // Create alert event
  const alertEvent: AlertEvent = {
    id: `alert_${Date.now()}_${rule.id}`,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    metric: rule.metric,
    currentValue,
    threshold: rule.threshold,
    condition: rule.condition,
    timestamp: Date.now(),
    message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
    labels: rule.labels
  };
  
  // Persist alert event
  const db = admin.firestore();
  await db.collection("alert_events").doc(alertEvent.id).set({
    ...alertEvent,
    acknowledged: false,
    ackBy: null,
    ackAt: null
  });
  
  // Emit telemetry event
  await logTelemetry({
    domain: (rule.labels?.domain as any) || "infra",
    level: rule.severity === "CRITICAL" ? "CRITICAL" : rule.severity === "WARN" ? "WARN" : "INFO",
    actorType: "system",
    operation: "alert.triggered",
    success: true,
    metadata: {
      alertId: alertEvent.id,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      ...additionalMetadata
    }
  });
  
  // Set cooldown
  if (rule.cooldownMinutes) {
    setCooldown(rule.id);
  }
  
  console.warn(`[ALERT:${rule.severity}] ${alertEvent.message}`);
  
  return alertEvent;
}

/**
 * Check metric value against all active rules
 */
export async function checkMetricAgainstRules(
  metric: string,
  value: number
): Promise<AlertEvent[]> {
  const rules = await getAlertRules({ enabled: true });
  const triggeredAlerts: AlertEvent[] = [];
  
  for (const rule of rules) {
    if (rule.metric === metric && evaluateAlertRule(rule, value)) {
      try {
        const alert = await triggerAlert(rule, value);
        triggeredAlerts.push(alert);
      } catch (error) {
        // Cooldown or other error, skip
        console.debug(`[ALERT] Skipped ${rule.name}:`, error);
      }
    }
  }
  
  return triggeredAlerts;
}

/**
 * Get alert events with filters
 */
export async function getAlertEvents(filters?: {
  ruleId?: string;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<AlertEvent[]> {
  const db = admin.firestore();
  let query: admin.firestore.Query = db.collection("alert_events");
  
  if (filters?.ruleId) {
    query = query.where("ruleId", "==", filters.ruleId);
  }
  if (filters?.severity) {
    query = query.where("severity", "==", filters.severity);
  }
  if (filters?.acknowledged !== undefined) {
    query = query.where("acknowledged", "==", filters.acknowledged);
  }
  if (filters?.startTime) {
    query = query.where("timestamp", ">=", filters.startTime);
  }
  if (filters?.endTime) {
    query = query.where("timestamp", "<=", filters.endTime);
  }
  
  query = query.orderBy("timestamp", "desc");
  query = query.limit(filters?.limit || 100);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as AlertEvent);
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string
): Promise<void> {
  const db = admin.firestore();
  await db.collection("alert_events").doc(alertId).update({
    acknowledged: true,
    ackBy: userId,
    ackAt: Date.now()
  });
  
  await logTelemetry({
    domain: "infra",
    level: "INFO",
    actorType: "admin",
    actorId: userId,
    operation: "alert.acknowledged",
    success: true,
    metadata: { alertId }
  });
}

/**
 * Initialize predefined alert rules in Firestore (if not exists)
 */
export async function initializePredefinedRules(): Promise<void> {
  const db = admin.firestore();
  
  for (const rule of PREDEFINED_ALERT_RULES) {
    const docRef = db.collection("alert_rules").doc(rule.id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      await docRef.set(rule);
      console.log(`[ALERT] Initialized rule: ${rule.name}`);
    }
  }
}

/**
 * Get alert statistics
 */
export async function getAlertStats(windowMs: number = 24 * 60 * 60 * 1000): Promise<{
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  acknowledged: number;
  unacknowledged: number;
}> {
  const now = Date.now();
  const events = await getAlertEvents({
    startTime: now - windowMs,
    limit: 10000
  });
  
  const stats = {
    total: events.length,
    bySeverity: {
      INFO: 0,
      WARN: 0,
      CRITICAL: 0
    },
    acknowledged: 0,
    unacknowledged: 0
  };
  
  for (const event of events) {
    stats.bySeverity[event.severity]++;
  }
  
  const db = admin.firestore();
  const ackQuery = db.collection("alert_events")
    .where("timestamp", ">=", now - windowMs)
    .where("acknowledged", "==", true);
  const ackSnapshot = await ackQuery.get();
  stats.acknowledged = ackSnapshot.size;
  stats.unacknowledged = stats.total - stats.acknowledged;
  
  return stats;
}
