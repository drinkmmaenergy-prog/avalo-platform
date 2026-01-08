/**
 * Avalo Monitoring Configuration
 * Endpoints, thresholds, and monitoring rules
 */

export interface MonitoringEndpoint {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  expectedStatus: number;
  maxResponseTime: number; // milliseconds
  critical: boolean; // if true, failure triggers immediate rollback consideration
  headers?: Record<string, string>;
  body?: any;
  validatePayload?: (data: any) => boolean;
}

export interface MonitoringThresholds {
  maxResponseTime: number; // milliseconds
  criticalResponseTime: number; // milliseconds
  consecutiveFailuresForRollback: number;
  slowResponseChecksForRollback: number;
  checkInterval: number; // milliseconds (5 minutes = 300000)
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface RollbackConfig {
  enabled: boolean;
  requireManualApproval: boolean;
  firebaseProject: string;
  backupBeforeRollback: boolean;
}

export interface AlertConfig {
  discord: {
    enabled: boolean;
    webhookUrl: string;
  };
  email: {
    enabled: boolean;
    sendgridApiKey: string;
    fromEmail: string;
    toEmails: string[];
  };
  includeMetrics: boolean;
}

// Monitoring endpoints
export const ENDPOINTS: MonitoringEndpoint[] = [
  {
    name: 'Production Website',
    url: 'https://avalo-c8c46.web.app',
    method: 'GET',
    expectedStatus: 200,
    maxResponseTime: 1500,
    critical: true,
    validatePayload: (data) => {
      // Check if HTML contains expected content
      return typeof data === 'string' && data.includes('Avalo');
    }
  },
  {
    name: 'Health Check Endpoint',
    url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/ping',
    method: 'GET',
    expectedStatus: 200,
    maxResponseTime: 1000,
    critical: true,
    validatePayload: (data) => {
      return data && (data.status === 'ok' || data.message === 'pong');
    }
  },
  {
    name: 'System Info API',
    url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/getSystemInfo',
    method: 'GET',
    expectedStatus: 200,
    maxResponseTime: 1500,
    critical: true,
    validatePayload: (data) => {
      return data && typeof data === 'object' && data.version;
    }
  },
  {
    name: 'Exchange Rates API',
    url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/getExchangeRatesV1',
    method: 'GET',
    expectedStatus: 200,
    maxResponseTime: 1500,
    critical: true,
    validatePayload: (data) => {
      return data && typeof data === 'object' && data.rates;
    }
  },
  {
    name: 'Purchase Tokens API',
    url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/purchaseTokensV2',
    method: 'POST',
    expectedStatus: 400, // Without auth, we expect 400 or 401, not 500
    maxResponseTime: 1500,
    critical: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {},
    validatePayload: (data) => {
      // Should return error but not 5xx
      return true; // We mainly check status code for this endpoint
    }
  }
];

// Monitoring thresholds
export const THRESHOLDS: MonitoringThresholds = {
  maxResponseTime: 1500, // 1.5 seconds
  criticalResponseTime: 3000, // 3 seconds
  consecutiveFailuresForRollback: 3,
  slowResponseChecksForRollback: 3,
  checkInterval: 300000, // 5 minutes
  retryAttempts: 2,
  retryDelay: 5000 // 5 seconds
};

// Rollback configuration
export const ROLLBACK_CONFIG: RollbackConfig = {
  enabled: true,
  requireManualApproval: false, // Set to true for manual approval
  firebaseProject: 'avalo-c8c46',
  backupBeforeRollback: true
};

// Alert configuration
export const ALERT_CONFIG: AlertConfig = {
  discord: {
    enabled: !!process.env.MONITORING_DISCORD_WEBHOOK,
    webhookUrl: process.env.MONITORING_DISCORD_WEBHOOK || ''
  },
  email: {
    enabled: !!process.env.SENDGRID_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.ALERT_FROM_EMAIL || 'monitoring@avaloapp.com',
    toEmails: (process.env.ALERT_TO_EMAILS || '').split(',').filter(e => e.trim())
  },
  includeMetrics: true
};

// Report configuration
export const REPORT_CONFIG = {
  outputDir: '../reports',
  jsonFilename: 'monitoring_report.json',
  markdownFilename: 'monitoring_report.md',
  retentionDays: 30
};

// Memory usage thresholds
export const MEMORY_THRESHOLDS = {
  warning: 0.8, // 80% of heap limit
  critical: 0.9 // 90% of heap limit
};