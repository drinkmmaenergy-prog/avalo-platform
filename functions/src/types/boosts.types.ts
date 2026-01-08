/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Types and interfaces for visibility boost system
 */

export enum BoostType {
  SPOTLIGHT = 'spotlight',
  SUPER_VISIBILITY = 'super_visibility',
  TRENDING_BADGE = 'trending_badge',
  LOCATION_JUMP = 'location_jump',
  BOOST_PACK = 'boost_pack'
}

export interface BoostConfig {
  type: BoostType;
  name: string;
  description: string;
  effect: string;
  duration: number; // milliseconds
  tokenPrice: number;
  icon: string;
  benefits: string[];
}

export const BOOST_CONFIGS: Record<BoostType, BoostConfig> = {
  [BoostType.SPOTLIGHT]: {
    type: BoostType.SPOTLIGHT,
    name: 'Spotlight',
    description: 'First position in discovery',
    effect: 'priority_position',
    duration: 24 * 60 * 60 * 1000, // 24 hours
    tokenPrice: 50,
    icon: '🔦',
    benefits: [
      'Appear first in discovery feed',
      'Maximum visibility for 24 hours',
      'Stand out from the crowd'
    ]
  },
  [BoostType.SUPER_VISIBILITY]: {
    type: BoostType.SUPER_VISIBILITY,
    name: 'Super Visibility',
    description: 'x3 visibility in search + feed',
    effect: 'visibility_multiplier',
    duration: 24 * 60 * 60 * 1000, // 24 hours
    tokenPrice: 75,
    icon: '⚡',
    benefits: [
      'Triple your profile visibility',
      'Show up 3x more in search',
      'Reach more potential matches'
    ]
  },
  [BoostType.TRENDING_BADGE]: {
    type: BoostType.TRENDING_BADGE,
    name: 'Trending Badge',
    description: 'Purple "Trending Now" badge + ranking boost',
    effect: 'trending_badge',
    duration: 24 * 60 * 60 * 1000, // 24 hours
    tokenPrice: 50,
    icon: '🔥',
    benefits: [
      'Purple "Trending Now" badge',
      'Increased ranking in feeds',
      'Social proof boost'
    ]
  },
  [BoostType.LOCATION_JUMP]: {
    type: BoostType.LOCATION_JUMP,
    name: 'Location Jump',
    description: 'Temporarily visible in another nearby city / region',
    effect: 'location_override',
    duration: 72 * 60 * 60 * 1000, // 72 hours
    tokenPrice: 75,
    icon: '📍',
    benefits: [
      'Appear in another city or region',
      'Expand your reach for 72 hours',
      'Connect with people in new locations'
    ]
  },
  [BoostType.BOOST_PACK]: {
    type: BoostType.BOOST_PACK,
    name: 'Boost Pack',
    description: 'Spotlight + Super Visibility + Trending combo',
    effect: 'combo_boost',
    duration: 48 * 60 * 60 * 1000, // 48 hours
    tokenPrice: 100,
    icon: '💫',
    benefits: [
      'All boost effects combined',
      'Maximum visibility package',
      'Best value for 48 hours'
    ]
  }
};

export interface ActiveBoost {
  boostId: string;
  userId: string;
  type: BoostType;
  startTime: number;
  endTime: number;
  isActive: boolean;
  tokensPaid: number;
  
  // Location Jump specific
  targetLocation?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Performance stats
  stats: BoostStats;
}

export interface BoostStats {
  views: number;
  likes: number;
  impressions: number;
  matches: number;
  messagesSent: number;
  messagesReceived: number;
  
  // Tracking over time
  hourlyViews: Record<string, number>; // timestamp -> views
  dailyViews: Record<string, number>;
}

export interface BoostPurchaseRequest {
  userId: string;
  boostType: BoostType;
  targetLocation?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface BoostPurchaseResponse {
  success: boolean;
  boostId?: string;
  boost?: ActiveBoost;
  error?: string;
  reason?: string;
}

export interface BoostRankingModifier {
  userId: string;
  priorityScore: number; // Higher = more visible
  multiplier: number; // For super visibility
  badges: string[];
  locationOverride?: {
    latitude: number;
    longitude: number;
  };
}

// Firestore collection paths
export const BOOSTS_COLLECTION = 'boosts';
export const BOOST_STATS_COLLECTION = 'boostStats';

// Constants
export const MIN_RISK_SCORE_FOR_BOOST = 75; // Cannot boost if riskScore > 75
export const BOOST_DISABLED_MESSAGE = 'Boosts will be available again soon.';