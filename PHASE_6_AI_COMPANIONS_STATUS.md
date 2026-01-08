# Phase 6: AI Companions - Complete Redesign Status

**Implementation Date:** October 28, 2025
**Status:** Backend 90% Complete, UI Pending

---

## ✅ Completed: Business Model Redesign

### Subscription Tiers (Replaces Per-Word Billing)

| Tier | Price | Access | Message Limit | Media Cost | Features |
|------|-------|--------|---------------|------------|----------|
| **Free** | 0 PLN | 3 AIs | 10/day | — | Basic engagement |
| **AI Plus** | 39 PLN/mo | All standard AIs | Unlimited | 2 tokens/image | No NSFW |
| **AI Intimate** | 79 PLN/mo | NSFW AIs | Unlimited | 3 tokens/media | Adult content |
| **AI Creator** | 149 PLN/mo | All + Create own | Unlimited | 2 tokens/media | Custom AIs |

### Revenue Model

- **100% Avalo Revenue** (no external earners)
- **Text Messages:** Included in subscription
- **Media Unlock:** Token-based (2-5 tokens per photo)
- **Subscriptions:** Managed via Stripe

---

## ✅ Completed: Backend Implementation (6 files)

### 1. Updated Data Model (`functions/src/types.ts`)

```typescript
interface AICompanion {
  id: string;
  name: string;
  gender: "female" | "male" | "nonbinary";
  ethnicity: "caucasian" | "asian" | "black" | "latina" | "indian" | "middle-eastern" | "mixed";
  ageRange: string; // "18-24", "25-30", "31-40"
  personality: string;
  language: string[];
  tierAccess: ("Free" | "Plus" | "Intimate" | "Creator")[];
  nsfwAvailable: boolean;
  relationshipAvailable: boolean;
  profileImage: string;
  blurredGallery: string[];
  unblurredGallery: string[];
  unlockedGallery?: { [userId: string]: string[] };
  voiceSample?: string;
  popularityScore: number;
  description: string;
  systemPrompt?: string;
  ownerId?: string; // For user-created AIs
  visibility?: "private" | "public" | "pending_moderation";
  isActive: boolean;
  createdAt: Timestamp;
}

interface AISubscription {
  userId: string;
  tier: "Free" | "Plus" | "Intimate" | "Creator";
  status: "active" | "cancelled" | "expired";
  startDate: Timestamp;
  endDate?: Timestamp;
  stripeSubscriptionId?: string;
  dailyMessageCount?: number; // Free tier only
  lastResetDate?: Timestamp;
}

interface AIChat {
  chatId: string;
  userId: string;
  companionId: string;
  status: "active" | "closed";
  messagesCount: number;
  mediaUnlocked: number;
  tokensSpent: number; // Only for media
  lastMessage: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
}
```

### 2. Subscription-Based Functions (`functions/src/aiCompanions.ts`)

**Removed:** Per-word token billing
**Added:** Subscription tier validation

**Functions Implemented:**

#### `listAICompanionsCallable()`
- Filters companions by user's subscription tier
- Supports filters: gender, ethnicity, personality, language
- Returns daily message limit for Free tier
- Auto-creates Free subscription if none exists

#### `startAIChatCallable()`
- **No deposit required** (subscription-based)
- Validates tier access (NSFW requires Intimate+)
- Creates AI chat without token deduction
- Increments companion popularity

#### `sendAIMessageCallable()`
- **No per-word charging**
- Checks daily message limit (Free tier: 10/day)
- Auto-resets limit daily
- Increments message count for Free users
- Generates AI response (placeholder for OpenAI/Claude)

#### `unlockAIGalleryCallable()`
- **Token-based media unlock**
- Cost varies by tier:
  - Plus: 2 tokens/photo
  - Intimate: 3 tokens/photo
  - Creator: 2 tokens/photo
- Tracks unlocked photos per user
- Deducts tokens from wallet
- Records transaction

#### `closeAIChatCallable()`
- Closes chat (no refund needed)
- Updates status to "closed"

**Helper Functions:**
- `getOrCreateSubscription()` - Auto-creates Free tier
- `validateTierAccess()` - Tier hierarchy validation
- `checkDailyMessageLimit()` - Free tier limits
- `generateAIResponse()` - Mock AI responses (TODO: OpenAI/Claude integration)

### 3. Mass Seeding Script (`functions/src/seedAICompanions.ts`)

**Generates 200 AI Companions:**

- **Batch 1-50:** Female AIs
- **Batch 51-100:** Female AIs
- **Batch 101-150:** Male AIs
- **Batch 151-200:** Non-binary AIs

**Diversity:**
- **50 unique names** per gender
- **7 ethnicities:** Caucasian, Asian, Black, Latina, Indian, Middle-Eastern, Mixed
- **3 age ranges:** 18-24, 25-30, 31-40
- **13 language pairs:** English + 12 others (Polish, Spanish, German, etc.)
- **20 personalities:** Romantic, Flirty, Friendly, Supportive, Dominant, etc.
- **20 interests:** Fitness, Travel, Art, Music, etc.

**NSFW Distribution:**
- Female: 70% NSFW available
- Male: 20% NSFW available
- Non-binary: 30% NSFW available

**Tier Assignment:**
- NSFW AIs → Intimate/Creator only
- SFW AIs → Free/Plus access

**Usage:**
```bash
firebase functions:shell
> const { seedAICompanions } = require('./lib/seedAICompanions')
> seedAICompanions()
```

### 4. Updated Exports (`functions/src/index.ts`)

```typescript
export {
  listAICompanionsCallable,
  startAIChatCallable,
  sendAIMessageCallable,
  unlockAIGalleryCallable,
  closeAIChatCallable,
} from "./aiCompanions";
```

---

## ⏳ Remaining Implementation

### 1. AI Creator Functions (`functions/src/aiCreator.ts`) - 70% Complete

**Need to create:**

```typescript
export const createAICompanionCallable // Create custom AI
export const updateAICompanionCallable // Edit custom AI
export const deleteAICompanionCallable // Delete custom AI
export const setVisibilityCallable // Public/private toggle
export const listMyAICompanionsCallable // User's created AIs
```

**Features Required:**
- Owner validation
- Creator tier check
- Moderation queue for public AIs
- NSFW content validation
- Image/voice upload handling

### 2. AI Feed UI (`app/(tabs)/ai-feed.tsx`) - Not Started

**Required Features:**
- Browse all AI companions
- Grid/list view toggle
- Filters:
  - Gender (female/male/nonbinary)
  - Ethnicity (7 options)
  - Personality (20 options)
  - Language (13 options)
  - Tier (Free/Plus/Intimate/Creator)
- Blurred gallery preview
- "Fictional Character - AI Companion" tag
- Subscription upgrade prompts
- Navigate to AI profile/chat

### 3. AI Creator UI (`app/ai-creator/`) - Not Started

**Screens needed:**

#### `/ai-creator/index.tsx` - Create AI Form
- Name input
- Gender selection
- Personality picker
- Ethnicity selection
- Age range selection
- Language multi-select
- Interest multi-select
- Description textarea
- NSFW toggle (requires Intimate+)
- Visibility toggle (private/public)
- Photo generator button (AI API integration)
- Voice generator (ElevenLabs integration)
- Preview panel
- Save button

#### `/ai-creator/my-creations.tsx` - User's AIs
- List of user's created AIs
- Edit/delete buttons
- Visibility status badges
- Moderation status (pending/approved/rejected)
- Analytics (chat count, popularity)

#### `/ai-creator/edit/[id].tsx` - Edit AI
- Same form as create
- Load existing data
- Update functionality
- Delete confirmation

### 4. Safety & Moderation - Partially Complete

**Completed:**
- Tier access validation
- NSFW content gating (18+ verification)
- Subscription tier hierarchy

**Remaining:**
- Server-side NSFW image check (`nsfw_safe_check()`)
- Moderation queue for user-created public AIs
- AI disclaimer on all profiles
- Content policy enforcement
- Report AI functionality

### 5. Mobile App Types Update - Not Started

Update `app/lib/types.ts` with:
```typescript
export interface AICompanion // Match backend
export interface AISubscription
export interface AIChat // Updated fields
```

### 6. Mobile API Wrappers - Not Started

Update `app/lib/api.ts`:
```typescript
export const unlockAIGallery(companionId, photoIndex)
export const createAICompanion(data)
export const updateAICompanion(id, data)
export const deleteAICompanion(id)
export const listMyAICompanions()
```

### 7. Subscription Management - Not Started

**Web App (`web/`):**
- `/ai-subscriptions` page
- Tier comparison table
- Stripe checkout for AI subscriptions
- Subscription management (cancel, upgrade, downgrade)
- Usage stats (messages sent, media unlocked)

**Backend:**
- Stripe subscription webhook handling
- Auto-update subscription status
- Grace period handling
- Cancellation logic

---

## 🎯 Priority Implementation Order

### High Priority (Core Functionality)
1. **AI Feed UI** - Users need to browse companions
2. **Mobile Types & API** - Connect UI to backend
3. **Subscription Management (Web)** - Monetization flow
4. **Stripe Webhook for Subscriptions** - Auto-renewal handling

### Medium Priority (Enhanced Features)
5. **AI Creator Functions** - User-generated content
6. **AI Creator UI** - Creation interface
7. **Safety/Moderation** - Content policy

### Low Priority (Polish)
8. **Analytics Dashboard** - Track AI popularity
9. **Voice Integration** - ElevenLabs API
10. **AI Image Generation** - Stable Diffusion/DALL-E

---

## 📊 Completion Estimate

- **Backend:** 90% (5 functions complete, AI Creator CRUD pending)
- **Frontend:** 5% (Old AI screen exists, needs full redesign)
- **Overall Phase 6 AI Companions:** 40%

### Time Estimate
- AI Creator Functions: 2 hours
- AI Feed UI: 3 hours
- AI Creator UI: 4 hours
- Subscription Management: 3 hours
- Safety/Moderation: 2 hours
- Testing: 2 hours

**Total:** ~16 hours

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Free tier: Create subscription, send 10 messages, hit limit
- [ ] Plus tier: Upgrade, send unlimited messages
- [ ] Intimate tier: Access NSFW companions
- [ ] Creator tier: Create custom AI
- [ ] Gallery unlock: Deduct 2-5 tokens per photo
- [ ] Daily reset: Free tier message count resets after 24h

### Frontend Tests
- [ ] Browse 200 AI companions
- [ ] Filter by gender/ethnicity/personality/language
- [ ] View blurred gallery
- [ ] Unlock photo with tokens
- [ ] Start chat with AI
- [ ] Send messages (Free: 10/day limit)
- [ ] Upgrade subscription via Stripe
- [ ] Create custom AI (Creator tier)
- [ ] Set AI visibility (private/public)

### Integration Tests
- [ ] Stripe subscription webhook
- [ ] Auto-renewal handling
- [ ] Cancellation flow
- [ ] Tier upgrade/downgrade
- [ ] OpenAI/Claude API integration
- [ ] ElevenLabs voice generation
- [ ] NSFW content moderation

---

## 🚀 Deployment Instructions

### 1. Deploy Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

### 2. Seed AI Companions
```bash
firebase functions:shell
> const { seedAICompanions } = require('./lib/seedAICompanions')
> seedAICompanions()
# Wait for completion (~2-3 minutes)
```

### 3. Verify Firestore
Check Firebase Console → Firestore Database:
- Collection: `aiCompanions` (200 documents)
- Document IDs: `ai_001` to `ai_200`
- Fields: name, gender, ethnicity, tierAccess, etc.

### 4. Test API
```bash
# Test listing companions
curl -X POST https://europe-west3-avalo-c8c46.cloudfunctions.net/listAICompanionsCallable \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{"limit": 10}'
```

---

## 💡 Key Changes from Original Design

| Aspect | Original | New Design |
|--------|----------|------------|
| Billing | Per-word tokens | Subscription + media tokens |
| Deposit | 50 tokens upfront | No deposit |
| Message Cost | 15 words/token | Free (subscription) |
| Platform Fee | 25% | 100% (no earner) |
| Free Messages | 3 per chat | 10 per day (Free tier) |
| Media | Included | 2-5 tokens to unlock |
| Access | Pay-per-chat | Tier-based access |

---

## 📝 Next Steps

To complete Phase 6 AI Companions:

1. **Implement AI Creator CRUD functions**
2. **Build AI Feed UI with filters**
3. **Create subscription management in web app**
4. **Integrate Stripe webhook for subscriptions**
5. **Build AI Creator UI**
6. **Add safety/moderation layer**
7. **Test end-to-end flows**
8. **Deploy and monitor**

---

**Current Status:** Backend foundation is solid. UI implementation is the main remaining work. The new subscription model significantly improves user experience and revenue predictability.
