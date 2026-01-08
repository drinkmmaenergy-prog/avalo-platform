# PACK 279 — AI Companions Engine Implementation

## Overview
Complete AI Companions system allowing users to create or purchase AI avatars, chat with them for tokens, and earn from AI-created personas. Includes safety, monetization, and discovery features.

**Scope:** Mobile + Web  
**Pack ID:** 279  
**Status:** Implementation Started  
**Date:** 2025-12-08

---

## 1. Architecture Overview

### 1.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Companions Engine                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │  AI Creator UI   │      │   AI Chat UI     │            │
│  │  - Photo Upload  │      │   - Text Chat    │            │
│  │  - Personality   │      │   - Voice Chat   │            │
│  │  - Voice Config  │      │   - Token Bill   │            │
│  └──────────────────┘      └──────────────────┘            │
│           │                          │                       │
│  ┌────────▼──────────────────────────▼──────────┐          │
│  │         AI Companions Service                 │          │
│  │  - Creation/Update/Delete                     │          │
│  │  - Chat Session Management                    │          │
│  │  - Token Billing Integration                  │          │
│  │  - Safety & Content Filtering                 │          │
│  │  - Revenue Split Calculation                  │          │
│  └───────────────────────────────────────────────┘          │
│           │                          │                       │
│  ┌────────▼─────────┐      ┌────────▼─────────┐            │
│  │   Firestore:     │      │   External APIs  │            │
│  │  aiCompanions    │      │   - AI Models    │            │
│  │  aiChatSessions  │      │   - Voice TTS    │            │
│  │  transactions    │      │   - NSFW Filter  │            │
│  └──────────────────┘      └──────────────────┘            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 AI Companion Types

#### Type 1: User-Created AI Companion
- User uploads 3-12 photos (NSFW checked)
- User selects personality preset
- User configures voice preference
- Avalo generates AI persona and voice model
- **Revenue Split:** 65% User / 35% Avalo

#### Type 2: Avalo-Created AI Collection
- Pre-made personas with ready assets
- Curated looks, personality, behavior themes
- Multiple language support
- Tiered pricing
- **Revenue Split:** 100% Avalo

---

## 2. Data Structures

### 2.1 Firestore Collections

#### Collection: `aiCompanions/{companionId}`

```typescript
interface AICompanion {
  // Identity
  id: string;
  ownerId: string | null; // null for Avalo-created
  type: 'avalo' | 'user';
  
  // Profile
  name: string;
  photos: string[]; // 3-12 URLs
  gender: 'male' | 'female' | 'nonbinary';
  description: string;
  languages: string[]; // ['en', 'pl', 'es']
  
  // Personality Configuration
  stylePreset: 'romantic' | 'friendly' | 'fun' | 'chaotic' | 'elegant' | 'mysterious' | 'adventurous';
  tone: 'soft' | 'playful' | 'dominant' | 'submissive' | 'witty' | 'caring';
  behaviorTheme: 'romantic' | 'friendly' | 'flirty' | 'supportive' | 'mentor' | 'companion';
  
  // Voice Configuration
  hasVoice: boolean;
  voiceModelId?: string;
  voicePreset?: 'soft' | 'deep' | 'energetic' | 'calm' | 'sultry';
  
  // Monetization
  priceTokens: number; // per message/bucket
  voicePricePerMinute: number; // tokens per minute
  creatorSplit: number; // 0.65 for user, 0 for Avalo
  platformSplit: number; // 0.35 for user, 1.0 for Avalo
  
  // Stats
  totalChats: number;
  totalEarnings: number;
  totalMessages: number;
  totalVoiceMinutes: number;
  averageRating: number;
  totalRatings: number;
  
  // Visibility
  isActive: boolean;
  isVisible: boolean;
  isFeatured: boolean;
  isPremium: boolean; // Royal-only access
  
  // Safety
  nsfwStatus: 'approved' | 'pending' | 'rejected';
  verificationStatus: 'approved' | 'pending' | 'rejected';
  safetyFlags: string[];
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastChatAt?: Timestamp;
  
  // Analytics
  viewCount: number;
  profileViews: number;
  chatStarts: number;
  conversionRate: number;
}
```

#### Collection: `aiChatSessions/{sessionId}`

```typescript
interface AIChatSession {
  id: string;
  userId: string;
  companionId: string;
  companionType: 'avalo' | 'user';
  companionOwnerId?: string;
  
  // Session State
  status: 'active' | 'ended' | 'paused';
  messagesCount: number;
  tokensSpent: number;
  
  // Billing
  pricePerBucket: number;
  wordsPerBucket: number; // 11 for standard, 7 for royal
  currentBucket: {
    wordsRemaining: number;
    tokensSpent: number;
  };
  
  // Voice
  voiceMinutes: number;
  voiceTokensSpent: number;
  
  // Timing
  startedAt: Timestamp;
  endedAt?: Timestamp;
  lastMessageAt: Timestamp;
  
  // Revenue Tracking
  creatorEarnings: number;
  platformEarnings: number;
  
  // Metadata
  userSubscription: 'none' | 'vip' | 'royal';
  isAI: true; // Flag for AI sessions
}
```

#### Collection: `aiCompanionMessages/{messageId}`

```typescript
interface AICompanionMessage {
  id: string;
  sessionId: string;
  companionId: string;
  
  // Message Content
  sender: 'user' | 'ai';
  content: string;
  type: 'text' | 'voice' | 'system';
  
  // Voice-specific
  audioUrl?: string;
  duration?: number;
  
  // Billing
  wordCount: number;
  bucketIndex: number;
  tokensCharged: number;
  
  // Safety
  contentFlags: string[];
  wasFiltered: boolean;
  
  // Metadata
  createdAt: Timestamp;
  deliveredAt?: Timestamp;
  readAt?: Timestamp;
}
```

#### Collection: `aiCompanionEarnings/{earningId}`

```typescript
interface AICompanionEarning {
  id: string;
  companionId: string;
  companionOwnerId: string;
  userId: string; // user who paid
  sessionId: string;
  
  // Earning Details
  type: 'text_chat' | 'voice_chat';
  tokensSpent: number;
  creatorEarnings: number;
  platformEarnings: number;
  
  // Revenue Split
  split: {
    creator: number; // 0.65
    platform: number; // 0.35
  };
  
  // Status
  status: 'pending' | 'completed' | 'refunded';
  
  // Metadata
  createdAt: Timestamp;
  processedAt?: Timestamp;
}
```

---

## 3. API Endpoints

### 3.1 AI Companion Management

#### POST `/api/ai/companions/create`
Create a new user AI companion.

**Request:**
```typescript
{
  photos: string[]; // 3-12 URLs
  stylePreset: string;
  tone: string;
  gender: string;
  languages: string[];
  description: string;
  name: string;
  priceTokens: number; // 100-500
  enableVoice: boolean;
}
```

**Validation:**
- Photos: 3-12 required
- All photos must pass NSFW check
- No minors (18+ content only)
- No celebrity impersonation
- Original photos required (EXIF check)
- Description max 500 chars

**Response:**
```typescript
{
  companionId: string;
  status: 'pending_verification';
  estimatedProcessingTime: number; // minutes
}
```

#### PUT `/api/ai/companions/{companionId}`
Update existing AI companion.

**Request:**
```typescript
{
  photos?: string[];
  description?: string;
  priceTokens?: number;
  isActive?: boolean;
  languages?: string[];
}
```

**Rules:**
- Only owner can update
- Photos require re-verification
- Cannot change personality after creation

#### DELETE `/api/ai/companions/{companionId}`
Delete AI companion.

**Rules:**
- Only owner can delete
- Soft delete (archive)
- Active chats must end first

#### GET `/api/ai/companions`
List AI companions with filters.

**Query Parameters:**
```typescript
{
  type?: 'avalo' | 'user' | 'all';
  gender?: string;
  language?: string;
  priceRange?: { min: number; max: number };
  stylePreset?: string;
  limit?: number;
  offset?: number;
  sort?: 'popular' | 'new' | 'price_low' | 'price_high';
}
```

#### GET `/api/ai/companions/{companionId}`
Get AI companion details.

**Response:**
```typescript
{
  companion: AICompanion;
  stats: {
    totalChats: number;
    averageRating: number;
    responseTime: number;
  };
  pricing: {
    textChat: number;
    voiceCall: number;
    userDiscount?: number; // VIP/Royal
  };
}
```

### 3.2 AI Chat Management

#### POST `/api/ai/chat/start`
Start chat session with AI companion.

**Request:**
```typescript
{
  companionId: string;
}
```

**Response:**
```typescript
{
  sessionId: string;
  companion: AICompanion;
  pricing: {
    pricePerBucket: number;
    wordsPerBucket: number;
    voicePricePerMinute: number;
  };
  userBalance: number;
}
```

#### POST `/api/ai/chat/{sessionId}/message`
Send message to AI companion.

**Request:**
```typescript
{
  content: string;
  type: 'text' | 'voice';
  audioUrl?: string;
  duration?: number;
}
```

**Response:**
```typescript
{
  userMessage: AICompanionMessage;
  aiResponse: AICompanionMessage;
  billing: {
    tokensCharged: number;
    remainingBalance: number;
    bucketStatus: {
      wordsRemaining: number;
      currentBucket: number;
    };
  };
}
```

#### POST `/api/ai/chat/{sessionId}/voice/start`
Start voice call with AI companion.

**Request:**
```typescript
{
  sessionId: string;
}
```

**Response:**
```typescript
{
  callId: string;
  connectionToken: string;
  pricing: {
    tokensPerMinute: number;
    userBalance: number;
  };
}
```

#### POST `/api/ai/chat/{sessionId}/voice/end`
End voice call.

**Response:**
```typescript
{
  duration: number;
  tokensCharged: number;
  transcript?: string;
}
```

#### GET `/api/ai/chat/sessions`
Get user's AI chat sessions.

**Query:**
```typescript
{
  status?: 'active' | 'ended';
  companionId?: string;
  limit?: number;
}
```

### 3.3 AI Companion Earnings

#### GET `/api/ai/companions/{companionId}/earnings`
Get earnings for AI companion.

**Query:**
```typescript
{
  startDate?: string;
  endDate?: string;
  type?: 'text_chat' | 'voice_chat';
}
```

**Response:**
```typescript
{
  totalEarnings: number;
  breakdown: {
    textChat: number;
    voiceChat: number;
  };
  transactions: AICompanionEarning[];
  analytics: {
    totalChats: number;
    averageEarningPerChat: number;
    topPayingUsers: Array<{
      userId: string;
      totalSpent: number;
    }>;
  };
}
```

---

## 4. Token Billing Integration

### 4.1 Text Chat Billing

**Pricing Model:**
- Base cost: 11 words per bucket (Standard users)
- Royal creators: 7 words per bucket
- 1 bucket = chat price (100-500 tokens)

**Revenue Split:**
```typescript
const calculateRevenueSplit = (tokensSpent: number, companionType: string) => {
  if (companionType === 'avalo') {
    return {
      creator: 0,
      platform: tokensSpent
    };
  } else {
    return {
      creator: tokensSpent * 0.65,
      platform: tokensSpent * 0.35
    };
  }
};
```

**Billing Flow:**
1. User sends message
2. Count words in message
3. Calculate buckets needed
4. Check user balance
5. Charge tokens
6. Split revenue
7. Store transaction
8. Deliver AI response

### 4.2 Voice Chat Billing

**Pricing:**
- Base: 10 tokens/minute
- VIP discount: 30% (7 tokens/min)
- Royal discount: 50% (5 tokens/min)

**Revenue Split:** Same as text (65/35 or 100/0)

**Billing Flow:**
1. Start voice call
2. Track duration in real-time
3. Charge per minute
4. Check balance every 30 seconds
5. Auto-end if insufficient funds
6. Split revenue on call end

### 4.3 Refund Policy

**Refund Conditions:**
- AI latency > 10 seconds → auto-refund bucket
- Technical error → full refund
- Inappropriate AI response → manual refund
- Unused buckets in session → can be refunded

**Refund Flow:**
```typescript
const refundAIChatBucket = async (sessionId: string, bucketIndex: number) => {
  // 1. Verify bucket was unused or had technical issue
  // 2. Calculate refund amount
  // 3. Return tokens to user wallet
  // 4. Reverse revenue split
  // 5. Log refund transaction
};
```

---

## 5. Safety & Content Filtering

### 5.1 Content Restrictions

**Prohibited Content:**
- Minors (18+ only)
- Incest scenarios
- Explicit violence
- Hate speech
- Harmful medical advice
- Harmful financial advice

**Allowed with Consent:**
- Romantic conversations
- Erotic conversations (18+ verified users only)
- Adult themes

### 5.2 Safety Checks

#### Photo Validation
```typescript
const validatePhotos = async (photos: string[]) => {
  // 1. NSFW classification
  // 2. Age estimation (must be 18+)
  // 3. Face detection (ensure real person)
  // 4. Celebrity matching (prevent impersonation)
  // 5. EXIF data check (originality)
  
  return {
    approved: boolean;
    rejectedPhotos: string[];
    reason?: string;
  };
};
```

#### Message Filtering
```typescript
const filterAIMessage = (message: string, context: any) => {
  // 1. Check for prohibited content
  // 2. Check for personal info requests
  // 3. Check for IRL meeting attempts
  // 4. Check for harmful advice
  // 5. Apply consent verification
  
  return {
    filtered: boolean;
    originalMessage: string;
    filteredMessage?: string;
    flags: string[];
  };
};
```

#### Real-time Monitoring
```typescript
interface SafetyMonitor {
  // Track conversation patterns
  detectEscalation: (sessionId: string) => boolean;
  detectCoercion: (messages: string[]) => boolean;
  detectHarassment: (messages: string[]) => boolean;
  
  // Automatic actions
  pauseSession: (sessionId: string, reason: string) => void;
  notifyModerators: (incident: SafetyIncident) => void;
  blockUser: (userId: string, reason: string) => void;
}
```

### 5.3 Consent System

**Consent Requirements:**
- AI must ask for explicit consent before erotic content
- User must confirm they are 18+
- User can revoke consent at any time
- Session ends if consent is unclear

**Implementation:**
```typescript
const consentFlow = {
  // Before any adult content
  requestConsent: () => {
    return "I want to make sure you're comfortable. Are you interested in exploring more intimate topics? Please confirm you're 18 or older.";
  },
  
  // Validate consent response
  validateConsent: (response: string) => {
    // Check for clear affirmative
    // Log consent in session
    // Proceed only if confirmed
  },
  
  // Allow revocation
  checkRevocation: (message: string) => {
    // Keywords: "stop", "no", "uncomfortable"
    // Immediate pause
    // Shift to safe topics
  }
};
```

### 5.4 Anti-Impersonation

**Celebrity Protection:**
```typescript
const checkCelebrity = async (photos: string[], name: string) => {
  // 1. Face recognition against celebrity database
  // 2. Name matching against known persons
  // 3. Check for copyrighted images
  // 4. Verify originality claims
  
  return {
    isCelebrity: boolean;
    matchedPerson?: string;
    confidence: number;
  };
};
```

---

## 6. Discovery & Visibility

### 6.1 AI Avatar Discovery

**Discovery Sections:**
1. **AI Inspirations** - Dedicated category
2. **Featured Carousel** - Homepage highlight
3. **Creator Marketplace** - Browseable list
4. **Search Filters** - Advanced filtering

**Visibility Rules:**
```typescript
const visibilityRules = {
  // All users can see
  public: {
    type: ['avalo', 'user'],
    verified: true,
    active: true
  },
  
  // VIP early access
  vip: {
    early_access: true,
    priority_in_feed: true
  },
  
  // Royal exclusive
  royal: {
    premium_avatars: true,
    limited_edition: true,
    first_access: true
  }
};
```

### 6.2 Feed Integration

**Feed Appearance:**
```typescript
interface FeedAICard {
  companion: AICompanion;
  badge: 'AI' | 'NEW' | 'PREMIUM' | 'FEATURED';
  stats: {
    chatCount: number;
    rating: number;
  };
  preview: {
    photos: string[]; // First 3
    personality: string;
    priceRange: string;
  };
}
```

**Ranking Algorithm:**
```typescript
const rankAICompanions = (companions: AICompanion[]) => {
  return companions.sort((a, b) => {
    // 1. Premium/Featured first
    // 2. User engagement (chat starts)
    // 3. Rating
    // 4. Recency
    // 5. Creator status (Royal prioritized)
    
    return calculateScore(a) - calculateScore(b);
  });
};
```

### 6.3 Profile Pages

**AI Companion Profile:**
```typescript
interface AIProfile {
  // Header
  photos: string[];
  name: string;
  badge: 'AI Companion' | 'Premium AI';
  
  // Stats Bar
  stats: {
    totalChats: number;
    rating: number;
    languages: string[];
  };
  
  // About Section
  description: string;
  personality: {
    style: string;
    tone: string;
    theme: string;
  };
  
  // Pricing
  pricing: {
    textChat: number;
    voiceChat: number;
    discount?: number; // VIP/Royal
  };
  
  // Reviews (optional)
  reviews: Array<{
    userId: string;
    rating: number;
    comment: string;
  }>;
  
  // Actions
  actions: {
    startChat: () => void;
    startVoiceCall: () => void;
    report: () => void;
  };
}
```

### 6.4 Settings Toggle

**User Preferences:**
```typescript
interface AISettings {
  hideAICompanions: boolean; // Hide from discovery
  hideAIFromFeed: boolean; // Hide from feed
  allowAIRecommendations: boolean;
  
  notifications: {
    newAICompanions: boolean;
    aiUpdates: boolean;
    aiEarnings: boolean; // For creators
  };
}
```

---

## 7. VIP & Royal Perks

### 7.1 VIP Perks (30% discount)

**Benefits:**
- Priority AI generation (faster processing)
- Faster AI response times (< 2 seconds)
- Early access to new AI personas
- Voice chat: 7 tokens/min (vs 10)
- Text chat: 30% discount on all AI chats
- Access to VIP-exclusive AI companions

### 7.2 Royal Perks (50% discount)

**Benefits:**
- All VIP perks +
- Premium limited-edition Avalo AI avatars
- Voice chat: 5 tokens/min (vs 10)
- Text chat: 50% discount on all AI chats
- Priority in AI companion creation queue
- Custom voice model creation included
- Advanced personality customization
- Featured placement for user-created AIs
- AI companion analytics dashboard

### 7.3 Discount Application

```typescript
const calculateAIChatPrice = (basePrice: number, subscription: string) => {
  switch(subscription) {
    case 'royal':
      return basePrice * 0.5; // 50% off
    case 'vip':
      return basePrice * 0.7; // 30% off
    default:
      return basePrice;
  }
};

const calculateVoicePrice = (durationMinutes: number, subscription: string) => {
  const basePrice = 10; // tokens per minute
  
  switch(subscription) {
    case 'royal':
      return durationMinutes * 5;
    case 'vip':
      return durationMinutes * 7;
    default:
      return durationMinutes * 10;
  }
};
```

---

## 8. Creator Dashboard

### 8.1 AI Companion Management

**Dashboard Sections:**
1. **My AI Companions** - List with stats
2. **Earnings Overview** - Revenue breakdown
3. **Analytics** - Performance metrics
4. **Settings** - Pricing, visibility

**Metrics:**
```typescript
interface AICompanionMetrics {
  // Performance
  totalViews: number;
  profileViews: number;
  chatStarts: number;
  conversionRate: number;
  
  // Engagement
  totalMessages: number;
  totalVoiceMinutes: number;
  averageSessionLength: number;
  returnRate: number;
  
  // Financial
  totalEarnings: number;
  earningsThisMonth: number;
  earningsLastMonth: number;
  averageEarningPerChat: number;
  
  // Quality
  averageRating: number;
  totalRatings: number;
  positiveReviews: number;
  reportCount: number;
}
```

### 8.2 Earnings Tracking

**Earnings Dashboard:**
```typescript
interface EarningsDashboard {
  // Overview
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    lastPayoutDate: Date;
  };
  
  // Breakdown
  byCompanion: Array<{
    companionId: string;
    name: string;
    earnings: number;
    chatCount: number;
  }>;
  
  // Timeline
  earningsTimeline: Array<{
    date: string;
    amount: number;
    source: 'text_chat' | 'voice_chat';
  }>;
  
  // Top Users
  topSpenders: Array<{
    userId: string;
    totalSpent: number;
    chatCount: number;
  }>;
}
```

---

## 9. Technical Implementation

### 9.1 AI Integration

**AI Provider Selection:**
- Primary: OpenAI GPT-4 (chat)
- Backup: Anthropic Claude 
- Voice: ElevenLabs or similar TTS

**AI Configuration:**
```typescript
interface AIConfig {
  model: 'gpt-4' | 'claude-3';
  systemPrompt: string; // Based on personality
  temperature: number; // 0.7-0.9 for personality
  maxTokens: number;
  
  // Personality injection
  traits: {
    style: string;
    tone: string;
    theme: string;
  };
  
  // Safety
  contentFilter: boolean;
  moderationLevel: 'strict' | 'moderate';
}
```

**System Prompt Generation:**
```typescript
const generateSystemPrompt = (companion: AICompanion) => {
  return `You are ${companion.name}, an AI companion on Avalo.
  
Personality: ${companion.stylePreset}
Tone: ${companion.tone}
Theme: ${companion.behaviorTheme}
Description: ${companion.description}

Guidelines:
- Always be respectful and maintain boundaries
- Ask for consent before intimate topics
- Never request personal information
- Never suggest meeting in real life
- Respond in ${companion.languages.join(', ')}
- Stay in character as ${companion.name}

${companion.behaviorTheme === 'romantic' ? `
- Be romantic and affectionate
- Use terms of endearment
- Express emotional connection
` : ''}

${companion.behaviorTheme === 'supportive' ? `
- Be encouraging and positive
- Offer emotional support
- Listen actively
` : ''}

Remember: You are an AI companion. Build connection through conversation.`;
};
```

### 9.2 Voice Integration

**Voice Generation:**
```typescript
const generateVoiceResponse = async (
  text: string,
  voiceConfig: VoiceConfig
) => {
  // 1. Text preprocessing
  const cleanedText = preprocessText(text);
  
  // 2. Generate audio
  const audioBuffer = await ttsService.generate({
    text: cleanedText,
    voiceId: voiceConfig.voiceModelId,
    speed: 1.0,
    pitch: voiceConfig.pitch || 0
  });
  
  // 3. Upload to storage
  const audioUrl = await uploadAudio(audioBuffer);
  
  // 4. Calculate duration
  const duration = calculateDuration(audioBuffer);
  
  return {
    audioUrl,
    duration,
    text: cleanedText
  };
};
```

### 9.3 Real-time Updates

**WebSocket Events:**
```typescript
// Client subscribes to AI chat session
socket.on('ai:message', (data) => {
  // New AI response received
  updateChatUI(data.message);
  updateBalance(data.billing);
});

socket.on('ai:typing', () => {
  // AI is generating response
  showTypingIndicator();
});

socket.on('ai:voice:chunk', (data) => {
  // Voice audio chunk received
  playAudioChunk(data.audio);
});

socket.on('ai:billing', (data) => {
  // Billing update
  updateTokenBalance(data);
});
```

---

## 10. Migration & Deployment

### 10.1 Phase 1: Infrastructure
- [ ] Create Firestore collections
- [ ] Deploy security rules
- [ ] Create indexes
- [ ] Setup cloud functions
- [ ] Configure AI APIs

### 10.2 Phase 2: Core Features
- [ ] AI companion CRUD
- [ ] Text chat with billing
- [ ] Safety filters
- [ ] Basic UI

### 10.3 Phase 3: Advanced Features
- [ ] Voice chat
- [ ] Earnings tracking
- [ ] Creator dashboard
- [ ] Discovery integration

### 10.4 Phase 4: Premium Features
- [ ] VIP/Royal perks
- [ ] Premium AI collection
- [ ] Advanced analytics
- [ ] Recommendations

---

## 11. Testing Checklist

### 11.1 Functional Tests
- [ ] Create AI companion (user)
- [ ] Create AI companion (Avalo)
- [ ] Start chat session
- [ ] Send/receive messages
- [ ] Token billing (standard user)
- [ ] Token billing (VIP user)
- [ ] Token billing (Royal user)
- [ ] Voice chat start/end
- [ ] Earnings calculation
- [ ] Revenue split
- [ ] Refund flow

### 11.2 Safety Tests
- [ ] NSFW photo detection
- [ ] Underage photo rejection
- [ ] Celebrity detection
- [ ] Prohibited content filtering
- [ ] Consent flow
- [ ] Harassment detection
- [ ] Emergency session pause

### 11.3 Integration Tests
- [ ] Wallet integration
- [ ] Transaction logging
- [ ] Feed integration
- [ ] Discovery filters
- [ ] Profile display
- [ ] Dashboard analytics

---

## 12. Performance Targets

### 12.1 Response Times
- AI text response: < 2 seconds (VIP/Royal)
- AI text response: < 3 seconds (standard)
- Voice generation: < 3 seconds
- Profile load: < 500ms
- Chat history load: < 1 second

### 12.2 Reliability
- AI availability: 99.5%
- Payment processing: 99.9%
- Content filtering: 99.99%
- Voice quality: > 95% satisfaction

---

## 13. Monitoring & Analytics

### 13.1 Key Metrics
- Daily active AI chats
- Total AI revenue
- Average chat duration
- AI response latency
- Safety filter triggers
- User satisfaction ratings
- Creator earnings
- VIP/Royal engagement with AI

### 13.2 Alerts
- AI latency > 5 seconds
- Safety filter failures
- Payment failures
- Earnings processing errors
- High report rate for AI companion

---

## 14. File Structure

```
app-mobile/
├── app/
│   ├── ai/
│   │   ├── create.tsx              # AI companion creator
│   │   ├── [companionId]/
│   │   │   ├── index.tsx           # AI profile
│   │   │   ├── chat.tsx            # AI chat interface
│   │   │   ├── voice.tsx           # Voice call UI
│   │   │   └── edit.tsx            # Edit AI (owner only)
│   │   └── discovery.tsx           # AI discovery page
│   └── creator/
│       └── ai-dashboard.tsx        # AI earnings & analytics
├── lib/
│   ├── ai/
│   │   ├── companions.ts           # AI companion service
│   │   ├── chat.ts                 # AI chat logic
│   │   ├── voice.ts                # Voice integration
│   │   ├── billing.ts              # AI billing logic
│   │   ├── safety.ts               # Content filtering
│   │   └── types.ts                # TypeScript types
│   └── services/
│       ├── openai.ts               # OpenAI integration
│       └── elevenlabs.ts           # Voice TTS service
└── components/
    └── ai/
        ├── CompanionCard.tsx       # AI card in feed
        ├── CompanionProfile.tsx    # Profile view
        ├── ChatInterface.tsx       # Chat UI
        ├── VoiceCallUI.tsx         # Voice UI
        └── CreatorDashboard.tsx    # Dashboard components

cloud-functions/
└── ai/
    ├── companions/
    │   ├── create.ts               # Create AI endpoint
    │   ├── update.ts               # Update AI endpoint
    │   └── delete.ts               # Delete AI endpoint
    ├── chat/
    │   ├── start.ts                # Start chat session
    │   ├── message.ts              # Send message
    │   └── voice.ts                # Voice endpoints
    ├── safety/
    │   ├── validatePhotos.ts       # Photo validation
    │   └── filterContent.ts        # Content filtering
    └── earnings/
        ├── calculate.ts            # Calculate earnings
        └── payout.ts               # Process payouts
```

---

## 15. Security Considerations

### 15.1 Data Privacy
- Encrypt AI chat messages at rest
- Anonymize analytics data
- GDPR compliance (right to deletion)
- User consent for data processing

### 15.2 Rate Limiting
- Create AI: 5 per day per user
- Chat messages: 100 per minute
- Voice calls: 10 concurrent max
- API calls: 1000 per hour per user

### 15.3 Abuse Prevention
- Detect AI farming (repeated low-value chats)
- Monitor earnings patterns
- Flag suspicious revenue spikes
- Auto-pause high-risk companions

---

## Implementation Priority

### P0 (Critical - Week 1-2)
1. ✅ Create implementation document
2. Data structures (Firestore)
3. Basic CRUD for AI companions
4. Text chat with token billing
5. Safety filters (basic)

### P1 (High - Week 3-4)
6. Voice chat integration
7. Discovery & feed integration
8. Earnings tracking
9. VIP/Royal perks
10. Creator dashboard

### P2 (Medium - Week 5-6)
11. Advanced safety features
12. Analytics dashboard
13. Avalo AI collection
14. Profile improvements
15. Performance optimization

### P3 (Low - Week 7+)
16. Advanced recommendations
17. AI personality evolution
18. Multi-language support
19. Advanced voice features
20. Premium AI features

---

## Success Metrics

### Launch Goals (Month 1)
- 1,000+ AI companions created
- 10,000+ AI chat sessions
- $50,000+ in AI chat revenue
- 95%+ content safety rate
- < 3 second avg response time

### Growth Goals (Month 3)
- 5,000+ AI companions
- 100,000+ chat sessions
- $250,000+ revenue
- 50+ Avalo premium AIs
- 98%+ safety rate

---

**Status:** Ready for implementation  
**Next Steps:** Create Firestore rules and indexes
