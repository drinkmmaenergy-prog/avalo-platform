# PACK 92 — Quick Start Guide

## 🚀 Implementation Complete

All core components have been implemented:
- ✅ Backend notification engine
- ✅ Firestore collections & security rules
- ✅ Mobile screens (Inbox + Settings)
- ✅ Push notification infrastructure
- ✅ Real-time subscriptions
- ✅ Integration hooks

## 📦 Files Created

### Backend (functions/src/)
```
pack92-types.ts              - Type definitions
pack92-notifications.ts      - Core notification engine
pack92-endpoints.ts          - Callable Cloud Functions
pack92-integrations.ts       - Integration hooks for existing systems
```

### Mobile (app-mobile/)
```
services/notificationService.ts        - Firebase service layer
hooks/useNotifications.ts              - Notifications hook
hooks/useNotificationSettings.ts       - Settings hook
app/notifications/index.tsx            - Notifications list screen
app/notifications/settings.tsx         - Settings screen
utils/pushNotifications.ts             - Push registration
```

### Firestore (firestore-rules/)
```
pack92-notifications.rules   - Security rules
pack92-indexes.json          - Database indexes
```

## 🔧 Quick Setup

### 1. Deploy Backend

```bash
# Deploy functions
firebase deploy --only functions:registerPushToken,functions:unregisterPushToken,functions:getNotifications,functions:getNotificationSettings,functions:updateNotificationSettings,functions:markNotificationAsRead,functions:markAllNotificationsAsRead,functions:getUnreadCount

# Deploy security rules
firebase deploy --only firestore:rules

# Create indexes (or let Firebase auto-create them)
firebase deploy --only firestore:indexes
```

### 2. Install Mobile Dependencies

```bash
cd app-mobile
npx expo install expo-device expo-notifications
```

### 3. Configure Push in app.json

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#667eea"
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "android": {
      "googleServicesFile": "./google-services.json",
      "permissions": ["RECEIVE_BOOT_COMPLETED"]
    }
  }
}
```

### 4. Initialize in App

In your main App.tsx or index.tsx:

```typescript
import { configureNotifications, registerForPushNotifications } from './utils/pushNotifications';

// On app start
configureNotifications();

// After user logs in
const user = await auth().currentUser;
if (user) {
  await registerForPushNotifications();
}
```

### 5. Add Navigation

Add to your navigation structure:

```typescript
<Stack.Screen name="notifications/index" />
<Stack.Screen name="notifications/settings" />
```

### 6. Add Notification Badge (Optional)

In your header or tab bar component:

```typescript
import { useNotifications } from './hooks/useNotifications';

function Header() {
  const { unreadCount } = useNotifications();
  
  return (
    <TouchableOpacity onPress={() => router.push('/notifications')}>
      <Ionicons name="notifications-outline" size={24} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
```

## 🔗 Integration Examples

### Send Earnings Notification

```typescript
import { onCreatorEarning } from './pack92-integrations';

// After recording earning
await onCreatorEarning({
  creatorId: 'user123',
  amount: 100,
  source: 'unlocked your premium story',
  sourceId: 'story456',
});
```

### Send Payout Notification

```typescript
import { onPayoutStatusChanged } from './pack92-integrations';

// After status change
await onPayoutStatusChanged({
  userId: 'user123',
  requestId: 'payout456',
  newStatus: 'APPROVED',
  amount: 1000,
});
```

### Send Safety Alert

```typescript
import { onSafetyTimerExpired } from './pack92-integrations';

// When timer expires
await onSafetyTimerExpired({
  userId: 'user123',
  timerId: 'timer456',
  trustedContacts: ['contact1', 'contact2'],
  userName: 'John Doe',
});
```

## 📱 Usage in Mobile App

### Display Notifications

```typescript
import { useNotifications } from '../hooks/useNotifications';

function MyScreen() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
  } = useNotifications();

  return (
    <FlatList
      data={notifications}
      renderItem={({ item }) => (
        <NotificationItem
          notification={item}
          onPress={() => markAsRead(item.id)}
        />
      )}
    />
  );
}
```

### Manage Settings

```typescript
import { useNotificationSettings } from '../hooks/useNotificationSettings';

function SettingsScreen() {
  const {
    settings,
    togglePush,
    toggleCategory,
  } = useNotificationSettings();

  return (
    <View>
      <Switch
        value={settings?.pushEnabled}
        onValueChange={togglePush}
      />
    </View>
  );
}
```

## 🧪 Testing

### Test Backend

```typescript
// Send test notification
import { sendSystemNotification } from './pack92-notifications';

await sendSystemNotification({
  userId: 'YOUR_USER_ID',
  title: 'Test',
  body: 'Testing PACK 92',
});
```

### Test Push

```typescript
// Test push registration
import { registerForPushNotifications } from './utils/pushNotifications';

const success = await registerForPushNotifications();
console.log('Push registration:', success);
```

## ⚠️ Important Notes

1. **No free tokens** - Notifications inform, never promise rewards
2. **Mandatory categories** - LEGAL and SAFETY cannot be disabled
3. **User privacy** - Users only see their own notifications
4. **Deep links** - Use format `avalo://path` for navigation
5. **Permissions** - Request push permissions only after login

## 📊 Collections Structure

```
notifications/{notificationId}
├── userId: string
├── type: NotificationType
├── title: string
├── body: string
├── read: boolean
└── createdAt: Timestamp

user_notification_settings/{userId}
├── pushEnabled: boolean
├── categories: { EARNINGS, PAYOUT, MARKETING, SAFETY, LEGAL }
└── updatedAt: Timestamp

user_devices/{userId}_{deviceId}
├── pushToken: string
├── platform: "ios" | "android"
└── createdAt: Timestamp
```

## 🎯 Next Steps

1. Deploy backend functions
2. Deploy Firestore rules & indexes  
3. Install mobile dependencies
4. Configure push notifications
5. Add navigation routes
6. Test with sendSystemNotification
7. Integrate into existing systems
8. Add notification badge to UI

## 📚 Full Documentation

See [`PACK_92_NOTIFICATION_ENGINE_IMPLEMENTATION.md`](PACK_92_NOTIFICATION_ENGINE_IMPLEMENTATION.md) for:
- Complete architecture details
- All notification types
- Integration examples
- Security rules
- Troubleshooting guide

---

**Status**: ✅ Ready for deployment
**Version**: 1.0.0
**Last Updated**: 2025-11-26