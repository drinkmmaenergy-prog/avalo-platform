# PACK 237 — Breakup Recovery & Restart Path — IMPLEMENTATION COMPLETE

## 🎯 Overview

PACK 237 provides a graceful ending system when couples stop interacting, protecting emotions, reputation, and platform safety while gently re-opening paths to new connections.

**Key Differences from PACK 222:**
- Triggered ONLY by mutual choice or safety incidents (NOT by timeout)
- 3-7 day self-adjusting recovery period based on emotional signals
- Explicit feature blocking during recovery
- Ordered restart path: Discovery → Swipe → Chat → Events
- Clean ending with pre-set closing notes (no open text to prevent harm)

---

## 📦 Implementation Components

### Backend (Cloud Functions)

#### Core Engine
**File:** `functions/src/pack237-breakup-recovery-engine.ts`
- `initiateEndConnection()` - Start clean ending flow with confirmation
- `confirmEndConnection()` - Confirm mutual ending
- `declineEndConnection()` - Decline ending request
- `executeImmediateBreakup()` - Safety override for instant breakup
- `getActiveRecoveryState()` - Get user's current recovery state
- `isFeatureBlocked()` - Check if feature is blocked
- `progressRestartStages()` - Advance recovery stages
- `trackRecoveryActivity()` - Track activity for timeline adjustment
- `getRecoveryFeed()` - Get recovery feed items

#### Helper Functions
**File:** `functions/src/pack237-breakup-recovery-helpers.ts`
- Notification helpers (end connection, stage unlock, completion)
- Analytics helpers (tracking, metrics, completion)
- Monetization helpers (offers, purchases, execution)
- Safety helpers (incidents, resolution, checks)
- Affirmation generator

#### Type Definitions
**File:** `functions/src/pack237-breakup-recovery-types.ts`
- `BreakupRecoveryState` - Core recovery state tracking
- `EndConnectionRequest` - Clean ending request flow
- `EndedConnection` - Archived connection data
- `RecoveryFeedItem` - Feed items for recovery
- `RestartPathOffer` - Monetization offers
- `BreakupSafetyIncident` - Safety incident tracking
- `BreakupRecoveryAnalytics` - Analytics data

#### Scheduled Functions
**File:** `functions/src/pack237-breakup-recovery-scheduled.ts`
- `dailyRecoveryProgression` - Daily stage progression (2 AM UTC)
- `hourlyExpiredRequestsCleanup` - Cleanup expired requests (hourly)
- `dailyCompletedRecoveryCleanup` - Archive old recoveries (3 AM UTC)
- `generateRecoveryFeedItems` - Generate feed items (every 6 hours)

### Frontend (Mobile App)

#### UI Components
**Files:**
- `app-mobile/app/breakup-recovery/end-connection.tsx` - Clean ending screen
- `app-mobile/app/breakup-recovery/recovery-mode.tsx` - Recovery dashboard

#### Type Definitions
**File:** `app-mobile/lib/pack237-types.ts`
- Mobile-friendly type definitions
- Closing note messages
- Recovery stage information

### Database

#### Firestore Rules
**File:** `firestore-pack237-breakup-recovery.rules`
- Protects recovery states (user-only access)
- Validates end connection requests
- Controls ended connections visibility
- Secures recovery feed items
- Manages restart path offers
- Protects safety incidents

#### Firestore Indexes
**File:** `firestore-pack237-breakup-recovery.indexes.json`
- 16 composite indexes for efficient queries
- Optimized for user lookups, status filtering, and time-based queries

---

## 🔄 Flow Diagrams

### Clean Ending Flow

```
User A taps "End Connection"
    ↓
Select Closing Note (3 options)
    ↓
Request sent to User B
    ↓
User B confirms OR declines
    ↓
If confirmed:
    ├─ Chat locks
    ├─ Trophy Cabinet archived
    ├─ Memory Log → view-only
    ├─ Create recovery states for both
    └─ Start recovery period (3-7 days)
```

### Recovery Progression

```
Stage 0: Recovery Mode (Day 0)
├─ All features blocked
├─ AI Companions allowed
├─ Events with friends only
└─ Recovery feed active
    ↓
Stage 1: Discovery Unlocked (Day 3)
├─ Browse profiles
├─ View wishlists
└─ Profile visibility returns
    ↓
Stage 2: Swipe Queue Unlocked (Day 4)
├─ Like profiles
├─ Send interests
└─ Boost offer available
    ↓
Stage 3: Paid Chat Unlocked (Day 5)
├─ Start conversations
├─ Voice/video calls
└─ Profile polish offer available
    ↓
Stage 4: Full Restart (Day 7)
├─ Events & calendar
├─ Meetup scheduling
├─ All features unlocked
└─ Trait matching offer available
```

### Safety Override Flow

```
Safety Incident Detected
    ↓
Severity Assessment
    ↓
High/Critical:
    ├─ Immediate breakup (no confirmation)
    ├─ Permanent block option
    ├─ Account audit queued
    ├─ Forced invisibility (if critical)
    └─ Monitored restart path
    ↓
Recovery State Created
└─ Extended recovery period (7 days)
```

---

## 🔌 API Endpoints

### End Connection

**POST** `/api/breakup-recovery/end-connection`
```json
{
  "connectionId": "string",
  "partnerId": "string",
  "closingNote": "thank_you" | "good_wishes" | "closing_chapter"
}
```

**Response:**
```json
{
  "requestId": "string",
  "requiresConfirmation": true
}
```

### Confirm End Connection

**POST** `/api/breakup-recovery/confirm`
```json
{
  "requestId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "endedConnectionId": "string"
}
```

### Get Recovery State

**GET** `/api/breakup-recovery/state`

**Response:**
```json
{
  "recoveryId": "string",
  "userId": "string",
  "status": "active" | "inactive" | "cooldown",
  "restartStage": 0 | 1 | 2 | 3 | 4,
  "startDate": "timestamp",
  "endDate": "timestamp",
  "expectedDuration": 5,
  "featuresBlocked": {
    "paidChat": true,
    "calls": true,
    "meetups": true,
    "discoveryFeed": false,
    "swipeQueue": true,
    "events": true,
    "calendar": true
  }
}
```

### Get Recovery Feed

**GET** `/api/breakup-recovery/feed?limit=10`

**Response:**
```json
[
  {
    "itemId": "string",
    "type": "affirmation",
    "title": "Take your time",
    "message": "When you're ready, we'll help you find chemistry again.",
    "icon": "🌟"
  }
]
```

### Get Restart Path Offers

**GET** `/api/breakup-recovery/offers`

**Response:**
```json
[
  {
    "offerId": "string",
    "type": "boost_visibility",
    "title": "Boost visibility to restart strong",
    "description": "3x profile visibility for 24 hours",
    "price": 50,
    "availableAt": 2
  }
]
```

### Purchase Offer

**POST** `/api/breakup-recovery/purchase`
```json
{
  "offerId": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

### Report Safety Incident

**POST** `/api/breakup-recovery/safety-incident`
```json
{
  "partnerId": "string",
  "connectionId": "string",
  "type": "harassment" | "stalking" | "abuse" | "under_18" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "description": "string"
}
```

**Response:**
```json
{
  "incidentId": "string",
  "immediateActions": ["immediate_breakup", "permanent_block"]
}
```

---

## 🛡️ Safety Protocols

### Trigger Conditions

| Trigger | Confirmation Required | Recovery Duration | Special Actions |
|---------|----------------------|-------------------|-----------------|
| Mutual End | Yes (both users) | 5 days | None |
| Block | No | 7 days | Permanent block option |
| Safety Incident (High) | No | 7 days | Account audit, monitored restart |
| Safety Incident (Critical) | No | 7 days | Permanent block, forced invisibility |
| Under-18 Involvement | No | N/A | Permanent ban |

### Safety Overrides

1. **Immediate Breakup**: No confirmation needed for safety incidents
2. **Permanent Block**: Cannot be undone, prevents all future contact
3. **Account Audit**: Moderator review triggered automatically
4. **Forced Invisibility**: Profile hidden for 30 days
5. **Monitored Restart**: User activity tracked after critical incidents

---

## 💰 Monetization (NO ECONOMIC CHANGES)

### Restart Path Offers

**Stage 2 - Boost Visibility**
- **Price:** 50 tokens
- **Benefit:** 3x profile visibility for 24 hours
- **Timing:** Available when swipe queue unlocks

**Stage 3 - Polish Profile**
- **Price:** 75 tokens
- **Benefit:** AI-powered bio rewrite and photo tips
- **Timing:** Available when chat unlocks

**Stage 4 - Choose Traits**
- **Price:** 100 tokens
- **Benefit:** Smart matching based on 5 desired traits
- **Timing:** Available at full restart

### Revenue Rules (UNCHANGED)

✅ **Preserved:**
- 65/35 revenue split
- Chat cost (100–500 tokens)
- Call pricing (10/20 tokens per min)
- 11/7 word logic
- Free chat logic for low-popularity profiles
- Calendar/event monetization
- Voluntary refund rules
- Panic button/tracking during meetings

❌ **No Changes:**
- No discounts during recovery
- No free tokens
- No modified pricing

---

## 📊 Analytics Tracking

### Recovery Metrics

```typescript
{
  totalDuration: number;           // days
  stageProgression: {
    stage0Duration: number;
    stage1Duration: number;
    stage2Duration: number;
    stage3Duration: number;
    stage4Duration: number;
  };
  recoveryFeedViews: number;
  affirmationsViewed: number;
  suggestionsViewed: number;
  actionsTaken: number;
  tokensSpent: number;
  restartedSuccessfully: boolean;
  timeToRestart: number;           // hours
  returnedToActive: boolean;
  churnedAfterRecovery: boolean;
}
```

---

## 🧪 Testing Guide

### Test Scenarios

1. **Clean Ending - Mutual**
```typescript
// Initiate end connection
const { requestId } = await initiateEndConnection(
  'conn_123',
  'user_A',
  'user_B',
  'thank_you'
);

// Confirm from other user
await confirmEndConnection(requestId, 'user_B');

// Verify both users in recovery
const recoveryA = await getActiveRecoveryState('user_A');
const recoveryB = await getActiveRecoveryState('user_B');
```

2. **Safety Override - Immediate**
```typescript
// Create safety incident
const { incidentId, immediateActions } = await createBreakupSafetyIncident(
  'user_A',
  'user_B',
  'conn_123',
  'harassment',
  'high',
  'Threatening messages'
);

// Verify immediate breakup
assert(immediateActions.includes('immediate_breakup'));
```

3. **Stage Progression**
```typescript
// Fast-forward 3 days
await progressRestartStages();

// Verify stage unlock
const recovery = await getActiveRecoveryState('user_A');
assert(recovery.restartStage === 1);
assert(!recovery.featuresBlocked.discoveryFeed);
```

4. **Feature Blocking**
```typescript
const isBlocked = await isFeatureBlocked('user_A', 'paidChat');
assert(isBlocked === true);  // During stage 0-2
```

5. **Monetization Offers**
```typescript
const offers = await getRestartPathOffers('user_A');
assert(offers.length > 0);

const { success } = await purchaseRestartPathOffer(
  offers[0].offerId,
  'user_A'
);
assert(success === true);
```

---

## 🚀 Deployment Checklist

### Prerequisites
- [ ] Firebase project configured
- [ ] Firestore database created
- [ ] Cloud Functions enabled
- [ ] Cloud Scheduler enabled (for cron jobs)

### Deployment Steps

1. **Deploy Firestore Rules**
```bash
firebase deploy --only firestore:rules
```

2. **Deploy Firestore Indexes**
```bash
firebase deploy --only firestore:indexes
```

3. **Deploy Cloud Functions**
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

4. **Deploy Mobile App**
```bash
cd app-mobile
npm install
# For iOS
npx expo run:ios
# For Android
npx expo run:android
```

5. **Verify Scheduled Functions**
```bash
firebase functions:log --only dailyRecoveryProgression
```

---

## 🔧 Configuration

### Environment Variables

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=service-account@email.com
FIREBASE_PRIVATE_KEY=your-private-key

# Recovery Settings
RECOVERY_MIN_DURATION_DAYS=3
RECOVERY_MAX_DURATION_DAYS=7
STAGE_PROGRESSION_MULTIPLIER=1.0

# Monetization
BOOST_VISIBILITY_PRICE=50
POLISH_PROFILE_PRICE=75
CHOOSE_TRAITS_PRICE=100
```

### Feature Flags

```typescript
const PACK_237_CONFIG = {
  enabled: true,
  requireMutualConfirmation: true,
  safetyOverridesEnabled: true,
  monetizationEnabled: true,
  minRecoveryDays: 3,
  maxRecoveryDays: 7
};
```

---

## 📈 Success Metrics

### KPIs to Monitor

1. **Emotional Safety**
   - % of clean endings vs. silent disappearances
   - User sentiment in recovery feedback
   - Reduction in post-breakup complaints

2. **Retention**
   - % of users completing recovery
   - % returning to active state
   - Churn rate post-recovery vs. baseline

3. **Monetization**
   - Restart offer purchase rate
   - Average tokens spent during recovery
   - Revenue per recovering user

4. **Safety**
   - Safety incident response time
   - False positive rate
   - User satisfaction with safety actions

---

## 🎓 Best Practices

### For Developers

1. **Always check feature blocking** before allowing actions
2. **Respect safety overrides** - never bypass for convenience  
3. **Test edge cases** with various breakup scenarios
4. **Monitor scheduled functions** for failures
5. **Track analytics** to understand user behavior

### For Product Teams

1. **Closing notes are final** - no custom text allowed (prevents abuse)
2. **Recovery cannot be skipped** - protects emotional wellbeing
3. **Offers are optional** - no forced monetization
4. **Safety always wins** - override any other logic when needed
5. **Analytics guide adjustments** - use data to optimize timelines

---

## ⚠️ Known Limitations

1. **No forced breakup from inactivity** - belongs to PACK 236 (Second Chance Mode)
2. **Fixed closing notes** - cannot customize to prevent harm
3. **Minimum 3-day recovery** - even with high activity
4. **One recovery at a time** - cannot have multiple active recoveries
5. **Offers expire with stage** - must purchase before stage advances

---

## 🔗 Integration Points

### PACK 222 (Breakup Recovery - Original)
- Different trigger logic (timeout vs. mutual)
- Can coexist with separate triggers

### PACK 223 (Destiny Weeks)
- Sync recovery status to prevent event participation
- Resume destiny weeks after recovery

### PACK 236 (Second Chance Mode)
- Handles inactivity timeout separately
- Different recovery approach

### Safety Systems
- Immediate integration with moderation queue
- Panic button triggers safety incidents
- Tracking during meetings informs safety decisions

---

## 📝 Confirmation String

```
PACK 237 COMPLETE — Breakup Recovery & Restart Path implemented.
Emotional closure ✓ Cooldown period ✓ Restart path ✓ Safety overrides ✓
```

---

## 📞 Support

For issues or questions about PACK 237:
1. Check this documentation first
2. Review test scenarios for examples
3. Examine type definitions for data structures
4. Check Firestore rules for security constraints
5. Monitor Cloud Functions logs for errors

---

**Implementation Status:** ✅ COMPLETE  
**Last Updated:** 2025-12-02  
**Version:** 1.0.0