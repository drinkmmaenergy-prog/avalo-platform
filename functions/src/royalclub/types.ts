/**
 * PACK 144 - Royal Club & Loyalty Ecosystem 2.0
 * Type definitions for the luxury loyalty system
 * 
 * CONSTRAINTS:
 * - No token discounts or bonuses
 * - No visibility/ranking advantages
 * - No romantic/NSFW positioning
 * - No creator earning boosts
 */

export enum RoyalClubLevel {
  RC1_BRONZE = 'RC1_BRONZE',
  RC2_SILVER = 'RC2_SILVER',
  RC3_GOLD = 'RC3_GOLD',
  RC4_DIAMOND = 'RC4_DIAMOND',
  RC5_ROYAL_ELITE = 'RC5_ROYAL_ELITE'
}

export interface RoyalClubLevelConfig {
  level: RoyalClubLevel;
  title: string;
  requirements: {
    minDaysActive: number;
    minActivityScore: number;
    minClubParticipation: number;
    minEventAttendance: number;
    minMentorshipSessions: number;
  };
  benefits: {
    uiSkins: string[];
    profileThemes: string[];
    chatStickers: string[];
    lifestyleChannels: string[];
    earlyFeatureAccess: boolean;
    vipConcierge: boolean;
  };
}

export interface RoyalClubProgress {
  userId: string;
  currentLevel: RoyalClubLevel;
  joinedAt: Date;
  lastActivityAt: Date;
  
  // Progress metrics (no romantic/NSFW tracking)
  daysActive: number;
  activityScore: number;
  clubParticipation: number;
  eventAttendance: number;
  mentorshipSessions: number;
  digitalProductsPurchased: number;
  
  // Mission tracking
  completedMissions: string[];
  activeMissions: string[];
  
  // Lifetime stats
  lifetimeActivityScore: number;
  lifetimeClubPosts: number;
  lifetimeChallengesCompleted: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export enum RoyalMissionCategory {
  CLUB_PARTICIPATION = 'CLUB_PARTICIPATION',
  CHALLENGE_COMPLETION = 'CHALLENGE_COMPLETION',
  MENTORSHIP = 'MENTORSHIP',
  LEARNING = 'LEARNING',
  EVENT_ATTENDANCE = 'EVENT_ATTENDANCE',
  DIGITAL_PRODUCTS = 'DIGITAL_PRODUCTS',
  COMMUNITY_CONTRIBUTION = 'COMMUNITY_CONTRIBUTION'
}

export interface RoyalClubMission {
  missionId: string;
  category: RoyalMissionCategory;
  title: string;
  description: string;
  
  // Requirements (ethical activities only)
  requirements: {
    type: 'club_posts' | 'challenge_attendance' | 'mentorship_sessions' | 'event_participation' | 'product_purchase' | 'learning_streak';
    targetValue: number;
    timeframeHours?: number;
  };
  
  // Rewards (lifestyle perks only, no tokens/visibility)
  rewards: {
    activityScoreBonus: number;
    unlockedPerks?: string[];
  };
  
  // Safety filters
  isActive: boolean;
  expiresAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface RoyalClubReward {
  rewardId: string;
  type: 'ui_skin' | 'profile_theme' | 'chat_sticker' | 'lifestyle_channel' | 'early_feature' | 'vip_concierge';
  name: string;
  description: string;
  imageUrl?: string;
  
  // Unlock requirements
  minLevel: RoyalClubLevel;
  
  // No monetary value
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface RoyalLifestyleChannel {
  channelId: string;
  name: string;
  description: string;
  category: 'travel' | 'business' | 'wellness' | 'creative_arts' | 'fashion' | 'motorsport' | 'premium_hobbies';
  
  // Access control (no romantic/dating channels)
  minLevel: RoyalClubLevel;
  isActive: boolean;
  
  // Content guidelines
  allowedTopics: string[];
  forbiddenTopics: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface RoyalActivityLog {
  logId: string;
  userId: string;
  activityType: 'club_post' | 'challenge_join' | 'event_attend' | 'mentorship_session' | 'product_purchase' | 'mission_complete';
  activityData: Record<string, any>;
  activityScore: number;
  
  // Safety validation
  isValidated: boolean;
  validationFlags?: string[];
  
  timestamp: Date;
}

export interface RoyalClubSettings {
  userId: string;
  
  // Privacy controls
  showBadgeInProfile: boolean;
  showLevelInChats: boolean;
  
  // Notifications
  notifyMissionUpdates: boolean;
  notifyLevelUp: boolean;
  notifyNewPerks: boolean;
  
  // Active customizations
  activeUiSkin?: string;
  activeProfileTheme?: string;
  
  updatedAt: Date;
}

// Level configurations
export const ROYAL_CLUB_LEVELS: Record<RoyalClubLevel, RoyalClubLevelConfig> = {
  [RoyalClubLevel.RC1_BRONZE]: {
    level: RoyalClubLevel.RC1_BRONZE,
    title: 'Bronze',
    requirements: {
      minDaysActive: 0,
      minActivityScore: 0,
      minClubParticipation: 0,
      minEventAttendance: 0,
      minMentorshipSessions: 0
    },
    benefits: {
      uiSkins: ['bronze_basic'],
      profileThemes: ['bronze_theme'],
      chatStickers: ['bronze_pack_basic'],
      lifestyleChannels: [],
      earlyFeatureAccess: false,
      vipConcierge: false
    }
  },
  [RoyalClubLevel.RC2_SILVER]: {
    level: RoyalClubLevel.RC2_SILVER,
    title: 'Silver',
    requirements: {
      minDaysActive: 30,
      minActivityScore: 100,
      minClubParticipation: 10,
      minEventAttendance: 2,
      minMentorshipSessions: 0
    },
    benefits: {
      uiSkins: ['bronze_basic', 'silver_elegant', 'silver_modern'],
      profileThemes: ['bronze_theme', 'silver_minimal', 'silver_gradient'],
      chatStickers: ['bronze_pack_basic', 'silver_pack_premium'],
      lifestyleChannels: ['travel', 'wellness'],
      earlyFeatureAccess: false,
      vipConcierge: false
    }
  },
  [RoyalClubLevel.RC3_GOLD]: {
    level: RoyalClubLevel.RC3_GOLD,
    title: 'Gold',
    requirements: {
      minDaysActive: 90,
      minActivityScore: 500,
      minClubParticipation: 50,
      minEventAttendance: 10,
      minMentorshipSessions: 2
    },
    benefits: {
      uiSkins: ['bronze_basic', 'silver_elegant', 'silver_modern', 'gold_luxury', 'gold_premium'],
      profileThemes: ['bronze_theme', 'silver_minimal', 'silver_gradient', 'gold_elegant', 'gold_animated'],
      chatStickers: ['bronze_pack_basic', 'silver_pack_premium', 'gold_pack_exclusive'],
      lifestyleChannels: ['travel', 'wellness', 'business', 'creative_arts'],
      earlyFeatureAccess: true,
      vipConcierge: false
    }
  },
  [RoyalClubLevel.RC4_DIAMOND]: {
    level: RoyalClubLevel.RC4_DIAMOND,
    title: 'Diamond',
    requirements: {
      minDaysActive: 180,
      minActivityScore: 2000,
      minClubParticipation: 200,
      minEventAttendance: 30,
      minMentorshipSessions: 10
    },
    benefits: {
      uiSkins: ['bronze_basic', 'silver_elegant', 'silver_modern', 'gold_luxury', 'gold_premium', 'diamond_elite', 'diamond_prestige'],
      profileThemes: ['bronze_theme', 'silver_minimal', 'silver_gradient', 'gold_elegant', 'gold_animated', 'diamond_exclusive', 'diamond_luxury'],
      chatStickers: ['bronze_pack_basic', 'silver_pack_premium', 'gold_pack_exclusive', 'diamond_pack_elite'],
      lifestyleChannels: ['travel', 'wellness', 'business', 'creative_arts', 'fashion', 'motorsport'],
      earlyFeatureAccess: true,
      vipConcierge: true
    }
  },
  [RoyalClubLevel.RC5_ROYAL_ELITE]: {
    level: RoyalClubLevel.RC5_ROYAL_ELITE,
    title: 'Royal Elite',
    requirements: {
      minDaysActive: 365,
      minActivityScore: 10000,
      minClubParticipation: 500,
      minEventAttendance: 100,
      minMentorshipSessions: 30
    },
    benefits: {
      uiSkins: ['bronze_basic', 'silver_elegant', 'silver_modern', 'gold_luxury', 'gold_premium', 'diamond_elite', 'diamond_prestige', 'royal_supreme', 'royal_ultimate'],
      profileThemes: ['bronze_theme', 'silver_minimal', 'silver_gradient', 'gold_elegant', 'gold_animated', 'diamond_exclusive', 'diamond_luxury', 'royal_signature', 'royal_bespoke'],
      chatStickers: ['bronze_pack_basic', 'silver_pack_premium', 'gold_pack_exclusive', 'diamond_pack_elite', 'royal_pack_ultimate'],
      lifestyleChannels: ['travel', 'wellness', 'business', 'creative_arts', 'fashion', 'motorsport', 'premium_hobbies'],
      earlyFeatureAccess: true,
      vipConcierge: true
    }
  }
};

// Forbidden mission patterns for safety validation
export const FORBIDDEN_MISSION_PATTERNS = [
  'compliment',
  'attention',
  'attractive',
  'selfie',
  'like',
  'flirt',
  'date',
  'match',
  'swipe',
  'romantic',
  'nsfw',
  'sexy',
  'seductive',
  'admire',
  'crush',
  'love',
  'opposite gender',
  'gender specific',
  'appearance',
  'beauty',
  'hot',
  'cute'
];

// Allowed lifestyle channel categories
export const ALLOWED_CHANNEL_CATEGORIES = [
  'travel',
  'business',
  'wellness',
  'creative_arts',
  'fashion',
  'motorsport',
  'premium_hobbies'
];