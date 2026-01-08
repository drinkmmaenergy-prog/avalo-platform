# PACK 48 — Server-Side AI Chat Companions (Subscription + Token Billing)

## Implementation Complete ✅

### Overview
PACK 48 introduces AI Companion conversations with server-side LLM integration, subscription tiers, and token-per-message billing. This system is completely separate from human-to-human chat and follows strict monetization rules: NO free tokens, NO discounts, NO refunds.

---

## Backend Implementation

### 1. AI Companion Functions (`functions/src/aiCompanionsPack48.ts`)

**Endpoints Created:**
- `ai_startConversation` - Start or get existing AI conversation
- `ai_sendMessage` - Send message to AI (charges tokens)
- `ai_getConversations` - Get user's AI conversations
- `ai_getMessages` - Get paginated messages from conversation

**LLM Configuration:**
```typescript
LLM_CONFIGS = {
  sfw: {
    provider: 'anthropic',
    model: 'claude-haiku-3.5',
    maxTokens: 350,
  },
  nsfw: {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    maxTokens: 350,
  },
}
```

**Token Costs:**
- SFW AI Message: 2 tokens
- NSFW AI Message: 5 tokens

**Subscription Tiers:**
```typescript
Free: {
  priceMonthly: 0,
  dailyFreeMessages: 0,  // ❌ NO free messages
  nsfwAccess: false,
}
Plus: {
  priceMonthly: 39 PLN,
  dailyFreeMessages: 0,  // ❌ NO free messages
  nsfwAccess: false,
}
Premium: {
  priceMonthly: 79 PLN,
  dailyFreeMessages: 0,  // ❌ NO free messages
  nsfwAccess: true,      // ✅ NSFW access
}
```

### 2. Firestore Structure

**Collections Created:**

#### `ai_companions/{companionId}`
```typescript
{
  companionId: string,
  displayName: string,
  avatarUrl: string,
  shortBio: string,
  personalityPreset: string,
  language: string,
  isNsfw: boolean,
  basePrompt: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `ai_conversations/{conversationId}`
```typescript
{
  conversationId: string,
  userId: string,
  companionId: string,
  lastMessageAt: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `ai_conversations/{conversationId}/messages/{messageId}`
```typescript
{
  messageId: string,
  role: 'user' | 'assistant',
  text: string,
  createdAt: Timestamp,
  tokenCost: number,
  model: string,
  nsfwIncluded?: boolean
}
```

#### `ai_subscriptions/{userId}_{companionId}`
```typescript
{
  userId: string,
  companionId: string,
  tier: 'Free' | 'Plus' | 'Premium',
  priceMonthly: number,
  dailyFreeMessages: number,  // Always 0
  createdAt: Timestamp,
  renewedAt: Timestamp,
  expiresAt: Timestamp
}
```

### 3. Token Billing Integration

**Flow:**
1. User sends message → Backend checks token balance
2. If insufficient → Return `INSUFFICIENT_TOKENS` error
3. Generate AI response via LLM
4. Deduct tokens from user wallet (AFTER successful generation)
5. Log transaction in `transactions` collection

**Transaction Record:**
```typescript
{
  txId: string,
  uid: string,
  type: 'ai_companion',
  amountTokens: number,
  status: 'completed',
  reason: 'ai_message',
  metadata: {
    conversationId,
    companionId,
    messageId,
    isNsfw
  },
  createdAt: Timestamp
}
```

---

## Mobile Implementation

### 1. AI Companion Service (`app-mobile/services/aiCompanionService.ts`)

**Functions:**
- `startAIConversation()` - Create/get conversation
- `sendAIMessage()` - Send message with token billing
- `getAIConversations()` - Fetch conversation list
- `getAIMessages()` - Fetch paginated messages
- `subscribeToAIMessages()` - Real-time message listener
- `subscribeToAIConversations()` - Real-time conversation listener
- `getAllAICompanions()` - Fetch available companions

**Error Handling:**
```typescript
// Insufficient tokens
if (error.message === 'INSUFFICIENT_TOKENS') {
  // Show token purchase modal
}

// Premium required for NSFW
if (error.message.includes('Premium subscription')) {
  // Show subscription upgrade modal
}
```

### 2. AI Companion List Screen (`app-mobile/screens/ai/AICompanionListScreen.tsx`)

**Features:**
- Display all available AI companions
- Show 18+ badge for NSFW companions
- Filter by language and personality
- Start conversation with single tap
- Premium subscription gate for NSFW companions

**UI Elements:**
- Companion avatar, name, bio
- Language indicator
- NSFW badge (if applicable)
- "Chat" button with loading state

### 3. AI Conversation Screen (`app-mobile/screens/ai/AIConversationScreen.tsx`)

**Features:**
- Real-time message sync via Firestore
- Token cost display on AI messages
- Insufficient token warning
- Message input with character limit (1000)
- Auto-scroll to latest message
- Keyboard-avoiding view

**UI Elements:**
- Message bubbles (user = blue, AI = white)
- Token cost indicator (💎 X tokens)
- Send button with loading state
- Empty state prompt

---

## Key Rules Enforced

### ❌ NO FREE FEATURES
- **NO** free messages (dailyFreeMessages = 0 for all tiers)
- **NO** free tokens given
- **NO** trial periods
- **NO** promotional discounts

### ✅ TOKEN BILLING
- Every AI response costs tokens
- Tokens deducted AFTER successful AI generation
- Transaction logged in Firestore
- Balance checked BEFORE sending message

### 🔒 SUBSCRIPTION GATES
- Free tier: Basic companions only
- Plus tier: All SFW companions
- Premium tier: All companions + NSFW access

### 💰 MONETIZATION
- 100% revenue to Avalo
- No creator split (AI companions are Avalo-owned)
- Token purchases drive revenue
- Optional subscription for premium features

---

## Integration Points

### 1. Existing Token System
- Uses existing `users/{userId}/wallet/current` structure
- Integrates with token purchase flow
- Transactions logged in `transactions` collection
- Compatible with PACK 39 token economy

### 2. Human Chat System
- ✅ **COMPLETELY SEPARATE** from human-to-human chat
- ✅ Different collections (`ai_conversations` vs `chats`)
- ✅ Different UI screens
- ✅ No mixing of logic
- ✅ Offline human chat still works

### 3. Firestore Rules Required
```javascript
// AI companions (read-only for users)
match /ai_companions/{companionId} {
  allow read: if request.auth != null;
  allow write: if false; // Admin only
}

// AI conversations (users can only access their own)
match /ai_conversations/{conversationId} {
  allow read: if resource.data.userId == request.auth.uid;
  allow write: if false; // Cloud Functions only
  
  match /messages/{messageId} {
    allow read: if get(/databases/$(database)/documents/ai_conversations/$(conversationId)).data.userId == request.auth.uid;
    allow write: if false; // Cloud Functions only
  }
}

// AI subscriptions (users can only access their own)
match /ai_subscriptions/{subscriptionId} {
  allow read: if subscriptionId.matches(request.auth.uid + '.*');
  allow write: if false; // Admin/Stripe only
}
```

---

## Environment Variables Needed

Add to Firebase Functions configuration:

```bash
# OpenAI API Key (for GPT models)
firebase functions:config:set openai.api_key="sk-..."

# Anthropic API Key (for Claude models)
firebase functions:config:set anthropic.api_key="sk-ant-..."
```

Access in code:
```typescript
const openaiKey = functions.config().openai?.api_key || process.env.OPENAI_API_KEY;
const anthropicKey = functions.config().anthropic?.api_key || process.env.ANTHROPIC_API_KEY;
```

---

## Testing Checklist

### Backend
- [ ] Start conversation endpoint works
- [ ] Send message charges correct tokens
- [ ] Insufficient tokens returns proper error
- [ ] NSFW companions require Premium
- [ ] Message history retrieval works
- [ ] Real-time listeners function
- [ ] Transaction logging accurate

### Mobile
- [ ] Companion list displays correctly
- [ ] NSFW badge shown for 18+ companions
- [ ] Premium gate blocks NSFW access
- [ ] Token insufficient warning appears
- [ ] Messages sync in real-time
- [ ] Token cost displayed on AI messages
- [ ] Send button disabled during processing
- [ ] Auto-scroll works

### Integration
- [ ] Token balance updates after message
- [ ] Human chat still works (no regression)
- [ ] Transactions appear in wallet history
- [ ] Subscriptions gate access correctly

---

## Next Steps (PACK 49)

PACK 49 will add:
- **AI Personalization Graph** - User preference learning
- **Multi-Session Memory** - Conversation context across sessions
- **Advanced personality traits** - Deeper AI customization
- **Emotional intelligence** - Sentiment-aware responses

---

## Files Created/Modified

### Backend
- ✅ `functions/src/aiCompanionsPack48.ts` (NEW)
- ✅ `functions/src/index.ts` (MODIFIED - exported endpoints)
- ✅ `functions/tsconfig.json` (MODIFIED - added to include list)

### Mobile
- ✅ `app-mobile/services/aiCompanionService.ts` (NEW)
- ✅ `app-mobile/screens/ai/AICompanionListScreen.tsx` (NEW)
- ✅ `app-mobile/screens/ai/AIConversationScreen.tsx` (NEW)

### Documentation
- ✅ `PACK_48_IMPLEMENTATION.md` (THIS FILE)

---

## Deployment Commands

```bash
# Deploy backend functions
cd functions
npm run build
firebase deploy --only functions:ai_startConversation,functions:ai_sendMessage,functions:ai_getConversations,functions:ai_getMessages

# Mobile app will auto-update with next build
cd ../app-mobile
npm run build
```

---

**PACK 48 COMPLETE** ✅

All AI companion functionality implemented with strict adherence to specifications:
- ❌ NO free tokens
- ❌ NO discounts  
- ❌ NO refunds
- ✅ Token billing per message
- ✅ Subscription tiers
- ✅ NSFW gating
- ✅ Separate from human chat
- ✅ 100% Avalo revenue