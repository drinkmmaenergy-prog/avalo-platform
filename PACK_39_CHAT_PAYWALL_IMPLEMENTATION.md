# PACK 39: Dynamic Chat Paywall (Message-Level Pricing)

## Implementation Status

✅ **COMPLETE** - All specification requirements have been implemented.

## Overview

PACK 39 introduces dynamic, per-message pricing for chat messages based on multiple factors including heat scores, responsiveness, interest matches, and more. The system is **100% deterministic** with **no randomness** and uses **local storage only** (AsyncStorage).

## Files Created

### 1. [`app-mobile/services/chatPricingService.ts`](app-mobile/services/chatPricingService.ts:1) (269 lines)

Core pricing calculation service with:
- **Deterministic pricing formula** (2-12 tokens per message)
- **Multi-factor analysis** (6 pricing factors)
- **Local storage management** (AsyncStorage)
- **Zero backend dependencies**
- **Debug logging** (DEV mode only)

### 2. [`app-mobile/hooks/useChatPricing.ts`](app-mobile/hooks/useChatPricing.ts:1) (137 lines)

React hook for chat pricing with:
- **Real-time price calculation**
- **Automatic refresh** on context changes
- **Error handling** with fallback pricing
- **Loading states**
- **Refresh function** for manual updates

### 3. I18n Strings Added

**English** ([`app-mobile/i18n/strings.en.json`](app-mobile/i18n/strings.en.json:108)):
```json
"chatPricing": {
  "costLabel": "Cost",
  "buyMore": "Buy more tokens",
  "notEnough": "You don't have enough tokens to send this message."
}
```

**Polish** ([`app-mobile/i18n/strings.pl.json`](app-mobile/i18n/strings.pl.json:108)):
```json
"chatPricing": {
  "costLabel": "Koszt",
  "buyMore": "Kup więcej tokenów",
  "notEnough": "Nie masz wystarczającej liczby tokenów, aby wysłać tę wiadomość."
}
```

## Files Modified

### 1. [`app-mobile/services/tokenService.ts`](app-mobile/services/tokenService.ts:359)

Added helper function:
```typescript
export const spendTokensForMessage = async (userId: string, cost: number): Promise<void>
```

- Validates token cost
- Checks user balance
- Deducts tokens atomically
- Throws error if insufficient balance
- Includes debug logging

## Pricing Formula (Deterministic)

```typescript
base = 4 tokens

// ↑ Factors that INCREASE price:
+ receiverHeatScore * 1.2                    // Popular receivers cost more
+ (1 - senderResponsiveness) * 2.5          // Ghosters pay more
+ receiverResponsiveness * 1.3               // Responsive receivers cost more
+ (timeSinceLastReplyMinutes > 45 ? +2 : 0) // Ignored messages cost more
+ (receiverEarnsFromChat ? +2 : 0)          // Earning mode adds cost

// ↓ Factors that DECREASE price:
- interestMatchCount * 0.8                   // Strong matches cost less

// Final adjustments:
floor to nearest integer
min = 2 tokens
max = 12 tokens
```

### Pricing Factors Explained

| Factor | Type | Range | Influence | Notes |
|--------|------|-------|-----------|-------|
| **Base Price** | Fixed | 4 tokens | Constant | Starting point |
| **Receiver Heat Score** | Variable | 0-100 | ↑ Higher price | Popular/attractive profiles cost more |
| **Sender Responsiveness** | Variable | 0-1 | ↓ Lower price | Ghosters (low responsiveness) pay premium |
| **Receiver Responsiveness** | Variable | 0-1 | ↑ Higher price | Responsive people are valuable |
| **Time Since Last Reply** | Variable | 0-∞ min | ↑ Higher price | >45min silence = +2 tokens penalty |
| **Receiver Earns From Chat** | Boolean | true/false | ↑ Higher price | Active earning mode = +2 tokens |
| **Interest Match Count** | Variable | 0-5 | ↓ Lower price | More shared interests = cheaper |

## Integration Guide

### Step 1: Import the Hook

```typescript
import { useChatPricing } from '../hooks/useChatPricing';
import { spendTokensForMessage, getTokenBalance } from '../services/tokenService';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../hooks/useTranslation';
```

### Step 2: Use in Chat Screen

```typescript
function ChatScreen({ senderId, receiverId, chatId }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [balance, setBalance] = useState(0);
  
  // Get dynamic pricing
  const { 
    tokenCost, 
    breakdown, 
    loading, 
    refresh 
  } = useChatPricing({
    senderId,
    receiverId,
    chatId,
  });

  // Load user balance
  useEffect(() => {
    getTokenBalance(senderId).then(setBalance);
  }, [senderId]);

  // Refresh price when screen mounts
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh price when receiver sends a message
  const onReceiverMessage = useCallback(() => {
    refresh(); // Price may change after receiver responds
  }, [refresh]);

  // Handle send message
  const handleSendMessage = async (messageText: string) => {
    try {
      // Check if user has enough tokens
      if (balance < tokenCost) {
        // Show paywall modal
        showPaywallModal({
          required: tokenCost,
          current: balance,
          onPurchase: () => {
            // Navigate to token purchase screen
          },
        });
        return;
      }

      // Deduct tokens
      await spendTokensForMessage(senderId, tokenCost);

      // Send message (your existing logic)
      await sendMessageToChat(chatId, messageText);

      // Update balance
      setBalance(prev => prev - tokenCost);

      // Refresh price for next message
      await refresh();
      
    } catch (error) {
      showToast(t('errors.unknownError'), 'error');
    }
  };

  return (
    <View>
      {/* Chat messages */}
      <MessageList />
      
      {/* Message input with price preview */}
      <View style={styles.inputContainer}>
        <TextInput 
          placeholder={t('chat.typeMessage')}
          onChangeText={setMessageText}
          value={messageText}
        />
        
        {/* Price preview */}
        <View style={styles.pricePreview}>
          <Text style={styles.priceLabel}>
            📌 {t('chatPricing.costLabel')}: {tokenCost} {t('common.tokens')}
          </Text>
        </View>
        
        <Button 
          onPress={() => handleSendMessage(messageText)}
          disabled={loading}
        >
          {t('common.send')}
        </Button>
      </View>
    </View>
  );
}
```

### Step 3: Paywall Modal (If Insufficient Tokens)

```typescript
function InsufficientTokensModal({ required, current, onBuyTokens, onCancel }) {
  const { t } = useTranslation();
  
  return (
    <Modal visible={true}>
      <View style={styles.modal}>
        <Text style={styles.title}>
          {t('chatPricing.notEnough')}
        </Text>
        
        <Text style={styles.message}>
          {t('chatPricing.costLabel')}: {required} {t('common.tokens')}
        </Text>
        
        <Text style={styles.balance}>
          {t('tokens.tokenBalance')}: {current} {t('common.tokens')}
        </Text>
        
        <Button onPress={onBuyTokens}>
          {t('chatPricing.buyMore')}
        </Button>
        
        <Button onPress={onCancel} variant="secondary">
          {t('common.cancel')}
        </Button>
      </View>
    </Modal>
  );
}
```

### Step 4: Update Price on Events

```typescript
// When chat screen mounts
useEffect(() => {
  refresh();
}, []);

// When receiver sends a reply
const onMessageReceived = (message) => {
  if (message.senderId === receiverId) {
    refresh(); // Update price after receiver responds
  }
};

// When user returns from swipe
useFocusEffect(
  useCallback(() => {
    refresh(); // Refresh price when returning to chat
  }, [refresh])
);
```

## Data Management

### Local Storage Keys

All data stored in AsyncStorage:

```typescript
@avalo_heat_scores          // { userId: number (0-100) }
@avalo_responsiveness       // { userId: number (0-1) }
@avalo_interest_matches     // { userId1_userId2: number (0-5) }
@avalo_last_replies         // { chatId: timestamp }
@avalo_earns_from_chat      // { userId: boolean }
```

### Helper Functions

```typescript
// Get/Set Heat Score (0-100)
await getHeatScore(userId);
await setHeatScore(userId, 75);

// Get/Set Responsiveness (0-1)
await getResponsiveness(userId);
await setResponsiveness(userId, 0.8);

// Get/Set Interest Matches (0-5)
await getInterestMatchCount(userId1, userId2);
await setInterestMatchCount(userId1, userId2, 3);

// Get/Update Last Reply Timestamp
await getTimeSinceLastReply(chatId); // Returns minutes
await updateLastReply(chatId);

// Get/Set Earns From Chat
await getEarnsFromChat(userId);
await setEarnsFromChat(userId, true);

// Auto-update responsiveness after message
await updateResponsivenessAfterMessage(userId, responseTimeMinutes);
```

## Pricing Examples

### Example 1: Low-Cost Message
```typescript
Context:
- Receiver heat score: 30/100 (not popular)
- Sender responsiveness: 0.9 (very responsive)
- Receiver responsiveness: 0.4 (slow responder)
- Time since last reply: 10 minutes
- Receiver earns from chat: false
- Interest matches: 4/5 (strong match)

Calculation:
  4 (base)
+ 0.36 (heat: 30 * 1.2 / 100)
+ 0.25 (sender low resp: (1-0.9) * 2.5)
+ 0.52 (receiver resp: 0.4 * 1.3)
+ 0 (quick reply: <45min)
+ 0 (not earning)
- 3.2 (strong match: 4 * 0.8)
= 1.93 → floor → clamp → 2 tokens (minimum)
```

### Example 2: High-Cost Message
```typescript
Context:
- Receiver heat score: 90/100 (very popular)
- Sender responsiveness: 0.2 (ghoster)
- Receiver responsiveness: 0.9 (very responsive)
- Time since last reply: 60 minutes
- Receiver earns from chat: true
- Interest matches: 0/5 (no match)

Calculation:
  4 (base)
+ 1.08 (heat: 90 * 1.2 / 100)
+ 2.0 (sender low resp: (1-0.2) * 2.5)
+ 1.17 (receiver resp: 0.9 * 1.3)
+ 2 (long silence: >45min)
+ 2 (earning mode active)
- 0 (no matches: 0 * 0.8)
= 12.25 → floor → clamp → 12 tokens (maximum)
```

### Example 3: Mid-Range Message
```typescript
Context:
- Receiver heat score: 60/100
- Sender responsiveness: 0.6
- Receiver responsiveness: 0.7
- Time since last reply: 30 minutes
- Receiver earns from chat: true
- Interest matches: 2/5

Calculation:
  4 (base)
+ 0.72 (heat: 60 * 1.2 / 100)
+ 1.0 (sender: (1-0.6) * 2.5)
+ 0.91 (receiver: 0.7 * 1.3)
+ 0 (quick: <45min)
+ 2 (earning)
- 1.6 (matches: 2 * 0.8)
= 7.03 → floor → 7 tokens
```

## Debug Mode

In DEV mode, detailed pricing breakdown is automatically logged:

```typescript
[ChatPaywall] Pricing breakdown:
  Base price: 4 tokens
  + Receiver heat (75/100): +0.90
  + Sender low responsiveness (40%): +1.50
  + Receiver high responsiveness (80%): +1.04
  + Quick replies (25min ≤ 45min): +0
  + Receiver earns from chat: +2
  - Interest matches (3): -2.40
  = FINAL PRICE: 7 tokens
```

Debug logs auto-disable when `__DEV__ === false`.

## Revenue Split

**65/35 Split (Maintained)**:
- 65% to creator (if `receiverEarnsFromChat = true`)
- 35% to Avalo platform

**No Free Messages**:
- Minimum price: 2 tokens
- No free trials, no discounts, no promotions
- All chat messages cost tokens

## UI Integration Requirements

### Price Preview Display

The chat input UI must show the dynamic price **before** sending:

```tsx
<View style={styles.costPreview}>
  <Text style={styles.costLabel}>
    📌 {t('chatPricing.costLabel')}: {tokenCost} {t('common.tokens')}
  </Text>
</View>
```

### Price Refresh Triggers

Price must refresh when:
1. ✅ Chat screen mounts
2. ✅ Receiver sends a reply
3. ✅ User returns to chat from swipe
4. ✅ User types (real-time updates)

### Insufficient Tokens Blocking

If user tries to send with insufficient tokens:
```typescript
if (balance < tokenCost) {
  // Block sending
  showModal({
    title: t('chatPricing.notEnough'),
    buttons: [
      { label: t('chatPricing.buyMore'), onPress: navigateToPurchase },
      { label: t('common.cancel'), onPress: closeModal }
    ]
  });
  return; // Don't send message
}
```

**DO NOT ADD**:
- ❌ Daily free tokens
- ❌ Starter tokens
- ❌ Free message trials
- ❌ Cooldowns

## Usage Example (Complete)

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, Modal } from 'react-native';
import { useChatPricing } from '../hooks/useChatPricing';
import { spendTokensForMessage, getTokenBalance } from '../services/tokenService';
import { useTranslation } from '../hooks/useTranslation';
import { useToast } from '../hooks/useToast';

export function ChatScreen({ route }) {
  const { chatId, receiverId } = route.params;
  const { user } = useAuth();
  const senderId = user.uid;
  
  const { t } = useTranslation();
  const { showToast } = useToast();
  
  const [messageText, setMessageText] = useState('');
  const [balance, setBalance] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  
  // Get dynamic pricing
  const { tokenCost, loading, refresh } = useChatPricing({
    senderId,
    receiverId,
    chatId,
  });
  
  // Load and subscribe to balance
  useEffect(() => {
    getTokenBalance(senderId).then(setBalance);
  }, [senderId]);
  
  // Refresh price when screen mounts
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  // Refresh price when receiver responds
  const handleReceiverMessage = useCallback(() => {
    refresh();
  }, [refresh]);
  
  // Handle sending message
  const handleSend = async () => {
    if (!messageText.trim()) return;
    
    try {
      // Check balance
      if (balance < tokenCost) {
        setShowPaywall(true);
        return;
      }
      
      // Spend tokens
      await spendTokensForMessage(senderId, tokenCost);
      
      // Send message (your existing chat logic)
      await sendChatMessage(chatId, messageText);
      
      // Update UI
      setMessageText('');
      setBalance(prev => prev - tokenCost);
      
      // Refresh price for next message
      await refresh();
      
    } catch (error) {
      showToast(t('errors.unknownError'), 'error');
    }
  };
  
  return (
    <View style={styles.container}>
      {/* Messages list */}
      <MessageList onReceiverMessage={handleReceiverMessage} />
      
      {/* Input area with price preview */}
      <View style={styles.inputContainer}>
        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder={t('chat.typeMessage')}
          style={styles.input}
        />
        
        {/* Dynamic price display */}
        {!loading && (
          <View style={styles.pricePreview}>
            <Text style={styles.priceText}>
              📌 {t('chatPricing.costLabel')}: {tokenCost} {t('common.tokens')}
            </Text>
          </View>
        )}
        
        <Button 
          onPress={handleSend}
          disabled={loading || !messageText.trim()}
          title={t('common.send')}
        />
      </View>
      
      {/* Paywall modal */}
      {showPaywall && (
        <Modal
          visible={showPaywall}
          onRequestClose={() => setShowPaywall(false)}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {t('chatPricing.notEnough')}
            </Text>
            
            <Text style={styles.modalMessage}>
              {t('chatPricing.costLabel')}: {tokenCost} {t('common.tokens')}
            </Text>
            
            <Text style={styles.modalBalance}>
              {t('tokens.tokenBalance')}: {balance} {t('common.tokens')}
            </Text>
            
            <Button
              onPress={() => {
                setShowPaywall(false);
                navigation.navigate('TokenPurchase');
              }}
              title={t('chatPricing.buyMore')}
            />
            
            <Button
              onPress={() => setShowPaywall(false)}
              title={t('common.cancel')}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
```

## Testing Scenarios

### Scenario 1: New User (Cold Start)
```typescript
// Initial state - all defaults
Heat scores: 50/100
Responsiveness: 0.5
Interest matches: 0
Time since reply: 0 min
Earns from chat: false

Expected price: 4-6 tokens
```

### Scenario 2: Popular Creator
```typescript
// High-demand creator
Receiver heat: 95/100
Receiver responsiveness: 0.95
Receiver earns: true
Time since reply: 60 min

Expected price: 10-12 tokens (near maximum)
```

### Scenario 3: Strong Match
```typescript
// Perfect compatibility
Interest matches: 5/5
Sender responsiveness: 0.9
Receiver heat: 40/100
Time since reply: 5 min
Earns: false

Expected price: 2-3 tokens (near minimum)
```

## Configuration / Tuning

To adjust pricing sensitivity, edit constants in [`chatPricingService.ts`](app-mobile/services/chatPricingService.ts:47):

```typescript
// Current multipliers:
receiverHeatScore * 1.2        // Adjust for heat sensitivity
(1 - senderResponsiveness) * 2.5  // Adjust ghoster penalty
receiverResponsiveness * 1.3    // Adjust responsive premium
timeSinceLastReply > 45 ? +2 : 0  // Adjust silence threshold/penalty
receiverEarnsFromChat ? +2 : 0    // Adjust earning mode premium
interestMatchCount * 0.8        // Adjust match discount
```

## Hard Constraints (Verified ✅)

- ✅ **No Backend**: All logic runs locally
- ✅ **No Firestore**: Only AsyncStorage
- ✅ **No Functions**: Pure client-side
- ✅ **No API Calls**: Zero network requests
- ✅ **Local Only**: All data in AsyncStorage
- ✅ **65/35 Split**: Revenue split maintained
- ✅ **No Free Tokens**: Minimum 2 tokens always
- ✅ **No Discounts**: No promotional pricing
- ✅ **Conversion-First**: Price shown before send
- ✅ **Additive Only**: No refactoring of existing code
- ✅ **Deterministic**: No randomness in pricing

## Success Conditions

All requirements met:

- ✅ `chatPricingService.ts` implemented with full formula
- ✅ `useChatPricing.ts` hook created
- ✅ Dynamic price preview ready for chat UI
- ✅ Blocking logic for insufficient tokens
- ✅ AsyncStorage-only (no backend)
- ✅ Zero TypeScript errors
- ✅ Does NOT change monetization outside chat messages
- ✅ Does NOT touch Packs 1–38
- ✅ Debug logs only in DEV mode
- ✅ I18n strings added (EN + PL)
- ✅ `spendTokensForMessage()` helper added to tokenService

## Known Limitations / Future Enhancements

1. **Initial Data Population**: App must initialize default values for new users (heat scores, responsiveness, etc.). Consider adding initialization logic in onboarding.

2. **Data Sync**: If user switches devices, pricing data won't sync. This is acceptable per spec (local-only).

3. **Heat Score Updates**: Heat scores should be updated based on profile views, matches, etc. This logic exists in other services.

4. **Interest Matches**: Should be calculated when profiles match. Integration with existing matching logic needed.

## Maintenance Notes

- **No breaking changes**: This pack is purely additive
- **Independent module**: Can be disabled by not calling `useChatPricing`
- **Easy tuning**: All multipliers configurable in one place
- **Clear separation**: Pricing logic separate from chat logic
- **Type-safe**: Full TypeScript support

## Related Packs

- **PACK 38**: Swipe experience (not modified)
- **Existing Chat System**: Message sending flow (not modified)
- **Token System**: Balance management (extended with `spendTokensForMessage`)

## Support

For integration questions or issues:
1. Check this documentation
2. Review inline comments in [`chatPricingService.ts`](app-mobile/services/chatPricingService.ts:1)
3. Review hook implementation in [`useChatPricing.ts`](app-mobile/hooks/useChatPricing.ts:1)
4. Check debug logs in DEV mode