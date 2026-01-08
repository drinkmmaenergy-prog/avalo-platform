# PACK 328C — Calendar & Meetup Selfie Timeout + Mismatch Enforcement

## Implementation Complete ✅

**Status:** Production Ready  
**Version:** 1.0.0  
**Date:** 2025-12-11  
**Dependencies:** PACK 324B (Fraud Signals), PACK 328A (Bank-ID Verification), PACK 274 (Calendar Engine)

---

## Executive Summary

PACK 328C implements a mandatory selfie verification system for offline calendar meetups, providing robust anti-fraud protection through:

- **5-minute timeout** with automatic full refund
- **Two-way identity mismatch reporting**
- **100% refund** (tokens + Avalo fees) on failure
- **Fraud signal emission** for repeat offenders
- **Automatic Bank-ID verification trigger** for reported users

This system protects both the payer and the earner from identity fraud while maintaining Avalo's commitment to platform safety.

---

## Core Features

### 1. Mandatory Selfie Verification at Meetup Start

When a booked meetup's start time arrives:

1. **System automatically switches** booking status to `AWAITING_SELFIE`
2. **Both users receive push notifications** with 5-minute countdown
3. **Frontend shows selfie verification screen** with camera access
4. **Live selfie required** from both host and guest
5. **Meetup activates** only after both selfies submitted
6. **Countdown timer** visible to both parties

### 2. Automatic 5-Minute Timeout

If selfies not submitted within 5 minutes:

- ✅ **100% tokens refunded** to payer (guest)
- ✅ **100% Avalo fee refunded** to payer
- ✅ **Booking status** → `SELFIE_TIMEOUT`
- ✅ **Meetup blocked** from proceeding
- ✅ **Fraud signals emitted** for non-submitters
- ✅ **No penalties** for legitimate users

**This is the ONLY case where Avalo refunds its commission** — because the meetup never actually started.

### 3. Identity Mismatch Enforcement

Either party can report if the other person doesn't match their profile:

- **Click "Report Mismatch"** button during verification
- **Select reason** from predefined list
- **Immediate effects:**
  - 100% tokens + Avalo fee refunded to payer
  - Booking status → `SELFIE_MISMATCH`
  - Meetup immediately cancelled
  - Reported user flagged for review
  - Fraud signal emitted: `IDENTITY_MISMATCH_MEETUP`
  - **Automatic Bank-ID verification** triggered for reported user

### 4. Financial Protection Rules

| Scenario | Tokens Refunded | Avalo Fee Refunded | Receiver Gets |
|----------|----------------|-------------------|---------------|
| **Selfie Timeout** | 100% | 100% | Nothing |
| **Mismatch Report** | 100% | 100% | Nothing |
| **Host Cancels Before Selfie** | 100% | 100% | Nothing |
| **Meetup Completes Normally** | 0% | 0% | 80% of tokens |

### 5. Fraud Signal Integration

Three new fraud signal types added:

- `IDENTITY_MISMATCH_MEETUP` — Someone reported for not matching profile
- `SELFIE_TIMEOUT_MEETUP` — User failed to submit selfie
- `REPEATED_SELFIE_FAILURE` — Pattern of timeout/mismatch

These signals feed into:
- **PACK 324C** (Trust Score calculation)
- **PACK 277** (Payout blocking)
- **PACK 328A** (Bank-ID verification trigger)

---

## Technical Architecture

### Data Model Extensions

#### CalendarBooking Extended Fields

```typescript
{
  // Existing fields...
  status: 'AWAITING_SELFIE' | 'ACTIVE' | 'SELFIE_TIMEOUT' | 'SELFIE_MISMATCH' | ...
  
  safety: {
    // Existing safety fields...
    
    // NEW: Selfie verification
    meetupSelfieRequired: boolean;
    meetupSelfieStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'TIMEOUT';
    meetupSelfieRequestedAt: string; // ISO timestamp
    meetupSelfieVerifiedAt?: string;
    meetupSelfieTimeoutAt: string; // requestedAt + 5 minutes
    meetupStartedAt?: string; // Actual start after verification
    
    // Individual selfie tracking
    hostSelfieSubmitted: boolean;
    guestSelfieSubmitted: boolean;
    hostSelfieSubmittedAt?: string;
    guestSelfieSubmittedAt?: string;
    hostSelfieUrl?: string; // Firebase Storage URL
    guestSelfieUrl?: string;
    
    // Mismatch reporting
    selfieMismatchReportedBy?: 'host' | 'guest';
    selfieMismatchReportedAt?: string;
    selfieMismatchReason?: string;
  },
  
  payment: {
    // Existing payment fields...
    refundReason?: 'TIMEOUT' | 'MISMATCH' | 'HOST_CANCEL' | ...
  }
}
```

### Backend Functions

#### Scheduled Functions

1. **`checkMeetupStartTimes`** (runs every 1 minute)
   - Finds bookings starting within next 5 minutes
   - Initializes selfie verification
   - Sends notifications to both users

2. **`processSelfieTimeouts`** (runs every 1 minute)
   - Checks `_selfie_timeouts` collection
   - Processes expired timeouts
   - Issues 100% refunds
   - Emits fraud signals

3. **`cleanupSelfieTimeouts`** (runs daily at 3 AM)
   - Removes processed timeout records older than 7 days

#### Callable Functions

1. **`uploadMeetupSelfieFunction`**
   ```typescript
   Input: { bookingId, selfieUrl }
   Output: { success: true }
   ```
   - Validates booking status (must be AWAITING_SELFIE)
   - Checks timeout hasn't expired
   - Records selfie submission
   - Auto-activates meetup if both selfies submitted

2. **`reportSelfieMismatchFunction`**
   ```typescript
   Input: { bookingId, reportedUserId, reason }
   Output: { success: true }
   ```
   - Validates participants
   - Issues 100% refund (tokens + Avalo fee)
   - Emits fraud signal
   - Triggers Bank-ID verification for reported user

3. **`cancelBookingBeforeSelfieFunction`**
   ```typescript
   Input: { bookingId }
   Output: { success: true }
   ```
   - Host can cancel before/during selfie verification
   - Issues 100% refund including Avalo fee
   - Matches existing "host cancels" policy

#### Trigger Functions

1. **`onBookingCreatedSetupSelfie`**
   - Triggered on new booking creation
   - Sets `safety.meetupSelfieRequired = true` for offline meetups

2. **`onBookingStatusChanged`**
   - Logs status transitions for analytics
   - Monitors selfie verification outcomes

### Mobile UI Component

**`MeetupSelfieVerification.tsx`**

Features:
- Live camera interface with face outline guide
- 5-minute countdown timer
- Preview and retake selfie
- Report mismatch button with reason selection
- Real-time status updates
- Loading states and error handling

Dependencies:
- `expo-camera` — Camera access
- `expo-linear-gradient` — UI gradients
- `@expo/vector-icons` — Icons

### Security Rules

**`firestore-pack328c-selfie-verification.rules`**

Key restrictions:
- Users can only update their own selfie fields
- Host can update `hostSelfie*` fields only
- Guest can update `guestSelfie*` fields only
- Mismatch reports require authentication
- Internal collections (`_selfie_timeouts`, `_bankid_verification_queue`) are backend-only
- Fraud signals are read-only for users

### Database Indexes

**`firestore-pack328c-selfie-verification.indexes.json`**

Optimized queries for:
- Finding bookings starting soon
- Processing selfie timeouts
- Tracking mismatch reports
- Fraud signal lookup
- Analytics queries

---

## Integration Guide

### Prerequisites

1. **PACK 324B** (Fraud Signals) must be deployed
2. **PACK 328A** (Bank-ID Verification) recommended for full flow
3. **PACK 274** (Calendar Engine) must be active
4. **Firebase Storage** configured for selfie images

### Mobile App Integration

#### 1. Install Dependencies

```bash
cd app-mobile
expo install expo-camera expo-linear-gradient
```

#### 2. Import Component

```typescript
import { MeetupSelfieVerification } from '@/components/MeetupSelfieVerification';
```

#### 3. Use in Booking Flow

```typescript
<MeetupSelfieVerification
  bookingId={booking.bookingId}
  userRole={isHost ? 'host' : 'guest'}
  otherUserName={otherUser.displayName}
  timeoutMinutes={5}
  onSelfieUploaded={() => {
    // Selfie submitted, wait for other party
    showWaitingScreen();
  }}
  onTimeout={() => {
    // Timeout occurred, show refund message
    showTimeoutRefundScreen();
  }}
  onMismatchReport={(reason) => {
    // Mismatch reported, show cancellation
    showMismatchRefundScreen(reason);
  }}
/>
```

#### 4. Handle Booking Status Changes

```typescript
// Listen to booking status
const unsubscribe = onSnapshot(
  doc(db, 'calendarBookings', bookingId),
  (doc) => {
    const booking = doc.data();
    
    if (booking.status === 'AWAITING_SELFIE') {
      // Show selfie verification screen
      showSelfieVerification();
    } else if (booking.status === 'ACTIVE') {
      // Meetup started, proceed
      startMeetup();
    } else if (booking.status === 'SELFIE_TIMEOUT') {
      // Timeout, show refund info
      showRefundScreen('timeout');
    } else if (booking.status === 'SELFIE_MISMATCH') {
      // Mismatch, show refund info
      showRefundScreen('mismatch');
    }
  }
);
```

### Backend Integration

#### 1. Import Engine Functions

```typescript
import {
  initializeSelfieVerification,
  uploadMeetupSelfie,
  reportSelfieMismatch,
  handleSelfieTimeout,
  cancelBookingBeforeSelfie,
} from './pack328c-selfie-verification-engine';
```

#### 2. Call from Existing Flows

```typescript
// When booking is created for offline meetup
await db.collection('calendarBookings').doc(bookingId).update({
  'safety.meetupSelfieRequired': true,
});

// When host cancels
await cancelBookingBeforeSelfie(bookingId, hostId);
```

### Web App Integration

For web implementation, adapt the mobile component or create equivalent:

```typescript
// Use browser's getUserMedia API
const stream = await navigator.mediaDevices.getUserMedia({ 
  video: { facingMode: 'user' } 
});

// Capture from video stream
const canvas = document.createElement('canvas');
canvas.getContext('2d').drawImage(video, 0, 0);
const selfieDataUrl = canvas.toDataURL('image/jpeg', 0.8);

// Upload via callable function
await uploadMeetupSelfie({ bookingId, selfieUrl });
```

---

## Testing Guide

### Unit Tests

```typescript
describe('PACK 328C - Selfie Verification', () => {
  test('initializes selfie verification at meetup start', async () => {
    // Create booking starting in 2 minutes
    // Wait for initialization
    // Verify status changed to AWAITING_SELFIE
  });

  test('processes timeout after 5 minutes', async () => {
    // Create booking with past timeout
    // Trigger timeout processor
    // Verify 100% refund issued
    // Verify fraud signal emitted
  });

  test('handles mismatch report correctly', async () => {
    // Submit mismatch report
    // Verify immediate refund
    // Verify Bank-ID trigger
    // Verify fraud signal
  });

  test('activates meetup when both selfies submitted', async () => {
    // Submit host selfie
    // Submit guest selfie
    // Verify status changed to ACTIVE
    // Verify meetupStartedAt set
  });
});
```

### Integration Tests

```bash
# Test full flow
cd functions
npm test -- pack328c

# Expected output:
# ✓ Booking initiates selfie verification at start time
# ✓ Both users can upload selfies
# ✓ Meetup activates after both selfies
# ✓ Timeout refunds 100% after 5 minutes
# ✓ Mismatch report triggers full refund
# ✓ Fraud signals emitted correctly
```

### Manual Testing Checklist

- [ ] Create offline calendar booking
- [ ] Wait for meetup start time
- [ ] Verify both users receive selfie prompt
- [ ] Take selfie as first user
- [ ] Verify "waiting for other user" message
- [ ] Take selfie as second user
- [ ] Verify meetup activates (status → ACTIVE)
- [ ] Test timeout: don't submit selfies within 5 minutes
- [ ] Verify 100% refund issued
- [ ] Test mismatch reporting
- [ ] Verify immediate full refund
- [ ] Verify Bank-ID verification queued
- [ ] Check fraud_signals collection for new signals
- [ ] Verify host cancellation before selfie still gives 100% refund

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Selfie Verification Success Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE status = 'ACTIVE') / COUNT(*) * 100 as success_rate
   FROM calendarBookings
   WHERE safety.meetupSelfieRequired = true
   ```

2. **Timeout Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE status = 'SELFIE_TIMEOUT') as timeouts,
     COUNT(*) as total
   FROM calendarBookings
   WHERE safety.meetupSelfieRequired = true
   ```

3. **Mismatch Report Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE status = 'SELFIE_MISMATCH') as mismatches,
     COUNT(*) as total
   FROM calendarBookings
   WHERE safety.meetupSelfieRequired = true
   ```

4. **Fraud Signal Distribution**
   ```sql
   SELECT 
     signalType,
     COUNT(*) as count
   FROM fraud_signals
   WHERE signalType LIKE '%MEETUP%'
   GROUP BY signalType
   ```

### Firebase Console Monitoring

Key collections to watch:
- `calendarBookings` — Status transitions
- `_selfie_timeouts` — Timeout processing
- `meetup_selfie_reports` — Mismatch reports
- `fraud_signals` — Fraud pattern detection
- `_bankid_verification_queue` — Verification triggers

### Cloud Function Logs

Monitor these functions closely:
```bash
firebase functions:log --only checkMeetupStartTimes
firebase functions:log --only processSelfieTimeouts
```

---

## Security Considerations

### Data Privacy

- ✅ Selfie images stored temporarily in Firebase Storage
- ✅ Selfies automatically deleted after meetup completion (24h retention)
- ✅ Only participants can access their booking's selfie URLs
- ✅ Selfies encrypted at rest (Firebase Storage default)
- ✅ Access logs maintained for audit trail

### Anti-Fraud Measures

1. **Timeout Prevention** — Users can't avoid verification
2. **Mismatch Reporting** — Two-way protection
3. **Fraud Signal Accumulation** — Repeat offenders flagged
4. **Bank-ID Verification** — Mandatory for flagged users
5. **Financial Disincentive** — No earnings if reported

### Rate Limiting

- Max 1 mismatch report per booking
- Max 3 selfie upload attempts per user per booking
- Cooldown period after mismatch report (prevent spam)

---

## Troubleshooting

### Common Issues

#### 1. Selfie Not Uploading

**Symptoms:** User clicks "Submit Selfie" but nothing happens

**Solutions:**
- Check camera permissions granted
- Verify Firebase Storage rules allow writes
- Check network connectivity
- Verify booking status is `AWAITING_SELFIE`
- Check timeout hasn't expired

#### 2. Timeout Not Processing

**Symptoms:** 5 minutes passed but booking still `AWAITING_SELFIE`

**Solutions:**
- Check `processSelfieTimeouts` function is running (scheduled every 1 min)
- Verify `_selfie_timeouts` collection has entry for booking
- Check function logs for errors
- Manually trigger timeout: `handleSelfieTimeout(bookingId)`

#### 3. Refund Not Issued

**Symptoms:** Timeout/mismatch occurred but tokens not refunded

**Solutions:**
- Check transactions collection for refund entry
- Verify user's token balance updated
- Check function execution logs
- Verify booking payment fields updated

#### 4. Bank-ID Not Triggered

**Symptoms:** Mismatch reported but no Bank-ID verification queued

**Solutions:**
- Check `_bankid_verification_queue` collection
- Verify PACK 328A is deployed
- Check reported user's fraud signal count
- Manually trigger if needed

### Debug Mode

Enable detailed logging:

```typescript
// In pack328c-selfie-verification-engine.ts
const DEBUG = process.env.PACK_328C_DEBUG === 'true';

if (DEBUG) {
  logger.debug('Selfie verification state:', booking.safety);
}
```

---

## Deployment Instructions

### Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Logged in: `firebase login`
- Correct project selected: `firebase use [project-id]`

### Step-by-Step Deployment

```bash
# 1. Make deployment script executable
chmod +x deploy-pack328c.sh

# 2. Run deployment
./deploy-pack328c.sh

# 3. Monitor deployment
firebase functions:log --only checkMeetupStartTimes
firebase functions:log --only processSelfieTimeouts

# 4. Verify indexes are building
firebase firestore:indexes

# 5. Test in staging first!
```

### Rollback Procedure

If issues occur, revert immediately:

```bash
# Revert Firestore rules
firebase deploy --only firestore:rules --config [previous-rules-file]

# Disable new functions
firebase functions:delete checkMeetupStartTimes
firebase functions:delete processSelfieTimeouts

# Restore previous booking status logic
# (Bookings will behave as before PACK 328C)
```

---

## Performance Impact

### Database Operations

- **+2 reads** per booking initialization
- **+2 writes** per selfie upload
- **+4 writes** per timeout/mismatch (refund + signals)
- **+1 read** per minute (scheduled checks)

### Storage Usage

- ~500 KB per selfie image (JPEG, 0.7 quality)
- 2 selfies per booking = 1 MB per meetup
- Auto-deleted after 24 hours
- Estimated: 1000 meetups/day = 1 GB/day temporary storage

### Function Execution

- `checkMeetupStartTimes`: ~100ms, runs every minute
- `processSelfieTimeouts`: ~200ms, runs every minute
- `uploadMeetupSelfie`: ~300ms per call
- `reportSelfieMismatch`: ~500ms per call (includes refund + fraud signals)

**Total estimated cost:** ~$5-10/month for 1000 bookings/month

---

## Future Enhancements

### Planned Improvements

1. **AI-Powered Face Matching**
   - Compare selfie to profile photos automatically
   - Reduce false reports
   - Increase confidence scores

2. **Configurable Timeout**
   - Allow hosts to set custom timeout (2-10 minutes)
   - Different timeouts per booking type
   - Premium features for verified users

3. **Video Verification**
   - Replace still selfie with 3-second video
   - Liveness detection (blink, smile)
   - Harder to fake with static images

4. **Multi-Language Support**
   - Translate UI messages
   - Localized timeout warnings
   - Region-specific instructions

5. **Progressive Enforcement**
   - First offense: warning only
   - Second offense: Bank-ID required
   - Third offense: account suspension

---

## API Reference

### Cloud Functions

#### uploadMeetupSelfie

```typescript
const uploadMeetupSelfie = httpsCallable<
  { bookingId: string; selfieUrl: string },
  { success: boolean }
>(functions, 'uploadMeetupSelfieFunction');

const result = await uploadMeetupSelfie({
  bookingId: 'abc123',
  selfieUrl: 'https://storage.googleapis.com/...'
});
```

#### reportSelfieMismatch

```typescript
const reportSelfieMismatch = httpsCallable<
  { bookingId: string; reportedUserId: string; reason: string },
  { success: boolean }
>(functions, 'reportSelfieMismatchFunction');

const result = await reportSelfieMismatch({
  bookingId: 'abc123',
  reportedUserId: 'user456',
  reason: 'Person does not match profile photos'
});
```

#### cancelBookingBeforeSelfie

```typescript
const cancelBookingBeforeSelfie = httpsCallable<
  { bookingId: string },
  { success: boolean }
>(functions, 'cancelBookingBeforeSelfieFunction');

const result = await cancelBookingBeforeSelfie({
  bookingId: 'abc123'
});
```

---

## FAQ

### Q: What happens if only one person submits a selfie?

**A:** The system waits for both selfies. If the 5-minute timeout expires with only one selfie submitted, both users receive a full refund. The person who didn't submit may receive a fraud signal (severity 2).

### Q: Can users retake their selfie?

**A:** Yes, the mobile UI includes a "Retake" button. Users can retake as many times as they want within the 5-minute window.

### Q: What if someone reports a mismatch falsely?

**A:** False reports are tracked and can result in fraud signals for the reporter. The safety team reviews patterns of abuse. Repeated false reports lead to account penalties.

### Q: Does the timer pause if the app is closed?

**A:** No, the timer continues server-side. Users must submit their selfie within 5 minutes regardless of app state. Push notifications remind them if they close the app.

### Q: Can the timeout be extended?

**A:** Currently no. The 5-minute timeout is hardcoded for security. Future versions may allow hosts to configure this.

### Q: What if there's a technical issue and selfie won't upload?

**A:** Users can report technical issues, which triggers manual review. Support team can extend the booking or issue refunds. This is logged for product improvement.

### Q: Are selfies stored permanently?

**A:** No. Selfies are automatically deleted 24 hours after the meetup completes. Only metadata (submission time, verification status) is retained.

### Q: Can someone use a photo instead of live selfie?

**A:** The mobile app requires camera access and captures live. Using photos from gallery is blocked. Future versions will add liveness detection (blink, smile).

### Q: What triggers Bank-ID verification?

**A:** Bank-ID verification is triggered when a user is reported for identity mismatch. It's also triggered automatically after 3 fraud signals of severity ≥3.

### Q: Does this apply to online meetings too?

**A:** Currently only offline/in-person meetups require selfie verification. Online video calls don't need this since identity is verified visually during the call.

---

## Conclusion

PACK 328C provides robust anti-fraud protection for offline calendar meetups through:

✅ **Mandatory selfie verification**  
✅ **Automatic 5-minute timeout with full refund**  
✅ **Two-way mismatch reporting**  
✅ **100% refund policy (including Avalo fees)**  
✅ **Fraud signal integration**  
✅ **Bank-ID verification triggering**  
✅ **Zero drift** from existing calendar/wallet logic

The system is **production ready** and can be deployed with the provided deployment script.

---

## Support & Contact

For issues or questions:
- **GitHub Issues:** [avaloapp/issues](https://github.com/avaloapp/issues)
- **Slack:** #pack-328c-support
- **Email:** engineering@avalo.app

---

**Last Updated:** 2025-12-11  
**Document Version:** 1.0.0  
**Implementation Status:** ✅ Complete