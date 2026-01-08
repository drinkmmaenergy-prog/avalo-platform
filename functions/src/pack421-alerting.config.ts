/**
 * PACK 421 — Alerting Configuration
 * 
 * Defines alert rules mapping metrics to thresholds and notification channels.
 * Integrates with PACK 293 (Notifications) and external tooling (Slack, email, PagerDuty).
 * 
 * NOTE: This configuration provides alert rule definitions.
 * Full streaming alert logic should be implemented by the chosen observability provider
 * (Datadog, Prometheus Alertmanager, GCP Monitoring, etc.).
 */

import {
  AlertRule,
  AlertSeverity,
  AlertChannel,
  MetricName,
} from '../../shared/types/pack421-observability.types';

/**
 * Core alert rules for production monitoring
 * 
 * Format:
 * - metric: Which metric to monitor
 * - windowMinutes: Evaluation time window
 * - threshold: Value that triggers alert
 * - severity: P0 (critical) to P4 (low)
 * - channels: Where to send alerts
 * - operator: Comparison operator (default: '>')
 */
export const ALERT_RULES: AlertRule[] = [
  // ============================================================
  // P0 — CRITICAL: Core Platform Failures
  // ============================================================
  {
    metric: 'infra.function.error.count',
    windowMinutes: 5,
    threshold: 50,
    severity: 'P0',
    channels: ['oncall_slack', 'pagerduty', 'email_ops'],
    description: 'High error rate detected in Firebase Functions',
  },
  {
    metric: 'product.wallet.spend.failed',
    windowMinutes: 10,
    threshold: 10,
    severity: 'P0',
    channels: ['oncall_slack', 'email_finance', 'pagerduty'],
    description: 'Multiple wallet spend failures - money flow blocked',
  },
  {
    metric: 'product.call.failed.count',
    windowMinutes: 10,
    threshold: 15,
    severity: 'P0',
    channels: ['oncall_slack', 'pagerduty'],
    description: 'High call failure rate - video/voice system down',
  },

  // ============================================================
  // P1 — HIGH: Core Feature Degradation
  // ============================================================
  {
    metric: 'product.chat.failed.count',
    windowMinutes: 15,
    threshold: 20,
    severity: 'P1',
    channels: ['oncall_slack', 'email_ops'],
    description: 'Elevated chat message failure rate',
  },
  {
    metric: 'product.wallet.payout.failed',
    windowMinutes: 30,
    threshold: 5,
    severity: 'P1',
    channels: ['oncall_slack', 'email_finance'],
    description: 'Creator payouts failing - revenue distribution blocked',
  },
  {
    metric: 'product.safety.incident.count',
    windowMinutes: 60,
    threshold: 20,
    severity: 'P1',
    channels: ['safety_team', 'oncall_slack'],
    description: 'Spike in safety incidents - potential abuse wave',
  },
  {
    metric: 'product.safety.panic.activated',
    windowMinutes: 30,
    threshold: 5,
    severity: 'P1',
    channels: ['safety_team', 'oncall_slack'],
    description: 'Multiple panic button activations',
  },
  {
    metric: 'infra.db.query.latency_ms',
    windowMinutes: 10,
    threshold: 2000, // 2 seconds
    severity: 'P1',
    channels: ['oncall_slack', 'email_ops'],
    operator: '>',
    description: 'Database queries extremely slow',
  },

  // ============================================================
  // P2 — MEDIUM: Performance & Quality Issues
  // ============================================================
  {
    metric: 'infra.http.request.latency_ms',
    windowMinutes: 15,
    threshold: 1000, // 1 second
    severity: 'P2',
    channels: ['oncall_slack'],
    operator: '>',
    description: 'API response times degraded',
  },
  {
    metric: 'product.ai.response.latency_ms',
    windowMinutes: 15,
    threshold: 3000, // 3 seconds
    severity: 'P2',
    channels: ['oncall_slack'],
    operator: '>',
    description: 'AI companion responses slow',
  },
  {
    metric: 'product.ai.model.error.count',
    windowMinutes: 30,
    threshold: 10,
    severity: 'P2',
    channels: ['oncall_slack'],
    description: 'AI model errors increasing',
  },
  {
    metric: 'fraud.detection.triggered',
    windowMinutes: 60,
    threshold: 50,
    severity: 'P2',
    channels: ['oncall_slack', 'safety_team'],
    description: 'High fraud detection trigger rate',
  },
  {
    metric: 'product.support.ticket.created',
    windowMinutes: 60,
    threshold: 100,
    severity: 'P2',
    channels: ['oncall_slack'],
    description: 'Support ticket volume spike',
  },

  // ============================================================
  // P3 — LOW: Operational Awareness
  // ============================================================
  {
    metric: 'growth.churn.prediction.high_risk',
    windowMinutes: 1440, // 24 hours
    threshold: 100,
    severity: 'P3',
    channels: ['email_ops'],
    description: 'High number of users at churn risk',
  },
  {
    metric: 'product.wallet.balance.low',
    windowMinutes: 60,
    threshold: 50,
    severity: 'P3',
    channels: ['email_ops'],
    description: 'Many users running low on tokens',
  },
  {
    metric: 'infra.cache.miss.count',
    windowMinutes: 30,
    threshold: 1000,
    severity: 'P3',
    channels: ['oncall_slack'],
    description: 'High cache miss rate - check cache system',
  },
];

/**
 * Alert channel configurations
 * Maps channel identifiers to actual notification targets
 */
export const ALERT_CHANNELS: Record<AlertChannel, {
  type: string;
  target: string;
  enabled: boolean;
}> = {
  oncall_slack: {
    type: 'slack',
    target: process.env.SLACK_ONCALL_WEBHOOK || '',
    enabled: !!process.env.SLACK_ONCALL_WEBHOOK,
  },
  email_ops: {
    type: 'email',
    target: process.env.OPS_EMAIL || 'ops@avalo.app',
    enabled: true,
  },
  email_finance: {
    type: 'email',
    target: process.env.FINANCE_EMAIL || 'finance@avalo.app',
    enabled: true,
  },
  safety_team: {
    type: 'slack',
    target: process.env.SLACK_SAFETY_WEBHOOK || '',
    enabled: !!process.env.SLACK_SAFETY_WEBHOOK,
  },
  pagerduty: {
    type: 'pagerduty',
    target: process.env.PAGERDUTY_INTEGRATION_KEY || '',
    enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
  },
  webhook: {
    type: 'webhook',
    target: process.env.ALERT_WEBHOOK_URL || '',
    enabled: !!process.env.ALERT_WEBHOOK_URL,
  },
};

/**
 * Get alerts by severity level
 */
export function getAlertsBySeverity(severity: AlertSeverity): AlertRule[] {
  return ALERT_RULES.filter(rule => rule.severity === severity);
}

/**
 * Get alerts for a specific metric
 */
export function getAlertsForMetric(metricName: MetricName): AlertRule[] {
  return ALERT_RULES.filter(rule => rule.metric === metricName);
}

/**
 * Check if a metric value violates an alert rule
 * 
 * @param rule - Alert rule to evaluate
 * @param currentValue - Current metric value
 * @returns True if alert should be triggered
 */
export function evaluateAlertRule(rule: AlertRule, currentValue: number): boolean {
  const operator = rule.operator || '>';
  
  switch (operator) {
    case '>':
      return currentValue > rule.threshold;
    case '<':
      return currentValue < rule.threshold;
    case '>=':
      return currentValue >= rule.threshold;
    case '<=':
      return currentValue <= rule.threshold;
    case '==':
      return currentValue === rule.threshold;
    case '!=':
      return currentValue !== rule.threshold;
    default:
      return currentValue > rule.threshold;
  }
}

/**
 * Stub for alert evaluation logic
 * 
 * NOTE: Full implementation should use the chosen observability provider's
 * alerting system (Datadog monitors, Prometheus Alertmanager, etc.).
 * 
 * This function is provided as a reference for custom alert evaluation.
 * 
 * @param windowMinutes - Time window to evaluate
 * @returns Triggered alerts (if any)
 */
export async function evaluateAlerts(windowMinutes: number): Promise<{
  rule: AlertRule;
  currentValue: number;
  triggered: boolean;
}[]> {
  // TODO: Implement by querying metrics backend for current values
  // and evaluating against rules
  
  // Example structure:
  // 1. Get all active alert rules
  // 2. For each rule, query metrics backend for current value in window
  // 3. Evaluate rule against current value
  // 4. Return triggered alerts
  
  return [];
}

/**
 * Alert severity response time SLAs (in minutes)
 */
export const ALERT_RESPONSE_TIMES: Record<AlertSeverity, number> = {
  P0: 5,    // 5 minutes - immediate response
  P1: 15,   // 15 minutes - urgent response
  P2: 60,   // 1 hour - timely response
  P3: 1440, // 24 hours - next business day
  P4: 10080, // 1 week - best effort
};

/**
 * Alert notification templates
 */
export const ALERT_TEMPLATES = {
  slack: {
    title: '🚨 {severity} Alert: {metric}',
    body: `
*Metric:* {metric}
*Current Value:* {currentValue}
*Threshold:* {operator} {threshold}
*Window:* {windowMinutes} minutes
*Description:* {description}
*Time:* {timestamp}

*Action Required:* Respond within {responseTime} minutes
    `.trim(),
  },
  email: {
    subject: '[AVALO Alert {severity}] {metric}',
    body: `
<h2>Alert Triggered</h2>
<table>
  <tr><td><strong>Severity:</strong></td><td>{severity}</td></tr>
  <tr><td><strong>Metric:</strong></td><td>{metric}</td></tr>
  <tr><td><strong>Current Value:</strong></td><td>{currentValue}</td></tr>
  <tr><td><strong>Threshold:</strong></td><td>{operator} {threshold}</td></tr>
  <tr><td><strong>Window:</strong></td><td>{windowMinutes} minutes</td></tr>
  <tr><td><strong>Description:</strong></td><td>{description}</td></tr>
  <tr><td><strong>Time:</strong></td><td>{timestamp}</td></tr>
</table>
<p><strong>Action Required:</strong> Respond within {responseTime} minutes</p>
    `.trim(),
  },
};

/**
 * Get enabled alert channels for a severity level
 */
export function getEnabledChannelsForSeverity(severity: AlertSeverity): AlertChannel[] {
  const rules = getAlertsBySeverity(severity);
  const channelSet = new Set<AlertChannel>();
  
  rules.forEach(rule => {
    rule.channels.forEach(channel => {
      if (ALERT_CHANNELS[channel]?.enabled) {
        channelSet.add(channel);
      }
    });
  });
  
  return Array.from(channelSet);
}
