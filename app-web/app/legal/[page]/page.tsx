import { Metadata } from 'next';
import { notFound } from 'next/navigation';

const legalPages = {
  terms: {
    title: 'Terms of Service',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  refund: {
    title: 'Refund Policy',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  safety: {
    title: 'Safety Center & Guidelines',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  content: {
    title: 'Content Policy',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  cookies: {
    title: 'Cookie Policy',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  nsfw: {
    title: 'NSFW Content Guidelines',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  payouts: {
    title: 'Creator Payout Terms',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
  ai: {
    title: 'AI Usage Policy',
    lastUpdated: '2025-11-28',
    version: '1.0.0',
  },
} as const;

type LegalPageKey = keyof typeof legalPages;

interface LegalPageProps {
  params: {
    page: string;
  };
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const pageInfo = legalPages[params.page as LegalPageKey];
  
  if (!pageInfo) {
    return {
      title: 'Page Not Found',
    };
  }

  return {
    title: `${pageInfo.title} | Avalo`,
    description: `${pageInfo.title} for Avalo platform. Last updated: ${pageInfo.lastUpdated}`,
  };
}

export async function generateStaticParams() {
  return Object.keys(legalPages).map((page) => ({
    page,
  }));
}

export default function LegalPage({ params }: LegalPageProps) {
  const pageInfo = legalPages[params.page as LegalPageKey];

  if (!pageInfo) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {pageInfo.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>Last Updated: {pageInfo.lastUpdated}</span>
            <span>•</span>
            <span>Version {pageInfo.version}</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
          <div className="prose dark:prose-invert max-w-none">
            <LegalContent page={params.page as LegalPageKey} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Questions? Contact us at{' '}
            <a
              href="mailto:legal@avalo.app"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              legal@avalo.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function LegalContent({ page }: { page: LegalPageKey }) {
  switch (page) {
    case 'terms':
      return <TermsOfService />;
    case 'privacy':
      return <PrivacyPolicy />;
    case 'refund':
      return <RefundPolicy />;
    case 'safety':
      return <SafetyGuidelines />;
    case 'content':
      return <ContentPolicy />;
    case 'cookies':
      return <CookiePolicy />;
    case 'nsfw':
      return <NSFWGuidelines />;
    case 'payouts':
      return <PayoutTerms />;
    case 'ai':
      return <AIPolicy />;
    default:
      return null;
  }
}

function TermsOfService() {
  return (
    <>
      <h2>Acceptance of Terms</h2>
      <p>
        By accessing and using Avalo (&quot;the Platform&quot;), you accept and agree to be bound by the terms and provisions of this agreement.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 18 years old to use this Platform. By using the Platform, you represent and warrant that you meet this age requirement.
      </p>

      <h2>Account Requirements</h2>
      <ul>
        <li>You must provide accurate and complete information</li>
        <li>You are responsible for maintaining account security</li>
        <li>One account per person</li>
        <li>Account sharing is prohibited</li>
      </ul>

      <h2>User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate any laws or regulations</li>
        <li>Harass, abuse, or harm others</li>
        <li>Post inappropriate or illegal content</li>
        <li>Engage in fraudulent activities</li>
        <li>Manipulate the platform or token economy</li>
      </ul>

      <h2>Termination</h2>
      <p>
        We reserve the right to suspend or terminate your account at any time for violations of these terms or for any other reason we deem appropriate.
      </p>

      <p className="text-sm text-gray-500 mt-8">
        For complete terms, please contact legal@avalo.app
      </p>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h2>Information We Collect</h2>
      <p>We collect information you provide directly to us, including:</p>
      <ul>
        <li>Account information (name, email, phone)</li>
        <li>Profile data (photos, bio, preferences)</li>
        <li>Messages and communications</li>
        <li>Payment and transaction data</li>
        <li>Location data (approximate)</li>
        <li>Usage and analytics data</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>Provide and improve our services</li>
        <li>Match you with other users</li>
        <li>Process payments and transactions</li>
        <li>Send notifications and updates</li>
        <li>Ensure safety and security</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>Data Sharing</h2>
      <p>We share your data with:</p>
      <ul>
        <li>Other users (profile information, messages)</li>
        <li>Service providers (hosting, analytics, payments)</li>
        <li>Legal authorities (when required by law)</li>
      </ul>

      <h2>Your Rights</h2>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate data</li>
        <li>Delete your account and data</li>
        <li>Export your data</li>
        <li>Opt-out of marketing communications</li>
      </ul>

      <h2>Data Security</h2>
      <p>
        We implement industry-standard security measures including encryption, secure servers, and regular security audits.
      </p>

      <h2>International Transfers</h2>
      <p>
        Your data may be transferred to and processed in countries outside your residence. We ensure appropriate safeguards are in place.
      </p>
    </>
  );
}

function RefundPolicy() {
  return (
    <>
      <h2>Token Purchases</h2>
      <p>
        Token purchases are generally non-refundable. However, we may provide refunds in the following circumstances:
      </p>
      <ul>
        <li>Technical errors that prevent token delivery</li>
        <li>Duplicate charges</li>
        <li>Unauthorized transactions (reported within 48 hours)</li>
      </ul>

      <h2>Premium Subscriptions</h2>
      <p>
        Premium subscription fees are non-refundable except:
      </p>
      <ul>
        <li>Within 14 days of initial purchase (EU customers)</li>
        <li>If service is unavailable for extended periods</li>
        <li>Billing errors</li>
      </ul>

      <h2>Refund Process</h2>
      <ol>
        <li>Contact support@avalo.app with your transaction details</li>
        <li>Provide proof of payment and issue description</li>
        <li>Allow 5-7 business days for review</li>
        <li>Approved refunds processed within 10 business days</li>
      </ol>

      <h2>Chargebacks</h2>
      <p>
        Initiating a chargeback without contacting us first may result in account suspension. Please contact support first to resolve any issues.
      </p>
    </>
  );
}

function SafetyGuidelines() {
  return (
    <>
      <h2>Our Commitment to Safety</h2>
      <p>
        Avalo is committed to providing a safe environment for all users. We have implemented multiple safety features and guidelines to protect our community.
      </p>

      <h2>Safety Features</h2>
      <ul>
        <li><strong>Selfie Verification:</strong> All users must verify their identity</li>
        <li><strong>24/7 Moderation:</strong> Human and AI content moderation</li>
        <li><strong>Panic Button:</strong> Emergency assistance during meetings</li>
        <li><strong>Reporting System:</strong> Easy reporting of concerning behavior</li>
        <li><strong>Blocking:</strong> Block unwanted users anytime</li>
        <li><strong>Privacy Controls:</strong> Control who can see your profile</li>
      </ul>

      <h2>Safety Tips</h2>
      <ul>
        <li>Never share financial information with other users</li>
        <li>Meet in public places for first meetings</li>
        <li>Tell a friend where you&apos;re going</li>
        <li>Trust your instincts</li>
        <li>Report suspicious behavior immediately</li>
        <li>Keep personal information private initially</li>
      </ul>

      <h2>Reporting Concerns</h2>
      <p>If you feel unsafe or encounter concerning behavior:</p>
      <ol>
        <li>Use the in-app report feature immediately</li>
        <li>Block the user if needed</li>
        <li>Contact emergency services if in immediate danger</li>
        <li>Email safety@avalo.app for additional support</li>
      </ol>

      <h2>What We Review</h2>
      <ul>
        <li>Harassment and threatening behavior</li>
        <li>Inappropriate content</li>
        <li>Scams and fraud</li>
        <li>Underage users</li>
        <li>Illegal activities</li>
      </ul>
    </>
  );
}

function ContentPolicy() {
  return (
    <>
      <h2>Acceptable Content</h2>
      <p>Users may post content that is:</p>
      <ul>
        <li>Respectful and appropriate</li>
        <li>Authentic and truthful</li>
        <li>Original or properly attributed</li>
        <li>Compliant with all laws</li>
      </ul>

      <h2>Prohibited Content</h2>
      <p>The following content is strictly prohibited:</p>
      <ul>
        <li>Illegal activities or content</li>
        <li>Child exploitation material</li>
        <li>Non-consensual intimate images</li>
        <li>Violence or threats</li>
        <li>Hate speech or discrimination</li>
        <li>Harassment or bullying</li>
        <li>Spam or misleading content</li>
        <li>Copyright or trademark infringement</li>
      </ul>

      <h2>NSFW Content</h2>
      <p>Adult content is allowed with restrictions:</p>
      <ul>
        <li>Must be behind consent gates</li>
        <li>Must comply with all laws</li>
        <li>Must be consensual</li>
        <li>Must respect user preferences</li>
        <li>Subject to additional moderation</li>
      </ul>

      <h2>Enforcement</h2>
      <p>Violations may result in:</p>
      <ul>
        <li>Content removal</li>
        <li>Account warnings</li>
        <li>Temporary suspension</li>
        <li>Permanent ban</li>
        <li>Legal action (serious violations)</li>
      </ul>
    </>
  );
}

function CookiePolicy() {
  return (
    <>
      <h2>What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device that help us provide and improve our services.
      </p>

      <h2>Types of Cookies We Use</h2>
      <h3>Essential Cookies</h3>
      <ul>
        <li>Authentication and security</li>
        <li>Session management</li>
        <li>Load balancing</li>
      </ul>

      <h3>Analytics Cookies</h3>
      <ul>
        <li>Usage statistics</li>
        <li>Performance monitoring</li>
        <li>Error tracking</li>
      </ul>

      <h3>Preference Cookies</h3>
      <ul>
        <li>Language preferences</li>
        <li>Theme settings</li>
        <li>User interface customization</li>
      </ul>

      <h2>Third-Party Cookies</h2>
      <p>We use cookies from:</p>
      <ul>
        <li>Google Analytics (analytics)</li>
        <li>Firebase (authentication, hosting)</li>
        <li>Stripe (payment processing)</li>
      </ul>

      <h2>Managing Cookies</h2>
      <p>You can control cookies through:</p>
      <ul>
        <li>Browser settings</li>
        <li>Our cookie consent banner</li>
        <li>Privacy settings in your account</li>
      </ul>

      <h2>Effect of Disabling Cookies</h2>
      <p>
        Disabling certain cookies may limit platform functionality. Essential cookies cannot be disabled.
      </p>
    </>
  );
}

function NSFWGuidelines() {
  return (
    <>
      <h2>NSFW Content Policy</h2>
      <p>
        Avalo allows adult content with strict guidelines to ensure user safety and consent.
      </p>

      <h2>Consent Requirements</h2>
      <ul>
        <li>Users must opt-in to view NSFW content</li>
        <li>Content must be clearly labeled</li>
        <li>Users can opt-out at any time</li>
        <li>Age verification required (18+)</li>
      </ul>

      <h2>Allowed NSFW Content</h2>
      <ul>
        <li>Consensual adult content</li>
        <li>Artistic nudity</li>
        <li>Educational content</li>
        <li>Content behind consent gates</li>
      </ul>

      <h2>Prohibited NSFW Content</h2>
      <ul>
        <li>Non-consensual intimate images</li>
        <li>Content involving minors</li>
        <li>Extreme violence or gore</li>
        <li>Illegal sexual activities</li>
        <li>Content promoting harm</li>
      </ul>

      <h2>Creator Responsibilities</h2>
      <p>If you post NSFW content, you must:</p>
      <ul>
        <li>Properly label all content</li>
        <li>Respect user preferences</li>
        <li>Comply with local laws</li>
        <li>Obtain necessary consents</li>
        <li>Follow platform guidelines</li>
      </ul>

      <h2>Reporting NSFW Violations</h2>
      <p>
        Report inappropriate NSFW content immediately. We take violations seriously and act quickly.
      </p>
    </>
  );
}

function PayoutTerms() {
  return (
    <>
      <h2>Creator Payout Program</h2>
      <p>
        Creators on Avalo can earn real money through various monetization features.
      </p>

      <h2>Eligibility</h2>
      <p>To receive payouts, you must:</p>
      <ul>
        <li>Be 18 years or older</li>
        <li>Complete KYC verification</li>
        <li>Meet minimum payout threshold ($50)</li>
        <li>Have a valid payment method</li>
        <li>Comply with all platform terms</li>
      </ul>

      <h2>Earning Methods</h2>
      <ul>
        <li>Premium content sales</li>
        <li>Subscription revenue</li>
        <li>Tips and gifts</li>
        <li>Live stream earnings</li>
        <li>AI companion revenue</li>
      </ul>

      <h2>Payout Schedule</h2>
      <ul>
        <li>Request payouts anytime after meeting threshold</li>
        <li>Processing time: 5-7 business days</li>
        <li>Payment methods: Bank transfer, PayPal, wise</li>
        <li>Currency conversion at current rates</li>
      </ul>

      <h2>Fees and Commissions</h2>
      <ul>
        <li>Platform fee: 20% of revenue</li>
        <li>Payment processing fees apply</li>
        <li>Currency conversion fees (if applicable)</li>
        <li>Transparent fee structure</li>
      </ul>

      <h2>Tax Obligations</h2>
      <p>
        Creators are responsible for reporting and paying taxes on earnings. We provide annual tax documents for qualifying creators.
      </p>

      <h2>Chargebacks and Refunds</h2>
      <p>
        Chargebacks may be deducted from your balance. Maintain quality content to minimize refund requests.
      </p>
    </>
  );
}

function AIPolicy() {
  return (
    <>
      <h2>AI Usage on Avalo</h2>
      <p>
        Avalo uses artificial intelligence to enhance user experience while maintaining transparency and ethical practices.
      </p>

      <h2>How We Use AI</h2>
      <h3>Matching Algorithm</h3>
      <ul>
        <li>Personalized recommendations</li>
        <li>Compatibility scoring</li>
        <li>Interest-based matching</li>
      </ul>

      <h3>Content Moderation</h3>
      <ul>
        <li>Automated content scanning</li>
        <li>Inappropriate content detection</li>
        <li>Spam filtering</li>
      </ul>

      <h3>AI Companions</h3>
      <ul>
        <li>Creator-trained chatbots</li>
        <li>Personalized conversations</li>
        <li>Entertainment and engagement</li>
      </ul>

      <h2>AI Transparency</h2>
      <p>We commit to:</p>
      <ul>
        <li>Clearly labeling AI-generated content</li>
        <li>Disclosing AI companion interactions</li>
        <li>Providing human review options</li>
        <li>Allowing opt-out where possible</li>
      </ul>

      <h2>User Rights Regarding AI</h2>
      <ul>
        <li>Know when interacting with AI</li>
        <li>Appeal AI moderation decisions</li>
        <li>Control AI recommendation preferences</li>
        <li>Request human review</li>
      </ul>

      <h2>AI Data Usage</h2>
      <p>
        We use your data to train and improve AI systems. You can opt-out of AI training data collection in your privacy settings.
      </p>

      <h2>Limitations and Accuracy</h2>
      <p>
        AI systems are not perfect. We continuously improve accuracy but cannot guarantee 100% precision in all cases.
      </p>
    </>
  );
}