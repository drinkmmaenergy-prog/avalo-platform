# PACK 47 — Media Cloud Delivery Implementation

## Overview

PACK 47 extends the Pay-Per-Action Media (PPM) system from PACK 42 with cloud-backed media delivery via Firebase Storage. All media files (photos/audio/video) are now uploaded to Firebase Storage and synchronized across devices, while maintaining the existing token-gated unlock mechanism.

## Key Features

✅ **Cloud Storage Integration**: Media uploaded to Firebase Storage  
✅ **Offline-First**: Local URIs cached, uploads retry automatically  
✅ **Backward Compatible**: Existing PPM pricing and gating unchanged  
✅ **Metadata Sync**: Remote URLs synced to Firestore (no binaries)  
✅ **Retry Logic**: Failed uploads automatically retried up to 10 times  
✅ **UI Indicators**: Upload status shown to users  

## Architecture

### Mobile (app-mobile/)
- **types/chat.ts**: Extended [`ChatMessage`](app-mobile/types/chat.ts:23) interface with cloud fields
- **services/mediaUploadService.ts**: Handles Firebase Storage uploads
- **services/backSyncService.ts**: Syncs media metadata to backend
- **services/chatSyncService.ts**: Merges server + local media state

### Backend (functions/src/)
- **chatSync.ts**: Updated [`syncMessage`](functions/src/chatSync.ts:62) to accept and store media metadata

## Data Model Changes

### ChatMessage Interface Extension

```typescript
export interface ChatMessage {
  // ... existing fields from PACK 42 ...
  
  // PACK 47: Cloud Media Delivery
  mediaUploadStatus?: MediaUploadStatus;  // "none" | "pending" | "uploading" | "uploaded" | "failed"
  mediaStoragePath?: string;              // "chat-media/{conversationId}/{messageId}/{filename}"
  mediaRemoteUrl?: string;                // Firebase Storage download URL
}
```

### Storage Path Convention

```
chat-media/{conversationId}/{messageId}/{filename}
```

Example:
```
chat-media/user1_user2/msg_abc123/media.jpg
```

## Integration Guide

### 1. Sending Paid Media with Cloud Upload

```typescript
import { uploadMediaForMessage } from '../services/mediaUploadService';
import { syncMessage } from '../services/backSyncService';

// Step 1: Create local message with media
const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const conversationId = getConversationId(currentUserId, partnerId);

const localMessage: ChatMessage = {
  id: messageId,
  conversationId,
  senderId: currentUserId,
  receiverId: partnerId,
  text: '', // Can be empty for media-only messages
  createdAt: Date.now(),
  status: 'local',
  
  // PPM fields from PACK 42
  mediaType: 'photo', // or 'audio' | 'video'
  mediaUri: localFileUri, // Local file path
  payToUnlock: true,
  unlockPriceTokens: 50,
  unlockedBy: [],
  
  // PACK 47 fields
  mediaUploadStatus: 'pending',
};

// Step 2: Save to local AsyncStorage and display immediately
await saveLocalMessage(conversationId, localMessage);
setMessages([...messages, localMessage]);

// Step 3: Upload to Firebase Storage in background
try {
  const result = await uploadMediaForMessage({
    conversationId,
    messageId,
    senderId: currentUserId,
    mediaType: 'photo',
    localUri: localFileUri,
  });
  
  // Upload service automatically:
  // - Updates local message with mediaRemoteUrl + mediaStoragePath
  // - Sets mediaUploadStatus to 'uploaded'
  // - Triggers syncMessage to backend
  
  console.log('Media uploaded:', result.downloadUrl);
} catch (error) {
  console.error('Upload failed, will retry:', error);
  // Message already marked as 'failed' by uploadMediaForMessage
  // Will be retried on next app start or manual retry
}
```

### 2. Displaying Remote Media (Receiver Side)

```typescript
import { Image } from 'react-native';
import { unlockPaidMedia } from '../services/ppmService';

function MediaMessage({ message, currentUserId }) {
  const isLocked = message.payToUnlock && !message.unlockedBy?.includes(currentUserId);
  const isUploaded = message.mediaUploadStatus === 'uploaded';
  
  if (isLocked) {
    // Show locked placeholder
    return (
      <TouchableOpacity onPress={() => handleUnlock(message)}>
        <View style={styles.lockedMedia}>
          <Icon name="lock" />
          <Text>Unlock for {message.unlockPriceTokens} tokens</Text>
        </View>
      </TouchableOpacity>
    );
  }
  
  // Unlocked - show media
  if (isUploaded && message.mediaRemoteUrl) {
    // Prefer remote URL for cross-device sync
    return (
      <Image 
        source={{ uri: message.mediaRemoteUrl }}
        style={styles.media}
      />
    );
  } else if (message.mediaUri) {
    // Fallback to local URI if remote not yet available
    return (
      <View>
        <Image 
          source={{ uri: message.mediaUri }}
          style={styles.media}
        />
        {!isUploaded && (
          <Text style={styles.processingText}>
            Media still processing…
          </Text>
        )}
      </View>
    );
  }
  
  return null;
}

async function handleUnlock(message: ChatMessage) {
  // Use existing PPM unlock logic from PACK 42
  await unlockPaidMedia(message.id, currentUserId, message.unlockPriceTokens!);
  
  // After unlock, message will be fetched with mediaRemoteUrl from backend
  // via chat sync, allowing receiver to view the media
}
```

### 3. Upload Status Indicators

```typescript
function MediaMessageBubble({ message }) {
  const { t } = useTranslation();
  
  // Show upload status for outgoing messages
  if (message.senderId === currentUserId) {
    switch (message.mediaUploadStatus) {
      case 'uploading':
        return (
          <View style={styles.statusIndicator}>
            <ActivityIndicator size="small" />
            <Text>{t('chat:ppm.uploading')}</Text>
          </View>
        );
        
      case 'failed':
        return (
          <View style={styles.statusIndicator}>
            <Icon name="warning" color="orange" />
            <Text>{t('chat:ppm.uploadFailed')}</Text>
          </View>
        );
        
      case 'uploaded':
        // Show checkmark or nothing
        return <Icon name="check" color="green" />;
        
      default:
        return null;
    }
  }
  
  return null;
}
```

### 4. Lifecycle Integration (Retry on App Start)

```typescript
// In App.tsx or main entry point

import { retryPendingMediaUploads } from './services/mediaUploadService';
import { useEffect } from 'react';

function App() {
  const currentUserId = useAuth().user?.id;
  
  useEffect(() => {
    if (currentUserId) {
      // Retry failed uploads on app start
      retryPendingMediaUploads(currentUserId)
        .then(() => {
          console.log('Pending uploads processed');
        })
        .catch(err => {
          console.error('Error retrying uploads:', err);
        });
    }
  }, [currentUserId]);
  
  return <RootNavigator />;
}
```

### 5. Chat Screen Integration

```typescript
// In ChatScreen component

import { retryPendingMediaUploads } from '../services/mediaUploadService';

function ChatScreen({ route }) {
  const { partnerId } = route.params;
  const currentUserId = useAuth().user.id;
  
  useEffect(() => {
    // Retry uploads when chat screen mounts (throttled)
    const throttledRetry = throttle(() => {
      retryPendingMediaUploads(currentUserId);
    }, 30000); // Max once per 30 seconds
    
    throttledRetry();
    
    return () => {
      // Cleanup
    };
  }, [currentUserId]);
  
  // ... rest of chat screen logic
}
```

## Upload Flow Diagram

```
User selects media
       ↓
Create local ChatMessage
  - mediaUri: local path
  - mediaUploadStatus: "pending"
  - status: "local"
       ↓
Save to AsyncStorage
       ↓
Display in chat UI
       ↓
[Background] uploadMediaForMessage()
       ↓
Update to "uploading"
       ↓
Upload to Firebase Storage
       ↓
Get download URL
       ↓
Update local message:
  - mediaRemoteUrl
  - mediaStoragePath
  - mediaUploadStatus: "uploaded"
       ↓
syncMessage() to backend
       ↓
Backend stores metadata in Firestore
       ↓
Other device fetches via chatSyncService
       ↓
Receiver sees media (if unlocked)
```

## Error Handling

### Upload Failures

If upload fails:
1. Message `mediaUploadStatus` set to `"failed"`
2. Context added to `pending_media_uploads_v1_{userId}` in AsyncStorage
3. Automatic retry on:
   - App start
   - Chat screen mount
   - Background retry scheduler (every 60s)
4. Max 10 retries, then give up

### Offline Behavior

- App works fully offline with local URIs
- Uploads queued and retried when online
- No user intervention required
- Messages remain visible with local URI

## Security

### Firebase Storage Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload to their own conversation paths
    match /chat-media/{conversationId}/{messageId}/{filename} {
      allow write: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}
```

**Note**: Token-gated unlock is enforced client-side via PPM logic. Storage rules only check authentication, not unlock status.

## Backward Compatibility

✅ All existing PACK 42 PPM pricing logic unchanged  
✅ `mediaUri` still used as local fallback  
✅ Missing `mediaUploadStatus` treated as `"none"` or `"pending"`  
✅ Old messages without cloud fields continue to work  
✅ No breaking changes to any interfaces  

## Testing Checklist

- [ ] Send paid photo message → uploads to Storage
- [ ] Send paid audio message → uploads to Storage
- [ ] Send paid video message → uploads to Storage
- [ ] Receiver sees locked placeholder before unlock
- [ ] Unlock deducts tokens (PACK 42 logic)
- [ ] After unlock, remote media loads from URL
- [ ] Upload status indicators show correctly
- [ ] Failed upload retries automatically
- [ ] Offline send queues upload for later
- [ ] Cross-device: message syncs with remote URL
- [ ] Local URI fallback works if remote unavailable

## Performance Notes

- Uploads run in background, don't block UI
- AsyncStorage used for local cache (fast)
- Firestore stores only metadata, not binaries
- Download URLs cached locally after first fetch
- No impact on existing message send/receive flow

## Localization Keys Added

### English (`locales/en/chat.json`)
```json
{
  "ppm": {
    "uploading": "Uploading…",
    "uploadFailed": "Upload failed. Will retry.",
    "mediaProcessing": "Media still processing…",
    "unlockMedia": "Unlock for {{tokens}} tokens"
  }
}
```

### Polish (`locales/pl/chat.json`)
```json
{
  "ppm": {
    "uploading": "Przesyłanie…",
    "uploadFailed": "Przesyłanie nie powiodło się. Spróbujemy ponownie.",
    "mediaProcessing": "Przetwarzanie mediów…",
    "unlockMedia": "Odblokuj za {{tokens}} tokenów"
  }
}
```

## Files Modified/Created

### Mobile
- ✅ [`app-mobile/types/chat.ts`](app-mobile/types/chat.ts) - Extended ChatMessage interface
- ✅ [`app-mobile/services/mediaUploadService.ts`](app-mobile/services/mediaUploadService.ts) - NEW: Media upload service
- ✅ [`app-mobile/services/backSyncService.ts`](app-mobile/services/backSyncService.ts) - Added media metadata fields
- ✅ [`app-mobile/services/chatSyncService.ts`](app-mobile/services/chatSyncService.ts) - Merge cloud media state
- ✅ [`locales/en/chat.json`](locales/en/chat.json) - Added PPM UI strings
- ✅ [`locales/pl/chat.json`](locales/pl/chat.json) - Added PPM UI strings

### Backend
- ✅ [`functions/src/chatSync.ts`](functions/src/chatSync.ts) - Accept and store media metadata

## Migration Notes

### For Existing Messages

Old messages without cloud fields will:
- Continue to work with `mediaUri` (local only)
- Display correctly on original device
- Not sync media across devices (expected behavior)

### Upgrading Existing Chats

No migration needed! Cloud delivery is additive:
- Old messages use local URIs
- New messages use cloud URLs
- Both coexist seamlessly

## Support & Troubleshooting

### Upload Stuck at "Uploading"

1. Check network connectivity
2. Check Firebase Storage configuration
3. Verify storage rules allow authenticated writes
4. Check console logs for detailed error

### Media Not Displaying After Unlock

1. Verify `mediaRemoteUrl` is set on message
2. Check Firebase Storage download URL is valid
3. Ensure receiver has internet connectivity
4. Check if local `mediaUri` fallback is available

### Pending Uploads Not Retrying

1. Verify [`retryPendingMediaUploads()`](app-mobile/services/mediaUploadService.ts:289) is called on app start
2. Check AsyncStorage for pending tasks: `pending_media_uploads_v1_{userId}`
3. Verify max retries (10) not exceeded
4. Check network connectivity

## Next Steps

Potential future enhancements:
- Progress callbacks during upload
- Thumbnail generation for photos/videos
- Compression before upload
- CDN integration for faster delivery
- Upload queue prioritization
- Bandwidth-aware upload quality

---

**PACK 47 Implementation Complete** ✅

All requirements met:
- ✅ Cloud media upload to Firebase Storage
- ✅ Remote URL metadata sync to Firestore
- ✅ Backward compatible with PACK 42 PPM
- ✅ Offline-first with automatic retry
- ✅ No changes to pricing or unlock logic
- ✅ UI indicators and localization
- ✅ Comprehensive documentation