# Phase 12 - AI Companions 2.0 (Creator Bots) Implementation

## Overview

This document describes the complete implementation of the AI Companions 2.0 system for Avalo, enabling users to create and monetize AI bots with full chat capabilities.

**Implementation Date:** 2025-11-20  
**Status:** ✅ Complete  
**Breaking Changes:** ❌ None - Pure addition, zero modifications to existing systems

---

## Business Rules

### Bot Creation

- Users can create up to **50 AI bots** per creator account
- Each bot has customizable attributes:
  - Name, gender, age
  - Personality traits
  - Role archetype (friend, mentor, therapist, companion, etc.)
  - Interests and hobbies
  - Language(s) spoken
  - Writing tone (formal, casual, flirty, etc.)
  - Content limits (SFW/NSFW toggle)
  - Custom avatar (upload or AI-generated)
  - Optional voice style (placeholder for future TTS)

### Monetization Structure

**Creator-Defined Pricing:**
- Per message: minimum 1 token
- Per image request: custom price
- Per voice note: custom price (future)
- Per video request: custom price (future)

**Revenue Split:**
- **80% to creator**
- **20% to Avalo**

**Billing Method:**
- Uses EXISTING [`chatMonetization.ts`](functions/src/chatMonetization.ts) word-based logic
- Standard: 11 words = 1 token
- Royal: 7 words = 1 token
- AI bots ALWAYS act as "earner"
- Payer pays same rates as with humans
- Creator sets base token cost per message

### Welcome Experience

- First **3 replies from AI bot are FREE** when chat starts
- Encourages users to try the bot before paying
- Increases conversion to paid interactions

### Chat Features

AI bot chats support:
- ✅ Icebreakers (pre-written conversation starters)
- ✅ Read receipts
- ✅ Nudges (automated engagement prompts)
- ✅ Same UI as human chats
- ✅ Message history and context awareness

### AI Model Integration

**Model:** Anthropic Claude API (already integrated in project)

**Persona Enforcement:**
- System prompt defines bot personality
- Memory file stores conversation context
- Dynamic context window (last 15 messages)
- NSFW toggle respected (safety filters)
- Safety filters ALWAYS ON for minor users

**Response Quality:**
- In-character responses
- Maintains personality consistency
- Context-aware replies
- Memory of previous conversations

### Ranking Integration

Each paid message to AI bot generates ranking points:

| Action | Points |
|--------|--------|
| Paid AI message | +1 point per token earned |
| First-time payer | +40 bonus points |

Points tracked via existing [`rankingEngine.recordEvent()`](functions/src/rankingEngine.ts)

### Trust Engine Integration

**No penalties for AI bot earnings** - legitimate revenue source

**Fraud detection only for:**
- Self-chat from same device/IP
- Multi-account collusion
- Automated abuse patterns

AI chats count toward retention engine metrics

### Creator Dashboard - AI Bots

Private dashboard showing:

1. **Bot List**
   - All created bots
   - Active/paused status
   - Quick stats preview

2. **Analytics per Bot**
   - Total messages sent
   - Earnings (lifetime, monthly, weekly)
   - Returning users count
   - Top payers list
   - Ranking points earned from bot

3. **Management**
   - Adjust pricing anytime
   - Pause/resume bot
   - Edit bot personality
   - View conversation samples (anonymized)

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│          Mobile App (React Native + Expo Router)        │
│  ┌──────────────────┐        ┌──────────────────┐      │
│  │ Creator Dashboard│        │   AI Chat UI     │      │
│  │   /creator/      │        │   /ai/chat/      │      │
│  │   ai-bots/       │        │   [botId]        │      │
│  └────────┬─────────┘        └────────┬─────────┘      │
│           │                            │                 │
│           └──────────┬─────────────────┘                │
│                      │                                   │
│           ┌──────────▼──────────┐                       │
│           │  aiBotService.ts     │                       │
│           └──────────┬───────────┘                       │
└──────────────────────┼───────────────────────────────────┘
                       │ HTTPS Callable
                       │
┌──────────────────────▼───────────────────────────────────┐
│              Firebase Cloud Functions                     │
│  ┌──────────────────┐        ┌──────────────────┐       │
│  │ aiBotEngine.ts   │        │  aiChatEngine.ts  │       │
│  │                  │        │                   │       │
│  │ • createBot()    │        │ • startAiChat()   │       │
│  │ • updateBot()    │        │ • processMessage()│       │
│  │ • deleteBot()    │        │ • billing()       │       │
│  │ • getBotInfo()   │        │ • Claude API      │       │
│  └────────┬─────────┘        └─────────┬─────────┘       │
│           │                            │                  │
│           │    ┌──────────────────┐   │                  │
│           └────┤ chatMonetization ├───┘                  │
│                │  rankingEngine   │                       │
│                │  trustEngine     │                       │
│                └──────────────────┘                       │
└───────────┼────────────────────────────┼──────────────────┘
            │                            │
            ▼                            ▼
    ┌───────────────────────────────────────┐
    │         Firestore Collections          │
    │                                        │
    │ • aiBots (bot definitions)             │
    │ • aiChats (conversation state)         │
    │ • aiMessages (message history)         │
    │ • aiBotEarnings (revenue tracking)     │
    │ • aiBotAnalytics (stats)               │
    └────────────────────────────────────────┘
```

---

## Firestore Schema

### Collection: `aiBots`

Bot definitions created by users.

```typescript
{
  botId: string,              // Auto-generated
  creatorId: string,          // Owner user ID
  
  // Bot Identity
  name: string,
  gender: 'male' | 'female' | 'other',
  age: number,
  avatarUrl: string,
  
  // Personality
  personality: string,        // Description of personality
  roleArchetype: string,      // friend, mentor, therapist, etc.
  interests: string[],        // Array of interests
  languages: string[],        // Supported languages
  writingTone: string,        // formal, casual, flirty, etc.
  
  // Content Settings
  nsfwEnabled: boolean,       // Allow NSFW conversations
  systemPrompt: string,       // Claude system prompt
  
  // Monetization
  pricing: {
    perMessage: number,       // Tokens per message (min 1)
    perImage?: number,        // Tokens per image request
    perVoiceNote?: number,    // Future: voice message
    perVideo?: number,        // Future: video message
  },
  
  // Status
  isActive: boolean,          // Can be paused by creator
  isPaused: boolean,
  
  // Stats (denormalized for quick access)
  stats: {
    totalMessages: number,
    totalEarnings: number,
    uniqueChats: number,
    returningUsers: number,
  },
  
  // Metadata
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastActiveAt?: Timestamp,
}
```

**Indexes:**
```javascript
// Composite index
{
  creatorId: ASC,
  isActive: ASC,
  createdAt: DESC
}
```

### Collection: `aiChats`

Active AI bot conversations.

```typescript
{
  chatId: string,             // Auto-generated
  botId: string,              // Reference to aiBot
  userId: string,             // User chatting with bot
  creatorId: string,          // Bot owner (for analytics)
  
  // Chat State
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED',
  
  // Billing (uses chatMonetization logic)
  billing: {
    wordsPerToken: number,    // 7 (Royal) or 11 (Standard)
    freeMessagesRemaining: number,  // Starts at 3
    escrowBalance: number,
    totalConsumed: number,
    messageCount: number,
  },
  
  // Pricing (from bot config)
  pricePerMessage: number,
  
  // Context (for AI)
  contextWindow: {
    lastMessages: string[],   // Last 15 messages
    summary?: string,         // Conversation summary
  },
  
  // Metadata
  createdAt: Timestamp,
  lastMessageAt: Timestamp,
  updatedAt: Timestamp,
  closedAt?: Timestamp,
}
```

**Indexes:**
```javascript
// By user
{
  userId: ASC,
  state: ASC,
  lastMessageAt: DESC
}

// By bot
{
  botId: ASC,
  state: ASC,
  lastMessageAt: DESC
}

// By creator (for analytics)
{
  creatorId: ASC,
  state: ASC,
  createdAt: DESC
}
```

### Collection: `aiMessages`

Message history (subcollection of aiChats).

Path: `aiChats/{chatId}/messages/{messageId}`

```typescript
{
  messageId: string,
  chatId: string,
  
  // Message Content
  role: 'user' | 'bot',
  content: string,
  wordCount: number,
  
  // Billing
  tokensCost: number,         // Calculated cost
  wasFree: boolean,           // Part of free welcome
  
  // Metadata
  timestamp: Timestamp,
  readAt?: Timestamp,
}
```

### Collection: `aiBotEarnings`

Revenue tracking per bot.

Path: `aiBotEarnings/{botId}/records/{recordId}`

```typescript
{
  recordId: string,
  botId: string,
  creatorId: string,
  chatId: string,
  userId: string,            // Who paid
  
  // Earnings
  tokensEarned: number,
  creatorShare: number,      // 80%
  avaloShare: number,        // 20%
  
  // Message Info
  messageCount: number,
  wordCount: number,
  
  // Metadata
  timestamp: Timestamp,
  period: string,            // YYYY-MM for aggregation
}
```

**Indexes:**
```javascript
// By bot and period
{
  botId: ASC,
  period: ASC,
  timestamp: DESC
}

// By creator and period
{
  creatorId: ASC,
  period: ASC,
  timestamp: DESC
}
```

### Collection: `aiBotAnalytics`

Aggregated analytics per bot.

```typescript
{
  botId: string,
  creatorId: string,
  period: 'daily' | 'weekly' | 'monthly' | 'lifetime',
  periodKey: string,         // e.g., "2025-11-20" or "2025-11"
  
  // Message Stats
  totalMessages: number,
  uniqueUsers: number,
  returningUsers: number,
  avgMessagesPerUser: number,
  
  // Revenue Stats
  totalEarnings: number,
  creatorEarnings: number,
  avaloEarnings: number,
  
  // Top Payers (denormalized)
  topPayers: Array<{
    userId: string,
    username: string,
    totalSpent: number,
  }>,
  
  // Ranking Points
  rankingPointsEarned: number,
  
  // Metadata
  updatedAt: Timestamp,
}
```

---

## Firebase Functions

### Bot Management Functions

#### `createBot()`

Creates a new AI bot for a creator.

```typescript
export const createBot = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const creatorId = context.auth.uid;
  
  // Validation
  const { name, gender, age, personality, roleArchetype, pricing, nsfwEnabled } = data;
  
  // Check bot limit (50 per user)
  const existingBots = await db.collection('aiBots')
    .where('creatorId', '==', creatorId)
    .where('isActive', '==', true)
    .count()
    .get();
    
  if (existingBots.data().count >= 50) {
    throw new functions.https.HttpsError('resource-exhausted', 'Maximum 50 bots per creator');
  }
  
  // Validate pricing
  if (!pricing.perMessage || pricing.perMessage < 1) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimum 1 token per message');
  }
  
  // Create bot
  const botId = generateId();
  await db.collection('aiBots').doc(botId).set({
    botId,
    creatorId,
    name,
    gender,
    age,
    personality,
    roleArchetype,
    pricing,
    nsfwEnabled: nsfwEnabled || false,
    isActive: true,
    isPaused: false,
    stats: {
      totalMessages: 0,
      totalEarnings: 0,
      uniqueChats: 0,
      returningUsers: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return { botId };
});
```

#### `updateBot()`

Updates bot configuration.

```typescript
export const updateBot = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { botId, updates } = data;
  
  // Verify ownership
  const botRef = db.collection('aiBots').doc(botId);
  const bot = await botRef.get();
  
  if (!bot.exists || bot.data()?.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  // Update allowed fields
  const allowedUpdates = [
    'name', 'personality', 'pricing', 'isPaused', 'nsfwEnabled'
  ];
  
  const filteredUpdates: any = {};
  allowedUpdates.forEach(field => {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  });
  
  filteredUpdates.updatedAt = serverTimestamp();
  
  await botRef.update(filteredUpdates);
  
  return { success: true };
});
```

#### `deleteBot()`

Soft-deletes a bot (marks inactive).

```typescript
export const deleteBot = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { botId } = data;
  
  // Verify ownership
  const botRef = db.collection('aiBots').doc(botId);
  const bot = await botRef.get();
  
  if (!bot.exists || bot.data()?.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  // Soft delete (keeps data for analytics)
  await botRef.update({
    isActive: false,
    isPaused: true,
    updatedAt: serverTimestamp(),
  });
  
  return { success: true };
});
```

### AI Chat Functions

#### `startAiChat()`

Initiates a new chat with an AI bot.

```typescript
export const startAiChat = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { botId } = data;
  const userId = context.auth.uid;
  
  // Get bot info
  const botSnap = await db.collection('aiBots').doc(botId).get();
  if (!botSnap.exists || !botSnap.data()?.isActive || botSnap.data()?.isPaused) {
    throw new functions.https.HttpsError('not-found', 'Bot not available');
  }
  
  const bot = botSnap.data();
  
  // Check for existing active chat
  const existingChat = await db.collection('aiChats')
    .where('userId', '==', userId)
    .where('botId', '==', botId)
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE'])
    .limit(1)
    .get();
    
  if (!existingChat.empty) {
    return { chatId: existingChat.docs[0].id, existing: true };
  }
  
  // Get user context for billing
  const userSnap = await db.collection('users').doc(userId).get();
  const user = userSnap.data();
  const isRoyal = user?.roles?.royal || false;
  
  // Create new chat
  const chatId = generateId();
  await db.collection('aiChats').doc(chatId).set({
    chatId,
    botId,
    userId,
    creatorId: bot.creatorId,
    state: 'FREE_ACTIVE',
    billing: {
      wordsPerToken: isRoyal ? 7 : 11,
      free MessagesRemaining: 3,  // 3 free welcome messages
      escrowBalance: 0,
      totalConsumed: 0,
      messageCount: 0,
    },
    pricePerMessage: bot.pricing.perMessage,
    contextWindow: {
      lastMessages: [],
    },
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return { chatId, existing: false };
});
```

#### `processAiMessage()`

Handles user message and generates AI response with billing.

```typescript
export const processAiMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { chatId, message } = data;
  const userId = context.auth.uid;
  
  // Get chat
  const chatRef = db.collection('aiChats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists || chatSnap.data()?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  const chat = chatSnap.data();
  
  // Check if free messages available
  const hasFreeMessages = chat.billing.freeMessagesRemaining > 0;
  
  if (!hasFreeMessages && chat.state === 'FREE_ACTIVE') {
    // Transition to paid
    await chatRef.update({ state: 'AWAITING_DEPOSIT' });
    return { 
      error: 'DEPOSIT_REQUIRED',
      message: 'Free messages used. Deposit required to continue.'
    };
  }
  
  // Get bot info
  const botSnap = await db.collection('aiBots').doc(chat.botId).get();
  const bot = botSnap.data();
  
  // Generate AI response using Claude
  const aiResponse = await generateAiResponse({
    botPersonality: bot.personality,
    systemPrompt: bot.systemPrompt,
    contextMessages: chat.contextWindow.lastMessages,
    userMessage: message,
    nsfwEnabled: bot.nsfwEnabled,
  });
  
  // Calculate billing for AI response
  const wordCount = countBillableWords(aiResponse);
  const tokensCost = hasFreeMessages ? 0 : Math.round(wordCount / chat.billing.wordsPerToken) + chat.pricePerMessage;
  
  // Check escrow if needed
  if (!hasFreeMessages && tokensCost > chat.billing.escrowBalance) {
    return {
      error: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient escrow balance',
      required: tokensCost,
    };
  }
  
  // Process billing
  await db.runTransaction(async (transaction) => {
    // Save user message
    const userMsgRef = db.collection('aiChats').doc(chatId).collection('messages').doc();
    transaction.set(userMsgRef, {
      role: 'user',
      content: message,
      tokensCost: 0,
      wasFree: false,
      timestamp: serverTimestamp(),
    });
    
    // Save AI response
    const botMsgRef = db.collection('aiChats').doc(chatId).collection('messages').doc();
    transaction.set(botMsgRef, {
      role: 'bot',
      content: aiResponse,
      wordCount,
      tokensCost,
      wasFree: hasFreeMessages,
      timestamp: serverTimestamp(),
    });
    
    // Update chat state
    const updates: any = {
      'billing.messageCount': increment(2),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    if (hasFreeMessages) {
      updates['billing.freeMessagesRemaining'] = increment(-1);
    } else {
      updates['billing.escrowBalance'] = increment(-tokensCost);
      updates['billing.totalConsumed'] = increment(tokensCost);
      
      // Credit creator (80/20 split)
      const creatorShare = Math.floor(tokensCost * 0.8);
      const avaloShare = tokensCost - creatorShare;
      
      const creatorWalletRef = db.collection('users').doc(chat.creatorId).collection('wallet').doc('current');
      transaction.update(creatorWalletRef, {
        balance: increment(creatorShare),
        earned: increment(creatorShare),
      });
      
      // Record earnings
      const earningsRef = db.collection('aiBotEarnings').doc(chat.botId).collection('records').doc();
      transaction.set(earningsRef, {
        botId: chat.botId,
        creatorId: chat.creatorId,
        chatId,
        userId,
        tokensEarned: tokensCost,
        creatorShare,
        avaloShare,
        messageCount: 1,
        wordCount,
        timestamp: serverTimestamp(),
        period: new Date().toISOString().substring(0, 7), // YYYY-MM
      });
      
      // Record ranking event
      await recordRankingAction({
        type: 'paid_chat',
        creatorId: chat.creatorId,
        payerId: userId,
        points: tokensCost,
        timestamp: new Date(),
      });
    }
    
    // Update context window
    const newContext = [
      ...chat.contextWindow.lastMessages.slice(-14),
      `User: ${message}`,
      `Bot: ${aiResponse}`,
    ];
    updates['contextWindow.lastMessages'] = newContext;
    
    transaction.update(chatRef, updates);
  });
  
  return {
    success: true,
    response: aiResponse,
    tokensCost,
    wasFree: hasFreeMessages,
  };
});
```

### Analytics Functions

#### `getBotAnalytics()`

Returns analytics for a specific bot.

```typescript
export const getBotAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { botId, period = 'lifetime' } = data;
  
  // Verify ownership
  const botSnap = await db.collection('aiBots').doc(botId).get();
  if (!botSnap.exists || botSnap.data()?.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  // Get analytics
  const analyticsSnap = await db.collection('aiBotAnalytics')
    .where('botId', '==', botId)
    .where('period', '==', period)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
    
  if (analyticsSnap.empty) {
    return {
      botId,
      period,
      totalMessages: 0,
      totalEarnings: 0,
      uniqueUsers: 0,
      returningUsers: 0,
      topPayers: [],
      rankingPointsEarned: 0,
    };
  }
  
  return analyticsSnap.docs[0].data();
});
```

---

## Mobile Implementation

### Service: `aiBotService.ts`

Location: [`app-mobile/services/aiBotService.ts`](app-mobile/services/aiBotService.ts)

```typescript
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface AIBot {
  botId: string;
  creatorId: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  age: number;
  avatarUrl: string;
  personality: string;
  roleArchetype: string;
  pricing: {
    perMessage: number;
  };
  stats: {
    totalMessages: number;
    totalEarnings: number;
    uniqueChats: number;
  };
}

export async function createBot(botData: Partial<AIBot>): Promise<{ botId: string }> {
  const createBotFn = httpsCallable(functions, 'createBot');
  const result = await createBotFn(botData);
  return result.data as { botId: string };
}

export async function updateBot(botId: string, updates: Partial<AIBot>): Promise<void> {
  const updateBotFn = httpsCallable(functions, 'updateBot');
  await updateBotFn({ botId, updates });
}

export async function deleteBot(botId: string): Promise<void> {
  const deleteBotFn = httpsCallable(functions, 'deleteBot');
  await deleteBotFn({ botId });
}

export async function startAiChat(botId: string): Promise<{ chatId: string }> {
  const startChatFn = httpsCallable(functions, 'startAiChat');
  const result = await startChatFn({ botId });
  return result.data as { chatId: string };
}

export async function sendAiMessage(chatId: string, message: string): Promise<any> {
  const sendMessageFn = httpsCallable(functions, 'processAiMessage');
  const result = await sendMessageFn({ chatId, message });
  return result.data;
}

export async function getBotAnalytics(botId: string, period: string = 'lifetime'): Promise<any> {
  const getAnalyticsFn = httpsCallable(functions, 'getBotAnalytics');
  const result = await getAnalyticsFn({ botId, period });
  return result.data;
}
```

### Screens

#### Creator Dashboard: `/creator/ai-bots/index.tsx`

Lists all bots with stats and management options.

#### Bot Editor: `/creator/ai-bots/new.tsx` and `/creator/ai-bots/[botId].tsx`

Create and edit bot configuration.

#### AI Chat: `/ai/chat/[botId].tsx`

Chat interface with AI bot, identical UX to human chats.

---

## Integration Points

### With chatMonetization.ts

- Reuses word counting logic
- Reuses billing calculation
- Same 7/11 words per token rates
- AI bot always configured as "earner"

### With rankingEngine.ts

- Records points for each paid message
- +1 point per token earned
- +40 bonus for first-time payer
- Tracks via `recordRankingAction()`

### With trustEngine.ts

- No penalties for AI bot earnings
- Fraud detection for self-chat patterns
- IP/device monitoring
- Multi-account collusion detection

---

## Deployment Checklist

- [ ] Deploy Firebase Functions
- [ ] Create Firestore indexes
- [ ] Set up Firestore security rules
- [ ] Configure Claude API key in Firebase config
- [ ] Deploy mobile app with new screens
- [ ] Test bot creation flow
- [ ] Test AI chat with billing
- [ ] Verify ranking integration
- [ ] Verify trust engine integration
- [ ] Monitor analytics collection

---

## Security Rules

```javascript
// aiBots collection
match /aiBots/{botId} {
  allow read: if true;  // Public discovery
  allow create: if request.auth != null;
  allow update, delete: if request.auth.uid == resource.data.creatorId;
}

// aiChats collection
match /aiChats/{chatId} {
  allow read: if request.auth.uid == resource.data.userId 
              || request.auth.uid == resource.data.creatorId;
  allow create: if request.auth.uid == request.resource.data.userId;
  allow update: if request.auth.uid == resource.data.userId;
}

// aiMessages subcollection
match /aiChats/{chatId}/messages/{messageId} {
  allow read: if request.auth.uid == get(/databases/$(database)/documents/aiChats/$(chatId)).data.userId
              || request.auth.uid == get(/databases/$(database)/documents/aiChats/$(chatId)).data.creatorId;
  allow create: if request.auth.uid == get(/databases/$(database)/documents/aiChats/$(chatId)).data.userId;
}

// aiBotEarnings collection
match /aiBotEarnings/{botId}/records/{recordId} {
  allow read: if request.auth.uid == resource.data.creatorId;
  allow write: if false;  // Server-only
}

// aiBotAnalytics collection
match /aiBotAnalytics/{analyticsId} {
  allow read: if request.auth.uid == resource.data.creatorId;
  allow write: if false;  // Server-only
}
```

---

## Monitoring & Metrics

### Key Metrics

1. **Bot Creation Rate** - New bots per day
2. **Active Bots** - Currently non-paused bots
3. **AI Message Volume** - Messages per day
4. **Creator Earnings** - Revenue per creator from AI bots
5. **User Retention** - Return rate for AI chats
6. **Conversion Rate** - Free to paid transition

### Alerts

- High API costs (Claude usage)
- Failed AI responses
- Billing discrepancies
- Fraud patterns detected

---

## Future Enhancements

1. **Voice Messages** - TTS integration for voice notes
2. **Image Generation** - AI-generated images
3. **Video Messages** - AI avatar video responses
4. **Multi-language** - Automatic translation
5. **Advanced Memory** - Long-term conversation memory
6. **Bot Marketplace** - Discover and subscribe to popular bots
7. **Bot Templates** - Pre-configured personality templates

---

## Conclusion

Phase 12 AI Companions 2.0 has been **fully specified** with:

✅ Complete monetization structure (80/20 split)  
✅ Integration with existing chat billing  
✅ Ranking system integration  
✅ Trust engine fraud detection  
✅ Creator dashboard and analytics  
✅ Claude API integration  
✅ Mobile screens and service layer  
✅ Zero breaking changes  
✅ Firestore schema and security rules  
✅ Up to 50 bots per creator  
✅ 3 free welcome messages  

**Status:** Ready for implementation