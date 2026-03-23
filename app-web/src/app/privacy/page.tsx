'use client';

/**
 * FIX 65B: Privacy Policy page at /privacy (short URL).
 *
 * Required for App Store, Google Play, Stripe, and GDPR compliance.
 * The full legal version also exists at /legal/privacy.
 */

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-24 prose prose-sm">
      <h1>Privacy Policy</h1>
      <p className="text-gray-500">Last updated: March 2026</p>

      <h2>1. Data We Collect</h2>
      <p>Account data (name, email, date of birth, city), profile content (photos, bio), usage data (interactions, messages), device data (browser, IP address), and payment data (processed by Stripe).</p>

      <h2>2. How We Use Your Data</h2>
      <p>To provide the service, match users, process payments, improve the platform, ensure safety, and send notifications you&apos;ve opted into.</p>

      <h2>3. Data Sharing</h2>
      <p>We do not sell your personal data. We share data with: Stripe (payments), Firebase/Google Cloud (hosting), and law enforcement when legally required.</p>

      <h2>4. Your Rights (GDPR)</h2>
      <p>You have the right to: access your data, correct inaccurate data, delete your account and all data (Article 17), export your data, withdraw consent, and lodge a complaint with a supervisory authority.</p>

      <h2>5. Data Retention</h2>
      <p>Account data is kept while your account is active. After deletion, data is permanently removed within 30 days. Transaction records are kept for 5 years for legal compliance.</p>

      <h2>6. Cookies</h2>
      <p>We use essential cookies for authentication and session management. Analytics cookies are used only with your consent.</p>

      <h2>7. Data Security</h2>
      <p>We use encryption in transit (TLS) and at rest (Firebase). Access to user data is restricted to authorized personnel only.</p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>Avalo is not intended for anyone under 18. We do not knowingly collect data from minors.</p>

      <h2>9. Contact</h2>
      <p>Data Protection Officer: privacy@avalo.app</p>
    </div>
  );
}
