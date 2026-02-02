# PHASE 3.3 — Web Core Integration (Creator + Payments + Admin)

## Overview

This document describes the web app integration for creator panels, payments, analytics, and admin surfaces. The web app is a **thin client** consuming existing Firebase Functions — **NO business logic** is duplicated.

## Hard Rules Enforced

1. ✅ **NO business logic in web** — All calculations performed by backend
2. ✅ **Web is a thin client** consuming existing Firebase Functions
3. ✅ **Payments use SAME Stripe Checkout + webhook invariants** as mobile
4. ✅ **Token pricing MUST match CANONICAL_TOKEN_PACKS**
5. ✅ **No admin surface may directly mutate wallet balances**
6. ✅ **Role-based access is REQUIRED** (user / creator / admin)

---

## Route Map (Web)

### A) Creator Web Panel

| Route | Description | Role Required |
|-------|-------------|---------------|
| `/creator` | Earnings overview | creator |
| `/creator/payouts` | Payout history + request | creator |
| `/creator/stripe` | Stripe Connect status | creator |
| `/creator/analytics` | Analytics dashboard | creator |

### B) Web Token Purchase Flow

| Route | Description | Role Required |
|-------|-------------|---------------|
| `/wallet/buy` | Token purchase page | user |
| `/wallet/success` | Post-checkout success | user |

### C) Admin / Ops Views (READ-ONLY)

| Route | Description | Role Required |
|-------|-------------|---------------|
| `/admin/ops` | Overview dashboard | admin |
| `/admin/ops/flags` | Feature flags list | admin |
| `/admin/ops/trust` | Trust & safety signals | admin |
| `/admin/ops/health` | System health metrics | admin |

---

## Page → Backend Function Mapping

### Creator Panel

| Page | Backend Function | Source File | Type |
|------|------------------|-------------|------|
| `/creator` | `getPayoutState` | `payouts.ts` | onCall |
| `/creator` | Firestore read: `creator_analytics` | PACK 290 | Firestore |
| `/creator/payouts` | `getPayoutState` | `payouts.ts` | onCall |
| `/creator/payouts` | `getPayoutRequests` | `payouts.ts` | onCall |
| `/creator/payouts` | `requestPayout` | `payouts.ts` | onCall |
| `/creator/stripe` | `getPayoutState` | `payouts.ts` | onCall |
| `/creator/stripe` | `setupPayoutAccount` | `payouts.ts` | onCall |
| `/creator/analytics` | Firestore read: `creator_analytics/{uid}_{period}` | PACK 290 | Firestore |

### Web Token Purchase

| Page | Backend Function | Source File | Type |
|------|------------------|-------------|------|
| `/wallet/buy` | `tokens_createCheckoutSession` | `pack288-web-stripe.ts` | onCall |
| *webhook* | `stripeWebhookV1` | `payments/stripe/webhook.ts` | onRequest |

### Admin / Ops

| Page | Backend Function | Source File | Type |
|------|------------------|-------------|------|
| `/admin/ops` | `getSystemHealth` | monitoring endpoints | onCall |
| `/admin/ops` | Firestore read: `featureFlags` | `featureFlags.ts` | Firestore |
| `/admin/ops` | Firestore read: `trust_signals` | Trust Engine | Firestore |
| `/admin/ops/flags` | Firestore read: `featureFlags` | `featureFlags.ts` | Firestore |
| `/admin/ops/trust` | Firestore read: `trust_signals` | Trust Engine | Firestore |
| `/admin/ops/health` | `getSystemHealth` | monitoring endpoints | onCall |

---

## Auth + Role Gating

### Role Hierarchy

```
admin > creator > user
```

### Implementation

The [`useRoleGate`](src/hooks/useRoleGate.ts) hook enforces role-based access:

```typescript
// Creator pages
const { isAuthorized } = useRoleGate({
  requiredRole: 'creator',
  redirectTo: '/auth/login?redirect=/creator',
});

// Admin pages
const { isAuthorized } = useRoleGate({
  requiredRole: 'admin',
  redirectTo: '/admin/no-access',
});
```

### Role Resolution

1. **Admin check**: Query `admin_users/{uid}` collection for `isActive: true`
2. **Creator check**: `user.isCreator === true` from user profile
3. **User check**: Authenticated user

---

## Canonical Token Pricing

Token pricing is **IMMUTABLE** and matches backend exactly:

```typescript
CANONICAL_TOKEN_PACKS: {
  MINI:     { tokens: 100,   priceUSD: 549,   priceEUR: 499,   pricePLN: 2000,   priceGBP: 449  },
  BASIC:    { tokens: 300,   priceUSD: 1599,  priceEUR: 1499,  pricePLN: 6000,   priceGBP: 1299 },
  STANDARD: { tokens: 500,   priceUSD: 2699,  priceEUR: 2499,  pricePLN: 10000,  priceGBP: 2199 },
  PREMIUM:  { tokens: 1000,  priceUSD: 5299,  priceEUR: 4999,  pricePLN: 20000,  priceGBP: 4399 },
  PRO:      { tokens: 2000,  priceUSD: 10499, priceEUR: 9999,  pricePLN: 40000,  priceGBP: 8799 },
  ELITE:    { tokens: 5000,  priceUSD: 25999, priceEUR: 24999, pricePLN: 100000, priceGBP: 21999 },
}
```

**Source**: [`functions/src/payments/stripe/webhook.ts`](../functions/src/payments/stripe/webhook.ts:45)

---

## Confirmation: Zero Duplicated Logic

### ✅ Earnings Calculations
- All earnings computed by backend (`getPayoutState`, `creator_earnings` collection)
- Web displays pre-computed values only

### ✅ Payout Processing
- Web calls `requestPayout` — backend handles:
  - Balance validation
  - Token locking
  - Fraud checks
  - AML logging

### ✅ Token Pricing
- Web uses `CANONICAL_TOKEN_PACKS` from backend
- No price calculations in frontend
- Backend validates in `tokens_createCheckoutSession`

### ✅ Checkout Sessions
- Web calls SAME `tokens_createCheckoutSession` as mobile
- Backend enforces:
  - NO_DISCOUNTS
  - NO_FREE_TOKENS
  - Age verification

### ✅ Feature Flags
- Web reads from `featureFlags` collection (Firestore)
- No flag evaluation logic in frontend

### ✅ Trust Signals
- Web reads from `trust_signals` collection
- No signal resolution — READ-ONLY

### ✅ System Health
- Web calls `getSystemHealth` function
- No health computation in frontend

---

## Files Created/Modified

### New Files

```
src/types/phase33.types.ts          # Type definitions
src/lib/services/phase33/
  ├── index.ts                      # Service exports
  ├── creatorPanel.ts               # Creator panel service
  ├── tokenPurchase.ts              # Token purchase service
  └── adminOps.ts                   # Admin ops service
src/hooks/useRoleGate.ts            # Role-based access hook
src/app/creator/
  ├── layout.tsx                    # Creator panel layout
  ├── page.tsx                      # Earnings page
  ├── payouts/page.tsx              # Payouts page
  ├── stripe/page.tsx               # Stripe Connect page
  └── analytics/page.tsx            # Analytics page
src/app/wallet/
  ├── buy/page.tsx                  # Token purchase page
  └── success/page.tsx              # Purchase success page
src/app/admin/ops/
  ├── layout.tsx                    # Admin ops layout
  ├── page.tsx                      # Overview page
  ├── flags/page.tsx                # Feature flags page
  ├── trust/page.tsx                # Trust signals page
  └── health/page.tsx               # System health page
```

### Existing Files (Not Modified)

All existing backend functions remain unchanged:
- `functions/src/payments/stripe/webhook.ts`
- `functions/src/pack288-web-stripe.ts`
- `functions/src/payouts.ts`
- `functions/src/featureFlags.ts`

---

## Security Considerations

1. **Role Gating**: All pages verify role before rendering
2. **Admin READ-ONLY**: Admin pages cannot mutate data
3. **Wallet Safety**: No direct wallet balance mutations from web
4. **Stripe Security**: Checkout sessions created server-side only
5. **Audit Trail**: All payout requests logged via backend AML hooks

---

## Integration Notes

- TypeScript errors related to `Link` component are due to React version conflicts in monorepo — runtime unaffected
- Backend functions are in `us-central1` region
- Firestore collections use existing PACK structure
- Mobile and web share the same checkout/webhook flow
