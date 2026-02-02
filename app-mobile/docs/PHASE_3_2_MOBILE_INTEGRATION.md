# Phase 3.2 — Mobile App Core Integration (Canonical)

**Generated:** 2026-02-01  
**Status:** Implemented  
**Author:** CTO / AI Integration

---

## Overview

This document defines the canonical mobile app integration with the finalized backend.
All business logic lives in Firebase Functions. The mobile app is a **thin client** that:

1. Reads state from Firestore (subscriptions)
2. Calls backend functions (httpsCallable)
3. Renders UX
4. Opens external URLs (Stripe Checkout)

---

## Hard Rules

| Rule | Description |
|------|-------------|
| NO business logic in app | All validation, calculations, splits happen backend-side |
| Wallet is READ-ONLY | Balance from Firestore subscription, never mutated client-side |
| Transactions are READ-ONLY | Transaction history from Firestore queries |
| Payments via Stripe Checkout | Backend creates session URL, app opens in browser |
| Token spending via backend | `wallet_spendTokens` called internally by business functions |
| No client-side token mutations | Functions like `deductTokens`, `addTokens` are FORBIDDEN in mobile |

---

## Navigation Tree (Canonical)

```
Root (_layout.tsx)
├── (onboarding)/
│   ├── language.tsx
│   └── earn-to-chat-setup.tsx
│
├── (tabs)/                          // Main Tab Navigator
│   ├── home.tsx                     // 🏠 Home / Discovery
│   ├── explore.tsx                  // ✨ Explore People (hidden)
│   ├── swipe.tsx                    // 🔥 Chemistry Matching
│   ├── live.tsx                     // 🎥 Events / Live
│   ├── ai-bots.tsx                  // 🤖 AI Companions
│   ├── questions.tsx                // ❓ Connections
│   ├── profile.tsx                  // 👤 Creator Mode
│   │
│   ├── (hidden tabs - no bar icon)
│   │   ├── wallet.tsx               // Wallet (via TokenBadge)
│   │   ├── discovery.tsx
│   │   ├── calendar.tsx
│   │   ├── payout.tsx
│   │   ├── payout-details.tsx
│   │   ├── dating-preferences.tsx
│   │   └── liked-you.tsx            // VIP feature
│   │
│   └── chat.tsx                     // Chat (via matches)
│
├── wallet/                          // Wallet Stack
│   ├── index.tsx                    // Balance + Token Packs + Transactions
│   └── transactions.tsx             // Full transaction history
│
├── auth/                            // Auth Stack
│   ├── login.tsx
│   ├── register.tsx
│   └── verify.tsx
│
├── chat/                            // Chat Stack
│   ├── [conversationId].tsx
│   └── media/[mediaId].tsx
│
├── profile/                         // Profile Stack
│   ├── [userId].tsx
│   ├── creator-dashboard.tsx
│   ├── creator-analytics.tsx
│   ├── earnings-dashboard.tsx
│   └── safety/
│       └── my-cases.tsx
│
├── legal/                           // Legal Stack
│   ├── accept.tsx
│   ├── terms.tsx
│   ├── privacy.tsx
│   ├── community.tsx
│   └── safety.tsx
│
├── ai/                              // AI Stack
│   ├── [aiCompanionId].tsx
│   ├── chat/[sessionId].tsx
│   └── marketplace.tsx
│
├── settings/                        // Settings Stack
│   ├── index.tsx
│   ├── privacy.tsx
│   ├── notifications.tsx
│   └── payout-setup.tsx
│
└── error/                           // Error Pages
    └── not-found.tsx
```

---

## Screen → Backend Function Mapping

### Authentication

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| auth/login | Firebase Auth | Standard email/password, Google/Apple SSO |
| auth/register | Firebase Auth + `createUserProfile` (trigger) | Creates user doc on signup |
| auth/verify | `sendVerificationEmail` | Email verification |

### Wallet & Payments

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| wallet/index | `wallet_getTokenPacks` (PACK 277) | Get available token packages |
| wallet/index | `tokens_createCheckoutSession` (PACK 288) | Create Stripe Checkout URL |
| wallet/index | Firestore `balances/{uid}/wallet` | READ-ONLY balance subscription |
| wallet/transactions | Firestore `transactions` | READ-ONLY transaction history |

### Chat & Messaging

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| chat/[id] | `sendMessage` (PACK 273) | Send message (auto-spends tokens) |
| chat/[id] | Firestore `chats/{id}/messages` | READ-ONLY message subscription |
| chat/media/[id] | `unlockPaidMedia` (PACK 250) | Unlock paid media (auto-spends) |

### Discovery & Matching

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| (tabs)/home | `getDiscoveryFeed` (PACK 283) | Get discovery profiles |
| (tabs)/swipe | `getSwipeProfiles` (PACK 284) | Get swipe deck |
| (tabs)/swipe | `recordSwipe` (PACK 284) | Record like/skip |

### Creator Features

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| profile/creator-dashboard | `getCreatorDashboard` (PACK 257) | Dashboard stats |
| profile/creator-analytics | `getCreatorAnalytics` (PACK 290) | Analytics data |
| profile/earnings-dashboard | `getEarningsDashboard` (PACK 261) | Earnings data |
| settings/payout-setup | `setupStripeConnect` (PACK 289) | Creator payout setup |

### AI Companions

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| ai/[id] | `getAICompanion` (PACK 48) | Get AI companion details |
| ai/chat/[id] | `sendAIMessage` (PACK 279) | Send to AI (auto-spends) |
| ai/marketplace | `getAIMarketplace` (PACK 331) | AI avatar marketplace |

### Legal & Settings

| Screen | Backend Function | Description |
|--------|------------------|-------------|
| legal/accept | `acceptLegal` (PACK 338a) | Accept legal documents |
| settings/index | `updateSettings` (PACK 171) | Update user settings |
| settings/privacy | `updateConsent` (PACK 171) | Update consent preferences |

---

## Token Flow (Canonical)

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN PURCHASE FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User taps "Buy Tokens" on wallet screen                     │
│                                                                 │
│  2. App calls: tokens_createCheckoutSession(packageId)          │
│     ↓                                                           │
│  3. Backend creates Stripe Checkout Session                     │
│     ↓                                                           │
│  4. Backend returns { checkoutUrl, sessionId }                  │
│     ↓                                                           │
│  5. App opens checkoutUrl in external browser                   │
│     ↓                                                           │
│  6. User completes payment on Stripe                            │
│     ↓                                                           │
│  7. Stripe webhook → stripeWebhookV2                            │
│     ↓                                                           │
│  8. Backend credits tokens to wallet                            │
│     ↓                                                           │
│  9. App receives balance update via Firestore subscription      │
│                                                                 │
│  ⚠️  NO CLIENT-SIDE TOKEN MUTATION AT ANY STEP                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN SPENDING FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User sends message / unlocks media / books call             │
│                                                                 │
│  2. App calls: sendMessage({ chatId, content })                 │
│     ↓                                                           │
│  3. Backend validates user has enough tokens                    │
│     ↓                                                           │
│  4. Backend calls spendTokens() internally                      │
│     ↓                                                           │
│  5. Backend records transaction                                 │
│     ↓                                                           │
│  6. Backend credits creator (minus Avalo fee)                   │
│     ↓                                                           │
│  7. Backend returns { success, newBalance }                     │
│     ↓                                                           │
│  8. App receives balance update via Firestore subscription      │
│                                                                 │
│  ⚠️  APP NEVER CALLS spendTokens() DIRECTLY                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Firestore Collections (READ-ONLY from App)

| Collection | Usage | App Access |
|------------|-------|------------|
| `users/{uid}` | User profile | Read + Listen |
| `users/{uid}/wallet` | Wallet balance (some screens) | Read + Listen |
| `balances/{uid}/wallet` | Wallet balance (primary) | Read + Listen |
| `transactions` | Transaction history | Read only |
| `chats/{chatId}` | Chat metadata | Read + Listen |
| `chats/{chatId}/messages` | Messages | Read + Listen |
| `legalAcceptance/{uid}` | Legal acceptance status | Read + Listen |
| `tokenPacks` | Available packages | Read only |

---

## Backend Functions Used by Mobile

### PACK 277 — Wallet Service
- `wallet_getTokenPacks` - Get token packages
- `wallet_getBalance` - Get balance (via Firestore preferred)
- `wallet_spendTokens` - Spend tokens (internal only)
- `wallet_verifyIAPReceipt` - Verify iOS/Android IAP

### PACK 288 — Stripe Checkout
- `tokens_createCheckoutSession` - Create Stripe session
- `stripeWebhookV2` - Handle Stripe webhooks (HTTP, not callable)

### PACK 273 — Chat Engine
- `sendMessage` - Send chat message (auto-spends tokens)
- `initiateChat` - Start new conversation

### PACK 283 — Discovery
- `getDiscoveryFeed` - Get discovery profiles
- `getDiscoveryFilters` - Get filter options

### PACK 284 — Swipe Engine
- `getSwipeProfiles` - Get swipe deck
- `recordSwipe` - Record swipe action

### PACK 257 — Creator Dashboard
- `getCreatorDashboard` - Dashboard stats
- `getEarningsOverview` - Earnings overview

### PACK 171 — Settings
- `updateSettings` - Update settings
- `updateConsent` - Update consent

---

## Files Modified/Created

### Created
- `avalo/app-mobile/services/walletApi.ts` — Canonical wallet API (read-only)
- `avalo/app-mobile/hooks/useWallet.ts` — Wallet hook
- `avalo/app-mobile/app/wallet/index.tsx` — Wallet screen (canonical)
- `avalo/app-mobile/docs/PHASE_3_2_MOBILE_INTEGRATION.md` — This document

### Deprecated (DO NOT USE)
- `avalo/app-mobile/services/tokenService.ts` — Contains client-side mutations ⚠️
- `avalo/app-mobile/services/stripeService.ts` — Contains mock purchases ⚠️
- `avalo/app-mobile/app/(tabs)/wallet.tsx` — Old wallet with mutations ⚠️

---

## Migration Notes

### Old Code (FORBIDDEN)
```typescript
// ❌ DO NOT USE - Client-side token mutation
import { deductTokens, addTokens } from '@/services/tokenService';
await deductTokens(userId, 10);
await addTokens(userId, 100);
```

### New Code (CANONICAL)
```typescript
// ✅ USE THIS - Read-only with backend calls
import { useWallet } from '@/hooks/useWallet';

const { balance, purchaseTokens, hasTokens } = useWallet();

// Check balance (read-only)
if (hasTokens(10)) {
  // User can afford action
}

// Purchase tokens (opens Stripe Checkout via backend)
await purchaseTokens('standard');

// Token spending happens automatically via backend when calling
// business functions like sendMessage, unlockMedia, etc.
```

---

## Earn-to-Chat Gating

Earn-to-Chat is handled by backend:

1. User enables Earn-to-Chat in onboarding
2. Backend stores `modes.earnFromChat: true` in user profile
3. When someone messages this user, backend checks the flag
4. If enabled, sender's tokens are deducted, creator earns 80%
5. App only reads and displays the state

```typescript
// Earn-to-Chat toggle (calls backend)
import { httpsCallable } from 'firebase/functions';

const toggleEarnToChat = httpsCallable(functions, 'updateSettings');
await toggleEarnToChat({ 'modes.earnFromChat': enabled });
```

---

## Confirmation

✅ No token mutations client-side  
✅ Wallet balance is read-only subscription  
✅ Transactions are read-only queries  
✅ Token purchases go through Stripe Checkout URL  
✅ Token spending handled by backend functions  
✅ Navigation follows canonical tree  
✅ Every screen maps to backend capability  
✅ No business logic duplicated in app  

---

## Missing Backend Calls (None Critical)

All required backend functions exist:
- PACK 277 — Wallet operations ✅
- PACK 288 — Stripe Checkout ✅
- PACK 273 — Chat with tokenomics ✅
- PACK 283/284 — Discovery ✅
- PACK 171 — Settings ✅

No missing backend calls identified.
