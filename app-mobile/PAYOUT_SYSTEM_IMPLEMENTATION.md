# Avalo Payout System - Implementation Guide

## 🎯 Overview

The payout system allows users to withdraw their earned tokens as real currency (EUR) through multiple payment methods (PayPal, Bank Transfer, Revolut, or Crypto), with automatic fee deduction and real-time calculation.

## 📦 Deliverables

### 1. Core Services
- ✅ [`services/payoutService.ts`](services/payoutService.ts:1) - Complete payout operations service
- ✅ [`services/tokenService.ts`](services/tokenService.ts:1) - Token balance management (existing)

### 2. Type Definitions
- ✅ [`types/payout.ts`](types/payout.ts:1) - Payout system types and interfaces

### 3. UI Screens
- ✅ [`app/(tabs)/payout.tsx`](app/(tabs)/payout.tsx:1) - Main payout request screen
- ✅ [`app/(tabs)/payout-details.tsx`](app/(tabs)/payout-details.tsx:1) - Payout method details management
- ✅ [`contexts/AuthContext.tsx`](contexts/AuthContext.tsx:1) - Updated with payout details

### 4. Configuration Files
- ✅ Updated [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx:1) - Added payout tab

## 🔧 Firestore Configuration

### REQUIRED: Create System Documents

You must create these documents in your Firestore database before the payout system can work:

#### 1. Payout Fees Document

**Path:** `/system/payoutFees`

**Data:**
```json
{
  "paypal": {
    "type": "percent",
    "value": 7
  },
  "bank": {
    "type": "flat",
    "value": 4
  },
  "revolut": {
    "type": "percent",
    "value": 5
  },
  "crypto": {
    "type": "percent",
    "value": 2
  }
}
```

**How to create:**
1. Open Firebase Console
2. Go to Firestore Database
3. Create collection: `system`
4. Create document with ID: `payoutFees`
5. Add the fields above

#### 2. Token Price Document

**Path:** `/system/tokenPrice`

**Data:**
```json
{
  "eurValue": 0.05
}
```

This means: **1 token = €0.05**

**How to create:**
1. In Firestore Database
2. Go to collection: `system`
3. Create document with ID: `tokenPrice`
4. Add field: `eurValue` (Number) = `0.05`

### Collections Structure

#### Withdrawals Collection

**Path:** `/withdrawals/{withdrawalId}`

**Auto-created when user requests withdrawal:**
```typescript
{
  uid: string;              // User ID
  tokensRequested: number;  // Tokens to withdraw
  amountCurrency: number;   // EUR value before fees
  method: 'paypal' | 'bank' | 'revolut' | 'crypto';
  feeAmount: number;        // Fee deducted
  finalAmount: number;      // Final EUR amount
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### User Profile Updates

**Path:** `/users/{uid}`

**Optional payout details added:**
```typescript
{
  // ... existing user fields
  payoutDetails?: {
    paypalEmail?: string;
    bankIBAN?: string;
    revolutUsername?: string;
    cryptoWallet?: string;
  }
}
```

## 💡 How It Works

### Calculation Flow

1. **Token Input:** User enters amount of tokens to withdraw
2. **Currency Conversion:** Tokens × EUR value = Base amount
3. **Fee Calculation:**
   - **Percent fee:** Base amount × (fee% / 100)
   - **Flat fee:** Fixed EUR amount
4. **Final Amount:** Base amount - Fee amount
5. **Validation:** Final amount must be > 0

### Example Calculations

#### PayPal (7% percent fee)
```
Tokens: 1000
Base: 1000 × 0.05 = €50.00
Fee: €50.00 × 0.07 = €3.50
Final: €50.00 - €3.50 = €46.50
```

#### Bank (€4 flat fee)
```
Tokens: 1000
Base: 1000 × 0.05 = €50.00
Fee: €4.00
Final: €50.00 - €4.00 = €46.00
```

#### Revolut (5% percent fee)
```
Tokens: 1000
Base: 1000 × 0.05 = €50.00
Fee: €50.00 × 0.05 = €2.50
Final: €50.00 - €2.50 = €47.50
```

#### Crypto (2% percent fee)
```
Tokens: 1000
Base: 1000 × 0.05 = €50.00
Fee: €50.00 × 0.02 = €1.00
Final: €50.00 - €1.00 = €49.00
```

## 🎨 User Interface

### Payout Screen Features

1. **Token Balance Display**
   - Real-time balance from Firestore
   - Auto-updates via subscription

2. **Token Input Field**
   - Number keyboard
   - Validation against balance
   - Error messages for insufficient balance

3. **Payment Method Selection**
   - 4 method buttons (PayPal, Bank, Revolut, Crypto)
   - Shows fee structure
   - Visual feedback for selection

4. **Live Calculation Card**
   - Amount in EUR
   - Fee deduction
   - Final amount you'll receive
   - Updates in real-time (300ms debounce)

5. **Request Button**
   - Disabled when invalid
   - Loading state during submission
   - Success confirmation

### Payout Details Screen

Users can pre-configure their payment details:
- PayPal email
- Bank IBAN
- Revolut username
- Crypto wallet address

## 🔌 API Reference

### Payout Service

```typescript
// Fetch configured fees
const fees = await fetchPayoutFees();

// Get token EUR value
const price = await fetchTokenPrice();

// Calculate payout
const calculation = await calculatePayout(
  tokensRequested: number,
  method: PayoutMethod
);

// Validate withdrawal
const validation = await validateWithdrawalAmount(
  uid: string,
  tokensRequested: number
);

// Submit request
const withdrawalId = await submitWithdrawalRequest(
  uid: string,
  calculation: PayoutCalculation
);

// Subscribe to user's withdrawals
const unsubscribe = subscribeToUserWithdrawals(
  uid: string,
  onUpdate: (withdrawals: WithdrawalRequest[]) => void
);

// Get withdrawal history
const withdrawals = await getUserWithdrawals(
  uid: string,
  limit?: number
);

// Check if payout details complete
const isComplete = isPayoutDetailComplete(
  method: PayoutMethod,
  payoutDetails?: PayoutDetails
);
```

## 🛡️ Security & Validation

### Client-Side Validation
- ✅ Token balance check
- ✅ Final amount > 0
- ✅ Input sanitization
- ✅ Method validation

### Server-Side (Future Enhancement)
- [ ] Cloud Function for withdrawal processing
- [ ] Double-check balance before deduction
- [ ] Transaction atomicity
- [ ] Rate limiting
- [ ] Fraud detection

### Current Limitations
⚠️ **Client-side only** - For production, move to Cloud Functions:
1. Validate balance server-side
2. Deduct tokens atomically
3. Process actual payment
4. Update withdrawal status
5. Handle failures/refunds

## 📊 Database Schema

### System Configuration
```
/system
  /payoutFees (document)
    - paypal: { type: "percent", value: 7 }
    - bank: { type: "flat", value: 4 }
    - revolut: { type: "percent", value: 5 }
    - crypto: { type: "percent", value: 2 }
  
  /tokenPrice (document)
    - eurValue: 0.05
```

### User Data
```
/users/{uid}
  - email: string
  - age: number
  - profileComplete: boolean
  - payoutDetails: {
      paypalEmail?: string
      bankIBAN?: string
      revolutUsername?: string
      cryptoWallet?: string
    }
```

### Token Balances
```
/balances/{uid}
  /wallet (subcollection)
    - tokens: number
    - lastUpdated: Timestamp
```

### Withdrawal Requests
```
/withdrawals/{withdrawalId}
  - uid: string
  - tokensRequested: number
  - amountCurrency: number
  - method: 'paypal' | 'bank' | 'revolut' | 'crypto'
  - feeAmount: number
  - finalAmount: number
  - status: 'pending' | 'processing' | 'completed' | 'rejected'
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

## 🧪 Testing Guide

### 1. Setup Firestore Documents
```javascript
// Create in Firebase Console or use Admin SDK
await admin.firestore().collection('system').doc('payoutFees').set({
  paypal: { type: 'percent', value: 7 },
  bank: { type: 'flat', value: 4 },
  revolut: { type: 'percent', value: 5 },
  crypto: { type: 'percent', value: 2 }
});

await admin.firestore().collection('system').doc('tokenPrice').set({
  eurValue: 0.05
});
```

### 2. Give User Test Tokens
```javascript
await admin.firestore()
  .collection('balances')
  .doc(userId)
  .collection('wallet')
  .doc('wallet')
  .set({
    tokens: 1000,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
```

### 3. Test Scenarios

#### Test 1: Successful Withdrawal
1. Open Payout tab
2. See balance: 1000 tokens
3. Enter: 100 tokens
4. Select: PayPal
5. See calculation:
   - Amount: €5.00
   - Fee: -€0.35
   - Final: €4.65
6. Click "Request Withdrawal"
7. Verify: Success alert with withdrawal ID

#### Test 2: Insufficient Balance
1. Enter: 2000 tokens (more than balance)
2. See error: "Insufficient balance"
3. Button disabled

#### Test 3: Too Low Amount
1. Enter: 10 tokens with Bank (€4 flat fee)
2. Calculate: €0.50 - €4.00 = -€3.50
3. Final amount becomes: €0.00
4. Button disabled (final amount must be > 0)

#### Test 4: Method Comparison
1. Enter: 200 tokens
2. Switch between methods
3. See different fee calculations:
   - PayPal: €10 → €9.30 (7%)
   - Bank: €10 → €6.00 (€4)
   - Revolut: €10 → €9.50 (5%)
   - Crypto: €10 → €9.80 (2%)

#### Test 5: Payout Details
1. Go to Payout Details screen
2. Fill PayPal email
3. Save
4. Verify saved in Firestore

### 4. Verify in Firestore

Check withdrawal was created:
```
/withdrawals/{some-id}
  uid: "user123"
  tokensRequested: 100
  amountCurrency: 5.00
  method: "paypal"
  feeAmount: 0.35
  finalAmount: 4.65
  status: "pending"
  createdAt: [Timestamp]
  updatedAt: [Timestamp]
```

## 🚀 Production Deployment

### Before Launch

1. **Move Logic to Cloud Functions**
   ```typescript
   // functions/src/withdrawals.ts
   export const processWithdrawal = functions.firestore
     .document('withdrawals/{withdrawalId}')
     .onCreate(async (snap, context) => {
       // Validate balance
       // Deduct tokens
       // Process payment
       // Update status
     });
   ```

2. **Add Firestore Security Rules**
   ```javascript
   match /withdrawals/{withdrawalId} {
     allow create: if request.auth != null 
       && request.resource.data.uid == request.auth.uid;
     allow read: if request.auth != null 
       && resource.data.uid == request.auth.uid;
   }
   
   match /system/{document} {
     allow read: if request.auth != null;
     allow write: if false; // Admin only
   }
   ```

3. **Configure Payment Processors**
   - PayPal API integration
   - Bank transfer API (Stripe, Wire)
   - Revolut Business API
   - Crypto wallet integration

4. **Add Monitoring**
   - Track withdrawal success rate
   - Monitor failed transactions
   - Alert on suspicious activity
   - Log all operations

5. **User Notifications**
   - Email on request submitted
   - Email on processing
   - Email on completion
   - Email on rejection

## 💰 Economics

### Fee Structure
- **PayPal:** 7% (covers PayPal fees + margin)
- **Bank:** €4 flat (covers transfer costs)
- **Revolut:** 5% (lower fees)
- **Crypto:** 2% (lowest fees, highest speed)

### Token Value
- **1 token = €0.05**
- Adjustable via Firestore
- Consider market rates when setting

### Minimum Withdrawals
Recommended minimums to avoid loss:
- PayPal: 100 tokens (€5.00 → €4.65)
- Bank: 100 tokens (€5.00 → €1.00) ⚠️
- Revolut: 50 tokens (€2.50 → €2.38)
- Crypto: 50 tokens (€2.50 → €2.45)

## 🔍 Troubleshooting

### Issue: No balance showing
**Solution:** Check user has wallet document:
```javascript
/balances/{uid}/wallet/wallet
```

### Issue: Calculation not updating
**Solution:** Check Firestore documents exist:
- `/system/payoutFees`
- `/system/tokenPrice`

### Issue: "Cannot find module" errors
**Solution:** Ensure all imports use correct paths:
```typescript
import { PayoutMethod } from '../../types/payout';
```

### Issue: Button always disabled
**Solution:** Check:
1. Token balance loaded
2. Input is valid number
3. Final amount > 0
4. No calculation errors in console

## 📝 Code Quality

### TypeScript Strict Mode
- ✅ All types defined
- ✅ No `any` types used
- ✅ Proper null checks
- ✅ Interface consistency

### Best Practices
- ✅ Real-time subscriptions for live data
- ✅ Debounced calculations (300ms)
- ✅ Loading states
- ✅ Error handling
- ✅ User feedback (alerts)
- ✅ Logout-safe persistence

## 🎓 Key Features

### Real-Time Calculations
- Updates as user types (debounced)
- Switches method = instant recalculation
- Shows breakdown: base, fee, final

### Balance Protection
- Can't withdraw more than balance
- Real-time balance updates
- Subscription keeps UI in sync

### Flexible Fees
- Percent-based (PayPal, Revolut, Crypto)
- Flat-fee (Bank)
- Configurable via Firestore
- No code changes to adjust

### User Experience
- ✅ Orange brand color (#FF6B6B)
- ✅ Clear breakdown of fees
- ✅ Instant validation
- ✅ Success confirmations
- ✅ No breaking changes to existing features

## 📋 Checklist

- [x] Types defined (`types/payout.ts`)
- [x] Service created (`services/payoutService.ts`)
- [x] Payout screen (`app/(tabs)/payout.tsx`)
- [x] Details screen (`app/(tabs)/payout-details.tsx`)
- [x] AuthContext updated with payout details
- [x] Tab added to layout
- [x] Real-time calculations working
- [x] Balance integration
- [x] TypeScript strict mode compliance
- [ ] Firestore documents created (manual step)
- [ ] Cloud Functions for processing (production)
- [ ] Payment API integrations (production)
- [ ] Security rules deployed (production)

## 🔗 Related Files

- Token economy: [`TOKEN_ECONOMY_SUMMARY.md`](TOKEN_ECONOMY_SUMMARY.md:1)
- Token service: [`services/tokenService.ts`](services/tokenService.ts:1)
- Auth context: [`contexts/AuthContext.tsx`](contexts/AuthContext.tsx:1)

---

**Status:** ✅ Ready for testing with Firestore configuration
**Version:** 1.0.0
**Last Updated:** 2025-11-18