# PACK 92 — Unified Notification & Messaging Engine

**Complete Implementation Documentation**

## Overview

PACK 92 implements a centralized notification engine that handles:
- Transactional events (earnings, payouts, KYC, disputes, enforcement, legal updates)
- Real-time user activity (gifts, paid media, premium stories, safety timers)
- In-app inbox messages and push notifications
- Per-user notification preferences

## Non-Negotiable Rules

✅ **NO free tokens, NO discounts, NO promo codes, NO cashback, NO bonuses**
✅ **Token price per unit unchanged**
✅ **Revenue split unchanged (65% creator / 35% Avalo)**
✅ **Notifications inform about earnings, never guarantee future income**
✅ **Legal/trust/enforcement notifications must be clear, neutral, compliant**

---

## Architecture

### Backend Components

```
functions/src/
├── pack92-types.ts              # TypeScript type definitions
├── pack92-notifications.ts      # Core notification engine
├── pack92-endpoints.ts          # Callable Cloud Functions
├── pack92-integrations.ts       # Integration hooks for existing systems
```

### Mobile Components

```
app-mobile/
├── services/
│   └── notificationService.ts   # Firebase service layer
├── hooks/
│   ├── useNotifications.ts      # Notifications hook
│   └── useNotificationSettings.ts # Settings hook
├── app/notifications/
│   ├── index.tsx                # Notifications list screen
│   └── settings.tsx             # Settings screen
└── utils/
    └── pushNotifications.ts     # Push registration utilities
```

### Firestore Collections

```
notifications/                   # Notification documents
├── {notificationId}
│   ├── id: string
│   ├── userId: string
│   ├── type: NotificationType
│   ├── category: NotificationCategory
│   ├── title: string
│   ├── body: string
│   ├── deepLink?: string
│   ├── read: boolean
│   ├── createdAt: Timestamp
│   ├── channels: string[]
│   └── payload?: object

user_notification_settings/      # User preferences
├── {userId}
│   ├── userId: string
│   ├── pushEnabled: boolean
│   ├── emailEnabled: boolean
│   ├── inAppEnabled: boolean
│   ├── categories: object
│   └── updatedAt: Timestamp

user_devices/                    # Push tokens
└── {userId}_{deviceId}
    ├── userId: string
    ├── deviceId: string
    ├── pushToken: string
    ├── platform: "ios" | "android"
    ├── createdAt: Timestamp
    └── updatedAt: Timestamp
```

---

## Backend Implementation

### 1. Sending Notifications

```typescript
import { sendEarningsNotification } from './pack92-notifications';

// Example: After recording an earning
await sendEarningsNotification({
  userId: creatorId,
  amount: netTokensCreator,
  source: 'unlocked your premium story',
  sourceId: storyId,
});
```

### 2. Notification Types

```typescript
// EARNINGS - User earned tokens
sendEarningsNotification({
  userId, amount, source, sourceId
});

// PAYOUT - Payout request status change
sendPayoutNotification({
  userId, status, requestId, amount?, reason?
});

// KYC - Identity verification status
sendKycNotification({
  userId, status, documentId, reason?
});

// DISPUTE - Report/dispute updates
sendDisputeNotification({
  userId, disputeId, role
});

// ENFORCEMENT - Account restrictions
sendEnforcementNotification({
  userId, level, reason
});

// LEGAL_UPDATE - Terms requiring acceptance
sendLegalUpdateNotification({
  userId, documentType, version
});

// SAFETY - Emergency alerts
sendSafetyNotification({
  userId, type, alertUserId?, alertUserName?, timerId?
});

// SYSTEM - General announcements
sendSystemNotification({
  userId, title, body, deepLink?
});
```

### 3. Integration Examples

#### Earnings Integration (creatorEarnings.ts)

```typescript
import { onCreatorEarning } from './pack92-integrations';

export async function recordEarning(params) {
  // ... existing earning logic ...
  const ledgerRef = await db.collection('earnings_ledger').add(ledgerEntry);
  await updateCreatorBalance(creatorId, netTokensCreator);
  
  // ✅ PACK 92: Send notification
  await onCreatorEarning({
    creatorId,
    amount: netTokensCreator,
    source: sourceType === 'GIFT' ? 'gift' : 'premium story',
    sourceId: ledgerRef.id,
  });
  
  return ledgerRef.id;
}
```

#### Payout Integration (payoutRequests.ts)

```typescript
import { onPayoutRequestCreated, onPayoutStatusChanged } from './pack92-integrations';

// After creating payout request
await onPayoutRequestCreated({
  userId,
  requestId,
  amount: params.requestedTokens,
});

// After status change
await onPayoutStatusChanged({
  userId,
  requestId,
  newStatus: 'APPROVED',
  amount: payoutAmount,
});
```

#### Safety Timer Integration (safetyTimers.ts)

```typescript
import { onSafetyTimerExpired } from './pack92-integrations';

// In checkExpiredSafetyTimers scheduler
await onSafetyTimerExpired({
  userId: timer.userId,
  timerId: doc.id,
  trustedContacts: timer.trustedContacts,
  userName: userData?.displayName || 'A user',
});
```

---

## Mobile Implementation

### 1. Setup Push Notifications

In your app initialization (App.tsx or index.tsx):

```typescript
import { configureNotifications, registerForPushNotifications } from './utils/pushNotifications';

// Configure notification behavior
configureNotifications();

// After user logs in
await registerForPushNotifications();
```

### 2. Display Notifications

```typescript
import { useNotifications } from '../hooks/useNotifications';

function MyComponent() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications();

  return (
    <View>
      <Text>Unread: {unreadCount}</Text>
      {notifications.map(notif => (
        <TouchableOpacity
          key={notif.id}
          onPress={() => markAsRead(notif.id)}
        >
          <Text>{notif.title}</Text>
          <Text>{notif.body}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

### 3. Manage Settings

```typescript
import { useNotificationSettings } from '../hooks/useNotificationSettings';

function SettingsComponent() {
  const {
    settings,
    loading,
    togglePush,
    toggleCategory,
  } = useNotificationSettings();

  return (
    <View>
      <Switch
        value={settings?.pushEnabled}
        onValueChange={togglePush}
      />
      <Switch
        value={settings?.categories.EARNINGS}
        onValueChange={() => toggleCategory('EARNINGS')}
      />
    </View>
  );
}
```

### 4. Navigate from Notifications

Notifications include deep links for automatic navigation:

```typescript
// Deep links format: avalo://path
'avalo://wallet'              → Wallet screen
'avalo://payouts/{id}'        → Specific payout details
'avalo://kyc'                 → KYC verification
'avalo://disputes/{id}'       → Dispute details
'avalo://legal'               → Legal center
'avalo://safety/{timerId}'    → Safety timer details
```

---

## Security Rules

```javascript
// notifications - Users can only read/update their own
match /notifications/{notificationId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow update: if request.auth.uid == resource.data.userId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
}

// user_notification_settings - Users manage their own
match /user_notification_settings/{userId} {
  allow read, update: if request.auth.uid == userId
    && request.resource.data.categories.LEGAL == true
    && request.resource.data.categories.SAFETY == true;
}

// user_devices - Users manage their own devices
match /user_devices/{deviceDocId} {
  allow read, delete: if request.auth.uid == resource.data.userId;
  allow create, update: if request.auth.uid == request.resource.data.userId
    && deviceDocId.matches(request.auth.uid + '_.*');
}
```

---

## Mandatory Categories

Some notification categories **CANNOT** be disabled:

- ✅ **LEGAL** - Terms and policy updates requiring acceptance
- ✅ **SAFETY** - Emergency alerts, panic button, timer expiry

These are enforced at:
- Backend (pack92-notifications.ts)
- Security rules (pack92-notifications.rules)
- Mobile UI (settings.tsx - switches disabled)

---

## Testing

### 1. Test Notification Creation

```typescript
import { sendSystemNotification } from './pack92-notifications';

// Send test notification to yourself
await sendSystemNotification({
  userId: 'YOUR_USER_ID',
  title: 'Test Notification',
  body: 'Testing PACK 92 implementation',
  deepLink: 'avalo://wallet',
});
```

### 2. Test Push Registration

```typescript
import { registerForPushNotifications } from './utils/pushNotifications';

// Register device
const success = await registerForPushNotifications();
console.log('Push registration:', success);
```

### 3. Test Settings

```typescript
import { updateNotificationSettings } from './services/notificationService';

// Update settings
await updateNotificationSettings({
  pushEnabled: true,
  categories: {
    EARNINGS: true,
    PAYOUT: true,
    MARKETING: false,
    SAFETY: true,  // Cannot be changed
    LEGAL: true,   // Cannot be changed
  },
});
```

---

## Deployment Checklist

### Backend

- [ ] Deploy Cloud Functions (pack92-endpoints.ts)
- [ ] Deploy Firestore security rules (pack92-notifications.rules)
- [ ] Create Firestore indexes (pack92-indexes.json)
- [ ] Integrate notification calls in existing functions:
  - [ ] creatorEarnings.ts
  - [ ] payoutRequests.ts
  - [ ] kyc.ts
  - [ ] disputes functions
  - [ ] enforcement functions
  - [ ] legal functions
  - [ ] safetyTimers.ts

### Mobile

- [ ] Install dependencies: `npx expo install expo-device expo-notifications`
- [ ] Configure push notifications in app.json
- [ ] Add notification screens to navigation
- [ ] Add notification badge to app header/tab bar
- [ ] Test push notification registration
- [ ] Test in-app notification display
- [ ] Test notification settings

### Firebase Console

- [ ] Enable Cloud Messaging API
- [ ] Configure FCM for iOS (APNs)
- [ ] Configure FCM for Android
- [ ] Set up notification templates (optional)
- [ ] Test push from Firebase Console

---

## Monitoring

### Key Metrics

1. **Notification Delivery**
   - Total notifications sent
   - Delivery success rate
   - Push vs in-app ratio

2. **User Engagement**
   - Unread notification count
   - Average time to read
   - Click-through rate on deep links

3. **Settings**
   - % users with push enabled
   - Most disabled categories
   - Settings update frequency

---

## Troubleshooting

### Push Notifications Not Working

1. **Check permissions**: `await Notifications.getPermissionsAsync()`
2. **Verify push token**: Console log the returned token
3. **Check device registration**: Query `user_devices` collection
4. **Test from Firebase Console**: Send test notification
5. **Check Expo project ID**: In pushNotifications.ts

### Notifications Not Appearing

1. **Check user settings**: Verify settings in Firestore
2. **Check channels**: Ensure IN_APP or PUSH is enabled
3. **Check Firestore rules**: Verify user can read notifications
4. **Check indexes**: Ensure Firestore indexes are created

### Deep Links Not Working

1. **Verify format**: Should be `avalo://path`
2. **Check router configuration**: Ensure paths are registered
3. **Test navigation**: Try manually navigating to path

---

## Future Enhancements

- [ ] Email notifications (already structured for it)
- [ ] Notification templates with variable substitution
- [ ] Scheduled notifications
- [ ] Notification groups/channels
- [ ] Rich media in notifications (images, buttons)
- [ ] A/B testing for notification copy
- [ ] Analytics dashboard

---

## Support

For issues or questions:
- Check this documentation
- Review integration examples in pack92-integrations.ts
- Test with sendSystemNotification first
- Verify Firestore rules and indexes are deployed

---

## Summary

PACK 92 provides a complete, production-ready notification infrastructure that:

✅ Centralizes all notification logic
✅ Supports multiple channels (in-app, push, email-ready)
✅ Respects user preferences with mandatory categories
✅ Integrates seamlessly with existing systems
✅ Follows all business rules (no free tokens, etc.)
✅ Includes comprehensive mobile UI
✅ Has proper security and permissions
✅ Scales efficiently with real-time subscriptions

The system is ready for immediate use and future expansion.