# PACK 80 — Cross-Chat Media Paywall Implementation Guide

**Complete Implementation for Locked Photos & Videos Inside Chat Messages**

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Components](#implementation-components)
4. [Installation & Setup](#installation--setup)
5. [Usage Examples](#usage-examples)
6. [API Reference](#api-reference)
7. [Security Considerations](#security-considerations)
8. [Testing Guide](#testing-guide)
9. [Troubleshooting](#troubleshooting)

---

## Overview

PACK 80 transforms private chats into a true pay-per-content earning channel by enabling users to send locked media (photos/videos) that require token payment to unlock.

### Business Model

- **Commission Split**: 35% Avalo / 65% Creator
- **Pricing**: 5-10,000 tokens per media
- **No Refunds**: All transactions are final
- **Instant Payment**: Creators receive tokens immediately upon unlock

### Media Specifications

| Type  | Max Duration | Max Size | Compression |
|-------|-------------|----------|-------------|
| Image | —           | 15MB     | JPEG 85%    |
| Video | 25 seconds  | 80MB     | Required    |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (React Native)                    │
├─────────────────────────────────────────────────────────────┤
│  Components: LockedMediaBubble, UnlockModal, PricePicker   │
│  Hooks: usePaidMedia, usePaidMediaAccess                   │
│  Services: paidMediaService, paidMediaUploadService        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ HTTPS Callable
┌─────────────────────────────────────────────────────────────┐
│              FIREBASE CLOUD FUNCTIONS                        │
├─────────────────────────────────────────────────────────────┤
│  • sendPaidMediaMessage()  →  Token validation              │
│  • unlockPaidMedia()       →  Payment processing            │
│  • cleanupDeletedMedia()   →  CRON cleanup                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    FIRESTORE DATABASE                        │
├─────────────────────────────────────────────────────────────┤
│  Collections:                                                │
│  • paid_media_messages  → Media metadata                    │
│  • paid_media_unlocks   → Unlock records                    │
│  • transactions         → Payment audit trail               │
│  • balances/{uid}/wallet → Token balances                   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────────────────┐
│                  FIREBASE STORAGE                            │
├─────────────────────────────────────────────────────────────┤
│  Paths:                                                      │
│  • paid-media/{chatId}/{messageId}/media.{ext}              │
│  • paid-media/{chatId}/{messageId}/thumbnail.jpg            │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Components

### 1. TypeScript Types (`app-mobile/types/paidMedia.ts`)

Complete type definitions for the entire system:

```typescript
// Core types
export interface PaidMediaMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  mediaUrl: string;
  mediaType: PaidMediaType;
  priceTokens: number;
  createdAt: Date | Timestamp;
  status: PaidMediaStatus;
  thumbnailUrl?: string;
  mediaDuration?: number;
}

export interface PaidMediaUnlock {
  id: string;
  userId: string;
  mediaId: string;
  chatId: string;
  unlockedAt: Date | Timestamp;
  tokensSpent: number;
  transactionId: string;
}

// Configuration
export const PAID_MEDIA_CONFIG = {
  AVALO_COMMISSION: 0.35,
  CREATOR_SHARE: 0.65,
  MAX_IMAGE_SIZE_MB: 15,
  MAX_VIDEO_SIZE_MB: 80,
  MAX_VIDEO_DURATION_SEC: 25,
  PRICING_TIERS: [5, 10, 25, 50, 100, 250, 500],
  MIN_PRICE: 5,
  MAX_PRICE: 10000,
};
```

**Key Features**:
- ✅ Comprehensive type safety
- ✅ Built-in validation functions
- ✅ Error code enums
- ✅ Helper functions for price calculation

### 2. Media Upload Service (`app-mobile/services/paidMediaUploadService.ts`)

Handles compression, thumbnail generation, and Firebase Storage upload:

```typescript
export async function uploadPaidMedia(
  params: UploadPaidMediaParams
): Promise<UploadPaidMediaResult> {
  // 1. Compress image/video
  // 2. Generate blurred thumbnail
  // 3. Upload to Firebase Storage
  // 4. Return URLs and metadata
}
```

**Features**:
- ✅ Automatic image compression (JPEG 85%)
- ✅ Blurred thumbnail generation
- ✅ Video validation (duration, size)
- ✅ Progress tracking
- ✅ Error handling with retry logic

### 3. Paid Media Service (`app-mobile/services/paidMediaService.ts`)

Main service for sending and unlocking media:

```typescript
// Send locked media
export async function sendPaidMedia(
  params: SendPaidMediaParams,
  senderId: string
): Promise<SendPaidMediaResponse>

// Unlock media with tokens
export async function unlockPaidMedia(
  mediaId: string,
  chatId: string,
  userId: string
): Promise<UnlockPaidMediaResponse>

// Check unlock status
export async function checkUnlockStatus(
  userId: string,
  mediaId: string
): Promise<boolean>
```

**Features**:
- ✅ Price validation
- ✅ Self-unlock prevention
- ✅ Token balance check
- ✅ Real-time unlock status
- ✅ Firestore subscriptions

### 4. React Hooks (`app-mobile/hooks/usePaidMedia.ts`)

Convenient hooks for React components:

```typescript
// Main hook
const {
  sendPaidMedia,
  unlockPaidMedia,
  checkUnlockStatus,
  uploadProgress,
  isLoading,
  error,
} = usePaidMedia(chatId);

// Access status hook
const {
  isUnlocked,
  isChecking,
  checkAccess,
  mediaUrl,
} = usePaidMediaAccess(mediaId, chatId);

// Affordability check
const { canAfford, isChecking } = usePaidMediaAffordability(priceTokens);
```

### 5. UI Components

#### LockedMediaBubble (`app-mobile/app/components/LockedMediaBubble.tsx`)

Displays locked media in chat with blur effect:

```tsx
<LockedMediaBubble
  media={paidMedia}
  isUnlocked={isUnlocked}
  isSender={isSender}
  onUnlock={() => handleUnlock()}
  onView={() => handleViewMedia()}
/>
```

**Features**:
- ✅ Blurred thumbnail preview
- ✅ Lock icon overlay
- ✅ Price display
- ✅ Unlock button (for recipients)
- ✅ Video duration indicator
- ✅ Unlocked status badge

### 6. Cloud Functions (`functions/src/paidMedia.ts`)

Server-side validation and transaction processing:

```typescript
// Create paid media message
export const sendPaidMediaMessage = functions.https.onCall(...)

// Process unlock payment
export const unlockPaidMedia = functions.https.onCall(...)

// Cleanup (CRON)
export const cleanupDeletedMedia = functions.pubsub
  .schedule('0 3 * * *')
  .onRun(...)
```

**Features**:
- ✅ Token balance validation
- ✅ Atomic transactions
- ✅ Commission calculation (35/65 split)
- ✅ Prevention of self-unlocking
- ✅ Transaction audit trail
- ✅ Push notifications to creators

### 7. Firestore Security Rules (`firestore-rules/paidMedia.rules`)

Comprehensive security for all collections:

```javascript
// Users can only create regular messages
// Paid media created via Cloud Function
allow create: if isAuthenticated() && 
  isChatParticipant(chatId) &&
  request.auth.uid == request.resource.data.senderId &&
  (!request.resource.data.keys().hasAny(['payToUnlock', 'paidMediaId']) ||
   request.resource.data.payToUnlock == false);

// Only Cloud Functions can modify balances
match /balances/{userId}/wallet/{walletId} {
  allow create, update: if false;
}
```

**Security Features**:
- ✅ All financial operations through Cloud Functions
- ✅ Immutable transactions
- ✅ Chat participant verification
- ✅ No direct balance manipulation
- ✅ Protected media URLs

---

## Installation & Setup

### Prerequisites

```bash
# Required packages
npm install firebase
npm install expo-image-manipulator
npm install expo-file-system
npm install expo-av
npm install expo-blur
npm install @expo/vector-icons
```

### Firebase Setup

1. **Deploy Cloud Functions**:

```bash
cd functions
npm install
firebase deploy --only functions:paidMedia_send,functions:paidMedia_unlock
```

2. **Update Firestore Rules**:

```bash
firebase deploy --only firestore:rules
```

3. **Configure Storage CORS**:

```json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

Apply with:
```bash
gsutil cors set cors.json gs://your-bucket-name.appspot.com
```

### Mobile App Integration

1. **Copy files** to your project:
   - `types/paidMedia.ts`
   - `services/paidMediaService.ts`
   - `services/paidMediaUploadService.ts`
   - `hooks/usePaidMedia.ts`
   - `app/components/LockedMediaBubble.tsx`

2. **Update `functions/src/index.ts`**:

```typescript
import {
  sendPaidMediaMessage,
  unlockPaidMedia,
  cleanupDeletedMedia,
} from './paidMedia';

export const paidMedia_send = sendPaidMediaMessage;
export const paidMedia_unlock = unlockPaidMedia;
export const paidMedia_cleanupDeleted = cleanupDeletedMedia;
```

---

## Usage Examples

### Sending Locked Media

```typescript
import { usePaidMedia } from '../hooks/usePaidMedia';
import * as ImagePicker from 'expo-image-picker';

function ChatScreen({ chatId }: { chatId: string }) {
  const { sendPaidMedia, uploadProgress } = usePaidMedia(chatId);

  const handleSendPaidMedia = async () => {
    // 1. Pick media
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled) return;

    // 2. Send with price
    const response = await sendPaidMedia({
      recipientId: 'recipient-user-id',
      mediaType: 'image',
      priceTokens: 50,
      localUri: result.assets[0].uri,
    });

    if (response.success) {
      console.log('Media sent!', response.mediaId);
    } else {
      Alert.alert('Error', response.error);
    }
  };

  return (
    <View>
      <Button title="Send Locked Photo" onPress={handleSendPaidMedia} />
      {uploadProgress && (
        <ProgressBar progress={uploadProgress.progress} />
      )}
    </View>
  );
}
```

### Unlocking Media

```typescript
function LockedMediaMessage({ mediaId, chatId }: Props) {
  const { unlockPaidMedia, isLoading } = usePaidMedia(chatId);
  const { isUnlocked, mediaUrl } = usePaidMediaAccess(mediaId, chatId);

  const handleUnlock = async () => {
    const response = await unlockPaidMedia(mediaId);
    
    if (response.success) {
      Alert.alert('Success', 'Media unlocked!');
      // Media URL now available via mediaUrl
    } else {
      Alert.alert('Error', response.error);
    }
  };

  if (isUnlocked && mediaUrl) {
    return <Image source={{ uri: mediaUrl }} />;
  }

  return (
    <LockedMediaBubble
      media={media}
      isUnlocked={false}
      isSender={false}
      onUnlock={handleUnlock}
    />
  );
}
```

### Checking Affordability

```typescript
function UnlockButton({ priceTokens }: { priceTokens: number }) {
  const { canAfford } = usePaidMediaAffordability(priceTokens);
  const balance = useTokenBalance();

  return (
    <TouchableOpacity disabled={!canAfford}>
      <Text>
        {canAfford 
          ? `Unlock for ${priceTokens} tokens`
          : `Need ${priceTokens - balance} more tokens`
        }
      </Text>
    </TouchableOpacity>
  );
}
```

---

## API Reference

### Cloud Functions

#### `paidMedia_send`

Create a new paid media message.

**Request**:
```typescript
{
  chatId: string;
  recipientId: string;
  mediaType: 'image' | 'video';
  priceTokens: number;
  mediaUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  messageId: string;
}
```

**Response**:
```typescript
{
  success: boolean;
  mediaId?: string;
  error?: string;
  errorCode?: string;
}
```

#### `paidMedia_unlock`

Unlock paid media with token payment.

**Request**:
```typescript
{
  mediaId: string;
  chatId: string;
}
```

**Response**:
```typescript
{
  success: boolean;
  mediaUrl?: string;
  transactionId?: string;
  error?: string;
  errorCode?: string;
}
```

### Service Functions

#### `sendPaidMedia(params, senderId)`

Send locked media in chat.

**Parameters**:
- `params.chatId` - Chat ID
- `params.recipientId` - Recipient user ID
- `params.mediaType` - 'image' or 'video'
- `params.priceTokens` - Price (5-10,000)
- `params.localUri` - Local file URI
- `params.onProgress` - Progress callback (optional)
- `senderId` - Sender user ID

**Returns**: `Promise<SendPaidMediaResponse>`

#### `unlockPaidMedia(mediaId, chatId, userId)`

Unlock media by payment.

**Parameters**:
- `mediaId` - Paid media message ID
- `chatId` - Chat ID
- `userId` - Buyer user ID

**Returns**: `Promise<UnlockPaidMediaResponse>`

---

## Security Considerations

### Anti-Abuse Measures

1. **Self-Unlock Prevention**: Users cannot unlock their own media (enforced in Cloud Function)
2. **Price Immutability**: Prices cannot be changed after creation
3. **No Free Unlocks**: All unlocks require payment verification
4. **No Refunds**: Transactions are final and irreversible
5. **Rate Limiting**: Cloud Functions should implement rate limiting

### Data Privacy

1. **Participant-Only Access**: Users can only query media from chats they're in
2. **Private Unlocks**: Unlock records visible only to buyer and seller
3. **Protected URLs**: Media URLs require authentication
4. **Transaction Privacy**: Transaction history only accessible to parties involved

### Token Security

1. **Read-Only Balances**: Clients can read but not modify token balances
2. **Atomic Transactions**: All token transfers use Firestore transactions
3. **Audit Trail**: Complete transaction history in `transactions` collection
4. **Commission Enforcement**: 35/65 split calculated server-side

---

## Testing Guide

### Unit Tests

```typescript
describe('PaidMedia', () => {
  it('should validate price range', () => {
    expect(validatePrice(3)).toEqual({ valid: false });
    expect(validatePrice(50)).toEqual({ valid: true });
    expect(validatePrice(15000)).toEqual({ valid: false });
  });

  it('should calculate commission correctly', () => {
    expect(calculateCreatorEarnings(100)).toBe(65);
    expect(calculateAvaloCommission(100)).toBe(35);
  });

  it('should prevent self-unlocking', async () => {
    const response = await unlockPaidMedia(mediaId, chatId, senderId);
    expect(response.errorCode).toBe('SELF_UNLOCK');
  });
});
```

### Integration Tests

```typescript
describe('PaidMedia Flow', () => {
  it('should complete full send-unlock cycle', async () => {
    // 1. Send media
    const sendResponse = await sendPaidMedia({
      chatId: 'test-chat',
      recipientId: 'recipient-id',
      mediaType: 'image',
      priceTokens: 50,
      localUri: testImageUri,
    }, 'sender-id');
    
    expect(sendResponse.success).toBe(true);
    
    // 2. Check locked status
    const isUnlocked = await checkUnlockStatus('recipient-id', sendResponse.mediaId!);
    expect(isUnlocked).toBe(false);
    
    // 3. Unlock media
    const unlockResponse = await unlockPaidMedia(
      sendResponse.mediaId!,
      'test-chat',
      'recipient-id'
    );
    
    expect(unlockResponse.success).toBe(true);
    expect(unlockResponse.mediaUrl).toBeDefined();
    
    // 4. Verify unlocked
    const nowUnlocked = await checkUnlockStatus('recipient-id', sendResponse.mediaId!);
    expect(nowUnlocked).toBe(true);
  });
});
```

---

## Troubleshooting

### Common Issues

#### 1. **Upload Fails with "File too large"**

**Solution**: Check file size before upload
```typescript
const fileInfo = await FileSystem.getInfoAsync(uri);
if (fileInfo.size > PAID_MEDIA_CONFIG.MAX_IMAGE_SIZE_BYTES) {
  Alert.alert('File too large', 'Maximum size is 15MB');
  return;
}
```

#### 2. **"Insufficient tokens" Error**

**Solution**: Check balance before unlocking
```typescript
const balance = await getTokenBalance(userId);
if (balance < priceTokens) {
  Alert.alert('Insufficient tokens', `You need ${priceTokens - balance} more tokens`);
  return;
}
```

#### 3. **Media Not Displaying After Unlock**

**Solution**: Verify unlock status and refresh
```typescript
const { isUnlocked, checkAccess, mediaUrl } = usePaidMediaAccess(mediaId, chatId);

useEffect(() => {
  if (isUnlocked && !mediaUrl) {
    checkAccess(); // Refresh
  }
}, [isUnlocked, mediaUrl]);
```

#### 4. **Blur Effect Not Working**

**Solution**: Install expo-blur
```bash
npx expo install expo-blur
```

#### 5. **Cloud Function Timeout**

**Solution**: Increase timeout in `firebase.json`
```json
{
  "functions": {
    "timeout": "60s"
  }
}
```

---

## Performance Optimization

### Image Compression Settings

Adjust compression based on network conditions:

```typescript
const compressionQuality = networkSpeed === 'slow' ? 0.7 : 0.85;

const compressed = await compressImage(uri, {
  quality: compressionQuality,
  maxWidth: 1920,
  maxHeight: 1920,
});
```

### Caching Strategy

Cache unlocked media locally:

```typescript
const CACHE_DIR = `${FileSystem.cacheDirectory}paid-media/`;

async function cacheUnlockedMedia(mediaId: string, url: string) {
  const cachedPath = `${CACHE_DIR}${mediaId}.jpg`;
  await FileSystem.downloadAsync(url, cachedPath);
  return cachedPath;
}
```

### Batch Operations

Process multiple unlocks efficiently:

```typescript
async function batchCheckUnlockStatus(userId: string, mediaIds: string[]) {
  const unlocksQuery = query(
    collection(db, 'paid_media_unlocks'),
    where('userId', '==', userId),
    where('mediaId', 'in', mediaIds.slice(0, 10)) // Firestore limit
  );
  
  const snapshot = await getDocs(unlocksQuery);
  return snapshot.docs.map(doc => doc.data().mediaId);
}
```

---

## Analytics Events

Track key metrics:

```typescript
// Track media sent
analytics.logEvent('paid_media_sent', {
  media_type: mediaType,
  price_tokens: priceTokens,
  chat_id: chatId,
});

// Track unlock
analytics.logEvent('paid_media_unlock', {
  media_id: mediaId,
  tokens_spent: priceTokens,
  chat_id: chatId,
});

// Track earnings
analytics.logEvent('paid_media_earnings', {
  tokens_earned: creatorAmount,
  media_type: mediaType,
});
```

---

## Deployment Checklist

- [ ] Deploy Cloud Functions
- [ ] Update Firestore security rules
- [ ] Configure Storage CORS
- [ ] Set up cleanup CRON job
- [ ] Test send flow end-to-end
- [ ] Test unlock flow end-to-end
- [ ] Verify commission calculations
- [ ] Test error scenarios
- [ ] Enable analytics
- [ ] Set up monitoring/alerts
- [ ] Document internal processes
- [ ] Train support team

---

## Support & Maintenance

### Monitoring

Key metrics to track:
- Upload success rate
- Unlock conversion rate
- Average media price
- Creator earnings
- Failed transactions
- Cloud Function errors

### Logs

Critical events to log:
```typescript
console.log('[PaidMedia] Media sent:', { mediaId, senderId, priceTokens });
console.log('[PaidMedia] Unlock successful:', { mediaId, buyerId, tokensSpent });
console.error('[PaidMedia] Transaction failed:', { error, context });
```

### Maintenance Tasks

**Daily**:
- Monitor Cloud Function errors
- Check unlock success rate
- Review failed transactions

**Weekly**:
- Analyze creator earnings
- Review pricing trends
- Check storage usage

**Monthly**:
- Cleanup old media (if configured)
- Audit commission calculations
- Review and update pricing tiers

---

## Conclusion

PACK 80 provides a complete, production-ready system for monetizing chat media. All components are built with security, scalability, and user experience in mind. The 35/65 commission split ensures sustainable monetization while maximizing creator earnings.

For questions or issues, refer to the troubleshooting section or contact the development team.

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-25  
**License**: Proprietary - Avalo App