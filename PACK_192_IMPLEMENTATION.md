# PACK 192 — AI Social Memory Hub Implementation Guide

**Cross-AI Knowledge Sharing with Strict Privacy Controls**

## 🎯 Overview

PACK 192 implements a privacy-first social memory system that allows multiple AI companions to share high-level user preferences WITHOUT accessing emotional vulnerabilities, financial data, or personal secrets.

### Core Principles

✅ **Convenience** - AIs know what you like (topics, humor style, languages)  
✅ **Consistency** - Story progress continues across different AIs  
✅ **Privacy** - Emotional data, finances, and personal info are NEVER shared  
✅ **Transparency** - Users see exactly what AIs know  
✅ **Control** - Users manage all shared preferences

---

## 🏗️ Architecture

### Backend Components

#### 1. Types & Schemas ([`functions/src/types/socialMemory.ts`](functions/src/types/socialMemory.ts))

**Allowed Categories:**
- `topics_liked` - MMA, boxing, Korean food, sci-fi, business
- `humor_preference` - sarcastic, playful, poetic, analytical  
- `activity_preference` - voice notes, long texts, games, challenges
- `languages` - Spanish, Polish, etc.
- `safe_boundaries` - Things user doesn't like (no guilt pressure, etc.)
- `story_progress` - Chapter progress in narrative arcs

**Forbidden Data Types:**
- Emotional vulnerability
- Loneliness signals
- Fears/trauma/mental health
- Financial data/purchases
- Sexual interests
- Relationship pain
- AI rankings/favorites

#### 2. Privacy Middleware ([`functions/src/middleware/socialMemoryPrivacy.ts`](functions/src/middleware/socialMemoryPrivacy.ts:1))

**Functions:**
- [`evaluateTextForForbiddenContent()`](functions/src/middleware/socialMemoryPrivacy.ts:45) - Blocks sensitive data
- [`sanitizePreferenceValue()`](functions/src/middleware/socialMemoryPrivacy.ts:93) - Cleans preferences before sharing
- [`validatePreferenceSharing()`](functions/src/middleware/socialMemoryPrivacy.ts:240) - Comprehensive validation
- [`blockAiGossip()`](functions/src/middleware/socialMemoryPrivacy.ts:179) - Prevents AIs from gossiping
- [`detectManipulativeBehavior()`](functions/src/middleware/socialMemoryPrivacy.ts:147) - Anti-jealousy protection

#### 3. Cloud Functions ([`functions/src/socialMemoryHub.ts`](functions/src/socialMemoryHub.ts:1))

**Core Functions:**

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| [`sharePreferenceAcrossAis`](functions/src/socialMemoryHub.ts:54) | Share safe preference | ✓ |
| [`getSharedPreferencesForAi`](functions/src/socialMemoryHub.ts:155) | Get preferences for AI | ✓ |
| [`storeUserStoryProgress`](functions/src/socialMemoryHub.ts:307) | Track story progress | ✓ |
| [`updateMemoryPermissions`](functions/src/socialMemoryHub.ts:397) | Update user controls | ✓ |
| [`blockPreferenceSharing`](functions/src/socialMemoryHub.ts:488) | Delete preference | ✓ |
| [`resolvePreferenceConflict`](functions/src/socialMemoryHub.ts:531) | Resolve AI disagreements | ✓ |
| [`getMemoryAnalytics`](functions/src/socialMemoryHub.ts:583) | Get transparency data | ✓ |
| [`wipeUserMemory`](functions/src/socialMemoryHub.ts:650) | Complete memory wipe | ✓ |

### Firestore Collections

```
ai_shared_preferences/{preferenceId}
  - id: string
  - userId: string
  - category: AllowedPreferenceCategory
  - key: string
  - value: any
  - confidence: number (0-1)
  - sourceAiId?: string
  - createdAt: Timestamp
  - updatedAt: Timestamp
  - accessCount: number
  - lastAccessedAt: Timestamp

ai_shared_story_progress/{progressId}
  - id: string
  - userId: string
  - storyId: string
  - storyName: string
  - currentChapter: number
  - totalChapters: number
  - lastPosition: string
  - completedAt?: Timestamp
  - createdAt: Timestamp
  - updatedAt: Timestamp

ai_memory_permissions/{userId}
  - userId: string
  - crossAiSharingEnabled: boolean
  - allowedCategories: AllowedPreferenceCategory[]
  - excludedAiIds: string[]
  - createdAt: Timestamp
  - updatedAt: Timestamp

ai_memory_access_log/{userId}_{aiId}
  - id: string
  - userId: string
  - aiId: string
  - aiName: string
  - accessedPreferences: string[]
  - lastAccessAt: Timestamp
  - totalAccesses: number
```

---

## 📱 Frontend Components

### 1. Social Memory Hub ([`app-mobile/app/profile/social-memory.tsx`](app-mobile/app/profile/social-memory.tsx:1))

**Features:**
- Master toggle for cross-AI sharing
- Memory statistics display
- Quick access to sub-screens
- Wipe all memory button

**Key Methods:**
```typescript
loadMemoryData() // Loads analytics and permissions
toggleCrossAiSharing(enabled: boolean) // Master toggle
handleWipeMemory() // Complete memory deletion
```

### 2. What AIs Know Screen ([`app-mobile/app/profile/social-memory/what-ais-know.tsx`](app-mobile/app/profile/social-memory/what-ais-know.tsx:1))

**Transparency Features:**
- List all shared preferences
- Show which AIs accessed data
- Display access counts and timestamps
- Full transparency guarantee

### 3. Manage Preferences Screen ([`app-mobile/app/profile/social-memory/preferences.tsx`](app-mobile/app/profile/social-memory/preferences.tsx:1))

**Features:**
- Filter by category
- Delete individual preferences
- View confidence scores
- See access statistics

### 4. Memory Permissions Screen ([`app-mobile/app/profile/social-memory/permissions.tsx`](app-mobile/app/profile/social-memory/permissions.tsx:1))

**Controls:**
- Enable/disable categories
- View forbidden data list
- Privacy guarantee section
- Category descriptions

---

## 🔌 Integration Guide

### Step 1: Share Preference from AI Chat

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const sharePreference = httpsCallable(functions, 'pack192_sharePreference');

// When AI learns something about user
await sharePreference({
  userId: currentUserId,
  category: 'topics_liked',
  key: 'favorite_sport',
  value: 'MMA',
  confidence: 0.9,
  sourceAiId: 'ai_companion_123'
});
```

### Step 2: Retrieve Preferences for AI

```typescript
const getPreferences = httpsCallable(functions, 'pack192_getPreferences');

const { data } = await getPreferences({
  userId: currentUserId,
  aiId: 'ai_companion_456',
  categories: ['topics_liked', 'humor_preference']
});

// Use preferences to personalize AI responses
const preferences = data.preferences;
const storyProgress = data.storyProgress;
```

### Step 3: Store Story Progress

```typescript
const storeProgress = httpsCallable(functions, 'pack192_storeStoryProgress');

await storeProgress({
  userId: currentUserId,
  storyId: 'cyberpunk_arc',
  storyName: 'Neon Dreams',
  currentChapter: 5,
  totalChapters: 12,
  lastPosition: 'Chapter 5: The Data Heist'
});
```

---

## 🛡️ Privacy Enforcement

### Automatic Blocking

The middleware automatically blocks:

1. **Emotional Keywords**: lonely, depressed, suicidal, etc.
2. **Financial Data**: bank, credit card, salary, debt, etc.
3. **Personal Identifiers**: password, secret, private, etc.
4. **Relationship Pain**: ex, breakup, heartbreak, etc.
5. **Addiction Signals**: gambling, drugs, alcohol abuse, etc.

### Manual Override

Users can:
- Delete any shared preference
- Disable entire categories
- Exclude specific AIs from memory access
- Wipe all memory completely

### Transparency Guarantee

Every screen shows:
- ✓ What data IS shared
- ✗ What data is NEVER shared
- 📊 Who accessed data and when
- 🔒 Privacy policy explanations

---

## 🧪 Testing Recommendations

### Unit Tests

```typescript
// Test privacy filtering
describe('Social Memory Privacy', () => {
  it('blocks emotional content', async () => {
    const result = evaluateTextForForbiddenContent('I feel so lonely');
    expect(result.allowed).toBe(false);
    expect(result.detectedForbiddenTypes).toContain('emotional_vulnerability');
  });

  it('allows safe preferences', async () => {
    const result = evaluateTextForForbiddenContent('I like MMA and boxing');
    expect(result.allowed).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('Preference Sharing', () => {
  it('shares allowed category successfully', async () => {
    const result = await sharePreferenceAcrossAis.call({
      userId: 'test_user',
      category: 'topics_liked',
      key: 'favorite_food',
      value: 'Korean BBQ'
    });
    expect(result.ok).toBe(true);
  });

  it('blocks forbidden category', async () => {
    const result = await sharePreferenceAcrossAis.call({
      userId: 'test_user',
      category: 'topics_liked',
      key: 'feelings',
      value: 'I am very depressed'
    });
    expect(result.ok).toBe(false);
  });
});
```

### UI Tests

1. **Memory Hub Navigation**
   - Verify all screens accessible
   - Test master toggle
   - Confirm wipe functionality

2. **Transparency Screen**
   - Verify all preferences displayed
   - Check access logs
   - Validate timestamps

3. **Permission Management**
   - Test category toggles
   - Verify save functionality
   - Check privacy guarantee display

---

## 📊 Monitoring & Analytics

### Key Metrics

- Total preferences shared per user
- Active categories per user
- AI access frequency
- Privacy violations blocked
- User wipe requests

### Admin Queries

```typescript
// Get top shared preference categories
db.collection('ai_shared_preferences')
  .where('createdAt', '>=', startDate)
  .get()
  .then(snapshot => {
    // Aggregate by category
  });

// Get AI access patterns
db.collection('ai_memory_access_log')
  .orderBy('totalAccesses', 'desc')
  .limit(100)
  .get();
```

---

## 🚀 Deployment Checklist

- [ ] Deploy Cloud Functions with PACK 192 exports
- [ ] Create Firestore indexes for performance
- [ ] Test privacy middleware with edge cases
- [ ] Deploy mobile UI screens
- [ ] Add navigation to profile screen
- [ ] Test cross-AI preference retrieval
- [ ] Verify memory wipe functionality
- [ ] Enable monitoring and alerts
- [ ] Document for support team
- [ ] Create user education materials

---

## 🔐 Security Considerations

### Data Protection

1. **No PII Sharing** - Names, emails, phones never shared
2. **Category Validation** - Only whitelisted categories allowed
3. **Content Filtering** - All values scanned for forbidden data
4. **Access Logging** - Complete audit trail maintained
5. **User Control** - Users can delete/wipe anytime

### Anti-Abuse

1. **Rate Limiting** - Prevent memory spam
2. **Gossip Detection** - Block AI comparison queries
3. **Manipulation Check** - Detect jealousy attempts
4. **Access Throttling** - Limit excessive preference reads

---

## 📖 User Education

### What Gets Shared

🎯 **Safe Topics**
- Favorite sports, hobbies, food
- Humor style (playful, sarcastic, etc.)
- Preferred communication (voice, text, games)
- Language preferences
- Story progress in AI narratives

### What's Never Shared

🚫 **Protected Information**
- How you feel emotionally
- Financial status or spending
- Personal relationships or pain
- Mental health or fears
- AI preferences or rankings
- Private conversations

---

## 🆘 Support & Troubleshooting

### Common Issues

**Q: Why can't I share certain preferences?**  
A: Privacy filters block emotional, financial, or personal data automatically.

**Q: Can AIs read my private chats?**  
A: No. Only high-level preferences are shared, never conversation content.

**Q: How do I delete all shared data?**  
A: Use "Wipe All Memory" button in Social Memory Hub screen.

**Q: Why do some AIs still ask basic questions?**  
A: Cross-AI sharing may be disabled, or AI hasn't accessed your preferences yet.

---

## 📝 Change Log

### Version 1.0.0 (PACK 192)
- Initial implementation
- 6 allowed preference categories
- 12 forbidden data types
- Complete privacy middleware
- 3 mobile UI screens
- 8 Cloud Functions
- Full transparency layer

---

## 👥 Contributing

When extending PACK 192:

1. **Never** add emotional or financial categories
2. **Always** validate with privacy middleware
3. **Test** thoroughly with forbidden content
4. **Document** any new categories clearly
5. **Maintain** transparency guarantees

---

## 📬 Contact

For questions or issues:
- Technical: Backend team
- Privacy: Security team
- UX: Design team

---

**Built with privacy-first principles. User trust is non-negotiable.**