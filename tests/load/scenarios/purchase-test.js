/**
 * Load Test: Purchase Tokens V2 Endpoint
 * 
 * Simulates 1,000 concurrent users purchasing tokens through the purchaseTokensV2 endpoint.
 * Tests payment processing, AML checks, database writes, and transaction handling under load.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const coldStartRate = new Rate('cold_starts');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');
const amlReviewRate = new Rate('aml_reviews');
const transactionSuccessRate = new Rate('transaction_success');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 500 },   // Ramp up to 500 VUs (payment processing is heavier)
    { duration: '2m', target: 1000 },   // Increase to 1000 VUs
    { duration: '2m', target: 1000 },   // Sustain at 1000 VUs
    { duration: '30s', target: 0 },     // Ramp down
  ],
  
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],  // Payment processing can be slower
    'http_req_failed': ['rate<0.05'],                    // Allow up to 5% failures (AML blocks, etc)
    'http_reqs': ['rate>50'],                            // At least 50 req/s
    'cold_starts': ['rate<0.1'],                         // Less than 10% cold starts
    'transaction_success': ['rate>0.90'],                // At least 90% successful transactions
  },
  
  noConnectionReuse: false,
  userAgent: 'Avalo-LoadTest/1.0 (k6)',
};

const BASE_URL = __ENV.FIREBASE_FUNCTIONS_URL || 'https://europe-west3-avalo-app.cloudfunctions.net';

// Test data - various currencies and amounts to simulate real usage
const currencies = ['USD', 'EUR', 'GBP', 'PLN'];
const amounts = [10, 25, 50, 100, 250, 500];
const paymentMethods = ['card', 'crypto', 'bank_transfer'];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const startTime = Date.now();
  
  // Generate test data
  const currency = getRandomElement(currencies);
  const amount = getRandomElement(amounts);
  const paymentMethod = getRandomElement(paymentMethods);
  
  const payload = JSON.stringify({
    data: {
      amount: amount,
      currency: currency,
      paymentMethod: paymentMethod,
      deviceId: `test-device-${__VU}`
    }
  });
  
  // Mock authentication token (in production, use real Firebase tokens)
  const authToken = __ENV.TEST_USER_TOKEN || 'mock-token-for-testing';
  
  const response = http.post(`${BASE_URL}/purchaseTokensV2`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    timeout: '30s',
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
    'status is 200 or acceptable error': (r) => r.status === 200 || r.status === 400 || r.status === 403,
    'has result': (r) => responseBody.result !== undefined,
    'response time < 2s': (r) => r.timings.duration < 2000,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
  
  // Track transaction outcomes
  if (response.status === 200 && responseBody.result) {
    const result = responseBody.result;
    
    if (result.success === true) {
      transactionSuccessRate.add(true);
    } else if (result.status === 'under_review') {
      transactionSuccessRate.add(false);
      amlReviewRate.add(true);
      console.log(`Transaction under AML review: VU ${__VU}, Amount: ${amount} ${currency}`);
    } else {
      transactionSuccessRate.add(false);
    }
  } else {
    transactionSuccessRate.add(false);
  }
  
  // Detect cold starts
  const isColdStart = response.timings.duration > 5000;
  coldStartRate.add(isColdStart);
  
  // Record metrics
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  // Log slow requests
  if (response.timings.duration > 3000) {
    console.log(`Slow purchase: ${response.timings.duration}ms, Amount: ${amount} ${currency}, VU: ${__VU}`);
  }
  
  // Log cold starts
  if (isColdStart) {
    console.log(`Cold start detected: ${response.timings.duration}ms, VU: ${__VU}`);
  }
  
  // Realistic delay between purchases (users don't spam purchases)
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function setup() {
  console.log('Starting Purchase Token Load Test');
  console.log(`Target: ${BASE_URL}/purchaseTokensV2`);
  console.log('Max VUs: 1000');
  console.log('Duration: 5 minutes');
  console.log('Testing currencies: USD, EUR, GBP, PLN');
  console.log('Testing payment methods: card, crypto, bank_transfer');
  
  // Warm up
  for (let i = 0; i < 3; i++) {
    const payload = JSON.stringify({
      data: {
        amount: 10,
        currency: 'USD',
        paymentMethod: 'card',
        deviceId: 'warmup-device'
      }
    });
    
    http.post(`${BASE_URL}/purchaseTokensV2`, payload, {
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
  console.log(`Purchase Token Load Test completed in ${totalDuration}s`);
}