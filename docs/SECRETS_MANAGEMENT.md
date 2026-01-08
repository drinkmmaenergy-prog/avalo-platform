# Secrets Management Guide

## Overview

Avalo uses a multi-layered approach to secrets management:

1. **Local Development**: `.env` files (never committed)
2. **CI/CD**: GitHub Actions Secrets
3. **Firebase**: Firebase Environment Config
4. **Cloud Functions**: Google Cloud Secret Manager

## ⚠️ CRITICAL RULES

### NEVER commit secrets to git
- All `.env` files are gitignored
- Use `secrets.template.env` as reference only
- API keys, tokens, and passwords must NEVER appear in code

### Secret Types

#### Public (Can be in client code)
- Firebase Project IDs
- Firebase Auth Domains
- Stripe Publishable Keys (test and live)

#### Private (Server-side only)
- Firebase Admin SDK credentials
- Stripe Secret Keys
- API keys (OpenAI, Anthropic, etc.)
- Database credentials
- App Store credentials

## Local Development Setup

1. Copy the template:
```bash
cp config/secrets.template.env .env
```

2. Fill in your development secrets:
```bash
FIREBASE_DEV_API_KEY=your_dev_key_here
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
```

3. Verify `.env` is gitignored:
```bash
git status  # Should not show .env file
```

## GitHub Actions Secrets

### Required Secrets for CI/CD

Add these in: `GitHub Repo → Settings → Secrets and variables → Actions`

#### Firebase
- `FIREBASE_TOKEN` - Firebase CLI token for deployments
- `FIREBASE_DEV_API_KEY`
- `FIREBASE_STAGING_API_KEY`
- `FIREBASE_PROD_API_KEY`
- `FIREBASE_STAGING_APP_ID`
- `FIREBASE_PROD_APP_ID`

#### Stripe
- `STRIPE_TEST_PUBLISHABLE_KEY`
- `STRIPE_TEST_SECRET_KEY`
- `STRIPE_LIVE_PUBLISHABLE_KEY`
- `STRIPE_LIVE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

#### AI Providers
- `OPENAI_STAGING_KEY`
- `OPENAI_PROD_KEY`
- `ANTHROPIC_STAGING_KEY`
- `ANTHROPIC_PROD_KEY`

#### KYC Provider
- `KYC_STAGING_API_KEY`
- `KYC_PROD_API_KEY`

#### SMS/Email
- `SMS_STAGING_API_KEY`
- `SMS_PROD_API_KEY`
- `EMAIL_STAGING_API_KEY`
- `EMAIL_PROD_API_KEY`

#### Mobile App Stores
- `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` (JSON key file as base64)
- `APPLE_KEY_ID`
- `APPLE_ISSUER_ID`
- `APPLE_PRIVATE_KEY`
- `EXPO_TOKEN`
- `EAS_PROJECT_ID`

#### Test Accounts
- `STAGING_TEST_USER_EMAIL`
- `STAGING_TEST_USER_PASSWORD`

### Adding Secrets to GitHub Actions

```bash
# Using GitHub CLI
gh secret set FIREBASE_TOKEN

# Or via UI
# Repo → Settings → Secrets and variables → Actions → New repository secret
```

## Firebase Environment Config

For Cloud Functions runtime environment:

```bash
# Set individual config
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  --project production

# Get current config
firebase functions:config:get --project production

# Clone from staging to production
firebase functions:config:clone \
  --from staging \
  --to production
```

### Accessing in Cloud Functions

```typescript
import * as functions from 'firebase-functions';

const stripeKey = functions.config().stripe.secret_key;
const openaiKey = functions.config().openai.api_key;
```

## Google Cloud Secret Manager

For high-security secrets in Cloud Functions:

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function getSecret(secretName: string): Promise<string> {
  const [version] = await client.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  
  return version.payload?.data?.toString() || '';
}

// Usage
const stripeKey = await getSecret('stripe-secret-key');
```

## Rotation Strategy

### Immediate Rotation (Security Breach)
1. Revoke compromised secret immediately
2. Generate new secret
3. Update all environments (dev, staging, production)
4. Deploy immediately
5. Monitor for unauthorized access

### Scheduled Rotation (Every 90 days)
1. Generate new secrets
2. Update staging environment first
3. Test thoroughly
4. Update production
5. Deactivate old secrets after 7 days

### Key Rotation Checklist
- [ ] Stripe API keys
- [ ] Firebase API keys
- [ ] AI provider keys (OpenAI, Anthropic)
- [ ] KYC provider keys
- [ ] SMS/Email provider keys
- [ ] JWT secrets
- [ ] Encryption keys

## Environment-Specific Access

### DEV
- Developers have full access
- Use test/sandbox keys only
- Can use Firebase emulators

### STAGING
- Limited team access
- Uses test/sandbox keys
- Mirrors production setup

### PRODUCTION
- Restricted access (admin only)
- Live keys only
- All changes require approval

## Security Best Practices

1. **Never log secrets**
   ```typescript
   // ❌ BAD
   console.log('API Key:', apiKey);
   
   // ✅ GOOD
   console.log('API Key loaded successfully');
   ```

2. **Use environment detection**
   ```typescript
   const getStripeKey = () => {
     if (process.env.NODE_ENV === 'production') {
       return process.env.STRIPE_LIVE_SECRET_KEY;
     }
     return process.env.STRIPE_TEST_SECRET_KEY;
   };
   ```

3. **Validate secrets exist**
   ```typescript
   if (!process.env.STRIPE_SECRET_KEY) {
     throw new Error('STRIPE_SECRET_KEY is required');
   }
   ```

4. **Use TypeScript for type safety**
   ```typescript
   interface Secrets {
     stripe: {
       publishableKey: string;
       secretKey: string;
     };
     firebase: {
       apiKey: string;
       projectId: string;
     };
   }
   ```

## Troubleshooting

### Secret not loading in CI/CD
1. Verify secret is set in GitHub Actions
2. Check spelling and case sensitivity
3. Ensure workflow has access to secret
4. Check environment protection rules

### Secret not available in Cloud Functions
1. Verify Firebase functions:config
2. Check project selection
3. Redeploy functions after config change
4. Check Secret Manager permissions

### Secret leaked in git history
1. **DO NOT** just delete the file
2. Use BFG Repo Cleaner or git-filter-repo
3. Rotate ALL affected secrets immediately
4. Force push cleaned history
5. Notify all team members to re-clone

## Emergency Procedures

### If secrets are exposed:

1. **IMMEDIATE (within 5 minutes)**
   - Revoke/delete exposed secrets
   - Lock affected accounts
   - Alert security team

2. **SHORT TERM (within 1 hour)**
   - Generate new secrets
   - Update all systems
   - Deploy to all environments
   - Enable 2FA where possible

3. **FOLLOW UP (within 24 hours)**
   - Review access logs
   - Identify any unauthorized usage
   - Document incident
   - Update security procedures

## Monitoring

Monitor secret usage:
- API call patterns
- Geographic access patterns  
- Failed authentication attempts
- Rate limit violations

Set up alerts for:
- Unusual API usage spikes
- Failed authentication attempts
- Access from unexpected IPs
- Approaching rate limits

## Compliance

Ensure secrets management meets:
- GDPR requirements
- PCI DSS (for payment data)
- SOC 2 Type II
- Industry-specific regulations

## Resources

- [Firebase Environment Config](https://firebase.google.com/docs/functions/config-env)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Google Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Stripe Key Best Practices](https://stripe.com/docs/keys)