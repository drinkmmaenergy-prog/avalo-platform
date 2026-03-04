/**
 * /legal/safety — Safety Policy Page
 *
 * Static legal content page for Avalo Safety Policy.
 * Linked from: Footer component.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Safety Policy — Avalo',
  description: 'Avalo Safety Policy — how we protect our community.',
};

export default function SafetyPolicyPage() {
  return (
    <main className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto prose prose-gray">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 no-underline">
          ← Back to Avalo
        </Link>

        <h1 className="mt-8">Safety Policy</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>

        <h2>1. Our Commitment</h2>
        <p>
          Avalo is committed to maintaining a safe environment for all users.
          We employ a multi-layered safety system including AI-powered content
          moderation, human reviewers, and community reporting tools.
        </p>

        <h2>2. Content Moderation</h2>
        <p>
          All user-generated content is subject to automated and manual review.
          Our AI moderation systems scan content in real-time for policy violations.
          Human moderators handle escalated cases and appeals.
        </p>

        <h2>3. Account Verification</h2>
        <p>
          Avalo supports identity verification to help users connect with
          authentic profiles. Verified badges indicate that a user has completed
          identity verification.
        </p>

        <h2>4. Reporting Tools</h2>
        <p>
          Users can report concerning content or behavior directly from any
          profile, message, or post. Reports are reviewed by our Trust &amp; Safety
          team. Emergency reports involving imminent danger are prioritized.
        </p>

        <h2>5. Blocking &amp; Restricting</h2>
        <p>
          Users can block or restrict other users at any time. Blocked users
          cannot view your profile, send messages, or interact with your content.
        </p>

        <h2>6. Minor Protection</h2>
        <p>
          Avalo is strictly for users aged 18 and older. We employ age verification
          measures and remove any accounts found to belong to minors. Content
          involving the exploitation of minors is immediately removed and reported
          to relevant authorities.
        </p>

        <h2>7. Data Protection</h2>
        <p>
          User safety data, reports, and moderation records are handled with
          strict confidentiality. See our{' '}
          <Link href="/legal/privacy">Privacy Policy</Link> for details on data
          handling practices.
        </p>

        <h2>8. Emergency Contacts</h2>
        <p>
          If you or someone you know is in immediate danger, please contact your
          local emergency services. For platform safety concerns, reach our
          Safety team at{' '}
          <a href="mailto:safety@avalo.app">safety@avalo.app</a>.
        </p>
      </div>
    </main>
  );
}

