/**
 * /legal/age-verification — Age Verification Policy Page
 *
 * Static legal content page for Avalo Age Verification Policy.
 * Linked from: Footer component.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Age Verification Policy — Avalo',
  description: 'Avalo Age Verification Policy — how we ensure users are 18+.',
};

export default function AgeVerificationPolicyPage() {
  return (
    <main className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto prose prose-gray">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 no-underline">
          ← Back to Avalo
        </Link>

        <h1 className="mt-8">Age Verification Policy</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>

        <h2>1. Age Requirement</h2>
        <p>
          Avalo is a platform exclusively for adults aged 18 years and older.
          By creating an account, you confirm that you meet this minimum age
          requirement. Any account found to belong to a person under 18 will be
          immediately suspended and deleted.
        </p>

        <h2>2. Verification Methods</h2>
        <p>
          Avalo may employ the following methods to verify user age:
        </p>
        <ul>
          <li>Self-declaration during registration</li>
          <li>Government-issued ID verification for certain features</li>
          <li>Third-party age verification services</li>
          <li>AI-assisted age estimation (supplementary only)</li>
        </ul>

        <h2>3. When Verification Is Required</h2>
        <p>
          Age verification may be required when: (a) creating an account;
          (b) activating Creator Mode; (c) purchasing tokens; (d) accessing
          age-restricted content; (e) when flagged by our safety systems.
        </p>

        <h2>4. Data Handling</h2>
        <p>
          Verification documents are processed securely and are not stored longer
          than necessary. See our{' '}
          <Link href="/legal/privacy">Privacy Policy</Link> for details on how
          verification data is handled.
        </p>

        <h2>5. Parental Responsibility</h2>
        <p>
          Parents and guardians are responsible for monitoring their children&apos;s
          internet usage. If you believe a minor has created an account on Avalo,
          please contact us immediately at{' '}
          <a href="mailto:safety@avalo.app">safety@avalo.app</a>.
        </p>

        <h2>6. Compliance</h2>
        <p>
          Our age verification practices comply with applicable regulations
          including GDPR, COPPA, and the EU Digital Services Act. We continuously
          update our verification methods to meet evolving regulatory requirements.
        </p>

        <h2>7. Contact</h2>
        <p>
          For questions about our age verification policy, contact{' '}
          <a href="mailto:legal@avalo.app">legal@avalo.app</a>.
        </p>
      </div>
    </main>
  );
}

