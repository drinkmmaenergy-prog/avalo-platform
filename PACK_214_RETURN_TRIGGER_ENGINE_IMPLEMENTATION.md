# PACK 214 — Return Trigger Engine Implementation Guide

## Overview

The Return Trigger Engine is a smart re-engagement system that brings users back to Avalo when the timing is right — **not to nag them or spam them**. All notifications are natural, attractive, and personalized — never needy or aggressive.

### Core Principles

1. **Event-Based Triggers Only** — No random notifications; every trigger is backed by a real event
2. **Personalized by User Type** — Different priorities for male payers, female earners, royal members, etc.
3. **Respects Personal Space** — Silence rules prevent messaging during panic mode, meetings, or DND
4. **Smart Cooldowns** — Prevents over-messaging with intelligent cooldown periods
5. **Truth-Checked Messages** — Cold-start triggers only fire when backed by real data
6. **Break-Friendly** — Users feel missed, not shamed, when returning after breaks

## Architecture

### Components

```
functions/src/
├── pack214-types.ts           # TypeScript interfaces and types
├── pack214-templates.ts       # Message templates with tone validation
├── pack214-engine.ts          # Core logic: silence rules, cooldowns, triggers
├── pack214-schedulers.ts      # Cold-start and break tracking automation
└── pack214-functions.ts       # Cloud Functions: events, schedulers, API endpoints

app-mobile/hooks/
└── useReturnTriggers.ts       # React hooks for mobile integration

Firestore Collections:
├── return_trigger_settings    # User preferences and state
├── return_trigger_events      # Trigger event log
├── trigger_cooldowns          # Cooldown tracking per user/event
├── return_trigger_stats       # Engagement statistics
├── user_break_tracking        # Break duration tracking
└── cold_start_tracking        # New user activation tracking
```

## Key Features

### 1. Event-Based Triggers

Triggers fire automatically when real events occur:

| Event Type | Example |
|------------|---------|
| **NEW_HIGH_PRIORITY_MATCH** | ✨ "Someone your type just joined Avalo" |
| **MESSAGE_FROM_MATCH** | 💬 "Someone is waiting for your reply" |
| **NEW_LIKES** | ❤️ "You caught someone's attention" |
| **WISHLIST_ADD** | ⭐ "You're on someone's wishlist" |
| **HIGH_CHEMISTRY_PROFILE_VISIT** | 🔥 "A person very likely to match viewed your profile" |
| **GOOD_VIBE_BOOST** | ⭐ "Your recent date gave you a good vibe mark" |
| **TOKEN_SALE_OPPORTUNITY** | 💎 "Special token offer just for you" |
| **DISCOVERY_BOOST_ACTIVE** | 🚀 "You're at the top of discovery right now" |

### 2. User Type Personalization

Different priorities and messaging for each user type:

| User Type | Primary Motive | Trigger Priority |
|-----------|----------------|------------------|
| **MALE_PAYER** | Romantic + connection | New matches, likes, replies |
| **FEMALE_EARNER** | Monetization via attention | High-spender visits, chat requests |
| **ROYAL_MALE** | Premium attention | High-demand profiles |
| **NONBINARY** | Safe connection | Vibe-based matches, interest closeness |
| **INFLUENCER_EARNER** | Maximize earnings | Traffic spikes, interest waves |
| **LOW_POPULARITY** | Confidence & support | "You're getting attention" style |

### 3. Cold-Start Activation (Day 0-7)

Aggressive but honest activation for new users:

| Day | Action | Truth Check |
|-----|--------|-------------|
| **0** | Onboarding spotlight | Free 24h premium exposure |
| **1** | 🔥 "7 people added you to wishlist" | Requires real wishlist adds |
| **2** | Discovery boost (free) | Always available |
| **3** | Hidden compatibility highlight | Requires high-chemistry profiles |
| **4** | First chemistry-based match reveal | Requires actual match |
| **5** | Match priority accelerator | Automatic |
| **6** | "Your type is online right now" | Real-time check |
| **7** | "Start a conversation challenge" | Gamified entry |

### 4. Break/Return Sequences

| Break Duration | Action | Trigger |
|----------------|--------|---------|
| **7 days** | Soft ping | "We've missed you on Avalo" |
| **14 days** | Big opportunity | High-chemistry match (truth-checked) |
| **30 days** | Profile boost | Reactivation + discovery push |
| **60+ days** | Comeback reward | Visibility + spotlight for 48h |

### 5. Silence Rules

No triggers sent if:
- User is in **Panic Mode** cooldown
- User has **unresolved negative incident** report
- User is marked **"Do Not Disturb"**
- User is currently in **meeting/event**

### 6. Cooldown System

Smart cooldowns prevent over-messaging:

| Event Type | Cooldown |
|------------|----------|
| NEW_HIGH_PRIORITY_MATCH | 24 hours |
| MESSAGE_FROM_MATCH | 6 hours |
| NEW_LIKES/WISHLIST | 12 hours |
| GOOD_VIBE_BOOST | 48 hours |
| TOKEN_SALE | 72 hours |
| BREAK_RETURN | 7 days |

**Maximum:** 3 triggers per user per day (across all types)

## Implementation Guide

### Backend Setup

#### 1. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules --project avalo-c8c46
```

Rules file: [`firestore-pack214-return-triggers.rules`](firestore-pack214-return-triggers.rules)

#### 2. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes --project avalo-c8c46
```

Indexes file: [`firestore-pack214-indexes.json`](firestore-pack214-indexes.json)

#### 3. Deploy Cloud Functions

The following functions are automatically deployed:

**Event Triggers:**
- `onNewHighPriorityMatch` — Fires when high-priority match created
- `onNewMessage` — Fires when user receives message
- `onNewLike` — Fires when user receives likes
- `onWishlistAdd` — Fires when added to wishlist
- `onProfileVisit` — Fires on high-chemistry profile visit
- `onGoodVibeReceived` — Fires on good vibe rating
- `onDiscoveryBoostActive` — Fires when boost activates

**Lifecycle Triggers:**
- `onUserCreated` — Initializes return trigger settings for new users

**Scheduled Functions:**
- `scheduledColdStartProcessor` — Processes cold-start sequences (every 1 hour)
- `scheduledBreakTracker` — Tracks user breaks (every 6 hours)
- `scheduledStatsCleanup` — Cleans old stats (every Sunday)

**API Endpoints:**
- `triggerReturnEvent` — Manual trigger (testing/admin)
- `setUserPanicMode` — Set panic mode
- `getReturnTriggerStats` — Get user stats
- `updateReturnTriggerSettings` — Update user settings
- `onUserActivity` — Track user activity
- `processSingleUserColdStart` — Process single user (testing)

```bash
firebase deploy --only functions --project avalo-c8c46
```

### Mobile Integration

#### 1. Import Hook

```typescript
import { useReturnTriggers, useActivityTracking } from '../hooks/useReturnTriggers';
```

#### 2. Track User Activity (App Root)

Add to your main App component to automatically track activity:

```typescript
import { useActivityTracking } from '../hooks/useReturnTriggers';

export default function App() {
  useActivityTracking(); // Tracks activity every 5 minutes
  
  return (
    // Your app content
  );
}
```

#### 3. Manage Settings

```typescript
function SettingsScreen() {
  const {
    settings,
    loading,
    error,
    setEnabled,
    setDoNotDisturb,
    setPanicMode,
    getStats,
  } = useReturnTriggers();

  return (
    <View>
      <Switch
        value={settings?.enabled}
        onValueChange={setEnabled}
        disabled={loading}
      />
      
      <Switch
        value={settings?.doNotDisturb}
        onValueChange={setDoNotDisturb}
        disabled={loading}
      />
      
      <Button
        title="Enable Panic Mode (72h)"
        onPress={() => setPanicMode(true, 72)}
      />
      
      <Button
        title="View Stats"
        onPress={async () => {
          const stats = await getStats();
          console.log('Trigger Stats:', stats);
        }}
      />
    </View>
  );
}
```

## Message Tone Rules

### ✅ Allowed Tones
- Exciting
- Confident
- Flirt-coded
- Positive
- Aspirational

### ❌ Forbidden Patterns
- Guilt messaging ("Why aren't you answering?")
- Insecurity triggers ("Someone better matched with your crush")
- Jealousy pushing
- Degrading language

All messages are automatically validated before sending.

## Testing

### Manual Trigger Testing

```typescript
const { triggerEvent } = useReturnTriggers();

// Test a new match trigger
await triggerEvent('NEW_HIGH_PRIORITY_MATCH', {
  matchId: 'test_match_123',
  chemistryScore: 95,
  deepLink: 'match/test_match_123'
}, true); // forceDelivery bypasses cooldowns
```

### Cold-Start Testing

```typescript
// Process cold-start for current user
const processColdStart = httpsCallable(functions, 'processSingleUserColdStart');
await processColdStart({});
```

### Verify Settings

```bash
# View user settings in Firestore
firebase firestore:get return_trigger_settings/{userId} --project avalo-c8c46

# View trigger stats
firebase firestore:get return_trigger_stats/{userId} --project avalo-c8c46
```

## Configuration

### Adjusting Cooldown Periods

Edit [`pack214-engine.ts`](functions/src/pack214-engine.ts):

```typescript
const COOLDOWN_PERIODS: Record<ReturnTriggerEventType, number> = {
  NEW_HIGH_PRIORITY_MATCH: 24,  // hours
  MESSAGE_FROM_MATCH: 6,
  // ... etc
};
```

### Adjusting Daily Limit

Edit [`pack214-engine.ts`](functions/src/pack214-engine.ts):

```typescript
const MAX_TRIGGERS_PER_DAY = 3;
```

### Customizing Message Templates

Edit [`pack214-templates.ts`](functions/src/pack214-templates.ts):

```typescript
map.set("NEW_HIGH_PRIORITY_MATCH_MALE_PAYER", {
  eventType: "NEW_HIGH_PRIORITY_MATCH",
  userType: "MALE_PAYER",
  title: "Your custom title",
  body: "Your custom body",
  tone: "exciting",
  emoji: "✨",
  channels: { push: true, email: true, inApp: true },
});
```

### Cold-Start Timeline

Edit [`pack214-schedulers.ts`](functions/src/pack214-schedulers.ts):

```typescript
const COLD_START_TIMELINE: ColdStartEntry[] = [
  {
    day: 0,
    eventType: "COLD_START_DAY_1",
    enabled: true,
    delayHours: 24,
    requiresTruthCheck: true,
  },
  // ... etc
];
```

## Monitoring

### Key Metrics

Track these metrics in Firestore Analytics:

1. **Trigger Volume**
   - Total triggers sent per day
   - Triggers by event type
   - Triggers by user type

2. **Engagement**
   - Conversion rate (triggers → app opens)
   - Average response time
   - Break return success rate

3. **User Health**
   - Users in panic mode
   - Users with DND enabled
   - Active break tracking

### Firestore Console Queries

```javascript
// High-volume users (might need adjustment)
db.collection('return_trigger_stats')
  .where('triggersBy7Days', '>=', 15)
  .get()

// Users on long breaks
db.collection('user_break_tracking')
  .where('breakDays', '>=', 30)
  .get()

// Recent trigger events
db.collection('return_trigger_events')
  .orderBy('createdAt', 'desc')
  .limit(100)
  .get()
```

## A/B Testing

Users are randomly assigned to test groups A or B in their settings:

```typescript
export interface ReturnTriggerSettings {
  // ...
  abTestGroup?: 'A' | 'B';
}
```

Use this to test different:
- Message templates
- Cooldown periods
- Trigger timing
- Channel preferences

## Economy Impact

**PACK 214 DOES NOT CHANGE:**
- Token prices
- 65/35 split
- Chat pricing
- Meeting pricing/cancellations
- Call pricing
- Subscriptions
- Refund rules

**It only increases chat + event conversions via smart timing.**

## Troubleshooting

### User Not Receiving Triggers

1. Check silence rules:
```typescript
const silenceCheck = await checkSilenceRules(userId);
console.log('Silence check:', silenceCheck);
```

2. Check cooldowns:
```typescript
const cooldownCheck = await checkCooldown(userId, eventType);
console.log('Cooldown check:', cooldownCheck);
```

3. Check daily limit:
```typescript
const withinLimit = await checkDailyLimit(userId);
console.log('Within limit:', withinLimit);
```

### Trigger Not Firing

1. Verify event is being created in Firestore
2. Check Cloud Functions logs:
```bash
firebase functions:log --project avalo-c8c46
```

3. Verify user has return_trigger_settings initialized

### Message Tone Validation Failing

Check for forbidden patterns:
```typescript
const validation = validateMessageTone(title, body);
console.log('Validation:', validation);
```

## Security Considerations

1. **User Privacy** — Only users can read their own settings/stats
2. **System-Only Writes** — Trigger creation restricted to Cloud Functions
3. **Admin Access** — Admins can view for monitoring/debugging
4. **No Rate Limit Bypass** — Even admins respect cooldowns (unless `forceDelivery`)

## Performance

- **Event triggers**: Async, no blocking
- **Scheduled functions**: Batched (100 users at a time)
- **Cooldown checks**: Single document read
- **Stats updates**: Atomic increments

## Deployment Checklist

- [ ] Deploy Firestore rules: `firestore-pack214-return-triggers.rules`
- [ ] Deploy Firestore indexes: `firestore-pack214-indexes.json`
- [ ] Deploy Cloud Functions from `pack214-functions.ts`
- [ ] Integrate `useActivityTracking` in mobile app root
- [ ] Test manual triggers
- [ ] Monitor logs for first 24 hours
- [ ] Verify cold-start sequences for new users
- [ ] Check break tracking is working

## Files Reference

| File | Purpose |
|------|---------|
| [`functions/src/pack214-types.ts`](functions/src/pack214-types.ts) | TypeScript types and interfaces |
| [`functions/src/pack214-templates.ts`](functions/src/pack214-templates.ts) | Message templates with tone validation |
| [`functions/src/pack214-engine.ts`](functions/src/pack214-engine.ts) | Core engine logic |
| [`functions/src/pack214-schedulers.ts`](functions/src/pack214-schedulers.ts) | Cold-start and break tracking |
| [`functions/src/pack214-functions.ts`](functions/src/pack214-functions.ts) | Cloud Functions |
| [`app-mobile/hooks/useReturnTriggers.ts`](app-mobile/hooks/useReturnTriggers.ts) | React hooks |
| [`firestore-pack214-return-triggers.rules`](firestore-pack214-return-triggers.rules) | Security rules |
| [`firestore-pack214-indexes.json`](firestore-pack214-indexes.json) | Database indexes |

---

## CONFIRMATION

**✅ PACK 214 COMPLETE — Return Trigger Engine integrated**

The system is ready for deployment. All triggers are event-based, personalized, and respectful of user boundaries. Dating is not desperate — Avalo respects personal space.