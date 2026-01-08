# Avalo Environment Keys & Configuration

Complete guide for configuring environment variables across all Avalo environments (development, preview, production).

## Table of Contents
- [Overview](#overview)
- [Environment Files Structure](#environment-files-structure)
- [Firebase Configuration](#firebase-configuration)
- [Stripe Configuration](#stripe-configuration)
- [Google OAuth](#google-oauth)
- [AI Services](#ai-services)
- [Email & SMS Services](#email--sms-services)
- [Security Keys](#security-keys)
- [External APIs](#external-apis)
- [Environment-Specific Setup](#environment-specific-setup)
- [GitHub Secrets Configuration](#github-secrets-configuration)
- [Verification & Testing](#verification--testing)

## Overview

Avalo uses three main environment files:
- **`.env`** - Root project configuration (shared)
- **`app/.env`** - React Native Expo app configuration
- **`functions/.env`** - Firebase Cloud Functions configuration (server-side)

### Security Best Practices

⚠️ **NEVER commit real API keys to version control**

- Use `.env.example` files for templates
- Add `.env` files to `.gitignore`
- Use different keys for development/production
- Rotate keys regularly
- Use environment-specific keys

## Environment Files Structure

### Root `.env`
Location: `/.env`

```bash
# Firebase Client Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Application Configuration
EXPO_PUBLIC_WEBSITE_ORIGIN=https://avalo.app
EXPO_PUBLIC_FUNCTIONS_REGION=europe-west3
EXPO_PUBLIC_I18N_DEFAULT=en
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### App `.env`
Location: `/app/.env`

Full mobile app configuration including Firebase, Stripe, feature flags, and more.

### Functions `.env`
Location: `/functions/.env`

Server-side configuration including secret keys, API credentials, and service integrations.

## Firebase Configuration

### Where to Get Firebase Keys

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create new)
3. Go to **Project Settings** (gear icon)
4. Scroll to **Your apps** section
5. Select or add a Web app
6. Copy the configuration object

### Required Firebase Keys

```bash
# Client-side (Safe to expose)
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=yourproject.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=yourproject
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=yourproject.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC123XYZ
```

### Firebase Admin Configuration

For Cloud Functions, Firebase Admin SDK credentials are automatically provided in production. For local development:

```bash
# functions/.env
FIREBASE_CONFIG={"projectId":"yourproject","storageBucket":"yourproject.firebasestorage.app"}
GCLOUD_PROJECT=yourproject
```

**Service Account Key** (for local development only):
1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate New Private Key**
3. Download JSON file
4. Store securely (NEVER commit to git)
5. Set path: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json`

## Stripe Configuration

### Get Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API Keys**
3. Copy keys for your environment

### Stripe Keys

```bash
# Client-side (Publishable Key - safe to expose)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Test mode
# or
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... # Production

# Server-side (Secret Key - NEVER expose)
# functions/.env
STRIPE_SECRET_KEY=sk_test_... # Test mode
# or
STRIPE_SECRET_KEY=sk_live_... # Production
```

### Stripe Webhook Secret

1. Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. URL: `https://yourregion-yourproject.cloudfunctions.net/stripeWebhook`
4. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret

```bash
# functions/.env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Google OAuth

### Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create project
3. Navigate to **APIs & Services** → **Credentials**
4. Create **OAuth 2.0 Client ID**
5. Configure consent screen
6. Add authorized redirect URIs:
   - `https://avalo.app/auth/callback`
   - `https://yourproject.firebaseapp.com/__/auth/handler`
   - `http://localhost:3000/auth/callback` (development)

### Google OAuth Keys

```bash
# app/.env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com

# functions/.env
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz
```

### iOS Google Sign-In

Add to `app.json`:
```json
{
  "ios": {
    "googleServicesFile": "./GoogleService-Info.plist",
    "config": {
      "googleSignIn": {
        "reservedClientId": "com.googleusercontent.apps.123456789-abc123"
      }
    }
  }
}
```

### Android Google Sign-In

1. Download `google-services.json` from Firebase Console
2. Place in `app/` directory
3. Add to `app.json`:
```json
{
  "android": {
    "googleServicesFile": "./google-services.json"
  }
}
```

## AI Services

### Anthropic (Claude AI)

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create API key
3. Set billing (pay-as-you-go)

```bash
# functions/.env
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-5-sonnet-20241022
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.7
```

### OpenAI (GPT)

1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create API key
3. Set usage limits

```bash
# functions/.env
OPENAI_API_KEY=sk-...
MODERATION_MODEL=gpt-4o-mini
MODERATION_THRESHOLD=0.8
```

## Email & SMS Services

### SendGrid (Email)

1. Go to [SendGrid](https://app.sendgrid.com)
2. Settings → API Keys → Create API Key
3. Choose **Full Access** or specific permissions
4. Create email templates for:
   - Email verification
   - Password reset
   - Welcome email

```bash
# functions/.env
SENDGRID_API_KEY=SG.abc123...
SENDGRID_FROM_EMAIL=noreply@avalo.app
SENDGRID_FROM_NAME=Avalo
SENDGRID_VERIFICATION_TEMPLATE_ID=d-abc123
SENDGRID_PASSWORD_RESET_TEMPLATE_ID=d-def456
SENDGRID_WELCOME_TEMPLATE_ID=d-ghi789
```

### Twilio (SMS - Optional)

1. Go to [Twilio Console](https://console.twilio.com)
2. Get Account SID and Auth Token
3. Purchase phone number

```bash
# functions/.env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
ENABLE_SMS_NOTIFICATIONS=true
```

## Security Keys

### JWT Secret

Generate secure random string (32+ characters):

```bash
# Command line generation
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

```bash
# functions/.env
JWT_SECRET=your_64_character_hex_string_here_minimum_32_chars_required
```

### Encryption Key

Generate 32-byte key for AES-256 encryption:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
# functions/.env
ENCRYPTION_KEY=your_32_character_base64_encoded_key_here
```

### Webhook Signing Secret

Generate for custom webhook verification:

```bash
openssl rand -hex 32
```

```bash
# functions/.env
WEBHOOK_SIGNING_SECRET=your_webhook_signing_secret_here
```

## External APIs

### Exchange Rate API (Currency Conversion)

1. Go to [ExchangeRate-API](https://www.exchangerate-api.com) or similar
2. Sign up for free tier
3. Copy API key

```bash
# functions/.env
EXCHANGERATE_API_KEY=your_api_key_here
```

### Coinbase (Crypto Prices)

Free API, no key required for basic exchange rates:

```bash
# functions/.env
COINBASE_API_URL=https://api.coinbase.com/v2/exchange-rates
```

## Environment-Specific Setup

### Development Environment

Create `.env.development` files:

```bash
# app/.env.development
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_DEBUG=true
EXPO_PUBLIC_USE_EMULATORS=true
EXPO_PUBLIC_API_URL=http://localhost:5007

# functions/.env.development
NODE_ENV=development
DEBUG=true
ENABLE_TEST_ENDPOINTS=true
WEBSITE_ORIGIN=http://localhost:3000
```

### Preview/Staging Environment

```bash
# app/.env.preview
EXPO_PUBLIC_ENV=preview
EXPO_PUBLIC_DEBUG=false
EXPO_PUBLIC_API_URL=https://europe-west3-avalo-preview.cloudfunctions.net

# functions/.env.preview
NODE_ENV=staging
DEBUG=false
WEBSITE_ORIGIN=https://preview.avalo.app
```

### Production Environment

```bash
# app/.env.production
EXPO_PUBLIC_ENV=production
EXPO_PUBLIC_DEBUG=false
EXPO_PUBLIC_API_URL=https://europe-west3-avalo-c8c46.cloudfunctions.net

# Use production Stripe keys
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# functions/.env.production
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
STRIPE_SECRET_KEY=sk_live_...
WEBSITE_ORIGIN=https://avalo.app
```

## GitHub Secrets Configuration

### Required GitHub Secrets

Navigate to **Repository Settings** → **Secrets and variables** → **Actions**

#### Firebase Secrets
```
FIREBASE_TOKEN          # Get with: firebase login:ci
FIREBASE_PROJECT_ID     # Your Firebase project ID
FIREBASE_API_KEY        # Firebase Web API key
FIREBASE_AUTH_DOMAIN    # project-id.firebaseapp.com
FIREBASE_STORAGE_BUCKET # project-id.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

#### Expo/EAS Secrets
```
EXPO_TOKEN             # From: npx eas login; npx eas whoami --json
```

#### Stripe Secrets
```
STRIPE_SECRET_KEY      # Production secret key
STRIPE_WEBHOOK_SECRET  # Webhook signing secret
```

#### Other Secrets
```
ANTHROPIC_API_KEY
OPENAI_API_KEY
SENDGRID_API_KEY
```

### Setting GitHub Secrets

```bash
# Using GitHub CLI
gh secret set FIREBASE_TOKEN --body "$(firebase login:ci)"
gh secret set EXPO_TOKEN --body "$(npx eas whoami --json | jq -r .id)"
gh secret set STRIPE_SECRET_KEY --body "sk_live_..."

# Or via GitHub web interface
# Settings → Secrets → New repository secret
```

## Verification & Testing

### Verify Configuration

```bash
# Test Firebase connection
npm run test:firebase

# Test Stripe connection
npm run test:stripe

# Test all functions
cd functions && npm test
```

### Environment Variables Checklist

#### Client-Side (Mobile App)
- [ ] Firebase configuration (all 7 keys)
- [ ] Stripe publishable key
- [ ] Google Client ID
- [ ] API URL
- [ ] App scheme

#### Server-Side (Functions)
- [ ] Firebase Admin (automatic in production)
- [ ] Stripe secret key
- [ ] Stripe webhook secret
- [ ] Google OAuth credentials
- [ ] AI service keys (Anthropic/OpenAI)
- [ ] Email service key (SendGrid)
- [ ] JWT secret
- [ ] Encryption key

#### CI/CD (GitHub Actions)
- [ ] Firebase token
- [ ] Expo token
- [ ] All production keys
- [ ] Webhook secrets

### Common Issues

**Issue**: Firebase initialization error
- **Solution**: Check all 7 Firebase keys are set correctly

**Issue**: Stripe webhook not working
- **Solution**: Verify webhook URL and signing secret

**Issue**: Google Sign-In not working
- **Solution**: Check OAuth redirect URIs are configured

**Issue**: AI features not responding
- **Solution**: Verify API keys and usage limits

**Issue**: Email notifications not sending
- **Solution**: Check SendGrid API key and from email verification

## Environment File Templates

### Create Example Files

Always create `.env.example` files for each environment:

```bash
# Create example files
cp .env .env.example
cp app/.env app/.env.example
cp functions/.env functions/.env.example

# Replace real values with placeholders
# Then commit .env.example files to git
```

### Example Template

```bash
# .env.example
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
# ... etc
```

## Security Recommendations

1. **Use 1Password/LastPass** for team key management
2. **Rotate keys** every 90 days
3. **Different keys** for dev/staging/production
4. **Monitor usage** in service dashboards
5. **Set spending alerts** for paid APIs
6. **Review access logs** regularly
7. **Revoke unused keys** immediately
8. **Use principle of least privilege** for API key permissions

## Quick Setup Commands

```bash
# Initial setup
cp .env.example .env
cp app/.env.example app/.env
cp functions/.env.example functions/.env

# Edit with your keys
nano .env
nano app/.env
nano functions/.env

# Verify configuration
npm run verify:config

# Set GitHub secrets (requires gh CLI)
./scripts/setup-github-secrets.sh

# Deploy with new configuration
npm run deploy
```

## Support

For assistance with environment configuration:
- Email: devops@avalo.app
- Documentation: https://avalo.app/docs/environment
- Community: [Discord/Slack link]

---

**Last Updated**: 2024-11-04  
**Version**: 1.0.0