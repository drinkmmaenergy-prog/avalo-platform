/**
 * /legal/cookies — Cookie Policy
 *
 * Production wording for Avalo Cookie Policy.
 * GDPR / ePrivacy compliant.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Cookie Policy — Avalo',
  description: 'Avalo Cookie Policy. Learn about the cookies and tracking technologies we use.',
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Cookie Policy</h1>
          <p className="text-sm text-gray-500">Last updated: February 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ This service is restricted to users aged 18 and older.
            </p>
          </div>

          <h2>1. What Are Cookies</h2>
          <p>
            Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work efficiently and to provide information to the site owners. Avalo uses cookies and similar technologies (local storage, session storage) to operate the platform and improve your experience.
          </p>

          <h2>2. Types of Cookies We Use</h2>

          <h3>2.1 Essential Cookies (Required)</h3>
          <p>
            These cookies are necessary for the platform to function and cannot be disabled. They include:
          </p>
          <ul>
            <li><strong>Authentication cookies:</strong> Maintain your login session across pages.</li>
            <li><strong>Security cookies:</strong> Help detect fraud and protect your account.</li>
            <li><strong>Preference cookies:</strong> Store your language preference and locale settings.</li>
            <li><strong>CSRF tokens:</strong> Protect against cross-site request forgery attacks.</li>
          </ul>

          <h3>2.2 Analytics Cookies (Optional)</h3>
          <p>
            These cookies help us understand how users interact with the platform, allowing us to improve features and performance. They collect aggregated, anonymized data:
          </p>
          <ul>
            <li><strong>Page views and navigation patterns</strong></li>
            <li><strong>Feature usage statistics</strong></li>
            <li><strong>Performance metrics (load times, errors)</strong></li>
          </ul>
          <p>
            We use Firebase Analytics for this purpose. You can opt out of analytics cookies through the cookie consent banner or your browser settings.
          </p>

          <h3>2.3 Functionality Cookies (Optional)</h3>
          <p>
            These cookies enable enhanced functionality and personalization:
          </p>
          <ul>
            <li><strong>Theme preference:</strong> Remember your light/dark mode choice.</li>
            <li><strong>Language preference:</strong> Remember your selected display language.</li>
            <li><strong>Recently viewed content:</strong> Improve content recommendations.</li>
          </ul>

          <h2>3. Third-Party Cookies</h2>
          <p>
            Some cookies are set by third-party services we use:
          </p>
          <ul>
            <li><strong>Stripe:</strong> Payment processing cookies for secure checkout. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Firebase/Google:</strong> Authentication and analytics. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s Privacy Policy</a>.</li>
          </ul>

          <h2>4. Cookie Duration</h2>
          <table>
            <thead>
              <tr>
                <th>Cookie Type</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Session cookies</td>
                <td>Deleted when you close your browser</td>
              </tr>
              <tr>
                <td>Authentication</td>
                <td>Up to 30 days (or until sign-out)</td>
              </tr>
              <tr>
                <td>Language preference</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td>Analytics</td>
                <td>Up to 2 years (Google Analytics)</td>
              </tr>
              <tr>
                <td>Consent preferences</td>
                <td>1 year</td>
              </tr>
            </tbody>
          </table>

          <h2>5. Managing Cookies</h2>
          <p>
            You can control and manage cookies in the following ways:
          </p>
          <ul>
            <li><strong>Cookie consent banner:</strong> When you first visit the platform, you can accept or reject optional cookies.</li>
            <li><strong>Browser settings:</strong> Most browsers allow you to block or delete cookies through their settings. Note that blocking essential cookies may prevent the platform from functioning properly.</li>
            <li><strong>Do Not Track:</strong> We respect the &quot;Do Not Track&quot; browser signal. When enabled, we will not set optional analytics cookies.</li>
          </ul>

          <h2>6. Local Storage and Session Storage</h2>
          <p>
            In addition to cookies, we use browser local storage and session storage for:
          </p>
          <ul>
            <li>Caching user preferences locally for faster page loads</li>
            <li>Storing temporary UI state (e.g., form drafts)</li>
            <li>PWA (Progressive Web App) offline functionality</li>
          </ul>
          <p>
            These can be cleared through your browser&apos;s developer tools or settings.
          </p>

          <h2>7. Changes to This Policy</h2>
          <p>
            We may update this Cookie Policy from time to time. Changes will be posted on this page with an updated &quot;Last updated&quot; date.
          </p>

          <h2>8. Contact</h2>
          <p>
            For questions about cookies: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a><br />
            Avalo sp. z o.o.<br />
            Warsaw, Poland
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}
