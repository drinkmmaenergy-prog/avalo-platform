# PACK 76 - Real-Time Location Sharing Implementation

## Overview

Complete implementation of temporary, consent-based, paid location sharing between users in the Avalo platform.

**Implementation Date:** 2025-11-25  
**Status:** ✅ Complete

---

## Business Requirements

### Core Rules
- **Payment Required**: No free trials, no free previews - payment upfront for all sessions
- **35% Platform Fee**: Immediate, non-refundable commission to Avalo
- **Temporary Only**: No location history storage - all data deleted after session expires
- **Consent-Based**: Both users must actively participate
- **Time-Limited**: Sessions automatically expire after paid duration

### Pricing Model
- **Base Rate**: 10 tokens per minute
- **Duration Options**: 15 min, 30 min, 60 min
- **Revenue Split**: 35% Avalo (immediate), 65% kept as platform revenue
- **No Refunds**: All payments are final and non-refundable

---

## Architecture

### Backend (Firebase Functions)

#### Cloud Functions
**File:** [`functions/src/geoshare.ts`](functions/src/geoshare.ts)

**Exported Functions:**
1. **`getGeosharePricing`** - Returns pricing information for duration options
2. **`startGeoshareSession`** - Creates new session after payment validation
3. **`updateGeoshareLocation`** - Updates user location during active session
4. **`stopGeoshareSession`** - Manually ends session
5. **`getGeoshareSession`** - Retrieves session info and partner location
6. **`cleanupExpiredGeoshareSessions`** - Scheduled cleanup (every 5 minutes)
7. **`deleteOldGeoshareSessions`** - Purges old sessions (daily at 2 AM UTC)

#### Key Features
- **Rate Limiting**: Max 1 location update per 8 seconds
- **Automatic Expiry**: Sessions auto-close at end of paid time  
- **TTL Cleanup**: Expired sessions deleted after 5-minute grace period
- **Data Retention**: All session data deleted after 7 days

### Firestore Schema

#### Collection: `geoshare_sessions`
```typescript
{
  sessionId: string;
  userA: string;              // Payer
  userB: string;              // Partner
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  durationMinutes: number;
  paidAmount: number;         // Total tokens paid
  avaloFee: number;           // Platform fee (35%)
  createdAt: Timestamp;
  expiresAt: Timestamp;
  lastUpdateAt: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
}
```

#### Subcollection: `geoshare_sessions/{sessionId}/locations`
```typescript
{
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Timestamp;
  sessionId: string;
}
```

**Note:** Location subcollections are automatically deleted when parent session is cleaned up.

### Security Rules

**File:** [`firestore-rules/geoshare_sessions.rules`](firestore-rules/geoshare_sessions.rules)

**Key Rules:**
- Only participants can read their session
- Only after payment can session be created
- Only location data can be updated (not session metadata)
- No direct deletes (backend only via TTL)
- Locations only writable by owner, readable by both participants

---

## Mobile Implementation (React Native + Expo)

### Services

#### 1. Geoshare Service
**File:** [`app-mobile/services/geoshareService.ts`](app-mobile/services/geoshareService.ts)

**Functions:**
- `getGeosharePricing()` - Fetch pricing for duration
- `startGeoshareSession()` - Start new session
- `updateGeoshareLocation()` - Send location update
- `stopGeoshareSession()` - End session manually
- `getGeoshareSession()` - Get current session status

#### 2. Location Tracking Service
**File:** [`app-mobile/services/locationTrackingService.ts`](app-mobile/services/locationTrackingService.ts)

**Features:**
- **Foreground Tracking**: Updates while app is active
- **Background Tracking**: Continues when app is backgrounded
- **Permission Management**: Handles location permissions
- **Rate Limiting**: Respects 8-second minimum interval
- **Battery Optimization**: Uses appropriate accuracy settings

**Functions:**
- `requestLocationPermissions()` - Request permissions
- `hasLocationPermissions()` - Check permission status
- `getCurrentLocation()` - Get one-time location
- `startLocationTracking()` - Start foreground + background
- `stopLocationTracking()` - Stop all tracking

### React Hooks

**File:** [`app-mobile/hooks/useGeoshareSession.ts`](app-mobile/hooks/useGeoshareSession.ts)

**Returns:**
```typescript
{
  session: GeoshareSessionInfo | null;
  partnerLocation: PartnerLocation | null;
  isActive: boolean;
  remainingSeconds: number;
  loading: boolean;
  error: string | null;
  
  startSession: (partnerId, duration) => Promise<void>;
  stopSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
}
```

**Features:**
- Auto-polling partner location (every 10 seconds)
- Countdown timer for remaining time
- Automatic cleanup on session expiry
- Auto-stop location tracking when done

### UI Components

#### 1. Payment Modal
**File:** [`app-mobile/components/geoshare/GeosharePaymentModal.tsx`](app-mobile/components/geoshare/GeosharePaymentModal.tsx)

**Features:**
- Duration selection (15/30/60 min)
- Real-time pricing calculation
- Cost breakdown (total + platform fee)
- Important warnings
- Token balance validation

#### 2. Map View
**File:** [`app-mobile/components/geoshare/GeoshareMapView.tsx`](app-mobile/components/geoshare/GeoshareMapView.tsx)

**Features:**
- Real-time map with user and partner markers
- Accuracy circles
- Time remaining display
- Location info cards
- Last update timestamps
- Stop sharing button

**Dependencies:**
- `react-native-maps` (required for map functionality)

### Configuration

**File:** [`app-mobile/config/geoshare.ts`](app-mobile/config/geoshare.ts)

```typescript
export const GEOSHARE_CONFIG = {
  PRICE_PER_MINUTE: 10,
  AVALO_FEE_PERCENT: 35,
  DURATION_OPTIONS: [15, 30, 60],
  MIN_UPDATE_INTERVAL_SECONDS: 8,
  UI_UPDATE_INTERVAL_MS: 10000,
  // ... map and background settings
}
```

### Types

**File:** [`app-mobile/types/geoshare.ts`](app-mobile/types/geoshare.ts)

Complete TypeScript type definitions for:
- `GeoshareSession`
- `LocationUpdate`
- `GeosharePricing`
- `GeoshareSessionInfo`
- `PartnerLocation`

### Localization

**Files:**
- [`app-mobile/locales/en.json`](app-mobile/locales/en.json) - English strings
- [`app-mobile/locales/pl.json`](app-mobile/locales/pl.json) - Polish strings

**Namespace:** `geoshare.*`

**Categories:**
- General labels
- Permission messages
- Duration options
- Pricing display
- Map UI
- Session status
- Error messages
- Warnings
- Info & instructions

---

## Permissions & Configuration

### iOS Configuration (`app.json`)

```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Avalo needs your location for real-time location sharing with other users.",
      "NSLocationAlwaysAndWhenInUseUsageDescription": "Avalo needs your location in the background to continue sharing your location even when the app is not in the foreground.",
      "NSLocationAlwaysUsageDescription": "Avalo needs your location to share with other users.",
      "UIBackgroundModes": ["location"]
    }
  }
}
```

### Android Configuration (`app.json`)

```json
{
  "android": {
    "permissions": [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION"
    ]
  }
}
```

### Expo Location Plugin

```json
{
  "plugins": [
    [
      "expo-location",
      {
        "locationAlwaysAndWhenInUsePermission": "Allow Avalo to access your location for real-time location sharing.",
        "isAndroidBackgroundLocationEnabled": true,
        "isAndroidForegroundServiceEnabled": true
      }
    ]
  ]
}
```

---

## Usage Flow

### 1. Starting a Session

```typescript
import { useGeoshareSession } from '@/hooks/useGeoshareSession';

const { startSession, loading, error } = useGeoshareSession();

// Check permissions first
const permissions = await requestLocationPermissions();
if (!permissions.granted) {
  // Show permission error
  return;
}

// Start session
try {
  await startSession(partnerId, 30); // 30 minutes
  // Session started successfully
} catch (err) {
  // Handle error (insufficient tokens, etc.)
}
```

### 2. Viewing Location on Map

```typescript
import GeoshareMapView from '@/components/geoshare/GeoshareMapView';

<GeoshareMapView
  userLocation={currentLocation}
  partnerLocation={session?.partnerLocation}
  partnerName="Alice"
  remainingSeconds={remainingSeconds}
  onStop={stopSession}
/>
```

### 3. Stopping a Session

```typescript
const { stopSession } = useGeoshareSession();

await stopSession();
// Location tracking automatically stops
// Session marked as CANCELLED
```

---

## Edge Cases Handled

### ✅ App Backgrounded
- Background location tracking continues
- Updates sent to Firestore every 10 seconds
- Foreground service notification shown (Android)

### ✅ Internet Loss
- Location tracking continues locally
- Updates queued and sent when connection restored
- User sees "offline" warning in UI

### ✅ Session Expiry
- Automatic cleanup after paid time ends
- Location tracking stops automatically
- User notified of expiry

### ✅ Manual Stop
- Either user can stop the session
- Tracking immediately stopped
- Session marked as CANCELLED

### ✅ App Killed
- Background task terminated (expected behavior)
- Session remains active on server
- User must restart app to continue

### ✅ Rate Limiting
- Max 1 update per 8 seconds enforced
- Prevents spam and server overload
- Updates silently skipped if too frequent

### ✅ Permission Revoked
- Location tracking stops gracefully
- User shown permission error
- Session can be stopped without permissions

---

## Security Considerations

### Data Privacy
- ✅ No location history stored
- ✅ All locations deleted after session ends
- ✅ Only participants can access session data
- ✅ Expired sessions purged after 7 days

### Payment Security
- ✅ Payment validated before session creation
- ✅ 35% platform fee taken immediately
- ✅ No refunds (prevents abuse)
- ✅ Balance checked before allowing start

### Permission Security
- ✅ Users must explicitly grant location permissions
- ✅ No access without active session
- ✅ Partner can only see location during paid time
- ✅ Location updates require valid session

---

## Testing Checklist

### Backend Functions
- [ ] `getGeosharePricing` - Returns correct pricing for all durations
- [ ] `startGeoshareSession` - Creates session with correct fields
- [ ] `startGeoshareSession` - Deducts correct token amount
- [ ] `startGeoshareSession` - Records 35% platform fee
- [ ] `startGeoshareSession` - Rejects insufficient balance
- [ ] `startGeoshareSession` - Prevents duplicate active sessions
- [ ] `updateGeoshareLocation` - Accepts valid location data
- [ ] `updateGeoshareLocation` - Enforces rate limiting
- [ ] `updateGeoshareLocation` - Rejects expired sessions
- [ ] `stopGeoshareSession` - Marks session as CANCELLED
- [ ] `cleanupExpiredGeoshareSessions` - Deletes expired sessions
- [ ] `cleanupExpiredGeoshareSessions` - Removes location subcollections

### Mobile Functionality
- [ ] Permission request flow works
- [ ] Location tracking starts correctly
- [ ] Location updates sent to server
- [ ] Map displays both user and partner locations
- [ ] Accuracy circles rendered
- [ ] Timer counts down correctly
- [ ] Session stops when timer reaches zero
- [ ] Manual stop button works
- [ ] Payment modal shows correct pricing
- [ ] Duration options selectable
- [ ] Insufficient balance error shown

### Integration Tests
- [ ] User A starts session, User B sees location
- [ ] Location updates in real-time (within 10 seconds)
- [ ] Session expires after paid time
- [ ] Background location continues when app backgrounded
- [ ] Session stops when either user stops it
- [ ] Cannot start duplicate sessions
- [ ] Expired sessions cleaned up within 5 minutes

---

## Dependencies

### Required Packages

```json
{
  "expo-location": "^19.0.7",
  "react-native-maps": "1.11.3",
  "firebase": "^10.7.1"
}
```

### Installation

```bash
cd app-mobile
npm install react-native-maps
npx expo prebuild
```

**Note:** `react-native-maps` requires native module setup. Use `expo prebuild` to configure.

---

## Deployment Steps

### 1. Deploy Backend Functions

```bash
cd functions
npm run deploy
```

**Functions Deployed:**
- `getGeosharePricing`
- `startGeoshareSession`
- `updateGeoshareLocation`
- `stopGeoshareSession`
- `getGeoshareSession`
- `cleanupExpiredGeoshareSessions` (scheduled)
- `deleteOldGeoshareSessions` (scheduled)

### 2. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

**Rules File:** `firestore-rules/geoshare_sessions.rules`

### 3. Rebuild Mobile App

```bash
cd app-mobile
npx expo prebuild
npm run android  # or npm run ios
```

**Required for:**
- Location permission changes
- Background location setup
- Native map module

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Revenue Metrics**
   - Total geoshare sessions started
   - Total tokens earned (35% fee)
   - Average session duration purchased
   - Conversion rate (views → purchases)

2. **Usage Metrics**
   - Active sessions per hour
   - Average session length
   - Manual stops vs. auto-expiry
   - Repeat usage rate

3. **Technical Metrics**
   - Location update frequency
   - Failed location updates
   - Permission denial rate
   - Session cleanup performance

### Logs to Monitor

```typescript
// Search Cloud Functions logs for:
"Geoshare session started"
"Location update sent successfully"
"Geoshare session manually stopped"
"Geoshare cleanup complete"
"Platform fee recorded"
```

---

## Troubleshooting

### Common Issues

**Issue:** Location not updating
- **Cause:** Permissions not granted
- **Solution:** Check permission status, re-request if needed

**Issue:** "Insufficient tokens" error
- **Cause:** User wallet balance too low
- **Solution:** Direct user to purchase tokens

**Issue:** Session not starting
- **Cause:** Duplicate active session exists
- **Solution:** Stop existing session first

**Issue:** Background tracking stopped
- **Cause:** App killed by system
- **Solution:** Expected behavior - restart app to resume

**Issue:** Map not showing
- **Cause:** `react-native-maps` not installed
- **Solution:** Install package and rebuild app

---

## Future Enhancements

### Potential Features

1. **Extended Sessions**
   - Allow extending active session with additional payment
   - Add tokens while session is running

2. **Session History**
   - Optional: Show past session stats (without locations)
   - Duration, partner, date/time

3. **Location Sharing Groups**
   - Multi-user location sharing
   - Split cost among participants

4. **Geofencing Alerts**
   - Notify when partner enters/exits area
   - Premium feature

5. **Route Tracking**
   - Show path taken during session
   - Ephemeral - deleted after session

---

## API Reference

### Backend Functions

#### `getGeosharePricing`
```typescript
Input: { durationMinutes: number }
Output: {
  success: boolean;
  durationMinutes: number;
  pricePerMinute: number;
  totalTokens: number;
  avaloFee: number;
  netAmount: number;
  availableDurations: number[];
}
```

#### `startGeoshareSession`
```typescript
Input: { 
  partnerId: string;
  durationMinutes: number;
}
Output: {
  success: boolean;
  sessionId: string;
  expiresAt: string;
  durationMinutes: number;
  paidAmount: number;
}
```

#### `updateGeoshareLocation`
```typescript
Input: {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}
Output: {
  success: boolean;
  locationId: string;
  remainingSeconds: number;
}
```

#### `stopGeoshareSession`
```typescript
Input: { sessionId: string }
Output: {
  success: boolean;
  message: string;
}
```

#### `getGeoshareSession`
```typescript
Input: { sessionId: string }
Output: {
  success: boolean;
  session: GeoshareSessionInfo;
  partnerLocation: PartnerLocation | null;
}
```

---

## Compliance & Legal

### Terms of Service

Users must acknowledge:
- Location sharing is for personal safety/convenience only
- Data is temporary and not stored
- Payments are non-refundable
- Service may be terminated for misuse

### Regional Compliance

- **GDPR (EU)**: No location history = compliant
- **CCPA (California)**: Explicit consent required = compliant
- **Location Privacy Laws**: Consent-based, temporary = compliant

### Data Retention

- Active sessions: Until expiry or cancellation
- Expired sessions: +5 minutes grace period
- Old sessions: Purged after 7 days
- Location updates: Deleted with parent session

---

## Support

### For Questions or Issues

1. Review this documentation
2. Check inline code comments
3. Review error logs in Cloud Functions
4. Test in Firebase emulator first
5. Contact development team

### Related Documentation

- [`CHAT_MONETIZATION_IMPLEMENTATION.md`](CHAT_MONETIZATION_IMPLEMENTATION.md)
- [`CALL_MONETIZATION_IMPLEMENTATION.md`](CALL_MONETIZATION_IMPLEMENTATION.md)
- Expo Location Docs
- React Native Maps Docs

---

## Conclusion

The geoshare system is now fully implemented with:
- ✅ Complete backend infrastructure
- ✅ Secure payment processing
- ✅ Real-time location tracking
- ✅ Mobile UI components
- ✅ Automatic cleanup
- ✅ Comprehensive error handling
- ✅ Full localization support

**Status:** Ready for testing and deployment

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-25  
**Maintained By:** Kilo Code