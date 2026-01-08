
/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Configuration for onboarding flows and contextual tips
 */

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  illustrationKey?: string;
}

export interface ContextualTip {
  id: string;
  screen: string;
  title: string;
  body: string;
  once: boolean;
}

/**
 * General onboarding flow shown to all new users
 * Explains core Avalo logic without changing any economics
 */
export const GENERAL_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Avalo',
    body: 'Avalo connects adults who want to build real connections and, if they choose, earn from their time and attention.',
    illustrationKey: 'onboarding_welcome',
  },
  {
    id: 'profiles',
    title: 'Profiles & Discovery',
    body: 'Create a clear profile, choose your preferences, and appear in discovery feeds based on compatibility, safety and activity.',
    illustrationKey: 'onboarding_profiles',
  },
  {
    id: 'paid-interactions',
    title: 'Paid Interactions & Tokens',
    body: 'Some actions use tokens: unlocking content, gifts, or premium messages. Avalo keeps 35%, creators receive 65% of eligible earnings.',
    illustrationKey: 'onboarding_tokens',
  },
  {
    id: 'safety',
    title: 'Safety & Verification',
    body: 'Every user must be 18+, we use verification, risk scoring, reports and enforcement to keep interactions as safe as possible.',
    illustrationKey: 'onboarding_safety',
  },
  {
    id: 'privacy',
    title: 'Privacy & Control',
    body: 'You choose what you share. You can control visibility, manage devices, enable extra security and review your data rights.',
    illustrationKey: 'onboarding_privacy',
  },
];

/**
 * Creator monetization onboarding flow
 * Shown when user enables earning features
 */
export const CREATOR_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'creator-welcome',
    title: 'Enable Earning',
    body: 'You can earn from your time and attention through various features. Here\'s what you need to know.',
    illustrationKey: 'creator_welcome',
  },
  {
    id: 'creator-split',
    title: '65/35 Revenue Split',
    body: 'Avalo keeps 35% platform fee. You receive 65% of eligible earnings. This split is permanent and never changes.',
    illustrationKey: 'creator_split',
  },
  {
    id: 'creator-payouts',
    title: 'Payouts & KYC',
    body: 'Before requesting payouts, you must complete KYC verification. Payouts are manually reviewed and typically take 7-14 business days.',
    illustrationKey: 'creator_payouts',
  },
  {
    id: 'creator-safety',
    title: 'Trust & Safety',
    body: 'Reports and disputes help us maintain safety but never automatically refund tokens. Transactions are final.',
    illustrationKey: 'creator_safety',
  },
  {
    id: 'creator-responsibilities',
    title: 'Your Responsibilities',
    body: 'Accurately classify content (NSFW/Safe), follow regional policies, and understand that earnings are never guaranteed.',
    illustrationKey: 'creator_responsibilities',
  },
];

/**
 * Contextual tips shown within specific features
 * Displayed as non-intrusive banners or modals
 */
export const CONTEXTUAL_TIPS: ContextualTip[] = [
  {
    id: 'wallet_earnings_explainer',
    screen: 'WalletScreen',
    title: 'How Earnings Work',
    body: 'This wallet shows tokens you\'ve earned from other users. Avalo keeps 35% fee from paid interactions; you receive 65%.',
    once: true,
  },
  {
    id: 'payout_kyc_required',
    screen: 'PayoutScreen',
    title: 'Verification Required',
    body: 'Before you request payouts, we must verify your identity (KYC). This helps us comply with regulations and protect all users.',
    once: true,
  },
  {
    id: 'dispute_explainer',
    screen: 'DisputeCenter',
    title: 'Disputes Don\'t Refund Tokens',
    body: 'Reports and disputes help us improve safety. They never automatically refund tokens or reverse completed transactions.',
    once: true,
  },
  {
    id: 'creator_analytics_guide',
    screen: 'CreatorAnalyticsScreen',
    title: 'Analytics Are Descriptive',
    body: 'Analytics show past performance, not future predictions. They help you understand what works, but earnings are never guaranteed.',
    once: true,
  },
  {
    id: 'security_sessions',
    screen: 'SecurityScreen',
    title: 'Manage Your Sessions',
    body: 'You can view and revoke active sessions on all your devices. Revoke unfamiliar sessions immediately.',
    once: true,
  },
  {
    id: 'discovery_boost_info',
    screen: 'BoostScreen',
    title: 'Profile Boosts',
    body: 'Boosts increase your visibility in discovery. They use tokens but don\'t guarantee matches or earnings.',
    once: true,
  },
  {
    id: 'chat_pricing_notice',
    screen: 'ChatPricingScreen',
    title: 'Set Your Prices',
    body: 'You control your chat pricing. Higher prices may reduce volume, lower prices may increase it. Find your balance.',
    once: true,
  },
  {
    id: 'content_classification',
    screen: 'ContentUploadScreen',
    title: 'Classify Content Accurately',
    body: 'You must accurately mark content as Safe or NSFW. Misclassification can result in restrictions or suspension.',
    once: true,
  },
  {
    id: 'kyc_process',
    screen: 'KYCScreen',
    title: 'Identity Verification',
    body: 'Submit clear, valid identification documents. Review takes 3-7 business days. Incomplete submissions will be rejected.',
    once: true,
  },
  {
    id: 'privacy_controls',
    screen: 'PrivacySettingsScreen',
    title: 'Privacy Controls',
    body: 'Control who can see your profile, send you messages, and find you in discovery. Adjust based on your comfort level.',
    once: true,
  },
  // PACK 308 — Trust & Verification Education Cards
  {
    id: 'profile_trust_verification',
    screen: 'ProfileScreen',
    title: 'What does "Verified" mean?',
    body: 'It means this profile passed selfie and age checks (18+). It does NOT guarantee behavior. Always trust your instincts and use the Panic button if needed.',
    once: true,
  },
  {
    id: 'meetings_safety_verification',
    screen: 'MeetingScreen',
    title: 'Meeting Safety & Verification',
    body: 'Before/at physical meetings, both parties verify identity via QR code or selfie match. Mismatches trigger refunds. Always meet in public places and tell a trusted contact.',
    once: true,
  },
  {
    id: 'verified_badge_meaning',
    screen: 'SafetyVerificationScreen',
    title: 'Understanding Verified Badges',
    body: 'Verified badges confirm identity and age (18+) but don\'t guarantee trustworthiness or behavior. Continue to exercise caution and report concerns.',
    once: true,
  },
];