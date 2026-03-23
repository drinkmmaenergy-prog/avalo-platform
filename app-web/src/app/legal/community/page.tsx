/**
 * /legal/community — Community Guidelines
 *
 * Comprehensive Community Guidelines for Avalo Inc.
 * Covers: authenticity, respect, safety, content rules, monetization rules,
 * AI rules, enforcement, and reporting.
 */

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Community Guidelines — Avalo',
  description: 'Avalo Community Guidelines. Our rules for a safe and respectful community.',
};

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto prose prose-gray prose-pink">
          <h1>Community Guidelines</h1>
          <p className="text-sm text-gray-500">Last Updated: March 2026</p>

          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 not-prose mb-8">
            <p className="text-pink-800 font-semibold">
              Avalo is a community built on authenticity, respect, and safety. These guidelines apply to all users — whether you&apos;re here for dating, social connections, creating content, or meeting new people. Violations may result in warnings, suspension, or permanent removal from the platform.
            </p>
          </div>

          {/* 1. Be Real */}
          <h2>1. Be Real — Authenticity</h2>
          <p>
            Avalo is built on genuine connections. We require all users to be honest about who they are.
          </p>
          <ul>
            <li><strong>Use Real Photos:</strong> Your profile photos must be of you. No stock photos, celebrity images, AI-generated faces (except in designated AI companion features), or images of other people.</li>
            <li><strong>Show Your Face:</strong> Your first profile photo must clearly show your face. We recommend that at least your first 6 photos show the account owner&apos;s face recognizably.</li>
            <li><strong>No Catfishing:</strong> Misrepresenting your identity, appearance, age, gender, or any material personal information is prohibited.</li>
            <li><strong>No Photos of Minors:</strong> Do not upload photos of anyone under 18, even your own children. This is for everyone&apos;s safety.</li>
            <li><strong>Selfie Verification:</strong> We may require selfie verification to confirm you match your profile photos. Failing verification may result in limited account functionality.</li>
            <li><strong>One Account Per Person:</strong> Multiple accounts are not permitted. Duplicate accounts will be merged or removed.</li>
          </ul>

          {/* 2. Be Respectful */}
          <h2>2. Be Respectful</h2>
          <p>
            Treat every member of the Avalo community with dignity and respect.
          </p>
          <ul>
            <li><strong>No Harassment:</strong> Do not harass, bully, or intimidate other users through messages, comments, or any other feature.</li>
            <li><strong>No Hate Speech:</strong> Content or behavior that attacks, demeans, or discriminates against individuals or groups based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, disability, or any other protected characteristic is prohibited.</li>
            <li><strong>No Discrimination:</strong> All users deserve equal treatment. Discriminatory language in profiles, messages, or content is not tolerated.</li>
            <li><strong>Respect Boundaries:</strong> If someone says no or asks you to stop, respect their decision. Continued contact after someone has communicated they are not interested constitutes harassment.</li>
            <li><strong>No Unsolicited Explicit Content:</strong> Do not send unsolicited nude or sexually explicit images or messages. This includes &quot;dick pics&quot; and any sexualized content sent without prior expressed consent.</li>
            <li><strong>Constructive Interactions:</strong> Engage positively. Trolling, deliberately inflammatory behavior, and bad-faith interactions are not tolerated.</li>
          </ul>

          {/* 3. Be Safe */}
          <h2>3. Be Safe</h2>
          <p>
            Your safety is our top priority. The following are strictly prohibited:
          </p>
          <ul>
            <li><strong>No Threats:</strong> Threats of violence, harm, or death — whether direct, indirect, or implied — are prohibited and will be reported to law enforcement.</li>
            <li><strong>No Stalking:</strong> Tracking, monitoring, or following another user&apos;s activities on or off the platform without their consent is prohibited.</li>
            <li><strong>No Doxxing:</strong> Sharing another person&apos;s private information (address, phone number, workplace, etc.) without their consent is prohibited.</li>
            <li><strong>No Non-Consensual Sharing:</strong> Sharing intimate images, screenshots of private conversations, or other private content of another user without their explicit consent is a serious violation.</li>
            <li><strong>No Self-Harm Encouragement:</strong> Content that promotes or glorifies self-harm or suicide is prohibited. If you or someone you know is in crisis, please reach out to local emergency services or a crisis hotline.</li>
            <li><strong>No Dangerous Activities:</strong> Do not promote or encourage illegal, dangerous, or harmful activities.</li>
          </ul>

          {/* 4. Content Rules */}
          <h2>4. Content Rules</h2>

          <h3>4.1 Profile Photos</h3>
          <ul>
            <li>First 6 photos must show the account owner&apos;s face clearly.</li>
            <li>No stock photos, celebrity photos, memes, or photos of minors.</li>
            <li>No nudity or sexually explicit content in public profile photos.</li>
            <li>No graphic violence, gore, or disturbing imagery.</li>
            <li>No photos containing personal contact information or social media handles.</li>
          </ul>

          <h3>4.2 Public Content (Feed, Stories, Reels)</h3>
          <ul>
            <li>No nudity or sexually explicit content in public-facing areas.</li>
            <li>No graphic violence, gore, or disturbing content.</li>
            <li>No spam, excessive self-promotion, or misleading content.</li>
            <li>Content must comply with all applicable laws.</li>
          </ul>

          <h3>4.3 Private Messages (DMs)</h3>
          <ul>
            <li>Adult content is permitted between verified 18+ users who have mutually consented.</li>
            <li>Avalo does not actively monitor private messages except when content is reported.</li>
            <li>Illegal content (including CSAM) is always prohibited regardless of context.</li>
          </ul>

          <h3>4.4 Creator Content (PPV, Locked Media, Subscriptions)</h3>
          <ul>
            <li>Adult content is permitted for verified 18+ users behind paid access.</li>
            <li>All content must feature consenting adults (18+).</li>
            <li>Creators must own or have rights to all content they share.</li>
            <li>Content depicting illegal acts, non-consent, or minors is strictly prohibited.</li>
          </ul>

          {/* 5. Monetization Rules */}
          <h2>5. Monetization Rules</h2>
          <ul>
            <li><strong>No Off-Platform Payment Solicitation:</strong> Do not direct users to pay you outside of Avalo (PayPal, Venmo, Cash App, crypto, etc.). All transactions must occur through the Avalo token system.</li>
            <li><strong>No Misleading Pricing:</strong> Do not mislead users about what they will receive for their tokens. Deliver what you promise.</li>
            <li><strong>Calendar Meetings:</strong> The Calendar feature is for friendship and networking purposes. See our <a href="/legal/calendar-policy">Meeting Policy</a> for full terms. No solicitation of sexual or escort services.</li>
            <li><strong>No Scams:</strong> Any attempt to defraud or manipulate users financially is a bannable offense and may be reported to law enforcement.</li>
            <li><strong>No Token Farming:</strong> Artificially generating or inflating token balances through manipulation, collusion, or exploitation of platform features is prohibited.</li>
          </ul>

          {/* 6. AI Rules */}
          <h2>6. AI Companion Rules</h2>
          <ul>
            <li><strong>AI Is Not Human:</strong> Be aware that AI companions are artificial intelligence programs, not real people. Do not confuse or present AI interactions as human conversations to other users.</li>
            <li><strong>No Illegal Content:</strong> Do not use AI companions to generate illegal content, including but not limited to CSAM, terrorism-related content, or content that facilitates real-world harm.</li>
            <li><strong>Creator Bot Responsibility:</strong> If you create an AI bot based on your persona, you are responsible for its configuration and ensuring it complies with these guidelines.</li>
            <li><strong>No Misrepresentation:</strong> Do not use AI to impersonate real people (other than your own persona with your own AI bot) or to create deceptive content.</li>
          </ul>

          {/* 7. Enforcement */}
          <h2>7. Enforcement</h2>
          <p>
            Violations of these Community Guidelines are addressed through a progressive enforcement system:
          </p>
          <ol>
            <li><strong>Warning:</strong> For first-time minor violations, you may receive a warning explaining the violation and how to correct it.</li>
            <li><strong>Temporary Suspension:</strong> For repeated violations or more serious offenses, your account may be temporarily suspended (24 hours to 30 days depending on severity).</li>
            <li><strong>Permanent Ban:</strong> For severe or repeated violations, your account will be permanently terminated. Permanent bans include forfeiture of any remaining token balance.</li>
          </ol>
          <p>
            <strong>Immediate Permanent Ban (Zero Tolerance):</strong> The following violations result in immediate, permanent account termination without warning, and may be reported to law enforcement:
          </p>
          <ul>
            <li>Child Sexual Abuse Material (CSAM) — reported to NCMEC</li>
            <li>Credible threats of violence</li>
            <li>Solicitation of sexual services through the Calendar feature</li>
            <li>Fraud or financial manipulation</li>
            <li>Human trafficking or exploitation</li>
            <li>Non-consensual intimate imagery distribution</li>
          </ul>
          <p>
            You may appeal enforcement actions. See our <a href="/legal/terms">Terms of Service</a> for the appeals process.
          </p>

          {/* 8. Reporting */}
          <h2>8. Reporting</h2>
          <p>
            If you encounter content or behavior that violates these guidelines, please report it:
          </p>
          <ul>
            <li><strong>In-App:</strong> Use the Report button on any profile, message, or content post. Reports are reviewed by our safety team.</li>
            <li><strong>Email:</strong> <a href="mailto:safety@avalo.app">safety@avalo.app</a></li>
            <li><strong>Emergency:</strong> If you are in immediate danger, please contact local emergency services (e.g., 911 in the US, 112 in the EU) before contacting Avalo.</li>
          </ul>
          <p>
            Reports are confidential — the person you report will not be told who reported them. We take all reports seriously and review them promptly.
          </p>

          {/* Contact */}
          <h2>9. Contact</h2>
          <p>
            For questions about these Community Guidelines:
          </p>
          <p>
            <a href="mailto:safety@avalo.app">safety@avalo.app</a>
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
