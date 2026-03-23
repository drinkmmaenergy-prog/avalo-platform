/**
 * /legal/refund — Refund Policy
 *
 * Comprehensive production Refund Policy for Avalo Inc.
 * Covers: token purchases, calendar meetings, subscriptions,
 * non-eligible refunds, and how to request refunds.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Refund Policy — Avalo',
  description: 'Avalo Refund Policy. Understand our refund terms for tokens, meetings, and subscriptions.',
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Refund Policy</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-blue-800 font-semibold">
              Please read this Refund Policy carefully before making purchases on Avalo. By completing a purchase, you acknowledge and agree to the terms outlined below.
            </p>
          </div>

          {/* 1. Token Purchases */}
          <h2>1. Token Purchases</h2>
          <p>
            Token purchases are <strong>non-refundable</strong> once tokens have been credited to your account. When you purchase a token pack, the tokens are delivered instantly and the service is considered rendered.
          </p>
          <ul>
            <li><strong>Delivered Tokens:</strong> If tokens have been credited to your account, the purchase is final and non-refundable.</li>
            <li><strong>Failed Delivery:</strong> If you were charged but tokens were not credited to your account, you are entitled to a full refund. Contact support with your transaction receipt.</li>
            <li><strong>Duplicate Charges:</strong> If you were accidentally charged twice for the same purchase, the duplicate charge will be refunded in full.</li>
            <li><strong>Unauthorized Purchases:</strong> If your payment method was used without your authorization, contact Stripe and our support team immediately.</li>
          </ul>
          <p>
            This policy complies with applicable consumer protection laws. Residents of the European Union may have additional rights under the Consumer Rights Directive — see Section 7 below.
          </p>

          {/* 2. Undelivered Services */}
          <h2>2. Undelivered Services</h2>
          <p>
            If you paid for a service (subscription, feature, or content) that was not delivered as described, you are entitled to a full refund. Examples include:
          </p>
          <ul>
            <li>Premium subscription features not activated after payment</li>
            <li>Purchased content (PPV) not accessible after payment</li>
            <li>Technical errors preventing use of paid features</li>
          </ul>

          {/* 3. Calendar Meetings */}
          <h2>3. Calendar Meeting Refunds</h2>
          <p>
            Calendar meeting refunds follow a structured cancellation policy based on timing:
          </p>

          <h3>3.1 Guest Cancellation</h3>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cancellation Timing</th>
                  <th>Refund Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>More than 72 hours before meeting</td>
                  <td><strong>100% refund</strong> of host share</td>
                  <td>Avalo retains its 20% platform fee</td>
                </tr>
                <tr>
                  <td>24–72 hours before meeting</td>
                  <td><strong>50% refund</strong></td>
                  <td>Partial compensation to host for reserved time</td>
                </tr>
                <tr>
                  <td>Less than 24 hours before meeting</td>
                  <td><strong>No refund</strong></td>
                  <td>Host has reserved their time and cannot rebook</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>3.2 Host Cancellation</h3>
          <p>
            If the host cancels a meeting at any time for any reason, the guest receives a <strong>100% full refund</strong> including the Avalo platform fee. Hosts who repeatedly cancel may face account restrictions.
          </p>

          <h3>3.3 Mismatch Report</h3>
          <p>
            If you meet someone who does not match their profile photos (catfishing/mismatch), you may report a mismatch and request a full refund. To be eligible:
          </p>
          <ul>
            <li>The report must be filed within <strong>15 minutes</strong> after QR check-in at the meeting.</li>
            <li>You must complete the QR check-in process (proving you were present).</li>
            <li>Avalo&apos;s safety team will review the report and make a determination.</li>
          </ul>

          <h3>3.4 No-Show</h3>
          <ul>
            <li>If the host does not show up: full refund to guest.</li>
            <li>If the guest does not show up: no refund. The host retains their share.</li>
          </ul>

          {/* 4. Subscriptions */}
          <h2>4. Subscriptions</h2>
          <ul>
            <li>Subscriptions (Premium, creator subscriptions) may be canceled at any time through your account settings.</li>
            <li>Cancellation takes effect at the end of the current billing period — you will retain access to subscription features until then.</li>
            <li><strong>No refund</strong> is provided for partial subscription periods. If you cancel mid-month, you retain access for the remainder of the month but will not be refunded the prorated amount.</li>
            <li>If you were charged for a subscription renewal after canceling, contact support for a review.</li>
          </ul>

          {/* 5. NOT Eligible for Refund */}
          <h2>5. What Is NOT Eligible for a Refund</h2>
          <p>
            The following situations are <strong>not</strong> grounds for a refund:
          </p>
          <ul>
            <li>&quot;I didn&apos;t like the conversation&quot; — Dissatisfaction with the content or quality of conversations with other users.</li>
            <li>&quot;The person wasn&apos;t interested in me&quot; — Other users are not obligated to reciprocate interest, messages, or attention.</li>
            <li>&quot;I expected a romantic/sexual outcome from a meeting&quot; — Calendar meetings are for social purposes. Avalo does not guarantee any specific outcome from meetings.</li>
            <li>Emotional dissatisfaction or unmet personal expectations.</li>
            <li>Tokens spent on features that functioned as described (messages, tips, unlocks, calls).</li>
            <li>Account termination due to Terms of Service violations — token balances are forfeited.</li>
            <li>Changes in personal circumstances (e.g., entering a relationship, moving, losing interest).</li>
          </ul>

          {/* 6. How to Request a Refund */}
          <h2>6. How to Request a Refund</h2>
          <p>
            If you believe you are eligible for a refund, you may request one through:
          </p>
          <ul>
            <li><strong>In-App:</strong> Settings → Help → Support Ticket → Select &quot;Refund Request&quot;</li>
            <li><strong>Email:</strong> <a href="mailto:refunds@avalo.app">refunds@avalo.app</a></li>
          </ul>
          <p>
            When submitting a refund request, please include:
          </p>
          <ul>
            <li>Your account email address</li>
            <li>Transaction ID or receipt (if available)</li>
            <li>Description of the issue</li>
            <li>Date and amount of the transaction</li>
          </ul>
          <p>
            Refund requests are typically reviewed within 5 business days. Approved refunds are processed to the original payment method within 5–10 business days after approval.
          </p>

          {/* 7. EU Consumer Rights */}
          <h2>7. EU Consumer Rights</h2>
          <p>
            Residents of the European Union have a 14-day right of withdrawal for online purchases under the Consumer Rights Directive (2011/83/EU). However, in accordance with Article 16(m), this right of withdrawal does not apply to digital content (including tokens) that has been fully delivered and the performance has begun with your prior express consent and acknowledgement that you thereby lose your right of withdrawal.
          </p>
          <p>
            By purchasing tokens on Avalo and consenting to immediate delivery, you acknowledge that the tokens are digital content delivered immediately and that you waive your right of withdrawal once delivery is complete.
          </p>

          {/* 8. Contact */}
          <h2>8. Contact</h2>
          <p>
            For refund inquiries:
          </p>
          <p>
            <a href="mailto:refunds@avalo.app">refunds@avalo.app</a><br />
            <a href="mailto:support@avalo.app">support@avalo.app</a>
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
