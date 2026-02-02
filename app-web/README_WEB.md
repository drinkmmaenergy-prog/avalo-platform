# Avalo Web Application

**PHASE 5.1 — Web Foundation (Production-Ready)**

## Overview

This is the production-ready web foundation for Avalo, designed to serve as:

1. **Stripe Checkout Surface** — Token purchases redirect to Stripe Checkout
2. **App → Web Redirect Target** — Mobile app can redirect users for payment
3. **Legal Document Host** — Terms, Privacy, Creator Agreement

**IMPORTANT:** This is **NOT** a marketing site. This is infrastructure UI.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14+ | Framework (App Router) |
| React | 18.2 | UI Library |
| TypeScript | 5.3+ | Type Safety (strict mode) |
| Tailwind CSS | 3.4+ | Styling |
| Firebase | 10.7+ | Auth (client read-only) |
| Stripe.js | 2.4+ | Checkout redirect |

## Architecture

### Key Rules

```
✅ Web ONLY redirects to Stripe Checkout
✅ Backend (Firebase Functions) handles ALL business logic
✅ Token packs are DISPLAY-ONLY (from CANONICAL_TOKEN_PACKS)
✅ No pricing logic on client
✅ No wallet mutations on client
✅ No Stripe secrets on client
```

### Flow: Direct Web Purchase

```
User → /wallet/buy → Select Pack → Backend creates Stripe session → Redirect to Stripe → Success webhook → Tokens credited
```

### Flow: App → Web Redirect

```
Mobile App → /wallet/buy?source=app&userId=UID → Select Pack → Backend re-verifies auth → Stripe Checkout → Success
```

**Note:** The `userId` parameter is NOT trusted by web. Backend re-verifies authentication.

## Project Structure

```
app-web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing page
│   │   ├── wallet/
│   │   │   ├── buy/page.tsx    # Token purchase page
│   │   │   └── success/page.tsx # Stripe success redirect
│   │   └── legal/
│   │       ├── terms/page.tsx
│   │       ├── privacy/page.tsx
│   │       └── creator-agreement/page.tsx
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── TokenPackCard.tsx
│   │   └── CreatorAgreementGate.tsx
│   ├── lib/
│   │   ├── firebase.ts         # Firebase client init
│   │   ├── stripeClient.ts     # Stripe.js loader
│   │   └── api/
│   │       └── tokens.ts       # Token API calls
│   └── styles/
│       └── globals.css
├── public/
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
└── package.json
```

## Environment Variables

These must be configured in Vercel (or `.env.local` for development):

```env
# Required
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_FUNCTIONS_BASE_URL=

# Optional
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

**DO NOT** add any secret keys to these variables. All secrets stay in Firebase Functions.

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Type check
pnpm type-check

# Build for production
pnpm build
```

## Deployment to Vercel

### 1. Connect Repository

Link the repository to Vercel via the dashboard or CLI.

### 2. Configure Build Settings

| Setting | Value |
|---------|-------|
| Framework Preset | Next.js |
| Root Directory | `avalo/app-web` |
| Build Command | `pnpm build` |
| Output Directory | `.next` |
| Install Command | `pnpm install` |

### 3. Set Environment Variables

Add all `NEXT_PUBLIC_*` variables in Vercel Project Settings → Environment Variables.

### 4. Deploy

```bash
# From repository root
cd avalo/app-web
vercel --prod
```

Or trigger via Git push to connected branch.

## Backend Integration

### Firebase Function: `tokens_createCheckoutSession`

Called when user selects a token pack. Backend:

1. Validates user authentication
2. Validates age (18+)
3. Validates package ID against `CANONICAL_TOKEN_PACKS`
4. Creates Stripe Checkout session
5. Returns `{ success: true, checkoutUrl: "..." }`

### Webhook: Token Crediting

After successful Stripe payment, webhook (`stripe_handleWebhook`) credits tokens to user wallet.

**Web never touches wallets directly.**

## Token Packs (CANONICAL)

These are immutable. Any changes require backend migration.

| Pack ID | Tokens | USD | EUR | PLN | GBP |
|---------|--------|-----|-----|-----|-----|
| MINI | 100 | $5.49 | €4.99 | 20 PLN | £4.49 |
| BASIC | 300 | $15.99 | €14.99 | 60 PLN | £12.99 |
| STANDARD | 500 | $26.99 | €24.99 | 100 PLN | £21.99 |
| PREMIUM | 1,000 | $52.99 | €49.99 | 200 PLN | £43.99 |
| PRO | 2,000 | $104.99 | €99.99 | 400 PLN | £87.99 |
| ELITE | 5,000 | $259.99 | €249.99 | 1000 PLN | £219.99 |

## Legal Pages

All legal pages are accessible at:

- `/legal/terms` — Terms of Service
- `/legal/privacy` — Privacy Policy  
- `/legal/creator-agreement` — Creator Agreement (B2B)

Footer links must always be visible.

## Hard Prohibitions

```
❌ No pricing logic
❌ No token math
❌ No revenue split logic
❌ No wallet mutations
❌ No Stripe secret usage
❌ No Firebase Admin SDK
❌ No experimental flags
❌ No ts-ignore / any casts
```

## Next Phases

- **PHASE 5.2** — Stripe Checkout E2E Testing
- **PHASE 5.3** — App → Web Redirect Finalization

---

**Version:** PHASE 5.1  
**Last Updated:** February 2026  
**Status:** Production-Ready Foundation
