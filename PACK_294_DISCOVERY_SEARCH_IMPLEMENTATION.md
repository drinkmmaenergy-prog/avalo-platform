# PACK 294 - Search & Discovery Filters Implementation

## Overview

PACK 294 implements a comprehensive Search & Discovery system for Avalo that allows users to freely browse profiles with advanced filtering capabilities. This system is fully aligned with Avalo's dating-focused, safety-first approach and maintains 100% free access for all users.

## Key Features

### ✅ Comprehensive Filtering
- **Age Range**: 18-99 (strictly enforced, no minors)
- **Distance**: 10km to 500km radius or global
- **Gender & Orientation**: Men, Women, Non-binary, or All
- **Looking For**: Preference-based matching
- **Interests**: Multi-select from curated list (no politics/religion)
- **Languages**: Multi-language support
- **Verification**: Filter for verified users only
- **Media**: Filter by profile photo or video intro
- **Status**: Influencer or Royal member filters

### ✅ Smart Ranking Algorithm
```
score = (distance * 0.25) + (activity * 0.30) + (popularity * 0.20) + 
        (matchIntent * 0.15) + (tierBoost * 0.05) - (risk * 0.05)
```

**Fairness Boost**: Low-popularity profiles (<30 score) get +20 bonus points
**Tier Bonuses**:
- Royal members: +30 points
- VIP members: +20 points
- Influencers: +15 points

### ✅ Safety Enforcement
- **Age verification**: All profiles must be 18+
- **Banned users**: Excluded from all searches
- **Shadow-banned**: Excluded from discovery
- **High-risk profiles**: Downranked or excluded (threshold: 80)
- **Incognito mode**: Completely excluded from discovery
- **Content filtering**: No political/religious topics

### ✅ Free Access
- Discovery is 100% free for all users
- Likes from Discovery are free
- Profile visits are free
- No subscription required
- Chat follows standard monetization (100 tokens base cost)

## Architecture

### Backend Components

#### 1. Profile Search Index (`profileSearchIndex` collection)
Denormalized collection optimized for fast search queries:

```typescript
{
  userId: string;
  displayName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'NONBINARY';
  orientation: 'HETERO' | 'HOMO' | 'BI' | 'OTHER';
  bio: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  lookingFor: string[];
  minPreferredAge: number;
  maxPreferredAge: number;
  languages: string[];
  interests: string[];
  isVerified: boolean;
  hasProfilePhoto: boolean;
  hasVideoIntro: boolean;
  incognito: boolean;
  earnOn: boolean;
  influencerBadge: boolean;
  royalBadge: boolean;
  vipBadge: boolean;
  popularityScore: number;
  recentActivityScore: number;
  lastActiveAt: string;
  riskScore: number;
  banned: boolean;
  shadowBanned: boolean;
  updatedAt: string;
}
```

#### 2. Sync Functions
Auto-sync index when user data changes:
- `syncProfileSearchIndex`: User profile updates
- `syncLocationChange`: Location updates
- `syncVerificationChange`: Verification status changes
- `syncRiskScoreChange`: Risk score updates

#### 3. Search Endpoints

**Discovery Search** (`/discovery/search`)
```
GET /discovery/search?ageMin=18&ageMax=99&distanceKmMax=100&...
```

Query Parameters:
- `ageMin`, `ageMax`: Age range (default: 18-99)
- `distanceKmMax`: Max distance in km (default: 100)
- `gender`: MALE | FEMALE | NONBINARY | ANY
- `lookingFor`: MEN | WOMEN | NONBINARY | ANY
- `viewerLat`, `viewerLng`: Viewer location coordinates
- `interests`: Comma-separated interests
- `languages`: Comma-separated language codes
- `hasProfilePhoto`: boolean
- `hasVideoIntro`: boolean
- `isVerifiedOnly`: boolean
- `minPopularityScore`: number (0-100)
- `influencerOnly`: boolean
- `royalOnly`: boolean
- `cursor`: Pagination cursor
- `limit`: Results per page (default: 20, max: 50)

**Profile Search** (`/search/profiles`)
```
GET /search/profiles?query=name&limit=20
```

Query Parameters:
- `query`: Search term (min 2 characters)
- `limit`: Max results (default: 20, max: 50)

#### 4. Analytics Functions
- `logDiscoveryProfileView`: Track profile views
- `logDiscoveryProfileLike`: Track likes
- `logDiscoveryOpenChat`: Track chat opens
- `logDiscoveryOpenCalendar`: Track calendar opens
- `aggregateDiscoveryAnalytics`: Daily aggregation for creator insights

### Frontend Components

#### Mobile (React Native)

**Enhanced Discovery Screen** (`app/discovery/index.tsx`)
- Integrated with PACK 294 backend
- Advanced filter modal
- Name search bar
- Nearby/Passport tabs
- Infinite scroll
- Free access banner

**Filter Modal** (`app/discovery/filters.tsx`)
- Age range sliders
- Distance presets
- Gender/orientation selection
- Interest chips
- Language selection
- Verification toggles
- Status filters

**Search Bar** (`app/discovery/search-bar.tsx`)
- Real-time name search
- Autocomplete results
- Profile quick preview
- Direct navigation to profiles

#### Web (Coming Soon)
Similar functionality adapted for web interface with responsive grid layout.

## Database Schema

### Firestore Collections

**profileSearchIndex**
- Purpose: Optimized search index
- Access: Read for authenticated users, write from backend only
- Indexes: See `firestore-pack294-discovery-search.indexes.json`

**discoveryAnalytics**
- Purpose: Track user discovery behavior
- Access: Write from authenticated users, read by user/admin only
- Fields: userId, eventType, profileId, timestamp, filters, resultCount

**searchQueryLog**
- Purpose: AI learning and search optimization
- Access: Admin only
- Fields: queryId, userId, timestamp, filters, resultsCount, clickedProfileIds, sessionDurationSec

### Firestore Rules

```javascript
match /profileSearchIndex/{userId} {
  allow read: if request.auth != null;
  allow write: if false; // Backend only
}

match /discoveryAnalytics/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false; // Backend only
}
```

## Integration

### With Existing Systems

#### PACK 267 (Global Rules)
- Enforces 18+ age requirement
- Respects banned/shadow-banned status
- Honors incognito mode

#### PACK 268 (Risk & Safety Engine)
- Filters high-risk profiles
- Downranks elevated risk profiles
- Excludes blocked users

#### PACK 273/285 (Chat Logic)
- Discovery -> Chat maintains 100 token base cost
- No special pricing for discovery-sourced chats
- Standard monetization applies

#### PACK 274/286 (Calendar & Events)
- Discovery -> Calendar follows 80/20 split
- No changes to calendar economics
- Standard booking flow

#### PACK 292 (Feed/Stories/Reels)
- Popularity signals from engagement metrics
- Activity scores from recent content
- Cross-system popularity calculation

### Passport Integration

When Passport mode is enabled:
1. User sets virtual location in settings
2. Discovery uses virtual coordinates instead of GPS
3. Distance calculations relative to virtual location
4. Backend receives `viewerLat/viewerLng` from virtual location
5. All other filters work identically

Example:
```typescript
// In discovery screen, check for active passport
const useLocation = currentTab === 'passport' && passportLocation?.enabled
  ? { lat: passportLocation.lat, lng: passportLocation.lng }
  : userLocation;
```

## Safety & Policy Compliance

### Age Verification
```typescript
// ALWAYS enforced in backend
.where('age', '>=', DISCOVERY_CONSTANTS.DEFAULT_AGE_MIN) // 18
.where('age', '<=', filters.ageMax)
```

### Content Filtering
Interests are filtered to exclude:
```typescript
const bannedKeywords = [
  'politics', 'political', 'democrat', 'republican',
  'religion', 'religious', 'christian', 'muslim', 'jewish',
  // ... full list in pack294-discovery-sync.ts
];
```

### Risk Management
```typescript
// High-risk profiles excluded
.where('riskScore', '<', DISCOVERY_CONSTANTS.RISK_BLOCK_THRESHOLD) // 80

// Risk penalty in ranking
const riskPenalty = profile.riskScore > 50 ? profile.riskScore / 2 : 0;
```

### Privacy Protection
- Incognito users: Completely excluded from discovery
- Banned users: Excluded from all searches
- Shadow-banned: Excluded but unaware
- Location: Only city/country shown, not exact coordinates

## Monetization

### NO CHANGES to Existing Economics

✅ **What Stays FREE**:
- Discovery access
- Profile browsing
- Likes from Discovery
- Profile visits
- Filter usage

✅ **What Keeps Standard Pricing**:
- Chat: 100 tokens base (unchanged)
- Voice/Video: VIP/Royal discounts only (unchanged)
- Calendar: 80/20 split (unchanged)
- Events: 80/20 split (unchanged)
- Revenue share: 65/35 elsewhere (unchanged)
- Token packages: Standard pricing (unchanged)
- Payout rate: 0.20 PLN/token (unchanged)

### Creator Benefits

Creators can see Discovery analytics in dashboard:
- Profile views from Discovery
- Likes received from Discovery
- Chat opens from Discovery
- Calendar bookings from Discovery
- Conversion rates

## Analytics & AI Learning

### Events Tracked
```typescript
type DiscoveryEvent =
  | 'search_executed'    // When search is performed
  | 'profile_viewed'     // When profile is opened
  | 'profile_like'       // When user likes a profile
  | 'open_chat'          // When chat is opened
  | 'open_calendar';     // When calendar is opened
```

### Aggregation
Daily aggregation creates insights:
- Which filters lead to most engagement
- Which profiles get most views
- Conversion funnel analysis
- A/B testing data for ranking improvements

### Creator Dashboard Integration
```typescript
// Added to creator_analytics_daily
{
  discoveryViews: number;
  discoveryLikes: number;
  discoveryChatOpens: number;
  discoveryCalendarOpens: number;
}
```

## Performance Optimizations

### Indexing Strategy
Multiple composite indexes for common queries:
- Age + Gender + Banned + LastActive
- Age + Verified + Banned + Activity
- Country + Age + Banned + LastActive
- Orientation + Age + Banned + Popularity

### Caching
- Profile search index updated reactively
- Changes propagate via Cloud Functions
- No stale data risk

### Pagination
- Cursor-based pagination
- Fetches 2x limit, filters, then limits
- Smooth infinite scroll

## Testing Checklist

### Backend
- [x] Profile index sync on user update
- [x] Location sync on coordinate change
- [x] Verification sync on status change
- [x] Risk score sync on score update
- [x] Discovery search with all filters
- [x] Name search with prefix matching
- [x] Ranking algorithm correctness
- [x] Safety constraint enforcement
- [x] Pagination cursor logic
- [x] Analytics event logging

### Frontend
- [x] Filter modal all options
- [x] Search bar autocomplete
- [x] Infinite scroll pagination
- [x] Passport mode switching
- [x] Profile navigation
- [x] Free access banner
- [x] Loading states
- [x] Error handling

### Safety
- [x] 18+ age enforcement
- [x] Banned user exclusion
- [x] Shadow-banned exclusion
- [x] Incognito exclusion
- [x] High-risk filtering
- [x] Content keyword filtering
- [x] No politics/religion

### Integration
- [x] Chat flow from Discovery
- [x] Calendar flow from Discovery
- [x] Passport location override
- [x] Analytics to creator dashboard
- [x] Risk score integration
- [x] Verification badge display

## Deployment

### Prerequisites
1. Firebase Functions deployed
2. Firestore indexes created
3. Security rules updated
4. Mobile app updated

### Steps

1. **Deploy Firestore Rules**
```bash
firebase deploy --only firestore:rules
```

2. **Create Firestore Indexes**
```bash
firebase deploy --only firestore:indexes
```

3. **Deploy Cloud Functions**
```bash
cd functions
npm run build
firebase deploy --only functions
```

4. **Verify Sync Functions**
- Create test user
- Update profile
- Check profileSearchIndex

5. **Test Search Endpoints**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://europe-west3-avalo-c8c46.cloudfunctions.net/discoverySearch?ageMin=18&ageMax=99"
```

6. **Deploy Mobile App**
- Update app-mobile
- Build and test
- Deploy to stores

## Monitoring

### Key Metrics
- Search response time (target: <500ms)
- Index sync latency (target: <2s)
- Filter usage distribution
- Search result relevance
- Conversion rates

### Alerts
- Slow search queries (>1s)
- Failed index syncs
- High error rates
- No results rate (>10%)

## Future Enhancements

### Phase 2 (Optional)
- [ ] Full-text search with Algolia/Elasticsearch
- [ ] ML-based ranking optimization
- [ ] Personalized recommendations
- [ ] "Users like you also viewed" suggestions
- [ ] Smart filter presets
- [ ] Saved searches
- [ ] Search history

### Phase 3 (Optional)
- [ ] Voice search
- [ ] Image-based search
- [ ] AR profile preview
- [ ] Video profile previews in grid
- [ ] Live location updates
- [ ] Real-time online status

## Support & Troubleshooting

### Common Issues

**No search results**
- Check user's location permissions
- Verify distance filter isn't too restrictive
- Check if filters are too specific
- Ensure user age is within selected range

**Slow search performance**
- Verify Firestore indexes are created
- Check network latency
- Monitor Function execution time
- Consider caching frequently-used filters

**Profile not appearing**
- Check if user has incognito enabled
- Verify user age is 18+
- Check banned/shadow-banned status
- Ensure profile has required photos

**Sync delays**
- Functions may take 1-2 seconds to trigger
- Check Cloud Function logs
- Verify Firestore triggers are active
- Manual sync available via admin tools

## Conclusion

PACK 294 delivers a comprehensive, safe, and free Search & Discovery system that:
- ✅ Respects all dating safety rules (18+, no minors)
- ✅ Provides powerful filtering without complexity
- ✅ Maintains 100% free access for discovery
- ✅ Integrates seamlessly with existing monetization
- ✅ Tracks analytics for continuous improvement
- ✅ Scales efficiently with smart indexing
- ✅ Protects user privacy and safety

The system is production-ready and aligned with Avalo's core values of safety, freedom, and fairness.