/**
 * PACK 353 — Load Test: 1M Users
 * 
 * Scenario: Extreme-scale event logging only
 * Focus on: Analytics ingestion, write performance, queue handling
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '10m', target: 100000 },  // Ramp to 100k
    { duration: '10m', target: 500000 },  // Ramp to 500k
    { duration: '15m', target: 1000000 }, // Ramp to 1M
    { duration: '20m', target: 1000000 }, // Hold at 1M for 20 minutes
    { duration: '5m', target: 0 },        // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95% under 5s (very high tolerance)
    http_req_failed: ['rate<0.05'],     // Error rate under 5%
    'event_write_time': ['p(95)<3000'], // Event writes under 3s
  },
};

// Custom metrics
const eventWriteTime = new Trend('event_write_time');
const eventsLogged = new Counter('events_logged');
const queueAccepted = new Rate('queue_accepted');

const BASE_URL = __ENV.API_URL || 'https://avalo-app.firebaseapp.com';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testUsers = new SharedArray('users', function () {
  const users = [];
  for (let i = 0; i < 1000000; i++) {
    users.push({
      id: `test-user-${i}`,
      token: `test-token-${i}`,
    });
  }
  return users;
});

const eventTypes = [
  'app_open',
  'profile_view',
  'feed_scroll',
  'swipe',
  'match',
  'message_read',
  'notification_received',
  'settings_update',
  'content_interaction',
];

export default function () {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${user.token}`,
    'X-API-Key': API_KEY,
  };
  
  // Log multiple events in batch (more realistic)
  const events = [];
  const eventCount = Math.floor(Math.random() * 3) + 1; // 1-3 events per batch
  
  for (let i = 0; i < eventCount; i++) {
    events.push({
      type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      userId: user.id,
      timestamp: Date.now(),
      metadata: {
        source: 'load_test',
        session: `session-${Math.floor(Math.random() * 10000)}`,
      },
    });
  }
  
  logEvents(events, headers);
  
  sleep(Math.random() * 0.5); // Very short sleep for high throughput
}

function logEvents(events, headers) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({ events });
  
  const response = http.post(`${BASE_URL}/api/events/log`, payload, {
    headers,
    timeout: '10s', // Longer timeout for high load
  });
  
  const duration = Date.now() - startTime;
  eventWriteTime.add(duration);
  
  const success = check(response, {
    'event log status 200 or 202': (r) => r.status === 200 || r.status === 202,
    'event response valid': (r) => r.body.length > 0,
  });
  
  if (success) {
    eventsLogged.add(events.length);
    
    // Check if request was queued (202) vs processed immediately (200)
    const queued = response.status === 202;
    queueAccepted.add(queued);
  }
}

export function handleSummary(data) {
  // Calculate infrastructure costs
  const totalRequests = data.metrics.http_reqs.values.count;
  const totalEvents = data.metrics.events_logged?.values.count || 0;
  const avgRequestsPerSecond = data.metrics.http_reqs.values.rate;
  
  // Estimated Firebase costs (rough approximation)
  const firestoreWrites = totalEvents;
  const costPerWrite = 0.00000018; // $0.18 per 1M writes
  const estimatedFirestoreCost = firestoreWrites * costPerWrite;
  
  const functionsInvocations = totalRequests;
  const costPerInvocation = 0.0000004; // $0.40 per 1M invocations
  const estimatedFunctionsCost = functionsInvocations * costPerInvocation;
  
  const totalEstimatedCost = estimatedFirestoreCost + estimatedFunctionsCost;
  
  const summary = {
    ...data,
    customMetrics: {
      totalEvents,
      avgEventsPerSecond: totalEvents / (data.state.testRunDurationMs / 1000),
      estimatedCosts: {
        firestore: estimatedFirestoreCost.toFixed(4),
        functions: estimatedFunctionsCost.toFixed(4),
        total: totalEstimatedCost.toFixed(4),
        dailyProjection: (totalEstimatedCost * 24).toFixed(2),
      },
    },
  };
  
  return {
    'tests/load/pack353/1m-users-results.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(summary),
  };
}

function textSummary(data) {
  let output = '\n';
  
  output += '======== Load Test Summary (1M Users Event Logging) ========\n\n';
  output += `Peak VUs: ${data.metrics.vus.values.max}\n`;
  output += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  output += `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  output += `Total Events Logged: ${data.customMetrics.totalEvents}\n`;
  output += `Events/Second: ${data.customMetrics.avgEventsPerSecond.toFixed(2)}\n`;
  output += `Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n\n`;
  
  output += 'Response Times:\n';
  output += `  p50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
  output += `  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output += `  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  
  output += 'Event Write Performance:\n';
  output += `  p50: ${data.metrics.event_write_time?.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
  output += `  p95: ${data.metrics.event_write_time?.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  output += `  Queue Acceptance Rate: ${(data.metrics.queue_accepted?.values.rate * 100 || 0).toFixed(2)}%\n\n`;
  
  output += 'Estimated Infrastructure Costs:\n';
  output += `  Firestore Writes: $${data.customMetrics.estimatedCosts.firestore}\n`;
  output += `  Cloud Functions: $${data.customMetrics.estimatedCosts.functions}\n`;
  output += `  Total (test duration): $${data.customMetrics.estimatedCosts.total}\n`;
  output += `  Daily Projection (24h): $${data.customMetrics.estimatedCosts.dailyProjection}\n\n`;
  
  output += '=============================================================\n';
  
  return output;
}
