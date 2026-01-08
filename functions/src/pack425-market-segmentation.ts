/**
 * PACK 425 — Market Segmentation Engine
 * Classify countries into market segments for tailored strategies
 */

import * as admin from 'firebase-admin';

export type MarketSegment = 
  | 'YOUNG_DIGITAL'          // Gen Z heavy, mobile-first
  | 'DATING_MATURE'          // Established dating app markets
  | 'CREATOR_ECONOMY_RICH'   // Strong creator/influencer culture
  | 'SAFETY_SENSITIVE'       // High focus on safety/moderation
  | 'FRAUD_INTENSIVE'        // Higher fraud risk, needs extra controls
  | 'EMERGING'               // New to dating apps
  | 'PREMIUM'                // Higher spending power
  | 'PRICE_SENSITIVE';       // Lower spending power, needs localized pricing

export interface MarketSegmentProfile {
  segment: MarketSegment;
  description: string;
  characteristics: string[];
  recommendedStrategies: string[];
}

export const MARKET_SEGMENTS: Record<MarketSegment, MarketSegmentProfile> = {
  YOUNG_DIGITAL: {
    segment: 'YOUNG_DIGITAL',
    description: 'Gen Z heavy, mobile-first markets with high social media adoption',
    characteristics: [
      'High mobile usage',
      'Social media savvy',
      'Short-form content preference',
      'Influencer culture',
      'Fast adoption of new features',
    ],
    recommendedStrategies: [
      'Enable Stories and Feed features early',
      'Focus on AI companions and gamification',
      'Aggressive push notifications',
      'TikTok-style discovery',
      'Quick onboarding flow',
    ],
  },
  DATING_MATURE: {
    segment: 'DATING_MATURE',
    description: 'Established dating app markets with existing competition',
    characteristics: [
      'Familiar with dating apps',
      'Higher expectations for features',
      'Competitive landscape',
      'Clear value proposition needed',
      'Feature parity expected',
    ],
    recommendedStrategies: [
      'Launch with full feature set',
      'Strong ASO and positioning',
      'Differentiate with AI/events',
      'Premium tier focus',
      'High quality creator pool',
    ],
  },
  CREATOR_ECONOMY_RICH: {
    segment: 'CREATOR_ECONOMY_RICH',
    description: 'Strong creator/influencer culture with monetization expectations',
    characteristics: [
      'Active creator community',
      'Monetization is expected',
      'Content creation culture',
      'High engagement rates',
      'Platform loyalty',
    ],
    recommendedStrategies: [
      'Early creator onboarding',
      'Enable monetization from day 1',
      'Creator academy and support',
      'Revenue sharing transparency',
      'Bootstrap with seed creators',
    ],
  },
  SAFETY_SENSITIVE: {
    segment: 'SAFETY_SENSITIVE',
    description: 'Markets with high focus on safety, moderation, and privacy',
    characteristics: [
      'Privacy concerns',
      'Strict content moderation expected',
      'Legal compliance critical',
      'Age verification important',
      'Reputation matters',
    ],
    recommendedStrategies: [
      'Strict content moderation',
      'Verification requirements',
      'Clear safety policies',
      'Responsive support',
      'Transparency reports',
    ],
  },
  FRAUD_INTENSIVE: {
    segment: 'FRAUD_INTENSIVE',
    description: 'Higher fraud risk requiring extra controls and validation',
    characteristics: [
      'Higher bot/scam risk',
      'Payment fraud concern',
      'Identity verification needed',
      'Trust issues',
      'Defensive launch needed',
    ],
    recommendedStrategies: [
      'Mandatory verification',
      'Enhanced fraud detection',
      'Gradual feature rollout',
      'Limited token purchases initially',
      'Strong PACK 302/352 integration',
    ],
  },
  EMERGING: {
    segment: 'EMERGING',
    description: 'New to dating apps, needs education and simple onboarding',
    characteristics: [
      'Limited dating app experience',
      'Needs education',
      'Simple features preferred',
      'Cultural adaptation needed',
      'Trust building important',
    ],
    recommendedStrategies: [
      'Simple onboarding',
      'Educational content',
      'Conservative feature set',
      'Local language priority',
      'Community building focus',
    ],
  },
  PREMIUM: {
    segment: 'PREMIUM',
    description: 'Higher spending power, focus on premium features',
    characteristics: [
      'Willingness to pay',
      'Quality expectations',
      'Premium feature demand',
      'Low price sensitivity',
      'Status-conscious',
    ],
    recommendedStrategies: [
      'Push VIP and Royal tiers',
      'Premium features highlighted',
      'Exclusive events',
      'High-quality creator pool',
      'Passport and Incognito focus',
    ],
  },
  PRICE_SENSITIVE: {
    segment: 'PRICE_SENSITIVE',
    description: 'Lower spending power, needs localized pricing and free features',
    characteristics: [
      'Price conscious',
      'Prefers free features',
      'Purchasing power adjustment needed',
      'Ad-supported models work',
      'Volume over ARPU',
    ],
    recommendedStrategies: [
      'Aggressive PPP adjustment',
      'Strong free tier',
      'Smaller token packs',
      'Local payment methods',
      'Focus on scale',
    ],
  },
};

export interface CountryMarketProfile {
  countryCode: string;
  primarySegment: MarketSegment;
  secondarySegments: MarketSegment[];
  
  // Segment-specific adjustments
  recommendedRetentionStrategy: string;
  recommendedMonetizationStrategy: string;
  recommendedGrowthStrategy: string;
  
  // Market characteristics
  competitiveDensity: 'LOW' | 'MEDIUM' | 'HIGH';
  userAcquisitionCost: 'LOW' | 'MEDIUM' | 'HIGH';
  averageRevenuePerUser: 'LOW' | 'MEDIUM' | 'HIGH';
  
  updatedAt: FirebaseFirestore.Timestamp;
  notes?: string;
}

/**
 * Get market profile for a country
 */
export async function getCountryMarketProfile(
  countryCode: string
): Promise<CountryMarketProfile | null> {
  const db = admin.firestore();
  const doc = await db.collection('countryMarketSegments').doc(countryCode).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as CountryMarketProfile;
}

/**
 * Create market profile for a country
 */
export async function createCountryMarketProfile(
  countryCode: string,
  primarySegment: MarketSegment,
  options: {
    secondarySegments?: MarketSegment[];
    competitiveDensity?: 'LOW' | 'MEDIUM' | 'HIGH';
    userAcquisitionCost?: 'LOW' | 'MEDIUM' | 'HIGH';
    averageRevenuePerUser?: 'LOW' | 'MEDIUM' | 'HIGH';
    notes?: string;
  } = {}
): Promise<CountryMarketProfile> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const segmentProfile = MARKET_SEGMENTS[primarySegment];
  
  const profile: CountryMarketProfile = {
    countryCode,
    primarySegment,
    secondarySegments: options.secondarySegments ?? [],
    
    recommendedRetentionStrategy: generateRetentionStrategy(primarySegment),
    recommendedMonetizationStrategy: generateMonetizationStrategy(primarySegment),
    recommendedGrowthStrategy: generateGrowthStrategy(primarySegment),
    
    competitiveDensity: options.competitiveDensity ?? 'MEDIUM',
    userAcquisitionCost: options.userAcquisitionCost ?? 'MEDIUM',
    averageRevenuePerUser: options.averageRevenuePerUser ?? 'MEDIUM',
    
    updatedAt: now,
    notes: options.notes,
  };
  
  await db.collection('countryMarketSegments').doc(countryCode).set(profile);
  
  return profile;
}

/**
 * Generate retention strategy based on segment
 */
function generateRetentionStrategy(segment: MarketSegment): string {
  const strategies: Record<MarketSegment, string> = {
    YOUNG_DIGITAL: 'Daily engagement via Stories, AI companions, gamification',
    DATING_MATURE: 'Quality matches, event invitations, premium features',
    CREATOR_ECONOMY_RICH: 'Creator content feed, monetization milestones, community',
    SAFETY_SENSITIVE: 'Trust signals, safety features, responsive support',
    FRAUD_INTENSIVE: 'Verified user badges, safe interaction features',
    EMERGING: 'Educational content, simple features, success stories',
    PREMIUM: 'Exclusive events, VIP perks, personalized matching',
    PRICE_SENSITIVE: 'Free features, engagement rewards, token bonuses',
  };
  
  return strategies[segment];
}

/**
 * Generate monetization strategy based on segment
 */
function generateMonetizationStrategy(segment: MarketSegment): string {
  const strategies: Record<MarketSegment, string> = {
    YOUNG_DIGITAL: 'Micro-transactions, token packs, cosmetics',
    DATING_MATURE: 'Premium subscriptions, boost features, passport',
    CREATOR_ECONOMY_RICH: 'Creator monetization, tips, exclusive content',
    SAFETY_SENSITIVE: 'Premium safety features, verification badges',
    FRAUD_INTENSIVE: 'Cautious monetization, limited initial packs',
    EMERGING: 'Small token packs, trial periods, gradual upsell',
    PREMIUM: 'High-value subscriptions, VIP/Royal tiers, events',
    PRICE_SENSITIVE: 'PPP-adjusted pricing, small packs, ad-supported',
  };
  
  return strategies[segment];
}

/**
 * Generate growth strategy based on segment
 */
function generateGrowthStrategy(segment: MarketSegment): string {
  const strategies: Record<MarketSegment, string> = {
    YOUNG_DIGITAL: 'Social media viral, influencer partnerships, TikTok',
    DATING_MATURE: 'ASO optimization, competitive positioning, PR',
    CREATOR_ECONOMY_RICH: 'Creator referrals, content marketing, ambassadors',
    SAFETY_SENSITIVE: 'Trust-focused messaging, testimonials, PR',
    FRAUD_INTENSIVE: 'Invite-only launch, referral gates, trusted onboarding',
    EMERGING: 'Education marketing, partnerships, community building',
    PREMIUM: 'Exclusive launch, selective onboarding, luxury positioning',
    PRICE_SENSITIVE: 'Free features focus, word-of-mouth, local partnerships',
  };
  
  return strategies[segment];
}

/**
 * Get all countries in a specific segment
 */
export async function getCountriesBySegment(
  segment: MarketSegment,
  includingSecondary: boolean = false
): Promise<CountryMarketProfile[]> {
  const db = admin.firestore();
  
  if (!includingSecondary) {
    const snapshot = await db.collection('countryMarketSegments')
      .where('primarySegment', '==', segment)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as CountryMarketProfile);
  } else {
    // Need to filter in memory for secondary segments
    const snapshot = await db.collection('countryMarketSegments').get();
    return snapshot.docs
      .map(doc => doc.data() as CountryMarketProfile)
      .filter(profile => 
        profile.primarySegment === segment || 
        profile.secondarySegments.includes(segment)
      );
  }
}

/**
 * Get segment distribution statistics
 */
export async function getSegmentDistribution(): Promise<{
  [segment: string]: { count: number; countries: string[] };
}> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryMarketSegments').get();
  
  const distribution: { [segment: string]: { count: number; countries: string[] } } = {};
  
  // Initialize all segments
  Object.keys(MARKET_SEGMENTS).forEach(segment => {
    distribution[segment] = { count: 0, countries: [] };
  });
  
  // Count primary segments
  for (const doc of snapshot.docs) {
    const profile = doc.data() as CountryMarketProfile;
    distribution[profile.primarySegment].count++;
    distribution[profile.primarySegment].countries.push(profile.countryCode);
  }
  
  return distribution;
}

/**
 * Get recommended pack integrations for a country based on its segments
 */
export async function getRecommendedPackIntegrations(
  countryCode: string
): Promise<{
  highPriority: string[];
  mediumPriority: string[];
  lowPriority: string[];
}> {
  const profile = await getCountryMarketProfile(countryCode);
  if (!profile) {
    return { highPriority: [], mediumPriority: [], lowPriority: [] };
  }
  
  const allSegments = [profile.primarySegment, ...profile.secondarySegments];
  const packs = { highPriority: [] as string[], mediumPriority: [] as string[], lowPriority: [] as string[] };
  
  // Map segments to pack priorities
  if (allSegments.includes('YOUNG_DIGITAL')) {
    packs.highPriority.push('PACK 301 (Retention)', 'PACK 421 (Stories)', 'PACK 141 (AI Companions)');
  }
  
  if (allSegments.includes('CREATOR_ECONOMY_RICH')) {
    packs.highPriority.push('Creator Academy', 'Monetization Engine', 'PACK 423 (Reputation)');
  }
  
  if (allSegments.includes('SAFETY_SENSITIVE')) {
    packs.highPriority.push('PACK 302/352 (Fraud)', 'PACK 159 (Safety)', 'PACK 300 (Support)');
  }
  
  if (allSegments.includes('FRAUD_INTENSIVE')) {
    packs.highPriority.push('PACK 302/352 (Fraud)', 'PACK 142 (Identity)', 'PACK 159 (Safety)');
    packs.mediumPriority.push('PACK 168 (Anti-Farming)');
  }
  
  if (allSegments.includes('PREMIUM')) {
    packs.highPriority.push('PACK 138 (VIP)', 'PACK 144 (Royal Club)', 'Events System');
  }
  
  if (allSegments.includes('PRICE_SENSITIVE')) {
    packs.highPriority.push('PACK 277 (Multi-Currency)', 'PACK 301 (Retention)');
  }
  
  // Remove duplicates
  packs.highPriority = [...new Set(packs.highPriority)];
  packs.mediumPriority = [...new Set(packs.mediumPriority)];
  packs.lowPriority = [...new Set(packs.lowPriority)];
  
  return packs;
}

/**
 * Update market profile
 */
export async function updateCountryMarketProfile(
  countryCode: string,
  updates: Partial<CountryMarketProfile>
): Promise<void> {
  const db = admin.firestore();
  await db.collection('countryMarketSegments').doc(countryCode).update({
    ...updates,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Analyze market opportunity score for a country
 */
export async function analyzeMarketOpportunity(
  countryCode: string
): Promise<{
  score: number;
  factors: { name: string; score: number; weight: number }[];
  recommendation: string;
}> {
  const profile = await getCountryMarketProfile(countryCode);
  if (!profile) {
    return {
      score: 0,
      factors: [],
      recommendation: 'No market profile found',
    };
  }
  
  const factors = [
    {
      name: 'Competitive Density',
      score: profile.competitiveDensity === 'LOW' ? 1.0 : profile.competitiveDensity === 'MEDIUM' ? 0.6 : 0.3,
      weight: 0.3,
    },
    {
      name: 'User Acquisition Cost',
      score: profile.userAcquisitionCost === 'LOW' ? 1.0 : profile.userAcquisitionCost === 'MEDIUM' ? 0.6 : 0.3,
      weight: 0.25,
    },
    {
      name: 'Average Revenue Per User',
      score: profile.averageRevenuePerUser === 'HIGH' ? 1.0 : profile.averageRevenuePerUser === 'MEDIUM' ? 0.6 : 0.3,
      weight: 0.25,
    },
    {
      name: 'Segment Fit',
      score: ['CREATOR_ECONOMY_RICH', 'PREMIUM', 'YOUNG_DIGITAL'].includes(profile.primarySegment) ? 1.0 : 0.6,
      weight: 0.2,
    },
  ];
  
  const score = factors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
  
  let recommendation = '';
  if (score > 0.75) {
    recommendation = 'HIGH PRIORITY — Strong market opportunity, aggressive launch recommended';
  } else if (score > 0.5) {
    recommendation = 'MEDIUM PRIORITY — Good opportunity, steady rollout recommended';
  } else {
    recommendation = 'LOW PRIORITY — Consider cautious or deferred launch';
  }
  
  return { score: Math.round(score * 100) / 100, factors, recommendation };
}
