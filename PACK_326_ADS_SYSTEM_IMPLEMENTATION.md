# PACK 326 — In-Feed Ads System Implementation

**Status**: ✅ Complete  
**Date**: 2025-12-11  
**Integration**: PACK 277 Wallet System  
**Revenue Model**: 100% Avalo Revenue

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Firestore Collections](#firestore-collections)
4. [Cloud Functions](#cloud-functions)
5. [Pricing & Billing](#pricing--billing)
6. [Ad Delivery Logic](#ad-delivery-logic)
7. [Anti-Fraud Protection](#anti-fraud-protection)
8. [Admin Controls](#admin-controls)
9. [Integration Guide](#integration-guide)
10. [Testing](#testing)
11. [Deployment](#deployment)

---

## Overview

PACK 326 implements a comprehensive in-feed advertising system that allows brands and businesses to run sponsored content across Avalo's platform. The system supports multiple ad placements, billing models, and includes robust anti-fraud protection.

### Key Features

- **Multiple Placements**: Feed, Reels, Stories
- **Flexible Billing**: CPM (Cost Per Mille) and CPC (Cost Per Click)
- **100% Avalo Revenue**: All ad revenue goes to platform
- **Token-Based Billing**: Integrated with PACK 277 wallet system
- **Anti-Fraud Protection**: Rate limiting, pattern detection, suspicious activity alerts
- **Real-Time Billing**: Automatic token deduction on impressions/clicks
- **Admin Moderation**: Creative approval workflow
- **Targeting**: Region, gender, age, interests

### Business Model

```
Revenue Flow:
Advertiser → Wallet (PACK 277) → Ads System → 100% Avalo Platform Revenue

No Creator Earnings: Unlike other monetization features, ads generate 
pure platform revenue with no revenue sharing.
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     PACK 326 ADS SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Campaign   │─────▶│   Creative   │─────▶│   Admin   │ │
│  │  Management  │      │  Moderation  │      │  Controls │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│         │                      │                     │       │
│         └──────────────────────┼─────────────────────┘       │
│                                ▼                             │
│                    ┌──────────────────────┐                  │
│                    │    Ad Delivery       │                  │
│                    │    Engine            │                  │
│                    └──────────────────────┘                  │
│                                │                             │
│                    ┌───────────┴───────────┐                 │
│                    ▼                       ▼                 │
│         ┌────────────────┐      ┌────────────────┐          │
│         │   Impression   │      │     Click      │          │
│         │    Tracking    │      │    Tracking    │          │
│         └────────────────┘      └────────────────┘          │
│                    │                       │                 │
│                    └───────────┬───────────┘                 │
│                                ▼                             │
│                    ┌──────────────────────┐                  │
│                    │  Billing Engine      │                  │
│                    │  (CPM/CPC)           │                  │
│                    └──────────────────────┘                  │
│                                │                             │
│                                ▼                             │
│                    ┌──────────────────────┐                  │
│                    │  PACK 277 Wallet     │                  │
│                    │  (spendTokens)       │                  │
│                    └──────────────────────┘                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Firestore Collections

### 1. `adsCampaigns`

Campaign configuration and budget management.

**Schema**:
```typescript
{
  id: string;
  advertiserUserId: string | null;  // null = Avalo internal
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "REJECTED";
  budgetTokens: number;
  spentTokens: number;
  startAt: string;  // ISO date
  endAt: string;    // ISO date
  targeting: {
    regions?: string[];
    gender?: "MALE" | "FEMALE" | "NONBINARY" | "ANY";
    minAge?: number;
    maxAge?: number;
    interests?: string[];
  };
  placement: "FEED" | "REELS" | "STORIES";
  billingModel: "CPM" | "CPC";
  pricing: {
    cpmTokens?: number;
    cpcTokens?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

**Indexes**: See [`firestore-pack326-ads.indexes.json`](firestore-pack326-ads.indexes.json)

### 2. `adsCreatives`

Ad creative content (images/videos with copy).

**Schema**:
```typescript
{
  id: string;
  campaignId: string;
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  headline: string;
  description?: string;
  callToAction?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  createdAt: string;
}
```

### 3. `adsImpressions`

Impression tracking for CPM billing.

**Schema**:
```typescript
{
  id: string;
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  createdAt: string;
}
```

### 4. `adsClicks`

Click tracking for CPC billing.

**Schema**:
```typescript
{
  id: string;
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  createdAt: string;
}
```

### 5. `fraudAlerts`

Suspicious activity alerts for admin review.

**Schema**:
```typescript
{
  id: string;
  campaignId: string;
  creativeId?: string;
  alertType: "HIGH_CTR" | "SUSPICIOUS_IP" | "CLICK_VELOCITY" | "IMPRESSION_PATTERN" | "DUPLICATE_CLICKS";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  details: Record<string, any>;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: string;
}
```

---

## Cloud Functions

### Campaign Management

#### `pack326_createAdsCampaign`
Create a new ad campaign.

**Request**:
```typescript
{
  advertiserUserId: string;
  name: string;
  placement: "FEED" | "REELS" | "STORIES";
  billingModel: "CPM" | "CPC";
  pricing: { cpmTokens?: number; cpcTokens?: number };
  dailyBudgetTokens: number;
  startAt: string;
  endAt: string;
  targeting: { /* targeting options */ };
}
```

**Response**:
```typescript
{
  success: boolean;
  campaignId?: string;
  error?: string;
}
```

**Validation**:
- User must be 18+ and verified
- Minimum budget: 200 tokens
- Minimum age targeting: 18+
- Start date cannot be in past
- Campaign must run for at least 1 day

#### `pack326_createAdCreative`
Upload creative for campaign.

**Request**:
```typescript
{
  campaignId: string;
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  headline: string;
  description?: string;
  callToAction?: string;
}
```

**Validation**:
- User must own campaign
- Headline: 5-100 characters
- Description: max 200 characters
- Creative defaults to PENDING status

#### `pack326_activateCampaign`
Move campaign from DRAFT to ACTIVE.

**Requirements**:
- Campaign must be in DRAFT status
- Must have at least one APPROVED creative
- Wallet balance must cover full budget

#### `pack326_pauseCampaign` / `pack326_resumeCampaign`
Pause or resume active campaign.

#### `pack326_getCampaignDetails`
Get campaign with creatives and analytics.

#### `pack326_listMyCampaigns`
List all campaigns for current user.

### Tracking & Billing

#### `pack326_trackAdImpression`
Track ad impression with anti-fraud.

**Request**:
```typescript
{
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
}
```

**Anti-Fraud**:
- Max 1 impression per user per 10 minutes per creative
- Suspicious patterns logged but not blocked

**CPM Billing**:
- Automatic billing every 1000 impressions
- Deducts from advertiser wallet via [`spendTokens()`](functions/src/pack277-wallet-service.ts)

#### `pack326_trackAdClick`
Track ad click with anti-fraud and immediate CPC billing.

**Request**:
```typescript
{
  campaignId: string;
  creativeId: string;
  viewerUserId: string;
  ipAddress?: string;
}
```

**Anti-Fraud**:
- Max 5 clicks per IP per 24 hours per creative
- Exceeding limit blocks click and creates fraud alert

**CPC Billing**:
- Immediate token deduction per click
- If wallet insufficient, campaign auto-paused

#### `pack326_getCampaignAnalytics`
Get impressions, clicks, CTR, spend for campaign.

#### `pack326_getCreativeAnalytics`
Get performance metrics for specific creative.

### Ad Delivery

#### `pack326_getAd`
Get a single ad for placement.

**Request**:
```typescript
{
  placement: "FEED" | "REELS" | "STORIES";
}
```

**Response**:
```typescript
{
  ad?: {
    campaignId: string;
    creativeId: string;
    creative: AdsCreative;
    trackingId: string;
    destinationUrl: string;
  };
  noAdsAvailable?: boolean;
  reason?: string;
}
```

**Targeting Match**:
1. User must be 18+
2. Get user profile (region, gender, age, interests)
3. Filter active campaigns by placement
4. Match targeting criteria
5. Select random approved creative
6. Return ad or no-ads-available

#### `pack326_getBatchAds`
Get multiple ads for feed pagination with proper spacing.

**Ad Frequency**:
- 1 ad every 8-12 organic items
- Randomized spacing to feel natural

#### `pack326_checkAdAvailability`
Check if ads are available without returning actual ad.

### Admin Controls

#### `pack326_moderateCreative`
Approve or reject creative.

**Request**:
```typescript
{
  creativeId: string;
  action: "APPROVE" | "REJECT";
  rejectionReason?: string;
  adminUserId: string;
}
```

**Requirements**:
- Admin role required
- Creative must be PENDING
- Logs moderation action

#### `pack326_getPendingCreatives`
Get creatives awaiting moderation.

#### `pack326_adminPauseCampaign`
Admin force-pause or force-resume campaign.

#### `pack326_adminEndCampaign`
Admin force-end campaign.

#### `pack326_adminListCampaigns`
List all campaigns (admin view).

#### `pack326_getFraudAlerts`
Get fraud alerts for review.

#### `pack326_reviewFraudAlert`
Mark fraud alert as reviewed with resolution.

#### `pack326_getCampaignAuditLog`
Get full audit trail for campaign.

#### `pack326_getAdminDashboardStats`
Get overview stats:
- Active/paused campaigns
- Pending creatives
- Total impressions/clicks
- Overall CTR
- Total revenue
- Unreviewed fraud alerts

---

## Pricing & Billing

### Default Pricing

```typescript
CPM: 40 tokens per 1000 impressions
CPC: 8 tokens per click

Minimum Campaign Budget: 200 tokens
Minimum Daily Budget: 50 tokens
```

### Token Conversion

```
1 token = 0.20 PLN

Examples:
- 50 tokens = 10 PLN
- 200 tokens = 40 PLN (minimum campaign)
- 1000 tokens = 200 PLN
```

### Billing Integration (PACK 277)

All billing goes through [`spendTokens()`](functions/src/pack277-wallet-service.ts:152):

```typescript
await spendTokens({
  userId: advertiserUserId,
  amountTokens: tokensToCharge,
  source: 'MEDIA',
  relatedId: campaignId,
  creatorId: undefined,  // No creator for ads
  metadata: { campaignId, billingType: 'CPM' | 'CPC' },
  contextType: 'AVALO_ONLY_REVENUE',  // 100% Avalo
  contextRef: `ads:campaign:${campaignId}`,
});
```

**Revenue Split**:
- **Platform**: 100%
- **Creator**: 0%
- No user earnings from ads

### Auto-Pause on Insufficient Balance

If `spendTokens()` fails:
1. Campaign status → PAUSED
2. `pauseReason` set to "Insufficient balance"
3. Advertiser must add tokens to resume

---

## Ad Delivery Logic

### Placement Integration

Ads are injected into:
- **Feed**: Between regular posts
- **Reels**: Between reels videos
- **Stories**: Between user stories

### Frequency Rules

```
Minimum spacing: 8 organic items
Maximum spacing: 12 organic items
Randomized per session
```

### Targeting Algorithm

```typescript
1. Check user age >= 18 (hard gate)
2. Load user profile (region, gender, age, interests)
3. Query active campaigns for placement
4. Filter by:
   - Region (if specified)
   - Gender (if not ANY)
   - Age range (if specified)
   - Interests (at least one match)
5. Get approved creatives
6. Select random creative
7. Return ad with tracking ID
```

### No-Ads Cases

- User under 18
- No active campaigns for placement
- No campaigns match user targeting
- No approved creatives available

---

## Anti-Fraud Protection

### Impression Fraud Prevention

**Limits**:
- Max 1 impression per user per 10 minutes per creative

**Detection**:
- Track recent impressions in 10-minute window
- Exceeding limit: log suspicious activity but don't block
- Creates LOW severity fraud alert

### Click Fraud Prevention

**Limits**:
- Max 5 clicks per IP per 24 hours per creative

**Detection**:
- Track recent clicks in 24-hour window
- Exceeding limit: block click and create HIGH severity fraud alert
- No billing occurs for blocked clicks

### Pattern Detection

**High CTR Alert**:
- Threshold: CTR > 15%
- Creates MEDIUM severity fraud alert
- Requires manual review

**Click Velocity Alert**:
- Threshold: 100+ clicks in 1 hour
- Creates HIGH severity fraud alert
- May indicate bot activity

### Fraud Alert Workflow

```
1. Suspicious activity detected
2. Fraud alert created with severity
3. Admin reviews alert in dashboard
4. Admin marks resolution (legitimate/fraud)
5. If fraud: campaign may be paused/ended
```

---

## Admin Controls

### Moderation Queue

Admins see pending creatives with:
- Creative preview (image/video)
- Headline and description
- Campaign name
- Advertiser info

**Actions**:
- Approve → status = APPROVED
- Reject → status = REJECTED, requires reason

### Campaign Management

**Actions**:
- Pause/Resume: Stop/start delivery
- Force End: Terminate campaign early
- View Audit Log: Full history of changes

### Fraud Review

**Dashboard**:
- List of unreviewed fraud alerts by severity
- Alert details (type, campaign, metrics)
- Mark as reviewed with resolution

### Analytics Dashboard

**Metrics**:
- Active campaigns count
- Pending creatives count
- Total impressions
- Total clicks
- Overall CTR
- Total platform revenue (in tokens)
- Unreviewed fraud alerts

---

## Integration Guide

### Mobile Integration (React Native + Expo)

#### 1. Get Ad for Feed

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const getAd = httpsCallable(functions, 'pack326_getAd');

async function fetchFeedAd() {
  try {
    const result = await getAd({ placement: 'FEED' });
    
    if (result.data.ad) {
      return result.data.ad;
    } else {
      // No ads available
      return null;
    }
  } catch (error) {
    console.error('Error fetching ad:', error);
    return null;
  }
}
```

#### 2. Track Impression

```typescript
const trackImpression = httpsCallable(functions, 'pack326_trackAdImpression');

async function onAdViewed(ad: DeliveredAd, userId: string) {
  try {
    await trackImpression({
      campaignId: ad.campaignId,
      creativeId: ad.creativeId,
      viewerUserId: userId,
    });
  } catch (error) {
    console.error('Error tracking impression:', error);
  }
}
```

#### 3. Track Click

```typescript
const trackClick = httpsCallable(functions, 'pack326_trackAdClick');

async function onAdClicked(ad: DeliveredAd, userId: string) {
  try {
    const result = await trackClick({
      campaignId: ad.campaignId,
      creativeId: ad.creativeId,
      viewerUserId: userId,
    });
    
    if (result.data.success) {
      // Navigate to destination
      navigation.navigate(ad.destinationUrl);
    }
  } catch (error) {
    console.error('Error tracking click:', error);
  }
}
```

#### 4. Ad Component

```typescript
import React, { useEffect } from 'react';
import { View, Image, Text, TouchableOpacity } from 'react-native';

interface AdProps {
  ad: DeliveredAd;
  userId: string;
  onImpression: (ad: DeliveredAd) => void;
  onClick: (ad: DeliveredAd) => void;
}

export function AdCard({ ad, userId, onImpression, onClick }: AdProps) {
  useEffect(() => {
    // Track impression when ad is visible
    onImpression(ad);
  }, [ad.trackingId]);
  
  return (
    <TouchableOpacity onPress={() => onClick(ad)}>
      <View style={styles.adContainer}>
        <Text style={styles.sponsoredLabel}>Sponsored</Text>
        <Image source={{ uri: ad.creative.mediaUrl }} style={styles.media} />
        <Text style={styles.headline}>{ad.creative.headline}</Text>
        {ad.creative.description && (
          <Text style={styles.description}>{ad.creative.description}</Text>
        )}
        {ad.creative.callToAction && (
          <Text style={styles.cta}>{ad.creative.callToAction}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
```

### Web Integration (Next.js)

#### API Route for Ad Fetching

```typescript
// app/api/ads/route.ts
import { getAd } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get('placement') || 'FEED';
  const userId = request.headers.get('x-user-id');
  
  const ad = await getAd(placement, userId);
  
  return Response.json({ ad });
}
```

#### Client Component

```typescript
'use client';

import { useEffect, useState } from 'react';

export function FeedAd({ placement }: { placement: string }) {
  const [ad, setAd] = useState(null);
  
  useEffect(() => {
    fetchAd();
  }, []);
  
  async function fetchAd() {
    const res = await fetch(`/api/ads?placement=${placement}`);
    const data = await res.json();
    setAd(data.ad);
  }
  
  if (!ad) return null;
  
  return (
    <div className="ad-container">
      <span className="sponsored-label">Sponsored</span>
      {/* Ad content */}
    </div>
  );
}
```

---

## Testing

### Test Scenarios

#### 1. Campaign Creation Flow

```bash
✓ Create campaign with valid budget
✓ Reject campaign with budget < 200 tokens
✓ Reject campaign for user under 18
✓ Reject campaign targeting users under 18
✓ Reject campaign with past start date
```

#### 2. Creative Moderation

```bash
✓ Submit creative → status = PENDING
✓ Admin approve → status = APPROVED
✓ Admin reject → status = REJECTED with reason
✓ Cannot activate campaign without approved creative
```

#### 3. Ad Delivery

```bash
✓ User 18+ sees ads
✓ User under 18 sees no ads
✓ Ads match user targeting (region, gender, age, interests)
✓ No ads when no campaigns match
✓ Random creative selection
```

#### 4. Impression Tracking & CPM Billing

```bash
✓ Track impression creates adsImpressions record
✓ Bill every 1000 impressions
✓ Deduct correct CPM tokens from advertiser
✓ Campaign auto-pauses when budget exhausted
✓ Fraud protection: max 1 impression per 10 min
```

#### 5. Click Tracking & CPC Billing

```bash
✓ Track click creates adsClicks record
✓ Immediate CPC billing on each click
✓ Deduct correct CPC tokens from advertiser
✓ Campaign auto-pauses on insufficient balance
✓ Fraud protection: max 5 clicks per 24h
✓ High CTR triggers fraud alert
```

#### 6. Anti-Fraud

```bash
✓ Exceeding impression limit logs fraud alert
✓ Exceeding click limit blocks click
✓ High CTR creates fraud alert
✓ Admin can review and resolve alerts
```

### Manual Testing Checklist

```bash
[ ] Create advertiser account (18+, verified)
[ ] Purchase tokens (e.g., 500 tokens)
[ ] Create campaign (CPM, budget 400 tokens)
[ ] Upload creative
[ ] Admin approve creative
[ ] Activate campaign
[ ] View feed as target user → see ad
[ ] Click ad → billing occurs
[ ] Check campaign analytics
[ ] Trigger fraud limit → verify alert created
[ ] Admin pause campaign
[ ] Admin resume campaign
[ ] Let campaign budget exhaust → auto-end
```

---

## Deployment

### 1. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

Rules file: [`firestore-pack326-ads.rules`](firestore-pack326-ads.rules)

### 2. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

Indexes file: [`firestore-pack326-ads.indexes.json`](firestore-pack326-ads.indexes.json)

### 3. Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions:pack326_createAdsCampaign,functions:pack326_createAdCreative,functions:pack326_activateCampaign,functions:pack326_pauseCampaign,functions:pack326_resumeCampaign,functions:pack326_getCampaignDetails,functions:pack326_listMyCampaigns,functions:pack326_trackAdImpression,functions:pack326_trackAdClick,functions:pack326_getCampaignAnalytics,functions:pack326_getCreativeAnalytics,functions:pack326_getAd,functions:pack326_getBatchAds,functions:pack326_checkAdAvailability,functions:pack326_moderateCreative,functions:pack326_getPendingCreatives,functions:pack326_adminPauseCampaign,functions:pack326_adminEndCampaign,functions:pack326_adminListCampaigns,functions:pack326_getFraudAlerts,functions:pack326_reviewFraudAlert,functions:pack326_getCampaignAuditLog,functions:pack326_getAdminDashboardStats
```

### 4. Verify Deployment

```bash
✓ Test campaign creation
✓ Test creative upload
✓ Test admin moderation
✓ Test ad delivery
✓ Test impression tracking
✓ Test click tracking
✓ Test billing integration
✓ Test anti-fraud limits
```

---

## Files Created

### Backend (Cloud Functions)

1. [`functions/src/types/pack326-ads.types.ts`](functions/src/types/pack326-ads.types.ts) - TypeScript types
2. [`functions/src/pack326-campaign-management.ts`](functions/src/pack326-campaign-management.ts) - Campaign CRUD
3. [`functions/src/pack326-tracking-billing.ts`](functions/src/pack326-tracking-billing.ts) - Tracking & billing
4. [`functions/src/pack326-ad-delivery.ts`](functions/src/pack326-ad-delivery.ts) - Ad matching & delivery
5. [`functions/src/pack326-admin-controls.ts`](functions/src/pack326-admin-controls.ts) - Admin moderation

### Firestore Configuration

6. [`firestore-pack326-ads.rules`](firestore-pack326-ads.rules) - Security rules
7. [`firestore-pack326-ads.indexes.json`](firestore-pack326-ads.indexes.json) - Composite indexes

### Documentation

8. `PACK_326_ADS_SYSTEM_IMPLEMENTATION.md` (this file)

---

## Summary

PACK 326 provides a complete, production-ready advertising system with:

✅ **Campaign Management**: Create, activate, pause, resume campaigns  
✅ **Creative Moderation**: Admin approval workflow  
✅ **Ad Delivery**: Targeted matching with placement support  
✅ **Billing Integration**: CPM/CPC billing via PACK 277 wallet  
✅ **Anti-Fraud**: Rate limiting and pattern detection  
✅ **Admin Controls**: Moderation, fraud review, analytics  
✅ **100% Avalo Revenue**: Pure platform monetization  

**Revenue Model**: All ad spending goes directly to Avalo platform revenue with no creator/user earnings, making it a standalone revenue stream separate from existing monetization features.

**Next Steps**:
1. Deploy to production
2. Create advertiser onboarding flow
3. Build admin dashboard UI
4. Integrate ad components into mobile and web feeds
5. Monitor fraud alerts and adjust thresholds
6. Scale pricing based on demand

---

**Implementation Complete** ✅