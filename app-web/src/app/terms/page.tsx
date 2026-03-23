'use client';

/**
 * FIX 65A: Terms of Service page at /terms (short URL).
 *
 * Required for App Store, Google Play, Stripe, and GDPR compliance.
 * The full legal version also exists at /legal/terms.
 */

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-24 prose prose-sm">
      <h1>Terms of Service</h1>
      <p className="text-gray-500">Last updated: March 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using Avalo (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>

      <h2>2. Eligibility</h2>
      <p>You must be at least 18 years old to use Avalo. By registering, you confirm you meet this age requirement. Age verification may be required for certain features.</p>

      <h2>3. Account Registration</h2>
      <p>You are responsible for maintaining the confidentiality of your account. You must provide accurate information and keep it updated. One account per person.</p>

      <h2>4. User Content</h2>
      <p>You retain ownership of content you post. By posting, you grant Avalo a non-exclusive license to display, distribute, and promote your content on the Platform. You are responsible for ensuring your content does not violate any laws or rights.</p>

      <h2>5. Prohibited Content</h2>
      <p>The following is prohibited in all public spaces: sexually explicit content, nudity, harassment, hate speech, violence, illegal activities, spam, impersonation, and content involving minors. Adult content is permitted only in private direct messages between verified adults who have both opted in.</p>

      <h2>6. Token Economy</h2>
      <p>Tokens are a virtual currency used within the Platform. Tokens have no cash value outside the Platform. Token purchases are non-refundable except as required by law. Creators can request payout of earned tokens at the fixed settlement rate.</p>

      <h2>7. Fees and Commissions</h2>
      <p>Avalo takes a commission on creator earnings: Chat/Tips/Media/Live: 35%, Subscriptions: 30%, Meetings/Events: 20%. These rates may change with 30 days notice.</p>

      <h2>8. Meeting Safety</h2>
      <p>For in-person meetings arranged through the calendar, tokens are held in escrow until meeting completion. Cancellation policy applies automatically. Report any safety concerns immediately.</p>

      <h2>9. Refund Policy</h2>
      <p>Refunds are available for: undelivered services, technical errors, cancelled events, and verified appearance mismatches. Emotional satisfaction, romantic expectations, and buyer&apos;s remorse are not valid grounds for refund.</p>

      <h2>10. Account Termination</h2>
      <p>You may delete your account at any time from Settings. Avalo may suspend or terminate accounts that violate these Terms. Earned but unpaid tokens will be forfeited upon termination for cause.</p>

      <h2>11. Disclaimer</h2>
      <p>Avalo is provided &ldquo;as is&rdquo;. We do not guarantee any outcomes from using the Platform, including matches, relationships, or earnings.</p>

      <h2>12. Contact</h2>
      <p>For questions about these Terms, contact: legal@avalo.app</p>
    </div>
  );
}
