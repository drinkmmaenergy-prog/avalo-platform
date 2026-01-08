# 🔐 GitHub Repository Secrets Setup

This guide explains how to configure the required secrets for Avalo's CI/CD pipeline.

## Overview

The Avalo CI/CD pipeline requires several secrets to run integration tests with Firebase Emulators and external services. These secrets must be configured in your GitHub repository settings.

## Required Secrets

| Secret Name | Purpose | Required | Notes |
|------------|---------|----------|-------|
| `FIREBASE_TOKEN` | Authenticate Firebase CLI | ✅ Yes | Generate with `firebase login:ci` |
| `STRIPE_SECRET_KEY` | Stripe payment testing | ✅ Yes | Use test mode key (starts with `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook validation | ✅ Yes | Use test mode webhook secret |
| `OPENAI_API_KEY` | OpenAI API integration | ⚠️  Optional | For AI companion features |
| `ANTHROPIC_API_KEY` | Anthropic API integration | ⚠️  Optional | For Claude integration |

## Setup Instructions

### Step 1: Navigate to Repository Settings

1. Go to your GitHub repository
2. Click **Settings** tab
3. In the left sidebar, expand **Secrets and variables**
4. Click **Actions**

### Step 2: Add Each Secret

For each required secret:

1. Click **New repository secret**
2. Enter the **Name** (exact match from table above)
3. Enter the **Value** (the actual secret key)
4. Click **Add secret**

### Step 3: Obtain Secret Values

#### FIREBASE_TOKEN

Generate a Firebase CI token:

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login and generate token
firebase login:ci
```

**Important:** 
- Copy the token that appears after successful login
- Store it securely - you won't be able to retrieve it again
- The token format: `1//0abc123def456...`

#### STRIPE_SECRET_KEY

Get your Stripe test key:

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Ensure you're in **Test Mode** (toggle in top right)
3. Go to **Developers** → **API keys**
4. Copy the **Secret key** (starts with `sk_test_`)

**Security Note:** Never use production keys (`sk_live_`) in CI/CD!

#### STRIPE_WEBHOOK_SECRET

Set up a webhook endpoint:

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. For testing, use a placeholder URL: `https://example.com/webhook`
4. Select events you want to listen to
5. Copy the **Signing secret** (starts with `whsec_`)

**Note:** For emulator testing, the actual endpoint doesn't matter - we just need the secret for signature validation.

#### OPENAI_API_KEY (Optional)

Get your OpenAI API key:

1. Log in to [OpenAI Platform](https://platform.openai.com/)
2. Go to **API keys** section
3. Click **Create new secret key**
4. Copy the key (starts with `sk-`)
5. Store it immediately - you can't view it again

#### ANTHROPIC_API_KEY (Optional)

Get your Anthropic API key:

1. Log in to [Anthropic Console](https://console.anthropic.com/)
2. Go to **API Keys** section
3. Click **Create Key**
4. Copy the key (starts with `sk-ant-`)
5. Store it securely

## Verification

After adding all secrets, you can verify they're configured:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all secret names listed (values are hidden)
3. The **Updated** timestamp shows when each was last modified

## Testing Locally

To test locally with the same secrets:

1. Create a `.env` file in the `functions/` directory:

```bash
FIREBASE_TOKEN=your_token_here
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
OPENAI_API_KEY=sk-your_key
ANTHROPIC_API_KEY=sk-ant-your_key
```

2. Add `.env` to `.gitignore` (should already be there)
3. Never commit secrets to version control!

## Troubleshooting

### "Secret not found" errors

**Problem:** CI job fails with "Secret XXX not found"

**Solution:**
1. Check secret name matches exactly (case-sensitive)
2. Ensure secret is added to Actions, not Dependabot
3. Re-add the secret if it was recently changed

### Firebase authentication fails

**Problem:** `Error: Authentication Error: Unable to authenticate`

**Solution:**
1. Regenerate token: `firebase login:ci`
2. Update `FIREBASE_TOKEN` secret with new value
3. Ensure token hasn't expired

### Stripe tests fail

**Problem:** Stripe API errors in test logs

**Solution:**
1. Verify you're using TEST mode keys (not live)
2. Check API key hasn't been revoked in Stripe Dashboard
3. Ensure webhook secret matches your webhook configuration

### Optional API keys missing

**Problem:** Warnings about missing OpenAI/Anthropic keys

**Impact:**
- Tests requiring AI features will be skipped
- Core functionality tests will still run
- This is normal if you haven't set up these services

**Solution:**
- If you need AI features, add the respective API keys
- Otherwise, you can ignore these warnings

## Security Best Practices

✅ **DO:**
- Use separate keys for CI/CD, development, and production
- Use test mode keys for Stripe (`sk_test_` prefix)
- Rotate secrets regularly (every 90 days)
- Remove secrets when no longer needed
- Use separate Firebase projects for CI/CD

❌ **DON'T:**
- Never commit secrets to Git
- Don't use production keys in CI/CD
- Don't share secrets in issues or PRs
- Don't log secret values in CI output
- Don't reuse the same secrets across multiple projects

## Updating Secrets

To update an existing secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret in the list
3. Click **Update**
4. Enter the new value
5. Click **Update secret**

**Note:** Workflow runs will use the new value immediately after update.

## Removing Secrets

To remove a secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret in the list
3. Click **Remove**
4. Confirm removal

**Warning:** Removing a required secret will cause CI/CD pipeline failures.

## Support

If you encounter issues with secrets setup:

1. Check this guide for common solutions
2. Review CI/CD logs for specific error messages
3. Verify secrets are correctly configured in GitHub
4. Test locally with same secrets in `.env` file

## Related Documentation

- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Stripe API Keys Guide](https://stripe.com/docs/keys)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com/)

---

*Last Updated: 2025-01-05*
*Avalo CI/CD Pipeline v1.0*