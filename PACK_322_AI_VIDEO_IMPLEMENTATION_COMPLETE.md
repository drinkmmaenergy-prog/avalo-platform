# ✅ PACK 322 — AI Video Sessions Implementation Complete

**Status**: ✅ COMPLETE  
**Date**: 2025-12-08  
**Dependencies**: PACK 279 (Foundation), 279A (AI Chat), 279B (AI Voice), 277 (Wallet), 321 (Context Types)

---

## 📋 Overview

PACK 322 implements AI Companion VIDEO CALLS with per-minute billing, VIP/Royal discounts, correct wallet logic, and full moderation & safety enforcement. This system is designed as a premium feature tier above voice calls, maintaining consistency with existing tokenomics while providing enhanced visual interaction.

### Key Features

✅ **Per-Minute Billing**: 20/14/10 tokens per minute (Standard/VIP/Royal)  
✅ **VIP/Royal Discounts**: ~30% and ~50% discounts respectively  
✅ **Correct Revenue Splits**: 65/35 for user-owned AI, 100% for Avalo AI  
✅ **Full Safety Enforcement**: Age gates, verification, blocking, moderation  
✅ **Wallet Integration**: Uses PACK 277/321 unified wallet system  
✅ **No Refunds**: Per-minute consumption is final (aligns with voice model)

---

## 🏗️ Architecture

### Data Model

#### Collection: `aiVideoCallSessions`

```typescript
{
  sessionId: string;          // Unique session identifier
  userId: string;             // Human user (video caller)
  companionId: string;        // AI companion ID
  ownerUserId: string | null; // Creator if user-owned, null if Avalo-owned
  isAvaloAI: boolean;         // True for platform AI, false for user-created
  
  tier: "STANDARD" | "VIP" | "ROYAL"; // User's subscription tier
  
  status: "PENDING" | "ACTIVE" | "ENDED" | "CANCELLED";
  
  startedAt: string | null;   // ISO timestamp when session started
  endedAt: string | null;     // ISO timestamp when session ended
  
  billedMinutes: number;      // Total minutes billed so far
  totalTokensCharged: number; // Total tokens charged for session
  
  contextRef: string;         // "aiVideo:<sessionId>" for wallet tracking
  createdAt: Timestamp;       // Firestore server timestamp
  updatedAt: Timestamp;       // Firestore server timestamp
}
```

---

## 💰 Pricing Structure

### Per-Minute Token Costs

| Tier | Tokens/Minute | Discount | PLN/Minute |
|------|--------------|----------|------------|
| **STANDARD** | 20 | 0% | 4.00 PLN |
| **VIP** | 14 | ~30% | 2.80 PLN |
| **ROYAL** | 10 | ~50% | 2.00 PLN |

*Based on payout rate: 1 token = 0.20 PLN*

### Comparison with Other AI Features

| Feature | Standard | VIP | Royal | Notes |
|---------|----------|-----|-------|-------|
| **AI Chat** | 100 tokens/11 words | 100 tokens/7 words | 100 tokens/7 words | Word buckets |
| **AI Voice** | 10 tokens/min | 7 tokens/min | 5 tokens/min | TTS audio |
| **AI Video** | 20 tokens/min | 14 tokens/min | 10 tokens/min | **Video + audio** |

**Rationale**: Video sessions cost 2x voice due to increased infrastructure and bandwidth requirements.

---

## 💸 Revenue Distribution

### User-Owned AI Companions (65/35 Split)

- **Creator Receives**: 65% of tokens charged
- **Avalo Platform**: 35% commission
- **Context Type**: `"AI_SESSION"` (same as chat/voice)
- **Wallet Source**: `"CALL"` (consistent with voice sessions)

### Avalo-Owned AI Companions (100% Avalo)

- **Creator Receives**: 0%
- **Avalo Platform**: 100% of tokens charged
- **Context Type**: `"AVALO_ONLY_VIDEO"` or reuse `"AVALO_ONLY_REVENUE"`
- **Wallet Source**: `"CALL"`

**No Changes to**:
- Payout rate (still 0.20 PLN / token)
- Human-to-human call pricing
- Chat word bucket logic
- Calendar/event splits
- Existing tokenomics

---

## 🔧 Implementation Files

### Backend (Firebase Functions)

#### 1. [`functions/src/pack322-ai-video-pricing.ts`](functions/src/pack322-ai-video-pricing.ts:1)
```typescript
export type AiVideoTier = "STANDARD" | "VIP" | "ROYAL";

export function getAiVideoPricePerMinuteTokens(tier: AiVideoTier): number {
  switch (tier) {
    case "STANDARD": return 20;
    case "VIP": return 14;
    case "ROYAL": return 10;
    default: return 20;
  }
}
```

**Purpose**: Centralized pricing logic with tier-based discounts

#### 2. [`functions/src/pack322-ai-video-runtime.ts`](functions/src/pack322-ai-video-runtime.ts:1)

**Exports**:
- [`pack322_aiVideoStartSession`](functions/src/pack322-ai-video-runtime.ts:191) - Start video session
- [`pack322_aiVideoTickBilling`](functions/src/pack322-ai-video-runtime.ts:455) - Per-minute billing tick
- [`pack322_aiVideoEndSession`](functions/src/pack322-ai-video-runtime.ts:475) - End session with final billing

**Key Features**:
- Age verification (18+)
- Identity verification required
- Ban/suspension checks
- Wallet review mode enforcement
- Automatic session termination on insufficient balance
- Final billing tick before session closure

#### 3. [`functions/src/index.ts`](functions/src/index.ts:4838) - Exports

```typescript
export { pack322_aiVideoStartSession };
export { pack322_aiVideoTickBilling };
export { pack322_aiVideoEndSession };
```

### Mobile Client (React Native)

#### 4. [`app-mobile/lib/ai/video.ts`](app-mobile/lib/ai/video.ts:1)

**Exports**:
- [`startAiVideoSession(companionId)`](app-mobile/lib/ai/video.ts:45)
- [`tickVideoBilling(sessionId)`](app-mobile/lib/ai/video.ts:69)
- [`endAiVideoSession(sessionId)`](app-mobile/lib/ai/video.ts:95)
- [`VideoSessionManager`](app-mobile/lib/ai/video.ts:167) class - Manages session lifecycle

**Usage Example**:
```typescript
import { VideoSessionManager } from '@/lib/ai/video';

const manager = new VideoSessionManager();

manager.setOnStateChange((state) => {
  console.log(`Elapsed: ${state.elapsedMinutes}min, Cost: ${state.totalTokensCharged} tokens`);
});

manager.setOnError((error, code) => {
  if (code === 'INSUFFICIENT_TOKENS') {
    // Prompt user to purchase tokens
  }
});

// Start session
const started = await manager.start(companionId);

// Session auto-bills every 60 seconds
// Client displays: elapsed time, estimated cost, tier discount

// End session
await manager.stop();
```

### Security & Database

#### 5. [`firestore-pack322-ai-video.rules`](firestore-pack322-ai-video.rules:1)

```
match /aiVideoCallSessions/{sessionId} {
  // Read: Session owner or AI companion owner
  allow read: if isOwner(resource.data.userId) || 
                 isOwner(resource.data.ownerUserId);
  
  // Create/Update/Delete: System only
  allow create, update, delete: if false;
}
```

**Security Features**:
- Only Cloud Functions can create/modify sessions
- Users can only read their own sessions
- AI creators can view analytics for their AI's sessions
- No direct client writes (prevents manipulation)

#### 6. [`firestore-pack322-ai-video.indexes.json`](firestore-pack322-ai-video.indexes.json:1)

**Indexes Created**:
- `userId + status + startedAt` (user session history)
- `companionId + status + startedAt` (companion analytics)
- `ownerUserId + status + startedAt` (creator earnings view)
- `status + startedAt` (active session queries)
- `userId + companionId + startedAt` (user-companion history)
- `isAvaloAI + status + startedAt` (platform analytics)
- `tier + startedAt` (tier-based analytics)

---

## 🔄 Session Flow

### 1. Start Session

```
Client → pack322_aiVideoStartSession({ userId, companionId })
         ↓
      [Safety Checks]
         - Age ≥ 18 ✓
         - Verified ✓
         - Not banned ✓
         - Wallet not in review ✓
         ↓
      [Load Companion]
         - Get ownerUserId, isAvaloAI
         ↓
      [Resolve Tier]
         - Check Royal membership
         - Check VIP subscription
         - Default to STANDARD
         ↓
      [Create Session]
         - status: "ACTIVE"
         - billedMinutes: 0
         - totalTokensCharged: 0
         ↓
      Return: {
        sessionId,
        pricePerMinuteTokens: 20/14/10,
        tier: "STANDARD"/"VIP"/"ROYAL"
      }
```

### 2. Per-Minute Billing

```
Timer (every 60s) → pack322_aiVideoTickBilling({ sessionId })
                    ↓
                 [Load Session]
                    ↓
                 [Calculate Minutes]
                    elapsedMs = now - startedAt
                    totalMinutes = floor(elapsedMs / 60000)
                    minutesToBill = totalMinutes - billedMinutes
                    ↓
                 [Calculate Tokens]
                    tokensToCharge = minutesToBill * pricePerMinute
                    ↓
                 [Determine Split]
                    if (isAvaloAI):
                      earnerUserId = undefined (100% Avalo)
                    else:
                      earnerUserId = ownerUserId (65/35 split)
                    ↓
                 [Charge via Wallet]
                    spendTokens({
                      userId,
                      amountTokens: tokensToCharge,
                      source: "CALL",
                      creatorId: earnerUserId,
                      metadata: { sessionType: "AI_VIDEO", ... }
                    })
                    ↓
                 If insufficient balance:
                    → End session
                    → Return INSUFFICIENT_TOKENS error
                 Else:
                    → Update billedMinutes
                    → Update totalTokensCharged
                    → Return success
```

### 3. End Session

```
Client → pack322_aiVideoEndSession({ sessionId, userId })
         ↓
      [Verify Ownership]
         session.userId === userId ✓
         ↓
      [Final Billing Tick]
         Call processTickBilling() to bill remaining minutes
         ↓
      [Close Session]
         status = "ENDED"
         endedAt = now
         ↓
      Return: {
        totalMinutes: billedMinutes,
        totalTokens: totalTokensCharged
      }
```

---

## 🛡️ Safety & Moderation

### Hard Gates (Pre-Session)

1. **Age Verification**: Must be 18+
2. **Identity Verification**: Must have verified account
3. **Account Status**: Cannot be banned or suspended
4. **Wallet Status**: Cannot be in review-only mode

### Runtime Enforcement

- **Automatic Session Termination**: If user runs out of tokens during session
- **No Partial Billing**: Only full minutes are billed (partial minutes not charged)
- **No Refunds**: Per-minute consumption is final (same policy as voice)
- **Content Moderation**: Can integrate with existing `aiSafetyReports` system

### Safety Integration Points

```typescript
// During session, if NSFW/illegal content detected:
await db.collection('aiSafetyReports').add({
  reporterId: 'system',
  companionId: session.companionId,
  sessionId: session.sessionId,
  type: 'AI_VIDEO',
  reason: 'NSFW_CONTENT',
  severity: 'HIGH',
  status: 'pending',
  createdAt: serverTimestamp(),
});

// Auto-terminate session
await db.collection('aiVideoCallSessions').doc(sessionId).update({
  status: 'ENDED',
  endReason: 'SAFETY_VIOLATION',
  endedAt: new Date().toISOString(),
});
```

---

## 🎯 Client Implementation Guide

### Basic Video Session UI

```typescript
import { VideoSessionManager } from '@/lib/ai/video';
import { useState, useEffect, useRef } from 'react';

export function AIVideoCall({ companionId }: { companionId: string }) {
  const [state, setState] = useState<VideoSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<VideoSessionManager>();

  useEffect(() => {
    const manager = new VideoSessionManager();
    managerRef.current = manager;

    manager.setOnStateChange((newState) => {
      setState(newState);
    });

    manager.setOnError((err, code) => {
      setError(err);
      if (code === 'INSUFFICIENT_TOKENS') {
        // Navigate to token store
        router.push('/wallet');
      }
    });

    return () => {
      manager.cleanup();
    };
  }, []);

  const startSession = async () => {
    const success = await managerRef.current?.start(companionId);
    if (!success) {
      setError('Failed to start video session');
    }
  };

  const endSession = async () => {
    await managerRef.current?.stop();
  };

  if (!state) return <Text>Initializing...</Text>;

  return (
    <View>
      {/* Video Display Area */}
      <VideoPlayer companionId={companionId} />
      
      {/* Session Info */}
      <View style={styles.sessionInfo}>
        <Text>Tier: {state.tier}</Text>
        <Text>Rate: {state.pricePerMinute} tokens/min</Text>
        <Text>Elapsed: {state.elapsedMinutes} min</Text>
        <Text>Cost: {state.totalTokensCharged} tokens</Text>
        <Text>Estimated: ~{state.elapsedMinutes * state.pricePerMinute} tokens</Text>
      </View>

      {/* Controls */}
      {!state.isActive ? (
        <Button title="Start Video Call" onPress={startSession} />
      ) : (
        <Button title="End Call" onPress={endSession} color="red" />
      )}

      {/* Error Display */}
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
    </View>
  );
}
```

### Pre-Session Cost Display

```typescript
import { getAiVideoPricePerMinuteTokens } from '@/lib/ai/video';

function VideoCallPreview({ tier, userBalance }: Props) {
  const pricePerMinute = getAiVideoPricePerMinuteTokens(tier);
  const estimatedCost10min = pricePerMinute * 10;
  const estimatedCost30min = pricePerMinute * 30;
  
  const canAfford10min = userBalance >= estimatedCost10min;
  const canAfford30min = userBalance >= estimatedCost30min;

  return (
    <View>
      <Text>Video Call Pricing</Text>
      <Text>Your tier: {tier}</Text>
      <Text>Rate: {pricePerMinute} tokens/minute</Text>
      
      <Text>Estimates:</Text>
      <Text style={canAfford10min ? styles.affordable : styles.notEnough}>
        10 min: {estimatedCost10min} tokens
      </Text>
      <Text style={canAfford30min ? styles.affordable : styles.notEnough}>
        30 min: {estimatedCost30min} tokens
      </Text>
      
      {!canAfford10min && (
        <Button title="Buy Tokens" onPress={() => router.push('/wallet')} />
      )}
    </View>
  );
}
```

---

## 🔌 Integration with Existing Systems

### Wallet Integration (PACK 277/321)

```typescript
// Revenue split for user-owned AI
await spendTokens({
  userId: session.userId,
  amountTokens: tokensToCharge,
  source: 'CALL',              // Existing source type
  relatedId: sessionId,
  creatorId: session.ownerUserId, // 65/35 split applied automatically
  metadata: {
    sessionId,
    companionId: session.companionId,
    isAvaloAI: session.isAvaloAI,
    minutesBilled: minutesToBill,
    tier: session.tier,
    pricePerMinute,
    contextRef: session.contextRef,
    sessionType: 'AI_VIDEO',  // Distinguish from voice
  },
});

// Revenue split for Avalo AI
await spendTokens({
  userId: session.userId,
  amountTokens: tokensToCharge,
  source: 'CALL',
  relatedId: sessionId,
  creatorId: undefined,       // 100% Avalo when undefined
  metadata: { ... },
});
```

### Safety System Integration

```typescript
// Uses existing safety infrastructure:
- getUserAge(userId)          // From PACK 279B
- isUserVerified(userId)      // From verification system
- isUserBanned(userId)        // From moderation system
- isWalletReviewOnly(userId)  // From PACK 277 wallet
```

### Moderation Integration

```typescript
// If inappropriate content detected during video:
await db.collection('aiSafetyReports').add({
  reporterId: 'system',
  companionId: session.companionId,
  sessionId: session.sessionId,
  type: 'AI_VIDEO',            // New report type
  reason: 'INAPPROPRIATE_CONTENT',
  severity: 'HIGH',
  status: 'pending',
  createdAt: serverTimestamp(),
});
```

---

## 📊 Analytics & Tracking

### Creator Analytics

```typescript
// Companion owners can track:
- Total video session count
- Total video minutes delivered
- Total tokens earned from video
- Average session duration
- User tier distribution (Standard/VIP/Royal)

// Query example:
const sessions = await db.collection('aiVideoCallSessions')
  .where('ownerUserId', '==', creatorId)
  .where('status', '==', 'ENDED')
  .orderBy('startedAt', 'desc')
  .limit(50)
  .get();
```

### Platform Analytics

```typescript
// Avalo can track:
- Total platform video sessions
- Revenue by tier (Standard/VIP/Royal)
- User-owned vs Avalo-owned AI split
- Average session duration
- Insufficient balance termination rate

// Query example:
const avaloSessions = await db.collection('aiVideoCallSessions')
  .where('isAvaloAI', '==', true)
  .where('status', '==', 'ENDED')
  .orderBy('startedAt', 'desc')
  .get();
```

---

## 🚀 Deployment Checklist

### 1. Firebase Functions
```bash
cd functions
npm run build
firebase deploy --only functions:pack322_aiVideoStartSession,functions:pack322_aiVideoTickBilling,functions:pack322_aiVideoEndSession
```

### 2. Firestore Security Rules
```bash
# Merge firestore-pack322-ai-video.rules into main firestore.rules
firebase deploy --only firestore:rules
```

### 3. Firestore Indexes
```bash
# Deploy indexes for aiVideoCallSessions collection
firebase deploy --only firestore:indexes
```

### 4. Mobile App
```bash
cd app-mobile
# Files already created in lib/ai/video.ts
# UI components can import and use
```

---

## 🧪 Testing Scenarios

### 1. Standard User Video Session

```typescript
// User: Standard tier, 500 token balance
// Expected: 20 tokens/min, session ends after 25 minutes

const session = await startAiVideoSession(companionId);
// session.pricePerMinuteTokens === 20
// session.tier === "STANDARD"

// After 25 minutes:
// - billedMinutes: 25
// - totalTokensCharged: 500
// - Session auto-ends with INSUFFICIENT_TOKENS
```

### 2. VIP User Video Session

```typescript
// User: VIP tier, 1000 token balance
// Expected: 14 tokens/min, can afford ~71 minutes

const session = await startAiVideoSession(companionId);
// session.pricePerMinuteTokens === 14
// session.tier === "VIP"

// After 30 minutes:
// - billedMinutes: 30
// - totalTokensCharged: 420 (14 * 30)
// - Balance remaining: 580 tokens
```

### 3. Royal User Video Session

```typescript
// User: Royal tier, 1000 token balance
// Expected: 10 tokens/min, can afford 100 minutes

const session = await startAiVideoSession(companionId);
// session.pricePerMinuteTokens === 10
// session.tier === "ROYAL"

// After 60 minutes:
// - billedMinutes: 60
// - totalTokensCharged: 600 (10 * 60)
// - Balance remaining: 400 tokens
```

### 4. User-Owned AI Revenue Split

```typescript
// Creator-owned AI, user pays 200 tokens (10 min @ 20 tokens/min)
// Expected: Creator gets 130 tokens (65%), Avalo gets 70 tokens (35%)

// After session ends:
const creatorWallet = await getWalletBalance(creatorId);
// creatorWallet.tokensBalance increased by 130
// creatorWallet.lifetimeEarnedTokens increased by 130

const platformRevenue = await db.collection('platformRevenue').doc('total').get();
// platformRevenue.totalRevenue increased by 70
```

### 5. Avalo AI Revenue Split

```typescript
// Avalo-owned AI, user pays 200 tokens (10 min @ 20 tokens/min)
// Expected: Avalo gets 200 tokens (100%), creator gets 0

// After session ends:
const platformRevenue = await db.collection('platformRevenue').doc('total').get();
// platformRevenue.totalRevenue increased by 200

// No creator wallet updated (earnerUserId = undefined)
```

### 6. Insufficient Balance During Session

```typescript
// User has 150 tokens, Standard tier (20 tokens/min)
// Session starts successfully
// After 7 minutes: 140 tokens spent, 10 remaining
// At 8th minute billing tick: Insufficient for next minute

const tickResult = await tickVideoBilling(sessionId);
// tickResult.success === false
// tickResult.errorCode === 'INSUFFICIENT_TOKENS'

// Session auto-terminated:
const session = await loadSession(sessionId);
// session.status === "ENDED"
// session.endReason === "INSUFFICIENT_TOKENS"
// session.billedMinutes === 7
// session.totalTokensCharged === 140
```

---

## 📈 Business Impact

### Revenue Potential

**Assumptions**:
- Average video session: 15 minutes
- User distribution: 70% Standard, 20% VIP, 10% Royal
- 1000 video sessions/day

**Daily Revenue**:
```
Standard: 700 sessions × 15 min × 20 tokens = 210,000 tokens
VIP:      200 sessions × 15 min × 14 tokens =  42,000 tokens
Royal:    100 sessions × 15 min × 10 tokens =  15,000 tokens
                                      TOTAL = 267,000 tokens/day
```

**Monthly Revenue** (30 days):
```
267,000 tokens/day × 30 = 8,010,000 tokens/month
8,010,000 tokens × 0.20 PLN = 1,602,000 PLN (~400,000 USD)
```

**Revenue Distribution** (assuming 50% user-owned AI):
```
User-owned AI (65/35 split on 50%):
  - Creators: 2,603,250 tokens × 0.20 = 520,650 PLN
  - Avalo:    1,401,750 tokens × 0.20 = 280,350 PLN

Avalo AI (100% on 50%):
  - Avalo:    4,005,000 tokens × 0.20 = 801,000 PLN

TOTAL AVALO: 280,350 + 801,000 = 1,081,350 PLN/month (~270,000 USD)
```

### User Value Proposition

**For Standard Users**:
- 20 tokens/min = 4.00 PLN/min
- 10-minute call = 40 PLN (~10 USD)
- Comparable to premium video call services

**For VIP Users** (~30% discount):
- 14 tokens/min = 2.80 PLN/min
- 10-minute call = 28 PLN (~7 USD)
- Incentivizes subscription upgrade

**For Royal Users** (~50% discount):
- 10 tokens/min = 2.00 PLN/min
- 10-minute call = 20 PLN (~5 USD)
- Premium benefit for high-value users

---

## 📱 UI/UX Recommendations

### Before Session Starts

```
┌─────────────────────────────────────┐
│  AI Video Call with [Companion]     │
├─────────────────────────────────────┤
│  Your Tier: VIP ⭐                   │
│  Rate: 14 tokens/min (30% OFF)      │
│                                      │
│  Your Balance: 1,000 tokens          │
│                                      │
│  Estimated Costs:                    │
│  • 10 min: 140 tokens ✓              │
│  • 30 min: 420 tokens ✓              │
│  • 60 min: 840 tokens ✓              │
│                                      │
│  [Start Video Call]                  │
│  [Buy More Tokens]                   │
└─────────────────────────────────────┘
```

### During Session

```
┌─────────────────────────────────────┐
│  🎥 AI Video Call - LIVE            │
├─────────────────────────────────────┤
│  [Video Display Area]                │
│  [Companion Avatar/Camera]           │
│                                      │
├─────────────────────────────────────┤
│  ⏱️  12:34 elapsed                   │
│  💰 168 tokens spent (14/min)        │
│  💳 Balance: 832 tokens remaining    │
│                                      │
│  [End Call] 🔴                       │
└─────────────────────────────────────┘
```

### After Session Ends

```
┌─────────────────────────────────────┐
│  Video Call Summary                  │
├─────────────────────────────────────┤
│  Duration: 15 minutes                │
│  Rate: 14 tokens/min (VIP)           │
│  Total Cost: 210 tokens              │
│                                      │
│  New Balance: 790 tokens             │
│                                      │
│  [Start Another Call]                │
│  [Back to Chat]                      │
└─────────────────────────────────────┘
```

### Insufficient Balance Prompt

```
┌─────────────────────────────────────┐
│  ⚠️ Insufficient Tokens              │
├─────────────────────────────────────┤
│  Your video call has ended because   │
│  you ran out of tokens.              │
│                                      │
│  Session Duration: 12 minutes        │
│  Tokens Spent: 240                   │
│                                      │
│  To continue video calls with AI     │
│  companions, please purchase more    │
│  tokens.                             │
│                                      │
│  [Buy Tokens Now]                    │
│  [Back to Companion Profile]         │
└─────────────────────────────────────┘
```

---

## 🔍 Monitoring & Metrics

### Key Metrics to Track

1. **Session Metrics**:
   - Total video sessions per day
   - Average session duration
   - Session completion rate
   - Insufficient balance termination rate

2. **Revenue Metrics**:
   - Total tokens spent on video
   - Revenue by tier (Standard/VIP/Royal)
   - User-owned vs Avalo-owned AI split
   - Average revenue per session

3. **User Metrics**:
   - Unique users per day
   - Session frequency per user
   - Tier distribution over time
   - Conversion from voice to video

4. **Creator Metrics**:
   - Top earning AI companions
   - Average earnings per session
   - Session count by companion
   - Creator retention rate

### Alerting Thresholds

- **High Insufficient Balance Rate** (>30%): May indicate pricing is too high
- **Low Session Duration** (<5 min avg): May indicate quality issues
- **High Safety Reports** (>5% of sessions): Moderation needed
- **Low Tier Upgrade Rate** (<2%): VIP/Royal value proposition unclear

---

## 🛠️ Maintenance & Operations

### Daily Operations

1. **Monitor active sessions**: Check for stale sessions (>2 hours active)
2. **Review safety reports**: Process any AI_VIDEO safety incidents
3. **Track revenue**: Compare actual vs projected video revenue
4. **Check billing accuracy**: Verify no double-billing or missed billing

### Weekly Operations

1. **Analyze tier distribution**: Track Standard/VIP/Royal adoption
2. **Review creator earnings**: Ensure top AI creators are compensated fairly
3. **Optimize pricing**: Adjust if conversion rates are too low/high
4. **Update moderation**: Refine safety detection for video content

### Monthly Operations

1. **Generate revenue reports**: Total video revenue vs other features
2. **Creator payout processing**: Process payouts for AI companion creators
3. **Feature usage analysis**: Video adoption vs voice vs chat
4. **Pricing optimization**: Consider tier pricing adjustments

---

## ⚠️ Known Limitations

1. **No Partial Minute Billing**: Only full minutes are billed (0-59 seconds free)
2. **No Refunds**: Per-minute consumption is final (business model)
3. **No Session Pause**: Sessions cannot be paused and resumed
4. **Single Active Session**: User can only have one active video session at a time
5. **Platform Dependency**: Requires compatible video streaming infrastructure

---

## 🔮 Future Enhancements (Out of Scope for PACK 322)

1. **Group Video Sessions**: Multiple users in one AI video room
2. **Video Recording**: Save video session highlights (paid feature)
3. **Screen Sharing**: AI can display content during video
4. **AR Filters**: Real-time filters on AI video feed
5. **Video Gifts**: Send animated gifts during video calls
6. **Session Scheduling**: Pre-book video sessions with AI
7. **Video Challenges**: AI-led video challenges with rewards

---

## 📝 Migration & Rollout Strategy

### Phase 1: Soft Launch (Week 1-2)

- Enable for Royal users only
- Monitor for issues
- Collect feedback
- Optimize pricing if needed

### Phase 2: VIP Expansion (Week 3-4)

- Enable for VIP users
- Compare usage between Royal and VIP
- Adjust discounts if conversion is low

### Phase 3: General Availability (Week 5+)

- Enable for all verified 18+ users
- Full marketing push
- Monitor scalability
- Track revenue impact

---

## ✅ Checklist

### Implementation Complete

- [x] Pricing helper with tier-based discounts
- [x] Start session callable with safety gates
- [x] Per-minute billing tick function
- [x] End session callable with final billing
- [x] Wallet integration via PACK 277/321
- [x] Mobile client wrapper functions
- [x] VideoSessionManager class for easy integration
- [x] Firestore security rules
- [x] Firestore indexes for performance
- [x] Exports in functions/src/index.ts

### Ready for Deployment

- [x] All TypeScript files compile without errors
- [x] Security rules prevent client manipulation
- [x] Revenue splits are correct (65/35 and 100%)
- [x] Payout rate unchanged (0.20 PLN/token)
- [x] No impact on existing chat/voice/call systems
- [x] Safety enforcement matches PACK 279B standards

### Documentation Complete

- [x] Implementation summary
- [x] Architecture diagram
- [x] Pricing structure
- [x] Revenue model
- [x] Integration guide
- [x] Testing scenarios
- [x] UI/UX recommendations
- [x] Monitoring metrics
- [x] Deployment steps

---

## 📞 Support & Contact

For questions about PACK 322 implementation:

- **Technical Issues**: Check [`pack322-ai-video-runtime.ts`](functions/src/pack322-ai-video-runtime.ts:1)
- **Pricing Questions**: See [`pack322-ai-video-pricing.ts`](functions/src/pack322-ai-video-pricing.ts:1)
- **Mobile Integration**: Reference [`app-mobile/lib/ai/video.ts`](app-mobile/lib/ai/video.ts:1)
- **Security Rules**: Review [`firestore-pack322-ai-video.rules`](firestore-pack322-ai-video.rules:1)

---

## 🎉 Summary

PACK 322 successfully implements AI Video Sessions as a premium tier above voice calls, with:

✅ **Higher Pricing**: 20/14/10 tokens/min (2x voice) reflecting infrastructure costs  
✅ **Same Discounts**: VIP and Royal tiers get meaningful savings  
✅ **Correct Splits**: 65/35 for creators, 100% for Avalo AI  
✅ **Full Safety**: Age, verification, moderation all enforced  
✅ **Wallet Integration**: Seamless integration with existing wallet system  
✅ **No Tokenomics Changes**: Payout rate, splits, and existing systems untouched  

The system is production-ready and can be deployed independently without affecting existing features.

---

**Implementation Date**: 2025-12-08  
**Pack Version**: 322  
**Status**: ✅ COMPLETE AND READY FOR DEPLOYMENT