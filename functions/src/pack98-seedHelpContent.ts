/**
 * PACK 98 — IN-APP HELP CENTER
 * Seed initial help categories and articles
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Seed initial help categories and placeholder articles
 * Should be called once during initial setup
 */
export const seedHelpContent = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // TODO: Add admin role check in production
  // const userDoc = await db.collection('users').doc(context.auth.uid).get();
  // if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
  //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  // }

  try {
    const now = admin.firestore.Timestamp.now();

    // Create categories
    const categories = [
      {
        slug: 'getting-started',
        title: 'Getting Started',
        order: 1,
      },
      {
        slug: 'accounts-security',
        title: 'Accounts & Security',
        order: 2,
      },
      {
        slug: 'earnings-payments',
        title: 'Earnings & Payments',
        order: 3,
      },
      {
        slug: 'content-and-monetization',
        title: 'Content & Monetization',
        order: 4,
      },
      {
        slug: 'trust-safety',
        title: 'Trust & Safety',
        order: 5,
      },
      {
        slug: 'legal-and-privacy',
        title: 'Legal & Privacy',
        order: 6,
      },
    ];

    const categoryIds: Record<string, string> = {};

    for (const category of categories) {
      const categoryRef = await db.collection('help_categories').add({
        ...category,
        createdAt: now,
        updatedAt: now,
      });
      categoryIds[category.slug] = categoryRef.id;
    }

    // Create placeholder articles
    const articles = [
      {
        slug: 'how-avalo-works',
        categorySlug: 'getting-started',
        title: 'How Avalo Works',
        content: `# How Avalo Works

Avalo is a platform that connects adults who want to build real connections and, if they choose, earn from their time and attention.

## Core Features

- **Profiles & Discovery**: Create a clear profile, choose your preferences, and appear in discovery feeds based on compatibility, safety and activity.
- **Token Economy**: Some actions use tokens: unlocking content, gifts, or premium messages. Avalo keeps 35%, creators receive 65% of eligible earnings.
- **Safety & Verification**: Every user must be 18+, we use verification, risk scoring, reports and enforcement to keep interactions as safe as possible.
- **Privacy & Control**: You choose what you share. You can control visibility, manage devices, enable extra security and review your data rights.

Learn more by exploring other help articles in this center.`,
        language: 'en',
        tags: ['overview', 'basics', 'getting-started'],
        isFeatured: true,
        platform: 'MOBILE',
      },
      {
        slug: 'earnings-and-fees',
        categorySlug: 'earnings-payments',
        title: 'Earnings & Fees',
        content: `# Earnings & Fees

## How Earnings Work

When users engage with your content or time through paid features, you earn tokens. Avalo operates on a transparent 65/35 revenue split:

- **65%** goes to creators
- **35%** goes to Avalo (platform fee)

## What You Can Earn From

- Paid chat messages
- Unlocked media (photos/videos)
- Voice/video calls
- Tips and gifts
- Premium stories
- Goals and crowdfunding

## Important Notes

- **No Free Tokens**: Avalo never gives free tokens, discounts, promo codes, or cashback
- **No Refunds**: Token transactions are final. Disputes don't result in automatic refunds
- **Token Price**: Token price per unit is fixed and never changes
- **65/35 Split**: This revenue split is permanent and applies to all paid interactions

## Earnings Are Not Guaranteed

Your earnings depend on your activity, content quality, user engagement, and market dynamics. Avalo makes no promises or guarantees about income potential.`,
        language: 'en',
        tags: ['earnings', 'fees', 'revenue-split', 'tokens'],
        isFeatured: true,
        platform: 'MOBILE',
      },
      {
        slug: 'payouts-and-kyc',
        categorySlug: 'earnings-payments',
        title: 'Payouts & KYC',
        content: `# Payouts & KYC

## Requesting Payouts

To request a payout of your earned tokens:

1. Complete KYC verification (identity verification)
2. Add a payout method (PayPal, bank transfer, etc.)
3. Request payout when you meet minimum threshold
4. Wait for review and processing

## KYC Requirement

Before you can request payouts, we must verify your identity (KYC - Know Your Customer). This helps us:

- Comply with financial regulations
- Protect all users
- Prevent fraud and abuse

## Payout Timeline

- Payouts are reviewed and processed manually
- Processing typically takes 7-14 business days
- Delays may occur during high volume periods or if additional verification is needed

## Important Notes

- Minimum payout threshold applies
- Platform fees are deducted before payout
- Rejected payouts may occur if KYC is incomplete or suspicious activity is detected`,
        language: 'en',
        tags: ['payouts', 'kyc', 'verification', 'withdrawal'],
        isFeatured: true,
        platform: 'MOBILE',
      },
      {
        slug: 'reports-and-disputes',
        categorySlug: 'trust-safety',
        title: 'Reports & Disputes',
        content: `# Reports & Disputes

## How to Report

If you encounter inappropriate behavior or content:

1. Use the report button on profiles, messages, or content
2. Select the reason for your report
3. Optionally provide additional context
4. Submit the report

## What Happens Next

- Our moderation team reviews all reports
- We may take action against violating users
- You'll be notified of the outcome when appropriate

## Disputes

If you have an issue with a paid interaction:

1. Submit a dispute explaining the problem
2. Include any relevant evidence
3. Our team will review and investigate

## Important: No Automatic Refunds

Reports and disputes help us improve safety and enforce our rules. However:

- Disputes **never** automatically refund tokens
- Token transactions are final
- Refunds are **extremely rare** and only granted in exceptional circumstances with clear evidence of platform malfunction

Use reports and disputes to help us maintain a safe platform, not to reverse transactions.`,
        language: 'en',
        tags: ['reports', 'disputes', 'safety', 'moderation'],
        isFeatured: true,
        platform: 'MOBILE',
      },
      {
        slug: 'trust-and-enforcement',
        categorySlug: 'trust-safety',
        title: 'Trust & Enforcement',
        content: `# Trust & Enforcement

## Trust Scores

Avalo uses a trust scoring system to:

- Detect risky or problematic behavior
- Protect users from scams and abuse
- Enforce community guidelines

## Risk Levels

Your account may be assigned a risk level based on:

- Reports against you
- Transaction patterns
- Behavior signals
- Verification status

## Enforcement Actions

Depending on risk level and violations, we may:

- Limit certain features (sending messages, earning, etc.)
- Reduce profile visibility
- Suspend earning capabilities
- Temporarily or permanently suspend accounts

## Appeals

If you believe an enforcement action was wrong:

1. Review the reason provided
2. Submit an appeal through the app
3. Provide any evidence supporting your case
4. Wait for review (typically 5-10 business days)

## Good Behavior

Maintain a good standing by:

- Being respectful and genuine
- Following community guidelines
- Completing transactions honestly
- Not engaging in scams or manipulation`,
        language: 'en',
        tags: ['trust', 'enforcement', 'risk-score', 'restrictions'],
        isFeatured: false,
        platform: 'MOBILE',
      },
      {
        slug: 'regional-and-nsfw-policy',
        categorySlug: 'content-and-monetization',
        title: 'Regional & NSFW Policy',
        content: `# Regional & NSFW Policy

## Content Classification

Creators must accurately classify their content:

- **Safe**: General audience content
- **NSFW** (Not Safe For Work): Adult content, nudity, sexual themes

## Regional Restrictions

Content availability may be restricted based on:

- Local laws and regulations
- Regional content policies
- User location

## Creator Responsibility

As a creator, you are responsible for:

- Accurately classifying your content
- Understanding and following local laws
- Respecting regional content restrictions
- Not posting illegal content

## Violations

Failure to properly classify content or posting illegal material may result in:

- Content removal
- Earning restrictions
- Account suspension`,
        language: 'en',
        tags: ['nsfw', 'regional', 'content-policy', 'classification'],
        isFeatured: false,
        platform: 'MOBILE',
      },
      {
        slug: 'security-and-sessions',
        categorySlug: 'accounts-security',
        title: 'Security & Sessions',
        content: `# Security & Sessions

## Device Tracking

We track devices and sessions to:

- Protect your account
- Detect suspicious logins
- Allow you to manage active sessions

## Security Features

- **2FA**: Two-factor authentication for sensitive actions
- **Session Management**: View and revoke active sessions
- **Device Trust**: Mark trusted devices
- **Login Alerts**: Get notified of new logins

## What To Do If Compromised

If you suspect your account is compromised:

1. Change your password immediately
2. Revoke all sessions except current
3. Enable 2FA
4. Review recent activity
5. Contact support if needed

## Best Practices

- Use a strong, unique password
- Enable 2FA for extra security
- Don't share your login credentials
- Log out from shared devices
- Review active sessions regularly`,
        language: 'en',
        tags: ['security', 'sessions', '2fa', 'devices'],
        isFeatured: false,
        platform: 'MOBILE',
      },
      {
        slug: 'data-privacy-and-rights',
        categorySlug: 'legal-and-privacy',
        title: 'Data Privacy & Rights',
        content: `# Data Privacy & Rights

## Your Data Rights

Under GDPR and similar regulations, you have the right to:

- **Access**: Request a copy of your data
- **Erasure**: Request account deletion
- **Rectification**: Correct inaccurate data
- **Portability**: Export your data

## Data We Collect

- Profile information
- Messages and content
- Transaction history
- Device and session data
- Usage patterns

## Why We Keep Data

- Provide and improve services
- Compliance with legal obligations
- Prevent fraud and abuse
- Financial record keeping

## Data Retention

- Most data is deleted when you delete your account
- Financial records are pseudonymized and retained for legal compliance
- Some data may be retained for safety and anti-abuse purposes

## Requesting Data Export or Deletion

1. Go to Settings > Privacy & Data
2. Choose "Export My Data" or "Delete Account"
3. Follow the prompts
4. Wait for processing (typically 7-14 days)`,
        language: 'en',
        tags: ['privacy', 'gdpr', 'data-rights', 'deletion'],
        isFeatured: false,
        platform: 'MOBILE',
      },
      {
        slug: 'creator-analytics-guide',
        categorySlug: 'content-and-monetization',
        title: 'Creator Analytics Guide',
        content: `# Creator Analytics Guide

## Available Analytics

Creators can view:

- Earnings summary (lifetime and last 30 days)
- Earnings by source (chat, media, calls, etc.)
- Top performing content
- Daily earnings trends

## How to Read Analytics

### Earnings Summary

Shows your total earnings broken down by:

- Time period (lifetime, last 30 days)
- Revenue source (which features earned most)
- Current balance (available for payout)

### Timeseries Charts

Visualize your earnings over time to:

- Identify trends
- See impact of new content
- Plan your activity

### Top Content

See which of your content pieces performed best:

- Ranked by total earnings
- Shows unlock counts
- Helps you understand what resonates

## Important Notes

- Analytics are **descriptive only**
- They show past performance, not future predictions
- Earnings are never guaranteed
- Use analytics to inform your strategy, not as promises`,
        language: 'en',
        tags: ['analytics', 'creators', 'earnings', 'insights'],
        isFeatured: false,
        platform: 'MOBILE',
      },
    ];

    for (const article of articles) {
      const categoryId = categoryIds[article.categorySlug];
      if (!categoryId) {
        console.warn(`Category ${article.categorySlug} not found for article ${article.slug}`);
        continue;
      }

      await db.collection('help_articles').add({
        slug: article.slug,
        categoryId,
        title: article.title,
        content: article.content,
        language: article.language,
        tags: article.tags,
        isFeatured: article.isFeatured,
        platform: article.platform,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      success: true,
      message: `Created ${categories.length} categories and ${articles.length} articles`,
      categoriesCreated: categories.length,
      articlesCreated: articles.length,
    };
  } catch (error: any) {
    console.error('[HelpCenter] Error seeding content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});