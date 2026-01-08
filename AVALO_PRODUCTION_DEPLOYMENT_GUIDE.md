# AVALO PRODUCTION DEPLOYMENT GUIDE

**Version:** 3.0.0  
**Last Updated:** 2025-01-20  
**Status:** Production Ready  

---

## 📋 TABLE OF CONTENTS

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Firebase Configuration](#firebase-configuration)
4. [Stripe Integration](#stripe-integration)
5. [Google OAuth Setup](#google-oauth-setup)
6. [Backend Deployment](#backend-deployment)
7. [Frontend Deployment](#frontend-deployment)
8. [Testing & Verification](#testing--verification)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 PREREQUISITES

### Required Tools

```bash
# Node.js (v20.x LTS recommended)
node --version  # Should be v20+

# npm
npm --version   # Should be 10+

# Firebase CLI
npm install -g firebase-tools
firebase --version  # Should be 12+

# Expo CLI (for mobile app)
npm install -g expo-cli
expo --version

# Git
git --version
```

### Required Accounts

- ✅ **Firebase/Google Cloud Platform**
  - Project ID: `avalo-c8c46`
  - Project Number: `445933516064`
  
- ✅ **Stripe Account** (Test Mode)
  - Publishable Key: `pk_test_51SEaEURotO6GNAiD...`
  - Secret Key: `sk_test_51SEaEURotO6GNAiD...`
  - Webhook Secret: `whsec_5c1953aaa5e1b0664...`
  
- ✅ **Google OAuth**
  - Client ID: `445933516064-05aphajoia31frb2k3jf0imn7bgfd5mc...`
  - Client Secret: `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`

### Required API Keys (Optional Services)

- **Anthropic API** (for AI Companions) - Add your key to `.env`
- **OpenAI API** (for content moderation) - Add your key to `.env`
- **SendGrid API** (for email notifications) - Add your key to `.env`

---

## 🌍 ENVIRONMENT SETUP

### 1. Clone Repository

```bash
git clone https://github.com/your-org/avaloapp.git
cd avaloapp
```

### 2. Install Dependencies

```bash
# Root dependencies
npm install

# Functions dependencies
cd functions
npm install
cd ..

# Web dependencies (if using web version)
cd web
npm install
cd ..
```

### 3. Environment Files

The following environment files have been created:

#### `.env.local` (Root - for local development)
```bash
# Already configured with Firebase, Stripe, and Google OAuth credentials
# Update AI service keys:
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
SENDGRID_API_KEY=your_key_here
```

#### `app/.env` (Expo App)
```bash
# Already configured for mobile app
# All EXPO_PUBLIC_* variables are accessible in React Native
```

#### `functions/.env` (Cloud Functions)
```bash
# Already configured for backend
# Update AI and email service keys as needed
```

---

## 🔥 FIREBASE CONFIGURATION

### 1. Login to Firebase

```bash
firebase login
```

### 2. Set Active Project

```bash
firebase use avalo-c8c46
```

### 3. Deploy Firestore Rules & Indexes

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

### 4. Deploy Storage Rules

```bash
firebase deploy --only storage
```

### 5. Enable Firebase Services

In Firebase Console (`https://console.firebase.google.com/project/avalo-c8c46`):

- ✅ **Authentication**
  - Enable Email/Password
  - Enable Google Sign-In
  - Configure OAuth consent screen
  
- ✅ **Firestore Database**
  - Already configured with rules in `firestore.rules`
  
- ✅ **Cloud Storage**
  - Already configured with rules in `storage.rules`
  
- ✅ **Cloud Functions**
  - Region: `europe-west3`
  - Runtime: Node.js 20

---

## 💳 STRIPE INTEGRATION

### 1. Stripe Dashboard Setup

1. Go to `https://dashboard.stripe.com/test/dashboard`
2. Navigate to **Developers > API Keys**
3. Copy keys to environment files (already done)

### 2. Create Products

Create the following token packages in Stripe:

```javascript
// Token Packages
{
  "STARTER": { tokens: 100, price: 30 PLN },
  "VALUE": { tokens: 500, price: 125 PLN },
  "PRO": { tokens: 1000, price: 230 PLN },
  "ELITE": { tokens: 5000, price: 1000 PLN }
}
```

### 3. Configure Webhook

1. In Stripe Dashboard: **Developers > Webhooks**
2. Add endpoint: `https://europe-west3-avalo-c8c46.cloudfunctions.net/stripeWebhook`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy webhook signing secret to `functions/.env`

### 4. Test Webhook Locally

```bash
# Install Stripe CLI
stripe listen --forward-to http://localhost:5007/stripeWebhook

# Trigger test event
stripe trigger checkout.session.completed
```

---

## 🔐 GOOGLE OAUTH SETUP

### 1. Google Cloud Console

1. Go to `https://console.cloud.google.com/apis/credentials?project=avalo-c8c46`
2. OAuth 2.0 Client IDs are already configured

### 2. Authorized Redirect URIs

Ensure these URIs are added:

**Development:**
- `http://localhost:3000/_oauth/google`
- `http://localhost:3000/__/auth/handler`

**Production:**
- `https://avalo.app/_oauth/google`
- `https://avalo.app/__/auth/handler`
- `https://europe-west3-avalo-c8c46.cloudfunctions.net/authCallback`

### 3. OAuth Consent Screen

- App name: **Avalo**
- User support email: `support@avalo.app`
- Developer contact: `dev@avalo.app`
- Scopes: `email`, `profile`, `openid`

---

## 🚀 BACKEND DEPLOYMENT

### 1. Build Functions

```bash
cd functions
npm run build
cd ..
```

### 2. Deploy All Functions

```bash
# Deploy all functions
npm run deploy:functions

# Or deploy specific function
firebase deploy --only functions:ping
firebase deploy --only functions:createPostV1
firebase deploy --only functions:purchaseTokensV2
```

### 3. Verify Deployment

```bash
# Test health check
curl https://europe-west3-avalo-c8c46.cloudfunctions.net/ping

# Expected response:
{
  "ok": true,
  "timestamp": "2025-01-20T10:00:00.000Z",
  "version": "3.0.0",
  "service": "avalo-functions",
  "region": "europe-west3"
}
```

### 4. Available Endpoints

**Core Functions:**
- `ping` - Health check
- `getSystemInfo` - System information
- `createPostV1` - Create social post
- `getGlobalFeedV1` - Get feed
- `likePostV1` - Like a post
- `purchaseTokensV2` - Purchase tokens
- `stripeWebhook` - Stripe webhook handler
- `connectWalletV1` - Connect crypto wallet
- `claimRewardCallable` - Claim loyalty rewards
- `getUserLoyaltyCallable` - Get loyalty stats
- `analyzeContentV1` - AI content moderation

---

## 📱 FRONTEND DEPLOYMENT

### 1. Local Development

```bash
# Start Expo development server
npm start

# Or with emulators
npm run dev
```

### 2. Run on Device/Simulator

```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web Browser
npm run web
```

### 3. Build for Production

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production

# Both
eas build --platform all --profile production
```

### 4. Submit to App Stores

```bash
# iOS App Store
eas submit --platform ios

# Google Play Store
eas submit --platform android
```

---

## 🧪 TESTING & VERIFICATION

### 1. Start Local Emulators

```bash
# Start Firebase emulators with UI
npm run emulators

# Or with data export/import
npm run emulators:data
```

### 2. Test Core Flows

#### Authentication Flow
```bash
1. Open app
2. Navigate to Register/Login
3. Create account with email/password
4. Verify email (check emulator UI)
5. Login successfully
```

#### Feed Flow
```bash
1. Navigate to Feed tab
2. Create a new post
3. Verify post appears in feed
4. Like the post
5. Verify like count increases
```

#### Payment Flow
```bash
1. Navigate to Wallet tab
2. Click "Buy Tokens"
3. Select package (use test card: 4242 4242 4242 4242)
4. Complete Stripe checkout
5. Verify tokens credited
```

#### Loyalty Flow
```bash
1. Navigate to Quests tab
2. View available quests
3. Complete a quest
4. Check loyalty points
5. Claim rewards when available
```

### 3. Test Cards (Stripe)

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Auth Required: 4000 0025 0000 3155
```

---

## 📊 MONITORING & MAINTENANCE

### 1. Firebase Console Monitoring

- **Functions Logs**: `https://console.firebase.google.com/project/avalo-c8c46/functions/logs`
- **Firestore Usage**: Monitor read/write operations
- **Error Reporting**: Check for crashes

### 2. Stripe Dashboard

- **Payments**: Monitor successful/failed transactions
- **Disputes**: Handle chargebacks
- **Customers**: Manage customer data

### 3. Set Up Alerts

```javascript
// In Firebase Console > Functions
// Set up alerts for:
- Function errors (> 5% error rate)
- High latency (> 2s p95)
- Low success rate (< 95%)
```

### 4. Regular Maintenance Tasks

**Daily:**
- Check error logs
- Monitor payment success rate
- Review user reports

**Weekly:**
- Review analytics
- Update content moderation rules
- Check API quota usage

**Monthly:**
- Update dependencies
- Review security rules
- Optimize database queries

---

## 🔧 TROUBLESHOOTING

### Common Issues

#### Issue: Functions not deploying

```bash
# Solution: Ensure you're logged in and have correct permissions
firebase login
firebase use avalo-c8c46
npm run build:functions
firebase deploy --only functions --debug
```

#### Issue: Stripe webhook not working

```bash
# Solution: Check webhook URL and signing secret
1. Verify webhook URL in Stripe Dashboard
2. Confirm webhook secret in functions/.env
3. Test with Stripe CLI: stripe trigger checkout.session.completed
```

#### Issue: Authentication failing

```bash
# Solution: Check OAuth configuration
1. Verify redirect URIs in Google Cloud Console
2. Check Firebase Authentication settings
3. Ensure GOOGLE_CLIENT_ID is correct in app/.env
```

#### Issue: Emulators not starting

```bash
# Solution: Check ports and clean restart
1. Kill any process using ports 9120, 8188, 5007
2. Delete node_modules and reinstall
3. Run: firebase emulators:start --debug
```

#### Issue: TypeScript errors in functions

```bash
# Solution: Rebuild and check types
cd functions
npm run build
# Fix any type errors, then redeploy
```

---

## 📚 ADDITIONAL RESOURCES

### Documentation

- **Firebase**: https://firebase.google.com/docs
- **Stripe**: https://stripe.com/docs
- **Expo**: https://docs.expo.dev
- **React Native**: https://reactnative.dev/docs

### Support

- **Email**: support@avalo.app
- **Developer Portal**: https://docs.avalo.app
- **GitHub Issues**: https://github.com/your-org/avaloapp/issues

---

## ✅ DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Dependencies installed and up to date
- [ ] Tests passing locally
- [ ] Firebase emulators working
- [ ] Stripe test payments working

### Backend Deployment

- [ ] Functions built successfully (`npm run build:functions`)
- [ ] Firestore rules deployed
- [ ] Cloud Functions deployed
- [ ] Stripe webhook configured
- [ ] Health check endpoint responding

### Frontend Deployment

- [ ] App builds without errors
- [ ] Firebase SDK configured correctly
- [ ] Stripe SDK configured
- [ ] Google OAuth working
- [ ] All tabs/screens functional

### Post-Deployment

- [ ] Production health check passing
- [ ] Payment flow tested in production
- [ ] User registration working
- [ ] Push notifications configured
- [ ] Analytics tracking working
- [ ] Monitoring and alerts set up

---

## 🎉 CONCLUSION

Your Avalo production environment is now ready! 

**Next Steps:**
1. Complete any optional integrations (AI services, SendGrid, etc.)
2. Test thoroughly in staging environment
3. Deploy to production
4. Monitor closely for first 24-48 hours
5. Iterate based on user feedback

**Important Notes:**
- Keep all secrets secure and never commit them to version control
- Regularly update dependencies for security
- Monitor costs in Firebase and Stripe dashboards
- Back up Firestore data regularly

For questions or issues, refer to the troubleshooting section or contact the development team.

---

**Happy Deploying! 🚀**