# PACK 79 — In-Chat Paid Gifts Integration Guide
## Quick Start & Implementation Steps

---

## Prerequisites

### 1. Install Required Dependencies

```bash
cd app-mobile

# Install animation and UI libraries
npx expo install lottie-react-native expo-av
npm install @gorhom/bottom-sheet
npm install uuid
npm install --save-dev @types/uuid

# Install Firebase packages (if not already installed)
npm install firebase @react-native-firebase/app
```

### 2. Deploy Firebase Functions

```bash
cd functions

# Install dependencies
npm install uuid
npm install --save-dev @types/uuid

# Deploy gift functions
firebase deploy --only functions:sendGift,functions:onGiftTransactionCreate
```

### 3. Update Firestore Security Rules

Merge the contents of `firestore-rules/gifts.rules` into your main Firestore security rules file, then deploy:

```bash
firebase deploy --only firestore:rules
```

---

## Integration into Chat Screen

### Step 1: Import Required Components & Hooks

```typescript
// In your chat screen file (e.g., app/chat/[chatId].tsx)
import { useRef, useState } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { GiftButton } from '../components/GiftButton';
import { GiftCatalog } from '../components/GiftCatalog';
import { GiftAnimation } from '../components/GiftAnimation';
import { GiftMessage, GiftEarningsToast } from '../components/GiftMessage';
import { useGiftHistory } from '../../hooks/useGiftHistory';
import { useAuth } from '../../hooks/useAuth'; // Your auth hook
```

### Step 2: Add State Management

```typescript
export default function ChatScreen() {
  const { user } = useAuth();
  const giftCatalogRef = useRef<BottomSheetModal>(null);
  
  // Gift animation state
  const [showGiftAnimation, setShowGiftAnimation] = useState(false);
  const [currentAnimationGift, setCurrentAnimationGift] = useState<GiftMessageMetadata | null>(null);
  
  // Earnings toast state
  const [showEarningsToast, setShowEarningsToast] = useState(false);
  const [earningsData, setEarningsData] = useState({ tokens: 0, giftName: '' });
  
  // Fetch gift history for this chat
  const { gifts: giftHistory } = useGiftHistory(chatId);
  
  // ... rest of your chat logic
}
```

### Step 3: Add Gift Button to Chat Input

```typescript
// In your message input component
<View style={styles.inputContainer}>
  {/* Your existing input field */}
  <TextInput
    value={messageText}
    onChangeText={setMessageText}
    placeholder="Type a message..."
    style={styles.input}
  />
  
  {/* Add Gift Button */}
  <GiftButton
    onPress={() => giftCatalogRef.current?.present()}
    giftsSentCount={giftHistory.length}
  />
  
  {/* Your existing send button */}
  <TouchableOpacity onPress={sendMessage}>
    <Ionicons name="send" size={24} color="#EC4899" />
  </TouchableOpacity>
</View>
```

### Step 4: Add Gift Catalog Bottom Sheet

```typescript
// Add this at the root level of your chat screen
<GiftCatalog
  ref={giftCatalogRef}
  receiverId={otherUserId}
  chatId={chatId}
  senderId={user.id}
  userTokens={user.tokens || 0}
  onGiftSent={handleGiftSent}
  onBuyTokens={handleBuyTokens}
/>
```

### Step 5: Handle Gift Messages in Chat

```typescript
// In your message rendering function
const renderMessage = (message: ChatMessage) => {
  // Check if message is a gift
  if (message.type === 'gift' && message.giftMetadata) {
    return (
      <GiftMessage
        giftMetadata={message.giftMetadata}
        senderName={message.senderName || 'User'}
        isCurrentUser={message.senderId === user.id}
        onReplay={() => handleReplayGift(message.giftMetadata!)}
        timestamp={message.createdAt}
      />
    );
  }
  
  // Your existing message rendering
  return <TextMessage {...message} />;
};
```

### Step 6: Add Gift Animation Overlay

```typescript
// Add this at the root level of your chat screen
{showGiftAnimation && currentAnimationGift && (
  <GiftAnimation
    giftMetadata={currentAnimationGift}
    userId={user.id}
    viewerRole={currentAnimationGift.senderId === user.id ? 'sender' : 'receiver'}
    onComplete={() => {
      setShowGiftAnimation(false);
      setCurrentAnimationGift(null);
    }}
    visible={showGiftAnimation}
  />
)}
```

### Step 7: Add Earnings Toast

```typescript
// Add this at the root level of your chat screen
{showEarningsToast && (
  <GiftEarningsToast
    tokensEarned={earningsData.tokens}
    giftName={earningsData.giftName}
    onDismiss={() => setShowEarningsToast(false)}
  />
)}
```

### Step 8: Implement Event Handlers

```typescript
// Handle gift sent
const handleGiftSent = (transactionId: string) => {
  console.log('Gift sent:', transactionId);
  // Optionally show success feedback
  // Catalog will auto-close
};

// Handle buy tokens
const handleBuyTokens = () => {
  giftCatalogRef.current?.dismiss();
  router.push('/tokens/buy');
};

// Handle gift replay
const handleReplayGift = (giftMetadata: GiftMessageMetadata) => {
  setCurrentAnimationGift(giftMetadata);
  setShowGiftAnimation(true);
};

// Listen for incoming gifts (via push notification or real-time listener)
useEffect(() => {
  const unsubscribe = listenForNewGifts(chatId, (gift) => {
    if (gift.receiverId === user.id) {
      // Show animation
      setCurrentAnimationGift(gift.giftMetadata);
      setShowGiftAnimation(true);
      
      // Show earnings toast after animation
      setTimeout(() => {
        setEarningsData({
          tokens: gift.receiverEarnings,
          giftName: gift.giftMetadata.giftName,
        });
        setShowEarningsToast(true);
        
        // Auto-hide toast after 3 seconds
        setTimeout(() => setShowEarningsToast(false), 3000);
      }, 2000);
    }
  });
  
  return unsubscribe;
}, [chatId, user.id]);
```

---

## Complete Example Chat Screen

```typescript
import React, { useRef, useState, useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GiftButton } from '../components/GiftButton';
import { GiftCatalog } from '../components/GiftCatalog';
import { GiftAnimation } from '../components/GiftAnimation';
import { GiftMessage, GiftEarningsToast } from '../components/GiftMessage';
import { useGiftHistory } from '../../hooks/useGiftHistory';
import { useAuth } from '../../hooks/useAuth';
import { GiftMessageMetadata } from '../../types/gifts';

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const giftCatalogRef = useRef<BottomSheetModal>(null);
  
  // Gift state
  const [showGiftAnimation, setShowGiftAnimation] = useState(false);
  const [currentAnimationGift, setCurrentAnimationGift] = useState<GiftMessageMetadata | null>(null);
  const [showEarningsToast, setShowEarningsToast] = useState(false);
  const [earningsData, setEarningsData] = useState({ tokens: 0, giftName: '' });
  
  // Fetch chat messages and gift history
  const { gifts: giftHistory } = useGiftHistory(chatId as string);
  
  const handleGiftSent = (transactionId: string) => {
    console.log('Gift sent:', transactionId);
  };
  
  const handleBuyTokens = () => {
    giftCatalogRef.current?.dismiss();
    router.push('/tokens/buy');
  };
  
  const handleReplayGift = (giftMetadata: GiftMessageMetadata) => {
    setCurrentAnimationGift(giftMetadata);
    setShowGiftAnimation(true);
  };
  
  return (
    <View style={styles.container}>
      {/* Messages List */}
      <FlatList
        data={messages}
        renderItem={({ item }) => {
          if (item.type === 'gift' && item.giftMetadata) {
            return (
              <GiftMessage
                giftMetadata={item.giftMetadata}
                senderName={item.senderName}
                isCurrentUser={item.senderId === user.id}
                onReplay={() => handleReplayGift(item.giftMetadata!)}
                timestamp={item.createdAt}
              />
            );
          }
          
          return <TextMessage {...item} />;
        }}
        keyExtractor={(item) => item.id}
      />
      
      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <TextInput style={styles.input} />
        
        <GiftButton
          onPress={() => giftCatalogRef.current?.present()}
          giftsSentCount={giftHistory.length}
        />
        
        <TouchableOpacity onPress={sendMessage}>
          <Ionicons name="send" size={24} />
        </TouchableOpacity>
      </View>
      
      {/* Gift Catalog */}
      <GiftCatalog
        ref={giftCatalogRef}
        receiverId={otherUserId}
        chatId={chatId as string}
        senderId={user.id}
        userTokens={user.tokens || 0}
        onGiftSent={handleGiftSent}
        onBuyTokens={handleBuyTokens}
      />
      
      {/* Gift Animation */}
      {showGiftAnimation && currentAnimationGift && (
        <GiftAnimation
          giftMetadata={currentAnimationGift}
          userId={user.id}
          viewerRole={currentAnimationGift.senderId === user.id ? 'sender' : 'receiver'}
          onComplete={() => {
            setShowGiftAnimation(false);
            setCurrentAnimationGift(null);
          }}
          visible={showGiftAnimation}
        />
      )}
      
      {/* Earnings Toast */}
      {showEarningsToast && (
        <GiftEarningsToast
          tokensEarned={earningsData.tokens}
          giftName={earningsData.giftName}
          onDismiss={() => setShowEarningsToast(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
});
```

---

## Testing Checklist

### Manual Testing Steps

1. **Gift Catalog Display**
   - [ ] Tap gift button in chat input
   - [ ] Verify gift catalog opens as bottom sheet
   - [ ] Verify all active gifts are displayed
   - [ ] Verify gifts show correct prices and images

2. **Gift Selection**
   - [ ] Select a gift you can afford
   - [ ] Verify confirmation dialog appears
   - [ ] Verify receiver earnings amount is correct (65% of price)
   - [ ] Confirm sending

3. **Gift Transaction**
   - [ ] Verify tokens deducted from sender
   - [ ] Verify gift message appears in chat
   - [ ] Verify gift animation plays full-screen
   - [ ] Verify receiver sees earnings toast

4. **Insufficient Balance**
   - [ ] Select a gift you cannot afford
   - [ ] Verify "Buy Tokens" prompt appears
   - [ ] Verify navigation to token purchase screen

5. **Gift Replay**
   - [ ] Tap on a gift message in chat
   - [ ] Verify animation replays

6. **Edge Cases**
   - [ ] Verify cannot send gift to yourself
   - [ ] Verify rate limiting (try sending >10 gifts in 1 minute)
   - [ ] Verify gift remains in chat after blocking user
   - [ ] Verify gift cannot be deleted

---

## Firebase Console Setup

### Create Initial Gift Catalog

Navigate to Firestore in Firebase Console and create sample gifts:

```javascript
// Collection: gift_catalog

// Document 1: rose
{
  id: "rose",
  name: "Red Rose",
  priceTokens: 10,
  animationUrl: "https://your-cdn.com/animations/rose.json",
  imageUrl: "https://your-cdn.com/images/rose.png",
  soundUrl: "https://your-cdn.com/sounds/rose.mp3",
  isActive: true,
  category: "flowers",
  rarity: "common",
  createdAt: Timestamp.now(),
  sortOrder: 1
}

// Document 2: diamond_crown
{
  id: "diamond_crown",
  name: "Diamond Crown",
  priceTokens: 100,
  animationUrl: "https://your-cdn.com/animations/crown.json",
  imageUrl: "https://your-cdn.com/images/crown.png",
  soundUrl: "https://your-cdn.com/sounds/crown.mp3",
  isActive: true,
  category: "crowns",
  rarity: "legendary",
  createdAt: Timestamp.now(),
  sortOrder: 2
}
```

---

## Push Notification Setup

Ensure your push notification handler processes gift notifications:

```typescript
// In your notification handler
if (notification.data.type === 'gift_received') {
  const { giftTransactionId, senderId, tokensEarned, giftName } = notification.data;
  
  // Navigate to chat and trigger animation
  router.push({
    pathname: `/chat/${notification.data.chatId}`,
    params: {
      showGift: giftTransactionId,
    },
  });
}
```

---

## Analytics Dashboard

Query gift analytics in Firestore Console:

```javascript
// Collection: analytics/gifts/events
// View by eventType: gift_send, gift_preview, gift_animation_viewed

// Example aggregation query for total revenue
db.collection('platform').doc('revenue')
  .get()
  .then(doc => {
    console.log('Total gift revenue:', doc.data().gifts.totalCommission);
  });
```

---

## Troubleshooting

### Issue: Gifts not appearing
- Check Firestore rules are deployed
- Verify `isActive: true` in gift_catalog
- Check user authentication

### Issue: Token balance not updating
- Verify Firebase Function deployed correctly
- Check Cloud Function logs in Firebase Console
- Ensure transaction completes without errors

### Issue: Animation not playing
- Verify Lottie file URL is accessible
- Check Lottie JSON format is valid
- Ensure lottie-react-native is installed

### Issue: TypeScript errors
- Run `npm install` to ensure all dependencies installed
- Check package versions match requirements
- Clear TypeScript cache: `rm -rf node_modules/.cache`

---

## Production Deployment

1. **Test thoroughly in development**
2. **Deploy Firebase Functions**: `firebase deploy --only functions`
3. **Deploy Firestore Rules**: `firebase deploy --only firestore:rules`
4. **Build mobile app**: `eas build --platform all`
5. **Monitor Firebase Console** for errors
6. **Set up analytics tracking** for gift conversions
7. **Monitor revenue** in platform/revenue document

---

## Support & Maintenance

- Monitor Cloud Function execution times
- Track gift transaction success rates
- Analyze most popular gifts for catalog optimization
- Update gift catalog seasonally
- Monitor token balance integrity

---

**Implementation Complete!** 🎉

All files created with zero placeholders. The gift system is ready for integration into your Avalo chat screens.