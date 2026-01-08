# PACK 77 - Safety Center & Meet-Up Check-In Implementation

## Overview

Complete implementation of Safety Center with meet-up timers and panic button functionality for the Avalo platform. This module provides in-app safety features without integration with external emergency services.

**Implementation Date:** 2025-11-25  
**Status:** ✅ Complete

---

## Business Requirements

### Core Principles
- **In-App Only**: All alerts stay within Avalo ecosystem (no police/SMS/external calls)
- **No Free Economy**: Does not give tokens, does not affect 65/35 split, does not change pricing
- **Compliance-First**: No integration with emergency numbers (store policy compliance)
- **Privacy-Focused**: 30-day TTL for all safety data
- **Consent-Based**: Users choose their trusted contacts voluntarily

### What We DO
- ✅ Create safety timers for offline meetings
- ✅ Send in-app notifications to trusted contacts
- ✅ Store last known location snapshot (from PACK 76)
- ✅ Provide panic button for emergencies
- ✅ Allow check-in to confirm safety

### What We DON'T Do
- ❌ Contact police or emergency services
- ❌ Send SMS to external phone numbers
- ❌ Make external phone calls
- ❌ Share data outside Avalo app
- ❌ Store location history (only latest snapshot)

---

## Architecture

### Backend (Firebase Functions)

#### Cloud Functions
**File:** [`functions/src/safetyTimers.ts`](functions/src/safetyTimers.ts:1)

**Exported Functions:**
1. **`createSafetyTimer`** - Creates new safety timer with trusted contacts
2. **`checkInSafetyTimer`** - Marks timer as completed_ok (user confirms safety)
3. **`cancelSafetyTimer`** - Manually cancels active timer
4. **`triggerPanic`** - Triggers panic button alert
5. **`getUserSafetyTimers`** - Gets user's timers (active and archived)
6. **`getSafetyAlerts`** - Gets alerts for trusted contacts
7. **`checkExpiredSafetyTimers`** - Scheduled check for expired timers (every 1 minute)
8. **`cleanupOldSafetyRecords`** - Purges old records (daily at 3 AM UTC)

#### Key Features
- **Single Active Timer**: Maximum 1 active timer per user
- **Trusted Contacts**: Up to 5 Avalo users as emergency contacts
- **Auto-Expiry**: Timers automatically expire if not checked in
- **Location Integration**: Optional snapshot from PACK 76 geoshare
- **TTL Cleanup**: All data deleted after 30 days

### Firestore Schema

#### Collection: `safety_timers`
```typescript
{
  id: string;
  userId: string;
  trustedContacts: string[];      // Array of user IDs
  durationSeconds: number;
  status: 'active' | 'completed_ok' | 'expired_no_checkin' | 'cancelled';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  note: string;                   // Max 200 chars
  lastKnownLocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: Timestamp;
  };
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
}
```

#### Collection: `safety_events`
```typescript
{
  id: string;
  userId: string;
  type: 'panic' | 'timer_expired_no_checkin' | 'timer_completed_ok';
  createdAt: Timestamp;
  lastKnownLocation?: LocationSnapshot;
  timerId?: string;               // Reference to timer if applicable
  notificationsSent: boolean;
  trustedContactsNotified: string[];
}
```

### Security Rules

**File:** [`firestore-rules/safety_timers.rules`](firestore-rules/safety_timers.rules:1)

**Key Rules:**
- Only timer owner and trusted contacts can read timer
- No direct creates (must use Cloud Function)
- Owner can update only to mark as `completed_ok`
- No direct deletes (backend TTL only)
- Events readable by owner and notified contacts
- All writes controlled by Cloud Functions

---

## Mobile Implementation (React Native + Expo)

### TypeScript Types

**File:** [`app-mobile/types/safetyTimer.ts`](app-mobile/types/safetyTimer.ts:1)

**Key Types:**
- `SafetyTimer` - Timer document structure
- `SafetyEvent` - Safety event structure
- `SafetyTimerSummary` - Timer display data
- `SafetyAlertDetails` - Alert details for trusted contacts
- `LocationSnapshot` - Location data from PACK 76
- `SAFETY_TIMER_DURATIONS` - Allowed durations: [30, 60, 90] minutes

### React Hooks

#### 1. useSafetyTimers Hook
**File:** [`app-mobile/hooks/useSafetyTimers.ts`](app-mobile/hooks/useSafetyTimers.ts:1)

**Returns:**
```typescript
{
  activeTimer: SafetyTimerSummary | null;
  archivedTimers: SafetyTimerSummary[];
  loading: boolean;
  error: string | null;
  createTimer: (duration, note, contacts) => Promise<void>;
  checkIn: (timerId) => Promise<void>;
  cancelTimer: (timerId) => Promise<void>;
  refreshTimers: () => Promise<void>;
  remainingSeconds: number;
}
```

**Features:**
- Auto-fetches timers on mount
- Real-time countdown for active timer
- Automatic location capture on timer creation
- Error handling with user-friendly messages

#### 2. usePanicButton Hook
**File:** [`app-mobile/hooks/usePanicButton.ts`](app-mobile/hooks/usePanicButton.ts:1)

**Returns:**
```typescript
{
  triggering: boolean;
  error: string | null;
  triggerPanic: () => Promise<void>;
}
```

**Features:**
- Confirmation dialog before triggering
- Automatic location capture
- Notifies trusted contacts from active timer
- User feedback on success/failure

#### 3. useSafetyAlerts Hook
**File:** [`app-mobile/hooks/useSafetyTimers.ts`](app-mobile/hooks/useSafetyTimers.ts:264)

**Returns:**
```typescript
{
  alerts: SafetyAlertDetails[];
  loading: boolean;
  error: string | null;
  refreshAlerts: () => Promise<void>;
}
```

### UI Components

#### 1. PanicButton Component
**File:** [`app-mobile/components/safety/PanicButton.tsx`](app-mobile/components/safety/PanicButton.tsx:1)

**Variants:**
- **`full`** - Large button with title and subtitle (default)
- **`compact`** - Horizontal button with icon and text
- **`icon`** - Circular icon-only button

**Usage:**
```tsx
<PanicButton 
  variant="full"
  onPanicTriggered={() => console.log('Panic triggered')}
/>
```

#### 2. SafetyCenterScreen
**File:** [`app-mobile/screens/safety/SafetyCenterScreen.tsx`](app-mobile/screens/safety/SafetyCenterScreen.tsx:1)

**Features:**
- Active timer display with countdown
- Check-in and cancel actions
- Panic button section
- Archived timers list (last 3)
- Educational information
- Safety alerts banner
- Pull-to-refresh

#### 3. CreateSafetyTimerScreen
**File:** [`app-mobile/screens/safety/CreateSafetyTimerScreen.tsx`](app-mobile/screens/safety/CreateSafetyTimerScreen.tsx:1)

**Features:**
- Duration selection (30/60/90 min)
- Meeting note input (max 200 chars)
- Trusted contacts selector (max 5)
- Real-time character count
- Input validation
- Educational info boxes

#### 4. SafetyAlertDetailsScreen
**File:** [`app-mobile/screens/safety/SafetyAlertDetailsScreen.tsx`](app-mobile/screens/safety/SafetyAlertDetailsScreen.tsx:1)

**Features:**
- User info display
- Alert type badge (panic/timer expired)
- Meeting note display
- Map view with last known location
- Location accuracy circle
- Open in Google Maps button
- Action buttons (message user, call emergency)
- Important disclaimer

### Notification System

**File:** [`app-mobile/services/safetyNotifications.ts`](app-mobile/services/safetyNotifications.ts:1)

**Functions:**
- `configureSafetyNotifications()` - Setup notification handler
- `scheduleTimerExpiryNotifications()` - Schedule 10min and 5min warnings
- `cancelTimerNotifications()` - Cancel timer notifications
- `requestNotificationPermissions()` - Request permissions with Android channel
- `setupNotificationListeners()` - Listen for incoming notifications
- `showTimerExpiringNotification()` - Show immediate notification

**Notification Types:**
- `safety_timer_expiring` - Timer about to expire (10min, 5min)
- `safety_timer_expired` - Timer expired without check-in
- `safety_panic` - Panic button triggered

### Navigation Routes

**Files:**
- [`app-mobile/app/safety/index.tsx`](app-mobile/app/safety/index.tsx:1) - Main Safety Center
- [`app-mobile/app/safety/create-timer.tsx`](app-mobile/app/safety/create-timer.tsx:1) - Create Timer
- [`app-mobile/app/safety/alerts.tsx`](app-mobile/app/safety/alerts.tsx:1) - Alerts List
- [`app-mobile/app/safety/alert/[alertId].tsx`](app-mobile/app/safety/alert/[alertId].tsx:1) - Alert Details

**Routes:**
- `/safety` - Safety Center main screen
- `/safety/create-timer` - Create new timer
- `/safety/alerts` - View all alerts
- `/safety/alert/:alertId` - View alert details

### Localization

**Files:**
- [`app-mobile/i18n/strings.en.json`](app-mobile/i18n/strings.en.json:1884) - English translations
- [`app-mobile/i18n/strings.pl.json`](app-mobile/i18n/strings.pl.json:1884) - Polish translations

**Namespace:** `safetyCenter.*`

**Categories:**
- Main labels
- Timer creation flow
- Panic button
- Alerts list
- Alert details
- Educational info
- Error messages
- Notifications

---

## Usage Flow

### 1. Creating a Safety Timer

```typescript
import { useSafetyTimers } from '@/hooks/useSafetyTimers';

const { createTimer, loading, error } = useSafetyTimers();

// Create timer before meeting
await createTimer(
  30,                              // 30 minutes
  'Coffee at Starbucks downtown',  // Note
  ['userId1', 'userId2']           // Trusted contacts
);
```

### 2. Checking In on Timer

```typescript
const { activeTimer, checkIn } = useSafetyTimers();

// User confirms they're safe
if (activeTimer) {
  await checkIn(activeTimer.timerId);
}
```

### 3. Triggering Panic Button

```typescript
import { usePanicButton } from '@/hooks/usePanicButton';

const { triggerPanic, triggering } = usePanicButton();

// Trigger panic alert
await triggerPanic();
// Shows confirmation dialog → Sends alert → Notifies contacts
```

### 4. Viewing Safety Alerts (Trusted Contacts)

```typescript
import { useSafetyAlerts } from '@/hooks/useSafetyTimers';

const { alerts, loading, refreshAlerts } = useSafetyAlerts();

// View alerts from people who added you as trusted contact
alerts.forEach(alert => {
  console.log(`Alert from ${alert.userName}:`, alert.type);
  if (alert.lastKnownLocation) {
    console.log('Location:', alert.lastKnownLocation);
  }
});
```

---

## Integration with PACK 76 (Geoshare)

### Location Data Flow

1. **On Timer Creation:**
   - Attempts to fetch last location from active geoshare session
   - If no geoshare session, uses device location (expo-location)
   - Location is optional - timer works without it

2. **On Panic Button:**
   - Gets current device location if permissions granted
   - Stored with panic event

3. **Location Storage:**
   - Only snapshot stored (not continuous tracking)
   - Format matches PACK 76 `LocationSnapshot`
   - Includes: latitude, longitude, accuracy, timestamp

### Code Example

From [`functions/src/safetyTimers.ts`](functions/src/safetyTimers.ts:83):
```typescript
// Try to get location from active geoshare session
const geoshareSessions = await db
  .collection('geoshare_sessions')
  .where('userA', '==', userId)
  .where('status', '==', 'ACTIVE')
  .orderBy('createdAt', 'desc')
  .limit(1)
  .get();

if (!geoshareSessions.empty) {
  const session = geoshareSessions.docs[0];
  const locations = await db
    .collection('geoshare_sessions')
    .doc(session.id)
    .collection('locations')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (!locations.empty) {
    lastKnownLocation = locations.docs[0].data();
  }
}
```

---

## Edge Cases Handled

### ✅ Timer Expiry
- Backend scheduled function checks every 1 minute
- Sets status to `expired_no_checkin`
- Creates safety event
- Sends notifications to all trusted contacts
- Works even if app is closed

### ✅ User Check-In
- Timer immediately marked as `completed_ok`
- No alerts sent to contacts
- Timer moved to archived list
- Countdown cleared

### ✅ Timer Cancellation
- User can cancel anytime
- Status set to `cancelled`
- No alerts sent
- Timer moved to archived

### ✅ No Trusted Contacts
- Timer works as personal reminder
- No notifications sent on expiry
- Event still logged

### ✅ Location Unavailable
- Timer works without location
- Alert sent without location data
- User warned about missing location

### ✅ Duplicate Timers
- Only 1 active timer allowed per user
- Error thrown if creating second timer
- Must complete/cancel first timer

### ✅ App Killed
- Scheduled backend checks continue
- Timer expiry handled server-side
- Notifications sent via Firebase Cloud Messaging
- User can re-open app anytime

### ✅ Permission Denied
- Location permission optional
- Timer works without location
- Panic button works without location
- User informed of missing data

---

## Security & Privacy

### Data Privacy
- ✅ No location history (only latest snapshot)
- ✅ All data auto-deleted after 30 days
- ✅ Only participants can access timer/event data
- ✅ Trusted contacts only see what's necessary
- ✅ No external data sharing

### Access Control
- ✅ Timer owner can read/update their timer
- ✅ Trusted contacts can read timer (read-only)
- ✅ Events visible to owner and notified contacts
- ✅ All writes via authenticated Cloud Functions
- ✅ No direct Firestore writes from clients

### Compliance
- **GDPR**: 30-day TTL, minimal data collection, consent-based
- **App Store**: No emergency service integration (compliant)
- **Google Play**: In-app only features (compliant)
- **Privacy**: Location data optional and temporary

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Usage Metrics**
   - Total timers created
   - Active timers per day
   - Check-in rate (completed vs expired)
   - Average timer duration
   - Panic button triggers per day

2. **Safety Metrics**
   - Expired timers without check-in
   - Panic alerts triggered
   - Average trusted contacts per timer
   - Alert response time (how fast contacts view)

3. **Technical Metrics**
   - Location capture success rate
   - Notification delivery rate
   - Timer expiry check performance
   - TTL cleanup execution

### Logs to Monitor

```typescript
// Search Cloud Functions logs for:
"[SafetyTimer] Created timer"
"[SafetyTimer] User checked in on timer"
"[SafetyTimer] User cancelled timer"
"[SafetyTimer] Timer expired, notified"
"[SafetyTimer] Panic button triggered"
"[SafetyTimer] Deleted old timers"
```

---

## Testing Checklist

### Backend Functions
- [ ] `createSafetyTimer` - Creates timer with correct fields
- [ ] `createSafetyTimer` - Rejects if active timer exists
- [ ] `createSafetyTimer` - Validates duration (30/60/90 only)
- [ ] `createSafetyTimer` - Validates note length (<200 chars)
- [ ] `createSafetyTimer` - Validates trusted contacts (max 5)
- [ ] `createSafetyTimer` - Captures location from geoshare if available
- [ ] `checkInSafetyTimer` - Marks timer as completed_ok
- [ ] `checkInSafetyTimer` - Only owner can check in
- [ ] `checkInSafetyTimer` - Rejects if timer not active
- [ ] `cancelSafetyTimer` - Marks timer as cancelled
- [ ] `triggerPanic` - Creates panic event
- [ ] `triggerPanic` - Notifies all trusted contacts
- [ ] `triggerPanic` - Works without active timer
- [ ] `checkExpiredSafetyTimers` - Finds expired timers
- [ ] `checkExpiredSafetyTimers` - Sends notifications to contacts
- [ ] `cleanupOldSafetyRecords` - Deletes 30+ day old records

### Mobile Functionality
- [ ] Timer creation flow works
- [ ] Duration selection works
- [ ] Trusted contacts selection works (max 5)
- [ ] Note input validates length
- [ ] Timer countdown updates every second
- [ ] Check-in button marks timer complete
- [ ] Cancel button works
- [ ] Panic button shows confirmation
- [ ] Panic button captures location
- [ ] Panic button sends alert
- [ ] Alerts list shows all alerts
- [ ] Alert details shows location on map
- [ ] Open in Google Maps works
- [ ] Notifications appear at correct times
- [ ] Pull-to-refresh updates data

### Integration Tests
- [ ] Location from PACK 76 captured correctly
- [ ] Timer expires and backend sends notifications
- [ ] Trusted contacts receive in-app notifications
- [ ] Panic event creates with location
- [ ] Multiple timers rejected (max 1 active)
- [ ] Old records cleaned up after 30 days
- [ ] Permissions handling works correctly

---

## Dependencies

### Required Packages

```json
{
  "expo-location": "^19.0.7",
  "expo-notifications": "^0.31.0",
  "react-native-maps": "1.11.3",
  "firebase": "^10.7.1"
}
```

### Installation

```bash
cd app-mobile
npm install expo-notifications
# react-native-maps already installed from PACK 76
npx expo prebuild
```

**Note:** Notifications require device permissions. Maps require native module setup.

---

## Deployment Steps

### 1. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

**Files Updated:**
- `firestore-rules/safety_timers.rules`

### 2. Deploy Backend Functions

```bash
cd functions
npm run build
npm run deploy
```

**Functions Deployed:**
- `safety_createTimer`
- `safety_checkInTimer`
- `safety_cancelTimer`
- `safety_triggerPanic`
- `safety_getUserTimers`
- `safety_getAlerts`
- `safety_checkExpiredTimers` (scheduled)
- `safety_cleanupOldRecords` (scheduled)

### 3. Configure Scheduled Jobs

Ensure Cloud Scheduler has these jobs:
- **`safety_checkExpiredTimers`** - Every 1 minute
- **`safety_cleanupOldRecords`** - Daily at 3 AM UTC

### 4. Update Mobile App

```bash
cd app-mobile
npx expo prebuild
npm run android  # or npm run ios
```

**Required for:**
- New routes and screens
- Notification permissions
- Location access
- Expo Notifications native module

---

## Permissions & Configuration

### iOS Configuration (`app.json`)

```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Avalo needs your location for safety timers and panic button.",
      "NSUserNotificationsUsageDescription": "Avalo sends safety alerts to your trusted contacts."
    }
  }
}
```

### Android Configuration (`app.json`)

```json
{
  "android": {
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "POST_NOTIFICATIONS"
    ]
  }
}
```

### Expo Plugins

```json
{
  "plugins": [
    [
      "expo-notifications",
      {
        "icon": "./assets/notification-icon.png",
        "color": "#EF4444",
        "sounds": ["./assets/safety-alert.wav"]
      }
    ]
  ]
}
```

---

## API Reference

### Backend Functions

#### `createSafetyTimer`
```typescript
Input: {
  durationMinutes: 30 | 60 | 90;
  note: string;                    // Max 200 chars
  trustedContacts: string[];       // Max 5 user IDs
  lastKnownLocation?: LocationSnapshot;
}
Output: {
  success: boolean;
  timerId: string;
  expiresAt: string;               // ISO timestamp
  message?: string;
}
```

#### `checkInSafetyTimer`
```typescript
Input: { timerId: string }
Output: {
  success: boolean;
  message?: string;
}
```

#### `cancelSafetyTimer`
```typescript
Input: { timerId: string }
Output: {
  success: boolean;
  message?: string;
}
```

#### `triggerPanic`
```typescript
Input: {
  lastKnownLocation?: LocationSnapshot;
}
Output: {
  success: boolean;
  eventId: string;
  message?: string;
}
```

#### `getUserSafetyTimers`
```typescript
Input: {
  limit?: number;
  includeArchived?: boolean;
}
Output: {
  success: boolean;
  timers: SafetyTimerSummary[];
}
```

#### `getSafetyAlerts`
```typescript
Input: { limit?: number }
Output: {
  success: boolean;
  alerts: SafetyAlertDetails[];
}
```

---

## Compliance & Legal

### Terms of Service

Users must acknowledge:
- Safety features are in-app only, not emergency services
- Avalo does not contact police or external services
- Location data is temporary and deleted after 30 days
- Safety features are free and don't affect token economy
- Features may be terminated for misuse

### Regional Compliance

- **GDPR (EU)**: Consent-based, 30-day TTL, minimal data = compliant
- **CCPA (California)**: Explicit consent, data deletion = compliant
- **App Store Guidelines**: No emergency service integration = compliant
- **Google Play**: In-app safety only = compliant

### Data Retention

- Active timers: Until completion, expiry, or cancellation
- Expired timers: 30 days
- Safety events: 30 days
- Location snapshots: Deleted with parent timer/event
- Notifications: Standard Firebase retention

---

## Monetization & Economy

### PACK 77 Rules (Strictly Enforced)

- ❌ **NO free tokens** - Safety features don't give tokens
- ❌ **NO economy changes** - 65/35 split unchanged
- ❌ **NO price modifications** - Token prices unchanged
- ❌ **NO cashback** - No refunds or promotions
- ❌ **NO paid features** - Safety is free (meta-layer)

### Why Free?

This is a **meta-safety layer**, not a revenue feature:
- Protects users during offline meetings
- Builds trust in platform
- Compliance with safety best practices
- Retention tool (users feel safer)
- Competitive advantage

**Cost to Avalo:** Minimal (Firestore reads/writes, FCM notifications)

---

## Troubleshooting

### Common Issues

**Issue:** Notifications not appearing
- **Cause:** Permissions not granted
- **Solution:** Call `requestNotificationPermissions()` on app start

**Issue:** Timer didn't notify contacts on expiry
- **Cause:** Backend scheduled function not running
- **Solution:** Check Cloud Scheduler logs, verify cron syntax

**Issue:** Location not captured
- **Cause:** No geoshare session and location permission denied
- **Solution:** Timer works without location; user can grant permission

**Issue:** Cannot create timer (already exists)
- **Cause:** User has active timer
- **Solution:** Complete or cancel existing timer first

**Issue:** Panic button no contacts
- **Cause:** User has no active timer with trusted contacts
- **Solution:** Panic still triggers, creates event, but no notifications sent

**Issue:** Map not showing in alert details
- **Cause:** `react-native-maps` not installed
- **Solution:** Install package and rebuild app

---

## Future Enhancements

### Potential Features

1. **Emergency Contacts**
   - Add external contacts (phone/email) with explicit opt-in
   - Requires legal review and carrier compliance

2. **Auto-Timer**
   - Automatically start timer based on calendar events
   - Integration with device calendar

3. **Location Sharing During Timer**
   - Continuous location updates to trusted contacts
   - Requires PACK 76 geoshare session

4. **Safety Groups**
   - Multiple users create shared timer
   - All must check in

5. **SOS Message Templates**
   - Pre-written messages for different scenarios
   - Quick selection in panic mode

6. **Safety Check-In History**
   - Show past check-ins and patterns
   - Analytics for safety

---

## Support & Documentation

### For Questions or Issues

1. Review this documentation
2. Check inline code comments
3. Review error logs in Cloud Functions
4. Test in Firebase emulator first
5. Contact development team

### Related Documentation

- [`PACK_76_GEOSHARE_IMPLEMENTATION.md`](PACK_76_GEOSHARE_IMPLEMENTATION.md) - Location sharing
- [`CHAT_MONETIZATION_IMPLEMENTATION.md`](CHAT_MONETIZATION_IMPLEMENTATION.md) - Chat features
- Expo Notifications Docs
- React Native Maps Docs

---

## Implementation Summary

PACK 77 Safety Center is now fully implemented with:

### ✅ Backend Infrastructure
- 6 callable Cloud Functions
- 2 scheduled functions (expiry check, cleanup)
- Firestore security rules
- Integration with PACK 76 location data

### ✅ Mobile Application
- 3 main screens (Safety Center, Create Timer, Alert Details)
- 2 React hooks (timers, panic button) 
- 1 reusable component (PanicButton)
- 4 navigation routes
- Full localization (EN/PL)

### ✅ Safety Features
- Safety timers (30/60/90 min)
- Panic button (3 variants)
- Trusted contacts system
- In-app notifications
- Location snapshot integration

### ✅ Compliance
- No external service integration
- 30-day data TTL
- Privacy-first design
- App store compliant

### ✅ Documentation
- Complete API reference
- Usage examples
- Testing checklist
- Deployment guide

---

## Technical Specifications

### Timer Lifecycle

```
1. CREATE
   ├─ Validate duration (30/60/90)
   ├─ Validate note (<200 chars)
   ├─ Validate contacts (max 5)
   ├─ Capture location (optional)
   ├─ Set status: 'active'
   └─ Schedule expiry check

2. ACTIVE
   ├─ Countdown UI updates every second
   ├─ Notifications at 10min and 5min
   └─ User actions:
       ├─ CHECK-IN → status: 'completed_ok'
       ├─ CANCEL → status: 'cancelled'
       └─ EXPIRE → status: 'expired_no_checkin'

3. COMPLETED
   ├─ Move to archived list
   ├─ Stop countdown
   └─ Log safety event

4. EXPIRED (no check-in)
   ├─ Create safety event
   ├─ Notify trusted contacts
   ├─ Show in alerts list
   └─ Store last known location

5. CLEANUP (after 30 days)
   ├─ Delete timer document
   ├─ Delete related events
   └─ Remove all location data
```

### Notification Flow

```
TIMER CREATION
└─ Schedule local notifications (10min, 5min)

TIMER EXPIRY (no check-in)
└─ Backend creates event
    └─ Backend creates notification docs
        └─ FCM sends push to contacts
            └─ Contacts see in-app alert

PANIC BUTTON
└─ Frontend triggers panic
    └─ Backend creates event
        └─ Backend notifies contacts
            └─ Contacts see immediate alert
```

---

## Performance Considerations

### Optimization Strategies

1. **Batch Operations**
   - Cleanup function processes in batches
   - Notification sends parallelized

2. **Efficient Queries**
   - Indexed on `userId` + `status`
   - Limited result sets (max 10 timers)

3. **Scheduled Functions**
   - Expiry check every 1 minute (balance vs cost)
   - Cleanup daily (low frequency)

4. **Client-Side**
   - Local countdown (no backend polling)
   - Cached timer data
   - Pull-to-refresh on demand

### Cost Estimates (Monthly)

**Assumptions:** 10,000 active users, 20% create timers

- Firestore Reads: ~600,000 (expiry checks)
- Firestore Writes: ~6,000 (timer creates + updates)
- Cloud Function Invocations: ~45,000
- FCM Notifications: ~2,000
- **Estimated Cost:** ~$5-10/month

**Note:** Very low cost for significant safety value

---

## Conclusion

The Safety Center & Meet-Up Check-In system is now fully implemented with:
- ✅ Complete backend infrastructure
- ✅ Secure, privacy-first design
- ✅ Mobile UI components and screens
- ✅ Push notification system
- ✅ PACK 76 location integration
- ✅ Comprehensive error handling
- ✅ Full localization support
- ✅ Compliance with app stores
- ✅ Zero impact on token economy

**Status:** Ready for testing and deployment

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-25  
**Maintained By:** Kilo Code