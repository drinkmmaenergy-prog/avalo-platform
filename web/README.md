# Avalo Web v1

Complete web application for Avalo platform featuring token purchases, VIP/Royal subscriptions, and creator content store.

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Firebase project (shared with mobile app)
- Stripe account

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev

# Access at http://localhost:3000
```

## Environment Setup

### Required Environment Variables

Create `.env.local` file:

```bash
# Firebase Configuration (from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=avalo-c8c46.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=avalo-c8c46
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=avalo-c8c46.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Stripe Configuration (from Stripe Dashboard)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=https://europe-west3-avalo-c8c46.cloudfunctions.net

# Firebase Admin (for API routes)
FIREBASE_ADMIN_PROJECT_ID=avalo-c8c46
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email
FIREBASE_ADMIN_PRIVATE_KEY="your_private_key_with_newlines"
```

### Getting Credentials

#### Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Project Settings → General → Web apps
4. Copy configuration values

#### Stripe
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Developers → API keys
3. Copy publishable and secret keys
4. Create webhook endpoint for webhook secret

#### Firebase Admin
1. Firebase Console → Project Settings
2. Service Accounts → Generate new private key
3. Download JSON file
4. Extract projectId, client_email, and private_key

## Features

### 1. Token Wallet (`/wallet`)
- View real-time token balance
- Purchase token packages via Stripe
- Transaction history
- Success confirmation page

### 2. Subscriptions (`/subscriptions`)
- VIP membership ($19.99/month)
- Royal membership ($49.99/month)
- Manage subscription via Stripe portal
- Real-time tier updates

### 3. Creator Store (`/creator/[uid]/store`)
- Browse creator content
- 18+ age gate for NSFW content
- Token-based content unlocking
- Purchase history
- Revenue split (70% creator / 30% platform)

## Project Structure

```
web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Landing page
│   ├── globals.css        # Global styles
│   ├── wallet/            # Token purchase
│   ├── subscriptions/     # VIP/Royal tiers
│   ├── creator/          # Creator stores
│   └── api/              # API routes
├── lib/                   # Utilities
│   ├── firebase.ts       # Firebase client
│   ├── firebase-admin.ts # Firebase admin
│   ├── stripe.ts         # Stripe config
│   └── types.ts          # TypeScript types
├── public/               # Static assets
└── .env.local           # Environment variables
```

## Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Tailwind CSS for styling
- Component-driven architecture

## Deployment

### Firebase Hosting

1. **Build the app:**
```bash
npm run build
```

2. **Deploy to Firebase:**
```bash
firebase deploy --only hosting:web
```

3. **Configure Stripe webhook:**
- Webhook URL: `https://europe-west3-avalo-c8c46.cloudfunctions.net/stripeWebhook`
- Events to listen:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

### Environment Variables in Production

Set in Firebase Hosting:
```bash
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  stripe.webhook_secret="whsec_..." \
  admin.project_id="avalo-c8c46" \
  admin.client_email="..." \
  admin.private_key="..."
```

## API Routes

### `/api/checkout/create-session`
Create Stripe checkout session for token purchase
- Method: POST
- Auth: Required (Bearer token)
- Body: `{ packageId: string }`

### `/api/subscriptions/create-session`
Create subscription checkout session
- Method: POST
- Auth: Required
- Body: `{ tierId: string }`

### `/api/subscriptions/portal-session`
Create customer portal session
- Method: POST
- Auth: Required
- Body: `{}`

### `/api/auth/verify-token`
Verify Firebase ID token
- Method: POST
- Body: `{ idToken: string }`

## Cloud Functions

### New Functions (webOperations.ts)

#### `purchaseContent`
Purchase creator content with tokens
```typescript
Input: { contentId: string }
Output: { contentId: string, unlocked: boolean }
```

#### `updateAge18Plus`
Update user's 18+ verification
```typescript
Input: { age18Plus: boolean }
Output: { updated: boolean }
```

#### `getUserContentPurchases`
Get user's content purchases
```typescript
Input: {}
Output: { purchases: Purchase[] }
```

Deploy:
```bash
firebase deploy --only functions:purchaseContent,functions:updateAge18Plus,functions:getUserContentPurchases
```

## Integration with Mobile

### Shared Resources
- ✅ Firebase Authentication (same project)
- ✅ Cloud Firestore (same collections)
- ✅ User wallets and balances
- ✅ Subscription tiers
- ✅ Transaction history

### Deep Linking
Mobile app can open web pages:
```typescript
// From mobile app
Linking.openURL('https://avalo.com/wallet');
Linking.openURL('https://avalo.com/subscriptions');
Linking.openURL('https://avalo.com/creator/[uid]/store');
```

## Security

### Authentication
- Firebase ID token on every API call
- Automatic token refresh
- Server-side token verification

### Payments
- No Stripe secrets in frontend
- Server-side Stripe operations
- Webhook signature verification
- Idempotent transaction processing

### Content Protection
- 18+ age verification
- Purchase validation
- Content URL hiding
- Thumbnail blur for locked content

## Testing

### Manual Testing

```bash
# 1. Run development server
npm run dev

# 2. Test wallet flow
- Navigate to /wallet
- Select token package
- Complete test payment
- Verify balance update

# 3. Test subscriptions
- Navigate to /subscriptions
- Subscribe to VIP
- Verify tier update
- Test portal access

# 4. Test creator store
- Navigate to /creator/[uid]/store
- Trigger age gate
- Purchase content
- Verify unlock
```

### Stripe Test Cards
```
Success: 4242 4242 4242 4242
Declined: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155
```

## Troubleshooting

### Issue: "Failed to create checkout session"
**Solution**: Check Stripe API keys in `.env.local`

### Issue: "Webhook not processing"
**Solution**: 
1. Verify webhook secret
2. Check Firebase Functions logs
3. Ensure webhook endpoint is correct

### Issue: "Token balance not updating"
**Solution**: 
1. Check Stripe webhook is configured
2. Verify webhook signature
3. Check Firestore permissions

### Issue: "18+ gate not showing"
**Solution**:
1. Verify content has `isNSFW: true`
2. Check user profile `age18Plus` flag
3. Clear browser cache

## Monitoring

### Firebase Console
- Authentication users
- Firestore data
- Functions logs
- Performance metrics

### Stripe Dashboard
- Payment activity
- Subscription status
- Webhook events
- Revenue analytics

## Support

For issues or questions:
1. Check documentation: `PHASE_10_WEB_IMPLEMENTATION_SUMMARY.md`
2. Review Firebase logs
3. Check Stripe dashboard
4. Verify environment variables

## License

Proprietary - Avalo Platform

---

**Version**: 1.0.0
**Last Updated**: 2025-01-20
