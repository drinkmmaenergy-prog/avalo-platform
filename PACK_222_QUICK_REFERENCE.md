# PACK 222 - Breakup Recovery & Chemistry Restart Engine - Quick Reference

## TL;DR

Breakup Recovery reduces post-romance churn through emotional safety, confidence rebuilding, and non-aggressive chemistry restart — protecting user retention without exploiting vulnerable states.

---

## Quick Integration

### Backend (Auto-Integrated with PACK 221)

Recovery tracking is **already integrated** with:
- ✅ [`romanticJourneys.ts`](functions/src/romanticJourneys.ts) - Triggers on journey end
- ✅ Integration hooks ready for activity tracking

### Frontend Usage

```typescript
// 1. Import recovery components
import RecoveryStateCard from '@/components/RecoveryStateCard';
import ConfidenceBoostCard from '@/components/ConfidenceBoostCard';
import ChemistryRestartCard from '@/components/ChemistryRestartCard';

// 2. Show recovery state in profile
<RecoveryStateCard
  recoveryState={activeRecovery}
  onPress={() => navigateToRecovery()}
/>

// 3. Display confidence boost cards
{confidenceCards.map(card => (
  <ConfidenceBoostCard
    key={card.cardId}
    card={card}
    onDismiss={() => dismissCard(card.cardId)}
  />
))}

// 4. Show chemistry restart suggestions
<ChemistryRestartCard
  suggestion={suggestion}
  userProfile={profile}
  onSwipeYes={() => handleLike()}
  onSwipeNo={() => handlePass()}
/>
```

---

## 3-Phase Recovery Timeline

| Phase | Duration | Purpose | User Experience |
|-------|----------|---------|-----------------|
| **Cooldown** | 0-48h | Emotional safety | "Take your time" |
| **Rebuild** | 2-5 days | Confidence boost | Real social signals |
| **Restart** | 5-10 days | Chemistry matching | Positive suggestions |

**Adaptive**: Timeline adjusts based on user activity level.

---

## Automatic Breakup Detection

Recovery triggers when journey ends:

| Reason | Trigger |
|--------|---------|
| Neutral ending | User pressed "End Journey" |
| Emotional mismatch | Vibe feedback conflict |
| Ghosted | No chat for 14 days |
| Hard conflict | Safety complaint → resolved |
| Meeting disappointment | Verified mismatch selfie |

**Internal only**: User never sees "breakup" label.

---

## Emotional Safety Copy

### ✅ Allowed (Respect-First)
- "Take your time — when you're ready, we'll help you find chemistry again"
- "Your vibe attracts attention"
- "High chemistry potential"
- "Someone with your vibe"

### ❌ Forbidden (Exploitative)
- "Don't be sad — keep swiping"
- "Replace your ex"
- "Forget about the past"
- "Someone better than the last one"

---

## Confidence Rebuild System

### Real Social Signals Only

During Rebuild phase, users see authentic signals:

| Signal | Source | Example |
|--------|--------|---------|
| Wishlist adds | Real user actions | "5 people added you to their wishlist" |
| Profile visits | Actual views | "Your profile got 12 visits this week" |
| Compliments | Real badges | "You received 3 new compliment badges" |
| Trending | Top 20% views | "You're trending — your profile is getting attention" |
| Vibe attention | 5+ visits | "Your vibe attracts attention" |

**NO FAKE SIGNALS**: All data is real, never fabricated.

---

## Chemistry Restart

### Non-Aggressive Matching

In Restart phase:
- 3 high-chemistry suggestions max
- Positive, flirt-coded copy
- User controls all interactions
- No pressure or deadlines

### Match Card Copy

✅ **Use these headlines**:
- "High chemistry potential"
- "Someone with your vibe"
- "Your timelines match"
- "Energy that fits your pace"

✅ **Use these descriptions**:
- "This person shares your interests and communication style"
- "Compatible energy levels and relationship goals"
- "Similar values and life phase"

---

## Safety Integration

### Recovery Pauses When

- High/critical safety incident
- Panic alert activated
- Safety complaint between users

### Recovery Resumes After

1. Incident resolved
2. User marks "I feel safe again"
3. No active safety flags

### During Safety Pause

- ❌ No romantic triggers
- ❌ No chemistry restart
- ℹ️ "Safety check required before restart" shown
- ✅ Timeline preserved

---

## Key Functions (Backend)

```typescript
// Import
import {
  detectBreakupState,          // Create recovery state
  updateRecoveryPhase,          // Progress through phases
  trackRecoveryActivity,        // Track user engagement
  getActiveRecoveryState,       // Get current state
  getConfidenceBoostCards,      // Get boost cards
  getChemistryRestartSuggestions, // Get restart matches
  markUserSafeForRecovery       // Resume after safety
} from './pack-222-breakup-recovery';

// Integration hooks
import {
  onJourneyEnded,               // Auto-called by PACK 221
  onUserLogin,                  // Track login activity
  onUserSwipe,                  // Track swipe activity
  onChatMessageSent,            // Track messaging
  onSafetyIncidentCreated       // Pause recovery
} from './pack-222-breakup-recovery-integration';
```

---

## Component Props

### RecoveryStateCard

```typescript
interface RecoveryStateCardProps {
  recoveryState: BreakupRecoveryState;
  onPress?: () => void;
}
```

Shows: Phase indicator, progress bar, emotional copy, time remaining

### ConfidenceBoostCard

```typescript
interface ConfidenceBoostCardProps {
  card: ConfidenceBoostCard;
  onDismiss?: () => void;
}
```

Shows: Icon, message, real data count

### ChemistryRestartCard

```typescript
interface ChemistryRestartCardProps {
  suggestion: ChemistryRestartSuggestion;
  userProfile?: { name, photoURL, age };
  onViewProfile?: () => void;
  onSwipeYes?: () => void;
  onSwipeNo?: () => void;
}
```

Shows: Photo, chemistry headline, description, match reasons, actions

---

## Activity Tracking

Track user activity to adjust timeline:

```typescript
// Login
await trackRecoveryActivity(userId, 'login');

// Swipe
await trackRecoveryActivity(userId, 'swipe');

// Chat
await trackRecoveryActivity(userId, 'chat');

// Profile view
await trackRecoveryActivity(userId, 'profile_view');

// Event attendance
await trackRecoveryActivity(userId, 'event_attend');
```

High activity → faster phase progression

---

## Economic Rules (Unchanged)

### ❌ NO Changes to:
- 65/35 split
- Chat/call/meeting prices
- Event pricing
- Refund logic
- Token economics
- Live Arena
- Dynamic pricing

### ✅ Recovery ADDS:
- **Emotional retention** → Natural return
- **Confidence boost** → More engagement
- **Respect-first UX** → Higher lifetime value

**Result**: Retention through respect, not manipulation.

---

## UI Integration Points

### 1. Profile Screen

```typescript
const [recoveryState, setRecoveryState] = useState(null);

useEffect(() => {
  getActiveRecoveryState(userId).then(setRecoveryState);
}, [userId]);

{shouldShowRecoveryUI(recoveryState) && (
  <RecoveryStateCard recoveryState={recoveryState} />
)}
```

### 2. Feed/Discover Screen

```typescript
const [confidenceCards, setConfidenceCards] = useState([]);

useEffect(() => {
  getConfidenceBoostCards(userId).then(setConfidenceCards);
}, [userId]);

{confidenceCards.map(card => (
  <ConfidenceBoostCard
    key={card.cardId}
    card={card}
    onDismiss={() => dismissCard(card.cardId)}
  />
))}
```

### 3. Chemistry Restart Section

```typescript
const [suggestions, setSuggestions] = useState([]);

useEffect(() => {
  getChemistryRestartSuggestions(userId).then(setSuggestions);
}, [userId]);

{suggestions.map(suggestion => (
  <ChemistryRestartCard
    key={suggestion.suggestionId}
    suggestion={suggestion}
    onSwipeYes={() => handleLike(suggestion)}
    onSwipeNo={() => handlePass(suggestion)}
  />
))}
```

---

## Cron Jobs Required

Set up these scheduled functions:

```typescript
// Daily: Progress users through phases
exports.updateRecoveryPhases = functions.pubsub
  .schedule('0 0 * * *')
  .onRun(async () => {
    // Loop through active recovery states
    // Call updateRecoveryPhase() for each
  });

// Daily: Generate confidence cards
exports.generateConfidenceCards = functions.pubsub
  .schedule('0 12 * * *')
  .onRun(async () => {
    // Find users in rebuild phase
    // Generate cards for each
  });

// Weekly: Cleanup completed recoveries
exports.cleanupRecoveries = functions.pubsub
  .schedule('0 0 * * 0')
  .onRun(async () => {
    // Archive old completed states
  });
```

---

## Testing Commands

```typescript
// Check if recovery state exists
const state = await getActiveRecoveryState(userId);
console.log('Phase:', state?.currentPhase);

// Get confidence cards
const cards = await getConfidenceBoostCards(userId);
console.log('Cards:', cards.length);

// Get chemistry suggestions
const suggestions = await getChemistryRestartSuggestions(userId);
console.log('Suggestions:', suggestions.length);

// Track activity
await trackRecoveryActivity(userId, 'chat');

// Mark user safe
await markUserSafeForRecovery(userId);
```

---

## Files Reference

- **Backend Core**: [`functions/src/pack-222-breakup-recovery.ts`](functions/src/pack-222-breakup-recovery.ts)
- **Integration Hooks**: [`functions/src/pack-222-breakup-recovery-integration.ts`](functions/src/pack-222-breakup-recovery-integration.ts)
- **PACK 221 Integration**: [`functions/src/romanticJourneys.ts`](functions/src/romanticJourneys.ts)
- **Type Definitions**: [`app-mobile/types/pack-222-breakup-recovery.ts`](app-mobile/types/pack-222-breakup-recovery.ts)
- **Recovery Card**: [`app-mobile/app/components/RecoveryStateCard.tsx`](app-mobile/app/components/RecoveryStateCard.tsx)
- **Confidence Card**: [`app-mobile/app/components/ConfidenceBoostCard.tsx`](app-mobile/app/components/ConfidenceBoostCard.tsx)
- **Chemistry Card**: [`app-mobile/app/components/ChemistryRestartCard.tsx`](app-mobile/app/components/ChemistryRestartCard.tsx)
- **Security Rules**: [`firestore-pack222-breakup-recovery.rules`](firestore-pack222-breakup-recovery.rules)
- **Indexes**: [`firestore-pack222-breakup-recovery.indexes.json`](firestore-pack222-breakup-recovery.indexes.json)
- **Full Docs**: [`PACK_222_BREAKUP_RECOVERY_IMPLEMENTATION.md`](PACK_222_BREAKUP_RECOVERY_IMPLEMENTATION.md)

---

## Deployment Checklist

- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes`
- [ ] Set up cron jobs (updateRecoveryPhases, generateConfidenceCards)
- [ ] Add recovery UI to profile screen
- [ ] Add confidence cards to feed/discover
- [ ] Add chemistry restart section
- [ ] Test recovery state creation
- [ ] Test phase progression
- [ ] Test safety integration
- [ ] Monitor retention metrics

---

## Common Questions

**Q: Does this change the economics?**  
A: No. All pricing, splits, and monetization unchanged. Only emotional retention.

**Q: Are confidence signals fake?**  
A: No. Only real data shown. Never fabricated.

**Q: Can users skip recovery?**  
A: Yes. Everything is optional. Users control their experience.

**Q: What if there's a safety incident during recovery?**  
A: Recovery auto-pauses until user marks themselves safe.

**Q: How fast do users progress through phases?**  
A: Adaptive. High activity = faster. Low activity = slower.

**Q: Is chemistry restart aggressive?**  
A: No. 3 suggestions max, positive copy, no pressure.

**Q: Can users restart a journey with the same person?**  
A: Yes. If chemistry returns, new journey can be offered.

---

**Status**: ✅ Ready for Production  
**Version**: 1.0  
**Last Updated**: 2025-12-02

---

## Confirmation String for KiloCode

```
PACK 222 COMPLETE — Breakup Recovery & Chemistry Restart Engine integrated