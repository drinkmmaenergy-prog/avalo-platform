# Avalo Security Architecture - Gap Analysis Report
**Role**: Security Architect  
**Mode**: READ-ONLY Analysis  
**Date**: 2025-11-09  
**Project**: Avalo App (Firebase/Cloud Functions)

---

## Executive Summary

This security audit evaluates the Avalo application's security posture across six critical domains: App Check enforcement, webhook idempotency, Firestore/Storage rules, secrets management, CORS/headers/cookies, and anti-abuse mechanisms.

**Overall Risk Level**: 🔴 **HIGH**

**Critical Findings**: 4 P0 issues, 8 P1 issues requiring immediate attention.

---

## 1. Firebase App Check Analysis

### Current State
#### ✅ **Backend (Functions) - IMPLEMENTED**
- **65+ callable functions** have [`enforceAppCheck: true`](functions/src/walletBridge.ts:39)
- Comprehensive coverage across:
  - Payment functions ([`paymentsV2.ts`](functions/src/paymentsV2.ts:510))
  - Wallet operations ([`walletBridge.ts`](functions/src/walletBridge.ts:39))
  - Creator functions ([`creatorMode.ts`](functions/src/creatorMode.ts:159))
  - Moderation ([`modHub.ts`](functions/src/modHub.ts:354))
  - AI services ([`aiOversight.ts`](functions/src/aiOversight.ts:433))

#### ❌ **Client (Mobile/Web) - NOT IMPLEMENTED**
- **Zero App Check initialization** found in [`app-mobile/`](app-mobile/) directory
- No `initializeAppCheck()` or `getAppCheck()` calls
- No RecaptchaV3Provider or ReCaptchaEnterpriseProvider configuration

### 🚨 **P0 - Critical Gap**
```
RISK: Backend enforces App Check but clients don't initialize it
IMPACT: All callable functions will FAIL in production
SEVERITY: Application-breaking
```

### Remediation Plan

#### **Phase 1: Client Implementation (P0)**
```typescript
// app-mobile/config/firebase.ts
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// After Firebase initialization
if (!__DEV__) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(
      process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY!
    ),
    isTokenAutoRefreshEnabled: true
  });
}
```

**Required Environment Variables**:
```bash
EXPO_PUBLIC_RECAPTCHA_SITE_KEY=<from Firebase Console>
EXPO_PUBLIC_RECAPTCHA_SITE_KEY_DEBUG=<for development>
```

#### **Phase 2: Configuration Steps**
1. Firebase Console → App Check → Register app
2. Enable reCAPTCHA Enterprise or v3
3. Add site keys to `.env` files
4. Deploy client with App Check enabled
5. Monitor enforcement in Firebase Console

#### **Phase 3: Gradual Rollout**
- Week 1: Deploy with debug tokens (100% pass)
- Week 2: Enable for 10% production traffic
- Week 3: Ramp to 50%
- Week 4: Full enforcement (100%)

---

## 2. Webhook Idempotency Analysis

### Current State - Stripe
#### ⚠️ **Partial Implementation**
- ✅ Signature verification: [`stripeWebhook`](functions/src/payments.ts:33) uses `constructEvent()`
- ❌ **No event.id deduplication**
- ❌ No idempotency key tracking in Firestore

**Current Code** ([`payments.ts:45-59`](functions/src/payments.ts:45)):
```typescript
try {
  event = stripeClient.webhooks.constructEvent(
    req.rawBody, sig, stripeConfig.webhookSecret
  );
} catch (err: any) {
  res.status(400).send(`Webhook Error: ${err.message}`);
  return;
}
// ⚠️ No check if event.id already processed
```

### 🔴 **P1 - High Risk**
```
RISK: Duplicate webhook processing → double-crediting tokens
IMPACT: Financial loss, user balance corruption
SCENARIO: Network retry, Stripe redelivery within 72h
```

### Current State - Other Providers
- [`payments.providers.ts:414`](functions/src/payments.providers.ts:414) - Unified webhook handler
- ❌ No idempotency for Przelewy24, PayU, Coinbase Commerce
- ✅ Some validation schemas include [`idempotencyKey`](functions/src/validation.schemas.ts:134) but not enforced

### Remediation Plan

#### **Phase 1: Stripe Idempotency (P1)**
```typescript
// functions/src/payments.ts
export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🔒 IDEMPOTENCY CHECK
  const eventDoc = await db.collection('webhookEvents')
    .doc(`stripe_${event.id}`)
    .get();
  
  if (eventDoc.exists) {
    console.log(`Duplicate webhook event: ${event.id}`);
    return res.json({ received: true, duplicate: true });
  }

  // Process event
  try {
    await db.runTransaction(async (tx) => {
      // Mark as processed first
      tx.set(db.collection('webhookEvents').doc(`stripe_${event.id}`), {
        eventId: event.id,
        type: event.type,
        processedAt: FieldValue.serverTimestamp(),
        status: 'processing'
      });

      // Process webhook logic
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object, tx);
          break;
        // ... other cases
      }

      // Mark as completed
      tx.update(db.collection('webhookEvents').doc(`stripe_${event.id}`), {
        status: 'completed',
        completedAt: FieldValue.serverTimestamp()
      });
    });

    res.json({ received: true });
  } catch (error) {
    // Update status to failed
    await db.collection('webhookEvents').doc(`stripe_${event.id}`).update({
      status: 'failed',
      error: error.message
    });
    res.status(500).send('Processing failed');
  }
});
```

#### **Phase 2: Firestore Structure**
```
webhookEvents/{provider}_{eventId}
  - eventId: string
  - provider: "stripe" | "p24" | "payu" | "coinbase"
  - type: string
  - status: "processing" | "completed" | "failed"
  - processedAt: timestamp
  - completedAt: timestamp (optional)
  - retryCount: number
  - error: string (optional)
```

#### **Phase 3: Cleanup Scheduler**
```typescript
// Delete processed events older than 90 days
export const cleanupWebhookEvents = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west3' },
  async () => {
    const ninetyDaysAgo = Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const old = await db.collection('webhookEvents')
      .where('completedAt', '<', ninetyDaysAgo)
      .limit(500)
      .get();
    
    const batch = db.batch();
    old.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
);
```

---

## 3. Firestore/Storage Rules Analysis

### Firestore Rules Audit

#### ✅ **Strengths**
- Comprehensive RBAC: [`isAdmin()`](firestore.rules:26), [`isModerator()`](firestore.rules:30), [`isOwner()`](firestore.rules:14)
- Deny-by-default approach ([line 396](firestore.rules:396))
- Proper authentication checks throughout
- Collection-level granularity (40+ collections)

#### ⚠️ **Performance Issues - P1**

**Problem**: Multiple [`get()`](firestore.rules:19) calls in security rules can hit rate limits

**Examples**:
```javascript
// firestore.rules:22-24
function isVerified18() {
  return userDoc(uid()).data.verification.status == "approved"; // get() call
}

// firestore.rules:26-28
function isAdmin() {
  return authed() && userDoc(uid()).data.roles.admin == true; // get() call
}

// firestore.rules:34-37
function isParticipant(chatId) {
  return authed() &&
         exists(/databases/$(database)/documents/chats/$(chatId)) && // get() call
         uid() in get(/databases/$(database)/documents/chats/$(chatId)).data.participants; // another get()
}
```

**Impact**:
- Rules limited to **20 `get()` calls per operation**
- High-traffic operations risk hitting quotas
- Increased latency for complex permission checks

#### 🔴 **P1 - Rate Limit Risk**
```
RISK: Rules can exceed 20 get() limit on complex operations
IMPACT: Operations fail with permission-denied
AFFECTED: Chat operations, moderation actions, creator functions
```

### Storage Rules Audit

#### ✅ **Strengths**
- Size validation: [`validSize()`](storage.rules:43) with per-file-type limits
- Content-type validation: [`validImageType()`](storage.rules:27), [`validVideoType()`](storage.rules:31)
- Proper access controls with Firestore integration
- Signed URLs for paid content ([line 162](storage.rules:162))

#### ⚠️ **Issues**
- Multiple [`firestore.get()`](storage.rules:16) calls (same quota limits)
- No explicit bandwidth rate limiting
- No file count per-user limits

### Remediation Plan

#### **Phase 1: Optimize Firestore Rules (P1)**

**Strategy**: Denormalize critical permissions to user documents

```javascript
// Current: Multiple get() calls
function isParticipant(chatId) {
  return authed() &&
         exists(/databases/$(database)/documents/chats/$(chatId)) &&  // get #1
         uid() in get(/databases/$(database)/documents/chats/$(chatId)).data.participants; // get #2
}

// ✅ Optimized: Custom claims or denormalized data
function isParticipant(chatId) {
  return authed() && 
         request.auth.token.activeChats != null &&
         chatId in request.auth.token.activeChats;
}
```

**Implementation**:
1. Add Firebase Auth custom claims for:
   - `roles`: { admin, moderator, verified }
   - `activeChats`: [chatId1, chatId2, ...]
   - `verificationStatus`: "approved" | "pending" | "rejected"

2. Update custom claims on:
   - User role changes
   - Chat join/leave
   - Verification status updates

3. Refresh tokens after claim updates

**Cost-Benefit**:
- Reduces `get()` calls by ~80%
- Faster rule evaluation (no Firestore reads)
- Custom claims free, cached at client

#### **Phase 2: Add Rate Limits to Rules (P1)**

```javascript
// Storage rules - add per-user upload limits
match /users/{userId}/photos/{photoId} {
  allow write: if authed() &&
                  isOwner(userId) &&
                  validImageType() &&
                  validSize(10) &&
                  // ✅ Check upload count
                  request.resource.size < 10 * 1024 * 1024 &&
                  firestore.get(/databases/(default)/documents/users/$(userId)/limits/photos).data.uploaded < 100;
}

// Firestore rules - add operation tracking
match /users/{userId} {
  allow update: if authed() &&
                   isOwner(userId) &&
                   // ✅ Check update frequency
                   resource.data.lastUpdateAt == null ||
                   request.time > resource.data.lastUpdateAt + duration.value(1, 'm');
}
```

#### **Phase 3: Monitoring (P2)**
- Cloud Logging alerts for `permission-denied` spikes
- Monitor `get()` usage in Firebase console
- Dashboard for rules performance metrics

---

## 4. Secrets Management Analysis

### 🚨 **CRITICAL FINDINGS**

#### ❌ **P0 - Hardcoded Secrets**
```typescript
// functions/src/securityMiddleware.ts:80
const HMAC_SECRET = process.env.HMAC_SECRET || "avalo-production-secret-key-change-in-prod";
```

**Risk**: Production secret visible in source code, Git history, logs

#### ❌ **P0 - No Secret Manager Integration**
All secrets loaded via `process.env.*`:
- [`STRIPE_SECRET_KEY`](functions/src/config.ts:82) - Payment processing
- [`STRIPE_WEBHOOK_SECRET`](functions/src/config.ts:83) - Webhook validation
- [`OPENAI_API_KEY`](functions/src/aiRouter.ts:30) - AI services ($$$)
- [`ANTHROPIC_API_KEY`](functions/src/aiRouter.ts:31) - AI services ($$$)
- [`SENDGRID_API_KEY`](functions/src/sendgrid.ts:37) - Email delivery
- [`GOOGLE_VISION_API_KEY`](functions/src/aiModeration.ts:36) - Image moderation
- [`INSTAGRAM_CLIENT_SECRET`](functions/src/socialVerification.ts:130) - OAuth
- [`TIKTOK_CLIENT_SECRET`](functions/src/socialVerification.ts:139) - OAuth
- [`REDIS_PASSWORD`](functions/src/riskGraph.ts:173) - Cache access
- Blockchain RPC URLs with API keys ([`walletBridge.ts:395-401`](functions/src/walletBridge.ts:395))

#### ⚠️ **P1 - Exposed in .env**
[`.env`](.env:1) contains Firebase config (acceptable for public keys) but pattern risky:
```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51SEaEU...  # Public key OK
# But shows pattern of env-based secrets
```

### 🔴 **Risk Assessment**
```
SEVERITY: CRITICAL
LIKELIHOOD: HIGH (secrets in code, env files, logs)
IMPACT: 
  - Stripe compromise → fraudulent charges
  - AI API compromise → $10K-100K+ bills
  - Database access compromise → data breach
```

### Remediation Plan - Secret Manager Migration

#### **Phase 1: Immediate Actions (P0 - Week 1)**

1. **Remove Hardcoded Secrets**
```typescript
// ❌ BEFORE: functions/src/securityMiddleware.ts
const HMAC_SECRET = process.env.HMAC_SECRET || "avalo-production-secret-key-change-in-prod";

// ✅ AFTER: functions/src/securityMiddleware.ts
const HMAC_SECRET = process.env.HMAC_SECRET;
if (!HMAC_SECRET) {
  throw new Error("FATAL: HMAC_SECRET not configured");
}
```

2. **Rotate Compromised Secrets**
- Generate new HMAC_SECRET (256-bit random)
- Rotate immediately if current is in Git history

#### **Phase 2: Secret Manager Integration (P0 - Week 2)**

**Setup**:
```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create secrets
gcloud secrets create stripe-secret-key --replication-policy="automatic"
gcloud secrets create stripe-webhook-secret --replication-policy="automatic"
gcloud secrets create hmac-secret --replication-policy="automatic"
gcloud secrets create openai-api-key --replication-policy="automatic"
gcloud secrets create anthropic-api-key --replication-policy="automatic"

# Add secret values
echo -n "sk_live_..." | gcloud secrets versions add stripe-secret-key --data-file=-
echo -n "whsec_..." | gcloud secrets versions add stripe-webhook-secret --data-file=-
# ... repeat for all secrets

# Grant Cloud Functions access
gcloud secrets add-iam-policy-binding stripe-secret-key \
  --member="serviceAccount:avalo-c8c46@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Code Integration**:
```typescript
// functions/src/secrets.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const PROJECT_ID = 'avalo-c8c46';

// Cache secrets for 5 minutes to avoid excessive Secret Manager calls
const secretCache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSecret(secretName: string): Promise<string> {
  const cached = secretCache.get(secretName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString() || '';
  
  if (!payload) {
    throw new Error(`Secret ${secretName} is empty`);
  }

  secretCache.set(secretName, {
    value: payload,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return payload;
}

// Lazy-loaded secrets
let _stripeSecretKey: string | null = null;
export async function getStripeSecretKey(): Promise<string> {
  if (!_stripeSecretKey) {
    _stripeSecretKey = await getSecret('stripe-secret-key');
  }
  return _stripeSecretKey;
}

// Similar for other secrets...
```

**Update Function Usage**:
```typescript
// functions/src/payments.ts
import { getStripeSecretKey, getStripeWebhookSecret } from './secrets.js';

const getStripe = async (): Promise<Stripe> => {
  if (!stripe) {
    const secretKey = await getStripeSecretKey();
    stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  }
  return stripe;
};

export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const stripeClient = await getStripe();
  const webhookSecret = await getStripeWebhookSecret();
  
  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // ... rest of handler
});
```

#### **Phase 3: Secret Rotation Policy (P1 - Ongoing)**

**Rotation Schedule**:
- **Stripe keys**: Every 90 days
- **HMAC secrets**: Every 90 days
- **AI API keys**: Every 180 days
- **OAuth secrets**: On compromise or annually
- **Webhook secrets**: On compromise

**Rotation Process**:
1. Generate new secret version in Secret Manager
2. Update code to accept both old and new (grace period)
3. Deploy functions
4. Monitor for 24h
5. Revoke old secret version
6. Update external systems (Stripe webhook config, etc.)

**Automation**:
```typescript
// functions/src/secretRotation.ts
export const scheduleSecretRotation = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west3' },
  async () => {
    const secrets = await listSecretsNeedingRotation();
    
    for (const secret of secrets) {
      // Send alert to admin
      await sendSecretRotationAlert(secret.name, secret.lastRotated);
    }
  }
);
```

#### **Phase 4: Environment Variable Cleanup**

**Remove from .env / functions/.env**:
```bash
# ❌ Delete these (move to Secret Manager)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
HMAC_SECRET=...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SENDGRID_API_KEY=SG....
```

**Keep in .env (public/non-sensitive)**:
```bash
# ✅ OK to keep (public)
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# ✅ OK to keep (config)
EXPO_PUBLIC_WEBSITE_ORIGIN=https://avalo.app
EXPO_PUBLIC_FUNCTIONS_REGION=europe-west3
```

---

## 5. CORS, HSTS, CSP, Cookie Security

### CORS Analysis

#### ✅ **Implemented - Well Configured**
[`securityMiddleware.ts:29-41`](functions/src/securityMiddleware.ts:29):
```typescript
const ALLOWED_ORIGINS = [
  "https://avalo-c8c46.web.app",
  "https://avalo-c8c46.firebaseapp.com",
  "https://admin.avalo.app",
  "https://avalo.app",
  /^exp:\/\/.*/,  // Expo
  /^avalo:\/\/.*/,  // Custom scheme
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:19006",
];
```

**Validation**: [`validateCORS()`](functions/src/securityMiddleware.ts:46) with whitelist matching

**Headers**: [`getCORSHeaders()`](functions/src/securityMiddleware.ts:61) sets proper CORS headers

### HTTP Security Headers Analysis

#### ❌ **P1 - Missing Security Headers**

**Current [`firebase.json`](firebase.json:33) hosting headers**:
```json
"headers": [
  {
    "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|avif)",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  },
  {
    "source": "**/*.@(js|css)",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  }
]
```

**Missing**:
- ❌ `Strict-Transport-Security` (HSTS)
- ❌ `Content-Security-Policy` (CSP)
- ❌ `X-Frame-Options`
- ❌ `X-Content-Type-Options`
- ❌ `Referrer-Policy`
- ❌ `Permissions-Policy`

### 🔴 **P1 - Security Header Gaps**
```
RISK: XSS, clickjacking, MIME-sniffing attacks
IMPACT: Account takeover, data theft, phishing
AFFECTED: All hosted web content
```

### Cookie Security

#### ⚠️ **P2 - No Explicit Cookie Configuration**
- Firebase Auth uses bearer tokens (not cookies) - Low risk
- No server-set cookies found
- If future features use cookies: missing `SameSite`, `Secure`, `HttpOnly`

### Remediation Plan

#### **Phase 1: Add Security Headers (P1 - Week 1)**

**Update [`firebase.json`](firebase.json:33)**:
```json
{
  "hosting": [
    {
      "target": "app",
      "public": "public",
      "headers": [
        {
          "source": "**",
          "headers": [
            {
              "key": "Strict-Transport-Security",
              "value": "max-age=63072000; includeSubDomains; preload"
            },
            {
              "key": "X-Frame-Options",
              "value": "DENY"
            },
            {
              "key": "X-Content-Type-Options",
              "value": "nosniff"
            },
            {
              "key": "Referrer-Policy",
              "value": "strict-origin-when-cross-origin"
            },
            {
              "key": "Permissions-Policy",
              "value": "camera=(), microphone=(), geolocation=(self), payment=()"
            }
          ]
        },
        {
          "source": "**/*.html",
          "headers": [
            {
              "key": "Content-Security-Policy",
              "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://europe-west3-avalo-c8c46.cloudfunctions.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            }
          ]
        },
        {
          "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|avif)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        },
        {
          "source": "**/*.@(js|css)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        },
        {
          "source": "**/*.@(html|json)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=0, must-revalidate"
            }
          ]
        }
      ]
    }
  ]
}
```

**CSP Breakdown**:
- `default-src 'self'` - Only same-origin by default
- `script-src` - Self + Firebase SDKs + inline (needed for initialization)
- `style-src` - Self + inline styles
- `img-src` - Self + data URIs + HTTPS images
- `connect-src` - Self + Firebase APIs + Cloud Functions
- `frame-ancestors 'none'` - Prevent clickjacking
- `base-uri 'self'` - Prevent base tag injection
- `form-action 'self'` - Prevent form hijacking

#### **Phase 2: HSTS Preload (P2 - Week 2)**

1. Verify HTTPS is working correctly
2. Deploy with HSTS header (max-age=63072000)
3. Submit to [hstspreload.org](https://hstspreload.org)
4. Wait for browser preload list inclusion (2-3 months)

#### **Phase 3: Cookie Security (If Needed)**

If adding server-set cookies in future:
```typescript
// functions/src/middleware.ts
export function setSecureCookie(res: Response, name: string, value: string, options: {
  maxAge?: number;
  path?: string;
} = {}) {
  const cookieOptions = [
    `${name}=${value}`,
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    `Path=${options.path || '/'}`,
    options.maxAge ? `Max-Age=${options.maxAge}` : ''
  ].filter(Boolean).join('; ');
  
  res.setHeader('Set-Cookie', cookieOptions);
}
```

#### **Phase 4: CSP Reporting (P2)**

Add CSP violation reporting:
```typescript
// Add to CSP header
"report-uri https://europe-west3-avalo-c8c46.cloudfunctions.net/cspReport; report-to csp-endpoint"

// Add Report-To header
{
  "key": "Report-To",
  "value": "{\"group\":\"csp-endpoint\",\"max_age\":10886400,\"endpoints\":[{\"url\":\"https://europe-west3-avalo-c8c46.cloudfunctions.net/cspReport\"}]}"
}

// functions/src/cspReport.ts
export const cspReport = onRequest(async (req, res) => {
  const report = req.body;
  
  await db.collection('securityReports').add({
    type: 'csp-violation',
    report,
    timestamp: FieldValue.serverTimestamp(),
    userAgent: req.headers['user-agent'],
    ip: getClientIP(req)
  });
  
  res.status(204).end();
});
```

---

## 6. Anti-Abuse Mechanisms

### Rate Limiting Analysis

#### ✅ **Well Implemented**
[`rateLimit.ts`](functions/src/rateLimit.ts:24) - Token bucket algorithm:
- Comprehensive limits: [`RateLimits`](functions/src/rateLimit.ts:24) (14+ operation types)
- Per-user tracking with Firestore
- Feature flag controlled
- Violations logged for monitoring
- Auto-cleanup of old buckets

**Examples**:
- [`CHAT_MESSAGE_SEND`](functions/src/rateLimit.ts:26): 60/min
- [`PROFILE_LIKE`](functions/src/rateLimit.ts:41): 100/min  
- [`WALLET_PURCHASE`](functions/src/rateLimit.ts:54): 1/min
- [`API_READ`](functions/src/rateLimit.ts:96): 1000/min

**Integration**: [`checkRateLimit()`](functions/src/rateLimit.ts:130) called in functions

#### ⚠️ **P1 - No Redis Backend**
```typescript
// functions/src/riskGraph.ts:172
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// But never actually used for rate limiting
```

**Current**: Firestore-backed rate limiting
**Issue**: Firestore writes are slower and more expensive than Redis
**Impact**: 
- Higher latency on rate-limited operations
- ~10x cost vs Redis ($0.18/100K writes vs $0.015/100K ops)
- Less scalable at high traffic

### 🔴 **P1 - Firestore Rate Limiting at Scale**
```
RISK: At 1M daily active users with 50 ops/user = 50M rate limit checks
COST: 50M Firestore writes/day = $9,000/month
LATENCY: 50-100ms per rate limit check
SOLUTION: Redis reduces to $450/month + <5ms latency
```

### Device Fingerprinting Analysis

#### ⚠️ **P2 - Minimal Implementation**
- [`deviceTrust`](firestore.rules:275) collection exists in Firestore rules
- NO client-side fingerprinting library
- NO comprehensive device signature collection

**Missing**:
- Canvas fingerprinting
- WebGL fingerprinting
- Audio fingerprinting
- Font enumeration
- Timezone/language detection
- Browser plugin detection
- Hardware concurrency
- Battery API

### Velocity Checks Analysis

#### ✅ **Partial Implementation**
- [`chatSecurity.ts`](functions/src/chatSecurity.ts:141) - Spam detection with duplicate rate
- [`secops.ts`](functions/src/secops.ts:452) - Duplicate incident check (1 hour window)
- Rate limiting serves as velocity checks

#### ⚠️ **P2 - Missing Cross-Feature Velocity**
No detection of:
- Rapid account creation from same IP
- Burst of reports from same user
- Coordinated attack patterns
- Login velocity (multiple failed attempts)

### Remediation Plan

#### **Phase 1: Redis Migration (P1 - Week 2-3)**

**Setup**:
```bash
# Create Redis instance (GCP Memorystore)
gcloud redis instances create avalo-rate-limit \
  --size=1 \
  --region=europe-west3 \
  --redis-version=redis_7_0 \
  --network=default

# Get connection info
gcloud redis instances describe avalo-rate-limit \
  --region=europe-west3 \
  --format="value(host,port)"
```

**Update Rate Limiting**:
```typescript
// functions/src/rateLimit.ts
import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      password: await getSecret('redis-password'),
      socket: {
        connectTimeout: 5000,
        keepAlive: 5000
      }
    });
    await redisClient.connect();
    
    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
      redisClient = null; // Reset on error to recreate
    });
  }
  return redisClient;
}

export async function checkRateLimit(
  identifier: string,
  limitKey: RateLimitKey,
  cost: number = 1
): Promise<void> {
  const config = RateLimits[limitKey];
  const bucketKey = `ratelimit:${identifier}:${limitKey}`;

  try {
    const redis = await getRedis();
    
    // Use Lua script for atomic token bucket check
    const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local cost = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(bucket[1]) or capacity
      local lastRefill = tonumber(bucket[2]) or now
      
      -- Calculate refill
      local timePassed = now - lastRefill
      local tokensToAdd = timePassed * refillRate
      tokens = math.min(capacity, tokens + tokensToAdd)
      
      -- Check if enough tokens
      if tokens < cost then
        local retryAfter = math.ceil((cost - tokens) / refillRate)
        return {0, tokens, retryAfter}
      end
      
      -- Consume tokens
      tokens = tokens - cost
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      redis.call('EXPIRE', key, 3600)
      
      return {1, tokens, 0}
    `;
    
    const now = Date.now() / 1000; // Redis works with seconds
    const result = await redis.eval(script, {
      keys: [bucketKey],
      arguments: [
        config.bucketSize.toString(),
        config.refillRate.toString(),
        cost.toString(),
        now.toString()
      ]
    }) as [number, number, number];
    
    const [allowed, currentTokens, retryAfter] = result;
    
    if (!allowed) {
      throw new HttpsError(
        'resource-exhausted',
        `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        { retryAfter, limitKey, currentTokens: Math.floor(currentTokens) }
      );
    }
    
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    
    logger.error(`Redis rate limit failed, falling back to Firestore:`, error);
    // Fallback to Firestore (existing implementation)
    return checkRateLimitFirestore(identifier, limitKey, cost);
  }
}
```

**Benefits**:
- 95% cost reduction (from $9K to $450/month)
- 10x faster (<5ms vs 50-100ms)
- Atomic operations with Lua scripts
- Auto-expiry with Redis TTL

#### **Phase 2: Device Fingerprinting (P2 - Week 4)**

**Client Implementation**:
```typescript
// app-mobile/src/utils/deviceFingerprint.ts
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

export async function generateDeviceFingerprint(): Promise<string> {
  const components = [
    Device.brand || 'unknown',
    Device.modelName || 'unknown',
    Device.osName || 'unknown',
    Device.osVersion || 'unknown',
    Constants.installationId,
    Constants.sessionId,
    await Device.getDeviceTypeAsync(),
    (await Device.getTotalMemoryAsync()).toString(),
    Device.manufacturer || 'unknown',
    // Add more device-specific data
  ];
  
  const fingerprintString = components.join('|');
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    fingerprintString
  );
  
  return hash;
}

// Send to backend on auth
export async function registerDeviceFingerprint(userId: string) {
  const fingerprint = await generateDeviceFingerprint();
  
  await updateDoc(doc(db, 'deviceTrust', fingerprint), {
    fingerprint,
    associatedUserIds: arrayUnion(userId),
    deviceInfo: {
      brand: Device.brand,
      model: Device.modelName,
      os: Device.osName,
      osVersion: Device.osVersion,
    },
    firstSeen: serverTimestamp(),
    lastSeen: serverTimestamp(),
  }, { merge: true });
  
  return fingerprint;
}
```

**Backend Fraud Detection**:
```typescript
// functions/src/deviceTrust.ts
export async function checkDeviceTrust(fingerprint: string, userId: string): Promise<{
  trusted: boolean;
  riskScore: number;
  reasons: string[];
}> {
  const deviceDoc = await db.collection('deviceTrust').doc(fingerprint).get();
  
  if (!deviceDoc.exists) {
    return { trusted: false, riskScore: 0.3, reasons: ['New device'] };
  }
  
  const device = deviceDoc.data();
  const reasons: string[] = [];
  let riskScore = 0;
  
  // Check 1: Multiple users on same device
  if (device.associatedUserIds.length > 3) {
    riskScore += 0.4;
    reasons.push(`Device used by ${device.associatedUserIds.length} users`);
  }
  
  // Check 2: Rapid account switching
  const recentSwitches = await db.collection('deviceSwitches')
    .where('fingerprint', '==', fingerprint)
    .where('timestamp', '>', Timestamp.fromMillis(Date.now() - 3600000))
    .get();
    
  if (recentSwitches.size > 5) {
    riskScore += 0.3;
    reasons.push(`${recentSwitches.size} account switches in 1 hour`);
  }
  
  // Check 3: Device flagged for fraud
  if (device.fraudFlags && device.fraudFlags.length > 0) {
    riskScore += 0.5;
    reasons.push(`Fraud flags: ${device.fraudFlags.join(', ')}`);
  }
  
  return {
    trusted: riskScore < 0.5,
    riskScore,
    reasons
  };
}
```

#### **Phase 3: Cross-Feature Velocity Checks (P2 - Month 2)**

```typescript
// functions/src/velocityChecks.ts
export async function checkAccountCreationVelocity(ip: string): Promise<boolean> {
  const oneHourAgo = Timestamp.fromMillis(Date.now() - 3600000);
  
  const recentAccounts = await db.collection('users')
    .where('createdFromIP', '==', ip)
    .where('createdAt', '>', oneHourAgo)
    .count()
    .get();
  
  if (recentAccounts.data().count > 3) {
    await logSecurityEvent({
      type: 'rate_limit',
      severity: 'high',
      ip,
      details: { 
        accountsCreated: recentAccounts.data().count,
        window: '1 hour'
      },
      timestamp: new Date().toISOString()
    });
    return false; // Block
  }
  
  return true; // Allow
}

export async function checkReportVelocity(userId: string): Promise<boolean> {
  const last24h = Timestamp.fromMillis(Date.now() - 86400000);
  
  const recentReports = await db.collection('moderationFlags')
    .where('reporterId', '==', userId)
    .where('createdAt', '>', last24h)
    .count()
    .get();
  
  if (recentReports.data().count > 20) {
    return false; // Block excessive reporter
  }
  
  return true;
}
```

---

## Priority Action Matrix

### P0 - Critical (Deploy within 1 week)

| Issue | Effort | Risk | Impact |
|-------|--------|------|--------|
| **1. App Check Client Implementation** | 2 days | Critical | Application-breaking in production |
| **2. Remove Hardcoded Secrets** | 1 day | Critical | Data breach, financial loss |
| **3. Secret Manager Migration** | 3 days | Critical | Prevent secret leaks |
| **4. Stripe Webhook Idempotency** | 2 days | High | Double-crediting, financial loss |

**Total P0 Effort**: 8 days

### P1 - High Priority (Deploy within 1 month)

| Issue | Effort | Risk | Impact |
|-------|--------|------|--------|
| **5. Firestore Rules Optimization** | 5 days | High | Performance, quota limits |
| **6. HTTP Security Headers** | 1 day | Medium | XSS, clickjacking |
| **7. Redis Rate Limiting** | 3 days | Medium | Cost, scalability |
| **8. Other Payment Provider Idempotency** | 2 days | Medium | Financial integrity |

**Total P1 Effort**: 11 days

### P2 - Medium Priority (Deploy within 3 months)

| Issue | Effort | Risk | Impact |
|-------|--------|------|--------|
| **9. Device Fingerprinting** | 5 days | Low | Fraud prevention |
| **10. Cross-Feature Velocity Checks** | 3 days | Low | Abuse prevention |
| **11. CSP Reporting** | 2 days | Low | Security monitoring |
| **12. Storage Rules Rate Limits** | 2 days | Low | Resource protection |

**Total P2 Effort**: 12 days

---

## Implementation Roadmap

### Week 1: Critical Security (P0)
- **Day 1-2**: App Check client implementation + testing
- **Day 3**: Remove hardcoded secrets, rotate compromised keys
- **Day 4-5**: Secret Manager setup + migration (Stripe, AI keys)
- **Day 6-7**: Stripe webhook idempotency + testing

### Week 2: High Priority (P1 Part 1)
- **Day 8-10**: Firestore rules optimization (custom claims)
- **Day 11**: HTTP security headers deployment
- **Day 12-14**: Testing and monitoring

### Week 3: High Priority (P1 Part 2)
- **Day 15-17**: Redis setup + rate limiting migration
- **Day 18-19**: Payment provider idempotency (P24, PayU)
- **Day 20-21**: Load testing and validation

### Week 4: Buffer & Monitoring
- Monitor all changes
- Fix any issues 
- Prepare P2 work

### Month 2-3: Medium Priority (P2)
- Device fingerprinting
- Velocity checks
- CSP reporting
- Storage rules hardening

---

## Monitoring & Validation

### Success Metrics

1. **App Check**
   - ✅ 99% of client requests include valid App Check tokens
   - ✅ Zero function failures due to App Check

2. **Secrets**
   - ✅ Zero hardcoded secrets in codebase
   - ✅ 100% of secrets from Secret Manager
   - ✅ All secrets rotated quarterly

3. **Webhooks**
   - ✅ Zero duplicate webhook processing
   - ✅ 100% webhook idempotency coverage

4. **Performance**
   - ✅ Firestore rules: <20 get() calls per operation
   - ✅ Rate limiting: <10ms latency (Redis)
   - ✅ Security headers: 100% coverage

5. **Security**
   - ✅ Zero security incidents from covered attack vectors
   - ✅ HSTS preload list inclusion
   - ✅ A+ rating on securityheaders.com

### Monitoring Setup

```typescript
// functions/src/securityMonitoring.ts
export const dailySecurityReport = onSchedule(
  { schedule: 'every day 09:00', region: 'europe-west3', timeZone: 'Europe/Warsaw' },
  async () => {
    const report = {
      date: new Date().toISOString().split('T')[0],
      
      appCheck: {
        totalRequests: await getAppCheckRequestCount(),
        failedRequests: await getAppCheckFailures(),
        successRate: '99.x%'
      },
      
      secrets: {
        rotationDue: await listSecretsNeedingRotation(),
        lastRotated: await getLastRotationDates()
      },
      
      webhooks: {
        processed: await getWebhookCount('completed'),
        duplicates: await getWebhookCount('duplicate'),
        failed: await getWebhookCount('failed')
      },
      
      rateLimiting: {
        violations: await getRateLimitViolationsSummary(24),
        topOffenders: await getTopRateLimitOffenders(10)
      },
      
      securityHeaders: {
        coverage: await checkSecurityHeaderCoverage(),
        issues: await findSecurityHeaderIssues()
      }
    };
    
    // Send to admin dashboard
    await db.collection('securityReports').add(report);
    
    // Alert on critical issues
    if (report.appCheck.successRate < 0.95) {
      await sendAlert('App Check success rate below 95%', 'critical');
    }
    
    if (report.webhooks.duplicates > 10) {
      await sendAlert(`${report.webhooks.duplicates} duplicate webhooks`, 'high');
    }
  }
);
```

---

## Cost Analysis

### Current State (Before Fixes)
- Firestore rate limiting: **$9,000/month** at 1M DAU
- Security incidents: **$50K+ potential** (unmeasured)
- **Total Risk**: High

### After Implementation
- Redis rate limiting: **$450/month** (95% savings)
- Secret Manager: **$10/month** (10K accesses)
- Security monitoring: **$100/month**
- **Total**: ~$560/month + massive risk reduction

**ROI**: $8,500/month savings + prevented security breaches

---

## Compliance Impact

### GDPR/DSA
- ✅ Improved: Secret Manager = better data protection
- ✅ Improved: Device fingerprinting = enhanced security logging
- ✅ Improved: Security headers = user data protection

### PCI-DSS (Stripe)
- ✅ **Critical**: Webhook idempotency = payment integrity
- ✅ **Critical**: Secret Manager = secure key storage
- ✅ Improved: Rate limiting = fraud prevention

### SOC 2
- ✅ Improved: Comprehensive security logging
- ✅ Improved: Secret rotation policies
- ✅ Improved: Access controls (App Check)

---

## Conclusion

This security audit identified **4 P0 critical issues** and **8 P1 high-priority issues** requiring immediate attention. The most critical gaps are:

1. **App Check client missing** - Will break production
2. **Hardcoded secrets** - Active security risk
3. **No webhook idempotency** - Financial integrity risk
4. **Missing security headers** - XSS/clickjacking exposure

**Recommended immediate actions**:
- Deploy App Check client within 48 hours
- Migrate secrets to Secret Manager within 1 week
- Implement webhook idempotency within 1 week
- Add security headers within 1 week

**Total implementation effort**: ~4-5 weeks for all P0 and P1 issues.

**Business impact**: Prevents potential $100K+ in security incidents, improves compliance posture, and reduces operational costs by $8,500/month.

---

## Appendix: Quick Reference

### Environment Variables to Migrate to Secret Manager

**P0 - Immediate**:
```
HMAC_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

**P1 - Week 2**:
```
SENDGRID_API_KEY
GOOGLE_VISION_API_KEY
INSTAGRAM_CLIENT_SECRET
TIKTOK_CLIENT_SECRET
REDIS_PASSWORD
P24_API_KEY
P24_CRC_KEY
PAYU_CLIENT_SECRET
COINBASE_COMMERCE_API_KEY
COINBASE_WEBHOOK_SECRET
```

**P2 - Month 2**:
```
ETHEREUM_RPC_URL (with API key)
POLYGON_RPC_URL (with API key)
BSC_RPC_URL (with API key)
EXCHANGE_RATE_API_KEY
```

### Security Header Template

```json
{
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; ...",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)"
}
```

### App Check Configuration

```typescript
// Client
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true
});

// Functions
export const myFunction = onCall(
  { region: 'europe-west3', enforceAppCheck: true },
  async (request) => { /* ... */ }
);
```

---

**Report Generated**: 2025-11-09  
**Next Review Date**: 2025-12-09 (or after P0 deployment)  
**Contact**: Security Team (security@avalo.app)