/**
 * PACK 353 — Load Test: 10K Users
 * 
 * Scenario: Mixed workload simulating 10,000 active users
 * - 5k swipe actions
 * - 2k paid chat messages
 * - 500 voice calls
 * - 300 video calls
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Counter, Trend } from 'k6/metrics';

// Load test configuration
export const options = {
  stages: [
    { duration: '2m', target: 1000 },   // Ramp up to 1k users
    { duration: '3m', target: 5000 },   // Ramp up to 5k users
    { duration: '5m', target: 10000 },  // Ramp up to 10k users
    { duration: '10m', target: 10000 }, // Stay at 10k for 10 minutes
    { duration: '2m', target: 5000 },   // Ramp down to 5k
    { duration: '2m', target: 0 },      // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    'swipe_duration': ['p(95)<500'],   // Swipe operations under 500ms
    'chat_duration': ['p(95)<1000'],   // Chat operations under 1s
    'call_duration': ['p(95)<1500'],   // Call operations under 1.5s
  },
};

// Custom metrics
const swipeDuration = new Trend('swipe_duration');
const chatDuration = new Trend('chat_duration');
const callDuration = new Trend('call_duration');
const swipeErrors = new Rate('swipe_errors');
const chatErrors = new Rate('chat_errors');
const callErrors = new Rate('call_errors');

// Configuration
const BASE_URL = __ENV.API_URL || 'https://avalo-app.firebaseapp.com';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Test data
const testUsers = new SharedArray('users', function () {
  const users = [];
  for (let i = 0; i < 10000; i++) {
    users.push({
      id: `test-user-${i}`,
      token: `test-token-${i}`,
    });
  }
  return users;
});

export default function () {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${user.token}`,
    'X-API-Key': API_KEY,
  };
  
  // Determine action based on probability
  const action = Math.random();
  
  if (action < 0.50) {
    // 50% - Swipe action
    performSwipe(user, headers);
  } else if (action < 0.70) {
    // 20% - Paid chat
    performChat(user, headers);
  } else if (action < 0.75) {
    // 5% - Voice call
    performVoiceCall(user, headers);
  } else if (action < 0.78) {
    // 3% - Video call
    performVideoCall(user, headers);
  } else {
    // 22% - Browse/discovery
    performDiscovery(user, headers);
  }
  
  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}

function performSwipe(user, headers) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    userId: user.id,
    targetUserId: `target-${Math.floor(Math.random() * 10000)}`,
    action: Math.random() > 0.5 ? 'like' : 'pass',
  });
  
  const response = http.post(`${BASE_URL}/api/swipe`, payload, { headers });
  const duration = Date.now() - startTime;
  
  swipeDuration.add(duration);
  
  const success = check(response, {
    'swipe status 200': (r) => r.status === 200,
    'swipe has response': (r) => r.body.length > 0,
  });
  
  swipeErrors.add(!success);
}

function performChat(user, headers) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    userId: user.id,
    recipientId: `recipient-${Math.floor(Math.random() * 1000)}`,
    message: 'Test message',
    messageType: 'paid',
  });
  
  const response = http.post(`${BASE_URL}/api/chat/send`, payload, { headers });
  const duration = Date.now() - startTime;
  
  chatDuration.add(duration);
  
  const success = check(response, {
    'chat status 200': (r) => r.status === 200,
    'chat message sent': (r) => r.json('messageSent') === true,
  });
  
  chatErrors.add(!success);
}

function performVoiceCall(user, headers) {
  const startTime = Date.now();
  
  // Initiate call
  const payload = JSON.stringify({
    userId: user.id,
    recipientId: `recipient-${Math.floor(Math.random() * 500)}`,
    callType: 'voice',
  });
  
  const response = http.post(`${BASE_URL}/api/calls/initiate`, payload, { headers });
  const duration = Date.now() - startTime;
  
  callDuration.add(duration);
  
  const success = check(response, {
    'call initiate status 200': (r) => r.status === 200,
    'call session created': (r) => r.json('sessionId') !== undefined,
  });
  
  callErrors.add(!success);
}

function performVideoCall(user, headers) {
  const startTime = Date.now();
  
  // Initiate video call
  const payload = JSON.stringify({
    userId: user.id,
    recipientId: `recipient-${Math.floor(Math.random() * 300)}`,
    callType: 'video',
  });
  
  const response = http.post(`${BASE_URL}/api/calls/initiate`, payload, { headers });
  const duration = Date.now() - startTime;
  
  callDuration.add(duration);
  
  const success = check(response, {
    'video call status 200': (r) => r.status === 200,
    'video session created': (r) => r.json('sessionId') !== undefined,
  });
  
  callErrors.add(!success);
}

function performDiscovery(user, headers) {
  const response = http.get(`${BASE_URL}/api/discovery/feed`, { headers });
  
  check(response, {
    'discovery status 200': (r) => r.status === 200,
    'discovery has profiles': (r) => r.json('profiles').length > 0,
  });
}

export function handleSummary(data) {
  return {
    'tests/load/pack353/10k-users-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  let output = '\n';
  
  output += `${indent}======== Load Test Summary (10K Users) ========\n\n`;
  output += `${indent}Total VUs: ${data.metrics.vus.values.max}\n`;
  output += `${indent}Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  output += `${indent}Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  output += `${indent}Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n\n`;
  
  output += `${indent}Response Times:\n`;
  output += `${indent}  p50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
  output += `${indent}  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output += `${indent}  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  
  output += `${indent}Operation-specific metrics:\n`;
  output += `${indent}  Swipe p95: ${data.metrics.swipe_duration?.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  output += `${indent}  Chat p95: ${data.metrics.chat_duration?.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  output += `${indent}  Call p95: ${data.metrics.call_duration?.values['p(95)']?.toFixed(2) || 'N/A'}ms\n\n`;
  
  output += `${indent}Error Rates:\n`;
  output += `${indent}  Swipe errors: ${(data.metrics.swipe_errors?.values.rate * 100 || 0).toFixed(2)}%\n`;
  output += `${indent}  Chat errors: ${(data.metrics.chat_errors?.values.rate * 100 || 0).toFixed(2)}%\n`;
  output += `${indent}  Call errors: ${(data.metrics.call_errors?.values.rate * 100 || 0).toFixed(2)}%\n\n`;
  
  output += `${indent}==============================================\n`;
  
  return output;
}
