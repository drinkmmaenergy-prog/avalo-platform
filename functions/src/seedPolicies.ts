/**
 * PACK 55 — Policy Documents Seeding
 * Initialize default policy documents
 */

import { db, admin } from './init';
import { PolicyDocument, PolicyType } from './compliancePack55';

// ============================================================================
// POLICY CONTENT (STUB - Replace with actual legal text)
// ============================================================================

const POLICY_CONTENT: Record<PolicyType, { title: string; content: string }> = {
  TERMS: {
    title: 'Terms and Conditions',
    content: `# Avalo Terms and Conditions

**Last Updated: January 2025**

## 1. Acceptance of Terms

By accessing and using Avalo, you agree to be bound by these Terms and Conditions.

## 2. Eligibility

- You must be at least 18 years old to use Avalo
- You must provide accurate age verification information
- You agree to use the platform in accordance with all applicable laws

## 3. User Conduct

- You will not engage in harassment, hate speech, or abuse
- You will not post illegal content or engage in illegal activities
- You will respect other users' privacy and safety

## 4. Monetization

- Token-based economy with transparent pricing
- 65/35 revenue split for creators
- No refunds for token purchases (except as required by law)

## 5. Account Termination

We reserve the right to suspend or terminate accounts that violate these terms.

## 6. Changes to Terms

We may update these terms from time to time. Continued use constitutes acceptance of updated terms.

For full terms, visit: https://avalo.app/legal/terms`,
  },

  PRIVACY: {
    title: 'Privacy Policy',
    content: `# Avalo Privacy Policy

**Last Updated: January 2025**

## 1. Information We Collect

- Profile information (name, age, photos)
- Usage data and analytics
- Payment information (processed by Stripe)
- Communication content for safety and moderation

## 2. How We Use Your Information

- To provide and improve our services
- To enable monetization features
- To ensure platform safety and compliance
- To communicate with you about our services

## 3. Data Sharing

- We do not sell your personal data
- We share data with service providers (Stripe, cloud hosting)
- We may share data as required by law

## 4. Your Rights (GDPR)

- Right to access your data
- Right to data portability
- Right to erasure ("right to be forgotten")
- Right to restrict processing

## 5. Data Security

We implement industry-standard security measures to protect your data.

## 6. Contact

For privacy inquiries: privacy@avalo.app

For full policy, visit: https://avalo.app/legal/privacy`,
  },

  SAFETY: {
    title: 'Safety Policy',
    content: `# Avalo Safety Policy

**Last Updated: January 2025**

## 1. Our Commitment to Safety

Avalo is committed to providing a safe platform for all users.

## 2. Age Verification

- All users must be 18+
- Age verification is required for monetized features
- False age declaration may result in permanent ban

## 3. Content Safety

- All user-generated media is scanned for CSAM and harmful content
- Flagged content is reviewed by moderation team
- Violations result in content removal and potential account action

## 4. Reporting

- Users can report violations directly in the app
- All reports are reviewed by trained moderators
- False reports may result in account restrictions

## 5. Safe-Meet Features

- Use our Safe-Meet feature for in-person meetings
- Share location with trusted contacts
- SOS emergency features available

For full policy, visit: https://avalo.app/legal/safety`,
  },

  AML: {
    title: 'AML/KYC Policy',
    content: `# Anti-Money Laundering (AML) Policy

**Last Updated: January 2025**

## 1. Purpose

Avalo complies with anti-money laundering regulations and implements KYC procedures.

## 2. KYC Requirements

KYC verification is required when:
- You earn more than 2,000 EUR equivalent in tokens per year
- You request payout of earnings
- Flagged by automated risk assessment

## 3. Verification Levels

- **BASIC**: Identity document verification
- **FULL**: Additional proof of address and source of funds

## 4. Monitoring

We monitor token earnings and transactions for suspicious activity.

## 5. Reporting

Suspicious activity is reported to relevant authorities as required by law.

For full policy, visit: https://avalo.app/legal/aml`,
  },

  MONETIZATION: {
    title: 'Creator Monetization Policy',
    content: `# Creator Monetization Policy

**Last Updated: January 2025**

## 1. Earning Eligibility

To earn on Avalo, you must:
- Be 18 years or older
- Accept all monetization terms
- Comply with content guidelines
- Complete KYC when required

## 2. Revenue Split

- 65% to creator
- 35% platform fee (covers infrastructure, payment processing, moderation)

## 3. Pricing Rules

- Creators set prices from preset options
- No discounts that eliminate the platform fee
- No free tokens or bonus schemes

## 4. Payouts

- Minimum payout threshold applies
- KYC required for payouts above certain thresholds
- Payouts processed via supported payment methods

## 5. Violations

Violations may result in:
- Temporary earning suspension
- Permanent ban from monetization
- Funds held pending investigation

For full policy, visit: https://avalo.app/legal/monetization`,
  },

  MARKETPLACE: {
    title: 'Creator Marketplace Policy',
    content: `# Creator Marketplace Policy

**Last Updated: January 2025**

## 1. Marketplace Participation

The Creator Marketplace allows users to discover and connect with creators who monetize their content.

## 2. Creator Requirements

- Must be age-verified (18+)
- Must accept monetization policy
- Must maintain good standing (no active bans)
- Must comply with content guidelines

## 3. Transparency

- All pricing is displayed upfront
- Revenue split (65/35) is transparent
- No hidden fees for users

## 4. Quality Standards

- Creators must deliver promised content/services
- Disputes are handled by moderation team
- Repeated violations result in removal from marketplace

For full policy, visit: https://avalo.app/legal/marketplace`,
  },

  COOKIES: {
    title: 'Cookie Policy',
    content: `# Cookie Policy

**Last Updated: January 2025**

## 1. What Are Cookies

Cookies are small text files stored on your device to enhance your experience.

## 2. Cookies We Use

- **Essential cookies**: Required for app functionality
- **Analytics cookies**: Help us understand usage patterns
- **Preference cookies**: Remember your settings

## 3. Mobile App

Our mobile app uses similar local storage mechanisms (AsyncStorage) for:
- Authentication state
- User preferences
- Cache for performance

## 4. Your Choices

You can manage cookie preferences in your device settings.

## 5. Third-Party Cookies

We use third-party services (Firebase, Stripe) that may set their own cookies.

For full policy, visit: https://avalo.app/legal/cookies`,
  },
};

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

/**
 * Seed initial policy documents for both EN and PL
 */
export async function seedPolicyDocuments(): Promise<void> {
  console.log('[PolicySeed] Starting policy document seeding...');

  const now = admin.firestore.Timestamp.now();
  const version = '1.0.0';
  const locales = ['en', 'pl'];

  const policyTypes: PolicyType[] = ['TERMS', 'PRIVACY', 'SAFETY', 'AML', 'MONETIZATION', 'MARKETPLACE', 'COOKIES'];

  for (const policyType of policyTypes) {
    for (const locale of locales) {
      const docId = `${policyType}_${version}`;
      const policyRef = db.collection('policies').doc(docId);

      // Check if already exists
      const existing = await policyRef.get();
      if (existing.exists) {
        console.log(`[PolicySeed] Policy ${policyType} v${version} (${locale}) already exists, skipping`);
        continue;
      }

      const content = POLICY_CONTENT[policyType];
      
      const policyDoc: Omit<PolicyDocument, 'createdAt'> & { createdAt: admin.firestore.Timestamp } = {
        policyType,
        version,
        locale,
        title: content.title,
        contentMarkdown: content.content,
        isActive: true,
        createdAt: now,
      };

      await policyRef.set(policyDoc);
      console.log(`[PolicySeed] Created policy ${policyType} v${version} (${locale})`);
    }
  }

  console.log('[PolicySeed] Policy seeding complete');
}

/**
 * Cloud Function to seed policies (call once during setup)
 */
export async function seedPoliciesCallable(): Promise<{ success: boolean; message: string }> {
  try {
    await seedPolicyDocuments();
    return {
      success: true,
      message: 'Policy documents seeded successfully',
    };
  } catch (error: any) {
    console.error('[PolicySeed] Error seeding policies:', error);
    return {
      success: false,
      message: error.message,
    };
  }
}