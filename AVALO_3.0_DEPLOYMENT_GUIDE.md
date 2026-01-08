# Avalo 3.0 Deployment Guide
## Production Deployment & Infrastructure Setup

**Version**: 3.0.0  
**Release Date**: 2025-11-03  
**Target Environment**: Production (Global Multi-Region)  
**Document Date**: 2025-11-03

---

## Prerequisites

### Required Tools & Accounts

```bash
# Install Firebase CLI
npm install -g firebase-tools@latest

# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Install Node.js & npm
# Minimum: Node 18.x LTS
node --version  # Should be ≥18.0.0
npm --version   # Should be ≥9.0.0

# Install additional tools
npm install -g typescript@latest
npm install -g @expo/cli@latest
```

### Required Accounts
- ✅ Firebase/Google Cloud Project (avalo-c8c46)
- ✅ Anthropic API Key (Claude 3.5 Sonnet)
- ✅ Stripe Account (payments processing)
- ✅ SendGrid Account (transactional email)
- ✅ Datadog Account (monitoring & APM)
- ✅ Sentry Account (error tracking)
- ✅ Upstash Redis (caching layer)

### Environment Setup

```bash
# Authenticate with Firebase
firebase login

# Authenticate with Google Cloud
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project avalo-c8c46
firebase use avalo-c8c46

# Verify setup
firebase projects:list
gcloud projects describe avalo-c8c46
```

---

## Environment Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=avalo-c8c46
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=avalo-c8c46.firebaseapp.com
FIREBASE_DATABASE_URL=https://avalo-c8c46.firebaseio.com
FIREBASE_STORAGE_BUCKET=avalo-c8c46.appspot.com

# Anthropic AI (Claude 3.5 Sonnet)
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Redis (Upstash)
REDIS_URL=rediss://default:...@us1-xxxxx.upstash.io:6379
REDIS_TOKEN=AYO...

# Stripe Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# SendGrid Email
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@avalo.app
SENDGRID_FROM_NAME=Avalo Team

# Datadog Monitoring
DATADOG_API_KEY=...
DATADOG_APP_KEY=...
DATADOG_SITE=datadoghq.eu

# Sentry Error Tracking
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...

# App Configuration
NODE_ENV=production
APP_URL=https://avalo.app
API_URL=https://api.avalo.app
ADMIN_URL=https://admin.avalo.app
```

### Firebase Configuration Files

**firebase.json**:
```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log"
      ],
      "predeploy": [
        "npm --prefix \"$RESOURCE_DIR\" run build"
      ]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "hosting": {
    "public": "web/out",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=31536000; includeSubDomains"
          }
        ]
      }
    ]
  },
  "emulators": {
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "hosting": {
      "port": 5000
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

---

## Deployment Steps

### Step 1: Pre-Deployment Validation

```bash
# Run full test suite
cd functions
npm install
npm test
npm run test:integration

# Run linting
npm run lint

# Type check
npm run type-check

# Security audit
npm audit --production
npm audit fix

# Build check
npm run build
```

### Step 2: Database Setup

#### Firestore Indexes

```bash
# Deploy Firestore indexes (required before functions)
firebase deploy --only firestore:indexes

# Wait for indexes to build (can take 5-30 minutes)
# Check status in Firebase Console > Firestore > Indexes
```

**Critical Indexes** (firestore.indexes.json):
- `trust_profiles`: userId (ASC), lastCalculated (DESC)
- `risk_clusters`: status (ASC), detectedAt (DESC)
- `ai_analyses`: userId (ASC), analyzedAt (DESC)
- `moderation_queue`: status (ASC), priority (DESC), createdAt (ASC)
- `privacy_requests`: userId (ASC), type (ASC), status (ASC)

#### Firestore Security Rules

```bash
# Validate rules locally
firebase emulators:start --only firestore
npm run test:rules

# Deploy security rules
firebase deploy --only firestore:rules

# Test rules in production
npm run test:rules:production
```

#### Storage Rules

```bash
# Deploy storage rules
firebase deploy --only storage

# Verify bucket CORS configuration
gsutil cors get gs://avalo-c8c46.appspot.com
```

### Step 3: Cloud Functions Deployment

#### Deploy Functions Incrementally

```bash
cd functions

# Build functions
npm run build

# Deploy in stages to minimize downtime
# Stage 1: New functions only
firebase deploy --only functions:getTrustScoreV1
firebase deploy --only functions:analyzeContentV1
firebase deploy --only functions:requestDataExportV2

# Stage 2: Core business logic
firebase deploy --only functions:trustEngine
firebase deploy --only functions:riskGraph
firebase deploy --only functions:compliance

# Stage 3: Scheduled functions
firebase deploy --only functions:recalculateAllTrustScoresDaily
firebase deploy --only functions:detectFraudClustersDaily
firebase deploy --only functions:processDataExportScheduler
firebase deploy --only functions:processScheduledDeletionsScheduler

# Stage 4: All remaining functions
firebase deploy --only functions

# Verify deployment
firebase functions:list
```

#### Function Configuration

```bash
# Set function environment variables
firebase functions:config:set \
  anthropic.api_key="$ANTHROPIC_API_KEY" \
  redis.url="$REDIS_URL" \
  stripe.secret_key="$STRIPE_SECRET_KEY" \
  sendgrid.api_key="$SENDGRID_API_KEY"

# View current config
firebase functions:config:get

# Deploy config changes
firebase deploy --only functions
```

### Step 4: Initialize Production Data

```bash
# Connect to production Firebase
firebase use production

# Initialize quest definitions
firebase functions:shell
> seedQuestDefinitions()

# Initialize badge definitions (included in seedQuestDefinitions)

# Verify data
# Check Firebase Console > Firestore > Collections
# - quest_definitions: 15+ quests
# - badge_definitions: 20+ badges
```

### Step 5: Frontend Deployment

#### Mobile App (React Native + Expo)

```bash
# Build iOS app
cd app
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --latest

# Build Android app
eas build --platform android --profile production

# Submit to Google Play
eas submit --platform android --latest

# Configure over-the-air updates
eas update --branch production --message "Avalo 3.0 release"
```

#### Web Admin Dashboard (Next.js)

```bash
# Build web dashboard
cd web
npm install
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Verify deployment
curl https://admin.avalo.app/health
```

### Step 6: Post-Deployment Verification

```bash
# Health checks
curl https://api.avalo.app/health
curl https://admin.avalo.app/health

# Test critical endpoints
curl -X POST https://us-central1-avalo-c8c46.cloudfunctions.net/getTrustScoreV1 \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user_id"}'

# Monitor logs
firebase functions:log --only getTrustScoreV1 --limit 50

# Check Datadog dashboard
# https://app.datadoghq.eu/dashboard/avalo-production

# Check Sentry for errors
# https://sentry.io/organizations/avalo/issues/
```

---

## Monitoring & Observability

### Datadog Setup

**Metrics to Monitor**:
```javascript
// Trust Engine
- trust_score.calculation_time (ms)
- trust_score.cache_hit_rate (%)
- trust_score.error_rate (%)

// AI Oversight
- ai_analysis.latency (ms)
- ai_analysis.precision (%)
- ai_analysis.false_positive_rate (%)

// Risk Graph
- risk_graph.query_time (ms)
- risk_graph.cluster_detection_rate (per hour)

// Compliance
- privacy_request.processing_time (days)
- privacy_request.sla_compliance_rate (%)

// System Health
- function.invocations (count)
- function.errors (count)
- function.cold_starts (count)
- firestore.reads (count)
- firestore.writes (count)
```

**Alerts Configuration**:
```yaml
# Critical Alerts (PagerDuty)
- trust_calculation_failures > 5%
- ai_api_failures > 10%
- data_export_sla_breach
- security_incident_detected

# Warning Alerts (Slack)
- cache_hit_rate < 60%
- ai_latency > 150ms
- moderation_queue > 100 items
- cluster_detection_failures

# Info Alerts (Email)
- daily_summary_report
- weekly_compliance_report
- monthly_billing_summary
```

### Sentry Configuration

```javascript
// functions/src/init.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: 'avalo@3.0.0',
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Prisma({ client: prisma }),
  ],
  beforeSend(event, hint) {
    // Filter PII from error reports
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
    }
    return event;
  },
});
```

### Custom Dashboards

**Grafana Dashboard** (if using):
```sql
-- Trust Engine Performance
SELECT
  TIMESTAMP_TRUNC(timestamp, MINUTE) as time,
  AVG(calculation_time_ms) as avg_calculation_time,
  PERCENTILE_CONT(calculation_time_ms, 0.95) as p95_calculation_time,
  COUNT(*) as total_calculations
FROM `avalo-c8c46.analytics.trust_calculations`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY time
ORDER BY time;

-- AI Analysis Success Rate
SELECT
  TIMESTAMP_TRUNC(timestamp, HOUR) as time,
  COUNTIF(success = true) / COUNT(*) * 100 as success_rate,
  AVG(latency_ms) as avg_latency
FROM `avalo-c8c46.analytics.ai_analyses`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY time
ORDER BY time;
```

---

## Rollback Procedures

### Function Rollback

```bash
# List recent deployments
firebase functions:list --verbose

# Rollback specific function
firebase functions:delete getTrustScoreV1
firebase deploy --only functions:getTrustScoreV1

# Rollback entire function deployment
# 1. Find previous version in Firebase Console
# 2. Re-deploy from git tag
git checkout v2.1.0
cd functions && npm install && npm run build
firebase deploy --only functions
git checkout main

# Emergency: Delete problematic function
firebase functions:delete problematicFunction
# Then redeploy stable version
```

### Database Rollback

```bash
# Firestore doesn't support automatic rollback
# Use daily backups to restore

# List available backups
gsutil ls gs://avalo-c8c46-backups/firestore/

# Restore from backup (requires Firestore import/export API)
gcloud firestore import gs://avalo-c8c46-backups/firestore/2025-11-02 \
  --async

# Verify restoration
gcloud firestore operations list
```

### Hosting Rollback

```bash
# List hosting releases
firebase hosting:channel:list

# Rollback to previous release
firebase hosting:rollback

# Or deploy specific version
firebase hosting:channel:deploy v2-1-0
firebase hosting:channel:clone v2-1-0 live
```

---

## Scaling Configuration

### Auto-Scaling Rules

**Cloud Functions**:
```yaml
# functions/package.json - deploymentConfig
{
  "functions": {
    "getTrustScoreV1": {
      "minInstances": 2,
      "maxInstances": 100,
      "concurrency": 80,
      "memory": "256MB",
      "timeoutSeconds": 60
    },
    "analyzeContentV1": {
      "minInstances": 5,
      "maxInstances": 50,
      "concurrency": 20,
      "memory": "512MB",
      "timeoutSeconds": 120
    },
    "recalculateAllTrustScoresDaily": {
      "minInstances": 0,
      "maxInstances": 10,
      "memory": "1GB",
      "timeoutSeconds": 540
    }
  }
}
```

**Firestore Scaling**:
- Automatic horizontal scaling (no configuration needed)
- Distributed architecture across multiple datacenters
- Max throughput: 10,000 writes/second per database

**Redis Scaling**:
```bash
# Upstash auto-scales based on plan
# Current: 8GB, up to 100K req/sec
# Upgrade path: 16GB → 32GB → 64GB

# Monitor Redis metrics
curl -X GET "https://api.upstash.com/v2/redis/database/$REDIS_ID/stats" \
  -H "Authorization: Bearer $UPSTASH_API_KEY"
```

### Load Balancing

```bash
# Cloud Load Balancer (automatic)
# - Global anycast IP
# - SSL termination
# - DDoS protection via Cloud Armor

# Verify load balancer
gcloud compute backend-services list
gcloud compute url-maps list
```

---

## Disaster Recovery

### Backup Strategy

**Firestore Backups** (automated daily):
```bash
# Configure automatic backups
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d

# Manual backup
gcloud firestore export gs://avalo-c8c46-backups/firestore/manual-$(date +%Y%m%d)

# List backups
gsutil ls gs://avalo-c8c46-backups/firestore/
```

**Cloud Storage Backups**:
```bash
# Enable versioning
gsutil versioning set on gs://avalo-c8c46.appspot.com

# Configure lifecycle policy
gsutil lifecycle set lifecycle.json gs://avalo-c8c46.appspot.com

# lifecycle.json
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 90,
        "isLive": false
      }
    }
  ]
}
```

**Function Source Code Backups**:
- Git repository (primary): GitHub
- Backup mirror: GitLab
- Archive: Google Cloud Source Repositories

### Recovery Time Objectives (RTO/RPO)

| Component | RTO | RPO | Recovery Method |
|-----------|-----|-----|-----------------|
| Cloud Functions | <5 min | 0 | Redeploy from source |
| Firestore | <1 hour | 24 hours | Import from daily backup |
| Cloud Storage | <30 min | 24 hours | Restore from snapshot |
| Redis Cache | <5 min | 0 (cache) | Rebuild from source |
| Configuration | <15 min | 0 | Terraform/Firebase config |

### Multi-Region Failover

```bash
# Primary: europe-west3 (Frankfurt)
# Secondary: us-central1 (Iowa)
# Tertiary: asia-southeast1 (Singapore)

# Configure multi-region Firestore
gcloud firestore databases update --type=firestore-native \
  --location=eur3

# Traffic routing (Cloud Load Balancer)
# - 70% europe-west3
# - 20% us-central1
# - 10% asia-southeast1

# Automatic failover on region failure
# - Health checks every 5 seconds
# - Failover within 30 seconds
# - Automatic traffic redistribution
```

---

## Security Hardening

### Network Security

```bash
# VPC Configuration
gcloud compute networks create avalo-vpc \
  --subnet-mode=custom

gcloud compute networks subnets create avalo-subnet-eu \
  --network=avalo-vpc \
  --region=europe-west3 \
  --range=10.1.0.0/20

# Firewall Rules
gcloud compute firewall-rules create allow-internal \
  --network=avalo-vpc \
  --allow=tcp,udp,icmp \
  --source-ranges=10.1.0.0/20

gcloud compute firewall-rules create allow-https \
  --network=avalo-vpc \
  --allow=tcp:443 \
  --source-ranges=0.0.0.0/0

# Cloud Armor (DDoS protection)
gcloud compute security-policies create avalo-armor \
  --description="DDoS protection for Avalo"

gcloud compute security-policies rules create 1000 \
  --security-policy=avalo-armor \
  --expression="origin.region_code == 'CN'" \
  --action=deny-403
```

### IAM & Access Control

```bash
# Service Account for Functions
gcloud iam service-accounts create avalo-functions \
  --display-name="Avalo Cloud Functions"

# Grant minimal permissions
gcloud projects add-iam-policy-binding avalo-c8c46 \
  --member="serviceAccount:avalo-functions@avalo-c8c46.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Admin access (limited)
gcloud projects add-iam-policy-binding avalo-c8c46 \
  --member="user:admin@avalo.app" \
  --role="roles/editor" \
  --condition="expression=request.time < timestamp('2026-01-01T00:00:00Z'),title=temporary"
```

### Secrets Management

```bash
# Store sensitive data in Secret Manager
echo -n "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-api-key \
  --data-file=- \
  --replication-policy="automatic"

echo -n "$STRIPE_SECRET_KEY" | gcloud secrets create stripe-secret-key \
  --data-file=- \
  --replication-policy="automatic"

# Grant access to functions
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:avalo-functions@avalo-c8c46.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Access in function code
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();
const [version] = await client.accessSecretVersion({
  name: 'projects/avalo-c8c46/secrets/anthropic-api-key/versions/latest',
});
const apiKey = version.payload.data.toString();
```

---

## Cost Optimization

### Current Monthly Costs (125K MAU)

| Service | Cost | Optimization Strategy |
|---------|------|----------------------|
| Cloud Functions | $240 | Optimize cold starts, increase concurrency |
| Firestore | $520 | Implement aggressive caching (-38% achieved) |
| Redis | $320 | Optimize TTLs, compress cached data |
| Claude API | $150 | Cache analyses 24h, selective moderation |
| Bandwidth | $180 | CDN caching, image optimization |
| **Total** | **$1,410** | **Target: <$1,500** |

### Cost per User
- Current: $0.011/user/month
- Target: <$0.015/user/month
- Industry benchmark: $0.02-0.05/user/month

### Optimization Tactics

**1. Caching Strategy**:
```typescript
// Aggressive caching reduces Firestore reads by 38%
cache.set('trust_score:' + userId, score, 6 * 3600); // 6 hours
cache.set('user_profile:' + userId, profile, 3600); // 1 hour
cache.set('discovery_feed:' + userId, feed, 1800); // 30 min
```

**2. Function Optimization**:
```typescript
// Keep functions warm (reduce cold starts)
export const warmUp = functions.pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    // Ping critical functions
    await Promise.all([
      httpsCallable('getTrustScoreV1')(),
      httpsCallable('analyzeContentV1')(),
    ]);
  });
```

**3. AI Cost Reduction**:
```typescript
// Cache AI analyses for 24 hours
const cacheKey = `ai_analysis:${contentHash}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const analysis = await claude.analyze(content);
await cache.set(cacheKey, analysis, 86400); // 24h
return analysis;
```

---

## Maintenance Windows

### Scheduled Maintenance

**Weekly Maintenance** (Sundays 02:00-04:00 UTC):
- Database optimization
- Index rebuilding
- Cache clearing
- Log rotation

**Monthly Maintenance** (First Sunday 02:00-06:00 UTC):
- Dependency updates
- Security patches
- Performance tuning
- Backup verification

**Quarterly Maintenance** (Q1/Q2/Q3/Q4):
- Major version upgrades
- Infrastructure review
- Security audit
- Disaster recovery drill

### Maintenance Checklist

```bash
# Pre-maintenance
- [ ] Announce maintenance window (48h notice)
- [ ] Backup all databases
- [ ] Review recent incidents
- [ ] Prepare rollback plan

# During maintenance
- [ ] Enable maintenance mode
- [ ] Apply updates
- [ ] Run migration scripts
- [ ] Verify functionality
- [ ] Monitor error rates

# Post-maintenance
- [ ] Disable maintenance mode
- [ ] Verify all services
- [ ] Check monitoring dashboards
- [ ] Review logs for errors
- [ ] Send all-clear notification
```

---

## Troubleshooting Guide

### Common Issues

**Issue: High function latency**
```bash
# Check cold start rate
firebase functions:log --only getTrustScoreV1 | grep "cold start"

# Increase min instances
firebase functions:config:set getTrustScoreV1.minInstances=3

# Check memory usage
gcloud logging read "resource.type=cloud_function AND severity>=WARNING"
```

**Issue: Firestore quota exceeded**
```bash
# Check current usage
gcloud firestore operations list

# Identify hot collections
# Use Firebase Console > Firestore > Usage tab

# Implement caching or pagination
```

**Issue: AI API rate limits**
```bash
# Check Anthropic usage
curl https://api.anthropic.com/v1/usage \
  -H "x-api-key: $ANTHROPIC_API_KEY"

# Implement exponential backoff
# Add request queuing
# Consider batch processing
```

**Issue: Redis connection failures**
```bash
# Check Upstash status
curl https://status.upstash.com/

# Test connection
redis-cli -u $REDIS_URL ping

# Implement fallback to Firestore
```

---

## Production Checklist

### Pre-Launch

- [ ] All tests passing (unit, integration, e2e)
- [ ] Security audit completed
- [ ] Penetration testing passed
- [ ] Load testing completed (15K concurrent users)
- [ ] Disaster recovery plan tested
- [ ] Monitoring configured (Datadog, Sentry)
- [ ] Alerting rules set up
- [ ] Documentation complete
- [ ] Team training completed
- [ ] Support runbook prepared

### Launch Day

- [ ] Deploy during low-traffic window
- [ ] Monitor error rates closely
- [ ] Watch response times
- [ ] Check cache hit rates
- [ ] Verify AI API success rates
- [ ] Monitor cost metrics
- [ ] Be ready for rollback
- [ ] Team on standby for 24h

### Post-Launch

- [ ] Review launch metrics
- [ ] Analyze user feedback
- [ ] Fix critical bugs
- [ ] Optimize slow queries
- [ ] Plan next iteration
- [ ] Conduct retrospective

---

## Support & Resources

### Documentation
- API Reference: https://api.avalo.app/docs
- Admin Portal Guide: https://docs.avalo.app/admin
- Developer Portal: https://developers.avalo.app

### Contacts
- DevOps Team: devops@avalo.app
- Security Team: security@avalo.app
- Support Team: support@avalo.app
- On-Call: +48 xxx xxx xxx (PagerDuty)

### Status Pages
- System Status: https://status.avalo.app
- API Status: https://api-status.avalo.app
- Datadog Dashboard: https://app.datadoghq.eu/dashboard/avalo

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-03  
**Next Review**: 2025-12-03  
**Maintained By**: Avalo DevOps Team