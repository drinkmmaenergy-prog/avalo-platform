/**
 * Avalo Operations - Alerting Layer
 * Cloud Monitoring + custom alerts with Slack/Discord/Webhook integrations
 */

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  duration: number; // seconds
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  threshold: AlertThreshold;
  enabled: boolean;
  channels: AlertChannel[];
}

export interface AlertChannel {
  type: 'slack' | 'discord' | 'webhook' | 'email' | 'sms';
  config: {
    url?: string;
    token?: string;
    channel?: string;
    recipients?: string[];
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // P95 latency > 1200ms
    this.addRule({
      id: 'latency_p95_high',
      name: 'High P95 Latency',
      description: 'P95 latency exceeds 1200ms',
      severity: 'warning',
      threshold: {
        metric: 'http_request_duration_p95',
        operator: 'gt',
        value: 1200,
        duration: 300, // 5 minutes
      },
      enabled: true,
      channels: [
        { type: 'slack', config: { channel: '#alerts' } },
        { type: 'webhook', config: { url: process.env.ALERT_WEBHOOK_URL } },
      ],
    });

    // Error rate > 2%
    this.addRule({
      id: 'error_rate_high',
      name: 'High Error Rate',
      description: 'Error rate exceeds 2%',
      severity: 'critical',
      threshold: {
        metric: 'error_rate',
        operator: 'gt',
        value: 2.0,
        duration: 180, // 3 minutes
      },
      enabled: true,
      channels: [
        { type: 'slack', config: { channel: '#alerts' } },
        { type: 'email', config: { recipients: ['ops@avalo.app'] } },
      ],
    });

    // AI moderation failures > 5 per min
    this.addRule({
      id: 'ai_moderation_failures',
      name: 'AI Moderation Failures',
      description: 'AI moderation failures exceed 5 per minute',
      severity: 'warning',
      threshold: {
        metric: 'ai_moderation_failures',
        operator: 'gt',
        value: 5,
        duration: 60,
      },
      enabled: true,
      channels: [
        { type: 'slack', config: { channel: '#ai-ops' } },
      ],
    });

    // Wallet failures > 1 per 10 min
    this.addRule({
      id: 'wallet_failures',
      name: 'Wallet Transaction Failures',
      description: 'Wallet failures exceed 1 per 10 minutes',
      severity: 'critical',
      threshold: {
        metric: 'wallet_failures',
        operator: 'gt',
        value: 1,
        duration: 600,
      },
      enabled: true,
      channels: [
        { type: 'slack', config: { channel: '#payments' } },
        { type: 'email', config: { recipients: ['finance@avalo.app'] } },
      ],
    });

    // Database connection errors
    this.addRule({
      id: 'db_connection_errors',
      name: 'Database Connection Errors',
      description: 'Database connection failures detected',
      severity: 'critical',
      threshold: {
        metric: 'db_connection_errors',
        operator: 'gt',
        value: 0,
        duration: 60,
      },
      enabled: true,
      channels: [
        { type: 'slack', config: { channel: '#alerts' } },
        { type: 'sms', config: { recipients: ['+1234567890'] } },
      ],
    });
  }

  /**
   * Add alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Update alert rule
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.set(ruleId, { ...rule, ...updates });
    }
  }

  /**
   * Enable/disable alert rule
   */
  toggleRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Check metric against rules and trigger alerts
   */
  async checkMetric(metric: string, value: number): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.threshold.metric !== metric) {
        continue;
      }

      if (this.shouldTriggerAlert(rule, value)) {
        await this.triggerAlert(rule, value);
      } else {
        await this.resolveAlert(rule.id);
      }
    }
  }

  /**
   * Check if alert should be triggered
   */
  private shouldTriggerAlert(rule: AlertRule, value: number): boolean {
    const { operator, value: threshold } = rule.threshold;

    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'gte':
        return value >= threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(rule: AlertRule, value: number): Promise<void> {
    const alertId = `${rule.id}_${Date.now()}`;
    
    // Check if alert already exists
    if (this.activeAlerts.has(rule.id)) {
      return;
    }

    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.description} - Current value: ${value}, Threshold: ${rule.threshold.value}`,
      value,
      threshold: rule.threshold.value,
      timestamp: Date.now(),
      resolved: false,
    };

    this.activeAlerts.set(rule.id, alert);
    this.alertHistory.push(alert);

    // Send notifications
    await this.sendNotifications(rule, alert);
  }

  /**
   * Resolve alert
   */
  private async resolveAlert(ruleId: string): Promise<void> {
    const alert = this.activeAlerts.get(ruleId);
    
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.activeAlerts.delete(ruleId);

      // Send resolution notification
      const rule = this.rules.get(ruleId);
      if (rule) {
        await this.sendResolutionNotification(rule, alert);
      }
    }
  }

  /**
   * Send notifications to all channels
   */
  private async sendNotifications(rule: AlertRule, alert: Alert): Promise<void> {
    const promises = rule.channels.map(channel => 
      this.sendNotification(channel, alert)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'discord':
          await this.sendDiscordNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
        case 'email':
          await this.sendEmailNotification(channel, alert);
          break;
        case 'sms':
          await this.sendSMSNotification(channel, alert);
          break;
      }
    } catch (error) {
      console.error(`Failed to send ${channel.type} notification:`, error);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    const color = alert.severity === 'critical' ? 'danger' : 'warning';
    
    const payload = {
      channel: channel.config.channel,
      attachments: [
        {
          color,
          title: `🚨 ${alert.ruleName}`,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date(alert.timestamp).toISOString(),
              short: true,
            },
          ],
        },
      ],
    };

    if (channel.config.url) {
      await fetch(channel.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    const color = alert.severity === 'critical' ? 0xFF0000 : 0xFFA500;
    
    const payload = {
      embeds: [
        {
          title: `🚨 ${alert.ruleName}`,
          description: alert.message,
          color,
          timestamp: new Date(alert.timestamp).toISOString(),
          fields: [
            {
              name: 'Severity',
              value: alert.severity.toUpperCase(),
              inline: true,
            },
            {
              name: 'Value',
              value: alert.value.toString(),
              inline: true,
            },
          ],
        },
      ],
    };

    if (channel.config.url) {
      await fetch(channel.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    if (channel.config.url) {
      await fetch(channel.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'alert',
          alert,
        }),
      });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    // Implementation would use email service (SendGrid, AWS SES, etc.)
    console.log('Email notification:', {
      to: channel.config.recipients,
      subject: `Alert: ${alert.ruleName}`,
      body: alert.message,
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    // Implementation would use SMS service (Twilio, AWS SNS, etc.)
    console.log('SMS notification:', {
      to: channel.config.recipients,
      body: `Alert: ${alert.ruleName} - ${alert.message}`,
    });
  }

  /**
   * Send resolution notification
   */
  private async sendResolutionNotification(rule: AlertRule, alert: Alert): Promise<void> {
    const resolvedAlert = {
      ...alert,
      message: `✅ RESOLVED: ${alert.message}`,
    };

    await this.sendNotifications(rule, resolvedAlert);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert statistics
   */
  getStatistics(): {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<string, number>;
  } {
    const active = this.activeAlerts.size;
    const resolved = this.alertHistory.filter(a => a.resolved).length;
    
    const bySeverity: Record<string, number> = {};
    for (const alert of this.alertHistory) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    }

    return {
      total: this.alertHistory.length,
      active,
      resolved,
      bySeverity,
    };
  }

  /**
   * Clear old alerts from history
   */
  clearOldAlerts(olderThanDays: number = 30): void {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoff);
  }
}

/**
 * Create default alert manager
 */
export function createAlertManager(): AlertManager {
  return new AlertManager();
}

// Export default instance
export const defaultAlertManager = createAlertManager();