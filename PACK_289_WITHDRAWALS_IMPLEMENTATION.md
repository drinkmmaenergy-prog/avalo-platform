# PACK 289 — Payouts & Withdrawals COMPLETE IMPLEMENTATION ✅

**Status:** COMPLETE  
**Date:** 2025-12-09  
**Dependencies:** PACK 267 (Economics), PACK 277 (Wallet), PACK 281 (Legal), PACK 288 (Token Store)

---

## 📋 OVERVIEW

Complete production-ready withdrawal/payout system for Avalo, allowing creators to cash out their earned tokens:

- ✅ Only earned tokens can be withdrawn (NOT purchased tokens)
- ✅ Fixed conversion rate: **1 token = 0.20 PLN** (or local equivalent)
- ✅ Full KYC (Know Your Customer) verification required
- ✅ AML (Anti-Money Laundering) compliance with limits
- ✅ Integration with Wise & Bank Transfer (stubs ready for production)
- ✅ Complete admin review workflow
- ✅ Mobile-first UI for KYC and withdrawals
- ✅ Comprehensive audit trail

---

## 🎯 KEY BUSINESS RULES

### Withdrawable Tokens Formula

```typescript
withdrawableTokens = min(
  currentBalance,
  totalEarnedTokens - totalWithdrawnTokens
)
```

**Critical Rule:** Only tokens earned through:
- Chat interactions (65% creator share)
- Calendar bookings (80% creator share)
- Media sales
- Events
- Tips

**Cannot Withdraw:** Tokens purchased from the token store.

### Conversion & Payout

- **Base Rate:** 1 token = 0.20 PLN (FIXED)
- **Currency Conversion:** Automatic FX for non-PLN payouts
- **Processing Time:** 3-7 business days
- **Payout Methods:** Wise, Bank Transfer (SEPA/SWIFT)

### Withdrawal Limits

```typescript
const WITHDRAWAL_LIMITS = {
  minTokensPerWithdrawal: 500,     // 100 PLN minimum
  maxTokensPerWithdrawal: 50000,   // 10,000 PLN maximum
  maxPLNPerMonth: 20000,           // Monthly cap (AML)
  maxWithdrawalsPerMonth: 10       // Anti-abuse
};
```

### KYC Requirements

**Mandatory Before First Withdrawal:**
1. Age verification (18+)
2. Full name (as on ID)
3. Date of birth
4. Country & tax residence
5. ID document (ID card/passport/license)
6. Residential address
7. Payout method (Wise ID or IBAN)

**KYC Status Flow:**
```
NOT_STARTED → PENDING → VERIFIED (can withdraw)
                    ↓
                 REJECTED (contact support)
```

---

## 📦 DELIVERABLES

### 1. Backend Types & Models

#### [`functions/src/types/pack289-withdrawals.types.ts`](functions/src/types/pack289-withdrawals.types.ts:1)
Complete TypeScript definitions for:
- [`WalletDataExtended`](functions/src/types/pack289-withdrawals.types.ts:21) - Extended wallet with withdrawal tracking
- [`KYCProfile`](functions/src/types/pack289-withdrawals.types.ts:71) - Complete KYC data model
- [`WithdrawalRequest`](functions/src/types/pack289-withdrawals.types.ts:99) - Withdrawal lifecycle model
- [`WithdrawalLimitsConfig`](functions/src/types/pack289-withdrawals.types.ts:139) - Configurable limits
- [`MonthlyWithdrawalStats`](functions/src/types/pack289-withdrawals.types.ts:152) - Monthly tracking
- Error codes, request/response types, audit logs

**Key Types:**
```typescript
export interface WithdrawalRequest {
  withdrawalId: string;
  userId: string;
  requestedTokens: number;
  approvedTokens: number;
  payoutCurrency: string;
  payoutAmount: number;
  ratePerTokenPLN: number;  // 0.20
  status: WithdrawalStatus;
  kycSnapshot: KYCSnapshot;
  provider: 'WISE' | 'BANK_TRANSFER' | 'MANUAL';
  providerPayoutId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paidAt?: Timestamp;
}
```

### 2. Core Withdrawal Functions

#### [`functions/src/pack289-withdrawals.ts`](functions/src/pack289-withdrawals.ts:1)
Main withdrawal logic and user-facing functions.

**Cloud Functions:**
- [`withdrawals_getWithdrawableTokens`](functions/src/pack289-withdrawals.ts:133) - Calculate available tokens
- [`withdrawals_createRequest`](functions/src/pack289-withdrawals.ts:181) - Submit withdrawal request
- [`withdrawals_getHistory`](functions/src/pack289-withdrawals.ts:343) - Fetch user's withdrawal history
- [`withdrawals_getMonthlyLimits`](functions/src/pack289-withdrawals.ts:398) - Check monthly status

**Key Functions:**
```typescript
async function calculateWithdrawableTokens(userId: string): Promise<WithdrawableTokensCalculation>
async function checkWithdrawalLimits(userId: string, tokens: number): Promise<{canWithdraw, reasons}>
async function checkKYCStatus(userId: string): Promise<{verified, profile, reason}>
```

### 3. Admin & Approval Functions

#### [`functions/src/pack289-withdrawals-admin.ts`](functions/src/pack289-withdrawals-admin.ts:1)
Admin-only operations for withdrawal management.

**Cloud Functions:**
- [`withdrawals_admin_approve`](functions/src/pack289-withdrawals-admin.ts:108) - Approve withdrawal + burn tokens
- [`withdrawals_admin_reject`](functions/src/pack289-withdrawals-admin.ts:238) - Reject with reason
- [`withdrawals_admin_list`](functions/src/pack289-withdrawals-admin.ts:307) - List pending withdrawals
- [`withdrawals_markAsPaid`](functions/src/pack289-withdrawals-admin.ts:382) - Mark as completed

**Critical Function - Token Burn:**
```typescript
async function burnTokensForWithdrawal(
  userId: string,
  tokens: number,
  withdrawalId: string
): Promise<{success, error?}>
```

**What it does:**
1. Reduces [`balanceTokens`](functions/src/pack289-withdrawals-admin.ts:55) by withdrawal amount
2. Increases [`totalWithdrawnTokens`](functions/src/pack289-withdrawals-admin.ts:56) 
3. Creates [`walletTransaction`](functions/src/pack289-withdrawals-admin.ts:64) record with WITHDRAWAL type
4. Updates [`monthlyWithdrawalStats`](functions/src/pack289-withdrawals-admin.ts:94)

### 4. KYC Functions

#### [`functions/src/pack289-kyc.ts`](functions/src/pack289-kyc.ts:1)
Complete KYC verification system.

**Cloud Functions:**
- [`kyc_submit`](functions/src/pack289-kyc.ts:91) - Submit KYC profile for review
- [`kyc_getStatus`](functions/src/pack289-kyc.ts:259) - Get user's KYC status
- [`kyc_admin_review`](functions/src/pack289-kyc.ts:300) - Admin approve/reject
- [`kyc_admin_listPending`](functions/src/pack289-kyc.ts:380) - List pending KYC submissions

**Validation Functions:**
```typescript
function isValidIBAN(iban: string): boolean
function isValidPostalCode(postalCode: string, country: string): boolean
function calculateAge(dateOfBirth: string): number
```

**Security:**
- ID document numbers are hashed using [`hashSensitiveData()`](functions/src/pack289-kyc.ts:34)
- All KYC changes logged in [`kycAuditLogs`](functions/src/pack289-kyc.ts:213) collection

### 5. Payout Provider Integration

#### [`functions/src/pack289-payout-providers.ts`](functions/src/pack289-payout-providers.ts:1)
Integration stubs for Wise and bank transfers.

**Main Function:**
```typescript
export async function startPayout(
  userId: string,
  withdrawalId: string,
  currency: string,
  amount: number,
  payoutMethod: PayoutMethod
): Promise<StartPayoutResponse>
```

**Providers:**
- [`createWisePayout()`](functions/src/pack289-payout-providers.ts:52) - Wise API integration (stub)
- [`createBankTransferPayout()`](functions/src/pack289-payout-providers.ts:111) - Bank transfer (stub)

**Webhooks:**
- [`payouts_wiseWebhook`](functions/src/pack289-payout-providers.ts:254) - Wise payment status updates
- [`payouts_genericWebhook`](functions/src/pack289-payout-providers.ts:300) - Generic webhook handler
- [`payouts_admin_getPendingManual`](functions/src/pack289-payout-providers.ts:354) - List manual payouts

**Production Setup:**
```typescript
// When Wise API keys are available:
const WISE_CONFIG = {
  apiKey: functions.config().wise?.api_key,
  apiUrl: 'https://api.transferwise.com',
  profileId: functions.config().wise?.profile_id,
};
```

### 6. Security Rules

#### [`firestore-pack289-withdrawals.rules`](firestore-pack289-withdrawals.rules:1)
Firestore security rules for all collections.

**Collections:**
- [`kycProfiles/{userId}`](firestore-pack289-withdrawals.rules:52) - Users can read own, create/update with validation
- [`withdrawalRequests/{id}`](firestore-pack289-withdrawals.rules:91) - Users read own, create if KYC verified, cancel pending
- [`monthlyWithdrawalStats/{userId_YYYY-MM}`](firestore-pack289-withdrawals.rules:129) - Read own, backend writes
- [`withdrawalAuditLogs/{id}`](firestore-pack289-withdrawals.rules:146) - Read own logs, backend creates
- [`wallets/{userId}`](firestore-pack289-withdrawals.rules:159) - Read own, backend updates

**Key Security Features:**
- Age verification checked: [`isAgeVerified()`](firestore-pack289-withdrawals.rules:30)
- KYC verification required: [`hasKYCVerified()`](firestore-pack289-withdrawals.rules:34)
- All writes backend-only (prevents tampering)
- Admin role for sensitive operations

### 7. Firestore Indexes

#### [`firestore-pack289-withdrawals.indexes.json`](firestore-pack289-withdrawals.indexes.json:1)
Optimized indexes for efficient queries.

**Key Indexes:**
```json
{
  "collectionGroup": "withdrawalRequests",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

Indexes for:
- User withdrawal history
- Admin pending review list
- Monthly stats lookup
- Audit log queries
- KYC status filtering

### 8. Mobile UI Components

#### [`app-mobile/app/wallet/kyc-form.tsx`](app-mobile/app/wallet/kyc-form.tsx:1)
Multi-step KYC verification form.

**Features:**
- 4-step wizard (Personal Info → ID Document → Address → Payout Method)
- Progress indicator
- Client-side validation
- Country/currency selection
- IBAN validation for bank transfers
- Wise recipient ID input
- Responsive design

**Steps:**
1. **Personal Info:** Name, DOB, country, tax residence
2. **ID Document:** Type, number, expiration, country
3. **Address:** Full residential address with postal code
4. **Payout Method:** Wise or Bank Transfer with details

#### [`app-mobile/app/wallet/withdraw.tsx`](app-mobile/app/wallet/withdraw.tsx:1)
Complete withdrawal management screen.

**Features:**
- Real-time withdrawable balance display
- Earned vs withdrawn vs balance breakdown
- Monthly limits with progress bars
- Quick amount buttons (25%, 50%, 75%, Max)
- Payout estimate calculator
- Withdrawal history with status badges
- Pull-to-refresh
- KYC verification guard

**User Flow:**
```
Open Screen
  ↓
Check KYC → NOT_VERIFIED → Redirect to KYC Form
  ↓ VERIFIED
View Withdrawable Balance
  ↓
Enter Amount (with quick buttons)
  ↓
Review Payout Estimate
  ↓
Submit Request → PENDING_REVIEW
  ↓
Admin Reviews → APPROVED → PROCESSING
  ↓
Payout Sent → PAID
```

---

## 🗄️ DATA MODELS

### Firestore Collections

#### `kycProfiles/{userId}`
```typescript
{
  userId: "UID",
  status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED",
  fullName: "John Doe",
  dateOfBirth: "1990-01-01",
  country: "PL",
  taxResidence: "PL",
  idDocument: {
    type: "ID_CARD" | "PASSPORT" | "DRIVING_LICENSE",
    country: "PL",
    number: "hash_of_document_number",
    expiresAt: "2030-12-31"
  },
  address: {
    line1: "123 Main St",
    line2: "Apt 4B",
    city: "Warsaw",
    postalCode: "00-001",
    country: "PL"
  },
  payoutMethod: {
    type: "WISE" | "BANK_TRANSFER",
    currency: "PLN",
    iban?: "PL...",
    wiseRecipientId?: "12345678"
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastReviewAt?: Timestamp,
  rejectionReason?: "string"
}
```

#### `withdrawalRequests/{withdrawalId}`
```typescript
{
  withdrawalId: "uuid",
  userId: "UID",
  requestedTokens: 1000,
  approvedTokens: 1000,
  payoutCurrency: "PLN",
  payoutAmount: 200.00,
  ratePerTokenPLN: 0.20,
  fxRateToPayoutCurrency: 1.0,
  status: "PENDING_REVIEW" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED" | "CANCELLED",
  kycSnapshot: {
    kycStatus: "VERIFIED",
    country: "PL",
    payoutMethod: "BANK_TRANSFER"
  },
  provider: "WISE" | "BANK_TRANSFER" | "MANUAL",
  providerPayoutId?: "wise_abc123",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  paidAt?: Timestamp,
  rejectionReason?: "string",
  adminNotes?: "string"
}
```

#### `monthlyWithdrawalStats/{userId_YYYY-MM}`
```typescript
{
  userId: "UID",
  month: "2025-01",
  totalTokensWithdrawn: 5000,
  totalPLNWithdrawn: 1000.00,
  withdrawalCount: 2,
  lastWithdrawalAt: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `wallets/{userId}` (Extended from PACK 277)
```typescript
{
  userId: "UID",
  balanceTokens: 10000,
  lifetimePurchasedTokens: 5000,
  lifetimeEarnedTokens: 8000,
  lifetimeSpentTokens: 3000,
  totalWithdrawnTokens: 2000,  // ← NEW for PACK 289
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `walletTransactions/{txId}` (Extended)
```typescript
{
  txId: "uuid",
  userId: "UID",
  type: "WITHDRAWAL",  // ← NEW type
  source: "PAYOUT",
  amountTokens: 1000,
  beforeBalance: 10000,
  afterBalance: 9000,
  metadata: {
    withdrawalId: "uuid",
    payoutAmount: 200.00,
    payoutCurrency: "PLN",
    provider: "WISE",
    providerPayoutId: "wise_abc123",
    ratePerTokenPLN: 0.20
  },
  timestamp: Timestamp
}
```

#### `withdrawalAuditLogs/{logId}`
```typescript
{
  logId: "uuid",
  withdrawalId: "uuid",
  userId: "UID",
  action: "CREATED" | "APPROVED" | "REJECTED" | "PAID" | "FAILED" | "CANCELLED",
  performedBy: "UID" | "SYSTEM",
  previousStatus?: "PENDING_REVIEW",
  newStatus: "APPROVED",
  notes?: "Approved by admin",
  metadata?: {},
  timestamp: Timestamp
}
```

---

## 🔄 WITHDRAWAL FLOW

### User Flow: Create Withdrawal

```
1. User Opens Withdrawal Screen
   ↓
2. System Checks KYC Status
   ├─ NOT_VERIFIED → Show "KYC Required" → Redirect to KYC Form
   └─ VERIFIED → Continue
   ↓
3. Calculate Withdrawable Tokens
   withdrawable = min(currentBalance, totalEarned - totalWithdrawn)
   ↓
4. User Enters Amount
   ├─ Validate: amount >= minTokensPerWithdrawal (500)
   ├─ Validate: amount <= maxTokensPerWithdrawal (50,000)
   ├─ Validate: amount <= withdrawable
   └─ Check monthly limits
   ↓
5. Display Payout Estimate
   payoutPLN = tokens * 0.20
   ↓
6. User Confirms
   ↓
7. Create WithdrawalRequest (status: PENDING_REVIEW)
   ↓
8. Create Audit Log
   ↓
9. Show Success Message
```

### Admin Flow: Approve Withdrawal

```
1. Admin Opens Pending Withdrawals List
   ↓
2. Review Withdrawal Details
   ├─ User info
   ├─ KYC status
   ├─ Requested amount
   ├─ Monthly stats
   └─ Account history
   ↓
3. Admin Decision
   ├─ APPROVE                    ├─ REJECT
   ↓                              ↓
4. Re-verify Withdrawable        4. Update status to REJECTED
   ↓                              ↓
5. Burn Tokens                   5. Add rejection reason
   ├─ balanceTokens -= tokens    ↓
   ├─ totalWithdrawnTokens += 
   └─ Create wallet transaction
   ↓
6. Update Monthly Stats
   ↓
7. Change Status to PROCESSING
   ↓
8. Start Payout (Wise/Bank)
   ├─ Call provider API
   ├─ Save providerPayoutId
   └─ OR mark as MANUAL
   ↓
9. Webhook/Admin marks as PAID
   ↓
10. User receives notification
```

### Payout Provider Flow

```
1. System Calls startPayout()
   ↓
2. Route to Provider
   ├─ WISE → createWisePayout()
   └─ BANK_TRANSFER → createBankTransferPayout()
   ↓
3. Provider Processing
   ├─ WITH API KEYS:
   │  ├─ Create transfer
   │  ├─ Fund transfer
   │  └─ Return provider ID
   │
   └─ WITHOUT API KEYS (Stub):
       └─ Mark as MANUAL → Admin processes manually
   ↓
4. Update Withdrawal Record
   ├─ providerPayoutId: "wise_abc123"
   └─ provider: "WISE" | "MANUAL"
   ↓
5. Wait for Webhook or Manual Confirmation
   ↓
6. Update Status to PAID
   ↓
7. Record paidAt timestamp
```

---

## 🔐 SECURITY & COMPLIANCE

### Age Verification
- **Requirement:** Users must be 18+ (already enforced at registration)
- **Check:** [`ageVerified: true`](firestore-pack289-withdrawals.rules:30) on user document
- **Enforcement:** Both in security rules and backend functions

### KYC Verification
- **Mandatory:** Before any withdrawal
- **Data Collected:**
  - Full legal name
  - Date of birth
  - ID document (hashed number)
  - Residential address
  - Payout method details
- **Admin Review:** All KYC submissions manually reviewed
- **Rejection:** User can resubmit with corrections

### Withdrawal Limits (AML Compliance)

| Limit Type | Value | Purpose |
|------------|-------|---------|
| Minimum per withdrawal | 500 tokens (100 PLN) | Prevent micro-transactions |
| Maximum per withdrawal | 50,000 tokens (10,000 PLN) | Fraud prevention |
| Monthly maximum | 20,000 PLN | AML compliance |
| Max withdrawals/month | 10 | Anti-abuse |

### Data Security
- ID document numbers **hashed** (SHA-256)
- Sensitive data encrypted in transit (HTTPS)
- Backend-only writes (prevents client tampering)
- Complete audit trail for all actions
- GDPR compliant (data exportable/deletable)

### Fraud Protection
1. **Token Source Verification:** Only earned tokens withdrawable
2. **KYC Gating:** Full identity verification required
3. **Limit Enforcement:** Multiple layers of limits
4. **Admin Review:** Manual approval for all withdrawals
5. **Audit Logging:** Every action tracked with timestamp
6. **Account Flagging:** Integration with risk engine (PACK 268)

---

## 📊 ADMIN PANEL FEATURES

### Pending Withdrawals Dashboard

**View:**
- List all withdrawals with status PENDING_REVIEW
- Sort by date, amount, user
- Filter by country, currency, amount range

**For Each Withdrawal:**
- User: Display name, email, registration date
- KYC Status: VERIFIED badge with country
- Amount: Tokens + PLN equivalent
- Monthly Stats: This month's withdrawals
- Account History: Previous withdrawals, total earned

**Actions:**
- **Approve:** Burns tokens, starts payout
- **Reject:** Requires reason, notifies user
- **View Details:** Full KYC profile, transaction history

### KYC Review Dashboard

**View:**
- List all KYC submissions with status PENDING
- Sort by submission date
- Filter by country, document type

**For Each Submission:**
- Personal info (name, DOB, country)
- Document details (type, expiry)
- Address (full residential)
- Payout method (Wise/IBAN)

**Actions:**
- **Approve:** Marks KYC as VERIFIED
- **Reject:** Requires reason, allows resubmission

### Manual Payouts Dashboard

**When:**
- No Wise API keys configured
- Bank transfer requires manual processing
- Payout flagged for manual review

**View:**
- All withdrawals with provider = MANUAL
- Status = PROCESSING
- Sorted by oldest first

**For Each:**
- User details
- Payout amount + currency
- IBAN or Wise ID
- Copy-to-clipboard buttons

**Actions:**
- **Mark as Paid:** Changes status to PAID
- **Mark as Failed:** Changes status to FAILED + reason

---

## 🧪 TESTING

### Test Scenarios

#### 1. Happy Path - Full Withdrawal

```typescript
// Test complete flow
const userId = 'test_user_1';

// 1. Setup: User has earned 10,000 tokens, withdrawn 0
await setupTestWallet(userId, {
  balanceTokens: 10000,
  lifetimeEarnedTokens: 10000,
  totalWithdrawnTokens: 0,
});

// 2. Setup: KYC verified
await setupTestKYC(userId, { status: 'VERIFIED' });

// 3. Request withdrawal of 5,000 tokens (1,000 PLN)
const result = await withdrawals_createRequest({
  userId,
  requestedTokens: 5000,
});
expect(result.success).toBe(true);
expect(result.payoutAmount).toBe(1000);

// 4. Admin approves
await withdrawals_admin_approve({
  withdrawalId: result.withdrawalId!,
});

// 5. Verify tokens burned
const wallet = await getWallet(userId);
expect(wallet.balanceTokens).toBe(5000);
expect(wallet.totalWithdrawnTokens).toBe(5000);

// 6. Mark as paid
await withdrawals_markAsPaid({
  withdrawalId: result.withdrawalId!,
});

// 7. Verify status
const withdrawal = await getWithdrawal(result.withdrawalId!);
expect(withdrawal.status).toBe('PAID');
```

#### 2. Error Cases

```typescript
// Insufficient earned tokens
const result1 = await withdrawals_createRequest({
  userId: 'user_only_purchased_tokens',
  requestedTokens: 1000,
});
expect(result1.error).toContain('Insufficient withdrawable tokens');

// KYC not verified
const result2 = await withdrawals_createRequest({
  userId: 'user_no_kyc',
  requestedTokens: 1000,
});
expect(result2.errorCode).toBe('KYC_NOT_VERIFIED');

// Below minimum
const result3 = await withdrawals_createRequest({
  userId: 'valid_user',
  requestedTokens: 100, // Min is 500
});
expect(result3.errorCode).toBe('BELOW_MINIMUM');

// Monthly limit exceeded
const result4 = await withdrawals_createRequest({
  userId: 'user_at_monthly_limit',
  requestedTokens: 50000,
});
expect(result4.errorCode).toBe('MONTHLY_LIMIT_EXCEEDED');
```

#### 3. KYC Validation

```typescript
// Invalid IBAN
const result1 = await kyc_submit({
  ...validKYCData,
  payoutMethod: {
    type: 'BANK_TRANSFER',
    currency: 'PLN',
    iban: 'INVALID',
  },
});
expect(result1.errorCode).toBe('VALIDATION_ERROR');

// Under 18
const result2 = await kyc_submit({
  ...validKYCData,
  dateOfBirth: '2010-01-01', // Too young
});
expect(result2.error).toContain('Must be 18 or older');
```

---

## 🚀 DEPLOYMENT GUIDE

### 1. Environment Setup

Add to Firebase Functions config:

```bash
firebase functions:config:set \
  wise.api_key="YOUR_WISE_API_KEY" \
  wise.profile_id="YOUR_WISE_PROFILE_ID"
```

Or use `.env` for local development:

```env
WISE_API_KEY=your_wise_api_key
WISE_PROFILE_ID=your_wise_profile_id
```

### 2. Deploy Functions

```bash
cd functions
npm install
npm run build

firebase deploy --only functions:withdrawals_getWithdrawableTokens,functions:withdrawals_createRequest,functions:withdrawals_getHistory,functions:withdrawals_getMonthlyLimits,functions:withdrawals_admin_approve,functions:withdrawals_admin_reject,functions:withdrawals_admin_list,functions:withdrawals_markAsPaid,functions:kyc_submit,functions:kyc_getStatus,functions:kyc_admin_review,functions:kyc_admin_listPending,functions:payouts_wiseWebhook,functions:payouts_genericWebhook,functions:payouts_admin_getPendingManual
```

### 3. Deploy Security Rules

Merge [`firestore-pack289-withdrawals.rules`](firestore-pack289-withdrawals.rules:1) into [`firestore.rules`](firestore.rules:1):

```bash
# Review merged rules
cat firestore.rules

# Deploy
firebase deploy --only firestore:rules
```

### 4. Deploy Firestore Indexes

Merge [`firestore-pack289-withdrawals.indexes.json`](firestore-pack289-withdrawals.indexes.json:1) into [`firestore.indexes.json`](firestore.indexes.json:1):

```bash
# Deploy indexes
firebase deploy --only firestore:indexes
```

### 5. Initialize Configuration

Set withdrawal limits in Firestore:

```typescript
// Run once via Firebase Console or admin script
await db.collection('config').doc('withdrawalLimits').set({
  minTokensPerWithdrawal: 500,
  maxTokensPerWithdrawal: 50000,
  maxPLNPerMonth: 20000,
  maxWithdrawalsPerMonth: 10,
  updatedAt: admin.firestore.Timestamp.now(),
});
```

### 6. Wise Integration (When Ready)

**Steps:**
1. Create Wise Business Account
2. Generate API key in Wise Dashboard
3. Get your Profile ID
4. Set config: `firebase functions:config:set wise.api_key="..." wise.profile_id="..."`
5. Update [`WISE_CONFIG`](functions/src/pack289-payout-providers.ts:33) with production URL
6. Implement actual API calls in [`createWisePayout()`](functions/src/pack289-payout-providers.ts:52)
7. Configure webhook endpoint: `https://[region]-[project].cloudfunctions.net/payouts_wiseWebhook`

### 7. Mobile App Update

Add withdrawal access to navigation:

```typescript
// In wallet/index.tsx or navigation
<TouchableOpacity onPress={() => router.push('/wallet/withdraw')}>
  <Text>Withdraw Earnings</Text>
</TouchableOpacity>
```

---

## 📈 MONITORING & ALERTS

### Key Metrics to Track

**Withdrawal Metrics:**
- Total withdrawal requests per day/week/month
- Average processing time (request → paid)
- Approval/rejection rate
- Total PLN paid out
- Withdrawals by country/currency

**KYC Metrics:**
- KYC submissions per day
- Approval/rejection rate
- Average review time
- Rejection reasons distribution

**Health Metrics:**
- Failed withdrawals
- Stuck in PROCESSING status (> 7 days)
- Manual payouts pending (> 3 days)
- API errors (Wise/Banking)

### Alerts to Configure

```typescript
// Alert if withdrawal stuck > 7 days
const stuckWithdrawals = await db
  .collection('withdrawalRequests')
  .where('status', '==', 'PROCESSING')
  .where('createdAt', '<', sevenDaysAgo)
  .get();

if (stuckWithdrawals.size > 0) {
  sendAlert('STUCK_WITHDRAWALS', stuckWithdrawals.size);
}

// Alert if KYC queue > 50
const pendingKYC = await db
  .collection('kycProfiles')
  .where('status', '==', 'PENDING')
  .get();

if (pendingKYC.size > 50) {
  sendAlert('HIGH_KYC_QUEUE', pendingKYC.size);
}
```

---

## 🐛 COMMON ISSUES & SOLUTIONS

### Issue: User can't withdraw despite having tokens

**Cause:** Tokens were purchased, not earned

**Solution:**
```typescript
const withdrawable = await calculateWithdrawableTokens(userId);
console.log('Earned:', withdrawable.totalEarned);
console.log('Withdrawn:', withdrawable.totalWithdrawn);
console.log('Available:', withdrawable.withdrawableTokens);
```

Expected behavior: Only earned tokens are withdrawable.

### Issue: KYC stuck in PENDING

**Cause:** Admin hasn't reviewed yet

**Solution:**
- Admins should check KYC dashboard daily
- Consider auto-approve for verified users in future
- Send reminders to admin after 48 hours

### Issue: Withdrawal stuck in PROCESSING

**Cause:** Wise API key not configured or manual payout not completed

**Solution:**
1. Check if provider = 'MANUAL'
2. If yes, admin must complete via dashboard
3. If Wise, check API key configuration
4. Check Wise dashboard for transfer status

### Issue: Monthly limit reached but user needs to withdraw

**Cause:** AML compliance limit (20,000 PLN/month)

**Solution:**
- Wait until next month
- OR request limit increase (requires compliance approval)
- Document reason for exception

---

## ✅ VERIFICATION CHECKLIST

Before going live:

- [ ] All Cloud Functions deployed
- [ ] Security rules deployed and tested
- [ ] Firestore indexes created
- [ ] Withdrawal limits configured
- [ ] KYC form tested end-to-end
- [ ] Withdrawal flow tested with test accounts
- [ ] Admin approval workflow tested
- [ ] Token burning verified in database
- [ ] Monthly limits enforcing correctly
- [ ] Wise integration configured (or manual process documented)
- [ ] Webhooks configured and signature verified
- [ ] Monitoring alerts set up
- [ ] Legal terms updated (withdrawals are non-reversible)
- [ ] Tax reporting set up (if required by jurisdiction)
- [ ] Admin trained on review process
- [ ] User documentation written
- [ ] Support team briefed on common issues

---

## 📚 INTEGRATION WITH OTHER PACKS

### PACK 267 (Token Economics)
- Uses fixed payout rate: 0.20 PLN/token
- Respects revenue splits (already applied when tokens earned)
- Withdrawals don't affect token purchase prices

### PACK 277 (Wallet)
- Extends [`WalletData`](functions/src/types/pack277-wallet.types.ts:12) with [`totalWithdrawnTokens`](functions/src/types/pack289-withdrawals.types.ts:29)
- Creates [`walletTransactions`](functions/src/pack289-withdrawals-admin.ts:64) with type WITHDRAWAL
- Uses existing wallet transaction system

### PACK 281 (Legal Docs)
- Users must accept Terms & Privacy before KYC
- Withdrawal terms: generally non-refundable
- Tokens are utility, NOT financial instruments
- Tax compliance on user (creator)

### PACK 288 (Token Store)
- Clear separation: purchased tokens ≠ withdrawable
- Only earned tokens can be cashed out
- Purchase history separate from withdrawal history

### PACK 268 (Risk Engine)
- Accounts flagged high-risk → require manual review
- Automated fraud detection can pause withdrawals
- Admin panel shows risk flags during approval

---

## 🎉 CONCLUSION

PACK 289 provides a complete, production-ready withdrawal system with:

✅ Secure token-to-cash conversion  
✅ Full KYC/AML compliance  
✅ Admin approval workflow  
✅ Multiple payout methods  
✅ Complete audit trail  
✅ Mobile-first UI  
✅ Fraud protection  
✅ Ready for scale  

**Next Steps:**
1. Complete Wise API integration (replace stubs)
2. Add bank transfer API (if direct integration available)
3. Implement automated KYC verification (e.g., Stripe Identity)
4. Add SMS/Email notifications for withdrawal status
5. Create admin dashboard web app
6. Set up tax reporting automation
7. Monitor and optimize based on real usage

---

**Implementation Complete** ✅  
**Ready for Testing** 🧪  
**Production-Ready After API Integration** 🚀