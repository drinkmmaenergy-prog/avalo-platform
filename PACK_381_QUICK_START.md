# PACK 381 — Regional Expansion Engine
## Quick Start Guide

This guide will help you deploy and configure PACK 381 for global market expansion.

---

## 📋 Prerequisites

Before deploying PACK 381, ensure you have:

- ✅ Firebase project set up
- ✅ Firebase CLI installed (`npm install -g firebase-tools`)
- ✅ Logged in to Firebase (`firebase login`)
- ✅ Node.js and npm installed
- ✅ Admin access to Firebase project
- ✅ PACK 277, 296, 301, 302 deployed (dependencies)

---

## 🚀 Quick Deployment (5 Minutes)

### Step 1: Deploy Everything

```bash
chmod +x deploy-pack381.sh
./deploy-pack381.sh
```

The script will:
1. Deploy Firestore indexes
2. Install function dependencies
3. Deploy all 29 Cloud Functions
4. Verify deployment

---

## 🔧 Initial Configuration

### Step 2: Configure Your First Region

Use the Firebase console or Admin SDK to initialize your first region:

```typescript
// Example: Configure Poland as the first region
const result = await pack381_updateRegionConfig({
  regionId: 'PL',
  countryCode: 'PL',
  countryName: 'Poland',
  enabled: true,
  
  legal: {
    minAge: 18,
    requiresKYC: false,
    requiresTaxId: false,
    gdprApplies: true,
    dataResidencyRequired: false,
    contentRestrictions: [],
    requiredDisclamers: [
      'Avalo is not responsible for offline interactions',
      'Content is user-generated'
    ],
    acceptedDocuments: ['passport', 'id_card', 'drivers_license'],
  },
  
  localization: {
    languages: ['pl', 'en'],
    primaryLanguage: 'pl',
    currency: 'PLN',
    timezone: 'Europe/Warsaw',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: 'space_comma',
    rtl: false,
  },
  
  payment: {
    supportedProviders: ['stripe', 'paypal'],
    walletEnabled: true,
    payoutsEnabled: true,
    minPayoutAmount: 50,
    taxRate: 0.23, // 23% VAT
    taxLabel: 'VAT',
    processingFeePercent: 2.9,
    currencyConversionFee: 0.01,
  },
  
  creator: {
    monetizationEnabled: true,
    verificationRequired: false,
    minFollowersForMonetization: 100,
    earningsRestrictions: [],
    payoutSchedule: 'bi-weekly',
    minAge: 18,
    backgroundCheckRequired: false,
  },
  
  moderation: {
    aiModerationLevel: 'moderate',
    humanReviewRequired: true,
    autoplayRestricted: false,
    profilePhotoReview: true,
    chatMonitoring: 'flagged',
    prohibitedContent: ['child_abuse', 'terrorism', 'illegal_drugs'],
    culturalSensitivities: [],
  },
  
  features: {
    swipes: true,
    events: true,
    aiCompanions: true,
    paidCalls: true,
    liveArena: true,
    marketplace: true,
    adultMode: true,
    incognito: true,
    passport: true,
  },
  
  risk: {
    riskLevel: 'low',
    fraudScoreMultiplier: 1.0,
    vpnRestricted: false,
    deviceVerificationRequired: false,
    smsVerificationRequired: false,
    maxAccountsPerDevice: 3,
    geoFencingEnabled: false,
  },
  
  market: {
    stage: 'mature',
    targetAudience: ['young_professionals', 'students', 'creatives'],
    competitivePosition: 'leader',
    marketSize: 38000000,
    penetrationRate: 5.2,
    holidays: [
      { date: '2024-01-01', name: 'New Year' },
      { date: '2024-12-25', name: 'Christmas' },
    ],
    peakUsageHours: [18, 19, 20, 21, 22],
  },
});
```

### Step 3: Configure Regional Pricing

```typescript
await pack381_updateRegionalPricing({
  regionId: 'PL',
  countryCode: 'PL',
  currency: 'PLN',
  
  ppp: {
    enabled: false, // Poland is baseline
    multiplier: 1.0,
    calculatedFrom: 'World Bank PPP 2024',
    lastUpdated: new Date().toISOString(),
  },
  
  tax: {
    type: 'VAT',
    rate: 0.23,
    included: true, // Price includes VAT
    label: 'VAT',
    taxIdRequired: false,
    businessTaxRate: 0.23,
  },
  
  tokenPacks: {
    pack_100: { tokens: 100, priceLocal: 20, pricePLN: 20, discount: 0, popular: false },
    pack_500: { tokens: 500, priceLocal: 95, pricePLN: 95, discount: 5, popular: true },
    pack_1000: { tokens: 1000, priceLocal: 180, pricePLN: 180, discount: 10, popular: false },
    pack_2500: { tokens: 2500, priceLocal: 425, pricePLN: 425, discount: 15, popular: false },
    pack_5000: { tokens: 5000, priceLocal: 800, pricePLN: 800, discount: 20, popular: false },
    pack_10000: { tokens: 10000, priceLocal: 1500, pricePLN: 1500, discount: 25, popular: false },
  },
  
  minimums: {
    tokenPack: 10,
    payout: 50,
    transaction: 1,
  },
  
  payout: {
    enabled: true,
    restrictions: [],
    fee: 0.02, // 2%
    minimumAmount: 50,
    maximumAmount: 10000,
    processingTime: '1-3 business days',
    supportedMethods: ['bank_transfer', 'paypal'],
  },
  
  conversion: {
    rateToPLN: 1.0,
    rateToUSD: 4.1,
    rateToEUR: 4.3,
    conversionFee: 0.01,
    lastUpdated: new Date().toISOString(),
    provider: 'ECB',
  },
});
```

### Step 4: Set Up Risk Profile

```typescript
await pack381_updateRegionalRisk({
  regionId: 'PL',
  countryCode: 'PL',
  
  risk: {
    baseLevel: 'low',
    fraudMultiplier: 1.0,
    scriptingRisk: 0.1,
    vpnUsageRate: 15,
    chargebackRate: 0.5,
    accountTakeoverRisk: 0.1,
  },
  
  fraudVectors: {
    fakeProfiles: { weight: 1.0, threshold: 70 },
    paymentFraud: { weight: 2.0, threshold: 80 },
    contentAbuse: { weight: 0.5, threshold: 60 },
    accountFarming: { weight: 1.5, threshold: 75 },
    catfishing: { weight: 1.0, threshold: 70 },
    scamming: { weight: 2.0, threshold: 85 },
    spamming: { weight: 0.5, threshold: 65 },
  },
  
  thresholds: {
    suspiciousActivityScore: 60,
    autoBlockScore: 85,
    swipeLimit: 200,
    chatLimit: 50,
    reportThreshold: 3,
    velocityThreshold: 10,
  },
  
  trust: {
    defaultTrustScore: 50,
    verificationBoost: 20,
    kycRequired: false,
    phoneVerificationRequired: true,
    emailVerificationRequired: true,
    documentVerificationRequired: false,
    minAccountAge: 0,
  },
  
  creatorTrust: {
    minTrustScore: 60,
    minAccountAge: 7,
    minFollowers: 100,
    backgroundCheckRequired: false,
    taxIdRequired: false,
    bankVerificationRequired: true,
    initialPayoutDelay: 14,
  },
  
  monitoring: {
    aiModerationLevel: 'moderate',
    humanReviewPercentage: 10,
    realTimeMonitoring: true,
    retrospectiveScan: true,
    anomalyDetectionEnabled: true,
  },
  
  patterns: {
    peakFraudHours: [2, 3, 4],
    commonFraudIPs: [],
    suspiciousDeviceFingerprints: [],
    blockedPaymentMethods: [],
    highRiskAreas: [],
  },
});
```

### Step 5: Configure Content Rules

```typescript
await pack381_updateContentRules({
  regionId: 'PL',
  countryCode: 'PL',
  
  prohibitedContent: {
    adultContent: {
      allowed: true,
      ageRestriction: 18,
      requiresVerification: true,
      blurByDefault: true,
    },
    profanity: {
      level: 'moderate',
      autoFilter: true,
      bannedWords: ['example_word'], // Add your list
    },
    violence: {
      allowed: false,
      level: 'none',
    },
    nudity: {
      allowed: true,
      partialAllowed: true,
      artisticException: true,
    },
    drugs: {
      allowed: false,
      medicalException: true,
    },
    gambling: {
      allowed: true,
      ageRestriction: 18,
    },
    political: {
      allowed: true,
      requiresDisclaimer: false,
      electionPeriodRestrictions: false,
    },
    religious: {
      allowed: true,
      sensitivities: [],
    },
  },
  
  profile: {
    photoRequired: true,
    realPhotosOnly: true,
    faceVisible: false,
    minClothingStandard: 'casual',
    bannedSymbols: ['swastika', 'isis_flag'],
    nameVerification: false,
  },
  
  communication: {
    autoplayVideos: true,
    autoplayAudio: false,
    voiceCallsAllowed: true,
    videoCallsAllowed: true,
    giftingAllowed: true,
    maxMessageLength: 5000,
    linksSharingAllowed: false,
    externalContactAllowed: false,
  },
  
  cultural: {
    sensitivities: [],
    holidays: [
      { date: '2024-12-25', name: 'Christmas', restrictedContent: [] },
    ],
    taboos: [],
    preferredGreetings: ['Cześć', 'Dzień dobry'],
  },
  
  moderation: {
    aiLevel: 'moderate',
    humanReviewRequired: true,
    humanReviewPercentage: 10,
    autoFlagKeywords: ['suspicious'],
    autoBlockKeywords: ['illegal'],
    appealProcess: true,
    appealTimeLimit: 48,
  },
  
  ageGating: {
    required: true,
    minimumAge: 18,
    verificationMethod: ['email', 'phone'],
    gracePeriod: 7,
    restrictedContent: ['adult_content', 'gambling'],
  },
});
```

---

## 🧪 Testing

### Test Region Detection

```typescript
const region = await pack381_detectUserRegion({
  countryCode: 'PL',
  language: 'pl'
});
console.log(region); // { regionId: 'PL', detected: true }
```

### Test Pricing

```typescript
const pricing = await pack381_applyRegionalPricing({
  regionId: 'PL'
});
console.log(pricing.packs.pack_500); 
// { tokens: 500, priceLocal: 95, currency: 'PLN' }
```

### Test Risk Calculation

```typescript
const risk = await pack381_calculateRegionalRiskScore({
  userId: 'test_user_id',
  regionId: 'PL'
});
console.log(risk);
// { riskScore: 15, riskLevel: 'low', monetizationEligible: true }
```

### Test Content Moderation

```typescript
const moderation = await pack381_applyRegionalModeration({
  contentType: 'bio',
  content: 'Hello, I am a test user',
  regionId: 'PL'
});
console.log(moderation);
// { approved: true, decision: 'approved' }
```

---

## 🌍 Add More Regions

### Example: United States

```typescript
await pack381_updateRegionConfig({
  regionId: 'US',
  countryCode: 'US',
  countryName: 'United States',
  enabled: true,
  legal: {
    minAge: 18,
    requiresKYC: true,
    gdprApplies: false,
    requiredDisclamers: [
      'Avalo is not responsible for offline interactions',
      'Section 230 protection applies'
    ],
  },
  localization: {
    languages: ['en', 'es'],
    primaryLanguage: 'en',
    currency: 'USD',
    timezone: 'America/New_York',
    rtl: false,
  },
  // ... rest of configuration
});

await pack381_updateRegionalPricing({
  regionId: 'US',
  currency: 'USD',
  ppp: {
    enabled: true,
    multiplier: 1.2, // US prices 20% higher
  },
  tax: {
    type: 'Sales Tax',
    rate: 0.08, // Varies by state
    included: false,
  },
  // ... rest of pricing
});
```

### Example: India (with PPP)

```typescript
await pack381_updateRegionConfig({
  regionId: 'IN',
  countryCode: 'IN',
  countryName: 'India',
  enabled: true,
  // ... configuration
});

await pack381_updateRegionalPricing({
  regionId: 'IN',
  currency: 'INR',
  ppp: {
    enabled: true,
    multiplier: 0.4, // 60% cheaper for India
  },
  conversion: {
    rateToPLN: 20.5, // 1 PLN = 20.5 INR
    rateToUSD: 83,
    rateToEUR: 90,
  },
  // ... rest of pricing
});
```

---

## 📊 Monitor Expansion

### Check Readiness Score

```typescript
const readiness = await pack381_expansionReadinessScore({
  regionId: 'US'
});

console.log(readiness.overallScore); // 75
console.log(readiness.stage); // 'launch-ready'
console.log(readiness.blockers); // [{ category: 'legal', issue: '...' }]
```

### Get Expansion Overview

```typescript
const overview = await pack381_getExpansionOverview();

overview.regions.forEach(region => {
  console.log(`${region.countryName}: ${region.readinessScore}% ready`);
});
```

### Calculate Growth Metrics

```typescript
await pack381_calculateGrowthMetrics({
  regionId: 'PL'
});
```

---

## 🎯 Best Practices

### 1. Region Rollout Phases

1. **Planned** — Research and documentation
2. **Preparation** — Legal and infrastructure setup
3. **Beta** — Closed testing with 100-1000 users
4. **Soft Launch** — Limited public access
5. **Public** — Full launch with marketing
6. **Mature** — Established market

### 2. Pricing Strategy

- Use PPP for emerging markets
- Keep tax included in display price for B2C
- Update conversion rates monthly
- Monitor chargeback rates

### 3. Risk Management

- Start with higher risk multipliers
- Lower gradually as trust builds
- Monitor fraud patterns weekly
- Adjust thresholds based on data

### 4. Content Moderation

- Start strict, loosen gradually
- Train moderators on cultural nuances
- Review auto-block keywords monthly
- Track appeal success rates

### 5. Expansion Timing

- Don't launch during holidays
- Prepare 3 months in advance
- Beta test for 4-6 weeks
- Monitor first 48 hours intensively

---

## 🚨 Troubleshooting

### Functions Not Deploying

```bash
# Check logs
firebase functions:log

# Deploy individually
firebase deploy --only functions:pack381_getRegionConfig

# Check function status
firebase functions:list | grep pack381
```

### Indexes Not Created

```bash
# Check index status
firebase firestore:indexes

# Manually create if needed
firebase deploy --only firestore:indexes
```

### Region Not Detected

1. Check if region is enabled
2. Verify country code is correct
3. Test with explicit regionId
4. Check user's detectedRegion field

---

## 📚 Next Steps

1. **Read Full Documentation:** [PACK_381_REGIONAL_EXPANSION_ENGINE.md](./PACK_381_REGIONAL_EXPANSION_ENGINE.md)
2. **Configure Admin Dashboard:** Set up admin-web/regions/
3. **Set Up Monitoring:** Track metrics and alerts
4. **Plan Expansion:** Create regional roadmap
5. **Train Support:** Cultural sensitivity training

---

## 🤝 Support

For issues or questions:
- Check documentation
- Review Firebase logs
- Contact development team
- Create support ticket

---

**Version:** 1.0.0  
**Last Updated:** 2024-12-30  
**Status:** Production Ready ✅
