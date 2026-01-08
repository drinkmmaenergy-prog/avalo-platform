# ✅ PACK 332 — Production Launch & Store Readiness Checklist (Android + iOS + Web)

**Status:** Documentation  
**Type:** Production Readiness Checklist  
**Scope:** No code changes - configuration and testing requirements only

> This document outlines all must-have steps & configurations before first public release.

---

## 1. Minimal Feature Scope for v1 Launch

This is the hard minimum that must be working (no stubs) before we send Avalo to users / stores:

### 1.1 Core User Flow

**Registration + Login:**
- Email + password authentication
- At least one social login (Google)

**Full Onboarding:**
- Gender selection (male / female / nonbinary)
- Orientation / preferences
- Basic profile fields (bio, interests, location)

**Profile:**
- 100% selfie verification flow
- Photo gallery:
  - Photos 1–6 = must show user
  - Photos 7+ = lifestyle photos

### 1.2 Discovery & Matching

**Discovery Grid:**
- Free access, always available

**Swipe:**
- Daily limit: 50 swipes
- Hourly rate: 10 swipes/hour (no accumulation)

**Profile Detail View:**
- Bio, photos, age, hobbies, distance
- Action buttons: Chat, Call, Calendar

### 1.3 Monetization Foundation

**Wallet:**
- Token packs purchasable on:
  - **Android:** Google Play Billing
  - **iOS:** StoreKit
  - **Web:** Stripe
- Wallet balance visible to user

**Chat:**
- Free messages: 6 / 10 (per user in conversation)
- Paid buckets (100 tokens/bucket):
  - 11 words standard tier
  - 7 words Royal tier
- Refunds for unused words on chat end/timeout

**Calls:**
- Voice: 10 tokens/min
- Video: 20 tokens/min
- VIP discount: −30%
- Royal discount: −50% (calls only)

**Calendar:**
- Booking system
- Cancellation handling
- Payouts: 80/20 split (creator/platform)

**Events:**
- Event creation
- Ticket booking
- QR verification
- Revenue split: 80% organizer, 20% Avalo

### 1.4 Safety & Compliance

**Age Verification:**
- 18+ strictly enforced
- Selfie verification + fallback doc/BANK-ID ready

**Safety Features:**
- Panic button in meetups & calls
- Mismatch logic with selfie at meetup start
- Regional policy engine ([`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md)) wired into:
  - Profile uploads
  - Feed content
  - AI interactions
- KYC required before payouts
- Basic reporting system
- User blocking capability

### 1.5 AI & Feed (v1 Required Scope)

**AI Companions:**
- At minimum: 1–3 Avalo Official AI companions (ready-made)
- User can create simple AI companion

**Feed:**
- Post photo content (soft-erotic allowed, no explicit)
- Like / comment functionality

**Note:** No need to launch ads & boosts full-scale on day 1, but code must not break core flows.

---

## 2. Required Pack Status (Must Be "IMPLEMENTED & TESTED")

Before launch to real users, all of the following must be completed in KiloCode and passing tests:

### Core Functionality
- **Core packs 1–75:** Base app, matching, chat, calls, calendar
- **AI Core:**
  - [`PACK 279`](PACK_279_AI_CORE_IMPLEMENTATION.md) + 279b/279c/279d/e (foundation + UI integration)
- **Web Foundation:**
  - [`PACK 124`](PACK_124_WEB_FOUNDATION.md) + supplement for missing features

### Wallet & Tokens
- [`PACK 277`](PACK_277_WALLET_TOKENS_IMPLEMENTATION.md) + all fixes (0.20 PLN, pack values)

### Chat Logic & Fixes
- [`PACK 268`](PACK_268_CHAT_LOGIC_FIXES.md) + derivatives (correct payer logic, buckets, refunds)
- R2.x / R3.x logic merged where needed
- [`PACK 328B`](PACK_328B_CHAT_TIMEOUTS.md) (timeouts & auto-end)

### Calendar & Events
- [`PACK 274/275`](PACK_274_CALENDAR_ENGINE.md) (calendar & events engines)
- [`PACK 328C`](PACK_328C_SELFIE_TIMEOUT.md) (selfie timeout + mismatch)

### Safety & KPI
- [`PACK 324A–C`](PACK_324_KPI_SYSTEM.md) (KPI, fraud detection, trust scores)
- Panic & safety packs:
  - Original panic button pack
  - [`PACK 280`](PACK_280_PANIC_LIVE_SAFE.md) Panic & Live Safe (or new equivalent)

### Compliance
- [`PACK 328A`](PACK_328A_BANK_ID_VERIFICATION.md) (Bank-ID / doc fallback)
- [`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md) (regional policy matrix)
- [`PACK 330`](PACK_330_TAX_STATEMENTS.md) (tax & statements)

### Extra Monetization (Optional for Day 1, but Recommended)
- [`PACK 325`](PACK_325_BOOST_SYSTEM.md) (boosts)
- [`PACK 326`](PACK_326_ADS_SYSTEM.md) (ads)
- [`PACK 327`](PACK_327_PROMO_BUNDLES.md) (promo bundles)
- [`PACK 331`](PACK_331_AI_AVATAR_MARKETPLACE.md) (AI avatars marketplace)

**⚠️ Action Required:** If any of the above is not generated/implemented/tested, add it to a separate TODO list before "production go".

---

## 3. Configuration & Secrets Checklist

### 3.1 Firebase

**For Production Project (NOT emulator):**
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

**Separate .env files (or equivalent) for:**
- Development
- Staging
- Production

### 3.2 Payments & Wallet

**Stripe:**
- Publishable + secret keys for web
- Webhook secret for payment events

**Google Play Billing:**
- Properly configured product IDs for token packs & subscriptions

**Apple In-App Purchases:**
- Set up with same product IDs mapping

**Validation:**
- All product IDs must map to the same token pack config as in [`PACK 277`](PACK_277_WALLET_TOKENS_IMPLEMENTATION.md)

### 3.3 AI Providers

**Required Keys:**
- `OPENAI_API_KEY`
- (Optional) Other AI providers for content generation

**Important:** All AI providers must respect content rules in [`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md)

### 3.4 Email / Notifications

**SendGrid (or alternative):**
- Transactional emails:
  - Email verification
  - Password reset
  - Payment receipts

**Push Notifications:**
- **FCM:** Firebase Cloud Messaging for Android
- **APNs:** Apple Push Notification service for iOS

### 3.5 KYC / Identity Provider

**Vendor Setup:**
- Chosen vendor (e.g., Veriff / Sumsub / Onfido)
- API keys & webhook configuration
- Mapping from [`PACK 328A`](PACK_328A_BANK_ID_VERIFICATION.md) to vendor API

---

## 4. Android Launch Checklist (Google Play)

### Basic Configuration
- **Package ID:** `com.avalo.app` (or equivalent)
- **App Name:** Set in Google Play Console
- **Descriptions:** Short & long
- **Screenshots:** Phone + tablet sizes

### Content Rating
**Questionnaire must declare:**
- Dating app category
- Mature content
- User-generated content

### Legal Requirements
- **Privacy Policy URL** must reflect:
  - 18+ only
  - Token economy
  - Payout system
  - AI usage disclosure
  - User tracking & analytics
- **Terms of Service URL:**
  - Token mechanics
  - 65/35 and 80/20 splits
  - Refund rules

### Build Configuration
**Signed AAB with:**
- Production keystore
- `minSdk` / `targetSdk` aligned with Expo RN version

### Testing Track
1. Internal testing
2. Closed beta
3. Production rollout

### Pre-Launch Validation
**Ensure:**
- App doesn't crash without permissions
- Location permissions requested only when needed (meetups/events)
- No hard violations:
  - No explicit pornography
  - No underage content
  - No illegal content

---

## 5. iOS Launch Checklist (App Store)

### Basic Configuration
- **Bundle ID:** `com.avalo.app` (or equivalent)
- **App Name:** Display name in App Store
- **Subtitle & Keywords:** For search optimization
- **Screenshots:** All required device sizes

### App Privacy Details
**Data Collection Categories:**
- Financial data (tokens, payouts)
- User content
- Contact information
- Usage data
- Location (optional, for meetups)
- Identifiers for tracking/analytics

**Security:**
- KYC data encryption
- Financial data encryption

### App Review Notes
**Clearly explain:**
- 18+ only dating platform
- User-generated content: soft-erotic allowed, no explicit porn
- Safety tools:
  - Panic button
  - Reporting system
  - Blocking functionality
- KYC / age verification process

### TestFlight
- **Internal testing:** Team members
- **External testing:** Minimum 1–2 weeks with beta users

### In-App Purchases
- Token packs created in App Store Connect
- Subscriptions (if applicable) created
- All purchases linked and tested

---

## 6. Web Launch Checklist

### Domain & Hosting
- **Domain:** `avalo.app` (or similar)
- **SSL Certificate:** Via hosting provider
  - Firebase Hosting, Vercel, or other

### Deployment
**Next.js app deployed with:**
- Production Firebase config
- Stripe public keys
- Same policy engine ([`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md))

### Web-Specific Checks
- **Responsive UI:** Mobile, tablet, desktop
- **NSFW Handling:** Soft content only, no explicit porn
- **Cookie Banner:** GDPR compliance if required in EU
- **Consent Management:** User tracking & analytics

---

## 7. QA Scenario Matrix (Before Going Live)

### 7.1 New User Full Flow
**Complete user journey:**
1. Register → Verify email
2. Selfie verification
3. Add photos (user + lifestyle)
4. Set preferences
5. Swipe on discovery
6. Send messages (free → paid)
7. Start paid chat
8. End chat → Check refunds
9. Book meetup
10. Complete selfie at meetup
11. End meetup

### 7.2 Payment Testing
**Test on all platforms:**
- ✅ Buy tokens on Android (Google Play)
- ✅ Buy tokens on iOS (StoreKit)
- ✅ Buy tokens on Web (Stripe)
- ✅ Verify wallet balance updates
- ✅ Check transaction history

### 7.3 Payout Flow
**Creator earnings test:**
1. Creator earns tokens (chat & calendar)
2. Creator passes KYC
3. Creator requests payout
4. Admin marks payout as processed
5. Verify tax report record created

### 7.4 Safety Features
**Test scenarios:**
- ✅ Mismatch at meetup → 100% refund (including Avalo's share)
- ✅ Panic button triggers safety workflow
- ✅ Block user → Verify blocking works
- ✅ Report user → Verify report submission

### 7.5 AI Functionality
**AI companion test:**
1. Create AI companion
2. Start AI chat
3. Verify AI respects content policy:
   - No minors
   - No extreme content
   - Follows [`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md) rules

### 7.6 Content Policy
**Upload tests:**
- ✅ Bikini / lingerie photos → Accepted
- ✅ Hardcore porn → Blocked
- ✅ Political flame content → De-ranked or blocked per policy

---

## 8. Production Rollout Plan

### Recommended Phased Approach

#### Phase 1 — Internal Alpha
- **Users:** 50–100 (friends & test accounts)
- **Region:** Poland only (or PL + few EE countries)
- **Duration:** 1–2 weeks
- **Focus:** Critical bug identification

#### Phase 2 — Closed Beta
- **Users:** Up to 1–2k users
- **Region:** Eastern Europe focus (PL, LT, LV, EE, etc.)
- **Duration:** 2–4 weeks
- **Focus:** Load testing, UX feedback, safety systems

#### Phase 3 — Open Soft Launch
- **Action:** Open stores to public
- **Marketing:** Limited, organic growth
- **Monitoring:** Heavy focus on metrics & stability

#### Phase 4 — Scaling
- **Action:** Ramp up marketing campaigns
- **Expansion:** Add new regions gradually
- **Optimization:** Based on Phase 3 data

---

## 9. Zero-Drift Confirmation

**PACK 332 Guarantees:**

✅ **Does NOT change:**
- Tokenomics
- Revenue splits (65/35, 80/20)
- Pricing structures
- Chat / call / calendar logic
- Any existing implementations

✅ **Only defines:**
- What must be ready before launch
- What must be configured in production
- What must be tested thoroughly
- How to pass:
  - App store reviews
  - Investor sanity checks
  - Legal compliance requirements

---

## 10. Final Pre-Launch Checklist

### Documentation
- [ ] All PACK documents reviewed and up-to-date
- [ ] Privacy Policy published and accessible
- [ ] Terms of Service published and accessible
- [ ] Help Center / FAQ ready

### Legal & Compliance
- [ ] Age verification system tested
- [ ] KYC provider configured and tested
- [ ] Tax reporting system ready ([`PACK 330`](PACK_330_TAX_STATEMENTS.md))
- [ ] Regional compliance verified ([`PACK 329`](PACK_329_REGIONAL_POLICY_MATRIX.md))

### Technical Infrastructure
- [ ] Production Firebase project configured
- [ ] All API keys and secrets in production environment
- [ ] Payment providers fully integrated (Stripe, Google Play, App Store)
- [ ] Email service configured (SendGrid or alternative)
- [ ] Push notifications configured (FCM + APNs)
- [ ] CDN and asset delivery optimized

### Platform Submissions
- [ ] Android: Google Play listing complete
- [ ] iOS: App Store listing complete
- [ ] Web: Domain configured with SSL

### Testing Complete
- [ ] All QA scenarios passed (Section 7)
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Accessibility review done

### Team Readiness
- [ ] Support team trained on platform features
- [ ] Escalation procedures defined
- [ ] Monitoring dashboards configured
- [ ] Incident response plan documented

### Go/No-Go Decision
- [ ] All critical packs implemented (Section 2)
- [ ] All platforms tested and approved
- [ ] Legal review completed
- [ ] Executive approval obtained

---

## Document Status

**Version:** 1.0  
**Last Updated:** 2025-12-12  
**Status:** ✅ Complete  
**Dependencies:** All referenced PACKs (see Section 2)

**Next Steps After This Document:**
1. Review current implementation status against Section 2 requirements
2. Create detailed TODO list for any missing implementations
3. Configure all secrets and API keys (Section 3)
4. Prepare platform submissions (Sections 4, 5, 6)
5. Execute QA plan (Section 7)
6. Plan rollout strategy (Section 8)