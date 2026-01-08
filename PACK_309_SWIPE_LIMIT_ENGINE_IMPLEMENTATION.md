# PACK 309 — Swipe Limit Engine & Discovery Behavior Implementation

**Status**: ✅ COMPLETE  
**Date**: 2025-12-10  
**Dependencies**: PACK 267-268 (Risk & Safety), PACK 275+ (Profiles), PACK 295 (Localization), PACK 299 (Analytics), PACK 301 (Retention), PACK 306 (Identity Verification)

---

## 📋 Executive Summary

PACK 309 implements the final swipe limits and Discovery behavior for Avalo, ensuring:

✅ **Swipe is free but rate-limited**: 50/day + 10/hour rolling refill  
✅ **Discovery is free and unlimited** (with anti-spam protections)  
✅ **Works for both mobile and web** with identical rules  
✅ **Only 18+ verified users** can access Swipe and Discovery  
✅ **No changes to tokenomics** or pricing structures  

**Key Achievement**: Built on existing PACK 284 (Swipe Engine) and PACK 283 (Discovery), adding verification enforcement, analytics integration, and localization.

---

## 🏗️ Architecture Overview

### Implementation Strategy

Instead of rebuilding from scratch, we **enhanced existing implementations**:

1. **PACK 284 (Swipe Engine)** — Already had 50/day + 10/hour logic ✅
2. **PACK 283 (Discovery)** — Already had free unlimited browsing ✅
3. **PACK 309 NEW** — Added:
   - 18+ verification enforcement
   - Analytics event tracking
   - Retention profile updates
   - Localization support
   - Firestore security rules

---

## 📦 Deliverables

### 1. Server-Side Components

#### A. Verification Enforcement Module
**File**: [`functions/src/pack309-swipe-verification.ts`](functions/src/pack309-swipe-verification.ts:1)

**Functions**:
- [`checkSwipeVerificationRequirements(userId)`](functions/src/pack309-swipe-verification.ts:17) — Validates 18+ verified status
- [`throwVerificationError(reason)`](functions/src/pack309-swipe-verification.ts:73) — Throws appropriate error codes
- [`getVerificationErrorMessage(reason, language)`](functions/src/pack309-swipe-verification.ts:94) — Returns localized error messages

**Verification Logic**:
```typescript
// Check PACK 306 verification status
1. verification.status === 'VERIFIED'
2. ageVerified === true
3. minAgeConfirmed >= 18

// If any fail, block access to Swipe/Discovery
```

#### B. Analytics Integration Module
**File**: [`functions/src/pack309-analytics-integration.ts`](functions/src/pack309-analytics-integration.ts:1)

**Events Tracked**:
- [`SWIPE_LIKE`](functions/src/pack309-analytics-integration.ts:14) — User swiped right
- [`SWIPE_DISLIKE`](functions/src/pack309-analytics-integration.ts:15) — User swiped left
- [`SWIPE_LIMIT_HIT_DAILY`](functions/src/pack309-analytics-integration.ts:16) — Daily limit reached
- [`SWIPE_LIMIT_HIT_HOURLY`](functions/src/pack309-analytics-integration.ts:17) — Hourly limit reached
- [`SWIPE_MATCH_CREATED`](functions/src/pack309-analytics-integration.ts:18) — Mutual match detected
- [`DISCOVERY_BROWSE`](functions/src/pack309-analytics-integration.ts:70) — Discovery grid browsed
- [`DISCOVERY_PROFILE_VIEW`](functions/src/pack309-analytics-integration.ts:70) — Profile viewed in Discovery
- [`DISCOVERY_LIKE`](functions/src/pack309-analytics-integration.ts:70) — Profile liked in Discovery

**Functions**:
- [`logSwipeAnalyticsEvent(userId, eventType, metadata)`](functions/src/pack309-analytics-integration.ts:23) — Track swipe events
- [`updateRetentionProfileSwipe(userId)`](functions/src/pack309-analytics-integration.ts:48) — Update lastSwipeAt for retention
- [`logDiscoveryAnalyticsEvent(userId, eventType, metadata)`](functions/src/pack309-analytics-integration.ts:67) — Track discovery events

#### C. Localization Module
**File**: [`functions/src/pack309-localization.ts`](functions/src/pack309-localization.ts:1)

**Supported Languages**: English (EN), Polish (PL)

**Messages**:
- Daily limit reached banner (EN/PL)
- Hourly limit reached banner (EN/PL)
- Swipes remaining counter (EN/PL)
- Refresh time formatting (EN/PL)
- Discovery free access messages (EN/PL)

**Functions**:
- [`getSwipeLimitMessage(type, language)`](functions/src/pack309-localization.ts:110) — Get limit message
- [`formatSwipesRemaining(count, language)`](functions/src/pack309-localization.ts:121) — Format counter
- [`formatRefreshTime(milliseconds, language)`](functions/src/pack309-localization.ts:133) — Format time

---

### 2. Enhanced Swipe Engine (PACK 284 + PACK 309)

**File**: [`functions/src/pack284-swipe-engine.ts`](functions/src/pack284-swipe-engine.ts:1)

#### Modified Endpoints:

##### [`getSwipeQueue`](functions/src/pack284-swipe-engine.ts:366)
**Changes**:
- Added 18+ verification check before returning queue
- Throws localized error if verification fails

##### [`processSwipe`](functions/src/pack284-swipe-engine.ts:491)
**Changes**:
- Added 18+ verification check before processing
- Logs analytics events for likes/dislikes/matches
- Logs limit hit events (daily/hourly)
- Updates retention profile with lastSwipeAt

**Rate Limiting** (unchanged from PACK 284):
- 50 swipes per day (base limit)
- +10 swipes per hour while user is active
- No accumulation when offline
- Rolling 60-minute window for hourly refills

---

### 3. Enhanced Discovery (PACK 283 + PACK 309)

**File**: [`functions/src/pack283-discovery.ts`](functions/src/pack283-discovery.ts:1)

#### Modified Endpoints:

##### [`discoveryBrowse`](functions/src/pack283-discovery.ts:172)
**Changes**:
- Added 18+ verification check before browsing
- Logs discovery browse analytics
- Throws localized error if verification fails

##### [`trackProfileView`](functions/src/pack283-discovery.ts:311)
**Changes**:
- Added 18+ verification check for discovery views
- Logs discovery profile view analytics

**Behavior** (unchanged from PACK 283):
- 100% free and unlimited browsing
- No token costs
- No rate limits (beyond anti-spam)
- Profile views tracked for "Visitors" feature

---

### 4. Firestore Security Rules

**File**: [`firestore-pack309-swipe-limits.rules`](firestore-pack309-swipe-limits.rules:1)

**Collections Secured**:
- [`userSwipeStats`](firestore-pack309-swipe-limits.rules:17) — Read-only for users, write-only for server
- [`swipeStats`](firestore-pack309-swipe-limits.rules:27) — Legacy stats (PACK 284)
- [`swipeDecisions`](firestore-pack309-swipe-limits.rules:37) — Swipe history
- [`swipeProfiles`](firestore-pack309-swipe-limits.rules:47) — Searchable index
- [`matches`](firestore-pack309-swipe-limits.rules:57) — Mutual likes
- [`profileViews`](firestore-pack309-swipe-limits.rules:69) — Visitors tracking
- [`discoveryPresence`](firestore-pack309-swipe-limits.rules:79) — Discovery index
- [`swipeAbuseReports`](firestore-pack309-swipe-limits.rules:89) — Anti-spam logs

---

### 5. Firestore Indexes

**File**: [`firestore-pack309-swipe-limits.indexes.json`](firestore-pack309-swipe-limits.indexes.json:1)

**Indexes Created** (12 total):
- User swipe stats queries
- Swipe decision lookups
- Profile view queries (visitors feature)
- Match queries (both participants)
- Abuse report monitoring
- Analytics event queries

---

## 🔄 Data Flow

### Swipe Flow with PACK 309

```
User taps "Swipe" screen
  ↓
Client calls getSwipeQueue()
  ↓
Server checks 18+ verification (PACK 309) ← NEW
  ↓
Server checks swipe allowance (PACK 284)
  ↓
Return profiles + remaining count
  ↓
User swipes left/right
  ↓
Client calls processSwipe(targetId, decision)
  ↓
Server checks 18+ verification (PACK 309) ← NEW
  ↓
Server checks swipe allowance (PACK 284)
  ↓
Server logs analytics event (PACK 309) ← NEW
  ↓
Server updates retention profile (PACK 309) ← NEW
  ↓
Server checks for mutual match (PACK 284)
  ↓
If matched, log match analytics (PACK 309) ← NEW
  ↓
Return result with updated counters
```

### Discovery Flow with PACK 309

```
User taps "Discovery" tab
  ↓
Client calls discoveryBrowse(lat, lng, filters)
  ↓
Server checks 18+ verification (PACK 309) ← NEW
  ↓
Server logs browse analytics (PACK 309) ← NEW
  ↓
Server queries discoveryPresence (PACK 283)
  ↓
Return filtered + ranked profiles (unlimited)
  ↓
User taps profile
  ↓
Client calls trackProfileView(targetId, 'discovery')
  ↓
Server checks 18+ verification (PACK 309) ← NEW
  ↓
Server logs view analytics (PACK 309) ← NEW
  ↓
Server records view for "Visitors" feature
  ↓
Return success
```

---

## 🔐 Security & Compliance

### 18+ Verification Gate

**Enforcement Points**:
1. [`getSwipeQueue()`](functions/src/pack284-swipe-engine.ts:366) — Before returning swipe cards
2. [`processSwipe()`](functions/src/pack284-swipe-engine.ts:491) — Before processing swipe action
3. [`discoveryBrowse()`](functions/src/pack283-discovery.ts:172) — Before showing discovery grid
4. [`trackProfileView()`](functions/src/pack283-discovery.ts:311) — Before tracking discovery views

**Verification Requirements** (from PACK 306):
```typescript
verification.status === 'VERIFIED'
ageVerified === true
minAgeConfirmed >= 18
```

### Anti-Spam Protection

**Technical Throttling** (PACK 284):
- 50 swipes in 5 minutes → Abuse flag + throttle
- Logs to [`swipeAbuseReports`](functions/src/pack284-swipe-engine.ts:819) collection
- Integrates with Risk Engine (PACK 268)

**Discovery Throttling**:
- No product limits (free unlimited)
- Backend HTTP 429 for excessive requests (>100 requests/minute)
- Server-side anti-spam heuristics

---

## 📊 Analytics Integration

### PACK 299 Event Tracking

All swipe and discovery events are logged to [`analyticsEvents`](functions/src/pack309-analytics-integration.ts:32) collection:

```typescript
{
  userId: string,
  eventType: 'SWIPE_LIKE' | 'SWIPE_DISLIKE' | 'SWIPE_LIMIT_HIT_DAILY' | etc.,
  eventCategory: 'swipe' | 'discovery',
  metadata: {
    targetId?: string,
    platform: 'mobile' | 'web',
    swipesUsed?: number,
    ...
  },
  timestamp: Timestamp
}
```

### PACK 301 Retention Integration

Every swipe updates [`userRetention/{userId}`](functions/src/pack309-analytics-integration.ts:55):

```typescript
{
  lastSwipeAt: Timestamp,  // ← PACK 309 updates this
  lastActiveAt: Timestamp,
  updatedAt: Timestamp
}
```

**Retention Triggers** (PACK 301):
- `NO_SWIPE_48H` — User hasn't swiped in 2 days
- `NO_SWIPE_7D` — User hasn't swiped in 7 days
- Used for win-back campaigns

---

## 🌍 Localization

### Supported Languages

**English (EN)** — Default
**Polish (PL)** — Primary market

### Message Types

#### Swipe Limit Messages
```typescript
// Daily limit
EN: "You've reached today's swipe limit. New swipes refresh tomorrow."
PL: "Wykorzystałeś dzisiejszy limit swipe'ów. Nowy limit będzie jutro."

// Hourly limit
EN: "You've reached the swipe limit for this hour. Come back in a bit."
PL: "Osiągnięto limit swipe'ów na tę godzinę. Wróć za chwilę."

// Swipes remaining
EN: "{count} swipes left today"
PL: "Pozostało {count} swipe'ów dzisiaj"
```

#### Verification Messages
```typescript
// Verification required
EN: "Identity verification is required to use Swipe and Discovery..."
PL: "Weryfikacja tożsamości jest wymagana do korzystania z Swipe i Discovery..."

// Complete verification
EN: "Please complete your identity verification to access Swipe..."
PL: "Proszę dokończyć weryfikację tożsamości, aby uzyskać dostęp..."
```

---

## 🎮 Client-Side Integration Guide

### 1. Swipe Screen Implementation

#### A. Check Limits on Load

```typescript
// Call on screen mount
const limits = await functions.httpsCallable('pack284_getSwipeStats')();

// Display to user
const { swipesRemaining, nextRefillAt, nextResetAt } = limits.data;
```

#### B. Show Progress Indicator

```typescript
import { formatSwipesRemaining, formatRefreshTime } from './pack309-localization';

// Show subtle indicator
<Text>{formatSwipesRemaining(swipesRemaining, 'en')}</Text>
<Text>{formatRefreshTime(nextRefillAt - Date.now(), 'en')}</Text>
```

#### C. Handle Limit Errors

```typescript
try {
  const result = await functions.httpsCallable('pack284_processSwipe')({
    targetId,
    decision: 'like',
    platform: 'mobile'
  });
} catch (error) {
  if (error.code === 'resource-exhausted') {
    // Show limit banner
    const message = getSwipeLimitMessage('daily', userLanguage);
    showBanner(message.title, message.message);
    
    // Disable swipe gestures
    setSwipeEnabled(false);
  } else if (error.code === 'permission-denied') {
    // Verification required
    const verificationMessage = getVerificationErrorMessage(
      error.details?.code, 
      userLanguage
    );
    showVerificationPrompt(verificationMessage);
  }
}
```

### 2. Discovery Screen Implementation

#### A. Browse Discovery Grid

```typescript
// Fully free - no limit checks needed!
const feed = await functions.httpsCallable('pack283_discoveryBrowse')({
  lat: userLocation.lat,
  lng: userLocation.lng,
  radiusKm: 50,
  limit: 40,
  ageMin: 18,
  ageMax: 80,
  genderPreference: ['female'],
  onlyVerified: false,
  nsfwFilter: ['safe', 'soft']
});

// Display profiles
const { items } = feed.data;
```

#### B. Track Profile Views

```typescript
// When user taps profile in Discovery
await functions.httpsCallable('pack283_trackProfileView')({
  targetId: profileId,
  source: 'discovery'
});
```

#### C. Handle Verification Errors

```typescript
try {
  const feed = await discoveryBrowse(...);
} catch (error) {
  if (error.code === 'permission-denied') {
    // Show verification gate
    navigateToVerification();
  }
}
```

### 3. Verification Gate UI

```typescript
// Show when user accesses Swipe/Discovery without verification
function VerificationGate({ reason, language }) {
  const message = getVerificationErrorMessage(reason, language);
  
  return (
    <View>
      <Text style={styles.title}>{message.title}</Text>
      <Text style={styles.message}>{message.message}</Text>
      <Button onPress={startVerification}>
        {message.action}
      </Button>
    </View>
  );
}
```

---

## 🔢 Rate Limiting Rules

### Swipe Limits (PACK 284 + PACK 309)

| Limit Type | Value | Behavior |
|------------|-------|----------|
| **Daily Cap** | 50 swipes | Resets at midnight (user's timezone) |
| **Hourly Refill** | +10 swipes | Every 60 minutes while active |
| **Offline Accumulation** | No | Swipes don't stack when offline |
| **Example** | User offline 3h | Still has max 10 swipes available |

**Data Structure** ([`swipeStats`](functions/src/pack284-swipe-engine.ts:73)):
```typescript
{
  userId: string,
  date: "2025-12-10",           // Local date
  swipesUsedToday: 15,
  lastSwipeAt: Timestamp,
  lastRefillAt: Timestamp       // Last hour trigger
}
```

### Discovery (PACK 283 + PACK 309)

| Feature | Limit | Cost |
|---------|-------|------|
| **Browse Grid** | Unlimited | Free |
| **Profile Views** | Unlimited | Free |
| **Likes** | Unlimited | Free |
| **Throttle** | HTTP 429 if >100 req/min | Server-side only |

---

## 🔗 Integration Points

### PACK 306 (Identity Verification)

**Read From**:
- `users/{userId}/verification/status` — Verification state
  - `status: 'VERIFIED'`
  - `ageVerified: true`
  - `minAgeConfirmed: 18`

**Enforcement**:
- Block if not VERIFIED
- Block if age < 18
- Show verification flow

### PACK 299 (Analytics)

**Write To**:
- `analyticsEvents` collection
  - All swipe events (like, dislike, match, limit hits)
  - All discovery events (browse, view, like)

### PACK 301 (Retention Engine)

**Write To**:
- `userRetention/{userId}` — Activity tracking
  - `lastSwipeAt: Timestamp`
  - `lastActiveAt: Timestamp`

**Triggers**:
- Win-back campaigns for inactive swipers
- Onboarding nudges for users who haven't swiped

### PACK 284 (Swipe Engine)

**Uses**:
- Existing rate limiting logic (50/day + 10/hour)
- Existing queue selection algorithm
- Existing match creation

**Adds**:
- Verification enforcement
- Analytics logging
- Retention updates

### PACK 283 (Discovery)

**Uses**:
- Exis<br>ting free unlimited browsing
- Existing profile view tracking
- Existing ranking algorithm

**Adds**:
- Verification enforcement
- Analytics logging

---

## 🛡️ Safety & Anti-Abuse

### 1. Technical Throttling

**Swipe Abuse Detection** ([`detectAbusePatterns`](functions/src/pack284-swipe-engine.ts:803)):
```typescript
// If >50 swipes in 5 minutes
→ Flag as abuse
→ Log to swipeAbuseReports
→ Throw HTTP 429
→ Feed into Risk Engine (PACK 268)
```

**Discovery Anti-Spam**:
- Server-side request throttling
- HTTP 429 for excessive requests
- Not a product limit — purely technical safety

### 2. Verification Requirements

All Swipe and Discovery endpoints check:
```typescript
const check = await checkSwipeVerificationRequirements(userId);
if (!check.allowed) {
  throwVerificationError(check.reason);
}
```

**Error Codes**:
- `VERIFICATION_REQUIRED` — No verification attempt
- `VERIFICATION_NOT_COMPLETE` — Pending verification
- `AGE_NOT_VERIFIED` — Age check failed
- `UNDER_AGE` — User is under 18
- `VERIFICATION_CHECK_FAILED` — System error

---

## 📱 Mobile App Integration

### Required SDK Updates

```typescript
// app-mobile/lib/sdk.ts

export class AvaloSDK {
  // ... existing methods

  async getSwipeQueue(lat: number, lng: number, radiusKm = 50) {
    return this.callFunction('pack284_getSwipeQueue', {
      lat,
      lng,
      radiusKm,
      platform: 'mobile'
    });
  }

  async processSwipe(targetId: string, decision: 'like' | 'dislike') {
    return this.callFunction('pack284_processSwipe', {
      targetId,
      decision,
      platform: 'mobile'
    });
  }

  async getSwipeStats() {
    return this.callFunction('pack284_getSwipeStats', {});
  }

  async discoveryBrowse(lat: number, lng: number, filters = {}) {
    return this.callFunction('pack283_discoveryBrowse', {
      lat,
      lng,
      ...filters
    });
  }

  async trackProfileView(targetId: string, source: string) {
    return this.callFunction('pack283_trackProfileView', {
      targetId,
      source
    });
  }

  async getProfileVisitors(limit = 50) {
    return this.callFunction('pack283_getProfileVisitors', {
      limit
    });
  }
}
```

### Swipe Screen Component

```typescript
// app-mobile/app/swipe/index.tsx

import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AvaloSDK } from '../../lib/sdk';
import { formatSwipesRemaining, formatRefreshTime } from './localization';

export default function SwipeScreen() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSwipeData();
  }, []);

  async function loadSwipeData() {
    try {
      // Get stats for UI
      const statsResult = await AvaloSDK.getSwipeStats();
      setStats(statsResult);

      // Get queue if swipes available
      if (statsResult.swipesRemaining > 0) {
        const location = await getUserLocation();
        const queueResult = await AvaloSDK.getSwipeQueue(
          location.lat,
          location.lng
        );
        setQueue(queueResult.profiles);
      }
    } catch (error) {
      if (error.code === 'permission-denied') {
        // Show verification gate
        showVerificationScreen();
      } else {
        showError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSwipe(targetId, decision) {
    try {
      const result = await AvaloSDK.processSwipe(targetId, decision);
      
      // Update UI
      setStats({
        ...stats,
        swipesRemaining: result.remaining,
        nextRefillAt: result.nextRefillAt
      });

      // Handle match
      if (result.matched) {
        showMatchModal(result.matchId, result.chatId);
      }
    } catch (error) {
      if (error.code === 'resource-exhausted') {
        // Show limit banner
        showLimitBanner(error.message);
      }
    }
  }

  return (
    <View>
      {/* Stats banner */}
      {stats && (
        <Text>
          {formatSwipesRemaining(stats.swipesRemaining, userLanguage)}
        </Text>
      )}

      {/* Swipe cards */}
      {queue.map(profile => (
        <SwipeCard
          key={profile.userId}
          profile={profile}
          onSwipe={(decision) => handleSwipe(profile.userId, decision)}
        />
      ))}
    </View>
  );
}
```

### Discovery Screen Component

```typescript
// app-mobile/app/discovery/index.tsx

import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { AvaloSDK } from '../../lib/sdk';

export default function DiscoveryScreen() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDiscovery();
  }, []);

  async function loadDiscovery() {
    try {
      const location = await getUserLocation();
      const result = await AvaloSDK.discoveryBrowse(
        location.lat,
        location.lng,
        {
          radiusKm: 50,
          limit: 40,
          ageMin: 18,
          ageMax: 80
        }
      );
      setProfiles(result.items);
    } catch (error) {
      if (error.code === 'permission-denied') {
        showVerificationScreen();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileTap(profileId) {
    // Track view
    await AvaloSDK.trackProfileView(profileId, 'discovery');
    
    // Navigate to profile
    navigation.navigate('Profile', { userId: profileId });
  }

  return (
    <FlatList
      data={profiles}
      renderItem={({ item }) => (
        <DiscoveryCard
          profile={item}
          onPress={() => handleProfileTap(item.userId)}
        />
      )}
    />
  );
}
```

---

## 🌐 Web App Integration

### React Component Example

```typescript
// app-web/components/SwipeScreen.tsx

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function SwipeScreen() {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const functions = getFunctions();

  useEffect(() => {
    loadSwipeData();
  }, []);

  async function loadSwipeData() {
    try {
      const getStats = httpsCallable(functions, 'pack284_getSwipeStats');
      const statsResult = await getStats();
      setStats(statsResult.data);

      if (statsResult.data.swipesRemaining > 0) {
        const getQueue = httpsCallable(functions, 'pack284_getSwipeQueue');
        const queueResult = await getQueue({
          lat: userLat,
          lng: userLng,
          radiusKm: 50,
          platform: 'web'
        });
        setQueue(queueResult.data.profiles);
      }
    } catch (error) {
      handleSwipeError(error);
    }
  }

  async function handleSwipe(targetId, decision) {
    try {
      const processSwipe = httpsCallable(functions, 'pack284_processSwipe');
      const result = await processSwipe({
        targetId,
        decision,
        platform: 'web'
      });

      if (result.data.matched) {
        showMatchNotification(result.data);
      }

      setStats(prev => ({
        ...prev,
        swipesRemaining: result.data.remaining
      }));
    } catch (error) {
      handleSwipeError(error);
    }
  }

  return (
    <div className="swipe-container">
      {stats && (
        <div className="swipe-stats">
          {formatSwipesRemaining(stats.swipesRemaining)}
        </div>
      )}

      {queue.map(profile => (
        <SwipeCard
          key={profile.userId}
          profile={profile}
          onSwipe={(decision) => handleSwipe(profile.userId, decision)}
        />
      ))}
    </div>
  );
}
```

---

## 🧪 Testing Scenarios

### Test Case 1: New User First Swipe
```
1. User completes PACK 306 verification (18+ confirmed)
2. User opens Swipe screen
3. getSwipeQueue() → Returns 30 profiles, 50 swipes remaining
4. User swipes right on profile A
5. processSwipe() → Success, 49 swipes remaining
6. Analytics event SWIPE_LIKE logged ✓
7. Retention lastSwipeAt updated ✓
```

### Test Case 2: Daily Limit
```
1. User has used 50 swipes today
2. User tries to swipe
3. processSwipe() → Throws resource-exhausted error
4. Analytics event SWIPE_LIMIT_HIT_DAILY logged ✓
5. Client shows banner: "New swipes refresh tomorrow"
6. Swipe gestures disabled
```

### Test Case 3: Hourly Limit
```
1. User uses 10 swipes in 1 minute
2. User has 50 total for today, 0 for this hour
3. User tries to swipe again
4. processSwipe() → Throws resource-exhausted error
5. Analytics event SWIPE_LIMIT_HIT_HOURLY logged ✓
6. Client shows banner: "Come back in a bit"
7. After 60 minutes → 10 more swipes available
```

### Test Case 4: Unverified User
```
1. User has not completed PACK 306 verification
2. User tries to access Swipe screen
3. getSwipeQueue() → Throws permission-denied error
4. Client shows verification gate UI
5. User completes verification
6. User returns to Swipe screen → Access granted ✓
```

### Test Case 5: Discovery (Free & Unlimited)
```
1. Verified user opens Discovery
2. discoveryBrowse() → Returns 40 profiles
3. User scrolls through 200 profiles (pulls 5 times)
4. No limits hit ✓
5. All profile views are free ✓
6. All likes are free ✓
7. No swipe quota consumed ✓
```

### Test Case 6: Under 18 User
```
1. User attempts verification
2. PACK 306 estimates age as 17
3. Verification fails with UNDER_AGE
4. User tries to access Swipe
5. checkSwipeVerificationRequirements() → allowed: false
6. Error: "You must be 18 or older to use this feature"
7. Access permanently blocked ✓
```

---

## 📈 Analytics Dashboard Queries

### Swipe Metrics

```typescript
// Get swipe limit hits by type
const dailyLimitHits = await db.collection('analyticsEvents')
  .where('eventType', '==', 'SWIPE_LIMIT_HIT_DAILY')
  .where('timestamp', '>=', startDate)
  .get();

// Get average swipes per active user
const swipeLikes = await db.collection('analyticsEvents')
  .where('eventType', '==', 'SWIPE_LIKE')
  .where('timestamp', '>=', startDate)
  .get();

const uniqueUsers = new Set(swipeLikes.docs.map(d => d.data().userId));
const avgSwipesPerUser = swipeLikes.size / uniqueUsers.size;
```

### Discovery Metrics

```typescript
// Get discovery browse count
const browseEvents = await db.collection('analyticsEvents')
  .where('eventCategory', '==', 'discovery')
  .where('eventType', '==', 'DISCOVERY_BROWSE')
  .where('timestamp', '>=', startDate)
  .get();

// Get profile view to browse ratio
const viewEvents = await db.collection('analyticsEvents')
  .where('eventType', '==', 'DISCOVERY_PROFILE_VIEW')
  .where('timestamp', '>=', startDate)
  .get();

const viewRate = viewEvents.size / browseEvents.size;
```

---

## 🚀 Deployment Steps

### 1. Deploy Firestore Rules

```bash
# Deploy swipe limits rules
firebase deploy --only firestore:rules

# Or merge into main rules file
cat firestore-pack309-swipe-limits.rules >> infrastructure/firebase/firestore.rules
```

### 2. Deploy Firestore Indexes

```bash
# Deploy indexes
firebase deploy --only firestore:indexes

# Or merge into main indexes file
# (Already exists in firestore-pack309-swipe-limits.indexes.json)
```

### 3. Deploy Cloud Functions

```bash
# Build and deploy
cd functions
npm run build
firebase deploy --only functions

# Deploy specific functions only
firebase deploy --only functions:pack284_getSwipeQueue,functions:pack284_processSwipe,functions:pack284_getSwipeStats,functions:pack283_discoveryBrowse,functions:pack283_trackProfileView
```

### 4. Client-Side Updates

```bash
# Mobile app
cd app-mobile
# Update SDK with new function calls
# Deploy via EAS or TestFlight

# Web app
cd app-web
# Update components with new logic
# Deploy via Firebase Hosting
```

---

## ✅ Verification Checklist

- [x] **Server Logic**
  - [x] 50 swipes/day limit enforced
  - [x] 10 swipes/hour rolling refill
  - [x] No offline accumulation
  - [x] 18+ verification check on all endpoints
  - [x] Analytics events logged
  - [x] Retention profile updated

- [x] **Discovery Behavior**
  - [x] Free unlimited browsing
  - [x] Free profile views
  - [x] Free likes
  - [x] No swipe quota consumed
  - [x] 18+ verification required
  - [x] Anti-spam throttling

- [x] **Security**
  - [x] Firestore rules for all collections
  - [x] Server-side enforcement only
  - [x] Abuse detection for rapid swiping
  - [x] Verification status checks

- [x] **Localization**
  - [x] English messages
  - [x] Polish messages  
  - [x] Time formatting
  - [x] Counter formatting

- [x] **Integration**
  - [x] PACK 306 verification checks
  - [x] PACK 299 analytics events
  - [x] PACK 301 retention updates
  - [x] PACK 284 rate limiting
  - [x] PACK 283 discovery logic

- [x] **No Changes To**
  - [x] Token prices (unchanged)
  - [x] Revenue splits (65/35, 80/20 unchanged)
  - [x] Payout rate (0.20 PLN unchanged)
  - [x] Chat/call/calendar prices (unchanged)
  - [x] Refund policies (unchanged)

---

## 📊 Expected Metrics

### Swipe Engagement

- **Active Swipers**: Users who swipe at least once per day
- **Limit Hit Rate**: % of users hitting daily limit (target: 30-40%)
- **Hourly Refill Usage**: % of users using hourly refills (target: 50%+)
- **Match Rate**: Matches per 100 swipes (target: 2-5%)

### Discovery Usage

- **Discovery DAU**: Daily active users browsing Discovery
- **Profiles Viewed**: Average profiles viewed per session
- **View-to-Like Rate**: % of views resulting in likes
- **Discovery to Match**: Matches originated from Discovery browsing

### Verification Funnel

- **Verification Completion**: % of users completing 18+ verification
- **Blocked Under-18**: Count of users blocked for age
- **Verification Dropoff**: Users who start but don't complete

---

## 🎯 Success Criteria

✅ **Product Requirements**:
- Swipe limited to 50/day + 10/hour ← PACK 284 existing
- Discovery completely free ← PACK 283 existing
- 18+ verification enforced ← PACK 309 NEW
- Works on mobile and web ← Inherited from PACK 284/283

✅ **Technical Requirements**:
- Server-side enforcement only ← All logic in Cloud Functions
- Analytics  tracking ← PACK 309 integration
- Retention updates ← PACK 309 integration
- Firestore rules secure ← PACK 309 rules
- Indexes optimized ← PACK 309 indexes

✅ **Safety Requirements**:
- All users 18+ verified ← PACK 306 + PACK 309
- Abuse detection active ← PACK 284 existing
- Anti-spam throttling ← Both PACK 284 and server-side

✅ **Localization**:
- EN and PL messages ← PACK 309 NEW
- Verification errors localized ← PACK 309 NEW
- Time formatting regional ← PACK 309 NEW

---

## 🔍 Monitoring & Observability

### Key Metrics to Track

```typescript
// Admin dashboard queries

// 1. Swipe limit violations
SELECT COUNT(*) FROM analyticsEvents
WHERE eventType IN ('SWIPE_LIMIT_HIT_DAILY', 'SWIPE_LIMIT_HIT_HOURLY')
GROUP BY eventType, DATE(timestamp);

// 2. Verification blocks
SELECT COUNT(*) FROM auditLogs
WHERE action = 'VERIFICATION_BLOCK_SWIPE_ACCESS'
GROUP BY DATE(timestamp);

// 3. Discovery usage
SELECT COUNT(DISTINCT userId) FROM analyticsEvents
WHERE eventType = 'DISCOVERY_BROWSE'
AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY);

// 4. Abuse patterns
SELECT userId, COUNT(*) as violations
FROM swipeAbuseReports
WHERE reportedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY userId
ORDER BY violations DESC
LIMIT 100;
```

### Alerts to Configure

1. **Swipe Abuse Spike**: >100 abuse reports/hour
2. **Verification Failures**: >50 under-18 blocks/day
3. **Discovery Throttling**: >1000 HTTP 429s/hour
4. **Match Rate Drop**: Match rate <1% (indicates ranking issue)

---

## 🐛 Troubleshooting

### Issue: User sees "Verification Required" but says they're verified

**Diagnosis**:
```typescript
// Check verification status
const status = await db.collection('users')
  .doc(userId)
  .collection('verification')
  .doc('status')
  .get();

console.log(status.data());
// Expected: { status: 'VERIFIED', ageVerified: true, minAgeConfirmed: 18 }
```

**Fix**: Re-trigger PACK 306 verification flow

### Issue: Swipe limit not resetting at midnight

**Diagnosis**:
```typescript
// Check user's timezone
const user = await db.collection('users').doc(userId).get();
console.log(user.data().timezone); // Should be 'Europe/Warsaw', not 'UTC'
```

**Fix**: Ensure PACK 295 timezone is set correctly

### Issue: Discovery showing no profiles

**Diagnosis**:
```typescript
// Check discoveryPresence sync
const presence = await db.collection('discoveryPresence').get();
console.log(presence.size); // Should be >0
```

**Fix**: Trigger [`syncUserToDiscoveryPresence`](functions/src/pack283-discovery.ts:479) for users

---

## 📚 Related Documentation

- [PACK 284 — Swipe Engine](functions/src/pack284-swipe-engine.ts)
- [PACK 283 — Discovery & People Browser](functions/src/pack283-discovery.ts)
- [PACK 306 — Identity Verification](functions/src/pack306-verification.ts)
- [PACK 301 — Retention Engine](functions/src/pack301-activity-hook.ts)
- [PACK 299 — Analytics] (via analyticsEvents collection)

---

## 🎉 Summary

**PACK 309** successfully implements the final swipe limits and Discovery behavior by:

1. ✅ **Enhancing PACK 284 Swipe Engine** with verification + analytics
2. ✅ **Enhancing PACK 283 Discovery** with verification + analytics
3. ✅ **Adding dedicated modules** for verification, analytics, and localization
4. ✅ **Securing with Firestore rules** for all collections
5. ✅ **Optimizing with indexes** for all queries
6. ✅ **Localizing for EN/PL** markets

**Result**: A complete, production-ready swipe limit and discovery system that works identically on mobile and web, enforces 18+ requirements, tracks all user behavior, and maintains free unlimited Discovery access.

**Zero Changes To**: Token prices, revenue splits, payout rates, chat/call/calendar/event pricing, or refund policies.

---

**Implementation Complete** ✅  
All PACK 309 requirements delivered and integrated with existing systems.