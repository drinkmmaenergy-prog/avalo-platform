# Payment System Quick Reference

## 🎯 Common Operations

### Purchase Tokens (Web/Android - Stripe)

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');

async function buyTokens(tokens: number) {
  const { data } = await createCheckout({ 
    tokens, 
    currency: 'USD' 
  });
  
  // Redirect to Stripe
  window.location.href = data.url;
}

// Call from UI
buyTokens(500); // Buy 500 tokens
```

### Purchase Tokens (iOS - Apple IAP)

```typescript
import { iosPaymentService } from '@/services/payments.ios';

async function buyTokensIOS() {
  await iosPaymentService.initialize();
  const packs = await iosPaymentService.getTokenPacks();
  
  // Purchase
  const result = await iosPaymentService.purchaseTokenPack(
    'avalo.tokens.standard.500'
  );
  
  if (result.success) {
    console.log('Tokens purchased!');
  }
}
```

### Check Wallet Balance

```typescript
const getBalance = httpsCallable(functions, 'getWalletBalance');

async function checkBalance() {
  const { data } = await getBalance();
  console.log(`Balance: ${data.balance} tokens`);
  console.log(`Earned: ${data.earnedBalance} tokens`);
}
```

### Get Transaction History

```typescript
const getHistory = httpsCallable(functions, 'getTransactionHistory');

async function viewHistory() {
  const { data } = await getHistory({ limit: 50 });
  
  data.transactions.forEach(tx => {
    console.log(`${tx.type}: ${tx.tokens} tokens - ${tx.description}`);
  });
}
```

### Start Chat with Deposit

```typescript
const startChat = httpsCallable(functions, 'initiateChat');

async function startChatWithCreator(creatorId: string) {
  const { data } = await startChat({
    recipientId: creatorId,
    initialMessage: 'Hi!',
  });
  
  // 100 tokens deducted
  // 35 tokens → platform fee (non-refundable)
  // 65 tokens → escrow (auto-refund after 48h)
  
  console.log('Chat started:', data.chatId);
}
```

### Book Calendar Slot

```typescript
const bookSlot = httpsCallable(functions, 'createCalendarBooking');

async function bookCreatorSlot(creatorId: string, slotId: string, tokens: number) {
  const startTime = Date.now() + 86400000; // Tomorrow
  const endTime = startTime + 3600000; // 1 hour later
  
  const { data } = await bookSlot({
    creatorId,
    slotId,
    startTime,
    endTime,
    tokens,
  });
  
  // Tokens deducted immediately
  // 20% → platform fee (non-refundable)
  // 80% → escrow (released after booking completion)
  
  console.log('Booking created');
}
```

### Complete Booking (Creator)

```typescript
const completeBooking = httpsCallable(functions, 'completeCalendarBooking');

async function finishBooking(bookingId: string) {
  const { data } = await completeBooking({ bookingId });
  
  // Full escrow released to creator
  console.log('Booking completed, tokens credited');
}
```

### Cancel Booking (User)

```typescript
const cancelBooking = httpsCallable(functions, 'cancelCalendarBooking');

async function cancelSlot(bookingId: string) {
  const { data } = await cancelBooking({ bookingId });
  
  console.log(`Refund: ${data.refundPercent}% (${data.refundAmount} tokens)`);
  // >24h notice: 100% refund
  // 24h-1h notice: 50% refund
  // <1h notice: 0% refund
}
```

### Request Payout (Creator)

```typescript
const requestPayoutFn = httpsCallable(functions, 'requestPayout');

async function cashOut(settlementId: string) {
  const { data } = await requestPayoutFn({
    settlementId,
    payoutMethod: 'paypal',
    payoutDestination: 'creator@example.com',
  });
  
  console.log('Payout requested:', data.payoutId);
}
```

### View Settlements (Creator)

```typescript
const getSettlements = httpsCallable(functions, 'getCreatorSettlements');

async function viewEarnings() {
  const { data } = await getSettlements({ limit: 12 });
  
  data.settlements.forEach(s => {
    console.log(`${s.periodLabel}: ${s.grossAmount} ${s.fiatCurrency}`);
  });
}
```

---

## 📊 Token Economics

### Token Packs

| Tokens | USD | EUR | PLN |
|--------|-----|-----|-----|
| 100 | $5.49 | €4.99 | 20 PLN |
| 300 | $15.99 | €14.99 | 60 PLN |
| 500 | $26.99 | €24.99 | 100 PLN |
| 1000 | $52.99 | €49.99 | 200 PLN |
| 2000 | $104.99 | €99.99 | 400 PLN |
| 5000 | $259.99 | €249.99 | 1000 PLN |

### Commission Splits

- **Chat:** 35% platform, 65% creator
- **Video:** 30% platform, 70% creator
- **Calendar:** 20% platform, 80% creator
- **Tips:** 20% platform, 80% creator

### Settlement

- **Rate:** 1 token = 0.20 PLN (fixed)
- **Frequency:** Monthly (1st of month)
- **Minimum:** 50 EUR/USD equivalent

---

## 🔐 Security Notes

- All wallet updates are atomic (Firestore transactions)
- Webhook signatures are verified before processing
- Idempotency prevents duplicate charges
- Platform fees are non-refundable
- Escrow amounts are refundable based on policy

---

## 📱 Platform Support

| Platform | Payment Method | Provider |
|----------|---------------|----------|
| iOS | Apple IAP | StoreKit 2 |
| Android | Credit Card | Stripe |
| Web | Credit Card | Stripe |

---

## 🆘 Emergency Contacts

**Critical Payment Issue:**
1. Check Firebase Console → Functions → Logs
2. Review recent webhook events
3. Contact: ops@avalo.app
4. Escalate: CTO

**User Reports Missing Tokens:**
1. Get transaction ID or session ID
2. Query Firestore: `transactions` collection
3. Check webhook processing status
4. Manually credit if confirmed payment

---

**Last Updated:** 2025-11-09  
**Version:** 1.0.0