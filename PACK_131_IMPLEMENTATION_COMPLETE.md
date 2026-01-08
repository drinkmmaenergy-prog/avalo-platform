# PACK 131: Global Affiliate / Influencer Referral Engine - Implementation Complete

## Overview

The Global Affiliate / Influencer Referral Engine enables partners to refer new users to Avalo through tracking links and invite codes, with strict zero-token-bonus rules and comprehensive fraud prevention.

### Core Principles

✅ **Zero Token Economy Impact**
- No free tokens, gift credits, or bonus multipliers
- No token rewards for signups
- Fiat payouts only (CPA/CPL model)

✅ **Zero Social Impact**
- No preferential ranking or visibility boosts
- No exclusive features or monetization perks
- Normal user experience for referred users

✅ **Strict Fraud Prevention**
- Device and IP clustering detection
- VPN and emulator detection
- Velocity monitoring
- Automatic suspension for suspicious patterns

✅ **Privacy Protection**
- Affiliates cannot see user identities
- No access to purchasing behavior
- No access to DMs or followers
- Aggregated analytics only

## Architecture

### Backend Components

#### 1. Types & Models
**File:** [`functions/src/affiliate/types.ts`](functions/src/affiliate/types.ts:1)

Core interfaces:
- [`AffiliateProfile`](functions/src/affiliate/types.ts:18) - Affiliate account data
- [`AffiliateReferral`](functions/src/affiliate/types.ts:76) - Individual signup tracking
- [`AffiliatePayout`](functions/src/affiliate/types.ts:112) - Payment processing
- [`AffiliateAnalytics`](functions/src/affiliate/types.ts:130) - Aggregated metrics
- [`AffiliateLandingPage`](functions/src/affiliate/types.ts:152) - Custom landing pages

#### 2. Fraud Detection
**File:** [`functions/src/affiliate/fraud-detection.ts`](functions/src/affiliate/fraud-detection.ts:1)

Key functions:
- [`detectFraud()`](functions/src/affiliate/fraud-detection.ts:22) - Multi-factor fraud analysis
- [`updateReferralRetention()`](functions/src/affiliate/fraud-detection.ts:238) - Track user retention
- [`checkPayoutEligibility()`](functions/src/affiliate/fraud-detection.ts:249) - Verify payout requirements
- [`blockFraudulentAffiliate()`](functions/src/affiliate/fraud-detection.ts:267) - Suspend bad actors

Fraud detection checks:
1. Duplicate IP detection (max 3/day)
2. Duplicate device detection (max 2/day)
3. Velocity anomalies (max 10/hour per affiliate)
4. VPN detection
5. Emulator detection
6. Pattern matching (repeat users)

#### 3. Core Functions
**File:** [`functions/src/affiliate/functions.ts`](functions/src/affiliate/functions.ts:1)

Main operations:
- [`createAffiliateProfile()`](functions/src/affiliate/functions.ts:40) - Register new affiliate
- [`generateAffiliateLink()`](functions/src/affiliate/functions.ts:124) - Create referral URL
- [`recordReferral()`](functions/src/affiliate/functions.ts:160) - Track new signup
- [`getAffiliateAnalytics()`](functions/src/affiliate/functions.ts:279) - Fetch metrics
- [`requestAffiliatePayout()`](functions/src/affiliate/functions.ts:393) - Initiate payment
- [`processAffiliatePayout()`](functions/src/affiliate/functions.ts:469) - Complete payment (admin)
- [`suspendAffiliate()`](functions/src/affiliate/functions.ts:522) - Enforce violations

#### 4. Cloud Functions
**File:** [`functions/src/affiliate/index.ts`](functions/src/affiliate/index.ts:1)

Exported functions:
- [`affiliateCreateProfile`](functions/src/affiliate/index.ts:23) - POST profile creation
- [`affiliateGenerateLink`](functions/src/affiliate/index.ts:33) - GET referral link
- [`affiliateRecordReferral`](functions/src/affiliate/index.ts:42) - POST signup tracking
- [`affiliateGetAnalytics`](functions/src/affiliate/index.ts:56) - GET metrics
- [`affiliateRequestPayout`](functions/src/affiliate/index.ts:65) - POST payout request
- [`affiliateSignAgreement`](functions/src/affiliate/index.ts:119) - POST compliance
- [`affiliateUpdateLandingPage`](functions/src/affiliate/index.ts:145) - PUT landing page

Scheduled jobs:
- [`affiliateUpdateRetention`](functions/src/affiliate/index.ts:177) - Daily retention check
- [`affiliateMonitorFraud`](functions/src/affiliate/index.ts:276) - Hourly fraud scan

### Security Rules
**File:** [`firestore-rules/affiliate.rules`](firestore-rules/affiliate.rules:1)

Key restrictions:
- Affiliates can only read their own data
- Cannot access user private information
- Cannot modify referrals directly (Cloud Functions only)
- Landing pages require approval
- Admin-only payout processing

### Frontend Components

#### 1. Affiliate Dashboard
**File:** [`app-mobile/app/affiliate/dashboard.tsx`](app-mobile/app/affiliate/dashboard.tsx:1)

Features:
- Referral link generation and sharing
- Real-time analytics (Day/Week/Month/All-time)
- Referral stats (Total/Verified/Pending)
- Retention metrics (Day 1/7/30)
- Earnings tracking and payout requests
- Fraud alerts

#### 2. Landing Page Builder
**File:** [`app-mobile/app/affiliate/landing-page.tsx`](app-mobile/app/affiliate/landing-page.tsx:1)

Features:
- Pre-approved template selection
- Optional custom photo
- Social media links (Instagram, Twitter, YouTube, TikTok)
- Real-time preview
- Content restrictions validation

#### 3. Compliance Center
**File:** [`app-mobile/app/affiliate/compliance.tsx`](app-mobile/app/affiliate/compliance.tsx:1)

Features:
- Requirements checklist
- Business agreement signing
- Anti-MLM and Anti-Spam acceptance
- Identity verification status
- Tax information tracking
- Payout method configuration
- Violation history

## Integration Guide

### 1. Backend Setup

Add affiliate functions export to main functions index:

```typescript
// functions/src/index.ts
export * from './affiliate';
```

Deploy functions:
```bash
firebase deploy --only functions
```

### 2. Firestore Setup

Deploy security rules:
```bash
firebase deploy --only firestore:rules
```

Create indexes:
```bash
# affiliate_referrals
- affiliateId (ASC) + createdAt (DESC)
- affiliateCode (ASC) + createdAt (DESC)
- userId (ASC)
- signupIP (ASC) + createdAt (DESC)
- signupDeviceId (ASC) + createdAt (DESC)
- fraudStatus (ASC) + affiliateId (ASC)

# affiliate_profiles
- userId (ASC)
- affiliateCode (ASC)
- status (ASC)
```

### 3. User Signup Integration

Add referral tracking to signup flow:

```typescript
// During user registration
const urlParams = new URLSearchParams(window.location.search);
const referralCode = urlParams.get('ref');

if (referralCode) {
  // Store in session for post-signup
  sessionStorage.setItem('referralCode', referralCode);
}

// After successful signup
const storedReferralCode = sessionStorage.getItem('referralCode');
if (storedReferralCode) {
  const functions = getFunctions();
  const recordReferral = httpsCallable(functions, 'affiliateRecordReferral');
  
  await recordReferral({
    affiliateCode: storedReferralCode,
    userId: newUser.uid,
    signupIP: await getUserIP(),
    signupDeviceId: await getDeviceId(),
    signupUserAgent: navigator.userAgent,
  });
  
  sessionStorage.removeItem('referralCode');
}
```

### 4. Verification Integration

Mark users as verified after identity check:

```typescript
// After user completes verification
const functions = getFunctions();
const markVerified = httpsCallable(functions, 'affiliateMarkVerified');

await markVerified({ userId: user.uid });
```

### 5. Retention Tracking

Update user activity for retention metrics:

```typescript
// On user login or activity
await db.collection('users').doc(userId).update({
  lastActive: serverTimestamp(),
});
```

## API Reference

### Create Affiliate Profile

```typescript
const functions = getFunctions();
const createProfile = httpsCallable(functions, 'affiliateCreateProfile');

const result = await createProfile({
  userId: 'user_123',
  email: 'affiliate@example.com',
  businessName: 'My Business',
  taxId: '12-3456789',
  taxCountry: 'US',
  payoutMethod: 'bank_transfer',
  payoutDetails: {
    accountNumber: 'encrypted',
    routingNumber: 'encrypted',
  },
});

// Returns: { affiliateId, affiliateCode }
```

### Generate Referral Link

```typescript
const generateLink = httpsCallable(functions, 'affiliateGenerateLink');

const result = await generateLink({
  affiliateId: 'aff_123',
});

// Returns: { referralUrl: 'https://avalo.app/?ref=ABC12345', affiliateCode: 'ABC12345' }
```

### Get Analytics

```typescript
const getAnalytics = httpsCallable(functions, 'affiliateGetAnalytics');

const result = await getAnalytics({
  affiliateId: 'aff_123',
  period: 'week', // 'day' | 'week' | 'month' | 'all_time'
});

// Returns: AffiliateAnalytics object with metrics
```

### Request Payout

```typescript
const requestPayout = httpsCallable(functions, 'affiliateRequestPayout');

const result = await requestPayout({
  affiliateId: 'aff_123',
});

// Returns: { payoutId, amount, referralCount }
```

## Payout Model

### CPA (Cost Per Acquisition)
- **Amount:** $10.00 USD per verified user
- **Eligibility:** 
  - User must complete verification
  - User must show Day 1 retention
  - 30-day processing period after verification
  - No fraud flags
- **Minimum Payout:** $50.00 USD

### Payment Schedule
- Payouts processed weekly (batch)
- Processing time: 5-7 business days
- Methods: Bank transfer, PayPal, Stripe

## Fraud Prevention

### Detection Thresholds

```typescript
const FRAUD_DETECTION_CONFIG = {
  maxSignupsPerIPPerDay: 3,
  maxSignupsPerDevicePerDay: 2,
  maxSignupsPerAffiliatePerHour: 10,
  suspiciousScoreThreshold: 60,
  fraudScoreThreshold: 80,
};
```

### Fraud Score Calculation

| Check | Score | Severity |
|-------|-------|----------|
| Duplicate IP (3+ in 24h) | +30 | High |
| Duplicate Device (2+ in 24h) | +35 | High |
| Velocity Anomaly (10+ in 1h) | +20 | Medium |
| VPN Detected | +15 | Medium |
| Emulator Detected | +25 | High |
| User Pattern Match | +40 | High |

**Thresholds:**
- Score 0-59: Clean
- Score 60-79: Suspicious (flagged but allowed)
- Score 80+: Confirmed Fraud (blocked)

### Automatic Actions

1. **Score 60-79:** Referral flagged for manual review
2. **Score 80+:** Signup blocked, affiliate notified
3. **5+ Suspicious in 1 hour:** Affiliate suspended automatically

## Compliance Requirements

### Affiliate Activation Checklist

1. ✅ Sign Business Agreement
2. ✅ Accept Anti-MLM Policy
3. ✅ Accept Anti-Spam Policy
4. ✅ Verify Identity
5. ✅ Provide Tax Information
6. ✅ Configure Payout Method

### Violation System

| Severity | First | Second | Third |
|----------|-------|--------|-------|
| 1 (Warning) | Warning + Education | Suspension | Termination |
| 2 (Suspension) | Suspension | Termination | - |
| 3 (Termination) | Immediate Ban | - | - |

### Prohibited Content

Landing pages **CANNOT** include:
- Monetization promises ("Earn $100/day")
- Claims about "making money"
- References to dating/escort services
- Explicit content claims
- MLM language ("Recruit friends and earn")
- Fake testimonials
- Misleading app features

## Testing

### Test Fraud Detection

```typescript
// Test duplicate IP
for (let i = 0; i < 4; i++) {
  await recordReferral({
    affiliateCode: 'TEST123',
    userId: `user_${i}`,
    signupIP: '192.168.1.100',
    signupDeviceId: `device_${i}`,
  });
}
// 4th signup should be flagged

// Test velocity
for (let i = 0; i < 11; i++) {
  await recordReferral({
    affiliateCode: 'TEST123',
    userId: `user_${Date.now()}_${i}`,
    signupIP: `192.168.1.${100 + i}`,
    signupDeviceId: `device_${Date.now()}_${i}`,
  });
}
// 11th signup should trigger velocity alert
```

### Test Payout Eligibility

```typescript
// Create referrals
const referralId = await recordReferral(...);

// Mark as verified
await markReferralVerified(userId);

// Wait 30 days or mock time
// Mark Day 1 retention
await updateReferralRetention(referralId, 1);

// Check eligibility
const eligible = await checkPayoutEligibility(referralId);
// Should return true

// Request payout
const payout = await requestAffiliatePayout({
  affiliateId: 'aff_123',
});
```

## Monitoring

### Key Metrics to Track

1. **Conversion Funnel**
   - Link clicks → Signups
   - Signups → Verifications
   - Verifications → Day 1 Retention

2. **Fraud Rates**
   - % of flagged referrals
   - % of confirmed fraud
   - Affiliate suspension rate

3. **Payout Metrics**
   - Average payout per affiliate
   - Payout processing time
   - Dispute rate

4. **Affiliate Health**
   - Active affiliates
   - Average referrals per affiliate
   - Retention quality (Day 7, Day 30)

### Alerting Rules

- Fraud score >80: Immediate notification
- 5+ affiliates suspended in 1 hour: System alert
- Payout processing delays >7 days: Finance alert
- Violation rate >5%: Review program terms

## Files Created

### Backend
- [`functions/src/affiliate/types.ts`](functions/src/affiliate/types.ts:1) - Type definitions
- [`functions/src/affiliate/fraud-detection.ts`](functions/src/affiliate/fraud-detection.ts:1) - Fraud engine
- [`functions/src/affiliate/functions.ts`](functions/src/affiliate/functions.ts:1) - Core logic
- [`functions/src/affiliate/index.ts`](functions/src/affiliate/index.ts:1) - Exports
- [`firestore-rules/affiliate.rules`](firestore-rules/affiliate.rules:1) - Security rules

### Frontend
- [`app-mobile/app/affiliate/dashboard.tsx`](app-mobile/app/affiliate/dashboard.tsx:1) - Analytics dashboard
- [`app-mobile/app/affiliate/landing-page.tsx`](app-mobile/app/affiliate/landing-page.tsx:1) - Page builder
- [`app-mobile/app/affiliate/compliance.tsx`](app-mobile/app/affiliate/compliance.tsx:1) - Compliance center

### Documentation
- `PACK_131_IMPLEMENTATION_COMPLETE.md` - This file

## Verification Checklist

- [x] Backend types and models created
- [x] Fraud detection engine implemented
- [x] Core functions with payout logic implemented
- [x] Cloud Functions exported with schedules
- [x] Firestore security rules created
- [x] Mobile dashboard UI implemented
- [x] Landing page builder UI implemented
- [x] Compliance center UI implemented
- [x] Zero token rewards enforced
- [x] Zero visibility boosts enforced
- [x] Privacy protections enforced
- [x] Fraud prevention active
- [x] MLM structures blocked
- [x] NSFW claims blocked
- [x] Documentation complete

## Next Steps

1. **Deploy Backend**
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions
   ```

2. **Deploy Security Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Create Firestore Indexes**
   - Use Firebase Console or `firebase deploy --only firestore:indexes`

4. **Configure Scheduled Functions**
   - Verify timezone settings
   - Test retention updates
   - Monitor fraud detection

5. **Test End-to-End**
   - Create test affiliate profile
   - Generate referral link
   - Complete test signup flow
   - Verify fraud detection
   - Test payout request

6. **Launch Monitoring**
   - Set up dashboards in Firebase Console
   - Configure alerts for fraud patterns
   - Monitor payout processing

## Support

For questions or issues:
- Review fraud detection logs in Firebase Console
- Check Cloud Function logs for errors
- Monitor Firestore usage for suspicious patterns
- Contact platform team for affiliate disputes

---

**Implementation Status:** ✅ Complete
**Last Updated:** 2025-11-28
**Pack Version:** 131.0.0