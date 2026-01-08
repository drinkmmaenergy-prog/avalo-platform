# PACK 351 — TECHNICAL LAUNCH PLAYBOOK

**Avalo Mobile + Web Platform**  
**Version:** 1.0  
**Last Updated:** 2025-12-14  
**Target:** Production Launch Readiness

---

## Table of Contents

1. [Environments & Configuration](#1-environments--configuration)
2. [Build & Deploy Pipelines](#2-build--deploy-pipelines)
3. [Feature Flags & Kill Switches](#3-feature-flags--kill-switches)
4. [Data Seeding & Initial Setup](#4-data-seeding--initial-setup)
5. [Pre-Launch Checklist](#5-pre-launch-checklist)
6. [Post-Launch Monitoring & Incident Response](#6-post-launch-monitoring--incident-response)

---

## 1. Environments & Configuration

### 1.1 Environment Overview

Avalo operates across three primary environments:

| Environment | Purpose | Firebase Project | Access Level |
|------------|---------|------------------|--------------|
| **Local Dev** | Development & testing | Emulators | All developers |
| **Staging** | Pre-production validation | `avalo-staging` | Team + selected testers |
| **Production** | Live user traffic | `avalo-production` | Restricted deployment only |

### 1.2 Firebase Configuration

#### **Local Development**
```bash
# Use Firebase Emulators
firebase emulators:start
```

**Emulator Ports:**
- Firestore: `localhost:8080`
- Auth: `localhost:9099`
- Functions: `localhost:5001`
- Hosting: `localhost:5000`
- Storage: `localhost:9199`

#### **Staging Environment**
**Firebase Project ID:** `avalo-staging` (or `avalo-app-staging`)

**Required Firebase Services:**
- ✅ Authentication
- ✅ Firestore Database
- ✅ Cloud Functions (Node.js 18+)
- ✅ Cloud Storage
- ✅ Firebase Hosting (for web apps)
- ✅ Firebase Extensions (if applicable)

**Environment Variables (Staging):**
```bash
# .env.staging
FIREBASE_PROJECT_ID=avalo-staging
FIREBASE_API_KEY=<staging-api-key>
FIREBASE_AUTH_DOMAIN=avalo-staging.firebaseapp.com
FIREBASE_DATABASE_URL=https://avalo-staging.firebaseio.com
FIREBASE_STORAGE_BUCKET=avalo-staging.appspot.com
FIREBASE_MESSAGING_SENDER_ID=<sender-id>
FIREBASE_APP_ID=<app-id>
FIREBASE_MEASUREMENT_ID=<measurement-id>
```

#### **Production Environment**
**Firebase Project ID:** `avalo-production` (or `avalo-app-prod`)

**Environment Variables (Production):**
```bash
# .env.production (NEVER commit to git!)
FIREBASE_PROJECT_ID=avalo-production
FIREBASE_API_KEY=<prod-api-key>
FIREBASE_AUTH_DOMAIN=avalo-production.firebaseapp.com
FIREBASE_DATABASE_URL=https://avalo-production.firebaseio.com
FIREBASE_STORAGE_BUCKET=avalo-production.appspot.com
FIREBASE_MESSAGING_SENDER_ID=<sender-id>
FIREBASE_APP_ID=<app-id>
FIREBASE_MEASUREMENT_ID=<measurement-id>
```

### 1.3 Stripe Configuration

#### **Staging (Test Mode)**
```bash
# .env.staging
STRIPE_PUBLISHABLE_KEY=pk_test_<staging-key>
STRIPE_SECRET_KEY=sk_test_<staging-key>
STRIPE_WEBHOOK_SECRET=whsec_<staging-webhook-secret>
```

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

#### **Production (Live Mode)**
```bash
# .env.production
STRIPE_PUBLISHABLE_KEY=pk_live_<prod-key>
STRIPE_SECRET_KEY=sk_live_<prod-key>
STRIPE_WEBHOOK_SECRET=whsec_<prod-webhook-secret>
```

**⚠️ Security Rules:**
1. Store secrets in Firebase Functions config or Google Secret Manager
2. NEVER commit secrets to git
3. Rotate keys quarterly
4. Enable Stripe Radar for fraud detection

### 1.4 In-App Purchase (IAP) Configuration

#### **Apple App Store Connect**
```bash
# .env
APPLE_TEAM_ID=<team-id>
APPLE_APP_BUNDLE_ID=app.avalo.mobile
APPLE_SHARED_SECRET=<shared-secret-for-receipt-validation>
```

**Product IDs (must match PACK definitions):**
- `avalo_tokens_50` → 50 tokens
- `avalo_tokens_100` → 100 tokens
- `avalo_tokens_250` → 250 tokens
- `avalo_tokens_500` → 500 tokens
- `avalo_tokens_1000` → 1000 tokens

#### **Google Play Console**
```bash
# .env
GOOGLE_PACKAGE_NAME=app.avalo.mobile
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account.json
```

**Product IDs:** (same as Apple)

**⚠️ IAP Validation:**
- Always validate receipts server-side (Cloud Functions)
- Implement IAP fraud detection (PACK 174)
- Handle subscription renewals correctly

### 1.5 KYC Provider (Assumed: Stripe Identity or Onfido)

**Staging:**
```bash
KYC_PROVIDER=stripe_identity
KYC_API_KEY=<staging-kyc-key>
KYC_WEBHOOK_SECRET=<staging-webhook-secret>
```

**Production:**
```bash
KYC_PROVIDER=stripe_identity
KYC_API_KEY=<prod-kyc-key>
KYC_WEBHOOK_SECRET=<prod-webhook-secret>
```

### 1.6 AI Provider Configuration

Avalo uses AI for companions, moderation, and chat. Assumed providers:

**OpenAI (GPT-4, GPT-3.5 Turbo):**
```bash
OPENAI_API_KEY=<openai-key>
OPENAI_ORG_ID=<org-id>
```

**Anthropic (Claude) — Optional:**
```bash
ANTHROPIC_API_KEY=<anthropic-key>
```

**Google Vertex AI — Optional:**
```bash
GOOGLE_CLOUD_PROJECT=avalo-production
VERTEX_AI_LOCATION=us-central1
```

**⚠️ AI Safety:**
- Use content moderation on all AI outputs
- Implement rate limiting (100 requests/min per user)
- Monitor token usage for cost control

### 1.7 Secret Management

**Recommended:** Google Cloud Secret Manager

**Setup:**
```bash
# Store secret
echo -n "sk_live_..." | gcloud secrets create stripe-secret-key \
  --data-file=- \
  --project=avalo-production

# Grant access to Cloud Functions
gcloud secrets add-iam-policy-binding stripe-secret-key \
  --member="serviceAccount:avalo-production@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Access in Functions:**
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const [version] = await client.accessSecretVersion({
  name: 'projects/avalo-production/secrets/stripe-secret-key/versions/latest'
});
const stripeKey = version.payload.data.toString();
```

---

## 2. Build & Deploy Pipelines

### 2.1 Mobile (Android + iOS)

#### **Technology Stack:**
- **Framework:** React Native via Expo (SDK 50+)
- **Build Service:** EAS Build (Expo Application Services)
- **OTA Updates:** Expo Updates

#### **Prerequisites:**
1. Expo account with EAS subscription
2. Apple Developer account (iOS)
3. Google Play Developer account (Android)
4. Configured `eas.json`

#### **Build Commands:**

**Development Build (Internal):**
```bash
cd app-mobile

# iOS
eas build --profile development --platform ios

# Android
eas build --profile development --platform android
```

**Staging Build:**
```bash
# iOS
eas build --profile staging --platform ios

# Android
eas build --profile staging --platform android
```

**Production Build:**
```bash
# iOS
eas build --profile production --platform ios

# Android
eas build --profile production --platform android
```

#### **EAS Configuration (`eas.json`):**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "ENVIRONMENT": "development"
      }
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "ENVIRONMENT": "staging",
        "FIREBASE_PROJECT_ID": "avalo-staging"
      }
    },
    "production": {
      "env": {
        "ENVIRONMENT": "production",
        "FIREBASE_PROJECT_ID": "avalo-production"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

#### **App Configuration:**

**iOS (app-mobile/ios/Avalo/Info.plist):**
- App ID: `app.avalo.mobile`
- Bundle ID: Must match Apple Developer Portal
- Version: Semantic versioning (e.g., `1.0.0`)
- Build Number: Auto-increment (e.g., `1`, `2`, `3`)

**Android (app-mobile/android/app/build.gradle):**
- Package Name: `app.avalo.mobile`
- Version Code: Integer (auto-increment)
- Version Name: String (e.g., `1.0.0`)

#### **Signing:**

**iOS:** Managed by EAS (automatic provisioning)

**Android:** 
```bash
# Generate keystore (one-time)
keytool -genkeypair -v -keystore avalo-production.keystore \
  -alias avalo -keyalg RSA -keysize 2048 -validity 10000

# Store in EAS secrets
eas secret:create --scope project --name ANDROID_KEYSTORE_PASSWORD --value <password>
```

#### **Pre-Submission Checklist (iOS):**
- [ ] App icon (1024x1024)
- [ ] Screenshots for all device sizes
- [ ] Privacy policy URL
- [ ] App Store description (EN, PL)
- [ ] Age rating (17+ due to dating content)
- [ ] In-App Purchases configured
- [ ] TestFlight beta testing complete
- [ ] App Review notes prepared

#### **Pre-Submission Checklist (Android):**
- [ ] App icon (512x512)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots for all device sizes
- [ ] Privacy policy URL
- [ ] Google Play description (EN, PL)
- [ ] Content rating questionnaire
- [ ] In-App Products configured
- [ ] Internal testing complete

#### **Submission Commands:**
```bash
# iOS (after build completes)
eas submit --platform ios --latest

# Android
eas submit --platform android --latest
```

### 2.2 Web (Next.js App + Admin Console)

#### **Technology Stack:**
- **Framework:** Next.js 14+ (App Router)
- **Hosting:** Firebase Hosting or Vercel
- **Build Tool:** Next.js build

#### **Web App (`app-web/` or `web/`):**

**Build Commands:**
```bash
cd app-web

# Install dependencies
pnpm install

# Build for production
pnpm build

# Preview locally
pnpm start
```

**Environment Variables:**
```bash
# .env.production
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=avalo-production.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=avalo-production
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<key>
```

**Deploy to Firebase Hosting:**
```bash
# Build
pnpm build

# Deploy
firebase deploy --only hosting:app-web --project avalo-production
```

**Deploy to Vercel:**
```bash
# Install Vercel CLI
npm install -g vercel

# Link project
vercel link

# Deploy to production
vercel --prod
```

#### **Admin Console (`admin-web/`):**

**Build Commands:**
```bash
cd admin-web

# Install dependencies
pnpm install

# Build for production
pnpm build

# Preview locally
pnpm start
```

**Deploy:**
```bash
# Firebase Hosting (subdomain: admin.avalo.app)
firebase deploy --only hosting:admin-web --project avalo-production

# OR Vercel with custom domain
vercel --prod
```

**⚠️ Security:**
- Admin console MUST be behind authentication
- Only allow `support_agent`, `support_manager`, `safety_admin`, `super_admin` roles
- Use Firebase Admin SDK for server-side auth
- Enable CORS only for known domains

### 2.3 Cloud Functions

#### **Build & Deploy:**
```bash
cd functions

# Install dependencies
npm install

# Lint
npm run lint

# Typecheck
npm run build

# Deploy to staging
firebase deploy --only functions --project avalo-staging

# Deploy to production
firebase deploy --only functions --project avalo-production
```

**⚠️ Deployment Best Practices:**
1. Always deploy to staging first
2. Run smoke tests in staging
3. Monitor logs for 15 minutes before prod deploy
4. Deploy during low-traffic hours (2-4 AM local time)
5. Have rollback plan ready

#### **Firestore Rules & Indexes:**
```bash
# Deploy rules
firebase deploy --only firestore:rules --project avalo-production

# Deploy indexes
firebase deploy --only firestore:indexes --project avalo-production
```

**⚠️ Index Build Time:**
- Large indexes can take 30+ minutes to build
- Monitor Firebase Console > Firestore > Indexes
- Do not deploy app until indexes are "Enabled"

### 2.4 Smoke Test After Deploy

**Post-Deploy Checklist:**

1. **Functions:**
   - [ ] Check Firebase Console > Functions > All deployed
   - [ ] Trigger test function (e.g., `ping` endpoint)
   - [ ] Check logs for errors

2. **Hosting:**
   - [ ] Visit `https://avalo.app` (or your domain)
   - [ ] Verify home page loads
   - [ ] Check browser console for errors

3. **Mobile:**
   - [ ] Download build from EAS/TestFlight/Internal Track
   - [ ] Launch app
   - [ ] Login with test account
   - [ ] Verify core features work

---

## 3. Feature Flags & Kill Switches

### 3.1 Feature Flag System

**Recommended:** Firebase Remote Config

**Setup:**
```typescript
// shared/src/featureFlags.ts
export interface FeatureFlags {
  supportSystemEnabled: boolean;
  helpCenterEnabled: boolean;
  panicButtonEnabled: boolean;
  aiCompanionsEnabled: boolean;
  meetingsEnabled: boolean;
  eventsEnabled: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  educationCardsEnabled: boolean;
  
  // Kill switches
  emergencyDisablePayments: boolean;
  emergencyDisablePayouts: boolean;
  emergencyDisableAI: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  supportSystemEnabled: true,
  helpCenterEnabled: true,
  panicButtonEnabled: true,
  aiCompanionsEnabled: false, // Gradual rollout
  meetingsEnabled: true,
  eventsEnabled: true,
  paymentsEnabled: true,
  payoutsEnabled: true,
  educationCardsEnabled: true,
  
  emergencyDisablePayments: false,
  emergencyDisablePayouts: false,
  emergencyDisableAI: false,
};
```

**Firebase Remote Config Setup:**
```bash
# In Firebase Console:
# 1. Go to Remote Config
# 2. Add parameters for each flag
# 3. Set default values
# 4. Publish
```

**Usage in App:**
```typescript
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';

const remoteConfig = getRemoteConfig();
remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hour

await fetchAndActivate(remoteConfig);

const supportEnabled = getValue(remoteConfig, 'supportSystemEnabled').asBoolean();
```

### 3.2 Critical Kill Switches

**Emergency Controls (Stored in Firestore for instant updates):**

**Document:** `systemConfig/emergencyControls`
```typescript
{
  disablePayments: false,
  disablePayouts: false,
  disableAI: false,
  disableMeetings: false,
  disableEvents: false,
  disablePanicButton: false,
  maintenanceMode: false,
  maintenanceMessage: {
    en: "We're performing maintenance. Back soon!",
    pl: "Trwa konserwacja. Wracamy wkrótce!"
  }
}
```

**Real-time Listener in App:**
```typescript
const controlsRef = doc(firestore, 'systemConfig', 'emergencyControls');
onSnapshot(controlsRef, (snapshot) => {
  const controls = snapshot.data();
  
  if (controls.maintenanceMode) {
    showMaintenanceScreen(controls.maintenanceMessage);
  }
  
  if (controls.disablePayments) {
    disablePaymentButtons();
  }
  
  // ... other kill switches
});
```

**Admin Panel for Kill Switches:**
```typescript
// admin-web/src/app/emergency/page.tsx
export default function EmergencyControlsPage() {
  const toggleKillSwitch = async (switch: string, enabled: boolean) => {
    await updateDoc(doc(firestore, 'systemConfig', 'emergencyControls'), {
      [switch]: enabled,
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin.uid,
    });
  };
  
  return (
    <div>
      <h1>Emergency Kill Switches</h1>
      <Toggle label="Disable Payments" onChange={(val) => toggleKillSwitch('disablePayments', val)} />
      <Toggle label="Disable Payouts" onChange={(val) => toggleKillSwitch('disablePayouts', val)} />
      {/* ... */}
    </div>
  );
}
```

### 3.3 Gradual Rollout Strategy

**Use Firestore for user segmentation:**

**Document:** `systemConfig/rolloutPercentages`
```typescript
{
  aiCompanions: 10, // 10% of users
  newMatchingAlgo: 25, // 25% of users
  videoCallsEnabled: 50, // 50% of users
}
```

**Client-side check:**
```typescript
function isFeatureEnabledForUser(userId: string, feature: string, percentage: number): boolean {
  const hash = hashUserId(userId); // Deterministic hash
  return (hash % 100) < percentage;
}

// Usage
if (isFeatureEnabledForUser(currentUser.uid, 'aiCompanions', rolloutPercentages.aiCompanions)) {
  showAICompanions();
}
```

---

## 4. Data Seeding & Initial Setup

### 4.1 Admin Accounts Creation

**Script:** `scripts/seed-admin-accounts.ts`

```typescript
import * as admin from 'firebase-admin';

admin.initializeApp();

const adminAccounts = [
  {
    email: 'support@avalo.app',
    displayName: 'Support Team',
    role: 'support_agent',
  },
  {
    email: 'safety@avalo.app',
    displayName: 'Safety Team',
    role: 'safety_admin',
  },
  {
    email: 'admin@avalo.app',
    displayName: 'Super Admin',
    role: 'super_admin',
  },
];

async function seedAdmins() {
  for (const account of adminAccounts) {
    const userRecord = await admin.auth().createUser({
      email: account.email,
      password: generateSecurePassword(),
      displayName: account.displayName,
    });
    
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: account.role,
    });
    
    await admin.firestore().collection('adminUsers').doc(userRecord.uid).set({
      adminId: userRecord.uid,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Created admin: ${account.email} (${account.role})`);
  }
}

seedAdmins();
```

**Run:**
```bash
npx ts-node scripts/seed-admin-accounts.ts
```

### 4.2 Help Articles Seeding

**Script:** `scripts/seed-help-articles.ts`

```typescript
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const helpArticles = [
  // EN Articles
  {
    category: 'GETTING_STARTED',
    locale: 'en-US',
    slug: 'how-avalo-works',
    title: 'How Avalo Works',
    shortSummary: 'Learn the basics of Avalo dating platform',
    bodyMarkdown: `# How Avalo Works\n\nAvalo is a premium dating platform...`,
    isFeatured: true,
  },
  {
    category: 'PAID_CHAT',
    locale: 'en-US',
    slug: 'understanding-paid-chat',
    title: 'Understanding Paid Chat',
    shortSummary: 'How paid conversations work on Avalo',
    bodyMarkdown: `# Paid Chat\n\nPaid chat allows creators to monetize...`,
    isFeatured: true,
  },
  // PL Articles
  {
    category: 'GETTING_STARTED',
    locale: 'pl-PL',
    slug: 'jak-dziala-avalo',
    title: 'Jak działa Avalo',
    shortSummary: 'Poznaj podstawy platformy randkowej Avalo',
    bodyMarkdown: `# Jak działa Avalo\n\nAvalo to platforma randkowa premium...`,
    isFeatured: true,
  },
  // Add more articles...
];

async function seedHelpArticles() {
  const db = admin.firestore();
  
  for (const article of helpArticles) {
    const articleId = uuidv4();
    await db.collection('helpArticles').doc(articleId).set({
      articleId,
      ...article,
      isSearchable: true,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    
    console.log(`Created article: ${article.slug} (${article.locale})`);
  }
}

seedHelpArticles();
```

### 4.3 Education Cards Seeding

**Script:** `scripts/seed-education-cards.ts`

```typescript
const educationCards = [
  {
    context: 'PAID_CHAT',
    locale: 'en-US',
    title: 'About Paid Chat',
    body: 'Creators can earn from conversations. Messages cost tokens.',
    ctaLabel: 'Learn More',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'understanding-paid-chat' },
    enabled: true,
    order: 0,
  },
  {
    context: 'PANIC_BUTTON',
    locale: 'en-US',
    title: 'Your Safety Matters',
    body: 'Press the panic button if you feel unsafe. We\'ll respond immediately.',
    ctaLabel: 'Safety Tips',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'safety-tips' },
    enabled: true,
    order: 0,
  },
  // Add more cards...
];

async function seedEducationCards() {
  const db = admin.firestore();
  
  for (const card of educationCards) {
    const cardId = uuidv4();
    await db.collection('educationCards').doc(cardId).set({
      cardId,
      ...card,
    });
    
    console.log(`Created education card: ${card.context} (${card.locale})`);
  }
}

seedEducationCards();
```

### 4.4 Token Packages Initialization

**Already defined in PACK types. Verify in Firestore:**

**Collection:** `tokenPackages`

```typescript
const tokenPackages = [
  { packageId: 'pack_50', tokens: 50, pricePLN: 10.00, priceUSD: 2.49 },
  { packageId: 'pack_100', tokens: 100, pricePLN: 19.00, priceUSD: 4.49 },
  { packageId: 'pack_250', tokens: 250, pricePLN: 45.00, priceUSD: 9.99 },
  { packageId: 'pack_500', tokens: 500, pricePLN: 85.00, priceUSD: 19.99 },
  { packageId: 'pack_1000', tokens: 1000, pricePLN: 160.00, priceUSD: 39.99 },
];

// Seed to Firestore
```

**⚠️ DO NOT CHANGE THESE VALUES** (per task constraints).

### 4.5 Test Users Setup

**Script:** `scripts/seed-test-users.ts`

```typescript
const testUsers = [
  // Standard user
  {
    email: 'user@test.avalo.app',
    displayName: 'Test User',
    role: 'user',
    walletBalance: 100,
  },
  // Royal user
  {
    email: 'royal@test.avalo.app',
    displayName: 'Royal Test',
    role: 'user',
    accountTier: 'ROYAL',
    walletBalance: 500,
  },
  // Creator
  {
    email: 'creator@test.avalo.app',
    displayName: 'Creator Test',
    role: 'user',
    isCreator: true,
    creatorMode: 'FULL',
    walletBalance: 1000,
  },
];

async function seedTestUsers() {
  for (const user of testUsers) {
    const userRecord = await admin.auth().createUser({
      email: user.email,
      password: 'TestPassword123!',
      displayName: user.displayName,
    });
    
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: user.email,
      displayName: user.displayName,
      walletBalance: user.walletBalance || 0,
      accountTier: user.accountTier || 'STANDARD',
      isCreator: user.isCreator || false,
      creatorMode: user.creatorMode || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Created test user: ${user.email}`);
  }
}

seedTestUsers();
```

---

## 5. Pre-Launch Checklist

This checklist must be **100% GREEN** before submitting apps to stores or enabling production traffic.

### 5.1 Support System

#### User Support Tickets
- [ ] User can create ticket from mobile app
- [ ] Ticket appears in admin console
- [ ] Admin can reply to ticket
- [ ] User receives notification of reply
- [ ] User can close ticket
- [ ] Closed ticket shows "CLOSED" status

#### Help Center
- [ ] Help articles load on mobile
- [ ] Help articles load on web (if public help center exists)
- [ ] Search works (finds articles by keyword)
- [ ] Articles display correctly (markdown rendering)
- [ ] Helpful/Not Helpful voting works

#### Admin Console
- [ ] Admin login works (email/password)
- [ ] Admin dashboard shows metrics
- [ ] Ticket list shows all tickets
- [ ] Ticket filters work (status, priority, type)
- [ ] Admin can assign ticket to self
- [ ] Admin can update ticket priority
- [ ] Admin can resolve ticket

### 5.2 Safety System

#### Panic Button
- [ ] Panic button visible in app
- [ ] Pressing panic button creates ticket
- [ ] Panic ticket marked as CRITICAL priority
- [ ] Panic ticket has `fromPanic: true` flag
- [ ] Safety team receives notification immediately

#### Safety Escalation
- [ ] Safety ticket classified with severity (HIGH/CRITICAL)
- [ ] Safety keyword detection works
- [ ] Risk log created when safety ticket created
- [ ] Risk score updated for user

#### Account Actions
- [ ] Admin can warn user from ticket detail
- [ ] Admin can freeze account (temporary)
- [ ] Admin can ban account (permanent)
- [ ] User receives notification of action
- [ ] Account action logged in audit

### 5.3 Payments & Payouts

#### Token Purchase (Sandbox)
- [ ] User can view token packages
- [ ] User can select package
- [ ] Stripe payment sheet opens (test mode)
- [ ] Test card `4242 4242 4242 4242` succeeds
- [ ] Tokens added to wallet
- [ ] Transaction logged in `transactions` collection
- [ ] User receives confirmation notification

#### IAP Purchase (Sandbox)
- [ ] iOS: Can purchase tokens via App Store (sandbox)
- [ ] Android: Can purchase tokens via Google Play (sandbox)
- [ ] Receipt validated server-side
- [ ] Tokens added to wallet
- [ ] Transaction logged

#### Payout Request (Sandbox)
- [ ] Creator can request payout
- [ ] Payout request appears in admin console
- [ ] Admin can approve payout
- [ ] Stripe transfer created (test mode)
- [ ] Creator balance deducted
- [ ] Creator receives payout confirmation
- [ ] Payout logged in audit

### 5.4 Meetings & Events

#### Calendar Booking
- [ ] User can view creator's available slots
- [ ] User can book meeting (tokens deducted)
- [ ] Creator receives booking notification
- [ ] Meeting appears in both calendars
- [ ] **Cancellation > 24h:** Full refund (100%)
- [ ] **Cancellation < 24h:** Partial refund (50% user, 50% creator)
- [ ] **No-show:** Creator keeps full amount
- [ ] Refund logic verified with test bookings

#### Events
- [ ] Creator can create event
- [ ] Event appears in discovery
- [ ] User can purchase event ticket
- [ ] Tokens deducted (80% creator, 20% platform)
- [ ] Ticket appears in user's "My Events"
- [ ] **Event cancellation by creator:** Full refund to all attendees
- [ ] **Event cancellation by user:** Refund per event's refund policy
- [ ] Revenue split verified: 80% creator, 20% platform

### 5.5 AI Companions (If Enabled)

#### AI Companion Creation
- [ ] User can create AI companion
- [ ] AI profile saved correctly
- [ ] AI appears in user's AI list

#### AI Chat
- [ ] User can start chat with AI
- [ ] AI responds within 5 seconds
- [ ] Chat uses bucket billing (50 tokens per 100 messages)
- [ ] Token deduction happens at bucket boundaries
- [ ] Chat history persists
- [ ] AI moderation filters inappropriate content

### 5.6 Core Features

#### Authentication
- [ ] User can sign up (email/password)
- [ ] User receives email verification
- [ ] User can log in
- [ ] User can reset password
- [ ] User can log out

#### Profile
- [ ] User can edit profile (name, bio, photos)
- [ ] Profile photos upload correctly
- [ ] Profile updates appear immediately
- [ ] Other users see updated profile

#### Discovery & Matching
- [ ] User sees profiles in discovery feed
- [ ] Swipe right/left works
- [ ] Matches appear in match list
- [ ] Match opens chat

#### Chat
- [ ] User can send message
- [ ] Message appears for recipient
- [ ] Message notifications work
- [ ] **Free chat:** First X messages free
- [ ] **Paid chat:** Tokens deducted per message (if creator enabled)
- [ ] Unread message badges accurate

#### Notifications
- [ ] Push notifications work (iOS + Android)
- [ ] In-app notifications work
- [ ] Notification settings can be toggled

---

## 6. Post-Launch Monitoring & Incident Response

### 6.1 Dashboards to Monitor

#### Firebase Console
- **Authentication:** User sign-ups, active users
- **Firestore:** Read/write operations, errors
- **Functions:** Invocations, errors, latency
- **Storage:** Upload volume, bandwidth
- **Hosting:** Traffic, errors

**Alerts to Configure:**
- Function error rate > 5%
- Function latency > 5s (p95)
- Firestore write errors > 1%

#### Stripe Dashboard
- **Payments:** Successful charges, failed charges
- **Payouts:** Transfer volume, failures
- **Disputes:** Chargebacks (should be near 0)
- **Radar:** Fraud alerts

**Alerts to Configure:**
- Failed payment rate > 10%
- Chargeback rate > 0.5%
- Fraud score > High

#### Crash Reporting (Sentry or Firebase Crashlytics)
- **Mobile:** App crashes, ANRs (Android Not Responding)
- **Web:** JavaScript errors, unhandled exceptions

**Alerts to Configure:**
- Crash-free rate < 99%
- New error introduced in latest release

#### Custom Metrics (Firestore or Analytics)
- **Support:** Ticket creation rate, resolution time, SLA breaches
- **Safety:** Panic button presses, safety tickets
- **Revenue:** Token purchases, payouts, revenue split
- **Engagement:** DAU/MAU, chat messages, meetings booked

### 6.2 Incident Response Runbook

#### Incident Severity Levels

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| **P0 - Critical** | Total outage or data loss | Immediate | App completely down, payment system broken |
| **P1 - High** | Major feature broken | < 1 hour | Chat not working, login failing for >10% users |
| **P2 - Medium** | Minor feature degraded | < 4 hours | Slow loading, UI glitch |
| **P3 - Low** | Cosmetic issue | < 24 hours | Typo, minor visual bug |

#### P0 - Critical Outage Response

**Immediate Actions (0-5 minutes):**
1. **Acknowledge incident** in team Slack/Discord
2. **Assess scope:** How many users affected?
3. **Enable kill switch** if needed:
   ```bash
   # Firebase Console > Firestore > systemConfig/emergencyControls
   # Set maintenanceMode: true
   ```
4. **Post status update** on status page (if exists) or social media

**Diagnosis (5-15 minutes):**
5. **Check Firebase Logs:**
   ```bash
   firebase functions:log --project avalo-production
   ```
6. **Check Firestore status** (Firebase Console)
7. **Check Stripe status** (status.stripe.com)
8. **Identify root cause**

**Mitigation (15-30 minutes):**
9. **Apply hotfix** or **rollback to previous version**:
   ```bash
   # Rollback functions
   firebase functions:delete <broken-function>
   firebase deploy --only functions:<previous-function> --project avalo-production
   ```
10. **Verify fix** in production
11. **Disable maintenance mode**

**Post-Incident (30 minutes - 24 hours):**
12. **Write incident report** (what happened, why, how fixed, how to prevent)
13. **Review incident** with team
14. **Implement prevention measures**

#### P1 - Payment Outage Response

**Symptoms:**
- Users report failed payments
- Stripe webhook errors in logs
- Token purchases not completing

**Response:**
1. **Check Stripe Dashboard** for service issues
2. **Check webhook endpoint** is reachable
3. **Verify webhook secret** matches
4. **Check Cloud Function** handling webhook
5. **If unfixable immediately:** Enable `disablePayments` kill switch
6. **Communicate to users:** "Payment system temporarily unavailable"
7. **Fix and re-enable**

#### P1 - Payout Failure Response

**Symptoms:**
- Creators report payout failures
- Stripe transfer errors

**Response:**
1. **Check creator's Stripe Connect account** status
2. **Check payout logs** for error details
3. **If systematic issue:** Enable `disablePayouts` kill switch
4. **Contact affected creators** via support ticket
5. **Manually process payouts** if needed
6. **Fix root cause and re-enable**

#### Safety Incident (Inappropriate AI Content)

**Symptoms:**
- User reports AI companion generating offensive/harmful content

**Response:**
1. **Immediately disable AI for that user:**
   ```typescript
   await updateDoc(doc(firestore, 'users', userId), {
     aiCompanionsDisabled: true
   });
   ```
2. **Review chat logs**
3. **Update AI moderation filters**
4. **Report to AI provider** if bypass detected
5. **If widespread:** Enable `disableAI` kill switch
6. **Fix moderation and re-enable gradually**

---

## Summary

This playbook provides the technical foundation for launching Avalo safely and reliably. Key principles:

1. **Always test in staging first**
2. **Deploy incrementally** (backend → web → mobile)
3. **Monitor closely post-deploy** (24-48 hours)
4. **Have rollback plans ready**
5. **Use kill switches proactively** if unsure
6. **Document everything**
7. **Respect constraints:** Do not change tokenomics, pricing, or revenue splits

**Next Steps After PACK 351:**
- Complete PACK 300B implementation (backend, admin console, web help)
- Run full pre-launch checklist
- Deploy to staging and verify 100%
- Deploy to production during low-traffic window
- Monitor for 48 hours before public announcement

---

**Document Owner:** PACK 351 Team  
**Review Cadence:** Before each major release  
**Last Updated:** 2025-12-14
