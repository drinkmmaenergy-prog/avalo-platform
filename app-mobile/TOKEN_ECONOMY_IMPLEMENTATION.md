# Avalo Token Economy Implementation Guide

## Overview

This document describes the complete implementation of the Avalo Token economy and monetized messaging system. The system enables a pay-per-message model where men pay tokens to send messages and women earn tokens from received messages, with Avalo taking a 30% fee on all transactions.

## Core Features

### 1. Token System
- **Token Balance**: Real-time token balance tracking per user
- **Message Pricing**: 10 tokens per message (configurable)
- **Free Messages**: First 3 messages between any two users are free
- **Avalo Fee**: Automatic 30% fee deduction on all transactions

### 2. Transaction Flow
1. User attempts to send message
2. System checks message count between users
3. If > 3 messages: Verify token balance
4. If insufficient: Show purchase modal
5. If sufficient: Deduct tokens, send message
6. Credit receiver (minus 30% fee)
7. Record transaction in Firestore

### 3. Token Purchase
- Four predefined token packs (50, 200, 500, 1000)
- Stripe integration ready (mock implementation provided)
- Secure payment processing
- Instant token credit after purchase

## File Structure

```
app-mobile/
├── types/
│   └── tokens.ts                    # Token type definitions
├── services/
│   ├── tokenService.ts              # Token operations & transactions
│   └── chatService.ts               # Chat operations (existing)
├── components/
│   └── TokenPurchaseModal.tsx       # Token purchase UI
└── app/
    └── chat/
        ├── [chatId].tsx             # Chat screen with token integration
        └── icebreaker-modal.tsx     # Icebreaker with token checks
```

## Database Structure

### Firestore Collections

#### `/balances/{uid}/wallet`
```typescript
{
  tokens: number,              // Current token balance
  lastUpdated: Timestamp       // Last update timestamp
}
```

#### `/transactions/{txId}`
```typescript
{
  senderUid: string,           // Message sender
  receiverUid: string,         // Message receiver
  tokensAmount: number,        // Total tokens charged
  avaloFee: number,            // Fee amount (30%)
  messageId: string,           // Related message ID
  chatId: string,              // Related chat ID
  createdAt: Timestamp,        // Transaction time
  transactionType: 'message' | 'purchase' | 'refund'
}
```

## Key Components

### 1. Token Types (`types/tokens.ts`)

Defines all token-related interfaces:
- `TokenWallet`: User's wallet structure
- `TokenTransaction`: Transaction record structure
- `TokenPack`: Token pack definition
- `MessageCostInfo`: Message pricing information
- `TOKEN_CONFIG`: Configuration constants

### 2. Token Service (`services/tokenService.ts`)

Core token operations:

#### Balance Management
- `getTokenBalance(userId)`: Get current balance
- `subscribeToTokenBalance(userId, callback)`: Real-time balance updates
- `addTokensAfterPurchase(userId, tokens)`: Add tokens after purchase

#### Message Cost Calculation
- `calculateMessageCost(chatId, senderId)`: Calculate if message should be charged
- `getMessageCountBetweenUsers(chatId, senderId)`: Count messages sent
- `hasEnoughTokens(userId, required)`: Check balance sufficiency

#### Transaction Processing
- `processMessageTransaction(...)`: Complete transaction flow
  - Deducts from sender
  - Credits receiver (minus fee)
  - Records transaction

### 3. Token Purchase Modal (`components/TokenPurchaseModal.tsx`)

Features:
- Four token pack options
- Visual indication of popular choice
- Current balance display
- Stripe-ready integration
- Processing state handling
- Success/error feedback

### 4. Chat Integration (`app/chat/[chatId].tsx`)

Integration points:
- Real-time token balance display in header
- Pre-send balance check
- Automatic transaction processing
- Purchase modal trigger on insufficient tokens
- Free message handling (first 3)

### 5. Icebreaker Integration (`app/chat/icebreaker-modal.tsx`)

Features:
- Token balance subscription
- Pre-send cost calculation
- Balance verification before sending
- Purchase modal integration
- Transaction processing for paid messages

## Configuration

### Token Economics (`types/tokens.ts`)

```typescript
export const TOKEN_CONFIG = {
  MESSAGE_COST: 10,              // Tokens per message
  AVALO_FEE_PERCENTAGE: 0.30,    // 30% platform fee
  FREE_MESSAGES_COUNT: 3,        // Free messages per conversation
} as const;
```

### Token Packs

```typescript
export const DEFAULT_TOKEN_PACKS: TokenPack[] = [
  { packId: 'starter', tokens: 50, price: 4.99 },
  { packId: 'popular', tokens: 200, price: 14.99, popular: true },
  { packId: 'value', tokens: 500, price: 29.99 },
  { packId: 'premium', tokens: 1000, price: 49.99 },
];
```

## User Experience Flow

### Sending First Message (Free)
1. User opens icebreaker modal
2. Selects message to send
3. Message sent immediately (no charge)
4. No token balance check required

### Sending 4th+ Message (Paid)
1. User types message
2. Presses send button
3. System checks: "Do they have enough tokens?"
   - **YES**: Message sent, tokens deducted, receiver credited
   - **NO**: Alert shown with "Buy Tokens" option
4. If "Buy Tokens" clicked: Purchase modal opens
5. User selects pack and completes purchase
6. Tokens added to balance
7. User can now send message

### Buying Tokens
1. Open purchase modal (from insufficient tokens alert or manually)
2. View current balance and available packs
3. Select desired pack
4. Process payment (Stripe integration)
5. Receive tokens instantly
6. Modal closes, can continue chatting

## Transaction Example

**Scenario**: Alice sends her 5th message to Bob

```
Initial State:
- Alice balance: 100 tokens
- Bob balance: 50 tokens

Transaction:
1. Check: Alice has 4 previous messages to Bob
2. Cost: 10 tokens (MESSAGE_COST)
3. Deduct: Alice balance → 90 tokens
4. Calculate: 
   - Avalo Fee: 10 × 0.30 = 3 tokens
   - Bob receives: 10 - 3 = 7 tokens
5. Credit: Bob balance → 57 tokens
6. Record transaction in Firestore

Final State:
- Alice balance: 90 tokens (-10)
- Bob balance: 57 tokens (+7)
- Avalo earned: 3 tokens
```

## Integration Points

### Adding Token Display to Any Screen

```typescript
import { subscribeToTokenBalance } from '../../services/tokenService';

// In your component
const [tokenBalance, setTokenBalance] = useState(0);

useEffect(() => {
  if (!user?.uid) return;
  
  const unsubscribe = subscribeToTokenBalance(
    user.uid,
    (balance) => setTokenBalance(balance)
  );
  
  return () => unsubscribe();
}, [user?.uid]);
```

### Checking Before Sending Message

```typescript
import {
  calculateMessageCost,
  hasEnoughTokens,
  processMessageTransaction,
} from '../../services/tokenService';

const handleSend = async () => {
  const costInfo = await calculateMessageCost(chatId, userId);
  
  if (costInfo.shouldCharge) {
    const hasTokens = await hasEnoughTokens(userId, costInfo.cost);
    
    if (!hasTokens) {
      // Show purchase modal
      setShowPurchaseModal(true);
      return;
    }
  }
  
  // Send message...
  await sendMessage(chatId, userId, text);
  
  // Process transaction if paid
  if (costInfo.shouldCharge) {
    await processMessageTransaction(
      userId,
      receiverId,
      chatId,
      messageId,
      costInfo.cost
    );
  }
};
```

## Stripe Integration (Next Steps)

The current implementation includes a mock payment processor. To integrate real Stripe payments:

### 1. Install Dependencies
```bash
npm install @stripe/stripe-react-native
```

### 2. Update `TokenPurchaseModal.tsx`

Replace the mock payment section with:

```typescript
import { useStripe } from '@stripe/stripe-react-native';

const { initPaymentSheet, presentPaymentSheet } = useStripe();

const handlePurchase = async (pack: TokenPack) => {
  // 1. Create payment intent on your backend
  const response = await fetch('YOUR_BACKEND_URL/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: pack.price * 100, // Convert to cents
      userId: userId,
      packId: pack.packId,
    }),
  });
  
  const { clientSecret, paymentIntentId } = await response.json();
  
  // 2. Initialize payment sheet
  await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: 'Avalo',
  });
  
  // 3. Present payment sheet
  const { error } = await presentPaymentSheet();
  
  if (error) {
    Alert.alert('Payment failed', error.message);
    return;
  }
  
  // 4. Add tokens to user's wallet
  await addTokensAfterPurchase(userId, pack.tokens, paymentIntentId);
  
  Alert.alert('Success!', `You received ${pack.tokens} tokens!`);
};
```

### 3. Backend Webhook

Create a Cloud Function to handle Stripe webhooks:

```typescript
// functions/src/stripe-webhook.ts
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    // Add tokens to user's wallet
    await admin.firestore()
      .collection('balances')
      .doc(paymentIntent.metadata.userId)
      .collection('wallet')
      .doc('wallet')
      .update({
        tokens: admin.firestore.FieldValue.increment(
          parseInt(paymentIntent.metadata.tokens)
        ),
      });
  }
  
  res.json({ received: true });
});
```

## Security Considerations

### Current Implementation
- ✅ Client-side balance checks
- ✅ Transaction recording
- ✅ Proper error handling

### Production Requirements
- 🔒 **Server-side validation**: Implement Cloud Functions to validate all transactions
- 🔒 **Security Rules**: Update Firestore rules to restrict wallet writes
- 🔒 **Rate limiting**: Prevent spam transactions
- 🔒 **Fraud detection**: Monitor unusual patterns

### Recommended Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Balances - read only for owners, write via Cloud Functions only
    match /balances/{userId}/wallet/{document=**} {
      allow read: if request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Transactions - read for involved users only
    match /transactions/{txId} {
      allow read: if request.auth.uid == resource.data.senderUid
                  || request.auth.uid == resource.data.receiverUid;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

## Testing Checklist

- [ ] First 3 messages are free
- [ ] 4th message requires tokens
- [ ] Insufficient tokens shows purchase modal
- [ ] Token purchase adds to balance
- [ ] Message deducts correct amount
- [ ] Receiver gets credited (minus fee)
- [ ] Transaction recorded correctly
- [ ] Balance updates in real-time
- [ ] Header shows current balance
- [ ] Multiple chats handle independently

## Monitoring

### Key Metrics to Track
- Total tokens in circulation
- Transaction volume per day
- Average tokens per user
- Purchase conversion rate
- Avalo revenue (30% fees)
- Free vs paid messages ratio

### Recommended Analytics Events
```typescript
// Log these events for analysis
analytics.logEvent('token_purchase', { pack: packId, amount: tokens });
analytics.logEvent('message_sent', { paid: boolean, cost: number });
analytics.logEvent('insufficient_tokens', { required: number, current: number });
```

## Future Enhancements

1. **Subscription Model**: Monthly plans with token allocations
2. **Token Gifting**: Users can send tokens to each other
3. **Promotional Bonuses**: First-time purchaser bonuses
4. **Dynamic Pricing**: Adjust prices based on user behavior
5. **Token Expiry**: Implement expiration dates for inactive tokens
6. **Referral Rewards**: Earn tokens for inviting friends
7. **Achievement Rewards**: Earn tokens for milestones

## Support Information

For issues or questions:
- Check Firestore console for transaction logs
- Review user's wallet balance
- Check transaction history via `getUserTransactions()`
- Verify message counts in chat subcollections

## Summary

The token economy is fully implemented with:
- ✅ Real-time balance tracking
- ✅ Automatic transaction processing
- ✅ First 3 messages free logic
- ✅ 30% Avalo fee calculation
- ✅ Purchase modal with Stripe-ready integration
- ✅ Complete transaction history
- ✅ Error handling and user feedback

All components are modular, type-safe, and ready for production deployment after adding server-side validation and real Stripe integration.