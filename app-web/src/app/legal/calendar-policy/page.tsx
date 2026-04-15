/**
 * /legal/calendar-policy — Calendar / Meeting Policy
 *
 * CRITICAL legal document for the Avalo Calendar feature.
 * Defines lawful use, explicitly prohibits sexual services,
 * covers user responsibility, safety, financials, and enforcement.
 *
 * Avalo Inc., Delaware, USA
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Meeting Policy — Avalo',
  description: 'Avalo Calendar & Meeting Policy. Terms governing in-person and virtual meetings.',
};

export default function CalendarPolicyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Calendar &amp; Meeting Policy</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ IMPORTANT: The Calendar feature must NOT be used to solicit, offer, negotiate, or arrange sexual services, escort services, or any form of commercial sexual activity. Violations will result in immediate, permanent account termination without refund.
            </p>
          </div>

          {/* 1. Purpose */}
          <h2>1. Purpose</h2>
          <p>
            The Avalo Calendar feature is designed to facilitate in-person and virtual meetings between users for the purpose of making friends, professional networking, social activities, hobby groups, mentoring, language exchange, and other lawful social interactions.
          </p>
          <p>
            This Meeting Policy governs all use of the Calendar feature and must be read in conjunction with our <a href="/legal/terms">Terms of Service</a>, <a href="/legal/community">Community Guidelines</a>, and <a href="/legal/refund">Refund Policy</a>.
          </p>

          {/* 2. What Calendar IS For */}
          <h2>2. What the Calendar IS For</h2>
          <p>
            The Calendar feature is intended for the following types of meetings:
          </p>
          <ul>
            <li><strong>Social Meetings:</strong> Coffee dates, walks, meals, attending cultural events, exploring the city together.</li>
            <li><strong>Professional Networking:</strong> Career conversations, industry meetups, portfolio reviews, mentoring sessions.</li>
            <li><strong>Hobby &amp; Interest Meetups:</strong> Shared activities such as sports, arts, cooking, gaming, photography, or other hobbies.</li>
            <li><strong>Language &amp; Cultural Exchange:</strong> Language practice partners, cultural exchange conversations, and international socializing.</li>
            <li><strong>Group Events &amp; Workshops:</strong> Creator-hosted events, workshops, meetups, and community gatherings.</li>
            <li><strong>Virtual Meetings:</strong> Video calls for any of the above purposes, suitable for long-distance connections.</li>
          </ul>

          {/* 3. What Calendar is NOT For */}
          <h2>3. What the Calendar is NOT For</h2>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose my-4">
            <p className="text-red-800 font-bold mb-2">PROHIBITED USES</p>
            <p className="text-red-700">
              The Calendar feature must NOT be used to solicit, offer, negotiate, or arrange sexual services, escort services, or any form of commercial sexual activity. Such use constitutes a severe violation of our Terms of Service and will result in immediate, permanent account termination without refund.
            </p>
          </div>
          <p>
            The following are explicitly prohibited:
          </p>
          <ul>
            <li>Offering or soliciting sexual services in exchange for tokens or money.</li>
            <li>Advertising escort or companion services through meeting descriptions.</li>
            <li>Using coded language to imply sexual services in meeting listings.</li>
            <li>Setting meeting rates based on the expectation of sexual outcomes.</li>
            <li>Any form of human trafficking, exploitation, or coercion.</li>
            <li>Booking meetings for the purpose of harassment, intimidation, or stalking.</li>
          </ul>

          {/* 4. User Responsibility */}
          <h2>4. User Responsibility</h2>
          <p>
            Avalo facilitates initial connections between consenting adults. The platform&apos;s role is limited to providing the scheduling and payment infrastructure.
          </p>
          <p>
            <strong>What consenting adults choose to do in their private time, outside of the platform, is their own personal responsibility and is not endorsed, facilitated, or controlled by Avalo.</strong>
          </p>
          <p>
            Avalo makes no representations about the intentions or conduct of any user. By using the Calendar feature, you acknowledge and agree that:
          </p>
          <ul>
            <li>You are solely responsible for your decisions about meeting other users.</li>
            <li>You meet other users at your own risk.</li>
            <li>Avalo does not perform background checks on users (though we do require identity verification).</li>
            <li>Avalo does not guarantee the character, intentions, honesty, or behavior of any user.</li>
            <li>You are responsible for ensuring your own physical safety during meetings.</li>
            <li>You must comply with all applicable local laws in the jurisdiction where you meet.</li>
          </ul>

          {/* 5. Safety */}
          <h2>5. Safety Recommendations</h2>
          <p>
            Your safety is important to us. We strongly recommend the following when meeting through the Calendar feature:
          </p>

          <h3>5.1 Before the Meeting</h3>
          <ul>
            <li><strong>Verify the Person:</strong> Check that their profile has selfie verification (blue checkmark). Review their profile, photos, and any reviews from previous meetings.</li>
            <li><strong>Tell Someone:</strong> Share your meeting details (who, where, when) with a trusted friend or family member.</li>
            <li><strong>Set Emergency Contacts:</strong> Use the optional emergency contact feature in the Calendar to designate someone who can be notified.</li>
          </ul>

          <h3>5.2 During the Meeting</h3>
          <ul>
            <li><strong>Meet in Public:</strong> For first meetings, always choose a public place (café, restaurant, park, etc.).</li>
            <li><strong>QR Check-In:</strong> Complete the QR check-in process at the start of the meeting to activate meeting safety features.</li>
            <li><strong>Trust Your Instincts:</strong> If something feels wrong, leave immediately. You do not owe anyone your time or attention.</li>
            <li><strong>Stay Sober:</strong> Be cautious with alcohol consumption, especially during first meetings.</li>
            <li><strong>Report Mismatches:</strong> If the person does not match their profile photos, file a mismatch report within 15 minutes of QR check-in for a full refund.</li>
          </ul>

          <h3>5.3 After the Meeting</h3>
          <ul>
            <li><strong>Rate and Review:</strong> Leave honest feedback to help the community.</li>
            <li><strong>Report Issues:</strong> If you experienced any violations, unsafe behavior, or concerning conduct, report it immediately through the app or at <a href="mailto:safety@avalo.app">safety@avalo.app</a>.</li>
            <li><strong>Emergency:</strong> If you are in immediate danger, contact local emergency services (911 in the US, 112 in the EU) first, then notify Avalo.</li>
          </ul>

          {/* 6. Financial Terms */}
          <h2>6. Financial Terms</h2>
          <ul>
            <li><strong>Meeting Rate:</strong> Hosts set their own meeting rates in tokens. The rate is displayed to guests before booking.</li>
            <li><strong>Revenue Split:</strong> Calendar meetings use an up to reference rate Host / 20% Avalo revenue split.</li>
            <li><strong>Payment:</strong> Guests pay the full meeting rate at the time of booking. Tokens are held in escrow until the meeting is completed.</li>
            <li><strong>Host Payout:</strong> The host&apos;s share is released after the meeting is completed and the QR check-in is confirmed (or after 24 hours if no check-in dispute is filed).</li>
          </ul>

          <h3>6.1 Cancellation Policy</h3>
          <p>
            See our <a href="/legal/refund">Refund Policy</a> for complete cancellation and refund terms. Summary:
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Refund</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Guest cancels &gt;72h before</td>
                  <td>100% refund of host share (reference platform portion 20% fee)</td>
                </tr>
                <tr>
                  <td>Guest cancels 24–72h before</td>
                  <td>50% refund</td>
                </tr>
                <tr>
                  <td>Guest cancels &lt;24h before</td>
                  <td>No refund</td>
                </tr>
                <tr>
                  <td>Host cancels (any time)</td>
                  <td>100% full refund including Avalo fee</td>
                </tr>
                <tr>
                  <td>Mismatch (within 15 min of check-in)</td>
                  <td>Full refund</td>
                </tr>
                <tr>
                  <td>Host no-show</td>
                  <td>Full refund</td>
                </tr>
                <tr>
                  <td>Guest no-show</td>
                  <td>No refund</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 7. Enforcement */}
          <h2>7. Enforcement</h2>
          <p>
            Avalo takes violations of this Meeting Policy extremely seriously:
          </p>
          <ul>
            <li><strong>Investigation:</strong> All reports of Calendar feature misuse, especially reports of solicitation, are investigated within 24 hours by our safety team.</li>
            <li><strong>Confirmed Violations:</strong> Users confirmed to have violated this policy will face:
              <ul>
                <li>Immediate, permanent account ban</li>
                <li>Forfeiture of all token balances (purchased and earned)</li>
                <li>Potential reporting to law enforcement if illegal activity is suspected</li>
              </ul>
            </li>
            <li><strong>False Reports:</strong> Filing false reports about other users is itself a violation and may result in account action.</li>
          </ul>

          {/* 8. Disclaimer */}
          <h2>8. Disclaimer</h2>
          <p>
            Avalo provides the Calendar feature as a scheduling and connection tool. Avalo does not:
          </p>
          <ul>
            <li>Guarantee the safety, quality, or outcome of any meeting</li>
            <li>Endorse, supervise, or monitor what happens during meetings</li>
            <li>Accept liability for the conduct of any user before, during, or after a meeting</li>
            <li>Make any representations about any user&apos;s character, intentions, or truthfulness beyond our verification processes</li>
          </ul>
          <p>
            By using the Calendar feature, you accept full responsibility for your interactions with other users and release Avalo from any claims arising from meetings arranged through the platform.
          </p>

          {/* 9. Contact */}
          <h2>9. Contact</h2>
          <p>
            For questions about this Meeting Policy:
          </p>
          <p>
            Safety Team: <a href="mailto:safety@avalo.app">safety@avalo.app</a><br />
            Legal: <a href="mailto:legal@avalo.app">legal@avalo.app</a>
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

