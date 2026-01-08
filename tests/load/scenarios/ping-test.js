/**
 * Load Test: Ping Endpoint
 * 
 * Simulates 1,000 concurrent users hitting the /ping health check endpoint
 * to validate basic infrastructure performance and cold start behavior.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const coldStartRate = new Rate('cold_starts');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');

// Test configuration
export const options = {
  // Ramp up to 1000 VUs over 30s, sustain for 2min, then ramp down
  stages: [
    { duration: '30s', target: 1000 },  // Ramp up to 1000 VUs
    { duration: '2m', target: 1000 },   // Stay at 1000 VUs for 2 minutes
    { duration: '30s', target: 0 },     // Ramp down to 0 VUs
  ],
  
  // Success thresholds
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1s
    'http_req_failed': ['rate<0.01'],                   // Less than 1% failures
    'http_reqs': ['rate>100'],                          // At least 100 req/s
    'cold_starts': ['rate<0.05'],                       // Less than 5% cold starts
  },
  
  // Other options
  noConnectionReuse: false,
  userAgent: 'Avalo-LoadTest/1.0 (k6)',
};

// Get base URL from environment or use default
const BASE_URL = __ENV.FIREBASE_FUNCTIONS_URL || 'https://europe-west3-avalo-app.cloudfunctions.net';

export default function () {
  const startTime = Date.now();
  
  const response = http.get(`${BASE_URL}/ping`, {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  });
  
  const duration = Date.now() - startTime;
  
  // Check response
  const checkResult = check(response, {
    'status is 200': (r) => r.status === 200,
    'has ok field': (r) => JSON.parse(r.body).ok === true,
    'has timestamp': (r) => JSON.parse(r.body).timestamp !== undefined,
    'has version': (r) => JSON.parse(r.body).version === '3.0.0',
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  // Detect cold starts (response time > 3s typically indicates cold start)
  const isColdStart = response.timings.duration > 3000;
  coldStartRate.add(isColdStart);
  
  // Record metrics
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  // Log slow requests
  if (response.timings.duration > 1000) {
    console.log(`Slow request: ${response.timings.duration}ms, VU: ${__VU}, Iter: ${__ITER}`);
  }
  
  // Log cold starts
  if (isColdStart) {
    console.log(`Cold start detected: ${response.timings.duration}ms, VU: ${__VU}, Iter: ${__ITER}`);
  }
  
  // Small delay to prevent overwhelming the server
  sleep(0.1);
}

// Setup function - runs once before test
export function setup() {
  console.log('Starting Ping Load Test');
  console.log(`Target: ${BASE_URL}/ping`);
  console.log('Target VUs: 1000');
  console.log('Duration: 3 minutes');
  
  // Warm up - make a few requests to initialize the function
  for (let i = 0; i < 5; i++) {
    http.get(`${BASE_URL}/ping`);
    sleep(1);
  }
  
  return { startTime: Date.now() };
}

// Teardown function - runs once after test
export function teardown(data) {
  const totalDuration = (Date.now() - data.startTime) / 1000;
  console.log(`Ping Load Test completed in ${totalDuration}s`);
}