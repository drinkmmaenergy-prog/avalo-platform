# PACK 381 — Regional Expansion Engine
## EU / US / LATAM / Asia / MENA Launch System

**Stage:** D — Public Launch & Market Expansion  
**Status:** ✅ IMPLEMENTED  
**Version:** 1.0.0

---

## 🎯 OBJECTIVE

Build a centralized global-market operating system that enables Avalo to scale region by region safely, legally, profitably, and with full localization. This system handles region-specific legal compliance, currency & pricing localization, cultural adaptation, content moderation rules per country, creator payout rules per region, influencer onboarding differences, marketing & communication localization, risk profiles per market, and expansion-readiness scoring.

---

## 📦 DEPENDENCIES

This pack depends on:

- **PACK 277** — Wallet & Multi-Currency
- **PACK 280** — Membership System
- **PACK 293** — Notifications
- **PACK 296** — Audit Logs
- **PACK 300 / 300A / 300B** — Support & Compliance Layer
- **PACK 301 / 301A / 301B** — Growth & Retention Engine
- **PACK 302** — Fraud Detection
- **PACK 378** — Legal / VAT / Compliance
- **PACK 379** — Store Defense & Ratings
- **PACK 380** — PR + Influencer + Brand Expansion Engine

---

## 🏗 ARCHITECTURE

### Backend Functions

All functions are deployed as Firebase Cloud Functions:

#### 1. Region Configuration System
**File:** [`functions/src/pack381-region-config.ts`](functions/src/pack381-region-config.ts)

**Functions:**
- `pack381_updateRegionConfig()` — Admin-only update system for region configs
- `pack381_getRegionConfig()` — Client retrieves UX settings, restrictions, and features
- `pack381_listAvailableRegions()` — Public list of enabled regions
- `pack381_adminGetRegionConfig()` — Admin access to full config with sensitive data
- `pack381_detectUserRegion()` — Auto-detect user region based on IP and device
- `pack381_validateFeatureAvailability()` — Check if feature is available in region

**Collections:**
- `regionConfigs` — Stores per-country legal requirements, restrictions, settings

#### 2. Regional Pricing & Token Economy
**File:** [`functions/src/pack381-regional-pricing.ts`](functions/src/pack381-regional-pricing.ts)

**Functions:**
- `pack381_updateRegionalPricing()` — Admin updates price policies
- `pack381_applyRegionalPricing()` — Apply PPP and tax to token packs
- `pack381_calculateFinalPrice()` — Calculate final price with tax and fees
- `pack381_convertTokensToLocal()` — Convert token value to local currency
- `pack381_getPayoutEligibility()` — Check payout availability and restrictions
- `pack381_updateConversionRates()` — Bulk update currency conversion rates

**Collections:**
- `regionalPricePolicies` — PPP adjustments, tax, pricing, payouts

**Base Token Value:** 0.20 PLN (Polish Złoty)

#### 3. Regional Risk Engine
**File:** [`functions/src/pack381-regional-risk.ts`](functions/src/pack381-regional-risk.ts)

**Functions:**
- `pack381_updateRegionalRisk()` — Admin updates risk profiles
- `pack381_calculateRegionalRiskScore()` — Calculate user risk score with regional modifiers
- `pack381_validateAction()` — Check if user action is allowed based on risk
- `pack381_reportIncident()` — Report and track fraud incidents
- `pack381_getRegionalRiskStats()` — Get regional risk statistics

**Collections:**
- `regionalRiskProfiles` — Risk multipliers, fraud vectors, thresholds
- `userRiskScores` — Calculated risk scores per user
- `regionalIncidents` — Fraud incident tracking

**Integration:**
- Extends PACK 302 (Fraud Detection) with regional modifiers
- Uses PACK 296 (Audit Logs) for behavior analysis
- Uses PACK 301 (Churn signals) for risk calculation

#### 4. Content Moderation System
**File:** [`functions/src/pack381-moderation.ts`](functions/src/pack381-moderation.ts)

**Functions:**
- `pack381_updateContentRules()` — Admin updates content rules
- `pack381_applyRegionalModeration()` — Apply moderation to content
- `pack381_checkContentAllowed()` — Check if content type is allowed
- `pack381_getModerationQueue()` — Get moderation queue for moderators
- `pack381_reviewContent()` — Moderator reviews flagged content
- `pack381_appealDecision()` — User appeals moderation decision
- `pack381_getModerationStats()` — Get moderation statistics

**Collections:**
- `regionalContentRules` — Content restrictions per region
- `moderationQueue` — Flagged content for review
- `moderationLogs` — Moderation decisions log
- `moderationReviews` — Moderator review history
- `moderationAppeals` — User appeals

**Features:**
- AI + Human hybrid moderation
- Cultural sensitivity detection
- Auto-flag and auto-block keywords
- Regional profanity filters
- Appeal process management

#### 5. Expansion Tracking Engine
**File:** [`functions/src/pack381-expansion-engine.ts`](functions/src/pack381-expansion-engine.ts)

**Functions:**
- `pack381_updateExpansionStatus()` — Update expansion metrics
- `pack381_calculateGrowthMetrics()` — Auto-calculate growth metrics
- `pack381_expansionReadinessScore()` — Calculate readiness score
- `pack381_getExpansionOverview()` — Get overview of all regions
- `pack381_languageAvailabilityMatrix()` — Get language availability matrix

**Collections:**
- `regionExpansionStatus` — Growth, engagement, revenue metrics
- `expansionReadinessScores` — Launch readiness scoring

**Readiness Scoring Weights:**
- Legal Compliance: 25%
- Product Readiness: 20%
- Support Readiness: 15%
- Market Readiness: 20%
- Infrastructure: 20%

**Stages:**
- `not-ready` — Score < 40
- `preparation` — Score 40-59
- `beta-ready` — Score 60-74
- `launch-ready` — Score 75-89
- `scaling` — Score 90+

---

## 🔒 SECURITY

### Firestore Security Rules
**File:** [`firestore-pack381-regions.rules`](firestore-pack381-regions.rules)

**Access Control:**
- Region configs: Public read (enabled only), admin write
- Price policies: Authenticated read, admin write
- Risk profiles: Moderator read, admin write
- User risk scores: Own read, moderator read all
- Content rules: Authenticated read, admin write
- Moderation queue: Moderator access
- Appeals: User create own, moderator review

### Firestore Indexes
**File:** [`firestore-pack381-regions.indexes.json`](firestore-pack381-regions.indexes.json)

**Optimized Queries:**
- Region lookup by country code and status
- User risk scoring by region and level
- Moderation queue by priority and status
- Expansion metrics by stage and performance
- Incident tracking by region and severity

---

## 🌍 REGIONAL CONFIGURATION

### Region Config Structure

```typescript
interface RegionConfig {
  regionId: string;
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  enabled: boolean;
  
  legal: {
    minAge: number;
    requiresKYC: boolean;
    requiresTaxId: boolean;
    gdprApplies: boolean;
    dataResidencyRequired: boolean;
    contentRestrictions: string[];
    requiredDisclamers: string[];
  };
  
  localization: {
    languages: string[]; // ISO 639-1
    primaryLanguage: string;
    currency: string; // ISO 4217
    timezone: string; // IANA
    rtl: boolean;
  };
  
  payment: {
    supportedProviders: string[];
    walletEnabled: boolean;
    payoutsEnabled: boolean;
    taxRate: number;
    taxLabel: string;
  };
  
  creator: {
    monetizationEnabled: boolean;
    minFollowersForMonetization: number;
    payoutSchedule: string;
    minAge: number;
  };
  
  moderation: {
    aiModerationLevel: 'strict' | 'moderate' | 'lenient';
    humanReviewRequired: boolean;
    prohibitedContent: string[];
  };
  
  features: {
    swipes: boolean;
    events: boolean;
    aiCompanions: boolean;
    paidCalls: boolean;
    marketplace: boolean;
    adultMode: boolean;
  };
  
  risk: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    fraudScoreMultiplier: number;
    vpnRestricted: boolean;
  };
}
```

---

## 💰 PRICING SYSTEM

### Purchasing Power Parity (PPP)

The system automatically adjusts prices based on regional purchasing power:

```typescript
// Example: India has PPP multiplier of 0.4
// Base token pack: 100 tokens = 20 PLN
// India price: 20 PLN × 0.4 = 8 PLN equivalent in INR
```

### Tax Handling

Three tax models supported:
1. **VAT** (Value Added Tax) — EU countries (e.g., 23% Poland)
2. **GST** (Goods & Services Tax) — Countries like Australia, India
3. **Sales Tax** — US states

Tax can be included or excluded from display price.

### Currency Conversion

Base currency: **PLN (Polish Złoty)**
- Token base value: 0.20 PLN
- Auto-converts to local currency
- Conversion rates updateable via admin function
- Supports 42+ currencies

---

## 🛡 RISK MANAGEMENT

### Risk Score Calculation

```
Final Risk Score = (Base Fraud Score × Regional Multiplier) + Behavior Risk + Churn Signals
```

**Components:**
- **Base Fraud Score** — From PACK 302
- **Regional Multiplier** — Per-region risk adjustment (0.5 to 2.0)
- **Behavior Risk** — Suspicious logins, reports, chargebacks
- **Churn Signals** — From PACK 301

### Risk Levels & Actions

| Risk Level | Score Range | Swipe Limit | Chat Limit | Monetization |
|------------|-------------|-------------|------------|--------------|
| Low        | 0-24        | 1000/day    | 100/day    | Allowed      |
| Medium     | 25-49       | Regional    | Regional   | Review       |
| High       | 50-74       | 50% limit   | 50% limit  | Blocked      |
| Critical   | 75-100      | 0           | 0          | Blocked      |

---

## 📋 CONTENT MODERATION

### Regional Content Rules

Each region defines:
- **Prohibited content types** — Adult, violence, drugs, gambling, political
- **Profile requirements** — Photo required, clothing standards
- **Communication rules** — Autoplay, calls, gifting permissions
- **Cultural sensitivities** — Taboos, religious sensitivities
- **Age gating** — Minimum age, verification methods

### Moderation Workflow

1. **AI Analysis** — Auto-filter banned keywords, detect violations
2. **Auto-Decision** — Approve, flag, or block based on severity
3. **Human Review** — Configurable % sent to moderators
4. **Appeal Process** — Users can appeal with time limits

### Keyword Filtering

- **Auto-block keywords** — Immediate rejection
- **Auto-flag keywords** — Queue for review
- **Profanity levels** — None, mild, moderate, strict
- **Cultural keywords** — Region-specific sensitivities

---

## 📊 EXPANSION TRACKING

### Growth Metrics

Automatically tracked per region:
- Total users, active users (D1, D7, D30)
- New user acquisition (today, week, month)
- Growth rate, organic vs paid
- Session duration and frequency
- Retention rates

### Revenue Metrics

- Total and monthly revenue
- ARPU (Average Revenue Per User)
- Paying users and conversion rate
- LTV (Lifetime Value)

### Creator Economy

- Total, active, and monetized creators
- Total earnings and average per creator
- Integration with PACK 380 (Influencers)

### Store Performance

- Average rating and review count
- Positive vs negative reviews
- Response rate
- Integration with PACK 379

---

## 🚀 EXPANSION READINESS

### Scoring System

**5 Categories (Weighted):**

1. **Legal Compliance (25%)**
   - Region config exists
   - GDPR compliance
   - Legal disclaimers
   - Age restrictions

2. **Product Readiness (20%)**
   - Features enabled
   - Pricing configured
   - Localization complete

3. **Support Readiness (15%)**
   - Response times
   - Satisfaction scores
   - Language support

4. **Market Readiness (20%)**
   - Influencer presence
   - PR campaigns
   - Store ratings

5. **Infrastructure (20%)**
   - Risk profiles
   - Moderation rules
   - Payout system

### Blockers & Recommendations

System automatically identifies:
- **Critical blockers** — Must be resolved before launch
- **High priority** — Should be addressed
- **Medium/Low** — Nice to have

Provides actionable recommendations for improvement.

---

## 🔧 ADMIN DASHBOARD

**Path:** `admin-web/regions/`

### Pages

1. **Regions Overview**
   - All regions with key metrics
   - Readiness scores
   - Stage indicators

2. **Legal Requirements**
   - Age restrictions
   - KYC requirements
   - Required disclaimers

3. **Pricing Overview**
   - PPP multipliers
   - Tax configurations
   - Token pack pricing

4. **Feature Toggles**
   - Enable/disable features per region
   - Feature availability matrix

5. **Risk Multipliers**
   - Regional risk profiles
   - Incident tracking
   - Fraud statistics

6. **Moderation Rules**
   - Content restrictions
   - Keyword filters
   - Moderation queue

7. **Expansion Readiness**
   - Overall scores
   - Category breakdown
   - Blockers and recommendations

8. **Creator Payout Restrictions**
   - Enabled countries
   - Minimum amounts
   - Payout schedules

9. **Influencer Activity Stats**
   - Active influencers
   - Reach and engagement
   - Conversion rates

10. **Market Notes & Cultural Guides**
    - Cultural sensitivities
    - Market insights
    - Launch notes

---

## 🎚 FEATURE FLAGS

```typescript
const flags = {
  'regions.enabled': true,
  'regionalPricing.enabled': true,
  'regionalKYC.enabled': true,
  'regionalModeration.enabled': true,
  'regionalRisk.enabled': true,
  'regionalExpansion.enabled': true,
};
```

---

## 📖 USAGE EXAMPLES

### Client: Get Region Configuration

```typescript
const result = await pack381_getRegionConfig({
  countryCode: 'US'
});

console.log(result.features.adultMode); // true/false
console.log(result.legal.minAge); // 18
console.log(result.currency); // 'USD'
```

### Client: Check Feature Availability

```typescript
const result = await pack381_validateFeatureAvailability({
  featureName: 'paidCalls'
});

if (!result.available) {
  showError('Paid calls not available in your region');
}
```

### Client: Get Localized Pricing

```typescript
const result = await pack381_applyRegionalPricing({
  regionId: 'IN'
});

// result.packs = {
//   pack_100: { tokens: 100, priceLocal: 150, currency: 'INR' }
// }
```

### Admin: Update Region Config

```typescript
await pack381_updateRegionConfig({
  regionId: 'FR',
  enabled: true,
  legal: {
    minAge: 18,
    gdprApplies: true,
    requiresKYC: false
  },
  features: {
    swipes: true,
    events: true,
    adultMode: false
  }
});
```

### Admin: Calculate Readiness Score

```typescript
const score = await pack381_expansionReadinessScore({
  regionId: 'BR'
});

console.log(score.overallScore); // 75
console.log(score.stage); // 'launch-ready'
console.log(score.blockers); // [{ category: 'legal', issue: '...' }]
```

---

## 🌐 SUPPORTED REGIONS

### Tier 1 (Launch Ready)
- 🇵🇱 Poland — **Mature**
- 🇩🇪 Germany — **Public**
- 🇬🇧 United Kingdom — **Public**

### Tier 2 (In Progress)
- 🇺🇸 United States — **Soft Launch**
- 🇫🇷 France — **Beta**
- 🇪🇸 Spain — **Beta**
- 🇮🇹 Italy — **Beta**

### Tier 3 (Planned)
- 🇧🇷 Brazil — **Preparation**
- 🇲🇽 Mexico — **Preparation**
- 🇦🇷 Argentina — **Preparation**

### Tier 4 (Future)
- 🇮🇳 India — **Planned**
- 🇯🇵 Japan — **Planned**
- 🇦🇪 UAE — **Planned**
- 🇸🇦 Saudi Arabia — **Planned**

---

## 🗣 LANGUAGE SUPPORT

### 42+ Languages Supported

**European Languages:**
- English, Polish, German, French, Spanish, Italian, Portuguese
- Dutch, Swedish, Norwegian, Danish, Finnish
- Russian, Ukrainian, Czech, Slovak, Hungarian
- Romanian, Bulgarian, Greek, Turkish

**Asian Languages:**
- Mandarin, Japanese, Korean, Hindi, Bengali
- Thai, Vietnamese, Indonesian, Malay, Filipino

**Middle Eastern:**
- Arabic, Hebrew, Farsi, Urdu

**Others:**
- Swahili, Zulu, Afrikaans

---

## 🔍 MONITORING & ANALYTICS

### Key Metrics Dashboard

1. **Growth Tracking**
   - Daily/Weekly/Monthly new users per region
   - Growth rate trends
   - Organic vs paid acquisition

2. **Risk Monitoring**
   - Regional risk distribution
   - Incident frequency
   - Fraud patterns

3. **Moderation Stats**
   - Auto-approve/flag/block rates
   - Human review volume
   - Appeal success rates

4. **Revenue Analytics**
   - Revenue per region
   - ARPU trends
   - Conversion funnels

5. **Readiness Tracking**
   - Score history per region
   - Blocker resolution
   - Launch timeline

---

## 🚨 COMPLIANCE & LEGAL

### GDPR Compliance (EU)

- Data residency options
- Right to be forgotten
- Data portability
- Consent management
- Privacy policy per region

### Age Verification

- Minimum age per region (13-21)
- Verification methods:
  - ID verification
  - Credit card
  - Phone number
  - Facial recognition
  - Email confirmation

### Content Regulations

- MENA: Strict content review, no nudity
- EU: GDPR disclaimers, data protection
- US: Section 230 disclaimers
- Asia: Government content restrictions

### Financial Compliance

- KYC/AML for payouts
- Tax collection and reporting
- Sanctions screening
- Cross-border payment compliance

---

## 📞 SUPPORT

### Regional Support Requirements

1. **Language Coverage** — Support in local languages
2. **Response Times** — Based on region SLA
3. **Cultural Training** — Support team regional awareness
4. **Legal Knowledge** — Country-specific law expertise
5. **Time Zone Coverage** — 24/7 or regional hours

### Escalation Matrix

- **L1** — Basic queries, regional support team
- **L2** — Complex issues, specialist team
- **L3** — Critical legal/compliance, C-level

---

## 🎖 CTO FINAL VERDICT

**PACK 381 is MANDATORY for Avalo to launch globally without risking:**

❌ Compliance violations  
❌ Banned regions  
❌ Payout failures  
❌ Localization gaps  
❌ Content regulation penalties  
❌ PR disasters from cultural mismatch  

✅ **With this pack, Avalo becomes a true international product, not just an app exported from one market.**

---

## 📚 INTEGRATION GUIDE

### Step 1: Deploy Functions

```bash
cd functions
npm install
firebase deploy --only functions:pack381
```

### Step 2: Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

### Step 3: Create Indexes

```bash
firebase deploy --only firestore:indexes
```

### Step 4: Initialize First Region

```typescript
await pack381_updateRegionConfig({
  regionId: 'PL',
  countryCode: 'PL',
  countryName: 'Poland',
  enabled: true,
  // ... full configuration
});
```

### Step 5: Configure Pricing

```typescript
await pack381_updateRegionalPricing({
  regionId: 'PL',
  currency: 'PLN',
  ppp: { enabled: false, multiplier: 1.0 },
  tax: { type: 'VAT', rate: 0.23, included: true },
  // ... pricing details
});
```

### Step 6: Set Risk Profile

```typescript
await pack381_updateRegionalRisk({
  regionId: 'PL',
  risk: {
    baseLevel: 'low',
    fraudMultiplier: 1.0
  },
  // ... risk configuration
});
```

### Step 7: Configure Content Rules

```typescript
await pack381_updateContentRules({
  regionId: 'PL',
  prohibitedContent: {
    adultContent: { allowed: true, ageRestriction: 18 },
    // ... content rules
  }
});
```

---

## 🔗 RELATED DOCUMENTATION

- [PACK 277 — Wallet & Multi-Currency](./PACK_277_WALLET.md)
- [PACK 302 — Fraud Detection](./PACK_302_FRAUD_DETECTION.md)
- [PACK 378 — Legal / VAT / Compliance](./PACK_378_LEGAL_COMPLIANCE.md)
- [PACK 379 — Store Defense](./PACK_379_STORE_DEFENSE.md)
- [PACK 380 — PR & Influencer Engine](./PACK_380_PR_INFLUENCER.md)

---

## 📅 VERSION HISTORY

- **v1.0.0** (2024-12-30) — Initial implementation
  - Region configuration system
  - Regional pricing engine
  - Risk management system
  - Content moderation
  - Expansion tracking
  - Readiness scoring

---

## 👥 TEAM

**Lead Engineer:** CTO Framework  
**Security Review:** Security Team  
**Legal Review:** Legal & Compliance Team  
**Product:** Growth & Expansion Team  

---

**Status:** ✅ Production Ready  
**Last Updated:** 2024-12-30  
**Next Review:** Q1 2025
