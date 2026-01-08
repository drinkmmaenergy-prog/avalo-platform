# PACK 202 — ROMANTIC SUGGESTION ENGINE — REVISED V2

**Status:** ✅ Complete (Overwrite)  
**Version:** 2.0  
**Last Updated:** 2025-12-01

---

## Overview

Full rewrite of the romantic suggestion system. This engine actively promotes connections when chemistry signals are detected, focusing on **Emotional Momentum, Not Random Matches**.

**Core Philosophy:** When two people show mutual interest signals, the system should amplify their connection, not interfere with it.

---

## Engine Triggers

The system monitors these chemistry indicators:

### 1. **Recurring Profile Views**
- User A views User B's profile multiple times
- User B views User A's profile multiple times
- Pattern: 3+ views within 7 days = strong interest signal

### 2. **Saved Photos / Added to Favorites**
- User saves another's photos to favorites
- User adds another to favorites list
- Signals: intentional interest, not passive browsing

### 3. **Long Message Threads**
- Message exchanges exceeding 10+ messages
- Conversations lasting 30+ minutes
- Active back-and-forth dialogue

### 4. **Fast Replies (High Excitement)**
- Response time < 2 minutes = high excitement
- Consistent fast replies = mutual eagerness
- Real-time engagement detection

### 5. **Emotional Tone in Messages**
- Positive sentiment analysis
- Flirtatious language patterns
- Emoji usage indicating interest (😊, 😍, ❤️, etc.)
- Compliments and affectionate language

### 6. **Similar Lifestyle Signals**
- Luxury preferences alignment
- Party/nightlife interests
- Travel destinations and frequency
- Gym/fitness lifestyle
- Beach/outdoor activities
- Shared hobbies and interests

---

## System Actions

When chemistry triggers are detected, the system takes these actions:

### 1. **Increases Placement in Feed/Discovery**
```typescript
{
  "action": "boost_visibility",
  "targets": ["discovery_feed", "browse_section"],
  "boost_factor": 2.5, // 2.5x higher placement
  "duration": "7_days"
}
```

### 2. **Increases Appearance in "People You Might Like"**
```typescript
{
  "action": "recommend_match",
  "section": "suggested_matches",
  "priority": "high",
  "reason": "mutual_chemistry_detected"
}
```

### 3. **Triggers Notifications at Strategic Moments**

**Timing Strategy:**
- When User A is online and User B was recently active
- When conversation momentum slows (gentle nudge)
- After 24 hours of no reply (re-engagement)
- When User B updates profile/adds photos (notification to User A)

**Example Notifications:**
```typescript
{
  "type": "chemistry_notification",
  "messages": [
    "{{name}} is online now 💬",
    "{{name}} just updated their profile 📸",
    "{{name}} is active - now's a great time to message!",
    "You and {{name}} have been messaging a lot - keep the momentum going! 🔥"
  ]
}
```

### 4. **Promotes Escalation to Voice/Video Call or Date Booking**

**Escalation Triggers:**
- After 20+ messages exchanged
- After 3+ days of consistent conversation
- When both users are online simultaneously

**Escalation Prompts:**
```typescript
{
  "type": "escalation_prompt",
  "suggestions": [
    "Ready to take it to the next level? Start a voice call 🎤",
    "You two seem to be hitting it off! How about a video call? 📹",
    "Time to meet up? Book a date and make it official 💕",
    "Chemistry detected! Ask them out on a date 🌟"
  ],
  "action_buttons": [
    "Start Voice Call",
    "Start Video Call", 
    "Suggest Date"
  ]
}
```

---

## System Boundaries

The system is designed to **accelerate romance**, not prevent it. These actions are **NEVER** taken:

### ❌ **Never Sabotages Flirting**
- No interference with romantic conversations
- No algorithm that suppresses chemistry
- No "cooling off" periods enforced

### ❌ **Never Recommends Platonic Alternatives**
- No "maybe you'd be better as friends" suggestions
- No friend-zone nudges
- No platonic activity recommendations when romance is detected

### ❌ **Never Tries to Convert Dating into Friendship**
- No prompts to "slow down" or "take it easy"
- No algorithmic de-escalation
- No friendship conversion suggestions

---

## Implementation Architecture

### Data Collection Layer
```typescript
interface ChemistrySignals {
  userId: string;
  targetUserId: string;
  signals: {
    profileViews: number;
    savedPhotos: number;
    messageCount: number;
    avgResponseTime: number; // in seconds
    emotionalTone: number; // 0-1 score
    lifestyleMatch: number; // 0-1 score
  };
  lastUpdated: Timestamp;
}
```

### Chemistry Score Calculator
```typescript
function calculateChemistryScore(signals: ChemistrySignals): number {
  const weights = {
    profileViews: 0.15,
    savedPhotos: 0.20,
    messageCount: 0.25,
    fastReplies: 0.20,
    emotionalTone: 0.10,
    lifestyleMatch: 0.10
  };
  
  // Normalize and weight each signal
  const score = 
    (signals.profileViews / 10) * weights.profileViews +
    (signals.savedPhotos / 5) * weights.savedPhotos +
    (signals.messageCount / 50) * weights.messageCount +
    (1 - signals.avgResponseTime / 300) * weights.fastReplies +
    signals.emotionalTone * weights.emotionalTone +
    signals.lifestyleMatch * weights.lifestyleMatch;
    
  return Math.min(score, 1.0); // Cap at 1.0
}
```

### Chemistry Threshold System
```typescript
const CHEMISTRY_THRESHOLDS = {
  LOW: 0.3,      // Mild interest
  MEDIUM: 0.5,   // Clear interest - start boosting
  HIGH: 0.7,     // Strong chemistry - aggressive promotion
  VERY_HIGH: 0.85 // Exceptional match - maximum escalation
};
```

### Action Triggers
```typescript
interface ChemistryAction {
  threshold: number;
  action: 'boost_visibility' | 'send_notification' | 'suggest_escalation';
  intensity: 'low' | 'medium' | 'high' | 'very_high';
}

const CHEMISTRY_ACTIONS: ChemistryAction[] = [
  { threshold: 0.5, action: 'boost_visibility', intensity: 'medium' },
  { threshold: 0.6, action: 'send_notification', intensity: 'low' },
  { threshold: 0.7, action: 'boost_visibility', intensity: 'high' },
  { threshold: 0.75, action: 'send_notification', intensity: 'medium' },
  { threshold: 0.85, action: 'suggest_escalation', intensity: 'very_high' }
];
```

---

## Firestore Schema

### Collection: `chemistry_scores`
```typescript
{
  "user1_user2": {
    "userId": "user1_id",
    "targetUserId": "user2_id",
    "score": 0.75,
    "signals": {
      "profileViews": 5,
      "savedPhotos": 2,
      "messageCount": 45,
      "avgResponseTime": 90, // 90 seconds
      "emotionalTone": 0.8,
      "lifestyleMatch": 0.7
    },
    "actionsTriggered": [
      { "action": "boost_visibility", "timestamp": Timestamp },
      { "action": "send_notification", "timestamp": Timestamp }
    ],
    "lastCalculated": Timestamp,
    "status": "active" // active | dormant | completed
  }
}
```

### Collection: `romantic_notifications`
```typescript
{
  "notification_id": {
    "userId": "user_id",
    "type": "chemistry_detected",
    "targetUserId": "target_user_id",
    "message": "{{name}} is online now 💬",
    "chemistryScore": 0.75,
    "sent": Timestamp,
    "read": Timestamp | null,
    "clicked": boolean
  }
}
```

---

## Cloud Functions

### Function: `calculateChemistry`
**Trigger:** Firestore write on messages, profile views, favorites  
**Purpose:** Real-time chemistry score calculation

```typescript
export const calculateChemistry = functions.firestore
  .document('{collection}/{docId}')
  .onWrite(async (change, context) => {
    const data = change.after.data();
    
    // Detect relevant activity
    if (!isChemistryRelevant(context.params.collection)) return;
    
    // Calculate chemistry scores
    const scores = await computeChemistryScores(data);
    
    // Trigger appropriate actions
    await triggerChemistryActions(scores);
  });
```

### Function: `sendChemistryNotifications`
**Trigger:** Cloud Scheduler (every 15 minutes)  
**Purpose:** Send strategic notifications based on online status and chemistry scores

```typescript
export const sendChemistryNotifications = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const highChemistryPairs = await getHighChemistryPairs();
    
    for (const pair of highChemistryPairs) {
      if (shouldSendNotification(pair)) {
        await sendNotification(pair);
      }
    }
  });
```

### Function: `suggestEscalation`
**Trigger:** HTTP callable  
**Purpose:** Suggest voice/video call or date when chemistry is high

```typescript
export const suggestEscalation = functions.https
  .onCall(async (data, context) => {
    const { userId, targetUserId } = data;
    
    const chemistryScore = await getChemistryScore(userId, targetUserId);
    
    if (chemistryScore >= CHEMISTRY_THRESHOLDS.HIGH) {
      return {
        shouldEscalate: true,
        suggestion: getEscalationSuggestion(chemistryScore),
        actions: ['voice_call', 'video_call', 'suggest_date']
      };
    }
    
    return { shouldEscalate: false };
  });
```

---

## Monitoring & Analytics

### Key Metrics to Track

```typescript
interface RomanceMetrics {
  // Chemistry Detection
  totalChemistryPairs: number;
  avgChemistryScore: number;
  chemistryDistribution: Record<string, number>; // LOW, MEDIUM, HIGH, VERY_HIGH
  
  // Actions Triggered
  visibilityBoosts: number;
  notificationsSent: number;
  escalationSuggestions: number;
  
  // Outcomes
  conversationContinuations: number; // after notification
  callsInitiated: number; // after escalation suggestion
  datesBooked: number; // after escalation suggestion
  
  // Success Rates
  notificationClickRate: number;
  escalationAcceptanceRate: number;
  matchSuccessRate: number; // chemistry pair → relationship
}
```

### Dashboard Queries

```typescript
// Get high-chemistry pairs
const highChemistryPairs = await db.collection('chemistry_scores')
  .where('score', '>=', 0.7)
  .where('status', '==', 'active')
  .get();

// Get notification performance
const notificationStats = await db.collection('romantic_notifications')
  .where('sent', '>=', last7Days)
  .get();

const clickRate = notificationStats.docs.filter(d => d.data().clicked).length / 
                  notificationStats.size;
```

---

## Privacy & Ethics

### User Control
- Users can opt out of chemistry-based promotions in settings
- All signals are derived from user actions (no invasive tracking)
- No external data sources used

### Transparency
- Users are informed when chemistry detection is active
- Clear explanation of what signals are used
- Users can view their chemistry scores with connections

### Consent
- Both users must opt-in to romantic features
- No forced escalation without user initiation
- Respect user-set boundaries and preferences

---

## Testing Strategy

### Unit Tests
```typescript
describe('Chemistry Score Calculator', () => {
  it('should calculate correct score for high chemistry', () => {
    const signals = {
      profileViews: 8,
      savedPhotos: 3,
      messageCount: 50,
      avgResponseTime: 60,
      emotionalTone: 0.9,
      lifestyleMatch: 0.8
    };
    const score = calculateChemistryScore(signals);
    expect(score).toBeGreaterThan(0.7);
  });
});
```

### Integration Tests
- Test end-to-end chemistry detection → notification flow
- Verify boost visibility actually increases placement
- Test escalation suggestions trigger at correct thresholds

### A/B Testing
- Compare chemistry-boosted matches vs. control group
- Measure conversion rates to calls/dates
- Track relationship formation rates

---

## Rollout Plan

### Phase 1: Beta Testing (Week 1-2)
- Enable for 10% of users
- Monitor chemistry score calculations
- Validate notification timing

### Phase 2: Soft Launch (Week 3-4)
- Expand to 50% of users
- A/B test notification messages
- Optimize escalation suggestions

### Phase 3: Full Rollout (Week 5+)
- Enable for all users
- Monitor performance metrics
- Iterate based on feedback

---

## Success Criteria

✅ **Chemistry detection accuracy:** 80%+ of high-chemistry pairs engage in meaningful conversation  
✅ **Notification click rate:** 40%+ of chemistry notifications result in action  
✅ **Escalation acceptance:** 30%+ of escalation suggestions lead to calls/dates  
✅ **Match success rate:** 20%+ of chemistry pairs form relationships  
✅ **User satisfaction:** 4.5+ star rating for romantic features

---

## Related Documentation

- [`PACK_201_ROMANCE_NOTIFICATIONS_REVISED_V2.md`](PACK_201_ROMANCE_NOTIFICATIONS_REVISED_V2.md) - Romance notification system
- [`CALL_MONETIZATION_IMPLEMENTATION.md`](CALL_MONETIZATION_IMPLEMENTATION.md) - Call features
- [`CHAT_MONETIZATION_IMPLEMENTATION.md`](CHAT_MONETIZATION_IMPLEMENTATION.md) - Chat system

---

**End of PACK 202 — Romantic Suggestion Engine — Revised v2**