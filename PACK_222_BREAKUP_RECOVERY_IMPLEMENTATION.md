# PACK 222: Breakup Recovery & Chemistry Restart Engine

## Overview

PACK 222 reduces post-romance churn by providing emotional safety, confidence rebuilding, and gentle chemistry restart after romantic journey endings. This system protects user retention without aggressive re-matching or exploiting vulnerable emotional states.

**Status**: ✅ Fully Implemented  
**Version**: 1.0  
**Dependencies**: PACK 221 (Romantic Journeys), PACK 210/211 (Safety Systems)

---

## Problem Solved

Without emotional safety design, users who experience:
- Romantic journey endings (PACK 221)
- Rejection or ghosting
- Meeting disappointments
- Safety-related breakups

Often leave the app for days or permanently, causing massive churn.

### What This Pack Prevents
- ❌ Shame spirals
- ❌ Desperate messaging
- ❌ Aggressive immediate re-matching
- ❌ Rebound energy exploitation
- ❌ Emotional manipulation

### What This Pack Provides
- ✅ Emotional safety messaging
- ✅ Confidence rebuilding with real signals
- ✅ Adaptive recovery timeline
- ✅ Non-aggressive chemistry restart
- ✅ Safety integration
- ✅ Respect-first UX

---

## Architecture

### 3-Phase Recovery Timeline

```
COOLDOWN (0-48h)
↓ Soft mode, no romantic triggers
REBUILD (2-5 days)
↓ Confidence boost with real social signals
RESTART (5-10 days)
↓ Chemistry-based re-matching
COMPLETED
```

**Timeline is adaptive**: Users move faster with activity, slower without.

### Automatic Breakup Detection

Recovery state is triggered when romantic journey ends due to:

| Reason | Trigger |
|--------|---------|
| `neutral_ending` | User pressed "End Journey" |
| `emotional_mismatch` | Vibe feedback conflict |
| `ghosted` | No chat for 14 days + no decline |
| `hard_conflict` | Safety complaint → resolved |
| `meeting_disappointment` | Verified mismatch selfie |

**Internal flag only**: `needs_recovery = true` (never shown to user)

---

## Core Components

### Backend (Firebase Functions)

#### 1. Main Recovery Engine
**File**: [`functions/src/pack-222-breakup-recovery.ts`](functions/src/pack-222-breakup-recovery.ts)

Key functions:
- `detectBreakupState()` - Create recovery state on journey end
- `updateRecoveryPhase()` - Progress through timeline phases
- `trackRecoveryActivity()` - Adjust timeline based on user activity
- `generateConfidenceBoostCards()` - Create real social signal cards
- `generateChemistryRestartSuggestions()` - Non-aggressive match suggestions
- `getEmotionalSafetyCopy()` - Phase-appropriate messaging

#### 2. Integration Hooks
**File**: [`functions/src/pack-222-breakup-recovery-integration.ts`](functions/src/pack-222-breakup-recovery-integration.ts)

Hooks into:
- `onJourneyEnded()` - PACK 221 integration (automatic)
- `onUserLogin()` - Track activity during recovery
- `onUserSwipe()` - Track engagement
- `onChatMessageSent()` - Track messaging activity
- `onSafetyIncidentCreated()` - Pause recovery if needed
- `onUserMarkedSafe()` - Resume after safety clearance

### Frontend (Mobile App)

#### Type Definitions
**File**: [`app-mobile/types/pack-222-breakup-recovery.ts`](app-mobile/types/pack-222-breakup-recovery.ts)

Includes utility functions:
- `getRecoveryPhaseCopy()` - Get phase-appropriate copy
- `calculateRecoveryProgress()` - Progress percentage
- `shouldShowRecoveryUI()` - Visibility check
- `getPhaseTimeRemaining()` - Time display

#### UI Components

1. **RecoveryStateCard**
   - **File**: [`app-mobile/app/components/RecoveryStateCard.tsx`](app-mobile/app/components/RecoveryStateCard.tsx)
   - Shows current phase with progress bar
   - Emotional safety messaging
   - Phase-specific colors and copy

2. **ConfidenceBoostCard**
   - **File**: [`app-mobile/app/components/ConfidenceBoostCard.tsx`](app-mobile/app/components/ConfidenceBoostCard.tsx)
   - Displays real social signals (wishlist adds, visits, compliments)
   - NO fake signals - only real data
   - Dismissable by user

3. **ChemistryRestartCard**
   - **File**: [`app-mobile/app/components/ChemistryRestartCard.tsx`](app-mobile/app/components/ChemistryRestartCard.tsx)
   - Shows chemistry restart suggestions
   - Positive, flirt-coded copy
   - Non-aggressive design

### Database (Firestore)

#### Collections

1. **`breakup_recovery_states`**
   - User's recovery state
   - Phase tracking
   - Confidence signals
   - Safety status

2. **`confidence_boost_cards`**
   - Real social signals
   - Generated during rebuild phase
   - User-dismissable

3. **`chemistry_restart_suggestions`**
   - High-chemistry matches
   - Positive copy
   - Interaction tracking

#### Security Rules
**File**: [`firestore-pack222-breakup-recovery.rules`](firestore-pack222-breakup-recovery.rules)

- Users can only read their own recovery data
- Backend-only write access for state creation
- Users can mark safety status and card interactions

#### Indexes
**File**: [`firestore-pack222-breakup-recovery.indexes.json`](firestore-pack222-breakup-recovery.indexes.json)

Optimized queries for:
- User recovery state lookup
- Phase-based queries
- Unshown confidence cards
- Chemistry suggestions by score

---

## Recovery Timeline Details

### Phase 1: Cooldown (0-48 hours)

**Purpose**: Emotional safety, no pressure

**User Experience**:
- Soft mode activated
- No romantic triggers shown
- Copy: "Take your time — when you're ready, we'll help you find chemistry again"

**System Behavior**:
- No match suggestions
- No push notifications for romance
- Activity tracking begins

### Phase 2: Rebuild (2-5 days)

**Purpose**: Confidence rebuilding with real signals

**User Experience**:
- Confidence boost cards shown
- Copy: "Your vibe attracts attention — People are noticing your profile"
- Real social signals displayed

**System Behavior**:
- Track wishlist adds
- Track profile visits
- Track compliment badges
- Check trending status
- NO FAKE SIGNALS - only real data

**Confidence Signals Tracked**:
```typescript
{
  wishlistAdds: number,      // Real adds from last 7 days
  profileVisits: number,     // Real visits from last 7 days
  complimentBadges: number,  // Real compliments from last 7 days
  trendingStatus: boolean,   // Top 20% of views in area
  vibeAttention: boolean     // 5+ visits in period
}
```

### Phase 3: Restart (5-10 days)

**Purpose**: Chemistry-based re-matching (non-aggressive)

**User Experience**:
- Chemistry restart suggestions shown
- Positive, flirt-coded copy
- Copy: "Ready for new chemistry? We found some great matches with your energy"

**System Behavior**:
- Generate 3 high-chemistry suggestions
- Use existing matching algorithm
- Track interactions

**Forbidden Copy** (never used):
- ❌ "Replace your ex"
- ❌ "Forget about the past"
- ❌ "Someone better than the last one"

**Allowed Copy**:
- ✅ "High chemistry potential"
- ✅ "Someone with your vibe"
- ✅ "Your timelines match"
- ✅ "Energy that fits your pace"

---

## Safety Integration

### Safety Check Required

When breakup is safety-related:
1. Recovery state paused
2. `safetyCheckRequired = true`
3. Restart phase blocked until clearance
4. User must mark "I feel safe again"

### Automatic Pause Triggers

Recovery pauses when:
- High/critical safety incident created (PACK 210)
- Panic alert activated
- Safety complaint between partners

### Safety Resume Flow

1. User marks themselves as feeling safe
2. System verifies no active incidents
3. Recovery timeline resumes
4. Chemistry restart allowed

---

## Economic Rules (Unchanged)

PACK 222 does **NOT** modify:
- ❌ 65/35 earning split
- ❌ Chat pricing (100-500 tokens, PACK 219)
- ❌ Call/meeting/event pricing
- ❌ Refund/cancellation logic
- ❌ Fan/Kiss monetization
- ❌ Live Arena economics
- ❌ Dynamic pricing engine

**What it DOES**:
- ✅ Protects emotional retention
- ✅ Encourages natural re-engagement
- ✅ Reduces churn through respect
- ✅ Maintains confidence → increases rebooking

**Result**: Higher lifetime value through voluntary engagement, not manipulation.

---

## Integration Points

### With PACK 221 (Romantic Journeys)

**Automatic Integration**:
```typescript
// In romanticJourneys.ts endJourney()
await onJourneyEnded(journeyId, user1Id, user2Id, endingUserId, reason);
```

Recovery state created for both users when journey ends.

### With PACK 210/211 (Safety Systems)

**Safety Incident Hook**:
```typescript
// When high/critical incident created
await pauseRecoveryForSafety(userId, reason);
```

**Safety Resolution Hook**:
```typescript
// User marks themselves safe
await markUserSafeForRecovery(userId);
```

### With Existing Collections

**Used for Confidence Signals**:
- `wishlists` - Track adds to user
- `profile_visits` - Track view counts
- `user_badges` - Track compliment badges
- `users` - Check trending status

**Used for Chemistry Restart**:
- Existing matching algorithm
- Chemistry scores
- User preferences

---

## UI Integration Guide

### 1. Show Recovery State in Profile

```typescript
import RecoveryStateCard from '@/components/RecoveryStateCard';
import { getActiveRecoveryState } from '@/lib/firebase';

// In profile screen
const [recoveryState, setRecoveryState] = useState(null);

useEffect(() => {
  const fetchRecovery = async () => {
    const state = await getActiveRecoveryState(currentUserId);
    setRecoveryState(state);
  };
  fetchRecovery();
}, [currentUserId]);

// Render
{recoveryState && shouldShowRecoveryUI(recoveryState) && (
  <RecoveryStateCard
    recoveryState={recoveryState}
    onPress={() => navigateToRecovery()}
  />
)}
```

### 2. Show Confidence Boost Cards in Feed

```typescript
import ConfidenceBoostCard from '@/components/ConfidenceBoostCard';
import { getConfidenceBoostCards, markConfidenceCardShown } from '@/lib/firebase';

// In feed/discover screen
const [confidenceCards, setConfidenceCards] = useState([]);

useEffect(() => {
  const fetchCards = async () => {
    const cards = await getConfidenceBoostCards(currentUserId);
    setConfidenceCards(cards);
  };
  fetchCards();
}, [currentUserId]);

// Render
{confidenceCards.map(card => (
  <ConfidenceBoostCard
    key={card.cardId}
    card={card}
    onDismiss={() => handleDismiss(card.cardId)}
  />
))}
```

### 3. Show Chemistry Restart Suggestions

```typescript
import ChemistryRestartCard from '@/components/ChemistryRestartCard';
import { getChemistryRestartSuggestions, trackChemistrySuggestionInteraction } from '@/lib/firebase';

// In special restart section
const [suggestions, setSuggestions] = useState([]);

useEffect(() => {
  const fetchSuggestions = async () => {
    const sugg = await getChemistryRestartSuggestions(currentUserId);
    setSuggestions(sugg);
  };
  fetchSuggestions();
}, [currentUserId]);

// Render
{suggestions.map(suggestion => (
  <ChemistryRestartCard
    key={suggestion.suggestionId}
    suggestion={suggestion}
    userProfile={getUserProfile(suggestion.suggestedUserId)}
    onViewProfile={() => navigate(`/profile/${suggestion.suggestedUserId}`)}
    onSwipeYes={() => handleLike(suggestion)}
    onSwipeNo={() => handlePass(suggestion)}
  />
))}
```

---

## Deployment Checklist

### Backend Deployment

- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Verify [`pack-222-breakup-recovery.ts`](functions/src/pack-222-breakup-recovery.ts) deployed
- [ ] Verify [`pack-222-breakup-recovery-integration.ts`](functions/src/pack-222-breakup-recovery-integration.ts) deployed
- [ ] Verify PACK 221 integration in [`romanticJourneys.ts`](functions/src/romanticJourneys.ts)

### Database Deployment

- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes`
- [ ] Verify [`firestore-pack222-breakup-recovery.rules`](firestore-pack222-breakup-recovery.rules) active
- [ ] Verify [`firestore-pack222-breakup-recovery.indexes.json`](firestore-pack222-breakup-recovery.indexes.json) built

### Frontend Deployment

- [ ] Add UI components to mobile app
- [ ] Import types from [`pack-222-breakup-recovery.ts`](app-mobile/types/pack-222-breakup-recovery.ts)
- [ ] Integrate into Profile screen
- [ ] Integrate into Discover/Feed screen
- [ ] Add chemistry restart section

### Monitoring Setup

- [ ] Set up recovery state creation monitoring
- [ ] Track phase progression rates
- [ ] Monitor confidence card generation
- [ ] Track chemistry restart interaction rates
- [ ] Monitor retention improvement

### Cron Jobs

Set up scheduled functions for:
- [ ] Daily: `updateRecoveryPhases()` - Progress users through phases
- [ ] Daily: `generateConfidenceBoostCards()` - Create new cards
- [ ] Weekly: `cleanupCompletedRecoveries()` - Archive old states

---

## Testing Guidelines

### Test Scenarios

#### 1. Basic Recovery Flow
```typescript
// Test journey ending triggers recovery
const { recoveryId } = await detectBreakupState(
  user1Id, user2Id, journeyId, 'neutral_ending'
);
expect(recoveryId).toBeTruthy();

// Verify recovery state created
const state = await getActiveRecoveryState(user1Id);
expect(state.currentPhase).toBe('cooldown');
expect(state.needsRecovery).toBe(true);
```

#### 2. Phase Progression
```typescript
// Mock time passage
await updateRecoveryPhase(recoveryId);

// After cooldown period
expect(state.currentPhase).toBe('rebuild');

// After rebuild period
expect(state.currentPhase).toBe('restart');
```

#### 3. Activity Tracking
```typescript
// Track high activity
await trackRecoveryActivity(userId, 'chat');
await trackRecoveryActivity(userId, 'event_attend');

// Verify early progression
const state = await getActiveRecoveryState(userId);
expect(state.userActivityLevel).toBe('high');
```

#### 4. Safety Integration
```typescript
// Create safety incident
await onSafetyIncidentCreated(userId, incidentId, 'high');

// Verify recovery paused
const state = await getActiveRecoveryState(userId);
expect(state.safetyCheckRequired).toBe(true);
expect(state.readyForChemistryRestart).toBe(false);

// User marks safe
await markUserSafeForRecovery(userId);

// Verify resumed
expect(state.safetyCleared).toBe(true);
```

#### 5. Confidence Cards
```typescript
// Generate cards based on real data
await generateConfidenceBoostCards(recoveryId, userId);

// Fetch cards
const cards = await getConfidenceBoostCards(userId);
expect(cards.length).toBeGreaterThan(0);

// Verify only real signals
cards.forEach(card => {
  expect(card.data.count).toBeGreaterThan(0);
});
```

---

## Monitoring & Analytics

### Key Metrics

**Retention Metrics**:
- Recovery state creation rate
- Phase completion rates
- Time to restart phase
- User activity during recovery
- Return rate after recovery

**Engagement Metrics**:
- Confidence card view rate
- Confidence card engagement
- Chemistry suggestion view rate
- Chemistry suggestion interaction rate
- Match rate from restart suggestions

**Safety Metrics**:
- Safety-pause rate
- Safety clearance time
- Restart after safety incident

### Success Indicators

✅ **Good Performance**:
- 80%+ users complete recovery timeline
- 60%+ engage with confidence cards
- 40%+ interact with chemistry restart
- 70%+ retention after 30 days

⚠️ **Needs Attention**:
- <60% completing timeline (adjust phases)
- <30% engaging with cards (improve copy)
- <20% restart interaction (improve matching)
- <50% retention (review entire flow)

---

## Best Practices

### DO ✅

- Use emotional safety copy at all times
- Show only real social signals
- Allow users to skip/dismiss any step
- Respect safety flags immediately
- Track activity to adjust timeline
- Use positive, flirt-coded chemistry copy

### DON'T ❌

- Never fake confidence signals
- Never pressure immediate re-matching
- Never use rebound-exploiting copy
- Never mention "ex" or "replacement"
- Never force chemistry restart
- Never bypass safety checks

---

## Troubleshooting

### Recovery State Not Created

**Check**:
1. Journey actually ended (status = 'archived')
2. Integration hook called in `romanticJourneys.ts`
3. User IDs valid
4. No errors in function logs

### Phase Not Progressing

**Check**:
1. Cron job running (`updateRecoveryPhases`)
2. Time calculations correct
3. User activity level updating
4. No safety blocks

### No Confidence Cards

**Check**:
1. Real social signals exist (wishlists, visits, badges)
2. `generateConfidenceBoostCards()` called during rebuild
3. User ID matches
4. 7-day window has data

### Chemistry Restart Not Showing

**Check**:
1. Recovery in restart phase
2. Safety cleared
3. Suggestions generated
4. Matching algorithm returning results

---

## Future Enhancements

Potential additions (not required for v1):
- A/B test different timeline durations
- Personalized confidence messages
- Recovery journaling feature
- Support group integration
- Therapist recommendations
- Premium recovery coaching

---

## Files Reference

### Backend
- [`functions/src/pack-222-breakup-recovery.ts`](functions/src/pack-222-breakup-recovery.ts) - Core engine
- [`functions/src/pack-222-breakup-recovery-integration.ts`](functions/src/pack-222-breakup-recovery-integration.ts) - Integration hooks
- [`functions/src/romanticJourneys.ts`](functions/src/romanticJourneys.ts) - PACK 221 integration

### Frontend
- [`app-mobile/types/pack-222-breakup-recovery.ts`](app-mobile/types/pack-222-breakup-recovery.ts) - Type definitions
- [`app-mobile/app/components/RecoveryStateCard.tsx`](app-mobile/app/components/RecoveryStateCard.tsx) - Phase card
- [`app-mobile/app/components/ConfidenceBoostCard.tsx`](app-mobile/app/components/ConfidenceBoostCard.tsx) - Confidence card
- [`app-mobile/app/components/ChemistryRestartCard.tsx`](app-mobile/app/components/ChemistryRestartCard.tsx) - Restart card

### Database
- [`firestore-pack222-breakup-recovery.rules`](firestore-pack222-breakup-recovery.rules) - Security rules
- [`firestore-pack222-breakup-recovery.indexes.json`](firestore-pack222-breakup-recovery.indexes.json) - Query indexes

### Documentation
- [`PACK_222_BREAKUP_RECOVERY_IMPLEMENTATION.md`](PACK_222_BREAKUP_RECOVERY_IMPLEMENTATION.md) - This file

---

## Confirmation String for KiloCode

```
PACK 222 COMPLETE — Breakup Recovery & Chemistry Restart Engine integrated
```

---

**Last Updated**: 2025-12-02  
**Author**: Avalo Development Team  
**Version**: 1.0  
**Status**: ✅ Production Ready