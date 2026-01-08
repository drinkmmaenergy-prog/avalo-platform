# PACK 190 - Cloud Sync & Offline Continuity Quick Start

## 🚀 Quick Setup (5 Minutes)

### Step 1: Deploy Backend (2 min)

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# Deploy sync functions
cd functions
npm run build
firebase deploy --only functions:performSync,functions:processOfflineQueue,functions:enqueueOfflineAction,functions:getSyncState,functions:registerDeviceSession,functions:terminateDeviceSession,functions:getActiveSessions,functions:cleanupSyncData
```

### Step 2: Initialize in Mobile App (1 min)

```typescript
// In your app initialization (e.g., app/_layout.tsx)
import { syncManager } from '@/lib/sync/SyncManager';

useEffect(() => {
  async function initSync() {
    await syncManager.initialize();
    await syncManager.registerSession();
  }
  
  initSync();
  
  return () => {
    syncManager.destroy();
  };
}, []);
```

### Step 3: Add UI Components (2 min)

```tsx
// In your root layout
import { SyncBanner } from '@/app/components/sync/SyncBanner';
import { MediaUploadMonitor } from '@/app/components/sync/MediaUploadMonitor';
import { CrossPlatformIndicator } from '@/app/components/sync/CrossPlatformIndicator';
import { DeviceNotification } from '@/app/components/sync/DeviceNotification';

export default function RootLayout() {
  return (
    <>
      <DeviceNotification />
      <SyncBanner />
      <Stack>
        {/* Your screens */}
      </Stack>
      <MediaUploadMonitor />
    </>
  );
}
```

---

## 📱 Usage Examples

### Save Draft Message

```typescript
import { OfflineDraftCache } from '@/lib/sync/OfflineDraftCache';

// Save draft
await OfflineDraftCache.saveDraft(
  chatId,
  'Hello, this is my draft message',
  syncManager.getDeviceInfo().deviceId
);

// Get draft when returning to chat
const draft = await OfflineDraftCache.getDraft(chatId);
if (draft) {
  setMessageText(draft.content);
}
```

### Queue Offline Action

```typescript
import { syncManager } from '@/lib/sync/SyncManager';

// Queue a message while offline
await syncManager.enqueueAction('message', {
  chatId: 'chat_123',
  content: 'This will send when I reconnect',
  attachments: []
});

// Queue a media upload
await syncManager.enqueueAction('media', {
  chatId: 'chat_123',
  mediaType: 'image',
  localPath: imageUri,
  metadata: { width: 1080, height: 1920 }
});
```

### Monitor Sync Status

```typescript
import { syncManager } from '@/lib/sync/SyncManager';

// Listen to sync status changes
useEffect(() => {
  const unsubscribe = syncManager.addListener((status) => {
    console.log('Sync status:', {
      isOnline: status.isOnline,
      lastSync: status.lastSyncAt,
      queuedItems: status.queuedItems
    });
  });
  
  return unsubscribe;
}, []);

// Get current status
const status = syncManager.getStatus();
```

### Manual Sync Trigger

```typescript
import { syncManager } from '@/lib/sync/SyncManager';

// Trigger sync manually (e.g., on pull-to-refresh)
const handleRefresh = async () => {
  const success = await syncManager.performSync();
  if (success) {
    console.log('Sync completed');
  }
};
```

---

## 🔧 Configuration

### Update Sync Settings

```typescript
import { syncManager } from '@/lib/sync/SyncManager';

await syncManager.updateConfig({
  autoSync: true,                      // Enable automatic sync
  syncInterval: 30000,                 // Sync every 30 seconds
  offlineQueueEnabled: true,           // Enable offline queue
  conflictResolution: 'server_wins'    // How to resolve conflicts
});
```

### Environment Setup

Add to your `.env`:

```env
EXPO_PUBLIC_CLOUD_FUNCTIONS_URL=https://europe-west3-avalo-c8c46.cloudfunctions.net
```

---

## 🧪 Testing Sync

### Test Offline Queue

1. Turn off network connection
2. Send messages or upload media
3. Verify items appear in queue (check `status.queuedItems`)
4. Turn network back on
5. Watch items process automatically

### Test Multi-Device

1. Log in on Device A
2. Log in on Device B
3. On Device B, check for new device notification
4. Send message on Device A
5. Verify message appears on Device B within 30 seconds

### Test Draft Sync

1. Type a message on Device A (don't send)
2. Save draft
3. Open same chat on Device B
4. Draft should appear automatically

---

## 📊 Monitor in Production

### Check Sync State

```typescript
// Get sync versions
const response = await fetch(
  `${process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL}/getSyncState?deviceId=${deviceId}`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

const data = await response.json();
console.log('Sync versions:', data.versions);
```

### View Active Sessions

```typescript
const response = await fetch(
  `${process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL}/getActiveSessions`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

const data = await response.json();
console.log('Active devices:', data.sessions);
```

---

## 🔍 Troubleshooting

### Sync Not Working

**Check:**
1. Network connectivity: `status.isOnline`
2. Authentication: User logged in?
3. Cloud functions deployed
4. Environment variables set

**Fix:**
```typescript
// Force manual sync
await syncManager.performSync();

// Check for errors
const status = syncManager.getStatus();
console.log('Errors:', status.errors);
```

### Queue Items Not Processing

**Check:**
1. Queue status: `status.queuedItems`
2. Network connection
3. Function logs in Firebase Console

**Fix:**
```typescript
// Manually trigger queue processing
const user = auth.currentUser;
const token = await user.getIdToken();

await fetch(
  `${process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL}/processOfflineQueue`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      deviceId: syncManager.getDeviceInfo().deviceId
    })
  }
);
```

### Drafts Not Syncing

**Check:**
1. Draft exists locally: `await OfflineDraftCache.getDraft(chatId)`
2. User authenticated
3. Network connection

**Fix:**
```typescript
// Force draft sync
await OfflineDraftCache.syncDraftToCloud(chatId);

// Or sync all drafts
await OfflineDraftCache.syncAllDraftsToCloud();
```

---

## 📈 Performance Tips

1. **Adjust Sync Interval:** Increase `syncInterval` to reduce network usage
2. **Limit Queue Size:** Clear old items regularly
3. **Batch Operations:** Queue multiple actions before syncing
4. **Monitor Memory:** Clear old drafts automatically

```typescript
// Clear old drafts (older than 7 days)
await OfflineDraftCache.clearOldDrafts(7);

// Clean up queue
const response = await fetch(
  `${process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL}/cleanupSyncData`,
  { method: 'POST' }
);
```

---

## 🎯 Key Features

✅ **Auto-Sync** - Syncs every 30 seconds by default
✅ **Offline Queue** - Actions queued and processed on reconnect
✅ **Draft Sync** - Message drafts follow you across devices
✅ **Media Sync** - Photos/videos sync automatically
✅ **Conflict Resolution** - Smart handling of sync conflicts
✅ **Multi-Device** - Manage all logged-in devices
✅ **Security Alerts** - New device login notifications
✅ **Zero Data Loss** - Nothing gets lost during device switches

---

## 📚 Component Reference

### SyncManager
Main sync orchestrator - handles all sync operations

**Methods:**
- `initialize()` - Initialize sync manager
- `performSync()` - Trigger manual sync
- `enqueueAction()` - Queue offline action
- `registerSession()` - Register device
- `getStatus()` - Get sync status
- `addListener()` - Listen to status changes

### OfflineDraftCache
Manages message drafts across devices

**Methods:**
- `saveDraft()` - Save draft locally
- `getDraft()` - Get draft
- `deleteDraft()` - Delete draft
- `syncDraftToCloud()` - Sync to cloud
- `syncDraftFromCloud()` - Sync from cloud

### UI Components
- `SyncBanner` - Shows sync/offline status
- `MediaUploadMonitor` - Shows upload progress
- `CrossPlatformIndicator` - Shows active devices
- `DeviceNotification` - New device alerts

---

## 🚀 You're Ready!

PACK 190 is now active. Your users can:
- Switch devices mid-conversation
- Work offline without data loss
- See sync status in real-time
- Manage all their devices
- Get security alerts for new logins

**Next Steps:**
1. Test on multiple devices
2. Monitor sync logs
3. Adjust sync interval if needed
4. Train support team on features

---

For detailed documentation, see [`PACK_190_IMPLEMENTATION_COMPLETE.md`](PACK_190_IMPLEMENTATION_COMPLETE.md)