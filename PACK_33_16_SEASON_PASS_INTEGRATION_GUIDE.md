# Season Pass Integration Guide

## Overview

This guide explains how to integrate Season Pass event tracking into existing features. All integrations are UI-only and use AsyncStorage - **NO backend changes required**.

## Core Integration Pattern

```typescript
import seasonPassService, { SeasonEventType } from '../services/seasonPassService';

// After a qualifying user action:
await seasonPassService.registerSeasonEvent(
  creatorId,
  userId,
  'EVENT_TYPE'
);
```

---

## 1. Chat Integration (MESSAGE_SENT & FIRST_MESSAGE)

### Location
`app-mobile/app/chat/[chatId].tsx` or chat message handler

### Implementation
```typescript
// When user sends a message
const handleSendMessage = async (message: string) => {
  // ... existing message send logic ...
  
  // Track season event
  if (creatorId && user?.uid) {
    // Check if it's user's first message to this creator
    const isFirstMessage = await checkIfFirstMessage(creatorId, user.uid);
    
    await seasonPassService.registerSeasonEvent(
      creatorId,
      user.uid,
      isFirstMessage ? 'FIRST_MESSAGE' : 'MESSAGE_SENT'
    );
  }
};
```

### Points Awarded
- `MESSAGE_SENT`: 2 points
- `FIRST_MESSAGE`: 4 points (one-time)

---

## 2. PPV Content Integration (PPV_UNLOCK)

### Location
`app-mobile/components/PPVMediaLock.tsx` or PPV unlock handler

### Implementation
```typescript
// When user unlocks PPV content
const handleUnlockPPV = async (contentId: string) => {
  // ... existing PPV unlock logic ...
  
  // Track season event
  if (creatorId && user?.uid) {
    await seasonPassService.registerSeasonEvent(
      creatorId,
      user.uid,
      'PPV_UNLOCK'
    );
  }
};
```

### Points Awarded
- `PPV_UNLOCK`: 6 points

---

## 3. Live Stream Integration (LIVE_ENTRY)

### Location
`app-mobile/app/(tabs)/live.tsx` or live entry handler

### Implementation
```typescript
// When user joins a live stream
const handleJoinLive = async (streamId: string, creatorId: string) => {
  // ... existing live stream join logic ...
  
  // Track season event
  if (user?.uid) {
    await seasonPassService.registerSeasonEvent(
      creatorId,
      user.uid,
      'LIVE_ENTRY'
    );
  }
};
```

### Points Awarded
- `LIVE_ENTRY`: 6 points

---

## 4. AI Companion Integration (AI_SESSION)

### Location
`app-mobile/app/(tabs)/ai.tsx` or AI chat handler

### Implementation
```typescript
// When user starts an AI session
const handleStartAISession = async (botId: string, creatorId: string) => {
  // ... existing AI session logic ...
  
  // Track season event
  if (user?.uid) {
    await seasonPassService.registerSeasonEvent(
      creatorId,
      user.uid,
      'AI_SESSION'
    );
  }
};
```

### Points Awarded
- `AI_SESSION`: 8 points

---

## 5. Subscription Integration (SUBSCRIPTION)

### Location
Subscription purchase handler

### Implementation
```typescript
// When user subscribes to creator
const handleSubscribe = async (creatorId: string) => {
  // ... existing subscription logic ...
  
  // Track season event
  if (user?.uid) {
    await seasonPassService.registerSeasonEvent(
      creatorId,
      user.uid,
      'SUBSCRIPTION'
    );
  }
};
```

### Points Awarded
- `SUBSCRIPTION`: 20 points

**⚠️ IMPORTANT:** This does NOT give free tokens or discounts - it's purely for season pass progression.

---

## Display Integration

### Creator Profile Integration

Add the Season Pass Ribbon to creator profiles:

```typescript
import SeasonPassRibbon from '../components/SeasonPassRibbon';

// In creator profile component
<SeasonPassRibbon
  creatorId={creatorId}
  onPress={() => {
    // Navigate to season details or show modal
    router.push(`/season/${creatorId}`);
  }}
/>
```

### Progress Modal Integration

Show progress modal when tier is unlocked:

```typescript
import SeasonPassProgressModal from '../components/SeasonPassProgressModal';
import { useState } from 'react';

// In component state
const [showProgressModal, setShowProgressModal] = useState(false);
const [unlockedTier, setUnlockedTier] = useState<TierReward | null>(null);

// After registering event, check for tier unlock
const progress = await seasonPassService.registerSeasonEvent(
  creatorId,
  userId,
  eventType
);

if (progress) {
  // Check if new tier was unlocked
  const previousTier = progress.currentTier - 1;
  if (progress.currentTier > previousTier && !progress.claimedTiers.includes(progress.currentTier)) {
    const season = await seasonPassService.getSeason(creatorId);
    const tierReward = season?.tiers.find(t => t.tier === progress.currentTier);
    
    if (tierReward) {
      setUnlockedTier(tierReward);
      setShowProgressModal(true);
    }
  }
}

// Render modal
<SeasonPassProgressModal
  visible={showProgressModal}
  tier={unlockedTier}
  currentPoints={progress?.totalPoints || 0}
  onClose={() => setShowProgressModal(false)}
/>
```

---

## Event Sequence Example

```
User Journey:
1. User views creator profile → sees SeasonPassRibbon
2. User clicks "Join Season" → joins season
3. User sends first message → earns 4 points
4. User unlocks PPV content → earns 6 points (10 total)
5. User sends more messages → earns 2 points each
6. User reaches 25 points → SeasonPassProgressModal shows Tier 1 unlock
7. User claims reward → cosmetic frame active for 48h
```

---

## Testing Checklist

- [ ] Season creation works in creator dashboard
- [ ] Season ribbon appears on creator profiles with active seasons
- [ ] MESSAGE_SENT events register correctly
- [ ] FIRST_MESSAGE gives correct points (only once)
- [ ] PPV_UNLOCK events register when content unlocked
- [ ] LIVE_ENTRY events register when joining streams
- [ ] AI_SESSION events register when starting AI chats
- [ ] SUBSCRIPTION events register when subscribing
- [ ] Progress modal appears on tier unlock
- [ ] Points accumulate correctly
- [ ] Tier rewards are cosmetic only
- [ ] Season expires after 30 days
- [ ] No tokens or financial rewards given

---

## Important Rules

### ❌ DO NOT:
- Give free tokens for season participation
- Apply discounts or financial benefits
- Modify paid features (Chat/PPV/Subscriptions/LIVE)
- Send automated messages
- Generate AI traffic
- Use push notifications
- Connect to backend/API/Firestore

### ✅ DO:
- Track events silently in AsyncStorage
- Award cosmetic rewards only
- Show visual celebration on tier unlock
- Display current progress in ribbon
- Expire seasons after 30 days
- Allow only 1 active season per creator

---

## Performance Notes

- All operations are async but non-blocking
- Silent failure if no active season exists
- No network calls - 100% local storage
- Minimal impact on existing features
- Event registration typically < 50ms

---

## Support

For questions or issues, refer to:
- [`seasonPassService.ts`](app-mobile/services/seasonPassService.ts) - Core service logic
- [`season-pass.tsx`](app-mobile/app/creator/season-pass.tsx) - Creator dashboard
- [`SeasonPassRibbon.tsx`](app-mobile/components/SeasonPassRibbon.tsx) - Ribbon component
- [`SeasonPassProgressModal.tsx`](app-mobile/components/SeasonPassProgressModal.tsx) - Progress modal

---

**PACK 33-16 COMPLETE** ✅