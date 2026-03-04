/**
 * /legal/privacy — Privacy Policy
 *
 * Production wording for Avalo Privacy Policy.
 * GDPR-compliant, references cookies, data processing, and user rights.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Privacy Policy — Avalo',
  description: 'Avalo Privacy Policy. Learn how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: February 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ This service is restricted to users aged 18 and older. We do not knowingly collect data from individuals under 18.
            </p>
          </div>

          <h2>1. Data Controller</h2>
          <p>
            Avalo sp. z o.o. (&quot;Avalo&quot;, &quot;we&quot;, &quot;us&quot;), registered in Warsaw, Poland, is the data controller for your personal data processed through the Avalo platform. For data protection inquiries, contact us at <a href="mailto:privacy@avalo.app">privacy@avalo.app</a>.
          </p>

          <h2>2. Data We Collect</h2>
          <h3>2.1 Account Data</h3>
          <p>
            When you register, we collect: email address, display name, and optionally phone number, profile photo, date of birth for age verification, and location data for regional compliance.
          </p>

          <h3>2.2 Usage Data</h3>
          <p>
            We automatically collect information about your interactions with the Service, including: pages visited, features used, timestamps, device information (browser type, OS, screen resolution), IP address, and referral URLs.
          </p>

          <h3>2.3 Payment Data</h3>
          <p>
            Token purchases are processed by Stripe. We store transaction records (amount, currency, pack purchased, timestamp) but do NOT store your payment card details. Stripe handles all payment card processing in accordance with PCI DSS standards.
          </p>

          <h3>2.4 Communication Data</h3>
          <p>
            Messages, chat data, and content you share through the platform are stored to provide the Service. This includes text messages, media uploads, and interaction metadata.
          </p>

          <h2>3. How We Use Your Data</h2>
          <p>We process your data for the following purposes:</p>
          <ul>
            <li><strong>Service provision:</strong> To operate your account, process token purchases, deliver messages, and provide platform features.</li>
            <li><strong>Safety and security:</strong> To detect fraud, prevent abuse, enforce community guidelines, and protect users.</li>
            <li><strong>Legal compliance:</strong> To comply with applicable laws, including age verification, tax reporting, and law enforcement requests.</li>
            <li><strong>Service improvement:</strong> To analyze usage patterns, improve performance, and develop new features (using aggregated, anonymized data where possible).</li>
            <li><strong>Communication:</strong> To send service-related notifications, security alerts, and (with your consent) marketing communications.</li>
          </ul>

          <h2>4. Legal Basis for Processing (GDPR)</h2>
          <ul>
            <li><strong>Contract performance:</strong> Processing necessary to provide the Service per our Terms of Service.</li>
            <li><strong>Legitimate interests:</strong> Safety, fraud prevention, and service improvement.</li>
            <li><strong>Legal obligation:</strong> Tax reporting, age verification, law enforcement cooperation.</li>
            <li><strong>Consent:</strong> Marketing emails and optional cookies (you may withdraw consent at any time).</li>
          </ul>

          <h2>5. Data Sharing</h2>
          <p>We share your data only in the following circumstances:</p>
          <ul>
            <li><strong>Service providers:</strong> Stripe (payments), Firebase/Google Cloud (infrastructure), content delivery networks.</li>
            <li><strong>Other users:</strong> Your public profile, content, and messages are visible to other users as part of the Service.</li>
            <li><strong>Legal requirements:</strong> When required by law, court order, or government authority.</li>
            <li><strong>Safety:</strong> When necessary to protect the safety of users or the public.</li>
          </ul>
          <p>We do NOT sell your personal data to third parties.</p>

          <h2>6. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active or as needed to provide the Service. After account deletion, we retain certain data for the period required by applicable law (e.g., tax records for 5–7 years). Anonymized analytics data may be retained indefinitely.
          </p>

          <h2>7. Your Rights (GDPR)</h2>
          <p>Under the GDPR, you have the following rights:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of your personal data.</li>
            <li><strong>Rectification:</strong> Correct inaccurate data.</li>
            <li><strong>Erasure:</strong> Request deletion of your data (&quot;right to be forgotten&quot;).</li>
            <li><strong>Portability:</strong> Receive your data in a machine-readable format.</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
            <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances.</li>
            <li><strong>Withdrawal of consent:</strong> Withdraw consent at any time where processing is based on consent.</li>
          </ul>
          <p>
            To exercise these rights, contact us at <a href="mailto:privacy@avalo.app">privacy@avalo.app</a>. We will respond within 30 days.
          </p>

          <h2>8. Cookies</h2>
          <p>
            We use cookies and similar technologies as described in our <a href="/legal/cookies">Cookie Policy</a>. Essential cookies are required for the Service to function. Analytics and preference cookies are used with your consent.
          </p>

          <h2>9. International Data Transfers</h2>
          <p>
            Your data may be processed in the European Economic Area (EEA) and the United States (via Google Cloud/Firebase). Transfers outside the EEA are subject to appropriate safeguards, including Standard Contractual Clauses.
          </p>

          <h2>10. Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your data, including encryption in transit (TLS) and at rest, access controls, and regular security audits.
          </p>

          <h2>11. Children</h2>
          <p>
            The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal data from children. If we become aware that a child under 18 has provided us with personal data, we will take steps to delete such information.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification. The &quot;Last updated&quot; date at the top indicates the most recent revision.
          </p>

          <h2>13. Contact</h2>
          <p>
            Data Protection Officer: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a><br />
            Avalo sp. z o.o.<br />
            Warsaw, Poland
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}

