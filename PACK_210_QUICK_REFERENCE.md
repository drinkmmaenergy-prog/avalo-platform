# PACK 210 — Quick Reference Guide

## 🎯 Core Concept

Real-world safety system for dating app meetings with **live location tracking**, **two-tier panic button**, and **trusted contact notifications**.

---

## 🚨 Panic Button Tiers

| Tier | Trigger | Who Gets Notified | Meeting Ends? | Use Case |
|------|---------|-------------------|---------------|----------|
| **Tier 1: Silent** | Single tap | Trusted contact only | No | Uncomfortable but not severe |
| **Tier 2: SOS** | Long press (3s) | Trusted contact + Safety team | Yes + payout blocked | Serious safety threat |

---

## 📍 Location Tracking

| Mode | Interval | Trigger | Purpose |
|------|----------|---------|---------|
| **Normal** | 15 seconds | Battery ≥ 15% | Continuous accurate tracking |
| **Low Battery** | 60 seconds | Battery < 15% | Preserve power for emergencies |

**Visibility:**
- ❌ Never visible to other attendee
- ✅ Always visible to user
- ✅ Conditionally visible to trusted contact
- ✅ Visible to safety team during Tier 2 alerts

---

## ⚙️ Automatic Activation

Safety mode **automatically starts** after:
- QR check-in for 1:1 meeting, OR
- QR check-in for event attendance

No manual action required.

Safety mode **automatically ends** when:
- Meeting/event officially ends
- User manually stops tracking
- Panic button triggered (auto-ends meeting)

---

## 👥 Trusted Contacts

### Relationship Types
- Friend
- Family
- Partner (non-date)
- Roommate
- Other

### Notification Settings
- **Tracking Links:** Receive live location during meetings
- **Panic Alerts:** Receive emergency notifications
- **Auto Safety Checks:** Receive alerts when user doesn't respond

### Primary Contact
One contact can be marked as primary (default for all safety features).

---

## ⏰ Safety Check System

**"Are You Safe?" Timer**

1. Triggers after scheduled meeting end time
2. User has **5 minutes** to respond
3. No response → **Automatic Tier 1 Silent Alert** to trusted contact
4. Logged for safety team review

**Philosophy:** Better false positives than false negatives.

---

## 🔌 API Quick Reference

### User Endpoints

```typescript
// Start safety session
pack210_startSafetySession({
  bookingId, eventId, attendeeId,
  venueLocation, otherUserId,
  scheduledEndTime, deviceInfo
})

// Update location
pack210_updateLocation({
  sessionId, latitude, longitude,
  accuracy, batteryLevel
})

// Trigger panic alert
pack210_triggerPanicAlert({
  sessionId, tier,
  currentLocation, deviceInfo
})

// Manage trusted contact
pack210_manageTrustedContact({
  name, phoneNumber, phoneCountryCode,
  email, relationship, isPrimary,
  receiveTrackingLinks, receivePanicAlerts, receiveAutoAlerts
})

// End safety session
pack210_endSafetySession({
  sessionId, endReason
})

// Get active session
pack210_getActiveSafetySession()

// Get trusted contacts
pack210_getTrustedContacts()

// Remove trusted contact
pack210_removeTrustedContact({ contactId })

// Respond to safety check
pack210_respondToSafetyCheck({
  timerId, response: 'SAFE' | 'NEED_HELP'
})
```

### Admin Endpoints

```typescript
// Get active sessions (safety team)
pack210_admin_getActiveSessions({ limit })

// Get panic alerts (safety team)
pack210_admin_getPanicAlerts({
  status, tier, limit
})

// Resolve panic alert (safety team)
pack210_admin_resolvePanicAlert({
  alertId, resolution, notes
})

// Get safety logs (safety team)
pack210_admin_getSafetyLogs({
  sessionId, userId, requiresReview, limit
})
```

---

## 🎨 UI Components

### PanicButton

```tsx
import { PanicButton } from '@/components/PanicButton';

<PanicButton
  sessionId={session.sessionId}
  onTier1Alert={handleSilentAlert}
  onTier2Alert={handleSOSAlert}
  compactMode={false}  // false = full, true = compact
/>
```

**Features:**
- Single tap = Tier 1 (Silent)
- Hold 3s = Tier 2 (SOS)
- Visual progress bar
- Pulse animation
- Confirmation modal

### SafetyTrackingService

```typescript
import { safetyTrackingService } from '@/services/SafetyTrackingService';

// Start tracking
await safetyTrackingService.startTracking('session789');

// Stop tracking
await safetyTrackingService.stopTracking();

// Check if active
safetyTrackingService.isTrackingActive();
```

---

## 🔥 Firestore Collections

| Collection | Purpose | Retention |
|------------|---------|-----------|
| `safety_sessions` | Active tracking sessions | 90 days |
| `location_tracking` | GPS coordinates | 30 days (auto-delete) |
| `trusted_contacts` | Emergency contacts | Permanent |
| `panic_alerts` | Emergency alerts | Permanent |
| `safety_check_timers` | Welfare checks | 90 days |
| `panic_notifications` | Alert messages sent | 90 days |
| `safety_event_log` | Audit trail | Permanent |

---

## 🔒 Security Rules

### Who Can Read What

| Data | User | Trusted Contact | Safety Team | Other Attendee |
|------|------|-----------------|-------------|----------------|
| Location | ✅ | ✅ (if enabled) | ✅ (Tier 2 only) | ❌ |
| Session | ✅ | ✅ (if enabled) | ✅ | ❌ |
| Panic Alerts | ✅ | ✅ | ✅ | ❌ |
| Trusted Contacts | ✅ | ❌ | ✅ | ❌ |

---

## 📊 Key Metrics

### For Monitoring

- Active sessions count
- Panic alerts by tier (daily/weekly)
- False alarm rate
- Average response time
- Low-battery mode usage
- Safety check response rate

---

## 🎓 Integration Example

```typescript
// 1. After QR check-in
const functions = getFunctions();
const startSession = httpsCallable(functions, 'pack210_startSafetySession');

const result = await startSession({
  bookingId: booking.id,
  venueLocation: booking.location,
  otherUserId: booking.otherPartyId,
  scheduledEndTime: booking.endTime,
});

// 2. Start location tracking
import { safetyTrackingService } from '@/services/SafetyTrackingService';
await safetyTrackingService.startTracking(result.data.sessionId);

// 3. Show panic button in UI
<PanicButton
  sessionId={result.data.sessionId}
  onTier1Alert={async () => {
    const triggerPanic = httpsCallable(functions, 'pack210_triggerPanicAlert');
    await triggerPanic({
      sessionId: result.data.sessionId,
      tier: 'TIER_1_SILENT',
      currentLocation: await getCurrentLocation(),
    });
  }}
  onTier2Alert={async () => {
    const triggerPanic = httpsCallable(functions, 'pack210_triggerPanicAlert');
    await triggerPanic({
      sessionId: result.data.sessionId,
      tier: 'TIER_2_SOS',
      currentLocation: await getCurrentLocation(),
    });
  }}
/>

// 4. End meeting
const endSession = httpsCallable(functions, 'pack210_endSafetySession');
await endSession({
  sessionId: result.data.sessionId,
  endReason: 'USER_ENDED',
});
await safetyTrackingService.stopTracking();
```

---

## 🚀 Deployment Steps

1. **Install mobile packages:**
   ```bash
   npx expo install expo-location expo-battery expo-task-manager
   ```

2. **Deploy backend:**
   ```bash
   firebase deploy --only functions:pack210
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

3. **Configure permissions** in `app.json`:
   ```json
   {
     "expo": {
       "plugins": [
         ["expo-location", {
           "locationAlwaysAndWhenInUsePermission": "Track location for safety"
         }]
       ]
     }
   }
   ```

4. **Set up safety team role:**
   ```typescript
   users/{userId} { roles: { safety_team: true } }
   ```

5. **Integrate with QR check-in flow**

---

## 💡 UX Guidelines

### Tone: Protective, Not Dramatic

✅ **Use:**
- "You're safe — we've got you covered"
- "Tracking active so you can enjoy the moment"
- "You're in control"

❌ **Avoid:**
- "Meeting people is dangerous"
- "You are at risk"
- "Dating requires extreme caution"

**Safety ≠ Fear. Safety = Confidence.**

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Background tracking stops | Check location permissions |
| Battery drains quickly | Verify low-battery mode at <15% |
| Trusted contact not notified | Verify phone number format |
| Location updates slow | Check tracking interval setting |
| Session doesn't end | Call `endSafetySession` manually |

---

## 📞 Quick Links

- **Full Documentation:** [`PACK_210_IMPLEMENTATION_COMPLETE.md`](PACK_210_IMPLEMENTATION_COMPLETE.md)
- **Type Definitions:** [`functions/src/pack210-safety-tracking-types.ts`](functions/src/pack210-safety-tracking-types.ts)
- **Core Engine:** [`functions/src/pack210-safety-tracking-engine.ts`](functions/src/pack210-safety-tracking-engine.ts)
- **Cloud Functions:** [`functions/src/pack210-safety-tracking-functions.ts`](functions/src/pack210-safety-tracking-functions.ts)

---

## ✅ Success Checklist

- [ ] Location permissions granted
- [ ] Trusted contact(s) added
- [ ] Panic button accessible during meetings
- [ ] Location updates every 15s (normal) or 60s (low battery)
- [ ] Tier 1 alerts reach trusted contact
- [ ] Tier 2 alerts escalate to safety team
- [ ] Meetings auto-end on panic
- [ ] Safety checks trigger after meeting end
- [ ] Data retention enforced (30 days location, 90 days sessions)

---

**Version:** 1.0.0  
**Last Updated:** December 1, 2025  
**Status:** ✅ Production Ready

**PACK 210 COMPLETE — Panic Button + Trusted Contact + Live Safety Tracking implemented**