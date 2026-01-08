# PACK 311 — AI Companions Marketplace, Ranking & Owner Analytics
## Implementation Summary

**Status:** ✅ **COMPLETE**  
**Implementation Date:** 2025-12-10  
**Version:** 1.0

---

## Overview

This document describes the complete implementation of the AI Companions Marketplace for Avalo, building on top of PACK 310 (AI Companions). This pack adds discovery surfaces, ranking algorithms, and owner analytics while maintaining all existing tokenomics.

---

## Core Principles

✅ **No tokenomics changes:**
- Same token packages and prices
- Same 0.20 PLN/token payout rate
- Same 65/35 revenue split for AI chats
- No promotional systems or bonuses

✅ **Discovery-focused:**
- Global marketplace for AI avatar discovery
- Smart ranking based on performance and trust
- Language and category filtering
- Pagination for scalability

✅ **Owner transparency:**
- Detailed analytics for avatar creators
- 7-day and 30-day metrics
- Retention score tracking
- No additional payouts, just visibility

✅ **Safety-first approach:**
- Respects verification status (18+ only)
- Integrates risk levels from PACK 307
- Excludes CRITICAL risk avatars
- Moderator controls maintained

---

## 1. Data Model

### 1.1 AI Avatar Index Document

**Collection:** `aiAvatarIndex/{avatarId}`

```typescript
{
  avatarId: string;
  ownerId: string;
  
  status: "ACTIVE" | "PAUSED" | "BANNED";
  
  displayName: string;
  shortTagline: string;
  primaryPhotoUrl: string;
  
  languages: string[];              // ["pl", "en"]
  primaryLanguage: string;          // "pl"
  
  categoryTags: string[];           // ["romantic", "chatty", "coach"]
  
  country: string;                  // "PL" - derived from owner
  region?: string;                  // "EU_EAST" - optional clustering
  
  trust: {
    ownerVerified: boolean;
    ownerTrustLevel: "HIGH" | "MEDIUM" | "LOW";
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
  
  stats: {
    views7d: number;
    views30d: number;
    starts7d: number;               // AI chat sessions started
    starts30d: number;
    tokensEarned7d: number;
    tokensEarned30d: number;
    retentionScore: number;         // ratio: returning users / all users
  };
  
  rankingScore: number;             // precomputed 0-100 for listing
  lastRankingUpdatedAt: string;     // ISO_DATETIME
}
```

**Key Properties:**
- Read-only for clients (write via Cloud Functions only)
- Rebuilt daily via cron job
- Top 100 avatars updated hourly
- Indexed for fast queries

---

## 2. Ranking Logic

### 2.1 Score Calculation

**Formula:**
```
score = 0
  + views7d * 0.01
  + starts7d * 0.1
  + tokensEarned7d * 0.001
  + retentionScore * 0.5

// Trust bonus
if ownerTrustLevel = HIGH -> +0.2
if ownerTrustLevel = MEDIUM -> +0.1
if ownerTrustLevel = LOW -> +0.0

// Risk penalty
if riskLevel = MEDIUM -> -0.2
if riskLevel = HIGH   -> -0.5
if riskLevel = CRITICAL -> -1.0

clamp score to [0, +inf)
normalize to 0-100 for UI
```

**Components:**
- **Views**: Discovery visibility (low weight)
- **Starts**: User engagement (medium weight)
- **Earnings**: Quality indicator (medium weight)
- **Retention**: User satisfaction (high weight)
- **Trust**: Owner reputation bonus
- **Risk**: Safety penalty

### 2.2 Trust Level Determination

Based on:
- `trustScore` from user profile (0-100)
- Account age (days since creation)
- Verification status (18+ verified)

**Levels:**
- **HIGH**: trustScore ≥80, age ≥90 days, verified
- **MEDIUM**: trustScore ≥50, age ≥30 days, verified
- **LOW**: Everything else

### 2.3 Category Tags

Derived automatically from:
- Avatar vibe (personaProfile.vibe)
- Style tone (styleConfig.tone)
- Topics (personaProfile.topics)

**Examples:**
- `romantic` → from "romantic" or "playful" vibe
- `chatty` → from FRIENDLY tone
- `coach` → from COACH tone
- `intellectual` → from "intellectual" or "creative" vibe

---

## 3. Backend Implementation

### 3.1 Core Functions

**File:** [`functions/src/aiMarketplaceRanking.ts`](functions/src/aiMarketplaceRanking.ts:1)

**Key Functions:**

1. **`calculateRankingScore()`** - Compute ranking score
   - Inputs: stats, trustLevel, riskLevel
   - Output: RankingCalculation with breakdown
   - Pure function, no side effects

2. **`aggregateAvatarAnalytics()`** - Collect analytics data
   - Queries analytics_events for views/starts
   - Queries aiSessions for earnings
   - Calculates unique/returning users
   - Returns AnalyticsAggregationResult

3. **`getOwnerTrustInfo()`** - Determine trust level
   - Reads user profile
   - Checks verification status
   - Computes trust level based on criteria

4. **`deriveCategoryTags()`** - Extract category tags
   - Analyzes persona profile
   - Maps vibe/tone/topics to tags
   - Returns unique tag array

5. **`rebuildAvatarIndex()`** - Rebuild index for single avatar
   - Fetches avatar data
   - Aggregates analytics
   - Calculates ranking
   - Writes to aiAvatarIndex

6. **`rebuildAllAvatarIndexes()`** - Rebuild all active avatars
   - Queries all ACTIVE avatars
   - Processes each one
   - Returns summary (processed/skipped/errors)

### 3.2 API Endpoints

**File:** [`functions/src/aiMarketplaceFunctions.ts`](functions/src/aiMarketplaceFunctions.ts:1)

**Callable Functions:**

1. **`getAIMarketplace`** - Global discovery
   - Query params: lang, country, page, pageSize, categoryTag
   - Filters: status=ACTIVE, riskLevel≠CRITICAL
   - Sorting: rankingScore DESC
   - Returns: MarketplaceResponse with pagination
   - Logs: AI_MARKETPLACE_VIEWED event

2. **`getMyAIAvatars`** - Owner analytics
   - Returns owner's avatars with full stats
   - Sorted by tokensEarned7d DESC
   - Includes 7d and 30d metrics
   - No query parameters needed

3. **`trackAIAvatarView`** - Log card view
   - Input: avatarId
   - Logs: AI_AVATAR_CARD_VIEWED event
   - Used for tracking impressions

4. **`trackAIAvatarDetailOpened`** - Log detail view
   - Input: avatarId
   - Logs: AI_AVATAR_DETAIL_OPENED event
   - Used before opening profile

5. **`rebuildAvatarIndexManual`** - Manual rebuild trigger
   - Input: avatarId
   - Requires: owner or moderator
   - Useful for testing or urgent updates

### 3.3 Scheduled Jobs

**Daily Ranking Update:**
```typescript
cronRecomputeAIMarketplaceRankingDaily()
Schedule: 0 2 * * * (daily at 2 AM UTC)
Memory: 512MiB
Timeout: 9 minutes
Action: Rebuild all active avatar indexes
```

**Hourly Top Avatars Update:**
```typescript
cronUpdateTopAvatarsHourly()
Schedule: 0 * * * * (every hour)
Memory: 256MiB
Timeout: 5 minutes
Action: Update top 100 avatars only
```

---

## 4. Frontend Implementation

### 4.1 TypeScript Types

**File:** [`app-mobile/types/aiMarketplace.ts`](app-mobile/types/aiMarketplace.ts:1)

Includes:
- AIAvatarIndex (full index document)
- AIMarketplaceItem (discovery card)
- AIMarketplaceResponse (API response)
- OwnerAIAvatarsResponse (owner analytics)
- MarketplaceQueryParams (API query)
- MarketplaceEventType (analytics events)

### 4.2 UI Components

**File:** [`app-mobile/app/components/AIMarketplaceCard.tsx`](app-mobile/app/components/AIMarketplaceCard.tsx:1)

**Features:**
- Avatar photo with overlay badges
- AI badge (🤖 AI)
- Trust badge (✓ Verified/Trusted/New)
- Ranking score (⭐ 0-100)
- Display name and tagline
- Languages and country
- Tap to open avatar profile
- onView callback for tracking

**Visual Design:**
- Dark theme (#1f2937 cards)
- Trust badge color-coded (green/yellow/gray)
- Score badge with star icon
- Language chips
- Country flag emoji

### 4.3 Marketplace Screen

**File:** [`app-mobile/app/ai-companions/marketplace.tsx`](app-mobile/app/ai-companions/marketplace.tsx:1)

**Features:**
- Pull-to-refresh
- Language filter (EN, PL)
- Category filter (romantic, chatty, coach, intellectual)
- Pagination (previous/next)
- Empty state with "Clear Filters"
- Card grid with marketplace cards
- Automatic view tracking
- Loading states

**Layout:**
- Header with title and subtitle
- Filter chips (horizontal scrollable)
- Card list (vertical scrollable)
- Pagination controls at bottom

### 4.4 Owner Analytics Screen

**File:** [`app-mobile/app/profile/ai-avatars/analytics.tsx`](app-mobile/app/profile/ai-avatars/analytics.tsx:1)

**Features:**
- Summary stats cards (total tokens, sessions, views)
- Per-avatar cards with:
  - Status badge (Active/Paused/Banned)
  - 7-day stats (views/chats/tokens)
  - 30-day stats (views/chats/tokens)
  - Retention score (percentage)
  - Edit and View buttons
- Empty state with "Create Your First AI"
- Pull-to-refresh

**Visual Design:**
- Summary cards at top (3 columns)
- Avatar cards with dark background
- Stats grid layout
- Retention highlighted in green
- Action buttons at bottom of each card

---

## 5. Firestore Security

### 5.1 Security Rules

**File:** [`firestore-pack311-ai-marketplace.rules`](firestore-pack311-ai-marketplace.rules:1)

**Key Rules:**

```javascript
// AI Avatar Index - read-only for clients
match /aiAvatarIndex/{avatarId} {
  // Anyone can read ACTIVE, non-CRITICAL avatars
  allow read: if isAuthenticated() && 
    (resource.data.status == 'ACTIVE' && 
     resource.data.trust.riskLevel != 'CRITICAL') ||
    isOwner(resource.data.ownerId) ||
    isModerator();
  
  // Only Cloud Functions can write
  allow write: if false;
}

// Analytics events - users can create, moderators can read
match /analytics_events/{eventId} {
  allow create: if isAuthenticated() &&
    request.resource.data.userId == request.auth.uid;
  allow read: if isModerator();
  allow update, delete: if false;
}
```

### 5.2 Composite Indexes

**File:** [`firestore-pack311-ai-marketplace.indexes.json`](firestore-pack311-ai-marketplace.indexes.json:1)

**Required Indexes:**

1. `status + rankingScore DESC` - Main marketplace listing
2. `status + trust.riskLevel + rankingScore DESC` - Safety-filtered listing
3. `languages (array) + status + rankingScore DESC` - Language filter
4. `country + status + rankingScore DESC` - Country filter
5. `ownerId + status + stats.tokensEarned7d DESC` - Owner's avatars
6. `categoryTags (array) + status + rankingScore DESC` - Category filter
7. `trust.ownerVerified + status + rankingScore DESC` - Verified-only filter
8. `eventType + createdAt DESC` - Analytics events by type
9. `avatarId + eventType + createdAt DESC` - Events for specific avatar

---

## 6. Analytics & Events

### 6.1 Marketplace Events

Logged to `analytics_events` collection:

- **`AI_MARKETPLACE_VIEWED`** - User opens marketplace
  - Metadata: filters, page, resultsCount

- **`AI_AVATAR_CARD_VIEWED`** - User sees avatar card
  - Used for: view count tracking

- **`AI_AVATAR_DETAIL_OPENED`** - User opens avatar profile
  - Logged before navigation

- **`AI_AVATAR_CHAT_STARTED`** - User starts chat
  - Already defined in PACK 310, reused here

### 6.2 Analytics Aggregation

**Process:**
1. Cron job triggers (daily or hourly)
2. For each avatar:
   - Query analytics_events for views/starts
   - Query aiSessions for earnings
   - Calculate unique/returning users
   - Compute retention score
3. Update aiAvatarIndex.stats
4. Recalculate rankingScore
5. Update lastRankingUpdatedAt

**Retention Score:**
```
retentionScore = returningUsers7d / uniqueUsers7d

where:
  uniqueUsers7d = count of distinct users who started chat
  returningUsers7d = count of users who started 2+ chats
```

---

## 7. Discovery Surfaces

### 7.1 Global Marketplace

**Route:** `/ai-companions/marketplace`

**Access:** All authenticated users

**Features:**
- Browse all ACTIVE, non-CRITICAL avatars
- Filter by language, country, category
- Sorted by ranking score (highest first)
- Paginated (20 per page)
- Pull-to-refresh

**Entry Points:**
- Discover/Explore tab → "AI Companions" section
- Direct link from main navigation

### 7.2 Creator Profile

**Route:** `/profile/[userId]` → AI Companions Tab

**Access:** All authenticated users

**Features:**
- View creator's AI avatars
- Only shows ACTIVE avatars
- Card grid layout
- Tap to open avatar profile
- Displayed alongside creator's human content

**Visibility:**
- Tab appears only if creator has ≥1 ACTIVE avatar
- Hidden if no active avatars

### 7.3 Owner Analytics

**Route:** `/profile/ai-avatars/analytics`

**Access:** Avatar owners only

**Features:**
- View own avatars (all statuses)
- See detailed performance metrics
- 7-day and 30-day comparison
- Retention score
- Edit and manage avatars

**Entry Points:**
- Creator Dashboard → "AI Companions" section
- Profile → Settings → "My AI Avatars"

---

## 8. Safety & Visibility Constraints

### 8.1 Exclusion Rules

Avatars are excluded from marketplace if:

1. **Status not ACTIVE:**
   - DRAFT → not yet ready
   - PAUSED → owner disabled
   - BANNED → moderation action

2. **Owner verification:**
   - Not 18+ verified
   - Account suspended/banned

3. **Risk level:**
   - CRITICAL → completely hidden
   - HIGH → hidden from global (visible on profile only)

### 8.2 Visibility Matrix

| Condition | Global Marketplace | Creator Profile | Owner Analytics |
|-----------|-------------------|-----------------|-----------------|
| ACTIVE + LOW risk + verified | ✅ Visible | ✅ Visible | ✅ Visible |
| ACTIVE + MEDIUM risk + verified | ✅ Visible | ✅ Visible | ✅ Visible |
| ACTIVE + HIGH risk + verified | ❌ Hidden | ✅ Visible | ✅ Visible |
| ACTIVE + CRITICAL risk | ❌ Hidden | ❌ Hidden | ⚠️ Visible (status shown) |
| PAUSED | ❌ Hidden | ❌ Hidden | ✅ Visible |
| BANNED | ❌ Hidden | ❌ Hidden | ✅ Visible (status shown) |
| Owner not verified | ❌ Hidden | ❌ Hidden | ✅ Visible (warning) |

### 8.3 Moderation Controls

**Moderator Actions:**
- View all avatars regardless of filters
- Access full moderation queue
- Ban avatars (sets status=BANNED)
- Review trust scores
- Access system logs

**Automatic Actions:**
- High-risk avatars excluded from global
- Critical-risk avatars hidden everywhere
- Unverified owners can't have active avatars

---

## 9. No Tokenomics Changes

This pack **MUST NOT** modify:

✅ Token packages or prices  
✅ Payout rate (0.20 PLN/token)  
✅ Revenue splits (65/35 for AI chats)  
✅ Chat pricing or free messages  
✅ Refund rules  
✅ Calendar/event pricing  
✅ Voice/video call pricing  

**What it DOES:**
- Adds discovery surfaces
- Implements ranking algorithms
- Provides owner analytics
- Tracks marketplace events
- No economic impact on existing systems

---

## 10. Implementation Checklist

### Backend
- [x] TypeScript types for marketplace
- [x] Ranking score calculation function
- [x] Analytics aggregation logic
- [x] Trust level determination
- [x] Category tag derivation
- [x] Index rebuild functions
- [x] API endpoints (marketplace, owner analytics, tracking)
- [x] Scheduled cron jobs (daily + hourly)
- [x] Firestore security rules
- [x] Composite indexes

### Frontend
- [x] TypeScript types for mobile
- [x] AI Marketplace Card component
- [x] Marketplace screen with filters
- [x] Owner analytics screen
- [x] View tracking integration
- [x] Pagination controls
- [x] Empty states and loading states

### Safety
- [x] Verification status checks
- [x] Risk level integration
- [x] Status-based visibility
- [x] Moderator access controls
- [x] Owner authentication

### Analytics
- [x] Marketplace view events
- [x] Card view tracking
- [x] Detail open tracking
- [x] Chat start events (reused from PACK 310)
- [x] Event aggregation logic
- [x] Retention score calculation

### Documentation
- [x] Implementation summary
- [x] Data model documentation
- [x] Ranking algorithm explanation
- [x] API endpoint documentation
- [x] Security rules documentation
- [x] Deployment guide

---

## 11. Deployment

### Step 1: Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Wait for index creation (may take 10-30 minutes for large datasets).

### Step 2: Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

Deployed functions:
- `getAIMarketplace`
- `getMyAIAvatars`
- `trackAIAvatarView`
- `trackAIAvatarDetailOpened`
- `rebuildAvatarIndexManual`
- `cronRecomputeAIMarketplaceRankingDaily`
- `cronUpdateTopAvatarsHourly`

### Step 3: Initial Index Build

```bash
# Trigger manual rebuild for all avatars
firebase functions:call rebuildAvatarIndexManual --data '{"avatarId": "test"}'

# Or wait for first daily cron (2 AM UTC)
```

### Step 4: Deploy Mobile App

```bash
cd app-mobile
npm install
eas build --platform all
eas submit --platform all
```

### Step 5: Verify

Check:
- [ ] aiAvatarIndex collection populated
- [ ] Marketplace API returns data
- [ ] Owner analytics API works
- [ ] View tracking logs events
- [ ] Cron jobs scheduled in Firebase Console

---

## 12. Monitoring

### Key Metrics

**Performance:**
- Index build time (daily cron)
- API response times
- Query performance with filters
- Pagination speed

**Usage:**
- Marketplace views per day
- Avatar card views
- Detail page opens
- Conversion rate (view → chat)

**Quality:**
- Ranking score distribution
- Top 10 avatars by score
- Average retention score
- Filter usage patterns

**Errors:**
- Cron job failures
- Index rebuild errors
- API error rates
- Missing trust data

### Alerts

Set up monitoring for:
- Daily cron job failures
- API error rate >5%
- Index build time >10 minutes
- Missing required indexes

---

## 13. Testing Checklist

### Discovery Tests
- [ ] Marketplace loads with valid data
- [ ] Language filter works correctly
- [ ] Category filter works correctly
- [ ] Country filter works correctly
- [ ] Pagination forward/backward
- [ ] Empty state shows when no results
- [ ] Pull-to-refresh updates data
- [ ] View tracking logs events

### Ranking Tests
- [ ] New avatars get ranked correctly
- [ ] High-trust avatars ranked higher
- [ ] High-risk avatars penalized
- [ ] Retention score affects ranking
- [ ] Earnings affect ranking appropriately
- [ ] Score normalized to 0-100 range

### Owner Analytics Tests
- [ ] Owner can see own avatars
- [ ] 7-day stats accurate
- [ ] 30-day stats accurate
- [ ] Retention score calculated correctly
- [ ] Status badges display correctly
- [ ] Edit/View buttons work

### Safety Tests
- [ ] CRITICAL risk avatars excluded from marketplace
- [ ] HIGH risk avatars excluded from global (visible on profile)
- [ ] Unverified owners excluded
- [ ] PAUSED avatars hidden from discovery
- [ ] BANNED avatars hidden from discovery
- [ ] Moderators can see all avatars

### Cron Tests
- [ ] Daily cron updates all avatars
- [ ] Hourly cron updates top 100
- [ ] Errors logged to system_logs
- [ ] Execution time within limits
- [ ] Index updates reflect in queries

---

## 14. Future Enhancements

Potential additions for future releases:

1. **Advanced Filters:**
   - Age range filter
   - Vibe/personality filter
   - Topic/interest filter
   - Sort by: newest, most popular, highest rated

2. **Featured Avatars:**
   - Editor's picks section
   - Trending avatars carousel
   - New arrivals section
   - Rising stars (fast-growing)

3. **Recommendations:**
   - Personalized suggestions based on chat history
   - "Similar avatars" on profile page
   - "Users also chatted with" section

4. **Leaderboards:**
   - Top earners (monthly/all-time)
   - Most popular (by sessions)
   - Highest retention scores
   - Creator rankings

5. **Enhanced Analytics:**
   - User demographics breakdown
   - Peak activity hours
   - Popular conversation topics
   - Revenue forecasts
   - Comparative analytics (vs. category average)

6. **Social Features:**
   - Like/favorite avatars
   - Share avatar profiles
   - Follow favorite creators
   - Notifications for new avatars from followed creators

---

## 15. Conclusion

✅ **PACK 311 is fully implemented and ready for deployment.**

The AI Companions Marketplace adds:
- **For users:** Easy discovery of AI companions
- **For creators:** Performance insights and transparency
- **For Avalo:** Increased engagement and content quality

All features respect:
- Existing tokenomics (no changes)
- Safety standards (verification, risk levels)
- User privacy (analytics aggregated)
- Platform integrity (moderation controls)

The ranking algorithm balances:
- Performance metrics (views, starts, earnings)
- User satisfaction (retention score)
- Creator reputation (trust level)
- Safety concerns (risk penalties)

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-10  
**Maintained By:** Kilo Code  
**Dependencies:** PACK 268, 295, 299, 301, 303, 306, 307, 308, 310