/**
 * /legal/age-verification — Age Verification Policy
 *
 * Comprehensive production Age Verification Policy for Avalo Inc.
 * Covers: why 18+, how we verify, what happens if underage,
 * regional age requirements, and compliance.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Age Verification Policy — Avalo',
  description: 'Avalo Age Verification Policy. How we verify users are 18+ and protect minors.',
};

export default function AgeVerificationPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Age Verification Policy</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-red-800 font-semibold">
              ⚠️ Avalo is strictly for adults aged 18 and older. In some jurisdictions, the minimum age is higher (19, 20, or 21). If you are under the legal age requirement in your jurisdiction, you must not use Avalo.
            </p>
          </div>

          {/* 1. Why 18+ */}
          <h2>1. Why Avalo Requires Users to Be 18+</h2>
          <p>
            Avalo is a social platform designed exclusively for adults. The 18+ age requirement exists because:
          </p>
          <ul>
            <li><strong>Nature of the Platform:</strong> Avalo includes dating features, social matchmaking, creator economy with monetization, and AI companion interactions that are intended for adult audiences.</li>
            <li><strong>Content:</strong> The platform may contain adult-oriented content, including dating profiles, private messaging between adults, and creator-produced content behind age-appropriate access controls.</li>
            <li><strong>Financial Transactions:</strong> Users can purchase tokens and creators can earn money. These financial activities require legal capacity that minors may not possess.</li>
            <li><strong>In-Person Meetings:</strong> The Calendar feature facilitates real-world meetings between users, which is appropriate only for adults who can provide informed consent.</li>
            <li><strong>Legal Compliance:</strong> This age restriction helps us comply with COPPA (Children&apos;s Online Privacy Protection Act), GDPR (which requires special protections for children), and various national and regional regulations regarding age-appropriate content and services.</li>
          </ul>

          {/* 2. How We Verify Age */}
          <h2>2. How We Verify Age</h2>
          <p>
            We use multiple methods to verify that all users meet the minimum age requirement:
          </p>

          <h3>2.1 Date of Birth Declaration</h3>
          <ul>
            <li>During account registration, all users must provide their date of birth.</li>
            <li>Users who enter a date of birth indicating they are under 18 are immediately blocked from creating an account.</li>
            <li>We implement measures to prevent users from simply changing their date of birth to bypass this check.</li>
          </ul>

          <h3>2.2 Selfie Verification</h3>
          <ul>
            <li>Our selfie verification system uses pose-matching technology to confirm that profile photos represent the actual user.</li>
            <li>As part of this process, the system analyzes facial features which may flag users who appear to be underage for additional review.</li>
            <li>Selfie verification is required for full platform access and is mandatory for creators and users of the Calendar feature.</li>
          </ul>

          <h3>2.3 Government-Issued ID Verification</h3>
          <ul>
            <li><strong>KYC for Creators:</strong> All creators who wish to receive payouts must complete Know Your Customer (KYC) verification, which requires a valid government-issued photo ID. This confirms both identity and age.</li>
            <li><strong>Escalated Verification:</strong> If there is reason to believe a user may be underage, we may require government-issued ID verification before allowing continued access.</li>
            <li><strong>Age-Restricted Features:</strong> Access to certain features (such as NSFW AI content or adult creator content) may require additional age verification beyond the standard date of birth check.</li>
          </ul>

          <h3>2.4 Community Reporting</h3>
          <ul>
            <li>Users can report suspected underage accounts through the in-app Report feature or by emailing <a href="mailto:safety@avalo.app">safety@avalo.app</a>.</li>
            <li>All reports of potentially underage users are prioritized for immediate review by our safety team.</li>
          </ul>

          {/* 3. What Happens If an Underage User Is Found */}
          <h2>3. What Happens If an Underage User Is Found</h2>
          <p>
            If we discover or have reasonable grounds to believe that a user is under the minimum age requirement:
          </p>
          <ol>
            <li><strong>Immediate Account Suspension:</strong> The account is immediately suspended pending investigation.</li>
            <li><strong>Investigation:</strong> Our safety team reviews the account, including profile information, content, and any relevant interactions.</li>
            <li><strong>Account Termination:</strong> If the user is confirmed to be underage, the account is permanently deleted.</li>
            <li><strong>Data Deletion:</strong> All personal data associated with the underage account is deleted in accordance with COPPA and GDPR requirements, except for data that must be retained for safety or legal purposes (e.g., evidence of exploitation).</li>
            <li><strong>Communication Block:</strong> The user&apos;s device identifiers and associated contact information are flagged to prevent re-registration.</li>
            <li><strong>Token Refund:</strong> Any purchased tokens are refunded to the payment method on file (as the original purchase would have been made by a minor and therefore voidable).</li>
            <li><strong>Law Enforcement Notification:</strong> If any adult user is found to have knowingly interacted with a minor in a sexual or exploitative manner, the case is reported to law enforcement and NCMEC.</li>
          </ol>

          {/* 4. Regional Age Requirements */}
          <h2>4. Regional Age Requirements</h2>
          <p>
            While Avalo&apos;s global minimum age is 18, some jurisdictions require a higher minimum age. Users must comply with the higher of Avalo&apos;s minimum age or the local legal age:
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Region / Country</th>
                  <th>Minimum Age</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Global Default</td>
                  <td><strong>18</strong></td>
                  <td>Avalo platform policy</td>
                </tr>
                <tr>
                  <td>South Korea</td>
                  <td><strong>19</strong></td>
                  <td>Korean age of majority</td>
                </tr>
                <tr>
                  <td>Japan (some prefectures)</td>
                  <td><strong>18</strong></td>
                  <td>Age of majority (revised 2022)</td>
                </tr>
                <tr>
                  <td>Alabama, Nebraska (USA)</td>
                  <td><strong>19</strong></td>
                  <td>State age of majority</td>
                </tr>
                <tr>
                  <td>Mississippi (USA)</td>
                  <td><strong>21</strong></td>
                  <td>State age of majority</td>
                </tr>
                <tr>
                  <td>United Arab Emirates</td>
                  <td><strong>21</strong></td>
                  <td>Age of majority</td>
                </tr>
                <tr>
                  <td>Indonesia</td>
                  <td><strong>21</strong></td>
                  <td>Age of majority for unmarried individuals</td>
                </tr>
                <tr>
                  <td>Singapore</td>
                  <td><strong>21</strong></td>
                  <td>Age of majority</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            This table is not exhaustive. It is your responsibility to know and comply with the legal age requirements in your jurisdiction. Avalo may update regional age requirements as laws change.
          </p>

          {/* 5. COPPA Compliance */}
          <h2>5. COPPA Compliance</h2>
          <p>
            In compliance with the Children&apos;s Online Privacy Protection Act (COPPA):
          </p>
          <ul>
            <li>We do not knowingly collect personal information from children under 13 (or under 18, given our platform&apos;s age restriction).</li>
            <li>If we learn that we have inadvertently collected personal information from a child, we will delete that information as quickly as possible.</li>
            <li>We do not use children&apos;s personal information for marketing or advertising purposes.</li>
            <li>Parents or guardians who believe their child has created an Avalo account should contact us immediately at <a href="mailto:safety@avalo.app">safety@avalo.app</a>.</li>
          </ul>

          {/* 6. Parental Notice */}
          <h2>6. Notice to Parents and Guardians</h2>
          <p>
            Avalo is not designed for or marketed to individuals under 18. If you are a parent or guardian and discover that your child has created an Avalo account:
          </p>
          <ol>
            <li>Contact us immediately at <a href="mailto:safety@avalo.app">safety@avalo.app</a> with details about the account.</li>
            <li>We will verify your identity and relationship to the minor.</li>
            <li>The account will be immediately terminated and all data deleted.</li>
            <li>Any purchased tokens will be refunded.</li>
          </ol>
          <p>
            We encourage parents to discuss online safety with their children and to use parental controls on devices to restrict access to age-inappropriate platforms and services.
          </p>

          {/* 7. Continuous Improvement */}
          <h2>7. Continuous Improvement</h2>
          <p>
            We are committed to continuously improving our age verification methods. As technology evolves, we may adopt additional verification measures including:
          </p>
          <ul>
            <li>Enhanced AI-powered age estimation from selfie verification</li>
            <li>Integration with third-party age verification providers</li>
            <li>Digital identity verification standards as they become available</li>
            <li>Compliance with emerging age verification regulations (such as the UK Online Safety Act)</li>
          </ul>

          {/* 8. Contact */}
          <h2>8. Contact</h2>
          <p>
            For questions about age verification, or to report a suspected underage user:
          </p>
          <p>
            Safety Team: <a href="mailto:safety@avalo.app">safety@avalo.app</a><br />
            Privacy: <a href="mailto:privacy@avalo.app">privacy@avalo.app</a>
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
