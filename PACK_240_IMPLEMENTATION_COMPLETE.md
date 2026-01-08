# PACK 240: Truth or Dare — Premium Mode - Implementation Complete

## ✅ IMPLEMENTATION STATUS: COMPLETE

All components of Pack 240 have been successfully implemented and are ready for integration.

---

## 📋 OVERVIEW

Pack 240 implements a premium micro-game that escalates high-chemistry matches into paid chats, calls, and bookings through flirty Truth or Dare prompts — fully App Store compliant.

### Key Features:
- **High-Chemistry Gate**: Only unlocks after 400+ paid words, 2+ chemistry boosters, tier 5+ chemistry
- **Explicit Consent Required**: Both users must manually enable Truth or Dare
- **Flirting-Optimized Prompts**: App Store compliant romantic questions and dares
- **Intensity Scaling**: Prompts adapt to chemistry tier (1-3 intensity levels)
- **Monetization-Driven**: Every prompt targets specific monetization (chat/voice/video/calendar/gifts)
- **Auto-Shutoff Protection**: 20-minute timeout prevents pressure
- **Zero Free Rewards**: Pure engagement amplification without altering tokenomics

---

## 🏗️ IMPLEMENTATION FILES

### 1. Firestore Security Rules (Extended)
**File**: `firestore-pack239-microgames.rules`
- Added `truthOrDare` to allowed game types
- Same safety enforcement as existing micro-games
- Consent validation at Firestore level

### 2. Firestore Indexes (Extended)
**File**: `firestore-pack239-microgames.indexes.json`
- Added intensity-based query indexes
- Round-count tracking indexes
- Chemistry-tier filtering support

### 3. TypeScript Types (Extended)
**File**: `app-mobile/types/microGames.ts`
- Complete Truth or Dare type definitions
- 28 curated prompts (14 truths + 14 dares)
- Eligibility checking functions
- Intensity scaling helpers
- Monetization target mapping

### 4. Game State Hook
**File**: `app-mobile/hooks/useTruthOrDare.ts`
- Real-time eligibility checking
- Consent management (per-user)
- Game lifecycle management
- Auto-shutoff monitoring
- Monetization trigger coordination

### 5. Main Game Component
**File**: `app-mobile/app/components/TruthOrDare.tsx`
- Full premium game UI
- Eligibility visualization
- Choice interface (Truth vs Dare)
- Response submission with type selection
- Auto-timeout handling
- Monetization suggestion integration

### 6. Launch Button Components
**File**: `app-mobile/app/components/TruthOrDareButton.tsx`
- Standard button variant
- Compact toolbar variant
- Inline selection variant
- Premium badge styling

### 7. Settings Integration
**File**: `app-mobile/app/profile/settings/microGames.tsx`
- Added Truth or Dare to default allowed games
- Updated descriptions
- Added premium info card

---

## 🎮 GAME FLOW

### 1. Eligibility Check
User opens game → system checks:
- ✓ 400+ paid words exchanged
- ✓ 2+ chemistry boosters triggered
- ✓ No safety flags
- ✓ Both users enabled Truth or Dare
- ✓ Chemistry tier 5+

### 2. Consent Flow
If not enabled:
- Show eligibility requirements
- Show safety information
- User taps "Enable Truth or Dare"
- Wait for other user to enable

### 3. Game Start
Both enabled → User initiates game:
- System calculates intensity (1-3 based on chemistry tier)
- Creates game with 20-minute auto-shutoff
- First player chooses Truth or Dare

### 4. Prompt & Response
- System selects random prompt matching intensity
- Player responds (text/voice/photo)
- Monetization triggered based on prompt category
- Roles switch to other player

### 5. Continuation
- Rounds continue until:
  - Players manually end game
  - 20-minute timeout occurs
  - Either player closes chat

---

## 🔥 ELIGIBILITY SYSTEM

### Requirements (ALL must be met)

| Requirement | Threshold | Reason |
|-------------|-----------|--------|
| Paid words | 400+ | Stability & investment |
| Chemistry boosters | 2+ | Emotional readiness |
| Safety flags | None | Protection |
| User consent | Both | Explicit opt-in |
| Chemistry tier | 5+ | High engagement |

### Intensity Tiers

| Chemistry Tier | Intensity | Prompt Types |
|----------------|-----------|--------------|
| 5-7 | Mild (1) | Safe, romantic |
| 8-9 | Medium (2) | Flirty, emotional |
| 10 | Intense (3) | Attraction, desire |

**All prompts remain App Store compliant — no explicit content.**

---

## 💗 PROMPT CATEGORIES & MONETIZATION

### Truth Prompts (14 total)

| Category | Example | Monetization Target |
|----------|---------|-------------------|
| Romantic | "What makes your heart race?" | Chat (paid words) |
| Emotional | "What quality do you value most?" | Voice call |
| Playful | "What's your go-to move to impress?" | Chat (paid words) |
| Date-focused | "What's your dream date?" | Calendar booking |
| Attraction | "What do you notice first?" | Video call |

### Dare Prompts (14 total)

| Category | Example | Monetization Target |
|----------|---------|-------------------|
| Romantic | "Send a voice note describing your perfect date" | Voice call |
| Emotional | "Share a moment when you felt most alive" | Chat (paid words) |
| Playful | "Describe what you'd wear on a dream date" | Chat (paid words) |
| Date-focused | "Suggest a specific date idea for us" | Calendar booking |
| Attraction | "Send a photo that represents your vibe" | Video call |

**Every prompt strategically drives monetization.**

---

## 🚀 MONETIZATION MECHANICS

### Revenue Amplification (NO FREE TOKENS)

| Game Stage | Monetization Impact |
|------------|-------------------|
| Prompt Response | Increased paid word count (11/7 words per token) |
| Voice Dare | Voice call suggestion (10 tokens/min) |
| Video Hint | Video call suggestion (20 tokens/min) |
| Date Dare | Calendar booking prompt |
| Attraction | Gift economy trigger |

### Economics Unchanged
- **Chat Price**: 100-500 tokens (unchanged)
- **Word Billing**: 11/7 words per token (unchanged)
- **Split**: 65/35 earner/platform (unchanged)
- **Call Pricing**: 10/20 tokens per minute (unchanged)
- **Calendar**: Existing event economics (unchanged)

**Pure UX-level revenue amplification through emotional engagement.**

---

## 🔐 SAFETY SYSTEM

### Auto-Disable Conditions

Truth or Dare **CANNOT trigger** if:
1. Sleep Mode active
2. Breakup Recovery active
3. Safety flag between users
4. Underage suspicion
5. Stalker risk detected
6. Either user hasn't explicitly consented

### Auto-Shutoff Protection

- **20-minute timeout** without response
- Prevents pressure tactics
- Resets with each response
- Alert shown before closure

### Content Safety

- **Zero explicit prompts**
- Flirting & romance allowed
- App Store compliant
- Family-friendly tone maintained

---

## 📊 FIRESTORE DATA STRUCTURE

### Game Document: `/chats/{chatId}/microGames/{gameId}`

```typescript
{
  gameId: string
  chatId: string
  gameType: 'truthOrDare'
  status: 'idle' | 'active' | 'switching' | 'complete'
  participants: [userId1, userId2]
  initiatorId: string
  currentPlayerId: string
  roundCount: number
  rounds: TruthOrDareRound[]
  
  // Truth or Dare specific
  intensity: 1 | 2 | 3
  autoShutoffAt: Timestamp // 20 minutes from last activity
  totalResponseTime: number // seconds
  
  // Eligibility snapshot
  eligibilitySnapshot: {
    paidWordsExchanged: number
    chemistryBoostersTriggered: number
    chemistryTier: number
  }
  
  // Monetization tracking
  voiceCallSuggested: boolean
  videoCallSuggested: boolean
  calendarEventSuggested: boolean
  
  // Timestamps
  createdAt: Timestamp
  lastPlayed: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
}
```

### Round Data

```typescript
{
  roundNumber: number
  playerId: string
  choice: 'truth' | 'dare'
  prompt: {
    id: string
    type: 'truth' | 'dare'
    category: string
    intensity: 1 | 2 | 3
    prompt: string
    monetizationTarget: string
  }
  response?: string
  responseType?: 'text' | 'voice' | 'photo'
  completedAt?: Timestamp
  skipped?: boolean
}
```

### Consent Document: `/users/{userId}/microGames/truthOrDareConsent`

```typescript
{
  userId: string
  enabled: boolean
  enabledAt?: Timestamp
  disabledAt?: Timestamp
}
```

---

## 🛠️ INTEGRATION GUIDE

### Step 1: Add to Chat Interface

```tsx
import TruthOrDareButton from './components/TruthOrDareButton';

<TruthOrDareButton
  chatId={chatId}
  currentUserId={currentUser.id}
  otherUserId={otherUser.id}
  otherUserName={otherUser.name}
  onVoiceCallSuggestion={handleVoiceCallOpen}
  onVideoCallSuggestion={handleVideoCallOpen}
  onCalendarEventSuggestion={handleCalendarOpen}
  onGiftSuggestion={handleGiftOpen}
/>
```

### Step 2: Add to Game Selection Menu

```tsx
import { InlineTruthOrDareButton } from './components/TruthOrDareButton';

<InlineTruthOrDareButton
  variant="premium"
  chatId={chatId}
  currentUserId={currentUser.id}
  otherUserId={otherUser.id}
  otherUserName={otherUser.name}
  onVoiceCallSuggestion={handleVoiceCallOpen}
  onVideoCallSuggestion={handleVideoCallOpen}
  onCalendarEventSuggestion={handleCalendarOpen}
  onGiftSuggestion={handleGiftOpen}
/>
```

### Step 3: Handle Monetization Callbacks

```tsx
const handleVoiceCallOpen = () => {
  router.push(`/calls/voice/${chatId}`);
};

const handleVideoCallOpen = () => {
  router.push(`/calls/video/${chatId}`);
};

const handleCalendarOpen = () => {
  router.push(`/calendar/create?chatId=${chatId}`);
};

const handleGiftOpen = () => {
  router.push(`/gifts?recipientId=${otherUserId}`);
};
```

### Step 4: Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## 🧪 TESTING CHECKLIST

### Eligibility Tests
- [ ] Check blocks when < 400 words
- [ ] Check blocks when < 2 boosters
- [ ] Check blocks with safety flags
- [ ] Check blocks without consent
- [ ] Check blocks when chemistry < 5
- [ ] Check allows when all requirements met

### Consent Tests
- [ ] User can enable consent
- [ ] User can disable consent
- [ ] Game blocks if only one user enabled
- [ ] Game allows if both users enabled

### Game Flow Tests
- [ ] Game starts with correct intensity
- [ ] Choice screen shows (Truth vs Dare)
- [ ] Prompts match intensity level
- [ ] Response submission works
- [ ] Response types work (text/voice/photo)
- [ ] Skip turn works
- [ ] Roles switch correctly
- [ ] Game completion works

### Safety Tests
- [ ] Auto-shutoff at 20 minutes
- [ ] Sleep mode blocks game
- [ ] Breakup recovery blocks game
- [ ] Safety flags block game

### Monetization Tests
- [ ] Voice call suggestions appear
- [ ] Video call suggestions appear
- [ ] Calendar suggestions appear
- [ ] Gift suggestions appear
- [ ] All show correct pricing
- [ ] No free tokens offered

---

## 📦 FILES CREATED/MODIFIED

### Created Files
1. `app-mobile/hooks/useTruthOrDare.ts` - Game state hook
2. `app-mobile/app/components/TruthOrDare.tsx` - Main game component
3. `app-mobile/app/components/TruthOrDareButton.tsx` - Launch buttons
4. `PACK_240_IMPLEMENTATION_COMPLETE.md` - This document

### Modified Files
1. `firestore-pack239-microgames.rules` - Added truthOrDare game type
2. `firestore-pack239-microgames.indexes.json` - Added intensity/round indexes
3. `app-mobile/types/microGames.ts` - Added Truth or Dare types & prompts
4. `app-mobile/app/profile/settings/microGames.tsx` - Added Truth or Dare to settings

**All functionality is additive and opt-in. Minimal modifications to existing files.**

---

## ✅ CONFIRMATION STRING

```
PACK 240 COMPLETE — Couple Truth or Dare Premium Mode implemented. High-chemistry micro-game that boosts paid chats, calls, and bookings through flirty prompts without violating App Store safety.
```

---

## 🎯 SUCCESS METRICS

Track post-launch:

### Engagement
- Eligibility check rate
- Consent enablement rate
- Game start rate (eligible users)
- Average rounds per game
- Completion rate

### Monetization
- Additional paid words during game
- Voice call conversions from dares
- Video call conversions from prompts
- Calendar bookings from date dares
- Gift purchases triggered

### Chemistry
- Average intensity level played
- Response rate within 20 minutes
- Skip rate per intensity
- Return rate (users playing again)

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All files committed to repository
- [ ] Types compiled without errors
- [ ] Firestore rules validated
- [ ] Indexes created in Firebase Console

### Deployment
- [ ] Deploy Firestore rules
- [ ] Deploy Firestore indexes
- [ ] Deploy mobile app update
- [ ] Verify rules in production

### Post-Deployment
- [ ] Monitor eligibility check errors
- [ ] Monitor game start rate
- [ ] Monitor monetization conversions
- [ ] Track user feedback

### Analytics Setup
- [ ] Track eligibility checks
- [ ] Track consent rates
- [ ] Track game completions
- [ ] Track monetization triggers
- [ ] Track revenue attribution

---

## 📝 USAGE EXAMPLES

### Example 1: Adding to Chat Screen

```tsx
import TruthOrDareButton from '@/components/TruthOrDareButton';

function ChatScreen({ chat, currentUser }) {
  return (
    <View style={styles.container}>
      {/* Chat messages */}
      <MessageList messages={chat.messages} />
      
      {/* Micro-games section */}
      <View style={styles.gamesSection}>
        <TruthOrDareButton
          chatId={chat.id}
          currentUserId={currentUser.id}
          otherUserId={chat.otherUser.id}
          otherUserName={chat.otherUser.name}
          onVoiceCallSuggestion={() => router.push(`/calls/voice/${chat.id}`)}
          onVideoCallSuggestion={() => router.push(`/calls/video/${chat.id}`)}
          onCalendarEventSuggestion={() => router.push(`/calendar/create?chatId=${chat.id}`)}
        />
      </View>
    </View>
  );
}
```

### Example 2: Checking Eligibility Programmatically

```tsx
import { useTruthOrDare } from '@/hooks/useTruthOrDare';

function ChatHeader({ chatId, currentUserId, otherUserId }) {
  const { eligibility, checkEligibility } = useTruthOrDare({
    chatId,
    currentUserId,
    otherUserId,
  });
  
  useEffect(() => {
    checkEligibility();
  }, []);
  
  if (eligibility?.isEligible) {
    return <Badge text="🔥 Truth or Dare Available!" />;
  }
  
  return null;
}
```

---

## 🔮 FUTURE ENHANCEMENTS

### Potential Additions
1. **Custom Prompts**: Allow users to submit their own prompts (moderated)
2. **Achievement System**: Badges for completing X rounds
3. **Statistics**: Show chemistry score improvement over time
4. **Themed Prompt Packs**: Holiday/seasonal prompt collections
5. **Group Mode**: Truth or Dare with multiple participants

### Analytics Opportunities
1. Most popular prompt categories
2. Optimal intensity distribution
3. Best-performing monetization targets
4. Chemistry tier progression tracking

---

## 💡 DESIGN PRINCIPLES

### Why This Works

1. **Psychological Gating**: High requirements create premium feel
2. **Explicit Consent**: Reduces friction, increases trust
3. **Intensity Matching**: Prompts scale with relationship readiness
4. **Monetization Focus**: Every prompt drives specific revenue
5. **Safety First**: Multiple protections prevent abuse
6. **App Store Compliance**: Flirty but family-friendly

### What Makes It Premium

- Eligibility requirements filter casual users
- Consent mechanism creates exclusivity
- Intensity scaling rewards high chemistry
- Time limits create urgency
- Monetization integration drives revenue

---

**Implementation completed**: 2025-12-02  
**Pack Number**: 240  
**Feature Name**: Truth or Dare — Premium Mode  
**Status**: ✅ Ready for Production Integration