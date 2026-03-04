/**
 * /legal/community — Community Rules Page
 *
 * Static legal content page for Avalo Community Rules.
 * Linked from: Footer component.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Community Rules — Avalo',
  description: 'Avalo Community Rules — standards of conduct for all users.',
};

export default function CommunityRulesPage() {
  return (
    <main className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto prose prose-gray">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 no-underline">
          ← Back to Avalo
        </Link>

        <h1 className="mt-8">Community Rules</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>

        <h2>1. Respect &amp; Kindness</h2>
        <p>
          Treat every member of the Avalo community with respect. Harassment,
          bullying, hate speech, and discrimination of any kind are strictly
          prohibited. We are building a space where everyone feels welcome.
        </p>

        <h2>2. Authenticity</h2>
        <p>
          Be yourself. Do not impersonate others or create misleading profiles.
          Verified profiles must accurately represent the account holder.
          Catfishing and identity fraud result in permanent account suspension.
        </p>

        <h2>3. Safety First</h2>
        <p>
          Never share personal information (addresses, financial details, passwords)
          in public or private interactions. Report any user who requests sensitive
          information or makes you feel unsafe.
        </p>

        <h2>4. Prohibited Content</h2>
        <p>The following content is strictly prohibited on Avalo:</p>
        <ul>
          <li>Content involving minors in any sexual or exploitative context</li>
          <li>Non-consensual intimate imagery</li>
          <li>Content promoting violence, self-harm, or terrorism</li>
          <li>Spam, scams, or fraudulent schemes</li>
          <li>Content that violates intellectual property rights</li>
          <li>Illegal drugs or controlled substances</li>
        </ul>

        <h2>5. Token Economy Rules</h2>
        <p>
          Token manipulation, fraud, or exploitation of the economy system is
          prohibited. All token transactions must be genuine. Attempting to exploit
          bugs or loopholes for economic gain will result in account suspension and
          forfeiture of tokens.
        </p>

        <h2>6. Reporting &amp; Enforcement</h2>
        <p>
          Report violations using the in-app reporting tools. Our moderation team
          reviews reports within 24 hours. Enforcement actions range from warnings
          to permanent bans, depending on severity.
        </p>

        <h2>7. Appeals</h2>
        <p>
          If you believe an enforcement action was made in error, you may submit an
          appeal through your account settings. Appeals are reviewed within 7 business
          days.
        </p>

        <h2>8. Contact</h2>
        <p>
          For questions about Community Rules, contact{' '}
          <a href="mailto:community@avalo.app">community@avalo.app</a>.
        </p>
      </div>
    </main>
  );
}

