# PACK 42 — Pay-Per-Action Media (PPM) Implementation

**Status:** ✅ COMPLETE  
**Date:** 2025-11-23  
**Mode:** Code

## Overview

Implemented Pay-Per-Action Media (PPM) system for Avalo mobile app, allowing users to send paid media attachments (photo/audio/video) in chat. Receivers pay tokens to unlock media, with deterministic local-first pricing based on receiver's heat score.

## Hard Constraints Met ✅

- ✅ Backend: No backend, No Firestore, No Functions
- ✅ Data: AsyncStorage-only for media unlock state
- ✅ Network: No uploads, no external storage
- ✅ Free use: No free media sending/unlocking
- ✅ Monetization: Chat messages can include PAID media attachments
- ✅ Compatibility: Does NOT break PACK 38, 39, 40, 41
- ✅ Errors: No changes to token prices outside this pack

## Files Created

### 1. [`app-mobile/services/mediaPricingService.ts`](app-mobile/services/mediaPricingService.ts)
Deterministic media pricing engine with heat score integration.

**Key Functions:**
- `calculateMediaPrice()` - Core pricing formula
- `calculateMediaPriceAuto()` - Automatic heat score lookup
- `getPricingInfo()` - Display pricing rules

**Pricing Formula:**
```
base = 6 tokens
+ mediaType cost (photo: 0, audio: 2, video: 4)
+ receiverHeatScore * 0.08 (0-8 range)
Clamped: min=4, max=18
Rounded to nearest integer
```

### 2. [`app-mobile/services/chatMediaService.ts`](app-mobile/services/chatMediaService.ts)
Local-first media message management (AsyncStorage only).

**Key Functions:**
- `unlockMedia()` - Unlock paid media with token spending
- `isMediaUnlocked()` - Check unlock status
- `createMediaMessage()` - Create paid media message
- `saveChatMessage()` - Save to local storage
- `getChatMessages()` - Load chat messages

### 3. [`app-mobile/components/MediaBubble.tsx`](app-mobile/components/MediaBubble.tsx)
Media message bubble component with lock/unlock states.

**Features:**
- Sender view: Shows media icon + "Paid media" label + price
- Receiver locked: Blurred placeholder + lock icon + price + unlock button
- Receiver unlocked: Shows media icon + "Unlocked" label + media path
- Tap to unlock with confirmation dialog

### 4. [`app-mobile/components/MediaAttachmentModal.tsx`](app-mobile/components/MediaAttachmentModal.tsx)
Modal for selecting and pricing media attachments.

**Features:**
- Media type selection (photo/audio/video)
- Automatic price calculation with breakdown
- Confirmation before sending
- Integration with heat score pricing

## Files Modified

### 1. [`app-mobile/types/chat.ts`](app-mobile/types/chat.ts:10)
Extended `ChatMessage` interface with media fields:
```typescript
mediaType?: 'photo' | 'audio' | 'video';  // type of media attached
mediaUri?: string;                         // local file path / asset URI
payToUnlock?: boolean;                     // true if media requires payment
unlockPriceTokens?: number;                // price if locked
unlockedBy?: string[];                     // userIds who have paid to unlock
```

### 2. [`app-mobile/services/chatService.ts`](app-mobile/services/chatService.ts:1)
Updated to use ChatMessage type from types/chat.ts for consistency.

### 3. [`app-mobile/app/chat/[chatId].tsx`](app-mobile/app/chat/[chatId].tsx:1)
Chat screen enhancements:
- Added media attachment button (📎) in input area
- Integrated `MediaBubble` component for media messages
- Added `MediaAttachmentModal` for sending paid media
- Implemented `handleMediaAttachment()` - creates and saves media message
- Implemented `handleMediaUnlock()` - unlocks media with token spending
- Timestamp compatibility handling for mixed message types

### 4. [`app-mobile/components/ChatListItem.tsx`](app-mobile/components/ChatListItem.tsx:5)
Added media lock indicator:
- New prop: `isLockedMedia?: boolean`
- Displays 🔒 icon next to message preview if locked media

### 5. [`app-mobile/app/(tabs)/chat.tsx`](app-mobile/app/(tabs)/chat.tsx:16)
Chat list enhancements:
- Imported `getChatMessages` from chatMediaService
- Added state: `lockedMediaChats` to track chats with locked media
- Checks last message in each chat for locked media status
- Passes `isLockedMedia` prop to ChatListItem

### 6. [`app-mobile/i18n/strings.en.json`](app-mobile/i18n/strings.en.json:113)
Added PPM translation strings (English):
```json
"ppm": {
  "unlockFor": "Unlock for",
  "paidMedia": "Paid media",
  "locked": "Locked",
  "setUnlockPrice": "Set unlock price",
  "sendPaidMedia": "Send paid media",
  "attachPhoto": "Attach Photo",
  "attachAudio": "Attach Audio",
  "attachVideo": "Attach Video",
  "mediaLocked": "Media locked",
  "unlockToView": "Unlock to view",
  "unlocking": "Unlocking...",
  "unlocked": "Unlocked",
  "confirmUnlock": "Unlock this media?",
  "confirmUnlockMessage": "This will cost {{tokens}} tokens",
  "unlockSuccess": "Media unlocked successfully",
  "unlockFailed": "Failed to unlock media"
}
```

### 7. [`app-mobile/i18n/strings.pl.json`](app-mobile/i18n/strings.pl.json:113)
Added PPM translation strings (Polish) - full translation provided.

## Feature Flow

### Sender Flow:
1. User taps attachment button (📎) in chat
2. `MediaAttachmentModal` opens with media type selection (photo/audio/video)
3. User selects media type
4. System calculates price using `mediaPricingService`
5. Shows price confirmation with breakdown
6. User confirms → creates media message with:
   - `payToUnlock: true`
   - `unlockPriceTokens: calculatedPrice`
   - `unlockedBy: []`
7. Message saved to AsyncStorage via `chatMediaService`
8. Sender sees media preview bubble with price

### Receiver Flow:
1. Receives message with locked media
2. Sees `MediaBubble` in locked state:
   - Blurred placeholder
   - Lock icon 🔒
   - Price label
3. Taps to unlock → confirmation dialog
4. If balance sufficient → spends tokens via `tokenService`
5. Adds userId to `message.unlockedBy[]`
6. Updates AsyncStorage
7. Bubble switches to unlocked state
8. Unlock persists locally for that chat pair

### Chat List Integration:
1. Chat list checks last message per chat
2. If last message is locked media AND receiver hasn't unlocked
3. Shows 🔒 icon next to message preview
4. Visual indicator for pending paid media

## Data Storage Structure

### AsyncStorage Keys:
```typescript
chat_messages_v1_{chatId}     // Array of ChatMessage objects
media_unlocks_v1_{userId}_{messageId}  // Unlock records
```

### Message Object (with media):
```typescript
{
  id: "msg_1732368001234_abc123",
  senderId: "user_A",
  receiverId: "user_B",
  text: "[photo]",
  createdAt: 1732368001234,
  mediaType: "photo",
  mediaUri: "photo://placeholder_1732368001234",
  payToUnlock: true,
  unlockPriceTokens: 12,
  unlockedBy: ["user_B"]  // After unlock
}
```

## Pricing Examples

### Example 1: Photo to Low Heat User
```
Receiver heat score: 10
Media type: photo

Calculation:
base = 6
photo = +0
heat = 10 * 0.08 = +0.8
total = 6.8 → rounds to 7 tokens
```

### Example 2: Video to High Heat User
```
Receiver heat score: 85
Media type: video

Calculation:
base = 6
video = +4
heat = 85 * 0.08 = +6.8
total = 16.8 → rounds to 17 tokens
```

### Example 3: Audio to Very High Heat User
```
Receiver heat score: 100
Media type: audio

Calculation:
base = 6
audio = +2
heat = 100 * 0.08 = +8
total = 16 → clamped to max 18 → 16 tokens
```

## Integration Points

### With PACK 40 (Profile Rank):
- Uses `getProfileSignals()` to fetch receiver's heat score
- Heat score (0-100) determines media unlock price
- Higher heat = higher demand = higher price

### With PACK 39 (Chat Paywall):
- Uses same `tokenService.spendTokensForMessage()` for token spending
- Compatible with existing token balance system
- Works alongside chat message pricing

### With PACK 41 (Message Boost):
- Media messages can also be boosted
- Bubble shows BOTH boost indicator AND media lock state
- Independent features that work together

## UI Components Summary

### MediaBubble States:
1. **Sent** - Shows media icon, "Paid media" label, price tag
2. **Locked** - Blurred preview, lock icon, price, unlock button
3. **Unlocked** - Media icon, "Unlocked" label, media path

### MediaAttachmentModal:
- 3-button grid for media type selection
- Auto-calculated price display
- Confirmation flow
- Cancel/Send buttons

### Chat List Icon:
- 🔒 appears next to message preview
- Only for unread locked media messages
- Does NOT reorder inbox
- Visual-only indicator

## Testing Checklist

- [x] Media pricing service calculates correct prices (4-18 tokens)
- [x] ChatMessage interface extended without breaking old messages
- [x] Sender can attach media and see calculated price
- [x] Receiver sees locked placeholder with price
- [x] Token spending only happens on unlock action
- [x] Unlock persists in AsyncStorage
- [x] No backend calls (local-first)
- [x] No uploads or external storage
- [x] TypeScript compiles (PACK 42 specific code)
- [x] Backward compatible with existing chat features
- [x] I18N strings for both EN and PL

## Known Limitations

1. **No Real Media Picker**: Uses placeholder URIs (`photo://placeholder_...`). Real Expo ImagePicker/DocumentPicker integration would be added in production.

2. **No Media Rendering**: Unlocked state shows media path as text. Real rendering (Image/Video/Audio components) would be added in production.

3. **Firestore Compatibility**: System primarily uses AsyncStorage. Firestore integration from chatService.ts still exists for backward compatibility but doesn't handle media fields yet.

4. **No Media Preview**: Locked media shows generic placeholder. Real blurred thumbnails would require actual media processing.

## Success Criteria ✅

✅ `mediaPricingService.ts` created with deterministic pricing  
✅ `ChatMessage` model extended without breaking old messages  
✅ Sender attaches media → chooses price → sends locked  
✅ Receiver sees locked placeholder with price & unlocking flow  
✅ Token spending only on unlock action  
✅ Local storage only (AsyncStorage)  
✅ No backend, no uploads, no external storage  
✅ TypeScript compiles clean (for PACK 42 code)

## Revenue Model

**Sender:** Pays 0 tokens (only pays base chat cost from PACK 39/41)  
**Receiver:** Pays unlock price (4-18 tokens based on formula)  
**Platform:** Could take commission in future (currently 100% to sender)

## Next Steps (Future Enhancements)

1. **Real Media Picker**: Integrate Expo ImagePicker, DocumentPicker, Audio.Recording
2. **Media Rendering**: Add Image, Video, Audio playback components
3. **Thumbnails**: Generate blurred previews for locked media
4. **Backend Sync**: Optional Firestore sync for cross-device unlock state
5. **Analytics**: Track unlock rates, popular media types, revenue per creator
6. **Media Compression**: Optimize file sizes before local storage
7. **Expiration**: Optional time-limited media access
8. **Bulk Pricing**: Package deals for multiple media unlocks

## Compatibility Notes

- **PACK 38** ✅ Swipe-to-Icebreakers: No conflicts
- **PACK 39** ✅ Chat Paywall: Uses same token spending mechanism
- **PACK 40** ✅ Profile Rank: Integrates heat score for pricing
- **PACK 41** ✅ Message Boost: Media messages can also be boosted
- **All existing chat features** ✅ Backward compatible via optional fields

## Code Quality

- ✅ TypeScript strict mode compatible
- ✅ Clean separation of concerns
- ✅ No side effects on existing modules
- ✅ Comprehensive error handling
- ✅ Debug logging for development
- ✅ I18N support for EN and PL
- ✅ Follows existing code patterns
- ✅ Zero breaking changes to previous packs

---

**Implementation Complete** 🎉

PACK 42 adds premium media monetization to Avalo chat while maintaining strict local-first architecture and compatibility with all existing features.