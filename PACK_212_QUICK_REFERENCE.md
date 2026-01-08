# PACK 212 — Quick Reference Guide

## 🎯 Core Concept

Silent reputation engine that **rewards good behavior through discovery boosts** while **never exposing scores** or shaming users. All ranking adjustments happen behind the scenes.

---

## 📊 REPUTATION SCORE SYSTEM

### Score Range: 0-100 (Internal Only)

| Level | Score | User Sees | Discovery Effect |
|-------|-------|-----------|------------------|
| **EXCELLENT** | 80-100 | Positive hints | 1.5x boost |
| **GOOD** | 60-79 | Positive hints | 1.25x boost |
| **NEUTRAL** | 40-59 | Nothing | 1.0x (normal) |
| **POOR** | 20-39 | Nothing | 0.8x limiter |
| **CRITICAL** | 0-19 | Nothing | 0.5x limiter |

### Score Adjustments

**Increases (Positive Behavior):**
- Chat response timely: +1
- Quality conversation: +2
- Positive feedback: +3
- Meeting attended: +5
- Positive vibe rating: +5
- Event attended: +4
- Good guest rating: +4
- Voluntary refund: +6

**Decreases (Negative Behavior):**
- Last-minute cancel: -5
- Blocked by user: -8
- Spam messages: -10
- Meeting no-show: -10
- Appearance complaint: -12
- Harassment verified: -15
- System abuse: -20
- Chargeback abuse: -25

---

## 🔌 API QUICK REFERENCE

### User Functions

```typescript
// Get positive hint (if applicable)
pack212_getMyReputationHint()
// Returns: { hasHint, message?, positiveStats? }

// Submit chat feedback
pack212_submitChatFeedback({
  chatId, receiverId, isPositive, comment?
})

// Submit meeting feedback
pack212_submitMeetingFeedback({
  bookingId, receiverId, vibeRating, showedUp, wouldMeetAgain, comment?
})

// Rate event guest (organizer only)
pack212_rateEventGuest({
  eventId, attendeeId, guestId, isGoodGuest, showedUp, respectful, engaged, comment?
})
```

### Integration Functions

```typescript
// Update reputation (system/admin only)
pack212_updateReputation({
  userId, eventType, relatedUserId?, contextId?, metadata?
})

// Get ranking multiplier for discovery
pack212_getRankingMultiplier({
  userId, context: 'DISCOVERY' | 'FEED' | 'SUGGESTIONS' | 'CHEMISTRY' | 'PASSPORT'
})
// Returns: { multiplier: 0.5-1.5, level, hasBoost, hasLimiter }
```

### Admin Functions

```typescript
// Get statistics
pack212_admin_getStats()

// Get user's full profile
pack212_admin_getUserReputation({ userId })

// Recalculate all adjustments
pack212_admin_recalculateAdjustments()
```

---

## 🔥 FIRESTORE COLLECTIONS

| Collection | Purpose | Key Fields |
|------------|---------|-----------|
| `user_reputation` | Main profile | reputationScore, activeBoost, counters |
| `reputation_events` | Audit trail | eventType, scoreImpact, timestamp |
| `chat_feedback` | Optional ratings | isPositive, comment |
| `meeting_feedback` | Post-meeting | vibeRating, showedUp |
| `event_guest_ratings` | Organizer ratings | isGoodGuest, respectful |
| `reputation_adjustments` | Active boosts | multipliers, appliesTo |

---

## ✅ INTEGRATION CHECKLIST

### Chat System
```typescript
// After quality conversation
if (chatDuration > 30min && engaged) {
  await pack212_updateReputation({
    userId: receiverId,
    eventType: 'CHAT_QUALITY_HIGH',
    contextId: chatId
  });
}

// Allow optional feedback
showFeedbackPrompt({ chatId, receiverId });
```

### Meeting System
```typescript
// Track attendance
if (userShowedUp) {
  await pack212_updateReputation({
    userId,
    eventType: 'MEETING_ATTENDED',
    contextId: bookingId
  });
} else {
  await pack212_updateReputation({
    userId,
    eventType: 'MEETING_NO_SHOW',
    contextId: bookingId
  });
}

// Optional vibe feedback
showMeetingFeedbackPrompt({ bookingId, receiverId });
```

### Event System
```typescript
// After event ends
allowOrganizerToRateGuests({ eventId, attendees });

// Track attendance
if (guestAttended) {
  await pack212_updateReputation({
    userId: guestId,
    eventType: 'EVENT_ATTENDED',
    contextId: eventId
  });
}
```

### Discovery System
```typescript
// Apply multiplier to ranking
const { multiplier } = await pack212_getRankingMultiplier({
  userId,
  context: 'DISCOVERY'
});

const finalScore = baseRankingScore * multiplier;
```

---

## 💬 UX COPY TEMPLATES

### ✅ Correct (Always Use)

**Positive Hints:**
- "People enjoy interacting with you on Avalo."
- "Your good energy is opening more doors in discovery."
- "You're building a strong reputation — keep it up."

**Prompts:**
- "How was your chat experience?" (thumbs up/down)
- "How was the vibe?" (after meeting)
- "Rate your guest experience" (organizer)

### ❌ Incorrect (Never Use)

- ~~"Your reputation is bad"~~
- ~~"You are ranked low"~~
- ~~"Fix your behavior"~~
- ~~"Your score is X"~~
- ~~"You're being limited due to..."~~

---

## 🚀 DEPLOYMENT STEPS

1. **Deploy Rules:**
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

2. **Deploy Functions:**
   ```bash
   firebase deploy --only functions:pack212
   ```

3. **Initialize Users:**
   ```bash
   firebase functions:call pack212_admin_recalculateAdjustments
   ```

4. **Integrate Discovery:**
   - Add [`pack212_getRankingMultiplier()`](functions/src/pack212-reputation-functions.ts:458) calls
   - Apply multipliers to ranking scores

5. **Add Feedback UI:**
   - Post-chat thumbs up/down prompt
   - Post-meeting vibe rating
   - Event organizer guest rating

---

## 🎚️ RANKING MULTIPLIERS

| Level | Discovery | Feed | Suggestions |
|-------|-----------|------|-------------|
| **EXCELLENT** | 1.5x | 1.4x | 1.6x |
| **GOOD** | 1.25x | 1.2x | 1.3x |
| **NEUTRAL** | 1.0x | 1.0x | 1.0x |
| **POOR** | 0.8x | 0.85x | 0.75x |
| **CRITICAL** | 0.5x | 0.6x | 0.4x |

---

## 🔒 PRIVACY RULES

### What Users See
- ✅ Positive hints (if score ≥60)
- ✅ Their positive interaction count
- ✅ Feedback they gave/received

### What Users DON'T See
- ❌ Actual score (0-100)
- ❌ Reputation level
- ❌ Why they're limited
- ❌ Others' reputation data
- ❌ Ranking position

### What's Silent
- ❌ Score changes (background only)
- ❌ Boost/limiter activation
- ❌ Ranking adjustments

---

## 📊 MONITORING METRICS

### Track Daily
- Average reputation score
- Active boosts count
- Active limiters count
- Score distribution

### Track Weekly
- Reputation trends
- Feedback submission rate
- Correlation with safety
- Boost effectiveness

### Alert On
- Critical users (score <10)
- Sudden drops (>20 points)
- Low feedback participation
- System abuse patterns

---

## 🧪 KEY TEST SCENARIOS

✅ **Score Calculations:**
- Positive events increase score
- Negative events decrease score
- Score stays within 0-100
- Levels trigger correctly

✅ **Boosts & Limiters:**
- EXCELLENT gets 1.5x boost
- GOOD gets 1.25x boost
- POOR gets 0.8x limiter
- CRITICAL gets 0.5x limiter

✅ **User Experience:**
- Only positive hints shown
- No negative messages
- Feedback forms work
- Daily limits enforced

✅ **Integration:**
- Chat triggers updates
- Meetings track attendance
- Events rate guests
- Discovery applies multipliers
- Safety adjusts risk

---

## 🔗 INTEGRATION WITH OTHER PACKS

### PACK 209 (Refunds)
- Voluntary refund → +6 reputation
- Appearance complaint → -12 reputation

### PACK 210 (Safety Tracking)
- Meeting attended → +5 reputation
- No-show → -10 reputation

### PACK 211 (Adaptive Safety)
- High reputation → -10% effective risk
- Low reputation → +20% effective risk
- Stalker pattern → -15 reputation

---

## 🐛 TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Score not updating | Check Cloud Functions logs |
| User complains about visibility | Check reputation silently - don't mention to user |
| Boost not applying | Verify [`pack212_getRankingMultiplier()`](functions/src/pack212-reputation-functions.ts:458) called |
| Feedback not submitted | Check daily limits & eligibility |

---

## 🎯 KEY PRINCIPLES

1. **Invisible Protection** — All adjustments happen behind scenes
2. **Privacy First** — Scores never exposed to users
3. **Positive Messaging** — Only show good news
4. **Extension Only** — Does not replace existing logic
5. **Recovery Allowed** — Users can always improve

---

## 📞 Quick Links

- **Full Docs:** [`PACK_212_IMPLEMENTATION_COMPLETE.md`](PACK_212_IMPLEMENTATION_COMPLETE.md)
- **Types:** [`pack212-reputation-types.ts`](functions/src/pack212-reputation-types.ts)
- **Engine:** [`pack212-reputation-engine.ts`](functions/src/pack212-reputation-engine.ts)
- **Functions:** [`pack212-reputation-functions.ts`](functions/src/pack212-reputation-functions.ts)
- **Rules:** [`firestore-pack212-reputation.rules`](firestore-pack212-reputation.rules)
- **Indexes:** [`firestore-pack212-reputation.indexes.json`](firestore-pack212-reputation.indexes.json)

---

**Version:** 1.0.0  
**Last Updated:** December 2, 2025  
**Status:** ✅ Production Ready

**PACK 212 COMPLETE — Soft Reputation Engine (Reward Good Dates & High-Quality Conversation) implemented**