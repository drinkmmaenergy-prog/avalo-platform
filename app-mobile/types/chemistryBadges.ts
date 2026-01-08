/**
 * PACK 241: Unlockable Chemistry Badges
 * 
 * TypeScript type definitions for chemistry badge system
 * Cosmetic achievements that increase emotional investment
 */

export type ChemistryBadgeType = 
  | 'spark'      // 500+ paid words exchanged
  | 'flame'      // 5+ premium micro-game rounds
  | 'vibe'       // 60+ minutes of video calls
  | 'heart'      // 120+ minutes of voice calls
  | 'memory'     // 3+ Memory Log entries
  | 'gift'       // 5+ paid gifts exchanged
  | 'date'       // 1 completed booking (calendar)
  | 'adventure'  // Event attended together
  | 'trophy'     // 10+ trophies (PACK 235)
  | 'forever';   // One-year match anniversary

export interface ChemistryBadgeUnlocked {
  spark: boolean;
  flame: boolean;
  vibe: boolean;
  heart: boolean;
  memory: boolean;
  gift: boolean;
  date: boolean;
  adventure: boolean;
  trophy: boolean;
  forever: boolean;
}

export interface ChemistryBadges {
  unlocked: ChemistryBadgeUnlocked;
  total: number;
  lastUnlocked: Date | null;
  showPublic: boolean; // visibility only to each other
}

export interface BadgeUnlockEvent {
  eventId: string;
  matchId: string;
  userId: string;
  badgeType: ChemistryBadgeType;
  unlockedAt: Date;
  previousTotal: number;
  newTotal: number;
}

export interface BadgeSettings {
  showPublic: boolean;
  updatedAt: Date;
}

// Badge configuration for display
export interface ChemistryBadgeConfig {
  type: ChemistryBadgeType;
  icon: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  unlockCondition: string;
}

// Cosmetic reward tiers
export type CosmeticRewardTier = 
  | 'first_badge'    // unique chat highlight border
  | 'three_badges'   // animated message tail effect
  | 'five_badges'    // glowing profile frame (private)
  | 'eight_badges'   // animated couple intro when chat opens
  | 'ten_badges';    // exclusive mini-avatar icon visible only to each other

export interface CosmeticReward {
  tier: CosmeticRewardTier;
  badgeThreshold: number;
  name: string;
  description: string;
  enabled: boolean;
}

// Badge unlock conditions tracking
export interface BadgeUnlockConditions {
  paidWordsExchanged: number;      // For spark badge (500+)
  microGameRounds: number;         // For flame badge (5+)
  videoCallMinutes: number;        // For vibe badge (60+)
  voiceCallMinutes: number;        // For heart badge (120+)
  memoryLogEntries: number;        // For memory badge (3+)
  giftsExchanged: number;          // For gift badge (5+)
  completedBookings: number;       // For date badge (1+)
  eventsAttended: number;          // For adventure badge (1+)
  trophiesEarned: number;          // For trophy badge (10+)
  matchAgeInDays: number;          // For forever badge (365+)
}

// Badge visibility rules
export interface BadgeVisibilityState {
  visible: boolean;
  reason: 'normal' | 'sleep_mode' | 'breakup_recovery' | 'safety_flag' | 'stalker_risk' | 'user_disabled';
}

// Complete badge state for a match
export interface MatchChemistryBadgeState {
  matchId: string;
  badges: ChemistryBadges;
  conditions: BadgeUnlockConditions;
  visibility: BadgeVisibilityState;
  cosmeticRewardsUnlocked: CosmeticRewardTier[];
  lastUpdated: Date;
}

// Badge unlock check result
export interface BadgeUnlockCheckResult {
  newlyUnlocked: ChemistryBadgeType[];
  stillLocked: ChemistryBadgeType[];
  allUnlocked: boolean;
  cosmeticRewardsUnlocked: CosmeticRewardTier[];
}

// Revenue behavior tracking (for analytics)
export interface BadgeBehaviorMetrics {
  badgeType: ChemistryBadgeType;
  averagePaidWordIncrease: number;
  averageCallDurationIncrease: number;
  averageGiftIncrease: number;
  averageBookingIncrease: number;
  retentionImpact: number; // percentage increase in retention
}