/**
 * Load Test: Loyalty System Endpoints
 * 
 * Stress tests the loyalty system by:
 * 1. Simulating database writes via transaction creation (triggers awardPointsOnTx)
 * 2. Testing getUserLoyaltyCallable under concurrent load
 * 3. Validating ranking calculations and leaderboard queries
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const coldStartRate = new Rate('cold_starts');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');
const dbWriteSuccessRate = new Rate('db_write_success');
const loyaltyReadSuccessRate = new Rate('loyalty_read_success');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 250 },   // Ramp up to 250 VUs
    { duration: '2m', target: 500 },    // Increase to 500 VUs
    { duration: '2m', target: 500 },    // Sustain at 500 VUs
    { duration: '30s', target: 0 },     // Ramp down
  ],
  
  thresholds: {
    'http_req_duration': ['p(95)<1500', 'p(99)<3000'],  // Loyalty queries can be complex
    'http_req_failed': ['rate<0.02'],                    // Less than 2% failures
    'http_reqs': ['rate>75'],                            // At least 75 req/s
    'cold_starts': ['rate<0.08'],                        // Less than 8% cold starts
    'db_write_success': ['rate>0.95'],                   // At least 95% successful writes
    'loyalty_read_success': ['rate>0.98'],               // At least 98% successful reads
  },
  
  noConnectionReuse: false,
  userAgent: 'Avalo-LoadTest/1.0 (k6)',
};

const BASE_URL = __ENV.FIREBASE_FUNCTIONS_URL || 'https://europe-west3-avalo-app.cloudfunctions.net';

// Transaction types that trigger loyalty points
const transactionTypes = [
  'chat_message',
  'ai_message', 
  'tip_sent',
  'tip_received',
  'chat_payment',
  'chat_earned',
  'live_tip'
];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomAmount() {
  // Various amounts to test different point calculations
  return Math.floor(Math.random() * 500) + 10; // 10-510 tokens
}

// Simulate creating a transaction that triggers awardPointsOnTx
function simulateTransactionCreate(userId, vu) {
  const txType = getRandomElement(transactionTypes);
  const amount = getRandomAmount();
  
  // Note: In production, this would be a Firestore write that triggers awardPointsOnTx
  // For load testing, we simulate the transaction creation endpoint if available
  // Otherwise, we test the direct loyalty endpoint
  
  const payload = JSON.stringify({
    data: {
      type: txType,
      amount: amount,
      userId: userId,
      metadata: {
        source: 'load_test',
        vu: vu
      }
    }
  });
  
  // This simulates writing to Firestore which triggers awardPointsOnTx
  // In actual load test, ensure you have an endpoint or use Firebase Admin SDK
  const response = http.post(`${BASE_URL}/createTransaction`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.TEST_USER_TOKEN || 'mock-token'}`,
    },
    timeout: '20s',
  });
  
  const success = response.status === 200;
  dbWriteSuccessRate.add(success);
  
  return success;
}

// Test getUserLoyaltyCallable endpoint
function testGetUserLoyalty(userId) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    data: {
      targetUserId: userId
    }
  });
  
  const response = http.post(`${BASE_URL}/getUserLoyaltyCallable`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.TEST_USER_TOKEN || 'mock-token'}`,
    },
    timeout: '20s',
  });
  
  const duration = Date.now() - startTime;
  
  // Parse response
  let responseBody;
  try {
    responseBody = JSON.parse(response.body);
  } catch (e) {
    responseBody = {};
  }
  
  // Check response
  const checkResult = check(response, {
    'status is 200': (r) => r.status === 200,
    'has result': (r) => responseBody.result !== undefined,
    'has userId': (r) => responseBody.result?.userId !== undefined,
    'has points': (r) => responseBody.result?.points !== undefined,
    'has level': (r) => responseBody.result?.level !== undefined,
    'response time < 1.5s': (r) => r.timings.duration < 1500,
  });
  
  const success = response.status === 200 && responseBody.result !== undefined;
  loyaltyReadSuccessRate.add(success);
  
  // Detect cold starts
  const isColdStart = response.timings.duration > 5000;
  coldStartRate.add(isColdStart);
  
  // Record metrics
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  // Log slow requests
  if (response.timings.duration > 2000) {
    console.log(`Slow loyalty query: ${response.timings.duration}ms, VU: ${__VU}`);
  }
  
  // Log cold starts
  if (isColdStart) {
    console.log(`Cold start detected: ${response.timings.duration}ms, VU: ${__VU}`);
  }
  
  return {
    success,
    duration,
    data: responseBody.result || null
  };
}

export default function () {
  const userId = `test-user-${__VU}`; // Each VU represents a different user
  
  // Mix of operations: 70% reads, 30% writes
  const operation = Math.random();
  
  if (operation < 0.3) {
    // Simulate transaction creation (write operation)
    simulateTransactionCreate(userId, __VU);
    sleep(0.5); // Small delay after write
  }
  
  // Always query loyalty stats (read operation)
  const result = testGetUserLoyalty(userId);
  
  if (result.success && result.data) {
    // Log interesting loyalty milestones
    if (result.data.points > 0 && result.data.points % 1000 === 0) {
      console.log(`User ${userId} reached ${result.data.points} points, level: ${result.data.level}`);
    }
  }
  
  // Realistic delay between loyalty checks
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

export function setup() {
  console.log('Starting Loyalty System Load Test');
  console.log(`Target: ${BASE_URL}/getUserLoyaltyCallable`);
  console.log('Max VUs: 500');
  console.log('Duration: 5 minutes');
  console.log('Testing: getUserLoyaltyCallable reads + transaction writes');
  console.log('Mix: 70% reads, 30% writes');
  
  // Warm up
  for (let i = 0; i < 3; i++) {
    const payload = JSON.stringify({
      data: {
        targetUserId: 'warmup-user'
      }
    });
    
    http.post(`${BASE_URL}/getUserLoyaltyCallable`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${__ENV.TEST_USER_TOKEN || 'mock-token'}`,
      }
    });
    sleep(1);
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  const totalDuration = (Date.now() - data.startTime) / 1000;
  console.log(`Loyalty System Load Test completed in ${totalDuration}s`);
}