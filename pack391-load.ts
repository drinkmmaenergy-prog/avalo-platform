/**
 * PACK 391 — Load & Stress Testing Engine
 * 
 * Comprehensive load testing for validating system performance under extreme conditions.
 * Tests: swipes, paid chats, payouts, calls, events, AI companions
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Load Testing Scenarios
interface LoadTestScenario {
  scenarioId: string;
  name: string;
  description: string;
  targetRPS: number; // requests per second
  duration: number; // seconds
  concurrentUsers: number;
  testType: "stress" | "load" | "spike" | "endurance" | "scalability";
}

interface LoadTestResult {
  scenarioId: string;
  startTime: FirebaseFirestore.Timestamp;
  endTime?: FirebaseFirestore.Timestamp;
  status: "running" | "completed" | "failed";
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    maxLatency: number;
    requestsPerSecond: number;
    errorRate: number;
  };
  errors: Array<{
    type: string;
    count: number;
    message: string;
  }>;
  crashPoints?: Array<{
    timestamp: FirebaseFirestore.Timestamp;
    service: string;
    reason: string;
  }>;
}

// Predefined Test Scenarios
const TEST_SCENARIOS: Record<string, LoadTestScenario> = {
  SWIPE_LOAD: {
    scenarioId: "swipe_load",
    name: "100K Concurrent Swipes",
    description: "Test matching engine under heavy swipe load",
    targetRPS: 1666, // 100k users over 60 seconds
    duration: 300,
    concurrentUsers: 100000,
    testType: "load"
  },
  CHAT_MONETIZATION: {
    scenarioId: "chat_monetization",
    name: "25K Active Paid Chats",
    description: "Test chat monetization with token streaming",
    targetRPS: 416, // 25k users
    duration: 600,
    concurrentUsers: 25000,
    testType: "load"
  },
  PAYOUT_SURGE: {
    scenarioId: "payout_surge",
    name: "5K Simultaneous Payouts",
    description: "Test payment processing under surge",
    targetRPS: 83, // 5k payouts
    duration: 180,
    concurrentUsers: 5000,
    testType: "stress"
  },
  LIVE_CALLS: {
    scenarioId: "live_calls",
    name: "2K Live Voice/Video Calls",
    description: "Test WebRTC infrastructure",
    targetRPS: 33, // 2k concurrent calls
    duration: 900,
    concurrentUsers: 2000,
    testType: "endurance"
  },
  EVENT_TICKETS: {
    scenarioId: "event_tickets",
    name: "10K Event Purchases/Min",
    description: "Test ticketing system spike load",
    targetRPS: 166, // 10k per minute
    duration: 120,
    concurrentUsers: 10000,
    testType: "spike"
  },
  AI_COMPANIONS: {
    scenarioId: "ai_companions",
    name: "50K AI Messages/Min",
    description: "Test AI companion service scalability",
    targetRPS: 833, // 50k per minute
    duration: 600,
    concurrentUsers: 50000,
    testType: "scalability"
  }
};

/**
 * Run load test scenario
 */
export const pack391_runLoadTest = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "4GB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required for load testing"
      );
    }
    
    const { scenarioId, customConfig } = data;
    
    if (!scenarioId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "scenarioId required"
      );
    }
    
    try {
      // Get scenario configuration
      const scenario = customConfig || TEST_SCENARIOS[scenarioId];
      
      if (!scenario) {
        throw new functions.https.HttpsError(
          "not-found",
          `Load test scenario '${scenarioId}' not found`
        );
      }
      
      console.log(`🚀 Starting load test: ${scenario.name}`);
      
      // Create test result document
      const testResultRef = await db.collection("system").doc("loadTests").collection("results").add({
        scenarioId: scenario.scenarioId,
        name: scenario.name,
        status: "running",
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        initiatedBy: context.auth.uid,
        config: scenario,
        metrics: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageLatency: 0,
          p95Latency: 0,
          p99Latency: 0,
          maxLatency: 0,
          requestsPerSecond: 0,
          errorRate: 0
        },
        errors: []
      });
      
      // Trigger async load test execution
      await triggerLoadTestExecution(testResultRef.id, scenario);
      
      return {
        success: true,
        testId: testResultRef.id,
        scenario: scenario.name,
        estimatedDuration: scenario.duration
      };
    } catch (error) {
      console.error("Load test initialization error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Load test failed to start"
      );
    }
  });

/**
 * Trigger async load test execution
 */
async function triggerLoadTestExecution(
  testId: string,
  scenario: LoadTestScenario
): Promise<void> {
  // Publish to load test execution queue
  await db.collection("queues").doc("loadTests").collection("tasks").add({
    testId,
    scenario,
    status: "queued",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Execute load test (worker function)
 */
export const pack391_executeLoadTest = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "8GB"
  })
  .firestore.document("queues/loadTests/tasks/{taskId}")
  .onCreate(async (snap, context) => {
    const task = snap.data();
    const { testId, scenario } = task;
    
    try {
      console.log(`🔄 Executing load test: ${testId}`);
      
      // Update status
      await snap.ref.update({ status: "executing" });
      
      // Execute test based on scenario
      const results = await executeScenario(scenario);
      
      // Update test results
      await db
        .collection("system")
        .doc("loadTests")
        .collection("results")
        .doc(testId)
        .update({
          status: "completed",
          endTime: admin.firestore.FieldValue.serverTimestamp(),
          metrics: results.metrics,
          errors: results.errors,
          crashPoints: results.crashPoints || []
        });
      
      // Generate reports
      await generateLoadTestReports(testId, results);
      
      // Cleanup task
      await snap.ref.delete();
      
      console.log(`✅ Load test completed: ${testId}`);
    } catch (error) {
      console.error(`❌ Load test execution error (${testId}):`, error);
      
      // Update test status
      await db
        .collection("system")
        .doc("loadTests")
        .collection("results")
        .doc(testId)
        .update({
          status: "failed",
          endTime: admin.firestore.FieldValue.serverTimestamp(),
          error: error instanceof Error ? error.message : String(error)
        });
      
      // Cleanup task
      await snap.ref.delete();
    }
  });

/**
 * Execute specific test scenario
 */
async function executeScenario(
  scenario: LoadTestScenario
): Promise<LoadTestResult> {
  const startTime = Date.now();
  const latencies: number[] = [];
  const errors: Map<string, { count: number; message: string }> = new Map();
  let successCount = 0;
  let failureCount = 0;
  
  console.log(`📊 Executing ${scenario.name} - ${scenario.concurrentUsers} users, ${scenario.duration}s`);
  
  // Simulate load based on scenario type
  const requestCount = scenario.targetRPS * scenario.duration;
  const batchSize = Math.min(100, scenario.targetRPS); // Process in batches
  const batches = Math.ceil(requestCount / batchSize);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchStartTime = Date.now();
    const currentBatchSize = Math.min(batchSize, requestCount - (batch * batchSize));
    
    // Execute batch of requests
    const batchPromises: Promise<{ success: boolean; latency: number; error?: string }>[] = [];
    
    for (let i = 0; i < currentBatchSize; i++) {
      batchPromises.push(executeTestRequest(scenario));
    }
    
    // Wait for batch completion
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Process results
    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
        latencies.push(result.value.latency);
      } else {
        failureCount++;
        const errorMsg = result.status === "fulfilled" 
          ? result.value.error || "Unknown error"
          : "Promise rejected";
        
        const errorKey = errorMsg.substring(0, 100);
        const existing = errors.get(errorKey);
        
        if (existing) {
          existing.count++;
        } else {
          errors.set(errorKey, { count: 1, message: errorMsg });
        }
      }
    }
    
    // Throttle to maintain target RPS
    const batchDuration = Date.now() - batchStartTime;
    const targetBatchDuration = (batchSize / scenario.targetRPS) * 1000;
    const delay = Math.max(0, targetBatchDuration - batchDuration);
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Log progress every 10 batches
    if (batch % 10 === 0) {
      console.log(`Progress: ${Math.round((batch / batches) * 100)}% - Success: ${successCount}, Failed: ${failureCount}`);
    }
  }
  
  // Calculate metrics
  const totalRequests = successCount + failureCount;
  const duration = (Date.now() - startTime) / 1000;
  latencies.sort((a, b) => a - b);
  
  const metrics = {
    totalRequests,
    successfulRequests: successCount,
    failedRequests: failureCount,
    averageLatency: latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0,
    p95Latency: latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.95)]
      : 0,
    p99Latency: latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.99)]
      : 0,
    maxLatency: latencies.length > 0
      ? Math.max(...latencies)
      : 0,
    requestsPerSecond: totalRequests / duration,
    errorRate: (failureCount / totalRequests) * 100
  };
  
  console.log(`📊 Test completed - RPS: ${metrics.requestsPerSecond.toFixed(2)}, Error Rate: ${metrics.errorRate.toFixed(2)}%`);
  
  return {
    scenarioId: scenario.scenarioId,
    startTime: admin.firestore.Timestamp.now(),
    endTime: admin.firestore.Timestamp.now(),
    status: "completed",
    metrics,
    errors: Array.from(errors.values())
  };
}

/**
 * Execute single test request
 */
async function executeTestRequest(
  scenario: LoadTestScenario
): Promise<{ success: boolean; latency: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Simulate different endpoints based on scenario
    switch (scenario.scenarioId) {
      case "swipe_load":
        await simulateSwipe();
        break;
      case "chat_monetization":
        await simulateChat();
        break;
      case "payout_surge":
        await simulatePayout();
        break;
      case "live_calls":
        await simulateCall();
        break;
      case "event_tickets":
        await simulateEventPurchase();
        break;
      case "ai_companions":
        await simulateAIMessage();
        break;
      default:
        await simulateGenericRequest();
    }
    
    return {
      success: true,
      latency: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Simulation functions for different scenarios
async function simulateSwipe(): Promise<void> {
  // Simulate swipe operation
  await db.collection("_loadTest_swipes").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    action: "right"
  });
}

async function simulateChat(): Promise<void> {
  // Simulate chat message
  await db.collection("_loadTest_chats").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    message: "Load test message",
    tokensCharged: 5
  });
}

async function simulatePayout(): Promise<void> {
  // Simulate payout request
  await db.collection("_loadTest_payouts").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    amount: 100
  });
}

async function simulateCall(): Promise<void> {
  // Simulate call initiation
  await db.collection("_loadTest_calls").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: "video"
  });
}

async function simulateEventPurchase(): Promise<void> {
  // Simulate event ticket purchase
  await db.collection("_loadTest_events").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ticketType: "standard"
  });
}

async function simulateAIMessage(): Promise<void> {
  // Simulate AI companion message
  await db.collection("_loadTest_ai").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    message: "AI response"
  });
}

async function simulateGenericRequest(): Promise<void> {
  // Generic load test request
  await db.collection("_loadTest_generic").add({
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Generate load test reports
 */
async function generateLoadTestReports(
  testId: string,
  results: LoadTestResult
): Promise<void> {
  // Generate latency heatmap data
  const heatmapData = {
    testId,
    p50: results.metrics.averageLatency,
    p95: results.metrics.p95Latency,
    p99: results.metrics.p99Latency,
    max: results.metrics.maxLatency,
    generatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await db
    .collection("system")
    .doc("loadTests")
    .collection("heatmaps")
    .doc(testId)
    .set(heatmapData);
  
  // Generate crash map if errors exist
  if (results.errors.length > 0) {
    await db
      .collection("system")
      .doc("loadTests")
      .collection("crashMaps")
      .doc(testId)
      .set({
        testId,
        errors: results.errors,
        totalErrors: results.metrics.failedRequests,
        errorRate: results.metrics.errorRate,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }
  
  console.log(`📄 Generated reports for test ${testId}`);
}

/**
 * Get load test results
 */
export const pack391_getLoadTestResults = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    const { testId } = data;
    
    try {
      if (testId) {
        // Get specific test result
        const testDoc = await db
          .collection("system")
          .doc("loadTests")
          .collection("results")
          .doc(testId)
          .get();
        
        if (!testDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Test not found");
        }
        
        return { result: testDoc.data() };
      } else {
        // Get all test results (recent 50)
        const testsSnapshot = await db
          .collection("system")
          .doc("loadTests")
          .collection("results")
          .orderBy("startTime", "desc")
          .limit(50)
          .get();
        
        const results = testsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        return { results };
      }
    } catch (error) {
      console.error("Get load test results error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get results"
      );
    }
  });

/**
 * Clean up load test collections
 */
export const pack391_cleanupLoadTests = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    try {
      const collections = [
        "_loadTest_swipes",
        "_loadTest_chats",
        "_loadTest_payouts",
        "_loadTest_calls",
        "_loadTest_events",
        "_loadTest_ai",
        "_loadTest_generic"
      ];
      
      let totalDeleted = 0;
      
      for (const collectionName of collections) {
        const snapshot = await db.collection(collectionName).limit(5000).get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        await batch.commit();
        totalDeleted += snapshot.size;
      }
      
      console.log(`🗑️ Cleaned up ${totalDeleted} load test documents`);
      
      return {
        success: true,
        documentsDeleted: totalDeleted
      };
    } catch (error) {
      console.error("Cleanup error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Cleanup failed"
      );
    }
  });
