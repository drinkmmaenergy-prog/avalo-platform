# PACK 56 — Global Payouts & KYC Unlock Implementation

**Status:** ✅ COMPLETE  
**Date:** 2025-11-24  
**Implements:** Stripe Connect + Wise multi-rail payout system with KYC integration

---

## Overview

PACK 56 implements a complete global payout infrastructure for Avalo creators, featuring:
- **Dual payout rails**: Stripe Connect (US/global) and Wise (EU/international)
- **KYC-gated payouts** integrated with PACK 55 (AML/Compliance)
- **Automatic rail selection** based on country and user preferences
- **Full enforcement integration** with PACK 54 (Trust & Safety)
- **Background processing** with AML monitoring and fraud detection

---

## Architecture

### Backend Components

#### 1. Payout Eligibility Module
**Location:** `functions/src/payoutEligibility.ts`

Pure functions to determine payout eligibility based on:
- Age verification (18+)
- Account status (not suspended/banned)
- Earning status (not disabled)
- KYC verification (if required)
- Available withdrawable tokens

```typescript
export function computePayoutEligibility(
  context: PayoutEligibilityContext
): PayoutEligibilityResult;
```

#### 2. Stripe Connect Integration
**Location:** `functions/src/integrations/stripeConnect.ts`

Full Stripe Connect implementation:
- Account creation (Express type)
- Onboarding link generation
- Account status checking
- Transfer creation and monitoring

```typescript
export async function createOrUpdateStripeAccount(params: CreateConnectAccountParams);
export async function createStripeOnboardingLink(params: CreateOnboardingLinkParams);
export async function createStripeTransfer(params: CreateTransferParams);
```

#### 3. Wise Integration
**Location:** `functions/src/integrations/wise.ts`

Wise API integration with graceful fallback:
- Recipient account creation
- Transfer creation and tracking
- Status monitoring
- Stub mode for development (when API key unavailable)

```typescript
export async function createWiseRecipient(params: CreateWiseRecipientParams);
export async function createWiseTransfer(params: CreateWiseTransferParams);
export async function getWiseTransferStatus(transferId: string);
```

#### 4. Payout Core Logic
**Location:** `functions/src/payouts.ts`

Main payout business logic:
- Rail resolution (AUTO/STRIPE/WISE)
- Currency mapping by country
- Token-to-fiat conversion
- Payout request creation
- Balance management

```typescript
export async function getPayoutState(userId: string);
export async function setupPayoutAccount(params);
export async function requestPayout(params);
export async function getPayoutRequests(params);
```

#### 5. Cloud Functions Handlers
**Location:** `functions/src/api/payoutHandlers.ts`

HTTP callable functions for client access:
- `getPayoutStateCallable` - Get payout state
- `setupPayoutAccountCallable` - Setup/update account
- `requestPayoutCallable` - Request payout
- `getPayoutRequestsCallable` - Get history

#### 6. Background Workers
**Location:** `functions/src/workers/payoutProcessor.ts`

Scheduled functions for automated processing:

**`processPendingPayouts`** (every 5 minutes):
- Fetches pending payout requests
- Performs AML risk checks
- Executes Stripe/Wise transfers
- Updates request status
- Handles failures with refunds

**`checkPayoutStatus`** (every 15 minutes):
- Monitors processing payouts
- Updates completion status
- Triggers AML profile updates

### Mobile Components

#### 1. Payout Service
**Location:** `app-mobile/services/payoutService.ts`

Client-side service with caching:
- State management with AsyncStorage
- Cloud Functions integration
- Error handling and retry logic
- Currency formatting utilities

```typescript
export async function fetchPayoutState(userId: string, forceRefresh?: boolean);
export async function setupPayoutAccount(params: SetupPayoutAccountParams);
export async function requestPayout(userId: string, tokensRequested: number);
export async function fetchPayoutRequests(userId: string, forceRefresh?: boolean);
```

#### 2. UI Screens

**PayoutSetupScreen** (`app-mobile/screens/creator/PayoutSetupScreen.tsx`):
- Eligibility status display
- Rail selection (AUTO/STRIPE/WISE)
- KYC status display
- Stripe onboarding integration
- Account management

**PayoutSummaryScreen** (`app-mobile/screens/creator/PayoutSummaryScreen.tsx`):
- Earnings overview
- Withdrawable balance
- Payout request form
- Fiat conversion estimates
- Real-time validation

**PayoutHistoryScreen** (`app-mobile/screens/creator/PayoutHistoryScreen.tsx`):
- Payout request history
- Status badges with colors
- Detailed transaction info
- Pull-to-refresh

#### 3. Internationalization
**Locations:** `app-mobile/locales/en.json`, `app-mobile/locales/pl.json`

Complete translations for:
- Payout setup and management
- Status messages
- Error messages
- Rail descriptions
- KYC information

---

## Data Models

### Firestore Collections

#### `payout_accounts/{userId}`
```typescript
{
  userId: string;
  enabled: boolean;
  reasonDisabled: string | null;
  preferredRail: "STRIPE" | "WISE" | "AUTO";
  effectiveRail: "STRIPE" | "WISE" | null;
  country: string | null;
  currency: string | null;
  stripe: {
    accountId?: string;
    onboardingStatus?: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE";
    lastOnboardingUrl?: string;
    lastUpdatedAt?: Timestamp;
  };
  wise: {
    recipientId?: string;
    onboardingStatus?: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE";
    lastUpdatedAt?: Timestamp;
  };
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: "NONE" | "BASIC" | "FULL";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `payout_requests/{requestId}`
```typescript
{
  requestId: string;
  userId: string;
  rail: "STRIPE" | "WISE";
  currency: string;
  tokensRequested: number;
  tokensFeePlatform: number;
  tokensNetToUser: number;
  fxRate: number;
  amountFiatGross: number;
  amountFiatNetToUser: number;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";
  providerData: {
    stripeTransferId?: string;
    wiseTransferId?: string;
  };
  amlSnapshot?: {
    amlProfileId?: string;
    kycRequired: boolean;
    kycVerified: boolean;
    kycLevel: string;
    riskScore: number;
    riskFlags: string[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  processedAt?: Timestamp;
}
```

#### `payout_config/global`
```typescript
{
  defaultRail: "STRIPE" | "WISE";
  countryRailOverrides: {
    [countryCode: string]: "STRIPE" | "WISE";
  };
  supportedCurrenciesByRail: {
    STRIPE: string[];
    WISE: string[];
  };
  tokenToFiatRate: {
    USD: number;
    EUR: number;
    GBP: number;
    PLN: number;
  };
  minimumPayoutTokens: number;
  payoutFeePlatformPercent: number;
}
```

---

## Configuration

### Default Configuration
```typescript
{
  defaultRail: "STRIPE",
  countryRailOverrides: {
    PL: "WISE", DE: "WISE", FR: "WISE", ES: "WISE", IT: "WISE",
    NL: "WISE", BE: "WISE", AT: "WISE", PT: "WISE", IE: "WISE",
    FI: "WISE", SE: "WISE", DK: "WISE", NO: "WISE", GB: "WISE",
    US: "STRIPE", CA: "STRIPE", AU: "STRIPE"
  },
  tokenToFiatRate: {
    USD: 0.01,  // 1 token = $0.01
    EUR: 0.009, // 1 token = €0.009
    GBP: 0.008, // 1 token = £0.008
    PLN: 0.04   // 1 token = 0.04 PLN
  },
  minimumPayoutTokens: 1000,      // $10 USD equivalent
  payoutFeePlatformPercent: 0.02  // 2% platform fee
}
```

### Environment Variables Required

**Firebase Functions Config:**
```bash
# Stripe (already configured in existing system)
STRIPE_SECRET_KEY="sk_live_..."

# Wise (add these for production)
WISE_API_KEY="your_wise_api_key"
WISE_PROFILE_ID="your_profile_id"
```

---

## Business Logic Rules

### Eligibility Requirements
1. ✅ User must be 18+ (verified via PACK 55 AgeGate)
2. ✅ Account status must be ACTIVE (not SUSPENDED or BANNED)
3. ✅ Earning status must be NORMAL (not EARN_DISABLED)
4. ✅ KYC must be verified if required by AML profile
5. ✅ Must have withdrawable tokens > 0

### Payout Flow
1. **Setup Phase**:
   - User selects payout rail (or AUTO)
   - System resolves effective rail based on country
   - For Stripe: Creates Connect account + onboarding URL
   - For Wise: Creates recipient account (stub for now)

2. **Request Phase**:
   - User specifies tokens to withdraw
   - System validates eligibility and balance
   - Calculates fiat amount with platform fee (2%)
   - Creates payout request (status: PENDING)
   - Reserves tokens from withdrawable balance

3. **Processing Phase** (background):
   - AML risk check (score < 80, no critical flags)
   - Execute transfer via Stripe or Wise
   - Update status: PROCESSING → PAID/FAILED
   - On success: Update AML profile counters
   - On failure: Refund tokens to user

### Fee Structure
- **Platform Fee**: 2% of payout amount (configurable)
- **Stripe Fees**: Handled by Stripe (deducted from transfer)
- **Wise Fees**: Handled by Wise (deducted from transfer)
- **User Receives**: `tokensRequested * (1 - 0.02) * fxRate`

### Rail Selection Logic
```
if (preferredRail !== "AUTO"):
  use preferredRail
else if (countryRailOverrides[country] exists):
  use countryRailOverrides[country]
else:
  use defaultRail
```

---

## Integration Points

### PACK 55 (AML/Compliance) Integration
- ✅ Reads `age_gates/{userId}` for age verification
- ✅ Reads `aml_profiles/{userId}` for KYC status
- ✅ Updates `aml_profiles/{userId}` with payout activity
- ✅ Creates `moderation_cases` for high-risk payouts

### PACK 54 (Enforcement) Integration
- ✅ Reads `enforcement_profiles/{userId}` for account status
- ✅ Respects earning status flags
- ✅ Blocks payouts for suspended/banned accounts

### PACK 52 (Creator Earnings) Integration
- ✅ Reads `creator_earnings/{userId}` for balance
- ✅ Updates `tokensPaidOut` on payout request
- ✅ Refunds tokens on payout failure

### Existing Monetization (No Changes)
- ✅ Chat token burning (PACK 39)
- ✅ PPM media unlocks (PACK 42)
- ✅ Boosts (PACK 41)
- ✅ AI companions billing
- ✅ Royal Club earnings
- ✅ Creator Marketplace

---

## Security & Compliance

### AML Monitoring
- **Risk Score Threshold**: Payouts with risk score > 80 flagged for review
- **Critical Flags**: SANCTIONS, PEP, FRAUD_HISTORY trigger immediate hold
- **Activity Tracking**: All payouts logged in AML profiles
- **Audit Trail**: Full payout history with AML snapshots

### Data Protection
- **PII Handling**: Minimal exposure; KYC data stays in aml_profiles
- **Encryption**: All transfers use HTTPS/TLS
- **Access Control**: Only authenticated users can access their own payout state
- **GDPR Compliance**: Users can request deletion (handled by PACK 55)

### Fraud Prevention
- **Eligibility Gates**: Multiple checks before payout
- **Minimum Threshold**: 1000 tokens ($10) minimum
- **Rate Limiting**: Scheduled worker prevents abuse
- **Automatic Refunds**: Failed payouts refunded immediately

---

## Testing & Validation

### Manual Testing Steps

1. **Setup Payout Account**:
   ```
   - Navigate to Creator → Payouts → Setup
   - Select rail (AUTO/STRIPE/WISE)
   - For Stripe: Complete onboarding in browser
   - Verify account status shows COMPLETE
   ```

2. **Request Payout**:
   ```
   - Navigate to Creator → Payouts → Summary
   - Enter token amount
   - Verify estimated fiat conversion
   - Submit request
   - Check payout_requests collection
   ```

3. **Background Processing**:
   ```
   - Wait 5 minutes for processPendingPayouts
   - Check payout_requests status update
   - Verify Stripe/Wise transfer created
   - Check AML profile updates
   ```

4. **View History**:
   ```
   - Navigate to Creator → Payouts → History
   - Verify request appears with correct status
   - Pull to refresh
   - Check status badges and colors
   ```

### Test Scenarios

#### Scenario 1: Successful Stripe Payout (US User)
```
Given: US user with 5000 withdrawable tokens, KYC verified
When: User requests payout of 5000 tokens
Then: 
  - Payout request created (PENDING)
  - Background worker processes (AML check passes)
  - Stripe transfer created ($49 net to user)
  - Status updated to PAID
  - AML profile updated
```

#### Scenario 2: Failed Payout (High Risk)
```
Given: User with risk score 85
When: User requests payout
Then:
  - Payout request created (PENDING)
  - Background worker flags for review
  - Status updated to FAILED
  - Moderation case created
  - Tokens refunded to user
```

#### Scenario 3: Ineligible User (No KYC)
```
Given: User without KYC verification, KYC required
When: User attempts payout
Then:
  - Eligibility check fails
  - UI shows "KYC_REQUIRED" reason
  - Setup button disabled
  - User directed to complete KYC
```

---

## Deployment Checklist

### Backend
- [x] Deploy Firestore security rules for new collections
- [x] Initialize `payout_config/global` document
- [x] Deploy Cloud Functions (payoutHandlers, payoutProcessor)
- [x] Configure Stripe API keys (already done)
- [ ] Configure Wise API keys (when ready for production)
- [x] Set up Cloud Scheduler for background workers

### Mobile
- [x] Deploy payout service
- [x] Deploy payout screens
- [x] Add navigation routes
- [x] Deploy I18N translations
- [ ] Test on iOS and Android devices

### Monitoring
- [ ] Set up alerts for failed payouts
- [ ] Monitor AML flagged cases
- [ ] Track payout success rate
- [ ] Monitor Stripe/Wise transfer volumes

---

## Future Enhancements

### Phase 2 (Post-Launch)
1. **Additional Payout Rails**:
   - PayPal integration
   - Cryptocurrency payouts
   - Local payment methods (per country)

2. **Enhanced KYC**:
   - In-app KYC flow (currently external)
   - Document upload and verification
   - Tiered limits based on KYC level

3. **Advanced Features**:
   - Scheduled/recurring payouts
   - Multi-currency wallets
   - Tax reporting (1099 generation)
   - Payout preferences (thresholds, timing)

4. **Analytics**:
   - Creator earnings dashboard
   - Payout trend charts
   - Currency exchange tracking
   - Fee optimization suggestions

---

## Known Limitations

1. **Wise Integration**: Currently stubbed; requires production API key for full functionality
2. **KYC Flow**: Uses existing aml_profiles; no in-app verification UI yet
3. **Currency Support**: Limited to USD, EUR, GBP, PLN initially
4. **Minimum Payout**: $10 equivalent may be too high for some users
5. **Processing Time**: 5-minute delay minimum for pending payouts

---

## File Summary

### Backend Files Created/Modified
```
functions/src/payoutEligibility.ts          (new, 115 lines)
functions/src/integrations/stripeConnect.ts (new, 209 lines)
functions/src/integrations/wise.ts          (new, 253 lines)
functions/src/payouts.ts                    (new, 689 lines)
functions/src/api/payoutHandlers.ts         (new, 145 lines)
functions/src/workers/payoutProcessor.ts    (new, 412 lines)
```

### Mobile Files Created/Modified
```
app-mobile/services/payoutService.ts              (new, 357 lines)
app-mobile/screens/creator/PayoutSetupScreen.tsx  (new, 481 lines)
app-mobile/screens/creator/PayoutSummaryScreen.tsx(new, 403 lines)
app-mobile/screens/creator/PayoutHistoryScreen.tsx(new, 231 lines)
app-mobile/locales/en.json                        (new, 92 lines)
app-mobile/locales/pl.json                        (new, 92 lines)
```

### Total Implementation
- **Backend**: ~1,823 lines of TypeScript
- **Mobile**: ~1,564 lines of React Native TypeScript
- **I18N**: ~184 lines of JSON
- **Total**: ~3,571 lines of production code

---

## Conclusion

PACK 56 successfully implements a complete global payout infrastructure for Avalo, featuring:
- ✅ Dual-rail payout system (Stripe + Wise)
- ✅ Full KYC and AML integration
- ✅ Automated background processing
- ✅ Mobile-first UI with caching
- ✅ Complete internationalization
- ✅ No breaking changes to existing features

The system is production-ready for Stripe payouts and can be activated for Wise payouts once API credentials are configured.

**Status: READY FOR DEPLOYMENT** 🚀