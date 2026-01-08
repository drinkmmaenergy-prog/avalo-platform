# PACK 83 — Creator Payout Requests & Compliance Layer

## Implementation Complete ✅

This document provides complete implementation details for the manual payout request system for Avalo creators.

---

## 📋 Overview

PACK 83 introduces a **manual payout request system** enabling creators to withdraw their accumulated earnings to external payment rails (bank accounts, Wise, Stripe Connect). All payout requests are subject to manual review by Avalo before processing.

**Key Features:**
- ✅ Multiple payout method management (Bank Transfer, Wise, Stripe Connect)
- ✅ Payout request creation with immediate token locking
- ✅ Manual admin review workflow with status tracking
- ✅ Automatic refunds for rejected requests
- ✅ No automatic withdrawals - full Avalo control
- ✅ Complete compliance and audit trail

---

## 🎯 Non-Negotiable Economic Rules

### Fixed Rules (Cannot Be Changed)

1. **Token price per unit remains fixed** - Config-driven, not user-changeable
2. **Revenue split: 65% creator / 35% Avalo** - Inherited from PACK 81
3. **No bonuses, no free tokens, no discounts, no promo codes, no cashback**
4. **Tokens deducted on request are locked permanently** - Only refunded if rejected
5. **No refunds on PAID payouts** - Completed payouts are final
6. **Minimum payout threshold** - Currently 5,000 tokens (configurable by admins)

### Payout Configuration

Located in [`functions/src/config/payouts.config.ts`](functions/src/config/payouts.config.ts:1-39):

```typescript
export const PAYOUT_CONFIG = {
  MIN_PAYOUT_TOKENS: 5000,                    // Minimum withdrawable amount
  PAYOUT_TOKEN_TO_EUR_RATE: 0.20,            // 1 token = €0.20 (fixed)
  SUPPORTED_PAYOUT_METHODS: ['BANK_TRANSFER', 'WISE', 'STRIPE_CONNECT'],
  MAX_PAYOUT_METHODS_PER_USER: 5,
  SUPPORTED_CURRENCIES: ['EUR', 'USD', 'GBP', 'PLN'],
} as const;
```

---

## 🗄️ Data Model

### Firestore Collections

#### 1. `payout_methods` (Per User)

```typescript
{
  id: string;                    // UUID
  userId: string;                // Owner
  type: PayoutMethodType;        // "BANK_TRANSFER" | "WISE" | "STRIPE_CONNECT"
  displayName: string;           // e.g., "My EUR bank account"
  currency: PayoutCurrency;      // e.g., "EUR"
  details: PayoutMethodDetails;  // Method-specific fields (see below)
  isDefault: boolean;            // True if primary method
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Payout Method Details by Type:**

- **BANK_TRANSFER**: `iban`, `accountHolderName`, `bankName`, `country`, `bic?`
- **WISE**: `wiseProfileId`, `email`, `recipientId?`
- **STRIPE_CONNECT**: `stripeAccountId`, `email?`

#### 2. `payout_requests` (Payout History)

```typescript
{
  id: string;
  userId: string;
  methodId: string;              // Reference to payout_methods
  status: PayoutStatus;          // "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID"
  requestedTokens: number;       // Tokens to withdraw
  requestedFiat: number;         // Computed at request time
  currency: PayoutCurrency;
  tokenToFiatRate: number;       // Rate at time of request (audit trail)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewerId?: string;           // Admin who reviewed
  rejectionReason?: string;      // Human-readable reason if rejected
  notes?: string;                // Internal admin notes
  metadata?: {
    balanceBeforeRequest: number;
    balanceAfterRequest: number;
  };
}
```

#### 3. `creator_balances` (from PACK 81)

```typescript
{
  userId: string;
  availableTokens: number;       // Withdrawable balance
  lifetimeEarned: number;        // Total earned (cumulative)
  updatedAt: Timestamp;
}
```

### Status Transition Rules

```
PENDING → UNDER_REVIEW → APPROVED → PAID
                      ↓
                   REJECTED
```

**Allowed Transitions:**
- `PENDING` → `UNDER_REVIEW`
- `UNDER_REVIEW` → `APPROVED` or `REJECTED`
- `APPROVED` → `PAID`
- `REJECTED` and `PAID` are terminal states

---

## 🔧 Backend Implementation

### Cloud Functions

All functions are in [`functions/src/payoutRequests.ts`](functions/src/payoutRequests.ts:1-572) and exported in [`functions/src/index.ts`](functions/src/index.ts:2317-2365).

#### 1. Payout Method Management

**`payout_createOrUpdateMethod_callable`**
- Create or update payout methods
- Validates method type and currency
- Enforces max 5 methods per user
- Handles default method selection

**`payout_getMethods_callable`**
- Get all payout methods for authenticated user
- Returns masked sensitive details

**`payout_deleteMethod_callable`**
- Delete payout method
- Blocks deletion if used in pending requests

#### 2. Payout Request Management

**`payout_createRequest_callable`**
- Creates payout request
- **Atomically locks tokens** in transaction:
  1. Validates sufficient balance
  2. Creates payout request with status `PENDING`
  3. Decrements `availableTokens` by requested amount
- All operations are atomic to prevent race conditions

**`payout_getRequests_callable`**
- Get payout requests with pagination
- Supports filtering and sorting
- Returns total count for UI

**`payout_setStatus_callable`** (Admin Only)
- Update payout request status
- Handles refunds for `REJECTED` status:
  - Returns locked tokens to `availableTokens`
  - Updates request with rejection reason
- Validates status transitions
- Records reviewer ID and timestamp

#### 3. Configuration

**`payout_getConfig_callable`**
- Returns read-only payout configuration
- Public endpoint (no auth required)
- Returns min payout, token rate, supported methods/currencies

---

## 📱 Mobile Implementation

### Services

**Location:** [`app-mobile/services/payoutService.ts`](app-mobile/services/payoutService.ts:1-231)

```typescript
// Configuration
getPayoutConfig(): Promise<PayoutConfig>

// Payout Methods
getPayoutMethods(userId: string): Promise<PayoutMethod[]>
createPayoutMethod(userId: string, payload: PayoutMethodFormData): Promise<string>
updatePayoutMethod(userId: string, methodId: string, updates: Partial<PayoutMethodFormData>): Promise<string>
deletePayoutMethod(methodId: string): Promise<void>

// Payout Requests
createPayoutRequest(userId: string, methodId: string, requestedTokens: number): Promise<string>
getPayoutRequests(userId: string, limit?: number, pageToken?: string): Promise<GetPayoutRequestsResponse>

// Utilities
calculateFiatAmount(tokens: number): Promise<number>
canRequestPayout(availableTokens: number, requestedTokens: number, minPayoutTokens: number): { canRequest: boolean; reason?: string }
validatePayoutMethodData(data: PayoutMethodFormData): { isValid: boolean; errors: Record<string, string> }
```

### React Hooks

**Location:** [`app-mobile/hooks/usePayouts.ts`](app-mobile/hooks/usePayouts.ts:1-247)

```typescript
// Configuration Hook
usePayoutConfig() → { config, isLoading, error }

// Payout Methods Hook
usePayoutMethods(userId) → {
  methods, isLoading, error, refresh,
  createMethod, updateMethod, deleteMethod, getDefaultMethod
}

// Payout Requests Hook
usePayoutRequests(userId) → {
  requests, total, hasMore, isLoading, isLoadingMore, error,
  refresh, loadMore, createRequest,
  getPendingRequests, getTotalPendingTokens
}

// Combined Hook (All-in-One)
usePayoutSystem(userId) → {
  config, methods, requests, all methods from above hooks,
  canRequestPayout, calculateFiatAmount
}
```

### UI Screens

#### 1. Payout Methods Screen

**Location:** [`app-mobile/app/wallet/payout-methods.tsx`](app-mobile/app/wallet/payout-methods.tsx:1-428)

**Features:**
- List all payout methods with masked details
- Set default payout method
- Edit/delete methods
- Enforces max 5 methods per user
- Prevents deletion of methods with pending requests

#### 2. Create Payout Request Screen

**Location:** [`app-mobile/app/wallet/create-payout-request.tsx`](app-mobile/app/wallet/create-payout-request.tsx:1-494)

**Features:**
- Shows current available balance
- Select payout method
- Enter token amount with "MAX" button
- Real-time fiat conversion
- Validates minimum payout and sufficient balance
- Confirmation modal with clear warnings
- Important notices about review process

#### 3. Payout Requests History Screen

**Location:** [`app-mobile/app/wallet/payout-requests.tsx`](app-mobile/app/wallet/payout-requests.tsx:1-545)

**Features:**
- List all payout requests with status
- Visual status timeline
- Shows rejection reasons
- Pagination with "Load More"
- Pull-to-refresh
- Status-based color coding
- CTA to create new requests

### TypeScript Types

**Backend Types:** [`functions/src/types/payouts.types.ts`](functions/src/types/payouts.types.ts:1-146)
**Mobile Types:** [`app-mobile/types/payouts.ts`](app-mobile/types/payouts.ts:1-197)

---

## 🔒 Security Rules

**Location:** [`firestore-rules/payouts.rules`](firestore-rules/payouts.rules:1-95)

### Critical Security Points

1. **Payout Methods:**
   - Users can only read/write their own methods
   - Validation on creation (type, currency, required fields)
   - Only specific fields can be updated

2. **Payout Requests:**
   - Users can only read their own requests
   - **NO direct client creation** - must use Cloud Function
   - **NO direct updates** - status changes via Cloud Function only
   - **NO deletion** - permanent compliance records

3. **Creator Balances:**
   - Read-only for all clients
   - All modifications via Cloud Functions only
   - Prevents direct balance manipulation

4. **Payout Config:**
   - Public read access
   - Admin-only writes

---

## 🔗 Integration with PACK 81

PACK 83 builds directly on PACK 81's earnings infrastructure:

**From PACK 81:**
- `creator_balances.availableTokens` - Source of withdrawable funds
- `earnings_ledger` - Audit trail of all earnings
- 65/35 revenue split - Maintained across all monetization

**PACK 83 Additions:**
- Payout methods management
- Payout request workflow
- Manual review and compliance layer
- Token locking mechanism

---

## 🚀 Deployment Steps

### 1. Deploy Backend Functions

```bash
cd functions

# Deploy payout functions
firebase deploy --only \
  functions:payout_createOrUpdateMethod_callable,\
  functions:payout_getMethods_callable,\
  functions:payout_deleteMethod_callable,\
  functions:payout_createRequest_callable,\
  functions:payout_setStatus_callable,\
  functions:payout_getRequests_callable,\
  functions:payout_getConfig_callable

# Verify
firebase functions:log
```

### 2. Update Firestore Rules

```bash
# Merge payouts.rules into your main firestore.rules file
firebase deploy --only firestore:rules
```

### 3. Create Firestore Indexes

Required composite indexes:

```
Collection: payout_methods
- userId (ASC) + createdAt (DESC)

Collection: payout_requests
- userId (ASC) + createdAt (DESC)
- userId (ASC) + status (ASC) + createdAt (DESC)
```

Create in Firebase Console → Firestore → Indexes

### 4. Test Integration

```bash
# Test payout config endpoint (public)
curl https://your-region-project-id.cloudfunctions.net/payout_getConfig_callable

# Test with authentication (requires Firebase Auth token)
# Use mobile app or Postman with Firebase Auth
```

---

## 🧪 Testing Checklist

### Backend Testing

- [ ] Create payout method (all 3 types)
- [ ] Update payout method
- [ ] Delete payout method
- [ ] Set default payout method
- [ ] Enforce max 5 methods per user
- [ ] Create payout request with sufficient balance
- [ ] Reject payout request (verify token refund)
- [ ] Transaction atomicity (token locking)
- [ ] Status transition validation
- [ ] Pagination works correctly
- [ ] Security rules enforce ownership

### Mobile Testing

- [ ] List payout methods
- [ ] Create/edit/delete payout methods
- [ ] View available balance
- [ ] Create payout request
- [ ] View payout history
- [ ] Status timeline displays correctly
- [ ] Rejection reasons show properly
- [ ] Pull-to-refresh works
- [ ] Pagination loads more requests
- [ ] Validation errors display
- [ ] Loading states work
- [ ] Error handling works

### Edge Cases

- [ ] Creating request with insufficient balance
- [ ] Creating request below minimum threshold
- [ ] Deleting method with pending requests
- [ ] Multiple status transitions in quick succession
- [ ] Race conditions on token locking
- [ ] Deleted user with pending payouts

---

## ⚠️ Known Limitations

1. **No Auto-Withdrawal**: All payouts require manual review
2. **No Real Money Transfers**: Backend logic only - no actual payment processing yet
3. **Admin Console Not Included**: Admin UI for reviewing requests to be built separately
4. **Single Currency Per Method**: Each method supports only one currency
5. **No Batch Operations**: Process requests one at a time

---

## 📊 Future Enhancements (Not in PACK 83)

### Phase 2: Payment Processing Integration
- Real bank transfer integration
- Wise API integration
- Stripe Connect payouts
- Webhook handling for payment confirmations

### Phase 3: Admin Console
- Review queue for pending requests
- Bulk approval/rejection
- KYC verification integration
- Risk scoring integration

### Phase 4: Advanced Features
- Scheduled payouts
- Auto-payout for trusted creators
- Multi-currency support per method
- Payout fee calculation
- Tax reporting (1099 forms)

---

## 🆘 Troubleshooting

### Issue: Payout Request Failed

**Check:**
1. Sufficient `availableTokens` in `creator_balances`
2. Request meets `MIN_PAYOUT_TOKENS` threshold
3. Valid payout method exists
4. Cloud Function deployed successfully
5. Check function logs for errors

### Issue: Tokens Not Refunded After Rejection

**Check:**
1. Verify status transition was `UNDER_REVIEW → REJECTED`
2. Check function logs for transaction errors
3. Verify `creator_balances.availableTokens` increased
4. Check for race conditions in logs

### Issue: Cannot Delete Payout Method

**Check:**
1. No pending/under-review requests using this method
2. User owns the method
3. Security rules deployed correctly

---

## 📚 API Reference Summary

### Public Endpoints (No Auth Required)

- `payout_getConfig_callable()` - Get payout configuration

### Authenticated User Endpoints

- `payout_createOrUpdateMethod_callable(payload)` - Manage payout methods
- `payout_getMethods_callable(userId)` - List user's methods
- `payout_deleteMethod_callable(methodId)` - Delete method
- `payout_createRequest_callable(userId, methodId, tokens)` - Request payout
- `payout_getRequests_callable(userId, limit, pageToken)` - List requests

### Admin Endpoints (Backend Only)

- `payout_setStatus_callable(requestId, newStatus, reviewerId, reason, notes)` - Update request status

---

## ✅ Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Backend Config | ✅ Complete | `functions/src/config/payouts.config.ts` |
| Backend Types | ✅ Complete | `functions/src/types/payouts.types.ts` |
| Backend Functions | ✅ Complete | `functions/src/payoutRequests.ts` |
| Functions Export | ✅ Complete | `functions/src/index.ts` |
| Mobile Types | ✅ Complete | `app-mobile/types/payouts.ts` |
| Mobile Service | ✅ Complete | `app-mobile/services/payoutService.ts` |
| Mobile Hooks | ✅ Complete | `app-mobile/hooks/usePayouts.ts` |
| Payout Methods Screen | ✅ Complete | `app-mobile/app/wallet/payout-methods.tsx` |
| Create Request Screen | ✅ Complete | `app-mobile/app/wallet/create-payout-request.tsx` |
| Request History Screen | ✅ Complete | `app-mobile/app/wallet/payout-requests.tsx` |
| Security Rules | ✅ Complete | `firestore-rules/payouts.rules` |
| Documentation | ✅ Complete | `PACK_83_PAYOUT_REQUESTS_IMPLEMENTATION.md` |

---

## 🎉 PACK 83 Implementation Complete!

All core functionality is implemented and ready for deployment. The system maintains strict adherence to Avalo's economic rules and provides a solid foundation for future payment processing integration.

**Next Steps:**
1. Deploy backend functions to Firebase
2. Update Firestore security rules
3. Create required Firestore indexes
4. Test end-to-end on staging
5. Build admin console for payout review (future pack)
6. Integrate real payment rails (future pack)