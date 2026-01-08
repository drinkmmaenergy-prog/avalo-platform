# PACK 279B — AI Voice Sessions (TTS) + Minute Billing & VIP/Royal Discounts

## Implementation Complete ✅

### Overview
PACK 279B adds AI companion voice sessions with per-minute billing, VIP/Royal discounts, and correct revenue splits. Built on PACK 279/279A (AI Chat) and PACK 277/321 (Wallet).

### Pricing Structure
- **STANDARD**: 10 tokens/minute (full price)
- **VIP**: 7 tokens/minute (30% discount)
- **ROYAL**: 5 tokens/minute (50% discount)

### Revenue Splits
- **User-owned AI**: 65/35 split (creator/Avalo)
- **Avalo-owned AI**: 100% Avalo

---

## 📁 Files Created

### 1. Backend: Pricing Helper
**File**: [`functions/src/pack279-ai-voice-pricing.ts`](functions/src/pack279-ai-voice-pricing.ts)

Functions:
- `getAiVoicePricePerMinuteTokens(tier)` - Returns tokens/minute
- `calculateVoiceTokens(minutes, tier)` - Calculates total cost

### 2. Backend: Voice Runtime
**File**: [`functions/src/pack279-ai-voice-runtime.ts`](functions/src/pack279-ai-voice-runtime.ts)

Functions:
- `pack279_aiVoiceStartSession()` - Creates session, resolves tier, returns pricing
- `pack279_aiVoiceTickBilling()` - Bills elapsed minutes every 60s
- `pack279_aiVoiceEndSession()` - Final billing + closes session

Safety gates: 18+, verified, not banned, not in wallet review mode

### 3. Backend: TTS Adapter
**File**: [`functions/src/services/aiTtsProvider.service.ts`](functions/src/services/aiTtsProvider.service.ts)

Functions:
- `synthesizeAiSpeech(text, voiceId, language)` - Generates audio, uploads to Storage
- `cleanupOldAudioFiles(hours)` - Removes old audio files

Supports: OpenAI, ElevenLabs, Google Cloud TTS

### 4. Mobile: Voice Session Wrapper
**File**: [`app-mobile/lib/ai/voice.ts`](app-mobile/lib/ai/voice.ts)

Functions:
- `startAiVoiceSession(companionId)` - Starts session
- `tickVoiceBilling(sessionId)` - Bills current session
- `endAiVoiceSession(sessionId)` - Ends session

Class:
- `VoiceSessionManager` - Automatic billing timer, state management, error handling

### 5. Backend: Main Exports
**File**: [`functions/src/index.ts`](functions/src/index.ts:4793)

Lines 4793-4830: PACK 279B function exports

---

## 🗄️ Data Model

### Collection: `aiVoiceCallSessions`
```typescript
{
  sessionId: string;
  userId: string;
  companionId: string;
  ownerUserId: string | null;
  isAvaloAI: boolean;
  tier: "STANDARD" | "VIP" | "ROYAL";
  status: "PENDING" | "ACTIVE" | "ENDED" | "CANCELLED";
  startedAt: string | null;
  endedAt: string | null;
  billedMinutes: number;
  totalTokensCharged: number;
  contextRef: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 💰 Wallet Integration

### Transaction Flow
1. User starts session → No charge
2. Every 60s → Bill for elapsed minutes
3. Use `source: 'CALL'` for wallet transactions
4. User-owned AI → `creatorId: ownerUserId` (65/35 split)
5. Avalo AI → `creatorId: undefined` (100% Avalo)
6. Insufficient balance → End session with error
7. End session → Final billing tick

### Revenue Split Integration
```typescript
// User-owned AI (65/35)
await spendTokens({
  userId,
  amountTokens,
  source: 'CALL',
  relatedId: sessionId,
  creatorId: ownerUserId,  // 65% to creator
  metadata: { isAvaloAI: false, ... }
});

// Avalo AI (100%)
await spendTokens({
  userId,
  amountTokens,
  source: 'CALL',
  relatedId: sessionId,
  creatorId: undefined,  // 100% to Avalo
  metadata: { isAvaloAI: true, ... }
});
```

---

## 🔐 Safety & Rules

### Entry Gates
- Age 18+ required
- Account verification required
- Not banned
- Not in wallet review mode

### Billing Rules
- Only full elapsed minutes are billed
- No partial minutes charged
- Final billing on session end
- Insufficient balance ends session immediately

### No Changes To
- ❌ Payout rate (still 0.20 PLN/token)
- ❌ Text chat billing (PACK 279A unchanged)
- ❌ Human-to-human calls
- ❌ Calendar/events splits
- ❌ Any existing revenue splits

---

## 📊 Usage Example

### Mobile Implementation
```typescript
import { VoiceSessionManager, formatPriceDisplay } from '@/lib/ai/voice';

const manager = new VoiceSessionManager();

// Setup callbacks
manager.setOnStateChange((state) => {
  console.log(`Minutes: ${state.elapsedMinutes}, Tokens: ${state.totalTokensCharged}`);
});

manager.setOnError((error, code) => {
  if (code === 'INSUFFICIENT_TOKENS') {
    // Show "add tokens" dialog
  }
});

// Start session
await manager.start(companionId);

// Manager auto-handles:
// - Billing every 60s
// - State updates
// - Insufficient tokens
// - Error handling

// Stop session
await manager.stop();
manager.cleanup();
```

---

## 🚀 Deployment Steps

### 1. Backend Deployment
```bash
cd functions
npm run deploy
```

### 2. Environment Variables
```bash
firebase functions:config:set tts.provider="openai"
firebase functions:config:set tts.api_key="sk-..."
```

### 3. Firestore Indexes
Create index on `aiVoiceCallSessions`:
- userId (ASC) + status (ASC) + startedAt (DESC)

### 4. TTS Provider Setup
Choose provider and configure:
- **OpenAI**: tts-1 model, alloy/nova/shimmer/echo/fable/onyx voices
- **ElevenLabs**: Custom voice IDs
- **Google**: Multi-language support

### 5. Storage Bucket
Ensure bucket has CORS configured for audio playback

---

## ✅ Verification Checklist

- [x] Pricing helper created
- [x] Voice runtime functions implemented
- [x] TTS adapter created
- [x] Mobile wrapper created
- [x] Main exports added
- [x] Safety gates implemented
- [x] Wallet integration correct
- [x] Revenue splits correct
- [x] Documentation complete

---

## 🎯 Key Features

1. **Per-Minute Billing**: Only charge for actual usage
2. **Tier Discounts**: VIP 30% off, Royal 50% off
3. **Correct Splits**: 65/35 user AI, 100% Avalo AI
4. **Graceful Failure**: Low balance ends session smoothly
5. **Provider Agnostic**: Easy to switch TTS providers
6. **Safety First**: All standard gates enforced

---

**Status**: ✅ COMPLETE  
**Date**: 2025-12-08  
**Pack**: 279B  
**Dependencies**: 277, 279, 279A, 321, 50, 107