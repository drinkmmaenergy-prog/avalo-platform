# PACK 211 — Quick Reference Guide

## 🎯 Core Concept

Adaptive safety intelligence that personalizes protection based on real risk patterns **without ruining the dating experience**.

---

## 📊 USER SAFETY CATEGORIES

| Category | Protection | Auto-Applied When |
|----------|-----------|-------------------|
| **WOMAN_DATING_MEN** | Stronger booking limits + faster alerts | Woman interested in men |
| **MAN_DATING_WOMEN** | Enhanced selfie verification | Man interested in women |
| **NONBINARY** | Priority moderation + fast reporting | Nonbinary gender identity |
| **INFLUENCER_PROFILE** | Longer booking cooldowns | 10,000+ followers |
| **NEW_ACCOUNT** | Softer visibility | Account < 30 days old |
| **STANDARD** | Baseline protection | Everyone else |

---

## 🎚️ RISK SCORE SYSTEM

### Score Range: 0-1000 (Internal Only)

| Level | Score | User Sees |
|-------|-------|-----------|
| LOW | 0-299 | Nothing |
| MEDIUM | 300-599 | Nothing |
| HIGH | 600-849 | "Enhanced verification required" |
| CRITICAL | 850-1000 | Manual review |

### Score Changes

**Increases:**
- Complaint received: +50
- Blocked after 1st message: +40
- Appearance mismatch: +60
- Panic alert triggered: +100
- Minor contact attempt: +1000

**Decreases:**
- Successful meeting: -15
- Voluntary refund: -20
- High rating: -25
- Selfie re-verification: -30

---

## 🚫 BOOKING COOLDOWN SYSTEM

| Rejections | Cooldown | Can Book Again? |
|-----------|----------|----------------|
| **0** | None | ✅ Anytime |
| **1** | 7 days | ✅ After 7 days |
| **2** | 21 days | ✅ After 21 days |
| **3+** | Permanent | ❌ Never (from this person) |

**Important:** User NOT banned from platform, just from that specific person.

---

## 👁️ SWIPE STALKING PREVENTION

### Detection Rule
**3+ right swipes** without match = Profile hidden

### Hide Duration
- **Regular user:** 30 days
- **Blocked by target:** 90 days
- **Permanent:** Extreme cases

### User Experience
- ❌ Target NOT notified (silent protection)
- ✅ Profile just stops appearing in feed
- ✅ Reappears after hiding period

---

## 📍 LOCATION RISK LEVELS

| Location Type | Risk | Action |
|--------------|------|--------|
| Café/restaurant/bar | **SAFE** | Normal mode |
| Hotel/apartment | **ELEVATED** | Enhanced selfie required |
| Remote/isolated | **HIGH** | Trusted contact mandatory + shorter timer |
| Hidden/no address | **BLOCKED** | Meeting cannot start |

**UX Note:** Never say "dangerous" — say "Enhanced verification required"

---

## 🔌 API QUICK REFERENCE

### User Functions

```typescript
// Update safety category (onboarding/profile change)
pack211_updateUserSafetyCategory({
  datingPreferences: { interestedIn, genderIdentity, ... },
  followerCount: number
})

// Check booking permission (before booking)
pack211_checkBookingPermission({ targetId })
// Returns: { canBook, cooldownUntil, rejectionCount }

// Record booking outcome (after completion/rejection)
pack211_recordBookingOutcome({
  bookingId,
  outcome: 'REJECTED' | 'COMPLETED_NORMAL' | 'PANIC_ENDED'
})

// Record swipe (after each swipe)
pack211_recordSwipe({
  targetId,
  isRightSwipe: boolean,
  matchHappened: boolean
})
// Returns: { shouldHideProfile, hiddenUntil }

// Assess location (venue selection)
pack211_assessMeetingLocation({
  bookingId,
  location: { latitude, longitude, address, placeName }
})
// Returns: { riskLevel, enhancedSelfieRequired, meetingBlocked }

// Get own risk profile (limited view)
pack211_getMyRiskProfile()
// Returns: { category, riskLevel, stats, adjustments }
```

### Admin Functions

```typescript
// Get high-risk users
pack211_admin_getHighRiskUsers({ limit, minRiskScore })

// Get safety events requiring review
pack211_admin_getSafetyEvents({ requiresReview, severity })

// Get cooldown statistics
pack211_admin_getCooldownStats()

// Manual risk score adjustment (emergency)
pack211_admin_adjustRiskScore({ userId, newScore, reason })
```

---

## 🔥 FIRESTORE COLLECTIONS

| Collection | Purpose | Key Fields |
|------------|---------|-----------|
| `user_risk_profiles` | Internal risk scoring | riskScore, safetyCategory |
| `booking_attempt_history` | Cooldown tracking | rejectionCount, cooldownUntil |
| `swipe_pattern_tracking` | Obsession detection | noMatchCount, hiddenUntil |
| `location_safety_checks` | Venue assessment | riskLevel, meetingBlocked |
| `adaptive_safety_events` | Audit trail | eventType, actionsTaken |

---

## ✅ INTEGRATION CHECKLIST

### Booking Flow
```typescript
// 1. Check cooldown before showing booking button
const status = await pack211_checkBookingPermission({ targetId });
if (!status.canBook) {
  // Disable booking, show: "Try again after [date]"
}

// 2. Record outcome after booking confirmed/rejected
await pack211_recordBookingOutcome({
  bookingId,
  outcome: booking.accepted ? 'COMPLETED_NORMAL' : 'REJECTED'
});
```

### Match/Swipe Flow
```typescript
// 1. Record every right swipe
const result = await pack211_recordSwipe({
  targetId,
  isRightSwipe: true,
  matchHappened: didMatch
});

// 2. Filter match suggestions
const shouldShow = await pack211_shouldShowProfile({ targetId });
if (!shouldShow.shouldShow) {
  // Skip this profile in feed
}
```

### Location Selection
```typescript
// Assess when user enters venue address
const check = await pack211_assessMeetingLocation({
  bookingId,
  location: venueData
});

if (check.meetingBlocked) {
  // Show: "Please provide a public address"
}

if (check.enhancedSelfieRequired) {
  // Show: "Enhanced verification will be required"
}
```

### User Onboarding
```typescript
// Calculate category after profile setup
await pack211_updateUserSafetyCategory({
  datingPreferences: userData.preferences,
  followerCount: userData.followers?.length || 0
});
```

---

## 💬 UX COPY TEMPLATES

### ✅ Correct (Use These)

**Booking Cooldown:**
- "This user is not available for booking right now."
- "You can try again after [date]."

**Location Risk:**
- "Enhanced verification will be required for this location."
- "Please provide a public address for this meeting."

**General Safety:**
- "You're in control — safety features work in the background."
- "You decide who can book you and when."

### ❌ Incorrect (Never Use)

- ~~"This is a dangerous location"~~
- ~~"You are stalking this person"~~
- ~~"Your risk score is too high"~~
- ~~"Dating requires extreme caution"~~

---

## 🚀 DEPLOYMENT STEPS

1. **Deploy Backend:**
   ```bash
   firebase deploy --only functions:pack211
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

2. **Update Client Code:**
   - Add cooldown check to booking flow
   - Add swipe tracking to match system
   - Add location assessment to venue selection
   - Add category calculation to onboarding

3. **Configure Roles:**
   ```typescript
   // In Firestore: users/{userId}
   { roles: { safety_team: true } }
   ```

4. **Test Integration:**
   - Cooldowns apply after rejections
   - Swipe patterns detected correctly
   - Location risk assessed proper
ly
   - Categories assigned correctly

---

## 🧪 KEY TEST SCENARIOS

✅ **Cooldowns:**
- 1st rejection → 7-day block
- 2nd rejection → 21-day block
- 3rd rejection → Permanent block

✅ **Swipe Patterns:**
- 3 right swipes (no match) → Profile hidden 30 days

✅ **Location Safety:**
- Café → SAFE (no extra requirements)
- Hotel → ELEVATED (enhanced selfie)
- No address → BLOCKED (cannot start)

✅ **Risk Scores:**
- Complaint → Score +50
- Successful meeting → Score -15
- Cannot go below 0 or above 1000

---

## 🔒 PRIVACY RULES

### What Users See
- ✅ Their safety category name (e.g., "Standard")
- ✅ Positive stats (successful meetings, ratings)
- ✅ Required actions (e.g., "Enhanced verification")

### What Users DON'T See
- ❌ Their actual risk score (0-1000)
- ❌ Detailed risk tracking
- ❌ Why they're in a category
- ❌ Other users' risk data

### What's Silent
- ❌ Swipe pattern detection (user doesn't know)
- ❌ Profile hiding (no notification)
- ❌ Risk score changes (background only)

---

## 📊 MONITORING METRICS

### Track Daily
- Active cooldowns count
- Permanent blocks count
- High-risk users (≥600 score)
- Location blocks per day

### Track Weekly
- Risk score distribution
- Swipe pattern detections
- Category distribution
- Successful meeting rate by category

### Alert On
- Critical risk users (≥850)
- Spike in cooldown activations
- Increase in location blocks
- Abnormal swipe patterns

---

## 🎯 KEY PRINCIPLES

1. **Invisible Protection** — Most safety works in background
2. **Privacy First** — Risk scores never exposed to users
3. **Positive Messaging** — Never create dating anxiety
4. **Targeted Response** — Different risks get different protections
5. **Dating Freedom** — Never block consensual interactions

---

## 🐛 TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Cooldown not applying | Check `recordBookingOutcome` called with correct outcome |
| Profile not hiding | Verify swipe tracking runs after each swipe |
| Location always SAFE | Ensure address string includes location type |
| Risk score not updating | Check event type matches RISK_SCORE_WEIGHTS keys |
| Category unchanged | Call `updateUserSafetyCategory` after preference changes |

---

## 📞 Quick Links

- **Full Docs:** [`PACK_211_IMPLEMENTATION_COMPLETE.md`](PACK_211_IMPLEMENTATION_COMPLETE.md)
- **Types:** [`pack211-adaptive-safety-types.ts`](functions/src/pack211-adaptive-safety-types.ts)
- **Engine:** [`pack211-adaptive-safety-engine.ts`](functions/src/pack211-adaptive-safety-engine.ts)
- **Functions:** [`pack211-adaptive-safety-functions.ts`](functions/src/pack211-adaptive-safety-functions.ts)
- **Rules:** [`firestore-pack211-adaptive-safety.rules`](firestore-pack211-adaptive-safety.rules)
- **Indexes:** [`firestore-pack211-adaptive-safety.indexes.json`](firestore-pack211-adaptive-safety.indexes.json)

---

**Version:** 1.0.0  
**Last Updated:** December 2, 2025  
**Status:** ✅ Production Ready

**PACK 211 COMPLETE — Adaptive Safety Intelligence (Gender-Aware + Stalker Prevention + Repeated-Booking Protection) implemented**