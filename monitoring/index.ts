/**
 * Avalo Production Monitoring System
 * Main scheduler and orchestrator
 */

import {
  ENDPOINTS,
  THRESHOLDS,
  REPORT_CONFIG,
  MEMORY_THRESHOLDS,
  MonitoringEndpoint
} from './config';
import { sendAlert, AlertData } from './alerts';
import {
  shouldTriggerRollback,
  executeRollback,
  validateRollback,
  hasRecentRollback,
  RollbackTrigger
} from './rollback';
import * as fs from 'fs';
import * as path from 'path';

interface EndpointCheckResult {
  endpoint: MonitoringEndpoint;
  success: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
  payloadValid?: boolean;
  timestamp: string;
}

interface MonitoringMetrics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  avgResponseTime: number;
  uptime: number;
  consecutiveFailures: number;
  consecutiveSlowResponses: number;
  has5xxErrors: boolean;
  checkHistory: EndpointCheckResult[];
  lastRollback?: string;
}

// Global state
const metrics: MonitoringMetrics = {
  totalChecks: 0,
  successfulChecks: 0,
  failedChecks: 0,
  avgResponseTime: 0,
  uptime: 100,
  consecutiveFailures: 0,
  consecutiveSlowResponses: 0,
  has5xxErrors: false,
  checkHistory: []
};

/**
 * Check a single endpoint
 */
async function checkEndpoint(endpoint: MonitoringEndpoint): Promise<EndpointCheckResult> {
  const startTime = Date.now();
  const result: EndpointCheckResult = {
    endpoint,
    success: false,
    responseTime: 0,
    timestamp: new Date().toISOString()
  };

  console.log(`\n🔍 Checking: ${endpoint.name}`);
  console.log(`   URL: ${endpoint.url}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), endpoint.maxResponseTime + 5000);

    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeout);

    result.responseTime = Date.now() - startTime;
    result.statusCode = response.status;

    // Check status code
    const statusOk = response.status === endpoint.expectedStatus;
    
    // Check response time
    const timeOk = result.responseTime <= endpoint.maxResponseTime;

    // Parse and validate payload if needed
    let payloadOk = true;
    if (endpoint.validatePayload && response.ok) {
      try {
        const contentType = response.headers.get('content-type');
        let data: any;
        
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        
        payloadOk = endpoint.validatePayload(data);
        result.payloadValid = payloadOk;
      } catch (error: any) {
        payloadOk = false;
        result.payloadValid = false;
        result.error = `Payload validation error: ${error.message}`;
      }
    }

    result.success = statusOk && timeOk && payloadOk;

    // Log result
    console.log(`   Status: ${response.status} ${statusOk ? '✅' : '❌'}`);
    console.log(`   Response Time: ${result.responseTime}ms ${timeOk ? '✅' : '⚠️'}`);
    if (endpoint.validatePayload) {
      console.log(`   Payload: ${payloadOk ? '✅' : '❌'}`);
    }

    if (!result.success && !result.error) {
      result.error = `Expected status ${endpoint.expectedStatus}, got ${response.status}`;
    }

  } catch (error: any) {
    result.responseTime = Date.now() - startTime;
    result.error = error.message;
    result.success = false;
    
    console.log(`   Error: ${error.message} ❌`);
  }

  return result;
}

/**
 * Check all endpoints with retry logic
 */
async function checkAllEndpoints(): Promise<EndpointCheckResult[]> {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 AVALO MONITORING CHECK');
  console.log('='.repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Endpoints: ${ENDPOINTS.length}`);

  const results: EndpointCheckResult[] = [];

  for (const endpoint of ENDPOINTS) {
    let result: EndpointCheckResult | null = null;
    let attempts = 0;

    // Retry logic
    while (attempts <= THRESHOLDS.retryAttempts && (!result || !result.success)) {
      if (attempts > 0) {
        console.log(`   Retry attempt ${attempts}/${THRESHOLDS.retryAttempts}...`);
        await sleep(THRESHOLDS.retryDelay);
      }

      result = await checkEndpoint(endpoint);
      attempts++;

      // If successful, break retry loop
      if (result.success) break;
    }

    results.push(result!);
  }

  return results;
}

/**
 * Update metrics based on check results
 */
function updateMetrics(results: EndpointCheckResult[]): void {
  metrics.totalChecks += results.length;
  
  // Count successes and failures
  const currentSuccesses = results.filter(r => r.success).length;
  const currentFailures = results.filter(r => !r.success).length;
  
  metrics.successfulChecks += currentSuccesses;
  metrics.failedChecks += currentFailures;

  // Calculate uptime percentage
  metrics.uptime = (metrics.successfulChecks / metrics.totalChecks) * 100;

  // Track consecutive failures
  if (currentFailures >= THRESHOLDS.consecutiveFailuresForRollback) {
    metrics.consecutiveFailures++;
  } else {
    metrics.consecutiveFailures = 0;
  }

  // Track slow responses
  const slowResponses = results.filter(r => 
    r.responseTime > THRESHOLDS.criticalResponseTime
  ).length;
  
  if (slowResponses > 0) {
    metrics.consecutiveSlowResponses++;
  } else {
    metrics.consecutiveSlowResponses = 0;
  }

  // Check for 5xx errors
  metrics.has5xxErrors = results.some(r => 
    r.statusCode && r.statusCode >= 500 && r.statusCode < 600
  );

  // Calculate average response time
  const totalResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0);
  const avgThisRound = totalResponseTime / results.length;
  
  // Rolling average
  if (metrics.avgResponseTime === 0) {
    metrics.avgResponseTime = avgThisRound;
  } else {
    metrics.avgResponseTime = (metrics.avgResponseTime * 0.7) + (avgThisRound * 0.3);
  }

  // Keep limited history
  metrics.checkHistory.push(...results);
  if (metrics.checkHistory.length > 100) {
    metrics.checkHistory = metrics.checkHistory.slice(-100);
  }
}

/**
 * Analyze results and trigger rollback if needed
 */
async function analyzeAndRespond(results: EndpointCheckResult[]): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS');
  console.log('='.repeat(60));

  const failedEndpoints = results.filter(r => !r.success);
  const criticalFailed = failedEndpoints.filter(r => r.endpoint.critical);

  console.log(`Total Endpoints: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length} ✅`);
  console.log(`Failed: ${failedEndpoints.length} ❌`);
  console.log(`Critical Failed: ${criticalFailed.length} 🚨`);
  console.log(`Consecutive Failures: ${metrics.consecutiveFailures}`);
  console.log(`Consecutive Slow Responses: ${metrics.consecutiveSlowResponses}`);
  console.log(`5xx Errors: ${metrics.has5xxErrors ? 'Yes ⚠️' : 'No ✅'}`);
  console.log(`Overall Uptime: ${metrics.uptime.toFixed(2)}%`);
  console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(0)}ms`);

  // Send alerts for failures
  if (failedEndpoints.length > 0) {
    for (const failed of failedEndpoints) {
      await sendAlert({
        timestamp: failed.timestamp,
        severity: failed.endpoint.critical ? 'critical' : 'warning',
        title: `Endpoint Failure: ${failed.endpoint.name}`,
        message: failed.error || 'Endpoint check failed',
        endpoint: failed.endpoint.url,
        httpStatus: failed.statusCode,
        responseTime: failed.responseTime,
        errorDetails: failed.error,
        metrics: {
          uptime: metrics.uptime,
          avgResponseTime: metrics.avgResponseTime,
          failureCount: metrics.consecutiveFailures
        }
      });
    }
  }

  // Check if rollback should be triggered
  const { should, reason } = shouldTriggerRollback(
    metrics.consecutiveFailures,
    metrics.consecutiveSlowResponses,
    criticalFailed.map(r => r.endpoint.name),
    metrics.has5xxErrors
  );

  if (should) {
    console.log('\n🚨 ROLLBACK CONDITIONS MET 🚨');
    console.log(`Reason: ${reason}`);

    // Check if rollback was recently performed
    if (hasRecentRollback(30)) {
      console.log('⚠️  Rollback already performed in last 30 minutes, skipping...');
      
      await sendAlert({
        timestamp: new Date().toISOString(),
        severity: 'warning',
        title: 'Rollback Skipped (Recent Rollback)',
        message: 'Rollback conditions met but a rollback was already performed recently',
        metrics: {
          uptime: metrics.uptime,
          avgResponseTime: metrics.avgResponseTime,
          failureCount: metrics.consecutiveFailures
        }
      });
      
      return;
    }

    const trigger: RollbackTrigger = {
      reason,
      failedEndpoints: criticalFailed.map(r => r.endpoint.name),
      consecutiveFailures: metrics.consecutiveFailures,
      slowResponses: metrics.consecutiveSlowResponses,
      timestamp: new Date().toISOString()
    };

    const rollbackResult = await executeRollback(trigger);
    
    if (rollbackResult.success) {
      metrics.lastRollback = rollbackResult.timestamp;
      
      // Wait a bit for rollback to take effect
      console.log('\n⏳ Waiting 30 seconds for rollback to take effect...');
      await sleep(30000);
      
      // Validate rollback
      const validation = await validateRollback(
        ENDPOINTS.map(e => e.url)
      );
      
      console.log('\n📊 Rollback Validation:');
      console.log(`Healthy: ${validation.healthyEndpoints}/${validation.totalEndpoints}`);
      console.log(validation.details);
      
      await sendAlert({
        timestamp: new Date().toISOString(),
        severity: validation.success ? 'success' : 'warning',
        title: 'Rollback Validation',
        message: validation.success 
          ? 'Rollback completed and services restored successfully'
          : 'Rollback completed but some services still unhealthy',
        rollbackResult: `${validation.healthyEndpoints}/${validation.totalEndpoints} endpoints healthy\n\n${validation.details}`
      });
    }
  }
}

/**
 * Generate monitoring report
 */
async function generateReport(results: EndpointCheckResult[]): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📝 GENERATING REPORT');
  console.log('='.repeat(60));

  // Ensure reports directory exists
  if (!fs.existsSync(REPORT_CONFIG.outputDir)) {
    fs.mkdirSync(REPORT_CONFIG.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  // JSON Report
  const jsonReport = {
    timestamp,
    metrics: {
      totalChecks: metrics.totalChecks,
      successfulChecks: metrics.successfulChecks,
      failedChecks: metrics.failedChecks,
      uptime: metrics.uptime,
      avgResponseTime: metrics.avgResponseTime,
      consecutiveFailures: metrics.consecutiveFailures,
      consecutiveSlowResponses: metrics.consecutiveSlowResponses,
      has5xxErrors: metrics.has5xxErrors,
      lastRollback: metrics.lastRollback
    },
    currentCheck: results.map(r => ({
      endpoint: r.endpoint.name,
      url: r.endpoint.url,
      success: r.success,
      statusCode: r.statusCode,
      responseTime: r.responseTime,
      error: r.error,
      timestamp: r.timestamp
    })),
    memory: {
      heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
      heapTotal: process.memoryUsage().heapTotal / 1024 / 1024,
      external: process.memoryUsage().external / 1024 / 1024,
      rss: process.memoryUsage().rss / 1024 / 1024
    }
  };

  const jsonPath = path.join(REPORT_CONFIG.outputDir, REPORT_CONFIG.jsonFilename);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`✅ JSON report saved: ${jsonPath}`);

  // Markdown Report
  const mdReport = generateMarkdownReport(jsonReport);
  const mdPath = path.join(REPORT_CONFIG.outputDir, REPORT_CONFIG.markdownFilename);
  fs.writeFileSync(mdPath, mdReport);
  console.log(`✅ Markdown report saved: ${mdPath}`);
}

/**
 * Generate markdown report content
 */
function generateMarkdownReport(data: any): string {
  let md = `# Avalo Monitoring Report\n\n`;
  md += `**Generated:** ${data.timestamp}\n\n`;
  
  md += `## Overall Metrics\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Checks | ${data.metrics.totalChecks} |\n`;
  md += `| Successful | ${data.metrics.successfulChecks} ✅ |\n`;
  md += `| Failed | ${data.metrics.failedChecks} ❌ |\n`;
  md += `| Uptime | ${data.metrics.uptime.toFixed(2)}% |\n`;
  md += `| Avg Response Time | ${data.metrics.avgResponseTime.toFixed(0)}ms |\n`;
  md += `| Consecutive Failures | ${data.metrics.consecutiveFailures} |\n`;
  md += `| Consecutive Slow Responses | ${data.metrics.consecutiveSlowResponses} |\n`;
  md += `| 5xx Errors | ${data.metrics.has5xxErrors ? '⚠️ Yes' : '✅ No'} |\n`;
  
  if (data.metrics.lastRollback) {
    md += `| Last Rollback | ${data.metrics.lastRollback} |\n`;
  }
  
  md += `\n## Current Check Results\n\n`;
  md += `| Endpoint | Status | Response Time | Error |\n`;
  md += `|----------|--------|---------------|-------|\n`;
  
  for (const result of data.currentCheck) {
    const status = result.success ? '✅' : '❌';
    const error = result.error || '-';
    md += `| ${result.endpoint} | ${status} ${result.statusCode || 'N/A'} | ${result.responseTime}ms | ${error} |\n`;
  }
  
  md += `\n## Memory Usage\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Heap Used | ${data.memory.heapUsed.toFixed(2)} MB |\n`;
  md += `| Heap Total | ${data.memory.heapTotal.toFixed(2)} MB |\n`;
  md += `| RSS | ${data.memory.rss.toFixed(2)} MB |\n`;
  
  const heapUsagePercent = (data.memory.heapUsed / data.memory.heapTotal);
  if (heapUsagePercent > MEMORY_THRESHOLDS.critical) {
    md += `\n⚠️ **WARNING:** Memory usage is critical (>${(MEMORY_THRESHOLDS.critical * 100)}%)\n`;
  } else if (heapUsagePercent > MEMORY_THRESHOLDS.warning) {
    md += `\n⚠️ **WARNING:** Memory usage is high (>${(MEMORY_THRESHOLDS.warning * 100)}%)\n`;
  }
  
  md += `\n---\n`;
  md += `*Avalo Monitoring System - Automated Report*\n`;
  
  return md;
}

/**
 * Run single monitoring cycle
 */
export async function runMonitoringCycle(): Promise<void> {
  try {
    const results = await checkAllEndpoints();
    updateMetrics(results);
    await analyzeAndRespond(results);
    await generateReport(results);

    console.log('\n' + '='.repeat(60));
    console.log('✅ MONITORING CYCLE COMPLETE');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('\n❌ Monitoring cycle error:', error);
    
    await sendAlert({
      timestamp: new Date().toISOString(),
      severity: 'critical',
      title: 'Monitoring System Error',
      message: 'An error occurred during the monitoring cycle',
      errorDetails: error.stack || error.message
    });
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n🎯 AVALO MONITORING & AUTO-ROLLBACK SYSTEM');
  console.log('='.repeat(60));
  console.log(`Project: ${process.env.FIREBASE_PROJECT || 'avalo-c8c46'}`);
  console.log(`Check Interval: ${THRESHOLDS.checkInterval / 1000 / 60} minutes`);
  console.log(`Auto-Rollback: ${process.env.DISABLE_ROLLBACK === 'true' ? 'Disabled' : 'Enabled'}`);
  console.log('='.repeat(60));

  await runMonitoringCycle();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}