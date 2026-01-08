# PACK 334 - Production Deployment Pipeline Guide

## Overview

This guide covers the complete production deployment pipeline for Avalo, including CI/CD, environment management, rollback procedures, and safety measures.

## Table of Contents

1. [Architecture](#architecture)
2. [Environment Setup](#environment-setup)
3. [CI/CD Workflows](#cicd-workflows)
4. [Deployment Process](#deployment-process)
5. [Rollback Procedures](#rollback-procedures)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Troubleshooting](#troubleshooting)

## Architecture

### Three-Tier Environment Structure

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  DEV                                                    │
│  • Local development + Firebase emulators              │
│  • Test keys only                                       │
│  • No real money transactions                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STAGING                                                │
│  • Pre-production testing                              │
│  • Mirrors production setup                            │
│  • Test keys (but real Firebase project)              │
│  • Auto-deploy on main branch                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PRODUCTION                                             │
│  • Live users                                           │
│  • Live payment keys                                    │
│  • Manual approval required                            │
│  • Deploy from release/* branches                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Environment Setup

### Prerequisites

1. **Firebase Projects**
   - `avalo-dev` (development)
   - `avalo-staging` (staging)
   - `avalo-c8c46` (production)

2. **Required Accounts**
   - Firebase/Google Cloud
   - GitHub (for Actions)
   - Stripe (test + live)
   - OpenAI/Anthropic
   - KYC Provider
   - SMS/Email Provider
   - Google Play Console
   - Apple Developer Account

3. **Local Setup**
   ```bash
   # Clone repository
   git clone https://github.com/your-org/avaloapp
   cd avaloapp

   # Copy environment template
   cp config/secrets.template.env .env

   # Fill in your development credentials
   nano .env

   # Install dependencies
   npm install
   cd functions && npm install
   cd ../app-mobile && npm install
   ```

### Secrets Configuration

See [`docs/SECRETS_MANAGEMENT.md`](./SECRETS_MANAGEMENT.md) for complete secrets management guide.

Required GitHub Actions secrets:
- Firebase credentials (DEV, STAGING, PROD)
- Stripe keys (test + live)
- AI provider keys
- App store credentials
- Test account credentials

## CI/CD Workflows

### Staging Deployment (Automatic)

**Trigger**: Push to `main` branch

**Process**:
1. Lint & TypeScript check
2. Unit tests
3. Build mobile apps (EAS)
4. Build web app (Next.js)
5. Run database migrations
6. Deploy Firebase (rules, functions, hosting)
7. Smoke tests
8. Notify team

**Duration**: ~15-20 minutes

### Production Deployment (Manual Approval)

**Trigger**: 
- Push to `release/*` branch
- Manual workflow dispatch

**Process**:
1. Verify deployment prerequisites
2. Legal & compliance checks
3. Security scan
4. Full test suite
5. Build mobile + web
6. Backup current production
7. **→ MANUAL APPROVAL REQUIRED ←**
8. Run database migrations
9. Deploy Firebase components
10. Smoke tests
11. Auto-rollback on failure

**Duration**: ~30-45 minutes (excluding approval wait)

### Rollback (Emergency)

**Trigger**: Manual workflow dispatch

**Process**:
1. Verify rollback request
2. Backup current state
3. Download target backup version
4. **→ FINAL APPROVAL REQUIRED ←**
5. Execute rollback
6. Verify rollback success
7. Notify team

**Duration**: ~10-15 minutes

## Deployment Process

### Step-by-Step: Staging Deployment

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 3. Push and create PR
git push origin feature/my-feature

# 4. Merge to main (after review)
# → This triggers automatic staging deployment

# 5. Monitor deployment in GitHub Actions
# https://github.com/your-org/avaloapp/actions
```

### Step-by-Step: Production Deployment

```bash
# 1. Create release branch from main
git checkout main
git pull
git checkout -b release/v1.2.0

# 2. Update version numbers
# app.json, package.json, etc.

# 3. Update CHANGELOG.md

# 4. Commit and push
git add .
git commit -m "chore: release v1.2.0"
git push origin release/v1.2.0

# 5. Deployment starts automatically
# Monitor: https://github.com/your-org/avaloapp/actions

# 6. Approve deployment when prompted
# Go to Actions → Deployment run → Review deployments

# 7. Monitor post-deployment health
# Check Crashlytics, Cloud Functions logs, user metrics
```

## Rollback Procedures

### When to Rollback

- Critical bugs affecting core functionality
- Payment processing failures
- Security vulnerabilities discovered
- Data corruption issues
- Crash rate >5%
- Payment failure rate >5%

### Automated Rollback

Triggered automatically if smoke tests fail after deployment.

### Manual Rollback

```bash
# Via GitHub Actions UI:
# 1. Go to Actions → Rollback Production workflow
# 2. Click "Run workflow"
# 3. Enter backup version (commit SHA)
# 4. Type "ROLLBACK PRODUCTION"
# 5. Enter reason for rollback
# 6. Approve when prompted
```

### Rollback Scope

**What IS rolled back:**
- Cloud Functions
- Firestore rules
- Web Hosting

**What is NOT rolled back:**
- User balances (protected)
- Payment transactions (immutable)
- Chat history (preserved)
- User data (retained)

### Post-Rollback Actions

1. Investigate root cause
2. Fix the issue
3. Test thoroughly in staging
4. Deploy fix as new version
5. Document incident
6. Update deployment procedures

## Monitoring & Alerts

### Key Metrics

**System Health**
- Cloud Functions error rate
- API response times
- Database query latency
- Crashlytics crash-free rate

**Business Metrics**
- Payment success rate
- Token spend patterns
- User engagement
- Panic button activations

**Security Metrics**
- Failed auth attempts
- Unusual API patterns
- Geographic anomalies

### Alert Channels

Configure in `.env`:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Monitoring Commands

```bash
# Monitor errors for 5 minutes
node scripts/monitor-errors.js --env=production --duration=300

# Check feature flags
node scripts/check-feature-flags.js --env=production

# Verify legal compliance
node scripts/check-legal-compliance.js
```

## Mobile App Release Flow

See [`docs/MOBILE_RELEASE_FLOW.md`](./MOBILE_RELEASE_FLOW.md) for detailed mobile app release procedures.

### Android Release Path
1. Internal Test → 2. Closed Test → 3. Production (staged rollout)

### iOS Release Path
1. TestFlight → 2. App Store Review → 3. Production (phased release)

## Database Migrations

### Creating a Migration

```javascript
// migrations/003_add_new_feature.js
module.exports = {
  version: '1.2.0',
  name: 'Add New Feature Collection',
  
  async up(db, admin) {
    // Forward migration
    await db.collection('new_features').doc('config').set({
      enabled: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  },
  
  async down(db, admin) {
    // Rollback migration
    await db.collection('new_features').doc('config').delete();
  }
};
```

### Running Migrations

```bash
# Dry run (staging)
node scripts/migrate-database.js --env=staging --dry-run=true

# Execute (staging)
node scripts/migrate-database.js --env=staging --dry-run=false

# Execute (production) - requires --force
node scripts/migrate-database.js --env=production --dry-run=false --force=true
```

## Feature Flags

### Remote Configuration

Features can be enabled/disabled without app updates:

```typescript
import { isFeatureEnabledForUser } from '@/lib/feature-flags';

const canUseAI = await isFeatureEnabledForUser('aiCompanions', userId);
```

### Kill Switch Activation

Emergency feature disable via Firebase Console:
1. Go to Firebase Console → Remote Config
2. Find feature flag (e.g., `ai_companions_enabled`)
3. Set to `false`
4. Publish changes
5. Changes propagate within 1 hour (or force refresh)

## Troubleshooting

### Deployment Failed

**Check:**
1. GitHub Actions logs for error details
2. Firebase deploy output
3. Build logs
4. Test failure reasons

**Common Issues:**
- Missing environment variables
- TypeScript errors
- Test failures
- Permission issues

### Smoke Tests Failed

**Actions:**
1. Check which specific test failed
2. Investigate the failure reason
3. Determine if issue is critical
4. If critical: automatic rollback triggers
5. If not critical: manual decision

### Functions Not Updating

```bash
# Check function logs
firebase functions:log --project=production

# Verify deployment
firebase functions:list --project=production

# Manual redeploy if needed
firebase deploy --only functions --project=production
```

### Web Hosting Not Updated

```bash
# Check hosting releases
firebase hosting:releases:list --project=production

# View current site
firebase hosting:sites:list --project=production

# Manual redeploy if needed
firebase deploy --only hosting:web --project=production
```

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Review all PRs** - Require approvals before merge
3. **Run security scans** - Automated in production workflow
4. **Monitor access logs** - Check for suspicious activity
5. **Rotate keys regularly** - Every 90 days minimum
6. **Use MFA** - On all production access accounts
7. **Audit permissions** - Regularly review who has access
8. **Encrypt sensitive data** - Both at rest and in transit

## Emergency Contacts

**On-Call Rotation**: [Link to PagerDuty/OpsGenie]

**Escalation Path**:
1. DevOps Team Lead
2. Engineering Manager
3. CTO

**Critical Incidents**: [Incident response playbook link]

## Resources

- [Secrets Management Guide](./SECRETS_MANAGEMENT.md)
- [Mobile Release Flow](./MOBILE_RELEASE_FLOW.md)
- [Firebase Documentation](https://firebase.google.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12-12 | Initial deployment pipeline |

---

**Last Updated**: 2024-12-12  
**Owner**: DevOps Team  
**Status**: ✅ Active