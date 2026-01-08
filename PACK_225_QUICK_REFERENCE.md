# PACK 225 - Match Comeback Engine - Quick Reference

## TL;DR

Re-ignites cooled chats → more chemistry, more paid interactions, less silent churn. Safety-first with anti-spam guards. No pricing changes.

---

## Quick Integration

### Backend

```typescript
// Import core functions
import {
  detectCooledChat,
  checkRekindleEligibility,
  generateRekindleSuggestions,
  createRekindleAttempt,
  trackRekindleConversion,
} from './pack-225-match-comeback';

// Import integration hooks
import {
  sendRekindleMessage,
  onRekindleReply,
  onRekindleLeadsToCall,
  onRekindleLeadsToMeeting,
} from './pack-225-match-comeback-integration';

// Generate daily suggestions
const suggestions = await generateRekindleSuggestions(userId, 5);
await saveRekindleSuggestions(suggestions);

// Send rekindle message
const result = await sendRekindleMessage(
  initiatorId,
  chatId,
  recipientId,
  messageText,
  templateUsed
);

// Track conversion
await onRekindleLeadsToCall(chatId, 'voice', tokenAmount);
```

### Frontend

```typescript
// Import components
import RekindleStrip from '@/components/RekindleStrip';
import RekindleMessageModal from '@/components/RekindleMessageModal';

// Display at top of chat list
<RekindleStrip
  userId={currentUserId}
  onSuggestionTap={handleSuggestionTap}
/>

// Message composer
<RekindleMessageModal
  visible={modalVisible}
  suggestion={selectedSuggestion}
  partnerName={partnerProfile?.displayName}
  onClose={() => setModalVisible(false)}
  onSuccess={handleSuccess}
/>
```

---

## Cooled Chat Detection

| Connection Depth | Inactivity Threshold | Requires |
|------------------|----------------------|----------|
| Light flirting | 5 days | ≥8 messages |
| Call/long chat | 3 days | ≥1 call OR ≥20 messages |
| Meeting together | 2 days | ≥1 verified meeting |

**Key Rule**: Never rekindle "hi" + "hi" chats without engagement

---

## Eligibility Checks

System automatically blocks rekindle if:
- ❌ Users have blocked each other
- ❌ Active safety complaint exists
- ❌ Breakup recovery active (PACK 222)
- ❌ User opted out of rekindle
- ❌ Spam limits exceeded
- ❌ No-reply cooldown active

---

## Anti-Spam Guards

| Guard | Limit | Period |
|-------|-------|--------|
| Max attempts per pair | 2 | 30 days |
| No-reply cooldown | 60 days | After ignored attempt |
| Daily prompts per user | 3 | Per day |
| Suggestion expiry | 7 days | Auto-cleanup |

---

## Message Templates

### ✅ Allowed (Safe & Respectful)

```javascript
"I liked our last conversation — want to continue where we left off?"
"Your vibe was nice, I'd like to hear more about {topic}."
"We kind of disappeared — still up for chatting?"
"I was thinking about that thing you said about {topic}…"
"It's been a while! How have you been?"
"I enjoyed our {activity} — would love to catch up again."
```

### ❌ Forbidden

- Guilt-tripping: "Why did you ghost me?"
- Pressure: "You owe me a reply."
- Comparisons: "Nobody else talks like you."
- Toxic dependency: "I can't stop thinking about you."

---

## Chemistry Scoring

| Score | Label | Badge | Priority |
|-------|-------|-------|----------|
| 80-100 | 🔥 High chemistry | Red | Highest |
| 60-79 | ✨ Good match | Purple | High |
| 50-59 | 💜 Worth trying | Gray | Medium |

**Factors**:
- Connection depth: +10 to +30
- Message count: Up to +20
- Positive vibe feedback: +15
- Romantic Journey history: +20
- Romantic Momentum (PACK 224): +20% boost

---

## UI Components

### RekindleStrip
- **Location**: Top of chat list
- **Display**: 3-5 cards, horizontal scroll
- **Collapsible**: Minimizes to banner
- **Real-time**: Firestore listener updates

### RekindleSuggestionCard
- Profile photo
- Connection depth badge (🤝 📞 💬)
- Last good energy marker
- Chemistry badge

### RekindleMessageModal
- Pre-filled template (editable)
- 500 character limit
- Message guidelines
- Send/cancel actions

---

## PACK Integrations

### PACK 221: Romantic Journeys

```typescript
// Suggest after journey completion
await onJourneyCompletedPositively(userId, partnerId, journeyId);
```

### PACK 222: Breakup Recovery

```typescript
// Generate after recovery
await onBreakupRecoveryCompleted(userId);
```

### PACK 223: Destiny Week

```typescript
// Surface themed suggestions
await surfaceRekindleForDestinyWeek(userId, weekTheme);
```

### PACK 224: Romantic Momentum

```typescript
// Automatic boost in suggestion generator
// High momentum partners get +20% chemistry score
```

---

## Conversion Tracking

```typescript
// Track revenue from rekindle
await trackRekindleConversion(attemptId, 'chat', tokenAmount);
await trackRekindleConversion(attemptId, 'call', tokenAmount);
await trackRekindleConversion(attemptId, 'meeting', tokenAmount);
await trackRekindleConversion(attemptId, 'event', tokenAmount);
```

---

## Analytics

```typescript
import { getRekindleAnalytics } from './pack-225-match-comeback';

const analytics = await getRekindleAnalytics(userId);
// Returns:
{
  totalAttempts: number;
  successfulAttempts: number;
  replyRate: number;           // Percentage
  avgTimeToReply: number;      // Minutes
  topTemplates: Array<...>;
  byConnectionDepth: {...};
}
```

---

## Database Collections

```
rekindle_suggestions/        - Active suggestions for users
rekindle_attempts/          - Message attempts log
rekindle_conversions/       - Revenue tracking
rekindle_impressions/       - View tracking
rekindle_dismissals/        - User dismissals
```

---

## Scheduled Functions

```typescript
// Daily suggestion generation (09:00 UTC)
export const generateRekindleSuggestionsDaily = onSchedule(
  { schedule: 'every day 09:00' },
  async () => {
    const count = await generateDailySuggestions();
    logger.info(`Generated ${count} suggestions`);
  }
);

// Expired suggestion cleanup (03:00 UTC)
export const cleanupExpiredRekindleSuggestions = onSchedule(
  { schedule: 'every day 03:00' },
  async () => {
    const count = await cleanupExpiredSuggestions();
    logger.info(`Cleaned up ${count} expired suggestions`);
  }
);
```

---

## Economic Rules (UNCHANGED)

### ✅ What Stays the Same
- Token prices (100-500 per chat)
- 65/35 split
- Word-count logic (7 vs 11 words)
- Call/meeting/event pricing
- Refund rules
- Free chat logic
- Fan/Kiss Engine
- Dynamic Pricing (PACK 219)
- Romantic Journeys (PACK 221)

**Result**: More engagement → More organic paid conversions (no price changes)

---

## Testing Checklist

Backend:
- [ ] Cooled chat detection works
- [ ] Eligibility checks all safety rules
- [ ] Chemistry scoring accurate
- [ ] Template selection appropriate
- [ ] Spam limits enforced
- [ ] Suggestions expire correctly
- [ ] Analytics track properly

Frontend:
- [ ] Strip renders suggestions
- [ ] Cards show correct badges
- [ ] Modal opens/closes correctly
- [ ] Message sends successfully
- [ ] Loading states display
- [ ] Error handling works

Integration:
- [ ] Chat monetization works
- [ ] Reply detection triggers
- [ ] Conversions tracked
- [ ] Journey integration works
- [ ] Momentum boost applied

---

## Files Reference

**Backend:**
- [`functions/src/pack-225-match-comeback.ts`](functions/src/pack-225-match-comeback.ts:1) — Core engine (822 lines)
- [`functions/src/pack-225-match-comeback-integration.ts`](functions/src/pack-225-match-comeback-integration.ts:1) — Integration (353 lines)

**Frontend:**
- [`app-mobile/app/components/RekindleStrip.tsx`](app-mobile/app/components/RekindleStrip.tsx:1) — Chat list strip
- [`app-mobile/app/components/RekindleSuggestionCard.tsx`](app-mobile/app/components/RekindleSuggestionCard.tsx:1) — Card component
- [`app-mobile/app/components/RekindleMessageModal.tsx`](app-mobile/app/components/RekindleMessageModal.tsx:1) — Message composer

**Database:**
- [`firestore-pack225-match-comeback.rules`](firestore-pack225-match-comeback.rules:1) — Security rules
- [`firestore-pack225-match-comeback.indexes.json`](firestore-pack225-match-comeback.indexes.json:1) — Indexes

**Docs:**
- [`PACK_225_MATCH_COMEBACK_IMPLEMENTATION.md`](PACK_225_MATCH_COMEBACK_IMPLEMENTATION.md:1) — Complete guide

---

## Deployment

```bash
# 1. Deploy rules
firebase deploy --only firestore:rules

# 2. Deploy indexes (wait 5-10 min)
firebase deploy --only firestore:indexes

# 3. Deploy functions
cd functions && firebase deploy --only functions

# 4. Deploy mobile app
# Build and deploy with new components
```

---

## User Settings

```typescript
// Allow opt-out
await db.collection('users').doc(userId)
  .collection('settings').doc('preferences')
  .update({
    rekindleSuggestionsEnabled: false,
    rekindleNotificationsEnabled: false,
  });

// Frequency control
const frequencies = {
  NORMAL: 'Show all suggestions',
  REDUCED: 'Show fewer suggestions',
  MINIMAL: 'Only high-chemistry matches',
};
```

---

## Troubleshooting

**Issue:** Suggestions not appearing  
**Fix:** Check cooled chat criteria, opt-out status, spam limits, blocks

**Issue:** Messages not sending  
**Fix:** Verify chat exists, tokens sufficient, no blocks, spam limits OK

**Issue:** Analytics not updating  
**Fix:** Check conversion tracking calls, indexes deployed, timestamps valid

---

## Success Metrics

### Engagement
- Suggestion view rate
- Card click rate
- Message send rate
- Reply rate
- Conversion rate

### Revenue
- Tokens per rekindle
- Call conversion %
- Meeting conversion %
- Event conversion %
- LTV increase

### Safety
- Spam reports
- Block rate after rekindle
- Opt-out rate

---

## Confirmation String

```
PACK 225 COMPLETE — Match Comeback Engine implemented without changing tokenomics or safety rules.
```

---

**Status:** ✅ Ready for Production  
**Version:** 1.0  
**Last Updated:** 2025-12-02