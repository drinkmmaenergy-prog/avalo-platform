# Avalo Web — Wallet & Monetization Implementation

## Overview

Production-ready web monetization surface and wallet UX for the Avalo platform, including real payout preview for creators/users.

## Non-Negotiable Invariants

- **1 chat = 100 tokens**
- **Split: reference-only creator payout example / platform reference portion** (fixed)
- **PAYOUT_PER_TOKEN_USD = 0.03** (from backend)
- Burn logic, pack prices, VAT/Stripe/treasury rules are NOT modified

## Files Created / Modified

### New Files

| File | Purpose |
|------|---------|
| `src/lib/firebase.ts` | Firebase client SDK initialization (singleton) |
| `src/lib/sdk.ts` | User profile SDK (getUserProfile, signOut) |
| `src/lib/firebase-admin.ts` | Firebase Admin SDK for API routes (server-only) |
| `src/lib/stripe-server.ts` | Stripe server-side initialization (server-only) |
| `src/lib/economyConfig.ts` | Economy constants (PAYOUT_PER_TOKEN_USD, FX rates, shares) |
| `src/lib/services/phase33.ts` | Token pack utilities + creator earnings service |
| `src/lib/api/tokens.ts` | Client-side Stripe checkout session API |
| `src/app/api/stripe/checkout/route.ts` | **Stripe Checkout session creation (server)** |
| `src/app/api/stripe/webhook/route.ts` | **Stripe webhook handler (signature verification + idempotency)** |
| `src/app/wallet/history/page.tsx` | Purchase history table page |
| `src/components/wallet/PayoutPreview.tsx` | **Real Payout Preview component** |
| `src/components/LanguageSwitcher.tsx` | Language switcher dropdown (42 locales) |
| `src/i18n/config.ts` | i18n configuration (42 supported locales) |
| `src/i18n/request.ts` | Locale detection and message loading |
| `src/i18n/messages/en.json` | English message strings |
| `src/app/legal/terms/page.tsx` | Terms of Service (production wording, 18+ notice) |
| `src/app/legal/privacy/page.tsx` | Privacy Policy (GDPR-compliant, 18+ notice) |
| `src/app/legal/refund/page.tsx` | Refund Policy (EU consumer rights) |
| `src/app/legal/cookies/page.tsx` | Cookie Policy (ePrivacy compliant) |

### Modified Files

| File | Change |
|------|--------|
| `src/app/wallet/page.tsx` | Rewritten: real Firestore balance, creator earnings, real-time listeners |
| `src/components/Header.tsx` | Added LanguageSwitcher import and placement |
| `src/components/Footer.tsx` | Added Refund Policy and Cookie Policy links |
| `package.json` | Added `stripe`, `firebase-admin`, `next-intl` dependencies |
| `.env.example` | Added `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT_KEY` |

### Existing Files Not Modified (preserved as-is)

| File | Status |
|------|--------|
| `src/app/wallet/layout.tsx` | Auth guard layout — unchanged |
| `src/app/wallet/buy/page.tsx` | Existing buy page — unchanged |
| `src/app/wallet/success/page.tsx` | Existing success page — unchanged |
| `src/components/TokenPackCard.tsx` | Existing card component — unchanged |
| `src/types/phase33.types.ts` | Existing types — unchanged |
| `hooks/useWallet.ts` | Existing hook — unchanged |

## Required Environment Variables for Vercel

```env
# Firebase Client (already configured)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_URL=...
NEXT_PUBLIC_APP_URL=...

# Stripe (NEW — server-side, NOT NEXT_PUBLIC_)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxx

# Firebase Admin (NEW — server-side)
# Option A: Full JSON string
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"avalo-c8c46",...}
# Option B: Set GOOGLE_APPLICATION_CREDENTIALS in Vercel settings
```

### Stripe Dashboard Setup

1. Create a Webhook endpoint in Stripe Dashboard: `https://your-domain.com/api/stripe/webhook`
2. Subscribe to event: `checkout.session.completed`
3. Copy the Webhook signing secret → `STRIPE_WEBHOOK_SECRET`

## Payout Preview Component

Located at: `src/components/wallet/PayoutPreview.tsx`

**Usage:**
```tsx
import PayoutPreview from '@/components/wallet/PayoutPreview';

// In any creator pricing UI:
<PayoutPreview defaultTokens={500} showPlatformShare={true} />
```

**Example calculation:**
- Input: 500 tokens
- Rate: 500 × $0.03 = **$15.00 USD** (creator reference payout)
- platform reference portion: $15.00 × (35/65) = **$8.08 USD**
- If EUR selected: $15.00 × 0.92 = **€13.80 EUR** (internal FX rate)

## i18n Scaffold

- **42 languages ready** — locale codes in `src/i18n/config.ts`
- **English messages** in `src/i18n/messages/en.json`
- **To add a language:** Create `src/i18n/messages/{locale}.json` (copy en.json as template)
- **Language switcher** in Header (stores preference in cookie)
- **No code changes needed** to support new languages

## Minimal Test Plan

### Prerequisites
- Stripe test mode keys configured
- Firebase emulators or staging project running
- User account created and logged in

### Test Flow

1. **Login** → Navigate to `/auth/login` → Sign in with test credentials
2. **Wallet Hub** → Navigate to `/wallet`
   - ✅ Token balance displays (reads from Firestore `users/{uid}.tokenBalance`)
   - ✅ "Buy Tokens" and "Purchase History" links present
   - ✅ Creator earnings section appears if `user.isCreator === true`
3. **Buy Tokens** → Navigate to `/wallet/buy`
   - ✅ Token packs display with correct pricing (from CANONICAL_TOKEN_PACKS)
   - ✅ Currency selector works (USD/EUR/PLN/GBP)
   - ✅ Click "Buy Now" → redirects to Stripe Checkout
4. **Stripe Checkout** → Complete purchase with Stripe test card `4242424242424242`
   - ✅ Redirects to `/wallet/success?session_id=...`
5. **Webhook Credits** → Stripe sends `checkout.session.completed` webhook
   - ✅ `/api/stripe/webhook` receives event
   - ✅ Signature verified
   - ✅ Purchase record written to Firestore `purchases/{sessionId}`
   - ✅ Token balance incremented in Firestore `users/{uid}.tokenBalance`
   - ✅ Transaction record written to `token_transactions`
   - ✅ Idempotency: duplicate webhook calls don't double-credit
6. **Wallet Balance Updates** → Navigate back to `/wallet`
   - ✅ Token balance reflects new purchase (real-time via onSnapshot)
7. **History Shows Record** → Navigate to `/wallet/history`
   - ✅ Purchase appears in table with correct pack, tokens, amount, status
8. **Payout Preview Works** → Use PayoutPreview component
   - ✅ Enter 500 tokens → shows $15.00 USD
   - ✅ Switch to EUR → shows ≈ €13.80 EUR
   - ✅ Platform share line shows correctly
9. **Legal Pages** → Navigate to each:
   - ✅ `/legal/terms` — production wording, 18+ notice
   - ✅ `/legal/privacy` — GDPR compliant, 18+ notice
   - ✅ `/legal/refund` — EU consumer rights, 18+ notice
   - ✅ `/legal/cookies` — ePrivacy compliant
10. **Language Switcher** → Click language dropdown in Header
    - ✅ Shows 42 language options
    - ✅ Selection persists via cookie
    - ✅ Falls back to English for untranslated locales

### Security Checks
- ✅ Checkout API validates packId server-side (reject invalid packs)
- ✅ Checkout API verifies Firebase ID token
- ✅ Webhook verifies Stripe signature
- ✅ Webhook is idempotent (no double-crediting)
- ✅ Client never sends amounts
- ✅ Legal pages include 18+ age restriction notices

