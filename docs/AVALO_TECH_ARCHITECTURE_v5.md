# AVALO_TECH_ARCHITECTURE_v5.md
**Scope:** Full technical architecture for Avalo (mobile + web + backend) ready for Claude-driven implementation.  
**Targets:** Expo (RN), Next.js 14, Firebase (Auth/Firestore/Functions/Storage/Hosting), Stripe + regional payments, Coinbase Commerce, i18n 60+, Ads, AI moderation, Instagram linking, Calendar compliance, SSO mobile↔web.

---

## 0. Monorepo Layout (Turborepo-style)

```
avalo/
├─ apps/
│  ├─ mobile/                 # Expo SDK 54, RN TS
│  └─ web/                    # Next.js 14 (App Router)
├─ packages/
│  ├─ ui/                     # shared UI components (RNW + web)
│  ├─ i18n/                   # 60+ locales JSON
│  ├─ models/                 # Types, zod schemas
│  ├─ sdk/                    # client SDK for Firestore/Functions
│  └─ config/                 # eslint, tsconfig, tailwind presets
├─ functions/                 # Firebase Functions (Node 20, TS)
├─ admin/                     # Next.js 14 admin panel (protected)
├─ tools/                     # scripts, generators, seeds
├─ .github/workflows/         # CI/CD pipelines
└─ infra/                     # firestore.indexes.json, rules, emulators.json
```

---

## 1. Environments and Secrets

**Envs:** `dev`, `staging`, `prod`.  
**Secret storage:** GitHub Actions Secrets + Firebase `functions:config` + Vercel/Next `.env.*` (web) + EAS Secrets (mobile).  
**Do not commit real keys. Use placeholders.**

### 1.1 Mobile (`apps/mobile/.env` via `expo-env`)
```
EXPO_PUBLIC_FIREBASE_API_KEY=***
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=***
EXPO_PUBLIC_FIREBASE_PROJECT_ID=***
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=***
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=***
EXPO_PUBLIC_FIREBASE_APP_ID=***
EXPO_PUBLIC_MEASUREMENT_ID=***

EXPO_PUBLIC_WEBSITE_ORIGIN=https://avalo.app
EXPO_PUBLIC_FUNCTIONS_REGION=europe-west3
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=*** (web-only payments but used for display/prices)
EXPO_PUBLIC_I18N_DEFAULT=en
```

### 1.2 Web (`apps/web/.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=***
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=***
NEXT_PUBLIC_FIREBASE_PROJECT_ID=***
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=***
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=***
NEXT_PUBLIC_FIREBASE_APP_ID=***
NEXT_PUBLIC_MEASUREMENT_ID=***

NEXT_PUBLIC_FUNCTIONS_REGION=europe-west3
NEXT_PUBLIC_SITE_URL=https://avalo.app

# Payments
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
PAYPAL_CLIENT_ID=***
PAYPAL_SECRET=***
COINBASE_COMMERCE_KEY=***
# Optional regionals: PRZELEWY24_KEY=***, BLIK_...=***, PAYU_...=***, KLARNA_...=***

# Instagram (Royal auto-eligibility)
IG_APP_ID=***
IG_APP_SECRET=***
IG_REDIRECT_URI=https://avalo.app/api/instagram/callback
FB_APP_ID=***
FB_APP_SECRET=***

# AI Providers
ANTHROPIC_API_KEY=***
OPENAI_API_KEY=***
```

### 1.3 Functions (`functions/.runtimeconfig.json` via `firebase functions:config:set`)
```
payments.stripe_key=***
payments.webhook_secret=***
payments.coinbase_key=***
moderation.anthropic_key=***
moderation.openai_key=***
instagram.app_id=***
instagram.app_secret=***
instagram.redirect_uri=https://avalo.app/api/instagram/callback
```

---

## 2. Firebase Project

- **Region:** `europe-west3` (low latency EU)  
- **Products:** Auth, Firestore, Storage, Functions, Hosting, Extensions (optional: Firestore BigQuery export)

### 2.1 Firestore Structure (high-level)

```
users/{uid}
  profile: {name, dob, age, gender, seeking, bio, photos[], location, passport, incognito, earnFromChat, royal, qualityScore, instagram:{linked, username, followers} }
  wallet:  {balance, pending, earned, settlementRate: 0.20}
  settings:{i18n, notifications, privacy}
  verification:{selfie, bank, status}

matches/{matchId} { u1, u2, createdAt, chatId, ttl }

chats/{chatId}
  participants:[uid1, uid2]
  status: 'active'|'expired'|'closed'|'queued'
  deposit:{amount:100, fee:35, escrow:65, paidBy}
  billing:{words, tokensSpent}
  queue:{royalBypass?:true}
  messages/{messageId} {...}

transactions/{txId}
  type:'purchase'|'message'|'video_call'|'voice_call'|'calendar'|'tip'|'refund'
  amountTokens
  split:{platformPct, creatorPct}
  status:'pending'|'completed'|'refunded'
  meta:{chatId, bookingId, packId, subscriptionId}

calendarBookings/{bookingId}
  creatorId, bookerId
  slot:{start,end,duration}
  priceTokens
  payment:{platformFeeTokens:20%, escrowTokens:80%}
  verify:{gps:boolean, qr:boolean, selfie:boolean}
  status:'pending'|'confirmed'|'in_progress'|'completed'|'cancelled'|'no_show'

aiBots/{botId}
  ownerId, tier, nsfwLevel, traits, appearance, pricing
  stats, limits

feedPosts/{postId} { uid, media, caption, stats, tipsTotal }
adminFlags/{id} { uid, reason, evidence, status }
```

### 2.2 Security Rules (extracts)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthed() { return request.auth != null; }
    function isOwner(uid) { return request.auth.uid == uid; }
    function isParticipant(chatId) {
      return exists(/databases/$(database)/documents/chats/$(chatId))
        && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
    }
    function isVerifiedAdult() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.verification.status == "approved";
    }

    match /users/{uid} {
      allow read: if isAuthed();
      allow write: if isOwner(uid);
    }
    match /chats/{chatId} {
      allow read: if isParticipant(chatId);
      allow create: if isAuthed() && isVerifiedAdult();
      allow update: if isParticipant(chatId);
    }
    match /transactions/{txId} {
      allow read: if isAuthed();
      allow create: if isAuthed();
      allow update: if false; // server-side only
    }
    match /calendarBookings/{bookingId} {
      allow read, create: if isAuthed() && isVerifiedAdult();
      allow update: if isAuthed();
    }
  }
}
```

### 2.3 Indexes (sample)
```
{
  "indexes": [
    { "collectionGroup": "chats", "queryScope": "COLLECTION", "fields":[
      {"fieldPath":"participants","arrayConfig":"CONTAINS"},
      {"fieldPath":"status","order":"ASCENDING"},
      {"fieldPath":"updatedAt","order":"DESCENDING"}
    ]},
    { "collectionGroup":"transactions","queryScope":"COLLECTION","fields":[
      {"fieldPath":"type","order":"ASCENDING"},
      {"fieldPath":"createdAt","order":"DESCENDING"}
    ]}
  ]
}
```

---

## 3. Authentication & SSO (Mobile ↔ Web)

### 3.1 Auth stack
- Firebase Auth providers: Email/Password, Phone OTP, Google, Apple; Instagram is **link-only**, not auth.  
- All users must pass **18+ verification** before chat/calendar.

### 3.2 Mobile→Web SSO for Checkout
- Mobile generates Firebase **ID token** via `getIdToken()`.
- Open system browser to `https://avalo.app/wallet?token=ID_TOKEN&redirect=avalo://wallet/success`.
- Web verifies token server-side → sets **Secure, HttpOnly** session cookie.
- After checkout, web calls Functions `creditTokens()` and redirects back to deep link.
- Result: no re-login, full continuity.

### 3.3 Web→Mobile Deep Links
- Custom scheme `avalo://` and universal link `https://avalo.app/ul/*` handled in Expo and Next.js.

---

## 4. Payments Architecture

### 4.1 Principles
- **In-app currency = Tokens only.** Purchase and payouts show fiat equivalents **on web only**.
- Settlement rate: **1 token = 0.20 PLN** for all splits and payouts.
- Platform fee: Chat 35%, Video 30%, Tips 20%, Calendar 20% (non-refundable).

### 4.2 Token Packs (Stripe Products)
Create 6 products + prices (multi-currency) on Stripe:
```
MINI     : 100 tokens
BASIC    : 300 tokens
STANDARD : 500 tokens
PREMIUM  : 1000 tokens
PRO      : 2000 tokens
ELITE    : 5000 tokens
```
- Display price table by currency (web), internally credit tokens only.

### 4.3 Subscriptions (web-only)
```
VIP         : $19.99/mo
ROYAL CLUB  : $49.99/mo (auto eligibility for women per rules still uses $0 price + role grant)
AI BASIC    : $9.99/mo
AI PLUS     : $19.99/mo
AI PREMIUM  : $39.99/mo
```
- Stripe Customer portal enabled.  
- Webhooks: `checkout.session.completed`, `customer.subscription.*`, `payment_intent.succeeded`.

### 4.4 Regional Methods
- Stripe Payment Element: Cards, Apple/Google Pay, SEPA, iDEAL, Bancontact, Sofort, Klarna, ACH, etc.  
- Additional: PayPal (server→server capture), Przelewy24/PayU/BLIK via Stripe or native adapters, Coinbase Commerce for crypto.  
- All token credits unified in `functions/payments.onCheckoutCompleted`.

### 4.5 Webhooks Flow
1. Stripe → `functions/stripeWebhook` (raw body).  
2. Verify signature.  
3. Map product → token quantity or subscription role.  
4. Write `transactions` with `status='completed'`.  
5. Credit `users/{uid}.wallet.balance`.  
6. Emit analytics event.  

### 4.6 Payouts
- Creator requests payout on web dashboard.  
- Convert **earnedTokens × 0.20 PLN** → payout pipeline (SEPA/ACH/PayPal/Crypto).  
- Deduct external payout fees.  
- Record settlement txn `type='payout'`.

---

## 5. Chat & Billing Engine (Functions)

### 5.1 Key Functions
```
POST /v1/chat/start               -> startChatCallable
POST /v1/chat/message             -> sendMessageCallable
POST /v1/chat/close               -> closeChatCallable
POST /v1/chat/refund              -> refundByEarnerCallable
POST /v1/chat/expireSweep (cron)  -> expireStaleChats
POST /v1/chat/royalQueue          -> enqueueRoyalCallable
```

### 5.2 Token Metering
- `countWords(text)` → tokens = ceil(words / rate).  
- Rate: 11 words/token standard; 7 words/token for Royal earning females (or earner in configured cases).  
- Deduct from `escrow` first, enforce `autoReload` when `<20` tokens if enabled.

### 5.3 Refund Logic (server)
- Invariant: **platformFee is never refunded**.  
- Auto-expire 48h → refund escrow.  
- Earner manual refund → full escrow refund.  
- Abuse-confirmed → admin refund policy table.

---

## 6. Calendar Booking (Compliance-first)

### 6.1 Booking API
```
POST /v1/calendar/book           -> bookSlotCallable
POST /v1/calendar/confirm        -> confirmBookingCallable
POST /v1/calendar/cancel         -> cancelBookingCallable
POST /v1/calendar/verify         -> verifyMeetingCallable (gps/qr/selfie)
CRON /v1/calendar/sweep          -> auto-complete/expire tasks
```

### 6.2 Enforcement
- Mandatory **Legal Acknowledgment** checkbox list before payment.  
- UI warnings repeated.  
- Refunds per policy: earner no-show/cancel → full refund of escrow (Avalo keeps 20% fee).  
- Booker late cancel `<24h` → 0% to booker, 80% creator released after verify window.

---

## 7. Instagram Linking → Royal Club Eligibility

### 7.1 Flow
1. User opens **Link Instagram**.  
2. Web flows to FB/IG OAuth (Graph API).  
3. On callback, save IG username + follower count.  
4. If `followers >= 1000` → grant **Royal** role.  
5. Sync role to user profile and badges.

### 7.2 Data
```
users/{uid}.instagram = {
  linked: true,
  username,
  followers,
  accountId,
  lastSyncAt
}
users/{uid}.roles = { royal:true, vip:false, ... }
```

---

## 8. AI & Moderation

### 8.1 Real-time moderation
- `moderateContent` callable wraps Anthropic.  
- Banned phrases list, escort euphemisms, sugar dating PPM, etc.  
- Action: block message, warn, log `adminFlags`.

### 8.2 AI Companions
- Separate namespace `aiBots/*` and chat room type `chatType:'ai'`.  
- Billing for image generation: default 15 tokens / image; configurable in remote config.  
- NSFW gates per user verification level.

---

## 9. Ads System

- Mobile: AdMob (interstitial in Swipe, native in Feed, banner in Free Chat Pool).  
- Web: Google Ad Manager placements between posts and chat threads.  
- Feature flags via Remote Config: `ads.enabled`, `ads.inChat`, `ads.thresholds`.

---

## 10. i18n (60+)

### 10.1 Structure
```
packages/i18n/
  en/common.json
  pl/common.json
  es/common.json
  de/common.json
  fr/common.json
  ... (55 more)
```

Namespaces: `auth`, `onboarding`, `profile`, `discovery`, `chat`, `calendar`, `wallet`, `feed`, `ai`, `legal`, `ads`, `settings`.

### 10.2 Clients
- Mobile: `expo-localization` + `i18next` + `react-i18next`.  
- Web: Next.js `appDir` with `next-intl` or `i18next` SSR middleware.  
- Fallback: English; user override in Settings saved in `users/{uid}.settings.i18n`.

---

## 11. Web App (Next.js 14)

### 11.1 Routes
```
/                landing
/wallet          token packs + checkout
/premium         subscriptions
/ai              AI companions gallery
/admin           admin panel (RBAC)
/api/stripe/*    webhook + checkout
/api/instagram/* oauth callback + sync
/ul/*            universal links for deep-linking
```

### 11.2 Auth on Web
- Accept ID token query → set session cookie.  
- SSR user load from cookie.  
- Protect server actions with `verifyFirebaseCookie`.

---

## 12. Admin Panel (RBAC)

- Roles: `admin`, `finance`, `moderator`, `legal`.  
- Views: Users, Flags, Transactions, Payouts, Calendar disputes, Content takedowns, Logs.  
- Actions audited in `adminLogs/{id}`.

---

## 13. CI/CD Pipelines

### 13.1 Web
- On push to `main`:  
  - Type-check, lint, unit tests.  
  - Build Next.  
  - Deploy to Firebase Hosting (via GitHub Actions).  
  - Purge Cloudflare cache.

### 13.2 Functions
- Run `tsc`, unit tests.  
- `firebase deploy --only functions`.  
- Emulator tests in PR.

### 13.3 Mobile (EAS)
- Build preview on PR.  
- Promote to production on tag.  
- `.eas.json` profiles per env.  

---

## 14. Observability

- Logs: Cloud Functions + Sentry SDK (mobile/web).  
- Metrics: BigQuery export (daily), Google Analytics 4.  
- Alerts: function error rate, webhook failures, payout errors.

---

## 15. Test Matrix

- Devices: iOS 14+, Android 9+.  
- Locales: EN/PL/ES/DE/FR initial; smoke tests for others.  
- Payments: Stripe test cards, regional methods in test mode, Coinbase test webhooks.  
- Flows: onboarding, verification, chat deposit, refund paths, calendar booking verify, Instagram linking, SSO to web checkout, subscription grant, AI image billing.

---

## 16. Migration & Bootstrapping

- If old `avaloapp/` exists: archive → `legacy/`.  
- Create monorepo fresh; seed admin account; import i18n baseline.  
- Run emulators (`infra/firebase.json`, `emulators.json`).  
- `tools/seed.ts` to create token products and packs mapping in Firestore `config/tokenPacks`.

---

## 17. Risk & Compliance Notes

- **Store policies:** no explicit pricing references in mobile UI; only tokens.  
- **Age-gating:** strict for 18+ content and AI XXX tier.  
- **KYC for payouts:** collect bank/PayPal/crypto details; apply AML checks where required.  
- **GDPR:** DSR endpoints, data retention policies, region-hosted data.

---

## 18. API Surface (Functions – Summary)

- `startChatCallable`, `sendMessageCallable`, `closeChatCallable`, `refundByEarnerCallable`, `expireStaleChats`
- `enqueueRoyalCallable`
- `bookSlotCallable`, `confirmBookingCallable`, `cancelBookingCallable`, `verifyMeetingCallable`
- `stripeWebhook`, `paypalWebhook`, `coinbaseWebhook`
- `creditTokens`, `grantSubscriptionRole`, `requestPayout`
- `moderateContent`
- `linkInstagram`, `syncInstagram`
- `getConfig` (remote config for rates, ads, thresholds)

---

## 19. Configuration Constants (Remote Config)

```
CHAT_INITIAL_DEPOSIT_TOKENS = 100
PLATFORM_FEE_CHAT_PCT = 35
PLATFORM_FEE_VIDEO_PCT = 30
PLATFORM_FEE_CALENDAR_PCT = 20
PLATFORM_FEE_TIP_PCT = 20
SETTLEMENT_RATE_PLN = 0.20
WORDS_PER_TOKEN_STANDARD = 11
WORDS_PER_TOKEN_ROYAL_EARNER = 7
CHAT_EXPIRY_HOURS = 48
MAX_ACTIVE_CHATS = 50
ROYAL_QUEUE_BYPASS = true
ADS_ENABLED = true
FREE_POOL_AD_FREQUENCY = 10
```

---

## 20. Developer Bootstrap Steps (Claude-first)

1. **Scaffold monorepo** with Turbo + Expo + Next + Functions.  
2. **Install** libs: Firebase JS SDK v10+, React Query, Zustand, react-i18next, Stripe SDK (web), AdMob (mobile).  
3. **Set envs** from placeholders; do not commit secrets.  
4. **Implement SSO** mobile→web token handoff + cookie session.  
5. **Implement Payments**: checkout page, webhook, token credit.  
6. **Implement Chat** callables + client SDK methods, escrow accounting.  
7. **Implement Calendar** booking + verify + refund logic.  
8. **Implement Instagram linking** and Royal auto-grant.  
9. **Enable Moderation** pre-send filter and admin review queue.  
10. **Wire i18n** for 60 languages, fallback EN, user override.  
11. **Add Ads** with feature flags.  
12. **Ship Admin Panel** with RBAC and audit logs.  
13. **CI/CD** + Sentry + GA4 + BQ export.  

---

**This document is the technical contract for implementation.**  
Claude can now scaffold codebases and generate modules in the order from §20.
