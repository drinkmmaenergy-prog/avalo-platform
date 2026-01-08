/**
 * PACK 353 — Load Test: 100K Users
 * 
 * Scenario: High-volume read-only workload (discovery/feed)
 * Focus on: Database read performance, caching, CDN
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '5m', target: 10000 },  // Ramp up to 10k
    { duration: '5m', target: 50000 },  // Ramp up to 50k
    { duration: '8m', target: 100000 }, // Ramp up to 100k
    { duration: '15m', target: 100000 }, // Hold at 100k for 15 minutes
    { duration: '5m', target: 50000 },  // Ramp down
    { duration: '2m', target: 0 },      // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% under 3s (higher tolerance for scale)
    http_req_failed: ['rate<0.02'],    // Error rate under 2%
    'feed_load_time': ['p(95)<2000'],  // Feed loads under 2s
  },
};

// Custom metrics
const feedLoadTime = new Trend('feed_load_time');
const cacheHitRate = new Rate('cache_hit_rate');
const dbQueryTime = new Trend('db_query_time');

const BASE_URL = __ENV.API_URL || 'https://avalo-app.firebaseapp.com';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testUsers = new SharedArray('users', function () {
  const users = [];
  for (let i = 0; i < 100000; i++) {
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
  
  // Weighted read operations
  const action = Math.random();
  
  if (action < 0.60) {
    // 60% - Discovery feed
    loadDiscoveryFeed(user, headers);
  } else if (action < 0.85) {
    // 25% - Profile view
    viewProfile(user, headers);
  } else if (action < 0.95) {
    // 10% - Search
    searchProfiles(user, headers);
  } else {
    // 5% - Event browsing
    browseEvents(user, headers);
  }
  
  sleep(Math.random() * 2 + 0.5); // Random sleep 0.5-2.5 seconds
}

function loadDiscoveryFeed(user, headers) {
  const startTime = Date.now();
  
  const response = http.get(`${BASE_URL}/api/discovery/feed?userId=${user.id}`, { headers });
  const duration = Date.now() - startTime;
  
  feedLoadTime.add(duration);
  
  check(response, {
    'feed status 200': (r) => r.status === 200,
    'feed has profiles': (r) => r.json('profiles')?.length > 0,
  });
  
  // Check cache header
  const cacheHit = response.headers['X-Cache-Hit'] === 'true';
  cacheHitRate.add(cacheHit);
}

function viewProfile(user, headers) {
  const targetId = `target-${Math.floor(Math.random() * 50000)}`;
  
  const response = http.get(`${BASE_URL}/api/profile/${targetId}`, { headers });
  
  check(response, {
    'profile status 200': (r) => r.status === 200,
    'profile has data': (r) => r.json('userId') !== undefined,
  });
}

function searchProfiles(user, headers) {
  const keywords = ['sports', 'music', 'travel', 'food', 'art', 'tech'];
  const keyword = keywords[Math.floor(Math.random() * keywords.length)];
  
  const response = http.get(
    `${BASE_URL}/api/search?q=${keyword}&userId=${user.id}`,
    { headers }
  );
  
  check(response, {
    'search status 200': (r) => r.status === 200,
    'search has results': (r) => r.json('results')?.length >= 0,
  });
}

function browseEvents(user, headers) {
  const response = http.get(`${BASE_URL}/api/events/browse`, { headers });
  
  check(response, {
    'events status 200': (r) => r.status === 200,
    'events has data': (r) => r.json('events')?.length >= 0,
  });
}

export function handleSummary(data) {
  return {
    'tests/load/pack353/100k-users-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  let output = '\n';
  
  output += '======== Load Test Summary (100K Users Read-Only) ========\n\n';
  output += `Total VUs: ${data.metrics.vus.values.max}\n`;
  output += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  output += `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  output += `Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n\n`;
  
  output += 'Response Times:\n';
  output += `  p50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
  output += `  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output += `  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  
  output += 'Performance Metrics:\n';
  output += `  Feed Load Time p95: ${data.metrics.feed_load_time?.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  output += `  Cache Hit Rate: ${(data.metrics.cache_hit_rate?.values.rate * 100 || 0).toFixed(2)}%\n\n`;
  
  output += '==========================================================\n';
  
  return output;
}
