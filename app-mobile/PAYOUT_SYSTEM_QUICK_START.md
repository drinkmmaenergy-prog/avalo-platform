# Avalo Payout System - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Firestore Documents

Open Firebase Console → Firestore Database and create:

#### Document 1: `/system/payoutFees`
```json
{
  "paypal": { "type": "percent", "value": 7 },
  "bank": { "type": "flat", "value": 4 },
  "revolut": { "type": "percent", "value": 5 },
  "crypto": { "type": "percent", "value": 2 }
}
```

#### Document 2: `/system/tokenPrice`
```json
{
  "eurValue": 0.05
}
```

### Step 2: Give User Test Tokens

Create document: `/balances/{userId}/wallet`
```json
{
  "tokens": 1000,
  "lastUpdated": [SERVER_TIMESTAMP]
}
```

### Step 3: Test the Payout Flow

1. Open app → Navigate to **Payout** tab
2. See your balance: **1000 tokens**
3. Enter amount: **100 tokens**
4. Select method: **PayPal**
5. See calculation:
   - Amount: €5.00
   - Fee: -€0.35
   - Final: €4.65
6. Click **"Request Withdrawal"**
7. Success! Check `/withdrawals` collection

## 📱 User Flow

```
1. User opens Payout tab
   ↓
2. Sees token balance (real-time)
   ↓
3. Enters tokens to withdraw
   ↓
4. Selects payment method
   ↓
5. Sees live calculation with fees
   ↓
6. Clicks "Request Withdrawal"
   ↓
7. Validation checks:
   - Balance sufficient? ✓
   - Final amount > 0? ✓
   ↓
8. Withdrawal request created in Firestore
   ↓
9. Success confirmation shown
```

## 💰 Fee Examples

### 1000 Tokens = €50.00

| Method | Fee | Final Amount |
|--------|-----|--------------|
| PayPal | 7% (€3.50) | €46.50 |
| Bank | €4.00 | €46.00 |
| Revolut | 5% (€2.50) | €47.50 |
| Crypto | 2% (€1.00) | **€49.00** ✨ |

## 🎯 Key Features

- ✅ Real-time balance tracking
- ✅ Live fee calculations (300ms debounce)
- ✅ 4 payout methods (PayPal, Bank, Revolut, Crypto)
- ✅ Automatic fee deduction
- ✅ Balance validation
- ✅ Orange brand color (#FF6B6B)
- ✅ Logout-safe persistence

## 📂 Files Created

```
app-mobile/
├── types/
│   └── payout.ts                    # TypeScript types
├── services/
│   └── payoutService.ts             # All payout logic
├── app/(tabs)/
│   ├── payout.tsx                   # Main screen
│   └── payout-details.tsx           # Payment details
├── contexts/
│   └── AuthContext.tsx              # Updated with payout fields
├── PAYOUT_SYSTEM_IMPLEMENTATION.md  # Full guide
└── PAYOUT_SYSTEM_QUICK_START.md     # This file
```

## 🔌 API Usage

```typescript
import { 
  calculatePayout, 
  submitWithdrawalRequest,
  validateWithdrawalAmount 
} from '../../services/payoutService';

// Calculate payout
const calculation = await calculatePayout(100, 'paypal');
// Result: { tokensRequested: 100, amountCurrency: 5, ... }

// Validate
const validation = await validateWithdrawalAmount(userId, 100);
// Result: { valid: true, currentBalance: 1000 }

// Submit
const withdrawalId = await submitWithdrawalRequest(userId, calculation);
// Result: "abc123" (withdrawal document ID)
```

## 🧪 Test Checklist

- [ ] Balance displays correctly
- [ ] Input validates against balance
- [ ] All 4 methods selectable
- [ ] Calculation updates in real-time
- [ ] Fees calculated correctly
- [ ] Button disabled when invalid
- [ ] Success alert shows withdrawal ID
- [ ] Document created in `/withdrawals`
- [ ] No console errors
- [ ] No breaking changes to other features

## ⚠️ Important Notes

1. **Firestore documents required** - Won't work without `/system/payoutFees` and `/system/tokenPrice`
2. **Client-side only** - For production, move to Cloud Functions
3. **No actual payments** - This creates withdrawal requests only
4. **Token deduction not automatic** - Must be handled by backend

## 🐛 Troubleshooting

**No balance showing?**
→ Check `/balances/{userId}/wallet` exists

**Calculation not working?**
→ Check `/system/payoutFees` and `/system/tokenPrice` exist

**Button always disabled?**
→ Check console for errors, verify balance > 0

**"Cannot find module" error?**
→ Rebuild: `cd app-mobile && npx expo start -c`

## 🚀 Production Checklist

Before deploying to production:

- [ ] Create Cloud Function for withdrawal processing
- [ ] Add Firestore security rules
- [ ] Integrate real payment APIs (PayPal, Stripe, etc)
- [ ] Add email notifications
- [ ] Implement admin dashboard for approvals
- [ ] Add rate limiting
- [ ] Set up monitoring and alerts
- [ ] Test with real transactions
- [ ] Create customer support process
- [ ] Add refund mechanism

## 📞 Support

For detailed information, see [`PAYOUT_SYSTEM_IMPLEMENTATION.md`](PAYOUT_SYSTEM_IMPLEMENTATION.md:1)

---

**Ready to test!** Just create the Firestore documents and you're good to go! 🎉