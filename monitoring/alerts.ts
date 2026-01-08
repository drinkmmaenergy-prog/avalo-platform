/**
 * Avalo Monitoring Alert System
 * Discord and Email notifications
 */

import { ALERT_CONFIG } from './config';

export interface AlertData {
  timestamp: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  endpoint?: string;
  httpStatus?: number;
  responseTime?: number;
  errorDetails?: string;
  rollbackResult?: string;
  metrics?: {
    uptime?: number;
    avgResponseTime?: number;
    failureCount?: number;
  };
}

/**
 * Send alert to Discord webhook
 */
export async function sendDiscordAlert(data: AlertData): Promise<boolean> {
  if (!ALERT_CONFIG.discord.enabled || !ALERT_CONFIG.discord.webhookUrl) {
    console.log('Discord alerts not configured');
    return false;
  }

  try {
    const color = getSeverityColor(data.severity);
    const embed = {
      title: `🚨 ${data.title}`,
      description: data.message,
      color: color,
      fields: [
        {
          name: '⏰ Timestamp',
          value: data.timestamp,
          inline: true
        },
        {
          name: '📊 Severity',
          value: data.severity.toUpperCase(),
          inline: true
        }
      ],
      footer: {
        text: 'Avalo Monitoring System'
      },
      timestamp: new Date().toISOString()
    };

    // Add optional fields
    if (data.endpoint) {
      embed.fields.push({
        name: '🌐 Endpoint',
        value: data.endpoint,
        inline: false
      });
    }

    if (data.httpStatus) {
      embed.fields.push({
        name: '📡 HTTP Status',
        value: data.httpStatus.toString(),
        inline: true
      });
    }

    if (data.responseTime) {
      embed.fields.push({
        name: '⚡ Response Time',
        value: `${data.responseTime}ms`,
        inline: true
      });
    }

    if (data.errorDetails) {
      embed.fields.push({
        name: '❌ Error Details',
        value: data.errorDetails.substring(0, 1024), // Discord field limit
        inline: false
      });
    }

    if (data.rollbackResult) {
      embed.fields.push({
        name: '🔄 Rollback Result',
        value: data.rollbackResult,
        inline: false
      });
    }

    if (data.metrics && ALERT_CONFIG.includeMetrics) {
      const metricsText = [];
      if (data.metrics.uptime !== undefined) {
        metricsText.push(`Uptime: ${data.metrics.uptime.toFixed(2)}%`);
      }
      if (data.metrics.avgResponseTime !== undefined) {
        metricsText.push(`Avg Response: ${data.metrics.avgResponseTime.toFixed(0)}ms`);
      }
      if (data.metrics.failureCount !== undefined) {
        metricsText.push(`Failures: ${data.metrics.failureCount}`);
      }
      
      if (metricsText.length > 0) {
        embed.fields.push({
          name: '📈 Metrics',
          value: metricsText.join(' | '),
          inline: false
        });
      }
    }

    const response = await fetch(ALERT_CONFIG.discord.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!response.ok) {
      console.error('Failed to send Discord alert:', response.statusText);
      return false;
    }

    console.log('Discord alert sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending Discord alert:', error);
    return false;
  }
}

/**
 * Send alert via SendGrid email
 */
export async function sendEmailAlert(data: AlertData): Promise<boolean> {
  if (!ALERT_CONFIG.email.enabled || !ALERT_CONFIG.email.sendgridApiKey) {
    console.log('Email alerts not configured');
    return false;
  }

  if (ALERT_CONFIG.email.toEmails.length === 0) {
    console.log('No email recipients configured');
    return false;
  }

  try {
    const subject = `[${data.severity.toUpperCase()}] ${data.title}`;
    const htmlContent = generateEmailHTML(data);
    const textContent = generateEmailText(data);

    const emailData = {
      personalizations: ALERT_CONFIG.email.toEmails.map(email => ({
        to: [{ email }]
      })),
      from: {
        email: ALERT_CONFIG.email.fromEmail,
        name: 'Avalo Monitoring'
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: textContent
        },
        {
          type: 'text/html',
          value: htmlContent
        }
      ]
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ALERT_CONFIG.email.sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send email alert:', response.statusText, errorText);
      return false;
    }

    console.log('Email alert sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending email alert:', error);
    return false;
  }
}

/**
 * Send alert through all configured channels
 */
export async function sendAlert(data: AlertData): Promise<void> {
  console.log(`\n📢 Sending ${data.severity} alert: ${data.title}`);
  
  const results = await Promise.allSettled([
    sendDiscordAlert(data),
    sendEmailAlert(data)
  ]);

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
  console.log(`Alert sent through ${successCount} channel(s)`);
}

/**
 * Get Discord embed color based on severity
 */
function getSeverityColor(severity: AlertData['severity']): number {
  const colors = {
    info: 0x3498db,      // Blue
    warning: 0xf39c12,   // Orange
    critical: 0xe74c3c,  // Red
    success: 0x2ecc71    // Green
  };
  return colors[severity];
}

/**
 * Generate HTML email content
 */
function generateEmailHTML(data: AlertData): string {
  const severityColor = {
    info: '#3498db',
    warning: '#f39c12',
    critical: '#e74c3c',
    success: '#2ecc71'
  }[data.severity];

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .field { margin: 10px 0; padding: 10px; background: white; border-left: 3px solid ${severityColor}; }
    .field-label { font-weight: bold; color: #555; }
    .field-value { margin-top: 5px; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🚨 ${data.title}</h2>
      <p>${data.severity.toUpperCase()} Alert</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="field-label">Message</div>
        <div class="field-value">${data.message}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Timestamp</div>
        <div class="field-value">${data.timestamp}</div>
      </div>
      
      ${data.endpoint ? `
      <div class="field">
        <div class="field-label">Endpoint</div>
        <div class="field-value">${data.endpoint}</div>
      </div>
      ` : ''}
      
      ${data.httpStatus ? `
      <div class="field">
        <div class="field-label">HTTP Status</div>
        <div class="field-value">${data.httpStatus}</div>
      </div>
      ` : ''}
      
      ${data.responseTime ? `
      <div class="field">
        <div class="field-label">Response Time</div>
        <div class="field-value">${data.responseTime}ms</div>
      </div>
      ` : ''}
      
      ${data.errorDetails ? `
      <div class="field">
        <div class="field-label">Error Details</div>
        <div class="field-value"><pre>${data.errorDetails}</pre></div>
      </div>
      ` : ''}
      
      ${data.rollbackResult ? `
      <div class="field">
        <div class="field-label">Rollback Result</div>
        <div class="field-value">${data.rollbackResult}</div>
      </div>
      ` : ''}
      
      ${data.metrics && ALERT_CONFIG.includeMetrics ? `
      <div class="field">
        <div class="field-label">Metrics</div>
        <div class="field-value">
          ${data.metrics.uptime !== undefined ? `<p>Uptime: ${data.metrics.uptime.toFixed(2)}%</p>` : ''}
          ${data.metrics.avgResponseTime !== undefined ? `<p>Avg Response Time: ${data.metrics.avgResponseTime.toFixed(0)}ms</p>` : ''}
          ${data.metrics.failureCount !== undefined ? `<p>Failure Count: ${data.metrics.failureCount}</p>` : ''}
        </div>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>Avalo Monitoring System | Automated Alert</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text email content
 */
function generateEmailText(data: AlertData): string {
  let text = `AVALO MONITORING ALERT\n`;
  text += `${'='.repeat(50)}\n\n`;
  text += `Title: ${data.title}\n`;
  text += `Severity: ${data.severity.toUpperCase()}\n`;
  text += `Message: ${data.message}\n`;
  text += `Timestamp: ${data.timestamp}\n`;
  
  if (data.endpoint) text += `Endpoint: ${data.endpoint}\n`;
  if (data.httpStatus) text += `HTTP Status: ${data.httpStatus}\n`;
  if (data.responseTime) text += `Response Time: ${data.responseTime}ms\n`;
  if (data.errorDetails) text += `\nError Details:\n${data.errorDetails}\n`;
  if (data.rollbackResult) text += `\nRollback Result:\n${data.rollbackResult}\n`;
  
  if (data.metrics && ALERT_CONFIG.includeMetrics) {
    text += `\nMetrics:\n`;
    if (data.metrics.uptime !== undefined) text += `  Uptime: ${data.metrics.uptime.toFixed(2)}%\n`;
    if (data.metrics.avgResponseTime !== undefined) text += `  Avg Response Time: ${data.metrics.avgResponseTime.toFixed(0)}ms\n`;
    if (data.metrics.failureCount !== undefined) text += `  Failure Count: ${data.metrics.failureCount}\n`;
  }
  
  text += `\n${'='.repeat(50)}\n`;
  text += `Avalo Monitoring System - Automated Alert\n`;
  
  return text;
}