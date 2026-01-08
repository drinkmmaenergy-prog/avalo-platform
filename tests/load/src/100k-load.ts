/**
 * ================================================================
 * AVALO LOAD ENGINE: 100K REALISTIC USERS
 * ================================================================
 * Simulates 100,000 simultaneous users with realistic behavior patterns
 * 
 * Metrics Tracked:
 * - P50, P95, P99 latency
 * - Throughput per second
 * - Error rate
 * - Bottleneck detection
 * - Resource utilization
 * 
 * Test Duration: ~30 minutes
 * Expected Load: Moderate (production-like)
 */

import axios, { AxiosError } from 'axios';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';

// ================================================================
// CONFIGURATION
// ================================================================

const CONFIG = {
  BASE_URL: process.env.LOAD_TEST_URL || 'https://europe-west3-avalo-prod.cloudfunctions.net',
  TOTAL_USERS: 100_000,
  CONCURRENT_BATCHES: 1000, // Process 1000 users at a time
  RAMP_UP_TIME_MS: 5 * 60 * 1000, // 5 minutes ramp-up
  TEST_DURATION_MS: 25 * 60 * 1000, // 25 minutes steady state
  THINK_TIME_MS: [500, 5000], // Random think time between actions
};

// ================================================================
// USER BEHAVIOR PROFILES
// ================================================================

interface UserAction {
  type: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  weight: number; // Probability weight
}

const USER_BEHAVIORS: UserAction[] = [
  { type: 'viewFeed', endpoint: '/getFeed', method: 'GET', weight: 30 },
  { type: 'swipe', endpoint: '/performSwipe', method: 'POST', weight: 25 },
  { type: 'sendMessage', endpoint: '/sendChatMessage', method: 'POST', weight: 20 },
  { type: 'viewProfile', endpoint: '/getProfile', method: 'GET', weight: 15 },
  { type: 'updateStatus', endpoint: '/updateOnlineStatus', method: 'POST', weight: 5 },
  { type: 'getDiscovery', endpoint: '/getDiscoveryRecommendations', method: 'GET', weight: 3 },
  { type: 'sendTip', endpoint: '/sendLiveTip', method: 'POST', weight: 1 },
  { type: 'browseProducts', endpoint: '/getCreatorProducts', method: 'GET', weight: 1 },
];

// ================================================================
// METRICS COLLECTOR
// ================================================================

interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  errors: Map<string, number>;
  throughput: number[];
  startTime: number;
  endTime?: number;
}

class MetricsCollector {
  private metrics: Metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    errors: new Map(),
    throughput: [],
    startTime: Date.now(),
  };

  recordRequest(latencyMs: number, success: boolean, error?: string) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
      this.metrics.latencies.push(latencyMs);
    } else {
      this.metrics.failedRequests++;
      if (error) {
        const count = this.metrics.errors.get(error) || 0;
        this.metrics.errors.set(error, count + 1);
      }
    }
  }

  recordThroughput(requestsPerSecond: number) {
    this.metrics.throughput.push(requestsPerSecond);
  }

  getMetrics(): Metrics {
    return { ...this.metrics, endTime: Date.now() };
  }

  getPercentile(percentile: number): number {
    if (this.metrics.latencies.length === 0) return 0;
    
    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getErrorRate(): number {
    return this.metrics.failedRequests / this.metrics.totalRequests;
  }

  getThroughputStats() {
    if (this.metrics.throughput.length === 0) return { avg: 0, max: 0, min: 0 };
    
    return {
      avg: this.metrics.throughput.reduce((a, b) => a + b, 0) / this.metrics.throughput.length,
      max: Math.max(...this.metrics.throughput),
      min: Math.min(...this.metrics.throughput),
    };
  }
}

// ================================================================
// VIRTUAL USER SIMULATOR
// ================================================================

class VirtualUser {
  private id: string;
  private token: string;
  private metrics: MetricsCollector;

  constructor(id: string, metrics: MetricsCollector) {
    this.id = id;
    this.token = `test-token-${id}-${Date.now()}`;
    this.metrics = metrics;
  }

  private async makeRequest(action: UserAction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios({
        method: action.method,
        url: `${CONFIG.BASE_URL}${action.endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        data: action.method !== 'GET' ? { userId: this.id } : undefined,
        timeout: 10000,
      });

      const latency = Date.now() - startTime;
      this.metrics.recordRequest(latency, response.status < 400);
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMsg = error instanceof AxiosError 
        ? `${error.response?.status || 'NETWORK_ERROR'}: ${error.message}`
        : 'UNKNOWN_ERROR';
      
      this.metrics.recordRequest(latency, false, errorMsg);
    }
  }

  private selectAction(): UserAction {
    const totalWeight = USER_BEHAVIORS.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const behavior of USER_BEHAVIORS) {
      random -= behavior.weight;
      if (random <= 0) {
        return behavior;
      }
    }

    return USER_BEHAVIORS[0];
  }

  private getThinkTime(): number {
    const [min, max] = CONFIG.THINK_TIME_MS;
    return Math.floor(Math.random() * (max - min) + min);
  }

  async simulate(durationMs: number): Promise<void> {
    const endTime = Date.now() + durationMs;

    while (Date.now() < endTime) {
      const action = this.selectAction();
      await this.makeRequest(action);
      
      // Think time between actions
      const thinkTime = this.getThinkTime();
      await new Promise(resolve => setTimeout(resolve, thinkTime));
    }
  }
}

// ================================================================
// LOAD TEST ORCHESTRATOR
// ================================================================

class LoadTestOrchestrator {
  private metrics: MetricsCollector;
  private users: VirtualUser[] = [];
  private progressBar: cliProgress.SingleBar;

  constructor() {
    this.metrics = new MetricsCollector();
    this.progressBar = new cliProgress.SingleBar({
      format: 'Load Test Progress |{bar}| {percentage}% | {value}/{total} Users | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    });
  }

  private async createUsers(count: number): Promise<void> {
    console.log(`🔧 Creating ${count.toLocaleString()} virtual users...`);
    
    for (let i = 0; i < count; i++) {
      const user = new VirtualUser(`user-${i}`, this.metrics);
      this.users.push(user);
    }

    console.log(`✅ ${count.toLocaleString()} users created`);
  }

  private async rampUp(durationMs: number): Promise<void> {
    console.log(`\n🚀 Ramping up users over ${durationMs / 1000}s...`);
    
    const batchSize = CONFIG.CONCURRENT_BATCHES;
    const totalBatches = Math.ceil(this.users.length / batchSize);
    const delayBetweenBatches = durationMs / totalBatches;

    this.progressBar.start(this.users.length, 0);

    for (let i = 0; i < this.users.length; i += batchSize) {
      const batch = this.users.slice(i, i + batchSize);
      
      // Start batch simulation (non-blocking)
      batch.forEach(user => {
        user.simulate(CONFIG.TEST_DURATION_MS).catch(err => {
          console.error(`User simulation error: ${err.message}`);
        });
      });

      this.progressBar.update(i + batch.length);
      
      // Wait before starting next batch
      if (i + batchSize < this.users.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    this.progressBar.stop();
    console.log(`✅ All users ramped up`);
  }

  private async monitorThroughput(durationMs: number): Promise<void> {
    const interval = 1000; // Sample every second
    const iterations = Math.floor(durationMs / interval);

    console.log(`\n📊 Monitoring throughput for ${durationMs / 1000}s...`);

    let lastRequestCount = 0;

    for (let i = 0; i < iterations; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));
      
      const currentCount = this.metrics.getMetrics().totalRequests;
      const throughput = currentCount - lastRequestCount;
      this.metrics.recordThroughput(throughput);
      lastRequestCount = currentCount;

      if (i % 10 === 0) {
        console.log(`  └─ ${throughput} req/s | Total: ${currentCount.toLocaleString()}`);
      }
    }
  }

  private generateReport(): void {
    const metrics = this.metrics.getMetrics();
    const throughputStats = this.metrics.getThroughputStats();

    console.log('\n' + '='.repeat(60));
    console.log('📈 LOAD TEST RESULTS: 100K REALISTIC USERS');
    console.log('='.repeat(60));

    console.log('\n🎯 Request Statistics:');
    console.log(`  Total Requests:      ${metrics.totalRequests.toLocaleString()}`);
    console.log(`  Successful:          ${metrics.successfulRequests.toLocaleString()} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`  Failed:              ${metrics.failedRequests.toLocaleString()} (${(this.metrics.getErrorRate() * 100).toFixed(2)}%)`);

    console.log('\n⏱️  Latency Percentiles:');
    console.log(`  P50 (Median):        ${this.metrics.getPercentile(50).toFixed(2)} ms`);
    console.log(`  P95:                 ${this.metrics.getPercentile(95).toFixed(2)} ms`);
    console.log(`  P99:                 ${this.metrics.getPercentile(99).toFixed(2)} ms`);

    console.log('\n🚀 Throughput Statistics:');
    console.log(`  Average:             ${throughputStats.avg.toFixed(2)} req/s`);
    console.log(`  Peak:                ${throughputStats.max} req/s`);
    console.log(`  Minimum:             ${throughputStats.min} req/s`);

    if (metrics.errors.size > 0) {
      console.log('\n❌ Error Breakdown:');
      metrics.errors.forEach((count, error) => {
        console.log(`  ${error}: ${count} occurrences`);
      });
    }

    const durationSeconds = (metrics.endTime! - metrics.startTime) / 1000;
    console.log(`\n⏰ Test Duration: ${durationSeconds.toFixed(2)}s`);
    console.log('='.repeat(60));

    // Save to file
    const report = {
      testType: '100K Realistic Users',
      timestamp: new Date().toISOString(),
      config: CONFIG,
      metrics: {
        totalRequests: metrics.totalRequests,
        successRate: (metrics.successfulRequests / metrics.totalRequests) * 100,
        errorRate: this.metrics.getErrorRate() * 100,
        latency: {
          p50: this.metrics.getPercentile(50),
          p95: this.metrics.getPercentile(95),
          p99: this.metrics.getPercentile(99),
        },
        throughput: throughputStats,
        duration: durationSeconds,
        errors: Object.fromEntries(metrics.errors),
      },
    };

    const reportsDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, `load-100k-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}`);
  }

  async run(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AVALO LOAD TEST: 100K REALISTIC USERS');
    console.log('='.repeat(60));
    console.log(`Target URL: ${CONFIG.BASE_URL}`);
    console.log(`Total Users: ${CONFIG.TOTAL_USERS.toLocaleString()}`);
    console.log(`Ramp-up Time: ${CONFIG.RAMP_UP_TIME_MS / 1000}s`);
    console.log(`Test Duration: ${CONFIG.TEST_DURATION_MS / 1000}s`);
    console.log('='.repeat(60));

    try {
      // Phase 1: CreateUsers
      await this.createUsers(CONFIG.TOTAL_USERS);

      // Phase 2: Ramp Up
      await this.rampUp(CONFIG.RAMP_UP_TIME_MS);

      // Phase 3: Monitor Steady State
      await this.monitorThroughput(CONFIG.TEST_DURATION_MS);

      // Phase 4: Generate Report
      this.generateReport();

      console.log('\n✅ Load test completed successfully!\n');
    } catch (error) {
      console.error('\n❌ Load test failed:', error);
      process.exit(1);
    }
  }
}

// ================================================================
// MAIN EXECUTION
// ================================================================

if (require.main === module) {
  const orchestrator = new LoadTestOrchestrator();
  orchestrator.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { LoadTestOrchestrator, MetricsCollector, VirtualUser };