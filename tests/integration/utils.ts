/**
 * ========================================================================
 * AVALO FIREBASE INTEGRATION TEST - UTILITIES
 * ========================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  duration: number;
  message?: string;
  error?: string;
  data?: any;
}

export interface TestReport {
  timestamp: string;
  projectId: string;
  region: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  summary: {
    environment: any;
    build: any;
    emulators: any;
    endpoints: any;
    integrations: any;
    security: any;
    performance: any;
  };
}

/**
 * Load environment variables from .env file
 */
export function loadEnvFile(envPath: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
    
    return envVars;
  } catch (error) {
    throw new Error(`Failed to load .env file: ${error}`);
  }
}

/**
 * Execute a command and capture output
 */
export async function runCommand(
  command: string,
  cwd?: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      timeout,
      env: { ...process.env },
    });
    
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
    };
  }
}

/**
 * Make HTTP request with timeout
 */
export async function makeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
  } = {}
): Promise<{
  status: number;
  data: any;
  headers: Record<string, string>;
  duration: number;
}> {
  const startTime = Date.now();
  const timeout = options.timeout || 10000;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const duration = Date.now() - startTime;
    let data;
    
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    return {
      status: response.status,
      data,
      headers,
      duration,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 30000,
  interval: number = 1000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      if (await condition()) {
        return true;
      }
    } catch {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Generate test report in Markdown format
 */
export function generateMarkdownReport(report: TestReport): string {
  const { timestamp, projectId, region, totalTests, passed, failed, warnings, skipped, duration, results } = report;
  
  const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(2) : '0.00';
  
  let markdown = `# 🔥 AVALO Firebase Integration Test Report

**Generated:** ${new Date(timestamp).toLocaleString()}  
**Project ID:** ${projectId}  
**Region:** ${region}  
**Duration:** ${formatDuration(duration)}

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${totalTests} |
| ✅ Passed | ${passed} |
| 🔥 Failed | ${failed} |
| ⚠️ Warnings | ${warnings} |
| ⏭️ Skipped | ${skipped} |
| **Pass Rate** | **${passRate}%** |

---

## 📋 Test Results

`;

  // Group results by category
  const categories = {
    'Environment': results.filter(r => r.name.includes('Environment')),
    'Build': results.filter(r => r.name.includes('Build')),
    'Emulators': results.filter(r => r.name.includes('Emulator')),
    'Endpoints': results.filter(r => r.name.includes('Endpoint') || r.name.includes('HTTP')),
    'Integrations': results.filter(r => r.name.includes('Stripe') || r.name.includes('AI') || r.name.includes('Storage')),
    'Security': results.filter(r => r.name.includes('Security')),
    'Performance': results.filter(r => r.name.includes('Performance')),
  };
  
  for (const [category, categoryResults] of Object.entries(categories)) {
    if (categoryResults.length === 0) continue;
    
    markdown += `### ${category}\n\n`;
    
    for (const result of categoryResults) {
      const icon = result.status === 'pass' ? '✅' : 
                   result.status === 'fail' ? '🔥' : 
                   result.status === 'warning' ? '⚠️' : '⏭️';
      
      markdown += `${icon} **${result.name}** - ${formatDuration(result.duration)}\n`;
      
      if (result.message) {
        markdown += `   📝 ${result.message}\n`;
      }
      
      if (result.error) {
        markdown += `   ❌ Error: \`${result.error}\`\n`;
      }
      
      markdown += '\n';
    }
  }
  
  markdown += `---

## 🎯 Recommendations

`;

  if (failed > 0) {
    markdown += `### 🔥 Critical Issues\n\n`;
    const failedTests = results.filter(r => r.status === 'fail');
    for (const test of failedTests) {
      markdown += `- **${test.name}**: ${test.error || 'Unknown error'}\n`;
    }
    markdown += '\n';
  }
  
  if (warnings > 0) {
    markdown += `### ⚠️ Warnings\n\n`;
    const warningTests = results.filter(r => r.status === 'warning');
    for (const test of warningTests) {
      markdown += `- **${test.name}**: ${test.message || 'Review required'}\n`;
    }
    markdown += '\n';
  }
  
  markdown += `---

*Report generated by Avalo Integration Test Suite v1.0.0*
`;
  
  return markdown;
}

/**
 * Save report to file
 */
export function saveReport(report: TestReport, outputPath: string): void {
  const markdown = generateMarkdownReport(report);
  const jsonPath = outputPath.replace('.md', '.json');
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Save markdown report
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  
  // Save JSON report
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * Check if a port is in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const response = await makeRequest(`http://127.0.0.1:${port}`, { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate JSON structure
 */
export function validateJSON(data: any, requiredKeys: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const key of requiredKeys) {
    if (!(key in data)) {
      missing.push(key);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}