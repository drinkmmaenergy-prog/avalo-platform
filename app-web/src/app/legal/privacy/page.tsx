/**
 * /legal/privacy — Privacy Policy
 *
 * Comprehensive production Privacy Policy for Avalo Inc.
 * GDPR (EU), CCPA (California), COPPA (US children) compliant.
 * Covers data collection, processing, sharing, retention, and user rights.
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
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ This service is restricted to users aged 18 and older. We do not knowingly collect data from individuals under 18.
            </p>
          </div>

          {/* 1. Introduction & Data Controller */}
          <h2>1. Introduction &amp; Data Controller</h2>
          <p>
            Avalo Inc. (&quot;Avalo&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;), a corporation registered in the State of Delaware, USA, is the data controller for your personal data processed through the Avalo platform. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our website, mobile applications, and related services (collectively, the &quot;Service&quot;).
          </p>
          <p>
            We are committed to protecting your privacy and complying with applicable data protection laws, including the EU General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), the Children&apos;s Online Privacy Protection Act (COPPA), and the EU Digital Services Act (DSA).
          </p>
          <p>
            For data protection inquiries, contact our Data Protection Officer at: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a>
          </p>

          {/* 2. Data We Collect */}
          <h2>2. Data We Collect</h2>

          <h3>2.1 Account Data</h3>
          <p>Information you provide during registration and profile setup:</p>
          <ul>
            <li>Full name, email address, phone number</li>
            <li>Date of birth (to verify age eligibility)</li>
            <li>Gender and sexual orientation (optional, for matching purposes)</li>
            <li>City/location (for local discovery)</li>
            <li>Profile photos and selfie verification images</li>
            <li>Password (stored in hashed form; we never store plaintext passwords)</li>
          </ul>

          <h3>2.2 Profile Data</h3>
          <ul>
            <li>Bio, interests, preferences, and relationship intentions</li>
            <li>Education, occupation, and other optional profile fields</li>
            <li>Languages spoken</li>
          </ul>

          <h3>2.3 Usage Data</h3>
          <ul>
            <li>Swipe history, matches, and discovery interactions</li>
            <li>Messages sent and received (content and metadata)</li>
            <li>Token purchases, spending, and transaction history</li>
            <li>Session data, login timestamps, and feature usage patterns</li>
            <li>Calendar bookings and meeting history</li>
            <li>Content posted (feed, stories, reels)</li>
          </ul>

          <h3>2.4 Device &amp; Technical Data</h3>
          <ul>
            <li>IP address and approximate location derived from IP</li>
            <li>Browser type, version, and language preferences</li>
            <li>Operating system and device type</li>
            <li>Device identifiers (advertising ID, device fingerprint)</li>
            <li>App version and crash reports</li>
          </ul>

          <h3>2.5 Location Data</h3>
          <ul>
            <li>City-level location (derived from IP or user input) — used for discovery by default</li>
            <li>Precise GPS location — only collected with explicit opt-in consent for enhanced discovery features</li>
          </ul>

          <h3>2.6 Financial Data</h3>
          <ul>
            <li>Payment processing is handled by Stripe. <strong>We do not store credit card numbers, CVVs, or full payment card details on our servers.</strong></li>
            <li>We store transaction records including amounts, dates, and token pack details.</li>
            <li>For creators: payout information and KYC verification data.</li>
          </ul>

          <h3>2.7 Content Data</h3>
          <ul>
            <li>Photos and videos uploaded to profiles, feed, and messages</li>
            <li>Text content in messages, posts, comments, and bios</li>
            <li>Audio and video from calls (not recorded by Avalo; real-time only)</li>
          </ul>

          <h3>2.8 AI Interaction Data</h3>
          <ul>
            <li>Conversation history with AI companions</li>
            <li>AI companion customization preferences</li>
            <li>AI interaction patterns and feedback</li>
          </ul>

          {/* 3. How We Use Data */}
          <h2>3. How We Use Your Data</h2>
          <p>We process your personal data for the following purposes:</p>
          <ul>
            <li><strong>Service Delivery:</strong> Providing the core features of Avalo, including matching, messaging, discovery, content feed, and calendar scheduling.</li>
            <li><strong>Payment Processing:</strong> Processing token purchases, subscriptions, and creator payouts.</li>
            <li><strong>Safety &amp; Security:</strong> Fraud detection, age verification, content moderation, abuse prevention, and account security.</li>
            <li><strong>Algorithm Improvement:</strong> Improving matching algorithms, ranking, and content recommendations to enhance your experience.</li>
            <li><strong>Communications:</strong> Sending transactional emails (receipts, account notifications), push notifications, and platform updates.</li>
            <li><strong>Legal Compliance:</strong> Fulfilling legal obligations, including tax reporting, responding to law enforcement requests, and regulatory compliance.</li>
            <li><strong>Analytics:</strong> Understanding how users use the Service to improve features and performance (with consent where required).</li>
          </ul>

          {/* 4. Legal Basis (GDPR Article 6) */}
          <h2>4. Legal Basis for Processing (GDPR Article 6)</h2>
          <p>We process your data based on the following legal grounds:</p>
          <ul>
            <li><strong>Consent (Art. 6(1)(a)):</strong> Marketing communications, optional analytics, precise location tracking, and cookies (where required by law). You may withdraw consent at any time.</li>
            <li><strong>Contract (Art. 6(1)(b)):</strong> Processing necessary to provide the Service you signed up for, including account management, matching, messaging, and payments.</li>
            <li><strong>Legitimate Interest (Art. 6(1)(f)):</strong> Safety and fraud prevention, improving our Service, enforcing our Terms, and protecting our users. We conduct balancing tests to ensure your rights are not overridden.</li>
            <li><strong>Legal Obligation (Art. 6(1)(c)):</strong> Tax reporting, responding to valid legal requests from law enforcement, and complying with applicable regulations.</li>
          </ul>

          {/* 5. Data Sharing */}
          <h2>5. Data Sharing</h2>
          <p>We share your data only as described below:</p>
          <ul>
            <li><strong>Payment Processors:</strong> Stripe processes payments on our behalf. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Cloud Infrastructure:</strong> Google Cloud / Firebase provides hosting, database, authentication, and analytics services.</li>
            <li><strong>AI Providers:</strong> AI service providers process conversation data for AI companion features. Data is transmitted securely and subject to data processing agreements.</li>
            <li><strong>Law Enforcement:</strong> We may disclose data when legally required by a valid court order, subpoena, or governmental request, or when necessary to protect the safety of users or the public.</li>
            <li><strong>Safety Partners:</strong> In cases of child exploitation, we report to the National Center for Missing &amp; Exploited Children (NCMEC) and relevant authorities.</li>
          </ul>
          <p className="font-semibold">
            We NEVER sell your personal data to third parties. We NEVER share your data with advertisers for ad targeting. Advertising on Avalo is served by Avalo directly, not through third-party ad networks.
          </p>

          {/* 6. International Transfers */}
          <h2>6. International Data Transfers</h2>
          <p>
            Your data is primarily stored on Google Cloud infrastructure in the europe-west region. When data is transferred to the United States or other countries outside the European Economic Area (EEA), we ensure adequate protection through:
          </p>
          <ul>
            <li>EU Standard Contractual Clauses (SCCs) with all processors</li>
            <li>Data processing agreements with all third-party providers</li>
            <li>Encryption in transit and at rest</li>
          </ul>

          {/* 7. Data Retention */}
          <h2>7. Data Retention</h2>
          <ul>
            <li><strong>Active Account:</strong> Data is retained for as long as your account remains active.</li>
            <li><strong>Deleted Account:</strong> Personal data is removed within 30 days of account deletion, in accordance with GDPR Article 17 (Right to Erasure). Some data may be retained in anonymized form for analytics.</li>
            <li><strong>Chat Messages:</strong> Retained for 1 year after last activity in the conversation, then permanently deleted.</li>
            <li><strong>Financial Records:</strong> Retained for 7 years after the transaction, as required by tax and financial regulations.</li>
            <li><strong>Safety Data:</strong> Reports, moderation actions, and related data are retained as needed for platform safety, legal proceedings, or regulatory compliance.</li>
            <li><strong>Backup Copies:</strong> May persist in encrypted backups for up to 90 days after deletion.</li>
          </ul>

          {/* 8. Your Rights */}
          <h2>8. Your Rights</h2>

          <h3>8.1 GDPR Rights (EU/EEA Residents)</h3>
          <p>Under GDPR Chapter III, you have the following rights:</p>
          <ul>
            <li><strong>Right of Access (Art. 15):</strong> Request a copy of all personal data we hold about you.</li>
            <li><strong>Right to Rectification (Art. 16):</strong> Request correction of inaccurate or incomplete personal data.</li>
            <li><strong>Right to Erasure (Art. 17):</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
            <li><strong>Right to Restriction (Art. 18):</strong> Request limitation of processing of your personal data.</li>
            <li><strong>Right to Data Portability (Art. 20):</strong> Receive your personal data in a structured, commonly used, machine-readable format.</li>
            <li><strong>Right to Object (Art. 21):</strong> Object to processing of your personal data based on legitimate interest.</li>
            <li><strong>Right to Withdraw Consent:</strong> Withdraw any consent you have previously given, without affecting the lawfulness of processing based on consent before withdrawal.</li>
            <li><strong>Right to Lodge a Complaint:</strong> Lodge a complaint with your local supervisory authority if you believe your data protection rights have been violated.</li>
          </ul>

          <h3>8.2 CCPA Rights (California Residents)</h3>
          <p>Under the California Consumer Privacy Act, you have the right to:</p>
          <ul>
            <li><strong>Right to Know:</strong> Request information about what personal data we collect, use, and disclose.</li>
            <li><strong>Right to Delete:</strong> Request deletion of your personal data.</li>
            <li><strong>Right to Opt-Out of Sale:</strong> We do not sell personal data. However, you may exercise this right by contacting us.</li>
            <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of your CCPA rights.</li>
          </ul>

          <h3>8.3 How to Exercise Your Rights</h3>
          <p>You may exercise your rights through:</p>
          <ul>
            <li>In-app: Settings → Security → Data Export / Data Erasure</li>
            <li>Email: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a></li>
          </ul>
          <p>
            We will respond to all valid requests within 30 days. We may need to verify your identity before processing your request.
          </p>

          {/* 9. Children */}
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            The Avalo Service is intended for users aged 18 and older. We comply with the Children&apos;s Online Privacy Protection Act (COPPA) and do not knowingly collect personal data from children under the age of 18.
          </p>
          <p>
            If we discover that a user is under 18, we will immediately terminate their account and delete all associated personal data. If you believe a minor is using the Service, please report it immediately to <a href="mailto:safety@avalo.app">safety@avalo.app</a>.
          </p>

          {/* 10. Security */}
          <h2>10. Security</h2>
          <p>We implement robust security measures to protect your data:</p>
          <ul>
            <li><strong>Encryption in Transit:</strong> All data transmitted between your device and our servers is encrypted using TLS (Transport Layer Security).</li>
            <li><strong>Encryption at Rest:</strong> Data stored on our servers is encrypted at rest using industry-standard algorithms.</li>
            <li><strong>Authentication:</strong> Firebase Authentication with support for multi-factor authentication.</li>
            <li><strong>Verification:</strong> Selfie verification to confirm user authenticity and prevent catfishing.</li>
            <li><strong>Access Controls:</strong> Strict role-based access controls for internal staff, with audit logging.</li>
            <li><strong>Security Audits:</strong> Regular security assessments and penetration testing.</li>
            <li><strong>Incident Response:</strong> Established procedures for detecting, responding to, and reporting data breaches within 72 hours as required by GDPR.</li>
          </ul>

          {/* 11. Cookies */}
          <h2>11. Cookies &amp; Tracking Technologies</h2>
          <p>
            We use cookies and similar technologies as described in our <a href="/legal/cookies">Cookie Policy</a>. You can manage your cookie preferences through our consent banner or your browser settings.
          </p>

          {/* 12. California Residents */}
          <h2>12. Additional Information for California Residents (CCPA)</h2>
          <p>
            In addition to the rights described in Section 8.2, the following information is provided pursuant to the CCPA:
          </p>
          <ul>
            <li><strong>Categories of Personal Information Collected:</strong> Identifiers, personal information under Cal. Civ. Code § 1798.80, characteristics of protected classifications, commercial information, internet or electronic network activity, geolocation data, audio/visual information, and inferences.</li>
            <li><strong>Sale of Personal Information:</strong> We do not sell and have not sold personal information in the preceding 12 months.</li>
            <li><strong>Financial Incentives:</strong> We do not offer financial incentives for the collection, sale, or deletion of personal information.</li>
            <li><strong>Non-Discrimination:</strong> We do not and will not discriminate against California residents for exercising their privacy rights.</li>
          </ul>

          {/* 13. Changes */}
          <h2>13. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will provide at least thirty (30) days&apos; notice of material changes via email and/or in-app notification. The &quot;Last Updated&quot; date at the top of this page indicates when the Privacy Policy was last revised. Your continued use of the Service after the effective date of changes constitutes acceptance of the updated Privacy Policy.
          </p>

          {/* 14. Contact */}
          <h2>14. Contact</h2>
          <p>
            For privacy-related inquiries, data subject requests, or complaints:
          </p>
          <p>
            Data Protection Officer: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a><br />
            General Legal: <a href="mailto:legal@avalo.app">legal@avalo.app</a>
          </p>
          <p>
            Avalo Inc.<br />
            State of Incorporation: Delaware, USA
          </p>
          <p>
            EU Representative: To be appointed if required under GDPR Article 27. Contact <a href="mailto:privacy@avalo.app">privacy@avalo.app</a> for current status.
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}
