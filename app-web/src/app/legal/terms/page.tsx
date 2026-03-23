/**
 * /legal/terms — Terms of Service
 *
 * Comprehensive production Terms of Service for Avalo Inc.
 * Covers: eligibility, token economy, creator terms, calendar feature,
 * AI companions, prohibited conduct, arbitration (Delaware).
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
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ Age Restriction: You must be at least 18 years old to create an account, use the platform, or purchase tokens on Avalo. In some jurisdictions, the minimum age may be 19, 20, or 21 as required by local law.
            </p>
          </div>

          {/* 1. Acceptance of Terms */}
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Avalo platform (&quot;Service&quot;), including our website, mobile applications, progressive web app, and any related services provided by Avalo Inc. (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;), a corporation registered in the State of Delaware, USA, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and Avalo Inc. Please read them carefully before using the Service. Additional terms may apply to specific features, such as the <a href="/legal/creator-agreement">Creator Agreement</a>, <a href="/legal/calendar-policy">Meeting Policy</a>, and <a href="/legal/community">Community Guidelines</a>, which are incorporated by reference.
          </p>

          {/* 2. Eligibility */}
          <h2>2. Eligibility</h2>
          <p>
            To use the Service, you must:
          </p>
          <ul>
            <li>Be at least 18 years of age (or the minimum legal age in your jurisdiction, if higher).</li>
            <li>Have the legal capacity to enter into a binding agreement.</li>
            <li>Not be prohibited from using the Service under applicable laws.</li>
            <li>Not have been previously banned or removed from the Service by Avalo.</li>
            <li>Not be a registered sex offender in any jurisdiction.</li>
          </ul>
          <p>
            By using the Service, you represent and warrant that you meet all eligibility requirements. We reserve the right to request verification of your age and identity at any time and to suspend or terminate accounts that fail to meet these requirements. See our <a href="/legal/age-verification">Age Verification Policy</a> for details.
          </p>

          {/* 3. Account Registration */}
          <h2>3. Account Registration</h2>
          <p>
            To access certain features, you must create an account. When registering, you agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration.</li>
            <li>Maintain and promptly update your account information to keep it truthful and current.</li>
            <li>Maintain the confidentiality of your login credentials and accept responsibility for all activities that occur under your account.</li>
            <li>Create only one account per person. Multiple accounts are prohibited and may result in termination.</li>
            <li>Complete any verification processes we may require, including but not limited to selfie verification and age verification.</li>
            <li>Notify us immediately of any unauthorized access to or use of your account.</li>
          </ul>
          <p>
            You may not assign or transfer your account to any other person or entity. Avalo reserves the right to refuse registration or cancel accounts at its sole discretion.
          </p>

          {/* 4. Platform Description */}
          <h2>4. Platform Description</h2>
          <p>
            Avalo is a premium social platform that provides the following services:
          </p>
          <ul>
            <li><strong>Dating &amp; Social Discovery:</strong> Connect with others based on shared interests, location, and preferences through our matching and discovery features.</li>
            <li><strong>Creator Economy:</strong> A marketplace where verified creators can monetize their content, interactions, and time through tokens, subscriptions, and paid media.</li>
            <li><strong>AI Companions:</strong> AI-powered conversation partners created by users and creators for entertainment, companionship, and engagement.</li>
            <li><strong>Calendar &amp; Meetings:</strong> A scheduling feature enabling users to arrange in-person or virtual meetings for friendship, networking, and social activities. See our <a href="/legal/calendar-policy">Meeting Policy</a> for specific terms.</li>
            <li><strong>Content Feed:</strong> Share and discover posts, stories, reels, and live streams.</li>
            <li><strong>Communication:</strong> Private messaging, voice calls, and video calls between matched or connected users.</li>
          </ul>
          <p>
            Avalo does not guarantee any specific outcomes, matches, connections, romantic results, or earnings. The Service is provided for facilitating social connections between consenting adults.
          </p>

          {/* 5. Token Economy */}
          <h2>5. Token Economy</h2>
          <p>
            Avalo operates a token-based virtual economy with the following terms:
          </p>
          <ul>
            <li><strong>Nature of Tokens:</strong> Tokens are a virtual currency used exclusively within the Avalo platform. Tokens are NOT cryptocurrency, securities, or any form of investment. Tokens have no cash value outside the platform and cannot be exchanged for fiat currency except through the official Creator payout system.</li>
            <li><strong>Purchases:</strong> Tokens may be purchased via Stripe or through in-app purchases on iOS and Android. Prices vary by region and are displayed at the time of purchase inclusive of applicable taxes.</li>
            <li><strong>Non-Refundable:</strong> Token purchases are final and non-refundable once tokens have been credited to your account, except as required by applicable consumer protection laws. See our <a href="/legal/refund">Refund Policy</a> for details.</li>
            <li><strong>Non-Transferable:</strong> Token balances are non-transferable between accounts. You may not sell, trade, gift, or otherwise transfer tokens to another user&apos;s account.</li>
            <li><strong>Usage:</strong> Tokens may be used for messaging, tipping creators, unlocking premium content, booking calendar meetings, purchasing subscriptions, and other platform features as available.</li>
            <li><strong>Pricing Changes:</strong> We reserve the right to modify token pricing and pack availability at any time, with changes effective upon posting to the platform.</li>
            <li><strong>Expiration:</strong> Token balances do not expire while your account remains active and in good standing.</li>
          </ul>

          {/* 6. Creator/Earner Terms */}
          <h2>6. Creator/Earner Terms</h2>
          <p>
            Users who participate in the Avalo Creator Program are subject to additional terms outlined in the <a href="/legal/creator-agreement">Creator Agreement</a>. Key terms include:
          </p>
          <ul>
            <li><strong>Revenue Splits:</strong>
              <ul>
                <li>Chat, Tips, Calls, Media, Live Streams: 65% Creator / 35% Avalo</li>
                <li>Subscriptions: 70% Creator / 30% Avalo</li>
                <li>Calendar/Events: 80% Creator / 20% Avalo</li>
              </ul>
            </li>
            <li><strong>Payout Rate:</strong> $0.03 USD per token earned.</li>
            <li><strong>KYC Requirement:</strong> Identity verification (Know Your Customer) is required before any payouts can be processed.</li>
            <li><strong>Platform Fee:</strong> A 5% processing fee applies to all payouts.</li>
            <li><strong>Minimum Withdrawal:</strong> 100 tokens minimum for payout requests.</li>
            <li><strong>Tax Obligations:</strong> Creators are solely responsible for reporting and paying all applicable taxes on their earnings. Creators operate as independent contractors, not employees of Avalo.</li>
          </ul>
          <p>
            By participating in the Creator Program, you agree to the full <a href="/legal/creator-agreement">Creator Agreement</a>.
          </p>

          {/* 7. Calendar & Meeting Feature */}
          <h2>7. Calendar &amp; Meeting Feature</h2>
          <p>
            The Calendar feature enables users to schedule in-person or virtual meetings for the purpose of friendship, professional networking, social activities, mentoring, and other lawful purposes. Full terms are available in our <a href="/legal/calendar-policy">Meeting Policy</a>.
          </p>
          <p>
            <strong>Avalo expressly prohibits the use of the Calendar feature to solicit, offer, or arrange sexual services, escort services, or any illegal activities.</strong> Users found soliciting sexual services through the Calendar feature will have their accounts permanently banned without refund.
          </p>
          <p>
            Avalo is not responsible for the conduct of users during meetings arranged through the platform. Users meet at their own risk. Consenting adults are responsible for their own decisions and actions outside the platform. Avalo&apos;s role ends at facilitating the initial connection.
          </p>
          <p>
            <strong>Cancellation Policy:</strong>
          </p>
          <ul>
            <li>Guest cancels more than 72 hours before meeting: 100% refund of host share (Avalo retains 20% fee)</li>
            <li>Guest cancels 24–72 hours before meeting: 50% refund</li>
            <li>Guest cancels less than 24 hours before meeting: No refund</li>
            <li>Host cancels at any time: Always 100% full refund to guest</li>
            <li>Mismatch report: Full refund if reported within 15 minutes after QR check-in</li>
          </ul>

          {/* 8. User Content */}
          <h2>8. User Content</h2>
          <p>
            You retain ownership of content you create and upload to the Service (&quot;User Content&quot;). By uploading User Content, you grant Avalo a non-exclusive, worldwide, royalty-free, sublicensable license to use, display, reproduce, modify (for formatting/display purposes), and distribute your content as necessary to operate, improve, and promote the Service.
          </p>
          <p>
            <strong>Prohibited Content:</strong> You must not upload, post, or transmit content that:
          </p>
          <ul>
            <li>Is illegal or promotes illegal activities in any jurisdiction.</li>
            <li>Contains child sexual abuse material (CSAM) or depicts minors in any sexual or exploitative context.</li>
            <li>Contains non-consensual intimate images (revenge porn).</li>
            <li>Constitutes harassment, bullying, threats, or hate speech.</li>
            <li>Is fraudulent, deceptive, or constitutes spam.</li>
            <li>Impersonates another person or entity.</li>
            <li>Infringes on intellectual property rights of third parties.</li>
            <li>Contains malware, viruses, or other harmful code.</li>
          </ul>
          <p>
            <strong>Private Messages:</strong> Avalo does not actively monitor private messages between verified 18+ users, except when content is reported by a participant. Reported messages are reviewed by our safety team in accordance with our <a href="/legal/safety">Safety Policy</a>.
          </p>

          {/* 9. AI Companions */}
          <h2>9. AI Companions</h2>
          <p>
            Avalo offers AI-powered companion features subject to the following terms:
          </p>
          <ul>
            <li><strong>Not Human:</strong> AI companions are not human beings. All responses are computer-generated. Users should not rely on AI companions for factual information, emotional support, or critical decisions.</li>
            <li><strong>No Professional Advice:</strong> AI companions do not provide medical, therapeutic, legal, financial, or any other form of professional advice. Seek qualified professionals for such needs.</li>
            <li><strong>NSFW Content:</strong> NSFW (Not Safe for Work) AI content is available only to verified 18+ users with an active Premium subscription. This content must comply with all applicable laws.</li>
            <li><strong>Creator Bots:</strong> Creators may build custom AI companions using their persona. The creator is responsible for the personality, tone, and content guidelines of their AI bot. Creator bots must comply with Community Guidelines.</li>
            <li><strong>Data:</strong> Conversation history with AI companions is stored and may be used to improve the AI experience. See our <a href="/legal/privacy">Privacy Policy</a> for details.</li>
          </ul>

          {/* 10. Intellectual Property */}
          <h2>10. Intellectual Property</h2>
          <p>
            The Service, including its design, features, functionality, source code, algorithms, trademarks, logos, and all related intellectual property, is owned by Avalo Inc. and protected by United States and international intellectual property laws.
          </p>
          <ul>
            <li>Users retain ownership of their User Content as described in Section 8.</li>
            <li>You may not copy, modify, distribute, sell, lease, reverse-engineer, decompile, or create derivative works based on any part of the Service without prior written consent from Avalo.</li>
            <li>Scraping, data mining, or automated extraction of data from the Service is strictly prohibited.</li>
            <li>The Avalo name, logo, and all related names, logos, product and service names, designs, and slogans are trademarks of Avalo Inc.</li>
          </ul>

          {/* 11. Prohibited Conduct */}
          <h2>11. Prohibited Conduct</h2>
          <p>
            You agree not to engage in any of the following:
          </p>
          <ul>
            <li>Harassment, stalking, threats of violence, or intimidation of other users.</li>
            <li>Fraud, scams, financial manipulation, or token farming.</li>
            <li>Creating fake profiles, catfishing, or misrepresenting your identity.</li>
            <li>Solicitation of sexual or escort services through the platform.</li>
            <li>Using the Service if you are under 18 years of age (or the local minimum age).</li>
            <li>Using automated tools, bots, scripts, or crawlers to access the Service without prior written authorization (official Avalo AI features excepted).</li>
            <li>Circumventing payments by directing users off-platform for transactions that should occur through Avalo.</li>
            <li>Sharing or distributing another user&apos;s private content without their consent.</li>
            <li>Attempting to gain unauthorized access to other accounts, servers, or networks.</li>
            <li>Using the Service to distribute malware or conduct cyberattacks.</li>
            <li>Violating any applicable local, state, national, or international law.</li>
          </ul>
          <p>
            Violations may result in warnings, temporary suspension, or permanent account termination. See our <a href="/legal/community">Community Guidelines</a> for detailed enforcement policies.
          </p>

          {/* 12. Termination */}
          <h2>12. Termination</h2>
          <ul>
            <li><strong>By Avalo:</strong> We may suspend or terminate your account at any time for violation of these Terms, our Community Guidelines, or any applicable law, or for any other reason at our sole discretion. We will endeavor to provide notice where practicable, but immediate termination may occur for severe violations.</li>
            <li><strong>By You:</strong> You may delete your account at any time through your account settings or by contacting support. Account deletion is processed in accordance with our <a href="/legal/privacy">Privacy Policy</a>.</li>
            <li><strong>Earned Token Balance:</strong> Upon termination, if you are a creator with a verified KYC identity and have an earned token balance, we will process a final payout in accordance with the Creator Agreement, provided your account was not terminated for fraud or violation of these Terms. Token balances are forfeited if the account is banned for fraud, abuse, or Terms violations.</li>
            <li><strong>Purchased Token Balance:</strong> Unused purchased tokens are forfeited upon account termination, except as required by applicable consumer protection laws.</li>
          </ul>

          {/* 13. Disclaimers */}
          <h2>13. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <ul>
            <li>Avalo does not guarantee any matches, connections, romantic outcomes, or social results.</li>
            <li>Avalo is not responsible for the behavior, actions, or conduct of any user, whether online or offline.</li>
            <li>Avalo does not guarantee any level of earnings for creators; earnings depend on user engagement and market dynamics.</li>
            <li>Avalo does not verify the truth or accuracy of content posted by users, except through its verification and moderation processes.</li>
            <li>Avalo does not guarantee uninterrupted, secure, or error-free operation of the Service.</li>
          </ul>

          {/* 14. Limitation of Liability */}
          <h2>14. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
          </p>
          <ul>
            <li>Avalo Inc.&apos;s total aggregate liability to you for all claims arising out of or relating to the Service shall not exceed the total amount you have paid to Avalo in the twelve (12) months immediately preceding the event giving rise to the claim.</li>
            <li>IN NO EVENT SHALL AVALO INC. BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.</li>
            <li>These limitations apply regardless of the legal theory on which the claim is based, whether in contract, tort (including negligence), strict liability, or otherwise, even if Avalo has been advised of the possibility of such damages.</li>
          </ul>

          {/* 15. Dispute Resolution */}
          <h2>15. Dispute Resolution</h2>
          <p>
            <strong>Informal Resolution:</strong> Before filing any formal claim, you agree to first contact us at <a href="mailto:legal@avalo.app">legal@avalo.app</a> and attempt to resolve the dispute informally for at least thirty (30) days.
          </p>
          <p>
            <strong>Binding Arbitration:</strong> If the dispute is not resolved informally, you and Avalo agree to resolve it through binding individual arbitration administered by the American Arbitration Association (&quot;AAA&quot;) under its Commercial Arbitration Rules, with the arbitration seated in Wilmington, Delaware, USA.
          </p>
          <p>
            <strong>Class Action Waiver:</strong> YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION. You waive any right to participate in a class action lawsuit or class-wide arbitration against Avalo Inc.
          </p>
          <p>
            <strong>Exceptions:</strong> Either party may seek injunctive or equitable relief in a court of competent jurisdiction for claims related to intellectual property infringement, unauthorized access, or platform abuse.
          </p>

          {/* 16. Governing Law */}
          <h2>16. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, USA, without regard to its conflict of laws provisions. For any disputes not subject to arbitration, you consent to the exclusive jurisdiction and venue of the state and federal courts located in Wilmington, Delaware, USA.
          </p>

          {/* 17. Changes to Terms */}
          <h2>17. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will provide at least thirty (30) days&apos; notice of material changes via email and/or in-app notification. Your continued use of the Service after the effective date of any modifications constitutes acceptance of the updated Terms. If you do not agree to the modified Terms, you must discontinue use of the Service and delete your account.
          </p>

          {/* 18. Contact */}
          <h2>18. Contact</h2>
          <p>
            For questions about these Terms of Service, contact us at:
          </p>
          <p>
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
