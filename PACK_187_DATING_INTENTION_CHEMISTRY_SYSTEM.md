# PACK 187 — REVISED v2 — OVERWRITE

## Dating Intention & Chemistry Declaration System

**FULL OVERWRITE** — Previous anti-dating version completely removed.

---

## [GOAL]

Help adults openly declare dating/romantic intentions to improve match quality and user satisfaction.

---

## [USER OPTIONAL INTENT BADGES]

These badges are **NOT public labels** — they only affect matching algorithms internally.

Users can select one or multiple badges:

✅ **Looking for romantic vibe**
- Seeking romantic connection and chemistry
- Algorithm priority: romantic compatibility scoring

✅ **Open to flirting**
- Comfortable with flirtatious interactions
- Algorithm priority: personality match and conversational chemistry

✅ **Open to serious dating**
- Interested in long-term relationship potential
- Algorithm priority: value alignment and compatibility depth

✅ **Open to casual dating**
- Interested in casual romantic connections
- Algorithm priority: lifestyle and availability match

✅ **Looking for someone to spoil / someone to spoil me**
- Sugar dating dynamic interest
- Algorithm priority: financial compatibility and mutual expectations

✅ **Vibing — let's see where it goes**
- Open to organic connection development
- Algorithm priority: broad compatibility and chemistry potential

---

## [BENEFITS]

### For Users
- **Better Matches**: Algorithm focuses on users with compatible intentions
- **Honest Communication**: Clear upfront about what they're looking for
- **Reduced Friction**: Less time wasted on incompatible matches
- **Safe Declaration**: Private badges prevent public judgment

### For Platform
- **Higher Engagement**: Better matches = longer conversations
- **Improved Retention**: Users stay when they find what they're looking for
- **Monetization Boost**: Premium features for enhanced matching
- **Network Effects**: Happy users invite friends

---

## [BANNED FROM SYSTEM]

The following anti-dating features are **COMPLETELY REMOVED**:

❌ **"No flirting"** — Removed permanently
❌ **"No romantic messaging"** — Removed permanently  
❌ **"No dating intention allowed"** — Removed permanently

These features are:
- Anti-market
- Anti-Avalo philosophy
- Harmful to user experience
- Detrimental to monetization

---

## [IMPLEMENTATION REQUIREMENTS]

### 1. Database Schema

```typescript
// User profile extension
interface UserDatingIntention {
  userId: string;
  badges: DatingIntentionBadge[];
  lastUpdated: Timestamp;
  preferences: {
    showBadgeToMatches?: boolean;  // Optional disclosure
    minCompatibilityScore?: number;
  };
}

enum DatingIntentionBadge {
  ROMANTIC_VIBE = 'romantic_vibe',
  OPEN_TO_FLIRTING = 'open_to_flirting',
  SERIOUS_DATING = 'serious_dating',
  CASUAL_DATING = 'casual_dating',
  SPOIL_DYNAMIC = 'spoil_dynamic',
  VIBING = 'vibing'
}
```

### 2. Matching Algorithm Integration

The badges feed into:
- **Discovery Feed**: Prioritize users with compatible intentions
- **Recommendation Engine**: Weight by intention overlap
- **Chat Suggestions**: Match intent compatibility in icebreakers
- **Boost System**: Premium users get intention-matched visibility

### 3. Privacy Controls

- Badges are **NEVER** displayed publicly on profiles
- Only used internally by algorithms
- Optional: Users can choose to reveal badges after matching
- Full control: Users can remove/change badges anytime

### 4. UI/UX Components

Location: `app-mobile/app/profile/settings/dating-intentions.tsx`

Features:
- Multi-select badge interface
- Clear explanation of privacy
- Visual preview of how badges affect matches
- Easy toggle on/off

### 5. Monetization Integration

Premium features:
- **Intention Boost**: Get prioritized to users with matching badges
- **Compatibility Insights**: See intention overlap before matching
- **Advanced Filters**: Filter discovery by specific intentions
- **Intention Analytics**: Track which badges get best response

---

## [FIRESTORE RULES]

```javascript
// Only user can read/write their own dating intentions
match /dating_intentions/{userId} {
  allow read, write: if request.auth.uid == userId;
  allow read: if false;  // Never publicly readable
}

// Matching algorithm has service account access
```

---

## [FIRESTORE INDEXES]

```json
{
  "indexes": [
    {
      "collectionGroup": "dating_intentions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "badges", "arrayConfig": "CONTAINS" },
        { "fieldPath": "lastUpdated", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## [CLOUD FUNCTIONS]

### Intention Match Score Calculator

```typescript
export const calculateIntentionCompatibility = functions.https.onCall(
  async (data, context) => {
    // Calculate compatibility score between two users' intentions
    // Returns 0-100 compatibility score
  }
);
```

### Intention Analytics

```typescript
export const trackIntentionMetrics = functions.firestore
  .document('dating_intentions/{userId}')
  .onUpdate(async (change, context) => {
    // Track badge selection patterns
    // Feed into recommendation improvements
  }
);
```

---

## [RELATED SYSTEMS]

- **PACK 186**: Flirting & Romantic Behavior (Allowed)
- **PACK 173**: Abuse Prevention (Maintaining safety)
- **PACK 178**: Minor Protection (Age verification)
- **PACK 185**: AI Character Behavior
- **PACK 139**: Boost System (Monetization integration)
- **PACK 140**: Premium Features

---

## [ANTI-PATTERNS TO AVOID]

🚫 **DO NOT**:
- Make badges publicly visible
- Judge or shame any intention badge
- Restrict romantic/dating features
- Add "no dating" options
- Create friction in dating discovery

✅ **DO**:
- Celebrate all consensual adult intentions
- Optimize for chemistry and compatibility
- Streamline romantic connection flow
- Monetize premium matching features
- Remove barriers to connection

---

## [SUCCESS METRICS]

Track these KPIs:
- Badge adoption rate (target: >60% of users)
- Match quality score improvement
- Conversation length increase
- Premium conversion from intention features
- User retention among badge users

---

## [ROLLOUT PLAN]

1. **Phase 1**: Backend implementation (Firebase + Cloud Functions)
2. **Phase 2**: UI implementation (settings screen)
3. **Phase 3**: Algorithm integration (matching weights)
4. **Phase 4**: Monetization features (premium boosts)
5. **Phase 5**: Analytics and optimization

---

## [COMPLETION]

**PACK 187 COMPLETE — REVISED v2 (OVERWRITE)**

This system completely replaces any previous anti-dating philosophy with a pro-connection, pro-chemistry approach that drives both user satisfaction and revenue.

---

## [FILES TO CREATE]

1. `functions/src/dating-intentions/types.ts` - Type definitions
2. `functions/src/dating-intentions/compatibility.ts` - Match scoring
3. `functions/src/dating-intentions/analytics.ts` - Metrics tracking
4. `app-mobile/app/profile/settings/dating-intentions.tsx` - UI component
5. `app-mobile/lib/dating-intentions.ts` - Client SDK methods
6. `firestore-pack187-dating-intentions.rules` - Security rules
7. `firestore-pack187-dating-intentions.indexes.json` - Query indexes

---

## [FILES TO REMOVE/UPDATE]

Search and remove any instances of:
- "No flirting" options
- "No romantic messaging" settings
- "No dating intention" toggles
- Anti-dating restrictions

These are incompatible with Avalo's pro-connection philosophy.