# Avalo - Social Dating Platform

**Version:** 1.0.0
**Firebase Project:** avalo-c8c46
**Status:** Phase 6 Complete (AI Companions Ready)

## Overview

Avalo is a social dating platform combining features from Tinder, Instagram, and OnlyFans with an **Earn-to-Chat** model. The platform uses a token-based economy with strict safety, legal compliance, and quality focus.

## Tech Stack

### Mobile (React Native + Expo)
- **Framework:** Expo SDK 54
- **Language:** TypeScript
- **Router:** Expo Router 6
- **State Management:** Zustand
- **Navigation:** React Navigation 7

### Backend (Firebase)
- **Auth:** Firebase Authentication
- **Database:** Cloud Firestore
- **Functions:** Cloud Functions (Node 20)
- **Storage:** Firebase Storage
- **Hosting:** Firebase Hosting
- **Region:** europe-west3

### Web (Planned - Next.js 14)
- Token wallet and checkout
- Creator dashboard
- Admin panel with RBAC
- Subscription management

## Current Status

### ✅ Phase 1: Foundation Setup (COMPLETE)

The following infrastructure files have been created:

1. **`.env`** - Firebase credentials configured for project `avalo-c8c46`
2. **`firestore.rules`** - Security rules with:
   - User authentication and ownership checks
   - 18+ verification requirements for paid features
   - Participant-based chat access
   - Admin and moderator role checks
   - Comprehensive collection protection

3. **`firestore.indexes.json`** - Composite indexes for:
   - Chat queries by participants and status
   - Transaction filtering by user and type
   - Calendar bookings by creator/booker
   - User discovery and matching
   - Feed posts and moderation flags

4. **`storage.rules`** - Media security for:
   - User profile photos (10MB limit)
   - Video/voice intros (50MB/5MB limits)
   - Verification selfies (write-once, admin-readable)
   - Chat media (20MB limit, verified users only)
   - AI-generated content (server-side only)
   - Calendar verification photos

5. **`firebase.json`** - Complete Firebase configuration:
   - Firestore rules and indexes
   - Storage rules
   - Functions (Node 20 runtime)
   - Hosting with rewrites
   - Emulator suite configuration

6. **`tsconfig.json`** - TypeScript configuration with:
   - Expo base config
   - Path aliases (@/, @components/, @lib/, etc.)
   - Strict mode enabled

7. **`babel.config.js`** - Babel configuration with:
   - Expo preset
   - Expo Router support
   - Reanimated plugin
   - Module resolver for absolute imports
   - Environment variable support

8. **`app.json`** - Expo app configuration:
   - iOS and Android builds
   - Deep linking (avalo:// scheme)
   - Universal links (avalo.app/ul/*)
   - Required permissions (camera, location, microphone)
   - App store metadata

9. **`eas.json`** - EAS Build configuration for development, preview, and production builds

10. **`public/index.html`** - Landing page placeholder

11. **`.gitignore`** - Comprehensive ignore rules for all environments

## Firebase Project Configuration

- **Project ID:** avalo-c8c46
- **Project Number:** 445933516064
- **Region:** europe-west3
- **Auth Domain:** avalo-c8c46.firebaseapp.com
- **Storage Bucket:** avalo-c8c46.firebasestorage.app

## Key Features (Planned)

### Token Economy
- Settlement rate: **1 token = 0.20 PLN**
- Purchase packages (web only):
  - Starter: 100 tokens @ 30 PLN
  - Value: 500 tokens @ 125 PLN
  - Pro: 1000 tokens @ 230 PLN
  - Elite: 5000 tokens @ 1000 PLN

### Chat System
- 3 free messages per user per chat
- 100 token deposit: 35% platform fee (non-refundable), 65% escrow
- Word-to-token: 11 words/token (standard), 7 words/token (Royal earners)
- 48h inactivity auto-refund
- Royal queue bypass for priority messaging

### Calendar Bookings
- Legal, social-only meetings (coffee, dinner, public activities)
- 20% platform fee (non-refundable) + 80% escrow
- GPS/QR/selfie verification
- Strict refund policies
- Strong legal safeguards against escorting/sex work

### Royal Club
- Auto-granted: 1000+ Instagram followers OR 20,000 tokens/month
- Benefits: Unlimited swipes, queue bypass, 7 words/token when earning
- Maintained with Quality Score > 70

## Next Steps

### ✅ Phase 2: Firebase Functions (Backend) - COMPLETE
- [x] Create functions structure (init, config, types)
- [x] Implement chat callables (start, message, close, refund)
- [x] Implement calendar callables (book, confirm, verify, cancel)
- [x] Add payment webhooks (Stripe)
- [x] Add CRON jobs (chat expiry, calendar sweep, Royal eligibility)
- [x] Add moderation system

**Backend Features:**
- 9 source files with full TypeScript implementation
- 13+ callable functions for client-server communication
- Stripe webhook integration for payments
- 3 scheduled CRON jobs for automation
- Complete business logic for chat roles and billing
- Calendar booking with compliance safeguards
- Content moderation with banned terms detection

### ✅ Phase 3: Mobile App Scaffold - COMPLETE
- [x] Create app/ folder structure
- [x] Implement core lib utilities (firebase, auth, types)
- [x] Create Zustand stores (auth, wallet)
- [x] Build reusable UI components (Button, Input)
- [x] Build auth flow (login, register)
- [x] Create tab navigation with 5 screens

**Mobile Features:**
- 17 TypeScript files with full React Native + Expo implementation
- Firebase SDK integration with offline persistence
- Authentication system with email/password
- Zustand state management for auth and wallet
- Real-time wallet balance subscription
- Tab navigation: Home, Discovery, Chat, Wallet, Profile
- Responsive UI with styled components

### ✅ Phase 4: Chat System - COMPLETE
- [x] Chat infrastructure (API layer, helpers, state management)
- [x] Chat UI components (ChatListItem, MessageBubble, DepositModal)
- [x] Chat list screen with real-time updates
- [x] Chat room screen with full messaging interface
- [x] Token billing system with word counting
- [x] Free message tracking (3 per user)
- [x] Deposit flow with escrow management
- [x] Royal earner advantage (7 vs 11 words/token)

**Chat Features:**
- 8 TypeScript files with complete chat implementation
- Real-time messaging with Firestore subscriptions
- Token-based billing with free message allowance
- Professional UI with message bubbles and avatars
- Deposit modal with fee breakdown (35% platform, 65% escrow)
- Word counter and token calculator
- Balance validation and insufficient funds handling
- Auto-scroll, pull-to-refresh, empty states

### 🎯 Phase 4: Remaining Features (Optional)
- [ ] Discovery/matching with swipe
- [ ] Calendar booking interface
- [ ] Profile editing with photo upload

### ✅ Phase 5: Web App (Next.js) - COMPLETE
- [x] Next.js 14 app structure with TypeScript
- [x] SSO authentication with Firebase ID token handoff
- [x] Token purchase flow with Stripe checkout
- [x] Wallet page with package selection and real-time balance
- [x] Creator dashboard with earnings stats
- [x] Admin panel with moderation and user management
- [x] Transaction history with filtering and export
- [x] Checkout success page with auto-redirect

**Web Features:**
- 18 TypeScript files with complete Next.js implementation
- Tailwind CSS for responsive design
- Stripe integration for secure payments
- Firebase Admin SDK for server-side operations
- Real-time data sync with Firestore
- Role-based access control (RBAC)
- SSO from mobile app via ID token
- CSV export for transactions

### ✅ Phase 6: AI Companions - COMPLETE
- [x] Enhanced seed script to generate 200 diverse AI profiles (75% female, 25% male)
- [x] Subscription-based access (Free, Plus, Intimate, Creator tiers)
- [x] AI Chat UI with real-time messaging
- [x] Photo unlock system with token-based purchases
- [x] Intro/onboarding screens explaining tiers
- [x] Anti-abuse measures (rate limiting, moderation flags)
- [x] Gallery management library for client-side unlocks

**AI Companions Features:**
- 200 diverse AI profiles with varied ethnicities, personalities, and languages
- Subscription tiers:
  - **Free:** 10 messages/day, 3 AI companions, SFW only
  - **Plus:** Unlimited messages (PLN 39/month), all standard AIs, 2 tokens/photo
  - **Intimate:** NSFW access (PLN 79/month), romantic conversations, 3 tokens/photo
  - **Creator:** Create custom AIs (PLN 149/month), fine-tune personalities
- Real-time chat with typing indicators and message bubbles
- Daily limit banner for Free tier users
- Photo gallery with blur effects and unlock functionality
- Rate limiting (max 3 chat starts per minute)
- Moderation system with `isFlagged` field for content review
- Client-side gallery cache management
- Tier-based access enforcement

### 🚀 Phase 7: Advanced Features (Remaining)
- [ ] Instagram OAuth integration
- [ ] Royal Club automation
- [ ] Ad system
- [ ] i18n (60 locales)
- [ ] OpenAI/Claude API integration for AI responses

## Development

### Install Dependencies
```bash
# Root dependencies (mobile app)
npm install

# Firebase Functions
cd functions && npm install && cd ..

# Web app
cd web && npm install && cd ..
```

### Run Emulators
```bash
# Start Firebase emulators
firebase emulators:start

# Access:
# - Firestore: http://localhost:8080
# - Auth: http://localhost:9099
# - Functions: http://localhost:5001
# - Emulator UI: http://localhost:4000
```

### Run Mobile App
```bash
# Start Expo dev server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Run Web App
```bash
# Development server
cd web
npm run dev

# Access at http://localhost:3000

# Build for production
npm run build
npm start
```

### Type Checking
```bash
# Mobile app
npm run typecheck

# Web app
cd web && npm run typecheck
```

### Deploy
```bash
# Deploy Firebase Functions
firebase deploy --only functions

# Deploy Web App (Firebase Hosting)
firebase deploy --only hosting

# Deploy All
firebase deploy
```

## Security Notes

- All sensitive Firebase operations are server-side only
- Platform fees are **non-refundable** under all circumstances
- 18+ verification required for earning features
- No payment references in mobile UI (tokens only)
- Fiat currencies only shown on web checkout and payouts

## Documentation

All comprehensive specifications are available in `/docs`:

- `AVALO_CORE_FULL_SPEC.md` - Master specification
- `AVALO_TECH_ARCHITECTURE_v5.md` - Technical architecture
- `AVALO_FUNCTIONS_API_SPEC_v1.md` - API endpoints
- `AVALO_FIRESTORE_RULES_AND_INDEXES_v1.md` - Database rules
- `AVALO_PAYMENTS_AND_TOKEN_MODEL_v1.md` - Payment flows
- `AVALO_SSO_AND_OAUTH_v1.md` - Authentication flows
- `AVALO_I18N_SEED_v1.md` - Internationalization
- `AVALO_AI_COMPANIONS_SPEC_v1.md` - AI features
- `AVALO_USER_PROFILE_AND_MATCHING_v2.md` - User profiles
- `AVALO_CALENDAR_AND_REFUND_FLOW_v2.md` - Calendar system

## Support

For issues or questions, refer to the documentation in `/docs` or check the Firebase console at:
https://console.firebase.google.com/project/avalo-c8c46

---

**Phase 1 Complete** ✅ Infrastructure Setup
**Phase 2 Complete** ✅ Firebase Functions Backend
**Phase 3 Complete** ✅ Mobile App Scaffold
**Phase 4 Complete** ✅ Chat System with Token Billing
**Phase 5 Complete** ✅ Web App with Token Purchase & Admin Panel
**Phase 6 Complete** ✅ AI Companions Expansion

The platform is now feature-complete for core functionality + AI Companions! You can test:

**Mobile App:**
- User authentication (email/password)
- Real-time messaging with token billing
- Free message allowance (3 per user)
- Deposit flow with escrow management
- Wallet balance tracking
- Profile management
- Tab navigation
- **AI Companions with subscription-based access**
- **Real-time AI chat with typing indicators**
- **Photo unlock system with blur effects**

**Web App:**
- SSO from mobile via ID token
- Token purchase with Stripe checkout (4 packages)
- Real-time wallet balance display
- Creator dashboard with earnings stats
- Transaction history with filtering and CSV export
- Admin panel with moderation and user management
- Role-based access control

**Backend:**
- 18+ callable functions for all operations (including AI Companions)
- Stripe webhook for payment processing
- 3 CRON jobs for automation (chat expiry, calendar sweep, Royal eligibility)
- Content moderation system with flagging
- Comprehensive security rules
- **Rate limiting for anti-abuse (3 chats/minute)**
- **AI subscription management with daily limits**
- **Photo unlock with token-based billing**

**AI Companions:**
- 200 diverse AI profiles ready to seed
- Subscription tiers (Free, Plus, Intimate, Creator)
- Real-time chat interface with message history
- Daily message limits for Free tier (10/day, resets every 24h)
- Photo gallery with unlock functionality (2-3 tokens/photo)
- Intro screens explaining features and pricing
- Anti-abuse protections and tier access enforcement

Next steps:
1. Seed AI Companions: `firebase functions:shell` → `seedAICompanions()`
2. Deploy to production
3. Proceed to Phase 7 (Instagram OAuth, Royal Club, i18n)
