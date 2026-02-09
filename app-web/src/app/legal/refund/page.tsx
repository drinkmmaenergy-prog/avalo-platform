/**
 * /legal/refund — Refund Policy
 *
 * Production wording for Avalo Refund Policy.
 * Covers token purchases, exceptions, and consumer rights.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Refund Policy — Avalo',
  description: 'Avalo Refund Policy for token purchases and digital goods.',
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Refund Policy</h1>
          <p className="text-sm text-gray-500">Last updated: February 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ You must be at least 18 years old to purchase tokens on Avalo.
            </p>
          </div>

          <h2>1. General Policy</h2>
          <p>
            Token purchases on Avalo are considered purchases of digital goods and are generally final and non-refundable. When you purchase a token pack, the tokens are credited to your account immediately upon successful payment processing, and the digital goods are considered delivered.
          </p>

          <h2>2. When Refunds May Be Granted</h2>
          <p>
            We may grant refunds in the following exceptional circumstances:
          </p>
          <ul>
            <li><strong>Duplicate charges:</strong> If you were charged multiple times for the same purchase due to a technical error.</li>
            <li><strong>Unauthorized transactions:</strong> If a purchase was made without your authorization (e.g., stolen payment credentials). You must report this within 7 days of the transaction.</li>
            <li><strong>Service failure:</strong> If tokens were not credited to your account after a successful payment and our support team is unable to resolve the issue.</li>
            <li><strong>Legal requirement:</strong> Where refunds are mandated by applicable consumer protection laws in your jurisdiction.</li>
          </ul>

          <h2>3. EU Consumer Rights</h2>
          <p>
            Under EU Directive 2011/83/EU, consumers have a 14-day right of withdrawal for distance purchases. However, this right does not apply to digital content that has begun to be delivered with your prior express consent and acknowledgment that you lose the right of withdrawal. By completing a token purchase, you expressly consent to immediate delivery of the digital tokens and acknowledge that you waive your right of withdrawal once the tokens are credited to your account.
          </p>

          <h2>4. How to Request a Refund</h2>
          <p>
            To request a refund, contact our support team at <a href="mailto:support@avalo.app">support@avalo.app</a> with the following information:
          </p>
          <ul>
            <li>Your Avalo account email address</li>
            <li>Transaction date and amount</li>
            <li>Reason for the refund request</li>
            <li>Any relevant screenshots or transaction IDs</li>
          </ul>
          <p>
            We will review your request and respond within 5 business days. If a refund is approved, it will be processed to your original payment method within 5–10 business days.
          </p>

          <h2>5. Non-Refundable Situations</h2>
          <p>Refunds will NOT be granted in the following cases:</p>
          <ul>
            <li>Change of mind after purchase</li>
            <li>Tokens that have been partially or fully used</li>
            <li>Account suspension or termination due to violation of our Terms of Service</li>
            <li>Dissatisfaction with the platform or its features</li>
            <li>Inability to find desired content or users on the platform</li>
          </ul>

          <h2>6. Creator Payout Refunds</h2>
          <p>
            If a token purchase is refunded, any creator earnings derived from that specific transaction may be clawed back proportionally. This is to prevent fraud and abuse. Creators will be notified of any such adjustments.
          </p>

          <h2>7. Chargebacks</h2>
          <p>
            If you initiate a chargeback through your bank or payment provider instead of contacting us directly, we reserve the right to immediately suspend your account pending investigation. Fraudulent chargebacks may result in permanent account termination and legal action.
          </p>

          <h2>8. Contact</h2>
          <p>
            For refund inquiries: <a href="mailto:support@avalo.app">support@avalo.app</a><br />
            Avalo sp. z o.o.<br />
            Warsaw, Poland
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}
