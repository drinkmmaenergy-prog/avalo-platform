import { MONETIZATION_SPLITS, SPLITS } from "../../../../config/monetizationSplits";

// Stub types for earner league

export interface CreatorLeagueEntry {
  earnerId: string;
  tier: string;
  points: number;
  rank: number;
}

export interface LeagueTier {
  name: string;
  minPoints: number;
  maxPoints: number;
  benefits: string[];
}

export type LeagueTierName = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

// Additional types needed by pack244-earner-league.ts

export interface CreatorLeague {
  earnerId: string;
  category: LeagueCategory;
  earningsScore: number;
  earningsScoreFactors: EarningsScoreFactors;
  timeEfficiencyMetrics: TimeEfficiencyMetrics;
  replyQualityMetrics: ReplyQualityMetrics;
  conversionMetrics: ConversionMetrics;
  badges: LeagueBadges | string[];
  ranking: LeagueRanking;
  privileges: LeaguePrivileges;
  safetyCheck: LeagueSafetyCheck;
  hallOfFameAchievements: HallOfFameAchievement[];
  createdAt: any;
  updatedAt: any;
  globalRank?: number;
  countryRank?: number;
  cityRank?: number;
  newCreatorRank?: number;
  [key: string]: any;
}

export interface EarningsScoreFactors {
  baseEarnings: number;
  timeEfficiencyMultiplier: number;
  replyQualityMultiplier: number;
  conversionMultiplier: number;
  finalScore: number;
}

export interface TimeEfficiencyMetrics {
  avgReplyTimeSeconds: number;
  fastReplyRate: number;
  peakHoursActivity: number;
  multiplier: number;
}

export interface ReplyQualityMetrics {
  avgMessageLength: number;
  engagementRate: number;
  repeatCustomerRate: number;
  multiplier: number;
}

export interface ConversionMetrics {
  chatToCallRate: number;
  freeToPayingRate: number;
  upsellSuccessRate: number;
  multiplier: number;
}

export type LeagueCategory =
  | 'GLOBAL'
  | 'COUNTRY'
  | 'CITY'
  | 'NEW_CREATOR'
  | 'NICHE'
  | 'global'
  | 'country'
  | 'city'
  | 'newCreator';

export interface LeagueBadges {
  currentTier?: LeagueTierName;
  previousTier?: LeagueTierName | null;
  tierHistory?: TierHistoryEntry[];
  specialBadges?: string[];
  champion?: boolean;
  top3?: boolean;
  top10?: boolean;
  top20?: boolean;
  top50?: boolean;
  top100?: boolean;
  [key: string]: any;
}

export interface TierHistoryEntry {
  tier: LeagueTierName;
  achievedAt: any;
  monthYear: string;
}

export interface LeagueRanking {
  globalRank: number;
  categoryRank: number;
  percentile: number;
  totalInCategory: number;
}

export interface LeagueRankEntry {
  earnerId?: string;
  displayName?: string;
  avatarUrl?: string;
  avatar?: string;
  earningsScore?: number;
  tier?: LeagueTierName;
  rank?: number;
  badges?: string[] | LeagueBadges;
  userId?: string;
  isNewCreator?: boolean;
  country?: string;
  city?: string;
  [key: string]: any;
}

export interface LeagueSafetyCheck {
  isEligible: boolean;
  ineligibilityReason: LeagueIneligibilityReason | null;
  lastCheckedAt: any;
  warningCount: number;
  strikeCount: number;
  [key: string]: any;
}

export type LeagueIneligibilityReason =
  | 'SAFETY_VIOLATION'
  | 'FRAUD_DETECTED'
  | 'ACCOUNT_SUSPENDED'
  | 'INSUFFICIENT_ACTIVITY'
  | 'NEW_ACCOUNT'
  | 'MANUAL_EXCLUSION'
  | 'safety_flag'
  | 'stalker_risk'
  | 'fraud_abuse'
  | 'artificial_manipulation';

export interface LeaguePrivileges {
  profileBadge?: boolean;
  prioritySupport?: boolean;
  featuredPlacement?: boolean;
  exclusiveEvents?: boolean;
  earlyAccess?: boolean;
  customPerks?: string[];
  userId?: string;
  rank?: number;
  category?: LeagueCategory;
  hasLeagueBadge?: boolean;
  hasProfileBorder?: boolean;
  inTopCreatorsStrip?: boolean;
  hasBetaAccess?: boolean;
  inSpotlight?: boolean;
  hasAnimatedCrown?: boolean;
  expiresAt?: string;
  [key: string]: any;
}

export interface HallOfFameAchievement {
  achievementId?: string;
  title?: string;
  description?: string;
  achievedAt?: any;
  monthYear?: string;
  month?: string;
  category?: LeagueCategory;
  rank?: number;
  badge?: string;
  [key: string]: any;
}





























