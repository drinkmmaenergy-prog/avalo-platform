/**
 * /legal/terms — Terms of Service
 *
 * Production wording for Avalo Terms of Service.
 * Includes 18+ age notice, token economy terms, and refund policy reference.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Terms of Service — Avalo',
  description: 'Avalo Terms of Service. You must be 18+ to use this platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Terms of Service</h1>
          <p className="text-sm text-gray-500">Last updated: February 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ Age Restriction: You must be at least 18 years old to create an account, use the platform, or purchase tokens on Avalo.
            </p>
          </div>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Avalo platform (&quot;Service&quot;), including our website, mobile applications, and any related services provided by Avalo sp. z o.o. (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use the Service. By using the Service, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into a binding agreement. We reserve the right to request age verification at any time and to suspend or terminate accounts that fail to meet this requirement.
          </p>

          <h2>3. Account Registration</h2>
          <p>
            To access certain features, you must create an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must provide accurate, current, and complete information during registration and keep your account information updated.
          </p>

          <h2>4. Token Economy</h2>
          <p>
            Avalo operates a token-based economy with the following terms:
          </p>
          <ul>
            <li>Tokens are a virtual currency used within the Avalo platform and have no cash value outside the platform.</li>
            <li>One (1) chat message costs one hundred (100) tokens.</li>
            <li>Token packs are available for purchase at prices listed in the platform at the time of purchase.</li>
            <li>Token purchases are final and non-refundable, except as required by applicable consumer protection laws. See our <a href="/legal/refund">Refund Policy</a> for details.</li>
            <li>We reserve the right to modify token pricing and pack availability at any time, with changes effective upon posting to the platform.</li>
          </ul>

          <h2>5. Creator Earnings and Payouts</h2>
          <p>
            Creators on the Avalo platform earn tokens for their content and interactions. Creator payouts are subject to the following:
          </p>
          <ul>
            <li>The revenue split between creators and the platform is fixed at 65% creator / 35% platform.</li>
            <li>Creator payout rates are determined by the platform and published in the Creator Agreement.</li>
            <li>Payouts are processed according to the schedule and methods described in the Creator Agreement.</li>
            <li>All payouts are subject to applicable tax withholding and reporting requirements.</li>
          </ul>

          <h2>6. Payments and Billing</h2>
          <p>
            All payments are processed securely through Stripe. By making a purchase, you agree to Stripe&apos;s <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer">Terms of Service</a>. Prices are displayed inclusive of applicable taxes (VAT/GST) where required by law. You are responsible for any additional taxes or fees imposed by your jurisdiction.
          </p>

          <h2>7. Prohibited Conduct</h2>
          <p>
            You agree not to:
          </p>
          <ul>
            <li>Use the Service for any illegal purpose or in violation of applicable laws.</li>
            <li>Harass, bully, threaten, or intimidate other users.</li>
            <li>Upload or share content involving minors in any sexual or exploitative context.</li>
            <li>Engage in fraud, token farming, or manipulation of platform systems.</li>
            <li>Attempt to reverse-engineer, decompile, or disassemble any part of the Service.</li>
            <li>Create fake accounts, impersonate others, or misrepresent your identity.</li>
            <li>Use automated tools, bots, or scripts to interact with the Service without prior written authorization.</li>
          </ul>

          <h2>8. Content and Intellectual Property</h2>
          <p>
            You retain ownership of content you create and upload to the Service. By uploading content, you grant Avalo a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content as necessary to operate the Service. You are solely responsible for ensuring that your content does not infringe on any third-party rights.
          </p>

          <h2>9. Termination</h2>
          <p>
            We may suspend or terminate your account at any time for violation of these Terms or for any other reason at our sole discretion. Upon termination, your right to use the Service ceases immediately. Any unused tokens in your account at the time of termination are forfeited unless otherwise required by applicable law.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Avalo sp. z o.o. shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or goodwill, arising out of or in connection with your use of the Service.
          </p>

          <h2>11. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the Republic of Poland, without regard to its conflict of laws provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Warsaw, Poland.
          </p>

          <h2>12. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify users of material changes via email or in-app notification. Your continued use of the Service after such changes constitutes acceptance of the modified Terms.
          </p>

          <h2>13. Contact</h2>
          <p>
            For questions about these Terms, contact us at: <a href="mailto:legal@avalo.app">legal@avalo.app</a>
          </p>
          <p>
            Avalo sp. z o.o.<br />
            Warsaw, Poland
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}

