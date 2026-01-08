# PACK 161 — Avalo Smart Social Graph 2.0 Implementation Guide

**Interest-Driven Discovery Without Matchmaking Bias**

## 🎯 Overview

PACK 161 implements a revolutionary discovery engine that focuses on **content relevance, skills, and interests** rather than attractiveness, popularity, or dating potential. This is a fundamental shift from traditional social platforms.

### Core Principles

✅ **What This IS:**
- Professional networking based on skills
- Lifestyle content discovery
- Creative and entertainment exploration
- Learning and education matching
- Local event discovery

❌ **What This IS NOT:**
- Dating or matchmaking
- Appearance-based ranking
- Popularity contests
- Token-influenced visibility
- Romance-driven recommendations

---

## 📋 Non-Negotiable Rules

1. **NO attractiveness scores** — Appearance is never factored into rankings
2. **NO photo-based ranking** — Profile photos don't influence discovery
3. **NO "people you might be attracted to"** — Zero romantic suggestions
4. **NO token spending influence** — Spending cannot boost visibility
5. **NO popularity override** — Quality and safety matter more than follower counts

---

## 🏗️ Architecture

### Backend Components

```
functions/src/smartSocialGraph/
├── types/                           # TypeScript definitions
│   └── smartSocialGraph.types.ts   # All type definitions
├── relevanceRanking.ts              # Core ranking algorithm
├── shadowDensityControl.ts          # Mega-creator prevention
├── antiFlirtManipulation.ts         # Safety enforcement
├── discoveryFeedService.ts          # Feed generation
├── backgroundJobs.ts                # Scheduled maintenance
└── index.ts                         # Cloud Functions exports
```

### Frontend Components

```
app-mobile/app/discovery/
└── smart-feed.tsx                   # Main discovery screen
```

### Database Collections

```
Firestore Collections:
├── interest_vectors                 # User behavior tracking
├── creator_relevance_scores         # Creator rankings
├── discovery_rankings              # Computed scores
├── shadow_density_counters         # Impression tracking
├── user_discovery_preferences      # Mode selection
├── flirt_manipulation_flags        # Safety violations
├── discovery_scores                # Relevance calculations
├── discovery_refresh_jobs          # Background job status
├── safety_compliance_jobs          # Safety scan results
└── fairness_diversity_audits       # System audits
```

---

## 🎨 Discovery Categories

### Primary Pillars

| Category | Examples | Use Cases |
|----------|----------|-----------|
| **Skills** | Cooking, coding, fitness, photography | Learning, mentorship |
| **Lifestyle** | Travel, wellness, diet, fashion | Inspiration, tips |
| **Business** | Marketing, entrepreneurship | Professional growth |
| **Creative** | Art, dance, music, crafts | Creative exploration |
| **Entertainment** | Gaming, humor, vlogs | Leisure, fun |
| **Local Events** | Workshops, meetups | Community |
| **Digital Products** | Ebooks, courses, presets | Learning resources |

### Forbidden Categories

❌ These will NEVER exist:
- "Hot singles near you"
- "Meet girls/guys from your city"
- NSFW roleplay categories
- Escorting/sugar-dating disguised as coaching

---

## 🔢 Relevance Ranking Algorithm

### Ranking Factors (Zero Appearance Bias)

```typescript
const RANKING_WEIGHTS = {
  topical: 0.35,      // Interest/skill match
  language: 0.15,     // Language compatibility
  region: 0.10,       // Geographic relevance
  recency: 0.15,      // Recent activity
  retention: 0.15,    // Content quality
  safety: 0.10,       // Good behavior
  density: -0.10,     // Penalty for over-exposure
};
```

### What DOES NOT Affect Ranking

- Physical attractiveness
- Profile photo quality
- Body type or appearance
- Token spending
- Romantic success metrics
- Popularity or follower count (except as quality signal)

### What DOES Affect Ranking

- **Topical Match** (35%): How well content aligns with viewer interests
- **Language Alignment** (15%): Content language matches viewer preference
- **Regional Relevance** (10%): Geographic proximity (broad regions, not GPS)
- **Content Freshness** (15%): Recent activity signals
- **Retention Quality** (15%): How engaging content is (watch time, not looks)
- **Safety Score** (10%): Good track record, no violations
- **Density Penalty** (-10%): Reduces mega-creator dominance

---

## 🛡️ Shadow Density Prevention

Prevents mega-creators from dominating discovery feeds.

### Rules

1. **Rotation Limit**: Creators with >2M impressions/week enter rotation limits
2. **Guaranteed Slots**: New/mid-size creators get 3 guaranteed slots per feed page
3. **Regional Priority**: Local creators get 20% boost in regional feeds
4. **Fair Distribution**: 70% regular creators, 30% mega creators

### Implementation

```typescript
// Track impressions
await recordCreatorImpression(creatorId, viewerId, 'FEED');

// Check if in rotation limit
const inLimit = await isCreatorInRotationLimit(creatorId);

// Apply diversity rules
const diversified = await applyDiversityRules(candidates);
```

---

## 🚫 Anti-Flirt Manipulation Detection

Automatically detects and demotes content trying to game discovery through seductive tactics.

### Detection Signals

1. **Seductive Thumbnails**: Cleavage, lingerie, provocative angles
2. **Suggestive Clothing Angles**: Body-emphasis camera work
3. **Clickbait Flirt Captions**: "Click if you're lonely", "DM me if you want..."
4. **Parasocial Flirt Hooks**: "I'll be your virtual girlfriend", "We're in this together"

### Actions Taken

| Confidence | Action |
|------------|--------|
| >75% | Content demoted + Safety case opened |
| 50-75% | Content demoted only |
| 25-50% | Flagged for manual review |

### Implementation

```typescript
// Scan content for violations
const flags = await detectFlirtManipulation(contentId, creatorId, {
  caption: "Your caption here",
  title: "Title",
  thumbnailUrl: "https://...",
});

// Automatic action based on confidence
if (flags.contentDemoted) {
  // Creator's safety score reduced
  // Content hidden from discovery
}
```

---

## 🎭 Multi-Persona Personalization

Users control their discovery experience through 5 modes.

### Discovery Modes

| Mode | Icon | Description | Categories |
|------|------|-------------|------------|
| **Professional** | 💼 | Business & skills | Skills, Business, Digital Products |
| **Social Lifestyle** | 🌟 | Lifestyle content | Lifestyle, Local Events, Entertainment |
| **Entertainment** | 🎮 | Fun & creative | Entertainment, Creative |
| **Learning** | 📚 | Education | Skills, Digital Products, Business |
| **Local Events** | 📍 | Community | Local Events, Lifestyle, Skills |

### Forbidden Modes

❌ These modes DO NOT and WILL NOT exist:
- Romantic Mode
- Erotic Mode
- Meet People Mode
- Dating Mode
- Singles Mode

### Switching Modes

```typescript
// User switches mode
await updateDiscoveryMode(userId, 'PROFESSIONAL');

// System validates (rejects forbidden modes)
const validModes = ['PROFESSIONAL', 'SOCIAL_LIFESTYLE', 'ENTERTAINMENT', 'LEARNING', 'LOCAL_EVENTS'];
if (!validModes.includes(mode)) {
  throw new Error('Forbidden mode detected');
}
```

---

## 🔄 Background Jobs

### Daily Discovery Refresh (02:00 UTC)

```typescript
export const dailyDiscoveryRefresh = functions.pubsub
  .schedule('0 2 * * *')
  .onRun(async () => {
    // Refresh all creator relevance scores
    // ~50 creators per batch
    // Updates: topical match, retention quality, safety scores
  });
```

### Safety Compliance Scan (Every 6 hours)

```typescript
export const safetyComplianceScan = functions.pubsub
  .schedule('0 */6 * * *')
  .onRun(async () => {
    // Scan last 6 hours of content
    // Detect flirt manipulation
    // Auto-demote violations
  });
```

### Fairness & Diversity Audit (Daily 03:00 UTC)

```typescript
export const fairnessDiversityAudit = functions.pubsub
  .schedule('0 3 * * *')
  .onRun(async () => {
    // Check category distribution
    // Verify new creator visibility (should be >20%)
    // Monitor token spending correlation (should be ~0)
    // Audit regional balance
    // Grant guaranteed slots if needed
  });
```

---

## 🔌 API Reference

### Client Functions

#### Get Discovery Feed

```typescript
const getSmartDiscoveryFeed = httpsCallable<SmartSocialGraphRequest, SmartSocialGraphResponse>(
  functions,
  'getSmartDiscoveryFeed'
);

const response = await getSmartDiscoveryFeed({
  userId: 'user123',
  mode: 'PROFESSIONAL',
  category: 'SKILLS', // Optional
  cursor: undefined,  // For pagination
  limit: 20,
});

// Response
{
  items: CreatorCard[],
  cursor?: string,
  hasMore: boolean,
  explanation: string,  // Why these recommendations
  diversityAchieved: boolean,
}
```

#### Switch Discovery Mode

```typescript
const switchDiscoveryMode = httpsCallable(functions, 'switchDiscoveryMode');

await switchDiscoveryMode({ mode: 'LEARNING' });
```

#### Track Content View

```typescript
const trackContentView = httpsCallable(functions, 'trackContentView');

await trackContentView({
  category: 'SKILLS',
  sessionDurationSec: 120,
  completed: true,
});
```

#### Get Topic Recommendations

```typescript
const getTopicBasedRecommendations = httpsCallable(
  functions,
  'getTopicBasedRecommendations'
);

const result = await getTopicBasedRecommendations({
  topic: 'React',
  limit: 10,
});
```

#### Get Follow Recommendations

```typescript
const getEthicalFollowRecommendations = httpsCallable(
  functions,
  'getEthicalFollowRecommendations'
);

const result = await getEthicalFollowRecommendations({ limit: 10 });
```

---

## 🔒 Security Rules

### Interest Vectors

- Users can READ own vector
- Only system can WRITE (prevents manipulation)
- Admins can READ for analytics

### Creator Relevance Scores

- Everyone can READ (for discovery)
- Only system can WRITE (prevents ranking manipulation)
- Creators can READ own score

### User Discovery Preferences

- Users can READ and UPDATE own preferences
- System validates: NO forbidden modes allowed
- Prevents romantic/erotic mode creation

### Flirt Manipulation Flags

- Creators can READ flags on own content
- Only moderators can CREATE/UPDATE
- Admins can LIST for auditing

---

## 📊 Monitoring & Analytics

### Key Metrics to Track

1. **Fairness**
   - Token spending correlation (must be ~0)
   - New creator visibility (target >20%)
   - Regional balance (target >50/100)

2. **Diversity**
   - Category distribution
   - Mega-creator dominance (target <10%)
   - Guaranteed slot utilization

3. **Safety**
   - Flirt manipulation detection rate
   - Content demotion actions
   - Safety case resolution time

4. **Quality**
   - Average retention rate
   - Content freshness score
   - User session duration

### Admin Dashboard Queries

```typescript
// Get shadow density stats
const stats = await getShadowDensityStats_Admin();
console.log('Creators in rotation limit:', stats.creatorsInRotationLimit);
console.log('Average weekly impressions:', stats.avgWeeklyImpressions);

// View fairness audit
const audit = await db. collection('fairness_diversity_audits')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();
```

---

## 🚀 Deployment Checklist

### Backend Deployment

- [ ] Deploy Cloud Functions
  ```bash
  cd functions
  npm run build
  firebase deploy --only functions:getSmartDiscoveryFeed
  firebase deploy --only functions:switchDiscoveryMode
  firebase deploy --only functions:trackContentView
  firebase deploy --only functions:dailyDiscoveryRefresh
  firebase deploy --only functions:safetyComplianceScan
  firebase deploy --only functions:fairnessDiversityAudit
  ```

- [ ] Deploy Firestore Rules
  ```bash
  firebase deploy --only firestore:rules
  ```

- [ ] Create Indexes
  ```bash
  firebase deploy --only firestore:indexes
  ```

### Frontend Deployment

- [ ] Build mobile app
  ```bash
  cd app-mobile
  npx expo build:android
  npx expo build:ios
  ```

- [ ] Test discovery feed screen
- [ ] Test mode switching
- [ ] Verify no forbidden modes appear

### Verification

- [ ] Run fairness audit manually
- [ ] Check token spending correlation = 0
- [ ] Verify no attractiveness scores in database
- [ ] Test flirt detection on sample content
- [ ] Confirm shadow density limits work

---

## ⚠️ Critical Constraints

### What NEVER Changes

1. **Token Economics**: No changes to token prices
2. **Revenue Split**: 65% creator / 35% Avalo (unchanged)
3. **No Free Tokens**: No discounts, cashback, or promo codes
4. **No Pay-to-Rank**: Spending cannot boost visibility
5. **Safety First**: Risky accounts have lower/zero visibility

### Forbidden Features

These must NEVER be implemented:
- Attractiveness scoring algorithms
- Photo beauty analysis
- "Hot or Not" mechanics
- Dating/matchmaking features
- Romance-based recommendations
- Flirt-driven engagement
- Token-boosted visibility

---

## 🔧 Troubleshooting

### Issue: Creators not appearing in feed

**Causes:**
1. Creator in rotation limit (>2M impressions/week)
2. Low safety score (<50)
3. Content flagged for flirt manipulation
4. Not in viewer's interest categories

**Solutions:**
```typescript
// Check creator score
const score = await db.collection('creator_relevance_scores').doc(creatorId).get();
console.log('Safety:', score.data().safetyScore);
console.log('Category:', score.data().primaryCategory);

// Check shadow density
const counter = await db.collection('shadow_density_counters').doc(creatorId).get();
console.log('Weekly impressions:', counter.data().weeklyImpressions);
console.log('In rotation limit:', counter.data().isInRotationLimit);
```

### Issue: Flirt content not being demoted

**Causes:**
1. Detection confidence too low (<50%)
2. Content hasn't been scanned yet
3. Detection patterns need updating

**Solutions:**
```typescript
// Manually scan content
await detectFlirtManipulation(contentId, creatorId, { caption, title, thumbnailUrl });

// Check scan results
const flags = await db.collection('flirt_manipulation_flags').doc(contentId).get();
console.log('Confidence:', flags.data().confidence);
console.log('Detected:', flags.data());
```

### Issue: Fairness audit failing

**Causes:**
1. Token spending correlation detected
2. Mega-creator dominance too high
3. New creator visibility too low

**Solutions:**
```typescript
// Review latest audit
const audit = await db.collection('fairness_diversity_audits')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();

console.log('Passed:', audit.docs[0].data().passed);
console.log('Issues:', audit.docs[0].data().issues);
console.log('Recommendations:', audit.docs[0].data().recommendations);

// Take action based on recommendations
if (audit.newCreatorVisibility < 20) {
  await grantGuaranteedSlotsToNewCreators();
}
```

---

## 📚 Additional Resources

### Related Packs

- **PACK 85**: Trust & Risk Engine (safety scores)
- **PACK 87**: Enforcement Engine (account restrictions)
- **PACK 91**: Regional Policy Engine (content rating)
- **PACK 94**: Discovery Engine v2 (legacy system)
- **PACK 153**: Safety Framework (case management)

### Code Files

```
Backend:
├── functions/src/types/smartSocialGraph.types.ts
├── functions/src/smartSocialGraph/relevanceRanking.ts
├── functions/src/smartSocialGraph/shadowDensityControl.ts
├── functions/src/smartSocialGraph/antiFlirtManipulation.ts
├── functions/src/smartSocialGraph/discoveryFeedService.ts
├── functions/src/smartSocialGraph/backgroundJobs.ts
└── functions/src/smartSocialGraph/index.ts

Frontend:
└── app-mobile/app/discovery/smart-feed.tsx

Security:
└── firestore-pack161-smart-social-graph.rules
```

---

## ✅ Success Criteria

PACK 161 is successfully implemented when:

1. ✅ Discovery feed shows creators based on interests, NOT appearance
2. ✅ No forbidden modes (romantic/erotic) exist in system
3. ✅ Token spending has ZERO correlation with visibility (r ≈ 0)
4. ✅ Flirt manipulation automatically detected and demoted
5. ✅ Shadow density prevents mega-creator dominance
6. ✅ New creators get fair visibility (>20% of impressions)
7. ✅ Fairness audits pass consistently
8. ✅ No attractiveness scores exist in any database collection
9. ✅ Multi-mode personalization works smoothly
10. ✅ Background jobs run without errors

---

## 🎉 Conclusion

PACK 161 represents a fundamental shift in how social discovery works. By eliminating appearance bias and focusing on genuine interests, skills, and content quality, Avalo creates a healthier, more equitable platform that prioritizes user well-being over engagement manipulation.

**Remember**: This is NOT dating. This is NOT matchmaking. This is interest-driven professional and social discovery.

---

**Implementation Status**: ✅ COMPLETE  
**Version**: 1.0.0  
**Last Updated**: 2025-11-29  
**Maintainer**: Avalo Engineering Team