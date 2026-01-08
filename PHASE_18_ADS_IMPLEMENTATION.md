# Phase 18: Sponsored Ads & Brand Placements - Implementation Summary

## Overview

Phase 18 implements a complete advertising monetization layer where brands can purchase token-based ad campaigns to promote their products/services on Avalo. This is SEPARATE from Phase 17's rewarded ads (where users watch ads to earn tokens).

**Status:** ✅ **COMPLETE - Backend & Mobile Components**

**Revenue Model:** 100% of ad revenue belongs to Avalo at this stage.

---

## Business Model (S4 Hybrid)

### User Tier-Based Ad Frequency

| User Tier | Feed Ads | Swipe Ads | LIVE Ads | Experience |
|-----------|----------|-----------|----------|------------|
| **Standard** | Every 7th post | Every 12th profile | Overlay sponsors | Instagram-style native ads |
| **VIP** | Every 15th post | Every 15th profile | Overlay sponsors | Reduced frequency |
| **Royal** | Every 20th post | Every 15th profile | Luxury logos only | Premium, minimal ads |

### Ad Types

1. **Feed Ads** (Instagram-style)
   - Native post format
   - Brand header with logo
   - Image + description
   - CTA button
   - Used for: All tiers

2. **Swipe Ads** (Tinder-style)
   - Full-screen card format
   - Hero image
   - Prominent CTA
   - Used for: VIP/Royal luxury brands

3. **LIVE Ads** (TikTok-style)
   - Overlay brand logo
   - Non-intrusive placement (corner)
   - Optional branded gift animations
   - Used for: Real-time sponsorships

### Campaign Types

| Type | Billing Model | Default Cost | Best For |
|------|---------------|--------------|----------|
| **CPM** | Cost Per 1000 Impressions | 50 tokens | Brand awareness |
| **CPC** | Cost Per Click | 5 tokens | Performance marketing |

---

## Architecture

### Firestore Collections

#### 1. `adsCampaigns`
Campaign management and configuration.

```typescript
{
  campaignId: string          // Unique campaign ID
  brandId: string             // Brand/advertiser user ID
  brandName: string           // Display name
  campaignType: 'CPC' | 'CPM' // Billing model
  status: 'active' | 'paused' | 'completed' | 'expired'
  
  // Ad content
  title: string               // Ad headline
  description: string         // Ad body text
  imageUrl: string            // Main creative
  targetUrl?: string          // Click destination
  callToAction: string        // Button text (e.g., "Learn More")
  
  // Budget & billing (token-based)
  budgetTokens: number        // Total allocated budget
  spentTokens: number         // Amount spent so far
  costPerClick?: number       // For CPC campaigns
  costPerImpression?: number  // For CPM (per 1000)
  
  // Targeting filters
  targeting: {
    countries?: string[]      // Country codes (e.g., ['US', 'UK'])
    languages?: string[]      // Language codes
    ageMin?: number           // Minimum age
    ageMax?: number           // Maximum age
    genders?: string[]        // ['male', 'female', 'other']
    tiers?: string[]          // ['standard', 'vip', 'royal']
    interests?: string[]      // Interest tags
  }
  
  // Placement configuration
  placements: string[]        // ['feed', 'swipe', 'live']
  
  // Performance stats
  impressions: number         // Total impressions
  clicks: number              // Total clicks
  ctr: number                 // Click-through rate (%)
  
  // Timestamps
  createdAt: Timestamp
  updatedAt: Timestamp
  startDate?: Timestamp       // Optional campaign start
  endDate?: Timestamp         // Optional campaign end
}
```

#### 2. `adsImpressions`
Tracks every time an ad is shown to a user.

```typescript
{
  impressionId: string        // Unique impression ID
  campaignId: string          // Reference to campaign
  userId: string              // User who saw the ad
  deviceId?: string           // Device identifier
  placement: 'feed' | 'swipe' | 'live'
  userTier: 'standard' | 'vip' | 'royal'
  timestamp: Timestamp
  ipHash?: string             // For fraud detection
}
```

#### 3. `adsClicks`
Tracks ad clicks (for both CPC billing and analytics).

```typescript
{
  clickId: string             // Unique click ID
  campaignId: string          // Reference to campaign
  impressionId: string        // Reference to impression
  userId: string              // User who clicked
  deviceId?: string           // Device identifier
  timestamp: Timestamp
  ipHash?: string             // For fraud detection
}
```

#### 4. `adsBudgets`
Tracks brand spending across campaigns.

```typescript
{
  brandId: string             // Brand user ID
  totalAllocated: number      // Total tokens allocated
  totalSpent: number          // Total tokens spent
  campaigns: string[]         // Campaign IDs
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### 5. `adsPlacementStats`
Performance breakdown by placement type.

```typescript
{
  campaignId: string          // Campaign ID
  placement: 'feed' | 'swipe' | 'live'
  impressions: number
  clicks: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

## Backend API (Cloud Functions)

### Campaign Management

#### `ads_createCampaign`
**Auth:** Required (brand account)

**Request:**
```typescript
{
  title: string
  description: string
  imageUrl: string
  targetUrl?: string
  callToAction?: string
  budgetTokens: number
  campaignType?: 'CPC' | 'CPM'
  costPerClick?: number
  costPerImpression?: number
  targeting?: {
    countries?: string[]
    languages?: string[]
    ageMin?: number
    ageMax?: number
    genders?: string[]
    tiers?: string[]
    interests?: string[]
  }
  placements?: string[]
  startDate?: string
  endDate?: string
}
```

**Response:**
```typescript
{
  campaignId: string
  brandId: string
  brandName: string
  status: 'active'
  // ... full campaign object
}
```

**Errors:**
- `unauthenticated` - User not logged in
- `invalid-argument` - Missing required fields or invalid budget
- `internal` - Server error

---

#### `ads_updateCampaign`
**Auth:** Required (campaign owner)

**Request:**
```typescript
{
  campaignId: string
  updates: {
    title?: string
    description?: string
    status?: 'active' | 'paused'
    budgetTokens?: number
    targeting?: { ... }
    // Cannot update: campaignId, brandId, spentTokens, stats
  }
}
```

**Response:**
```typescript
{
  success: true
}
```

---

#### `ads_getCampaignInsights`
**Auth:** Required (campaign owner)

**Request:**
```typescript
{
  campaignId: string
}
```

**Response:**
```typescript
{
  campaign: { ... }
  totalImpressions: number
  totalClicks: number
  ctr: string                       // Percentage
  spentTokens: number
  remainingBudget: number
  budgetUtilization: string         // Percentage
  impressionsByPlacement: {
    feed: number
    swipe: number
    live: number
  }
  impressionsByTier: {
    standard: number
    vip: number
    royal: number
  }
  avgCostPerClick: string
  avgCostPerImpression: string      // Per 1000
  status: string
}
```

---

### Ad Delivery

#### `ads_getAdPlacements`
**Auth:** Required

**Request:**
```typescript
{
  placement: 'feed' | 'swipe' | 'live'
  userProfile: {
    tier: 'standard' | 'vip' | 'royal'
    country?: string
    language?: string
    age?: number
    gender?: string
    interests?: string[]
  }
}
```

**Response:**
```typescript
{
  ads: [
    {
      campaignId: string
      brandName: string
      title: string
      description: string
      imageUrl: string
      targetUrl?: string
      callToAction: string
      placement: string
    }
    // ... up to 3 ads
  ]
}
```

**Logic:**
- Filters active campaigns by placement
- Checks budget not exhausted
- Matches targeting criteria
- Prioritizes by remaining budget
- Returns top 3 candidates

---

### Tracking

#### `ads_registerImpression`
**Auth:** Required

**Request:**
```typescript
{
  campaignId: string
  placement: 'feed' | 'swipe' | 'live'
  userTier: 'standard' | 'vip' | 'royal'
  deviceId?: string
  ipHash?: string
}
```

**Response:**
```typescript
{
  success: boolean
  cost?: number  // Tokens deducted (CPM campaigns)
}
```

**Fraud Prevention:**
- Max 100 impressions per user per day
- Checks campaign status and budget
- Records device ID and IP hash
- Auto-pauses exhausted campaigns

---

#### `ads_registerClick`
**Auth:** Required

**Request:**
```typescript
{
  campaignId: string
  impressionId: string
  deviceId?: string
  ipHash?: string
}
```

**Response:**
```typescript
{
  success: boolean
  cost?: number  // Tokens deducted (CPC campaigns)
}
```

**Fraud Prevention:**
- Max 10 clicks per user per hour
- Min 2 seconds between clicks
- Prevents duplicate clicks per impression
- Validates impression exists

---

## Mobile Integration

### Components

#### 1. [`SponsoredCard.tsx`](app-mobile/components/SponsoredCard.tsx)
Tinder-style full-screen ad card for swipe discovery.

**Usage:**
```tsx
<SponsoredCard
  campaignId={ad.campaignId}
  impressionId={impressionId}
  title={ad.title}
  description={ad.description}
  imageUrl={ad.imageUrl}
  brandName={ad.brandName}
  callToAction={ad.callToAction}
  targetUrl={ad.targetUrl}
  onImpression={handleImpression}
  onClick={handleClick}
/>
```

**Features:**
- Hero image (280px height)
- Sponsored badge
- Brand name + title
- CTA button
- Auto-registers impression on mount
- Opens target URL on click

---

#### 2. [`SponsoredPost.tsx`](app-mobile/components/SponsoredPost.tsx)
Instagram-style native feed ad.

**Usage:**
```tsx
<SponsoredPost
  campaignId={ad.campaignId}
  impressionId={impressionId}
  title={ad.title}
  description={ad.description}
  imageUrl={ad.imageUrl}
  brandName={ad.brandName}
  callToAction={ad.callToAction}
  targetUrl={ad.targetUrl}
  onImpression={handleImpression}
  onClick={handleClick}
/>
```

**Features:**
- Brand header with logo placeholder
- "Sponsored" label
- Main image (320px height)
- Description with line limit
- Outlined CTA button
- Native feed styling

---

#### 3. [`SponsoredOverlay.tsx`](app-mobile/components/SponsoredOverlay.tsx)
TikTok-style overlay for LIVE rooms.

**Usage:**
```tsx
<SponsoredOverlay
  campaignId={ad.campaignId}
  impressionId={impressionId}
  brandName={ad.brandName}
  imageUrl={ad.imageUrl}
  targetUrl={ad.targetUrl}
  position="top-right"  // or 'top-left', 'bottom-left', 'bottom-right'
  onImpression={handleImpression}
  onClick={handleClick}
/>
```

**Features:**
- Compact brand logo (60x60)
- "Sponsored" micro-label
- Configurable corner placement
- Fade-in animation
- Semi-transparent background
- Non-intrusive design

---

### Service Layer

#### [`sponsoredAdsService.ts`](app-mobile/services/sponsoredAdsService.ts)

**Core Functions:**

```typescript
// Check if ad should show based on frequency
shouldShowAd(placement, tier, itemCount): boolean

// Fetch ads from backend
getAdPlacements(placement, userProfile): Promise<AdCampaign[]>

// Track impression (returns impressionId)
registerImpression(campaignId, placement, userTier): Promise<string | null>

// Track click
registerClick(campaignId, impressionId): Promise<boolean>

// Cache management
getCachedAds(placement, tier): AdCampaign[] | null
cacheAds(placement, tier, ads): void
clearAdCache(): void

// User preferences (VIP/Royal)
areAdsEnabled(tier): Promise<boolean>
setAdsEnabled(enabled): Promise<void>
```

**Ad Frequency Logic:**

```typescript
// Feed
standard: 7,  // Every 7th post
vip: 15,      // Every 15th post
royal: 20,    // Every 20th post

// Swipe
standard: 12, // Every 12th profile
vip: 15,      // Every 15th profile
royal: 15,    // Every 15th profile
```

**Caching:**
- Ads cached for 5 minutes
- Reduces backend calls
- Per-placement, per-tier cache keys

**Device ID:**
- Generated once per install
- Stored in AsyncStorage
- Used for fraud detection

---

## Integration Examples

### Feed Integration

```typescript
// In feed component
import SponsoredPost from '@/components/SponsoredPost';
import { shouldShowAd, getAdPlacements, registerImpression, registerClick } from '@/services/sponsoredAdsService';

const [ads, setAds] = useState<AdCampaign[]>([]);
const [impressionIds, setImpressionIds] = useState<Map<string, string>>(new Map());

// Fetch ads on mount
useEffect(() => {
  const userProfile = {
    tier: getUserTier(user.membershipType),
    country: user.location?.country,
    language: user.language,
    age: calculateAge(user.birthdate),
    gender: user.gender,
    interests: user.interests,
  };
  
  getAdPlacements('feed', userProfile).then(setAds);
}, []);

// Handle impression
const handleImpression = async (campaignId: string) => {
  const tier = getUserTier(user.membershipType);
  const impressionId = await registerImpression(campaignId, 'feed', tier);
  
  if (impressionId) {
    setImpressionIds(prev => new Map(prev).set(campaignId, impressionId));
  }
};

// Handle click
const handleClick = async (campaignId: string, impressionId: string) => {
  await registerClick(campaignId, impressionId);
};

// Render feed with ads
<FlatList
  data={feedItems}
  renderItem={({ item, index }) => {
    // Check if ad should be injected
    if (shouldShowAd('feed', userTier, index + 1) && ads.length > 0) {
      const adIndex = Math.floor((index + 1) / frequency) % ads.length;
      const ad = ads[adIndex];
      
      return (
        <SponsoredPost
          campaignId={ad.campaignId}
          impressionId={impressionIds.get(ad.campaignId)}
          title={ad.title}
          description={ad.description}
          imageUrl={ad.imageUrl}
          brandName={ad.brandName}
          callToAction={ad.callToAction}
          targetUrl={ad.targetUrl}
          onImpression={handleImpression}
          onClick={handleClick}
        />
      );
    }
    
    return <FeedPost post={item} />;
  }}
/>
```

---

### Swipe Integration

```typescript
// In swipe/discovery component
import SponsoredCard from '@/components/SponsoredCard';

// Similar pattern to feed
// Use shouldShowAd('swipe', userTier, cardIndex)
// Inject SponsoredCard between profile cards
```

---

### LIVE Integration

```typescript
// In LIVE room component
import SponsoredOverlay from '@/components/SponsoredOverlay';

// Fetch ads for LIVE placement
const [liveAd, setLiveAd] = useState<AdCampaign | null>(null);

useEffect(() => {
  const userProfile = { tier, country, language };
  getAdPlacements('live', userProfile).then(ads => {
    if (ads.length > 0) setLiveAd(ads[0]);
  });
}, []);

// Render overlay on top of LIVE stream
<View style={styles.liveContainer}>
  <LiveStream />
  
  {liveAd && (
    <SponsoredOverlay
      campaignId={liveAd.campaignId}
      brandName={liveAd.brandName}
      imageUrl={liveAd.imageUrl}
      targetUrl={liveAd.targetUrl}
      position="top-right"
      onImpression={handleImpression}
      onClick={handleClick}
    />
  )}
</View>
```

---

## Fraud Detection & Prevention

### Impression Limits
```typescript
// Max 100 impressions per user per day
const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);

const userImpressions = await db.collection('adsImpressions')
  .where('userId', '==', userId)
  .where('timestamp', '>=', todayStart)
  .count();

if (userImpressions >= 100) {
  return { success: false }; // Blocked
}
```

### Click Limits
```typescript
// Max 10 clicks per user per hour
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

const userClicks = await db.collection('adsClicks')
  .where('userId', '==', userId)
  .where('timestamp', '>=', oneHourAgo)
  .count();

if (userClicks >= 10) {
  return { success: false }; // Blocked
}
```

### Duplicate Detection
```typescript
// Prevent multiple clicks on same impression
const existingClick = await db.collection('adsClicks')
  .where('impressionId', '==', impressionId)
  .limit(1)
  .get();

if (!existingClick.empty) {
  return { success: false }; // Duplicate click blocked
}
```

### Device & IP Tracking
- Every impression/click logs deviceId and ipHash
- Future: Rate limit by device/IP
- Future: Pattern detection (bot behavior)
- Future: Cross-reference with trust engine

---

## Revenue Model

### Token-Based Budgets
- Brands purchase tokens on web (via Stripe)
- 1 token = ad spend currency
- No fiat pricing in mobile
- Token deductions happen server-side

### Budget Exhaustion
```typescript
if (campaign.spentTokens >= campaign.budgetTokens) {
  // Auto-pause campaign
  await campaignRef.update({ status: 'expired' });
  return { success: false };
}
```

### Billing Flow
1. Brand creates campaign with token budget
2. Campaign activates
3. Impressions/clicks deduct from budget
4. When budget hits zero → auto-pause
5. Brand can top-up and resume

### Revenue Split
- **100% to Avalo** (this phase)
- No creator revenue share yet
- Future: Consider creator partnerships for branded content

---

## Web Dashboard (TODO - Phase 18B)

### Planned Structure
```
web/app/brands/
  ├── page.tsx                 # Landing + CTA
  ├── create/
  │   └── page.tsx             # Campaign builder
  └── dashboard/
      └── page.tsx             # Stats + management
```

### Features
- Campaign creation wizard
- Target audience builder
- Budget allocation UI
- Real-time analytics
- Stripe token purchase
- Campaign pause/resume
- Performance graphs

### Token Purchase (Web Only)
- Stripe integration
- Token packages (100, 500, 1000, 5000)
- Pricing tiers based on volume
- Purchase history
- Refund policies

---

## Configuration

### Backend Config ([`adsEngine.ts`](functions/src/adsEngine.ts:96-111))

```typescript
const ADS_CONFIG = {
  // Placement frequency
  FEED_FREQUENCY: {
    standard: 7,
    vip: 15,
    royal: 20,
  },
  SWIPE_FREQUENCY: {
    standard: 12,
    vip: 15,
    royal: 15,
  },
  
  // Default costs (tokens)
  DEFAULT_CPC: 5,
  DEFAULT_CPM: 50,
  
  // Fraud detection
  MAX_IMPRESSIONS_PER_USER_PER_DAY: 100,
  MAX_CLICKS_PER_USER_PER_HOUR: 10,
  MIN_TIME_BETWEEN_CLICKS_MS: 2000,
  
  // Campaign limits
  MIN_BUDGET_TOKENS: 100,
  MAX_BUDGET_TOKENS: 1000000,
};
```

---

## Testing Checklist

### Backend
- [x] Campaign creation with valid data
- [x] Campaign creation with invalid budget (should fail)
- [x] Campaign update by owner
- [x] Campaign update by non-owner (should fail)
- [x] Budget exhaustion auto-pause
- [x] Targeting filter matching
- [x] Ad prioritization logic
- [ ] Impression registration
- [ ] Click registration
- [ ] Fraud limit enforcement
- [ ] Duplicate click prevention

### Mobile
- [ ] Feed ad injection at correct frequency
- [ ] Swipe ad injection at correct frequency
- [ ] LIVE overlay positioning
- [ ] Ad caching (5 min expiry)
- [ ] Impression tracking
- [ ] Click tracking
- [ ] VIP/Royal ad toggle
- [ ] Device ID generation
- [ ] Network error handling

### Integration
- [ ] Campaign → Impression → Click flow
- [ ] CPM campaign billing
- [ ] CPC campaign billing
- [ ] Budget deduction accuracy
- [ ] Stats aggregation
- [ ] Insights calculation
- [ ] Multiple campaigns active
- [ ] Campaign expires when budget hits zero

---

## File Structure

```
avaloapp/
├── functions/src/
│   ├── adsEngine.ts                      # ✅ Core ad logic
│   └── index.ts                          # ✅ Callable functions
│
├── app-mobile/
│   ├── components/
│   │   ├── SponsoredCard.tsx             # ✅ Swipe ad
│   │   ├── SponsoredPost.tsx             # ✅ Feed ad
│   │   └── SponsoredOverlay.tsx          # ✅ LIVE ad
│   └── services/
│       └── sponsoredAdsService.ts        # ✅ Mobile service
│
├── app-web/
│   └── app/brands/                       # ⏳ TODO
│       ├── page.tsx
│       ├── create/page.tsx
│       └── dashboard/page.tsx
│
└── PHASE_18_ADS_IMPLEMENTATION.md        # ✅ This file
```

---

## Next Steps (Phase 18B - Web Dashboard)

1. **Create brand dashboard UI**
   - Campaign creation wizard
   - Budget allocation interface
   - Targeting builder
   - Creative uploader

2. **Implement Stripe token purchase**
   - Token pack selection
   - Checkout flow
   - Receipt generation
   - Balance display

3. **Build analytics dashboard**
   - Real-time metrics
   - Performance graphs
   - Export reports
   - Campaign comparison

4. **Add campaign management**
   - Edit campaigns
   - Pause/resume
   - Budget top-ups
   - Duplicate campaigns

---

## Summary

Phase 18 successfully implements:

✅ **Backend:** Complete ad engine with targeting, billing, and fraud prevention  
✅ **Mobile Components:** Native ad formats for feed, swipe, and LIVE  
✅ **Service Layer:** Ad delivery, caching, and tracking  
✅ **API:** 6 callable functions for campaign and tracking management  
✅ **Documentation:** Full schema, API ref, and integration examples  
⏳ **Web Dashboard:** Planned for Phase 18B  

**Total Implementation:**  
- 2 backend files (~800 lines)
- 3 mobile components (~425 lines)
- 1 service layer (~288 lines)
- This comprehensive documentation

**Ready for:**  
- Backend testing
- Mobile integration
- Web dashboard development (Phase 18B)

---

**Implemented by:** Kilo Code  
**Date:** 2025-11-21  
**Phase:** 18 - Sponsored Ads & Brand Placements (S4 Hybrid)  
**Status:** ✅ Core Complete, Web Dashboard Pending