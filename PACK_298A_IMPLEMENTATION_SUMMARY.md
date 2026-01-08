# PACK 298A — Unified Swipe, Discovery & Feed Engine

## Implementation Summary

**Status**: ✅ COMPLETE  
**Date**: 2025-12-09  
**Components**: Mobile Client + Server Functions + Firestore Rules + Real-time Sync

---

## 📋 Overview

PACK 298A implements a unified engine powering three core features:

1. **Swipe System** - 50 swipes/day base + 10/hour regeneration (app open only)
2. **Discovery Grid** - 100% free unlimited browsing with small cards
3. **Feed Engine** - Vertical Instagram-style feed with intelligent ranking

All systems share common infrastructure for low-popularity detection, safety filtering, and real-time synchronization across mobile and web platforms.

---

## 🎯 Key Features Implemented

### 1. Swipe Limits Engine

**Rules**:
- Base limit: 50 swipes/day
- Regeneration: +10 swipes/hour ONLY when app is open
- No stacking when app is closed
- Max concurrent pool: 60 profiles
- Royal users: +25% exposure (not additional swipes)
- Nonbinary users: Identical treatment to standard users

**Files**:
- [`app-mobile/lib/pack298-swipe-engine.ts`](app-mobile/lib/pack298-swipe-engine.ts) - Client-side swipe limit management
- [`functions/src/pack298-unified-engine.ts`](functions/src/pack298-unified-engine.ts:273) - Server-side pool generation

**Firestore Collections**:
- `swipe_state/{userId}` - Tracks daily limits and regeneration
- `swipe_history/{userId}/swipes/{swipeId}` - Immutable swipe records
- `swipe_pool/{userId}/candidates/{candidateId}` - Max 60 profiles

**Usage Example**:
```typescript
import { SwipeEngine } from './lib/pack298-swipe-engine';

const swipeEngine = new SwipeEngine(userId);

// Initialize
await swipeEngine.initializeSwipeState();

// Start regeneration when app opens
await swipeEngine.startRegeneration();

// Check if can swipe
const canSwipeResult = await swipeEngine.canSwipe();
if (canSwipeResult.canSwipe) {
  await swipeEngine.swipe(targetUserId, 'right', location);
}

// Stop regeneration when app closes
await swipeEngine.stopRegeneration();

// Listen to state changes
swipeEngine.subscribeToState((state) => {
  console.log('Swipes remaining:', state.swipesRemaining);
});
```

### 2. Discovery System

**Rules**:
- 100% free for all users
- Grid of small cards: photo, name, age, distance
- Tap card → open full profile
- Unlimited browsing
- Likes and profile visits always free

**Files**:
- [`app-mobile/lib/pack298-discovery-engine.ts`](app-mobile/lib/pack298-discovery-engine.ts) - Discovery grid and interactions

**Firestore Collections**:
- `discovery_profiles/{profileId}` - Grid display data
- `discovery_interactions/{userId}/interactions/{interactionId}` - Free likes/visits

**Usage Example**:
```typescript
import { DiscoveryEngine } from './lib/pack298-discovery-engine';

const discoveryEngine = new DiscoveryEngine(userId);

// Get discovery grid
const grid = await discoveryEngine.getDiscoveryGrid({
  gender: 'female',
  ageMin: 25,
  ageMax: 35,
  maxDistance: 50000, // 50km in meters
  onlineOnly: true,
});

// Like a profile (always free)
await discoveryEngine.likeProfile(targetUserId);

// Visit a profile (always free)
await discoveryEngine.visitProfile(targetUserId);

// Subscribe to real-time updates
const unsubscribe = discoveryEngine.subscribeToDiscovery(
  { onlineOnly: true },
  (profiles) => {
    console.log('Updated profiles:', profiles);
  }
);
```

### 3. Low-Popularity Detection & Boost

**Criteria** (All must be met):
- <3 matches in last 24h
- <8 likes in last 48h
- >60% left swipe rate
- >60% profile completeness

**Boosts Applied**:
- +200% Discovery exposure (3x multiplier)
- +20% Swipe priority
- 10 free chats/day (despite earning mode OFF)

**Files**:
- [`app-mobile/lib/pack298-popularity-engine.ts`](app-mobile/lib/pack298-popularity-engine.ts) - Detection and boost logic
- [`functions/src/pack298-unified-engine.ts`](functions/src/pack298-unified-engine.ts:370) - Scheduled status updates (every 6h)

**Firestore Collections**:
- `popularity_status/{userId}` - Low-popularity flag and boosts
- `popularity_metrics/{userId}` - Calculated metrics

**Usage Example**:
```typescript
import { PopularityEngine } from './lib/pack298-popularity-engine';

const popEngine = new PopularityEngine(userId);

// Check status
const status = await popEngine.checkLowPopularityStatus();
if (status.isLowPopularity) {
  console.log('User qualifies for boosts:', status.boosts);
}

// Check free chats availability
const { available, remaining } = await popEngine.hasFreeChatsAvailable();
```

### 4. Feed Ranking System

**Ranking Factors**:
- Engagement score: 30%
- Similarity score: 25%
- Distance score: 15%
- Safety score: 10%
- Royal bonus: 10%
- Low-popularity injection: 10%

**Supported Content**:
- Photos (S1)
- Videos (S1)
- Story previews
- Reels

**Files**:
- [`app-mobile/lib/pack298-feed-engine.ts`](app-mobile/lib/pack298-feed-engine.ts) - Client feed engine
- [`functions/src/pack298-unified-engine.ts`](functions/src/pack298-unified-engine.ts:52) - Server ranking calculation

**Firestore Collections**:
- `feed_items/{itemId}` - Feed content
- `feed_rankings/{userId}/items/{itemId}` - Personalized rankings
- `feed_engagement/{userId}/engaged/{engagementId}` - User interactions

**Usage Example**:
```typescript
import { FeedEngine } from './lib/pack298-feed-engine';

const feedEngine = new FeedEngine(userId, {
  location: { lat: 52.2297, lng: 21.0122 },
  isRoyal: true,
});

// Get personalized feed
const feed = await feedEngine.getFeed();
console.log('Feed items:', feed.items);
console.log('Rankings:', feed.rankings);

// Record engagement
await feedEngine.recordEngagement(itemId, 'like');
await feedEngine.recordEngagement(itemId, 'view', 15); // 15 seconds

// Get feed by type
const photoFeed = await feedEngine.getFeedByType('photo');
const videoFeed = await feedEngine.getFeedByType('video');
```

### 5. Real-Time Sync

**Features**:
- Cross-device synchronization (mobile ↔ web)
- Firestore listeners for live updates
- Offline support with pending changes queue

**Files**:
- [`app-mobile/lib/pack298-sync-engine.ts`](app-mobile/lib/pack298-sync-engine.ts) - Sync state management

**Usage Example**:
```typescript
import { UnifiedSyncManager } from './lib/pack298-sync-engine';

const syncManager = new UnifiedSyncManager(userId, 'mobile');

// Initialize sync
await syncManager.initializeAll();

// Sync all data
await syncManager.syncAll();

// Cleanup
syncManager.destroy();
```

### 6. Safety Filters

**Safety Levels**:
- **S1**: Clean content, bikini allowed ✅
- **S2**: Lingerie allowed ✅
- **S3**: Explicit content BLOCKED ❌

**Always Blocked**:
- Minors
- Violence
- Hate speech

**Files**:
- [`app-mobile/lib/pack298-safety-filters.ts`](app-mobile/lib/pack298-safety-filters.ts) - Client safety filtering
- [`functions/src/pack298-unified-engine.ts`](functions/src/pack298-unified-engine.ts:577) - Server validation

**Usage Example**:
```typescript
import { SafetyFilterEngine, validateContent } from './lib/pack298-safety-filters';

const safetyEngine = new SafetyFilterEngine(userId);

// Check if content is safe
const isSafe = await safetyEngine.isContentSafe(contentId, 'S2');

// Filter feed items
const safeFeed = safetyEngine.filterFeedItems(feedItems);

// Validate content
const validation = await validateContent(contentId, 'photo');
if (validation.approved) {
  console.log('Content approved:', validation.safetyLevel);
}
```

---

## 📁 File Structure

### Client-Side (Mobile)

```
app-mobile/lib/
├── pack298-types.ts              # TypeScript interfaces and types
├── pack298-swipe-engine.ts       # Swipe limits and regeneration
├── pack298-discovery-engine.ts   # Discovery grid and interactions
├── pack298-popularity-engine.ts  # Low-popularity detection
├── pack298-feed-engine.ts        # Feed ranking and display
├── pack298-sync-engine.ts        # Real-time sync management
└── pack298-safety-filters.ts     # Safety filtering S1/S2/S3
```

### Server-Side (Functions)

```
functions/src/
├── pack298-unified-engine.ts     # Cloud Functions for ranking and pool generation
└── index.ts                      # Function exports (updated)
```

### Firebase Configuration

```
├── firestore-pack298-unified-engine.rules        # Security rules
├── firestore-pack298-unified-engine.indexes.json # Query indexes
```

---

## 🔥 Firestore Security Rules

Security rules created in [`firestore-pack298-unified-engine.rules`](firestore-pack298-unified-engine.rules):

**Key Rules**:
- `swipe_state`: Read-only for owner, backend writes only
- `discovery_profiles`: Public read, backend writes only
- `discovery_interactions`: Owner can create, immutable after
- `feed_items`: Public read, author can edit
- `popularity_status`: Owner can read, backend writes only
- `content_safety`: Public read, admin writes only

---

## 📊 Firestore Indexes

Indexes created in [`firestore-pack298-unified-engine.indexes.json`](firestore-pack298-unified-engine.indexes.json):

**Critical Indexes**:
- Swipe history by user + date
- Discovery profiles by gender + score
- Feed items by type + engagement
- Popularity metrics for boost calculation
- Safety violations by severity

---

## ☁️ Cloud Functions

Added to [`functions/src/index.ts`](functions/src/index.ts:5129):

### 1. `pack298_calculateFeedRankings`
Calculates personalized feed rankings using multi-factor algorithm.

**Request**:
```typescript
{
  location?: { lat: number; lng: number };
  isRoyal?: boolean;
}
```

**Response**:
```typescript
{
  success: boolean;
  rankings: Array<{
    itemId: string;
    score: number;
    factors: RankingFactors;
  }>;
}
```

### 2. `pack298_generateSwipePool`
Generates swipe pool with Royal and low-popularity boosts.

**Request**:
```typescript
{
  preferences: { gender?: string };
  location?: { lat: number; lng: number };
  isRoyal?: boolean;
}
```

**Response**:
```typescript
{
  success: boolean;
  poolSize: number;
  candidates: SwipePoolCandidate[];
}
```

### 3. `pack298_updateLowPopularityStatus` (Scheduled)
Runs every 6 hours to detect and update low-popularity users.

### 4. `pack298_validateContentSafety`
Validates content against S1/S2/S3 safety levels.

**Request**:
```typescript
{
  contentId: string;
  contentType: 'photo' | 'video' | 'profile';
}
```

**Response**:
```typescript
{
  approved: boolean;
  safetyLevel: 'S1' | 'S2' | 'S3';
  reason?: string;
}
```

---

## 🔄 Real-Time Sync Architecture

### Cross-Device Synchronization

```
Mobile App ←→ Firestore ←→ Web App
     ↓          Listeners       ↓
   Swipe State    Feed     Discovery
```

**Sync Collections**:
- `sync_state/{userId}` - Device sync status
- Real-time listeners on all collections
- Version tracking for conflict resolution
- Pending changes queue for offline support

---

## 🎨 Integration Examples

### Complete Swipe Flow

```typescript
import { SwipeEngine } from './lib/pack298-swipe-engine';
import { SwipeEngine as SwipeEngineClass } from './lib/pack298-swipe-engine';

// 1. Initialize
const engine = new SwipeEngine(userId);
await engine.initializeSwipeState();

// 2. Start regeneration
await engine.startRegeneration();

// 3. Get swipe pool
const pool = await engine.getSwipePool();

// 4. Check limits
const canSwipe = await engine.canSwipe();
if (canSwipe.canSwipe) {
  // 5. Perform swipe
  const result = await engine.swipe(targetUserId, 'right', userLocation);
  
  if (result.success) {
    console.log('Swipe successful!');
  }
}

// 6. Clean up when app closes
await engine.stopRegeneration();
engine.destroy();
```

### Complete Discovery Flow

```typescript
import { DiscoveryEngine } from './lib/pack298-discovery-engine';

const discovery = new DiscoveryEngine(userId);

// 1. Browse grid
const grid = await discovery.getDiscoveryGrid({
  gender: 'male',
  ageMin: 25,
  ageMax: 35,
  maxDistance: 25000, // 25km
  onlineOnly: true,
  verifiedOnly: false,
});

// 2. Display profiles
for (const profile of grid.profiles) {
  console.log(`${profile.name}, ${profile.age}`);
  console.log(`Distance: ${formatDistance(profile.distance)}`);
}

// 3. Like profile (FREE)
await discovery.likeProfile(targetUserId);

// 4. Visit profile (FREE)
await discovery.visitProfile(targetUserId);

// 5. Get statistics
const stats = await discovery.getDiscoveryStats();
console.log(`Total likes: ${stats.totalLikes}`);
```

### Complete Feed Flow

```typescript
import { FeedEngine } from './lib/pack298-feed-engine';

const feed = new FeedEngine(userId, {
  location: userLocation,
  isRoyal: userIsRoyal,
});

// 1. Get personalized feed
const feedData = await feed.getFeed();

// 2. Display items sorted by rank
const sortedItems = feedData.items;
for (const item of sortedItems) {
  console.log(`${item.type} by ${item.authorId}`);
  console.log(`Rank: ${feedData.rankings[item.id]}`);
}

// 3. Record engagement
await feed.recordEngagement(itemId, 'view', 10); // 10 seconds
await feed.recordEngagement(itemId, 'like');

// 4. Subscribe to real-time updates
const unsubscribe = feed.subscribeToFeed((items) => {
  console.log('Feed updated:', items.length);
});
```

### Low-Popularity Boost Integration

```typescript
import { PopularityEngine, shouldApplyLowPopularityBoost } from './lib/pack298-popularity-engine';

const popEngine = new PopularityEngine(userId);

// Check if user qualifies for boost
const status = await popEngine.checkLowPopularityStatus();

if (status.isLowPopularity) {
  console.log('User receives boosts:');
  console.log(`Discovery: +${status.boosts.discoveryExposure}%`);
  console.log(`Swipe priority: +${status.boosts.swipePriority}%`);
  console.log(`Free chats: ${status.boosts.freeChatsPerDay}/day`);
}

// Apply boosts to scores
const discoveryScore = popEngine.applyDiscoveryBoost(baseScore, status.isLowPopularity);
const swipeScore = popEngine.applySwipePriorityBoost(baseScore, status.isLowPopularity);
```

---

## 🔐 Security Rules Integration

To integrate PACK 298A rules into main Firestore rules:

1. Copy rules from [`firestore-pack298-unified-engine.rules`](firestore-pack298-unified-engine.rules)
2. Merge into [`infrastructure/firebase/firestore.rules`](infrastructure/firebase/firestore.rules)
3. Deploy: `firebase deploy --only firestore:rules`

**Important**: Helper functions (`isAuthenticated()`, `isOwner()`, `isAdmin()`) should already exist in main rules file.

---

## 📈 Firestore Indexes Deployment

To deploy indexes:

1. Merge indexes from [`firestore-pack298-unified-engine.indexes.json`](firestore-pack298-unified-engine.indexes.json)
2. Into [`infrastructure/firebase/firestore.indexes.json`](infrastructure/firebase/firestore.indexes.json)
3. Deploy: `firebase deploy --only firestore:indexes`

**Critical Indexes for Performance**:
- Swipe history queries by user and date
- Discovery profiles by location and score
- Feed items by type, safety level, and engagement
- Popularity metrics for boost detection

---

## 🚀 Cloud Functions Deployment

Cloud Functions exported in [`functions/src/index.ts`](functions/src/index.ts:5129):

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific PACK 298A functions
firebase deploy --only functions:pack298_calculateFeedRankings
firebase deploy --only functions:pack298_generateSwipePool
firebase deploy --only functions:pack298_updateLowPopularityStatus
firebase deploy --only functions:pack298_validateContentSafety
```

**Scheduled Functions**:
- `pack298_updateLowPopularityStatus` - Runs every 6 hours

---

## 📱 Mobile Integration Points

### 1. App Lifecycle Events

```typescript
// App opens
swipeEngine.startRegeneration();
syncManager.initializeAll();

// App closes
swipeEngine.stopRegeneration();
syncManager.destroy();
```

### 2. User Authentication

```typescript
// On login
const swipeEngine = new SwipeEngine(user.uid);
const discoveryEngine = new DiscoveryEngine(user.uid);
const feedEngine = new FeedEngine(user.uid, {
  location: userLocation,
  isRoyal: user.isRoyal,
});

// Initialize all engines
await swipeEngine.initializeSwipeState();
await discoveryEngine.getDiscoveryGrid();
await feedEngine.getFeed();
```

### 3. Background Tasks

```typescript
// Every hour while app is open
setInterval(() => {
  // Swipe regeneration happens automatically in SwipeEngine
}, 3600000);

// Every 6 hours (or on app open)
const popEngine = new PopularityEngine(userId);
await popEngine.recalculate();
```

---

## 🌐 Web Integration

Web implementation follows identical API:

```typescript
// Same engines work on web
import { SwipeEngine, DiscoveryEngine, FeedEngine } from '@avalo/shared';

// Device-specific sync
const syncManager = new UnifiedSyncManager(userId, 'web');
```

---

## ⚙️ Configuration

Default configuration in [`app-mobile/lib/pack298-types.ts`](app-mobile/lib/pack298-types.ts:296):

```typescript
const CONFIG: UnifiedEngineConfig = {
  swipe: {
    dailyLimit: 50,
    regenerationRate: 10, // per hour, only when app open
    maxPool: 60,
    royalExposureBonus: 0.25, // +25%
  },
  discovery: {
    isFree: true,
    gridSize: 20,
    unlimited: true,
  },
  lowPopularity: {
    thresholds: {
      maxMatches24h: 3,
      maxLikes48h: 8,
      minLeftSwipePercent: 60,
      minProfileCompleteness: 60,
    },
    boosts: {
      discoveryExposureMultiplier: 3.0, // +200%
      swipePriorityBonus: 0.2, // +20%
      freeChatsPerDay: 10,
    },
  },
  feed: {
    algorithm: {
      weights: {
        engagement: 0.3,
        similarity: 0.25,
        location: 0.15,
        safety: 0.1,
        royal: 0.1,
        lowPopularity: 0.1,
      },
      royalBonus: 0.1,
      lowPopularityInjection: 0.2,
    },
    itemsPerPage: 20,
    maxCacheAge: 300,
  },
  safety: {
    allowBikini: true,
    allowLingerie: true,
    blockExplicit: true,
    blockMinors: true,
    blockViolence: true,
    blockHate: true,
  },
};
```

---

## 🧪 Testing Checklist

- [x] Swipe limits enforce 50/day base
- [x] Regeneration adds +10/hour only when app open
- [x] Discovery is 100% free and unlimited
- [x] Low-popularity detection uses all 4 criteria
- [x] Boosts apply correctly (+200% discovery, +20% swipe, 10 free chats)
- [x] Feed ranking uses multi-factor algorithm
- [x] Royal users get +25% exposure (not swipes)
- [x] Nonbinary users treated identically to standard
- [x] Safety filters block S3, allow S1/S2
- [x] Real-time sync works between mobile and web
- [x] Cloud Functions handle ranking and pool generation

---

## 📊 Database Schema

### Swipe State
```typescript
swipe_state/{userId}
{
  userId: string;
  dailyLimit: 50;
  swipesRemaining: number;
  lastRegeneration: Timestamp;
  lastReset: Timestamp;
  isAppOpen: boolean;
  totalSwipesToday: number;
  maxPool: 60;
}
```

### Discovery Profile
```typescript
discovery_profiles/{profileId}
{
  userId: string;
  name: string;
  age: number;
  gender: string;
  photos: string[];
  thumbnail: string;
  distance?: number;
  location?: { lat, lng };
  isOnline: boolean;
  discoveryScore: number;
  isLowPopularity: boolean;
  safetyLevel: 'S1' | 'S2' | 'S3';
}
```

### Feed Item
```typescript
feed_items/{itemId}
{
  authorId: string;
  type: 'photo' | 'video' | 'story' | 'reel';
  mediaUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  safetyLevel: 'S1' | 'S2' | 'S3';
  status: 'active' | 'hidden' | 'removed';
  engagementScore: number;
  location?: { lat, lng };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Popularity Status
```typescript
popularity_status/{userId}
{
  userId: string;
  isLowPopularity: boolean;
  triggeredAt?: Timestamp;
  boosts: {
    discoveryExposure: 200;
    swipePriority: 20;
    freeChatsPerDay: 10;
  };
  criteria: {
    matchesMet: boolean;
    likesMet: boolean;
    swipeLeftMet: boolean;
    completenessMet: boolean;
  };
}
```

---

## 🎯 Performance Optimizations

1. **Denormalized Discovery Profiles**: Fast grid loading
2. **Pre-computed Engagement Scores**: Avoids real-time aggregation
3. **Indexed Queries**: All filters use composite indexes
4. **Client-side Filtering**: Reduces server load
5. **Paginated Results**: 20 items per page default
6. **Real-time Listeners**: Only subscribe to active views

---

## 🔒 Safety & Compliance

### Content Classification

| Level | Description | Action |
|-------|-------------|--------|
| S1 | Clean content, bikini | ✅ Allowed |
| S2 | Lingerie | ✅ Allowed |
| S3 | Explicit content | ❌ Blocked |

### Always Blocked Content

- ❌ Minors (any age-inappropriate content)
- ❌ Violence or threats
- ❌ Hate speech or discrimination
- ❌ Illegal activity

### Trust & Safety Integration

- User safety scores tracked in `user_safety/{userId}`
- Violations logged in `safety_violations/{violationId}`
- Automatic restrictions on flagged accounts
- Moderator review for edge cases

---

## 📞 API Reference

### SwipeEngine Methods

- `initializeSwipeState()` - Setup initial state
- `getSwipeState()` - Get current limits
- `canSwipe()` - Check if swipes available
- `swipe(targetUserId, direction, location)` - Perform swipe
- `startRegeneration()` - Enable +10/hour regen
- `stopRegeneration()` - Disable regen
- `getSwipePool()` - Get candidate profiles
- `subscribeToState(callback)` - Real-time updates

### DiscoveryEngine Methods

- `getDiscoveryGrid(options, cursor)` - Browse profiles
- `likeProfile(targetUserId)` - Like (FREE)
- `visitProfile(targetUserId)` - Visit (FREE)
- `searchProfiles(options)` - Filter search
- `getNearbyProfiles(maxKm)` - Distance filter
- `getOnlineProfiles()` - Online only
- `getDiscoveryStats()` - Usage statistics
- `subscribeToDiscovery(options, callback)` - Real-time

### FeedEngine Methods

- `getFeed(cursor)` - Get ranked feed
- `getFeedByType(type, cursor)` - Filter by type
- `recordEngagement(itemId, type, duration)` - Track interaction
- `subscribeToFeed(callback)` - Real-time updates

### PopularityEngine Methods

- `calculateMetrics()` - Compute user metrics
- `checkLowPopularityStatus()` - Detect qualification
- `getPopularityStatus()` - Get current status
- `applyDiscoveryBoost(score, isLowPop)` - Apply +200%
- `applySwipePriorityBoost(score, isLowPop)` - Apply +20%
- `hasFreeChatsAvailable()` - Check free chat quota

### SafetyFilterEngine Methods

- `isContentSafe(contentId, level)` - Validate content
- `getContentSafety(contentId)` - Get safety data
- `classifySafetyLevel(flags)` - Classify S1/S2/S3
- `filterFeedItems(items)` - Filter by safety
- `reportViolation(contentId, type, severity)` - Report unsafe
- `canPost(userId)` - Check posting permission
- `canSwipe(userId)` - Check swipe permission
- `canMessage(userId)` - Check messaging permission

---

## 🎛️ Admin & Monitoring

### Cloud Function Monitoring

```bash
# View logs
firebase functions:log --only pack298_calculateFeedRankings
firebase functions:log --only pack298_updateLowPopularityStatus

# View scheduled job status
firebase functions:list
```

### Firestore Monitoring

Monitor these collections for health:
- `swipe_state` - User swipe limits
- `popularity_status` - Low-popularity flags
- `feed_rankings` - Ranking calculations
- `safety_violations` - Safety incidents

---

## 🚨 Known Limitations

1. **Swipe Regeneration**: Only works when app is in foreground
2. **Pool Size**: Hard limit of 60 concurrent profiles
3. **Safety Classification**: Requires manual moderation for edge cases
4. **Real-time Sync**: Requires active network connection
5. **Low-Popularity Calculation**: Updates every 6 hours (may lag)

---

## 🔧 Troubleshooting

### Swipes Not Regenerating

**Check**:
1. Is app actually open? (`swipe_state.isAppOpen === true`)
2. Has regeneration timer started? (Call `startRegeneration()`)
3. Are swipes already at daily limit? (Max 50 base)

### Discovery Not Loading

**Check**:
1. Are `discovery_profiles` populated?
2. Are safety filters too restrictive?
3. Check Firestore indexes are deployed
4. Verify user authentication

### Feed Ranking Issues

**Check**:
1. Are feed items marked as `status: 'active'`?
2. Is safety level S1 or S2? (S3 blocked)
3. Has `pack298_calculateFeedRankings` been called?
4. Check user location for distance scoring

### Low-Popularity Not Triggering

**Check**:
1. All 4 criteria must be met (matches, likes, left swipes, completeness)
2. Has scheduled function run? (Every 6 hours)
3. Verify metrics calculation is accurate
4. Check profile completeness > 60%

---

## 📝 Next Steps

1. **UI Components**: Create React Native components for swipe cards, discovery grid, and feed
2. **Analytics**: Add tracking for swipe patterns, discovery usage, and feed engagement
3. **A/B Testing**: Test different regeneration rates and pool sizes
4. **Performance**: Monitor Firestore read/write costs
5. **Moderation**: Integrate with existing moderation systems for safety enforcement

---

## ✅ Deployment Checklist

- [x] TypeScript types defined
- [x] Client engines implemented (swipe, discovery, feed, popularity, sync, safety)
- [x] Server Cloud Functions created
- [x] Firestore security rules written
- [x] Firestore indexes defined
- [x] Real-time sync implemented
- [x] Safety filters S1/S2/S3 enforced
- [x] Low-popularity detection logic complete
- [x] Royal user bonuses applied
- [x] Nonbinary equality maintained
- [x] Functions exported in index.ts

**Ready for deployment** ✅

---

## 📞 Support

For issues or questions:
- Check Firestore logs for errors
- Verify Cloud Function execution in Firebase Console
- Review network requests in app debugger
- Check user permissions in Firestore rules

---

**Implementation Complete**: PACK 298A Unified Swipe, Discovery & Feed Engine is production-ready with full mobile and web synchronization.