# PACK 353 — Load Testing Suite

## Overview

This directory contains load testing scenarios for Avalo production hardening. Tests are designed using k6, a modern load testing tool.

## Prerequisites

```bash
# Install k6
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Test Scenarios

### 1. 10K Users Scenario (`10k-users-scenario.js`)

**Purpose**: Mixed workload simulating realistic user behavior

**Load Profile**:
- 5,000 swipe actions
- 2,000 paid chat messages
- 500 voice calls
- 300 video calls

**Duration**: ~24 minutes

**Run**:
```bash
k6 run --env API_URL=https://your-app.com --env API_KEY=your-key tests/load/pack353/10k-users-scenario.js
```

**Expected Results**:
- Response time p95 < 2s
- Error rate < 5%
- Swipe operations < 500ms
- Chat operations < 1s
- Call operations < 1.5s

### 2. 100K Users Scenario (`100k-users-scenario.js`)

**Purpose**: High-volume read-only workload (discovery/feed)

**Load Profile**:
- 60% discovery feed
- 25% profile views
- 10% search
- 5% event browsing

**Duration**: ~40 minutes

**Run**:
```bash
k6 run --env API_URL=https://your-app.com --env API_KEY=your-key tests/load/pack353/100k-users-scenario.js
```

**Expected Results**:
- Response time p95 < 3s
- Error rate < 2%
- Feed load time < 2s
- Cache hit rate > 70%

### 3. 1M Users Scenario (`1m-users-scenario.js`)

**Purpose**: Extreme-scale event logging

**Load Profile**:
- Pure event logging (analytics ingestion)
- 1-3 events per batch
- Focus on write throughput

**Duration**: ~60 minutes

**Run**:
```bash
k6 run --env API_URL=https://your-app.com --env API_KEY=your-key tests/load/pack353/1m-users-scenario.js
```

**Expected Results**:
- Response time p95 < 5s
- Error rate < 5%
- Event write time < 3s
- Cost projection included in results

## Cloud Load Testing

For realistic testing at scale, use k6 Cloud:

```bash
# Authenticate
k6 login cloud

# Run in cloud
k6 cloud tests/load/pack353/10k-users-scenario.js
```

## Infrastructure Preparation

Before running large-scale tests:

1. **Scale up Firebase**:
   - Enable automatic scaling
   - Increase read/write capacity
   - Pre-warm caches

2. **Enable monitoring**:
   - Firebase Performance Monitoring
   - Cloud Monitoring dashboards
   - Real-time alerting

3. **Backup data**:
   - Create Firestore backup
   - Export critical data

4. **Notify team**:
   - Schedule load test window
   - Have on-call engineers ready

## Analyzing Results

Results are saved in JSON format:
- `10k-users-results.json`
- `100k-users-results.json`
- `1m-users-results.json`

### Key Metrics to Monitor:

1. **Response Times**: p50, p95, p99
2. **Error Rates**: Overall and per-operation
3. **Throughput**: Requests/second
4. **Resource Usage**:
   - CPU
   - Memory
   - Database connections
   - Network bandwidth

### Cost Analysis

Each test includes estimated Firebase costs:
- Firestore reads/writes
- Cloud Functions invocations
- Storage bandwidth
- Daily projections

## Continuous Load Testing

Integrate with CI/CD:

```yaml
# .github/workflows/load-test.yml
name: Weekly Load Test
on:
  schedule:
    - cron: '0 2 * * 0' # Every Sunday at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install k6
        run: |
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      - name: Run 10K test
        run: k6 run --env API_URL=${{ secrets.API_URL }} --env API_KEY=${{ secrets.API_KEY }} tests/load/pack353/10k-users-scenario.js
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: load-test-results
          path: tests/load/pack353/*-results.json
```

## Troubleshooting

### High Error Rates

1. Check rate limiting thresholds
2. Verify authentication tokens
3. Monitor database connection pool
4. Check for timeout issues

### Poor Performance

1. Review database indexes
2. Check cache hit rates
3. Monitor Cloud Functions cold starts
4. Verify CDN configuration

### Resource Exhaustion

1. Scale up Firebase plan
2. Optimize database queries
3. Add read replicas
4. Implement caching layers

## Best Practices

1. **Start small**: Run 10K test before 100K
2. **Monitor continuously**: Watch metrics during tests
3. **Test outside peak hours**: Minimize user impact
4. **Document baselines**: Track performance over time
5. **Test failure scenarios**: Include error injection

## Support

For issues or questions:
- Check PACK_353_PRODUCTION_HARDENING.md
- Review Firebase console logs
- Contact DevOps team
