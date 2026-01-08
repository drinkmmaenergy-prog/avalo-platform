# PACK 214 — Return Trigger Engine Quick Reference

## Purpose
Smart re-engagement system that brings users back at the right time — **NOT spam or desperation**.

## Key Features

### 1. Event-Based Triggers (No Random Notifications)
- ✨ New high-priority match
- 💬 Message from match
- ❤️ New likes/wishlist adds
- 🔥 High-chemistry profile visit
- ⭐ Good vibe boost
- 💎 Token sale opportunity
- 🚀 Discovery boost active

### 2. User Type Personalization
- **MALE_PAYER** → romantic matches, likes, replies
- **FEMALE_EARNER** → high-spender visits, chat requests
- **ROYAL_MALE** → high-demand profiles
- **NONBINARY** → vibe-based matches
- **INFLUENCER_EARNER** → traffic spikes
- **LOW_POPULARITY** → confidence & support

### 3. Cold-Start (Day 0-7)
- Day 1: "7 people added you to wishlist" *(truth-checked)*
- Day 2: Free discovery boost
- Day 3: Hidden compatibility highlight
- Day 4: First chemistry match reveal
- Day 5: Match priority accelerator
- Day 6: "Your type is online now"
- Day 7: Conversation challenge

### 4. Break/Return Sequences
- **7 days**: Soft ping
- **14 days**: High-chemistry match opportunity
- **30 days**: Profile reactivation boost
- **60+ days**: Comeback reward (48h spotlight)

### 5. Silence Rules (Respect Personal Space)
No triggers if:
- User in Panic Mode cooldown
- Unresolved incident report
- Do Not Disturb enabled
- In meeting/event

### 6. Smart Cooldowns
- Max 3 triggers per user per day
- Event-specific cooldowns: 6h-72h
- Break returns: 7-day cooldown

## Message Tone Rules

### ✅ ALLOWED
- Exciting, confident, flirt-coded, positive, aspirational

### ❌ FORBIDDEN
- Guilt ("Why aren't you answering?")
- Insecurity ("Someone better...")
- Jealousy triggers
- Degrading language

## Quick Integration

### Backend (Cloud Functions)
```typescript
import {
  onNewHighPriorityMatch,
  onNewMessage,
  onUserCreated,
  scheduledColdStartProcessor,
  scheduledBreakTracker,
} from './pack214-functions';
```

### Mobile (React Hooks)
```typescript
import { useReturnTriggers, useActivityTracking } from '../hooks/useReturnTriggers';

// In App root
useActivityTracking(); // Auto-tracks activity

// In settings screen
const { settings, setEnabled, setDoNotDisturb, setPanicMode } = useReturnTriggers();
```

## Manual Testing
```typescript
const { triggerEvent } = useReturnTriggers();

await triggerEvent('NEW_HIGH_PRIORITY_MATCH', {
  matchId: 'test_123',
  chemistryScore: 95,
}, true); // forceDelivery bypasses cooldowns
```

## Monitoring Queries
```javascript
// High-volume users
db.collection('return_trigger_stats').where('triggersBy7Days', '>=', 15).get()

// Users on breaks
db.collection('user_break_tracking').where('breakDays', '>=', 30).get()

// Recent events
db.collection('return_trigger_events').orderBy('createdAt', 'desc').limit(100).get()
```

## Files Created
- `functions/src/pack214-types.ts` — Types & interfaces
- `functions/src/pack214-templates.ts` — Message templates
- `functions/src/pack214-engine.ts` — Core logic
- `functions/src/pack214-schedulers.ts` — Cold-start & break tracking
- `functions/src/pack214-functions.ts` — Cloud Functions
- `app-mobile/hooks/useReturnTriggers.ts` — React hooks
- `firestore-pack214-return-triggers.rules` — Security rules
- `firestore-pack214-indexes.json` — Database indexes

## Deployment
```bash
# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes --project avalo-c8c46

# Deploy functions
firebase deploy --only functions --project avalo-c8c46
```

## Economy Impact
**NO CHANGES TO:**
- Token prices
- 65/35 split
- Chat/meeting/call pricing
- Subscriptions
- Refunds

**ONLY INCREASES:** Chat + event conversions via smart timing

---

**✅ PACK 214 COMPLETE** — Return Trigger Engine integrated