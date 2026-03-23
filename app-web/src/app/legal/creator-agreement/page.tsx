/**
 * /legal/creator-agreement — Creator Agreement
 *
 * Comprehensive production Creator Agreement for Avalo Inc.
 * Covers: eligibility, revenue splits, payouts, content ownership,
 * tax responsibilities, prohibited conduct, calendar meetings, termination.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Creator Agreement — Avalo',
  description: 'Avalo Creator Agreement. Terms for creators earning on the Avalo platform.',
};

export default function CreatorAgreementPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Creator Agreement</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-pink-800 font-semibold">
              This Creator Agreement (&quot;Agreement&quot;) governs your participation in the Avalo Creator Program. By activating Creator features, you agree to be bound by this Agreement in addition to the <a href="/legal/terms" className="text-pink-700 underline">Terms of Service</a>.
            </p>
          </div>

          {/* 1. Who is a Creator */}
          <h2>1. Who is a Creator/Earner on Avalo</h2>
          <p>
            A &quot;Creator&quot; or &quot;Earner&quot; is any user who has activated the Avalo Creator Program and earns tokens through the platform. Creators can earn through various monetization channels including:
          </p>
          <ul>
            <li>Receiving tips and gifts from other users</li>
            <li>Paid chat messages and media unlocks</li>
            <li>Voice and video calls</li>
            <li>Subscription-based content (monthly subscriber model)</li>
            <li>Pay-per-view (PPV) locked media</li>
            <li>Live streaming with virtual gifts</li>
            <li>Calendar meetings (in-person and virtual)</li>
            <li>Event hosting</li>
            <li>AI companion bots (creator persona-based)</li>
          </ul>
          <p>
            To become a Creator, you must be at least 18 years old, have a verified Avalo account (selfie verification completed), and agree to this Agreement.
          </p>

          {/* 2. Revenue Splits */}
          <h2>2. Revenue Splits</h2>
          <p>
            Avalo operates a transparent revenue-sharing model. The following splits apply to tokens earned through each channel:
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Earning Channel</th>
                  <th>Creator Share</th>
                  <th>Avalo Share</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Chat / Tips / Calls / Media / Live</td>
                  <td><strong>65%</strong></td>
                  <td>35%</td>
                </tr>
                <tr>
                  <td>Subscriptions</td>
                  <td><strong>70%</strong></td>
                  <td>30%</td>
                </tr>
                <tr>
                  <td>Calendar / Events</td>
                  <td><strong>80%</strong></td>
                  <td>20%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Revenue splits are calculated at the time of each transaction and reflected in your Creator Dashboard in real time. Avalo reserves the right to modify revenue splits with 30 days&apos; prior written notice. Any changes will only apply to transactions occurring after the effective date of the change.
          </p>

          {/* 3. Payout Terms */}
          <h2>3. Payout Terms</h2>
          <ul>
            <li><strong>Payout Rate:</strong> $0.03 USD per token earned.</li>
            <li><strong>KYC Requirement:</strong> You must complete identity verification (Know Your Customer) before requesting any payout. This includes providing government-issued identification and completing our verification process.</li>
            <li><strong>Minimum Withdrawal:</strong> 100 tokens minimum per payout request.</li>
            <li><strong>Platform Fee:</strong> A 5% processing fee is deducted from each payout to cover payment processing, currency conversion, and administrative costs.</li>
            <li><strong>Payout Methods:</strong> Payouts are processed via bank transfer or supported payment providers as available in your region.</li>
            <li><strong>Processing Time:</strong> Payout requests are typically processed within 5–10 business days after verification.</li>
            <li><strong>Currency:</strong> All payouts are denominated in USD and converted to your local currency at prevailing exchange rates by the payment processor.</li>
            <li><strong>Holds:</strong> Avalo may place a temporary hold on payouts pending investigation of suspicious activity, disputes, or Terms violations.</li>
          </ul>

          {/* 4. Content Ownership and Licensing */}
          <h2>4. Content Ownership and Licensing</h2>
          <p>
            <strong>You own your content.</strong> By uploading content to Avalo, you grant Avalo a non-exclusive, worldwide, royalty-free, sublicensable license to use, display, reproduce, modify (for formatting and display purposes), and distribute your content as necessary to operate, promote, and improve the Service.
          </p>
          <ul>
            <li>You represent and warrant that you own or have all necessary rights to the content you upload.</li>
            <li>You are solely responsible for ensuring your content does not infringe on any third-party intellectual property rights.</li>
            <li>The license granted to Avalo terminates when you delete your content or your account, except for content that has been shared with other users (e.g., sent in messages) or that is required to be retained for legal or safety purposes.</li>
            <li>Avalo does not claim ownership over your content at any time.</li>
          </ul>

          {/* 5. Tax Responsibilities */}
          <h2>5. Tax Responsibilities</h2>
          <p>
            <strong>You are an independent contractor.</strong> By accepting this Agreement, you acknowledge that:
          </p>
          <ul>
            <li>You are acting as an independent contractor (B2B — Business to Business) and NOT as an employee, agent, partner, or joint venturer of Avalo Inc.</li>
            <li>Avalo does not withhold income tax, social security, or any other taxes from your payouts (except where required by law, such as backup withholding for US tax residents who fail to provide a valid W-9).</li>
            <li>You are solely responsible for reporting and paying all applicable taxes on your Avalo earnings in your jurisdiction of residence, including but not limited to income tax, VAT/GST, self-employment tax, and social contributions.</li>
            <li>If required by your jurisdiction, you must issue invoices to Avalo for your earnings.</li>
            <li>US-based Creators earning more than $600 per calendar year will receive a Form 1099-NEC.</li>
            <li>Non-US Creators may be required to complete a W-8BEN form.</li>
            <li>Avalo is not responsible for any tax penalties, interest, or liabilities arising from your failure to comply with your tax obligations.</li>
          </ul>

          {/* 6. Prohibited Creator Conduct */}
          <h2>6. Prohibited Creator Conduct</h2>
          <p>
            In addition to the general <a href="/legal/community">Community Guidelines</a>, Creators are specifically prohibited from:
          </p>
          <ul>
            <li>Directing users to pay off-platform (PayPal, Venmo, crypto, etc.) to avoid platform fees.</li>
            <li>Misleading users about content behind paywalls (bait-and-switch).</li>
            <li>Using the Calendar feature to solicit or provide sexual or escort services.</li>
            <li>Creating fake accounts to send tokens to themselves or colluding with others for token farming.</li>
            <li>Sharing purchased content of other creators without permission.</li>
            <li>Harassing or pressuring users into purchasing content or services.</li>
            <li>Uploading content that they do not have rights to monetize.</li>
            <li>Using copyrighted music, images, or videos without proper licensing.</li>
            <li>Engaging in predatory or manipulative monetization practices.</li>
          </ul>

          {/* 7. Account Termination and Unpaid Balance */}
          <h2>7. Account Termination and Unpaid Balance</h2>
          <ul>
            <li><strong>Voluntary Termination:</strong> If you choose to deactivate your Creator status or delete your account, any earned token balance that has met the minimum withdrawal threshold and is associated with a verified KYC identity will be processed as a final payout within 30 days.</li>
            <li><strong>Termination for Violation:</strong> If your account is terminated for violation of this Agreement, the Terms of Service, or Community Guidelines:
              <ul>
                <li>For minor violations: remaining earned balance will be paid out after a 60-day holding period.</li>
                <li>For fraud, abuse, or severe violations: all unpaid token balances are forfeited.</li>
              </ul>
            </li>
            <li><strong>Dispute:</strong> If you believe your termination was in error, you may appeal by contacting <a href="mailto:creators@avalo.app">creators@avalo.app</a> within 14 days of termination.</li>
          </ul>

          {/* 8. Calendar Meetings */}
          <h2>8. Calendar Meetings — Creator Responsibilities</h2>
          <p>
            Creators who offer Calendar meetings are offering their <strong>time</strong> for social interactions, not sexual services. Specifically:
          </p>
          <ul>
            <li>Calendar meetings are for friendship, networking, mentoring, social activities, language exchange, hobby meetups, and other lawful social purposes.</li>
            <li>Creators set their own meeting rates in tokens. The revenue split for Calendar is 80% Creator / 20% Avalo.</li>
            <li>Creators must accurately represent what guests can expect from a meeting.</li>
            <li>Creators must appear as represented in their profile photos. Failure to match profile photos may result in a &quot;mismatch&quot; report and refund.</li>
            <li>Creators must not solicit, offer, or arrange sexual services, escort services, or any form of commercial sexual activity through the Calendar feature.</li>
            <li>Creators are responsible for their own safety during meetings. See our <a href="/legal/safety">Safety Policy</a> for recommendations.</li>
          </ul>
          <p>
            Full Calendar terms are available in our <a href="/legal/calendar-policy">Meeting Policy</a> and <a href="/legal/refund">Refund Policy</a>.
          </p>

          {/* 9. Modifications */}
          <h2>9. Modifications to This Agreement</h2>
          <p>
            Avalo reserves the right to modify this Agreement at any time. We will provide at least 30 days&apos; notice of material changes via email and/or in-app notification. Continued participation in the Creator Program after the effective date of changes constitutes acceptance. If you do not agree to modified terms, you may deactivate your Creator status.
          </p>

          {/* 10. Contact */}
          <h2>10. Contact</h2>
          <p>
            For questions about this Creator Agreement or the Creator Program:
          </p>
          <p>
            <a href="mailto:creators@avalo.app">creators@avalo.app</a><br />
            <a href="mailto:legal@avalo.app">legal@avalo.app</a>
          </p>
          <p>
            Avalo Inc.<br />
            State of Incorporation: Delaware, USA
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}
