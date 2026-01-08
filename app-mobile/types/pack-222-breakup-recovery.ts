/**
 * PACK 222: Breakup Recovery & Chemistry Restart Engine
 * Type definitions for mobile app
 */

import type { Timestamp } from 'firebase/firestore';

export type RecoveryPhase = 'cooldown' | 'rebuild' | 'restart' | 'completed';

export type BreakupReason = 
  | 'neutral_ending'
  | 'emotional_mismatch'
  | 'ghosted'
  | 'hard_conflict'
  | 'meeting_disappointment'
  | 'manual_end';

export interface BreakupRecoveryState {
  recoveryId: string;
  userId: string;
  partnerId: string;
  journeyId: string;
  
  needsRecovery: boolean;
  currentPhase: RecoveryPhase;
  breakupReason: BreakupReason;
  
  breakupDetectedAt: Timestamp;
  cooldownEndsAt: Timestamp;
  rebuildEndsAt: Timestamp;
  restartEndsAt: Timestamp;
  completedAt?: Timestamp;
  
  userActivityLevel: 'none' | 'low' | 'medium' | 'high';
  lastActivityAt?: Timestamp;
  
  confidenceSignals: {
    wishlistAdds: number;
    profileVisits: number;
    complimentBadges: number;
    trendingStatus: boolean;
    vibeAttention: boolean;
  };
  
  safetyCleared: boolean;
  safetyCheckRequired: boolean;
  
  readyForChemistryRestart: boolean;
  restartOfferedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConfidenceBoostCard {
  cardId: string;
  userId: string;
  recoveryId: string;
  type: 'wishlist_add' | 'profile_visit' | 'compliment' | 'trending' | 'vibe_attention';
  message: string;
  data?: Record<string, any>;
  shownAt?: Timestamp;
  dismissedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface ChemistryRestartSuggestion {
  suggestionId: string;
  userId: string;
  recoveryId: string;
  suggestedUserId: string;
  
  chemistryScore: number;
  matchReasons: string[];
  
  headline: string;
  description: string;
  
  shownAt?: Timestamp;
  interactedAt?: Timestamp;
  interaction?: 'viewed' | 'swiped_yes' | 'swiped_no' | 'ignored';
  
  createdAt: Timestamp;
}

export interface RecoveryPhaseCopy {
  title: string;
  message: string;
  buttonText?: string;
}

/**
 * Get emotional safety copy for recovery phase
 */
export function getRecoveryPhaseCopy(phase: RecoveryPhase): RecoveryPhaseCopy {
  const copy: Record<RecoveryPhase, RecoveryPhaseCopy> = {
    cooldown: {
      title: 'Take your time',
      message: 'When you\'re ready, we\'ll help you find chemistry again'
    },
    rebuild: {
      title: 'Your vibe attracts attention',
      message: 'People are noticing your profile — you\'re doing great'
    },
    restart: {
      title: 'Ready for new chemistry?',
      message: 'We found some great matches with your energy',
      buttonText: 'See Matches'
    },
    completed: {
      title: 'Welcome back',
      message: 'Good to see you again'
    }
  };
  
  return copy[phase];
}

/**
 * Get icon for confidence boost card type
 */
export function getConfidenceCardIcon(type: ConfidenceBoostCard['type']): string {
  const icons: Record<ConfidenceBoostCard['type'], string> = {
    wishlist_add: '💝',
    profile_visit: '👀',
    compliment: '⭐',
    trending: '🔥',
    vibe_attention: '✨'
  };
  
  return icons[type];
}

/**
 * Calculate recovery progress percentage
 */
export function calculateRecoveryProgress(state: BreakupRecoveryState): number {
  const now = Date.now();
  const start = state.breakupDetectedAt.toMillis();
  const end = state.restartEndsAt.toMillis();
  
  if (now >= end) return 100;
  if (now <= start) return 0;
  
  const progress = ((now - start) / (end - start)) * 100;
  return Math.min(Math.max(progress, 0), 100);
}

/**
 * Check if user should see recovery UI
 */
export function shouldShowRecoveryUI(state: BreakupRecoveryState | null): boolean {
  if (!state) return false;
  if (!state.needsRecovery) return false;
  if (state.currentPhase === 'completed') return false;
  
  return true;
}

/**
 * Get time remaining in current phase
 */
export function getPhaseTimeRemaining(state: BreakupRecoveryState): string {
  const now = Date.now();
  let endTime: number;
  
  switch (state.currentPhase) {
    case 'cooldown':
      endTime = state.cooldownEndsAt.toMillis();
      break;
    case 'rebuild':
      endTime = state.rebuildEndsAt.toMillis();
      break;
    case 'restart':
      endTime = state.restartEndsAt.toMillis();
      break;
    default:
      return '';
  }
  
  const remaining = endTime - now;
  if (remaining <= 0) return 'Ready now';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  
  return 'Soon';
}