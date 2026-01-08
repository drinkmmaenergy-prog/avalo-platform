# PACK 239: Two Truths & One Lie Chat Micro-Game - Implementation Complete

## ✅ IMPLEMENTATION STATUS: COMPLETE

All components of Pack 239 have been successfully implemented and are ready for integration.

---

## 📋 OVERVIEW

Pack 239 implements a gamified flirting mini-game embedded inside paid chat to increase excitement, session duration, and emotional connection, directly increasing paid word count, calls, and meetings.

### Key Features:
- **In-Chat Mini-Game**: "Two Truths & One Lie" game that runs entirely within the chat interface
- **Flirting-Optimized Topics**: 6 preset topics designed to encourage romantic engagement
- **Chemistry Detection**: Automatic spark theme unlocking based on correct guesses
- **Monetization Triggers**: Strategic suggestions for voice/video calls, gifts, and calendar events
- **Safety-First Design**: Auto-disabled during Sleep Mode, Breakup Recovery, and safety flags
- **Zero Free Rewards**: Pure engagement amplification without altering tokenomics

---

## 🏗️ IMPLEMENTATION FILES

### 1. Firestore Security Rules
**File**: `firestore-pack239-microgames.rules`
- Per-chat game state management
- Safety flag enforcement
- User settings isolation
- Chat-specific blocking
- Spark theme cosmetic-only access

### 2. Firestore Indexes
**File**: `firestore-pack239-microgames.indexes.json`
- Query optimization for active games
- Game type filtering
- Player participation lookup
- Spark theme expiration tracking

### 3. TypeScript Types
**File**: `app-mobile/types/microGames.ts`
- Complete type definitions for game system
- Helper functions for chemistry detection
- Monetization trigger conditions
- Safety validation logic

### 4. Game State Hook
**File**: `app-mobile/hooks/useMicroGame.ts`
- Real-time game state synchronization
- Automatic safety checks
- Spark theme monitoring
- Complete lifecycle management
- Monetization tracking

### 5. Main Game Component
**File**: `app-mobile/app/components/TwoTruthsOneLie.tsx`
- Full game UI with all states
- Topic selection interface
- Statement input with lie selector
- Guess interface
- Reveal screens with animations
- Spark theme effects

### 6. Chat Integration
**File**: `app-mobile/app/components/MicroGameButton.tsx`
- Launch button for chat interface
- Compact variant for toolbars
- Modal presentation

### 7. Monetization Components
**File**: `app-mobile/app/components/MonetizationSuggestion.tsx`
- Voice/video call suggestions
- Calendar event prompts
- Gift suggestions
- Modal and inline variants

### 8. Settings Screen
**File**: `app-mobile/app/profile/settings/microGames.tsx`
- Global enable/disable
- Auto-accept preferences
- Per-chat blocking
- Safety information

---

## 🎮 GAME FLOW

1. **Initiation**: User clicks "Play Micro-Game" → safety checks → game created
2. **Player A Turn**: Writes 3 statements, marks 1 as lie → submits
3. **Player B Guess**: Sees statements → taps suspected lie
4. **Reveal**: Shows correct/incorrect → updates chemistry → triggers monetization
5. **Role Switch**: Player B writes statements, Player A guesses
6. **Completion**: Final stats → memory log generation → back to chat

---

## 🔥 SPARK THEME SYSTEM

### Unlock Criteria
Both players guess correctly **twice in a row**

### What It Is
- **Cosmetic Only**: Special visual chat theme (24-hour duration)
- **No Economic Benefit**: Purely psychological engagement
- **Effects**: Gradient borders, sparkle animations, gold accents

---

## 🥵 FLIRTING-OPTIMIZED TOPICS

| Topic | Flirt Level |
|-------|-------------|
| Things you do when you like someone | Medium |
| Unexpected habits | Mild |
| Moments you'll never forget | Medium |
| Guilty pleasures | Medium |
| What makes you attracted to someone | Spicy |
| Things that make you blush | Spicy |

All topics are **App Store compliant** and **dating-conducive**.

---

## 🚀 MONETIZATION MECHANICS

### Revenue Triggers (NO FREE TOKENS)

| Game Stage | Monetization Impact |
|------------|-------------------|
| Statement Round | Increased paid word count |
| Reaction Reveal | Gift suggestions (micro-gifts) |
| After Guessing | Voice call suggestion (10 tokens/min) |
| Sparks Detected | Video call CTA (20 tokens/min) |
| Strong Chemistry | Calendar booking suggestion |

### Economics Unchanged
- Chat Price: 100-500 tokens (unchanged)
- Word Billing: 11/7 words per token (unchanged)
- Split: 65/35 earner/platform (unchanged)
- Call Pricing: 10/20 tokens per minute (unchanged)

**Pure UX-level revenue amplification.**

---

## 🔐 SAFETY SYSTEM

### Auto-Disable Conditions

Micro-games **CANNOT trigger** if:
1. Sleep Mode active
2. Breakup Recovery active
3. Safety flag between users
4. Underage suspicion
5. Stalker risk detected

Safety checks enforced at both runtime and database level.

---

## 📊 FIRESTORE DATA STRUCTURE

### Game Document: `/chats/{chatId}/microGames/{gameId}`

```typescript
{
  gameId: string
  chatId: string
  gameType: 'twoTruthsOneLie'
  status: 'idle' | 'active' | 'waitingForGuess' | 'revealing' | 'complete'
  participants: [userId1, userId2]
  currentPlayerId: string
  roundCount: number
  rounds: PlayerRound[]
  correctGuessStreak: number
  sparkThemeUnlocked: boolean
  voiceCallSuggested: boolean
  videoCallSuggested: boolean
  calendarEventSuggested: boolean
  createdAt: Timestamp
  completedAt?: Timestamp
}
```

### Spark Theme: `/chats/{chatId}/sparkTheme/active`

```typescript
{
  chatId: string
  unlockedAt: Timestamp
  expiresAt: Timestamp // 24 hours
  isActive: boolean
  themeStyle: {
    gradient: string[]
    accentColor: string
    effectName: 'sparkles' | 'hearts' | 'fire'
  }
}
```

---

## 🛠️ INTEGRATION GUIDE

### Step 1: Add to Chat Interface

```tsx
import MicroGameButton from './components/MicroGameButton';

<MicroGameButton
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

### Step 2: Handle Monetization Callbacks

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

### Step 3: Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## 🧪 TESTING CHECKLIST

### Functional Tests
- [ ] Game initiation from chat
- [ ] Safety checks block when appropriate
- [ ] Statement submission with topics
- [ ] Guess submission and correctness
- [ ] Spark theme unlock at 2+ streak
- [ ] Monetization triggers at correct times
- [ ] Memory log generation
- [ ] Game completion

### Settings Tests
- [ ] Enable/disable globally
- [ ] Auto-accept toggle
- [ ] Per-chat blocking

### Safety Tests
- [ ] Sleep mode blocks game
- [ ] Breakup recovery blocks game
- [ ] Safety flags block game

### Monetization Tests
- [ ] Voice call suggestion timing
- [ ] Video call suggestion on chemistry
- [ ] Calendar suggestion on completion
- [ ] All show correct pricing
- [ ] No free tokens offered

---

## 📦 FILES CREATED

1. `firestore-pack239-microgames.rules` - Security rules
2. `firestore-pack239-microgames.indexes.json` - Query indexes
3. `app-mobile/types/microGames.ts` - Type definitions
4. `app-mobile/hooks/useMicroGame.ts` - State management hook
5. `app-mobile/app/components/TwoTruthsOneLie.tsx` - Main game component
6. `app-mobile/app/components/MicroGameButton.tsx` - Chat integration
7. `app-mobile/app/components/MonetizationSuggestion.tsx` - Suggestion prompts
8. `app-mobile/app/profile/settings/microGames.tsx` - Settings screen

**All functionality is additive and opt-in. No modifications to existing files.**

---

## ✅ CONFIRMATION STRING

```
PACK 239 COMPLETE — Two Truths & One Lie micro-game implemented. Gamified flirting system that increases paid chat duration and conversion to calls/meetings without altering tokenomics or giving free rewards.
```

---

## 🎯 SUCCESS METRICS

Track post-launch:

### Engagement
- Average chat session duration
- Word count per session
- Game completion rate

### Monetization
- Voice/video call conversions from suggestions
- Calendar bookings from games
- Additional tokens consumed during sessions

### Chemistry
- Spark theme unlock rate
- Memory log generation rate
- Overall correct guess rate

---

## 🚀 NEXT STEPS

1. **Integration**: Add MicroGameButton to chat interface
2. **Testing**: Run through testing checklist
3. **Deploy**: Push Firestore rules and indexes
4. **Monitor**: Track analytics for first 7 days
5. **Iterate**: Based on user feedback and metrics

---

**Implementation completed**: 2025-12-02  
**Pack Number**: 239  
**Feature Name**: Two Truths & One Lie Chat Micro-Game  
**Status**: ✅ Ready for Production Integration