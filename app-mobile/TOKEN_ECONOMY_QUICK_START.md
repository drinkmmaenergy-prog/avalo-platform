# Token Economy - Quick Start Guide

## 🚀 Quick Implementation Guide

### Already Integrated Components
The token economy is fully integrated into:
- ✅ Chat conversation screen ([`[chatId].tsx`](app/chat/[chatId].tsx:1))
- ✅ Icebreaker modal ([`icebreaker-modal.tsx`](app/chat/icebreaker-modal.tsx:1))
- ✅ Token purchase modal ([`TokenPurchaseModal.tsx`](components/TokenPurchaseModal.tsx:1))

### Configuration

All token settings are in [`types/tokens.ts`](types/tokens.ts:37):

```typescript
export const TOKEN_CONFIG = {
  MESSAGE_COST: 10,           // Change message cost
  AVALO_FEE_PERCENTAGE: 0.30, // Change Avalo fee (30%)
  FREE_MESSAGES_COUNT: 3,     // Change free message count
};
```

### Adding Token Display to New Screens

```typescript
import { subscribeToTokenBalance } from '../services/tokenService';

function YourScreen() {
  const [tokenBalance, setTokenBalance] = useState(0);
  
  useEffect(() => {
    const unsubscribe = subscribeToTokenBalance(
      userId,
      (balance) => setTokenBalance(balance)
    );
    return () => unsubscribe();
  }, [userId]);
  
  return <Text>Balance: {tokenBalance} tokens</Text>;
}
```

### Opening Purchase Modal

```typescript
import TokenPurchaseModal from '../components/TokenPurchaseModal';

function YourScreen() {
  const [showPurchase, setShowPurchase] = useState(false);
  
  return (
    <>
      <TouchableOpacity onPress={() => setShowPurchase(true)}>
        <Text>Buy Tokens</Text>
      </TouchableOpacity>
      
      <TokenPurchaseModal
        visible={showPurchase}
        onClose={() => setShowPurchase(false)}
        userId={userId}
        currentBalance={tokenBalance}
      />
    </>
  );
}
```

## 📊 How It Works

### Free Messages (1-3)
```
User sends message 1: ✅ FREE
User sends message 2: ✅ FREE  
User sends message 3: ✅ FREE
User sends message 4: 💰 COSTS 10 TOKENS
```

### Transaction Flow
```
Sender: 100 tokens → 90 tokens (-10)
                ↓
         Avalo takes 30%
                ↓
    Receiver: 50 tokens → 57 tokens (+7)
```

### Purchase Flow
```
1. User clicks "Send" on 4th message
2. System: "Not enough tokens!"
3. Alert: "Buy Tokens" button
4. Opens Purchase Modal
5. User selects pack (50, 200, 500, or 1000)
6. Payment processed (Stripe)
7. Tokens added instantly
8. Can send message now
```

## 🔧 Testing

### Test Scenario 1: Free Messages
```typescript
1. Start new conversation
2. Send 3 messages → All FREE ✅
3. Try to send 4th → Charged 💰
```

### Test Scenario 2: Insufficient Tokens
```typescript
1. Set tokens to 5 (less than 10)
2. Try to send paid message
3. Should show "Insufficient Tokens" alert
4. Click "Buy Tokens"
5. Purchase modal opens
```

### Test Scenario 3: Purchase Tokens
```typescript
1. Open purchase modal
2. Click any pack (e.g., 50 tokens)
3. Mock payment processes
4. Alert: "Purchase Successful!"
5. Balance updates instantly
```

## 🗄️ Database Structure

### Read Balance
```typescript
import { getTokenBalance } from '../services/tokenService';

const balance = await getTokenBalance(userId);
```

### Subscribe to Balance
```typescript
import { subscribeToTokenBalance } from '../services/tokenService';

const unsubscribe = subscribeToTokenBalance(userId, (balance) => {
  console.log('Current balance:', balance);
});
```

### Get Transaction History
```typescript
import { getUserTransactions } from '../services/tokenService';

const transactions = await getUserTransactions(userId, 50);
```

## 🎨 UI Components

### Token Badge (Already in Chat Header)
```typescript
<View style={styles.tokenBadge}>
  <Text style={styles.tokenIcon}>💰</Text>
  <Text style={styles.tokenText}>{tokenBalance}</Text>
</View>
```

### Token Pack Card (In Purchase Modal)
- Shows token amount
- Displays price
- "POPULAR" badge on best value
- Buy button with loading state

## ⚙️ Service Functions

### Balance Operations
```typescript
getTokenBalance(userId)              // Get current balance
subscribeToTokenBalance(userId, cb)  // Real-time updates
hasEnoughTokens(userId, required)    // Check if sufficient
addTokensAfterPurchase(userId, amt)  // Add after purchase
```

### Message Operations
```typescript
calculateMessageCost(chatId, senderId)  // Check if message costs
getMessageCountBetweenUsers(chatId, senderId)  // Count messages
```

### Transaction Operations
```typescript
processMessageTransaction(
  senderId,
  receiverId,
  chatId,
  messageId,
  cost
)  // Complete transaction
```

## 🔐 Security Notes

**Current State**: Client-side implementation
**Production Needs**: 
- Move transaction logic to Cloud Functions
- Add server-side validation
- Implement proper Firestore rules
- Add rate limiting

## 📱 Stripe Integration

Current: Mock payment processor

To integrate real Stripe:
1. Install `@stripe/stripe-react-native`
2. Update [`TokenPurchaseModal.tsx`](components/TokenPurchaseModal.tsx:66)
3. Create backend payment intent endpoint
4. Add Stripe webhook handler

See full guide in [`TOKEN_ECONOMY_IMPLEMENTATION.md`](TOKEN_ECONOMY_IMPLEMENTATION.md:1)

## 📈 Key Metrics

Monitor in your analytics:
- `token_purchase` - When users buy tokens
- `message_sent` - Track paid vs free
- `insufficient_tokens` - Conversion opportunities

## ⚡ Performance

All operations are optimized:
- Real-time subscriptions for balance
- Batch operations for transactions
- Efficient Firestore queries
- Minimal re-renders

## 🐛 Debugging

### Check User Balance
```typescript
const balance = await getTokenBalance('USER_ID');
console.log('Balance:', balance);
```

### View Transactions
```typescript
const txs = await getUserTransactions('USER_ID');
console.log('Transactions:', txs);
```

### Test Message Cost
```typescript
const cost = await calculateMessageCost('CHAT_ID', 'SENDER_ID');
console.log('Should charge?', cost.shouldCharge);
console.log('Cost:', cost.cost);
console.log('Message #:', cost.messageNumber);
```

## 📞 Support

Issues? Check:
1. Firestore console → `balances` collection
2. Firestore console → `transactions` collection  
3. Console logs for error messages
4. User's message count in chat

## 🎯 Common Use Cases

### Add Token Display to Profile
```typescript
<View>
  <Text>Your Balance</Text>
  <Text>{tokenBalance} tokens</Text>
  <Button title="Buy More" onPress={() => setShowPurchase(true)} />
</View>
```

### Check Before Action
```typescript
const doAction = async () => {
  const cost = 50; // Action costs 50 tokens
  if (!(await hasEnoughTokens(userId, cost))) {
    Alert.alert('Need more tokens');
    setShowPurchase(true);
    return;
  }
  // Proceed with action
};
```

### Custom Transaction
```typescript
// For non-message token operations
await processMessageTransaction(
  fromUserId,
  toUserId,
  'custom_context',
  'transaction_id',
  amount
);
```

## ✅ Verification Checklist

- [ ] Can see token balance in chat header
- [ ] First 3 messages are free
- [ ] 4th message shows cost check
- [ ] Insufficient tokens triggers purchase modal
- [ ] Can select and "purchase" token pack
- [ ] Balance updates after purchase
- [ ] Can send message after getting tokens
- [ ] Sender loses tokens, receiver gains tokens
- [ ] Transactions recorded in Firestore

## 🚀 You're Ready!

The token economy is fully implemented and ready to use. The system handles:
- ✅ Automatic free message detection
- ✅ Balance checking before sends
- ✅ Purchase flow integration
- ✅ Transaction processing
- ✅ Real-time balance updates
- ✅ Error handling

Just ensure Firestore is properly initialized and start chatting! 💬