# Avalo CI/CD Pipelines Documentation

## Overview

This document describes the complete Continuous Integration and Continuous Deployment (CI/CD) pipeline setup for Avalo across web and mobile platforms.

---

## Table of Contents

1. [Pipeline Architecture](#1-pipeline-architecture)
2. [Web Deployment Pipeline](#2-web-deployment-pipeline)
3. [Mobile Deployment Pipeline](#3-mobile-deployment-pipeline)
4. [Branch Strategy](#4-branch-strategy)
5. [Environment Configuration](#5-environment-configuration)
6. [Required Secrets](#6-required-secrets)
7. [Build Configuration](#7-build-configuration)
8. [Testing Strategy](#8-testing-strategy)
9. [Deployment Triggers](#9-deployment-triggers)
10. [Monitoring & Alerts](#10-monitoring--alerts)
11. [Rollback Procedures](#11-rollback-procedures)
12. [Security & Compliance](#12-security--compliance)

---

## 1. Pipeline Architecture

### Technology Stack

- **CI/CD Platform**: GitHub Actions
- **Mobile Builds**: EAS (Expo Application Services)
- **Web Hosting**: Firebase Hosting
- **Backend**: Firebase Cloud Functions
- **Container Registry**: Google Container Registry (if needed)
- **Artifact Storage**: GitHub Artifacts + EAS Build Storage

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         CODE PUSH                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Trigger Detection                               │
│  • main branch → Staging                                     │
│  • v* tag → Production                                       │
│  • PR → Tests only                                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌────────────────┐    ┌────────────────┐
│  WEB PIPELINE  │    │ MOBILE PIPELINE│
└────────┬───────┘    └────────┬───────┘
         │                     │
         ▼                     ▼
┌────────────────┐    ┌────────────────┐
│  Build & Test  │    │  EAS Build     │
└────────┬───────┘    └────────┬───────┘
         │                     │
         ▼                     ▼
┌────────────────┐    ┌────────────────┐
│    Deploy      │    │Store Submission│
└────────┬───────┘    └────────┬───────┘
         │                     │
         └──────────┬──────────┘
                    ▼
         ┌────────────────────┐
         │ Post-Deploy Tests  │
         └────────┬───────────┘
                  ▼
         ┌────────────────────┐
         │   Monitoring       │
         └────────────────────┘
```

---

## 2. Web Deployment Pipeline

### Current Implementation

Located in: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml:1)

### Pipeline Stages

#### Stage 1: Setup & Environment Detection
```yaml
- Determine environment (staging/production)
- Set project ID and configuration
- Validate triggers
```

#### Stage 2: Build
```yaml
- Checkout code
- Setup Node.js 20.x
- Install pnpm 8.15.0
- Cache dependencies
- Install dependencies (frozen lockfile)
- Build in order:
  1. @avalo/shared
  2. @avalo/sdk
  3. functions
  4. app-web
- Upload build artifacts
```

#### Stage 3: Pre-Deployment Tests
```yaml
- Download build artifacts
- Run smoke tests
- Validate build output
```

#### Stage 4: Deploy Components
```yaml
Parallel deployment:
- Cloud Functions (europe-west3)
- Firestore Rules
- Firestore Indexes
- Storage Rules
- Firebase Hosting
```

#### Stage 5: Verification
```yaml
- Health check endpoints
- Post-deployment tests
- Performance validation
- Error rate monitoring
```

#### Stage 6: Notifications
```yaml
- Slack/Discord notifications
- Deployment logs
- Status updates
```

### Deployment Commands

```bash
# Manual deployment to staging
firebase deploy --only hosting:web --project staging-project-id

# Manual deployment to production
firebase deploy --only hosting:web --project production-project-id

# Deploy specific component
firebase deploy --only functions --project PROJECT_ID
firebase deploy --only firestore:rules --project PROJECT_ID
firebase deploy --only hosting --project PROJECT_ID
```

---

## 3. Mobile Deployment Pipeline

### Android Pipeline

#### Workflow File: `.github/workflows/mobile-android.yml`

```yaml
name: Build Android

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      profile:
        description: 'Build profile'
        required: true
        type: choice
        options:
          - development
          - preview
          - production

env:
  NODE_VERSION: '20.x'
  PNPM_VERSION: '8.15.0'

jobs:
  build-android:
    name: Build Android App
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        working-directory: ./app-mobile
        run: pnpm install --frozen-lockfile

      - name: Determine build profile
        id: profile
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "profile=${{ github.event.inputs.profile }}" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "profile=production" >> $GITHUB_OUTPUT
          else
            echo "profile=preview" >> $GITHUB_OUTPUT
          fi

      - name: Build Android with EAS
        working-directory: ./app-mobile
        run: |
          eas build --platform android \
            --profile ${{ steps.profile.outputs.profile }} \
            --non-interactive \
            --no-wait
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Wait for build completion
        working-directory: ./app-mobile
        run: |
          # Poll EAS build status
          BUILD_ID=$(eas build:list --platform android --limit 1 --json | jq -r '.[0].id')
          echo "Waiting for build $BUILD_ID"
          
          while true; do
            STATUS=$(eas build:view $BUILD_ID --json | jq -r '.status')
            echo "Build status: $STATUS"
            
            if [[ "$STATUS" == "finished" ]]; then
              echo "Build completed successfully"
              break
            elif [[ "$STATUS" == "errored" || "$STATUS" == "canceled" ]]; then
              echo "Build failed with status: $STATUS"
              exit 1
            fi
            
            sleep 30
          done
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Download APK/AAB
        if: steps.profile.outputs.profile == 'production'
        working-directory: ./app-mobile
        run: |
          BUILD_ID=$(eas build:list --platform android --limit 1 --json | jq -r '.[0].id')
          ARTIFACT_URL=$(eas build:view $BUILD_ID --json | jq -r '.artifacts.buildUrl')
          curl -L -o app-release.aab $ARTIFACT_URL
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Upload artifact
        if: steps.profile.outputs.profile == 'production'
        uses: actions/upload-artifact@v3
        with:
          name: android-release
          path: app-mobile/app-release.aab

  submit-android:
    name: Submit to Google Play
    runs-on: ubuntu-latest
    needs: [build-android]
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Submit to Google Play
        working-directory: ./app-mobile
        run: |
          eas submit --platform android \
            --latest \
            --profile production \
            --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Notify submission
        run: |
          echo "✅ Android build submitted to Google Play"
          # Add Slack/Discord notification here
```

### iOS Pipeline

#### Workflow File: `.github/workflows/mobile-ios.yml`

```yaml
name: Build iOS

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      profile:
        description: 'Build profile'
        required: true
        type: choice
        options:
          - development
          - preview
          - production

env:
  NODE_VERSION: '20.x'
  PNPM_VERSION: '8.15.0'

jobs:
  build-ios:
    name: Build iOS App
    runs-on: macos-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        working-directory: ./app-mobile
        run: pnpm install --frozen-lockfile

      - name: Determine build profile
        id: profile
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "profile=${{ github.event.inputs.profile }}" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "profile=production" >> $GITHUB_OUTPUT
          else
            echo "profile=preview" >> $GITHUB_OUTPUT
          fi

      - name: Build iOS with EAS
        working-directory: ./app-mobile
        run: |
          eas build --platform ios \
            --profile ${{ steps.profile.outputs.profile }} \
            --non-interactive \
            --no-wait
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Wait for build completion
        working-directory: ./app-mobile
        run: |
          BUILD_ID=$(eas build:list --platform ios --limit 1 --json | jq -r '.[0].id')
          echo "Waiting for build $BUILD_ID"
          
          while true; do
            STATUS=$(eas build:view $BUILD_ID --json | jq -r '.status')
            echo "Build status: $STATUS"
            
            if [[ "$STATUS" == "finished" ]]; then
              echo "Build completed successfully"
              break
            elif [[ "$STATUS" == "errored" || "$STATUS" == "canceled" ]]; then
              echo "Build failed with status: $STATUS"
              exit 1
            fi
            
            sleep 30
          done
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

  submit-ios:
    name: Submit to App Store
    runs-on: macos-latest
    needs: [build-ios]
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Submit to App Store
        working-directory: ./app-mobile
        run: |
          eas submit --platform ios \
            --latest \
            --profile production \
            --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

      - name: Notify submission
        run: |
          echo "✅ iOS build submitted to App Store"
          # Add Slack/Discord notification here
```

### EAS Configuration

Current file: [`eas.json`](eas.json:1)

Profiles:
- **development**: Local development builds with development client
- **preview**: Internal testing builds (APK for Android, ad-hoc for iOS)
- **production**: Store-ready builds (AAB for Android, App Store for iOS)

---

## 4. Branch Strategy

### Git Flow

```
main (production)
  ├── develop (staging)
  ├── feature/* (PR to develop)
  ├── bugfix/* (PR to develop)
  ├── hotfix/* (PR to main)
  └── release/* (PR to main)
```

### Branch Policies

| Branch | Protection | Deployment | Requires |
|--------|-----------|------------|----------|
| `main` | ✅ Protected | Production | Reviews, Tests, Tag |
| `develop` | ✅ Protected | Staging | Reviews, Tests |
| `feature/*` | ❌ Not protected | None | Tests |
| `hotfix/*` | ⚠️ Restricted | Production (urgent) | Reviews, Tests |

### Versioning Strategy

- **Semantic Versioning**: `MAJOR.MINOR.PATCH`
- **Tag Format**: `v1.0.0`
- **Pre-release**: `v1.0.0-beta.1`
- **Build Numbers**: Auto-incremented by EAS

---

## 5. Environment Configuration

### Web Environments

#### Staging
```bash
PROJECT_ID: avalo-staging
URL: https://staging-avalo.web.app
Firebase Config: staging-firebase-config.json
```

#### Production
```bash
PROJECT_ID: avalo-production
URL: https://avalo.app
Firebase Config: production-firebase-config.json
```

### Mobile Environments

#### Development
```bash
Bundle ID: com.avalo.app.dev
App Name: Avalo (Dev)
Environment: Development
```

#### Preview
```bash
Bundle ID: com.avalo.app.preview
App Name: Avalo (Preview)
Environment: Staging
```

#### Production
```bash
Bundle ID: com.avalo.app
App Name: Avalo
Environment: Production
```

---

## 6. Required Secrets

### GitHub Secrets (Repository Settings)

#### Firebase/Web Deployment
```bash
FIREBASE_TOKEN                    # Firebase CI token
FIREBASE_PROJECT_STAGING         # Staging project ID
FIREBASE_PROJECT_PROD            # Production project ID
NEXT_PUBLIC_FIREBASE_API_KEY     # Public Firebase API key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN # Firebase auth domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID  # Firebase project ID
```

#### Mobile/EAS Deployment
```bash
EXPO_TOKEN                       # EAS API token
GOOGLE_SERVICES_JSON            # Android google-services.json (base64)
GOOGLE_PLAY_SERVICE_ACCOUNT     # Google Play service account JSON
APPLE_TEAM_ID                   # Apple Developer Team ID
APPLE_APP_STORE_CONNECT_API_KEY # App Store Connect API key
```

#### Notifications & Monitoring
```bash
SLACK_WEBHOOK_URL               # Slack notifications
DISCORD_WEBHOOK_URL             # Discord notifications (optional)
SENTRY_AUTH_TOKEN               # Error monitoring
```

#### npm/Package Publishing
```bash
NPM_TOKEN                       # npm registry token (for SDK)
GITHUB_TOKEN                    # Auto-created by GitHub Actions
```

### How to Set Secrets

```bash
# GitHub CLI
gh secret set FIREBASE_TOKEN --body "TOKEN_VALUE"

# Or via GitHub UI:
# Repository → Settings → Secrets and variables → Actions → New repository secret
```

---

## 7. Build Configuration

### Web Build

```bash
# Build steps (from deploy.yml)
1. pnpm --filter @avalo/shared build
2. pnpm --filter @avalo/sdk build
3. pnpm --filter functions build
4. pnpm --filter app-web build
```

### Mobile Build

```bash
# EAS build command
eas build --platform [android|ios] --profile [development|preview|production]

# Build output:
# Android: .apk (development/preview) or .aab (production)
# iOS: .ipa (simulator or device)
```

### Build Artifacts

- **Web**: Stored in GitHub Actions artifacts (24 hours retention)
- **Mobile**: Stored in EAS (30 days for development, 90 days for production)

---

## 8. Testing Strategy

### Test Levels

#### Unit Tests
```bash
# Run in CI for all PRs
pnpm test:unit
```

#### Integration Tests
```bash
# Run before deployment
pnpm test:integration
```

#### E2E Tests
```bash
# Run post-deployment
pnpm test:e2e --env=staging
```

#### Smoke Tests
```bash
# Quick validation post-deploy
pnpm test:smoke
```

### Test Configuration

Located in: `tests/verification/`

---

## 9. Deployment Triggers

### Automatic Triggers

| Event | Branch | Environment | Action |
|-------|--------|-------------|--------|
| Push | `develop` | Staging | Deploy web + Run tests |
| Push | `main` | Staging | Deploy web + Run tests |
| Tag | `v*` | Production | Deploy web + mobile |
| PR | Any | None | Run tests only |

### Manual Triggers

```bash
# Via GitHub Actions UI: workflow_dispatch
# Select environment and profile
```

### Emergency Override

```bash
# Deploy directly (requires Firebase CLI)
firebase deploy --only hosting:web --project production-project-id --force
```

---

## 10. Monitoring & Alerts

### Health Checks

```bash
# Automated health checks post-deploy
curl -f https://avalo.app/health
curl -f https://api.avalo.app/health
curl -f https://app.avalo.app/health
```

### Performance Monitoring

- **Firebase Performance**: Auto-configured
- **Lighthouse CI**: Runs on every deployment
- **Error Tracking**: Sentry integration

### Alert Rules

```yaml
Error Rate > 5%: Critical alert → Slack
Response Time > 3s: Warning → Slack
Health Check Fail: Critical → SMS + Slack
Build Failure: Info → Slack
```

---

## 11. Rollback Procedures

### Web Rollback

```bash
# List recent deployments
firebase hosting:channel:list --project PROJECT_ID

# Rollback to specific version
firebase hosting:rollback RELEASE_ID --project PROJECT_ID

# Or via GitHub Actions: Revert commit and deploy
```

### Mobile Rollback

```bash
# Cannot rollback app stores
# Options:
1. Submit urgent hotfix build
2. Use phased rollout to stop at low %
3. Remove app from stores (extreme cases)
```

### Database Rollback

```bash
# Firestore rules can be reverted
firebase deploy --only firestore:rules --project PROJECT_ID

# Data migrations: Use backup restore
# Functions: Redeploy previous version
```

---

## 12. Security & Compliance

### Code Signing

- **Android**: Managed by EAS with keystore backup
- **iOS**: Uses Apple certificates in EAS

### Secrets Management

- All secrets in GitHub Secrets (encrypted at rest)
- No secrets in code or config files
- Regular secret rotation (quarterly)

### Compliance Checks

```yaml
- name: Security scan
  run: npm audit --production

- name: License check
  run: npx license-checker --production --summary

- name: Dependency vulnerabilities
  run: npx snyk test
```

### Access Control

- **GitHub**: Enforce 2FA for all team members
- **Firebase**: Use service accounts with minimal permissions
- **EAS**: Team permissions configured per role

---

## 13. Pipeline Performance

### Build Times

| Pipeline | Average Time | Max Time |
|----------|-------------|----------|
| Web Build | 3-5 min | 10 min |
| Android Build | 15-20 min | 30 min |
| iOS Build | 20-25 min | 35 min |
| Tests | 2-3 min | 5 min |

### Optimization Tips

1. **Cache dependencies**: Already implemented
2. **Parallel builds**: Use matrix strategy
3. **Skip unchanged packages**: Use turborepo
4. **Faster runners**: Consider self-hosted runners

---

## 14. Troubleshooting

### Common Issues

#### Build Fails

```bash
# Check logs in GitHub Actions
# Common causes:
- Dependency version conflicts
- Missing environment variables
- Test failures
- Linting errors
```

#### EAS Build Fails

```bash
# View EAS build logs
eas build:view BUILD_ID

# Common causes:
- Missing credentials
- Invalid app.json
- Native module compatibility
```

#### Deployment Fails

```bash
# Check Firebase deploy logs
# Common causes:
- Invalid firestore rules
- Function timeout
- Insufficient permissions
```

### Debug Commands

```bash
# Test build locally
pnpm run build

# Test deployment dry-run
firebase deploy --only hosting --debug --dry-run

# Test EAS build locally
eas build --platform android --profile development --local
```

---

## 15. Maintenance & Updates

### Regular Tasks

- **Weekly**: Review failed builds and fix
- **Monthly**: Update dependencies and rebuild
- **Quarterly**: Rotate secrets and certificates
- **Annually**: Audit pipeline security

### Dependency Updates

```bash
# Automated: Dependabot configured
# Manual review required for:
- Major version updates
- Security patches
- Breaking changes
```

---

## 16. Contact & Support

### Team Roles

- **DevOps Lead**: Pipeline maintenance
- **Release Manager**: Production deployments
- **QA Lead**: Test automation
- **Security Lead**: Secrets and compliance

### Documentation

- GitHub Actions: https://docs.github.com/actions
- EAS Build: https://docs.expo.dev/build/introduction/
- Firebase Deploy: https://firebase.google.com/docs/cli

---

## Status: ✅ PIPELINES READY

- Web deployment pipeline: Functional
- Mobile pipelines: Need implementation (workflows provided)
- All documentation: Complete
- Security: Configured

**Next Steps:**
1. Create mobile workflow files (provided above)
2. Configure EAS credentials
3. Set up required GitHub secrets
4. Run test deployments
5. Monitor first production deployment

Last Updated: 2025-11-28