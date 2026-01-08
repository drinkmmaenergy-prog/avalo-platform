/**
 * PACK 264: TOP SUPPORTERS & VIP RANKINGS
 * Spender Retention Engine - Type Definitions
 */

// Supporter Rank Tiers
export enum SupporterRank {
  NONE = 'none',
  SUPPORTER = 'supporter',
  TOP_10 = 'top_10',
  TOP_3 = 'top_3',
  TOP_1 = 'top_1',
}

// Lifetime Archive Badge Tiers
export enum LifetimeBadge {
  NONE = 'none',
  BRONZE = 'bronze',    // 10,000 tokens
  SILVER = 'silver',    // 50,000 tokens
  GOLD = 'gold',        // 100,000 tokens
  PLATINUM = 'platinum', // 250,000 tokens
  DIAMOND = 'diamond',  // 500,000+ tokens
}

// Supporter Profile
export interface SupporterProfile {
  userId: string;
  anonymousMode: boolean;
  notificationPreferences: {
    rankChanges: boolean;
    nearRankup: boolean;
    creatorLive: boolean;
    monthlyReset: boolean;
  };
  createdAt: any; // Timestamp or Date
  updatedAt: any; // Timestamp or Date
}

// Supporter Ranking Entry
export interface SupporterRanking {
  supporterId: string;
  creatorId: string;
  lifetimeTokensSpent: number;
  monthlyTokensSpent: number;
  currentRank: SupporterRank;
  previousRank: SupporterRank;
  rankPosition: number; // 1, 2, 3, etc.
  lifetimeBadge: LifetimeBadge;
  badges: {
    top1: boolean;
    top3: boolean;
    top10: boolean;
  };
  perks: SupporterPerks;
  stats: {
    totalGiftsSent: number;
    totalMessagesSpent: number;
    totalCallsSpent: number;
    totalPPVPurchased: number;
    fanClubMember: boolean;
    firstSupportDate: Date;
    lastSupportDate: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Monthly Ranking Period
export interface MonthlyRankingPeriod {
  period: string; // 'YYYY-MM'
  startDate: Date;
  endDate: Date;
  rankings: SupporterRanking[];
}

// Supporter Perks (auto-assigned based on rank)
export interface SupporterPerks {
  pinnedMessagePriority: boolean;  // TOP 1
  noSlowMode: boolean;              // TOP 1
  priorityJoinRequest: boolean;     // TOP 3
  highlightedMessages: boolean;     // TOP 10
  typingIndicator: boolean;         // TOP 10
  autoReplyPriority: boolean;       // All supporters
}

// Live Entrance Effect
export interface EntranceEffect {
  id: string;
  roomId: string;
  supporterId: string;
  creatorId: string;
  rank: SupporterRank;
  displayName: string;
  anonymousMode: boolean;
  animation: {
    type: 'large' | 'medium' | 'small';
    duration: number; // milliseconds
    sound: boolean;
  };
  message: string;
  timestamp: Date;
}

// Lifetime Archive Badge
export interface LifetimeArchiveBadge {
  userId: string;
  badge: LifetimeBadge;
  totalTokensSpent: number;
  unlockedAt: Date;
  milestones: {
    [LifetimeBadge.BRONZE]?: Date;
    [LifetimeBadge.SILVER]?: Date;
    [LifetimeBadge.GOLD]?: Date;
    [LifetimeBadge.PLATINUM]?: Date;
    [LifetimeBadge.DIAMOND]?: Date;
  };
}

// Rank Change Notification
export interface RankChangeNotification {
  id: string;
  userId: string;
  creatorId: string;
  creatorName: string;
  type: 'rank_up' | 'rank_down' | 'near_rankup' | 'creator_live' | 'reset_warning';
  oldRank: SupporterRank;
  newRank: SupporterRank;
  tokensNeeded?: number;
  message: string;
  read: boolean;
  createdAt: Date;
}

// Token Spending Event
export interface TokenSpendingEvent {
  supporterId: string;
  creatorId: string;
  amount: number;
  type: 'gift' | 'message' | 'call' | 'ppv' | 'fan_club';
  transactionId: string;
  timestamp: Date;
}

// Creator Supporter Analytics
export interface CreatorSupporterAnalytics {
  creatorId: string;
  period: string; // 'YYYY-MM'
  totalSupporters: number;
  activeSupporters: number; // spent in current month
  top1Support: number;
  top3Support: number;
  top10Support: number;
  lifetimeRevenue: number;
  monthlyRevenue: number;
  averageSpendPerSupporter: number;
  retentionRate: number;
  topSupporterIds: string[];
  updatedAt: Date;
}

// Rank Thresholds (dynamic per creator)
export interface RankThresholds {
  creatorId: string;
  top1MinTokens: number;
  top3MinTokens: number;
  top10MinTokens: number;
  updatedAt: Date;
}

// Badge Display Configuration
export interface BadgeDisplay {
  rank: SupporterRank;
  lifetimeBadge: LifetimeBadge;
  visual: {
    icon: string;
    color: string;
    glow: boolean;
    animated: boolean;
  };
  label: string;
}

// Supporter Leaderboard Entry (public view)
export interface LeaderboardEntry {
  position: number;
  displayName: string; // Username or "Anonymous"
  rank: SupporterRank;
  lifetimeBadge: LifetimeBadge;
  anonymousMode: boolean;
  badges: string[];
}

// Constants
export const LIFETIME_BADGE_THRESHOLDS = {
  [LifetimeBadge.BRONZE]: 10000,
  [LifetimeBadge.SILVER]: 50000,
  [LifetimeBadge.GOLD]: 100000,
  [LifetimeBadge.PLATINUM]: 250000,
  [LifetimeBadge.DIAMOND]: 500000,
};

export const RANK_ENTRANCE_EFFECTS = {
  [SupporterRank.TOP_1]: {
    animation: 'large',
    sound: true,
    message: '🔥 {username} — Top Supporter joined!',
    duration: 3000,
  },
  [SupporterRank.TOP_3]: {
    animation: 'medium',
    sound: true,
    message: '💎 VIP supporter joined',
    duration: 2000,
  },
  [SupporterRank.TOP_10]: {
    animation: 'small',
    sound: false,
    message: '⭐ Supporter joined',
    duration: 1000,
  },
};

export const PERK_MAPPINGS: { [key in SupporterRank]: Partial<SupporterPerks> } = {
  [SupporterRank.TOP_1]: {
    pinnedMessagePriority: true,
    noSlowMode: true,
    priorityJoinRequest: true,
    highlightedMessages: true,
    typingIndicator: true,
    autoReplyPriority: true,
  },
  [SupporterRank.TOP_3]: {
    priorityJoinRequest: true,
    highlightedMessages: true,
    typingIndicator: true,
    autoReplyPriority: true,
  },
  [SupporterRank.TOP_10]: {
    highlightedMessages: true,
    typingIndicator: true,
    autoReplyPriority: true,
  },
  [SupporterRank.SUPPORTER]: {
    autoReplyPriority: true,
  },
  [SupporterRank.NONE]: {},
};