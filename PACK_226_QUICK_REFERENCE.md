# PACK 226 - Chemistry Lock-In Engine
## Quick Reference Guide

---

## 🎯 OVERVIEW

**Purpose**: Prevent chat drop-off by detecting and reinforcing peak chemistry between matches, converting high-chemistry pairs into sustained paid interactions.

**Key Feature**: Automatically activates when chemistry reaches threshold, provides romantic perks, and guides couples toward paid calls/meetings.

---

## 🔥 CHEMISTRY DETECTION SIGNALS

Lock-In activates when **≥3 signals detected within 5 days**:

| Signal | Requirement | Weight |
|--------|-------------|--------|
| **Messages** | 25+ messages (both sides) | 1 |
| **Long Messages** | 2+ messages ≥800 chars (both) | 1 |
| **Voice Call** | ≥8 min call completed | 1 |
| **Video Call** | ≥5 min call completed | 1 |
| **Inside Joke** | AI-detected recurring humor | 1 |
| **Flirtation** | Compliments exchanged | 1 |
| **Photo Likes** | Mutual photo likes | 1 |
| **Meeting Plans** | Meeting mentioned in chat | 1 |

**Activation**: Total score ≥3 + both users active (not one-sided)

---

## ✨ ACTIVE LOCK-IN PERKS (72 HOURS)

When Chemistry Lock-In activates, both users receive:

1. **Romantic Chat Theme** - Pink/purple neon glow border
2. **Priority Visibility** - 10x boost in each other's feed
3. **"Chemistry On" Badge** - Special badge above chat
4. **Romantic Prompts** - 10 conversation starters
5. **Status Indicator** - Shows chemistry strength (warming up → intense)

**Important**: NO free tokens, calls, or meetings. Only emotional perks.

---

## 💬 CONVERSION SUGGESTIONS (72H MARK)

At 72 hours, AI generates contextual suggestions:

```typescript
// Example suggestions based on chat context
"You two were laughing about exploring new food… want to jump on a quick voice call?"
"The chemistry between you two is rare — coffee date this week?"
"You're in sync — planning a meeting could be fun."
```

**User Can**:
- Accept → Redirects to paid call/meeting booking
- Ignore → No penalty, Lock-In continues

---

## 🚪 LOCK-IN EXIT CONDITIONS

Lock-In ends automatically when:

| Condition | Result |
|-----------|--------|
| 72h of inactivity | Graceful exit |
| User disables suggestions | Exit on request |
| Safety report filed | Permanent exit for pair |
| Breakup Recovery triggered | Exit with cooldown |

**Re-entry**: Pairs can re-enter Lock-In unlimited times if chemistry returns.

---

## 🛡️ ABUSE PREVENTION

### Automatic Protections:

1. **One-Sided Activity**: Lock-In never triggers if >80% messages from one user
2. **Toxic Cooldown**: 14-day Lock-In ban after harassment/toxicity
3. **Notification Limits**: Max 1 chemistry notification per 12 hours
4. **Spam Protection**: AI flags begging for paid interactions
5. **Forced Progress**: System soft-caps conversion prompts

---

## 📱 UI COMPONENTS

### Mobile App Components:

```typescript
// 1. Chemistry Badge
<ChemistryLockInBadge 
  status="strong" 
  isActive={true} 
/>

// 2. Chat Theme Wrapper
<ChemistryChatTheme isActive={true}>
  {/* Chat messages */}
</ChemistryChatTheme>

// 3. Romantic Prompts Modal
<ChemistryRomanticPrompts
  isActive={true}
  onSelectPrompt={(prompt) => sendMessage(prompt)}
  onClose={() => setShowPrompts(false)}
/>

// 4. Conversion Suggestion
<ChemistryConversionSuggestion
  visible={true}
  suggestion="The chemistry is rare — maybe a call?"
  action="voice_call"
  onAccept={startVoiceCall}
  onDismiss={dismissSuggestion}
/>
```

---

## ⚙️ BACKEND FUNCTIONS

### Core Engine Functions:

```typescript
import { 
  detectChemistrySignals,
  activateChemistryLockIn,
  deactivateChemistryLockIn,
  checkConversionSuggestion,
  updateLockInActivity
} from './engines/chemistryLockIn';

// Detect signals for a conversation
const signals = await detectChemistrySignals(
  conversationId, 
  user1Id, 
  user2Id,
  { includeAIAnalysis: true }
);

// Calculate chemistry status
const status = calculateChemistryStatus(signals);
// Returns: { status, score, canActivate, signals }

// Activate Lock-In
const result = await activateChemistryLockIn(
  conversationId, 
  user1Id, 
  user2Id
);

// Check for conversion suggestion
const suggestion = await checkConversionSuggestion(conversationId);
```

### Notification Functions:

```typescript
import {
  sendLockInActivatedNotification,
  sendChemistryContinuingNotification,
  sendConversionSuggestionNotification
} from './notifications/chemistryLockInNotifications';

// Send Lock-In activated notification
await sendLockInActivatedNotification(userId, partnerId, conversationId);

// Send chemistry continuing reminder
await sendChemistryContinuingNotification(userId, partnerId, conversationId);

// Send conversion suggestion
await sendConversionSuggestionNotification(
  userId, 
  partnerId, 
  conversationId,
  "The chemistry is rare — maybe a call?"
);
```

---

## 🔔 NOTIFICATIONS

### Notification Types:

1. **Lock-In Activated**: "✨ Chemistry Detected! You two have amazing chemistry!"
2. **Chemistry Continuing**: "💕 Your chemistry is still strong — want to continue?"
3. **Thinking of You**: "💭 Someone is thinking about you..."
4. **Perks Expiring**: "⏰ Chemistry perks expiring in 24 hours"
5. **Conversion Suggestion**: "🎯 Take the next step? Maybe a call?"

### User Control:

```typescript
// Disable per conversation
await disableChemistryNotifications(userId, conversationId);

// User preferences
user.notificationPreferences = {
  globalNotifications: true,
  chemistryLockIn: true  // Can disable chemistry notifications
};
```

---

## 📊 FIRESTORE SCHEMA

### Conversation Document:

```typescript
{
  chemistryLockIn: {
    isActive: boolean,
    startedAt: Timestamp | null,
    endedAt: Timestamp | null,
    strengthScore: number,
    signals: ChemistrySignal[],
    lastActivityAt: Timestamp,
    exitReason?: 'inactivity' | 'disabled' | 'safety' | 'breakup',
    perksExpiresAt: Timestamp | null,
    conversionSuggestionShown: boolean,
    reEntryCount: number
  },
  toxicCooldownUntil?: Timestamp
}
```

### Visibility Boost:

```typescript
users/{userId}/visibilityBoosts/{partnerId} {
  targetUserId: string,
  conversationId: string,
  reason: 'chemistry_lock_in',
  multiplier: 10,
  expiresAt: Timestamp,
  createdAt: Timestamp
}
```

---

## 🤖 CLOUD FUNCTION TRIGGERS

### Automatic Triggers:

1. **onMessageCreated**: Checks for chemistry signals every 5 messages
2. **onCallCompleted**: Re-evaluates chemistry after calls
3. **dailyLockInMaintenance**: Cron job at 2 AM UTC to expire inactive Lock-Ins
4. **sendDailyChemistryReminders**: Cron job at 10 AM UTC for reminders

### Callable Functions:

```typescript
// Manual chemistry detection
const result = await functions.httpsCallable('triggerChemistryDetection')({
  conversationId: 'abc123'
});

// Disable notifications
await functions.httpsCallable('disableChemistryNotifications')({
  conversationId: 'abc123'
});
```

---

## 💰 TOKENOMICS (UNCHANGED)

Chemistry Lock-In **does NOT change**:

- Chat pricing (100-500 tokens)
- 65/35 revenue split
- 7-vs-11 words earning logic
- Free chat for low-popularity profiles
- Call pricing (10/20 tokens per minute)
- Meeting cancellation/refund logic
- Avalo fee (non-refundable)

**Impact**: Increases engagement → more paid interactions naturally.

---

## 🔍 MONITORING

### Key Metrics:

```typescript
// Active Lock-Ins count
const activeCount = await db
  .collection('conversations')
  .where('chemistryLockIn.isActive', '==', true)
  .count()
  .get();

// Average chemistry score
const avgScore = calculateAverageScore(activeLockIns);

// Conversion rate
const conversionRate = conversionsAfterLockIn / totalLockIns;
```

### Health Checks:

1. Monitor Lock-In activation rate (target: 5-10% of conversations)
2. Track conversion suggestion acceptance rate
3. Monitor abuse prevention triggers
4. Track re-entry frequency

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Deploy Firestore indexes (see PACK_226_FIRESTORE_SCHEMA.md)
- [ ] Deploy security rules
- [ ] Deploy Cloud Functions
- [ ] Run data migration scripts
- [ ] Deploy mobile app components
- [ ] Test detection accuracy with sample data
- [ ] Configure notification preferences UI
- [ ] Enable monitoring dashboards
- [ ] Train support team on Lock-In features

---

## 📞 INTEGRATION EXAMPLES

### In Chat Screen:

```typescript
import { ChemistryLockInBadge, ChemistryChatTheme } from './components';

function ChatScreen({ conversationId }) {
  const conversation = useConversation(conversationId);
  const lockIn = conversation.chemistryLockIn;
  
  return (
    <ChemistryChatTheme isActive={lockIn?.isActive}>
      {lockIn?.isActive && (
        <ChemistryLockInBadge 
          status={getChemistryStatus(lockIn.strengthScore)}
          isActive={true}
        />
      )}
      <MessageList />
    </ChemistryChatTheme>
  );
}
```

### In Discovery Feed:

```typescript
// Boosted visibility for Lock-In partners
function DiscoveryFeed({ userId }) {
  const users = useDiscovery(userId, {
    includeBoosts: true  // Applies 10x multiplier for Lock-In partners
  });
  
  return users.map(user => (
    <ProfileCard 
      key={user.id} 
      user={user}
      badge={user.hasChemistryWith ? "💕 Chemistry" : undefined}
    />
  ));
}
```

---

## ⚠️ IMPORTANT NOTES

1. **Never Override Tokenomics**: Lock-In is about emotional reinforcement, not free economy
2. **Respect User Autonomy**: All notifications are optional and can be disabled
3. **Abuse Prevention First**: Always check for one-sided activity and toxic behavior
4. **Privacy**: Never expose Lock-In state to non-participants
5. **Re-entry Unlimited**: Let chemistry naturally flow in and out

---

## 🎓 BEST PRACTICES

### For Lock-In Activation:
- Wait for genuine chemistry (≥3 signals)
- Ensure bidirectional activity
- Check for toxic cooldowns
- Log activation for analytics

### For Notifications:
- Respect user preferences
- Apply 12-hour cooldowns
- Keep messages romantic but not pushy
- Allow easy opt-out

### For Conversion Suggestions:
- Only show once at 72h mark
- Make suggestions contextual (AI-based)
- Emphasize "optional" and "no pressure"
- Never shame for declining

---

## 📚 RELATED PACKS

- **PACK 221**: Romantic Journeys (complements Lock-In)
- **PACK 222**: Breakup Recovery (handles Lock-In exits)
- **PACK 224**: Romantic Momentum (works with Lock-In signals)
- **PACK 225**: Match Comeback (can trigger Lock-In re-entry)

---

## ✅ CONFIRMATION STRING

```
PACK 226 COMPLETE — Chemistry Lock-In Engine implemented without changing tokenomics, safety logic, or forcing paid actions. System detects chemistry, reinforces emotional bonds, and naturally guides couples toward paid interactions.
```

---

**Last Updated**: December 2, 2025  
**Version**: 1.0.0  
**Status**: ✅ Ready for Deployment