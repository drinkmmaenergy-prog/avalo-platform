/**
 * ==================================================================
 * AVALO 100K USER LOAD TEST SIMULATOR
 * ==================================================================
 * 
 * Simulates 100,000 concurrent users performing realistic operations
 * against live Firebase infrastructure
 * 
 * Operations:
 * - User authentication
 * - Profile browsing
 * - Feed scrolling and interactions
 * - Chat messaging
 * - Payments and transactions
 * - AI companion usage
 * - Real-time presence
 * 
 * Metrics:
 * - P50/P95/P99 latency
 * - Error rates
 * - Throughput (ops/sec)
 * - Resource utilization
 * - Cost projection
 * 
 * @version 4.0.0
 * @warning This will generate significant costs - use staging only!
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// =================================================================
// CONFIGURATION
// =================================================================

interface LoadTestConfig {
  // Target load
  totalUsers: number;
  rampUpTime: number; // seconds
  testDuration: number; // seconds
  
  // Firebase config
  firebaseConfig: any;
  region: string;
  
  // Operation weights (must sum to 1.0)
  operations: {
    feedScroll: number;
    profileView: number;
    likePost: number;
    sendMessage: number;
    aiInteraction: number;
    transaction: number;
  };
  
  // Performance targets
  targets: {
    maxLatencyP95: number; // ms
    maxErrorRate: number; // percentage
    minThroughput: number; // ops/sec
  };
}

const DEFAULT_CONFIG: LoadTestConfig = {
  totalUsers: 100000,
  rampUpTime: 600, // 10 minutes
  testDuration: 1800, // 30 minutes
  
  firebaseConfig: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  },
  
  region: 'europe-west3',
  
  operations: {
    feedScroll: 0.40, // 40% of operations
    profileView: 0.20, // 20%
    likePost: 0.15, // 15%
    sendMessage: 0.15, // 15%
    aiInteraction: 0.05, // 5%
    transaction: 0.05, // 5%
  },
  
  targets: {
    maxLatencyP95: 500, // 500ms
    maxErrorRate: 0.1, // 0.1%
    minThroughput: 10000, // 10K ops/sec
  },
};

// =================================================================
// METRICS COLLECTION
// =================================================================

interface Metrics {
  operations: {
    total: number;
    successful: number;
    failed: number;
  };
  latency: {
    samples: number[];
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    current: number;
    peak: number;
    average: number;
  };
  errors: Map<string, number>;
  startTime: number;
  endTime?: number;
}

class MetricsCollector {
  private metrics: Metrics;
  private intervalId?: NodeJS.Timeout;
  
  constructor() {
    this.metrics = {
      operations: { total: 0, successful: 0, failed: 0 },
      latency: { samples: [], p50: 0, p95: 0, p99: 0, avg: 0 },
      throughput: { current: 0, peak: 0, average: 0 },
      errors: new Map(),
      startTime: Date.now(),
    };
  }
  
  recordOperation(success: boolean, latency: number, error?: string): void {
    this.metrics.operations.total++;
    
    if (success) {
      this.metrics.operations.successful++;
      this.metrics.latency.samples.push(latency);
    } else {
      this.metrics.operations.failed++;
      if (error) {
        this.metrics.errors.set(error, (this.metrics.errors.get(error) || 0) + 1);
      }
    }
  }
  
  startThroughputMonitoring(): void {
    let lastCount = 0;
    
    this.intervalId = setInterval(() => {
      const currentCount = this.metrics.operations.successful;
      const throughput = (currentCount - lastCount);
      
      this.metrics.throughput.current = throughput;
      if (throughput > this.metrics.throughput.peak) {
        this.metrics.throughput.peak = throughput;
      }
      
      lastCount = currentCount;
    }, 1000);
  }
  
  stopThroughputMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  
  calculateFinalMetrics(): Metrics {
    this.metrics.endTime = Date.now();
    
    // Calculate latency percentiles
    const sorted = this.metrics.latency.samples.sort((a, b) => a - b);
    const len = sorted.length;
    
    if (len > 0) {
      this.metrics.latency.p50 = sorted[Math.floor(len * 0.50)];
      this.metrics.latency.p95 = sorted[Math.floor(len * 0.95)];
      this.metrics.latency.p99 = sorted[Math.floor(len * 0.99)];
      this.metrics.latency.avg = sorted.reduce((a, b) => a + b, 0) / len;
    }
    
    // Calculate average throughput
    const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
    this.metrics.throughput.average = this.metrics.operations.successful / duration;
    
    return this.metrics;
  }
  
  getMetrics(): Metrics {
    return this.metrics;
  }
}

// =================================================================
// VIRTUAL USER
// =================================================================

class VirtualUser {
  private userId: string;
  private auth: any;
  private db: any;
  private functions: any;
  private isActive: boolean;
  
  constructor(userId: string, app: any) {
    this.userId = userId;
    this.auth = getAuth(app);
    this.db = getFirestore(app);
    this.functions = getFunctions(app);
    this.isActive = false;
  }
  
  async initialize(): Promise<void> {
    await signInAnonymously(this.auth);
    this.isActive = true;
  }
  
  async performOperation(
    operation: string,
    metricsCollector: MetricsCollector
  ): Promise<void> {
    if (!this.isActive) return;
    
    const startTime = Date.now();
    
    try {
      switch (operation) {
        case 'feedScroll':
          await this.scrollFeed();
          break;
        case 'profileView':
          await this.viewProfile();
          break;
        case 'likePost':
          await this.likePost();
          break;
        case 'sendMessage':
          await this.sendMessage();
          break;
        case 'aiInteraction':
          await this.interactWithAI();
          break;
        case 'transaction':
          await this.performTransaction();
          break;
      }
      
      const latency = Date.now() - startTime;
      metricsCollector.recordOperation(true, latency);
    } catch (error) {
      const latency = Date.now() - startTime;
      metricsCollector.recordOperation(false, latency, (error as Error).message);
    }
  }
  
  private async scrollFeed(): Promise<void> {
    const feedRef = collection(this.db, 'feedPosts');
    const q = query(feedRef);
    await getDocs(q);
  }
  
  private async viewProfile(): Promise<void> {
    const randomUserId = `user_${Math.floor(Math.random() * 10000)}`;
    const userRef = doc(this.db, 'users', randomUserId);
    await getDocs(query(collection(userRef, 'posts')));
  }
  
  private async likePost(): Promise<void> {
    const likePost = httpsCallable(this.functions, 'likePostV1');
    await likePost({ postId: `post_${Math.floor(Math.random() * 100000)}` });
  }
  
  private async sendMessage(): Promise<void> {
    const sendMessage = httpsCallable(this.functions, 'sendMessageV1');
    await sendMessage({
      chatId: `chat_${Math.floor(Math.random() * 10000)}`,
      text: 'Test message',
    });
  }
  
  private async interactWithAI(): Promise<void> {
    const aiChat = httpsCallable(this.functions, 'aiChatV1');
    await aiChat({
      botId: `bot_${Math.floor(Math.random() * 10)}`,
      message: 'Hello',
    });
  }
  
  private async performTransaction(): Promise<void> {
    const purchaseTokens = httpsCallable(this.functions, 'purchaseTokensV2');
    await purchaseTokens({
      amount: 100,
      currency: 'usd',
    });
  }
  
  async cleanup(): Promise<void> {
    this.isActive = false;
    if (this.auth.currentUser) {
      await this.auth.currentUser.delete();
    }
  }
}

// =================================================================
// LOAD TEST CONTROLLER
// =================================================================

class LoadTestController {
  private config: LoadTestConfig;
  private users: VirtualUser[];
  private metricsCollector: MetricsCollector;
  private app: any;
  
  constructor(config: LoadTestConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.users = [];
    this.metricsCollector = new MetricsCollector();
    this.app = initializeApp(config.firebaseConfig);
  }
  
  async run(): Promise<Metrics> {
    console.log(`🚀 Starting load test with ${this.config.totalUsers} users`);
    console.log(`📊 Ramp-up: ${this.config.rampUpTime}s, Duration: ${this.config.testDuration}s`);
    
    // Start monitoring
    this.metricsCollector.startThroughputMonitoring();
    
    // Ramp up users
    await this.rampUpUsers();
    
    // Run test
    await this.runTest();
    
    // Ramp down
    await this.rampDownUsers();
    
    // Stop monitoring
    this.metricsCollector.stopThroughputMonitoring();
    
    // Calculate final metrics
    const metrics = this.metricsCollector.calculateFinalMetrics();
    
    // Print results
    this.printResults(metrics);
    
    return metrics;
  }
  
  private async rampUpUsers(): Promise<void> {
    console.log('📈 Ramping up users...');
    
    const usersPerSecond = this.config.totalUsers / this.config.rampUpTime;
    const batchSize = Math.ceil(usersPerSecond);
    
    for (let i = 0; i < this.config.totalUsers; i += batchSize) {
      const batch = Math.min(batchSize, this.config.totalUsers - i);
      
      const promises = [];
      for (let j = 0; j < batch; j++) {
        const user = new VirtualUser(`load_test_user_${i + j}`, this.app);
        this.users.push(user);
        promises.push(user.initialize());
      }
      
      await Promise.all(promises);
      
      if (i % 1000 === 0) {
        console.log(`  ✓ ${i} users initialized`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ All ${this.config.totalUsers} users initialized`);
  }
  
  private async runTest(): Promise<void> {
    console.log('🔄 Running load test...');
    
    const endTime = Date.now() + (this.config.testDuration * 1000);
    
    while (Date.now() < endTime) {
      // Select random operation based on weights
      const operation = this.selectOperation();
      
      // Select random user
      const user = this.users[Math.floor(Math.random() * this.users.length)];
      
      // Perform operation (non-blocking)
      user.performOperation(operation, this.metricsCollector).catch(() => {});
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Print progress every 10 seconds
      if (Date.now() % 10000 < 50) {
        const metrics = this.metricsCollector.getMetrics();
        console.log(`  📊 Ops: ${metrics.operations.total}, Throughput: ${metrics.throughput.current}/s`);
      }
    }
    
    console.log('✅ Load test completed');
  }
  
  private selectOperation(): string {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [op, weight] of Object.entries(this.config.operations)) {
      cumulative += weight;
      if (rand <= cumulative) {
        return op;
      }
    }
    
    return 'feedScroll';
  }
  
  private async rampDownUsers(): Promise<void> {
    console.log('📉 Cleaning up users...');
    
    const batchSize = 100;
    for (let i = 0; i < this.users.length; i += batchSize) {
      const batch = this.users.slice(i, i + batchSize);
      await Promise.all(batch.map(user => user.cleanup()));
      
      if (i % 1000 === 0) {
        console.log(`  ✓ ${i} users cleaned up`);
      }
    }
    
    console.log('✅ All users cleaned up');
  }
  
  private printResults(metrics: Metrics): void {
    const duration = ((metrics.endTime || Date.now()) - metrics.startTime) / 1000;
    const errorRate = (metrics.operations.failed / metrics.operations.total) * 100;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Total Operations: ${metrics.operations.total}`);
    console.log(`Successful: ${metrics.operations.successful}`);
    console.log(`Failed: ${metrics.operations.failed}`);
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
    console.log(`\nLatency (ms):`);
    console.log(`  P50: ${metrics.latency.p50.toFixed(2)}`);
    console.log(`  P95: ${metrics.latency.p95.toFixed(2)}`);
    console.log(`  P99: ${metrics.latency.p99.toFixed(2)}`);
    console.log(`  Avg: ${metrics.latency.avg.toFixed(2)}`);
    console.log(`\nThroughput (ops/s):`);
    console.log(`  Peak: ${metrics.throughput.peak}`);
    console.log(`  Average: ${metrics.throughput.average.toFixed(2)}`);
    
    // Print top errors
    if (metrics.errors.size > 0) {
      console.log(`\nTop Errors:`);
      const sortedErrors = Array.from(metrics.errors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      sortedErrors.forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
    }
    
    // Check against targets
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎯 TARGET VALIDATION');
    console.log('='.repeat(60));
    
    const p95Pass = metrics.latency.p95 <= this.config.targets.maxLatencyP95;
    const errorPass = errorRate <= this.config.targets.maxErrorRate;
    const throughputPass = metrics.throughput.average >= this.config.targets.minThroughput;
    
    console.log(`P95 Latency: ${p95Pass ? '✅' : '❌'} ${metrics.latency.p95.toFixed(2)}ms (target: ${this.config.targets.maxLatencyP95}ms)`);
    console.log(`Error Rate: ${errorPass ? '✅' : '❌'} ${errorRate.toFixed(2)}% (target: ${this.config.targets.maxErrorRate}%)`);
    console.log(`Throughput: ${throughputPass ? '✅' : '❌'} ${metrics.throughput.average.toFixed(2)} ops/s (target: ${this.config.targets.minThroughput})`);
    
    const allPass = p95Pass && errorPass && throughputPass;
    console.log(`\n${allPass ? '✅ ALL TARGETS MET' : '❌ SOME TARGETS FAILED'}`);
    console.log('='.repeat(60) + '\n');
  }
}

// =================================================================
// EXECUTION
// =================================================================

if (require.main === module) {
  const controller = new LoadTestController();
  
  controller.run()
    .then(() => {
      console.log('Load test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Load test failed:', error);
      process.exit(1);
    });
}

export { LoadTestController };
export type { LoadTestConfig, Metrics };