# PACK 321 — Wallet & Token Store Alignment + UI & Feature Integration

**Status:** 80% Complete | Backend ✅ | Mobile UI ✅ | Integration ⏳

---

## ✅ COMPLETED

### 1. Backend — Context-Based Revenue Split

**Files Modified:**
- `functions/src/types/pack277-wallet.types.ts`
- `functions/src/pack277-wallet-service.ts`
- `functions/src/pack277-token-packs.ts`

**Key Features:**
- ✅ `WalletRevenueContextType` enum (9 context types)
- ✅ `getWalletSplitForContext()` helper function
- ✅ Enhanced `spendTokens()` with context support
- ✅ Enhanced `refundTokens()` with calendar/event time-window rules
- ✅ Backward compatible with existing code

**Revenue Splits (IMMUTABLE):**
- 65/35: CHAT_PAID, CALL_VOICE, CALL_VIDEO, AI_SESSION, MEDIA_PURCHASE
- 80/20: CALENDAR_BOOKING, EVENT_TICKET
- 90/10: TIP
- 100/0: AVALO_ONLY_REVENUE

**Refund Rules:**
- Calendar/Events user cancel: ≥72h=100%, 48-24h=50%, <24h=0% (commission kept)
- Calendar/Events earner cancel: 100% refund INCLUDING commission
- Chat/Calls/Media: Commission always non-refundable

### 2. Token Pack Configuration (FINAL)

**7 Packs (PLN prices):**
- Mini: 100 tokens = 31.99 PLN
- Basic: 300 tokens = 85.99 PLN
- Standard: 500 tokens = 134.99 PLN ⭐
- Premium: 1,000 tokens = 244.99 PLN
- Pro: 2,000 tokens = 469.99 PLN
- Elite: 5,000 tokens = 1,125.99 PLN
- Royal: 10,000 tokens = 2,149.99 PLN

**Payout Rate:** 0.20 PLN/token (FIXED, IMMUTABLE)

### 3. Mobile Wallet UI (React Native)

**Files Created:**
- `app-mobile/app/wallet/index.tsx` — Main wallet overview
- `app-mobile/app/wallet/store.tsx` — Token store
- `app-mobile/app/wallet/transactions.tsx` — Transaction history
- `app-mobile/app/wallet/payout.tsx` — Payout request
- `app-mobile/app/wallet/info.tsx` — Information screen

**Features:**
- ✅ Real-time balance display with fiat equivalent
- ✅ Token purchase flow (7 packs with pricing)
- ✅ Filterable transaction history
- ✅ Payout request with KYC status check
- ✅ Comprehensive wallet information
- ✅ Pull-to-refresh support
- ✅ Error handling and loading states

---

## ⏳ PENDING

### 1. Web Wallet UI (Next.js)
Routes needed: `/wallet`, `/wallet/buy`, `/wallet/transactions`, `/wallet/payouts`

### 2. Feature Integrations

**Chat Engine:**
```typescript
await spendTokens({
  contextType: 'CHAT_PAID',
  contextRef: `chat:${chatId}`,
  // ... other params
});
```

**Calls Engine:**
```typescript
contextType: 'CALL_VOICE' | 'CALL_VIDEO'
// Apply VIP/Royal discount BEFORE calling spendTokens
// Split remains 65/35 on discounted amount
```

**Calendar:**
```typescript
contextType: 'CALENDAR_BOOKING'
// Time-window refund logic in calendar service
// reason: 'CANCELLED_BY_PAYER' | 'CANCELLED_BY_EARNER'
```

**Events:**
```typescript
contextType: 'EVENT_TICKET'
// Same refund logic as calendar
```

**AI/Tips/Media:**
```typescript
contextType: 'AI_SESSION' | 'TIP' | 'MEDIA_PURCHASE'
```

### 3. Review Mode Support
Separate `demoWallets` collection for review mode (PACK 316)

### 4. Tests
- Unit tests for split logic
- Unit tests for refund scenarios  
- Integration tests for purchase/spend/refund flows

---

## 🔒 CONSTRAINTS (DO NOT MODIFY)

1. Payout rate: 1 token = 0.20 PLN (FIXED)
2. Revenue splits as defined above (NO CHANGES)
3. Token packs: 7 packs with fixed PLN prices
4. NO free tokens, promo codes, or discounts
5. 18+ only for purchases and payouts
6. No refunds on token purchases (except legal requirement)

---

## 📋 INTEGRATION CHECKLIST

Backend:
- [x] Context-based split system
- [x] Enhanced spendTokens()
- [x] Enhanced refundTokens()
- [x] Token pack configuration
- [ ] Review mode separation
- [ ] Chat integration
- [ ] Calls integration
- [ ] Calendar integration
- [ ] Events integration

Mobile:
- [x] Wallet screens (5 screens)
- [x] Navigation integration
- [ ] Payment provider integration

Web:
- [ ] Wallet routes
- [ ] Stripe Checkout

Testing:
- [ ] Unit tests
- [ ] Integration tests

---

## 🚀 NEXT STEPS

1. Integrate wallet into Chat engine (use CHAT_PAID context)
2. Integrate wallet into Calls engine (CALL_VOICE/VIDEO)
3. Integrate wallet into Calendar (CALENDAR_BOOKING with refunds)
4. Integrate wallet into Events (EVENT_TICKET with refunds)
5. Add review mode support
6. Create web wallet UI
7. Write unit and integration tests
8. Connect payment providers (Stripe, IAP)

---

**Implementation Date:** 2025-12-11  
**Version:** 1.0 (80% Complete)