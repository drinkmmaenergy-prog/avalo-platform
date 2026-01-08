/**
 * ================================================================
 * AVALO UNIFIED LOAD TEST REPORTER
 * ================================================================
 * Consolidates results from all load tests and generates:
 * - HTML dashboard
 * - JSON summary
 * - Cost projections
 * - Scaling recommendations
 */

import * as fs from 'fs';
import * as path from 'path';

// ================================================================
// TYPES
// ================================================================

interface LoadTestReport {
  testType: string;
  timestamp: string;
  metrics: any;
  config?: any;
  capacityAnalysis?: any;
  recommendations?: string[];
}

interface CostProjection {
  scenario: string;
  users: number;
  monthlyRequests: number;
  costs: {
    cloudFunctions: number;
    firestore: number;
    storage: number;
    bandwidth: number;
    total: number;
  };
}

// ================================================================
// COST CALCULATOR
// ================================================================

class CostCalculator {
  // GCP Pricing (as of 2024, europe-west3)
  private readonly PRICING = {
    cloudFunctions: {
      invocations: 0.40 / 1_000_000, // $0.40 per 1M invocations
      cpu: 0.00001650 / 1000, // Per 100ms at 1GHz
      memory: 0.00000250 / 1000, // Per 100ms per GB
    },
    firestore: {
      reads: 0.036 / 100_000, // $0.036 per 100K reads
      writes: 0.108 / 100_000, // $0.108 per 100K writes
      deletes: 0.012 / 100_000, // $0.012 per 100K deletes
      storage: 0.18 / (1024 * 1024 * 1024), // $0.18 per GB/month
    },
    storage: {
      standard: 0.020 / (1024 * 1024 * 1024), // $0.020 per GB/month
      operations: 0.05 / 10_000, // $0.05 per 10K operations
    },
    bandwidth: {
      egress: 0.12 / (1024 * 1024 * 1024), // $0.12 per GB
    },
  };

  calculateCosts(users: number, opsPerUserPerDay: number): CostProjection {
    const monthlyRequests = users * opsPerUserPerDay * 30;
    
    // Cloud Functions costs
    const functionInvocations = monthlyRequests;
    const avgExecutionTimeMs = 150;
    const avgMemoryGB = 0.512;
    const cpuCost = functionInvocations * (avgExecutionTimeMs / 100) * this.PRICING.cloudFunctions.cpu;
    const memoryCost = functionInvocations * (avgExecutionTimeMs / 100) * avgMemoryGB * this.PRICING.cloudFunctions.memory;
    const invocationCost = functionInvocations * this.PRICING.cloudFunctions.invocations;
    const cloudFunctionsCost = cpuCost + memoryCost + invocationCost;

    // Firestore costs
    const readsPerRequest = 2;
    const writesPerRequest = 0.3;
    const firestoreReads = monthlyRequests * readsPerRequest;
    const firestoreWrites = monthlyRequests * writesPerRequest;
    const firestoreReadCost = firestoreReads * this.PRICING.firestore.reads;
    const firestoreWriteCost = firestoreWrites * this.PRICING.firestore.writes;
    const firestoreStorageGB = users * 0.5 / 1024; // 0.5MB per user
    const firestoreStorageCost = firestoreStorageGB * this.PRICING.firestore.storage;
    const firestoreCost = firestoreReadCost + firestoreWriteCost + firestoreStorageCost;

    // Storage costs
    const storageGB = users * 10 / 1024; // 10MB per user (media)
    const storageOperations = monthlyRequests * 0.1; // 10% involve storage
    const storageCost = (storageGB * this.PRICING.storage.standard) + 
                        (storageOperations * this.PRICING.storage.operations);

    // Bandwidth costs
    const avgResponseSizeKB = 50;
    const bandwidthGB = (monthlyRequests * avgResponseSizeKB) / (1024 * 1024);
    const bandwidthCost = bandwidthGB * this.PRICING.bandwidth.egress;

    return {
      scenario: `${users.toLocaleString()} users`,
      users,
      monthlyRequests,
      costs: {
        cloudFunctions: Math.round(cloudFunctionsCost * 100) / 100,
        firestore: Math.round(firestoreCost * 100) / 100,
        storage: Math.round(storageCost * 100) / 100,
        bandwidth: Math.round(bandwidthCost * 100) / 100,
        total: Math.round((cloudFunctionsCost + firestoreCost + storageCost + bandwidthCost) * 100) / 100,
      },
    };
  }

  generateProjections(): CostProjection[] {
    const scenarios = [
      { users: 10_000, ops: 50 },
      { users: 100_000, ops: 50 },
      { users: 500_000, ops: 50 },
      { users: 1_000_000, ops: 50 },
      { users: 5_000_000, ops: 50 },
      { users: 10_000_000, ops: 50 },
      { users: 20_000_000, ops: 50 },
    ];

    return scenarios.map(s => this.calculateCosts(s.users, s.ops));
  }
}

// ================================================================
// REPORT AGGREGATOR
// ================================================================

class ReportAggregator {
  private reports: LoadTestReport[] = [];
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
  }

  loadReports(): void {
    console.log('📂 Loading test reports...');
    
    if (!fs.existsSync(this.reportsDir)) {
      console.log('⚠️  No reports directory found');
      return;
    }

    const files = fs.readdirSync(this.reportsDir);
    const jsonFiles = files.filter(f => f.startsWith('load-') && f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(this.reportsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const report = JSON.parse(content);
        this.reports.push(report);
      } catch (error) {
        console.error(`  └─ Error loading ${file}:`, error);
      }
    }

    console.log(`✅ Loaded ${this.reports.length} reports`);
  }

  generateHTML(): string {
    const costCalc = new CostCalculator();
    const projections = costCalc.generateProjections();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Avalo Load Test Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #667eea;
      font-size: 36px;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #666;
      font-size: 16px;
      margin-bottom: 40px;
    }
    .section {
      margin-bottom: 40px;
    }
    h2 {
      color: #333;
      font-size: 24px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      border-left: 4px solid #667eea;
    }
    .card h3 {
      color: #667eea;
      font-size: 18px;
      margin-bottom: 15px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label {
      color: #666;
      font-size: 14px;
    }
    .metric-value {
      color: #333;
      font-weight: 600;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e9ecef;
    }
    th {
      background: #667eea;
      color: white;
      font-weight: 600;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .cost {
      color: #28a745;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 8px;
    }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .timestamp {
      color: #999;
      font-size: 12px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Avalo Load Test Dashboard</h1>
    <p class="subtitle">Comprehensive load testing results and capacity analysis</p>

    <div class="section">
      <h2>📊 Test Summary</h2>
      <div class="grid">
        ${this.reports.map(r => this.renderReportCard(r)).join('\n        ')}
      </div>
    </div>

    <div class="section">
      <h2>💰 Cost Projections</h2>
      <table>
        <thead>
          <tr>
            <th>Users</th>
            <th>Monthly Requests</th>
            <th>Cloud Functions</th>
            <th>Firestore</th>
            <th>Storage</th>
            <th>Bandwidth</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${projections.map(p => `
          <tr>
            <td>${p.scenario}</td>
            <td>${p.monthlyRequests.toLocaleString()}</td>
            <td class="cost">$${p.costs.cloudFunctions.toLocaleString()}</td>
            <td class="cost">$${p.costs.firestore.toLocaleString()}</td>
            <td class="cost">$${p.costs.storage.toLocaleString()}</td>
            <td class="cost">$${p.costs.bandwidth.toLocaleString()}</td>
            <td class="cost"><strong>$${p.costs.total.toLocaleString()}</strong></td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>🎯 Scaling Recommendations</h2>
      ${this.renderRecommendations()}
    </div>

    <p class="timestamp">Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;
  }

  private renderReportCard(report: LoadTestReport): string {
    const getStatusBadge = () => {
      if (report.testType.includes('100K')) {
        return '<span class="badge badge-success">Production Ready</span>';
      } else if (report.testType.includes('1M')) {
        return '<span class="badge badge-warning">High Load</span>';
      } else {
        return '<span class="badge badge-danger">Extreme Stress</span>';
      }
    };

    const metrics = report.metrics || {};

    return `
        <div class="card">
          <h3>${report.testType}</h3>
          ${getStatusBadge()}
          <div style="margin-top: 15px;">
            ${this.renderMetric('Total Operations', metrics.totalOperations?.toLocaleString() || 'N/A')}
            ${metrics.successRate ? this.renderMetric('Success Rate', `${metrics.successRate.toFixed(2)}%`) : ''}
            ${metrics.latency?.p95 ? this.renderMetric('P95 Latency', `${metrics.latency.p95.toFixed(2)}ms`) : ''}
            ${metrics.avgOpsPerSecond ? this.renderMetric('Avg Ops/Second', metrics.avgOpsPerSecond.toFixed(2)) : ''}
            ${metrics.throughput?.avg ? this.renderMetric('Throughput', `${metrics.throughput.avg.toFixed(2)} req/s`) : ''}
          </div>
        </div>`;
  }

  private renderMetric(label: string, value: string): string {
    return `
            <div class="metric">
              <span class="metric-label">${label}</span>
              <span class="metric-value">${value}</span>
            </div>`;
  }

  private renderRecommendations(): string {
    const allRecommendations = this.reports
      .filter(r => r.recommendations && r.recommendations.length > 0)
      .flatMap(r => r.recommendations || []);

    if (allRecommendations.length === 0) {
      return '<p>No specific recommendations - system performing well across all tests.</p>';
    }

    return `
      <div class="card">
        <ul style="list-style: none; padding: 0;">
          ${allRecommendations.map(r => `<li style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${r}</li>`).join('\n          ')}
        </ul>
      </div>`;
  }

  saveHTML(html: string): void {
    const outputPath = path.join(this.reportsDir, 'load-test-dashboard.html');
    fs.writeFileSync(outputPath, html);
    console.log(`\n📊 HTML dashboard saved to: ${outputPath}`);
  }

  generateJSON(): void {
    const costCalc = new CostCalculator();
    const projections = costCalc.generateProjections();

    const summary = {
      generatedAt: new Date().toISOString(),
      totalTests: this.reports.length,
      reports: this.reports,
      costProjections: projections,
      scalingRecommendations: this.reports
        .filter(r => r.recommendations)
        .flatMap(r => r.recommendations || []),
    };

    const outputPath = path.join(this.reportsDir, 'load-test-summary.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log(`📄 JSON summary saved to: ${outputPath}`);
  }
}

// ================================================================
// MAIN EXECUTION
// ================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📈 AVALO UNIFIED LOAD TEST REPORTER');
  console.log('='.repeat(60));

  const aggregator = new ReportAggregator();
  
  aggregator.loadReports();
  
  const html = aggregator.generateHTML();
  aggregator.saveHTML(html);
  
  aggregator.generateJSON();

  console.log('\n✅ Report generation completed!\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { ReportAggregator, CostCalculator };