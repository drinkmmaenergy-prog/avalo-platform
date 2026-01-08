/**
 * PACK 187 — Dating Intention & Chemistry Declaration System
 * Type Definitions
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Dating intention badge options
 * These are PRIVATE flags that only affect matching algorithms
 */
export enum DatingIntentionBadge {
  ROMANTIC_VIBE = 'romantic_vibe',
  OPEN_TO_FLIRTING = 'open_to_flirting',
  SERIOUS_DATING = 'serious_dating',
  CASUAL_DATING = 'casual_dating',
  SPOIL_DYNAMIC = 'spoil_dynamic',
  VIBING = 'vibing',
}

/**
 * User's dating intention profile
 * Stored in Firestore: dating_intentions/{userId}
 */
export interface UserDatingIntention {
  userId: string;
  badges: DatingIntentionBadge[];
  preferences: DatingPreferences;
  createdAt: Timestamp;
  lastUpdated: Timestamp;
  
  // Analytics
  matchesGenerated?: number;
  conversationsStarted?: number;
  successRate?: number;
}

/**
 * User preferences for how intentions are used
 */
export interface DatingPreferences {
  // Privacy controls
  showBadgeToMatches?: boolean;        // Reveal after matching
  allowIntentionFiltering?: boolean;   // Let others filter by intentions
  
  // Matching controls
  minCompatibilityScore?: number;      // Minimum score threshold (0-100)
  onlyShowCompatibleUsers?: boolean;   // Hide incompatible users
  
  // Notification preferences
  notifyOnHighCompatibility?: boolean; // Alert on 80+ match
  notifyOnIntentionUpdate?: boolean;   // Alert when match changes intentions
}

/**
 * Compatibility calculation result
 */
export interface IntentionCompatibility {
  userId1: string;
  userId2: string;
  compatibilityScore: number;          // 0-100
  sharedIntentions: DatingIntentionBadge[];
  complementaryIntentions: DatingIntentionBadge[];
  conflictingIntentions: DatingIntentionBadge[];
  recommendationReason: string;
  calculatedAt: Timestamp;
}

/**
 * Intention analytics metrics
 */
export interface IntentionAnalytics {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  periodStart: Timestamp;
  periodEnd: Timestamp;
  
  // Engagement metrics
  viewsReceived: number;
  matchesGenerated: number;
  conversationsStarted: number;
  responseRate: number;
  
  // Badge performance
  badgePerformance: Record<DatingIntentionBadge, {
    impressions: number;
    matches: number;
    conversions: number;
  }>;
  
  // Premium feature usage
  boostsUsed?: number;
  advancedFiltersUsed?: number;
  compatibilityInsightsViewed?: number;
}

/**
 * Badge metadata for display
 */
export const BADGE_METADATA: Record<DatingIntentionBadge, {
  displayName: string;
  description: string;
  icon: string;
  color: string;
  category: 'romantic' | 'casual' | 'serious' | 'flexible';
}> = {
  [DatingIntentionBadge.ROMANTIC_VIBE]: {
    displayName: 'Looking for romantic vibe',
    description: 'Seeking romantic connection and chemistry',
    icon: '💕',
    color: '#FF6B9D',
    category: 'romantic',
  },
  [DatingIntentionBadge.OPEN_TO_FLIRTING]: {
    displayName: 'Open to flirting',
    description: 'Comfortable with flirtatious interactions',
    icon: '😊',
    color: '#FF8C42',
    category: 'casual',
  },
  [DatingIntentionBadge.SERIOUS_DATING]: {
    displayName: 'Open to serious dating',
    description: 'Interested in long-term relationship potential',
    icon: '💑',
    color: '#9B59B6',
    category: 'serious',
  },
  [DatingIntentionBadge.CASUAL_DATING]: {
    displayName: 'Open to casual dating',
    description: 'Interested in casual romantic connections',
    icon: '🎉',
    color: '#3498DB',
    category: 'casual',
  },
  [DatingIntentionBadge.SPOIL_DYNAMIC]: {
    displayName: 'Looking for someone to spoil / someone to spoil me',
    description: 'Sugar dating dynamic interest',
    icon: '💎',
    color: '#F39C12',
    category: 'serious',
  },
  [DatingIntentionBadge.VIBING]: {
    displayName: 'Vibing - let\'s see where it goes',
    description: 'Open to organic connection development',
    icon: '✨',
    color: '#1ABC9C',
    category: 'flexible',
  },
};

/**
 * Compatibility scoring weights
 * Used to calculate match scores between users
 */
export const COMPATIBILITY_WEIGHTS = {
  // Exact match: both users have the same badge
  EXACT_MATCH: 25,
  
  // Complementary: badges that work well together
  COMPLEMENTARY_MATCH: 15,
  
  // Compatible categories: similar but not identical
  CATEGORY_MATCH: 10,
  
  // Conflicting: incompatible intentions
  CONFLICT_PENALTY: -20,
};

/**
 * Badge compatibility matrix
 * Defines which badges complement or conflict with each other
 */
export const BADGE_COMPATIBILITY: Record<DatingIntentionBadge, {
  complements: DatingIntentionBadge[];
  conflicts: DatingIntentionBadge[];
}> = {
  [DatingIntentionBadge.ROMANTIC_VIBE]: {
    complements: [
      DatingIntentionBadge.SERIOUS_DATING,
      DatingIntentionBadge.OPEN_TO_FLIRTING,
      DatingIntentionBadge.VIBING,
    ],
    conflicts: [],
  },
  [DatingIntentionBadge.OPEN_TO_FLIRTING]: {
    complements: [
      DatingIntentionBadge.ROMANTIC_VIBE,
      DatingIntentionBadge.CASUAL_DATING,
      DatingIntentionBadge.VIBING,
    ],
    conflicts: [],
  },
  [DatingIntentionBadge.SERIOUS_DATING]: {
    complements: [
      DatingIntentionBadge.ROMANTIC_VIBE,
      DatingIntentionBadge.SPOIL_DYNAMIC,
    ],
    conflicts: [
      DatingIntentionBadge.CASUAL_DATING, // Potential mismatch in expectations
    ],
  },
  [DatingIntentionBadge.CASUAL_DATING]: {
    complements: [
      DatingIntentionBadge.OPEN_TO_FLIRTING,
      DatingIntentionBadge.VIBING,
    ],
    conflicts: [
      DatingIntentionBadge.SERIOUS_DATING, // Potential mismatch in expectations
    ],
  },
  [DatingIntentionBadge.SPOIL_DYNAMIC]: {
    complements: [
      DatingIntentionBadge.SERIOUS_DATING,
      DatingIntentionBadge.ROMANTIC_VIBE,
    ],
    conflicts: [],
  },
  [DatingIntentionBadge.VIBING]: {
    complements: [
      DatingIntentionBadge.ROMANTIC_VIBE,
      DatingIntentionBadge.OPEN_TO_FLIRTING,
      DatingIntentionBadge.CASUAL_DATING,
    ],
    conflicts: [],
  },
};