# PACK 254 Quick Reference - Meet & Date Engine

## 🎯 Purpose
Complete offline meetings automation system enabling safe, verified 1:1 meetings between users.

## 📋 Key Features
- ✅ Token-based booking (35% Avalo fee + 65% escrow)
- ✅ Mandatory check-in/check-out (selfie or QR)
- ✅ Smart refund logic (catfish protection)
- ✅ Panic Mode (in-app + lock-screen)
- ✅ Post-meeting rating system
- ✅ Shared logic with Events engine

## 💰 Payment Flow
```
User pays 100 tokens
├─ 35 tokens → Avalo (immediate, non-refundable*)
└─ 65 tokens → Escrow (released after meeting)

* Refunded only for confirmed fraud (identity mismatch)
```

## 🔄 Meeting Workflow
```
1. Creator creates slot → Status: AVAILABLE
2. User books + pays → Status: BOOKED
3. Both check-in → Status: IN_PROGRESS
4. Both check-out → Status: COMPLETED
5. Escrow releases → Creator receives 65 tokens
6. Both rate meeting → Affects ranking/risk score
```

## 🛡️ Refund Rules
| Situation | Refund Amount | Avalo Fee Returned |
|-----------|---------------|-------------------|
| Identity mismatch (catfish) | 100% (full) | ✅ Yes |
| Safety violation/harassment | 65% (escrow) | ❌ No |
| Mutual agreement | 65% (escrow) | ❌ No |
| Creator voluntary | 65% (escrow) | ❌ No |
| User didn't enjoy | ❌ No refund | ❌ No |

## 🆘 Panic Mode Actions
1. One-tap trigger
2. Meeting ends instantly
3. GPS location captured
4. Emergency contact notified
5. Risk score +60 for reported user
6. Safety log created for review

## ⏰ Timing Windows
- **Check-in:** 15 min before to 15 min after start
- **Check-out:** After end time, up to 15 min after
- **Rating:** 48 hours after completion

## 📁 Key Files
```
functions/src/
├── meetingMonetization.ts          # Core logic
└── sharedMeetingEventLogic.ts      # Shared utilities

app-mobile/
├── services/meetingService.ts      # Client service
└── app/components/
    ├── MeetingCard.tsx             # Meeting display
    ├── PanicButton.tsx             # Emergency alert
    └── MeetingRatingModal.tsx      # Rating UI

firestore-pack254-meetings.rules    # Security rules
firestore-pack254-meetings.indexes.json  # Indexes
```

## 🔧 API Quick Reference

### Create Meeting Slot
```typescript
await createMeetingSlot(creatorId, {
  title: 'Coffee Date',
  description: 'Let\'s meet for coffee!',
  startTime: new Date('2025-12-10T15:00:00'),
  endTime: new Date('2025-12-10T16:00:00'),
  timezone: 'America/New_York',
  location: { type: 'IN_PERSON', address: 'Central Park' },
  priceTokens: 50,
  verificationType: 'SELFIE'
});
```

### Book Meeting
```typescript
const result = await bookMeeting(meetingId);
// Returns: { success: true, bookingId: '...' }
```

### Check-In
```typescript
await validateCheckpoint(meetingId, 'CHECK_IN', {
  verificationType: 'SELFIE',
  selfieUrl: 'https://...',
  location: { lat: 40.7128, lng: -74.0060 }
});
```

### Trigger Panic
```typescript
await triggerPanicMode(meetingId, 'EMERGENCY', {
  location: currentLocation,
  trustedContactId: emergencyContactId
});
```

### Submit Rating
```typescript
await submitRating(meetingId, {
  ratingType: 'POSITIVE', // or 'NEUTRAL', 'NEGATIVE', 'REPORT'
  privateNotes: 'Great conversation!'
});
```

### Request Refund
```typescript
await requestRefund(meetingId, 'IDENTITY_MISMATCH', {
  selfies: [selfieUrl1, selfieUrl2],
  complainantStatement: 'Person did not match profile photos'
});
```

## 📊 Rating Effects
| Rating | Ranking Change | Risk Score Change | Notes |
|--------|---------------|-------------------|-------|
| 👍 Positive | +5 | 0 | Boosts visibility |
| 😐 Neutral | 0 | 0 | No effect |
| 👎 Negative | 0 | +25 | Flags for review |
| 🚫 Report | 0 | +50 | Investigation |

## 🔒 Security Features
- ✅ Identity verification (selfie/QR)
- ✅ Timing window enforcement
- ✅ Escrow protection
- ✅ Fraud detection (identity mismatch)
- ✅ GPS location tracking
- ✅ Emergency contact system
- ✅ Risk score management
- ✅ Moderator review system

## 🚀 Deployment Commands
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Deploy functions
cd functions && npm run build && firebase deploy --only functions

# Build mobile app
cd app-mobile && eas build --platform all
```

## 🧪 Testing Checklist
- [ ] Creator creates meeting slot
- [ ] User books with tokens
- [ ] Check-in within window
- [ ] Check-out after meeting
- [ ] Escrow releases automatically
- [ ] Rating submitted within 48h
- [ ] Panic mode triggers
- [ ] Refund for identity mismatch
- [ ] Refund for safety violation
- [ ] No refund for enjoyment issues

## 📈 Monitoring
Watch these metrics:
- Meeting completion rate
- Check-in/check-out success rate
- Refund rate by reason
- Panic alerts per 1000 meetings
- Average rating distribution
- Platform fee revenue

## ⚠️ Common Issues
| Issue | Solution |
|-------|----------|
| Check-in window closed | User must be within 15-min window |
| Escrow not released | Both users must check-out |
| Refund rejected | Need valid reason + evidence |
| Panic alert failed | Emergency contact must be set up |

## 🔗 Integration with Events
Shared logic module provides:
- `validateIdentity()` - Works for meetings & events
- `processRefund()` - Unified refund logic
- `handlePanicAlert()` - Safety features
- `applyRatingEffects()` - Rating system

## 📝 Configuration
```typescript
MEETING_CONFIG = {
  PLATFORM_FEE_PERCENT: 35,
  ESCROW_PERCENT: 65,
  MIN_MEETING_DURATION_MINUTES: 30,
  MAX_MEETING_DURATION_HOURS: 8,
  CHECK_IN_WINDOW_MINUTES: 15,
  CHECK_OUT_WINDOW_MINUTES: 15,
  RATING_WINDOW_HOURS: 48,
}
```

## 🎓 Best Practices
1. Always check meeting status before operations
2. Validate timing windows client-side first
3. Handle errors gracefully with user-friendly messages
4. Log all security events for audit
5. Test panic mode thoroughly
6. Monitor fraud patterns
7. Respond to safety reports quickly

---

**Full Documentation:** [`PACK_254_MEET_DATE_ENGINE_IMPLEMENTATION.md`](PACK_254_MEET_DATE_ENGINE_IMPLEMENTATION.md)  
**Status:** ✅ Production Ready  
**Version:** 1.0