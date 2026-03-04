/**
 * /legal/creator-agreement — Creator Agreement Page
 *
 * Static legal content page for the Avalo Creator Agreement.
 * Linked from: Footer component.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Creator Agreement — Avalo',
  description: 'Avalo Creator Agreement — terms governing creator accounts.',
};

export default function CreatorAgreementPage() {
  return (
    <main className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto prose prose-gray">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 no-underline">
          ← Back to Avalo
        </Link>

        <h1 className="mt-8">Creator Agreement</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>

        <h2>1. Introduction</h2>
        <p>
          This Creator Agreement (&quot;Agreement&quot;) governs your participation as a
          Creator on the Avalo platform. By activating Creator Mode, you agree to
          be bound by this Agreement in addition to our{' '}
          <Link href="/legal/terms">Terms of Service</Link>.
        </p>

        <h2>2. Creator Eligibility</h2>
        <p>
          To become a Creator on Avalo, you must: (a) be at least 18 years of age;
          (b) have a verified account in good standing; (c) agree to comply with all
          applicable laws and our Community Rules.
        </p>

        <h2>3. Revenue Share</h2>
        <p>
          Creators earn 65% of token revenue generated through their content and
          interactions (the &quot;Creator Share&quot;). Avalo retains 35% as the
          platform fee. All monetary values are denominated in USD.
        </p>
        <p>
          Token payouts are calculated at a fixed rate of $0.03 USD per token earned.
          This rate is subject to change with 30 days&apos; advance notice.
        </p>

        <h2>4. Payouts</h2>
        <p>
          Payouts are processed via Stripe Connect. Creators must connect a valid
          Stripe account and complete identity verification to receive payouts.
          Minimum payout threshold is $10 USD.
        </p>

        <h2>5. Content Ownership</h2>
        <p>
          You retain all intellectual property rights to your original content.
          By posting content on Avalo, you grant Avalo a non-exclusive, worldwide
          license to display, distribute, and promote your content within the platform.
        </p>

        <h2>6. Prohibited Conduct</h2>
        <p>
          Creators must not: engage in fraud or token manipulation; create content
          that violates our Community Rules; misrepresent their identity; engage
          in harassment or abuse of users; manipulate engagement metrics.
        </p>

        <h2>7. Termination</h2>
        <p>
          Either party may terminate this Agreement at any time. Upon termination,
          pending payouts above the minimum threshold will be processed within 30 days.
          Avalo reserves the right to suspend or terminate Creator accounts for
          violations of this Agreement.
        </p>

        <h2>8. Modifications</h2>
        <p>
          Avalo may update this Agreement with 30 days&apos; notice. Continued
          use of Creator features after changes take effect constitutes acceptance
          of the modified Agreement.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about this Agreement, contact us at{' '}
          <a href="mailto:creators@avalo.app">creators@avalo.app</a>.
        </p>
      </div>
    </main>
  );
}

