# Avalo Build & Release Pipeline Guide

**Complete automation from repository → downloadable builds (APK/AAB/IPA) → deployed website**

This guide provides all commands and procedures to build, test, and release Avalo across mobile and web platforms.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Mobile Builds (EAS)](#mobile-builds-eas)
- [Web Deployment](#web-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)

## 🚀 Quick Start

### One-Command Builds

```bash
# Local development
npm install && npm run dev

# Web preview
pnpm --filter web build && firebase deploy --only hosting:web

# Android preview APK
eas build -p android --profile preview

# iOS preview (TestFlight)
eas build -p ios --profile preview

# Full production release (all platforms)
npm run release:production
```

## ✅ Prerequisites

### Required Accounts & Tools
- [x] Node.js 20+ installed
- [x] PNPM installed (`npm install -g pnpm`)
- [x] Firebase CLI installed (`npm install -g firebase-tools`)
- [x] EAS CLI installed (`npm install -g eas-cli`)
- [x] Expo account (https://expo.dev)
- [x] Firebase project configured
- [x] Google Play Console account ($25 one-time)
- [x] Apple Developer account ($99/year)
- [x] GitHub repository with Actions enabled

### Environment Setup

1. **Clone repository**:
```bash
git clone https://github.com/yourusername/avaloapp.git
cd avaloapp
```

2. **Install dependencies**:
```bash
# Install all workspace dependencies
pnpm install

# Install function dependencies
cd functions && npm install && cd ..
```

3. **Configure environment variables**:
```bash
# Copy example files
cp .env.example .env
cp app/.env.example app/.env
cp functions/.env.example functions/.env

# Edit with your keys (see docs/ENVIRONMENT_KEYS.md)
nano .env
nano app/.env
nano functions/.env
```

4. **Login to services**:
```bash
# Firebase
firebase login

# Expo/EAS
eas login

# Verify logins
firebase projects:list
eas whoami
```

## 💻 Local Development

### Start Development Environment

```bash
# Terminal 1: Start Firebase Emulators
npm run emulators

# Terminal 2: Start Functions in watch mode
cd functions && npm run serve

# Terminal 3: Start Expo development server
npm run dev

# Terminal 4: Start Web development server (optional)
cd web && npm run dev
```

### Development URLs

- **Expo App**: Press `i` for iOS, `a` for Android, scan QR for physical device
- **Web App**: http://localhost:3000
- **Functions**: http://localhost:5007
- **Firebase Emulator UI**: http://localhost:4410

### Run Tests

```bash
# Lint all code
pnpm run lint

# Run unit tests
cd functions && npm test

# Run integration tests
cd functions && npm run test:integration

# Run with coverage
cd functions && npm test -- --coverage
```

## 📱 Mobile Builds (EAS)

### EAS Configuration

Configuration file: [`eas.json`](./eas.json)

**Build Profiles**:
- `development` - Dev client with hot reload
- `preview` - Testing builds (APK for Android)
- `internal` - Internal distribution
- `production` - Store-ready builds (AAB for Android, IPA for iOS)

### Android Builds

#### Preview APK (Testing)
```bash
# Build preview APK
eas build -p android --profile preview

# Build and auto-submit to internal testing
eas build -p android --profile preview --auto-submit
```

#### Production AAB (Play Store)
```bash
# Build production App Bundle
eas build -p android --profile production

# Submit to Play Store
eas submit -p android --profile production

# Or build and submit in one command
eas build -p android --profile production --auto-submit
```

#### Download Build
```bash
# List recent builds
eas build:list --platform android --limit 5

# Download specific build
eas build:download --id <BUILD_ID>
```

### iOS Builds

#### Preview Build (TestFlight)
```bash
# Build for TestFlight
eas build -p ios --profile preview

# Auto-submit to TestFlight
eas build -p ios --profile preview --auto-submit
```

#### Production IPA (App Store)
```bash
# Build production IPA
eas build -p ios --profile production

# Submit to App Store
eas submit -p ios --profile production

# Or build and submit in one command
eas build -p ios --profile production --auto-submit
```

#### Simulator Build (Testing)
```bash
# Build for iOS Simulator
eas build -p ios --profile internal

# Run on simulator after download
npx expo start --ios --simulator
```

### Build Status & Logs

```bash
# Check build status
eas build:list

# View build logs
eas build:view <BUILD_ID>

# Cancel running build
eas build:cancel <BUILD_ID>
```

## 🌐 Web Deployment

### Firebase Hosting Configuration

Configuration file: [`firebase.json`](./firebase.json)

**Hosting Targets**:
- `web` - Next.js web application (SSR-enabled)
- `app` - Static marketing site

### Build Web Application

```bash
# Development build
cd web
npm run dev

# Production build
npm run build

# Build and export static files
npm run build && npm run export
```

### Deploy to Firebase Hosting

#### Preview Deployment
```bash
# Deploy to preview channel (temporary URL)
firebase hosting:channel:deploy preview --expires 7d

# Access preview URL
# Output: https://avalo-c8c46--preview-abc123.web.app
```

#### Production Deployment

```bash
# Deploy web hosting only
firebase deploy --only hosting:web

# Deploy hosting and functions
firebase deploy --only hosting,functions

# Full deployment (hosting, functions, firestore rules, storage rules)
firebase deploy
```

### Deploy Cloud Functions

```bash
# Build functions
cd functions
npm run build

# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:functionName

# Deploy with increased memory/timeout
firebase deploy --only functions --set-timeout 300 --set-memory 512MB
```

### Rollback Deployment

```bash
# List deployment history
firebase hosting:releases:list

# Rollback to previous version
firebase hosting:rollback
```

## ⚙️ CI/CD Pipeline

### GitHub Actions Workflow

Configuration file: [`.github/workflows/release.yml`](./.github/workflows/release.yml)

**Automated Jobs**:
1. `lint-and-test` - Code quality checks
2. `web-build-deploy` - Web deployment
3. `mobile-eas-android` - Android builds
4. `mobile-eas-ios` - iOS builds
5. `security-checks` - Security scanning
6. `deploy-summary` - Release summary

### GitHub Secrets Required

Set in: **Repository Settings → Secrets → Actions**

```bash
# Firebase
FIREBASE_TOKEN              # Get with: firebase login:ci
FIREBASE_PROJECT_ID         # Your project ID
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID

# Expo/EAS
EXPO_TOKEN                  # Get with: eas whoami

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# AI Services
ANTHROPIC_API_KEY
OPENAI_API_KEY

# Email
SENDGRID_API_KEY
```

### Set GitHub Secrets (CLI)

```bash
# Install GitHub CLI if needed
# https://cli.github.com/

# Set secrets
gh secret set FIREBASE_TOKEN --body "$(firebase login:ci)"
gh secret set EXPO_TOKEN --body "$(eas whoami --json | jq -r .id)"
gh secret set STRIPE_SECRET_KEY --body "sk_live_..."
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
```

### Trigger Manual Workflow

```bash
# Via GitHub CLI
gh workflow run release.yml

# With specific build profile
gh workflow run release.yml -f build_profile=production

# Via GitHub UI
# Actions → Release Pipeline → Run workflow
```

### Monitor CI/CD Pipeline

```bash
# List recent workflow runs
gh run list --workflow=release.yml

# View specific run
gh run view <RUN_ID>

# Watch running workflow
gh run watch <RUN_ID>

# View logs
gh run view <RUN_ID> --log
```

## 🎯 Release Process

### Complete Release Procedure

Follow this checklist for each release: [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md)

### Step-by-Step Production Release

#### 1. Pre-Release Preparation

```bash
# Update version in app.json
nano app.json
# Increment version and build numbers

# Update changelog
nano CHANGELOG.md

# Run all tests
pnpm run lint
cd functions && npm test && cd ..

# Create release branch
git checkout -b release/v1.0.0
git add .
git commit -m "chore: prepare v1.0.0 release"
git push origin release/v1.0.0
```

#### 2. Build Functions

```bash
# Build and test functions
cd functions
npm run build
npm test
cd ..
```

#### 3. Deploy Web

```bash
# Build web application
pnpm --filter web build

# Deploy to Firebase Hosting
firebase deploy --only hosting:web

# Deploy functions
firebase deploy --only functions

# Verify deployment
curl https://avalo-c8c46.web.app
```

#### 4. Configure Stripe Webhooks

```bash
# Install Stripe CLI (if not already installed)
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Create webhook endpoint
stripe webhooks create \
  --url "https://europe-west3-avalo-c8c46.cloudfunctions.net/stripeWebhook" \
  --description "Avalo Production Webhook" \
  --events checkout.session.completed \
  --events payment_intent.succeeded \
  --events payment_intent.payment_failed \
  --events customer.subscription.created \
  --events customer.subscription.updated \
  --events customer.subscription.deleted

# Update webhook secret in Firebase
firebase functions:config:set stripe.webhook_secret="whsec_..."
firebase deploy --only functions
```

#### 5. Build Mobile Apps

```bash
# Android Production Build
eas build -p android --profile production

# iOS Production Build
eas build -p ios --profile production

# Wait for builds to complete (check status)
eas build:list

# Download builds when ready
eas build:download --platform android --profile production
eas build:download --platform ios --profile production
```

#### 6. Test Builds

```bash
# Install and test Android APK/AAB
# Upload to internal testing track in Play Console

# Install and test iOS IPA
# Upload to TestFlight for internal testing

# Run smoke tests
# - Login/logout
# - Create post
# - Send message
# - Process payment
# - AI companion interaction
```

#### 7. Submit to Stores

Follow detailed guide: [`docs/STORE_SUBMISSION.md`](./docs/STORE_SUBMISSION.md)

**Android (Google Play)**:
```bash
# Submit to Play Console
eas submit -p android --profile production

# Or manual upload via Play Console
# https://play.google.com/console
```

**iOS (App Store)**:
```bash
# Submit to App Store Connect
eas submit -p ios --profile production

# Or manual upload via App Store Connect
# https://appstoreconnect.apple.com
```

#### 8. Monitor Release

```bash
# Check Firebase Crashlytics
# https://console.firebase.google.com → Crashlytics

# Check Firebase Analytics
# https://console.firebase.google.com → Analytics

# Monitor Play Console
# https://play.google.com/console → Dashboard

# Monitor App Store Connect
# https://appstoreconnect.apple.com → Analytics
```

#### 9. Post-Release

```bash
# Tag release
git tag v1.0.0
git push origin v1.0.0

# Merge to main
git checkout main
git merge release/v1.0.0
git push origin main

# Create GitHub release
gh release create v1.0.0 \
  --title "Avalo v1.0.0" \
  --notes "Release notes here"
```

## 🔧 Troubleshooting

### Common Build Issues

#### EAS Build Fails

```bash
# Clear EAS cache and retry
eas build:clear-cache -p android
eas build -p android --profile production --clear-cache

# Check build logs
eas build:view <BUILD_ID>

# Verify credentials
eas credentials
```

#### Firebase Deploy Fails

```bash
# Re-authenticate
firebase logout
firebase login

# Check project configuration
firebase use --add

# Deploy with debug output
firebase deploy --debug
```

#### Web Build Errors

```bash
# Clear Next.js cache
cd web
rm -rf .next node_modules
npm install
npm run build

# Check for TypeScript errors
npm run type-check

# Increase Node memory
export NODE_OPTIONS=--max_old_space_size=4096
npm run build
```

#### Environment Variables Not Working

```bash
# Verify environment files exist
ls -la .env app/.env functions/.env

# Check Firebase config
firebase functions:config:get

# Set missing config
firebase functions:config:set key="value"

# Redeploy
firebase deploy --only functions
```

### Deep Link Issues

See complete guide: [`docs/DEEP_LINKS.md`](./docs/DEEP_LINKS.md)

#### Test Deep Links

```bash
# iOS Simulator
xcrun simctl openurl booted "avalo://profile/test123"
xcrun simctl openurl booted "https://avalo.app/chat/test456"

# Android Emulator
adb shell am start -a android.intent.action.VIEW -d "avalo://profile/test123"
adb shell am start -a android.intent.action.VIEW -d "https://avalo.app/chat/test456"
```

### Performance Issues

```bash
# Analyze bundle size
cd web
npm run analyze

# Check Firebase performance
# https://console.firebase.google.com → Performance

# Run lighthouse audit
npx lighthouse https://avalo.app --view
```

## 📚 Documentation Index

### Core Documentation
- **[Release Checklist](./docs/RELEASE_CHECKLIST.md)** - Complete pre-release checklist
- **[Store Submission Guide](./docs/STORE_SUBMISSION.md)** - App Store and Play Store submission
- **[Environment Keys](./docs/ENVIRONMENT_KEYS.md)** - All environment variables and API keys
- **[Deep Links](./docs/DEEP_LINKS.md)** - Deep linking and universal links setup
- **[QA & Automation](./docs/QA_AUTOMATION.md)** - Testing strategy and automation

### Configuration Files
- **[`eas.json`](./eas.json)** - EAS build configuration
- **[`app.json`](./app.json)** - Expo app configuration
- **[`firebase.json`](./firebase.json)** - Firebase project configuration
- **[`.github/workflows/release.yml`](./.github/workflows/release.yml)** - CI/CD workflow

### Project Documentation
- **[README.md](./README.md)** - Project overview
- **[QUICK_START.md](./QUICK_START.md)** - Quick start guide
- **[Production Deployment Guide](./AVALO_PRODUCTION_DEPLOYMENT_GUIDE.md)** - Detailed deployment procedures

## 🎓 Training & Resources

### Video Tutorials
- [Expo EAS Build](https://www.youtube.com/watch?v=dJO2Y3KKWAw)
- [Firebase Hosting](https://www.youtube.com/watch?v=jsRVHeQd5kU)
- [GitHub Actions](https://www.youtube.com/watch?v=R8_veQiYBjI)

### Official Documentation
- [Expo Docs](https://docs.expo.dev)
- [Firebase Docs](https://firebase.google.com/docs)
- [Stripe Docs](https://stripe.com/docs)
- [React Native Docs](https://reactnative.dev/docs)

### Community Resources
- [Expo Forums](https://forums.expo.dev)
- [Firebase Support](https://firebase.google.com/support)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/expo)

## 🆘 Support

### Get Help

**Technical Issues**:
- Email: devops@avalo.app
- Documentation: https://avalo.app/docs
- GitHub Issues: https://github.com/yourusername/avaloapp/issues

**Emergency Contacts**:
- On-call engineer: [Phone/Slack]
- DevOps lead: [Phone/Slack]
- Product manager: [Phone/Slack]

### Report Issues

```bash
# Create GitHub issue
gh issue create --title "Bug: Description" --body "Detailed description"

# View open issues
gh issue list

# Search issues
gh issue list --search "deployment"
```

## ✨ Quick Reference Commands

### Essential Commands

```bash
# Development
npm install                              # Install dependencies
npm run dev                              # Start dev server
npm run emulators                        # Start Firebase emulators

# Testing
pnpm run lint                            # Lint code
cd functions && npm test                 # Run tests
cd functions && npm run test:integration # Integration tests

# Building
pnpm --filter web build                  # Build web
eas build -p android --profile preview   # Android preview
eas build -p ios --profile preview       # iOS preview

# Deploying
firebase deploy --only hosting:web       # Deploy web
firebase deploy --only functions         # Deploy functions
firebase deploy                          # Full deploy

# Production Release
eas build -p android --profile production # Android production
eas build -p ios --profile production     # iOS production
firebase deploy                           # Web production

# Monitoring
firebase open                             # Open Firebase console
gh run list                               # List workflow runs
eas build:list                            # List builds
```

### Package Scripts

```json
{
  "dev": "expo start",
  "build": "expo build",
  "lint": "eslint .",
  "test": "cd functions && npm test",
  "emulators": "firebase emulators:start",
  "deploy": "firebase deploy",
  "release:production": "npm run deploy && eas build --platform all --profile production"
}
```

## 🎉 Success Criteria

Your release is successful when:

- ✅ All tests passing
- ✅ Web deployed and accessible
- ✅ Mobile builds available in stores
- ✅ No critical crashes (>99% crash-free)
- ✅ Key metrics normal (response times, errors)
- ✅ Webhooks functioning
- ✅ Monitoring active
- ✅ Documentation updated

---

**Version**: 1.0.0  
**Last Updated**: 2024-11-04  
**Maintained By**: Avalo DevOps Team

**Ready to build? Start with `npm install && npm run dev` 🚀**