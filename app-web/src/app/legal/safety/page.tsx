/**
 * /legal/safety — Safety Policy
 *
 * Comprehensive production Safety Policy for Avalo Inc.
 * Covers: commitment to safety, verification, content moderation,
 * reporting, meeting safety, minor protection, crisis resources,
 * and law enforcement cooperation.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Safety Policy — Avalo',
  description: 'Avalo Safety Policy. Our commitment to keeping users safe on and off the platform.',
};

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Safety Policy</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          {/* 1. Commitment to Safety */}
          <h2>1. Our Commitment to User Safety</h2>
          <p>
            At Avalo, safety is foundational to our platform. We are committed to creating a secure environment where users can connect, create, and communicate with confidence. This Safety Policy outlines the measures we take to protect our community and the standards we uphold.
          </p>
          <p>
            We employ a multi-layered approach to safety that combines technology, human review, user empowerment, and external partnerships to prevent and address harmful behavior on our platform.
          </p>

          {/* 2. Verification */}
          <h2>2. Verification</h2>
          <p>
            We use multiple layers of verification to help ensure the authenticity and trustworthiness of our user base:
          </p>

          <h3>2.1 Selfie Verification</h3>
          <ul>
            <li>Users are prompted to complete selfie verification, which uses pose-matching technology to confirm that profile photos match the real person.</li>
            <li>Verified users receive a visible verification badge on their profile.</li>
            <li>Selfie verification helps prevent catfishing and impersonation.</li>
          </ul>

          <h3>2.2 Age Verification</h3>
          <ul>
            <li>All users must confirm they are at least 18 years of age during registration.</li>
            <li>We may request additional age verification (ID document) for users who appear to be underage or for access to age-restricted features.</li>
            <li>See our <a href="/legal/age-verification">Age Verification Policy</a> for full details.</li>
          </ul>

          <h3>2.3 KYC (Know Your Customer) for Creators</h3>
          <ul>
            <li>Creators who wish to receive payouts must complete KYC verification, which includes government-issued identification and additional checks.</li>
            <li>This helps prevent fraud, money laundering, and underage monetization.</li>
          </ul>

          {/* 3. Content Moderation */}
          <h2>3. Content Moderation</h2>
          <p>
            Avalo uses a combination of automated and human review systems:
          </p>

          <h3>3.1 Automated Systems</h3>
          <ul>
            <li><strong>AI Content Scanning:</strong> Profile photos and uploaded content are scanned by AI models trained to detect nudity, violence, CSAM, and other prohibited content.</li>
            <li><strong>Text Analysis:</strong> Messages and profile text are analyzed for potential threats, harassment, scam patterns, and policy violations.</li>
            <li><strong>Behavioral Pattern Detection:</strong> Our risk engine monitors for suspicious behavior patterns including token farming, spam, and coordinated inauthentic behavior.</li>
          </ul>

          <h3>3.2 Human Review</h3>
          <ul>
            <li>A dedicated Trust &amp; Safety team reviews reported content and accounts.</li>
            <li>Escalated cases undergo thorough human review before enforcement actions.</li>
            <li>Our safety team operates with trained moderators who follow strict guidelines.</li>
          </ul>

          <h3>3.3 Proactive Detection</h3>
          <ul>
            <li>We proactively detect and remove accounts exhibiting scam patterns.</li>
            <li>Repeated violators are identified through cross-account detection methods.</li>
            <li>We participate in industry-standard hash-sharing databases to detect known harmful content.</li>
          </ul>

          {/* 4. Reporting and Blocking */}
          <h2>4. Reporting and Blocking</h2>

          <h3>4.1 Reporting</h3>
          <ul>
            <li><strong>In-App Report:</strong> Every profile, message, post, and live stream includes a Report button. Reports can be filed for harassment, fake profile, inappropriate content, scam/fraud, underage user, threats/violence, and other violations.</li>
            <li><strong>Email:</strong> Reports can also be sent to <a href="mailto:safety@avalo.app">safety@avalo.app</a>.</li>
            <li><strong>Confidential:</strong> Reports are confidential — the reported user will not be informed who filed the report.</li>
            <li><strong>Response Time:</strong> We aim to review all reports within 24 hours. Reports involving imminent safety threats are prioritized for immediate review.</li>
          </ul>

          <h3>4.2 Blocking</h3>
          <ul>
            <li>You can block any user at any time. Blocked users cannot see your profile, send you messages, or interact with your content.</li>
            <li>Blocking is mutual and immediate.</li>
            <li>Blocked users are not notified that they have been blocked.</li>
          </ul>

          {/* 5. Meeting Safety */}
          <h2>5. Meeting Safety Tips</h2>
          <p>
            For users who meet in person through the Calendar feature, we strongly recommend:
          </p>
          <ul>
            <li><strong>Meet in Public:</strong> Always choose a public location for first meetings (café, restaurant, park).</li>
            <li><strong>Tell Someone:</strong> Share your meeting details (who, where, when) with a trusted person, or use the in-app emergency contact feature.</li>
            <li><strong>Verify First:</strong> Only meet users who have completed selfie verification.</li>
            <li><strong>Stay Alert:</strong> Trust your instincts. If something feels wrong, leave immediately.</li>
            <li><strong>Keep Control:</strong> Arrange your own transportation. Don&apos;t accept rides from someone you just met.</li>
            <li><strong>Stay Sober:</strong> Limit alcohol consumption, especially on first meetings.</li>
            <li><strong>Use Check-In:</strong> Complete the QR check-in at the start of the meeting for safety tracking and mismatch protection.</li>
            <li><strong>Report Concerns:</strong> If you experience anything concerning, report it through the app immediately.</li>
          </ul>
          <p>
            See our <a href="/legal/calendar-policy">Meeting Policy</a> for complete Calendar feature terms.
          </p>

          {/* 6. Minor Protection */}
          <h2>6. Protection of Minors</h2>
          <p>
            Avalo is strictly an 18+ platform. We take the protection of minors extremely seriously:
          </p>
          <ul>
            <li><strong>CSAM Detection:</strong> We use industry-standard PhotoDNA and hash-matching technology to detect known child sexual abuse material (CSAM). Any detected CSAM is immediately reported to the National Center for Missing &amp; Exploited Children (NCMEC) in accordance with federal law (18 U.S.C. § 2258A).</li>
            <li><strong>Immediate Action:</strong> Accounts found to be associated with CSAM, child exploitation, or underage users are immediately terminated and all related data is preserved for law enforcement.</li>
            <li><strong>Reporting Obligation:</strong> We cooperate fully with law enforcement in all cases involving potential exploitation of minors.</li>
            <li><strong>Age Verification:</strong> We employ multiple methods to detect and remove underage users, including date of birth checks, selfie analysis, and community reporting.</li>
            <li><strong>Zero Tolerance:</strong> There are no warnings or second chances for any content or behavior involving the sexual exploitation of minors.</li>
          </ul>

          {/* 7. Crisis Resources */}
          <h2>7. Crisis Resources</h2>
          <p>
            If you or someone you know is in crisis, please reach out to these resources:
          </p>

          <h3>Emergency Services</h3>
          <ul>
            <li><strong>United States:</strong> 911</li>
            <li><strong>European Union:</strong> 112</li>
            <li><strong>United Kingdom:</strong> 999</li>
          </ul>

          <h3>Domestic Violence</h3>
          <ul>
            <li><strong>US National Domestic Violence Hotline:</strong> 1-800-799-7233 | <a href="https://www.thehotline.org" target="_blank" rel="noopener noreferrer">thehotline.org</a></li>
            <li><strong>UK:</strong> 0808 2000 247 (National DV Helpline)</li>
          </ul>

          <h3>Mental Health</h3>
          <ul>
            <li><strong>US Suicide &amp; Crisis Lifeline:</strong> 988 (call or text)</li>
            <li><strong>Crisis Text Line:</strong> Text HOME to 741741</li>
            <li><strong>International Association for Suicide Prevention:</strong> <a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank" rel="noopener noreferrer">iasp.info/resources</a></li>
          </ul>

          <h3>Exploitation &amp; Trafficking</h3>
          <ul>
            <li><strong>US National Human Trafficking Hotline:</strong> 1-888-373-7888 | Text 233733</li>
            <li><strong>NCMEC (Missing/Exploited Children):</strong> 1-800-843-5678 | <a href="https://www.missingkids.org" target="_blank" rel="noopener noreferrer">missingkids.org</a></li>
          </ul>

          {/* 8. Law Enforcement Cooperation */}
          <h2>8. Law Enforcement Cooperation</h2>
          <p>
            Avalo cooperates with law enforcement agencies in accordance with applicable laws:
          </p>
          <ul>
            <li><strong>Valid Legal Process:</strong> We respond to valid legal requests including court orders, subpoenas, and search warrants issued by competent authorities.</li>
            <li><strong>Emergency Disclosure:</strong> In cases involving imminent risk of death or serious bodily injury, we may voluntarily disclose information to law enforcement without a court order, as permitted by 18 U.S.C. § 2702(c)(4).</li>
            <li><strong>Data Preservation:</strong> Upon valid request, we can preserve account data for 90 days pending formal legal process.</li>
            <li><strong>CSAM Reporting:</strong> We report all discovered CSAM to NCMEC, which coordinates with domestic and international law enforcement.</li>
            <li><strong>Transparency:</strong> We will publish an annual transparency report disclosing the number of legal requests received and actions taken.</li>
          </ul>
          <p>
            Law enforcement inquiries should be directed to: <a href="mailto:legal@avalo.app">legal@avalo.app</a>
          </p>

          {/* 9. Contact */}
          <h2>9. Contact</h2>
          <p>
            For safety concerns, reports, or questions:
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
