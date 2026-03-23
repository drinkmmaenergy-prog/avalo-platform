/**
 * /legal/cookies — Cookie Policy
 *
 * Comprehensive production Cookie Policy for Avalo Inc.
 * GDPR / ePrivacy Directive compliant.
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
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          {/* 1. What Are Cookies */}
          <h2>1. What Are Cookies</h2>
          <p>
            Cookies are small text files placed on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work efficiently, provide useful information to website owners, and enhance the user experience. Along with cookies, we may use similar technologies such as web beacons, pixels, local storage, and device fingerprinting (collectively, &quot;Tracking Technologies&quot;).
          </p>
          <p>
            This Cookie Policy explains what cookies and Tracking Technologies we use, why we use them, and how you can control them. This policy should be read alongside our <a href="/legal/privacy">Privacy Policy</a>, which provides more detail on how we process your personal data.
          </p>

          {/* 2. Essential Cookies */}
          <h2>2. Essential Cookies (Always Active)</h2>
          <p>
            These cookies are strictly necessary for the operation of the Avalo platform. They cannot be disabled without affecting the functionality of the Service. Essential cookies do not require your consent under applicable data protection laws.
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie Name</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>__session</td>
                  <td>Authentication — maintains your login session</td>
                  <td>Session / 14 days</td>
                </tr>
                <tr>
                  <td>__csrf_token</td>
                  <td>Security — protects against cross-site request forgery attacks</td>
                  <td>Session</td>
                </tr>
                <tr>
                  <td>cookie_consent</td>
                  <td>Preferences — stores your cookie consent choices</td>
                  <td>1 year</td>
                </tr>
                <tr>
                  <td>locale</td>
                  <td>Preferences — stores your language and region preferences</td>
                  <td>1 year</td>
                </tr>
                <tr>
                  <td>theme</td>
                  <td>Preferences — stores your UI theme preference (light/dark)</td>
                  <td>1 year</td>
                </tr>
                <tr>
                  <td>firebase_auth</td>
                  <td>Authentication — Firebase Authentication session management</td>
                  <td>Session / persistent</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Analytics Cookies */}
          <h2>3. Analytics Cookies (Requires Consent)</h2>
          <p>
            We use analytics cookies to understand how users interact with the Avalo platform, which pages are most visited, and how we can improve the user experience. These cookies are only placed after you provide consent through our consent banner.
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie Name</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>_ga</td>
                  <td>Firebase Analytics (Google)</td>
                  <td>Distinguishes unique users to generate aggregate usage statistics</td>
                  <td>2 years</td>
                </tr>
                <tr>
                  <td>_ga_*</td>
                  <td>Firebase Analytics (Google)</td>
                  <td>Maintains session state for analytics</td>
                  <td>2 years</td>
                </tr>
                <tr>
                  <td>_gid</td>
                  <td>Firebase Analytics (Google)</td>
                  <td>Distinguishes users for 24-hour analytics windows</td>
                  <td>24 hours</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Analytics data is processed in aggregate and is used solely to improve the Service. We do not use analytics data to identify individual users for advertising purposes.
          </p>

          {/* 4. How to Manage Cookies */}
          <h2>4. How to Manage Cookies</h2>

          <h3>4.1 Our Consent Banner</h3>
          <p>
            When you first visit Avalo, you will see a cookie consent banner that allows you to accept or reject non-essential cookies. You can change your preferences at any time through Settings → Privacy → Cookie Preferences.
          </p>

          <h3>4.2 Browser Settings</h3>
          <p>
            Most web browsers allow you to manage cookies through their settings. You can typically:
          </p>
          <ul>
            <li>View what cookies are stored on your device</li>
            <li>Delete all or specific cookies</li>
            <li>Block cookies from specific websites or all websites</li>
            <li>Block third-party cookies</li>
            <li>Set your browser to notify you when a cookie is being set</li>
          </ul>
          <p>
            Please note that blocking essential cookies may prevent you from using certain features of the Service, including logging in to your account.
          </p>
          <p>Common browser cookie settings:</p>
          <ul>
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Apple Safari</a></li>
            <li><a href="https://support.microsoft.com/en-us/microsoft-edge/manage-cookies-in-microsoft-edge-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
          </ul>

          {/* 5. Third-Party Cookies */}
          <h2>5. Third-Party Cookies</h2>
          <p>
            Certain third-party services integrated into Avalo may set their own cookies:
          </p>
          <ul>
            <li><strong>Stripe:</strong> Payment processing cookies are set when you make a purchase through the Stripe checkout. These are essential for secure payment processing. See <a href="https://stripe.com/cookie-settings" target="_blank" rel="noopener noreferrer">Stripe&apos;s Cookie Policy</a>.</li>
            <li><strong>Giphy:</strong> When you use the GIF picker in chat, Giphy may set cookies for content delivery. See <a href="https://support.giphy.com/hc/en-us/articles/360032872931" target="_blank" rel="noopener noreferrer">Giphy&apos;s Privacy Policy</a>.</li>
            <li><strong>Firebase:</strong> Google Firebase services may set cookies for authentication, analytics, and performance monitoring. See <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener noreferrer">Google&apos;s Cookie Policy</a>.</li>
          </ul>
          <p>
            We do not use third-party advertising cookies or tracking pixels from ad networks. Avalo serves its own advertisements without third-party ad tracking.
          </p>

          {/* 6. Do Not Track */}
          <h2>6. Do Not Track</h2>
          <p>
            Some browsers include a &quot;Do Not Track&quot; (DNT) feature that signals to websites that you do not want to be tracked. Since there is no universally accepted standard for DNT signals, Avalo currently does not respond to DNT signals. However, you can control tracking through our cookie consent banner and browser settings as described above.
          </p>

          {/* 7. Changes */}
          <h2>7. Changes to This Cookie Policy</h2>
          <p>
            We may update this Cookie Policy from time to time to reflect changes in the cookies we use or for operational, legal, or regulatory reasons. We will notify you of material changes by posting the updated policy with a new &quot;Last Updated&quot; date. Please check this page periodically for updates.
          </p>

          {/* 8. Contact */}
          <h2>8. Contact</h2>
          <p>
            For questions about our use of cookies or this Cookie Policy:
          </p>
          <p>
            <a href="mailto:privacy@avalo.app">privacy@avalo.app</a>
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
