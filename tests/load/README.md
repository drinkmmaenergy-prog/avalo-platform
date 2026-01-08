# 🚀 Avalo Load Testing Suite

Enterprise-grade load testing infrastructure for validating Avalo's scalability from 100K to 20M users.

## 📋 Overview

This suite includes three comprehensive load engines:

### 1. **100K Realistic Users** (`100k-load.ts`)
- **Purpose:** Production-like simulation with realistic user behavior
- **Users:** 100,000 concurrent
- **Duration:** ~30 minutes
- **Metrics:** P50/P95/P99 latency, throughput, error rates
- **Use Case:** Pre-deployment validation, regression testing

### 2. **1M Synthetic Users** (`1m-synthetic.ts`)
- **Purpose:** Memory & CPU capacity modeling
- **Users:** 1,000,000 synthetic sessions
- **Duration:** ~45 minutes
- **Metrics:** Memory heat maps, CPU usage, event saturation
- **Use Case:** Capacity planning, resource optimization

### 3. **20M Stress Test** (`20m-stress.ts`)
- **Purpose:** Breaking point analysis and scaling thresholds
- **Users:** 20,000,000 probabilistic model
- **Duration:** ~60 minutes
- **Metrics:** Shard balance, queue pressure, hotspot detection
- **Use Case:** Infrastructure limits, auto-scaling configuration

## 🛠️ Installation

```bash
cd tests/load
npm install
npm run build
```

## 🎯 Running Tests

### Individual Tests

```bash
# 100K realistic load
npm run test:100k

# 1M synthetic load
npm run test:1m

# 20M stress test
npm run test:20m
```

### All Tests

```bash
npm run test:all
```

### Generate Report

```bash
npm run report
```

This generates:
- `reports/load-test-dashboard.html` - Interactive dashboard
- `reports/load-test-summary.json` - Machine-readable summary

## 📊 Interpreting Results

### Success Criteria

**100K Test:**
- ✅ Success rate > 99.5%
- ✅ P95 latency < 500ms
- ✅ P99 latency < 1000ms
- ✅ Error rate < 0.5%

**1M Test:**
- ✅ Memory per user < 1KB
- ✅ Peak memory < 6GB
- ✅ CPU average < 70%
- ✅ Event processing rate > 10K/s

**20M Test:**
- ✅ Shard balance score > 0.7
- ✅ Queue saturation < 80%
- ✅ Ops/second sustained > 50K
- ✅ No persistent backlog

### Warning Signs

- ⚠️ P99 latency > 2000ms → Scale horizontally
- ⚠️ Error rate > 1% → Investigate rate limits
- ⚠️ Memory > 7GB @ 1M users → Optimize memory usage
- ⚠️ Queue saturation > 85% → Add workers
- ⚠️ Shard imbalance < 0.6 → Rebalance sharding strategy

## 💰 Cost Projections

The reporter automatically calculates GCP costs for various scales:

| Users | Monthly Cost | Notes |
|-------|-------------|-------|
| 10K | ~$150 | Startup phase |
| 100K | ~$1,500 | Early growth |
| 1M | ~$15,000 | Scale-up |
| 10M | ~$150,000 | Enterprise scale |
| 20M | ~$300,000 | Maximum capacity |

**Breakdown:**
- Cloud Functions: 40%
- Firestore: 35%
- Storage: 15%
- Bandwidth: 10%

## 🔄 CI Integration

### GitHub Actions

Add to `.github/workflows/load-tests.yml`:

```yaml
name: Nightly Load Tests

on:
  schedule:
    - cron: '0 2 * * *' # 2 AM daily
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd tests/load
          npm install
      
      - name: Build
        run: |
          cd tests/load
          npm run build
      
      - name: Run 100K test
        run: |
          cd tests/load
          npm run test:100k
        env:
          LOAD_TEST_URL: ${{ secrets.PROD_API_URL }}
      
      - name: Generate report
        run: |
          cd tests/load
          npm run report
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: load-test-reports
          path: tests/load/reports/
```

### GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
load-tests:
  stage: test
  image: node:20
  only:
    - schedules
  script:
    - cd tests/load
    - npm install
    - npm run build
    - npm run test:100k
    - npm run report
  artifacts:
    paths:
      - tests/load/reports/
    expire_in: 30 days
```

## 📈 Scaling Recommendations

Based on test results:

### Auto-Scaling Triggers

**Scale Up When:**
- P95 latency > 800ms for 5 minutes
- Error rate > 0.5% for 2 minutes
- Queue depth > 1000 for 3 minutes
- CPU > 75% for 5 minutes

**Scale Down When:**
- P95 latency < 200ms for 15 minutes
- CPU < 30% for 15 minutes
- Queue depth < 100 for 10 minutes

### Infrastructure Recommendations

**@ 100K users:**
- Cloud Functions: 50 instances
- Firestore: Single region
- Shards: 100

**@ 1M users:**
- Cloud Functions: 500 instances
- Firestore: Multi-region
- Shards: 500
- Redis: Cluster mode

**@ 10M users:**
- Cloud Functions: 2000 instances
- Firestore: Multi-region + caching
- Shards: 1000
- Redis: Cluster with replicas
- CDN: Global edge caching

**@ 20M users:**
- Cloud Functions: 5000 instances
- Firestore: Multi-region + aggressive caching
- Shards: 2000
- Redis: Cluster with 3 replicas
- CDN: Full global distribution
- Queue: Dedicated Pub/Sub clusters

## 🐛 Troubleshooting

### Out of Memory

```bash
# Increase Node.js memory
node --max-old-space-size=8192 dist/1m-synthetic.js
```

### Rate Limiting

```bash
# Adjust concurrent batches in config
# tests/load/src/100k-load.ts
const CONFIG = {
  CONCURRENT_BATCHES: 500, // Reduce from 1000
  //...
}
```

### Connection Timeouts

```bash
# Increase timeout in axios config
timeout: 30000, // 30 seconds
```

## 📝 Custom Tests

Create custom load scenarios:

```typescript
import { VirtualUser, MetricsCollector } from './100k-load';

const metrics = new MetricsCollector();
const user = new VirtualUser('custom-user-1', metrics);

// Simulate 5 minutes
await user.simulate(5 * 60 * 1000);

console.log(metrics.getMetrics());
```

## 🔒 Security

- Never commit API endpoints to git
- Use environment variables for URLs
- Rotate test tokens regularly
- Run tests on staging first
- Monitor costs during tests

## 📚 References

- [GCP Pricing Calculator](https://cloud.google.com/products/calculator)
- [Firebase Performance](https://firebase.google.com/docs/perf-mon)
- [Load Testing Best Practices](https://cloud.google.com/architecture/scalable-and-resilient-apps)

## 🤝 Contributing

1. Add new load scenarios to `src/`
2. Update documentation
3. Test locally before committing
4. Include cost impact analysis

## 📄 License

Internal use only - Avalo Platform

---

**Last Updated:** 2025-11-07  
**Maintained by:** Avalo Engineering Team