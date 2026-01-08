# PACK 153 — Anti-Harassment & Hate-Speech Neural Filter 2.0
## Quick Reference Guide

---

## 📋 Core Concepts

### Protected Behaviors (NEVER BLOCKED)
- ✅ Polite conversation
- ✅ Constructive criticism
- ✅ Consensual debate
- ✅ Neutral flirting (not monetized)
- ✅ Professional networking
- ✅ Humor and sarcasm
- ✅ Strong language (non-directed)

### Zero-Tolerance Violations (INSTANT ACTION)
- 🛑 Violent threats
- 🛑 Sexual coercion
- 🛑 Hate speech (misogyny, racism, homophobia, transphobia, xenophobia)
- 🛑 Harassment after "STOP"
- 🛑 Blackmail & extortion
- 🛑 NSFW content
- 🛑 Romance for payment
- 🛑 Predatory solicitation

### Penalty Ladder
```
Level 0: Clean     → No restrictions
Level 1: Warning   → Education tips
Level 2: Slow-Down → Rate limiting (24h)
Level 3: Freeze    → Feature bans (7d)
Level 4: Banned    → Platform suspension
```

---

## 🔌 Quick Integration

### Evaluate Message Before Sending

```typescript
import { evaluateMessage } from '../services/safetyService';

const result = await evaluateMessage({
  content: "Your message text",
  contentType: 'TEXT_MESSAGE',
  targetUserId: 'recipient-id',
});

if (!result.allowed) {
  // Show safety banner
  alert(result.messageToUser);
  return;
}

// Send message
sendMessage(content);
```

### Display Safety Banner

```typescript
import { SafetyBanner } from '../components/SafetyBanner';

<SafetyBanner
  type="blocked"
  message={result.messageToUser}
  violationType={result.violationType}
  onEditMessage={() => openEditor()}
  onLearnMore={() => showEducationTip()}
/>
```

### Check Safety Status

```typescript
import { getSafetyStatus } from '../services/safetyService';

const status = await getSafetyStatus();

if (status.restrictions.platformBanned) {
  // User is banned
  showBanMessage();
}

if (status.restrictions.slowDownActive) {
  // User is rate limited
  showSlowDownWarning();
}
```

---

## 🎙️ Voice/Video Monitoring

### Start Monitoring

```typescript
import { startVoiceAnalysis } from '../services/safetyService';

const sessionId = await startVoiceAnalysis({
  callId: call.id,
  participantIds: [userId1, userId2],
});
```

### Process Transcript

```typescript
import { processVoiceTranscript } from '../services/safetyService';

const result = await processVoiceTranscript({
  sessionId,
  callId: call.id,
  transcriptSegment: "Transcript text",
  timestamp: audioTimestamp,
});

if (result.shouldMute) {
  muteParticipant(userId);
}

if (result.shouldTerminate) {
  endCall();
}
```

---

## 📺 Livestream Moderation

### Start Moderation

```typescript
import { startLivestreamModeration } from '../services/safetyService';

const sessionId = await startLivestreamModeration({
  streamId: stream.id,
  moderatorIds: ['mod1', 'mod2'],
});
```

### Moderate Message

```typescript
import { moderateLivestreamMessage } from '../services/safetyService';

const result = await moderateLivestreamMessage({
  sessionId,
  streamId: stream.id,
  message: chatMessage.content,
  messageId: chatMessage.id,
});

if (!result.allowed) {
  blockMessage(chatMessage.id);
}
```

---

## 📁 File Structure

```
functions/src/
├── types/
│   └── safety.types.ts               # Type definitions
├── pack153-safety-system.ts          # Core safety engine
├── pack153-ml-classifiers.ts         # ML content analysis
├── pack153-realtime-monitoring.ts    # Voice/video/stream
└── pack153-endpoints.ts              # Cloud Functions

firestore-rules/
└── pack153-safety-rules.rules        # Security rules

firestore-indexes/
└── pack153-safety-indexes.json       # Database indexes

app-mobile/
├── services/
│   └── safetyService.ts              # API wrapper
├── components/
│   └── SafetyBanner.tsx              # UI components
└── app/safety/
    └── appeal-center.tsx             # Appeal screen
```

---

## 🔑 Key Functions

### User Functions
- `pack153_evaluateMessage` - Check message safety
- `pack153_getSafetyStatus` - Get penalty status
- `pack153_submitAppeal` - Appeal decision
- `pack153_getMyIncidents` - View incident history
- `pack153_getBlockedMessages` - View blocked messages

### Voice/Video Functions
- `pack153_startVoiceAnalysis` - Start call monitoring
- `pack153_processVoiceTranscript` - Analyze transcript
- `pack153_endVoiceAnalysis` - End monitoring

### Livestream Functions
- `pack153_startLivestreamModeration` - Start stream moderation
- `pack153_moderateLivestreamMessage` - Check chat message
- `pack153_getLivestreamStats` - Get moderation stats
- `pack153_endLivestreamModeration` - End moderation

### Admin Functions
- `pack153_admin_reviewAppeal` - Review appeals
- `pack153_admin_getIncidents` - View all incidents
- `pack153_admin_getPendingAppeals` - View pending appeals
- `pack153_admin_detectCoordinatedHarassment` - Detect campaigns

---

## 📊 Collections

| Collection | Description |
|------------|-------------|
| `safety_incidents` | All safety violations |
| `harassment_cases` | Multi-incident tracking |
| `blocked_messages` | Blocked content history |
| `safety_status` | User penalty levels |
| `safety_appeals` | Appeal submissions |
| `voice_transcripts_redacted` | Call violations (redacted) |
| `safety_education_tips` | Help content |

---

## 🚨 Common Use Cases

### 1. Block Toxic Message

```typescript
const result = await evaluateMessage({ 
  content: userInput,
  contentType: 'TEXT_MESSAGE',
});

if (!result.allowed) {
  showBanner({
    type: 'blocked',
    message: result.messageToUser,
  });
}
```

### 2. Show Warning

```typescript
if (result.action === 'WARNING') {
  showBanner({
    type: 'warning',
    message: result.messageToUser,
    onEditMessage: () => openEditor(),
  });
}
```

### 3. Check Restrictions

```typescript
const status = await getSafetyStatus();

if (status.restrictions.featuresBanned.includes('calls')) {
  disableCallButton();
}
```

### 4. Submit Appeal

```typescript
await submitSafetyAppeal({
  incidentId: incident.id,
  reason: "I believe this was a misunderstanding...",
  evidence: "Additional context...",
});
```

---

## ⚙️ Configuration

### Penalty Thresholds (Customizable)

```typescript
// Level 1: Warning
minorIncidents >= 1 || moderateIncidents >= 1

// Level 2: Slow-Down
minorIncidents >= 3 || moderateIncidents >= 3

// Level 3: Freeze
moderateIncidents >= 5 || severeIncidents >= 2

// Level 4: Banned
severeIncidents >= 3
```

### Detection Confidence

```typescript
// Default thresholds
THREAT_CONFIDENCE: 85
HARASSMENT_CONFIDENCE: 75
HATE_SPEECH_CONFIDENCE: 80
NSFW_CONFIDENCE: 80
```

---

## 🔗 Integration with PACK 140 (Reputation)

Safety violations automatically affect reputation:

```typescript
// Automatically called on violation
await trackHarassmentDetected(userId, incidentId, level);
await trackSafetyViolation(userId, violationType, incidentId);

// Affects reputation dimensions:
- Safety Consistency: -10 to -20 points
- Communication: -5 points (for harassment)
```

---

## 📖 Best Practices

1. **Always evaluate before sending**
   - Check all user-generated content
   - Handle blocked messages gracefully
   - Show clear feedback

2. **Respect protected behaviors**
   - Don't double-filter humor/sarcasm
   - Allow professional networking
   - Permit constructive criticism

3. **Provide appeal options**
   - Always show appeal button
   - Explain decisions clearly
   - Process appeals within 24-48h

4. **Monitor voice carefully**
   - Start analysis at call start
   - Process segments in real-time
   - End analysis when call ends

5. **Handle livestream properly**
   - Start moderation at stream start
   - Moderate each chat message
   - Escalate to human if needed

---

## 🐛 Troubleshooting

### Message blocked incorrectly?
- Check if protected behavior detected
- Review confidence scores
- Verify context flags
- Submit appeal if needed

### High false positive rate?
- Adjust confidence thresholds
- Review protected behavior detection
- Check multilingual support
- Update ML classifier patterns

### Performance issues?
- Enable caching for repeat users
- Batch process historical data
- Use indexes for queries
- Monitor function execution time

### Appeal not working?
- Verify incident ID correct
- Check user authentication
- Ensure reason provided
- Review admin permissions

---

## 📞 Support

For implementation questions or issues:
- Review [`PACK_153_IMPLEMENTATION_COMPLETE.md`](PACK_153_IMPLEMENTATION_COMPLETE.md:1)
- Check code comments in source files
- Test with provided examples
- Monitor Cloud Functions logs

---

**Version:** 2.0.0  
**Last Updated:** November 29, 2025  
**Status:** Production Ready ✨