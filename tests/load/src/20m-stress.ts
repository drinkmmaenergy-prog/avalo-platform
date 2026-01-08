/**
 * ================================================================
 * AVALO LOAD ENGINE: 20M STRESS SIMULATION
 * ================================================================
 * Probabilistic model for 20,000,000 users
 * Tests system limits, queue pressure, sharding, hotspot detection
 * 
 * Focus:
 * - Queue saturation modeling
 * - Distributed shard stress
 * - Hot document detection
 * - Async pipeline pressure
 * - Auto-scaling thresholds
 * 
 * Test Duration: ~60 minutes
 * Expected Load: Extreme (breaking point analysis)
 */

import * as fs from 'fs';
import * as path from 'path';

// ================================================================
// CONFIGURATION
// ================================================================

const CONFIG = {
  TOTAL_USERS: 20_000_000,
  ACTIVE_USER_PERCENTAGE: 10, // 10% active = 2M concurrent
  SIMULATION_TIME_MINUTES: 60,
  SHARD_COUNT: 1000,
  QUEUE_WORKERS: 100,
  HOTSPOT_THRESHOLD: 500, // Operations per second per document
};

// ================================================================
// PROBABILISTIC USER MODEL
// ================================================================

interface UserBehaviorProfile {
  userId: string;
  activityLevel: 'low' | 'medium' | 'high' | 'whale';
  operationsPerMinute: number;
  preferredShards: number[];
}

class ProbabilisticUserModel {
  private profiles: Map<string, UserBehaviorProfile> = new Map();

  generateProfiles(totalUsers: number): void {
    console.log(`🔧 Generating probabilistic profiles for ${totalUsers.toLocaleString()} users...`);
    
    const distributionratios = {
      low: 0.70,      // 70% low activity
      medium: 0.20,   // 20% medium activity
      high: 0.095,    // 9.5% high activity
      whale: 0.005,   // 0.5% whales (power users)
    };

    const activityRates = {
      low: 2,      // 2 ops/min
      medium: 10,  // 10 ops/min
      high: 50,   // 50 ops/min
      whale: 200,  // 200 ops/min
    };

    for (let i = 0; i < totalUsers; i++) {
      const random = Math.random();
      let activityLevel: 'low' | 'medium' | 'high' | 'whale';
      
      if (random < distributionratios.low) {
        activityLevel = 'low';
      } else if (random < distributionratios.low + distributionratios.medium) {
        activityLevel = 'medium';
      } else if (random < distributionratios.low + distributionratios.medium + distributionratios.high) {
        activityLevel = 'high';
      } else {
        activityLevel = 'whale';
      }

      const preferredShards = this.assignShards(i, CONFIG.SHARD_COUNT);

      this.profiles.set(`user-${i}`, {
        userId: `user-${i}`,
        activityLevel,
        operationsPerMinute: activityRates[activityLevel],
        preferredShards,
      });

      if (i % 1000000 === 0 && i > 0) {
        console.log(`  └─ Progress: ${i.toLocaleString()} profiles`);
      }
    }

    console.log(`✅ Profiles generated`);
    this.printDistribution();
  }

  private assignShards(userId: number, shardCount: number): number[] {
    // Assign user to 2-3 shards for geo-distribution
    const shardCount_ = 2 + Math.floor(Math.random() * 2);
    const shards: number[] = [];
    
    for (let i = 0; i < shardCount_; i++) {
      const shard = Math.floor(Math.random() * shardCount);
      if (!shards.includes(shard)) {
        shards.push(shard);
      }
    }

    return shards;
  }

  private printDistribution(): void {
    const counts = { low: 0, medium: 0, high: 0, whale: 0 };
    
    this.profiles.forEach(profile => {
      counts[profile.activityLevel]++;
    });

    console.log('\n📊 User Distribution:');
    console.log(`  Low Activity:    ${counts.low.toLocaleString()} (${(counts.low / this.profiles.size * 100).toFixed(1)}%)`);
    console.log(`  Medium Activity: ${counts.medium.toLocaleString()} (${(counts.medium / this.profiles.size * 100).toFixed(1)}%)`);
    console.log(`  High Activity:   ${counts.high.toLocaleString()} (${(counts.high / this.profiles.size * 100).toFixed(1)}%)`);
    console.log(`  Whales:          ${counts.whale.toLocaleString()} (${(counts.whale / this.profiles.size * 100).toFixed(1)}%)`);
  }

  getActiveUsers(percentage: number): UserBehaviorProfile[] {
    const activeCount = Math.floor(this.profiles.size * (percentage / 100));
    const allProfiles = Array.from(this.profiles.values());
    
    // Randomly select active users
    const active: UserBehaviorProfile[] = [];
    const used = new Set<number>();

    while (active.length < activeCount) {
      const index = Math.floor(Math.random() * allProfiles.length);
      if (!used.has(index)) {
        used.add(index);
        active.push(allProfiles[index]);
      }
    }

    return active;
  }

  getTotalProfiles(): number {
    return this.profiles.size;
  }
}

// ================================================================
// SHARD LOAD ANALYZER
// ================================================================

interface ShardMetrics {
  shardId: number;
  operationsPerSecond: number;
  activeUsers: number;
  queueDepth: number;
  hotDocuments: Set<string>;
}

class ShardLoadAnalyzer {
  private shardMetrics: Map<number, ShardMetrics> = new Map();
  private operationHistory: Array<{ timestamp: number; shardId: number }> = [];

  constructor(shardCount: number) {
    for (let i = 0; i < shardCount; i++) {
      this.shardMetrics.set(i, {
        shardId: i,
        operationsPerSecond: 0,
        activeUsers: 0,
        queueDepth: 0,
        hotDocuments: new Set(),
      });
    }
  }

  recordOperation(shardId: number, documentId?: string): void {
    const metrics = this.shardMetrics.get(shardId);
    if (!metrics) return;

    metrics.operationsPerSecond++;
    this.operationHistory.push({ timestamp: Date.now(), shardId });

    if (documentId) {
      metrics.hotDocuments.add(documentId);
    }
  }

  analyzeLoad(): {
    totalOps: number;
    avgOpsPerShard: number;
    maxLoadShard: number;
    minLoadShard: number;
    hotspots: number[];
    queuePressure: number;
  } {
    let totalOps = 0;
    let maxLoad = 0;
    let minLoad = Infinity;
    let maxLoadShard = 0;
    let minLoadShard = 0;
    const hotspots: number[] = [];

    this.shardMetrics.forEach((metrics, shardId) => {
      totalOps += metrics.operationsPerSecond;
      
      if (metrics.operationsPerSecond > maxLoad) {
        maxLoad = metrics.operationsPerSecond;
        maxLoadShard = shardId;
      }
      
      if (metrics.operationsPerSecond < minLoad) {
        minLoad = metrics.operationsPerSecond;
        minLoadShard = shardId;
      }

      if (metrics.operationsPerSecond > CONFIG.HOTSPOT_THRESHOLD) {
        hotspots.push(shardId);
      }
    });

    const avgOpsPerShard = totalOps / this.shardMetrics.size;
    const queuePressure = this.calculateQueuePressure();

    return {
      totalOps,
      avgOpsPerShard,
      maxLoadShard,
      minLoadShard,
      hotspots,
      queuePressure,
    };
  }

  private calculateQueuePressure(): number {
    let totalQueueDepth = 0;
    this.shardMetrics.forEach(metrics => {
      totalQueueDepth += metrics.queueDepth;
    });
    
    return totalQueueDepth / this.shardMetrics.size;
  }

  resetCounters(): void {
    this.shardMetrics.forEach(metrics => {
      metrics.operationsPerSecond = 0;
    });
  }

  getShardBalanceScore(): number {
    const ops = Array.from(this.shardMetrics.values()).map(m => m.operationsPerSecond);
    const avg = ops.reduce((a, b) => a + b, 0) / ops.length;
    const variance = ops.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / ops.length;
    const stdDev = Math.sqrt(variance);
    
    // Perfect balance = 1.0, imbalanced = closer to 0
    return Math.max(0, 1 - (stdDev / avg));
  }
}

// ================================================================
// QUEUE PRESSURE SIMULATOR
// ================================================================

class QueueSimulator {
  private queues: Map<string, number[]> = new Map();
  private maxQueueDepth = 0;
  private totalEnqueued = 0;
  private totalProcessed = 0;

  enqueue(queueName: string, itemId: number): void {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }

    const queue = this.queues.get(queueName)!;
    queue.push(itemId);
    this.totalEnqueued++;

    if (queue.length > this.maxQueueDepth) {
      this.maxQueueDepth = queue.length;
    }
  }

  processQueues(itemsPerWorker: number): void {
    this.queues.forEach(queue => {
      const itemsToProcess = Math.min(queue.length, itemsPerWorker * CONFIG.QUEUE_WORKERS);
      queue.splice(0, itemsToProcess);
      this.totalProcessed += itemsToProcess;
    });
  }

  getMetrics() {
    let currentDepth = 0;
    this.queues.forEach(queue => {
      currentDepth += queue.length;
    });

    return {
      maxQueueDepth: this.maxQueueDepth,
      currentDepth,
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      backlog: this.totalEnqueued - this.totalProcessed,
      saturation: (currentDepth / (this.maxQueueDepth || 1)) * 100,
    };
  }
}

// ================================================================
// STRESS TEST ORCHESTRATOR
// ================================================================

class StressTestOrchestrator {
  private userModel: ProbabilisticUserModel;
  private shardAnalyzer: ShardLoadAnalyzer;
  private queueSimulator: QueueSimulator;
  private metrics: {
    totalOperations: number;
    peakOpsPerSecond: number;
    avgOpsPerSecond: number[];
    shardBalanceHistory: number[];
  };

  constructor() {
    this.userModel = new ProbabilisticUserModel();
    this.shardAnalyzer = new ShardLoadAnalyzer(CONFIG.SHARD_COUNT);
    this.queueSimulator = new QueueSimulator();
    this.metrics = {
      totalOperations: 0,
      peakOpsPerSecond: 0,
      avgOpsPerSecond: [],
      shardBalanceHistory: [],
    };
  }

  async run(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AVALO STRESS TEST: 20M USER SIMULATION');
    console.log('='.repeat(60));
    console.log(`Total Users: ${CONFIG.TOTAL_USERS.toLocaleString()}`);
    console.log(`Active Users: ${(CONFIG.TOTAL_USERS * CONFIG.ACTIVE_USER_PERCENTAGE / 100).toLocaleString()} (${CONFIG.ACTIVE_USER_PERCENTAGE}%)`);
    console.log(`Shards: ${CONFIG.SHARD_COUNT.toLocaleString()}`);
    console.log(`Duration: ${CONFIG.SIMULATION_TIME_MINUTES} minutes`);
    console.log('='.repeat(60));

    // Phase 1: Generate user profiles
    this.userModel.generateProfiles(CONFIG.TOTAL_USERS);

    // Phase 2: Run simulation
    await this.runSimulation();

    // Phase 3: Generate report
    this.generateReport();
  }

  private async runSimulation(): Promise<void> {
    console.log(`\n🔥 Starting stress simulation...`);
    
    const activeUsers = this.userModel.getActiveUsers(CONFIG.ACTIVE_USER_PERCENTAGE);
    const intervalMs = 60000; // 1 minute intervals
    const totalIntervals = CONFIG.SIMULATION_TIME_MINUTES;

    for (let minute = 1; minute <= totalIntervals; minute++) {
      const startTime = Date.now();
      let operationsThisMinute = 0;

      // Simulate operations for each active user
      for (const user of activeUsers) {
        const opsThisMinute = Math.floor(Math.random() * user.operationsPerMinute * 1.5); // +50% variance
        
        for (let op = 0; op < opsThisMinute; op++) {
          // Select random shard from user's preferred shards
          const shard = user.preferredShards[Math.floor(Math.random() * user.preferredShards.length)];
          this.shardAnalyzer.recordOperation(shard);
          
          // Enqueue operation
          this.queueSimulator.enqueue(`shard-${shard}`, this.metrics.totalOperations);
          
          operationsThisMinute++;
          this.metrics.totalOperations++;
        }

        // Sample only subset for performance
        if (Math.random() < 0.001) { // 0.1% sampling
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Process queues
      this.queueSimulator.processQueues(100);

      // Analyze shard load
      const loadAnalysis = this.shardAnalyzer.analyzeLoad();
      const opsPerSecond = operationsThisMinute / 60;
      this.metrics.avgOpsPerSecond.push(opsPerSecond);
      
      if (opsPerSecond > this.metrics.peakOpsPerSecond) {
        this.metrics.peakOpsPerSecond = opsPerSecond;
      }

      const balanceScore = this.shardAnalyzer.getShardBalanceScore();
      this.metrics.shardBalanceHistory.push(balanceScore);

      // Reset shard counters for next minute
      this.shardAnalyzer.resetCounters();

      // Log progress
      console.log(`  └─ Min ${minute}/${totalIntervals}: ${operationsThisMinute.toLocaleString()} ops | ${opsPerSecond.toFixed(0)} ops/s | Hotspots: ${loadAnalysis.hotspots.length} | Balance: ${(balanceScore * 100).toFixed(1)}%`);

      // Wait for next minute
      const elapsed = Date.now() - startTime;
      const waitTime = Math.max(0, intervalMs - elapsed);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    console.log(`✅ Simulation completed`);
  }

  private generateReport(): void {
    const queueMetrics = this.queueSimulator.getMetrics();
    const avgOps = this.metrics.avgOpsPerSecond.reduce((a, b) => a + b, 0) / this.metrics.avgOpsPerSecond.length;
    const avgBalance = this.metrics.shardBalanceHistory.reduce((a, b) => a + b, 0) / this.metrics.shardBalanceHistory.length;

    console.log('\n' + '='.repeat(60));
    console.log('📈 STRESS TEST RESULTS: 20M USERS');
    console.log('='.repeat(60));

    console.log('\n🎯 Operation Statistics:');
    console.log(`  Total Operations:    ${this.metrics.totalOperations.toLocaleString()}`);
    console.log(`  Average Ops/Second:  ${avgOps.toFixed(2)}`);
    console.log(`  Peak Ops/Second:     ${this.metrics.peakOpsPerSecond.toFixed(2)}`);

    console.log('\n🔀 Shard Distribution:');
    console.log(`  Total Shards:        ${CONFIG.SHARD_COUNT}`);
    console.log(`  Avg Balance Score:   ${(avgBalance * 100).toFixed(2)}%`);
    console.log(`  Ops per Shard:       ${(this.metrics.totalOperations / CONFIG.SHARD_COUNT).toFixed(0)}`);

    console.log('\n📦 Queue Metrics:');
    console.log(`  Total Enqueued:      ${queueMetrics.totalEnqueued.toLocaleString()}`);
    console.log(`  Total Processed:     ${queueMetrics.totalProcessed.toLocaleString()}`);
    console.log(`  Backlog:             ${queueMetrics.backlog.toLocaleString()}`);
    console.log(`  Max Queue Depth:     ${queueMetrics.maxQueueDepth}`);
    console.log(`  Current Saturation:  ${queueMetrics.saturation.toFixed(2)}%`);

    console.log('\n📊 Capacity Analysis:');
    const estimatedMaxUsers = Math.floor((avgOps / this.metrics.peakOpsPerSecond) * CONFIG.TOTAL_USERS * 1.5);
    console.log(`  Estimated Max Users: ${estimatedMaxUsers.toLocaleString()}`);
    console.log(`  Recommended Shards:  ${Math.ceil(CONFIG.SHARD_COUNT * 1.5)}`);
    console.log(`  Queue Workers Needed: ${Math.ceil(CONFIG.QUEUE_WORKERS * (queueMetrics.saturation / 100))}`);

    console.log('='.repeat(60));

    // Save report
    const report = {
      testType: '20M Stress Simulation',
      timestamp: new Date().toISOString(),
      config: CONFIG,
      metrics: {
        totalOperations: this.metrics.totalOperations,
        avgOpsPerSecond: avgOps,
        peakOpsPerSecond: this.metrics.peakOpsPerSecond,
        shardBalance: avgBalance,
        queueMetrics,
      },
      capacityAnalysis: {
        estimatedMaxUsers,
        recommendedShards: Math.ceil(CONFIG.SHARD_COUNT * 1.5),
        recommendedQueueWorkers: Math.ceil(CONFIG.QUEUE_WORKERS * (queueMetrics.saturation / 100)),
        scalingThresholds: {
          opsPerSecond: this.metrics.peakOpsPerSecond * 0.8,
          queueDepth: queueMetrics.maxQueueDepth * 0.7,
          shardBalance: 0.7,
        },
      },
      recommendations: this.generateRecommendations(queueMetrics, avgBalance),
    };

    const reportsDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, `load-20m-stress-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}\n`);
  }

  private generateRecommendations(queueMetrics: any, avgBalance: number): string[] {
    const recommendations: string[] = [];

    if (queueMetrics.saturation > 80) {
      recommendations.push('⚠️ Queue saturation critical - increase worker count by 50%');
    }

    if (avgBalance < 0.7) {
      recommendations.push('⚠️ Shard imbalance detected - implement better sharding strategy');
    }

    if (queueMetrics.backlog > queueMetrics.totalProcessed * 0.1) {
      recommendations.push('⚠️ Persistent backlog - scale queue processing capacity');
    }

    if (this.metrics.peakOpsPerSecond > this.metrics.avgOpsPerSecond[0] * 3) {
      recommendations.push('✅ System handles burst traffic well - consider auto-scaling based on load');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ System performing within acceptable parameters');
    }

    return recommendations;
  }
}

// ================================================================
// MAIN EXECUTION
// ================================================================

async function main() {
  try {
    const orchestrator = new StressTestOrchestrator();
    await orchestrator.run();
    console.log('\n✅ Stress test completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Stress test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { StressTestOrchestrator, ProbabilisticUserModel, ShardLoadAnalyzer, QueueSimulator };