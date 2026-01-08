/**
 * PACK 223: Destiny Weeks - Weekly Chemistry Event System
 * Type definitions for mobile app
 */

import type { Timestamp } from 'firebase/firestore';

export type WeeklyThemeSlug = 
  | 'chemistry_sparks'
  | 'flirty_vibes'
  | 'romantic_energy'
  | 'midnight_connections'
  | 'confident_generous'
  | 'passport_romance';

export type DestinyAction = 
  | 'swipe_match'
  | 'first_message'
  | 'complete_chat'
  | 'voice_call'
  | 'video_call'
  | 'meeting_verified'
  | 'join_event'
  | 'host_event';

export type RewardType =
  | 'discover_boost'
  | 'golden_glow'
  | 'chat_priority'
  | 'fate_matches'
  | 'trending_badge'
  | 'discover_highlight';

export interface WeeklyTheme {
  themeId: string;
  slug: WeeklyThemeSlug;
  name: string;
  icon: string;
  description: string;
  
  // Week timing
  startsAt: Timestamp;
  endsAt: Timestamp;
  
  // Actions and multipliers
  actions: {
    [key in DestinyAction]?: number; // Score multiplier for this action
  };
  
  // Breakup recovery integration
  softMode: boolean; // If true, this is a gentle theme suitable after breakup
  
  active: boolean;
  createdAt: Timestamp;
}

export interface UserDestinyState {
  userId: string;
  
  // Current week
  activeThemeId: string | null;
  currentWeekScore: number;
  lastWeekScore: number;
  
  // All-time stats
  totalWeeksParticipated: number;
  highestWeekScore: number;
  
  // Actions this week
  actionsThisWeek: {
    [key in DestinyAction]?: number;
  };
  
  // Active rewards
  rewards: DestinyReward[];
  
  // Breakup recovery sync
  breakRecoverySync: boolean;
  inBreakupRecovery: boolean;
  recoveryPhase?: 'cooldown' | 'rebuild' | 'restart';
  
  // Timestamps
  weekStartedAt: Timestamp;
  lastActionAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface DestinyReward {
  rewardId: string;
  type: RewardType;
  name: string;
  description: string;
  
  // Earned details
  earnedFrom: {
    themeId: string;
    weekOf: Timestamp;
    score: number;
  };
  
  // Activation
  activatedAt: Timestamp;
  expiresAt?: Timestamp; // Some rewards are temporary
  isActive: boolean;
  
  // Metadata
  metadata?: {
    boostMultiplier?: number;
    durationHours?: number;
    badgeIcon?: string;
  };
}

export interface DestinyMilestone {
  milestoneId: string;
  userId: string;
  themeId: string;
  
  scoreThreshold: number;
  reachedAt: Timestamp;
  
  reward: {
    type: RewardType;
    value: string;
    duration?: number;
  };
  
  claimed: boolean;
  claimedAt?: Timestamp;
}

export interface DestinyLeaderboard {
  weekOf: Timestamp;
  themeId: string;
  
  entries: DestinyLeaderboardEntry[];
  
  generatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface DestinyLeaderboardEntry {
  userId: string;
  score: number;
  rank: number;
  
  // Display info (cached)
  displayName?: string;
  photoURL?: string;
  badges?: string[];
}

export interface DestinyWeekRecap {
  recapId: string;
  userId: string;
  themeId: string;
  
  weekOf: Timestamp;
  finalScore: number;
  rank?: number;
  
  actions: {
    [key in DestinyAction]?: number;
  };
  
  rewardsEarned: DestinyReward[];
  
  // Next week preview
  nextThemeSlug?: WeeklyThemeSlug;
  
  viewedAt?: Timestamp;
  createdAt: Timestamp;
}

/**
 * Get theme display info
 */
export function getThemeDisplayInfo(slug: WeeklyThemeSlug): {
  name: string;
  icon: string;
  description: string;
  color: string;
} {
  const themes: Record<WeeklyThemeSlug, ReturnType<typeof getThemeDisplayInfo>> = {
    chemistry_sparks: {
      name: '🔥 Chemistry Sparks Week',
      icon: '🔥',
      description: 'Ignite connections with engaging chats and calls',
      color: '#FF6B6B'
    },
    flirty_vibes: {
      name: '💋 Flirty Vibes Week',
      icon: '💋',
      description: 'Turn up the charm and playful energy',
      color: '#FF69B4'
    },
    romantic_energy: {
      name: '💞 Romantic Energy Week',
      icon: '💞',
      description: 'Build deeper romantic connections',
      color: '#E91E63'
    },
    midnight_connections: {
      name: '🌙 Midnight Connections Week',
      icon: '🌙',
      description: 'Late-night chemistry and intimate conversations',
      color: '#9C27B0'
    },
    confident_generous: {
      name: '✨ Confident Women / Generous Men Week',
      icon: '✨',
      description: 'Celebrate confidence and generosity in dating',
      color: '#FFD700'
    },
    passport_romance: {
      name: '🗝 Passport Romance Week',
      icon: '🗝',
      description: 'Cross-border connections and cultural chemistry',
      color: '#00BCD4'
    }
  };
  
  return themes[slug];
}

/**
 * Get reward display info
 */
export function getRewardDisplayInfo(type: RewardType): {
  name: string;
  icon: string;
  description: string;
} {
  const rewards: Record<RewardType, ReturnType<typeof getRewardDisplayInfo>> = {
    discover_boost: {
      name: 'Discovery Boost',
      icon: '🚀',
      description: 'Your profile appears higher in discovery for 48h'
    },
    golden_glow: {
      name: 'Golden Glow',
      icon: '✨',
      description: 'Your profile has a premium golden frame for 48h'
    },
    chat_priority: {
      name: 'Chat Priority',
      icon: '💬',
      description: 'Your messages appear first in inboxes'
    },
    fate_matches: {
      name: 'Fate Matches',
      icon: '🎯',
      description: 'Extra high-chemistry match suggestions'
    },
    trending_badge: {
      name: 'Trending Badge',
      icon: '🔥',
      description: 'Show everyone you\'re on fire this week'
    },
    discover_highlight: {
      name: 'Discover Highlight',
      icon: '⭐',
      description: 'Featured placement in next week\'s Destiny'
    }
  };
  
  return rewards[type];
}

/**
 * Calculate progress to next milestone
 */
export function calculateMilestoneProgress(
  currentScore: number,
  milestones: number[]
): {
  current: number;
  next: number | null;
  progress: number; // 0-100
} {
  const sortedMilestones = [...milestones].sort((a, b) => a - b);
  
  let current = 0;
  let next: number | null = null;
  
  for (const milestone of sortedMilestones) {
    if (currentScore >= milestone) {
      current = milestone;
    } else {
      next = milestone;
      break;
    }
  }
  
  if (!next) {
    return { current, next: null, progress: 100 };
  }
  
  const range = next - current;
  const achieved = currentScore - current;
  const progress = Math.min(Math.max((achieved / range) * 100, 0), 100);
  
  return { current, next, progress };
}

/**
 * Check if user should see Destiny UI
 */
export function shouldShowDestinyUI(state: UserDestinyState | null): boolean {
  if (!state) return false;
  if (!state.activeThemeId) return false;
  
  // Don't show during breakup cooldown phase
  if (state.inBreakupRecovery && state.recoveryPhase === 'cooldown') {
    return false;
  }
  
  return true;
}

/**
 * Get action score value for theme
 */
export function getActionScore(
  action: DestinyAction,
  theme: WeeklyTheme
): number {
  return theme.actions[action] || 0;
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
  if (score >= 1000000) {
    return `${(score / 1000000).toFixed(1)}M`;
  }
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}K`;
  }
  return score.toString();
}

/**
 * Get time remaining in current week
 */
export function getWeekTimeRemaining(weekEndsAt: Timestamp): string {
  const now = Date.now();
  const end = weekEndsAt.toMillis();
  const remaining = end - now;
  
  if (remaining <= 0) return 'Week ended';
  
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  
  return 'Ending soon';
}