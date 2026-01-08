# ✅ PACK 341 — Wallet UI (Mobile + Web) Implementation

**Status**: ✅ MOBILE COMPLETE | 🟡 WEB PENDING  
**Backend**: ✅ PACK 277 Complete and Integrated  
**Date**: 2025-12-13

---

## 📋 Overview

PACK 341 adds the visual layer to the fully functional wallet backend from PACK 277. It doesn't change tokenomics, only displays and handles existing logic through clean, user-friendly interfaces.

---

## ✅ Implementation Summary

### Mobile Implementation (React Native)

#### 1. Core Wallet Screens

##### 1.1 Wallet Home (`/wallet`)
**File**: [`app-mobile/app/wallet/index.tsx`](app-mobile/app/wallet/index.tsx)

**Features**:
- ✅ Current token balance display
- ✅ Approx payout value (tokens × 0.20 PLN) 
- ✅ Quick action buttons:
  - Buy Tokens
  - Transaction History
  - Request Payout
  - **NEW**: Subscription (links to subscription panel)
  - Info
- ✅ Lifetime statistics (purchased, spent, earned)
- ✅ Live updates via `pack277_getBalance`
- ✅ Important notices and disclaimers

**Backend Integration**:
```typescript
const getBalance = httpsCallable(functions, 'pack277_getBalance');
const result = await getBalance();
```

---

##### 1.2 Token Store (`/wallet/store`)
**File**: [`app-mobile/app/wallet/store.tsx`](app-mobile/app/wallet/store.tsx)

**FINAL Token Packs (PACK 341 Spec)**:

| Pack     | Tokens  | Price PLN | Best Value |
|----------|---------|-----------|------------|
| Mini     | 100     | 31.99     | -          |
| Basic    | 300     | 85.99     | -          |
| Standard | 500     | 134.99    | -          |
| Premium  | 1,000   | 244.99    | -          |
| Pro      | 2,000   | 469.99    | -          |
| Elite    | 5,000   | 1,125.99  | -          |
| Royal    | 10,000  | 2,149.99  | ⭐ YES     |

**Features**:
- ✅ Display all 7 token packs
- ✅ "Best Value" badge on Royal pack
- ✅ Local currency conversion display
- ✅ Payout value preview (tokens × 0.20 PLN)
- ✅ Per-1000-token price calculation
- ✅ Buy flow ready for:
  - Web → Stripe integration
  - iOS → App Store IAP
  - Android → Google Play IAP

**Backend Integration**:
```typescript
// Web
const purchaseTokens = httpsCallable(functions, 'pack277_purchaseTokensWeb');

// iOS/Android  
const verifyReceipt = httpsCallable(functions, 'pack277_verifyIAPReceipt');
```

---

##### 1.3 Transaction History (`/wallet/history`)
**File**: [`app-mobile/app/wallet/transactions.tsx`](app-mobile/app/wallet/transactions.tsx)

**Features**:
- ✅ Complete transaction list with:
  - Date & time
  - Transaction type (PURCHASE, SPEND, EARN, REFUND, PAYOUT)
  - Token amount (+/-)
  - PLN equivalent
  - Status (success/failed/reversed/refunded)
- ✅ Filter by type (All, Purchases, Spent, Earned, Refunds, Payouts)
- ✅ Pull-to-refresh
- ✅ Empty state messaging
- ✅ Color-coded transaction types

**Backend Integration**:
```typescript
const getHistory = httpsCallable(functions, 'pack277_getTransactionHistory');
const result = await getHistory({ limit: 50, type: filter });
```

---

##### 1.4 Payout Request (`/wallet/payout`)
**File**: [`app-mobile/app/wallet/payout.tsx`](app-mobile/app/wallet/payout.tsx)

**Features**:
- ✅ Available balance display
- ✅ KYC status check
- ✅ Minimum payout: 1,000 tokens
- ✅ Fixed rate: 1 token = 0.20 PLN
- ✅ Payout amount input with quick select buttons (1000, 2500, 5000)
- ✅ Real-time PLN conversion preview
- ✅ Payout method selection:
  - Stripe Connect
  - Bank Transfer
- ✅ Comprehensive payout rules display
- ✅ KYC gate enforcement

**UI Enforcement**:
```typescript
// Blocks payout if:
- tokens < 1000
- !kycVerified
- balance < requested amount
```

**Backend Integration**:
```typescript
const requestPayout = httpsCallable(functions, 'pack277_requestPayout');
await requestPayout({
  amountTokens: tokens,
  payoutMethod: 'stripe_connect' | 'bank_transfer',
  payoutDetails: {...}
});
```

---

##### 1.5 **NEW**: Subscription Access Panel (`/wallet/subscription`)
**File**: [`app-mobile/app/wallet/subscription.tsx`](app-mobile/app/wallet/subscription.tsx)

**Subscription Tiers**:

| Tier  | Price           | Benefits |
|-------|-----------------|----------|
| FREE  | Free            | - Standard rates<br>- Basic features |
| VIP   | 19.99 PLN/month | - **-30% on voice/video**<br>- Priority support<br>- VIP badge<br>- Special chat features<br>- VIP events access |
| ROYAL | 49.99 PLN/month | - **-50% on voice/video**<br>- **Better chat conversion (7 words)**<br>- Priority matching<br>- Royal badge<br>- Royal Club access<br>- Premium support<br>- All VIP events<br>- Early feature access |

**Features**:
- ✅ Current tier display
- ✅ All benefits listed per tier
- ✅ Upgrade/downgrade buttons
- ✅ Cancel subscription option
- ✅ Platform-specific payment redirect:
  - Mobile → App Store / Play Store subscriptions
  - Web → Stripe subscriptions
- ✅ Auto-renewal information
- ✅ 18+ compliance notice

**Benefits Applied**:
The UI displays benefits, but actual discount application happens in the monetization systems:
- Chat: Uses 7-word conversion for Royal tier
- Voice/Video: Applies -30% (VIP) or -50% (ROYAL) discounts

---

#### 2. Safety & Compliance UI

##### 2.1 Wallet Compliance Gate Component
**File**: [`app-mobile/app/components/WalletComplianceGate.tsx`](app-mobile/app/components/WalletComplianceGate.tsx)

**Components**:

1. **`WalletComplianceGate`** - Full-screen gate blocking access
   - Age verification gate (18+ requirement)
   - KYC verification gate (payout requirement)
   - Action buttons to start verification
   - Legal compliance messaging

2. **`ComplianceWarningBanner`** - In-screen warning banners
   - Payment blocked warnings
   - Payout blocked warnings
   - KYC pending status

**Usage Example**:
```tsx
// Block wallet access without age verification
{!ageVerified && (
  <WalletComplianceGate
    type="age"
    isVerified={false}
    onVerify={() => router.push('/verification/age')}
  />
)}

// Block payouts without KYC
{!kycVerified && (
  <ComplianceWarningBanner
    type="payout_blocked"
    onAction={() => router.push('/wallet/kyc-form')}
    actionLabel="Complete KYC"
  />
)}
```

**Compliance Rules**:
- ✅ Wallet access blocked if `ageVerified = false`
- ✅ Payouts blocked if `kycVerified = false`
- ✅ Clear messaging about legal requirements
- ✅ Easy navigation to verification flows

---

##### 2.2 Refund Transparency Component
**File**: [`app-mobile/app/components/RefundTransparency.tsx`](app-mobile/app/components/RefundTransparency.tsx)

**Components**:

1. **`RefundInfoCard`** - Detailed refund display
   - Refunded token amount
   - Refund reason
   - Refund date
   - Non-refundable platform fees clearly labeled
   - Warning: "Avalo fee is non-refundable"

2. **`RefundPolicyBanner`** - Policy reminders
   - Context-specific policies (purchase/payout/general)
   - Legal disclaimers
   - Terms of service references

3. **`TransactionRefundStatus`** - Status badges
   - Success, Failed, Reversed, Refunded statuses
   - Color-coded indicators
   - Reason display for reversals

**Usage Example**:
```tsx
// Show refund details
<RefundInfoCard
  refundedTokens={500}
  refundReason="Payment Processing Error"
  refundDate="2025-12-12"
  nonRefundableFee={50}
/>

// Show policy on purchase screen
<RefundPolicyBanner context="purchase" />

// Show transaction status
<TransactionRefundStatus
  status="refunded"
  amount={500}
  reason="Technical error"
/>
```

---

#### 3. Multi-Currency Display

All wallet screens display:
- **Primary**: Token amounts
- **Secondary**: PLN equivalent (at 0.20 PLN/token payout rate)

**Conversion Display**:
```tsx
const getFiatEquivalent = (tokens: number) => {
  const pln = tokens * 0.20;
  return pln.toFixed(2);
};

// Display: "1,000 tokens ≈ 200.00 PLN"
```

**Important**: While UI shows multi-currency info, **backend conversion always uses 0.20 PLN per token** for payouts (PACK 277 spec).

---

#### 4. Error States

Implemented comprehensive error handling for:

- ✅ **Payment Failed**
  - Clear error messages
  - Retry options
  - Support contact info

- ✅ **IAP Verification Failed**
  - Platform-specific error handling
  - Receipt validation errors
  - User guidance

- ✅ **Insufficient Tokens**
  - Balance checking before actions
  - Clear messaging
  - Quick link to token store

- ✅ **Payout Blocked**
  - KYC requirement messaging
  - Legal hold explanations
  - Compliance violation notices

- ✅ **Network Errors**
  - Retry mechanisms
  - Offline state handling
  - User-friendly error messages

---

## 🔧 Technical Implementation

### Tech Stack

**Mobile (React Native)**:
- Expo Router for navigation
- Firebase Functions for backend
- React Native components
- TypeScript
- Shared theme system

**Styling**:
- Centralized theme: [`shared/theme`](shared/theme)
- Consistent spacing, colors, fonts
- Responsive design patterns
- Accessibility-friendly

---

## 📁 File Structure

```
app-mobile/
├── app/
│   ├── wallet/
│   │   ├── index.tsx              ← Wallet Home
│   │   ├── store.tsx              ← Token Store (UPDATED)
│   │   ├── transactions.tsx       ← Transaction History
│   │   ├── payout.tsx             ← Payout Request
│   │   ├── subscription.tsx       ← NEW: Subscription Panel
│   │   ├── kyc-form.tsx          ← KYC verification form
│   │   ├── kyc-status.tsx        ← KYC status check
│   │   └── info.tsx              ← Wallet info/help
│   │
│   └── components/
│       ├── WalletComplianceGate.tsx    ← NEW: Age/KYC gates
│       ├── RefundTransparency.tsx      ← NEW: Refund UI
│       ├── AppHeader.tsx
│       └── BottomNavigation.tsx
│
└── lib/
    └── firebase.ts                ← Firebase config

shared/
└── theme.ts                       ← Design system
```

---

## 🔌 Backend Integration (PACK 277)

### Available Functions

All wallet UI screens integrate with these PACK 277 backend functions:

```typescript
// Balance
pack277_getBalance()
→ Returns: { tokensBalance, lifetimePurchased, lifetimeSpent, lifetimeEarned }

// Token Packs
pack277_getTokenPacks()  
→ Returns: Array of token pack definitions

// Purchase (Web)
pack277_purchaseTokensWeb({ packId, paymentMethodId })
→ Returns: { success, newBalance, transactionId }

// Purchase (Mobile IAP)
pack277_verifyIAPReceipt({ platform, receipt, packId })
→ Returns: { success, newBalance, transactionId }

// Transaction History
pack277_getTransactionHistory({ limit, type })
→ Returns: Array of transactions

// Request Payout
pack277_requestPayout({ amountTokens, payoutMethod, payoutDetails })
→ Returns: { success, payoutRequestId, expectedDate }
```

---

## 🚦 Usage & Navigation

### User Flows

#### 1. Buy Tokens Flow
```
Wallet Home → Token Store → Select Pack → 
Platform-specific payment → Confirmation → 
Balance Updated → Transaction History
```

#### 2. Request Payout Flow
```
Wallet Home → Payout Request → 
Check KYC (gate if not verified) → 
Enter amount → Select method → 
Confirm → Request submitted → 
Payout Requests list
```

#### 3. Subscription Upgrade Flow
```
Wallet Home → Subscription → 
View tiers → Select tier → 
Platform payment (App Store/Play/Stripe) → 
Confirmation → Benefits active
```

#### 4. View History Flow
```
Wallet Home → Transaction History → 
Filter (optional) → View details → 
Refund status (if applicable)
```

---

## ⚠️ Important Implementation Notes

### 1. Compliance Requirements

**Must implement**:
- Age verification check: Block wallet if `user.ageVerified !== true`
- KYC verification check: Block payouts if `user.kycVerified !== true`
- Clear legal disclaimers on all screens
- Refund policy transparency

### 2. Token Pack Pricing

**Fixed packs per PACK 341 spec** (see table above).  
Do NOT dynamically change these without backend coordination.

### 3. Payout Rate

**Always 0.20 PLN per token** for payouts.  
Purchase prices are higher (platform margin), but payout rate is fixed.

### 4. Platform-Specific Payments

**Mobile**:
- iOS: App Store In-App Purchases
- Android: Google Play Billing

**Web**:
- Stripe Checkout

Each platform requires specific integration code (IAP verification, Stripe webhooks, etc.).

### 5. Subscriptions

**Mobile**: Managed by app stores (auto-renewable subscriptions)  
**Web**: Managed by Stripe Subscriptions  

Benefits apply across all platforms once subscription is active.

---

## 🔐 Security & Validation

### UI-Side Validation

All screens perform client-side validation:
- ✅ Minimum amounts (1000 tokens for payout)
- ✅ Balance checks before transactions
- ✅ KYC status checks
- ✅ Age verification checks
- ✅ Input sanitization
- ✅ Rate limiting on action buttons

### Backend Validation

**Backend (PACK 277) performs**:
- Server-side validation of all amounts
- Receipt verification for IAP
- KYC document verification
- Fraud detection
- Transaction integrity checks
- Payout eligibility verification

**Never rely on UI validation alone** - backend always has final say.

---

## 🧪 Testing Checklist

### Mobile Testing

- [ ] Test wallet home loads and displays correct balance
- [ ] Test all 7 token packs display correctly
- [ ] Test "Best Value" badge shows on Royal pack only
- [ ] Test transaction history loads and filters work
- [ ] Test payout request with insufficient tokens (should block)
- [ ] Test payout request without KYC (should block)
- [ ] Test subscription tier display and upgrade flow
- [ ] Test age verification gate blocks wallet
- [ ] Test KYC gate blocks payouts
- [ ] Test refund info displays correctly
- [ ] Test all error states (network, insufficient balance, etc.)
- [ ] Test navigation between all wallet screens
- [ ] Test pull-to-refresh on transaction history
- [ ] Test quick action buttons navigate correctly

### Platform-Specific Testing

- [ ] iOS: Test App Store IAP purchase flow
- [ ] Android: Test Google Play purchase flow
- [ ] iOS: Test App Store subscription flow
- [ ] Android: Test Google Play subscription flow

---

## 📊 Performance Considerations

- Balance loaded once on mount, refresh button for updates
- Transaction history paginated (50 per load)
- Token packs loaded from static constant (fast)
- Subscription status cached locally (refresh on mount)
- Images/icons optimized for mobile
- Smooth animations for transitions
- Lazy loading for transaction details

---

## 🎨 Design System

All components use shared theme:

```typescript
import { colors, spacing, fontSizes, fontWeights } from '../../../shared/theme';
```

**Colors**:
- Primary: `colors.primary` (accent color)
- Background: `colors.background`
- Text: `colors.textPrimary`, `colors.textSecondary`
- Success: `#4CAF50`
- Error: `#F44336`
- Warning: `#FF9800`
- Info: `#2196F3`

**Spacing**: Consistent spacing scale (xs, sm, md, lg, xl, xxl, xxxl)  
**Typography**: Consistent font sizes and weights

---

## 🚀 Deployment Notes

### Mobile

**iOS**:
1. Configure IAP products in App Store Connect
2. Add product IDs to app config
3. Test with sandbox accounts
4. Submit for review with wallet features

**Android**:
1. Configure products in Google Play Console
2. Add product IDs to app config
3. Test with test accounts
4. Submit for review

### Web (When Implemented)

1. Configure Stripe products
2. Set up Stripe webhooks
3. Configure subscription plans
4. Test with Stripe test mode
5. Deploy to production

---

## 🔮 Future Enhancements (Not in PACK 341)

### Web Wallet UI

PACK 341 focused on mobile. Web wallet screens can follow same structure:

```
app-web/
├── app/
│   └── wallet/
│       ├── page.tsx              ← Wallet Home
│       ├── store/page.tsx        ← Token Store
│       ├── history/page.tsx      ← Transactions
│       ├── payout/page.tsx       ← Payout Request
│       └── subscription/page.tsx ← Subscription
```

### Shared UI Package

When web is implemented, extract common components:

```
packages/
└── ui-wallet/
    ├── components/
    │   ├── BalanceCard.tsx
    │   ├── TokenPackCard.tsx
    │   ├── TransactionList.tsx
    │   ├── PayoutForm.tsx
    │   └── SubscriptionTiers.tsx
    │
    └── types/
        ├── wallet.ts
        ├── tokens.ts
        └── subscriptions.ts
```

---

## ✅ Status Summary

| Feature | Mobile | Web | Backend |
|---------|--------|-----|---------|
| Wallet Home | ✅ | 🟡 | ✅ |
| Token Store | ✅ | 🟡 | ✅ |
| Transaction History | ✅ | 🟡 | ✅ |
| Payout Request | ✅ | 🟡 | ✅ |
| Subscription Panel | ✅ | 🟡 | ✅ |
| Compliance Gates | ✅ | 🟡 | ✅ |
| Refund Transparency | ✅ | 🟡 | ✅ |
| Error States | ✅ | 🟡 | ✅ |

✅ Complete | 🟡 Pending | ❌ Not Started

---

## 📞 Support & Integration

### Backend API (PACK 277)
All wallet backend functions are ready and tested. See PACK 277 documentation for:
- Function signatures
- Request/response formats
- Error codes
- Rate limits

### Payment Integrations
- **Stripe**: Pre-configured in PACK 277
- **IAP**: Receipt verification ready
- **Subscriptions**: Backend subscription management ready

### Compliance Systems
- **Age Verification**: UI gates ready, backend verification required
- **KYC**: UI gates ready, backend KYC provider integration required

---

## 🎯 Key Achievements

✅ **Complete Mobile Wallet UI** - All 5 core screens implemented  
✅ **FINAL Token Packs** - 7 packs with correct pricing per PACK 341 spec  
✅ **Subscription UI** - Full subscription panel with tier management  
✅ **Compliance Gates** - Age and KYC verification UI blocks  
✅ **Refund Transparency** - Complete refund information display  
✅ **Error Handling** - Comprehensive error states  
✅ **Backend Integration** - All PACK 277 functions integrated  

---

## 📝 Next Steps

1. **Test on Physical Devices**
   - Test all flows on iOS and Android
   - Verify IAP purchases
   - Test subscription flows

2. **Implement Web Version** (Optional)
   - Mirror mobile screens for web
   - Add Stripe Checkout integration
   - Create responsive layouts

3. **Create Shared Package** (Optional)
   - Extract common components
   - TypeScript types package
   - Shared utilities

4. **Connect Compliance Systems**
   - Integrate age verification provider
   - Integrate KYC provider (e.g., Stripe Identity)
   - Test compliance flows end-to-end

5. **Production Testing**
   - Load test with high transaction volume
   - Security audit
   - Accessibility audit
   - Performance optimization

---

## 📄 Related Documentation

- **PACK 277**: Backend wallet system documentation
- **PACK 288**: Mobile token store (original implementation)
- **PACK 321**: Wallet screens (base implementation)
- **Stripe Integration**: Payment processing docs
- **IAP Integration**: App Store and Play Store docs

---

**Implementation Complete**: ✅ Mobile Wallet UI  
**Implementation Date**: December 13, 2025  
**Next Phase**: Web Wallet UI (Optional)
